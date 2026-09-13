/**
 * pt-request-appointment — patient books a visit, in slot or session mode
 * (Gate C, ADR 0088; capacity modes per ADR 0087).
 *
 * Input — common:
 *   - hospital_id        any active hospital (ADR 0086)
 *   - reason             one of the 13 Appendix A codes, or "other"
 *   - reason_note        optional patient-supplied context
 *   - idempotency_key    REQUIRED. One per wizard submission, reused across
 *                        retries; a replay returns the row the first attempt
 *                        made, with the same 200 body (Gate A §5.5).
 *   - channel            'web' | 'app' — where the booking came in
 *   and EXACTLY ONE of
 *   - slot: { clinician_user_id, department_id, starts_at, ends_at, type?,
 *             service_line_id? }   — today's path, unchanged behaviour
 *   - session: { session_id }      — a position in a published clinic day
 *
 * Common first: replay → patient exists → rate limit (5 requests per
 * rolling hour → 429) → the mode's own checks → INSERT with a booking code
 * → receipt + reminder rows → audit.
 *
 * Session path: the clinic day must be published, in the future, at this
 * hospital, on an ACTIVE line in 'session' mode that takes this reason.
 * Capacity is consumed by `allocate_session_position()` — the ADR 0087
 * allocator as a SQL function, one UPDATE with the guard in its WHERE. NULL
 * back means full: 409 carrying the line's next two open days. The booking
 * CONFIRMS at request (capacity the facility published is capacity; manual
 * approval stays a slot-mode concept). An INSERT that fails after a
 * successful allocation gives the place back (`release_session_position`).
 *
 * Slot path: `_shared/slots.ts` decides whether this is a slot the engine
 * would have offered; clinician settings decide auto_confirm vs manual;
 * `appointments_no_double_booking` is the race guard (23505 → 409).
 *
 * Receipt: one `appointment_reminders` row of kind 'receipt' scheduled for
 * now(), sent by the every-15-minute dispatcher through the one SMS transport — the
 * app shows the code immediately, so the latency is acceptable at launch.
 *
 * Boundary rules unchanged from before:
 *   - The patient acts as themselves (caller.id = patient).
 *   - ADR 0084 §8: a PATIENT may not hold a booking more than 14 days out.
 *     Enforced here and deliberately nowhere else — see the constant.
 */

import { z } from "npm:zod@4.4.3";

import { getCaller, serviceClient } from "../_shared/auth.ts";
import { preflight } from "../_shared/cors.ts";
import {
  badRequest,
  conflict,
  forbidden,
  methodNotAllowed,
  notFound,
  ok,
  serverError,
  tooManyRequests,
  unauthorized,
} from "../_shared/errors.ts";
import { makeLogger } from "../_shared/logger.ts";
import { networkContext, recordSaAudit } from "../_shared/sa-audit.ts";
import { PATIENT_REASON_CODES } from "../_shared/sessions-sql.ts";
import {
  arrivalWindow,
  bookingCode,
  checkSlot,
  DEFAULT_TIME_ZONE,
  LIVE_APPOINTMENT_STATUSES,
  resolveSchedulingSettings,
} from "../_shared/slots.ts";

const log = makeLogger("pt-request-appointment");

/**
 * ADR 0084 §8 — the patient-held booking horizon. 9.1% no-show at 0–2 weeks
 * against 38.3% at 6 months in the resident-clinic arm; 14 is the floor of
 * the measured curve, and our baseline is worse than that study's.
 *
 * A rule, not a promise: the patient surface advertises real availability
 * ("Choose from the days the clinic has open"), never "the next 2 weeks".
 * Applies to both modes — a session is a day the patient holds too.
 */
const PATIENT_BOOKING_HORIZON_DAYS = 14;

/** ADR 0088: booking requests per patient per rolling hour before a 429. */
const RATE_LIMIT_PER_HOUR = 5;

