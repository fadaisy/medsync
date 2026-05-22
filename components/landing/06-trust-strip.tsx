import { SectionStub } from "./_section-stub";

/**
 * §06 — Trust strip. Attio analogue: scrolling customer logo wall.
 *
 * Decided at GATE A: option (b) — mission/standards strip.
 * No fabricated logos. One honest line + the councils MedSync is designed
 * to comply with (UMDPC, UNMC, AHPC, PSU) framed as standards-alignment,
 * NOT endorsements.
 */
export function TrustStrip() {
  return (
    <SectionStub
      n={6}
      name="Mission / standards strip"
      intent="Honest substitute for Attio's logo wall: one line + 4 standards-alignment chips (UMDPC, UNMC, AHPC, PSU) framed as compliance, not endorsement."
      runtime="server"
      buildAt="GATE B"
      todo={[
        `Copy: "Built by and for Uganda's medical community"`,
        'Chips: UMDPC · UNMC · AHPC · PSU (with explicit "designed to comply with" framing)',
        "No fabricated hospital logos. Ever.",
      ]}
    />
  );
}
