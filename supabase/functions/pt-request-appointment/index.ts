/**
 * pt-request-appointment — patient submits a booking request.
 *
 * Inputs:
 *   - clinician_user_id  the clinician the patient is booking
 *   - hospital_id        any active hospital (ADR 0086)
 *   - department_id      must belong to that hospital + clinician must
 *                        have an active affiliation there
 *   - reason             from APPOINTMENT_REASONS
 *   - reason_note        optional patient-supplied context
 *   - starts_at / ends_at ISO timestamps for the chosen slot
 *   - type               in_person | virtual (virtual only if clinician
 *                        + dept allow it)
 *
 * Flow:
 *   1. Ask `_shared/slots.ts` whether this is a slot it would have
 *      offered — grid, buffer, weekly recurrence, department opening
 *      hours, already-taken time. Then refuse an exact duplicate.
 *   2. Read the clinician's settings to decide auto_confirm vs manual.
 *   3. INSERT appointments with the correct initial status:
 *        - clinician.auto_confirm = true  → 'confirmed'
 *        - otherwise                        → 'pending_approval'
 *   4. Insert reminder rows from notify_lead_minutes (defaults from
 *      the department policy).
 *   5. Audit + return.
 *
 * Boundary rules:
 *   - The patient must be acting as themselves (caller.id = patient).
 *     Booking-on-behalf is a SEPARATE Edge Function in GATE D.
 *   - hospital_id may be ANY active hospital (ADR 0086 superseded the
 *     primary-facility restriction of PRD §1.5 for self-booking).
 *   - We refuse to create a duplicate live booking at the same
 *     (clinician, starts_at) — the partial UNIQUE index would catch
 *     it anyway, but we surface a clean 409 with a sane message.
 *   - ADR 0084 §8: a PATIENT may not hold a booking more than 14 days
 *     out. Enforced here and deliberately nowhere else — not as a CHECK
 *     on `appointments`, not in `_shared/slots.ts`, not in
 *     `lib/scheduling/`. The no-show gradient the cap is derived from
 *     measures patient-held lead time; a schema constraint or a
 *     shared-engine guard would also block clinician-created and
 *     system-created recall (`system-propose-urgent-appointment` inserts
 *     into `appointments` directly, and an NCD review is exactly such a
 *     row). Confined to this function, the cap creates no dead end for
 *     recall at all.
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
  unauthorized,
} from "../_shared/errors.ts";
import { makeLogger } from "../_shared/logger.ts";
import { networkContext, recordSaAudit } from "../_shared/sa-audit.ts";
import {
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
 */
const PATIENT_BOOKING_HORIZON_DAYS = 14;

