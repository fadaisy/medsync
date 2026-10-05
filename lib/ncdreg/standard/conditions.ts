/**
 * The condition catalogue (§5.6): two full modules and eight core modules, all `draft`.
 *
 * All knowledge about a particular condition lives here and in the other files of the standard
 * module. Code outside `lib/ncdreg/standard/` never branches on a condition code: it reads these
 * records (tests/ncdreg/condition-code-search.test.ts enforces it).
 */
import type { Code, ConditionModule, VisitField } from "./types";

import { STANDARD_VERSION } from "./code-lists";

const V = { version: STANDARD_VERSION, status: "draft", effective_from: "2026-10-05" } as const;
const c = (code: string, label: string): Code => ({ code, label });

const UNKNOWN_ONLY = [c("unknown", "Unknown")];
const CORE_BASIS = [
  c("clinician_diagnosis", "Clinician diagnosis"),
  c("on_treatment_at_referral", "On treatment at referral"),
  c("unknown", "Unknown"),
];
const count = (code: string, label: string): VisitField => ({
  code,
  label,
  type: "integer",
  requirement: "offered",
  storage: "observation",
});

const DIABETES: ConditionModule = {
  ...V,
  code: "diabetes",
  label: "Diabetes",
  level: "full",
  subtypes: [
    c("type_1", "Type 1"),
    c("type_2", "Type 2"),
    c("other_specific", "Other specific type"),
    c("unknown", "Unknown"),
  ],
  basis_of_diagnosis: [
    c("fasting_glucose", "Fasting glucose"),
    c("random_glucose_with_symptoms", "Random glucose with symptoms"),
    c("hba1c", "HbA1c"),
    c("ogtt", "Oral glucose tolerance test"),
    c("on_treatment_at_referral", "On treatment at referral"),
    c("unknown", "Unknown"),
  ],
  diagnosis_codes: [
    { icd11: "5A10", icd10: "E10", label: "Type 1 diabetes", subtype: "type_1" },
    { icd11: "5A11", icd10: "E11", label: "Type 2 diabetes", subtype: "type_2" },
    { icd11: "5A13", icd10: "E13", label: "Other specified diabetes", subtype: "other_specific" },
    { icd11: "5A14", icd10: "E14", label: "Diabetes, unspecified", subtype: "unknown" },
  ],
  medicine_groups: ["glucose_lowering", "cardiovascular_protection"],
  visit_fields: [
    {
      code: "glucose",
      label: "Glucose",
      type: "number",
      unit: "mmol/L",
      confirm_range: [1.0, 60.0],
      requirement: "expected",
      storage: "visit_column",
    },
    {
      code: "hba1c",
      label: "HbA1c",
      type: "number",
      unit: "%",
      confirm_range: [3.0, 20.0],
      requirement: "offered",
      storage: "visit_column",
    },
    {
      code: "hypoglycaemia",
      label: "Hypoglycaemia since last visit",
      type: "enum",
      requirement: "offered",
      storage: "visit_column",
    },
  ],
  outcome_classification: {
    kind: "rule",
    classification: "glycaemic",
    classes: ["in_range", "moderately_raised", "very_raised", "not_classifiable"],
    in_range: "in_range",
  },
  review_components: [
    { component: "hba1c", interval_months: 12 },
    { component: "kidney", interval_months: 12 },
    { component: "eyes", interval_months: 12 },
    { component: "feet", interval_months: 12 },
    { component: "lipids", interval_months: 12 },
  ],
  outcome_label: "In range",
  admission_reasons: [],
  event_types: [],
  sms_banned_terms: ["diabetes", "diabetic", "sugar", "glucose", "insulin", "hba1c"],
  enabled_by_default: true,
};

const HYPERTENSION: ConditionModule = {
  ...V,
  code: "hypertension",
  label: "Hypertension",
  level: "full",
  subtypes: [c("primary", "Primary"), c("secondary", "Secondary"), c("unknown", "Unknown")],
  basis_of_diagnosis: [
    c("repeated_office_bp", "Repeated office blood pressure"),
    c("home_or_ambulatory_bp", "Home or ambulatory blood pressure"),
    c("on_treatment_at_referral", "On treatment at referral"),
    c("unknown", "Unknown"),
  ],
  diagnosis_codes: [
    { icd11: "BA00", icd10: "I10", label: "Essential hypertension", subtype: "primary" },
    { icd11: "BA04", icd10: "I15", label: "Secondary hypertension", subtype: "secondary" },
  ],
  medicine_groups: ["blood_pressure", "cardiovascular_protection"],
  visit_fields: [],
  outcome_classification: {
    kind: "rule",
    classification: "bp_control",
    classes: ["in_range", "not_in_range"],
    in_range: "in_range",
  },
  review_components: [
    { component: "kidney", interval_months: 12 },
    { component: "lipids", interval_months: 12 },
  ],
  outcome_label: "In range",
  admission_reasons: [],
  event_types: [],
  sms_banned_terms: ["hypertension", "hypertensive", "pressure", "blood pressure", "bp"],
  enabled_by_default: true,
};

