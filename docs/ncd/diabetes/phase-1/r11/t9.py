from h import *
M={"sex":"male"}; F={"sex":"female"}
T2M={"dm_status":"known","dm_type_recorded":"type_2","glucose_lowering_therapy":["metformin"]}
run({"age_years":8,**M,"vomiting":True,"polyuria":True},est=False,tag="child vomiting + polyuria")
run({"age_years":8,**M,"abdominal_pain":True},est=False,tag="child abdominal pain only")
run({"age_years":8,**M,"vomiting":True,"mental_status":"drowsy"},est=False,tag="child vomiting drowsy no glucose")
run({"age_years":8,**M,"vomiting":True,"deep_rapid_breathing":True},est=False,tag="child vomiting kussmaul no glucose")
run({"age_years":14,**M,"dm_status":"known","dm_type_recorded":"type_2","glucose_lowering_therapy":["metformin"],"on_rifampicin":True},band="adolescent",tag="14y T2 metformin rifampicin")
run({"age_years":14,**M,"dm_status":"known","dm_type_recorded":"type_2","glucose_lowering_therapy":["metformin"],"care_setting":"inpatient","capillary_glucose":9.0},band="adolescent",tag="14y inpatient metformin")
run({"age_years":14,**M,"dm_status":"known","dm_type_recorded":"type_2","glucose_lowering_therapy":["metformin"],"surgery_or_fasting_planned":True},band="adolescent",tag="14y surgery metformin")
run({"age_years":55,**M,**T2M,"capillary_glucose":17.0,"acute_illness_current":True},tag="RX-04 single cap 17 in illness")
run({"age_years":55,**M,**T2M,"on_glucocorticoid":True},tag="RX-04B any steroid")
run({"age_years":30,**M,"dm_status":"known","dm_type_recorded":"type_2","glucose_lowering_therapy":["metformin"],"c_peptide":150,"hyperglycaemic_emergency_last_2_weeks":True},tag="RX-13 c-pep 150 after DKA")
run({"age_years":58,**F,"pregnant":False,**T2M,"retinopathy_stage":"mild_npdr","months_since_eye_screen":14},tag="EYE-02 dup?")
run({"age_years":45,**M,**T2M,"hba1c":10.0},tag="RX-04 hba1c 10.0")
