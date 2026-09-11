/**
 * The conditions the diabetes examination layer is allowed to RANK.
 *
 * ── Why there is a list at all ───────────────────────────────────────────────
 * This file IS the safety property of ADR 0083. `rankDifferential` can only
 * ever name a code that appears below, so the layer cannot drift into the
 * open-ended "what could this be?" that ADR 0081 removed: widening the
 * differential means adding an entry here, deliberately, with a source
 * attached. There is no other way in.
 *
 * Three things follow from the bound, and all three are the point.
 * `validateCatalog` REJECTS a `discriminates` or an `absenceRefutes` naming a
 * condition nobody defined, so a typo in a sibling file is a build failure
 * rather than a finding that silently argues for nothing. A mimic that lies
 * outside diabetes — salicylate toxicity, sepsis with a lactic acidosis — is
 * deliberately absent and is carried as a NAMED STRING on the rule instead, so
 * the engine never implies it reasons about something it has no criteria for.
 * And the entire differential is auditable by reading one file: every citation
 * below is declared here rather than imported, because a reader auditing what
 * this list ASSERTS should not have to open a second module to find out.
 *
 * ── Ranking is not diagnosing ────────────────────────────────────────────────
 * An entry here means only that a clinician would consider this and would act
 * differently on it. It does not mean the catalog can establish it.
 * `complication` is set ONLY where a `Complication` in complications.ts
 * establishes the same thing from its own cited criteria. FIVE entries set it,
 * across FOUR complication codes — `dka` (from both `dka` and
 * `euglycaemic_dka`, whose criteria are identical), `hhs`, `hypoglycaemia` and
 * `diabetic_kidney_disease`. The fifth Complication the catalog models,
 * `diabetic_foot`, is deliberately linked by NOTHING here; the FOOT block gives
 * the reason at each of the entries that might have looked like candidates.
 *
 * A SEVERITY variant never inherits its parent's link. `dka` is established at
 * any severity — a pH of 7.28 satisfies it — so pointing `severe_dka` at the
 * same complication would mark a row reading "severe" as established by a
 * criterion that says nothing about severity. Severity lives in that
 * complication's `staging`, which `RankedCondition` does not carry, and until
 * it can the honest state is an unset link. `severe_hypoglycaemia` is unset for
 * the same reason.
 *
 * ── Scope, and the only two reasons a band is ever set ───────────────────────
 * Diabetes in adolescents, adults and older adults (ADR 0083). `ageBands` is a
 * HARD filter — a condition outside the patient's band can never be ranked for
 * them — so it is set for exactly two reasons, and the entry says which:
 *
 *   1. DEFINITIONAL. The condition is anchored to a life stage by its own
 *      definition. Gestational diabetes is the only one: it is defined by
 *      pregnancy, so the band follows reproductive physiology.
 *
 *   2. SOURCE SCOPE, WHERE DIFFERENT NUMBERS EXIST OUTSIDE IT. The only figures
 *      this catalog holds were published for a stated age range AND a different
 *      published set applies outside it. The adult hyperglycaemic-crisis
 *      consensus states its scope as adults, and ISPAD's paediatric severity
 *      cut-points really are different numbers (severe = pH < 7.1 or
 *      bicarbonate < 5 in children, against pH < 7.0 or bicarbonate < 10 in
 *      adults), so the three entries whose only source is that adults-only
 *      consensus carry `["adolescent", "adult", "older_adult"]`.
 *
 *      The DIAGNOSTIC thresholds do not diverge that way — ISPAD's mild
 *      cut-point for children is the adult one, pH < 7.3 or bicarbonate < 18 —
 *      which is why `dka`, `hhs` and `hypoglycaemia` carry no band while the
 *      severity- and consensus-derived entries beside them do.
 *
 * A band is NEVER set on frequency. Rarer is not absent, and a condition banded
 * out of the group that has it is invisible to the one patient the ranking
 * existed for. Three entries lost their bands to that rule — `cerebral_oedema`,
 * `mody` and `malignant_otitis_externa` — and each says at its own site what the
 * source actually claims.
 *
 * The `adolescent` floor is the catalog's, not any source's. ADR 0083 populates
 * `adolescent`, `adult` and `older_adult` only, so an adolescent is already read
 * against adult thresholds everywhere in this catalog; that is a declared,
 * documented approximation rather than something this file invented, and it is
 * why `child` is the boundary the crisis entries exclude.
 *
 * ── One document, two labels: the hyperglycaemic-crisis provenance ───────────
 * ADA SOC 2026 Table 16.1 is an ADAPTED REPRINT of the ADA/EASD/JBDS/AACE/DTS
 * 2024 consensus report — the table says so in its own attribution line. The two
 * are ONE lineage and must never be read as two bodies agreeing, which is
 * exactly the trap sources.ts already names for ADA Table 12.1 and IWGDF. Every
 * constant on both sides therefore names the other in `version` and says which
 * reprints which; and the enumerated `standard` on the consensus side is a
 * five-society document squeezed into a slot with room for one, so the full
 * authorship — ADA, EASD, JBDS, AACE, DTS — is written out rather than collapsed
 * to the one label the enum has.
 *
 * Every citation here is `csoSigned: false`, as everywhere else in this
 * catalog. The list ships gated dark and the validator warns on each.
 */
import type { Citation, DifferentialCondition } from "@/lib/ncd/catalog/schema";

const RETRIEVED = "2026-09-08";

/* ── Acute metabolic: sources ────────────────────────────────────────────── */

/**
 * The ADA table the rest of this catalog's crisis thresholds are read from —
 * and the reprint notice that stops it being counted twice.
 *
 * Table 16.1 carries the line "Adapted from Umpierrez et al." beneath it. That
 * is the 2024 consensus report cited directly below. Where both appear in this
 * file they are the same evidence wearing two labels, and `version` on each says
 * so, so no audit trail can add them up.
 */
const ADA_S16_CRISES: Citation = {
  standard: "ADA",
  version:
    "Standards of Care in Diabetes—2026, Section 16, Table 16.1 — an ADAPTED REPRINT of the ADA/EASD/JBDS/AACE/DTS 2024 consensus report, NOT independent corroboration of it",
  title: "16. Diabetes Care in the Hospital: Standards of Care in Diabetes—2026",
  url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC12690180/",
  retrieved: RETRIEVED,
  csoSigned: false,
  quote:
    "Diagnostic criteria for DKA and HHS … Adapted from Umpierrez et al. … [DKA] β-Hydroxybutyrate concentration ≥3.0 mmol/L or urine ketone strip 2+ or greater … pH <7.3 and/or bicarbonate concentration <18 mmol/L … [HHS] Plasma glucose ≥600 mg/dL (33.3 mmol/L) … Calculated effective serum osmolality >300 mOsm/kg … β-Hydroxybutyrate concentration <3.0 mmol/L OR urine ketone strip less than 2+",
};

/**
 * The severity axis, and — on the same constant, because they are one claim —
 * the consensus's own statement of the population it was written for.
 *
 * Both sentences do work below. The first is what "severe" means; the second is
 * the whole justification for the age band the three crisis entries carry, and
 * keeping it here rather than in a comment is what makes that band auditable.
 */
const ADAEASD_2024_SEVERITY: Citation = {
  standard: "EASD",
  version:
    "ADA/EASD/JBDS/AACE/DTS consensus report, 2024, Table 2 and scope statement (Diabetologia 67(8):1455–1479) — reprinted in adapted form as ADA SOC 2026 Table 16.1, which is NOT independent corroboration of it",
  title:
    "Umpierrez GE, Davis GM, ElSayed NA, et al. Hyperglycaemic crises in adults with diabetes: a consensus report",
  url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC11343900/",
  retrieved: RETRIEVED,
  csoSigned: false,
  quote:
    "The severity of DKA is classified as mild, moderate or severe based on the magnitude of metabolic acidosis (blood pH, serum bicarbonate and ketone levels) and the presence of altered mental status, as presented in Table 2. … DKA classification and suggested level of care by severity: mild, moderate or severe … The objective of this consensus report is to provide up-to-date knowledge about the epidemiology, pathophysiology, clinical presentation, and recommendations for the diagnosis, treatment and prevention of DKA and HHS in adults.",
  needsCsoInput:
    "`StandardBody` has no slot for a five-society consensus, so this is filed under EASD and the full authorship — ADA, EASD, JBDS, AACE, DTS — is written into `version`. It is the SAME evidence as ADA SOC 2026 Table 16.1, which reprints it in adapted form; the two may never be counted as two agreeing bodies. CSO to confirm the labelling.",
};

/** Euglycaemic DKA, defined by the glucose the clinician is reassured by. */
const ADAEASD_2024_EUGLYCAEMIC: Citation = {
  standard: "EASD",
  version:
    "ADA/EASD/JBDS/AACE/DTS consensus report, 2024 (Diabetologia 67(8):1455–1479) — reprinted in adapted form as ADA SOC 2026 Table 16.1",
  title:
    "Umpierrez GE, Davis GM, ElSayed NA, et al. Hyperglycaemic crises in adults with diabetes: a consensus report",
  url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC11343900/",
  retrieved: RETRIEVED,
  csoSigned: false,
  quote:
    "Euglycaemic DKA, which is defined as plasma glucose levels <11.1 mmol/l (200 mg/dl) in the presence of ketosis and metabolic acidosis criteria of DKA",
};

/**
 * The overlap, and the figures that used to sit in a comment with no source
 * behind them. Both sentences are the consensus's own.
 */
