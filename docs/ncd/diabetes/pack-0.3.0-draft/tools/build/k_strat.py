"""Lanes CLASSIFY and STRATIFY: type, control, and each organ at risk."""
from lib import P, crit
from k_model import *

KNOWN = lambda: P("dm_status", "==", "known")

# ═══ CLASSIFY ═══════════════════════════════════════════════════════════════
# Classification proper needs discriminating tests. Phenotype only ever raises a
# flag and a referral: it never writes a type (briefing 4.2; lesson of 3.6).
classification("type_1", "Type 1 diabetes", [
    crit("t1_antibody", "Islet autoantibody positive", all=[P("islet_autoantibodies", "==", "positive")], ref_id="REF-DM-CLS-AB-ORDER"),
    crit("t1_cpeptide_low", "Random C-peptide below 200 pmol/L in a person on insulin", all=[P("c_peptide", "<", ref="REF-DM-CLS-CPEP-LOW"), P("glucose_lowering_therapy", "==", "insulin")], ref_id="REF-DM-CLS-CPEP-LOW"),
], "A3-35", refutedBy=[crit("t1_cpeptide_high", "Random C-peptide 600 pmol/L or more", all=[P("c_peptide", ">=", ref="REF-DM-CLS-CPEP-HIGH")], ref_id="REF-DM-CLS-CPEP-HIGH")],
    discriminators=["islet_autoantibodies", "c_peptide"], status="reconcile",
    note="Amends the live entry: adds the C-peptide thresholds. A NEGATIVE antibody does not refute type 1: about 65% of young clinically diagnosed type 1 in Cameroon, Uganda and South Africa was antibody negative. "
         "C-peptide is read only on insulin, ideally more than 3 years from diagnosis and not within 2 weeks of a hyperglycaemic emergency.")
classification("slowly_evolving_immune_mediated", "Slowly evolving immune-mediated diabetes of adults (LADA)", [
    crit("lada", "Islet autoantibody positive, diagnosed after age 35", all=[P("islet_autoantibodies", "==", "positive"), P("age_at_diagnosis", ">", ref="REF-DM-CLS-T1-AGE")], claim_id="A2-17"),
], "A2-17", discriminators=["islet_autoantibodies"], family="DM-CLS-T1",
    note="WHO 2019 hybrid form; no agreed criteria. ADA files it under type 1. Shown as a sub-label of type 1, never as type 2.")
classification("ketosis_prone_type_2", "Ketosis-prone type 2 diabetes", [
    crit("kpd", "Ketosis at presentation, islet autoantibody negative, and came off insulin without relapse",
         all=[P("ketosis_at_presentation"), P("islet_autoantibodies", "==", "negative"), P("insulin_stopped_without_relapse")], ref_id="REF-DM-CLS-KPD"),
], "A2-18", discriminators=["islet_autoantibodies", "c_peptide"], status="reconcile", family="DM-CLS-T1",
    note="Amends the live entry. Without the antibody result the type stays unclassified; the person keeps ketone and sick-day education either way.")

condition("insulin_deficient_diabetes", "Insulin-deficient diabetes (type 1 or ketosis-prone): do not assume type 2", "A10-49")
condition("atypical_lean_diabetes", "Atypical lean, young-onset diabetes: do not assume type 2", "A10-44")
condition("pancreatogenic_diabetes", "Diabetes from pancreatic disease", "A10-42", status="reconcile")
condition("monogenic_diabetes", "Monogenic diabetes (MODY)", "A10-53", status="reconcile")

drule("DM-CLS-T1-01", "Ketosis in diabetes: treat as insulin-deficient until shown otherwise", "insulin_deficient_diabetes",
      crit("cls_ketosis", "Ketosis at presentation, or urine ketones 2+ or more now",
           any=[P("ketosis_at_presentation"), P("urine_ketones", "in", ["2plus", "3plus"])], ref_id="REF-DM-CLS-T1-SAMEDAY"),
      "high", "same_day", ["islet_autoantibodies", "c_peptide", "bohb", "venous_ph", "bicarbonate"],
      ["Starvation ketosis", "Alcoholic ketosis", "Ketosis of pregnancy", "SGLT2 inhibitor treatment"], "A2-37", "DM-CLS-T1", lane="classify",
      notes="WHO HEARTS-D: clinical suspicion of type 1 in a newly diagnosed patient is a same-day referral. Ketosis is the feature that travels: age and build do not, in Uganda. Acute ketoacidosis is owned by the acute interlock, not by this rule.",
      proposal={"kind": "diagnosis.reclassify", "review": "type", "refer": "same_day"})
