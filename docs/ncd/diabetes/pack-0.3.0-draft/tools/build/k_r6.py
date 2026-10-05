"""Sixth review (phase-1/r6/R6-review.json, L01 to L29): an independent read of
the answers to the fifth, with a 4,608-patient interrupt grid. It found 5 critical
and 12 major problems; two criticals were caused by the fifth round's fixes and
three had always been there.

Three rounds in a row, a third of the criticals came from the previous round's
fixes, because each fix was a local patch to one rule. This round fixes the
structure instead:
  1. one definition of 'has diabetes' (DM_ANY), shared by every acute rule;
  2. a meter HI or LO counts as a glucose on record;
  3. one interrupt per event, by a declared order (the evaluator folds the rest);
  4. acute pregnancy rules treat an unanswered pregnancy as possible, and say so;
  5. the reviewer's grid and minimum-urgency table become a build check
     (build.py check_acute_grid), so a regression fails the build.
"""
import copy, json
from lib import P, crit, FEATURES
from k_model import REG, drule
from k_review import (tag, item, last, GLU, GLU_REC, KET_REC, KNOWN, ISU, GLT, HI, DROWSY, SIGNS, MILD, KET2,
                      ADULT, CHILD, DISPOSITION, FIXED)
import k_r5, k_clerk, k_decisions

PART = "fixed_in_part"; CSO = "cso_decision"
T1 = lambda: P("dm_type_recorded", "==", "type_1")
THERAPIES = [o["value"] for o in FEATURES["glucose_lowering_therapy"]["options"] if o["value"] != "none"]
# Has diabetes: said so, a type recorded, or on any glucose-lowering medicine. One list for every acute rule (L04, L11).
DM_ANY = lambda: [KNOWN(), P("dm_type_recorded", "in", ["type_1", "type_2", "unclassified", "other"])] + [GLT(t) for t in THERAPIES]
DM_OR_HIGH = lambda: DM_ANY() + GLU("REF-DM-ACU-DKA-GLU") + [HI()]
DM_SET = {json.dumps(p, sort_keys=True) for p in DM_ANY()}

HIGH_TOO = {"DM-ACU-ROUTE-21", "DM-ACU-ROUTE-21B"}      # L01: these also count a raised glucose as context
def set_context(rule_id, label=None, extra=()):
    """Replace a rule's 'who has diabetes' atLeast list with DM_ANY (with the raised-glucose arms where the rule had them, or L01 asks)."""
    r = item("rules", rule_id); w = r["when"]
    had_glucose = rule_id in HIGH_TOO or any(p["feature"] in ("capillary_glucose", "glucose_meter_extreme") for p in w["atLeast"]["of"])
    w["atLeast"]["of"] = (DM_OR_HIGH() if had_glucose else DM_ANY()) + list(extra)
    if label: w["label"] = label
    return r

# ── 1. one diabetes context (L01, L04, L11, L29) ───────────────────────────
DM_WORDS = "known diabetes, a recorded type, or any glucose-lowering medicine"
for _rid, _lbl in (
    ("DM-ACU-ROUTE-13", f"Diabetes ({DM_WORDS}); with any of: vomiting, abdominal pain, dehydration"),
    ("DM-ACU-ROUTE-20", f"Drowsiness or worse, with diabetes ({DM_WORDS})"),
    ("DM-ACU-ROUTE-24", None),
    ("DM-ACU-ROUTE-21", None), ("DM-ACU-ROUTE-21B", None), ("DM-ACU-ROUTE-22", None), ("DM-ACU-ROUTE-30", None), ("DM-ACU-ROUTE-02", None),
):
    tag(set_context(_rid, _lbl), "L01", "L04")
