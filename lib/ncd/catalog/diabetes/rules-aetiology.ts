/**
 * Aetiology, as NAMED COMBINATIONS — the rows of the differential that are
 * reached by a drug history or by a kidney finding rather than by a bedside sign
 * (ADR 0083).
 *
 * ── Why these rows needed a rules file and not a `discriminates` ─────────────
 * Every other aetiological row in `conditions.ts` is raised by a finding that
 * argues on its own: acanthosis nigricans argues for type 2, a family history
 * through successive generations argues for MODY, wasting and jaundice argue for
 * a secondary cause. The rows below cannot be raised that way. A steroid on the
 * drug list is not a diagnosis, "on antiretroviral therapy" is true of a large
 * share of this catalog's population, and a reduced eGFR is the EXPECTED finding
 * in the condition it is being used to argue against. Each of them only means
 * something in a COMBINATION — a drug and a glucose, a kidney and a retina —
 * which is the shape `Criterion` already expresses and the reason ADR 0083 put
 * numeric and compound discrimination in rules rather than on features.
 *
 * One rule here argues the other way, and it is deliberate. `diabetic_kidney_
 * disease` had no rule at all and five `weak` findings, while the row that
 * competes with it was about to gain two combinations. A differential in which
 * one side can only ever accumulate weak points is one-sided in the direction of
 * whichever side got written first, so ADA's typical-presentation sentence is
 * encoded beside the two departures from it.
 *
 * ── What these rules deliberately do NOT claim ───────────────────────────────
 * They do not classify. `diagnosis.ts` owns aetiological classification and
 * returns `unclassified` unless a C-peptide or an islet-autoantibody result
 * settles it; nothing here may be read as a type. They RANK — "consider this,
 * and here is what would settle it" — and a rule firing changes an order, never a
 * label. None of them carries `rulesOut`, and that is a decision rather than an
 * omission: every source below offers its finding as a reason to consider an
 * ALTERNATIVE OR ADDITIONAL cause, and none of them excludes anything.
 *
 * ── Two rows were removed rather than wired, and the reasons are recorded ────
 * `ketosis_prone_type_2_diabetes` and `pancreatogenic_diabetes` were on the same
 * list as the rows below and are gone from `conditions.ts`. The removal notes sit
 * at the site each entry occupied and both were rewritten after review. In short:
 * the first is already adjudicated by a `Classification` on the same two tests,
 * and the only rule reaching it today would restate that adjudication in a weaker
 * construct on tests neither reference site can run — which, since the ranker
 * skips any rule that is not `met`, would silence a validator warning while
 * changing nothing; the second has no capture anywhere for exocrine failure,
 * pancreatic surgery or chronic pancreatitis, and the one adjacent field is a
 * CRISIS-PRECIPITANT checkbox meaning something else. Neither removal rests on
 * the claim that ranking from phenotype is forbidden — this layer ranks
 * `type_1_diabetes` from wasting and `type_2_diabetes` from acanthosis nigricans,
 * and a standard the neighbouring rows do not meet is not a reason to delete a
 * third. What each removal note now records is the asymmetry it leaves behind.
 *
 * ── A drug on the list is not an attribution ─────────────────────────────────
 * The structural trap in this file, and the one both drug rules are built
 * around. `drug_change_non_diabetes` records that a steroid or an antiretroviral
 * was started, stopped or changed. It does not record that the drug caused
 * anything, and the commonest alternative is not exotic: the illness the steroid
 * is treating raises the glucose by itself, and type 2 diabetes is common in
 * people with HIV for the same reasons it is common in everybody else. Both rules
 * therefore carry the alternative at the head of their mimic list, and neither
 * claims more than its source does.
 *
 * ── A crisis-precipitant field, read aetiologically ──────────────────────────
 * Both drug rules turn on `drug_change_non_diabetes`, which is a property of
 * `new_or_changed_drug` in the `precipitants` section — "Crisis precipitants:
 * what set this off — insulin and fluids alone will not fix it". A clinician
 * ticking it during a crisis workup is answering about the last few days; read
 * here, it is being asked to carry an aetiology over months. That is a SECOND
 * READING of a field authored for another purpose, and it is the same objection
 * `conditions.ts` uses to refuse `illness_type` and the pancreatogenic row. It is
 * disclosed on BOTH drug citations below rather than applied to one row and not
 * the other. What separates the two cases is that `illness_type` would have been
 * the only evidence for its entity, whereas both rules here conjoin the drug with
 * a glucose — which is why these ship disclosed and that one did not ship at all.
 * The CSO decides whether the second reading stands; a dedicated drug-exposure
 * history, with a date on it, would retire the question altogether.
 *
 * ── NOT YET WIRED, and this file cannot wire itself ──────────────────────────
 * `AETIOLOGY_RULES` is exported here and is NOT in `index.ts`'s `rules` array,
 * which is the only thing `rankDifferential` reads. Until that one-line change
 * lands, nothing below fires, the conditions these rules name stay `unreachable`
 * in the validator, and the ratchet test in `tests/ncd/diabetes-catalog.test.ts`
 * still lists them. Say that plainly rather than describe this file as having
 * resolved anything: it holds the rules, it does not yet deliver them.
 *
 * Every citation here is `csoSigned: false`. The rules ship gated dark.
 */
import type { Citation, DifferentialRule } from "@/lib/ncd/catalog/schema";

const RETRIEVED = "2026-09-08";

/* ── Sources fetched for this file ───────────────────────────────────────── */

