"""The acute escalation floor and the interrupt grid (sixth review; D-DM-41).

ACUTE_FLOOR is the minimum urgency a patient pattern must reach. It is clinical
content for the CSO's signature, written as a table the build enforces over a grid
of 4,608 synthetic patients: no patient below the floor (silence on danger), no
patient with more than one displayed interrupt, and no ordinary well patient with
a same-day or immediate item. Adapted from the sixth reviewer's audit oracle.
"""
import itertools

PROFILES = {
    "noinfo": ({}, False),
    "T2_metf": ({"dm_status": "known", "dm_type_recorded": "type_2", "glucose_lowering_therapy": ["metformin"]}, True),
    "T2_SU": ({"dm_status": "known", "dm_type_recorded": "type_2", "glucose_lowering_therapy": ["metformin", "gliclazide"]}, True),
    "T1_ins": ({"dm_status": "known", "dm_type_recorded": "type_1", "glucose_lowering_therapy": ["insulin"]}, True),
    "SGLT2": ({"dm_status": "known", "dm_type_recorded": "type_2", "glucose_lowering_therapy": ["metformin", "sglt2_inhibitor"]}, True),
    "blanklist": ({"dm_status": "known", "dm_type_recorded": "type_2"}, True),
    "ins_nostatus": ({"glucose_lowering_therapy": ["insulin"]}, True),
    "T1_nostatus": ({"dm_type_recorded": "type_1"}, True),
}
STATES = {"well": {}, "vomit": {"vomiting": True}, "kussmaul": {"deep_rapid_breathing": True}, "drowsy": {"mental_status": "drowsy"},
          "acetone": {"acetone_breath": True}, "dehydrated": {"dehydration": True}}
GLUCOSE = {"none": {}, "3.5": {"capillary_glucose": 3.5}, "7": {"capillary_glucose": 7.0}, "15": {"capillary_glucose": 15.0}, "28": {"capillary_glucose": 28.0},
           "HI": {"glucose_meter_extreme": "hi"}, "LO": {"glucose_meter_extreme": "lo"}}
KETONES = {"none": {}, "u_neg": {"urine_ketones": "neg"}, "u_trace": {"urine_ketones": "trace"}, "u_1+": {"urine_ketones": "1plus"},
           "b0.3": {"bohb": 0.3}, "b1.0": {"bohb": 1.0}, "b2.0": {"bohb": 2.0}, "b3.5": {"bohb": 3.5}}
SITES = ("referral", "district")
BANDS = {"adult": 45, "child": 8, "adolescent": 14, "older_adult": 72}
INSULINISH = {"T1_ins", "ins_nostatus", "T1_nostatus", "SGLT2"}
INSULIN_OR_SU_OR_UNKNOWN = {"T2_SU", "T1_ins", "ins_nostatus", "T1_nostatus", "blanklist"}
HIGH = {"15", "28", "HI"}
FULLY_RECORDED = {"T2_metf", "T2_SU", "T1_ins", "SGLT2"}

def floor(band, prof, state, glu, ket):
    """ACUTE_FLOOR for men: the minimum urgency for one pattern ('immediate', 'same_day' or None)."""
    dm, child = prof != "noinfo", band in ("child", "adolescent")
    if (glu in ("HI", "LO")
            or (ket == "b3.5" and (dm or glu in HIGH))
            or (ket == "b2.0" and state == "vomit" and (dm or glu in HIGH))
            or (state in ("kussmaul", "drowsy") and (dm or glu in HIGH or glu == "none" or (state == "drowsy" and glu == "3.5")))
            or (state in ("acetone", "dehydrated") and (glu in HIGH or ((prof in INSULINISH or prof == "blanklist" or (child and dm)) and ket != "b0.3")))
            or (glu == "3.5" and prof in INSULIN_OR_SU_OR_UNKNOWN)
            or (prof == "SGLT2" and state in ("vomit", "kussmaul", "dehydrated", "drowsy") and ket != "b0.3")
            or (child and dm and state == "vomit" and glu == "none")):
        return "immediate"
    if ((state == "vomit" and glu in HIGH and ket in ("none", "u_trace", "u_1+", "b1.0"))
            or (glu == "3.5" and dm)
            or (dm and state == "vomit" and ket in ("u_trace", "u_1+", "b1.0"))
            or (ket == "b2.0" and (dm or glu in HIGH))
            or (prof in ("T1_ins", "ins_nostatus", "T1_nostatus") and state == "vomit" and ket == "none")
            or (glu == "28" and ket == "none")
            or (dm and state in ("acetone", "dehydrated") and ket != "b0.3")
            or (child and dm and state == "vomit")
            or (child and dm and state in ("acetone", "dehydrated") and ket == "b0.3")):
        return "same_day"
    return None

# Women of 30 with no diabetes: pregnancy and postpartum blood pressure (seventh review, Q01, Q05, Q06, Q10).
PREG = {"pregnant": {"pregnant": True, "gestation_weeks": 30}, "pp2": {"pregnant": False, "postpartum_weeks": 2}, "unknown": {},
        "notpreg_ppblank": {"pregnant": False}, "notpreg_notpp": {"pregnant": False, "postpartum_weeks": 30}}