/** Retries on `appointments_hospital_booking_code_unique` before giving up. */
const BOOKING_CODE_ATTEMPTS = 5;

const SlotSchema = z.object({
  clinician_user_id: z.string().uuid(),
  department_id: z.string().uuid(),
  starts_at: z.string().datetime({ offset: true }),
  ends_at: z.string().datetime({ offset: true }),
  type: z.enum(["in_person", "virtual"]).default("in_person"),
  /** When the wizard chose a line, its reason list is enforced. The phone's slot path sends none. */
  service_line_id: z.string().uuid().optional(),
});

const SessionSchema = z.object({
  session_id: z.string().uuid(),
});

const InputSchema = z
  .object({
    hospital_id: z.string().uuid(),
    /**
     * Appendix A's 13 plus 'other'. `urgent_review` is system-only (ADR 0084
     * §12 / 0053's CHECK is the backstop); this enum is the message.
     */
    reason: z.enum([...PATIENT_REASON_CODES, "other"]),
    reason_note: z.string().max(500).nullable().optional(),
    /**
     * A uuid from `crypto.randomUUID()` is what both clients send; any opaque
     * 16–128 char string is accepted so a client with no uuid source still
     * gets replay safety. It is only ever compared for equality.
     */
    idempotency_key: z.string().min(16).max(128),
    channel: z.enum(["web", "app"]),
    slot: SlotSchema.optional(),
    session: SessionSchema.optional(),
  })
  .refine((i) => (i.slot ? 1 : 0) + (i.session ? 1 : 0) === 1, {
    message: "Send exactly one of `slot` or `session`.",
  });

/** The columns every 200 body carries, on a fresh insert or a replay. */
const RETURNING =
  "id, status, booking_code, position_number, arrival_window_start, arrival_window_end";

interface BookedRow {
  id: string;
  status: string;
  booking_code: string | null;
  position_number: number | null;
  arrival_window_start: string | null;
  arrival_window_end: string | null;
}

const toResponse = (row: BookedRow) => ({
  appointment_id: row.id,
  status: row.status,
  booking_code: row.booking_code ?? null,
  position_number: row.position_number ?? null,
  arrival_window_start: row.arrival_window_start ?? null,
  arrival_window_end: row.arrival_window_end ?? null,
});

/** A `[0, 1)` source backed by the platform CSPRNG, for `bookingCode`. */
const cryptoRandom = () => (crypto.getRandomValues(new Uint32Array(1))[0] as number) / 2 ** 32;

const violates = (error: { code?: string; message?: string } | null, index: string) =>
  error?.code === "23505" && !!error.message?.includes(index);