/**
 * Steroid diabetes, and the two sentences that shape the rule rather than merely
 * licensing it.
 *
 * ADA's definition is PARENTHETICAL and it is the whole guard: glucocorticoid-
 * induced diabetes is "hyperglycemia in the absence of preexisting diabetes", so
 * a rule that fired on a known diabetic starting prednisolone would be naming the
 * wrong thing — that is a steroid destabilising an existing diabetes, which is a
 * management problem and not an aetiology. And the screening sentence names the
 * TEST: postprandial or random glucose rather than fasting, because the
 * hyperglycaemia is an insulin-resistance phenomenon that shows itself after
 * meals. The rule reads random and capillary glucose for that reason and reads no
 * fasting value at all.
 */
const ADA_S2_GLUCOCORTICOID: Citation = {
  standard: "ADA",
  version:
    "Standards of Care in Diabetes—2026, Section 2, Glucocorticoid-Induced Diabetes, rec 2.18",
  title: "2. Diagnosis and Classification of Diabetes: Standards of Care in Diabetes—2026",
  url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC12690183/",
  retrieved: RETRIEVED,
  csoSigned: false,
  quote:
    "The prevalence of glucocorticoid-induced diabetes (hyperglycemia in the absence of preexisting diabetes) depends on the drug's half-life, dose, and frequency of administration as well as the duration of treatment. … It is recommended that screening be performed by checking postprandial plasma glucose (possibly 1–2 h after meals) or random glucose rather than in the fasting state, as glucocorticoid-induced hyperglycemia generally results from insulin resistance. … 2.18 Monitor postprandial or random glucose levels with recurrent or long-term use of glucocorticoids.",
  needsCsoInput:
    'THREE deviations to ratify, none of them a threshold. (1) ADA states no glucose cut-point for this entity, so the rule uses this catalog\'s own diagnostic value for a random sample — 11.1 mmol/L, the same figure diagnosis.ts carries from WHO, ADA and IDF alike. That is a reuse, not a new number, but ADA did not state it here. (2) ADA describes the drug by half-life, dose, frequency and duration, and `drug_change_non_diabetes` records none of those — it records only that a steroid was among the drugs started or changed, with no dose, no route and no duration. A single intra-articular injection and three months of oral prednisolone are the same capture, so the rule cannot weigh what ADA says determines the prevalence, and its posterior is `moderate` for that reason. (3) `drug_change_non_diabetes` is a property of `new_or_changed_drug` in the crisis-PRECIPITANTS section — "what set this off — insulin and fluids alone will not fix it" — and this rule reads it aetiologically, over months rather than days. That is a second reading of a field authored for another purpose, it is the same objection conditions.ts uses to refuse `illness_type` for the pancreatogenic row, and the CSO should either ratify it or ask for a dedicated drug-exposure history.',
};

/**
 * HIV and antiretroviral therapy — cited for its TIMING, which is the one thing
 * in this area ADA states precisely, and which this catalog cannot measure.
 *
 * Recommendation 2.17 is unusual among the secondary causes in naming a window
 * rather than a phenotype: before starting, at a switch, and three to six months
 * after either. An earlier draft of this file claimed the rule below encodes that
 * window. It does not, and it cannot. `new_or_changed_drug` is a bare boolean
 * whose display reads "recently"; neither it nor any of its four properties
 * records a date or a duration, so there is nothing to threshold at six months,
 * and the criterion contains no temporal predicate of any kind. What the rule
 * encodes is the weaker, honest statement — an antiretroviral among the drugs
 * recently started or changed — and the window is carried in the notes as
 * guidance to the clinician. ADA's "before starting" arm is not reachable at all,
 * since the rule requires a change to have been recorded. The drug-class sentence
 * is quoted to be honest about its limits: ADA says "certain" protease inhibitors
 * and NRTIs and never says which, so no regimen option in this catalog may be
 * singled out on its authority.
 */
const ADA_S2_HIV: Citation = {
  standard: "ADA",
  version: "Standards of Care in Diabetes—2026, Section 2, rec 2.17",
  title: "2. Diagnosis and Classification of Diabetes: Standards of Care in Diabetes—2026",
  url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC12690183/",
  retrieved: RETRIEVED,
  csoSigned: false,
  quote:
    "2.17 People with HIV should be screened for diabetes and prediabetes with an FPG test before starting antiretroviral therapy, at the time of switching antiretroviral therapy, and 3–6 months after starting or switching antiretroviral therapy. If initial screening results are normal, FPG should be checked annually. … Diabetes risk is increased with certain protease inhibitors (PIs) and nucleoside/nucleotide reverse transcriptase inhibitors (NRTIs).",
  needsCsoInput:
    'SIX things the CSO should see. (1) ADA names no individual antiretroviral, so `art_regimen` is offered as a confirmatory field and is NOT read by any predicate here; singling out the two ritonavir-boosted options on the strength of the word "certain" would be inventing a specificity the source withholds, and every regimen on the list contains an NRTI, which would make a class predicate vacuous. (2) `hiv_on_art` was authored for an HbA1c-VALIDITY purpose and sits in that section. This rule reads it aetiologically. The datum is the same fact either way — this person has HIV and is taking antiretroviral therapy — and what differs is the claim made from it, which the evidence trail names in full; but the field was not written for this use and the CSO should ratify the second reading. (3) `art_regimen`\'s `optionEffects` table concerns interference with the HbA1c ASSAY (abacavir, zidovudine), not diabetogenicity, and must never be read as an attribution table. (4) `drug_change_non_diabetes` is a property of `new_or_changed_drug` in the crisis-PRECIPITANTS section — "what set this off" — and is read here aetiologically, over months rather than days. It is the same second reading the steroid rule makes, and it is disclosed on both. (5) THE WINDOW IS NOT ENCODED. Recommendation 2.17 names 3–6 months after starting or switching; nothing in this catalog records WHEN a drug changed, so the rule fires on a recorded antiretroviral change at an unspecified time and the window lives in the notes. ADA\'s "before starting antiretroviral therapy" arm is unreachable, because the rule requires a change to have happened. A timing property on `new_or_changed_drug` would close both gaps. (6) ADA\'s test in this window is a FASTING plasma glucose. The rule\'s hyperglycaemia arm also accepts a random or capillary glucose at 11.1 mmol/L, because `fpg` requires `lab.glucose` and a rule that reads nothing else is unreachable at a district site. Both figures are this catalog\'s own diagnostic values, reused rather than newly asserted, but ADA did not state them here.',
};