drule("DM-CLS-T1-02", "Two or more features of insulin deficiency: review the type before settling on type 2", "insulin_deficient_diabetes",
      crit("cls_t1_features", "At least two of: diagnosed before age 35, BMI below 25, unexplained weight loss, glucose above 20 mmol/L at presentation", atLeast=(2, [
           P("age_at_diagnosis", "<", ref="REF-DM-CLS-T1-AGE"), P("bmi", "<", ref="REF-DM-CLS-T1-BMI"), P("unexplained_weight_loss"),
           P("glucose_at_presentation", ">", ref="REF-DM-CLS-T1-GLU")]), ref_id="REF-DM-CLS-T1-AGE"),
      "moderate", "routine", ["urine_ketones", "islet_autoantibodies", "c_peptide"],
      ["Lean type 2 diabetes (a third of Ugandan adults with non-autoimmune diabetes)", "Late presentation of type 2 with weight loss", "HIV, TB or cancer as the cause of weight loss"], "A10-49", "DM-CLS-T1", lane="classify",
      notes="The count of two is this pack's, not the source's: ADA/EASD says only that no single feature confirms type 1, and its figure is drawn from White European data. "
            "This rule asks for urine ketones and a type review; it does not write a type and it does not, on its own, trigger same-day referral (D-DM-10).",
      ageBands=["adult", "older_adult"], proposal={"kind": "diagnosis.reclassify", "review": "type"})
drule("DM-CLS-ATYP-01", "Lean and young at onset: flag as atypical and ask for specialist review", "atypical_lean_diabetes",
      crit("cls_atypical", "BMI below 18.5 and diagnosed before age 30", all=[P("bmi", "<", ref="REF-DM-CLS-T5-BMI"), P("age_at_diagnosis", "<", ref="REF-DM-CLS-T5-AGE")], ref_id="REF-DM-CLS-T5"),
      "low", "routine", ["urine_ketones", "islet_autoantibodies", "c_peptide", "pancreatic_calcification"],
      ["Type 1 diabetes", "Fibrocalculous pancreatic diabetes", "HIV or TB wasting", "Malabsorption"], "A10-44", "DM-CLS-ATYP", lane="classify",
      notes="Never labelled type 5: IDF has not published diagnostic criteria. The flag is 'atypical_phenotype'. Insulin deficiency is likely; a history of childhood undernutrition and absent ketosis strengthen the picture.",
      ageBands=["adult", "older_adult"], proposal={"kind": "refer", "to": "diabetes_specialist", "flag": "atypical_phenotype"})
drule("DM-CLS-PANC-01", "Pancreatic disease with diabetes: consider a pancreatic cause", "pancreatogenic_diabetes",
      crit("cls_panc", "Any of: past acute or chronic pancreatitis, pancreatic calcification, fatty stools with recurrent upper abdominal pain",
           any=[P("pancreatitis_history", "in", ["acute", "chronic"]), P("pancreatic_calcification"), P("steatorrhoea")], ref_id="REF-DM-CLS-PANC"),
      "moderate", "routine", ["pancreatic_calcification"], ["Type 2 diabetes with unrelated abdominal pain", "Pancreatic cancer (weight loss, back pain, jaundice)"], "A10-42", "DM-CLS-PANC", lane="classify",
      notes="Usually misfiled as type 2. Calcification on a plain film or ultrasound in a lean young person points to fibrocalculous pancreatic diabetes, which needs insulin and carries a cancer risk.",
      proposal={"kind": "diagnosis.reclassify", "review": "type"})
drule("DM-CLS-MODY-01", "Young onset with an affected parent and no obesity: consider monogenic diabetes", "monogenic_diabetes",
      crit("cls_mody", "Diagnosed before age 35, a parent with diabetes, and BMI below 25",
           all=[P("age_at_diagnosis", "<", ref="REF-DM-CLS-T1-AGE"), P("parent_with_diabetes"), P("bmi", "<", ref="REF-DM-CLS-T1-BMI")], ref_id="REF-DM-CLS-MODY"),
      "low", "routine", ["islet_autoantibodies", "c_peptide"], ["Type 1 diabetes", "Familial type 2 diabetes"], "A10-53", "DM-CLS-ATYP", lane="classify",
      notes="Genetic testing is not available at most sites; the proposal is specialist review, and the label is never written by the engine.",
      ageBands=["adult", "older_adult"], proposal={"kind": "refer", "to": "diabetes_specialist"})
