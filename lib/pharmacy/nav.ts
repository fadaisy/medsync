import type { PharmacyPermission } from "./access";
import type { NavItem } from "@/lib/workspace-access/nav";

import { navFor as navItemsFor } from "@/lib/workspace-access/nav";

/**
 * The pharmacy workspace navigation (Pharmacy Phase 0, NV-P1; Phase 1, 5.1). Queue · Open lines ·
 * Supplied today · Stock · Controlled drugs · Downtime entry · Emergency doses. A Phase 1 item shows
 * only when its flag is on for the hospital (`pharmacyDispensing`, `pharmacyDowntime`) and the
 * viewer holds the permission; with both flags off the navigation is Phase 0's two items.
 */
export type PharmacyNavId =
  | "queue"
  | "open"
  | "supplied"
  | "stock"
  | "controlled"
  | "downtime"
  | "emergency";
export interface PharmacyNavFlags {
  dispensing: boolean;
  downtime: boolean;
}
export type PharmacyNavItem = NavItem<PharmacyNavId, PharmacyPermission, PharmacyNavFlags>;

const view = (p: ReadonlySet<PharmacyPermission>) => p.has("pharmacy.view");

export const PHARMACY_NAV: readonly PharmacyNavItem[] = [
  // Exact, so Emergency doses does not light Queue; a prescription view lights Queue in the renderer.
  { id: "queue", label: "Queue", href: "/pharmacy", order: 1, exact: true, visibleFor: view },
  {
    id: "open",
    label: "Open lines",
    href: "/pharmacy/open-lines",
    order: 2,
    exact: false,
    visibleFor: (p, f) => !!f?.dispensing && view(p),
  },
  {
    id: "supplied",
    label: "Supplied today",
    href: "/pharmacy/supplied",
    order: 3,
    exact: false,
    visibleFor: (p, f) => !!f?.dispensing && view(p),
  },
  {
    id: "stock",
    label: "Stock",
    href: "/pharmacy/stock",
    order: 4,
    exact: false,
    visibleFor: (p, f) => !!f?.dispensing && view(p),
  },
  {
    id: "controlled",
    label: "Controlled drugs",
    href: "/pharmacy/controlled",
    order: 5,
    exact: false,
    visibleFor: (p, f) => !!f?.dispensing && view(p),
  },
  {
    id: "downtime",
    label: "Downtime entry",
    href: "/pharmacy/downtime",
    order: 6,
    exact: false,
    visibleFor: (p, f) => !!f?.downtime && p.has("pharmacy.dispense"),
  },
  {
    id: "emergency",
    label: "Emergency doses",
    href: "/pharmacy/emergency-doses",
    order: 7,
    exact: false,
    visibleFor: view,
  },
];

export function pharmacyNavFor(
  permissions: ReadonlySet<PharmacyPermission>,
  flags: PharmacyNavFlags = { dispensing: false, downtime: false },
): PharmacyNavItem[] {
  return navItemsFor(PHARMACY_NAV, permissions, flags);
}
