"""Seventh review (phase-1/r7/R7-review.json, Q01 to Q27). Its 82,160-cell extended
grid found no man below a sensible floor; the criticals were about women
(unanswered postpartum, gestational diabetes, pregnancy-unknown interrupts
outranking measured emergencies), the Design B manifest, a drowsy patient with no
numbers, and pre-eclampsia signs mislabelled. Each fix is tagged; patients in
k_r7_vignettes (DMV-122 onward); the women's grid and order invariants in k_grid.
"""
import copy, json
from lib import P, crit, FEATURES, REFS
from k_model import REG, drule
from k_review import (tag, item, last, GLU, GLU_REC, KET_REC, KNOWN, ISU, GLT, HI, DROWSY, SIGNS, MILD, KET2,
                      ADULT, CHILD, DISPOSITION, FIXED)
import k_r5, k_r6, k_decisions

PART = "fixed_in_part"; CSO = "cso_decision"
T1 = lambda: P("dm_type_recorded", "==", "type_1")
TYPES = ["type_1", "type_2", "unclassified", "other", "gestational"]
DM_ANY = lambda: [KNOWN(), P("dm_type_recorded", "in", TYPES)] + [GLT(t) for t in k_r6.THERAPIES]
DM_WORDS = k_r6.DM_WORDS
PREG_OR_PP = k_r6.PREG_OR_PP
BOHB_NORMAL = lambda cid: crit(cid, "Blood ketones below 0.6 mmol/L (normal)", all=[P("bohb", "<", ref="REF-DM-ACU-KETONE-LOW")], ref_id="REF-DM-ACU-KETONE-LOW")

def _criteria():
    for kind in ("rules", "management", "therapyFlags", "targets", "validityCaveats"):
        for it in REG[kind]:
            yield it["when"]
            for k in it.get("contraindications", []) + it["x"].get("notWhen", []) + it["x"].get("cautions", []): yield k

# ── Q02  gestational diabetes counts as diabetes ───────────────────────────
for _c in _criteria():
    for _k in ("all", "any"):
        for _p in _c.get(_k, []) + (_c.get("atLeast") or {}).get("of", []):
            if _p["feature"] == "dm_type_recorded" and _p["op"] == "in" and _p["value"] == ["type_1", "type_2", "unclassified", "other"]: _p["value"] = list(TYPES)
k_r6.DM_ANY = DM_ANY

# ── Q01, Q03, Q10  unknown pregnancy or postpartum: interrupts only, ranked last, worded as a question
PREG_INTERRUPTS = ("DM-ACU-ROUTE-28", "DM-ACU-ROUTE-28B", "DM-ACU-ROUTE-28C")
for _rid in ("DM-ACU-ROUTE-27", "DM-ACU-ROUTE-27B", "DM-ACU-ROUTE-27C"):
    tag(item("rules", _rid), "Q10")["x"].pop("pregnancyUnknownCounts", None)
for _rid in PREG_INTERRUPTS:
    _r = tag(item("rules", _rid), "Q01", "Q03")
    _r["x"]["pregnancyUnknownCounts"] = True
    _r["x"]["unknownDisplay"] = "Pregnancy or a recent birth is not recorded: ask now. If pregnant or within 6 weeks of birth: " + _r["display"][0].lower() + _r["display"][1:]

# ── Q13  severe pre-eclampsia by organ damage needs a raised pressure ───────
_r = tag(item("rules", "DM-ACU-ROUTE-28B"), "Q13")
_r["when"] = crit("acu_preg_organ", "Pregnant or within 6 weeks postpartum, systolic 140 mmHg or more or diastolic 90 mmHg or more, with confusion, seizures, visual loss, breathlessness with crackles, little urine or tearing pain",
                  all=[P("hypertensive_organ_damage")], any=[P("bp_systolic", ">=", ref="REF-DM-PREG-BP-SBP"), P("bp_diastolic", ">=", ref="REF-DM-PREG-BP-DBP")], atLeast=(1, PREG_OR_PP()), ref_id="REF-DM-PREG-BP-SBP")