drule("DM-CLS-DRUG-01", "Hyperglycaemia in a person on steroids: record it as medicine-associated", "drug_associated_hyperglycaemia",
      crit("cls_steroid", "On systemic steroids, with glucose 11.1 mmol/L or more",
           all=[P("on_glucocorticoid")], any=[P("random_pg", ">=", ref="REF-DM-DX-RANDOM"), P("capillary_glucose", ">=", ref="REF-DM-DX-RANDOM"), P("postprandial_pg", ">=", ref="REF-DM-DX-RANDOM")], claim_id="A10-39"),
      "moderate", "routine", ["postprandial_pg", "hba1c"], ["Diabetes that was present before the steroids"], "A10-39", "DM-CLS-DRUG", lane="classify",
      notes="Glucose is monitored until it normalises or a definitive test is done; HbA1c screening waits 3 months after the steroids stop.",
      proposal={"kind": "diagnosis.reclassify", "flag": "drug_associated"})

# ═══ STRATIFY: eyes ═════════════════════════════════════════════════════════
ICDR = "A7-04"
complication("diabetic_retinopathy", "Diabetic retinopathy", "chronic", [
    crit("dr_any", "Any retinopathy on a retinal examination adequate to grade", all=[P("retinopathy_stage", "in", ["mild_npdr", "moderate_npdr", "severe_npdr", "pdr"])], ref_id="REF-DM-EYE-ICDR"),
    crit("dme_any", "Macular oedema", all=[P("macular_oedema", "in", ["non_centre", "centre_involving"])], ref_id="REF-DM-EYE-DME"),
], ["retinopathy_stage", "macular_oedema", "visual_acuity_worse_6_12"], "A2-34",
    intervals=[interval("REF-DM-EYE-INTERVAL-WHO"), interval("REF-DM-EYE-INTERVAL-ADA"),
               interval("REF-DM-EYE-RECALL-NONE-MILD-MAX", "none"), interval("REF-DM-EYE-RECALL-NONE-MILD-MAX", "mild_npdr"),
               interval("REF-DM-EYE-RECALL-MODERATE-MAX", "moderate_npdr"), interval("REF-DM-EYE-RECALL-SEVERE", "severe_npdr"),
               interval("REF-DM-EYE-RECALL-PDR", "pdr"), interval("REF-DM-EYE-RECALL-DME-CI", "centre_involving"), interval("REF-DM-EYE-RECALL-DME-NCI", "non_centre")],
    stagings=[
        staging("icdr_retinopathy", "ICDR retinopathy severity", ICDR, [
            stage("pdr", "Proliferative retinopathy", "critical", crit("s_pdr", "Proliferative", all=[P("retinopathy_stage", "==", "pdr")], claim_id="A7-05")),
            stage("severe_npdr", "Severe non-proliferative retinopathy", "severe", crit("s_sev", "Severe non-proliferative", all=[P("retinopathy_stage", "==", "severe_npdr")], claim_id="A7-04")),
            stage("moderate_npdr", "Moderate non-proliferative retinopathy", "moderate", crit("s_mod", "Moderate non-proliferative", all=[P("retinopathy_stage", "==", "moderate_npdr")], claim_id="A7-03")),
            stage("mild_npdr", "Mild non-proliferative retinopathy", "mild", crit("s_mild", "Mild non-proliferative (microaneurysms only)", all=[P("retinopathy_stage", "==", "mild_npdr")], claim_id="A7-02")),
            stage("none", "No apparent retinopathy", "none", crit("s_none", "No apparent retinopathy", all=[P("retinopathy_stage", "==", "none")], claim_id="A7-01")),
        ]),
        staging("ico_macular_oedema", "ICO macular oedema", "A7-09", [
            stage("centre_involving", "Centre-involving macular oedema", "severe", crit("s_dme_ci", "Centre-involving", all=[P("macular_oedema", "==", "centre_involving")], claim_id="A7-09")),
            stage("non_centre", "Macular oedema not involving the centre", "moderate", crit("s_dme_nci", "Not involving the centre", all=[P("macular_oedema", "==", "non_centre")], claim_id="A7-09")),
            stage("none", "No macular oedema", "none", crit("s_dme_none", "None", all=[P("macular_oedema", "==", "none")], claim_id="A7-09")),
        ]),
    ], family="DM-STR-EYE",
    note="The catalog header listed retinopathy grading as not yet covered; the feature retinopathy_stage and the concept exam.retinopathy_grade already exist. "
         "Type 2: first examination at diagnosis. Type 1: 5 years after onset. The stage-specific intervals are ICO's low and intermediate resource schedule and apply only where diabetes is controlled. "
         "Two default intervals are given (WHO 24 months, ADA 12): site precedence chooses (D-DM-14). A grade from undilated direct ophthalmoscopy is blocked by a validity caveat.")

