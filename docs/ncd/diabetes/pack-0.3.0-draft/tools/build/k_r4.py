"""Fourth review (phase-1/r4/R4-review.json, J01 to J31): an independent read of
the answers to the third. It found 4 critical and 16 major problems, three of the
criticals introduced by those answers. Everything below answers it, tagged with
the finding id, and each fix has a patient in k_vignettes (DMV-84 onward).

Uganda's own text (UCG 2023, research/A13-ucg.json) was supplied for this round;
the pregnancy and hypertensive-emergency rules below are built from it.
"""
from lib import P, crit, REFS, FEATURES
from k_model import REG, drule, step, condition
from k_review import (tag, item, last, nref, val, GLU, GLU_REC, KET_REC, KNOWN, ISU, SU, GLT, HI, DROWSY, SIGNS, MILD, KET2,
                      ADULT, CHILD, DISPOSITION, FIXED)
import k_decisions

PART = "fixed_in_part"; CSO = "cso_decision"

def _drop_preds(c, feature):
    for k in ("all", "any"):
        if c.get(k): c[k] = [p for p in c[k] if p["feature"] != feature]
    if c.get("atLeast"): c["atLeast"]["of"] = [p for p in c["atLeast"]["of"] if p["feature"] != feature]

# ── references from Uganda's own text ───────────────────────────────────────
nref("REF-DM-PREG-BP-SBP", "UCG 2023: in pregnancy, systolic blood pressure at or above this value (with proteinuria) is pre-eclampsia", 140, "mmHg", ["UCG-PE-01"], "pregnancy")
nref("REF-DM-PREG-BP-DBP", "UCG 2023: in pregnancy, diastolic blood pressure at or above this value (with proteinuria) is pre-eclampsia", 90, "mmHg", ["UCG-PE-01"], "pregnancy")
nref("REF-DM-PREG-BP-SEVERE-SBP", "UCG 2023: acute severe hypertension in pregnancy, systolic", 160, "mmHg", ["UCG-PE-02"], "pregnancy")
nref("REF-DM-PREG-BP-SEVERE-DBP", "UCG 2023: acute severe hypertension in pregnancy, diastolic", 110, "mmHg", ["UCG-PE-02"], "pregnancy")
nref("REF-DM-ACU-BP-EMERG-SBP", "UCG 2023: hypertensive emergency is systolic above this value with acute complications", 180, "mmHg", ["UCG-HTN-03"], "acute")
nref("REF-DM-ACU-BP-EMERG-DBP", "UCG 2023: hypertensive emergency is diastolic above this value with acute complications", 110, "mmHg", ["UCG-HTN-03"], "acute")

condition("pre_eclampsia", "Pre-eclampsia", "UCG-PE-01")
condition("hypertensive_emergency", "Hypertensive emergency", "UCG-HTN-03")

# ── J01  Kussmaul breathing or acetone in known diabetes interrupts at any glucose
_r = tag(item("rules", "DM-ACU-ROUTE-13"), "J01")
_r["display"] = "Diabetes (or on insulin or a sulfonylurea) and vomiting, abdominal pain or dehydration, with no glucose on record: capillary glucose today, and ketones if it is raised"
_r["when"] = crit("acu_known_unwell", "Known diabetes, or on insulin or a sulfonylurea; with any of: vomiting, abdominal pain, dehydration",
                  any=MILD() + [P("dehydration")], atLeast=(1, [KNOWN()] + ISU()), ref_id="REF-DM-RX-SICKDAY-HOLD",
                  needs="A pack rule built from ADA's intercurrent-illness guidance (monitor glucose more often) and WHO's 'refer all suspected' rule. No source states it in these words: for CSO signature (D-DM-37).")
drule("DM-ACU-ROUTE-24", "Known diabetes (or on insulin or a sulfonylurea) with deep sighing breathing or acetone on the breath: suspected ketoacidosis at any glucose. Route now; glucose and ketones now",
      "dka", crit("acu_known_kussmaul", "Known diabetes, or on insulin or a sulfonylurea; with deep rapid breathing or acetone on the breath",
                  any=[P("deep_rapid_breathing"), P("acetone_breath")], atLeast=(1, [KNOWN()] + ISU()), ref_id="REF-DM-ACU-DKA-GLU"),
      "high", "immediate", ["capillary_glucose", "urine_ketones", "bohb"], ["Sepsis with lactic acidosis", "Salicylate poisoning", "Kidney failure with acidosis"], "A9-01", "DM-ACU-ROUTE",
      lane="acute_route", ageBands=ADULT,
      notes="The 2024 consensus makes a prior history of diabetes qualify for DKA at any glucose, so a normal reading does not stand this down. Deep breathing and acetone are signs, not symptoms (N13).",
      proposal={"kind": "acute.route", "to": "triage", "tier": "now"})
