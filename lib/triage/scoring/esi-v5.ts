import type { AcuityLevel } from "../types";

import {
  ESI_V5_ADULT_DANGER,
  ESI_V5_DANGER_FLOOR_LEVEL,
  ESI_V5_INCOMPLETE_FLOOR_LEVEL,
} from "../constants";

/**
 * ESI v5 mandatory-vitals + danger-zone reassess-up — pure,
 * deterministic (ENA 2023; verified GATE A §1). The rule v4 lacked,
 * which v1 of this engine also missed.
 *
 *   - HR + RR + SpO₂ are MANDATORY for any patient not already L1/L2.
 *     A missing required vital means a reassuring level (4/5) may not be
 *     issued: floor to L3 + flag `incompleteVitals`.
 *   - A high-risk ("danger-zone") vital reassesses acuity UPWARD →
 *     minimum L2 (verified adult thresholds: HR>100, RR>20, SpO₂<92).
 *
 * Returns an `acuityFloor` (the most-acute floor implied, or null) that
 * the engine folds into its worse-of. Danger (L2) outranks incomplete
 * (L3) when both apply.
 *
 * Adult thresholds only — paediatric danger-zone cutoffs are in the paid
 * ENA handbook and are NOT encoded (paeds stays provisional, never
 * fabricated).
 */
export interface EsiV5Vitals {
  respiratoryRate: number | null;
  pulse: number | null;
  spo2: number | null;
}

export interface EsiV5Assessment {
  /** A required vital (HR/RR/SpO₂) is missing → cannot issue L4/L5. */
  incompleteVitals: boolean;
  /** Which required vitals are missing (engine parameter codes). */
  missingRequired: string[];
  /** Human-readable danger-zone vitals that fired (reassess-up). */
  dangerVitals: string[];
  /** Most-acute floor this rule imposes (lower = more acute), or null. */
  acuityFloor: AcuityLevel | null;
}

export function assessEsiV5(v: EsiV5Vitals): EsiV5Assessment {
  const missingRequired: string[] = [];
  if (v.respiratoryRate === null) missingRequired.push("respiratory_rate");
  if (v.pulse === null) missingRequired.push("pulse");
  if (v.spo2 === null) missingRequired.push("spo2");
  const incompleteVitals = missingRequired.length > 0;

  const dangerVitals: string[] = [];
  if (v.pulse !== null && v.pulse > ESI_V5_ADULT_DANGER.PULSE_GT) {
    dangerVitals.push(`Pulse ${v.pulse} > ${ESI_V5_ADULT_DANGER.PULSE_GT}`);
  }
  if (v.respiratoryRate !== null && v.respiratoryRate > ESI_V5_ADULT_DANGER.RESP_RATE_GT) {
    dangerVitals.push(`Resp rate ${v.respiratoryRate} > ${ESI_V5_ADULT_DANGER.RESP_RATE_GT}`);
  }
  if (v.spo2 !== null && v.spo2 < ESI_V5_ADULT_DANGER.SPO2_LT) {
    dangerVitals.push(`SpO₂ ${v.spo2} < ${ESI_V5_ADULT_DANGER.SPO2_LT}`);
  }

  // Danger (L2) is more acute than incomplete (L3); take the worse.
  let acuityFloor: AcuityLevel | null = null;
  if (dangerVitals.length > 0) acuityFloor = ESI_V5_DANGER_FLOOR_LEVEL as AcuityLevel;
  else if (incompleteVitals) acuityFloor = ESI_V5_INCOMPLETE_FLOOR_LEVEL as AcuityLevel;

  return { incompleteVitals, missingRequired, dangerVitals, acuityFloor };
}
