import type { TriageResult, TriageVitals } from "./types";

/**
 * Per-vital interpretation — a PURE PRESENTATION layer over the engine's
 * already-validated output (News2Result.parameters + derived metrics).
 *
 * It invents NO clinical thresholds. NEWS2 vitals read their severity
 * straight from the engine's per-parameter points (0→normal … 3→critical);
 * glucose reads the engine's glucose flag; oxygen and diastolic get
 * grounded annotations (supplemental-O₂ is a NEWS2 modifier; DBP ≥110 is
 * the research-doc §8 severe-hypertension threshold). Same inputs →
 * same output.
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

export function interpretVitals(vitals: TriageVitals, result: TriageResult): VitalInterpretations {
  // NEWS2-scored vitals read straight from the engine.
  const respiratoryRate = fromNews2(result, "respiratory_rate", vitals.respiratoryRate);
  const spo2 = fromNews2(result, "spo2", vitals.spo2);
  const systolicBp = fromNews2(result, "systolic_bp", vitals.systolicBp);
  const pulse = fromNews2(result, "pulse", vitals.pulse);
  const temperature = fromNews2(result, "temperature", vitals.temperature);
  const consciousness = fromNews2(result, "consciousness", vitals.consciousness);

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
