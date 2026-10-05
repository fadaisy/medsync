"""Lanes SUSPECT and CONFIRM: who to test, what confirms, when a result cannot be trusted."""
from lib import P, crit
from k_model import *

SYM = lambda: [P("polyuria"), P("polydipsia"), P("unexplained_weight_loss")]

# ═══ CONFIRM: criteria sets ═════════════════════════════════════════════════
# WHO style: the repeat is a predicate, so requiresConfirmation is NOT set.
def _who_pair(key, label, test_preds, ref_id):
    return [
        crit(f"who_hd_{key}_symptoms", f"{label}, with thirst, passing a lot of urine or unexplained weight loss",
             all=test_preds, any=SYM(), ref_id=ref_id),
        crit(f"who_hd_{key}_repeat", f"{label}, and a second diabetes-range result on a later day",
             all=test_preds + [P("repeat_abnormal_result")], ref_id="REF-DM-DX-REPEAT-WHO"),
    ]

criteria_set("who_hearts_d_2020", "A2-02",
    _who_pair("fpg", "Fasting plasma glucose 7.0 mmol/L or more", [P("fasting_pg", ">=", ref="REF-DM-DX-FPG")], "REF-DM-DX-FPG")
    + _who_pair("fcap", "Fasting capillary glucose 7.0 mmol/L or more (meter, where no laboratory is available)",
                [P("capillary_glucose", ">=", ref="REF-DM-DX-FPG"), P("capillary_glucose_context", "==", "fasting")], "REF-DM-DX-POC-WHO")
    + _who_pair("ogtt", "2-hour plasma glucose 11.1 mmol/L or more after 75 g", [P("ogtt_2h_pg", ">=", ref="REF-DM-DX-OGTT2H")], "REF-DM-DX-OGTT2H")
    + _who_pair("ogtt_cap", "2-hour capillary glucose 12.2 mmol/L or more after 75 g",
                [P("capillary_glucose", ">=", ref="REF-DM-DX-OGTT2H-CAP"), P("capillary_glucose_context", "==", "two_hours_after_glucose")], "REF-DM-DX-OGTT2H-CAP")
    + _who_pair("hba1c", "HbA1c 6.5% or more", [P("hba1c", ">=", ref="REF-DM-DX-HBA1C")], "REF-DM-DX-HBA1C")
    + [crit("who_hd_random_symptoms", "Random plasma glucose 11.1 mmol/L or more, with thirst, passing a lot of urine or unexplained weight loss",
            all=[P("random_pg", ">=", ref="REF-DM-DX-RANDOM")], any=SYM(), ref_id="REF-DM-DX-RANDOM"),
       crit("who_hd_random_cap_symptoms", "Random capillary glucose 11.1 mmol/L or more (meter), with thirst, passing a lot of urine or unexplained weight loss",
            all=[P("capillary_glucose", ">=", ref="REF-DM-DX-RANDOM"), P("capillary_glucose_context", "==", "random")], any=SYM(), ref_id="REF-DM-DX-POC-WHO")],
    note="The working default for Uganda until the UCG 2023 text is supplied (D-DM-01). A random value never diagnoses without symptoms. "
         "The symptom gate uses the three symptoms WHO and ADA both name; HEARTS-D also lists blurred vision and fatigue (D-DM-02).")

criteria_set("ug_ucg_2023", "A1-03", [],
    pending="UCG 2023 section 8.1.3 (pp. 471 to 478) was not read. No criterion may be written until the pages are supplied. "
            "The set exists so the site precedence ['local','WHO','IDF','ADA'] has a slot to fill.")
criteria_set("ug_integrated_dm_2026", "A1-41", [],
    pending="'Integrated Diabetes Management Guidelines for Uganda' (MoH, 2026) is listed in the MoH library and was not opened. "
            "If it is in force it supersedes UCG 2023 for diabetes and becomes the default set (D-DM-01).")

