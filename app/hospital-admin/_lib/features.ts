import "server-only";

/**
 * Feature registry — the single source of truth for what lives in the
 * hospital-admin workspace shell.
 *
 * Every later feature prompt (Overview, Staff, Departments, Scheduling,
 * Admins, Audit, Profile) plugs in by:
 *
 *   1. Editing the `slug`'s entry in FEATURE_AREAS to flip
 *      `placeholder: false` and (optionally) wire a badge fetcher and
 *      ⌘K entity registrar.
 *   2. Building the actual page under app/hospital-admin/<slug>/page.tsx.
 *   3. Following the action pattern documented in
 *      docs/hospital-admin-integration-contract.md.
 *
 * The shell reads this list to render the sidebar, the mobile sheet,
 * and the ⌘K palette's "Navigate" group. **Do NOT hand-duplicate this
 * list anywhere else.** A new feature surface = one new entry here.
 *
 * Why the strings-only shape: this module is imported by both server
 * components (layout) and is referenced in client palette / sidebar
 * components. Icon component references can't cross that boundary
 * cleanly, so each feature carries an `iconKey` that the client
 * sidebar resolves through an ICONS map.
 */

export type FeatureIconKey =
  | "overview"
  | "staff"
  | "departments"
  | "scheduling"
  | "intake"
  | "audit"
  | "reports"
  | "requests"
  | "profile";

export type FeatureSlug =
  | ""
  | "today"
  | "activity"
  | "departments/wards"
  | "lab"
  | "staff"
  | "departments"
  | "clinics"
  | "intake"
  | "requests"
  | "reports"
  | "admins"
  | "audit"
  | "profile";

export interface FeatureArea {
  /** URL slug under `/hospital-admin`. Empty string = the index (Overview). */
  slug: FeatureSlug;
  /** Sidebar + palette label. */
  label: string;
  /** One-line hint used by the ⌘K palette. */
  hint: string;
  /** Icon resolved client-side via the ICONS map in HospitalSidebarItem. */
  iconKey: FeatureIconKey;
  /** True while the feature is a routed placeholder. Flipped to false
   * by the feature prompt that lands the real surface. */
  placeholder: boolean;
}

export const FEATURE_AREAS: ReadonlyArray<FeatureArea> = [
  {
    slug: "today",
    label: "Today",
    hint: "What needs you across the hospital · counts · do next",
    iconKey: "overview",
    placeholder: false,
  },
  {
    slug: "staff",
    label: "People",
    hint: "To review · invitations · directory · admins",
    iconKey: "staff",
    placeholder: false,
  },
  {
    slug: "departments",
    label: "Departments & services",
    hint: "Departments · heads · booking rules · emergency & support · availability",
    iconKey: "departments",
    placeholder: false,
  },
  {
    slug: "departments/wards",
    label: "Wards and beds",
    hint: "Wards · beds · ward layout · live bed board",
    iconKey: "departments",
    placeholder: false,
  },
  {
    slug: "lab",
    label: "Laboratory and imaging",
    hint: "Test menu · referrals · hours · imaging · profiles",
    iconKey: "departments",
    placeholder: false,
  },
  {
    slug: "clinics",
    label: "Clinics & schedule",
    hint: "Clinics · week plan · closures · people · devices · publish",
    iconKey: "scheduling",
    placeholder: false,
  },
  {
    slug: "intake",
    label: "Intake",
    hint: "Register patient arrivals — walk-in, referral, emergency, transfer",
    iconKey: "intake",
    placeholder: false,
  },
  {
    slug: "requests",
    label: "Requests",
    hint: "Waiting for a clinician · copies of results",
    iconKey: "requests",
    placeholder: false,
  },
  {
    slug: "reports",
    label: "Reports",
    hint: "Fill rate · no-shows · wait accuracy · demand · SMS spend",
    iconKey: "reports",
    placeholder: false,
  },
  {
    slug: "activity",
    label: "Activity",
    hint: "What admins changed at this hospital · who, when and why",
    iconKey: "audit",
    placeholder: false,
  },
  {
    slug: "profile",
    label: "Hospital profile",
    hint: "Identity · emergency coordinates · outbreak mode",
    iconKey: "profile",
    placeholder: false,
  },
];

/** Build the route path for a feature. Centralised so a future prefix
 * change (e.g. `/h` instead of `/hospital-admin`) is a one-line edit. */
export function featurePath(slug: FeatureSlug): string {
  return slug === "" ? "/hospital-admin" : `/hospital-admin/${slug}`;
}
