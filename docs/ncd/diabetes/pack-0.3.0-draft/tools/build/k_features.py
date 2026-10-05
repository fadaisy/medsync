"""Feature registry for the diabetes additions.

status
  reuse      seen verbatim in the briefing's excerpts of DIABETES_CATALOG v0.1.0
  reconcile  very likely exists already (the catalog has 343 features; only a
             sample was visible). Phase 0 maps it to the live code or adds it.
  new        proposed
"""
from lib import feat
from k_model import capability, section

MM, EG = "mmol/L", "mL/min/1.73m2"
YN = None

# ── capabilities (17 exist; these are additions) ────────────────────────────
for code, disp, tier in [
    ("device.glucometer", "Capillary glucose meter", "bedside"),
    ("device.monofilament", "10 g monofilament", "bedside"),
    ("device.doppler_abi", "Hand-held Doppler for ankle-brachial index", "specialist"),
    ("lab.glucose", "Laboratory plasma glucose", "basic_lab"),
    ("lab.hba1c", "HbA1c", "advanced_lab"),
    ("lab.ketones_blood", "Blood ketone (beta-hydroxybutyrate) meter", "bedside"),
    ("lab.ketones_urine", "Urine ketone strip", "bedside"),
    ("lab.blood_gas", "Venous or arterial blood gas", "advanced_lab"),
    ("lab.electrolytes", "Urea and electrolytes", "basic_lab"),
    ("lab.creatinine", "Serum creatinine", "basic_lab"),
    ("lab.urine_acr", "Urine albumin-to-creatinine ratio", "advanced_lab"),
    ("lab.urine_dipstick", "Urine reagent strip", "bedside"),
    ("imaging.fundus", "Retinal examination adequate for grading", "specialist"),
    ("lab.c_peptide", "C-peptide", "specialist"),
    ("lab.islet_autoantibodies", "Islet autoantibodies", "specialist"),
]:
    capability(code, disp, tier, status="reuse")
for code, disp, tier in [
    ("lab.ogtt", "75 g oral glucose tolerance test", "basic_lab"),
    ("lab.lipids", "Lipid profile", "basic_lab"),
    ("lab.vitamin_b12", "Vitamin B12", "advanced_lab"),
    ("device.tuning_fork_128", "128 Hz tuning fork", "bedside"),
    ("device.visual_acuity_chart", "Visual acuity chart with pinhole", "bedside"),
    ("device.ophthalmoscope", "Direct ophthalmoscope with dilating drops", "bedside"),
    ("device.bp_cuff_sizes", "Validated BP device with standard and large cuffs", "bedside"),
    ("imaging.plain_xray", "Plain X-ray", "imaging"),
    ("imaging.ultrasound", "Ultrasound", "imaging"),
    ("lab.urine_pcr", "Urine protein-to-creatinine ratio", "basic_lab"),
]:
    capability(code, disp, tier)

# ── sections (10 exist; these are additions) ────────────────────────────────
section("risk_context", "Who to test", 11, "Reasons to test a person who does not have known diabetes.",
        groups=[("rc_person", "The person"), ("rc_medicines", "Medicines"), ("rc_conditions", "Other conditions"), ("rc_pregnancy", "Pregnancy")])
section("classification", "Type of diabetes", 12, "What separates the types. Recorded, never inferred from build alone.")
section("control", "Control and targets", 13, "The measure, its date, and the target agreed with the patient.")
section("eye", "Eyes", 14, "Visual acuity, retinal view and grade.")
section("nerves", "Nerves", 15, "Sensation, reflexes and autonomic symptoms.")
section("cardiovascular", "Heart and vessels", 16, "Blood pressure, lipids, tobacco and cardiovascular risk.")
section("care_processes", "Checks due", 17, "When each routine check was last done.")
section("therapy_context", "Treatment context", 18, "What the person takes and what bears on its safety.")

