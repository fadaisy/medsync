"""Interrupt audit grid. Usage: python3 grid.py [r4]  -> writes grid-<tag>.json"""
import sys, json, itertools
TAG = "r4" if "r4" in sys.argv else "r5"
import importlib; B = importlib.import_module("base_r4" if TAG == "r4" else "base")
PROF = {
 "noinfo":      ({}, False),
 "T2_metf":     ({"dm_status":"known","dm_type_recorded":"type_2","glucose_lowering_therapy":["metformin"]}, True),
 "T2_SU":       ({"dm_status":"known","dm_type_recorded":"type_2","glucose_lowering_therapy":["metformin","gliclazide"]}, True),
 "T1_ins":      ({"dm_status":"known","dm_type_recorded":"type_1","glucose_lowering_therapy":["insulin"]}, True),
 "SGLT2":       ({"dm_status":"known","dm_type_recorded":"type_2","glucose_lowering_therapy":["metformin","sglt2_inhibitor"]}, True),
 "blanklist":   ({"dm_status":"known","dm_type_recorded":"type_2"}, True),
 "ins_nostatus":({"glucose_lowering_therapy":["insulin"]}, True),
 "T1_nostatus": ({"dm_type_recorded":"type_1"}, True),
}
STATE = {"well":{}, "vomit":{"vomiting":True}, "kussmaul":{"deep_rapid_breathing":True}, "drowsy":{"mental_status":"drowsy"}}
GLU = {"none":{}, "3.5":{"capillary_glucose":3.5}, "7":{"capillary_glucose":7.0}, "15":{"capillary_glucose":15.0}, "28":{"capillary_glucose":28.0}, "HI":{"glucose_meter_extreme":"hi"}}
KET = {"none":{}, "u_neg":{"urine_ketones":"neg"}, "u_trace":{"urine_ketones":"trace"}, "u_1+":{"urine_ketones":"1plus"}, "b0.3":{"bohb":0.3}, "b1.0":{"bohb":1.0}, "b2.0":{"bohb":2.0}, "b3.5":{"bohb":3.5}}
BANDS = {"adult":45, "child":8, "adolescent":14}
out = []
for (bn, age), (pn, (pv, est)), (sn, sv), (gn, gv), (kn, kv) in itertools.product(BANDS.items(), PROF.items(), STATE.items(), GLU.items(), KET.items()):
    v = {"sex":"male", "age_years":age, **pv, **sv, **gv, **kv}
    r = B.run(v, band=bn, est=est, site="referral")
    acute = {k: r["urgency"].get(k) for k in r["fired"] if r["urgency"].get(k) in ("same_day","immediate","urgent")}
    out.append({"band":bn, "prof":pn, "state":sn, "glu":gn, "ket":kn, "acute":acute, "dark":list(r["dark"])})
json.dump(out, open(f"grid-{TAG}.json","w"))
print(TAG, len(out))
