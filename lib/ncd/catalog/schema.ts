/**
 * NCD catalog schema — the shape EVERY chronic-disease catalog conforms to.
 *
 * Pure, client-safe, declarative. This module contains NO clinical content: it
 * is the grammar in which clinical content is written. Diabetes, hypertension
 * and CKD are then *data files* against this schema, not new engines — which is
 * the whole point of putting the effort here first.
 *
 * ── Why this shape (ADR 0082) ────────────────────────────────────────────────
 *
 * The removed v1 engine was a DIFFERENTIAL engine: open-ended, probabilistic,
 * "given these findings, what could this be?". It needed a tuned weight file per
 * complaint and never finished covering the front door.
 *
 * This is a PROTOCOL engine: "this patient has diabetes — is the diagnosis
 * confirmed, which complications are screened, what stratum, what is missing,
 * what does the guideline say next?". Bounded, deterministic and auditable.
 * There are no weights here and nothing is tuned: every verdict traces to a
 * named threshold published by a named body, which is what makes it signable.
 *
 * ── Four invariants the types themselves enforce ─────────────────────────────
 *
 * 1. NOTHING CLINICAL WITHOUT A CITATION. `citation` is REQUIRED (not optional)
 *    on every construct that asserts something about a patient. You cannot add
 *    a threshold to a catalog without saying who published it and in which
 *    version. A test additionally rejects placeholder citations.
 *
 * 2. NOT-ASSESSED IS NOT NORMAL — and "we cannot do that test here" is a THIRD
 *    state, distinct from both. See `Assessed<T>`. A profile that renders "no
 *    retinopathy" because nobody looked is a patient-safety failure, so the
 *    absence of a value is never representable as a normal value.
 *
 * 3. STANDARDS DISAGREE, AND THE ENGINE MUST SAY WHICH IT USED. Criteria are
 *    keyed by `standard` + `version`, and a `SiteProfile` declares a precedence
 *    order. WHO PEN is written for resource-limited settings and ADA for
 *    well-resourced ones; they differ on pathways, not physiology. One engine
 *    serves both because the standard is data, not code.
 *
 * 4. GUIDANCE STOPS AT THE PRESCRIPTION. `ManagementStep.requiresPrescribing`
 *    marks any step involving a dose; those hand off to the prescribing module
 *    and are never computed here.
 */

/* ── Provenance ───────────────────────────────────────────────────────────── */

/** A standard-setting body. `local` = a site/national protocol layered on top. */
export type StandardBody =
  | "ADA"
  | "WHO"
  | "IDF"
  | "KDIGO"
  | "IWGDF"
  | "ICDR"
  | "ETDRS"
  | "ESC"
  | "EASD"
  | "ISH"
  | "local";

/**
 * The provenance of one clinical assertion. Required wherever a threshold,
 * stage, band or step is defined — there is deliberately no way to state a
 * clinical fact in this schema anonymously.
 */
export interface Citation {
  standard: StandardBody;
  /** The specific edition the value was read from, e.g. "Standards of Care 2026". */
  version: string;
  title: string;
  url?: string;
  /** Short verbatim quote containing the value, for audit. */
  quote?: string;
  /** ISO date the source was retrieved. Stamped at research time, never guessed. */
  retrieved?: string;
  /** Ratified by the Clinical Safety Officer. Unsigned content is gated dark. */
  csoSigned: boolean;
  /**
   * Set when the value could NOT be confirmed from a primary source. The entry
   * still ships (an honest gap beats a silent guess) but the engine surfaces it
   * as unratified and the CSO memo lists it.
   */
  needsCsoInput?: string;
}

/* ── Capability: what a given site can actually measure ───────────────────── */

/** e.g. "lab.hba1c", "lab.urine_acr", "imaging.fundus", "device.monofilament". */
export type CapabilityCode = string;

export interface Capability {
  code: CapabilityCode;
  display: string;
  /** Informational tier, for defaulting a new site's profile. */
  tier: "bedside" | "basic_lab" | "advanced_lab" | "imaging" | "specialist";
}

