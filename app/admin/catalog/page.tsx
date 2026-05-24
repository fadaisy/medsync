import type { Metadata } from "next";

import { PlaceholderPanel } from "../_components/placeholder-panel";

export const metadata: Metadata = {
  title: "Catalog · Superadmin · MedSync",
  robots: { index: false, follow: false },
};

export default function CatalogPage() {
  return (
    <PlaceholderPanel
      gate="E"
      eyebrow="Area 4 · Catalog &amp; reference data"
      title="Catalog"
      tag="Read-only"
      intro="Maintain councils, cadres, roles, departments, and reference data (districts, facility levels). MVP is a read-only viewer of the seeded catalog — editing is the quietest catastrophic risk in the system (a careless role→permission mapping change could silently widen who sees PHI across every hospital at once), so it stays deferred until preview + four-eyes + audit safeguards are all in place."
      mvpBullets={[
        "Browse the seeded catalog: councils (UMDPC / UNMC / AHPC / Pharmacy Board), cadres, cadre grades, specialties, roles.",
        "Browse reference data: regions, districts, subcounties, facility levels.",
        "View reference_data_versions for the provenance log (dataset · source · version · row count · notes).",
      ]}
      deferredBullets={[
        'Editing cadres / roles / specialties — every edit must be previewable ("this will change access for N users across M hospitals"), audited, reversible, and four-eyes-class.',
        "Role → permission mapping edits — the quietest catastrophic risk. Read-only until the preview + four-eyes + audit safeguards are all in place. UI affordance for these edits never lands without the safeguards.",
        "Bulk reference-data import / replacement — same safeguards required.",
      ]}
    />
  );
}
