"""Ninth review (phase-1/r9/R9-review.json, U01 to U26). Each fix tagged; patients in
k_r9_vignettes (DMV-136 onward)."""
from lib import P, crit, FEATURES, REFS
from k_model import REG, drule, therapy_flag
from k_review import (tag, item, last, N, GLU, GLU_REC, KET_REC, KNOWN, ISU, GLT, HI, DROWSY, SIGNS, MILD, KET2,
                      ADULT, CHILD, DISPOSITION, FIXED)
import k_r5, k_r6, k_r7, k_r8, k_decisions

PART = "fixed_in_part"; CSO = "cso_decision"
DM_ANY = k_r7.DM_ANY; DM_WORDS = k_r6.DM_WORDS; PREG_OR_PP = k_r6.PREG_OR_PP
NOT_T1 = lambda: P("dm_type_recorded", "in", ["type_2", "gestational", "other"])      # a recorded type that excludes type 1 ('unclassified' does not)
BOHB_NORMAL = k_r7.BOHB_NORMAL

def _swap_type_stop(c):
    for k in ("all", "any"):
        c[k] = [NOT_T1() if (p["feature"] == "dm_type_recorded" and p["op"] == "!=" and p.get("value") == "type_1") else p for p in c.get(k, [])]

# ── U01, U13  acetone and dehydration in other diabetes keep a path ────────
for _rid in ("DM-ACU-ROUTE-24B", "DM-ACU-ROUTE-07", "DM-ACU-ROUTE-26"):
    _r = tag(item("rules", _rid), "U01", "U13")
    _swap_type_stop(_r["when"])
    for _k in _r["x"].get("notWhen", []): _swap_type_stop(_k)
_r = item("rules", "DM-ACU-ROUTE-24B")
_r["display"] = "Diabetes on insulin or an SGLT2 inhibitor, type 1 or unclassified, or medicines or type not recorded, with acetone on the breath or dehydration: suspected ketoacidosis at any glucose. Route now; ketones now"
_r = tag(item("rules", "DM-ACU-ROUTE-13B"), "U01")
_r["x"]["notWhen"] = [BOHB_NORMAL("acu_dm_acetone_bohb_normal"), crit("acu_dm_acetone_raised", "Blood ketones 1.6 mmol/L or more, urine 2+, deep breathing or drowsiness (the ketoacidosis rules apply)",
                                                                      any=[P("bohb", ">=", ref="REF-DM-ACU-KETONE-RISK"), KET2(), P("deep_rapid_breathing"), DROWSY()], ref_id="REF-DM-ACU-KETONE-RISK")]
_r["display"] = "Diabetes with acetone on the breath or dehydration: blood ketones today; a urine strip or a ketone below 1.6 does not settle it unless blood ketones are below 0.6"
for _rid in ("DM-ACU-ROUTE-21", "DM-ACU-ROUTE-21B"):
    _r = tag(item("rules", _rid), "U01")
    _r["when"]["any"].append(P("acetone_breath"))
    _r["x"]["notWhen"] = [k for k in _r["x"].get("notWhen", []) if k["id"] != "acu_ketones_mid_signs"] + [
        crit(f"{_rid[-3:].lower()}_interrupt_signs", "Deep breathing or drowsiness (an interrupting rule applies)", any=[P("deep_rapid_breathing"), DROWSY()], ref_id="REF-DM-ACU-REFER-ALL")]

# ── U02  the district strip pathway repeats, it does not fall silent ───────
_r = tag(item("rules", "DM-ACU-ROUTE-23D"), "U02")
_r["x"]["notWhen"] = [k for k in _r["x"]["notWhen"] if k["id"] != "acu_insulin_sick_district_done"]
_r["display"] = "Type 1 or on insulin, vomiting or abdominal pain, at a site with no blood ketone test: urine ketones now and again in 2 hours (a negative strip can miss early ketoacidosis); refer if vomiting continues or ketones rise"

