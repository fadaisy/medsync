"""Fixes from the two independent reviews of pack 0.2.0-draft.

    review/R1-clinical.json   41 findings (F01 to F41) on the rule catalog and the vignettes
    review/R2-clerking.json   37 findings (G01 to G37) on the clerking-desk wiring

This module changes the catalog built by k_dx, k_strat and k_act. Every item it adds or
changes is tagged x.review = [finding ids], so the CSO can trace a rule back to the reason
it exists. DISPOSITION at the end records what was done with every finding, including the
ones left for Phase 0 or for a CSO decision.
"""
import lib
from lib import P, crit, ref, REFS, FEATURES, feat, CLAIMS
from k_model import *

BEFORE = {k: len(v) for k, v in REG.items()}     # what version 0.2.0 held, before the review fixes
BEFORE["vignettes"] = 34
ADULT = ["adult", "older_adult"]
CHILD = ["child", "adolescent"]
KNOWN = lambda: P("dm_status", "==", "known")
GLT = lambda v: P("glucose_lowering_therapy", "==", v)
NOTGLT = lambda v: P("glucose_lowering_therapy", "!=", v)
SU = lambda: [GLT("glibenclamide"), GLT("gliclazide"), GLT("glimepiride")]
ISU = lambda: [GLT("insulin")] + SU()
T2 = lambda: P("dm_type_recorded", "==", "type_2")
SYM = lambda: [P("polyuria"), P("polydipsia"), P("unexplained_weight_loss")]
DROWSY = lambda: P("mental_status", "in", ["drowsy", "stupor", "coma"])
UNWELL = lambda: [P("vomiting"), P("abdominal_pain"), P("deep_rapid_breathing"), P("acetone_breath"), P("dehydration"), DROWSY()]
KET2 = lambda: P("urine_ketones", "in", ["2plus", "3plus"])
HI = lambda: P("glucose_meter_extreme", "==", "hi")
GLUCOSE_NOW = ["capillary_glucose", "random_pg", "fasting_pg", "postprandial_pg", "ogtt_1h_pg", "ogtt_2h_pg"]
GLU = lambda r, op=">=": [P(f, op, ref=r) for f in GLUCOSE_NOW]      # every field a current glucose can be typed into (second review, H03)
REC = lambda f: P(f, "recorded")
GLU_REC = lambda: [REC(f) for f in GLUCOSE_NOW]
KET_REC = lambda: [REC("urine_ketones"), REC("bohb")]
HYPO_SIG = ["needed_help", "measured_below_3", "repeated"]

def item(kind, iid):
    for i in REG[kind]:
        if i.get("id", i.get("code")) == iid: return i
    raise KeyError(f"{kind}:{iid}")
def tag(it, *fids):
    r = it["x"].setdefault("review", [])
    for f in fids:
        if f not in r: r.append(f)
    return it
def last(kind, *fids): return tag(REG[kind][-1], *fids)
def nref(rid, text, value, unit, claims, group, **k):
    ref(rid, text, value, unit, claims, group=group, **k)
    REFS[rid]["x"]["verification"] = {"verdict": "not_rechecked", "note": "Added after the independent re-read, from a claim whose quote that re-read confirmed.", "foundQuote": "", "urlUsed": "", "batch": None}
def val(rid): return REFS[rid]["value"]

# ═══ Features ═══════════════════════════════════════════════════════════════
N = lambda code, disp, kind, vt, sec, **k: feat(code, disp, kind, vt, sec, status="new", **k)
FEATURES["dm_status"]["options"].append({"value": "not_known", "display": "No diabetes on record"})
FEATURES["dm_status"]["x"]["note"] = "The briefing showed only 'known'. 'not_known' is proposed so that a rule can tell 'recorded as not diabetic' from 'not recorded' (F15). Phase 0 maps both to the live options."
N("glucose_meter_extreme", "Meter shows HI or LO instead of a number", "investigation", "single_select", "glycaemia", requires="device.glucometer", cfc="obs.glucose",
  options=[("hi", "HI: above the meter's range"), ("lo", "LO: below the meter's range")],
  x_note="The two most dangerous readings are not numbers. HI satisfies every high-glucose rule; LO satisfies the hypoglycaemia rule. No number is invented for either (F25, G17).")
FEATURES["capillary_glucose"]["x"]["note"] = ("Entry must offer mmol/L and mg/dL and convert in the platform, never in the clinician's head: a mg/dL value typed into a mmol/L box satisfies every threshold (F25). "
                                               "The plausibility range is a platform parameter for CSO signature; the pack types no number for it.")
N("pregnancy_possible", "Could be pregnant (computed by the platform from sex and age)", "history", "boolean", "risk_context", group="rc_pregnancy",
  x_computed="platform", x_note="When this is true and 'pregnant' is not recorded, every rule that applies only outside pregnancy is 'insufficient: pregnancy status needed' (F09). The platform owns the age band.")
for _c, _d, _sec in [("never_glucose_tested", "Never had a glucose or HbA1c test", "risk_context"), ("never_hba1c", "Never had an HbA1c", "care_processes"),
                     ("never_eye_screen", "Never had a retinal examination", "care_processes"), ("never_kidney_screen", "Never had urine albumin and creatinine checked", "care_processes"),
                     ("never_foot_assessment", "Never had a foot risk assessment", "care_processes"), ("never_neuropathy_screen", "Sensation in the feet never tested", "care_processes"),
                     ("never_lipids", "Never had a lipid profile", "care_processes")]:
    N(_c, _d, "history", "boolean", _sec, x_computed="none_on_record",
      x_note="True when the patient or clinician says it was never done, or when Design B finds none in a record known to be complete. An unanswered question leaves it not assessed: 'not asked' is never 'never' (F12).")
FEATURES["hypo_worst_12m"]["options"] = [{"value": "none", "display": "None"}, {"value": "self_treated", "display": "Once, managed without help"},
    {"value": "repeated", "display": "More than once, managed without help"}, {"value": "measured_below_3", "display": "A reading below 3.0 mmol/L"},
    {"value": "needed_help", "display": "Needed someone's help"}]
FEATURES["hypo_worst_12m"]["x"]["note"] = "The worst in the last 12 months. ADA: one or more level 2 or 3 episodes should prompt re-evaluation, so a measured value below 3.0 counts as much as needing help (F32)."
N("insulin_omitted", "Insulin stopped, missed or run out", "history", "boolean", "therapy_context")
N("hypoglycaemia_not_resolving", "Low glucose not resolving after treatment", "sign", "boolean", "acute")
N("on_antiplatelet", "On an antiplatelet medicine", "history", "boolean", "cardiovascular")
N("haemorrhagic_or_unknown_stroke", "Previous stroke that was a bleed, or of unknown type", "history", "boolean", "cardiovascular")
N("glucose_test_since_antipsychotic_start", "Glucose tested since the antipsychotic was started", "history", "boolean", "risk_context", group="rc_medicines", parent="on_second_gen_antipsychotic", restricted="mental_health")
N("ras_or_sglt2_started_recently", "ACE inhibitor, ARB or SGLT2 inhibitor started or increased since the baseline eGFR", "history", "boolean", "kidney")
FEATURES["egfr_fall_percent"]["display"] = "Sustained fall in eGFR from baseline (confirmed on a repeat)"
N("limb_ischaemia_signs", "Rest pain in the foot, or a cold, pale or dusky foot", "sign", "boolean", "foot")
N("anuria", "Passing no urine", "symptom", "boolean", "kidney")
N("hypertensive_symptoms", "With the raised pressure: headache, breathlessness, blurred vision, confusion, nausea or vomiting, or little urine", "symptom", "boolean", "cardiovascular")
N("glucose_tested_since_birth", "Glucose tested since the birth", "history", "boolean", "risk_context", group="rc_pregnancy", parent="prior_gdm")
N("ogtt_done_this_pregnancy", "A 75 g OGTT has been done in this pregnancy", "history", "boolean", "risk_context", group="rc_pregnancy", parent="pregnant")
FEATURES["cvd_established"]["x"]["note"] = "ADA's definition of atherosclerotic disease does not include transient ischaemic attack; it is kept here as a clinical addition for CSO signature (verification batch V4)."

# ═══ New reference entries ══════════════════════════════════════════════════
nref("REF-DM-ACU-BP-REFER-SBP-SYMPT", "WHO HEARTS-D same-day referral: systolic above this value (or diastolic above 110) WITH headache, breathlessness, blurred vision, changed mental state, nausea, vomiting or reduced urine output", 180, "mmHg", ["A2-37"], "acute")
nref("REF-DM-KID-REFER-FALL-HAEMO", "KDIGO 2024: in a person who has just started an ACE inhibitor, ARB or SGLT2 inhibitor, refer for a sustained fall in eGFR of more than this percentage", 30, "%", ["A6-47"], "kidney")
nref("REF-DM-EYE-RECALL-MILD-MIN", "ICO low and intermediate resource: mild NPDR, near end of the re-examination range", 12, "months", ["A7-16"], "eye", conv="source says '1-2 years'; the near end, 1 year, is 12 months",
     note="Used as the default: ICO's schedule applies only where diabetes is controlled (REF-DM-EYE-CONTROLLED-ONLY), and ADA examines yearly once any retinopathy is present.")
nref("REF-DM-EYE-RECALL-MODERATE-MIN", "ICO low and intermediate resource: moderate NPDR, near end of the re-examination range, referral required", 6, "months", ["A7-16"], "eye")

# ═══ F01  metformin below an eGFR of 30 ═════════════════════════════════════
therapy_flag("metformin_egfr_below_30", "Metformin with an eGFR below 30", "red",
    crit("tf_met30", "On metformin, eGFR below 30", all=[GLT("metformin"), P("egfr", "<", ref="REF-DM-RX-METFORMIN-STOP-EGFR")], ref_id="REF-DM-RX-METFORMIN-STOP-EGFR"),
    "WHO: metformin is contraindicated below this eGFR. ADA: it should be stopped. Review today with the prescriber.", "A2-26")
last("therapyFlags", "F01")
_f = tag(item("therapyFlags", "metformin_egfr_30_44"), "F37")
_f["action"] = "ADA: do not start metformin below an eGFR of 45. For a person already taking it, review with the prescriber today and check kidney function more often."

# ═══ F06, F32  hypoglycaemia logic reads the medicine list, not a tick-box ══
_m = tag(item("riskModels", "hypoglycaemia_risk_ada"), "F06", "F32")
_m["requires"] = ["glucose_lowering_therapy", "hypo_worst_12m", "hypo_awareness_score", "egfr", "age_years"]
_m["bands"] = [
    risk_band("high", "High", "high", crit("hypo_high", "On insulin or a sulfonylurea, with at least one of: a low needing someone's help or a reading below 3.0 in the last year, impaired awareness (Gold score 4 or more), cognitive impairment, not always enough food, eGFR below 30",
        any=ISU(), atLeast=(1, [P("hypo_worst_12m", "in", ["needed_help", "measured_below_3"]), P("hypo_awareness_score", ">=", ref="REF-DM-HYPO-IAH"), P("cognitive_impairment"), P("food_insecurity"), P("egfr", "<", ref="REF-DM-KID-GFR-G4")]), ref_id="REF-DM-HYPO-RISK")),
    risk_band("raised", "Raised", "moderate", crit("hypo_raised", "On insulin or a sulfonylurea, with at least one of: age 75 or over, eGFR below 60, harmful alcohol use, skipped meals or heavy physical work, a self-treated low in the last year",
        any=ISU(), atLeast=(1, [P("age_years", ">=", ref="REF-DM-HYPO-RISK-AGE"), P("egfr", "<", ref="REF-DM-KID-GFR-G3A"), P("alcohol_harmful"), P("meals_irregular"), P("hypo_worst_12m", "in", ["self_treated", "repeated"])]), ref_id="REF-DM-HYPO-RISK")),
    risk_band("baseline", "On a medicine that can cause lows", "low", crit("hypo_base", "On insulin or a sulfonylurea", any=ISU(), ref_id="REF-DM-HYPO-RISK")),
]
_m["applicabilityNote"] += " ADA ties age 75 to type 2 diabetes and notes that younger people with type 1 are also at very high risk."
_s = tag(item("management", "DM-ACT-EDU-03"), "F06")
_s["when"] = crit("edu_hypo", "On insulin or a sulfonylurea", any=ISU(), ref_id="REF-DM-ACT-EDU-HYPO")
_s = tag(item("management", "DM-ACT-RX-10"), "F06", "F32")
_s["display"] = "A low needing help, a reading below 3.0, or repeated lows: re-evaluate the treatment and relax the target for now"
_s["when"] = crit("rx_hypo", "On insulin or a sulfonylurea, with a low needing someone's help, a reading below 3.0 mmol/L, or repeated lows in the last year", all=[P("hypo_worst_12m", "in", HYPO_SIG)], any=ISU(), ref_id="REF-DM-HYPO-DEINTENSIFY")
_f = tag(item("therapyFlags", "hypoglycaemia_needing_help_on_treatment"), "F06", "F32")
_f["display"] = "A significant low while on insulin or a sulfonylurea"
_f["when"] = crit("tf_hypo", "On insulin or a sulfonylurea, with a low needing someone's help, a reading below 3.0 mmol/L, or repeated lows in the last year", all=[P("hypo_worst_12m", "in", HYPO_SIG)], any=ISU(), ref_id="REF-DM-HYPO-DEINTENSIFY")
_f["action"] = "ADA: one or more level 2 or 3 episodes should prompt re-evaluation of the plan, with a review of the medicine causing it. Review hypoglycaemia at every visit."
therapy_flag("glibenclamide_hypoglycaemia_concern", "Glibenclamide where hypoglycaemia is a concern", "amber",
    crit("tf_glib_hypo", "On glibenclamide, with any of: a low in the last year, not always enough food, skipped meals or heavy physical work", all=[GLT("glibenclamide")],
         any=[P("hypo_worst_12m", "in", ["self_treated"] + HYPO_SIG), P("food_insecurity"), P("meals_irregular")], ref_id="REF-DM-RX-GLIB-AGE"),
    "WHO does not recommend glibenclamide where hypoglycaemia is a particular concern. Review with the prescriber.", "A2-27")
last("therapyFlags", "F32")
del FEATURES["on_insulin_or_sulfonylurea"]

# ═══ F07, F21, F36  control bands: a low band, and a meter pathway ══════════
LOW = lambda: band("low", "Low: hypoglycaemia range", "diagnostic", to=val("REF-DM-HYPO-L1"), alert=("Glucose below 3.9 mmol/L", "Hypoglycaemia range. Act on it now and review the treatment; do not read this as good control."))
CTL3 = {"diagnostic": "Low", "normal": "At target", "intermediate": "Above target"}
def _ctl_bands(upper): return [LOW(), band("at_target", "At target", "normal", frm=val("REF-DM-HYPO-L1"), to=val(upper)), band("above_target", "Above target", "intermediate", frm=val(upper))]
BOUNDARY = " WHO's clinical target is 'at or below' this value and its programme indicator is 'below' it; the band uses 'below' until D-DM-13 is decided."
for _tid, _upper in (("fpg_control_who", "REF-DM-CTRL-FPG-SURROGATE"), ("ppg_control_who", "REF-DM-CTRL-PPG-SURROGATE")):
    _t = tag(item("interpretation", _tid), "F07", "F36")
    _t["bands"] = _ctl_bands(_upper); _t["toneLabels"] = CTL3; _t["x"]["refs"] = ["REF-DM-HYPO-L1", _upper]
    _t["note"] = "WHO's surrogate where HbA1c is unavailable or unreliable. A value below 3.9 mmol/L is shown as LOW, never as 'at target'." + BOUNDARY
interp("fcap_control_who", "capillary_glucose", "A2-58", _ctl_bands("REF-DM-CTRL-FPG-SURROGATE"), when=P("capillary_glucose_context", "==", "fasting"), toneLabels=CTL3,
       refs=["REF-DM-HYPO-L1", "REF-DM-CTRL-FPG-SURROGATE"], lane="stratify", family="DM-STR-CTRL",
       note="The district pathway for control: a fasting meter reading read against WHO's fasting surrogate. WHO states the surrogate for plasma glucose; reading a meter value against it is this pack's step, for CSO signature (D-DM-04)." + BOUNDARY)
last("interpretation", "F21", "F07")
interp("pcap_control_who", "capillary_glucose", "A2-58", _ctl_bands("REF-DM-CTRL-PPG-SURROGATE"), when=P("capillary_glucose_context", "==", "two_hours_after_food"), toneLabels=CTL3,
       refs=["REF-DM-HYPO-L1", "REF-DM-CTRL-PPG-SURROGATE"], lane="stratify", family="DM-STR-CTRL", note="A meter reading 2 hours after food, read against WHO's post-meal surrogate." + BOUNDARY)
last("interpretation", "F21", "F07")
for _tid in ("bp_systolic_who_hearts_d", "bp_diastolic_who_hearts_d"):
    item("interpretation", _tid)["note"] = (item("interpretation", _tid).get("note") or "") + " The table has no low band: a low pressure is owned by the vital-signs flags, and 'at target' here means only 'not above the treatment threshold'."
condition("hypoglycaemia", "Hypoglycaemia", "A4-14", complication_code="hypoglycaemia", status="reuse")
drule("DM-ACU-ROUTE-06", "Glucose below 3.0 mmol/L, a meter reading LO, or a low that is not resolving: hypoglycaemia. Act now", "hypoglycaemia",
      crit("acu_hypo_l2", "Any glucose below 3.0 mmol/L, a meter reading LO, or a low not resolving after treatment",
           any=GLU("REF-DM-HYPO-L2", "<") + [P("glucose_meter_extreme", "==", "lo"), P("hypoglycaemia_not_resolving")], ref_id="REF-DM-HYPO-L2"),
      "high", "immediate", ["capillary_glucose"], ["Sepsis", "Severe malaria", "Alcohol", "Adrenal insufficiency", "Liver failure"], "A4-14", "DM-ACU-ROUTE", lane="acute_route",
      notes="Route only: the treatment is owned by the acute pathway. In a person not on insulin or a sulfonylurea this is not diabetes hypoglycaemia and the general differential applies. WHO lists a low unresolved by treatment for same-day referral.",
      proposal={"kind": "acute_signal", "to": "triage"})
last("rules", "F07", "F33")
drule("DM-ACU-ROUTE-07", "Glucose below 3.9 mmol/L on insulin or a sulfonylurea: hypoglycaemia, and it can come back", "hypoglycaemia",
      crit("acu_hypo_l1", "Glucose below 3.9 mmol/L in a person on insulin or a sulfonylurea", any=GLU("REF-DM-HYPO-L1", "<"), atLeast=(1, ISU()), ref_id="REF-DM-HYPO-L1"),
      "high", "immediate", ["capillary_glucose"], ["A meter error (repeat the reading)", "Sepsis", "Alcohol"], "A4-14", "DM-ACU-ROUTE", lane="acute_route",
      notes="Route only. A fasting value in this range is never shown as 'at target'. Ask what changed: a missed meal, hard work, alcohol, a new medicine, falling kidney function.",
      proposal={"kind": "acute_signal", "to": "triage"})
last("rules", "F07")