/**
 * A site's declared reality. This is what makes the module international rather
 * than tuned to one hospital: the same catalog produces a different — and
 * honest — pathway depending on what the site can run.
 */
export interface SiteProfile {
  id: string;
  display: string;
  /**
   * Which body wins when two standards give different pathways for the same
   * decision. First match applies; the engine always reports what it applied.
   */
  standardPreference: StandardBody[];
  available: CapabilityCode[];
}

/* ── Captured values: the honesty primitive ──────────────────────────────── */

/**
 * A value that may not exist yet — and the two reasons it might not.
 *
 * `not_assessed`  the clinician has not done/asked it. A gap to close.
 * `unavailable`   the site cannot do it at all. NOT a gap to nag about; a
 *                 referral or an alternative pathway.
 *
 * Collapsing these two is how a gaps list becomes noise people learn to ignore,
 * and collapsing either into "normal" is how a screening tool hurts someone.
 */
export type Assessed<T> =
  | { state: "recorded"; value: T; at?: string }
  | { state: "not_assessed" }
  | { state: "unavailable"; capability: CapabilityCode };

export const notAssessed = <T>(): Assessed<T> => ({ state: "not_assessed" });
export const recorded = <T>(value: T, at?: string): Assessed<T> => ({
  state: "recorded",
  value,
  at,
});
export const unavailable = <T>(capability: CapabilityCode): Assessed<T> => ({
  state: "unavailable",
  capability,
});
export const isRecorded = <T>(
  a: Assessed<T> | undefined,
): a is { state: "recorded"; value: T; at?: string } => a?.state === "recorded";

/* ── Features: everything the form can capture ───────────────────────────── */

export type FeatureKind = "symptom" | "sign" | "investigation" | "history" | "measurement";
export type ValueType =
  | "boolean"
  | "single_select"
  | "multi_select"
  | "number"
  | "duration"
  | "text";

export interface FeatureOption {
  value: string;
  display: string;
  /**
   * Suppress this feature's `optionDetail` for this option. "None" and "Not
   * known" take no dose, and offering an input beside them invites a value that
   * cannot mean anything.
   */
  noDetail?: boolean;
  /**
   * Override the feature's `optionDetail` for this option. "Other" needs the
   * drug's NAME, not a dose — the same input asking a different question.
   */
  detail?: { label?: string; placeholder?: string };
}

/** Unit conversion for values clinicians read in two scales (mmol/L ↔ mg/dL). */
export interface AltUnit {
  unit: string;
  /** value_in_altUnit = value_in_unit * factor */
  factor: number;
}

