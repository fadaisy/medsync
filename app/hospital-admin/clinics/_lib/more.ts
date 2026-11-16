import "server-only";

import type { MoreLink } from "@/components/clinics-schedule/shared";

import { FEATURE_AREAS, featurePath } from "../../_lib/features";

/** Desk icons for the admin registry's pages (`Icon` in components/reception/ui.tsx). */
const MORE_ICON: Record<string, string> = {
  staff: "person",
  departments: "nav",
  intake: "arrivals",
  reports: "print",
  admins: "keys",
  audit: "eye",
  profile: "card",
};

/** ADR 0514: every admin page but this one and the Overview placeholder, for the rail's "More" group. */
export const MORE: MoreLink[] = FEATURE_AREAS.filter((f) => f.slug && f.slug !== "clinics").map(
  (f) => ({
    href: featurePath(f.slug),
    label: f.label,
    icon: MORE_ICON[f.slug] ?? "nav",
  }),
);
