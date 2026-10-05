"""The 2026 Uganda diabetes guideline (summarised version, MoH June 2026), signed by the CSO 2026-10-05:
docs/ncd/diabetes/ug2026-signoff.json, item by item in docs/ncd/diabetes/ug2026-vs-pack.md. Every change names
its UG item. Quotes: research/A15-ug2026.json (verbatim, PDF pages). No dose anywhere."""
from lib import P, crit, cite, FEATURES, REFS
from k_model import REG, drule, step, target, band
from k_review import item, nref, N
import k_r5, k_r7

SIGNED = "signed 2026-10-05 (docs/ncd/diabetes/ug2026-signoff.json)"
def sign(it, *ugs):
    it["x"]["signed"] = f"{', '.join(ugs)} {SIGNED}"
    it["x"].setdefault("sources", []).append("UG 2026 summarised")
    return it

# ═══ A. Diagnosis (UG-01 to UG-05) ═════════════════════════════════════════════════════
for _rid, _txt, _v, _u in (("REF-DM-DX-UG26-FPG", "fasting blood glucose at or above this value is in the diabetes range", 7.0, "mmol/L"),
                           ("REF-DM-DX-UG26-RBG", "random blood glucose at or above this value is in the diabetes range", 11.1, "mmol/L"),
                           ("REF-DM-DX-UG26-OGTT", "2-hour glucose after a 75 g OGTT at or above this value is in the diabetes range", 11.1, "mmol/L"),
                           ("REF-DM-DX-UG26-HBA1C", "HbA1c at or above this value is in the diabetes range", 6.5, "%"),
                           ("REF-DM-IH-UG26-FPG", "fasting blood glucose from this value (below 7.0) is prediabetes", 5.6, "mmol/L"),
                           ("REF-DM-IH-UG26-RBG", "random blood glucose from this value (below 11.1) is in the prediabetes band", 7.8, "mmol/L"),
                           ("REF-DM-IH-UG26-HBA1C", "HbA1c from this value (below 6.5) is prediabetes", 5.7, "%")):
    nref(_rid, f"2026 Uganda guideline: {_txt}", _v, _u, ["UG26-DX-TABLE"], "diagnosis")
_sec = FEATURES["polyuria"]["section"]
for _c, _d in (("pruritus", "Itching (pruritus)"), ("wasting", "Wasting"), ("weakness", "Weakness")):
    if _c not in FEATURES: N(_c, _d, "symptom", "boolean", _sec)
N("hyperglycaemic_crisis_now", "Ketoacidosis or the hyperosmolar state at this visit", "symptom", "boolean", _sec,
  x_note="2026: a hyperglycaemic crisis counts as symptomatic for diagnosis (UG-02).")
N("hba1c_point_of_care", "HbA1c measured on a point-of-care machine", "investigation", "boolean", FEATURES["hba1c"]["section"],
  x_note="2026: 'Do not use point-of-care HbA1c machines to diagnose diabetes' (UG-04). Monitoring may still use it.")
FPG = lambda: P("fasting_pg", ">=", ref="REF-DM-DX-UG26-FPG")
RBG = lambda: P("random_pg", ">=", ref="REF-DM-DX-UG26-RBG")
OGTT = lambda: P("ogtt_2h_pg", ">=", ref="REF-DM-DX-UG26-OGTT")
A1C = lambda: [P("hba1c", ">=", ref="REF-DM-DX-UG26-HBA1C"), P("hba1c_point_of_care", "absent")]
REPEAT = lambda: P("repeat_abnormal_result")
SYM = lambda: [P(x) for x in ("polyuria", "polydipsia", "polyphagia", "foot_numbness_burning", "pruritus", "unexplained_weight_loss", "wasting", "weakness", "hyperglycaemic_crisis_now")]
SYM_WORDS = ("a classic symptom (passing a lot of urine, thirst, hunger, pins and needles, itching, weight loss, wasting or weakness) "
             "or ketoacidosis or the hyperosmolar state")
_s = item("diagnosis_pending", "ug_integrated_dm_2026")
_s["anyOf"] = [
    crit("ug26_sym_fpg", f"Fasting blood glucose 7.0 mmol/L or more with {SYM_WORDS}", all=[FPG()], any=SYM(), ref_id="REF-DM-DX-UG26-FPG"),
    crit("ug26_sym_rbg", f"Random blood glucose 11.1 mmol/L or more with {SYM_WORDS}", all=[RBG()], any=SYM(), ref_id="REF-DM-DX-UG26-RBG"),
    crit("ug26_fpg_repeat", "Fasting blood glucose 7.0 mmol/L or more, confirmed by a repeat result in the diabetes range", all=[FPG(), REPEAT()], ref_id="REF-DM-DX-UG26-FPG"),
    crit("ug26_ogtt_repeat", "2-hour glucose after 75 g 11.1 mmol/L or more, confirmed by a repeat result", all=[OGTT(), REPEAT()], ref_id="REF-DM-DX-UG26-OGTT"),
    crit("ug26_hba1c_repeat", "Laboratory HbA1c 6.5% or more (not point-of-care), confirmed by a repeat result", all=A1C() + [REPEAT()], ref_id="REF-DM-DX-UG26-HBA1C"),
    crit("ug26_fpg_ogtt", "Two different tests in the diabetes range: fasting 7.0 mmol/L or more and 2-hour 11.1 mmol/L or more", all=[FPG(), OGTT()], ref_id="REF-DM-DX-UG26-FPG"),
    crit("ug26_fpg_hba1c", "Two different tests in the diabetes range: fasting 7.0 mmol/L or more and laboratory HbA1c 6.5% or more", all=[FPG()] + A1C(), ref_id="REF-DM-DX-UG26-FPG"),
    crit("ug26_ogtt_hba1c", "Two different tests in the diabetes range: 2-hour 11.1 mmol/L or more and laboratory HbA1c 6.5% or more", all=[OGTT()] + A1C(), ref_id="REF-DM-DX-UG26-OGTT"),
    crit("ug26_rbg_fpg", "Random 11.1 mmol/L or more with a fasting 7.0 mmol/L or more (never two random values)", all=[RBG(), FPG()], ref_id="REF-DM-DX-UG26-RBG"),
    crit("ug26_rbg_hba1c", "Random 11.1 mmol/L or more with a laboratory HbA1c 6.5% or more (never two random values)", all=[RBG()] + A1C(), ref_id="REF-DM-DX-UG26-RBG"),
]
_s["citation"] = cite("UG26-DX-SINGLE")
_s["x"].pop("pending", None)
_s["x"].update(default=True, note=("Uganda's default set: the 2026 Integrated Diabetes Management Guideline (summarised), in force from June 2026 and "
               "superseding UCG 2023 for diabetes (D-DM-01). '≥' for every threshold; eight classic symptoms or a crisis; with symptoms one "
               "fasting or random value; without, a repeat or two different tests in range (UG-01 to UG-04)."))
sign(_s, "UG-01", "UG-02", "UG-03", "UG-04")
_u = item("diagnosis_pending", "ug_ucg_2023"); _u["x"]["default"] = False
_u["x"]["note"] = "UCG 2023 8.1.3 as printed, kept alongside for reference; superseded as the default by the 2026 guideline (UG-01). Not counted for 'met at this visit'."
k_r5.SEMANTICS["metNowSets"] = ["who_hearts_d_2020", "ug_integrated_dm_2026"]
k_r5.SEMANTICS["defaultSets"] = ("Diagnosis: the 2026 Uganda guideline (`ug_integrated_dm_2026`) is the default set; WHO HEARTS-D 2020 and UCG 2023 are shown "
                                 "alongside; 'met at this visit' (for referrals) means the 2026 or the WHO set met (`metNowSets`). Intermediate: the 2026 "
                                 "prediabetes bands (`ada_2026_prediabetes`, same numbers). Gestational: WHO 2013 (the 2026 guideline's own values); "
                                 "UCG 2023's gestational set retired (UG-07).")
