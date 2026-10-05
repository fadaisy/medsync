"""Round R11 (independent review, 2026-10-05; docs/ncd/diabetes/phase-1/r11/R11-review.json): the fixes, each tagged with its
finding and proved by a patient in k_r11_vignettes.py. No new clinical number: every value is an existing REF or a quoted claim."""
import copy
from lib import P, crit, cite, FEATURES, REFS
from k_model import REG
from k_review import item, nref, N
import k_r6, k_r7, k_clerk
from k_ug2026 import SYM, FPG, OGTT, A1C

def tag(it, *ws):
    it["x"].setdefault("review", []).extend(w for w in ws if w not in it["x"].get("review", []))
    return it
SU = ["glibenclamide", "gliclazide", "glimepiride"]
SU_INS = ["insulin"] + SU
DM = lambda: k_r7.DM_ANY()

# W01 (critical): 23R no longer stands down on acetone or dehydration; it yields only to signs that interrupt on their own.
_r = item("rules", "DM-ACU-ROUTE-23R")
for _n in _r["x"]["notWhen"]:
    if _n["id"] == "acu_insulin_sick_review_signs":
        _n["any"] = [q for q in _n["any"] if q["feature"] not in ("acetone_breath", "dehydration")]
        _n["label"] = "Blood ketones 1.6 mmol/L or more, urine ketones 2+ or more, deep rapid breathing, or drowsiness (an interrupting rule owns it)"
tag(_r, "W01")
# W02: the tight target never applies on a sulfonylurea or insulin (V13 had dropped the sulfonylurea arm).
_t = item("targets", "tgt_hba1c_tight")
_t["when"]["all"] = [q for q in _t["when"]["all"] if q["feature"] != "glucose_lowering_therapy"] + [P("glucose_lowering_therapy", "!=", g) for g in SU_INS]
_t["when"]["label"] = "A tight target agreed, not on insulin or a sulfonylurea"
_g = item("targets", "tgt_hba1c_general")
for _n in _g["x"]["notWhen"]:
    if _n["id"] == "tgt_general_tight":
        _n["all"] = [P("glycaemic_target_tier", "==", "tight")] + [P("glucose_lowering_therapy", "!=", g) for g in SU_INS]
        _n["label"] = "A tight target agreed, not on insulin or a sulfonylurea (the tight target applies)"
tag(_t, "W02"); tag(_g, "W02")
# W03, W21: the 2026 older-adult target yields to an agreed tier and to the CKD target, and replaces the relaxed one.
_e = item("targets", "tgt_hba1c_elderly_2026")
_e["when"]["atLeast"] = {"n": 1, "of": DM()}
_e["x"]["notWhen"] = [crit("tgt_elderly_tier", "A target tier agreed (general, relaxed, tight or 'avoid symptoms')",
                           all=[P("glycaemic_target_tier", "in", ["general", "relaxed", "tight", "avoid_symptoms"])], claim_id="UG26-TGT-HBA1C")]
_e["x"]["supersedes"] = ["tgt_hba1c_general", "tgt_hba1c_older_healthy"]
item("targets", "tgt_hba1c_relaxed")["x"]["supersedes"].append("tgt_hba1c_elderly_2026")
item("targets", "tgt_hba1c_ckd")["x"]["supersedes"].append("tgt_hba1c_elderly_2026")
tag(_e, "W03", "W21")
# W13: a relax reason gives the relaxed target even with a general or tight tier agreed; only 'avoid symptoms' stands it down.
_rx = item("targets", "tgt_hba1c_relaxed")
for _n in _rx["x"]["notWhen"]:
    if _n["id"] == "tier_not_relaxed":
        _n["all"] = [P("glycaemic_target_tier", "==", "avoid_symptoms")]; _n["label"] = "'Avoid symptoms' agreed (no HbA1c target)"