last("rules", "J01")["x"]["notWhen"] = [
    crit("acu_known_kussmaul_r11", "Any glucose 11.1 mmol/L or more or a meter reading HI (rule 11 interrupts for this patient)", any=GLU("REF-DM-ACU-DKA-GLU") + [HI()], ref_id="REF-DM-ACU-DKA-GLU"),
    crit("acu_known_kussmaul_r02", "Urine ketones 2+ or more, or blood ketones 3.0 mmol/L or more (rule 02 interrupts)", any=[KET2(), P("bohb", ">=", ref="REF-DM-ACU-DKA-BOHB")], ref_id="REF-DM-ACU-DKA-BOHB")]

# ── J02  a lagging HbA1c must not silence classic symptoms ─────────────────
for _rid in ("DM-SUS-SYMP-01", "DM-SUS-SYMP-02"):
    _r = tag(item("rules", _rid), "J02")
    for _k in _r["x"]["notWhen"]: _drop_preds(_k, "hba1c")

# ── J03  ketones below the emergency range are not reassurance ─────────────
CONTEXT = lambda: [KNOWN(), HI(), GLT("sglt2_inhibitor")] + ISU() + GLU("REF-DM-ACU-DKA-GLU")
drule("DM-ACU-ROUTE-21", "Ketones raised but below the emergency range, in diabetes or with a raised glucose: recheck within 2 hours and contact the diabetes team today. Rising, or 2+, is an emergency",
      "dka", crit("acu_ketones_mid", "Blood ketones 0.6 to below 1.6 mmol/L, or urine ketones trace or 1+; in known diabetes, on insulin, a sulfonylurea or an SGLT2 inhibitor, or with any glucose 11.1 mmol/L or more or a meter reading HI",
                  any=[P("urine_ketones", "in", ["trace", "1plus"]), P("bohb", ">=", ref="REF-DM-ACU-KETONE-LOW")], atLeast=(1, CONTEXT()), ref_id="REF-DM-ACU-KETONE-LOW",
                  needs="Trend UK and ISPAD give the blood bands; urine trace and 1+ are placed here because strips underestimate ketonaemia early (REF-DM-VAL-URINE-KETONE). A pack mapping: for CSO signature (D-DM-37)."),
      "moderate", "same_day", ["bohb", "venous_ph", "bicarbonate"], ["Starvation ketosis", "Alcoholic ketoacidosis"], "A9-51", "DM-ACU-ROUTE", lane="acute_route",
      notes="Clears only on a result the sources call normal: blood ketones below 0.6 or a negative strip. Trace and 1+ do not clear a ketone prompt; they bring this rule.",
      proposal={"kind": "test.repeat", "test": "test.ketones", "tier": "today"})
last("rules", "J03")["x"]["notWhen"] = [crit("acu_ketones_mid_up", "Blood ketones 1.6 mmol/L or more, or urine ketones 2+ or more (rules 22 and 02)", any=[P("bohb", ">=", ref="REF-DM-ACU-KETONE-RISK"), KET2()], ref_id="REF-DM-ACU-KETONE-RISK")]
drule("DM-ACU-ROUTE-22", "Blood ketones 1.6 to below 3.0 mmol/L in diabetes or with a raised glucose: at risk of ketoacidosis. Contact the diabetes team now and recheck within 2 hours",
      "dka", crit("acu_ketones_risk", "Blood ketones 1.6 to below 3.0 mmol/L; in known diabetes, on insulin, a sulfonylurea or an SGLT2 inhibitor, or with any glucose 11.1 mmol/L or more or a meter reading HI",
                  all=[P("bohb", ">=", ref="REF-DM-ACU-KETONE-RISK"), P("bohb", "<", ref="REF-DM-ACU-DKA-BOHB")], atLeast=(1, CONTEXT()), ref_id="REF-DM-ACU-KETONE-RISK"),
      "high", "urgent", ["bohb", "venous_ph", "bicarbonate"], ["Starvation ketosis", "Alcoholic ketoacidosis"], "A9-51", "DM-ACU-ROUTE", lane="acute_route",
      notes="Trend UK: 1.6 to 2.9 is 'at risk of DKA, contact the diabetes team'. ISPAD: blood ketones staying above 1.5 despite extra fluids needs urgent specialist review. Urgent, not an interrupt, unless a sign is present (rules 11 and 24).",
      proposal={"kind": "refer", "to": "diabetes_team", "tier": "now"})