/**
 * Table 11.1 — the list this catalog was missing a way to act on, quoted whole.
 *
 * Five items, and the catalog can reach exactly two of them. "No retinopathy" is
 * `retinopathy_stage` recorded as `none`, which is the one item the examination
 * owns outright. "Very high UACR" is `urine_acr`, with the protein strip as the
 * bedside proxy where no quantitative ratio exists. Each now has a rule of its
 * OWN, because ADA lists them as separate reasons; an earlier draft made the
 * second a qualifier on the first, which left the item a district clinic can
 * actually read reachable only where there was an ophthalmoscope.
 *
 * The other three cannot be captured at all today: there is no urine-microscopy
 * feature for an active sediment, and `egfr` and `urine_acr` are single numbers
 * rather than series, so no rate of change can be computed. They are named in the
 * notes rather than approximated. ADA DOES state a number in the first item —
 * duration under five years — but states it of type 1, which this catalog never
 * records, and states it as an ALTERNATIVE to the retinopathy half rather than a
 * condition on it; it is not encoded, and the rule's notes say why. "Chronically
 * well-managed" glucose has no ADA number at all.
 *
 * A third rule sits above the two, and it argues the other way. Nothing in this
 * catalog named `diabetic_kidney_disease` in a rule, so every point that row
 * could ever gather came from `weak` findings while its alternative had
 * combinations — a differential that is one-sided in the direction of whichever
 * side got written first. ADA's typical-presentation sentence is the
 * counterweight, and it is quoted in its own citation below.
 */
const ADA_S11_NON_DIABETIC: Citation = {
  standard: "ADA",
  version:
    'Standards of Care in Diabetes—2026, Section 11, Table 11.1 ("Reasons to consider nondiabetic kidney diseases in a person with chronic kidney disease and diabetes") and the Diagnosis of Chronic Kidney Disease prose',
  title: "11. Chronic Kidney Disease and Risk Management: Standards of Care in Diabetes—2026",
  url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC12690176/",
  retrieved: RETRIEVED,
  csoSigned: false,
  quote:
    "Type 1 diabetes duration <5 years or no retinopathy; Active urine sediment (e.g., containing red blood cells or cellular casts); Chronically well-managed blood glucose; Rapidly declining eGFR; Rapidly increasing or very high UACR (>300 mg/g) or urine protein/creatinine level (>500 mg/g) … An active urinary sediment (containing red or white blood cells or cellular casts), rapidly increasing albuminuria or total proteinuria, the presence of nephrotic syndrome, rapidly decreasing eGFR, or the absence of retinopathy (particularly in type 1 diabetes) suggests alternative or additional causes of kidney disease. … The typical presentation of CKD in people with diabetes is considered to include long-standing duration of diabetes, retinopathy, albuminuria without gross hematuria, and gradually progressive loss of eGFR.",
  needsCsoInput:
    'TWO disclosed widenings, one unit note and one confirmation caveat. (1) ADA writes the retinopathy item as "Type 1 diabetes duration <5 years or no retinopathy" and qualifies the prose with "(particularly in type 1 diabetes)". This catalog holds no RECORDED diabetes type — `classify()` returns `unclassified` wherever C-peptide and islet autoantibodies are unavailable, which is both reference site profiles — so the rule cannot be restricted to type 1 and is applied irrespective of type. That widens it: kidney disease without retinopathy is considerably more common in type 2 diabetes and is often still diabetic. The rule\'s posterior is `low` for this reason and its mimic list leads with it. (2) ADA\'s "very high UACR" is stated as >300 mg/g. `urine_acr` is held in mg/mmol, and 30 mg/mmol is the boundary this catalog ALREADY equates with 300 mg/g in the KDIGO A3 stage in complications.ts; both rules reuse that existing equivalence rather than performing a fresh conversion, and a 3+ protein strip is a conservative bedside proxy where no quantitative ratio exists. (3) NOTHING HERE IS CALLED NEPHROTIC. An earlier draft described an ACR of 30 mg/mmol as "nephrotic-range"; it is the KDIGO A3 boundary, which is SEVERELY INCREASED albuminuria and is itself the classical diabetic finding. Nephrotic-range albuminuria is conventionally far above that boundary, the exact published figure could not be confirmed from a primary source in this pass, and it is therefore asserted nowhere in this file. (4) ADA\'s confirmation caveat governs every albuminuria predicate here — "two of three specimens of UACR collected within a 3- to 6-month period should be abnormal before considering an individual to have moderately or severely elevated albuminuria" — and is now carried as `requiresConfirmation` on the criteria themselves rather than only as prose, matching what complications.ts already does on both diabetic-kidney-disease criteria.',
};

/**
 * The DIABETIC side of the same argument, and the reason it had to be written.
 *
 * ADA states the typical presentation in one sentence, and it is a COMBINATION:
 * long duration, retinopathy, albuminuria without gross haematuria, a gradually
 * falling eGFR. Every finding in this catalog that argues for diabetic kidney
 * disease is `weak` on its own — correctly, since none of them is a kidney
 * finding — and no rule named the condition at all, so the two rules below could
 * accumulate combination-strength points while the commonest explanation of the
 * very same kidney could only ever accumulate weak ones. That asymmetry was a
 * property of which side got written first, not of the evidence.
 */