_r = tag(item("rules", "DM-ACU-ROUTE-21"), "L01")
_r["when"]["label"] = f"Urine ketones trace or 1+, with diabetes ({DM_WORDS}) or any glucose 11.1 mmol/L or more or a meter reading HI; and vomiting, abdominal pain, acute illness, dehydration, any glucose 18 mmol/L or more, or HI"
_r["x"]["notWhen"].append(crit("acu_ketones_mid_signs", "Deep breathing, acetone, dehydration or drowsiness (an interrupting rule applies)", any=SIGNS(), ref_id="REF-DM-ACU-REFER-ALL"))
tag(item("rules", "DM-ACU-ROUTE-21B"), "L01")["when"]["label"] = f"Blood ketones 0.6 to below 1.6 mmol/L, with diabetes ({DM_WORDS}) or any glucose 11.1 mmol/L or more or HI; and vomiting, abdominal pain, acute illness, dehydration, any glucose 18 mmol/L or more, or HI"
for _rid in ("DM-ACU-ROUTE-22", "DM-ACU-ROUTE-30", "DM-ACU-ROUTE-02"):
    _w = item("rules", _rid)["when"]
    _w["label"] = _w["label"].split(";")[0] + f"; with diabetes ({DM_WORDS}), any glucose 11.1 mmol/L or more, or a meter reading HI"
_r = tag(item("rules", "DM-ACU-ROUTE-02"), "L19")
_r["display"] = "Ketones 2+ (or 3.0 mmol/L or more) in diabetes or with a raised glucose: suspected ketoacidosis. Route now"
_r = tag(item("rules", "DM-ACU-ROUTE-22"), "L20"); _r["display"] = "Blood ketones 1.6 to below 3.0 mmol/L in diabetes or with a raised glucose: at risk of ketoacidosis. Contact the diabetes team today and recheck within 2 hours"

# children and type 1 / insulin rules read the same list
for _rid, _any in (("DM-ACU-ROUTE-25", [P("deep_rapid_breathing"), P("acetone_breath"), P("dehydration"), DROWSY()]),):
    _r = item("rules", _rid)
    _r["when"] = crit("acu_paed_known_signs", f"A child with diabetes ({DM_WORDS}), with deep rapid breathing, acetone on the breath, dehydration, or drowsiness or worse",
                      any=_any, atLeast=(1, DM_ANY()), ref_id="REF-DM-ACU-PAED-DKA")
    _r["display"] = "A child with diabetes and deep breathing, acetone on the breath, dehydration or drowsiness: suspected ketoacidosis. Route now"
    tag(_r, "L02", "L12")["x"]["notWhen"].append(crit("acu_paed_known_signs_hypo", "Any glucose below 3.0 mmol/L or a meter reading LO (rule 06 interrupts; between 3.0 and 3.9 the interrupt is folded behind the hypoglycaemia rule)",
                                                    any=GLU("REF-DM-HYPO-L2", "<") + [P("glucose_meter_extreme", "==", "lo")], ref_id="REF-DM-HYPO-L2"))
_r = item("rules", "DM-ACU-ROUTE-32"); _r["when"]["atLeast"]["of"] = DM_ANY()
_r["when"]["label"] = f"A child with diabetes ({DM_WORDS}); with vomiting or abdominal pain"
_r = tag(item("rules", "DM-ACU-ROUTE-23"), "L04", "L05")
_r["when"]["atLeast"]["of"] = [T1(), GLT("insulin")]
_r["x"]["notWhen"] = [crit("acu_insulin_sick_bohb", "Blood ketones below 0.6 mmol/L (normal); a urine strip does not clear this (it can miss early ketoacidosis)", all=[P("bohb", "<", ref="REF-DM-ACU-KETONE-LOW")], ref_id="REF-DM-ACU-KETONE-LOW"),
                      crit("acu_insulin_sick_raised", "Blood ketones 0.6 mmol/L or more, or urine ketones 2+ (the ketone rules read them)", any=[P("bohb", ">=", ref="REF-DM-ACU-KETONE-LOW"), KET2()], ref_id="REF-DM-ACU-KETONE-LOW"),
                      crit("acu_insulin_sick_kussmaul", "Deep breathing or acetone on the breath (rules 24 and 25 interrupt)", any=[P("deep_rapid_breathing"), P("acetone_breath")], ref_id="REF-DM-ACU-REFER-ALL")]