S = lambda code, disp, kind, vt, sec, **k: feat(code, disp, kind, vt, sec, status="reuse", **k)
R = lambda code, disp, kind, vt, sec, **k: feat(code, disp, kind, vt, sec, status="reconcile", **k)
N = lambda code, disp, kind, vt, sec, **k: feat(code, disp, kind, vt, sec, status="new", **k)

# ── reuse: codes read in the briefing ───────────────────────────────────────
S("dm_status", "Diabetes status", "history", "single_select", "status", options=[("known", "Known diabetes")],
  x_note="Only the option 'known' was visible. Phase 0 lists the rest.")
for c, d in [("polyuria", "Passing large volumes of urine"), ("polydipsia", "Excessive thirst"), ("polyphagia", "Increased appetite"),
             ("unexplained_weight_loss", "Unexplained weight loss"), ("fatigue", "Tiredness"), ("slow_healing_wound", "Slow-healing wound"),
             ("vomiting", "Vomiting"), ("abdominal_pain", "Abdominal pain")]:
    S(c, d, "symptom", "boolean", "symptoms", cfc={"polyuria": "sx.polyuria", "polydipsia": "sx.polydipsia", "polyphagia": "sx.polyphagia",
      "unexplained_weight_loss": "sx.weight_loss_unintended", "fatigue": "sx.fatigue", "slow_healing_wound": "sx.slow_healing_wound",
      "vomiting": "sx.vomiting", "abdominal_pain": "sx.abdominal_pain"}[c])
S("capillary_glucose", "Capillary glucose", "investigation", "number", "glycaemia", unit=MM, requires="device.glucometer", cfc="obs.glucose")
S("random_pg", "Random plasma glucose", "investigation", "number", "glycaemia", unit=MM, requires="lab.glucose", cfc="obs.glucose")
S("hba1c", "HbA1c", "investigation", "number", "glycaemia", unit="%", requires="lab.hba1c", cfc="obs.hba1c")
S("bohb", "Blood beta-hydroxybutyrate", "investigation", "number", "acute", unit=MM, requires="lab.ketones_blood", cfc="obs.ketones_blood")
S("urine_ketones", "Urine ketones", "investigation", "single_select", "acute", requires="lab.ketones_urine", cfc="obs.ketones_urine",
  options=[("neg", "Negative"), ("trace", "Trace"), ("1plus", "1+"), ("2plus", "2+"), ("3plus", "3+")])
S("venous_ph", "Venous pH", "investigation", "number", "acute", unit="pH", requires="lab.blood_gas")
S("bicarbonate", "Bicarbonate", "investigation", "number", "acute", unit=MM, requires="lab.electrolytes", cfc="obs.bicarbonate")
S("sodium", "Sodium", "investigation", "number", "acute", unit=MM, requires="lab.electrolytes", cfc="obs.sodium")
S("urea", "Urea", "investigation", "number", "acute", unit=MM, requires="lab.electrolytes", cfc="obs.urea")
S("effective_osmolality", "Effective osmolality", "investigation", "number", "acute", unit="mOsm/kg", requires="lab.electrolytes")
S("mental_status", "Mental status", "sign", "single_select", "acute",
  options=[("alert", "Alert"), ("drowsy", "Drowsy"), ("stupor", "Stupor"), ("coma", "Coma")])
S("deep_rapid_breathing", "Deep, sighing rapid breathing (Kussmaul)", "sign", "boolean", "symptoms", cfc="sign.kussmaul_breathing")
S("acetone_breath", "Acetone on the breath", "sign", "boolean", "symptoms", cfc="sign.ketotic_breath")
S("dehydration", "Dehydration", "sign", "boolean", "symptoms", cfc="sign.dehydration")
S("egfr", "eGFR", "investigation", "number", "kidney", unit=EG, requires="lab.creatinine", cfc="derived.egfr")
S("urine_acr", "Urine albumin-to-creatinine ratio", "investigation", "number", "kidney", unit="mg/mmol", requires="lab.urine_acr", cfc="obs.uacr")
S("urine_protein_strip", "Urine protein (strip)", "investigation", "single_select", "kidney", requires="lab.urine_dipstick", cfc="obs.urine_protein_dipstick",
  options=[("neg", "Negative"), ("trace", "Trace"), ("1plus", "1+"), ("2plus", "2+"), ("3plus", "3+")])
