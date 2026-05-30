import "server-only";

/**
 * Reception workspace feature registry. Mirrors the doctor + nurse
 * registries — same shape, smaller (deliberately thin workspace).
 */

export type ReceptionIconKey = "overview" | "expected" | "intake" | "find" | "flow";

export type ReceptionFeatureSlug = "" | "expected" | "intake" | "find" | "flow";

export interface ReceptionFeatureArea {
  slug: ReceptionFeatureSlug;
  label: string;
  hint: string;
  iconKey: ReceptionIconKey;
  placeholder: boolean;
}

export const RECEPTION_FEATURE_AREAS: ReadonlyArray<ReceptionFeatureArea> = [
  {
    slug: "",
    label: "Today",
    hint: "Front-desk overview — expected, arrived, waiting, no-show",
    iconKey: "overview",
    placeholder: false,
  },
  {
    slug: "expected",
    label: "Expected",
    hint: "Today's booked patients — check them in on arrival",
    iconKey: "expected",
    placeholder: false,
  },
  {
    slug: "intake",
    label: "Register",
    hint: "Walk-in / referral / emergency intake",
    iconKey: "intake",
    placeholder: false,
  },
  {
    slug: "find",
    label: "Find",
    hint: "Search by patient code",
    iconKey: "find",
    placeholder: false,
  },
  {
    slug: "flow",
    label: "Flow",
    hint: "Operational status board — who's where today",
    iconKey: "flow",
    placeholder: false,
  },
];

export function receptionFeaturePath(slug: ReceptionFeatureSlug): string {
  return slug === "" ? "/reception" : `/reception/${slug}`;
}