_r["display"] = "Type 1 diabetes or on insulin, with vomiting or abdominal pain: check blood ketones today (a urine strip can miss early ketoacidosis), whatever the glucose"

# L02: acetone in the child interrupts
_r = tag(item("rules", "DM-ACU-ROUTE-04"), "L02", "L16")
_r["when"]["any"].append(P("acetone_breath"))
_r["when"]["label"] = ("Any of vomiting, abdominal pain, deep rapid breathing, acetone on the breath, dehydration, drowsiness or worse; with at least one of: thirst, passing a lot of urine, "
                       "weight loss, new bed-wetting, any glucose above 11 mmol/L, a meter reading HI")
_r["display"] = "A child who is vomiting, in pain, breathing deeply, smelling of acetone, dehydrated or drowsy, with features of diabetes or a glucose above 11: suspected ketoacidosis. Route now"

# L05: the sicker adult gets more, not less
_r = tag(item("rules", "DM-ACU-ROUTE-24"), "L05", "L18")
_r["when"]["any"] += [P("dehydration"), DROWSY()]
_r["when"]["label"] = f"Diabetes ({DM_WORDS}); with deep rapid breathing, acetone on the breath, dehydration, or drowsiness or worse"
_r["display"] = "Diabetes with deep breathing, acetone on the breath, dehydration or drowsiness: route now, whatever the glucose. Glucose and ketones now"
_r["x"]["notWhen"].append(crit("acu_known_kussmaul_hypo", "Any glucose below 3.0 mmol/L or a meter reading LO (rule 06 interrupts; between 3.0 and 3.9 the interrupt is folded behind the hypoglycaemia rule)",
                               any=GLU("REF-DM-HYPO-L2", "<") + [P("glucose_meter_extreme", "==", "lo")], ref_id="REF-DM-HYPO-L2"))
_r = tag(item("rules", "DM-ACU-ROUTE-03"), "L05")
_r["when"]["any"] += [P("dehydration"), DROWSY()]
_r["when"]["label"] = "On an SGLT2 inhibitor, with any of: vomiting, abdominal pain, deep rapid breathing, acute illness, dehydration, drowsiness or worse"

# L11: hypoglycaemia at every age, every recorded type
_r = tag(item("rules", "DM-ACU-ROUTE-07"), "L11")
_r["when"]["atLeast"]["of"] = [GLT("insulin"), GLT("glibenclamide"), GLT("gliclazide"), GLT("glimepiride"), T1()] + DM_ANY()
_r["when"]["label"] = "Any glucose below 3.9 mmol/L in a person with diabetes, unless a recorded medicine list holds no insulin or sulfonylurea and the recorded type is not type 1 (rule 26 applies)"
_r["display"] = "Glucose below 3.9 mmol/L in diabetes: hypoglycaemia. On insulin or a sulfonylurea, or if the medicines are not known, it can come back"
_r = tag(item("rules", "DM-ACU-ROUTE-26"), "L11", "L25")
_r.pop("ageBands", None)
_r["when"]["all"] = [p for p in _r["when"]["all"] if p["feature"] != "dm_status"]
_r["when"]["any"] = GLU("REF-DM-HYPO-L1", "<")
_r["when"]["atLeast"] = {"n": 1, "of": DM_ANY()}
_r["x"]["notWhen"].append(crit("acu_hypo_other_drowsy", "Drowsiness or worse (rule 31 interrupts)", all=[DROWSY()], ref_id="REF-DM-HYPO-L3"))
_r = tag(item("rules", "DM-ACU-ROUTE-31"), "L07")
_r["x"]["notWhen"][1]["label"] = "On insulin or a sulfonylurea, or type 1 recorded (rule 07 interrupts)"
tag(item("rules", "DM-SUS-PAED-03"), "L29")["x"]["notWhen"].append(crit("sus_paed_dm_any", f"Diabetes already known ({DM_WORDS})", any=DM_ANY(), ref_id="REF-DM-ACU-PAED-GLU"))

