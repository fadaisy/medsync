import type { LabPermission } from "./access";

/**
 * The lab workspace navigation (Lab Phase 0, NV-1..NV-3). The sidebar renders only what is
 * registered here and visible to the viewer; a page that does not exist is never listed, and
 * nothing is shown as "soon". Lab Phase 1 registers Criticals and the critical-results set-up
 * behind `labCriticals`; Downtime entry, QC and Reports register when their pages ship.
 */

export type LabNavId =
  | "downtime"
  | "setup_limits"
  | "worklist"
  | "criticals"
  | "released"
  | "rejected"
  | "setup_catalogue"
  | "setup_ranges"
  | "setup_criticals";

/** Lab Phase 1 flags the registry needs (§5.10: an item appears only when its flag is on). */
export interface LabNavFlags {
  /** LAB_CRITICALS with its production gate (the Criticals list). */
  criticals: boolean;
  /** LAB_CRITICALS alone: set-up must stay reachable to close the gate's gaps. */
  criticalsSetup?: boolean;
  unitsRanges?: boolean;
  downtime?: boolean;
}

export interface LabNavItem {
  id: LabNavId;
  label: string;
  href: string;
  order: number;
  /** Match the index route exactly, so /lab/released does not light Worklist. */
  exact: boolean;
  /** Set-up items sit under their own group label. */
  group?: "setup";
  visibleFor: (permissions: ReadonlySet<LabPermission>, flags: LabNavFlags) => boolean;
}

const view = (p: ReadonlySet<LabPermission>) => p.has("lab.view");

export const LAB_NAV: readonly LabNavItem[] = [
  { id: "worklist", label: "Worklist", href: "/lab", order: 1, exact: true, visibleFor: view },
  {
    id: "criticals",
    label: "Criticals",
    href: "/lab/criticals",
    order: 1.5,
    exact: false,
    visibleFor: (p, f) => f.criticals && p.has("lab.view"),
  },
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
  {
    id: "downtime",
    label: "Downtime entry",
    href: "/lab/downtime",
    order: 4,
    exact: false,
    visibleFor: (p, f) => !!f.downtime && p.has("lab.result.release"),
  },
  {
    id: "setup_catalogue",
    label: "Test catalogue",
    href: "/lab/setup/catalogue",
    order: 8,
    exact: false,
    group: "setup",
    visibleFor: (p, f) => !!f.unitsRanges && p.has("lab.manage"),
  },
  {
    id: "setup_ranges",
    label: "Reference ranges",
    href: "/lab/setup/ranges",
    order: 9,
    exact: false,
    group: "setup",
    visibleFor: (p, f) => !!f.unitsRanges && p.has("lab.manage"),
  },
  {
    id: "setup_limits",
    label: "Critical limits",
    href: "/lab/setup/limits",
    order: 9.5,
    exact: false,
    group: "setup",
    visibleFor: (p, f) =>
      !!f.unitsRanges && !!(f.criticalsSetup ?? f.criticals) && p.has("lab.manage"),
  },
  {
    id: "setup_criticals",
    label: "Response and contacts",
    href: "/lab/setup/criticals",
    order: 10,
    exact: false,
    group: "setup",
    visibleFor: (p, f) => (f.criticalsSetup ?? f.criticals) && p.has("lab.manage"),
  },
];

export function navFor(
  permissions: ReadonlySet<LabPermission>,
  flags: LabNavFlags = { criticals: false },
): LabNavItem[] {
  return LAB_NAV.filter((i) => i.visibleFor(permissions, flags)).sort((a, b) => a.order - b.order);
}
