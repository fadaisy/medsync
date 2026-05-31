/**
 * Smart Triage Engine — shared types.
 *
 * Client-safe (no server-only imports) so both server actions and any
 * future client preview can share the contract. The scoring functions
 * in ./scoring are PURE and deterministic — these types describe their
 * inputs and outputs.
 *
 * Clinical source of truth: docs/clinical/triage-medical-research.md.
 * Nothing here invents a threshold; the numbers live in ./constants,
 * transcribed verbatim from that document.
 */

/** The 5-tier acuity spine (research doc §1). 1 = most acute. */
export type AcuityLevel = 1 | 2 | 3 | 4 | 5;

export type AcuityColour = "red" | "orange" | "yellow" | "green" | "blue";

/** Which validated ruleset a patient is scored under (research doc §7/§8). */
export type TriageRuleset = "adult_news2" | "paediatric_pews" | "obstetric_meows";

/**
 * ACVPU consciousness scale (NEWS2 2017). "C" = NEW confusion/delirium —
 * the load-bearing distinction that scores +3 (research doc §3, §A.6/R4).
 */
export type Acvpu = "A" | "C" | "V" | "P" | "U";

/** Whether the patient is on supplemental oxygen (NEWS2 +2). */
export type OxygenStatus = "air" | "oxygen";

/**
 * NEWS2 SpO₂ scale. Scale 2 is ONLY for confirmed hypercapnic
 * respiratory failure and must be explicitly clinician-enabled
 * (research doc §3) — never auto-defaulted.
 */
export type Spo2Scale = "scale1" | "scale2";

/**
 * A single NEWS2 parameter's scored contribution — the transparency
 * unit. `points` is its 0–3 weight; `value` is what was measured;
 * `band` is a human label ("RR 26 = +3"). Missing inputs surface as
 * `present: false` so the engine can mark the score provisional rather
 * than silently treating a gap as normal (research doc §10).
 */
export interface ParameterScore {
  parameter: string;
  present: boolean;
  value: number | string | null;
  points: number;
  band: string;
}

/** Result of a NEWS2 computation — fully transparent + reproducible. */
export interface News2Result {
  ruleset: "adult_news2";
  total: number;
  /** True if ANY single parameter scored 3 — the "red score" rule (research doc §3). */
  hasSingleParameterThree: boolean;
  parameters: ParameterScore[];
  /** Inputs that were missing → score is provisional until obtained. */
  missing: string[];
  provisional: boolean;
}

/** Raw adult vital inputs for NEWS2. Any field may be null (missing). */
export interface AdultVitals {
  respiratoryRate: number | null;
  spo2: number | null;
  spo2Scale: Spo2Scale;
  oxygen: OxygenStatus | null;
  systolicBp: number | null;
  pulse: number | null;
  consciousness: Acvpu | null;
  temperature: number | null;
}

/** Derived "smart" metrics (research doc §6) — the occult-instability layer. */
export interface DerivedMetrics {
  shockIndex: number | null;
  shockIndexFlag: "normal" | "occult_shock" | "shock" | null;
  pulsePressure: number | null;
  pulsePressureFlag: "narrow" | "normal" | "wide" | null;
  meanArterialPressure: number | null;
  qsofa: QsofaResult | null;
  glucoseFlag: "hypoglycaemia" | "normal" | "hyperglycaemia_dka_screen" | null;
}

/** qSOFA sepsis overlay (research doc §5). ≥2 + infection → sepsis pathway. */
export interface QsofaResult {
  score: number;
  respiratoryRatePoint: boolean;
  alteredMentationPoint: boolean;
  hypotensionPoint: boolean;
}
