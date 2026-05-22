import { SectionStub } from "./_section-stub";

/**
 * §10 — [03] From day one — enrichment + patient card.
 * Attio analogue: data-sources viz feeding a person enrichment card.
 *
 * MedSync: care-data sources (discharge summary, vitals, meds, labs,
 * appointments) flowing into a rich patient card. The card is the
 * richest single composition on the page.
 */
export function Enrichment() {
  return (
    <SectionStub
      n={10}
      bracket={3}
      name="From day one — record builds itself"
      intent='Left: data-sources viz (discharge summary, vitals, meds, lab results, appointments) flowing into the central patient card. CTA: "Request a pilot".'
      runtime="server"
      buildAt="GATE D"
      todo={[
        "5 feeder sources animating into central patient card",
        'Headline: "The record builds itself"',
        "CTA → /onboarding/hospital",
        "PatientCard component (see 10-patient-card.tsx)",
      ]}
    />
  );
}
