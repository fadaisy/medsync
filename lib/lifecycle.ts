/**
 * Lifecycle state transitions — server-side mutator with audit.
 *
 * The Postgres `public.lifecycle_state` enum (migration 0008) is the
 * source of truth for valid states. `canTransition()` checks the TS
 * union (db/schema/lifecycle.ts) against the same transition table.
 *
 * For real state transitions (not just reads), always go through
 * `transitionUserState()` / `transitionAffiliationState()` so:
 *   1. The from→to is checked against the validity table.
 *   2. The Phase 0.6 audit trigger captures the change.
 *   3. PII-redacted log line records who initiated it + reason.
 *
 * NEVER mutate state columns from a route handler or server action
 * directly — always through these wrappers.
 */

import "server-only";

import type { LifecycleState } from "@/db/schema/lifecycle";

import { canTransition } from "@/db/schema/lifecycle";
import { createServiceClient } from "@/lib/supabase/service";

export { canTransition, LIFECYCLE_STATES, LIFECYCLE_TRANSITIONS } from "@/db/schema/lifecycle";
export type { LifecycleState } from "@/db/schema/lifecycle";

interface TransitionResult {
  ok: boolean;
  from?: LifecycleState;
  to?: LifecycleState;
  reason?: string;
  error?: string;
}

/**
 * Transition a user's `state` column. Returns the prior + new state on
 * success, or an error string. The Phase 0.6 audit trigger fires on
 * the UPDATE so we don't write an explicit audit row here.
 *
 * Caller must be service-role (Edge Function or admin tool).
 */
export async function transitionUserState({
  userId,
  to,
  reason,
}: {
  userId: string;
  to: LifecycleState;
  reason?: string;
}): Promise<TransitionResult> {
  const sb = createServiceClient();
  const { data: current, error: fetchErr } = await sb
    .from("users")
    .select("state")
    .eq("id", userId)
    .single<{ state: LifecycleState }>();

  if (fetchErr || !current) {
    return { ok: false, error: `user not found: ${fetchErr?.message ?? "unknown"}` };
  }
  if (!canTransition(current.state, to)) {
    return {
      ok: false,
      from: current.state,
      to,
      error: `invalid transition: ${current.state} → ${to}`,
    };
  }
  const { error: updateErr } = await sb
    .from("users")
    .update({ state: to, updated_at: new Date().toISOString() })
    .eq("id", userId);
  if (updateErr) return { ok: false, error: updateErr.message };
  return { ok: true, from: current.state, to, reason };
}

/**
 * Transition a staff_affiliations row. Same contract as user state.
 */
export async function transitionAffiliationState({
  affiliationId,
  to,
  reason,
  approvedBy,
}: {
  affiliationId: string;
  to: LifecycleState;
  reason?: string;
  approvedBy?: string;
}): Promise<TransitionResult> {
  const sb = createServiceClient();
  const { data: current, error: fetchErr } = await sb
    .from("staff_affiliations")
    .select("state")
    .eq("id", affiliationId)
    .single<{ state: LifecycleState }>();

  if (fetchErr || !current) {
    return { ok: false, error: `affiliation not found: ${fetchErr?.message ?? "unknown"}` };
  }
  if (!canTransition(current.state, to)) {
    return {
      ok: false,
      from: current.state,
      to,
      error: `invalid transition: ${current.state} → ${to}`,
    };
  }
  const patch: Record<string, unknown> = {
    state: to,
    updated_at: new Date().toISOString(),
  };
  if (to === "rejected" && reason) patch.rejection_reason = reason;
  if (to === "approved" || to === "active") {
    patch.approved_at = new Date().toISOString();
    if (approvedBy) patch.approved_by = approvedBy;
  }
  const { error: updateErr } = await sb
    .from("staff_affiliations")
    .update(patch)
    .eq("id", affiliationId);
  if (updateErr) return { ok: false, error: updateErr.message };
  return { ok: true, from: current.state, to, reason };
}
