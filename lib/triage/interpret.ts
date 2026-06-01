import type { TriageResult, TriageVitals } from "./types";

import { ADULT_BP_CLINICAL, ADULT_TEMP_CLINICAL } from "./reference";

/**
 * Per-vital interpretation — a PURE PRESENTATION layer over the engine's
 * already-validated output (News2Result.parameters + derived metrics).
 *
 * NEWS2 vitals read their severity from the engine's per-parameter
 * points — EXCEPT blood pressure and temperature, which also carry a
 * separate CLINICAL classification (BP & Temperature Reference §1b/§4b).
 * This is the "scores 0 ≠ normal" correction: NEWS2 scores systolic
 * 111–219 as 0, but 180 systolic is severe hypertension, not normal. So
 * BP/temp take the WORSE of the NEWS2-derived tone and the clinical
 * tone, and show the clinical label when it's the more severe — a
 * NEWS2-0 high BP must never display "Normal". (Acuity is unaffected;
 * hypertensive emergencies escalate via the red-flag layer, Step 3.)
 */

export type VitalTone = "normal" | "borderline" | "abnormal" | "critical" | "missing" | "info";

export interface VitalInterpretation {
  label: string;
  tone: VitalTone;
  /** NEWS2 contribution where applicable (else null). */
  points: number | null;
}

export type VitalKey =
  | "respiratoryRate"
  | "spo2"
  | "oxygen"
  | "systolicBp"
  | "diastolicBp"
  | "pulse"
  | "consciousness"
  | "temperature"
  | "bloodGlucose";

export type VitalInterpretations = Record<VitalKey, VitalInterpretation>;

const POINTS_TONE: Record<number, VitalTone> = {
  0: "normal",
  1: "borderline",
  2: "abnormal",
  3: "critical",
};

const TONE_WORD: Record<VitalTone, string> = {
  normal: "Normal",
  borderline: "Borderline",
  abnormal: "Abnormal",
  critical: "Critical",
  missing: "Not recorded",
  info: "",
};

/** Severity rank for "take the worse" (higher = more severe). */
const TONE_RANK: Record<VitalTone, number> = {
  missing: 0,
  info: 0,
  normal: 1,
  borderline: 2,
  abnormal: 3,
  critical: 4,
};

function worseOf(a: VitalTone, b: VitalTone): VitalTone {
  return TONE_RANK[a] >= TONE_RANK[b] ? a : b;
}

function fromNews2(
  result: TriageResult,
  paramName: string,
  value: number | string | null,
): VitalInterpretation {
  if (value === null) return { label: TONE_WORD.missing, tone: "missing", points: null };
  const p = result.news2?.parameters.find((x) => x.parameter === paramName);
  if (!p || !p.present) {
    // Paeds/obstetric (no NEWS2) — value present but not scored here.
    return { label: "Recorded · assess on chart", tone: "info", points: null };
  }
  const tone = POINTS_TONE[p.points] ?? "info";
  const word = TONE_WORD[tone];
  return {
    label: p.points > 0 ? `${word} · NEWS +${p.points}` : word,
    tone,
    points: p.points,
  };
}

/**
 * Adult systolic CLINICAL classification (§1b) — the "scores 0 ≠ normal"
 * correction. Returns null when the value isn't clinically notable (the
 * NEWS2 reading then stands). Hypertension (which NEWS2 scores 0) is the
 * key case this rescues from a false "Normal".
 */
function clinicalSystolic(sys: number): { label: string; tone: VitalTone } | null {
  const c = ADULT_BP_CLINICAL;
  if (sys >= c.severeSysGte) return { label: "Severe hypertension", tone: "critical" };
  if (sys >= c.htnSysGte)
    return { label: "Hypertension (not normal — NEWS scores 0)", tone: "abnormal" };
  if (sys >= c.elevatedSysGte) return { label: "Elevated / high-normal", tone: "borderline" };
  return null; // hypotensive / normal-range → NEWS2 reading stands
}

/**
 * Adult temperature CLINICAL classification (§4b). NEWS2's temperature
 * banding is already clinically aligned, so the only gap it under-weights
 * is hyperpyrexia (≥41 → emergency; NEWS2 caps temp at +2). Returns null
 * otherwise so the NEWS2 reading stands.
 */
