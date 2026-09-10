/**
 * The acute metabolic emergencies, as NAMED COMBINATIONS (ADR 0083).
 *
 * ── What a rule here is for ──────────────────────────────────────────────────
 * No single finding makes DKA. A glucose of 27 is not DKA, Kussmaul breathing is
 * not DKA, and a recorded "confused" is not anything at all. The clinical value
 * lives in the combination — "hyperglycaemia plus two of these five" — which is
 * exactly the shape `Criterion.atLeast` already expresses, unit-checked and
 * cited. That is why this layer added no evaluator: the rules below are ordinary
 * criteria with a condition, an urgency and a confirmatory set hung off them.
 *
 * ── What these rules deliberately do NOT claim ───────────────────────────────
 * They do not diagnose. `complications.ts` ESTABLISHES dka, hhs and
 * hypoglycaemia from ketones and acid-base; these RANK, which is the only thing
 * a district clinic with a glucometer and a urine strip can still do. A rule
 * firing means "consider this now and get these tests", never "this is it", and
 * a condition can top the ranking while its complication stays `insufficient`.
 *
 * They also do not reason about the mimics they name. Most of what looks like
 * DKA lies outside diabetes altogether — salicylate toxicity, sepsis with a
 * lactic acidosis, uraemic acidosis, severe malaria — so those are carried as
 * NAMED STRINGS in `mimicsToExclude` rather than as rankable codes. The
 * clinician is told what to think about; the catalog does not pretend to have
 * thought about it.
 *
 * ── A SEVERITY TABLE IS NOT AN ENTRY CRITERION ───────────────────────────────
 * The single most important structural rule in this file, and the one an audit
 * caught it breaking. ADA/EASD Table 2 grades a ketoacidosis that has ALREADY
 * been diagnosed: its 'D' row (glucose ≥ 11.1 or prior diabetes) and its 'K' row
 * (ketonaemia) are IDENTICAL down all three severity columns, and only the
 * acidosis and mental-status rows move. A rule that took the severe column as a
 * bare OR declared "severe ketoacidosis" on a bicarbonate of 8 from diarrhoea,
 * on a pH of 6.95 from salicylate, and on `coma` in cerebral malaria before any
 * glucose existed — that is, on precisely the mimics its own list told the
 * clinician to exclude, and, worst of all, on hypoglycaemic coma. Every severity
 * rule below is therefore CONJOINED with a ketosis anchor, and grades a
 * ketoacidosis rather than asserting one.
 *
 * ── Two thresholds worth having in your head before reading ──────────────────
 * 1. The DKA glucose threshold is 11.1 mmol/L, not 13.9 — AND prior diabetes
 *    qualifies at any glucose at all. Both arms are encoded, because the second
 *    is the one that catches the known type 1 who omitted insulin for three days
 *    and arrives with a glucose of 9.
 * 2. A NORMAL glucose does not exclude DKA. Roughly one in ten presentations is
 *    euglycaemic, and on an SGLT2 inhibitor a third of them are. The euglycaemic
 *    rules below are the reason this whole layer earns its keep.
 *
 * ── Where the sources diverge, both are recorded ─────────────────────────────
 * a. ACIDOSIS. ADA Table 16.1 puts the adult DIAGNOSTIC cut-point at pH < 7.3
 *    and/or bicarbonate < 18 mmol/L. ISPAD 2022 puts the paediatric one at the
 *    SAME PAIR — pH < 7.3 or bicarbonate < 18 — having moved up from 15 in that
 *    edition, and lists the change first in its summary of what is new. BSPED
 *    v3 (2021) still carries 15, because what it adopted was ISPAD 2018. So the
 *    diagnostic divergence is BSPED-versus-everyone and is one edition wide,
 *    not a paediatric-versus-adult split; it is attributed to BSPED alone below
 *    and flagged for the CSO rather than dressed up as a standing disagreement.
 *    What DOES genuinely differ is SEVERITY: ISPAD and BSPED agree that severe
 *    is pH < 7.1 or bicarbonate < 5, where the adult table uses pH < 7.0 or
 *    bicarbonate < 10. A young person at pH 7.05 is severe by one document and
 *    moderate by the other, and that decides where they are nursed — which is
 *    why the severity rules are split by band and the diagnostic ones are not.
 * b. THE WHOLE BIOCHEMISTRY. Uganda Clinical Guidelines 8.1.4 defines DKA
 *    CLINICALLY — deep acidotic breathing, acetone on the breath, altered
 *    consciousness — and names four investigations: blood sugar, urine analysis
 *    for ketones, a full blood count, and renal function with electrolytes. It
 *    states no pH, no bicarbonate and no osmolality anywhere, and it is that
 *    ABSENCE OF A BIOCHEMICAL THRESHOLD, not any shortage of tests, that makes
 *    the district pathway a different pathway. WHO PEN 2.2 is the same shape and
 *    adds the only numbers a health centre can act on: glucose > 18 mmol/L with
 *    urine ketones 2+. Neither is wrong; a health centre with a urine strip and
 *    no blood gas cannot apply a consensus written for a hospital.
 *    `dka_district_ketone_strip` is that pathway, and it is a first-class rule
 *    rather than a degraded one.
 * c. THE HYPOGLYCAEMIA NUMBER. ADA Table 6.4 alerts at < 3.9 and calls < 3.0
 *    clinically significant. UCG 1.1.6 says symptoms "generally occur" below
 *    3.0. WHO PEN treats below 2.8. Three bodies, three numbers; the ADA pair is
 *    used because it is the one that separates an alert value from an emergency.
 *
 * ── ONE lineage wearing two labels ───────────────────────────────────────────
 * ADA SOC 2026 Tables 16.1 and 16.2 each carry the footnote "Adapted from
 * Umpierrez et al. (165)", and reference 165 is the ADA/EASD/JBDS/AACE/DTS 2024
 * consensus report cited below. They are an ADAPTED REPRINT of it, not
 * independent corroboration of it, and every constant on both sides says so —
 * the same trap `conditions.ts` names for this pair and `sources.ts` names for
 * ADA Table 12.1 and IWGDF. The consensus itself was CO-PUBLISHED: Diabetes Care
 * 47(8):1257–1275 (PMC11272983) and Diabetologia 67(8):1455–1479 (PMC11343900)
 * are the same document in American and British spelling. Everything here cites
 * the Diabetologia copy so that one document never appears as three sources.
 *
 * Every citation here is `csoSigned: false`. The rules ship gated dark.
 */
import type { Citation, DifferentialRule } from "@/lib/ncd/catalog/schema";

const RETRIEVED = "2026-09-08";

/* ── Sources fetched for this file ───────────────────────────────────────── */

/**
 * The adult diagnostic table this file's thresholds are read from — and the
 * reprint notice that stops it being counted as a second opinion.
 *
 * Its glucose row is a DISJUNCTION, and the second arm is the one that matters:
 * a prior history of diabetes qualifies irrespective of the presenting glucose.
 * Both arms are encoded in every rule that reads this table.
 */
const ADA_S16_DKA: Citation = {
  standard: "ADA",
  version:
    'Standards of Care in Diabetes—2026, Section 16, Table 16.1 — an ADAPTED REPRINT of the ADA/EASD/JBDS/AACE/DTS 2024 consensus report (its own footnote reads "Adapted from Umpierrez et al. (165)"), NOT independent corroboration of it',
  title: "16. Diabetes Care in the Hospital: Standards of Care in Diabetes—2026",
  url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC12690180/",
  retrieved: RETRIEVED,
  csoSigned: false,
  quote:
    "Glucose ≥200 mg/dL (11.1 mmol/L) or prior history of diabetes. β-Hydroxybutyrate concentration ≥3.0 mmol/L or urine ketone strip 2+ or greater. pH <7.3 and/or bicarbonate concentration <18 mmol/L … approximately 10% of people experiencing DKA present with euglycemic DKA (plasma glucose <200 mg/dL [<11.1 mmol/L]); therefore, DKA diagnosis requires either the presence of hyperglycemia or prior history of diabetes",
};

/** The same table's HHS column — and the reason `bohb` is a criterion, not a hint. */
const ADA_S16_HHS: Citation = {
  standard: "ADA",
  version:
    "Standards of Care in Diabetes—2026, Section 16, Table 16.1 (HHS column) — an ADAPTED REPRINT of the ADA/EASD/JBDS/AACE/DTS 2024 consensus report, NOT independent corroboration of it",
  title: "16. Diabetes Care in the Hospital: Standards of Care in Diabetes—2026",
  url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC12690180/",
  retrieved: RETRIEVED,
  csoSigned: false,
  quote:
    "Plasma glucose ≥600 mg/dL (33.3 mmol/L). Calculated effective serum osmolality >300 mOsm/kg. β-Hydroxybutyrate concentration <3.0 mmol/L OR urine ketone strip less than 2+. pH ≥7.3 and bicarbonate concentration ≥15 mmol/L",
  needsCsoInput:
    "A CAPTURE GAP the CSO should rule on, not a doubt about the number. Portable meters read to 33.3 mmol/L (600 mg/dL) and display HI above it, and `capillary_glucose` is a plain number with no way to record an above-range reading — so at the health centre this rule was written for, the sickest patients produce no number and every predicate keying on ≥ 33.3 evaluates `insufficient`. A real HHS runs far higher. Until the capture can represent an above-range meter reading, the bedside HHS rules can only fire where a laboratory glucose exists, which is the site that needs them least. Note also that the consensus PROSE states the non-acidotic pair as pH ≥7.30 and bicarbonate ≥18 mmol/L while this reprinted table states bicarbonate ≥15; the table's figure is used and the discrepancy is recorded here.",
};

/**
 * Table 16.2 — the BEDSIDE differences, which is what a clinician with no
 * laboratory actually has. It is the source the bedside HHS rule should always
 * have carried: Kussmaul respiration sits in the DKA column and nowhere in the
 * HHS column, and change in cognitive state is listed as common in HHS where DKA
 * is "usually alert".
 */
const ADA_S16_HHS_PRESENTATION: Citation = {
  standard: "ADA",
  version:
    "Standards of Care in Diabetes—2026, Section 16, Table 16.2 — an ADAPTED REPRINT of the ADA/EASD/JBDS/AACE/DTS 2024 consensus report, NOT independent corroboration of it",
  title: "16. Diabetes Care in the Hospital: Standards of Care in Diabetes—2026",
  url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC12690180/",
  retrieved: RETRIEVED,
  csoSigned: false,
  quote:
    "Clinical presentation in people with diabetes with DKA and HHS. [DKA] Develops over hours to days … Usually alert … Nausea, vomiting, and abdominal pain … Kussmaul respiration. [HHS] Develops over days to a week … Change in cognitive state common … Often copresenting with other acute illness. [Both] Polyuria, polydipsia, weight loss, and dehydration … One-third of hyperglycemic emergencies have a hybrid DKA-HHS presentation.",
};

/** The sentence that makes euglycaemic DKA a rule rather than a footnote. */
const ADA_S16_EUGLYCAEMIC: Citation = {
  standard: "ADA",
  version:
    "Standards of Care in Diabetes—2026, Section 16 (euglycemic DKA) — the surrounding Table 16.1 is an adapted reprint of the ADA/EASD/JBDS/AACE/DTS 2024 consensus report",
  title: "16. Diabetes Care in the Hospital: Standards of Care in Diabetes—2026",
  url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC12690180/",
  retrieved: RETRIEVED,
  csoSigned: false,
  quote:
    "Approximately 10% of people experiencing DKA present with euglycemic DKA (plasma glucose <200 mg/dL [<11.1 mmol/L]) … Euglycemic DKA develops in the presence of low insulin levels and can be associated with a variety of factors including reduced food intake, pregnancy, alcohol use, liver failure, and/or SGLT2 inhibitor therapy.",
};

/**
 * The euglycaemic criterion IN FULL — the glucose ceiling AND the ketone and
 * acid-base thresholds the rule actually tests, in one quote, because a
 * criterion carries one citation and a criterion whose citation does not contain
 * its own numbers is an uncited threshold wearing a source.
 */
