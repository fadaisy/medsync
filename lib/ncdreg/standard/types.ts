/**
 * NCDReg 0.1 (draft): the shapes of the standard as data (PROMPT-NCDSYNC-BUILD-v2 §5).
 *
 * Every definition carries a version, a status and the date it takes effect, so a later change is a
 * new version beside the old one rather than an edit to it (I2). Nothing here is approved: the
 * whole of 0.1 is `draft` until the Clinical Safety Officer and the Registry Technical Group sign it.
 */

export type DefinitionStatus = "draft" | "approved";

export type Versioned = {
  version: string;
  status: DefinitionStatus;
  effective_from: string; // ISO date
};

export type Code = { code: string; label: string };

export type CodeList = Versioned & {
  id: string;
  label: string;
  codes: readonly Code[];
  /** Codes from an external catalogue that nobody has checked against the source yet. */
  verified?: boolean;
};

export type ReviewComponent = "hba1c" | "kidney" | "eyes" | "feet" | "lipids";

export type VisitFieldType = "number" | "integer" | "enum" | "boolean";

/**
 * A condition-specific visit field. `storage: "visit_column"` is one of the typed full-module
 * measurements of §5.2 (glucose, HbA1c, hypoglycaemia); `"observation"` goes to the generic
 * observation table keyed by visit, registration and code.
 */
export type VisitField = {
  code: string;
  label: string;
  type: VisitFieldType;
  unit?: string;
  options?: readonly Code[];
  confirm_range?: readonly [number, number];
  requirement: "expected" | "offered";
  storage: "visit_column" | "observation";
};

export type OutcomeClassification =
  | {
      kind: "rule";
      /** Id of a versioned classification in `classifications.ts`. */
      classification: string;
      classes: readonly string[];
      in_range: string;
    }
  | { kind: "clinician_recorded" };

export type DiagnosisCode = { icd11: string; icd10: string; label: string; subtype?: string };

export type ConditionModule = Versioned & {
  code: string;
  label: string;
  level: "full" | "core";
  subtypes: readonly Code[];
  basis_of_diagnosis: readonly Code[];
  diagnosis_codes: readonly DiagnosisCode[];
  /** Medicine groups offered first on the visit form. */
  medicine_groups: readonly string[];
  visit_fields: readonly VisitField[];
  outcome_classification: OutcomeClassification;
  review_components: readonly { component: ReviewComponent; interval_months: number }[];
  outcome_label: string;
  admission_reasons: readonly Code[];
  event_types: readonly Code[];
  sms_banned_terms: readonly string[];
  enabled_by_default: boolean;
};

/** The clinician-recorded control scale every core module uses (§5.6). */
export const RECORDED_CONTROL = [
  "controlled",
  "partly_controlled",
  "not_controlled",
  "not_assessed",
] as const;
export type RecordedControl = (typeof RECORDED_CONTROL)[number];
