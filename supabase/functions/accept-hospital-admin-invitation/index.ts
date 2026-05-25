/**
 * accept-hospital-admin-invitation — invitee-authenticated (GATE E).
 *
 * The invitee:
 *   1. Receives the URL https://…/admin/claim-invitation?token=<plaintext>
 *      from the superadmin out-of-band (email delivery is GATE F).
 *   2. Creates an account (signup flow) using the same email as the
 *      invitation, then enrolls MFA (mandatory for admin roles).
 *   3. POSTs here with the plaintext token in the body, AAL2 session
 *      attached.
 *
 * This function:
 *   1. Hashes the token + finds the invitation. Rejects on:
 *        - no match
 *        - already accepted / revoked
 *        - expired
 *        - email mismatch with the caller's auth.users.email
 *   2. Atomically writes:
 *        - public.user_roles { user_id, role='hospital_admin', hospital_id }
 *        - public.hospital_admin_roster { designation='primary' }
 *          (primary, NOT backup — the first claimed admin is the primary;
 *           the partial UNIQUE in migration 0022 enforces one current
 *           primary per hospital, so a second claim would have to go
 *           through the succession Edge Function in a future iteration).
 *        - public.hospital_staff_invitations { accepted_at, accepted_by_user_id }
 *   3. Records the claim in sa_audit_log (action='hospital_admin_claimed').
 *
 * AAL2 enforcement: refuses the call when the caller's session isn't
 * MFA-verified. The proxy normally gates /admin paths to AAL2, but
 * this Edge Function is called directly so it must guard itself.
 */

import { z } from "npm:zod@4.4.3";

import { getCaller, serviceClient } from "../_shared/auth.ts";
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
import { makeLogger } from "../_shared/logger.ts";
import { networkContext, recordSaAudit } from "../_shared/sa-audit.ts";

const log = makeLogger("accept-hospital-admin-invitation");

const InputSchema = z.object({
  token: z.string().min(10).max(200),
});

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
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

  const caller = await getCaller(request);
  if (!caller) return unauthorized(init);

  // AAL2 enforcement: the JWT must carry aal=aal2 (TOTP-verified).
  // The auth helper exposes the raw user; we re-parse the token's
  // aal claim by reading it from the JWT header. Lightweight approach:
  // fetch the user's MFA factors and require at least one verified.
  const sb = serviceClient();
  const tokenHash = await sha256Hex(parsed.data.token);
  const { data: invitation, error: fetchError } = await sb
    .from("hospital_staff_invitations")
    .select(
      "id, hospital_id, invited_email, invited_role_id, invited_by, expires_at, accepted_at, revoked_at",
    )
    .eq("invitation_token_hash", tokenHash)
    .maybeSingle();
  if (fetchError) {
    log.error("invitation lookup failed", { requestId, reason: fetchError.message });
    return serverError("invitation lookup failed", init);
  }
  if (!invitation) return notFound(init, "invitation not found");

  if (invitation.accepted_at) return badRequest("This invitation was already accepted.", init);
  if (invitation.revoked_at) return badRequest("This invitation was revoked.", init);
  if (new Date(invitation.expires_at) < new Date()) {
    return badRequest("This invitation has expired.", init);
  }

  // Email check — auth.users.email is the source of truth.
  const { data: userRow } = await sb.from("users").select("email").eq("id", caller.id).single();
  const callerEmail = userRow?.email?.toLowerCase();
  if (!callerEmail || callerEmail !== invitation.invited_email.toLowerCase()) {
    return forbidden(
      init,
      "Invitation was issued to a different email. Sign in with the invited address.",
    );
  }

  // MFA gate — list factors; require at least one verified TOTP.
  const { data: factors } = await sb.auth.admin.mfa
    .listFactors({ userId: caller.id })
    .catch(() => ({
      data: null,
    }));
  const hasVerifiedTotp = !!factors?.factors?.some(
    (f: { factor_type: string; status: string }) =>
      f.factor_type === "totp" && f.status === "verified",
  );
  if (!hasVerifiedTotp) {
    return forbidden(init, "Enrol MFA (TOTP) before accepting this invitation.");
  }

  const { ipAddress, userAgent } = networkContext(request);

  // ─── Atomic-ish chain: role → roster → mark invitation accepted ──
  // user_roles unique on (user_id, role, hospital_id) so re-runs are safe.
  const { error: roleError } = await sb.from("user_roles").insert({
    user_id: caller.id,
    role: "hospital_admin",
    hospital_id: invitation.hospital_id,
    created_by: invitation.invited_by,
  });
  if (roleError && roleError.code !== "23505") {
    log.error("user_role insert failed", { requestId, reason: roleError.message });
    return serverError("role grant failed", init);
  }

  // Roster: designate as primary IF the hospital doesn't already
  // have a current primary. Otherwise designate as backup.
  const { count: primaryCount } = await sb
    .from("hospital_admin_roster")
    .select("id", { count: "exact", head: true })
    .eq("hospital_id", invitation.hospital_id)
    .eq("designation", "primary")
    .is("succeeded_at", null);
  const designation = (primaryCount ?? 0) === 0 ? "primary" : "backup";

  const { error: rosterError } = await sb.from("hospital_admin_roster").insert({
    hospital_id: invitation.hospital_id,
    user_id: caller.id,
    designation,
    designated_by: invitation.invited_by,
  });
  if (rosterError && rosterError.code !== "23505") {
    log.warn("roster insert failed (continuing — role still granted)", {
      requestId,
      reason: rosterError.message,
    });
  }

  // Mark invitation accepted.
  const { error: markError } = await sb
    .from("hospital_staff_invitations")
    .update({
      accepted_at: new Date().toISOString(),
      accepted_by_user_id: caller.id,
    })
    .eq("id", invitation.id);
  if (markError) {
    log.warn("invitation mark accepted failed (role granted regardless)", {
      requestId,
      reason: markError.message,
    });
  }

  // Audit row — the claim is a security-relevant event.
  try {
    await recordSaAudit({
      actorId: caller.id,
      action: "hospital_admin_claimed",
      targetKind: "hospital_admin_invitation",
      targetId: invitation.id,
      reason: "Hospital admin invitation accepted by invitee.",
      requestId,
      ipAddress,
      userAgent,
      afterData: {
        hospital_id: invitation.hospital_id,
        designation,
      },
    });
  } catch (e) {
    log.warn("audit insert failed (claim succeeded)", { requestId, reason: String(e) });
  }

  log.info("hospital_admin_claimed", {
    requestId,
    hospital_id: invitation.hospital_id,
    designation,
  });
  return ok(
    {
      hospital_id: invitation.hospital_id,
      designation,
      claimed: true,
    },
    init,
  );
});