tag(_rx, "W13")
# W04, W09, W23: the fasting and post-meal bands follow their target; the target stands down for an inpatient and below the older-adult floor.
_FLOOR = [("REF-DM-CTRL-OLDER-FPG-HEALTHY", None), ("REF-DM-CTRL-OLDER-FPG-COMPLEX", [P("frailty_or_limited_life_expectancy"), P("cognitive_impairment")])]
def _below_floor(cid, feat, ref, extra, fasting_cap=False):
    all_ = [P("age_years", ">=", ref="REF-DM-CTRL-OLDER-AGE"), P(feat, "<", ref=ref), P("glucose_lowering_therapy", "in", SU_INS)]
    if fasting_cap: all_.append(P("capillary_glucose_context", "==", "fasting"))
    lab = f"65 or over on insulin or a sulfonylurea, fasting {'meter ' if fasting_cap else ''}glucose below {REFS[ref]['value']} mmol/L" + (" and frail or cognitively impaired" if extra else "")
    return crit(cid, lab, all=all_, any=extra, ref_id=ref)
for _tid in ("tgt_fpg_surrogate", "tgt_ppg_surrogate"):
    _t = item("targets", _tid)
    _t["x"]["notWhen"].append(crit(f"{_tid}_inpatient", "An inpatient (the in-hospital target applies)", all=[P("care_setting", "==", "inpatient")], claim_id="UG26-INPT-TGT"))
    tag(_t, "W09")
_t = item("targets", "tgt_fpg_surrogate")
for _i, (_ref, _extra) in enumerate(_FLOOR):
    _t["x"]["notWhen"].append(_below_floor(f"tgt_fpg_floor_{_i}", "fasting_pg", _ref, _extra))
    _t["x"]["notWhen"].append(_below_floor(f"tgt_fpg_floor_cap_{_i}", "capillary_glucose", _ref, _extra, fasting_cap=True))
tag(_t, "W04")
for _bid, _tid in (("fpg_control_who", "tgt_fpg_surrogate"), ("fcap_control_who", "tgt_fpg_surrogate"), ("ppg_control_who", "tgt_ppg_surrogate"), ("pcap_control_who", "tgt_ppg_surrogate")):
    _b = item("interpretation", _bid); _b["x"]["forTarget"] = _tid; tag(_b, "W04", "W09")
for _sid, _ref, _extra in (("DM-ACT-RX-14", *_FLOOR[0]), ("DM-ACT-RX-14B", *_FLOOR[1])):
    _s = item("management", _sid); _s["x"]["appliesTo"] = {"pregnancy": "any"}; _s["x"]["lessTreatment"] = True; tag(_s, "W23")
    _m = copy.deepcopy(_s); _m["id"] = _sid + "M"
    _m["when"] = _below_floor(_m["id"].lower().replace("-", "_"), "capillary_glucose", _ref, _extra, fasting_cap=True)
    _m["display"] = _s["display"].replace("fasting glucose", "fasting meter glucose")
    _m["x"]["notWhen"] = [crit(f"{_m['id'].lower()}_plasma", f"A fasting plasma glucose below {REFS[_ref]['value']} mmol/L (the plasma prompt owns it)",
                               all=[P("fasting_pg", "<", ref=_ref)], ref_id=_ref)]
    tag(_m, "W04"); REG["management"].append(_m)
# W05: no prediabetes advice in pregnancy (withheld while pregnancy is unanswered); no OGTT offer once diabetes or GDM is recorded.
for _sid in ("DM-ACT-EDU-10B", "DM-ACT-EDU-10C"):
    _s = item("management", _sid); _s["x"]["appliesTo"] = {"pregnancy": "not_pregnant"}; tag(_s, "W05")
