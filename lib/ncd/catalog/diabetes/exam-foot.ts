/**
 * The foot examination of a person with diabetes.
 *
 * ── The spine of this list is the IWGDF 2023 guidelines ──────────────────────
 * The Practical Guidelines set out, in §3.2, what a comprehensive examination of
 * the at-risk foot assesses. Its rows are, verbatim:
 *
 *   • Detailed history: ulcer and amputation history, ESRD, pain, numbness  → history section
 *   • Vascular status: pedal pulses, Doppler waveforms, ABI, TBI            → `pedal_pulses`, `abi`, `pad`
 *   • Skin: colour, TEMPERATURE, CALLUS, oedema, FUNGAL INFECTION,
 *     pre-ulcerative signs such as haemorrhage or FISSURES                  → here
 *   • Bone/joint: claw or hammer toes, abnormally large bony prominences,
 *     limited joint mobility, examined lying down AND standing up           → here
 *   • Cognitive disorders                                                   → not built
 *   • FOOTWEAR: ill-fitting, inadequate, or lack of footwear                → here
 *   • Poor foot self-care, e.g. improperly cut toenails, unwashed feet      → here (nails)
 *   • Physical limitations that hinder self-care (visual acuity, obesity)   → not built
 *   • Foot care knowledge                                                   → not built
 *
 * ADA Table 4.1 asks for the same examination in one line — "Comprehensive foot
 * examination … 10-g monofilament … visual inspection (skin integrity, callous,
 * deformity or ulcer, toenails) … check pedal pulses and screen for PAD with
 * ABI" — and recommendations 12.23–12.31 expand it. Where the two bodies agree
 * IWGDF is cited, because ADA Table 12.1 is an adapted reprint of the IWGDF
 * stratification published with permission and is NOT independent corroboration.
 *
 * ── One finding, one home ────────────────────────────────────────────────────
 * The foot is the most crowded region in this catalog: it already has a symptom
 * pass (`feet_and_legs`, gated on `foot_symptom_screen`), seven examination
 * features in features.ts, and an IWGDF risk stratification in complications.ts.
 * Nothing here is re-asked. Specifically, the following ALREADY EXIST and are
 * deliberately absent from this file:
 *
 *   • laterality — `foot_ulcer_side`, `foot_infection_side`, `charcot_side`, one
 *     per lesion. The schema's `showWhenAny` was built for a single shared
 *     "which foot?"; a fourth side field would contradict the three that exist,
 *     and an ulcer on the left with a Charcot foot on the right is ordinary.
 *   • ulcer region and surface — `foot_ulcer_region`, `foot_ulcer_surface`,
 *     which between them are SINBAD's "Site".
 *   • gangrene — `gangrene_type` (none / dry / wet), a property of
 *     `foot_infection_or_gangrene`, which carries the red danger sign.
 *   • the red, hot, swollen foot with no ulcer — `charcot_presentation`, which
 *     carries ADA's total-non-weight-bearing instruction. What the examination
 *     adds is the OBJECTIVE half of that syndrome: the left-right temperature
 *     comparison, and the collapsed midfoot it leaves behind.
 *   • probe-to-bone — `foot_probe_to_bone`, a property of the symptom-pass
 *     ulcer field. It is a bedside test living in a history section, which is
 *     the wrong home; it is not duplicated here, and `ulcer_depth` carries the
 *     IWGDF probing technique and its accuracy instead, since "reaching bone" is
 *     the same observation expressed as SINBAD's "Depth".
 *   • IWGDF risk categories 0–3 — a `StagingSystem` on the `diabetic_foot`
 *     complication. A stage is computed from findings; it is not a finding.
 *
 * ── The two grading scales, and why both ship ────────────────────────────────
 * SINBAD is what IWGDF recommends (Recommendation 1a, Strong) and it needs no
 * equipment, which is why it is the scale a district clinic can actually use.
 * It is NOT a new field: its six letters are read off captures that already
 * exist —
 *
 *   S ite              `foot_ulcer_region` + `foot_ulcer_surface`
 *   I schaemia         `pad` (pre-filled from `pedal_pulses` and `abi`)
 *   N europathy        `lops`, or `lops_ipswich` where there is no monofilament
 *   B acterial infect. `foot_infection_grade`, below
 *   A rea              `ulcer_area_cm2`, below
 *   D epth             `ulcer_depth`, below
 *
 * — so only the last three are added, and asking for a seventh "SINBAD score"
 * field would create a number that can disagree with its own parts. IWGDF says
 * the same thing about its own scale: "it is important to use the individual
 * clinical descriptors and not merely the total score".
 *
 * Wagner ships beside it and is cited separately. IWGDF is openly critical of it
 * — "poor clinical discrimination, as it does not include area, neuropathy,
 * infection and peripheral artery disease individually" — and does not recommend
 * it. It is here because the same guideline's systematic review found it "the
 * system with the highest number of articles validating it (n=74)" and the most
 * frequently reported in the literature, so it is the vocabulary a referral
 * letter and an operating list are most likely to arrive in. Recording both is
 * the same decision the general examination made about the two oedema scales:
 * they measure different things, and one is not a substitute for the other.
 *
 * ── Charcot versus infection ─────────────────────────────────────────────────
 * Both present as a hot, swollen, red foot in a neuropathic patient, the
 * treatments are opposites, and no single finding separates them. What this file
 * models is the four things that actually shift the balance:
 *
 *   1. the SKIN ENVELOPE. IWGDF's Charcot Recommendation 1 describes intact
 *      skin and no history of ulceration; `active_foot_ulcer` therefore argues
 *      weakly AGAINST Charcot. Weakly, and not strongly, because an established
 *      Charcot deformity ulcerates over its own bony prominence.
 *   2. SYSTEMIC upset. IWGDF/IDSA grade 4 is any foot infection plus two SIRS
 *      criteria, which a nurse establishes with a thermometer and a watch.
 *   3. the EXAMINER'S EXCLUSION. IWGDF/IDSA Table 1 will not let a mild
 *      infection be graded until trauma, gout, acute Charcot, fracture,
 *      thrombosis and venous stasis have been considered and set aside — so a
 *      recorded infection grade carries that judgement with it.
 *   4. and DEFORMITY, which is where Charcot ends and infection does not.
 *
 * What does NOT separate them is warmth: it supports both, which is exactly why
 * `foot_temperature_asymmetry` discriminates in two directions at once.
 *
 * ── Where the standards diverge, and it is recorded ──────────────────────────
 * • IWGDF stratifies the at-risk foot into FOUR categories reviewed at 12 / 6 /
 *   3 / 1 months. WHO HEARTS-D — the tier a Ugandan district clinic runs on —
 *   uses THREE levels reviewed annually / 3–6 monthly / 1–3 monthly, counts
 *   "callus alone" as low risk, and promotes deformity alone to moderate risk,
 *   which IWGDF does not. Neither is wrong; they are written for different
 *   staffing. The catalog stages on IWGDF (complications.ts) and the HEARTS-D
 *   table is recorded here on the findings it reads, so nobody later mistakes
 *   one for the other.
 * • Uganda Clinical Guidelines 2023 §8.1.3 contains NO foot examination, NO
 *   ulcer grading and NO risk stratification at all. Its whole instruction is
 *   "Assess for complications (… diabetic foot …), and refer/ treat accordingly"
 *   at health-centre level III. That silence is recorded rather than papered
 *   over: every graded finding in this file comes from IWGDF or ADA, and none of
 *   it is Ugandan national policy.
 *
 * ── Not here, deliberately ───────────────────────────────────────────────────
 * No cool-foot option on the temperature field. A ranked finding fires on any
 * answer that is not "none", so a select carrying both "warmer" and "cooler"
 * would argue for Charcot in a cold ischaemic foot. The cool foot is recorded
 * with the other signs of ischaemia, where it argues for what it means.
 *
 * No `sensitivity` or `specificity` anywhere except inside a quote. The one
 * published likelihood ratio in this file — pulse palpation in a foot that
 * already has an ulcer — is in features.ts on `pedal_pulses`, with the guideline
 * that reports it, because it is the number that shows how little that
 * examination moves the odds.
 *
 * Every citation here is `csoSigned: false`. The file ships gated dark.
 */
