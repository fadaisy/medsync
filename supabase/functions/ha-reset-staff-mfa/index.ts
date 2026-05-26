/**
 * ha-reset-staff-mfa — hospital admin un-enrols a staff member's MFA
 * factor for THIS hospital's affiliation.
 *
 * Why per-affiliation: a clinician may hold affiliations at multiple
 * hospitals. The admin can reset their MFA "for the sake of regaining
 * access to OUR hospital," which in Supabase Auth terms is a global
 * MFA un-enrolment — there's only one MFA factor per user. Resetting
 * here forces them to re-enrol on their next sign-in (the proxy will
 * send them to /onboarding/mfa-setup).
 *
 * The hospital_admin must hold the role for this affiliation's
 * hospital. If the user has affiliations elsewhere too, the reset
 * still affects all of them — there's no per-hospital MFA in
 * Supabase. We surface this in the action's reason ceremony so the
 * admin is making an informed choice.
 *
 * Audited via sa_audit_log as `reset_staff_mfa` with target_kind
 * `staff_affiliation` (the affiliation the admin acted on; the
 * downstream effect on the user is in the reason text).
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

const log = makeLogger("ha-reset-staff-mfa");

const InputSchema = z.object({
  affiliation_id: z.string().uuid(),
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
  const { data: aff, error: fetchError } = await sb
    .from("staff_affiliations")
    .select("id, hospital_id, user_id, state")
    .eq("id", input.affiliation_id)
    .maybeSingle();
  if (fetchError) return serverError(fetchError.message, init);
  if (!aff) return notFound(init, "affiliation not found");

  const isSuperadmin = await hasRole(caller.id, "superadmin");
  if (!isSuperadmin) {
    const scope = await requireHospitalAdminScope(caller.id, aff.hospital_id);
    if (!scope.ok) return forbidden(init, scope.reason);
  }

  // List the user's MFA factors and unenroll the verified totp ones.
  // Best-effort: a user with no factors is treated as already-reset.
  const { data: factorsData, error: factorsError } = await sb.auth.admin.mfa.listFactors({
    userId: aff.user_id,
  });
  if (factorsError) {
    log.error("listFactors failed", { requestId, reason: factorsError.message });
    return serverError("could not enumerate MFA factors", init);
  }
  const beforeFactorCount = factorsData?.factors?.length ?? 0;

  // Audit FIRST so a failure during unenroll can't leave the action
  // un-attributed.
  const { ipAddress, userAgent } = networkContext(request);
  try {
    await recordSaAudit({
      actorId: caller.id,
      action: "reset_staff_mfa",
      targetKind: "staff_affiliation",
      targetId: aff.id,
      reason: input.reason,
      requestId,
      ipAddress,
      userAgent,
      beforeData: { mfa_factor_count: beforeFactorCount },
      afterData: { mfa_factor_count: 0 },
    });
  } catch (e) {
    log.error("sa_audit failed; aborting", { requestId, reason: String(e) });
    return serverError("audit write failed", init);
  }

  for (const factor of factorsData?.factors ?? []) {
    const { error: unenrollError } = await sb.auth.admin.mfa.deleteFactor({
      userId: aff.user_id,
      id: factor.id,
    });
    if (unenrollError) {
      log.warn("unenroll factor failed (continuing)", {
        requestId,
        reason: unenrollError.message,
        factor_id: factor.id,
      });
    }
  }

  log.info("staff MFA reset", {
    requestId,
    affiliation_id: aff.id,
    factors_removed: beforeFactorCount,
  });
  return ok({ affiliation_id: aff.id, factors_removed: beforeFactorCount }, init);
});
