"""Patients for the fourth review's fixes (J01 to J25). Every patient is synthetic."""
from k_vignettes import V, VIGNETTES, DISTRICT  # noqa: F401  (DISTRICT used by the evaluator)

M = {"sex": "male"}
F_NOT = {"sex": "female", "pregnancy_possible": False}

# DMV-63: one interrupt per event (J09). DMV-71: a dark step is not 'withheld' (J16).
_v = next(v for v in VIGNETTES if v["id"] == "DMV-63")
_v["expect"] = {"fires": ["DM-ACU-ROUTE-06"], "silent": ["DM-ACU-ROUTE-07"], "urgency": {"DM-ACU-ROUTE-06": "immediate"}, "bands": {"ppg_control_who": "low"}, "something_fires": True}
_v = next(v for v in VIGNETTES if v["id"] == "DMV-71")
_v["expect"] = {"withheld": ["tgt_hba1c_general"], "no_targets": True, "silent": ["DM-ACT-RX-02"]}

# DMV-40: a child with type 1, vomiting and a glucose of 3.1 is a hypoglycaemia interrupt (rule 07) and a ketone check (rule 23), not 'suspected
# ketoacidosis' on the diagnosis alone (J06). DMV-41: a 2.6 now interrupts once, through rule 06 (J09).
_v = next(v for v in VIGNETTES if v["id"] == "DMV-40")
_v["expect"]["fires"] = ["DM-ACU-ROUTE-07", "DM-ACU-ROUTE-23", "hypoglycaemia_needing_help_on_treatment"]; _v["expect"]["silent"] = ["DM-ACU-ROUTE-04"]
_v = next(v for v in VIGNETTES if v["id"] == "DMV-41")
_v["expect"]["fires"] = [k for k in _v["expect"]["fires"] if k != "DM-ACU-ROUTE-07"]; _v["expect"]["silent"] = ["DM-ACU-ROUTE-07"]