function core(
  code: string,
  label: string,
  o: Partial<
    Pick<ConditionModule, "subtypes" | "visit_fields" | "review_components" | "admission_reasons">
  > & {
    banned: string[];
  },
): ConditionModule {
  return {
    ...V,
    code,
    label,
    level: "core",
    subtypes: o.subtypes ?? UNKNOWN_ONLY,
    basis_of_diagnosis: CORE_BASIS,
    diagnosis_codes: [],
    medicine_groups: [],
    visit_fields: o.visit_fields ?? [],
    outcome_classification: { kind: "clinician_recorded" },
    review_components: o.review_components ?? [],
    outcome_label: "Recorded as controlled",
    admission_reasons: o.admission_reasons ?? [],
    event_types: [],
    sms_banned_terms: o.banned,
    enabled_by_default: false,
  };
}

const CORE_MODULES: ConditionModule[] = [
  core("chronic_kidney_disease", "Chronic kidney disease", {
    visit_fields: [
      {
        code: "dialysis_status",
        label: "Dialysis status",
        type: "enum",
        options: [
          c("none", "None"),
          c("haemodialysis", "Haemodialysis"),
          c("peritoneal_dialysis", "Peritoneal dialysis"),
        ],
        requirement: "offered",
        storage: "observation",
      },
    ],
    review_components: [{ component: "kidney", interval_months: 12 }],
    banned: ["kidney", "renal", "dialysis", "ckd"],
  }),
  core("heart_failure", "Heart failure", {
    visit_fields: [
      {
        code: "nyha_class",
        label: "NYHA class",
        type: "enum",
        options: [
          c("I", "I"),
          c("II", "II"),
          c("III", "III"),
          c("IV", "IV"),
          c("not_assessed", "Not assessed"),
        ],
        requirement: "offered",
        storage: "observation",
      },
      {
        code: "oedema",
        label: "Oedema",
        type: "boolean",
        requirement: "offered",
        storage: "observation",
      },
    ],
    review_components: [{ component: "kidney", interval_months: 12 }],
    banned: ["heart", "cardiac", "failure"],
  }),
  core("cardiovascular_disease", "Stroke, ischaemic heart disease or peripheral arterial disease", {
    subtypes: [
      c("stroke", "Stroke"),
      c("ischaemic_heart_disease", "Ischaemic heart disease"),
      c("peripheral_arterial_disease", "Peripheral arterial disease"),
      c("other", "Other"),
    ],
    review_components: [{ component: "lipids", interval_months: 12 }],
    banned: ["stroke", "heart", "cardiac", "cardiovascular", "arterial"],
  }),
  core("asthma", "Asthma", {
    visit_fields: [count("exacerbations_since_last_visit", "Exacerbations since last visit")],
    admission_reasons: [c("acute_asthma", "Acute asthma")],
    banned: ["asthma", "inhaler", "breathing"],
  }),
  core("copd", "Chronic obstructive pulmonary disease", {
    visit_fields: [count("exacerbations_since_last_visit", "Exacerbations since last visit")],
    admission_reasons: [c("copd_exacerbation", "COPD exacerbation")],
    banned: ["copd", "pulmonary", "lung", "inhaler", "breathing"],
  }),
  core("sickle_cell_disease", "Sickle cell disease", {
    visit_fields: [count("painful_crises_since_last_visit", "Painful crises since last visit")],
    admission_reasons: [c("sickle_cell_crisis", "Sickle cell crisis")],
    banned: ["sickle", "crisis"],
  }),
  core("epilepsy", "Epilepsy", {
    visit_fields: [count("seizures_since_last_visit", "Seizures since last visit")],
    admission_reasons: [c("seizure", "Seizure")],
    banned: ["epilepsy", "seizure", "fits"],
  }),
  core("thyroid_disease", "Thyroid disease", { banned: ["thyroid"] }),
];

export const CONDITION_CATALOGUE: readonly ConditionModule[] = [
  DIABETES,
  HYPERTENSION,
  ...CORE_MODULES,
];

export const moduleByCode = new Map(CONDITION_CATALOGUE.map((m) => [m.code, m]));

export function conditionModule(code: string): ConditionModule {
  const m = moduleByCode.get(code);
  if (!m) throw new Error(`Unknown condition module: ${code}`);
  return m;
}

/**
 * The two module codes the standard's own definitions (C-indicators, H-indicators, care band) name.
 * Exported as named roles so code outside the standard asks for "the module the C04 family is about"
 * without spelling its code.
 */
export const FULL_ROLES = { glycaemic: DIABETES.code, bp: HYPERTENSION.code } as const;