# ═══ STRATIFY: nerves ═══════════════════════════════════════════════════════
SENS = lambda: [P("monofilament_10g", "in", ["one_foot", "both_feet"]), P("vibration_128hz", "in", ["absent_one", "absent_both"]),
                P("pinprick_feet", "==", "reduced"), P("ipswich_sites_missed", ">=", ref="REF-DM-FOOT-IPSWICH")]
complication("peripheral_neuropathy_probable", "Peripheral neuropathy, probable (Toronto)", "chronic", [
    crit("pn_symptom_sign", "Neuropathic symptoms with reduced distal sensation (monofilament, vibration, pinprick, or 2 or more Ipswich sites not felt)", all=[P("foot_numbness_burning")], any=SENS(), ref_id="REF-DM-NEU-TORONTO"),
    crit("pn_reflex_sign", "Reduced or absent ankle reflexes with reduced distal sensation (monofilament, vibration, pinprick, or 2 or more Ipswich sites not felt)", all=[P("ankle_reflexes", "==", "reduced_or_absent")], any=SENS(), ref_id="REF-DM-NEU-TORONTO"),
    crit("pn_symptom_reflex", "Neuropathic symptoms with reduced or absent ankle reflexes", all=[P("foot_numbness_burning"), P("ankle_reflexes", "==", "reduced_or_absent")], ref_id="REF-DM-NEU-TORONTO"),
], ["monofilament_10g", "vibration_128hz", "pinprick_feet", "ankle_reflexes"], "A8-12", intervals=[interval("REF-DM-NEU-INTERVAL")], family="DM-STR-NEURO",
    note="Toronto 'probable' is two of three CATEGORIES (symptoms, reduced sensation, reflexes). Two abnormal sensory tests are one category, so the rule is written as three criteria rather than atLeast over a flat list. "
         "It is 'diabetic' only by exclusion: the engine names the neuropathy and lists what to exclude; the clinician attributes it. Half of cases have no symptoms, so the tests are the screen. "
         "District pathway: the Ipswich touch test and ankle reflexes need no equipment.")
condition("neuropathy_other_cause", "Neuropathy from another cause", "A8-06")
drule("DM-STR-NEURO-01", "Neuropathy in diabetes: exclude the other causes before calling it diabetic", "neuropathy_other_cause",
      crit("neuro_exclude", "Numb or burning feet, or reduced sensation on testing (monofilament, vibration, pinprick, or 2 or more Ipswich sites not felt)", any=[P("foot_numbness_burning")] + SENS(), ref_id="REF-DM-NEU-EXCLUSION"),
      "low", "routine", ["monofilament_10g", "vibration_128hz", "ankle_reflexes"], ["Vitamin B12 deficiency (long-term metformin)", "Alcohol", "HIV and its treatment", "Isoniazid or linezolid", "Hypothyroidism", "Chronic kidney disease", "Malignancy"], "A8-06", "DM-STR-NEURO", lane="stratify",
      notes="confirmWith lists the tests that establish the neuropathy. The tests that exclude other causes (vitamin B12, TSH) are not catalog features yet; the proposal lists them as orders.",
      proposal={"kind": "test.order", "test": "vitamin_b12_if_on_metformin"})
drule("DM-STR-NEURO-02", "Atypical neuropathy: refer", "neuropathy_other_cause",
      crit("neuro_atypical", "Sudden onset, one-sided, or any weakness", all=[P("neuropathy_atypical")], ref_id="REF-DM-NEU-ATYPICAL"),
      "moderate", "same_day", ["ankle_reflexes", "pinprick_feet"], ["Stroke", "Spinal cord or root compression", "Guillain-Barre syndrome", "Mononeuritis", "Vasculitis"], "A8-08", "DM-STR-NEURO", lane="stratify",
      proposal={"kind": "refer", "to": "physician_or_neurology"})
condition("cardiovascular_autonomic_neuropathy", "Autonomic neuropathy", "A8-17", status="reconcile")
drule("DM-STR-NEURO-03", "A postural fall in blood pressure or a fast resting pulse: consider autonomic neuropathy after the commoner causes", "cardiovascular_autonomic_neuropathy",
      crit("neuro_autonomic", "Any of: systolic fall above 20 mmHg on standing, diastolic fall above 10 mmHg, resting pulse above 100",
           all=[KNOWN()], any=[P("postural_sbp_fall", ">", ref="REF-DM-NEU-OH-SBP"), P("postural_dbp_fall", ">", ref="REF-DM-NEU-OH-DBP"), P("pulse", ">", ref="REF-DM-NEU-TACHY")], ref_id="REF-DM-NEU-OH-SBP"),
      "low", "routine", ["postural_sbp_fall", "postural_dbp_fall", "pulse"], ["Blood pressure medicines or diuretics", "Dehydration or blood loss", "Anaemia", "Infection", "Thyrotoxicosis", "Adrenal insufficiency"], "A8-20", "DM-STR-NEURO", lane="stratify",
      notes="A sign, not a diagnosis: the Toronto criteria need heart-rate tests no district site has. The exam catalogue's orthostatic_hypotension classifier owns the measurement.")

