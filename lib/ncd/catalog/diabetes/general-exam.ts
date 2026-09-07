/**
 * The general examination of a person with diabetes.
 *
 * ── The spine of this list is ADA Table 4.1 ──────────────────────────────────
 * The Standards of Care set out, in one table, what a comprehensive diabetes
 * evaluation examines. Its physical-examination rows are, verbatim:
 *
 *   • Height, weight, and BMI …          → the VITALS segment
 *   • Blood pressure determination        → the VITALS segment
 *   • Orthostatic blood pressure measures (when indicated)   → here
 *   • Fundoscopic examination (refer to eye specialist)      → retinopathy, not built
 *   • Thyroid palpation                                      → here
 *   • Skin examination (e.g., acanthosis nigricans, insulin
 *     injection or insertion sites, and lipodystrophy)       → here
 *   • Comprehensive foot examination … 10-g monofilament     → foot exam, not built
 *   • Visual inspection (skin integrity, callous, deformity
 *     or ulcer, toenails)                                    → foot exam, not built
 *   • Check pedal pulses and screen for PAD with ABI         → foot exam, not built
 *   • Screen for depression, anxiety, diabetes distress …    → psychosocial, not built
 *   • Cognitive / functional performance if indicated        → not built
 *   • Bone health (loss of height and kyphosis)              → not built
 *
 * So three of ADA's rows land here, and the rest are elsewhere or declared and
 * unbuilt. That is the whole reason this segment is not a free-form list of
 * everything a physician was taught to look at: it starts from what the standard
 * actually asks for, and everything ADDED to it is justified separately below.
 *
 * ── What is added, and why ───────────────────────────────────────────────────
 * The general survey proper — appearance, hydration, colour, wasting, nodes,
 * oedema — because ADA's table assumes a physician already doing it and this
 * form has to be the record of it. Diabetes-associated dermatoses, because a
 * third of people with diabetes get one and several of them are the first sign
 * of the disease. Limited joint mobility, because it is free to look for.
 * Ketotic fetor and dehydration, because a crisis is what walks in the door.
 *
 * ── One finding, one home ────────────────────────────────────────────────────
 * Everything a general examination finds is recorded HERE and nowhere else.
 * Four fields moved or shrank to make that true:
 *
 *   • `dehydration` and `dehydration_signs` moved from the crisis symptoms.
 *   • `acetone_breath` moved from being a PROPERTY of Kussmaul breathing to a
 *     finding in its own right — the fetor is smelled on walking up to the bed,
 *     and gating it behind deep sighing respiration meant a patient without
 *     obvious Kussmaul could not have it recorded at all.
 *   • `anaemia_clinical_signs` (conjunctival / palmar / mucosal pallor,
 *     tachycardia, exertional dyspnoea) was DELETED. Pallor is recorded here
 *     with its sites, the pulse is a vital with a band on it, and what remained
 *     was one symptom in an HbA1c-validity sub-field.
 *   • `haemolysis_clinical_signs` lost `jaundice` and `pallor` for the same
 *     reason and kept what is genuinely its own: dark urine, splenomegaly and
 *     known pigment gallstones.
 *
 * The reasoning is unaffected by the moves. `suggests` and every predicate read
 * a FEATURE CODE, never a section, so a dehydration recorded on this tab still
 * points at DKA and HHS exactly as it did on the last one.
 *
 * ── Not here, deliberately ───────────────────────────────────────────────────
 * Conscious level. ACVPU is recorded once, with the crisis symptoms, and a
 * second place to answer it is a second answer to disagree with. Foot lesions,
 * pedal pulses and the monofilament belong to the foot examination; splitting
 * them would give a foot ulcer two homes and no owner.
 */
import type { Citation, Feature } from "@/lib/ncd/catalog/schema";

import { CRISES_2024 } from "@/lib/ncd/catalog/diabetes/symptoms";

const RETRIEVED = "2026-09-07";

