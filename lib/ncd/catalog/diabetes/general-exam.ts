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
 * ── What each finding has to earn (ADR 0083) ─────────────────────────────────
 * Every sign below now carries `discriminates`: what it argues FOR, what it
 * argues AGAINST, how hard, and on whose authority. The validator errors on a
 * sign that carries none, and that rule is the point of the layer — a finding
 * that cannot move the differential, raise urgency or trigger an action is
 * documentation, and documentation belongs in the note.
 *
 * Backfilling the eighteen findings against that rule changed three things and
 * embarrassed one:
 *
 *   • `general_appearance`'s "Well" now carries the VALUE `none`. The ranker
 *     reads `none` as a RECORDED NEGATIVE, and a patient who looks well is
 *     exactly that: the finding — this person looks unwell — is absent, and its
 *     absence is what argues against the severe end of the two crises. Under
 *     any other token a well patient's appearance would have argued FOR them,
 *     which is the opposite of what the examiner meant.
 *   • `acetone_breath` and `pallor` were given NO `importantNegative`, on
 *     purpose. Whether the fetor can be smelled at all varies between
 *     examiners, and pallor is too crude a sign of anaemia to carry weight when
 *     it is missing. Absence is only evidence where the sign is reliable, and
 *     `Assessed<T>` exists so that a negative can be recorded without being
 *     reasoned from.
 *   • `cyanosis` is the weakest entry in the segment and says so below. It
 *     survives on one weak link to peripheral artery disease. If the owner
 *     would rather delete it than carry it, that is a defensible call.
 *
 * `ageBands` is set on NOTHING here. Every one of these findings is looked for
 * in an adolescent, an adult and an older adult alike, and a band declared
 * without cause silently removes the finding from everyone outside it.
 *
 * Three findings carry `urgency`, and only three: a ketotic fetor (`immediate`
 * — the consensus wants the initial samples taken the moment a crisis is
 * suspected), clinical dehydration (`urgent`), and a skin or soft-tissue
 * infection (`same_day`, which is UCG's "prompt treatment of infections" in the
 * crisis-prevention list). Everything else is a routine finding, and a segment
 * that shouted about all of them would be ignored about all of them.
 *
 * ── Where ADA and the Ugandan guidelines diverge ─────────────────────────────
 * On the thyroid, and it matters. ADA palpates the neck in a diabetes clinic
 * because autoimmune thyroid disease is the commonest autoimmune disorder
 * travelling with type 1 diabetes (rec 4.6). UCG 2023 §8.1.5 orders the causes
 * of goitre quite differently — iodine deficiency first — and states plainly
 * that a goitre "May be associated with abnormal thyroid function (hyper or
 * hypothyroidism), or not". BOTH are recorded, in one citation, on the goitre
 * finding's discrimination: ADA's recommendation is why the neck is felt at
 * all, and the Ugandan list is why a lump found there argues more quietly here
 * than ADA's framing alone would suggest.
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

/* ── Sources fetched for the discrimination backfill (ADR 0083) ──────────── */

/**
 * The crises consensus, read again for what it says about the BEDSIDE rather
 * than about the biochemistry. Five passages carry the acute half of this
 * segment, and they are kept as five citations rather than one because a
 * finding should point at the sentence that justifies it, not at a paper.
 */
const CRISES_2024_PRESENTATION: Citation = {
  standard: "EASD",
  version: "ADA/EASD/JBDS/AACE/DTS consensus report, 2024",
  title: "Hyperglycemic Crises in Adults With Diabetes: A Consensus Report",
  url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC11272983/",
  retrieved: RETRIEVED,
  csoSigned: false,
  quote:
    "Both conditions may present with polyuria, polydipsia, weight loss, vomiting, dehydration, and change in cognitive state.",
};

/** Why dehydration argues harder for HHS than for DKA. */
const CRISES_2024_HHS_VOLUME: Citation = {
  standard: "EASD",
  version: "ADA/EASD/JBDS/AACE/DTS consensus report, 2024",
  title: "Hyperglycemic Crises in Adults With Diabetes: A Consensus Report",
  url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC11272983/",
  retrieved: RETRIEVED,
  csoSigned: false,
  quote:
    "Volume depletion is a primary driver of HHS, which commonly occurs in older adults with above-target glucose levels who are at particularly high risk for developing dehydration because of polyuria, age-related impairment of thirst mechanisms, and limited access to fluids.",
};

/** The fetor, and the fact that it is a sign of KETOSIS rather than of sugar. */
const CRISES_2024_FETOR: Citation = {
  standard: "EASD",
  version: "ADA/EASD/JBDS/AACE/DTS consensus report, 2024",
  title: "Hyperglycemic Crises in Adults With Diabetes: A Consensus Report",
  url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC11272983/",
  retrieved: RETRIEVED,
  csoSigned: false,
  quote:
    "The respiratory compensation for metabolic acidosis found in DKA is manifest by Kussmaul breathing, which consists of deep breaths with a fruity odor smell because of the presence of acetone (a breakdown product of the ketone acetoacetic acid) in the breath.",
};

/** The single most useful sentence in this file: why a boil is not incidental. */
const CRISES_2024_INFECTION: Citation = {
  standard: "EASD",
  version: "ADA/EASD/JBDS/AACE/DTS consensus report, 2024",
  title: "Hyperglycemic Crises in Adults With Diabetes: A Consensus Report",
  url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC11272983/",
  retrieved: RETRIEVED,
  csoSigned: false,
  quote:
    "Worldwide, infection is the most common precipitating factor for DKA, occurring in 14–58% of cases. … Infection is the major precipitating factor in 30–60% of patients with HHS, with urinary tract infections and pneumonia being the most common.",
};

/** What "looks unwell" is actually measuring, and how far it goes. */
const CRISES_2024_COGNITION: Citation = {
  standard: "EASD",
  version: "ADA/EASD/JBDS/AACE/DTS consensus report, 2024",
  title: "Hyperglycemic Crises in Adults With Diabetes: A Consensus Report",
  url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC11272983/",
  retrieved: RETRIEVED,
  csoSigned: false,
  quote: "Changes in cognitive state are usually present in patients with severe DKA and HHS.",
};

/**
 * The Ugandan text on the two crises. It is the source that separates them at
 * the BEDSIDE rather than by a blood gas — the fetor under DKA, the deeper
 * fluid deficit and the absent ketosis under HHS — which is exactly the
 * separation a health centre with a urine strip can make.
 */
