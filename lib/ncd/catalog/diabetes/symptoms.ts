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
     * Deliberately propertyless. Its entire value is being RECORDED and being
     * BLOCKED from the diagnostic gate: it is one of the Diabetes UK 4Ts and is
     * listed by WHO and IDF, but it is not one of ADA's three classic symptoms,
     * so it must never help a single random glucose reach a diagnosis.
     */
    code: "fatigue",
    display: "Unusual tiredness",
    kind: "symptom",
    valueType: "boolean",
    section: "symptoms",
    citation: WHO_FACTSHEET,
  },

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
    /**
     * NO independent flag, on the audit's second look. The consensus wording
     * ("further clinical evaluation is necessary if this complaint is not
     * resolved with the resolution of dehydration and metabolic acidosis") is an
     * INPATIENT rule about pain persisting after the crisis is treated — not a
     * clerking flag. It contributes to the crisis picture through the other
     * features rather than raising an alert of its own.
     */
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