/**
 * ADA Table 4.1 — the list this segment is built from. Read from the 2026
 * Standards directly; the physical-examination rows are quoted below as they
 * appear.
 */
export const ADA_S4_EXAM: Citation = {
  standard: "ADA",
  version: "Standards of Care in Diabetes—2026, Section 4, Table 4.1 (p S65)",
  title: "4. Comprehensive Medical Evaluation and Assessment of Comorbidities",
  url: "https://doi.org/10.2337/dc26-S004",
  retrieved: RETRIEVED,
  csoSigned: false,
  quote:
    "Physical examination … Orthostatic blood pressure measures (when indicated) … Thyroid palpation … Skin examination (e.g., acanthosis nigricans, insulin injection or insertion sites, and lipodystrophy)",
};

/** Why the thyroid is palpated at all in a diabetes clinic. */
export const ADA_S4_THYROID: Citation = {
  standard: "ADA",
  version: "Standards of Care in Diabetes—2026, Section 4, rec 4.6 (p S66)",
  title: "4. Comprehensive Medical Evaluation — Autoimmune Diseases",
  url: "https://doi.org/10.2337/dc26-S004",
  retrieved: RETRIEVED,
  csoSigned: false,
  quote:
    "4.6 Screen people with type 1 diabetes for autoimmune thyroid disease soon after diagnosis and thereafter at repeated intervals if clinically indicated. B",
};

/** The mouth, and the reason a dental referral is a diabetes recommendation. */
export const ADA_S4_DENTAL: Citation = {
  standard: "ADA",
  version: "Standards of Care in Diabetes—2026, Section 4, rec 4.15 (p S72)",
  title: "4. Comprehensive Medical Evaluation — Dental Care",
  url: "https://doi.org/10.2337/dc26-S004",
  retrieved: RETRIEVED,
  csoSigned: false,
  quote:
    "4.15 People with diabetes should be referred for a dental exam at least once per year. E … Periodontal disease is more severe, and may be more prevalent, in people with diabetes than in those without and has been associated with higher A1C levels",
};

/**
 * The injection-site examination, and what it is FOR. This is the field that
 * explains a patient whose control is poor on a dose that ought to work.
 */
export const ADA_S9_INJECTION: Citation = {
  standard: "ADA",
  version: "Standards of Care in Diabetes—2026, Section 9 (p S189)",
  title: "9. Pharmacologic Approaches to Glycemic Treatment — Injection Technique",
  url: "https://doi.org/10.2337/dc26-S009",
  retrieved: RETRIEVED,
  csoSigned: false,
  quote:
    "Injection or infusion site rotation is necessary to avoid lipohypertrophy, an accumulation of subcutaneous fat in response to the adipogenic actions of insulin at a site of multiple injections. Lipohypertrophy appears as soft, smooth raised areas several centimeters in breadth and can contribute to erratic insulin absorption, increased glycemic variability, and unexplained hypoglycemic episodes.",
};

/** Two general-examination findings that are signs of autonomic neuropathy. */
export const ADA_S12_AUTONOMIC: Citation = {
  standard: "ADA",
  version: "Standards of Care in Diabetes—2026, Section 12 (p S265)",
  title: "12. Retinopathy, Neuropathy, and Foot Care — Diabetic Autonomic Neuropathy",
  url: "https://doi.org/10.2337/dc26-S012",
  retrieved: RETRIEVED,
  csoSigned: false,
  quote:
    "Signs of autonomic neuropathy include orthostatic hypotension, a resting tachycardia, or evidence of peripheral dryness or cracking of skin.",
};

/**
 * The dermatoses. A narrative review rather than a guideline, and labelled as
 * one — it is the source for the lesion descriptions, not for any threshold.
 */
