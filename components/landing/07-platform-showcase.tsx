"use client";

import { SectionStub } from "./_section-stub";

/**
 * §07 — [01] Powerful platform — pinned 5-scene scroll showcase.
 * The most important section to replicate faithfully. Uses Framer Motion's
 * useScroll for sticky scene-stepping (Attio-style).
 *
 * Client component because of the scroll-pin interaction. Mobile + reduced
 * motion degrade to stacked sequential blocks (built at GATE C).
 */
export function PlatformShowcase() {
  return (
    <SectionStub
      n={7}
      bracket={1}
      name="Powerful platform — pinned 5-scene showcase"
      intent={`Mirror Attio's [01] section. Sticky/pinned scroll through 5 scenes ("watching at home" → "acts before you" → "patient already briefed" → "one live picture" → "for the people who run the hospital") with a scene-stepper.`}
      runtime="client"
      buildAt="GATE C"
      todo={[
        "Sticky layout: pinned left copy + right surface that swaps per scene",
        "Scene stepper indicator: / item 1 : 5 (Attio-style)",
        "Framer Motion useScroll + scroll-linked surface cross-fade",
        "5 scene surfaces (see ./07-scenes/*)",
        "Mobile fallback: stacked sequential blocks (no pin)",
        "Reduced-motion fallback: all 5 scenes rendered linearly, no animation",
      ]}
    />
  );
}