const ADAEASD_2024_MIXED: Citation = {
  standard: "EASD",
  version:
    "ADA/EASD/JBDS/AACE/DTS consensus report, 2024 (Diabetologia 67(8):1455–1479) — reprinted in adapted form as ADA SOC 2026 Table 16.1",
  title:
    "Umpierrez GE, Davis GM, ElSayed NA, et al. Hyperglycaemic crises in adults with diabetes: a consensus report",
  url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC11343900/",
  retrieved: RETRIEVED,
  csoSigned: false,
  quote:
    "Clinical overlap between DKA and HHS has been reported in more than one-third of people with hyperglycaemic crises. … In a US-based study, 38% of hospital admissions for hyperglycaemic crises were for DKA, 35% for HHS and 27% for mixed DKA/HHS.",
};

/**
 * Paediatric DKA. RETRIEVED IN FULL — the chapter is a free, unauthenticated
 * PDF one link from the resource page this URL points at, and an earlier version
 * of this file asserted a publisher paywall that does not exist and used it to
 * excuse an unverified entry. The claim is deleted and everything quoted below
 * is read from the chapter itself.
 *
 * It carries two things and nothing else. The paediatric severity cut-points,
 * which are genuinely DIFFERENT NUMBERS from the adult ones and are therefore
 * the whole reason the three crisis entries exclude `child` rather than being
 * left open. And the incidence and mortality of clinically overt DKA-related
 * cerebral injury, which is what the entry it cites is for.
 *
 * ISPAD names the entity "cerebral injury"; the display keeps the adult
 * consensus's "cerebral oedema" because that is the vocabulary the rest of this
 * catalog is written in, and the synonym is recorded here rather than lost.
 */
const ISPAD_2022_DKA: Citation = {
  standard: "local",
  version: "ISPAD Clinical Practice Consensus Guidelines 2022, Chapter 11, sections 2 and 8.2",
  title:
    "Glaser N, Fritsch M, Priyambada L, et al. ISPAD Clinical Practice Consensus Guidelines 2022: Diabetic ketoacidosis and hyperglycemic hyperosmolar state. Pediatr Diabetes 2022;23:835–856",
  url: "https://www.ispad.org/resource/chapter-11-diabetic-ketoacidosis.html",
  retrieved: RETRIEVED,
  csoSigned: false,
  quote:
    "The severity of DKA is categorized by the degree of acidosis … Mild: venous pH < 7.3 or serum bicarbonate <18 mmol/L … Moderate: pH < 7.2 or serum bicarbonate <10 mmol/L … Severe: pH < 7.1 or serum bicarbonate <5 mmol/L … The incidence of clinically overt DKA-related cerebral injury is 0.5%–0.9% and the mortality rate is 21%–24%.",
  needsCsoInput:
    "ISPAD is not one of the enumerated standard bodies, hence `local`. It is a PAEDIATRIC chapter and says nothing about adults, so it is NOT the source of the entry's scope: `cerebral_oedema` is deliberately left unbanded on the strength of the adult consensus at https://pmc.ncbi.nlm.nih.gov/articles/PMC11343900/, which states \"Cerebral oedema is rare in adults. The underlying cause is not fully understood but may reflect osmotic changes, hypoperfusion and/or inflammatory responses.\" Rare is not absent, and `ageBands` cannot express the difference. Separately, the chapter's bedside criteria set for cerebral injury (its diagnostic / major / minor criteria, with the sensitivity and false-positive rate attached) is deliberately NOT encoded anywhere in this catalog: paediatric capture is deferred by ADR 0083, and a criteria set validated in children should not be applied to the adult bands this catalog renders. CSO to decide whether paediatric DKA content is in scope at all, and to ratify the unbanded scope of this entry.",
};

/** Hypoglycaemia, at the ADA level the catalog actually reasons in. */
const ADA_S6_HYPO_LEVELS: Citation = {
  standard: "ADA",
  version: "Standards of Care in Diabetes—2026, Section 6, Table 6.4",
  title:
    "6. Glycemic Goals, Hypoglycemia, and Hyperglycemic Crises: Standards of Care in Diabetes—2026",
  url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC12690178/",
  retrieved: RETRIEVED,
  csoSigned: false,
  quote:
    "Level 1: Glucose <70 mg/dL (<3.9 mmol/L) and ≥54 mg/dL (≥3.0 mmol/L) … Level 2: Glucose <54 mg/dL (<3.0 mmol/L) … Level 3: A severe event characterized by altered mental and/or physical status requiring assistance for treatment of hypoglycemia, irrespective of glucose level",
  needsCsoInput:
    "complications.ts currently cites its `hypo_level1/2/3` criteria to the Section 16 crisis table, which defines DKA and HHS and says nothing about hypoglycaemia. This constant is the correct locus and the conditions below use it; realigning complications.ts is a separate, reviewable change. CSO to note the mismatch.",
};

/** Impaired awareness — a state, not an event, and screened for annually. */
const ADA_S6_HYPO_UNAWARE: Citation = {
  standard: "ADA",
  version: "Standards of Care in Diabetes—2026, Section 6, rec 6.11",
  title:
    "6. Glycemic Goals, Hypoglycemia, and Hyperglycemic Crises: Standards of Care in Diabetes—2026",
  url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC12690178/",
  retrieved: RETRIEVED,
  csoSigned: false,
  quote:
    "6.11 Screen individuals at risk for hypoglycemia for impaired hypoglycemia awareness at least annually and when clinically appropriate. E Refer to a trained health care professional for evidence-based intervention to improve hypoglycemia awareness. A",
};

/* ── Aetiological type: sources ──────────────────────────────────────────── */

/**
 * The classification itself. ADA's own one-line definitions of each type are
 * quoted rather than paraphrased because the wording carries the discriminator:
 * type 1 is *autoimmune*, type 2 is *nonautoimmune*, and no examination finding
 * settles which — which is why these rank rather than diagnose.
 */
const ADA_S2_CLASSES: Citation = {
  standard: "ADA",
  version: "Standards of Care in Diabetes—2026, Section 2, Classification",
  title: "2. Diagnosis and Classification of Diabetes: Standards of Care in Diabetes—2026",
  url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC12690183/",
  retrieved: RETRIEVED,
  csoSigned: false,
  quote:
    "Type 1 diabetes (due to autoimmune β-cell destruction, usually leading to absolute insulin deficiency, including latent autoimmune diabetes in adults) 2. Type 2 diabetes (due to a nonautoimmune progressive loss of adequate β-cell insulin secretion, frequently on the background of insulin resistance)",
};

/* Removed with `ketosis_prone_type_2_diabetes`: ADA_S2_KETOSIS_PRONE, which
 * cited only that row. The presentation it quoted is still modelled — by the
 * Classification `ketosis_prone_type_2` in diagnosis.ts, on WHO 2019. */

/** The one place ADA says, in a recommendation, when to stop assuming type 1 or 2. */
const ADA_S2_MONOGENIC: Citation = {
  standard: "ADA",
  version: "Standards of Care in Diabetes—2026, Section 2, Monogenic Diabetes Syndromes, rec 2.29b",
  title: "2. Diagnosis and Classification of Diabetes: Standards of Care in Diabetes—2026",
  url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC12690183/",
  retrieved: RETRIEVED,
  csoSigned: false,
  quote:
    "Children and young adults who do not have typical characteristics of type 1 or type 2 diabetes and have a family history of diabetes in successive generations (suggestive of an autosomal-dominant pattern of inheritance) should have genetic testing for maturity-onset diabetes of the young (MODY). A",
};

/** Gestational diabetes, defined by WHEN it is found rather than by a mechanism. */
const ADA_S2_GDM: Citation = {
  standard: "ADA",
  version: "Standards of Care in Diabetes—2026, Section 2, Classification",
  title: "2. Diagnosis and Classification of Diabetes: Standards of Care in Diabetes—2026",
  url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC12690183/",
  retrieved: RETRIEVED,
  csoSigned: false,
  quote:
    "Gestational diabetes mellitus (diabetes diagnosed in the second or third trimester of pregnancy that was not clearly overt diabetes prior to gestation or other types of diabetes occurring throughout pregnancy, such as type 1 diabetes)",
};

/** Steroid diabetes — the one secondary cause with a whole habitus to see. */
const ADA_S2_GLUCOCORTICOID: Citation = {
  standard: "ADA",
  version: "Standards of Care in Diabetes—2026, Section 2",
  title: "2. Diagnosis and Classification of Diabetes: Standards of Care in Diabetes—2026",
  url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC12690183/",
  retrieved: RETRIEVED,
  csoSigned: false,
  quote:
    "The prevalence of glucocorticoid-induced diabetes (hyperglycemia in the absence of preexisting diabetes) depends on the drug's half-life, dose, and frequency of administration as well as the duration of treatment.",
};

/* Removed with `pancreatogenic_diabetes`: ADA_S2_PANCREATOGENIC, which cited
 * only that row. The quote it carried is the reason the row cannot be reached —
 * ADA's definition requires exocrine pancreatic insufficiency, and no feature
 * in this catalog records it. Restore both together, not one without the other. */

/**
 * HIV and antiretroviral therapy. ADA writes a screening recommendation for it,
 * which is more than it does for most of the secondary causes — and in this
 * catalog's setting it is the commonest of them by a wide margin.
 */
const ADA_S2_HIV: Citation = {
  standard: "ADA",
  version: "Standards of Care in Diabetes—2026, Section 2, rec 2.17",
  title: "2. Diagnosis and Classification of Diabetes: Standards of Care in Diabetes—2026",
  url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC12690183/",
  retrieved: RETRIEVED,
  csoSigned: false,
  quote:
    "2.17 People with HIV should be screened for diabetes and prediabetes with an FPG test before starting antiretroviral therapy, at the time of switching antiretroviral therapy, and 3–6 months after starting or switching antiretroviral therapy.",
};