tag(REG["rules"][-1], "J03")
drule("DM-ACU-ROUTE-23", "Type 1 diabetes or on insulin, with vomiting or abdominal pain and no ketone result: check ketones today, whatever the glucose. Never stop insulin",
      "dka", crit("acu_insulin_sick", "Type 1 diabetes recorded, or on insulin; with vomiting or abdominal pain",
                  any=MILD(), atLeast=(1, [P("dm_type_recorded", "==", "type_1"), GLT("insulin")]), ref_id="REF-DM-ACU-SICKDAY-INSULIN"),
      "moderate", "same_day", ["urine_ketones", "bohb"], ["Gastroenteritis", "Malaria"], "A9-49", "DM-ACU-ROUTE", lane="acute_route",
      notes="ISPAD sick-day rules: monitor glucose and ketones often; never stop insulin completely. Ketoacidosis in type 1 can come with a near-normal glucose, so the glucose does not clear this rule; a ketone result does.",
      proposal={"kind": "test.order", "test": "test.ketones", "tier": "today"})
last("rules", "J03")["x"]["notWhen"] = [crit("acu_insulin_sick_done", "A ketone result is already recorded (rules 02, 21 and 22 read it)", any=KET_REC(), ref_id="REF-DM-ACU-SICKDAY-INSULIN"),
                                        crit("acu_insulin_sick_signs", "Deep breathing, acetone on the breath, dehydration or drowsiness (an interrupting rule applies)", any=SIGNS(), ref_id="REF-DM-ACU-REFER-ALL")]
_f = tag(item("therapyFlags", "sglt2_during_acute_illness"), "J03")
_f["when"] = crit("sglt2_ill", "On an SGLT2 inhibitor, with any of: acutely unwell, vomiting, abdominal pain, dehydration",
                  all=[GLT("sglt2_inhibitor")], any=[P("acute_illness_current"), P("vomiting"), P("abdominal_pain"), P("dehydration")], ref_id="REF-DM-RX-SICKDAY-HOLD")

# ── J04, J16, J11, J25  the evaluator (build.py) changes; recorded here ─────
EVALUATOR_NOTES = [
    "J04: 'established_or_met' reads the non-pregnant criteria set as if pregnancy were answered, so an unknown pregnancy never hides a referral.",
    "J16: an item switched off by `enabled: false` is reported as dark and nowhere else: not in fired steps, urgency, gaps, cautions or the pregnancy-withheld list.",
    "J11: steps that ask for LESS treatment (`x.lessTreatment`) read every value, even one under a blocking caveat.",
    "J25: a child (neonate, infant or child band) has pregnancy 'not possible'; no pregnancy question waits on her.",
]
for _sid in ("DM-ACT-RX-10", "DM-ACT-RX-11", "DM-ACT-RX-11B"):
    tag(item("management", _sid), "J11")["x"]["lessTreatment"] = True

# ── J05, J06  children with known diabetes ─────────────────────────────────
tag(item("rules", "DM-SUS-PAED-03"), "J05")["x"].setdefault("notWhen", []).append(
    crit("sus_paed_known", "Known diabetes (the child is already diagnosed)", all=[KNOWN()], ref_id="REF-DM-ACU-PAED-GLU"))