const CRISES_2024_EUGLYCAEMIC_CRITERIA: Citation = {
  standard: "EASD",
  version:
    "ADA/EASD/JBDS/AACE/DTS consensus report, 2024, Section 3 (Diabetologia 67(8):1455–1479; co-published as Diabetes Care 47(8):1257–1275) — reprinted in adapted form as ADA SOC 2026 Table 16.1",
  title:
    "Umpierrez GE, Davis GM, ElSayed NA, et al. Hyperglycaemic crises in adults with diabetes: a consensus report",
  url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC11343900/",
  retrieved: RETRIEVED,
  csoSigned: false,
  quote:
    "Approximately 10% of patients with DKA present with euglycaemic DKA, which is defined as plasma glucose levels <11.1 mmol/l (200 mg/dl) in the presence of ketosis and metabolic acidosis criteria of DKA described in Fig. 2 … Hyperglycaemia and/or diabetes must be accompanied by two additional criteria—elevated ketones and metabolic acidosis—for the diagnosis of DKA to be established.",
};

/**
 * The diagnostic criteria in the consensus's own words — including the sentence
 * that changed them, which is why the glucose predicate everywhere in this file
 * is a disjunction and not a threshold.
 */
const CRISES_2024_DKA_CRITERIA: Citation = {
  standard: "EASD",
  version:
    "ADA/EASD/JBDS/AACE/DTS consensus report, 2024, Section 3 (Diabetologia 67(8):1455–1479; co-published as Diabetes Care 47(8):1257–1275) — reprinted in adapted form as ADA SOC 2026 Table 16.1",
  title:
    "Umpierrez GE, Davis GM, ElSayed NA, et al. Hyperglycaemic crises in adults with diabetes: a consensus report",
  url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC11343900/",
  retrieved: RETRIEVED,
  csoSigned: false,
  quote:
    "In this consensus report, we have defined hyperglycaemia as a diagnostic criterion for DKA from >13.9 mmol/l (250 mg/dl) to either a glucose value of ≥11.1 mmol/l (200 mg/dl) or a prior history of diabetes irrespective of the presenting glucose value. Hyperglycaemia and/or diabetes must be accompanied by two additional criteria—elevated ketones and metabolic acidosis—for the diagnosis of DKA to be established.",
  needsCsoInput:
    "This quote licenses the ENTRY predicate (glucose ≥ 11.1 mmol/L or prior diabetes) and nothing else. The n-of-2 count over clinical signs that the suspicion rules conjoin with it is the CATALOG's construction, assembled from the consensus's clinical-presentation paragraph — no source states a counting rule over Kussmaul breathing, fetor, dehydration, vomiting, abdominal pain and conscious level, and none is claimed here. Two rather than one because a single finding is the commonest presentation of nothing in particular; the CSO should ratify the count, or replace it with a shape a source does state.",
};

/**
 * The severity grading, quoted as the WHOLE of Table 2 rather than its severe
 * column alone — because the omitted rows are the entire point. 'D' and 'K' are
 * identical down all three columns: the table presupposes a diagnosed
 * ketoacidosis and moves only the acidosis and mental-status rows. Quoting the
 * severe column on its own is what let a bare OR over pH, bicarbonate and
 * conscious level declare severe DKA in a patient who had none.
 */
const CRISES_2024_SEVERITY: Citation = {
  standard: "EASD",
  version:
    "ADA/EASD/JBDS/AACE/DTS consensus report, 2024, Table 2 (Diabetologia 67(8):1455–1479; co-published as Diabetes Care 47(8):1257–1275) — reprinted in adapted form as ADA SOC 2026 Table 16.1",
  title:
    "Umpierrez GE, Davis GM, ElSayed NA, et al. Hyperglycaemic crises in adults with diabetes: a consensus report",
  url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC11343900/",
  retrieved: RETRIEVED,
  csoSigned: false,
  quote:
    "DKA classification and suggested level of care by severity: mild, moderate or severe. 'D': history of diabetes or elevated glucose level — Glucose ≥11.1 mmol/l (200 mg/dl) [in all three columns]. 'K': ketonaemia — β-Hydroxybutyrate 3.0–6.0 mmol/l [mild and moderate]; β-Hydroxybutyrate >6.0 mmol/l [severe]. 'A': acidosis — pH >7.25 to <7.30 or bicarbonate 15–18 mmol/l [mild]; pH 7.0–7.25 or bicarbonate 10 to <15 mmol/l [moderate]; pH <7.0 or bicarbonate <10 mmol/l [severe]. Mental status — Alert; Alert/drowsy; Stupor/coma. Suggested level of care — Regular or observation nursing unit; Step-down unit or intermediate care unit; ICU. … Not all variables need to be fulfilled to be defined as either mild, moderate or severe, and the admission site and level of care are ultimately a clinical decision.",
};

/**
 * The overlap, and why it is a condition of its own rather than a worse DKA.
 *
 * Two sentences from two sections, and the `version` says so. The first is the
 * consensus's own epidemiology, with the study figure beside it so no single
 * number carries the rule; the second is the consensus DEFINING the overlap
 * biochemically, which is the four-item list the rule's `atLeast` encodes.
 */
const CRISES_2024_MIXED: Citation = {
  standard: "EASD",
  version:
    "ADA/EASD/JBDS/AACE/DTS consensus report, 2024 — Section 3 (diagnostic criteria for HHS) and Section 4 (insulin therapy in HHS) (Diabetologia 67(8):1455–1479; co-published as Diabetes Care 47(8):1257–1275)",
  title:
    "Umpierrez GE, Davis GM, ElSayed NA, et al. Hyperglycaemic crises in adults with diabetes: a consensus report",
  url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC11343900/",
  retrieved: RETRIEVED,
  csoSigned: false,
  quote:
    "Clinical overlap between DKA and HHS has been reported in more than one-third of people with hyperglycaemic crises. … In a US-based study, 38% of hospital admissions for hyperglycaemic crises were for DKA, 35% for HHS and 27% for mixed DKA/HHS. … If significant ketonaemia is present (i.e., β-hydroxybutyrate ≥3.0 mmol/l, ketonuria ≥2+, pH <7.30 or bicarbonate <18 mmol/l), which represents mixed DKA/HHS, then a fixed-rate intravenous insulin infusion should be started at 0.1 U kg−1 h−1.",
};

/** Why the SGLT2 inhibitor gets a rule of its own rather than a line in a note. */
const CRISES_2024_SGLT2: Citation = {
  standard: "EASD",
  version:
    "ADA/EASD/JBDS/AACE/DTS consensus report, 2024 (euglycaemic DKA) (Diabetologia 67(8):1455–1479; co-published as Diabetes Care 47(8):1257–1275)",
  title:
    "Umpierrez GE, Davis GM, ElSayed NA, et al. Hyperglycaemic crises in adults with diabetes: a consensus report",
  url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC11343900/",
  retrieved: RETRIEVED,
  csoSigned: false,
  quote:
    "In recent years, the use of SGLT2 inhibitors in those with type 1 diabetes and type 2 diabetes has accounted for the majority of cases of euglycaemic DKA. … Risk factors for DKA in individuals with type 2 diabetes treated with SGLT2 inhibitors include very-low-carbohydrate diets and prolonged fasting, dehydration, excessive alcohol intake and the presence of autoimmunity … in one series, 35% of people treated with SGLT2 inhibitors presenting with DKA had glucose levels <11.1 mmol/l (200 mg/dl).",
};

/** The clinical picture the suspicion rules' `atLeast` lists are drawn from. */
const CRISES_2024_PRESENTATION: Citation = {
  standard: "EASD",
  version:
    "ADA/EASD/JBDS/AACE/DTS consensus report, 2024 (clinical presentation) (Diabetologia 67(8):1455–1479; co-published as Diabetes Care 47(8):1257–1275)",
  title:
    "Umpierrez GE, Davis GM, ElSayed NA, et al. Hyperglycaemic crises in adults with diabetes: a consensus report",
  url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC11343900/",
  retrieved: RETRIEVED,
  csoSigned: false,
  quote:
    "Both conditions may present with polyuria, polydipsia, weight loss, vomiting, dehydration and change in cognitive state. The respiratory compensation for metabolic acidosis found in DKA is manifest by Kussmaul breathing, which consists of deep breaths with a fruity odour smell because of the presence of acetone … Changes in cognitive state are usually present in patients with severe DKA and HHS. Nausea, vomiting and abdominal pain are common in DKA (>50%) but are uncommon in HHS.",
};

/** The consensus's own mimic list, which is where half of `mimicsToExclude` comes from. */
const CRISES_2024_DIFFERENTIAL: Citation = {
  standard: "EASD",
  version:
    "ADA/EASD/JBDS/AACE/DTS consensus report, 2024 (differential diagnosis) (Diabetologia 67(8):1455–1479; co-published as Diabetes Care 47(8):1257–1275)",
  title:
    "Umpierrez GE, Davis GM, ElSayed NA, et al. Hyperglycaemic crises in adults with diabetes: a consensus report",
  url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC11343900/",
  retrieved: RETRIEVED,
  csoSigned: false,
  quote:
    "It is important to consider the differential diagnosis of elevated ketones, including starvation ketosis, alcoholic ketoacidosis, and ketosis of pregnancy and hyperemesis. … The vomiting of hyperemesis gravidarum leads to excess counter-regulatory hormones.",
};

/** The three hypoglycaemia levels, and the fact that level 3 has no number. */
const ADA_S6_HYPO_LEVELS: Citation = {
  standard: "ADA",
  version: "Standards of Care in Diabetes—2026, Section 6, Table 6.4",
  title:
    "6. Glycemic Goals, Hypoglycemia, and Hyperglycemic Crises: Standards of Care in Diabetes—2026",
  url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC12690178/",
  retrieved: RETRIEVED,
  csoSigned: false,
  quote:
    "Level 1 Glucose <70 mg/dL (<3.9 mmol/L) and ≥54 mg/dL (≥3.0 mmol/L). Level 2 Glucose <54 mg/dL (<3.0 mmol/L). Level 3 A severe event characterized by altered mental and/or physical status requiring assistance for treatment of hypoglycemia, irrespective of glucose level. … Level 2 hypoglycemia … is the threshold at which neuroglycopenic symptoms begin to occur and requires immediate action to resolve the hypoglycemic event.",
};

/**
 * The recommendation that sizes the HISTORICAL level-3 rule. ADA's instruction
 * for a severe low the patient TELLS you about is to review it at the encounter
 * and evaluate it — not to resuscitate — which is why the reported event and the
 * event happening now are two rules with two urgencies.
 */
const ADA_S6_HYPO_REVIEW: Citation = {
  standard: "ADA",
  version: "Standards of Care in Diabetes—2026, Section 6, recs 6.10 and 6.12",
  title:
    "6. Glycemic Goals, Hypoglycemia, and Hyperglycemic Crises: Standards of Care in Diabetes—2026",
  url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC12690178/",
  retrieved: RETRIEVED,
  csoSigned: false,
  quote:
    "6.10 Review history of hypoglycemia at every clinical encounter for all individuals at risk for hypoglycemia, and evaluate hypoglycemic events as indicated. C … 6.12 Screen individuals at high risk for hypoglycemia or with severe and/or frequent hypoglycemia for fear of hypoglycemia at least annually and when clinically appropriate. E",
  needsCsoInput:
    "NEITHER hypoglycaemia feature carries a date. `hypoglycaemia_requiring_assistance` is a chronic screening question in the symptoms section with no time window, and `needed_third_party_help` is a `history` capture in the acute section; the catalog cannot tell an event happening now from one eighteen months ago. The split below assigns the acute-section capture to the present event and the symptom-history capture to the reported one, which is the best the current features allow and is an assumption, not a fact about the data. The CSO should decide whether a recency property is added before this content is signed.",
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
    "6.11 Screen individuals at risk for hypoglycemia for impaired hypoglycemia awareness at least annually and when clinically appropriate. E Refer to a trained health care professional for evidence-based intervention to improve hypoglycemia awareness. A … If an individual has level 2 hypoglycemia without adrenergic or neuroglycopenic symptoms, they likely have impaired hypoglycemia awareness.",
};

/** Euglycaemic DKA in pregnancy, in ADA's own words rather than by inference. */
const ADA_S6_PREGNANCY_EUGLYCAEMIC: Citation = {
  standard: "ADA",
  version: "Standards of Care in Diabetes—2026, Section 6 (DKA in pregnancy)",
  title:
    "6. Glycemic Goals, Hypoglycemia, and Hyperglycemic Crises: Standards of Care in Diabetes—2026",
  url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC12690178/",
  retrieved: RETRIEVED,
  csoSigned: false,
  quote:
    "Up to 2% of pregnancies with pregestational diabetes (most often type 1 diabetes) are complicated by DKA. … Pregnant individuals may present with euglycemic DKA (glucose <200 mg/dL [11.1 mmol/L]), and the diagnosis of DKA may be hindered by the presence of mixed acid-based disturbances, particularly in the setting of hyperemesis.",
};

