from r4lib import run, REG
M = {"sex": "male", "age_years": 55}
# H08
run({"sex":"male","age_years":8,"dehydration":True,"vomiting":True}, est=False, band="child", label="H08a 8y diarrhoea dehydrated")
run({"sex":"male","age_years":7,"dehydration":True,"capillary_glucose":5.2}, est=False, band="child", label="H08b 7y dehydrated glucose 5.2")
run({"sex":"male","age_years":8,"vomiting":True,"urine_ketones":"2plus","capillary_glucose":4.5}, est=False, band="child", label="H08c 8y starvation ketosis")
# H09
R = {**M,"dm_status":"known","dm_type_recorded":"type_2","months_off_glucose_lowering":4,"hba1c":6.0}
run({**R,"glucose_lowering_therapy":["none"],"ogtt_2h_pg":12.0}, label="H09a remission + ogtt 12")
run({**R,"glucose_lowering_therapy":["none"],"malaria_current":True}, label="H09b remission + malaria")
run({**R,"glucose_lowering_therapy":["metformin"]}, label="H09c remission + metformin")
run({**R,"glucose_lowering_therapy":["none"],"fasting_pg":6.2}, label="H09d remission true-ish")
run({**R,"glucose_lowering_therapy":["none"],"capillary_glucose":9.5}, label="H09e remission + meter 9.5 no context")
# H12
for k in (5.6, 6.0, 6.5, 7.1):
    run({**M,"dm_status":"known","ras_blocker":"acei","egfr":40,"potassium":k}, label=f"H12 K {k}")
# H14
run({**M,"age_years":78,"dm_status":"known","dm_type_recorded":"type_2","glucose_lowering_therapy":["glibenclamide"],"hypo_worst_12m":"measured_below_3"}, band="older_adult", label="H14 78 glib measured<3")
run({**M,"age_years":70,"dm_status":"known","dm_type_recorded":"type_2","glucose_lowering_therapy":["metformin"],"hba1c":7.3}, band="older_adult", label="72-ish elderly HbA1c 7.3 no tier")
run({**M,"age_years":72,"dm_status":"known","dm_type_recorded":"type_2","glucose_lowering_therapy":["metformin"],"hba1c":7.3,"glycaemic_target_tier":"general"}, band="older_adult", label="72 HbA1c 7.3 tier general")
