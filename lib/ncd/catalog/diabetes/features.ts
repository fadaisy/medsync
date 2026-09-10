/**
 * Diabetes catalog — capabilities, form sections and features.
 *
 * A feature with NO `requires` is bedside: it needs nothing but the clinician.
 * A feature WITH `requires` can be distinguished by the engine as "not done yet"
 * versus "cannot be done here", which is what keeps the gaps list actionable
 * instead of nagging about tests the site does not have.
 *
 * Thresholds live in diagnosis.ts / complications.ts, never here. `refRange` on
 * a feature is for DISPLAY only and is never used to decide anything.
 */
import type {
  Capability,
  CatalogSection,
  Citation,
  Feature,
  FeatureOption,
} from "@/lib/ncd/catalog/schema";

/**
 * ADA Section 9 — pharmacologic approaches. Cited for the therapy CLASS list
 * only; no agent and no dose is encoded anywhere in this catalog.
 */
/** ADA Section 5 — the behavioural interventions, cited for the lifestyle list. */
const ADA_2026_BEHAVIOUR: Citation = {
  standard: "ADA",
  version: "Standards of Care in Diabetes—2026, Section 5",
  title: "5. Facilitating Positive Health Behaviors and Well-being",
  url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC12690188/",
  retrieved: "2026-09-05",
  csoSigned: false,
};

export const ADA_2026_PHARM: Citation = {
  standard: "ADA",
  version: "Standards of Care in Diabetes—2026, Section 9",
  title: "9. Pharmacologic Approaches to Glycemic Treatment",
  url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC12690185/",
  retrieved: "2026-09-05",
  csoSigned: false,
};

/**
 * Glucose-lowering therapy BY CLASS, declared once.
 *
 * The status tab records what the patient is on; the crisis-precipitant screen
 * records what they were on and what they are on now. Those three lists have to
 * be the same list or the comparison between them means nothing — a "switch"
 * from a class that exists in one list to a class that does not is not a switch
 * anyone can read.
 */
export const THERAPY_CLASSES: FeatureOption[] = [
  { value: "none", display: "None — no glucose-lowering drug", noDetail: true },
  { value: "metformin", display: "Metformin · oral" },
  { value: "sulfonylurea", display: "Sulfonylurea · oral" },
  { value: "dpp4", display: "DPP-4 inhibitor · oral" },
  { value: "sglt2", display: "SGLT2 inhibitor · oral" },
  { value: "tzd", display: "Thiazolidinedione · oral" },
  { value: "agi", display: "Alpha-glucosidase inhibitor · oral" },
  { value: "glp1", display: "GLP-1 receptor agonist · injectable" },
  { value: "insulin", display: "Insulin · injectable" },
  {
    value: "other",
    display: "Other",
    // The same input asking a different question: which drug, not what dose.
    detail: { label: "Drug", placeholder: "Name, and dose if known" },
  },
  { value: "unknown", display: "Not known", noDetail: true },
];

