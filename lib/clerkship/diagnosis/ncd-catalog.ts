/**
 * NCD-prioritised diagnosis catalog (Internal Medicine) — the chronic-disease
 * substrate for the diagnostic-logic Assessment. Parallel to the maps-derived
 * acute catalog (catalog.ts); merged at the SUGGESTION point (NCDs surfaced
 * first), never forked into the reasoning maps.
 *
 * SUPPORTS are EXISTING catalog codes (HPC/ROS symptom codes + condition codes
 * from the seeded picklists) — derived, not invented inline. DEFINING CRITERIA
 * (HbA1c/BP/eGFR/spirometry/TFT/echo thresholds) are guideline-sensitive: fetched
 * + cited + version-stamped at build (WHO/Uganda-first, specialty fallback) via
 * the build-time research fan-out — NEVER from memory. Persisted at
 * docs/clinical/ncd-defining-criteria-research.json.
 *
 * Criteria INFORM the suggestion's rank + show what is met vs not; they NEVER
 * auto-diagnose. Support ranks, never asserts; must-not-miss surfaces regardless;
 * the clinician selects (the diagnosis of record is the clinician's). not-measured
 * ≠ normal.
 *
 * NCD_CATALOG_CSO_SIGNED stays FALSE until Fadhul ratifies the supports + the
 * cited criteria (many carry confidence "needs_cso_input" — assay-dependent TSH,
 * HbA1c reliability with anaemia/HbS in Uganda, BP confirmation cadence, the
 * 2012-vs-2023 WHF RHD criteria). Until signed, the NCD layer is dark (no NCD
 * suggestions surface, the picker shows only the signed acute catalog).
 */

// Surfaced 2026-06-16 (CSO direction): the NCD catalog ENTRIES are live so the
// diagnoses (incl. the diabetes types) are visible + selectable + reconcilable.
// HONESTY IS PRESERVED PER-CRITERION: each defining criterion still carries its
// confidence, and the 17 `needs_cso_input` thresholds are shown with a "pending
// ratification" marker in the UI — criteria INFORM + display, they never
// auto-diagnose. The clinician selects; the diagnosis of record is theirs.
export const NCD_CATALOG_CSO_SIGNED = true;
export const NCD_CATALOG_BUILT = "2026-06-16";

export type NcdConfidence = "high" | "medium" | "needs_cso_input";

export interface NcdDefiningCriterion {
  /** The diagnostic criterion (what defines the NCD). */
  criterion: string;
  /** The measured quantity (e.g. "HbA1c", "office SBP/DBP", "eGFR"). */
  measure: string;
  /** The numeric threshold WITH unit (verbatim from the cited guideline). */
  threshold: string;
  /** LOINC where confidently known. */
  loinc: string;
  confidence: NcdConfidence;
  ugandaNote: string;
  source: { guideline: string; version: string; recommendation: string; url: string };
}

export interface NcdDiagnosisEntry {
  code: string;
  display: string;
  /** ICD-10 linked only from verified ICD10_CODES; else null (pending). */
  icd10: string | null;
  category: "ncd";
  status: "net_new" | "from_reasoning_maps";
  mustNotMiss: boolean;
  /** Existing HPC/ROS symptom codes that support this diagnosis. */
  supportingSymptoms: string[];
  /** Existing condition/background codes that raise pre-test probability. */
  riskFactors: string[];
  /** The complications marking "NCD with complications" (display strings). */
  complications: string[];
  /** Vitals/labs that support (not define) — display strings. */
  measuredSupports: string[];
  /** The defining diagnostic criteria (cited, version-stamped). */
  definingCriteria: NcdDefiningCriterion[];
  ugandaNote: string;
}