import type { Citation, Feature } from "@/lib/ncd/catalog/schema";

const RETRIEVED = "2026-09-07";

/* ── Sources fetched for this file ───────────────────────────────────────── */

/**
 * The examination itself. §3.2 is the list this file is built from; it is what
 * a comprehensive examination of the at-risk foot covers, in order.
 */
const IWGDF_PRACTICAL_EXAM: Citation = {
  standard: "IWGDF",
  version: "IWGDF 2023 Practical Guidelines, §3.2",
  title:
    "IWGDF Practical Guidelines on the prevention and management of diabetes-related foot disease (2023 update)",
  url: "https://iwgdfguidelines.org/wp-content/uploads/2023/07/IWGDF-2023-01-Practical-Guidelines.pdf",
  retrieved: RETRIEVED,
  csoSigned: false,
  quote:
    "Skin: assess skin colour, temperature, presence of callus or oedema, fungal infection, pre-ulcerative signs such as haemorrhage or fissures; Bone/joint: check for deformities (e.g., claw or hammer toes), abnormally large bony prominences, or limited joint mobility. Examine the feet with the patient both lying down and standing up",
};

/** Why a callus is a finding and not a cosmetic note: it is the loading, made visible. */
const IWGDF_PRACTICAL_PATHWAY: Citation = {
  standard: "IWGDF",
  version: "IWGDF 2023 Practical Guidelines, §2 (pathway to ulceration)",
  title:
    "IWGDF Practical Guidelines on the prevention and management of diabetes-related foot disease (2023 update)",
  url: "https://iwgdfguidelines.org/wp-content/uploads/2023/07/IWGDF-2023-01-Practical-Guidelines.pdf",
  retrieved: RETRIEVED,
  csoSigned: false,
  quote:
    "produces high mechanical stress in some areas, the response to which is usually thickened skin (callus). The callus then leads to a further increase in the loading of the foot, often with subcutaneous",
};

/** The pre-ulcerative lesions, and the instruction to treat them now. */
const IWGDF_PRACTICAL_PREULCER: Citation = {
  standard: "IWGDF",
  version: "IWGDF 2023 Practical Guidelines, §3.5",
  title:
    "IWGDF Practical Guidelines on the prevention and management of diabetes-related foot disease (2023 update)",
  url: "https://iwgdfguidelines.org/wp-content/uploads/2023/07/IWGDF-2023-01-Practical-Guidelines.pdf",
  retrieved: RETRIEVED,
  csoSigned: false,
  quote:
    "Provide appropriate treatment of excess callus on the foot, for ingrown toe nails, and for fungal infections on the foot. Treat any (modifiable) pre-ulcerative sign on the foot including protecting blisters, or draining them if necessary.",
};

/**
 * Footwear, and the measurements that make a shoe appropriate. ADA
 * recommendation 12.31 makes the same inspection actionable — therapeutic
 * footwear for the foot with sensory loss, deformity, an ulcer, callus, poor
 * circulation or a previous amputation — and is quoted on `foot_deformity` in
 * features.ts rather than twice.
 */
const IWGDF_PRACTICAL_FOOTWEAR: Citation = {
  standard: "IWGDF",
  version: "IWGDF 2023 Practical Guidelines, §3.4",
  title:
    "IWGDF Practical Guidelines on the prevention and management of diabetes-related foot disease (2023 update)",
  url: "https://iwgdfguidelines.org/wp-content/uploads/2023/07/IWGDF-2023-01-Practical-Guidelines.pdf",
  retrieved: RETRIEVED,
  csoSigned: false,
  quote:
    "For footwear to be considered appropriate, the inside length of the shoe should be 1-2 cm longer than the foot and should not be either too tight or too loose … Evaluate the fit with the patient in the standing position, preferably later in the day (when they may have foot swelling).",
};

/** SINBAD, in the guideline's own table, with the 1 cm² and depth boundaries. */
const IWGDF_SINBAD: Citation = {
  standard: "IWGDF",
  version: "IWGDF 2023 Classification Guideline, Table 2 (SINBAD system)",
  title:
    "Guidelines on the classification of foot ulcers in people with diabetes (IWGDF 2023 update)",
  url: "https://iwgdfguidelines.org/wp-content/uploads/2023/07/IWGDF-2023-03-Classification-Guideline.pdf",
  retrieved: RETRIEVED,
  csoSigned: false,
  quote:
    "Area Ulcer Ulcer <1cm2 / Ulcer ≥1 cm2 … Depth Ulcer confined to skin and subcutaneous tissue / Ulcer reaching muscle, tendon or deeper … Total possible score 0 – 6",
};

/**
 * Wagner. The grades are quoted from the guideline that reproduces them, and so
 * is that guideline's verdict on them — both belong beside the field, because a
 * scale carried for its currency rather than its merit should say so.
 */
const IWGDF_WAGNER: Citation = {
  standard: "IWGDF",
  version: "IWGDF 2023 Classification Guideline (Meggitt-Wagner description)",
  title:
    "Guidelines on the classification of foot ulcers in people with diabetes (IWGDF 2023 update)",
  url: "https://iwgdfguidelines.org/wp-content/uploads/2023/07/IWGDF-2023-03-Classification-Guideline.pdf",
  retrieved: RETRIEVED,
  csoSigned: false,
  quote:
    "The classification proposed by Meggitt and modified by Wagner (16) is the oldest classification and grades wounds into pre- or post-ulcerative site (grade 0), superficial ulcer (grade 1), ulcer penetrating to tendon or joint capsule (grade 2), lesion involving deeper tissues (grade 3), forefoot gangrene (grade 4) and whole foot gangrene involving more than two thirds of the foot (grade 5).",
  needsCsoInput:
    "IWGDF reproduces the Meggitt-Wagner grades and then declines to recommend the scale: it 'considered this classification to have a poor clinical discrimination, as it does not include area, neuropathy, infection and peripheral artery disease individually' and found it 'rendered blunt by the major impact of gangrene'. It ships here for currency — the same review found it the most frequently reported system, validated in 74 articles — NOT as the catalog's recommended scale, which is SINBAD. The original 1979 Wagner paper was not retrieved. CSO to ratify carrying both, or to drop Wagner.",
};

