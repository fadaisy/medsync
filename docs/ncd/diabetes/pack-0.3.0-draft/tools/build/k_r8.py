"""Eighth review (phase-1/r8/R8-review.json, T01 to T35). The men's acute floor held;
the criticals were missing data in pregnancy and postpartum, acetone in
non-insulin diabetes, children with diabetes-range values below 11, and control
bands that contradict the target shown. Its first read of the other lanes found
stratify weakest. Patients in k_r8_vignettes (DMV-130 onward)."""
import copy
from lib import P, crit, FEATURES, REFS
from k_model import REG, drule
from k_review import (tag, item, last, GLU, GLU_REC, KET_REC, KNOWN, ISU, GLT, HI, DROWSY, SIGNS, MILD, KET2,
                      ADULT, CHILD, DISPOSITION, FIXED)
import k_r5, k_r6, k_r7, k_decisions

PART = "fixed_in_part"; CSO = "cso_decision"
T1 = lambda: P("dm_type_recorded", "==", "type_1")
DM_ANY = k_r7.DM_ANY
DM_WORDS = k_r6.DM_WORDS
PREG_OR_PP = k_r6.PREG_OR_PP
BOHB_NORMAL = k_r7.BOHB_NORMAL

# ── T01, T02, T03, T08, T09, T18, T21  pregnancy and postpartum on missing data ──
drule("DM-ACU-ROUTE-28E", "Pregnant or within 6 weeks of birth with organ-damage signs and no blood pressure recorded: blood pressure now; severe pre-eclampsia until proved otherwise. Route now",
      "pre_eclampsia", crit("acu_preg_organ_nobp", "Pregnant or within 6 weeks postpartum, with confusion, seizures, visual loss, breathlessness with crackles, little urine or tearing pain",
                            all=[P("hypertensive_organ_damage")], atLeast=(1, PREG_OR_PP()), claim_id="UCG-PE-02"),
      "high", "immediate", ["bp_systolic", "bp_diastolic", "urine_protein_strip"], ["Eclampsia (still route)", "Stroke"], "UCG-PE-02", "DM-ACU-ROUTE", lane="acute_route",
      notes="The organ-damage finding is recorded beside a raised pressure; with the pressure not yet taken, route and measure.",
      proposal={"kind": "acute.route", "to": "triage", "tier": "now"})
last("rules", "T01")["x"]["notWhen"] = [crit("acu_preg_organ_bp_done", "A blood pressure is recorded at this visit (rule 28B reads it)", any=[P("bp_systolic", "recorded"), P("bp_diastolic", "recorded")], claim_id="UCG-PE-02")]
_r = tag(item("rules", "DM-ACU-ROUTE-27D"), "T09", "T08")
_r["urgency"] = "immediate"
_r["display"] = "Raised blood pressure in pregnancy or after birth with headache or vomiting: features of severe pre-eclampsia. Route now; refer to hospital"
_r["notes"] = ("UCG 2023 16.3.7 lists 'headache, blurring of vision of new onset' and 'epigastric or right upper quadrant pain, vomiting' among the clinical features of severe pre-eclampsia "
               "(UCG-PE-05), and 4.1.6.1 lists pre-eclampsia among hypertensive emergencies; 'any case of pre-eclampsia has to be referred to hospital'.")
from lib import cite
_r["citation"] = cite("UCG-PE-05")
UNKNOWN_TEXT = {"pregnant": "Pregnancy is not recorded: ask now. If pregnant or within 6 weeks of birth: ",
                "postpartum_weeks": "The weeks since a birth are not recorded: ask now. If within 6 weeks of birth: "}
for _rid, _urg in (("DM-ACU-ROUTE-28", "same_day"), ("DM-ACU-ROUTE-28B", None), ("DM-ACU-ROUTE-28C", None), ("DM-ACU-ROUTE-28D", None), ("DM-ACU-ROUTE-28E", None), ("DM-ACU-ROUTE-27D", None)):
    _r = tag(item("rules", _rid), "T02", "T18", "T21")
    _r["x"]["pregnancyUnknownCounts"] = True
    _core = _r["display"].split(": ", 1)[1] if ": " in _r["display"] else _r["display"]
    _r["x"]["unknownDisplays"] = {k: v + _core[0].lower() + _core[1:] for k, v in UNKNOWN_TEXT.items()}
    _r["x"].pop("unknownDisplay", None)
    if _urg: _r["x"]["unknownUrgency"] = _urg       # T18: an asymptomatic pressure with pregnancy unanswered asks the question the same day, it does not interrupt
