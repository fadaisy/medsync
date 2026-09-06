/**
 * The examination — starting with what is measured before anyone is touched.
 *
 * ── Why vitals belong to the clerkship at all ────────────────────────────────
 * They are usually already recorded. A triaged patient has a blood pressure, a
 * pulse and a temperature in `clinical_observations` before the doctor opens
 * this form, and asking for them again is how a form gets routed around. So
 * these fields exist to be FILLED FROM the record where one exists, and typed
 * only where it does not — see lib/ncd/vitals.ts.
 *
 * What they are not is decoration. In diabetes the blood pressure is a second
 * disease being treated in the same visit, the BMI is the risk factor the whole
 * management ladder turns on, and the waist is the one measurement that says
 * something the BMI cannot.
 *
 * ── What is here, and what is coming ─────────────────────────────────────────
 * Vitals and body measurements. The systems examination, the diabetic foot
 * examination and the ankle-brachial index belong in this section too and are
 * not built yet; the section is structured so they arrive as groups beside these
 * rather than as a restructuring.
 */
import type { Feature } from "@/lib/ncd/catalog/schema";

const RETRIEVED = "2026-09-06";

/**
 * ADA Standards of Care, Section 10. Read directly — 10.4 gives the target and
 * 10.7/10.8 give the two boundaries the bands are drawn on.
 */
export const ADA_S10_BP = {
  standard: "ADA" as const,
  version: "Standards of Care in Diabetes, Section 10 (rec 10.4, 10.7, 10.8)",
  title: "10. Cardiovascular Disease and Risk Management",
  url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC10725811/",
  retrieved: RETRIEVED,
  csoSigned: false,
  quote:
    "The on-treatment target blood pressure goal is <130/80 mmHg, if it can be safely attained. … Individuals with confirmed office-based blood pressure ≥130/80 mmHg qualify for initiation and titration of pharmacologic therapy … Individuals with confirmed office-based blood pressure ≥150/90 mmHg should, in addition to lifestyle therapy, have prompt initiation and timely titration",
};

/** WHO's BMI classification — the one every other body's cut-points are read against. */
export const WHO_BMI = {
  standard: "WHO" as const,
  version: "WHO — obesity and overweight",
  title: "Obesity and overweight — WHO fact sheet",
  url: "https://www.who.int/news-room/fact-sheets/detail/obesity-and-overweight",
  retrieved: RETRIEVED,
  csoSigned: false,
  quote:
    "overweight is a BMI greater than or equal to 25; and obesity is a BMI greater than or equal to 30",
};

/**
 * NEWS2, as this project already encodes it in `lib/triage/constants.ts` — which
 * is a CSO-authored file transcribed verbatim from the triage research document.
 * The bands here mirror those boundaries rather than re-deriving them, and a
 * test asserts the two agree so they cannot drift apart.
 */
export const NEWS2_SOURCE = {
  standard: "local" as const,
  version: "NEWS2 (Royal College of Physicians), as encoded in lib/triage/constants.ts",
  title: "National Early Warning Score 2 — the boundaries this project already uses",
  url: "https://www.rcp.ac.uk/improving-care/resources/national-early-warning-score-news-2/",
  retrieved: RETRIEVED,
  csoSigned: false,
  needsCsoInput:
    "The BOUNDARIES are NEWS2's and are pinned to the triage constants by test. Folding its 1- and 2-point steps into one 'raised' band is a presentation choice of ours, not NEWS2's own vocabulary. CSO to ratify.",
};

/** A measurement is a clinical claim about a body; the convention is still ours. */
const MEASUREMENT = {
  standard: "local" as const,
  version: "MedSync clinical reasoning",
  title: "Measurement convention — not a guideline position",
  retrieved: RETRIEVED,
  csoSigned: false,
  needsCsoInput:
    "Standard bedside measurement units and reference ranges. Universally used, but no guideline was retrieved stating them. CSO to ratify.",
};

const vital = (f: Omit<Feature, "section" | "kind" | "group">): Feature => ({
  ...f,
  kind: "measurement",
  section: "examination",
  group: "vitals",
});

/** Anthropometry sits with the vitals: it is measured in the same breath. */
const body = vital;

/**
 * WHO's waist thresholds. TWO tables, because it is two scales: the cut-points
 * for men and women are different numbers, not a refinement of one.
 */
