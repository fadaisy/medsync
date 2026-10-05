"""Fifth review (phase-1/r5/R5-review.json, K01 to K25): an independent read of
the answers to the fourth. It found 5 critical and 12 major problems, three of the
criticals introduced by those answers (K01, K04, K05). Each fix below is tagged
with its finding id and has a patient in k_r5_vignettes (DMV-101 onward).
"""
import json
from lib import P, crit, FEATURES
from k_model import REG, drule
from k_review import (tag, item, last, nref, GLU, GLU_REC, KET_REC, KNOWN, ISU, SU, GLT, HI, DROWSY, SIGNS, MILD, KET2,
                      ADULT, CHILD, DISPOSITION, FIXED, N)
import k_r4, k_clerk, k_decisions

PART = "fixed_in_part"; CSO = "cso_decision"
T1 = lambda: P("dm_type_recorded", "==", "type_1")
SGLT2 = lambda: GLT("sglt2_inhibitor")
DM_CONTEXT = lambda: [KNOWN(), HI(), SGLT2(), T1()] + ISU() + GLU("REF-DM-ACU-DKA-GLU")   # diabetes at any glucose, or a raised glucose
ILL = lambda: [P("vomiting"), P("abdominal_pain"), P("acute_illness_current"), P("dehydration")]
NOT_ISU = lambda: [P("glucose_lowering_therapy", "!=", v) for v in ("insulin", "glibenclamide", "gliclazide", "glimepiride")]
BOHB_NORMAL = lambda cid: crit(cid, "Blood ketones below 0.6 mmol/L (normal)", all=[P("bohb", "<", ref="REF-DM-ACU-KETONE-LOW")], ref_id="REF-DM-ACU-KETONE-LOW")

# ── K01  ketones in the DKA range reach a rule whatever box was ticked ──────
_r = tag(item("rules", "DM-ACU-ROUTE-02"), "K01")
_r["when"] = crit("acu_ketones", "Urine ketones 2+ or more, or blood ketones 3.0 mmol/L or more; with known diabetes, type 1, insulin, a sulfonylurea or an SGLT2 inhibitor, any glucose 11.1 mmol/L or more, or a meter reading HI",
                  any=[KET2(), P("bohb", ">=", ref="REF-DM-ACU-DKA-BOHB")], atLeast=(1, DM_CONTEXT()), ref_id="REF-DM-ACU-DKA-BOHB")
_r = tag(item("rules", "DM-ACU-ROUTE-24"), "K01")
_r["when"]["atLeast"]["of"] += [SGLT2(), T1()]
_r["when"]["label"] = "Known diabetes, type 1, or on insulin, a sulfonylurea or an SGLT2 inhibitor; with deep rapid breathing or acetone on the breath"

# ── K02  only a blood ketone result stands down the SGLT2 interrupt ────────
_r = tag(item("rules", "DM-ACU-ROUTE-03"), "K02")
_r["x"]["notWhen"] = [BOHB_NORMAL("acu_edka_bohb_normal")]
_r["notes"] = (_r.get("notes") or "") + " A urine strip never stands this down: strips underestimate ketonaemia early (REF-DM-VAL-URINE-KETONE). Only a blood ketone below 0.6 does (fifth review, K02)."

_r["x"]["notWhen"].append(crit("acu_edka_r02", "Urine ketones 2+ or more, or blood ketones 3.0 mmol/L or more (rule 02 interrupts)", any=[KET2(), P("bohb", ">=", ref="REF-DM-ACU-DKA-BOHB")], ref_id="REF-DM-ACU-DKA-BOHB"))

# ── K03  ketones 1.6 to 2.9 are same day, and an interrupt with vomiting ───
_r = tag(item("rules", "DM-ACU-ROUTE-22"), "K03"); _r["urgency"] = "same_day"
_r["when"]["atLeast"]["of"] = DM_CONTEXT()
_r["x"]["notWhen"] = [crit("acu_ketones_risk_vomit", "Vomiting (rule 30 interrupts)", all=[P("vomiting")], ref_id="REF-DM-ACU-SICKDAY-INSULIN")]
drule("DM-ACU-ROUTE-30", "Blood ketones 1.6 to below 3.0 mmol/L with vomiting, in diabetes: ketoacidosis is developing and fluids cannot be kept down. Route now",
      "dka", crit("acu_ketones_risk_vomiting", "Blood ketones 1.6 to below 3.0 mmol/L, with vomiting; in known diabetes, type 1, on insulin, a sulfonylurea or an SGLT2 inhibitor, or with any glucose 11.1 mmol/L or more or a meter reading HI",
                  all=[P("bohb", ">=", ref="REF-DM-ACU-KETONE-RISK"), P("bohb", "<", ref="REF-DM-ACU-DKA-BOHB"), P("vomiting")], atLeast=(1, DM_CONTEXT()), ref_id="REF-DM-ACU-KETONE-RISK",
                  needs="ISPAD: seek urgent advice when vomiting or when ketones stay raised; making ketones 1.6 to 2.9 with vomiting an interrupt is a pack rule (D-DM-37)."),
      "high", "immediate", ["venous_ph", "bicarbonate"], ["Starvation ketosis", "Gastroenteritis in a person without diabetes"], "A9-50", "DM-ACU-ROUTE", lane="acute_route",
      proposal={"kind": "acute.route", "to": "triage", "tier": "now"})
