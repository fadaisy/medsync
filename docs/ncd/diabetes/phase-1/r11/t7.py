from h import *
M={"sex":"male"}; F={"sex":"female"}
for s in REG["management"]+REG["rules"]:
    if s["x"]["runWhen"] in ("newly_met","established_or_met"): print(s["id"], s["x"]["runWhen"], s["x"].get("urgency", s.get("urgency")), s["x"].get("requiresCapability"))
run({"age_years":45,**M,"polyuria":True,"hba1c":7.0,"hba1c_point_of_care":True},est=False,tag="polyuria + POC HbA1c 7.0")
run({"age_years":45,**M,"polyuria":True,"hba1c":7.0},est=False,tag="polyuria + HbA1c 7.0 (method unrecorded)")
run({"age_years":45,**M,"polyuria":True,"fasting_pg":7.4},est=False,tag="polyuria + fasting 7.4 lab")
run({"age_years":45,**M,"polyuria":True,"fasting_pg":7.4, "capillary_glucose":7.6},est=False,tag="polyuria + fasting 7.4 + meter")