export const SKIN_REVIEW: Citation = {
  standard: "local",
  version: "Einstein (São Paulo) 2025;23:eRW1193",
  title:
    "Abate MCMDO, Aroucha PMT, da Nóbrega DVM, et al. Cutaneous manifestations of diabetes mellitus: a narrative review",
  url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC11908747/",
  retrieved: RETRIEVED,
  csoSigned: false,
  quote:
    "symmetric, dark, thickened, and velvety plaques that are mostly distributed on the neck, intertriginous areas",
  needsCsoInput:
    "A NARRATIVE REVIEW, not a guideline. It is the source for what these lesions look like and roughly how common they are (dermopathy up to 50%, acanthosis nigricans 19.4%, scleredema 2.5–14%, necrobiosis lipoidica 0.3–1.2%, bullosis diabeticorum ~0.5%). Nothing here drives a verdict; the field records what was seen. CSO to ratify the list.",
};

/** Necrobiosis lipoidica specifically, because it ulcerates. */
export const NL_STATPEARLS: Citation = {
  standard: "local",
  version: "StatPearls, Necrobiosis Lipoidica",
  title: "Necrobiosis Lipoidica — StatPearls, NCBI Bookshelf",
  url: "https://www.ncbi.nlm.nih.gov/books/NBK459318/",
  retrieved: RETRIEVED,
  csoSigned: false,
  quote:
    "This disease is classically associated with diabetes mellitus, typically type 1, and carries a risk of ulceration. … Ulceration occurs in approximately one-third of lesions, typically following minor trauma.",
  needsCsoInput: "A tertiary reference work, not a guideline. CSO to ratify.",
};

/** Limited joint mobility — the prayer sign. */
export const LJM_PAMJ: Citation = {
  standard: "local",
  version: "Pan African Medical Journal 2025;50:106",
  title:
    "Abid N, Siddiqui HN. Limited joint mobility syndrome: a striking clinical sign not to be missed",
  url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC12245635/",
  retrieved: RETRIEVED,
  csoSigned: false,
  quote:
    "Limited joint mobility syndrome (LJMS) of the hands and fingers, also called cheiroarthropathy, is characterized by painless hand and finger stiffness.",
  needsCsoInput:
    "A CASE REPORT. It supports the existence and description of the sign; it does not establish a prevalence in this population, and none is asserted here. CSO to source and ratify.",
};

/**
 * The plain general survey. Taught universally, stated by no retrieved
 * guideline as a set — the same footing as the vital-sign reference ranges.
 */
const CONVENTION: Citation = {
  standard: "local",
  version: "General examination — bedside convention",
  title: "Conventional general-survey findings — not a guideline position",
  retrieved: RETRIEVED,
  csoSigned: false,
  needsCsoInput:
    "The conventional findings of a general examination, taught universally, with no retrieved guideline stating them as a set. Recorded as documentation; none of them drives a verdict here. CSO to ratify.",
};

/**
 * The pitting scale. Conventional, universally used, and genuinely variable at
 * the margins between texts — which is why it ships as ours and says so.
 */
const OEDEMA_GRADE: Citation = {
  standard: "local",
  version: "Pitting oedema — conventional 1+ to 4+ scale",
  title: "Pitting oedema grading — not a guideline position",
  retrieved: RETRIEVED,
  csoSigned: false,
  needsCsoInput:
    "The 1+ to 4+ pitting scale, graded on the depth of the pit after firm pressure over a bony prominence. The DEPTHS (2, 4, 6, 8 mm) are consistent across the sources consulted; the REBOUND TIMES are not — grade 3 is variously given as 10 seconds and as a minute — so the labels carry the depth and describe the rebound only qualitatively. No guideline stating the scale was retrieved. CSO to ratify, or to adopt a site scale.",
};

const EX = "examination";

/**
 * A general-survey finding, filed under the region it is found in.
 *
 * The region is a NESTED group: the segment bar shows "General examination",
 * and inside it the findings band into the order a physician actually works
 * through — end of the bed, colour, hands, head and neck, skin, legs.
 */