tag(REG["rules"][-1], "K03")

# ── K04  a blank medicine list is not 'not on insulin'; low glucose with a low conscious level interrupts
_r = tag(item("rules", "DM-ACU-ROUTE-07"), "K04")
_r["when"]["atLeast"]["of"].append(KNOWN())
_r["when"]["label"] = "Any glucose below 3.9 mmol/L, on insulin or a sulfonylurea, with type 1 diabetes, or with known diabetes"
_r["x"]["notWhen"].append(crit("acu_hypo_l1_list_clear", "A recorded medicine list with no insulin or sulfonylurea, and a recorded type that is not type 1 (rule 26 applies)",
                               all=NOT_ISU() + [P("dm_type_recorded", "!=", "type_1")], ref_id="REF-DM-HYPO-L1"))
_r = tag(item("rules", "DM-ACU-ROUTE-26"), "K04")
_r["when"] = crit("acu_hypo_other", "Known diabetes, a recorded medicine list with no insulin or sulfonylurea, a recorded type that is not type 1, and any glucose below 3.9 mmol/L",
                  all=[KNOWN(), P("dm_type_recorded", "!=", "type_1")] + NOT_ISU(), any=GLU("REF-DM-HYPO-L1", "<"), ref_id="REF-DM-HYPO-L1",
                  needs="ADA defines the level; the response for a person on medicines that rarely cause it is a pack rule (D-DM-37).")
_r["x"]["notWhen"] = [k for k in _r["x"]["notWhen"] if k["id"] != "acu_hypo_other_isu"]
drule("DM-ACU-ROUTE-31", "Glucose below 3.9 mmol/L with drowsiness or worse: severe hypoglycaemia until proved otherwise. Route now",
      "hypoglycaemia", crit("acu_hypo_drowsy", "Any glucose below 3.9 mmol/L, with drowsiness or worse", all=[DROWSY()], any=GLU("REF-DM-HYPO-L1", "<"), ref_id="REF-DM-HYPO-L3"),
      "high", "immediate", ["capillary_glucose"], ["Stroke", "Sepsis", "Alcohol", "Head injury"], "A4-14", "DM-ACU-ROUTE", lane="acute_route",
      notes="ADA level 3 is defined by altered mental or physical state needing help, whatever the number. Any age, any medicine list.",
      proposal={"kind": "acute.route", "to": "triage", "tier": "now"})
last("rules", "K04")["x"]["notWhen"] = [
    crit("acu_hypo_drowsy_r06", "Any glucose below 3.0 mmol/L or a meter reading LO (rule 06 interrupts)", any=GLU("REF-DM-HYPO-L2", "<") + [P("glucose_meter_extreme", "==", "lo")], ref_id="REF-DM-HYPO-L2"),
    crit("acu_hypo_drowsy_r07", "On insulin or a sulfonylurea, type 1, or known diabetes without a medicine list that excludes them (rule 07 interrupts)", any=ISU() + [T1()], ref_id="REF-DM-HYPO-L1")]

# ── K05  a child on insulin or with diabetes is asked for a glucose ─────────
drule("DM-ACU-ROUTE-32", "A child with diabetes or on insulin, vomiting or with abdominal pain, and no glucose on record: capillary glucose and ketones now",
      "dka", crit("acu_paed_known_sick", "A child with known diabetes, type 1, or on insulin; with vomiting or abdominal pain",
                  any=MILD(), atLeast=(1, [KNOWN(), T1(), GLT("insulin")]), ref_id="REF-DM-ACU-PAED-DKA",
                  needs="NICE NG18 and ISPAD: test glucose and ketones in an unwell child with diabetes; 'now' when nothing is measured is a pack rule (D-DM-37)."),
      "high", "immediate", ["capillary_glucose", "bohb", "urine_ketones"], ["Gastroenteritis", "Malaria", "Appendicitis"], "A9-23", "DM-ACU-ROUTE",
      lane="acute_route", ageBands=CHILD, proposal={"kind": "test.order", "test": ["test.glucose_capillary", "test.ketones"], "tier": "now"})
