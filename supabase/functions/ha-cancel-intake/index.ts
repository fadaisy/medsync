/**
 * ha-cancel-intake — close an intake without it becoming an encounter.
 *
 * Used when:
 *   - patient left without being seen
 *   - mis-registration (wrong patient, duplicate)
 *   - emergency stabilised + transferred out
 *
 * Sets patient_intakes.status = 'cancelled' with an audited reason.
 * Does NOT touch encounters / queue / nursing_assignments — those
 * have their own close paths (ha-complete-encounter, no-shows).
 *
 * Auth: reception / clinician / hospital_admin at the hospital, or
 * superadmin.
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

const log = makeLogger("ha-cancel-intake");

const InputSchema = z.object({
  intake_id: z.string().uuid(),
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

  const { data: intake, error: ie } = await sb
    .from("patient_intakes")
    .select("id, hospital_id, status")
    .eq("id", input.intake_id)
    .maybeSingle();
  if (ie) return serverError(ie.message, init);
  if (!intake) return notFound(init, "intake not found");
  if (intake.status === "completed" || intake.status === "cancelled") {
    return badRequest(`Intake already in terminal state '${intake.status}'.`, init);
  }

  const isSuperadmin = await hasRole(caller.id, "superadmin");
  if (!isSuperadmin) {
    if (await hasRole(caller.id, "hospital_admin", intake.hospital_id)) {
      const scope = await requireHospitalAdminScope(caller.id, intake.hospital_id);
      if (!scope.ok) return forbidden(init, scope.reason);
    } else {
      const { data: aff } = await sb
        .from("staff_affiliations")
        .select("id")
        .eq("user_id", caller.id)
        .eq("hospital_id", intake.hospital_id)
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
      action: "cancel_intake",
      targetKind: "patient_intake",
      targetId: intake.id,
      reason: input.reason,
      requestId,
      ipAddress,
      userAgent,
      beforeData: { status: intake.status },
      afterData: { status: "cancelled" },
    });
  } catch (e) {
    log.error("sa_audit failed; aborting", { requestId, reason: String(e) });
    return serverError("audit write failed", init);
  }

  const { error: updErr } = await sb
    .from("patient_intakes")
    .update({ status: "cancelled" })
    .eq("id", intake.id);
  if (updErr) {
    log.error("intake cancel failed", { requestId, reason: updErr.message });
    return serverError("intake cancel failed", init);
  }

  log.info("intake cancelled", { requestId, intake_id: intake.id });
  return ok({ intake_id: intake.id }, init);
});
