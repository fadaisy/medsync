import type { DerivedMetrics, QsofaResult } from "../types";

import { GLUCOSE, PULSE_PRESSURE_NARROW_FRACTION, QSOFA, SHOCK_INDEX } from "../constants";

/**
 * Derived "smart" metrics — pure, deterministic (kickoff §0.1).
 *
 * The physiological-reasoning layer (research doc §6) that catches the
 * "well-appearing ill": occult shock, narrowing pulse pressure, sepsis
 * (qSOFA overlay §5), and glucose extremes (§6/§11). Every metric is
 * null-safe — a missing input yields a null metric, never a fabricated
 * one (research doc §10).
 */
export interface DerivedInput {
  pulse?: number | null;
  systolicBp?: number | null;
  diastolicBp?: number | null;
  respiratoryRate?: number | null;
  consciousness?: "A" | "C" | "V" | "P" | "U" | null;
  bloodGlucose?: number | null;
}

export function computeDerivedMetrics(input: DerivedInput): DerivedMetrics {
  const pulse = input.pulse ?? null;
  const sbp = input.systolicBp ?? null;
  const dbp = input.diastolicBp ?? null;
  const rr = input.respiratoryRate ?? null;
  const acvpu = input.consciousness ?? null;
  const glucose = input.bloodGlucose ?? null;

  // Shock Index = HR / SBP (research doc §6)
  let shockIndex: number | null = null;
  let shockIndexFlag: DerivedMetrics["shockIndexFlag"] = null;
  if (pulse !== null && sbp !== null && sbp > 0) {
    shockIndex = pulse / sbp;
    shockIndexFlag =
      shockIndex >= SHOCK_INDEX.SHOCK_GTE
        ? "shock"
        : shockIndex > SHOCK_INDEX.OCCULT_SHOCK_GT
          ? "occult_shock"
          : "normal";
  }

  // Pulse pressure = SBP − DBP; narrow if < 25% of SBP (research doc §6)
  let pulsePressure: number | null = null;
  let pulsePressureFlag: DerivedMetrics["pulsePressureFlag"] = null;
  if (sbp !== null && dbp !== null) {
    pulsePressure = sbp - dbp;
    pulsePressureFlag = pulsePressure < sbp * PULSE_PRESSURE_NARROW_FRACTION ? "narrow" : "normal";
    // "wide" is a softer/aetiology hint in the research doc (sepsis,
    // aortic) without a crisp numeric cutoff — left as normal vs narrow
    // here; the discriminator layer carries the sepsis/aortic flags.
  }

  // Mean arterial pressure = DBP + (SBP − DBP)/3 (research doc §6/§8)
  let meanArterialPressure: number | null = null;
  if (sbp !== null && dbp !== null) {
    meanArterialPressure = dbp + (sbp - dbp) / 3;
  }

  // qSOFA (research doc §5)
  let qsofa: QsofaResult | null = null;
  if (rr !== null || sbp !== null || acvpu !== null) {
    const respiratoryRatePoint = rr !== null && rr >= QSOFA.RESP_RATE_GTE;
    const hypotensionPoint = sbp !== null && sbp <= QSOFA.SYSTOLIC_BP_LTE;
    const alteredMentationPoint = acvpu !== null && acvpu !== "A";
    qsofa = {
      respiratoryRatePoint,
      hypotensionPoint,
      alteredMentationPoint,
      score:
        (respiratoryRatePoint ? 1 : 0) +
        (hypotensionPoint ? 1 : 0) +
        (alteredMentationPoint ? 1 : 0),
    };
  }

  // Glucose (research doc §6/§11)
  let glucoseFlag: DerivedMetrics["glucoseFlag"] = null;
  if (glucose !== null) {
    glucoseFlag =
      glucose < GLUCOSE.HYPO_LT
        ? "hypoglycaemia"
        : glucose > GLUCOSE.HYPER_DKA_SCREEN_GT
          ? "hyperglycaemia_dka_screen"
          : "normal";
  }

  return {
    shockIndex,
    shockIndexFlag,
    pulsePressure,
    pulsePressureFlag,
    meanArterialPressure,
    qsofa,
    glucoseFlag,
  };
}