_r = item("rules", "DM-SUS-PREG-01")
_r["x"]["notWhen"].append(crit("sus_preg_01_known", "Diabetes or gestational diabetes already recorded", any=DM(), claim_id="UG26-PREG-SCREEN")); tag(_r, "W05")
# W06: IV fluids before transfer is an adult instruction. ROUTE-02 and ROUTE-14 split by age: the under-16 copies route only.
_FLUIDS = ". If this site will transfer the patient, start intravenous fluids before transfer (2026: health centre III starts fluids, then refers)"
for _rid in ("DM-ACU-ROUTE-02", "DM-ACU-ROUTE-14"):
    _a = item("rules", _rid); _a["ageBands"] = ["adult", "older_adult"]
    _c = copy.deepcopy(_a); _c["id"] = _rid + "P"; _c["ageBands"] = ["child", "adolescent"]
    _c["display"] = _a["display"].replace(_FLUIDS, "") + ". Route now; the paediatric DKA pathway gives the fluids"
    REG["rules"].insert(REG["rules"].index(_a) + 1, _c)
    k_r6.ACUTE_ORDER.insert(k_r6.ACUTE_ORDER.index(_rid) + 1, _c["id"])
    tag(_a, "W06"); tag(_c, "W06")
# W07: an unanswered pregnancy counts for the pregnancy ketoacidosis rule.
_r = item("rules", "DM-ACU-ROUTE-35")
_r["x"]["pregnancyUnknownCounts"] = True
_r["x"]["unknownDisplays"] = {"pregnant": "Pregnancy is not recorded: ask now. If pregnant with diabetes and unwell: ketones now and same-day assessment by a medical or diabetes team (JBDS 2023)"}
_r["x"]["unknownUrgency"] = "same_day"; tag(_r, "W07")
# W08: D-DM-30 (signed at GATE A): previous gestational diabetes is a restricted class.
FEATURES["prior_gdm"]["restrictedClass"] = "sexual_reproductive_health"
FEATURES["prior_gdm"].setdefault("x", {})["restrictedClass"] = "sexual_reproductive_health"
FEATURES["prior_gdm"]["x"]["signed"] = "D-DM-30 (GATE A 2026-10-05), applied in R11 (W08)"
# W10: a point-of-care HbA1c diagnoses in no set (UG-04), so it never opens a 'met at this visit' item.
for _c in item("diagnosis", "who_hearts_d_2020")["anyOf"]:
    if any(q["feature"] == "hba1c" for q in _c.get("all") or []):
        _c["all"].append(P("hba1c_point_of_care", "absent")); _c["label"] = _c["label"].replace("HbA1c 6.5%", "Laboratory HbA1c 6.5%")
tag(item("diagnosis", "who_hearts_d_2020"), "W10")
# W20: the 2026 set keeps meter diagnosis where there is no laboratory (D-DM-04, UG-04).
_ug = item("diagnosis_pending", "ug_integrated_dm_2026")
for _c in item("diagnosis", "who_hearts_d_2020")["anyOf"]:
    if _c["id"] in ("who_hd_fcap_symptoms", "who_hd_fcap_repeat", "who_hd_random_cap_symptoms", "who_hd_cap_high_symptoms", "who_hd_cap_hi_symptoms"):
        _m = copy.deepcopy(_c); _m["id"] = "ug26_" + _c["id"][7:]; _ug["anyOf"].append(_m)
tag(_ug, "W20")
# W11: INCID-02 speaks only when one asymptomatic result stands alone.
_r = item("rules", "DM-SUS-INCID-02")
_r["x"]["notWhen"] += [crit("incid_02_symptoms", "A classic symptom or a crisis is recorded (one value diagnoses)", any=SYM(), claim_id="UG26-DX-SINGLE"),
                       crit("incid_02_two_tests", "Two different tests in the diabetes range (fasting 7.0 or more, HbA1c 6.5% or more, 2-hour 11.1 or more)",
                            atLeast=(2, [FPG(), OGTT(), P("hba1c", ">=", ref="REF-DM-DX-UG26-HBA1C")]), claim_id="UG26-DX-TWO")]
