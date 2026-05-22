import { SectionStub } from "./_section-stub";

/**
 * §11 — The ecosystem. MedSync-specific section in Attio's bento style.
 * The three integrated pillars: Platform / Wellness Hubs / E-Pharmacy.
 */
export function Ecosystem() {
  return (
    <SectionStub
      n={11}
      name="Ecosystem — three integrated pillars"
      intent='Bento with 3 tiles: Platform (mobile + web) · Wellness Hubs (physical NCD facilities) · E-Pharmacy (prescriber-verified, refill reminders). Tagline: "MedSync is the digital backbone connecting all three."'
      runtime="server"
      buildAt="GATE D"
      todo={[
        "3 bento tiles with embedded mini-surfaces",
        "Hover-depth from design system",
        "Tagline below the bento",
      ]}
    />
  );
}
