/**
 * ha-mark-no-show — clinician (or nurse on assignment, or admin)
 * marks a confirmed appointment as no_show.
 *
 * Allowed when:
 *   - status ∈ {'confirmed','arrived'}
 *   - now() > appointment.starts_at  (can't mark a future booking as
 *     no-show; the operator needs to have actually missed them)
 *
 * No patient-punitive automation (per kickoff). The flag exists for
 * the operational signal — surfaced on the admin overview later.
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

const log = makeLogger("ha-mark-no-show");

const InputSchema = z.object({
  appointment_id: z.string().uuid(),
  reason: z.string().min(8, "Reason ≥ 8 chars required (audited)."),
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
    .select("id, hospital_id, clinician_user_id, status, starts_at")
    .eq("id", input.appointment_id)
    .maybeSingle();
  if (error) return serverError(error.message, init);
  if (!appt) return notFound(init, "appointment not found");

  const isSuperadmin = await hasRole(caller.id, "superadmin");
  const isClinician = caller.id === appt.clinician_user_id;
  const isNurse = await hasRole(caller.id, "nurse", appt.hospital_id);
  if (!isSuperadmin && !isClinician && !isNurse) {
    if (!(await hasRole(caller.id, "hospital_admin", appt.hospital_id))) {
      return forbidden(init);
    }
    const scope = await requireHospitalAdminScope(caller.id, appt.hospital_id);
    if (!scope.ok) return forbidden(init, scope.reason);
  }

  if (!(appt.status === "confirmed" || appt.status === "arrived")) {
    return badRequest(
      `Appointment is in '${appt.status}' — must be confirmed or arrived to mark no-show.`,
      init,
    );
  }
  if (new Date(appt.starts_at).getTime() > Date.now()) {
    return badRequest("Can't mark a future appointment as no-show.", init);
  }

  const { ipAddress, userAgent } = networkContext(request);
  try {
    await recordSaAudit({
      actorId: caller.id,
      action: "mark_no_show",
      targetKind: "appointment",
      targetId: appt.id,
      reason: input.reason,
      requestId,
      ipAddress,
      userAgent,
      beforeData: { status: appt.status },
      afterData: { status: "no_show" },
    });
  } catch (e) {
    log.error("sa_audit failed; aborting", { requestId, reason: String(e) });
    return serverError("audit write failed", init);
  }

  const { error: updateError } = await sb
    .from("appointments")
    .update({ status: "no_show" })
    .eq("id", appt.id);
  if (updateError) {
    log.error("no-show update failed", { requestId, reason: updateError.message });
    return serverError("no-show failed", init);
  }

  log.info("appointment marked no-show", { requestId, appointment_id: appt.id });
  return ok({ appointment_id: appt.id, status: "no_show" }, init);
});
