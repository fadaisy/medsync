"""Sources review, signed by the CSO 2026-10-05 (docs/ncd/diabetes/sources-review.md): what the sources
read at source change. D-DM-11, D-DM-22, D-DM-26, D-DM-42. Quotes: research/A14-sources-2026-10-05.json."""
from lib import P, crit, cite, FEATURES, REFS
from k_model import REG, drule
from k_review import item, nref, N
import k_r7

SIGNED = "sources review signed 2026-10-05 (docs/ncd/diabetes/sources-review.md)"

# ── D-DM-11: C-peptide, read from ADA 2026 Fig. 2.1 and the Holt 2021 legend ─────────────
for _rid in ("REF-DM-CLS-CPEP-LOW", "REF-DM-CLS-CPEP-HIGH"):
    _e = REFS[_rid]
    _e["x"].pop("needsCsoInput", None)
    _e["x"]["claims"] = ["SRC-ADA26-FIG21", "SRC-HOLT21-FIG1"] + [c for c in _e["x"]["claims"] if not c.startswith("SRC-")]
    _e["x"]["verification"] = {"verdict": "confirmed", "note": "Fig. 2.1 read as an image and as text on 2026-10-05.", "foundQuote": "", "urlUsed": "", "batch": None}
    _e["x"]["signed"] = f"D-DM-11 {SIGNED}"
nref("REF-DM-CLS-CPEP-AGE", "C-peptide flowchart (ADA 2026 Fig. 2.1): below this age, a low C-peptide reads as type 1 without waiting", 35, "years", ["SRC-ADA26-FIG21"], "classify")
nref("REF-DM-CLS-CPEP-YEARS", "C-peptide flowchart (ADA 2026 Fig. 2.1): from this age, test C-peptide only after more than this many years since diagnosis", 3, "years", ["SRC-ADA26-FIG21"], "classify")
N("hyperglycaemic_emergency_last_2_weeks", "Ketoacidosis or the hyperosmolar state in the last 2 weeks", "history", "boolean", FEATURES["c_peptide"]["section"],
  x_note="Holt 2021: do not test C-peptide within 2 weeks of a hyperglycaemic emergency. Unanswered keeps the C-peptide criterion insufficient, never met.")
_t1 = item("classifications", "type_1")
_held = _t1["x"].pop("heldOut")
_low = crit("t1_cpeptide_low",
            "Random C-peptide below 200 pmol/L in a person on insulin, with no ketoacidosis or hyperosmolar state in the last 2 weeks, "
            "and either under 35 or more than 3 years since diagnosis",
            all=[P("c_peptide", "<", ref="REF-DM-CLS-CPEP-LOW"), P("glucose_lowering_therapy", "==", "insulin"),
                 P("hyperglycaemic_emergency_last_2_weeks", "absent")],
            any=[P("age_years", "<", ref="REF-DM-CLS-CPEP-AGE"), P("years_since_diagnosis", ">", ref="REF-DM-CLS-CPEP-YEARS")],
            ref_id="REF-DM-CLS-CPEP-LOW")
_t1["supportedBy"].append(_low)
_t1["x"]["heldOut"] = {
    "why": ("Only the high criterion stays out. ADA 2026 Fig. 2.1: 600 pmol/L or more after more than 3 years, antibody negative, aged 35 or over, "
            "reads as type 2. The runtime reads supporting criteria only, so a refuting one needs an engine change; its only use would be to argue "
            "against type 1, which the pack never acts on (it never proposes stopping insulin)."),
    "criteria": [h for h in _held["criteria"] if h["id"] == "t1_cpeptide_high"]}
_t1["x"]["signed"] = f"D-DM-11 {SIGNED}"
_t1["x"]["caveat"] = ("ADA 2026 Fig. 2.1 is based on data from White European adults. Ketosis-prone diabetes, common in Africa, can show a low "
                      "C-peptide soon after ketoacidosis; the 2-week rule guards only part of that.")

# ── D-DM-22: EMHSLU 2023 levels of use ─────────────────────────────────────────────────
_s = item("management", "DM-ACT-RX-02")
_s["display"] = ("On metformin without a sulfonylurea or insulin, and above target despite taking it: review treatment. UCG 2023's second line is "
                 "glimepiride; EMHSLU 2023 stocks it from general hospitals upward, so at a health centre refer for it. Never start glibenclamide "
                 "(deleted from EMHSLU 2023)")
_s["x"]["signed"] = f"D-DM-22 {SIGNED}"
_s["x"]["sources"] = ["SRC-EMHSLU23-185", "SRC-EMHSLU23-DEL"]

# ── D-DM-26: insulin storage, EADSG 2019 in full ───────────────────────────────────────
_s = item("management", "DM-ACT-EDU-05")
_s["display"] = ("On insulin: check storage and injection sites. Storage (EADSG 2019): unopened insulin kept more than 2 months goes in a fridge "
                 "(2 to 8 °C), never frozen; the vial in use at room temperature in a clean plastic box, out of the sun, for up to 6 weeks "
                 "(4 weeks if the room reaches 30 °C); never kept in water; avoid clay pots, which are hard to keep clean")
_s["x"]["signed"] = f"D-DM-26 {SIGNED}"
_s["x"]["sources"] = ["SRC-EADSG19-STORE"]

# ── D-DM-42: DKA in pregnancy needs no high glucose (JBDS 2023) ────────────────────────
drule("DM-ACU-ROUTE-35",
      "Pregnant with diabetes and unwell: ketoacidosis in pregnancy can come with only a modestly raised glucose (below 13.9 mmol/L). "
      "Ketones now, and same-day assessment by a medical or diabetes team (JBDS 2023)",
      "dka",
      crit("acu_preg_dm_unwell", "Pregnant with diabetes (gestational included); vomiting, abdominal pain or acutely unwell",
           all=[P("pregnant")], any=[P("vomiting"), P("abdominal_pain"), P("acute_illness_current")], atLeast=(1, k_r7.DM_ANY()),
           claim_id="SRC-JBDS23-PREG"),
      "moderate", "same_day", ["bohb", "urine_ketones"], ["Ketosis of pregnancy or hyperemesis (JBDS: different from ketoacidosis)"],
      "SRC-JBDS23-PREG", "DM-ACU-ROUTE", lane="acute_route",
      notes="DM-ACU-ROUTE-23 owns type 1 and insulin (ketones today, whatever the glucose); this rule covers gestational diabetes and everyone else.")
_r = REG["rules"][-1]
_r["x"]["notWhen"] = [crit("acu_preg_dm_unwell_insulin", "Type 1 recorded, or on insulin (DM-ACU-ROUTE-23 owns it)",
                           any=[P("dm_type_recorded", "==", "type_1"), P("glucose_lowering_therapy", "==", "insulin")], claim_id="SRC-JBDS23-PREG")]
_r["x"]["signed"] = f"D-DM-42 {SIGNED}"
