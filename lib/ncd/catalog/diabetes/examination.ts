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
 *
 * ── The adolescent band (ADR 0083) ───────────────────────────────────────────
 * `pulse` and `respiratory_rate` carry an `ageRefRange` for 10–19-year-olds;
 * nothing else here does. Temperature and oxygen saturation do not move with
 * age, blood-pressure percentiles and BMI-for-age are deferred paediatric
 * content, and a band declared without cause is worse than no band at all —
 * resolution is band-first, so a guessed adolescent range REPLACES a defensible
 * adult one for every patient inside it. The postural pair, the capillary refill
 * and the weight trajectory live beside these in exam-vitals.ts.
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
 * The ordinary adult reference ranges — deliberately NOT NEWS2.
 *
 * NEWS2 is an early-warning score: it measures DETERIORATION so a ward knows
 * when to escalate, and its bands answer "how close is this patient to needing
 * review". A clerkship is asking a different question — "is this pulse normal"
 * — and presenting NEWS2 points as an interpretation would read as an acuity
 * call this surface is not making. The triage engine still uses NEWS2, where it
 * is the right instrument.
 *
 * These are the conventional teaching ranges. Universally used, and no guideline
 * was retrieved stating them, so they ship as ours.
 */
export const REFERENCE_RANGE = {
  standard: "local" as const,
  version: "Adult reference ranges",
  title: "Standard adult vital-sign reference ranges — not a guideline position",
  retrieved: RETRIEVED,
  csoSigned: false,
  needsCsoInput:
    "Conventional adult reference ranges, not a published guideline, and they vary between texts at the margins. A site may hold different local values. CSO to ratify.",
};

/**
 * The adolescent bands, and the evidence that they are needed rather than the
 * numbers themselves.
 *
 * Fleming's systematic review is the only source retrieved that speaks to this
 * age at all, and what it establishes is a NEGATIVE: the cut-offs in the widely
 * taught paediatric sets misclassify a large fraction of normal children, in
 * both directions. Its actual centile values live in the paper's figures and in
 * a supplementary web table, neither of which could be retrieved past the
 * abstract and the author manuscript, so they are not what is declared below.
 */
export const FLEMING_2011_VITALS = {
  standard: "local" as const,
  version: "Lancet 2011;377:1011–18 (author manuscript, PMC3789232)",
  title:
    "Fleming S, Thompson M, Stevens R, et al. Normal ranges of heart rate and respiratory rate in children from birth to 18 years of age: a systematic review of observational studies",
  url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC3789232",
  retrieved: "2026-09-07",
  csoSigned: false,
  quote:
    "In children over 12 years of age, the PALS upper limit of 16 breaths/minute is below the median value on our centile chart for much of this age range. … For example, at the age of ten years, the APLS cut-off for heart rate classifies approximately 40% of normal children as abnormal.",
  needsCsoInput:
    "THE NUMBERS BELOW ARE NOT FLEMING'S CENTILES. The centile values sit in the paper's figures and its supplementary web table, and neither was retrievable for this build — only the author manuscript's text, quoted above, which establishes that a band is needed and that the common paediatric cut-offs misclassify normal children. What is declared is therefore a WIDENED conventional envelope, chosen under one rule: an adolescent band may never be narrower than the adult range it replaces, because `ageRefRanges` resolves band-first and a tighter guess would flag normal adolescents as abnormal for every reader of this catalog. A single band across 10–19 years is itself a compromise — a ten-year-old and a nineteen-year-old are not the same physiology. Paediatric early-warning charts were considered and rejected as the source: an early-warning score answers how close a child is to needing review, not whether this pulse is normal, and this file already declines NEWS2 for that reason. CSO to obtain Fleming's table and replace these limits, or to adopt a site scale.",
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
 * The waist thresholds. TWO tables, because it is two scales: the cut-points for
 * men and women are different numbers, not a refinement of one.
 *
 * Four risk categories, from the reference table supplied for this build. It is
 * NOT the WHO scale this catalog carried first, and the two disagree — WHO puts
 * a man's first threshold at 94 cm and its second at 102, this table at 100 and
 * 120. A 96 cm waist is "increased risk" to WHO and "low risk" here. That is a
 * real disagreement about a real patient, so it is recorded rather than
 * smoothed over, and the CSO decides which scale the site uses.
 */
export const WAIST_RISK = {
  standard: "local" as const,
  version: "Criteria for waist circumference in adults",
  title: "Waist circumference risk categories — four bands, by sex",
  retrieved: RETRIEVED,
  csoSigned: false,
  needsCsoInput:
    'Supplied as a reference table ("Criteria for Waist Circumference in Adults"): very low / low / high / very high, at 80, 100 and 120 cm for men and 70, 90 and 110 cm for women. The PRIMARY SOURCE WAS NOT RETRIEVED and these cut-points are not verified against it — the table is of the kind reproduced in exercise-physiology texts. It REPLACES the WHO expert-consultation scale (94/102 cm men, 80/88 cm women), which is published and cited and gives different answers. CSO to ratify which scale this site uses. Separately, ethnicity is still not recorded: IDF publishes lower thresholds for South Asian, Chinese, Japanese and other populations.',
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
    /**
     * The adult range stays the default and is unchanged; the adolescent band
     * is ADDITIVE and resolved band-first (ADR 0083). Only 10–19 is declared —
     * the younger bands are deferred with the rest of the paediatric increment,
     * and declaring one without a source would silently replace a defensible
     * range with a guess for every patient in it.
     */
    code: "pulse",
    display: "Pulse",
    valueType: "series",
    unit: "bpm",
    refRange: { low: 60, high: 100 },
    ageRefRanges: [{ band: "adolescent", low: 55, high: 110, citation: FLEMING_2011_VITALS }],
    citation: MEASUREMENT,
  }),
  vital({
    /**
     * The one band with a directional argument behind it: Fleming reports that
     * in children over twelve the PALS upper limit of 16 breaths/min sits BELOW
     * the median of their chart, so an adolescent breathing faster than an adult
     * ceiling is not necessarily breathing abnormally. The upper limit is
     * widened for that reason and the lower one left where the adult range puts
     * it.
     */
    code: "respiratory_rate",
    display: "Respiratory rate",
    valueType: "series",
    unit: "breaths/min",
    refRange: { low: 12, high: 20 },
    ageRefRanges: [{ band: "adolescent", low: 12, high: 24, citation: FLEMING_2011_VITALS }],
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
    citation: WAIST_RISK,
  }),
];