# Verdicts other than 'diabetes' need CriteriaSet.verdict (schema change S-DM-02).
criteria_set("who_2006_intermediate", "A2-10", [
    crit("who_ifg", "Impaired fasting glucose: fasting plasma glucose 6.1 to 6.9 mmol/L",
         all=[P("fasting_pg", ">=", ref="REF-DM-IH-IFG-WHO"), P("fasting_pg", "<", ref="REF-DM-DX-FPG")], ref_id="REF-DM-IH-IFG-WHO"),
    crit("who_igt", "Impaired glucose tolerance: 2-hour plasma glucose 7.8 to 11.0 mmol/L with fasting below 7.0",
         all=[P("ogtt_2h_pg", ">=", ref="REF-DM-IH-IGT"), P("ogtt_2h_pg", "<", ref="REF-DM-DX-OGTT2H"), P("fasting_pg", "<", ref="REF-DM-DX-FPG")], ref_id="REF-DM-IH-IGT"),
], family="DM-CON-CRIT", verdict="intermediate_hyperglycaemia", pending="Needs CriteriaSet.verdict and appliesTo (S-DM-02); until then the bands live in the interpretation tables only.")
criteria_set("ada_2026_prediabetes", "A3-05", [
    crit("ada_ifg", "Fasting plasma glucose 5.6 to 6.9 mmol/L", all=[P("fasting_pg", ">=", ref="REF-DM-IH-IFG-ADA"), P("fasting_pg", "<", ref="REF-DM-DX-FPG")], ref_id="REF-DM-IH-IFG-ADA"),
    crit("ada_igt", "2-hour plasma glucose 7.8 to 11.0 mmol/L", all=[P("ogtt_2h_pg", ">=", ref="REF-DM-IH-IGT"), P("ogtt_2h_pg", "<", ref="REF-DM-DX-OGTT2H")], ref_id="REF-DM-IH-IGT"),
    crit("ada_a1c_pre", "HbA1c 5.7 to 6.4%", all=[P("hba1c", ">=", ref="REF-DM-IH-HBA1C-ADA"), P("hba1c", "<", ref="REF-DM-DX-HBA1C")], ref_id="REF-DM-IH-HBA1C-ADA"),
], verdict="intermediate_hyperglycaemia", pending="Needs S-DM-02. WHO defines no HbA1c band below 6.5%.")
criteria_set("who_2013_gdm", "A10-03", [
    crit("gdm_fpg", "Pregnant: fasting plasma glucose 5.1 to 6.9 mmol/L", all=[P("pregnant"), P("fasting_pg", ">=", ref="REF-DM-PREG-GDM-FPG"), P("fasting_pg", "<", ref="REF-DM-DX-FPG")], ref_id="REF-DM-PREG-GDM-FPG"),
    crit("gdm_1h", "Pregnant: 1-hour plasma glucose 10.0 mmol/L or more after 75 g", all=[P("pregnant"), P("ogtt_1h_pg", ">=", ref="REF-DM-PREG-GDM-1H")], ref_id="REF-DM-PREG-GDM-1H"),
    crit("gdm_2h", "Pregnant: 2-hour plasma glucose 8.5 to 11.0 mmol/L after 75 g", all=[P("pregnant"), P("ogtt_2h_pg", ">=", ref="REF-DM-PREG-GDM-2H"), P("ogtt_2h_pg", "<", ref="REF-DM-DX-OGTT2H")], ref_id="REF-DM-PREG-GDM-2H"),
], family="DM-CON-PREG", verdict="gestational_diabetes", pregnancy="pregnant", pending="Needs S-DM-02. WHO is revising these criteria (REF-DM-PREG-REVISION): version the set, do not overwrite it.")
criteria_set("who_2013_diabetes_in_pregnancy", "A10-02", [
    crit("dip_fpg", "Pregnant: fasting plasma glucose 7.0 mmol/L or more", all=[P("pregnant"), P("fasting_pg", ">=", ref="REF-DM-DX-FPG")], ref_id="REF-DM-PREG-DIP"),
    crit("dip_2h", "Pregnant: 2-hour plasma glucose 11.1 mmol/L or more after 75 g", all=[P("pregnant"), P("ogtt_2h_pg", ">=", ref="REF-DM-DX-OGTT2H")], ref_id="REF-DM-PREG-DIP"),
    crit("dip_random", "Pregnant: random plasma glucose 11.1 mmol/L or more with symptoms", all=[P("pregnant"), P("random_pg", ">=", ref="REF-DM-DX-RANDOM")], any=SYM(), ref_id="REF-DM-PREG-DIP"),
], family="DM-CON-PREG", verdict="diabetes_in_pregnancy", pregnancy="pregnant", pending="Needs S-DM-02. HbA1c is not in the WHO 2013 list.")
criteria_set("consensus_2021_remission", "A10-54", [
    crit("remission_hba1c", "Known type 2 diabetes, HbA1c below 6.5%, off all glucose-lowering medicines for 3 months or more",
         all=[P("dm_status", "==", "known"), P("hba1c", "<", ref="REF-DM-CLS-REMISSION-HBA1C"), P("months_off_glucose_lowering", ">=", ref="REF-DM-CLS-REMISSION-MONTHS")], ref_id="REF-DM-CLS-REMISSION-HBA1C"),
], family="DM-CLS-REMISSION", lane="classify", verdict="remission", runWhen="established", pending="Needs S-DM-02. Clinician-owned state: the engine proposes, never enters it. Complication screening continues in remission (A10-55).")

# ═══ CONFIRM: interpretation tables (additions) ═════════════════════════════
interp("ogtt_1h_idf_2024", "ogtt_1h_pg", "A10-56", [
    band("normal", "Below the IDF 1-hour cut-point", "normal", to=8.6),
    band("intermediate", "Intermediate hyperglycaemia (IDF)", "intermediate", frm=8.6, to=11.6),
    band("diabetes_range", "Diabetes range (IDF); repeat to confirm", "diagnostic", frm=11.6)],
    note="IDF only. WHO and ADA do not use a 1-hour value outside pregnancy.", refs=["REF-DM-IH-OGTT1H-IDF", "REF-DM-DX-OGTT1H-IDF"])
CTL = {"normal": "At target", "intermediate": "Above target"}
interp("hba1c_control_general", "hba1c", "A2-28", [band("at_target", "At target", "normal", to=7.0), band("above_target", "Above target", "intermediate", frm=7.0)],
    when=P("glycaemic_target_tier", "==", "general"), toneLabels=CTL, refs=["REF-DM-CTRL-HBA1C-TARGET"], lane="stratify", family="DM-STR-CTRL",
    note="Read only for a person with confirmed diabetes and an accepted target tier. 'Below 7.0' follows ADA and WHO's own monitoring indicator; WHO's narrative says 'aim for 7.0%' (D-DM-13).")
interp("hba1c_control_relaxed", "hba1c", "A2-29", [band("at_target", "At target", "normal", to=8.0), band("above_target", "Above target", "intermediate", frm=8.0)],
    when=P("glycaemic_target_tier", "==", "relaxed"), toneLabels=CTL, refs=["REF-DM-CTRL-HBA1C-RELAXED"], lane="stratify", family="DM-STR-CTRL")
interp("hba1c_control_tight", "hba1c", "A4-04", [band("at_target", "At target", "normal", to=6.5), band("above_target", "Above target", "intermediate", frm=6.5)],
    when=P("glycaemic_target_tier", "==", "tight"), toneLabels=CTL, refs=["REF-DM-CTRL-HBA1C-TIGHT"], lane="stratify", family="DM-STR-CTRL")
interp("fpg_control_who", "fasting_pg", "A2-58", [band("at_target", "At target", "normal", to=7.0), band("above_target", "Above target", "intermediate", frm=7.0)],
    when=P("dm_status", "==", "known"), toneLabels=CTL, refs=["REF-DM-CTRL-FPG-SURROGATE"], lane="stratify", family="DM-STR-CTRL",
    note="WHO's surrogate where HbA1c is unavailable or unreliable. This is the district pathway for the control axis. No lower bound is defined by WHO; hypoglycaemia is read from the hypoglycaemia table, not from this one.")
interp("ppg_control_who", "postprandial_pg", "A2-58", [band("at_target", "At target", "normal", to=9.0), band("above_target", "Above target", "intermediate", frm=9.0)],
    when=P("dm_status", "==", "known"), toneLabels=CTL, refs=["REF-DM-CTRL-PPG-SURROGATE"], lane="stratify", family="DM-STR-CTRL")
interp("bohb_bands", "bohb", "A9-51", [
    band("normal", "Normal", "normal", to=0.6),
    band("raised", "Raised: test again in 2 hours", "intermediate", frm=0.6, to=1.6),
    band("at_risk", "At risk of DKA: seek advice as soon as possible", "intermediate", frm=1.6, to=3.0),
    band("dka_range", "Ketone criterion for DKA met", "diagnostic", frm=3.0, alert=("Ketones 3.0 mmol/L or more", "Assess for diabetic ketoacidosis now: venous gas or bicarbonate, and urgent senior review."))],
    toneLabels={"normal": "Normal", "intermediate": "Raised", "diagnostic": "DKA range"}, toneColors={"intermediate": "amber"},
    refs=["REF-DM-ACU-KETONE-LOW", "REF-DM-ACU-KETONE-RISK", "REF-DM-ACU-DKA-BOHB"], lane="acute_route", family="DM-ACU-ROUTE",
    note="Lower bands are the Trend UK sick-day bands (a patient leaflet, not a guideline); the 3.0 boundary is the 2024 consensus criterion. "
         "The validator's rule that a diagnostic band must match a diagnostic criterion was written for glucose tables: check it accepts this one, or widen it.")
