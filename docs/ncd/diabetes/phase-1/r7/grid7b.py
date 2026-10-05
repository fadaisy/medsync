"""R7 pregnancy / postpartum / BP grid (women 30, adult band, referral site)."""
import itertools, collections
from base import build
RUN = build.run_vignette
PREG = {"unknown": {}, "preg34": {"pregnant": True, "gestation_weeks": 34}, "notpreg_ppblank": {"pregnant": False},
        "pp2w": {"pregnant": False, "postpartum_weeks": 2}, "not_possible": {"pregnancy_possible": False}}
PROF = {"noinfo": {}, "T2_metf": dict(dm_status="known", dm_type_recorded="type_2", glucose_lowering_therapy=["metformin"]),
        "T1_ins": dict(dm_status="known", dm_type_recorded="type_1", glucose_lowering_therapy=["insulin"]),
        "GDM_nostatus": dict(dm_type_recorded="gestational"), "GDM_known": dict(dm_status="known", dm_type_recorded="gestational")}
BP = {"none": {}, "120/80": dict(bp_systolic=120, bp_diastolic=80), "145/95": dict(bp_systolic=145, bp_diastolic=95),
      "165/112": dict(bp_systolic=165, bp_diastolic=112), "190/120": dict(bp_systolic=190, bp_diastolic=120)}
EXTRA = {"none": {}, "headache": {"hypertensive_symptoms": True}, "organ": {"hypertensive_organ_damage": True}, "drowsy": {"mental_status": "drowsy"},
         "stroke": {"chest_pain_or_stroke_symptoms": True}, "vomit": {"vomiting": True}}
GLU = {"none": {}, "c7": {"capillary_glucose": 7.0}, "c3.5": {"capillary_glucose": 3.5}, "HI": {"glucose_meter_extreme": "hi"}}
KET = {"none": {}, "b3.5": {"bohb": 3.5}, "u_3": {"urine_ketones": "3plus"}, "b1.0": {"bohb": 1.0}}
MEASURED = {"DM-ACU-ROUTE-02", "DM-ACU-ROUTE-14", "DM-ACU-ROUTE-17", "DM-ACU-ROUTE-11", "DM-ACU-ROUTE-24", "DM-ACU-ROUTE-29", "DM-ACU-ROUTE-30", "DM-ACU-ROUTE-03"}
RANK = {None: 0, "routine": 0, "urgent": 1, "same_day": 2, "immediate": 3, "folded": 3}
stats = collections.Counter(); ex = collections.defaultdict(list)
def note(key, cell, r):
    stats[key] += 1
    if len(ex[key]) < 4: ex[key].append((cell, r["interrupt"], sorted((i, r["urgency"].get(i)) for i in r["fired"] if RANK.get(r["urgency"].get(i), 0) >= 2)))
for (pk, pv), (prof, prv), (bk, bv), (xk, xv), (gk, gv), (kk, kv) in itertools.product(PREG.items(), PROF.items(), BP.items(), EXTRA.items(), GLU.items(), KET.items()):
    vals = {"sex": "female", "age_years": 30, **pv, **prv, **bv, **xv, **gv, **kv}
    r = RUN({"id": "G7B", "site": "referral", "established": prof != "noinfo", "ageBand": "adult", "values": vals})
    top = max([RANK.get(r["urgency"].get(i), 0) for i in r["fired"]] + [0])
    cell = f"{pk}.{prof}.bp={bk}.{xk}.g={gk}.k={kk}"
    sys_ = bv.get("bp_systolic", 0); dia = bv.get("bp_diastolic", 0)
    pp = pk in ("preg34", "pp2w")
    if pk in ("preg34", "pp2w", "unknown", "notpreg_ppblank"):
        tag = "" if pp else f" [{pk}]"
        if (sys_ >= 160 or dia >= 110) and top < 3: note("silent: pregnant/pp BP>=160/110 needs immediate (UCG-PE-02)" + tag, cell, r)
        if xk == "organ" and top < 3: note("silent: pregnant/pp organ damage needs immediate (UCG-PE-02)" + tag, cell, r)
        if xk == "drowsy" and sys_ >= 140 and top < 3: note("silent: pregnant/pp drowsy BP>=140/90 needs immediate (28C)" + tag, cell, r)
        if xk == "drowsy" and bk == "none" and gk != "none" and pp and top < 3: note("silent: pregnant/pp drowsy, BP not recorded" + tag, cell, r)
        if sys_ >= 140 and top < 2: note("silent: pregnant/pp BP>=140/90 needs same day (UCG-PE-03/CHTN-03)" + tag, cell, r)
    if prof.startswith("GDM") and pk in ("preg34",):
        if kk in ("b3.5", "u_3") and top < 3: note("silent: GDM ketones >=3.0/3+ needs immediate (ROUTE-02)", cell, r)
        if gk == "c3.5" and top < 2: note("silent: GDM glucose 3.5", cell, r)
    if r["interrupt"] in ("DM-ACU-ROUTE-28", "DM-ACU-ROUTE-28B", "DM-ACU-ROUTE-28C") and "pregnant" in r["gaps"].get(r["interrupt"], []) and set(r["foldedInto"]) & MEASURED:
        note("order: pregnancy-unknown interrupt shown over a measured emergency", cell, r)
    if pk == "unknown" and prof == "T2_metf" and xk == "none" and gk in ("none", "c7") and kk == "none":
        if top == 3: note("noise: pregnancy unanswered, diabetic woman, no symptoms -> interrupt", cell, r)
        elif top == 2: note("noise: pregnancy unanswered, diabetic woman, no symptoms -> same day", cell, r)
    if xk == "headache" and pp and sys_ >= 140 and r["interrupt"] is None:
        note("info: pregnant/pp BP>=140/90 with headache/blurred vision -> no interrupt", cell, r)
for k, v in sorted(stats.items()): print(f"{v:6d}  {k}")
for k, v in ex.items():
    print("\n#", k)
    for e in v: print("   ", e)