VIGNETTES += [
V("DMV-84", "Known type 1, deep sighing breathing and acetone on the breath, no glucose yet", ["acute routing", "review J01"],
  {"age_years": 28, **M, "dm_status": "known", "dm_type_recorded": "type_1", "glucose_lowering_therapy": ["insulin"], "deep_rapid_breathing": True, "acetone_breath": True},
  {"fires": ["DM-ACU-ROUTE-24"], "urgency": {"DM-ACU-ROUTE-24": "immediate"}, "something_fires": True}, established=True),
V("DMV-85", "Thin 22-year-old with thirst, polyuria and weight loss; an HbA1c of 5.6% on record", ["suspicion", "review J02"],
  {"age_years": 22, **F_NOT, "polyuria": True, "polydipsia": True, "unexplained_weight_loss": True, "hba1c": 5.6},
  {"fires": ["DM-SUS-SYMP-01"], "something_fires": True}),
V("DMV-86", "Type 1, glucose 22, vomiting, blood ketones 2.4", ["acute routing", "review J03"],
  {"age_years": 31, **M, "dm_status": "known", "dm_type_recorded": "type_1", "glucose_lowering_therapy": ["insulin"], "capillary_glucose": 22.0, "vomiting": True, "bohb": 2.4},
  {"fires": ["DM-ACU-ROUTE-22"], "urgency": {"DM-ACU-ROUTE-22": "urgent"}, "silent": ["DM-ACU-ROUTE-21", "DM-ACU-ROUTE-02"]}, established=True),
V("DMV-87", "Type 2 on metformin, glucose 25, vomiting, urine ketones 1+", ["acute routing", "review J03"],
  {"age_years": 56, **M, "dm_status": "known", "dm_type_recorded": "type_2", "glucose_lowering_therapy": ["metformin"], "capillary_glucose": 25.0, "vomiting": True, "urine_ketones": "1plus"},
  {"fires": ["DM-ACU-ROUTE-21"], "urgency": {"DM-ACU-ROUTE-21": "same_day"}}, established=True),
V("DMV-88", "On an SGLT2 inhibitor: vomiting and abdominal pain, glucose 9, urine ketones trace", ["acute routing", "review J03"],
  {"age_years": 60, **M, "dm_status": "known", "dm_type_recorded": "type_2", "glucose_lowering_therapy": ["metformin", "sglt2_inhibitor"], "capillary_glucose": 9.0,
   "vomiting": True, "abdominal_pain": True, "urine_ketones": "trace"},
  {"fires": ["DM-ACU-ROUTE-21", "sglt2_during_acute_illness"]}, established=True),
V("DMV-89", "Type 1, vomiting, glucose 7, no ketone result", ["acute routing", "review J03"],
  {"age_years": 24, **M, "dm_status": "known", "dm_type_recorded": "type_1", "glucose_lowering_therapy": ["insulin"], "vomiting": True, "capillary_glucose": 7.0},
  {"fires": ["DM-ACU-ROUTE-23"], "urgency": {"DM-ACU-ROUTE-23": "same_day"}}, established=True),
V("DMV-90", "Woman of 50, diabetes found today, eGFR 20, BP 230/130 with symptoms; pregnancy never asked", ["referral", "pregnancy unknown", "review J04"],
  {"age_years": 50, "sex": "female", "polyuria": True, "random_pg": 16.0, "egfr": 20, "bp_systolic": 230, "bp_diastolic": 130, "hypertensive_symptoms": True},
  {"fires": ["DM-ACT-REFER-EGFR-01", "DM-ACT-REFER-BP-01"], "something_fires": True}),
V("DMV-91", "12-year-old with known type 1 on insulin at a routine visit, meter 14", ["paediatric", "review J05"],
  {"age_years": 12, **M, "dm_status": "known", "dm_type_recorded": "type_1", "glucose_lowering_therapy": ["insulin"], "capillary_glucose": 14.0},
  {"silent": ["DM-SUS-PAED-03", "DM-ACU-ROUTE-04"]}, established=True, age_band="adolescent"),
V("DMV-92", "10-year-old with type 1: abdominal pain, glucose 6, blood ketones 0.3", ["paediatric", "review J06"],
  {"age_years": 10, **M, "dm_status": "known", "dm_type_recorded": "type_1", "glucose_lowering_therapy": ["insulin"], "abdominal_pain": True, "capillary_glucose": 6.0, "bohb": 0.3},
  {"silent": ["DM-ACU-ROUTE-04", "DM-ACU-ROUTE-25", "DM-ACU-ROUTE-23"]}, established=True, age_band="adolescent"),
V("DMV-93", "No diabetes (normal fasting glucose): a foot ulcer and a hot swollen foot", ["referral scope", "review J07"],
  {"age_years": 45, **M, "polyuria": False, "polydipsia": False, "unexplained_weight_loss": False, "fasting_pg": 5.0, "active_foot_ulcer": True, "foot_hot_swollen": True},
  {"silent": ["DM-ACT-REFER-FOOT-02", "DM-ACT-REFER-CHARCOT-01"]}),
V("DMV-94", "Type 2 on metformin only, fasting glucose 3.8", ["hypoglycaemia", "review J08"],
  {"age_years": 58, **M, "dm_status": "known", "dm_type_recorded": "type_2", "glucose_lowering_therapy": ["metformin"], "fasting_pg": 3.8},
  {"fires": ["DM-ACU-ROUTE-26"], "silent": ["DM-ACU-ROUTE-07"], "urgency": {"DM-ACU-ROUTE-26": "same_day"}}, established=True),
V("DMV-95", "Frail 80-year-old on gliclazide, eGFR 22, HbA1c 6.5%", ["less treatment", "caveat", "review J11"],
  {"age_years": 80, **M, "dm_status": "known", "dm_type_recorded": "type_2", "glucose_lowering_therapy": ["gliclazide"], "frailty_or_limited_life_expectancy": True, "egfr": 22, "hba1c": 6.5},
  {"fires": ["DM-ACT-RX-11"]}, established=True, age_band="older_adult"),
V("DMV-96", "70-year-old, relaxed target agreed, HbA1c 7.6%", ["targets", "review J12"],
  {"age_years": 70, **M, "dm_status": "known", "dm_type_recorded": "type_2", "glucose_lowering_therapy": ["metformin"], "glycaemic_target_tier": "relaxed", "hba1c": 7.6, "egfr": 80},
  {"targets_absent": ["tgt_hba1c_general", "tgt_hba1c_older_healthy"], "bands": {"hba1c_control_relaxed": "at_target"}}, established=True, age_band="older_adult"),
V("DMV-97", "Type 2 on metformin, glucose 25, urine ketones negative; the 'not improving on tablets' box blank", ["referral", "review J14"],
  {"age_years": 52, **M, "dm_status": "known", "dm_type_recorded": "type_2", "glucose_lowering_therapy": ["metformin"], "capillary_glucose": 25.0, "urine_ketones": "neg"},
  {"fires": ["DM-ACT-REFER-GLU-02"], "urgency": {"DM-ACT-REFER-GLU-02": "same_day"}}, established=True),
V("DMV-98", "30 weeks pregnant with gestational diabetes, BP 165/105", ["pregnancy", "review J15"],
  {"age_years": 29, "sex": "female", "pregnant": True, "gestation_weeks": 30, "bp_systolic": 165, "bp_diastolic": 105},
  {"fires": ["DM-ACU-ROUTE-28"], "silent": ["DM-ACU-ROUTE-27"], "urgency": {"DM-ACU-ROUTE-28": "immediate"}}),
V("DMV-99", "District: fasting meter 6.4, no symptoms", ["district", "intermediate", "review J17"],
  {"age_years": 47, **M, "capillary_glucose": 6.4, "capillary_glucose_context": "fasting", "polyuria": False, "polydipsia": False, "unexplained_weight_loss": False},
  {"fires": ["DM-SUS-INCID-04"]}, site="district"),
V("DMV-100", "Known type 2: BP 230/130 and drowsy", ["acute routing", "review J18"],
  {"age_years": 66, **M, "dm_status": "known", "dm_type_recorded": "type_2", "glucose_lowering_therapy": ["metformin"], "bp_systolic": 230, "bp_diastolic": 130, "mental_status": "drowsy"},
  {"fires": ["DM-ACU-ROUTE-29"], "urgency": {"DM-ACU-ROUTE-29": "immediate"}}, established=True, age_band="older_adult"),
]