S("kidney_abnormality_3_months", "The kidney abnormality has persisted for 3 months or more", "history", "boolean", "kidney")
S("glucose_lowering_therapy", "Glucose-lowering treatment", "history", "multi_select", "status",
  options=[("metformin", "Metformin"), ("glibenclamide", "Glibenclamide"), ("gliclazide", "Gliclazide"), ("glimepiride", "Glimepiride"),
           ("insulin", "Insulin"), ("sglt2_inhibitor", "SGLT2 inhibitor"), ("pioglitazone", "Pioglitazone"),
           ("dpp4_inhibitor", "DPP-4 inhibitor"), ("glp1_ra", "GLP-1 receptor agonist"), ("none", "None")],
  x_note="Only 'metformin' was visible as an option value. Phase 0 maps the others to the live option codes.")
S("hiv_on_art", "Living with HIV, on ART", "history", "boolean", "hba1c_validity", restricted="hiv")
S("art_regimen", "Regimen", "investigation", "single_select", "hba1c_validity", parent="hiv_on_art", restricted="hiv",
  options=[(v, v) for v in ["tdf_3tc_dtg", "taf_ftc_dtg", "tdf_3tc_efv", "abc_3tc_dtg", "abc_3tc_efv", "abc_3tc_lpvr", "azt_3tc_dtg",
                            "azt_3tc_efv", "azt_3tc_lpvr", "tdf_3tc_lpvr", "tdf_3tc_atvr", "other", "unknown"]])
for c, d in [("haemolysis", "Haemolysis"), ("malaria_current", "Current or recent malaria"), ("recent_transfusion", "Transfusion in the last 3 months")]:
    S(c, d, "history", "boolean", "hba1c_validity")
S("bp_systolic", "Blood pressure, systolic", "measurement", "series", "examination", unit="mmHg", cfc="obs.bp_systolic")
S("bp_diastolic", "Blood pressure, diastolic", "measurement", "series", "examination", unit="mmHg", cfc="obs.bp_diastolic")
S("pulse", "Pulse", "measurement", "series", "examination", unit="/min", cfc="obs.heart_rate")
S("respiratory_rate", "Respiratory rate", "measurement", "series", "examination", unit="/min", cfc="obs.resp_rate")
S("temperature", "Temperature", "measurement", "series", "examination", unit="Cel", cfc="obs.temperature")
S("weight_kg", "Weight", "measurement", "number", "examination", unit="kg", cfc="obs.weight")
S("height_cm", "Height", "measurement", "number", "examination", unit="cm", cfc="obs.height")
S("waist_cm", "Waist", "measurement", "number", "examination", unit="cm", cfc="obs.waist")
S("bmi", "Body mass index", "measurement", "number", "examination", unit="kg/m2", cfc="derived.bmi", computed={"formula": "bmi", "from": ["weight_kg", "height_cm"]})
S("pedal_pulses", "Foot pulses", "sign", "single_select", "foot", cfc="exam.pedal_pulses",
  options=[("both", "Both felt"), ("reduced", "Reduced"), ("absent", "Absent")])
S("monofilament_10g", "10 g monofilament", "sign", "single_select", "foot", requires="device.monofilament", cfc="exam.monofilament",
  options=[("none", "Felt at every site on both feet"), ("one_foot", "Not felt, one foot"), ("both_feet", "Not felt, both feet")])
S("retinopathy_stage", "Retinopathy grade (worse eye)", "sign", "single_select", "examination", requires="imaging.fundus", cfc="exam.retinopathy_grade",
  options=[("none", "No apparent retinopathy"), ("mild_npdr", "Mild non-proliferative"), ("moderate_npdr", "Moderate non-proliferative"),
           ("severe_npdr", "Severe non-proliferative"), ("pdr", "Proliferative")])