_drop_preds(tag(item("rules", "DM-ACU-ROUTE-04"), "J06")["when"], "dm_status")
drule("DM-ACU-ROUTE-25", "A child with known diabetes and deep breathing, dehydration or drowsiness: suspected ketoacidosis. Route now",
      "dka", crit("acu_paed_known_signs", "A child with known diabetes, with deep rapid breathing, dehydration, or drowsiness or worse",
                  all=[KNOWN()], any=[P("deep_rapid_breathing"), P("dehydration"), DROWSY()], ref_id="REF-DM-ACU-PAED-DKA"),
      "high", "immediate", ["capillary_glucose", "bohb", "urine_ketones", "venous_ph"], ["Gastroenteritis", "Sepsis", "Malaria"], "A9-23", "DM-ACU-ROUTE",
      lane="acute_route", ageBands=CHILD, notes="Vomiting or abdominal pain alone in a child with diabetes is rule 23 (ketones today), not an interrupt.",
      proposal={"kind": "acute.route", "to": "triage", "tier": "now"})
tag(REG["rules"][-1], "J06")

# ── J07  foot referrals 'always' only for limb and sight threats ────────────
for _sid in ("DM-ACT-REFER-FOOT-02", "DM-ACT-REFER-CHARCOT-01"):
    tag(item("management", _sid), "J07")["x"]["runWhenOverride"] = "established_or_met"

# ── J08, J09  hypoglycaemia interrupts once, and only on the medicines that cause it
_r = tag(item("rules", "DM-ACU-ROUTE-07"), "J08", "J09")
_drop_preds(_r["when"], "dm_status")
_r["display"] = "Glucose below 3.9 mmol/L on insulin or a sulfonylurea, or with type 1 diabetes: hypoglycaemia, and it can come back"
_r["when"]["label"] = "Any glucose below 3.9 mmol/L, in a person on insulin or a sulfonylurea or with type 1 diabetes"
_r["x"]["notWhen"] = [crit("acu_hypo_l1_l2", "Any glucose below 3.0 mmol/L or a meter reading LO (rule 06 interrupts)",
                           any=GLU("REF-DM-HYPO-L2", "<") + [P("glucose_meter_extreme", "==", "lo")], ref_id="REF-DM-HYPO-L2")]
drule("DM-ACU-ROUTE-26", "Glucose below 3.9 mmol/L in diabetes, not on insulin or a sulfonylurea: recheck today and look for another cause",
      "hypoglycaemia", crit("acu_hypo_other", "Known diabetes, not on insulin or a sulfonylurea, without type 1 recorded, with any glucose below 3.9 mmol/L",
                            all=[KNOWN()], any=GLU("REF-DM-HYPO-L1", "<"), ref_id="REF-DM-HYPO-L1",
                            needs="ADA defines the level; the response for a person on medicines that rarely cause it is a pack rule (D-DM-37)."),
      "moderate", "same_day", ["capillary_glucose"], ["Alcohol", "Missed meals", "Another glucose-lowering medicine not on the list", "Kidney or liver failure", "Sepsis"], "A4-14", "DM-ACU-ROUTE",
      lane="acute_route", ageBands=ADULT, proposal={"kind": "test.repeat", "test": "test.glucose_capillary", "tier": "today"})
last("rules", "J08")["x"]["notWhen"] = [crit("acu_hypo_other_isu", "On insulin or a sulfonylurea, or type 1 diabetes recorded (rule 07 applies)", any=ISU() + [P("dm_type_recorded", "==", "type_1")], ref_id="REF-DM-HYPO-L1"),
                                        crit("acu_hypo_other_l2", "Any glucose below 3.0 mmol/L or a meter reading LO (rule 06 interrupts)", any=GLU("REF-DM-HYPO-L2", "<") + [P("glucose_meter_extreme", "==", "lo")], ref_id="REF-DM-HYPO-L2")]
tag(item("rules", "DM-ACU-ROUTE-11"), "J09")["x"].setdefault("notWhen", []).append(
    crit("acu_picture_r02", "Urine ketones 2+ or more, or blood ketones 3.0 mmol/L or more (rule 02 interrupts)", any=[KET2(), P("bohb", ">=", ref="REF-DM-ACU-DKA-BOHB")], ref_id="REF-DM-ACU-DKA-BOHB"))

# ── J12  a proposed target never contradicts the tier already agreed ───────
OTHER_TIER = lambda keep: crit(f"tier_not_{keep or 'any'}", "A different glycaemic target tier has already been agreed" if keep else "A glycaemic target tier has already been agreed",
                               all=[P("glycaemic_target_tier", "in", [t for t in ("general", "relaxed", "tight", "avoid_symptoms") if t != keep])], ref_id="REF-DM-CTRL-HBA1C-TARGET")