const finding = (region: string, f: Omit<Feature, "section" | "kind" | "group">): Feature => ({
  ...f,
  kind: "sign",
  section: EX,
  group: region,
});

/** Characterises the finding above it; only asked once that is present. */
const prop = (parent: string, f: Omit<Feature, "section" | "kind" | "parent">): Feature => ({
  ...f,
  kind: "sign",
  section: EX,
  parent,
});

export const GENERAL_EXAM_FEATURES: Feature[] = [
  /* ── the survey from the end of the bed ──────────────────────────────── */
  finding("gx_survey", {
    /**
     * Three states, not five. The distinction that changes behaviour is "can
     * this wait"; a finer scale invites a judgement the examiner has not made.
     */
    code: "general_appearance",
    display: "General appearance",
    valueType: "single_select",
    citation: CONVENTION,
    options: [
      { value: "well", display: "Well" },
      { value: "unwell_stable", display: "Unwell but stable" },
      { value: "acutely_unwell", display: "Acutely unwell" },
    ],
  }),

  finding("gx_survey", {
    /**
     * MOVED from the crisis symptoms, unchanged in code and in what it
     * suggests — so a dehydration recorded here still points at DKA and HHS.
     * It is a physical sign, elicited by looking and touching, and this is
     * where a clinician now looks for it.
     */
    code: "dehydration",
    display: "Signs of dehydration",
    valueType: "boolean",
    suggests: ["dka", "hhs"],
    citation: CRISES_2024,
  }),
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

  finding("gx_survey", {
    /**
     * PROMOTED from a property of Kussmaul breathing to a finding of its own.
     * The fetor is smelled walking up to the bed, and gating it behind deep
     * sighing respiration meant a patient without obvious Kussmaul had nowhere
     * to record it — which is precisely the patient in whom it matters most.
     *
     * No `suggests` is attached. The consensus describes the fetor ALONGSIDE
     * Kussmaul breathing in ketoacidosis; that it is independently suggestive
     * would be our inference, and the danger-sign list is not the place to add
     * one unsourced.
     */
    code: "acetone_breath",
    display: "Acetone (ketotic) smell on the breath",
    valueType: "boolean",
    citation: CRISES_2024,
  }),

  finding("gx_survey", {
    /**
     * Wasting the BMI cannot see. A person can lose a great deal of muscle and
     * weigh the same, and in new type 1 diabetes and prolonged hyperglycaemia
     * that is exactly what happens. The limb wasting recorded with the
     * neuropathic symptoms is a different finding — focal, and following a
     * nerve.
     */
    code: "nutritional_wasting",
    display: "Visible wasting",
    valueType: "single_select",
    citation: CONVENTION,
    options: [
      { value: "none", display: "None" },
      { value: "mild", display: "Mild" },
      { value: "marked", display: "Marked — temporal or thenar" },
    ],
  }),

  /* ── colour ──────────────────────────────────────────────────────────── */
  finding("gx_colour", {
    /**
     * The only place pallor is now recorded. It used to be three tick-boxes
     * inside the HbA1c anaemia sub-field, which could only be reached by a
     * clinician who had already decided there was an anaemia — the wrong way
     * round. Anaemia is one of the conditions that makes an HbA1c unreliable,
     * and this is the observation that raises the question.
     */
    code: "pallor",
    display: "Pallor",
    valueType: "boolean",
    citation: CONVENTION,
  }),
  prop("pallor", {
    code: "pallor_site",
    display: "Where",
    valueType: "multi_select",
    citation: CONVENTION,
    options: [
      { value: "conjunctival", display: "Conjunctivae" },
      { value: "palmar", display: "Palms" },
      { value: "mucosal", display: "Oral mucosa or tongue" },
      { value: "nail_beds", display: "Nail beds" },
    ],
  }),

  finding("gx_colour", {
    /** Also the only place jaundice is recorded; the haemolysis field lost it. */
    code: "jaundice",
    display: "Jaundice",
    valueType: "boolean",
    citation: CONVENTION,
  }),

  finding("gx_colour", {
    /**
     * Peripheral cyanosis is a perfusion finding, central cyanosis an
     * oxygenation one. Different problems, so one field with three answers
     * rather than a yes/no that loses the distinction.
     */
    code: "cyanosis",
    display: "Cyanosis",
    valueType: "single_select",
    citation: CONVENTION,
    options: [
      { value: "none", display: "None" },
      { value: "peripheral", display: "Peripheral" },
      { value: "central", display: "Central" },
    ],
  }),

  /* ── skin: ADA asks for this one by name ─────────────────────────────── */
  finding("gx_skin", {
    /**
     * Named in ADA Table 4.1. The visible sign of insulin resistance, and one
     * of the few examination findings that says something about the TYPE of
     * diabetes in front of you. Free to look for, routinely not looked for.
     */
    code: "acanthosis_nigricans",
    display: "Acanthosis nigricans",
    valueType: "boolean",
    citation: ADA_S4_EXAM,
  }),
  prop("acanthosis_nigricans", {
    code: "acanthosis_sites",
    display: "Where",
    valueType: "multi_select",
    citation: SKIN_REVIEW,
    options: [
      { value: "posterior_neck", display: "Posterior neck" },
      { value: "axillae", display: "Axillae" },
      { value: "groin", display: "Groin" },
      { value: "knuckles", display: "Knuckles" },
      { value: "under_breasts", display: "Under the breasts" },
    ],
  }),

  finding("gx_skin", {
    /**
     * Asked only of someone on insulin, because on anyone else it is a question
     * about an injection that does not happen.
     *
     * ADA's wording is "lipodystrophy", which covers both directions — the fat
     * that accumulates and the fat that disappears — so the field is named for
     * that and the type is a property.
     */
    code: "lipodystrophy",
    display: "Lipodystrophy at injection or insertion sites",
    valueType: "boolean",
    showWhen: { feature: "glucose_lowering_therapy", op: "==", value: "insulin" },
    citation: ADA_S9_INJECTION,
  }),
  prop("lipodystrophy", {
    code: "lipodystrophy_type",
    display: "Which",
    valueType: "single_select",
    citation: ADA_S9_INJECTION,
    options: [
      { value: "lipohypertrophy", display: "Lipohypertrophy — soft raised swelling" },
      { value: "lipoatrophy", display: "Lipoatrophy — a hollow" },
      { value: "both", display: "Both" },
    ],
  }),
  prop("lipodystrophy", {
    code: "lipodystrophy_sites",
    display: "Which sites",
    valueType: "multi_select",
    citation: ADA_S9_INJECTION,
    options: [
      { value: "abdomen", display: "Abdomen" },
      { value: "thighs", display: "Thighs" },
      { value: "upper_arms", display: "Upper arms" },
      { value: "buttocks", display: "Buttocks" },
      { value: "device_site", display: "Pump or sensor insertion site" },
    ],
  }),

  finding("gx_skin", {
    /**
     * The diabetes-associated dermatoses, as ONE field rather than seven
     * booleans: they are looked for in a single pass over the skin, and seven
     * rows would make a twenty-second examination look like a page of work.
     *
     * Every one of them is a lesion a clinician either sees or does not. The
     * two that carry an action beyond recording are marked in their labels —
     * necrobiosis lipoidica ulcerates in about a third of cases, and eruptive
     * xanthomata mean a triglyceride high enough to threaten the pancreas.
     */
    code: "diabetes_skin_lesions",
    display: "Diabetes-associated skin lesions",
    valueType: "multi_select",
    citation: SKIN_REVIEW,
    options: [
      { value: "dermopathy", display: "Diabetic dermopathy — pigmented pretibial spots" },
      {
        value: "necrobiosis_lipoidica",
        display: "Necrobiosis lipoidica — yellow-brown pretibial plaque, may ulcerate",
      },
      { value: "granuloma_annulare", display: "Granuloma annulare — annular papules" },
      { value: "bullosis", display: "Bullosis diabeticorum — spontaneous blisters" },
      { value: "scleredema", display: "Scleredema — thickened skin over the upper back or neck" },
      {
        value: "eruptive_xanthoma",
        display: "Eruptive xanthomata — yellow papules; suggests severe hypertriglyceridaemia",
      },
      { value: "pruritus", display: "Generalised pruritus" },
    ],
  }),

  finding("gx_skin", {
    /**
     * A precipitant, not an incidental — an abscess is one of the commonest
     * things that tips a controlled diabetes into a crisis.
     *
     * Foot lesions are NOT recorded here. They have their own examination, and
     * splitting them would give a foot ulcer two homes and no owner.
     */
    code: "skin_infection",
    display: "Skin or soft-tissue infection (not the feet)",
    valueType: "boolean",
    citation: SKIN_REVIEW,
  }),
  prop("skin_infection", {
    code: "skin_infection_type",
    display: "What kind",
    valueType: "multi_select",
    citation: SKIN_REVIEW,
    options: [
      { value: "boil_abscess", display: "Boil or abscess" },
      { value: "cellulitis", display: "Cellulitis" },
      { value: "fungal", display: "Fungal — intertrigo or candidal" },
      { value: "necrotising", display: "Rapidly spreading or necrotising" },
    ],
  }),
  prop("skin_infection", {
    code: "skin_infection_site",
    display: "Where",
    valueType: "text",
    citation: CONVENTION,
  }),

  finding("gx_skin", {
    /**
     * ADA lists dry, cracked peripheral skin among the SIGNS of autonomic
     * neuropathy — sudomotor failure, not simply a dry patient. It sits beside
     * the postural drop below for that reason.
     */
    code: "peripheral_dry_skin",
    display: "Dry or cracked skin of the extremities",
    valueType: "boolean",
    citation: ADA_S12_AUTONOMIC,
  }),

  /* ── hands ───────────────────────────────────────────────────────────── */
  finding("gx_hands", {
    /**
     * The prayer sign: the palms will not meet. Costs nothing, needs no
     * equipment, and is one of the few bedside findings that tracks with
     * duration and control.
     */
    code: "limited_joint_mobility",
    display: "Limited joint mobility — prayer sign",
    valueType: "boolean",
    citation: LJM_PAMJ,
  }),

  /* ── head and neck ───────────────────────────────────────────────────── */
  finding("gx_head_neck", {
    /**
     * "Thyroid palpation" is its own row in ADA Table 4.1, and the reason is
     * rec 4.6: autoimmune thyroid disease is the commonest autoimmune disorder
     * accompanying type 1 diabetes. The neck is felt at every annual review.
     */
    code: "goitre",
    display: "Goitre or thyroid nodule",
    valueType: "boolean",
    citation: ADA_S4_EXAM,
  }),
  prop("goitre", {
    code: "goitre_character",
    display: "Character",
    valueType: "single_select",
    citation: ADA_S4_THYROID,
    options: [
      { value: "diffuse", display: "Diffusely enlarged" },
      { value: "multinodular", display: "Multinodular" },
      { value: "single_nodule", display: "Single nodule" },
      { value: "tender", display: "Tender" },
    ],
  }),

  finding("gx_head_neck", {
    /**
     * ADA recommends a dental referral at least annually and records the last
     * dental visit in Table 4.1, because periodontal disease is worse in
     * diabetes and tracks with the A1C. It is also where a precipitating sepsis
     * hides in plain sight.
     */
    code: "oral_findings",
    display: "Mouth",
    valueType: "multi_select",
    citation: ADA_S4_DENTAL,
    options: [
      { value: "candidiasis", display: "Oral candidiasis (thrush)" },
      { value: "angular_cheilitis", display: "Angular cheilitis" },
      { value: "periodontal", display: "Gingivitis or periodontal disease" },
      { value: "dental_abscess", display: "Dental abscess" },
      { value: "missing_loose_teeth", display: "Missing or loose teeth" },
    ],
  }),

  finding("gx_head_neck", {
    code: "lymphadenopathy",
    display: "Lymphadenopathy",
    valueType: "boolean",
    citation: CONVENTION,
  }),
  prop("lymphadenopathy", {
    code: "lymphadenopathy_sites",
    display: "Which groups",
    valueType: "multi_select",
    citation: CONVENTION,
    options: [
      { value: "cervical", display: "Cervical" },
      { value: "axillary", display: "Axillary" },
      { value: "inguinal", display: "Inguinal" },
      { value: "generalised", display: "Generalised" },
    ],
  }),

  /* ── fluid and the autonomic nervous system ──────────────────────────── */
  finding("gx_legs", {
    /**
     * In a diabetic clinic this is a question about the kidneys and the heart
     * before it is anything else, so how far up matters as much as whether it
     * is there — ankle oedema and oedema to the sacrum are not one finding.
     */
    code: "peripheral_oedema",
    display: "Peripheral oedema",
    valueType: "boolean",
    citation: CONVENTION,
  }),
  prop("peripheral_oedema", {
    /**
     * The grade, not the height.
     *
     * ONE field, not a pitting yes/no beside a grade: the two could contradict
     * each other, and "non-pitting, grade 3" is not a finding. Non-pitting is
     * the first answer on the same scale because it is a different disease —
     * lymphoedema and myxoedema, not fluid overload — and a form that only
     * offers grades quietly turns every swollen leg into a cardiac one.
     *
     * Depths are consistent across texts; rebound times are NOT — the sources
     * consulted put grade 3 anywhere between 10 seconds and a minute. The
     * labels carry the depth, which is what the thumb actually measures, and
     * the citation says the times vary.
     */
    code: "oedema_grade",
    display: "Grade",
    valueType: "single_select",
    citation: OEDEMA_GRADE,
    options: [
      { value: "non_pitting", display: "Non-pitting" },
      { value: "grade_1", display: "1+ — about 2 mm, rebounds at once" },
      { value: "grade_2", display: "2+ — about 4 mm, rebounds in seconds" },
      { value: "grade_3", display: "3+ — about 6 mm, a pit that lingers" },
      { value: "grade_4", display: "4+ — about 8 mm, a pit lasting minutes" },
    ],
  }),

  finding("gx_legs", {
    /**
     * ADA Table 4.1 asks for orthostatic blood pressure "when indicated", and
     * Section 12 names orthostatic hypotension a sign of autonomic neuropathy.
     *
     * The numbers in the label are the standard consensus definition and are
     * NOT from either of those passages — see `needsCsoInput`. They are in the
     * label rather than in a rule precisely because nothing here computes on
     * them: the clinician does the measurement and answers the question.
     */
    code: "postural_hypotension",
    display:
      "Postural hypotension — systolic falls ≥20 or diastolic ≥10 mmHg within 3 min standing",
    valueType: "boolean",
    citation: {
      ...ADA_S12_AUTONOMIC,
      needsCsoInput:
        "ADA names orthostatic hypotension a sign of autonomic neuropathy and asks for orthostatic measures when indicated, but the ≥20/≥10 mmHg within-3-minutes definition in this label is the consensus one and was NOT retrieved for this build. CSO to source and ratify the numbers, or to remove them from the label.",
    },
  }),

  {
    /** Off-protocol. Recorded, never reasoned over. */
    code: "general_exam_other",
    display: "Add a general-examination finding the list does not cover",
    kind: "sign",
    valueType: "text_list",
    section: EX,
    group: "gx_survey",
    offProtocol: true,
  },
];