S("foot_deformity", "Foot deformity", "sign", "boolean", "foot", cfc="sign.foot_deformity")
S("active_foot_ulcer", "Active foot ulcer", "sign", "boolean", "foot", cfc="sign.foot_ulcer")
S("foot_infection_grade", "Foot infection", "sign", "single_select", "foot", cfc="sign.foot_infection",
  options=[("none", "None"), ("mild", "Mild"), ("moderate", "Moderate"), ("severe", "Severe")])
S("acanthosis_nigricans", "Acanthosis nigricans", "sign", "boolean", "examination", cfc="sign.acanthosis_nigricans")
S("peripheral_oedema", "Peripheral oedema", "sign", "boolean", "examination", cfc="sign.oedema")

# ── reconcile: almost certainly present under this or another code ─────────
R("age_years", "Age", "history", "number", "status", unit="years", x_note="The catalog selects age bands from date of birth; confirm a numeric age is available to predicates.")
R("sex", "Sex", "history", "single_select", "status", options=[("female", "Female"), ("male", "Male")])
R("pregnant", "Pregnant", "history", "boolean", "risk_context", group="rc_pregnancy")
R("gestation_weeks", "Gestation", "history", "number", "risk_context", unit="weeks", group="rc_pregnancy", parent="pregnant")
R("fasting_pg", "Fasting plasma glucose", "investigation", "number", "glycaemia", unit=MM, requires="lab.glucose", cfc="obs.glucose")
R("ogtt_2h_pg", "2-hour plasma glucose (75 g OGTT)", "investigation", "number", "glycaemia", unit=MM, requires="lab.ogtt", cfc="obs.glucose")
R("ogtt_1h_pg", "1-hour plasma glucose (75 g OGTT)", "investigation", "number", "glycaemia", unit=MM, requires="lab.ogtt", cfc="obs.glucose")
R("capillary_glucose_context", "When was it taken", "investigation", "single_select", "glycaemia", parent="capillary_glucose",
  options=[("random", "Random"), ("fasting", "Fasting"), ("two_hours_after_glucose", "2 hours after 75 g glucose"), ("two_hours_after_food", "2 hours after food")])
R("repeat_abnormal_result", "A second result in the diabetes range, on a later day", "investigation", "boolean", "glycaemia",
  x_note="The live WHO set already encodes the repeat as a predicate; map this to that feature.")
R("blurred_vision", "Blurred vision", "symptom", "boolean", "symptoms", cfc="sx.vision_change")
R("recurrent_infections", "Recurrent infections (skin, urine, thrush)", "symptom", "boolean", "symptoms")
R("foot_numbness_burning", "Numbness, burning or tingling in the feet", "symptom", "boolean", "symptoms", cfc="sx.foot_numbness_burning")
R("sudden_vision_loss", "Sudden loss or deterioration of vision", "symptom", "boolean", "symptoms")
R("chest_pain_or_stroke_symptoms", "Chest pain, or sudden weakness, speech or facial change", "symptom", "boolean", "symptoms")
R("orthostatic_dizziness", "Dizziness or faintness on standing", "symptom", "boolean", "symptoms")
R("acute_illness_current", "Acutely unwell now (infection, vomiting, not eating)", "history", "boolean", "precipitants")
R("first_degree_relative_diabetes", "Parent, brother, sister or child with diabetes", "history", "boolean", "history")
R("hypertension_known", "Known hypertension or on treatment for it", "history", "boolean", "history")
R("smoking_current", "Currently uses tobacco", "history", "boolean", "history", cfc="soc.tobacco")
R("age_at_diagnosis", "Age when diabetes was diagnosed", "history", "number", "status", unit="years")
R("years_since_diagnosis", "Years since diagnosis", "history", "number", "status", unit="years")
R("ketosis_at_presentation", "Ketosis or ketoacidosis at first presentation", "history", "boolean", "classification")
R("c_peptide", "C-peptide (random, with glucose)", "investigation", "number", "classification", unit="pmol/L", requires="lab.c_peptide")
R("islet_autoantibodies", "Islet autoantibodies", "investigation", "single_select", "classification", requires="lab.islet_autoantibodies",
  options=[("positive", "Positive"), ("negative", "Negative")])
