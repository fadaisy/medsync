"""R10 grids: monotonicity (urgency never falls as the picture worsens) + spot floors."""
from h import *
import itertools, collections, sys
RANK = {None: 0, "routine": 0, "urgent": 1, "same_day": 2, "immediate": 3, "folded": 3}
def top(r): return max([RANK.get(r["urgency"].get(k), 0) for k in r["fired"]] + [0])
PROF = {
 "noinfo": ({}, False),
 "T2_metf": ({"dm_status": "known", "dm_type_recorded": "type_2", "glucose_lowering_therapy": ["metformin"]}, True),
 "T2_SU": ({"dm_status": "known", "dm_type_recorded": "type_2", "glucose_lowering_therapy": ["metformin", "gliclazide"]}, True),
 "T2_ins": ({"dm_status": "known", "dm_type_recorded": "type_2", "glucose_lowering_therapy": ["metformin", "insulin"]}, True),
 "T1_ins": ({"dm_status": "known", "dm_type_recorded": "type_1", "glucose_lowering_therapy": ["insulin"]}, True),
 "SGLT2": ({"dm_status": "known", "dm_type_recorded": "type_2", "glucose_lowering_therapy": ["metformin", "sglt2_inhibitor"]}, True),
 "uncl_metf": ({"dm_status": "known", "dm_type_recorded": "unclassified", "glucose_lowering_therapy": ["metformin"]}, True),
 "other_none": ({"dm_status": "known", "dm_type_recorded": "other", "glucose_lowering_therapy": ["none"]}, True),
 "T2_diet": ({"dm_status": "known", "dm_type_recorded": "type_2", "glucose_lowering_therapy": ["none"]}, True),
 "known_only": ({"dm_status": "known"}, True),
 "T2_dpp4": ({"dm_status": "known", "dm_type_recorded": "type_2", "glucose_lowering_therapy": ["dpp4_inhibitor"]}, True),
}
STATES = {"well": {}, "vomit": {"vomiting": True}, "pain": {"abdominal_pain": True}, "ill": {"acute_illness_current": True},
          "kussmaul": {"deep_rapid_breathing": True}, "drowsy": {"mental_status": "drowsy"}, "acetone": {"acetone_breath": True},
          "dehyd": {"dehydration": True}, "vomit_acetone": {"vomiting": True, "acetone_breath": True}, "vomit_dehyd": {"vomiting": True, "dehydration": True},
          "insulin_omit": {"insulin_omitted": True}}
GLU = {"none": {}, "LO": {"glucose_meter_extreme": "lo"}, "2.5": {"capillary_glucose": 2.5}, "3.5": {"capillary_glucose": 3.5}, "5": {"capillary_glucose": 5.0},
       "9": {"capillary_glucose": 9.0}, "13": {"capillary_glucose": 13.0}, "20": {"capillary_glucose": 20.0}, "30": {"capillary_glucose": 30.0}, "HI": {"glucose_meter_extreme": "hi"}}
KET = {"none": {}, "u_neg": {"urine_ketones": "neg"}, "u_tr": {"urine_ketones": "trace"}, "u_1": {"urine_ketones": "1plus"}, "u_2": {"urine_ketones": "2plus"}, "u_3": {"urine_ketones": "3plus"},
       "b0.3": {"bohb": 0.3}, "b0.8": {"bohb": 0.8}, "b1.8": {"bohb": 1.8}, "b3.5": {"bohb": 3.5}}
BANDS = {"child": 8, "adolescent": 14, "adult": 45, "older_adult": 72}
GLU_UP = [("5", "9"), ("9", "13"), ("13", "20"), ("20", "30"), ("30", "HI"), ("3.5", "2.5"), ("2.5", "LO")]
KET_UP = [("u_neg", "u_tr"), ("u_tr", "u_1"), ("u_1", "u_2"), ("u_2", "u_3"), ("b0.3", "b0.8"), ("b0.8", "b1.8"), ("b1.8", "b3.5")]
ST_UP = [("well", s) for s in STATES if s != "well"] + [("vomit", "vomit_acetone"), ("acetone", "vomit_acetone"), ("vomit", "vomit_dehyd"), ("dehyd", "vomit_dehyd")]
res = {}
for site, (band, age), (p, (pv, est)), (s, sv), (g, gv), (k, kv) in itertools.product(("referral", "district"), BANDS.items(), PROF.items(), STATES.items(), GLU.items(), KET.items()):
    if p == "noinfo" and s == "insulin_omit": continue
    vals = {"sex": "male", "age_years": age, **pv, **sv, **gv, **kv}
    if site == "district" and k.startswith("b"): continue
    r = build.run_vignette({"id": "G", "site": site, "established": est, "ageBand": band, "values": vals})
    res[(site, band, p, s, g, k)] = (top(r), sorted(x for x in r["fired"] if RANK.get(r["urgency"].get(x), 0) >= 2), r["interrupt"])
print("cells", len(res))
drops = collections.Counter(); ex = {}
def cmp(a, b, kind):
    if a in res and b in res and res[b][0] < res[a][0]:
        key = (kind, a[2], a[1]); drops[key] += 1
        ex.setdefault(key, (a, res[a], b, res[b]))
for key in list(res):
    site, band, p, s, g, k = key
    for lo, hi in GLU_UP:
        if g == lo: cmp(key, (site, band, p, s, hi, k), f"glu {lo}->{hi}")
    for lo, hi in KET_UP:
        if k == lo: cmp(key, (site, band, p, s, g, hi), f"ket {lo}->{hi}")
    for lo, hi in ST_UP:
        if s == lo: cmp(key, (site, band, p, hi, g, k), f"state {lo}->{hi}")
print("monotonicity drops:", sum(drops.values()))
for key, n in sorted(drops.items(), key=lambda x: -x[1])[:60]:
    a, ra, b, rb = ex[key]; print(n, key, "\n    ", a, ra, "\n  ->", b, rb)
import pickle; pickle.dump(res, open("/Users/airm1/Desktop/medsync-ncd/docs/ncd/diabetes/phase-1/r10/grid10.pkl", "wb"))
