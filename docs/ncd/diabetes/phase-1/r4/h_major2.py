from r4lib import run, REG
for kind in ("rules","management"):
    for it in REG[kind]:
        if it["x"].get("enabled") is False: it["x"]["enabled"] = None   # turn every dark item on to test its logic
M = {"sex": "male", "age_years": 55}
K = {**M,"dm_status":"known","dm_type_recorded":"type_2"}
run({**K,"glucose_lowering_therapy":["metformin"],"egfr":28,"glucose_goal_unmet_on_oral":True,"hba1c":8.5}, label="H11a (enabled) met eGFR28 above target")
run({**K,"glucose_lowering_therapy":["metformin"],"glucose_goal_unmet_on_oral":True,"hba1c":8.5}, label="H11b (enabled) met eGFR unknown above target")
run({**K,"glucose_lowering_therapy":["metformin","dpp4_inhibitor"],"glucose_goal_unmet_on_oral":True,"hba1c":8.5,"egfr":80}, label="H34 (enabled) met+dpp4")
run({**K,"glucose_lowering_therapy":["none"],"glycaemic_target_tier":"relaxed","hba1c":7.6,"fasting_pg":14}, label="H36 (enabled) relaxed 7.6 fpg 14")
run({**K,"glucose_lowering_therapy":["none"],"iron_deficiency":True,"hba1c":7.3,"fasting_pg":5.9,"egfr":80}, label="H05d (enabled) iron def HbA1c 7.3 fpg 5.9")
run({**K,"glucose_lowering_therapy":["none"],"hiv_on_art":True,"hba1c":6.4,"fasting_pg":9.0,"egfr":80}, label="(enabled) ART HbA1c 6.4 fpg 9.0 -> RX-01?")
run({**K,"glucose_lowering_therapy":["metformin"],"hba1c":7.0,"egfr":80,"cvd_established":True,"on_statin":False,"age_years":45}, label="(enabled) CVD")