R("sickle_cell_disease", "Sickle cell disease (HbSS, HbSC)", "history", "boolean", "hba1c_validity")
R("sickle_cell_trait", "Sickle cell trait or another haemoglobin variant", "history", "boolean", "hba1c_validity")
R("iron_deficiency", "Iron deficiency", "history", "boolean", "hba1c_validity")
R("on_dialysis", "On dialysis", "history", "boolean", "hba1c_validity")
R("previous_foot_ulcer", "Previous foot ulcer", "history", "boolean", "foot")
R("previous_amputation", "Previous lower-limb amputation", "history", "boolean", "foot")
R("end_stage_kidney_disease", "End-stage kidney disease or dialysis", "history", "boolean", "foot")
R("vibration_128hz", "Vibration (128 Hz), great toe", "sign", "single_select", "foot", requires="device.tuning_fork_128",
  options=[("present", "Felt, both feet"), ("absent_one", "Not felt, one foot"), ("absent_both", "Not felt, both feet")])
R("ipswich_sites_missed", "Ipswich touch test: sites not felt (of 6)", "sign", "number", "foot", unit="sites")
R("foot_hot_swollen", "Foot warmer, swollen or red compared with the other, skin intact", "sign", "boolean", "foot")
R("foot_gangrene", "Gangrene", "sign", "boolean", "foot")
R("potassium", "Potassium", "investigation", "number", "kidney", unit=MM, requires="lab.electrolytes", cfc="obs.potassium")
R("haematuria_strip", "Blood on urine strip", "investigation", "boolean", "kidney", requires="lab.urine_dipstick")
R("total_cholesterol", "Total cholesterol", "investigation", "number", "cardiovascular", unit=MM, requires="lab.lipids")
R("ldl_cholesterol", "LDL cholesterol", "investigation", "number", "cardiovascular", unit=MM, requires="lab.lipids", cfc="obs.chol_ldl")
R("triglycerides", "Triglycerides", "investigation", "number", "cardiovascular", unit=MM, requires="lab.lipids", cfc="obs.triglycerides")
R("heart_failure_known", "Known heart failure", "history", "boolean", "history")
R("cough_over_2_weeks", "Cough for more than 2 weeks", "symptom", "boolean", "symptoms", restricted="tb")
R("injection_site_lumps", "Lumps at injection sites (lipohypertrophy)", "sign", "boolean", "examination")
R("alcohol_harmful", "Harmful alcohol use", "history", "boolean", "history", cfc="soc.alcohol_pattern")

# ── new: who to test ────────────────────────────────────────────────────────
N("care_setting", "Where the patient is being seen", "history", "single_select", "risk_context", group="rc_person",
  options=[("outpatient", "Outpatient"), ("emergency", "Emergency"), ("inpatient", "Inpatient")])
N("prior_gdm", "Gestational diabetes in a previous pregnancy", "history", "boolean", "risk_context", group="rc_pregnancy")
N("postpartum_weeks", "Weeks since the birth", "history", "number", "risk_context", unit="weeks", group="rc_pregnancy", parent="prior_gdm")
N("prior_intermediate_hyperglycaemia", "Previously told blood sugar was borderline", "history", "boolean", "risk_context", group="rc_person")
N("months_since_glucose_test", "Months since the last glucose or HbA1c test", "history", "number", "risk_context", unit="months", group="rc_person",
  x_computed="months_since", x_note="Needs the formula registry extended (schema change S-DM-05).")
