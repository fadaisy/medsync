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

import { ADA_2026_PHARM, THERAPY_CLASSES } from "@/lib/ncd/catalog/diabetes/features";
import { socratesProps } from "@/lib/ncd/catalog/diabetes/socrates";

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

/**
 * ADA Section 12, CURRENT edition. A separate constant from `ADA_S12` on
 * purpose: the audit checked the 2024 PMC mirror above and the atypical-features
 * parenthetical is simply not in it — the 2024 sentence is the short form. Every
 * neuropathy field below turns on that parenthetical, so pointing them at the
 * older document would have attributed words to ADA it did not write there.
 */
const ADA_S12_2026 = c({
  standard: "ADA",
  version:
    "Standards of Care in Diabetes\u20142026, Section 12; Diabetes Care 49(Suppl. 1):S261\u2013S276",
  title: "12. Retinopathy, Neuropathy, and Foot Care",
  url: "https://doi.org/10.2337/dc26-S012",
  quote:
    "Electrophysiological testing, magnetic resonance imaging (MRI) scan of the spine, or referral to a neurologist is rarely needed, except in situations where the clinical features are atypical (acute or subacute presentation, non\u2013length dependent, asymmetric, and/or motor involvement) or the diagnosis is unclear.",
});

/** ADA's 2017 neuropathy position statement — the named focal syndromes. */
const ADA_NEURO_2017 = c({
  standard: "ADA",
  version:
    "Diabetic Neuropathy: A Position Statement by the ADA. Diabetes Care 2017;40:136\u2013154",
  title: "Diabetic Neuropathy — ADA position statement",
  url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC6977405/",
  quote:
    "People with the condition routinely present with extreme unilateral thigh pain and weight loss, followed by motor weakness.",
});

/**
 * NICE NG17, recommendation 1.14.7. VERIFIED DIRECTLY against nice.org.uk, which
 * matters: this closes the gap the previous round left open, where no retrieved
 * guideline graded sudden visual loss as an emergency and floaters therefore
 * shipped unflagged. NG28 carries the same recommendation for type 2 at 1.43.3,
 * but that page would not serve to us, so only NG17 is claimed here.
 */
const NICE_NG17_EYE = c({
  standard: "local",
  version: "NICE NG17, Type 1 diabetes in adults, rec 1.14.7 [2004, amended 2015]",
  title: "Type 1 diabetes in adults: diagnosis and management — NICE",
  url: "https://www.nice.org.uk/guidance/ng17/chapter/Recommendations",
  quote:
    "Arrange emergency review by an ophthalmologist for: sudden loss of vision rubeosis iridis pre-retinal or vitreous haemorrhage retinal detachment.",
});

/** NICE NG128, rec 1.1.5. Verified directly against nice.org.uk. */
const NICE_NG128_TIA = c({
  standard: "local",
  version: "NICE NG128, Stroke and transient ischaemic attack in over 16s, rec 1.1.5 [2019]",
  title: "Stroke and transient ischaemic attack in over 16s — NICE",
  url: "https://www.nice.org.uk/guidance/ng128/chapter/Recommendations",
  quote:
    "Refer immediately people who have had a suspected TIA for specialist assessment and investigation, to be seen within 24 hours of onset of symptoms.",
});

/** AAO Preferred Practice Patterns. Retrieved by the research pass, not re-verified here. */
const AAO_PVD = {
  ...c({
    standard: "local",
    version:
      "AAO Posterior Vitreous Detachment, Retinal Breaks, and Lattice Degeneration PPP, 2024",
    title: "Posterior Vitreous Detachment, Retinal Breaks, and Lattice Degeneration — AAO",
    url: "https://www.aao.org/education/preferred-practice-pattern/posterior-vitreous-detachment-retinal-breaks-latti",
    quote:
      "It is essential that clinical personnel be familiar with the symptoms of PVD and RRD and that they recognize the need for urgent ophthalmologic evaluation of symptomatic patients.",
  }),
  needsCsoInput:
    "Quote retrieved by an automated research pass and not independently re-verified. CSO to confirm before this flag goes live.",
};

const AAO_RAO = {
  ...c({
    standard: "local",
    version: "AAO Retinal and Ophthalmic Artery Occlusions PPP, 2024",
    title: "Retinal and Ophthalmic Artery Occlusions — AAO",
    url: "https://www.aao.org/education/preferred-practice-pattern/retinal-ophthalmic-artery-occlusions-ppp",
    quote:
      "Patients presenting with a CRAO typically describe a sudden, painless decrease in the visual acuity and field of vision in one eye that occurs over a period of seconds.",
  }),
  needsCsoInput:
    "Quote retrieved by an automated research pass and not independently re-verified. CSO to confirm.",
};

/** WHO's leprosy cardinal signs — a common and treatable local cause. */
const WHO_LEPROSY = c({
  standard: "WHO",
  version: "WHO leprosy fact sheet",
  title: "Leprosy (Hansen's disease) — WHO fact sheet",
  url: "https://www.who.int/news-room/fact-sheets/detail/leprosy",
  quote:
    "thickened or enlarged peripheral nerve, with loss of sensation and/or weakness of the muscles supplied by that nerve",
});

