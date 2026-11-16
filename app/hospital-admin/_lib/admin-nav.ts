import "server-only";

import type { AdminNavGroup } from "@/lib/hospital-admin/admin-nav";
import { headers } from "next/headers";

import { adminNavGroups } from "@/lib/hospital-admin/admin-nav";
import { isTetherHost } from "@/lib/landing/feature";
import { availabilityCount } from "@/lib/services/data";
import { getHospitalPendingStaffCount } from "./staff-pending-count";

/**
 * The admin menu for this request (ADR 0520): Intake only off the Tether domain, and the two live counts. Both
 * counts are best-effort and fall back to none, so a slow query never blocks the menu.
 */
export async function adminNavFor(
  hospitalId: string,
): Promise<{ tether: boolean; groups: AdminNavGroup[] }> {
  const [h, staffPending, unavailable] = await Promise.all([
    headers(),
    getHospitalPendingStaffCount(hospitalId),
    availabilityCount(hospitalId),
  ]);
  const tether = isTetherHost(h.get("host"));
  return { tether, groups: adminNavGroups({ tether, counts: { staffPending, unavailable } }) };
}