last("rules", "K05")["x"]["notWhen"] = [crit("acu_paed_known_sick_done", "A glucose is already recorded (the other rules read it)", any=GLU_REC(), ref_id="REF-DM-ACU-PAED-DKA")]
tag(item("rules", "DM-ACU-ROUTE-23"), "K05", "K21")["display"] = "Type 1 diabetes or on insulin, with vomiting or abdominal pain and no ketone result: check ketones today, whatever the glucose"
tag(item("management", "DM-ACT-REFER-GLU-02"), "K05")["x"]["agesOverride"] = "any"

# ── K06  intermediate ketones only matter in illness or a high glucose ──────
ILL_OR_HIGH = lambda: ILL() + GLU("REF-DM-ACU-KETONE-TEST-GLU") + [HI()]
_r = tag(item("rules", "DM-ACU-ROUTE-21"), "K06")
_r["display"] = "Urine ketones trace or 1+ in diabetes, when unwell or with glucose 18 or more: blood ketones or a repeat strip within 2 hours, and contact the diabetes team today"
_r["when"] = crit("acu_ketones_mid", "Urine ketones trace or 1+, in known diabetes, type 1, or on insulin, a sulfonylurea or an SGLT2 inhibitor; with vomiting, abdominal pain, acute illness, dehydration, any glucose 18 mmol/L or more, or a meter reading HI",
                  all=[P("urine_ketones", "in", ["trace", "1plus"])], any=ILL_OR_HIGH(), atLeast=(1, [KNOWN(), T1(), SGLT2()] + ISU()), ref_id="REF-DM-VAL-URINE-KETONE",
                  needs="Strips underestimate ketonaemia early (REF-DM-VAL-URINE-KETONE); acting on trace and 1+ when unwell is a pack rule (D-DM-37).")
_r["x"]["notWhen"] = [BOHB_NORMAL("acu_ketones_mid_bohb_normal"),
                      crit("acu_ketones_mid_bohb_high", "Blood ketones 0.6 mmol/L or more (rules 21B, 22, 30 and 02 read the blood value)", all=[P("bohb", ">=", ref="REF-DM-ACU-KETONE-LOW")], ref_id="REF-DM-ACU-KETONE-LOW")]
drule("DM-ACU-ROUTE-21B", "Blood ketones 0.6 to below 1.6 mmol/L in diabetes, when unwell or with glucose 18 or more: recheck within 2 hours and contact the diabetes team today",
      "dka", crit("acu_bohb_mid", "Blood ketones 0.6 to below 1.6 mmol/L, in known diabetes, type 1, or on insulin, a sulfonylurea or an SGLT2 inhibitor; with vomiting, abdominal pain, acute illness, dehydration, any glucose 18 mmol/L or more, or a meter reading HI",
                  all=[P("bohb", ">=", ref="REF-DM-ACU-KETONE-LOW"), P("bohb", "<", ref="REF-DM-ACU-KETONE-RISK")], any=ILL_OR_HIGH(), atLeast=(1, [KNOWN(), T1(), SGLT2()] + ISU()), ref_id="REF-DM-ACU-KETONE-LOW"),
      "moderate", "same_day", ["bohb"], ["Starvation ketosis"], "A9-51", "DM-ACU-ROUTE", lane="acute_route",
      notes="Trend UK: 0.6 to 1.5, retest in 2 hours. Illness or a high glucose is what makes it worth acting on today; in a well clinic patient it is not.",
      proposal={"kind": "test.repeat", "test": "test.ketones", "tier": "today"})
tag(REG["rules"][-1], "K06")

