"""GATE A, signed 2026-10-05 by the CSO (docs/ncd/diabetes/gate-a-signoff.json): what the
signatures change in the content. Every change names its decision. Nothing here is a
new clinical number: each value comes from a UCG 2023 claim read at source
(research/A13-ucg.json) or an existing reference entry."""
from lib import P, crit, FEATURES, REFS
from k_model import REG, drule
from k_review import tag, item, last, nref, N, ADULT, DISPOSITION
import k_r5, k_r7

SIGNED = "signed at GATE A 2026-10-05"

# ── items switched on or kept off by the signatures ────────────────────────
for _it in REG["management"] + REG["rules"]:
    eb = _it["x"].get("enabledBy")
    if eb == "D-DM-20" or eb == "D-DM-38":                       # treatment review prompts (no dose); WHO PEN referral at glucose 18
        _it["x"]["enabled"] = True; _it["x"]["signed"] = f"{eb} {SIGNED}"
    elif eb == "D-DM-20 and D-DM-21":                            # SGLT2/GLP-1 for heart and kidney: referral sites only, as 'refer for consideration'
        _it["x"]["enabled"] = True; _it["x"]["requiresCapability"] = "site.referral"; _it["x"]["signed"] = f"D-DM-20, D-DM-21 {SIGNED}"
    elif eb in ("D-DM-05", "D-DM-12"):                           # ADA 'everyone from 35' stays off; universal OGTT only where a site opts in
        _it["x"]["signed"] = f"{eb} {SIGNED}: stays off"

# ── D-DM-01, D-DM-02, P0-25: the Uganda criteria set, from UCG 2023 8.1.3 as printed ─
nref("REF-DM-DX-UCG-FPG", "UCG 2023: fasting blood sugar above this value (confirmed by a repeat) is a diagnostic criterion", 7.0, "mmol/L", ["UCG-DM-01"], "diagnosis")
nref("REF-DM-DX-UCG-OGTT2H", "UCG 2023: two-hour blood sugar after 75 g above this value (confirmed by a repeat) is a diagnostic criterion", 11.1, "mmol/L", ["UCG-DM-01"], "diagnosis")
nref("REF-DM-DX-UCG-HBA1C", "UCG 2023: HbA1c above this value (confirmed by a repeat) is a diagnostic criterion", 6.5, "%", ["UCG-DM-01"], "diagnosis")
nref("REF-DM-DX-UCG-RBS", "UCG 2023: random blood sugar above this value with classical symptoms is a diagnostic criterion", 11.1, "mmol/L", ["UCG-DM-01"], "diagnosis")
UCG_SYM = lambda: [P("polyuria"), P("polydipsia"), P("polyphagia"), P("foot_numbness_burning")]
REPEAT = lambda: P("repeat_abnormal_result")
_ucg = item("diagnosis_pending", "ug_ucg_2023")
_ucg["anyOf"] = [
    crit("ucg_fpg_repeat", "Fasting blood sugar above 7.0 mmol/L, confirmed by a repeat result in the diabetes range", all=[P("fasting_pg", ">", ref="REF-DM-DX-UCG-FPG"), REPEAT()], ref_id="REF-DM-DX-UCG-FPG"),
    crit("ucg_ogtt_repeat", "Two-hour blood sugar after 75 g above 11.1 mmol/L, confirmed by a repeat result", all=[P("ogtt_2h_pg", ">", ref="REF-DM-DX-UCG-OGTT2H"), REPEAT()], ref_id="REF-DM-DX-UCG-OGTT2H"),
    crit("ucg_hba1c_repeat", "HbA1c above 6.5%, confirmed by a repeat result", all=[P("hba1c", ">", ref="REF-DM-DX-UCG-HBA1C"), REPEAT()], ref_id="REF-DM-DX-UCG-HBA1C"),
    crit("ucg_random_symptoms", "Random blood sugar above 11.1 mmol/L with a classical symptom (passing a lot of urine, thirst, hunger, or burning, pins and needles or numbness)",
         all=[P("random_pg", ">", ref="REF-DM-DX-UCG-RBS")], any=UCG_SYM(), ref_id="REF-DM-DX-UCG-RBS"),
]
_ucg["x"].pop("pending", None)
_ucg["x"]["default"] = True
_ucg["x"]["note"] = ("Uganda's default set (D-NCD-11, D-DM-01), copied from UCG 2023 8.1.3 as printed: '>' for every threshold (P0-25) and UCG's four classical symptoms (D-DM-02). "
                     "WHO HEARTS-D 2020 is computed alongside; a referral that waits for 'diabetes met at this visit' runs when either set is met.")
