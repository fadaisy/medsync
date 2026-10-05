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
STATES = {"well": {}, "vomit": {"vomiting": True}, "kussmaul": {"deep_rapid_breathing": True}, "drowsy": {"mental_status": "drowsy"}}
GLUCOSE = {"none": {}, "3.5": {"capillary_glucose": 3.5}, "7": {"capillary_glucose": 7.0}, "15": {"capillary_glucose": 15.0}, "28": {"capillary_glucose": 28.0}, "HI": {"glucose_meter_extreme": "hi"}}
KETONES = {"none": {}, "u_neg": {"urine_ketones": "neg"}, "u_trace": {"urine_ketones": "trace"}, "u_1+": {"urine_ketones": "1plus"},
           "b0.3": {"bohb": 0.3}, "b1.0": {"bohb": 1.0}, "b2.0": {"bohb": 2.0}, "b3.5": {"bohb": 3.5}}
BANDS = {"adult": 45, "child": 8, "adolescent": 14}
INSULIN_OR_SU_OR_UNKNOWN = {"T2_SU", "T1_ins", "ins_nostatus", "T1_nostatus", "blanklist"}
HIGH = {"15", "28", "HI"}
FULLY_RECORDED = {"T2_metf", "T2_SU", "T1_ins", "SGLT2"}

def floor(band, prof, state, glu, ket):
    """ACUTE_FLOOR: the minimum urgency for one patient pattern ('immediate', 'same_day' or None)."""
    dm, child = prof != "noinfo", band != "adult"
    if (glu == "HI"
            or (ket == "b3.5" and (dm or glu in HIGH))
            or (ket == "b2.0" and state == "vomit" and (dm or glu in HIGH))
            or (state == "kussmaul" and (dm or glu in HIGH or (child and glu == "none")))
            or (state == "drowsy" and (glu == "3.5" or glu in HIGH or (glu == "none" and (dm or child))))
            or (glu == "3.5" and prof in INSULIN_OR_SU_OR_UNKNOWN)
            or (prof == "SGLT2" and state in ("vomit", "kussmaul") and ket != "b0.3")
            or (child and dm and state == "vomit" and glu == "none")):
        return "immediate"
    if ((state == "vomit" and glu in HIGH and ket in ("none", "u_trace", "u_1+", "b1.0"))
            or (glu == "3.5" and dm)
            or (dm and state == "vomit" and ket in ("u_trace", "u_1+", "b1.0"))
            or (ket == "b2.0" and (dm or glu in HIGH))
            or (prof in ("T1_ins", "ins_nostatus", "T1_nostatus") and state == "vomit" and ket == "none")
            or (glu == "28" and ket == "none")):
        return "same_day"
    return None

RANK = {None: 0, "urgent": 1, "same_day": 2, "immediate": 3}

def check(run_vignette, E):
    """Run the grid; report each failing cell through E(path, message). Returns counts."""
    silent = double = noisy = 0
    for (band, age), (prof, (pv, est)), (state, sv), (glu, gv), (ket, kv) in itertools.product(BANDS.items(), PROFILES.items(), STATES.items(), GLUCOSE.items(), KETONES.items()):
        r = run_vignette({"id": "GRID", "site": "referral", "established": est, "ageBand": band, "values": {"sex": "male", "age_years": age, **pv, **sv, **gv, **kv}})
        urg = [r["urgency"].get(k) for k in r["fired"]]
        top = max([RANK.get(u, 0) for u in urg] + [0])
        cell = f"grid.{band}.{prof}.{state}.glu={glu}.ket={ket}"
        need = floor(band, prof, state, glu, ket)
        if need and top < RANK[need]:
            silent += 1; E(cell, f"below the escalation floor: needs {need}, got {sorted(k for k in r['fired'] if r['urgency'].get(k) in ('same_day', 'immediate', 'urgent'))}")
        if urg.count("immediate") > 1:
            double += 1; E(cell, f"more than one interrupt: {sorted(k for k in r['fired'] if r['urgency'].get(k) == 'immediate')}")
        if prof in FULLY_RECORDED and state == "well" and glu in ("none", "7", "15") and ket in ("none", "u_neg", "u_trace", "b0.3") and top >= RANK["same_day"]:
            noisy += 1; E(cell, f"noise on an ordinary well patient: {sorted(k for k in r['fired'] if RANK.get(r['urgency'].get(k), 0) >= 2)}")
    return {"cells": len(BANDS) * len(PROFILES) * len(STATES) * len(GLUCOSE) * len(KETONES), "silent": silent, "double": double, "noisy": noisy}
