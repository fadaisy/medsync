import type { LabPermission } from "./access";
import type { NavItem } from "@/lib/workspace-access/nav";

import { navFor as navItemsFor } from "@/lib/workspace-access/nav";

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
  | "setup_criticals"
  | "setup_profiles"
  | "setup_drafts"
  | "setup_settings"
  | "to_refer"
  | "setup_menu"
  | "stock"
  | "equipment"
  | "quality"
  | "qc"
  | "nonconformities"
  | "eqa";

/** Lab Phase 1 flags the registry needs (§5.10: an item appears only when its flag is on). */
export interface LabNavFlags {
  /** LAB_CRITICALS with its production gate (the Criticals list). */
  criticals: boolean;
  /** LAB_CRITICALS alone: set-up must stay reachable to close the gate's gaps. */
  criticalsSetup?: boolean;
  unitsRanges?: boolean;
  downtime?: boolean;
  /** Lab Phase 2 (§5.15): labCatalogueV2. */
  catalogueV2?: boolean;
  /** Lab Phase 2 (§5.15): labOneMenu. */
  oneMenu?: boolean;
  /** Lab Phase 2 (§5.14): any flag with a lab setting (catalogue v2, payment, high-risk, bedside). */
  settings?: boolean;
  /** Lab Phase 3 (§5): labStock, labEquipment. */
  stock?: boolean;
  equipment?: boolean;
  /** Lab Phase 3 (§5.1–§5.4, §5.9): labQc. */
  qc?: boolean;
  /** Lab Phase 3 (§5.8): labEqa. */
  eqa?: boolean;
}

export type LabNavItem = NavItem<LabNavId, LabPermission, LabNavFlags>;

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
  // Lab Phase 2 (§5.15): To refer and the test menu (labOneMenu); set-up for catalogue v2.
  {
    id: "to_refer",
    label: "To refer",
    href: "/lab/refer",
    order: 2.5,
    exact: false,
    visibleFor: (p, f) => !!f.oneMenu && p.has("lab.view"),
  },
  {
    id: "setup_menu",
    label: "Test menu",
    href: "/lab/setup/menu",
    order: 7.5,
    exact: false,
    group: "setup",
    visibleFor: (p, f) => !!f.oneMenu && p.has("lab.manage"),
  },
  {
    id: "setup_profiles",
    label: "Analyser profiles",
    href: "/lab/setup/profiles",
    order: 8.5,
    exact: false,
    group: "setup",
    visibleFor: (p, f) => !!f.catalogueV2 && p.has("lab.manage"),
  },
  {
    id: "setup_drafts",
    label: "Research drafts",
    href: "/lab/setup/drafts",
    order: 10.5,
    exact: false,
    group: "setup",
    visibleFor: (p, f) => !!f.catalogueV2 && p.has("lab.manage"),
  },
  {
    id: "setup_settings",
    label: "Lab settings",
    href: "/lab/setup/settings",
    order: 11,
    exact: false,
    group: "setup",
    visibleFor: (p, f) => !!(f.settings ?? f.catalogueV2) && p.has("lab.manage"),
  },
  // Lab Phase 3 (§5): the Quality group, each item behind its flag.
  {
    id: "quality",
    label: "Quality today",
    href: "/lab/quality",
    order: 5.1,
    exact: true,
    group: "quality",
    visibleFor: (p, f) => !!f.qc && p.has("lab.view"),
  },
  {
    id: "qc",
    label: "Quality control",
    href: "/lab/quality/qc",
    order: 5.2,
    exact: false,
    group: "quality",
    visibleFor: (p, f) => !!f.qc && p.has("lab.view"),
  },
  {
    id: "nonconformities",
    label: "Nonconformities",
    href: "/lab/quality/nonconformities",
    order: 5.6,
    exact: false,
    group: "quality",
    visibleFor: (p, f) => (!!f.qc || !!f.eqa) && p.has("lab.view"),
  },
  {
    id: "eqa",
    label: "External quality",
    href: "/lab/quality/eqa",
    order: 5.5,
    exact: false,
    group: "quality",
    visibleFor: (p, f) => !!f.eqa && p.has("lab.view"),
  },
  {
    id: "stock",
    label: "Stock and lots",
    href: "/lab/stock",
    order: 5.3,
    exact: false,
    group: "quality",
    visibleFor: (p, f) => !!f.stock && p.has("lab.view"),
  },
  {
    id: "equipment",
    label: "Equipment",
    href: "/lab/equipment",
    order: 5.4,
    exact: false,
    group: "quality",
    visibleFor: (p, f) => !!f.equipment && p.has("lab.view"),
  },
];

/** §5.15: with catalogue v2 on, Reference ranges becomes Ranges and cut-offs. */
const V2_LABELS: Partial<Record<LabNavId, string>> = { setup_ranges: "Ranges and cut-offs" };

export function navFor(
  permissions: ReadonlySet<LabPermission>,
  flags: LabNavFlags = { criticals: false },
): LabNavItem[] {
  const items = navItemsFor(LAB_NAV, permissions, flags);
  return flags.catalogueV2
    ? items.map((i) => ({ ...i, label: V2_LABELS[i.id] ?? i.label }))
    : items;
}