# ═══ STRATIFY: kidney (amendments to the live complication) ═════════════════
amend("diabetic_kidney_disease", "establishedBy.add",
      {"criterion": crit("dkd_albuminuria_2of3", "Albuminuria on at least 2 of 3 specimens within 3 to 6 months",
                         all=[P("uacr_abnormal_count", ">=", ref="REF-DM-KID-UACR-COUNT"), P("urine_acr", ">=", ref="REF-DM-KID-ACR-A2")], ref_id="REF-DM-KID-UACR-CONFIRM"),
       "why": "ADA: urinary albumin varies by more than 20% between samples. The live criterion asks only for persistence of 3 months; this adds the count."},
      ["A6-12"], "DM-STR-CKD")
amend("diabetic_kidney_disease", "staging.boundary",
      {"staging": "kdigo_albuminuria", "issue": "An ACR of exactly 30 mg/mmol: KDIGO Table 3 places it in A2 (A3 is 'above 30'); ADA and KDIGO's referral figure place it in the severe band.",
       "ref": "REF-DM-KID-ACR-A3", "decision": "D-DM-17"}, ["A6-04"], "DM-STR-CKD")
amend("diabetic_kidney_disease", "screening.start",
      {"rule": "Type 2: from diagnosis. Type 1: from 5 years after diagnosis.", "ref": "REF-DM-KID-SCREEN-START-T1"}, ["A6-09", "A6-11"], "DM-STR-CKD")
amend("diabetic_kidney_disease", "monitoring.grid",
      {"needs": "ScreeningInterval keyed by TWO stage codes (GFR category and albuminuria category). Schema change S-DM-04.",
       "timesPerYear": {"G1": {"A1": 1, "A2": 1, "A3": 3}, "G2": {"A1": 1, "A2": 1, "A3": 3}, "G3a": {"A1": 1, "A2": 2, "A3": 3},
                        "G3b": {"A1": 2, "A2": 3, "A3": 3}, "G4": {"A1": 3, "A2": 3, "A3": 4}, "G5": {"A1": 4, "A2": 4, "A3": 4}},
       "note": "KDIGO 2024 Figure 13 as extracted (A6-06); '4' stands for '4 or more'. Verify against the figure before signing.", "ref": "REF-DM-KID-MONITOR-GRID"}, ["A6-06"], "DM-STR-CKD")
amend("diabetic_kidney_disease", "staging.dipstick",
      {"staging": "kdigo_dipstick_fallback", "issue": "The strip-to-category map rests on KDIGO 2012 Table 7, which was recalled and not opened; WHO HEARTS-D prints a different overlap.",
       "ref": "REF-DM-KID-STRIP-MAP", "rule": "A positive strip is 'abnormal, pending confirmation' and never a confirmed albuminuria category (KDIGO 2024 PP 1.3.1.2)."}, ["A6-16", "A2-35"], "DM-STR-CKD")
condition("non_diabetic_kidney_disease", "Kidney disease from another cause", "A6-52", status="reconcile")
drule("DM-STR-CKD-01", "Kidney disease that does not fit diabetes: refer", "non_diabetic_kidney_disease",
      crit("ckd_ndkd", "Any of: a nephrotic picture, red cell casts or rapidly rising albumin; eGFR falling by more than 20%",
           any=[P("non_diabetic_kidney_clue"), P("egfr_fall_percent", ">", ref="REF-DM-KID-REFER-FALL")],
           claim_id="A6-52"),
      "moderate", "same_day", ["urine_acr", "egfr", "haematuria_strip"], ["Urinary tract infection", "Menstruation", "Acute kidney injury from volume loss or medicines", "HIV-associated nephropathy", "Schistosomiasis", "Hypertensive kidney disease"], "A6-52", "DM-STR-CKD", lane="stratify",
      proposal={"kind": "refer", "to": "kidney_care"})

