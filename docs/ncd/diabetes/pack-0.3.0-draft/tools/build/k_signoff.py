"""Reference sign-off (the CSO, 2026-10-05, on the sign-off page; export: docs/ncd/diabetes/reference-signoff.json): every
REF-DM entry signed. Research notes attached to 16 of them are kept; where a note corrects a reference's wording and the
source was checked, the wording follows it. No value changes."""
import json, os
from lib import REFS
from k_review import item

_EXPORT = os.path.join(os.path.dirname(__file__), "..", "..", "..", "reference-signoff.json")
_REC = {r["ref"]: r for r in json.load(open(_EXPORT, encoding="utf-8"))["records"] if r.get("status") == "signed"}
for _rid, _e in REFS.items():
    _r = _REC.get(_rid)
    if not _r: continue
    _e["status"] = "signed"
    _e["x"]["signed"] = f"CSO, reference sign-off page, {_r['at'][:10]}"
    _e["x"].pop("needsCsoInput", None)
    if _r.get("note"): _e["x"]["researchNote"] = _r["note"]
assert len(_REC) == len(REFS), f"signed {len(_REC)} of {len(REFS)}"

# Wording corrected by the research notes (sources re-read; values unchanged).
REFS["REF-DM-RX-EMHSLU"]["text"] = ("Uganda EMHSLU 2023: glibenclamide deleted; dapagliflozin, gliclazide, glucagon, insulin aspart, insulin glargine and biphasic insulin "
                                    "aspart added. Metformin is the only oral agent below hospital level (HC3); glimepiride from general hospitals; gliclazide, "
                                    "pioglitazone, vildagliptin and dapagliflozin at regional referral hospitals; HbA1c testing from general hospitals.")
REFS["REF-DM-ACT-REVIEW-AFTER-CHANGE"]["text"] = ("WHO HEARTS-D Fig. 1 (p. 16): the first review 1 month after diagnosis and counselling, before any medicine; "
                                                  "after each medicine step the review is at 3 months (REF-DM-CTRL-WINDOW-ABOVE). Not a general interval after a change.")
REFS["REF-DM-CLS-DTG"]["text"] = ("Dolutegravir and hyperglycaemia in Uganda (Lamorde et al., Lancet HIV 2020): new-onset hyperglycaemia in 16 of 3417 people on "
                                  "dolutegravir first-line regimens (treatment-naive and treatment-experienced together) against 1 of 3230 without it.")
REFS["REF-DM-CVD-EXEMPT"]["text"] = ("WHO HEARTS risk-based CVD management (2020), Table 3: treated without a chart: diabetes with established CVD or renal disease; "
                                     "albuminuria, retinopathy or left ventricular hypertrophy; persistent blood pressure 160/100 or above; total cholesterol 8 mmol/L or above.")
REFS["REF-DM-SUS-HIV-UG"]["text"] = ("Uganda HIV guidelines 2022: re-screen all people living with HIV every 6 months; dolutegravir is not started in known diabetes; "
                                     "with two or more risk factors (age 40 or over, BMI 24 or over, hypertension) and a normal baseline, glucose every 3 months for 6 months.")

# W14 (c), CSO 2026-10-05: abdominal pain alone, with normal ketones, starts the adult sick-day review.
_r = item("rules", "DM-ACU-ROUTE-23R")
_r["when"]["any"].append({"feature": "abdominal_pain", "op": "present"})
_r["when"]["label"] = _r["when"]["label"].replace("vomiting or acutely unwell", "vomiting, abdominal pain or acutely unwell")
_r["x"].setdefault("review", []).append("W14c"); _r["x"]["signed"] = "W14(c) CSO 2026-10-05: abdominal pain added"
_r["display"] = _r["display"].replace("vomiting or acutely unwell", "vomiting, abdominal pain or acutely unwell")