const UCG_2023_CRISES: Citation = {
  standard: "local",
  version: "Uganda Clinical Guidelines 2023, section 8.1.4 (pp 476–478)",
  title:
    "Uganda Clinical Guidelines 2023 — National Guidelines on the Management of Common Conditions (Ministry of Health, Uganda)",
  url: "https://www.differentiatedservicedelivery.org/wp-content/uploads/UCG-2023-Publication-Final-PDF-Version-1.pdf",
  retrieved: RETRIEVED,
  csoSigned: false,
  quote:
    "Clinical features DKA … Sweet, acetone smell on the breath (from ketosis) … Cardiovascular collapse (hypotension) … HHS … More severe dehydration and fluid deficit … No ketosis and acidosis (no/few ketones in urine) … Prevention … Prompt treatment of infections",
};

/**
 * And on the disease itself. Two of its lines do work here that no ADA passage
 * does: skin sepsis is listed among the presenting symptoms rather than as a
 * complication, and HIV and TB are named in the DIFFERENTIAL of diabetes — the
 * Ugandan reality that makes a node or a mouth worth examining in this clinic.
 */
const UCG_2023_DM: Citation = {
  standard: "local",
  version: "Uganda Clinical Guidelines 2023, section 8.1.3 (pp 469–471)",
  title:
    "Uganda Clinical Guidelines 2023 — National Guidelines on the Management of Common Conditions (Ministry of Health, Uganda)",
  url: "https://www.differentiatedservicedelivery.org/wp-content/uploads/UCG-2023-Publication-Final-PDF-Version-1.pdf",
  retrieved: RETRIEVED,
  csoSigned: false,
  quote:
    "Other symptoms … Weight loss despite high appetite … Frequent skin infections like boils, itchy genitalia (candidiasis), slow healing wounds … Differential diagnosis … Diabetes insipidus, HIV/AIDS, TB",
};

/**
 * THE DIVERGENCE, carried in one object so that neither half can be read
 * without the other. ADA's recommendation is why the neck is palpated in a
 * diabetes clinic at all; the Ugandan list is why what is found there argues
 * more quietly here than that recommendation implies.
 */
const ADA_UCG_GOITRE: Citation = {
  standard: "ADA",
  version: "Standards of Care in Diabetes—2026, Section 4, rec 4.6 (p S66)",
  title: "4. Comprehensive Medical Evaluation — Autoimmune Diseases",
  url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC12690184/",
  retrieved: RETRIEVED,
  csoSigned: false,
  quote:
    "4.6 Screen people with type 1 diabetes for autoimmune thyroid disease soon after diagnosis and thereafter at repeated intervals if clinically indicated. B",
  needsCsoInput:
    "ADA AND UCG DIVERGE HERE AND BOTH ARE RECORDED. ADA palpates the thyroid in every comprehensive diabetes evaluation (Table 4.1) and screens type 1 diabetes for autoimmune thyroid disease. Uganda Clinical Guidelines 2023 §8.1.5 (p 479, https://www.differentiatedservicedelivery.org/wp-content/uploads/UCG-2023-Publication-Final-PDF-Version-1.pdf) approaches the same lump from the other end: 'Visible enlargement of thyroid gland. May be associated with abnormal thyroid function (hyper or hypothyroidism), or not. Causes: Iodine deficiency, Grave's disease, Thyroiditis, Multinodular, Physiological (pregnancy, puberty).' Neither text is wrong; they are written for different prior probabilities, and the strength tier here reflects that a goitre found in Uganda has a longer list of ordinary explanations. CSO to confirm the tier, or to make it site-dependent.",
};

/** What ADA says actually separates type 1 at presentation. */
const ADA_S2_TYPE1: Citation = {
  standard: "ADA",
  version: "Standards of Care in Diabetes—2026, Section 2",
  title: "2. Diagnosis and Classification of Diabetes: Standards of Care in Diabetes—2026",
  url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC12690183/",
  retrieved: RETRIEVED,
  csoSigned: false,
  quote:
    "The features most useful in determination of type 1 diabetes include younger age at diagnosis (<35 years), lower BMI (<25 kg/m2), unintentional weight loss, ketoacidosis, and plasma glucose >360 mg/dL (>20 mmol/L) at presentation",
};

/** The misdiagnosis a yellow sclera is placed to interrupt. */
const ADA_S2_PANCREATIC: Citation = {
  standard: "ADA",
  version: "Standards of Care in Diabetes—2026, Section 2",
  title: "2. Diagnosis and Classification of Diabetes: Standards of Care in Diabetes—2026",
  url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC12690183/",
  retrieved: RETRIEVED,
  csoSigned: false,
  quote:
    "Pancreatic diabetes (also termed pancreatogenic diabetes or type 3c diabetes) … is commonly misdiagnosed as type 2 diabetes. … The diverse set of etiologies includes pancreatitis …, trauma or pancreatectomy, neoplasia, cystic fibrosis … hemochromatosis, fibrocalculous pancreatopathy, rare genetic disorders, and idiopathic forms",
};

/**
 * The staging table, for the two general-survey findings that are HIV markers
 * before they are anything else. The chain has two halves and the note carries
 * the second, because the finding argues for secondary diabetes only through
 * ADA's statement that HIV and its treatment raise the risk.
 */
const WHO_HIV_STAGING: Citation = {
  standard: "WHO",
  version: "WHO Clinical Staging of HIV/AIDS in Adults and Adolescents (Appendix 1)",
  title: "WHO Clinical Staging of HIV/AIDS in Adults and Adolescents",
  url: "https://stacks.cdc.gov/view/cdc/38338/cdc_38338_DS2.pdf",
  retrieved: RETRIEVED,
  csoSigned: false,
  quote:
    "Clinical Stage 1 … Persistent generalized lymphadenopathy … Clinical Stage 2 … Minor mucocutaneous manifestations (seborrheic dermatitis, papular pruritic eruptions, fungal nail infections, recurrent oral ulcerations, angular cheilitis) … Clinical Stage 3 … Persistent oral candidiasis … Acute necrotizing ulcerative stomatitis, gingivitis or periodontitis",
  needsCsoInput:
    "READ FROM A THIRD-PARTY REPRODUCTION of the WHO staging table (a CDC Stacks appendix), not from a WHO original, and the reproduction carries no edition or date. The SECOND half of the chain is ADA's, Standards of Care in Diabetes—2026 Section 2 (https://pmc.ncbi.nlm.nih.gov/articles/PMC12690183/): 'People living with HIV are at higher risk for developing prediabetes and diabetes. In addition, some antiretroviral (ARV) therapies may further increase the risk.' UCG 2023 §8.1.3 independently lists HIV/AIDS and TB in the differential diagnosis of diabetes. CSO to replace the staging source with a current WHO original and to ratify both halves.",
};