# ═══ STRATIFY: foot and limb (amendments; the foot domain is built) ═════════
amend("diabetic_foot", "citation.reverify", {"what": "IWGDF 2023 Table 1 categories and intervals re-read; ADA Table 12.1 confirmed as a reprint.", "refs": ["REF-DM-FOOT-IWGDF", "REF-DM-FOOT-INT-0", "REF-DM-FOOT-INT-1", "REF-DM-FOOT-INT-2", "REF-DM-FOOT-INT-3"]}, ["A8-27", "A8-29"], "DM-STR-FOOT")
amend("diabetic_foot", "rule.conflict", {"issue": "LOPS by one test (IWGDF) or by monofilament plus one other (ADA).", "ref": "REF-DM-FOOT-LOPS-RULE", "decision": "D-DM-18"}, ["A8-31", "A8-36"], "DM-STR-FOOT")
amend("diabetic_foot", "screenedBy.add", {"features": ["ipswich_sites_missed", "vibration_128hz"], "why": "District pathway: the Ipswich touch test needs no equipment (2 or more of 6 sites not felt).", "ref": "REF-DM-FOOT-IPSWICH"}, ["A8-35"], "DM-STR-FOOT")
amend("diabetic_foot", "rule.thresholds", {"what": "Severe ischaemia: ABI below 0.4, ankle pressure below 50 mmHg, toe pressure below 30 mmHg: urgent vascular opinion. An ABI above 1.3 does not exclude disease.",
       "refs": ["REF-DM-FOOT-ISCH-ABI", "REF-DM-FOOT-ISCH-ANKLE", "REF-DM-FOOT-ISCH-TOE", "REF-DM-VAL-ABI-HIGH"]}, ["A8-44", "A8-39"], "DM-STR-FOOT")
amend("diabetic_foot", "rule.note", {"what": "Charcot: IWGDF endorses no skin-temperature threshold for diagnosis. NICE NG19 uses a sustained difference under 2 degrees for resolution only. Any rule that DIAGNOSES on 2 degrees must be removed or marked needsCsoInput; any one of warmth, swelling or redness is enough to consider it.", "ref": "REF-DM-FOOT-CHARCOT"}, ["A8-62"], "DM-STR-FOOT")

# ═══ STRATIFY: cardiovascular risk ══════════════════════════════════════════
RISK = "who_cvd_risk_percent"
risk_model("who_cvd_2019_eastern_ssa", "WHO cardiovascular risk chart, Eastern Sub-Saharan Africa", "A5-55",
    ["age_years", "sex", "smoking_current", "bp_systolic", "dm_status", "total_cholesterol"], [
    risk_band("ge30", "30% or more", "very_high", crit("r30", "10-year risk 30% or more", all=[P(RISK, ">=", ref="REF-DM-CVD-BAND-30")], ref_id="REF-DM-CVD-BAND-30")),
    risk_band("20_to_30", "20% to under 30%", "very_high", crit("r20", "10-year risk 20% or more", all=[P(RISK, ">=", ref="REF-DM-CVD-BAND-20")], ref_id="REF-DM-CVD-BAND-20")),
    risk_band("10_to_20", "10% to under 20%", "high", crit("r10", "10-year risk 10% or more", all=[P(RISK, ">=", ref="REF-DM-CVD-BAND-10")], ref_id="REF-DM-CVD-BAND-10")),
    risk_band("5_to_10", "5% to under 10%", "moderate", crit("r5", "10-year risk 5% or more", all=[P(RISK, ">=", ref="REF-DM-CVD-BAND-5")], ref_id="REF-DM-CVD-BAND-5")),
    risk_band("lt5", "Under 5%", "low", crit("r0", "10-year risk under 5%", all=[P(RISK, "<", ref="REF-DM-CVD-BAND-5")], ref_id="REF-DM-CVD-BAND-5")),
    ],
    validatedIn=["Asia Pacific Cohort Studies Collaboration", "New Zealand (PREDICT-CVD)", "China (Multi-Provincial Cohort Study)", "Thailand", "Iran (Tehran Lipids and Glucose Study)", "UK Biobank"],
    applicabilityNote="Not validated in any sub-Saharan African cohort: say so beside the band. Ages 40 to 74 only. Not for people with established cardiovascular disease, who are high risk by definition. "
                      "In known diabetes use the laboratory chart; the non-laboratory chart has no diabetes input and underestimated risk in 57.6% of people with diabetes in six regional surveys. "
                      "A statin is not gated on the chart in type 2 diabetes at 40 or over (WHO HEARTS-D).",
    extra={"schemaChange": "S-DM-03: who_cvd_risk_percent is a chart lookup. Import WHO's published chart values for the region; do not type them.",
           "chart": "REF-DM-CVD-CHART", "bandsFirstMatch": True})