# UG-03: a second, different test today confirms as well as a repeat on another day.
_r = item("rules", "DM-SUS-INCID-02")
_r["display"] = ("One result in the diabetes range: confirm it today with a second, different test (fasting glucose, laboratory HbA1c or an OGTT; "
                 "the 2026 guideline accepts two tests at the same time), or repeat on another day; do not leave it")
sign(_r, "UG-03")
# UG-04: at a site with a laboratory analyser, confirm a meter-based diagnosis with venous plasma.
step("DM-ACT-TEST-VENOUS-01", "If the diagnosis rests on a meter reading, confirm it with a laboratory venous plasma glucose (2026: the recommended method "
     "in hospitals); a point-of-care HbA1c does not diagnose", crit("test_venous", "A meter reading recorded at this visit", all=[P("capillary_glucose", "recorded")],
     claim_id="UG26-DX-METHOD"), "UG26-DX-METHOD", "test", "DM-ACT-TEST")
_r = REG["management"][-1]; _r["x"].update(runWhenOverride="newly_met", requiresCapability="lab.glucose"); sign(_r, "UG-04")
# UG-05: the 2026 prediabetes bands are Uganda's intermediate set.
_a = item("diagnosis_pending", "ada_2026_prediabetes"); _a["x"].pop("pending", None)
_a["x"].update(default=True, verdict="intermediate", note="The 2026 Uganda guideline's prediabetes bands (FBG 5.6 to 6.9, 2-hour 7.8 to 11.0, HbA1c 5.7 to 6.4), the same numbers as ADA (UG-05).")
sign(_a, "UG-05")
_r = item("rules", "DM-SUS-INCID-04")
_r["display"] = "A fasting capillary glucose of 5.6 to below 7.0 mmol/L (2026: prediabetes range): repeat fasting on another day, and offer a 2-hour OGTT where one can be done"
_r["when"] = crit("sus_fcap_ifg", "A fasting capillary glucose of 5.6 mmol/L or more and below 7.0 mmol/L",
                  all=[P("capillary_glucose_context", "==", "fasting"), P("capillary_glucose", ">=", ref="REF-DM-IH-UG26-FPG"), P("capillary_glucose", "<", ref="REF-DM-DX-FPG")],
                  ref_id="REF-DM-IH-UG26-FPG")
sign(_r, "UG-05")
drule("DM-SUS-INCID-05", "A random glucose of 7.8 to below 11.1 mmol/L: test properly (a fasting glucose, laboratory HbA1c or an OGTT). The 2026 band is a "
      "reason to test, not a label", "diabetes_undiagnosed",
      crit("sus_rbg_band", "A random plasma glucose of 7.8 mmol/L or more and below 11.1 mmol/L",
           all=[P("random_pg", ">=", ref="REF-DM-IH-UG26-RBG"), P("random_pg", "<", ref="REF-DM-DX-UG26-RBG")], ref_id="REF-DM-IH-UG26-RBG"),
      "low", "routine", ["fasting_pg", "hba1c", "ogtt_2h_pg"], ["A post-meal or stress value"], "UG26-DX-TABLE", "DM-SUS-INCID")
_r = REG["rules"][-1]; sign(_r, "UG-05")
for _sid, _lab, _preds in (("DM-ACT-EDU-10B", "A fasting blood glucose of 5.6 to below 7.0 mmol/L at this visit (2026 prediabetes)",
                            [P("fasting_pg", ">=", ref="REF-DM-IH-UG26-FPG"), P("fasting_pg", "<", ref="REF-DM-DX-UG26-FPG")]),
                           ("DM-ACT-EDU-10C", "A laboratory HbA1c of 5.7 to below 6.5% at this visit (2026 prediabetes)",
                            [P("hba1c", ">=", ref="REF-DM-IH-UG26-HBA1C"), P("hba1c", "<", ref="REF-DM-DX-UG26-HBA1C")])):
    step(_sid, "In the prediabetes range (2026): weight, activity, and a test every year", crit(_sid.lower().replace("-", "_"), _lab, all=_preds, claim_id="UG26-DX-TABLE"),
         "UG26-DX-TABLE", "educate", "DM-ACT-EDU")
    _r = REG["management"][-1]; _r["x"]["runWhenOverride"] = "not_established"; sign(_r, "UG-05")
REG["management"][-1]["x"]["notWhen"] = [crit("edu_10c_fasting", "Fasting glucose 5.6 to below 7.0 mmol/L at this visit (DM-ACT-EDU-10B owns it)",
                                              all=[P("fasting_pg", ">=", ref="REF-DM-IH-UG26-FPG"), P("fasting_pg", "<", ref="REF-DM-DX-UG26-FPG")], ref_id="REF-DM-IH-UG26-FPG")]

# ═══ B. Pregnancy (UG-06 to UG-12; UG-13 belongs to the antenatal pathway) ═══════════════
PREG_DM = lambda: k_r7.DM_ANY()
# UG-06: screen every pregnant woman; the OGTT at 24 to 28 weeks switched on everywhere (supersedes D-DM-12).
_r = item("rules", "DM-SUS-PREG-01")
_r["display"] = ("24 weeks or more pregnant: offer a 75 g OGTT (the 2026 guideline screens every pregnant woman). Where an OGTT cannot be done: "
                 "a fasting glucose, a random glucose and/or HbA1c")
_r["x"]["enabled"] = True; _r["x"].pop("enabledBy", None); sign(_r, "UG-06")
nref("REF-DM-PREG-UG26-EARLY", "2026 Uganda guideline: before this gestation the first antenatal screen uses OGTT, FBS, RBG and/or HbA1c", 24, "weeks", ["UG26-PREG-SCREEN"], "pregnancy")
drule("DM-SUS-PREG-03", "Pregnant, before 24 weeks, no glucose result at this visit: screen for hyperglycaemia in pregnancy now (an OGTT, a fasting or random "
      "glucose, or HbA1c). The 2026 guideline screens every pregnant woman at her first antenatal contact",
      "gestational_diabetes", crit("sus_preg_first", "Pregnant, before 24 weeks", all=[P("pregnant"), P("gestation_weeks", "<", ref="REF-DM-PREG-UG26-EARLY")],
                                   ref_id="REF-DM-PREG-UG26-EARLY"),
      "moderate", "routine", ["ogtt_2h_pg", "fasting_pg", "random_pg", "hba1c"], ["Diabetes before the pregnancy, not yet recorded"], "UG26-PREG-SCREEN", "DM-SUS-PREG",
      proposal={"kind": "test.order", "test": "test.ogtt", "tier": "routine"})
_r = REG["rules"][-1]; sign(_r, "UG-06")
_r["x"]["notWhen"] = [crit("sus_preg_first_known", "Diabetes or gestational diabetes already recorded", any=PREG_DM(), claim_id="UG26-PREG-SCREEN"),
                      crit("sus_preg_first_done", "A glucose result recorded at this visit (fasting, random, OGTT or HbA1c)",
                           any=[P("fasting_pg", "recorded"), P("random_pg", "recorded"), P("ogtt_2h_pg", "recorded"), P("hba1c", "recorded")], claim_id="UG26-PREG-SCREEN")]
