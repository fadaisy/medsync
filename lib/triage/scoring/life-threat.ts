import type { LifeThreatFlags, TriageVitals } from "../types";

import { GLUCOSE } from "../constants";

/**
 * Step-0 immediate-life-threat screen — pure, deterministic
 * (research doc §9 Step 0). If ANY criterion fires, the patient is
 * Level 1 / Red, scoring is bypassed, resus now.
 *
 * Two sources, mirroring the life-threat discriminator subset:
 *   - clinician-observed flags (airway, breathing, pulse, AVPU=U,
 *     active seizure, exsanguinating haemorrhage)
 *   - vital-derived (SpO₂ < 90 DESPITE oxygen; glucose < 3.0)
 *
 * Note the SpO₂ rule is precisely "<90 despite O₂" (research doc §A.2):
 * a low sat ON AIR is severe but routed through scoring (NEWS2 gives it
 * +3), not auto-bypassed — we honor the document rather than broaden it.
 *
 * Collects ALL firing reasons (not just the first) for transparent
 * reasoning (kickoff §0.2).
 */
export interface LifeThreatResult {
  isLifeThreat: boolean;
  reasons: string[];
}

export function screenLifeThreat(vitals: TriageVitals, flags: LifeThreatFlags): LifeThreatResult {
  const reasons: string[] = [];

  if (flags.airwayCompromise) reasons.push("Airway compromise / stridor");
  if (flags.absentAgonalBreathing) reasons.push("Absent or agonal breathing");
  if (flags.cardiacArrestNoPulse) reasons.push("No palpable pulse / cardiac arrest");
  if (flags.unresponsive) reasons.push("Unresponsive (U on ACVPU)");
  if (flags.activeSeizure) reasons.push("Active seizure");
  if (flags.exsanguinatingHaemorrhage) reasons.push("Exsanguinating / uncontrolled haemorrhage");

  // ACVPU = U recorded in the vital set is equivalent to the unresponsive flag.
  if (vitals.consciousness === "U") reasons.push("Unresponsive (U on ACVPU)");

  // SpO₂ < 90 DESPITE oxygen (strict <90).
  if (vitals.spo2 !== null && vitals.oxygen === "oxygen" && vitals.spo2 < 90) {
    reasons.push("SpO₂ < 90% despite oxygen");
  }

  // Glucose < 3.0 mmol/L.
  if (vitals.bloodGlucose !== null && vitals.bloodGlucose < GLUCOSE.HYPO_LT) {
    reasons.push("Glucose < 3.0 mmol/L");
  }

  // Dedupe (unresponsive can arrive from both flag + ACVPU).
  const unique = [...new Set(reasons)];
  return { isLifeThreat: unique.length > 0, reasons: unique };
}