/**
 * The paediatric text — and the one number in this file that no longer has the
 * company it was written with.
 *
 * BSPED v3 states the diagnostic bicarbonate as < 15 and says in its summary of
 * changes that it adopted "the ISPAD definition" — but the ISPAD edition it
 * references is 2018, and ISPAD 2022 has since moved to < 18. So the figure is
 * BSPED's alone today, not a paediatric consensus, and it is attributed that way
 * below. The SEVERITY figures are a different matter: BSPED and ISPAD 2022 agree
 * exactly, and those are the numbers the adolescent severity rule turns on.
 */
const BSPED_2021_DKA: Citation = {
  standard: "local",
  version: "BSPED DKA Guideline 2021 (v3), section A and the summary of changes",
  title:
    "BSPED Guideline for the Management of Children and Young People under the age of 18 years with Diabetic Ketoacidosis — 2021",
  url: "https://www.bsped.org.uk/media/v2ydcuv0/bsped-dka-guideline-v3.pdf",
  retrieved: RETRIEVED,
  csoSigned: false,
  quote:
    "Diagnose DKA in children and young people who have acidosis (indicated by blood pH below 7.3 or plasma bicarbonate below 15 mmol/litre) and ketonaemia (indicated by blood beta-hydroxybutyrate above 3 mmol/litre). Blood glucose levels are generally high (above 11 mmol/l) but children and young people with known diabetes may develop DKA with normal blood glucose levels. … Mild DKA – venous pH 7.2-7.29 or bicarbonate < 15 mmol/l … Moderate DKA – venous pH 7.1-7.19 or bicarbonate < 10 mmol/l … Severe DKA – venous pH less than 7.1 or serum bicarbonate < 5 mmol/l … The ISPAD definition for DKA with acidosis and a bicarbonate of <15 mmol/l or a pH <7.3, and ketones of >3.0 mmol per litre has been adopted.",
  needsCsoInput:
    "BSPED is a national specialist society and not one of the schema's StandardBody values, so it is carried as `local`. TWO things for the CSO. (1) The DIAGNOSTIC bicarbonate of 15 mmol/L is BSPED's alone as of this retrieval: BSPED v3 says it adopted the ISPAD definition, but its reference list names ISPAD 2018, and ISPAD 2022 Chapter 11 lists \"Biochemical criteria to diagnose DKA include serum bicarbonate <18 mmol/L\" first in its summary of what is new. This catalog therefore uses 18 for diagnosis in every band and does not encode 15 anywhere; the CSO should decide whether a BSPED site profile ought to surface it. (2) The SEVERE cut-points used by the adolescent rule — pH < 7.1 or bicarbonate < 5 mmol/L — are quoted above and are corroborated verbatim by ISPAD 2022; they differ from the adult table's pH < 7.0 and bicarbonate < 10, and that difference is the whole reason the adolescent severity rule exists.",
};

/**
 * The paediatric consensus, recorded here for the one thing it does that no
 * other source in this file does: it CHANGED a number, and the change removed
 * the diagnostic divergence this file used to assert.
 */
const ISPAD_2022_DKA: Citation = {
  standard: "local",
  version: "ISPAD Clinical Practice Consensus Guidelines 2022, Chapter 11, sections 1, 2 and 4",
  title:
    "Glaser N, Fritsch M, Priyambada L, et al. ISPAD Clinical Practice Consensus Guidelines 2022: Diabetic ketoacidosis and hyperglycemic hyperosmolar state. Pediatr Diabetes 2022;23:835–856",
  url: "https://www.ispad.org/resource/chapter-11-diabetic-ketoacidosis.html",
  retrieved: RETRIEVED,
  csoSigned: false,
  quote:
    "Changes to previous recommendations include: Biochemical criteria to diagnose diabetic ketoacidosis (DKA) include serum bicarbonate <18 mmol/L … All three biochemical criteria are required to diagnose DKA: Hyperglycemia (blood glucose >11 mmol/L [200 mg/dl]); Venous pH < 7.3 or serum bicarbonate <18 mmol/L; Ketonemia or ketonuria … The severity of DKA is categorized by the degree of acidosis: Mild: venous pH < 7.3 or serum bicarbonate <18 mmol/L; Moderate: pH < 7.2 or serum bicarbonate <10 mmol/L; Severe: pH < 7.1 or serum bicarbonate <5 mmol/L",
  needsCsoInput:
    "ISPAD is not one of the enumerated standard bodies, hence `local`. It is cited here for provenance rather than for a threshold this file encodes on its own authority: it is what establishes that the paediatric DIAGNOSTIC cut-point now matches the adult one (pH < 7.3 or bicarbonate < 18) and that BSPED's 15 is one edition behind, and it independently corroborates the paediatric SEVERE cut-points the adolescent rule uses. ISPAD also requires all three criteria — hyperglycaemia, acidosis and ketonaemia — while noting that partially treated children and those who have eaten little may present euglycaemic. The chapter's bedside criteria set for cerebral injury is deliberately NOT encoded anywhere in this catalog.",
};

/** The four early manifestations, and the later signs that mean treat now. */
const BSPED_2021_OEDEMA: Citation = {
  standard: "local",
  version: "BSPED DKA Guideline 2021 (v3), section H — Cerebral Oedema",
  title:
    "BSPED Guideline for the Management of Children and Young People under the age of 18 years with Diabetic Ketoacidosis — 2021",
  url: "https://www.bsped.org.uk/media/v2ydcuv0/bsped-dka-guideline-v3.pdf",
  retrieved: RETRIEVED,
  csoSigned: false,
  quote:
    "Immediately assess a child or young person with DKA for suspected cerebral oedema if they have any of these early manifestations: headache, agitation or irritability, unexpected fall in heart rate, increased blood pressure. … If a child or young person develops any of these signs — deterioration in level of consciousness, abnormalities of breathing pattern, oculomotor palsies, abnormal posturing, pupillary inequality or dilatation — treat them immediately for cerebral oedema.",
  needsCsoInput:
    "BSPED is carried as `local` (not a schema StandardBody). THREE departures the CSO should ratify. (1) The guideline is written for under-18s and the rules using it are NOT age-banded, because `cerebral_oedema` in conditions.ts is not, and the adult consensus states that cerebral oedema, while rare in adults, occurs and that changes in mental status should be watched for. (2) BSPED says ANY ONE of the four early manifestations, and the early-warning rule now says the same — n=1, not the n=2 an earlier version of this file used without disclosing the deviation. What it adds instead is BSPED's own antecedent, \"a child or young person WITH DKA\", made into an explicit predicate — a MEASURED KETOSIS, by blood test or strip, and deliberately not a mere hyperglycaemia, which would have put this at the top of the list for every confused patient with a raised glucose. Without an antecedent at all the rule fired on any obtunded adult, and in an adult it collapses to two findings that both also point at hypoglycaemia. Its posterior is `moderate` rather than `high` for the same reason — BSPED's instruction on one early manifestation is to ASSESS, not to treat — while urgency stays `immediate`. (3) TIMING IS HALF THE FINDING and the catalog cannot record it: these signs mean cerebral oedema once treatment has started and everything else is improving, and no `dka_treatment_started` capture exists. Until one does, the rule cannot distinguish a complication of treatment from the presentation itself.",
};

/**
 * The Ugandan text, and the vocabulary the clinician using this tool was taught.
 * Fetched for its divergence rather than for corroboration: it defines both
 * crises CLINICALLY and states no biochemical threshold — no pH, no bicarbonate,
 * no osmolality, no ketone number — anywhere in 8.1.4. Its investigation list
 * runs to four items, electrolytes included; it is the absence of a THRESHOLD,
 * not any shortage of tests, that makes the district pathway a different one.
 */
const UCG_2023_DKA: Citation = {
  standard: "local",
  version: "Uganda Clinical Guidelines 2023, section 8.1.4 (pp 478–481)",
  title:
    "Uganda Clinical Guidelines 2023 — National Guidelines on the Management of Common Conditions (Ministry of Health, Uganda)",
  url: "https://library.health.go.ug/sites/default/files/resources/Uganda%20Clinical%20Guidelines%202023.pdf",
  retrieved: RETRIEVED,
  csoSigned: false,
  quote:
    "DKA is characterized by ketosis, acidosis, and hyperglycaemia. … Clinical features DKA: Acute onset (24 hours or less); Abdominal pain, vomiting; Alterated consciousness, coma; Deep breathing (acidotic); Sweet, acetone smell on the breath (from ketosis); Cardiovascular collapse (hypotension). HHS: Slower onset; More severe dehydration and fluid deficit; No ketosis and acidosis (no/few ketones in urine). Differential diagnosis: Other causes of ketoacidosis/hyperglycaemia; Other causes of acute abdominal pain; Other causes of coma. Investigations: Blood sugar; Urine analysis (for ketones, positive); Full blood count; Renal function and electrolytes (Na,K)",
  needsCsoInput:
    "A national guideline, carried as `local`. It is cited here for what it does NOT contain: no pH, bicarbonate, ketone or osmolality threshold appears in 8.1.4, so nothing in this catalog's biochemistry can be attributed to it. The quoted spelling \"Alterated\" is the source's own. The CSO should confirm the section numbering against the printed edition.",
};

/** The Ugandan hypoglycaemia number, which is not the ADA one. */
const UCG_2023_HYPO: Citation = {
  standard: "local",
  version: "Uganda Clinical Guidelines 2023, section 1.1.6 (pp 24–25)",
  title:
    "Uganda Clinical Guidelines 2023 — National Guidelines on the Management of Common Conditions (Ministry of Health, Uganda)",
  url: "https://library.health.go.ug/sites/default/files/resources/Uganda%20Clinical%20Guidelines%202023.pdf",
  retrieved: RETRIEVED,
  csoSigned: false,
  quote:
    "A clinical condition due to reduced levels of blood sugar (glucose). Symptoms generally occur with a blood glucose <3.0 mmol/L (55 mg/dl). … Investigations: Blood sugar (generally <3.0 mmol/L)",
  needsCsoInput:
    "Carried as `local`. Recorded because a clinician trained on UCG has 3.0 mmol/L in their head where ADA has 3.9, and the catalog uses ADA. The CSO should decide whether a Ugandan site profile ought to surface the UCG number alongside it.",
};

/**
 * The only set of numbers in this file written for a place with no blood gas.
 * WHO PEN's hyperglycaemic emergency is a glucose and a urine strip, and it ends
 * in "REFER to hospital" rather than in a diagnosis — which is the honest ceiling
 * for a health centre and is exactly what the district rule below encodes.
 */
const WHO_PEN_2_2: Citation = {
  standard: "WHO",
  version: "WHO PEN 2.2 Diabetes — complications flowchart",
  title: "WHO package of essential noncommunicable (PEN) disease interventions",
  url: "https://iris.who.int/server/api/core/bitstreams/b9f09202-a320-4c07-ba2c-afe0d1186339/content",
  retrieved: RETRIEVED,
  csoSigned: false,
  quote:
    "SEVERE HYPERGLYCAEMIA OR SIGNS AND SYMPTOMS (plasma glucose > 18 mmol/L (325 mg/dl) and urine ketone 2+) Set up intravenous drip 0.9% NaCl 1 litre in 2 hours; continue at 1 litre every 4 hours REFER to hospital … SEVERE HYPOGLYCAEMIA OR SIGNS (plasma glucose < 50 mg/dl or 2.8 mmol/L)",
};

/* ── Shared mimic lists ──────────────────────────────────────────────────── */

/**
 * NAMED STRINGS, never condition codes, and the distinction is the safety
 * property (ADR 0083). Every one of these lies outside the diabetes catalog, so
 * giving them codes would let the engine imply it reasons about conditions it
 * has no criteria for. Naming them tells the clinician what to think about.
 *
 * The last two are here because of where this catalog runs. UCG's own
 * differential for 8.1.4 is "other causes of ketoacidosis/hyperglycaemia, other
 * causes of acute abdominal pain, other causes of coma", and in Uganda the
 * commonest occupant of that third category is not on any European list.
 */
