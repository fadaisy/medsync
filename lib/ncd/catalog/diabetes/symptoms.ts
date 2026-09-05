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

/**
 * Slow-healing wounds. Sourced, but NOT to a practice guideline — and the
 * distinction is recorded rather than smoothed over. The 2025 IDF clinical
 * practice recommendations contain no symptom list and no occurrence of the word
 * "wound" at all; this is IDF's public information page. WHO does not list it in
 * the diabetes fact sheet or the PEN training manual, so it is NOT attributed to
 * WHO however often it appears in teaching material.
 */
const IDF_T2_INFO = {
  ...c({
    standard: "IDF",
    version: "IDF — Type 2 diabetes, about-diabetes information page",
    title: "Type 2 diabetes — International Diabetes Federation",
    url: "https://idf.org/about-diabetes/type-2-diabetes/",
    quote: "Slow healing wounds",
  }),
  needsCsoInput:
    "Organisational information page, not a practice guideline. IDF's 2025 clinical practice recommendations carry no symptom list. CSO to ratify.",
};

/** ADA Section 12, current edition — the definition of a foot ulcer by site. */
const ADA_S12_2026 = c({
  standard: "ADA",
  version:
    "Standards of Care in Diabetes—2026, Section 12; Diabetes Care 49(Suppl. 1):S261\u2013S276",
  title: "12. Retinopathy, Neuropathy, and Foot Care",
  url: "https://doi.org/10.2337/dc26-S012",
  quote:
    "DFUs can be defined as a break of the epidermis and at least part of the dermis, below the ankle, in a person with diabetes.",
});

/** IWGDF, for the tempo of a wound that is not closing. */
const IWGDF_PAD_2023 = c({
  standard: "IWGDF",
  version: "IWGDF/ESVS/SVS 2023 PAD Guideline",
  title: "Peripheral artery disease in people with diabetes and a foot ulcer",
  url: "https://iwgdfguidelines.org/wp-content/uploads/2023/07/IWGDF-2023-05-PAD-Guideline.pdf",
  quote:
    "when the wound deteriorates or fails to significantly improve (e.g. a less than 50% reduction in wound area within 4 weeks)",
});

/** IWGDF, for the left-right comparison a known side makes possible. */
const IWGDF_FOOT_SIDE = c({
  standard: "IWGDF",
  version: "IWGDF 2023 Practical Guidelines",
  title:
    "IWGDF Practical Guidelines on the prevention and management of diabetes-related foot disease",
  url: "https://iwgdfguidelines.org/wp-content/uploads/2023/07/IWGDF-2023-01-Practical-Guidelines.pdf",
  quote:
    "In unilateral disease the left-right temperature difference can be calculated at each visit.",
});

