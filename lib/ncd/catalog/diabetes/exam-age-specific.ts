/**
 * Presentations that differ by life stage — adolescent, pregnant, older adult.
 *
 * ── What this segment is for ─────────────────────────────────────────────────
 * Three life stages, and one question each. In an ADOLESCENT: which diabetes is
 * this, when the phenotype no longer separates the types. In PREGNANCY: the two
 * things a pregnant abdomen and a pregnant appetite say that they say in nobody
 * else. In an OLDER ADULT: is this person being treated to a target the
 * guideline no longer wants for them, and is the next low the one that ends it.
 *
 * The file is deliberately SHORT. Most of what a life stage changes is already
 * captured somewhere else in this catalog, and the failure mode here is not
 * omission — it is writing a second field that asks a question the form already
 * asks, so that two answers exist to disagree with. Everything below either has
 * no home elsewhere or argues for something nothing else argues for.
 *
 * ── Not here, and why ────────────────────────────────────────────────────────
 * FALLS. `falls_last_year` already exists, as a property of `unsteadiness_or_
 * falls` in the symptoms section. It is gated behind the foot symptom screen,
 * which means an older adult with no foot complaint is never asked it — a real
 * gap, and ADA Table 13.1 screens for falls in every older adult. But the fix is
 * to UNGATE the field that exists, in complication-symptoms.ts, not to add a
 * second count of the same falls here. Recorded for the CSO handover.
 *
 * POLYPHARMACY. ADA 13.2 screens for it. The drugs that actually cause the harm
 * are already captured by name and by class — `glucose_lowering_therapy`,
 * `sulfonylurea_agent`, `new_or_changed_drug`, `drug_change_non_diabetes` — and
 * a count of tablets changes no differential that those four do not already
 * change. therapy-flags.ts is where a drug-plus-state rule belongs.
 *
 * COMORBIDITY COUNT. ADA Table 13.2's third axis is "multiple coexisting chronic
 * illnesses (≥3)". The problem list already holds them; a field asking the
 * clinician to count them would be a second copy that can disagree.
 *
 * PUBERTAL STAGE. ISPAD puts pre-pubertal onset among the features favouring
 * type 1, and type 2 before puberty is rare. Inside the adolescent band
 * (10–19) almost everyone is peri- or post-pubertal, so the finding does its
 * work in the `child` band — which ADR 0083 defers. Writing it banded to a stage
 * nothing renders would be writing it for nobody.
 *
 * VOMITING IN PREGNANCY. `vomiting`, `vomiting_duration` and
 * `vomiting_tolerating_fluids` exist and are not stage-specific. What IS stage-
 * specific is what happens to a pregnant person who then cannot eat, and that is
 * `pregnancy_reduced_oral_intake` below — one finding, not a second vomiting
 * history.
 *
 * HYPOGLYCAEMIA UNAWARENESS IN PREGNANCY. ADA Section 15 records an altered
 * counterregulatory response in pregnancy that may decrease awareness, which is
 * a CAVEAT belonging on `hypo_autonomic_warning` in exam-cns.ts — that finding's
 * important-negative currently reads the absent warning through long-standing
 * type 1 diabetes, recurrent lows and beta-blockade, and pregnancy belongs in
 * that list. It is another author's feature and is left alone; recorded here.
 *
 * THE PREGNANCY BLOOD-PRESSURE THRESHOLD. ADA 15.24 initiates and titrates at
 * <140/90 mmHg in pregnancy and deintensifies below 90/60, against the <130/80
 * the vitals carry. It cannot be expressed as an `ageRefRange`, because
 * pregnancy is a STATE and not an `AgeBand`; it belongs in an
 * `InterpretationTable` with `when: { feature: "pregnant", op: "present" }`,
 * which is interpretation.ts's to write. Recorded so it is not lost.
 *
 * RETINOPATHY IN PREGNANCY. ADA 15.7 asks for a dilated examination in the first
 * trimester and each trimester after. That is a screening INTERVAL on a
 * complication, not a finding, and `last_retinal_exam` already records when the
 * eye was last looked at.
 *
 * ── Where the sources diverge, and both are recorded ─────────────────────────
 * 1. WHO GETS SCREENED IN PREGNANCY. ADA 2.32 screens EVERY pregnancy at 24–28
 *    weeks. Uganda Clinical Guidelines 16.2.5 screens on risk factors, and
 *    prints the list under the heading "Risk factors (and indication for
 *    screening)" — several of which are examination findings a midwife has in
 *    her hands. Both are carried on `uterus_large_for_dates`: UCG is why the
 *    finding is captured at all, and ADA is why its ABSENCE must never be read
 *    as a reason not to screen.
 * 2. WHEN A TARGET IS RELAXED IN AN OLDER ADULT. UCG 8.1.3 relaxes on AGE —
 *    "HbA1c <7% (7.5 % for elderly)" — and warns that elderly people are at
 *    higher risk of hypoglycaemia. ADA Table 13.2 relaxes on HEALTH STATUS, and
 *    chronological age appears nowhere in it: the axes are comorbidity count,
 *    ADL impairments and cognitive impairment. The three findings below are ADA's
 *    axes; UCG's rule needs no finding at all, only a date of birth. Neither is
 *    wrong — they ask for different evidence for the same decision — and both
 *    texts are quoted in full on `ADA_S13_TARGETS` so a site on either has what
 *    that text needs.
 *
 * ── Age bands, used sparingly ────────────────────────────────────────────────
 * A band FILTERS THE SURFACE, so a band declared without cause hides a finding
 * from every patient outside it. The pregnancy findings therefore carry NO band
 * at all — they are gated on `pregnant`, because pregnancy is a state rather
 * than a life stage and a band would only risk hiding them from a pregnant
 * patient the age function happens to call something else. The older-adult
 * findings are banded, because ADA Section 13 is written for adults aged 65 and
 * over and its instruments are geriatric ones. The family history is unbanded
 * and only its MODY reading is banded, because ADA's recommendation to test is
 * written for "children and young adults" while a family history means something
 * at every age.
 *
 * Every citation here is `csoSigned: false`. The segment ships gated dark.
 */
import type { Citation, Feature } from "@/lib/ncd/catalog/schema";

const RETRIEVED = "2026-09-08";

/* ── Sources fetched for this file ───────────────────────────────────────── */

