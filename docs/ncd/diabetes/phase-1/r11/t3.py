from h import *
T2M={"dm_status":"known","dm_type_recorded":"type_2","glucose_lowering_therapy":["metformin"]}
INS={"dm_status":"known","dm_type_recorded":"type_2","glucose_lowering_therapy":["metformin","insulin"]}
SU={"dm_status":"known","dm_type_recorded":"type_2","glucose_lowering_therapy":["gliclazide"]}
M={"sex":"male"}
for tier in ("tight","general","relaxed","avoid_symptoms"):
    run({"age_years":66,**M,**T2M,"cvd_established":True,"glycaemic_target_tier":tier,"hba1c":7.8},tag=f"66 CVD metformin tier {tier} hba1c 7.8")
run({"age_years":40,**M,**INS,"glycaemic_target_tier":"tight","hba1c":6.8},tag="V13 tight+insulin")
run({"age_years":40,**M,**T2M,"glycaemic_target_tier":"tight","hba1c":6.8},tag="V13 tight+metformin")
run({"age_years":50,**M,**T2M,"glycaemic_target_tier":"general","egfr":45,"hba1c":6.8},tag="V14 general + CKD")
run({"age_years":50,**M,**T2M,"egfr":45,"hba1c":7.5},tag="CKD no tier")
run({"age_years":63,**M,**T2M,"egfr":45,"hba1c":7.5},tag="CKD no tier 63")
run({"age_years":50,**M,"dm_status":"known","dm_type_recorded":"type_2","glucose_lowering_therapy":["glibenclamide"],"glycaemic_target_tier":"general","hypo_worst_12m":"needed_help","hba1c":7.3},tag="V13b general + glib low")
run({"age_years":40,**M,**SU,"glycaemic_target_tier":"tight","hba1c":6.8},tag="tight + SU")
