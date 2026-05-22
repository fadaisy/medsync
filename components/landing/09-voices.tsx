import { SectionStub } from "./_section-stub";

/**
 * §09b — Voices sub-block under [02].
 * Attio analogue: 3 customer testimonials. MedSync substitute (per GATE A):
 * 3 founders'-voice problem-statement cards, each paired with a mini
 * product surface.
 */
export function Voices() {
  return (
    <SectionStub
      n={9}
      name="Voices — founders'-voice problem statements"
      intent={`Three cards: "A notebook can't call for help" / "Two good days shouldn't end a five-day course" / "Specialists shouldn't be playing telephone." Each paired with a mini surface.`}
      runtime="server"
      buildAt="GATE C"
      todo={[
        "Card 1 + home-monitoring mini-surface",
        "Card 2 + adherence mini-surface",
        "Card 3 + care-team coordination mini-surface",
        "Attribution: MedSync founding team",
      ]}
    />
  );
}
