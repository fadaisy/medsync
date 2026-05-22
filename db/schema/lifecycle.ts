/**
 * Lifecycle state machine — applies to users, staff_affiliations, and
 * (in GATE E) hospital_applications.
 *
 *   unverified → verified
 *   verified → active                                (patients)
 *   verified → pending_approval → approved → active  (staff, hospitals)
 *
 * Side branches from any in-flight state: rejected · suspended · deactivated.
 *
 * The Postgres enum lives in migration 0008. This file holds the TS-side
 * union + transition-validity table.
 */

export const LIFECYCLE_STATES = [
  "unverified",
  "verified",
  "pending_approval",
  "approved",
  "active",
  "rejected",
  "suspended",
  "deactivated",
] as const;

export type LifecycleState = (typeof LIFECYCLE_STATES)[number];

/**
 * Valid forward transitions (from → set of allowed to-states).
 * Service-role only (via Edge Functions + audit). Never expose to the
 * client without going through a typed mutation.
 */
export const LIFECYCLE_TRANSITIONS: Readonly<
  Record<LifecycleState, ReadonlyArray<LifecycleState>>
> = {
  unverified: ["verified", "deactivated"],
  verified: ["active", "pending_approval", "deactivated"],
  pending_approval: ["approved", "rejected", "deactivated"],
  approved: ["active", "suspended", "deactivated"],
  active: ["suspended", "deactivated"],
  rejected: ["pending_approval", "deactivated"],
  suspended: ["active", "deactivated"],
  deactivated: [],
};

export function canTransition(from: LifecycleState, to: LifecycleState): boolean {
  return LIFECYCLE_TRANSITIONS[from].includes(to);
}
