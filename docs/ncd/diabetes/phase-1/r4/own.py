"""R4's own patients, chosen to break the pack."""
from r4lib import run
M = {"sex":"male"}; F = {"sex":"female"}
KT2 = {"dm_status":"known","dm_type_recorded":"type_2"}
run({**M,"age_years":45,"capillary_glucose":6.4,"capillary_glucose_context":"fasting","polyuria":False,"polydipsia":False,"unexplained_weight_loss":False}, site="district", est=False, label="P01 45y district fasting meter 6.4 no symptoms")
run({**F,"age_years":30,"pregnancy_possible":True,"pregnant":True,"gestation_weeks":26,"fasting_pg":5.4}, est=False, label="P02a pregnant 26w fasting plasma 5.4 referral")
run({**F,"age_years":30,"pregnancy_possible":True,"pregnant":True,"gestation_weeks":26,"capillary_glucose":5.4,"capillary_glucose_context":"fasting"}, est=False, label="P02b pregnant 26w fasting meter 5.4 referral")
run({**M,"age_years":60,**KT2,"glucose_lowering_therapy":["glimepiride"],"egfr":25}, label="P03 T2 glimepiride eGFR 25")
run({**M,"age_years":72,**KT2,"glucose_lowering_therapy":["metformin"],"hba1c":7.3,"glycaemic_target_tier":"general"}, band="older_adult", label="P04 72y HbA1c 7.3")
run({**M,"age_years":35,"hba1c":6.6,"repeat_abnormal_result":True,"sickle_cell_disease":True}, est=False, label="P05 HbA1c 6.6 twice + HbSS")
run({**M,"age_years":50,"on_glucocorticoid":True,"glucose_meter_extreme":"hi"}, est=False, label="P06a prednisolone meter HI (no dm)")
run({**M,"age_years":50,**KT2,"glucose_lowering_therapy":["metformin"],"on_glucocorticoid":True,"glucose_meter_extreme":"hi"}, label="P06b known T2 prednisolone HI")
run({**M,"age_years":55,**KT2,"glucose_lowering_therapy":["metformin"],"bp_systolic":182,"bp_diastolic":112,"hypertensive_symptoms":True}, label="P07 known DM BP 182/112 headache")
run({**M,"age_years":19,"dm_status":"known","dm_type_recorded":"type_1","glucose_lowering_therapy":["insulin"],"capillary_glucose":9.0,"capillary_glucose_context":"random","hba1c":8.2,"bmi":21}, label="P08 well 19y T1 routine")
