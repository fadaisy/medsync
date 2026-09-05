/**
 * Symptoms that point at a diabetes complication, and the crisis precipitants.
 *
 * Diabetes very often presents with a complication already established — a
 * person may be undiagnosed for years before anything brings them in — so these
 * are not an afterthought to the classic presentation. They are frequently the
 * whole presentation.
 *
 * ── How this list was cut ────────────────────────────────────────────────────
 * The research proposed 93 rows across four domains. The synthesis collapsed
 * them to 33 symptoms, and 22 of those live here. The dedup was structural, not
 * editorial: four separate proposals for foot ulceration became one field with a
 * `finding` property, three for Charcot became one, and "numbness", "burning
 * feet" and "tingling" became one neuropathic-symptom field with a `quality`
 * property. Asking the same thing four ways is how a form gets routed around.
 *
 * ── Danger signs: eleven rules, and that is the ceiling ──────────────────────
 * The audit rejected three promotions and endorsed several refusals. Notably
 * REFUSED: polyuria and polydipsia individually (the 4Ts urgency is a CLUSTER
 * rule — flagged singly they would fire on a large share of every hot-climate
 * clinic and destroy the list's credibility), dehydration alone, and slow-healing
 * wounds, whose escalation rule is in no retrieved source.
 *
 * Most amber tiers here are WHO HEARTS-D's own "urgent (same day) referral"
 * list, which is the authority for the resource-limited tier and the reason this
 * module can raise a real alarm at a site with no laboratory at all.
 *
 * ── One gap, stated rather than papered over ─────────────────────────────────
 * No retrieved guideline grades sudden visual loss, new floaters or a curtain as
 * an ophthalmic emergency. NICE NG242 returned 403 and the RCOphth PDF 404'd;
 * every supporting claim came from optometry blogs. Floaters therefore ship as
 * an UNFLAGGED option. The vitreous-haemorrhage and retinal-detachment pathway
 * must be sourced before this module goes near a patient.
 */
import type { Citation, Feature } from "@/lib/ncd/catalog/schema";

const RETRIEVED = "2026-09-05";
const c = (x: Omit<Citation, "csoSigned" | "retrieved">): Citation => ({
  ...x,
  retrieved: RETRIEVED,
  csoSigned: false,
});

/* ── sources ─────────────────────────────────────────────────────────────── */

/** ADA Section 12 — retinopathy, neuropathy and foot care. */
const ADA_S12 = c({
  standard: "ADA",
  version: "ADA Standards of Care, Section 12",
  title: "12. Retinopathy, Neuropathy, and Foot Care",
  url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC10725803/",
  quote: "should be referred urgently to a foot care specialist",
});

/** ADA Section 6 — glycaemic goals and hypoglycaemia. */
const ADA_S6 = c({
  standard: "ADA",
  version: "ADA Standards of Care, Section 6",
  title: "6. Glycemic Goals and Hypoglycemia",
  url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC10725808/",
  quote: "Recurrent level 2 hypoglycemia and/or level 3 hypoglycemia is an urgent medical issue",
});

/**
 * WHO HEARTS-D. The best-sourced document in this bundle and the one that makes
 * the module work where there is no laboratory: its urgent-referral list is
 * defined on SYMPTOMS AND SIGNS, not on tests.
 */
const HEARTS_D = c({
  standard: "WHO",
  version: "HEARTS-D, WHO 2020 (WHO/UCN/NCD/20.1)",
  title: "HEARTS D: diagnosis and management of type 2 diabetes",
  url: "https://iris.who.int/server/api/core/bitstreams/2a0b4f68-7155-4ad1-b543-945791e31830/content",
  quote: "Urgent (same day) referral should occur if one of the following is detected",
});

const IWGDF_PRACTICAL = c({
  standard: "IWGDF",
  version: "IWGDF 2023 Practical Guidelines",
  title:
    "IWGDF Practical Guidelines on the prevention and management of diabetes-related foot disease",
  url: "https://iwgdfguidelines.org/wp-content/uploads/2023/07/IWGDF-2023-01-Practical-Guidelines.pdf",
});

const IWGDF_PAD = c({
  standard: "IWGDF",
  version: "IWGDF/ESVS/SVS 2023 PAD Guideline",
  title: "Peripheral artery disease in people with diabetes",
  url: "https://iwgdfguidelines.org/wp-content/uploads/2023/07/IWGDF-2023-05-PAD-Guideline.pdf",
});