# ── Q05  drowsy with no numbers: glucose now at any age; BP now in pregnancy
_r = tag(item("rules", "DM-ACU-ROUTE-15"), "Q05")
_r.pop("ageBands", None)
_r["display"] = "Deep breathing or drowsiness, with no glucose on record: capillary glucose now"
_r["when"]["label"] = "Deep rapid breathing, or drowsiness or worse, at any age"
_r["x"]["notWhen"] = [k for k in _r["x"]["notWhen"] if k["id"] != "acu_paed_glucose_known"] + [
    crit("acu_glucose_now_dm", f"Diabetes ({DM_WORDS}) (rules 20, 24 and 25 own this patient)", any=DM_ANY(), ref_id="REF-DM-SUS-PAED-MIMIC")]
drule("DM-ACU-ROUTE-28D", "Pregnant or within 6 weeks of birth and drowsy, with no blood pressure recorded: blood pressure and glucose now",
      "pre_eclampsia", crit("acu_preg_drowsy_nobp", "Pregnant or within 6 weeks postpartum, drowsy or worse", all=[DROWSY()], atLeast=(1, PREG_OR_PP()), claim_id="UCG-PE-02"),
      "high", "immediate", ["bp_systolic", "bp_diastolic", "capillary_glucose"], ["Hypoglycaemia", "Eclampsia", "Stroke", "Sepsis"], "UCG-PE-02", "DM-ACU-ROUTE", lane="acute_route",
      proposal={"kind": "test.order", "test": ["bp", "test.glucose_capillary"], "tier": "now"})
last("rules", "Q05")["x"]["notWhen"] = [crit("acu_preg_drowsy_bp_done", "A blood pressure is recorded at this visit (rules 28 and 28C read it)", any=[P("bp_systolic", "recorded"), P("bp_diastolic", "recorded")], claim_id="UCG-PE-02")]

# ── Q06  pre-eclampsia symptoms are not 'plain hypertension' ────────────────
SYMPTOMS = lambda: [P("hypertensive_symptoms"), P("hypertensive_organ_damage")]
tag(item("rules", "DM-ACU-ROUTE-27B"), "Q06")["x"]["notWhen"].append(
    crit("acu_preg_bp_neg_sympt", "Headache, blurred vision, vomiting or organ-damage signs (rules 27D and 28B)", any=SYMPTOMS(), claim_id="UCG-CHTN-03"))
drule("DM-ACU-ROUTE-27D", "Raised blood pressure in pregnancy or after birth with headache, blurred vision or vomiting: signs of pre-eclampsia. Refer to hospital today",
      "pre_eclampsia", crit("acu_preg_bp_sympt", "Pregnant or within 6 weeks postpartum, systolic 140 mmHg or more or diastolic 90 mmHg or more, with headache, blurred vision, nausea or vomiting",
                            all=[P("hypertensive_symptoms")], any=[P("bp_systolic", ">=", ref="REF-DM-PREG-BP-SBP"), P("bp_diastolic", ">=", ref="REF-DM-PREG-BP-DBP")], atLeast=(1, PREG_OR_PP()), ref_id="REF-DM-PREG-BP-SBP"),
      "high", "same_day", ["urine_protein_strip"], ["Migraine (still refer)"], "UCG-CHTN-03", "DM-ACU-ROUTE", lane="acute_route",
      notes="UCG 2023 16.2.3: 'if not controlled or any sign of pre eclampsia: refer to hospital'; 16.3.7 lists headache, new blurred vision, epigastric pain and vomiting among the features of severe pre-eclampsia. Whatever the urine shows.",
      proposal={"kind": "refer", "to": "hospital_obstetrics", "tier": "today"})
last("rules", "Q06")["x"]["notWhen"] = [crit("acu_preg_bp_sympt_sev", "Systolic 160 mmHg or more or diastolic 110 mmHg or more, or organ-damage signs (rules 28 and 28B interrupt)",
                                             any=[P("bp_systolic", ">=", ref="REF-DM-PREG-BP-SEVERE-SBP"), P("bp_diastolic", ">=", ref="REF-DM-PREG-BP-SEVERE-DBP"), P("hypertensive_organ_damage")], ref_id="REF-DM-PREG-BP-SEVERE-SBP")]
for _rid in ("DM-ACU-ROUTE-27", "DM-ACU-ROUTE-27C"):
    item("rules", _rid)["x"]["notWhen"].append(crit(f"{_rid[-3:].lower()}_sympt", "Headache, blurred vision, vomiting or organ-damage signs (rules 27D and 28B)", any=SYMPTOMS(), claim_id="UCG-CHTN-03"))

