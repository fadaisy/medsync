import type { LabPermission } from "./access";
import type { NavItem } from "@/lib/workspace-access/nav";

import { navFor as navItemsFor } from "@/lib/workspace-access/nav";

/**
 * The lab workspace navigation (Lab Phase 0, NV-1..NV-3). The sidebar renders only what is
 * registered here and visible to the viewer; a page that does not exist is never listed, and
 * nothing is shown as "soon". Later phases register Criticals, Downtime entry, Set-up, QC and
 * Reports when their pages ship.
 */

export type LabNavId = "worklist" | "released" | "rejected";

export type LabNavItem = NavItem<LabNavId, LabPermission>;

const view = (p: ReadonlySet<LabPermission>) => p.has("lab.view");

export const LAB_NAV: readonly LabNavItem[] = [
  { id: "worklist", label: "Worklist", href: "/lab", order: 1, exact: true, visibleFor: view },
  {
    id: "released",
    label: "Released today",
    href: "/lab/released",
    order: 2,
    exact: false,
    visibleFor: view,
  },
  {
    id: "rejected",
    label: "Rejected",
    href: "/lab/rejected",
    order: 3,
    exact: false,
    visibleFor: view,
  },
];

export function navFor(permissions: ReadonlySet<LabPermission>): LabNavItem[] {
  return navItemsFor(LAB_NAV, permissions);
}