const KETOACIDOSIS_MIMICS = [
  "Starvation ketosis",
  "Alcoholic ketoacidosis",
  "Ketosis of pregnancy or hyperemesis gravidarum",
  "Salicylate toxicity",
  "Sepsis with lactic acidosis",
  "Uraemic acidosis",
  "Methanol or ethylene glycol poisoning",
  "Gastroenteritis or another cause of vomiting",
  "A surgical abdomen",
  "Severe malaria",
];

/** What else makes an older adult hyperosmolar, drowsy and dry. */
const HYPEROSMOLAR_MIMICS = [
  "Sepsis with hyperglycaemia",
  "Hypernatraemic dehydration from another cause",
  "Stroke or another intracranial event",
  "Uraemia",
  "Corticosteroid-induced hyperglycaemia without a crisis",
  "Severe malaria",
];

/** What else makes somebody confused, sweaty or unresponsive. */
const NEUROGLYCOPENIA_MIMICS = [
  "Stroke or transient ischaemic attack",
  "Post-ictal state",
  "Alcohol intoxication or withdrawal",
  "Sepsis",
  "Severe or cerebral malaria",
  "Adrenal insufficiency",
  "Head injury",
  "Poisoning or drug effect",
];

/** What else drops a conscious level while a hyperglycaemic crisis is treated. */
const CEREBRAL_OEDEMA_MIMICS = [
  "Hypoglycaemia during treatment",
  "Hyponatraemia, or over-rapid correction of sodium",
  "Intracranial haemorrhage or venous thrombosis",
  "Meningitis or encephalitis",
  "Cerebral malaria",
  "Non-convulsive status epilepticus",
  "Sedative or opioid effect",
];

/**
 * The 'D' row of ADA/EASD Table 2, as a reusable predicate list.
 *
 * Both arms, always. The consensus lowered the glucose to 11.1 mmol/L AND added
 * prior diabetes irrespective of the presenting value, and a catalog that
 * encoded only the first would miss the known type 1 who stopped insulin three
 * days ago, is vomiting, has eaten nothing and reads 9 on the meter — which is
 * the exact patient the euglycaemic rules exist for.
 */
const DIABETES_OR_HYPERGLYCAEMIA = [
  { feature: "capillary_glucose", op: ">=" as const, value: 11.1, unit: "mmol/L" },
  { feature: "random_pg", op: ">=" as const, value: 11.1, unit: "mmol/L" },
  { feature: "dm_status", op: "in" as const, value: ["known"] },
];

/** The same row at the paediatric glucose BSPED states, with the same second arm. */
const DIABETES_OR_HYPERGLYCAEMIA_PAED = [
  { feature: "capillary_glucose", op: ">=" as const, value: 11, unit: "mmol/L" },
  { feature: "random_pg", op: ">=" as const, value: 11, unit: "mmol/L" },
  { feature: "dm_status", op: "in" as const, value: ["known"] },
];

/** Ketosis by either modality — Table 16.1's 'K' row, blood test or strip. */
const KETOSIS_EITHER_MODALITY = [
  { feature: "bohb", op: ">=" as const, value: 3.0, unit: "mmol/L" },
  { feature: "urine_ketones", op: "in" as const, value: ["2plus", "3plus"] },
];

/* ── Diabetic ketoacidosis ───────────────────────────────────────────────── */

