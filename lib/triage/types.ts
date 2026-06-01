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
  /** Modified Shock Index = HR / MAP. >1.7 flags obstetric haemorrhage early (catalog Part D/F). */
  modifiedShockIndex: number | null;
  modifiedShockIndexFlag: "haemorrhage" | "normal" | null;
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

/* ─── Engine I/O (Steps 0–6, research doc §9) ─────────────────────── */

/** How the patient's pregnancy status is known (drives routing — R3). */
export type PregnancyStatus = "pregnant" | "postpartum_6wk" | "not_pregnant" | "unknown";

/** Patient context that drives population routing + scale selection. */
export interface TriageContext {
  ageYears: number | null;
  pregnancy: PregnancyStatus;
  /** Female of reproductive age — used for the unknown-pregnancy flag. */
  reproductiveAgeFemale: boolean;
  /** Clinician explicitly enabled NEWS2 SpO₂ Scale 2 (COPD/hypercapnic). */
  spo2Scale2Enabled: boolean;
}

/** The full vital set the engine consumes (superset of NEWS2 inputs). */
export interface TriageVitals {
  respiratoryRate: number | null;
  spo2: number | null;
  oxygen: OxygenStatus | null;
  systolicBp: number | null;
  diastolicBp: number | null;
  pulse: number | null;
  consciousness: Acvpu | null;
  temperature: number | null;
  bloodGlucose: number | null;
}

/** Clinician-observed Step-0 life-threat flags (manual). */
export interface LifeThreatFlags {
  airwayCompromise?: boolean;
  absentAgonalBreathing?: boolean;
  cardiacArrestNoPulse?: boolean;
  unresponsive?: boolean;
  activeSeizure?: boolean;
  exsanguinatingHaemorrhage?: boolean;
}

/** A discriminator that fired, with why — for transparent reasoning. */
export interface FiredDiscriminator {
  code: string;
  label: string;
  minAcuity: AcuityLevel;
  source: "manual" | "derived";
}

/** Optional trend + clinician-gated baseline adjustment (Step 5). */
export interface TriageContextAdjustments {
  /** Prior triage level for this patient (trend). A worsening trend escalates. */
  priorLevel?: AcuityLevel | null;
  /**
   * Clinician-gated baseline temper (research doc §0). May raise the
   * level number (less acute) but NEVER past the floor: a life-threat
   * or a fired red-flag. Must carry a reason.
   */
  baselineAdjustment?: { temperToLevel: AcuityLevel; reason: string } | null;
}

export interface TriageInput {
  context: TriageContext;
  vitals: TriageVitals;
  lifeThreatFlags?: LifeThreatFlags;
  /** Manual discriminator codes the clinician ticked. */
  presentDiscriminators?: string[];
  adjustments?: TriageContextAdjustments;
}

export interface TriageResult {
  ruleset: TriageRuleset;
  lifeThreat: boolean;
  lifeThreatReasons: string[];
  /** Final acuity after worse-of + trend + (floored) baseline. 1 = most acute. */
  level: AcuityLevel;
  colour: AcuityColour;
  targetMinutes: number;
  disposition: string;
  /** Acuity implied by the physiological score alone (null if no numeric score). */
  scoreAcuity: AcuityLevel | null;
  news2: News2Result | null;
  derived: DerivedMetrics;
  firedDiscriminators: FiredDiscriminator[];
  /** Acuity implied by the worst fired discriminator (null if none fired). */
  discriminatorAcuity: AcuityLevel | null;
  trendEscalated: boolean;
  baselineApplied: boolean;
  /** ESI v5: a required vital (HR/RR/SpO₂) is missing → cannot issue a
   * reassuring level; floored to L3 + banner (ENA 2023). */
  incompleteVitals: boolean;
  /** ESI v5: required vitals still missing (engine parameter codes). */
  missingRequiredVitals: string[];
  /** ESI v5: high-risk "danger-zone" vitals that reassessed acuity up. */
  dangerVitals: string[];
  /** Acuity implied by the ESI-v5 mandatory-vitals/danger rule (or null). */
  esiV5Acuity: AcuityLevel | null;
  /** Score is provisional — some vitals missing (research doc §10). */
  provisional: boolean;
  /** Human-readable contributions — the transparency requirement (kickoff §0.2). */
  reasoning: string[];
  /** Non-blocking flags for the clinician (e.g. confirm pregnancy). */
  flags: string[];
}
