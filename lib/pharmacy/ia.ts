/**
 * The pharmacy's one href map (rework PRD §3, TECH-SPEC §1): six sections, their pages (tabs), and where every old
 * route went. Nav, Find, the bottom pill and `next.config` redirects all read this file, so a page has one home.
 * Pure; no imports.
 */
export type SectionId = "today" | "dispense" | "patients" | "stock" | "controls" | "records";
export type Tier = "core" | "wards" | "epi" | "insights";

export interface PharmacyPage {
  key: string;
  section: SectionId;
  href: string;
  /** The tier that switches the page on (PHARMACY_CORE, …). */
  tier: Tier;
  /** Sub-tabs inside the page (`?tab=`), first is the default. */
  tabs?: readonly string[];
}

export const SECTIONS: readonly SectionId[] = ["today", "dispense", "patients", "stock", "controls", "records"];

export const PAGES: readonly PharmacyPage[] = [
  { key: "today", section: "today", href: "/pharmacy/today", tier: "core" },
  {
    key: "dispense",
    section: "dispense",
    href: "/pharmacy/dispense",
    tier: "core",
    tabs: ["waiting", "ready", "owed", "done"],
  },
  { key: "inpatients", section: "patients", href: "/pharmacy/patients/inpatients", tier: "wards", tabs: ["mar", "round"] },
  { key: "outpatients", section: "patients", href: "/pharmacy/patients/outpatients", tier: "core", tabs: ["refills", "courses"] },
  {
    key: "immunisation",
    section: "patients",
    href: "/pharmacy/patients/immunisation",
    tier: "epi",
    tabs: ["stock", "cold", "clinic", "clients", "defaulters"],
  },
  { key: "reminders", section: "patients", href: "/pharmacy/patients/reminders", tier: "core", tabs: ["today", "rules"] },
  { key: "medicines", section: "stock", href: "/pharmacy/stock/medicines", tier: "core" },
  {
    key: "store",
    section: "stock",
    href: "/pharmacy/stock/store",
    tier: "core",
    tabs: ["receive", "issue", "count", "order", "cold"],
  },
  { key: "cd", section: "controls", href: "/pharmacy/controls/cd", tier: "core", tabs: ["register", "flags", "checks", "paper"] },
  { key: "handover", section: "controls", href: "/pharmacy/controls/handover", tier: "core" },
  { key: "cases", section: "controls", href: "/pharmacy/controls/cases", tier: "core" },
  {
    key: "records",
    section: "records",
    href: "/pharmacy/records",
    tier: "core",
    tabs: ["audit", "losses", "sheets", "reports"],
  },
  { key: "team", section: "records", href: "/pharmacy/records/team", tier: "insights" },
];

/** Reached from the account menu only (PRD §3). */
export const SETUP_HREF = "/pharmacy/setup";
export const SETUP_TABS = ["live", "places", "medicines", "rules", "people", "sms"] as const;

export const pageByKey = (key: string) => PAGES.find((p) => p.key === key);
export const pagesIn = (section: SectionId, tiers: Record<Tier, boolean>) =>
  PAGES.filter((p) => p.section === section && tiers[p.tier]);

/** The page a pathname belongs to (longest href first), for the rail marker and the sub-tab row. */
export function pageOf(pathname: string): PharmacyPage | null {
  const byLength = [...PAGES].sort((a, b) => b.href.length - a.href.length);
  return byLength.find((p) => pathname === p.href || pathname.startsWith(`${p.href}/`)) ?? null;
}

export function sectionOf(pathname: string): SectionId | "setup" | null {
  if (pathname.startsWith(SETUP_HREF)) return "setup";
  if (pathname.startsWith("/pharmacy/stock/recall")) return "stock";
  return pageOf(pathname)?.section ?? null;
}

/**
 * Every old route and its new home (TECH-SPEC §1, "remove the old routes behind redirects"). Read by next.config.
 * Pages that print (slip, labels) and the prescription hand-over screen keep their URLs: they are opened from the
 * new pages, not from the nav.
 */