const DKA_RULES: DifferentialRule[] = [
  {
    /**
     * The worked case this whole layer was built around: a glucose of 27, deep
     * sighing breathing, dry mucous membranes and a patient who is not quite
     * right. None of those four is DKA on its own and the combination is, which
     * is why this is `atLeast` and not a pile of `discriminates`.
     *
     * TWO of the six rather than one. One alone is the commonest presentation
     * of nothing in particular — a hyperglycaemic patient who is drowsy after a
     * long journey — and a rule that fired on it would put an `immediate` red on
     * a large fraction of the diabetes clinic, which is how an interface teaches
     * people to scroll past the flag that matters.
     *
     * ONE VOTE PER OBSERVATION, and this rule used to break its own rule. The
     * list carried `altered_mental_state` AND `mental_status`, which are one
     * clinical observation captured twice — the symptom's own elicitation text
     * tells the clinician to go and grade it — so a single drowsy patient scored
     * two and fired the rule on hyperglycaemia plus drowsiness alone, verbatim
     * the counter-example above. The graded select survives because that is the
     * vocabulary Table 2 is written in; the boolean was dropped. `vomiting` and
     * `abdominal_pain` take its place, and belong here on the consensus's own
     * figure of >50% in DKA — the adolescent rule already counted them.
     */
    id: "dka_suspected_adult",
    display:
      "Hyperglycaemia with the ketoacidotic picture — consider DKA and check ketones and acid-base now",
    condition: "dka",
    ageBands: ["adult", "older_adult"],
    when: {
      id: "dka_adult_when",
      label:
        "Glucose ≥ 11.1 mmol/L or known diabetes, with at least two of: Kussmaul breathing, acetone on the breath, dehydration, drowsiness or worse, vomiting, abdominal pain",
      any: DIABETES_OR_HYPERGLYCAEMIA,
      atLeast: {
        n: 2,
        of: [
          { feature: "deep_rapid_breathing", op: "present" },
          { feature: "acetone_breath", op: "present" },
          { feature: "dehydration", op: "present" },
          { feature: "mental_status", op: "in", value: ["drowsy", "stupor", "coma"] },
          { feature: "vomiting", op: "present" },
          { feature: "abdominal_pain", op: "present" },
        ],
      },
      citation: CRISES_2024_DKA_CRITERIA,
    },
    posterior: "high",
    urgency: "immediate",
    confirmWith: [
      "bohb",
      "urine_ketones",
      "venous_ph",
      "bicarbonate",
      "sodium",
      "urea",
      "effective_osmolality",
    ],
    mimicsToExclude: KETOACIDOSIS_MIMICS,
    rulesOut: ["hypoglycaemia"],
    notes:
      "The glucose threshold is 11.1 mmol/L, not 13.9 — the 2024 consensus lowered it — and prior diabetes qualifies at ANY glucose, which is why this rule fires on known diabetes with a normal reading and why a normal reading closes nothing off (see the euglycaemic rules below). Ketones and acid-base are what decide it; this rule only says stop the review and get them. The count of two is this catalog's, not the consensus's: no source states a counting rule over these six signs. Infection is the commonest precipitant worldwide and insulin omission the commonest in known diabetes, so look for both while the tests are running.",
    citation: CRISES_2024_PRESENTATION,
  },

  {
    /**
     * The rule that was simply missing, and the patient who fell through the
     * hole: random glucose 14, β-hydroxybutyrate 4.5, pH 7.18, bicarbonate 12,
     * alert, dehydrated, Kussmaul not yet charted. Every rule in the earlier
     * version of this file declined that patient — the suspicion rule wanted two
     * bedside signs, the district rule wanted a glucose over 18, the euglycaemic
     * rules wanted one under 11.1 and the severity rules wanted a pH under 7.0 —
     * so frank, laboratory-confirmed, mid-range DKA raised nothing at all.
     *
     * `complications.ts` has held this criterion since before the layer existed
     * (`dka_bohb`); what it lacked was a ranking counterpart, and a condition
     * that is ESTABLISHED but never RANKED carries no urgency, no confirmatory
     * set and no mimic list into the differential.
     *
     * Unbanded, and that is now defensible in every band: ADA and ISPAD 2022
     * state the SAME diagnostic pair, pH < 7.3 or bicarbonate < 18.
     */
    id: "dka_ketonaemia_with_acidosis",
    display: "Ketonaemia with acidosis — the biochemical picture of ketoacidosis",
    condition: "dka",
    when: {
      id: "dka_ketonaemia_when",
      label:
        "β-hydroxybutyrate ≥ 3.0 mmol/L with pH < 7.3 or bicarbonate < 18 mmol/L, in known diabetes or at a glucose ≥ 11.1 mmol/L",
      all: [{ feature: "bohb", op: ">=", value: 3.0, unit: "mmol/L" }],
      any: DIABETES_OR_HYPERGLYCAEMIA,
      atLeast: {
        n: 1,
        of: [
          { feature: "venous_ph", op: "<", value: 7.3, unit: "pH" },
          { feature: "bicarbonate", op: "<", value: 18, unit: "mmol/L" },
        ],
      },
      citation: ADA_S16_DKA,
    },
    posterior: "high",
    urgency: "immediate",
    confirmWith: [
      "bohb",
      "venous_ph",
      "bicarbonate",
      "sodium",
      "urea",
      "effective_osmolality",
      "mental_status",
    ],
    mimicsToExclude: KETOACIDOSIS_MIMICS,
    rulesOut: ["hypoglycaemia"],
    notes:
      "All three components — hyperglycaemia or known diabetes, ketones, acidosis — are present, which is what both ADA and ISPAD require. Grade it next: the severity rules read the same numbers and decide the level of care. Then look for the precipitant, because the ketoacidosis is the presentation and rarely the whole problem.",
    citation: ADA_S16_DKA,
  },

  {
    /**
     * The same criterion where the only ketone measurement is a strip. Split as
     * its own rule rather than folded in, exactly as `complications.ts` splits
     * `dka_bohb` from `dka_urine_ketones`, because a `Criterion` conjoins one
     * AND with one OR and one n-of-m, and this needs three disjunctions:
     * ketone modality, the 'D' row and the acidosis pair.
     */
    id: "dka_ketonuria_with_acidosis",
    display: "Ketones on the strip with acidosis — the biochemical picture of ketoacidosis",
    condition: "dka",
    when: {
      id: "dka_ketonuria_when",
      label:
        "Urine ketones 2+ or more with pH < 7.3 or bicarbonate < 18 mmol/L, in known diabetes or at a glucose ≥ 11.1 mmol/L",
      all: [{ feature: "urine_ketones", op: "in", value: ["2plus", "3plus"] }],
      any: DIABETES_OR_HYPERGLYCAEMIA,
      atLeast: {
        n: 1,
        of: [
          { feature: "venous_ph", op: "<", value: 7.3, unit: "pH" },
          { feature: "bicarbonate", op: "<", value: 18, unit: "mmol/L" },
        ],
      },
      citation: ADA_S16_DKA,
    },
    posterior: "high",
    urgency: "immediate",
    confirmWith: ["bohb", "venous_ph", "bicarbonate", "sodium", "urea", "effective_osmolality"],
    mimicsToExclude: KETOACIDOSIS_MIMICS,
    rulesOut: ["hypoglycaemia"],
    notes:
      "Urine ketones are an explicit fallback and not the preferred test. They measure acetoacetate rather than β-hydroxybutyrate, so they underestimate early ketoacidosis and overestimate it late — the strip goes MORE positive as the patient improves — and captopril, N-acetylcysteine, mesna, penicillamine and valproate all give false positives. Where blood ketones exist, use them and use them for monitoring too.",
    citation: ADA_S16_DKA,
  },

  {
    /**
     * The same emergency, at a health centre with a glucometer, a urine strip
     * and no blood gas. WHO PEN states the whole thing in two numbers and ends
     * in "REFER to hospital", which is the honest ceiling for that setting.
     *
     * This is a FIRST-CLASS rule and not a degraded one. The alternative — only
     * ever firing where a blood gas exists — would give the sites that see the
     * most untreated DKA the least help, which is precisely backwards.
     */
    id: "dka_district_ketone_strip",
    display:
      "Severe hyperglycaemia with ketones on the strip — treat as a hyperglycaemic emergency and refer",
    condition: "dka",
    when: {
      id: "dka_district_when",
      label: "Glucose > 18 mmol/L with urine ketones 2+ or more (WHO PEN 2.2)",
      all: [{ feature: "urine_ketones", op: "in", value: ["2plus", "3plus"] }],
      any: [
        { feature: "capillary_glucose", op: ">", value: 18, unit: "mmol/L" },
        { feature: "random_pg", op: ">", value: 18, unit: "mmol/L" },
      ],
      citation: WHO_PEN_2_2,
    },
    posterior: "high",
    urgency: "immediate",
    confirmWith: [
      "urine_ketones",
      "capillary_glucose",
      "bohb",
      "venous_ph",
      "bicarbonate",
      "sodium",
    ],
    mimicsToExclude: KETOACIDOSIS_MIMICS,
    rulesOut: ["hypoglycaemia"],
    notes:
      "WHO PEN and UCG both define this emergency clinically and neither states a pH, a bicarbonate or an osmolality anywhere; ADA states four. Both readings are right for the place they were written for — UCG 8.1.4 does ask for a full blood count and for renal function and electrolytes, so this is not a glucose-and-strip document, it is a document with no biochemical THRESHOLD in it. A NORMAL GLUCOSE DOES NOT EXCLUDE KETOACIDOSIS: if the strip is positive and the glucose is under 18, this rule stays silent and the euglycaemic rules below are the ones to read. Urine ketones underestimate early DKA, overestimate late DKA and give false positives with sulfhydryl drugs such as captopril, so where blood ketones exist, use them.",
    citation: UCG_2023_DKA,
  },

  {
    /**
     * Separate from the adult rule rather than the adult rule with a band on it.
     * Not for the diagnostic bicarbonate — ISPAD 2022 moved to 18 and that
     * divergence is gone — but because the SIGN LIST BSPED asks for is its own,
     * because BSPED states in the same breath that a young person with known
     * diabetes can be in DKA at a normal glucose, and because the severity
     * grading downstream of it genuinely differs.
     *
     * Banded `["child", "adolescent"]`, not `["adolescent"]`. The earlier
     * comment here claimed `child` was "a life stage the surface cannot yet
     * render" and used that to justify the narrower band — but `ageBandFromDob`
     * returns `child` for every patient aged 1 to 9 and the encounter surface
     * passes that band straight through, so the effect was not a deferred band,
     * it was a nine-year-old in florid ketoacidosis raising no rule at all.
     * BSPED's own scope is everyone under 18.
     *
     * The GLUCOSE is a disjunct and not a requirement, which is the correction
     * that matters most: the rule used to demand ≥ 11 mmol/L while citing the
     * very sentence that says a young person with known diabetes may present at
     * a normal glucose. Known diabetes is now the second arm, as BSPED writes it.
     */
    id: "dka_suspected_adolescent",
    display:
      "Hyperglycaemia or known diabetes with the ketoacidotic picture in a young person — consider DKA on the paediatric thresholds",
    condition: "dka",
    ageBands: ["child", "adolescent"],
    when: {
      id: "dka_adolescent_when",
      label:
        "Glucose ≥ 11 mmol/L or known diabetes, with at least two of: dehydration, acidotic respiration, drowsiness, vomiting, abdominal pain, acetone on the breath",
      any: DIABETES_OR_HYPERGLYCAEMIA_PAED,
      atLeast: {
        n: 2,
        of: [
          { feature: "dehydration", op: "present" },
          { feature: "deep_rapid_breathing", op: "present" },
          { feature: "altered_mental_state", op: "present" },
          { feature: "vomiting", op: "present" },
          { feature: "abdominal_pain", op: "present" },
          { feature: "acetone_breath", op: "present" },
        ],
      },
      citation: BSPED_2021_DKA,
    },
    posterior: "high",
    urgency: "immediate",
    confirmWith: [
      "bohb",
      "urine_ketones",
      "venous_ph",
      "bicarbonate",
      "sodium",
      "effective_osmolality",
      "gcs_total",
    ],
    mimicsToExclude: KETOACIDOSIS_MIMICS,
    rulesOut: ["hypoglycaemia"],
    notes:
      "BSPED states plainly that a young person with known diabetes may be in DKA with a normal blood glucose, so the glucose here is one way in and not a gate. The DIAGNOSTIC acid-base pair is the adult one — ISPAD 2022 moved its bicarbonate to 18 mmol/L and lists the change first in its summary of what is new; BSPED's 15 restates ISPAD 2018 and is not encoded anywhere in this catalog. What does differ is SEVERITY: BSPED and ISPAD both grade severe at a pH below 7.1 or a bicarbonate below 5, where the adult table uses 7.0 and 10. Clinical dehydration is expected alongside the biochemistry, and the conscious level is asked for hourly rather than once — the direction of travel is worth more than any single score, because cerebral oedema is the thing that kills here.",
    citation: BSPED_2021_DKA,
  },

  {
    /**
     * A separate rankable condition rather than a louder DKA, because the action
     * differs rather than intensifies: this is a critical-care decision.
     *
     * ANCHORED, and the anchor is the whole correction. Table 2 is a SEVERITY
     * table — its 'D' and 'K' rows are identical down all three columns and only
     * the acidosis and mental-status rows move — so taking its severe column as a
     * free-standing OR turned a grading instrument into a diagnostic one. It
     * fired "severe ketoacidosis, critical-care decision now" at `high` on a
     * bicarbonate of 8 in diarrhoea, on a pH of 6.95 in salicylate overdose, and
     * on `coma` in cerebral malaria with no glucose yet measured — every one of
     * them a mimic this rule's own list names. The worst case was hypoglycaemic
     * coma, where it put an immediate red on the diagnosis whose treatment is the
     * opposite one, while every hypoglycaemia rule waited on a number.
     *
     * So ketosis is now required. Table 2's 'D' row is NOT encoded here: a
     * `Criterion` conjoins one AND, one OR and one n-of-m, the ketone modality
     * and the severity axis take both OR slots, and of the three the ketone
     * anchor is the one that excludes every walked failure. What the 'D' row
     * would have added — separating diabetic from starvation and alcoholic
     * ketoacidosis — is carried by `mimicsToExclude`, which names both, and by
     * the DKA rules above, which do test it.
     */
    id: "severe_dka_adult",
    display: "Severe ketoacidosis by the adult grading — critical-care decision now",
    condition: "severe_dka",
    ageBands: ["adult", "older_adult"],
    when: {
      id: "severe_dka_adult_when",
      label:
        "Ketosis (β-hydroxybutyrate ≥ 3.0 mmol/L or urine ketones 2+ or more) WITH any one of: β-hydroxybutyrate > 6.0 mmol/L, pH < 7.0, bicarbonate < 10 mmol/L, stupor or coma",
      any: KETOSIS_EITHER_MODALITY,
      atLeast: {
        n: 1,
        of: [
          { feature: "bohb", op: ">", value: 6.0, unit: "mmol/L" },
          { feature: "venous_ph", op: "<", value: 7.0, unit: "pH" },
          { feature: "bicarbonate", op: "<", value: 10, unit: "mmol/L" },
          { feature: "mental_status", op: "in", value: ["stupor", "coma"] },
        ],
      },
      citation: CRISES_2024_SEVERITY,
    },
    posterior: "high",
    urgency: "immediate",
    confirmWith: [
      "bohb",
      "venous_ph",
      "bicarbonate",
      "sodium",
      "urea",
      "gcs_total",
      "mental_status",
    ],
    mimicsToExclude: KETOACIDOSIS_MIMICS,
    notes:
      "Any ONE of the four severity findings is enough — that is an OR in the source, and the consensus says so itself: not all variables need to be fulfilled. What is NOT optional is the ketosis: Table 2 grades a ketoacidosis that has already been diagnosed, and its glucose and ketone rows are the same in all three columns. Stupor or coma alone grades severe once ketones are on the chart, which is what lets a site with no blood gas still reach this rung. It does not rule out hypoglycaemia: nothing here reads a glucose, and an unresponsive patient needs one measured whatever else is true.",
    citation: CRISES_2024_SEVERITY,
  },

  {
    /**
     * The same rung, one point of pH higher and a very different bicarbonate.
     * Carried as its own rule because a young person at pH 7.05 is severe by
     * BSPED and ISPAD and moderate by the adult table, and that difference
     * decides where they are nursed. Anchored on ketosis for exactly the reasons
     * the adult rule is.
     *
     * Banded `["adolescent"]` and not extended to `child`, unlike the diagnostic
     * rule above, because `severe_dka` the CONDITION is banded to adolescent and
     * up in conditions.ts. A rule banded wider than the condition it ranks fires
     * invisibly — the engine filters rules by the rule's bands and output rows by
     * the condition's — so widening it here would produce a firing that a child
     * can never be shown.
     */
    id: "severe_dka_adolescent",
    display: "Severe ketoacidosis by the paediatric grading — critical-care decision now",
    condition: "severe_dka",
    ageBands: ["adolescent"],
    when: {
      id: "severe_dka_adolescent_when",
      label:
        "Ketosis (β-hydroxybutyrate ≥ 3.0 mmol/L or urine ketones 2+ or more) WITH any one of: venous pH < 7.1, bicarbonate < 5 mmol/L, stupor or coma",
      any: KETOSIS_EITHER_MODALITY,
      atLeast: {
        n: 1,
        of: [
          { feature: "venous_ph", op: "<", value: 7.1, unit: "pH" },
          { feature: "bicarbonate", op: "<", value: 5, unit: "mmol/L" },
          { feature: "mental_status", op: "in", value: ["stupor", "coma"] },
        ],
      },
      citation: BSPED_2021_DKA,
    },
    posterior: "high",
    urgency: "immediate",
    confirmWith: [
      "venous_ph",
      "bicarbonate",
      "bohb",
      "sodium",
      "effective_osmolality",
      "gcs_total",
    ],
    mimicsToExclude: KETOACIDOSIS_MIMICS,
    notes:
      "Both paediatric sources agree on these numbers: severe is a venous pH below 7.1 or a bicarbonate below 5 mmol/L, against the adult table's 7.0 and 10. Stupor or coma is carried across from the adult grading and is this catalog's addition, since neither paediatric document grades on conscious level — it is kept because a site with no blood gas would otherwise have no route to this rung at all. BSPED asks for half-hourly neurological observations in anyone under two or with a pH below 7.1, because those are the patients at increased risk of cerebral oedema — unpredictable, commoner in newly diagnosed diabetes, and carrying a mortality of 21–24%. Reaching this rule is the point at which the cerebral-oedema warning findings stop being optional.",
    citation: ISPAD_2022_DKA,
  },
];

/* ── Euglycaemic DKA ─────────────────────────────────────────────────────── */

/**
 * All four are banded `["adolescent", "adult", "older_adult"]` to match
 * `euglycaemic_dka` in conditions.ts. An unbanded rule against a banded
 * condition is not merely untidy: the engine filters RULES by the rule's bands
 * and output ROWS by the condition's, and applies `rulesOut` in between — so in
 * a child these rules used to fire invisibly and their only visible effect was
 * to argue against something else.
 */