Deno.serve(async (request: Request) => {
  const origin = request.headers.get("origin");
  const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();
  const init = { origin, requestId };

  const pre = preflight(request);
  if (pre) return pre;
  if (request.method !== "POST") return methodNotAllowed(init);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return badRequest("Body must be JSON", init);
  }
  const parsed = InputSchema.safeParse(body);
  if (!parsed.success) return badRequest("Invalid input", init, parsed.error.flatten());
  const input = parsed.data;

  const horizonMs = Date.now() + PATIENT_BOOKING_HORIZON_DAYS * 86_400_000;
  const beyondHorizon = () =>
    badRequest(
      `You can ask for a day up to ${PATIENT_BOOKING_HORIZON_DAYS} days from now. ` +
        "Choose from the days the clinic has open.",
      init,
    );

  if (input.slot) {
    if (new Date(input.slot.ends_at) <= new Date(input.slot.starts_at)) {
      return badRequest("ends_at must be > starts_at.", init);
    }
    // Checked before any read: an out-of-range request should cost nothing,
    // and it cannot become in-range further down.
    if (new Date(input.slot.starts_at).getTime() > horizonMs) return beyondHorizon();
  }

  const caller = await getCaller(request);
  if (!caller) return unauthorized(init);

  const sb = serviceClient();

  // 0. Replay? The same submission, retried, must answer with the booking
  //    it already made — before the rate limit counts it and before the
  //    slot engine sees that booking as "taken".
  const replay = async (): Promise<BookedRow | null> =>
    (
      await sb
        .from("appointments")
        .select(RETURNING)
        .eq("patient_user_id", caller.id)
        .eq("idempotency_key", input.idempotency_key)
        .maybeSingle()
    ).data ?? null;
  const prior = await replay();
  if (prior) return ok(toResponse(prior), init);

  // 1. Confirm the patient owns this booking (caller.id = patient).
  const { data: patient, error: patientError } = await sb
    .from("patient_profiles")
    .select("id")
    .eq("id", caller.id)
    .maybeSingle();
  if (patientError) return serverError(patientError.message, init);
  if (!patient) {
    return forbidden(init, "only patients can request appointments through this surface");
  }

  // 2. Rate limit: requests this patient MADE in the last hour, whatever
  //    became of them. Counted after the replay so a retry never trips it.
  const { count: recent, error: rateError } = await sb
    .from("appointments")
    .select("id", { count: "exact", head: true })
    .eq("patient_user_id", caller.id)
    .gt("created_at", new Date(Date.now() - 3_600_000).toISOString());
  if (rateError) return serverError(rateError.message, init);
  if ((recent ?? 0) >= RATE_LIMIT_PER_HOUR) {
    return tooManyRequests(
      "You've asked for several visits in the last hour. Try again later.",
      init,
    );
  }

  // 3. The mode decides what goes in the row and who may confirm it.
  //    `release` is the compensating step for a session allocation that an
  //    INSERT then failed to use.
  let row: Record<string, unknown>;
  let departmentId: string;
  let startsAtIso: string;
  let release: (() => Promise<void>) | null = null;

  if (input.session) {
    // ── Session path ──────────────────────────────────────────────
    const { data: session, error: sessionError } = await sb
      .from("clinic_sessions")
      .select(
        "id, hospital_id, department_id, service_line_id, clinician_user_id, starts_at, ends_at, " +
          "capacity_booked, overbooking_factor, " +
          "service_lines!inner(active, capacity_mode, reason_codes), hospitals!inner(state)",
      )
      .eq("id", input.session.session_id)
      .eq("hospital_id", input.hospital_id)
      .eq("status", "published")
      .gt("starts_at", new Date().toISOString())
      .eq("service_lines.active", true)
      .eq("service_lines.capacity_mode", "session")
      // ADR 0086: a suspended hospital's published days are not bookable.
      .eq("hospitals.state", "active")
      .maybeSingle();
    if (sessionError) return serverError(sessionError.message, init);
    if (!session) {
      return notFound(init, "That clinic day is not open for booking — refresh and pick again.");
    }
    if (new Date(session.starts_at).getTime() > horizonMs) return beyondHorizon();

    const line = session.service_lines as { reason_codes: string[] };
    if (!line.reason_codes.includes(input.reason)) {
      return badRequest("That clinic does not take this reason.", init);
    }
    // appointments.clinician_user_id is NOT NULL; a clinic day with no
    // clinician yet (the console's T-12h rule) cannot hold a booking.
    if (!session.clinician_user_id) {
      return conflict("This clinic day has no clinician assigned yet.", init);
    }

    // The allocator: one UPDATE, guard in the WHERE, NULL when full.
    const { data: position, error: allocError } = await sb.rpc("allocate_session_position", {
      p_session: session.id,
    });
    if (allocError) return serverError(allocError.message, init);
    if (position == null) {
      const { data: next } = await sb.rpc("next_sessions_of_line", {
        p_line: session.service_line_id,
        p_after: new Date().toISOString(),
      });
      return conflict("This clinic day is full — here are the next two.", init, {
        next_sessions: next ?? [],
      });
    }
    release = async () => {
      const { error } = await sb.rpc("release_session_position", { p_session: session.id });
      if (error) {
        log.error("compensating release failed — a place is leaked", {
          requestId,
          session_id: session.id,
          reason: error.message,
        });
      }
    };

    const window = arrivalWindow({
      sessionStartsAt: session.starts_at,
      sessionEndsAt: session.ends_at,
      capacityBooked: session.capacity_booked,
      overbookingFactor: Number(session.overbooking_factor),
      position,
    });

    departmentId = session.department_id;
    startsAtIso = session.starts_at;
    row = {
      hospital_id: input.hospital_id,
      department_id: session.department_id,
      patient_user_id: caller.id,
      clinician_user_id: session.clinician_user_id,
      starts_at: session.starts_at,
      ends_at: session.ends_at,
      reason: input.reason,
      reason_note: input.reason_note ?? null,
      origin: "patient",
      status: "confirmed",
      priority: "routine",
      type: "in_person",
      created_by_user_id: caller.id,
      session_id: session.id,
      position_number: position,
      arrival_window_start: window.start.toISOString(),
      arrival_window_end: window.end.toISOString(),
      channel: input.channel,
      idempotency_key: input.idempotency_key,
    };
  } else {
    // ── Slot path ─────────────────────────────────────────────────
    const slot = input.slot as z.infer<typeof SlotSchema>;

    // The clinician's active affiliation at (hospital, department) is the
    // whole boundary since ADR 0086: a CLINICAL cadre at an ACTIVE hospital.
    const { data: aff, error: affError } = await sb
      .from("staff_affiliations")
      .select("id, state, hospitals!inner(state), cadres!inner(is_clinical)")
      .eq("user_id", slot.clinician_user_id)
      .eq("hospital_id", input.hospital_id)
      .eq("department_id", slot.department_id)
      .in("state", ["active", "approved"])
      .eq("hospitals.state", "active")
      .eq("cadres.is_clinical", true)
      .limit(1)
      .maybeSingle();
    if (affError) return serverError(affError.message, init);
    if (!aff) {
      return notFound(init, "clinician isn't active at this department — refresh and pick again");
    }

    // A line, when the wizard named one, restricts the reason. The phone's
    // slot path names none and is accepted as before.
    if (slot.service_line_id) {
      const { data: line, error: lineError } = await sb
        .from("service_lines")
        .select("reason_codes")
        .eq("id", slot.service_line_id)
        .eq("hospital_id", input.hospital_id)
        .eq("department_id", slot.department_id)
        .eq("active", true)
        .maybeSingle();
      if (lineError) return serverError(lineError.message, init);
      if (!line) return notFound(init, "That clinic is not open for booking.");
      if (!(line.reason_codes as string[]).includes(input.reason)) {
        return badRequest("That clinic does not take this reason.", init);
      }
    }

    // Is this a slot the engine would have offered? Four reads, then one
    // `checkSlot` — the same arithmetic the read surfaces offer slots with.
    const [blocksRes, apptsRes, { data: settings }, { data: deptPolicy }] = await Promise.all([
      sb
        .from("availability_blocks")
        // No kind/state filter: "bookable" is the engine's definition, and it
        // also needs every overlapping window to suppress a double offer.
        // Aliased to the camelCase the engine reads.
        .select(
          "kind, state, startsAt:starts_at, endsAt:ends_at, recurrence, " +
            "recurrenceWeekday:recurrence_weekday, recurrenceUntil:recurrence_until",
        )
        .eq("clinician_user_id", slot.clinician_user_id)
        .eq("hospital_id", input.hospital_id)
        .or(`department_id.eq.${slot.department_id},department_id.is.null`)
        .lt("starts_at", slot.ends_at)
        .or(`ends_at.gt.${slot.starts_at},recurrence.eq.weekly`),
      sb
        .from("appointments")
        // Not scoped to the hospital: a clinician booked at their other
        // hospital is still one person.
        .select("startsAt:starts_at, endsAt:ends_at")
        .eq("clinician_user_id", slot.clinician_user_id)
        .in("status", [...LIVE_APPOINTMENT_STATUSES])
        .lt("starts_at", slot.ends_at)
        .gt("ends_at", slot.starts_at),
      sb
        .from("clinician_scheduling_settings")
        .select("default_slot_minutes, buffer_minutes, auto_confirm, allow_virtual")
        .eq("clinician_user_id", slot.clinician_user_id)
        .eq("hospital_id", input.hospital_id)
        .maybeSingle(),
      sb
        .from("department_scheduling_policy")
        .select(
          "default_slot_minutes, default_buffer_minutes, default_auto_confirm, allow_virtual, " +
            "bookable_weekdays, bookable_start_minutes_local, bookable_end_minutes_local",
        )
        .eq("department_id", slot.department_id)
        .maybeSingle(),
    ]);
    // Fail closed: an unread block list rejects a legitimate booking, and an
    // unread appointment list accepts one on top of an existing patient.
    if (blocksRes.error) return serverError(blocksRes.error.message, init);
    if (apptsRes.error) return serverError(apptsRes.error.message, init);

    const clinicianSettings = settings && {
      defaultSlotMinutes: settings.default_slot_minutes,
      bufferMinutes: settings.buffer_minutes,
      autoConfirm: settings.auto_confirm,
      allowVirtual: settings.allow_virtual,
    };
    const departmentPolicy = deptPolicy && {
      defaultSlotMinutes: deptPolicy.default_slot_minutes,
      defaultBufferMinutes: deptPolicy.default_buffer_minutes,
      defaultAutoConfirm: deptPolicy.default_auto_confirm,
      allowVirtual: deptPolicy.allow_virtual,
      bookableWeekdays: deptPolicy.bookable_weekdays,
      bookableStartMinutesLocal: deptPolicy.bookable_start_minutes_local,
      bookableEndMinutesLocal: deptPolicy.bookable_end_minutes_local,
    };

    const notOfferable = checkSlot({
      blocks: blocksRes.data ?? [],
      appointments: apptsRes.data ?? [],
      clinicianSettings,
      departmentPolicy,
      timeZone: DEFAULT_TIME_ZONE,
      now: new Date(),
      startsAt: new Date(slot.starts_at),
      endsAt: new Date(slot.ends_at),
    });
    if (notOfferable) return badRequest(notOfferable, init);

    // Virtual is refused unless something GRANTS it — ADR 0029 §2's chain.
    if (
      slot.type === "virtual" &&
      !resolveSchedulingSettings(clinicianSettings, departmentPolicy).allowVirtual
    ) {
      return badRequest("This clinician doesn't accept virtual appointments.", init);
    }

    // The clinician's own row alone, NOT the resolved chain — reading the
    // department's default here would start auto-confirming at clinicians
    // who never configured it, a product decision ADR 0084 does not make.
    departmentId = slot.department_id;
    startsAtIso = slot.starts_at;
    row = {
      hospital_id: input.hospital_id,
      department_id: slot.department_id,
      patient_user_id: caller.id,
      clinician_user_id: slot.clinician_user_id,
      starts_at: slot.starts_at,
      ends_at: slot.ends_at,
      reason: input.reason,
      reason_note: input.reason_note ?? null,
      origin: "patient",
      status: settings?.auto_confirm ? "confirmed" : "pending_approval",
      priority: "routine",
      type: slot.type,
      created_by_user_id: caller.id,
      channel: input.channel,
      idempotency_key: input.idempotency_key,
    };
  }

  // 4. INSERT, with a fresh booking code per attempt. Uniqueness per
  //    hospital is the index's job; a collision at 32^6 is rare enough that
  //    five tries is generous.
  let inserted: BookedRow | null = null;
  let insertError: { code?: string; message?: string } | null = null;
  for (let attempt = 0; attempt < BOOKING_CODE_ATTEMPTS && !inserted; attempt++) {
    const res = await sb
      .from("appointments")
      .insert({ ...row, booking_code: bookingCode(cryptoRandom) })
      .select(RETURNING)
      .single();
    insertError = res.error;
    if (res.data) inserted = res.data as BookedRow;
    else if (!violates(res.error, "appointments_hospital_booking_code_unique")) break;
  }
  if (!inserted) {
    if (release) await release();
    if (violates(insertError, "appointments_no_double_booking")) {
      return conflict("Someone just took this slot — pick another and try again.", init);
    }
    if (violates(insertError, "appointments_idempotency_unique")) {
      // Two retries of one submission raced past step 0; the other one won.
      const winner = await replay();
      if (winner) return ok(toResponse(winner), init);
    }
    log.error("appointment insert failed", { requestId, reason: insertError?.message });
    return serverError("could not create appointment", init);
  }
  const created: BookedRow = inserted;

  // 5. The receipt: kind 'receipt', due now, drained by the every-15-minute dispatcher.
  //    Its own statement so a database that predates migration 0059 loses
  //    only the receipt, never the reminders. Best-effort, like reminders.
  const { error: receiptError } = await sb.from("appointment_reminders").insert({
    appointment_id: created.id,
    channel: "sms",
    kind: "receipt",
    scheduled_at: new Date().toISOString(),
  });
  if (receiptError) {
    log.warn("receipt queue failed (continuing)", { requestId, reason: receiptError.message });
  }

  // 6. Reminders from the department policy's leads, default [1440, 60].
  const { data: leadPolicy } = await sb
    .from("department_scheduling_policy")
    .select("reminder_lead_minutes")
    .eq("department_id", departmentId)
    .maybeSingle();
  const reminderLeads: number[] = leadPolicy?.reminder_lead_minutes ?? [1440, 60];
  const startsMs = new Date(startsAtIso).getTime();
  const reminderRows = reminderLeads
    .filter((mins) => mins > 0)
    .map((mins) => ({
      appointment_id: created.id,
      // SMS is the only channel with a transport (lib/notifications/sink.ts).
      channel: "sms" as const,
      scheduled_at: new Date(startsMs - mins * 60_000).toISOString(),
    }))
    // Drop leads that already elapsed: a 1440-minute lead on a booking made
    // this morning is born outside the dispatcher's stale grace.
    .filter((r) => new Date(r.scheduled_at).getTime() > Date.now());
  if (reminderRows.length > 0) {
    const { error: remError } = await sb.from("appointment_reminders").insert(reminderRows);
    if (remError) {
      log.warn("reminder queue failed (continuing)", { requestId, reason: remError.message });
    }
  }

  // 7. Audit.
  const { ipAddress, userAgent } = networkContext(request);
  try {
    await recordSaAudit({
      actorId: caller.id,
      action: "book_appointment",
      targetKind: "appointment",
      targetId: created.id,
      reason: input.reason_note?.trim()
        ? `Patient self-booked: ${input.reason_note.slice(0, 200)}`
        : `Patient self-booked (${input.reason}).`,
      requestId,
      ipAddress,
      userAgent,
      beforeData: null,
      afterData: {
        clinician_user_id: row.clinician_user_id,
        hospital_id: input.hospital_id,
        starts_at: startsAtIso,
        status: created.status,
        type: row.type,
        channel: input.channel,
        session_id: (row.session_id as string | undefined) ?? null,
        position_number: created.position_number,
        booking_code: created.booking_code,
      },
    });
  } catch (e) {
    log.warn("sa_audit failed (booking already created)", {
      requestId,
      appointment_id: created.id,
      reason: String(e),
    });
  }

  log.info("appointment created", {
    requestId,
    appointment_id: created.id,
    status: created.status,
    mode: input.session ? "session" : "slot",
  });
  return ok(toResponse(created), init);
});
