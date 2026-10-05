"""Patients for the tenth review's fixes (V01 to V18). Every patient is synthetic."""
from k_vignettes import V, VIGNETTES

M = {"sex": "male"}
def _v(vid): return next(v for v in VIGNETTES if v["id"] == vid)
_v("DMV-140")["expect"]["targets_absent"] += ["tgt_fpg_surrogate", "tgt_ppg_surrogate"]      # V02

VIGNETTES += [
V("DMV-142", "7-year-old with type 1 on insulin, acutely unwell, no glucose yet", ["paediatric", "sick day", "review V01"],
  {"age_years": 7, **M, "dm_status": "known", "dm_type_recorded": "type_1", "glucose_lowering_therapy": ["insulin"], "acute_illness_current": True},
  {"fires": ["DM-ACU-ROUTE-32"], "urgency": {"DM-ACU-ROUTE-32": "immediate"}}, established=True, site="district", age_band="child"),
V("DMV-143", "Frail 80-year-old on gliclazide, 'avoid symptoms' agreed, fasting meter 8.5", ["targets", "review V02"],
  {"age_years": 80, **M, "dm_status": "known", "dm_type_recorded": "type_2", "glucose_lowering_therapy": ["gliclazide"], "frailty_or_limited_life_expectancy": True,
   "glycaemic_target_tier": "avoid_symptoms", "capillary_glucose": 8.5, "capillary_glucose_context": "fasting"},
  {"targets_absent": ["tgt_fpg_surrogate"], "bands_absent": ["fcap_control_who"]}, established=True, site="district", age_band="older_adult"),
V("DMV-144", "Adult with type 1, vomiting, blood ketones 0.3, glucose 9", ["sick day", "review V04"],
  {"age_years": 30, **M, "dm_status": "known", "dm_type_recorded": "type_1", "glucose_lowering_therapy": ["insulin"], "vomiting": True, "bohb": 0.3, "capillary_glucose": 9.0},
  {"fires": ["DM-ACU-ROUTE-23R"], "urgency": {"DM-ACU-ROUTE-23R": "same_day"}}, established=True),
]
