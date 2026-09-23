/**
 * Resus Desk v2 — shared contracts (GATE A §4–§9).
 *
 * The types every v2 module agrees on: the episode lifecycle, the patient
 * context, the typed payloads of the v2 timeline events, and the shapes the
 * pure engines return to the UI. No logic lives here.
 */
import type { AbcdeLetter } from "./types";

/* ─── Lifecycle ─────────────────────────────────────────────────────────── */

export const EPISODE_PHASES = ["survey", "arrest", "post_rosc", "boarding"] as const;
export type EpisodePhase = (typeof EPISODE_PHASES)[number];

export const OUTCOME_CODES = [
  "stabilised",
  "rosc_sustained",
  "rosc_not_sustained",
  "died_after_cpr",
  "died_cpr_not_attempted",
  "transferred_out",
] as const;
export type OutcomeCode = (typeof OUTCOME_CODES)[number];

export const CLOSURE_KINDS = ["bedside", "administrative"] as const;
export type ClosureKind = (typeof CLOSURE_KINDS)[number];

export const CARE_LEVELS = ["ward", "l1", "l2", "l3"] as const;
export type CareLevel = (typeof CARE_LEVELS)[number];

export const LEVEL_MISMATCH_CODES = [
  "no_bed",
  "ceiling_of_care",
  "family_declined",
  "transfer_arranged",
  "clinical_judgement",
] as const;
export type LevelMismatchCode = (typeof LEVEL_MISMATCH_CODES)[number];

/** v2 destinations (legacy `deceased` stays readable; v2 writes `mortuary`). */
export const DESTINATIONS = [
  "icu",
  "hdu",
  "ward",
  "theatre",
  "cath_lab",
  "labour_ward",
  "transferred",
  "discharged",
  "mortuary",
] as const;
export type Destination = (typeof DESTINATIONS)[number];

/* ─── Patient context (entered once; GATE A §4) ─────────────────────────── */

export const PREGNANCY_STATES = ["none", "possible", "confirmed", "postpartum"] as const;
export type PregnancyState = (typeof PREGNANCY_STATES)[number];

export interface PatientContextFlags {
  trauma: boolean;
  chestTrauma: boolean;
  spinalInjury: boolean;
  headInjury: boolean;
  activeBleeding: boolean;
  allergenTrigger: boolean;
  pregnancy: PregnancyState;
  /** Gestation in weeks when pregnancy is confirmed (ALS-MOD-07 > 20 w). */
  gestationWeeks: number | null;
  knownAsthma: boolean;
  copdRisk: boolean;
  peSuspected: boolean;
  opioidsSuspected: boolean;
  alcoholMalnourished: boolean;
  feverMeningism: boolean;
  serotonergicOrNeuroleptic: boolean;
  environmentalExposure: boolean;
  febrileChild: boolean;
  /** ICS: BMI > 40 changes the level of care (CO-R15/R16). */
  bmiOver40: boolean;
  /** Renal / dialysis patient (ALS-RC-03 pre-fill, ALS-MOD-14). */
  renalDialysis: boolean;
  /** Local anaesthetic systemic toxicity suspected (ALS-MOD-10). */
  localAnaestheticToxicity: boolean;
}

export const EMPTY_CONTEXT: PatientContextFlags = {
  trauma: false,
  chestTrauma: false,
  spinalInjury: false,
  headInjury: false,
  activeBleeding: false,
  allergenTrigger: false,
  pregnancy: "none",
  gestationWeeks: null,
  knownAsthma: false,
  copdRisk: false,
  peSuspected: false,
  opioidsSuspected: false,
  alcoholMalnourished: false,
  feverMeningism: false,
  serotonergicOrNeuroleptic: false,
  environmentalExposure: false,
  febrileChild: false,
  bmiOver40: false,
  renalDialysis: false,
  localAnaestheticToxicity: false,
};

/** Toggles that stay inside one step (not patient-level). */
export interface StepLocalToggles {
  /** A — gag present / clenched jaw. */
  gagPresent: boolean;
  /** D — low respiratory rate (also suggested from vitals, RR ≤ 8). */
  lowRespRate: boolean;
  /** E — patient left exposed (re-cover!). */
  notRecovered: boolean;
}

export const EMPTY_LOCAL: StepLocalToggles = {
  gagPresent: false,
  lowRespRate: false,
  notRecovered: false,
};

/* ─── v2 event payloads (typed; E3) ─────────────────────────────────────── */

/** `context` event: the full flag set (latest wins). */
export interface ContextPayload {
  flags: PatientContextFlags;
  label: string;
}