# ═══ F02, F25  the sick adult is routed on the picture, not on a strip ══════
condition("hyperglycaemic_crisis", "Suspected ketoacidosis or hyperosmolar state", "A2-40")
condition("hhs", "Hyperosmolar hyperglycaemic state", "A9-07", complication_code="hhs", status="reuse")
CRISIS_TESTS = ["urine_ketones", "bohb", "venous_ph", "bicarbonate", "sodium", "urea"]
drule("DM-ACU-ROUTE-11", "Raised glucose with vomiting, abdominal pain, deep breathing, dehydration or drowsiness: suspected ketoacidosis or hyperosmolar state. Route now; do not wait for ketones", "hyperglycaemic_crisis",
      crit("acu_picture", "Glucose 11.1 mmol/L or more (or a meter reading HI), with any of: vomiting, abdominal pain, deep rapid breathing, acetone on the breath, dehydration, drowsiness or worse",
           any=UNWELL(), atLeast=(1, GLU("REF-DM-ACU-DKA-GLU") + [HI()]), ref_id="REF-DM-ACU-REFER-ALL"),
      "high", "immediate", CRISIS_TESTS, ["Sepsis", "Severe malaria", "Gastroenteritis", "Acute abdomen", "Stroke"], "A2-40", "DM-ACU-ROUTE", lane="acute_route", ageBands=ADULT,
      notes="WHO: refer to hospital all patients with SUSPECTED ketoacidosis or hyperosmolar state. Suspicion is clinical. A hyperosmolar state is ketone-negative by definition, so a negative strip clears nobody; a trace or 1+ strip with this picture is still routed.",
      proposal={"kind": "acute_signal", "to": "triage"})
last("rules", "F02")
drule("DM-ACU-ROUTE-13", "Known diabetes and vomiting, abdominal pain, deep breathing, dehydration or drowsiness: capillary glucose and ketones now", "hyperglycaemic_crisis",
      crit("acu_known_unwell", "Known diabetes, with any of: vomiting, abdominal pain, deep rapid breathing, acetone on the breath, dehydration, drowsiness or worse", all=[KNOWN()], any=UNWELL(), ref_id="REF-DM-RX-SICKDAY-HOLD",
           needs="A pack rule built from ADA's intercurrent-illness guidance (monitor glucose more often) and WHO's 'refer all suspected' rule. No source states it in these words: for CSO signature."),
      "moderate", "immediate", ["capillary_glucose", "urine_ketones", "bohb"], ["Gastroenteritis", "Malaria", "Hypoglycaemia (check the glucose before assuming it is high)"], "A4-64", "DM-ACU-ROUTE", lane="acute_route", ageBands=ADULT,
      notes="A bedside test, asked for at once because the same picture is hypoglycaemia, ketoacidosis or neither. On an SGLT2 inhibitor ketoacidosis can occur with a normal glucose (rule 03).",
      proposal={"kind": "test.order", "test": ["test.glucose_capillary", "test.ketones_urine"], "tier": "now"})
last("rules", "F02")
drule("DM-ACU-ROUTE-14", "Glucose 33.3 mmol/L or more, or a meter reading HI: suspect a hyperosmolar state whatever the ketones", "hhs",
      crit("acu_hhs_glu", "Any glucose 33.3 mmol/L or more, or a meter reading HI", any=GLU("REF-DM-ACU-HHS-GLU") + [HI()], ref_id="REF-DM-ACU-HHS-GLU"),
      "high", "immediate", ["sodium", "urea", "effective_osmolality", "urine_ketones", "bohb"], ["Ketoacidosis (the two overlap in more than a third of crises)", "A meter error (repeat, and send a laboratory glucose)"], "A9-07", "DM-ACU-ROUTE", lane="acute_route",
      notes="Negative or weak ketones do not clear the patient: that is the definition of the hyperosmolar state. Typical patient: older, type 2, drowsy and very dry, often with an infection.",
      proposal={"kind": "acute_signal", "to": "triage"})
last("rules", "F02", "F25")
_r = tag(item("rules", "DM-ACU-ROUTE-01"), "F02", "F25")
_r["display"] = "Glucose 18 mmol/L or more (or a meter reading HI): test urine ketones today"
_r["urgency"] = "same_day"
_r["when"] = crit("acu_glu18", "Glucose 18 mmol/L or more, or a meter reading HI", any=GLU("REF-DM-ACU-KETONE-TEST-GLU") + [HI()], ref_id="REF-DM-ACU-KETONE-TEST-GLU")
_r["notes"] = ("WHO primary-care protocol. Ketones 2+ or more: refer now. Ketones negative but the patient is unwell, dry or drowsy, or no strip is available: refer; a negative strip does not exclude a hyperosmolar state. "
               "Same-day, not an interrupt, when the patient is well: readings of 18 or more are common, and an interrupt on every one would be dismissed. With vomiting, pain, deep breathing, dehydration or drowsiness rule 11 interrupts.")

# ═══ F03  children ══════════════════════════════════════════════════════════
_r = tag(item("rules", "DM-ACU-ROUTE-04"), "F03")
_r["display"] = "A child who is vomiting, in pain, breathing deeply, dry or drowsy, with symptoms of diabetes, a raised glucose, ketones or known diabetes: hospital now"
_r["when"] = crit("acu_paed", "Any of vomiting, abdominal pain, deep rapid breathing, dehydration, drowsiness or worse; with at least one of: thirst, passing a lot of urine, weight loss, new bed-wetting, glucose above 11 mmol/L, a meter reading HI, known diabetes, urine ketones 2+ or more, blood ketones 3.0 mmol/L or more",
    any=[P("vomiting"), P("abdominal_pain"), P("deep_rapid_breathing"), P("dehydration"), DROWSY()],
    atLeast=(1, [P("polyuria"), P("polydipsia"), P("unexplained_weight_loss"), P("secondary_enuresis"), P("capillary_glucose", ">", ref="REF-DM-ACU-PAED-GLU"), P("random_pg", ">", ref="REF-DM-ACU-PAED-GLU"),
                 HI(), KNOWN(), KET2(), P("bohb", ">=", ref="REF-DM-ACU-DKA-BOHB")]), claim_id="A9-31")
_r["notes"] = ("NICE: glucose above 11 mmol/L with these features goes immediately to a hospital with paediatric facilities; in a child with KNOWN diabetes suspect ketoacidosis even if the glucose is normal. "
               "The history of thirst is often missing in a drowsy child brought by a relative, so a glucose, ketones or known diabetes stands in for it. Recognition and referral only: no fluid or insulin content is carried for children.")
drule("DM-ACU-ROUTE-15", "A child who is breathing deeply, dry or drowsy: capillary glucose now", "dka",
      crit("acu_paed_glucose", "A child with any of: deep rapid breathing, dehydration, drowsiness or worse", any=[P("deep_rapid_breathing"), P("dehydration"), DROWSY()], ref_id="REF-DM-SUS-PAED-MIMIC"),
      "low", "immediate", ["capillary_glucose", "urine_ketones"], ["Malaria", "Pneumonia", "Gastroenteritis", "Sepsis"], "A9-32", "DM-ACU-ROUTE", lane="acute_route", ageBands=CHILD,
      notes="In limited-resource settings ketoacidosis in a child is taken for malaria, pneumonia or gastroenteritis. The test takes a minute and also finds hypoglycaemia. It does not wait for a history of thirst or polyuria.",
      proposal={"kind": "test.order", "test": "test.glucose_capillary", "tier": "now"})
last("rules", "F03")
_r = tag(item("rules", "DM-SUS-PAED-01"), "F03", "F38")
_r["display"] = "A child who is thirsty, passing a lot of urine or wetting the bed again: capillary glucose now"
_r["when"] = crit("sus_paed_4t", "Any of: passing large volumes of urine, excessive thirst, new bed-wetting", any=[P("polyuria"), P("polydipsia"), P("secondary_enuresis")], claim_id="A9-29")
drule("DM-SUS-PAED-02", "A child losing weight: include a capillary glucose in the work-up today", "type_1_diabetes",
      crit("sus_paed_weight", "A child with unexplained weight loss", all=[P("unexplained_weight_loss")], claim_id="A9-29"),
      "low", "same_day", ["capillary_glucose", "urine_ketones"], ["Undernutrition", "Tuberculosis", "HIV", "Malabsorption"], "A9-29", "DM-SUS-PAED", ageBands=CHILD,
      notes="Weight loss alone in a Ugandan child is usually undernutrition, TB or HIV, so this is a same-day test and not an interrupt. Tiredness alone is not tested: it would fire on most sick children.",
      proposal={"kind": "test.order", "test": "test.glucose_capillary", "tier": "today"})
last("rules", "F03", "F38")

# ═══ F08, F33  feet and limbs ═══════════════════════════════════════════════
_s = tag(item("management", "DM-ACT-REFER-FOOT-01"), "F08")
_s["display"] = "A foot ulcer with infection, gangrene, or reduced or absent pulses: refer today"
_s["when"] = crit("ref_foot", "An active foot ulcer with any of: infection, gangrene, reduced or absent foot pulses", all=[P("active_foot_ulcer")],
                  any=[P("foot_infection_grade", "in", ["mild", "moderate", "severe"]), P("foot_gangrene"), P("pedal_pulses", "in", ["reduced", "absent"])], ref_id="REF-DM-FOOT-URGENT")
step("DM-ACT-REFER-FOOT-03", "Gangrene, or a moderate or severe foot infection: refer today",
     crit("ref_foot_noulcer", "Gangrene, or a moderate or severe foot infection, with or without an ulcer", any=[P("foot_gangrene"), P("foot_infection_grade", "in", ["moderate", "severe"])], ref_id="REF-DM-FOOT-URGENT"),
     "A8-74", "refer", "DM-ACT-REFER", urgency="same_day", proposal={"kind": "refer", "to": "surgical_or_foot_service"})
last("management", "F08")
step("DM-ACT-REFER-FOOT-02", "Active foot ulcer: refer to a higher level of care",
     crit("ref_ulcer", "An active foot ulcer", all=[P("active_foot_ulcer")], ref_id="REF-DM-FOOT-EVERY-VISIT"),
     "A2-36", "refer", "DM-ACT-REFER", urgency="urgent", proposal={"kind": "refer", "to": "higher_level_or_foot_service"},
     note="WHO HEARTS-D: 'refer to higher level of care if ulcer present or pulse absent'. NICE NG19 gives 1 working day for an active foot problem that is not limb-threatening. An ulcer that has not shrunk by half in 4 weeks needs reassessment (REF-DM-FOOT-NO-IMPROVE).")
last("management", "F08")["x"]["notWhen"] = [crit("ref_ulcer_already_today", "Infection, gangrene, or reduced or absent pulses (the same-day rule applies)",
     any=[P("foot_infection_grade", "in", ["mild", "moderate", "severe"]), P("foot_gangrene"), P("pedal_pulses", "in", ["reduced", "absent"])], ref_id="REF-DM-FOOT-URGENT")]
tag(item("management", "DM-ACT-REFER-PVD-01"), "F08")["x"]["notWhen"] = [crit("ref_pvd_ulcer", "An active foot ulcer (an ulcer with absent pulses is referred today)", all=[P("active_foot_ulcer")], ref_id="REF-DM-FOOT-URGENT")]
step("DM-ACT-REFER-LIMB-01", "Rest pain or a cold, pale or dusky foot, or an ankle-brachial index below 0.4: refer today",
     crit("ref_limb", "Rest pain or a cold, pale or dusky foot, or an ankle-brachial index below 0.4", any=[P("limb_ischaemia_signs"), P("abi", "<", ref="REF-DM-FOOT-ISCH-ABI")], ref_id="REF-DM-ACT-REFER-SAMEDAY"),
     "A2-37", "refer", "DM-ACT-REFER", urgency="same_day", proposal={"kind": "refer", "to": "surgical_or_vascular_service"}, note="WHO lists critical limb ischaemia for same-day referral.")
last("management", "F33")

# ═══ F09  pregnancy at a site with a meter ══════════════════════════════════
drule("DM-CON-PREG-03", "Pregnant with a glucose of 11.1 mmol/L or more on any sample, meter included: refer today for specialised antenatal care", "diabetes_in_pregnancy",
      crit("con_preg_any_11", "Pregnant, with any glucose of 11.1 mmol/L or more (plasma or meter, any timing), or a meter reading HI",
           all=[P("pregnant")], any=[P("capillary_glucose", ">=", ref="REF-DM-DX-RANDOM"), P("random_pg", ">=", ref="REF-DM-DX-RANDOM"), P("ogtt_2h_pg", ">=", ref="REF-DM-DX-OGTT2H"), HI()], ref_id="REF-DM-PREG-DIP",
           needs="A referral rule, not a diagnosis. WHO 2013 diagnoses diabetes in pregnancy on plasma glucose; no source read here says how to act on a meter value in pregnancy. FIGO 2015 discusses plasma-calibrated meters and was not read for this point. For CSO signature (D-DM-28)."),
      "high", "same_day", ["fasting_pg", "ogtt_2h_pg", "urine_ketones"], ["A meter reading taken soon after a sugary drink"], "A10-02", "DM-CON-PREG", lane="confirm",
      notes="Most antenatal care in Uganda is at health centre III with a meter. The laboratory criteria sets stay 'unavailable' there; this rule makes sure the woman is not left with a routine suggestion.",
      proposal={"kind": "refer", "to": "antenatal_clinic_specialist", "tier": "today"})
last("rules", "F09")
drule("DM-CON-PREG-04", "Pregnant with a fasting meter glucose of 5.1 mmol/L or more: send a laboratory glucose", "gestational_diabetes",
      crit("con_preg_fcap", "Pregnant, with a fasting capillary glucose of 5.1 mmol/L or more", all=[P("pregnant"), P("capillary_glucose_context", "==", "fasting"), P("capillary_glucose", ">=", ref="REF-DM-PREG-GDM-FPG")], ref_id="REF-DM-PREG-GDM-FPG",
           needs="WHO's gestational criteria are stated for plasma glucose. Reading a meter value against the fasting threshold only to trigger a laboratory test is this pack's step (D-DM-28)."),
      "moderate", "urgent", ["fasting_pg", "ogtt_1h_pg", "ogtt_2h_pg"], ["A sample that was not truly fasting", "Meter error near the threshold (15% is allowed)"], "A10-03", "DM-CON-PREG", lane="confirm",
      proposal={"kind": "refer", "to": "laboratory_glucose_or_antenatal_clinic", "tier": "soon"})
last("rules", "F09")
_r = tag(item("rules", "DM-CON-PREG-02"), "F09")
_r["when"]["label"] = "Pregnant, with fasting plasma glucose 7.0 mmol/L or more, or 2-hour 11.1 or more (a random 11.1 with symptoms is in the criteria set, and any 11.1 is referred by rule DM-CON-PREG-03)"
tag(item("rules", "DM-SUS-PREG-01"), "F38")["x"]["notWhen"] = [crit("sus_preg_done", "A 75 g OGTT has been done in this pregnancy", all=[P("ogtt_done_this_pregnancy")], ref_id="REF-DM-PREG-WINDOW-START")]
tag(item("rules", "DM-SUS-PREG-02"), "F38")["x"]["notWhen"] = [crit("sus_pp_done", "Glucose has been tested since the birth", all=[P("glucose_tested_since_birth")], ref_id="REF-DM-PREG-POSTPARTUM-FROM")]

# ═══ F10  restricted reasons never ride in a display string ═════════════════
_t = tag(item("targets", "tgt_hba1c_tb"), "F10")
_t["display"] = "HbA1c below 8.0% for now (a short-term relaxed target)"
_t["x"]["restrictedReason"] = "On TB treatment with markedly raised glucose (WHO TB handbook)."
NEUTRAL = {  # what a surface without the restricted class may show
    "DM-SUS-POP-HIV-01": "Glucose test due", "DM-SUS-POP-DTG-01": "Check glucose today", "DM-SUS-POP-TB-01": "Offer a diabetes test",
    "DM-SUS-POP-ANTIPSYCH-01": "Glucose test due", "DM-SUS-POP-ANTIPSYCH-02": "Glucose test due", "DM-ACT-SCREEN-TB-01": "Cough for more than 2 weeks: assess",
    "DM-ACT-EDU-08": "Discuss future plans and medicines", "ras_blocker_or_statin_could_conceive": "Medicine review needed", "sulfonylurea_with_rifampicin": "Medicine interaction: monitor glucose",
    "dolutegravir_with_metformin": "Medicine interaction: follow up closely", "hba1c_hiv_on_art": "HbA1c is not reliable for this patient: use glucose",
    "glucose_tb_at_diagnosis": "Re-check this glucose in a month", "capillary_glucose_tb_at_diagnosis": "Re-check this glucose in a month", "fasting_glucose_tb_at_diagnosis": "Re-check this glucose in a month",
    "tgt_hba1c_tb": "HbA1c below 8.0% for now",
}

# ═══ F11, F24  remission is for type 2; a type 1 off insulin is an emergency in waiting ═
_cs = tag(item("diagnosis_pending", "consensus_2021_remission"), "F11")
_cs["anyOf"] = [crit("remission_hba1c", "Type 2 diabetes recorded, HbA1c below 6.5%, off all glucose-lowering medicines for 3 months or more",
    all=[KNOWN(), T2(), P("hba1c", "<", ref="REF-DM-CLS-REMISSION-HBA1C"), P("months_off_glucose_lowering", ">=", ref="REF-DM-CLS-REMISSION-MONTHS")], ref_id="REF-DM-CLS-REMISSION-HBA1C")]
_cs["x"]["notWhen"] = [crit("remission_glucose_high", "A glucose in the diabetes range now: fasting 7.0 mmol/L or more, or any other reading 11.1 or more",
    any=[P("fasting_pg", ">=", ref="REF-DM-DX-FPG"), P("capillary_glucose", ">=", ref="REF-DM-DX-RANDOM"), P("random_pg", ">=", ref="REF-DM-DX-RANDOM")], ref_id="REF-DM-CLS-REMISSION-HBA1C")]
_cs["x"]["note"] = "Never evaluated for type 1 or an unclassified type. An HbA1c that reads falsely low (haemolysis, malaria, a variant, recent transfusion) is blocked by its validity caveat."
drule("DM-ACU-ROUTE-09", "Type 1 diabetes and not on insulin: check glucose and ketones now, and find out why", "dka",
      crit("acu_t1_no_insulin", "Type 1 diabetes recorded, and insulin is not among the current medicines", all=[P("dm_type_recorded", "==", "type_1"), NOTGLT("insulin")], ref_id="REF-DM-RX-INSULIN-T1"),
      "high", "same_day", ["capillary_glucose", "urine_ketones", "bohb"], ["A record that is out of date (confirm with the patient)"], "A9-09", "DM-ACU-ROUTE", lane="acute_route",
      notes="Omission of insulin is one of the two commonest precipitants of ketoacidosis. Stock-outs, cost and fasting make it a regular event. Becomes an interrupt through rules 02 and 11 once ketones or the clinical picture are present.",
      proposal={"kind": "test.order", "test": ["test.glucose_capillary", "test.ketones_urine"], "tier": "now"})
last("rules", "F24")
drule("DM-ACU-ROUTE-10", "Insulin stopped, missed or run out: check glucose and ketones now", "dka",
      crit("acu_insulin_omitted", "Insulin stopped, missed or run out", all=[P("insulin_omitted")], ref_id="REF-DM-ACU-PRECIPITANTS"),
      "moderate", "same_day", ["capillary_glucose", "urine_ketones", "bohb"], ["Insulin stopped on medical advice in type 2 diabetes"], "A9-09", "DM-ACU-ROUTE", lane="acute_route",
      notes="Fires whatever the recorded type: many people on insulin from diagnosis are recorded as type 2 or unclassified.",
      proposal={"kind": "test.order", "test": ["test.glucose_capillary", "test.ketones_urine"], "tier": "now"})
last("rules", "F24")

