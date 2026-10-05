"""Patients for safety items no earlier patient exercised (found by the Phase 3 mutation test):
every acute rule, red flag and blocking caveat must change at least one golden result."""
from k_vignettes import V, VIGNETTES

M = {"sex": "male"}
T2 = {"dm_status": "known", "dm_type_recorded": "type_2", "glucose_lowering_therapy": ["metformin"]}
T1 = {"dm_status": "known", "dm_type_recorded": "type_1", "glucose_lowering_therapy": ["insulin"]}
VIGNETTES += [
V("DMV-149", "Potassium 6.8 in diabetes", ["acute routing", "coverage"], {"age_years": 60, **M, **T2, "potassium": 6.8},
  {"fires": ["DM-ACU-ROUTE-05"], "urgency": {"DM-ACU-ROUTE-05": "immediate"}}, established=True),
V("DMV-150", "Type 2 on metformin, vomiting, no glucose yet", ["sick day", "coverage"], {"age_years": 52, **M, **T2, "vomiting": True},
  {"fires": ["DM-ACU-ROUTE-13"]}, established=True),
V("DMV-151", "Type 1: insulin run out two days ago, well", ["sick day", "coverage"], {"age_years": 27, **M, **T1, "insulin_omitted": True},
  {"fires": ["DM-ACU-ROUTE-10"]}, established=True),
V("DMV-152", "Type 1, well, blood ketones 2.1", ["ketones", "coverage"], {"age_years": 33, **M, **T1, "bohb": 2.1, "capillary_glucose": 12.0},
  {"fires": ["DM-ACU-ROUTE-22"], "urgency": {"DM-ACU-ROUTE-22": "same_day"}}, established=True),
V("DMV-153", "Pregnant 30 weeks, BP 146/94, no symptoms, urine not yet tested", ["pregnancy", "coverage"],
  {"age_years": 28, "sex": "female", "pregnant": True, "gestation_weeks": 30, "bp_systolic": 146, "bp_diastolic": 94},
  {"fires": ["DM-ACU-ROUTE-27"], "urgency": {"DM-ACU-ROUTE-27": "same_day"}}),
V("DMV-154", "Type 2 on metformin with a chest infection, blood ketones 1.0, glucose 14", ["ketones", "coverage"],
  {"age_years": 58, **M, **T2, "acute_illness_current": True, "bohb": 1.0, "capillary_glucose": 14.0},
  {"fires": ["DM-ACU-ROUTE-21B"]}, established=True),
V("DMV-155", "Pregnant 32 weeks, BP 150/96, urine protein 2+", ["pregnancy", "coverage"],
  {"age_years": 30, "sex": "female", "pregnant": True, "gestation_weeks": 32, "bp_systolic": 150, "bp_diastolic": 96, "urine_protein_strip": "2plus"},
  {"fires": ["DM-ACU-ROUTE-27C"]}),
V("DMV-156", "12-year-old with type 1, smelling of acetone, glucose 9, no ketone result", ["paediatric", "coverage"],
  {"age_years": 12, **M, **T1, "acetone_breath": True, "capillary_glucose": 9.0}, {"fires": ["DM-ACU-ROUTE-25B"]}, established=True, age_band="adolescent"),
V("DMV-157", "Type 2 with pneumonia, glucose 22, not vomiting, ketones not raised", ["sick day", "coverage"],
  {"age_years": 70, **M, **T2, "acute_illness_current": True, "capillary_glucose": 22.0, "urine_ketones": "neg"}, {"fires": ["DM-ACU-ROUTE-34B"]}, established=True, age_band="older_adult"),
V("DMV-158", "11-year-old with type 1, dehydrated, blood ketones 0.3, glucose 8", ["paediatric", "coverage"],
  {"age_years": 11, **M, **T1, "dehydration": True, "bohb": 0.3, "capillary_glucose": 8.0}, {"fires": ["DM-ACU-ROUTE-25C"]}, established=True, age_band="adolescent"),
]
for _n, (_cid, _vals) in enumerate((("hba1c_g6pd", {"g6pd_deficiency": True}), ("hba1c_sickle_cell_disease", {"sickle_cell_disease": True}),
                                    ("hba1c_haematinic_or_epo", {"on_iron_b12_or_epo": True}), ("hba1c_dapsone_or_spleen", {"on_dapsone": True}),
                                    ("hba1c_red_cell_turnover", {"malaria_current": True}))):
    VIGNETTES.append(V(f"DMV-{159 + _n}", f"HbA1c 6.8% in a person with {_cid.replace('hba1c_', '').replace('_', ' ')}", ["caveat", "coverage"],
                       {"age_years": 45, **M, **_vals, "hba1c": 6.8}, {"caveats": [_cid]}))
VIGNETTES += [
V("DMV-164", "Known type 2, creatinine not in steady state (acute kidney injury), eGFR 42", ["caveat", "coverage"],
  {"age_years": 62, **M, **T2, "creatinine_unstable": True, "egfr": 42}, {"caveats": ["egfr_not_steady_state"]}, established=True),
V("DMV-165", "Known type 2, ankle-brachial index 1.45 (calcified vessels)", ["caveat", "coverage"],
  {"age_years": 66, **M, **T2, "abi": 1.45}, {"caveats": ["abi_calcified"]}, established=True, age_band="older_adult"),
]
