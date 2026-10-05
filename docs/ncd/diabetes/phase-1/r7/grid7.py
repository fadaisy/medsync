"""R7 extended grid: adds lab glucose fields, LO, 33.3+, urine ketones 2+/3+, acetone, dehydration, abdominal pain,
acute illness, combined states, older adults, more 'has diabetes' profiles, district site. Floor rows R7-* are the
reviewer's; each cites the pack rule or source that already sets the threshold (no invented numbers)."""
import itertools, json, collections, sys
from base import build
RUN = build.run_vignette
BANDS = {"adult": 45, "older_adult": 75, "child": 8, "adolescent": 14}
PROF = {
 "noinfo": {}, "T2_metf": dict(dm_status="known", dm_type_recorded="type_2", glucose_lowering_therapy=["metformin"]),
 "T2_diet": dict(dm_status="known", dm_type_recorded="type_2", glucose_lowering_therapy=["none"]),
 "T2_SU": dict(dm_status="known", dm_type_recorded="type_2", glucose_lowering_therapy=["metformin", "glibenclamide"]),
 "T1_ins": dict(dm_status="known", dm_type_recorded="type_1", glucose_lowering_therapy=["insulin"]),
 "SGLT2": dict(dm_status="known", dm_type_recorded="type_2", glucose_lowering_therapy=["metformin", "sglt2_inhibitor"]),
 "blanklist": dict(dm_status="known", dm_type_recorded="type_2"), "status_only": dict(dm_status="known"),
 "T2_typeonly": dict(dm_type_recorded="type_2"), "ins_nostatus": dict(glucose_lowering_therapy=["insulin"]),
 "SU_nostatus": dict(glucose_lowering_therapy=["gliclazide"]), "SGLT2_nostatus": dict(glucose_lowering_therapy=["sglt2_inhibitor"]),
 "T1_nostatus": dict(dm_type_recorded="type_1"),
}
INS_SU_UNK = {"T2_SU", "T1_ins", "blanklist", "status_only", "T2_typeonly", "ins_nostatus", "SU_nostatus", "T1_nostatus"}
T1INS = {"T1_ins", "ins_nostatus", "T1_nostatus"}
SGLT = {"SGLT2", "SGLT2_nostatus"}
STATES = {"well": {}, "vomit": {"vomiting": True}, "abdo": {"abdominal_pain": True}, "kussmaul": {"deep_rapid_breathing": True},
          "acetone": {"acetone_breath": True}, "dehydr": {"dehydration": True}, "drowsy": {"mental_status": "drowsy"},
          "vomit+drowsy": {"vomiting": True, "mental_status": "drowsy"}, "vomit+dehydr": {"vomiting": True, "dehydration": True},
          "acute_ill": {"acute_illness_current": True}}
GLU = {"none": ({}, None), "c3.5": ({"capillary_glucose": 3.5}, 3.5), "c7": ({"capillary_glucose": 7.0}, 7.0), "c15": ({"capillary_glucose": 15.0}, 15.0),
       "c28": ({"capillary_glucose": 28.0}, 28.0), "c35": ({"capillary_glucose": 35.0}, 35.0), "HI": ({"glucose_meter_extreme": "hi"}, 99), "LO": ({"glucose_meter_extreme": "lo"}, 0),
       "rpg3.5": ({"random_pg": 3.5}, 3.5), "rpg28": ({"random_pg": 28.0}, 28.0), "fpg2.5": ({"fasting_pg": 2.5}, 2.5)}
KET = {"none": ({}, None), "u_neg": ({"urine_ketones": "neg"}, 0), "u_tr": ({"urine_ketones": "trace"}, 0.8), "u_1": ({"urine_ketones": "1plus"}, 1.0),
       "u_2": ({"urine_ketones": "2plus"}, 3.1), "u_3": ({"urine_ketones": "3plus"}, 3.1), "b0.3": ({"bohb": 0.3}, 0.3), "b1.0": ({"bohb": 1.0}, 1.0),
       "b2.0": ({"bohb": 2.0}, 2.0), "b3.5": ({"bohb": 3.5}, 3.5)}
DISTRICT_OK_G = {"none", "c3.5", "c7", "c15", "c28", "c35", "HI", "LO"}
DISTRICT_OK_K = {"none", "u_neg", "u_tr", "u_1", "u_2", "u_3"}
TEST_ONLY = {"DM-ACU-ROUTE-15", "DM-ACU-ROUTE-20", "DM-ACU-ROUTE-32", "DM-ACU-ROUTE-03"}      # interrupts whose action is 'measure'
ROUTING = {"DM-ACU-ROUTE-02", "DM-ACU-ROUTE-04", "DM-ACU-ROUTE-11", "DM-ACU-ROUTE-14", "DM-ACU-ROUTE-24", "DM-ACU-ROUTE-25", "DM-ACU-ROUTE-30",
           "DM-ACU-ROUTE-31", "DM-ACU-ROUTE-06", "DM-ACU-ROUTE-07", "DM-ACU-ROUTE-17", "DM-ACU-ROUTE-29", "DM-ACU-ROUTE-05"}

