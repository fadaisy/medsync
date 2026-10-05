from h import *
M={"sex":"male"}; F={"sex":"female"}
T2M={"dm_status":"known","dm_type_recorded":"type_2","glucose_lowering_therapy":["metformin"]}
r=run({"age_years":33,**F,"pregnant":False,"prior_intermediate_hyperglycaemia":True,"prior_gdm":True,"bmi":24},est=False,tag="D-DM-30 prior GDM + prior IH")
print("   restricted:", r["restricted"], "| RX-15 display:", M_:=None) if False else print("   restricted:", r["restricted"])
r=run({"age_years":33,**F,"pregnant":True,"gestation_weeks":10,"prior_gdm":True},est=False,tag="D-DM-30 pregnant prior GDM")
print("   restricted:", r["restricted"])
r=run({"age_years":33,**F,"pregnant":False,"prior_gdm":True,"months_since_glucose_test":40},est=False,tag="prior GDM retest")
print("   restricted:", r["restricted"])
# HbA1c-03 vs relaxed
run({"age_years":72,**M,**T2M,"frailty_or_limited_life_expectancy":True,"hba1c":7.6,"months_since_hba1c":4,"therapy_changed_recently":False},tag="HBA1C-03 frail 7.6 at relaxed target")
run({"age_years":52,**M,**T2M,"hba1c":8.4,"months_since_hba1c":7,"therapy_changed_recently":False},tag="HBA1C-03 vs -01 at 7 months")
# B12
run({"age_years":60,**M,**T2M},tag="B12 never tested (no months)")
# statins dup
run({"age_years":55,**M,**T2M,"uacr_abnormal_count":2,"on_statin":False,"ras_blocker":"ace_inhibitor"},tag="RX-06 + 06C dup")
run({"age_years":45,**M,**T2M,"hypertension_known":True,"on_statin":False},tag="45 HTN no statin")
# inpatient
run({"age_years":60,**M,**T2M,"care_setting":"inpatient","capillary_glucose":8.0,"capillary_glucose_context":"fasting"},tag="inpatient fcap 8.0")
run({"age_years":60,**M,"dm_status":"known","dm_type_recorded":"type_2","glucose_lowering_therapy":["insulin"],"care_setting":"inpatient","capillary_glucose":5.0,"capillary_glucose_context":"fasting"},tag="inpatient insulin fcap 5.0")
run({"age_years":60,**M,**T2M,"care_setting":"inpatient","fasting_pg":8.0},tag="known DM inpatient fasting_pg only")
