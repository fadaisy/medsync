import type { PharmacyPermission } from "./access";
import type { NavItem } from "@/lib/workspace-access/nav";

import { navFor as navItemsFor } from "@/lib/workspace-access/nav";

/**
 * The pharmacy workspace navigation (Pharmacy Phase 0, NV-P1). Two items. Later phases register
 * Open lines, Supplied today, Stock, Controlled drugs and Downtime entry when their pages ship.
 */
export type PharmacyNavId = "queue" | "emergency";
export type PharmacyNavItem = NavItem<PharmacyNavId, PharmacyPermission>;

const view = (p: ReadonlySet<PharmacyPermission>) => p.has("pharmacy.view");

export const PHARMACY_NAV: readonly PharmacyNavItem[] = [
  // Exact, so Emergency doses does not light Queue; a prescription view lights Queue in the renderer.
  { id: "queue", label: "Queue", href: "/pharmacy", order: 1, exact: true, visibleFor: view },
  {
    id: "emergency",
    label: "Emergency doses",
    href: "/pharmacy/emergency-doses",
    order: 2,
    exact: false,
    visibleFor: view,
  },
];

export function pharmacyNavFor(permissions: ReadonlySet<PharmacyPermission>): PharmacyNavItem[] {
  return navItemsFor(PHARMACY_NAV, permissions);
}