_r = item("rules", "DM-SUS-PREG-UCG")
_r["display"] = _r["display"] + ". With a risk factor, test at the first visit rather than waiting (2026 screens everyone)"
sign(_r, "UG-06")
# UG-07: UCG 2023's gestational set retired; WHO 2013 (the 2026 guideline's own values) stands alone.
REG["diagnosis_pending"][:] = [d for d in REG["diagnosis_pending"] if d["id"] != "ug_ucg_2023_gdm"]
sign(item("diagnosis_pending", "who_2013_gdm"), "UG-07")
# UG-08: pregnancy lowers HbA1c, so it masks: a high value rules in, a normal one does not rule out.
_c = next(c for c in REG["validityCaveats"] if c["id"] == "hba1c_pregnancy"); _c["direction"] = "masks"; sign(_c, "UG-08")
drule("DM-CON-PREG-06", "Pregnant before 24 weeks with HbA1c 6.5% or more: probable diabetes before the pregnancy. Manage as hyperglycaemia in pregnancy: "
      "refer today for specialised antenatal care (2026)", "diabetes_in_pregnancy",
      crit("con_preg_hba1c_early", "Pregnant, before 24 weeks, HbA1c 6.5% or more",
           all=[P("pregnant"), P("gestation_weeks", "<", ref="REF-DM-PREG-UG26-EARLY"), P("hba1c", ">=", ref="REF-DM-DX-UG26-HBA1C")], ref_id="REF-DM-DX-UG26-HBA1C"),
      "high", "same_day", ["fasting_pg", "ogtt_2h_pg"], ["A low HbA1c is not reassuring in pregnancy (it reads low)"], "UG26-PREG-SCREEN", "DM-CON-PREG", lane="confirm")
_r = REG["rules"][-1]; sign(_r, "UG-08")
_r["x"]["notWhen"] = [crit("con_preg_hba1c_known", "Diabetes already recorded before this pregnancy", any=[P("dm_status", "==", "known")], claim_id="UG26-PREG-SCREEN")]
# UG-09: targets in pregnancy (GDM and pre-existing), and a preconception HbA1c.
nref("REF-DM-PREG-UG26-TGT-FBG", "2026 Uganda guideline: fasting glucose target in pregnancy, below this value", 5.3, "mmol/L", ["UG26-PREG-TGT"], "pregnancy")
nref("REF-DM-PREG-UG26-TGT-1H", "2026 Uganda guideline: 1-hour post-meal glucose target in pregnancy, below this value", 7.8, "mmol/L", ["UG26-PREG-TGT"], "pregnancy")
nref("REF-DM-PREG-UG26-TGT-2H", "2026 Uganda guideline: 2-hour post-meal glucose target in pregnancy, below this value", 6.7, "mmol/L", ["UG26-PREG-TGT"], "pregnancy")
nref("REF-DM-PREG-UG26-PRECON", "2026 Uganda guideline: HbA1c to reach before a planned pregnancy, below this value", 6.5, "%", ["UG26-PREG-PRECON"], "pregnancy")
_tw = crit("tgt_preg_dm", "Pregnant, with diabetes or gestational diabetes", all=[P("pregnant")], atLeast=(1, PREG_DM()), claim_id="UG26-PREG-TGT")
target("tgt_fpg_pregnancy", "fasting_pg", None, "Fasting glucose below 5.3 mmol/L in pregnancy (2026)", _tw, upper_ref="REF-DM-PREG-UG26-TGT-FBG", claim_id="UG26-PREG-TGT", pregnancy="pregnant")
REG["targets"][-1]["x"]["ages"] = "adult"; sign(REG["targets"][-1], "UG-09")
target("tgt_ppg_pregnancy", "postprandial_pg", None, "Glucose 2 hours after a meal below 6.7 mmol/L in pregnancy, or 1 hour after below 7.8 mmol/L (2026)", _tw,
       upper_ref="REF-DM-PREG-UG26-TGT-2H", claim_id="UG26-PREG-TGT", pregnancy="pregnant")
_t = REG["targets"][-1]; _t["x"]["ages"] = "adult"; _t["x"]["refs"] = ["REF-DM-PREG-UG26-TGT-2H", "REF-DM-PREG-UG26-TGT-1H"]; sign(_t, "UG-09")
_s = item("management", "DM-ACT-EDU-08")
_s["display"] = ("Could become pregnant: discuss pregnancy planning and which medicines must change first; plan a pregnancy when HbA1c is below 6.5% "
                 "(2026), and use contraception until then")
_s["x"]["refs"] = ["REF-DM-PREG-UG26-PRECON"]; sign(_s, "UG-09")
# UG-10: insulin first in pregnancy; metformin if insulin is refused or unavailable, or as an add-on.
_f = next(f for f in REG["therapyFlags"] if f["id"] == "other_glucose_lowering_in_pregnancy")
_f["action"] = ("2026 Uganda guideline: in pregnancy insulin is first line; metformin if insulin is refused or cannot be accessed, or as an add-on. "
                "Sulfonylureas, DPP-4 inhibitors, SGLT2 inhibitors, pioglitazone and GLP-1 agonists are avoided. Review today with the prescriber and the antenatal team.")
sign(_f, "UG-10")
# UG-11: aspirin from 12 to 16 weeks in pre-existing diabetes (review prompt, no dose).
nref("REF-DM-PREG-UG26-ASA-WEEKS", "2026 Uganda guideline: aspirin to reduce pre-eclampsia risk is started from this gestation (to 16 weeks)", 12, "weeks", ["UG26-PREG-ASA"], "pregnancy")
step("DM-ACT-PREG-ASA-01", "Pregnant with type 1 or type 2 diabetes, 12 weeks or more: review starting aspirin to reduce the risk of pre-eclampsia "
     "(2026: from 12 to 16 weeks); agree it with the antenatal team",
     crit("preg_asa", "Pregnant, 12 weeks or more, with type 1 or type 2 diabetes recorded",
          all=[P("pregnant"), P("gestation_weeks", ">=", ref="REF-DM-PREG-UG26-ASA-WEEKS"), P("dm_type_recorded", "in", ["type_1", "type_2"])], ref_id="REF-DM-PREG-UG26-ASA-WEEKS"),
     "UG26-PREG-ASA", "therapy_review", "DM-ACT-RX", ages="any")
_s = REG["management"][-1]; _s["x"]["appliesTo"] = {"pregnancy": "pregnant"}; _s["x"]["runWhenOverride"] = "always"; sign(_s, "UG-11")
_s["x"]["notWhen"] = [crit("preg_asa_on", "Already on an antiplatelet", all=[P("on_antiplatelet")], claim_id="UG26-PREG-ASA")]
# UG-12: the postpartum test.
_r = item("rules", "DM-SUS-PREG-02")
_r["display"] = ("Gestational diabetes in the pregnancy just ended: re-test 6 to 12 weeks after the birth, with an OGTT where the site can run one, "
                 "otherwise a fasting glucose; then every 1 to 3 years for life (2026)")
sign(_r, "UG-12")

# ═══ C. Classification, targets, monitoring (UG-14 to UG-17, UG-28, UG-29); D-DM-40 ════════
DM_KNOWN = lambda: k_r7.DM_ANY()
# UG-14 (keep the pack): no antibody precondition for type 1.
_t1 = item("classifications", "type_1")
_t1["x"]["ug2026"] = ("2026 diagnoses type 1 on '≥2 islet-cell autoantibodies' (p. 60). Not required here (UG-14, CSO): antibodies are rarely "
                      "available and often negative in Ugandan type 1; insulin and ketone education never wait on the test.")
