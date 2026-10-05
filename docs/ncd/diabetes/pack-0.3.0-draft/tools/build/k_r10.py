"""Tenth review (phase-1/r10/R10-review.json, V01 to V18), the last before GATE A.
Its independent sweep (76,800 men, 36,288 women) found no pattern below its floor,
no urgency falling as the picture worsened, and no noise. Two criticals and seven
majors are answered here; these answers have had no independent read and are
listed at GATE A as go-live items. Patients in k_r10_vignettes (DMV-142 onward)."""
import copy
from lib import P, crit, FEATURES, REFS
from k_model import REG, drule
from k_review import (tag, item, last, GLU, GLU_REC, KET_REC, KNOWN, ISU, GLT, HI, DROWSY, SIGNS, MILD, KET2,
                      ADULT, CHILD, DISPOSITION, FIXED)
import k_r5, k_r6, k_r7, k_decisions

PART = "fixed_in_part"; CSO = "cso_decision"
DM_ANY = k_r7.DM_ANY; DM_WORDS = k_r6.DM_WORDS
T1 = lambda: P("dm_type_recorded", "==", "type_1")
ILL = lambda: P("acute_illness_current")

# ── V01  'acutely unwell' starts the sick-day pathway ──────────────────────
for _rid in ("DM-ACU-ROUTE-32", "DM-ACU-ROUTE-13", "DM-ACU-ROUTE-23", "DM-ACU-ROUTE-23D"):
    _r = tag(item("rules", _rid), "V01"); _r["when"]["any"].append(ILL())
    _r["when"]["label"] = _r["when"]["label"].replace("with vomiting or abdominal pain", "with vomiting, abdominal pain or acute illness").replace(
        "with any of: vomiting, abdominal pain, dehydration", "with any of: vomiting, abdominal pain, dehydration, acute illness")
_r = tag(item("rules", "DM-ACU-ROUTE-32B"), "V01")
_r["when"]["all"] = []; _r["when"]["any"] = [P("vomiting"), ILL()]
_r["when"]["label"] = f"A child with diabetes ({DM_WORDS}), vomiting or acutely unwell"
_r["display"] = "A child with diabetes who is vomiting or acutely unwell: sick-day review today, even with a normal glucose and ketones"
item("rules", "DM-ACU-ROUTE-32")["display"] = "A child with diabetes or on insulin, vomiting, in pain or acutely unwell, and no glucose on record: capillary glucose now"

# ── V04  the adult on insulin who is vomiting or unwell gets a review ───────
drule("DM-ACU-ROUTE-23R", "Type 1 or on insulin, vomiting or acutely unwell: sick-day review today, even with normal ketones (glucose and ketones every 1 to 2 hours; never stop insulin)",
      "dka", crit("acu_insulin_sick_review", "Type 1 recorded, or on insulin; vomiting or acutely unwell", any=[P("vomiting"), ILL()], atLeast=(1, [T1(), GLT("insulin")]), ref_id="REF-DM-ACU-SICKDAY-INSULIN"),
      "moderate", "same_day", ["capillary_glucose", "bohb"], ["Gastroenteritis", "Infection"], "A9-49", "DM-ACU-ROUTE", lane="acute_route", ageBands=ADULT,
      notes="ISPAD 2022 sick-day rules: glucose and ketones every 1 to 2 hours, never stop insulin completely, keep hydrated, seek advice early. Applies at every site.",
      proposal={"kind": "review", "to": "clinician", "tier": "today"})
last("rules", "V04")["x"]["notWhen"] = [crit("acu_insulin_sick_review_signs", "Ketones 1.6 mmol/L or more, urine 2+, or a sign (an interrupting rule applies)",
                                             any=[P("bohb", ">=", ref="REF-DM-ACU-KETONE-RISK"), KET2()] + SIGNS(), ref_id="REF-DM-ACU-KETONE-RISK")]

# ── V02, V13, V14  glucose targets and bands follow the agreed plan ────────
_g = item("targets", "tgt_hba1c_general")
for _tid in ("tgt_fpg_surrogate", "tgt_ppg_surrogate"):
    _t = tag(item("targets", _tid), "V02")
    _t["x"]["notWhen"] = [copy.deepcopy(k) for k in _g["x"]["notWhen"] if k["id"] in ("tgt_hba1c_general_relaxed_applies", "tgt_general_su_low")] + [
        crit(f"{_tid}_tier", "A relaxed or 'avoid symptoms' plan is agreed (a relaxed glucose goal needs a signed source: D-DM-40)",
             all=[P("glycaemic_target_tier", "in", ["relaxed", "avoid_symptoms"])], ref_id="REF-DM-CTRL-HBA1C-RELAXED")]