interp("bp_systolic_who_hearts_d", "bp_systolic", "A2-31", [band("at_target", "At target", "normal", to=130), band("treat", "At or above the treatment threshold in diabetes", "intermediate", frm=130)],
    when=P("dm_status", "==", "known"), toneLabels={"normal": "At target", "intermediate": "Above target"}, refs=["REF-DM-CVD-BP-SBP"], lane="stratify", family="DM-STR-CVD",
    note="WHO HEARTS-D. The live catalog already has the ADA table with the extra 150 mmHg band; both stand, chosen by site precedence.")
interp("bp_diastolic_who_hearts_d", "bp_diastolic", "A2-31", [band("at_target", "At target", "normal", to=80), band("treat", "At or above the treatment threshold in diabetes", "intermediate", frm=80)],
    when=P("dm_status", "==", "known"), toneLabels={"normal": "At target", "intermediate": "Above target"}, refs=["REF-DM-CVD-BP-DBP"], lane="stratify", family="DM-STR-CVD")

# ═══ CONFIRM: validity caveats (additions to the 10 that exist) ═════════════
GLU_ALT = "Use fasting or 2-hour plasma glucose criteria instead of HbA1c."
caveat("hba1c_g6pd", "hba1c", "G6PD deficiency lowers HbA1c independent of glucose and may mask diabetes",
       crit("g6pd", "G6PD deficiency recorded", all=[P("g6pd_deficiency")], ref_id="REF-DM-VAL-HBA1C-G6PD"), "masks", True, "A10-63", GLU_ALT)
caveat("hba1c_hiv_on_art", "hba1c", "HbA1c underestimates glycaemia in people with HIV on ART; diagnose on plasma glucose",
       crit("hiv_art", "Living with HIV, on ART", all=[P("hiv_on_art")], ref_id="REF-DM-VAL-HBA1C-USE-GLUCOSE"), "masks", True, "A3-10", GLU_ALT, status="reconcile")
caveat("hba1c_sickle_cell_disease", "hba1c", "HbA1c cannot be measured reliably in sickle cell disease",
       crit("scd", "Sickle cell disease", all=[P("sickle_cell_disease")], ref_id="REF-DM-VAL-HBA1C-HBSS"), "masks", True, "A4-12",
       "Use plasma glucose to diagnose; monitor with glucose readings (fructosamine or glycated albumin where available).", status="reconcile")
caveat("hba1c_variant_trait", "hba1c", "Sickle cell trait or another haemoglobin variant: interference depends on the assay",
       crit("trait", "Haemoglobin variant trait", all=[P("sickle_cell_trait")], ref_id="REF-DM-VAL-HBA1C-VARIANT"), "unpredictable", True, "A11-27",
       "Use plasma glucose unless the laboratory confirms its method is free of interference for this variant.", status="reconcile")
caveat("hba1c_b12_or_iron_deficiency", "hba1c", "Iron or vitamin B12 deficiency falsely RAISES HbA1c and may manufacture a diagnosis",
       crit("iron_b12", "Iron or vitamin B12 deficiency", any=[P("iron_deficiency"), P("b12_deficiency")], ref_id="REF-DM-VAL-HBA1C-IRON"), "manufactures", True, "A10-64", GLU_ALT, status="reconcile")
caveat("hba1c_haematinic_or_epo", "hba1c", "Iron, vitamin B12 or erythropoietin treatment lowers HbA1c while new red cells are being made",
       crit("haematinic", "On iron, B12 or erythropoietin", all=[P("on_iron_b12_or_epo")], ref_id="REF-DM-VAL-HBA1C-DRUGS"), "masks", True, "A11-30", GLU_ALT)
caveat("hba1c_dapsone_or_spleen", "hba1c", "Dapsone and an enlarged spleen shorten red-cell life and lower HbA1c",
       crit("dapsone_spleen", "On dapsone, or enlarged spleen", any=[P("on_dapsone"), P("splenomegaly")], ref_id="REF-DM-VAL-HBA1C-DRUGS"), "masks", True, "A11-30", GLU_ALT)
caveat("hba1c_low_egfr", "hba1c", "HbA1c is less accurate when eGFR is below 30, and reads low on dialysis",
       crit("egfr30", "eGFR below 30, or on dialysis", any=[P("egfr", "<", ref="REF-DM-VAL-HBA1C-CKD-EGFR"), P("on_dialysis")], ref_id="REF-DM-VAL-HBA1C-CKD-EGFR"), "unpredictable", True, "A6-37",
       "Use plasma glucose to diagnose and glucose readings to monitor.", status="reconcile")
caveat("hba1c_pregnancy", "hba1c", "Pregnancy changes red-cell turnover and iron status: HbA1c is not used to diagnose hyperglycaemia in pregnancy",
       crit("preg", "Pregnant", all=[P("pregnant")], ref_id="REF-DM-VAL-HBA1C-USE-GLUCOSE"), "unpredictable", True, "A3-10", "Use the 75 g OGTT (fasting, 1-hour and 2-hour plasma glucose).", status="reconcile")
caveat("glucose_acute_illness", "random_pg", "A raised glucose during acute illness may be transitory",
       crit("ill", "Acutely unwell now", all=[P("acute_illness_current")], ref_id="REF-DM-SUS-STRESS"), "manufactures", False, "A11-54",
       "Confirm after recovery, unless symptoms of diabetes came before the illness or ketones are raised. An HbA1c of 6.5% or more at admission suggests diabetes came first.")
caveat("glucose_tb_at_diagnosis", "random_pg", "TB can raise glucose at diagnosis",
       crit("tb", "TB newly diagnosed or on treatment", all=[P("tb_current")], ref_id="REF-DM-SUS-TB-RECHECK"), "manufactures", False, "A10-32",
       "Reassess glycaemia after the first month of TB treatment; confirm an asymptomatic positive with a repeat test.")
caveat("fasting_glucose_on_steroids", "fasting_pg", "On steroids a fasting glucose can be normal while afternoon glucose is high",
       crit("steroid", "On recurrent or long-term systemic steroids", all=[P("on_glucocorticoid")], ref_id="REF-DM-SUS-STEROID"), "masks", False, "A3-29",
       "Test glucose after lunch or before the evening meal.")