k_r7.PREG_INTERRUPTS = ("DM-ACU-ROUTE-28", "DM-ACU-ROUTE-28B", "DM-ACU-ROUTE-28C", "DM-ACU-ROUTE-28D", "DM-ACU-ROUTE-28E", "DM-ACU-ROUTE-27D")
_o = k_r6.ACUTE_ORDER
_o.insert(_o.index("DM-ACU-ROUTE-28C") + 1, "DM-ACU-ROUTE-27D"); _o.insert(_o.index("DM-ACU-ROUTE-28B") + 1, "DM-ACU-ROUTE-28E")
_o.remove("DM-ACU-ROUTE-28D"); _o.insert(_o.index("DM-ACU-ROUTE-20"), "DM-ACU-ROUTE-28D")          # T03: the specific request before the general one
_o.insert(_o.index("DM-ACU-ROUTE-15"), "DM-SUS-PAED-01")                                          # T22
for _i, _rid in enumerate(_o): item("rules", _rid)["x"]["interruptRank"] = _i + 1
k_r7.MEASURE_REQUESTS |= {"DM-SUS-PAED-01"}
k_r5.SEMANTICS["acuteOrder"] = _o
k_r5.SEMANTICS["pregnancyUnknown"] = ("Acute pregnancy rules (`pregnancyUnknownCounts`: 27D, 28, 28B, 28C, 28D, 28E) treat an unanswered pregnancy question, or 'not pregnant' with the weeks since a birth "
    "unanswered, as possible; they fire with the matching `unknownDisplays` entry (ask now, then the action) and name the gap. A rule with `unknownUrgency` fires at that urgency on the unknown path "
    "(28: an asymptomatic pressure asks the question the same day). Same-day pregnancy rules without symptoms wait for the answer (eighth review, T02, T08, T18).")

# ── T04, T05  acetone and dehydration in non-insulin diabetes; the sick-day flag ──
_r = tag(item("rules", "DM-ACU-ROUTE-24B"), "T04")
_r["when"]["atLeast"]["of"] = DM_ANY()
_r["when"]["label"] = f"Diabetes ({DM_WORDS}); with acetone on the breath or dehydration; unless a recorded medicine list holds no insulin or SGLT2 inhibitor and the recorded type is not type 1"
_r["x"]["notWhen"].append(crit("acu_t1_acetone_list_clear", "A recorded medicine list with no insulin or SGLT2 inhibitor, and a recorded type that is not type 1 (rule 13B applies)",
                               all=[P("glucose_lowering_therapy", "!=", "insulin"), P("glucose_lowering_therapy", "!=", "sglt2_inhibitor"), P("dm_type_recorded", "!=", "type_1")], ref_id="REF-DM-ACU-DKA-GLU"))
_r["display"] = "Diabetes on insulin or an SGLT2 inhibitor, type 1, or medicines not recorded, with acetone on the breath or dehydration: suspected ketoacidosis at any glucose. Route now; ketones now"
drule("DM-ACU-ROUTE-13B", "Diabetes with acetone on the breath or dehydration and no ketone result: ketones today",
      "dka", crit("acu_dm_acetone_test", f"Diabetes ({DM_WORDS}); with acetone on the breath or dehydration", any=[P("acetone_breath"), P("dehydration")], atLeast=(1, DM_ANY()), ref_id="REF-DM-RX-SICKDAY-HOLD",
                  needs="A pack rule: acetone or dehydration in diabetes asks for the ketone test the same day (D-DM-37)."),
      "moderate", "same_day", ["urine_ketones", "bohb"], ["Starvation ketosis", "Alcohol", "Gastroenteritis"], "A9-52", "DM-ACU-ROUTE", lane="acute_route",
      proposal={"kind": "test.order", "test": "test.ketones", "tier": "today"})