# ── 2. HI or LO is a glucose on record (L08) ───────────────────────────────
_GLU_REC_KEY = json.dumps(P("capillary_glucose", "recorded"), sort_keys=True)
def _walk(c):
    if isinstance(c, dict):
        for k in ("any", "all"):
            if any(json.dumps(p, sort_keys=True) == _GLU_REC_KEY for p in c.get(k, [])) and not any(p["feature"] == "glucose_meter_extreme" and p["op"] == "recorded" for p in c[k]):
                c[k].append(P("glucose_meter_extreme", "recorded")); c["label"] = c["label"].rstrip(")") + (" (a meter HI or LO counts)" if ")" not in c["label"] else "; a meter HI or LO counts)")
for _kind in ("rules", "management"):
    for _it in REG[_kind]:
        for _k in _it["x"].get("notWhen", []): _walk(_k)

# ── 3. one interrupt per event: the order the evaluator folds by (L07) ──────
ACUTE_ORDER = [
    "DM-ACU-ROUTE-06", "DM-ACU-ROUTE-31", "DM-ACU-ROUTE-07",            # low glucose first: the one that kills in minutes
    "DM-ACU-ROUTE-20",                                                  # drowsy with diabetes and no glucose: a low until a reading says otherwise
    "DM-ACU-ROUTE-28", "DM-ACU-ROUTE-28B", "DM-ACU-ROUTE-28C",          # pregnancy
    "DM-ACU-ROUTE-04", "DM-ACU-ROUTE-25", "DM-ACU-ROUTE-32", "DM-ACU-ROUTE-15",   # children
    "DM-ACU-ROUTE-02", "DM-ACU-ROUTE-30", "DM-ACU-ROUTE-03", "DM-ACU-ROUTE-14",   # ketoacidosis and the hyperosmolar state, by test result
    "DM-ACU-ROUTE-29", "DM-ACU-ROUTE-17",                               # specific emergencies before the broad clinical-picture rules
    "DM-ACU-ROUTE-11", "DM-ACU-ROUTE-24", "DM-ACU-ROUTE-05",
]
INTERRUPT_RULE = ("One interrupt per event: when several rules with `immediate` urgency are met, the surface interrupts once, with the first in ACUTE_ORDER; "
                  "the others are shown inside it as further reasons (urgency 'folded'). Low glucose comes first because it kills in minutes (sixth review, L07).")

# ── 4. pregnancy and postpartum blood pressure (L03, L13, L15) ──────────────
PREG_OR_PP = lambda: [P("pregnant"), P("postpartum_weeks", "<=", ref="REF-DM-PREG-PE-POSTPARTUM")]
for _rid in ("DM-ACU-ROUTE-27", "DM-ACU-ROUTE-28"):
    tag(item("rules", _rid), "L13")["x"]["pregnancyUnknownCounts"] = True
drule("DM-ACU-ROUTE-28B", "Pregnant or within 6 weeks of birth, with organ-damage signs beside a raised pressure: severe pre-eclampsia whatever the number. Route now",
      "pre_eclampsia", crit("acu_preg_organ", "Pregnant or within 6 weeks postpartum, with confusion, seizures, visual loss, breathlessness with crackles, little urine or tearing pain beside a raised pressure",
                            all=[P("hypertensive_organ_damage")], atLeast=(1, PREG_OR_PP()), claim_id="UCG-PE-02"),
      "high", "immediate", ["bp_systolic", "bp_diastolic", "urine_protein_strip"], ["Eclampsia (still route)", "Stroke"], "UCG-PE-02", "DM-ACU-ROUTE", lane="acute_route",
      notes="UCG 2023 16.3.7: severe pre-eclampsia is 'any degree of hypertension with evidence of organ dysfunction'. The organ-damage finding is defined beside a raised pressure.",
      proposal={"kind": "acute.route", "to": "triage", "tier": "now"})