function clinicalTemp(t: number): { label: string; tone: VitalTone } | null {
  if (t >= ADULT_TEMP_CLINICAL.hyperpyrexiaGte) {
    return { label: "Hyperpyrexia (≥41) — emergency", tone: "critical" };
  }
  return null;
}

/**
 * Overlay a clinical classification onto a NEWS2-derived interpretation.
 * Only applies to a present, numeric, NEWS2-scored value (adults); takes
 * the WORSE tone, and adopts the clinical label when the clinical tone is
 * at least as severe — so a NEWS2-0 high BP shows "Hypertension", not
 * "Normal", but a NEWS2-flagged value is never softened.
 */
function withClinical(
  base: VitalInterpretation,
  value: number | null,
  classify: (v: number) => { label: string; tone: VitalTone } | null,
): VitalInterpretation {
  if (value === null || base.points === null) return base; // missing or not adult-scored
  const clin = classify(value);
  if (!clin) return base;
  const tone = worseOf(base.tone, clin.tone);
  // Show the clinical label when it drove the (more severe) tone.
  const label = TONE_RANK[clin.tone] >= TONE_RANK[base.tone] ? clin.label : base.label;
  return { label, tone, points: base.points };
}

export function interpretVitals(vitals: TriageVitals, result: TriageResult): VitalInterpretations {
  // NEWS2-scored vitals read straight from the engine.
  const respiratoryRate = fromNews2(result, "respiratory_rate", vitals.respiratoryRate);
  const spo2 = fromNews2(result, "spo2", vitals.spo2);
  const pulse = fromNews2(result, "pulse", vitals.pulse);
  const consciousness = fromNews2(result, "consciousness", vitals.consciousness);

  // Systolic BP — NEWS2 score OVERLAID with the clinical classification
  // (the "scores 0 ≠ normal" correction): a NEWS2-0 high BP shows its
  // clinical category, never "Normal".
  const systolicBp = withClinical(
    fromNews2(result, "systolic_bp", vitals.systolicBp),
    vitals.systolicBp,
    clinicalSystolic,
  );

  // Temperature — NEWS2 score overlaid with hyperpyrexia (≥41).
  const temperature = withClinical(
    fromNews2(result, "temperature", vitals.temperature),
    vitals.temperature,
    clinicalTemp,
  );

  // Supplemental oxygen — a NEWS2 +2 modifier, not a scored row.
  const oxygen: VitalInterpretation =
    vitals.oxygen === null
      ? { label: TONE_WORD.missing, tone: "missing", points: null }
      : vitals.oxygen === "oxygen"
        ? { label: "On O₂ · NEWS +2", tone: "abnormal", points: 2 }
        : { label: "Room air", tone: "normal", points: 0 };

  // Glucose — read the engine's validated flag (research doc §6/§11).
  let bloodGlucose: VitalInterpretation;
  if (vitals.bloodGlucose === null) {
    bloodGlucose = { label: TONE_WORD.missing, tone: "missing", points: null };
  } else if (result.derived.glucoseFlag === "hypoglycaemia") {
    bloodGlucose = { label: "Hypoglycaemia (< 3.0)", tone: "critical", points: null };
  } else if (result.derived.glucoseFlag === "hyperglycaemia_dka_screen") {
    bloodGlucose = { label: "High · screen for DKA", tone: "abnormal", points: null };
  } else {
    bloodGlucose = { label: "Normal", tone: "normal", points: null };
  }

  // Diastolic — not a NEWS2 row; anchored to the §8 severe-HTN threshold
  // and the engine's pulse-pressure flag.
  let diastolicBp: VitalInterpretation;
  if (vitals.diastolicBp === null) {
    diastolicBp = { label: TONE_WORD.missing, tone: "missing", points: null };
  } else if (vitals.diastolicBp >= 110) {
    diastolicBp = { label: "Severe hypertension range", tone: "abnormal", points: null };
  } else if (result.derived.pulsePressureFlag === "narrow") {
    diastolicBp = { label: "Narrow pulse pressure", tone: "borderline", points: null };
  } else {
    diastolicBp = { label: "Normal", tone: "normal", points: null };
  }

  return {
    respiratoryRate,
    spo2,
    oxygen,
    systolicBp,
    diastolicBp,
    pulse,
    consciousness,
    temperature,
    bloodGlucose,
  };
}