/**
 * The one recommendation in the whole of ADA that tells a clinician when to stop
 * assuming type 1 or type 2 — and the only reason a family history is worth
 * more than a demographic note in a young patient.
 */
const ADA_S2_MODY: Citation = {
  standard: "ADA",
  version: "Standards of Care in Diabetes—2026, Section 2, rec 2.29b",
  title: "2. Diagnosis and Classification of Diabetes — Monogenic Diabetes Syndromes",
  url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC12690183/",
  retrieved: RETRIEVED,
  csoSigned: false,
  quote:
    "2.29b Children and young adults who do not have typical characteristics of type 1 or type 2 diabetes and have a family history of diabetes in successive generations (suggestive of an autosomal-dominant pattern of inheritance) should have genetic testing for maturity-onset diabetes of the young (MODY).",
};

/**
 * Table 2.6 — the risk factors that make ADA test an adolescent for type 2
 * diabetes. Two of its four bullets are things this file captures, and both are
 * graded A.
 */
const ADA_S2_YOUTH_RISK: Citation = {
  standard: "ADA",
  version: "Standards of Care in Diabetes—2026, Section 2, rec 2.15 and Table 2.6",
  title:
    "2. Diagnosis and Classification of Diabetes — Risk-based screening for type 2 diabetes or prediabetes in asymptomatic children and adolescents",
  url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC12690183/",
  retrieved: RETRIEVED,
  csoSigned: false,
  quote:
    "Screening should be considered in youth who have overweight (≥85th percentile) or obesity (≥95th percentile) A and who have one or more additional risk factors: Maternal history of diabetes or GDM during the child's gestation A; Family history of type 2 diabetes in first- or second-degree relative A; High-risk race, ethnicity, and ancestry A; Signs of insulin resistance or conditions associated with insulin resistance (acanthosis nigricans, hypertension, dyslipidemia, polycystic ovary syndrome, large- or small-for-gestational-age birth weight) B",
};

/**
 * Table 2.5, the adult equivalent — fetched specifically to settle whether the
 * polycystic-ovary finding below should carry an adolescent band. It should not:
 * ADA lists it as an insulin-resistance marker in adults of any age.
 */
const ADA_S2_ADULT_RISK: Citation = {
  standard: "ADA",
  version: "Standards of Care in Diabetes—2026, Section 2, Table 2.5",
  title:
    "2. Diagnosis and Classification of Diabetes — Criteria for screening for diabetes or prediabetes in asymptomatic adults",
  url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC12690183/",
  retrieved: RETRIEVED,
  csoSigned: false,
  quote:
    "Individuals with polycystic ovary syndrome … Other clinical conditions associated with insulin resistance (e.g., severe obesity, acanthosis nigricans, metabolic dysfunction-associated steatotic liver disease)",
};

/** ADA's screening rule for pregnancy, and one half of the divergence below. */
const ADA_S2_GDM_SCREEN: Citation = {
  standard: "ADA",
  version: "Standards of Care in Diabetes—2026, Section 2, rec 2.32",
  title: "2. Diagnosis and Classification of Diabetes — Gestational Diabetes Mellitus",
  url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC12690183/",
  retrieved: RETRIEVED,
  csoSigned: false,
  quote:
    "2.32 Screen for GDM at 24–28 weeks of gestation in pregnant individuals not previously found to have diabetes or high-risk abnormal glucose metabolism detected earlier in the current pregnancy. A",
};

/**
 * The paragraph that says, in ADA's own words, that the adolescent phenotype no
 * longer separates the two types. It is quoted rather than paraphrased because
 * it is the reason this file adds only ONE typing finding: obesity, acanthosis
 * nigricans and ketosis are all already captured and none of them settles it.
 */
const ADA_S14_OVERLAP: Citation = {
  standard: "ADA",
  version: "Standards of Care in Diabetes—2026, Section 14 (Diagnostic Challenges)",
  title: "14. Children and Adolescents: Standards of Care in Diabetes—2026",
  url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC12690182/",
  retrieved: RETRIEVED,
  csoSigned: false,
  quote:
    "Overweight and obesity are common in children with type 1 diabetes, and diabetes-associated autoantibodies and ketosis may be present in pediatric individuals with clinical features of type 2 diabetes (including obesity and acanthosis nigricans). … At the onset of diabetes, DKA occurs in ∼11% of children and adolescents aged 10–19 years with type 2 diabetes.",
};

/** The behaviour ADA singles out in this age group, and what it presents as. */
const ADA_S14_PSYCH: Citation = {
  standard: "ADA",
  version: "Standards of Care in Diabetes—2026, Section 14, rec 14.9 (Psychosocial Care)",
  title: "14. Children and Adolescents — Psychosocial Care",
  url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC12690182/",
  retrieved: RETRIEVED,
  csoSigned: false,
  quote:
    "A particularly dangerous behavior in this population is insulin omission for weight loss. In the SEARCH study, disordered eating behaviors and insulin omission were also common among adolescents and young adults with type 2 diabetes, with 50.3% reporting disordered eating behaviors and 23% reporting insulin omission. … 14.9 At diagnosis and during routine follow-up care, screen children and adolescents with type 1 diabetes, B type 2 diabetes, B and other forms of diabetes E for psychosocial concerns (e.g., diabetes distress, depressive symptoms, anxiety, disordered eating behaviors), family factors, and behavioral health concerns",
};

/** Pregnancy as a ketogenic state — the sentence the euglycaemic finding rests on. */
const ADA_S15_PREGNANCY_DKA: Citation = {
  standard: "ADA",
  version: "Standards of Care in Diabetes—2026, Section 15 (Special Considerations)",
  title: "15. Management of Diabetes in Pregnancy: Standards of Care in Diabetes—2026",
  url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC12690181/",
  retrieved: RETRIEVED,
  csoSigned: false,
  quote:
    "Pregnancy is a ketogenic state, and people with type 1 diabetes and, to a lesser extent, those with type 2 diabetes are at risk for diabetic ketoacidosis (DKA) at lower blood glucose levels than in the nonpregnant state. Pregnant people with type 1 diabetes should be advised to obtain ketone test strips and receive education on DKA prevention and detection. DKA carries a high risk of stillbirth. Those in DKA who are unable to eat often require intravenous fluid containing dextrose with an insulin drip",
};