# ── Q09  dehydration and acetone interrupt where ketoacidosis is likely ─────
_r = tag(item("rules", "DM-ACU-ROUTE-24"), "Q09", "Q26")
_r["when"]["any"] = [P("deep_rapid_breathing"), DROWSY()]
_r["when"]["label"] = f"Diabetes ({DM_WORDS}); with deep rapid breathing, or drowsiness or worse"
_r["display"] = "Diabetes with deep breathing or drowsiness: route now, whatever the glucose. Glucose and ketones now"
drule("DM-ACU-ROUTE-24B", "Type 1, insulin or an SGLT2 inhibitor, with acetone on the breath or dehydration: suspected ketoacidosis at any glucose. Route now; ketones now",
      "dka", crit("acu_t1_acetone", "Type 1 recorded, or on insulin or an SGLT2 inhibitor; with acetone on the breath or dehydration",
                  any=[P("acetone_breath"), P("dehydration")], atLeast=(1, [T1(), GLT("insulin"), GLT("sglt2_inhibitor")]), ref_id="REF-DM-ACU-DKA-GLU"),
      "high", "immediate", ["bohb", "urine_ketones", "venous_ph"], ["Gastroenteritis with starvation ketosis"], "A9-01", "DM-ACU-ROUTE", lane="acute_route", ageBands=ADULT,
      notes="In insulin deficiency these are signs of ketoacidosis at any glucose; on metformin or diet alone, with a normal glucose, they are not (seventh review, Q09).",
      proposal={"kind": "acute.route", "to": "triage", "tier": "now"})
last("rules", "Q09")["x"]["notWhen"] = [BOHB_NORMAL("acu_t1_acetone_bohb_normal")]
_r = tag(item("rules", "DM-ACU-ROUTE-25"), "Q09")
_r["when"]["any"] = [P("deep_rapid_breathing"), DROWSY()]
_r["when"]["label"] = f"A child with diabetes ({DM_WORDS}), with deep rapid breathing, or drowsiness or worse"
_r["display"] = "A child with diabetes and deep breathing or drowsiness: suspected ketoacidosis. Route now"
drule("DM-ACU-ROUTE-25B", "A child with diabetes and acetone on the breath or dehydration: suspected ketoacidosis. Route now",
      "dka", crit("acu_paed_acetone", f"A child with diabetes ({DM_WORDS}), with acetone on the breath or dehydration", any=[P("acetone_breath"), P("dehydration")], atLeast=(1, DM_ANY()), ref_id="REF-DM-ACU-PAED-DKA"),
      "high", "immediate", ["capillary_glucose", "bohb", "urine_ketones"], ["Gastroenteritis"], "A9-23", "DM-ACU-ROUTE", lane="acute_route", ageBands=CHILD,
      proposal={"kind": "acute.route", "to": "triage", "tier": "now"})
last("rules", "Q09")["x"]["notWhen"] = [BOHB_NORMAL("acu_paed_acetone_bohb_normal"),
    crit("acu_paed_acetone_r04", "Any glucose above 11 mmol/L or a meter reading HI (rule 04 interrupts)", any=GLU("REF-DM-ACU-PAED-GLU", ">") + [HI()], ref_id="REF-DM-ACU-PAED-GLU")]

# ── Q07, Q17  the fold: routing before measuring; every folded action carried; order shipped
k_r6.ACUTE_ORDER[:] = [
    "DM-ACU-ROUTE-06", "DM-ACU-ROUTE-31", "DM-ACU-ROUTE-07",                                  # low glucose: treat first
    "DM-ACU-ROUTE-28", "DM-ACU-ROUTE-28B", "DM-ACU-ROUTE-28C",                                # pregnancy, measured
    "DM-ACU-ROUTE-04", "DM-ACU-ROUTE-25", "DM-ACU-ROUTE-25B",                                 # children
    "DM-ACU-ROUTE-02", "DM-ACU-ROUTE-30", "DM-ACU-ROUTE-14", "DM-ACU-ROUTE-11",               # ketoacidosis and hyperosmolar state, measured
    "DM-ACU-ROUTE-29", "DM-ACU-ROUTE-17",                                                     # specific emergencies before the broad picture
    "DM-ACU-ROUTE-24", "DM-ACU-ROUTE-24B", "DM-ACU-ROUTE-03",                                 # the clinical picture in diabetes
    "DM-ACU-ROUTE-05",
    "DM-ACU-ROUTE-20", "DM-ACU-ROUTE-32", "DM-ACU-ROUTE-15", "DM-ACU-ROUTE-28D",              # 'measure now' requests come last: their action rides inside the interrupt
]
MEASURE_REQUESTS = {"DM-ACU-ROUTE-20", "DM-ACU-ROUTE-32", "DM-ACU-ROUTE-15", "DM-ACU-ROUTE-28D"}
for _i, _rid in enumerate(k_r6.ACUTE_ORDER): item("rules", _rid)["x"]["interruptRank"] = _i + 1
k_r6.INTERRUPT_RULE = ("One interrupt per event: when several `immediate` rules are met, the surface interrupts once, headed by the first in `acuteOrder` "
                       "(low glucose, then measured emergencies, then the clinical picture, then 'measure now' requests); a rule met only because pregnancy or a recent birth "
                       "is unrecorded comes after every rule met on recorded facts. The interrupt carries every folded rule's action (`interruptActions`), so nothing is lost "
                       "(seventh review, Q03, Q07).")
