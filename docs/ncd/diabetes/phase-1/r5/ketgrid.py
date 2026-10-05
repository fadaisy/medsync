from r5lib import run
KET = [("u trace",{"urine_ketones":"trace"}),("u 1+",{"urine_ketones":"1plus"}),("b 0.8",{"bohb":0.8}),("b 1.5",{"bohb":1.5}),("b 2.0",{"bohb":2.0}),("b 2.9",{"bohb":2.9}),("b 3.5",{"bohb":3.5}),("u 3+",{"urine_ketones":"3plus"})]
CTX = [("knownT2 metf",{"dm_status":"known","dm_type_recorded":"type_2","glucose_lowering_therapy":["metformin"]},True),
       ("insulin, status blank",{"glucose_lowering_therapy":["insulin"]},True),
       ("SGLT2, status blank",{"glucose_lowering_therapy":["sglt2_inhibitor"]},True),
       ("T1 recorded, status blank",{"dm_type_recorded":"type_1"},True),
       ("no DM",{"dm_status":"not_known"},False)]
for gl in (7.0, 14.0):
  for cn, cv, est in CTX:
    for vom in (False, True):
      for kn, kv in KET:
        v = {"sex":"male","age_years":40, "capillary_glucose":gl, **cv, **kv}
        if vom: v["vomiting"] = True
        r = run(v, est=est, quiet=True)
        f = [f"{i.replace('DM-ACU-ROUTE-','R').replace('DM-ACT-','').replace('DM-CLS-','')}:{r['urgency'].get(i,'flag')[:4]}" for i,k in r["fired"].items() if not (k=="step" and r["urgency"].get(i)=="routine")]
        print(f"glu{gl:<5} {cn:26s} vom={int(vom)} {kn:8s} -> {' '.join(f) or 'NOTHING'}")