N("on_glucocorticoid", "On recurrent or long-term systemic steroids", "history", "boolean", "risk_context", group="rc_medicines")
N("on_second_gen_antipsychotic", "On a second-generation antipsychotic", "history", "boolean", "risk_context", group="rc_medicines", restricted="mental_health")
N("weeks_since_antipsychotic_start", "Weeks since it was started", "history", "number", "risk_context", unit="weeks", parent="on_second_gen_antipsychotic", restricted="mental_health")
N("months_since_art_start_or_switch", "Months since ART was started or switched", "history", "number", "risk_context", unit="months", group="rc_medicines", parent="hiv_on_art", restricted="hiv")
N("tb_current", "On treatment for TB, or newly diagnosed", "history", "boolean", "risk_context", group="rc_conditions", restricted="tb")
N("pancreatitis_history", "Pancreatitis", "history", "single_select", "risk_context", group="rc_conditions",
  options=[("none", "None"), ("acute", "Acute pancreatitis in the past"), ("chronic", "Chronic pancreatitis")])
N("cvd_established", "Heart attack, angina, stroke, TIA, or peripheral artery disease", "history", "boolean", "cardiovascular", claim_id="A5-41")
N("pcos", "Polycystic ovary syndrome", "history", "boolean", "risk_context", group="rc_conditions")
N("physically_inactive", "Physically inactive", "history", "boolean", "risk_context", group="rc_person")
N("secondary_enuresis", "Bed-wetting in a child who was previously dry", "symptom", "boolean", "symptoms", ageBands=["child", "adolescent"])

# ── new: validity ───────────────────────────────────────────────────────────
N("g6pd_deficiency", "G6PD deficiency", "history", "boolean", "hba1c_validity")
N("b12_deficiency", "Vitamin B12 deficiency", "history", "boolean", "hba1c_validity")
N("on_dapsone", "On dapsone", "history", "boolean", "hba1c_validity")
N("on_iron_b12_or_epo", "On iron, vitamin B12 or erythropoietin treatment", "history", "boolean", "hba1c_validity")
N("splenomegaly", "Enlarged spleen", "sign", "boolean", "hba1c_validity")
N("uacr_transient_cause", "Exercise in the last 24 hours, fever, infection, menstruation, or very high glucose or blood pressure", "history", "boolean", "kidney")
N("creatinine_unstable", "Creatinine not in steady state (acute kidney injury or hyperglycaemic crisis)", "history", "boolean", "kidney")
N("fundus_method", "How the retina was examined", "sign", "single_select", "eye",
  options=[("photograph", "Retinal photograph"), ("dilated_ophthalmoscopy", "Ophthalmoscopy, pupils dilated"),
           ("undilated_ophthalmoscopy", "Direct ophthalmoscopy, pupils not dilated"), ("slit_lamp", "Slit-lamp biomicroscopy")])

# ── new: classification ─────────────────────────────────────────────────────
N("insulin_stopped_without_relapse", "Came off insulin after the first illness and stayed well", "history", "boolean", "classification")
N("parent_with_diabetes", "A parent has diabetes", "history", "boolean", "classification")
N("childhood_undernutrition", "Undernutrition in childhood", "history", "boolean", "classification")
N("steatorrhoea", "Pale, fatty stools", "symptom", "boolean", "classification")
N("recurrent_abdominal_pain", "Recurrent upper abdominal pain", "symptom", "boolean", "classification")
N("pancreatic_calcification", "Pancreatic calcification on X-ray or ultrasound", "investigation", "boolean", "classification", requires="imaging.plain_xray")
N("glucose_at_presentation", "Glucose at first presentation", "investigation", "number", "classification", unit=MM)
N("months_off_glucose_lowering", "Months off all glucose-lowering medicines", "history", "number", "classification", unit="months")

