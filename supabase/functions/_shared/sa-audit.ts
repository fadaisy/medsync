import { serviceClient } from "./auth.ts";

/**
 * Insert a row into public.sa_audit_log (GATE F).
 *
 * Use INSIDE Edge Functions that perform god-mode actions or
 * sensitive elevations. The free-text `reason` is required by the
 * CHECK constraint at the DB layer (≥ 8 chars). Best practice:
 *
 *   - actorId         caller.id (from getCaller())
 *   - action          one of the action enum values (see migration 0015)
 *   - targetKind      one of the target_kind enum values
 *   - targetId        the row id of the thing being acted on (string)
 *   - reason          required free-text — pulled from request body so
 *                     the auditor knows WHY this action happened
 *   - requestId       request-correlation id (defaults to x-request-id)
 *   - ip / ua         captured at the Edge Function entry
 *   - before/after    optional snapshots — encode just the changed
 *                     columns to keep size down
 *
 * Never log this from app-server code paths; this table is gated to
 * service-role writes so app-side INSERT would fail on RLS anyway.
 */
/**
 * Allowed action / targetKind values — kept in sync with the
 * sa_audit_log CHECK constraint (currently set by migration 0025).
 * When you add a value here, ALSO add it to the migration; the union
 * is here so typecheck catches typos before they hit the DB.
 */
export type SaAuditAction =
  | "approve_staff_affiliation"
  | "reject_staff_affiliation"
  | "approve_hospital_application"
  | "reject_hospital_application"
  | "cross_tenant_read"
  | "cross_tenant_export"
  | "elevate_admin"
  | "create_superadmin"
  | "demote_admin"
  | "break_glass_open"
  | "break_glass_close"
  | "four_eyes_request"
  | "four_eyes_confirm"
  | "four_eyes_cancel"
  | "activate_hospital"
  | "suspend_user"
  | "reset_user_mfa"
  | "deactivate_user"
  | "reactivate_user"
  | "export_audit_log"
  | "sa_create_hospital"
  | "sa_invite_hospital_admin"
  | "hospital_admin_claimed";

export type SaAuditTargetKind =
  | "staff_affiliation"
  | "hospital_application"
  | "hospital"
  | "user"
  | "patient_profile"
  | "break_glass_grant"
  | "audit_log_export"
  | "hospital_admin_invitation";

export async function recordSaAudit(params: {
  actorId: string;
  action: SaAuditAction;
  targetKind: SaAuditTargetKind;
  targetId: string;
  reason: string;
  requestId?: string;
  ipAddress?: string | null;
  userAgent?: string | null;
  beforeData?: Record<string, unknown> | null;
  afterData?: Record<string, unknown> | null;
}): Promise<void> {
  const sb = serviceClient();
  const { error } = await sb.from("sa_audit_log").insert({
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
  });
  if (error) {
    // sa_audit failure should NOT silently swallow — re-throw so the
    // Edge Function returns a 500 and the caller knows the audit
    // trail didn't land. The action it logged about must NOT be
    // considered committed in that case (Edge Functions should
    // ideally write the audit BEFORE the mutation, or wrap both in
    // a transaction; see specific function bodies).
    throw new Error(`sa_audit insert failed: ${error.message}`);
  }
}

/** Convenience for pulling network metadata off the incoming request. */
export function networkContext(request: Request): {
  ipAddress: string | null;
  userAgent: string | null;
} {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    null;
  return {
    ipAddress: ip,
    userAgent: request.headers.get("user-agent"),
  };
}