# ═══ F12, F30, F38  'due' rules also fire for the never-tested ══════════════
def _due(kind, iid, cid, label, never, months_feature, mref, display, all_=None, any_extra=None, ref_id=None, claim_id=None):
    it = tag(item(kind, iid), "F12")
    it["display"] = display
    it["when"] = crit(cid, label, all=all_, any=[P(never), P(months_feature, ">=", ref=mref)] + (any_extra or []), ref_id=ref_id, claim_id=claim_id)
_due("management", "DM-ACT-TEST-HBA1C-01", "due_hba1c_6", "Confirmed diabetes, with no HbA1c ever, or 6 months or more since the last", "never_hba1c", "months_since_hba1c", "REF-DM-CTRL-WINDOW-AT-TARGET",
     "HbA1c is due (never done, or 6 months since the last)", all_=[KNOWN()], ref_id="REF-DM-CTRL-WINDOW-AT-TARGET")
_due("management", "DM-ACT-SCREEN-EYE-01", "due_eye", "Confirmed diabetes, with no retinal examination ever, or 24 months or more since the last", "never_eye_screen", "months_since_eye_screen", "REF-DM-EYE-INTERVAL-WHO",
     "Retinal examination is due (never done, or 2 years since the last)", all_=[KNOWN()], ref_id="REF-DM-EYE-INTERVAL-WHO")
_due("management", "DM-ACT-SCREEN-KIDNEY-01", "due_kidney", "Confirmed diabetes, with urine albumin and creatinine never checked, or 12 months or more since the last check", "never_kidney_screen", "months_since_kidney_screen", "REF-DM-KID-SCREEN-INTERVAL",
     "Kidney check is due (urine albumin and creatinine: never done, or 12 months since the last)", all_=[KNOWN()], ref_id="REF-DM-KID-SCREEN-INTERVAL")
_due("management", "DM-ACT-SCREEN-FOOT-01", "due_foot", "Confirmed diabetes, with no foot risk assessment ever, or 12 months or more since the last", "never_foot_assessment", "months_since_foot_risk_assessment", "REF-DM-FOOT-INT-0",
     "Foot risk assessment is due (never done, or 12 months since the last)", all_=[KNOWN()], ref_id="REF-DM-FOOT-INT-0")
_due("management", "DM-ACT-SCREEN-NEURO-01", "due_neuro", "Confirmed diabetes, with sensation never tested, or 12 months or more since it was", "never_neuropathy_screen", "months_since_neuropathy_screen", "REF-DM-NEU-INTERVAL",
     "Sensation testing is due (never done, or 12 months since the last)", all_=[KNOWN()], ref_id="REF-DM-NEU-INTERVAL")
_due("management", "DM-ACT-SCREEN-LIPID-01", "due_lipids", "Confirmed diabetes, with no lipid profile ever, or 12 months or more since the last", "never_lipids", "months_since_lipids", "REF-DM-CVD-LIPID-INTERVAL",
     "Lipid profile is due (never done, or 12 months since the last)", all_=[KNOWN()], ref_id="REF-DM-CVD-LIPID-INTERVAL")
item("management", "DM-ACT-SCREEN-LIPID-01")["x"]["note"] += " ADA 10.16 is grade E, for people not on lipid-lowering treatment; after starting or changing it ADA asks for a profile 4 to 12 weeks later."
item("management", "DM-ACT-SCREEN-EYE-01")["x"]["note"] = "Type 1: from 5 years after onset. A retinal examination blocked by a validity caveat (undilated direct ophthalmoscopy) does not reset the interval."
_due("rules", "DM-SUS-RISK-01", "sus_risk_who", "Age 40 or over with BMI 25 or more, and never tested or not tested in the last 36 months", "never_glucose_tested", "months_since_glucose_test", "REF-DM-SUS-RESCREEN",
     "Aged 40 or over and overweight, never tested or not tested for 3 years: offer a fasting glucose", all_=[P("age_years", ">=", ref="REF-DM-SUS-AGE-WHO"), P("bmi", ">=", ref="REF-DM-SUS-BMI")], ref_id="REF-DM-SUS-AGE-WHO")
tag(item("rules", "DM-SUS-RISK-01"), "F38")["notes"] += " WHO gives no re-test interval; 3 years is ADA's, used here only to stop the rule firing at every visit. It is a maximum gap: symptoms or a change in risk bring the test forward."
_due("rules", "DM-SUS-RISK-03", "sus_risk_age_ada", "Age 35 or over, and never tested or not tested in the last 36 months", "never_glucose_tested", "months_since_glucose_test", "REF-DM-SUS-RESCREEN",
     "Aged 35 or over and never tested, or not tested for 3 years: offer testing", all_=[P("age_years", ">=", ref="REF-DM-SUS-AGE-ADA")], ref_id="REF-DM-SUS-AGE-ADA")
item("rules", "DM-SUS-RISK-03")["notes"] = "ADA only. WHO does not test asymptomatic adults who are not overweight. Off by default (D-DM-05)."
_due("rules", "DM-SUS-RISK-04", "sus_ih_retest", "Previously in the intermediate range, and never re-tested or not tested in the last 12 months", "never_glucose_tested", "months_since_glucose_test", "REF-DM-IH-RETEST",
     "Borderline glucose before: re-test every year", all_=[P("prior_intermediate_hyperglycaemia")], ref_id="REF-DM-IH-RETEST")
_due("rules", "DM-SUS-RISK-05", "sus_gdm_retest", "Gestational diabetes in a previous pregnancy, and never tested since or not tested in the last 36 months", "never_glucose_tested", "months_since_glucose_test", "REF-DM-SUS-GDM-RETEST-MAX",
     "Gestational diabetes in the past: test for diabetes at least every 3 years", all_=[P("prior_gdm")], ref_id="REF-DM-SUS-GDM-RETEST-MAX")
_due("rules", "DM-SUS-POP-HIV-01", "sus_hiv_annual", "On ART, and never tested or not tested in the last 12 months", "never_glucose_tested", "months_since_glucose_test", "REF-DM-IH-RETEST",
     "Living with HIV on ART: fasting glucose every year", all_=[P("hiv_on_art")], claim_id="A3-26")
_due("rules", "DM-SUS-POP-PANC-01", "sus_pancreatitis", "Acute pancreatitis in the past, or chronic pancreatitis, and never tested or not tested in the last 12 months", "never_glucose_tested", "months_since_glucose_test", "REF-DM-IH-RETEST",
     "After pancreatitis: test for diabetes", all_=[P("pancreatitis_history", "in", ["acute", "chronic"])], claim_id="A3-31")
_due("rules", "DM-SUS-POP-TB-01", "sus_tb", "TB newly diagnosed or on treatment, and never tested or not tested in the last 12 months", "never_glucose_tested", "months_since_glucose_test", "REF-DM-IH-RETEST",
     "TB: offer a diabetes test to everyone who does not know their status", all_=[P("tb_current")], claim_id="A10-31")
tag(item("rules", "DM-SUS-POP-TB-01"), "F38")
for _rid in ("DM-SUS-RISK-02",):
    item("rules", _rid)["notes"] += " Like every eligibility rule here it is a prompt to offer a test; it does not look at when the last test was, so the engine shows it once per episode of care (Design B)."
# antipsychotics: the 12-week re-test, then yearly (F30)
_r = tag(item("rules", "DM-SUS-POP-ANTIPSYCH-01"), "F30")
_r["display"] = "On a second-generation antipsychotic for 12 weeks or more with no glucose test since it was started: check glucose"
_r["when"] = crit("sus_antipsychotic", "On a second-generation antipsychotic, started 12 or more weeks ago, with no glucose test since the start",
                  all=[P("on_second_gen_antipsychotic"), P("weeks_since_antipsychotic_start", ">=", ref="REF-DM-SUS-ANTIPSYCH-WEEKS"), P("glucose_test_since_antipsychotic_start", "absent")], claim_id="A3-28")
_r["notes"] = "ADA: baseline, 12 to 16 weeks after starting, then yearly. 'No test since the start' must be recorded as no; an unanswered question does not fire the rule. Restricted class: mental_health."
drule("DM-SUS-POP-ANTIPSYCH-02", "On a second-generation antipsychotic: glucose at baseline and every year", "drug_associated_hyperglycaemia",
      crit("sus_antipsychotic_annual", "On a second-generation antipsychotic, and never tested or not tested in the last 12 months", all=[P("on_second_gen_antipsychotic")],
           any=[P("never_glucose_tested"), P("months_since_glucose_test", ">=", ref="REF-DM-IH-RETEST")], claim_id="A3-28"),
      "low", "routine", ["fasting_pg", "hba1c"], ["Acute illness at the time of testing (transitory hyperglycaemia)", "Steroid treatment at the time of testing"], "A3-28", "DM-SUS-POP", ageBands=ADULT,
      notes="Olanzapine and clozapine can produce diabetes and ketoacidosis within months. Restricted class: mental_health.",
      proposal={"kind": "test.order", "test": "glucose_fasting", "tier": "routine", "restrictedClass": "mental_health"})
last("rules", "F30", "F12")

# ═══ F13, F14, F15  the meter-only site; the single abnormal result; the unlisted diabetic ═
_cs = tag(item("diagnosis", "who_hearts_d_2020"), "F13")
_c = next(c for c in _cs["anyOf"] if c["id"] == "who_hd_random_cap_symptoms")
_c["all"][1] = P("capillary_glucose_context", "in", ["random", "two_hours_after_food"])
_c["label"] = "Capillary glucose 11.1 mmol/L or more (meter; random, or 2 hours after food), with thirst, passing a lot of urine or unexplained weight loss"
_cs["anyOf"].append(crit("who_hd_cap_high_symptoms", "Any capillary glucose 12.2 mmol/L or more (meter, whatever the timing), with thirst, passing a lot of urine or unexplained weight loss",
    all=[P("capillary_glucose", ">=", ref="REF-DM-DX-OGTT2H-CAP")], any=SYM(), ref_id="REF-DM-DX-OGTT2H-CAP",
    needs="A pack inference: 12.2 mmol/L is the highest capillary threshold in WHO's table, so a reading at or above it is in the diabetes range whatever its timing. WHO does not state this as a criterion. For CSO signature with D-DM-04."))
drule("DM-SUS-INCID-02", "One result in the diabetes range: with symptoms it is diagnostic; without them, repeat on another day and do not leave it", "diabetes_undiagnosed",
      crit("sus_single_abnormal", "Any one of: fasting plasma glucose 7.0 mmol/L or more, HbA1c 6.5% or more, 2-hour plasma glucose 11.1 mmol/L or more",
           any=[P("fasting_pg", ">=", ref="REF-DM-DX-FPG"), P("hba1c", ">=", ref="REF-DM-DX-HBA1C"), P("ogtt_2h_pg", ">=", ref="REF-DM-DX-OGTT2H")], ref_id="REF-DM-DX-REPEAT-WHO"),
      "moderate", "routine", ["fasting_pg", "ogtt_2h_pg", "hba1c", "repeat_abnormal_result"], ["Acute illness (stress hyperglycaemia)", "Steroid treatment", "A sample that was not truly fasting", "An HbA1c raised by iron or B12 deficiency"], "A2-04", "DM-SUS-INCID", ageBands=ADULT,
      notes="WHO: repeat, preferably the same test, as soon as practicable on a subsequent day. Where a validity caveat is in force on the HbA1c the repeat is a glucose test. The rule never proposes a diagnosis.",
      proposal={"kind": "test.repeat", "test": "same_test_or_glucose_if_hba1c_invalid", "tier": "soon"})
last("rules", "F14")["x"]["notWhen"] = [crit("sus_single_repeated", "A second diabetes-range result on a later day is already recorded", all=[P("repeat_abnormal_result")], ref_id="REF-DM-DX-REPEAT-WHO")]
_r = tag(item("rules", "DM-SUS-INCID-01"), "F35")
_r["display"] = "Glucose 11.1 mmol/L or more on a random sample or a meter: diagnostic with symptoms; without them, repeat on another day and do not leave it"
_r["when"]["label"] = "Glucose 11.1 mmol/L or more on a random plasma sample or any meter reading"
_s = tag(item("management", "DM-SUS-RECON-01"), "F15")
_s["when"] = crit("recon_gl_med", "Recorded as having no diabetes, and taking metformin, a sulfonylurea or insulin",
                  all=[P("dm_status", "==", "not_known")], any=[GLT(v) for v in ["metformin", "glibenclamide", "gliclazide", "glimepiride", "insulin"]], claim_id="A3-55")
designb("DM-SUS-RECON-02", "DM-SUS-RECON", "suspect", "A glucose-lowering medicine on the medicine list and no diabetes on the problem list", "medicineWithoutDiagnosis",
        {"rule": "REF-DM-CLS-UNCLASSIFIED"}, ["med.glucose_lowering", "cond.diabetes"], ["proposal", "data_gap"], ["A3-55"], minTrust=2,
        note="The catalog rule DM-SUS-RECON-01 needs 'no diabetes' to be recorded. This rule reads the whole record and fires on the ABSENCE of a diabetes condition, which the catalog grammar cannot assert (F15).")

# ═══ F16, F17, F18, F27, F19  type ══════════════════════════════════════════
_r = tag(item("rules", "DM-CLS-T1-01"), "F16", "F17")
_r["display"] = "Ketones now in a person with diabetes: treat as insulin-deficient until shown otherwise"
_r["when"] = crit("cls_ketosis", "Urine ketones 2+ or more now", all=[KET2()], ref_id="REF-DM-CLS-T1-SAMEDAY")
_r["x"]["notWhen"] = [crit("cls_ketosis_sglt2", "On an SGLT2 inhibitor (ketosis on this medicine is owned by acute rule 03 and says nothing about the type)", all=[GLT("sglt2_inhibitor")], ref_id="REF-DM-ACU-EDKA")]
_r["x"]["runWhenOverride"] = "established_or_met"
drule("DM-CLS-T1-03", "Ketosis at first presentation and the type never settled: review the type", "insulin_deficient_diabetes",
      crit("cls_ketosis_past", "Ketosis or ketoacidosis at first presentation", all=[P("ketosis_at_presentation")], ref_id="REF-DM-CLS-KPD"),
      "moderate", "routine", ["islet_autoantibodies", "c_peptide", "urine_ketones"], ["Ketosis-prone type 2 diabetes (common in sub-Saharan Africa: comes off insulin and stays well)", "Type 1 diabetes"], "A2-18", "DM-CLS-T1", lane="classify",
      notes="A historical fact, so a routine review and never a same-day rule. Silent once the person has come off insulin and stayed well, or a clinician has recorded the type.",
      proposal={"kind": "diagnosis.reclassify", "review": "type"})
last("rules", "F16")["x"]["notWhen"] = [crit("cls_ketosis_settled", "Came off insulin and stayed well, or a clinician has recorded the type",
      any=[P("insulin_stopped_without_relapse"), P("dm_type_recorded", "in", ["type_1", "type_2", "gestational", "other"])], ref_id="REF-DM-CLS-KPD")]
drule("DM-CLS-T1-05", "Type not yet classified, not on insulin, and two or more features of insulin deficiency: check ketones today", "insulin_deficient_diabetes",
      crit("cls_t1_unclassified", "Type recorded as not yet classified, insulin not among the current medicines, and at least two of: diagnosed before age 35, BMI below 25, unexplained weight loss, glucose above 20 mmol/L at presentation",
           all=[P("dm_type_recorded", "==", "unclassified"), NOTGLT("insulin")],
           atLeast=(2, [P("age_at_diagnosis", "<", ref="REF-DM-CLS-T1-AGE"), P("bmi", "<", ref="REF-DM-CLS-T1-BMI"), P("unexplained_weight_loss"), P("glucose_at_presentation", ">", ref="REF-DM-CLS-T1-GLU")]), ref_id="REF-DM-CLS-T1-SAMEDAY"),
      "moderate", "same_day", ["urine_ketones", "bohb", "islet_autoantibodies"], ["Lean type 2 diabetes (a third of Ugandan adults with non-autoimmune diabetes)", "HIV, TB or cancer as the cause of weight loss"], "A2-37", "DM-CLS-T1", lane="classify", ageBands=ADULT,
      notes="The established patient nobody has classified and who is not on insulin is the one at risk. Once a clinician records the type, or insulin is started, this rule is silent and DM-CLS-T1-02 (routine) remains.",
      proposal={"kind": "test.order", "test": "test.ketones_urine", "tier": "today", "then": "review the type the same day"})
last("rules", "F17", "F41")
tag(item("rules", "DM-CLS-ATYP-01"), "F17")["x"]["runWhenOverride"] = "established_or_met"
drule("DM-CLS-T1-04", "Newly diagnosed and two or more of: under 35, BMI below 25, unexplained weight loss. Check ketones now and do not assume type 2", "insulin_deficient_diabetes",
      crit("cls_t1_new", "At least two of: aged under 35, BMI below 25, unexplained weight loss", atLeast=(2, [P("age_years", "<", ref="REF-DM-CLS-T1-AGE"), P("bmi", "<", ref="REF-DM-CLS-T1-BMI"), P("unexplained_weight_loss")]), ref_id="REF-DM-CLS-T1-SAMEDAY"),
      "moderate", "same_day", ["urine_ketones", "bohb", "islet_autoantibodies", "c_peptide"],
      ["Lean type 2 diabetes (a third of Ugandan adults with non-autoimmune diabetes)", "HIV, TB or cancer as the cause of weight loss"], "A2-37", "DM-CLS-T1", lane="classify", ageBands=ADULT,
      notes="WHO lists 'clinical suspicion of type 1 diabetes in newly diagnosed patient' for same-day referral. The classic fatal error is the thin young adult labelled type 2, sent home on tablets and back in ketoacidosis. "
            "The count of two is this pack's (D-DM-10). The rule writes no type.",
      proposal={"kind": "test.order", "test": "test.ketones_urine", "tier": "now", "then": "refer the same day if type 1 is suspected"})
last("rules", "F17")["x"]["runWhenOverride"] = "newly_met"
drule("DM-ACU-ROUTE-08", "Glucose 15 mmol/L or more with thirst, polyuria or weight loss: test urine ketones today", "dka",
      crit("acu_glu15_sympt", "Fasting plasma glucose, or any meter reading, 15 mmol/L or more, with thirst, passing a lot of urine or unexplained weight loss",
           any=SYM(), atLeast=(1, [P("fasting_pg", ">=", ref="REF-DM-ACU-FPG-SEVERE-SYMPT"), P("capillary_glucose", ">=", ref="REF-DM-ACU-FPG-SEVERE-SYMPT")]), ref_id="REF-DM-ACU-FPG-SEVERE-SYMPT"),
      "low", "same_day", ["urine_ketones", "bohb"], ["Uncomplicated severe hyperglycaemia"], "A2-22", "DM-ACU-ROUTE", lane="acute_route", ageBands=ADULT,
      notes="WHO HEARTS-D's severe stratum is a FASTING plasma glucose of 15 or more with symptoms. Extending it to any meter reading is this pack's widening, on the safe side, for sites with no laboratory.",
      proposal={"kind": "test.order", "test": "test.ketones_urine", "tier": "today"})
