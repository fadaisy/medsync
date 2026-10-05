from h import *
T1={"dm_status":"known","dm_type_recorded":"type_1","glucose_lowering_therapy":["insulin"]}
T2M={"dm_status":"known","dm_type_recorded":"type_2","glucose_lowering_therapy":["metformin"]}
SU={"dm_status":"known","dm_type_recorded":"type_2","glucose_lowering_therapy":["gliclazide"]}
M={"sex":"male"}
# child DKA fluids
r=run({"age_years":8,**M,**T1,"urine_ketones":"2plus","capillary_glucose":25.0},site="district",tag="child 8 T1 ketones 2+ glu 25")
r=run({"age_years":8,**M,"capillary_glucose":32.0},site="district",tag="child 8 new glu 32", est=False)
r=run({"age_years":14,**M,**T1,"glucose_meter_extreme":"hi"},site="district",tag="14 T1 HI")
# V02
r=run({"age_years":80,**M,**SU,"frailty_or_limited_life_expectancy":True,"glycaemic_target_tier":"avoid_symptoms","capillary_glucose":8.5,"capillary_glucose_context":"fasting"},site="district",tag="V02 80 frail SU avoid fcap 8.5")
r=run({"age_years":80,**M,**SU,"frailty_or_limited_life_expectancy":True,"capillary_glucose":8.5,"capillary_glucose_context":"fasting"},site="district",tag="V02 80 frail SU no tier fcap 8.5")
r=run({"age_years":80,**M,**SU,"glycaemic_target_tier":"relaxed","capillary_glucose":8.5,"capillary_glucose_context":"fasting"},site="district",tag="V02 80 SU relaxed fcap 8.5")
r=run({"age_years":80,**M,**SU,"glycaemic_target_tier":"avoid_symptoms","capillary_glucose":3.5,"capillary_glucose_context":"fasting"},site="district",tag="V02 low band shows? fcap 3.5")
r=run({"age_years":68,**M,**T2M,"cvd_established":True,"hba1c":7.6,"months_since_hba1c":1,"capillary_glucose":7.8,"capillary_glucose_context":"fasting"},site="referral",tag="elderly2026 + fpg surrogate")
r=run({"age_years":62,**M,**SU,"hypo_worst_12m":"needed_help","capillary_glucose":7.8,"capillary_glucose_context":"fasting","hba1c":7.6},site="referral",tag="62 SU needed-help low fcap 7.8")
r=run({"age_years":70,**M,**SU,"fasting_pg":4.1},site="referral",tag="DMV-182 RX-14 vs band")
r=run({"age_years":79,**M,"dm_status":"known","dm_type_recorded":"type_2","glucose_lowering_therapy":["insulin"],"frailty_or_limited_life_expectancy":True,"fasting_pg":4.6},site="referral",tag="DMV-181 RX-14B vs band")
