from h import *
F={"sex":"female"}
T2M={"dm_status":"known","dm_type_recorded":"type_2","glucose_lowering_therapy":["metformin"]}
for p in (None, True, False):
    v={"age_years":30,**F,**T2M,"vomiting":True,"capillary_glucose":9.0}
    if p is not None: v["pregnant"]=p
    run(v,tag=f"30F T2 metformin vomiting glu 9 pregnant={p}")
v={"age_years":30,**F,**T2M,"acute_illness_current":True,"capillary_glucose":9.0}; run(v,tag="30F T2 ill glu 9 preg unknown")
v={"age_years":30,**F,**T2M,"acute_illness_current":True,"capillary_glucose":9.0,"pregnant":True,"gestation_weeks":30}; run(v,tag="30F T2 ill glu 9 pregnant")
# district SU fasting capillary
run({"age_years":70,"sex":"male","dm_status":"known","dm_type_recorded":"type_2","glucose_lowering_therapy":["gliclazide"],"capillary_glucose":4.1,"capillary_glucose_context":"fasting"},site="district",tag="70M SU fasting cap 4.1 district")
run({"age_years":70,**F,"dm_status":"known","dm_type_recorded":"type_2","glucose_lowering_therapy":["gliclazide"],"fasting_pg":4.1},tag="70F SU fasting 4.1 preg unanswered")
