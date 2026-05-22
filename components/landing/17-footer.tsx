import { SectionStub } from "./_section-stub";

/**
 * §17 — Fat multi-column footer.
 */
export function Footer() {
  return (
    <SectionStub
      n={17}
      name="Footer (fat, 6-column)"
      intent="Columns: Platform · Ecosystem · For (audiences) · Company · Resources · Legal. Social only if real handles. © 2026 MedSync. Legal links flagged for lawyer review."
      runtime="server"
      buildAt="GATE E"
      fullBleed
      todo={[
        "6 columns of links",
        "Real social handles only (else omit)",
        "Privacy / Terms / Data protection — flagged placeholders",
        "Keyboard tab order sane",
      ]}
    />
  );
}