export interface ArrestSignsInput {
  responsive: boolean | null;
  breathingNormally: boolean | null;
  centralPulse: boolean | null;
}

/** `arrest_detected` (v2 adds arrestSeq, source and the Utstein fields). */
export interface ArrestDetectedPayload {
  arrestSeq: number;
  reason: string;
  signs?: ArrestSignsInput;
  source: "desk" | "step" | "triage_rapid_red";
  witnessed?: boolean | null;
  monitored?: boolean | null;
  collapseAtIso?: string | null;
  cprBeforeDeclarationAtIso?: string | null;
  label: string;
}

export const RHYTHMS = ["vf_pvt", "pea", "asystole", "organised"] as const;
export type Rhythm = (typeof RHYTHMS)[number];

export interface RhythmCheckPayload {
  arrestSeq: number;
  rhythm: Rhythm;
  /** For "organised": was a pulse found? (yes → ROSC recorded separately). */
  pulse?: boolean | null;
  label: string;
}

export interface ShockPayload {
  arrestSeq: number;
  energyJ: number | null;
  energySource: "profile" | "highest" | "manual";
  /** Part of a stacked sequence (witnessed + monitored VF only; counts as shock 1). */
  stacked?: boolean;
  label: string;
}

export const ROSC_SIGNS = ["pulse", "bp_arterial_waveform", "etco2_rise", "signs_of_life"] as const;
export type RoscSign = (typeof ROSC_SIGNS)[number];

export interface RoscPayload {
  arrestSeq: number;
  signs: RoscSign[];
  label: string;
}

export const ARREST_PROCEDURES = [
  "airway_bvm",
  "airway_sga",
  "airway_ett",
  "iv_attempt_failed",
  "iv_access",
  "io_access",
  "compressor_swap",
  "pads_antero_posterior",
  "left_uterine_displacement",
  "decompression",
  "pericardiocentesis",
  "hysterotomy",
] as const;
export type ArrestProcedure = (typeof ARREST_PROCEDURES)[number];

/** `procedure` event in arrest (payload.arrestProcedure set). */
export interface ArrestProcedurePayload {
  arrestSeq: number;
  arrestProcedure: ArrestProcedure;
  /** ETT only: sustained ETCO₂ trace confirmed? */
  ettTrace?: "yes" | "no" | "unavailable";
  /** compressor_swap: who is now on the chest. */
  toUserId?: string | null;
  toName?: string | null;
  label: string;
}

export const CAUSE_KEYS = [
  "hypoxia",
  "hypovolaemia",
  "potassium_metabolic",
  "temperature",
  "thrombosis",
  "tension",
  "tamponade",
  "toxins",
] as const;
export type CauseKey = (typeof CAUSE_KEYS)[number];

export const CAUSE_STATES = [
  "not_assessed",
  "suspected",
  "excluded",
  "treating",
  "treated",
] as const;
export type CauseState = (typeof CAUSE_STATES)[number];

/** `decision` event variants (payload.decision discriminates). */
export interface ReversibleCausePayload {
  decision: "reversible_cause";
  arrestSeq: number;
  cause: CauseKey;
  state: CauseState;
  label: string;
}

export const STOP_REASONS = [
  "no_response_to_als",
  "persistent_asystole",
  "known_wishes_or_plan",
  "irreversible_condition",
  "other",
] as const;
export type StopReason = (typeof STOP_REASONS)[number];

export interface ResuscitationStoppedPayload {
  arrestSeq: number;
  reasons: StopReason[];
  otherReason: string | null;
  teamAsked: boolean;
  objection: string | null;
  seniorConsulted: { name: string; cadre: string; mode: "in_person" | "phone" } | null;
  family: "present" | "informed" | "not_reachable" | null;
  /** The criteria/flags displayed on the review at the moment of the decision. */
  shown: string[];
  /** D9: a non-doctor/CO recorded it — a senior co-sign is pending. */
  seniorCosignPending: boolean;
  label: string;
}

export interface DeathConfirmedPayload {
  observationStartedAtIso: string;
  confirmedAtIso: string;
  confirmingUserId: string;
  confirmingName: string | null;
  criteria: {
    unconscious: boolean;
    apnoea: boolean;
    noCirculation: boolean;
    pupilsUnreactive: boolean;
    noMotorResponse: boolean;
    cornealReflexesAbsent: boolean | null;
  };
  supportedBy: ("ecg_asystole" | "no_arterial_trace" | "echo_no_activity")[];
  ventilatorDisconnected: boolean | null;
  familyToldTimeMayDiffer: boolean;
  label: string;
}