# ── K07  'without ketoacidosis' only where there is none ───────────────────
_s = tag(item("management", "DM-ACT-REFER-GLU-02"), "K07", "K19", "K25")
_s["display"] = "Glucose 18 mmol/L or more with ketones below the danger range: same-day review by a clinician who can start or change treatment (WHO PEN refers all such patients to hospital)"
_s["x"]["notWhen"] += [crit("ref_glu18_pen_ket", "Blood ketones 1.6 mmol/L or more, urine ketones 2+ or more, or deep breathing, acetone, dehydration or drowsiness (an acute rule applies)",
                            any=[P("bohb", ">=", ref="REF-DM-ACU-KETONE-RISK"), KET2()] + SIGNS(), ref_id="REF-DM-ACU-KETONE-RISK"),
                       crit("ref_glu18_pen_preg", "Pregnant (the pregnancy rules refer today)", all=[P("pregnant")], ref_id="REF-DM-ACU-KETONE-TEST-GLU"),
                       crit("ref_glu18_pen_inpt", "Already an inpatient", all=[P("care_setting", "==", "inpatient")], ref_id="REF-DM-ACU-KETONE-TEST-GLU")]
_s["x"]["enabled"] = False      # K19: dark until D-DM-38 is signed, like every other decision-gated item

# ── K08  one interrupt per event ───────────────────────────────────────────
tag(item("rules", "DM-ACU-ROUTE-29"), "K08")["x"]["notWhen"] = [
    crit("acu_htn_emerg_r17", "Chest pain, or sudden weakness, speech or facial change (rule 17 interrupts)", all=[P("chest_pain_or_stroke_symptoms")], ref_id="REF-DM-ACU-BP-EMERG-SBP"),
    crit("acu_htn_emerg_r28", "Pregnant (rule 28 interrupts)", all=[P("pregnant")], ref_id="REF-DM-ACU-BP-EMERG-SBP")]
tag(item("rules", "DM-ACU-ROUTE-15"), "K08")["x"]["notWhen"].append(crit("acu_paed_glucose_known", "Known diabetes (rule 25 interrupts)", all=[KNOWN()], ref_id="REF-DM-SUS-PAED-MIMIC"))
tag(item("rules", "DM-ACU-ROUTE-25"), "K08").setdefault("x", {}).setdefault("notWhen", []).append(
    crit("acu_paed_known_signs_r04", "Any glucose above 11 mmol/L or a meter reading HI (rule 04 interrupts)", any=GLU("REF-DM-ACU-PAED-GLU", ">") + [HI()], ref_id="REF-DM-ACU-PAED-GLU"))
tag(item("rules", "DM-ACU-ROUTE-01"), "K08")["x"]["notWhen"].append(crit("acu_glu18_signs", "Deep breathing, acetone on the breath, dehydration or drowsiness (an interrupting rule applies)", any=SIGNS(), ref_id="REF-DM-ACU-REFER-ALL"))

# ── K09  ROUTE-04's label says what it tests ───────────────────────────────
tag(item("rules", "DM-ACU-ROUTE-04"), "K09")["when"]["label"] = ("Any of vomiting, abdominal pain, deep rapid breathing, dehydration, drowsiness or worse; with at least one of: thirst, passing a lot of urine, "
                                                                "weight loss, new bed-wetting, any glucose above 11 mmol/L, a meter reading HI")

# ── K10  UCG's emergency list as a finding of its own ──────────────────────
N("hypertensive_organ_damage", "With the raised pressure: confusion, seizures or new loss of vision; breathlessness with crackles; little or no urine; or tearing chest or back pain",
  "sign", "boolean", FEATURES["hypertensive_symptoms"]["section"])
FEATURES["hypertensive_organ_damage"]["x"]["note"] = "UCG 2023 4.1.6.1's acute life-threatening complications, kept apart from ordinary headache so that it can interrupt (fifth review, K10)."
_r = tag(item("rules", "DM-ACU-ROUTE-29"), "K10")
_r["when"]["atLeast"]["of"].append(P("hypertensive_organ_damage"))
_r["when"]["label"] = "Systolic above 180 mmHg or diastolic above 110 mmHg, with drowsiness or worse, chest pain or stroke signs, or signs of acute organ damage (confusion, seizures, visual loss, pulmonary oedema, little urine, tearing pain)"
_r["display"] = "Blood pressure above 180/110 with drowsiness, organ-damage signs, chest pain or stroke signs: hypertensive emergency. Route now"

