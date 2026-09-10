/**
 * Peripheral sensory testing, and the autonomic examination.
 *
 * ── Two groups, and why they are not one ─────────────────────────────────────
 * `ft_neuro` holds the sensory tests performed ON THE FEET, because that is
 * where diabetes takes sensation first and where the consequence of losing it
 * is an amputation. `nx_autonomic` holds the autonomic signs, which are found
 * everywhere except the feet — a pulse, a stomach, a bladder. Splitting them
 * that way means the clinician kneeling at the end of the bed does the whole
 * sensory examination in one pass and never has to come back for a field.
 *
 * ── The spine of ft_neuro is ADA rec 12.18 and rec 12.24 ─────────────────────
 * ADA asks for exactly three things, and this file is those three things:
 *
 *   • either temperature OR pinprick sensation  (small fibre)  → one field
 *   • vibration with a 128-Hz tuning fork       (large fibre)  → one field
 *   • annual 10-g monofilament testing          (ulcer risk)   → one field
 *
 * "either temperature or pinprick" is ADA's own wording, and it is the reason
 * `small_fibre_sensation` is ONE finding with the modality as a property rather
 * than two fields that would ask the same question twice and then disagree. Two
 * further fields are added and justified below: the ankle reflexes, which WHO
 * requires and ADA does not, and the pattern of the loss, which is the only
 * thing on this page that can argue AGAINST a diabetic cause.
 *
 * ── The component tests, not the verdict ─────────────────────────────────────
 * `lops` and `lops_ipswich` already exist in this section and are NOT touched.
 * They are the VERDICT — loss of protective sensation, present or absent, which
 * IWGDF foot risk stratification is defined over. Everything here is a component
 * test that establishes it. Keeping the two apart is what lets a site with no
 * monofilament reach the same verdict by the Ipswich touch test without the
 * catalog pretending the two tests are the same test.
 *
 * ── ADA and UCG diverge, and both are recorded ───────────────────────────────
 * ADA specifies the instrument, the modality and the interval. Uganda Clinical
 * Guidelines 2023 specifies none of them: its whole instruction for chronic
 * complications is to "assess for complications (renal disease, eye problems,
 * diabetic foot, peripheral neuropathy, heart problem, stroke), and refer/treat
 * accordingly", at health-centre level III, with no test named and no device
 * assumed. WHO HEARTS-D sits between the two and is the one that a Ugandan
 * health centre can actually run: it calls peripheral neuropathy PROBABLE on
 * two or more of sensory symptoms, decreased distal sensation, and
 * unequivocally decreased or absent ankle reflexes.
 *
 * That divergence is why `ankle_reflexes` is here at all. ADA rec 12.18 does not
 * mention the ankle jerk; WHO makes it one of three components of its bedside
 * criterion, and it is the only one of the three that needs no equipment. A
 * catalog that followed ADA alone would delete the single test a district clinic
 * can always do. Both citations are attached to the field.
 *
 * ── A note on the "none" option value ────────────────────────────────────────
 * Every graded field here is framed as a DEFICIT and its normal answer carries
 * the value `none`. That is not cosmetic. The ranker reads a recorded select as
 * a present finding unless its value is one of the engine's negative sentinels,
 * so a normal result stored as `normal` would fire every `discriminates` on the
 * field and argue for neuropathy in a patient who has none.
 *
 * ── Deliberately NOT here ────────────────────────────────────────────────────
 * • Erectile dysfunction, postural dizziness, early satiety, bladder symptoms.
 *   All four are already captured in the autonomic SYMPTOM group, and none of
 *   them has a bedside sign — asking again in the examination would give one
 *   finding two homes and two answers to disagree with.
 * • `postural_hypotension`, which lives in the general examination. What is
 *   added beside it is the HEART-RATE response to standing, because ADA's
 *   definition of the autonomic pattern is a postural drop "without an
 *   appropriate increase in heart rate" — and a boolean drop cannot say that.
 * • Peripheral dryness and cracking of the skin: ADA's third sign of autonomic
 *   neuropathy, already recorded as `peripheral_dry_skin` in the general
 *   examination.
 * • Joint-position sense and Romberg's test. No guideline retrieved names
 *   proprioception among the screening modalities for diabetic neuropathy —
 *   ADA names vibration for large-fibre function and stops there. Included, it
 *   would be a documentation field with no condition it could move, which is
 *   precisely what ADR 0083 forbids.
 * • Age bands. Not one finding here is genuinely age-specific in a source that
 *   was retrieved, and a band declared on a hunch silently removes the finding
 *   from every other patient's examination. The known confound — absent ankle
 *   jerks in older people without diabetes — is carried in that field's
 *   rationale instead, where a clinician reads it.
 *
 * Every citation is `csoSigned: false`, as everywhere in this catalog.
 */
import type { Citation, Feature } from "@/lib/ncd/catalog/schema";

const RETRIEVED = "2026-09-07";

/* ── Sources fetched for this file ───────────────────────────────────────── */