risk_model("hypoglycaemia_risk_ada", "Hypoglycaemia risk on insulin or a sulfonylurea", "A4-15",
    ["on_insulin_or_sulfonylurea", "hypo_worst_12m", "hypo_awareness_score", "egfr", "age_years"], [
    risk_band("high", "High", "high", crit("hypo_high", "On insulin or a sulfonylurea, with any of: a low needing someone's help in the last year, impaired awareness (Gold score 4 or more), cognitive impairment, not always enough food, eGFR below 30",
        all=[P("on_insulin_or_sulfonylurea")], any=[P("hypo_worst_12m", "==", "needed_help"), P("hypo_awareness_score", ">=", ref="REF-DM-HYPO-IAH"), P("cognitive_impairment"), P("food_insecurity"), P("egfr", "<", ref="REF-DM-KID-GFR-G4")], ref_id="REF-DM-HYPO-RISK")),
    risk_band("raised", "Raised", "moderate", crit("hypo_raised", "On insulin or a sulfonylurea, with any of: age 75 or over, eGFR below 60, harmful alcohol use, skipped meals or heavy physical work, a self-treated low in the last year",
        all=[P("on_insulin_or_sulfonylurea")], any=[P("age_years", ">=", ref="REF-DM-HYPO-RISK-AGE"), P("egfr", "<", ref="REF-DM-KID-GFR-G3A"), P("alcohol_harmful"), P("meals_irregular"), P("hypo_worst_12m", "==", "self_treated")], ref_id="REF-DM-HYPO-RISK")),
    risk_band("baseline", "On a medicine that can cause lows", "low", crit("hypo_base", "On insulin or a sulfonylurea", all=[P("on_insulin_or_sulfonylurea")], ref_id="REF-DM-HYPO-RISK")),
    ],
    validatedIn=[], applicabilityNote="A list of risk factors from ADA Table 6.5 and WHO HEARTS-D, not a validated score. It orders attention; it predicts nothing. ADA lists 'kidney failure' as major and CKD (eGFR below 60) as other; the eGFR 30 cut for 'high' is this pack's reading of 'kidney failure' (D-DM-16).",
    family="DM-STR-HYPO", extra={"bandsFirstMatch": True})

# ═══ STRATIFY: control. Individual targets (proposed construct, S-DM-06) ════
target("tgt_hba1c_general", "hba1c", "general", "HbA1c below 7.0%", crit("tgt_general", "Confirmed diabetes", all=[KNOWN()], ref_id="REF-DM-CTRL-HBA1C-TARGET"), upper_ref="REF-DM-CTRL-HBA1C-TARGET", claim_id="A2-28",
       note="The default proposal when no reason to relax is recorded.")
target("tgt_hba1c_relaxed", "hba1c", "relaxed", "HbA1c below 8.0%",
       crit("tgt_relaxed", "Any of: frailty, serious comorbidity or limited life expectancy; cognitive impairment; a low needing someone's help in the last year; impaired awareness of lows (Gold score 4 or more)",
            all=[KNOWN()], any=[P("frailty_or_limited_life_expectancy"), P("cognitive_impairment"), P("hypo_worst_12m", "==", "needed_help"), P("hypo_awareness_score", ">=", ref="REF-DM-HYPO-IAH")], ref_id="REF-DM-CTRL-HBA1C-RELAXED"),
       upper_ref="REF-DM-CTRL-HBA1C-RELAXED", claim_id="A2-29")
target("tgt_hba1c_tb", "hba1c", "relaxed", "HbA1c below 8.0% during TB treatment", crit("tgt_tb", "On TB treatment", all=[KNOWN(), P("tb_current")], ref_id="REF-DM-CTRL-TB"), upper_ref="REF-DM-CTRL-TB", claim_id="A10-36",
       note="Offered, not default: WHO words it for people with markedly elevated glucose and TB, in the short term. Restricted class tb: the reason is never shown on a patient-facing surface.")
target("tgt_hba1c_older_healthy", "hba1c", "general", "HbA1c below 7.5% (healthy older adult)",
       crit("tgt_older", "Aged 65 or over", all=[KNOWN(), P("age_years", ">=", ref="REF-DM-CTRL-OLDER-AGE")], ref_id="REF-DM-CTRL-OLDER-HEALTHY"), upper_ref="REF-DM-CTRL-OLDER-HEALTHY", claim_id="A4-49",
       note="ADA. WHO states no age-specific target. Offered as an alternative the clinician may choose; frailty moves the person to the relaxed tier.")
