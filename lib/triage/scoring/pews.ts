import type { PaedAgeBand } from "../constants";

import { PAED_AGE_BANDS } from "../constants";

/**
 * Paediatric vitals — pure, deterministic (kickoff §0.1).
 *
 * ⚠️ CLINICAL-DATA SCOPE NOTE (read before extending):
 * The research doc (§7) provides age-banded NORMAL ranges and the
 * 3-domain PEWS STRUCTURE (behaviour/CVS/respiratory, each 0–3) but
 * does NOT provide the full Brighton/Monaghan per-point sub-rubric
 * (i.e. exactly which value scores 1 vs 2 vs 3 within each domain).
 *
 * Per the kickoff iron rule — "do not improvise clinical thresholds" —
 * this module does NOT fabricate a PEWS aggregate. It does the part
 * that IS fully specified: flag each vital as low / normal / high
 * against the age-correct band, so a child is never scored on adult
 * thresholds (research doc §7's core safety point). The full PEWS
 * point-allocation table is a **CSO data request** (GATE A follow-up);
 * when supplied it slots in here behind the same pure interface.
 */

export type VitalStatus = "low" | "normal" | "high" | "not_recorded";

export interface PaedVitalFlag {
  parameter: string;
  value: number | null;
  status: VitalStatus;
  normalRange: string;
}

export interface PaedVitalInput {
  respiratoryRate?: number | null;
  heartRate?: number | null;
  systolicBp?: number | null;
}

/** Resolve the age band for a child; null for adults (≥18 → NEWS2). */
export function resolvePaedAgeBand(ageYears: number): PaedAgeBand | null {
  for (const band of PAED_AGE_BANDS) {
    if (ageYears >= band.minAgeYears && ageYears <= band.maxAgeYears) return band;
  }
  return null;
}

/**
 * Flag each provided vital against the age-correct normal range
 * (research doc §7). Returns one flag per known parameter; a missing
 * input is `not_recorded`, never silently `normal` (research doc §10).
 */
export function flagPaediatricVitals(ageYears: number, v: PaedVitalInput): PaedVitalFlag[] {
  const band = resolvePaedAgeBand(ageYears);
  if (!band) {
    // Caller mis-routed an adult here; surface explicitly rather than
    // guessing a range.
    return [];
  }

  return [
    rangeFlag("respiratory_rate", v.respiratoryRate ?? null, band.respRate.min, band.respRate.max),
    rangeFlag("heart_rate", v.heartRate ?? null, band.heartRate.min, band.heartRate.max),
    lowerLimitFlag("systolic_bp", v.systolicBp ?? null, band.systolicBpLowerLimit),
  ];
}

function rangeFlag(
  parameter: string,
  value: number | null,
  min: number,
  max: number,
): PaedVitalFlag {
  const normalRange = `${min}–${max}`;
  if (value === null) return { parameter, value: null, status: "not_recorded", normalRange };
  const status: VitalStatus = value < min ? "low" : value > max ? "high" : "normal";
  return { parameter, value, status, normalRange };
}

function lowerLimitFlag(
  parameter: string,
  value: number | null,
  lowerLimit: number,
): PaedVitalFlag {
  const normalRange = `≥${lowerLimit}`;
  if (value === null) return { parameter, value: null, status: "not_recorded", normalRange };
  const status: VitalStatus = value < lowerLimit ? "low" : "normal";
  return { parameter, value, status, normalRange };
}