for _tid, _keep in (("tgt_hba1c_general", "general"), ("tgt_hba1c_relaxed", "relaxed"), ("tgt_hba1c_older_healthy", None)):
    tag(item("targets", _tid), "J12")["x"].setdefault("notWhen", []).append(OTHER_TIER(_keep))

# ── J13  an examination that was not attempted leaves the eye check due ────
_s = tag(item("management", "DM-ACT-SCREEN-EYE-01"), "J13")
_s["when"]["any"].append(P("retina_view", "==", "not_attempted"))
_s["when"]["label"] = "Confirmed diabetes, with no retinal examination ever, 24 months or more since the last, a last examination that was undilated direct ophthalmoscopy, or a view that was inadequate or not attempted"

# ── J14  glucose 18 or more with ketones not raised (WHO PEN) ──────────────
step("DM-ACT-REFER-GLU-02", "Glucose 18 mmol/L or more without ketoacidosis: same-day review by a clinician who can start or change treatment (WHO PEN refers all such patients to hospital)",
     crit("ref_glu18_pen", "Any glucose 18 mmol/L or more or a meter reading HI, with a ketone result below 2+ (or blood ketones below 3.0 mmol/L)",
          any=GLU("REF-DM-ACU-KETONE-TEST-GLU") + [HI()], atLeast=(1, [P("urine_ketones", "in", ["neg", "trace", "1plus"]), P("bohb", "<", ref="REF-DM-ACU-DKA-BOHB")]), ref_id="REF-DM-ACU-KETONE-TEST-GLU"),
     "A9-48", "refer", "DM-ACT-REFER", urgency="same_day", ages="any",
     proposal={"kind": "refer", "to": "clinician_who_can_start_insulin", "tier": "today"},
     note="WHO HEARTS-D refers at this level only when not improving on tablets (DM-ACT-REFER-GLU-01); WHO PEN refers all. D-DM-38 chooses; the recommendation is PEN, because the tablets box is usually blank.")
_s = tag(REG["management"][-1], "J14"); _s["x"]["runWhenOverride"] = "always"; _s["x"]["enabled"] = True; _s["x"]["enabledBy"] = "D-DM-38"
_s["x"]["notWhen"] = [crit("ref_glu18_pen_r01", "Above target despite taking the tablets is recorded (DM-ACT-REFER-GLU-01 applies)", all=[P("glucose_goal_unmet_on_oral")], ref_id="REF-DM-ACT-REFER-SAMEDAY")]

# ── J15  blood pressure in pregnancy (UCG 2023 16.3.7) ─────────────────────
drule("DM-ACU-ROUTE-27", "Pregnant, with blood pressure 140/90 or more: assess for pre-eclampsia today (urine protein). Any pre-eclampsia is referred to hospital",
      "pre_eclampsia", crit("acu_preg_bp", "Pregnant, with systolic 140 mmHg or more or diastolic 90 mmHg or more",
                            all=[P("pregnant")], any=[P("bp_systolic", ">=", ref="REF-DM-PREG-BP-SBP"), P("bp_diastolic", ">=", ref="REF-DM-PREG-BP-DBP")], ref_id="REF-DM-PREG-BP-SBP"),
      "moderate", "same_day", ["urine_protein_strip"], ["Chronic hypertension (before 20 weeks)", "White-coat raised reading (repeat)"], "UCG-PE-03", "DM-ACU-ROUTE", lane="acute_route",
      notes="UCG 2023 16.3.7: 140 to 159 / 90 to 109 with 1+ proteinuria or more is pre-eclampsia, and any case is referred to hospital. The hypertension pack will own this.",
      proposal={"kind": "test.order", "test": "test.urinalysis_dipstick", "tier": "today"})
last("rules", "J15")["x"]["notWhen"] = [crit("acu_preg_bp_severe", "Systolic 160 mmHg or more or diastolic 110 mmHg or more (rule 28 interrupts)",
                                             any=[P("bp_systolic", ">=", ref="REF-DM-PREG-BP-SEVERE-SBP"), P("bp_diastolic", ">=", ref="REF-DM-PREG-BP-SEVERE-DBP")], ref_id="REF-DM-PREG-BP-SEVERE-SBP")]