caveat("urine_ketones_low_despite_picture", "urine_ketones", "Urine ketone strips underestimate ketones early in ketoacidosis",
       crit("ketone_mismatch", "Urine ketones below 2+ with Kussmaul breathing, acetone on the breath or vomiting",
            all=[P("urine_ketones", "in", ["neg", "trace", "1plus"])], any=[P("deep_rapid_breathing"), P("acetone_breath"), P("vomiting")], ref_id="REF-DM-VAL-URINE-KETONE"),
       "masks", False, "A9-14", "Measure blood beta-hydroxybutyrate or a venous gas; if neither is available, treat the clinical picture and refer.")
caveat("egfr_overestimate_africa", "egfr", "Creatinine-based eGFR overestimated kidney function in Ugandan, Malawian and South African adults",
       crit("egfr_60_89", "eGFR 60 to 89", all=[P("egfr", ">=", ref="REF-DM-KID-GFR-G3A"), P("egfr", "<", ref="REF-DM-KID-GFR-G2")], ref_id="REF-DM-VAL-EGFR-ARK"), "masks", False, "A6-25",
       "Read it with the urine albumin result and the trend; repeat if it will change treatment. Never apply an ethnicity coefficient.")
caveat("egfr_not_steady_state", "egfr", "eGFR is not valid while creatinine is changing, or in pregnancy",
       crit("unsteady", "Creatinine not in steady state, or pregnant", any=[P("creatinine_unstable"), P("pregnant")], ref_id="REF-DM-VAL-EGFR-STEADY"), "unpredictable", True, "A6-65",
       "Repeat once the acute illness has settled before staging kidney disease.")
caveat("uacr_transient", "urine_acr", "Exercise, fever, infection, menstruation and very high glucose or blood pressure raise urine albumin without kidney damage",
       crit("transient", "A transient cause is present", all=[P("uacr_transient_cause")], ref_id="REF-DM-VAL-UACR-TRANSIENT"), "manufactures", True, "A6-13",
       "Repeat when it has resolved; albuminuria needs 2 of 3 abnormal specimens within 3 to 6 months.")
caveat("fundus_undilated_direct", "retinopathy_stage", "Direct ophthalmoscopy without dilation misses most retinopathy",
       crit("undilated", "Examined by direct ophthalmoscopy, pupils not dilated", all=[P("fundus_method", "==", "undilated_ophthalmoscopy")], ref_id="REF-DM-VAL-OPHTHALMOSCOPY"), "masks", True, "A7-21",
       "A retinal photograph or a dilated examination by a trained examiner. Until then the eyes count as not screened.", family="DM-STR-EYE")
caveat("abi_calcified", "abi", "An ankle-brachial index above 1.3 does not exclude arterial disease: calcified arteries raise the reading",
       crit("abi_high", "Ankle-brachial index above 1.3", all=[P("abi", ">", ref="REF-DM-VAL-ABI-HIGH")], ref_id="REF-DM-VAL-ABI-HIGH"), "masks", True, "A8-39",
       "Toe pressure or pedal Doppler waveforms; refer if there is an ulcer.", family="DM-STR-FOOT")
caveat("who_chart_non_lab_in_diabetes", "who_cvd_risk_percent", "The non-laboratory WHO chart has no diabetes input and underestimates risk in people with diabetes",
       crit("nonlab_dm", "Non-laboratory chart used in a person with diabetes", all=[P("who_cvd_chart_used", "==", "non_laboratory"), P("dm_status", "==", "known")], ref_id="REF-DM-CVD-NONLAB-UNDER"), "masks", False, "A5-67",
       "Use the laboratory chart with total cholesterol. Without it, read the band as a floor; WHO gives a statin to people with type 2 diabetes aged 40 or over whatever the chart says.", family="DM-STR-CVD")

# ═══ SUSPECT: conditions and rules ══════════════════════════════════════════
condition("diabetes_undiagnosed", "Diabetes, not yet diagnosed", "A2-21")
condition("stress_hyperglycaemia", "Hyperglycaemia of acute illness", "A11-54")
condition("gestational_diabetes", "Gestational diabetes", "A10-03", status="reconcile")
condition("diabetes_in_pregnancy", "Diabetes in pregnancy", "A10-02")
condition("drug_associated_hyperglycaemia", "Medicine-associated hyperglycaemia", "A3-28", status="reconcile")
condition("type_1_diabetes", "Type 1 diabetes", "A2-15", status="reconcile")

GLU_TESTS = ["capillary_glucose", "random_pg", "fasting_pg", "ogtt_2h_pg", "hba1c"]
OSM_MIMICS = ["Diuretic treatment", "Hypercalcaemia", "Chronic kidney disease", "Diabetes insipidus", "Primary polydipsia",
              "Urinary infection (frequency rather than volume)", "HIV, TB or cancer as the cause of weight loss", "Thyrotoxicosis"]

drule("DM-SUS-SYMP-01", "Thirst, passing a lot of urine or unexplained weight loss: test glucose today", "diabetes_undiagnosed",
      crit("sus_symp_classic", "Any of: passing large volumes of urine, excessive thirst, unexplained weight loss", any=SYM(), claim_id="A2-21"),
      "moderate", "same_day", GLU_TESTS, OSM_MIMICS, "A2-21", "DM-SUS-SYMP",
      notes="A random glucose now is the test: with symptoms a single diabetes-range value is diagnostic. A normal BMI does not lower suspicion; a third of Ugandan adults with non-autoimmune diabetes are lean.",
      ageBands=["adult", "older_adult"], proposal={"kind": "test.order", "test": "glucose_random_or_fasting", "tier": "today"})
drule("DM-SUS-SYMP-02", "Blurred vision, recurrent infections, a slow-healing wound or numb, burning feet: test glucose", "diabetes_undiagnosed",
      crit("sus_symp_soft", "Any of: blurred vision, recurrent infections, slow-healing wound, numbness or burning in the feet",
           any=[P("blurred_vision"), P("recurrent_infections"), P("slow_healing_wound"), P("foot_numbness_burning")], claim_id="A2-21"),
      "low", "routine", GLU_TESTS, ["Refractive error or cataract", "HIV", "Vitamin B12 deficiency", "Alcohol-related neuropathy", "Peripheral artery disease"], "A2-21", "DM-SUS-SYMP",
      ageBands=["adult", "older_adult"], proposal={"kind": "test.order", "test": "glucose_fasting", "tier": "soon"})