const ADA_S11_TYPICAL_DKD: Citation = {
  standard: "ADA",
  version:
    "Standards of Care in Diabetes—2026, Section 11, Diagnosis of Chronic Kidney Disease prose",
  title: "11. Chronic Kidney Disease and Risk Management: Standards of Care in Diabetes—2026",
  url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC12690176/",
  retrieved: RETRIEVED,
  csoSigned: false,
  quote:
    "The typical presentation of CKD in people with diabetes is considered to include long-standing duration of diabetes, retinopathy, albuminuria without gross hematuria, and gradually progressive loss of eGFR.",
  needsCsoInput:
    'THREE things this sentence does not give the rule. (1) It is a DESCRIPTION of a typical presentation and not a diagnostic criterion — complications.ts establishes diabetic kidney disease from the KDIGO thresholds, and the rule built on this sentence only RANKS. (2) ADA states no number for "long-standing", so `dm_duration` is a confirmatory field rather than a predicate; the alternative would be inventing a duration ADA declined to state. (3) "Without gross hematuria" is not encoded, because nothing in this catalog records haematuria — `urine_protein_strip` reads protein only. A visible-blood finding would strengthen this rule and would strengthen the two non-diabetic ones more.',
};

/** What the source says to DO about an aetiology nobody is sure of. */
const ADA_S11_REFER: Citation = {
  standard: "ADA",
  version: "Standards of Care in Diabetes—2026, Section 11, recs 11.12a and 11.12b",
  title: "11. Chronic Kidney Disease and Risk Management: Standards of Care in Diabetes—2026",
  url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC12690176/",
  retrieved: RETRIEVED,
  csoSigned: false,
  quote:
    "11.12a Individuals should be referred for evaluation by a nephrologist if they have rapidly increasing urinary albumin levels and/or rapidly decreasing eGFR and/or if the eGFR is <30 mL/min/1.73 m2. 11.12b Refer to a nephrologist for uncertainty about the etiology of kidney disease or difficult management issues.",
  needsCsoInput:
    "Recommendation 11.12b is the action both kidney rules point at, and it carries NO timeframe — which is why both are `routine` rather than `same_day`. Urgency here is the absence of a stated one, not a judgement that these patients can wait; a nephrotic presentation in particular carries thrombotic and infective risk that this catalog neither captures nor stages. The CSO should decide whether a local pathway ought to raise the second rule.",
};

/* ── Shared mimic lists ──────────────────────────────────────────────────── */

/**
 * NAMED STRINGS, never condition codes (ADR 0083). Every entry here lies outside
 * the diabetes catalog, so giving them codes would let the engine imply it
 * reasons about conditions it has no criteria for.
 *
 * The first item is the one that matters most and it is deliberately first:
 * ADA's list gives reasons to consider an alternative or ADDITIONAL cause, and
 * neither rule below argues that the kidney disease is not diabetic.
 */
const NON_DIABETIC_KIDNEY_MIMICS = [
  "Diabetic kidney disease itself, alone or alongside a second process — ADA's list gives reasons to consider an additional cause, not grounds to exclude the diabetic one, and kidney disease without retinopathy is common in type 2 diabetes",
  "Hypertensive nephrosclerosis",
  "HIV-associated nephropathy, or tenofovir proximal tubular toxicity in someone on antiretroviral therapy",
  "A glomerulonephritis — post-infectious, IgA, membranous or lupus",
  "Obstructive uropathy, including the neuropathic bladder of long-standing diabetes",
  "Analgesic, aminoglycoside or herbal-remedy nephrotoxicity",
  "Chronic pyelonephritis or reflux nephropathy",
  "Sickle-cell nephropathy",
  "Myeloma or another paraproteinaemia",
  "Acute kidney injury on a chronic background — dehydration, sepsis or a nephrotoxin",
];

/* ── Drug-induced ────────────────────────────────────────────────────────── */

