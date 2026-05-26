/**
 * ha-set-staff-status — hospital admin transitions a staff_affiliation
 * between active / suspended / deactivated.
 *
 * Per-affiliation, not global user. A staff member who holds
 * affiliations at multiple hospitals stays untouched at the others.
 *
 * Allowed transitions (anything else returns 400):
 *
 *   active   → suspended      (audit: suspend_staff_affiliation)
 *   active   → deactivated    (audit: deactivate_staff_affiliation)
 *   approved → suspended      (same audit as above)
 *   approved → deactivated    (same)
 *   suspended   → approved    (audit: reactivate_staff_affiliation)
 *   deactivated → approved    (audit: reactivate_staff_affiliation)
 *
 * Why we don't transition to 'active' directly when reactivating:
 *   - 'active' means the user has BOTH a valid affiliation AND a valid
 *     MFA session. The reactivation is the affiliation half; the next
 *     successful MFA-gated sign-in promotes them to 'active' downstream.
 *     Matches the approve flow's choice.
 */

import type { SaAuditAction } from "../_shared/sa-audit.ts";
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

const log = makeLogger("ha-set-staff-status");

const InputSchema = z.object({
  affiliation_id: z.string().uuid(),
  target_state: z.enum(["suspended", "deactivated", "approved"]),
  reason: z.string().min(8, "Reason ≥ 8 chars required for the audit record."),
});

/**
 * Maps (fromState, toState) → audit action. Returns null when the
 * transition isn't allowed.
 */
function audit(from: string, to: string): SaAuditAction | null {
  const isActive = from === "active" || from === "approved";
  if (isActive && to === "suspended") return "suspend_staff_affiliation";
  if (isActive && to === "deactivated") return "deactivate_staff_affiliation";
  if ((from === "suspended" || from === "deactivated") && to === "approved")
    return "reactivate_staff_affiliation";
  return null;
}

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
  const { data: aff, error: fetchError } = await sb
    .from("staff_affiliations")
    .select("id, hospital_id, state, user_id")
    .eq("id", input.affiliation_id)
    .maybeSingle();
  if (fetchError) return serverError(fetchError.message, init);
  if (!aff) return notFound(init, "affiliation not found");

  const isSuperadmin = await hasRole(caller.id, "superadmin");
  if (!isSuperadmin) {
    const scope = await requireHospitalAdminScope(caller.id, aff.hospital_id);
    if (!scope.ok) return forbidden(init, scope.reason);
  }

  const action = audit(aff.state, input.target_state);
  if (!action) {
    return badRequest(`Transition '${aff.state}' → '${input.target_state}' is not allowed.`, init);
  }

  const before = { state: aff.state };
  const after = { state: input.target_state };
  const { ipAddress, userAgent } = networkContext(request);
  try {
    await recordSaAudit({
      actorId: caller.id,
      action,
      targetKind: "staff_affiliation",
      targetId: aff.id,
      reason: input.reason,
      requestId,
      ipAddress,
      userAgent,
      beforeData: before,
      afterData: after,
    });
  } catch (e) {
    log.error("sa_audit failed; aborting", { requestId, reason: String(e) });
    return serverError("audit write failed", init);
  }

  const { error: updateError } = await sb
    .from("staff_affiliations")
    .update({ state: input.target_state })
    .eq("id", aff.id);
  if (updateError) {
    log.error("affiliation state update failed", { requestId, reason: updateError.message });
    return serverError("status update failed", init);
  }

  log.info("affiliation state set", {
    requestId,
    affiliation_id: aff.id,
    from: aff.state,
    to: input.target_state,
    action,
  });
  return ok({ affiliation_id: aff.id, state: input.target_state }, init);
});