last("rules", "T04")["x"]["notWhen"] = [crit("acu_dm_acetone_test_done", "A ketone result is recorded (the ketone rules read it)", any=KET_REC(), ref_id="REF-DM-RX-SICKDAY-HOLD"),
                                        crit("acu_dm_acetone_test_signs", "Deep breathing or drowsiness (an interrupting rule applies)", any=[P("deep_rapid_breathing"), DROWSY()], ref_id="REF-DM-ACU-REFER-ALL")]
drule("DM-ACU-ROUTE-25C", "A child with diabetes, dehydrated or smelling of acetone, with normal blood ketones: fluids and same-day review; recheck ketones if it persists",
      "dka", crit("acu_paed_acetone_normal", f"A child with diabetes ({DM_WORDS}); acetone on the breath or dehydration; blood ketones below 0.6 mmol/L",
                  all=[P("bohb", "<", ref="REF-DM-ACU-KETONE-LOW")], any=[P("acetone_breath"), P("dehydration")], atLeast=(1, DM_ANY()), ref_id="REF-DM-ACU-KETONE-LOW"),
      "moderate", "same_day", ["bohb"], ["Gastroenteritis"], "A9-49", "DM-ACU-ROUTE", lane="acute_route", ageBands=CHILD,
      proposal={"kind": "review", "to": "clinician", "tier": "today"})
tag(REG["rules"][-1], "T05")
for _f in REG["therapyFlags"]:
    if _f["id"] in ("metformin_during_acute_illness",):
        tag(_f, "T05")["when"] = crit("metformin_ill", "On metformin, with any of: acutely unwell, vomiting, dehydration", all=[GLT("metformin")],
                                      any=[P("acute_illness_current"), P("vomiting"), P("dehydration")], ref_id="REF-DM-RX-SICKDAY-HOLD")

# ── T07  a child with a diabetes-range value below 11 ──────────────────────
drule("DM-SUS-PAED-04", "A child with a fasting glucose of 7.0 or more, a 2-hour value of 11.1 or more, or an HbA1c of 6.5% or more: refer today as suspected diabetes",
      "type_1_diabetes", crit("sus_paed_range", "A child with fasting plasma glucose 7.0 mmol/L or more, 2-hour plasma glucose 11.1 mmol/L or more, or HbA1c 6.5% or more",
                              any=[P("fasting_pg", ">=", ref="REF-DM-DX-FPG"), P("ogtt_2h_pg", ">=", ref="REF-DM-DX-OGTT2H"), P("hba1c", ">=", ref="REF-DM-DX-HBA1C")], ref_id="REF-DM-DX-FPG"),
      "high", "same_day", ["capillary_glucose", "urine_ketones"], ["A sample taken through a glucose infusion", "Stress hyperglycaemia"], "A9-30", "DM-SUS-PAED", ageBands=CHILD,
      notes="NICE NG18: a child or young person with suspected diabetes is referred the same day. A diabetes-range value is the suspicion; the paediatric team confirms it.",
      proposal={"kind": "refer", "to": "paediatric_or_diabetes_team", "tier": "today"})
_r = tag(REG["rules"][-1], "T07"); _r["x"]["runWhenOverride"] = "always"
_r["x"]["notWhen"] = [crit("sus_paed_range_known", f"Diabetes already known ({DM_WORDS})", any=DM_ANY(), ref_id="REF-DM-SUS-PAED-SAMEDAY")]

# ── T06  control bands follow the target actually shown ────────────────────
for _tid, _target in (("hba1c_control_general", "tgt_hba1c_general"), ("hba1c_control_relaxed", "tgt_hba1c_relaxed"), ("hba1c_control_tight", "tgt_hba1c_tight")):
    _t = tag(item("interpretation", _tid), "T06"); _t.pop("when", None); _t["x"]["forTarget"] = _target