export interface CprNotAttemptedPayload {
  decision: "cpr_not_attempted";
  reason: "treatment_limitation" | "irreversible_death";
  detail: string;
  label: string;
}

export interface TreatmentLimitationPayload {
  decision: "treatment_limitation";
  summary: string;
  rationale: string;
  familyInvolvement: string;
  label: string;
}

export const BUNDLE_ITEM_STATES = ["done", "not_indicated", "not_available"] as const;
export type BundleItemState = (typeof BUNDLE_ITEM_STATES)[number];

export interface PostRoscItemPayload {
  decision: "post_rosc_item";
  itemId: string;
  state: BundleItemState;
  label: string;
}

export interface ObeysCommandsPayload {
  decision: "obeys_commands";
  value: boolean;
  label: string;
}

export interface DispositionPayload {
  decision: "disposition";
  suggestedLevel: CareLevel | null;
  chosenLevel: CareLevel;
  destination: Destination;
  unitId: string | null;
  mismatch: LevelMismatchCode | null;
  mismatchNote: string | null;
  ruleIds: string[];
  bed: "requested" | "accepted" | "not_available" | null;
  label: string;
}

export interface AdmissionRequestPayload {
  decision: "admission_request";
  seam: "pending_intent";
  level: CareLevel;
  destination: Destination;
  label: string;
}

/** `note` with a vital annotation (artefact) — the value leaves derivation. */
export interface VitalAnnotationPayload {
  noteKind: "vital_annotation";
  vitalEventId: string;
  fields: string[];
  artefact: boolean;
  reason: string;
  label: string;
}

/* ─── Survey engine outputs (GATE A §3–§5) ──────────────────────────────── */

export type StepVisual = "pending" | "clear" | "addressed" | "threatened" | "active_threat";

export interface StepState {
  step: AbcdeLetter;
  /** The step engine's state over recorded ∪ vitals-derived findings. */
  engineState: string | null;
  /** The step engine's state over the recorded findings only. */
  recordedState: string | null;
  /** A recorded findings set exists that the engine can classify. */
  assessed: boolean;
  /** Vitals-derived findings made the state worse than recorded alone. */
  fromVitals: boolean;
  /** The Q13 codes derived from fresh vitals for this step. */
  derivedCodes: string[];
  visual: StepVisual;
  /** Failed + indicated + in-progress actions for this step. */
  outstanding: number;
}

export type DoNowKind =
  | "action"
  | "assess"
  | "return_to_a"
  | "vitals_stale"
  | "core_temp"
  | "glucose"
  | "allergies"
  | "protocol";

export interface DoNowItem {
  id: string;
  kind: DoNowKind;
  step: AbcdeLetter | null;
  label: string;
  /** Evidence line ("because SBP 70, MAP 63"). */
  because: string | null;
  /** Lower = more urgent. */
  rank: number;
  /** For kind "action": the action to act on. */
  action?: { step: AbcdeLetter; actionId: string; code: string; state: string };
}

/* ─── Arrest engine output (GATE A §7; docs/clinical/resus-als-clinical-catalog.md) ─ */

export interface BayProfile {
  id: string;
  label: string;
  waveform:
    | "monophasic"
    | "biphasic_truncated_exponential"
    | "rectilinear_biphasic"
    | "pulsed_biphasic"
    | "unknown";
  /** Manufacturer sequence entered by biomedical engineering (J), or null. */
  energySequenceJ: number[] | null;
  capnography: boolean;
  ultrasound: boolean;
  mechanicalCpr: boolean;
  ecpr: boolean;
}

export interface ArrestContext {
  ageYears: number | null;
  weightKg: number | null;
  flags: PatientContextFlags;
  /** Latest E core temperature (site = core), °C. */
  coreTempC: number | null;
  /** Latest vitals temperature (site unknown), °C. */
  otherTempC: number | null;
  antiarrhythmic: "amiodarone" | "lidocaine";
  bayProfile: BayProfile | null;
  /** Leader / role holders for the compressor prompt. */
  cprProvider: { userId: string; name: string | null } | null;
}

export type CycleStatus = "running" | "prepare" | "due" | "overdue";
export type AdrenalineStatus =
  | "not_yet_eligible"
  | "due_now"
  | "waiting"
  | "window_open"
  | "overdue"
  | "withheld"
  | "suppressed_child";
export type AntiarrhythmicStatus =
  | "not_eligible"
  | "due"
  | "complete"
  | "delayed_hypothermia"
  | "suppressed_child";