/**
 * The Ugandan text, and the vocabulary a clinician using this tool was taught.
 *
 * TWO sections are named in `version` and both are quoted, because the prose
 * that used to sit on this constant made a claim about UCG's crisis definitions
 * while pointing only at the diabetes entry. §8.1.3 (p 471) is where the
 * residual class "secondary diabetes" is named; §8.1.4 (pp 478–480) is where
 * DKA and HHS are defined.
 *
 * Fetched for the divergence it carries rather than for corroboration. UCG
 * defines DKA and HHS CLINICALLY — ketosis, acidosis and hyperglycaemia, deep
 * acidotic breathing, an acetone smell, urine ketones, a slower onset for HHS —
 * and states no biochemical thresholds at all, where the ADA/EASD 2024 consensus
 * this catalog runs on states several. Neither is wrong: a health centre with a
 * urine strip and no blood gas cannot apply the consensus, and the consensus is
 * not written for it. The engine already handles that through
 * `Assessed.unavailable` and the district site profile; it is noted here so
 * nobody later reads the ADA thresholds as the only definition in play.
 */
const UCG_2023_DM: Citation = {
  standard: "local",
  version: "Uganda Clinical Guidelines 2023, sections 8.1.3 (p 471) and 8.1.4 (pp 478–480)",
  title:
    "Uganda Clinical Guidelines 2023 — National Guidelines on the Management of Common Conditions (Ministry of Health, Uganda)",
  url: "https://library.health.go.ug/sites/default/files/resources/Uganda%20Clinical%20Guidelines%202023.pdf",
  retrieved: RETRIEVED,
  csoSigned: false,
  quote:
    "Secondary diabetes: due to other identifiable causes, e.g., Cushing's syndrome, chronic pancreatitis, etc. … DKA is characterized by ketosis, acidosis, and hyperglycaemia. It is more common in type 1 diabetes. … HHS is characterized by hyperglycaemia, severe dehydration and hypovolemia, but no ketosis and acidosis. It is more common in type 2 diabetes.",
};

/* ── The foot: sources ───────────────────────────────────────────────────── */

/**
 * Foot infection, and the grading the whole foot pathway turns on. The full
 * Table 1 is quoted because it carries three of this file's foot entries at
 * once: what counts as infected, what makes it severe, and the "(O)" suffix
 * that separates bone from soft tissue.
 */
const IWGDF_IDSA_2023_INFECTION: Citation = {
  standard: "IWGDF",
  version: "IWGDF/IDSA 2023 Infection Guideline, Table 1",
  title:
    "Guidelines on the diagnosis and treatment of foot infection in persons with diabetes (IWGDF/IDSA 2023)",
  url: "https://iwgdfguidelines.org/wp-content/uploads/2023/07/IWGDF-2023-04-Infection-Guideline.pdf",
  retrieved: RETRIEVED,
  csoSigned: false,
  quote:
    "Infected: At least two of these items are present: Local swelling or induration; Erythema > 0.5 but < 2 cm around the wound; Local tenderness or pain; Local increased warmth; Purulent discharge. And, no other cause of an inflammatory response of the skin (e.g., trauma, gout, acute Charcot neuro-arthropathy, fracture, thrombosis, or venous stasis) — 2 / Mild",
};

/** Grade 4: the boundary a nurse can cross with a thermometer and a watch. */
const IWGDF_IDSA_2023_SEVERE: Citation = {
  standard: "IWGDF",
  version: "IWGDF/IDSA 2023 Infection Guideline, Table 1, grade 4",
  title:
    "Guidelines on the diagnosis and treatment of foot infection in persons with diabetes (IWGDF/IDSA 2023)",
  url: "https://iwgdfguidelines.org/wp-content/uploads/2023/07/IWGDF-2023-04-Infection-Guideline.pdf",
  retrieved: RETRIEVED,
  csoSigned: false,
  quote:
    "Any foot infection with associated systemic manifestations (of the systemic inflammatory response syndrome [SIRS]), as manifested by ≥ 2 of the following: temperature, > 38°C or < 36°C; heart rate, > 90 beats/min; respiratory rate, >20 breaths/min, or PaCO2 < 4.3 kPa (32 mmHg); white blood cell count >12,000/mm3, or < 4G/L, or > 10% immature (band) forms — 4 / Severe",
  needsCsoInput:
    'The CODE reads `diabetic_foot_sepsis` while the criterion it names is SIRS, which Sepsis-3 (2016) abandoned as a definition of sepsis. IWGDF states it kept SIRS deliberately — "there are no data to support changing from using the systemic inflammatory response syndrome (SIRS) that is part of the IWGDF/IDSA classification to any other classification for DFIs" — so the criterion is right and the name is the thing that overreaches. The code is referenced by exam-foot.ts and is NOT renamed here; the display string says "severe (systemically unwell)" rather than septic. CSO to decide whether the code should be renamed in a change that updates every reference.',
};

/**
 * Bone. IWGDF splits osteomyelitis out of the grade with an "(O)" suffix
 * precisely because it changes what happens — weeks of antibiotics, or a
 * resection — and the test that raises it is a blunt probe, which is the kind of
 * finding this examination layer exists to act on.
 */
const IWGDF_IDSA_2023_OSTEOMYELITIS: Citation = {
  standard: "IWGDF",
  version: 'IWGDF/IDSA 2023 Infection Guideline, Table 1 (the "(O)" suffix) and Recommendation 7',
  title:
    "Guidelines on the diagnosis and treatment of foot infection in persons with diabetes (IWGDF/IDSA 2023)",
  url: "https://iwgdfguidelines.org/wp-content/uploads/2023/07/IWGDF-2023-04-Infection-Guideline.pdf",
  retrieved: RETRIEVED,
  csoSigned: false,
  quote:
    'Because of the important diagnostic, therapeutic, and prognostic implications of osteomyelitis, we separate it out by indicating the presence of bone infection with "(O)" after the grade number (3 or 4) (see Table 1). … Recommendation 7: In a person with diabetes, consider using a combination of probe-to-bone test, plain X-rays, and erythrocyte sedimentation rate, or C-reactive protein, or procalcitonin as the initial studies to diagnose osteomyelitis of the foot. (Conditional; Low)',
};

/** And what a severe or complicated infection obliges someone to do. */
const IWGDF_IDSA_2023_SURGERY: Citation = {
  standard: "IWGDF",
  version: "IWGDF/IDSA 2023 Infection Guideline, Recommendation 18",
  title:
    "Guidelines on the diagnosis and treatment of foot infection in persons with diabetes (IWGDF/IDSA 2023)",
  url: "https://iwgdfguidelines.org/wp-content/uploads/2023/07/IWGDF-2023-04-Infection-Guideline.pdf",
  retrieved: RETRIEVED,
  csoSigned: false,
  quote:
    "Recommendation 18: Urgent surgical consultation should be obtained in cases of severe infection or moderate diabetes-related foot infection complicated by extensive gangrene, necrotizing infection, signs suggesting deep (below the fascia) abscess, compartment syndrome, or severe lower limb ischaemia.",
  needsCsoInput:
    "Cited on `necrotising_soft_tissue_infection` for the trigger it names, not for a case definition — this guideline is about the FOOT, and no society publishes a site-agnostic bedside definition of necrotising soft-tissue infection that this catalog could apply to a thigh or an abdominal wall. Nothing here asserts one. CSO to ratify the scope of that entry.",
};

/**
 * Peripheral artery disease, cited to the intersocietal guideline under its FULL
 * published title. The scope clause — "and a foot ulcer" — is part of the title
 * and is kept, because most of the document's prognosis and treatment
 * recommendations are ulcer-specific even though its diagnostic ones are not.
 * ESVS and SVS are co-authors; `StandardBody` has no slot for them, so they are
 * written into `version` rather than dropped.
 */
const IWGDF_ESVS_SVS_2023_PAD: Citation = {
  standard: "IWGDF",
  version: "IWGDF/ESVS/SVS 2023 PAD Guideline (co-authored by IWGDF, ESVS and SVS)",
  title:
    "The intersocietal IWGDF, ESVS, SVS guidelines on peripheral artery disease in patients with diabetes mellitus and a foot ulcer",
  url: "https://iwgdfguidelines.org/wp-content/uploads/2023/07/IWGDF-2023-05-PAD-Guideline.pdf",
  retrieved: RETRIEVED,
  csoSigned: false,
  quote:
    "Bedside testing: any non-invasive test assessing for PAD in the lower limb using a measure of blood flow that could be conducted at the bedside.",
};

/** The limb that is being lost now, as against the one that claudicates. */
const IWGDF_ESVS_SVS_2023_CLTI: Citation = {
  standard: "IWGDF",
  version:
    "IWGDF/ESVS/SVS 2023 PAD Guideline, terminology and Recommendation 13 (co-authored by IWGDF, ESVS and SVS)",
  title:
    "The intersocietal IWGDF, ESVS, SVS guidelines on peripheral artery disease in patients with diabetes mellitus and a foot ulcer",
  url: "https://iwgdfguidelines.org/wp-content/uploads/2023/07/IWGDF-2023-05-PAD-Guideline.pdf",
  retrieved: RETRIEVED,
  csoSigned: false,
  quote:
    "Chronic Limb Threatening Ischaemia: a clinical syndrome defined by the presence of peripheral artery disease in combination with rest pain, gangrene or foot ulcer of at least 2 weeks duration. Venous, embolic, non-atherosclerotic and traumatic aetiologies are excluded. … Recommendation 13: In a person with diabetes, peripheral artery disease, a foot ulcer, and severe ischaemia i.e. an ankle-brachial index <0.4, ankle pressure <50mmHg, toe pressure <30mmHg or transcutaneous oxygen pressure <30mmHg or monophasic or absent pedal Doppler waveforms, urgently consult a vascular specialist regarding possible revascularisation.",
};