drule("DM-SUS-RISK-01", "Aged 40 or over and overweight: offer a fasting glucose", "diabetes_undiagnosed",
      crit("sus_risk_who", "Age 40 or over, with BMI 25 or more", all=[P("age_years", ">=", ref="REF-DM-SUS-AGE-WHO"), P("bmi", ">=", ref="REF-DM-SUS-BMI")], ref_id="REF-DM-SUS-AGE-WHO"),
      "low", "routine", ["fasting_pg", "hba1c", "ogtt_2h_pg"], ["Acute illness at the time of testing (transitory hyperglycaemia)", "Steroid treatment at the time of testing"], "A2-21", "DM-SUS-RISK",
      notes="WHO HEARTS-D. This is an eligibility rule, not a score: no risk score is validated for Uganda (REF-DM-SUS-NO-SCORE).",
      ageBands=["adult", "older_adult"], proposal={"kind": "test.order", "test": "glucose_fasting", "tier": "routine"})
drule("DM-SUS-RISK-02", "Overweight with another risk factor: offer testing at any adult age", "diabetes_undiagnosed",
      crit("sus_risk_ada", "BMI 25 or more, with any of: a first-degree relative with diabetes, hypertension, cardiovascular disease, polycystic ovary syndrome, physical inactivity, acanthosis nigricans",
           all=[P("bmi", ">=", ref="REF-DM-SUS-BMI")],
           any=[P("first_degree_relative_diabetes"), P("hypertension_known"), P("cvd_established"), P("pcos"), P("physically_inactive"), P("acanthosis_nigricans")], claim_id="A11-45"),
      "low", "routine", ["fasting_pg", "hba1c", "ogtt_2h_pg"], ["Acute illness at the time of testing (transitory hyperglycaemia)", "Steroid treatment at the time of testing"], "A11-45", "DM-SUS-RISK",
      notes="ADA Table 2.5. Offered as an additional rule; whether it runs at district sites is D-DM-05.",
      ageBands=["adult", "older_adult"], proposal={"kind": "test.order", "test": "glucose_fasting", "tier": "routine"})
drule("DM-SUS-RISK-03", "Aged 35 or over and never tested, or not tested for 3 years: offer testing", "diabetes_undiagnosed",
      crit("sus_risk_age_ada", "Age 35 or over, with no glucose test in the last 36 months",
           all=[P("age_years", ">=", ref="REF-DM-SUS-AGE-ADA"), P("months_since_glucose_test", ">=", ref="REF-DM-SUS-RESCREEN")], ref_id="REF-DM-SUS-AGE-ADA"),
      "low", "routine", ["fasting_pg", "hba1c"], ["Acute illness at the time of testing (transitory hyperglycaemia)", "Steroid treatment at the time of testing"], "A3-21", "DM-SUS-RISK",
      notes="ADA only. WHO does not test asymptomatic adults who are not overweight. Off by default (D-DM-05). 'Never tested' is a missing value and cannot satisfy this predicate; Design B rule DM-SUS-RISK-NEVER covers it.",
      ageBands=["adult", "older_adult"], proposal={"kind": "test.order", "test": "glucose_fasting", "tier": "routine"})
drule("DM-SUS-RISK-04", "Borderline glucose before: re-test every year", "diabetes_undiagnosed",
      crit("sus_ih_retest", "Previously in the intermediate range, with no test in the last 12 months",
           all=[P("prior_intermediate_hyperglycaemia"), P("months_since_glucose_test", ">=", ref="REF-DM-IH-RETEST")], ref_id="REF-DM-IH-RETEST"),
      "moderate", "routine", ["fasting_pg", "ogtt_2h_pg", "hba1c"], ["Acute illness at the time of testing (transitory hyperglycaemia)", "Steroid treatment at the time of testing"], "A3-50", "DM-SUS-RISK",
      ageBands=["adult", "older_adult"], proposal={"kind": "recall.schedule", "test": "glucose_fasting", "tier": "soon"})
drule("DM-SUS-RISK-05", "Gestational diabetes in the past: test for diabetes at least every 3 years, lifelong", "diabetes_undiagnosed",
      crit("sus_gdm_lifelong", "Gestational diabetes in a previous pregnancy, with no test in the last 36 months",
           all=[P("prior_gdm"), P("months_since_glucose_test", ">=", ref="REF-DM-SUS-GDM-RETEST-MAX")], ref_id="REF-DM-SUS-GDM-RETEST-MAX"),
      "moderate", "routine", ["fasting_pg", "ogtt_2h_pg"], ["Acute illness at the time of testing (transitory hyperglycaemia)", "Steroid treatment at the time of testing"], "A3-23", "DM-SUS-RISK",
      ageBands=["adult", "older_adult"], proposal={"kind": "test.order", "test": "ogtt_75g", "tier": "soon"})
drule("DM-SUS-PREG-02", "Gestational diabetes in the pregnancy just ended: re-test 6 to 12 weeks after the birth", "diabetes_undiagnosed",
      crit("sus_gdm_postpartum", "Gestational diabetes, 6 weeks or more since the birth",
           all=[P("prior_gdm"), P("postpartum_weeks", ">=", ref="REF-DM-PREG-POSTPARTUM-FROM")], ref_id="REF-DM-PREG-POSTPARTUM-FROM"),
      "moderate", "routine", ["fasting_pg", "ogtt_2h_pg"], ["Iron deficiency after delivery (if HbA1c is used instead)"], "A10-10", "DM-SUS-POP",
      notes="Use glucose, not HbA1c: red-cell turnover has not settled after pregnancy and delivery.",
      proposal={"kind": "test.order", "test": "ogtt_75g", "tier": "soon"})
drule("DM-SUS-INCID-01", "Random glucose 11.1 mmol/L or more: diagnostic with symptoms; without them, repeat on another day and do not leave it", "diabetes_undiagnosed",
      crit("sus_incidental", "Random glucose 11.1 mmol/L or more (plasma or meter)",
           any=[P("random_pg", ">=", ref="REF-DM-DX-RANDOM"), P("capillary_glucose", ">=", ref="REF-DM-DX-RANDOM")], ref_id="REF-DM-DX-RANDOM"),
      "moderate", "routine", ["fasting_pg", "ogtt_2h_pg", "hba1c", "repeat_abnormal_result"], ["Acute illness (stress hyperglycaemia)", "Steroid treatment", "A recent meal or sugary drink, if the context was not recorded"], "A2-04", "DM-SUS-INCID",
      notes="WHO: repeat, preferably the same test, on a subsequent day. The rule does not test for the absence of symptoms: an unasked symptom would then silence it. The time-window search across past visits is Design B rule DM-SUS-INCID-WINDOW.",
      ageBands=["adult", "older_adult"], proposal={"kind": "test.repeat", "test": "glucose_fasting", "tier": "soon"})
