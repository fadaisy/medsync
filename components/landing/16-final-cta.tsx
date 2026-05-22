import { SectionStub } from "./_section-stub";

/**
 * §16 — Final CTA. Attio analogue: "The next era of revenue runs on Attio."
 */
export function FinalCta() {
  return (
    <SectionStub
      n={16}
      name="Final CTA"
      intent='Closing copy + the three audience doors. Direction: "The next era of Ugandan care runs on MedSync." or the concept-note close "The patients are waiting."'
      runtime="server"
      buildAt="GATE E"
      todo={[
        "Display headline (text-display-m+)",
        "Three CTAs consistent with hero",
        "Dark surface variant per design system",
      ]}
    />
  );
}