const DRUG_INDUCED: DifferentialRule[] = [
  {
    /**
     * The one secondary cause that arrives with a date attached.
     *
     * Three predicates and all three are load-bearing. The STEROID is the
     * exposure. The GLUCOSE is what makes it a diabetes question rather than a
     * drug chart. And `dm_status` NOT being `known` is ADA's own parenthetical
     * turned into a predicate — without it the rule would fire on every person
     * with established diabetes who was started on dexamethasone, which is a
     * destabilised diabetes needing a dose review, not a new aetiology needing a
     * differential. That is the commonest way this rule could have been wrong,
     * and it is the one the source itself guards against.
     *
     * `drug_change_kind` is deliberately NOT in the criterion. It is a single
     * select describing the drug change as a whole, and a patient whose
     * metformin was switched on the same visit their prednisolone was started
     * has one answer for two events; reading it as if it described the steroid
     * would attribute a `stopped` to the wrong drug. It is offered as a
     * confirmatory field instead, where the clinician resolves it in prose.
     *
     * There is NO Cushingoid-habitus arm, and its absence is a capture gap
     * rather than a choice. `conditions.ts` describes the moon face, the striae,
     * the thin bruised skin and the proximal weakness as "recorded at the
     * general examination"; none of the four exists as a feature anywhere in
     * this catalog. When they do, they belong on this rule.
     */
    id: "glucocorticoid_hyperglycaemia_no_prior_diabetes",
    display:
      "A new hyperglycaemia after a steroid was started, with no diabetes before it — consider glucocorticoid-induced diabetes",
    condition: "glucocorticoid_induced_diabetes",
    when: {
      id: "glucocorticoid_induced_when",
      label:
        "A glucocorticoid among the drugs newly started or changed, with a random or capillary glucose ≥ 11.1 mmol/L, in someone not already known to have diabetes",
      all: [
        { feature: "new_or_changed_drug", op: "present" },
        { feature: "drug_change_non_diabetes", op: "==", value: "steroid" },
        { feature: "dm_status", op: "in", value: ["evaluating", "none"] },
      ],
      any: [
        { feature: "random_pg", op: ">=", value: 11.1, unit: "mmol/L" },
        { feature: "capillary_glucose", op: ">=", value: 11.1, unit: "mmol/L" },
      ],
      citation: ADA_S2_GLUCOCORTICOID,
    },
    posterior: "moderate",
    urgency: "routine",
    confirmWith: ["random_pg", "capillary_glucose", "hba1c", "drug_change_kind"],
    mimicsToExclude: [
      "Type 2 diabetes that was already there and has been unmasked rather than caused by the steroid — the commonest alternative, and the reason the HbA1c matters",
      "Stress hyperglycaemia of the acute illness the steroid is being given for",
      "An infection driving both the glucose and the steroid course",
      "Another diabetogenic drug started in the same episode — a thiazide, an antipsychotic, an antiretroviral or a TB regimen, each of which is a separate option on the same field",
      "Endogenous Cushing's syndrome rather than the prescription",
      "A hyperglycaemic crisis, which is graded by the acute rules and is not an aetiology",
    ],
    notes:
      "ADA screens for this with a postprandial or random glucose and says so explicitly — the hyperglycaemia is an insulin-resistance phenomenon that shows itself after meals — so a normal fasting value argues nothing here and no fasting predicate is read. The HbA1c is the field that separates this from a diabetes that was already present: it looks back weeks to months, and a steroid started days ago cannot have moved it, so a glucose in the diagnostic range beside an HbA1c that is not is the pattern that supports a recent cause. That inference is this catalog's, not ADA's, and it is offered as a confirmatory reading rather than as a criterion. The capture records no dose, no route and no duration, which ADA says are exactly what determine the prevalence; ask for all three before attributing anything.",
    citation: ADA_S2_GLUCOCORTICOID,
  },

  {
    /**
     * ADA's screening window, with the honest admission that the window itself
     * is not capturable here.
     *
     * Recommendation 2.17 says to test before starting antiretroviral therapy,
     * at a switch, and 3–6 months after either. An earlier draft of this rule
     * claimed to BE that window. It was not: `new_or_changed_drug` is a bare
     * boolean whose display reads "recently", it carries four properties and
     * none of them is a date, and the criterion held no temporal predicate of
     * any kind. What it encodes is weaker and now says so — an antiretroviral
     * among the drugs recently started or changed — with the window in the notes
     * where the clinician can apply it. ADA's "before starting" arm stays out of
     * reach until a change has been recorded.
     *
     * ── The guard was inverted, and this is the correction ──────────────────
     * It read `dm_status in ["known", "evaluating"]`, which excluded the people
     * recommendation 2.17 is written for — it is a SCREENING recommendation,
     * aimed at people who do not yet have diabetes — and included the people for
     * whom an antiretroviral AETIOLOGY cannot be the claim, since a diabetes
     * diagnosed a decade before the switch was not caused by it. The steroid
     * rule above excludes `known` for exactly that reason and says so in
     * writing; the two rules were applying opposite guards from identical
     * reasoning. This one now mirrors it, and the condition it raises is an
     * aetiology rather than a screening prompt.
     *
     * ── And it had no glucose in it at all ──────────────────────────────────
     * Four predicates, none of them about the blood sugar, ranking an aetiology
     * OF DIABETES in a person whose glucose may never have been abnormal. The
     * `any` branch below is ADA's own test for this window — a fasting plasma
     * glucose — widened to the random and capillary values this catalog already
     * uses to diagnose, so the rule is still reachable in a clinic with a
     * glucometer and no laboratory.
     *
     * It does not fire on HIV and antiretroviral therapy alone: in this
     * catalog's setting that would rank an antiretroviral aetiology for a very
     * large share of the diabetes clinic, every one of whom is at least as
     * likely to have ordinary type 2 diabetes, and a row that fires on everybody
     * orders nothing. It does not read `art_regimen` either — ADA says "certain"
     * protease inhibitors and NRTIs and never names one, and every regimen in
     * the list contains an NRTI, so a class predicate would match everything
     * while appearing to discriminate.
     *
     * There is no lipoatrophy arm. `lipodystrophy` exists but carries
     * `showWhen: glucose_lowering_therapy == "insulin"`, so it is only ever
     * rendered for insulin-treated patients and antiretroviral lipoatrophy in
     * anybody else can never be recorded.
     */
    id: "hiv_art_diabetes_at_regimen_change",
    display:
      "A new hyperglycaemia around an antiretroviral start or switch, with no diabetes known before it — consider an antiretroviral contribution",
    condition: "hiv_art_associated_diabetes",
    when: {
      id: "hiv_art_window_when",
      label:
        "HIV on antiretroviral therapy, with an antiretroviral among the drugs newly started or changed, a fasting glucose ≥ 7.0 mmol/L or a random or capillary glucose ≥ 11.1 mmol/L, in someone not already known to have diabetes",
      all: [
        { feature: "hiv_on_art", op: "present" },
        { feature: "new_or_changed_drug", op: "present" },
        { feature: "drug_change_non_diabetes", op: "==", value: "arv" },
        { feature: "dm_status", op: "in", value: ["evaluating", "none"] },
      ],
      any: [
        { feature: "fpg", op: ">=", value: 7.0, unit: "mmol/L" },
        { feature: "random_pg", op: ">=", value: 11.1, unit: "mmol/L" },
        { feature: "capillary_glucose", op: ">=", value: 11.1, unit: "mmol/L" },
      ],
      citation: ADA_S2_HIV,
    },
    posterior: "low",
    urgency: "routine",
    confirmWith: ["fpg", "random_pg", "hba1c", "art_regimen", "drug_change_kind"],
    mimicsToExclude: [
      "Ordinary type 2 diabetes, which is common in people with HIV for the same reasons it is common in everyone else and is the alternative this rule is weakest against",
      "Weight regain and central adiposity after starting effective antiretroviral therapy, rather than a drug effect on glucose",
      "An opportunistic or intercurrent infection raising the glucose",
      "A glucocorticoid or a TB regimen started in the same episode",
      "Pancreatic disease, including drug-induced pancreatitis",
      "An HbA1c distorted by the regimen itself — abacavir and zidovudine both make it read low — or by the anaemia, haemolysis or malaria that commonly sit alongside",
    ],
    notes:
      "ADA's test in this window is a FASTING plasma glucose, which is why `fpg` leads the confirmatory set and is deliberately absent from the steroid rule above — steroid hyperglycaemia is postprandial and this one is not. The window is ADA's and not this rule's: test before starting antiretroviral therapy, at the switch, and 3–6 months after either, then annually if normal. Nothing in this catalog records WHEN the drug changed, so ask, and read a rule that fired six years after a switch for what it is. Check `art_regimen` before trusting an HbA1c: abacavir- and zidovudine-containing combinations make the reading LOW for the glucose, and this catalog's validity layer already says so — that table is about the ASSAY, not about which regimens raise the glucose, and it must not be read as an attribution table. Attribution is genuinely uncertain and the posterior says so: ADA states an increased risk with certain protease inhibitors and NRTIs and names none of them, so this rule carries a timing association and not a cause. Do not stop or change antiretroviral therapy on the strength of a ranked row; that is an HIV-service decision.",
    citation: ADA_S2_HIV,
  },
];