export interface Feature {
  /** Stable and unique within the catalog. Referenced by every predicate. */
  code: string;
  display: string;
  kind: FeatureKind;
  valueType: ValueType;
  /** SI unit. Thresholds in this catalog are always expressed in this unit. */
  unit?: string;
  altUnit?: AltUnit;
  options?: FeatureOption[];
  /**
   * When set, each SELECTED option may carry a free-text detail — a current
   * dose and frequency, say.
   *
   * The boundary this sits on matters. Recording what a patient reports taking
   * is DOCUMENTATION, and every medication history does it; without it you
   * cannot tell metformin 500 mg once daily from 1 g twice daily, which changes
   * whether there is room to escalate. That is not prescribing.
   *
   * What remains prohibited is unchanged: the engine never RECOMMENDS or
   * COMPUTES a dose. And the detail is inert — `evaluatePredicate` reads only
   * the selected option, never the text beside it — so no criterion can ever
   * turn on a dose string.
   */
  optionDetail?: { label: string; placeholder?: string };
  /**
   * The capability this feature needs. ABSENT means bedside/clinical — always
   * available, no equipment. Present means the engine can distinguish
   * "not done" from "cannot be done here".
   */
  requires?: CapabilityCode;
  /** Reference band for DISPLAY only. Never a diagnostic threshold. */
  refRange?: { low?: number; high?: number };
  /** Which form section captures it. */
  section: string;
  /**
   * This feature CHARACTERISES another one — "is the polyuria nocturnal?" only
   * means anything once polyuria is present.
   *
   * Properties are ordinary features, not a nested type, so a predicate can
   * reference one exactly like anything else. What `parent` adds is display
   * (indented beneath its finding) and a default `showWhen` of "parent present",
   * so an unasked symptom never spawns a page of questions about itself.
   */
  parent?: string;
  /**
   * Render only while this holds. Uses the same evaluator as clinical rules, so
   * conditional display and clinical logic can never drift apart.
   *
   * Defaults to "parent is present" when `parent` is set. Given explicitly it
   * handles the cases `parent` cannot — an insulin regimen is not a property OF
   * the therapy list, it is a separate question that only arises when insulin is
   * one of the answers.
   */
  showWhen?: Predicate;
  /**
   * This finding, on its own, demands urgent action.
   *
   * Distinct from a `Complication` with `timing: "acute"`, and the difference is
   * what makes it worth having. An acute complication is ESTABLISHED from
   * criteria — DKA needs ketones and acid-base, which a district clinic may not
   * have. A danger sign fires on a single recorded symptom, so the same clinic
   * that can never confirm DKA can still be told, from vomiting and abdominal
   * pain alone, that this person needs to be seen now.
   *
   * Keep the list short. An interface that cries wolf is ignored, which is the
   * opposite of safe, so `action` must be the guideline's own instruction and
   * never a precaution invented here.
   */
  dangerSign?: {
    severity: "red" | "amber";
    action: string;
    /**
     * An ADDITIONAL condition. The finding must be present AND this must hold.
     *
     * Added because the audit caught the catalog crying wolf: vomiting and
     * abdominal pain were firing red on the symptom alone, when the source
     * describes them as features of a SUSPECTED crisis — "nausea, vomiting and
     * abdominal pain are common in DKA". Vomiting in a person with no
     * hyperglycaemic symptoms and no diabetes is gastroenteritis, and a tool
     * that calls it an emergency teaches people to dismiss the flag that matters.
     */
    when?: Criterion;
    citation: Citation;
  };
  /**
   * Complication codes this finding POINTS AT when present.
   *
   * Turns a flat gaps list into a prompted one. "Foot examination outstanding"
   * is a chore; "the patient reports burning feet and the foot examination is
   * outstanding" is a reason. The link is one-directional and weak on purpose —
   * a symptom raises the priority of screening for something, and never asserts
   * that the something is there. Establishing a complication still requires its
   * own criteria.
   */
  suggests?: string[];
  /** Only where the feature itself is a clinical assertion (e.g. a named sign). */
  citation?: Citation;
}

/** The condition under which a feature is shown. `parent` implies "present". */
export function displayCondition(f: Feature): Predicate | undefined {
  if (f.showWhen) return f.showWhen;
  if (f.parent) return { feature: f.parent, op: "present" };
  return undefined;
}

/* ── Predicates + criteria: the logic vocabulary ─────────────────────────── */

export type PredicateOp = ">=" | ">" | "<=" | "<" | "==" | "!=" | "in" | "present" | "absent";

/**
 * One test against one feature. `present`/`absent` test the RECORDED state and
 * are deliberately false for `not_assessed` — absence of evidence never
 * satisfies a predicate.
 */
export interface Predicate {
  feature: string;
  op: PredicateOp;
  value?: number | string | string[];
  /** Documentation of the unit the threshold is in; must match Feature.unit. */
  unit?: string;
}

/**
 * A named, citable clinical rule. `all` is AND, `any` is OR, `atLeast` is
 * n-of-m; any combination may be given and they are conjoined.
 *
 * `atLeast` exists because real staging systems are written that way and
 * approximating them would change what they mean — IWGDF foot risk category 2
 * is defined as "a combination of TWO of" loss of protective sensation,
 * peripheral artery disease and foot deformity, which is neither an AND nor an
 * OR of the three.
 */
