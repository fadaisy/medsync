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
  adminCount: number;
  createdAtIso: string;
}