last("rules", "F17")["x"]["notWhen"] = [crit("acu_glu15_over18", "Glucose 18 mmol/L or more (rule 01 already asks for ketones)", any=GLU("REF-DM-ACU-KETONE-TEST-GLU"), ref_id="REF-DM-ACU-KETONE-TEST-GLU")]
_c = tag(item("classifications", "type_1"), "F18")
_held = [k for k in _c["supportedBy"] if k["id"] == "t1_cpeptide_low"] + list(_c.get("refutedBy", []))
_c["supportedBy"] = [k for k in _c["supportedBy"] if k["id"] != "t1_cpeptide_low"]
_c.pop("refutedBy", None)
_c["discriminators"] = ["islet_autoantibodies"]
_c["x"]["heldOut"] = {"why": "Both C-peptide criteria are held out of the live rules. The thresholds' meanings sit inside a flowchart image nobody on this project has read (Holt 2021 Fig. 1; ADA 2026 Fig. 2.1), and the source's timing conditions "
                             "(on insulin, more than 3 years from diagnosis, not within 2 weeks of a hyperglycaemic emergency) were not in the predicates. After ketoacidosis glucose toxicity suppresses C-peptide in ketosis-prone type 2; early type 1 can exceed 600.",
                      "restoreWhen": "A person has read the figure, the CSO has signed REF-DM-CLS-CPEP-LOW and REF-DM-CLS-CPEP-HIGH, and both criteria carry years_since_diagnosis and an 'emergency in the last 2 weeks' input.",
                      "criteria": [{k: ([{kk: vv for kk, vv in p.items() if kk != "_ref"} for p in v] if k in ("all", "any") else v) for k, v in c.items()} for c in _held]}
_c["x"]["note"] = ("A NEGATIVE antibody does not refute type 1: about 65% of young clinically diagnosed type 1 in Cameroon, Uganda and South Africa was antibody negative. "
                   "ADA's statement that a negative result 'does not change the diagnosis' is limited to people diagnosed under 35 with no features of type 2 or monogenic diabetes.")
_r = tag(item("rules", "DM-CLS-DRUG-01"), "F27")
_r["display"] = "A raised glucose in a person on steroids with no diabetes on record: consider medicine-associated hyperglycaemia"
_r["x"]["runWhenOverride"] = "not_established"
_r["x"]["proposal"] = {"kind": "flag", "flag": "drug_associated", "note": "A flag for the clinician; the engine does not relabel."}
condition("steroid_worsened_control", "Diabetes control worsened by steroids", "A10-39")
drule("DM-STR-STEROID-01", "Known diabetes and on steroids: expect glucose to rise; monitor after meals", "steroid_worsened_control",
      crit("str_steroid", "Known diabetes, on recurrent or long-term systemic steroids", all=[KNOWN(), P("on_glucocorticoid")], ref_id="REF-DM-SUS-STEROID"),
      "moderate", "routine", ["postprandial_pg", "capillary_glucose"], ["Infection (also raises glucose and is commoner on steroids)"], "A10-39", "DM-STR-CTRL", lane="stratify",
      notes="The commonest steroid patient with a high glucose is a known diabetic whose control has worsened. The diabetes is not relabelled.",
      proposal={"kind": "monitoring.propose", "what": "glucose_after_meals"})
last("rules", "F27")
_s = tag(item("management", "DM-ACT-RX-04"), "F19")
_s["display"] = "Type 2 diabetes, not on insulin, with HbA1c above 10% or glucose 16.7 mmol/L or more: ADA says consider insulin. Check ketones first"
_s["when"] = crit("rx_severe", "Type 2 or unclassified diabetes, not on insulin, with HbA1c above 10% or any glucose 16.7 mmol/L or more",
                  all=[KNOWN(), P("dm_type_recorded", "in", ["type_2", "unclassified"]), NOTGLT("insulin")], any=[P("hba1c", ">", ref="REF-DM-CTRL-SEVERE-HBA1C")] + GLU("REF-DM-CTRL-SEVERE-GLU"), ref_id="REF-DM-CTRL-SEVERE-GLU")
_s["x"]["notWhen"] = [crit("rx_severe_unwell", "Vomiting, abdominal pain, deep breathing, dehydration or drowsiness (the acute pathway owns this patient)", any=UNWELL(), ref_id="REF-DM-ACU-REFER-ALL")]
_s["x"]["note"] = "ADA recommendation 9.20, for adults with type 2 diabetes. Never shown to a person already on insulin or recorded as type 1. WHO HEARTS-D's severe stratum is fasting glucose 15 or more with symptoms, or above 18: test ketones and refer."
drule("DM-CLS-WTLOSS-01", "Unexplained weight loss in a person with diabetes: check glucose and ketones, and look for TB, HIV and cancer", "insulin_deficient_diabetes",
      crit("cls_weight_loss", "Known diabetes with unexplained weight loss", all=[KNOWN(), P("unexplained_weight_loss")], claim_id="A10-49"),
      "moderate", "same_day", ["capillary_glucose", "urine_ketones", "hba1c"], ["Tuberculosis", "HIV", "Malignancy", "Thyrotoxicosis", "Malabsorption or pancreatic disease", "Not enough food"], "A10-49", "DM-CLS-T1", lane="classify",
      notes="Weight loss in a person with diabetes in Uganda is as often TB, HIV or cancer as insulin deficiency. This rule proposes tests and a review; it never proposes insulin on weight loss alone.",
      proposal={"kind": "test.order", "test": ["test.glucose_capillary", "test.ketones_urine"], "tier": "today"})
last("rules", "F19")
_r = tag(item("rules", "DM-CLS-PANC-01"), "F35")
_r["when"] = crit("cls_panc", "Any of: past acute or chronic pancreatitis, pancreatic calcification on imaging", any=[P("pancreatitis_history", "in", ["acute", "chronic"]), P("pancreatic_calcification")], ref_id="REF-DM-CLS-PANC")
drule("DM-CLS-PANC-02", "Fatty stools with recurrent upper abdominal pain in a person with diabetes: consider a pancreatic cause", "pancreatogenic_diabetes",
      crit("cls_panc_symptoms", "Pale, fatty stools together with recurrent upper abdominal pain", all=[P("steatorrhoea"), P("recurrent_abdominal_pain")], ref_id="REF-DM-CLS-FCPD"),
      "low", "routine", ["pancreatic_calcification"], ["Loose stools from metformin", "Coeliac disease", "Chronic infection"], "A10-43", "DM-CLS-PANC", lane="classify",
      proposal={"kind": "test.order", "test": "pancreas_imaging"})
last("rules", "F35")

# ═══ F20, F21, F36, F40  the WHO ladder ═════════════════════════════════════
_s = tag(item("management", "DM-ACT-RX-01"), "F20", "F36", "F16")
_s["when"] = crit("rx_first", "Type 2 diabetes recorded, on no glucose-lowering medicine, with HbA1c 7.0% or more or fasting plasma glucose above 7.0 mmol/L",
                  all=[KNOWN(), T2(), GLT("none")], any=[P("hba1c", ">=", ref="REF-DM-CTRL-HBA1C-TARGET"), P("fasting_pg", ">", ref="REF-DM-CTRL-FPG-SURROGATE")], ref_id="REF-DM-RX-LADDER-WHO")
_s["contraindications"] = [c for c in _s["contraindications"] if c["id"] != "contra_ketosis"] + [crit("contra_ketosis", "Ketones now: urine ketones 2+ or more", all=[KET2()], ref_id="REF-DM-CLS-T1-SAMEDAY")]
RELAXED_OK = lambda cid: crit(cid, "A relaxed target has been agreed and HbA1c is below 8.0%", all=[P("glycaemic_target_tier", "==", "relaxed"), P("hba1c", "<", ref="REF-DM-CTRL-HBA1C-RELAXED")], ref_id="REF-DM-CTRL-HBA1C-RELAXED")
_s["x"]["notWhen"] = [RELAXED_OK("rx_first_relaxed")]
EGFR_GAP = [{"feature": "egfr", "say": f"Kidney function is not known. Metformin is contraindicated below an eGFR of {val('REF-DM-RX-METFORMIN-STOP-EGFR')}: check creatinine first, or record why it cannot be done here.", "ref": "REF-DM-RX-METFORMIN-STOP-EGFR"}]
_s["x"]["needsBeforeActing"] = EGFR_GAP
_s["x"]["note"] += " WHO's own documents disagree on timing: the HEARTS-D text and Fig. 1 start metformin when diet and activity have not achieved control; Fig. 2 (the WHO PEN protocol) starts it at diagnosis alongside them (D-DM-34). A past ketosis no longer blocks this step; ketones now do."
step("DM-ACT-RX-01B", "Type 2 diabetes above target on a fasting meter reading and not on medicine: WHO's first medicine is metformin, with diet and activity",
     crit("rx_first_meter", "Type 2 diabetes recorded, on no glucose-lowering medicine, with a fasting capillary glucose above 7.0 mmol/L",
          all=[KNOWN(), T2(), GLT("none"), P("capillary_glucose_context", "==", "fasting"), P("capillary_glucose", ">", ref="REF-DM-CTRL-FPG-SURROGATE")], ref_id="REF-DM-RX-LADDER-WHO"),
     "A2-24", "therapy_review", "DM-ACT-THERAPY", prescribing=True, proposal={"kind": "therapy.review"}, standardSet="who_hearts_d_2020",
     contraindications=[crit("contra_egfr30_b", "eGFR below 30", all=[P("egfr", "<", ref="REF-DM-RX-METFORMIN-STOP-EGFR")], ref_id="REF-DM-RX-METFORMIN-STOP-EGFR"),
                        crit("contra_ketosis_b", "Ketones now: urine ketones 2+ or more", all=[KET2()], ref_id="REF-DM-CLS-T1-SAMEDAY")],
     level="Metformin: primary care (EMHSLU 2023, via a secondary source)", district="This IS the district pathway: the health centre that can diagnose on a meter can also see that the patient is above target.",
     note="WHO states the fasting surrogate for plasma glucose; acting on a meter value is this pack's step for sites with no laboratory (D-DM-04).")
last("management", "F21")["x"]["needsBeforeActing"] = EGFR_GAP
_s = tag(item("management", "DM-ACT-RX-02"), "F20", "F40")
_s["display"] = "On metformin alone and above target despite taking it: WHO's next step is to add a sulfonylurea (WHO prefers gliclazide; check what this level of care stocks)"
_s["x"]["cautions"] = [crit("caution_su_hypo", "Any of: aged 75 or over; frailty; not always enough food; skipped meals or heavy physical work; cognitive impairment; a significant low in the last year; eGFR below 30",
    any=[P("age_years", ">=", ref="REF-DM-HYPO-RISK-AGE"), P("frailty_or_limited_life_expectancy"), P("food_insecurity"), P("meals_irregular"), P("cognitive_impairment"),
         P("hypo_worst_12m", "in", HYPO_SIG), P("egfr", "<", ref="REF-DM-KID-GFR-G4")], ref_id="REF-DM-RX-GLIB-AGE")]
_s["x"]["cautionText"] = "A sulfonylurea is the step that creates hypoglycaemia risk. WHO: not glibenclamide where hypoglycaemia is a concern. ADA: start a sulfonylurea conservatively in kidney disease. Show this beside the proposal."
_s["x"]["notWhen"] = [RELAXED_OK("rx_second_relaxed")]
_s["x"]["note"] = "Glibenclamide is not recommended at 60 or over and was deleted from EMHSLU 2023; a secondary source places glimepiride at primary care and gliclazide at tertiary level (not read in the list itself: D-DM-22). On a multi-select '!=' must read as 'not selected': confirm in Phase 0."
item("therapyFlags", "glibenclamide_age_60")["action"] = "WHO does not recommend glibenclamide at 60 or over, or where hypoglycaemia is a concern. WHO prefers gliclazide; check what this level of care stocks."
tag(item("management", "DM-ACT-RX-03"), "V1")["x"]["note"] += " A HEARTS-D Fig. 2 footnote also allows those three classes before insulin 'if they are more affordable than insulin'."
step("DM-ACT-TEST-ACR-01", "Protein on the urine strip: abnormal, pending confirmation. Send a laboratory ratio",
     crit("strip_positive", "Confirmed diabetes with urine protein 1+ or more on a strip", all=[KNOWN(), P("urine_protein_strip", "in", ["1plus", "2plus", "3plus"])], ref_id="REF-DM-KID-DIPSTICK"),
     "A2-35", "test", "DM-ACT-SCREEN", proposal={"kind": "test.order", "test": ["test.uacr", "test.creatinine"]},
     district="No laboratory ratio here: refer the sample or the patient. A NEGATIVE strip does not exclude early kidney disease; a positive strip is never a confirmed albuminuria category.",
     note="Whether 'trace' counts depends on the strip map, which could not be read (REF-DM-KID-STRIP-MAP); 1+ or more is used until the CSO decides.")
last("management", "F21")

# ═══ F22  kidney: progression is not 'another disease' ══════════════════════
_r = tag(item("rules", "DM-STR-CKD-01"), "F22")
_r["display"] = "A nephrotic picture, red cell casts or rapidly rising albumin: this may not be diabetic kidney disease. Refer"
_r["urgency"] = "urgent"
_r["when"] = crit("ckd_ndkd", "Any of: a nephrotic picture, red cell casts on microscopy, rapidly rising albumin", any=[P("non_diabetic_kidney_clue"), P("nephrotic_or_active_sediment")], ref_id="REF-DM-KID-NDKD")
step("DM-ACT-REFER-EGFR-03", "A sustained fall in eGFR of more than 20% (more than 30% just after starting an ACE inhibitor, ARB or SGLT2 inhibitor): refer to kidney care",
     crit("ref_egfr_fall", "A sustained fall in eGFR of more than 20%, and either no ACE inhibitor, ARB or SGLT2 inhibitor started or increased since the baseline, or a fall of more than 30%",
          all=[P("egfr_fall_percent", ">", ref="REF-DM-KID-REFER-FALL")], atLeast=(1, [P("ras_or_sglt2_started_recently", "absent"), P("egfr_fall_percent", ">", ref="REF-DM-KID-REFER-FALL-HAEMO")]), ref_id="REF-DM-KID-REFER-FALL"),
     "A6-47", "refer", "DM-ACT-REFER", proposal={"kind": "refer", "to": "kidney_care"}, standardSet="kdigo_2024",
     note="KDIGO's referral criterion for progression: ordinary diabetic kidney disease does this over years. 'Sustained' means confirmed on a repeat. The expected dip after starting those medicines is tolerated up to 30%, in line with the creatinine-rise flag.")
last("management", "F22")
_s = tag(item("management", "DM-ACT-REFER-EGFR-01"), "F33")
_s["display"] = "eGFR below 30, or passing no urine: refer today"
_s["when"] = crit("ref_egfr30", "eGFR below 30, or passing no urine", any=[P("egfr", "<", ref="REF-DM-KID-REFER-EGFR"), P("anuria")], ref_id="REF-DM-KID-REFER-EGFR")

# ═══ F23, F37, F39  therapy flags ═══════════════════════════════════════════
_f = tag(item("therapyFlags", "metformin_during_acute_illness"), "F23")
_f["display"] = "Metformin during acute illness"
_f["action"] = "ADA: consider holding metformin when the person cannot eat and drink or acute kidney injury is a concern. Ask about intake. KDIGO notes the evidence for sick-day lists is weak."
therapy_flag("sglt2_during_acute_illness", "SGLT2 inhibitor during acute illness", "red",
    crit("tf_sglt2_sick", "On an SGLT2 inhibitor, acutely unwell", all=[GLT("sglt2_inhibitor"), P("acute_illness_current")], ref_id="REF-DM-RX-SICKDAY-HOLD"),
    "ADA: consider holding the SGLT2 inhibitor when the person cannot eat and drink or acute kidney injury is a concern. This is the medicine that causes ketoacidosis with a near-normal glucose: check ketones. Review today with the prescriber.", "A4-64")
last("therapyFlags", "F23")
therapy_flag("other_glucose_lowering_in_pregnancy", "A glucose-lowering medicine other than metformin or insulin in pregnancy", "red",
    crit("tf_preg_glt", "Pregnant, on a sulfonylurea, an SGLT2 inhibitor, a GLP-1 receptor agonist, a DPP-4 inhibitor or pioglitazone", all=[P("pregnant")],
         any=SU() + [GLT("sglt2_inhibitor"), GLT("glp1_ra"), GLT("dpp4_inhibitor"), GLT("pioglitazone")], ref_id="REF-DM-RX-PREG"),
    "WHO 2025: in pregnancy, medicines with safety concerns are replaced by insulin and/or metformin, under specialist care. Review today with the prescriber and the antenatal team.", "A10-08")
last("therapyFlags", "F23")
_f = tag(item("therapyFlags", "ras_blocker_or_statin_in_pregnancy"), "V4")
_f["action"] = "ADA: ACE inhibitors and ARBs are contraindicated in pregnancy; lipid-lowering medicines are, in most circumstances, stopped before conception. Review today with the prescriber and the antenatal team."
_f = tag(item("therapyFlags", "ras_blocker_creatinine_rise"), "F37")
_f["action"] = "Look for acute kidney injury: volume depletion, NSAIDs, diuretics, renal artery stenosis. KDIGO: correct these before any change to the ACE inhibitor or ARB. Review with the prescriber."
_f = tag(item("therapyFlags", "ras_blocker_potassium_high"), "F29", "F37")
_f["display"] = "Potassium above 5.5 and below 6.0 on an ACE inhibitor or ARB"
_f["when"] = crit("tf_k", "On an ACE inhibitor or ARB, potassium above 5.5 and below 6.0 mmol/L",
                  all=[P("ras_blocker", "in", ["acei", "arb", "both"]), P("potassium", ">", ref="REF-DM-KID-K-ACTION"), P("potassium", "<", ref="REF-DM-KID-K-MODERATE")], ref_id="REF-DM-KID-K-ACTION")
_f["action"] = "KDIGO: look for and correct other causes first (NSAIDs, trimethoprim, diet), then treat the potassium, before any change to the ACE inhibitor or ARB. Review with the prescriber. At 6.0 or more a separate rule routes the patient."
_f = tag(item("therapyFlags", "dolutegravir_with_metformin"), "F39", "V8")
_f["action"] = "UCG 2023 HIV chapter: dolutegravir increases metformin levels and may increase the risk of hypoglycaemia and metabolic acidosis. Close follow-up is recommended (electrolytes, urea, creatinine, random blood sugar). Review with the prescriber and the ART clinic."
_f["x"]["note"] = "Read verbatim at verification. Dolutegravir is first line, so this flag will show for most people with HIV and diabetes on metformin: whether it is shown once and acknowledged, or at every visit, is D-DM-33."
_r = tag(item("rules", "DM-SUS-POP-DTG-01"), "F39")
_r["citation"]["needsCsoInput"] = "The Kampala signal was read through a secondary summary (HIV i-Base), not the Lancet HIV letter. Uganda's 2022 HIV guideline algorithm for dolutegravir and glucose could not be read (pp. 186 to 189)."
_r["notes"] = ("Never stop or change ART from this rule: it proposes a glucose test. UCG 2023's HIV chapter, read verbatim, says 'Do RBS to confirm hyperglycaemia then substitute with EFV' and lists 'known diabetics' as a contraindication to dolutegravir; "
               "later WHO and national practice may differ, and the 2022 HIV guideline could not be read. What the engine says after the glucose result is D-DM-33. Restricted class: hiv.")

