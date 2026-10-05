from h import *
for site in ("referral","district"):
  for band,age in (("child",7),("adolescent",13),("adult",40),("older_adult",70)):
    for est in (False, True):
        r = build.run_vignette({"id":"E","site":site,"established":est,"ageBand":band,"values":{}})
        r2 = build.run_vignette({"id":"E","site":site,"established":est,"ageBand":band,"values":{"age_years":age}})
        if r["fired"] or r2["fired"] or r["targets"] or r2["targets"]: print("EMPTY", site, band, est, dict(r["fired"]), dict(r2["fired"]), r["targets"], r2["targets"])
# ordinary well known patients
import itertools
for site in ("referral","district"):
  for age,band in ((25,"adult"),(45,"adult"),(70,"older_adult")):
    for sex in ("male","female"):
      for th in (["metformin"],["insulin"],["gliclazide"],["metformin","insulin"]):
        v={"age_years":age,"sex":sex,"dm_status":"known","dm_type_recorded":"type_2" if th!=["insulin"] else "type_1","glucose_lowering_therapy":th,"bp_systolic":124,"bp_diastolic":76,"hba1c":6.8,"months_since_hba1c":2,"capillary_glucose":6.5,"capillary_glucose_context":"fasting","egfr":85}
        if sex=="female": v["pregnant"]=False
        r = build.run_vignette({"id":"W","site":site,"established":True,"ageBand":band,"values":v})
        hi = {k:r["urgency"].get(k) for k in r["fired"] if r["urgency"].get(k) in ("same_day","immediate","urgent")}
        if hi: print("WELL noisy", site, age, sex, th, hi)
