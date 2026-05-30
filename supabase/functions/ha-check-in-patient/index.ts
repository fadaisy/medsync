/**
 * ha-check-in-patient — reception checks in a patient with a booked
 * appointment. The convenience wrapper that reconciles the
 * disjointness between scheduling (queue) and patient_intakes:
 *
 *   1. Flip appointment status confirmed → arrived.
 *   2. Insert queue_entries row (kind = scheduled_arrival, state = waiting).
 *      Skipped for virtual appointments.
 *   3. Insert patient_intakes row (entry_type = booked_arrival,
 *      appointment_id, status = awaiting_triage). Reception now sees a
 *      checked-in patient on every awaiting-triage panel.
 *
 * Auth: reception or hospital_admin at the hospital, or superadmin.
 *
 * Note: ha-mark-arrived already does step 1+2 — this Edge Function
 * adds step 3 + relaxes auth so a non-clinical reception user (with
 * the new RECEPTION cadre) can call it. Mirrors ha-register-intake's
 * broad-staff auth.
 */
import { z } from "npm:zod@4.4.3";

import { getCaller, hasRole, serviceClient } from "../_shared/auth.ts";
import { preflight } from "../_shared/cors.ts";
import {
  badRequest,
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

const log = makeLogger("ha-check-in-patient");

const InputSchema = z.object({
  appointment_id: z.string().uuid(),
  reason: z
    .string()
    .min(8, "Reason ≥ 8 chars required (audited).")
    .default("Booked patient checked in at front desk."),
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

  const caller = await getCaller(request);
  if (!caller) return unauthorized(init);

  const sb = serviceClient();

  const { data: appt, error: apptErr } = await sb
    .from("appointments")
    .select("id, hospital_id, department_id, patient_user_id, status, type")
    .eq("id", input.appointment_id)
    .maybeSingle();
  if (apptErr) return serverError(apptErr.message, init);
  if (!appt) return notFound(init, "appointment not found");
  if (appt.status !== "confirmed") {
    return badRequest(`Appointment is in '${appt.status}' — only confirmed can check in.`, init);
  }

  // Authorise: superadmin / hospital_admin / any active staff
  // affiliation at the hospital (reception + clinical both qualify).
  const isSuperadmin = await hasRole(caller.id, "superadmin");
  if (!isSuperadmin) {
    if (await hasRole(caller.id, "hospital_admin", appt.hospital_id)) {
      const scope = await requireHospitalAdminScope(caller.id, appt.hospital_id);
      if (!scope.ok) return forbidden(init, scope.reason);
    } else {
      const { data: aff } = await sb
        .from("staff_affiliations")
        .select("id")
        .eq("user_id", caller.id)
        .eq("hospital_id", appt.hospital_id)
        .in("state", ["active", "approved"])
        .limit(1)
        .maybeSingle();
      if (!aff) return forbidden(init);
    }
  }

  const { ipAddress, userAgent } = networkContext(request);
  try {
    await recordSaAudit({
      actorId: caller.id,
      action: "check_in_patient",
      targetKind: "appointment",
      targetId: appt.id,
      reason: input.reason,
      requestId,
      ipAddress,
      userAgent,
      beforeData: { status: appt.status },
      afterData: { status: "arrived" },
    });
  } catch (e) {
    log.error("sa_audit failed; aborting", { requestId, reason: String(e) });
    return serverError("audit write failed", init);
  }

  // 1. Flip status.
  const { error: updateError } = await sb
    .from("appointments")
    .update({ status: "arrived" })
    .eq("id", appt.id);
  if (updateError) {
    log.error("status update failed", { requestId, reason: updateError.message });
    return serverError("check-in failed", init);
  }

  // 2. Queue row (skip virtual).
  let queueEntryId: string | null = null;
  if (appt.type !== "virtual") {
    const startOfDay = new Date();
    startOfDay.setUTCHours(0, 0, 0, 0);
    const { count } = await sb
      .from("queue_entries")
      .select("id", { count: "exact", head: true })
      .eq("hospital_id", appt.hospital_id)
      .eq("department_id", appt.department_id)
      .gte("arrived_at", startOfDay.toISOString());
    const sequenceNumber = (count ?? 0) + 1;

    const { data: queueRow, error: queueError } = await sb
      .from("queue_entries")
      .insert({
        hospital_id: appt.hospital_id,
        department_id: appt.department_id,
        appointment_id: appt.id,
        patient_user_id: appt.patient_user_id,
        kind: "scheduled_arrival",
        state: "waiting",
        sequence_number: sequenceNumber,
      })
      .select("id")
      .single();
    if (queueError) {
      log.warn("queue insert failed (continuing)", { requestId, reason: queueError.message });
    } else {
      queueEntryId = queueRow?.id ?? null;
    }
  }

  // 3. Intake row — the front-desk record of the arrival.
  const { data: intakeRow, error: intakeError } = await sb
    .from("patient_intakes")
    .insert({
      hospital_id: appt.hospital_id,
      entry_type_code: "booked_arrival",
      entry_point: appt.type === "virtual" ? "virtual" : "opd",
      receiving_department_id: appt.department_id,
      patient_user_id: appt.patient_user_id,
      appointment_id: appt.id,
      priority_hint: "routine",
      status: "awaiting_triage",
      registered_by_user_id: caller.id,
    })
    .select("id")
    .single();
  if (intakeError) {
    log.warn("intake insert failed (continuing)", { requestId, reason: intakeError.message });
  }

  log.info("checked in", {
    requestId,
    appointment_id: appt.id,
    queue_entry_id: queueEntryId,
    intake_id: intakeRow?.id ?? null,
  });
  return ok(
    {
      appointment_id: appt.id,
      queue_entry_id: queueEntryId,
      intake_id: intakeRow?.id ?? null,
    },
    init,
  );
});