/** The screening recommendation the whole sensory group is built from. */
const ADA_S12_DPN: Citation = {
  standard: "ADA",
  version: "Standards of Care in Diabetes—2026, Section 12, recs 12.17–12.18",
  title: "12. Retinopathy, Neuropathy, and Foot Care: Standards of Care in Diabetes—2026",
  url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC12690177/",
  retrieved: RETRIEVED,
  csoSigned: false,
  quote:
    "12.18 Assessment for distal symmetric polyneuropathy should include a careful history and assessment of either temperature or pinprick sensation (small-fiber function) and vibration sensation using a 128-Hz tuning fork (large-fiber function). All people with diabetes should have annual 10-g monofilament testing",
};

/** And the foot-examination recommendation, which is where the modalities pair up. */
const ADA_S12_FOOT: Citation = {
  standard: "ADA",
  version: "Standards of Care in Diabetes—2026, Section 12, rec 12.24",
  title: "12. Retinopathy, Neuropathy, and Foot Care — Foot Care",
  url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC12690177/",
  retrieved: RETRIEVED,
  csoSigned: false,
  quote:
    "The examination should include inspection of the skin, assessment of foot deformities, neurological assessment (10-g monofilament testing or Ipswich touch test with at least one additional assessment: pinprick, temperature, or vibration), and vascular assessment, including pulses in the legs and feet.",
};

/**
 * The hot, red, swollen foot. Quoted here rather than left to the foot file
 * because it is the reason an INTACT monofilament is worth recording: ADA frames
 * Charcot as a presentation of the neuropathic foot, so sensation that is
 * demonstrably intact argues the other way.
 */
const ADA_S12_CHARCOT: Citation = {
  standard: "ADA",
  version: "Standards of Care in Diabetes—2026, Section 12",
  title: "12. Retinopathy, Neuropathy, and Foot Care — Charcot Neuroarthropathy",
  url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC12690177/",
  retrieved: RETRIEVED,
  csoSigned: false,
  quote:
    "Special consideration should be given to individuals with neuropathy who present with a warm, swollen, red foot with or without a history of trauma and without an open ulceration.",
};

/** Cardiovascular autonomic neuropathy, and the two numbers ADA states for it. */
const ADA_S12_CAN: Citation = {
  standard: "ADA",
  version: "Standards of Care in Diabetes—2026, Section 12, rec 12.19",
  title: "12. Retinopathy, Neuropathy, and Foot Care — Cardiovascular Autonomic Neuropathy",
  url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC12690177/",
  retrieved: RETRIEVED,
  csoSigned: false,
  quote:
    "Advanced disease may be associated with resting tachycardia (>100 bpm) and orthostatic hypotension (a fall in systolic or diastolic blood pressure by >20 mmHg or >10 mmHg, respectively, upon standing without an appropriate increase in heart rate). … Signs of autonomic neuropathy include orthostatic hypotension, a resting tachycardia, or evidence of peripheral dryness or cracking of skin.",
};

/** Gastroparesis, and ADA's insistence that it is a diagnosis of exclusion. */
const ADA_S12_GASTRO: Citation = {
  standard: "ADA",
  version: "Standards of Care in Diabetes—2026, Section 12",
  title: "12. Retinopathy, Neuropathy, and Foot Care — Gastrointestinal Neuropathies",
  url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC12690177/",
  retrieved: RETRIEVED,
  csoSigned: false,
  quote:
    "Exclusion of reversible/iatrogenic causes such as medications (e.g., certain GLP-1–based therapies, opioids) or organic causes of gastric outlet obstruction or peptic ulcer disease (endoscopy and/or imaging) is needed before considering a diagnosis of or specialized testing for gastroparesis.",
  needsCsoInput:
    "ADA states when to suspect gastroparesis and what must be excluded first. It does NOT name the succussion splash, and no guideline retrieved for this build states the sign's sensitivity, specificity or inter-observer agreement — the sign itself is bedside convention and no accuracy figure is asserted for it anywhere in this file. CSO to ratify, or to strike the field.",
};

/** The one sentence ADA writes about a palpable bladder. */
const ADA_S12_BLADDER: Citation = {
  standard: "ADA",
  version: "Standards of Care in Diabetes—2026, Section 12 — Genitourinary Disturbances",
  title: "12. Retinopathy, Neuropathy, and Foot Care — Genitourinary Disturbances",
  url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC12690177/",
  retrieved: RETRIEVED,
  csoSigned: false,
  quote:
    "Evaluation of bladder function should be performed for individuals with diabetes who have recurrent urinary tract infections, pyelonephritis, incontinence, or a palpable bladder.",
  needsCsoInput:
    'ADA gives the INDICATION for evaluating bladder function and no DEADLINE. The `urgency: "same_day"` on this field is therefore the catalog\'s own judgement about retention, not a guideline position, and is the one urgency in this file that no retrieved source states. CSO to ratify the deadline or remove it.',
};

/**
 * How the two instrument tests are actually done, and therefore the citation on
 * both of them. Appendix 1 of the IWGDF Practical Guidelines is the most
 * specific text retrieved on technique, and technique is the whole difficulty
 * with these tests — a monofilament pressed until the patient winces and one
 * applied until it buckles are different examinations, and only one of them
 * means what the guideline says it means. The two-of-three rule and the
 * proximal-repeat ladder that the option lists encode are both from here.
 */