# ── K11  pregnancy BP: gestation, postpartum, and clearing on a negative urine
nref("REF-DM-PREG-PE-POSTPARTUM", "UCG 2023: pre-eclampsia can present as late as this many weeks postpartum", 6, "weeks", ["UCG-PE-04"], "pregnancy")
PREG_OR_PP = lambda: [P("pregnant"), P("postpartum_weeks", "<=", ref="REF-DM-PREG-PE-POSTPARTUM")]
_r = tag(item("rules", "DM-ACU-ROUTE-27"), "K11")
_r["display"] = "Pregnant or within 6 weeks of birth, with blood pressure 140/90 or more: urine protein today. Protein from 20 weeks is pre-eclampsia (refer to hospital); before 20 weeks it is chronic hypertension"
_r["when"] = crit("acu_preg_bp", "Pregnant or within 6 weeks postpartum, with systolic 140 mmHg or more or diastolic 90 mmHg or more",
                  any=[P("bp_systolic", ">=", ref="REF-DM-PREG-BP-SBP"), P("bp_diastolic", ">=", ref="REF-DM-PREG-BP-DBP")], atLeast=(1, PREG_OR_PP()), ref_id="REF-DM-PREG-BP-SBP")
_r["x"]["notWhen"].append(crit("acu_preg_bp_neg", "Urine protein recorded negative at this visit (the hypertension pack owns the follow-up)", all=[P("urine_protein_strip", "==", "neg")], ref_id="REF-DM-PREG-BP-SBP"))
_r = tag(item("rules", "DM-ACU-ROUTE-28"), "K11")
_r["when"] = crit("acu_preg_bp_sev", "Pregnant or within 6 weeks postpartum, with systolic 160 mmHg or more or diastolic 110 mmHg or more",
                  any=[P("bp_systolic", ">=", ref="REF-DM-PREG-BP-SEVERE-SBP"), P("bp_diastolic", ">=", ref="REF-DM-PREG-BP-SEVERE-DBP")], atLeast=(1, PREG_OR_PP()), ref_id="REF-DM-PREG-BP-SEVERE-SBP")
_r["display"] = "Pregnant or within 6 weeks of birth, with blood pressure 160/110 or more: acute severe hypertension. Route now; refer to hospital"

# ── K12, K15  pregnancy scope ──────────────────────────────────────────────
tag(item("rules", "DM-SUS-INCID-04"), "K12").setdefault("x", {}).setdefault("notWhen", []).append(
    crit("sus_fcap_ifg_preg", "Pregnant (the pregnancy rules apply)", all=[P("pregnant")], ref_id="REF-DM-IH-IFG-WHO"))
tag(item("management", "DM-ACT-SCREEN-PREG-01"), "K15")["x"].setdefault("notWhen", []).append(
    crit("screen_preg_gdm", "Gestational diabetes recorded (diabetes that began in this pregnancy)", all=[P("dm_type_recorded", "==", "gestational")], ref_id="REF-DM-PREG-GDM-FPG"))

# ── K13  targets follow the tier, and an older adult gets one ──────────────
_t = tag(item("targets", "tgt_hba1c_relaxed"), "K13")
_t["when"]["any"].append(P("glycaemic_target_tier", "==", "relaxed"))
_t["when"]["label"] = "Confirmed diabetes, with a relaxed target agreed, or any of: frailty, serious comorbidity or limited life expectancy; cognitive impairment; a significant low in the last year (needing help, a reading below 3.0, or repeated); impaired awareness of lows (Gold score 4 or more)"
tag(item("targets", "tgt_hba1c_general"), "K13")["x"]["notWhen"].append(
    crit("tgt_general_older", "Aged 65 or over (the older-adult target applies)", all=[P("age_years", ">=", ref="REF-DM-CTRL-OLDER-AGE")], ref_id="REF-DM-CTRL-OLDER-AGE"))

# ── K14  the less-treatment exemption does not read an invalid HbA1c ───────
tag(item("management", "DM-ACT-RX-11"), "K14")["x"]["lessTreatment"] = False
EVALUATOR_NOTES = k_r4.EVALUATOR_NOTES + [
    "K14: a routine step that would fire but for a value under a blocking caveat reports that value as a named gap ('cannot be used for this patient'), instead of staying silent or reading it.",
    "K11/K24: 'child' (pregnancy not possible) is the neonate, infant and child bands; the platform's child band ends before 10 years.",
]

# ── K16, K17  definitions emitted, proposals neutral everywhere ────────────
SEMANTICS = {
    "recorded": k_r4.RECORDED_RULE,
    "evaluator": EVALUATOR_NOTES,
    "patientFacing": "No catalog string is patient-facing. A surface without a restricted class shows `neutralDisplay` / `neutralAction` / `neutralAlternative` / `neutralProposal` and nothing else from that item (fifth review, K17).",
}
for _ec in k_clerk.ENGINE_CHANGES:
    if '"recorded"' in json.dumps(_ec): _ec["recordedScope"] = "at this encounter (fourth review, J19)"

