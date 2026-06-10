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
  gcs?: number;
  recordedAtIso?: string;
}