const InputSchema = z.object({
  clinician_user_id: z.string().uuid(),
  hospital_id: z.string().uuid(),
  department_id: z.string().uuid(),
  /**
   * ADR 0084 §12 / migration 0053 — `urgent_review` is not patient-selectable.
   * `appointments_patient_reason_check` is the backstop; this enum is the
   * message, so a refusal reads as a sentence at the boundary rather than as a
   * Postgres violation surfaced verbatim from the bottom of the stack.
   */
  reason: z.enum(["follow_up", "new_concern", "refill", "routine", "other"]),
  reason_note: z.string().max(500).nullable().optional(),
  starts_at: z.string().datetime({ offset: true }),
  ends_at: z.string().datetime({ offset: true }),
  type: z.enum(["in_person", "virtual"]).default("in_person"),
});

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

  if (new Date(input.ends_at) <= new Date(input.starts_at)) {
    return badRequest("ends_at must be > starts_at.", init);
  }

  // The horizon is checked before any read: an out-of-range request should
  // cost nothing, and it cannot become in-range further down.
  if (
    new Date(input.starts_at).getTime() >
    Date.now() + PATIENT_BOOKING_HORIZON_DAYS * 86_400_000
  ) {
    return badRequest(
      `You can ask for a day up to ${PATIENT_BOOKING_HORIZON_DAYS} days from now. ` +
        "Choose from the days the clinic has open.",
      init,
    );
  }

  const caller = await getCaller(request);
  if (!caller) return unauthorized(init);

  const sb = serviceClient();

  // 1. Confirm the patient owns this booking (caller.id = patient,
  //    patient.state='active').
  const { data: patient, error: patientError } = await sb
    .from("patient_profiles")
    .select("id")
    .eq("id", caller.id)
    .maybeSingle();
  if (patientError) return serverError(patientError.message, init);
  if (!patient)
    return forbidden(init, "only patients can request appointments through this surface");
  // ADR 0086: the hospital is no longer a boundary. The clinician's active
  // affiliation at (hospital, department), checked next, is what makes the
  // booking real; the patient's primary facility is where they usually go,
  // not the only place they may.

  // 2. Confirm the clinician has an active affiliation at this
  //    (hospital, department).
  //    Since ADR 0086 this is the whole boundary, so it asks everything the
  //    read path asks: a CLINICAL cadre (a receptionist with a bookable
  //    block is not a doctor) at an ACTIVE hospital (a suspended tenant's
  //    roster is not bookable). A stale or crafted POST for either gets the
  //    same "refresh and pick again" the list would never have offered.
  const { data: aff, error: affError } = await sb
    .from("staff_affiliations")
    .select("id, state, hospitals!inner(state), cadres!inner(is_clinical)")
    .eq("user_id", input.clinician_user_id)
    .eq("hospital_id", input.hospital_id)
    .eq("department_id", input.department_id)
    .in("state", ["active", "approved"])
    .eq("hospitals.state", "active")
    .eq("cadres.is_clinical", true)
    .limit(1)
    .maybeSingle();
  if (affError) return serverError(affError.message, init);
  if (!aff) {
    return notFound(init, "clinician isn't active at this department — refresh and pick again");
  }

  // 3. Confirm this is a slot the engine would have offered. Four reads,
  //    then one `checkSlot` — the same arithmetic the read surfaces offer
  //    slots with, so the write path cannot accept a time nothing offered.
  //    (What it replaces: "is the slot contained by some bookable block",
  //    which took any off-grid start, ignored the buffer and the
  //    department's opening hours, and — expanding no recurrence —
  //    rejected every booking against a weekly block.)
  //
  //    The settings and policy rows are the same ones steps 5 and 6 need,
  //    fetched once.
  const [blocksRes, apptsRes, { data: settings }, { data: deptPolicy }] = await Promise.all([
    sb
      .from("availability_blocks")
      // No kind/state filter: "bookable" is the engine's definition, and it
      // also needs every overlapping window to suppress a double offer.
      // Aliased to the camelCase the engine reads — an unmapped row is
      // `undefined` there, which it throws on rather than deriving nothing.
      .select(
        "kind, state, startsAt:starts_at, endsAt:ends_at, recurrence, " +
          "recurrenceWeekday:recurrence_weekday, recurrenceUntil:recurrence_until",
      )
      .eq("clinician_user_id", input.clinician_user_id)
      .eq("hospital_id", input.hospital_id)
      // Blocks declared for another department would be judged against this
      // department's opening hours; a null department_id is hospital-wide.
      .or(`department_id.eq.${input.department_id},department_id.is.null`)
      // Widest bound that cannot drop a candidate: a one-off block has to
      // overlap the slot, a weekly template only has to have begun. Expired
      // series cost a row each and the engine drops them for free.
      .lt("starts_at", input.ends_at)
      .or(`ends_at.gt.${input.starts_at},recurrence.eq.weekly`),
    sb
      .from("appointments")
      // Not scoped to the hospital, like the duplicate check below: a
      // clinician booked at their other hospital is still one person.
      .select("startsAt:starts_at, endsAt:ends_at")
      .eq("clinician_user_id", input.clinician_user_id)
      .in("status", [...LIVE_APPOINTMENT_STATUSES])
      .lt("starts_at", input.ends_at)
      .gt("ends_at", input.starts_at),
    sb
      .from("clinician_scheduling_settings")
      // All four columns: the engine needs the grid, step 5 needs the rest.
      .select("default_slot_minutes, buffer_minutes, auto_confirm, allow_virtual")
      .eq("clinician_user_id", input.clinician_user_id)
      .eq("hospital_id", input.hospital_id)
      .maybeSingle(),
    sb
      .from("department_scheduling_policy")
      .select(
        "default_slot_minutes, default_buffer_minutes, default_auto_confirm, allow_virtual, " +
          "bookable_weekdays, bookable_start_minutes_local, bookable_end_minutes_local, " +
          "reminder_lead_minutes",
      )
      .eq("department_id", input.department_id)
      .maybeSingle(),
  ]);
  // Fail closed: an unread block list rejects a legitimate booking, and an
  // unread appointment list accepts one on top of an existing patient.
  if (blocksRes.error) return serverError(blocksRes.error.message, init);
  if (apptsRes.error) return serverError(apptsRes.error.message, init);

  // Named once and used twice: the engine reads them, and so does step 5's
  // policy gate. Two inline copies is how the slot the engine offered and the
  // row the insert wrote came to be judged against different settings.
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
    // Every hospital is in EAT and nothing stores a zone; the engine owns
    // that ceiling and its upgrade path.
    timeZone: DEFAULT_TIME_ZONE,
    now: new Date(),
    startsAt: new Date(input.starts_at),
    endsAt: new Date(input.ends_at),
  });
  // Already patient-facing prose, and the only reason this is a 400.
  if (notOfferable) return badRequest(notOfferable, init);

  // 4. Refuse double-booking at the wire (the partial UNIQUE index
  //    would also reject, but a clean 409 is friendlier).
  const { data: dup } = await sb
    .from("appointments")
    .select("id, status")
    .eq("clinician_user_id", input.clinician_user_id)
    .eq("starts_at", input.starts_at)
    .in("status", ["requested", "pending_approval", "confirmed", "arrived", "in_progress"])
    .limit(1)
    .maybeSingle();
  if (dup) {
    return conflict("Someone just took this slot — pick another and try again.", init);
  }

  // 5. Virtual is refused unless something GRANTS it — ADR 0029 §2's chain,
  //    whose last rung is `allowVirtual: false`. The guard used to read
  //    `settings && !settings.allow_virtual`, so a clinician with no settings
  //    row skipped it entirely and a department policy setting
  //    `allow_virtual = false` was not enforced on the wire at all. The book
  //    page has always hidden the option in that case, which is exactly why
  //    nothing legitimate changes here and why the hole was only reachable by
  //    a crafted POST.
  if (
    input.type === "virtual" &&
    !resolveSchedulingSettings(clinicianSettings, departmentPolicy).allowVirtual
  ) {
    return badRequest("This clinician doesn't accept virtual appointments.", init);
  }

  // The clinician's own row alone, NOT the resolved chain — and the asymmetry
  // with the line above is deliberate. Reading the department's
  // `default_auto_confirm` here would start auto-confirming patient requests
  // at clinicians who never configured it, which is a product decision ADR
  // 0084 does not make. /patient/book reads this flag the same narrow way, so
  // the promise on the confirm step and the status written here agree.
  const initialStatus = settings?.auto_confirm ? "confirmed" : "pending_approval";

  // 6. Resolve reminder lead times: prefer the department policy's,
  //    fall back to [1440, 60] minutes.
  const reminderLeads: number[] = deptPolicy?.reminder_lead_minutes ?? [1440, 60];

  // 7. Insert appointment.
  const { data: created, error: insertError } = await sb
    .from("appointments")
    .insert({
      hospital_id: input.hospital_id,
      department_id: input.department_id,
      patient_user_id: caller.id,
      clinician_user_id: input.clinician_user_id,
      starts_at: input.starts_at,
      ends_at: input.ends_at,
      reason: input.reason,
      reason_note: input.reason_note ?? null,
      origin: "patient",
      status: initialStatus,
      priority: "routine",
      type: input.type,
      created_by_user_id: caller.id,
    })
    .select("id, status")
    .single();
  if (insertError || !created) {
    log.error("appointment insert failed", { requestId, reason: insertError?.message });
    return serverError("could not create appointment", init);
  }

  // 8. Queue reminders. Best-effort; a failure here doesn't roll back
  //    the booking — the operator can re-queue from the appointment
  //    detail surface in GATE D.
  const startsMs = new Date(input.starts_at).getTime();
  const reminderRows = reminderLeads
    .filter((mins) => mins > 0)
    .map((mins) => ({
      appointment_id: created.id,
      // SMS is the only channel with a transport (lib/notifications/sink.ts),
      // and the only one that reaches a feature phone. Queue what will
      // actually be sent: a row saying 'in_app' made the dispatcher
      // substitute SMS at send time, which spent money on a channel the row
      // did not name. `in_app` needs a sa_notifications.kind migration before
      // it is queueable, and push/email are not built.
      channel: "sms" as const,
      scheduled_at: new Date(startsMs - mins * 60_000).toISOString(),
    }))
    // Drop leads that already elapsed. ADR-0084 made the same-day door
    // primary, and a 1440-minute lead on a booking made this morning
    // resolves to a `scheduled_at` ~23h in the PAST: the row is born
    // outside the dispatcher's stale grace and is reaped on its very
    // first run. Same filter as system-propose-urgent-appointment.
    .filter((r) => new Date(r.scheduled_at).getTime() > Date.now());
  if (reminderRows.length > 0) {
    const { error: remError } = await sb.from("appointment_reminders").insert(reminderRows);
    if (remError) {
      log.warn("reminder queue failed (continuing)", {
        requestId,
        reason: remError.message,
      });
    }
  }

  // 9. Audit.
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
        clinician_user_id: input.clinician_user_id,
        hospital_id: input.hospital_id,
        starts_at: input.starts_at,
        status: created.status,
        type: input.type,
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
  });
  return ok({ appointment_id: created.id, status: created.status }, init);
});