export const REDIRECTS: readonly { source: string; destination: string }[] = [
  { source: "/pharmacy", destination: "/pharmacy/today" },
  { source: "/pharmacy/window", destination: "/pharmacy/dispense" },
  { source: "/pharmacy/needs-you", destination: "/pharmacy/today" },
  { source: "/pharmacy/open-lines", destination: "/pharmacy/dispense?tab=owed" },
  { source: "/pharmacy/supplied", destination: "/pharmacy/dispense?tab=done" },
  { source: "/pharmacy/supplied/log", destination: "/pharmacy/records?tab=audit" },
  { source: "/pharmacy/refills", destination: "/pharmacy/patients/outpatients" },
  { source: "/pharmacy/shelf", destination: "/pharmacy/stock/medicines" },
  { source: "/pharmacy/stock", destination: "/pharmacy/stock/medicines" },
  { source: "/pharmacy/stock/national-list", destination: "/pharmacy/setup?tab=medicines" },
  // The old medicine page, by id; the new stock pages are excluded.
  { source: "/pharmacy/stock/:id((?!medicines|store|recall|national-list).+)", destination: "/pharmacy/stock/medicines?med=:id" },
  { source: "/pharmacy/controlled", destination: "/pharmacy/controls/cd" },
  { source: "/pharmacy/controlled/register/:entryId", destination: "/pharmacy/controls/cd" },
  { source: "/pharmacy/emergency-doses", destination: "/pharmacy/controls/cd" },
  { source: "/pharmacy/downtime", destination: "/pharmacy/records?tab=sheets" },
  { source: "/pharmacy/downtime/enter/:sheet", destination: "/pharmacy/records?tab=sheets" },
  { source: "/pharmacy/downtime/sheets/:from/:to", destination: "/pharmacy/records?tab=sheets" },
  { source: "/pharmacy/store", destination: "/pharmacy/stock/store" },
  { source: "/pharmacy/store/deliveries", destination: "/pharmacy/stock/store?tab=receive" },
  { source: "/pharmacy/store/deliveries/:id", destination: "/pharmacy/stock/store?tab=receive&delivery=:id" },
  { source: "/pharmacy/store/issues", destination: "/pharmacy/stock/store?tab=issue" },
  { source: "/pharmacy/store/issues/:id", destination: "/pharmacy/stock/store?tab=issue" },
  { source: "/pharmacy/store/wards", destination: "/pharmacy/stock/store?tab=issue" },
  { source: "/pharmacy/store/wards/:locationId", destination: "/pharmacy/stock/store?tab=issue&ward=:locationId" },
  { source: "/pharmacy/store/carts", destination: "/pharmacy/stock/medicines" },
  { source: "/pharmacy/store/carts/:locationId", destination: "/pharmacy/stock/medicines" },
  { source: "/pharmacy/store/expiry", destination: "/pharmacy/records?tab=losses" },
  { source: "/pharmacy/store/expiry/recalls", destination: "/pharmacy/stock/medicines?filter=recalled" },
  { source: "/pharmacy/store/expiry/recalls/:id", destination: "/pharmacy/stock/recall/:id" },
  { source: "/pharmacy/store/month-end", destination: "/pharmacy/stock/store?tab=count" },
  { source: "/pharmacy/store/orders", destination: "/pharmacy/stock/store?tab=order" },
  { source: "/pharmacy/store/packs", destination: "/pharmacy/setup?tab=rules" },
  { source: "/pharmacy/store/places", destination: "/pharmacy/setup?tab=places" },
  { source: "/pharmacy/clinical", destination: "/pharmacy/dispense" },
  { source: "/pharmacy/clinical/content", destination: "/pharmacy/setup?tab=rules" },
  { source: "/pharmacy/clinical/interventions", destination: "/pharmacy/records?tab=reports" },
  { source: "/pharmacy/clinical/reactions", destination: "/pharmacy/records?tab=audit" },
  { source: "/pharmacy/clinical/reactions/:id", destination: "/pharmacy/records?tab=audit" },
  { source: "/pharmacy/clinical/reconciliation", destination: "/pharmacy/patients/inpatients" },
  { source: "/pharmacy/clinical/reconciliation/:id", destination: "/pharmacy/patients/inpatients" },
  { source: "/pharmacy/clinical/stewardship", destination: "/pharmacy/patients/outpatients?tab=courses" },
];

/** The page's tab from `?tab=`, or its first tab. */
export function tabOf(key: string, tab: string | string[] | undefined): string {
  const tabs = pageByKey(key)?.tabs ?? [];
  return typeof tab === "string" && tabs.includes(tab) ? tab : (tabs[0] ?? "");
}