drule("DM-SUS-INPT-01", "Glucose above 7.8 mmol/L in hospital: check HbA1c if valid, and follow up after recovery", "stress_hyperglycaemia",
      crit("sus_inpatient", "Seen in the emergency unit or as an inpatient, with glucose above 7.8 mmol/L",
           all=[P("care_setting", "in", ["emergency", "inpatient"])], any=[P("random_pg", ">", ref="REF-DM-SUS-HOSP-GLU"), P("capillary_glucose", ">", ref="REF-DM-SUS-HOSP-GLU")], ref_id="REF-DM-SUS-HOSP-GLU"),
      "low", "routine", ["hba1c", "fasting_pg"], ["Unrecognised diabetes", "Steroid treatment", "Intravenous glucose or feeding"], "A11-36", "DM-SUS-INPT",
      notes="An admission HbA1c of 6.5% or more suggests diabetes came before the illness. Where HbA1c is invalid or unavailable, a fasting glucose after recovery decides.",
      ageBands=["adult", "older_adult"], proposal={"kind": "test.order", "test": "hba1c_if_valid_else_fasting_glucose_after_recovery", "tier": "soon"})
drule("DM-SUS-POP-HIV-01", "Living with HIV on ART: fasting glucose every year", "diabetes_undiagnosed",
      crit("sus_hiv_annual", "On ART, with no glucose test in the last 12 months",
           all=[P("hiv_on_art"), P("months_since_glucose_test", ">=", ref="REF-DM-IH-RETEST")], claim_id="A3-26"),
      "low", "routine", ["fasting_pg"], ["Acute illness at the time of testing (transitory hyperglycaemia)", "Steroid treatment at the time of testing"], "A3-26", "DM-SUS-POP",
      notes="ADA. Also before ART, at a switch, and 3 to 6 months after starting or switching (Design B rule DM-SUS-POP-ART-WINDOW). Use glucose, not HbA1c. Uganda's own rule is REF-DM-SUS-HIV-UG, not yet read. Restricted class: hiv.",
      ageBands=["adult", "older_adult"], proposal={"kind": "test.order", "test": "glucose_fasting", "tier": "routine", "restrictedClass": "hiv"})
drule("DM-SUS-POP-DTG-01", "On dolutegravir with thirst, polyuria or weight loss: check glucose today", "drug_associated_hyperglycaemia",
      crit("sus_dtg_symptoms", "On a dolutegravir regimen, with any of: thirst, passing a lot of urine, unexplained weight loss",
           all=[P("art_regimen", "in", ["tdf_3tc_dtg", "taf_ftc_dtg", "abc_3tc_dtg", "azt_3tc_dtg"])], any=SYM(), claim_id="A10-23"),
      "moderate", "same_day", ["capillary_glucose", "fasting_pg", "urine_ketones"], OSM_MIMICS, "A10-23", "DM-SUS-POP",
      notes="The Kampala signal was in people switched to dolutegravir, a median of 4 months after starting, and most cases were severe. Never stop ART from this rule: it proposes a glucose test. Restricted class: hiv.",
      ageBands=["adult", "older_adult"], proposal={"kind": "test.order", "test": "glucose_random", "tier": "today", "restrictedClass": "hiv"})
drule("DM-SUS-POP-TB-01", "TB: offer a diabetes test to everyone who does not know their status", "diabetes_undiagnosed",
      crit("sus_tb", "TB newly diagnosed or on treatment", all=[P("tb_current")], claim_id="A10-31"),
      "low", "routine", ["fasting_pg", "random_pg", "hba1c"], ["Hyperglycaemia of active infection"], "A10-31", "DM-SUS-POP",
      notes="A raised result at TB diagnosis is re-checked after the first month of treatment. Restricted class: tb.",
      ageBands=["adult", "older_adult"], proposal={"kind": "test.order", "test": "glucose_fasting", "tier": "routine", "restrictedClass": "tb"})
drule("DM-SUS-POP-STEROID-01", "On systemic steroids: check glucose after a meal, not fasting", "drug_associated_hyperglycaemia",
      crit("sus_steroid", "On recurrent or long-term systemic steroids", all=[P("on_glucocorticoid")], claim_id="A3-29"),
      "low", "routine", ["postprandial_pg", "capillary_glucose"], ["Diabetes that was present before the steroids"], "A3-29", "DM-SUS-POP",
      ageBands=["adult", "older_adult"], proposal={"kind": "test.order", "test": "glucose_after_meal", "tier": "routine"})
drule("DM-SUS-POP-ANTIPSYCH-01", "On a second-generation antipsychotic for 12 weeks or more: check glucose", "drug_associated_hyperglycaemia",
      crit("sus_antipsychotic", "On a second-generation antipsychotic, started 12 or more weeks ago, with no glucose test in the last 12 months",
           all=[P("on_second_gen_antipsychotic"), P("weeks_since_antipsychotic_start", ">=", ref="REF-DM-SUS-ANTIPSYCH-WEEKS"), P("months_since_glucose_test", ">=", ref="REF-DM-IH-RETEST")], claim_id="A3-28"),
      "low", "routine", ["fasting_pg", "hba1c"], ["Acute illness at the time of testing (transitory hyperglycaemia)", "Steroid treatment at the time of testing"], "A3-28", "DM-SUS-POP",
      notes="ADA: baseline, 12 to 16 weeks after starting, then yearly. Restricted class: mental_health.",
      ageBands=["adult", "older_adult"], proposal={"kind": "test.order", "test": "glucose_fasting", "tier": "routine", "restrictedClass": "mental_health"})
drule("DM-SUS-POP-PANC-01", "After pancreatitis: test for diabetes", "diabetes_undiagnosed",
      crit("sus_pancreatitis", "Acute pancreatitis in the past, or chronic pancreatitis, with no glucose test in the last 12 months",
           all=[P("pancreatitis_history", "in", ["acute", "chronic"]), P("months_since_glucose_test", ">=", ref="REF-DM-IH-RETEST")], claim_id="A3-31"),
      "low", "routine", ["fasting_pg", "ogtt_2h_pg"], ["Acute illness at the time of testing (transitory hyperglycaemia)", "Steroid treatment at the time of testing"], "A3-31", "DM-SUS-POP",
      ageBands=["adult", "older_adult"], proposal={"kind": "test.order", "test": "glucose_fasting", "tier": "routine"})