export const WHO_WAIST = {
  standard: "WHO" as const,
  version: "Waist circumference and waist–hip ratio: report of a WHO expert consultation",
  title: "WHO expert consultation on waist circumference and waist–hip ratio",
  url: "https://iris.who.int/handle/10665/44583",
  retrieved: RETRIEVED,
  csoSigned: false,
  needsCsoInput:
    "The WHO/NIH cut-points below (94/102 cm men, 80/88 cm women) are the Europid values. IDF publishes LOWER thresholds for South Asian, Chinese, Japanese and other populations, and this catalog records no ethnicity. CSO to decide the site default.",
};

export const EXAMINATION_FEATURES: Feature[] = [
  {
    /**
     * Recorded because the MEASUREMENTS need it, not as a demographic exercise:
     * the waist thresholds and WHO's anaemia cutoffs are both sex-specific, and
     * without this the surface would have to print one sex's numbers as if they
     * were everyone's.
     *
     * Prefilled from the patient record, where it already exists — nobody should
     * be asked for a demographic the chart already holds.
     */
    code: "sex",
    display: "Sex",
    kind: "history",
    valueType: "single_select",
    section: "examination",
    group: "vitals",
    citation: MEASUREMENT,
    options: [
      { value: "female", display: "Female" },
      { value: "male", display: "Male" },
      { value: "other", display: "Other or not recorded" },
    ],
  },
  /* ── vitals ───────────────────────────────────────────────────────────── */
  vital({
    /**
     * Two fields rather than one "148/92", because the two are banded
     * separately and treated separately — ADA's trigger is EITHER limb of it,
     * so a patient at 128/94 qualifies for treatment on the diastolic alone and
     * a single string could not say that.
     */
    code: "bp_systolic",
    display: "Blood pressure — systolic",
    valueType: "series",
    unit: "mmHg",
    refRange: { low: 90, high: 130 },
    citation: ADA_S10_BP,
  }),
  vital({
    code: "bp_diastolic",
    display: "Blood pressure — diastolic",
    valueType: "series",
    unit: "mmHg",
    refRange: { low: 60, high: 80 },
    citation: ADA_S10_BP,
  }),
  vital({
    code: "pulse",
    display: "Pulse",
    valueType: "series",
    unit: "bpm",
    refRange: { low: 60, high: 100 },
    citation: MEASUREMENT,
  }),
  vital({
    code: "respiratory_rate",
    display: "Respiratory rate",
    valueType: "series",
    unit: "breaths/min",
    refRange: { low: 12, high: 20 },
    citation: MEASUREMENT,
  }),
  vital({
    code: "temperature",
    display: "Temperature",
    valueType: "series",
    unit: "°C",
    refRange: { low: 36, high: 37.5 },
    citation: MEASUREMENT,
  }),
  vital({
    code: "spo2",
    display: "Oxygen saturation",
    valueType: "series",
    unit: "%",
    refRange: { low: 94, high: 100 },
    citation: MEASUREMENT,
  }),

  /* ── body measurements ────────────────────────────────────────────────── */
  body({
    code: "weight_kg",
    display: "Weight",
    valueType: "number",
    unit: "kg",
    citation: MEASUREMENT,
  }),
  body({
    code: "height_cm",
    display: "Height",
    valueType: "number",
    unit: "cm",
    citation: MEASUREMENT,
  }),
  body({
    /**
     * Computed, never typed, and never stored. A stored BMI is a number that can
     * disagree with the weight beside it the moment somebody corrects one —
     * derived fresh, it cannot.
     */
    code: "bmi",
    display: "BMI",
    valueType: "number",
    unit: "kg/m²",
    computed: { formula: "bmi", from: ["weight_kg", "height_cm"] },
    citation: WHO_BMI,
  }),
  body({
    /**
     * The measurement the BMI cannot make. Central fat is what drives insulin
     * resistance, so a normal BMI with a large waist is a real and common
     * phenotype — and it is exactly the patient a BMI-only assessment calls
     * healthy.
     *
     * Banded now that `sex` is captured, against WHO's cut-points — as TWO
     * tables, because men and women have different numbers rather than a shared
     * scale with an adjustment. Ethnicity remains unrecorded, and the note on
     * the table says so: IDF's thresholds are lower for several populations.
     */
    code: "waist_cm",
    display: "Waist circumference",
    valueType: "number",
    unit: "cm",
    citation: WHO_WAIST,
  }),
];