drule("DM-ACU-ROUTE-28", "Pregnant, with blood pressure 160/110 or more: acute severe hypertension. Route now; refer to hospital",
      "pre_eclampsia", crit("acu_preg_bp_sev", "Pregnant, with systolic 160 mmHg or more or diastolic 110 mmHg or more",
                            all=[P("pregnant")], any=[P("bp_systolic", ">=", ref="REF-DM-PREG-BP-SEVERE-SBP"), P("bp_diastolic", ">=", ref="REF-DM-PREG-BP-SEVERE-DBP")], ref_id="REF-DM-PREG-BP-SEVERE-SBP"),
      "high", "immediate", ["urine_protein_strip"], ["Chronic hypertension (still refer)"], "UCG-PE-02", "DM-ACU-ROUTE", lane="acute_route",
      notes="UCG 2023 16.3.7 table: severe pre-eclampsia is acute severe hypertension (160/110) with 1+ proteinuria; 4.1.6.1 lists eclampsia and pre-eclampsia among hypertensive emergencies. The interrupt does not wait for the urine.",
      proposal={"kind": "acute.route", "to": "triage", "tier": "now"})
tag(REG["rules"][-1], "J15")

# ── J17  a district fasting meter reading in the intermediate range ─────────
drule("DM-SUS-INCID-04", "A fasting capillary glucose of 6.1 to below 7.0 mmol/L: repeat fasting on another day, and offer a 2-hour OGTT where one can be done",
      "diabetes_undiagnosed", crit("sus_fcap_ifg", "A fasting capillary glucose of 6.1 mmol/L or more and below 7.0 mmol/L",
                                   all=[P("capillary_glucose_context", "==", "fasting"), P("capillary_glucose", ">=", ref="REF-DM-IH-IFG-WHO"), P("capillary_glucose", "<", ref="REF-DM-DX-FPG")], ref_id="REF-DM-IH-IFG-WHO",
                                   needs="WHO's intermediate range is for plasma; reading it from a meter follows D-DM-04."),
      "low", "routine", ["fasting_pg", "ogtt_2h_pg"], ["Not truly fasting", "Meter error near the threshold"], "A2-10", "DM-SUS-INCID", lane="suspect", ageBands=ADULT,
      notes="A fasting value in this range neither diagnoses nor excludes diabetes; in African cohorts the OGTT finds cases a fasting value misses (D-DM-06).",
      proposal={"kind": "test.repeat", "test": "test.glucose_fasting", "tier": "routine"})
tag(REG["rules"][-1], "J17")

# ── J18  hypertensive emergency (UCG 2023 4.1.6.1) ─────────────────────────
drule("DM-ACU-ROUTE-29", "Blood pressure above 180/110 with drowsiness or worse, chest pain or stroke signs: hypertensive emergency. Route now",
      "hypertensive_emergency", crit("acu_htn_emerg", "Systolic above 180 mmHg or diastolic above 110 mmHg, with drowsiness or worse, or chest pain, or sudden weakness, speech or facial change",
                                     any=[P("bp_systolic", ">", ref="REF-DM-ACU-BP-EMERG-SBP"), P("bp_diastolic", ">", ref="REF-DM-ACU-BP-EMERG-DBP")],
                                     atLeast=(1, [DROWSY(), P("chest_pain_or_stroke_symptoms")]), ref_id="REF-DM-ACU-BP-EMERG-SBP"),
      "high", "immediate", ["bp_systolic", "bp_diastolic"], ["Stroke with reactive hypertension (do not lower aggressively)", "Pain"], "UCG-HTN-03", "DM-ACU-ROUTE", lane="acute_route",
      notes="UCG 2023 4.1.6.1. Headache alone is recorded in 'hypertensive symptoms', which does not separate encephalopathy from an ordinary headache, so it does not interrupt here. UCG admits above 180/110 even without organ damage (urgency): D-DM-39.",
      proposal={"kind": "acute.route", "to": "triage", "tier": "now"})
tag(REG["rules"][-1], "J18")

# ── J19  'recorded' is scoped to this encounter ────────────────────────────
RECORDED_RULE = ("The `recorded` operator and every 'a result is already recorded' stop condition mean recorded AT THIS ENCOUNTER. A glucose from last month does not stand down "
                 "the coma interrupt. Design B carries the time scope; the catalog grammar assumes the encounter's capture (fourth review, J19).")