def floor(band, prof, st, g, k):
    dm = prof != "noinfo"; child = band in ("child", "adolescent"); s = set(st.split("+"))
    gv = GLU[g][1]; kv = KET[k][1]
    high = gv is not None and gv >= 11.1
    sick = s & {"vomit", "abdo", "acute_ill", "dehydr"}
    rows = []
    if g in ("HI", "c35"): rows.append(("I1 glucose HI or >=33.3 (ROUTE-14)", 3))
    if gv is not None and gv < 3.0: rows.append(("I2 glucose <3.0 or LO (ROUTE-06)", 3))
    if gv is not None and gv < 3.9 and "drowsy" in s: rows.append(("I3 <3.9 + drowsy (ROUTE-31)", 3))
    if gv is not None and gv < 3.9 and prof in INS_SU_UNK: rows.append(("I4 <3.9 on insulin/SU/T1/unknown list (ROUTE-07)", 3))
    if kv is not None and kv >= 3.0 and (dm or high): rows.append(("I5 ketones 2+/>=3.0 with diabetes or high glucose (ROUTE-02)", 3))
    if kv == 2.0 and "vomit" in s and (dm or high): rows.append(("I6 bohb 1.6-2.9 + vomiting (ROUTE-30)", 3))
    if s & {"kussmaul", "acetone", "drowsy"} and (dm or high) and not (gv is not None and gv < 3.9): rows.append(("I7 Kussmaul/acetone/drowsy with diabetes or high glucose (ROUTE-11/24/25, UCG-DKA-03)", 3))
    if "dehydr" in s and (high or prof in T1INS | SGLT or (child and dm)): rows.append(("I8 dehydration with high glucose, or insulin/T1/SGLT2, or child with diabetes (ROUTE-11/24/25)", 3))
    if child and dm and s & {"vomit", "abdo"} and g == "none": rows.append(("I9 child with diabetes, vomiting/pain, no glucose (ROUTE-32)", 3))
    if child and s & {"kussmaul", "drowsy"} and g == "none": rows.append(("I10 child Kussmaul/drowsy no glucose (ROUTE-15)", 3))
    if prof in SGLT and s & {"vomit", "abdo", "kussmaul", "drowsy", "dehydr", "acute_ill"} and k != "b0.3": rows.append(("I11 SGLT2 + sick (ROUTE-03)", 3))
    if gv is not None and gv >= 18 and k == "none": rows.append(("S1 glucose >=18, no ketone result (ROUTE-01)", 2))
    if dm and "vomit" in s and gv is not None and gv >= 18: rows.append(("S2 diabetes + vomiting + glucose >=18 (ROUTE-34)", 2))
    if dm and sick and k in ("u_tr", "u_1", "b1.0"): rows.append(("S3 diabetes + unwell + ketones trace/1+/0.6-1.5 (ROUTE-21/21B)", 2))
    if k == "b2.0" and (dm or high): rows.append(("S4 bohb 1.6-2.9 (ROUTE-22)", 2))
    if prof in T1INS and s & {"vomit", "abdo"} and k != "b0.3": rows.append(("S5 T1/insulin + vomiting/pain, no normal blood ketone (ROUTE-23)", 2))
    if dm and gv is not None and gv < 3.9: rows.append(("S6 diabetes + glucose <3.9 (ROUTE-26)", 2))
    if dm and not child and s & {"vomit", "abdo", "dehydr"} and g == "none": rows.append(("S7 adult diabetes + unwell, no glucose (ROUTE-13)", 2))
    if child and not dm and gv is not None and gv > 11: rows.append(("S8 child glucose >11 (PAED-03)", 2))
    return rows

def noise(band, prof, st, g, k, top):
    s = set(st.split("+"))
    if prof in ("T2_metf", "T2_diet") and s <= {"dehydr", "acetone"} and s and g in ("c7",) and k in ("u_neg", "b0.3") and top == 3:
        return "N1 metformin/diet, dehydration or acetone only, glucose 7, ketones normal -> interrupt"
    return None

RANK = {None: 0, "routine": 0, "urgent": 1, "same_day": 2, "immediate": 3, "folded": 3}
def main():
    stats = collections.Counter(); ex = collections.defaultdict(list); ncell = 0
    for site in ("referral", "district"):
        for (band, age), (prof, pv), (st, sv), (g, (gv, _)), (k, (kv, _)) in itertools.product(BANDS.items(), PROF.items(), STATES.items(), GLU.items(), KET.items()):
            if site == "district" and (g not in DISTRICT_OK_G or k not in DISTRICT_OK_K): continue
            ncell += 1
            vals = {"sex": "male", "age_years": age, **pv, **sv, **gv, **kv}
            r = RUN({"id": "G7", "site": site, "established": prof != "noinfo", "ageBand": band, "values": vals})
            top = max([RANK.get(r["urgency"].get(i), 0) for i in r["fired"]] + [0])
            cell = f"{site}.{band}.{prof}.{st}.g={g}.k={k}"
            for row, need in floor(band, prof, st, g, k):
                if top < need:
                    stats["silent:" + row] += 1
                    if len(ex[row]) < 6: ex[row].append((cell, sorted((i, r["urgency"].get(i)) for i in r["fired"] if RANK.get(r["urgency"].get(i), 0) >= 1)))
            n = noise(band, prof, st, g, k, top)
            if n:
                stats["noise:" + n] += 1
                if len(ex[n]) < 3: ex[n].append((cell, r["interrupt"]))
            if r["interrupt"] in TEST_ONLY and set(r["foldedInto"]) & ROUTING:
                key = f"Q test-request interrupt {r['interrupt']} over folded routing {sorted(set(r['foldedInto']) & ROUTING)}"
                stats["order:" + r["interrupt"]] += 1
                if len(ex[key]) < 2: ex[key].append(cell)
            if r["foldedInto"]: stats["cells_with_folded_items"] += 1
            if sum(1 for i in r["fired"] if r["urgency"].get(i) == "same_day") and r["interrupt"]: stats["same_day_items_beside_an_interrupt"] += 1
    print("cells", ncell)
    for kk, v in sorted(stats.items()): print(f"{v:6d}  {kk}")
    for kk, v in ex.items():
        print("\n#", kk)
        for e in v: print("   ", e)
if __name__ == "__main__": main()