k_r5.SEMANTICS["interrupt"] = k_r6.INTERRUPT_RULE
k_r5.SEMANTICS["acuteOrder"] = k_r6.ACUTE_ORDER
k_r5.SEMANTICS["pregnancyUnknown"] = ("Acute pregnancy interrupts (`pregnancyUnknownCounts`: rules 28, 28B, 28C) treat an unanswered pregnancy question, or a 'not pregnant' answer with the "
                                      "weeks since birth unanswered, as possible; they fire with `unknownDisplay` (ask now, then the action) and name the gap. Same-day pregnancy rules wait for the answer "
                                      "(seventh review, Q01, Q10). `pregnancy_possible` is the platform's answer (D-DM-36).")
k_r5.SEMANTICS["targets"] = k_r6.TARGET_RULE

# ── Q11, Q27  targets ──────────────────────────────────────────────────────
_g = item("targets", "tgt_hba1c_general")
_t = tag(item("targets", "tgt_hba1c_tight"), "Q11")
_t["when"]["label"] = "A tight target agreed"
_t["x"]["notWhen"] = [copy.deepcopy(k) for k in _g["x"]["notWhen"] if k["id"] == "tgt_hba1c_general_relaxed_applies"] + [
    crit("tgt_tight_su_ins", "On insulin or a sulfonylurea (ADA: a lower goal only where treatment carries little risk of lows)", any=ISU(), ref_id="REF-DM-CTRL-HBA1C-TIGHT")]
_ckd = tag(item("targets", "tgt_hba1c_ckd"), "Q27"); _ckd["x"]["supersedes"] = ["tgt_hba1c_general", "tgt_hba1c_tight", "tgt_hba1c_older_healthy"]

# ── Q12  a district site gets a strip-based ketone prompt it can clear ──────
item("rules", "DM-ACU-ROUTE-23")["x"]["requiresCapability"] = "lab.ketones_blood"
drule("DM-ACU-ROUTE-23D", "Type 1 or on insulin, vomiting or abdominal pain, at a site with no blood ketone test: urine ketones now, repeat in 2 hours, and refer if vomiting continues or ketones rise",
      "dka", crit("acu_insulin_sick_district", "Type 1 recorded, or on insulin; with vomiting or abdominal pain", any=MILD(), atLeast=(1, [T1(), GLT("insulin")]), ref_id="REF-DM-ACU-SICKDAY-INSULIN"),
      "moderate", "same_day", ["urine_ketones"], ["Gastroenteritis", "Malaria"], "A9-49", "DM-ACU-ROUTE", lane="acute_route",
      notes="Strips can miss early ketoacidosis, so a negative strip is repeated, not trusted once; this is the district pathway when blood ketones cannot be measured (rule 8).",
      proposal={"kind": "test.order", "test": "test.ketones_urine", "tier": "now"})
_r = tag(REG["rules"][-1], "Q12"); _r["x"]["unlessCapability"] = "lab.ketones_blood"
_r["x"]["notWhen"] = [crit("acu_insulin_sick_district_raised", "Urine ketones 2+ or a sign (the ketoacidosis rules interrupt)", any=[KET2(), P("deep_rapid_breathing"), P("acetone_breath"), P("dehydration"), DROWSY()], ref_id="REF-DM-ACU-SICKDAY-INSULIN")]

