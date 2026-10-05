/**
 * Types for the diabetes knowledge pack (MS-NCD-DM-PACK-001) as the runtime file
 * `data/ncd/diabetes-pack.json` carries it. Field names are the pack's own; the
 * pack is data, so these types describe its shape and nothing else. Everything the
 * catalog schema (`lib/ncd/catalog/schema.ts`) does not hold lives under `x`
 * (GATE A, S-DM-01..16), exactly as the pack writes it.
 */

/** The four states of a criterion (ADR 0082), plus the evaluator's own outcomes for an item. */
export type State = "met" | "not_met" | "insufficient" | "unavailable";
export type ItemState =
  | State
  | "suppressed"
  | "unavailable_here"
  | "contraindicated"
  | "blocked_by_caveat"
  | "dark";

export type PackOp =
  | ">="
  | ">"
  | "<="
  | "<"
  | "=="
  | "!="
  | "in"
  | "present"
  | "absent"
  | "recorded";

export interface PackPredicate {
  feature: string;
  op: PackOp;
  value?: number | string | (number | string)[];
  unit?: string;
  /** The REF-DM entry the threshold is typed in (N1). */
  _ref?: string;
}

export interface PackCriterion {
  id: string;
  label: string;
  all?: PackPredicate[];
  any?: PackPredicate[];
  atLeast?: { n: number; of: PackPredicate[] };
}

/** The `x` block: pack extensions the evaluator reads. Unknown keys are carried, not read. */
export interface PackX {
  lane?: string;
  runWhen?: "always" | "established" | "not_established" | "established_or_met" | "newly_met";
  notWhen?: PackCriterion[];
  cautions?: PackCriterion[];
  needsBeforeActing?: { feature: string }[];
  enabled?: boolean;
  enabledBy?: string;
  requiresCapability?: string;
  unlessCapability?: string;
  ages?: string;
  kind?: string;
  urgency?: string;
  lessTreatment?: boolean;
  measures?: string;
  appliesTo?: { pregnancy?: string; runWhen?: string } | null;
  restrictedClasses?: string[];
  pregnancyUnknownCounts?: boolean;
  unknownUrgency?: string;
  unknownDisplays?: Record<string, string>;
  under16Action?: string;
  notMetRequires?: PackCriterion;
  neverNotMet?: boolean;
  supersedes?: string[];
  forTarget?: string;
  mustHave?: string[];
  [key: string]: unknown;
}

export interface PackRule {
  id: string;
  display: string;
  when: PackCriterion;
  urgency: string;
  ageBands?: string[];
  x: PackX;
}
export interface PackStep {
  id: string;
  display: string;
  when: PackCriterion;
  contraindications?: PackCriterion[];
  x: PackX;
}
export interface PackFlag {
  id: string;
  display: string;
  severity: string;
  when: PackCriterion;
  action: string;
  x: PackX;
}
export interface PackCaveat {
  id: string;
  feature: string;
  label?: string;
  alternative?: string;
  when: PackCriterion;
  direction: "masks" | "manufactures" | "unpredictable";
  blocksDiagnosis: boolean;
  x: PackX;
}
export interface PackCriteriaSet {
  id: string;
  anyOf: PackCriterion[];
  x: PackX & {
    appliesTo: { pregnancy?: string; runWhen: string };
    default?: boolean;
    verdict?: string;
  };
}
export interface PackStage {
  code: string;
  severity: string;
  when: PackCriterion;
}
export interface PackComplication {
  code: string;
  establishedBy: PackCriterion[];
  staging?: { id: string; stages: PackStage[] }[];
  x: PackX;
}
export interface PackTarget {
  id: string;
  measure: string;
  display?: string;
  when: PackCriterion;
  x: PackX;
}
export interface PackClassification {
  code: string;
  display?: string;
  supportedBy: PackCriterion[];
  x: PackX;
}
export interface PackRiskModel {
  id: string;
  bands: { code: string; when: PackCriterion }[];
  x: PackX;
}
export interface PackBand {
  code: string;
  display?: string;
  tone: string;
  from?: number;
  to?: number;
}
export interface PackInterpretation {
  id: string;
  feature: string;
  when?: PackPredicate;
  bands: PackBand[];
  x: PackX;
}
export interface PackFeature {
  valueType: string;
  requires?: string | null;
  restrictedClass?: string | null;
  display?: string;
}

export interface DiabetesPack {
  pack: { id: string; version: string };
  semantics: Record<string, unknown>;
  acuteOrder: string[];
  heldKinds: string[];
  districtCapabilities: string[];
  features: Record<string, PackFeature>;
  diagnosis: PackCriteriaSet[];
  diagnosisPending: PackCriteriaSet[];
  complicationAmendmentCriteria: PackCriterion[];
  rules: PackRule[];
  management: PackStep[];
  therapyFlags: PackFlag[];
  validityCaveats: PackCaveat[];
  complications: PackComplication[];
  targets: PackTarget[];
  classifications: PackClassification[];
  riskModels: PackRiskModel[];
  interpretation: PackInterpretation[];
  /** The REF-DM registry: every number lives here once (N1). */
  refs: Record<
    string,
    { value: number | string | null; unit: string | null; status: string; needsCsoInput: boolean }
  >;
}

/** A captured value as the pack's patients carry it: a number, a string, a boolean or a multi-select list. */
export type PackValue = number | string | boolean | string[];
export type PackValues = Record<string, PackValue>;

/** Where the patient is seen. `referral` = every capability; `district` = the WHO PEN list; or an explicit list. */
export type PackSite = "referral" | "district" | string[];

export interface PackInput {
  values: PackValues;
  site: PackSite;
  /** Diabetes is established for this patient (a recorded diagnosis), not merely met at this visit. */
  established: boolean;
  /** The display band; the evaluator corrects it from a recorded numeric age. */
  ageBand: "neonate" | "infant" | "child" | "adolescent" | "adult" | "older_adult";
}

export interface PackResult {
  caveats: string[];
  fired: Record<string, "rule" | "step" | "therapyFlag">;
  dark: Record<string, string | undefined>;
  states: Record<string, ItemState>;
  diagnosis: Record<string, State | "not_applicable">;
  criteria: Record<string, State>;
  blockedCriteria: string[];
  unavailableFeatures: string[];
  complications: Record<string, State>;
  stages: Record<string, string>;
  risk: Record<string, string>;
  targets: string[];
  bands: Record<string, string>;
  bandsBlocked: string[];
  classification: Record<string, State>;
  restricted: string[];
  stepsFired: string[];
  cautions: Record<string, string[]>;
  gaps: Record<string, string[]>;
  urgency: Record<string, string>;
  withheld: string[];
  metViaUnknown: Record<string, string>;
  interrupt: string | null;
  foldedInto: Record<string, string>;
  interruptActions: string[];
  actionOverride: Record<string, string>;
  pregnancyState: "pregnant" | "not_pregnant" | "unknown";
}