sign(_t1, "UG-14 (keep the pack)")
# UG-15: a random C-peptide below 0.6 nmol/L (600 pmol/L) not on insulin: consider insulin (treatment review, no dose).
nref("REF-DM-RX-UG26-CPEP", "2026 Uganda guideline: a random C-peptide below this value (0.6 nmol/L) is biochemically confirmed insulin deficiency, an indication for insulin",
     600, "pmol/L", ["UG26-CPEP-INS", "SRC-HOLT21-FIG1"], "treatment")
step("DM-ACT-RX-13", "Random C-peptide below 600 pmol/L (0.6 nmol/L) and not on insulin: the 2026 guideline reads this as insulin deficiency. Consider insulin",
     crit("rx_cpep", "Random C-peptide below 600 pmol/L, not on insulin",
          all=[P("c_peptide", "<", ref="REF-DM-RX-UG26-CPEP"), P("glucose_lowering_therapy", "!=", "insulin")], ref_id="REF-DM-RX-UG26-CPEP"),
     "UG26-CPEP-INS", "therapy_review", "DM-ACT-RX")
_s = REG["management"][-1]; _s["x"]["requiresCapability"] = "lab.c_peptide"; sign(_s, "UG-15")
# UG-16: HbA1c below 8% at 60 or over with the 2026 profile; the tight target carries the 2026 profile in its words.
nref("REF-DM-CTRL-UG26-ELDERLY", "2026 Uganda guideline: 'elderly' for the relaxed HbA1c target, from this age", 60, "years", ["UG26-TGT-HBA1C"], "control")
target("tgt_hba1c_elderly_2026", "hba1c", None, "HbA1c below 8.0% (2026: 60 or over with long-standing diabetes, a high risk of lows, kidney disease or "
       "atherosclerotic cardiovascular disease)",
       crit("tgt_elderly_2026", "Aged 60 or over, with any of: a significant low in the last year, kidney disease (eGFR below 60), established cardiovascular disease, frailty",
            all=[P("age_years", ">=", ref="REF-DM-CTRL-UG26-ELDERLY")],
            any=[P("hypo_worst_12m", "in", ["needed_help", "measured_below_3", "repeated"]), P("egfr", "<", ref="REF-DM-KID-GFR-G3A"), P("cvd_established"),
                 P("frailty_or_limited_life_expectancy")], ref_id="REF-DM-CTRL-UG26-ELDERLY"),
       upper_ref="REF-DM-CTRL-HBA1C-RELAXED", claim_id="UG26-TGT-HBA1C")
_t = REG["targets"][-1]; _t["x"]["ages"] = "adult"; _t["x"]["supersedes"] = ["tgt_hba1c_general", "tgt_hba1c_older_healthy"]; sign(_t, "UG-16")
_t = item("targets", "tgt_hba1c_tight")
_t["display"] = "HbA1c below 6.5% (2026: newly diagnosed, young, no comorbidities, a low risk of lows; never on insulin or a sulfonylurea here)"
sign(_t, "UG-16")
# UG-17: HbA1c every 3 months while above target.
step("DM-ACT-TEST-HBA1C-03", "HbA1c is due (3 months since the last, which was above 7.0%): the 2026 guideline checks every 3 months until controlled",
     crit("due_hba1c_above", "Confirmed diabetes, last HbA1c 7.0% or more, 3 months or more ago",
          all=[P("hba1c", ">=", ref="REF-DM-CTRL-HBA1C-TARGET"), P("months_since_hba1c", ">=", ref="REF-DM-CTRL-WINDOW-ABOVE")], atLeast=(1, DM_KNOWN()),
          ref_id="REF-DM-CTRL-WINDOW-ABOVE"),
     "UG26-TGT-FREQ", "test", "DM-ACT-TEST")
_s = REG["management"][-1]; sign(_s, "UG-17")
_s["x"]["notWhen"] = [crit("due_hba1c_above_changed", "Treatment changed recently (DM-ACT-TEST-HBA1C-02 owns it)", all=[P("therapy_changed_recently")], claim_id="UG26-TGT-FREQ")]
# UG-17, UG-28, UG-29 for under-16s: the pack shows recognition and referral only below 16 (D-DM-32, P0-01), so the 2026 child
# content is one referral-style check that the paediatric clinic is doing it.
nref("REF-DM-PAED-UG26-SCREEN-AGE", "2026 Uganda guideline: in type 1, kidney, eye and nerve screening from puberty or this age, after 2 to 5 years", 11, "years", ["UG26-T1-KIDNEY"], "paediatric")
drule("DM-ACT-REFER-PAED-T1-01", "Type 1 diabetes under 16: make sure the paediatric diabetes clinic is following the 2026 guideline: HbA1c every 3 months "
      "with a target below 7%, glucose 4 to 6 times a day, and from age 11 (or puberty) after 2 years of diabetes yearly kidney and nerve checks and an eye "
      "check every 2 years", "type_1_diabetes",
      crit("paed_t1_clinic", "Type 1 diabetes recorded, under 16", all=[P("dm_type_recorded", "==", "type_1")], claim_id="UG26-T1-TGT"),
      "low", "routine", ["hba1c"], ["Type 2 or monogenic diabetes in a young person (check the recorded type)"], "UG26-T1-TGT", "DM-ACT-REFER", lane="act", ageBands=["child", "adolescent"])
_s = REG["rules"][-1]; _s["x"]["refs"] = ["REF-DM-PAED-UG26-SCREEN-AGE"]; sign(_s, "UG-17", "UG-28", "UG-29")
# D-DM-40 (sources review §4; the 2026 guideline sets no older-adult floor): ADA 2026 Table 13.2.
nref("REF-DM-CTRL-OLDER-FPG-COMPLEX", "ADA 2026 Table 13.2: fasting goal lower limit for an older adult with complex or intermediate health", 5.0, "mmol/L", ["SRC-ADA26-T132"], "control")
nref("REF-DM-CTRL-OLDER-FPG-HEALTHY", "ADA 2026 Table 13.2: fasting goal lower limit for a healthy older adult", 4.4, "mmol/L", ["SRC-ADA26-T132"], "control")
for _sid, _lab, _ref, _extra, _words in (
        ("DM-ACT-RX-14", "Aged 65 or over on insulin or a sulfonylurea, fasting glucose below 4.4 mmol/L", "REF-DM-CTRL-OLDER-FPG-HEALTHY", None, "4.4"),
        ("DM-ACT-RX-14B", "Aged 65 or over on insulin or a sulfonylurea, frail or cognitively impaired, fasting glucose below 5.0 mmol/L", "REF-DM-CTRL-OLDER-FPG-COMPLEX",
         [P("frailty_or_limited_life_expectancy"), P("cognitive_impairment")], "5.0 (frail or cognitively impaired)")):
    step(_sid, f"65 or over on insulin or a sulfonylurea, fasting glucose below {_words}: below ADA's goal for older adults, not 'at target'. Review the "
         "treatment to avoid lows", crit(_sid.lower().replace("-", "_"), _lab,
                                         all=[P("age_years", ">=", ref="REF-DM-CTRL-OLDER-AGE"), P("fasting_pg", "<", ref=_ref)],
                                         any=_extra or [P("glucose_lowering_therapy", "==", g) for g in ("insulin", "glibenclamide", "gliclazide", "glimepiride")],
                                         ref_id=_ref),
         "SRC-ADA26-T132", "therapy_review", "DM-ACT-RX")
    _s = REG["management"][-1]; _s["x"]["signed"] = f"D-DM-40 {SIGNED}"
    if _extra:
        _s["when"]["all"].append(P("glucose_lowering_therapy", "in", ["insulin", "glibenclamide", "gliclazide", "glimepiride"]))
