/**
 * Diabetes symptoms — the classic presentation, with what to characterise about
 * each and which of them cannot wait.
 *
 * ── On the "5 Ps" and "3 Ws" ─────────────────────────────────────────────────
 * They are not built, and the reason is worth recording rather than quietly
 * omitting. The research went looking and found:
 *
 *   3 Ps   sourced — but to a consumer health page, not a guideline
 *   4 Ps   sourced — to a commercial diabetes-app blog
 *   5 Ps   NOT FOUND. Five distinct searches returned no source at all
 *   3 Ws   NOT FOUND. Multiple searches returned no source at all
 *   4 Ts   sourced verbatim to Diabetes UK — real, campaign-backed, national
 *
 * So the symptoms are built and the mnemonic is not. Labelling a group "the
 * 5 Ps" when nobody can say what the five letters stand for would put an
 * unsourced frame around sourced content, which is the one thing this catalog
 * is built to prevent.
 *
 * What DOES carry weight is ADA's own wording: polyuria, polydipsia and
 * unexplained weight loss are the "classic symptoms of hyperglycemia", and that
 * trio is not decoration — it is the symptom requirement that lets a single
 * random glucose >= 11.1 mmol/L diagnose diabetes without a repeat. Those three
 * lead the section, and `diagnosis.ts` already reads them.
 *
 * ── Ordering ─────────────────────────────────────────────────────────────────
 * Classic osmotic, then constitutional, then the infections that should prompt a
 * glucose test, then the features that mean this is an emergency now. Properties
 * appear only once their symptom is present, so the section opens at sixteen
 * rows rather than fifty.
 */
import type { Citation, Feature } from "@/lib/ncd/catalog/schema";

import { ADA_2026_DX } from "@/lib/ncd/catalog/diabetes/sources";

const RETRIEVED = "2026-09-05";
const c = (x: Omit<Citation, "csoSigned" | "retrieved">): Citation => ({
  ...x,
  retrieved: RETRIEVED,
  csoSigned: false,
});

/* ── sources ─────────────────────────────────────────────────────────────── */

const WHO_FACTSHEET = c({
  standard: "WHO",
  version: "WHO diabetes fact sheet",
  title: "Diabetes — WHO fact sheet",
  url: "https://www.who.int/news-room/fact-sheets/detail/diabetes",
});

const IDF_T1 = c({
  standard: "IDF",
  version: "IDF type 1 diabetes symptom list",
  title: "Type 1 diabetes — International Diabetes Federation",
  url: "https://idf.org/about-diabetes/type-1-diabetes/",
});

const IDF_T2 = c({
  standard: "IDF",
  version: "IDF type 2 diabetes symptom list",
  title: "Type 2 diabetes — International Diabetes Federation",
  url: "https://idf.org/about-diabetes/type-2-diabetes/",
});

/** The 4Ts — the one mnemonic in this space with a real, citable source. */
const DIABETES_UK_4TS = c({
  standard: "local",
  version: "Diabetes UK — type 1 symptoms (the 4Ts)",
  title: "Type 1 diabetes symptoms — Diabetes UK",
  url: "https://www.diabetes.org.uk/about-diabetes/type-1-diabetes/symptoms",
  quote: "Toilet, Thirsty, Tired, Thinner",
});

/** The crisis presentation. Same consensus as complications.ts, PMC mirror. */
const CRISES_2024 = c({
  standard: "EASD",
  version: "ADA/EASD/JBDS/AACE/DTS consensus report, 2024",
  title: "Hyperglycemic Crises in Adults With Diabetes: A Consensus Report",
  url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC11272983/",
  quote: "If DKA or HHS is suspected, initial samples should be taken",
});