# ── new: control ────────────────────────────────────────────────────────────
N("postprandial_pg", "Glucose 2 hours after a meal", "investigation", "number", "control", unit=MM, requires="device.glucometer", cfc="obs.glucose")
N("glycaemic_target_tier", "Target agreed with the patient", "history", "single_select", "control",
  options=[("general", "General"), ("relaxed", "Relaxed"), ("tight", "Tight"), ("avoid_symptoms", "Avoid lows and symptoms only")],
  x_note="Clinician-owned. The engine proposes a tier; only an accepted tier is read by a rule.")
N("months_since_hba1c", "Months since the last HbA1c", "history", "number", "care_processes", unit="months", x_computed="months_since")
N("months_since_any_control_measure", "Months since the last HbA1c or fasting glucose", "history", "number", "care_processes", unit="months", x_computed="months_since")
N("therapy_changed_recently", "Treatment changed since the last measure", "history", "boolean", "control")
N("hypo_worst_12m", "Low blood sugar in the last 12 months", "history", "single_select", "control",
  options=[("none", "None"), ("self_treated", "Yes, treated it myself"), ("needed_help", "Yes, needed someone's help")])
N("hypo_awareness_score", "Awareness of lows (Gold score, 1 to 7)", "history", "number", "control", unit="score")
N("frailty_or_limited_life_expectancy", "Frailty, serious comorbidity or limited life expectancy", "history", "boolean", "control")
N("cognitive_impairment", "Cognitive impairment or dementia", "history", "boolean", "control")
N("food_insecurity", "Not always enough food at home", "history", "boolean", "control")

# ── new: kidney ─────────────────────────────────────────────────────────────
N("uacr_abnormal_count", "Abnormal ACR results out of the last 3 (within 6 months)", "investigation", "number", "kidney", unit="results")
N("egfr_fall_percent", "Fall in eGFR from baseline", "investigation", "number", "kidney", unit="%")
N("creatinine_rise_percent_4w", "Rise in creatinine within 4 weeks of starting or increasing an ACE inhibitor or ARB", "investigation", "number", "kidney", unit="%")
N("nephrotic_or_active_sediment", "Nephrotic picture, or red cell casts on microscopy", "investigation", "boolean", "kidney")
N("months_since_kidney_screen", "Months since urine albumin and creatinine were last checked", "history", "number", "care_processes", unit="months", x_computed="months_since")

# ── new: eye ────────────────────────────────────────────────────────────────
N("macular_oedema", "Macular oedema", "sign", "single_select", "eye", requires="imaging.fundus",
  options=[("none", "None"), ("non_centre", "Present, not involving the centre"), ("centre_involving", "Present, involving the centre")])
N("visual_acuity_worse_6_12", "Visual acuity worse than 6/12 in either eye (with pinhole)", "sign", "boolean", "eye", requires="device.visual_acuity_chart")
N("retina_view", "Retinal view", "sign", "single_select", "eye",
  options=[("adequate", "Adequate to grade"), ("inadequate", "Inadequate"), ("not_attempted", "Not attempted")])
N("months_since_eye_screen", "Months since the last retinal examination", "history", "number", "care_processes", unit="months", x_computed="months_since")

# ── new: nerves ─────────────────────────────────────────────────────────────
N("pinprick_feet", "Pinprick sensation in the feet", "sign", "single_select", "nerves", options=[("normal", "Normal"), ("reduced", "Reduced or absent")])
N("ankle_reflexes", "Ankle reflexes", "sign", "single_select", "nerves", options=[("present", "Present"), ("reduced_or_absent", "Reduced or absent")])
N("neuropathy_atypical", "Sudden onset, one-sided, or any weakness", "sign", "boolean", "nerves")
N("postural_sbp_fall", "Fall in systolic pressure on standing", "measurement", "number", "nerves", unit="mmHg")
N("postural_dbp_fall", "Fall in diastolic pressure on standing", "measurement", "number", "nerves", unit="mmHg")
N("autonomic_symptoms", "Fainting, bowel or bladder change, or altered sweating", "symptom", "boolean", "nerves")
N("months_since_neuropathy_screen", "Months since sensation was last tested", "history", "number", "care_processes", unit="months", x_computed="months_since")