target("tgt_hba1c_ckd", "hba1c", "general", "HbA1c individualised between below 6.5% and below 8.0% in CKD",
       crit("tgt_ckd", "eGFR below 60", all=[KNOWN(), P("egfr", "<", ref="REF-DM-KID-GFR-G3A")], ref_id="REF-DM-CTRL-CKD-HIGH"), upper_ref="REF-DM-CTRL-CKD-HIGH", lower_ref="REF-DM-CTRL-CKD-LOW", claim_id="A6-38",
       note="Below an eGFR of 30 HbA1c itself is unreliable: the control measure moves to glucose.")
target("tgt_fpg_surrogate", "fasting_pg", "general", "Fasting glucose below 7.0 mmol/L where HbA1c is unavailable or unreliable", crit("tgt_fpg", "Confirmed diabetes", all=[KNOWN()], ref_id="REF-DM-CTRL-FPG-SURROGATE"), upper_ref="REF-DM-CTRL-FPG-SURROGATE", claim_id="A2-28",
       note="The district pathway for the control axis.")
target("tgt_ppg_surrogate", "postprandial_pg", "general", "Glucose after a meal below 9.0 mmol/L where HbA1c is unavailable or unreliable", crit("tgt_ppg", "Confirmed diabetes", all=[KNOWN()], ref_id="REF-DM-CTRL-PPG-SURROGATE"), upper_ref="REF-DM-CTRL-PPG-SURROGATE", claim_id="A2-28")
target("tgt_bp", "bp_systolic", "general", "Blood pressure below 130/80 mmHg", crit("tgt_bp_c", "Confirmed diabetes", all=[KNOWN()], ref_id="REF-DM-CVD-BP-SBP"), upper_ref="REF-DM-CVD-BP-SBP", claim_id="A2-31",
       note="Diastolic target REF-DM-CVD-BP-DBP. WHO's hypertension guideline makes the 130 systolic target conditional; ADA relaxes to below 140/90 in very poor health.")

designb("DM-STR-CTRL-01", "DM-STR-CTRL", "stratify", "Control state: at target, above target, or unknown when no valid measure is current", "controlState",
        {"window_at_target": "REF-DM-CTRL-WINDOW-AT-TARGET", "window_above": "REF-DM-CTRL-WINDOW-ABOVE", "hba1c_general": "REF-DM-CTRL-HBA1C-TARGET", "hba1c_relaxed": "REF-DM-CTRL-HBA1C-RELAXED",
         "fpg": "REF-DM-CTRL-FPG-SURROGATE", "ppg": "REF-DM-CTRL-PPG-SURROGATE", "hba1c_validity": "REF-DM-VAL-HBA1C-USE-GLUCOSE"},
        ["obs.hba1c", "obs.glucose"], ["state", "data_gap"], ["A2-28", "A2-29", "A12-67", "A4-01"], minTrust=3,
        note="Measure order: a valid HbA1c inside the window; else fasting and post-meal glucose (WHO surrogates) inside the window; else 'unknown'. Unknown is not controlled (invariant I1). "
             "The target is the clinician-accepted tier; with no accepted tier the state is reported against the general target and labelled 'target not yet agreed'.")
designb("DM-STR-HYPO-01", "DM-STR-HYPO", "stratify", "Hypoglycaemia burden: events in the window and their highest level, shown beside control and never averaged into it", "hypoBurden",
        {"l1": "REF-DM-HYPO-L1", "l2": "REF-DM-HYPO-L2", "l3": "REF-DM-HYPO-L3"}, ["obs.glucose", "hx.hypoglycaemia"], ["state", "flag"], ["A4-14", "A2-39"], minTrust=2,
        note="A level 2 or 3 event raises the proposal to re-evaluate treatment (DM-ACT-RX-HYPO). Glucose below 3.0 in a person NOT on insulin or a sulfonylurea is not diabetes hypoglycaemia: it routes to the general differential (malaria, sepsis, alcohol, adrenal).")
designb("DM-STR-CMPL-01", "DM-STR-CMPL", "stratify", "Complication summary: per organ, the state and the next due date", "complicationSummary",
        {"eye": "REF-DM-EYE-INTERVAL-WHO", "kidney": "REF-DM-KID-SCREEN-INTERVAL", "foot": "REF-DM-FOOT-INT-0", "nerves": "REF-DM-NEU-INTERVAL", "lipids": "REF-DM-CVD-LIPID-INTERVAL"},
        ["exam.retinopathy_grade", "derived.egfr", "obs.uacr", "exam.monofilament", "exam.pedal_pulses"], ["state", "data_gap"], ["A12-62", "A12-68"], minTrust=2,
        note="not_screened and screen_overdue are computed from the date of the last valid examination. A date is required: 'done, date unknown' is a data gap, not a pass.")