const IWGDF_2023_SENSORY: Citation = {
  standard: "IWGDF",
  version: "IWGDF 2023 Practical Guidelines, Appendix 1 (Doing a sensory foot examination)",
  title:
    "IWGDF Practical Guidelines on the prevention and management of diabetes-related foot disease (2023 update)",
  url: "https://iwgdfguidelines.org/wp-content/uploads/2023/07/IWGDF-2023-01-Practical-Guidelines.pdf",
  retrieved: RETRIEVED,
  csoSigned: false,
  quote:
    "Test three different sites on both feet, selecting from those shown in Figure 4. … Apply the monofilament perpendicular to the skin surface with sufficient force to cause the filament to bend or buckle. … Protective sensation is: present at each site if the patient correctly answers on two out of three applications; absent with two out of three incorrect answers. … Apply the tuning fork to a bony part on the dorsal side of the distal phalanx of the first toe (or another toe if the hallux is absent). … If the patient is unable to sense the vibrations on the toe, repeat the test more proximally (e.g., malleolus, tibial tuberosity).",
  needsCsoInput:
    "THE TEST SITES ARE PUBLISHED AS A FIGURE (Figure 4), not as text, and the figure could not be read from the retrieved PDF. This file therefore instructs the examiner to use the sites in that figure and names none of its own — the plantar sites in common circulation are NOT asserted here. CSO to transcribe Figure 4 into the elicitation text, or to attach the figure.",
};

/** Where the second-line vibratory test belongs in the pathway, and why. */
const IWGDF_2023_PREVENTION: Citation = {
  standard: "IWGDF",
  version: "IWGDF 2023 Prevention Guideline, Recommendation 1 (rationale)",
  title: "IWGDF Guidelines on the prevention of foot ulcers in persons with diabetes (2023 update)",
  url: "https://iwgdfguidelines.org/wp-content/uploads/2023/07/IWGDF-2023-02-Prevention-Guideline.pdf",
  retrieved: RETRIEVED,
  csoSigned: false,
  quote:
    "If a 10-gram monofilament is unavailable, use the Ipswich Touch Test. … Because limited vibratory sensation may also predict risk of foot ulceration, we suggest to screen for this with a tuning fork or biothesiometer/neurothesiometer, if outcomes from monofilament testing do not show LOPS.",
};

/**
 * The resource-appropriate criterion, and the reason the ankle jerk is on this
 * page. WHO writes a bedside definition a health centre can apply; ADA writes an
 * instrument protocol. Neither is wrong and the divergence is recorded rather
 * than resolved.
 */
const WHO_HEARTS_D_NEURO: Citation = {
  standard: "WHO",
  version: "HEARTS-D, WHO 2020, 'Diagnosis of diabetic neuropathy' (p 23) and Annex 2 (pp 32–33)",
  title: "HEARTS D: diagnosis and management of type 2 diabetes",
  url: "https://iris.who.int/server/api/core/bitstreams/2a0b4f68-7155-4ad1-b543-945791e31830/content",
  retrieved: RETRIEVED,
  csoSigned: false,
  quote:
    "Peripheral neuropathy is considered probable if there is a combination of two or more of the following: sensory symptoms, decreased distal sensation, or unequivocally decreased or absent ankle reflexes.",
};

/**
 * The Ugandan text, cited for what it does NOT say.
 *
 * UCG 2023 names peripheral neuropathy as a complication to assess for and
 * names no test, no instrument and no interval for doing so. That is a real
 * divergence from ADA rather than an omission to paper over: it is what a
 * health centre III is actually told to do, and it is why WHO HEARTS-D — which
 * defines the assessment without assuming a device — is carried beside ADA on
 * the ankle-reflex field.
 */
const UCG_2023_DM: Citation = {
  standard: "local",
  version: "Uganda Clinical Guidelines 2023, section 8.1 (p 475), Management of complications",
  title:
    "Uganda Clinical Guidelines 2023 — National Guidelines on the Management of Common Conditions (Ministry of Health, Uganda)",
  url: "https://library.health.go.ug/sites/default/files/resources/Uganda%20Clinical%20Guidelines%202023.pdf",
  retrieved: RETRIEVED,
  csoSigned: false,
  quote:
    "Assess for complications (renal disease, eye problems, diabetic foot, peripheral neuropathy, heart problem, stroke), and refer/ treat accordingly",
  needsCsoInput:
    "Cited for a DIVERGENCE, not for a threshold. UCG 2023 names peripheral neuropathy as a complication to assess for at health-centre level III and specifies no examination technique, no instrument and no screening interval — where ADA rec 12.18 specifies all three. Nothing in this file is asserted on UCG's authority; it is recorded so the gap between the two texts is visible rather than silently resolved in ADA's favour. CSO to ratify.",
};

/**
 * The only published likelihood ratios in this file, and the one place a number
 * appears at all.
 *
 * Read carefully, because the target condition is not the one the foot pathway
 * cares about: this meta-analysis pooled trials using NERVE CONDUCTION STUDIES
 * as the reference standard, so these figures describe how well a monofilament
 * detects diabetic peripheral NEUROPATHY. IWGDF uses the same instrument to
 * predict foot ULCERATION, which is a different question with different numbers.
 * The LRs are attached to the neuropathy claim only, and nowhere else.
 */