const EUGLYCAEMIC_RULES: DifferentialRule[] = [
  {
    /**
     * The rule that earns the layer. Everything above keys on a high glucose;
     * this one keys on a NORMAL one, and it exists because the normal number is
     * exactly where a tired clinician stops looking.
     *
     * It carries no `rulesOut`, and the omission is deliberate: a glucose under
     * 11.1 argues against nothing here. That is the whole point of the rule.
     */
    id: "euglycaemic_dka_ketoacidosis",
    display:
      "Ketoacidosis with a normal or near-normal glucose — euglycaemic DKA until proven otherwise",
    condition: "euglycaemic_dka",
    ageBands: ["adolescent", "adult", "older_adult"],
    when: {
      id: "euglycaemic_dka_when",
      label:
        "Glucose < 11.1 mmol/L with β-hydroxybutyrate ≥ 3.0 mmol/L and pH < 7.3 or bicarbonate < 18 mmol/L",
      all: [{ feature: "bohb", op: ">=", value: 3.0, unit: "mmol/L" }],
      any: [
        { feature: "capillary_glucose", op: "<", value: 11.1, unit: "mmol/L" },
        { feature: "random_pg", op: "<", value: 11.1, unit: "mmol/L" },
      ],
      atLeast: {
        n: 1,
        of: [
          { feature: "venous_ph", op: "<", value: 7.3, unit: "pH" },
          { feature: "bicarbonate", op: "<", value: 18, unit: "mmol/L" },
        ],
      },
      citation: CRISES_2024_EUGLYCAEMIC_CRITERIA,
    },
    posterior: "high",
    urgency: "immediate",
    confirmWith: ["bohb", "venous_ph", "bicarbonate", "sodium", "urea", "glucose_lowering_therapy"],
    mimicsToExclude: KETOACIDOSIS_MIMICS,
    notes:
      "A NORMAL GLUCOSE DOES NOT EXCLUDE DKA. About one presentation in ten is euglycaemic, and the situations that produce it are the ordinary ones: an SGLT2 inhibitor, pregnancy, a long fast or reduced food intake, heavy alcohol, liver failure. Treatment differs too — the ketones still need insulin, so glucose is given alongside it rather than the insulin being withheld. Ask what they take, when they last ate, and whether they could be pregnant before you accept a normal reading as reassurance. Note what this criterion does NOT test: the consensus reaches euglycaemic DKA through prior diabetes, since a glucose below 11.1 cannot satisfy the hyperglycaemia arm, and no diabetes predicate is required here. That is deliberate — a first presentation of type 1 and a ketosis-prone type 2 both look exactly like this and neither has a diagnosis yet — but it means the first two entries on the mimic list, starvation ketosis and alcoholic ketoacidosis, are doing real work in someone who has never had diabetes.",
    citation: ADA_S16_EUGLYCAEMIC,
  },

  {
    /**
     * The same presentation where there is no blood gas and possibly no blood
     * ketone assay — which is where euglycaemic DKA is missed, and where the rule
     * above could never fire. It required a laboratory β-hydroxybutyrate AND a
     * gas, so the health centre with a glucometer and a urine strip — the exact
     * setting `dka_district_ketone_strip` exists to serve — got nothing at all
     * for the known type 1 who stopped insulin three days ago, has been vomiting,
     * has eaten almost nothing, reads 9.2 on the meter and has 3+ on the strip.
     *
     * Known diabetes is required rather than the glucose, because that is the
     * arm the consensus added and because without it the rule would fire on
     * starvation ketosis in someone who has never had diabetes. `moderate`
     * rather than `high`: ketosis is not ketoacidosis, and no acid-base has been
     * seen. The job of the rule is to get the gas taken, or the patient moved.
     */
    id: "euglycaemic_dka_known_diabetes_no_gas",
    display:
      "Ketosis with a normal glucose in known diabetes — do not accept the reading, check acid-base or refer",
    condition: "euglycaemic_dka",
    ageBands: ["adolescent", "adult", "older_adult"],
    when: {
      id: "euglycaemic_dka_no_gas_when",
      label:
        "Known diabetes with glucose < 11.1 mmol/L and β-hydroxybutyrate ≥ 3.0 mmol/L or urine ketones 2+ or more",
      all: [{ feature: "dm_status", op: "in", value: ["known"] }],
      any: [
        { feature: "capillary_glucose", op: "<", value: 11.1, unit: "mmol/L" },
        { feature: "random_pg", op: "<", value: 11.1, unit: "mmol/L" },
      ],
      atLeast: { n: 1, of: KETOSIS_EITHER_MODALITY },
      citation: CRISES_2024_EUGLYCAEMIC_CRITERIA,
    },
    posterior: "moderate",
    urgency: "immediate",
    confirmWith: [
      "venous_ph",
      "bicarbonate",
      "bohb",
      "sodium",
      "glucose_lowering_therapy",
      "treatment_omission",
      "intercurrent_illness",
    ],
    mimicsToExclude: KETOACIDOSIS_MIMICS,
    notes:
      "THE GLUCOSE IS THE TRAP. A person with known diabetes and ketones on the strip is not reassured by a reading of 9: the consensus added prior diabetes to the criteria precisely so that the presenting glucose could stop being the gate. Insulin omission, an acute illness, a prolonged fast, a very low-carbohydrate diet and heavy alcohol are what produce it. Moderate rather than high because no acid-base has been seen — ketosis is not ketoacidosis — and where a gas cannot be obtained, that is a reason to move the patient rather than to wait.",
    citation: CRISES_2024_EUGLYCAEMIC_CRITERIA,
  },

  {
    /**
     * The pre-biochemistry version, and the one that will actually change
     * behaviour. It fires on ketosis alone, before any gas is back, in the single
     * context that now accounts for most euglycaemic DKA — which is the moment at
     * which the ranking should be saying keep going.
     *
     * `glucose_lowering_therapy` records the AGENT, so the predicate reads its
     * `sglt2` option rather than any dose beside it; the detail text is inert to
     * the evaluator by design.
     */
    id: "euglycaemic_dka_sglt2",
    display:
      "Ketosis on an SGLT2 inhibitor with a normal glucose — check acid-base before accepting the reading",
    condition: "euglycaemic_dka",
    ageBands: ["adolescent", "adult", "older_adult"],
    when: {
      id: "euglycaemic_dka_sglt2_when",
      label:
        "Taking an SGLT2 inhibitor, glucose < 11.1 mmol/L, with β-hydroxybutyrate ≥ 3.0 mmol/L or urine ketones 2+ or more",
      all: [{ feature: "glucose_lowering_therapy", op: "in", value: ["sglt2"] }],
      any: [
        { feature: "capillary_glucose", op: "<", value: 11.1, unit: "mmol/L" },
        { feature: "random_pg", op: "<", value: 11.1, unit: "mmol/L" },
      ],
      atLeast: { n: 1, of: KETOSIS_EITHER_MODALITY },
      citation: CRISES_2024_SGLT2,
    },
    posterior: "moderate",
    urgency: "immediate",
    confirmWith: ["venous_ph", "bicarbonate", "bohb", "sodium", "intercurrent_illness"],
    mimicsToExclude: KETOACIDOSIS_MIMICS,
    notes:
      "In one series 35% of people on an SGLT2 inhibitor presenting with DKA had a glucose below 11.1 mmol/L. Moderate rather than high because the acid-base has not been seen yet — ketosis is not ketoacidosis — and the rule's job is to get the gas taken, not to call the diagnosis. Very-low-carbohydrate diets, prolonged fasting, dehydration, heavy alcohol and surgery are the recognised precipitants in this group.",
    citation: CRISES_2024_SGLT2,
  },

  {
    /**
     * Pregnancy, kept apart from the SGLT2 rule rather than folded into it,
     * because the mimic changes: in pregnancy the ketones may be the vomiting
     * rather than the diabetes, and hyperemesis is on the consensus's own
     * differential list. The action is the same — measure the acid-base — but
     * what you are excluding is not.
     *
     * Cited to ADA Section 6, which states the pregnancy case in one sentence
     * INCLUDING the glucose ceiling this rule tests. The consensus's differential
     * list carries the mimic and is kept at rule level, where the mimic belongs.
     */
    id: "euglycaemic_dka_pregnancy",
    display: "Ketosis in pregnancy with a normal glucose — check acid-base, and check it early",
    condition: "euglycaemic_dka",
    ageBands: ["adolescent", "adult", "older_adult"],
    when: {
      id: "euglycaemic_dka_pregnancy_when",
      label:
        "Pregnant, glucose < 11.1 mmol/L, with β-hydroxybutyrate ≥ 3.0 mmol/L or urine ketones 2+ or more",
      all: [{ feature: "pregnant", op: "present" }],
      any: [
        { feature: "capillary_glucose", op: "<", value: 11.1, unit: "mmol/L" },
        { feature: "random_pg", op: "<", value: 11.1, unit: "mmol/L" },
      ],
      atLeast: { n: 1, of: KETOSIS_EITHER_MODALITY },
      citation: ADA_S6_PREGNANCY_EUGLYCAEMIC,
    },
    posterior: "moderate",
    urgency: "immediate",
    confirmWith: ["venous_ph", "bicarbonate", "bohb", "sodium", "vomiting"],
    mimicsToExclude: KETOACIDOSIS_MIMICS,
    notes:
      "Pregnancy lowers the glucose at which ketoacidosis appears, so the reassuring number is even less reassuring here, and ADA warns that mixed acid-base disturbances make the diagnosis harder rather than easier. The competing explanation is on the same list: the vomiting of hyperemesis raises counter-regulatory hormones and produces ketones of its own, and starvation ketosis follows any day of not eating. Both are excluded by the acid-base, not by the glucose.",
    citation: CRISES_2024_DIFFERENTIAL,
  },
];

/* ── Hyperosmolar hyperglycaemic state, and the overlap ──────────────────── */

const HHS_RULES: DifferentialRule[] = [
  {
    /**
     * The bedside version, and the only rule in this file that turns on RECORDED
     * NEGATIVES. Absent Kussmaul breathing and absent ketotic fetor are what
     * separate the hyperosmolar patient from the ketoacidotic one before any
     * ketone is measured — and because `Assessed` distinguishes a recorded "no"
     * from an unasked question, this fires only where somebody actually looked.
     *
     * CITED TO THE ADULT TABLES. It used to rest entirely on ADA Recommendation
     * 14.37, which sits in "Children and Adolescents" under youth-onset type 2
     * diabetes — a paediatric recommendation underwriting an unbanded rule whose
     * real population is the 78-year-old, while the adult HHS column was declared
     * in this same file and left unused. Table 16.2 is the source that actually
     * states these discriminators: Kussmaul respiration appears in the DKA column
     * and nowhere in the HHS one, and change in cognitive state is listed as
     * common in HHS where DKA is "usually alert".
     */
    id: "hhs_suspected_bedside",
    display:
      "Marked hyperglycaemia with dehydration or cognitive change and no ketotic signs — consider HHS",
    condition: "hhs",
    when: {
      id: "hhs_bedside_when",
      label:
        "Glucose ≥ 33.3 mmol/L with dehydration or a change in cognition, and Kussmaul breathing and acetone fetor both recorded as absent",
      all: [
        { feature: "deep_rapid_breathing", op: "absent" },
        { feature: "acetone_breath", op: "absent" },
      ],
      any: [
        { feature: "capillary_glucose", op: ">=", value: 33.3, unit: "mmol/L" },
        { feature: "random_pg", op: ">=", value: 33.3, unit: "mmol/L" },
      ],
      atLeast: {
        n: 1,
        of: [
          { feature: "dehydration", op: "present" },
          { feature: "altered_mental_state", op: "present" },
          { feature: "disorientation", op: "present" },
          { feature: "mental_status", op: "in", value: ["drowsy", "stupor", "coma"] },
          { feature: "prolonged_capillary_refill", op: "present" },
        ],
      },
      citation: ADA_S16_HHS_PRESENTATION,
    },
    posterior: "moderate",
    urgency: "immediate",
    confirmWith: [
      "effective_osmolality",
      "total_osmolality",
      "sodium",
      "urea",
      "bohb",
      "urine_ketones",
      "venous_ph",
      "bicarbonate",
    ],
    mimicsToExclude: HYPEROSMOLAR_MIMICS,
    rulesOut: ["severe_dka", "hypoglycaemia"],
    notes:
      "It argues against SEVERE ketoacidosis and NOT against ketoacidosis. Absent Kussmaul breathing and absent fetor refute the severe end, where deep sighing respiration is expected; mild and early DKA have neither sign, so calling this a negative for DKA itself would be the dangerous over-read. Change in cognitive state is not one of Table 16.1's four HHS criteria, but Table 16.2 lists it as a common presenting feature — which is why it sits in an n-of-1 list rather than in the requirements. A CAPTURE LIMIT worth knowing at the bedside: a glucometer reads to 33.3 mmol/L and shows HI above it, and there is no way to record an above-range reading, so at a meter-only site this rule may stay silent in exactly the patient it was written for. Do not type 33.3 to make it fire; send the glucose, or treat on the picture.",
    citation: ADA_S16_HHS,
  },

  {
    /**
     * The biochemical version, and the one rule in the file entitled to rule DKA
     * out — which is why the conjunct it was missing mattered so much.
     *
     * ADA's HHS column has FOUR rows and this encoded three: it tested a
     * β-hydroxybutyrate under 3.0 and a bicarbonate at or above 15 and silently
     * dropped "pH ≥7.3". A patient at glucose 36, osmolality 308, BOHB 2.8,
     * bicarbonate 15 and a pH of 7.05 is excluded by ADA on the pH and fired here
     * anyway — announcing "without significant ketosis or acidosis" over a pH of
     * 7.05, and then subtracting from `dka` and `severe_dka` on the strength of
     * it. The pH is now required, and the ketone row is an n-of-1 over the blood
     * test and the strip, mirroring ADA's own "OR urine ketone strip less than 2+"
     * so a strip-only site can reach the same exclusion.
     */
    id: "hhs_hyperosmolar_without_ketosis",
    display: "Hyperosmolality without significant ketosis or acidosis — HHS rather than DKA",
    condition: "hhs",
    when: {
      id: "hhs_biochemical_when",
      label:
        "Glucose ≥ 33.3 mmol/L with effective osmolality > 300 mOsm/kg, bicarbonate ≥ 15 mmol/L and pH ≥ 7.3, and β-hydroxybutyrate < 3.0 mmol/L or urine ketones below 2+",
      all: [
        { feature: "effective_osmolality", op: ">", value: 300, unit: "mOsm/kg" },
        { feature: "bicarbonate", op: ">=", value: 15, unit: "mmol/L" },
        { feature: "venous_ph", op: ">=", value: 7.3, unit: "pH" },
      ],
      any: [
        { feature: "capillary_glucose", op: ">=", value: 33.3, unit: "mmol/L" },
        { feature: "random_pg", op: ">=", value: 33.3, unit: "mmol/L" },
      ],
      atLeast: {
        n: 1,
        of: [
          { feature: "bohb", op: "<", value: 3.0, unit: "mmol/L" },
          { feature: "urine_ketones", op: "in", value: ["neg", "trace", "1plus"] },
        ],
      },
      citation: ADA_S16_HHS,
    },
    posterior: "high",
    urgency: "immediate",
    confirmWith: ["effective_osmolality", "total_osmolality", "sodium", "urea", "venous_ph"],
    mimicsToExclude: HYPEROSMOLAR_MIMICS,
    rulesOut: ["dka", "severe_dka", "hypoglycaemia"],
    notes:
      "This is the only rule in the file that argues ketoacidosis off the list, so it may not do so until the acidosis has actually been excluded — all four of ADA's HHS rows are required, the pH included. Record WHICH osmolality was measured: 320 attaches to total osmolality and 300 to the effective one, and the two are separate features precisely so a value cannot be read against the wrong scale. HHS develops over days to a week rather than hours and the fluid deficit is larger, so the patient who looks less acutely ill can be the more depleted of the two. Note that the consensus prose states the non-acidotic pair as pH ≥ 7.30 and bicarbonate ≥ 18 while the table reprinted in ADA states 15; the table's figure is used here.",
    citation: ADA_S16_HHS,
  },

  {
    /**
     * The overlap, and the reason ordering two conditions was worth building.
     * The consensus reports clinical overlap in more than a third of
     * hyperglycaemic crises and, in the US cohort it cites, 27% of admissions
     * were mixed — and mixed events carry a higher hospital mortality than either
     * alone, so a list that could only ever say DKA *or* HHS would be wrong in
     * the group where being wrong costs the most.
     *
     * The four-item `atLeast` is the consensus's own definition of the overlap,
     * quoted on the citation: β-hydroxybutyrate ≥ 3.0, ketonuria ≥ 2+, pH < 7.30
     * or bicarbonate < 18, "which represents mixed DKA/HHS".
     *
     * No `rulesOut`. Arguing against either half is exactly the error this rule
     * exists to prevent.
     */
    id: "mixed_dka_hhs_suspected",
    display:
      "Hyperosmolality WITH significant ketonaemia or acidosis — a mixed DKA and HHS picture",
    condition: "mixed_dka_hhs",
    ageBands: ["adolescent", "adult", "older_adult"],
    when: {
      id: "mixed_when",
      label:
        "Glucose ≥ 33.3 mmol/L and effective osmolality > 300 mOsm/kg, with β-hydroxybutyrate ≥ 3.0 mmol/L, urine ketones 2+ or more, pH < 7.3 or bicarbonate < 18 mmol/L",
      all: [{ feature: "effective_osmolality", op: ">", value: 300, unit: "mOsm/kg" }],
      any: [
        { feature: "capillary_glucose", op: ">=", value: 33.3, unit: "mmol/L" },
        { feature: "random_pg", op: ">=", value: 33.3, unit: "mmol/L" },
      ],
      atLeast: {
        n: 1,
        of: [
          { feature: "bohb", op: ">=", value: 3.0, unit: "mmol/L" },
          { feature: "urine_ketones", op: "in", value: ["2plus", "3plus"] },
          { feature: "venous_ph", op: "<", value: 7.3, unit: "pH" },
          { feature: "bicarbonate", op: "<", value: 18, unit: "mmol/L" },
        ],
      },
      citation: CRISES_2024_MIXED,
    },
    posterior: "high",
    urgency: "immediate",
    confirmWith: [
      "bohb",
      "venous_ph",
      "bicarbonate",
      "effective_osmolality",
      "total_osmolality",
      "sodium",
      "urea",
    ],
    mimicsToExclude: [...HYPEROSMOLAR_MIMICS, ...KETOACIDOSIS_MIMICS],
    rulesOut: ["hypoglycaemia"],
    notes:
      "Reported inpatient mortality is 8% for mixed presentations against 5% for HHS and 3% for DKA, and mixed events carry an adjusted odds ratio of 2.7 against HHS. It has no complication of its own: `dka` and `hhs` can both be established from their own criteria and neither of them establishes the overlap, so nothing here promotes this ranking into a verdict. Treat it as the more dangerous of the two, not as an average of them.",
    citation: CRISES_2024_MIXED,
  },
];