# ── U03  worse pressure never lowers the urgency ───────────────────────────
_r = tag(item("rules", "DM-ACU-ROUTE-27D"), "U03")
_r["x"]["notWhen"] = [k for k in _r["x"]["notWhen"] if k["id"] != "acu_preg_bp_sympt_sev"] + [
    crit("acu_preg_bp_sympt_organ", "Organ-damage signs (rule 28B interrupts)", all=[P("hypertensive_organ_damage")], claim_id="UCG-PE-02")]

# ── U04  a child's fasting meter value ─────────────────────────────────────
drule("DM-SUS-PAED-05", "A child with a fasting capillary glucose of 7.0 or more: refer today as suspected diabetes",
      "type_1_diabetes", crit("sus_paed_fcap", "A child with a fasting capillary glucose of 7.0 mmol/L or more", all=[P("capillary_glucose_context", "==", "fasting"), P("capillary_glucose", ">=", ref="REF-DM-DX-FPG")], ref_id="REF-DM-DX-FPG",
                            needs="Reading a fasting meter value against the plasma threshold follows D-DM-04."),
      "high", "same_day", ["fasting_pg", "urine_ketones"], ["Not truly fasting", "Meter error"], "A9-30", "DM-SUS-PAED", ageBands=CHILD,
      proposal={"kind": "refer", "to": "paediatric_or_diabetes_team", "tier": "today"})
_r = tag(REG["rules"][-1], "U04"); _r["x"]["runWhenOverride"] = "always"
_r["x"]["notWhen"] = [crit("sus_paed_fcap_known", f"Diabetes already known ({DM_WORDS})", any=DM_ANY(), ref_id="REF-DM-SUS-PAED-SAMEDAY")]

# ── U05  only the trait caveat can be lifted by a variant-free method ──────
tag(item("validityCaveats", "hba1c_sickle_cell_disease"), "U05")["x"]["notWhen"] = []

# ── U06, U19, U20  HbA1c targets under the agreed tier ─────────────────────
for _tid in ("tgt_hba1c_ckd", "tgt_hba1c_tb", "tgt_hba1c_general", "tgt_hba1c_older_healthy", "tgt_hba1c_tight"):
    tag(item("targets", _tid), "U06")["x"].setdefault("notWhen", []).append(
        crit(f"{_tid}_avoid", "'Avoid symptoms' agreed (no HbA1c target by design)", all=[P("glycaemic_target_tier", "==", "avoid_symptoms")], ref_id="REF-DM-CTRL-HBA1C-RELAXED"))
item("targets", "tgt_hba1c_tb")["x"]["supersedes"].append("tgt_hba1c_ckd")
item("targets", "tgt_hba1c_ckd")["x"].setdefault("notWhen", []).append(
    crit("tgt_hba1c_ckd_tier", "A tier other than 'general' is already agreed (the agreed target applies)", all=[P("glycaemic_target_tier", "in", ["relaxed", "tight", "avoid_symptoms"])], ref_id="REF-DM-CTRL-CKD-HIGH"))
_s = tag(item("management", "DM-ACT-REFER-TARGET-02"), "U06")
_s["x"]["notWhen"].append(crit("ref_target_ins_relax", "'Avoid symptoms' agreed, or a reason to relax (frailty, cognitive impairment, a significant low in the last year)",
    any=[P("glycaemic_target_tier", "==", "avoid_symptoms"), P("frailty_or_limited_life_expectancy"), P("cognitive_impairment"), P("hypo_worst_12m", "in", ["needed_help", "measured_below_3", "repeated"])], ref_id="REF-DM-CTRL-HBA1C-RELAXED"))

# ── U07, U12  under 16, by age, everywhere ─────────────────────────────────
for _rid in ("DM-STR-STEROID-01", "DM-STR-NEURO-01", "DM-STR-NEURO-03", "DM-CLS-PANC-01", "DM-CLS-PANC-02"):
    tag(item("rules", _rid), "U07")["ageBands"] = list(ADULT)
