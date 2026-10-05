"""Re-run R3 critical findings H01-H07."""
from r4lib import run
M = {"sex": "male"}
# H01
run({**M,"age_years":15,"dm_status":"known","dm_type_recorded":"type_2","glucose_lowering_therapy":["metformin","glibenclamide"],"egfr":20,"hypo_worst_12m":"needed_help"}, est=True, band="adolescent", label="H01b 15y T2 met+glib eGFR20 needed help")
run({**M,"age_years":15,"dm_status":"known","dm_type_recorded":"type_1","glucose_lowering_therapy":["insulin"]}, est=True, band="adolescent", label="H01c 15y T1 routine")
run({**M,"age_years":12,"dm_status":"known","dm_type_recorded":"type_1","glucose_lowering_therapy":["insulin"],"capillary_glucose":14.0,"capillary_glucose_context":"random","hba1c":9.0}, est=True, band="child", label="H01d 12y T1 routine meter 14 HbA1c 9")
run({**M,"age_years":14,"dm_status":"known","dm_type_recorded":"type_1","glucose_lowering_therapy":["insulin"],"abdominal_pain":True,"capillary_glucose":6.0,"urine_ketones":"neg"}, est=True, band="adolescent", label="H01e/H08 14y T1 abdo pain glucose 6 ketones neg")
# H02
run({**M,"age_years":50,"polydipsia":True,"capillary_glucose":16.0,"capillary_glucose_context":"random","sudden_vision_loss":True,"egfr":20,"bp_systolic":230,"bp_diastolic":130,"hypertensive_symptoms":True,"foot_infection_grade":"severe","limb_ischaemia_signs":True}, est=False, label="H02 new dx + everything")
run({**M,"age_years":40,"dm_status":"not_known","active_foot_ulcer":True}, est=False, label="H02-regress non-diabetic foot ulcer")
run({**M,"age_years":40,"dm_status":"not_known","foot_hot_swollen":True}, est=False, label="H02-regress non-diabetic hot swollen foot (gout/cellulitis)")
run({"sex":"female","age_years":8,"active_foot_ulcer":True}, est=False, band="child", label="H02-regress 8y child jigger ulcer")
# H03
run({**M,"age_years":70,"dm_status":"known","dm_type_recorded":"type_2","glucose_lowering_therapy":["insulin"],"postprandial_pg":2.4}, label="H03a pp 2.4 on insulin")
run({**M,"age_years":60,"dm_status":"known","dm_type_recorded":"type_2","glucose_lowering_therapy":["metformin"],"postprandial_pg":36}, label="H03b pp 36")
run({**M,"age_years":60,"dm_status":"known","dm_type_recorded":"type_2","glucose_lowering_therapy":["metformin"],"ogtt_2h_pg":34}, label="H03c ogtt2h 34")
run({**M,"age_years":30,"ogtt_2h_pg":2.5,"fasting_pg":4.5}, est=False, label="H03d non-diabetic ogtt2h 2.5")