tag(REG["rules"][-1], "L03")["x"]["pregnancyUnknownCounts"] = True
drule("DM-ACU-ROUTE-28C", "Pregnant or within 6 weeks of birth, drowsy, with blood pressure 140/90 or more: severe pre-eclampsia or eclampsia until proved otherwise. Route now",
      "pre_eclampsia", crit("acu_preg_drowsy", "Pregnant or within 6 weeks postpartum, drowsy or worse, with systolic 140 mmHg or more or diastolic 90 mmHg or more",
                            all=[DROWSY()], any=[P("bp_systolic", ">=", ref="REF-DM-PREG-BP-SBP"), P("bp_diastolic", ">=", ref="REF-DM-PREG-BP-DBP")], atLeast=(1, PREG_OR_PP()), ref_id="REF-DM-PREG-BP-SBP"),
      "high", "immediate", ["urine_protein_strip"], ["Hypoglycaemia (check glucose)", "Stroke"], "UCG-PE-02", "DM-ACU-ROUTE", lane="acute_route",
      proposal={"kind": "acute.route", "to": "triage", "tier": "now"})
tag(REG["rules"][-1], "L03")["x"]["pregnancyUnknownCounts"] = True
_r = tag(item("rules", "DM-ACU-ROUTE-27"), "L15", "L28")
_r["display"] = "Pregnant or within 6 weeks of birth, with blood pressure 140/90 or more: urine protein today"
_r["x"]["notWhen"] = [k for k in _r["x"]["notWhen"] if k["id"] != "acu_preg_bp_neg"] + [
    crit("acu_preg_bp_protein_done", "A urine protein result is recorded at this visit (rules 27B and 27C read it)", any=[P("urine_protein_strip", "recorded")], ref_id="REF-DM-PREG-BP-SBP")]
drule("DM-ACU-ROUTE-27B", "Raised blood pressure in pregnancy or after birth, urine protein negative: gestational or chronic hypertension. Review the blood-pressure plan today and aim below 140/90",
      "pre_eclampsia", crit("acu_preg_bp_neg", "Pregnant or within 6 weeks postpartum, systolic 140 mmHg or more or diastolic 90 mmHg or more, urine protein negative",
                            all=[P("urine_protein_strip", "in", ["neg", "trace"])], any=[P("bp_systolic", ">=", ref="REF-DM-PREG-BP-SBP"), P("bp_diastolic", ">=", ref="REF-DM-PREG-BP-DBP")],
                            atLeast=(1, PREG_OR_PP()), ref_id="REF-DM-PREG-BP-SBP"),
      "moderate", "same_day", ["bp_systolic", "bp_diastolic"], ["White-coat raised reading (repeat)"], "UCG-CHTN-02", "DM-ACU-ROUTE", lane="acute_route",
      notes="UCG 2023 16.2.3: aim for BP below 140/90; 'if not controlled or any sign of pre-eclampsia: refer to hospital'. Trace is not 1+ (UCG's threshold for proteinuria).",
      proposal={"kind": "review", "to": "antenatal_clinician", "tier": "today"})