_ucg["x"]["signed"] = f"D-DM-01, D-DM-02, P0-25 {SIGNED}"
item("diagnosis", "who_hearts_d_2020")["x"]["default"] = False
k_r5.SEMANTICS["defaultSets"] = ("Diagnosis: UCG 2023 (`ug_ucg_2023`) is the default set, WHO HEARTS-D 2020 is shown alongside, and 'met at this visit' (for referrals) means either set met. "
                                 "Gestational diabetes: WHO 2013 is the default, UCG 2023's set alongside (P0-26).")

# ── D-DM-28, P0-26: UCG's gestational diabetes set alongside WHO 2013 ──────
nref("REF-DM-PREG-UCG-FBS", "UCG 2023: in pregnancy, fasting blood sugar above this value is gestational diabetes", 5.6, "mmol/L", ["UCG-GDM-03"], "pregnancy")
nref("REF-DM-PREG-UCG-2H", "UCG 2023: in pregnancy, plasma glucose above this value 2 hours after 75 g is gestational diabetes", 7.8, "mmol/L", ["UCG-GDM-03"], "pregnancy")
_who13 = item("diagnosis_pending", "who_2013_gdm"); _who13["x"]["default"] = True; _who13["x"]["signed"] = f"P0-26 {SIGNED}"
_gdm = {"id": "ug_ucg_2023_gdm", "standard": "local", "version": "UCG 2023 16.2.5", "x": {**{k: v for k, v in _who13["x"].items() if k not in ("pending", "default", "signed")}, "default": False,
        "note": "UCG 2023's gestational criteria, shown beside WHO 2013 (the default, P0-26)."}}
_gdm["anyOf"] = [crit("ucg_gdm_fpg", "Fasting blood sugar above 5.6 mmol/L in pregnancy", all=[P("pregnant"), P("fasting_pg", ">", ref="REF-DM-PREG-UCG-FBS")], ref_id="REF-DM-PREG-UCG-FBS"),
                 crit("ucg_gdm_2h", "Plasma glucose above 7.8 mmol/L 2 hours after 75 g in pregnancy", all=[P("pregnant"), P("ogtt_2h_pg", ">", ref="REF-DM-PREG-UCG-2H")], ref_id="REF-DM-PREG-UCG-2H")]
_gdm["citation"] = _gdm["anyOf"][0]["citation"]
REG["diagnosis_pending"].append(_gdm)

# ── D-DM-12: who to test in pregnancy, on UCG's risk factors ───────────────
nref("REF-DM-PREG-UCG-BMI", "UCG 2023: a body-mass index above this value is an indication to screen for gestational diabetes", 35, "kg/m2", ["UCG-GDM-01"], "pregnancy")
nref("REF-DM-PREG-UCG-AGE", "UCG 2023: an age above this value is an indication to screen for gestational diabetes", 40, "years", ["UCG-GDM-01"], "pregnancy")
_sec = FEATURES["prior_gdm"]["section"]
for _code, _disp in (("fh_diabetes_first_degree", "Diabetes in a parent, brother or sister"),
                     ("prior_macrosomia_or_stillbirth", "A previous baby over 4 kg, or an unexplained third-trimester death"),
                     ("polyhydramnios", "Polyhydramnios in this pregnancy"), ("glycosuria", "Glucose in the urine in this pregnancy"),
                     ("fetus_large_for_dates", "The baby is large for gestational age in this pregnancy")):
    if _code not in FEATURES: N(_code, _disp, "history", "boolean", _sec)