export const CAPABILITIES: Capability[] = [
  { code: "device.glucometer", display: "Glucometer (capillary glucose)", tier: "bedside" },
  { code: "device.monofilament", display: "10 g Semmes-Weinstein monofilament", tier: "bedside" },
  {
    code: "device.doppler_abi",
    display: "Doppler probe for ankle-brachial index",
    tier: "bedside",
  },
  {
    /**
     * Added so the biothesiometer reading can be marked UNOBTAINABLE rather than
     * merely undone. Without a capability code the field reads as a gap the
     * clinician has failed to close, at every site that will never own the
     * instrument — which is the exact collapse the four-state evaluator exists
     * to refuse. `specialist` rather than `bedside`: it is a mains-powered
     * device costing far more than a tuning fork, and the tuning fork beside it
     * answers most of the same question.
     */
    code: "device.biothesiometer",
    display: "Biothesiometer (vibration perception threshold)",
    tier: "specialist",
  },
  { code: "lab.glucose", display: "Laboratory plasma glucose", tier: "basic_lab" },
  { code: "lab.hba1c", display: "HbA1c assay", tier: "basic_lab" },
  {
    // Declared SEPARATELY from lab.hba1c because NGSP certification is what makes
    // an HbA1c result usable for DIAGNOSIS, and because variant interference is
    // assay-specific. A site with HbA1c but without this cannot diagnose on it.
    code: "lab.hba1c_ngsp_certified",
    display: "HbA1c assay is NGSP-certified / DCCT-standardised",
    tier: "basic_lab",
  },
  { code: "lab.ketones_blood", display: "Blood beta-hydroxybutyrate", tier: "basic_lab" },
  { code: "lab.ketones_urine", display: "Urine ketone strips", tier: "bedside" },
  { code: "lab.blood_gas", display: "Blood gas / pH + bicarbonate", tier: "advanced_lab" },
  { code: "lab.electrolytes", display: "Serum sodium and urea", tier: "basic_lab" },
  { code: "lab.creatinine", display: "Serum creatinine (for eGFR)", tier: "basic_lab" },
  {
    code: "lab.urine_acr",
    display: "Quantitative urine albumin-to-creatinine ratio",
    tier: "advanced_lab",
  },
  { code: "lab.urine_dipstick", display: "Urine protein reagent strip", tier: "bedside" },
  { code: "imaging.fundus", display: "Dilated fundoscopy or retinal camera", tier: "imaging" },
  { code: "lab.c_peptide", display: "C-peptide", tier: "specialist" },
  {
    code: "lab.islet_autoantibodies",
    display: "Islet autoantibodies (GAD65, IA-2, ZnT8, IAA)",
    tier: "specialist",
  },
];

