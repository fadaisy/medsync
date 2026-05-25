/**
 * sa-create-hospital — superadmin-initiated hospital creation (GATE E).
 *
 * Per kickoff §G + ADR 0018:
 *   - Superadmin creates the TENANT (state='provisioning'), not a working admin.
 *   - Verification friction relaxes (no facility licence / authority letter required).
 *   - The AGREEMENT GATE does not relax — an offline-signed DPA is recorded
 *     in hospital_agreements with source='superadmin_offline' and a required
 *     offline_evidence_path.
 *   - A real-person hospital_admin invitation is queued in hospital_staff_invitations.
 *     The superadmin NEVER takes the admin role themselves.
 *
 * Atomic-ish flow (rollback chain on failure):
 *   1. sa_audit_log (FIRST so a partial failure still records intent)
 *   2. hospitals (state='provisioning')
 *   3. hospital_agreements (source='superadmin_offline')
 *   4. hospital_staff_invitations (for the hospital_admin)
 *
 * Returns the invitation token (plaintext) for the superadmin to share
 * out-of-band with the real hospital admin. Email delivery is a GATE F
 * polish item; for now the superadmin manually communicates the URL.
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
import { makeLogger } from "../_shared/logger.ts";
import { networkContext, recordSaAudit } from "../_shared/sa-audit.ts";

const log = makeLogger("sa-create-hospital");

const InputSchema = z.object({
  hospital_name: z.string().min(1).max(160),
  facility_level: z.enum([
    "hc_ii",
    "hc_iii",
    "hc_iv",
    "general",
    "regional_referral",
    "national_referral",
    "private",
    "other",
  ]),
  // Offline-agreement evidence — required by hospital_agreements_superadmin_evidence CHECK.
  offline_evidence_path: z
    .string()
    .min(1, "Path to the offline-signed agreement is required.")
    .max(500),
  // The signatory the offline agreement names (recorded for the audit trail).
  signatory_name: z.string().min(1).max(120),
  signatory_title: z.string().min(1).max(80),
  // The real hospital admin who will claim the role.
  invitee_email: z.string().email(),
  invitee_name: z.string().max(120).optional(),
  // Superadmin's note — required + loud per kickoff §G (record who + why).
  reason: z
    .string()
    .min(8, "Reason ≥ 8 chars required (record offline provenance + who authorised this)."),
});

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

const FACILITY_LEVEL_MAP: Record<string, string> = {
  hc_ii: "hc3",
  hc_iii: "hc3",
  hc_iv: "hc4",
  general: "district",
  regional_referral: "regional",
  national_referral: "national_referral",
  private: "private",
  other: "private",
};

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
  const input = parsed.data;

  const caller = await getCaller(request);
  if (!caller) return unauthorized(init);
  if (!(await hasRole(caller.id, "superadmin"))) return forbidden(init, "superadmin required");

  const sb = serviceClient();

  // Get the current DPA version to anchor the offline agreement.
  const { data: dpa } = await sb
    .from("hospital_dpa_versions")
    .select("id, version")
    .order("effective_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!dpa) {
    return serverError("No DPA version on file; cannot record offline agreement.", init);
  }

  // Reserve a unique slug.
  const baseSlug = slugify(input.hospital_name) || "hospital";
  let slug = baseSlug;
  let attempt = 0;
  while (attempt < 10) {
    const { data: existing } = await sb
      .from("hospitals")
      .select("id")
      .eq("slug", slug)
      .maybeSingle();
    if (!existing) break;
    attempt += 1;
    slug = `${baseSlug}-${attempt + 1}`;
  }
  if (attempt >= 10) {
    return serverError("could not allocate a unique slug; pick a different hospital name", init);
  }

  const { ipAddress, userAgent } = networkContext(request);

  // ─── 1. Audit FIRST ───────────────────────────────────────────────
  try {
    await recordSaAudit({
      actorId: caller.id,
      action: "sa_create_hospital",
      targetKind: "hospital",
      targetId: slug, // placeholder until row exists; audit chain rebound below
      reason: input.reason,
      requestId,
      ipAddress,
      userAgent,
      afterData: {
        slug,
        facility_level: input.facility_level,
        dpa_version: dpa.version,
        invitee_email: input.invitee_email,
      },
    });
  } catch (e) {
    log.error("audit insert failed; aborting", { requestId, reason: String(e) });
    return serverError("audit write failed", init);
  }

  // ─── 2. Create hospital in `provisioning` ─────────────────────────
  const { data: hospitalRow, error: hospitalError } = await sb
    .from("hospitals")
    .insert({
      name: input.hospital_name,
      slug,
      level: FACILITY_LEVEL_MAP[input.facility_level] ?? "private",
      state: "provisioning",
    })
    .select("id")
    .single();
  if (hospitalError || !hospitalRow) {
    log.error("hospital insert failed", { requestId, reason: hospitalError?.message });
    return serverError("hospital create failed", init);
  }

  // ─── 3. Record the offline agreement ──────────────────────────────
  // signed_by_user_id is the superadmin (the platform-side party
  // confirming receipt of the signed PDF). The signatory name + title
  // describe the hospital-side human who signed offline.
  const { error: agreementError } = await sb.from("hospital_agreements").insert({
    hospital_id: hospitalRow.id,
    dpa_version_id: dpa.id,
    signed_by_user_id: caller.id,
    signatory_name: input.signatory_name,
    signatory_title: input.signatory_title,
    source: "superadmin_offline",
    offline_evidence_path: input.offline_evidence_path,
  });
  if (agreementError) {
    await sb.from("hospitals").delete().eq("id", hospitalRow.id);
    log.error("agreement insert failed; rolled back hospital", {
      requestId,
      reason: agreementError.message,
    });
    return serverError("agreement insert failed", init);
  }

  // ─── 4. Queue the hospital_admin invitation ───────────────────────
  // Plaintext token returned in the response so the superadmin can
  // share the URL out-of-band. We store only the hash.
  const plaintextToken = crypto.randomUUID() + "-" + crypto.randomUUID();
  const tokenHash = await sha256Hex(plaintextToken);

  const { data: invitationRow, error: invitationError } = await sb
    .from("hospital_staff_invitations")
    .insert({
      hospital_id: hospitalRow.id,
      invited_email: input.invitee_email.toLowerCase(),
      invited_name: input.invitee_name ?? null,
      invitation_token_hash: tokenHash,
      invited_by: caller.id,
      source: "individual",
      // No invited_role_id — the accept Edge Function infers
      // hospital_admin from the application of this invite (it's the
      // first invite per hospital after creation). A separate field
      // could carry the role explicitly in a future iteration; for
      // now the convention "first invite = hospital_admin" is encoded
      // in accept-hospital-admin-invitation.
    })
    .select("id")
    .single();
  if (invitationError || !invitationRow) {
    await sb.from("hospital_agreements").delete().eq("hospital_id", hospitalRow.id);
    await sb.from("hospitals").delete().eq("id", hospitalRow.id);
    log.error("invitation insert failed; rolled back", {
      requestId,
      reason: invitationError?.message,
    });
    return serverError("invitation insert failed", init);
  }

  // Second audit entry naming the invitation specifically.
  try {
    await recordSaAudit({
      actorId: caller.id,
      action: "sa_invite_hospital_admin",
      targetKind: "hospital_admin_invitation",
      targetId: invitationRow.id,
      reason: input.reason,
      requestId,
      ipAddress,
      userAgent,
      afterData: {
        hospital_id: hospitalRow.id,
        invitee_email: input.invitee_email,
      },
    });
  } catch (e) {
    log.warn("second audit insert failed (continuing)", { requestId, reason: String(e) });
  }

  log.info("hospital created via superadmin path", {
    requestId,
    hospital_id: hospitalRow.id,
    slug,
    invitation_id: invitationRow.id,
  });
  return ok(
    {
      hospital_id: hospitalRow.id,
      hospital_slug: slug,
      hospital_state: "provisioning",
      invitation_id: invitationRow.id,
      // The plaintext token returned so the superadmin can share
      // /admin/claim-invitation?token=<...> out-of-band until email
      // delivery lands (GATE F). Hash is what's stored.
      invitation_token: plaintextToken,
    },
    init,
  );
});
