from r4lib import run
M = {"sex":"male"}; F = {"sex":"female"}
KT2 = {"dm_status":"known","dm_type_recorded":"type_2"}
T1 = {"dm_status":"known","dm_type_recorded":"type_1","glucose_lowering_therapy":["insulin"]}
run({**M,"age_years":25,**T1,"vomiting":True,"capillary_glucose":7.0}, label="P17 T1 adult vomiting glucose 7")
run({**M,"age_years":25,**T1,"vomiting":True}, label="P17b T1 adult vomiting no glucose")
run({**M,"age_years":55,**KT2,"glucose_lowering_therapy":["metformin","sglt2_inhibitor"],"abdominal_pain":True,"vomiting":True,"capillary_glucose":9.0,"urine_ketones":"trace"}, label="P18 SGLT2 pain+vomit glucose 9 ketones trace")
run({**F,"age_years":32,"pregnancy_possible":True,"pregnant":True,"gestation_weeks":30,"fasting_pg":5.5,"bp_systolic":165,"bp_diastolic":105}, est=False, label="P19 GDM-range + BP 165/105")
run({**M,"age_years":9,**T1,"capillary_glucose":2.5}, band="child", label="P20 child T1 glucose 2.5")
run({**M,"age_years":55,**KT2,"glucose_lowering_therapy":["metformin"],"capillary_glucose":25,"capillary_glucose_context":"random","urine_ketones":"neg"}, label="P21 known T2 glucose 25 ketones neg, goal field blank")
run({**M,"age_years":48,"capillary_glucose":25,"capillary_glucose_context":"random","urine_ketones":"neg","polyuria":False,"polydipsia":False,"unexplained_weight_loss":False}, est=False, site="district", label="P22 new asymptomatic glucose 25 ketones neg district")
run({**M,"age_years":65,"mental_status":"coma"}, est=False, label="P23 comatose, nothing known")
run({**M,"age_years":55,**KT2,"glucose_lowering_therapy":["metformin"],"dehydration":True,"capillary_glucose":12,"acute_illness_current":True}, label="P24 T2 diarrhoea dehydrated glucose 12")
run({**F,"age_years":28,"pregnancy_possible":True,"pregnant":True,"gestation_weeks":20,**T1,"capillary_glucose":3.2}, label="P25 pregnant T1 glucose 3.2")
run({**M,"age_years":60,**KT2,"glucose_lowering_therapy":["insulin"],"capillary_glucose":3.2,"hypoglycaemia_not_resolving":False}, label="P26 T2 insulin 3.2 (one or two interrupts?)")
