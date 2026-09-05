/**
 * Diabetes status — diagnosis history, treatment and access, hypoglycaemia,
 * self-management. The four sections that turn a bare "known diabetic" flag into
 * an actual profile.
 *
 * ── How this list was cut ────────────────────────────────────────────────────
 * The research proposed 158 fields. That is v1's failure mode wearing a new hat:
 * a form that asks for things nobody acts on is how clinicians learn to ignore
 * the whole tool. Every field below survives one test — it changes a decision —
 * and the ones that did not are recorded in the research file, not here.
 *
 * ── Copyrighted instruments are NOT embedded ─────────────────────────────────
 * The audit verified licences one by one, and the line is firm:
 *
 *   EMBEDDABLE   PHQ-2 / PHQ-9 / GAD-7 (explicitly public domain), the Hunger
 *                Vital Sign (no fee or licensing), and ADA's own single
 *                hypoglycaemia-awareness question, which is quoted verbatim in
 *                Section 6 and is the reason we do not need a restricted score.
 *
 *   DO NOT EMBED Gold, Clarke, Pedersen-Bjergaard, HypoA-Q, DDS-17/DDS-2, PAID,
 *                ARMS, FRAX. For these we record THAT screening happened and its
 *                result band — never the items. A restricted questionnaire
 *                reproduced in software is a legal problem, not a clinical one,
 *                and it is entirely avoidable.
 */
import type { CatalogSection, Citation, Feature } from "@/lib/ncd/catalog/schema";

import { ADA_2026_DX, WHO_2019_CLASS, WHO_PEN } from "@/lib/ncd/catalog/diabetes/sources";

const RETRIEVED = "2026-09-05";
const c = (x: Omit<Citation, "csoSigned" | "retrieved">): Citation => ({
  ...x,
  retrieved: RETRIEVED,
  csoSigned: false,
});

/* ── sources new to this section ─────────────────────────────────────────── */

/** ADA Section 4 — the components of the comprehensive diabetes evaluation. */
export const ADA_2026_EVAL = c({
  standard: "ADA",
  version: "Standards of Care in Diabetes—2026, Section 4 (Tables 4.1–4.4)",
  title: "4. Comprehensive Medical Evaluation and Assessment of Comorbidities",
  url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC12690184/",
  quote: "Characteristics at onset (e.g., age and symptoms and/or signs)",
});

/** ADA Section 6 — glycaemic goals and hypoglycaemia. */
export const ADA_2026_GLYCAEMIC = c({
  standard: "ADA",
  version: "Standards of Care in Diabetes—2026, Section 6",
  title: "6. Glycemic Goals and Hypoglycemia",
  url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC12690178/",
});

/** ADA Section 5 — facilitating positive health behaviours. */
export const ADA_2026_BEHAVIOUR = c({
  standard: "ADA",
  version: "Standards of Care in Diabetes—2026, Section 5",
  title: "5. Facilitating Positive Health Behaviors and Well-being",
  url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC12690188/",
});

/** Free to use — verified: "There is no fee or licensing requirement". */
export const HUNGER_VITAL_SIGN = c({
  standard: "local",
  version: "Hunger Vital Sign, Children's HealthWatch",
  title: "Hunger Vital Sign — a validated 2-item food insecurity screener",
  url: "https://childrenshealthwatch.org/public-policy/hunger-vital-sign/",
  quote: "There is no fee or licensing requirement",
});

/** Explicitly public domain — the reason these may be embedded at all. */
export const PHQ_PUBLIC_DOMAIN = c({
  standard: "local",
  version: "PHQ / GAD-7 instruction manual",
  title: "Patient Health Questionnaire (PHQ) Screeners — instruction manual",
  url: "https://case.edu/medicine/wellness-pathway/sites/default/files/2018-05/instructions.pdf",
  quote: "All of the measures ... are in the public domain",
});

/* ── sections ────────────────────────────────────────────────────────────── */

export const STATUS_SECTIONS: CatalogSection[] = [
  {
    id: "diagnosis",
    display: "Diagnosis",
    order: 1,
    description: "How and when it was made — not just that it was.",
  },
  {
    id: "treatment",
    display: "Treatment & access",
    order: 5,
    description: "Classes and regimen, and whether the patient can actually get them.",
  },
  {
    id: "hypoglycaemia",
    display: "Hypoglycaemia",
    order: 6,
    description: "Burden, awareness and driving.",
  },
  {
    id: "selfcare",
    display: "Self-management & context",
    order: 10,
  },
];

const YES_NO_UNKNOWN = [
  { value: "yes", display: "Yes" },
  { value: "no", display: "No" },
  { value: "unknown", display: "Not known" },
];

