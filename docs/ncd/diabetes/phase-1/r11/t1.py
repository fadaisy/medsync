from h import *
# V01: acutely unwell, insulin/T1 child, no glucose
T1={"dm_status":"known","dm_type_recorded":"type_1","glucose_lowering_therapy":["insulin"]}
T2M={"dm_status":"known","dm_type_recorded":"type_2","glucose_lowering_therapy":["metformin"]}
for site in ("referral","district"):
    run({"age_years":7,"sex":"male",**T1,"acute_illness_current":True},site=site,tag="V01 child7 T1 ill no glu")
    run({"age_years":13,"sex":"male",**T1,"acute_illness_current":True,"capillary_glucose":13.0},site=site,tag="V01 13y T1 ill cap13")
    run({"age_years":30,"sex":"male",**T1,"acute_illness_current":True},site=site,tag="V01 adult T1 ill no glu")
    run({"age_years":68,"sex":"male","dm_status":"known","dm_type_recorded":"type_2","glucose_lowering_therapy":["glibenclamide"],"acute_illness_current":True},site=site,tag="V01 68 glib ill no glu")
    run({"age_years":45,"sex":"male",**T2M,"acute_illness_current":True},site=site,tag="T2 metformin ill no glu")
    run({"age_years":45,"sex":"male",**T2M,"acute_illness_current":True,"capillary_glucose":8.0},site=site,tag="T2 metformin ill glu 8")