REG["management"][-2]["x"]["notWhen"] = [crit("rx_14_complex", "Frail or cognitively impaired (DM-ACT-RX-14B owns it)",
                                              any=[P("frailty_or_limited_life_expectancy"), P("cognitive_impairment")], claim_id="SRC-ADA26-T132")]

# ═══ D. Treatment and levels of care (UG-18 to UG-26, UG-41) ═══════════════════════════
# UG-18: two medicines at diagnosis from HbA1c 7.5% (or 1.5% above target); no lifestyle-only period (supersedes D-DM-34, P0-28).
nref("REF-DM-RX-UG26-COMBO", "2026 Uganda guideline: newly diagnosed type 2 with HbA1c at or above this value starts combination therapy", 7.5, "%", ["UG26-COMBO"], "treatment")
_s = item("management", "DM-ACT-RX-01")
_s["display"] = ("Type 2 diabetes above target and not on medicine: review treatment. 2026 guideline: HbA1c 7.5% or more at diagnosis, or 1.5% or more "
                 "above target, start two glucose-lowering medicines; below that, metformin with diet and activity")
_s["x"]["refs"] = ["REF-DM-RX-UG26-COMBO"]; sign(_s, "UG-18")
_s = item("management", "DM-ACT-RX-01B")
_s["display"] = ("Type 2 diabetes above target on a fasting meter reading and not on medicine: review treatment. 2026 guideline: metformin with diet and "
                 "activity; two medicines if HbA1c is 7.5% or more")
_s["x"]["refs"] = ["REF-DM-RX-UG26-COMBO"]; sign(_s, "UG-18")
# UG-19, UG-21: the second medicine by phenotype; where it can be started (EMHSLU 2023 governs stocking; the 2026 level named).
_s = item("management", "DM-ACT-RX-02")
_s["display"] = ("On metformin without a sulfonylurea or insulin, and above target despite taking it: review treatment. 2026 guideline (Table 8): 60 or over, "
                 "gliclazide or a DPP-4 inhibitor; BMI below 25, a sulfonylurea or a DPP-4 inhibitor; BMI 25 or more, an SGLT2 inhibitor or GLP-1 agonist. "
                 "The 2026 guideline starts these at health centre IV and above; EMHSLU 2023 stocks glimepiride from general hospitals and gliclazide, "
                 "DPP-4 and SGLT2 inhibitors at regional referral hospitals, so refer if this site does not stock it. Never start glibenclamide")
_s["x"]["refs"] = ["REF-DM-RX-GLIB-AGE", "REF-DM-SUS-BMI"]; sign(_s, "UG-19", "UG-21")
therapy_flag = __import__("k_model").therapy_flag
therapy_flag("pioglitazone_age_60", "Pioglitazone at 60 or over", "amber",
             crit("tf_pio_60", "On pioglitazone, aged 60 or over", all=[P("glucose_lowering_therapy", "==", "pioglitazone"), P("age_years", ">=", ref="REF-DM-RX-GLIB-AGE")],
                  ref_id="REF-DM-RX-GLIB-AGE"),
             "The 2026 guideline avoids pioglitazone where there is a risk of osteoporosis; at 60 or over prefer gliclazide or a DPP-4 inhibitor. Review with the prescriber.",
             "UG26-T8-ELDERLY")
sign(REG["therapyFlags"][-1], "UG-19")
# UG-20: who gets an SGLT2 inhibitor or GLP-1 agonist (referral sites, D-DM-21 stands).
_s = item("management", "DM-ACT-RX-05")
_s["display"] = ("Type 2 diabetes with established cardiovascular disease, heart failure, or a high cardiovascular risk (overweight, hypertension or "
                 "albuminuria): the 2026 guideline puts an SGLT2 inhibitor or GLP-1 agonist first line with metformin. Refer for consideration "
                 "(stocked at regional referral hospitals, EMHSLU 2023)")
_s["when"]["any"] = _s["when"]["any"] + [P("bmi", ">=", ref="REF-DM-SUS-BMI"), P("hypertension_known"), P("uacr_abnormal_count", ">=", ref="REF-DM-KID-UACR-COUNT")]
_s["when"]["label"] = ("Type 2 diabetes with any of: established cardiovascular disease, heart failure, BMI 25 or more, hypertension, or albuminuria "
                       "on 2 or more tests")
sign(_s, "UG-20")
# UG-22: when to start insulin, with the 2026 thresholds and operators (two agents kept, RX-03).
nref("REF-DM-RX-UG26-INS-FBG", "2026 Uganda guideline: fasting glucose above this value at diagnosis is an indication for insulin", 14, "mmol/L", ["UG26-INS-IND"], "treatment")
_s = item("management", "DM-ACT-RX-04")
_s["display"] = ("Type 2 or unclassified diabetes, not on insulin, with HbA1c 10% or more, a fasting glucose above 14 or any other glucose above 16.7 mmol/L: "
                 "the 2026 guideline starts insulin. Check ketones first")
_hi = lambda f: P(f, ">", ref="REF-DM-CTRL-SEVERE-GLU")
_s["when"]["any"] = [P("hba1c", ">=", ref="REF-DM-CTRL-SEVERE-HBA1C"), P("fasting_pg", ">", ref="REF-DM-RX-UG26-INS-FBG"),
                     _hi("random_pg"), _hi("capillary_glucose"), _hi("postprandial_pg"), _hi("ogtt_1h_pg"), _hi("ogtt_2h_pg")]
_s["when"]["label"] = ("Type 2 or unclassified, not on insulin, with HbA1c 10% or more, fasting glucose above 14 mmol/L, or random, meter or post-load "
                       "glucose above 16.7 mmol/L")
sign(_s, "UG-22")
step("DM-ACT-RX-04B", "On high-dose steroids, with diabetes, not on insulin: the 2026 guideline lists this as an indication for insulin. Review treatment",
     crit("rx_steroid_insulin", "On a glucocorticoid, with diabetes, not on insulin", all=[P("on_glucocorticoid"), P("glucose_lowering_therapy", "!=", "insulin")],
          atLeast=(1, DM_KNOWN()), claim_id="UG26-INS-IND"), "UG26-INS-IND", "therapy_review", "DM-ACT-RX")
sign(REG["management"][-1], "UG-22")
sign(item("management", "DM-ACT-RX-03"), "UG-22 (keep two agents)")
# UG-23: insulin storage and injection, the 2026 practical detail added to EADSG.
_s = item("management", "DM-ACT-EDU-05")
_s["display"] = ("On insulin: check storage and injection sites. Storage (EADSG 2019 and the 2026 guideline): unopened insulin kept more than 2 months goes "
                 "in a fridge (2 to 8 °C), never frozen; the vial in use below 30 °C at room temperature in a clean plastic container with dry cotton wool, "
                 "out of the sun, for up to 6 weeks (4 weeks if the room reaches 30 °C); never in water, on the floor or in sand; avoid clay pots. "
                 "Injection: rotate abdomen, thigh, buttocks and outer arm; short needles (4 to 5 mm pen, 6 mm syringe); a new needle ideally every day")
_s["x"]["sources"] = _s["x"].get("sources", []) + ["UG26-STORE", "UG26-STORE-WATER"]; sign(_s, "UG-23")
# UG-24: blood-pressure classes by level and the referral point.
_s = item("management", "DM-ACT-RX-07")
_s["display"] = ("Blood pressure at or above 130/80 on two occasions: review treatment. 2026 guideline: below 150/90, one medicine (an ACE inhibitor or ARB "
                 "with kidney disease or CVD; otherwise an ACE inhibitor, ARB, calcium-channel blocker or thiazide); 150/90 or more, two (an ACE inhibitor "
                 "or ARB with a calcium-channel blocker or thiazide). Not a loop diuretic for blood pressure alone; a beta-blocker only with a compelling reason")