# ── J20  restricted classes never ride in a proposal code ──────────────────
for _s in REG["management"]:
    _p = _s["x"].get("proposal") or {}
    if _p.get("restrictedClass"):
        tag(_s, "J20")["x"]["neutralProposal"] = {**{k: v for k, v in _p.items() if k not in ("test", "topic", "restrictedClass")}, "code": "programme_review"}

# ── minors ─────────────────────────────────────────────────────────────────
tag(item("management", "DM-ACT-REFER-BP-01"), "J21")["display"] = "Systolic above 200 or diastolic above 110 mmHg in diabetes: same-day referral"
_r = tag(item("rules", "DM-CLS-T1-01"), "J22"); _drop_preds(_r["when"], "dm_status")
_r["when"]["label"] = "Urine ketones 2+ or more now, with any glucose 11.1 mmol/L or more, or a meter reading HI"
_s = tag(item("management", "DM-ACT-REFER-TARGET-02"), "J23")
_s["when"]["all"].append(P("dm_type_recorded", "==", "type_2")); _s["when"]["label"] = "Type 2 diabetes on insulin, with HbA1c above 7.5%"; _s["x"]["agesOverride"] = "adult"
_r = tag(item("rules", "DM-CLS-DRUG-01"), "J24"); _r["when"]["any"].append(HI())
_r["when"]["label"] = "On systemic steroids, with glucose 11.1 mmol/L or more or a meter reading HI"

# ── decisions this review adds ─────────────────────────────────────────────
k_decisions.D += [
    {"id": "D-DM-38", "title": "Glucose 18 or more without ketoacidosis",
     "question": "Which WHO rule refers a person with a glucose of 18 mmol/L or more whose ketones are not raised?",
     "recommended": "WHO PEN: same-day review for everyone at this level (DM-ACT-REFER-GLU-02).",
     "alternatives": ["WHO HEARTS-D: refer only when not improving on tablets (DM-ACT-REFER-GLU-01 alone)."],
     "why": "The 'not improving on tablets' box is usually blank, so the HEARTS-D rule rarely fires; the fourth review found a glucose of 25 on which nothing fired.",
     "affects": "DM-ACT-REFER-GLU-02", "needsFromCso": None, "decision": None, "signedBy": None, "signedOn": None},
    {"id": "D-DM-39", "title": "Blood pressure above 180/110 without organ damage",
     "question": "UCG 2023 4.1.6.1 admits a hypertensive urgency (above 180/110, no organ damage). The pack refers same day above 200/110 (HEARTS-D). Which applies?",
     "recommended": "UCG 2023: admit above 180/110, as the national text says; the hypertension pack will own it.",
     "alternatives": ["WHO HEARTS-D: same-day referral above 200/110, or above 180/110 with symptoms."],
     "why": "The emergency (with organ damage) interrupts already (DM-ACU-ROUTE-29); this decides the urgency without it.",
     "affects": "DM-ACT-REFER-BP-01, DM-ACT-REFER-BP-02", "needsFromCso": None, "decision": None, "signedBy": None, "signedOn": None},
    {"id": "D-DM-40", "title": "Lower limits for older or high-risk people",
     "question": "A fasting glucose of 4.2 reads 'at target' in a frail 79-year-old on insulin, and a BP of 80/50 has no low band. Supply lower limits?",
     "recommended": "Read ADA Standards of Care section 13 (older adults) for the glucose floor and supply a low BP band from the hypertension pack's source; until then the bands carry no 'at target' below the general range for people on insulin or a sulfonylurea aged 65 or over.",
     "alternatives": ["Leave the bands as they are and rely on the hypoglycaemia risk model beside them."],
     "why": "The pack will not type a number from memory (N2).", "affects": "fpg_control_who, fcap_control_who, bp bands; J10",
     "needsFromCso": "ADA SOC section 13 lower glucose goals for older adults on insulin or a sulfonylurea", "decision": None, "signedBy": None, "signedOn": None},
]

