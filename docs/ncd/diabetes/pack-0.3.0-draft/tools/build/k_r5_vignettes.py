"""Patients for the fifth review's fixes (K01 to K25). Every patient is synthetic."""
from k_vignettes import V, VIGNETTES

M = {"sex": "male"}
F_NOT = {"sex": "female", "pregnancy_possible": False}
def _v(vid): return next(v for v in VIGNETTES if v["id"] == vid)

# Corrections the fifth review showed were clinically wrong (K02, K03, K13, K14, K19, K23).
_v("DMV-86")["expect"] = {"fires": ["DM-ACU-ROUTE-30"], "urgency": {"DM-ACU-ROUTE-30": "immediate"}, "silent": ["DM-ACU-ROUTE-22", "DM-ACU-ROUTE-21", "DM-ACU-ROUTE-02"]}
_v("DMV-88")["expect"] = {"fires": ["DM-ACU-ROUTE-03", "DM-ACU-ROUTE-21", "sglt2_during_acute_illness"], "urgency": {"DM-ACU-ROUTE-03": "immediate"}}
_v("DMV-95")["expect"] = {"silent": ["DM-ACT-RX-11"], "gaps": {"DM-ACT-RX-11": ["hba1c"]}}
_v("DMV-96")["expect"] = {"targets": ["tgt_hba1c_relaxed"], "targets_absent": ["tgt_hba1c_general", "tgt_hba1c_older_healthy"], "bands": {"hba1c_control_relaxed": "at_target"}}
_v("DMV-97")["expect"] = {"dark": ["DM-ACT-REFER-GLU-02"]}
_v("DMV-92")["ageBand"] = "child"
# DMV-36: with deep breathing and drowsiness the interrupt (rule 11) routes the patient; the same-day 'test ketones' prompt stands down (K08).
_v("DMV-36")["expect"]["fires"] = [k for k in _v("DMV-36")["expect"]["fires"] if k != "DM-ACU-ROUTE-01"]
_v("DMV-36")["expect"].get("urgency", {}).pop("DM-ACU-ROUTE-01", None); _v("DMV-36")["expect"].setdefault("silent", []).append("DM-ACU-ROUTE-01")
_v("DMV-98")["title"] = "30 weeks pregnant, BP 165/105"

