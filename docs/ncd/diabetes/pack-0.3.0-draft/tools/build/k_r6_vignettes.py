"""Patients for the sixth review's fixes (L01 to L29). Every patient is synthetic."""
from k_vignettes import V, VIGNETTES

M = {"sex": "male"}
def _v(vid): return next(v for v in VIGNETTES if v["id"] == vid)
_v("DMV-92")["ageBand"] = "adolescent"                       # L23: the platform bands a 10-year-old as adolescent
# DMV-100: no glucose is recorded, so the interrupt leads with 'glucose now' (rule 20); the hypertensive emergency (29) is folded into it (L07).
_v("DMV-100")["expect"]["urgency"] = {"DM-ACU-ROUTE-20": "immediate", "DM-ACU-ROUTE-29": "folded"}
_v("DMV-111")["title"] = "Two weeks after birth: BP 165/112"  # L24

VIGNETTES += [
V("DMV-114", "8-year-old with type 1, meter 20, acetone on the breath", ["paediatric", "review L02"],
  {"age_years": 8, **M, "dm_status": "known", "dm_type_recorded": "type_1", "glucose_lowering_therapy": ["insulin"], "capillary_glucose": 20.0, "acetone_breath": True},
  {"fires": ["DM-ACU-ROUTE-04"], "urgency": {"DM-ACU-ROUTE-04": "immediate"}, "something_fires": True}, established=True, age_band="child"),
V("DMV-115", "34 weeks pregnant, BP 150/100, confusion and little urine", ["pregnancy", "review L03"],
  {"age_years": 30, "sex": "female", "pregnant": True, "gestation_weeks": 34, "bp_systolic": 150, "bp_diastolic": 100, "hypertensive_organ_damage": True},
  {"fires": ["DM-ACU-ROUTE-28B"], "urgency": {"DM-ACU-ROUTE-28B": "immediate"}}),
V("DMV-116", "Child with insulin on the list, status blank: deep breathing, glucose 7", ["paediatric", "review L04"],
  {"age_years": 9, **M, "glucose_lowering_therapy": ["insulin"], "deep_rapid_breathing": True, "capillary_glucose": 7.0},
  {"fires": ["DM-ACU-ROUTE-25"], "urgency": {"DM-ACU-ROUTE-25": "immediate"}}, age_band="child"),
V("DMV-117", "Type 1 on insulin: vomiting and drowsy, glucose 7", ["acute routing", "review L05"],
  {"age_years": 29, **M, "dm_status": "known", "dm_type_recorded": "type_1", "glucose_lowering_therapy": ["insulin"], "vomiting": True, "mental_status": "drowsy", "capillary_glucose": 7.0},
  {"fires": ["DM-ACU-ROUTE-24"], "urgency": {"DM-ACU-ROUTE-24": "immediate"}}, established=True),
V("DMV-118", "72-year-old, general target agreed, HbA1c 7.3%", ["targets", "review L09"],
  {"age_years": 72, **M, "dm_status": "known", "dm_type_recorded": "type_2", "glucose_lowering_therapy": ["metformin"], "glycaemic_target_tier": "general", "hba1c": 7.3, "egfr": 70},
  {"targets": ["tgt_hba1c_general"], "targets_absent": ["tgt_hba1c_older_healthy"]}, established=True, age_band="older_adult"),
V("DMV-119", "Woman of 28, pregnancy never asked, BP 170/115", ["pregnancy unknown", "review L13"],
  {"age_years": 28, "sex": "female", "bp_systolic": 170, "bp_diastolic": 115},
  {"fires": ["DM-ACU-ROUTE-28"], "gaps": {"DM-ACU-ROUTE-28": ["pregnant"]}}),
V("DMV-120", "Type 2 on metformin, vomiting, glucose 28, ketones negative", ["acute routing", "review L14"],
  {"age_years": 54, **M, "dm_status": "known", "dm_type_recorded": "type_2", "glucose_lowering_therapy": ["metformin"], "vomiting": True, "capillary_glucose": 28.0, "urine_ketones": "neg"},
  {"fires": ["DM-ACU-ROUTE-34"], "urgency": {"DM-ACU-ROUTE-34": "same_day"}}, established=True),
V("DMV-121", "34 weeks pregnant, BP 150/100, urine protein negative", ["pregnancy", "review L15"],
  {"age_years": 31, "sex": "female", "pregnant": True, "gestation_weeks": 34, "bp_systolic": 150, "bp_diastolic": 100, "urine_protein_strip": "neg"},
  {"fires": ["DM-ACU-ROUTE-27B"], "silent": ["DM-ACU-ROUTE-27"], "urgency": {"DM-ACU-ROUTE-27B": "same_day"}}),
]