const PEN_H = c({
  standard: "WHO",
  version: "IRC / PEN-H toolkit, Table 3.1 (emergency conditions)",
  title: "PEN-H toolkit — emergency conditions needing immediate treatment",
  url: "https://www.rescue.org/sites/default/files/document/5214/penhtoolkit-full.pdf",
  quote: "Treat immediately and refer immediately",
});

/** Reasoning that is ours, not a guideline's. Named so it cannot borrow authority. */
const OUR_REASONING = c({
  standard: "local",
  version: "MedSync clinical reasoning",
  title: "Not a guideline position — implementation reasoning, unratified",
  needsCsoInput: "Clinically defensible but not stated by the cited sources. CSO to ratify.",
});

/* ── helpers ─────────────────────────────────────────────────────────────── */

const SX = "complication_symptoms";

const prop = (
  parent: string,
  f: Omit<Feature, "section" | "parent" | "kind">,
  section: string = SX,
): Feature => ({ ...f, kind: "symptom", section, parent });

/* ── the symptoms ────────────────────────────────────────────────────────── */

export const COMPLICATION_SYMPTOM_FEATURES: Feature[] = [
  /* ── C. Hypoglycaemia — 2 ─────────────────────────────────────────────── */
  {
    /**
     * ADA requires frequency, severity and precipitants at EVERY encounter. This
     * is the field that drives a dose reduction, and it is routinely not asked.
     */
    code: "hypoglycaemia_episode",
    display: "Low blood glucose episodes",
    kind: "symptom",
    valueType: "boolean",
    section: SX,
    suggests: ["hypoglycaemia"],
    citation: ADA_S6,
  },
  prop("hypoglycaemia_episode", {
    code: "hypo_precipitant",
    display: "What brought it on",
    valueType: "multi_select",
    citation: ADA_S6,
    options: [
      { value: "missed_meal", display: "Missed or delayed meal" },
      { value: "exercise", display: "Exercise" },
      { value: "alcohol", display: "Alcohol" },
      { value: "dose_error", display: "Dose error" },
      { value: "overnight", display: "Overnight" },
      { value: "unknown", display: "Not known" },
    ],
  }),
  prop("hypoglycaemia_episode", {
    code: "hypo_episodes_per_month",
    display: "Episodes per month",
    valueType: "number",
    unit: "episodes",
    citation: ADA_S6,
  }),
  {
    /**
     * R2. ADA's own words: recurrent level 2 and/or level 3 hypoglycaemia is
     * "an urgent medical issue". Level 3 is defined by needing another person's
     * help, at any glucose value — which is why it is a symptom and not a number.
     */
    code: "hypoglycaemia_requiring_assistance",
    display: "A low needing another person's help (level 3)",
    kind: "symptom",
    valueType: "boolean",
    section: SX,
    suggests: ["hypoglycaemia"],
    citation: ADA_S6,
    dangerSign: {
      severity: "red",
      action:
        "Treat now, and reduce the insulin or sulfonylurea before the patient leaves. ADA calls recurrent level 2 or any level 3 hypoglycaemia an urgent medical issue.",
      citation: ADA_S6,
    },
  },
  {
    /**
     * Will never be volunteered, and changes the prescription: WHO directs a
     * switch from glibenclamide to gliclazide and a relaxed HbA1c target. Not a
     * danger sign — ADA mandates referral, not same-day action.
     */
    code: "impaired_hypo_awareness",
    display: "No longer feels the warning symptoms of a low",
    kind: "symptom",
    valueType: "boolean",
    section: SX,
    suggests: ["hypoglycaemia"],
    citation: ADA_S6,
  },

  /* ── D. Foot & limb — 8. One exam, one referral pathway. ──────────────── */
  {
    /**
     * Four proposals merged into one field. "Numbness", "burning feet" and
     * "tingling" are the same question asked three ways; the `quality` property
     * carries ADA's own small-fibre versus large-fibre split, which is what
     * actually selects the pathway.
     */
    code: "peripheral_neuropathic_symptoms",
    display: "Burning, tingling, shooting pain or numbness in the feet",
    kind: "symptom",
    valueType: "boolean",
    section: SX,
    suggests: ["diabetic_foot"],
    citation: ADA_S12,
  },
  prop("peripheral_neuropathic_symptoms", {
    code: "neuropathy_quality",
    display: "Quality",
    valueType: "multi_select",
    citation: ADA_S12,
    options: [
      { value: "burning", display: "Burning" },
      { value: "tingling", display: "Tingling" },
      { value: "shooting", display: "Shooting or electric" },
      { value: "numbness", display: "Numbness" },
      { value: "loss_of_feeling", display: "Loss of feeling" },
    ],
  }),
  prop("peripheral_neuropathic_symptoms", {
    code: "neuropathy_distribution",
    display: "Distribution",
    valueType: "single_select",
    citation: ADA_S12,
    options: [
      { value: "feet_only", display: "Feet only" },
      { value: "feet_and_hands", display: "Feet and hands" },
      { value: "one_limb", display: "One limb" },
      { value: "patchy", display: "Patchy or asymmetric" },
    ],
  }),
  prop("peripheral_neuropathic_symptoms", {
    /**
     * Atypical features are the reason this property exists: a length-dependent
     * symmetrical picture is diabetic, and anything else needs another cause
     * looked for rather than being attributed to the diabetes.
     */
    code: "neuropathy_other_causes",
    display: "Other causes to consider",
    valueType: "multi_select",
    citation: ADA_S12,
    options: [
      { value: "alcohol", display: "Alcohol" },
      { value: "b12", display: "B12 deficiency or long-term metformin" },
      { value: "hiv", display: "HIV" },
      { value: "hypothyroidism", display: "Hypothyroidism" },
      { value: "renal", display: "Kidney disease" },
      { value: "none", display: "None identified" },
    ],
  }),
  prop("peripheral_neuropathic_symptoms", {
    code: "neuropathy_worse_at_night",
    display: "Worse at night",
    valueType: "boolean",
    citation: ADA_S12,
  }),

  {
    /** WHO's verbatim glibenclamide contraindication — a concrete prescribing change. */
    code: "unsteadiness_or_falls",
    display: "Unsteady on the feet, or falls",
    kind: "symptom",
    valueType: "boolean",
    section: SX,
    suggests: ["diabetic_foot"],
    citation: HEARTS_D,
  },
  prop("unsteadiness_or_falls", {
    code: "falls_last_year",
    display: "Falls in the last year",
    valueType: "number",
    unit: "falls",
    citation: HEARTS_D,
  }),

  {
    /**
     * A1. ADA's own urgent-referral trigger, verbatim, and the highest-yield
     * question in the foot history. Four proposals merged; the `finding`
     * property carries which of ADA's listed features is present.
     */
    code: "foot_ulcer_or_inflammation",
    display: "Foot ulcer, or unexplained swelling, redness or warmth",
    kind: "symptom",
    valueType: "boolean",
    section: SX,
    suggests: ["diabetic_foot"],
    citation: ADA_S12,
    dangerSign: {
      severity: "amber",
      action:
        "Refer urgently to a foot care specialist or interprofessional foot team. Any open ulceration, or unexplained swelling, erythema or increased skin temperature, meets ADA's referral trigger.",
      citation: ADA_S12,
    },
  },
  prop("foot_ulcer_or_inflammation", {
    code: "foot_finding",
    display: "Which finding",
    valueType: "multi_select",
    citation: ADA_S12,
    options: [
      { value: "open_ulcer", display: "Open ulcer" },
      { value: "swelling", display: "Swelling" },
      { value: "erythema", display: "Redness" },
      { value: "warmth", display: "Increased temperature" },
      { value: "discharge", display: "Discharge" },
    ],
  }),
  prop("foot_ulcer_or_inflammation", {
    code: "foot_probe_to_bone",
    display: "Probes to bone, or bone visible",
    valueType: "boolean",
    citation: IWGDF_PRACTICAL,
  }),

  {
    /**
     * R3. WHO HEARTS-D's urgent list and IWGDF both treat a spreading or
     * gangrenous foot infection as same-day acute referral. Decides admission
     * and the antibiotic route.
     */
    code: "foot_infection_or_gangrene",
    display: "Spreading foot infection, or gangrene",
    kind: "symptom",
    valueType: "boolean",
    section: SX,
    suggests: ["diabetic_foot"],
    citation: HEARTS_D,
    dangerSign: {
      severity: "red",
      action:
        "Refer to acute services the same day. Consider admission and intravenous antibiotics — an infected ulcer with spreading cellulitis or systemic features does not wait.",
      citation: HEARTS_D,
    },
  },
  prop("foot_infection_or_gangrene", {
    code: "foot_systemic_signs",
    display: "Systemic features",
    valueType: "multi_select",
    citation: IWGDF_PRACTICAL,
    options: [
      { value: "fever", display: "Fever" },
      { value: "rigors", display: "Rigors" },
      { value: "tachycardia", display: "Fast pulse" },
      { value: "hypotension", display: "Low blood pressure" },
      { value: "confusion", display: "Confusion" },
      { value: "none", display: "None" },
    ],
  }),
  prop("foot_infection_or_gangrene", {
    code: "gangrene_type",
    display: "Gangrene",
    valueType: "single_select",
    citation: IWGDF_PRACTICAL,
    options: [
      { value: "none", display: "None" },
      { value: "dry", display: "Dry" },
      { value: "wet", display: "Wet or discharging" },
    ],
  }),

  {
    /**
     * A2. The action here is UNIQUE and counter-intuitive, which is exactly why
     * it needs its own field: total non-weight-bearing, not antibiotics. A red,
     * hot, swollen foot WITHOUT an ulcer in a neuropathic patient is Charcot
     * until proven otherwise, and walking on it is what destroys the joint.
     */
    code: "charcot_presentation",
    display: "Red, hot, swollen foot with no ulcer",
    kind: "symptom",
    valueType: "boolean",
    section: SX,
    suggests: ["diabetic_foot"],
    citation: ADA_S12,
    dangerSign: {
      severity: "amber",
      action:
        "Total non-weight-bearing and urgent referral to a foot care specialist, with an X-ray. This is Charcot until proven otherwise — it is not treated with antibiotics.",
      citation: ADA_S12,
    },
  },
  prop("charcot_presentation", {
    code: "charcot_known_neuropathy",
    display: "Known neuropathy",
    valueType: "boolean",
    citation: ADA_S12,
  }),

  {
    /** Moves the WHO review interval from annual to 3–6 monthly. */
    code: "foot_deformity_reported",
    display: "Change in the shape of the foot",
    kind: "symptom",
    valueType: "boolean",
    section: SX,
    suggests: ["diabetic_foot"],
    citation: IWGDF_PRACTICAL,
  },

  {
    /** WHO's pre-ulcerative category — treatable now, before it becomes an ulcer. */
    code: "foot_skin_lesions",
    display: "Fungal infection between the toes, or dry cracked skin",
    kind: "symptom",
    valueType: "boolean",
    section: SX,
    suggests: ["diabetic_foot"],
    citation: IWGDF_PRACTICAL,
  },
  prop("foot_skin_lesions", {
    code: "foot_skin_broken",
    display: "Skin broken or macerated",
    valueType: "boolean",
    citation: IWGDF_PRACTICAL,
  }),

  {
    /**
     * A3. Claudication and rest pain merged — ADA's own sentence covers both,
     * and the `character` property is what escalates. Rest pain is critical limb
     * ischaemia; walking pain relieved by rest is not.
     */
    code: "leg_ischaemic_symptoms",
    display: "Leg or foot pain on walking, or at rest",
    kind: "symptom",
    valueType: "boolean",
    section: SX,
    suggests: ["diabetic_foot"],
    citation: IWGDF_PAD,
    dangerSign: {
      severity: "amber",
      action:
        "Same-day referral, and measure ankle-brachial index with toe pressures. Pain at rest is critical limb ischaemia.",
      when: {
        id: "rest_pain",
        label: "Pain at rest, not only on walking",
        all: [{ feature: "leg_pain_character", op: "==", value: "at_rest" }],
        citation: IWGDF_PAD,
      },
      citation: HEARTS_D,
    },
  },
  prop("leg_ischaemic_symptoms", {
    code: "leg_pain_character",
    display: "When does it hurt",
    valueType: "single_select",
    citation: IWGDF_PAD,
    options: [
      { value: "on_walking", display: "On walking, relieved by rest" },
      { value: "at_rest", display: "At rest, especially at night" },
    ],
  }),

  /* ── E. Autonomic — 4 ─────────────────────────────────────────────────── */
  {
    /** ADA 12.19's first named screening question. Converts to a lying/standing BP. */
    code: "postural_dizziness",
    display: "Dizziness or faintness on standing up",
    kind: "symptom",
    valueType: "boolean",
    section: SX,
    citation: ADA_S12,
  },
  {
    /**
     * Gastroparesis and bowel symptoms merged — ADA treats them as one category.
     * Triggers a DRUG REVIEW rather than a prokinetic: GLP-1 agonists, metformin
     * and opioids all cause this, and stopping the cause beats treating it.
     */
    code: "gi_autonomic_symptoms",
    display: "Feeling full quickly, bloating, or altered bowels",
    kind: "symptom",
    valueType: "boolean",
    section: SX,
    citation: ADA_S12,
  },
  prop("gi_autonomic_symptoms", {
    code: "gi_drug_causes",
    display: "Drugs that could explain it",
    valueType: "multi_select",
    citation: ADA_S12,
    options: [
      { value: "glp1", display: "GLP-1 receptor agonist" },
      { value: "metformin", display: "Metformin" },
      { value: "opioid", display: "Opioid" },
      { value: "none", display: "None" },
    ],
  }),
  {
    /** ADA gives an explicit verbatim action: formal bladder function evaluation. */
    code: "bladder_symptoms",
    display: "Bladder symptoms, or repeated urine infections",
    kind: "symptom",
    valueType: "boolean",
    section: SX,
    citation: ADA_S12,
  },
  prop("bladder_symptoms", {
    code: "bladder_features",
    display: "Which",
    valueType: "multi_select",
    citation: ADA_S12,
    options: [
      { value: "incomplete_emptying", display: "Incomplete emptying" },
      { value: "straining", display: "Straining" },
      { value: "overflow", display: "Overflow incontinence" },
      { value: "recurrent_uti", display: "Recurrent urine infections" },
    ],
  }),
  {
    /**
     * Deliberately propertyless, and deliberately not sex-specific. A named ADA
     * 12.19 question that is never volunteered — one field stops it being asked
     * only of men.
     */
    code: "sexual_dysfunction",
    display: "Sexual difficulties",
    kind: "symptom",
    valueType: "boolean",
    section: SX,
    citation: ADA_S12,
  },

  /* ── F. Eye — 1 ───────────────────────────────────────────────────────── */
  {
    /**
     * A4. One field, and the `pattern` property carries the whole decision:
     * blurring that FLUCTUATES with glucose is reversible lens swelling, while
     * RECENT DETERIORATION is WHO's same-day referral. The danger sign is gated
     * on the property, so ordinary blurring raises nothing.
     *
     * Floaters ship UNFLAGGED — see the file header. No retrieved guideline
     * grades them as an emergency and the pathway must be sourced before use.
     */
    code: "visual_symptoms",
    display: "Vision problems",
    kind: "symptom",
    valueType: "boolean",
    section: SX,
    citation: HEARTS_D,
    dangerSign: {
      severity: "amber",
      action:
        "Same-day referral. WHO HEARTS-D lists recent deterioration of vision among its urgent-referral criteria.",
      when: {
        id: "recent_visual_deterioration",
        label: "Vision has recently deteriorated (not fluctuating blurring)",
        any: [
          { feature: "visual_pattern", op: "==", value: "recent_deterioration" },
          { feature: "visual_pattern", op: "==", value: "sudden_loss" },
        ],
        citation: HEARTS_D,
      },
      citation: HEARTS_D,
    },
  },
  prop("visual_symptoms", {
    code: "visual_pattern",
    display: "Pattern",
    valueType: "single_select",
    citation: HEARTS_D,
    options: [
      { value: "fluctuating", display: "Blurring that comes and goes with glucose" },
      { value: "recent_deterioration", display: "Recently got worse" },
      { value: "sudden_loss", display: "Sudden loss" },
      { value: "floaters", display: "Floaters or flashes" },
    ],
  }),
  prop("visual_symptoms", {
    code: "last_retinal_exam",
    display: "Last retinal examination",
    valueType: "single_select",
    citation: HEARTS_D,
    options: [
      { value: "within_1_year", display: "Within a year" },
      { value: "1_to_2_years", display: "1–2 years" },
      { value: "over_2_years", display: "Over 2 years" },
      { value: "never", display: "Never" },
    ],
  }),

  /* ── G. Vascular & organ emergency — 3 ────────────────────────────────── */
  {
    /**
     * A7, demoted from red by the audit. WHO's literal tier for coronary
     * symptoms is same-day, and PEN-H attaches its emergency tier to acute
     * coronary SYNDROME rather than to undifferentiated chest pain. So the
     * escalation is property-driven.
     */
    code: "chest_pain",
    display: "Chest pain or discomfort",
    kind: "symptom",
    valueType: "boolean",
    section: SX,
    citation: HEARTS_D,
    dangerSign: {
      severity: "amber",
      action:
        "Same-day assessment for coronary disease. Treat as an emergency if the pain is ongoing or at rest — in diabetes the presentation is often atypical.",
      citation: HEARTS_D,
    },
  },
  prop("chest_pain", {
    code: "chest_pain_pattern",
    display: "Pattern",
    valueType: "single_select",
    citation: HEARTS_D,
    options: [
      { value: "on_exertion", display: "On exertion, relieved by rest" },
      { value: "at_rest", display: "At rest or ongoing" },
      { value: "vague", display: "Vague discomfort" },
    ],
  }),
  {
    /**
     * R4. PEN-H's emergency tier, verbatim. The glucose check is not optional
     * housekeeping — hypoglycaemia mimics stroke, and the treatments are opposite.
     */
    code: "focal_neurological_deficit",
    display: "Sudden one-sided weakness, or difficulty speaking",
    kind: "sign",
    valueType: "boolean",
    section: SX,
    citation: PEN_H,
    dangerSign: {
      severity: "red",
      action:
        "Treat immediately and refer immediately. Check the blood glucose before transfer — hypoglycaemia mimics stroke and the treatments are opposite.",
      citation: PEN_H,
    },
  },
  {
    /** A6. The only symptom-detectable, time-critical kidney finding. */
    code: "reduced_urine_output",
    display: "Passing much less urine, or none",
    kind: "symptom",
    valueType: "boolean",
    section: SX,
    suggests: ["diabetic_kidney_disease"],
    citation: HEARTS_D,
    dangerSign: {
      severity: "amber",
      action: "Same-day referral. WHO HEARTS-D lists anuria among its urgent-referral criteria.",
      citation: HEARTS_D,
    },
  },

  /* ── H. Infection at presentation — 1 ─────────────────────────────────── */
  {
    /**
     * The classic route by which undiagnosed type 2 is found. Merged from
     * genital thrush and recurrent boils. NO danger sign, and the rationale that
     * this should prompt a glucose rather than another antifungal is OURS — the
     * audit could not find it in any source, so it is cited as ours.
     */
    code: "recurrent_infections",
    display: "Repeated thrush, boils or skin infections",
    kind: "symptom",
    valueType: "boolean",
    section: SX,
    citation: OUR_REASONING,
  },
  prop("recurrent_infections", {
    code: "infection_resistant_to_treatment",
    display: "Not responding to treatment",
    valueType: "boolean",
    citation: OUR_REASONING,
  }),

  /* ── I. Crisis precipitants — 3 ───────────────────────────────────────── */
  {
    /**
     * Infection precipitates a large share of DKA worldwide. Insulin and fluids
     * alone will not fix it, which is why the precipitant is a field and not a
     * footnote.
     */
    code: "intercurrent_illness",
    display: "Current infection or other illness",
    kind: "history",
    valueType: "boolean",
    section: "precipitants",
    citation: HEARTS_D,
  },
  {
    /**
     * "A major cause of DKA" — and the one precipitant fixed by supply and
     * conversation rather than by medicine, which makes it the highest-value
     * field on this screen in a setting with stock-outs.
     */
    code: "treatment_omission",
    display: "Missed or stopped diabetes treatment",
    kind: "history",
    valueType: "boolean",
    section: "precipitants",
    citation: HEARTS_D,
  },
  {
    /**
     * SGLT2 inhibitors permit ketoacidosis at a NORMAL glucose and must be
     * stopped on admission; steroids predict sustained hyperglycaemia. Both
     * change what happens next in ways the glucose alone will not reveal.
     */
    code: "new_or_changed_drug",
    display: "New or changed medicine recently",
    kind: "history",
    valueType: "boolean",
    section: "precipitants",
    citation: HEARTS_D,
  },
  prop(
    "new_or_changed_drug",
    {
      code: "drug_change_type",
      display: "Which",
      valueType: "multi_select",
      citation: HEARTS_D,
      options: [
        { value: "sglt2_started", display: "SGLT2 inhibitor" },
        { value: "steroid", display: "Steroid" },
        { value: "insulin_changed", display: "Insulin dose changed" },
        { value: "other", display: "Other" },
      ],
    },
    "precipitants",
  ),
];