/**
 * Reasoning that is OURS, not a guideline's.
 *
 * The audit rejected several rationales that read as guideline positions but
 * were not in the cited page — WHO does not distinguish fluctuating from sudden
 * visual loss, Diabetes UK does not say recurrent thrush should prompt a glucose
 * test, IDF does not say a non-healing wound mandates a foot examination at that
 * visit. Each is defensible clinical reasoning and none of it is sourced, so it
 * says so rather than borrowing authority from a page that does not carry it.
 */
const OUR_REASONING = c({
  standard: "local",
  version: "MedSync clinical reasoning",
  title: "Not a guideline position — implementation reasoning, unratified",
  needsCsoInput:
    "Clinically defensible but not stated by the cited sources (audit finding). CSO to ratify or supply a citation.",
});

/* ── shared option sets ──────────────────────────────────────────────────── */

const YES_NO = [
  { value: "yes", display: "Yes" },
  { value: "no", display: "No" },
];

/** A property: nests under its symptom and only appears once it is present. */
const prop = (parent: string, f: Omit<Feature, "section" | "parent" | "kind">): Feature => ({
  ...f,
  kind: "symptom",
  section: "symptoms",
  parent,
});

/**
 * "In a person with, or suspected of having, diabetes."
 *
 * The audit's correction, encoded. The consensus report describes nausea,
 * vomiting and abdominal pain as features COMMON IN DKA — not as emergencies on
 * their own. Vomiting in someone with no hyperglycaemic symptoms and no diabetes
 * is gastroenteritis, and a tool that calls that an emergency teaches people to
 * dismiss the flag that matters.
 */
const IN_DIABETIC_CONTEXT = {
  id: "diabetic_context",
  label: "With osmotic symptoms, or in known diabetes",
  any: [
    { feature: "polyuria", op: "present" as const },
    { feature: "polydipsia", op: "present" as const },
    { feature: "unexplained_weight_loss", op: "present" as const },
    { feature: "dm_status", op: "==" as const, value: "known" },
  ],
  citation: CRISES_2024,
};

/* ── the symptoms ────────────────────────────────────────────────────────── */