export const SECTIONS: CatalogSection[] = [
  {
    id: "status",
    display: "Diabetes status",
    order: 1,
    description: "Known, suspected, or being evaluated.",
  },
  {
    id: "symptoms",
    display: "Symptoms",
    order: 2,
    /**
     * Complication symptoms live HERE, not in a section of their own. A
     * clinician asks about symptoms once, and splitting the question across two
     * tabs made the split the form's problem rather than the clerkship's.
     *
     * What keeps one section from becoming a scroll is a SCREENING QUESTION per
     * system — a real catalog feature, so the gate is a recorded clinical answer
     * evaluated by the same evaluator as everything else, and "asked, and
     * negative" is captured rather than left as twenty blank rows. The bands
     * follow what the answers DO, which is the clerkship's own axis: WHO PEN
     * organises its diabetes module the same way, and HEARTS-D splits acute from
     * chronic before it splits micro from macro.
     */
    groups: [
      {
        id: "classic",
        display: "Classic symptoms of high sugar",
        order: 1,
        icon: "droplets",
        description: "ADA's three classic symptoms decide whether one glucose can diagnose today.",
      },
      {
        id: "skin_and_healing",
        display: "Skin, wounds and infections",
        order: 2,
        icon: "bandage",
        description: "How undiagnosed type 2 usually walks in.",
      },
      {
        id: "crisis",
        display: "Signs this is an emergency now",
        order: 3,
        icon: "siren",
        tone: "alert",
        description: "These stop the clerking.",
      },
      {
        id: "hypoglycaemia",
        display: "Lows (hypoglycaemia)",
        order: 4,
        icon: "falling",
        description: "The field that changes a dose before the patient leaves.",
      },
      {
        id: "feet_and_legs",
        display: "Feet and legs",
        order: 5,
        icon: "foot",
        description: "One examination, one referral decision.",
      },
      {
        id: "eyes_and_kidneys",
        display: "Eyes and kidneys",
        order: 6,
        icon: "eye",
        description: "Silent until far advanced — a 'no' here does not close the screening.",
      },
      { id: "heart_and_brain", display: "Heart and brain", order: 7, icon: "pulse" },
      {
        id: "autonomic",
        display: "Autonomic symptoms",
        order: 8,
        icon: "waves",
        description: "Never volunteered, and each answer has its own action.",
      },
    ],
  },
  {
    id: "examination",
    display: "Examination",
    order: 3,
    description: "What is measured, and what is found.",
    /**
     * Two separate acts, done at two separate moments — the vitals are read off
     * a machine and a chart, the general survey is done with hands and eyes on
     * the patient. Stacking them down one card makes the second look like an
     * appendix to the first, and it is not.
     */
    segmented: true,
    groups: [
      {
        id: "vitals",
        display: "Vitals",
        order: 1,
        icon: "pulse",
        description: "Prefilled from triage where the patient was triaged.",
      },
      {
        id: "general",
        display: "General examination",
        order: 2,
        icon: "stethoscope",
        description: "The survey done before any single system is examined.",
      },
      /*
       * The regions, in the order the examination is actually performed: from
       * the end of the bed, then the hands, then the face and neck, then the
       * skin, then the legs. Nested under the segment rather than listed beside
       * it, because they are not five places to navigate to — they are one
       * examination with an order to it.
       */
      {
        id: "gx_survey",
        display: "From the end of the bed",
        order: 21,
        parent: "general",
        icon: "eye",
        description: "What is true before anyone is touched.",
      },
      {
        id: "gx_colour",
        display: "Colour",
        order: 22,
        parent: "general",
        icon: "droplets",
        description: "Conjunctivae, palms, mucosa, nail beds.",
      },
      {
        id: "gx_hands",
        display: "Hands",
        order: 23,
        parent: "general",
        icon: "hand",
      },
      {
        id: "gx_head_neck",
        display: "Head and neck",
        order: 24,
        parent: "general",
        icon: "smile",
      },
      {
        id: "gx_skin",
        display: "Skin",
        order: 25,
        parent: "general",
        icon: "scan",
        description: "ADA asks for this one by name at every visit.",
      },
      {
        id: "gx_legs",
        display: "Legs and fluid",
        order: 26,
        parent: "general",
        icon: "waves",
      },
      {
        /**
         * Its own region rather than part of the skin survey, because it is a
         * different act: the patient has to expose the sites and the sites have
         * to be PALPATED, not looked at. Lipohypertrophy is smooth, painless and
         * frequently invisible, and it is one of the commonest real causes of
         * erratic control — which is exactly the finding a visual skin sweep
         * misses.
         */
        id: "gx_injection",
        display: "Injection and infusion sites",
        order: 27,
        parent: "general",
        icon: "syringe",
        description: "Only where insulin or a GLP-1 agonist is injected.",
      },
      /*
       * The system examinations, as segments beside the survey rather than
       * regions inside it. Each is a separate act performed at a separate
       * moment, often with equipment the survey does not need — which is the
       * same test `general` had to pass to be split from `vitals`.
       */
      {
        id: "neuro",
        display: "Neurological",
        order: 3,
        icon: "brain",
        description: "Conscious level, cranial nerves, and the autonomic system.",
      },
      {
        id: "nx_conscious",
        display: "Conscious level",
        order: 31,
        parent: "neuro",
        icon: "eye",
        description: "Graded, not described — a trend is what matters.",
      },
      {
        id: "nx_focal",
        display: "Focal signs and seizures",
        order: 32,
        parent: "neuro",
        icon: "zap",
      },
      {
        id: "nx_autonomic",
        display: "Autonomic",
        order: 33,
        parent: "neuro",
        icon: "waves",
        description: "Never volunteered, and each finding has its own action.",
      },
      {
        id: "eyes",
        display: "Eyes",
        order: 4,
        icon: "eye",
        description: "Acuity first — it is the finding that changes the referral.",
      },
      {
        id: "ey_acuity",
        display: "Vision",
        order: 41,
        parent: "eyes",
        icon: "eye",
      },
      {
        id: "ey_fundus",
        display: "Fundus",
        order: 42,
        parent: "eyes",
        icon: "scan",
        description: "Staged against a published scale, with its referral trigger.",
      },
      {
        id: "ey_external",
        display: "External eye and orbit",
        order: 43,
        parent: "eyes",
        icon: "alert",
        tone: "alert",
        description: "Where the sight- and life-threatening infections declare themselves.",
      },
      {
        id: "abdomen",
        display: "Abdomen",
        order: 5,
        icon: "scan",
        description: "The crisis abdomen, and the infections that hide behind it.",
      },
      {
        id: "ab_palpation",
        display: "Palpation",
        order: 51,
        parent: "abdomen",
        icon: "hand",
      },
      {
        id: "ab_infection",
        display: "Severe infection",
        order: 52,
        parent: "abdomen",
        icon: "siren",
        tone: "alert",
      },
      {
        id: "msk",
        display: "Musculoskeletal",
        order: 6,
        icon: "hand",
        description: "Cheap to examine, and a marker of long glycaemic exposure.",
      },
    ],
  },
  {
    id: "precipitants",
    display: "Crisis precipitants",
    order: 4,
    description: "What set this off — insulin and fluids alone will not fix it.",
  },
  { id: "glycaemia", display: "Glycaemia", order: 5 },
  {
    id: "hba1c_validity",
    display: "HbA1c reliability",
    order: 6,
    description: "Conditions that make HbA1c unsafe to diagnose on.",
  },
  {
    id: "acute",
    display: "Acute assessment",
    order: 7,
    description: "Ketones, acid-base and osmolality.",
  },
  { id: "kidney", display: "Kidney", order: 8 },
  {
    id: "foot",
    display: "Foot",
    order: 9,
    description: "The IWGDF examination, in the order it is performed.",
    /*
     * Segmented for the same reason the general examination is: looking, feeling
     * for pulses and testing sensation are three separate acts with three
     * different pieces of equipment, and stacking them down one card makes the
     * later ones read as an appendix to the first.
     */
    segmented: true,
    groups: [
      {
        id: "ft_look",
        display: "Skin and nails",
        order: 1,
        icon: "eye",
        description: "Both feet, socks off, between the toes and the heels included.",
      },
      {
        id: "ft_deformity",
        display: "Shape",
        order: 2,
        icon: "scan",
        description: "Deformity loads the foot where it was not built to be loaded.",
      },
      {
        id: "ft_neuro",
        display: "Sensation",
        order: 3,
        icon: "zap",
        description: "Loss of protective sensation is painless — it is only ever found by testing.",
      },
      {
        id: "ft_vascular",
        display: "Circulation",
        order: 4,
        icon: "pulse",
      },
      {
        id: "ft_ulcer",
        display: "Ulcer",
        order: 5,
        icon: "bandage",
        tone: "alert",
        description: "Graded and staged — an ulcer without a grade cannot be handed over.",
      },
      {
        id: "ft_footwear",
        display: "Footwear",
        order: 6,
        icon: "foot",
        description: "The commonest cause of the next ulcer is in the patient's hand.",
      },
    ],
  },
  { id: "history", display: "History", order: 10 },
];

