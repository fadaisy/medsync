from r4lib import run, REG
M = {"sex": "male", "age_years": 55}
# H13
run({**M,"age_years":79,"dm_status":"known","dm_type_recorded":"type_2","glucose_lowering_therapy":["insulin"],"frailty_or_limited_life_expectancy":True,"cognitive_impairment":True,"capillary_glucose":4.2,"capillary_glucose_context":"fasting","hba1c":5.9,"glycaemic_target_tier":"relaxed"}, band="older_adult", label="H13a frail insulin fasting meter 4.2")
run({**M,"age_years":78,"dm_status":"known","dm_type_recorded":"type_2","glucose_lowering_therapy":["glibenclamide"],"hba1c":5.2,"glycaemic_target_tier":"general","bp_systolic":80,"bp_diastolic":50}, band="older_adult", label="H13b 78 glib HbA1c 5.2 SBP 80")
run({**M,"age_years":70,"dm_status":"known","dm_type_recorded":"type_2","glucose_lowering_therapy":["insulin"]}, band="older_adult", label="H13c on insulin nothing else")
# H15
F = {"sex":"female","age_years":30}
run({**F,"dm_status":"known","dm_type_recorded":"type_2","glucose_lowering_therapy":["metformin"],"hba1c":9.0,"capillary_glucose":17.5,"ras_blocker":"acei","on_statin":True,"egfr":90}, label="H15b woman 30, preg blank, ACEi statin")
run({"sex":"female","age_years":72,"polydipsia":True,"polyuria":True,"capillary_glucose":20}, est=False, band="older_adult", label="H15c woman 72 new dx preg blank")
run({"age_years":45,"polydipsia":True,"capillary_glucose":20}, est=False, label="H15d sex blank new dx")
# H17
run({**M,"dm_status":"known","retinopathy_stage":"none","retina_view":"not_attempted"}, label="H17a view not attempted")
run({**M,"dm_status":"known","retinopathy_stage":"none","fundus_method":"dilated_ophthalmoscopy","retina_view":"adequate","months_since_eye_screen":0}, label="H17b proper normal")
# H18
run({**M,"age_years":10,"dm_status":"known","dm_type_recorded":"type_1","capillary_glucose":3.4}, band="child", label="H18a T1 child 3.4 meds blank")
run({**M,"dm_status":"known","hypo_worst_12m":"needed_help","capillary_glucose":3.5,"capillary_glucose_context":"fasting"}, label="H18b known low needing help 3.5 meds blank")
run({**M,"dm_status":"known","dm_type_recorded":"type_2","glucose_lowering_therapy":["metformin"],"capillary_glucose":3.8,"capillary_glucose_context":"fasting"}, label="NEW metformin-only fasting 3.8 well")