def _band_table(tid, target, ref_upper, label):
    t = copy.deepcopy(item("interpretation", "hba1c_control_general"))
    v = REFS[ref_upper]["value"]; t["id"] = tid; t["x"]["forTarget"] = target; t["x"]["review"] = ["T06"]; t["x"]["refs"] = [ref_upper]
    for b in t["bands"]:
        if b.get("to") is not None and b["code"] == "at_target": b["to"] = v
        if b.get("from") is not None and b["code"] == "above_target": b["from"] = v
    t["note"] = label
    REG["interpretation"].append(t)
_band_table("hba1c_control_older", "tgt_hba1c_older_healthy", "REF-DM-CTRL-OLDER-HEALTHY", "Read against the older-adult target (below 7.5%).")
_band_table("hba1c_control_ckd", "tgt_hba1c_ckd", "REF-DM-CTRL-CKD-HIGH", "Read against the upper end of the CKD target range (below 8.0%).")
item("targets", "tgt_hba1c_tb")["x"].setdefault("supersedes", []).extend(["tgt_hba1c_general", "tgt_hba1c_older_healthy", "tgt_hba1c_tight"])     # T35
item("targets", "tgt_hba1c_relaxed")["x"]["supersedes"] += ["tgt_hba1c_ckd", "tgt_hba1c_tb"]
_t = tag(item("targets", "tgt_hba1c_general"), "T06")
_t["x"]["notWhen"].append(crit("tgt_general_su_low", "On insulin or a sulfonylurea with a significant low in the last year (the relaxed target applies)",
                               all=[P("hypo_worst_12m", "in", ["needed_help", "measured_below_3", "repeated"])], any=ISU(), ref_id="REF-DM-CTRL-HBA1C-RELAXED"))
k_r5.SEMANTICS["bands"] = "An HbA1c control band is read only against a target that is actually proposed (`forTarget`), so a band never contradicts the target beside it (eighth review, T06)."

# ── T10  'has diabetes' outside the acute lane ─────────────────────────────
_known = P("dm_status", "==", "known")
for _kind in ("management", "targets"):
    for _it in REG[_kind]:
        _w = _it["when"]
        if _known in _w.get("all", []) and not _w.get("atLeast"):
            _w["all"] = [p for p in _w["all"] if p != _known]
            _w["atLeast"] = {"n": 1, "of": DM_ANY()}
            tag(_it, "T10")

# ── T11, T16  caveats reach routine rules and steps; one can be lifted ─────
k_r5.SEMANTICS["caveatsEverywhere"] = ("A blocking caveat acts by direction on every rule and step outside the acute lane (an untrusted result is 'insufficient' and named as a gap), "
    "and a step whose job is to order the blocked test (`measures`) proposes the alternative instead; acute rules and referrals for danger are never suppressed (N8; eighth review, T11).")
item("management", "DM-ACT-TEST-HBA1C-01")["x"]["measures"] = "hba1c"; item("management", "DM-ACT-TEST-HBA1C-02")["x"]["measures"] = "hba1c"
from k_review import N
N("hba1c_method_variant_free", "The laboratory's HbA1c method is not affected by haemoglobin variants (NGSP list)", "investigation", "boolean", FEATURES["hba1c"]["section"])
FEATURES["hba1c_method_variant_free"]["x"]["note"] = "Lifts the variant caveats when the method is documented as unaffected (NGSP; eighth review, T16)."
for _c in REG["validityCaveats"]:
    if "variant" in _c["id"] or "trait" in _c["id"] or "sickle" in _c["id"]:
        tag(_c, "T16")["x"].setdefault("notWhen", []).append(crit(f"{_c['id']}_lifted", "The laboratory documents an HbA1c method unaffected by variants", all=[P("hba1c_method_variant_free")], ref_id="REF-DM-DX-HBA1C"))