drule("DM-SUS-PREG-01", "24 weeks or more pregnant: offer a 75 g OGTT", "gestational_diabetes",
      crit("sus_preg_window", "Pregnant, at 24 weeks or more", all=[P("pregnant"), P("gestation_weeks", ">=", ref="REF-DM-PREG-WINDOW-START")], ref_id="REF-DM-PREG-WINDOW-START"),
      "low", "routine", ["fasting_pg", "ogtt_1h_pg", "ogtt_2h_pg"], ["Diabetes that was present before pregnancy"], "A10-20", "DM-SUS-POP",
      notes="FIGO: all women at 24 to 28 weeks, and diagnosis is valid at any time in pregnancy. WHO makes no universal screening recommendation, so this rule is off until the CSO decides (D-DM-12). HbA1c is not used for gestational diabetes.",
      proposal={"kind": "test.order", "test": "ogtt_75g", "tier": "routine"})
drule("DM-CON-PREG-01", "Pregnant with a glucose in the WHO gestational range", "gestational_diabetes",
      crit("con_gdm_any", "Pregnant, with any one of: fasting 5.1 mmol/L or more, 1-hour 10.0 or more, 2-hour 8.5 or more",
           all=[P("pregnant")], any=[P("fasting_pg", ">=", ref="REF-DM-PREG-GDM-FPG"), P("ogtt_1h_pg", ">=", ref="REF-DM-PREG-GDM-1H"), P("ogtt_2h_pg", ">=", ref="REF-DM-PREG-GDM-2H")], ref_id="REF-DM-PREG-GDM-FPG"),
      "high", "same_day", ["fasting_pg", "ogtt_1h_pg", "ogtt_2h_pg"], ["Diabetes in pregnancy (values in the diabetes range)", "A sample taken when not fasting, recorded as fasting"], "A10-03", "DM-CON-PREG", lane="confirm",
      notes="One value is enough under WHO 2013. If fasting is 7.0 or more, or 2-hour 11.1 or more, this is diabetes in pregnancy and rule DM-CON-PREG-02 outranks this one.",
      proposal={"kind": "refer", "to": "antenatal_clinic", "tier": "today"})
drule("DM-CON-PREG-02", "Pregnant with a glucose in the diabetes range: diabetes in pregnancy", "diabetes_in_pregnancy",
      crit("con_dip_any", "Pregnant, with fasting plasma glucose 7.0 mmol/L or more, or 2-hour 11.1 or more",
           all=[P("pregnant")], any=[P("fasting_pg", ">=", ref="REF-DM-DX-FPG"), P("ogtt_2h_pg", ">=", ref="REF-DM-DX-OGTT2H")], ref_id="REF-DM-PREG-DIP"),
      "high", "same_day", ["fasting_pg", "ogtt_2h_pg"], ["A sample taken when not fasting, recorded as fasting"], "A10-02", "DM-CON-PREG", lane="confirm", rulesOut=["gestational_diabetes"],
      notes="WHO 2025: multidisciplinary specialised care, with retinal and kidney assessment when antenatal care starts.",
      proposal={"kind": "refer", "to": "antenatal_clinic_specialist", "tier": "today"})
drule("DM-SUS-PAED-01", "A child who is thirsty, passing a lot of urine, wetting the bed again, tired or losing weight: capillary glucose now", "type_1_diabetes",
      crit("sus_paed_4t", "Any of: passing large volumes of urine, excessive thirst, unexplained weight loss, new bed-wetting",
           any=[P("polyuria"), P("polydipsia"), P("unexplained_weight_loss"), P("secondary_enuresis")], claim_id="A9-29"),
      "moderate", "immediate", ["capillary_glucose", "urine_ketones", "bohb"],
      ["Urinary tract infection", "Malaria", "Gastroenteritis", "Respiratory infection"], "A9-29", "DM-SUS-PAED", ageBands=["child", "adolescent"],
      notes="Recognition and referral only under 16. A raised glucose is a same-day referral; do not wait for a fasting test. In limited-resource settings ketoacidosis in a child is taken for malaria or gastroenteritis.",
      proposal={"kind": "test.order", "test": "glucose_capillary", "tier": "today"})

# ═══ Reconcile: on a glucose-lowering medicine with no diabetes on record ═══
step("DM-SUS-RECON-01", "On a glucose-lowering medicine with no diabetes on the problem list: review the record",
     crit("recon_gl_med", "Diabetes not recorded as known, and taking metformin, a sulfonylurea or insulin",
          all=[P("dm_status", "!=", "known")], any=[P("glucose_lowering_therapy", "==", v) for v in ["metformin", "glibenclamide", "gliclazide", "glimepiride", "insulin"]], claim_id="A3-55"),
     "A3-55", "reconcile", "DM-SUS-RECON", lane="suspect", proposal={"kind": "reconcile.problem_list"},
     note="Metformin is also used for prediabetes and polycystic ovary syndrome, so this asks a question and assumes nothing.")

# ═══ Design B rules for logic the catalog grammar cannot hold ═══════════════
designb("DM-CON-REPEAT-01", "DM-CON-REPEAT", "confirm", "Asymptomatic: confirm with a repeat on a later day, same test preferred", "confirmRepeatSubsequentDay",
        {"rule": "REF-DM-DX-REPEAT-WHO", "fpg": "REF-DM-DX-FPG", "ogtt2h": "REF-DM-DX-OGTT2H", "hba1c": "REF-DM-DX-HBA1C"},
        ["obs.glucose", "obs.hba1c"], ["state", "proposal"], ["A2-04", "A2-05", "A11-55"], minTrust=3,
        note="Two diabetes-range results from different calendar days, each valid for diagnosis. Fills the catalog feature repeat_abnormal_result.")
designb("DM-CON-REPEAT-02", "DM-CON-REPEAT", "confirm", "ADA set only: two different abnormal tests from one sample confirm", "confirmSameSampleConcordance",
        {"rule": "REF-DM-DX-CONFIRM-ADA"}, ["obs.glucose", "obs.hba1c"], ["state", "proposal"], ["A3-02"], minTrust=3,
        note="Applies only when the criteria set in force is ADA-2026. Under WHO sets it is ignored.")
designb("DM-CON-REPEAT-03", "DM-CON-REPEAT", "confirm", "Symptoms plus one diabetes-range value: no repeat needed", "confirmSymptomaticSingle",
        {"random": "REF-DM-DX-RANDOM"}, ["obs.glucose", "sx.polyuria", "sx.polydipsia", "sx.weight_loss_unintended"], ["state", "proposal"], ["A3-03", "A2-02"], minTrust=2)