/** The infection grading the whole foot pathway turns on. */
const IWGDF_IDSA_TABLE1: Citation = {
  standard: "IWGDF",
  version: "IWGDF/IDSA 2023 Infection Guideline, Table 1 and Recommendation 1",
  title:
    "Guidelines on the diagnosis and treatment of foot infection in persons with diabetes (IWGDF/IDSA 2023 update)",
  url: "https://iwgdfguidelines.org/wp-content/uploads/2023/07/IWGDF-2023-04-Infection-Guideline.pdf",
  retrieved: RETRIEVED,
  csoSigned: false,
  quote:
    "Infected: At least two of these items are present: Local swelling or induration; Erythema > 0.5 but < 2 cm around the wound; Local tenderness or pain; Local increased warmth; Purulent discharge. And, no other cause of an inflammatory response of the skin (e.g., trauma, gout, acute Charcot neuro-arthropathy, fracture, thrombosis, or venous stasis) 2 / Mild",
};

/** And what a severe or complicated one obliges someone to do, today. */
const IWGDF_IDSA_SURGERY: Citation = {
  standard: "IWGDF",
  version: "IWGDF/IDSA 2023 Infection Guideline, Recommendations 2 and 18",
  title:
    "Guidelines on the diagnosis and treatment of foot infection in persons with diabetes (IWGDF/IDSA 2023 update)",
  url: "https://iwgdfguidelines.org/wp-content/uploads/2023/07/IWGDF-2023-04-Infection-Guideline.pdf",
  retrieved: RETRIEVED,
  csoSigned: false,
  quote:
    "Recommendation 18: Urgent surgical consultation should be obtained in cases of severe infection or moderate diabetes-related foot infection complicated by extensive gangrene, necrotizing infection, signs suggesting deep (below the fascia) abscess, compartment syndrome, or severe lower limb ischaemia.",
};

/**
 * Probe-to-bone. Cited on the DEPTH field rather than on a field of its own,
 * because `foot_probe_to_bone` already exists in the symptom pass and this
 * catalog does not give one test two codes.
 */
const IWGDF_IDSA_PROBE: Citation = {
  standard: "IWGDF",
  version: "IWGDF/IDSA 2023 Infection Guideline, Recommendation 7 and rationale (a)",
  title:
    "Guidelines on the diagnosis and treatment of foot infection in persons with diabetes (IWGDF/IDSA 2023 update)",
  url: "https://iwgdfguidelines.org/wp-content/uploads/2023/07/IWGDF-2023-04-Infection-Guideline.pdf",
  retrieved: RETRIEVED,
  csoSigned: false,
  quote:
    "A systematic review of the PTB test found that for detecting DFO the sensitivity was 0.87 and specificity 0.83. … The procedure is easy to learn and perform, requiring only a sterile blunt metal probe (gently inserted into the wound, with a positive test defined by feeling a hard, gritty structure) … Of note, if clinicians are not skilled in this test, they should not rely on its results",
};

/** The Charcot diagnosis, stated as a Best Practice Statement. */
const IWGDF_CHARCOT_DX: Citation = {
  standard: "IWGDF",
  version: "IWGDF 2023 Charcot Guideline, Recommendation 1",
  title:
    "Diagnosis and treatment of active Charcot neuro-osteoarthropathy in persons with diabetes mellitus (IWGDF 2023)",
  url: "https://iwgdfguidelines.org/wp-content/uploads/2023/07/IWGDF-2023-08-Charcot-Guideline.pdf",
  retrieved: RETRIEVED,
  csoSigned: false,
  quote:
    "Always consider active Charcot neuro-osteoarthropathy in a person with diabetes mellitus, neuropathy and intact skin when there are clinical findings of an increase in temperature, oedema, and/or redness of the foot, compared to the contralateral foot. Best Practice Statement.",
};

/**
 * The temperature comparison, its 2 °C folklore, and the reason palpation is
 * still an acceptable way to do it. All three matter at a district clinic.
 */
const IWGDF_CHARCOT_TEMP: Citation = {
  standard: "IWGDF",
  version: "IWGDF 2023 Charcot Guideline, Recommendation 3 and rationale",
  title:
    "Diagnosis and treatment of active Charcot neuro-osteoarthropathy in persons with diabetes mellitus (IWGDF 2023)",
  url: "https://iwgdfguidelines.org/wp-content/uploads/2023/07/IWGDF-2023-08-Charcot-Guideline.pdf",
  retrieved: RETRIEVED,
  csoSigned: false,
  quote:
    "An increase in skin temperature of 2° Celsius or 4° Fahrenheit (which is actually 2.2° Celsius) of the involved foot compared to the same location on the uninvolved foot has been used as a diagnostic threshold for active CNO in several publications. Our systematic review could not identify studies demonstrating the diagnostic accuracy of such measurement when using imaging as a comparator … in the absence of access to quantitative tools that assess foot temperature, clinicians should rely on using hand palpation to assess temperature difference.",
  needsCsoInput:
    "The 2 °C figure in the option label is what IWGDF reports as having been USED as a threshold in several publications, and IWGDF states in the same paragraph that its systematic review found no study establishing that measurement's diagnostic accuracy against imaging. It is offered as a description of what 'markedly warmer' means to a clinician holding a thermometer, and NOTHING in this catalog computes on it. CSO to ratify carrying the number in the label, or to strike it.",
};

/** And what suspicion alone obliges, before any imaging comes back. */
const IWGDF_CHARCOT_OFFLOAD: Citation = {
  standard: "IWGDF",
  version: "IWGDF 2023 Charcot Guideline, Recommendation 5 (Strong; Low)",
  title:
    "Diagnosis and treatment of active Charcot neuro-osteoarthropathy in persons with diabetes mellitus (IWGDF 2023)",
  url: "https://iwgdfguidelines.org/wp-content/uploads/2023/07/IWGDF-2023-08-Charcot-Guideline.pdf",
  retrieved: RETRIEVED,
  csoSigned: false,
  quote:
    "Initiate knee high immobilization/offloading promptly while further diagnostic studies are performed to confirm or rule out active Charcot neuro-osteoarthropathy (CNO), when active CNO is suspected in a person with diabetes mellitus and intact skin. (Strong; Low)",
};

/** What a foot that is left alone becomes. */
const IWGDF_CHARCOT_DEFORMITY: Citation = {
  standard: "IWGDF",
  version: "IWGDF 2023 Practical Guidelines, §5 (active Charcot neuro-osteoarthropathy)",
  title:
    "IWGDF Practical Guidelines on the prevention and management of diabetes-related foot disease (2023 update)",
  url: "https://iwgdfguidelines.org/wp-content/uploads/2023/07/IWGDF-2023-01-Practical-Guidelines.pdf",
  retrieved: RETRIEVED,
  csoSigned: false,
  quote:
    "CNO is a sterile inflammatory process in persons with neuropathy that results in injury to bones, joints and soft tissues. If not treated adequately, it can result in progressive fracturing and dislocations resulting in a deformed foot.",
};