# ── T12, T13, T14  stratify reads missing data honestly ────────────────────
_neuro = next(c for c in REG["complications"] if c["code"] == "peripheral_neuropathy_probable")
tag(_neuro, "T12")["x"]["notMetRequires"] = crit("neuro_tested", "A monofilament, vibration or Ipswich touch result is recorded", any=[P("monofilament_10g", "recorded"), P("vibration_128hz", "recorded"), P("ipswich_sites_missed", "recorded")], ref_id="REF-DM-FOOT-LOPS-RULE")
_m = next(m for m in REG["riskModels"] if m["id"] == "hypoglycaemia_risk_ada"); tag(_m, "T13")["x"]["mustHave"] = ["glucose_lowering_therapy"]
_m = next(m for m in REG["riskModels"] if m["id"] == "who_cvd_2019_eastern_ssa"); tag(_m, "T14")["x"]["mustHave"] = ["who_cvd_risk_percent"]      # the bands read the chart result; lab and non-lab charts need different inputs
_m["x"]["notWhen"] = [crit("cvd_established_no_chart", "Established cardiovascular disease (already high risk; the chart does not apply)", all=[P("cvd_established")], ref_id="REF-DM-CVD-STATIN-AGE")]
k_r5.SEMANTICS["riskModels"] = "A risk model runs only when every feature in `mustHave` is recorded, and not when its `notWhen` holds; a missing input is never 'baseline' (eighth review, T13, T14)."

# ── T17, T20 and minors ────────────────────────────────────────────────────
_f = tag(item("therapyFlags", "ras_blocker_creatinine_rise"), "T17")
_f["when"]["all"] = [P("ras_blocker", "in", ["acei", "arb", "both"])] + _f["when"].get("all", [])
_f["when"]["label"] = "On an ACE inhibitor or ARB, creatinine risen by more than 30% within 4 weeks of starting or increasing"
k_r5.SEMANTICS["adult"] = "'Adult' is 16 and over by numeric age where it is recorded, whatever the display band (eighth review, T20; P0-01)."
item("management", "DM-ACT-REFER-BP-03")["display"] = "Blood pressure above 180 systolic with headache or vomiting: refer today. Confusion, visual loss, breathlessness or little urine is an emergency (rule 29)"
_r = item("rules", "DM-ACU-ROUTE-23D"); _r["x"]["notWhen"].append(crit("acu_insulin_sick_district_done", "A urine ketone result is recorded (repeat it in 2 hours)", any=[P("urine_ketones", "recorded")], ref_id="REF-DM-ACU-SICKDAY-INSULIN"))
item("rules", "DM-ACU-ROUTE-03")["display"] = "On an SGLT2 inhibitor and unwell (acute illness, vomiting, pain, deep breathing, dehydration or drowsiness): ketoacidosis can occur at any glucose. Route now; blood ketones now"

for _d in k_decisions.D:
    if _d["id"] == "D-DM-41":
        _d["question"] = ("The build fails if any patient in its grids gets less than the minimum urgency in `k_grid.floor` / `women_floor` (21,504 men over 2 sites × 4 age bands × 8 diabetes profiles "
                          "× 6 states × 7 glucose values × 8 ketone values; 360 women over pregnancy/postpartum × BP × symptoms × protein × glucose), or if the interrupt order breaks its invariants. Sign the floor?")
        _d["recommended"] = ("Sign it as the acute lane's contract. Interrupt on: a meter HI or LO; blood ketones 3.0 or more in diabetes or with a high glucose; ketones 1.6–2.9 with vomiting; "
                             "deep breathing or drowsiness in diabetes, with a high glucose, or with no glucose at all; a glucose of 3.5 with drowsiness, or on insulin, a sulfonylurea, type 1 or unknown medicines; "
                             "acetone or dehydration on insulin, an SGLT2 inhibitor, type 1, unknown medicines, or in a child with diabetes (unless blood ketones are normal); an SGLT2 inhibitor with vomiting, deep "
                             "breathing, dehydration or drowsiness; a sick child with diabetes and no glucose; in pregnancy or 6 weeks postpartum (or unanswered) 160/110, or 140/90 with organ damage, drowsiness or headache, "
                             "or organ damage or drowsiness with no BP. Same day for the intermediate patterns (ketones 0.6–2.9, vomiting with a high glucose, a low on other medicines, acetone or dehydration in other "
                             "diabetes, 140/90 in pregnancy, and an asymptomatic 160/110 with pregnancy unanswered).")