const WANG_2017_MONOFILAMENT: Citation = {
  standard: "local",
  version: "Journal of Diabetes Research 2017;2017:8787261 (doi 10.1155/2017/8787261)",
  title:
    "Wang F, Zhang J, Yu J, et al. Diagnostic Accuracy of Monofilament Tests for Detecting Diabetic Peripheral Neuropathy: A Systematic Review and Meta-Analysis",
  url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC5651135/",
  retrieved: RETRIEVED,
  csoSigned: false,
  quote:
    "The pooled sensitivity and specificity of monofilament tests for detecting diabetic peripheral neuropathy were 0.53 (95% confidence interval (CI) 0.32 to 0.74) and 0.88 (95% CI 0.78 to 0.94), respectively. … The pooled positive likelihood ratio and negative likelihood ratio were 4.56 (95% CI 2.93 to 7.10) and 0.53 (95% CI 0.35 to 0.81), respectively.",
  needsCsoInput:
    "A JOURNAL META-ANALYSIS, not a guideline, and the two caveats matter. (1) The reference standard is nerve conduction studies, so these figures are for DETECTING neuropathy and NOT for predicting ulceration, which is what IWGDF uses the same instrument for. (2) The pooled sensitivity of 0.53 is why no `importantNegative` refuting diabetic peripheral neuropathy is attached to a normal monofilament anywhere in this file. CSO to ratify the use of these LRs.",
};

/**
 * The comparator numbers for the tuning fork and the biothesiometer.
 *
 * Reported as RANGES ACROSS the reviews the umbrella review included, not as a
 * pooled estimate, which is why they are carried as text and no likelihood ratio
 * is derived from them. The shape of the finding is what matters clinically: the
 * tuning fork is very specific and barely sensitive, so a positive means
 * something and a negative means almost nothing.
 */
const UMBRELLA_2024_SCREENING: Citation = {
  standard: "local",
  version: "Journal of Diabetes Research 2024;2024:5902036 (doi 10.1155/jdr/5902036)",
  title:
    "Mogilevskaya M, Gaviria-Carrillo M, Feliciano-Alfonso JE, et al. Diagnostic Accuracy of Screening Tests for Diabetic Peripheral Neuropathy: An Umbrella Review",
  url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC11634407/",
  retrieved: RETRIEVED,
  csoSigned: false,
  quote:
    "128-Hz tuning fork: sensitivity ranged 0.01 (0.00–0.10) to 0.19 (0.06–0.46) with specificity 0.87 (0.70–0.95) to 0.99 (0.87–0.99). Biothesiometer: sensitivity 0.61 (0.46–0.74) to 0.80 (0.60–0.91) and specificity 0.64 (0.46–0.78) to 0.76 (0.51–0.91).",
  needsCsoInput:
    "AN UMBRELLA REVIEW, not a guideline, and these are RANGES ACROSS the included reviews rather than pooled estimates — which is why no likelihood ratio is asserted for the tuning fork or the biothesiometer anywhere in this file, and why both fields carry a qualitative strength tier only. CSO to ratify.",
};

/* ── Builders ────────────────────────────────────────────────────────────── */

/**
 * A sensory test performed on the feet. Filed in the foot examination's
 * sensation band, beside the LOPS verdict these tests establish.
 */
const sensory = (f: Omit<Feature, "section" | "kind" | "group">): Feature => ({
  ...f,
  kind: "sign",
  section: "foot",
  group: "ft_neuro",
});

/** Characterises the finding above it; only asked once that is present. */
const prop = (parent: string, f: Omit<Feature, "section" | "kind" | "parent">): Feature => ({
  ...f,
  kind: "sign",
  section: "foot",
  parent,
});

/** An autonomic sign, in the neurological segment of the examination. */
const autonomic = (f: Omit<Feature, "section" | "kind" | "group">): Feature => ({
  ...f,
  kind: "sign",
  section: "examination",
  group: "nx_autonomic",
});