const FREQ = [
  { value: "never", display: "Never" },
  { value: "lt_monthly", display: "Less than monthly" },
  { value: "monthly", display: "About monthly" },
  { value: "weekly", display: "About weekly" },
  { value: "most_days", display: "Most days" },
];

/* ── features ────────────────────────────────────────────────────────────── */

export const STATUS_FEATURES: Feature[] = [
  /* ── diagnosis ──────────────────────────────────────────────────────── */
  {
    code: "dm_status",
    display: "Diabetes status",
    kind: "history",
    valueType: "single_select",
    section: "diagnosis",
    options: [
      { value: "known", display: "Known diabetes" },
      { value: "evaluating", display: "Being evaluated" },
      { value: "none", display: "No known diabetes" },
    ],
  },
  {
    /**
     * What a PREVIOUS clinician wrote down — kept strictly separate from
     * `classify()`, which reports what the evidence here supports. Recording the
     * inherited label without letting it masquerade as a conclusion is the point:
     * ADA notes misdiagnosis in a substantial share of adults with new type 1.
     */
    code: "diabetes_type_recorded",
    display: "Type recorded by a previous clinician",
    kind: "history",
    valueType: "single_select",
    section: "diagnosis",
    citation: WHO_2019_CLASS,
    options: [
      { value: "type_1", display: "Type 1" },
      { value: "type_2", display: "Type 2" },
      { value: "gestational", display: "Gestational" },
      { value: "other", display: "Other specific type" },
      { value: "not_recorded", display: "Not recorded" },
    ],
  },
  {
    code: "age_at_diagnosis_years",
    display: "Age at diagnosis",
    kind: "history",
    valueType: "number",
    unit: "years",
    section: "diagnosis",
    citation: ADA_2026_EVAL,
  },
  {
    code: "dm_duration_years",
    display: "Duration of diabetes",
    kind: "history",
    valueType: "number",
    unit: "years",
    section: "diagnosis",
    citation: ADA_2026_EVAL,
  },
  {
    /**
     * Not in any guideline — an implementation adaptation, and flagged as such.
     * Where care has moved between facilities without records, "about ten years
     * ago" is the common case. Recording the PRECISION stops a soft recollection
     * hardening into a duration-based screening decision.
     */
    code: "diagnosis_date_precision",
    display: "How precisely the diagnosis date is known",
    kind: "history",
    valueType: "single_select",
    section: "diagnosis",
    citation: c({
      standard: "local",
      version: "MedSync implementation adaptation",
      title: "Not defined by ADA or WHO — recorded to qualify duration-based rules",
      needsCsoInput:
        "Implementation adaptation; no guideline source. CSO to confirm the option set.",
    }),
    options: [
      { value: "exact", display: "Exact date documented" },
      { value: "month_year", display: "Month and year" },
      { value: "year", display: "Year only" },
      { value: "approx", display: "Approximate — 'about N years ago'" },
      { value: "unknown", display: "Unknown" },
    ],
  },
  {
    /**
     * The engine currently has no way to know HOW an established diagnosis was
     * made. WHO PEN states point-of-care devices may be used where laboratory
     * services are unavailable, so that is a first-class option here, not an
     * error state.
     */
    code: "diagnostic_test_used",
    display: "Test the diagnosis was made on",
    kind: "history",
    valueType: "single_select",
    section: "diagnosis",
    citation: ADA_2026_DX,
    options: [
      { value: "fpg", display: "Fasting plasma glucose" },
      { value: "random_symptomatic", display: "Random glucose with classic symptoms" },
      { value: "ogtt", display: "2-hour OGTT" },
      { value: "hba1c", display: "HbA1c" },
      { value: "crisis", display: "Diagnosed during DKA or HHS" },
      { value: "poc_capillary", display: "Point-of-care capillary glucose only" },
      { value: "in_pregnancy", display: "First detected in pregnancy" },
      { value: "unknown", display: "Not known — diagnosed elsewhere" },
    ],
  },
  {
    /** The commonest reversible error in a transferred diabetes record. */
    code: "diagnosis_confirmed_by_second_test",
    display: "Confirmed by a second abnormal result",
    kind: "history",
    valueType: "single_select",
    section: "diagnosis",
    options: YES_NO_UNKNOWN,
    citation: ADA_2026_DX,
  },
  {
    code: "symptoms_at_onset",
    display: "Symptoms at diagnosis",
    kind: "history",
    valueType: "multi_select",
    section: "diagnosis",
    citation: ADA_2026_DX,
    options: [
      { value: "polyuria", display: "Polyuria" },
      { value: "polydipsia", display: "Polydipsia" },
      { value: "weight_loss", display: "Unexplained weight loss" },
      { value: "crisis", display: "Presented in DKA or HHS" },
      { value: "asymptomatic", display: "Asymptomatic — found on testing" },
      { value: "unknown", display: "Not known" },
    ],
  },
  {
    code: "prior_dka_episodes",
    display: "Previous DKA admissions",
    kind: "history",
    valueType: "number",
    unit: "episodes",
    section: "diagnosis",
    citation: ADA_2026_GLYCAEMIC,
  },
  {
    code: "prior_hhs_episodes",
    display: "Previous HHS admissions",
    kind: "history",
    valueType: "number",
    unit: "episodes",
    section: "diagnosis",
    citation: ADA_2026_GLYCAEMIC,
  },

  /* ── treatment & access ─────────────────────────────────────────────── */
  {
    /** Classes only. No dose is recorded here or computed anywhere. */
    code: "glucose_lowering_classes",
    display: "Current glucose-lowering therapy",
    kind: "history",
    valueType: "multi_select",
    section: "treatment",
    citation: ADA_2026_EVAL,
    options: [
      { value: "none", display: "None — lifestyle only" },
      { value: "metformin", display: "Metformin" },
      { value: "sulfonylurea", display: "Sulfonylurea" },
      { value: "insulin", display: "Insulin" },
      { value: "dpp4", display: "DPP-4 inhibitor" },
      { value: "sglt2", display: "SGLT2 inhibitor" },
      { value: "glp1", display: "GLP-1 receptor agonist" },
      { value: "other", display: "Other" },
    ],
  },
  {
    code: "insulin_regimen_pattern",
    display: "Insulin regimen pattern",
    kind: "history",
    valueType: "single_select",
    section: "treatment",
    citation: ADA_2026_EVAL,
    options: [
      { value: "none", display: "Not on insulin" },
      { value: "basal_only", display: "Basal only" },
      { value: "premixed_bd", display: "Premixed, twice daily" },
      { value: "basal_bolus", display: "Basal-bolus" },
      { value: "other", display: "Other" },
    ],
  },
  {
    code: "self_injects",
    display: "Injects independently",
    kind: "history",
    valueType: "single_select",
    section: "treatment",
    options: YES_NO_UNKNOWN,
    citation: ADA_2026_EVAL,
  },
  {
    code: "smbg_frequency",
    display: "Self-monitoring frequency",
    kind: "history",
    valueType: "single_select",
    section: "treatment",
    options: FREQ,
    citation: ADA_2026_EVAL,
  },
  {
    /**
     * Owning a meter and being able to buy strips are different things, and the
     * second is what actually stops people monitoring. Asked separately on purpose.
     */
    code: "meter_and_strips_available",
    display: "Meter and test strips actually available",
    kind: "history",
    valueType: "single_select",
    section: "treatment",
    citation: WHO_PEN,
    options: [
      { value: "both", display: "Meter and strips" },
      { value: "meter_only", display: "Meter, but cannot get strips" },
      { value: "neither", display: "Neither" },
    ],
  },
  {
    /**
     * Treatment interruption is the single most actionable thing on this screen
     * in a resource-limited setting, and it is invisible unless asked. The
     * research's WHO citation for a supply field did not survive the audit, so
     * this is carried as an implementation adaptation rather than dressed up.
     */
    code: "treatment_interruption_12m",
    display: "Treatment interrupted in the last year",
    kind: "history",
    valueType: "multi_select",
    section: "treatment",
    citation: c({
      standard: "local",
      version: "MedSync implementation adaptation",
      title: "Access-to-medicines interruption — reasons",
      needsCsoInput:
        "The proposed WHO supply-chain citation did not survive audit. CSO to ratify the option set.",
    }),
    options: [
      { value: "none", display: "No interruption" },
      { value: "stockout", display: "Medicine out of stock" },
      { value: "cost", display: "Could not afford it" },
      { value: "distance", display: "Could not reach the clinic" },
      { value: "side_effects", display: "Stopped for side effects" },
      { value: "other", display: "Other" },
    ],
  },

  /* ── hypoglycaemia ──────────────────────────────────────────────────── */
  {
    code: "hypo_level2_frequency",
    display: "Episodes below 3.0 mmol/L",
    kind: "history",
    valueType: "single_select",
    section: "hypoglycaemia",
    options: FREQ,
    citation: ADA_2026_GLYCAEMIC,
  },
  {
    code: "hypo_level3_count_12m",
    display: "Severe episodes needing help, last 12 months",
    kind: "history",
    valueType: "number",
    unit: "episodes",
    section: "hypoglycaemia",
    citation: ADA_2026_GLYCAEMIC,
  },
  {
    code: "nocturnal_hypo",
    display: "Night-time hypoglycaemia",
    kind: "history",
    valueType: "single_select",
    section: "hypoglycaemia",
    options: YES_NO_UNKNOWN,
    citation: ADA_2026_GLYCAEMIC,
  },
  {
    /**
     * ADA's own single question, quoted verbatim from Section 6. This is why the
     * catalog needs none of the restricted awareness scores — Gold, Clarke,
     * Pedersen-Bjergaard and HypoA-Q are all permission-required, and this is
     * free, published, and does the same triage job.
     */
    code: "hypo_awareness_single_question",
    display: "Can you always feel when your blood sugar is low?",
    kind: "history",
    valueType: "single_select",
    section: "hypoglycaemia",
    citation: ADA_2026_GLYCAEMIC,
    options: [
      { value: "always", display: "Always feels it" },
      { value: "sometimes", display: "Sometimes" },
      { value: "never", display: "Never feels it" },
    ],
  },
  {
    /**
     * Running deliberately high to avoid lows is a common and commonly missed
     * reason for a poor HbA1c — treating it as non-adherence rather than fear is
     * the error this prevents. The proposed citation failed audit, so it is
     * carried honestly as unratified rather than dropped.
     */
    code: "runs_high_to_avoid_hypo",
    display: "Deliberately runs glucose high to avoid lows",
    kind: "history",
    valueType: "single_select",
    section: "hypoglycaemia",
    options: YES_NO_UNKNOWN,
    citation: c({
      standard: "local",
      version: "MedSync implementation adaptation",
      title: "Fear-of-hypoglycaemia avoidance behaviour",
      needsCsoInput:
        "Clinically endorsed by the audit but its proposed source did not contain it. CSO to supply a citation or drop.",
    }),
  },
  {
    code: "drives",
    display: "Drives",
    kind: "history",
    valueType: "single_select",
    section: "hypoglycaemia",
    options: YES_NO_UNKNOWN,
    citation: ADA_2026_GLYCAEMIC,
  },

  /* ── self-management & context ──────────────────────────────────────── */
  {
    code: "dsmes_received",
    display: "Diabetes self-management education received",
    kind: "history",
    valueType: "single_select",
    section: "selfcare",
    options: YES_NO_UNKNOWN,
    citation: ADA_2026_BEHAVIOUR,
  },
  {
    code: "smoking_status",
    display: "Smoking",
    kind: "history",
    valueType: "single_select",
    section: "selfcare",
    citation: ADA_2026_BEHAVIOUR,
    options: [
      { value: "never", display: "Never" },
      { value: "former", display: "Former" },
      { value: "current", display: "Current" },
    ],
  },
  {
    /**
     * The DDS-17 and DDS-2 are copyright-restricted (verified). So we record
     * THAT distress screening happened and its band — never the items. The same
     * pattern serves any restricted instrument a site chooses to use.
     */
    code: "diabetes_distress_screen",
    display: "Diabetes distress screening",
    kind: "history",
    valueType: "single_select",
    section: "selfcare",
    citation: ADA_2026_BEHAVIOUR,
    options: [
      { value: "not_done", display: "Not done" },
      { value: "none", display: "Done — no distress" },
      { value: "moderate", display: "Done — moderate distress" },
      { value: "high", display: "Done — high distress" },
    ],
  },
  {
    /** PHQ-2/PHQ-9 are explicitly public domain, so this one may be embedded. */
    code: "depression_screen_phq",
    display: "Depression screening (PHQ-2 / PHQ-9)",
    kind: "history",
    valueType: "single_select",
    section: "selfcare",
    citation: PHQ_PUBLIC_DOMAIN,
    options: [
      { value: "not_done", display: "Not done" },
      { value: "negative", display: "Negative" },
      { value: "positive", display: "Positive — needs assessment" },
    ],
  },
  {
    /** Free to use — "There is no fee or licensing requirement". */
    code: "food_insecurity",
    display: "Food insecurity (Hunger Vital Sign)",
    kind: "history",
    valueType: "single_select",
    section: "selfcare",
    citation: HUNGER_VITAL_SIGN,
    options: [
      { value: "not_done", display: "Not asked" },
      { value: "negative", display: "Negative" },
      { value: "positive", display: "Positive" },
    ],
  },
  {
    code: "financial_barrier_to_care",
    display: "Cost is a barrier to care",
    kind: "history",
    valueType: "single_select",
    section: "selfcare",
    options: YES_NO_UNKNOWN,
    citation: c({
      standard: "ADA",
      version: "Standards of Care in Diabetes—2026, Section 1",
      title: "1. Improving Care and Promoting Health in Populations",
      url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC12690184/",
      needsCsoInput:
        "ADA section numbering shifted between the 2024 and 2026 editions; the audit could not confirm the exact recommendation number. Field is sound; the locator needs the CSO's confirmation.",
    }),
  },
];