/**
 * The hot, swollen, red foot with no ulcer. Ranked separately from infection
 * because the two look alike and the treatments diverge completely — one gets
 * antibiotics, the other gets taken off the foot entirely.
 */
const ADA_S12_CHARCOT: Citation = {
  standard: "ADA",
  version: "Standards of Care in Diabetes—2026, Section 12, Foot Care — Treatment",
  title: "12. Retinopathy, Neuropathy, and Foot Care: Standards of Care in Diabetes—2026",
  url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC12690177/",
  retrieved: RETRIEVED,
  csoSigned: false,
  quote:
    "Special consideration should be given to individuals with neuropathy who present with a warm, swollen, red foot with or without a history of trauma and without an open ulceration. These individuals require a thorough workup for possible Charcot neuroarthropathy … These individuals require total non–weight-bearing and urgent referral to a foot care specialist for further management.",
};

/** Distal symmetric polyneuropathy — the finding the foot risk category is built on. */
const ADA_S12_NEUROPATHY: Citation = {
  standard: "ADA",
  version: "Standards of Care in Diabetes—2026, Section 12, rec 12.18",
  title: "12. Retinopathy, Neuropathy, and Foot Care: Standards of Care in Diabetes—2026",
  url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC12690177/",
  retrieved: RETRIEVED,
  csoSigned: false,
  quote:
    "12.18 Assessment for distal symmetric polyneuropathy should include a careful history and assessment of either temperature or pinprick sensation (small-fiber function) and vibration sensation using a 128-Hz tuning fork (large-fiber function). All people with diabetes should have annual 10-g monofilament testing to identify feet at risk for ulceration and amputation. B",
};

/* ── Chronic complications: sources ──────────────────────────────────────── */

/** The eye finding that is an appointment this week rather than a note. */
const ADA_S12_RETINOPATHY: Citation = {
  standard: "ADA",
  version: "Standards of Care in Diabetes—2026, Section 12, rec 12.9",
  title: "12. Retinopathy, Neuropathy, and Foot Care: Standards of Care in Diabetes—2026",
  url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC12690177/",
  retrieved: RETRIEVED,
  csoSigned: false,
  quote:
    "12.9 Promptly refer individuals with any level of diabetic macular edema, moderate or worse nonproliferative diabetic retinopathy (a precursor of proliferative diabetic retinopathy [PDR]), or any PDR to an ophthalmologist who is knowledgeable and experienced in the management of diabetic retinopathy. A",
};

/** Autonomic neuropathy, listed by its manifestations because that is how it is found. */
const ADA_S12_AUTONOMIC: Citation = {
  standard: "ADA",
  version: "Standards of Care in Diabetes—2026, Section 12, Diabetic Autonomic Neuropathy",
  title: "12. Retinopathy, Neuropathy, and Foot Care: Standards of Care in Diabetes—2026",
  url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC12690177/",
  retrieved: RETRIEVED,
  csoSigned: false,
  quote:
    "Major clinical manifestations of diabetic autonomic neuropathy include resting tachycardia, orthostatic hypotension, gastroparesis, constipation, diarrhea, fecal incontinence, erectile dysfunction, neurogenic bladder, and sudomotor dysfunction with either increased or decreased sweating.",
};

/** Gastroparesis specifically, because it is the one that wrecks glycaemic control. */
const ADA_S12_GASTROPARESIS: Citation = {
  standard: "ADA",
  version: "Standards of Care in Diabetes—2026, Section 12, Gastrointestinal Neuropathies",
  title: "12. Retinopathy, Neuropathy, and Foot Care: Standards of Care in Diabetes—2026",
  url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC12690177/",
  retrieved: RETRIEVED,
  csoSigned: false,
  quote:
    "Gastroparesis should be suspected in individuals with erratic glycemic management or with upper gastrointestinal symptoms without another identified cause.",
};

/** Lipohypertrophy — visible, palpable, and an explanation for erratic control. */
const ADA_S9_INJECTION: Citation = {
  standard: "ADA",
  version: "Standards of Care in Diabetes—2026, Section 9, Insulin Administration Technique",
  title: "9. Pharmacologic Approaches to Glycemic Treatment: Standards of Care in Diabetes—2026",
  url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC12690185/",
  retrieved: RETRIEVED,
  csoSigned: false,
  quote:
    "Lipohypertrophy appears as soft, smooth raised areas several centimeters in breadth and can contribute to erratic insulin absorption, increased glycemic variability, and unexplained hypoglycemic episodes.",
};

/**
 * Diabetic kidney disease, cited to a source that defines THAT entity.
 *
 * KDIGO 2024 defines CKD and its G/A staging and is where complications.ts
 * stages this — correctly, because staging is what it publishes. What it does
 * not do is say what makes a kidney disease diabetic, which is what an entry in
 * a differential asserts, so the entity is cited to ADA Section 11 instead.
 */
const ADA_S11_DKD: Citation = {
  standard: "ADA",
  version:
    "Standards of Care in Diabetes—2026, Section 11, Diagnosis of Chronic Kidney Disease in People With Diabetes",
  title: "11. Chronic Kidney Disease and Risk Management: Standards of Care in Diabetes—2026",
  url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC12690176/",
  retrieved: RETRIEVED,
  csoSigned: false,
  quote:
    "CKD in people with diabetes is usually a clinical diagnosis made based on the presence of albuminuria and/or reduced eGFR in the absence of signs or symptoms of other primary causes of kidney damage. … The typical presentation of CKD in people with diabetes is considered to include long-standing duration of diabetes, retinopathy, albuminuria without gross hematuria, and gradually progressive loss of eGFR.",
};

/** And the sentence that says when the kidney disease is something else. */
const ADA_S11_NON_DIABETIC: Citation = {
  standard: "ADA",
  version:
    'Standards of Care in Diabetes—2026, Section 11, Table 11.1 ("Reasons to consider nondiabetic kidney diseases in a person with chronic kidney disease and diabetes")',
  title: "11. Chronic Kidney Disease and Risk Management: Standards of Care in Diabetes—2026",
  url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC12690176/",
  retrieved: RETRIEVED,
  csoSigned: false,
  quote:
    "An active urinary sediment (containing red or white blood cells or cellular casts), rapidly increasing albuminuria or total proteinuria, the presence of nephrotic syndrome, rapidly decreasing eGFR, or the absence of retinopathy (particularly in type 1 diabetes) suggests alternative or additional causes of kidney disease.",
};

/* ── Autoimmune: sources ─────────────────────────────────────────────────── */

/** The two autoimmune conditions ADA writes a screening recommendation for. */
const ADA_S4_AUTOIMMUNE: Citation = {
  standard: "ADA",
  version: "Standards of Care in Diabetes—2026, Section 4, Autoimmune Diseases, recs 4.6–4.7",
  title:
    "4. Comprehensive Medical Evaluation and Assessment of Comorbidities: Standards of Care in Diabetes—2026",
  url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC12690184/",
  retrieved: RETRIEVED,
  csoSigned: false,
  quote:
    "4.6 Screen people with type 1 diabetes for autoimmune thyroid disease soon after diagnosis and thereafter at repeated intervals if clinically indicated. B 4.7 Adults with type 1 diabetes should be screened for celiac disease in the presence of gastrointestinal symptoms, signs, laboratory manifestations, or clinical suspicion suggestive of celiac disease. B",
};

/** And the ones it names as associations without recommending a screen. */
const ADA_S4_OTHER_AUTOIMMUNE: Citation = {
  standard: "ADA",
  version: "Standards of Care in Diabetes—2026, Section 4, Autoimmune Diseases",
  title:
    "4. Comprehensive Medical Evaluation and Assessment of Comorbidities: Standards of Care in Diabetes—2026",
  url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC12690184/",
  retrieved: RETRIEVED,
  csoSigned: false,
  quote:
    "Other autoimmune conditions associated with type 1 diabetes include autoimmune liver disease, primary adrenal insufficiency (Addison disease), vitiligo, collagen vascular diseases, and myasthenia gravis.",
  needsCsoInput:
    "ADA names primary adrenal insufficiency as an association and issues NO screening recommendation for it. The entry exists so that a recorded finding — falling insulin requirement, unexplained recurrent hypoglycaemia, postural drop, hyperpigmentation — can raise it; it is not the catalog asserting that anyone should be screened. CSO to confirm that framing.",
};

/* ── Severe infections: sources ──────────────────────────────────────────── */

/**
 * Mucormycosis. Cited for two things: the sentence that governs whether this
 * entry belongs in a Ugandan catalog at all, and the guideline's OWN list of
 * the rhino-orbital signs. An earlier version of this file described a black
 * eschar on the palate in an acidotic patient; the guideline says neither. Its
 * eschar is a CUTANEOUS lesion, its palatal disease is a fistula developing
 * into necrosis, and it does not mention acidosis. The comment on the entry now
 * says what the source says.
 */
const ECMM_2019_MUCORMYCOSIS: Citation = {
  standard: "local",
  version:
    "Lancet Infect Dis, published online 4 November 2019 (doi 10.1016/S1473-3099(19)30312-3)",
  title:
    "Cornely OA, Alastruey-Izquierdo A, Arenz D, et al. Global guideline for the diagnosis and management of mucormycosis: an initiative of the ECMM in cooperation with the MSG ERC",
  url: "https://www.ecmm.info/wp-content/uploads/Cornely-TLID-2019-Global-guideline-for-the-diagnosis-and-management-of-mucormycosis-an-initiative-of-the-ECMM-in-cooperation-with-theMSG-ERC_OC.pdf",
  retrieved: RETRIEVED,
  csoSigned: false,
  quote:
    "diabetes continues to represent the predominant risk factor for mucormycosis in settings where health-care access for diabetes management is more limited. … Unilateral facial oedema, proptosis, and palatal or palpebral fistula developing into necrosis may be present … In diabetic patients with facial pain, sinusitis, proptosis, ophthalmoplegia, or newly diagnosed amaurosis, or both, cranial CT or MRI is strongly recommended to determine if sinusitis is present.",
  needsCsoInput:
    "ECMM/MSG-ERC is not one of the enumerated standard bodies, hence `local`. The guideline states the association, the rhino-orbital pattern and the signs that should trigger imaging; it does NOT supply a bedside case definition, and none is asserted here. CSO to ratify.",
};