for _bid, _tid in (("fpg_control_who", "tgt_fpg_surrogate"), ("fcap_control_who", "tgt_fpg_surrogate"), ("ppg_control_who", "tgt_ppg_surrogate"), ("pcap_control_who", "tgt_ppg_surrogate")):
    tag(item("interpretation", _bid), "V02")["x"]["forTarget"] = _tid
_t = tag(item("targets", "tgt_hba1c_tight"), "V13")
_t["x"]["notWhen"] = [k for k in _t["x"]["notWhen"] if k["id"] != "tgt_tight_su_ins"]
_t["when"]["all"].append(P("glucose_lowering_therapy", "!=", "insulin"))      # tight with insulin is not proposed; the general target then shows (no longer superseded)
for _k in _g["x"]["notWhen"]:
    if _k["id"] == "tier_not_general":      # under 'tight' the general target yields only when the tight one can be proposed (not on insulin)
        _k["all"] = [P("glycaemic_target_tier", "in", ["relaxed", "avoid_symptoms"])]; _k["label"] = "A relaxed or 'avoid symptoms' tier has been agreed"
_g["x"]["notWhen"].append(crit("tgt_general_tight", "A tight tier agreed and not on insulin (the tight target applies)",
                               all=[P("glycaemic_target_tier", "==", "tight"), P("glucose_lowering_therapy", "!=", "insulin")], ref_id="REF-DM-CTRL-HBA1C-TIGHT"))
for _k in item("targets", "tgt_hba1c_ckd")["x"]["notWhen"]:
    if _k["id"] == "tgt_hba1c_ckd_tier": _k["all"] = [P("glycaemic_target_tier", "in", ["general", "relaxed", "tight", "avoid_symptoms"])]; _k["label"] = "A tier is already agreed (the agreed target applies)"
_g["x"]["notWhen"] = [k for k in _g["x"]["notWhen"] if k["id"] != "tgt_general_su_low"] + [
    crit("tgt_general_su_low2", "On insulin or a sulfonylurea with a significant low in the last year, and no tier agreed (the relaxed target applies)",
         all=[P("hypo_worst_12m", "in", ["needed_help", "measured_below_3", "repeated"])], any=ISU(), ref_id="REF-DM-CTRL-HBA1C-RELAXED")]
item("targets", "tgt_hba1c_relaxed")["when"]["any"].append(P("hypo_worst_12m", "in", ["needed_help", "measured_below_3", "repeated"]))

# ── V03  the district acetone pathway can be acted on ──────────────────────
item("rules", "DM-ACU-ROUTE-13B")["display"] = ("Diabetes with acetone on the breath or dehydration: ketones today. Blood ketones where the site has them; otherwise a urine strip now and again in 2 hours, "
                                               "and refer today if either is raised or the person is unwell")

# ── V05  one kidney-injury finding, and it reaches the eGFR caveat ─────────
FEATURES.pop("acute_kidney_injury", None)
for _fid in ("metformin_during_acute_illness", "sglt2_during_acute_illness"):
    _f = tag(item("therapyFlags", _fid), "V05")
    _f["when"]["any"] = [P("creatinine_unstable") if p["feature"] == "acute_kidney_injury" else p for p in _f["when"]["any"]]
    _f["when"]["label"] = _f["when"]["label"].replace(" or acute kidney injury", " or creatinine not in steady state (acute kidney injury)")

# ── V06  hypoglycaemia 'baseline' needs the kidney function too ────────────
_b = next(b for b in next(m for m in REG["riskModels"] if m["id"] == "hypoglycaemia_risk_ada")["bands"] if b["code"] == "baseline")
tag(_b, "V06") if "x" in _b else None
_b["when"]["all"].append(P("egfr", "recorded")); _b["when"]["label"] = "On insulin or a sulfonylurea, no lows in the last year, kidney function recorded, and none of the factors above"

# ── V07  the incidental-result wording does not assert a diagnosis ─────────
item("rules", "DM-SUS-INCID-02")["display"] = "One result in the diabetes range: confirm it. Repeat on another day (or, with symptoms, check a glucose today); do not leave it"

# ── V08  the CKD band claims only the upper limit KDIGO sets ───────────────
_t = tag(item("interpretation", "hba1c_control_ckd"), "V08")
_hi = REFS["REF-DM-CTRL-CKD-HIGH"]["value"]
_t["bands"] = [{"code": "in_range", "display": "Within KDIGO's individualised range (below 8.0%; individualise within it)", "tone": "normal", "to": _hi},
               {"code": "above_range", "display": "Above the range", "tone": "intermediate", "from": _hi}]
