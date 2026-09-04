/**
 * General Examination — types. Tap-first three-state findings (present / absent /
 * not-examined; not-examined ≠ normal, like the ROS) + value-set chips. The
 * finding catalog is CSO-signed code reference data (see catalog.ts). Captured
 * findings live in the clerkship section_data. Decision-support — the clinician
 * examines + records; nothing is auto-recorded. See ADR 0066.
 */

export type FindingState = "present" | "absent" | "not_examined";

/** A catalog finding (what to look for + its tap value-set). */
export interface ExamFinding {
  code: string;
  group: string;
  display: string;
  /**
   * "select" — a graded single-select (wellbeing, consciousness, JVP…); pick one
   * value (or not-examined). "panel" — three-state (not-examined / normal /
   * findings) with a multi value-set surfaced when there are findings.
   */
  kind: "select" | "panel";
  /** Tap value-set: the graded values (select) or the abnormalities (panel). */
  options: string[];
  /** A spot-diagnosis / pattern (a positive prompts the focused exam — §2). */
  pattern?: boolean;
  /** Must-not-miss sign (drives a prompt, never a diagnosis). */
  mustNotMiss?: boolean;
  ugandaFlag?: string;
}

/** A captured general-exam finding (three-state + optional values). */
export interface ExamObservation {
  code: string;
  group: string;
  display: string;
  state: FindingState;
  /** Tapped value-set chips when present (optional). */
  values?: string[];
  note?: string;
}

/** A recorded vital-signs set (record-new; carry-forward set comes from triage). */
export interface RecordedVitals {
  hr?: number;
  rr?: number;
  spo2?: number;
  sbp?: number;
  dbp?: number;
  tempC?: number;
  glucose?: number;
  /** GCS captured by component (Eye 1–4 · Verbal 1–5 · Motor 1–6); total = sum. */
  gcsE?: number;
  gcsV?: number;
  gcsM?: number;
  /** Anthropometry (ADR 0078). Nutritional status is a vital sign on a wasting
   * ward, not an optional extra — weight_loss and fatigue both rank on it.
   * MUAC is included deliberately: it is the standard adult nutrition screen in
   * Ugandan TB/HIV programmes and needs only a tape, not a working scale. */
  weightKg?: number;
  heightCm?: number;
  muacCm?: number;
  recordedAtIso?: string;
}

/** GCS total from components, or undefined until all three are recorded. */
export function gcsTotal(v: { gcsE?: number; gcsV?: number; gcsM?: number }): number | undefined {
  if (v.gcsE == null || v.gcsV == null || v.gcsM == null) return undefined;
  return v.gcsE + v.gcsV + v.gcsM;
}

/** BMI (kg/m²) from a recorded weight + height, or undefined until both exist.
 * Never guesses: a missing height is not a default height. */
export function bmi(v: { weightKg?: number; heightCm?: number }): number | undefined {
  if (v.weightKg == null || v.heightCm == null) return undefined;
  if (v.weightKg <= 0 || v.heightCm <= 0) return undefined;
  const m = v.heightCm / 100;
  return v.weightKg / (m * m);
}