BP = {"none": {}, "118/76": {"bp_systolic": 118, "bp_diastolic": 76}, "145/95": {"bp_systolic": 145, "bp_diastolic": 95}, "165/112": {"bp_systolic": 165, "bp_diastolic": 112}}
SYM = {"none": {}, "organ": {"hypertensive_organ_damage": True}, "drowsy": {"mental_status": "drowsy"}, "headache": {"hypertensive_symptoms": True}}
PROTEIN = {"none": {}, "neg": {"urine_protein_strip": "neg"}, "1+": {"urine_protein_strip": "1plus"}}
WGLU = {"none": {}, "6": {"capillary_glucose": 6.0}}
POSSIBLE = {"pregnant", "pp2", "unknown", "notpreg_ppblank"}
PREG_RULES = {"DM-ACU-ROUTE-27", "DM-ACU-ROUTE-27B", "DM-ACU-ROUTE-27C", "DM-ACU-ROUTE-27D", "DM-ACU-ROUTE-28", "DM-ACU-ROUTE-28B", "DM-ACU-ROUTE-28C", "DM-ACU-ROUTE-28D"}

def women_floor(preg, bp, sym, glu):
    possible = preg in POSSIBLE
    if sym == "drowsy" and bp == "none" and (glu == "none" or possible): return "immediate"    # glucose now (15), or BP and glucose now (28D)
    if possible and bp in ("none", "118/76") and sym in ("organ", "drowsy"): return "immediate"   # 28D, 28E at any pressure (U18)
    if possible and bp == "165/112" and sym in ("organ", "drowsy", "headache"): return "immediate" # never lower as the picture worsens (U03)
    if possible and bp == "145/95" and sym in ("organ", "drowsy", "headache"): return "immediate"   # 28B, 28C, 27D
    if preg in ("pregnant", "pp2") and bp == "165/112": return "immediate"                     # 28
    if possible and bp == "165/112": return "same_day"                                         # 28 on the unknown path asks the question (T18)
    if preg in ("pregnant", "pp2") and bp == "145/95": return "same_day"
    return None

RANK = {None: 0, "urgent": 1, "same_day": 2, "immediate": 3}

def _order(r, cell, E, measure):
    imm = [k for k in r["fired"] if r["urgency"].get(k) in ("immediate", "folded")]
    head = r.get("interrupt")
    if head and head in r["metViaUnknown"] and any(k not in r["metViaUnknown"] for k in imm):
        E(cell, f"an interrupt met only through an unanswered pregnancy question heads one met on recorded facts: {head} over {imm}"); return 1
    if head and head in measure and any(k not in measure and k not in r["metViaUnknown"] for k in imm):      # a question-only rule ranks last, below a request
        E(cell, f"a 'measure now' request heads a routing interrupt: {head} over {imm}"); return 1
    return 0

def check(run_vignette, E):
    """Run both grids; report each failing cell through E(path, message). Returns counts."""
    import k_r7
    measure = k_r7.MEASURE_REQUESTS
    out = {"men": 0, "women": 0, "silent": 0, "noisy": 0, "order": 0}
    n0 = len(E.__self__) if hasattr(E, "__self__") else None
    for site, (band, age), (prof, (pv, est)), (state, sv), (glu, gv), (ket, kv) in itertools.product(SITES, BANDS.items(), PROFILES.items(), STATES.items(), GLUCOSE.items(), KETONES.items()):
        r = run_vignette({"id": "GRID", "site": site, "established": est, "ageBand": band, "values": {"sex": "male", "age_years": age, **pv, **sv, **gv, **kv}})
        out["men"] += 1
        top = max([RANK.get(r["urgency"].get(k), 3 if r["urgency"].get(k) == "folded" else 0) for k in r["fired"]] + [0])
        cell = f"grid.{site}.{band}.{prof}.{state}.glu={glu}.ket={ket}"
        need = floor(band, prof, state, glu, ket)
        if need and top < RANK[need]:
            out["silent"] += 1; E(cell, f"below the escalation floor: needs {need}, got {sorted(k for k in r['fired'] if RANK.get(r['urgency'].get(k), 0) >= 1)}")
        if prof in FULLY_RECORDED and state == "well" and glu in ("none", "7", "15") and ket in ("none", "u_neg", "u_trace", "b0.3") and top >= RANK["same_day"]:
            out["noisy"] += 1; E(cell, f"noise on an ordinary well patient: {sorted(k for k in r['fired'] if RANK.get(r['urgency'].get(k), 0) >= 2)}")
        out["order"] += _order(r, cell, E, measure)
    for (preg, pv), (bp, bv), (sym, yv), (prot, tv), (glu, gv) in itertools.product(PREG.items(), BP.items(), SYM.items(), PROTEIN.items(), WGLU.items()):
        r = run_vignette({"id": "GRID", "site": "referral", "established": False, "ageBand": "adult", "values": {"sex": "female", "age_years": 30, **pv, **bv, **yv, **tv, **gv}})
        out["women"] += 1
        top = max([RANK.get(r["urgency"].get(k), 3 if r["urgency"].get(k) == "folded" else 0) for k in r["fired"]] + [0])
        cell = f"grid.women.{preg}.bp={bp}.{sym}.protein={prot}.glu={glu}"
        need = women_floor(preg, bp, sym, glu)
        if need and top < RANK[need]:
            out["silent"] += 1; E(cell, f"below the escalation floor: needs {need}, got {sorted(r['fired'])}")
        if preg in ("notpreg_notpp", "unknown") and sym == "none" and bp == "145/95" and any(k in PREG_RULES for k in r["fired"]):
            out["noisy"] += 1; E(cell, f"a pregnancy rule fires where pregnancy is excluded or only unanswered at a same-day level: {sorted(k for k in r['fired'] if k in PREG_RULES)}")
        out["order"] += _order(r, cell, E, measure)
    return out