# ── Q14, Q15  vomiting or acute illness with a high glucose ────────────────
_r = tag(item("rules", "DM-ACU-ROUTE-34"), "Q14")
_r["display"] = "Diabetes, vomiting, glucose 18 or more: medicines may not be kept down and the hyperosmolar state can develop. Same-day review; test ketones if not done"
drule("DM-ACU-ROUTE-34B", "Diabetes, acutely unwell, glucose 18 or more: same-day review (the hyperosmolar state can develop without vomiting)",
      "hhs", crit("acu_ill_high", f"Diabetes ({DM_WORDS}); acutely unwell; any glucose 18 mmol/L or more or a meter reading HI",
                  all=[P("acute_illness_current")], any=GLU("REF-DM-ACU-KETONE-TEST-GLU") + [HI()], atLeast=(1, DM_ANY()), ref_id="REF-DM-ACU-KETONE-TEST-GLU"),
      "moderate", "same_day", ["urine_ketones", "bohb", "sodium", "urea"], ["Infection", "Steroid-induced hyperglycaemia"], "A9-48", "DM-ACU-ROUTE", lane="acute_route",
      proposal={"kind": "review", "to": "clinician", "tier": "today"})
last("rules", "Q15")["x"]["notWhen"] = [crit("acu_ill_high_vomit", "Vomiting, blood ketones 0.6 mmol/L or more, urine 2+, or a sign (rule 34 or an interrupting rule applies)",
                                             any=[P("vomiting"), P("bohb", ">=", ref="REF-DM-ACU-KETONE-LOW"), KET2()] + SIGNS(), ref_id="REF-DM-ACU-KETONE-LOW")]

# ── displays (Q18 to Q20, Q24, Q26) ────────────────────────────────────────
item("rules", "DM-ACU-ROUTE-03")["display"] = "On an SGLT2 inhibitor and unwell (vomiting, pain, deep breathing, dehydration or drowsiness): ketoacidosis can occur at any glucose. Route now; blood ketones now"
item("rules", "DM-ACU-ROUTE-32")["display"] = "A child with diabetes or on insulin, vomiting or with abdominal pain, and no glucose on record: capillary glucose now"
item("rules", "DM-ACU-ROUTE-07")["display"] = "Glucose below 3.9 mmol/L in diabetes: hypoglycaemia. Treat now; on insulin or a sulfonylurea, or if the medicines or type are not recorded, it can come back"
item("rules", "DM-ACU-ROUTE-13")["display"] = "Diabetes with vomiting, abdominal pain or dehydration, and no glucose on record: capillary glucose today, and ketones if it is raised"
item("rules", "DM-ACU-ROUTE-20")["display"] = "Diabetes and drowsy or worse, with no glucose on record: capillary glucose now"
FEATURES["hypertensive_symptoms"]["display"] = "With the raised pressure: headache, nausea or vomiting"
FEATURES["hypertensive_organ_damage"]["display"] = "With the raised pressure: confusion, seizures, blurred or lost vision; breathlessness with crackles; little or no urine; or tearing chest or back pain"
for _r in REG["rules"]:
    for _c in [_r["when"]] + _r["x"].get("notWhen", []):
        _c["label"] = _c["label"].replace("headache, blurred vision, nausea or vomiting", "headache, nausea or vomiting").replace("Headache, blurred vision, vomiting", "Headache, vomiting")
for _rid in ("DM-ACU-ROUTE-27D",):
    item("rules", _rid)["display"] = "Raised blood pressure in pregnancy or after birth with headache or vomiting: signs of pre-eclampsia. Refer to hospital today"

k_decisions.D.append({"id": "D-DM-42", "title": "Vomiting with a high glucose on insulin; ketoacidosis in pregnancy",
    "question": "Should an adult on insulin, vomiting, with glucose 18 or more and only a negative urine strip, be an interrupt rather than same-day? Should pregnancy lower the ketone thresholds for routing?",
    "recommended": "Supply ISPAD 2022 and JBDS sick-day and JBDS-IP (DKA in pregnancy) text; until then keep same-day with 'repeat the strip in 2 hours' and say so.",
    "alternatives": ["Interrupt now on the floor's current wording."],
    "why": "The seventh review judged both patterns under-escalated; the pack will not add a threshold it has not read (N2).",
    "affects": "DM-ACU-ROUTE-34, ROUTE-23D, ROUTE-22, ACUTE_FLOOR", "needsFromCso": "ISPAD 2022 sick-day chapter, JBDS sick-day rules, JBDS-IP DKA in pregnancy", "decision": None, "signedBy": None, "signedOn": None})
