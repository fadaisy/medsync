from h import *
import itertools, collections
RANK = {None: 0, "routine": 0, "urgent": 1, "same_day": 2, "immediate": 3, "folded": 3}
def top(r): return max([RANK.get(r["urgency"].get(k), 0) for k in r["fired"]] + [0])
PREG = {"pregnant": {"pregnant": True, "gestation_weeks": 30}, "pp2": {"pregnant": False, "postpartum_weeks": 2}, "unknown": {},
        "possible_true": {"pregnancy_possible": True}, "notpreg_ppblank": {"pregnant": False}, "notpreg_notpp": {"pregnant": False, "postpartum_weeks": 30}}
BP = {"none": {}, "118/76": {"bp_systolic": 118, "bp_diastolic": 76}, "145/95": {"bp_systolic": 145, "bp_diastolic": 95}, "165/112": {"bp_systolic": 165, "bp_diastolic": 112},
      "185/125": {"bp_systolic": 185, "bp_diastolic": 125}, "205/115": {"bp_systolic": 205, "bp_diastolic": 115}}
SYM = {"none": {}, "headache": {"hypertensive_symptoms": True}, "organ": {"hypertensive_organ_damage": True}, "drowsy": {"mental_status": "drowsy"},
       "chest": {"chest_pain_or_stroke_symptoms": True}, "vomit": {"vomiting": True}, "headache_organ": {"hypertensive_symptoms": True, "hypertensive_organ_damage": True}}
PROT = {"none": {}, "neg": {"urine_protein_strip": "neg"}, "2+": {"urine_protein_strip": "2plus"}}
DMP = {"nodm": ({}, False), "T2": ({"dm_status": "known", "dm_type_recorded": "type_2", "glucose_lowering_therapy": ["metformin"]}, True),
       "T1": ({"dm_status": "known", "dm_type_recorded": "type_1", "glucose_lowering_therapy": ["insulin"]}, True),
       "GDM": ({"dm_status": "known", "dm_type_recorded": "gestational", "glucose_lowering_therapy": ["metformin"]}, True)}
GL = {"none": {}, "6": {"capillary_glucose": 6.0}}
AGES = {"adolescent": 15, "adult": 30, "adult17": 17}
res = {}
for site, (band, age), (d, (dv, est)), (pr, pv), (bp, bv), (sy, sv), (pt, tv), (g, gv) in itertools.product(("referral", "district"), AGES.items(), DMP.items(), PREG.items(), BP.items(), SYM.items(), PROT.items(), GL.items()):
    b = "adolescent" if age < 16 else "adult"
    r = build.run_vignette({"id": "W", "site": site, "established": est, "ageBand": b, "values": {"sex": "female", "age_years": age, **dv, **pv, **bv, **sv, **tv, **gv}})
    res[(site, band, d, pr, bp, sy, pt, g)] = (top(r), sorted(k for k in r["fired"] if RANK.get(r["urgency"].get(k), 0) >= 2), r["interrupt"])
print("cells", len(res))
BPUP = [("none","118/76"),("118/76", "145/95"), ("145/95", "165/112"), ("165/112", "185/125"), ("165/112","205/115")]
SYUP = [("none", s) for s in SYM if s != "none"] + [("headache","headache_organ"),("organ","headache_organ")]
drops = collections.Counter(); ex = {}
for key, v in res.items():
    site, band, d, pr, bp, sy, pt, g = key
    for lo, hi in BPUP:
        if bp == lo and lo != "none":
            k2 = (site, band, d, pr, hi, sy, pt, g)
            if res[k2][0] < v[0]: drops[("bp", lo, hi, pr, sy)] += 1; ex.setdefault(("bp", lo, hi, pr, sy), (key, v, k2, res[k2]))
    for lo, hi in SYUP:
        if sy == lo:
            k2 = (site, band, d, pr, bp, hi, pt, g)
            if res[k2][0] < v[0]: drops[("sym", lo, hi, pr, bp)] += 1; ex.setdefault(("sym", lo, hi, pr, bp), (key, v, k2, res[k2]))
print("drops", sum(drops.values()))
for k, n in drops.most_common(40): print(n, k, "\n   ", ex[k])
POSS = {"pregnant", "pp2", "unknown", "possible_true", "notpreg_ppblank"}
def chk(name, pred, need):
    bad = [(k, v) for k, v in res.items() if pred(*k) and v[0] < need]
    c = collections.Counter((k[0], k[2], k[3], k[4], k[5]) for k, v in bad)
    print(f"\n== {name}: {len(bad)}")
    for kk, n in c.most_common(30):
        e = next((k, v) for k, v in bad if (k[0], k[2], k[3], k[4], k[5]) == kk); print("  ", n, kk, e)
chk("possible + severe BP + any symptom", lambda site, band, d, pr, bp, sy, pt, g: pr in POSS and bp in ("165/112", "185/125", "205/115") and sy in ("headache", "organ", "drowsy", "headache_organ"), 3)
chk("pregnant/pp severe BP", lambda site, band, d, pr, bp, sy, pt, g: pr in ("pregnant", "pp2") and bp in ("165/112", "185/125", "205/115"), 3)
chk("possible drowsy/organ any BP", lambda site, band, d, pr, bp, sy, pt, g: pr in POSS and sy in ("organ", "drowsy"), 3)
chk("possible + 145/95 + headache", lambda site, band, d, pr, bp, sy, pt, g: pr in POSS and bp == "145/95" and sy in ("headache",), 3)
chk("pregnant 145/95", lambda site, band, d, pr, bp, sy, pt, g: pr in ("pregnant", "pp2") and bp == "145/95", 2)
chk("not preg >180/110 + drowsy/organ/chest", lambda site, band, d, pr, bp, sy, pt, g: bp in ("185/125", "205/115") and sy in ("drowsy", "organ", "chest"), 3)
chk("dm >200/110", lambda site, band, d, pr, bp, sy, pt, g: d != "nodm" and bp in ("205/115", "185/125"), 2)
chk("any drowsy", lambda site, band, d, pr, bp, sy, pt, g: sy == "drowsy", 3)
c = collections.Counter()
for k, v in res.items():
    site, band, d, pr, bp, sy, pt, g = k
    if pr in ("notpreg_notpp",) and sy == "none" and bp in ("118/76", "145/95") and v[0] >= 2: c[(d, bp, tuple(v[1]))] += 1
print("\nnoise notpreg_notpp:", c.most_common(10))
c = collections.Counter()
for k, v in res.items():
    site, band, d, pr, bp, sy, pt, g = k
    if pr in ("unknown","possible_true") and sy == "none" and bp in ("118/76", "145/95","none") and v[0] >= 2: c[(d, pr, bp, tuple(v[1]))] += 1
print("noise unknown:", c.most_common(10))