export const SYMPTOM_FEATURES: Feature[] = [
  /* ── the classic osmotic trio — ADA's own "classic symptoms" ──────────── */
  {
    /**
     * Not merely suggestive. With a random plasma glucose >= 11.1 mmol/L, the
     * presence of this trio is what removes the need for a confirmatory repeat —
     * so recording it changes the TESTING PATHWAY, not just the impression.
     * `diagnosis.ts` reads these three codes directly.
     */
    code: "polyuria",
    display: "Passing large volumes of urine",
    kind: "symptom",
    valueType: "boolean",
    section: "symptoms",
    citation: ADA_2026_DX,
  },
  prop("polyuria", {
    code: "polyuria_nocturia",
    display: "Waking at night to pass urine",
    valueType: "boolean",
    citation: DIABETES_UK_4TS,
  }),
  prop("polyuria", {
    code: "polyuria_duration",
    display: "For how long",
    valueType: "duration",
    unit: "weeks",
  }),

  {
    code: "polydipsia",
    display: "Excessive thirst",
    kind: "symptom",
    valueType: "boolean",
    section: "symptoms",
    citation: ADA_2026_DX,
  },
  prop("polydipsia", {
    code: "polydipsia_unquenchable",
    display: "Thirst cannot be quenched",
    valueType: "boolean",
    citation: DIABETES_UK_4TS,
  }),
  prop("polydipsia", {
    code: "polydipsia_duration",
    display: "For how long",
    valueType: "duration",
    unit: "weeks",
  }),

  {
    code: "unexplained_weight_loss",
    display: "Unexplained weight loss",
    kind: "symptom",
    valueType: "boolean",
    section: "symptoms",
    citation: ADA_2026_DX,
  },
  prop("unexplained_weight_loss", {
    code: "weight_loss_intent",
    display: "Intended?",
    valueType: "single_select",
    citation: ADA_2026_DX,
    options: [
      { value: "unintentional", display: "Not intended" },
      { value: "intentional", display: "Intended" },
      { value: "unsure", display: "Unsure" },
    ],
  }),
  prop("unexplained_weight_loss", {
    code: "weight_loss_amount_kg",
    display: "How much",
    valueType: "number",
    unit: "kg",
  }),
  prop("unexplained_weight_loss", {
    code: "weight_loss_period",
    display: "Over what period",
    valueType: "duration",
    unit: "months",
  }),

  /* ── constitutional ──────────────────────────────────────────────────── */
  {
    /**
     * Its value is not diagnostic, it is DISCRIMINATING: eating more while
     * losing weight points at diabetes, whereas eating less while losing weight
     * points somewhere else entirely. The property carries that, not the symptom.
     */
    code: "polyphagia",
    display: "Excessive hunger",
    kind: "symptom",
    valueType: "boolean",
    section: "symptoms",
    citation: IDF_T1,
  },
  prop("polyphagia", {
    code: "appetite_with_weight_loss",
    display: "Appetite, alongside the weight change",
    valueType: "single_select",
    citation: IDF_T1,
    options: [
      { value: "increased", display: "Eating more" },
      { value: "unchanged", display: "Unchanged" },
      { value: "decreased", display: "Eating less" },
    ],
  }),

  {
    /**
     * On its own this changes nothing — it is among the least specific symptoms
     * in medicine. It is here because WHO and IDF both list it, and because it
     * is one of the Diabetes UK 4Ts, so its value is combinatorial rather than
     * standalone.
     */
    code: "fatigue",
    display: "Unusual tiredness",
    kind: "symptom",
    valueType: "boolean",
    section: "symptoms",
    citation: WHO_FACTSHEET,
  },
  prop("fatigue", {
    code: "fatigue_onset",
    display: "Onset",
    valueType: "single_select",
    options: [
      { value: "new_weeks", display: "New, over weeks" },
      { value: "months", display: "Over months" },
      { value: "longstanding", display: "Longstanding" },
    ],
  }),

  {
    /**
     * WHO and IDF both list blurred vision, and that is ALL they do — neither
     * distinguishes fluctuating osmotic blurring from sudden loss, and neither
     * addresses referral timing (audit finding). The triage distinction below is
     * our reasoning and is cited as such.
     */
    code: "blurred_vision",
    display: "Blurred vision",
    kind: "symptom",
    valueType: "boolean",
    section: "symptoms",
    citation: WHO_FACTSHEET,
  },
  prop("blurred_vision", {
    code: "vision_pattern",
    display: "Pattern",
    valueType: "single_select",
    citation: OUR_REASONING,
    options: [
      { value: "fluctuating", display: "Fluctuates with glucose" },
      { value: "progressive", display: "Progressive" },
      { value: "sudden_loss", display: "Sudden loss" },
    ],
  }),
  prop("blurred_vision", {
    code: "vision_laterality",
    display: "Which eye",
    valueType: "single_select",
    options: [
      { value: "both", display: "Both" },
      { value: "one", display: "One" },
    ],
  }),

  /* ── infections that should prompt a glucose test ─────────────────────── */
  {
    /**
     * Diabetes UK lists this among the symptoms beyond the 4Ts, and that is what
     * is sourced. That recurrent or treatment-resistant thrush should prompt a
     * glucose rather than another antifungal is OUR inference (audit finding) —
     * defensible, unsourced, and marked as such on the property below.
     */
    code: "genital_itching_or_thrush",
    display: "Genital itching or thrush",
    kind: "symptom",
    valueType: "boolean",
    section: "symptoms",
    citation: DIABETES_UK_4TS,
  },
  prop("genital_itching_or_thrush", {
    code: "thrush_recurrent_or_resistant",
    display: "Recurrent or not responding to treatment",
    valueType: "boolean",
    citation: OUR_REASONING,
  }),

  {
    code: "recurrent_skin_infections",
    display: "Repeated skin infections (boils, abscesses)",
    kind: "symptom",
    valueType: "boolean",
    section: "symptoms",
    citation: IDF_T2,
  },

  {
    /**
     * IDF and Diabetes UK both list the symptom; NEITHER says the feet must be
     * examined at that visit (audit finding). The `suggests` link therefore does
     * what it is designed to do and no more — it raises the priority of foot
     * screening without asserting anything.
     */
    code: "slow_healing_wounds",
    display: "Wounds that heal slowly",
    kind: "symptom",
    valueType: "boolean",
    section: "symptoms",
    suggests: ["diabetic_foot"],
    citation: IDF_T2,
  },
  prop("slow_healing_wounds", {
    code: "wound_site_is_foot",
    display: "On the foot",
    valueType: "boolean",
    citation: IDF_T2,
  }),
  prop("slow_healing_wounds", {
    code: "wound_infection_features",
    display: "Features of infection",
    valueType: "multi_select",
    citation: IDF_T2,
    options: [
      { value: "spreading_redness", display: "Spreading redness" },
      { value: "pus", display: "Pus" },
      { value: "foul_smell", display: "Foul smell" },
      { value: "fever", display: "Fever" },
      { value: "black_tissue", display: "Black tissue" },
      { value: "none", display: "None" },
    ],
  }),

  {
    /**
     * IDF supports the inference that people may go undiagnosed for years before
     * complications appear. It does NOT say the visit must add a foot risk
     * assessment (audit finding), so that stays a prompt rather than an
     * instruction.
     */
    code: "tingling_or_numbness",
    display: "Tingling or numbness in the hands or feet",
    kind: "symptom",
    valueType: "boolean",
    section: "symptoms",
    suggests: ["diabetic_foot"],
    citation: IDF_T2,
  },
  prop("tingling_or_numbness", {
    code: "sensory_distribution",
    display: "Distribution",
    valueType: "single_select",
    citation: IDF_T2,
    options: [
      { value: "feet_only", display: "Feet only" },
      { value: "hands_and_feet", display: "Hands and feet" },
      { value: "one_limb_or_patchy", display: "One limb or patchy" },
    ],
  }),
  prop("tingling_or_numbness", {
    /**
     * Deliberately what the PATIENT reports. Establishing loss of protective
     * sensation is a monofilament examination — a different act, and it lives in
     * the foot section.
     */
    code: "sensory_loss_reported",
    display: "Reduced feeling reported (not an examination)",
    valueType: "boolean",
    citation: OUR_REASONING,
  }),

  /* ── the child presentation ──────────────────────────────────────────── */
  {
    /**
     * The highest-yield and most-missed field in the classic presentation.
     * A previously dry child who starts wetting the bed is the presentation the
     * Diabetes UK 4Ts campaign exists for, because children reach DKA fast and
     * the diagnosis is repeatedly made late.
     */
    code: "bedwetting_new_onset",
    display: "New bedwetting in a previously dry child",
    kind: "symptom",
    valueType: "boolean",
    section: "symptoms",
    suggests: ["dka"],
    citation: IDF_T1,
    dangerSign: {
      severity: "amber",
      action:
        "Test for diabetes today. A child or young person with these symptoms should be assessed the same day — children reach ketoacidosis quickly.",
      citation: DIABETES_UK_4TS,
    },
  },
  prop("bedwetting_new_onset", {
    code: "bedwetting_weeks",
    display: "For how long",
    valueType: "duration",
    unit: "weeks",
  }),

  /* ── the crisis presentation — this is an emergency now ───────────────── */
  {
    code: "vomiting",
    display: "Vomiting",
    kind: "symptom",
    valueType: "boolean",
    section: "symptoms",
    suggests: ["dka"],
    citation: CRISES_2024,
    dangerSign: {
      severity: "red",
      action:
        "Suspect a hyperglycaemic crisis. Take initial samples now — glucose, ketones, electrolytes and blood gas — and assess urgently.",
      when: IN_DIABETIC_CONTEXT,
      citation: CRISES_2024,
    },
  },
  prop("vomiting", {
    code: "vomiting_tolerating_fluids",
    display: "Tolerating oral fluids",
    valueType: "single_select",
    options: YES_NO,
    citation: CRISES_2024,
  }),

  {
    /**
     * Cuts both ways, which is why it is recorded rather than merely flagged:
     * abdominal pain is a common feature of ketoacidosis itself, and the
     * consensus warns it may instead signal the condition that precipitated it.
     */
    code: "abdominal_pain",
    display: "Abdominal pain",
    kind: "symptom",
    valueType: "boolean",
    section: "symptoms",
    suggests: ["dka"],
    citation: CRISES_2024,
    dangerSign: {
      severity: "red",
      action:
        "Suspect a hyperglycaemic crisis and take initial samples now. Also look for a precipitating cause — the consensus warns the pain may be a result of the ketoacidosis OR an indication of what precipitated it.",
      when: IN_DIABETIC_CONTEXT,
      citation: CRISES_2024,
    },
  },
  prop("abdominal_pain", {
    code: "abdominal_pain_localised",
    display: "Localised or generalised",
    valueType: "single_select",
    citation: CRISES_2024,
    options: [
      { value: "generalised", display: "Generalised" },
      { value: "localised", display: "Localised" },
    ],
  }),

  {
    code: "altered_mental_state",
    display: "Drowsiness, confusion or reduced consciousness",
    kind: "sign",
    valueType: "boolean",
    section: "symptoms",
    suggests: ["dka", "hhs", "hypoglycaemia"],
    citation: CRISES_2024,
    dangerSign: {
      severity: "red",
      action:
        "Measure glucose immediately — a reduced conscious level may be hypoglycaemia, ketoacidosis or a hyperosmolar state, and the treatments are opposite.",
      citation: CRISES_2024,
    },
  },
  prop("altered_mental_state", {
    code: "avpu",
    display: "AVPU",
    valueType: "single_select",
    citation: CRISES_2024,
    options: [
      { value: "alert", display: "Alert" },
      { value: "voice", display: "Responds to voice" },
      { value: "pain", display: "Responds to pain" },
      { value: "unresponsive", display: "Unresponsive" },
    ],
  }),

  {
    /**
     * The red rests on the verified basis: the consensus states Kussmaul
     * breathing is the respiratory compensation for the metabolic acidosis of
     * DKA, with acetone on the breath. That it is therefore decisive where
     * ketones cannot be measured is OUR inference, and is not gated on context
     * because deep sighing respiration is not an everyday clinic finding.
     */
    code: "deep_rapid_breathing",
    display: "Deep, sighing rapid breathing (Kussmaul)",
    kind: "sign",
    valueType: "boolean",
    section: "symptoms",
    suggests: ["dka"],
    citation: CRISES_2024,
    dangerSign: {
      severity: "red",
      action:
        "Suspect ketoacidosis and assess urgently — Kussmaul breathing is the respiratory compensation for metabolic acidosis.",
      citation: CRISES_2024,
    },
  },
  prop("deep_rapid_breathing", {
    code: "acetone_breath",
    display: "Acetone smell on the breath",
    valueType: "boolean",
    citation: CRISES_2024,
  }),

  {
    code: "dehydration",
    display: "Signs of dehydration",
    kind: "sign",
    valueType: "boolean",
    section: "symptoms",
    suggests: ["dka", "hhs"],
    citation: CRISES_2024,
  },
  prop("dehydration", {
    code: "dehydration_signs",
    display: "Which signs",
    valueType: "multi_select",
    citation: CRISES_2024,
    options: [
      { value: "dry_mouth", display: "Dry mouth" },
      { value: "sunken_eyes", display: "Sunken eyes" },
      { value: "reduced_skin_turgor", display: "Reduced skin turgor" },
      { value: "low_urine_output", display: "Low urine output" },
    ],
  }),
];