_s["x"]["refs"] = ["REF-DM-CVD-BP-2DRUG-SBP", "REF-DM-CVD-BP-2DRUG-DBP"]; sign(_s, "UG-24")
_s = item("management", "DM-ACT-REFER-BP-02")
_s["display"] = ("Blood pressure above 130/80 on two medicines: at a health centre, routine referral. At hospital level the 2026 guideline adds a third class "
                 "and then a mineralocorticoid-receptor antagonist before referring to a hypertension specialist")
sign(_s, "UG-24")
# UG-25: an ACE inhibitor or ARB for confirmed albuminuria, whatever the blood pressure.
_s = item("management", "DM-ACT-RX-08")
_s["when"]["all"] = [q for q in _s["when"]["all"] if q["feature"] != "bp_raised_two_occasions"]
_s["when"]["label"] = "Albuminuria on 2 or more tests, and no ACE inhibitor or ARB"
_s["display"] = ("Confirmed albuminuria and no ACE inhibitor or ARB: the 2026 guideline starts one, whatever the blood pressure. Counsel a woman who could "
                 "become pregnant first")
sign(_s, "UG-25")
# UG-26: statins by age and risk; LDL below 1.8 in ASCVD.
_r = REFS["REF-DM-CVD-LDL-ASCVD"]; _r["value"] = 1.8; _r["x"]["claims"] = ["UG26-STATIN"] + _r["x"]["claims"]; _r["x"]["signed"] = f"UG-26 {SIGNED}"
nref("REF-DM-CVD-UG26-STATIN-YOUNG", "2026 Uganda guideline: from this age (to 39) consider a statin when CVD risk factors coexist", 20, "years", ["UG26-STATIN"], "cvd")
_s = item("management", "DM-ACT-RX-06")
_s["display"] = ("Type 2 diabetes aged 40 or over, not on a statin: the 2026 guideline starts one: moderate intensity from 40 to 75, high intensity with any "
                 "cardiovascular risk factor; over 75 after weighing the benefit. Re-check lipids 4 to 12 weeks after starting")
sign(_s, "UG-26")
for _sid, _disp, _lab, _all, _any, _ref in (
        ("DM-ACT-RX-06B", "Diabetes aged 20 to 39 with a cardiovascular risk factor (hypertension, smoking or albuminuria), not on a statin: the 2026 guideline "
         "considers one with lifestyle change", "Aged 20 to 39, not on a statin, with hypertension, smoking or albuminuria on 2 or more tests",
         [P("age_years", ">=", ref="REF-DM-CVD-UG26-STATIN-YOUNG"), P("age_years", "<", ref="REF-DM-CVD-STATIN-AGE"), P("on_statin", "absent")],
         [P("hypertension_known"), P("smoking_current"), P("uacr_abnormal_count", ">=", ref="REF-DM-KID-UACR-COUNT")], "REF-DM-CVD-UG26-STATIN-YOUNG"),
        ("DM-ACT-RX-06C", "Diabetic kidney disease, not on a statin: the 2026 guideline puts everyone with kidney disease on one",
         "Not on a statin, with eGFR below 60 or albuminuria on 2 or more tests", [P("on_statin", "absent")],
         [P("egfr", "<", ref="REF-DM-KID-GFR-G3A"), P("uacr_abnormal_count", ">=", ref="REF-DM-KID-UACR-COUNT")], "REF-DM-KID-GFR-G3A"),
        ("DM-ACT-RX-06D", "Established cardiovascular disease: the 2026 guideline uses a high-intensity statin with ezetimibe from the start, aiming for LDL "
         "below 1.8 mmol/L. Review the current lipid treatment", "Established cardiovascular disease", [P("cvd_established")], None, "REF-DM-CVD-LDL-ASCVD"),
        ("DM-ACT-RX-06E", "Living with HIV, with diabetes, not on a statin: the 2026 guideline starts one at low to moderate cardiovascular risk",
         "On antiretroviral therapy, not on a statin", [P("hiv_on_art"), P("on_statin", "absent")], None, "REF-DM-CVD-STATIN-AGE")):
    step(_sid, _disp, crit(_sid.lower().replace("-", "_"), _lab, all=_all, any=_any, atLeast=(1, DM_KNOWN()), ref_id=_ref), "UG26-STATIN", "therapy_review", "DM-ACT-RX")
    sign(REG["management"][-1], "UG-26")
REG["management"][-1]["x"]["neutralDisplay"] = "Not on a statin: review whether one is indicated (2026 guideline)"
target("tgt_ldl_ascvd", "ldl_cholesterol", None, "LDL cholesterol below 1.8 mmol/L (2026: established cardiovascular disease or high risk)",
       crit("tgt_ldl", "Established cardiovascular disease", all=[P("cvd_established")], atLeast=(1, DM_KNOWN()), claim_id="UG26-STATIN"),
       upper_ref="REF-DM-CVD-LDL-ASCVD", claim_id="UG26-STATIN")
REG["targets"][-1]["x"]["ages"] = "adult"; sign(REG["targets"][-1], "UG-26")
# UG-41: neuropathic pain, the 2026 list with ADA's caution on opioids.
_s = item("management", "DM-ACT-RX-12")
_s["display"] = ("Numb, burning or tingling feet with a sign on examination: if it is painful, the 2026 guideline lists gabapentin, pregabalin, duloxetine, "
                 "carbamazepine, valproate, tramadol and alpha-lipoic acid; opioids such as tramadol are not first line (ADA)")
sign(_s, "UG-41")

# ═══ E. Complications, acute care, hospital, HIV and TB, education (UG-27, UG-30 to UG-40, UG-42 to UG-46) ═══
SU = ["glibenclamide", "gliclazide", "glimepiride"]
# UG-27: mild retinopathy is re-examined yearly whatever the control (supersedes that part of D-DM-14).
step("DM-ACT-SCREEN-EYE-02", "Mild retinopathy: retinal examination every year (2026 guideline: annually for mild to moderate NPDR)",
     crit("due_eye_mild", "Mild non-proliferative retinopathy, 12 months or more since the last retinal examination",
          all=[P("retinopathy_stage", "==", "mild_npdr"), P("months_since_eye_screen", ">=", ref="REF-DM-EYE-RECALL-MILD-MIN")], ref_id="REF-DM-EYE-RECALL-MILD-MIN"),
     "UG26-EYE", "screen", "DM-ACT-SCREEN")
sign(REG["management"][-1], "UG-27")
# UG-30: a child with vomiting (without diarrhoea) or unexplained abdominal pain and no glucose: fingerstick glucose now.
if "diarrhoea" not in FEATURES: N("diarrhoea", "Diarrhoea", "symptom", "boolean", FEATURES["vomiting"]["section"])
drule("DM-SUS-PAED-06", "A child or adolescent vomiting without diarrhoea, or with unexplained abdominal pain, and no glucose today: fingerstick glucose now "
      "(2026: new diabetes can present as gastroenteritis, malaria or pneumonia)", "dka",
      crit("sus_paed_vomit", "Under 16, vomiting or abdominal pain", any=[P("vomiting"), P("abdominal_pain")], claim_id="UG26-CHILD-VOMIT"),
      "moderate", "same_day", ["capillary_glucose"], ["Gastroenteritis (with diarrhoea), malaria, pneumonia"], "UG26-CHILD-VOMIT", "DM-SUS-PAED",
      ageBands=["child", "adolescent"])