/* ── helpers ─────────────────────────────────────────────────────────────── */

const SX = "symptoms";

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
    group: "hypoglycaemia",
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
    group: "hypoglycaemia",
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
    group: "hypoglycaemia",
    suggests: ["hypoglycaemia"],
    citation: ADA_S6,
  },

  /* ── D. Foot & limb — one screen, then one exam and one referral ──────── */
  {
    /**
     * The device that lets the complication symptoms live in the symptoms
     * section without turning it into a scroll: nine foot questions collapse to
     * one until there is something to ask about.
     *
     * It is a real feature rather than a UI toggle, and that distinction is the
     * whole safety argument. The gate is evaluated by the same evaluator as
     * every clinical rule, so there is no second disclosure mechanism that could
     * hide a row the engine believes is askable — and a NO is RECORDED, which is
     * strictly more honest than the nine blank rows it replaces.
     *
     * The asymptomatic-ulcer trap is real and is handled elsewhere by design:
     * neuropathy means an ulcer can be painless and unreported, which is exactly
     * why IWGDF requires the foot to be EXAMINED regardless of symptoms. That
     * examination is the `foot` section, and it is not gated on this or anything
     * else. This gates what the patient reports, never what the clinician looks at.
     */
    code: "foot_symptom_screen",
    display: "Any trouble with the feet or legs",
    kind: "symptom",
    valueType: "boolean",
    section: SX,
    group: "feet_and_legs",
    suggests: ["diabetic_foot"],
    citation: {
      ...HEARTS_D,
      quote:
        "sensory loss, unsteadiness, sensory symptoms (pain, unpleasant sensation of burning, tingling or numbness)",
      needsCsoInput:
        "HEARTS-D lists these symptoms; compounding them into one screening question is ours. The wording must stay broad enough that no foot problem is answerable as 'no'. CSO to ratify.",
    },
  },
  {
    /**
     * Four proposals merged into one field. "Numbness", "burning feet" and
     * "tingling" are the same question asked three ways; the `quality` property
     * carries ADA's own small-fibre versus large-fibre split, which is what
     * actually selects the pathway.
     */
    code: "peripheral_neuropathic_symptoms",
    display: "Burning, tingling, shooting pain or numbness in the feet, hands or limbs",
    kind: "symptom",
    valueType: "boolean",
    section: SX,
    group: "feet_and_legs",
    showWhen: { feature: "foot_symptom_screen", op: "present" },
    /**
     * `suggests` is RETAINED deliberately, not by oversight. The audit noted it
     * points at the foot even for an arm or thigh presentation. That is accepted:
     * it writes a prompt to complete foot screening, which IWGDF requires
     * annually in everyone with diabetes regardless of where the symptoms are,
     * and a missed foot examination costs more than a redundant prompt.
     */
    suggests: ["diabetic_foot"],
    citation: ADA_S12,
  },
  prop("peripheral_neuropathic_symptoms", {
    /**
     * Separate from `neuropathy_onset`, which records HOW it began. This is how
     * long it has run — the two together are what distinguish a length-dependent
     * picture that crept in over years from an atypical one that arrived over
     * weeks and needs another cause looked for.
     */
    code: "neuropathy_duration",
    display: "Duration",
    valueType: "duration",
    unit: "months",
  }),
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
      { value: "hands_first", display: "Hands before the feet, or hands only" },
      { value: "one_limb", display: "One limb" },
      { value: "patchy", display: "Patchy or asymmetric" },
    ],
  }),
  {
    /**
     * Documentation, and it says so. Left versus right changes no guideline
     * pathway — the pathway turns on SYMMETRIC versus ASYMMETRIC, which
     * `neuropathy_distribution` already records. What the side buys is a named
     * nerve territory to examine: one leg is common peroneal, one arm is median
     * and ulnar, and an entrapment found there is a surgical referral rather
     * than foot care.
     */
    code: "neuropathy_limb",
    display: "Which limb",
    kind: "symptom",
    valueType: "single_select",
    section: SX,
    parent: "neuropathy_distribution",
    showWhenAll: [{ feature: "neuropathy_distribution", op: "==", value: "one_limb" }],
    citation: {
      ...ADA_NEURO_2017,
      quote:
        "can occur as a result of involvement of the median, ulnar, radial, and common peroneal nerves",
      needsCsoInput:
        "ADA names the nerves; that the side should therefore be recorded is ours. No retrieved guideline conditions any action on left versus right. CSO to ratify.",
    },
    options: [
      { value: "right_leg", display: "Right leg or foot" },
      { value: "left_leg", display: "Left leg or foot" },
      { value: "right_arm", display: "Right arm or hand" },
      { value: "left_arm", display: "Left arm or hand" },
    ],
  },
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
      { value: "leprosy", display: "Leprosy (numb pale patch, or a thickened nerve)" },
      { value: "hypothyroidism", display: "Hypothyroidism" },
      { value: "renal", display: "Kidney disease" },
      { value: "none", display: "None identified" },
    ],
  }),
  {
    /**
     * Leprosy is on the other-causes list because it is common here, treatable,
     * and routinely mistaken for diabetic neuropathy — but ADA does not name it,
     * so the claim is carried HERE rather than borrowing ADA's authority through
     * the option list above.
     *
     * What it buys is a two-second examination nobody otherwise does: palpate the
     * ulnar and common peroneal nerves, and look for a pale anaesthetic patch. A
     * hit changes the diagnosis, the drug, the follow-up and the contact tracing.
     */
    code: "leprosy_cardinal_sign",
    display: "Thickened nerve, or a pale numb skin patch",
    kind: "sign",
    valueType: "single_select",
    section: SX,
    parent: "neuropathy_other_causes",
    showWhenAll: [{ feature: "neuropathy_other_causes", op: "==", value: "leprosy" }],
    citation: {
      ...WHO_LEPROSY,
      needsCsoInput:
        "WHO's cardinal signs are quoted exactly; that leprosy belongs on a diabetes neuropathy differential is ours, not ADA's. CSO to ratify.",
    },
    options: [
      { value: "thickened_nerve", display: "Thickened or enlarged nerve" },
      { value: "anaesthetic_patch", display: "Pale or reddish numb patch" },
      { value: "both", display: "Both" },
      { value: "neither", display: "Neither" },
    ],
  },
  prop("peripheral_neuropathic_symptoms", {
    code: "neuropathy_worse_at_night",
    display: "Worse at night",
    valueType: "boolean",
    citation: ADA_S12,
  }),
  prop("peripheral_neuropathic_symptoms", {
    /**
     * One of ADA's four atypical features, and the one that most often closes a
     * review too early: burning feet get attributed to the diabetes and the
     * weakness beside them is never recorded. NO DANGER SIGN — ADA's instruction
     * is a referral with no urgency word, no time frame and no same-day
     * language, and the genuinely time-critical version of this presentation is
     * already red under `focal_neurological_deficit`.
     */
    code: "neuropathy_motor_involvement",
    display: "Weakness or muscle wasting in the affected limb",
    valueType: "boolean",
    citation: ADA_S12_2026,
  }),
  prop("peripheral_neuropathic_symptoms", {
    /**
     * Acute or subacute onset is on ADA's atypical list. It is also the hook a
     * later pass needs for treatment-induced neuropathy — pain appearing after an
     * abrupt improvement in control, which is iatrogenic and must not be read as
     * the diabetes worsening.
     */
    code: "neuropathy_onset",
    display: "How it came on",
    valueType: "single_select",
    citation: ADA_S12_2026,
    options: [
      { value: "gradual", display: "Gradually, over months or years" },
      { value: "subacute", display: "Over weeks" },
      { value: "acute", display: "Over days" },
    ],
  }),
  {
    /**
     * Unilateral proximal thigh pain, weakness and the already-recorded
     * `unexplained_weight_loss` together are ADA's own description of diabetic
     * radiculoplexus neuropathy — and each of the three is otherwise read as
     * something else, the weight loss most damagingly as a reason to escalate
     * glucose-lowering therapy. Gated on the DISTRIBUTION rather than the side,
     * because the side is documentation and the asymmetry is the finding.
     */
    code: "neuropathy_proximal_leg_pain",
    display: "Pain in the thigh or buttock, rather than the foot",
    kind: "symptom",
    valueType: "boolean",
    section: SX,
    parent: "peripheral_neuropathic_symptoms",
    showWhenAll: [{ feature: "neuropathy_distribution", op: "in", value: ["one_limb", "patchy"] }],
    citation: ADA_NEURO_2017,
  },

  {
    /** WHO's verbatim glibenclamide contraindication — a concrete prescribing change. */
    code: "unsteadiness_or_falls",
    display: "Unsteady on the feet, or falls",
    kind: "symptom",
    valueType: "boolean",
    section: SX,
    group: "feet_and_legs",
    showWhen: { feature: "foot_symptom_screen", op: "present" },
    suggests: ["diabetic_foot"],
    citation: HEARTS_D,
  },
  prop("unsteadiness_or_falls", {
    code: "unsteadiness_duration",
    display: "Duration",
    valueType: "duration",
    unit: "months",
  }),
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
    group: "feet_and_legs",
    showWhen: { feature: "foot_symptom_screen", op: "present" },
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
    /**
     * A side per LESION, not one for the whole patient. An ulcer on the left
     * with a Charcot foot on the right is an ordinary presentation, and a single
     * shared "which foot" could not say it. Offloading, dressing and the
     * referral all attach to one limb, and the next review compares that foot
     * with the other — so "both" is not a shrug: it says the contralateral shoe
     * lift is not the plan and the left-right temperature comparison is unusable.
     */
    code: "foot_ulcer_side",
    display: "Which foot",
    valueType: "single_select",
    citation: {
      ...IWGDF_PRACTICAL,
      quote:
        "consider also using a shoe lift on the contralateral limb to improve the person\u2019s comfort and balance while walking in the device",
      needsCsoInput:
        "IWGDF's offloading and left-right temperature comparison both presume a known side; that recording it is therefore required is our inference. CSO to ratify.",
    },
    options: [
      { value: "left", display: "Left" },
      { value: "right", display: "Right" },
      { value: "both", display: "Both" },
    ],
  }),
  prop("foot_ulcer_or_inflammation", {
    /**
     * The one duration in this band a published rule turns on: a properly
     * treated ulcer should have halved in area by four weeks, so a wound already
     * open that long has spent the whole window and needs vascular assessment at
     * this visit rather than at a review appointment.
     */
    code: "foot_ulcer_duration",
    display: "Duration",
    valueType: "duration",
    unit: "weeks",
    citation: {
      ...IWGDF_PAD,
      quote:
        "when the wound deteriorates or fails to significantly improve (e.g. a less than 50% reduction in wound area within 4 weeks)",
    },
  }),
  prop("foot_ulcer_or_inflammation", {
    code: "foot_probe_to_bone",
    display: "Probes to bone, or bone visible",
    valueType: "boolean",
    citation: IWGDF_PRACTICAL,
  }),
  prop("foot_ulcer_or_inflammation", {
    /**
     * SINBAD's "Site", which is what a district clinic's referral letter and
     * outcome audit are built on when there is no Doppler. With the surface it
     * also picks the offloading: a plantar forefoot or midfoot ulcer gets a
     * non-removable knee-high device, and a heel ulcer is a separate and weaker
     * recommendation.
     */
    code: "foot_ulcer_region",
    display: "Where on the foot",
    valueType: "single_select",
    showWhenAll: [{ feature: "foot_finding", op: "==", value: "open_ulcer" }],
    citation: {
      ...IWGDF_PRACTICAL,
      quote:
        "\u2018Site\u2019: Describe where the ulcer is located on the foot. This includes description of forefoot, midfoot or hindfoot",
    },
    options: [
      { value: "toe", display: "Toe" },
      { value: "forefoot", display: "Forefoot (ball of the foot)" },
      { value: "midfoot", display: "Midfoot (arch)" },
      { value: "hindfoot", display: "Hindfoot (heel)" },
    ],
  }),
  prop("foot_ulcer_or_inflammation", {
    /**
     * Not decoration on the region: casting a dorsal ulcer is the wrong
     * treatment, and the region alone does not say which you are looking at.
     */
    code: "foot_ulcer_surface",
    display: "Which surface",
    valueType: "single_select",
    showWhenAll: [{ feature: "foot_finding", op: "==", value: "open_ulcer" }],
    citation: {
      ...IWGDF_PRACTICAL,
      quote:
        "it is also suggested to differentiate between plantar, interdigital, medial, lateral or dorsal",
    },
    options: [
      { value: "plantar", display: "Sole (plantar)" },
      { value: "dorsal", display: "Top of the foot (dorsal)" },
      { value: "interdigital", display: "Between the toes" },
      { value: "medial", display: "Inner border" },
      { value: "lateral", display: "Outer border" },
    ],
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
    group: "feet_and_legs",
    showWhen: { feature: "foot_symptom_screen", op: "present" },
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
    code: "foot_infection_side",
    display: "Which foot",
    valueType: "single_select",
    citation: {
      ...IWGDF_PRACTICAL,
      quote:
        "consider also using a shoe lift on the contralateral limb to improve the person\u2019s comfort and balance while walking in the device",
      needsCsoInput:
        "IWGDF's offloading and left-right temperature comparison both presume a known side; that recording it is therefore required is our inference. CSO to ratify.",
    },
    options: [
      { value: "left", display: "Left" },
      { value: "right", display: "Right" },
      { value: "both", display: "Both" },
    ],
  }),
  prop("foot_infection_or_gangrene", {
    /** Days, not weeks — how fast this is spreading is what decides admission. */
    code: "foot_infection_duration",
    display: "Duration",
    valueType: "duration",
    unit: "days",
  }),
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
    group: "feet_and_legs",
    showWhen: { feature: "foot_symptom_screen", op: "present" },
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
    code: "charcot_side",
    display: "Which foot",
    valueType: "single_select",
    citation: {
      ...IWGDF_PRACTICAL,
      quote:
        "consider also using a shoe lift on the contralateral limb to improve the person\u2019s comfort and balance while walking in the device",
      needsCsoInput:
        "IWGDF's offloading and left-right temperature comparison both presume a known side; that recording it is therefore required is our inference. CSO to ratify.",
    },
    options: [
      { value: "left", display: "Left" },
      { value: "right", display: "Right" },
      { value: "both", display: "Both" },
    ],
  }),
  prop("charcot_presentation", {
    /** Acute Charcot runs in weeks, and every week walking on it costs joint. */
    code: "charcot_duration",
    display: "Duration",
    valueType: "duration",
    unit: "weeks",
  }),
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
    group: "feet_and_legs",
    showWhen: { feature: "foot_symptom_screen", op: "present" },
    suggests: ["diabetic_foot"],
    citation: IWGDF_PRACTICAL,
  },
  prop("foot_deformity_reported", {
    code: "foot_deformity_duration",
    display: "Duration",
    valueType: "duration",
    unit: "months",
  }),

  {
    /** WHO's pre-ulcerative category — treatable now, before it becomes an ulcer. */
    code: "foot_skin_lesions",
    display: "Fungal infection between the toes, or dry cracked skin",
    kind: "symptom",
    valueType: "boolean",
    section: SX,
    group: "feet_and_legs",
    showWhen: { feature: "foot_symptom_screen", op: "present" },
    suggests: ["diabetic_foot"],
    citation: IWGDF_PRACTICAL,
  },
  prop("foot_skin_lesions", {
    code: "foot_skin_lesions_duration",
    display: "Duration",
    valueType: "duration",
    unit: "weeks",
  }),
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
    group: "feet_and_legs",
    showWhen: { feature: "foot_symptom_screen", op: "present" },
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
    code: "leg_ischaemic_duration",
    display: "Duration",
    valueType: "duration",
    unit: "months",
  }),
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

  /* ── E. Autonomic — one screen, then the four named questions ─────────── */
  {
    /**
     * ADA 12.19 names these four enquiries and they are never volunteered — a
     * patient does not raise erectile difficulty or overflow incontinence
     * unprompted. Asking them behind one screen keeps them ASKED rather than
     * skipped, which is the failure this replaces: four rows at the bottom of a
     * long section are four rows nobody reaches.
     */
    code: "autonomic_symptom_screen",
    display: "Dizziness on standing, gut, bladder or sexual problems",
    kind: "symptom",
    valueType: "boolean",
    section: SX,
    group: "autonomic",
    citation: {
      ...ADA_S12,
      needsCsoInput:
        "ADA names these enquiries individually; compounding them into one screening question is ours. CSO to ratify.",
    },
  },
  {
    /** ADA 12.19's first named screening question. Converts to a lying/standing BP. */
    code: "postural_dizziness",
    display: "Dizziness or faintness on standing up",
    kind: "symptom",
    valueType: "boolean",
    section: SX,
    group: "autonomic",
    showWhen: { feature: "autonomic_symptom_screen", op: "present" },
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
    group: "autonomic",
    showWhen: { feature: "autonomic_symptom_screen", op: "present" },
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
    group: "autonomic",
    showWhen: { feature: "autonomic_symptom_screen", op: "present" },
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
    group: "autonomic",
    showWhen: { feature: "autonomic_symptom_screen", op: "present" },
    citation: ADA_S12,
  },

  /* ── F. Eye — the pattern and the side both steer the referral ────────── */
  {
    /**
     * A4. One finding; the properties carry the whole decision.
     *
     * Blurring that FLUCTUATES with glucose is reversible lens swelling and
     * raises nothing. Recent deterioration is WHO's same-day referral. Sudden
     * loss is NICE's emergency. And the SIDE decides the destination rather than
     * the urgency: monocular sudden loss that recovered is amaurosis fugax — a
     * TIA, which is a stroke service, not an eye clinic.
     *
     * The file header's open gap is now CLOSED. NICE NG17 1.14.7 was verified
     * directly against nice.org.uk, so floaters and a curtain no longer ship
     * unflagged. The red sits on `visual_pattern` where NICE puts it, and the
     * amber here covers the urgent-but-not-emergency tier.
     */
    code: "visual_symptoms",
    display: "Vision problems",
    kind: "symptom",
    valueType: "boolean",
    section: SX,
    group: "eyes_and_kidneys",
    citation: HEARTS_D,
    dangerSign: {
      severity: "amber",
      action:
        "Arrange urgent ophthalmic examination. New flashes, floaters or a curtain need dilated examination as soon as is feasible; WHO HEARTS-D lists recent deterioration of vision among its urgent-referral criteria.",
      when: {
        id: "urgent_visual_change",
        label: "Recent deterioration, new floaters or a curtain — not fluctuating blurring",
        any: [
          { feature: "visual_pattern", op: "==", value: "recent_deterioration" },
          { feature: "visual_pattern", op: "==", value: "floaters" },
          { feature: "visual_pattern", op: "==", value: "curtain" },
        ],
        citation: AAO_PVD,
      },
      citation: HEARTS_D,
    },
  },
  prop("visual_symptoms", {
    /**
     * Multi-select, because sudden loss WITH new floaters is the vitreous
     * haemorrhage picture and recording them separately loses it. Floaters and
     * the curtain are amber, not red: the AAO's words are "urgent ophthalmologic
     * evaluation", and promoting an extremely common and usually benign symptom
     * to the same alarm as Kussmaul breathing is the wolf-crying this catalog
     * refuses.
     */
    code: "visual_pattern",
    display: "Pattern",
    valueType: "multi_select",
    citation: HEARTS_D,
    options: [
      { value: "fluctuating", display: "Blurring that comes and goes with glucose" },
      { value: "recent_deterioration", display: "Recently got worse" },
      { value: "sudden_loss", display: "Sudden loss" },
      { value: "curtain", display: "A curtain or shadow over part of the vision" },
      { value: "floaters", display: "New floaters or flashes" },
    ],
    dangerSign: {
      severity: "red",
      action:
        "Arrange emergency review by an ophthalmologist. NICE lists sudden loss of vision among the findings requiring emergency review.",
      when: {
        id: "sudden_visual_loss",
        label: "Sudden loss of vision",
        all: [{ feature: "visual_pattern", op: "==", value: "sudden_loss" }],
        citation: NICE_NG17_EYE,
      },
      citation: NICE_NG17_EYE,
    },
  }),
  prop("visual_symptoms", {
    /**
     * Bilateral gradual change is diabetic eye disease. UNILATERAL sudden loss
     * is a vascular event until proven otherwise, and that is a different
     * service. Laterality carries no flag of its own — a second red for one
     * complaint is how a flag list starts getting scrolled past.
     */
    code: "visual_laterality",
    display: "One eye or both eyes",
    valueType: "single_select",
    citation: AAO_RAO,
    options: [
      { value: "one_eye", display: "One eye" },
      { value: "both_eyes", display: "Both eyes" },
      { value: "not_sure", display: "Not sure" },
    ],
  }),
  {
    /**
     * Documentation, and it earns the row twice over: the referral letter and the
     * receiving examination both name the eye, and a later encounter can then
     * detect that the OTHER eye has gone — the same complaint in the fellow eye
     * is a different and worse event, which a record saying only "one eye"
     * cannot see.
     */
    code: "visual_eye",
    display: "Which eye",
    kind: "symptom",
    valueType: "single_select",
    section: SX,
    parent: "visual_laterality",
    showWhenAll: [{ feature: "visual_laterality", op: "==", value: "one_eye" }],
    citation: {
      ...AAO_RAO,
      needsCsoInput:
        "That the side must be recorded is our inference from the contralateral-eye reasoning, not a stated AAO instruction. CSO to ratify.",
    },
    options: [
      { value: "left", display: "Left eye" },
      { value: "right", display: "Right eye" },
    ],
  },
  {
    /**
     * The single highest-value question in this group, and today the catalog
     * cannot ask it. Sudden monocular loss that CAME BACK is amaurosis fugax:
     * NICE requires specialist assessment within 24 hours and the stroke
     * pathway, not an ophthalmology waiting list. Gated on one eye deliberately —
     * transient bilateral dimming is not amaurosis fugax and must not fire this.
     */
    code: "visual_loss_recovered",
    display: "Did the vision come back",
    kind: "symptom",
    valueType: "single_select",
    section: SX,
    parent: "visual_symptoms",
    showWhenAll: [{ feature: "visual_pattern", op: "==", value: "sudden_loss" }],
    citation: NICE_NG128_TIA,
    options: [
      { value: "no", display: "No, still lost" },
      { value: "partly", display: "Partly" },
      { value: "fully", display: "Yes, it came back completely" },
    ],
    dangerSign: {
      severity: "red",
      action:
        "Treat as a suspected TIA, not an eye problem. Refer immediately for specialist assessment and investigation, to be seen within 24 hours of onset.",
      when: {
        id: "amaurosis_fugax",
        label: "Transient monocular visual loss that recovered fully",
        all: [
          { feature: "visual_loss_recovered", op: "==", value: "fully" },
          { feature: "visual_laterality", op: "==", value: "one_eye" },
        ],
        citation: NICE_NG128_TIA,
      },
      citation: NICE_NG128_TIA,
    },
  },
  {
    /**
     * Aims an emergency that already exists rather than adding one. Painless
     * sudden loss is a vascular event and a stroke assessment; painful with a red
     * eye is a pressure emergency — measure the intraocular pressure now. NICE
     * lists rubeosis iridis, which is how neovascular glaucoma presents.
     */
    code: "visual_eye_pain",
    display: "Painful or red eye with it",
    kind: "symptom",
    valueType: "boolean",
    section: SX,
    parent: "visual_symptoms",
    showWhenAll: [{ feature: "visual_pattern", op: "==", value: "sudden_loss" }],
    citation: NICE_NG17_EYE,
  },
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
    group: "heart_and_brain",
    citation: HEARTS_D,
    dangerSign: {
      severity: "amber",
      action:
        "Same-day assessment for coronary disease. Treat as an emergency if the pain is ongoing or at rest — in diabetes the presentation is often atypical.",
      citation: HEARTS_D,
    },
  },
  /**
   * The full pain history, on the same framework as abdominal pain. It replaces
   * a single three-option `pattern` field, which could record that the pain came
   * on with exertion but not what it felt like, where it went, or how long it
   * lasted — and in diabetes the presentation is often atypical, so the
   * character and the radiation are doing more work here than usual.
   *
   * The danger sign is unchanged and still ungated: WHO's literal tier for
   * coronary symptoms is same-day for the symptom itself, so nothing here
   * narrows it. What these add is the detail the referral is made on.
   */
  ...socratesProps({
    parent: "chest_pain",
    section: SX,
    // Minutes: under ten and over twenty are different problems.
    durationUnit: "minutes",
    site: [
      { value: "central", display: "Central or behind the breastbone" },
      { value: "left", display: "Left side" },
      { value: "right", display: "Right side" },
      { value: "across", display: "Across the whole chest" },
      { value: "epigastric", display: "Upper abdomen" },
    ],
    character: [
      { value: "crushing", display: "Crushing or pressing" },
      { value: "tight_band", display: "Tight, like a band" },
      { value: "sharp", display: "Sharp or stabbing" },
      { value: "burning", display: "Burning" },
      { value: "dull", display: "Dull ache" },
    ],
    radiation: [
      { value: "none", display: "Stays in one place" },
      { value: "left_arm", display: "To the left arm" },
      { value: "both_arms", display: "To both arms" },
      { value: "jaw_or_neck", display: "To the jaw or neck" },
      { value: "back", display: "Through to the back" },
      { value: "epigastrium", display: "Down to the upper abdomen" },
    ],
    /**
     * Sweating with the pain is the association that most changes the index of
     * suspicion, and it is the one nobody writes down. Vomiting is omitted: it
     * is already its own finding in the emergency band.
     */
    associations: [
      { value: "sweating", display: "Sweating" },
      { value: "breathless", display: "Breathless" },
      { value: "nausea", display: "Nausea" },
      { value: "palpitations", display: "Palpitations" },
      { value: "lightheaded", display: "Light-headed" },
      { value: "none", display: "Nothing else" },
    ],
    /**
     * Carries what the old `pattern` field asked, and more: brought on by
     * exertion and relieved by rest is the anginal pattern, while pain that is
     * worse on breathing in or on moving points away from the heart.
     */
    modifiers: [
      { value: "worse_exertion", display: "Worse on exertion" },
      { value: "better_rest", display: "Better with rest" },
      { value: "worse_breathing_in", display: "Worse breathing in" },
      { value: "worse_position", display: "Worse on moving or lying flat" },
      { value: "better_sitting_forward", display: "Better sitting forward" },
      { value: "better_nitrate", display: "Better with a nitrate" },
      { value: "nothing", display: "Nothing changes it" },
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
    group: "heart_and_brain",
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
    group: "eyes_and_kidneys",
    suggests: ["diabetic_kidney_disease"],
    citation: HEARTS_D,
    dangerSign: {
      severity: "amber",
      action: "Same-day referral. WHO HEARTS-D lists anuria among its urgent-referral criteria.",
      citation: HEARTS_D,
    },
  },

  /* ── I. Crisis precipitants ───────────────────────────────────────────── */
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
  prop(
    "intercurrent_illness",
    {
      /**
       * A named list rather than free text, because the precipitant decides what
       * is treated ALONGSIDE the crisis, and a free-text answer cannot be
       * reasoned over or counted. The list is the common causes in the settings
       * this module is built for — malaria, TB and HIV belong on it as much as
       * pneumonia and UTI do, and a catalog written only from northern guidance
       * would omit all three.
       */
      code: "illness_type",
      display: "Which",
      valueType: "multi_select",
      citation: HEARTS_D,
      options: [
        { value: "pneumonia", display: "Pneumonia or chest infection" },
        { value: "uti", display: "Urinary tract infection" },
        { value: "skin_soft_tissue", display: "Skin or soft-tissue infection" },
        { value: "foot_infection", display: "Diabetic foot infection" },
        { value: "gastroenteritis", display: "Gastroenteritis" },
        { value: "malaria", display: "Malaria" },
        { value: "tb", display: "Tuberculosis" },
        { value: "hiv_related", display: "HIV-related illness" },
        { value: "sepsis", display: "Sepsis, source unclear" },
        { value: "covid_flu", display: "COVID-19 or influenza" },
        { value: "mi_or_stroke", display: "Heart attack or stroke" },
        { value: "pancreatitis", display: "Pancreatitis" },
        { value: "surgery_trauma", display: "Recent surgery or trauma" },
        { value: "pregnancy", display: "Pregnancy" },
        { value: "other", display: "Other" },
      ],
    },
    "precipitants",
  ),
  prop(
    "intercurrent_illness",
    {
      /**
       * HOW the illness was established — the same discipline this catalog
       * applies to its own citations, turned on the record.
       *
       * It is not bookkeeping. Three things turn on it:
       *
       * 1. A PRESUMED precipitant may be the wrong one. If the patient is not
       *    improving on treatment for a presumed chest infection, the real
       *    precipitant may be a silent myocardial infarction or a missed dose —
       *    and a record that says "pneumonia" flatly gives the next clinician no
       *    reason to look again.
       * 2. It decides whether a treatment is committed to. "UTI" from a dipstick
       *    in a hyperglycaemic patient may be glycosuria or asymptomatic
       *    bacteriuria; treating it commits antibiotics that may not be needed.
       * 3. Malaria specifically. WHO requires parasitological confirmation
       *    before treating, and presumptive treatment is a named anti-pattern —
       *    so "clinically diagnosed" and "confirmed by RDT" are different
       *    entries in the record, not shades of the same one.
       */
      code: "illness_diagnosed_by",
      display: "How it was established",
      valueType: "single_select",
      citation: {
        ...HEARTS_D,
        needsCsoInput:
          "That diagnostic certainty should be recorded alongside the precipitant is our reasoning, not a stated HEARTS-D requirement. The option list is conventional. CSO to ratify.",
      },
      options: [
        { value: "test_confirmed", display: "Confirmed by a test" },
        { value: "clinical", display: "Clinical diagnosis, no test" },
        { value: "presumed", display: "Presumed, treated empirically" },
        { value: "elsewhere", display: "Diagnosed at another facility" },
        { value: "patient_reported", display: "Reported by the patient" },
      ],
    },
    "precipitants",
  ),
  {
    /**
     * The one confirmation worth its own field here. WHO's rule is
     * parasitological confirmation before treatment, malaria is a common
     * precipitant in this setting, and it also falsely LOWERS HbA1c — so an
     * unconfirmed malaria diagnosis quietly damages two decisions at once.
     */
    code: "malaria_confirmation",
    display: "Malaria confirmed how",
    kind: "history",
    valueType: "single_select",
    section: "precipitants",
    parent: "illness_type",
    showWhenAll: [{ feature: "illness_type", op: "==", value: "malaria" }],
    citation: {
      standard: "WHO",
      version: "WHO Guidelines for malaria",
      title: "WHO Guidelines for malaria — diagnosis",
      url: "https://www.who.int/publications/i/item/guidelines-for-malaria",
      retrieved: "2026-09-06",
      csoSigned: false,
      needsCsoInput:
        "WHO's parasitological-confirmation requirement is well established but the quote was not re-verified against the current edition here. CSO to confirm before this drives anything.",
    },
    options: [
      { value: "rdt", display: "Rapid diagnostic test" },
      { value: "microscopy", display: "Blood slide microscopy" },
      { value: "none", display: "Not confirmed — treated on suspicion" },
    ],
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
     * stopped in acute illness; steroids predict sustained hyperglycaemia. Both
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
      /**
       * A change has a SHAPE before it has a content, and the shape decides what
       * else is worth asking. Recording only "insulin changed" cannot tell a
       * dose increase from a stop, and those are opposite problems.
       */
      code: "drug_change_kind",
      display: "What changed",
      valueType: "single_select",
      citation: HEARTS_D,
      options: [
        { value: "started", display: "Started something new" },
        { value: "stopped", display: "Stopped something" },
        { value: "switched", display: "Switched one for another" },
        { value: "added", display: "Added to what was already taken" },
        { value: "dose_changed", display: "Same drugs, different dose" },
      ],
    },
    "precipitants",
  ),
  {
    /**
     * FROM and TO, using the same class list as the status tab so the two can be
     * compared. Between them they express every change the clinician described:
     * one drug swapped for another, a monotherapy becoming a combination
     * (from = [metformin], to = [metformin, sulfonylurea]), or the same class in
     * both with a different dose in the detail beside it.
     */
    code: "drug_change_from",
    display: "Was taking",
    kind: "history",
    valueType: "multi_select",
    section: "precipitants",
    parent: "new_or_changed_drug",
    showWhenAll: [
      { feature: "drug_change_kind", op: "in", value: ["stopped", "switched", "dose_changed"] },
    ],
    optionDetail: { label: "Dose", placeholder: "e.g. 1 g twice daily" },
    citation: ADA_2026_PHARM,
    options: THERAPY_CLASSES,
  },
  {
    code: "drug_change_to",
    display: "Now taking",
    kind: "history",
    valueType: "multi_select",
    section: "precipitants",
    parent: "new_or_changed_drug",
    showWhenAll: [
      {
        feature: "drug_change_kind",
        op: "in",
        value: ["started", "switched", "added", "dose_changed"],
      },
    ],
    optionDetail: { label: "Dose", placeholder: "e.g. 1 g twice daily" },
    citation: ADA_2026_PHARM,
    options: THERAPY_CLASSES,
  },
  prop(
    "new_or_changed_drug",
    {
      /**
       * Not glucose-lowering, and that is why it is a separate field rather than
       * an option in the lists above: a steroid does not replace a diabetes drug,
       * it sits alongside one and drives the glucose up regardless of it.
       */
      code: "drug_change_non_diabetes",
      display: "Other medicines started",
      valueType: "multi_select",
      citation: HEARTS_D,
      options: [
        { value: "steroid", display: "Steroid" },
        { value: "thiazide", display: "Thiazide diuretic" },
        { value: "antipsychotic", display: "Antipsychotic" },
        { value: "arv", display: "Antiretrovirals" },
        { value: "tb_treatment", display: "TB treatment" },
        { value: "none", display: "None" },
      ],
    },
    "precipitants",
  ),
];