/**
 * The ischaemic signs, and the guideline's own warning about them: subjective,
 * and producible by neuropathy alone. That warning is why the tier is moderate
 * and why nothing here is allowed to refute PAD.
 */
const IWGDF_PAD_SIGNS: Citation = {
  standard: "IWGDF",
  version: "IWGDF/ESVS/SVS 2023 PAD Guideline, Recommendation 1 and rationale",
  title:
    "The intersocietal IWGDF, ESVS, SVS guidelines on peripheral artery disease in people with diabetes and a foot ulcer (2023)",
  url: "https://iwgdfguidelines.org/wp-content/uploads/2023/07/IWGDF-2023-05-PAD-Guideline.pdf",
  retrieved: RETRIEVED,
  csoSigned: false,
  quote:
    "pulse palpation should therefore be performed, and results considered in the context of other clinical examinations that may be associated with PAD including hair loss, muscle atrophy and reduced peripheral skin temperature. It should be noted that these clinical examinations are highly subjective and such findings may also be associated with neuropathy.",
};

/** ADA's version of the same vascular examination, which names each manoeuvre. */
const ADA_S12_PAD_EXAM: Citation = {
  standard: "ADA",
  version: "Standards of Care in Diabetes—2026, Section 12, rec 12.27",
  title: "12. Retinopathy, Neuropathy, and Foot Care: Standards of Care in Diabetes—2026",
  url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC12690177/",
  retrieved: RETRIEVED,
  csoSigned: false,
  quote:
    "Physical examination for PAD should include assessment of lower-extremity pulses, capillary refill time, rubor on dependency, pallor on elevation, and venous filling time.",
};

/** ADA on the warm, swollen, red foot — and the instruction it carries. */
const ADA_S12_CHARCOT: Citation = {
  standard: "ADA",
  version: "Standards of Care in Diabetes—2026, Section 12 (foot care)",
  title: "12. Retinopathy, Neuropathy, and Foot Care: Standards of Care in Diabetes—2026",
  url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC12690177/",
  retrieved: RETRIEVED,
  csoSigned: false,
  quote:
    "Special consideration should be given to individuals with neuropathy who present with a warm, swollen, red foot with or without a history of trauma and without an open ulceration. These individuals require a thorough workup for possible Charcot neuroarthropathy.",
};

/**
 * WHO's resource-appropriate tier, and the divergence from IWGDF recorded in
 * one place: three risk levels rather than four, callus counted, and its own
 * review intervals. Also the urgent-referral list a clinic actually acts on.
 */
const WHO_HEARTS_D_FOOT: Citation = {
  standard: "WHO",
  version: "HEARTS-D, WHO 2020 (derived from WHO PEN 2013), foot section and Table 8",
  title: "HEARTS D: diagnosis and management of type 2 diabetes",
  url: "https://iris.who.int/server/api/core/bitstreams/2a0b4f68-7155-4ad1-b543-945791e31830/content",
  retrieved: RETRIEVED,
  csoSigned: false,
  quote:
    "Urgent referral to acute services is recommended for patients with any of the following: infected ulcer; spreading infection; critical limb ischaemia; gangrene; suspicion of acute Charcot arthropathy; unexplained red swollen foot.",
  needsCsoInput:
    "DIVERGENCE, recorded rather than resolved. WHO HEARTS-D Table 8 stratifies the foot into THREE levels (low / moderate / high, plus active foot problem) reviewed annually, 3-6 monthly and 1-3 monthly; it counts 'no risk factor except callus alone' as LOW risk and deformity alone as MODERATE risk. IWGDF 2023 Table 1 uses FOUR categories reviewed at 12 / 6 / 3 / 1 months and does not promote deformity alone. This catalog STAGES on IWGDF (complications.ts) because that is the scale its criteria are written in; the WHO table is cited here on the findings it reads. CSO to decide whether a WHO-preference site profile should stage on HEARTS-D instead.",
};

/** What the toes and nails of an at-risk foot look like, in WHO's own list. */
const WHO_HEARTS_D_SKIN: Citation = {
  standard: "WHO",
  version: "HEARTS-D, WHO 2020, symptoms of the at-risk foot",
  title: "HEARTS D: diagnosis and management of type 2 diabetes",
  url: "https://iris.who.int/server/api/core/bitstreams/2a0b4f68-7155-4ad1-b543-945791e31830/content",
  retrieved: RETRIEVED,
  csoSigned: false,
  quote:
    "a change in the shape of feet over time; dry, cracked skin on the feet; a change in the color and temperature of the feet; thickened, yellow toenails; fungal infections between the toes; a blister, sore, ulcer, infected corn, or ingrown toenail. However, the absence of symptoms does not exclude diabetic foot problems.",
};

/**
 * The Ugandan text. Cited for what it does NOT contain, which is the whole point
 * of citing it: §8.1.3 names diabetic foot as a complication and gives no
 * examination, no grading and no risk stratification.
 */
const UCG_2023_FOOT: Citation = {
  standard: "local",
  version: "Uganda Clinical Guidelines 2023, §8.1.3 Diabetes Mellitus (p 475)",
  title:
    "Uganda Clinical Guidelines 2023 — National Guidelines on the Management of Common Conditions (Ministry of Health, Uganda)",
  url: "https://library.health.go.ug/sites/default/files/resources/Uganda%20Clinical%20Guidelines%202023.pdf",
  retrieved: RETRIEVED,
  csoSigned: false,
  quote:
    "Assess for complications (renal disease, eye problems, diabetic foot, peripheral neuropathy, heart problem, stroke), and refer/ treat accordingly",
  needsCsoInput:
    "DIVERGENCE BY OMISSION. The whole of UCG 2023 §8.1.3 says this much about the foot and nothing more — it states no examination sequence, no ulcer grading scale, no infection grading and no risk stratification, and the words 'foot ulcer', 'callus' and 'Wagner' do not appear in the diabetes chapter. Every graded finding in this file is therefore IWGDF or ADA policy and NOT Ugandan national policy, and this citation exists so that fact is on the record. CSO to confirm the catalog may run IWGDF grading at Ugandan sites, and to note it for the national-adaptation memo.",
};

const FT = "foot";

/**
 * A foot finding, filed under the segment it is found in.
 *
 * The segments are the acts of the examination in the order it is performed —
 * look at the skin and nails, look at the shape, test the sensation, feel the
 * circulation, grade the ulcer, inspect the shoe — and the bar at the top of the
 * section is what a clinician moves along. A finding that belongs to two of them
 * belongs to the first one a clinician reaches it in.
 */
const finding = (segment: string, f: Omit<Feature, "section" | "kind" | "group">): Feature => ({
  ...f,
  kind: "sign",
  section: FT,
  group: segment,
});

/** Characterises the finding above it; only asked once that is present. */
const prop = (parent: string, f: Omit<Feature, "section" | "parent">): Feature => ({
  ...f,
  section: FT,
  parent,
});

