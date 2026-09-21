/**
 * reschedule-appointment — move an appointment to a new slot.
 *
 * Behaviour:
 *   - Mints a NEW appointments row at the new slot, copying everything
 *     else (clinician, department, patient, reason, type) from the
 *     original.
 *   - Old row gets status='rescheduled' + cancelled_reason 'rescheduled' (a code, not
 *     the new row.
 *   - New row's status copies the original (a confirmed appointment
 *     stays confirmed; a pending_approval stays pending).
 *   - rescheduled_from_appointment_id on the new row links back.
 *   - Reminders / dispatches for the old row are cancelled; the new row
 *     queues its own notification rows (Gate E: receipt + T-24h
 *     confirmation request, `bookingDispatchRows`), and the old row's
 *     slot is offered to the waitlist (`releaseCapacity`).
 *
 * Allowed by: patient (own appointment), clinician (own), admin, superadmin.
 *
 * Refuses to reschedule a finalised status (cancelled, declined,
 * completed, no_show, rescheduled) — except a replay: the same
 * `idempotency_key` sent again answers with the row the first attempt
 * minted, same 200 body, even though the old row is 'rescheduled' by then
 * (Gate A §5.5). A double-booked new slot is a 409 whether the wire check
 * below or `appointments_no_double_booking` catches it (the index wins the
 * race the check cannot see).
 */
import { z } from "npm:zod@4.4.3";

import { getCaller, hasRole, serviceClient } from "../_shared/auth.ts";
import { preflight } from "../_shared/cors.ts";
import { bookingDispatchRows } from "../_shared/dispatches.ts";
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
import { requireHospitalAdminScope } from "../_shared/hospital-admin-scope.ts";
import { makeLogger } from "../_shared/logger.ts";
import { networkContext, recordSaAudit } from "../_shared/sa-audit.ts";
import { bookingCode } from "../_shared/slots.ts";
import { cancelPendingDispatches, releaseCapacity } from "../_shared/waitlist.ts";

const log = makeLogger("reschedule-appointment");

/** Retries on `appointments_hospital_booking_code_unique` — as pt-request-appointment. */
const BOOKING_CODE_ATTEMPTS = 5;
const cryptoRandom = () => (crypto.getRandomValues(new Uint32Array(1))[0] as number) / 2 ** 32;

const InputSchema = z.object({
  appointment_id: z.string().uuid(),
  new_starts_at: z.string().datetime({ offset: true }),
  new_ends_at: z.string().datetime({ offset: true }),
  reason: z.string().min(8, "Reason ≥ 8 chars required."),
  idempotency_key: z.string().min(1).max(128).optional(),
});

