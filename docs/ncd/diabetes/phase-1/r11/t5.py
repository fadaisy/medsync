from h import *
M={"sex":"male"}; F={"sex":"female"}
T1={"dm_status":"known","dm_type_recorded":"type_1","glucose_lowering_therapy":["insulin"]}
T2M={"dm_status":"known","dm_type_recorded":"type_2","glucose_lowering_therapy":["metformin"]}
run({"age_years":30,**M,**T1,"vomiting":True,"capillary_glucose":6.0,"bohb":0.3},tag="V04 ref")
run({"age_years":30,**M,**T1,"vomiting":True,"capillary_glucose":6.0,"urine_ketones":"neg"},site="district",tag="V04 district")
run({"age_years":30,**M,**T1,"vomiting":True,"capillary_glucose":6.0,"bohb":1.0},tag="V04 bohb 1.0")
run({"age_years":30,**M,**T1,"abdominal_pain":True,"capillary_glucose":6.0,"bohb":0.3},tag="V04 abdo pain only bohb 0.3")
run({"age_years":62,**M,**T2M,"creatinine_unstable":True,"egfr":50},tag="V05 metformin cr unstable")
run({"age_years":62,**M,"dm_status":"known","dm_type_recorded":"type_2","glucose_lowering_therapy":["metformin","sglt2_inhibitor"],"creatinine_unstable":True,"egfr":42,"hba1c":7.2},tag="V05 met+sglt2 cr unstable egfr 42")
run({"age_years":70,**M,"dm_status":"known","dm_type_recorded":"type_2","glucose_lowering_therapy":["glibenclamide"],"hypo_worst_12m":"none"},tag="V06 70 glib no lows no egfr")
run({"age_years":14,**F,**T1,"ras_blocker":"ace_inhibitor","on_statin":True,"pregnancy_possible":True},tag="V09 girl 14",band="adolescent")
run({"age_years":12,**M,"capillary_glucose":12.0,"capillary_glucose_context":"fasting","polyuria":True},tag="V15 child fasting 12",est=False)
run({"age_years":13,**F,"bp_systolic":165,"bp_diastolic":112,"headache":True},band="child",tag="V16 girl 13 band child",est=False)