# ═══ F26, F28, F05  validity ════════════════════════════════════════════════
tag(item("interpretation", "ogtt_1h_idf_2024"), "F26")["x"]["appliesTo"] = {"pregnancy": "not_pregnant"}
item("interpretation", "ogtt_1h_idf_2024")["note"] += " Not read in pregnancy, where WHO's gestational 1-hour threshold applies."
ILL_ALT = "Confirm after recovery, unless symptoms of diabetes came before the illness or ketones are raised. Fever and dehydration also cause thirst, so the symptom rule does not protect here."
TB_ALT = "Reassess glycaemia after the first month of TB treatment; confirm an asymptomatic positive with a repeat test."
for _feat, _pre in (("capillary_glucose", "capillary_glucose"), ("fasting_pg", "fasting_glucose")):
    caveat(f"{_pre}_acute_illness", _feat, "A raised glucose during acute illness may be transitory",
           crit(f"ill_{_pre}", "Acutely unwell now", all=[P("acute_illness_current")], ref_id="REF-DM-SUS-STRESS"), "manufactures", False, "A11-54", ILL_ALT)
    last("validityCaveats", "F28")
    caveat(f"{_pre}_tb_at_diagnosis", _feat, "TB can raise glucose at diagnosis",
           crit(f"tb_{_pre}", "TB newly diagnosed or on treatment", all=[P("tb_current")], ref_id="REF-DM-SUS-TB-RECHECK"), "manufactures", False, "A10-32", TB_ALT)
    last("validityCaveats", "F28")
item("validityCaveats", "glucose_acute_illness")["alternative"] = ILL_ALT
_v = tag(item("validityCaveats", "egfr_not_steady_state"), "F39", "V4")
_v["label"] = "eGFR is unreliable while creatinine is changing"
_v["when"] = crit("unsteady", "Creatinine not in steady state (acute kidney injury or a hyperglycaemic crisis)", all=[P("creatinine_unstable")], ref_id="REF-DM-VAL-EGFR-STEADY")
caveat("egfr_in_pregnancy", "egfr", "Creatinine-based eGFR equations were not developed for pregnancy",
       crit("egfr_preg", "Pregnant", all=[P("pregnant")], ref_id="REF-DM-VAL-EGFR-STEADY",
            needs="No sentence on pregnancy was found in the KDIGO pages read. Kept as a warning that does not block, until the CSO supplies a source or removes it."),
       "unpredictable", False, "A6-65", "Read creatinine itself and the trend, with the antenatal team.")
last("validityCaveats", "F39", "V4")
caveat("fundus_undilated_direct_macula", "macular_oedema", "Direct ophthalmoscopy without dilation cannot exclude macular oedema",
       crit("undilated_macula", "Examined by direct ophthalmoscopy, pupils not dilated", all=[P("fundus_method", "==", "undilated_ophthalmoscopy")], ref_id="REF-DM-VAL-OPHTHALMOSCOPY"), "masks", True, "A7-21",
       "A retinal photograph or a dilated examination by a trained examiner. Until then the eyes count as not screened.", family="DM-STR-EYE")
last("validityCaveats", "F05")
for _vid in ("fundus_undilated_direct", "uacr_transient", "egfr_not_steady_state", "abi_calcified"):
    tag(item("validityCaveats", _vid), "F05")["x"]["blocksBothWays"] = True
for _sid in ("DM-ACT-REFER-ALB-01", "DM-ACT-RX-05B", "DM-ACT-RX-08"):
    tag(item("management", _sid), "F05")["x"]["notWhen"] = [crit(f"hold_{_sid[-6:].lower().replace('-', '_')}_transient", "A transient cause of raised urine albumin is present (fever, infection, exercise, menstruation, very high glucose or blood pressure)",
                                                                  all=[P("uacr_transient_cause")], ref_id="REF-DM-VAL-UACR-TRANSIENT")]
BLOCK_RULE = ("While a blocking caveat is in force on a feature, every diagnostic criterion, complication criterion, stage and classification that reads the feature is 'insufficient', whether the value looks abnormal or normal, "
              "and the examination does not reset its screening interval. Routine steps that rest on the blocked value are held (notWhen). A caveat never suppresses an acute rule or a same-day referral.")

# ═══ F29  potassium 6.0 to 6.4 ══════════════════════════════════════════════
condition("hyperkalaemia_moderate", "Moderate hyperkalaemia", "A6-60")
drule("DM-ACU-ROUTE-16", "Potassium 6.0 to 6.4 mmol/L: repeat within 24 hours; if unwell or kidney function has fallen, assess in hospital", "hyperkalaemia_moderate",
      crit("acu_k_moderate", "Potassium 6.0 to 6.4 mmol/L", all=[P("potassium", ">=", ref="REF-DM-KID-K-MODERATE"), P("potassium", "<", ref="REF-DM-KID-K-SEVERE")], ref_id="REF-DM-KID-K-MODERATE"),
      "moderate", "same_day", ["potassium", "egfr"], ["Haemolysed sample", "Delayed sample"], "A6-60", "DM-ACU-ROUTE", lane="acute_route",
      notes="KDIGO 2024 Table 28, which reproduces UK guidance (Think Kidneys). Route only: no treatment text.",
      proposal={"kind": "acute_signal", "to": "triage", "tier": "today"})
last("rules", "F29")

# ═══ F31  antiplatelet ══════════════════════════════════════════════════════
_s = tag(item("management", "DM-ACT-RX-09"), "F31")
_s["display"] = "Established cardiovascular disease and not on an antiplatelet: it is for secondary prevention. Not after a bleeding stroke or a stroke of unknown type; check bleeding risk"
_s["when"] = crit("rx_antiplatelet", "Confirmed diabetes with established cardiovascular disease, recorded as not on an antiplatelet", all=[KNOWN(), P("cvd_established"), P("on_antiplatelet", "absent")], ref_id="REF-DM-CVD-ANTIPLATELET")
_s["contraindications"] = [crit("contra_antiplatelet_bleed", "A previous stroke that was a bleed, or of unknown type", all=[P("haemorrhagic_or_unknown_stroke")], ref_id="REF-DM-CVD-ANTIPLATELET",
                                needs="WHO HEARTS-D states the indication only. The exclusion after haemorrhagic or untyped stroke is standard practice and has no quoted source in this pack: for CSO signature.")]
_s["x"]["note"] = "WHO does not recommend it for primary prevention in diabetes. Haemorrhagic stroke is a larger share of stroke in sub-Saharan Africa and imaging is often unavailable, so 'stroke' often means type unknown. Silent once the person is recorded as on one."

# ═══ F33  the rest of WHO's same-day list ═══════════════════════════════════
condition("acute_cardiovascular_event", "Possible heart attack or stroke", "A2-37")
drule("DM-ACU-ROUTE-17", "Chest pain, or sudden weakness, speech or facial change: possible heart attack or stroke. Route now", "acute_cardiovascular_event",
      crit("acu_cvd", "Chest pain, or sudden weakness, speech or facial change", all=[P("chest_pain_or_stroke_symptoms")], ref_id="REF-DM-ACT-REFER-SAMEDAY"),
      "moderate", "immediate", ["capillary_glucose", "bp_systolic", "pulse"], ["Hypoglycaemia (check the glucose: a low can mimic a stroke)", "Musculoskeletal chest pain", "Bell's palsy"], "A2-37", "DM-ACU-ROUTE", lane="acute_route",
      notes="WHO HEARTS-D lists symptoms of heart disease or stroke for same-day referral. The general emergency pathway owns the patient; this rule makes sure a diabetes review does not carry on past it.",
      proposal={"kind": "acute_signal", "to": "triage"})
last("rules", "F33")
step("DM-ACT-REFER-BP-03", "Blood pressure above 180/110 with headache, breathlessness, blurred vision, confusion, vomiting or little urine: refer today",
     crit("ref_bp_sympt", "Symptoms with the raised pressure, and systolic above 180 or diastolic above 110 mmHg", all=[P("hypertensive_symptoms")],
          any=[P("bp_systolic", ">", ref="REF-DM-ACU-BP-REFER-SBP-SYMPT"), P("bp_diastolic", ">", ref="REF-DM-ACU-BP-REFER-DBP")], ref_id="REF-DM-ACU-BP-REFER-SBP-SYMPT"),
     "A2-37", "refer", "DM-ACT-REFER", urgency="same_day", proposal={"kind": "refer", "to": "higher_level"},
     note="The second blood-pressure bullet in WHO's same-day list, missing from the research record and found at verification.")
last("management", "F33", "V1")

# ═══ F34  eyes ══════════════════════════════════════════════════════════════
_dr = tag(item("complications", "diabetic_retinopathy"), "F34", "F05")
def _iv(ref_min, stage, ref_max):
    d = interval(ref_min, stage); d["x"]["ifControlledRef"] = ref_max; d["x"]["ifControlledMonths"] = val(ref_max); return d
_dr["screeningIntervals"] = [interval("REF-DM-EYE-INTERVAL-WHO"), interval("REF-DM-EYE-INTERVAL-ADA"), interval("REF-DM-EYE-RECALL-NONE-MILD-MAX", "none"),
    _iv("REF-DM-EYE-RECALL-MILD-MIN", "mild_npdr", "REF-DM-EYE-RECALL-NONE-MILD-MAX"), _iv("REF-DM-EYE-RECALL-MODERATE-MIN", "moderate_npdr", "REF-DM-EYE-RECALL-MODERATE-MAX"),
    interval("REF-DM-EYE-RECALL-SEVERE", "severe_npdr"), interval("REF-DM-EYE-RECALL-PDR", "pdr"), interval("REF-DM-EYE-RECALL-DME-CI", "centre_involving"), interval("REF-DM-EYE-RECALL-DME-NCI", "non_centre")]
_dr["x"]["note"] = ("Type 2: first examination at diagnosis. Type 1: 5 years after onset. With mild or moderate retinopathy the interval is the NEAR end of ICO's range (12 and 6 months); the far end (24 and 12) applies only "
                    "where a clinician has confirmed that control is at target, because ICO's schedule is stated for controlled diabetes and most patients with retinopathy here are above target. "
                    "With no retinopathy the default is WHO's 24 months (D-DM-14). " + BLOCK_RULE)
_s = tag(item("management", "DM-ACT-REFER-EYE-01"), "F34")
_s["display"] = "Severe or proliferative retinopathy, or macular oedema involving the centre: refer to an ophthalmologist urgently"
_s["when"] = crit("ref_eye_grade", "Severe non-proliferative or proliferative retinopathy, or centre-involving macular oedema", any=[P("retinopathy_stage", "in", ["severe_npdr", "pdr"]), P("macular_oedema", "==", "centre_involving")], ref_id="REF-DM-EYE-REFER-ADA")
_s["x"]["note"] = "ICO timing: proliferative or centre-involving oedema within 1 month; severe non-proliferative within 3 months."
step("DM-ACT-REFER-EYE-03", "Moderate retinopathy, or macular oedema not involving the centre: refer to an ophthalmologist (routine)",
     crit("ref_eye_moderate", "Moderate non-proliferative retinopathy, or macular oedema not involving the centre", any=[P("retinopathy_stage", "==", "moderate_npdr"), P("macular_oedema", "==", "non_centre")], ref_id="REF-DM-EYE-REFER-ADA"),
     "A7-16", "refer", "DM-ACT-REFER", proposal={"kind": "refer", "to": "ophthalmology"},
     note="ICO: moderate, re-examine in 6 to 12 months with referral; oedema sparing the centre, re-examine in 3 months (referral where laser is available). ADA refers any macular oedema promptly. Uganda's 2016 Eye Care Guidelines refer everyone with diabetes to a retina clinic.")
last("management", "F34")

# ═══ F35, F38  labels that say what the predicates test ═════════════════════
_s = tag(item("management", "DM-ACT-RX-12"), "F35")
_s["display"] = "Numb, burning or tingling feet with a sign on examination: if it is painful, ADA names the first-line classes; opioids are not among them"
_r = tag(item("rules", "DM-STR-NEURO-03"), "F35")
_r["when"]["label"] = "Known diabetes, with any of: systolic fall above 20 mmHg on standing, diastolic fall above 10 mmHg, pulse above 100 (measured at rest)"
_t = tag(item("targets", "tgt_hba1c_older_healthy"), "F35")
_t["display"] = "HbA1c below 7.5%: an option at 65 or over for a person otherwise in good health (ADA)"
_t = tag(item("targets", "tgt_hba1c_ckd"), "V4")
_t["display"] = "HbA1c individualised between below 6.5% and below 8.0% in CKD not treated with dialysis"
_t["x"]["notWhen"] = [crit("tgt_ckd_dialysis", "On dialysis", all=[P("on_dialysis")], ref_id="REF-DM-CTRL-CKD-HIGH")]
_d = next(d for d in REG["designb_extra"] if d["id"] == "DM-ACT-RECALL-01")
_d["title"] = "Recall: 3 months until at target, 6 months once at target"
_d["params"].pop("after_change", None)
_d["x"]["note"] = (_d["x"].get("note") or "") + " The 1-month review after a treatment change was not established at verification (REF-DM-ACT-REVIEW-AFTER-CHANGE) and is not used."
for _a in REG["complication_amendments"]:
    if _a["kind"] == "staging.dipstick":
        _a["change"]["issue"] = "KDIGO 2012 Table 7 could not be read from any copy. WHO HEARTS-D Table 6 was read: A2 is 'trace/1+', A3 is '1+/2+'."
    if _a["kind"] == "rule.thresholds" or _a["kind"] == "monitoring.grid": tag(_a, "V4")

# ═══ F04  under 16: nothing but recognition and referral ════════════════════
for _kind in ("targets", "riskModels", "therapyFlags"):
    for _it in REG[_kind]: tag(_it, "F04")["x"]["ages"] = "adult"
for _it in REG["interpretation"]:
    if _it["x"]["lane"] == "stratify": tag(_it, "F04")["x"]["ages"] = "adult"
AGE_RULE = ("'adult' means 16 and over. Targets, control and blood-pressure bands, risk models, therapy flags and every management step are withheld under 16. "
            "Phase 0 must confirm where the platform's adolescent band ends: if it runs past 16, people aged 16 to 19 would lose the adult rules.")

# ═══ neutral displays for anything that reads a restricted feature (F10) ════
def apply_neutral():
    for kind in ("rules", "management", "therapyFlags", "validityCaveats", "targets"):
        for it in REG[kind]:
            if it["id"] in NEUTRAL: it["x"]["neutralDisplay"] = NEUTRAL[it["id"]]

# ════════════════════════════════════════════════════════════════════════════
# SECOND REVIEW (review/R3-recheck.json, H01 to H44): an independent re-read of
# the fixes above. It found 7 critical and 14 major problems, several of them
# introduced by those fixes. Everything below answers it.
# ════════════════════════════════════════════════════════════════════════════
SIGNS = lambda: [P("deep_rapid_breathing"), P("acetone_breath"), P("dehydration"), DROWSY()]      # signs that justify an interrupt
MILD = lambda: [P("vomiting"), P("abdominal_pain")]                                                # symptoms that do not, on their own

# ── H01  under 16: referral and red flags stay on ───────────────────────────
PAED_ACTION = "Under 16: refer today to the paediatric or specialist team. Do not change the medicine here."
for _s in REG["management"]:
    if _s["x"]["kind"] == "refer" and _s["id"] not in ("DM-ACT-REFER-BP-02", "DM-ACT-REFER-TARGET-01"):
        tag(_s, "H01")["x"]["agesOverride"] = "any"
for _f in REG["therapyFlags"]:
    if _f["severity"] == "red" or _f["id"] == "hypoglycaemia_needing_help_on_treatment":
        tag(_f, "H01")["x"]["ages"] = "any"; _f["x"]["under16Action"] = PAED_ACTION
AGE_RULE += " Referral steps and red flags stay on under 16; a red flag's action is replaced by 'refer today; do not change the medicine here' (second review, H01)."

# ── H02  referral at the visit where diabetes is found ──────────────────────
for _s in REG["management"]:
    if _s["x"]["kind"] != "refer": continue
    limb_or_sight = _s["id"] in ("DM-ACT-REFER-FOOT-01", "DM-ACT-REFER-FOOT-02", "DM-ACT-REFER-FOOT-03", "DM-ACT-REFER-LIMB-01", "DM-ACT-REFER-VISION-01", "DM-ACT-REFER-CHARCOT-01")
    tag(_s, "H02")["x"]["runWhenOverride"] = "always" if limb_or_sight else "established_or_met"

# ── H03, H27, H28  rules written before the glucose list was widened ────────
_r = tag(item("rules", "DM-ACU-ROUTE-02"), "H03")
_r["when"] = crit("acu_ketones", "Urine ketones 2+ or more, or blood ketones 3.0 mmol/L or more; with any glucose 11.1 mmol/L or more, a meter reading HI, or known diabetes",
                  any=[KET2(), P("bohb", ">=", ref="REF-DM-ACU-DKA-BOHB")], atLeast=(1, [KNOWN(), HI()] + GLU("REF-DM-ACU-DKA-GLU")), ref_id="REF-DM-ACU-DKA-BOHB")
_s = tag(item("management", "DM-ACT-REFER-GLU-01"), "H03", "H27")
_s["when"] = crit("ref_glu18", "Above target despite taking the tablets, with any glucose 18 mmol/L or more or a meter reading HI", all=[P("glucose_goal_unmet_on_oral")], any=GLU("REF-DM-ACU-KETONE-TEST-GLU") + [HI()], ref_id="REF-DM-ACT-REFER-SAMEDAY")
_r = tag(item("rules", "DM-SUS-INCID-01"), "H27")
_r["when"] = crit("sus_incidental", "Glucose 11.1 mmol/L or more on a random plasma sample or any meter reading, or a meter reading HI",
                  any=[P("random_pg", ">=", ref="REF-DM-DX-RANDOM"), P("capillary_glucose", ">=", ref="REF-DM-DX-RANDOM"), HI()], ref_id="REF-DM-DX-RANDOM")
item("diagnosis", "who_hearts_d_2020")["anyOf"].append(crit("who_hd_cap_hi_symptoms", "A meter reading HI (above the meter's range), with thirst, passing a lot of urine or unexplained weight loss",
    all=[HI()], any=SYM(), ref_id="REF-DM-DX-OGTT2H-CAP", needs="A meter's upper limit is above every diagnostic threshold, so HI with symptoms is in the diabetes range. A pack inference, with D-DM-04."))
FEATURES["glucose_meter_extreme"]["x"]["note"] = "The two most dangerous readings are not numbers. HI satisfies the acute rules, the suspicion rule, the same-day referral and the symptomatic criterion; LO satisfies the hypoglycaemia rule. No number is invented for either."
_r = item("rules", "DM-ACU-ROUTE-08")
_r["when"] = crit("acu_glu15_sympt", "Fasting or random plasma glucose, or any meter reading, 15 mmol/L or more, with thirst, passing a lot of urine or unexplained weight loss", any=SYM(),
                  atLeast=(1, [P(f, ">=", ref="REF-DM-ACU-FPG-SEVERE-SYMPT") for f in ("fasting_pg", "random_pg", "capillary_glucose")]), ref_id="REF-DM-ACU-FPG-SEVERE-SYMPT")
tag(_r, "H28", "H20")["x"]["notWhen"].append(crit("acu_glu15_ketones_done", "A ketone result is already recorded", any=KET_REC(), ref_id="REF-DM-ACU-KETONE-TEST-GLU"))

# ── H04, H08  children ──────────────────────────────────────────────────────
drule("DM-SUS-PAED-03", "A child with a glucose above 11 mmol/L, or a meter reading HI: refer today as suspected diabetes, whatever the symptoms", "type_1_diabetes",
      crit("sus_paed_glucose", "A child with any glucose above 11 mmol/L, or a meter reading HI", any=GLU("REF-DM-ACU-PAED-GLU", ">") + [HI()], ref_id="REF-DM-SUS-PAED-SAMEDAY"),
      "high", "same_day", ["urine_ketones", "bohb"], ["A sample taken through a glucose infusion", "Stress hyperglycaemia in a very sick child (still referred)"], "A9-30", "DM-SUS-PAED", ageBands=CHILD,
      notes="NICE: a child or young person with suspected type 1 diabetes is referred the same day. A raised glucose is itself the suspicion; the rule does not wait for thirst or weight loss to be recorded, and it is a referral, not another test. "
            "With vomiting, pain, deep breathing, dehydration or drowsiness rule DM-ACU-ROUTE-04 interrupts.",
      proposal={"kind": "refer", "to": "paediatric_or_diabetes_team", "tier": "today"})
