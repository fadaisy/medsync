"""What the GATE A signatures change in the expected results: items switched on are now expected to fire."""
from k_vignettes import VIGNETTES
from k_model import REG

ON = {it["id"] for it in REG["management"] + REG["rules"] if it["x"].get("signed") and it["x"].get("enabled") is True}
for _v in VIGNETTES:
    ex = _v["expect"]
    moved = [k for k in ex.get("dark", []) if k in ON]
    if moved:
        ex["dark"] = [k for k in ex["dark"] if k not in ON]
        ex["fires_or_site_gated"] = moved      # fires, or is 'unavailable_here' where D-DM-21 limits it to referral sites

from k_vignettes import V
M = {"sex": "male"}
VIGNETTES += [
V("DMV-145", "Fasting glucose 7.2 twice on different days (UCG and WHO both met)", ["UCG 2023", "GATE A"],
  {"age_years": 48, **M, "fasting_pg": 7.2, "repeat_abnormal_result": True},
  {"diagnosis": {"ug_ucg_2023": "met", "who_hearts_d_2020": "met"}}),
V("DMV-146", "Fasting glucose exactly 7.0 twice: WHO met, UCG (as printed, '>') not", ["UCG 2023", "standard disagreement", "GATE A"],
  {"age_years": 48, **M, "fasting_pg": 7.0, "repeat_abnormal_result": True},
  {"diagnosis": {"ug_ucg_2023": "insufficient", "who_hearts_d_2020": "met"}, "not_met_criteria": ["ucg_fpg_repeat"]}),
V("DMV-147", "28 weeks pregnant, fasting 5.4: gestational diabetes under WHO 2013 (default), not under UCG", ["pregnancy", "P0-26", "GATE A"],
  {"age_years": 29, "sex": "female", "pregnant": True, "gestation_weeks": 28, "fasting_pg": 5.4},
  {"diagnosis": {"who_2013_gdm": "met", "ug_ucg_2023_gdm": "insufficient"}}),
V("DMV-148", "16 weeks pregnant, BMI 37, nothing tested", ["pregnancy", "D-DM-12", "GATE A"],
  {"age_years": 31, "sex": "female", "pregnant": True, "gestation_weeks": 16, "bmi": 37},
  {"fires": ["DM-SUS-PREG-UCG"]}),
]
