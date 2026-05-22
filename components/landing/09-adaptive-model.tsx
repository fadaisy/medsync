"use client";

import { SectionStub } from "./_section-stub";

/**
 * §09 — [02] Adaptive model — tabbed object views.
 * Attio analogue: "Universal Context™" tabs (Scale-ups / SaaS / SMBs / Investors).
 *
 * MedSync: tabs are Internal Medicine sub-specialties from the Phase 0 seed
 * (Diabetology / Cardiology / Nephrology / Pulmonology). Each tab animates
 * a set of clinical object cards with attributes that change per specialty.
 *
 * Concept name decided at GATE A: "The closed-loop record" (no fake ™).
 */
export function AdaptiveModel() {
  return (
    <SectionStub
      n={9}
      bracket={2}
      name='Adaptive model — "The closed-loop record"'
      intent="Tabbed clinical object cards adapting per specialty. Tabs = Diabetology, Cardiology, Nephrology, Pulmonology. Each tab animates Patient / Vital reading / Medication / Care-team note / Lab result / Appointment cards with attributes shifted per specialty."
      runtime="client"
      buildAt="GATE C"
      todo={[
        "4 tabs (specialty-keyed); active tab cross-fades object cards",
        "Per-specialty attribute sets (e.g. HbA1c for Diabetology, eGFR for Nephrology)",
        '"+N more attributes" affordance per card (mirror Attio)',
        "Reduced-motion: instant tab swap",
      ]}
    />
  );
}