last("rules", "H04")["x"]["runWhenOverride"] = "always"
_r = tag(item("rules", "DM-SUS-PAED-01"), "H04", "H22")
_r["x"]["notWhen"] = [crit("sus_paed_done", "A glucose is already recorded", any=GLU_REC(), ref_id="REF-DM-SUS-PAED-4T")]
_r["x"]["proposal"] = {"kind": "test.order", "test": "glucose_capillary", "tier": "now"}
_r = tag(item("rules", "DM-ACU-ROUTE-04"), "H08")
_r["when"] = crit("acu_paed", "Any of vomiting, abdominal pain, deep rapid breathing, dehydration, drowsiness or worse; with at least one of: thirst, passing a lot of urine, weight loss, new bed-wetting, any glucose above 11 mmol/L, a meter reading HI, known diabetes",
    any=[P("vomiting"), P("abdominal_pain"), P("deep_rapid_breathing"), P("dehydration"), DROWSY()],
    atLeast=(1, [P("polyuria"), P("polydipsia"), P("unexplained_weight_loss"), P("secondary_enuresis"), HI(), KNOWN()] + GLU("REF-DM-ACU-PAED-GLU", ">")), claim_id="A9-31")
_r["notes"] += " Ketones alone do not fire this rule: a vomiting child who has not eaten has ketones without diabetes. Ketones with no glucose on record fire rule 18, which asks for the glucose."
_r = tag(item("rules", "DM-ACU-ROUTE-15"), "H08")
_r["display"] = "A child who is breathing deeply or drowsy: capillary glucose now"
_r["when"] = crit("acu_paed_glucose", "A child with deep rapid breathing, or drowsiness or worse", any=[P("deep_rapid_breathing"), DROWSY()], ref_id="REF-DM-SUS-PAED-MIMIC")
_r["x"]["notWhen"] = [crit("acu_paed_glucose_done", "A glucose is already recorded", any=GLU_REC(), ref_id="REF-DM-SUS-PAED-MIMIC")]
drule("DM-ACU-ROUTE-18", "A child who is dehydrated, or has ketones in the urine, with no glucose on record: capillary glucose today", "dka",
      crit("acu_paed_glucose_soft", "A child with dehydration, urine ketones 2+ or more, or blood ketones 3.0 mmol/L or more", any=[P("dehydration"), KET2(), P("bohb", ">=", ref="REF-DM-ACU-DKA-BOHB")], ref_id="REF-DM-SUS-PAED-MIMIC"),
      "low", "same_day", ["capillary_glucose"], ["Gastroenteritis", "Starvation ketosis (a child who has not eaten)", "Malaria"], "A9-32", "DM-ACU-ROUTE", lane="acute_route", ageBands=CHILD,
      notes="Dehydration from diarrhoea and ketones from not eating are everyday findings, so this is a same-day test and not an interrupt. It clears when a glucose is recorded.",
      proposal={"kind": "test.order", "test": "test.glucose_capillary", "tier": "today"})
last("rules", "H08")["x"]["notWhen"] = [crit("acu_paed_soft_done", "A glucose is already recorded", any=GLU_REC(), ref_id="REF-DM-SUS-PAED-MIMIC")]

# ── H07, H20  one interrupt per event; interrupts only on signs ─────────────
_r = tag(item("rules", "DM-ACU-ROUTE-11"), "H07")
_r["display"] = "Raised glucose with deep breathing, acetone on the breath, dehydration or drowsiness: suspected ketoacidosis or hyperosmolar state. Route now; do not wait for ketones"
_r["when"] = crit("acu_picture", "Any glucose 11.1 mmol/L or more (or a meter reading HI), with any of: deep rapid breathing, acetone on the breath, dehydration, drowsiness or worse",
                  any=SIGNS(), atLeast=(1, GLU("REF-DM-ACU-DKA-GLU") + [HI()]), ref_id="REF-DM-ACU-REFER-ALL")
_r["x"]["notWhen"] = [crit("acu_picture_hhs", "Glucose 33.3 mmol/L or more or a meter reading HI (rule 14 interrupts for this patient)", any=GLU("REF-DM-ACU-HHS-GLU") + [HI()], ref_id="REF-DM-ACU-HHS-GLU")]
_r["notes"] += " Vomiting or abdominal pain alone with a raised glucose is rule 19: same day, not an interrupt, because both are everyday findings."
drule("DM-ACU-ROUTE-19", "Raised glucose with vomiting or abdominal pain: test ketones today. A second sign or ketones of 2+ makes it an emergency", "hyperglycaemic_crisis",
      crit("acu_picture_mild", "Any glucose 11.1 mmol/L or more (or a meter reading HI), with vomiting or abdominal pain", any=MILD(), atLeast=(1, GLU("REF-DM-ACU-DKA-GLU") + [HI()]), ref_id="REF-DM-ACU-REFER-ALL"),
      "moderate", "same_day", ["urine_ketones", "bohb"], ["Gastroenteritis", "Peptic ulcer disease", "Malaria", "Metformin side effects"], "A2-40", "DM-ACU-ROUTE", lane="acute_route", ageBands=ADULT,
      notes="Glucose above 11.1 and abdominal pain are both common in a diabetes clinic. The rule asks for the one test that separates them and clears when it is done. No strip here and the patient looks unwell: refer.",
      proposal={"kind": "test.order", "test": "test.ketones_urine", "tier": "today"})
last("rules", "H07")["x"]["notWhen"] = [crit("acu_mild_signs", "Deep breathing, acetone on the breath, dehydration or drowsiness (rule 11 or 14 interrupts)", any=SIGNS(), ref_id="REF-DM-ACU-REFER-ALL"),
                                        crit("acu_mild_ketones_done", "A ketone result is already recorded", any=KET_REC(), ref_id="REF-DM-ACU-KETONE-TEST-GLU")]
_r = tag(item("rules", "DM-ACU-ROUTE-13"), "H07", "H18")
_r["display"] = "Diabetes (or on insulin or a sulfonylurea) and vomiting, abdominal pain, deep breathing or dehydration, with no glucose on record: capillary glucose today, and ketones if it is raised"
_r["urgency"] = "same_day"
_r["when"] = crit("acu_known_unwell", "Known diabetes, or on insulin or a sulfonylurea; with any of: vomiting, abdominal pain, deep rapid breathing, acetone on the breath, dehydration",
                  any=MILD() + [P("deep_rapid_breathing"), P("acetone_breath"), P("dehydration")], atLeast=(1, [KNOWN()] + ISU()), ref_id="REF-DM-RX-SICKDAY-HOLD",
                  needs="A pack rule built from ADA's intercurrent-illness guidance (monitor glucose more often) and WHO's 'refer all suspected' rule. No source states it in these words: for CSO signature (D-DM-37).")
_r["x"]["notWhen"] = [crit("acu_known_unwell_done", "A glucose is already recorded (the other rules then read it)", any=GLU_REC(), ref_id="REF-DM-RX-SICKDAY-HOLD")]
_r["x"]["proposal"] = {"kind": "test.order", "test": ["test.glucose_capillary"], "tier": "today"}
_r["notes"] = "Clears as soon as a glucose is recorded. On an SGLT2 inhibitor ketoacidosis can occur with a normal glucose (rule 03)."
drule("DM-ACU-ROUTE-20", "Drowsy or unresponsive with diabetes, or on insulin or a sulfonylurea, and no glucose on record: capillary glucose now", "hypoglycaemia",
      crit("acu_drowsy_glucose", "Drowsiness or worse, in a person with known diabetes or on insulin or a sulfonylurea", all=[DROWSY()], atLeast=(1, [KNOWN()] + ISU()), ref_id="REF-DM-HYPO-L3"),
      "high", "immediate", ["capillary_glucose"], ["Stroke", "Sepsis", "Head injury", "Alcohol", "Hyperosmolar state or ketoacidosis"], "A4-14", "DM-ACU-ROUTE", lane="acute_route",
      notes="The one bedside test that cannot wait: this picture is a low glucose until a reading says otherwise. It does not need 'known diabetes' to be recorded if the medicine list shows insulin or a sulfonylurea. Clears when a glucose is recorded.",
      proposal={"kind": "test.order", "test": "test.glucose_capillary", "tier": "now"})
last("rules", "H07", "H18")["x"]["notWhen"] = [crit("acu_drowsy_done", "A glucose is already recorded", any=GLU_REC(), ref_id="REF-DM-HYPO-L3")]
_r = tag(item("rules", "DM-ACU-ROUTE-01"), "H20")
_r["x"]["notWhen"] = [crit("acu_glu18_done", "A ketone result is already recorded", any=KET_REC(), ref_id="REF-DM-ACU-KETONE-TEST-GLU")]
tag(item("rules", "DM-ACU-ROUTE-03"), "H07")["x"]["notWhen"] = [crit("acu_edka_done", "A ketone result is already recorded (rule 02 reads it)", any=KET_REC(), ref_id="REF-DM-ACU-EDKA")]
_r = tag(item("rules", "DM-ACU-ROUTE-09"), "H18", "H22")
_r["display"] = "Type 1 diabetes and no insulin on the medicine list: confirm they are taking it. If not, check glucose and ketones today and find out why"
_r["when"] = crit("acu_t1_no_insulin", "Type 1 diabetes recorded", all=[P("dm_type_recorded", "==", "type_1")], ref_id="REF-DM-RX-INSULIN-T1")
_r["x"]["notWhen"] = [crit("acu_t1_on_insulin", "Insulin is among the current medicines", all=[GLT("insulin")], ref_id="REF-DM-RX-INSULIN-T1")]
_r["x"]["proposal"] = {"kind": "test.order", "test": ["test.glucose_capillary", "test.ketones_urine"], "tier": "today"}
_r["notes"] = "Fires when the medicine list is blank as well as when it shows no insulin: a blank list is not evidence that the person is on insulin. Becomes an interrupt through rules 02 and 11 once ketones or the clinical picture are present."
item("rules", "DM-ACU-ROUTE-10")["display"] = "Insulin stopped, missed or run out: check glucose and ketones today"
item("rules", "DM-ACU-ROUTE-10")["x"]["proposal"]["tier"] = "today"
_r = tag(item("rules", "DM-ACU-ROUTE-07"), "H18")
_r["display"] = "Glucose below 3.9 mmol/L in a person with diabetes, or on insulin or a sulfonylurea: hypoglycaemia, and it can come back"
_r["when"] = crit("acu_hypo_l1", "Any glucose below 3.9 mmol/L in a person on insulin or a sulfonylurea, with type 1 diabetes, or with known diabetes", any=GLU("REF-DM-HYPO-L1", "<"),
                  atLeast=(1, ISU() + [P("dm_type_recorded", "==", "type_1"), KNOWN()]), ref_id="REF-DM-HYPO-L1")

# ── H05, H17, H43  validity: direction matters, and a blocked value is not banded ─
BLOCK_RULE = ("A blocking caveat acts by its direction. 'Masks' (undilated ophthalmoscopy, a calcified ankle-brachial index): a normal result is not trusted, an abnormal one stands. "
              "'Manufactures' (fever or exercise before a urine albumin): an abnormal result is not trusted. 'Unpredictable': neither. In a diagnostic criteria set any blocking caveat also stops a positive, as the live catalog does. "
              "A value under a blocking caveat is never shown in a control band, is never the measure of a proposed target, and is not read by a treatment-review step. A caveat never suppresses an acute rule or a referral. "
              "The examination does not reset its screening interval.")
for _vid in ("fundus_undilated_direct", "fundus_undilated_direct_macula", "uacr_transient", "egfr_not_steady_state", "abi_calcified"):
    item("validityCaveats", _vid)["x"].pop("blocksBothWays", None)
_dr["x"]["note"] = _dr["x"]["note"].rsplit("While a blocking caveat", 1)[0] + BLOCK_RULE
_dr["x"]["notMetRequires"] = crit("dr_adequate", "The retina was seen adequately through dilated pupils, on a photograph or at the slit lamp",
                                  all=[P("retina_view", "==", "adequate"), P("fundus_method", "in", ["photograph", "dilated_ophthalmoscopy", "slit_lamp"])], ref_id="REF-DM-EYE-METHOD")
tag(_dr, "H17", "H43")
caveat("uacr_count_transient", "uacr_abnormal_count", "A count of abnormal urine albumin results taken during fever, infection, exercise or menstruation does not confirm albuminuria",
       crit("transient_count", "A transient cause is present", all=[P("uacr_transient_cause")], ref_id="REF-DM-VAL-UACR-TRANSIENT"), "manufactures", True, "A6-13",
       "Repeat when it has resolved; albuminuria needs 2 of 3 abnormal specimens within 3 to 6 months.")
last("validityCaveats", "H29")
for _sid in ("DM-ACT-RX-05B", "DM-ACT-RX-08"):
    item("management", _sid)["x"].pop("notWhen", None)       # the caveat on the count now holds the albumin arm only (H29)
tag(item("management", "DM-ACT-REFER-ALB-02"), "H29")["x"]["notWhen"] = [crit("hold_acr70_transient", "A transient cause of raised urine albumin is present (KDIGO asks for a consistent finding)", all=[P("uacr_transient_cause")], ref_id="REF-DM-VAL-UACR-TRANSIENT")]
caveat("hba1c_red_cell_turnover", "hba1c", "Haemolysis, recent malaria or a transfusion in the last 3 months make HbA1c unreliable",
       crit("rbc_turnover", "Haemolysis, current or recent malaria, or a transfusion in the last 3 months", any=[P("haemolysis"), P("malaria_current"), P("recent_transfusion")], ref_id="REF-DM-VAL-HBA1C-RBC"),
       "unpredictable", True, "A11-26", "Use fasting or 2-hour plasma glucose criteria instead of HbA1c.", status="reconcile")
last("validityCaveats", "H09")["x"]["note"] = "The live catalog almost certainly carries these three already (the features were seen in the briefing). Reconcile, do not duplicate."
_s = tag(item("management", "DM-ACT-SCREEN-EYE-01"), "H17")
_s["display"] = "Retinal examination is due (never done, 2 years since the last, or the last look could not grade the retina)"
_s["when"] = crit("due_eye", "Confirmed diabetes, with no retinal examination ever, 24 months or more since the last, or a last examination that was undilated direct ophthalmoscopy or gave an inadequate view", all=[KNOWN()],
                  any=[P("never_eye_screen"), P("months_since_eye_screen", ">=", ref="REF-DM-EYE-INTERVAL-WHO"), P("fundus_method", "==", "undilated_ophthalmoscopy"), P("retina_view", "==", "inadequate")], ref_id="REF-DM-EYE-INTERVAL-WHO")

# ── H06  no non-pregnant band in pregnancy ──────────────────────────────────
for _t in REG["interpretation"]:
    if _t["x"]["lane"] == "stratify":
        tag(_t, "H06")["x"]["appliesTo"] = {"pregnancy": "not_pregnant"}
        _t["note"] = (_t.get("note") or "") + " Not shown in pregnancy: targets there are set by the specialist antenatal team and are tighter. A low value still fires the hypoglycaemia rules."
for _tid in ("hba1c_control_general", "hba1c_control_relaxed", "hba1c_control_tight"):
    _t = tag(item("interpretation", _tid), "H13")
    _t["bands"][0]["display"] = "Not above the upper limit"; _t["toneLabels"] = {"normal": "Not above the upper limit", "intermediate": "Above target"}
    _t["note"] = (_t.get("note") or "") + " The table has no lower edge: 'not above the upper limit' is not 'safe'. In a frail person on insulin or a sulfonylurea a low HbA1c is itself a warning (DM-ACT-RX-11, -11B)."
for _tid in ("bp_systolic_who_hearts_d", "bp_diastolic_who_hearts_d"):
    _t = item("interpretation", _tid); _t["bands"][0]["display"] = "Below the treatment threshold"; _t["toneLabels"] = {"normal": "Below the treatment threshold", "intermediate": "Above target"}

# ── H09  remission: the record must not contradict it ───────────────────────
_cs = tag(item("diagnosis_pending", "consensus_2021_remission"), "H09")
_cs["anyOf"] = [crit("remission_hba1c", "Type 2 diabetes recorded, on no glucose-lowering medicine, HbA1c below 6.5%, off all glucose-lowering medicines for 3 months or more",
    all=[KNOWN(), T2(), GLT("none"), P("hba1c", "<", ref="REF-DM-CLS-REMISSION-HBA1C"), P("months_off_glucose_lowering", ">=", ref="REF-DM-CLS-REMISSION-MONTHS")], ref_id="REF-DM-CLS-REMISSION-HBA1C")]
_cs["x"]["notWhen"] = [
    crit("remission_glucose_high", "A glucose in the diabetes range now: fasting plasma 7.0 mmol/L or more, or any other reading 11.1 or more",
         any=[P("fasting_pg", ">=", ref="REF-DM-DX-FPG")] + [P(f, ">=", ref="REF-DM-DX-RANDOM") for f in ("capillary_glucose", "random_pg", "postprandial_pg", "ogtt_2h_pg")], ref_id="REF-DM-CLS-REMISSION-HBA1C"),
    crit("remission_fasting_meter_high", "A fasting meter reading of 7.0 mmol/L or more", all=[P("capillary_glucose_context", "==", "fasting"), P("capillary_glucose", ">=", ref="REF-DM-DX-FPG")], ref_id="REF-DM-CLS-REMISSION-HBA1C")]
_cs["x"]["note"] = "Never evaluated for type 1 or an unclassified type, or with any glucose-lowering medicine on the list. Haemolysis, recent malaria and a recent transfusion block the HbA1c through the caveat hba1c_red_cell_turnover."

# ── H10  a negative antibody never refutes type 1 ───────────────────────────
tag(item("classifications", "type_1"), "H10")["x"]["neverNotMet"] = True

