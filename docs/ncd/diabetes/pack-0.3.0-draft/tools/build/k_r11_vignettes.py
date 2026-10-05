"""Patients for round R11 (W01 to W23), and the expectations the fixes change on purpose."""
from k_vignettes import V, VIGNETTES

_by = {v["id"]: v for v in VIGNETTES}
for _vid in ("DMV-07", "DMV-13"):      # W10: a laboratory HbA1c is now named (a point-of-care one diagnoses in no set)
    _by[_vid]["values"]["hba1c_point_of_care"] = False
_by["DMV-176"]["values"]["gestation_weeks"] = 14      # W15: aspirin from 12 to 16 weeks
_by["DMV-176"]["title"] = "Pregnant 14 weeks with type 2 diabetes"
_by["DMV-184"]["expect"]["fires"] = ["DM-ACT-RX-08", "DM-ACT-RX-06"]; _by["DMV-184"]["expect"]["silent"] = ["DM-ACT-RX-06C"]      # W21
_by["DMV-194"]["values"].pop("months_since_b12", None); _by["DMV-194"]["values"]["never_b12"] = True      # W16

M = {"sex": "male"}; F = {"sex": "female"}
T1 = {"dm_status": "known", "dm_type_recorded": "type_1", "glucose_lowering_therapy": ["insulin"]}
T2M = {"dm_status": "known", "dm_type_recorded": "type_2", "glucose_lowering_therapy": ["metformin"]}
VIGNETTES += [
V("DMV-198", "Type 1 on insulin, vomiting and dehydrated, glucose 5.0, blood ketones 0.3", ["W01", "sick day"],
  {"age_years": 30, **M, **T1, "vomiting": True, "dehydration": True, "capillary_glucose": 5.0, "bohb": 0.3},
  {"fires": ["DM-ACU-ROUTE-23R"], "urgency": {"DM-ACU-ROUTE-23R": "same_day"}}, established=True),
V("DMV-199", "Type 2 on gliclazide, tight tier agreed, HbA1c 6.8%", ["W02"],
  {"age_years": 40, **M, "dm_status": "known", "dm_type_recorded": "type_2", "glucose_lowering_therapy": ["gliclazide"], "glycaemic_target_tier": "tight", "hba1c": 6.8},
  {"targets": ["tgt_hba1c_general"], "targets_absent": ["tgt_hba1c_tight"]}, established=True),
V("DMV-200", "80, frail, on gliclazide, 'avoid symptoms' agreed", ["W03"],
  {"age_years": 80, **M, "dm_status": "known", "dm_type_recorded": "type_2", "glucose_lowering_therapy": ["gliclazide"], "frailty_or_limited_life_expectancy": True,
   "glycaemic_target_tier": "avoid_symptoms"}, {"targets_absent": ["tgt_hba1c_elderly_2026"]}, established=True, age_band="older_adult"),
V("DMV-201", "70 on gliclazide, fasting meter 4.1 at a district site", ["W04", "district"],
  {"age_years": 70, **M, "dm_status": "known", "dm_type_recorded": "type_2", "glucose_lowering_therapy": ["gliclazide"], "capillary_glucose": 4.1,
   "capillary_glucose_context": "fasting"}, {"fires": ["DM-ACT-RX-14M"], "bands_absent": ["fcap_control_who"]}, site="district", established=True, age_band="older_adult"),
V("DMV-202", "Pregnant 28 weeks, fasting 5.8: gestational diabetes, no prediabetes advice", ["W05"],
  {"age_years": 28, **F, "pregnant": True, "gestation_weeks": 28, "fasting_pg": 5.8}, {"silent": ["DM-ACT-EDU-10B"]}),
V("DMV-203", "8-year-old with type 1, urine ketones 2+, meter 25, district", ["W06", "paediatric"],
  {"age_years": 8, **M, **T1, "urine_ketones": "2plus", "capillary_glucose": 25.0},
  {"fires": ["DM-ACU-ROUTE-02P"], "silent": ["DM-ACU-ROUTE-02"]}, site="district", established=True, age_band="child"),
V("DMV-204", "Woman 30, type 2 on metformin, vomiting, glucose 9, pregnancy not asked", ["W07"],
  {"age_years": 30, **F, **T2M, "vomiting": True, "capillary_glucose": 9.0}, {"fires": ["DM-ACU-ROUTE-35"]}, established=True),
V("DMV-205", "Prediabetes before and gestational diabetes in a past pregnancy", ["W08", "restricted"],
  {"age_years": 33, **F, "pregnant": False, "prior_intermediate_hyperglycaemia": True, "prior_gdm": True}, {"restricted": ["sexual_reproductive_health"]}),
V("DMV-206", "Polyuria, fasting 7.4: diagnosed; nothing asks to confirm", ["W11"],
  {"age_years": 45, **M, "polyuria": True, "fasting_pg": 7.4}, {"silent": ["DM-SUS-INCID-02"]}),
V("DMV-207", "Pregnant, gestation not recorded, nothing tested", ["W12"],
  {"age_years": 30, **F, "pregnant": True}, {"fires": ["DM-SUS-PREG-03"]}),
V("DMV-208", "Type 2, 35, albuminuria on 2 tests, not on a statin", ["W21"],
  {"age_years": 35, **M, **T2M, "uacr_abnormal_count": 2, "on_statin": False}, {"fires": ["DM-ACT-RX-06C"]}, established=True),
]
VIGNETTES += [
V("DMV-209", "8-year-old not known to have diabetes, meter 32, district", ["W06", "paediatric"],
  {"age_years": 8, **M, "capillary_glucose": 32.0}, {"fires": ["DM-ACU-ROUTE-14P"], "silent": ["DM-ACU-ROUTE-14"]}, site="district", age_band="child"),
]
VIGNETTES += [
V("DMV-261", "Type 1 on insulin, abdominal pain, glucose 6.0, blood ketones 0.3", ["W14c", "sick day"],
  {"age_years": 34, **M, **T1, "abdominal_pain": True, "capillary_glucose": 6.0, "bohb": 0.3},
  {"fires": ["DM-ACU-ROUTE-23R"], "urgency": {"DM-ACU-ROUTE-23R": "same_day"}}, established=True),
]