/**
 * The three severe infections below are cited to a tertiary reference work
 * rather than a guideline, and each says so. That is the honest position: the
 * associations are not disputed, but no society publishes a bedside definition
 * for them, and inventing one would be worse than naming the source.
 *
 * StatPearls chapters are revised continuously, so each `version` carries the
 * chapter's own printed "Last Update" date — without it the field cannot pin the
 * text that was actually read, which is what the schema asks of it — and each
 * names its authors.
 */
const NOE_STATPEARLS: Citation = {
  standard: "local",
  version: "StatPearls, Necrotizing (Malignant) Otitis Externa, NBK556138, last updated 2023-10-29",
  title: "Hohman MH, Kelley C. Necrotizing (Malignant) Otitis Externa — StatPearls, NCBI Bookshelf",
  url: "https://www.ncbi.nlm.nih.gov/books/NBK556138/",
  retrieved: RETRIEVED,
  csoSigned: false,
  quote:
    "Although NOE has been documented across all age groups, it is most prevalent among individuals older than 60 … Patients with immunosuppression due to HIV or other non-diabetic factors are more likely to develop NOE at a younger age than those with diabetes. … For patients with Pseudomonas NOE, the presence of granulation tissue at the bony-cartilaginous junction of the external auditory canal is considered pathognomonic.",
  needsCsoInput:
    "A tertiary reference work, not a guideline. Cited for the association with diabetes, for the age distribution and for the description of the sign; no incidence, threshold or case definition from it drives anything. CSO to ratify.",
};

const EPN_STATPEARLS: Citation = {
  standard: "local",
  version: "StatPearls, Emphysematous Pyelonephritis, NBK599505, last updated 2024-01-11",
  title: "Sherchan R, Hamill R. Emphysematous Pyelonephritis — StatPearls, NCBI Bookshelf",
  url: "https://www.ncbi.nlm.nih.gov/books/NBK599505/",
  retrieved: RETRIEVED,
  csoSigned: false,
  quote:
    "EPN may be clinically indistinguishable from severe, acute pyelonephritis based on clinical presentation alone.",
  needsCsoInput:
    "A tertiary reference work, not a guideline. The quoted point is the reason the entry exists — examination CANNOT separate this from pyelonephritis, so the layer may only raise it for imaging and must never appear to settle it. Acute pyelonephritis itself is NOT rankable here (it is not a diabetes condition and this catalog holds no criteria for it), so it is carried as a named `mimicsToExclude` string on the rules that reach this code. The prevalence figures in that chapter are deliberately not asserted. CSO to ratify.",
};

const FOURNIER_STATPEARLS: Citation = {
  standard: "local",
  version: "StatPearls, Fournier Gangrene, NBK549821, last updated 2025-02-15",
  title: "Leslie SW, Foreman J. Fournier Gangrene — StatPearls, NCBI Bookshelf",
  url: "https://www.ncbi.nlm.nih.gov/books/NBK549821/",
  retrieved: RETRIEVED,
  csoSigned: false,
  quote:
    "Fournier gangrene is a rare and rapidly progressive form of necrotizing fasciitis that affects the deep and superficial tissues of the perineal, anal, scrotal, and genital regions. … While antibiotic therapy and resuscitation are critical, they should not delay emergent, early, and aggressive surgical exploration and debridement, which remain the definitive and essential treatment for Fournier gangrene.",
  needsCsoInput:
    "A tertiary reference work, not a guideline. Cited for the definition and for the fact that treatment is surgical and immediate; both sentences are quoted whole rather than trimmed to their clauses. The reported association with SGLT2 inhibitors is described in that chapter as controversial and is NOT asserted here; the therapy-flag layer, not this list, is where such an association would belong once a regulator or society states it. CSO to ratify.",
};

/* ── Acute metabolic ─────────────────────────────────────────────────────── */

const ACUTE: DifferentialCondition[] = [
  {
    /**
     * The `Complication` of the same name establishes this from ketones and
     * acid-base, which a district clinic may not have. Ranking it is what that
     * clinic can still do — and the two must not be read as one another: DKA can
     * sit at the top of the list while `dka` remains `insufficient`.
     *
     * No band. The DIAGNOSTIC thresholds agree across the sources this catalog
     * holds — ISPAD's mild cut-point for children is the adult one, pH < 7.3 or
     * bicarbonate < 18 — so nothing about establishing DKA is adult-only, and
     * the entry that a health centre would reach first is the entry with no age
     * filter on it.
     */
    code: "dka",
    display: "Diabetic ketoacidosis",
    complication: "dka",
    citation: ADA_S16_CRISES,
  },
  {
    /**
     * A separate rankable condition rather than a stage of the one above,
     * because the action differs rather than intensifies: severe DKA is an ICU
     * decision, and a list that could only ever say "DKA" would leave the
     * examination unable to say which DKA.
     *
     * `complication` is deliberately UNSET. The `dka` complication is satisfied
     * by any DKA at all, so linking here would mark a row reading "severe" as
     * established by a criterion that says nothing about severity. The severity
     * staging lives in that complication's `staging` block, which
     * `RankedCondition` does not carry — a reason to reference the stage, not a
     * reason to assert establishment.
     *
     * Banded on source scope (reason 2 in the header): the consensus states its
     * scope as adults, and ISPAD's paediatric cut-points are genuinely different
     * numbers, so an adult-derived "severe" applied to a child would under-call
     * a child who is already at pH 7.05.
     */
    code: "severe_dka",
    display: "Severe diabetic ketoacidosis",
    ageBands: ["adolescent", "adult", "older_adult"],
    citation: ADAEASD_2024_SEVERITY,
  },
  {
    /**
     * DKA at a glucose that reassures. It links to the same complication
     * deliberately: the criteria in complications.ts test ketones and
     * acid-base and carry NO
     * glucose predicate, so they establish this presentation unchanged. What the
     * separate code buys is the ability to argue for it — a normal glucose in
     * someone on an SGLT2 inhibitor, pregnant, fasting or drinking is the
     * situation in which a clinician stops looking, which is exactly when the
     * ranking should be saying keep going.
     *
     * Banded with the other two consensus-derived entries. The concept, its
     * glucose ceiling and the situations it arises in are all stated in an
     * adults-only document, and no paediatric source in this catalog restates
     * them.
     */
    code: "euglycaemic_dka",
    display: "Euglycaemic diabetic ketoacidosis",
    complication: "dka",
    ageBands: ["adolescent", "adult", "older_adult"],
    citation: ADAEASD_2024_EUGLYCAEMIC,
  },
  {
    code: "hhs",
    display: "Hyperosmolar hyperglycaemic state",
    complication: "hhs",
    citation: ADA_S16_CRISES,
  },
  {
    /**
     * The overlap, and the reason ordering two conditions is worth building at
     * all. The consensus reports clinical overlap in more than a third of
     * hyperglycaemic crises, and in the US cohort it cites, 27% of admissions
     * were mixed — figures that used to sit in this comment attributed to "the
     * one cited study" with no study anywhere in the file. They are now on the
     * citation, in the consensus's own words.
     *
     * It has no complication of its own: `dka` and `hhs` can both be
     * established, and neither of them establishes the mixed picture.
     * `complication` takes one code, so it is left unset rather than pointed at
     * whichever half looks louder.
     *
     * Banded with the other two, for the same reason and no other.
     */
    code: "mixed_dka_hhs",
    display: "Mixed DKA and hyperosmolar hyperglycaemic state",
    ageBands: ["adolescent", "adult", "older_adult"],
    citation: ADAEASD_2024_MIXED,
  },
  {
    /**
     * Cited to Section 6, where ADA actually defines hypoglycaemia. It used to
     * be cited to the Section 16 crisis table, whose quoted text is the DKA
     * acidosis threshold — a citation that defined a different entity sitting on
     * this one, which is the failure class ADR 0082's citation requirement
     * exists to catch.
     */
    code: "hypoglycaemia",
    display: "Hypoglycaemia",
    complication: "hypoglycaemia",
    citation: ADA_S6_HYPO_LEVELS,
  },
  {
    /**
     * ADA Level 3, and a separate row for the same reason `severe_dka` is one:
     * the action differs rather than intensifies. A Level 3 event is defined by
     * needing somebody else's hands, not by a number — so it is recorded and
     * ranked even where no glucose was ever measured, which in this setting is
     * most of them — and it changes the plan for good: targets go up, the
     * regimen is reconsidered, and the driving conversation happens.
     *
     * `complication` is unset, exactly as on `severe_dka`. The `hypoglycaemia`
     * complication is satisfied by a Level 1 alert value, so it cannot be made
     * to stand for the severe event.
     */
    code: "severe_hypoglycaemia",
    display: "Severe (level 3) hypoglycaemia",
    citation: ADA_S6_HYPO_LEVELS,
  },
  {
    /**
     * A STATE, not an event — which is why it carries no complication. The
     * `hypoglycaemia` complication establishes that a low happened; this is the
     * finding that the patient no longer feels one coming, and it changes the
     * plan rather than the moment: targets go up, and the next low is more
     * likely to be the severe one above.
     */
    code: "hypoglycaemia_unawareness",
    display: "Impaired awareness of hypoglycaemia",
    citation: ADA_S6_HYPO_UNAWARE,
  },
  {
    /**
     * UNBANDED, and this is the entry that taught the file its banding rule.
     *
     * It used to carry `["child", "adolescent"]` on the reasoning that a
     * paediatric condition banded as adult would be the worse error. That
     * reasoning inverted the actual risk: `ageBands` is a hard filter, so the
     * band hid a rapidly fatal treatment complication from every adult in DKA —
     * the catalog's entire rendered population — and hid it on a frequency
     * judgement, which the header forbids.
     *
     * The distribution was then checked against both sources rather than
     * guessed, and they say different things because they are written about
     * different people. ISPAD puts clinically overt DKA-related cerebral injury
     * at 0.5–0.9% of paediatric DKA with a 21–24% mortality; the adult consensus
     * says plainly that cerebral oedema "is rare in adults" — rare, not absent.
     * A hard filter cannot express that difference, so it expresses nothing and
     * the band is gone. Frequency belongs in the strength of whatever
     * discriminates toward this code, not in whether the code exists at all for
     * the patient in front of you.
     *
     * Cited to ISPAD because that is the source with the numbers; its
     * `needsCsoInput` records that ISPAD is paediatric, that the adult evidence
     * for the unbanded scope is the consensus sentence, and that the chapter's
     * bedside criteria set is deliberately not encoded anywhere in this catalog.
     */
    code: "cerebral_oedema",
    display: "Cerebral oedema complicating DKA",
    citation: ISPAD_2022_DKA,
  },
];

