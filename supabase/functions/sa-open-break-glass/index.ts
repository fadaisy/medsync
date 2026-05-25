/**
 * sa-open-break-glass — opens a time-boxed superadmin grant to view
 * one patient's record for a typed-justified purpose.
 *
 * Order is load-bearing:
 *   1. Auth + superadmin check.
 *   2. Zod parse (purpose ≥ 16 chars; minutes 5..60).
 *   3. Look up patient's primary_facility_id (for the hospital_admin
 *      notification).
 *   4. Write `sa_audit_log` with action='break_glass_open'.
 *   5. Insert `sa_break_glass_grants` referencing that audit row.
 *   6. Insert `sa_notifications` for every hospital_admin of the
 *      patient's hospital (best-effort — failure doesn't roll back
 *      the grant; the audit + grant remain the system of record).
 *   7. Respond with the grant id + expiry.
 *
 * Per kickoff section 4 this is the only legitimate path to surface
 * decrypted PHI from the workspace. Real PHI decryption gating
 * against this table lands with the PHI phase (see ADR-break-glass).
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
import { networkContext } from "../_shared/sa-audit.ts";

const log = makeLogger("sa-open-break-glass");

const InputSchema = z.object({
  patient_id: z.string().uuid(),
  purpose: z
    .string()
    .min(16, "Purpose must be ≥ 16 characters (this opens patient PHI — be specific)."),
  category: z.enum([
    "emergency",
    "regulator_request",
    "safety_review",
    "research_per_pdc",
    "other",
  ]),
  minutes: z.number().int().min(5).max(60).default(15),
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
  if (!(await hasRole(caller.id, "superadmin"))) return forbidden(init, "superadmin required");

  const sb = serviceClient();

  // Resolve the patient's hospital for the notification recipient list.
  // patient_profiles.primary_facility_id may be null (patient hasn't
  // chosen one yet) — in that case we still grant + audit, just skip
  // the notification (no hospital admin to notify).
  const { data: profile } = await sb
    .from("patient_profiles")
    .select("primary_facility_id")
    .eq("id", input.patient_id)
    .maybeSingle();
  const hospitalId = profile?.primary_facility_id ?? null;

  // Compute expiry on the server (NOT trusting client timestamps).
  const expiresAtIso = new Date(Date.now() + input.minutes * 60_000).toISOString();
  const { ipAddress, userAgent } = networkContext(request);

  // Step 1: write the loudest sa_audit_log row FIRST so a downstream
  // grant-insert failure can't leave us with PHI access without an
  // audit trail. The grant row carries the audit id as a hard FK.
  let auditId: number;
  try {
    auditId = await recordSaAuditReturningId({
      actorId: caller.id,
      action: "break_glass_open",
      targetKind: "patient_profile",
      targetId: input.patient_id,
      reason: input.purpose,
      requestId,
      ipAddress,
      userAgent,
      afterData: {
        category: input.category,
        expires_at: expiresAtIso,
        hospital_id: hospitalId,
      },
    });
  } catch (e) {
    log.error("sa_audit insert failed; aborting open", { requestId, reason: String(e) });
    return serverError("audit write failed", init);
  }

  // Step 2: insert the grant. If this fails the audit row stays
  // (good — captures the attempt) but no PHI access opens.
  const { data: grant, error: grantError } = await sb
    .from("sa_break_glass_grants")
    .insert({
      actor_id: caller.id,
      patient_id: input.patient_id,
      purpose: input.purpose,
      category: input.category,
      expires_at: expiresAtIso,
      hospital_id: hospitalId,
      sa_audit_log_id: auditId,
    })
    .select("id, granted_at, expires_at")
    .single();
  if (grantError || !grant) {
    log.error("grant insert failed", { requestId, reason: grantError?.message });
    return serverError("grant insert failed", init);
  }

  // Step 3: notify the hospital admin(s) of the affected hospital.
  // Best-effort — the grant + audit are the source of truth.
  if (hospitalId) {
    const { data: admins } = await sb
      .from("user_roles")
      .select("user_id")
      .eq("role", "hospital_admin")
      .eq("hospital_id", hospitalId);
    if (admins && admins.length > 0) {
      const notificationRows = admins.map((a) => ({
        recipient_user_id: a.user_id,
        kind: "break_glass_access",
        subject: "Platform-level access to a patient record at your hospital",
        body:
          `A platform superadmin opened a time-boxed grant (${input.category}) to view ` +
          `one of your hospital's patient records. The grant expires at ${expiresAtIso} ` +
          `(${input.minutes} minutes). This event is recorded in the audit log and ` +
          `visible to your hospital admins as required by the platform's transparency policy.`,
        related_kind: "break_glass_grant",
        related_id: grant.id,
      }));
      const { error: notifyErr } = await sb.from("sa_notifications").insert(notificationRows);
      if (notifyErr) {
        log.warn("notification insert failed (non-fatal)", { reason: notifyErr.message });
      } else {
        await sb
          .from("sa_break_glass_grants")
          .update({ notified_at: new Date().toISOString() })
          .eq("id", grant.id);
      }
    }
  }

  log.info("break-glass opened", {
    requestId,
    grant_id: grant.id,
    patient_id: input.patient_id,
    minutes: input.minutes,
    hospital_id: hospitalId,
  });
  return ok(
    { grant_id: grant.id, granted_at: grant.granted_at, expires_at: grant.expires_at },
    init,
  );
});

/**
 * Like `recordSaAudit` but returns the inserted row id so the grant
 * row can FK-reference it. Wraps the existing helper's logic so we
 * don't duplicate the row-shape.
 */
async function recordSaAuditReturningId(params: {
  actorId: string;
  action: string;
  targetKind: string;
  targetId: string;
  reason: string;
  requestId?: string;
  ipAddress?: string | null;
  userAgent?: string | null;
  beforeData?: Record<string, unknown> | null;
  afterData?: Record<string, unknown> | null;
}): Promise<number> {
  const sb = serviceClient();
  const { data, error } = await sb
    .from("sa_audit_log")
    .insert({
      actor_id: params.actorId,
      action: params.action,
      target_kind: params.targetKind,
      target_id: params.targetId,
      reason: params.reason,
      request_id: params.requestId ?? null,
      ip_address: params.ipAddress ?? null,
      user_agent: params.userAgent ?? null,
      before_data: params.beforeData ?? null,
      after_data: params.afterData ?? null,
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(`sa_audit insert: ${error?.message}`);
  return data.id as number;
}