export interface ArrestPrompt {
  id: string;
  /** The catalog rule this prompt comes from (ALS-…). */
  ruleId: string;
  text: string;
  severity: "info" | "due" | "overdue";
}

export interface CauseTile {
  key: CauseKey;
  state: CauseState;
  /** Survey evidence behind a "suspected" pre-fill (never auto-excluded). */
  evidence: { eventId: string | null; label: string }[];
  /** Verified numbers / actions for the tile (ALS-RC-…). */
  ruleId: string;
}

export interface ArrestState {
  /** 0 = no arrest ever declared in this episode. */
  arrestSeq: number;
  status: "none" | "in_arrest" | "rosc" | "stopped";
  /** Age < 16 — clocks + logging only, no numbers (ALS-MOD-16). */
  paediatric: boolean;
  arrestAtMs: number | null;
  cprStartMs: number | null;
  /** Elapsed since this arrest was declared (ms). */
  arrestElapsedMs: number;
  /** Total CPR time across intermittent ROSC within this arrest (ms). */
  cprElapsedMs: number;
  cycle: {
    number: number;
    startedAtMs: number | null;
    dueAtMs: number | null;
    status: CycleStatus;
  };
  rhythms: { atMs: number; rhythm: Rhythm }[];
  firstRhythm: Rhythm | null;
  currentRhythm: Rhythm | null;
  shocks: {
    count: number;
    lastAtMs: number | null;
    /** Consecutive shocks while VF/pVT persists (refractory VF at ≥ 3). */
    consecutive: number;
    refractoryVf: boolean;
    energy:
      | { kind: "profile"; joules: number; profileLabel: string }
      | { kind: "highest" }
      | { kind: "suppressed_child" };
    /** Hypothermia < 30 °C after 3 shocks: further shocks delayed (ALS-MOD-02). */
    delayed: boolean;
  };
  adrenaline: {
    doses: number;
    lastAtMs: number | null;
    status: AdrenalineStatus;
    opensAtMs: number | null;
    overdueAtMs: number | null;
    reason: string;
    ruleIds: string[];
  };
  antiarrhythmic: {
    drug: "amiodarone" | "lidocaine";
    dosesGiven: number;
    nextDoseMg: number | null;
    status: AntiarrhythmicStatus;
    reason: string;
    ruleIds: string[];
  };
  airway: {
    level: "none" | "bvm" | "sga" | "ett";
    ettTrace: "yes" | "no" | "unavailable" | null;
    continuousCompressions: boolean;
  };
  access: { iv: boolean; io: boolean; ivFailedAttempts: number; promptIo: boolean };
  /** `rising` is direction only (last > previous): no signed "sharp rise" number exists. */
  etco2: { last3: number[]; rising: boolean; lowPeHint: boolean };
  modifiers: { id: string; label: string; ruleIds: string[] }[];
  causes: CauseTile[];
  prompts: ArrestPrompt[];
  rosc: {
    atMs: number | null;
    sustainedAtMs: number | null;
    sustained: boolean;
    /** ROSC then re-arrest before 20 min within this arrest. */
    intermittentCount: number;
  };
  compressor: { name: string | null; onChestMs: number | null; swapDue: boolean };
  /** Episode-wide drug totals (mg) across all arrests, for dose-safety checks. */
  episodeTotalsMg: Record<string, number>;
}

/* ─── Close-out (GATE A §7; docs/clinical/resus-closeout-clinical-catalog.md) ─ */

export const CAPABILITIES = [
  "continuous_ecg",
  "arterial_line",
  "vasopressors",
  "niv_cpap",
  "invasive_ventilation",
  "rrt",
] as const;
export type Capability = (typeof CAPABILITIES)[number];

export const UNIT_TYPES = [
  "ward",
  "hdu",
  "icu",
  "theatre",
  "cath_lab",
  "labour_ward",
  "paeds_ward",
  "picu",
  "nicu",
  "ed_obs",
] as const;
export type UnitType = (typeof UNIT_TYPES)[number];

export interface CareUnit {
  id: string;
  name: string;
  unitType: UnitType;
  ageGroup: "adult" | "paediatric" | "all";
  capabilities: Capability[];
  active: boolean;
}

export interface LevelReason {
  ruleId: string;
  text: string;
  level: CareLevel;
  source: string;
}

export interface LevelSuggestion {
  level: CareLevel | null;
  reasons: LevelReason[];
  extraDestinations: { ruleId: string; destination: Destination | "ct_first"; reason: string }[];
  requiredCapabilities: Capability[];
  qualifyingUnits: CareUnit[];
  transferSuggested: boolean;
}
