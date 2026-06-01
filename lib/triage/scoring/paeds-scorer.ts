import type { AcuityLevel, ParameterScore } from "../types";

import { PAED_THRESHOLDS, paedHypotensionLimit, resolvePaedBand } from "../reference";

/**
 * Paediatric age-banded scorer — pure, deterministic.
 *
 * Produces a real scoreAcuity (1–5) for a child from the CSO catalog's
 * age-banded ranges (Part C), replacing the old "provisional, not
 * auto-computed" placeholder. The engine folds this into its worse-of
 * exactly like the adult NEWS2 acuity.
 *
 * Honoured rules (verified, see docs/triage-catalog-build-specs.md):
 *  - OVER-FLAG CAVEAT: a single lone out-of-band HR/RR is "moderate" →
 *    L3 (the catalog gives no graded PEWS sub-rubric, so any out-of-band
 *    HR/RR is conservatively moderate, never auto-alarmed to L2/L1); a
 *    single mild SpO₂ (92–95) is L4; nothing escalates on one mild blip.
 *  - ABSOLUTE RED LINES (single value floors regardless of count):
 *    SBP below the age hypotension line → decompensated shock → L1;
 *    glucose < 2.6 → L1 (note: the global Step-0 <3.0 screen fires first
 *    and is the operative L1 trigger — this is defence-in-depth);
 *    SpO₂ < 92 → L2; infant < 3mo + temp ≥ 38 → L2.
 *  - Two or more vitals at "significant"-or-worse → L2 (INFERRED count;
 *    analogue of MEOWS two-yellow + Part-F compensated shock; biases up).
 *  - CONSCIOUSNESS is NOT scored here — U → L1 via Step-0; lethargy /
 *    floppiness etc. are non-numeric red flags in the discriminator
 *    track. The catalog gives no paediatric ACVPU rule; none is invented.
 *  - Missing vitals → not_recorded (never silently normal); provisional.
 */

type PaedSeverity = "normal" | "mild" | "significant" | "severe_redline" | "not_recorded";

export interface PaedScoreInput {
  ageYears: number;
  respiratoryRate: number | null;
  heartRate: number | null;
  systolicBp: number | null;
  spo2: number | null;
  temperature: number | null;
  bloodGlucose: number | null;
  /** Months, when known — only used to distinguish newborn/infant for the <3mo fever red flag. */
  ageMonths?: number | null;
}

export interface PaedScoreResult {
  ruleset: "paediatric_pews";
  acuity: AcuityLevel;
  parameters: ParameterScore[];
  missing: string[];
  provisional: boolean;
  /** Transparent contributor lines for the engine reasoning. */
  reasons: string[];
}

