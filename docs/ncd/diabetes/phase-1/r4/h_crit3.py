from r4lib import run
M = {"sex": "male", "age_years": 55}
K = {**M, "dm_status":"known","dm_type_recorded":"type_2","glucose_lowering_therapy":["metformin"]}
run({**K,"capillary_glucose":12.0,"capillary_glucose_context":"random","abdominal_pain":True}, label="H07a T2 meter 12 abdo pain")
run({**K,"abdominal_pain":True,"capillary_glucose":6.8,"urine_ketones":"neg"}, label="H07b T2 abdo pain 6.8 ket neg")
run({**K,"vomiting":True,"capillary_glucose":6.0}, label="H07c T2 one vomit 6.0")
run({**K,"vomiting":True,"acute_illness_current":True,"capillary_glucose":6.8,"urine_ketones":"neg"}, label="H07d gastroenteritis normal glucose")
run({**K,"capillary_glucose":38,"mental_status":"drowsy","dehydration":True}, label="H07e HHS 38 drowsy dry")
run({**K,"capillary_glucose":25,"deep_rapid_breathing":True,"urine_ketones":"3plus","vomiting":True}, label="H07f DKA 25 kussmaul 3+")
run({**K,"vomiting":True}, label="H07g T2 vomiting no glucose")
run({**K,"capillary_glucose":25,"vomiting":True,"urine_ketones":"1plus"}, label="NEW T2 glucose 25 vomiting ketones 1+")
run({**M,"dm_status":"known","dm_type_recorded":"type_1","glucose_lowering_therapy":["insulin"],"capillary_glucose":22,"vomiting":True,"bohb":2.4}, label="NEW T1 glucose 22 vomiting bohb 2.4")
run({**M,"dm_status":"known","dm_type_recorded":"type_1","glucose_lowering_therapy":["insulin"],"capillary_glucose":22,"vomiting":True,"urine_ketones":"neg"}, site="district", label="NEW T1 district glucose 22 vomiting urine ket neg")