/** Reasoning that is ours, not a guideline's. Named so it cannot borrow authority. */
const OUR_REASONING = c({
  standard: "local",
  version: "MedSync clinical reasoning",
  title: "Not a guideline position — implementation reasoning, unratified",
  needsCsoInput: "Clinically defensible but not stated by the cited sources. CSO to ratify.",
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
    group: "classic",
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
    group: "classic",
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
    group: "classic",
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
    group: "classic",
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
    group: "classic",
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
    group: "classic",
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

  /* ── skin, wounds and infection — how undiagnosed type 2 walks in ─────── */
  {
    /**
     * Restored, having been cut in the collapse from 93 proposals to 33.
     *
     * It earns its row by catching a DIFFERENT patient from
     * `foot_ulcer_or_inflammation`: that field is a present-tense examination
     * trigger on the complications screen, i.e. the screen you reach once
     * diabetes is already on the table. This one catches the adult who came in
     * about a sore on the shin and does not yet know they are diabetic — check a
     * glucose at this visit rather than dress it and send them away.
     *
     * NO DANGER SIGN, for the second time. The only escalation rules that exist
     * (ADA's 50%-in-4-weeks and IWGDF PAD BPS 15) are conditioned on the wound
     * having already had appropriate treatment, which a clerking has not given.
     */
    code: "slow_healing_wound",
    display: "A cut, sore or wound that is slow to heal",
    kind: "symptom",
    valueType: "boolean",
    section: "symptoms",
    group: "skin_and_healing",
    citation: IDF_T2_INFO,
  },
  prop("slow_healing_wound", {
    code: "slow_healing_wound_status",
    display: "The wound now",
    valueType: "single_select",
    citation: IDF_T2_INFO,
    options: [
      { value: "still_open", display: "Still open" },
      { value: "healed_slowly", display: "Healed, but took a long time" },
    ],
  }),
  prop("slow_healing_wound", {
    /**
     * The site selects the pathway, and only one of the answers is a diabetes
     * foot problem: ADA defines a foot ulcer as being BELOW THE ANKLE, so a shin
     * wound is a leg-ulcer assessment and a buttock wound is a pressure area.
     */
    code: "slow_healing_wound_site",
    display: "Where",
    valueType: "single_select",
    citation: ADA_S12_2026,
    options: [
      { value: "foot_or_toes", display: "Foot or toes" },
      { value: "lower_leg_or_ankle", display: "Lower leg or ankle" },
      { value: "hand_or_arm", display: "Hand or arm" },
      { value: "trunk_or_pressure_area", display: "Trunk, back, buttock or hip" },
      { value: "several_sites", display: "Several sites" },
      { value: "other", display: "Somewhere else" },
    ],
  }),
  {
    /**
     * "Both" is not a shrug. It removes the contralateral reference that IWGDF's
     * temperature-comparison method depends on, and it argues against the single
     * pressure-point injury a unilateral plantar ulcer usually is.
     */
    code: "slow_healing_wound_foot_side",
    display: "Which foot",
    kind: "symptom",
    valueType: "single_select",
    section: "symptoms",
    parent: "slow_healing_wound_site",
    showWhenAll: [{ feature: "slow_healing_wound_site", op: "==", value: "foot_or_toes" }],
    suggests: ["diabetic_foot"],
    citation: {
      ...IWGDF_FOOT_SIDE,
      needsCsoInput:
        "IWGDF's contralateral-comparison method presumes a known side; that recording the side is therefore required is our inference, not IWGDF's instruction. CSO to ratify.",
    },
    options: [
      { value: "left", display: "Left foot" },
      { value: "right", display: "Right foot" },
      { value: "both", display: "Both feet" },
    ],
  },
  {
    code: "slow_healing_wound_weeks",
    display: "How long it has been open",
    kind: "symptom",
    valueType: "duration",
    unit: "weeks",
    section: "symptoms",
    parent: "slow_healing_wound",
    showWhenAll: [{ feature: "slow_healing_wound_status", op: "==", value: "still_open" }],
    citation: IWGDF_PAD_2023,
  },

  {
    /**
     * Moved here from the complications screen. The question belongs at the
     * front door beside the osmotic symptoms, because repeated thrush and boils
     * are how undiagnosed type 2 presents — not something you look for once the
     * diagnosis is already made.
     *
     * The rationale that this should prompt a glucose rather than another
     * antifungal is OURS. The audit could not find it in any source, so it is
     * cited as ours rather than dressed as a guideline position.
     */
    code: "recurrent_infections",
    display: "Repeated thrush, boils or skin infections",
    kind: "symptom",
    valueType: "boolean",
    section: "symptoms",
    group: "skin_and_healing",
    citation: OUR_REASONING,
  },
  prop("recurrent_infections", {
    code: "infection_resistant_to_treatment",
    display: "Not responding to treatment",
    valueType: "boolean",
    citation: OUR_REASONING,
  }),

  /* ── the crisis presentation — this is an emergency now ───────────────── */
  {
    code: "vomiting",
    display: "Vomiting",
    kind: "symptom",
    valueType: "boolean",
    section: "symptoms",
    group: "crisis",
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
    /**
     * Hours, not days. How long someone has been vomiting is how much fluid they
     * have lost, and it is also the tempo: the consensus describes ketoacidosis
     * developing over hours while a hyperosmolar state builds over days. Both
     * bear on what is set up before transfer.
     */
    code: "vomiting_duration",
    display: "For how long",
    valueType: "duration",
    unit: "hours",
    citation: CRISES_2024,
  }),
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
    group: "crisis",
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
    group: "crisis",
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
    group: "crisis",
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
    group: "crisis",
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

  {
    /** Off-protocol. See the twin field on the complications section. */
    code: "symptoms_other",
    display: "Add a symptom the list does not cover",
    kind: "symptom",
    valueType: "text_list",
    section: "symptoms",
    offProtocol: true,
  },
];