export interface Criterion {
  id: string;
  /** Human-readable, shown verbatim to the clinician: "Fasting plasma glucose ≥ 7.0 mmol/L". */
  label: string;
  all?: Predicate[];
  any?: Predicate[];
  atLeast?: { n: number; of: Predicate[] };
  /**
   * Satisfying this criterion is NOT by itself a diagnosis — a second,
   * INDEPENDENT abnormal result is required (ADA: "two abnormal results, which
   * may be obtained at the same time").
   *
   * Do NOT set it on a criterion that already encodes the repeat as one of its
   * own predicates (as the WHO set does): that would demand confirmation twice.
   */
  requiresConfirmation?: boolean;
  citation: Citation;
}

/**
 * The criteria for one verdict under one standard. `anyOf` because diagnostic
 * criteria are characteristically alternatives (FPG *or* OGTT *or* HbA1c *or*
 * random glucose with symptoms).
 */
export interface CriteriaSet {
  id: string;
  standard: StandardBody;
  version: string;
  anyOf: Criterion[];
  citation: Citation;
}

/* ── Classification (T1 / T2 / other / unclassified) ─────────────────────── */

/**
 * Aetiological classification, layered OVER a confirmed diagnosis. Designed to
 * degrade: where the discriminating tests (C-peptide, autoantibodies) are
 * unavailable — the common case globally — the engine must return
 * `unclassified` rather than infer a type from phenotype alone.
 */
export interface Classification {
  code: string;
  display: string;
  supportedBy: Criterion[];
  refutedBy?: Criterion[];
  /** Features that would settle it; drives the gaps list. */
  discriminators?: string[];
  citation: Citation;
}

/* ── Complications ───────────────────────────────────────────────────────── */

/**
 * `acute` complications are emergencies on a minutes-to-hours horizon and are
 * evaluated by an always-on interlock regardless of the form's mode; they route
 * out to the resuscitation pathway rather than sitting in a chronic profile.
 */
export type ComplicationTiming = "acute" | "chronic";

export type StageSeverity = "none" | "mild" | "moderate" | "severe" | "critical";

export interface StageDefinition {
  /** The published stage code, e.g. "G3a", "A2", "iwgdf_2". */
  code: string;
  display: string;
  when: Criterion;
  severity: StageSeverity;
}

export interface StagingSystem {
  id: string;
  display: string;
  standard: StandardBody;
  version: string;
  stages: StageDefinition[];
  citation: Citation;
}

export interface ScreeningInterval {
  months: number;
  /** Interval may depend on the current stage, e.g. IWGDF foot risk categories. */
  forStage?: string;
  citation: Citation;
}

export interface EmergencyAction {
  severity: "red" | "amber";
  /** What to do, in the guideline's own terms. Never a dose. */
  action: string;
  citation: Citation;
}

export interface Complication {
  code: string;
  display: string;
  timing: ComplicationTiming;
  /** Findings that ESTABLISH it. Any one satisfied ⇒ present. */
  establishedBy: Criterion[];
  /** Features that constitute screening for it. Drives `gaps()`. */
  screenedBy: string[];
  screeningIntervals?: ScreeningInterval[];
  /** Published staging/grading systems, possibly several across standards. */
  staging?: StagingSystem[];
  /** Required for `timing: "acute"`. */
  emergency?: EmergencyAction;
  citation: Citation;
}

/* ── Test validity ───────────────────────────────────────────────────────── */

/**
 * A condition under which a test's RESULT cannot be trusted — distinct from the
 * test being unavailable, and distinct from the result being abnormal.
 *
 * This exists because Phase 0 decision (a) required more than a binary
 * "unreliable" badge. NGSP states that haemoglobin-variant interference with
 * HbA1c is ASSAY-SPECIFIC, and that the bias has a DIRECTION: anything
 * shortening red-cell survival (haemolysis, malaria, recent transfusion)
 * falsely LOWERS HbA1c and can mask diabetes, while iron deficiency falsely
 * RAISES it and can manufacture one. A clinician told only "unreliable" cannot
 * tell which error they are looking at.
 *
 * Modelling it here rather than in engine code keeps the engine disease-generic
 * and keeps the policy reviewable as data. The same shape recurs elsewhere —
 * eGFR at extremes of muscle mass, ACR after exercise or in UTI.
 */
