import { serviceClient } from "./auth.ts";

/**
 * Four-eyes wiring (kickoff section 5).
 *
 * Catastrophic actions opt in via `requiresSecondApproval()` rather
 * than bespoke logic. The helper:
 *
 *   1. Counts real superadmins (excluding leaked `*@medsync.local`
 *      RLS-test fixtures — belt-and-suspenders on top of the
 *      migration 0019 cleanup).
 *   2. With one real superadmin: inserts an `sa_pending_approvals`
 *      row in `auto_satisfied` state immediately + returns
 *      `{ proceed: true, pendingId }`. The caller executes the
 *      action and then updates the row to `executed`.
 *   3. With ≥2: inserts in `pending_second_approval` state, returns
 *      `{ proceed: false, pendingId }`. The caller responds 202 to
 *      the UI; a *different* superadmin must call `sa-confirm-action`
 *      to transition the row and have the action executed.
 *
 * Either way, the request is in `sa_pending_approvals` immediately
 * — so the audit trail shows that four-eyes was attempted even when
 * it auto-satisfied.
 */
export type FourEyesAction =
  | "deactivate_tenant"
  | "suspend_tenant"
  | "deactivate_superadmin"
  | "demote_superadmin"
  | "bulk_export"
  | "edit_permission_mapping"
  | "delete_reference_data";

export type FourEyesTargetKind =
  | "hospital"
  | "user"
  | "role_permission"
  | "reference_data"
  | "export";

export interface RequestFourEyesArgs {
  action: FourEyesAction;
  targetKind: FourEyesTargetKind;
  targetId: string;
  /** Free-text justification ≥ 8 chars (DB CHECK enforces this too). */
  justification: string;
  /** Action-specific parameters; consumed by the executor at execute-time. */
  payload?: Record<string, unknown>;
  /** The requesting superadmin's user id. */
  requestedBy: string;
}

export interface RequestFourEyesResult {
  pendingId: string;
  proceed: boolean;
  /** True when the system auto-satisfied because only 1 real superadmin exists. */
  autoSatisfied: boolean;
  realSuperadminCount: number;
}

/**
 * Count the number of *real* superadmins. Test fixtures with the
 * `@medsync.local` email domain are excluded so a leaked Phase 0
 * fixture row cannot accidentally enable four-eyes enforcement and
 * lock the only real superadmin out of catastrophic actions.
 */
export async function countRealSuperadmins(): Promise<number> {
  const sb = serviceClient();
  const { data, error } = await sb
    .from("user_roles")
    .select("user_id, users:users!inner(email)")
    .eq("role", "superadmin");
  if (error) throw new Error(`countRealSuperadmins: ${error.message}`);
  // Drizzle-style join through PostgREST returns nested user data.
  // Filter out fixture emails on the application side so the SQL stays
  // simple and the rule is unmistakable in the code.
  const real = (data ?? []).filter((row) => {
    // PostgREST returns the joined row as an object (or array of one).
    const user = Array.isArray(row.users) ? row.users[0] : row.users;
    const email = user?.email ?? "";
    return !email.toLowerCase().endsWith("@medsync.local");
  });
  return real.length;
}

/**
 * Insert the pending-approval row and return the four-eyes verdict.
 * Caller responsibilities AFTER calling this:
 *   - If `proceed: true`: execute the action, then call
 *     `markFourEyesExecuted(pendingId)` (or `markFourEyesFailed`).
 *   - If `proceed: false`: stop and respond to the caller with the
 *     `pendingId` so the UI can show "awaiting second approval".
 */
export async function requestFourEyes(args: RequestFourEyesArgs): Promise<RequestFourEyesResult> {
  const realCount = await countRealSuperadmins();
  const autoSatisfied = realCount < 2;
  const sb = serviceClient();
  const { data, error } = await sb
    .from("sa_pending_approvals")
    .insert({
      action: args.action,
      target_kind: args.targetKind,
      target_id: args.targetId,
      justification: args.justification,
      payload: args.payload ?? {},
      requested_by: args.requestedBy,
      state: autoSatisfied ? "auto_satisfied" : "pending_second_approval",
      // auto_satisfied rows get executed_at when the caller marks them done.
    })
    .select("id")
    .single();
  if (error || !data) {
    throw new Error(`requestFourEyes insert failed: ${error?.message}`);
  }
  return {
    pendingId: data.id,
    proceed: autoSatisfied,
    autoSatisfied,
    realSuperadminCount: realCount,
  };
}

/**
 * Stamp a pending approval row as executed. Call after the action's
 * actual side effect lands.
 */
export async function markFourEyesExecuted(pendingId: string): Promise<void> {
  const sb = serviceClient();
  const { error } = await sb
    .from("sa_pending_approvals")
    .update({ state: "executed", executed_at: new Date().toISOString() })
    .eq("id", pendingId);
  if (error) throw new Error(`markFourEyesExecuted: ${error.message}`);
}

/** Stamp a pending approval row with an execution error (state stays auto_satisfied/approved-but-failed shows up as execution_error set). */
export async function markFourEyesFailed(pendingId: string, errorMessage: string): Promise<void> {
  const sb = serviceClient();
  await sb
    .from("sa_pending_approvals")
    .update({ execution_error: errorMessage })
    .eq("id", pendingId);
}

/**
 * Fetch a pending approval row + sanity-check the caller IS NOT the
 * original requester (two-eyes enforcement at the application layer
 * on top of the DB CHECK). Returns the row when safe to confirm.
 */
export async function loadPendingForConfirm(
  pendingId: string,
  callerId: string,
): Promise<
  | {
      ok: true;
      row: {
        id: string;
        action: FourEyesAction;
        target_kind: FourEyesTargetKind;
        target_id: string;
        payload: Record<string, unknown>;
        requested_by: string;
        state: string;
      };
    }
  | { ok: false; reason: "not_found" | "wrong_state" | "same_actor" }
> {
  const sb = serviceClient();
  const { data, error } = await sb
    .from("sa_pending_approvals")
    .select("id, action, target_kind, target_id, payload, requested_by, state")
    .eq("id", pendingId)
    .single();
  if (error || !data) return { ok: false, reason: "not_found" };
  if (data.state !== "pending_second_approval") return { ok: false, reason: "wrong_state" };
  if (data.requested_by === callerId) return { ok: false, reason: "same_actor" };
  return {
    ok: true,
    row: data as {
      id: string;
      action: FourEyesAction;
      target_kind: FourEyesTargetKind;
      target_id: string;
      payload: Record<string, unknown>;
      requested_by: string;
      state: string;
    },
  };
}

/** Stamp a row with the confirming superadmin's id, ready for executor dispatch. */
export async function markFourEyesConfirmed(
  pendingId: string,
  confirmingActorId: string,
): Promise<void> {
  const sb = serviceClient();
  const { error } = await sb
    .from("sa_pending_approvals")
    .update({
      approved_by: confirmingActorId,
      approved_at: new Date().toISOString(),
    })
    .eq("id", pendingId);
  if (error) throw new Error(`markFourEyesConfirmed: ${error.message}`);
}