const RESCHEDULABLE = new Set(["requested", "pending_approval", "confirmed"]);

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

  if (new Date(input.new_ends_at) <= new Date(input.new_starts_at)) {
    return badRequest("new_ends_at must be > new_starts_at.", init);
  }

  const caller = await getCaller(request);
  if (!caller) return unauthorized(init);

  const sb = serviceClient();
  const { data: appt, error } = await sb
    .from("appointments")
    .select(
      "id, hospital_id, department_id, patient_user_id, provisional_patient_id, clinician_user_id, " +
        "status, reason, reason_note, symptoms, type, priority, notify_lead_minutes, session_id, channel, " +
        "quoted_fee_ugx, quoted_fee_label, quoted_fee_at",
    )
    .eq("id", input.appointment_id)
    .maybeSingle();
  if (error) return serverError(error.message, init);
  if (!appt) return notFound(init, "appointment not found");

  const isSuperadmin = await hasRole(caller.id, "superadmin");
  const isPatient = caller.id === appt.patient_user_id;
  const isClinician = caller.id === appt.clinician_user_id;
  if (!isSuperadmin && !isPatient && !isClinician) {
    if (!(await hasRole(caller.id, "hospital_admin", appt.hospital_id))) {
      return forbidden(init);
    }
    const scope = await requireHospitalAdminScope(caller.id, appt.hospital_id);
    if (!scope.ok) return forbidden(init, scope.reason);
  }

  // Replay? Answer with the row the first attempt minted. Checked after
  // authorisation (so the lookup leaks nothing) and before the status gate
  // (the old row is already 'rescheduled' by the time a 2G retry lands).
  const replay = async () =>
    input.idempotency_key
      ? (
          await sb
            .from("appointments")
            .select("id, status")
            // A provisional booking (0060) has no patient yet; its key is
            // per creator (`appointments_creator_idempotency_unique`).
            .eq(
              appt.patient_user_id ? "patient_user_id" : "created_by_user_id",
              appt.patient_user_id ?? caller.id,
            )
            .eq("idempotency_key", input.idempotency_key)
            .maybeSingle()
        ).data
      : null;
  const replied = (row: { id: string; status: string }) =>
    ok({ old_appointment_id: appt.id, new_appointment_id: row.id, new_status: row.status }, init);
  const prior = await replay();
  if (prior) return replied(prior);

  if (!RESCHEDULABLE.has(appt.status)) {
    return badRequest(
      `Appointment is in '${appt.status}' — reschedule isn't allowed from here.`,
      init,
    );
  }
  // ADR 0088: a session booking holds a POSITION, not a time, so a new
  // starts_at means nothing to it. Moving one is cancel-position + allocate
  // in the target clinic day — a different input and a different function.
  if (appt.session_id) {
    return badRequest("Move this visit from the clinic day list.", init);
  }

  // Refuse double-book at the new slot. The index is the real guard (its
  // 23505 maps to the same 409 below); this check stays because the audit
  // row is written BEFORE the insert, and a refused reschedule should not
  // leave an audit row claiming it happened.
  const { data: dup } = await sb
    .from("appointments")
    .select("id")
    .eq("clinician_user_id", appt.clinician_user_id)
    .eq("starts_at", input.new_starts_at)
    .in("status", ["requested", "pending_approval", "confirmed", "arrived", "in_progress"])
    .limit(1)
    .maybeSingle();
  if (dup) return conflict("Someone just took this slot — pick another and try again.", init);

  // Look up the lead times to copy onto the new row's reminders.
  const leadMinutes: number[] = appt.notify_lead_minutes ??
    (
      await sb
        .from("department_scheduling_policy")
        .select("reminder_lead_minutes")
        .eq("department_id", appt.department_id)
        .maybeSingle()
    ).data?.reminder_lead_minutes ?? [1440, 60];

  const { ipAddress, userAgent } = networkContext(request);

  // 1. Audit first.
  try {
    await recordSaAudit({
      actorId: caller.id,
      action: "reschedule_appointment",
      targetKind: "appointment",
      targetId: appt.id,
      reason: input.reason,
      requestId,
      ipAddress,
      userAgent,
      beforeData: { status: appt.status },
      afterData: {
        status: "rescheduled",
        new_starts_at: input.new_starts_at,
        new_ends_at: input.new_ends_at,
      },
    });
  } catch (e) {
    log.error("sa_audit failed; aborting", { requestId, reason: String(e) });
    return serverError("audit write failed", init);
  }

  // 2. Create the new appointment — with its own booking code (ADR 0088):
  //    the old row keeps the old code, so the desk can find either.
  let newRow: { id: string; status: string } | null = null;
  let insertError: { code?: string; message?: string } | null = null;
  for (let attempt = 0; attempt < BOOKING_CODE_ATTEMPTS && !newRow; attempt++) {
    const res = await sb
      .from("appointments")
      .insert({
        booking_code: bookingCode(cryptoRandom),
        channel: appt.channel,
        hospital_id: appt.hospital_id,
        department_id: appt.department_id,
        patient_user_id: appt.patient_user_id,
        // Provenance travels with the booking (0060): a provisional row
        // stays a provisional row, and an un-reconcile can still find it.
        provisional_patient_id: appt.provisional_patient_id ?? null,
        clinician_user_id: appt.clinician_user_id,
        starts_at: input.new_starts_at,
        ends_at: input.new_ends_at,
        reason: appt.reason,
        reason_note: appt.reason_note,
        symptoms: appt.symptoms ?? null,
        origin: isPatient ? "patient" : isClinician ? "clinician" : "reception",
        status: appt.status,
        priority: appt.priority,
        type: appt.type,
        rescheduled_from_appointment_id: appt.id,
        created_by_user_id: caller.id,
        notify_lead_minutes: leadMinutes,
        // The quote travels with the booking (ADR 0092): the patient was told
        // a number, the same clinician sees them, the number stands. COPIED,
        // never re-resolved — a later price change must not reach a booking
        // someone holds, and only _shared/book.ts may mint a new quote.
        quoted_fee_ugx: appt.quoted_fee_ugx ?? null,
        quoted_fee_label: appt.quoted_fee_label ?? null,
        quoted_fee_at: appt.quoted_fee_at ?? null,
        // Omitted when absent so the row takes the column default (and a
        // client that never sends one keeps working before migration 0058).
        ...(input.idempotency_key ? { idempotency_key: input.idempotency_key } : {}),
      })
      .select("id, status")
      .single();
    insertError = res.error;
    if (res.data) newRow = res.data;
    else if (
      !(
        res.error?.code === "23505" &&
        res.error.message.includes("appointments_hospital_booking_code_unique")
      )
    ) {
      break;
    }
  }
  if (!newRow) {
    const violates = (index: string) =>
      insertError?.code === "23505" && !!insertError.message?.includes(index);
    if (violates("appointments_no_double_booking")) {
      return conflict("Someone just took this slot — pick another and try again.", init);
    }
    if (
      violates("appointments_idempotency_unique") ||
      violates("appointments_creator_idempotency_unique")
    ) {
      // Two retries of one submission raced past the replay check.
      const winner = await replay();
      if (winner) return replied(winner);
    }
    log.error("new appointment insert failed", { requestId, reason: insertError?.message });
    return serverError("reschedule failed (new row)", init);
  }

  // 3. Flip the old row.
  const { error: updateError } = await sb
    .from("appointments")
    .update({
      status: "rescheduled",
      // A closed code (ADR 0094); the new row's `rescheduled_from_appointment_id`
      // says where it went, so the instant need not be repeated here.
      cancelled_reason: "rescheduled",
      cancelled_by_user_id: caller.id,
    })
    .eq("id", appt.id);
  if (updateError) {
    log.warn("old appointment flip failed (new row already created)", {
      requestId,
      old_id: appt.id,
      new_id: newRow.id,
      reason: updateError.message,
    });
  }

  // 4. Reap the old row's reminders + dispatches; the old slot goes to the
  //    waitlist; the new row gets its own receipt + confirmation request.
  await sb
    .from("appointment_reminders")
    .update({ state: "cancelled" })
    .eq("appointment_id", appt.id)
    .eq("state", "queued");
  await cancelPendingDispatches(sb, "appointment", appt.id, "appointment_rescheduled");
  await releaseCapacity(sb, appt.id, log, requestId);

  const recipient = appt.patient_user_id
    ? { userId: appt.patient_user_id as string }
    : appt.provisional_patient_id
      ? await (async () => {
          const { data: prov } = await sb
            .from("provisional_patients")
            .select("phone_encrypted")
            .eq("id", appt.provisional_patient_id)
            .maybeSingle();
          return prov?.phone_encrypted ? { phoneEncrypted: prov.phone_encrypted as string } : null;
        })()
      : null;
  if (recipient) {
    const { error: dispatchError } = await sb.from("notification_dispatches").upsert(
      bookingDispatchRows({
        hospitalId: appt.hospital_id,
        recipient,
        appointmentId: newRow.id,
        startsAtIso: input.new_starts_at,
        isSession: false,
        nowIso: new Date().toISOString(),
      }),
      { onConflict: "idempotency_key", ignoreDuplicates: true },
    );
    if (dispatchError) {
      log.warn("dispatch queue failed (continuing)", { requestId, reason: dispatchError.message });
    }
  }

  log.info("appointment rescheduled", {
    requestId,
    old_id: appt.id,
    new_id: newRow.id,
  });
  return replied(newRow);
});