/* ── The foot ────────────────────────────────────────────────────────────── */

const FOOT: DifferentialCondition[] = [
  {
    /**
     * NOT linked to `diabetic_foot`. That complication is the AT-RISK foot —
     * established by an ulcer, loss of protective sensation or PAD — and none of
     * its criteria establishes an infection. Pointing at it would let a foot with
     * an old ulcer and no infection read as confirming one.
     */
    code: "diabetic_foot_infection",
    display: "Diabetes-related foot infection",
    citation: IWGDF_IDSA_2023_INFECTION,
  },
  {
    /**
     * IWGDF/IDSA grade 4: any foot infection plus two SIRS criteria. Split from
     * the entry above because the boundary between them is a temperature, a
     * pulse and a respiratory rate — three things already captured at the
     * bedside — and because crossing it means admission and an urgent surgical
     * opinion rather than an antibiotic and a review.
     *
     * The citation is now Table 1, which STATES those criteria. It used to be
     * Recommendation 18, which is about obtaining a surgical opinion and defines
     * nothing — the entry's own defining text was sitting on its sibling. The
     * escalation Recommendation 18 does state belongs on the rule that fires
     * this condition, not on the condition itself.
     */
    code: "diabetic_foot_sepsis",
    display: "Severe (systemically unwell) diabetes-related foot infection",
    citation: IWGDF_IDSA_2023_SEVERE,
  },
  {
    /**
     * Bone, split out for the reason IWGDF splits it out: it changes the
     * treatment completely — weeks of antibiotics or a resection, against days
     * of antibiotics and a dressing — and it is missed because nobody probes.
     *
     * This is the entry the examination layer is best placed to raise. The
     * probe-to-bone test needs a sterile blunt probe and no laboratory, and
     * `foot_probe_to_bone` is already captured; exposed bone, a sausage toe and
     * an ulcer that has sat over a bony prominence for weeks are all recorded
     * findings with nowhere to point until this code existed.
     *
     * NOT linked to `diabetic_foot`, for the same reason as its two siblings:
     * that complication is the at-risk foot and none of its criteria establishes
     * a bone infection.
     */
    code: "diabetic_foot_osteomyelitis",
    display: "Diabetes-related foot osteomyelitis",
    citation: IWGDF_IDSA_2023_OSTEOMYELITIS,
  },
  {
    /**
     * The differential this whole layer exists for. A hot, swollen, red foot in
     * a neuropathic patient is infection or it is Charcot, the examination
     * cannot always separate them, and the two managements are opposites —
     * antibiotics for one, complete offloading for the other. Ranking says which
     * to think of first; the X-ray settles it.
     */
    code: "charcot_neuroarthropathy",
    display: "Charcot neuroarthropathy",
    citation: ADA_S12_CHARCOT,
  },
  {
    /**
     * PAD present does establish `diabetic_foot`, but that complication is
     * "diabetes-related foot disease" and is reached by LOPS just as well — so
     * linking here would make a neuropathic, well-perfused foot read as
     * confirming ischaemia. Left unset for that reason, not for want of a source.
     */
    code: "peripheral_artery_disease",
    display: "Peripheral artery disease",
    citation: IWGDF_ESVS_SVS_2023_PAD,
  },
  {
    /**
     * The limb that is being lost now, as against the one that hurts on
     * walking. Ranked separately from PAD because the two share a mechanism and
     * share nothing else: chronic PAD is a risk category that sets a screening
     * interval, and CLTI is a vascular opinion today. This file's own quoted
     * Recommendation 18 names "severe lower limb ischaemia" as a trigger for
     * urgent surgery, and until this code existed there was nothing for that
     * finding to argue toward.
     *
     * The guideline's definition is a COMBINATION — peripheral artery disease
     * plus rest pain, gangrene or an ulcer of at least two weeks — which is
     * exactly the shape `Criterion.atLeast` and `all` already express, so the
     * rules layer can state it without any new vocabulary. Nothing is asserted
     * here beyond the entity.
     */
    code: "chronic_limb_threatening_ischaemia",
    display: "Chronic limb-threatening ischaemia",
    citation: IWGDF_ESVS_SVS_2023_CLTI,
  },
  {
    /** Unset for the same reason as PAD: it is one of two doors into `diabetic_foot`. */
    code: "diabetic_peripheral_neuropathy",
    display: "Diabetic peripheral neuropathy",
    citation: ADA_S12_NEUROPATHY,
  },
];

/* ── Aetiological type ───────────────────────────────────────────────────── */

/**
 * These sit BESIDE the `Classification` layer, not on top of it. diagnosis.ts
 * already adjudicates `type_1` / `type_2` / `ketosis_prone_type_2` from
 * C-peptide and autoantibodies and returns `unclassified` when it cannot — the
 * deliberately conservative behaviour where those tests do not exist.
 *
 * The codes here are DIFFERENT strings on purpose. A ranked
 * `type_1_diabetes` is the examination saying "consider this"; a Classification
 * of `type_1` is the engine saying it is settled. Sharing a code would invite a
 * surface to render one as the other, which is the single confusion this layer
 * must never cause. The rule bound this file to a classification once, in
 * `ketosis_prone_type_2_diabetes`, and that row is now removed; the note at its
 * former site below gives the reason.
 *
 * ── Secondary diabetes is three rows, not one — and was briefly four ─────────
 * A single `secondary_diabetes` row could be raised but never argued for: it
 * collapsed causes with completely different examination findings and completely
 * different next actions into one line cited to an "e.g." list. The split kept
 * the two the catalog can genuinely argue for — a steroid started, an
 * antiretroviral started or switched — with `secondary_diabetes` as the residual
 * for everything else, which is also what the referencing feature files already
 * point at. The third, `pancreatogenic_diabetes`, was removed: nothing in the
 * feature set records exocrine failure, which is the half of ADA's definition
 * that makes it that entity rather than any other. Its former site says so.
 *
 * Both surviving rows have rules written for them in `rules-aetiology.ts` and
 * nothing else can reach them. Neither has a `discriminates` pointing at it, and
 * that is correct rather than outstanding: a steroid on a drug list and "on
 * antiretroviral therapy" are not findings that argue on their own, and ADR 0083
 * puts compound discrimination in rules for exactly that reason.
 *
 * Those rules do not RUN yet. `AETIOLOGY_RULES` is not in `index.ts`'s `rules`
 * array, which is the only thing `rankDifferential` reads, so both rows remain
 * unreachable at runtime and the validator still says so. Wiring that array is a
 * one-line change in a file neither of these two owns; until it lands, "reached
 * by a rule" means the rule exists, not that anything ranks.
 *
 * Post-transplantation diabetes is deliberately NOT among them. ADA writes a
 * recommendation for it (2.26), but it is settled by a single history question
 * and there is no examination finding that would move it against any other row
 * here — a row nothing can ever discriminate toward is the noise this layer is
 * supposed to refuse.
 */