/* ── Hypoglycaemia ───────────────────────────────────────────────────────── */

const HYPOGLYCAEMIA_RULES: DifferentialRule[] = [
  {
    /**
     * Level 2 first, because it is the one that is an emergency. The number is
     * ADA's; a clinician trained on UCG has 3.0 in their head as the threshold
     * for SYMPTOMS rather than for clinical significance, and WHO PEN treats at
     * 2.8, so this rule and the one below carry both readings in their notes.
     */
    id: "hypoglycaemia_level2_measured",
    display: "Measured glucose below 3.0 mmol/L — clinically significant hypoglycaemia, treat now",
    condition: "hypoglycaemia",
    when: {
      id: "hypo_level2_when",
      label: "Capillary or plasma glucose < 3.0 mmol/L",
      any: [
        { feature: "capillary_glucose", op: "<", value: 3.0, unit: "mmol/L" },
        { feature: "random_pg", op: "<", value: 3.0, unit: "mmol/L" },
      ],
      citation: ADA_S6_HYPO_LEVELS,
    },
    posterior: "high",
    urgency: "immediate",
    confirmWith: ["capillary_glucose", "random_pg", "hypo_neuroglycopenic_features", "seizure"],
    mimicsToExclude: NEUROGLYCOPENIA_MIMICS,
    rulesOut: ["hhs"],
    notes:
      "This is the one number the two documents this catalog runs on agree about: ADA calls 3.0 mmol/L level 2, the threshold at which neuroglycopenic symptoms begin, and UCG 1.1.6 says symptoms generally occur below the same figure. They part company above it — ADA alerts at 3.9 where UCG has nothing, and WHO PEN treats only below 2.8 — which is why the alert value is a separate rule rather than a wider version of this one. It rules out HHS, which requires a glucose of 33.3 mmol/L or more, and deliberately does NOT rule out ketoacidosis — a low glucose and ketoacidosis coexist in the euglycaemic presentations above. Recheck after treatment: a low that does not correct is a different problem.",
    citation: UCG_2023_HYPO,
  },

  {
    /**
     * The alert value. Separate from level 2 rather than folded into it because
     * ADA separates them and the action differs — this one is "give sugar and
     * find out why", not "this is an emergency". Both may fire; the ranker keeps
     * the stronger posterior and the more pressing urgency, and shows both rows.
     */
    id: "hypoglycaemia_level1_measured",
    display: "Measured glucose below 3.9 mmol/L — hypoglycaemia alert value",
    condition: "hypoglycaemia",
    when: {
      id: "hypo_level1_when",
      label: "Capillary or plasma glucose < 3.9 mmol/L",
      any: [
        { feature: "capillary_glucose", op: "<", value: 3.9, unit: "mmol/L" },
        { feature: "random_pg", op: "<", value: 3.9, unit: "mmol/L" },
      ],
      citation: ADA_S6_HYPO_LEVELS,
    },
    posterior: "moderate",
    urgency: "urgent",
    confirmWith: [
      "capillary_glucose",
      "hypo_autonomic_warning",
      "hypo_neuroglycopenic_features",
      "glucose_lowering_therapy",
      "sulfonylurea_agent",
    ],
    mimicsToExclude: NEUROGLYCOPENIA_MIMICS,
    rulesOut: ["hhs"],
    notes:
      "An alert value, not an emergency by itself — but ask which drug produced it before moving on. A sulfonylurea low, glibenclamide especially, relapses for many hours after it is first corrected, and the patient who was fine at the second reading is the one who is found unresponsive later. Record whether the autonomic warning was there: an absent warning here is evidence of impaired awareness, not evidence against a low.",
    citation: ADA_S6_HYPO_LEVELS,
  },

  {
    /**
     * Level 3 is defined by BEHAVIOUR and not by a number — a severe event
     * needing another person, irrespective of the glucose value. That is what
     * lets a clinic with no meter still record the most important hypoglycaemia
     * there is, and it is why this rule reads no glucose at all.
     *
     * It ranks `severe_hypoglycaemia`, which conditions.ts defines for exactly
     * this event and which nothing in the catalog reached before. It used to
     * rank plain `hypoglycaemia`, so a level 3 event and a level 1 alert value
     * arrived on the same row, which is the distinction ADA draws the level for.
     */
    id: "severe_hypoglycaemia_present_event",
    display: "Severe hypoglycaemia — an event that required another person's help",
    condition: "severe_hypoglycaemia",
    when: {
      id: "severe_hypo_present_when",
      label: "Required third-party assistance for a low, at any glucose value",
      all: [{ feature: "needed_third_party_help", op: "present" }],
      citation: ADA_S6_HYPO_LEVELS,
    },
    posterior: "high",
    urgency: "immediate",
    confirmWith: [
      "capillary_glucose",
      "hypo_neuroglycopenic_features",
      "impaired_hypo_awareness",
      "glucose_lowering_therapy",
      "sulfonylurea_agent",
    ],
    mimicsToExclude: NEUROGLYCOPENIA_MIMICS,
    notes:
      "No glucose threshold appears in this rule because none appears in the definition. It carries no `rulesOut` for the same reason: an event says nothing about the number in front of you now, and a severe low and a hyperglycaemic crisis can belong to the same admission. This capture sits in the ACUTE section, which is why it is read as the event at hand — but it carries no timestamp, so if what is being recorded is a low from last month, use the reported-history rule below instead. Impaired awareness makes the next event more likely to be this one, so screen for it here rather than at the annual review.",
    citation: ADA_S6_HYPO_LEVELS,
  },

  {
    /**
     * The SAME event, REPORTED — and split off precisely because the catalog
     * cannot tell the two apart otherwise.
     *
     * `hypoglycaemia_requiring_assistance` is a chronic screening question in the
     * symptoms section with no time window at all. Folded into the rule above it
     * meant a type 1 patient at an annual review who had one severe low eighteen
     * months ago pinned hypoglycaemia to the top of the list at `immediate`, with
     * a red beside it, at every visit for the rest of their life. That is the
     * alarm fatigue this file argues against on the very first rule.
     *
     * ADA's instruction for a reported event is to review it at the encounter and
     * evaluate it — targets go up, the regimen is reconsidered, the driving
     * conversation happens — so `urgent` and `moderate`, not `immediate` and
     * `high`. Nothing is lost: the event is still ranked, still visible, still
     * carries its confirmatory set.
     */
    id: "severe_hypoglycaemia_reported_history",
    display:
      "A severe low reported in the history — review the regimen and screen for impaired awareness",
    condition: "severe_hypoglycaemia",
    when: {
      id: "severe_hypo_reported_when",
      label: "Reports a low that needed another person's help, at any glucose value",
      all: [{ feature: "hypoglycaemia_requiring_assistance", op: "present" }],
      citation: ADA_S6_HYPO_REVIEW,
    },
    posterior: "moderate",
    urgency: "urgent",
    confirmWith: [
      "hypo_episodes_per_month",
      "impaired_hypo_awareness",
      "hypo_precipitant",
      "glucose_lowering_therapy",
      "sulfonylurea_agent",
      "insulin_regimen_pattern",
    ],
    mimicsToExclude: NEUROGLYCOPENIA_MIMICS,
    notes:
      "This is a HISTORY and the catalog cannot date it — the question carries no time window — so it says nothing about the glucose in front of you and is not a resuscitation trigger. What it does change is the plan: ADA asks for the history to be reviewed at every encounter, for the regimen to be reconsidered, and for impaired awareness and fear of hypoglycaemia to be screened for. Ask which drug, at what time of day, and whether anybody has ever had to give glucagon.",
    citation: ADA_S6_HYPO_REVIEW,
  },

  {
    /**
     * The state rather than the event, and a genuine combination rather than a
     * single answer: neuroglycopenia that arrived with NO autonomic warning ahead
     * of it. That ordering is what impaired awareness looks like at the bedside,
     * and it is only expressible because `Assessed` separates a recorded "no
     * warning" from a question nobody asked.
     *
     * `same_day` rather than `immediate`: ADA's instruction is to screen and to
     * refer for structured education, which is a clinic action, not a
     * resuscitation. The condition it ranks had no rule at all before this.
     */
    id: "hypoglycaemia_unawareness_neuroglycopenia_first",
    display:
      "Neuroglycopenia with no autonomic warning before it — impaired awareness of hypoglycaemia",
    condition: "hypoglycaemia_unawareness",
    when: {
      id: "hypo_unaware_when",
      label:
        "Neuroglycopenic features present with the autonomic warning symptoms recorded as absent",
      all: [
        { feature: "hypo_neuroglycopenic_features", op: "present" },
        { feature: "hypo_autonomic_warning", op: "absent" },
      ],
      citation: ADA_S6_HYPO_UNAWARE,
    },
    posterior: "moderate",
    urgency: "same_day",
    confirmWith: [
      "impaired_hypo_awareness",
      "hypo_episodes_per_month",
      "hypoglycaemia_requiring_assistance",
      "glucose_lowering_therapy",
      "sulfonylurea_agent",
    ],
    mimicsToExclude: [
      ...NEUROGLYCOPENIA_MIMICS,
      "Beta-blockade masking the autonomic warning",
      "A low so rapid that the warning was never noticed",
    ],
    notes:
      "The ORDER is the finding: the brain went first and nothing warned them. An absent warning is evidence of impaired awareness, never evidence against a low. It changes the plan rather than the moment — glycaemic targets go up, the regimen is reconsidered, and ADA asks for referral for structured education, with awareness recoverable in many people after weeks of scrupulous avoidance of lows. Ask separately whether they are on a beta-blocker, which blunts the same symptoms for a different reason.",
    citation: ADA_S6_HYPO_UNAWARE,
  },

  {
    /**
     * THE FALSE-POSITIVE FIX, and it is worth saying plainly what was wrong.
     *
     * New confusion supports hypoglycaemia — confusion is the first of the five
     * neuroglycopenic items — so a disoriented patient ranked hypoglycaemia even
     * with a glucose of 27 in front of the clinician, because nothing in the
     * catalog was entitled to argue back. Findings discriminate; NUMBERS
     * discriminate through a cited threshold in a rule (ADR 0083), and until this
     * rule existed there was no such rule for a glucose that is simply not low.
     *
     * TWO CORRECTIONS SINCE. The criterion is now cited to ADA Table 16.1, which
     * contains the 11.1 mmol/L figure it tests; it used to cite Table 6.4, the
     * hypoglycaemia classification, which contains only 3.9 and 3.0 — so the one
     * threshold the rule's safety property depends on had no source behind it.
     *
     * And the posterior is `moderate`, not `low`, because the arithmetic of `low`
     * did not do what the comment here claimed. A fired rule subtracts its own
     * posterior from everything in `rulesOut`; `low` is two points and the
     * strongest supporting finding it has to cancel — recorded neuroglycopenia —
     * is worth four, so hypoglycaemia still topped the list with a 27 on the
     * screen. `moderate` exceeds it. That is a ranking decision the engine does
     * not enforce and cannot: if the ladder changes, this number has to be
     * revisited, and nothing will fail if it is not.
     *
     * `moderate` for `dka` is honest in its own right rather than a number chosen
     * to make the subtraction work: a glucose at or above 11.1 with a reduced
     * conscious level satisfies Table 2's 'D' row and sits at the moderate-to-
     * severe end of its mental-status row. It is still not a diagnosis, and the
     * ketones and acid-base still decide it.
     */
    id: "hyperglycaemia_with_impaired_consciousness",
    display:
      "Impaired consciousness with a measured glucose above the diabetes threshold — not a low; get ketones and osmolality",
    condition: "dka",
    when: {
      id: "hyperglycaemia_conscious_when",
      label:
        "Glucose ≥ 11.1 mmol/L with confusion, drowsiness, a falling conscious level, neuroglycopenic features or a seizure",
      any: [
        { feature: "capillary_glucose", op: ">=", value: 11.1, unit: "mmol/L" },
        { feature: "random_pg", op: ">=", value: 11.1, unit: "mmol/L" },
      ],
      atLeast: {
        n: 1,
        of: [
          { feature: "altered_mental_state", op: "present" },
          { feature: "disorientation", op: "present" },
          { feature: "mental_status", op: "in", value: ["drowsy", "stupor", "coma"] },
          { feature: "conscious_level_falling", op: "present" },
          { feature: "hypo_neuroglycopenic_features", op: "present" },
          { feature: "seizure", op: "present" },
        ],
      },
      citation: ADA_S16_DKA,
    },
    posterior: "moderate",
    urgency: "immediate",
    confirmWith: [
      "bohb",
      "urine_ketones",
      "venous_ph",
      "bicarbonate",
      "effective_osmolality",
      "sodium",
      "gcs_total",
    ],
    mimicsToExclude: [...HYPEROSMOLAR_MIMICS, "Hypoglycaemia earlier in the same episode"],
    rulesOut: ["hypoglycaemia"],
    notes:
      "This reading is not a low: ADA's alert value is 3.9 mmol/L and its clinically significant threshold 3.0, so a glucose at or above 11.1 excludes hypoglycaemia AS THE CAUSE OF THIS PRESENTATION AT THIS MOMENT — and nothing more. It says nothing about a low earlier in the day, nothing about the next one, and nothing about impaired awareness. Recheck the glucose if the conscious level changes, and treat a fall during treatment of a hyperglycaemic crisis as a low until a number says otherwise.",
    citation: ADA_S6_HYPO_LEVELS,
  },
];

