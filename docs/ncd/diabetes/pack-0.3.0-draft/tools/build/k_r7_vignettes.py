"""Patients for the seventh review's fixes (Q01 to Q27). Every patient is synthetic."""
from k_vignettes import V, VIGNETTES

M = {"sex": "male"}
def _v(vid): return next(v for v in VIGNETTES if v["id"] == vid)
# DMV-100: routing before measuring; the hypertensive emergency heads, 'glucose now' rides inside it (Q07).
_v("DMV-100")["expect"]["urgency"] = {"DM-ACU-ROUTE-29": "immediate", "DM-ACU-ROUTE-20": "folded"}
# DMV-77: drowsy on glibenclamide with nothing measured: the clinical-picture interrupt heads, 'glucose now' rides inside it (Q07).
_v("DMV-77")["expect"]["urgency"] = {"DM-ACU-ROUTE-24": "immediate", "DM-ACU-ROUTE-20": "folded"}

VIGNETTES += [
V("DMV-122", "Woman of 29: 'not pregnant', weeks since birth not asked, BP 170/115", ["pregnancy unknown", "postpartum", "review Q01"],
  {"age_years": 29, "sex": "female", "pregnant": False, "bp_systolic": 170, "bp_diastolic": 115},
  {"fires": ["DM-ACU-ROUTE-28"], "gaps": {"DM-ACU-ROUTE-28": ["postpartum_weeks"]}}),
V("DMV-123", "Pregnant with gestational diabetes, status blank: vomiting, glucose 9, blood ketones 3.5", ["pregnancy", "review Q02"],
  {"age_years": 31, "sex": "female", "pregnant": True, "gestation_weeks": 32, "dm_type_recorded": "gestational", "vomiting": True, "capillary_glucose": 9.0, "bohb": 3.5},
  {"fires": ["DM-ACU-ROUTE-02"], "something_fires": True}),
V("DMV-124", "Woman of 48, pregnancy not asked: drowsy, meter HI, BP 150/92", ["order", "review Q03"],
  {"age_years": 48, "sex": "female", "mental_status": "drowsy", "glucose_meter_extreme": "hi", "bp_systolic": 150, "bp_diastolic": 92},
  {"fires": ["DM-ACU-ROUTE-14"], "urgency": {"DM-ACU-ROUTE-14": "immediate"}}),
V("DMV-125", "Adult, diabetes status not known, vomiting and drowsy, no glucose", ["missing is not normal", "review Q05"],
  {"age_years": 40, **M, "vomiting": True, "mental_status": "drowsy"},
  {"fires": ["DM-ACU-ROUTE-15"], "urgency": {"DM-ACU-ROUTE-15": "immediate"}}),
V("DMV-126", "34 weeks pregnant and drowsy, blood pressure not yet taken", ["pregnancy", "review Q05"],
  {"age_years": 27, "sex": "female", "pregnant": True, "gestation_weeks": 34, "mental_status": "drowsy"},
  {"fires": ["DM-ACU-ROUTE-28D"], "something_fires": True}),
V("DMV-127", "34 weeks pregnant, BP 150/100, headache, urine protein negative", ["pregnancy", "review Q06"],
  {"age_years": 30, "sex": "female", "pregnant": True, "gestation_weeks": 34, "bp_systolic": 150, "bp_diastolic": 100, "hypertensive_symptoms": True, "urine_protein_strip": "neg"},
  {"fires": ["DM-ACU-ROUTE-27D"], "silent": ["DM-ACU-ROUTE-27B"], "urgency": {"DM-ACU-ROUTE-27D": "same_day"}}),
V("DMV-128", "Type 2 on metformin, dehydrated, glucose 7, blood ketones 0.2", ["noise", "review Q09"],
  {"age_years": 66, **M, "dm_status": "known", "dm_type_recorded": "type_2", "glucose_lowering_therapy": ["metformin"], "dehydration": True, "capillary_glucose": 7.0, "bohb": 0.2},
  {"silent": ["DM-ACU-ROUTE-24", "DM-ACU-ROUTE-24B"]}, established=True, age_band="older_adult"),
V("DMV-129", "District: type 1 on insulin, vomiting, no ketone test yet", ["district", "review Q12"],
  {"age_years": 26, **M, "dm_status": "known", "dm_type_recorded": "type_1", "glucose_lowering_therapy": ["insulin"], "vomiting": True, "capillary_glucose": 9.0},
  {"fires": ["DM-ACU-ROUTE-23D"], "silent": ["DM-ACU-ROUTE-23"]}, established=True, site="district"),
]
