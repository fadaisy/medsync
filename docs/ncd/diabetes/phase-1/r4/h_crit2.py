from r4lib import run
M = {"sex": "male"}
# H04
run({**M,"age_years":8,"capillary_glucose":17.9}, est=False, band="child", site="district", label="H04a 8y meter 17.9")
run({**M,"age_years":9,"polyuria":True,"polydipsia":True,"capillary_glucose":19,"urine_ketones":"neg"}, est=False, band="child", site="district", label="H04b 9y symptoms meter 19 ketones neg")
run({**M,"age_years":15,"capillary_glucose":14.5}, est=False, band="adolescent", label="H04c 15y meter 14.5")
run({**M,"age_years":9,"polyuria":True,"polydipsia":True}, est=False, band="child", site="district", label="H04d 9y symptoms no glucose")
# H05
T2 = {**M,"age_years":55,"dm_status":"known","dm_type_recorded":"type_2","glycaemic_target_tier":"general"}
run({**T2,"glucose_lowering_therapy":["metformin"],"sickle_cell_disease":True,"hba1c":5.4}, label="H05a HbSS HbA1c 5.4")
run({**T2,"glucose_lowering_therapy":["metformin"],"g6pd_deficiency":True,"hba1c":6.9}, label="H05b G6PD 6.9")
run({**T2,"glucose_lowering_therapy":["gliclazide"],"egfr":29,"hba1c":6.1}, label="H05c eGFR29 gliclazide 6.1")
run({**T2,"glucose_lowering_therapy":["none"],"iron_deficiency":True,"hba1c":7.3,"fasting_pg":5.9}, label="H05d iron def 7.3 fpg 5.9")
run({**T2,"age_years":80,"glucose_lowering_therapy":["gliclazide"],"frailty_or_limited_life_expectancy":True,"egfr":22,"hba1c":6.4}, band="older_adult", label="H05e frail 80 eGFR22 gliclazide 6.4")
# H06
run({"sex":"female","age_years":26,"pregnant":True,"gestation_weeks":14,"dm_status":"known","dm_type_recorded":"type_1","glucose_lowering_therapy":["insulin"],"fasting_pg":6.9,"hba1c":7.4,"bp_systolic":150,"bp_diastolic":100}, label="H06 pregnant T1 fpg 6.9 BP150/100")