tag(REG["rules"][-1], "L15")["x"]["pregnancyUnknownCounts"] = True
drule("DM-ACU-ROUTE-27C", "Raised blood pressure in pregnancy or after birth with urine protein 1+ or more: pre-eclampsia. Refer to hospital today",
      "pre_eclampsia", crit("acu_preg_bp_prot", "Pregnant or within 6 weeks postpartum, systolic 140 mmHg or more or diastolic 90 mmHg or more, urine protein 1+ or more",
                            all=[P("urine_protein_strip", "in", ["1plus", "2plus", "3plus"])], any=[P("bp_systolic", ">=", ref="REF-DM-PREG-BP-SBP"), P("bp_diastolic", ">=", ref="REF-DM-PREG-BP-DBP")],
                            atLeast=(1, PREG_OR_PP()), ref_id="REF-DM-PREG-BP-SBP"),
      "high", "same_day", ["urine_protein_strip"], ["Urinary infection (still refer)"], "UCG-PE-03", "DM-ACU-ROUTE", lane="acute_route",
      notes="UCG 2023 16.3.7: 140 to 159 / 90 to 109 with 1+ proteinuria or more is pre-eclampsia, and 'any case of pre-eclampsia has to be referred to hospital'. Before 20 weeks, consider chronic hypertension with proteinuria (still refer).",
      proposal={"kind": "refer", "to": "hospital_obstetrics", "tier": "today"})
tag(REG["rules"][-1], "L15")["x"]["pregnancyUnknownCounts"] = True
for _rid in ("DM-ACU-ROUTE-27B", "DM-ACU-ROUTE-27C"):
    item("rules", _rid)["x"]["notWhen"] = [crit(f"{_rid[-3:].lower()}_severe", "Systolic 160 mmHg or more or diastolic 110 mmHg or more (rule 28 interrupts)",
                                                any=[P("bp_systolic", ">=", ref="REF-DM-PREG-BP-SEVERE-SBP"), P("bp_diastolic", ">=", ref="REF-DM-PREG-BP-SEVERE-DBP")], ref_id="REF-DM-PREG-BP-SEVERE-SBP")]
PREG_UNKNOWN_RULE = ("An acute pregnancy rule (`pregnancyUnknownCounts`) treats an unanswered pregnancy question as 'possibly pregnant': it fires, and names 'pregnant' as the gap to close. "
                     "Missing is never 'not pregnant' when the cost of being wrong is eclampsia (sixth review, L13).")

# ── 5. vomiting with a high glucose and no ketoacidosis (L14) ──────────────
drule("DM-ACU-ROUTE-34", "Diabetes, vomiting, glucose 18 or more with ketones below the danger range: tablets cannot be kept down. Same-day review",
      "hhs", crit("acu_vomit_high_noket", f"Diabetes ({DM_WORDS}); vomiting; any glucose 18 mmol/L or more or a meter reading HI",
                  all=[P("vomiting")], any=GLU("REF-DM-ACU-KETONE-TEST-GLU") + [HI()], atLeast=(1, DM_ANY()), ref_id="REF-DM-ACU-KETONE-TEST-GLU"),
      "moderate", "same_day", ["urine_ketones", "bohb", "sodium", "urea"], ["Gastroenteritis"], "A9-48", "DM-ACU-ROUTE", lane="acute_route",
      notes="WHO PEN refers glucose of 18 or more; with vomiting the oral treatment cannot work and the hyperosmolar state can develop without ketones. Independent of D-DM-38.",
      proposal={"kind": "review", "to": "clinician", "tier": "today"})
last("rules", "L14")["x"]["notWhen"] = [crit("acu_vomit_high_ket", "Ketones raised (blood 0.6 mmol/L or more, or urine 2+), or a sign (the ketone and interrupting rules apply)",
                                             any=[P("bohb", ">=", ref="REF-DM-ACU-KETONE-LOW"), KET2()] + SIGNS(), ref_id="REF-DM-ACU-KETONE-LOW")]