tag(_r, "W11")
# W12, W21: the first-visit screen also covers an unrecorded gestation, and yields to the risk-factor rule.
_r = item("rules", "DM-SUS-PREG-03")
_r["when"] = crit("sus_preg_first", "Pregnant (before 24 weeks, or gestation not recorded)", all=[P("pregnant")], claim_id="UG26-PREG-SCREEN")
_r["display"] = _r["display"].replace("Pregnant, before 24 weeks,", "Pregnant (before 24 weeks, or gestation not recorded),")
_ucg = item("rules", "DM-SUS-PREG-UCG")
_r["x"]["notWhen"] += [crit("sus_preg_first_late", "24 weeks or more (DM-SUS-PREG-01 owns it)", all=[P("gestation_weeks", ">=", ref="REF-DM-PREG-UG26-EARLY")], ref_id="REF-DM-PREG-UG26-EARLY"),
                       dict(copy.deepcopy(_ucg["when"]), id="sus_preg_first_ucg", label=_ucg["when"]["label"] + " (DM-SUS-PREG-UCG owns it)")]
tag(_r, "W12", "W21")
# W14 (a): the sick-day displays name acute illness.
for _rid, _old, _new in (("DM-ACU-ROUTE-13", "vomiting, abdominal pain or dehydration", "vomiting, abdominal pain, dehydration or acutely unwell"),
                         ("DM-ACU-ROUTE-23", "with vomiting or abdominal pain", "with vomiting, abdominal pain or acutely unwell"),
                         ("DM-ACU-ROUTE-23D", "vomiting or abdominal pain", "vomiting, abdominal pain or acutely unwell")):
    _r = item("rules", _rid); _r["display"] = _r["display"].replace(_old, _new, 1); tag(_r, "W14")
# W15: aspirin is started from 12 to 16 weeks.
nref("REF-DM-PREG-UG26-ASA-END", "2026 Uganda guideline: aspirin to reduce pre-eclampsia risk is started by this gestation (from 12)", 16, "weeks", ["UG26-PREG-ASA"], "pregnancy")
_s = item("management", "DM-ACT-PREG-ASA-01")
_s["when"]["all"].append(P("gestation_weeks", "<=", ref="REF-DM-PREG-UG26-ASA-END"))
_s["when"]["label"] = "Pregnant, 12 to 16 weeks, with type 1 or type 2 diabetes recorded"
_s["display"] = "Pregnant with type 1 or type 2 diabetes, 12 to 16 weeks: review starting aspirin to reduce the risk of pre-eclampsia (2026); agree it with the antenatal team"
tag(_s, "W15")
# W16: B12 also when never measured.
N("never_b12", "Vitamin B12 never measured", "investigation", "boolean", FEATURES["b12_deficiency"]["section"])
_s = item("management", "DM-ACT-SCREEN-B12-02")
_s["when"]["all"] = [q for q in _s["when"]["all"] if q["feature"] != "months_since_b12"]
_s["when"]["any"] = [P("never_b12"), P("months_since_b12", ">=", ref="REF-DM-CVD-LIPID-INTERVAL")]
_s["when"]["label"] = "On metformin, B12 never measured or 12 months or more since the last"
tag(_s, "W16")
# W17: the 3-monthly HbA1c yields to a relaxed plan and owns the case from HBA1C-01.
_relax = crit("due_hba1c_above_relaxed", "A relaxed or 'avoid symptoms' plan, or a reason to relax (frailty, cognitive impairment, a significant low, impaired awareness: Gold score 4 or more)",
              any=[P("glycaemic_target_tier", "in", ["relaxed", "avoid_symptoms"]), P("frailty_or_limited_life_expectancy"), P("cognitive_impairment"),
                   P("hypo_worst_12m", "in", ["needed_help", "measured_below_3", "repeated"]), P("hypo_awareness_score", ">=", ref="REF-DM-HYPO-IAH")], ref_id="REF-DM-HYPO-IAH")
