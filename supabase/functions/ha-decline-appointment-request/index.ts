/**
 * ha-decline-appointment-request — clinician rejects a pending request.
 *
 * Sets status='declined'. The reason is STAFF ONLY (Gate H ruling, ADR
 * 0094): it goes to the `decline_appointment_request` sa_audit_log row, never
 * to `declined_reason` — a column the patient reads straight through RLS.
 * The status is the closed code patient surfaces map to one fixed sentence.
 * The freed slot is offered to the waitlist (`releaseCapacity`, Gate E).
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
import { cancelPendingDispatches, releaseCapacity } from "../_shared/waitlist.ts";

const log = makeLogger("ha-decline-appointment-request");

const InputSchema = z.object({
  appointment_id: z.string().uuid(),
  reason: z.string().min(8, "Reason ≥ 8 chars required (audited; staff only)."),
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
  const { data: appt, error } = await sb
    .from("appointments")
    .select("id, hospital_id, clinician_user_id, status")
    .eq("id", input.appointment_id)
    .maybeSingle();
  if (error) return serverError(error.message, init);
  if (!appt) return notFound(init, "appointment not found");

  const isSuperadmin = await hasRole(caller.id, "superadmin");
  const isClinician = caller.id === appt.clinician_user_id;
  if (!isSuperadmin && !isClinician) {
    if (!(await hasRole(caller.id, "hospital_admin", appt.hospital_id))) {
      return forbidden(init);
    }
    const scope = await requireHospitalAdminScope(caller.id, appt.hospital_id);
    if (!scope.ok) return forbidden(init, scope.reason);
  }

  if (appt.status !== "pending_approval") {
    return badRequest(
      `Appointment is in '${appt.status}' — only pending requests can be declined.`,
      init,
    );
  }

  const { ipAddress, userAgent } = networkContext(request);
  try {
    await recordSaAudit({
      actorId: caller.id,
      action: "decline_appointment_request",
      targetKind: "appointment",
      targetId: appt.id,
      reason: input.reason,
      requestId,
      ipAddress,
      userAgent,
      beforeData: { status: appt.status },
      afterData: { status: "declined" },
    });
  } catch (e) {
    log.error("sa_audit failed; aborting", { requestId, reason: String(e) });
    return serverError("audit write failed", init);
  }

  const { error: updateError } = await sb
    .from("appointments")
    .update({ status: "declined" })
    .eq("id", appt.id);
  if (updateError) {
    log.error("decline failed", { requestId, reason: updateError.message });
    return serverError("decline failed", init);
  }

  // Its receipt / confirmation request were held awaiting this answer.
  await cancelPendingDispatches(sb, "appointment", appt.id, "appointment_declined");
  await sb
    .from("appointment_reminders")
    .update({ state: "cancelled" })
    .eq("appointment_id", appt.id)
    .eq("state", "queued");
  await releaseCapacity(sb, appt.id, log, requestId);

  log.info("appointment declined", { requestId, appointment_id: appt.id });
  return ok({ appointment_id: appt.id, status: "declined" }, init);
});