/* ── Cerebral oedema complicating treatment ──────────────────────────────── */

const CEREBRAL_OEDEMA_RULES: DifferentialRule[] = [
  {
    /**
     * Deliberately NOT age-banded, matching `cerebral_oedema` in conditions.ts.
     * The BSPED warning set is written for under-18s and cerebral oedema is far
     * commoner there, but the adult consensus says it occurs in adults too and
     * asks for changes in mental status to be watched for, and a band here would
     * hide the rule from the adults that sentence was written for. What the age
     * bands DO shape is the capture: the headache and Cushing-response findings
     * are banded `adolescent` today, so in an adult this rule rests on the two
     * unbanded findings.
     *
     * ANY ONE of the four, which is what the source says — "if they have ANY of
     * these early manifestations" — and not the two an earlier version required
     * without disclosing the deviation anywhere the clinician would see it. On a
     * complication carrying a 21–24% mortality, a rule strictly less sensitive
     * than its own guideline is the wrong error to make quietly.
     *
     * What replaces the count is the antecedent BSPED actually wrote and this
     * rule had dropped: "a child or young person WITH DKA". Without it the rule
     * fired at `immediate` on any obtundation — and in an adult it collapses to
     * `conscious_level_falling` and `disorientation`, both of which point at
     * hypoglycaemia in this same catalog, so an adult on glibenclamide with the
     * meter out of strips led the differential with a complication of a treatment
     * they had not received, above the reversible cause.
     *
     * The anchor is KETOSIS and not hyperglycaemia, and the difference is not
     * pedantry: anchoring on a glucose of 11.1 put cerebral oedema at the top of
     * the list for any hyperglycaemic patient who was merely confused, which is a
     * large fraction of the people this catalog sees. BSPED's antecedent is DKA,
     * and by the time these signs mean anything — during treatment — a ketone
     * value exists. A patient with no ketone measured raises this rule not at all,
     * which is the safe direction to fail in: the differential then leads with the
     * reversible cause, and the first instruction below is to check a glucose.
     *
     * `moderate`, not `high`. BSPED's instruction on one early manifestation is
     * to ASSESS immediately, which is what `urgency` says; the strength of the
     * evidence for cerebral oedema on a single early sign is not high, and the
     * established-signs rule below is where `high` belongs.
     */
    id: "cerebral_oedema_early_warning",
    display:
      "Early warning of cerebral oedema during treatment — assess immediately, do not attribute it to the dehydration",
    condition: "cerebral_oedema",
    when: {
      id: "cerebral_oedema_early_when",
      label:
        "In ketoacidosis — β-hydroxybutyrate ≥ 3.0 mmol/L or urine ketones 2+ or more — with any one of: new or worsening headache, an unexpected fall in heart rate with a rising blood pressure, a falling conscious level, new confusion, agitation or irritability",
      any: KETOSIS_EITHER_MODALITY,
      atLeast: {
        n: 1,
        of: [
          { feature: "dka_new_headache", op: "present" },
          { feature: "dka_bradycardia_with_hypertension", op: "present" },
          { feature: "conscious_level_falling", op: "present" },
          { feature: "disorientation", op: "present" },
        ],
      },
      citation: BSPED_2021_OEDEMA,
    },
    posterior: "moderate",
    urgency: "immediate",
    confirmWith: [
      "gcs_total",
      "conscious_level_falling",
      "cerebral_oedema_late_signs",
      "capillary_glucose",
      "sodium",
      "effective_osmolality",
    ],
    mimicsToExclude: CEREBRAL_OEDEMA_MIMICS,
    notes:
      "CHECK A GLUCOSE FIRST. A low during treatment produces this exact picture and reverses in minutes, and both of the findings an adult can record here also point at hypoglycaemia. Then check the sodium: a corrected sodium that is falling rather than rising as the glucose comes down signals free-water excess. The timing is half the finding and no feature in this catalog records it — these signs mean cerebral oedema once treatment has started and the ketones, the acidosis and the thirst are all improving, so a rule that fires before any treatment has begun is describing the presentation, not a complication of it. BSPED asks for hourly to two-hourly neurological observations precisely so that comparison exists to be made, and instructs staff to report a headache or a slowing pulse to the medical team immediately, at night included.",
    citation: BSPED_2021_OEDEMA,
  },

  {
    /**
     * The signs that mean the window has closed. Any ONE of them, because the
     * source treats them as one instruction — and the instruction is to treat,
     * not to image. A normal optic disc excludes nothing; papilloedema is a late
     * sign of a late sign.
     *
     * The late-sign capture is banded `adolescent` today (ADR 0083 defers the
     * younger bands, and this finding has not yet been extended to adults), so
     * this rule can only fire where that finding is rendered. It is left unbanded
     * rather than pinned to `adolescent` so it starts working the moment that
     * capture widens, and so it never contradicts the condition's own scope.
     *
     * No crisis anchor here, unlike the early-warning rule. These signs are not
     * ambiguous the way a headache is: an oculomotor palsy with abnormal
     * posturing during a diabetes encounter needs treating whatever the ketones
     * say, and requiring a ketone value first would delay the one instruction the
     * source gives.
     */
    id: "cerebral_oedema_established_signs",
    display: "Signs of raised intracranial pressure during treatment — treat immediately",
    condition: "cerebral_oedema",
    when: {
      id: "cerebral_oedema_late_when",
      label:
        "Any of: an abnormal breathing pattern or respiratory pauses, oculomotor palsy, abnormal posturing, unequal or dilated pupils, papilloedema",
      any: [
        {
          feature: "cerebral_oedema_late_signs",
          op: "in",
          value: [
            "breathing_pattern",
            "oculomotor_palsy",
            "abnormal_posturing",
            "pupils",
            "papilloedema",
          ],
        },
      ],
      citation: BSPED_2021_OEDEMA,
    },
    posterior: "high",
    urgency: "immediate",
    confirmWith: ["gcs_total", "conscious_level_falling", "sodium", "capillary_glucose"],
    mimicsToExclude: CEREBRAL_OEDEMA_MIMICS,
    notes:
      "BSPED instructs that treatment not be delayed while hypertonic saline or mannitol is sourced — give whichever is available, restrict fluids to half maintenance, and call senior help. Cerebral oedema is unpredictable, occurs more often in newly diagnosed diabetes, and carries a mortality of 21–24% in children; the adult consensus calls it rare in adults rather than absent. That is why the early-warning rule above exists at all: by the time this one fires, the assessment that should have happened has already been missed.",
    citation: BSPED_2021_OEDEMA,
  },
];

/**
 * The acute cluster, in the order a clinician meets it: the ketoacidoses, the
 * one that hides behind a normal glucose, the hyperosmolar end and the overlap,
 * the lows, and the complication of treating any of them.
 */
export const ACUTE_RULES: DifferentialRule[] = [
  ...DKA_RULES,
  ...EUGLYCAEMIC_RULES,
  ...HHS_RULES,
  ...HYPOGLYCAEMIA_RULES,
  ...CEREBRAL_OEDEMA_RULES,
];