/** Anaemia named as a manifestation of CKD — the reason a pale patient matters. */
const KDIGO_2024_MANIFESTATIONS: Citation = {
  standard: "KDIGO",
  version: "KDIGO 2024 Clinical Practice Guideline for the Evaluation and Management of CKD",
  title: "KDIGO 2024 CKD Guideline",
  url: "https://kdigo.org/wp-content/uploads/2024/03/KDIGO-2024-CKD-Guideline.pdf",
  retrieved: RETRIEVED,
  csoSigned: false,
  quote:
    "CKD manifestations include symptoms and clinical/laboratory abnormalities associated with CKD, which confer health implications. These include increased BP, anemia, dyslipidemia, CKD-mineral and bone disorder (CKD-MBD), potassium disorders, severe acidosis, decreased fertility, and increased risk of complications of pregnancy.",
};

/** Volume status as something ADA expects to be assessed by looking and pressing. */
const ADA_S11_VOLUME: Citation = {
  standard: "ADA",
  version: "Standards of Care in Diabetes—2025, Section 11 (CKD complication monitoring)",
  title: "11. Chronic Kidney Disease and Risk Management: Standards of Care in Diabetes—2025",
  url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC11635029/",
  retrieved: RETRIEVED,
  csoSigned: false,
  quote: "Volume overload … History, physical examination, weight",
  needsCsoInput:
    "TWO CELLS OF A TABLE, quoted as they were read, and from the 2025 edition — Section 11 of the 2026 Standards could not be retrieved for this build. What is asserted from them is narrow: ADA expects volume status in chronic kidney disease to be assessed clinically. It is NOT asserted that oedema establishes kidney disease, nor that its absence excludes any. CSO to re-source against the current edition.",
};

/** The lesion that is a marker of insulin resistance rather than of a diagnosis. */
const SKIN_REVIEW_AN: Citation = {
  standard: "local",
  version: "Einstein (São Paulo) 2025;23:eRW1193",
  title:
    "Abate MCMDO, Aroucha PMT, da Nóbrega DVM, et al. Cutaneous manifestations of diabetes mellitus: a narrative review",
  url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC11908747/",
  retrieved: RETRIEVED,
  csoSigned: false,
  quote:
    "Acanthosis nigricans … is considered a significant clinical indicator of insulin resistance.",
  needsCsoInput:
    "A NARRATIVE REVIEW, not a guideline. It is cited for what the sign MEANS, not for how often it is present; no sensitivity is asserted here and none was retrieved. CSO to ratify.",
};

/** And the lesions that are markers of the complications, not of the disease. */
const SKIN_REVIEW_MARKERS: Citation = {
  standard: "local",
  version: "Einstein (São Paulo) 2025;23:eRW1193",
  title:
    "Abate MCMDO, Aroucha PMT, da Nóbrega DVM, et al. Cutaneous manifestations of diabetes mellitus: a narrative review",
  url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC11908747/",
  retrieved: RETRIEVED,
  csoSigned: false,
  quote:
    "Dermopathy can precede the onset of DM, and it functions as a clinical marker for other chronic complications of DM and is associated with coronary artery disease, neuropathy, nephropathy, and retinopathy. … Due to its pathogenesis and association with autoimmune disease, NL has been demonstrated to be more associated with T1DM.",
  needsCsoInput:
    "A NARRATIVE REVIEW, not a guideline, and the association it reports belongs to DERMOPATHY specifically rather than to the whole list of lesions the field bundles. That is why the tier below is weak. CSO to ratify.",
};

/** How the prayer sign is done, and what a positive one is a warning about. */
const LJM_WJD: Citation = {
  standard: "local",
  version: "World Journal of Diabetes, volume 6, issue 9, page 1108",
  title: "Limited joint mobility syndrome in diabetes mellitus: A minireview",
  url: "https://www.wjgnet.com/1948-9358/full/v6/i9/1108.htm",
  retrieved: RETRIEVED,
  csoSigned: false,
  quote:
    "Both hands will have contact for the total opposing hand surface parts, when the hands are pressed flat to each other, as making a 'prayer sign'. If this proves to be impossible, it means there are flexion contractures of the fingers and the sign is considered positive. … it is not only important to diagnose LJMS per se, but also because it can be an early warning signal of the possible presence of one or more of the microvascular complications",
  needsCsoInput:
    "A MINIREVIEW, not a guideline. It supports the technique and the direction of the association; it supplies no risk figure, and none is asserted here. CSO to source a primary study and ratify.",
};

/** What blue skin is, and what it is not, before anything is inferred from it. */
const CYANOSIS_STATPEARLS: Citation = {
  standard: "local",
  version: "StatPearls, Central and Peripheral Cyanosis (NBK559167)",
  title: "Central and Peripheral Cyanosis — StatPearls, NCBI Bookshelf",
  url: "https://www.ncbi.nlm.nih.gov/books/NBK559167/",
  retrieved: RETRIEVED,
  csoSigned: false,
  quote:
    "Peripheral cyanosis occurs due to the inability of the body to deliver oxygen-rich blood to the peripheral tissues. … Ischemic peripheral cyanosis occurs when vasoconstriction leads to diminished peripheral blood flow. … Poor light exposure, the thickness of the skin, and the pigmentation of the skin can affect the accuracy of physical assessment.",
  needsCsoInput:
    "A tertiary reference work, not a guideline, and it does not mention diabetes. It is cited for the MECHANISM of peripheral cyanosis; the step from 'diminished peripheral blood flow' to peripheral artery disease is the catalog's, which is why the tier is weak and why this finding is the segment's most marginal. CSO to ratify or to delete the finding.",
};