export const FOOT_EXAM_FEATURES: Feature[] = [
  /* ── skin and nails ──────────────────────────────────────────────────── */
  finding("ft_look", {
    /**
     * The single most useful thing the examination adds to the foot history,
     * and the one finding that argues in two directions at once.
     *
     * IWGDF's Charcot Recommendation 1 is a Best Practice Statement built on
     * exactly this comparison — temperature, oedema and redness AGAINST THE
     * OTHER FOOT — and IWGDF/IDSA Table 1 lists "local increased warmth" among
     * the five local signs that grade an infection. So warmth cannot separate
     * them, and pretending otherwise is the error this field exists to avoid:
     * what it does is put both conditions on the list at once, so that the ulcer
     * field, the infection grade and the systemic observations are what settle
     * it.
     *
     * There is no "cooler" option. A ranked finding fires on any answer that is
     * not "none", so one select carrying warmer AND cooler would argue for
     * Charcot in a cold ischaemic foot. Coolness is recorded with the other
     * ischaemic signs, where it means what it says.
     */
    code: "foot_temperature_asymmetry",
    display: "Skin temperature compared with the other foot",
    valueType: "single_select",
    synonyms: [
      "hot foot",
      "temperature asymmetry",
      "left-right temperature difference",
      "thermal asymmetry",
      "dermal thermometry",
    ],
    elicitation:
      "Uncover both feet and let them settle for a few minutes before touching them. Compare the SAME anatomical point on each foot with the back of your hand — dorsum, midfoot, and over any swelling — taking the warmest point on the affected side. Where an infrared thermometer is available, use it and record the difference; where it is not, IWGDF's own fallback is hand palpation. The comparison is impossible in bilateral disease or after an amputation, and a cast or dressing that has just come off will have warmed the skin.",
    options: [
      { value: "none", display: "The same on both sides" },
      { value: "warmer", display: "This foot warmer than the other" },
      {
        value: "markedly_warmer",
        display: "Markedly warmer — about 2 °C or more where a thermometer is available",
      },
    ],
    suggests: ["diabetic_foot"],
    urgency: "urgent",
    citation: IWGDF_CHARCOT_TEMP,
    discriminates: [
      {
        condition: "charcot_neuroarthropathy",
        direction: "supports",
        strength: "strong",
        rationale:
          "IWGDF's Charcot Recommendation 1 is built on this comparison: always consider active Charcot neuro-osteoarthropathy in a person with diabetes, neuropathy and intact skin when the foot is warmer, more swollen or redder than the contralateral one. The guideline is equally clear that an isolated temperature elevation is sensitive but not specific, which is why this argues strongly for considering Charcot and never for concluding it.",
        citation: IWGDF_CHARCOT_DX,
      },
      {
        condition: "diabetic_foot_infection",
        direction: "supports",
        strength: "moderate",
        rationale:
          "Local increased warmth is one of the five local signs in IWGDF/IDSA Table 1, two of which grade a mild infection. It is moderate rather than strong because warmth alone is one of those five and because the same table requires that acute Charcot, gout, trauma, fracture, thrombosis and venous stasis be excluded before an infection is graded.",
        citation: IWGDF_IDSA_TABLE1,
      },
    ],
    importantNegative: {
      absenceRefutes: ["charcot_neuroarthropathy"],
      caveat:
        "Feet of equal temperature argue against ACTIVE Charcot in the foot being compared, and nothing more. The comparison is meaningless in bilateral disease, impossible after a contralateral amputation, and altered by a cast, a dressing just removed, an infection or an ischaemic contralateral foot. IWGDF states plainly that an isolated foot temperature is not sufficient to diagnose OR to rule out active CNO, and a consolidated Charcot foot that has gone into remission is no longer warm at all.",
      citation: IWGDF_CHARCOT_TEMP,
    },
    dangerSign: {
      severity: "amber",
      action:
        "If this foot is also swollen or red and the skin is intact, treat it as active Charcot until imaging says otherwise: start knee-high immobilisation and offloading promptly rather than waiting for the X-ray, and refer to a foot care specialist. Antibiotics are not the treatment for this.",
      citation: IWGDF_CHARCOT_OFFLOAD,
    },
  }),

  finding("ft_look", {
    /**
     * Callus is the loading of the foot made visible, and haemorrhage inside it
     * is an ulcer that has not broken through yet.
     *
     * Two grades and not three, because the distinction that changes what
     * happens today is whether there is blood in it: IWGDF §3.5 directs that
     * excess callus be pared and that pre-ulcerative signs be treated, and a
     * dark spot within pared callus is the pre-ulcerative sign the guideline
     * names. Plain callus is common in feet with no neuropathy at all, which is
     * why it argues only weakly.
     *
     * It is cited to WHO rather than to IWGDF because this is where the two
     * bodies visibly part company: HEARTS-D's Table 8 counts "no risk factor
     * except callus alone" as a LOW-risk foot reviewed annually, and IWGDF's
     * four categories do not count callus at all. The divergence is recorded on
     * the finding it bears on rather than in a note nobody will find.
     */
    code: "foot_callus",
    display: "Callus",
    valueType: "single_select",
    synonyms: ["callous", "hyperkeratosis", "corn", "pre-ulcerative lesion"],
    elicitation:
      "Look at the plantar surface under the metatarsal heads, at the heel, on the tips and dorsum of any clawed toe, and along both borders of the foot. Pare thick callus, or have a trained professional pare it: a dark red or brown spot inside it is haemorrhage into a pre-ulcerative lesion, and an ulcer may already lie underneath. Callus also hides depth, so pare it before judging any ulcer beneath.",
    options: [
      { value: "none", display: "None" },
      { value: "callus", display: "Callus, skin intact and no haemorrhage" },
      { value: "callus_haemorrhage", display: "Callus with haemorrhage beneath it" },
    ],
    suggests: ["diabetic_foot"],
    citation: WHO_HEARTS_D_FOOT,
    discriminates: [
      {
        condition: "diabetic_peripheral_neuropathy",
        direction: "supports",
        strength: "weak",
        rationale:
          "IWGDF describes callus as the foot's response to high mechanical stress in the insensate foot, and the step in the pathway that then increases the loading further. It is weak because callus is common in feet with normal sensation and is produced by footwear and gait as readily as by neuropathy; what it reliably marks is where the next ulcer will be, not that the nerves have failed.",
        citation: IWGDF_PRACTICAL_PATHWAY,
      },
    ],
  }),

  finding("ft_look", {
    /**
     * The breaks in the skin envelope, and the nails, as ONE field rather than
     * six booleans: they are found in a single pass with the toes separated, and
     * six rows would make a thirty-second look read as a page of work. The same
     * decision the general examination made about the dermatoses.
     *
     * This is where the interdigital spaces are actually examined. The symptom
     * pass asks whether the patient has NOTICED fungal infection or cracked skin
     * (`foot_skin_lesions`, `foot_skin_broken`); a neuropathic patient with poor
     * eyesight cannot see between their own toes, which is precisely the
     * limitation IWGDF §3.2 asks the examiner to assess.
     *
     * No `importantNegative`. An intact skin envelope is tempting to read as
     * refuting infection and it does not: IWGDF/IDSA define a diabetes-related
     * foot infection from "inflammation of any part of the foot, not just of an
     * ulcer", so a foot with unbroken skin can still be infected. That sentence
     * is also what stops intact skin being treated as proof of Charcot.
     */
    code: "preulcerative_foot_lesions",
    display: "Skin and nail lesions",
    valueType: "multi_select",
    synonyms: [
      "interdigital maceration",
      "tinea pedis",
      "athlete's foot",
      "onychomycosis",
      "ingrown toenail",
      "paronychia",
      "heel fissure",
    ],
    elicitation:
      "Separate every toe and look and feel in each web space — this is the part of the foot the patient cannot inspect. Lift the heel and look for fissures, run a finger round each nail fold for redness, swelling or discharge, and note thickened, discoloured or dystrophic nails and how the nails have been cut. Do all of it on both feet with socks and any dressing removed.",
    options: [
      {
        value: "interdigital_maceration",
        display: "Maceration or fungal infection between the toes",
      },
      { value: "fissure", display: "Fissure — heel, or interdigital" },
      { value: "blister", display: "Blister" },
      { value: "ingrown_nail", display: "Ingrown nail, or an inflamed nail fold" },
      { value: "nail_dystrophy", display: "Thickened, discoloured or dystrophic nails" },
      { value: "subungual_haemorrhage", display: "Blood beneath a nail" },
      { value: "poorly_cut_nails", display: "Nails cut too short or into the corners" },
    ],
    suggests: ["diabetic_foot"],
    citation: WHO_HEARTS_D_SKIN,
    discriminates: [
      {
        condition: "diabetic_foot_infection",
        direction: "supports",
        strength: "moderate",
        rationale:
          "Each of these is a portal through the skin envelope, and IWGDF §3.5 directs that fungal infection, ingrown nails and blisters be treated as pre-ulcerative lesions before they become wounds. The macerated web space and the inflamed nail fold carry most of the weight here; a thickened nail on its own is a reservoir and a pressure lesion rather than evidence of infection, which is why the tier is moderate and not strong.",
        citation: IWGDF_PRACTICAL_PREULCER,
      },
    ],
  }),

  /* ── shape ───────────────────────────────────────────────────────────── */
  finding("ft_deformity", {
    /**
     * Where Charcot ends, and infection does not.
     *
     * Kept apart from `foot_deformity` — which stays the generic finding the
     * IWGDF risk category is built on — because a rocker-bottom midfoot is not
     * one deformity among several. It is the residue of a specific process, it
     * argues for that process on its own, and it changes the footwear
     * prescription rather than the risk category.
     *
     * No `importantNegative`, and the absence is the reason: the acute phase
     * precedes the collapse by months, so a foot with no deformity is exactly
     * the foot where active Charcot is still preventable. Reading "no collapse"
     * as refuting Charcot would refute it at the only moment treatment works.
     */
    code: "charcot_foot_deformity",
    display: "Midfoot collapse or rocker-bottom deformity",
    valueType: "boolean",
    synonyms: [
      "rocker-bottom foot",
      "Charcot foot",
      "midfoot collapse",
      "neuro-osteoarthropathic deformity",
      "Charcot neuroarthropathy",
    ],
    elicitation:
      "Stand the person up if they can bear weight and look at the medial border from the side, then compare it with the other foot. A midfoot that has dropped below the line of the heel and forefoot — so that the sole is convex and the weight falls on a new bony prominence in the middle of the foot — is collapse, not a flat foot. Feel for that prominence and for abnormal mobility at the midfoot, and look for an ulcer directly over it.",
    suggests: ["diabetic_foot"],
    citation: IWGDF_CHARCOT_DEFORMITY,
    discriminates: [
      {
        condition: "charcot_neuroarthropathy",
        direction: "supports",
        strength: "strong",
        rationale:
          "IWGDF describes untreated Charcot neuro-osteoarthropathy as producing progressive fracturing and dislocation ending in a deformed foot, and the collapsed midfoot is that endpoint. In a neuropathic foot it is close to unmistakable, but it is `strong` and not `pathognomonic`: trauma, previous surgery and other neuropathic arthropathies produce collapse too, and this finding says the process has already happened rather than that it is active now.",
        citation: IWGDF_CHARCOT_DEFORMITY,
      },
      {
        condition: "diabetic_peripheral_neuropathy",
        direction: "supports",
        strength: "moderate",
        rationale:
          "ADA describes the Charcot presentation as occurring in individuals WITH neuropathy, and IWGDF defines the process as a sterile inflammation of the neuropathic foot — so the deformity it leaves behind implies the sensory loss that permitted it. It is moderate because the inference runs through the diagnosis rather than testing the nerve, and the monofilament or the Ipswich touch test is what settles it.",
        citation: ADA_S12_CHARCOT,
      },
    ],
  }),

  prop("foot_deformity", {
    /**
     * WHICH deformity — because the risk category only needs the boolean, and
     * the shoe needs the shape. IWGDF §3.2 names claw and hammer toes, large
     * bony prominences and limited joint mobility; ADA rec 12.31 turns the
     * finding into a therapeutic-footwear prescription, and none of that can be
     * written from a yes.
     *
     * Midfoot collapse is NOT an option here. It has its own field above,
     * because it argues for something the other patterns do not, and the same
     * finding must not have two homes.
     */
    code: "foot_deformity_pattern",
    display: "Which deformity",
    kind: "sign",
    valueType: "multi_select",
    citation: IWGDF_PRACTICAL_EXAM,
    options: [
      { value: "claw_or_hammer_toes", display: "Claw or hammer toes" },
      { value: "hallux_valgus", display: "Hallux valgus (bunion)" },
      { value: "prominent_metatarsal_heads", display: "Prominent metatarsal heads" },
      { value: "bony_prominence", display: "Abnormally large bony prominence" },
      { value: "hindfoot_or_ankle", display: "Hindfoot or ankle deformity" },
      { value: "post_amputation", display: "Altered shape after a previous amputation" },
      { value: "limited_joint_mobility", display: "Limited joint mobility at the toes or ankle" },
    ],
  }),

  /* ── circulation ─────────────────────────────────────────────────────── */
  finding("ft_vascular", {
    /**
     * ADA rec 12.27 names five manoeuvres for the vascular examination and
     * IWGDF names three more findings to read the pulses alongside. They are one
     * field because they are one sequence — elevate, hang down, watch, touch —
     * and because no one of them is worth a row of its own.
     *
     * No `importantNegative`, deliberately, and this is the whole reason PAD is
     * dangerous in diabetes. IWGDF states that there is no value above which PAD
     * can be excluded and that palpation and clinical examination alone are not
     * sufficient to exclude it. An entry here would add refuting weight the
     * guideline explicitly says these signs do not carry, and a warm foot with
     * good colour is exactly the foot in which the ischaemia gets missed.
     */
    code: "ischaemic_foot_signs",
    display: "Signs of ischaemia",
    valueType: "multi_select",
    synonyms: [
      "Buerger's test",
      "dependent rubor",
      "elevation pallor",
      "capillary refill",
      "venous filling time",
      "critical limb ischaemia",
    ],
    elicitation:
      "Lie the person flat and raise both legs to about 45° for a minute, watching the soles for pallor; then hang the legs over the edge of the couch and time the return of colour and the refilling of the dorsal veins. Press a toe pulp for two seconds and watch the colour come back. Compare each foot with the other and with the calf using the back of your hand, and look at the shin and dorsum for hair loss and thin, shiny, atrophic skin.",
    options: [
      { value: "cool_foot", display: "Foot cool compared with the other foot or with the calf" },
      { value: "dependent_rubor", display: "Rubor on dependency" },
      { value: "elevation_pallor", display: "Pallor on elevation" },
      { value: "delayed_capillary_refill", display: "Delayed capillary refill" },
      { value: "delayed_venous_filling", display: "Delayed venous filling" },
      { value: "hair_loss_atrophic_skin", display: "Hair loss, or thin shiny atrophic skin" },
    ],
    suggests: ["diabetic_foot"],
    citation: ADA_S12_PAD_EXAM,
    discriminates: [
      {
        condition: "peripheral_artery_disease",
        direction: "supports",
        strength: "moderate",
        rationale:
          "ADA rec 12.27 names capillary refill, rubor on dependency, pallor on elevation and venous filling time as the physical examination for peripheral artery disease, and IWGDF adds hair loss, muscle atrophy and reduced skin temperature as the context in which pulse palpation must be read. It is moderate and not strong because IWGDF says in the same passage that these examinations are highly subjective and that such findings may also be produced by neuropathy alone.",
        citation: IWGDF_PAD_SIGNS,
      },
    ],
  }),

  /* ── ulcer, and infection ────────────────────────────────────────────── */
  finding("ft_ulcer", {
    /**
     * The IWGDF/IDSA grade, which is what decides whether this person goes home
     * with a dressing or is admitted tonight.
     *
     * NOT gated on an ulcer, and that is not an oversight. IWGDF/IDSA define a
     * diabetes-related foot infection from "inflammation of any part of the
     * foot, not just of a wound or an ulcer", so gating it behind
     * `active_foot_ulcer` would make the wound-free infection unrecordable.
     *
     * Grade 1 carries the option value `none` so that "uninfected" reads to the
     * ranker as a RECORDED NEGATIVE rather than as a positive finding of the
     * grade scale — the same convention `gangrene_type` and `oedema_grade` use.
     * That is what lets the important negative below mean anything.
     *
     * The "(O)" osteomyelitis suffix from the same table is not an option here.
     * It is added to grade 3 or 4 on the strength of imaging or bone histology,
     * and the bedside contribution to it — whether the wound probes to bone —
     * is `ulcer_depth` and the existing `foot_probe_to_bone`.
     */
    code: "foot_infection_grade",
    display: "Infection grade (IWGDF/IDSA)",
    valueType: "single_select",
    synonyms: [
      "IWGDF/IDSA infection grade",
      "IDSA grade",
      "PEDIS infection grade",
      "diabetic foot infection severity",
      "DFI grade",
    ],
    elicitation:
      "Examine the whole foot, not only the wound. Count the local signs — swelling or induration, erythema, tenderness or pain, increased warmth, purulent discharge — and measure how far the erythema reaches from the wound margin in centimetres, in any direction. Establish whether the infection involves tissue deeper than skin and subcutaneous fat. Then read the temperature, pulse, respiratory rate and white count already recorded: two or more SIRS criteria make it severe. Before grading anything, satisfy yourself that trauma, gout, acute Charcot, fracture, thrombosis or venous stasis does not explain the inflammation.",
    options: [
      { value: "none", display: "1 — Uninfected: no local or systemic signs of infection" },
      {
        value: "mild",
        display:
          "2 — Mild: at least two local signs, erythema over 0.5 cm but under 2 cm, skin and subcutaneous tissue only",
      },
      {
        value: "moderate",
        display:
          "3 — Moderate: no systemic features, but erythema 2 cm or more from the wound margin and/or tissue deeper than skin and subcutaneous fat",
      },
      {
        value: "severe",
        display: "4 — Severe: any foot infection with two or more SIRS criteria",
      },
    ],
    suggests: ["diabetic_foot"],
    urgency: "urgent",
    citation: IWGDF_IDSA_TABLE1,
    discriminates: [
      {
        condition: "diabetic_foot_infection",
        direction: "supports",
        strength: "strong",
        rationale:
          "IWGDF/IDSA Recommendation 1 says to diagnose a soft-tissue diabetes-related foot infection clinically, on local or systemic signs of inflammation, and to grade its severity with this scheme. A recorded grade of 2 or above IS that diagnosis being made at the bedside; what remains open is the depth, the organism and whether bone is involved.",
        citation: IWGDF_IDSA_TABLE1,
      },
      {
        condition: "diabetic_foot_sepsis",
        direction: "supports",
        strength: "moderate",
        rationale:
          "Grade 4 is defined as any foot infection with two or more SIRS criteria, read off the temperature, heart rate, respiratory rate and white count already recorded — and it is the grade that means admission and an urgent surgical opinion. The tier is moderate because this field fires on the whole scale and only its top rung establishes a severe infection.",
        citation: IWGDF_IDSA_SURGERY,
      },
      {
        condition: "charcot_neuroarthropathy",
        direction: "refutes",
        strength: "weak",
        rationale:
          "IWGDF/IDSA Table 1 will not allow a mild infection to be graded unless there is no other cause for the skin's inflammatory response — trauma, gout, ACUTE CHARCOT NEURO-ARTHROPATHY, fracture, thrombosis or venous stasis. A recorded grade therefore carries the examiner's judgement that Charcot was considered and set aside. It is weak precisely because it is a judgement rather than independent evidence, and because the two coexist often enough that an X-ray is still what separates them.",
        citation: IWGDF_IDSA_TABLE1,
      },
    ],
    importantNegative: {
      absenceRefutes: ["diabetic_foot_infection", "diabetic_foot_sepsis"],
      caveat:
        "Grade 1 means no local or systemic sign of infection was FOUND. IWGDF states that these signs may be blunted by neuropathy or ischaemia and that systemic features are often absent in mild and moderate infection, so an uninfected grade does not exclude osteomyelitis under an ulcer, a deep abscess below the fascia, or an infection in a poorly perfused foot — and IWGDF advises imaging when a foot abscess is in doubt despite normal findings. It also says nothing at all about Charcot, which produces the same local inflammation without any infection.",
      citation: IWGDF_IDSA_TABLE1,
    },
    dangerSign: {
      severity: "amber",
      action:
        "Refer to acute services urgently. Consider admission for a severe (grade 4) infection, and for a moderate one accompanied by peripheral artery disease. Obtain an urgent surgical opinion where there is extensive gangrene, a necrotising infection, signs of a deep abscess below the fascia, compartment syndrome or severe limb ischaemia.",
      citation: IWGDF_IDSA_SURGERY,
    },
  }),

  prop("active_foot_ulcer", {
    /**
     * SINBAD's "Area", and the only measurement in this file.
     *
     * A number, not a band, because SINBAD scores it against a single boundary
     * — under 1 cm² scores 0, 1 cm² or more scores 1 — and a field offering the
     * two buckets would throw away the measurement the next review compares
     * against. No `refRange`: there is no normal size for an ulcer, and a
     * reference band would imply one.
     *
     * No `discriminates`, per ADR 0083: a number argues through a cited
     * threshold, and the threshold lives in SINBAD rather than on the field.
     */
    code: "ulcer_area_cm2",
    display: "Ulcer area",
    kind: "measurement",
    valueType: "number",
    unit: "cm2",
    elicitation:
      "Measure the greatest length and the greatest width perpendicular to it, in centimetres, after debriding overlying callus and necrotic tissue, and record the product. Measure the same way at every review, because the trend is what says whether this is healing.",
    citation: IWGDF_SINBAD,
  }),

  prop("active_foot_ulcer", {
    /**
     * SINBAD's "Depth", and the home of the probe-to-bone test.
     *
     * The bone option is not a guess: IWGDF directs the clinician to determine
     * whether bone can be seen or touched with a sterile metal probe, and the
     * cited systematic review reports a sensitivity of 0.87 and a specificity of
     * 0.83 for detecting osteomyelitis — good enough to suggest the diagnosis in
     * a high-risk foot and to help rule it out in a low-risk one, and explicitly
     * not good enough to do either on its own. IWGDF also warns that a clinician
     * unskilled in the test should not rely on its result, which is why the
     * technique is spelled out below rather than assumed.
     *
     * `foot_probe_to_bone` already exists in the symptom pass; this field does
     * not duplicate it. It records the same observation as the depth item the
     * grading scales actually read.
     */
    code: "ulcer_depth",
    display: "Depth",
    kind: "sign",
    valueType: "single_select",
    synonyms: ["probe-to-bone", "PTB test", "wound depth", "SINBAD depth"],
    elicitation:
      "Debride overlying callus and necrotic tissue first — depth cannot be judged through either — but do not debride an uninfected ulcer with signs of severe ischaemia. Then insert a sterile blunt metal probe gently into the wound: a hard, gritty structure at the base is bone. Record what the probe actually reaches, not what the surface suggests.",
    options: [
      { value: "skin_subcutaneous", display: "Confined to skin and subcutaneous tissue" },
      { value: "muscle_or_tendon", display: "Reaching muscle or tendon" },
      { value: "bone_or_joint", display: "Reaching bone or joint — probes to bone" },
    ],
    citation: IWGDF_IDSA_PROBE,
  }),

  prop("active_foot_ulcer", {
    /**
     * Wagner, carried for its currency and not for its merit — see the header.
     * It is a second scale beside SINBAD rather than a replacement for it, in
     * the same way the general examination carries two oedema scales: they
     * answer different questions, and the one a receiving surgeon writes in is
     * not always the one the guideline recommends.
     *
     * The grades are IWGDF's own reproduction of Meggitt and Wagner. Grades 4
     * and 5 are gangrene, which is also recorded by `gangrene_type` in the
     * symptom pass — this field records the SCALE POSITION, and the two must
     * agree because the same foot is in front of the same clinician.
     */
    code: "ulcer_wagner_grade",
    display: "Wagner grade",
    kind: "sign",
    valueType: "single_select",
    synonyms: ["Wagner grade", "Meggitt-Wagner", "Wagner-Meggitt classification"],
    elicitation:
      "Grade the deepest part of the wound after debridement, not its surface, and grade the whole foot rather than one lesion when there is gangrene. Where the grades disagree with the SINBAD items recorded above, the SINBAD items are the ones IWGDF asks to be communicated.",
    options: [
      { value: "grade_0", display: "0 — Pre- or post-ulcerative site, skin intact" },
      { value: "grade_1", display: "1 — Superficial ulcer" },
      { value: "grade_2", display: "2 — Ulcer penetrating to tendon or joint capsule" },
      { value: "grade_3", display: "3 — Lesion involving deeper tissues" },
      { value: "grade_4", display: "4 — Forefoot gangrene" },
      {
        value: "grade_5",
        display: "5 — Whole-foot gangrene involving more than two thirds of the foot",
      },
    ],
    citation: IWGDF_WAGNER,
  }),

  /* ── footwear ────────────────────────────────────────────────────────── */
  {
    /**
     * The commonest cause of the next ulcer, and the only field in this file
     * that is NOT a `sign`.
     *
     * That is deliberate and it is the honest answer to the parsimony rule. A
     * shoe is inspected, but it is not evidence FOR any condition this catalog
     * ranks: it does not argue for infection, or ischaemia, or neuropathy, or
     * Charcot. What it does is trigger a specific, cited action — ADA rec 12.31
     * prescribes therapeutic footwear for the high-risk foot, and IWGDF instructs
     * that the person never again wear the shoe that caused an ulcer. Recording
     * it as a `sign` would require a `discriminates` entry, and the only way to
     * produce one would be to invent an inference no guideline states. It is
     * recorded as history instead, and this comment is why.
     */
    code: "footwear_inspection",
    display: "Footwear",
    kind: "history",
    valueType: "multi_select",
    section: FT,
    group: "ft_footwear",
    synonyms: ["shoe inspection", "therapeutic footwear", "ill-fitting shoes"],
    elicitation:
      "Ask for the shoes the person walked in today, not a spare pair, and put your hand right inside each one: feel for a seam, a stone, a nail, a rucked lining or a sole worn through. Check the fit standing up and preferably later in the day when the feet have swollen — the inside of the shoe should be 1–2 cm longer than the foot, as wide as the foot at the metatarsophalangeal joints, and deep enough for all the toes. Then ask what is worn indoors and at night, which is where the barefoot walking happens.",
    options: [
      { value: "none", display: "Appropriate, and worn indoors and outdoors" },
      { value: "walks_barefoot", display: "Walks barefoot, in socks, or in thin-soled slippers" },
      { value: "no_footwear", display: "No footwear available" },
      { value: "too_short", display: "Too short — under 1–2 cm longer than the foot" },
      { value: "too_narrow", display: "Too narrow or too shallow for the toes" },
      { value: "worn_out", display: "Sole or lining worn through" },
      { value: "foreign_body", display: "Seam, stone, nail or other foreign body inside" },
      { value: "no_insole", display: "No insole or orthosis, where one is needed" },
      { value: "not_prescribed_pair", display: "Not the therapeutic footwear that was prescribed" },
    ],
    suggests: ["diabetic_foot"],
    citation: IWGDF_PRACTICAL_FOOTWEAR,
  },

  {
    /**
     * Off-protocol. Recorded, never reasoned over — `evaluatePredicate` fails
     * closed on it, the validator rejects any criterion naming it, and it is
     * excluded from every completeness denominator.
     *
     * It carries a citation, which no other off-protocol field in this catalog
     * does, and the citation is the reason it is here: Uganda Clinical
     * Guidelines 2023 §8.1.3 prescribes NO foot examination, no ulcer grading
     * and no risk stratification, so a clinician working to the national text
     * has an IWGDF-shaped form in front of them and needs somewhere to write
     * what it does not ask. The divergence is recorded rather than resolved.
     */
    code: "foot_exam_other",
    display: "Add a foot finding the list does not cover",
    kind: "sign",
    valueType: "text_list",
    section: FT,
    group: "ft_look",
    offProtocol: true,
    citation: UCG_2023_FOOT,
  },
];