DISPOSITION.update({
 "T01": (FIXED, "ROUTE-28E routes organ-damage signs in pregnancy or postpartum with no BP recorded. Organ damage is defined beside a raised pressure, so 120/80 is not that finding. Women's grid row. DMV-130."),
 "T02": (FIXED, "28D (and 28E, 27D) treat unanswered pregnancy or postpartum as possible. DMV-131."),
 "T03": (FIXED, "28D ranks before 15. DMV-126 corrected by the order."),
 "T04": (FIXED, "24B interrupts on acetone or dehydration unless a recorded list excludes insulin and SGLT2 and the type is not type 1; ROUTE-13B asks for ketones the same day in other diabetes. Men's grid rows. DMV-132."),
 "T05": (FIXED, "The metformin sick-day flag reads vomiting and dehydration; ROUTE-25C gives a child with normal ketones a same-day review."),
 "T06": (FIXED, "Control bands are read only against the target proposed (forTarget); older and CKD bands added; the general target stands down on insulin or a sulfonylurea with a significant low. DMV-133."),
 "T07": (FIXED, "DM-SUS-PAED-04 refers a child with a diabetes-range fasting, 2-hour or HbA1c value the same day. DMV-134."),
 "T08": (FIXED, "27D (headache or vomiting with 140/90) treats unanswered pregnancy or postpartum as possible. Women's grid row."),
 "T09": (FIXED, "27D is an interrupt, cited to UCG 16.3.7's severe features (UCG-PE-05) and 4.1.6.1."),
 "T10": (FIXED, "Steps and targets read the shared diabetes list instead of the status box alone."),
 "T11": (FIXED, "Blocking caveats act by direction on every non-acute rule and step, with the value named as a gap; an HbA1c test step proposes the alternative when HbA1c is blocked. DMV-135."),
 "T12": (FIXED, "Neuropathy is never 'not met' without a sensory test."),
 "T13": (PART, "The hypoglycaemia model needs the medicine list. ADA's 'intensive insulin' factor is a source addition for D-DM-42."),
 "T14": (PART, "The CVD chart needs all its inputs and does not run with established CVD; its age range needs WHO's chart text (D-DM-40)."),
 "T15": ("phase_0", "Classification prompts in a lean child recorded as type 2 and age at diagnosis: Design B owns the timing."),
 "T16": (FIXED, "The variant caveats lift when the laboratory documents a variant-free method (NGSP)."),
 "T17": (FIXED, "The creatinine-rise flag needs an ACE inhibitor or ARB."),
 "T18": (FIXED, "Rule 28 on the unknown path is same day with the question, not an interrupt."),
 "T19": (FIXED, "D-DM-41's text is regenerated from the floor."),
 "T20": (FIXED, "'Adult' is 16 and over by numeric age in the evaluator."),
 "T21": (FIXED, "unknownDisplays says which question is missing."),
 "T22": (FIXED, "PAED-01 has a rank, as a measure-now request."),
 "T23": (FIXED, "Targets and supersedes are in the semantics block; the manifest carries the semantics."),
 "T24": (FIXED, "BP-03 display."),
 "T25": ("phase_0", "Postpartum timing beyond 6 weeks is Design B's episode logic."),
 "T26": ("phase_0", "Testing intervals are Design B's recall logic."),
 "T27": ("phase_0", "'Never tested' from a blank history is Design B's complete-record logic (N4)."),
 "T28": ("no_change", "T1-05's label speaks of a recorded list; a blank list does not fire it."),
 "T29": (FIXED, "23D stands down once a urine result is recorded (repeat in 2 hours)."),
 "T30": ("no_change", "ROUTE-15's source is the NICE paediatric text for children; for adults it rests on WHO's 'refer all suspected' rule beside it (REF-DM-ACU-REFER-ALL)."),
 "T31": (FIXED, "ROUTE-03 display names acute illness."),
 "T32": ("phase_0", "TB-01 timing (tested before TB) is Design B's time window."),
 "T33": (CSO, "Single-eGFR referral and AKI: D-DM-19 and REF-DM-VAL-EGFR-STEADY."),
 "T34": (CSO, "Gliclazide or glimepiride below eGFR 30 needs a sourced statement; none is in the research table."),
 "T35": (FIXED, "TB and relaxed targets supersede the others."),
})
