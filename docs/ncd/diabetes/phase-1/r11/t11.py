from h import *
T1={"dm_status":"known","dm_type_recorded":"type_1","glucose_lowering_therapy":["insulin"]}
for extra in ({"vomiting":True},{"vomiting":True,"dehydration":True},{"vomiting":True,"acetone_breath":True},{"acute_illness_current":True,"dehydration":True},{"dehydration":True}):
  for g in (5.0, 9.0, 14.0):
    r=run({"age_years":30,"sex":"male",**T1,**extra,"capillary_glucose":g,"bohb":0.3},tag=f"{extra} glu {g} bohb 0.3",show=False)
    print(extra, g, {k:r["urgency"].get(k) for k in r["fired"] if r["urgency"].get(k)!="routine"}, {k:r["states"].get(k) for k in ("DM-ACU-ROUTE-23R","DM-ACU-ROUTE-24B","DM-ACU-ROUTE-23","DM-ACU-ROUTE-11","DM-ACU-ROUTE-19")})
r=run({"age_years":30,"sex":"male",**T1,"vomiting":True,"dehydration":True,"capillary_glucose":5.0,"urine_ketones":"neg"},site="district",tag="district vomit dehyd urine neg")
