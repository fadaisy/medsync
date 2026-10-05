"""Go-live alignment with the live NCD surface (Phase 0 rulings signed at GATE A, 2026-10-05). The pack replaces the
v0.1.0 engine on the live clerkship behind NCD_DM_PACK_LIVE; these rulings are the ones the pack itself carries."""
from k_model import REG

# P0-06: metformin with eGFR below 30 is amber, as on the live surface (red is reserved for emergencies, I11).
for _f in REG["therapyFlags"]:
    if _f["id"] == "metformin_egfr_below_30":
        _f["severity"] = "amber"; _f["x"]["signed"] = "P0-06 (GATE A 2026-10-05)"
# P0-14: a low band is toned 'low' (the live surface shows it as 'Hypoglycaemia'), never 'diagnostic' ('Diabetes range').
for _i in REG["interpretation"]:
    for _b in _i["bands"]:
        if _b["code"] == "low" and _b.get("tone") == "diagnostic":
            _b["tone"] = "low"; _i["x"]["signed"] = "P0-14 (GATE A 2026-10-05)"
# The UCG 2023 set's version line still described the pre-GATE A state ("not opened"): UCG 2023 8.1.3 was read at source.
for _s in REG["diagnosis_pending"]:
    if _s["id"] == "ug_ucg_2023": _s["version"] = "UCG 2023 section 8.1.3 (read at source, CSO copy)"
