import type { PharmacyPermission } from "./access";
import type { StoresFlags } from "@/lib/pharmacy/feature";
import type { NavItem } from "@/lib/workspace-access/nav";

import { navFor as navItemsFor } from "@/lib/workspace-access/nav";
import { dispensingMap, pharmacyDispensingAccess, withStoreAccess } from "./access";

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
  | "emergency"
  // Phase 2, the Store group (5.1)
  | "deliveries"
  | "issues"
  | "wards"
  | "carts"
  | "expiry"
  | "monthEnd"
  | "orders"
  | "places"
  | "packs"
  // Phase 3, the Clinical group (5.1)
  | "clinicalContent"
  | "interventions";
export interface PharmacyNavFlags {
  dispensing: boolean;
  downtime: boolean;
  /** Phase 2 (D-PH2-24); absent means off. */
  stores?: StoresFlags;
  /** Phase 3 (Law 14); absent means off. */
  clinical?: { interactions: boolean; interventionReview: boolean };
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
  // Phase 2, the Store group (5.1): each shown only with its flag on and the permission held.
  ...(
    [
      ["deliveries", "Deliveries", "/pharmacy/store/deliveries", "store", "pharmacy.store"],
      ["issues", "Issues and requisitions", "/pharmacy/store/issues", "store", "pharmacy.store"],
      ["wards", "Ward stock", "/pharmacy/store/wards", "wardStock", "pharmacy.view"],
      ["carts", "Emergency carts", "/pharmacy/store/carts", "carts", "pharmacy.view"],
      ["expiry", "Expiry and recall", "/pharmacy/store/expiry", "recall", "pharmacy.view"],
      ["monthEnd", "Month end", "/pharmacy/store/month-end", "monthEnd", "pharmacy.view"],
      ["orders", "Orders", "/pharmacy/store/orders", "ordering", "pharmacy.view"],
      ["places", "Places and suppliers", "/pharmacy/store/places", "store", "pharmacy.view"],
    ] as const
  ).map(
    ([id, label, href, flag, perm], i): PharmacyNavItem => ({
      id,
      label,
      href,
      order: 20 + i,
      exact: false,
      visibleFor: (p, f) => !!f?.stores?.[flag] && p.has(perm),
    }),
  ),
  {
    // Appendix D packs (and Phase 1's own), signed in the app: with any Phase 2 flag on. With all six off the rail
    // is Phase 1's exactly (Law 14).
    id: "packs",
    label: "Signed packs",
    href: "/pharmacy/store/packs",
    order: 40,
    exact: false,
    visibleFor: (p, f) => p.has("pharmacy.view") && Object.values(f?.stores ?? {}).some(Boolean),
  },
  // Phase 3 (5.1): Interventions behind its flag; Clinical content with any Phase 3 flag on.
  {
    id: "interventions",
    label: "Interventions",
    href: "/pharmacy/clinical/interventions",
    order: 50,
    exact: false,
    visibleFor: (p, f) => !!f?.clinical?.interventionReview && p.has("pharmacy.review"),
  },
  {
    id: "clinicalContent",
    label: "Clinical content",
    href: "/pharmacy/clinical/content",
    order: 51,
    exact: false,
    visibleFor: (p, f) =>
      p.has("pharmacy.view") && !!(f?.clinical?.interactions || f?.clinical?.interventionReview),
  },
];

/** The first visible Phase 3 item opens the Clinical heading in the sidebar. */
export const CLINICAL_NAV_IDS: readonly PharmacyNavId[] = ["interventions", "clinicalContent"];

/** The first visible Store item opens the group's heading in the sidebar. */
export const STORE_NAV_IDS: readonly PharmacyNavId[] = [
  "deliveries",
  "issues",
  "wards",
  "carts",
  "expiry",
  "monthEnd",
  "orders",
  "places",
  "packs",
];

export function pharmacyNavFor(
  permissions: ReadonlySet<PharmacyPermission>,
  flags: PharmacyNavFlags = { dispensing: false, downtime: false },
): PharmacyNavItem[] {
  return navItemsFor(PHARMACY_NAV, permissions, flags);
}

/**
 * The permissions the navigation reads: Phase 0's (`pharmacyAccess`, map v1) with both Phase 1 flags
 * off, so the Phase 0 navigation is unchanged; with either flag on, the dispensing access (map v2
 * outside production, v1 in production), so an item needing `pharmacy.dispense` can show.
 */
export function pharmacyNavPermissions(
  phase0: ReadonlySet<PharmacyPermission>,
  cadreCode: string | null,
  flags: PharmacyNavFlags,
  map = dispensingMap(),
): ReadonlySet<PharmacyPermission> {
  const base =
    flags.dispensing || flags.downtime
      ? pharmacyDispensingAccess(cadreCode, map).permissions
      : phase0;
  return withStoreAccess({ permissions: base }, cadreCode, !!flags.stores?.store).permissions;
}
