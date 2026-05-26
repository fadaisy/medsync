/**
 * ha-revoke-staff-invitation — admin pulls back an outstanding staff
 * invitation so the token can no longer be claimed.
 *
 * Refuses to revoke an already-accepted invitation (no point —
 * affiliation already exists; suspend / deactivate is the right path).
 * Refuses to re-revoke an already-revoked one (idempotent guard).
 *
 * Audited as `revoke_staff_invitation` with the revocation reason.
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

const log = makeLogger("ha-revoke-staff-invitation");

const InputSchema = z.object({
  invitation_id: z.string().uuid(),
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
  const { data: invitation, error: fetchError } = await sb
    .from("hospital_staff_invitations")
    .select("id, hospital_id, invited_email, accepted_at, revoked_at")
    .eq("id", input.invitation_id)
    .maybeSingle();
  if (fetchError) return serverError(fetchError.message, init);
  if (!invitation) return notFound(init, "invitation not found");

  const isSuperadmin = await hasRole(caller.id, "superadmin");
  if (!isSuperadmin) {
    const scope = await requireHospitalAdminScope(caller.id, invitation.hospital_id);
    if (!scope.ok) return forbidden(init, scope.reason);
  }

  if (invitation.accepted_at) {
    return badRequest(
      "Invitation has already been accepted. Use the directory to suspend or deactivate the resulting affiliation.",
      init,
    );
  }
  if (invitation.revoked_at) {
    return badRequest("Invitation is already revoked.", init);
  }

  const nowIso = new Date().toISOString();
  const { ipAddress, userAgent } = networkContext(request);

  try {
    await recordSaAudit({
      actorId: caller.id,
      action: "revoke_staff_invitation",
      targetKind: "staff_invitation",
      targetId: invitation.id,
      reason: input.reason,
      requestId,
      ipAddress,
      userAgent,
      beforeData: { revoked_at: null, email: invitation.invited_email },
      afterData: { revoked_at: nowIso, email: invitation.invited_email },
    });
  } catch (e) {
    log.error("sa_audit failed; aborting", { requestId, reason: String(e) });
    return serverError("audit write failed", init);
  }

  const { error: updateError } = await sb
    .from("hospital_staff_invitations")
    .update({
      revoked_at: nowIso,
      revoked_by: caller.id,
      revocation_reason: input.reason,
    })
    .eq("id", invitation.id);
  if (updateError) {
    log.error("invitation revoke update failed", { requestId, reason: updateError.message });
    return serverError("revoke failed", init);
  }

  log.info("invitation revoked", { requestId, invitation_id: invitation.id });
  return ok({ invitation_id: invitation.id, revoked_at: nowIso }, init);
});
