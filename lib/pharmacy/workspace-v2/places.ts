import type { PharmacyPlace } from "@/content/pharmacy-workspace-v2";
import type { PharmacyNavId } from "@/lib/pharmacy/nav";

/**
 * Pharmacy Workspace v2 places (GATE A §3, D-PW-03). A tab exists exactly when the Phase 1–4 nav item it replaces
 * is visible, so the new interface reads the same flags and permissions as the old one (NavMap: "every old item
 * has one home"). Pure; the layout passes the visible nav ids.
 */
export interface PlaceTab {
  place: PharmacyPlace;
  key: string;
  href: string;
  /** The nav item this tab replaces (null: a v2 view over the same data, e.g. Ready to hand over). */
  from: PharmacyNavId | null;
}

const T = (
  place: PharmacyPlace,
  key: string,
  href: string,
  from: PharmacyNavId | null,
): PlaceTab => ({
  place,
  key,
  href,
  from,
});

/** Every tab in rail order; filtered by the visible nav ids. */
const ALL: readonly PlaceTab[] = [
  T("window", "queue", "/pharmacy/window", "queue"),
  T("window", "ready", "/pharmacy/window?view=ready", "supplied"),
  T("window", "open", "/pharmacy/window?view=open", "open"),
  T("window", "refills", "/pharmacy/window?view=refills", "refills"),
  T("window", "supplied", "/pharmacy/window?view=supplied", "supplied"),
  T("shelf", "stock", "/pharmacy/shelf", "stock"),
  T("shelf", "controlled", "/pharmacy/shelf?view=controlled", "controlled"),
  T("shelf", "emergency", "/pharmacy/shelf?view=emergency", "emergency"),
  T("store", "deliveries", "/pharmacy/store?tab=deliveries", "deliveries"),
  T("store", "issues", "/pharmacy/store?tab=issues", "issues"),
  T("store", "wards", "/pharmacy/store?tab=wards", "wards"),
  T("store", "carts", "/pharmacy/store?tab=carts", "carts"),
  T("store", "expiry", "/pharmacy/store?tab=expiry", "expiry"),
  T("store", "orders", "/pharmacy/store?tab=orders", "orders"),
  T("store", "monthEnd", "/pharmacy/store?tab=monthEnd", "monthEnd"),
  T("clinical", "reconciliation", "/pharmacy/clinical", "reconciliation"),
  T("clinical", "reactions", "/pharmacy/clinical", "reactions"),
  T("clinical", "stewardship", "/pharmacy/clinical", "stewardship"),
  T("clinical", "interventions", "/pharmacy/clinical", "interventions"),
  T("setup", "packs", "/pharmacy/setup", "packs"),
  T("setup", "places", "/pharmacy/setup?view=places", "places"),
  T("setup", "content", "/pharmacy/setup?view=content", "clinicalContent"),
  T("setup", "downtime", "/pharmacy/setup?view=downtime", "downtime"),
];

export const PLACE_ORDER: readonly PharmacyPlace[] = [
  "today",
  "window",
  "shelf",
  "store",
  "clinical",
  "setup",
];

export interface PlacesInput {
  navIds: readonly PharmacyNavId[];
  /** Today needs dispensing (its figures read the review queue and hand-overs). */
  dispensing: boolean;
  /** The national list keeps its own flag (pharmacyNationalListLiveFor). */
  nationalList: boolean;
  /**
   * Signed packs follow the page's own gate (`supplyFlagOn("packs")`: any store flag, or dispensing), not the old nav
   * item, which Phase 1's baseline keeps hidden with dispensing alone (NavMap gap: the page opened, the item did not).
   */
  packs?: boolean;
  /** The shared catalogue keeps its own flag (pharmacyCatalogueLiveFor); a tab of Set-up, not an old nav item. */
  catalogue?: boolean;
}

export function placesFor({ navIds, dispensing, nationalList, packs, catalogue }: PlacesInput) {
  const visible = new Set(navIds);
  const tabs = ALL.filter(
    (t) => t.from && visible.has(t.from) && (t.key !== "packs" || packs !== false),
  );
  if (packs && visible.has("queue") && !tabs.some((t) => t.key === "packs")) {
    const at = tabs.findIndex((t) => t.place === "setup");
    tabs.splice(at < 0 ? tabs.length : at, 0, T("setup", "packs", "/pharmacy/setup", null));
  }
  if (nationalList && visible.has("stock"))
    tabs.push(T("setup", "national", "/pharmacy/setup?view=national", null));
  if (catalogue && visible.has("stock"))
    tabs.push(
      T("setup", "catalogue", "/pharmacy/setup?view=catalogue", null),
      T("setup", "prices", "/pharmacy/setup?view=prices", null),
      T("setup", "import", "/pharmacy/setup?view=import", null),
    );
  // Catalogue slice Step 11: Store › Every place (4.10), with Follow one medicine (4.15) inside it.
  if (catalogue && visible.has("stock") && tabs.some((t) => t.place === "store")) {
    const at = tabs.findLastIndex((t) => t.place === "store");
    tabs.splice(at + 1, 0, T("store", "map", "/pharmacy/store?tab=map", null));
  }
  const places = PLACE_ORDER.filter((p) =>
    p === "today" ? dispensing && visible.has("queue") : tabs.some((t) => t.place === p),
  );
  return { places, tabs };
}

/** Where /pharmacy lands (D-PW-04): the in-charge on Today, everyone else on Window. */
export function landingFor(places: readonly PharmacyPlace[], manage: boolean): string {
  if (manage && places.includes("today")) return "/pharmacy/today";
  return "/pharmacy/window";
}

/** The place a pathname belongs to, for the rail's current marker. Old routes light their new place. */
export function placeOf(pathname: string): PharmacyPlace | "needsYou" | null {
  const p = pathname.replace(/^\/pharmacy/, "") || "/";
  if (p.startsWith("/today")) return "today";
  if (p.startsWith("/needs-you")) return "needsYou";
  if (/^\/(window|prescriptions|open-lines|refills|supplied|downtime\/enter|slip|labels)/.test(p))
    return "window";
  if (p === "/") return "window";
  if (/^\/(shelf|controlled|emergency-doses)/.test(p)) return "shelf";
  if (p.startsWith("/stock/national-list")) return "setup";
  if (p.startsWith("/stock")) return "shelf";
  if (/^\/store\/(packs|places)/.test(p)) return "setup";
  if (p.startsWith("/store")) return "store";
  if (p.startsWith("/clinical/content")) return "setup";
  if (p.startsWith("/clinical")) return "clinical";
  if (/^\/(setup|downtime)/.test(p)) return "setup";
  return null;
}