_r = REG["rules"][-1]; sign(_r, "UG-30")
_r["x"]["notWhen"] = [crit("sus_paed_vomit_diarrhoea", "Diarrhoea", all=[P("diarrhoea")], claim_id="UG26-CHILD-VOMIT"),
                      crit("sus_paed_vomit_glucose", "A glucose recorded at this visit", any=[P("capillary_glucose", "recorded"), P("random_pg", "recorded"),
                           P("glucose_meter_extreme", "recorded")], claim_id="UG26-CHILD-VOMIT")]
# UG-31, UG-32: the 2026 crisis numbers (triage thresholds kept).
for _rid, _v, _c in (("REF-DM-ACU-HHS-GLU", 30.0, "UG26-HHS"), ("REF-DM-ACU-DKA-HCO3", 15, "UG26-DKA")):
    REFS[_rid]["value"] = _v; REFS[_rid]["x"]["claims"] = [_c] + REFS[_rid]["x"]["claims"]; REFS[_rid]["x"]["signed"] = f"UG-31/UG-32 {SIGNED}"
def _relabel(c):
    if isinstance(c, dict):
        for k in ("label", "display"):
            if isinstance(c.get(k), str): c[k] = c[k].replace("33.3", "30.0")
        for q in (c.get("all") or []) + (c.get("any") or []) + ((c.get("atLeast") or {}).get("of") or []):
            if q.get("_ref") == "REF-DM-ACU-HHS-GLU": q["value"] = 30.0
for _it in REG["rules"] + REG["management"] + REG["therapyFlags"]:
    if "REF-DM-ACU-HHS-GLU" in str(_it):
        _relabel(_it); _relabel(_it["when"])
        for _n in _it["x"].get("notWhen") or []: _relabel(_n)
        sign(_it, "UG-31")
# UG-33: start intravenous fluids before a transfer (volumes belong to the acute pathway).
for _rid in ("DM-ACU-ROUTE-02", "DM-ACU-ROUTE-11", "DM-ACU-ROUTE-14", "DM-ACU-ROUTE-24", "DM-ACU-ROUTE-24B"):
    _r = item("rules", _rid)
    _r["display"] = _r["display"].rstrip(". ") + ". If this site will transfer the patient, start intravenous fluids before transfer (2026: health centre III starts fluids, then refers)"
    sign(_r, "UG-33")
# UG-34: hyperglycaemia in hospital.
drule("DM-SUS-INPT-02", "Admitted: check a random glucose and, where valid, HbA1c (2026 screens every admitted medical and surgical patient)", "diabetes_undiagnosed",
      crit("sus_admitted", "Inpatient, no glucose at this visit", all=[P("care_setting", "==", "inpatient")], claim_id="UG26-INPT-SCREEN"),
      "low", "routine", ["random_pg", "hba1c"], ["Stress hyperglycaemia"], "UG26-INPT-SCREEN", "DM-SUS-INPT")
_r = REG["rules"][-1]; _r["x"]["runWhenOverride"] = "always"; sign(_r, "UG-34")
_r["x"]["notWhen"] = [crit("sus_admitted_done", "A glucose recorded at this visit", any=[P("random_pg", "recorded"), P("capillary_glucose", "recorded")], claim_id="UG26-INPT-SCREEN")]
for _rid, _txt, _v in (("REF-DM-INPT-UG26-LOW", "lower edge of the in-hospital glucose target (not critically ill)", 5.6),
                       ("REF-DM-INPT-UG26-HIGH", "upper edge of the in-hospital glucose target; treatment starts only if persistently above it", 10.0)):
    nref(_rid, f"2026 Uganda guideline: {_txt}", _v, "mmol/L", ["UG26-INPT-TGT"], "hospital")
target("tgt_glucose_inpatient", "capillary_glucose", None, "In hospital: glucose 5.6 to 10.0 mmol/L (2026, not critically ill); treat only if persistently above 10.0",
       crit("tgt_inpt", "Inpatient with diabetes", all=[P("care_setting", "==", "inpatient")], atLeast=(1, DM_KNOWN()), claim_id="UG26-INPT-TGT"),
       upper_ref="REF-DM-INPT-UG26-HIGH", lower_ref="REF-DM-INPT-UG26-LOW", claim_id="UG26-INPT-TGT")
REG["targets"][-1]["x"]["ages"] = "adult"; sign(REG["targets"][-1], "UG-34")
therapy_flag("oral_agents_in_hospital", "Metformin, a sulfonylurea or pioglitazone in an inpatient", "amber",
             crit("tf_inpt_oral", "Inpatient on metformin, a sulfonylurea or pioglitazone", all=[P("care_setting", "==", "inpatient")],
                  any=[P("glucose_lowering_therapy", "==", g) for g in ["metformin", "pioglitazone"] + SU], claim_id="UG26-INPT-AVOID"),
             "The 2026 guideline avoids metformin, sulfonylureas and pioglitazone in hospital, and avoids premixed insulin and a sliding scale on its own: "
             "basal insulin with correction doses instead. Review with the prescriber.", "UG26-INPT-AVOID")
sign(REG["therapyFlags"][-1], "UG-34")
# UG-35: before surgery.
_f = next(f for f in REG["therapyFlags"] if f["id"] == "sglt2_before_surgery_or_fast")
_f["action"] = ("Stop the SGLT2 inhibitor 3 to 4 days before surgery (2026) and during a prolonged fast: ketoacidosis can come with a near-normal glucose. "
                "Agree the plan with the prescriber.")
sign(_f, "UG-35")
nref("REF-DM-SURG-UG26-HBA1C", "2026 Uganda guideline: HbA1c goal before elective surgery, below this value", 8.0, "%", ["UG26-SURG"], "hospital")
therapy_flag("metformin_before_surgery", "Metformin before surgery", "amber",
             crit("tf_met_surg", "On metformin, surgery planned", all=[P("glucose_lowering_therapy", "==", "metformin"), P("surgery_or_fasting_planned")], claim_id="UG26-SURG"),
             "2026 guideline: hold metformin on the day of surgery and other tablets that morning; aim for HbA1c below 8.0% before elective surgery.", "UG26-SURG")
_f = REG["therapyFlags"][-1]; _f["x"]["refs"] = ["REF-DM-SURG-UG26-HBA1C"]; sign(_f, "UG-35")
# UG-36: glucose every 6 months in HIV.
nref("REF-DM-HIV-UG26-INTERVAL", "2026 Uganda guideline: people living with HIV are screened for diabetes at this interval", 6, "months", ["UG26-HIV"], "screening")
_r = item("rules", "DM-SUS-POP-HIV-01")
_r["display"] = "Living with HIV on ART: glucose every 6 months (2026)"
_r["when"]["any"] = [P("never_glucose_tested"), P("months_since_glucose_test", ">=", ref="REF-DM-HIV-UG26-INTERVAL")]
_r["when"]["label"] = "On ART, never tested or 6 months or more since the last glucose"
sign(_r, "UG-36")
# UG-37 (D-DM-33 stands): the 2026 sentence shown, ending with the ART clinic.
_dtg = " The 2026 diabetes guideline says 'Avoid dolutegravir in individuals with diabetes and HIV comorbidity': discuss with the ART clinic; never change ART here."
_r = item("rules", "DM-SUS-POP-DTG-01"); _r["display"] = _r["display"].rstrip(". ") + "." + _dtg; sign(_r, "UG-37 (D-DM-33 stands)")
_f = next(f for f in REG["therapyFlags"] if f["id"] == "dolutegravir_with_metformin"); _f["action"] = _f["action"] + _dtg; sign(_f, "UG-37 (D-DM-33 stands)")
# UG-38: the national two-step at TB diagnosis.
nref("REF-DM-TB-UG26-RBG", "2026 Uganda guideline: at TB diagnosis a random glucose at or above this value is followed by a fasting glucose or HbA1c", 6.1, "mmol/L", ["UG26-TB-DM"], "screening")
_r = item("rules", "DM-SUS-POP-TB-01")
_r["display"] = ("TB: a random glucose at diagnosis; if it is 6.1 mmol/L or more, a fasting glucose (preferred) or HbA1c (2026). Re-check after the first month "
                 "of TB treatment if raised")
