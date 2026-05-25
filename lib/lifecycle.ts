/**
 * Lifecycle state machine — applies to users, staff_affiliations,
 * and hospital_applications.
 *
 * Original (onboarding GATE A):
 *
 *   unverified → (contact verified) → verified
 *   verified → patients: active
 *            → staff/hospital: pending_approval → approved → active
 *   side states: rejected · suspended · deactivated
 *
 * Hospital-registration-upgrade extension (this iteration):
 *
 *   hospital_applications now goes through a richer machine:
 *     pending_approval (alias 'applied') → under_review → verified
 *       → agreement_signed → provisioning → active
 *
 *   …plus the side states `offboarded` and `agreement_expired`.
 *
 * The enum is shared across row types; the transition table is
 * permissive enough to cover every legitimate path. Callers always
 * have row-context (it's a hospital, not a patient) and only invoke
 * `canTransition(currentState, requestedState)` — the structural check
 * is "is this edge in the graph at all?", not "is it valid for this
 * specific row type?". Row-specific guards (e.g. agreement-gate)
 * remain in the Edge Functions.
 */

export const LIFECYCLE_STATES = [
  // Original
  "unverified",
  "verified",
  "pending_approval",
  "approved",
  "active",
  "rejected",
  "suspended",
  "deactivated",
  // Hospital-registration-upgrade additions
  "under_review",
  "agreement_signed",
  "provisioning",
  "offboarded",
  "agreement_expired",
] as const;

export type LifecycleState = (typeof LIFECYCLE_STATES)[number];

/**
 * Valid forward transitions. Anything not listed is rejected.
 *
 * Aliases:
 *   - `pending_approval` is the canonical existing value; the
 *     hospital-upgrade spec also names this state `applied`. They are
 *     the same state. New rows continue to use `pending_approval` so
 *     existing data + Edge Functions keep working unchanged.
 *
 * Notes on additions:
 *   - `pending_approval → under_review` is the new institution-level
 *     triage step (a hospital application sits here while the
 *     superadmin gathers callback / document verification).
 *   - `verified → agreement_signed` only fires for hospital
 *     applications. Patients go `verified → active` directly (no
 *     agreement required of a patient). The transition is allowed
 *     globally; the caller picks which one.
 *   - `active → offboarded` is the explicit hospital-leaves-the-
 *     platform terminal state (distinct from operator-driven
 *     `deactivated` and temporary `suspended`).
 *   - `active → agreement_expired` flags a renewal-required state;
 *     the renewal Edge Function (deferred) accepts a new DPA version
 *     and transitions back to `agreement_signed`.
 */
export const LIFECYCLE_TRANSITIONS: Readonly<
  Record<LifecycleState, ReadonlyArray<LifecycleState>>
> = {
  unverified: ["verified", "deactivated"],
  verified: ["active", "pending_approval", "agreement_signed", "deactivated"],
  pending_approval: ["under_review", "approved", "rejected", "deactivated"],
  approved: ["active", "suspended", "deactivated"],
  active: ["suspended", "deactivated", "offboarded", "agreement_expired"],
  rejected: ["pending_approval", "deactivated"],
  suspended: ["active", "deactivated", "offboarded"],
  deactivated: [],
  // Hospital-upgrade additions
  under_review: ["verified", "rejected", "deactivated"],
  agreement_signed: ["provisioning", "suspended", "deactivated", "offboarded"],
  provisioning: ["active", "suspended", "deactivated"],
  offboarded: [],
  agreement_expired: ["agreement_signed", "offboarded", "deactivated"],
} as const;

/** Validate a forward transition against the table above. */
export function canTransition(from: LifecycleState, to: LifecycleState): boolean {
  return LIFECYCLE_TRANSITIONS[from].includes(to);
}

/** States that indicate the holder may use the system. */
export const ACTIVE_STATES: ReadonlySet<LifecycleState> = new Set<LifecycleState>(["active"]);

/** States that block clinical access. Used by the proxy + Edge Function guards. */
export const BLOCKS_CLINICAL: ReadonlySet<LifecycleState> = new Set<LifecycleState>([
  "unverified",
  "verified",
  "pending_approval",
  "rejected",
  "suspended",
  "deactivated",
  "under_review",
  "agreement_signed",
  "provisioning",
  "offboarded",
  "agreement_expired",
]);

/**
 * Hospital-application-specific helpers — narrow the global state set
 * to the ones a hospital application can actually be in. Useful for
 * UI affordances ("show me the agreement-gate banner") and for
 * server-side guards that need to reject transitions belonging to
 * other row types (e.g. patient-only `verified → active`).
 */
export const HOSPITAL_APPLICATION_STATES: ReadonlySet<LifecycleState> = new Set<LifecycleState>([
  "pending_approval", // alias 'applied'
  "under_review",
  "verified",
  "agreement_signed",
  "provisioning",
  "active",
  "rejected",
  "suspended",
  "deactivated",
  "offboarded",
  "agreement_expired",
]);

/**
 * The single state that requires a signed `hospital_agreements` row
 * to exit toward `provisioning`. Surfaced for the Edge Function
 * guard and the UI banner.
 */
export const HOSPITAL_AGREEMENT_GATE_STATE: LifecycleState = "verified";

/** Human-readable label for UI surfaces (kept here so copy stays consistent). */
export function describeState(state: LifecycleState): string {
  switch (state) {
    case "unverified":
      return "Unverified";
    case "verified":
      return "Verified";
    case "pending_approval":
      return "Pending approval";
    case "approved":
      return "Approved";
    case "active":
      return "Active";
    case "rejected":
      return "Rejected";
    case "suspended":
      return "Suspended";
    case "deactivated":
      return "Deactivated";
    case "under_review":
      return "Under review";
    case "agreement_signed":
      return "Agreement signed";
    case "provisioning":
      return "Provisioning";
    case "offboarded":
      return "Offboarded";
    case "agreement_expired":
      return "Agreement expired";
  }
}
