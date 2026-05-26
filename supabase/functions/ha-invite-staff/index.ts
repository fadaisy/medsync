/**
 * ha-invite-staff — single or bulk staff invitations.
 *
 * The admin enters one or many invitee emails; each gets a row in
 * `public.hospital_staff_invitations` with a SHA-256-hashed token.
 * The plaintext token is returned ONCE in the response so the admin
 * can hand each invitee a claim URL like:
 *
 *   /signup/clinical?invite=<plaintext-token>
 *
 * SMS delivery is not yet wired (no Africa's Talking integration in
 * the platform). The admin is responsible for getting the URL to the
 * invitee — email out-of-band, paste into WhatsApp, whatever works.
 * The hashed token in the DB means stealing the row doesn't grant
 * access; only the plaintext (which lives in the response payload)
 * does.
 *
 * Invitations are advisory: the invitee still completes the full
 * clinical signup + council-anchored verification. The token's role
 * is to pre-fill (and to mark "this person was expected").
 *
 * source = 'individual' when invites.length === 1, else 'bulk'.
 * The CHECK constraint on hospital_staff_invitations.source accepts
 * both.
 *
 * Audited as `invite_staff` with target_kind `staff_invitation` — one
 * audit row per invitation (so a bulk send writes N rows; you can
 * count, search, and revoke each).
 */

import { z } from "npm:zod@4.4.3";

import { getCaller, hasRole, serviceClient } from "../_shared/auth.ts";
import { preflight } from "../_shared/cors.ts";
import {
  badRequest,
  forbidden,
  methodNotAllowed,
  ok,
  serverError,
  unauthorized,
} from "../_shared/errors.ts";
import { requireHospitalAdminScope } from "../_shared/hospital-admin-scope.ts";
import { makeLogger } from "../_shared/logger.ts";
import { networkContext, recordSaAudit } from "../_shared/sa-audit.ts";

const log = makeLogger("ha-invite-staff");

const InviteSchema = z.object({
  email: z.string().email("Each entry must be a valid email."),
  name: z.string().max(120).optional(),
  council_number: z.string().max(60).optional(),
  role_id: z.string().uuid().optional(),
});

const InputSchema = z.object({
  hospital_id: z.string().uuid(),
  invites: z.array(InviteSchema).min(1, "At least one invitee required.").max(100),
  reason: z.string().min(8, "Reason ≥ 8 chars required (audited)."),
});

interface IssuedInvitation {
  id: string;
  email: string;
  claim_token: string;
  claim_url: string;
  expires_at: string;
}

async function sha256Hex(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const hashBuffer = await crypto.subtle.digest("SHA-256", encoder.encode(text));
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

function newToken(): string {
  // 32 bytes = 256 bits of entropy, base64url-encoded ⇒ ~43 chars,
  // URL-safe, no padding.
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function claimUrl(origin: string | null, token: string): string {
  const base = origin && /^https?:\/\//.test(origin) ? origin : "https://medsync.health";
  return `${base}/signup/clinical?invite=${encodeURIComponent(token)}`;
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

  const isSuperadmin = await hasRole(caller.id, "superadmin");
  if (!isSuperadmin) {
    if (!(await hasRole(caller.id, "hospital_admin", input.hospital_id))) {
      return forbidden(init, "hospital_admin required for this hospital");
    }
    const scope = await requireHospitalAdminScope(caller.id, input.hospital_id);
    if (!scope.ok) return forbidden(init, scope.reason);
  }

  const sb = serviceClient();
  const source = input.invites.length === 1 ? "individual" : "bulk";
  const issued: IssuedInvitation[] = [];
  const { ipAddress, userAgent } = networkContext(request);

  for (const invite of input.invites) {
    const token = newToken();
    const tokenHash = await sha256Hex(token);

    const { data: row, error: insertError } = await sb
      .from("hospital_staff_invitations")
      .insert({
        hospital_id: input.hospital_id,
        invited_email: invite.email.toLowerCase(),
        invited_name: invite.name ?? null,
        invited_council_number: invite.council_number ?? null,
        invited_role_id: invite.role_id ?? null,
        invitation_token_hash: tokenHash,
        invited_by: caller.id,
        source,
      })
      .select("id, expires_at")
      .single();

    if (insertError || !row) {
      log.warn("invitation insert failed (continuing)", {
        requestId,
        email: invite.email,
        reason: insertError?.message,
      });
      continue;
    }

    issued.push({
      id: row.id,
      email: invite.email,
      claim_token: token,
      claim_url: claimUrl(origin, token),
      expires_at: row.expires_at,
    });

    try {
      await recordSaAudit({
        actorId: caller.id,
        action: "invite_staff",
        targetKind: "staff_invitation",
        targetId: row.id,
        reason: input.reason,
        requestId,
        ipAddress,
        userAgent,
        beforeData: null,
        afterData: { email: invite.email, source },
      });
    } catch (e) {
      log.warn("sa_audit failed (invitation already written)", {
        requestId,
        invitation_id: row.id,
        reason: String(e),
      });
    }
  }

  if (issued.length === 0) {
    return serverError("no invitations could be created", init);
  }

  log.info("invitations issued", {
    requestId,
    hospital_id: input.hospital_id,
    issued: issued.length,
    attempted: input.invites.length,
    source,
  });
  return ok({ invitations: issued, source }, init);
});