# ── H11, H20, H34, H36  the ladder ──────────────────────────────────────────
GLU18 = lambda cid: crit(cid, "Any glucose 18 mmol/L or more (WHO refers a person not improving at this level; the referral rule applies)", any=GLU("REF-DM-ACU-KETONE-TEST-GLU") + [HI()], ref_id="REF-DM-ACT-REFER-SAMEDAY")
EGFR30N = lambda cid: crit(cid, "eGFR below 30 (metformin must be reviewed first, and a sulfonylurea carries its highest risk here)", all=[P("egfr", "<", ref="REF-DM-RX-METFORMIN-STOP-EGFR")], ref_id="REF-DM-RX-METFORMIN-STOP-EGFR")
EGFR_GAP_SU = [{"feature": "egfr", "say": "Kidney function is not known. Check creatinine before adding a medicine that can cause lows, or record why it cannot be done here.", "ref": "REF-DM-KID-GFR-G4"}]
_s = tag(item("management", "DM-ACT-RX-02"), "H11", "H20", "H34")
_s["display"] = "On metformin without a sulfonylurea or insulin, and above target despite taking it: WHO's next step is to add a sulfonylurea (WHO prefers gliclazide; check what this level of care stocks)"
_s["when"]["label"] = "Type 2 diabetes recorded, on metformin, not on a sulfonylurea or insulin, above target at review despite taking it"
_s["x"]["notWhen"] = [RELAXED_OK("rx_second_relaxed"), EGFR30N("rx_second_egfr30"), GLU18("rx_second_glu18")]
_s["x"]["needsBeforeActing"] = EGFR_GAP_SU
_s = tag(item("management", "DM-ACT-RX-03"), "H11", "H20")
_s["x"]["notWhen"] = [EGFR30N("rx_third_egfr30"), GLU18("rx_third_glu18")]
_s["x"]["needsBeforeActing"] = EGFR_GAP_SU
_s = tag(item("management", "DM-ACT-RX-04"), "H20", "H34", "H27")
_s["display"] = "Type 2 or unclassified diabetes, not on insulin, with HbA1c above 10% or glucose 16.7 mmol/L or more: ADA says consider insulin. Check ketones first"
_s["x"]["urgency"] = "routine"
_s["x"]["notWhen"].append(GLU18("rx_severe_glu18"))
_s = tag(item("management", "DM-ACT-RX-01"), "H36")
_s["x"]["notWhen"] = [crit("rx_first_relaxed", "A relaxed target has been agreed, HbA1c is below 8.0%, and fasting plasma glucose is recorded at or below 7.0 mmol/L",
                           all=[P("glycaemic_target_tier", "==", "relaxed"), P("hba1c", "<", ref="REF-DM-CTRL-HBA1C-RELAXED"), P("fasting_pg", "<=", ref="REF-DM-CTRL-FPG-SURROGATE")], ref_id="REF-DM-CTRL-HBA1C-RELAXED")]
item("therapyFlags", "hypoglycaemia_needing_help_on_treatment")["action"] = ("ADA: one or more episodes below 3.0 mmol/L or needing help should prompt re-evaluation of the plan, with a review of the medicine causing it. "
                                                                           "Repeated lows managed without help are reviewed in the same way here (a pack rule). Review hypoglycaemia at every visit.")

# ── H12  potassium of 6.0 or more: the prescriber is told as well ───────────
therapy_flag("ras_blocker_potassium_6_or_more", "Potassium 6.0 mmol/L or more on an ACE inhibitor or ARB", "red",
    crit("tf_k6", "On an ACE inhibitor or ARB, potassium 6.0 mmol/L or more", all=[P("ras_blocker", "in", ["acei", "arb", "both"]), P("potassium", ">=", ref="REF-DM-KID-K-MODERATE")], ref_id="REF-DM-KID-K-MODERATE"),
    "KDIGO (reproducing UK guidance): repeat within 24 hours if unexpected; assess in hospital if unwell or kidney function has fallen; at 6.5 or more act at once. Review today with the prescriber.", "A6-60")
last("therapyFlags", "H12")["x"].update({"ages": "any", "under16Action": PAED_ACTION})

# ── H13, H14  the frail person on insulin; targets that agree with each other ─
step("DM-ACT-RX-11B", "Frail or cognitively impaired, 75 or over, on insulin: ADA says to simplify treatment and avoid lows. Review the regimen and the target",
     crit("rx_deesc_insulin", "Aged 75 or over, on insulin, with frailty or cognitive impairment", all=[P("age_years", ">=", ref="REF-DM-HYPO-RISK-AGE"), GLT("insulin")],
          any=[P("frailty_or_limited_life_expectancy"), P("cognitive_impairment")], ref_id="REF-DM-RX-OLDER"),
     "A4-54", "therapy_review", "DM-ACT-THERAPY", prescribing=True, proposal={"kind": "therapy.review"}, standardSet="ada_2026",
     note="No HbA1c value is tested: ADA's older-adults section gives health-status tiers, and a lower safety limit is for the CSO to supply from it. A fasting glucose near 4 in this person is a warning, not a result.")
last("management", "H13")
RELAXED_ANY = lambda: [P("frailty_or_limited_life_expectancy"), P("cognitive_impairment"), P("hypo_worst_12m", "in", HYPO_SIG), P("hypo_awareness_score", ">=", ref="REF-DM-HYPO-IAH")]
_t = tag(item("targets", "tgt_hba1c_relaxed"), "H14")
_t["when"] = crit("tgt_relaxed", "Any of: frailty, serious comorbidity or limited life expectancy; cognitive impairment; a significant low in the last year (needing help, a reading below 3.0, or repeated); impaired awareness of lows (Gold score 4 or more)",
                  all=[KNOWN()], any=RELAXED_ANY(), ref_id="REF-DM-CTRL-HBA1C-RELAXED")
for _tid in ("tgt_hba1c_general", "tgt_hba1c_older_healthy"):
    tag(item("targets", _tid), "H14")["x"]["notWhen"] = [crit(f"{_tid}_relaxed_applies", "A reason to relax the target is recorded (the relaxed target is proposed instead; Gold score 4 or more counts)", any=RELAXED_ANY(), ref_id="REF-DM-CTRL-HBA1C-RELAXED")]

# ── H15, H18  type 1 suspicion does not depend on an unrelated box ──────────
_r = tag(item("rules", "DM-CLS-T1-04"), "H15")
_r["display"] = "A glucose in the diabetes range and two or more of: under 35, BMI below 25, unexplained weight loss. Check ketones now and do not assume type 2"
_r["when"] = crit("cls_t1_new", "Any glucose 11.1 mmol/L or more (or a meter reading HI), with at least two of: aged under 35, BMI below 25, unexplained weight loss",
                  any=GLU("REF-DM-DX-RANDOM") + [HI()], atLeast=(2, [P("age_years", "<", ref="REF-DM-CLS-T1-AGE"), P("bmi", "<", ref="REF-DM-CLS-T1-BMI"), P("unexplained_weight_loss")]), ref_id="REF-DM-CLS-T1-SAMEDAY")
_r["x"]["runWhenOverride"] = "not_established"
_r["notes"] += " The rule reads the glucose itself, so it does not wait for the criteria set, which may be waiting on the pregnancy answer."
_r = tag(item("rules", "DM-CLS-T1-01"), "H15", "H35")
_r["when"] = crit("cls_ketosis", "Urine ketones 2+ or more now, with known diabetes, any glucose 11.1 mmol/L or more, or a meter reading HI", all=[KET2()], atLeast=(1, [KNOWN(), HI()] + GLU("REF-DM-ACU-DKA-GLU")), ref_id="REF-DM-CLS-T1-SAMEDAY")
_r["x"]["runWhenOverride"] = "always"
_r = tag(item("rules", "DM-CLS-T1-05"), "H18")
_r["display"] = "No type recorded, not on insulin, and two or more features of insulin deficiency: check ketones today"
_r["when"] = crit("cls_t1_unclassified", "At least two of: diagnosed before age 35, BMI below 25, unexplained weight loss, glucose above 20 mmol/L at presentation",
                  atLeast=(2, [P("age_at_diagnosis", "<", ref="REF-DM-CLS-T1-AGE"), P("bmi", "<", ref="REF-DM-CLS-T1-BMI"), P("unexplained_weight_loss"), P("glucose_at_presentation", ">", ref="REF-DM-CLS-T1-GLU")]), ref_id="REF-DM-CLS-T1-SAMEDAY")
_r["x"]["notWhen"] = [crit("cls_t1_typed", "A clinician has recorded the type", all=[P("dm_type_recorded", "in", ["type_1", "type_2", "gestational", "other"])], ref_id="REF-DM-CLS-UNCLASSIFIED"),
                      crit("cls_t1_on_insulin", "Insulin is among the current medicines", all=[GLT("insulin")], ref_id="REF-DM-RX-INSULIN-T1")]
_r["notes"] = "Fires when the type is blank as well as when it is recorded as unclassified, and when the medicine list is blank: the person nobody has classified is the one at risk. Silent once a clinician records the type or insulin is on the list."

# ── H16, H25, H44  meter-only sites; pregnancy ──────────────────────────────
PREG_NOT_HERE = lambda cid: crit(cid, "Pregnant (the pregnancy rules apply and refer today)", all=[P("pregnant")], ref_id="REF-DM-PREG-DIP")
drule("DM-SUS-INCID-03", "A fasting meter reading of 7.0 mmol/L or more: with symptoms it is diagnostic; without them, repeat on another day and do not leave it", "diabetes_undiagnosed",
      crit("sus_single_fasting_meter", "A fasting capillary glucose of 7.0 mmol/L or more", all=[P("capillary_glucose_context", "==", "fasting"), P("capillary_glucose", ">=", ref="REF-DM-DX-FPG")], ref_id="REF-DM-DX-REPEAT-WHO"),
      "moderate", "routine", ["capillary_glucose", "fasting_pg", "repeat_abnormal_result"], ["A sample that was not truly fasting", "Acute illness (stress hyperglycaemia)", "Meter error near the threshold"], "A2-04", "DM-SUS-INCID", ageBands=ADULT,
      notes="The district form of DM-SUS-INCID-02: at a site with only a meter this is the single abnormal result that must not be dropped.",
      proposal={"kind": "test.repeat", "test": "glucose_capillary_fasting", "tier": "soon"})
last("rules", "H16")["x"]["notWhen"] = [crit("sus_fmeter_repeated", "A second diabetes-range result on a later day is already recorded", all=[P("repeat_abnormal_result")], ref_id="REF-DM-DX-REPEAT-WHO"), PREG_NOT_HERE("sus_fmeter_preg")]
for _rid in ("DM-SUS-INCID-01", "DM-SUS-INCID-02"):
    tag(item("rules", _rid), "H25")["x"].setdefault("notWhen", []).append(PREG_NOT_HERE(f"{_rid[-8:].lower().replace('-', '_')}_preg"))
drule("DM-CON-PREG-05", "Pregnant with a fasting meter glucose of 7.0 mmol/L or more: refer today for specialised antenatal care", "diabetes_in_pregnancy",
      crit("con_preg_fcap7", "Pregnant, with a fasting capillary glucose of 7.0 mmol/L or more", all=[P("pregnant"), P("capillary_glucose_context", "==", "fasting"), P("capillary_glucose", ">=", ref="REF-DM-DX-FPG")], ref_id="REF-DM-PREG-DIP",
           needs="A referral rule, not a diagnosis: a fasting plasma glucose at this level is diabetes in pregnancy under WHO 2013, and the meter reading is treated the same way for referral only (D-DM-28)."),
      "high", "same_day", ["fasting_pg", "ogtt_2h_pg", "urine_ketones"], ["A sample that was not truly fasting"], "A10-02", "DM-CON-PREG", lane="confirm",
      proposal={"kind": "refer", "to": "antenatal_clinic_specialist", "tier": "today"})
last("rules", "H44")
tag(item("rules", "DM-CON-PREG-04"), "H44")["x"]["notWhen"] = [crit("con_preg_fcap_high", "A fasting capillary glucose of 7.0 mmol/L or more (referred today by rule DM-CON-PREG-05)",
    all=[P("capillary_glucose_context", "==", "fasting"), P("capillary_glucose", ">=", ref="REF-DM-DX-FPG")], ref_id="REF-DM-PREG-DIP")]
tag(item("rules", "DM-SUS-POP-ANTIPSYCH-02"), "H32")["x"]["notWhen"] = [crit("sus_antipsychotic_12w_owns", "Started 12 or more weeks ago with no glucose test since (the 12-week rule fires)",
    all=[P("weeks_since_antipsychotic_start", ">=", ref="REF-DM-SUS-ANTIPSYCH-WEEKS"), P("glucose_test_since_antipsychotic_start", "absent")], ref_id="REF-DM-SUS-ANTIPSYCHOTIC")]

# ── H19  restricted reasons: actions and alternatives too ───────────────────
NEUTRAL_ACTION = {"ras_blocker_or_statin_could_conceive": "Discuss the medicine and future plans with the prescriber.", "sulfonylurea_with_rifampicin": "Glucose control may worsen with the current medicines: monitor it and review with the prescriber.",
                  "dolutegravir_with_metformin": "Two current medicines interact: follow up closely (electrolytes, urea, creatinine, random blood sugar) and review with the prescriber."}
NEUTRAL_ALT = {"hba1c_hiv_on_art": "Use fasting or 2-hour plasma glucose criteria instead of HbA1c.", "glucose_tb_at_diagnosis": "Re-check glycaemia in a month; confirm an asymptomatic positive with a repeat test.",
               "capillary_glucose_tb_at_diagnosis": "Re-check glycaemia in a month; confirm an asymptomatic positive with a repeat test.", "fasting_glucose_tb_at_diagnosis": "Re-check glycaemia in a month; confirm an asymptomatic positive with a repeat test."}
_apply_neutral_display = apply_neutral
def apply_neutral():
    _apply_neutral_display()
    for it in REG["therapyFlags"]:
        if it["id"] in NEUTRAL_ACTION: it["x"]["neutralAction"] = NEUTRAL_ACTION[it["id"]]
    for it in REG["validityCaveats"]:
        if it["id"] in NEUTRAL_ALT: it["x"]["neutralAlternative"] = NEUTRAL_ALT[it["id"]]

# ── H21  'off by default' is a field, with the decision that turns it on ────
def off(kind, iid, decision, why):
    it = tag(item(kind, iid), "H21"); it["x"]["enabled"] = False; it["x"]["enabledBy"] = decision; it["x"]["enabledNote"] = why
off("rules", "DM-SUS-RISK-03", "D-DM-05", "ADA's universal testing from 35: off unless the CSO turns it on.")
off("rules", "DM-SUS-PREG-01", "D-DM-12", "WHO makes no universal recommendation to test in pregnancy: off until the CSO decides.")
SAFETY_REVIEWS = ("DM-ACT-RX-10", "DM-ACT-RX-11", "DM-ACT-RX-11B")      # these ask for LESS treatment; they stay on with the flags
for _s in REG["management"]:
    if _s["x"]["kind"] == "therapy_review" and _s["id"] not in SAFETY_REVIEWS:
        off("management", _s["id"], "D-DM-20", "A class-level treatment review step: dark until the CSO has read it against Uganda's own ladder.")
for _sid in ("DM-ACT-RX-05", "DM-ACT-RX-05B"):
    item("management", _sid)["x"]["enabledBy"] = "D-DM-20 and D-DM-21"
item("management", "DM-ACT-SCREEN-LIPID-01")["x"]["requiresCapability"] = "lab.lipids"
tag(item("management", "DM-ACT-SCREEN-LIPID-01"), "H21")["x"]["enabledNote"] = "Shown only where the site has a lipid profile (D-DM-15)."
item("rules", "DM-SUS-RISK-02")["x"]["requiresCapability"] = "lab.glucose"
tag(item("rules", "DM-SUS-RISK-02"), "H21")["x"]["enabledNote"] = "ADA's rule runs only at sites with a laboratory glucose (D-DM-05)."
FEATURES["mental_status"]["x"]["note"] = "The live options have no 'confused'. A confused, hyperglycaemic patient is not caught by the rules that read drowsiness: Phase 0 adds the option, or maps the clerking desk's confusion finding to it, and the acute rules read it (second review, H41)."

# ── found while reading the evaluator's output after the second review ──────
for _rid in ("DM-SUS-SYMP-01", "DM-SUS-SYMP-02"):
    tag(item("rules", _rid), "H20")["x"]["notWhen"] = [crit(f"{_rid[-7:].lower().replace('-', '_')}_done", "A glucose is already recorded (the criteria and the other rules now read it)", any=GLU_REC() + [REC("hba1c")], ref_id="REF-DM-DX-RANDOM")]
_r = tag(item("rules", "DM-CLS-T1-02"), "H18")
_r["display"] = "Recorded as type 2, with two or more features of insulin deficiency: review the type"
_r["when"] = crit("cls_t1_features", "Type 2 recorded, with at least two of: diagnosed before age 35, BMI below 25, unexplained weight loss, glucose above 20 mmol/L at presentation", all=[T2()],
                  atLeast=(2, [P("age_at_diagnosis", "<", ref="REF-DM-CLS-T1-AGE"), P("bmi", "<", ref="REF-DM-CLS-T1-BMI"), P("unexplained_weight_loss"), P("glucose_at_presentation", ">", ref="REF-DM-CLS-T1-GLU")]), ref_id="REF-DM-CLS-T1-AGE")
_r["x"].pop("runWhenOverride", None)
_r["notes"] += " Where no type is recorded, rule DM-CLS-T1-05 asks the same question the same day."
tag(item("management", "DM-ACT-REFER-BP-03"), "H38")["x"]["notWhen"] = [crit("ref_bp_sympt_higher", "Systolic above 200 or diastolic above 110 mmHg (the rule without symptoms already refers today)",
    any=[P("bp_systolic", ">", ref="REF-DM-ACU-BP-REFER-SBP"), P("bp_diastolic", ">", ref="REF-DM-ACU-BP-REFER-DBP")], ref_id="REF-DM-ACU-BP-REFER-SBP")]
item("management", "DM-ACT-REFER-BP-03")["display"] = "Blood pressure above 180 systolic with headache, breathlessness, blurred vision, confusion, vomiting or little urine: refer today"
item("management", "DM-ACT-REFER-BP-03")["when"] = crit("ref_bp_sympt", "Symptoms with the raised pressure, and systolic above 180 mmHg", all=[P("hypertensive_symptoms"), P("bp_systolic", ">", ref="REF-DM-ACU-BP-REFER-SBP-SYMPT")], ref_id="REF-DM-ACU-BP-REFER-SBP-SYMPT")
step("DM-ACT-REFER-TARGET-02", "On insulin with HbA1c above 7.5%: refer for review of the insulin",
     crit("ref_goal_insulin", "On insulin, with HbA1c above 7.5%", all=[KNOWN(), GLT("insulin"), P("hba1c", ">", ref="REF-DM-CTRL-INSULIN-REFER-HBA1C")], ref_id="REF-DM-CTRL-INSULIN-REFER-HBA1C"),
     "A2-30", "refer", "DM-ACT-REFER", proposal={"kind": "refer", "to": "diabetes_clinic"},
     note="WHO HEARTS-D's insulin annex. Insulin adjustment is outside this pack, for type 1 and type 2 alike, so a person above target on insulin is referred and not advised. Silent inside an accepted relaxed target.")
last("management", "H13")["x"]["notWhen"] = [RELAXED_OK("ref_goal_insulin_relaxed")]
item("management", "DM-ACT-REFER-TARGET-02")["x"]["agesOverride"] = "any"
item("management", "DM-ACT-REFER-TARGET-02")["x"]["runWhenOverride"] = "established_or_met"