export const NEUROPATHY_FEATURES: Feature[] = [
  /* ── ft_neuro: the sensory examination of the feet ───────────────────── */
  sensory({
    /**
     * The classic inconsistently-elicited sign, and the reason `elicitation` is
     * in the schema at all. Three things ruin it in practice and all three are
     * in the instruction below: the patient watching, the filament being pressed
     * beyond buckling, and no mock application — without which the test measures
     * suggestibility rather than sensation.
     *
     * The two strengths differ on purpose. Against neuropathy it is `strong` and
     * carries the only published likelihood ratios in this file. Against Charcot
     * it is `moderate`: a neuropathic foot is the SETTING for Charcot, not
     * evidence of it, and the hot swollen red foot itself is what argues.
     */
    code: "monofilament_10g",
    display: "Pressure perception — 10 g monofilament",
    valueType: "single_select",
    requires: "device.monofilament",
    synonyms: [
      "Semmes-Weinstein monofilament",
      "10 g monofilament test",
      "SWME",
      "pressure perception test",
      "5.07 monofilament",
    ],
    elicitation:
      "Demonstrate on the hand, elbow or forehead first so the patient knows the sensation. " +
      "Test three sites on each foot, taken from IWGDF Figure 4, with the patient unable to " +
      "see where you apply it. Hold the filament perpendicular to the skin and press only " +
      "until it buckles; approach, contact and removal together take about two seconds. Do " +
      "not apply it over an ulcer, callus, scar or necrotic tissue, do not slide it, and do " +
      "not tap repeatedly. Ask whether the pressure is felt and then where. Apply twice at " +
      "each site with at least one mock application in between — three questions per site. " +
      "Sensation is present at a site on two correct answers out of three and absent on two " +
      "incorrect. Rest a filament for 24 hours after 10-15 patients and replace it after 70-90.",
    citation: IWGDF_2023_SENSORY,
    options: [
      { value: "none", display: "Felt at every site tested, on both feet" },
      { value: "one_foot", display: "Not felt at one or more sites on one foot" },
      { value: "both_feet", display: "Not felt at one or more sites on both feet" },
    ],
    discriminates: [
      {
        condition: "diabetic_peripheral_neuropathy",
        direction: "supports",
        strength: "strong",
        lrPositive: 4.56,
        lrNegative: 0.53,
        rationale:
          "Failure to feel a buckling 10 g filament at a tested site is loss of protective " +
          "sensation. Against nerve conduction studies the test is specific and insensitive, " +
          "so a positive argues hard and a negative argues weakly.",
        citation: WANG_2017_MONOFILAMENT,
      },
      {
        condition: "charcot_neuroarthropathy",
        direction: "supports",
        strength: "moderate",
        rationale:
          "Charcot is a presentation of the neuropathic foot: ADA frames it in individuals " +
          "with neuropathy. Demonstrated sensory loss makes the hot, swollen, red foot in " +
          "front of you a Charcot candidate rather than only an infected one.",
        citation: ADA_S12_CHARCOT,
      },
    ],
    importantNegative: {
      absenceRefutes: ["charcot_neuroarthropathy"],
      caveat:
        "Intact pressure sensation argues against Charcot and against nothing else here. It " +
        "does NOT exclude diabetic peripheral neuropathy — the pooled sensitivity against " +
        "nerve conduction studies is 0.53 — nor small-fibre neuropathy, which this test does " +
        "not examine at all, nor peripheral artery disease, infection or an ulcer.",
      citation: ADA_S12_CHARCOT,
    },
  }),

  sensory({
    /**
     * The large-fibre test ADA names, and the one whose numbers are the wrong
     * way round from what most clinicians assume: across the reviews pooled by
     * the 2024 umbrella review the 128-Hz fork was very specific and almost
     * blind, sensitivity as low as 0.01. So it earns `strong` when abnormal and
     * carries NO `importantNegative` at all — a normal fork refutes nothing, and
     * an entry saying otherwise would be more dangerous than no entry.
     *
     * Graded by the LEVEL at which vibration is lost rather than yes/no, because
     * IWGDF's own instruction is to move proximally when the toe feels nothing,
     * and a loss reaching the tibial tuberosity is a different illness from one
     * confined to a hallux.
     */
    code: "vibration_128hz",
    display: "Vibration perception — 128 Hz tuning fork",
    valueType: "single_select",
    synonyms: ["pallaesthesia", "tuning fork test", "vibration sense", "large-fibre testing"],
    elicitation:
      "Demonstrate on the wrist, elbow or clavicle first. With the patient unable to see, " +
      "apply the vibrating fork perpendicularly and with constant pressure to the bony dorsal " +
      "surface of the distal phalanx of the great toe, using another toe if the hallux is " +
      "absent. Apply twice, alternating with at least one mock application in which the fork " +
      "is not vibrating; the test is positive on two correct answers out of three. If the toe " +
      "feels nothing, repeat proximally at the medial malleolus and then the tibial tuberosity " +
      "and record the highest level at which vibration is not felt.",
    citation: IWGDF_2023_SENSORY,
    options: [
      { value: "none", display: "Felt at both halluces" },
      { value: "hallux", display: "Not felt at the hallux — one or both feet" },
      { value: "malleolus", display: "Not felt at the medial malleolus" },
      { value: "tibial_tuberosity", display: "Not felt at the tibial tuberosity" },
    ],
    discriminates: [
      {
        condition: "diabetic_peripheral_neuropathy",
        direction: "supports",
        strength: "strong",
        rationale:
          "Vibration is ADA's named test of large-fibre function, and across the reviews " +
          "pooled by the 2024 umbrella review the 128-Hz fork was highly specific — so lost " +
          "vibration argues hard for neuropathy even though intact vibration argues for little.",
        citation: UMBRELLA_2024_SCREENING,
      },
    ],
  }),

  {
    /**
     * The graded version of the field above, where a device exists. IWGDF places
     * it precisely: a biothesiometer or tuning fork is the SECOND look, run when
     * the monofilament did not show loss of protective sensation, because limited
     * vibratory sensation independently predicts ulceration.
     *
     * A MEASUREMENT, so it carries no `discriminates` — a number discriminates
     * through a cited threshold, and no threshold for this instrument was
     * retrieved for this build, so none is stated here and `refRange` is left
     * empty rather than filled with the figure in common circulation.
     *
     * TWO HONEST GAPS. There is no biothesiometer capability code declared in
     * this catalog, so this field cannot say `requires` and a site cannot mark it
     * `unavailable` from its profile — it will read as merely not done. Adding
     * the capability belongs to whoever owns features.ts, not here.
     */
    code: "vpt_volts",
    display: "Vibration perception threshold (biothesiometer)",
    kind: "measurement",
    requires: "device.biothesiometer",
    valueType: "number",
    unit: "V",
    section: "foot",
    group: "ft_neuro",
    synonyms: ["VPT", "neurothesiometer", "biothesiometry", "quantitative vibration threshold"],
    elicitation:
      "With the patient supine and the foot supported, place the probe on the pulp of the " +
      "great toe under its own weight only. Raise the voltage slowly from zero and record the " +
      "level at which the patient first reports vibration; repeat and take the mean of three " +
      "readings for each foot, recording the higher foot.",
    citation: IWGDF_2023_PREVENTION,
  },

  sensory({
    /**
     * ONE field for two modalities, because ADA rec 12.18 asks for "either
     * temperature or pinprick sensation" — a choice, not a pair. Two fields would
     * ask the same question twice, and the form would then have to decide what a
     * disagreement between them means, which no source answers.
     *
     * Small fibres go first in diabetes and neither the monofilament nor the
     * tuning fork examines them, so without this field the whole sensory
     * examination can be normal in a patient with established neuropathy.
     */
    code: "small_fibre_sensation",
    display: "Small-fibre sensation — pinprick or temperature",
    valueType: "single_select",
    synonyms: ["pinprick sensation", "thermal sensation", "small fiber function", "algesia"],
    elicitation:
      "With the patient's eyes closed, test on the dorsum of the great toe and compare with a " +
      "normal proximal site the patient can feel — the shin or the forearm. For pinprick use a " +
      "fresh disposable neurological pin, once per site, and ask whether it is sharp or blunt " +
      "rather than whether it is felt. For temperature use the cold shaft of a tuning fork or " +
      "warm and cold tubes and ask which is cold. Discard the pin after the patient.",
    citation: ADA_S12_FOOT,
    options: [
      { value: "none", display: "Normal on both feet" },
      { value: "one_foot", display: "Reduced or absent on one foot" },
      { value: "both_feet", display: "Reduced or absent on both feet" },
    ],
    discriminates: [
      {
        condition: "diabetic_peripheral_neuropathy",
        direction: "supports",
        strength: "moderate",
        rationale:
          "ADA names temperature or pinprick as the assessment of small-fibre function, the " +
          "modality lost earliest in diabetes and the one neither the monofilament nor the " +
          "tuning fork examines. Moderate rather than strong: no diagnostic-accuracy figure " +
          "for either modality was retrieved for this build.",
        citation: ADA_S12_DPN,
      },
    ],
  }),
  prop("small_fibre_sensation", {
    /**
     * Which modality was used. Recorded because ADA's "either/or" means the next
     * clinician cannot otherwise tell whether the untested modality was normal or
     * simply never examined.
     */
    code: "small_fibre_modality",
    display: "Tested with",
    valueType: "single_select",
    citation: ADA_S12_DPN,
    options: [
      { value: "pinprick", display: "Pinprick — a fresh disposable neurological pin" },
      { value: "cold_metal", display: "Cold — the shaft of a tuning fork" },
      { value: "thermal_tubes", display: "Warm and cold tubes, or a thermal rod" },
    ],
  }),

  sensory({
    /**
     * The ADA / WHO divergence, made into a field.
     *
     * ADA rec 12.18 does not mention the ankle jerk. WHO HEARTS-D makes
     * "unequivocally decreased or absent ankle reflexes" one of three components
     * of its bedside criterion for probable peripheral neuropathy, and it is the
     * only one of the three needing no equipment — which is why a catalog written
     * for Ugandan health centres keeps it and a catalog written from ADA alone
     * would not. Both sources are attached.
     *
     * `moderate`, not `strong`, and the reason is age: absent ankle jerks are
     * common in older people who have no diabetic neuropathy at all. That is
     * carried here rather than as an `ageBands` restriction, which would hide the
     * field from the very patients in whom it is most often abnormal.
     *
     * The field-level citation is the UGANDAN text and the discrimination's is
     * WHO's, which is not a mix-up. UCG is why a test needing no instrument has
     * to exist in this catalog at all; WHO is what makes the finding mean
     * something once it is recorded. Neither source alone justifies the field.
     */
    code: "ankle_reflexes",
    display: "Ankle reflexes",
    valueType: "single_select",
    synonyms: ["ankle jerk", "Achilles tendon reflex", "triceps surae reflex", "S1 reflex"],
    elicitation:
      "Kneel the patient on a chair with the feet hanging free, or lie them supine with the " +
      "hip externally rotated and the knee flexed. Dorsiflex the ankle to just take up the " +
      "slack in the Achilles tendon and strike the tendon, not the heel. If nothing happens, " +
      "repeat with reinforcement — ask the patient to interlock their fingers and pull hard at " +
      "the moment you strike — and record the reflex as absent only after that.",
    citation: UCG_2023_DM,
    options: [
      { value: "none", display: "Present on both sides" },
      { value: "one_side", display: "Unequivocally reduced or absent on one side" },
      { value: "both_sides", display: "Absent on both sides, after reinforcement" },
    ],
    discriminates: [
      {
        condition: "diabetic_peripheral_neuropathy",
        direction: "supports",
        strength: "moderate",
        rationale:
          "WHO makes unequivocally decreased or absent ankle reflexes one of the three " +
          "findings whose combination, two or more, defines probable peripheral neuropathy. " +
          "Moderate because the reflex is lost with age alone in people who have no diabetic " +
          "neuropathy, so it argues in company rather than by itself.",
        citation: WHO_HEARTS_D_NEURO,
      },
    ],
  }),

  sensory({
    /**
     * The only field on this page that can argue the other way, and the reason it
     * exists: diabetic polyneuropathy is DISTAL and SYMMETRIC by definition, so
     * sensory loss that is neither is evidence against a diabetic cause even
     * while every other field on the page is abnormal.
     *
     * WHO's instruction to exclude alcohol, chemotherapy, B12 deficiency,
     * hypothyroidism, renal disease, malignancy and HIV before settling on
     * diabetes is what this finding operationalises at the bedside. In Uganda
     * leprosy belongs on that list too, and is already captured with the
     * neuropathic symptoms as `leprosy_cardinal_sign` rather than repeated here.
     *
     * Shown only once some sensory test is abnormal — `showWhenAny`, because it
     * is a question about the PATTERN of the loss and no single test owns it.
     */
    code: "non_length_dependent_sensory_loss",
    display: "Sensory loss that is asymmetric, focal or not length-dependent",
    valueType: "boolean",
    synonyms: ["asymmetric neuropathy", "mononeuritis multiplex", "non-stocking distribution"],
    elicitation:
      "Having found sensory loss, map its edge. Work proximally from the toes on each side " +
      "with the same modality and mark where normal sensation returns, then compare the two " +
      "sides. A diabetic polyneuropathy is worst distally, ends in a graded stocking edge and " +
      "is close to symmetric. Record this finding if the loss instead follows a single nerve " +
      "or root, differs markedly between the two legs, or spares the toes.",
    citation: WHO_HEARTS_D_NEURO,
    showWhenAny: [
      { feature: "monofilament_10g", op: "!=", value: "none" },
      { feature: "vibration_128hz", op: "!=", value: "none" },
      { feature: "small_fibre_sensation", op: "!=", value: "none" },
      { feature: "ankle_reflexes", op: "!=", value: "none" },
    ],
    discriminates: [
      {
        condition: "diabetic_peripheral_neuropathy",
        direction: "refutes",
        strength: "moderate",
        rationale:
          "The diabetic pattern is distal symmetric polyneuropathy. Loss that is focal, " +
          "markedly asymmetric or not length-dependent points away from it and towards the " +
          "causes WHO directs be excluded before diabetes is accepted as the explanation.",
        citation: WHO_HEARTS_D_NEURO,
      },
    ],
  }),

  /* ── nx_autonomic: the autonomic examination ─────────────────────────── */
  autonomic({
    /**
     * A SIGN, not the pulse. `pulse` is a vital with its own bands; this is the
     * assertion that the rate is high AT REST and stayed high, which is the only
     * form in which ADA describes it. Recording it as a finding rather than
     * reading it off a single triage number is what stops a frightened patient
     * who has just walked up a hill acquiring cardiac autonomic neuropathy.
     *
     * NO `importantNegative`, deliberately. ADA puts resting tachycardia in
     * ADVANCED disease — "advanced disease may be associated with" — so a normal
     * resting rate is entirely compatible with cardiac autonomic neuropathy and
     * refuting it here would be reading the guideline backwards.
     */
    code: "resting_tachycardia",
    display: "Resting tachycardia — heart rate over 100/min at rest",
    valueType: "boolean",
    synonyms: ["cardiac autonomic neuropathy", "CAN", "fixed heart rate", "denervated heart"],
    elicitation:
      "Let the patient sit or lie quietly for at least five minutes, then count the radial " +
      "pulse for a full minute rather than for fifteen seconds. Confirm on a second reading " +
      "before recording. Do not record it while fever, pain, dehydration, anaemia, " +
      "thyrotoxicosis, hypoglycaemia, salbutamol or withdrawal could account for the rate.",
    citation: ADA_S12_CAN,
    discriminates: [
      {
        condition: "autonomic_neuropathy",
        direction: "supports",
        strength: "moderate",
        rationale:
          "ADA lists resting tachycardia among the signs of autonomic neuropathy and puts it " +
          "at over 100 bpm in advanced disease. Moderate rather than strong because almost " +
          "everything else that raises a resting pulse is commoner than this.",
        citation: ADA_S12_CAN,
      },
    ],
  }),

  autonomic({
    /**
     * What the existing `postural_hypotension` boolean cannot say.
     *
     * ADA's definition of the autonomic pattern is a postural drop "upon standing
     * WITHOUT AN APPROPRIATE INCREASE IN HEART RATE", and that clause is the
     * whole discrimination: a drop with a brisk tachycardia is a volume problem,
     * and a drop with a flat pulse is a nerve problem. They are treated in
     * opposite directions, which is why a second field beside the drop is worth
     * the space and a property of it would not be — this is a finding in its own
     * right with its own evidential claim.
     *
     * Shown only when the drop was found, because there is nothing to interpret
     * otherwise.
     */
    code: "postural_pulse_response",
    display: "Heart-rate response to standing",
    valueType: "single_select",
    synonyms: ["neurogenic orthostatic hypotension", "orthostatic heart rate response"],
    elicitation:
      "Take the pulse and blood pressure after five minutes lying, then stand the patient and " +
      "repeat both at one and at three minutes, counting the pulse rather than reading a " +
      "monitor. Record whether the rate climbed at all as the pressure fell. Note any " +
      "beta-blocker, verapamil, diltiazem or digoxin before interpreting a flat response.",
    showWhen: { feature: "postural_hypotension", op: "present" },
    citation: ADA_S12_CAN,
    options: [
      { value: "none", display: "The heart rate rises as the patient stands" },
      { value: "blunted", display: "The heart rate barely changes or does not rise" },
    ],
    discriminates: [
      {
        condition: "autonomic_neuropathy",
        direction: "supports",
        strength: "strong",
        rationale:
          "ADA defines the orthostatic hypotension of autonomic neuropathy as a postural fall " +
          "occurring without an appropriate increase in heart rate. A drop with a flat pulse " +
          "is the neurogenic pattern; the same drop with a brisk tachycardia is not.",
        citation: ADA_S12_CAN,
      },
    ],
    importantNegative: {
      absenceRefutes: ["autonomic_neuropathy"],
      caveat:
        "A heart rate that climbs as the pressure falls makes this drop a volume problem " +
        "rather than a neurogenic one — it does NOT exclude cardiac autonomic neuropathy at " +
        "an earlier stage, where the resting rate and the postural response are both still " +
        "normal, and it says nothing about autonomic failure elsewhere. A rate-limiting drug " +
        "flattens the response for reasons that have nothing to do with the nerves.",
      citation: ADA_S12_CAN,
    },
  }),

  autonomic({
    /**
     * The one bedside sign of a stomach that is not emptying. It costs seconds,
     * needs nothing, and is the finding that explains an HbA1c and a hypoglycaemia
     * pattern nobody can make sense of.
     *
     * NO `importantNegative`. A splash needs a substantially loaded stomach to be
     * audible, so it is absent in most gastroparesis; recording that absence as
     * refutation would turn a specific sign into a bad rule-out.
     *
     * And it does not separate gastroparesis from gastric outlet obstruction —
     * which is exactly what ADA insists be excluded first. That belongs on a rule
     * as a mimic to exclude, not on this feature, and the rationale says so.
     */
    code: "succussion_splash",
    display: "Succussion splash",
    valueType: "boolean",
    synonyms: ["gastric splash", "clapotage", "retained gastric contents"],
    elicitation:
      "Perform it at least three hours after food or drink. Warn the patient. Place the " +
      "diaphragm of the stethoscope over the epigastrium, take the pelvis in both hands and " +
      "rock the patient briskly from side to side two or three times, listening for the splash " +
      "of fluid in an air-filled stomach. Repeat before recording it, and disregard a splash " +
      "in someone who has just drunk.",
    citation: ADA_S12_GASTRO,
    discriminates: [
      {
        condition: "gastroparesis",
        direction: "supports",
        strength: "moderate",
        rationale:
          "A splash hours after the last meal means retained gastric contents, which is what " +
          "gastroparesis is. It does not say WHY the stomach is not emptying: ADA requires " +
          "drugs, outlet obstruction and peptic ulcer disease to be excluded before the label " +
          "is used, and this sign cannot make that distinction.",
        citation: ADA_S12_GASTRO,
      },
      {
        condition: "autonomic_neuropathy",
        direction: "supports",
        strength: "weak",
        rationale:
          "Gastroparesis is one manifestation of the wider syndrome, so the splash raises it " +
          "too — weakly, because a stomach that is not emptying has many causes outside the " +
          "autonomic nervous system.",
        citation: ADA_S12_CAN,
      },
    ],
  }),

  autonomic({
    /**
     * ADA names a palpable bladder as one of four indications to evaluate bladder
     * function, and it is the only one of the four that is an examination
     * finding rather than a history. A diabetic cystopathy is insensate, so the
     * patient reports nothing while the residual climbs.
     *
     * The `urgency` is the one thing in this file no retrieved source states. It
     * is the catalog's own judgement about retention and the citation says so out
     * loud rather than letting `same_day` read as an ADA position.
     */
    code: "bladder_distension",
    display: "Palpable bladder",
    valueType: "boolean",
    urgency: "same_day",
    synonyms: [
      "distended bladder",
      "urinary retention",
      "neurogenic bladder",
      "diabetic cystopathy",
    ],
    elicitation:
      "Ask the patient to void, then palpate and percuss the suprapubic region. A full bladder " +
      "is a smooth midline swelling arising out of the pelvis whose lower border cannot be " +
      "reached, dull to percussion, and pressing on it gives the urge to pass urine. Confirm " +
      "with a post-void bladder scan, or with the residual volume drained by catheter, where " +
      "either is available.",
    citation: ADA_S12_BLADDER,
    discriminates: [
      {
        condition: "autonomic_neuropathy",
        direction: "supports",
        strength: "moderate",
        rationale:
          "ADA lists a palpable bladder among the findings that oblige an evaluation of " +
          "bladder function in diabetes. Moderate because prostatic obstruction, anticholinergic " +
          "drugs and a spinal cause produce the same swelling and are commoner.",
        citation: ADA_S12_BLADDER,
      },
    ],
  }),
];