export interface ValidityCaveat {
  id: string;
  /** The feature whose RESULT this caveat undermines. */
  feature: string;
  label: string;
  when: Criterion;
  /**
   * Which way the result is biased, in terms of the clinical consequence:
   * `masks` — falsely reassuring, may hide disease.
   * `manufactures` — falsely alarming, may create disease that is not there.
   * `unpredictable` — direction not established.
   */
  direction: "masks" | "manufactures" | "unpredictable";
  /** What the guideline says to use instead. */
  alternative?: string;
  /** When true, this feature may not be used to DIAGNOSE while the caveat holds. */
  blocksDiagnosis: boolean;
  citation: Citation;
}

/* ── Risk stratification ─────────────────────────────────────────────────── */

export type RiskSeverity = "low" | "moderate" | "high" | "very_high";

export interface RiskBand {
  code: string;
  display: string;
  severity: RiskSeverity;
  when: Criterion;
}

export interface RiskModel {
  id: string;
  display: string;
  standard: StandardBody;
  version: string;
  /**
   * Populations the model was validated in. Several widely-used cardiovascular
   * models are NOT validated in sub-Saharan African populations; where that is
   * the case the engine must say so beside the number rather than presenting a
   * borrowed risk as if it were local.
   */
  validatedIn?: string[];
  applicabilityNote?: string;
  /** Feature codes the model needs. Missing ones make the model inapplicable. */
  requires: string[];
  bands: RiskBand[];
  citation: Citation;
}

/* ── Management ──────────────────────────────────────────────────────────── */

export interface ManagementStep {
  id: string;
  display: string;
  when: Criterion;
  contraindications?: Criterion[];
  standard: StandardBody;
  version: string;
  /**
   * TRUE for anything involving a drug or a dose. Such steps are shown as a
   * guideline-linked RECOMMENDATION and hand off to the prescribing module;
   * this schema never encodes a dose and this engine never computes one.
   */
  requiresPrescribing: boolean;
  citation: Citation;
}

/* ── The catalog ─────────────────────────────────────────────────────────── */

export interface CatalogSection {
  id: string;
  display: string;
  /** Ordering hint for the generated form. */
  order: number;
  description?: string;
}

export interface NcdCatalog {
  /** e.g. "diabetes". Stable; used as the section key in section_data. */
  id: string;
  display: string;
  /** Catalog version, bumped whenever clinical content changes. */
  version: string;
  capabilities: Capability[];
  sections: CatalogSection[];
  features: Feature[];
  /** Diagnostic criteria, one set per standard. */
  diagnosis: CriteriaSet[];
  classifications?: Classification[];
  complications: Complication[];
  /** Conditions under which a feature's result cannot be trusted. */
  validityCaveats?: ValidityCaveat[];
  riskModels?: RiskModel[];
  management?: ManagementStep[];
}

/* ── Lookup helpers (pure) ───────────────────────────────────────────────── */

export function featureMap(catalog: NcdCatalog): Map<string, Feature> {
  return new Map(catalog.features.map((f) => [f.code, f]));
}

/** Every feature code referenced by a criterion — used by validation and gaps. */
export function criterionFeatures(c: Criterion): string[] {
  return [...(c.all ?? []), ...(c.any ?? []), ...(c.atLeast?.of ?? [])].map((p) => p.feature);
}

/**
 * Is a feature performable at this site? A feature with no `requires` is
 * bedside and always performable; otherwise the site must declare the
 * capability. This is the single check that separates "not done yet" from
 * "cannot be done here".
 */
export function isPerformable(feature: Feature, site: SiteProfile): boolean {
  return feature.requires == null || site.available.includes(feature.requires);
}

/**
 * Pick the criteria set to apply, honouring the site's standard precedence.
 * Falls back to the first set so a catalog always yields a verdict, and the
 * caller reports which standard was applied.
 */
export function preferredCriteria(sets: CriteriaSet[], site: SiteProfile): CriteriaSet | undefined {
  for (const body of site.standardPreference) {
    const hit = sets.find((s) => s.standard === body);
    if (hit) return hit;
  }
  return sets[0];
}
