/**
 * Shared row type for the Tenants table. Server fetches + normalises;
 * client renders. Only primitives across the boundary.
 */

export interface TenantItem {
  id: string;
  name: string;
  slug: string;
  level: string;
  state: string;
  /**
   * hospitals.emergency_phone — the number the patient emergency block dials
   * (ADR 0084 §3). NULL until a superadmin has dialled one and recorded it;
   * that is the ADR's correct state, and it is also the launch blocker, which
   * is why the list surfaces it rather than the detail panel alone.
   */
  emergencyPhone: string | null;
  adminCount: number;
  createdAtIso: string;
}
