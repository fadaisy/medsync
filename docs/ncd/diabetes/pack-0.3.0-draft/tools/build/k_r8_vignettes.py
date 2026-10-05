"""Patients for the eighth review's fixes (T01 to T35). Every patient is synthetic."""
from k_vignettes import V, VIGNETTES

M = {"sex": "male"}
def _v(vid): return next(v for v in VIGNETTES if v["id"] == vid)
_v("DMV-126")["expect"]["urgency"] = {"DM-ACU-ROUTE-28D": "immediate"}         # T03: the specific request heads
_v("DMV-127")["expect"] = {"fires": ["DM-ACU-ROUTE-27D"], "silent": ["DM-ACU-ROUTE-27B"], "urgency": {"DM-ACU-ROUTE-27D": "immediate"}}   # T09

# T35: one HbA1c target. On TB treatment the TB target replaces the general one (DMV-26); with frailty the relaxed target replaces the CKD range (DMV-28).
_e = _v("DMV-26")["expect"]; _e["targets"] = [t if t != "tgt_hba1c_general" else "tgt_hba1c_tb" for t in _e.get("targets", [])]
_e = _v("DMV-28")["expect"]; _e["targets"] = [t if t != "tgt_hba1c_ckd" else "tgt_hba1c_relaxed" for t in _e.get("targets", [])]

VIGNETTES += [
V("DMV-130", "Two weeks after birth: confusion and little urine, blood pressure not yet taken", ["postpartum", "missing data", "review T01"],
  {"age_years": 26, "sex": "female", "pregnant": False, "postpartum_weeks": 2, "hypertensive_organ_damage": True},
  {"fires": ["DM-ACU-ROUTE-28E"], "urgency": {"DM-ACU-ROUTE-28E": "immediate"}}),
V("DMV-131", "Woman of 32, pregnancy not asked: drowsy, glucose 6, blood pressure not yet taken", ["pregnancy unknown", "review T02"],
  {"age_years": 32, "sex": "female", "mental_status": "drowsy", "capillary_glucose": 6.0},
  {"fires": ["DM-ACU-ROUTE-28D"], "gaps": {"DM-ACU-ROUTE-28D": ["pregnant"]}}),
V("DMV-132", "Type 2 on metformin, acetone on the breath, glucose 8, no ketone test", ["acute routing", "review T04"],
  {"age_years": 55, **M, "dm_status": "known", "dm_type_recorded": "type_2", "glucose_lowering_therapy": ["metformin"], "acetone_breath": True, "capillary_glucose": 8.0},
  {"fires": ["DM-ACU-ROUTE-13B"], "silent": ["DM-ACU-ROUTE-24B"], "urgency": {"DM-ACU-ROUTE-13B": "same_day"}}, established=True),
V("DMV-133", "eGFR 45, HbA1c 7.5%: read against the CKD target", ["targets", "bands", "review T06"],
  {"age_years": 60, **M, "dm_status": "known", "dm_type_recorded": "type_2", "glucose_lowering_therapy": ["metformin"], "egfr": 45, "hba1c": 7.5},
  {"targets": ["tgt_hba1c_ckd"], "targets_absent": ["tgt_hba1c_general"], "bands": {"hba1c_control_ckd": "at_target"}, "bands_absent": ["hba1c_control_general"]}, established=True),
V("DMV-134", "12-year-old, fasting glucose 8.0, no symptoms recorded", ["paediatric", "review T07"],
  {"age_years": 12, **M, "fasting_pg": 8.0},
  {"fires": ["DM-SUS-PAED-04"], "urgency": {"DM-SUS-PAED-04": "same_day"}}, age_band="adolescent"),
V("DMV-135", "Known type 2 on insulin with iron deficiency: HbA1c 8.0%", ["caveat", "review T11"],
  {"age_years": 50, "sex": "female", "pregnancy_possible": False, "dm_status": "known", "dm_type_recorded": "type_2", "glucose_lowering_therapy": ["insulin"], "iron_deficiency": True, "hba1c": 8.0},
  {"silent": ["DM-ACT-REFER-TARGET-02"]}, established=True),
]
