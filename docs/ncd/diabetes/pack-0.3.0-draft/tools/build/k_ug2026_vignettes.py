"""Patients for the 2026 Uganda guideline batch (UG-01 to UG-46, signed 2026-10-05), and the older expectations it changes on purpose."""
from k_vignettes import V, VIGNETTES

_by = {v["id"]: v for v in VIGNETTES}
# UG-09: pregnancy now has glucose targets (adults); DMV-61 is 15 and keeps none.
for _vid in ("DMV-24", "DMV-58", "DMV-66"):
    _by[_vid]["expect"].pop("no_targets", None)
# UG-07: UCG 2023's gestational set is retired.
_by["DMV-147"]["expect"]["diagnosis"].pop("ug_ucg_2023_gdm", None)
_by["DMV-147"]["title"] = "28 weeks pregnant, fasting 5.4: gestational diabetes under WHO 2013 (the 2026 guideline's values)"

F = {"sex": "female"}; M = {"sex": "male"}
VIGNETTES += [
V("DMV-170", "Thirst and itching, fasting glucose exactly 7.0: diabetes under the 2026 set (not under UCG's '>')", ["met", "UG-01", "UG-02"],
  {"age_years": 44, **M, "polydipsia": True, "pruritus": True, "fasting_pg": 7.0},
  {"diagnosis": {"ug_integrated_dm_2026": "met", "ug_ucg_2023": "insufficient"}}),
V("DMV-171", "No symptoms; fasting 7.4 and laboratory HbA1c 6.9 on the same day", ["met", "UG-03"],
  {"age_years": 51, **F, "pregnant": False, "fasting_pg": 7.4, "hba1c": 6.9, "hba1c_point_of_care": False},
  {"diagnosis": {"ug_integrated_dm_2026": "met"}}),
V("DMV-172", "No symptoms; fasting 7.3 and a point-of-care HbA1c 7.1: not diagnosed (2026 does not diagnose on a point-of-care HbA1c)", ["UG-04"],
  {"age_years": 51, **M, "fasting_pg": 7.3, "hba1c": 7.1, "hba1c_point_of_care": True},
  {"diagnosis": {"ug_integrated_dm_2026": "insufficient"}}),
V("DMV-173", "Random glucose 9.2 at an outpatient visit, no symptoms", ["UG-05"],
  {"age_years": 39, **M, "random_pg": 9.2}, {"fires": ["DM-SUS-INCID-05"]}),
V("DMV-174", "12 weeks pregnant at her first antenatal visit, no glucose yet", ["pregnancy", "UG-06"],
  {"age_years": 26, **F, "pregnant": True, "gestation_weeks": 12}, {"fires": ["DM-SUS-PREG-03"]}),
V("DMV-175", "16 weeks pregnant, HbA1c 6.8% at booking", ["pregnancy", "UG-08"],
  {"age_years": 31, **F, "pregnant": True, "gestation_weeks": 16, "hba1c": 6.8}, {"fires": ["DM-CON-PREG-06"], "urgency": {"DM-CON-PREG-06": "same_day"}}),
V("DMV-176", "Pregnant 20 weeks with type 2 diabetes", ["pregnancy", "UG-09", "UG-11"],
  {"age_years": 33, **F, "pregnant": True, "gestation_weeks": 20, "dm_status": "known", "dm_type_recorded": "type_2", "glucose_lowering_therapy": ["insulin"],
   "fasting_pg": 6.0, "on_antiplatelet": False},
  {"fires": ["DM-ACT-PREG-ASA-01"]}, established=True),
]