/* ── Whose kidney is it: the diabetic pattern, and the two departures ─────── */

const KIDNEY: DifferentialRule[] = [
  {
    /**
     * The diabetic pattern, written down at last.
     *
     * This rule exists because of what was NOT in the catalog rather than what
     * was. `diabetic_kidney_disease` is ranked by five findings — pallor, a
     * diabetic skin lesion, limited joint mobility, a Dupuytren contracture,
     * peripheral oedema — and every one of them is `weak`, which is correct,
     * because not one of them is a kidney finding. No rule anywhere named the
     * condition. The two rules below it are COMBINATIONS, and a combination
     * outweighs any single finding by design. So the alternative had rules and
     * the usual explanation had none, and the order that produced was a property
     * of the authoring rather than of the patient.
     *
     * ADA's typical-presentation sentence is the combination that was missing,
     * and it is a combination: long duration, retinopathy, albuminuria without
     * gross haematuria, a gradually falling eGFR. Three of the four are
     * predicates here. Duration is not, because ADA states no number for
     * "long-standing" and this file does not invent one; haematuria is not,
     * because nothing in this catalog records it.
     *
     * It RANKS and does not establish. complications.ts owns the KDIGO
     * thresholds that ESTABLISH diabetic kidney disease, and this rule reuses
     * exactly those numbers, exactly that chronicity predicate and exactly that
     * confirmation flag, so the two constructs cannot end up disagreeing about
     * whether a kidney finding is there.
     */
    id: "dkd_typical_diabetic_pattern",
    display:
      "Retinopathy alongside a chronic kidney abnormality in known diabetes — the typical diabetic pattern",
    condition: "diabetic_kidney_disease",
    when: {
      id: "dkd_typical_pattern_when",
      label:
        "Retinopathy of any grade, in a person with known diabetes and a kidney abnormality present for at least 3 months, with an eGFR < 60 mL/min/1.73m², an ACR ≥ 3 mg/mmol or protein on the urine strip",
      all: [
        { feature: "dm_status", op: "==", value: "known" },
        { feature: "kidney_abnormality_3_months", op: "present" },
        { feature: "retinopathy_stage", op: "!=", value: "none" },
      ],
      any: [
        { feature: "egfr", op: "<", value: 60, unit: "mL/min/1.73m2" },
        { feature: "urine_acr", op: ">=", value: 3, unit: "mg/mmol" },
        { feature: "urine_protein_strip", op: "in", value: ["1plus", "2plus", "3plus"] },
      ],
      requiresConfirmation: true,
      citation: ADA_S11_TYPICAL_DKD,
    },
    posterior: "moderate",
    urgency: "routine",
    confirmWith: ["urine_acr", "urine_protein_strip", "egfr", "dm_duration", "hba1c"],
    mimicsToExclude: [
      "A second kidney process sitting on top of the diabetic one — retinopathy makes the diabetic pattern likely and excludes nothing, which is what ADA's Table 11.1 is a list of reasons to remember",
      "Hypertensive nephrosclerosis, which travels with the same retina and the same albuminuria",
      "Acute kidney injury on a chronic background — dehydration, sepsis or a nephrotoxin — which moves the eGFR without changing the underlying disease",
      "A urinary tract infection, heavy exercise, a febrile illness or heart failure inflating the albuminuria on this one specimen",
      "Visible blood in the urine, which ADA excludes from the typical picture and this catalog does not capture at all — ask, because it changes the answer",
    ],
    notes:
      'This ranks a cause; it does not establish the complication. complications.ts establishes diabetic kidney disease from the KDIGO criteria — the same eGFR and ACR thresholds, the same three-month chronicity — and requires the albuminuria confirmed on repeat specimens, which is why this criterion carries the same flag. ADA states no number for "long-standing duration", so `dm_duration` is offered rather than tested: a diabetes of two years with this picture should send you back to the two rules below. Gross haematuria is part of ADA\'s sentence and is captured nowhere in this catalog, so ask for it at the bedside. Retinopathy here is any recorded grade above `none`; an ungradable fundus is not a grade, which is why the rule below insists on `fundus_view_obscured` being a recorded no.',
    citation: ADA_S11_TYPICAL_DKD,
  },

  {
    /**
     * The rule this whole layer needed, and the one-sided differential it fixes.
     *
     * Before it, every kidney finding in the catalog could argue FOR diabetic
     * kidney disease or say nothing. A person with diabetes, a falling eGFR and
     * a retina that was examined and graded CLEAR produced no counter-argument
     * at all — and that is the person ADA writes Table 11.1 for, because the
     * diabetic pattern is retinopathy and albuminuria together and this one has
     * the kidney without the eye.
     *
     * `fundus_view_obscured` must be a RECORDED NO, and that predicate is the
     * rule rather than a refinement of it. `retinopathy_stage` recorded as
     * `none` means two entirely different things depending on that field: the
     * feature's own elicitation says "Recording NO is a claim that you saw the
     * retina well enough for the grade below to mean something". A cataract, a
     * small pupil or a hazy vitreous is common in exactly this population, and
     * without the guard the rule would read an ungradable retina as a clear one
     * and argue against diabetic kidney disease on the strength of an
     * examination that did not happen.
     *
     * ── The population predicate, and why it was missing ────────────────────
     * ADA's table is titled "Reasons to consider nondiabetic kidney diseases IN
     * A PERSON WITH CHRONIC KIDNEY DISEASE AND DIABETES", and an earlier draft
     * of this rule carried neither half of that population. It read a single
     * abnormal number as a kidney disease and said nothing at all about the
     * diabetes, so somebody admitted septic and dry with an eGFR of 38 and a
     * clear retina raised "consider a non-diabetic cause" out of an acute kidney
     * injury — the last item on its own mimic list. Both halves are predicates
     * now: `dm_status` recorded as `known`, and `kidney_abnormality_3_months`
     * present, which is the SAME chronicity predicate complications.ts conjoins
     * onto both diabetic-kidney-disease criteria. That is what the old comment
     * claimed and did not do. The two rows are arguing about the CAUSE of one
     * finding and must not disagree about whether the finding is there;
     * unrecorded, the predicate fails to `insufficient`, which is honest.
     *
     * ── The threshold moved up, and the posterior moved down ────────────────
     * The albuminuria arm was `urine_acr >= 3` — KDIGO A2, moderately increased
     * — which in type 2 diabetes without retinopathy is ordinary diabetic kidney
     * disease and is exactly what the first mimic says. It now reads the A3
     * boundary, which is also what the protein-strip arm has always meant (this
     * catalog maps 1+ or greater to A3-equivalent), so the two arms agree with
     * each other as well as with the diabetic row. And the posterior is `low`,
     * not `moderate`: a `moderate` rule scores more than every finding arguing
     * for diabetic kidney disease put together, and it was doing so in the
     * commonest patient this rule will ever see. `low` still outranks any single
     * weak finding; it no longer decides the question on its own.
     */
    id: "ndkd_kidney_disease_without_retinopathy",
    display:
      "Kidney disease with a retina that was examined and graded clear — consider a non-diabetic cause as well",
    condition: "non_diabetic_kidney_disease",
    when: {
      id: "ndkd_no_retinopathy_when",
      label:
        "No retinopathy on a fundus that was adequately seen, in a person with known diabetes and a kidney abnormality present for at least 3 months, with an eGFR < 60 mL/min/1.73m², an ACR ≥ 30 mg/mmol or protein 1+ or more on the urine strip",
      all: [
        { feature: "retinopathy_stage", op: "==", value: "none" },
        { feature: "fundus_view_obscured", op: "absent" },
        { feature: "dm_status", op: "==", value: "known" },
        { feature: "kidney_abnormality_3_months", op: "present" },
      ],
      any: [
        { feature: "egfr", op: "<", value: 60, unit: "mL/min/1.73m2" },
        { feature: "urine_acr", op: ">=", value: 30, unit: "mg/mmol" },
        { feature: "urine_protein_strip", op: "in", value: ["1plus", "2plus", "3plus"] },
      ],
      requiresConfirmation: true,
      citation: ADA_S11_NON_DIABETIC,
    },
    posterior: "low",
    urgency: "routine",
    confirmWith: [
      "urine_acr",
      "urine_protein_strip",
      "egfr",
      "kidney_abnormality_3_months",
      "hba1c",
      "dm_duration",
    ],
    mimicsToExclude: NON_DIABETIC_KIDNEY_MIMICS,
    notes:
      'ADA writes this item as "Type 1 diabetes duration <5 years or no retinopathy" and qualifies the prose with "(particularly in type 1 diabetes)". This catalog holds no recorded diabetes type — classification returns `unclassified` wherever C-peptide and islet autoantibodies are unavailable, which is both reference site profiles — so the rule is applied irrespective of type, which widens it: kidney disease without retinopathy is considerably more common in type 2 diabetes and is often still diabetic. ADA DOES state a number for the duration half of that item — under five years — and an earlier version of this note wrongly said it did not. It is not encoded for two reasons that are about the source rather than the capture: ADA states it OF TYPE 1, which this catalog never records, and states it as an ALTERNATIVE to the retinopathy half rather than a condition on it, so conjoining it here would narrow a disjunction the source wrote as a disjunction. `dm_duration` is therefore a confirmatory field, and a long duration should make you read this row more sceptically. The second item this catalog can read but cannot threshold is a chronically well-managed glucose; `hba1c` is offered for it, and ADA states no number for THAT one. Three further items cannot be captured at all: there is no urine-microscopy field for an active sediment, and `egfr` and `urine_acr` are single numbers rather than series, so neither a rapidly declining eGFR nor a rapidly increasing albuminuria can be computed. The action is ADA 11.12b — refer for uncertainty about the aetiology of kidney disease — and confirm albuminuria on two of three specimens over three to six months before acting on it.',
    citation: ADA_S11_NON_DIABETIC,
  },

  {
    /**
     * ADA's OTHER reachable item, and it is a standalone one.
     *
     * Table 11.1 lists "rapidly increasing or very high UACR (>300 mg/g)" as a
     * reason in its own right, not as a qualifier on the retinopathy item. The
     * rate of change cannot be computed here — `urine_acr` is a single number,
     * not a series — but the LEVEL can be read, and until this rule was written
     * that way the only route by which a very high albuminuria could raise a
     * non-diabetic cause ran through a retina that had been examined and graded
     * clear. That is the one thing a district clinic cannot do, which left ADA's
     * most portable item reachable only where it was least needed.
     *
     * ── What this rule used to be, and why it is not that any more ──────────
     * It gated on oedema and called the result a nephrotic picture. Both were
     * wrong. 30 mg/mmol is the KDIGO A3 boundary — SEVERELY INCREASED
     * albuminuria, and itself the classical diabetic finding — while
     * nephrotic-range albuminuria is conventionally far above it, so the display
     * asserted a claim several-fold above the measured value in precisely the
     * patient whose albuminuria is most likely to be ordinary diabetic kidney
     * disease. The oedema gate was worse than redundant. `oedema_distribution`'s
     * own documentation says sacral oedema "is its own option and not a step
     * above the knee: it is where fluid collects in someone who has been lying
     * down", and `oedema_grade`'s says non-pitting oedema "is a different
     * disease — lymphoedema and myxoedema, not fluid overload" — so the arm read
     * a bedbound patient's dependent sacral pit, and a lymphoedematous thigh, as
     * anasarca. Oedema remains the right thing to look for at the bedside and
     * the notes say so; it is no longer a predicate, and no rule in this file
     * asserts a nephrotic threshold anywhere.
     *
     * The strip is the district door. This catalog already maps 1+ or greater
     * onto A3-equivalent, so a 3+ is a CONSERVATIVE bedside proxy for ADA's
     * ">300 mg/g" and not a claim about a number.
     */
    id: "ndkd_very_high_albuminuria",
    display:
      "Severely increased albuminuria in an established diabetic chronic kidney disease — consider a non-diabetic cause as well",
    condition: "non_diabetic_kidney_disease",
    when: {
      id: "ndkd_very_high_acr_when",
      label:
        "An ACR ≥ 30 mg/mmol (≥ 300 mg/g) or protein 3+ on the strip, in a person with known diabetes and a kidney abnormality present for at least 3 months",
      all: [
        { feature: "dm_status", op: "==", value: "known" },
        { feature: "kidney_abnormality_3_months", op: "present" },
      ],
      any: [
        { feature: "urine_acr", op: ">=", value: 30, unit: "mg/mmol" },
        { feature: "urine_protein_strip", op: "==", value: "3plus" },
      ],
      requiresConfirmation: true,
      citation: ADA_S11_NON_DIABETIC,
    },
    posterior: "low",
    urgency: "routine",
    confirmWith: [
      "urine_acr",
      "urine_protein_strip",
      "egfr",
      "retinopathy_stage",
      "fundus_view_obscured",
      "kidney_abnormality_3_months",
    ],
    mimicsToExclude: [
      "Advanced diabetic kidney disease, which is itself a classical cause of heavy proteinuria — at this level it is the single most likely explanation, and ADA offers the finding as a reason to consider an ADDITIONAL cause rather than to exclude the diabetic one",
      "Hypertensive nephrosclerosis",
      "HIV-associated nephropathy, or tenofovir proximal tubular toxicity in someone on antiretroviral therapy",
      "A primary glomerulonephritis — membranous, minimal-change, focal segmental glomerulosclerosis or IgA",
      "Myeloma or another paraproteinaemia",
      "Sickle-cell nephropathy",
      "Pre-eclampsia, where the patient is pregnant",
      "A false-positive protein strip from concentrated, alkaline or infected urine, or one recorded after exercise or during a febrile illness",
      "Urinary tract infection, or menstrual contamination of the specimen",
      "Heart failure or chronic liver disease, where any oedema beside this has its own explanation",
    ],
    notes:
      "The 30 mg/mmol figure is ADA's \">300 mg/g\" read through the equivalence this catalog already carries in the KDIGO A3 stage; it is not a fresh conversion. It is a SEVERELY INCREASED albuminuria, and nothing here calls it nephrotic: nephrotic-range albuminuria is conventionally far above this boundary, the published figure was not confirmed from a primary source in this pass, and nephrotic syndrome proper needs a serum albumin this catalog does not capture. Look for oedema and ask how far up it reaches — heavy proteinuria with pitting oedema above the ankles is the bedside shape of a nephrotic presentation, which ADA's prose names among the reasons to look further, and it is worth the referral conversation even though no rule here fires on it. Sacral oedema is where fluid goes in someone who has been lying down and is not a step above the knee, and non-pitting oedema is a different disease altogether. Confirm the albuminuria on two of three specimens over three to six months before acting on it, then look at the retina: where it can be graded it does more than any strip, and it is what the rule above turns on. The action is ADA 11.12b, referral for uncertainty about the aetiology, and it carries no stated timeframe — which is why this is `routine` and not louder.",
    citation: ADA_S11_REFER,
  },
];

/**
 * The aetiological cluster: the two drugs, then the argument about whose kidney
 * it is.
 *
 * Neither drug rule carries a date, and the header says why — the exposure is
 * recorded, the timing is not. The kidney set is three rules and not two, and
 * the first of them argues for the DIABETIC cause: a differential in which one
 * side has combinations and the other has only `weak` findings is one-sided
 * whichever way round it is written, which is the defect this file exists to
 * fix rather than to reproduce.
 *
 * Nothing here ranks until `index.ts` spreads this array into the catalog's
 * `rules`. See the header.
 */
export const AETIOLOGY_RULES: DifferentialRule[] = [...DRUG_INDUCED, ...KIDNEY];