drule("DM-SUS-PREG-UCG", "Pregnant, with a risk factor for gestational diabetes (UCG 2023): test for it (a 75 g OGTT where the site can run one; otherwise a fasting glucose)",
      "gestational_diabetes", crit("sus_preg_ucg", "Pregnant, with any of: BMI above 35, age above 40, gestational diabetes before, diabetes in a first-degree relative, a previous baby over 4 kg or an unexplained third-trimester death, polyhydramnios, glucose in the urine, a baby large for dates",
                                   all=[P("pregnant")], any=[P("bmi", ">", ref="REF-DM-PREG-UCG-BMI"), P("age_years", ">", ref="REF-DM-PREG-UCG-AGE"), P("prior_gdm"), P("fh_diabetes_first_degree"),
                                                             P("prior_macrosomia_or_stillbirth"), P("polyhydramnios"), P("glycosuria"), P("fetus_large_for_dates")], ref_id="REF-DM-PREG-UCG-BMI"),
      "moderate", "routine", ["fasting_pg", "ogtt_1h_pg", "ogtt_2h_pg"], ["Diabetes before the pregnancy, not yet recorded (the OGTT will show it)"], "UCG-GDM-02", "DM-SUS-PREG", lane="suspect",
      notes="UCG 2023 16.2.5 lists these as 'risk factors (and indication for screening)'. A universal 24-28-week OGTT (DM-SUS-PREG-01) stays off unless a site opts in (D-DM-12).",
      proposal={"kind": "test.order", "test": "test.ogtt", "tier": "routine"})
_r = REG["rules"][-1]; _r["x"]["signed"] = f"D-DM-12 {SIGNED}"
_r["x"]["notWhen"] = [crit("sus_preg_ucg_known", "Diabetes or gestational diabetes already recorded in this pregnancy", any=k_r7.DM_ANY(), ref_id="REF-DM-PREG-UCG-BMI")]

# ── D-DM-13: UCG's post-meal target ────────────────────────────────────────
nref("REF-DM-CTRL-PPG-UCG", "UCG 2023: postprandial sugar target, below this value", 10.0, "mmol/L", ["UCG-DM-10"], "control")
_t = item("targets", "tgt_ppg_surrogate"); _t["upper"] = {"ref": "REF-DM-CTRL-PPG-UCG", "value": 10.0, "unit": "mmol/L"}
_t["display"] = "Glucose after a meal below 10.0 mmol/L (UCG 2023)"; _t["x"]["signed"] = f"D-DM-13 {SIGNED}"
for _bid in ("ppg_control_who", "pcap_control_who"):
    _b = item("interpretation", _bid)
    for _x in _b["bands"]:
        if _x["code"] == "at_target": _x["to"] = 10.0
        if _x["code"] == "above_target": _x["from"] = 10.0
    _b["x"]["refs"] = ["REF-DM-HYPO-L1", "REF-DM-CTRL-PPG-UCG"]; _b["x"]["signed"] = f"D-DM-13 {SIGNED}"

# ── D-DM-15: lipids where the site can run them ────────────────────────────
item("management", "DM-ACT-SCREEN-LIPID-01")["x"]["requiresCapability"] = "lab.lipids"

# ── D-DM-20, D-DM-22, D-DM-34: the ladder in UCG's words (review prompts, no dose) ─
_s = item("management", "DM-ACT-RX-01")
_s["display"] = ("Type 2 diabetes above target and not on medicine: review treatment. UCG 2023: if sugars are not very high and the person is willing, lifestyle for 3 months first; "
                 "otherwise, or if that is not enough, metformin, with diet and activity")
_s = item("management", "DM-ACT-RX-01B"); _s["display"] = _s["display"].replace("WHO's first medicine is metformin, with diet and activity", "UCG 2023: lifestyle for 3 months first unless sugars are very high, then metformin")
_s = item("management", "DM-ACT-RX-02")
_s["display"] = ("On metformin without a sulfonylurea or insulin, and above target despite taking it: review treatment. UCG 2023's second line is glimepiride (check what this level of care stocks); "
                 "never start glibenclamide")
k_r5.SEMANTICS["signed"] = "Content changed by the GATE A signatures carries `x.signed`; see docs/ncd/diabetes/gate-a-signoff.json."

# ── D-DM-14, STOP 5 answers 2026-10-05: 'urgent' for the eyes means ICO's timings ─
_s = item("management", "DM-ACT-REFER-EYE-01")
_s["display"] = ("Severe or proliferative retinopathy, or macular oedema involving the centre: refer to an ophthalmologist, "
                 "within 1 month for proliferative retinopathy or centre-involving oedema, within 3 months for severe retinopathy (ICO)")
_s["x"]["refs"] = ["REF-DM-EYE-RECALL-PDR", "REF-DM-EYE-RECALL-DME-CI", "REF-DM-EYE-RECALL-SEVERE"]
_s["x"]["signed"] = "D-DM-14 as ICO's timings, STOP 5 answers 2026-10-05 (docs/ncd/diabetes/phase-5/stop5-signoff.json)"

DISPOSITION.update({})