const AETIOLOGY: DifferentialCondition[] = [
  {
    /**
     * No band restriction. Type 1 presents at any age — latent autoimmune
     * diabetes in adults is inside ADA's own definition — and banding it to the
     * young is precisely the error that gets an adult started on tablets and
     * admitted in ketoacidosis a month later.
     */
    code: "type_1_diabetes",
    display: "Type 1 diabetes",
    citation: ADA_S2_CLASSES,
  },
  {
    code: "type_2_diabetes",
    display: "Type 2 diabetes",
    citation: ADA_S2_CLASSES,
  },
  /*
   * REMOVED: `ketosis_prone_type_2_diabetes`. It stays removed, but the argument
   * for removing it was partly wrong and is corrected here rather than repeated.
   *
   * WHAT SURVIVES THE REVIEW. diagnosis.ts carries the Classification
   * `ketosis_prone_type_2`, whose `discriminators` are `islet_autoantibodies`
   * and `c_peptide`. `classify()` reports both, with their capture state, for
   * EVERY patient, and returns `unclassified` with "the discriminating tests are
   * not available or not done. Type is not inferred from phenotype." So the
   * prompt to send those two tests is already produced unconditionally, and
   * removing this row produced no silence: the classification surface still says
   * the entity cannot be settled here.
   *
   * WHAT DOES NOT SURVIVE, and it was the old note's main argument: that a rule
   * keyed on ketosis at presentation plus a phenotype "would infer a type from
   * phenotype, which diagnosis.ts refuses in writing". diagnosis.ts refuses to
   * CLASSIFY from phenotype. This layer is not classification — ADR 0083 gave it
   * different code strings for exactly that reason — and it already ranks
   * `type_1_diabetes` from wasting and unintentional weight loss at `moderate`,
   * and `type_2_diabetes` from acanthosis nigricans and central adiposity. A
   * standard the rows either side of this one do not meet is not a reason to
   * delete the third.
   *
   * THE REASON IT IS STILL OUT is mechanical, and stating it plainly is the
   * point, because it is fixable. The only rule reachable today would key on
   * negative autoantibodies with a preserved C-peptide — restating a
   * classification claim in a weaker construct — and both tests are `specialist`
   * tier and declared available at NEITHER reference site. `rankDifferential`
   * skips any rule whose criterion is not `met`, so such a rule would contribute
   * no row, no score and no confirmatory list anywhere this catalog currently
   * runs. It would clear the validator's unreachable warning while changing
   * nothing a clinician sees, which is worse than the warning.
   *
   * WHAT WOULD BRING IT BACK, in the order it has to be done. (1) diagnosis.ts
   * gains the second `supportedBy` criterion its own Classification is missing:
   * today the only one requires `insulin_withdrawn_later`, so the entity can be
   * recognised only AFTER the decision it exists to protect has been taken.
   * Ketosis at presentation with negative autoantibodies and a preserved
   * C-peptide would close that, in the construct that owns the question.
   * (2) This row returns with a rule that fires at the BEDSIDE — ketosis at
   * presentation alongside a type 2 phenotype — which is the patient the entity
   * is actually about, and is not the lean, wasted young adult the type 1 row is
   * about. That needs a source read and quoted for the presentation, and it may
   * not encode ancestry, which is ADA's own marker and which this catalog will
   * not hold.
   *
   * UNTIL THEN THE ASYMMETRY IS REAL and is recorded rather than argued away: at
   * a ketoacidotic presentation `type_1_diabetes` is rankable and this is not.
   * In sub-Saharan Africa that is the direction of the misclassification that
   * commits somebody to lifelong insulin they may be able to come off, and it is
   * the whole reason the entity was on the list.
   */
  {
    /**
     * UNBANDED. It used to carry `["adolescent", "adult"]`, which contradicted
     * the recommendation quoted on its own citation — rec 2.29b opens "Children
     * and young adults" — at one end, and excluded older adults at the other,
     * where MODY is classically found after decades of being treated as type 2.
     * Neither exclusion had a source. Confirmed only by genetic testing, which
     * no site in scope has; it is ranked anyway because the examination CAN
     * raise it — lean, not ketosis-prone, diabetes through successive
     * generations — and because getting it wrong means a lifetime of insulin
     * somebody did not need.
     */
    code: "mody",
    display: "Maturity-onset diabetes of the young (MODY)",
    citation: ADA_S2_MONOGENIC,
  },
  {
    /**
     * The file's ONE definitional band (reason 1 in the header). It is defined
     * by pregnancy rather than by a mechanism, so the band follows reproductive
     * physiology and not any judgement about how common it is — which is the
     * distinction that keeps it while `mody` and `malignant_otitis_externa` lost
     * theirs. `adolescent` is included because adolescent pregnancy is common in
     * this catalog's setting.
     */
    code: "gestational_diabetes",
    display: "Gestational diabetes",
    ageBands: ["adolescent", "adult"],
    citation: ADA_S2_GDM,
  },
  {
    /**
     * Steroid diabetes, split out because it is the secondary cause that comes
     * with a whole habitus attached — the moon face, the striae, the thin
     * bruised skin, the proximal weakness — and because it is the one that may
     * not need lifelong treatment, which is a different conversation from any
     * other row here.
     *
     * NONE OF THOSE FOUR IS A FEATURE. An earlier version of this comment said
     * they were "recorded at the general examination"; nothing in this catalog
     * records a moon face, striae, thin or easily bruised skin, or proximal
     * weakness. That is a capture gap rather than a judgement about the sign,
     * and it is why the rule in `rules-aetiology.ts` has no Cushingoid arm. When
     * those findings exist, they belong on that rule.
     */
    code: "glucocorticoid_induced_diabetes",
    display: "Glucocorticoid-induced diabetes",
    citation: ADA_S2_GLUCOCORTICOID,
  },
  /*
   * REMOVED: `pancreatogenic_diabetes`. It was unreachable, and the entry's own
   * justification turned out to describe findings this catalog does not capture.
   * It claimed "steatorrhoea, weight loss despite eating, and epigastric pain
   * are findings the examination reaches". Nothing records steatorrhoea,
   * exocrine failure, pancreatic surgery, pancreatectomy, chronic pancreatitis
   * or pancreatic calcification anywhere in the feature set, and ADA's own
   * definition — "structural and functional loss of insulin secretion IN THE
   * CONTEXT OF EXOCRINE PANCREATIC INSUFFICIENCY" — makes the missing half the
   * defining half.
   *
   * The one adjacent field means something else. `illness_type` carries a
   * `pancreatitis` option, but it is a property of `intercurrent_illness`
   * ("Current infection or other illness") in the crisis-PRECIPITANTS section,
   * and acute pancreatitis in uncontrolled diabetes is at least as often a
   * consequence — of hypertriglyceridaemia, or of the crisis itself — as it is
   * evidence of type 3c. A rule reading it aetiologically would assert a cause
   * from a field that records an acute event, and would do so loudest in the
   * patient whose real problem that hour is the abdomen.
   *
   * THE SAME OBJECTION APPLIES TO THE ROWS THAT SURVIVED, and it is recorded
   * rather than waved through. Both drug rules in `rules-aetiology.ts` turn on
   * `drug_change_non_diabetes`, which is a property of `new_or_changed_drug` in
   * that same crisis-precipitant section, read aetiologically over months. Two
   * things separate the cases, and neither makes the drug rules clean. First,
   * `illness_type` would have been the ONLY evidence for this entity, whereas
   * both drug rules conjoin the exposure with a glucose in the diagnostic range,
   * so neither fires on the precipitant field alone. Second, the drug rules
   * disclose the second reading on their citations and ask the CSO to ratify it;
   * this entity had no way to disclose its way to a defensible rule, because the
   * defining finding was absent rather than borrowed. A dedicated drug-exposure
   * history, with a date, would retire the question for all three.
   *
   * `secondary_diabetes` remains, and already carries wasting, jaundice and
   * hepatomegaly toward "consider a secondary cause" — the honest ceiling until
   * a pancreatic-history feature exists. If one is added (prior pancreatitis,
   * pancreatic surgery, steatorrhoea, faecal elastase), this row should return
   * with a rule of its own; it is the capture that is missing, not the entity.
   */
  {
    /**
     * The secondary cause with the largest population behind it here, and the
     * only one ADA writes a TIMED screening recommendation for — before starting
     * antiretroviral therapy, at a switch, and three to six months after either.
     * Nothing in this catalog records WHEN a drug changed, so that window is
     * guidance in the rule's notes rather than a predicate, and the rule says so.
     *
     * TWO earlier claims here were wrong and are corrected. The examination
     * handle is NOT real today: `lipodystrophy` is the feature that would carry
     * lipoatrophy, and it renders only when `glucose_lowering_therapy` includes
     * insulin, so antiretroviral lipoatrophy in anybody else can never be
     * recorded. And `art_regimen`'s option table is NOT a table of which
     * combinations move the glucose — it is a table of which ones interfere with
     * the HbA1c ASSAY (abacavir and zidovudine make the reading low for the
     * glucose), it is labelled "Effect on HbA1c", and reading it as an
     * attribution table would be exactly the misuse the validity layer exists to
     * prevent. The row is reached by a rule on the drug change and a glucose,
     * and by nothing else.
     */
    code: "hiv_art_associated_diabetes",
    display: "HIV- and antiretroviral-associated diabetes",
    citation: ADA_S2_HIV,
  },
  {
    /**
     * The residual, and cited to the Ugandan text because "secondary diabetes"
     * is its term and the clinician using this was taught it. It stays a rankable
     * row after the split above because a cause this catalog does not model —
     * haemochromatosis, a pancreatectomy, an endocrinopathy other than Cushing's
     * — still has to have somewhere to go, and because the referencing feature
     * files already argue toward it. What it no longer has to do is stand in for
     * three causes that each have their own findings.
     */
    code: "secondary_diabetes",
    display: "Secondary diabetes (other identifiable cause)",
    citation: UCG_2023_DM,
  },
];

/* ── Chronic complications ───────────────────────────────────────────────── */

