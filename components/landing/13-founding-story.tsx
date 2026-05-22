import { SectionStub } from "./_section-stub";

/**
 * §13 — Founding story. The honest credibility anchor.
 * GATE A decision: Name Usama Fadhul + Clinical Safety Officer role.
 */
export function FoundingStory() {
  return (
    <SectionStub
      n={13}
      name="Founding story — Usama Fadhul"
      intent="Born in the wards and clinics of Uganda. Built by Ugandan medical students for the Ugandan medical community. Names: Usama Fadhul, founder + Clinical Safety Officer."
      runtime="server"
      buildAt="GATE E"
      todo={[
        "Editorial / quiet styling per design system",
        "Reveal on scroll (reduced-motion: static)",
        "The two gaps MedSync exists to close",
      ]}
    />
  );
}