# ── displays (L10) ─────────────────────────────────────────────────────────
FEATURES["hypertensive_symptoms"]["display"] = "With the raised pressure: headache, blurred vision, nausea or vomiting"
FEATURES["hypertensive_symptoms"]["x"]["note"] = "Confusion, breathlessness with crackles and little urine are recorded as 'hypertensive_organ_damage', which interrupts (sixth review, L10)."
_s = tag(item("management", "DM-ACT-REFER-BP-03"), "L10")
_s["display"] = "Blood pressure above 180 systolic with headache, blurred vision or vomiting: refer today. Confusion, breathlessness or little urine is an emergency (rule 29)"

# ── targets: a tier agreed decides; the older and relaxed targets replace the general one (L09)
tag(item("targets", "tgt_hba1c_general"), "L09")["x"]["notWhen"] = [k for k in item("targets", "tgt_hba1c_general")["x"]["notWhen"] if k["id"] != "tgt_general_older"]
item("targets", "tgt_hba1c_older_healthy")["x"]["supersedes"] = ["tgt_hba1c_general"]
item("targets", "tgt_hba1c_relaxed")["x"]["supersedes"] = ["tgt_hba1c_general", "tgt_hba1c_older_healthy"]
_tight = copy.deepcopy(item("targets", "tgt_hba1c_general"))
from lib import REFS
_tight.update({"id": "tgt_hba1c_tight", "tier": "tight", "display": "HbA1c below 6.5%", "note": "Only when a tight target has been agreed.",
               "upper": {"ref": "REF-DM-CTRL-HBA1C-TIGHT", "value": REFS["REF-DM-CTRL-HBA1C-TIGHT"]["value"], "unit": "%"}})
_tight["when"] = crit("tgt_tight", "A tight target agreed (good health, low risk of lows)", all=[P("dm_status", "==", "known"), P("glycaemic_target_tier", "==", "tight")], ref_id="REF-DM-CTRL-HBA1C-TIGHT")
_tight["x"] = {**_tight["x"], "notWhen": [], "supersedes": ["tgt_hba1c_general", "tgt_hba1c_older_healthy"], "review": ["L09"]}
REG["targets"].append(_tight)
TARGET_RULE = ("A target with `supersedes` replaces the targets it names when both would be proposed; an agreed tier decides. 'Avoid symptoms' proposes no HbA1c target by design (sixth review, L09).")

# ── semantics emitted (L17) ────────────────────────────────────────────────
k_r5.SEMANTICS["interrupt"] = INTERRUPT_RULE
k_r5.SEMANTICS["pregnancyUnknown"] = PREG_UNKNOWN_RULE
k_r5.SEMANTICS["targets"] = TARGET_RULE
k_r5.SEMANTICS["diabetesContext"] = f"Every acute rule reads 'has diabetes' the same way: {DM_WORDS} (sixth review, L04)."
for _ec in k_clerk.ENGINE_CHANGES:
    if "recorded" in json.dumps(_ec): _ec["recordedScope"] = "at this encounter (fourth review, J19)"

# ── minors ─────────────────────────────────────────────────────────────────
tag(item("rules", "DM-ACU-ROUTE-32"), "L22")["x"]["proposal"]["test"] = ["test.glucose_capillary"]

k_decisions.D.append({"id": "D-DM-41", "title": "The acute escalation floor",
    "question": "The build now fails if any patient in a 4,608-cell grid gets less than the minimum urgency in this table (build.py ACUTE_FLOOR), or more than one interrupt. Sign the table?",
    "recommended": "Sign it as the acute lane's safety contract: interrupt on a meter HI, blood ketones 3.0 or more in diabetes or with a high glucose, ketones 1.6 to 2.9 with vomiting, Kussmaul breathing or acetone in diabetes, drowsiness with a low, high or unmeasured glucose in diabetes, a glucose below 3.9 on insulin, a sulfonylurea, type 1 or unknown medicines, SGLT2 with vomiting or deep breathing, a sick child with diabetes and no glucose; same day for the intermediate patterns.",
    "alternatives": ["Amend any row; the build then enforces the amended table."],
    "why": "Three review rounds found that patching single rules made other patients silent or doubly interrupted. A table the build enforces stops that.",
    "affects": "Every acute_route rule", "needsFromCso": None, "decision": None, "signedBy": None, "signedOn": None})