/** The consensus that names pregnancy and reduced intake as causes in one sentence. */
const ADAEASD_2024_EUDKA: Citation = {
  standard: "EASD",
  version: "ADA/EASD/JBDS/AACE/DTS consensus report, 2024 (Diabetologia)",
  title: "Hyperglycaemic crises in adults with diabetes: a consensus report",
  url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC11343900/",
  retrieved: RETRIEVED,
  csoSigned: false,
  quote:
    "Approximately 10% of patients with DKA present with euglycaemic DKA, which is defined as plasma glucose levels <11.1 mmol/l (200 mg/dl) in the presence of ketosis and metabolic acidosis … Euglycaemic DKA can be caused by a variety of factors, including exogenous insulin injection, reduced food intake, pregnancy, or impaired gluconeogenesis due to alcohol use, liver failure and/or SGLT2 inhibitor therapy.",
};

/**
 * And the sentence that explains why HHS is an older person's emergency: it
 * names THIRST and ACCESS as separate mechanisms, which is what makes them a
 * finding somebody can ask about rather than a risk factor to note.
 */
const ADAEASD_2024_HHS_OLDER: Citation = {
  standard: "EASD",
  version: "ADA/EASD/JBDS/AACE/DTS consensus report, 2024 (Diabetologia) — precipitants of HHS",
  title: "Hyperglycaemic crises in adults with diabetes: a consensus report",
  url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC11343900/",
  retrieved: RETRIEVED,
  csoSigned: false,
  quote:
    "Volume depletion is a primary driver of HHS, which commonly occurs in older adults with above-target glucose levels who are at particularly high risk for developing dehydration because of polyuria, age-related impairment of thirst mechanisms, and limited access to fluids. Infection is the major precipitating factor in 30–60% of patients with HHS",
  needsCsoInput:
    "The consensus attributes the thirst half of this to AGE. The access half is not age-specific at all — a bed-bound adult of forty who cannot reach a cup has the same problem, and no retrieved source says so in those words. The finding is banded `older_adult` because the source is, which means it is hidden from that younger patient. CSO to decide whether the band should be dropped or a second, unbanded dependence finding written.",
};

/**
 * The annual geriatric-syndrome screen, and the instrument ADA names for
 * frailty. Table 13.1 is quoted for the screening QUESTION as well as the tool,
 * because the question is what a clinic with no scale can still ask.
 */
const ADA_S13_SYNDROMES: Citation = {
  standard: "ADA",
  version: "Standards of Care in Diabetes—2026, Section 13, rec 13.2 and Table 13.1",
  title: "13. Older Adults: Standards of Care in Diabetes—2026",
  url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC12690186/",
  retrieved: RETRIEVED,
  csoSigned: false,
  quote:
    "13.2 Screen at least annually for geriatric syndromes (e.g., cognitive impairment, depression, urinary incontinence, falls, persistent pain, and frailty), hypoglycemia, and polypharmacy in older adults with diabetes, as they may affect diabetes management and diminish quality of life. B … Frailty — Have you felt unusually tired recently or had difficulty walking up steps without resting? — Clinical Frailty Scale (CFS) — 1 [item] — 1–9 — ≥5 clinically meaningful frailty",
  needsCsoInput:
    "ADA NAMES the Clinical Frailty Scale and gives its range and cut point; it does not reproduce the scale, whose nine descriptors are the instrument's own and are not reproduced here either. A site that grades on the CFS needs a licensed copy in front of the clinician — the number field below records a score, it does not teach the scale. CSO to confirm the site holds one, or to substitute the screening question alone.",
};

/** The cognitive screen, and the tool ADA names for it. */
const ADA_S13_COGNITION: Citation = {
  standard: "ADA",
  version: "Standards of Care in Diabetes—2026, Section 13, rec 13.3 and Table 13.1",
  title: "13. Older Adults — Neurocognitive Function",
  url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC12690186/",
  retrieved: RETRIEVED,
  csoSigned: false,
  quote:
    "13.3 Screening for early detection of mild cognitive impairment or dementia should be performed for adults 65 years of age or older at the initial visit, annually, and as appropriate. B … Cognitive impairment or dementia — Have you noticed any changes in your memory or ability to think clearly? — Mini-Cog — 5 [items] — 0–5 — <3 validated for dementia screening",
};

/**
 * The mechanism, which is what turns both of the findings above from geriatric
 * housekeeping into diabetes findings: they are how the low happens.
 */
const ADA_S13_HYPO: Citation = {
  standard: "ADA",
  version: "Standards of Care in Diabetes—2026, Section 13, rec 13.4 and Hypoglycemia narrative",
  title: "13. Older Adults — Hypoglycemia",
  url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC12690186/",
  retrieved: RETRIEVED,
  csoSigned: false,
  quote:
    "Cognitive dysfunction may make it difficult for individuals to perform complex self-care tasks, such as monitoring glucose, administering and adjusting insulin doses, and maintaining the timing and nutritional content of meals. These factors increase risk for hypoglycemia … 13.4 Ascertain and address episodes of hypoglycemia at routine visits because older adults with diabetes have a greater risk of hypoglycemia, especially when treated with hypoglycemic agents (e.g., sulfonylureas, meglitinides, and insulin). B … Cognitive decline has been associated with increased risk of hypoglycemia, and conversely, severe hypoglycemia has been linked to increased risk of dementia.",
};

/**
 * Table 13.2 — the framework the whole older-adult segment exists to feed. The
 * three category definitions are quoted in full because the thresholds inside
 * them (two ADL impairments, moderate-to-severe cognitive impairment) are what
 * the two findings below are shaped to answer.
 */