export const NCD_DIAGNOSIS_CATALOG: NcdDiagnosisEntry[] = [
  {
    code: "type_2_diabetes_mellitus",
    display: "Type 2 diabetes mellitus",
    icd10: "E11",
    category: "ncd",
    status: "net_new",
    mustNotMiss: false,
    supportingSymptoms: [
      "polyuria_polydipsia",
      "weight_loss",
      "fatigue",
      "recurrent_infections",
      "visual_disturbance",
    ],
    riskFactors: ["hypertension", "hyperlipidaemia", "ihd", "stroke_tia"],
    complications: [
      "Diabetic retinopathy (leading cause of preventable blindness) — dilated retinal exam",
      "Diabetic nephropathy / chronic kidney disease — eGFR + spot urine albumin-to-creatinine ratio annually",
      "Diabetic peripheral neuropathy and autonomic neuropathy — annual foot exam (monofilament)",
      "Diabetic foot ulceration / lower-limb amputation",
      "Cardiovascular disease — ischaemic heart disease, myocardial infarction, stroke (macrovascular)",
      "Peripheral arterial disease",
      "Hyperglycaemic hyperosmolar state (HHS); diabetic ketoacidosis less typical but possible",
    ],
    measuredSupports: [
      "Fasting plasma glucose (venous, lab) — LOINC 1558-6",
      "HbA1c — LOINC 4548-4 (%) / 59261-8 (mmol/mol)",
      "Random / casual plasma glucose — LOINC 2345-7",
      "2-hour OGTT plasma glucose (75 g) — LOINC 1518-0",
      "Capillary fingerstick glucose (screening/point-of-care, not confirmatory) — LOINC 41653-7",
      "Body mass index / weight (T2DM phenotype)",
      "Blood pressure (frequent co-morbid hypertension)",
    ],
    ugandaNote:
      "Confirm whether the tool should encode the Ugandan-validated lower cut-offs (FPG ~6.4 mmol/L, HbA1c ~6.3%) as an advisory flag, or strictly use WHO 7.0 / 6.5%. Recommend strict WHO thresholds with an advisory note.",
    definingCriteria: [
      {
        criterion: "HbA1c (glycated haemoglobin)",
        measure: "HbA1c in whole blood (NGSP-certified / IFCC method)",
        threshold: "≥ 6.5% (≥ 48 mmol/mol)",
        loinc: "4548-4 (HbA1c/Hgb.total, %), 59261-8 (IFCC, mmol/mol)",
        confidence: "high",
        ugandaNote:
          "WHO/UCG-endorsed cut-off applied in Uganda. CAUTION: a Ugandan diagnostic-accuracy study (PLOS One 2022) found the optimal HbA1c cut-off in Black Ugandans was lower (~6.3% / 45 mmol/mol), and HbA1c is unreliable with the high local burden of anaemia, sickle-cell/HbS trait, malaria and HIV — prefer plasma glucose when haemoglobinopathy/anaemia is likely. HbA1c assay availability is limited outside referral labs.",
        source: {
          guideline:
            "ADA Standards of Care in Diabetes — Section 2 (Diagnosis & Classification), concordant with WHO criteria",
          version: "2025",
          recommendation:
            "HbA1c ≥ 6.5% (48 mmol/mol) is diagnostic of diabetes; performed by an NGSP-certified method standardised to the DCCT assay.",
          url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC11635041/",
        },
      },
      {
        criterion: "Fasting plasma glucose (FPG)",
        measure: "Plasma glucose after ≥ 8 h no caloric intake",
        threshold: "≥ 7.0 mmol/L (≥ 126 mg/dL)",
        loinc: "1558-6 (fasting glucose, mass/volume, serum/plasma)",
        confidence: "high",
        ugandaNote:
          "WHO cut-off used in Uganda (UCG / WHO-PEN). Ugandan validation study suggested a slightly lower optimal FPG (~6.4 mmol/L) for local Black populations, but the official threshold remains 7.0 mmol/L. Glucometer fingerstick is screening only — a venous laboratory plasma glucose is required to confirm.",
        source: {
          guideline:
            "WHO definition/diagnosis of diabetes (cited as the criterion applied in Uganda); ADA 2025 Section 2",
          version: "WHO criteria; ADA 2025",
          recommendation:
            "FPG ≥ 7.0 mmol/L (126 mg/dL); fasting = no caloric intake for at least 8 hours.",
          url: "https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0272515",
        },
      },
      {
        criterion: "2-hour plasma glucose during OGTT",
        measure: "Plasma glucose 2 h after 75 g anhydrous glucose oral load (OGTT, per WHO method)",
        threshold: "≥ 11.1 mmol/L (≥ 200 mg/dL)",
        loinc: "1518-0 / 1521-4 (glucose 2 h post 75g PO, serum/plasma)",
        confidence: "high",
        ugandaNote:
          "OGTT is the WHO reference standard but is resource-intensive (fasting + timed sampling) and infrequently performed outside referral/research settings in Uganda; FPG or random glucose is the practical first-line test at most facilities.",
        source: {
          guideline:
            "ADA 2025 Section 2 (test performed per WHO using 75 g anhydrous glucose), concordant with WHO",
          version: "2025",
          recommendation:
            "2-h plasma glucose ≥ 11.1 mmol/L (200 mg/dL) during a 75 g OGTT is diagnostic.",
          url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC11635041/",
        },
      },
      {
        criterion: "Random plasma glucose with classic symptoms",
        measure:
          "Random (any time) plasma glucose PLUS classic hyperglycaemia symptoms (polyuria, polydipsia, unexplained weight loss) or hyperglycaemic crisis",
        threshold: "≥ 11.1 mmol/L (≥ 200 mg/dL) + symptoms/crisis",
        loinc: "2345-7 (glucose, serum/plasma); 2339-0 (glucose, blood)",
        confidence: "high",
        ugandaNote:
          "Most pragmatic diagnostic route at Ugandan facilities: a single random plasma glucose ≥ 11.1 mmol/L in a symptomatic patient is diagnostic and needs no confirmatory second test.",
        source: {
          guideline:
            "ADA 2025 Section 2, concordant with WHO; cited as WHO criteria in Ugandan literature",
          version: "2025",
          recommendation:
            "In a patient with classic symptoms of hyperglycaemia or hyperglycaemic crisis, random plasma glucose ≥ 11.1 mmol/L (200 mg/dL) is sufficient to diagnose diabetes.",
          url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC11635041/",
        },
      },
      {
        criterion: "Confirmation rule",
        measure:
          "Rule governing when a single abnormal result confirms diagnosis vs when repeat/second test is needed",
        threshold: "Two abnormal results required UNLESS unequivocal hyperglycaemia/symptoms",
        loinc: "",
        confidence: "high",
        ugandaNote:
          "In the absence of unequivocal hyperglycaemia (i.e., asymptomatic, screen-detected patients), diagnosis needs two abnormal results — either two different tests obtained at the same time (e.g. HbA1c + FPG on one sample) or the same test repeated at two time points. A symptomatic patient with random PG ≥ 11.1 mmol/L is diagnosed on that single result.",
        source: {
          guideline: "ADA 2025 Section 2 (Diagnosis & Classification)",
          version: "2025",
          recommendation:
            "In the absence of unequivocal hyperglycaemia, diagnosis requires two abnormal test results from the same sample or two separate samples; if two different tests are both above threshold the diagnosis is confirmed, if discordant repeat the abnormal test.",
          url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC11635041/",
        },
      },
    ],
  },
  {
    code: "type_1_diabetes_mellitus",
    display: "Type 1 diabetes mellitus",
    icd10: null,
    category: "ncd",
    status: "net_new",
    mustNotMiss: false,
    supportingSymptoms: ["polyuria_polydipsia", "weight_loss", "fatigue"],
    riskFactors: [],
    complications: [
      "Diabetic ketoacidosis (DKA) — frequent at presentation and during illness",
      "Diabetic retinopathy",
      "Diabetic nephropathy / CKD — eGFR + urine ACR",
      "Diabetic peripheral and autonomic neuropathy",
      "Cardiovascular disease (long-term macrovascular)",
      "Hypoglycaemia (treatment-related, especially insulin)",
      "Foot ulceration / amputation (long term)",
    ],
    measuredSupports: [
      "Plasma glucose (FPG / random) — confirms the diabetes diagnosis",
      "HbA1c — LOINC 4548-4",
      "Blood/urine ketones (beta-hydroxybutyrate) — ketosis-prone presentation / DKA",
      "Venous blood gas + bicarbonate + anion gap — DKA assessment",
      "C-peptide — LOINC 1986-9 (where available)",
      "GAD65 / IA-2 / ZnT8 / insulin autoantibodies (where available)",
    ],
    ugandaNote:
      "Type 1 is not a distinct glucose threshold — confirm the tool models it as a classification layer over a confirmed diabetes diagnosis (phenotype + ketosis + insulin dependence), with autoantibody/C-peptide as optional confirmatory inputs that are often unavailable in Uganda.",
    definingCriteria: [
      {
        criterion: "Same glucose/HbA1c diagnostic thresholds as any diabetes",
        measure: "FPG / 2-h OGTT / random glucose / HbA1c (identical biochemical cut-offs to T2DM)",
        threshold:
          "FPG ≥ 7.0 mmol/L (126 mg/dL); 2-h OGTT ≥ 11.1 mmol/L (200 mg/dL); HbA1c ≥ 6.5% (48 mmol/mol); random ≥ 11.1 mmol/L (200 mg/dL) + symptoms",
        loinc: "1558-6 (FPG), 4548-4 (HbA1c), 2345-7 (random glucose)",
        confidence: "high",
        ugandaNote:
          "Diagnosis of diabetes itself is biochemically identical to T2DM — type 1 is a CLASSIFICATION on top of a confirmed diabetes diagnosis, not a separate glucose threshold. Often presents acutely with DKA at first presentation in Uganda.",
        source: {
          guideline:
            "ADA 2025 Section 2 — diagnostic glucose/HbA1c criteria are common to all diabetes; classification by aetiology",
          version: "2025",
          recommendation:
            "Diabetes is diagnosed by the same glycaemic criteria regardless of type; type 1 vs type 2 is determined by aetiologic features, not by different glucose cut-offs.",
          url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC11635041/",
        },
      },
      {
        criterion: "Islet autoantibodies (autoimmune marker)",
        measure:
          "Serum islet autoantibodies: GAD65 (most available), IA-2, ZnT8, insulin autoantibodies (IAA)",
        threshold: "Presence of ≥ 1 islet autoantibody supports autoimmune (type 1) diabetes",
        loinc: "GAD65 Ab 13926-8; IA-2/ICA512 Ab 49053-9; ZnT8 Ab 87383-7; insulin Ab 8086-1",
        confidence: "medium",
        ugandaNote:
          "Autoantibody assays are largely UNAVAILABLE in most Ugandan settings, so type 1 is frequently a CLINICAL diagnosis (young/lean, abrupt onset, ketosis/DKA-prone, insulin-dependent from outset). Note atypical phenotypes seen in sub-Saharan Africa (e.g. ketosis-prone atypical diabetes / 'Flatbush', malnutrition-related diabetes) can mimic T1DM — needs CSO input on classification logic.",
        source: {
          guideline: "ADA 2025 Section 2 (Type 1 diabetes — autoimmune markers)",
          version: "2025",
          recommendation:
            "Islet autoantibodies (GAD, IA-2, ZnT8, insulin) characterise immune-mediated type 1 diabetes; their presence supports classification as type 1.",
          url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC11635041/",
        },
      },
      {
        criterion: "C-peptide (endogenous insulin reserve)",
        measure:
          "Fasting or random serum/plasma C-peptide (ideally paired with concurrent glucose)",
        threshold:
          "Low / undetectable C-peptide (e.g. < 0.24 ng/mL / < 80 pmol/L) indicates severe insulin deficiency",
        loinc: "1986-9 (C-peptide, serum/plasma, mass/volume)",
        confidence: "medium",
        ugandaNote:
          "C-peptide testing has limited availability in Uganda. When obtainable it helps distinguish insulin-deficient (type 1) from insulin-resistant/retained-secretion (type 2) cases, and identify ketosis-prone atypical diabetes; must be interpreted with a simultaneous glucose. CSO to confirm the exact cut-off to encode.",
        source: {
          guideline: "ADA 2025 Section 2 (C-peptide in classification)",
          version: "2025",
          recommendation:
            "Low or undetectable C-peptide (<0.24 ng/mL / <80 pmol/L) indicates severe insulin deficiency consistent with type 1 diabetes.",
          url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC11635041/",
        },
      },
    ],
  },
  {
    code: "diabetes_with_complications",
    display: "Diabetes with complications",
    icd10: null,
    category: "ncd",
    status: "net_new",
    mustNotMiss: false,
    supportingSymptoms: [
      "polyuria_polydipsia",
      "visual_disturbance",
      "numbness_paraesthesia",
      "ankle_leg_swelling",
    ],
    riskFactors: ["diabetes_t2", "diabetes_t1", "hypertension"],
    complications: [
      "Diabetic nephropathy / chronic kidney disease (may progress to ESKD)",
      "Diabetic retinopathy / maculopathy (vision loss, blindness)",
      "Diabetic peripheral and autonomic neuropathy",
      "Diabetic foot ulceration, infection, lower-limb amputation",
      "Coronary artery disease / myocardial infarction",
      "Cerebrovascular disease / stroke",
      "Peripheral arterial disease",
      "Acute: DKA and hyperosmolar hyperglycaemic state",
    ],
    measuredSupports: [
      "Urine albumin-to-creatinine ratio (uACR) — LOINC 9318-7",
      "eGFR — LOINC 33914-3 / 62238-1 (race-free CKD-EPI)",
      "Serum creatinine — LOINC 2160-0",
      "Dilated fundoscopy / retinal photography — LOINC 32451-7",
      "10g monofilament foot exam — LOINC 97529-8",
      "Ankle-brachial pressure index (ABPI) for PAD",
      "Lipid profile, blood pressure, ECG (cardiovascular risk/event workup)",
      "HbA1c (glycaemic control driving complications) — LOINC 4548-4",
    ],
    ugandaNote:
      "Confirm the tool models 'diabetes with complications' as a compound state: confirmed diabetes + ≥ 1 documented end-organ complication, rather than a distinct glycaemic threshold.",
    definingCriteria: [
      {
        criterion: "Confirmed diabetes (any type) by standard glycaemic criteria",
        measure:
          "Any one diagnostic criterion met: FPG, 2-h OGTT, HbA1c, or random glucose + symptoms (with confirmation rule)",
        threshold:
          "FPG ≥ 7.0 mmol/L; 2-h OGTT ≥ 11.1 mmol/L; HbA1c ≥ 6.5%; random ≥ 11.1 mmol/L + symptoms",
        loinc: "1558-6, 4548-4, 2345-7, 1518-0",
        confidence: "high",
        ugandaNote:
          "Prerequisite: this NCD is diagnosed diabetes PLUS at least one documented end-organ complication. In Uganda many patients present late/already complicated, so complication screening at diagnosis is essential.",
        source: {
          guideline: "ADA 2025 Section 2 (diabetes diagnosis), concordant with WHO",
          version: "2025",
          recommendation:
            "Diabetes is established by the standard glycaemic criteria; 'with complications' adds documented micro- and/or macrovascular end-organ disease.",
          url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC11635041/",
        },
      },
      {
        criterion: "Diabetic kidney disease (nephropathy)",
        measure: "Spot urine albumin-to-creatinine ratio (uACR) and/or estimated GFR",
        threshold:
          "uACR ≥ 30 mg/g (≥ 3 mg/mmol) on ≥ 2 of 3 samples, and/or eGFR < 60 mL/min/1.73m² (persistent)",
        loinc: "uACR 9318-7; eGFR 33914-3 / 62238-1; urine albumin 14957-5",
        confidence: "high",
        ugandaNote:
          "ADA/KDIGO screen at diagnosis (T2DM) and annually. Confirm whether MoH labs report eGFR with a race-free CKD-EPI equation (KDIGO now recommends race-free). uACR may be cheaper/more available than 24h collection.",
        source: {
          guideline: "ADA Standards of Care 2025 — Section 11 (CKD) / Section 12; KDIGO concordant",
          version: "2025",
          recommendation:
            "Screen for diabetic kidney disease with annual urine ACR and eGFR; persistent uACR ≥ 30 mg/g or eGFR < 60 confirms diabetic kidney disease.",
          url: "https://diabetesjournals.org/care/article/48/Supplement_1/S252/157552/12-Retinopathy-Neuropathy-and-Foot-Care-Standards",
        },
      },
      {
        criterion: "Diabetic retinopathy",
        measure: "Dilated fundoscopic / comprehensive retinal examination (or retinal photography)",
        threshold:
          "Presence of any retinopathy lesions (microaneurysms, haemorrhages, exudates, neovascularisation)",
        loinc: "71490-7 (diabetic retinopathy finding); 32451-7 (fundus exam)",
        confidence: "high",
        ugandaNote:
          "ADA: screen at diagnosis for T2DM and within 5 years for T1DM, then every 1–2 years. Access to dilated eye exams / fundus cameras is limited in Uganda — referral pathway needed.",
        source: {
          guideline: "ADA Standards of Care 2025 — Section 12 (Retinopathy, Neuropathy, Foot Care)",
          version: "2025",
          recommendation:
            "Screen for diabetic retinopathy with dilated/comprehensive eye examination; any retinopathy lesion confirms the complication.",
          url: "https://diabetesjournals.org/care/article/48/Supplement_1/S252/157552/12-Retinopathy-Neuropathy-and-Foot-Care-Standards",
        },
      },
      {
        criterion: "Diabetic peripheral neuropathy / foot disease",
        measure:
          "Annual foot exam: 10g monofilament + one of (vibration 128Hz, pinprick, ankle reflexes, temperature); inspection for ulcer/deformity",
        threshold:
          "Loss of protective sensation (abnormal monofilament) or other abnormal test; or active/healed foot ulcer",
        loinc: "Monofilament test 97529-8; foot exam 51847-2",
        confidence: "high",
        ugandaNote:
          "Foot exam is low-cost and high-yield in Uganda where late foot ulceration/amputation is common; should be a core part of the complications screen at every review.",
        source: {
          guideline: "ADA Standards of Care 2025 — Section 12 (Retinopathy, Neuropathy, Foot Care)",
          version: "2025",
          recommendation:
            "Assess all patients for distal symmetric polyneuropathy at diagnosis (T2DM) and annually using 10g monofilament plus one other modality; loss of protective sensation defines high-risk neuropathy.",
          url: "https://diabetesjournals.org/care/article/48/Supplement_1/S252/157552/12-Retinopathy-Neuropathy-and-Foot-Care-Standards",
        },
      },
      {
        criterion: "Macrovascular / cardiovascular complication (ASCVD)",
        measure:
          "Clinical diagnosis of ischaemic heart disease, prior MI, stroke/TIA, or peripheral arterial disease (history/exam/ECG/imaging)",
        threshold: "Documented atherosclerotic cardiovascular disease event or established PAD",
        loinc: "",
        confidence: "medium",
        ugandaNote:
          "No single threshold — clinical/imaging diagnosis. CSO to confirm which macrovascular events the tool should capture and whether ABPI is used locally for PAD (verified ABPI < 0.9 indicates PAD).",
        source: {
          guideline:
            "ADA Standards of Care 2025 — Section 10 (Cardiovascular Disease & Risk Management)",
          version: "2025",
          recommendation:
            "Established ASCVD (MI, stroke, PAD) in a person with diabetes constitutes diabetes with macrovascular complications and reclassifies cardiovascular risk to very-high.",
          url: "https://diabetesjournals.org/care/article/48/Supplement_1/S252/157552/12-Retinopathy-Neuropathy-and-Foot-Care-Standards",
        },
      },
    ],
  },
  {
    code: "hypertension",
    display: "Hypertension",
    icd10: null,
    category: "ncd",
    status: "net_new",
    mustNotMiss: false,
    supportingSymptoms: ["headache", "visual_disturbance", "dyspnoea", "dizziness_vertigo"],
    riskFactors: ["ckd", "diabetes_t2", "hyperlipidaemia", "ihd"],
    complications: [
      "Stroke (ischaemic from blocked artery; haemorrhagic from burst artery)",
      "Coronary heart disease — angina and myocardial infarction (heart attack)",
      "Heart failure (reduced pumping capacity)",
      "Arrhythmia / irregular heartbeat (can cause sudden death)",
      "Chronic kidney disease and kidney failure",
      "Hypertensive retinopathy / visual loss",
      "Hypertensive emergency / encephalopathy and malignant hypertension",
      "Aortic dissection / aneurysm",
      "Peripheral arterial disease",
    ],
    measuredSupports: [
      "Seated office BP, systolic and diastolic, mmHg (validated automated device, average of repeated readings) — LOINC 8480-6 / 8462-4",
      "Standing BP (orthostatic check) — to detect postural drop, esp. on treatment / elderly",
      "Heart rate / pulse — LOINC 8867-4",
      "Home BP monitoring (HBPM) average where available — confirmatory threshold ≥135/85 mmHg (ISH)",
      "24-hour ambulatory BP monitoring (ABPM) average where available — confirmatory threshold ≥130/80 mmHg / daytime ≥135/85 (ISH)",
      "WHO/ISH 10-year cardiovascular risk score (lab and non-lab chart versions; non-lab version used in Uganda when cholesterol testing unavailable)",
      "Serum creatinine + eGFR (renal target-organ assessment)",
      "Urine dipstick / urine albumin-creatinine ratio (proteinuria, hypertensive nephropathy)",
      "Serum potassium (baseline + monitoring on diuretics/ACEi/ARB; secondary-cause screen)",
      "Fasting glucose / HbA1c (comorbid diabetes for risk stratification)",
      "12-lead ECG (LVH, ischaemia, arrhythmia)",
      "Fundoscopy (hypertensive retinopathy as target-organ damage)",
    ],
    ugandaNote:
      "Confirm the operational confirmation pathway for the Ugandan setting: WHO says 'two different days'; ISH says 2–3 visits over 1–4 weeks. Where follow-up is unreliable, decide local rule for when a single-visit diagnosis is acceptable (we have ISH's ≥180/110 + CVD rule as the anchor).",
    definingCriteria: [
      {
        criterion: "Office blood pressure diagnostic threshold",
        measure:
          "Office systolic BP / diastolic BP (seated, validated device, average of repeat readings)",
        threshold: "Systolic ≥140 mmHg and/or diastolic ≥90 mmHg",
        loinc: "85354-9 (Blood pressure panel); 8480-6 (Systolic BP); 8462-4 (Diastolic BP)",
        confidence: "high",
        ugandaNote:
          "Aligns with the WHO/ISH ≥140/90 mmHg office threshold used in WHO-PEN and the Uganda Clinical Guidelines. In Uganda, out-of-office confirmation (ABPM/HBPM) is usually unavailable; UCG/WHO-PEN practice confirms on repeat clinic visits and uses the WHO/ISH risk chart (non-lab version applicable where cholesterol testing is absent).",
        source: {
          guideline: "WHO Hypertension fact sheet",
          version: "Updated 2023 (accessed Jun 2026)",
          recommendation:
            "Hypertension is diagnosed if, when measured on two different days, systolic BP readings on both days are ≥140 mmHg and/or diastolic BP readings on both days are ≥90 mmHg.",
          url: "https://www.who.int/news-room/fact-sheets/detail/hypertension",
        },
      },
      {
        criterion: "Confirmation of diagnosis (number of visits/days)",
        measure: "Repeat office BP measurement across separate occasions",
        threshold:
          "Confirm on ≥2 different days/visits (ISH: 2–3 visits at 1–4 week intervals); single-visit diagnosis allowed if BP ≥180/110 mmHg with evidence of CVD/target-organ damage",
        loinc: "8480-6; 8462-4",
        confidence: "high",
        ugandaNote:
          "WHO requires measurement on two different days. ISH 2020 (the WHO-aligned global guideline appropriate for low-resource settings) permits single-visit diagnosis only when BP ≥180/110 mmHg with CVD evidence — directly relevant where follow-up visits are hard to guarantee.",
        source: {
          guideline:
            "2020 International Society of Hypertension (ISH) Global Hypertension Practice Guidelines",
          version: "2020",
          recommendation:
            "Diagnosis should not be made on a single office visit; 2–3 office visits at 1–4-week intervals are typically required. Diagnosis may be made on a single visit if BP ≥180/110 mmHg with evidence of CVD.",
          url: "https://www.ahajournals.org/doi/10.1161/HYPERTENSIONAHA.120.15026",
        },
      },
      {
        criterion: "Hypertensive emergency (severe BP elevation with acute target-organ damage)",
        measure:
          "Office/acute-care systolic BP / diastolic BP plus new or progressive target-organ damage",
        threshold:
          "SBP >180 mmHg and/or DBP >120 mmHg (AHA 2024 wording: >180/110–120 mmHg) WITH new/worsening target-organ damage. Same BP without target-organ damage = severe asymptomatic hypertension/hypertensive urgency, not emergency.",
        loinc: "8480-6; 8462-4",
        confidence: "high",
        ugandaNote:
          "BP cut-off alone does not define an emergency — the discriminator is acute target-organ damage (encephalopathy, ACS, acute heart failure/pulmonary oedema, AKI, aortic dissection, eclampsia). UCG handles severe pre-eclampsia/eclampsia separately (BP ≥160/110 with proteinuria or organ dysfunction). Emergencies need IV antihypertensives + ICU-level care.",
        source: {
          guideline:
            "AHA Scientific Statement: Management of Elevated Blood Pressure in the Acute Care Setting (corroborated by Merck Manual Professional)",
          version: "2024 (AHA statement); Merck Manual accessed Jun 2026",
          recommendation:
            "Hypertensive emergency = confirmed SBP >180 and/or DBP >120 mmHg (>180/110–120) with new or progressive target-organ damage; the same BP without target-organ damage is asymptomatic markedly elevated BP, not an emergency.",
          url: "https://www.ahajournals.org/doi/10.1161/HYP.0000000000000238",
        },
      },
    ],
  },
  {
    code: "dyslipidaemia",
    display: "Dyslipidaemia",
    icd10: null,
    category: "ncd",
    status: "net_new",
    mustNotMiss: false,
    supportingSymptoms: [],
    riskFactors: ["diabetes_t2", "hypertension", "ihd", "stroke_tia"],
    complications: [
      "Atherosclerotic cardiovascular disease (ASCVD) — the principal consequence",
      "Coronary heart disease / myocardial infarction",
      "Ischaemic stroke and transient ischaemic attack",
      "Peripheral arterial disease",
      "Aortic and other atheromatous arterial disease",
      "Acute pancreatitis (with severe hypertriglyceridaemia, esp. >10 mmol/L / >885 mg/dl)",
      "Tendon xanthomata / xanthelasma / corneal arcus (signs, esp. in familial hypercholesterolaemia)",
    ],
    measuredSupports: [
      "Total cholesterol, serum — LOINC 2093-3",
      "LDL cholesterol (calculated, Friedewald) — LOINC 13457-7; LDL-C direct — 18262-6",
      "HDL cholesterol — LOINC 2085-9 (low HDL: <1.0 mmol/L men, <1.3 mmol/L women per Uganda STEPS definition)",
      "Triglycerides — LOINC 2571-8 (fasting; raised ≥1.7 mmol/L / 150 mg/dl)",
      "Non-HDL cholesterol — LOINC 43396-1 (secondary target = LDL goal + 0.8 mmol/L)",
      "Apolipoprotein B — LOINC 1884-6 (secondary target where available)",
      "Lipoprotein(a) — LOINC 10835-7 (once-in-lifetime risk modifier)",
      "WHO/ISH 10-year CVD risk score (lab and non-lab chart)",
      "Fasting glucose / HbA1c (diabetes as a risk modifier)",
      "Serum creatinine / eGFR (CKD as risk category determinant)",
      "TSH, LFTs, CK (secondary-dyslipidaemia screen and statin-safety baseline)",
    ],
    ugandaNote:
      "Decide threshold-based vs total-CVD-risk-based management for the Ugandan tool. WHO-PEN/UCG favour the WHO/ISH risk chart (with a non-lab version) because lipid panels are often unavailable in primary care — hard ESC LDL targets may be aspirational where assays/statin potency are limited.",
    definingCriteria: [
      {
        criterion: "Raised total cholesterol (population/screening threshold)",
        measure: "Serum total cholesterol",
        threshold: "≥5.0 mmol/L (≥190 mg/dl)",
        loinc: "2093-3 (Cholesterol, total, serum/plasma)",
        confidence: "high",
        ugandaNote:
          "WHO's standard 'raised total cholesterol' cut-off (≥5.0 mmol/L / 190 mg/dl), used in WHO Global Health Observatory and STEPS surveys including Uganda STEPS. This is a screening/epidemiological threshold; treatment decisions should follow overall CVD risk, not TC alone.",
        source: {
          guideline:
            "WHO Global Health Observatory — Raised total cholesterol (≥190 mg/dl) indicator",
          version: "GHO indicator metadata (accessed Jun 2026)",
          recommendation:
            "Raised total cholesterol defined as total cholesterol ≥5.0 mmol/L or ≥190 mg/dl; this approximates an LDL-C of ≥3.5 mmol/L (≥130 mg/dl).",
          url: "https://www.who.int/data/gho/indicator-metadata-registry/imr-details/2382",
        },
      },
      {
        criterion: "LDL-C equivalent of raised cholesterol",
        measure: "Serum LDL cholesterol (calculated or direct)",
        threshold:
          "≥3.5 mmol/L (≥130 mg/dl) approximates WHO raised-TC threshold; ESC severe single-risk-factor flag at LDL-C >4.9 mmol/L (>190 mg/dl)",
        loinc: "13457-7 (LDL-C calculated); 18262-6 (LDL-C direct)",
        confidence: "high",
        ugandaNote:
          "LDL-C ≥3.5 mmol/L is the WHO TC-equivalent. ESC flags LDL-C >190 mg/dl as a 'very high single risk factor' (automatically high risk). LDL-C is the primary lipid treatment target where lipids are measured.",
        source: {
          guideline:
            "WHO Global Health Observatory raised-cholesterol metadata; ESC/EAS 2019 risk-factor definition",
          version: "WHO GHO (accessed Jun 2026); ESC/EAS 2019",
          recommendation:
            "WHO: TC ≥5.0 mmol/L approximates LDL-C ≥3.5 mmol/L (130 mg/dl). ESC/EAS: LDL-C >4.9 mmol/L (>190 mg/dl) counts as a very-high single risk factor placing patient at high risk.",
          url: "https://www.acc.org/Latest-in-Cardiology/ten-points-to-remember/2019/09/12/15/13/2019-ESC-EAS-Guidelines-for-Dyslipidaemias",
        },
      },
      {
        criterion: "LDL-C treatment goal — very-high CVD risk",
        measure: "Serum LDL cholesterol",
        threshold: "<1.4 mmol/L (<55 mg/dl) AND ≥50% reduction from baseline",
        loinc: "13457-7; 18262-6",
        confidence: "high",
        ugandaNote:
          "Very-high risk = documented ASCVD, diabetes with target-organ damage or ≥3 major risk factors, severe CKD (eGFR <30), FH with ASCVD/major risk factor, or SCORE ≥10%. Risk-stratified goals are aspirational targets; in Uganda, statin access/affordability and lipid-assay availability should be confirmed before encoding hard targets.",
        source: {
          guideline:
            "2019 ESC/EAS Guidelines for the management of dyslipidaemias (ACC Ten Points summary)",
          version: "2019",
          recommendation:
            "Very-high-risk: LDL-C goal <1.4 mmol/L (<55 mg/dl) and ≥50% reduction from baseline.",
          url: "https://www.acc.org/Latest-in-Cardiology/ten-points-to-remember/2019/09/12/15/13/2019-ESC-EAS-Guidelines-for-Dyslipidaemias",
        },
      },
      {
        criterion: "LDL-C treatment goal — high CVD risk",
        measure: "Serum LDL cholesterol",
        threshold: "<1.8 mmol/L (<70 mg/dl) AND ≥50% reduction from baseline",
        loinc: "13457-7; 18262-6",
        confidence: "high",
        ugandaNote:
          "High risk = markedly raised single risk factor (TC >310 mg/dl, LDL-C >190 mg/dl, or BP ≥180/110 mmHg), diabetes >10 years or with a major risk factor, moderate CKD (eGFR 30–59), or SCORE 5–9%.",
        source: {
          guideline:
            "2019 ESC/EAS Guidelines for the management of dyslipidaemias (ACC Ten Points summary)",
          version: "2019",
          recommendation:
            "High-risk: LDL-C goal <1.8 mmol/L (<70 mg/dl) and ≥50% reduction from baseline.",
          url: "https://www.acc.org/Latest-in-Cardiology/ten-points-to-remember/2019/09/12/15/13/2019-ESC-EAS-Guidelines-for-Dyslipidaemias",
        },
      },
      {
        criterion: "LDL-C treatment goal — moderate CVD risk",
        measure: "Serum LDL cholesterol",
        threshold: "<2.6 mmol/L (<100 mg/dl)",
        loinc: "13457-7; 18262-6",
        confidence: "high",
        ugandaNote:
          "Moderate risk = SCORE 1–4% (includes young T1DM <35y and T2DM <50y without other risk factors).",
        source: {
          guideline:
            "2019 ESC/EAS Guidelines for the management of dyslipidaemias (ACC Ten Points summary)",
          version: "2019",
          recommendation: "Moderate-risk: LDL-C goal <2.6 mmol/L (<100 mg/dl).",
          url: "https://www.acc.org/Latest-in-Cardiology/ten-points-to-remember/2019/09/12/15/13/2019-ESC-EAS-Guidelines-for-Dyslipidaemias",
        },
      },
      {
        criterion: "LDL-C treatment goal — low CVD risk",
        measure: "Serum LDL cholesterol",
        threshold: "<3.0 mmol/L (<116 mg/dl)",
        loinc: "13457-7; 18262-6",
        confidence: "high",
        ugandaNote: "Low risk = SCORE <1%. 'Consider' goal rather than a firm target.",
        source: {
          guideline:
            "2019 ESC/EAS Guidelines for the management of dyslipidaemias (ACC Ten Points summary)",
          version: "2019",
          recommendation: "Low-risk: consider LDL-C goal <3.0 mmol/L (<116 mg/dl).",
          url: "https://www.acc.org/Latest-in-Cardiology/ten-points-to-remember/2019/09/12/15/13/2019-ESC-EAS-Guidelines-for-Dyslipidaemias",
        },
      },
      {
        criterion: "CVD-risk-based treatment approach (resource-appropriate)",
        measure: "10-year total cardiovascular risk (WHO/ISH chart) combined with lipid level",
        threshold:
          "Statin therapy driven by overall 10-year CVD risk rather than an isolated lipid cut-off (WHO/ISH chart; non-lab chart usable when lipids unavailable)",
        loinc: "2093-3; 13457-7",
        confidence: "needs_cso_input",
        ugandaNote:
          "WHO-PEN / Uganda practice uses total-CVD-risk charts (WHO/ISH), including a non-laboratory version, because routine lipid testing is frequently unavailable in primary care. CSO should set the operational decision rule (risk-based vs threshold-based) and which chart/region calibration to embed.",
        source: {
          guideline:
            "WHO/ISH cardiovascular risk prediction charts (referenced in WHO-PEN and Uganda Clinical Guidelines)",
          version: "WHO-PEN / UCG (accessed Jun 2026)",
          recommendation:
            "Where blood cholesterol measurement is unavailable, use the WHO/ISH non-laboratory CVD risk chart; treat based on total 10-year cardiovascular risk rather than a single lipid threshold.",
          url: "https://www.who.int/data/gho/indicator-metadata-registry/imr-details/3236",
        },
      },
    ],
  },
  {
    code: "heart_failure",
    display: "Heart failure",
    icd10: "I50",
    category: "ncd",
    status: "net_new",
    mustNotMiss: false,
    supportingSymptoms: [
      "exertional_dyspnoea",
      "orthopnoea",
      "paroxysmal_nocturnal_dyspnoea",
      "ankle_leg_swelling",
      "fatigue",
    ],
    riskFactors: [
      "hypertension",
      "ihd",
      "rheumatic_heart_disease",
      "atrial_fibrillation",
      "diabetes_t2",
    ],
    complications: [
      "Acute decompensated heart failure / pulmonary oedema",
      "Cardiogenic shock",
      "Atrial fibrillation and other arrhythmias; sudden cardiac death",
      "Cardiorenal syndrome / worsening renal function",
      "Mural thrombus and systemic/cerebral thromboembolism",
      "Functional mitral/tricuspid regurgitation",
      "Cardiac cachexia and progressive functional decline",
      "Hepatic congestion / cardiac cirrhosis",
    ],
    measuredSupports: [
      "Echocardiography: LVEF (category-defining), LV wall thickness/LVH, left atrial size, diastolic function indices, valve assessment, chamber dimensions",
      "12-lead ECG (rarely entirely normal in HF; identifies AF, prior MI, LVH, conduction disease)",
      "Chest X-ray (cardiomegaly, pulmonary congestion/oedema, pleural effusion) — key low-resource tool",
      "Natriuretic peptides: NT-proBNP / BNP (rule-out and corroboration where available)",
      "Serum electrolytes (Na, K), renal function/eGFR (baseline + monitoring on diuretics/RAAS inhibitors)",
      "Full blood count (anaemia as precipitant), TSH (thyroid as precipitant), fasting glucose/HbA1c",
      "NYHA functional class and weight/fluid-status documentation for monitoring",
    ],
    ugandaNote:
      "LVEF cut-offs (≤40 / 41–49 / ≥50) are well-established and consistent across ESC 2021 and the 2021 Universal Definition — high confidence.",
    definingCriteria: [
      {
        criterion: "HFrEF — symptomatic HF with reduced LVEF",
        measure: "Left ventricular ejection fraction (LVEF) on echocardiography",
        threshold: "LVEF ≤40%",
        loinc: "10230-1 (Left ventricular ejection fraction)",
        confidence: "high",
        ugandaNote:
          "Echo confirmation requires a sonographer/cardiologist and machine — available at national/regional referral level (e.g. Mulago, UHI) but not at most HC-level facilities. At lower levels HF is a clinical/CXR diagnosis; LVEF category is assigned once echo is obtained on referral.",
        source: {
          guideline:
            "ESC Guidelines for the diagnosis and treatment of acute and chronic heart failure (definitions reaffirmed by the 2021 Universal Definition of HF)",
          version: "ESC 2021 / Universal Definition 2021",
          recommendation: "HFrEF = symptomatic HF with LVEF ≤40%",
          url: "https://www.acc.org/Latest-in-Cardiology/Articles/2021/07/12/12/31/Universal-Definition-and-Classification-of-Heart-Failure",
        },
      },
      {
        criterion: "HFmrEF — symptomatic HF with mildly reduced LVEF",
        measure: "Left ventricular ejection fraction (LVEF) on echocardiography",
        threshold: "LVEF 41–49%",
        loinc: "10230-1 (Left ventricular ejection fraction)",
        confidence: "high",
        ugandaNote:
          "Requires echo for categorisation; same access constraints as HFrEF. ESC 2021 frames HFmrEF as a distinct category that may benefit from HFrEF-type therapy.",
        source: {
          guideline:
            "ESC Guidelines for the diagnosis and treatment of acute and chronic heart failure / Universal Definition of HF",
          version: "ESC 2021 / Universal Definition 2021",
          recommendation: "HFmrEF = symptomatic HF with LVEF 41–49%",
          url: "https://www.acc.org/Latest-in-Cardiology/Articles/2021/07/12/12/31/Universal-Definition-and-Classification-of-Heart-Failure",
        },
      },
      {
        criterion: "HFpEF — symptomatic HF with preserved LVEF plus objective cardiac abnormality",
        measure:
          "LVEF on echo PLUS evidence of structural/functional cardiac abnormality (e.g. LV hypertrophy, left atrial enlargement, diastolic dysfunction) and/or raised natriuretic peptides",
        threshold:
          "LVEF ≥50% with corroborating structural/functional abnormality and/or raised NPs",
        loinc: "10230-1 (LVEF)",
        confidence: "high",
        ugandaNote:
          "HFpEF is the hardest to confirm in low-resource settings: needs echo (LVEF + diastolic indices/LA size) and ideally natriuretic peptide testing, both limited outside referral centres. Often a presumptive diagnosis pending referral.",
        source: {
          guideline:
            "ESC Guidelines for the diagnosis and treatment of acute and chronic heart failure / Universal Definition of HF",
          version: "ESC 2021 / Universal Definition 2021",
          recommendation:
            "HFpEF = symptoms/signs of HF, LVEF ≥50%, with evidence of structural and/or functional cardiac abnormalities and/or raised natriuretic peptides",
          url: "https://www.acc.org/Latest-in-Cardiology/Articles/2021/07/12/12/31/Universal-Definition-and-Classification-of-Heart-Failure",
        },
      },
      {
        criterion: "NT-proBNP — rule-out / corroboration of chronic HF in ambulatory setting",
        measure: "Plasma N-terminal pro-B-type natriuretic peptide (NT-proBNP)",
        threshold:
          "NT-proBNP <125 pg/mL makes chronic HF unlikely; ≥125 pg/mL corroborates / triggers further evaluation",
        loinc: "33762-6 (NT-proBNP, serum/plasma)",
        confidence: "high",
        ugandaNote:
          "NT-proBNP assays are not routinely available in most Ugandan public facilities; UCG/WHO-PEN HF diagnosis is predominantly clinical (symptoms/signs) ± CXR ± echo on referral. Use NP thresholds where the assay exists (private/referral labs).",
        source: {
          guideline:
            "ESC Guidelines for the diagnosis and treatment of acute and chronic heart failure (NP rule-out thresholds; consistent with Universal Definition 2021)",
          version: "ESC 2021",
          recommendation:
            "NT-proBNP <125 pg/mL (ambulatory) makes a diagnosis of HF unlikely; threshold ≥125 pg/mL used for a positive/rule-in test in symptomatic patients",
          url: "https://onlinelibrary.wiley.com/doi/full/10.1002/ejhf.2333",
        },
      },
      {
        criterion: "BNP — rule-out of chronic HF in ambulatory setting",
        measure: "Plasma B-type natriuretic peptide (BNP)",
        threshold: "BNP <35 pg/mL makes chronic HF unlikely (ambulatory rule-out)",
        loinc: "30934-4 (BNP, serum/plasma)",
        confidence: "high",
        ugandaNote:
          "BNP, like NT-proBNP, is largely a referral/private-lab test in Uganda; not part of standard lower-level HF workup.",
        source: {
          guideline:
            "ESC Guidelines for the diagnosis and treatment of acute and chronic heart failure",
          version: "ESC 2021",
          recommendation:
            "BNP <35 pg/mL in the ambulatory/non-acute setting makes a diagnosis of chronic HF unlikely",
          url: "https://onlinelibrary.wiley.com/doi/full/10.1002/ejhf.2333",
        },
      },
      {
        criterion: "HFimpEF — HF with improved ejection fraction (longitudinal category)",
        measure: "Serial LVEF on echocardiography",
        threshold:
          "Baseline LVEF ≤40%, a ≥10-point absolute increase from baseline, AND a second LVEF measurement >40%",
        loinc: "10230-1 (LVEF)",
        confidence: "high",
        ugandaNote:
          "Requires repeat echo over time; feasible only where serial echo is accessible. Useful for the longitudinal record once a patient is on guideline-directed therapy.",
        source: {
          guideline: "Universal Definition and Classification of Heart Failure",
          version: "2021",
          recommendation:
            "HFimpEF = symptomatic HF with baseline LVEF ≤40%, ≥10-point increase from baseline, and a second measurement of LVEF >40%",
          url: "https://www.acc.org/Latest-in-Cardiology/Articles/2021/07/12/12/31/Universal-Definition-and-Classification-of-Heart-Failure",
        },
      },
    ],
  },
  {
    code: "ischaemic_heart_disease_chronic_coronary_syndrome",
    display: "Ischaemic heart disease / chronic coronary syndrome",
    icd10: null,
    category: "ncd",
    status: "net_new",
    mustNotMiss: false,
    supportingSymptoms: ["chest_pain", "exertional_dyspnoea", "palpitations"],
    riskFactors: ["hypertension", "diabetes_t2", "hyperlipidaemia", "ihd"],
    complications: [
      "Acute coronary syndrome (unstable angina, NSTEMI, STEMI)",
      "Acute myocardial infarction and its mechanical complications (papillary muscle rupture, VSD, free-wall rupture)",
      "Ischaemic cardiomyopathy / heart failure (often HFrEF)",
      "Ventricular arrhythmias and sudden cardiac death",
      "Recurrent/refractory angina limiting function",
      "Heart block / conduction disease post-infarction",
      "Mural thrombus and systemic thromboembolism / ischaemic stroke",
    ],
    measuredSupports: [
      "12-lead ECG at rest (resting changes, Q waves of prior MI, ST/T abnormalities) and during symptoms",
      "Troponin (high-sensitivity where available) — to distinguish CCS from acute coronary syndrome",
      "Echocardiography (resting LV function, regional wall-motion abnormalities, alternative causes of chest pain)",
      "Non-invasive ischaemia/anatomy testing where available: CCTA, stress echo, stress ECG, SPECT/MPI, stress CMR",
      "Coronary artery calcium score (CACS) for reclassification in low likelihood patients",
      "Lipid profile (LDL-C), HbA1c/fasting glucose, blood pressure, renal function — cardiovascular risk factor assessment",
      "Invasive coronary angiography ± FFR/iFR at referral level",
    ],
    ugandaNote:
      "Anatomical (≥50% stenosis) and physiological (FFR ≤0.80 / iFR ≤0.89) definitions are firm ESC 2024 numbers — high confidence.",
    definingCriteria: [
      {
        criterion: "Obstructive coronary artery disease — anatomical definition",
        measure:
          "Coronary luminal stenosis on invasive coronary angiography (ICA) or coronary CT angiography (CCTA)",
        threshold: "≥50% diameter stenosis of an epicardial coronary artery",
        loinc: "Imaging finding (no single universal LOINC; document via cardiac imaging report)",
        confidence: "high",
        ugandaNote:
          "ICA and CCTA are available only at the Uganda Heart Institute / national referral level; CCS in most Ugandan settings is a clinical diagnosis (typical angina) supported by ECG ± troponin to exclude ACS, with anatomical confirmation reserved for referral.",
        source: {
          guideline: "ESC Guidelines for the management of chronic coronary syndromes",
          version: "ESC 2024",
          recommendation:
            "Obstructive CAD defined as ≥50% diameter stenosis on coronary angiography",
          url: "https://www.acc.org/latest-in-cardiology/ten-points-to-remember/2024/09/01/15/01/2024-esc-guidelines-for-ccs-esc-2024",
        },
      },
      {
        criterion: "Functionally significant stenosis — physiological definition",
        measure:
          "Invasive coronary physiology: fractional flow reserve (FFR) or instantaneous wave-free ratio (iFR)",
        threshold:
          "FFR ≤0.80 (or iFR ≤0.89) indicates a functionally/ischaemia-significant stenosis",
        loinc: "Procedure-derived value (catheter lab report; no standard LOINC)",
        confidence: "high",
        ugandaNote:
          "Invasive physiology (FFR/iFR) is essentially unavailable outside specialist cardiac catheterisation services; relevant only for patients referred to UHI for angiography.",
        source: {
          guideline: "ESC Guidelines for the management of chronic coronary syndromes",
          version: "ESC 2024",
          recommendation:
            "Assess functional severity of intermediate stenoses with FFR (significance threshold ≤0.80) or iFR (≤0.89) before revascularisation",
          url: "https://www.acc.org/latest-in-cardiology/ten-points-to-remember/2024/09/01/15/01/2024-esc-guidelines-for-ccs-esc-2024",
        },
      },
      {
        criterion:
          "Pre-test / clinical likelihood of obstructive CAD — diagnostic triage thresholds",
        measure:
          "Risk-factor-weighted clinical likelihood model (age, sex, symptom type + risk factors)",
        threshold:
          "Very low ≤5% (defer further testing); low >5–15% (consider coronary artery calcium scoring); higher likelihood → non-invasive imaging or ICA",
        loinc: "Risk score (no LOINC; calculated)",
        confidence: "medium",
        ugandaNote:
          "The CACS pathway and many non-invasive functional tests are not widely available; the clinical likelihood concept (typical vs atypical angina by age/sex) is still useful for prioritising referral. Treat exact % bands as decision-support, not hard gates, in the Ugandan context.",
        source: {
          guideline: "ESC Guidelines for the management of chronic coronary syndromes",
          version: "ESC 2024",
          recommendation:
            "Use a risk-factor-weighted clinical likelihood model; defer testing if very low (≤5%); consider CACS for low (>5–15%) likelihood",
          url: "https://www.acc.org/latest-in-cardiology/ten-points-to-remember/2024/09/01/15/01/2024-esc-guidelines-for-ccs-esc-2024",
        },
      },
    ],
  },
  {
    code: "chronic_kidney_disease",
    display: "Chronic kidney disease",
    icd10: null,
    category: "ncd",
    status: "net_new",
    mustNotMiss: false,
    supportingSymptoms: [
      "nocturia",
      "ankle_leg_swelling",
      "fatigue",
      "pruritus",
      "pallor_anaemia_symptoms",
    ],
    riskFactors: ["hypertension", "diabetes_t2", "ckd"],
    complications: [
      "Progression to kidney failure (G5 / end-stage kidney disease) requiring dialysis or transplant",
      "Cardiovascular disease (leading cause of death in CKD; accelerated atherosclerosis, LVH, heart failure)",
      "Anaemia of CKD",
      "CKD–mineral and bone disorder (hyperphosphataemia, secondary hyperparathyroidism, renal osteodystrophy, vascular calcification)",
      "Hyperkalaemia and metabolic acidosis",
      "Volume overload / resistant hypertension / pulmonary oedema",
      "Uraemic complications (encephalopathy, pericarditis, bleeding tendency)",
      "Increased susceptibility to drug toxicity / need for renal dose adjustment",
    ],
    measuredSupports: [
      "Serum creatinine → eGFR (CKD-EPI; cystatin C confirmation where available)",
      "Urine ACR (preferred) or urine dipstick proteinuria as surrogate",
      "Urinalysis / urine microscopy (haematuria, casts, sediment abnormalities)",
      "Renal ultrasound (kidney size, echogenicity, obstruction, polycystic disease)",
      "Serum electrolytes (K, Na, bicarbonate/acidosis), calcium, phosphate",
      "Haemoglobin/FBC (anaemia of CKD), PTH and vitamin D (mineral-bone disease)",
      "Blood pressure and HbA1c/fasting glucose (hypertension and diabetes as leading causes/drivers)",
    ],
    ugandaNote:
      "GFR/albuminuria categories and the ≥3-month rule are firmly confirmed from the KDIGO 2024 primer — high confidence on all numbers.",
    definingCriteria: [
      {
        criterion: "Reduced GFR persisting ≥3 months",
        measure:
          "Estimated glomerular filtration rate (eGFR), creatinine-based (CKD-EPI), ideally with cystatin C confirmation",
        threshold: "eGFR <60 mL/min/1.73 m² present for ≥3 months",
        loinc: "62238-1 (eGFR CKD-EPI creatinine); 2160-0 (serum creatinine)",
        confidence: "high",
        ugandaNote:
          "Serum creatinine is widely available; eGFR should be calculated with a race-free equation. Note CKD-EPI was derived largely in non-African populations — interpret borderline eGFR with caution in Ugandan patients. The ≥3-month persistence (repeat testing) is essential and frequently missed where follow-up is hard; avoid labelling AKI as CKD on a single value.",
        source: {
          guideline:
            "KDIGO Clinical Practice Guideline for the Evaluation and Management of Chronic Kidney Disease",
          version: "KDIGO 2024",
          recommendation:
            "CKD = abnormalities of kidney structure or function present for ≥3 months; GFR <60 mL/min/1.73 m² qualifies as a marker of decreased function",
          url: "https://academic.oup.com/ajhp/article/82/12/660/8107680",
        },
      },
      {
        criterion: "Albuminuria as a marker of kidney damage persisting ≥3 months",
        measure: "Urine albumin-to-creatinine ratio (ACR), preferably first-morning void",
        threshold: "ACR ≥30 mg/g (≥3 mg/mmol) for ≥3 months (qualifies as CKD even if eGFR ≥60)",
        loinc: "9318-7 (Albumin/creatinine ratio, urine); 14959-1 (Microalbumin/creatinine, urine)",
        confidence: "high",
        ugandaNote:
          "Quantitative ACR is often unavailable at lower-level facilities; urine dipstick proteinuria is the common surrogate but is less sensitive for moderately increased albuminuria (A2) and should be confirmed with ACR where possible. Persistence (≥3 months) again required.",
        source: {
          guideline:
            "KDIGO Clinical Practice Guideline for the Evaluation and Management of Chronic Kidney Disease",
          version: "KDIGO 2024",
          recommendation:
            "Albuminuria (ACR ≥30 mg/g [≥3 mg/mmol]) is a marker of kidney damage; its persistence ≥3 months defines CKD independent of GFR",
          url: "https://academic.oup.com/ajhp/article/82/12/660/8107680",
        },
      },
      {
        criterion: "GFR category staging (G1–G5)",
        measure: "eGFR (mL/min/1.73 m²)",
        threshold: "G1 ≥90; G2 60–89; G3a 45–59; G3b 30–44; G4 15–29; G5 <15",
        loinc:
          "62238-1 (eGFR CKD-EPI creatinine); 48642-3 / 48643-1 (eGFR non-black/black, legacy)",
        confidence: "high",
        ugandaNote:
          "G1/G2 are only CKD when accompanied by another marker of kidney damage (e.g. albuminuria, structural abnormality). G5 (<15) defines kidney failure; dialysis/transplant access is very limited in Uganda, making early staging and prevention especially important.",
        source: {
          guideline:
            "KDIGO Clinical Practice Guideline for the Evaluation and Management of Chronic Kidney Disease",
          version: "KDIGO 2024",
          recommendation:
            "GFR categories: G1 ≥90, G2 60–89, G3a 45–59, G3b 30–44, G4 15–29, G5 <15 mL/min/1.73 m²",
          url: "https://academic.oup.com/ajhp/article/82/12/660/8107680",
        },
      },
      {
        criterion: "Albuminuria category staging (A1–A3)",
        measure: "Urine ACR",
        threshold:
          "A1 <30 mg/g (<3 mg/mmol); A2 30–300 mg/g (3–30 mg/mmol); A3 >300 mg/g (>30 mg/mmol)",
        loinc: "9318-7 (Albumin/creatinine ratio, urine)",
        confidence: "high",
        ugandaNote:
          "Combine with GFR category for the CGA (Cause–GFR–Albuminuria) risk grid that drives the KDIGO green/yellow/orange/red risk heat-map. Note: one source rendered the A3 SI cut-off ambiguously; the standard A3 is >300 mg/g i.e. >30 mg/mmol.",
        source: {
          guideline:
            "KDIGO Clinical Practice Guideline for the Evaluation and Management of Chronic Kidney Disease",
          version: "KDIGO 2024",
          recommendation:
            "Albuminuria categories: A1 <30 mg/g, A2 30–300 mg/g, A3 >300 mg/g (SI: <3, 3–30, >30 mg/mmol)",
          url: "https://academic.oup.com/ajhp/article/82/12/660/8107680",
        },
      },
      {
        criterion: "Classification framework (CGA) and confirmation requirement",
        measure:
          "Cause + GFR category + Albuminuria category; diagnosis confirmed by repeat testing",
        threshold:
          "Diagnosis cannot be made on a single test — confirm by repeat testing over ≥3 months (or nephrology input for suspected advanced CKD)",
        loinc: "n/a (classification construct)",
        confidence: "high",
        ugandaNote:
          "Stress the confirmation step in the tool to avoid mislabelling transient/AKI changes as CKD where follow-up is logistically hard.",
        source: {
          guideline:
            "KDIGO Clinical Practice Guideline for the Evaluation and Management of Chronic Kidney Disease",
          version: "KDIGO 2024",
          recommendation:
            "Classify CKD by Cause, GFR (G1–G5) and Albuminuria (A1–A3); a diagnosis requires abnormalities persisting ≥3 months (repeat testing).",
          url: "https://academic.oup.com/ajhp/article/82/12/660/8107680",
        },
      },
    ],
  },
  {
    code: "copd",
    display: "COPD",
    icd10: null,
    category: "ncd",
    status: "net_new",
    mustNotMiss: false,
    supportingSymptoms: ["dyspnoea", "cough", "sputum", "wheeze"],
    riskFactors: ["copd", "tuberculosis"],
    complications: [
      "Acute exacerbations of COPD (AECOPD)",
      "Respiratory failure (hypoxaemic / hypercapnic)",
      "Cor pulmonale / pulmonary hypertension and right heart failure",
      "Secondary polycythaemia",
      "Pneumonia / recurrent respiratory infection",
      "Pneumothorax (bullous disease)",
      "Skeletal muscle dysfunction, cachexia, osteoporosis",
      "Comorbid cardiovascular disease, depression/anxiety",
    ],
    measuredSupports: [
      "Spirometry: post-BD FEV1, FVC, FEV1/FVC ratio (diagnostic + grading)",
      "FEV1 % predicted (severity grade)",
      "SpO2 / pulse oximetry (assess hypoxaemia, screen for need for ABG / oxygen)",
      "mMRC dyspnoea scale and CAT score (symptom burden — drives GOLD ABE group)",
      "Exacerbation history in past 12 months (risk stratification)",
      "Chest X-ray (exclude alternatives: TB, cardiomegaly, mass — high TB prevalence in Uganda)",
      "BMI / weight (cachexia is prognostic)",
    ],
    ugandaNote:
      "Confirm whether the tool should permit a presumptive clinical COPD label where spirometry is unavailable (common in Uganda), and how to surface 'spirometry not done' vs 'FEV1/FVC<0.70 confirmed'.",
    definingCriteria: [
      {
        criterion: "Persistent airflow limitation confirmed by spirometry",
        measure: "Post-bronchodilator FEV1/FVC ratio",
        threshold: "< 0.70 (fixed ratio)",
        loinc: "19926-5 (FEV1/FVC); post-BD FEV1 19911-7; FVC 19868-9",
        confidence: "high",
        ugandaNote:
          "Spirometry is frequently unavailable at lower-level Ugandan facilities; UCG/WHO-PEN allow a presumptive clinical diagnosis (chronic cough/dyspnoea + exposure: biomass smoke, tobacco) but the FEV1/FVC<0.70 fixed ratio remains the confirmatory standard where spirometry exists. Flag spirometry availability as a CSO/site question.",
        source: {
          guideline:
            "GOLD (Global Initiative for Chronic Obstructive Lung Disease) — Spirometry Quick Guide",
          version: "GOLD 2024/2025",
          recommendation:
            '"The spirometric criterion required for a diagnosis of COPD is an FEV1/FVC ratio below 0.7 after bronchodilator." Pre-BD spirometry used to rule out COPD; post-BD confirms it.',
          url: "https://goldcopd.org/spirometry-quick-guide/",
        },
      },
      {
        criterion: "Appropriate symptoms plus risk exposure (diagnosis is not spirometry alone)",
        measure: "Chronic dyspnoea, cough, sputum + significant exposure (tobacco, biomass/HAP)",
        threshold:
          "Symptoms + exposure must accompany FEV1/FVC<0.70; spirometry mandatory to establish diagnosis",
        loinc: "",
        confidence: "high",
        ugandaNote:
          "Biomass/household air pollution is a major COPD driver in Uganda (cooking smoke), not only tobacco — capture this exposure explicitly.",
        source: {
          guideline: "GOLD — Spirometry Quick Guide / Science Committee recommendations",
          version: "GOLD 2024/2025",
          recommendation:
            "COPD diagnosis requires post-bronchodilator FEV1/FVC<0.70 PLUS appropriate symptoms and significant exposure to noxious stimuli; clinical symptoms alone are insufficient.",
          url: "https://goldcopd.org/spirometry-quick-guide/",
        },
      },
      {
        criterion: "Severity grading of airflow limitation (GOLD grade)",
        measure: "Post-bronchodilator FEV1 % predicted (in patients with FEV1/FVC<0.70)",
        threshold:
          "GOLD 1 (mild) FEV1 ≥ 80%; GOLD 2 (moderate) 50–79%; GOLD 3 (severe) 30–49%; GOLD 4 (very severe) < 30%",
        loinc: "19926-5 (FEV1/FVC); FEV1 %predicted 33453-2",
        confidence: "medium",
        ugandaNote:
          "Severity grade only applies once FEV1/FVC<0.70 confirms obstruction. Not retrievable from the small Quick Guide page fetched; these are the long-standing GOLD 1-4 % predicted cut-points and should be CSO-confirmed against the current GOLD report.",
        source: {
          guideline: "GOLD — Global Strategy for Diagnosis, Management and Prevention of COPD",
          version: "GOLD 2024/2025",
          recommendation:
            "Spirometric severity (GOLD grades 1–4) defined by post-bronchodilator FEV1 % predicted thresholds 80/50/30%.",
          url: "https://goldcopd.org/spirometry-quick-guide/",
        },
      },
    ],
  },
  {
    code: "asthma",
    display: "Asthma",
    icd10: "J45",
    category: "ncd",
    status: "net_new",
    mustNotMiss: false,
    supportingSymptoms: ["wheeze", "cough", "dyspnoea"],
    riskFactors: ["asthma"],
    complications: [
      "Acute severe asthma / status asthmaticus (life-threatening exacerbation)",
      "Respiratory failure and hypoxaemia",
      "Pneumothorax / pneumomediastinum",
      "Airway remodelling with fixed (persistent) airflow limitation",
      "Recurrent respiratory infections",
      "Inhaled-corticosteroid side effects (oral candidiasis, dysphonia); systemic steroid effects with frequent courses",
      "Impaired quality of life, sleep disturbance, missed school/work, death from severe attack",
    ],
    measuredSupports: [
      "Spirometry: FEV1, FVC, FEV1/FVC, pre/post-bronchodilator (reversibility)",
      "Peak expiratory flow (PEF) — single value and 1–2 week diurnal variability chart",
      "FeNO (fractional exhaled nitric oxide) where available — supportive, not diagnostic",
      "Symptom-control tools: ACT / GINA symptom-control assessment",
      "SpO2 / pulse oximetry during acute exacerbation",
      "Allergy / atopy markers (eosinophils, total/specific IgE) — supportive of phenotype",
      "Trigger and exposure history (allergens, biomass smoke, occupational)",
    ],
    ugandaNote:
      "By design there is NO single asthma threshold — the tool must model asthma as 'history of variable symptoms + at least one documented objective variability test', not a numeric cut-off. Confirm this framing.",
    definingCriteria: [
      {
        criterion:
          "Documented variable expiratory airflow limitation (NOT a single fixed threshold) plus a history of variable respiratory symptoms",
        measure:
          "Demonstrated variability in lung function (spirometry or PEF), combined with characteristic symptom pattern (wheeze, breathlessness, chest tightness, cough — variable over time and in intensity)",
        threshold:
          "No single cut-off: diagnosis requires (a) history of variable symptoms AND (b) documented variable airflow limitation by at least one objective test below",
        loinc: "",
        confidence: "high",
        ugandaNote:
          "GINA explicitly states there is no single 'gold-standard' test. Where spirometry is unavailable in Uganda, serial PEF over 2 weeks (best of 3 readings, morning + evening) is the practical objective test. Asthma is under-diagnosed in LMICs.",
        source: {
          guideline: "GINA (Global Initiative for Asthma) Strategy / 2024 Summary Guide",
          version: "GINA 2024 (per BTS/NICE/SIGN-vs-GINA 2024 comparison)",
          recommendation:
            "\"No single test serves as a 'gold-standard' test for asthma diagnosis\"; diagnosis rests on documented variability rather than fixed thresholds alone.",
          url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC11992161/",
        },
      },
      {
        criterion: "Positive bronchodilator reversibility test",
        measure: "Increase in FEV1 (or FVC) 10–15 min after 200–400 mcg inhaled salbutamol",
        threshold:
          "Adults: increase ≥ 12% AND ≥ 200 mL from baseline (or PEF ≥ 20%). Children: increase > 12% of predicted FEV1 (some sources > 15%)",
        loinc: "FEV1 19911-7; bronchodilator response FEV1 % change 52485-0; PEF 19935-6",
        confidence: "high",
        ugandaNote:
          "Bronchodilator reversibility has high specificity but low sensitivity (may be absent at a single visit because asthma is variable) — a negative test does not exclude asthma.",
        source: {
          guideline:
            "GINA (Global Initiative for Asthma) — diagnostic criteria for variable airflow limitation",
          version: "GINA 2022/2024",
          recommendation:
            "Positive bronchodilator reversibility in adults = FEV1 (or FVC) increase ≥ 12% and ≥ 200 mL over baseline (PEF ≥ 20%); children ≥ 12% predicted.",
          url: "https://ginasthma.org/wp-content/uploads/2024/12/GINA-Summary-Guide-2024-WEB-WMS.pdf",
        },
      },
      {
        criterion: "Excessive average daily diurnal PEF variability",
        measure: "Twice-daily peak expiratory flow (PEF) charting, averaged over 1–2 weeks",
        threshold: "Adults: average daily diurnal PEF variability > 10%. Children: > 13%",
        loinc: "PEF 19935-6; PEF variability/diurnal variation 33452-4",
        confidence: "high",
        ugandaNote:
          "PEF meters are low-cost and the most deployable objective test in Ugandan primary care where spirometry is scarce — likely the default variability test in the tool.",
        source: {
          guideline: "GINA (Global Initiative for Asthma) — diagnostic criteria",
          version: "GINA 2022/2024",
          recommendation:
            "Excessive average daily diurnal PEF variability supporting asthma = > 10% in adults, > 13% in children.",
          url: "https://ginasthma.org/wp-content/uploads/2024/12/GINA-Summary-Guide-2024-WEB-WMS.pdf",
        },
      },
      {
        criterion:
          "Demonstrated airflow limitation at presentation (supports diagnosis; reduced ratio)",
        measure: "FEV1/FVC ratio when symptomatic",
        threshold:
          "Reduced FEV1/FVC (below lower limit of normal; GINA notes <0.75–0.80 in adults, <0.90 in children) documents airflow limitation that should then be shown to be variable",
        loinc: "FEV1/FVC 19926-5",
        confidence: "medium",
        ugandaNote:
          "A reduced FEV1/FVC documents obstruction but does not by itself diagnose asthma — variability/reversibility must also be shown. Do not hard-code a single ratio cut-off.",
        source: {
          guideline:
            "GINA (Global Initiative for Asthma) — diagnostic criteria for airflow limitation",
          version: "GINA 2022/2024",
          recommendation:
            "GINA recommends documenting expiratory airflow limitation by a reduced FEV1/FVC (below LLN; commonly <0.75–0.80 in adults) before establishing variability.",
          url: "https://ginasthma.org/wp-content/uploads/2024/12/GINA-Summary-Guide-2024-WEB-WMS.pdf",
        },
      },
      {
        criterion:
          "Significant improvement in lung function after a trial of anti-inflammatory (controller) treatment",
        measure: "FEV1 change after 4 weeks of inhaled corticosteroid treatment",
        threshold:
          "Adults: FEV1 increase > 12% and > 200 mL (or PEF > 20%) from baseline after 4 weeks of controller treatment, outside respiratory infections",
        loinc: "FEV1 19911-7",
        confidence: "medium",
        ugandaNote:
          "Useful confirmatory route when initial spirometry/PEF is non-diagnostic but clinical suspicion is high.",
        source: {
          guideline: "GINA (Global Initiative for Asthma) — diagnostic criteria",
          version: "GINA 2022/2024",
          recommendation:
            "Significant increase in lung function (FEV1 >12% and >200 mL, or PEF >20%) after 4 weeks of anti-inflammatory treatment supports the diagnosis.",
          url: "https://ginasthma.org/wp-content/uploads/2024/12/GINA-Summary-Guide-2024-WEB-WMS.pdf",
        },
      },
    ],
  },
  {
    code: "stroke_ischaemic_vs_haemorrhagic",
    display: "Stroke / cerebrovascular disease",
    icd10: null,
    category: "ncd",
    status: "net_new",
    mustNotMiss: true,
    supportingSymptoms: [
      "weakness",
      "numbness_paraesthesia",
      "speech_swallowing_disturbance",
      "visual_disturbance",
      "headache",
    ],
    riskFactors: [
      "hypertension",
      "atrial_fibrillation",
      "diabetes_t2",
      "stroke_tia",
      "rheumatic_heart_disease",
    ],
    complications: [
      "Cerebral oedema and raised intracranial pressure / herniation",
      "Haemorrhagic transformation of ischaemic infarct",
      "Aspiration pneumonia and dysphagia",
      "Seizures",
      "Venous thromboembolism (DVT / PE) from immobility",
      "Persistent neurological disability: hemiparesis, aphasia, visual/cognitive impairment",
      "Post-stroke depression, chronic pain, pressure ulcers",
      "Recurrent stroke; death",
    ],
    measuredSupports: [
      "Non-contrast CT brain (subtype discrimination; first-line)",
      "MRI brain incl. DWI (higher sensitivity for early/small ischaemia, posterior fossa)",
      "Capillary/serum glucose (exclude hypoglycaemia mimic — mandatory before stroke call)",
      "Blood pressure (driver and management target, esp. haemorrhagic)",
      "ECG +/- monitoring (atrial fibrillation as embolic source)",
      "FBC, coagulation/INR, renal function (thrombolysis/anticoagulation safety)",
      "Lipid profile and HbA1c (vascular risk-factor workup)",
      "Validated severity/screening scales: NIHSS (severity), FAST / ROSIER (recognition), GCS",
    ],
    ugandaNote:
      "Decide how the tool records a clinically-diagnosed stroke when CT/MRI is unavailable (subtype = undetermined) and how it blocks antiplatelet/thrombolysis until haemorrhage is excluded — safety-critical in the Uganda context.",
    definingCriteria: [
      {
        criterion: "Acute focal (or global) neurological deficit of presumed vascular origin",
        measure:
          "Clinical: sudden-onset focal neurological dysfunction (e.g., FAST — Face/Arm/Speech, hemiparesis, dysphasia, visual loss); WHO classic definition = rapidly developing signs of focal/global cerebral disturbance lasting >24 h (or leading to death) with no apparent cause other than vascular origin",
        threshold:
          "Sudden focal neuro deficit, vascular in origin; persisting >24 h distinguishes stroke from TIA (TIA = transient deficit resolving without infarction)",
        loinc: "",
        confidence: "high",
        ugandaNote:
          "Clinical recognition (FAST / sudden focal deficit) drives the pathway in Ugandan facilities where imaging access is limited; UCG/WHO-PEN emphasise rapid referral. Onset time is critical for thrombolysis eligibility.",
        source: {
          guideline: "WHO Stroke fact sheet (News-room)",
          version: "WHO 2024/2025 fact sheet",
          recommendation:
            '"A stroke is a medical emergency that occurs when blood flow to the brain is interrupted, either due to a blockage or bleeding." Acute focal/global neurological dysfunction of vascular cause.',
          url: "https://www.who.int/news-room/fact-sheets/detail/stroke",
        },
      },
      {
        criterion:
          "Neuroimaging to confirm stroke and classify subtype (ischaemic vs haemorrhagic)",
        measure: "Non-contrast brain CT (or MRI) as soon as possible",
        threshold:
          "Imaging required to (a) confirm stroke, (b) distinguish ischaemic (infarction) from haemorrhagic (intracerebral/subarachnoid haemorrhage) — these are mutually exclusive categories (plus 'undetermined'). Non-contrast CT is the primary modality to differentiate the two; CT haemorrhage = hyperdensity, early ischaemia may be subtle/normal",
        loinc: "CT head w/o contrast 30799-1 (or 24725-4 CT head); MRI brain 24590-2",
        confidence: "high",
        ugandaNote:
          "CT/MRI is often unavailable or delayed in Uganda; subtype confirmation may not be possible at first contact. The tool should explicitly support 'clinical stroke, subtype unconfirmed (no imaging)' and gate thrombolysis/aspirin decisions on imaging having excluded haemorrhage. Antiplatelets/thrombolysis must NOT be started until haemorrhage is excluded.",
        source: {
          guideline: "WHO Stroke fact sheet (News-room)",
          version: "WHO 2024/2025 fact sheet",
          recommendation:
            '"Immediate diagnostic imaging (a CT or MRI scan) should be carried out as soon as possible"; neuroimaging confirms stroke and distinguishes ischaemic from haemorrhagic.',
          url: "https://www.who.int/news-room/fact-sheets/detail/stroke",
        },
      },
    ],
  },
  {
    code: "chronic_liver_disease_cirrhosis",
    display: "Chronic liver disease / cirrhosis",
    icd10: null,
    category: "ncd",
    status: "net_new",
    mustNotMiss: false,
    supportingSymptoms: [
      "jaundice",
      "abdominal_distension",
      "pruritus",
      "weight_loss",
      "pallor_anaemia_symptoms",
    ],
    riskFactors: ["hepatitis_b", "hepatitis_c", "liver_disease"],
    complications: [
      "Ascites and spontaneous bacterial peritonitis",
      "Variceal (oesophageal/gastric) bleeding from portal hypertension",
      "Hepatic encephalopathy",
      "Hepatorenal syndrome",
      "Hepatocellular carcinoma",
      "Coagulopathy / bleeding tendency",
      "Hypersplenism with cytopenias",
      "Jaundice and hepatopulmonary syndrome",
    ],
    measuredSupports: [
      "Serum AST and ALT (and AST:ALT ratio) — LOINC AST 1920-8, ALT 1742-6",
      "Platelet count (thrombocytopenia from hypersplenism) — LOINC 777-3",
      "Serum albumin (low) and total bilirubin (raised) — LOINC albumin 1751-7, bilirubin 1975-2",
      "INR / prothrombin time (prolonged synthetic dysfunction) — LOINC INR 6301-6",
      "Child-Pugh score (bilirubin, albumin, INR, ascites, encephalopathy) and MELD score for severity staging",
      "Abdominal ultrasound (liver echotexture, spleen size, portal vein diameter, ascites, HCC screen)",
      "HBsAg / anti-HCV / HIV serology and alpha-fetoprotein (etiology + HCC surveillance)",
    ],
    ugandaNote:
      "Confirm whether MedSync should default to APRI >1.0 (widely computable) vs FibroScan >12.5 kPa (referral-only) as the primary cirrhosis flag in Uganda.",
    definingCriteria: [
      {
        criterion:
          "Liver stiffness by transient elastography (FibroScan / VCTE) indicating cirrhosis",
        measure: "Liver stiffness measurement (VCTE)",
        threshold: ">12.5 kPa",
        loinc:
          "LP200137-9 (liver elastography / FibroScan); no single universal LOINC for kPa result",
        confidence: "high",
        ugandaNote:
          "WHO 2024 chose this sensitivity-favouring cutoff explicitly for resource-limited settings; suitable as the operational cirrhosis cutoff in Uganda where biopsy is rarely available. FibroScan access is limited outside referral centres (Mulago), so APRI is the more widely usable surrogate.",
        source: {
          guideline:
            "WHO Guidelines for the prevention, diagnosis, care and treatment of chronic hepatitis B infection (informed by Lancet Gastroenterol Hepatol 2024 systematic review/meta-analysis)",
          version: "2024",
          recommendation:
            "FibroScan >12.5 kPa (or APRI >1.0) identifies the majority of adults with cirrhosis for treatment prioritisation",
          url: "https://www.thelancet.com/journals/langas/article/PIIS2468-1253(24)00437-0/fulltext",
        },
      },
      {
        criterion: "APRI (AST-to-platelet ratio index) — low-cost serum surrogate for cirrhosis",
        measure: "APRI score (calculated from AST and platelet count)",
        threshold: ">1.0",
        loinc: "AST 1920-8; platelet count 777-3 (APRI is derived, no native LOINC)",
        confidence: "high",
        ugandaNote:
          "WHO 2024 lowered the cirrhosis APRI cutoff from >2.0 (2015) to >1.0 to improve case-finding. APRI is the preferred non-invasive test in Ugandan district settings since AST + platelets are widely available and FibroScan is not.",
        source: {
          guideline:
            "WHO Guidelines for chronic hepatitis B (2024 update) — non-invasive staging recommendations",
          version: "2024",
          recommendation: "APRI >1.0 (or FibroScan >12.5 kPa) to identify cirrhosis",
          url: "https://www.thelancet.com/journals/langas/article/PIIS2468-1253(24)00437-0/fulltext",
        },
      },
      {
        criterion: "Clinical + ultrasound diagnosis of cirrhosis (where elastography unavailable)",
        measure:
          "Abdominal ultrasound morphology + clinical signs of chronic liver disease / portal hypertension",
        threshold:
          "Nodular/coarse/shrunken liver, splenomegaly, ascites, portal vein dilatation; with stigmata (jaundice, spider naevi, palmar erythema, gynaecomastia, caput medusae, hepatic encephalopathy)",
        loinc: "Abdominal ultrasound report (no discrete numeric LOINC threshold)",
        confidence: "medium",
        ugandaNote:
          "In most Ugandan facilities, cirrhosis is diagnosed clinically + by ultrasound rather than biopsy/elastography. Ultrasound confirms ascites (cirrhosis ~85% of ascites), portal hypertension, and screens for HCC and portal vein thrombosis. Threshold here is qualitative, not a single number — flag for CSO to set the operational decision rule.",
        source: {
          guideline:
            "Uganda Clinical Guidelines (National Guidelines for Management of Common Conditions) — Liver Cirrhosis / Ascites",
          version: "2016",
          recommendation:
            "Diagnose cirrhosis on clinical stigmata of chronic liver disease plus abdominal ultrasound; ultrasound confirms ascites and portal hypertension",
          url: "https://www.prb.org/wp-content/uploads/2018/05/Uganda-Clinical-Guidelines-2016-National-Guidelines-for-Management-of-Common-Conditions.pdf",
        },
      },
    ],
  },
  {
    code: "hypothyroidism",
    display: "Hypothyroidism",
    icd10: null,
    category: "ncd",
    status: "net_new",
    mustNotMiss: false,
    supportingSymptoms: [
      "fatigue",
      "weight_change",
      "heat_cold_intolerance",
      "low_mood",
      "skin_hair_sweating_change",
    ],
    riskFactors: ["thyroid_hypo"],
    complications: [
      "Progression from subclinical to overt hypothyroidism (2–6% per year)",
      "Myxoedema coma (severe decompensated hypothyroidism)",
      "Dyslipidaemia and increased cardiovascular risk",
      "Goitre",
      "Infertility, menstrual disturbance, and adverse pregnancy outcomes (miscarriage, impaired fetal neurodevelopment)",
      "Pericardial effusion / bradycardia",
      "Cognitive slowing and depression",
    ],
    measuredSupports: [
      "Free T4 (FT4) — the key discriminator subclinical vs overt — LOINC 3024-7",
      "TSH as the principal first-line screening test — LOINC 3016-3",
      "Anti-TPO (thyroid peroxidase) antibodies — autoimmune (Hashimoto) etiology and progression risk — LOINC 8099-8",
      "Total T3 / free T3 (limited diagnostic value in hypothyroidism)",
      "Lipid panel (hypercholesterolaemia), CK, sodium (hyponatraemia), anaemia as associated abnormalities",
    ],
    ugandaNote:
      "Confirm the TSH upper reference limit MedSync should use for Ugandan assays (assay-specific; default ~4.5 mIU/L is a convention, not a universal value).",
    definingCriteria: [
      {
        criterion: "Subclinical hypothyroidism",
        measure: "Serum TSH (elevated) with free T4 (FT4) within reference range",
        threshold:
          "TSH above the upper reference limit (commonly ~4.5 mIU/L) up to 10 mIU/L, AND normal free T4",
        loinc: "TSH 3016-3 (or 11580-8); free T4 3024-7",
        confidence: "high",
        ugandaNote:
          "Diagnose only when thyroid function is stable, HPT axis intact and no acute severe illness (sick-euthyroid mimics). TSH upper limit depends on the local assay reference range — Ugandan labs should use their own assay ULN rather than a fixed 4.5. Confirm with a repeat after weeks before labelling.",
        source: {
          guideline: "AACE/ATA Clinical Practice Guidelines for Hypothyroidism in Adults",
          version: "2012 (Endocr Pract) — current ATA reference standard",
          recommendation:
            "Subclinical hypothyroidism = serum TSH above the upper reference limit with a normal free T4, when thyroid function is stable",
          url: "https://www.endocrinepractice.org/article/S1530-891X(20)43030-7/fulltext",
        },
      },
      {
        criterion: "Subclinical hypothyroidism severity grading (mild vs severe)",
        measure: "Serum TSH",
        threshold:
          "Mild/Grade 1 = TSH 4.5–9.9 mIU/L; Severe/Grade 2 = TSH ≥10 mIU/L (with normal FT4)",
        loinc: "TSH 3016-3",
        confidence: "medium",
        ugandaNote:
          "TSH ≥10 mIU/L (with normal FT4) is the threshold above which levothyroxine is generally recommended even when subclinical, and the level carrying higher progression risk to overt disease.",
        source: {
          guideline:
            "StatPearls — Subclinical Hypothyroidism (NCBI Bookshelf), citing AACE/ATA practice",
          version: "current",
          recommendation:
            "TSH <10 vs ≥10 mIU/L distinguishes mild from severe subclinical hypothyroidism; treat when TSH >10 mIU/L",
          url: "https://www.ncbi.nlm.nih.gov/books/NBK536970/",
        },
      },
      {
        criterion: "Overt (primary) hypothyroidism",
        measure: "Serum TSH (elevated) with free T4 (FT4) below reference range",
        threshold: "Elevated TSH (usually >10 mIU/L) AND a subnormal (low) free T4",
        loinc: "TSH 3016-3; free T4 3024-7",
        confidence: "high",
        ugandaNote:
          "Central hypothyroidism (low/normal TSH with low FT4) is the exception — do not rely on TSH alone if pituitary/hypothalamic disease is suspected; measure FT4. In Uganda, also consider iodine status and post-thyroidectomy/post-radioiodine causes.",
        source: {
          guideline: "AACE/ATA Clinical Practice Guidelines for Hypothyroidism in Adults",
          version: "2012 (Endocr Pract) — current ATA reference standard",
          recommendation:
            "Overt hypothyroidism = elevated TSH (usually >10 mIU/L) with a subnormal free T4",
          url: "https://www.endocrinepractice.org/article/S1530-891X(20)43030-7/fulltext",
        },
      },
    ],
  },
  {
    code: "hyperthyroidism_thyrotoxicosis",
    display: "Hyperthyroidism / thyrotoxicosis",
    icd10: null,
    category: "ncd",
    status: "net_new",
    mustNotMiss: false,
    supportingSymptoms: [
      "weight_loss",
      "heat_cold_intolerance",
      "palpitations",
      "tremor",
      "neck_swelling_thyroid",
    ],
    riskFactors: ["thyroid_hyper", "atrial_fibrillation"],
    complications: [
      "Atrial fibrillation and other tachyarrhythmias",
      "Thyroid storm (life-threatening decompensated thyrotoxicosis)",
      "Heart failure / thyrotoxic cardiomyopathy",
      "Osteoporosis and increased fracture risk (especially subclinical disease)",
      "Graves ophthalmopathy / orbitopathy",
      "Thyrotoxic periodic paralysis",
      "Adverse pregnancy outcomes",
      "Weight loss, myopathy, anxiety",
    ],
    measuredSupports: [
      "Total/free T3 — needed to detect T3-toxicosis and grade severity — LOINC total T3 3026-2",
      "Free T4 — discriminates overt vs subclinical — LOINC 3024-7",
      "TSH-receptor antibodies (TRAb) / TSI — confirms Graves disease — LOINC TRAb 33255-8",
      "Radioactive iodine uptake (RAIU) and/or thyroid scan, or thyroid Doppler ultrasound — distinguishes Graves vs toxic nodule vs thyroiditis",
      "ECG (atrial fibrillation, sinus tachycardia)",
    ],
    ugandaNote:
      "Confirm assay-specific TSH lower reference limit (the <0.01 and <0.1 mU/L figures depend on a 3rd-generation assay).",
    definingCriteria: [
      {
        criterion: "Overt hyperthyroidism (thyrotoxicosis)",
        measure: "Serum TSH (low/suppressed) with free T4 and/or T3 elevated",
        threshold:
          "Subnormal (usually <0.01 mU/L on a third-generation assay) TSH AND elevated free T4 and/or total/free T3",
        loinc: "TSH 3016-3; free T4 3024-7; total T3 3026-2 / free T3 3051-0",
        confidence: "high",
        ugandaNote:
          "Initial work-up = TSH + free T4 + total T3 together. T3-toxicosis = suppressed TSH with normal FT4 but elevated T3 — measure T3 so it is not missed. The 'usually <0.01 mU/L' figure is assay-dependent; rely on the local assay's lower reference limit.",
        source: {
          guideline:
            "ATA Guidelines for Diagnosis and Management of Hyperthyroidism and Other Causes of Thyrotoxicosis (Ross et al., Thyroid)",
          version: "2016",
          recommendation:
            "Overt hyperthyroidism = subnormal (usually undetectable) TSH with elevated free T4 and/or T3",
          url: "https://journals.sagepub.com/doi/10.1089/thy.2016.0229",
        },
      },
      {
        criterion: "Subclinical hyperthyroidism",
        measure: "Serum TSH (low/suppressed) with free T4 and T3 within reference range",
        threshold:
          "Low or undetectable TSH (below lower reference limit, ~<0.4 mIU/L) AND normal free T4 AND normal T3",
        loinc: "TSH 3016-3; free T4 3024-7; total T3 3026-2",
        confidence: "high",
        ugandaNote:
          "Persistent TSH <0.1 mIU/L (with normal FT4/T3) is the threshold ATA flags for treatment in high-risk groups (age >65, cardiac disease, osteoporosis/post-menopausal). Confirm persistence on a repeat before labelling, to exclude non-thyroidal illness and recent thyrotoxicosis recovery.",
        source: {
          guideline:
            "ATA Guidelines for Diagnosis and Management of Hyperthyroidism and Other Causes of Thyrotoxicosis (Ross et al., Thyroid)",
          version: "2016",
          recommendation:
            "Subclinical hyperthyroidism = low/undetectable TSH with normal free T4 and T3; treat persistent TSH <0.1 mU/L in high-risk patients",
          url: "https://journals.sagepub.com/doi/10.1089/thy.2016.0229",
        },
      },
    ],
  },
  {
    code: "rheumatic_heart_disease",
    display: "Rheumatic heart disease",
    icd10: null,
    category: "ncd",
    status: "net_new",
    mustNotMiss: false,
    supportingSymptoms: ["exertional_dyspnoea", "palpitations", "chest_pain"],
    riskFactors: ["rheumatic_heart_disease"],
    complications: [
      "Congestive heart failure",
      "Atrial fibrillation (especially with mitral stenosis)",
      "Infective endocarditis",
      "Systemic thromboembolism / stroke",
      "Pulmonary hypertension",
      "Recurrent acute rheumatic fever causing progressive valve damage",
      "Need for valve surgery / maternal cardiac risk in pregnancy",
    ],
    measuredSupports: [
      "Aortic valve morphological features (irregular/focal thickening, coaptation defect, restricted motion, prolapse) — needed for the definite-AR pathway",
      "Comprehensive 2D + Doppler transthoracic echocardiogram (the diagnostic modality itself)",
      "Patient age (drives age-specific AMVL thickness cutoff and the borderline ≤20y rule)",
      "History of acute rheumatic fever / recurrent pharyngitis (clinical context)",
      "ECG and clinical auscultation (supportive, not diagnostic on their own)",
    ],
    ugandaNote:
      "A 2023 WHF update exists (Nat Rev Cardiol 2023); confirm whether MedSync should implement the 2012 criteria (most widely validated/used) or migrate to the 2023 revision before building the engine.",
    definingCriteria: [
      {
        criterion: "Pathological mitral regurgitation (all 4 Doppler criteria required)",
        measure: "Color/continuous-wave Doppler of mitral regurgitation jet",
        threshold:
          "Seen in 2 views; jet length ≥2 cm in at least 1 view; peak velocity ≥3 m/s for one complete envelope; pansystolic jet in at least one envelope",
        loinc: "Echocardiography study (no discrete LOINC for each Doppler criterion)",
        confidence: "high",
        ugandaNote:
          "Core building block for both 'definite' and 'borderline' RHD in screening. RHD is highly prevalent in Uganda — these WHF echo criteria underpin school/community screening programmes.",
        source: {
          guideline:
            "World Heart Federation criteria for echocardiographic diagnosis of rheumatic heart disease (an evidence-based guideline)",
          version: "2012",
          recommendation:
            "Pathological MR requires all four Doppler criteria (2 views, ≥2 cm jet, ≥3 m/s, pansystolic)",
          url: "https://www.nature.com/articles/nrcardio.2012.7",
        },
      },
      {
        criterion: "Pathological aortic regurgitation (all 4 Doppler criteria required)",
        measure: "Color/continuous-wave Doppler of aortic regurgitation jet",
        threshold:
          "Seen in 2 views; jet length ≥1 cm in at least 1 view; peak velocity ≥3 m/s in early diastole; pandiastolic jet in at least one envelope",
        loinc: "Echocardiography study",
        confidence: "high",
        ugandaNote:
          "Any pathological AR in an individual <35 years should raise RHD suspicion; less specific in older adults where degenerative disease overlaps.",
        source: {
          guideline: "World Heart Federation criteria for echocardiographic diagnosis of RHD",
          version: "2012",
          recommendation:
            "Pathological AR requires all four Doppler criteria (2 views, ≥1 cm jet, ≥3 m/s, pandiastolic)",
          url: "https://www.nature.com/articles/nrcardio.2012.7",
        },
      },
      {
        criterion: "Morphological mitral valve features of RHD",
        measure: "2D echocardiography of mitral valve",
        threshold:
          "Anterior mitral valve leaflet (AMVL) thickening ≥3 mm (age-specific: ≥3 mm if ≤20y, ≥4 mm if 21–40y, ≥5 mm if >40y); chordal thickening; restricted leaflet motion; excessive/prolapsing leaflet tip motion during systole",
        loinc: "Echocardiography study",
        confidence: "high",
        ugandaNote:
          "Use age-adjusted AMVL thickness cutoffs. ≥2 morphological MV features define key categories below.",
        source: {
          guideline: "World Heart Federation criteria for echocardiographic diagnosis of RHD",
          version: "2012",
          recommendation:
            "Morphological MV features: AMVL thickening (age-specific, base ≥3 mm), chordal thickening, restricted motion, excessive tip motion",
          url: "https://www.nature.com/articles/nrcardio.2012.7",
        },
      },
      {
        criterion: "Mitral stenosis (mean pressure gradient)",
        measure: "Continuous-wave Doppler mean diastolic gradient across mitral valve",
        threshold: "Mean gradient ≥4 mmHg",
        loinc: "Echocardiography study",
        confidence: "high",
        ugandaNote:
          "MS with mean gradient ≥4 mmHg is one of the 'definite RHD' qualifying lesions.",
        source: {
          guideline: "World Heart Federation criteria for echocardiographic diagnosis of RHD",
          version: "2012",
          recommendation: "Mitral stenosis with mean gradient ≥4 mmHg qualifies as definite RHD",
          url: "https://www.nature.com/articles/nrcardio.2012.7",
        },
      },
      {
        criterion: "Definite RHD (any one of the qualifying combinations)",
        measure: "Composite echocardiographic classification",
        threshold:
          "(a) Pathological MR + ≥2 morphological MV features; OR (b) mitral stenosis mean gradient ≥4 mmHg; OR (c) pathological AR + ≥2 morphological aortic valve features; OR (d) borderline disease of BOTH mitral and aortic valves",
        loinc: "Echocardiography study",
        confidence: "high",
        ugandaNote:
          "100% specific in low-prevalence populations; the actionable category for confirming RHD in Ugandan screening/clinical practice.",
        source: {
          guideline: "World Heart Federation criteria for echocardiographic diagnosis of RHD",
          version: "2012",
          recommendation:
            "Definite RHD = pathological MR+≥2 MV features, or MS ≥4 mmHg, or pathological AR+≥2 AV features, or borderline disease of both valves",
          url: "https://www.nature.com/articles/nrcardio.2012.7",
        },
      },
      {
        criterion: "Borderline RHD (applies to age ≤20 years; any one)",
        measure: "Composite echocardiographic classification",
        threshold:
          "(a) ≥2 morphological MV features WITHOUT pathological MR or MS; OR (b) pathological MR alone; OR (c) pathological AR alone",
        loinc: "Echocardiography study",
        confidence: "high",
        ugandaNote:
          "Borderline category is intended for individuals ≤20 years (latent/subclinical disease); requires follow-up echo. Confirm with CSO how MedSync should track/flag borderline cases for re-screening.",
        source: {
          guideline: "World Heart Federation criteria for echocardiographic diagnosis of RHD",
          version: "2012",
          recommendation:
            "Borderline RHD = ≥2 MV morphological features without pathological MR/MS, or pathological MR alone, or pathological AR alone",
          url: "https://www.nature.com/articles/nrcardio.2012.7",
        },
      },
    ],
  },
];

const norm = (s: string) => s.trim().toLowerCase();
const BY_DISPLAY = new Map(NCD_DIAGNOSIS_CATALOG.map((e) => [norm(e.display), e]));

/** Cited NCD entries for the picker/surface — GATED: empty until the CSO signs. */
export function ncdCatalog(): NcdDiagnosisEntry[] {
  return NCD_CATALOG_CSO_SIGNED ? NCD_DIAGNOSIS_CATALOG : [];
}

export function ncdByDisplay(display: string): NcdDiagnosisEntry | undefined {
  return BY_DISPLAY.get(norm(display));
}