_r["x"]["refs"] = ["REF-DM-TB-UG26-RBG"]; sign(_r, "UG-38")
# UG-39: TB screen at diabetes diagnosis.
step("DM-ACT-SCREEN-TB-02", "New diabetes: screen for TB now (symptom screen at least; sputum test or chest X-ray where available). Diabetes triples the odds of TB (2026)",
     crit("screen_tb_new", "Diabetes met at this visit on a glucose or HbA1c result", any=[P(f, "recorded") for f in ("fasting_pg", "random_pg", "ogtt_2h_pg", "hba1c", "capillary_glucose")], claim_id="UG26-DM-TB"), "UG26-DM-TB", "screen", "DM-ACT-SCREEN")
_s = REG["management"][-1]; _s["x"]["runWhenOverride"] = "newly_met"; sign(_s, "UG-39")
# UG-40: rifampicin lowers metformin, sulfonylureas and DPP-4 inhibitors.
_f = next(f for f in REG["therapyFlags"] if f["id"] == "sulfonylurea_with_rifampicin")
_f["display"] = "Metformin, a sulfonylurea or a DPP-4 inhibitor with rifampicin"
_f["when"]["any"] = [P("glucose_lowering_therapy", "==", g) for g in ["metformin", "dpp4_inhibitor"] + SU]
_f["when"]["label"] = "On rifampicin, with metformin, a sulfonylurea or a DPP-4 inhibitor"
_f["action"] = ("Rifampicin lowers metformin, sulfonylurea and DPP-4 inhibitor levels by 30 to 80% (2026): glucose control may worsen, so monitor it. "
                "2026: insulin first if HbA1c is 10% or more or glucose is very high; otherwise metformin if overweight, a sulfonylurea or DPP-4 inhibitor if BMI is below 25.")
sign(_f, "UG-40")
# UG-42: vitamin B12 yearly on metformin where it can be measured.
N("months_since_b12", "Months since the last vitamin B12 level", "investigation", "number", FEATURES["b12_deficiency"]["section"], unit="months")
step("DM-ACT-SCREEN-B12-02", "On metformin: vitamin B12 every year (2026: on long-term metformin)",
     crit("due_b12", "On metformin, 12 months or more since the last B12", all=[P("glucose_lowering_therapy", "==", "metformin"),
          P("months_since_b12", ">=", ref="REF-DM-CVD-LIPID-INTERVAL")], ref_id="REF-DM-CVD-LIPID-INTERVAL"),
     "UG26-B12", "screen", "DM-ACT-SCREEN")
_s = REG["management"][-1]; _s["x"]["requiresCapability"] = "lab.vitamin_b12"; sign(_s, "UG-42")
# UG-43: the first-visit checklist.
step("DM-ACT-INITIAL-01", "First diabetes visit (2026 Table 5): HIV test, full blood count, kidney and liver function, lipids, potassium if on an ACE inhibitor, "
     "ARB or diuretic, waist circumference, a psychosocial screen (depression, anxiety, diabetes distress) and a dental check",
     crit("initial_visit", "Diabetes met at this visit on a glucose or HbA1c result", any=[P(f, "recorded") for f in ("fasting_pg", "random_pg", "ogtt_2h_pg", "hba1c", "capillary_glucose")], claim_id="UG26-HIVSER"),
     "UG26-HIVSER", "screen", "DM-ACT-SCREEN")
_s = REG["management"][-1]; _s["x"]["runWhenOverride"] = "newly_met"; sign(_s, "UG-43")
# UG-44: the Ugandan plate and the avoid-list.
_s = item("management", "DM-ACT-EDU-01")
_s["display"] = ("Counsel at this visit: diet, physical activity, tobacco and alcohol, and taking medicines. 2026: half the plate non-starchy vegetables "
                 "(greens, tomatoes, onions), a quarter lean protein (fish, chicken, beans), a quarter whole grains or starchy food; avoid honey, processed "
                 "juices and sugar; no chromium, vitamin D, cinnamon or aloe vera supplements")
sign(_s, "UG-44")
# UG-45: prevention: 7% weight loss; consider metformin in prediabetes with BMI 35 or prior GDM.
REFS["REF-DM-ACT-EDU-WEIGHT"]["value"] = 7; REFS["REF-DM-ACT-EDU-WEIGHT"]["x"]["claims"] = ["UG26-PREVENT"] + REFS["REF-DM-ACT-EDU-WEIGHT"]["x"]["claims"]
REFS["REF-DM-ACT-EDU-WEIGHT"]["x"]["signed"] = f"UG-45 {SIGNED}"
for _sid in ("DM-ACT-EDU-10", "DM-ACT-EDU-10B", "DM-ACT-EDU-10C"):
    _s = item("management", _sid)
    _s["display"] = _s["display"].split(":")[0] + ": lose 7% of body weight, 150 minutes of activity a week, and a test every year (2026)"
    sign(_s, "UG-45")
nref("REF-DM-PREV-UG26-BMI", "2026 Uganda guideline: metformin to prevent type 2 diabetes, especially at or above this BMI (or aged 25 to 44, or prior GDM)", 35, "kg/m2", ["UG26-PREVENT-MET"], "prevention")
step("DM-ACT-RX-15", "Prediabetes with BMI 35 or more or gestational diabetes before: the 2026 guideline considers metformin to prevent type 2 diabetes "
     "(especially aged 25 to 44), alongside weight loss and activity",
     crit("rx_prevent", "Previously in the intermediate range, with BMI 35 or more or gestational diabetes before",
          all=[P("prior_intermediate_hyperglycaemia")], any=[P("bmi", ">=", ref="REF-DM-PREV-UG26-BMI"), P("prior_gdm")], ref_id="REF-DM-PREV-UG26-BMI"),
     "UG26-PREVENT-MET", "therapy_review", "DM-ACT-RX")
_s = REG["management"][-1]; _s["x"]["runWhenOverride"] = "not_established"
_s["x"]["neutralDisplay"] = "Prediabetes with a high-risk feature: consider metformin to prevent type 2 diabetes (2026)"
sign(_s, "UG-45")
# UG-46 (BP <130/80 kept): peripheral arterial disease counts as established ASCVD.
_s = item("management", "DM-ACT-RX-09")
_s["display"] = ("Established cardiovascular disease, peripheral arterial disease included, and not on an antiplatelet: it is for secondary prevention (with a "
                 "high-intensity statin, 2026). Not after a bleeding stroke or a stroke of unknown type; check bleeding risk")
sign(_s, "UG-46 (BP <130/80 kept)")

# Under 16 a therapy flag shows its referral wording, never its advice (P0-01, U07).
for _fid in ("oral_agents_in_hospital", "metformin_before_surgery", "pioglitazone_age_60"):
    next(f for f in REG["therapyFlags"] if f["id"] == _fid)["x"]["under16Action"] = "Under 16: refer today to the paediatric or specialist team. Do not change the medicine here."