_t["x"]["refs"] = ["REF-DM-CTRL-CKD-HIGH"]

# ── V09, V10, V11  the pregnancy-possible flag; the organ-damage wording ────
_f = tag(item("therapyFlags", "ras_blocker_or_statin_pregnancy_possible"), "V09", "V10")
_f["x"]["ages"] = "adult"
_f["x"]["notWhen"].append(crit("ras_statin_possible_pregnant", "Pregnant (the pregnancy flag applies)", all=[P("pregnant")], ref_id="REF-DM-RX-SICKDAY-HOLD"))
FEATURES["hypertensive_organ_damage"]["display"] = "Confusion, seizures, blurred or lost vision; breathlessness with crackles; little or no urine; or tearing chest or back pain (beside a raised pressure, or in pregnancy or after birth)"

# ── V15, V16 ───────────────────────────────────────────────────────────────
tag(item("rules", "DM-SUS-PAED-05"), "V15")["x"]["notWhen"].append(
    crit("sus_paed_fcap_r03", "Any glucose above 11 mmol/L or HI (rule PAED-03 applies)", any=GLU("REF-DM-ACU-PAED-GLU", ">") + [HI()], ref_id="REF-DM-ACU-PAED-GLU"))
k_r5.SEMANTICS["adult"] += " A recorded age of 10 to 15 is 'adolescent' even if the band says 'child' (tenth review, V16)."

for _d in k_decisions.D:
    if _d["id"] == "D-DM-41":
        _d["question"] = _d["question"].replace("360 women", "480 women").replace("21,504 men over 2 sites × 4 age bands × 8 diabetes profiles × 6 states", "25,088 men over 2 sites × 4 age bands × 8 diabetes profiles × 7 states (including acute illness)")
        _d["recommended"] = (_d["recommended"].replace("a sick child with diabetes and no glucose", "a child with diabetes who is vomiting, in pain or acutely unwell with no glucose")
                             .replace("or organ damage or drowsiness with no BP", "or organ damage or drowsiness at any pressure")
                             .replace("a vomiting child with diabetes,", "a vomiting or acutely unwell child or insulin-treated adult with diabetes,"))
    if _d["id"] == "D-DM-40":
        _d["needsFromCso"] += "; ADA SOC section 13 relaxed fasting and post-meal goals for older adults (until signed, no glucose target is shown under a relaxed or 'avoid symptoms' plan)"

DISPOSITION.update({
 "V01": (FIXED, "'Acutely unwell' joins vomiting in ROUTE-13, 23, 23D, 32 and 32B; the grid gains an 'ill' state with floor rows. DMV-142."),
 "V02": (FIXED, "The fasting and post-meal targets stand down under a relaxed or 'avoid symptoms' plan and on the general target's relax reasons; their four bands read only against a target shown. DMV-140 extended; DMV-143."),
 "V03": (FIXED, "13B's display gives the district strip-and-refer pathway."),
 "V04": (FIXED, "ROUTE-23R: an adult on insulin or with type 1 who is vomiting or unwell gets a same-day review at every site. DMV-144."),
 "V05": (FIXED, "The second kidney-injury box is removed; the sick-day flags read 'creatinine not in steady state', which also triggers the eGFR caveat."),
 "V06": (FIXED, "'Baseline' hypoglycaemia risk needs the kidney function recorded."),
 "V07": (FIXED, "INCID-02 no longer says 'diagnostic'."),
 "V08": (FIXED, "The CKD band shows only KDIGO's upper limit."),
 "V09": (FIXED, "The pregnancy-possible flag is adult-only."),
 "V10": (FIXED, "It stands down when pregnant."),
 "V11": (FIXED, "The organ-damage finding's wording covers pregnancy and the postpartum weeks."),
 "V12": (FIXED, "D-DM-41 regenerated."),
 "V13": (FIXED, "A tight tier on insulin is not proposed, so the general target shows; a sulfonylurea low proposes the relaxed target."),
 "V14": (FIXED, "The CKD target yields to any agreed tier, 'general' included."),
 "V15": (FIXED, "PAED-05 yields to PAED-03 above 11."),
 "V16": (FIXED, "A recorded age of 10 to 15 is 'adolescent'."),
 "V17": ("no_change", "Under 16 the paediatric team manages medicines; amber flags are not shown to children by design (rule 3)."),
 "V18": ("no_change", "Same-day items beside an interrupt collapse under it on the surface (Phase 3 presentation)."),
})
