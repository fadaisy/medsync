from r4lib import run
M = {"sex":"male"}
T1 = {"dm_status":"known","dm_type_recorded":"type_1","glucose_lowering_therapy":["insulin"]}
run({**M,"age_years":24,**T1,"deep_rapid_breathing":True,"acetone_breath":True}, label="P27 T1 Kussmaul + acetone, no glucose yet")
run({**M,"age_years":24,**T1,"deep_rapid_breathing":True,"acetone_breath":True}, site="district", label="P27b same at district")
run({**M,"age_years":22,"bmi":19,"polyuria":True,"polydipsia":True,"unexplained_weight_loss":True,"hba1c":5.6}, est=False, label="P28 thin 22y classic symptoms, HbA1c 5.6 on record")
run({**M,"age_years":50,"dm_status":"known","dm_type_recorded":"type_2","glucose_lowering_therapy":["metformin"],"vomiting":True,"capillary_glucose":5.5,"urine_ketones":"2plus"}, label="P29 (H35) T2 gastro glucose 5.5 ketones 2+")
run({**M,"age_years":30,"bmi":31,"capillary_glucose":13,"capillary_glucose_context":"random","polyuria":True,"pancreatitis_history":"chronic"}, est=False, label="P30 obese 30 new dx")