# ── what was done about each finding ───────────────────────────────────────
DISPOSITION.update({
 "J01": (FIXED, "DM-ACU-ROUTE-24 interrupts on Kussmaul breathing or acetone in known diabetes at any glucose; ROUTE-13 keeps only vomiting, pain and dehydration. DMV-84."),
 "J02": (FIXED, "HbA1c no longer silences the symptom rules. DMV-85."),
 "J03": (FIXED, "ROUTE-21 (ketones 0.6 to 1.5 or trace/1+), ROUTE-22 (1.6 to 2.9, urgent) and ROUTE-23 (type 1 or insulin, vomiting, ketones today) close the gap below 2+; the SGLT2 flag reads vomiting, pain and dehydration. A prompt now clears only on a normal ketone result. DMV-86 to DMV-89."),
 "J04": (FIXED, "'established_or_met' reads the non-pregnant set as if pregnancy were answered. DMV-90."),
 "J05": (FIXED, "PAED-03 stands down for a child already diagnosed. DMV-91."),
 "J06": (FIXED, "ROUTE-04 no longer interrupts on known diabetes alone; ROUTE-25 interrupts on signs; ROUTE-23 asks for ketones on vomiting or pain. DMV-92."),
 "J07": (FIXED, "FOOT-02 and CHARCOT-01 run only with diabetes established or met; gangrene, ischaemia and sight loss still run always. DMV-93."),
 "J08": (FIXED, "ROUTE-07 interrupts only on insulin, a sulfonylurea or type 1; ROUTE-26 (same day) covers other diabetes. DMV-94."),
 "J09": (FIXED, "ROUTE-07 stands down below 3.0 (ROUTE-06); ROUTE-11 stands down on ketones in the DKA range (ROUTE-02). DMV-63 now expects one interrupt."),
 "J10": (CSO, "Needs a lower glucose limit from ADA SOC section 13 and a low BP band; the pack will not type one from memory. D-DM-40."),
 "J11": (FIXED, "Steps that ask for less treatment read every value, even under a blocking caveat. DMV-95."),
 "J12": (FIXED, "A target proposal stands down when a different tier is already agreed. DMV-96."),
 "J13": (PART, "'Not attempted' now keeps the eye check due. A retina recorded with no method stays 'insufficient' (DMV-73); a 'method not recorded' prompt needs a not-recorded operator the four-state grammar forbids, so it is Design B's 'never done' logic."),
 "J14": (FIXED, "DM-ACT-REFER-GLU-02 (WHO PEN) refers glucose 18 or more without ketoacidosis the same day, switched by D-DM-38. DMV-97."),
 "J15": (FIXED, "ROUTE-27 (140/90 in pregnancy, same day, urine protein) and ROUTE-28 (160/110, interrupt) from UCG 2023 16.3.7. DMV-98."),
 "J16": (FIXED, "Dark items appear only as dark. DMV-71 now expects RX-02 dark, not withheld."),
 "J17": (FIXED, "DM-SUS-INCID-04: fasting meter 6.1 to 6.9 asks for a repeat and an OGTT where possible. DMV-99."),
 "J18": (FIXED, "DM-ACU-ROUTE-29 interrupts above 180/110 with drowsiness, chest pain or stroke signs (UCG 4.1.6.1); the urgency threshold is D-DM-39. DMV-100."),
 "J19": (FIXED, "'Recorded' is defined as recorded at this encounter; Design B carries the time scope."),
 "J20": (FIXED, "Proposals that name a restricted class carry a neutral proposal code."),
 "J21": (FIXED, "BP-01's display states both arms."),
 "J22": (FIXED, "T1-01 needs a raised glucose or HI; known diabetes alone no longer suggests type 1."),
 "J23": (FIXED, "REFER-TARGET-02 is for adults with type 2 diabetes."),
 "J24": (FIXED, "DRUG-01 reads a meter HI."),
 "J25": (FIXED, "A child has pregnancy 'not possible'."),
 "J26": ("phase_0", "Not changed: a blocked HbA1c still counts as the 'second result' that stops INCID-02. Engine presentation in Phase 3 must show the value as blocked."),
 "J27": ("no_change", "Dehydration is a sign that justifies an interrupt (N13)."),
 "J28": ("no_change", "An unresponsive person with nothing known belongs to triage's glucose-first rule, not the NCD engine (I4)."),
 "J29": ("no_change", "Harmless dead overrides; left for tidying."),
 "J30": ("phase_0", "Display: a classification shown on every diabetic. Engine presentation in Phase 3."),
 "J31": ("phase_0", "Display: the baseline risk band beside a reading taken today. Engine presentation in Phase 3."),
})