k_r5.SEMANTICS["adult"] = ("Age bands are effective bands: where a numeric age is recorded, under 16 is never 'adult' or 'older_adult' and 16 or over is never 'child' or 'adolescent', "
                           "for rules, steps, flags and targets alike. A therapy flag shown under 16 shows its `under16Action` (refer; do not change the medicine here) instead of its action (ninth review, U07, U12).")

# ── U08  a child with diabetes who is vomiting is reviewed today ───────────
drule("DM-ACU-ROUTE-32B", "A child with diabetes who is vomiting: sick-day review today, even with a normal glucose and ketones",
      "dka", crit("acu_paed_vomit_review", f"A child with diabetes ({DM_WORDS}), vomiting", all=[P("vomiting")], atLeast=(1, DM_ANY()), ref_id="REF-DM-ACU-SICKDAY-INSULIN"),
      "moderate", "same_day", ["capillary_glucose", "bohb"], ["Gastroenteritis"], "A9-49", "DM-ACU-ROUTE", lane="acute_route", ageBands=CHILD,
      notes="ISPAD sick-day rules: glucose and ketones often, never stop insulin, seek advice early; a child who is vomiting cannot be relied on to keep fluids or food down.",
      proposal={"kind": "review", "to": "paediatric_or_diabetes_team", "tier": "today"})
tag(REG["rules"][-1], "U08")

# ── U09  hypoglycaemia risk needs its history ──────────────────────────────
_m = next(m for m in REG["riskModels"] if m["id"] == "hypoglycaemia_risk_ada"); _m["x"]["mustHave"] = ["glucose_lowering_therapy"]
_b = next(b for b in _m["bands"] if b["code"] == "baseline")      # 'baseline' only when the history of lows was asked and was none
_b["when"].setdefault("all", []).append(P("hypo_worst_12m", "==", "none"))
_b["when"]["label"] = "On insulin or a sulfonylurea, no lows in the last year, and none of the factors above"

# ── U10  'has diabetes' in the remaining rules and bands ───────────────────
_known = P("dm_status", "==", "known")
for _r in REG["rules"]:
    _w = _r["when"]
    if _r["x"]["lane"] != "acute_route" and _known in _w.get("all", []) and not _w.get("atLeast"):
        _w["all"] = [p for p in _w["all"] if p != _known]; _w["atLeast"] = {"n": 1, "of": DM_ANY()}; tag(_r, "U10")
for _tid in ("fpg_control_who", "ppg_control_who", "bp_systolic_who_hearts_d", "bp_diastolic_who_hearts_d"):
    tag(item("interpretation", _tid), "U10").pop("when", None)      # the stratify lane already needs established diabetes

# ── U11  caveats on routine referrals and targets; gaps only where a value was hidden
k_r5.SEMANTICS["caveatsEverywhere"] = ("A blocking caveat acts by direction on every rule and step outside the acute lane, on routine (not same-day or urgent) referrals and on targets; "
    "a value hidden by it is named as a gap only where it changed a met result. Acute rules and referrals for danger are never suppressed (N8; ninth review, U11).")

# ── U14  the CKD band reads KDIGO's individualised range ───────────────────
_t = tag(item("interpretation", "hba1c_control_ckd"), "U14")
_lo, _hi = REFS["REF-DM-CTRL-CKD-LOW"]["value"], REFS["REF-DM-CTRL-CKD-HIGH"]["value"]
_t["bands"] = [{"code": "below_range", "display": "Below KDIGO's individualised range: review for over-treatment and lows", "tone": "intermediate", "to": _lo},
               {"code": "in_range", "display": "Within KDIGO's individualised range (individualise within it)", "tone": "normal", "from": _lo, "to": _hi},
               {"code": "above_range", "display": "Above the range", "tone": "intermediate", "from": _hi}]