# ═══ Disposition of every finding ═══════════════════════════════════════════
FIXED, PART, CSO, PH0 = "fixed", "fixed_in_part", "cso_decision", "phase_0"
DISPOSITION = {
 "F01": (FIXED, "Red flag metformin_egfr_below_30. Vignette DMV-35."),
 "F02": (FIXED, "Rules DM-ACU-ROUTE-11 (clinical picture), -13 (known diabetes and unwell: test now), -14 (glucose 33.3 or HI, whatever the ketones). ROUTE-01 says what to do when ketones are negative or no strip exists. Vignettes DMV-36, DMV-37."),
 "F03": (FIXED, "ROUTE-04 rewritten: the osmotic history is no longer required; glucose, HI, ketones or known diabetes stand in for it. New ROUTE-15 (sick child: glucose now). PAED-01 and its display aligned. Vignettes DMV-38, DMV-39, DMV-40."),
 "F04": (FIXED, "x.ages = adult on every target, stratify band, risk model and therapy flag; the evaluator withholds them under 16. DMV-40 asserts it. Where the adolescent band ends is an open Phase 0 question."),
 "F05": (FIXED, "A blocking caveat now makes every criterion, stage and classification that reads the feature 'insufficient' in both directions. A second caveat covers the macula. DMV-21 corrected; DMV-55 tests the urine albumin case."),
 "F06": (FIXED, "The tick-box feature is deleted. Every hypoglycaemia predicate reads glucose_lowering_therapy. DMV-41 has no tick."),
 "F07": (FIXED, "Control bands have a LOW band below 3.9. Rules DM-ACU-ROUTE-06 (below 3.0, LO, or not resolving) and -07 (below 3.9 on insulin or a sulfonylurea). DMV-41."),
 "F08": (FIXED, "DM-ACT-REFER-FOOT-02 (any active ulcer), FOOT-01 now reads the ulcer, FOOT-03 (gangrene or deep infection without an ulcer). An ulcer with absent pulses is same-day. DMV-42, DMV-43."),
 "F09": (PART, "DM-CON-PREG-03 and -04 give the meter-only antenatal site a referral rule. Unknown pregnancy in a woman who could be pregnant now makes the non-pregnant criteria set 'insufficient'. DMV-44 to DMV-46. Whether a meter may be used for gestational criteria is D-DM-28."),
 "F10": (FIXED, "Reason removed from the target's display; x.restrictedReason holds it. Every item that reads a restricted feature now carries x.neutralDisplay, and the build fails if one is missing."),
 "F11": (FIXED, "The criterion requires type 2 recorded; the set is 'not met' when a glucose in the diabetes range is on record. DMV-47."),
 "F12": (FIXED, "Seven 'never done' features, each an explicit answer. Every due rule is 'never, or N months since'. DMV-48, DMV-49."),
 "F13": (FIXED, "New criterion: any meter reading 12.2 or more with symptoms. The random criterion accepts 'after food'. DMV-50."),
 "F14": (FIXED, "DM-SUS-INCID-02. DMV-02 now expects it."),
 "F15": (FIXED, "dm_status gains 'not_known'; Design B rule DM-SUS-RECON-02 covers the absent case. DMV-51."),
 "F16": (FIXED, "T1-01 reads ketones now only, and not on an SGLT2 inhibitor. New routine rule T1-03 for a past ketosis, silent once settled. RX-01's contraindication reads current ketones. DMV-52; DMV-10 corrected."),
 "F17": (FIXED, "Classification rules run as soon as a criterion is met. New same-day rule T1-04 for the newly diagnosed. New ketone rule at 15 mmol/L with symptoms (ROUTE-08). DMV-50."),
 "F18": (FIXED, "Both C-peptide criteria are held out of the live rules (x.heldOut) until a person reads the source figure."),
 "F19": (FIXED, "RX-04 is for type 2 or unclassified, not on insulin, and needs a glucose or HbA1c criterion. Weight loss has its own rule (DM-CLS-WTLOSS-01) naming TB, HIV and cancer."),
 "F20": (FIXED, "RX-02 carries cautions. RX-01 reports 'kidney function not known' and is silent inside an accepted relaxed target. DMV-35, DMV-53."),
 "F21": (FIXED, "Two meter control tables, step RX-01B and a strip-positive step. DMV-53."),
 "F22": (FIXED, "CKD-01 keeps only the non-diabetic clues. Progression has its own routine step (REFER-EGFR-03) with KDIGO's 30% allowance. DMV-60."),
 "F23": (FIXED, "Red flag for an SGLT2 inhibitor in acute illness; red flag for other glucose-lowering medicines in pregnancy. DMV-10, DMV-58."),
 "F24": (FIXED, "ROUTE-09 (type 1 not on insulin) and ROUTE-10 (insulin stopped, missed or run out). DMV-47."),
 "F25": (PART, "ROUTE-01 is same-day; the interrupt is rule 11. HI and LO are recordable and satisfy the rules. Unit entry (mmol/L or mg/dL) and a plausibility range are platform work: engine change EC-6."),
 "F26": (FIXED, "The IDF table is not read in pregnancy. DMV-23 asserts it."),
 "F27": (FIXED, "DRUG-01 runs only when diabetes is not established and no longer proposes a relabel. Known diabetes on steroids gets a monitoring prompt. DMV-56."),
 "F28": (FIXED, "The illness and TB caveats attach to meter and fasting glucose too. They warn and do not block: whether to hold the diagnosis until recovery is D-DM-29."),
 "F29": (FIXED, "ROUTE-16 for potassium 6.0 to 6.4. The amber flag stops below 6.0 and no longer reassures. DMV-54."),
 "F30": (FIXED, "Two rules: the 12-week re-test (no test since the start) and the yearly test. DMV-57."),
 "F31": (PART, "The prompt clears once the person is on an antiplatelet and is contraindicated after a bleeding or untyped stroke. The exclusion has no quoted source: for CSO signature."),
 "F32": (FIXED, "Two new answers (a reading below 3.0; repeated lows). RX-10, the flag and the risk model read them. Glibenclamide has a second flag for hypoglycaemia concern."),
 "F33": (FIXED, "ROUTE-17 (heart or stroke symptoms), REFER-LIMB-01, anuria in REFER-EGFR-01, REFER-BP-03, and 'not resolving' in ROUTE-06. DMV-59."),
 "F34": (FIXED, "Mild and moderate retinopathy use the near end of ICO's range unless control is confirmed at target. Referral split: urgent for sight-threatening disease, routine for moderate."),
 "F35": (FIXED, "Five labels reworded or predicates changed to match."),
 "F36": (CSO, "RX-01 now uses 'above 7.0' for fasting glucose. The bands keep 'below' and say so: WHO disagrees with itself at exactly 7.0 and 9.0 (D-DM-13)."),
 "F37": (PART, "Three flag actions reworded to 'review with the prescriber'. The reference text for metformin below 45 still paraphrases ADA: D-DM-31."),
 "F38": (PART, "Stop conditions added to PREG-01, PREG-02, RISK-01, TB-01; PAED-01 split by urgency. RISK-02 relies on the engine showing it once per episode."),
 "F39": (PART, "The dolutegravir-metformin text now quotes UCG 2023, read verbatim at verification. The Kampala signal and the eGFR-in-pregnancy caveat are marked needsCsoInput; the pregnancy caveat no longer blocks."),
 "F40": (CSO, "RX-02 and the glibenclamide flag point to the level of care. Which sulfonylurea at which level is D-DM-22; whether pregnancy features are a restricted class is D-DM-30."),
 "F41": (FIXED, "26 vignettes added (DMV-35 to DMV-60), one for each gap named. Each must fire something or the build fails."),
}

DISPOSITION.update({
 "G01": (FIXED, "The 'against' glucose atom is removed from the hypoglycaemia profile; the note says why and what the vital must record before one can return."),
 "G02": (FIXED, "dr_review reordered, most urgent first; it now reads macula 'cannot assess', an inadequate or absent view, acuity worse than 6/12 and blurred vision, and returns 'incomplete' instead of a reassuring interval. Three care items replace one. Which rule governs (Uganda 2016 'refer all' or ICO) is D-DM-14."),
 "G03": (FIXED, "Every care item carries min_age_ref unless it is a referral or an acute test; a new item refers under-16s today. The age is REF-DX-ADULT-AGE, for CSO signature."),
 "G04": (FIXED, "No 'against' atom on the hyperosmolar profile."),
 "G05": (FIXED, "No C-peptide atom for or against type 1; both clerking references removed."),
 "G06": (FIXED, "Effective osmolality is read against the effective threshold (300), from the dossier."),
 "G07": (FIXED, "The single-test OGTT 'against' atom is removed from both profiles."),
 "G08": (FIXED, "Type 2 no longer lists glucose, HbA1c, any-type past diabetes, or build bands."),
 "G09": (PART, "EC-1 now specifies the HbA1c validity behaviour and the restricted-reason display. Certification of the method is a qualifier Phase 0 must map."),
 "G10": (PART, "Engine change EC-5 (pregnancy atom) is specified. Both pregnancy profiles and a new differential rule are gated on it and withheld until it exists; the statin, ACE inhibitor and ladder items exclude pregnancy."),
 "G11": (PART, "EC-8 defines amend as merge-only. The per-profile diff against the live catalogue is Phase 0 work; the change to must-not-miss on type 1 is D-DM-35."),
 "G12": (FIXED, "The confirm item attaches to all three diabetes problems and is a later-day task."),
 "G13": (FIXED, "Ketone bands are named as findings. Urgent only with diabetes, a raised glucose, a glucose-lowering medicine or Kussmaul breathing; caution otherwise."),
 "G14": (FIXED, "Urgent only with type 1, insulin from diagnosis, a raised glucose, vomiting or ketones. The medicine-adherence atom is declared in EC-7."),
 "G15": (FIXED, "SUG-POLYURIA's branch is kept. A new suggestion covers 'diabetes and unwell'."),
 "G16": (PART, "Rules added: class tags first, route for steroids. The unused also-ask is removed. The SGLT2 flag reads breathing pattern. Signed brand stems are Phase 0."),
 "G17": (PART, "Specified as engine change EC-6; the catalog side (HI and LO as recordable values) is done."),
 "G18": (FIXED, "EC-5 to EC-8 declare every evaluator and catalogue feature the wiring uses. EC-1 reads the latest fact that matches the qualifiers."),
 "G19": (PART, "Result atoms carry 'qualifiers' named after the fact model; the capillary 2-hour threshold has its own reference and atom. Exact values are mapped in Phase 0."),
 "G20": (PART, "Clerking references are generated from the dossier at build time, never typed. Six unused entries removed; the build now fails on an unused or undefined one. The glucose result age has no value on purpose (D-DM-08). Plan labels still carry numbers as text."),
 "G21": (PART, "Labels added for the eight new diagnoses. A generated file, wiring/reconcile-ids.json, lists every catalogue id the pack uses for Phase 0 to resolve."),
 "G22": (PART, "Five concepts marked 'verify: probably exists'; one option-id set; the EC-2 contradiction stated. The diff against the generated catalogue is Phase 0."),
 "G23": (PART, "Components listed (bicarbonate on the gas, three samples on the OGTT, three results on the retinal examination); two unused tests held. The live shape is Phase 0."),
 "G24": (PH0, "The entries name drug and class only. The file now says what does not work until Phase 0 completes them."),
 "G25": (FIXED, "Antiplatelet link removed; neuropathy link held."),
 "G26": (FIXED, "Two ketone items: always on ketoacidosis and type 1; conditional elsewhere, including on an SGLT2 inhibitor. Blood ketones first."),
 "G27": (PART, "Label and rule changed (senior review; admit or refer; never overwrite). Capability-aware disposition is an engine item."),
 "G28": (PART, "A 'due' field separates later-day tasks from today's basket. The steroid item uses a post-meal test. The early creatinine repeat exists but is 'needs-cso': its interval has no source in this pack."),
 "G29": (PART, "Teaching items read the Plan basket (declared in EC-7) and show unconditionally on type 1. An SGLT2 item is added. The after-a-low item is 'needs-cso' until UCG 2023 section 1.1.6 is read."),
 "G30": (PART, "Compound items split; labels match predicates; the foot interval follows the risk category; type 1 has its own eye item. 'Due' awareness (last date, recorded-within) is not built: the NCD engine owns it."),
 "G31": (PART, "where_unavailable is structured by capability. The kidney fallback says a negative strip excludes nothing. Strip and capillary evidence atoms on the kidney and intermediate profiles are Phase 0."),
 "G32": (PART, "'Only in pregnancy' removed from the type list; a separate past-history question is proposed. Its restricted class is D-DM-30."),
 "G33": (FIXED, "A 'none' grade exists and is offered only on an adequate dilated or photographic view. Grade definitions come from the signed reference, not a typed hint."),
 "G34": (FIXED, "The ketone prompt has its own badge and says what to do without a strip; the retinopathy flag states the intervals; the admission flag no longer assumes insulin."),
 "G35": (PART, "Acute kidney injury is no longer put first on a result up to a year old. The other chip-noise items are Phase 0."),
 "G36": (PART, "Options in the third person, 'not sure' added, only 'none' exclusive, composer rule stated, acuity ids without '/', finding wording on injection sites. A 4+ ketone option waits on the live strip list."),
 "G37": (PART, "HbA1c removed from the steroid profile's deciding tests. Source keys for the local epidemiology sentences in profile notes are Phase 0."),
})

# ── second review (R3) ──────────────────────────────────────────────────────
DISPOSITION.update({
 "H01": (FIXED, "Referral steps and red flags stay on under 16; a red flag's action becomes 'refer today; do not change the medicine here'. Targets, bands, the risk model and amber flags stay off. DMV-61."),
 "H02": (FIXED, "Referral steps run at the visit where the criteria are met; limb- and sight-threatening ones run always. DMV-62."),
 "H03": (FIXED, "Every acute rule reads all six fields a current glucose can be typed into; the build fails if the low-glucose or the very-high-glucose rule misses one. DMV-63."),
 "H04": (FIXED, "DM-SUS-PAED-03: a child with a glucose above 11 or HI is referred today whatever the symptoms. The 'test now' prompts clear once a glucose is recorded. DMV-64."),
 "H05": (FIXED, "A value under a blocking caveat is not banded, is not the measure of a proposed target, and is not read by a treatment-review step. DMV-65, DMV-35."),
 "H06": (FIXED, "No stratify band is shown in pregnancy. DMV-66."),
 "H07": (FIXED, "The interrupt needs a sign (deep breathing, acetone breath, dehydration, drowsiness). Vomiting or pain alone with a raised glucose is a same-day ketone test (ROUTE-19). One interrupt per event: the hyperosmolar rule takes precedence, and test prompts clear when the result is recorded. DMV-67, DMV-37, DMV-10."),
 "H08": (FIXED, "ROUTE-15 interrupts only for deep breathing or drowsiness and clears when a glucose is recorded. Dehydration or ketones alone is a same-day glucose test (ROUTE-18). Ketones no longer fire the hospital-now rule on their own. DMV-83."),
 "H09": (FIXED, "Remission needs 'no glucose-lowering medicine' recorded and is 'not met' with a fasting meter reading, an OGTT or a post-meal value in the diabetes range. A caveat for haemolysis, malaria and transfusion is added. DMV-82."),
 "H10": (FIXED, "The type 1 classification can never be 'not met': a negative antibody leaves it 'insufficient'. DMV-68."),
 "H11": (FIXED, "The sulfonylurea and insulin steps are silent below an eGFR of 30 and name 'kidney function not known' when it is missing. DMV-35 corrected."),
 "H12": (FIXED, "Red flag ras_blocker_potassium_6_or_more. DMV-54 corrected."),
 "H13": (PART, "DM-ACT-RX-11B for the frail or cognitively impaired person of 75 or over on insulin, and a referral for anyone on insulin above 7.5% (WHO's insulin annex). Bands with no lower edge now read 'not above the upper limit'. A lower safety limit for HbA1c in older adults has no number in this pack: the CSO supplies it from ADA's older-adults section."),
 "H14": (FIXED, "The general and older-adult targets are not proposed when a reason to relax is recorded; the relaxed target reads the same lows as RX-10. DMV-41, DMV-28, DMV-32, DMV-69."),
 "H15": (FIXED, "Pregnancy is 'unknown' unless the person is male, the platform says it is not possible, or the answer is recorded. Every item waiting on the answer is named. The type 1 warning reads the glucose itself and no longer waits. DMV-70, DMV-71."),
 "H16": (FIXED, "DM-SUS-INCID-03 for a fasting meter reading of 7.0 or more. DMV-72."),
 "H17": (FIXED, "'No retinopathy' counts only on an adequate view through dilated pupils, on a photograph or at the slit lamp; an undilated or inadequate look keeps 'retinal examination due' open. DMV-73, DMV-21."),
 "H18": (FIXED, "Four rules no longer need a field to have been filled: T1-05 (type blank), ROUTE-09 (medicine list blank), ROUTE-07 (type 1 or known diabetes), ROUTE-20 (drowsy with insulin or a sulfonylurea on the list). DMV-75 to DMV-77."),
 "H19": (FIXED, "Restricted items carry a neutral action and a neutral alternative as well as a neutral display; the build checks all three for restricted words."),
 "H20": (FIXED, "The sulfonylurea, insulin and 'consider insulin' steps stand down at a glucose of 18 or more, where WHO refers. 'Consider insulin' is routine. Every test prompt clears when its result is recorded. DMV-78."),
 "H21": (FIXED, "x.enabled is false, with the decision that turns it on, for universal testing from 35, the pregnancy OGTT prompt and every treatment-review step except the three that ask for less treatment. The lipid prompt and ADA's risk rule need a laboratory. The evaluator reports such items as 'met but dark'. DMV-79, DMV-16."),
 "H22": (FIXED, "Urgency, display and proposal tier agree on ROUTE-09, ROUTE-10 and PAED-01."),
 "H23": (PH0, "PREG-02 still has no upper bound; it clears on 'tested since the birth'. An upper bound needs a source."),
 "H24": (PH0, "Harmless: the 'never tested' arm of two re-test rules cannot be true. Left for tidying."),
 "H25": (FIXED, "The single-result rules stand down in pregnancy, where the pregnancy rules refer."),
 "H26": (FIXED, "A warning on a value shows only when that value is recorded. Blocking caveats still show without one, because they say which test not to order."),
 "H27": (FIXED, "HI is read by the suspicion rule, the same-day referral, the type 1 warning and a symptomatic criterion; the feature note says exactly where."),
 "H28": (FIXED, "ROUTE-08 reads random plasma glucose."),
 "H29": (FIXED, "A caveat on the albumin count holds the albumin arm only; the ACR-above-70 referral is held too."),
 "H30": (PH0, "RX-10 and SCREEN-PREG-01 have no stop condition: the engine's 'done at this episode' state owns it."),
 "H31": (PH0, "The baseline risk band still shows when the higher bands are unanswered. Display wording for the engine."),
 "H32": (FIXED, "The yearly antipsychotic rule stands down when the 12-week rule fires."),
 "H33": (PH0, "ATYP-01 cannot fire at the diagnosis visit (it needs age at diagnosis); T1-04 covers that visit."),
 "H34": (FIXED, "RX-02, RX-04 and the hypoglycaemia flag reworded to what they test."),
 "H35": (FIXED, "T1-01 needs known diabetes or a raised glucose as well as ketones."),
 "H36": (FIXED, "RX-01 is held by a relaxed target only when the fasting glucose is recorded at or below 7.0."),
 "H37": (PH0, "The ketone table's alert wording is the same for a child. Children are routed by rules, not by this table; reword when the paediatric pack is written."),
 "H38": (PART, "The symptomatic blood-pressure rule stands down when the higher one fires. Holding routine items beside a same-day one is the engine's presentation rule."),
 "H39": (PH0, "Education steps and targets still show beside an interrupt: a presentation rule for the engine (interrupts first, routine items collapsed)."),
 "H40": (CSO, "The dolutegravir flag quotes UCG 2023. Whether the national HIV guideline limits the metformin amount could not be read; D-DM-33."),
 "H41": (PH0, "mental_status has no 'confused' option. Phase 0 adds it or maps the clerking desk's confusion finding; the acute rules then read it."),
 "H42": (PH0, "Three earlier fixes work only on an explicit answer, by design: 'not asked' is never 'never'. Design B's whole-record rules cover the absent case."),
 "H43": (FIXED, "A 'masks' caveat discredits a normal result only. DMV-74."),
 "H44": (FIXED, "DM-CON-PREG-05: a fasting meter reading of 7.0 or more in pregnancy is referred today. DMV-81. D-DM-28 states it."),
})