const CHRONIC: DifferentialCondition[] = [
  {
    code: "diabetic_kidney_disease",
    display: "Diabetic kidney disease",
    complication: "diabetic_kidney_disease",
    citation: ADA_S11_DKD,
  },
  {
    /**
     * The alternative the layer is obliged to consider and could not name.
     * Kidney disease in a person with diabetes is not automatically diabetic
     * kidney disease — HIV-associated nephropathy, a glomerulonephritis,
     * obstruction, an analgesic or herbal exposure all present the same way at
     * the bedside — and the consequence of assuming otherwise is that nobody
     * looks. No frequency is asserted; the point is that the alternative has to
     * be nameable before any finding can argue for it.
     *
     * ADA lists five reasons to raise it, and this catalog can reach TWO of
     * them: the absence of retinopathy, which the examination owns outright,
     * and a very high urine albumin-creatinine ratio, with the protein strip as
     * the bedside proxy. The other three cannot be captured at all today —
     * there is no urine-microscopy field for an active sediment, and `egfr` and
     * `urine_acr` are single numbers rather than series, so neither a rapidly
     * declining eGFR nor a rapidly rising albuminuria can be computed. An
     * earlier version of this comment claimed every item was captured or
     * orderable; it was not true, and `rules-aetiology.ts` says which two are.
     * Without this code even those two findings could only ever argue FOR
     * diabetic kidney disease or say nothing, which is a one-sided differential.
     */
    code: "non_diabetic_kidney_disease",
    display: "Non-diabetic kidney disease in a person with diabetes",
    citation: ADA_S11_NON_DIABETIC,
  },
  {
    /**
     * Scoped to what ADA says to refer PROMPTLY — any macular oedema, moderate
     * or worse non-proliferative disease, any proliferative disease — rather
     * than to retinopathy in general. The catalog models no retinopathy
     * complication yet, so there is nothing to link to; what the entry does is
     * let a visual finding raise the referral rather than a screening interval.
     */
    code: "sight_threatening_retinopathy",
    display: "Sight-threatening diabetic retinopathy",
    citation: ADA_S12_RETINOPATHY,
  },
  {
    /**
     * Ranked because two of its manifestations are already recorded in the
     * general examination — a postural drop and dry, cracked peripheral skin —
     * and neither means anything on its own. Together they are a named
     * syndrome with an independent mortality signal.
     */
    code: "autonomic_neuropathy",
    display: "Diabetic autonomic neuropathy",
    citation: ADA_S12_AUTONOMIC,
  },
  {
    /**
     * Kept separate from autonomic neuropathy rather than folded into it,
     * because it is the one that explains an HbA1c nobody can make sense of —
     * and because ADA requires reversible and obstructive causes to be excluded
     * before the label is used, which is a different next step from the rest of
     * the syndrome.
     */
    code: "gastroparesis",
    display: "Diabetic gastroparesis",
    citation: ADA_S12_GASTROPARESIS,
  },
  {
    /**
     * The cheapest finding in the catalog and one of the most useful: it is seen
     * and felt at the injection sites in seconds, and it explains erratic
     * absorption, glycaemic variability and unexplained hypoglycaemia without a
     * single test. Ranking it is what stops the swings being blamed on the
     * patient.
     */
    code: "insulin_lipohypertrophy",
    display: "Insulin lipohypertrophy",
    citation: ADA_S9_INJECTION,
  },
];

/* ── Severe infections associated with diabetes ──────────────────────────── */

/**
 * Five infections that are disproportionately seen in diabetes and kill quickly
 * when they are called something else first. None has a `Complication` and none
 * should acquire one from this file: the catalog has no criteria for any of
 * them, and an entry here claims only that the examination may RAISE it — an
 * ear, a nose, a flank, a perineum, a limb — for someone else to settle with
 * imaging or in theatre.
 *
 * ── What earns a place in this block, and what does not ──────────────────────
 * Two things, together. The site is one the diabetes examination already
 * inspects, and the escalation is triggered by a bedside finding rather than by
 * a test this catalog does not model. That is why these five are here.
 *
 * TUBERCULOSIS IS DELIBERATELY NOT, and the omission is a decision rather than
 * an oversight — it was put forward as the entry a Ugandan catalog most needs
 * and it fails both halves of the test above. Nothing in a diabetes examination
 * moves it: it is settled by a sputum test and a chest radiograph on a national
 * algorithm this catalog does not model, so a ranked row would imply reasoning
 * that is not happening. And it is one of several things that explain wasting in
 * a person with diabetes here — TB, HIV, malignancy and uncontrolled
 * hyperglycaemia itself — so ranking it alone would build exactly the one-sided
 * differential this block is otherwise careful to avoid, without the sources or
 * the criteria to rank the others beside it. It is a comorbidity the clerkship
 * records and refers on, not a diabetes condition this layer ranks, and it is
 * carried as a named `mimicsToExclude` string on the rules that read wasting —
 * the mechanism ADR 0083 provides for exactly this case.
 *
 * The comparators these five are confused with — acute pyelonephritis, otitis
 * externa, sinusitis, ordinary cellulitis — are absent for the same reason and
 * are carried the same way.
 */
const SEVERE_INFECTIONS: DifferentialCondition[] = [
  {
    /**
     * The one where hours matter and where the examination genuinely leads. The
     * signs are the guideline's own: unilateral facial oedema, proptosis, and a
     * palatal or palpebral fistula developing into necrosis — and, as the
     * trigger for urgent imaging, facial pain, sinusitis, proptosis,
     * ophthalmoplegia or newly diagnosed loss of vision in a person with
     * diabetes. An earlier version of this comment described a black eschar on
     * the palate in an acidotic patient; the guideline's eschar is a cutaneous
     * lesion, its palatal disease is a fistula, and it never mentions acidosis,
     * so the bedside picture is now the one the source actually paints.
     *
     * The guideline is explicit that diabetes is the predominant risk factor
     * where access to diabetes care is limited, which is the setting this
     * catalog is built for.
     */
    code: "rhino_orbito_cerebral_mucormycosis",
    display: "Rhino-orbito-cerebral mucormycosis",
    citation: ECMM_2019_MUCORMYCOSIS,
  },
  {
    /**
     * UNBANDED. It used to carry `["adult", "older_adult"]` with a comment
     * saying that was where the source puts it. The source says the opposite: it
     * documents the condition across all age groups and states that people
     * immunosuppressed by HIV develop it YOUNGER than people with diabetes do.
     * In a catalog written for Uganda, an adolescent with type 1 diabetes and
     * HIV is precisely the patient the band was deleting.
     *
     * What the source does say is that it is most prevalent over 60, and a
     * prevalence is not a boundary. That belongs in the strength of a
     * discrimination, not in a hard filter.
     *
     * An ear that hurts far more than it looks, discharging, with granulation at
     * the bony-cartilaginous junction — and a facial palsy meaning the skull
     * base is already involved.
     */
    code: "malignant_otitis_externa",
    display: "Malignant (necrotising) otitis externa",
    citation: NOE_STATPEARLS,
  },
  {
    /**
     * Included precisely BECAUSE the examination cannot distinguish it from
     * acute pyelonephritis. The value of ranking it is the prompt to image
     * rather than to treat and review, and the entry must never read as more
     * than that.
     */
    code: "emphysematous_pyelonephritis",
    display: "Emphysematous pyelonephritis",
    citation: EPN_STATPEARLS,
  },
  {
    /**
     * Pain out of proportion to what is visible, in a place clinicians are slow
     * to look. Ranking it is worth having only if it also gets looked at, which
     * is why the foot examination is not the only place this catalog asks about
     * skin.
     */
    code: "fournier_gangrene",
    display: "Fournier gangrene",
    citation: FOURNIER_STATPEARLS,
  },
  {
    /**
     * The same disease outside the perineum, which had nowhere to go. The skin
     * examination already offers "necrotising" as a pattern of skin infection
     * and the foot guideline already names a necrotising infection as a reason
     * to get a surgeon now — but `fournier_gangrene` is defined by its site, so
     * a necrotising infection of a thigh, a flank or an abdominal wall could
     * only ever be recorded and never argued about.
     *
     * Kept as the general entry with `fournier_gangrene` as its perineal special
     * case rather than the other way round, because the perineal one is the one
     * with a name, a definition and a source of its own. No bedside case
     * definition is asserted for the general entry; the citation says so, and
     * the honest claim is that the layer may raise it for surgical assessment.
     */
    code: "necrotising_soft_tissue_infection",
    display: "Necrotising soft-tissue infection (outside the perineum)",
    citation: IWGDF_IDSA_2023_SURGERY,
  },
];

/* ── Autoimmune conditions that travel with type 1 ───────────────────────── */

/**
 * These are ranked for one practical reason: each of them presents as diabetes
 * behaving oddly. A falling insulin requirement, unexplained recurrent
 * hypoglycaemia, weight that will not settle — a clinician who has only
 * "diabetes" to reach for adjusts the insulin, and the underlying condition
 * goes on for years.
 */
const AUTOIMMUNE: DifferentialCondition[] = [
  {
    code: "autoimmune_thyroid_disease",
    display: "Autoimmune thyroid disease",
    citation: ADA_S4_AUTOIMMUNE,
  },
  {
    code: "coeliac_disease",
    display: "Coeliac disease",
    citation: ADA_S4_AUTOIMMUNE,
  },
  {
    /**
     * The rarest of the three and the only one that can kill this week. ADA
     * names the association and stops there — no screening recommendation — so
     * the citation carries that gap rather than hiding it.
     */
    code: "primary_adrenal_insufficiency",
    display: "Primary adrenal insufficiency (Addison disease)",
    citation: ADA_S4_OTHER_AUTOIMMUNE,
  },
];

/**
 * Thirty-nine conditions, in the order a clinician meets them: what is killing
 * this person now, then the foot, then what kind of diabetes this is, then what
 * it has already done, then the infections that hide behind it, then the company
 * type 1 keeps.
 *
 * Several are unreferenced by any `discriminates` today, and that is expected
 * rather than dead weight: the domains that reach them — the eye, the abdomen,
 * the age-specific pass, the rules layer that will carry the mixed picture — are
 * being written AGAINST this list, because the validator rejects a
 * `discriminates` naming a condition nobody defined. The list has to land first
 * for those files to compile at all.
 */
export const DIABETES_CONDITIONS: DifferentialCondition[] = [
  ...ACUTE,
  ...FOOT,
  ...AETIOLOGY,
  ...CHRONIC,
  ...SEVERE_INFECTIONS,
  ...AUTOIMMUNE,
];