_t["x"]["refs"] = ["REF-DM-CTRL-CKD-LOW", "REF-DM-CTRL-CKD-HIGH"]
_t["note"] = "KDIGO 2022: an individualised HbA1c target from below 6.5% to below 8.0% in diabetes with CKD."

# ── U15  statin or RAS blocker where pregnancy is possible ─────────────────
therapy_flag("ras_blocker_or_statin_pregnancy_possible", "Pregnancy possible (the platform's answer), on an ACE inhibitor, an ARB or a statin", "amber",
             crit("ras_statin_possible", "Pregnancy possible, on an ACE inhibitor, an ARB or a statin", all=[P("pregnancy_possible")], any=[P("ras_blocker", "in", ["acei", "arb", "both"]), P("on_statin")], ref_id="REF-DM-RX-SICKDAY-HOLD"),
             item("therapyFlags", "ras_blocker_or_statin_could_conceive")["action"], item("therapyFlags", "ras_blocker_or_statin_could_conceive")["citation"]["x"]["claim"])
_f = tag(REG["therapyFlags"][-1], "U15"); _f["x"]["notWhen"] = [crit("ras_statin_possible_answered", "'Could become pregnant' is answered (the other flag decides)", any=[P("could_conceive", "recorded")], ref_id="REF-DM-RX-SICKDAY-HOLD")]
_f["x"]["neutralDisplay"] = item("therapyFlags", "ras_blocker_or_statin_could_conceive")["x"].get("neutralDisplay")
_f["x"]["neutralAction"] = item("therapyFlags", "ras_blocker_or_statin_could_conceive")["x"].get("neutralAction")

# ── U16  sick-day flags read acute kidney injury ───────────────────────────
N("acute_kidney_injury", "Acute kidney injury (a rise in creatinine of 26.5 µmol/L or more in 48 hours, or to 1.5 times baseline, or low urine output)", "investigation", "boolean", FEATURES["egfr"]["section"])
FEATURES["acute_kidney_injury"]["x"]["note"] = "KDIGO's definition (research claim A6-55); recorded by the clinician, not computed here (ninth review, U16)."
for _fid in ("metformin_during_acute_illness", "sglt2_during_acute_illness"):
    _f = tag(item("therapyFlags", _fid), "U16"); _f["when"]["any"].append(P("acute_kidney_injury"))
    _f["when"]["label"] = _f["when"]["label"].rstrip() + " or acute kidney injury" if "kidney" not in _f["when"]["label"] else _f["when"]["label"]

# ── U18  drowsiness or organ damage in pregnancy routes whatever the pressure
_r = tag(item("rules", "DM-ACU-ROUTE-28D"), "U18", "U22")
_r["x"]["notWhen"] = []
_r["display"] = "Pregnant or within 6 weeks of birth and drowsy: route now. Blood pressure and glucose now if not already recorded (eclampsia, hypoglycaemia)"
_r = tag(item("rules", "DM-ACU-ROUTE-28E"), "U18")
_r["x"]["notWhen"] = [crit("acu_preg_organ_r28b", "Systolic 140 mmHg or more or diastolic 90 mmHg or more (rule 28B interrupts)",
                           any=[P("bp_systolic", ">=", ref="REF-DM-PREG-BP-SBP"), P("bp_diastolic", ">=", ref="REF-DM-PREG-BP-DBP")], ref_id="REF-DM-PREG-BP-SBP")]
_r["display"] = "Pregnant or within 6 weeks of birth, with confusion, seizures, visual loss, breathlessness or little urine: route now; measure blood pressure"
for _rid in ("DM-ACU-ROUTE-28D", "DM-ACU-ROUTE-28E"):
    _r = item("rules", _rid); _core = _r["display"].split(": ", 1)[1]
    _r["x"]["unknownDisplays"] = {k: v + _core[0].lower() + _core[1:] for k, v in k_r8.UNKNOWN_TEXT.items()}

