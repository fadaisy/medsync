"""Patients for the ninth review's fixes (U01 to U26). Every patient is synthetic."""
from k_vignettes import V, VIGNETTES

M = {"sex": "male"}
def _v(vid): return next(v for v in VIGNETTES if v["id"] == vid)
for _id in ("DMV-26", "DMV-28"):                                   # U21: de-duplicate the expected targets
    _e = _v(_id)["expect"]; _e["targets"] = list(dict.fromkeys(_e.get("targets", [])))
_v("DMV-128")["expect"]["fires"] = ["metformin_during_acute_illness"]
_v("DMV-133")["expect"]["bands"] = {"hba1c_control_ckd": "in_range"}   # U14

VIGNETTES += [
V("DMV-136", "Type 2 on metformin, acetone on the breath, glucose 7, urine ketones 1+", ["acute routing", "review U01"],
  {"age_years": 57, **M, "dm_status": "known", "dm_type_recorded": "type_2", "glucose_lowering_therapy": ["metformin"], "acetone_breath": True, "capillary_glucose": 7.0, "urine_ketones": "1plus"},
  {"fires": ["DM-ACU-ROUTE-13B", "DM-ACU-ROUTE-21"], "something_fires": True}, established=True),
V("DMV-137", "District: type 1, vomiting, glucose 9, urine ketones negative", ["district", "review U02"],
  {"age_years": 23, **M, "dm_status": "known", "dm_type_recorded": "type_1", "glucose_lowering_therapy": ["insulin"], "vomiting": True, "capillary_glucose": 9.0, "urine_ketones": "neg"},
  {"fires": ["DM-ACU-ROUTE-23D"], "urgency": {"DM-ACU-ROUTE-23D": "same_day"}}, established=True, site="district"),
V("DMV-138", "Woman of 33, pregnancy not asked: BP 170/115 with headache", ["pregnancy unknown", "review U03"],
  {"age_years": 33, "sex": "female", "bp_systolic": 170, "bp_diastolic": 115, "hypertensive_symptoms": True},
  {"fires": ["DM-ACU-ROUTE-27D"], "urgency": {"DM-ACU-ROUTE-27D": "immediate"}}),
V("DMV-139", "11-year-old with polyuria, fasting meter 9.0", ["paediatric", "review U04"],
  {"age_years": 11, **M, "polyuria": True, "capillary_glucose": 9.0, "capillary_glucose_context": "fasting"},
  {"fires": ["DM-SUS-PAED-05"], "urgency": {"DM-SUS-PAED-05": "same_day"}}, age_band="adolescent"),
V("DMV-140", "Frail 80-year-old on gliclazide, 'avoid symptoms' agreed, eGFR 45, HbA1c 8.5%", ["targets", "review U06"],
  {"age_years": 80, **M, "dm_status": "known", "dm_type_recorded": "type_2", "glucose_lowering_therapy": ["gliclazide"], "frailty_or_limited_life_expectancy": True,
   "glycaemic_target_tier": "avoid_symptoms", "egfr": 45, "hba1c": 8.5},
  {"targets_absent": ["tgt_hba1c_general", "tgt_hba1c_relaxed", "tgt_hba1c_ckd", "tgt_hba1c_older_healthy", "tgt_hba1c_tight", "tgt_hba1c_tb"], "bands_absent": ["hba1c_control_ckd", "hba1c_control_general"]}, established=True, age_band="older_adult"),
V("DMV-141", "15-year-old recorded in the adult band: one fasting glucose of 7.4", ["paediatric", "numeric age", "review U12"],
  {"age_years": 15, **M, "fasting_pg": 7.4},
  {"fires": ["DM-SUS-PAED-04"], "silent": ["DM-SUS-INCID-02"]}),
]