const ADA_S13_TARGETS: Citation = {
  standard: "ADA",
  version: "Standards of Care in Diabetes—2026, Section 13, Table 13.2",
  title:
    "13. Older Adults — Framework for considering treatment goals for glycemia, blood pressure, and dyslipidemia in older adults with diabetes",
  url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC12690186/",
  retrieved: RETRIEVED,
  csoSigned: false,
  quote:
    "Healthy (few coexisting chronic illnesses, intact cognitive and functional status) … <7.0–7.5% … Complex/intermediate (multiple coexisting chronic illnesses or two or more ADL impairments or mild to moderate cognitive impairment) … <8.0% … Very complex/poor health (PALTC or end-stage chronic illnesses or moderate to severe cognitive impairment or two or more ADL impairments) … Avoid reliance on A1C; glucose management decisions should be based on avoiding hypoglycemia and symptomatic hyperglycemia",
  needsCsoInput:
    "ADA counts 'ADL impairments' and splits its categories at two of them, but names NO instrument and no list of activities — Katz, Barthel and Lawton all count different things and would give different answers for the same patient. The count field below therefore ships without a scale, and what it means depends on which list the clinician had in mind. CSO to nominate one instrument for the site, or to replace the count with that instrument's own items. SEPARATELY, ADA AND UCG DIVERGE ON WHEN A TARGET IS RELAXED AT ALL, AND BOTH ARE RECORDED. The table above relaxes on HEALTH STATUS and never mentions age. Uganda Clinical Guidelines 2023 §8.1.3 (p 475, https://library.health.go.ug/sites/default/files/resources/Uganda%20Clinical%20Guidelines%202023.pdf) relaxes on CHRONOLOGICAL AGE, in one line for everybody: 'Treatment targets: Fasting blood sugar <7 mmol/l; Postprandial sugar <10 mmol/l; HbA1c <7% (7.5 % for elderly). Elderly people are at higher risk of hypoglycaemia. Monitor carefully, and do not aim at very strict control of blood sugar.' Under UCG a robust 80-year-old is relaxed to 7.5% and a frail 60-year-old is not; under ADA it is the other way round. UCG's rule needs no examination finding at all, only a date of birth, so nothing in this file is written for it — but its warning is the same clinical instruction ADA reaches by a longer road, and a site on UCG should still be shown these findings. CSO to decide which rule the site applies.",
};

/**
 * The Ugandan text. Fetched in full and read directly rather than corroborated,
 * because both divergences this file records are things UCG says that no
 * international guideline says. Its OTHER divergence — the age-based target —
 * needs no feature of its own and is quoted on `ADA_S13_TARGETS` instead, beside
 * the framework it disagrees with.
 */
const UCG_2023_GDM: Citation = {
  standard: "local",
  version: "Uganda Clinical Guidelines 2023, section 16.2.5 (pp 711–712)",
  title:
    "Uganda Clinical Guidelines 2023 — National Guidelines on the Management of Common Conditions (Ministry of Health, Uganda)",
  url: "https://library.health.go.ug/sites/default/files/resources/Uganda%20Clinical%20Guidelines%202023.pdf",
  retrieved: RETRIEVED,
  csoSigned: false,
  quote:
    "Risk factors (and indication for screening): BMI >35 kg/m2; Age >40 years; GDM in previous pregnancy; Family history … of diabetes; Previous unexplained third trimester death, macrosomic baby (weight >4 kg); Polyhydramnios; Glycosuria; Foetus large for gestational age",
  needsCsoInput:
    "ADA AND UCG DIVERGE HERE AND BOTH ARE RECORDED. UCG screens for gestational diabetes on RISK FACTORS and prints the list under the heading 'Risk factors (and indication for screening)'; ADA 2.32 screens EVERY pregnancy at 24–28 weeks. A site following UCG needs the examination findings in that list captured, which is why the finding exists; a site following ADA must never read their absence as a reason not to screen, which is why the important-negative says so. One bullet in the printed list is typographically corrupt in the source PDF ('Family history (8 first degree relatives) of diabetes') and is quoted here with the corrupt parenthesis elided rather than guessed at. CSO to decide which screening rule the site follows, and to read that bullet from a clean copy.",
};

/**
 * ISPAD, for the one instruction no other retrieved source gives: LOOK, yearly,
 * in pubertal girls. Cited without a quote on purpose — see below.
 */
const ISPAD_2024_T2D: Citation = {
  standard: "local",
  version: "ISPAD Clinical Practice Consensus Guidelines 2024 — Type 2 Diabetes",
  title:
    "Shah AS, et al. ISPAD Clinical Practice Consensus Guidelines 2024: Type 2 Diabetes in Children and Adolescents. Horm Res Paediatr 2024;97:555–583",
  url: "https://karger.com/hrp/article/97/6/555/918111/ISPAD-Clinical-Practice-Consensus-Guidelines-2024",
  retrieved: RETRIEVED,
  csoSigned: false,
  needsCsoInput:
    "NO QUOTE IS ASSERTED FROM THIS SOURCE. The article was retrieved and read, but only through a summarising fetch — a direct request for the page returns the publisher's script shell, so the wording could not be confirmed character-for-character and nothing is put in quotation marks on that basis. What it was read for, and what is relied on here, is the direction to assess menstrual irregularity and examine for hyperandrogenism yearly from diabetes onset in pubertal females, and the list of features favouring type 2 over type 1 at onset in youth (BMI at or above the 85th percentile, signs of insulin resistance, associated metabolic comorbidities, family history of type 2 diabetes, absent autoantibodies) against those favouring type 1 (BMI below the 85th percentile, onset under 10 years, pre-pubertal at onset, ketoacidosis at presentation). ISPAD is not one of the enumerated standard bodies, hence `local`. Every clinical claim this file actually makes is carried by an ADA citation that WAS confirmed verbatim; this one supplies the reason to look. CSO to obtain the article and ratify.",
};

const EX = "examination";

/**
 * A finding of the general survey. Everything in this file lands in the same
 * region — "From the end of the bed" — and that is the correct place for it: a
 * family history, a frailty, a cognition and a large uterus are all things a
 * clinician has formed a view on before the examination proper begins, and none
 * of them is a system to be examined.
 */
const finding = (f: Omit<Feature, "section" | "kind" | "group">): Feature => ({
  ...f,
  kind: "sign",
  section: EX,
  group: "gx_survey",
});

/** Asked rather than seen, but asked at the same moment and recorded beside it. */
const asked = (f: Omit<Feature, "section" | "kind" | "group">): Feature => ({
  ...f,
  kind: "history",
  section: EX,
  group: "gx_survey",
});

/** Counted rather than judged. Measurements carry no `discriminates` (ADR 0083). */
const measure = (f: Omit<Feature, "section" | "kind" | "group">): Feature => ({
  ...f,
  kind: "measurement",
  section: EX,
  group: "gx_survey",
});