# ── minors ─────────────────────────────────────────────────────────────────
item("rules", "DM-ACU-ROUTE-25C")["display"] = "A child with diabetes, dehydrated or smelling of acetone, with normal blood ketones: same-day review by the paediatric or diabetes team; recheck ketones if it persists"

DISPOSITION.update({
 "U01": (FIXED, "13B stands down only on blood ketones below 0.6; rules 21/21B read acetone and no longer hand acetone to 24B; 'unclassified' no longer excludes type 1. Floor rows. DMV-136."),
 "U02": (FIXED, "23D keeps asking for a repeat strip in 2 hours; it never falls silent on a negative strip. DMV-137."),
 "U03": (FIXED, "27D no longer hands a worse pressure to rule 28's same-day unknown path. Women's floor row. DMV-138."),
 "U04": (FIXED, "DM-SUS-PAED-05 refers a child with a fasting meter value of 7.0 or more the same day. DMV-139."),
 "U05": (FIXED, "Only the trait caveat can be lifted; sickle cell disease never."),
 "U06": (FIXED, "'Avoid symptoms' stops every HbA1c target; CKD stands down under an agreed tier; the insulin referral stands down on a reason to relax. DMV-140."),
 "U07": (FIXED, "Steroid, neuropathy and pancreatic rules are adult-only; flags shown under 16 carry the refer-only action."),
 "U08": (FIXED, "ROUTE-32B: a vomiting child with diabetes gets a same-day sick-day review. Floor row."),
 "U09": (FIXED, "Hypoglycaemia risk needs the medicine list and the history of lows."),
 "U10": (FIXED, "Non-acute rules and the control and BP bands read the shared diabetes list."),
 "U11": (FIXED, "Caveats reach routine referrals and targets; gaps only where a hidden value changed a met result."),
 "U12": (FIXED, "Effective bands by numeric age across rules, steps, flags and targets. DMV-141."),
 "U13": (FIXED, "24B's wording names an unrecorded type."),
 "U14": (FIXED, "The CKD band reads KDIGO's range: below, within, above. DMV-133 corrected."),
 "U15": (FIXED, "A flag where pregnancy is possible and 'could become pregnant' is unanswered."),
 "U16": (FIXED, "New finding 'acute_kidney_injury' (KDIGO definition) read by both sick-day flags."),
 "U17": (FIXED, "D-DM-41's text regenerated from the floor."),
 "U18": (FIXED, "28D routes drowsiness in pregnancy at any pressure; 28E routes organ-damage signs below 140/90 with neutral wording."),
 "U19": (FIXED, "Covered by U06: an agreed tier decides which target shows."),
 "U20": (FIXED, "TB supersedes CKD; CKD yields to an agreed tier."),
 "U21": (FIXED, "DMV-26/28 expectations de-duplicated; DMV-128 asserts the metformin flag."),
 "U22": (FIXED, "28D's wording."),
 "U23": (CSO, "The CVD chart's age range needs WHO's chart text; added to D-DM-40's request."),
 "U24": (FIXED, "25C's wording."),
 "U25": ("phase_0", "District wording of the pregnancy meter rule: content for D-DM-28."),
 "U26": ("phase_0", "Same-day antenatal referral with pregnancy unanswered: the engine's pregnancy prompt (Phase 3)."),
})
for _d in k_decisions.D:
    if _d["id"] == "D-DM-40": _d["needsFromCso"] = (_d.get("needsFromCso") or "") + "; WHO CVD risk chart age range (Eastern sub-Saharan Africa)"
    if _d["id"] == "D-DM-41":
        _d["recommended"] = _d["recommended"].replace("acetone or dehydration in other diabetes,", "acetone or dehydration in other diabetes until blood ketones are below 0.6, a vomiting child with diabetes,").replace(
            "and an asymptomatic 160/110 with pregnancy unanswered).", "and an asymptomatic 160/110 with pregnancy unanswered; with headache it interrupts).")