const KETONE_STRIP = [
  { value: "neg", display: "Negative" },
  { value: "trace", display: "Trace" },
  { value: "1plus", display: "1+" },
  { value: "2plus", display: "2+" },
  { value: "3plus", display: "3+ or more" },
];

export const FEATURES: Feature[] = [
  /* ── status ─────────────────────────────────────────────────────────── */
  {
    code: "dm_status",
    display: "Diabetes status",
    kind: "history",
    valueType: "single_select",
    section: "status",
    options: [
      { value: "known", display: "Known diabetes" },
      { value: "evaluating", display: "Being evaluated" },
      { value: "none", display: "No known diabetes" },
    ],
  },
  {
    /**
     * Recorded in whatever unit the patient actually knows it in — "about six
     * weeks" and "eleven years" are both normal answers. Thresholds in this
     * catalog are written in `unit` (years) and the engine normalises both sides
     * to days before comparing, so the entered unit never changes the verdict.
     */
    code: "dm_duration",
    display: "Time since diagnosis",
    kind: "history",
    valueType: "duration",
    unit: "years",
    section: "status",
  },
  {
    /**
     * Current glucose-lowering therapy, BY CLASS. Multi-select because
     * combination therapy is the norm rather than the exception, and because the
     * previous boolean ("on insulin?") could not distinguish a patient on
     * metformin alone from one on nothing at all — the two carry entirely
     * different implications for control, hypoglycaemia risk and what to do next.
     *
     * Classes only, never agents and never doses: naming a drug edges toward
     * prescribing, which this catalog does not do (ADR 0082). Oral and injectable
     * routes are marked in the labels so the list stays readable at a glance.
     */
    code: "glucose_lowering_therapy",
    display: "Current glucose-lowering therapy",
    kind: "history",
    valueType: "multi_select",
    section: "status",
    citation: ADA_2026_PHARM,
    optionDetail: { label: "Dose", placeholder: "e.g. 1 g twice daily" },
    options: THERAPY_CLASSES,
  },
  {
    /**
     * WHICH sulfonylurea, because the class hides the one decision in it.
     *
     * The therapy list is by class, which is right for everything else — the
     * engine reasons about metformin the class, not about brands. But WHO
     * directs a switch from glibenclamide to gliclazide BY NAME, and
     * glibenclamide is the sulfonylurea most widely dispensed where this module
     * is going. A class-level list cannot express the commonest correctable
     * prescribing problem in the setting it is built for, so this one class gets
     * an agent. The dose stays where it is — in `optionDetail`, inert.
     */
    code: "sulfonylurea_agent",
    display: "Which sulfonylurea",
    kind: "history",
    valueType: "single_select",
    section: "status",
    showWhen: { feature: "glucose_lowering_therapy", op: "==", value: "sulfonylurea" },
    citation: ADA_2026_PHARM,
    options: [
      { value: "glibenclamide", display: "Glibenclamide (glyburide)" },
      { value: "gliclazide", display: "Gliclazide" },
      { value: "glimepiride", display: "Glimepiride" },
      { value: "glipizide", display: "Glipizide" },
      { value: "other", display: "Other" },
      { value: "unknown", display: "Not known" },
    ],
  },
  {
    /**
     * Lifestyle modification is an intervention, not the absence of one. Recorded
     * separately from drug therapy because "on nothing" and "on structured
     * dietary advice, exercise and a weight-management plan" are different
     * patients, and only one of them has an untried option left.
     *
     * No detail field: these are not dosed, and an input beside them would
     * invite a value that cannot mean anything.
     */
    code: "lifestyle_modification",
    display: "Lifestyle modification in place",
    kind: "history",
    valueType: "multi_select",
    section: "status",
    citation: ADA_2026_BEHAVIOUR,
    options: [
      { value: "none", display: "None in place" },
      { value: "nutrition", display: "Medical nutrition therapy / dietary advice" },
      { value: "physical_activity", display: "Physical activity" },
      { value: "weight_management", display: "Weight management" },
      { value: "smoking_cessation", display: "Smoking cessation" },
      { value: "alcohol_reduction", display: "Alcohol reduction" },
      { value: "dsmes", display: "Diabetes self-management education" },
      { value: "unknown", display: "Not known" },
    ],
  },
  {
    /**
     * Only asked once insulin is one of the answers. Not a property OF the
     * therapy list — a separate question that simply does not arise otherwise,
     * which is what `showWhen` is for as distinct from `parent`.
     */
    code: "insulin_regimen_pattern",
    display: "Insulin regimen pattern",
    kind: "history",
    valueType: "single_select",
    section: "status",
    showWhen: { feature: "glucose_lowering_therapy", op: "==", value: "insulin" },
    citation: ADA_2026_PHARM,
    options: [
      { value: "basal_only", display: "Basal only" },
      { value: "premixed_bd", display: "Premixed, twice daily" },
      { value: "basal_bolus", display: "Basal-bolus" },
      {
        value: "other",
        display: "Other",
        // Optional: the selection alone is the recorded answer, and the note is
        // there for the regimens the four named patterns do not describe.
        detail: { label: "Regimen", placeholder: "Describe it (optional)" },
      },
    ],
  },

  /* ── glycaemia ──────────────────────────────────────────────────────── */
  {
    code: "fpg",
    display: "Fasting plasma glucose",
    kind: "investigation",
    valueType: "number",
    unit: "mmol/L",
    altUnit: { unit: "mg/dL", factor: 18.0182 },
    requires: "lab.glucose",
    refRange: { low: 3.9, high: 5.5 },
    section: "glycaemia",
  },
  {
    code: "ogtt_2h",
    display: "2-hour plasma glucose (75 g OGTT)",
    kind: "investigation",
    valueType: "number",
    unit: "mmol/L",
    altUnit: { unit: "mg/dL", factor: 18.0182 },
    requires: "lab.glucose",
    section: "glycaemia",
  },
  {
    code: "random_pg",
    display: "Random plasma glucose",
    kind: "investigation",
    valueType: "number",
    unit: "mmol/L",
    altUnit: { unit: "mg/dL", factor: 18.0182 },
    requires: "lab.glucose",
    section: "glycaemia",
  },
  {
    code: "capillary_glucose",
    display: "Capillary (bedside) glucose",
    kind: "measurement",
    valueType: "number",
    unit: "mmol/L",
    altUnit: { unit: "mg/dL", factor: 18.0182 },
    requires: "device.glucometer",
    section: "glycaemia",
  },
  {
    code: "hba1c",
    display: "HbA1c",
    kind: "investigation",
    valueType: "number",
    unit: "%",
    requires: "lab.hba1c",
    refRange: { high: 5.6 },
    section: "glycaemia",
  },
  {
    code: "second_sample_confirms",
    display: "Confirmed on a second sample (separate day, same method)",
    kind: "investigation",
    valueType: "boolean",
    section: "glycaemia",
  },

  /* ── HbA1c reliability ──────────────────────────────────────────────── */
  {
    code: "haemoglobin_variant",
    display: "Haemoglobin variant",
    kind: "history",
    valueType: "single_select",
    section: "hba1c_validity",
    options: [
      { value: "none", display: "None known" },
      { value: "hbs_trait", display: "HbS trait" },
      { value: "hbss", display: "HbSS (sickle-cell disease)" },
      { value: "hbc", display: "HbC" },
      { value: "hbe", display: "HbE" },
      { value: "thalassaemia", display: "Thalassaemia" },
      { value: "unknown", display: "Not known" },
    ],
  },
  {
    code: "anaemia",
    display: "Anaemia",
    kind: "history",
    valueType: "boolean",
    section: "hba1c_validity",
  },
  {
    code: "iron_deficiency",
    display: "Iron deficiency",
    kind: "history",
    valueType: "boolean",
    section: "hba1c_validity",
  },
  {
    code: "haemolysis",
    display: "Haemolysis",
    kind: "history",
    valueType: "boolean",
    section: "hba1c_validity",
  },
  {
    code: "malaria_current",
    display: "Current or recent malaria",
    kind: "history",
    valueType: "boolean",
    section: "hba1c_validity",
  },
  {
    code: "recent_transfusion",
    display: "Transfusion in the last 3 months",
    kind: "history",
    valueType: "boolean",
    section: "hba1c_validity",
  },
  {
    code: "hiv_on_art",
    display: "HIV on antiretroviral therapy",
    kind: "history",
    valueType: "boolean",
    section: "hba1c_validity",
  },
  {
    code: "erythropoietin",
    display: "Erythropoietin therapy",
    kind: "history",
    valueType: "boolean",
    section: "hba1c_validity",
  },
  {
    code: "pregnant",
    display: "Pregnant",
    kind: "history",
    valueType: "boolean",
    section: "hba1c_validity",
  },
  {
    code: "on_dialysis",
    display: "On dialysis",
    kind: "history",
    valueType: "boolean",
    section: "hba1c_validity",
  },

  /* ── acute ──────────────────────────────────────────────────────────── */
  {
    code: "bohb",
    display: "Blood beta-hydroxybutyrate",
    kind: "investigation",
    valueType: "number",
    unit: "mmol/L",
    requires: "lab.ketones_blood",
    section: "acute",
  },
  {
    code: "urine_ketones",
    display: "Urine ketones",
    kind: "investigation",
    valueType: "single_select",
    options: KETONE_STRIP,
    requires: "lab.ketones_urine",
    section: "acute",
  },
  {
    code: "venous_ph",
    display: "Venous pH",
    kind: "investigation",
    valueType: "number",
    unit: "pH",
    requires: "lab.blood_gas",
    section: "acute",
  },
  {
    code: "bicarbonate",
    display: "Serum bicarbonate",
    kind: "investigation",
    valueType: "number",
    unit: "mmol/L",
    requires: "lab.blood_gas",
    section: "acute",
  },
  {
    code: "sodium",
    display: "Serum sodium",
    kind: "investigation",
    valueType: "number",
    unit: "mmol/L",
    requires: "lab.electrolytes",
    section: "acute",
  },
  {
    code: "urea",
    display: "Serum urea",
    kind: "investigation",
    valueType: "number",
    unit: "mmol/L",
    requires: "lab.electrolytes",
    section: "acute",
  },
  /**
   * The two osmolalities are SEPARATE features on purpose. The Phase 0 audit
   * flagged this as the highest coding risk in the whole set: the number 320
   * attaches to DIFFERENT quantities across standards, and the superseded 2009
   * formula took glucose in mg/dL divided by 18 where the current one takes
   * mmol/L. Storing "osmolality: 320" without recording which formula produced
   * it is how a patient gets mislabelled. Never collapse these into one field.
   */
  {
    code: "effective_osmolality",
    display: "Calculated effective serum osmolality — 2×Na + glucose",
    kind: "measurement",
    valueType: "number",
    unit: "mOsm/kg",
    requires: "lab.electrolytes",
    section: "acute",
  },
  {
    code: "total_osmolality",
    display: "Calculated total serum osmolality — 2×Na + glucose + urea",
    kind: "measurement",
    valueType: "number",
    unit: "mOsm/kg",
    requires: "lab.electrolytes",
    section: "acute",
  },
  {
    code: "mental_status",
    display: "Mental status",
    kind: "sign",
    valueType: "single_select",
    section: "acute",
    options: [
      { value: "alert", display: "Alert" },
      { value: "drowsy", display: "Drowsy" },
      { value: "stupor", display: "Stupor" },
      { value: "coma", display: "Coma" },
    ],
  },
  {
    code: "needed_third_party_help",
    display: "Required third-party assistance for a low glucose",
    kind: "history",
    valueType: "boolean",
    section: "acute",
  },

  /* ── kidney ─────────────────────────────────────────────────────────── */
  {
    code: "egfr",
    display: "eGFR",
    kind: "investigation",
    valueType: "number",
    unit: "mL/min/1.73m2",
    requires: "lab.creatinine",
    refRange: { low: 90 },
    section: "kidney",
  },
  {
    code: "urine_acr",
    display: "Urine albumin-to-creatinine ratio",
    kind: "investigation",
    valueType: "number",
    unit: "mg/mmol",
    altUnit: { unit: "mg/g", factor: 8.8402 },
    requires: "lab.urine_acr",
    section: "kidney",
  },
  {
    code: "urine_protein_strip",
    display: "Urine protein reagent strip",
    kind: "investigation",
    valueType: "single_select",
    options: KETONE_STRIP,
    requires: "lab.urine_dipstick",
    section: "kidney",
  },
  {
    code: "kidney_abnormality_3_months",
    display: "Abnormality present for at least 3 months",
    kind: "history",
    valueType: "boolean",
    section: "kidney",
  },

  /* ── foot (all bedside except ABI) ──────────────────────────────────── */
  {
    code: "lops",
    display: "Loss of protective sensation",
    kind: "sign",
    valueType: "single_select",
    section: "foot",
    group: "ft_neuro",
    options: [
      { value: "present", display: "Present" },
      { value: "absent", display: "Absent" },
    ],
    requires: "device.monofilament",
  },
  {
    code: "lops_ipswich",
    display: "Loss of protective sensation (Ipswich touch test)",
    kind: "sign",
    valueType: "single_select",
    section: "foot",
    group: "ft_neuro",
    options: [
      { value: "present", display: "Present" },
      { value: "absent", display: "Absent" },
    ],
  },
  {
    code: "pedal_pulses",
    display: "Pedal pulses",
    kind: "sign",
    valueType: "single_select",
    section: "foot",
    group: "ft_vascular",
    options: [
      { value: "both", display: "Both palpable" },
      { value: "reduced", display: "Reduced" },
      { value: "absent", display: "Absent" },
    ],
  },
  {
    code: "abi",
    display: "Ankle-brachial index",
    kind: "investigation",
    valueType: "number",
    unit: "ratio",
    requires: "device.doppler_abi",
    section: "foot",
    group: "ft_vascular",
  },
  {
    /**
     * DERIVED but clinician-owned. IWGDF foot risk is defined over PAD as a
     * single finding, so it must be one feature rather than a disjunction of
     * pulses and ABI. The form pre-fills this from pedal pulses and ABI; the
     * clinician confirms it, because IWGDF is explicit that no single
     * non-invasive test diagnoses or excludes PAD.
     */
    code: "pad",
    display: "Peripheral artery disease",
    kind: "sign",
    valueType: "single_select",
    section: "foot",
    group: "ft_vascular",
    options: [
      { value: "present", display: "Present" },
      { value: "absent", display: "Absent" },
    ],
  },
  {
    code: "foot_deformity",
    display: "Foot deformity",
    kind: "sign",
    valueType: "boolean",
    section: "foot",
    group: "ft_deformity",
  },
  {
    code: "active_foot_ulcer",
    display: "Active foot ulcer",
    kind: "sign",
    valueType: "boolean",
    section: "foot",
    group: "ft_ulcer",
  },

  /* ── history ────────────────────────────────────────────────────────── */
  {
    code: "prior_foot_ulcer",
    display: "Previous foot ulcer",
    kind: "history",
    valueType: "boolean",
    section: "history",
  },
  {
    code: "prior_amputation",
    display: "Previous lower-extremity amputation",
    kind: "history",
    valueType: "boolean",
    section: "history",
  },
  {
    code: "esrd",
    display: "End-stage renal disease",
    kind: "history",
    valueType: "boolean",
    section: "history",
  },
  {
    code: "ketosis_at_presentation",
    display: "Presented with ketosis",
    kind: "history",
    valueType: "boolean",
    section: "history",
  },
  {
    code: "insulin_withdrawn_later",
    display: "Later did not require insulin",
    kind: "history",
    valueType: "boolean",
    section: "history",
  },

  /* ── classification discriminators ──────────────────────────────────────
   * Declared so the engine can tell "not tested" from "cannot be tested here".
   * Where these are unavailable — the common case globally — classification
   * must return `unclassified` rather than infer a type from phenotype. */
  {
    code: "age_at_onset",
    display: "Age at onset",
    kind: "history",
    valueType: "number",
    unit: "years",
    section: "history",
  },
  {
    code: "c_peptide",
    display: "Fasting C-peptide",
    kind: "investigation",
    valueType: "single_select",
    section: "history",
    requires: "lab.c_peptide",
    options: [
      { value: "low", display: "Low (insulin deficient)" },
      { value: "normal", display: "Normal" },
      { value: "high", display: "High" },
    ],
  },
  {
    code: "islet_autoantibodies",
    display: "Islet autoantibodies",
    kind: "investigation",
    valueType: "single_select",
    section: "history",
    requires: "lab.islet_autoantibodies",
    options: [
      { value: "positive", display: "Positive" },
      { value: "negative", display: "Negative" },
    ],
  },
];