designb("DM-CON-VALID-01", "DM-CON-VALID", "confirm", "A glucose sample that waited uncentrifuged reads low: grade it, do not rule out on it", "glucoseSampleValidity",
        {"fall": "REF-DM-VAL-GLYCOLYSIS"}, ["obs.glucose"], ["flag", "data_gap"], ["A11-19", "A11-18"], minTrust=3,
        note="Reads the specimen and collection-to-analysis facts of MS-DATA-CFC-001 4.1. A delayed sample can support suspicion and cannot support screened_negative.")
designb("DM-CON-VALID-02", "DM-CON-VALID", "confirm", "Meter glucose: usable for diagnosis only where the site policy allows, and never for rule-out at the threshold", "meterDiagnosticPolicy",
        {"policy": "REF-DM-DX-POC-WHO", "accuracy": "REF-DM-VAL-METER"}, ["obs.glucose"], ["flag", "proposal"], ["A2-14", "A11-15", "A11-14"], minTrust=2,
        note="D-DM-04. A meter value within 15% of a threshold cannot settle either side of it: propose a laboratory test or a repeat.")
designb("DM-CON-VALID-03", "DM-CON-VALID", "confirm", "HbA1c: apply every validity caveat before it counts", "hba1cValidity",
        {"rule": "REF-DM-VAL-HBA1C-USE-GLUCOSE"}, ["obs.hba1c"], ["flag", "data_gap"], ["A3-10", "A11-26", "A10-64"], minTrust=3,
        note="Emits hba1c_unusable with its reason and direction. Runs the ValidityCaveat list; adds no logic of its own.")
designb("DM-CON-DISC-01", "DM-CON-DISC", "confirm", "Two tests disagree: repeat the one above its cut point", "discordantRepeatAbnormal",
        {"rule": "REF-DM-DX-DISCORDANT"}, ["obs.glucose", "obs.hba1c"], ["proposal"], ["A3-07"], minTrust=3)
designb("DM-CON-DISC-02", "DM-CON-DISC", "confirm", "A result just under the threshold: repeat in 3 to 6 months", "nearThresholdRepeat",
        {"min": "REF-DM-DX-NEAR-THRESHOLD-MIN", "max": "REF-DM-DX-NEAR-THRESHOLD-MAX"}, ["obs.glucose", "obs.hba1c"], ["proposal"], ["A3-08"], minTrust=3,
        note="How near is 'near' is not stated by ADA. Proposed: within the fasting glucose within-person variation (REF-DM-VAL-FPG-CV). D-DM-07.")
designb("DM-CON-DISC-03", "DM-CON-DISC", "confirm", "Fasting glucose in the WHO impaired range: an OGTT settles it", "ifgToOgtt",
        {"low": "REF-DM-IH-IFG-WHO", "high": "REF-DM-DX-FPG", "rule": "REF-DM-IH-OGTT-NEXT"}, ["obs.glucose"], ["proposal"], ["A2-12"], minTrust=3)
designb("DM-CON-GRADE-01", "DM-CON-CRIT", "confirm", "Grade a negative: 'full' needs a normal 2-hour OGTT; fasting glucose or HbA1c alone is 'limited'", "ruleOutGrade",
        {"evidence": "REF-DM-SUS-ONE-TEST-WEAK", "rescreen": "REF-DM-SUS-RESCREEN", "ifg": "REF-DM-IH-IFG-WHO", "igt": "REF-DM-IH-IGT"},
        ["obs.glucose", "obs.hba1c"], ["state"], ["A11-42", "A11-09", "A11-24"], minTrust=3,
        note="Invariant I2. No guideline states what excludes diabetes in a high-risk African adult; this grade is a MedSync rule for CSO signature (D-DM-06). A symptomatic person is never screened_negative on one test.")
designb("DM-SUS-INCID-WINDOW", "DM-SUS-INCID", "suspect", "A past glucose above the reference with no later test or diagnosis", "incidentalNoFollowUp",
        {"hospital": "REF-DM-SUS-HOSP-GLU", "random": "REF-DM-DX-RANDOM"}, ["obs.glucose", "obs.hba1c", "cond.diabetes"], ["state", "proposal"], ["A11-36", "A2-04"], minTrust=2,
        note="The look-back window and the 'no follow-up within N days' window are product parameters, not guideline numbers (D-DM-08).")
designb("DM-SUS-RISK-NEVER", "DM-SUS-RISK", "suspect", "Eligible by age and weight and never tested", "eligibleNeverTested",
        {"age": "REF-DM-SUS-AGE-WHO", "bmi": "REF-DM-SUS-BMI"}, ["derived.bmi", "obs.glucose", "obs.hba1c"], ["state", "proposal"], ["A2-21"], minTrust=2,
        note="'Never tested' is the absence of a fact. The catalog grammar cannot assert on absence, by design; the pack predicate can, because it reads the whole record.")
designb("DM-SUS-POP-ART-WINDOW", "DM-SUS-POP", "suspect", "ART started or switched 3 to 6 months ago with no glucose since", "artWindowGlucose",
        {"rule": "REF-DM-SUS-HIV-ADA", "uganda": "REF-DM-SUS-HIV-UG"}, ["obs.glucose", "med.art"], ["proposal"], ["A3-26"], minTrust=2,
        note="Restricted class hiv. The Uganda rule replaces the ADA one once its text is supplied.")
designb("DM-ACT-TEST-01", "DM-ACT-TEST", "act", "Next-best test: valid for this patient, available here, likely to settle it, least burden", "nextBestTest",
        {"hba1c_valid": "REF-DM-VAL-HBA1C-USE-GLUCOSE", "poc": "REF-DM-DX-POC-WHO", "weak_negative": "REF-DM-SUS-ONE-TEST-WEAK", "ifg_ogtt": "REF-DM-IH-OGTT-NEXT",
         "steroid": "REF-DM-SUS-STEROID", "pregnancy": "REF-DM-PREG-DIP"},
        ["obs.glucose", "obs.hba1c"], ["proposal"], ["A3-10", "A2-14", "A11-42", "A2-12", "A3-29", "A10-07"], minTrust=2,
        note="Order by context. Symptomatic: random glucose now. Asymptomatic with a laboratory: fasting plasma glucose; OGTT if it is 6.1 to 6.9 or if risk is high and fasting is normal. "
             "HbA1c only where no caveat holds. No laboratory: fasting meter glucose, repeated on another day. Pregnant: 75 g OGTT with three samples. On steroids: after a meal. "
             "The weights are for CSO signature (D-DM-09).")