/** The one autoimmune traveller that can kill this week. */
const ADDISON_STATPEARLS: Citation = {
  standard: "local",
  version: "StatPearls, Addison Disease (NBK441994)",
  title: "Addison Disease — StatPearls, NCBI Bookshelf",
  url: "https://www.ncbi.nlm.nih.gov/books/NBK441994/",
  retrieved: RETRIEVED,
  csoSigned: false,
  quote:
    "The initial presenting features include fatigue, generalized weakness, weight loss, nausea, vomiting, abdominal pain, dizziness, tachycardia, and hypotension. … Type 2 autoimmune polyglandular syndrome is associated with several conditions: Autoimmune thyroiditis, Type 1 diabetes (ie, Carpenter syndrome).",
  needsCsoInput:
    "A tertiary reference work, not a guideline. It names hypotension and dizziness among the presenting features and the association with type 1 diabetes; it does not state that the POSTURAL drop specifically is a sign, and none is asserted beyond a weak prompt to think of the condition. CSO to source and ratify.",
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
/**
 * The second conventional scale, and the one the first cannot substitute for.
 *
 * They measure different things. The pitting scale answers "how saturated is
 * this tissue"; this one answers "how much of the patient is wet". A 4+ pit
 * confined to the ankles and a 1+ pit that reaches the sacrum are not the same
 * illness, and neither scale on its own tells you which you are looking at —
 * which is exactly why both are taught and why recording one is not recording
 * the other.
 */
const OEDEMA_EXTENT: Citation = {
  standard: "local",
  version: "Peripheral oedema — conventional extent grading",
  title: "Oedema graded by how far it reaches — not a guideline position",
  retrieved: RETRIEVED,
  csoSigned: false,
  needsCsoInput:
    "The second of the two conventional oedema scales: graded by the level the oedema reaches rather than by the depth of the pit. NO GUIDELINE STATING EITHER SCALE WAS RETRIEVED — StatPearls' peripheral-oedema article describes the examination and offers no grading system at all, and the scales in circulation come from textbooks and nursing references that differ at the margins. Both are recorded here as convention. CSO to ratify, or to adopt a single site scale.",
};

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
     *
     * "Well" carries the VALUE `none`, which looks odd beside its display and
     * is the most deliberate line in this file. The ranker reads `none` as a
     * recorded NEGATIVE, and that is precisely what a well-looking patient is:
     * the finding — this person looks unwell — is absent, and the absence is
     * the half that argues. Left as `well` the token would have read as
     * present, and a patient who looked fine would have added weight to DKA.
     *
     * No `urgency`. It is a property of the FINDING, not of the option, so
     * anything set here would fire on "unwell but stable" as loudly as on
     * "acutely unwell"; the crisis rules carry the deadline instead.
     */
    code: "general_appearance",
    display: "General appearance",
    valueType: "single_select",
    citation: CONVENTION,
    synonyms: ["End-of-the-bed test", "Gestalt", "Sick or not sick"],
    elicitation:
      "Form the impression from the doorway, before touching the patient and before the numbers arrive: posture, colour, work of breathing, whether they engage with you, whether they can finish a sentence. Record it first — read the vitals afterwards, or they will anchor the judgement you were trying to make.",
    discriminates: [
      {
        condition: "dka",
        direction: "supports",
        strength: "weak",
        rationale:
          "Looking unwell is the crudest expression of the cognitive and systemic change the consensus describes in the severe end of both crises. It is weak on its own and is here to move a hyperglycaemic patient from a clinic problem to a today problem, never to name which crisis.",
        citation: CRISES_2024_COGNITION,
      },
      {
        condition: "hhs",
        direction: "supports",
        strength: "weak",
        rationale:
          "The same argument, and it applies at least as strongly to the hyperosmolar state, which characteristically walks in as an older adult who is obviously not right rather than as a set of biochemical numbers.",
        citation: CRISES_2024_COGNITION,
      },
    ],
    importantNegative: {
      absenceRefutes: ["severe_dka", "hhs"],
      caveat:
        "A patient who looks well is not a patient without diabetes, without ketosis or without a dangerous glucose. The consensus says cognitive change is usual in SEVERE DKA and HHS, so looking well argues against that end of the two and nothing else — early ketoacidosis, and euglycaemic ketoacidosis in particular, is the presentation in which people look deceptively well. It never substitutes for a glucose.",
      citation: CRISES_2024_COGNITION,
    },
    options: [
      { value: "none", display: "Well" },
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
    synonyms: ["Volume depletion", "Hypovolaemia", "Fluid deficit"],
    elicitation:
      "Look at the tongue and the eyes before the skin: dry mucous membranes, sunken eyes, a capillary refill that lingers, and a fold of skin lifted over the sternum or the forearm that is slow to fall back. Ask when they last passed urine, and how much. Record WHICH signs you found in the field beneath — they are not interchangeable, and a chart that says only 'dehydrated' cannot be re-examined by the next person.",
    urgency: "urgent",
    discriminates: [
      {
        condition: "hhs",
        direction: "supports",
        strength: "strong",
        rationale:
          "Volume depletion is what the hyperosmolar state IS built on — the consensus calls it a primary driver, and describes the older adult in whom polyuria, a blunted thirst and no easy access to water compound each other. A clinically dry patient with a very high glucose is this until shown otherwise.",
        citation: CRISES_2024_HHS_VOLUME,
      },
      {
        condition: "dka",
        direction: "supports",
        strength: "moderate",
        rationale:
          "Dehydration is listed among the presenting features of BOTH crises, so it argues for ketoacidosis too — but it does not separate the two, and the consensus is explicit that the same picture fits either.",
        citation: CRISES_2024_PRESENTATION,
      },
    ],
    importantNegative: {
      absenceRefutes: ["hhs"],
      caveat:
        "A patient who is not clinically dry is not a patient without ketoacidosis. UCG separates the two by saying the hyperosmolar state has the MORE SEVERE fluid deficit, so absence argues against that state and against nothing else: ketoacidosis can be established before fluid loss is visible, the bedside signs of dehydration are crude at the best of times, and euglycaemic ketoacidosis on an SGLT2 inhibitor may show neither a high glucose nor a dry mouth.",
      citation: UCG_2023_CRISES,
    },
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
     *
     * And no `importantNegative`, which is the harder call. Whether the fetor
     * can be smelled at all varies between examiners, so a recorded "no smell"
     * is as much a fact about the nose as about the patient. Absence is only
     * evidence where the sign is reliable, and this one is not.
     */
    code: "acetone_breath",
    display: "Acetone (ketotic) smell on the breath",
    valueType: "boolean",
    citation: CRISES_2024,
    synonyms: ["Ketotic fetor", "Fruity breath", "Fetor of ketones", "Pear-drop breath"],
    elicitation:
      "Smell the breath as you lean in to examine the chest — sweet, fruity, like nail-varnish remover. Do not wait for deep sighing respiration: the fetor is there whether or not Kussmaul breathing is obvious, and the patient without obvious Kussmaul is the one in whom smelling it matters most. If you are unsure, ask a second examiner before recording it either way.",
    urgency: "immediate",
    discriminates: [
      {
        condition: "dka",
        direction: "supports",
        strength: "strong",
        rationale:
          "The consensus attributes the smell directly to acetone, a breakdown product of acetoacetic acid, on the breath of a patient compensating for a metabolic acidosis. It is ketosis made audible to the nose, and it needs no equipment at all.",
        citation: CRISES_2024_FETOR,
      },
      {
        condition: "euglycaemic_dka",
        direction: "supports",
        strength: "moderate",
        rationale:
          "The fetor is a sign of KETOSIS, not of hyperglycaemia — so it is one of the very few bedside findings that still points at ketoacidosis when the glucose comes back normal or near-normal, which is the situation in which people stop looking.",
        citation: CRISES_2024_FETOR,
      },
      {
        condition: "hhs",
        direction: "refutes",
        strength: "moderate",
        rationale:
          "UCG separates the two crises at the bedside partly on this: the acetone smell is listed under ketoacidosis, and the hyperosmolar state is defined there as having 'no ketosis and acidosis (no/few ketones in urine)'. Smelling it argues against a pure hyperosmolar picture — though not against the mixed one, which is common.",
        citation: UCG_2023_CRISES,
      },
    ],
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
    synonyms: ["Muscle wasting", "Cachexia", "Temporal wasting", "Thenar wasting"],
    elicitation:
      "Look at the temples and at the hollow between thumb and index finger, then at the shoulders with the arms hanging relaxed. Judge the wasting against the frame in front of you, never against the weight on the chart: a person can lose most of their muscle and weigh exactly what they always did.",
    discriminates: [
      {
        condition: "type_1_diabetes",
        direction: "supports",
        strength: "moderate",
        rationale:
          "ADA names unintentional weight loss and a low BMI among the features most useful in determining that diabetes is type 1. Wasting is the visible form of the catabolism insulin deficiency produces, and it is the finding that should stop someone reaching for a tablet.",
        citation: ADA_S2_TYPE1,
      },
      {
        condition: "type_2_diabetes",
        direction: "refutes",
        strength: "weak",
        rationale:
          "The same passage points the other way for type 2, whose phenotype ADA contrasts on BMI and weight loss. Weak, and deliberately so: long-standing, badly controlled type 2 diabetes wastes people too, and so does everything else that makes a person thin.",
        citation: ADA_S2_TYPE1,
      },
      {
        condition: "secondary_diabetes",
        direction: "supports",
        strength: "weak",
        rationale:
          "In this population wasting also raises what UCG puts in the differential of diabetes itself — HIV and tuberculosis — and the pancreatic disease ADA says is commonly mistaken for type 2. Those are causes of the diabetes rather than consequences of it, and they are missed by not being considered.",
        citation: UCG_2023_DM,
      },
    ],
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
     *
     * Its most useful job is one `discriminates` CANNOT express. Anaemia is not
     * a rankable condition in this catalog — it is a validity caveat on the
     * HbA1c, and a haemolysis or a malaria falsely LOWERS the number and can
     * mask the disease. That link lives in validity.ts and is not weakened by
     * the single weak discrimination recorded here.
     *
     * No `importantNegative`. Pallor is too crude a sign of anaemia for its
     * absence to argue anything, and an entry claiming otherwise would be worse
     * than none.
     */
    code: "pallor",
    display: "Pallor",
    valueType: "boolean",
    citation: CONVENTION,
    synonyms: ["Clinical anaemia", "Conjunctival pallor", "Palmar pallor"],
    elicitation:
      "Pull the lower lid down and look at the palpebral conjunctiva in daylight, not under a fluorescent tube; then the palms, the nail beds and the tongue. Record the sites beneath — a pale palm in someone whose palms have always been pale is not the same observation as a pale conjunctiva, and only the sites make that legible to the next reader.",
    discriminates: [
      {
        condition: "diabetic_kidney_disease",
        direction: "supports",
        strength: "weak",
        rationale:
          "KDIGO names anaemia among the manifestations of chronic kidney disease. Pallor is a poor test for anaemia and anaemia a poor test for kidney disease, so this is weak twice over; what it is for is prompting the haemoglobin and the eGFR in a patient nobody had thought to screen.",
        citation: KDIGO_2024_MANIFESTATIONS,
      },
    ],
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
    /**
     * Also the only place jaundice is recorded; the haemolysis field lost it.
     *
     * In a diabetes clinic it is a question about the pancreas and the liver.
     * ADA says pancreatic diabetes is COMMONLY MISDIAGNOSED as type 2, and a
     * yellow sclera beside new diabetes is one of the few bedside chances to
     * interrupt that — which is the whole justification for keeping the field.
     */
    code: "jaundice",
    display: "Jaundice",
    valueType: "boolean",
    citation: CONVENTION,
    synonyms: ["Icterus", "Scleral icterus", "Yellow eyes"],
    elicitation:
      "Look at the sclerae in daylight with the upper lid lifted and the patient looking down, then at the mucosa under the tongue. Artificial light hides mild icterus, which is the degree that matters here — by the time it is obvious across the room the question has already answered itself.",
    discriminates: [
      {
        condition: "secondary_diabetes",
        direction: "supports",
        strength: "moderate",
        rationale:
          "Jaundice sends the examination to the pancreas and the liver, and ADA lists neoplasia, pancreatitis, pancreatectomy and haemochromatosis among the causes of pancreatic diabetes while warning that it is commonly misdiagnosed as type 2. A person whose diabetes is secondary is treated differently and investigated differently, so the misdiagnosis is worth interrupting.",
        citation: ADA_S2_PANCREATIC,
      },
    ],
  }),

  finding("gx_colour", {
    /**
     * Peripheral cyanosis is a perfusion finding, central cyanosis an
     * oxygenation one. Different problems, so one field with three answers
     * rather than a yes/no that loses the distinction.
     *
     * THE WEAKEST ENTRY IN THIS SEGMENT, and it should be read as such. Nothing
     * in the diabetes literature retrieved for this build names cyanosis: the
     * IWGDF/ESVS/SVS peripheral-artery-disease guideline does not use the word
     * once. What is recorded below is a mechanism from a tertiary source plus
     * one step of the catalog's own reasoning, tiered weak and labelled. If the
     * owner would rather delete the field than carry an inference, that is a
     * defensible call and this comment is the argument for making it.
     *
     * No `urgency` either. Central cyanosis genuinely is immediate and
     * peripheral cyanosis in a cold room is nothing, and urgency attaches to
     * the finding rather than to the option — so it would have to be wrong for
     * one of them.
     */
    code: "cyanosis",
    display: "Cyanosis",
    valueType: "single_select",
    citation: CONVENTION,
    synonyms: ["Blue discoloration", "Acrocyanosis"],
    elicitation:
      "Look at the tongue and the buccal mucosa for central cyanosis, and at the fingers, toes and nail beds for peripheral. Do it in daylight: poor light, skin thickness and pigmentation all reduce the accuracy of the observation, and a cold room will produce peripheral cyanosis in a perfectly well person. Warm the hands and look again before recording it.",
    discriminates: [
      {
        condition: "peripheral_artery_disease",
        direction: "supports",
        strength: "weak",
        rationale:
          "Peripheral cyanosis is the colour of tissue not receiving oxygen-rich blood, and diminished peripheral flow is its mechanism. In a person with diabetes that raises arterial disease — weakly, because cold and a low cardiac output do exactly the same thing — and its real job is to send the examiner to the pedal pulses and the ABI rather than to settle anything.",
        citation: CYANOSIS_STATPEARLS,
      },
    ],
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
     *
     * NO `ageBands`, although this is the finding the adolescent case turns on.
     * Banding it to adolescence would delete it from every adult examination,
     * and an adult with acanthosis nigricans is telling you the same thing.
     *
     * And no refutation of type 1. It is tempting — the sign is a marker of
     * insulin resistance — but obesity and acanthosis nigricans occur in young
     * people who turn out to have autoantibodies and ketosis, so subtracting
     * from type 1 on this would be the catalog arguing past its source.
     */
    code: "acanthosis_nigricans",
    display: "Acanthosis nigricans",
    valueType: "boolean",
    citation: ADA_S4_EXAM,
    synonyms: ["AN", "Velvety neck pigmentation", "Insulin-resistance pigmentation"],
    elicitation:
      "Lift the hair and look at the back of the neck, then the axillae, the groin, the knuckles and under the breasts. Feel as well as look — the sign is a velvety thickening of the skin, and the colour is the less certain half of it. It does not scrape off; if it does, it was dirt or a fungal intertrigo.",
    discriminates: [
      {
        condition: "type_2_diabetes",
        direction: "supports",
        strength: "moderate",
        rationale:
          "Acanthosis nigricans is a clinical indicator of insulin resistance, and insulin resistance is the mechanism of type 2 diabetes. In an adolescent presenting with diabetes it is one of very few bedside findings that argues for type 2 at all, and it costs nothing but lifting the hair.",
        citation: SKIN_REVIEW_AN,
      },
    ],
    importantNegative: {
      absenceRefutes: ["type_2_diabetes"],
      caveat:
        "Absence does not exclude type 2 diabetes and never did — the sign marks insulin resistance in only some of the people who have it, and a lean adult with type 2 diabetes may show none of it. What a clean neck is worth is slightly more in an adolescent than in an adult, where it is one reason among several to keep type 1 and monogenic diabetes in the picture until the antibodies or the C-peptide say otherwise.",
      citation: SKIN_REVIEW_AN,
    },
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
    synonyms: ["Lipohypertrophy", "Injection-site lumps", "Lipoatrophy", "Insulin hypertrophy"],
    elicitation:
      "Expose the sites the patient actually uses and PALPATE them — lipohypertrophy is felt long before it is seen. Pinch and roll the skin of the abdomen, thighs, upper arms and buttocks between finger and thumb, comparing one side with the other, and look at any pump or sensor site. Ask them to point to where they injected this week; that is the site that will be abnormal.",
    discriminates: [
      {
        condition: "insulin_lipohypertrophy",
        direction: "supports",
        strength: "strong",
        rationale:
          "ADA describes lipohypertrophy as an accumulation of subcutaneous fat at a site of repeated injections, appearing as soft, smooth raised areas several centimetres across. Finding it IS the condition; nothing further is needed to raise it.",
        citation: ADA_S9_INJECTION,
      },
      {
        condition: "hypoglycaemia",
        direction: "supports",
        strength: "moderate",
        rationale:
          "ADA states that lipohypertrophy contributes to erratic insulin absorption, greater glycaemic variability and unexplained hypoglycaemic episodes. It is the cheapest available explanation for swings that would otherwise be blamed on the patient's adherence.",
        citation: ADA_S9_INJECTION,
      },
    ],
    importantNegative: {
      absenceRefutes: ["insulin_lipohypertrophy"],
      caveat:
        "Only if the sites were undressed and felt. Normal-looking skin over a site nobody palpated is not a negative, and it is the ordinary way this finding is missed. A clean examination also says nothing about the things that are asked rather than examined for — needle reuse, no rotation, an injection through clothing — each of which can wreck absorption with no lump to show for it.",
      citation: ADA_S9_INJECTION,
    },
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
     *
     * The source names RETINOPATHY in the same breath as neuropathy and
     * nephropathy, and it is deliberately not linked below. The only retinal
     * condition this catalog ranks is SIGHT-THREATENING retinopathy, and a
     * pretibial spot is no argument for that particular severity — linking them
     * would quietly promote a skin sign into an ophthalmology referral.
     */
    code: "diabetes_skin_lesions",
    display: "Diabetes-associated skin lesions",
    valueType: "multi_select",
    citation: SKIN_REVIEW,
    synonyms: [
      "Diabetic dermatoses",
      "Cutaneous manifestations of diabetes",
      "Diabetic dermopathy",
    ],
    elicitation:
      "Expose the shins, the forearms and the upper back in one pass, with the patient sitting forward. Look at the shins for pigmented atrophic spots and for a yellow-brown plaque with a shiny centre and visible vessels; run the back of your hand over the upper back and neck for woody, non-pitting thickening; check the extensor surfaces for crops of small yellow papules. Record what you see, not what you think it means.",
    discriminates: [
      {
        condition: "diabetic_peripheral_neuropathy",
        direction: "supports",
        strength: "weak",
        rationale:
          "Dermopathy is described as a clinical marker for the chronic complications of diabetes, neuropathy among them. The tier is weak because the association belongs to dermopathy and this field bundles seven lesions, so a positive answer may be carrying something else entirely — it raises the priority of the foot and sensory examination, and claims nothing more.",
        citation: SKIN_REVIEW_MARKERS,
      },
      {
        condition: "diabetic_kidney_disease",
        direction: "supports",
        strength: "weak",
        rationale:
          "The same sentence names nephropathy. Read the same way and for the same reason: a shin nobody looked at is a reason to check the ACR and the eGFR, and is not evidence of kidney disease.",
        citation: SKIN_REVIEW_MARKERS,
      },
      {
        condition: "type_1_diabetes",
        direction: "supports",
        strength: "weak",
        rationale:
          "Necrobiosis lipoidica is reported as more associated with type 1 diabetes, on the strength of its autoimmune pathogenesis. Weak, and only one of the seven options carries it — but a shin plaque in an adult labelled type 2 is a reasonable prompt to ask how the label was arrived at.",
        citation: SKIN_REVIEW_MARKERS,
      },
    ],
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
     *
     * No `importantNegative`: clean skin does not mean there is no precipitant.
     * The commonest sources named alongside it are a urinary tract infection
     * and a pneumonia, neither of which this field can see.
     */
    code: "skin_infection",
    display: "Skin or soft-tissue infection (not the feet)",
    valueType: "boolean",
    citation: SKIN_REVIEW,
    synonyms: ["Boil", "Abscess", "Cellulitis", "Soft-tissue sepsis", "Carbuncle"],
    elicitation:
      "Undress the places people do not offer: axillae, groin, natal cleft, under the breasts, around the insulin injection sites. Mark the edge of any erythema with a pen and write the time beside it, so the next examiner can tell whether it is spreading rather than guessing. Pain out of proportion to what is visible, crepitus or dusky skin belongs in the 'rapidly spreading' answer and needs a surgeon, not an antibiotic.",
    urgency: "same_day",
    discriminates: [
      {
        condition: "dka",
        direction: "supports",
        strength: "moderate",
        rationale:
          "Infection is the commonest precipitant of ketoacidosis worldwide, in 14–58% of cases. A boil in a person whose control has suddenly collapsed is not incidental to that story; it is usually the beginning of it.",
        citation: CRISES_2024_INFECTION,
      },
      {
        condition: "hhs",
        direction: "supports",
        strength: "moderate",
        rationale:
          "The same consensus puts infection behind 30–60% of hyperosmolar presentations. Finding the source changes the treatment as much as the fluids do, and skin is the one source that can be found without a laboratory.",
        citation: CRISES_2024_INFECTION,
      },
    ],
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
    synonyms: ["Xerosis", "Anhidrosis", "Sudomotor dysfunction", "Cracked heels", "Fissures"],
    elicitation:
      "Run the backs of your fingers over the shins, the dorsum of the feet and the heels, and look into the skin creases and between the toes for fissures. Ask whether the feet sweat at all. This is sudomotor failure being described, not a patient who needs more water — which is why it sits beside the postural drop rather than beside the dehydration.",
    discriminates: [
      {
        condition: "autonomic_neuropathy",
        direction: "supports",
        strength: "moderate",
        rationale:
          "ADA lists evidence of peripheral dryness or cracking of the skin as one of three signs of diabetic autonomic neuropathy, alongside orthostatic hypotension and a resting tachycardia. On its own it is one of three; recorded with either of the others it stops being a dermatological aside.",
        citation: ADA_S12_AUTONOMIC,
      },
    ],
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
    synonyms: [
      "Prayer sign",
      "Diabetic cheiroarthropathy",
      "Cheiroarthropathy",
      "Tabletop sign",
      "Limited joint mobility syndrome",
    ],
    elicitation:
      "Ask the patient to press the palms flat together in front of the chest, fingers extended and elbows out. A gap anywhere between the palms or the finger pads is a positive prayer sign. If they cannot hold that position, lay the hands flat on a table with the forearms at a right angle — a hand that will not make contact everywhere is the same finding. It is painless, so it is found only when it is asked for.",
    discriminates: [
      {
        condition: "diabetic_peripheral_neuropathy",
        direction: "supports",
        strength: "weak",
        rationale:
          "The sign is described as an early warning of one or more of the microvascular complications rather than as a problem in itself. It costs one instruction and no equipment, and what it buys is a reason to do the sensory examination properly today.",
        citation: LJM_WJD,
      },
      {
        condition: "diabetic_kidney_disease",
        direction: "supports",
        strength: "weak",
        rationale:
          "The same warning covers nephropathy. No risk figure is asserted — the retrieved review gives none — so this argues only for looking, which in practice means the urine ACR that was never sent.",
        citation: LJM_WJD,
      },
    ],
  }),

  /* ── head and neck ───────────────────────────────────────────────────── */
  finding("gx_head_neck", {
    /**
     * "Thyroid palpation" is its own row in ADA Table 4.1, and the reason is
     * rec 4.6: autoimmune thyroid disease is the commonest autoimmune disorder
     * accompanying type 1 diabetes. The neck is felt at every annual review.
     *
     * THIS IS THE FINDING WHERE ADA AND UCG DIVERGE, and both are recorded on
     * the discrimination's citation rather than silently reconciled. ADA felt
     * the neck to catch autoimmune disease; UCG 2023 §8.1.5 leads the causes of
     * a goitre with iodine deficiency and says a goitre may accompany perfectly
     * normal thyroid function. Same lump, two prior probabilities — so the tier
     * below is moderate rather than strong, and the rationale says why.
     */
    code: "goitre",
    display: "Goitre or thyroid nodule",
    valueType: "boolean",
    citation: ADA_S4_EXAM,
    synonyms: ["Thyroid enlargement", "Thyroid swelling", "Thyroid nodule", "Neck swelling"],
    elicitation:
      "Stand behind the seated patient and palpate the gland with both hands while they take a sip of water and swallow — thyroid tissue rises with the swallow and a lymph node does not. Note the character beneath, and listen over a diffusely enlarged gland for a bruit.",
    discriminates: [
      {
        condition: "autoimmune_thyroid_disease",
        direction: "supports",
        strength: "moderate",
        rationale:
          "Thyroid palpation is its own row in ADA's evaluation table because autoimmune thyroid disease is the commonest autoimmune disorder travelling with type 1 diabetes, and ADA recommends screening for it. It argues more quietly in Uganda than that framing implies: UCG puts iodine deficiency at the head of the causes of a goitre, and says a goitre may sit on a perfectly normal thyroid.",
        citation: ADA_UCG_GOITRE,
      },
    ],
    importantNegative: {
      absenceRefutes: ["autoimmune_thyroid_disease"],
      caveat:
        "Feebly, and only about the GLAND. ADA's recommendation is to SCREEN — a blood test, not two hands — so a neck that feels normal leaves thyroid function entirely unexamined. It is a reason not to order an ultrasound. It is never a reason not to send the TSH.",
      citation: ADA_UCG_GOITRE,
    },
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
    synonyms: [
      "Oral thrush",
      "Periodontitis",
      "Gum disease",
      "Dental sepsis",
      "Angular stomatitis",
    ],
    elicitation:
      "Use a torch and a tongue depressor, and ask the patient to take any denture out first. Look at the palate, the buccal mucosa, the tongue and the gum margins; scrape a white plaque — candida comes off and leaves a raw base, and leukoplakia does not. Press along the gums for pus and tap the teeth for a tender one.",
    discriminates: [
      {
        condition: "dka",
        direction: "supports",
        strength: "weak",
        rationale:
          "A dental abscess is an infection, and infection is the commonest precipitant of ketoacidosis. Weak because this field bundles findings that are not precipitants at all — chronic periodontal disease is a reason for a dental referral, not for an admission — so a positive answer has to be read for which option was ticked.",
        citation: CRISES_2024_INFECTION,
      },
      {
        condition: "secondary_diabetes",
        direction: "supports",
        strength: "weak",
        rationale:
          "Three of the five answers here are WHO HIV staging conditions: persistent oral candidiasis and necrotising gingivitis or periodontitis at stage 3, angular cheilitis at stage 2. HIV and some antiretroviral regimens are a route INTO diabetes rather than a consequence of it, and UCG lists HIV and TB in the differential of diabetes itself — so an unexplained mouth is a prompt to test, at the cost of a torch.",
        citation: WHO_HIV_STAGING,
      },
    ],
    options: [
      { value: "candidiasis", display: "Oral candidiasis (thrush)" },
      { value: "angular_cheilitis", display: "Angular cheilitis" },
      { value: "periodontal", display: "Gingivitis or periodontal disease" },
      { value: "dental_abscess", display: "Dental abscess" },
      { value: "missing_loose_teeth", display: "Missing or loose teeth" },
    ],
  }),

  finding("gx_head_neck", {
    /**
     * Kept for one reason, and it is a local one. UCG puts HIV and TB in the
     * DIFFERENTIAL of diabetes, not among its complications, and enlarged nodes
     * are how that question arrives at the bedside. The answer also bears on
     * the HbA1c: `hiv_on_art` is already one of the conditions under which the
     * number cannot be read at face value.
     */
    code: "lymphadenopathy",
    display: "Lymphadenopathy",
    valueType: "boolean",
    citation: CONVENTION,
    synonyms: ["Enlarged lymph nodes", "Lymph node enlargement", "Glands"],
    elicitation:
      "Palpate the cervical and supraclavicular chains from behind with the patient's neck slightly flexed, then the axillae with the arm supported on your forearm, then the groins. Note size, and whether nodes are tender, matted or fixed. Record which groups beneath — generalised is a different finding from a single tender cervical node above an infected tooth.",
    discriminates: [
      {
        condition: "secondary_diabetes",
        direction: "supports",
        strength: "weak",
        rationale:
          "Persistent generalised lymphadenopathy is a WHO clinical stage 1 HIV condition, and people living with HIV are at higher risk of diabetes with some antiretroviral regimens raising it further. The node argues for testing, not for a diagnosis — and in this population tuberculosis and lymphoma sit behind the same finding.",
        citation: WHO_HIV_STAGING,
      },
    ],
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
     *
     * Only ONE link is recorded below, and the omission is the point. The
     * commonest competing explanations in this clinic — heart failure, a
     * calcium-channel blocker, a thiazolidinedione, chronic venous disease —
     * are not conditions this catalog ranks, and adding codes for them so that
     * the oedema could argue about them is precisely the drift ADR 0083 bounds
     * the condition list to prevent.
     *
     * No `importantNegative` either. Diabetic kidney disease is silent until it
     * is late, so dry ankles refute exactly nothing.
     */
    code: "peripheral_oedema",
    display: "Peripheral oedema",
    valueType: "boolean",
    citation: CONVENTION,
    synonyms: ["Pedal oedema", "Ankle swelling", "Dependent oedema", "Fluid overload"],
    elicitation:
      "Press firmly with the thumb over the medial malleolus or the front of the tibia, hold it for a slow count of ten, then take the thumb away and LOOK before deciding. Work upwards until the pitting stops, and in anyone who has been lying down press over the sacrum as well — that is where the fluid goes, and it can be the only place there is any.",
    discriminates: [
      {
        condition: "diabetic_kidney_disease",
        direction: "supports",
        strength: "weak",
        rationale:
          "ADA expects volume status in chronic kidney disease to be assessed by history, physical examination and weight — which is what this finding is. Weak, because oedema in a diabetes clinic has several ordinary explanations this catalog does not model; what it earns is an eGFR and a urine ACR sent today rather than at the next visit.",
        citation: ADA_S11_VOLUME,
      },
    ],
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
  prop("peripheral_oedema", {
    /**
     * The other scale, asked beside the first rather than instead of it.
     *
     * Kept as its own field because the two are ORTHOGONAL and a single answer
     * would have to throw one of them away. Sacral oedema is its own option and
     * not a step above the knee: it is where fluid collects in someone who has
     * been lying down, so it can be the only place there is any.
     */
    code: "oedema_distribution",
    display: "How far it reaches",
    valueType: "single_select",
    citation: OEDEMA_EXTENT,
    options: [
      { value: "feet_ankles", display: "Grade 1 — feet and ankles" },
      { value: "mid_calf", display: "Grade 2 — up to mid-calf" },
      { value: "knee_or_above", display: "Grade 3 — to the knee or above" },
      { value: "sacral", display: "Sacral — in someone lying down" },
      { value: "generalised", display: "Grade 4 — generalised (anasarca)" },
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
     *
     * It does NOT argue for the two crises, although a postural drop in a dry
     * patient is obviously hypovolaemia. Neither retrieved source says so —
     * UCG names supine hypotension and cardiovascular collapse under
     * ketoacidosis, not a postural drop — and the finding that carries volume
     * depletion in this segment is `dehydration`, which does cite it.
     */
    code: "postural_hypotension",
    display:
      "Postural hypotension — systolic falls ≥20 or diastolic ≥10 mmHg within 3 min standing",
    valueType: "boolean",
    synonyms: ["Orthostatic hypotension", "Postural drop", "Orthostasis"],
    elicitation:
      "Record the blood pressure with the patient lying down and settled, then stand them up and record it again within the three minutes the label specifies, keeping the cuff at heart level. Ask about dizziness at each reading: the symptom without the drop is a different finding, and the drop without the symptom still counts.",
    discriminates: [
      {
        condition: "autonomic_neuropathy",
        direction: "supports",
        strength: "strong",
        rationale:
          "ADA names orthostatic hypotension first among the signs of diabetic autonomic neuropathy and asks for orthostatic measures when indicated. It is the one sign of the syndrome that a clinic can produce with a cuff and three minutes.",
        citation: ADA_S12_AUTONOMIC,
      },
      {
        condition: "primary_adrenal_insufficiency",
        direction: "supports",
        strength: "weak",
        rationale:
          "Hypotension and dizziness are among the initial features of Addison disease, which travels with type 1 diabetes in autoimmune polyglandular syndrome. Weak and deliberately quiet — but a drop beside a falling insulin requirement and unexplained lows is one of the few prompts anyone gets before the crisis.",
        citation: ADDISON_STATPEARLS,
      },
    ],
    importantNegative: {
      absenceRefutes: ["autonomic_neuropathy"],
      caveat:
        "Only the CARDIOVASCULAR form, and only weakly. ADA names three signs — the orthostatic drop, a resting tachycardia and dry or cracked peripheral skin — so a normal standing blood pressure leaves the other two standing, and says nothing at all about the gastrointestinal, bladder or sudomotor forms. A drop can also be treated out of a patient by their own antihypertensive, and produced in one by a diuretic.",
      citation: ADA_S12_AUTONOMIC,
    },
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