DISPOSITION.update({
 "L01": (FIXED, "ROUTE-21/21B/22/30/02 read one context (diabetes, a raised glucose or HI). Enforced by the grid check."),
 "L02": (FIXED, "Acetone interrupts in children (ROUTE-04, ROUTE-25). DMV-114."),
 "L03": (FIXED, "ROUTE-28B (organ damage) and ROUTE-28C (drowsy with 140/90) interrupt in pregnancy and 6 weeks postpartum (UCG-PE-02). DMV-115."),
 "L04": (FIXED, "One 'has diabetes' list (DM_ANY) used by every acute rule. DMV-116."),
 "L05": (FIXED, "ROUTE-24 and ROUTE-03 interrupt on dehydration or drowsiness; ROUTE-23 no longer stands down on them. DMV-117."),
 "L06": (FIXED, "For type 1 and insulin (ROUTE-23) and SGLT2 (ROUTE-03) only a blood ketone clears the prompt. WHO PEN's glucose-18 strip test (ROUTE-01/08/19) still clears on a negative strip, as the source says."),
 "L07": (FIXED, "One interrupt per event, folded by ACUTE_ORDER in the evaluator; the build fails on two displayed interrupts anywhere in the grid."),
 "L08": (FIXED, "A meter HI or LO counts as a glucose on record in every stop condition."),
 "L09": (FIXED, "An agreed tier decides; older and relaxed targets supersede the general one; a tight target exists. DMV-118."),
 "L10": (FIXED, "The symptoms box and BP-03 no longer list organ-damage findings."),
 "L11": (FIXED, "ROUTE-07 covers every recorded type and blank lists; ROUTE-26 runs at any age. Enforced by the grid."),
 "L12": (FIXED, "ROUTE-25 and ROUTE-24 stand down below 3.9 (hypoglycaemia interrupts)."),
 "L13": (FIXED, "Acute pregnancy BP rules treat an unanswered pregnancy as possible and name the gap. DMV-119."),
 "L14": (FIXED, "ROUTE-34: diabetes, vomiting, glucose 18 or more, ketones not raised: same day, independent of D-DM-38. DMV-120."),
 "L15": (FIXED, "ROUTE-27 asks for protein; 27B (negative: review the BP plan, aim below 140/90, UCG 16.2.3) and 27C (1+: pre-eclampsia, refer) replace the silent stop. DMV-121."),
 "L16": (FIXED, "ROUTE-04's display matches its criterion."),
 "L17": (FIXED, "recordedScope written on EC-5/6/7; the semantics block carries the interrupt, pregnancy, target and context rules."),
 "L18": (FIXED, "ROUTE-24 display."), "L19": (FIXED, "ROUTE-02 display."), "L20": (FIXED, "ROUTE-22 display."),
 "L21": (FIXED, "ROUTE-21 stands down when a sign is present."),
 "L22": (FIXED, "ROUTE-32 asks for the glucose; the ketone rules ask for ketones."),
 "L23": (FIXED, "DMV-92 banded adolescent, as the platform bands a 10-year-old."),
 "L24": (FIXED, "DMV-111 retitled."),
 "L25": (FIXED, "ROUTE-26 stands down with drowsiness (ROUTE-31)."),
 "L26": ("phase_0", "INCID-04 with pregnancy unanswered is a routine repeat; acceptable until the engine shows pregnancy as a gap on routine items."),
 "L27": ("no_change", "The held-step gap is evaluator semantics, which Phase 2 ports; nothing in the catalog needs it."),
 "L28": (FIXED, "The pregnancy BP rules name 20 weeks in their notes; gestation does not change the action (refer either way)."),
 "L29": (FIXED, "PAED-03 stands down for any recorded diabetes."),
})