T2M = {"dm_status": "known", "dm_type_recorded": "type_2", "glucose_lowering_therapy": ["metformin"]}
T2I = {"dm_status": "known", "dm_type_recorded": "type_2", "glucose_lowering_therapy": ["insulin"]}
VIGNETTES += [
V("DMV-177", "Type 2 on diet, 47, random C-peptide 420 pmol/L", ["UG-15"], {"age_years": 47, **M, "dm_status": "known", "dm_type_recorded": "type_2",
  "glucose_lowering_therapy": ["none"], "c_peptide": 420}, {"fires": ["DM-ACT-RX-13"]}, established=True),
V("DMV-178", "68-year-old on metformin with heart disease, HbA1c 7.6%", ["UG-16"], {"age_years": 68, **M, **T2M, "cvd_established": True, "hba1c": 7.6,
  "months_since_hba1c": 1}, {"targets": ["tgt_hba1c_elderly_2026"]}, established=True, age_band="older_adult"),
V("DMV-179", "HbA1c 8.4% four months ago, no treatment change since", ["UG-17"], {"age_years": 52, **F, "pregnant": False, **T2M, "hba1c": 8.4,
  "months_since_hba1c": 4, "therapy_changed_recently": False}, {"fires": ["DM-ACT-TEST-HBA1C-03"]}, established=True),
V("DMV-180", "13-year-old with type 1 diabetes at a routine visit", ["UG-17", "UG-28", "UG-29", "paediatric"], {"age_years": 13, **M, "dm_status": "known",
  "dm_type_recorded": "type_1", "glucose_lowering_therapy": ["insulin"]}, {"fires": ["DM-ACT-REFER-PAED-T1-01"]}, established=True, age_band="adolescent"),
V("DMV-181", "79-year-old on insulin, frail, fasting 4.6", ["D-DM-40"], {"age_years": 79, **M, **T2I, "frailty_or_limited_life_expectancy": True, "fasting_pg": 4.6},
  {"fires": ["DM-ACT-RX-14B"], "silent": ["DM-ACT-RX-14"]}, established=True, age_band="older_adult"),
V("DMV-182", "70-year-old on gliclazide, well, fasting 4.1", ["D-DM-40"], {"age_years": 70, **M, "dm_status": "known", "dm_type_recorded": "type_2",
  "glucose_lowering_therapy": ["gliclazide"], "fasting_pg": 4.1}, {"fires": ["DM-ACT-RX-14"]}, established=True, age_band="older_adult"),
V("DMV-183", "New type 2, fasting 14.6, not on insulin", ["UG-22"], {"age_years": 45, **M, "dm_status": "known", "dm_type_recorded": "type_2",
  "glucose_lowering_therapy": ["metformin"], "fasting_pg": 14.6}, {"fires": ["DM-ACT-RX-04"]}, established=True),
V("DMV-184", "Type 2 on metformin, normal blood pressure, albuminuria on 2 tests, no ACE inhibitor", ["UG-25", "UG-26"], {"age_years": 55, **M, **T2M,
  "uacr_abnormal_count": 2, "ras_blocker": "none", "bp_systolic": 122, "bp_diastolic": 74, "on_statin": False}, {"fires": ["DM-ACT-RX-08", "DM-ACT-RX-06C"]}, established=True),
V("DMV-185", "Mild retinopathy, last eye check 14 months ago", ["UG-27"], {"age_years": 58, **F, "pregnant": False, **T2M, "retinopathy_stage": "mild_npdr",
  "months_since_eye_screen": 14}, {"fires": ["DM-ACT-SCREEN-EYE-02"]}, established=True),
V("DMV-186", "8-year-old, vomiting since this morning, no diarrhoea, no glucose yet", ["UG-30", "paediatric"], {"age_years": 8, **M, "vomiting": True,
  "diarrhoea": False}, {"fires": ["DM-SUS-PAED-06"], "urgency": {"DM-SUS-PAED-06": "same_day"}}, age_band="child"),
V("DMV-187", "8-year-old with vomiting and diarrhoea", ["UG-30", "paediatric"], {"age_years": 8, **M, "vomiting": True, "diarrhoea": True},
  {"silent": ["DM-SUS-PAED-06"]}, age_band="child"),
V("DMV-188", "Type 2, glucose 31 at a health centre, alert", ["UG-31"], {"age_years": 66, **M, **T2M, "capillary_glucose": 31.0},
  {"fires": ["DM-ACU-ROUTE-14"]}, established=True, age_band="older_adult"),
V("DMV-189", "Admitted with pneumonia, no glucose yet", ["UG-34"], {"age_years": 50, **M, "care_setting": "inpatient"}, {"fires": ["DM-SUS-INPT-02"]}),
V("DMV-190", "Inpatient with type 2 on metformin and gliclazide", ["UG-34"], {"age_years": 61, **M, "dm_status": "known", "dm_type_recorded": "type_2",
  "glucose_lowering_therapy": ["metformin", "gliclazide"], "care_setting": "inpatient", "capillary_glucose": 9.0}, {"fires": ["oral_agents_in_hospital"]}, established=True),
V("DMV-191", "On metformin, hernia repair next week", ["UG-35"], {"age_years": 57, **M, **T2M, "surgery_or_fasting_planned": True},
  {"fires": ["metformin_before_surgery"]}, established=True),
V("DMV-192", "On ART, last glucose 7 months ago", ["UG-36"], {"age_years": 38, **F, "pregnant": False, "hiv_on_art": True, "months_since_glucose_test": 7},
  {"fires": ["DM-SUS-POP-HIV-01"]}),
V("DMV-193", "On rifampicin for TB, type 2 on metformin", ["UG-40"], {"age_years": 44, **M, **T2M, "on_rifampicin": True},
  {"fires": ["sulfonylurea_with_rifampicin"]}, established=True),
V("DMV-194", "On metformin 5 years, B12 never checked, regional referral hospital", ["UG-42"], {"age_years": 60, **M, **T2M, "months_since_b12": 60},
  {"fires": ["DM-ACT-SCREEN-B12-02"]}, established=True),
V("DMV-195", "Newly diagnosed today: thirst, random 15.2", ["UG-39", "UG-43"], {"age_years": 41, **M, "polydipsia": True, "random_pg": 15.2},
  {"fires": ["DM-ACT-SCREEN-TB-02", "DM-ACT-INITIAL-01"]}),
V("DMV-196", "Prediabetes before, BMI 37", ["UG-45"], {"age_years": 33, **F, "pregnant": False, "prior_intermediate_hyperglycaemia": True, "bmi": 37},
  {"fires": ["DM-ACT-RX-15"]}),
V("DMV-197", "Fasting 6.0 at a health check, no symptoms", ["UG-05", "UG-45"], {"age_years": 46, **M, "fasting_pg": 6.0}, {"fires": ["DM-ACT-EDU-10B"]}),
]