/** Characterises the finding above it; only asked once that is present. */
const prop = (parent: string, f: Omit<Feature, "section" | "parent">): Feature => ({
  ...f,
  section: EX,
  parent,
});

export const AGE_SPECIFIC_FEATURES: Feature[] = [
  /* ── adolescent: which diabetes is this ──────────────────────────────── */
  asked({
    /**
     * UNBANDED, deliberately. A family history argues at every age — it is one
     * of ADA's adult screening criteria as well as one of its youth ones — and
     * the age-specific claim is not the history itself but the PATTERN in it,
     * which is the property below and which carries the band.
     *
     * The strength is weak and stays weak. ADA grades a first- or second-degree
     * relative with type 2 diabetes as A-level evidence for SCREENING somebody
     * who does not yet have diabetes; that is a different question from telling
     * two diagnosed patients apart, and type 1 clusters in families too. What
     * this field is really for is the negative — no diabetes anywhere in the
     * family is the first thing that makes MODY unlikely.
     */
    code: "family_history_diabetes",
    display: "Diabetes in the family",
    valueType: "boolean",
    synonyms: [
      "family history of diabetes",
      "FH diabetes",
      "first-degree relative with diabetes",
      "second-degree relative with diabetes",
    ],
    elicitation:
      "Ask by PERSON, not by category: mother, father, brothers and sisters, then grandparents and aunts and uncles on each side separately. Ask who takes tablets or injections for sugar rather than who was 'told they had diabetes' — the second question misses everyone treated before they were labelled. Record a NO explicitly when nobody is affected; a blank cannot argue and a recorded no can.",
    citation: ADA_S2_YOUTH_RISK,
    discriminates: [
      {
        condition: "type_2_diabetes",
        direction: "supports",
        strength: "weak",
        rationale:
          "ADA grades a family history of type 2 diabetes in a first- or second-degree relative as A-level evidence for screening a young person with overweight or obesity. Weak here because that is a reason to TEST somebody without diabetes, not a way to type somebody who already has it — type 1 clusters in families as well, and in a population where type 2 diabetes is common a family history is close to universal.",
        citation: ADA_S2_YOUTH_RISK,
      },
    ],
    importantNegative: {
      absenceRefutes: ["mody"],
      caveat:
        "It refutes MODY only, and only softly. ADA's trigger for genetic testing is a family history in successive generations, so no family history at all removes the trigger — but the recommendation says when to TEST and says nothing about what an absent history excludes, and a family history is a record of who was DIAGNOSED rather than of who was affected. Where most adults with diabetes have never been tested, 'no diabetes in the family' frequently means 'nobody looked'. It refutes neither type 1 nor type 2 diabetes: most people with either have no affected relative.",
      citation: ADA_S2_MODY,
    },
  }),
  prop("family_history_diabetes", {
    /**
     * The MODY discriminator, and the one place in this file where a band is
     * doing real work: ADA writes the recommendation for "children and young
     * adults", and `mody` in conditions.ts is banded the same way, so the two
     * cannot drift apart.
     *
     * MODERATE, not strong, and the tier is the honest part. Diabetes through
     * three generations is also exactly what a type 2 family looks like, and
     * ADA's recommendation is CONDITIONAL — it applies to somebody who does not
     * have the typical characteristics of type 1 or type 2 in the first place.
     * The pattern alone in an obese, acanthotic adolescent argues for very
     * little; the pattern in a lean adolescent with detectable C-peptide and no
     * autoantibodies is the whole case, and those three fields already exist.
     */
    code: "family_diabetes_successive_generations",
    display: "Diabetes in successive generations, on one side of the family",
    kind: "history",
    valueType: "boolean",
    ageBands: ["adolescent", "adult"],
    synonyms: [
      "autosomal dominant inheritance",
      "vertical transmission",
      "three-generation family history",
      "MODY pattern",
    ],
    elicitation:
      "Draw it, do not summarise it. Sketch a three-generation tree on the notes: the patient, their parents, their grandparents, and mark who has diabetes and at what age it started. What you are looking for is an affected parent AND an affected grandparent on the SAME side, which is what an autosomal-dominant pattern looks like on paper. Diabetes scattered on both sides in middle age is a type 2 family, not this.",
    citation: ADA_S2_MODY,
    discriminates: [
      {
        condition: "mody",
        direction: "supports",
        strength: "moderate",
        rationale:
          "ADA sends children and young adults with a family history of diabetes in successive generations, suggestive of autosomal-dominant inheritance, for MODY genetic testing. Moderate rather than strong because the recommendation is conditional on the patient NOT having the typical characteristics of type 1 or type 2 — and because a multigenerational family history is also the ordinary picture of familial type 2 diabetes, which is far commoner. It raises the question; C-peptide, autoantibodies and body habitus decide whether it is worth asking.",
        citation: ADA_S2_MODY,
      },
    ],
  }),

  finding({
    /**
     * UNBANDED, and that is the deliberate decision. ISPAD is why this is looked
     * for in a diabetes clinic at all — it asks for menstrual history and an
     * examination for hyperandrogenism yearly from diagnosis in pubertal girls —
     * but ADA lists polycystic ovary syndrome as an insulin-resistance marker in
     * Table 2.5 for adults of any age as well as in Table 2.6 for youth. A band
     * would hide the finding from the adult women the adult table describes, and
     * hiding a finding is what a band does.
     *
     * Gated on `sex` rather than on age for the same reason: the question is
     * meaningless without a menstrual history, and that is a fact about the
     * patient rather than about their life stage.
     */
    code: "pcos_features",
    display: "Irregular periods with hirsutism, acne or male-pattern hair loss",
    valueType: "boolean",
    showWhen: { feature: "sex", op: "==", value: "female" },
    synonyms: [
      "polycystic ovary syndrome",
      "PCOS",
      "hyperandrogenism",
      "hirsutism",
      "oligomenorrhoea",
    ],
    elicitation:
      "Ask the cycle first: how many periods in the last year, and how far apart. Then look, with permission and with the patient covered — coarse dark hair on the upper lip, chin, around the nipples or up the midline below the umbilicus; acne along the jaw and upper back; recession at the temples. Fine downy hair and the hair pattern that runs in the family are not this. Record the two halves together: cycles alone are irregular for many reasons, and hair alone is often familial.",
    citation: ISPAD_2024_T2D,
    discriminates: [
      {
        condition: "type_2_diabetes",
        direction: "supports",
        strength: "moderate",
        rationale:
          "ADA lists polycystic ovary syndrome among the signs of insulin resistance that trigger type 2 screening in a young person, and among the insulin-resistance conditions that trigger it in an adult. In somebody already diagnosed, it is bedside evidence that the mechanism is resistance rather than autoimmune destruction. Moderate rather than strong because insulin resistance is shared with obesity, which is now common in type 1 diabetes as well — a young woman can have polycystic ovary syndrome and autoimmune diabetes at the same time.",
        citation: ADA_S2_ADULT_RISK,
      },
    ],
    importantNegative: {
      absenceRefutes: ["type_2_diabetes"],
      caveat:
        "Barely, and it is the most over-read negative in this file. ADA records that overweight and obesity are common in children with type 1 diabetes, that autoantibodies and ketosis turn up in young people with the clinical features of type 2 — obesity and acanthosis nigricans included — and that about 11% of 10–19-year-olds with type 2 diabetes present in ketoacidosis. The phenotypes overlap in BOTH directions. Regular cycles and no hirsutism say only that this one marker of insulin resistance is absent; they do not make the diabetes autoimmune, and they say nothing at all in a woman past the menopause or on a hormonal contraceptive, in whom the menstrual half of the finding cannot be assessed. Autoantibodies and C-peptide settle the type; nothing at the bedside does.",
      citation: ADA_S14_OVERLAP,
    },
  }),

  asked({
    /**
     * The one adolescent finding here that is a behaviour rather than a
     * phenotype, and it is in this file because ADA puts it in this age group
     * by name: "a particularly dangerous behavior in this population".
     *
     * DISTINCT from `treatment_omission` in the precipitants section, which asks
     * whether doses were missed. That field's commonest answer in this setting is
     * a stock-out or a cost, and the response to it is supply. This one has a
     * reason attached, and the response to it is a behavioural health referral —
     * ADA 14.9 says so — not a larger insulin dose. Recording them as one field
     * would send half of these patients down the wrong pathway.
     *
     * Banded away from `older_adult` and nowhere else: SEARCH found it in
     * adolescents AND young adults, and an eating disorder does not end at
     * twenty. No danger sign — the crisis symptoms already carry the red, and a
     * second siren on a question this sensitive would only teach people to skip
     * it.
     */
    code: "insulin_omission_for_weight_control",
    display: "Insulin left out, or cut down, to lose weight",
    valueType: "boolean",
    ageBands: ["adolescent", "adult"],
    showWhen: { feature: "glucose_lowering_therapy", op: "==", value: "insulin" },
    synonyms: [
      "insulin omission for weight loss",
      "insulin restriction",
      "diabulimia",
      "disordered eating with type 1 diabetes",
    ],
    elicitation:
      "Ask it alone, without a parent in the room, and ask it without a flinch — this is a question a great many young people answer honestly once, to the first person who asks it plainly. Normalise it before you ask: many people find that skipping insulin brings the weight down, has that ever been something you have done. Then ask about the pattern that gives it away — unexplained weight loss, an HbA1c that does not match the meter, secrecy around eating, repeated admissions in ketoacidosis. A denial is not a negative here.",
    citation: ADA_S14_PSYCH,
    discriminates: [
      {
        condition: "dka",
        direction: "supports",
        strength: "moderate",
        rationale:
          "Omitted insulin is the commonest avoidable route into ketoacidosis, and ADA names ketoacidosis among the signs that should prompt a disordered-eating screen in this age group — the two point at each other. Moderate rather than strong because the finding explains a recurrent pattern rather than establishing a current crisis: ketones and acid–base do that, and a young person who admits to this may be perfectly well today.",
        citation: ADA_S14_PSYCH,
      },
    ],
  }),

  /* ── pregnancy: gated on the state, never on a band ──────────────────── */
  finding({
    /**
     * UCG's screening indication, captured because a Ugandan midwife holds it in
     * her hands: a tape measure and a palpating hand produce two of the items on
     * that list before any blood is taken.
     *
     * The IMPORTANT NEGATIVE is the entire point of the entry, and the reason
     * both standards are cited on one finding. UCG's list makes this a REASON TO
     * SCREEN. ADA 2.32 screens everybody at 24–28 weeks regardless, so a uterus
     * that measures right for dates is not a reason not to. A catalog that
     * captured the first without the second would have built a way to talk
     * clinicians out of a universal screen.
     *
     * NO age band. Pregnancy is a state, not a life stage, and the `pregnant`
     * gate is doing all the work a band could do without any of the risk of
     * hiding it from a pregnant patient banded elsewhere.
     */
    code: "uterus_large_for_dates",
    display: "Uterus large for dates, or clinical polyhydramnios",
    valueType: "boolean",
    showWhen: { feature: "pregnant", op: "present" },
    synonyms: [
      "large for gestational age",
      "symphysis-fundal height discrepancy",
      "macrosomia",
      "polyhydramnios",
    ],
    elicitation:
      "Measure the symphysis–fundal height with a tape, in centimetres, from the upper border of the symphysis pubis to the top of the fundus, and compare it with the gestation the last menstrual period gives. NO NUMERIC DISCREPANCY IS ASSERTED HERE — UCG states none and none is invented; record it large for dates when it is larger than the gestation explains, and say what both numbers were. Then feel for the second half: a fluid thrill, fetal parts that are hard to define, a uterus that feels tense. Confirm on ultrasound wherever there is one.",
    citation: UCG_2023_GDM,
    discriminates: [
      {
        condition: "gestational_diabetes",
        direction: "supports",
        strength: "moderate",
        rationale:
          "Uganda Clinical Guidelines print polyhydramnios and a foetus large for gestational age among the risk factors that ARE the indication for screening a pregnancy for diabetes, alongside a previous macrosomic baby. Moderate rather than strong because both findings have obstetric explanations that have nothing to do with glucose — wrong dates, multiple pregnancy, a constitutionally large baby — and because the finding is a reason to test rather than a result.",
        citation: UCG_2023_GDM,
      },
    ],
    importantNegative: {
      absenceRefutes: ["gestational_diabetes"],
      caveat:
        "IT REFUTES ALMOST NOTHING, AND MUST NEVER STOP A SCREEN. ADA screens EVERY pregnancy at 24–28 weeks precisely because most gestational diabetes occurs in women with no risk factor at all, and the fundal height of a well-grown baby is normal for most of the pregnancy in which the diabetes is developing. A uterus measuring right for dates is a reason to screen on the calendar, not a reason to skip it. Where the site follows UCG's risk-factor rule instead, the other items on that list — the previous macrosomic baby, the glycosuria, the BMI, the age — are all still live.",
      citation: ADA_S2_GDM_SCREEN,
    },
  }),

  asked({
    /**
     * Why euglycaemic ketoacidosis is discriminable in pregnancy at all.
     *
     * The trap is specific and it is well described: pregnancy is itself a
     * ketogenic state, the consensus names pregnancy AND reduced food intake as
     * causes of euglycaemic ketoacidosis in the same sentence, and the glucose —
     * the number everyone looks at — is by definition below 11.1 mmol/L. A
     * pregnant woman who cannot eat is the one patient in this catalog where a
     * reassuring glucose is the most dangerous finding on the chart.
     *
     * `urgency: same_day` and no danger sign. The deadline is the whole content
     * of the entry — ketones today, not at the next antenatal visit — and ADR
     * 0083 keeps that axis separate from how loud the alarm is. A red here would
     * duplicate the crisis symptoms that already fire on vomiting and abdominal
     * pain in a suspected crisis.
     *
     * NO important negative. Eating normally refutes nothing worth writing down:
     * SGLT2 inhibitors account for most euglycaemic ketoacidosis and require no
     * fasting at all, and pregnancy is on the list in its own right. Declaring a
     * negative whose caveat would have to say "this excludes nothing" is worse
     * than declaring none.
     */
    code: "pregnancy_reduced_oral_intake",
    display: "Not eating, or not keeping food down, in this pregnancy",
    valueType: "boolean",
    showWhen: { feature: "pregnant", op: "present" },
    urgency: "same_day",
    synonyms: [
      "starvation ketosis of pregnancy",
      "hyperemesis gravidarum",
      "not tolerating oral intake",
      "reduced food intake in pregnancy",
    ],
    elicitation:
      "Ask what she has actually eaten and drunk since yesterday, meal by meal, rather than whether she is eating — 'a bit' means nothing. Ask whether food stays down, for how many days it has not, and whether she has been fasting for any reason. Then act on it: in a pregnant woman with type 1 diabetes who is not eating, check KETONES even when the glucose is normal, and check them today.",
    citation: ADA_S15_PREGNANCY_DKA,
    discriminates: [
      {
        condition: "euglycaemic_dka",
        direction: "supports",
        strength: "moderate",
        rationale:
          "The 2024 consensus names reduced food intake and pregnancy in the same sentence as causes of euglycaemic ketoacidosis — a ketoacidosis defined by a plasma glucose below 11.1 mmol/L — and ADA calls pregnancy a ketogenic state in which people with type 1 diabetes reach ketoacidosis at lower glucose levels than they otherwise would. The two together in one patient is the presentation in which the glucose looks reassuring and is not.",
        citation: ADAEASD_2024_EUDKA,
      },
      {
        condition: "dka",
        direction: "supports",
        strength: "weak",
        rationale:
          "The same physiology reaches ordinary ketoacidosis too, and ADA records that ketoacidosis in pregnancy carries a high risk of stillbirth and that those who cannot eat need dextrose alongside the insulin. Weak, because being unable to eat is common in early pregnancy and almost never this — what it earns is a ketone strip, not a diagnosis.",
        citation: ADA_S15_PREGNANCY_DKA,
      },
    ],
  }),

  /* ── older adult: is the treatment now the bigger risk ───────────────── */
  finding({
    /**
     * A diabetes finding, not a geriatric aside. ADA screens for frailty
     * annually in the same recommendation as hypoglycaemia and polypharmacy, and
     * Table 13.2 puts it among the things that move a person off the tight
     * target — so a frail older adult still being pushed to an HbA1c below 7% is
     * a treatment decision this finding is what reverses.
     *
     * Banded `older_adult` because ADA Section 13 is written for adults aged 65
     * and over and the Clinical Frailty Scale is a geriatric instrument. Frailty
     * exists younger — in dialysis, in advanced HIV, in cancer — and no
     * retrieved source lets this catalog say so, which the band makes visible
     * rather than hiding.
     */
    code: "frailty",
    display: "Frailty",
    valueType: "boolean",
    ageBands: ["older_adult"],
    synonyms: ["frail older adult", "Clinical Frailty Scale", "CFS", "frailty syndrome"],
    elicitation:
      "Start with ADA's own screening question — have you felt unusually tired recently, or had difficulty walking up steps without resting. Then WATCH: ask them to stand from the chair without using their arms and walk to the door. A history taken with the patient already seated misses this entirely. If you grade on the Clinical Frailty Scale, grade their USUAL state two weeks before whatever brought them in, not the state the acute illness has put them in today.",
    citation: ADA_S13_SYNDROMES,
    discriminates: [
      {
        condition: "hypoglycaemia",
        direction: "supports",
        strength: "moderate",
        rationale:
          "ADA screens for frailty in the same annual recommendation as hypoglycaemia and polypharmacy, and its treatment framework moves a frail older adult to a less stringent goal on the explicit rationale of avoiding lows. Moderate, and the mechanism matters: frailty does not cause hypoglycaemia — the insulin or the sulfonylurea does. What it establishes is that this person is still being treated to a target the guideline no longer wants for them, which makes the low that follows predictable rather than bad luck.",
        citation: ADA_S13_TARGETS,
      },
    ],
  }),
  prop("frailty", {
    /**
     * A MEASUREMENT, and therefore carrying no `discriminates` — the number
     * discriminates through ADA's own cut point, which is a rule and not a
     * property of this field. `refRange` is the SCALE, 1 to 9, not a normal band:
     * the same convention the GCS uses in exam-cns.ts, and for the same reason.
     * ADA gives the cut point as 5 or more; that threshold belongs where it can
     * be cited beside the standard it came from.
     */
    code: "clinical_frailty_score",
    display: "Clinical Frailty Scale",
    kind: "measurement",
    valueType: "number",
    unit: "points",
    refRange: { low: 1, high: 9 },
    citation: ADA_S13_SYNDROMES,
  }),

  finding({
    /**
     * The other half of the same argument, and the one with a mechanism ADA
     * states outright: cognitive dysfunction makes the complex self-care tasks —
     * monitoring, dosing, timing meals — difficult, and those factors increase
     * the risk of hypoglycaemia, which in turn worsens cognition.
     *
     * CHRONIC, and the distinction is load-bearing. `disorientation` in the
     * neurological segment is NEW confusion in a patient who is unwell now, and
     * it argues for a hyperosmolar state or a low happening in front of you.
     * This is a months-long change in a patient who is otherwise well, and it
     * argues about the treatment plan. Answering one in place of the other would
     * put an acute finding into a chronic profile or a chronic one into a crisis.
     */
    code: "cognitive_impairment",
    display: "Cognitive impairment affecting self-management",
    valueType: "boolean",
    ageBands: ["older_adult"],
    synonyms: [
      "mild cognitive impairment",
      "MCI",
      "dementia",
      "memory problems",
      "Mini-Cog",
      "neurocognitive impairment",
    ],
    elicitation:
      "Ask ADA's question of the patient — have you noticed any changes in your memory or ability to think clearly — and then ask the person who lives with them, separately, because the two answers differ and the second is usually the true one. Use a short validated instrument if you have one; ADA names the Mini-Cog. Then test what it COSTS: ask them to name their insulin, show you how they draw it up, and say what they do when they feel shaky. This is about the last months. New confusion today is a different finding and belongs in the neurological segment.",
    citation: ADA_S13_COGNITION,
    discriminates: [
      {
        condition: "hypoglycaemia",
        direction: "supports",
        strength: "moderate",
        rationale:
          "ADA states the mechanism plainly: cognitive dysfunction makes monitoring glucose, administering and adjusting insulin and timing meals difficult, and those factors increase the risk of hypoglycaemia — with cognitive decline independently associated with increased risk of lows, and severe lows with later dementia. Moderate rather than strong because the impairment does not lower the glucose by itself; it is the reason a plan the patient cannot execute keeps producing lows nobody can explain.",
        citation: ADA_S13_HYPO,
      },
    ],
  }),
  prop("cognitive_impairment", {
    /**
     * Two options, and they are not a severity scale for its own sake — they are
     * the exact line ADA Table 13.2 draws between its two relaxed categories.
     * Mild to moderate impairment lands a patient in complex/intermediate, with
     * an HbA1c goal below 8%; moderate to severe lands them in very complex,
     * where the table stops using HbA1c at all and asks only that lows and
     * symptomatic highs be avoided. A finer grading would answer a question
     * nothing in this catalog asks.
     */
    code: "cognitive_impairment_severity",
    display: "How severe",
    kind: "sign",
    valueType: "single_select",
    citation: ADA_S13_TARGETS,
    options: [
      { value: "mild_to_moderate", display: "Mild to moderate" },
      { value: "moderate_to_severe", display: "Moderate to severe" },
    ],
  }),

  measure({
    /**
     * A COUNT, so it carries no `discriminates` — it discriminates through ADA's
     * own threshold of two or more, which is a rule (ADR 0083). Two is the
     * number that moves a patient out of the healthy category in Table 13.2, and
     * it is the same number again at the boundary of the very complex one.
     *
     * It ships WITHOUT a reference range on purpose. ADA counts impairments and
     * names no instrument, and Katz, Barthel and Lawton count different things
     * over different totals — a range here would be this catalog inventing a
     * scale ADA declined to specify. The citation says so.
     */
    code: "adl_impairments",
    display: "Basic daily activities needing help",
    valueType: "number",
    unit: "activities",
    ageBands: ["older_adult"],
    citation: ADA_S13_TARGETS,
  }),

  finding({
    /**
     * The hyperosmolar finding, and the one entry in this file that argues for
     * an emergency rather than about a target. The consensus names two separate
     * mechanisms in one sentence — an age-related impairment of thirst, and
     * limited access to fluids — and separating them is what makes this a
     * question somebody can ask instead of a risk factor to note. One is about
     * the patient's physiology and the other is about who brings them water.
     *
     * Deliberately NOT a second dehydration examination. `dehydration`,
     * `dehydration_signs`, `capillary_refill_seconds` and the postural pair
     * already record what has happened to the circulation. This records WHY it
     * is going to happen again after the drip comes down, which is the finding
     * that keeps the patient out of the ward next month.
     */
    code: "impaired_thirst_or_fluid_access",
    display: "Cannot get a drink unaided, or no longer feels thirsty",
    valueType: "boolean",
    ageBands: ["older_adult"],
    synonyms: [
      "impaired thirst mechanism",
      "adipsia",
      "limited access to fluids",
      "dependent for fluids",
      "hypodipsia",
    ],
    elicitation:
      "Two questions, and either one alone is enough. Can they get a drink without help — is there water within reach of the bed, can they lift the cup, is there somebody who brings it and how often. And do they feel thirsty at all any more. Ask whoever cares for them as well as the patient, because a person who has stopped feeling thirsty will not report it as a symptom. Look in the mouth and under the arm afterwards, for what has already happened.",
    citation: ADAEASD_2024_HHS_OLDER,
    discriminates: [
      {
        condition: "hhs",
        direction: "supports",
        strength: "moderate",
        rationale:
          "The 2024 consensus makes volume depletion the primary driver of the hyperosmolar state and names exactly these two things — age-related impairment of thirst mechanisms and limited access to fluids — as why older adults with above-target glucose are at particular risk of it. Moderate rather than strong because it explains how somebody arrives here rather than establishing that they have: glucose and effective osmolality do that, and both are already captured.",
        citation: ADAEASD_2024_HHS_OLDER,
      },
    ],
    importantNegative: {
      absenceRefutes: ["hhs"],
      caveat:
        "A patient who drinks freely can still be profoundly hyperosmolar, and this negative must never delay a glucose or an osmolality. The osmotic diuresis of untreated hyperglycaemia outruns whatever anyone drinks, and infection precipitates 30–60% of hyperosmolar presentations — a person with a chest infection and free access to a jug is still on the same road. The state is established by glucose and effective osmolality, both of which are captured elsewhere, and never by a history of drinking.",
      citation: ADAEASD_2024_HHS_OLDER,
    },
  }),
];
