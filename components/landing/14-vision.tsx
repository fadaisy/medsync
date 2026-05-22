import { SectionStub } from "./_section-stub";

/**
 * §14 — Vision / innovation pipeline.
 * Restrained per spec. Wearable integration (future); artificial-pancreas
 * concept EXPLICITLY labelled R&D, subject to research + regulatory review.
 * No implied availability, no timelines we can't keep.
 */
export function Vision() {
  return (
    <SectionStub
      n={14}
      name="Vision — restrained, honest"
      intent="Two short cards: (1) Wearable integration (future). (2) Artificial-pancreas concept — labelled R&D horizon, subject to clinical research + regulatory/ethical review. No availability claims."
      runtime="server"
      buildAt="GATE E"
      todo={[
        "Two cards, clearly labelled as future / R&D",
        "No timelines",
        "Reduced motion: static",
      ]}
    />
  );
}