for _r in REG["rules"]:      # J20 reached management steps only; rules carry restricted proposals too
    _p = _r["x"].get("proposal") or {}
    if _p.get("restrictedClass") and not _r["x"].get("neutralProposal"):
        tag(_r, "K17")["x"]["neutralProposal"] = {**{k: v for k, v in _p.items() if k not in ("test", "topic", "restrictedClass")}, "code": "programme_review"}

# ── minors ─────────────────────────────────────────────────────────────────
tag(item("rules", "DM-CLS-T1-01"), "K18")["display"] = "Ketones 2+ with a raised glucose: features of insulin deficiency. Do not assume type 2; consider type 1 and review the type"

k_decisions.D[-3]["recommended"] += " Dark until signed."

DISPOSITION.update({
 "K01": (FIXED, "ROUTE-02 and ROUTE-24 read type 1, insulin, a sulfonylurea and an SGLT2 inhibitor as diabetes at any glucose. DMV-101, DMV-102."),
 "K02": (FIXED, "ROUTE-03 stands down only on a blood ketone below 0.6; a strip never clears it. DMV-88 corrected; DMV-103."),
 "K03": (FIXED, "ROUTE-22 is same day; ROUTE-30 interrupts on ketones 1.6 to 2.9 with vomiting. DMV-86 corrected."),
 "K04": (FIXED, "ROUTE-07 interrupts in known diabetes unless a recorded list excludes insulin and sulfonylureas and the type is recorded as not type 1; ROUTE-26 needs that recorded list; ROUTE-31 interrupts on a glucose below 3.9 with drowsiness. DMV-104, DMV-105."),
 "K05": (FIXED, "ROUTE-32 asks for glucose and ketones now in a sick child with diabetes and no glucose; GLU-02 applies at any age. DMV-106."),
 "K06": (FIXED, "ROUTE-21 (urine) and ROUTE-21B (blood 0.6 to 1.5) need illness or a glucose of 18 or more and stand down on a normal blood ketone. DMV-107."),
 "K07": (FIXED, "GLU-02 stands down on ketones of 1.6 or more, 2+, any sign, pregnancy or an inpatient; reworded. DMV-108."),
 "K08": (FIXED, "ROUTE-29 yields to 17 and 28; ROUTE-15 yields to 25 in known diabetes; ROUTE-25 yields to 04 above 11; ROUTE-01 stands down when an interrupt applies. DMV-109."),
 "K09": (FIXED, "ROUTE-04's label says what it tests."),
 "K10": (FIXED, "New finding 'hypertensive_organ_damage' (UCG 4.1.6.1's list) interrupts with BP above 180/110; ordinary headache stays an urgency (D-DM-39). DMV-110."),
 "K11": (FIXED, "ROUTE-27/28 cover 6 weeks postpartum (UCG-PE-04), name chronic hypertension before 20 weeks, and ROUTE-27 clears on a negative urine. DMV-111."),
 "K12": (FIXED, "INCID-04 stands down in pregnancy."),
 "K13": (FIXED, "An agreed relaxed tier proposes the relaxed target; from 65 only the older-adult target is proposed. DMV-96 corrected; DMV-112."),
 "K14": (FIXED, "RX-11 no longer reads an invalid HbA1c; it shows the HbA1c as a named gap instead. DMV-95 corrected."),
 "K15": (FIXED, "SCREEN-PREG-01 stands down for gestational diabetes. DMV-113."),
 "K16": (FIXED, "'Recorded at this encounter' is emitted in catalog/00 (semantics) and on the engine changes that use it."),
 "K17": (FIXED, "neutralProposal is exported to the Design B manifest; the build fails on a restricted proposal with no neutral code; the semantics block says which fields a patient may see."),
 "K18": (FIXED, "T1-01's display no longer says 'in a person with diabetes'."),
 "K19": (FIXED, "GLU-02 is dark until D-DM-38 is signed. DMV-97 now expects it dark."),
 "K20": ("no_change", "Dehydration in a child with diabetes is a sign (N13); a normal ketone does not exclude a falling glucose or sepsis."),
 "K21": (FIXED, "'Never stop insulin' moved from ROUTE-23's display to its note."),
 "K22": ("no_change", "Acetone on the breath is a sign that justifies an interrupt (N13)."),
 "K23": (FIXED, "DMV-92 is banded 'child'; DMV-98 retitled."),
 "K24": (FIXED, "The 'child' bands are stated in the semantics block."),
 "K25": (FIXED, "GLU-02 stands down in pregnancy and for inpatients."),
})
