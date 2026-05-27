/**
 * cancel-appointment — patient or staff cancels an appointment.
 *
 * Callable by:
 *   - The patient (own appointment).
 *   - The clinician (own appointment).
 *   - Hospital_admin / superadmin at the appointment's hospital.
 *
 * Refuses to cancel statuses where cancel doesn't make sense
 * (already cancelled, declined, completed, no_show).
 *
 * Also cancels any queued reminders so they don't fire after the
 * appointment is gone.
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

const log = makeLogger("cancel-appointment");

const InputSchema = z.object({
  appointment_id: z.string().uuid(),
  reason: z.string().min(8, "Reason ≥ 8 chars required."),
});

const CANCELLABLE_STATES = new Set(["requested", "pending_approval", "confirmed", "arrived"]);

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
  const { data: appt, error } = await sb
    .from("appointments")
    .select("id, hospital_id, clinician_user_id, patient_user_id, status")
    .eq("id", input.appointment_id)
    .maybeSingle();
  if (error) return serverError(error.message, init);
  if (!appt) return notFound(init, "appointment not found");

  const isSuperadmin = await hasRole(caller.id, "superadmin");
  const isPatient = caller.id === appt.patient_user_id;
  const isClinician = caller.id === appt.clinician_user_id;
  if (!isSuperadmin && !isPatient && !isClinician) {
    if (!(await hasRole(caller.id, "hospital_admin", appt.hospital_id))) {
      return forbidden(init, "you can't cancel this appointment");
    }
    const scope = await requireHospitalAdminScope(caller.id, appt.hospital_id);
    if (!scope.ok) return forbidden(init, scope.reason);
  }

  if (!CANCELLABLE_STATES.has(appt.status)) {
    return badRequest(
      `Appointment is in '${appt.status}' — already past the cancellable window.`,
      init,
    );
  }

  const { ipAddress, userAgent } = networkContext(request);
  try {
    await recordSaAudit({
      actorId: caller.id,
      action: "cancel_appointment",
      targetKind: "appointment",
      targetId: appt.id,
      reason: input.reason,
      requestId,
      ipAddress,
      userAgent,
      beforeData: { status: appt.status },
      afterData: { status: "cancelled", cancelled_reason: input.reason },
    });
  } catch (e) {
    log.error("sa_audit failed; aborting", { requestId, reason: String(e) });
    return serverError("audit write failed", init);
  }

  const { error: updateError } = await sb
    .from("appointments")
    .update({
      status: "cancelled",
      cancelled_reason: input.reason,
      cancelled_by_user_id: caller.id,
    })
    .eq("id", appt.id);
  if (updateError) {
    log.error("cancel failed", { requestId, reason: updateError.message });
    return serverError("cancel failed", init);
  }

  // Reap queued reminders (best-effort).
  await sb
    .from("appointment_reminders")
    .update({ state: "cancelled" })
    .eq("appointment_id", appt.id)
    .eq("state", "queued");

  log.info("appointment cancelled", { requestId, appointment_id: appt.id });
  return ok({ appointment_id: appt.id, status: "cancelled" }, init);
});