next(d for d in k_decisions.D if d["id"] == "D-DM-41")["question"] = next(d for d in k_decisions.D if d["id"] == "D-DM-41")["question"].replace("4,608-cell grid", "grid of men (21,504 cells) and women (300 cells) across sites, bands, profiles, states, glucose, ketones, pregnancy and blood pressure")

DISPOSITION.update({
 "Q01": (FIXED, "Acute pregnancy interrupts treat 'not pregnant, weeks since birth unanswered' as possibly postpartum and name the gap. DMV-122; enforced by the women's grid."),
 "Q02": (FIXED, "Gestational diabetes is in the shared diabetes list everywhere. DMV-123."),
 "Q03": (FIXED, "A rule met only through unknown pregnancy ranks after every rule met on recorded facts, and is worded as a question. Build invariant. DMV-124."),
 "Q04": (FIXED, "The manifest derives appliesTo from the criterion (postpartum and unknown arms → 'any'), and carries pregnancyUnknownCounts, unknownDisplay and interruptRank."),
 "Q05": (FIXED, "ROUTE-15 asks for a glucose at any age; ROUTE-28D asks for BP and glucose in a drowsy pregnant or postpartum woman. DMV-125, DMV-126."),
 "Q06": (FIXED, "27B stands down on symptoms or organ damage; 27D refers pre-eclampsia symptoms to hospital today (UCG-CHTN-03). DMV-127."),
 "Q07": (FIXED, "Routing before measuring in acuteOrder; the interrupt carries every folded action (interruptActions); potassium stays visible. DMV-100 now headed by rule 29."),
 "Q08": (FIXED, "The build grid now has men at both sites in 4 bands with acetone, dehydration, LO and older adults (21,504 cells), and a women's pregnancy/postpartum grid; the double check is replaced by order invariants (no question-only rule heads an interrupt over a measured one; a 'measure now' request never heads over a routing rule)."),
 "Q09": (FIXED, "ROUTE-24/25 interrupt on deep breathing or drowsiness; acetone and dehydration interrupt only on type 1, insulin or SGLT2 (24B) or in children (25B), and stand down on a normal blood ketone. DMV-128."),
 "Q10": (FIXED, "Same-day pregnancy BP rules wait for the pregnancy answer; only the interrupts treat it as possible."),
 "Q11": (FIXED, "The tight target stands down on any reason to relax and on insulin or a sulfonylurea (ADA Rec 6.4)."),
 "Q12": (FIXED, "ROUTE-23 runs where blood ketones exist; ROUTE-23D is the district strip pathway with a repeat. DMV-129."),
 "Q13": (FIXED, "28B needs 140/90 or more beside the organ-damage signs."),
 "Q14": (FIXED, "ROUTE-34's display no longer asserts ketones or tablets."),
 "Q15": (PART, "ROUTE-34B covers acute illness with glucose 18 or more. Whether vomiting on insulin with a negative strip should interrupt is D-DM-42."),
 "Q16": (CSO, "Pregnancy-specific ketone routing needs JBDS-IP text: D-DM-42."),
 "Q17": (FIXED, "acuteOrder, interruptRank, supersedes and the recorded scope are in the semantics block and the manifest."),
 "Q18": (FIXED, "ROUTE-03 display."), "Q19": (FIXED, "ROUTE-32 display."), "Q20": (FIXED, "ROUTE-07 display."),
 "Q21": ("no_change", "Folded behind the hypoglycaemia interrupt, which heads; the folded reason is kept visible on purpose."),
 "Q22": ("phase_0", "Presentation: same-day items collapse under an interrupt on the surface (Phase 3)."),
 "Q23": (FIXED, "A gap is recorded only when the rule fires."),
 "Q24": (FIXED, "Blurred vision moved to the organ-damage finding."),
 "Q25": (FIXED, "The semantics block says pregnancy_possible is the platform's answer (D-DM-36)."),
 "Q26": (FIXED, "ROUTE-13 and ROUTE-20 displays."),
 "Q27": (FIXED, "The CKD target supersedes the general, tight and older targets."),
})