# ── new: foot ───────────────────────────────────────────────────────────────
N("abi", "Ankle-brachial index", "investigation", "number", "foot", unit="ratio", requires="device.doppler_abi")
N("months_since_foot_risk_assessment", "Months since the last foot risk assessment", "history", "number", "care_processes", unit="months", x_computed="months_since")
N("ulcer_area_reduction_4w", "Ulcer area reduction over 4 weeks", "sign", "number", "foot", unit="%", parent="active_foot_ulcer")

# ── new: cardiovascular ─────────────────────────────────────────────────────
N("bp_raised_two_occasions", "Blood pressure raised on two or more occasions", "history", "boolean", "cardiovascular")
N("bp_medicines_count", "Number of blood pressure medicines", "history", "number", "cardiovascular", unit="medicines")
N("on_statin", "On a statin", "history", "boolean", "cardiovascular")
N("ras_blocker", "ACE inhibitor or ARB", "history", "single_select", "cardiovascular",
  options=[("none", "Neither"), ("acei", "ACE inhibitor"), ("arb", "ARB"), ("both", "Both")])
N("who_cvd_risk_percent", "WHO 10-year cardiovascular risk", "measurement", "number", "cardiovascular", unit="%",
  x_computed="who_cvd_2019_essa", x_note="A chart lookup, not arithmetic (schema change S-DM-03). Import WHO's published chart values; never hand-type them.")
N("who_cvd_chart_used", "Chart used", "measurement", "single_select", "cardiovascular", options=[("laboratory", "Laboratory"), ("non_laboratory", "Non-laboratory")])
N("months_since_lipids", "Months since the last lipid profile", "history", "number", "care_processes", unit="months", x_computed="months_since")
N("overt_nephropathy", "Overt diabetic kidney disease", "history", "boolean", "cardiovascular", x_note="Derived from the kidney complication once clinician-confirmed.")

# ── new: therapy context ────────────────────────────────────────────────────
N("on_rifampicin", "On rifampicin", "history", "boolean", "therapy_context", restricted="tb")
N("surgery_or_fasting_planned", "Surgery or a prolonged fast planned", "history", "boolean", "therapy_context")
N("could_conceive", "Could become pregnant", "history", "boolean", "therapy_context", restricted="sexual_reproductive_health")
N("fasting_ramadan_planned", "Plans to fast for Ramadan", "history", "boolean", "therapy_context")
N("glucose_goal_unmet_on_oral", "Above target at review despite taking the tablets", "history", "boolean", "therapy_context",
  x_note="Clinician-recorded: the engine cannot judge adherence.")
N("meals_irregular", "Skips meals or does heavy physical work", "history", "boolean", "therapy_context")
N("months_since_dental", "Months since the last dental check", "history", "number", "care_processes", unit="months", x_computed="months_since")

N("on_insulin_or_sulfonylurea", "On insulin or a sulfonylurea", "history", "boolean", "therapy_context",
  x_computed="any_selected", x_note="True when glucose_lowering_therapy includes insulin, glibenclamide, gliclazide or glimepiride. Needs a computed any-of formula (S-DM-05); until then the clinician ticks it.")
N("non_diabetic_kidney_clue", "Rapidly rising albumin, nephrotic picture or red cell casts", "investigation", "boolean", "kidney")
N("ogtt_normal", "75 g OGTT within the normal range", "investigation", "boolean", "glycaemia", requires="lab.ogtt", x_note="Read by Design B's rule-out grade only.")

R("dm_type_recorded", "Type of diabetes, as recorded by a clinician", "history", "single_select", "status",
  options=[("type_1", "Type 1"), ("type_2", "Type 2"), ("unclassified", "Not yet classified"), ("gestational", "Gestational"), ("other", "Other specific type")],
  x_note="Clinician-owned. No treatment-review step fires on 'unclassified'.")