VIGNETTES += [
V("DMV-101", "Insulin on the medicine list, diabetes status blank: glucose 7, blood ketones 3.5", ["acute routing", "review K01"],
  {"age_years": 34, **M, "glucose_lowering_therapy": ["insulin"], "capillary_glucose": 7.0, "bohb": 3.5},
  {"fires": ["DM-ACU-ROUTE-02"], "urgency": {"DM-ACU-ROUTE-02": "immediate"}, "something_fires": True}),
V("DMV-102", "On an SGLT2 inhibitor: vomiting and deep breathing, glucose 9, blood ketones 4.2", ["acute routing", "review K01"],
  {"age_years": 61, **M, "glucose_lowering_therapy": ["metformin", "sglt2_inhibitor"], "vomiting": True, "deep_rapid_breathing": True, "capillary_glucose": 9.0, "bohb": 4.2},
  {"fires": ["DM-ACU-ROUTE-02"], "silent": ["DM-ACU-ROUTE-24"], "urgency": {"DM-ACU-ROUTE-02": "immediate"}}),
V("DMV-103", "On an SGLT2 inhibitor: vomiting and abdominal pain, glucose 9, urine ketones negative", ["acute routing", "caveat", "review K02"],
  {"age_years": 57, **M, "dm_status": "known", "dm_type_recorded": "type_2", "glucose_lowering_therapy": ["metformin", "sglt2_inhibitor"], "vomiting": True, "abdominal_pain": True, "capillary_glucose": 9.0, "urine_ketones": "neg"},
  {"fires": ["DM-ACU-ROUTE-03"], "urgency": {"DM-ACU-ROUTE-03": "immediate"}}, established=True),
V("DMV-104", "Known diabetes, medicine list and type blank, glucose 3.4", ["hypoglycaemia", "missing is not normal", "review K04"],
  {"age_years": 63, **M, "dm_status": "known", "capillary_glucose": 3.4},
  {"fires": ["DM-ACU-ROUTE-07"], "silent": ["DM-ACU-ROUTE-26"], "urgency": {"DM-ACU-ROUTE-07": "immediate"}}, established=True),
V("DMV-105", "Type 2 on metformin only, drowsy, glucose 3.5", ["hypoglycaemia", "review K04"],
  {"age_years": 71, **M, "dm_status": "known", "dm_type_recorded": "type_2", "glucose_lowering_therapy": ["metformin"], "mental_status": "drowsy", "capillary_glucose": 3.5},
  {"fires": ["DM-ACU-ROUTE-31"], "silent": ["DM-ACU-ROUTE-07"], "urgency": {"DM-ACU-ROUTE-31": "immediate"}}, established=True, age_band="older_adult"),
V("DMV-106", "8-year-old with type 1 on insulin: vomiting, urine ketones negative, no glucose yet", ["paediatric", "review K05"],
  {"age_years": 8, **M, "dm_status": "known", "dm_type_recorded": "type_1", "glucose_lowering_therapy": ["insulin"], "vomiting": True, "urine_ketones": "neg"},
  {"fires": ["DM-ACU-ROUTE-32"], "urgency": {"DM-ACU-ROUTE-32": "immediate"}}, established=True, age_band="child"),
V("DMV-107", "Well type 2 on metformin at a routine visit: urine ketones trace, glucose 7", ["noise", "review K06"],
  {"age_years": 52, **M, "dm_status": "known", "dm_type_recorded": "type_2", "glucose_lowering_therapy": ["metformin"], "urine_ketones": "trace", "capillary_glucose": 7.0},
  {"silent": ["DM-ACU-ROUTE-21", "DM-ACU-ROUTE-21B"]}, established=True),
V("DMV-108", "Type 2, glucose 25, urine ketones negative but blood ketones 3.5", ["acute routing", "review K07"],
  {"age_years": 49, **M, "dm_status": "known", "dm_type_recorded": "type_2", "glucose_lowering_therapy": ["metformin"], "capillary_glucose": 25.0, "urine_ketones": "neg", "bohb": 3.5},
  {"fires": ["DM-ACU-ROUTE-02"], "silent": ["DM-ACT-REFER-GLU-02"]}, established=True),
V("DMV-109", "15-year-old with type 1: deep breathing, no glucose yet", ["paediatric", "one interrupt", "review K08"],
  {"age_years": 15, **M, "dm_status": "known", "dm_type_recorded": "type_1", "glucose_lowering_therapy": ["insulin"], "deep_rapid_breathing": True},
  {"fires": ["DM-ACU-ROUTE-25"], "silent": ["DM-ACU-ROUTE-15", "DM-ACU-ROUTE-04"], "urgency": {"DM-ACU-ROUTE-25": "immediate"}}, established=True, age_band="adolescent"),
V("DMV-110", "Known type 2: BP 230/130 with confusion and little urine", ["acute routing", "review K10"],
  {"age_years": 64, **M, "dm_status": "known", "dm_type_recorded": "type_2", "glucose_lowering_therapy": ["metformin"], "bp_systolic": 230, "bp_diastolic": 130, "hypertensive_organ_damage": True},
  {"fires": ["DM-ACU-ROUTE-29"], "urgency": {"DM-ACU-ROUTE-29": "immediate"}}, established=True),
V("DMV-111", "Two weeks after birth: BP 165/112 with headache", ["pregnancy", "postpartum", "review K11"],
  {"age_years": 27, "sex": "female", "pregnant": False, "postpartum_weeks": 2, "bp_systolic": 165, "bp_diastolic": 112},
  {"fires": ["DM-ACU-ROUTE-28"], "urgency": {"DM-ACU-ROUTE-28": "immediate"}}),
V("DMV-112", "70-year-old with type 2, no target tier agreed, HbA1c 7.3%", ["targets", "review K13"],
  {"age_years": 70, **M, "dm_status": "known", "dm_type_recorded": "type_2", "glucose_lowering_therapy": ["metformin"], "hba1c": 7.3, "egfr": 75},
  {"targets": ["tgt_hba1c_older_healthy"], "targets_absent": ["tgt_hba1c_general"]}, established=True, age_band="older_adult"),
V("DMV-113", "Gestational diabetes on diet at a routine antenatal visit", ["pregnancy", "noise", "review K15"],
  {"age_years": 31, "sex": "female", "pregnant": True, "gestation_weeks": 30, "dm_status": "known", "dm_type_recorded": "gestational"},
  {"silent": ["DM-ACT-SCREEN-PREG-01"]}, established=True),
]