_s = item("management", "DM-ACT-TEST-HBA1C-03"); _s["x"]["notWhen"].append(_relax); tag(_s, "W17")
_s1 = item("management", "DM-ACT-TEST-HBA1C-01")
_s1["x"].setdefault("notWhen", []).append(crit("due_hba1c_6_above", "Last HbA1c 7.0% or more and 3 months or more ago (DM-ACT-TEST-HBA1C-03 owns it)",
                                               all=[P("hba1c", ">=", ref="REF-DM-CTRL-HBA1C-TARGET"), P("months_since_hba1c", ">=", ref="REF-DM-CTRL-WINDOW-ABOVE")],
                                               ref_id="REF-DM-CTRL-WINDOW-ABOVE"))
tag(_s1, "W17")
# W18: the clerking mirrors follow the changed numbers, and the build checks that they do.
for _k, _v in k_clerk.DX_REFS.items():
    if _v.get("mirrors") in REFS and _v["value"] != REFS[_v["mirrors"]]["value"]:
        _v["value"] = REFS[_v["mirrors"]]["value"]
for _d in REG.get("ddx_rules", []) + getattr(k_clerk, "DDX_RULES", []):
    if isinstance(_d, dict) and _d.get("id") == "DDX-GLUCOSE-VERY-HIGH": _d["why"] = "Glucose 30.0 mmol/L or more"
for _a in REG["complication_amendments"]:
    _w = _a.get("change", {})
    if isinstance(_w, dict) and isinstance(_w.get("what"), str):
        _w["what"] = _w["what"].replace("bicarbonate below 18", "bicarbonate below 15").replace("Glucose 33.3 or more", "Glucose 30.0 or more")
assert all(v["value"] == REFS[v["mirrors"]]["value"] for v in k_clerk.DX_REFS.values() if v.get("mirrors") in REFS), "a clerking mirror differs from its REF-DM"
# W19: wording within the source's reach.
_s = item("management", "DM-ACT-RX-04B")
_s["display"] = "On a steroid, with diabetes, not on insulin: if the dose is high, the 2026 guideline lists this as an indication for insulin. Review treatment"
tag(_s, "W19")
_s = item("management", "DM-ACT-RX-04")
_s["display"] = ("Type 2 or unclassified diabetes, not on insulin, with HbA1c 10% or more, a fasting glucose above 14 or any other glucose above 16.7 mmol/L: "
                 "the 2026 guideline starts insulin at these values at diagnosis; in an established patient, review treatment (a value taken during an "
                 "acute illness may settle). Check ketones first")
tag(_s, "W19")
# W21: duplicates for one event.
_s = item("management", "DM-ACT-RX-06C")
_r6 = item("management", "DM-ACT-RX-06")
_s["x"].setdefault("notWhen", []).append(dict(copy.deepcopy(_r6["when"]), id="rx_06c_owned", label=_r6["when"]["label"] + " (DM-ACT-RX-06 owns it)"))
tag(_s, "W21")
_r = item("rules", "DM-SUS-INPT-02")
_r["x"]["notWhen"] = [crit("sus_admitted_done", "A glucose recorded at this visit, or diabetes already known",
                           any=[P(f, "recorded") for f in ("random_pg", "capillary_glucose", "fasting_pg", "hba1c")] + DM(), claim_id="UG26-INPT-SCREEN")]
tag(_r, "W21")
# W22: the pioglitazone flag cites the sentence it uses.
_f = next(f for f in REG["therapyFlags"] if f["id"] == "pioglitazone_age_60"); _f["citation"] = cite("UG26-PIO"); tag(_f, "W22")

# W08: neutral text for the items that read previous gestational diabetes (no restricted word).
import k_review
k_review.NEUTRAL.update({
    "DM-SUS-RISK-05": "A risk factor for diabetes: a glucose test at least every 3 years",
    "DM-SUS-PREG-02": "Re-test glucose 6 to 12 weeks after the birth, then every 1 to 3 years",
    "DM-SUS-PREG-UCG": "A risk factor for raised glucose: test for it now (a 75 g OGTT where available, otherwise a fasting glucose)",
})
