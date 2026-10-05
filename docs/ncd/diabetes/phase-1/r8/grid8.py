"""R8 women's probe grid: cells the k_grid women grid does not hold (glucose recorded, BP normal, organ damage without BP, diabetes profiles)."""
from h import *
import itertools, collections
PREG = {"pregnant": {"pregnant": True, "gestation_weeks": 30}, "pp2": {"pregnant": False, "postpartum_weeks": 2}, "unknown": {},
        "notpreg_ppblank": {"pregnant": False}}
BP = {"none": {}, "120/80": {"bp_systolic": 120, "bp_diastolic": 80}, "145/95": {"bp_systolic": 145, "bp_diastolic": 95}}
SYM = {"organ": {"hypertensive_organ_damage": True}, "drowsy": {"mental_status": "drowsy"}, "headache": {"hypertensive_symptoms": True}}
GLU = {"none": {}, "6": {"capillary_glucose": 6.0}}
PROF = {"nodm": ({}, False), "T2": ({"dm_status": "known", "dm_type_recorded": "type_2", "glucose_lowering_therapy": ["metformin"]}, True),
        "GDM": ({"dm_type_recorded": "gestational"}, True)}
cnt = collections.Counter(); ex = {}
for (p, pv), (b, bv), (s, sv), (g, gv), (pr, (prv, est)) in itertools.product(PREG.items(), BP.items(), SYM.items(), GLU.items(), PROF.items()):
    if pr == "GDM" and p != "pregnant": continue
    r = build.run_vignette({"id": "G", "site": "referral", "established": est, "ageBand": "adult", "values": {"sex": "female", "age_years": 30, **pv, **bv, **sv, **gv, **prv}})
    urg = {r["urgency"].get(k) for k in r["fired"]}
    top = "immediate" if (urg & {"immediate", "folded"}) else "same_day" if "same_day" in urg else None
    key = None
    if s in ("organ", "drowsy") and b == "none" and top != "immediate": key = f"{s}+BP not recorded -> {top}"
    elif s in ("organ",) and b == "120/80" and p in ("pregnant", "pp2") and top is None: key = "pregnant/pp organ damage, BP 120/80 -> nothing"
    elif s == "headache" and b == "145/95" and p in ("unknown", "notpreg_ppblank") and top is None: key = f"headache 145/95, {p} -> nothing"
    if key:
        cnt[key] += 1; ex.setdefault(key, (p, b, s, g, pr, sorted(r["fired"])))
for k, v in sorted(cnt.items()): print(v, k, "eg", ex[k])