export function scorePaediatric(v: PaedScoreInput): PaedScoreResult {
  const band = resolvePaedBand(v.ageYears);
  const parameters: ParameterScore[] = [];
  const missing: string[] = [];
  const reasons: string[] = [];

  // No band (e.g. 16–17y mis-routed here) → fully provisional, no score.
  if (!band) {
    return {
      ruleset: "paediatric_pews",
      acuity: 3,
      parameters: [],
      missing: [],
      provisional: true,
      reasons: ["No paediatric age band for this age — assess manually."],
    };
  }

  const sev: Record<string, PaedSeverity> = {};

  // Heart rate — out of band = significant (no graded sub-rubric → conservative).
  sev.heart_rate = rangeSeverity(
    "heart_rate",
    v.heartRate,
    band.heartRate.min,
    band.heartRate.max,
    parameters,
    missing,
    band.label,
  );
  // Respiratory rate — same.
  sev.respiratory_rate = rangeSeverity(
    "respiratory_rate",
    v.respiratoryRate,
    band.respRate.min,
    band.respRate.max,
    parameters,
    missing,
    band.label,
  );

  // Systolic BP — below the age hypotension line = decompensated shock (severe red line).
  const hypoLimit = paedHypotensionLimit(v.ageYears);
  if (v.systolicBp === null) {
    sev.systolic_bp = "not_recorded";
    missing.push("systolic_bp");
    parameters.push({
      parameter: "systolic_bp",
      present: false,
      value: null,
      points: 0,
      band: "not recorded",
    });
  } else if (hypoLimit !== null && v.systolicBp < hypoLimit) {
    sev.systolic_bp = "severe_redline";
    parameters.push({
      parameter: "systolic_bp",
      present: true,
      value: v.systolicBp,
      points: 3,
      band: `SBP ${v.systolicBp} < ${hypoLimit} = decompensated shock`,
    });
    reasons.push(
      `SBP ${v.systolicBp} below the age hypotension line (${hypoLimit}) — decompensated shock.`,
    );
  } else if (v.systolicBp < band.systolicNormal.min) {
    sev.systolic_bp = "significant";
    parameters.push({
      parameter: "systolic_bp",
      present: true,
      value: v.systolicBp,
      points: 1,
      band: `SBP ${v.systolicBp} below awake-normal (${band.systolicNormal.min}–${band.systolicNormal.max})`,
    });
  } else {
    sev.systolic_bp = "normal";
    parameters.push({
      parameter: "systolic_bp",
      present: true,
      value: v.systolicBp,
      points: 0,
      band: "normal",
    });
  }

  // SpO₂ — <92 severe; 92–95 mild; ≥96 normal.
  if (v.spo2 === null) {
    sev.spo2 = "not_recorded";
    missing.push("spo2");
    parameters.push({
      parameter: "spo2",
      present: false,
      value: null,
      points: 0,
      band: "not recorded",
    });
  } else if (v.spo2 < PAED_THRESHOLDS.spo2SignificantLt) {
    sev.spo2 = "severe_redline";
    parameters.push({
      parameter: "spo2",
      present: true,
      value: v.spo2,
      points: 3,
      band: `SpO₂ ${v.spo2} < 92 = significant hypoxaemia`,
    });
    reasons.push(`SpO₂ ${v.spo2}% — significant hypoxaemia.`);
  } else if (v.spo2 < PAED_THRESHOLDS.spo2NormalGte) {
    sev.spo2 = "mild";
    parameters.push({
      parameter: "spo2",
      present: true,
      value: v.spo2,
      points: 1,
      band: `SpO₂ ${v.spo2}% (92–95, monitor)`,
    });
  } else {
    sev.spo2 = "normal";
    parameters.push({ parameter: "spo2", present: true, value: v.spo2, points: 0, band: "normal" });
  }

  // Temperature — fever ≥38 mild; infant <3mo + fever = severe red line; hypothermia ≤36 = mild (sepsis hint via cross-vital).
  const ageMonths = v.ageMonths ?? (v.ageYears === 0 ? null : v.ageYears * 12);
  const isYoungInfant = ageMonths !== null && ageMonths < PAED_THRESHOLDS.infantFeverAgeMonthsLt;
  if (v.temperature === null) {
    sev.temperature = "not_recorded";
    missing.push("temperature");
    parameters.push({
      parameter: "temperature",
      present: false,
      value: null,
      points: 0,
      band: "not recorded",
    });
  } else if (v.temperature >= PAED_THRESHOLDS.feverGte && isYoungInfant) {
    sev.temperature = "severe_redline";
    parameters.push({
      parameter: "temperature",
      present: true,
      value: v.temperature,
      points: 3,
      band: `Fever ${v.temperature}°C in infant <3mo = red flag`,
    });
    reasons.push(`Fever ${v.temperature}°C in an infant <3 months — sepsis until excluded.`);
  } else if (v.temperature >= PAED_THRESHOLDS.feverGte) {
    sev.temperature = "mild";
    parameters.push({
      parameter: "temperature",
      present: true,
      value: v.temperature,
      points: 1,
      band: `Fever ${v.temperature}°C`,
    });
  } else if (v.temperature <= PAED_THRESHOLDS.hypothermiaLte) {
    sev.temperature = "mild";
    parameters.push({
      parameter: "temperature",
      present: true,
      value: v.temperature,
      points: 1,
      band: `Hypothermia ${v.temperature}°C`,
    });
  } else {
    sev.temperature = "normal";
    parameters.push({
      parameter: "temperature",
      present: true,
      value: v.temperature,
      points: 0,
      band: "normal",
    });
  }

  // Glucose — <2.6 immediate (defence-in-depth; global Step-0 <3.0 is the operative L1 trigger).
  if (v.bloodGlucose === null) {
    // glucose is not a mandatory paed vital here; absence is not flagged as missing-required.
    sev.glucose = "not_recorded";
  } else if (v.bloodGlucose < PAED_THRESHOLDS.glucoseImmediateLt) {
    sev.glucose = "severe_redline";
    parameters.push({
      parameter: "glucose",
      present: true,
      value: v.bloodGlucose,
      points: 3,
      band: `Glucose ${v.bloodGlucose} < 2.6 = immediate`,
    });
    reasons.push(`Glucose ${v.bloodGlucose} mmol/L — paediatric hypoglycaemia, immediate.`);
  } else {
    sev.glucose = "normal";
  }

  const provisional = missing.length > 0;

  // ── Reduce to acuity (top-down, first match wins). ───────────────
  const values = Object.values(sev);
  const acuity = reduceToAcuity(sev, values, reasons, band.label);

  return { ruleset: "paediatric_pews", acuity, parameters, missing, provisional, reasons };
}

function rangeSeverity(
  parameter: string,
  value: number | null,
  min: number,
  max: number,
  parameters: ParameterScore[],
  missing: string[],
  bandLabel: string,
): PaedSeverity {
  if (value === null) {
    missing.push(parameter);
    parameters.push({ parameter, present: false, value: null, points: 0, band: "not recorded" });
    return "not_recorded";
  }
  if (value < min || value > max) {
    // Out of band — conservative "significant" (no graded sub-rubric in catalog).
    parameters.push({
      parameter,
      present: true,
      value,
      points: 2,
      band: `${value} out of ${bandLabel} range (${min}–${max})`,
    });
    return "significant";
  }
  parameters.push({ parameter, present: true, value, points: 0, band: `normal (${min}–${max})` });
  return "normal";
}

function reduceToAcuity(
  sev: Record<string, PaedSeverity>,
  values: PaedSeverity[],
  reasons: string[],
  bandLabel: string,
): AcuityLevel {
  // 1. Decompensated shock or paed hypoglycaemia → L1.
  if (sev.systolic_bp === "severe_redline" || sev.glucose === "severe_redline") return 1;
  // 2. Any other severe red line (SpO₂<92, infant<3mo fever) → L2.
  if (values.includes("severe_redline")) return 2;
  // 3. Two or more significant-or-worse → L2 (inferred multi-system; biases up).
  const significantCount = values.filter((s) => s === "significant").length;
  if (significantCount >= 2) {
    reasons.push(`Multiple deranged vitals for ${bandLabel} — escalating.`);
    return 2;
  }
  // 4. Exactly one significant → L3.
  if (significantCount === 1) return 3;
  // 5. Two or more mild → L4.
  const mildCount = values.filter((s) => s === "mild").length;
  if (mildCount >= 2) return 4;
  // 6. One isolated mild → L5 (over-flag caveat: no auto-alarm).
  // 7. All present normal → L5.
  return 5;
}
