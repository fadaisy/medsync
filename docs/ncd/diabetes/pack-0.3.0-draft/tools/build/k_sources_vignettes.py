"""Patients for the sources review (2026-10-05): each signed change fires on one patient and stays silent on its neighbour."""
from k_vignettes import V, VIGNETTES

F = {"sex": "female"}
VIGNETTES += [
V("DMV-166", "Pregnant 30 weeks with gestational diabetes on diet, vomiting since last night, glucose 9.0", ["pregnancy", "sick day", "sources review"],
  {"age_years": 29, **F, "pregnant": True, "gestation_weeks": 30, "dm_type_recorded": "gestational", "vomiting": True, "capillary_glucose": 9.0},
  {"fires": ["DM-ACU-ROUTE-35"], "urgency": {"DM-ACU-ROUTE-35": "same_day"}}, established=True),
V("DMV-167", "Pregnant 30 weeks with type 1 on insulin, vomiting, glucose 9.0: the insulin rule owns her", ["pregnancy", "sick day", "sources review"],
  {"age_years": 29, **F, "pregnant": True, "gestation_weeks": 30, "dm_status": "known", "dm_type_recorded": "type_1", "glucose_lowering_therapy": ["insulin"],
   "vomiting": True, "capillary_glucose": 9.0},
  {"fires": ["DM-ACU-ROUTE-23"], "silent": ["DM-ACU-ROUTE-35"]}, established=True),
V("DMV-168", "On insulin 6 years, aged 41, random C-peptide 150 pmol/L, no recent ketoacidosis", ["classification", "sources review"],
  {"age_years": 41, "sex": "male", "dm_status": "known", "dm_type_recorded": "unclassified", "glucose_lowering_therapy": ["insulin"], "c_peptide": 150,
   "years_since_diagnosis": 6, "hyperglycaemic_emergency_last_2_weeks": False},
  {"classification": {"type_1": "met"}}, established=True),
V("DMV-169", "Same, but ketoacidosis 10 days ago: the C-peptide does not count yet", ["classification", "sources review"],
  {"age_years": 41, "sex": "male", "dm_status": "known", "dm_type_recorded": "unclassified", "glucose_lowering_therapy": ["insulin"], "c_peptide": 150,
   "years_since_diagnosis": 6, "hyperglycaemic_emergency_last_2_weeks": True},
  {"classification": {"type_1": "insufficient"}}, established=True),
]
