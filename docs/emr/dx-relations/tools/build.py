"""Build and check the dx-relations hand-back. Run: python3 -I build.py  (from this folder: python3 build.py)

Emits ../out/*.json and the decisions document, and fails on any broken reference.
"""
import json, re, sys, os
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from sources import S, STATUS_WORDS
from subtypes import PARENTS, STAGES
from causes import EFFECTS, NON_DIAGNOSIS_CAUSES, AMBIGUOUS
from risks import OUTCOMES, EXPOSURES
from terms import TERMS
from decisions import DECISIONS
from vignettes import V

# Works from the scratch layout (tools/ beside out/) and from the packaged layout (tools/ inside the pack).
OUT = HERE.parent if (HERE.parent / "dx-relations-design.md").exists() else HERE.parent / "out"
OUT.mkdir(exist_ok=True)
CAT_PATH = HERE / "src" / "catalog.json" if (HERE / "src" / "catalog.json").exists() else HERE.parent / "src" / "catalog.json"
CAT = json.load(open(CAT_PATH))
DX = {c["id"]: c for c in CAT["dx"]}
TESTS = set(CAT["tests_all"]); MENU = set(CAT["menu"])
PROPOSED = {t["id"]: t for t in TERMS}
KNOWN = set(DX) | set(PROPOSED)
RESTRICTED_CAT = {"mental_health": "mental_health", "sexual_reproductive": "sexual_reproductive_health"}
DEC_IDS = {d["id"] for d in DECISIONS}

errors, warnings = [], []
relabelled, dual = [], []
off_menu = set()
def err(m): errors.append(m)
def warn(m): warnings.append(m)

def restricted(i):
    if i.startswith("dx.hiv"): return "hiv"
    if i.startswith("dx.tb_"): return "tb"
    c = DX.get(i)
    if c and c["category"] in RESTRICTED_CAT: return RESTRICTED_CAT[c["category"]]
    return None

def dxok(i, where):
    if i.startswith("problem_list:"): i = i.split(":", 1)[1]
    if i not in KNOWN: err(f"{where}: unknown diagnosis id {i}")

USED_SRC = set()
def srcs(key, where):
    out = []
    for k in [x.strip() for x in key.split(";")]:
        if k not in S: err(f"{where}: unknown source {k}"); continue
        USED_SRC.add(k); out.append(k)
    return out
def src_map():
    return {k: {"citation": S[k][0], "status": STATUS_WORDS[S[k][1]], "url": S[k][2]} for k in sorted(USED_SRC)}

def complication_of(parent, child):
    return parent in DX and child in DX[parent]["complications"]

# ------------------------------------------------------------------ subtypes
sub_out = {}
for p, spec in PARENTS.items():
    dxok(p, f"subtypes parent {p}")
    subs = []
    for s in spec["subtypes"]:
        dxok(s["id"], f"subtype of {p}")
        is_prop = s["id"] not in DX
        if is_prop != s["proposed"]: err(f"subtype {s['id']} under {p}: proposed flag {s['proposed']} but catalogue says {not is_prop}")
        for t in s["decided_by"]:
            if t not in TESTS: err(f"subtype {s['id']}: unknown test {t}")
            elif t not in MENU: off_menu.add(t)
        r = s["restricted_class"] or restricted(s["id"])
        subs.append({"id": s["id"], "display": s["display"], "proposed": s["proposed"], "decided_by": s["decided_by"],
                     "criteria": s["criteria"], "source": srcs(s["source"], s["id"]), "claims": s["claims"] or None,
                     "restricted_class": r})
    for a in spec.get("alternatives_if_ruled_out", []): dxok(a, f"alternatives of {p}")
    for a in (spec.get("suppressed_when") or {}).get("to_any", []): dxok(a, f"suppressed_when of {p}")
    sub_out[p] = {"why": spec["why"], "subtypes": subs, "note_before": spec["note_before"], "note_after": spec["note_after"],
                  "alternatives_if_ruled_out": spec.get("alternatives_if_ruled_out", []),
                  "suppressed_when": spec.get("suppressed_when"),
                  "how_to_use_alternatives": "Not subtypes. If the broad diagnosis is ruled out, the desk offers 'Replace' (refute with a reason, then add the new diagnosis), never 'Refine'." if spec.get("alternatives_if_ruled_out") else None}
stages_out = {}
for p, spec in STAGES.items():
    dxok(p, f"stage {p}")
    for a in spec.get("applies_also_to", []): dxok(a, f"stage {p} applies_also_to")
    o = dict(spec); o["source"] = srcs(spec["source"], f"stage {p}"); stages_out[p] = o

SUBTYPES = {"id": "MS-EMR-DX-SUBTYPES-001", "version": "1.0.0-draft", "status": "draft — awaiting CSO",
            "rules": ["Refinement is a new version of the same condition (same logical id); history keeps the broad term (D-REL-05).",
                      "The desk OFFERS a refinement when a decided_by result meets the criteria; it never refines by itself. A blank or 'not done' result never refines.",
                      "Severity and stage are not subtypes: see 'stages' (D-REL-14).",
                      "A change of identity (ACS to pericarditis) is Replace: refute with a reason plus a new diagnosis.",
                      "Numbers owned by the diabetes or hypertension pack are referenced, not restated (one number, one place)."],
            "parents": sub_out, "stages": stages_out}

# ------------------------------------------------------------------ causes
def expand(d, name):
    out = {}
    for k, v in d.items():
        if isinstance(v, str) and v.startswith("same_as:"):
            out[k] = {"same_as": v.split(":", 1)[1]}
        else:
            out[k] = v
    for k, v in out.items():
        if isinstance(v, dict) and v["same_as"] not in d: err(f"{name} {k}: same_as target {v['same_as']} missing")
    return out

effects = expand(EFFECTS, "causes")
pairs = set()
caus_out = {}
for eff, lst in effects.items():
    dxok(eff, f"causes effect {eff}")
    if isinstance(lst, dict): caus_out[eff] = lst; continue
    seen = set(); items = []
    for c in lst:
        dxok(c["id"], f"cause of {eff}")
        if c["id"] in seen: err(f"cause {c['id']} listed twice for {eff}")
        seen.add(c["id"])
        if c["id"] == eff: err(f"self-cause {eff}")
        label = c["label"]
        if complication_of(c["id"], eff) and label != "complication":
            relabelled.append(f"{eff} <- {c['id']} (was {label})"); label = "complication"
        pairs.add((eff, c["id"]))
        r = restricted(eff) or restricted(c["id"])
        items.append({"id": c["id"], "label": label, "suggest_when": c["suggest_when"], "source": srcs(c["source"], f"{eff}<-{c['id']}"),
                      "restricted_class": r})
    caus_out[eff] = {"secondary_to": items}
# reciprocal pairs: direction is a clinical judgement -> chooser must open
recip = sorted({tuple(sorted(p)) for p in pairs if (p[1], p[0]) in pairs})
for a in AMBIGUOUS:
    if a not in pairs: err(f"AMBIGUOUS pair {a} is not in the causes list")
for eff, v in caus_out.items():
    if "secondary_to" in v:
        for it in v["secondary_to"]:
            it["direction_ambiguous"] = tuple(sorted((eff, it["id"]))) in recip or (eff, it["id"]) in AMBIGUOUS
for n in NON_DIAGNOSIS_CAUSES:
    for a in n["applies_to"]: dxok(a, f"non-diagnosis cause {n['id']}")
    n["source"] = srcs(n["source"], n["id"]) if isinstance(n["source"], str) else n["source"]
CAUSES = {"id": "MS-EMR-DX-CAUSES-001", "version": "1.0.0-draft", "status": "draft — awaiting CSO",
          "rules": ["Stored as relation due_to (child = effect, parent = cause) with the label shown here (D-REL-03).",
                    "Offered only when the cause is already on the board or the problem list and suggest_when is met; never created automatically.",
                    "direction_ambiguous = the catalogue lists both directions for this pair; a drop always opens the chooser (D-REL-06).",
                    "Where a pair is in the signed complication list, the label is complication whatever this file says (the signed list wins).",
                    "restricted_class = the stricter class of the two ends; the relation is invisible without it (D-REL-09)."],
          "effects": caus_out, "non_diagnosis_causes": NON_DIAGNOSIS_CAUSES, "reciprocal_pairs": [list(p) for p in recip]}

# ------------------------------------------------------------------ risk factors
outs = expand(OUTCOMES, "risks")
risk_out = {}
for o, lst in outs.items():
    dxok(o, f"risk outcome {o}")
    if isinstance(lst, dict): risk_out[o] = lst; continue
    items = []
    for r in lst:
        dxok(r["id"], f"risk factor of {o}")
        if (o, r["id"]) in pairs: dual.append([o, r["id"]])
        items.append({"id": r["id"], "source": srcs(r["source"], f"{o}<-rf {r['id']}"), "restricted_class": restricted(o) or restricted(r["id"])})
    risk_out[o] = {"risk_factors": items}
for e in EXPOSURES:
    for x in e["outcomes"]: dxok(x, f"exposure {e['id']}")
    e["source"] = srcs(e["source"], e["id"]) if isinstance(e["source"], str) else e["source"]
RISKS = {"id": "MS-EMR-DX-RISK-001", "version": "1.0.0-draft", "status": "draft — awaiting CSO",
         "rules": ["Shown as one derived line under the outcome; stored as risk_factor_for only when the clinician includes it in the note (D-REL-04).",
                   "Never counted in HMIS; never added to the problem list by this line.",
                   "The line takes the stricter restricted class of the outcome and every factor it names.",
                   "Some pairs are both a possible cause and a risk factor (dual_role_pairs). If the clinician has linked the factor as the cause, the risk-factor line leaves it out, so it is never named twice."],
         "outcomes": risk_out, "exposures_from_social_history": EXPOSURES, "dual_role_pairs": dual}

# ------------------------------------------------------------------ proposed terms: each must be used
used = set()
for p, v in sub_out.items():
    used.add(p); used |= {s["id"] for s in v["subtypes"]}
for e, v in caus_out.items():
    used.add(e); used |= {i["id"] for i in v.get("secondary_to", [])}
for t in TERMS:
    if t["id"] in DX: err(f"proposed term {t['id']} already exists in the catalogue")
    if t["id"] not in used: err(f"proposed term {t['id']} is not used by any catalogue")
TERMS_OUT = {"id": "MS-EMR-DX-TERMS-PROPOSED-001", "version": "1.0.0-draft", "status": "draft — awaiting CSO",
             "rules": ["Every icd11_candidate is a candidate only: verify against the WHO ICD-11 MMS API before use; until verified, icd11_code stays empty."],
             "terms": TERMS}

# ------------------------------------------------------------------ vignettes
for v in V:
    ids_on_board = []
    for b in v["board"]:
        dxok(b["id"], f"{v['id']} board")
        ids_on_board.append(b["id"])
        if "relation" in b:
            dxok(b["relation"]["to"], f"{v['id']} relation of {b['id']}")
            if b["relation"]["type"] not in ("due_to", "associated_with", "risk_factor_for", "episode_of"): err(f"{v['id']}: bad relation type")
            if b["place"] == "differential": err(f"{v['id']}: a differential carries a relation (D-REL-08)")
    leads = [b for b in v["board"] if b["place"] == "leading"]
    if len(leads) != 1: err(f"{v['id']}: {len(leads)} leading diagnoses")
    for c in v["counted_opd_or_ipd"]:
        i = c.split(" ")[0]
        dxok(i, f"{v['id']} counted")
        if any(b["id"] == i and b["place"] in ("background", "differential") for b in v["board"]): err(f"{v['id']}: counts a background or differential {i}")
VIGNETTES = {"id": "MS-EMR-DX-REL-VIGNETTES-001", "version": "1.0.0-draft", "status": "draft — awaiting CSO",
             "assumes": "the recommended option of every D-REL decision", "count": len(V), "vignettes": V}

# ------------------------------------------------------------------ decisions
DEC_OUT = {"id": "MS-EMR-DX-REL-DECISIONS-001", "version": "1.0.0-draft", "status": "awaiting CSO", "decisions": DECISIONS}

SUBTYPES["sources"] = src_map(); CAUSES["sources"] = src_map(); RISKS["sources"] = src_map()

# ------------------------------------------------------------------ global text checks
DOSE = re.compile(r"\b\d+(\.\d+)?\s?(mg|mcg|µg|ug|IU|units?)\b(?!\s?/)|\b(once|twice|three times) (a )?day\b|\b(bd|tds|qds|stat|nocte|mane)\b", re.I)
def walk(o, path):
    if isinstance(o, dict):
        for k, x in o.items(): walk(x, f"{path}.{k}")
    elif isinstance(o, list):
        for i, x in enumerate(o): walk(x, f"{path}[{i}]")
    elif isinstance(o, str):
        m = DOSE.search(o)
        if m: err(f"possible dose at {path}: '{m.group(0)}'")
        for d in re.findall(r"D-REL-\d\d", o):
            if d not in DEC_IDS: err(f"{path} cites missing decision {d}")
for name, obj in [("subtypes", SUBTYPES), ("causes", CAUSES), ("risks", RISKS), ("terms", TERMS_OUT), ("vignettes", VIGNETTES), ("decisions", DEC_OUT)]:
    walk(obj, name)

# ------------------------------------------------------------------ emit
files = {"dx-subtypes.v1.json": SUBTYPES, "dx-causes.v1.json": CAUSES, "dx-risk-factors.v1.json": RISKS,
         "dx-proposed-terms.v1.json": TERMS_OUT, "dx-relations-vignettes.v1.json": VIGNETTES, "dx-relations-decisions.v1.json": DEC_OUT}
if "--check" not in sys.argv:
    for f, o in files.items():
        (OUT / f).write_text(json.dumps(o, indent=2, ensure_ascii=False) + "\n")
    # decisions document, generated from the same source as the JSON
    L = ["# Decisions for the CSO: diagnosis relations (D-REL)", "",
         "Generated from `dx-relations-decisions.v1.json`; edit that file, not this one. The first option is the recommendation.",
         "Reply with one line per decision, for example `D-REL-01: A`.", ""]
    for d in DECISIONS:
        L += [f"## {d['id']}. {d['title']}", "", f"**Question.** {d['question']}", ""]
        for i, op in enumerate(d["options"]):
            tag = " (recommended)" if i == 0 else ""
            L += [f"- **{op['label']}**{tag}", f"  - What is lost: {op['what_is_lost']}"]
        L += ["", f"**Why the recommendation.** {d['why']}", "", f"**If left unanswered.** {d['if_left']}", "",
              f"**Affects.** {', '.join(d['affects'])}", "", f"**Reply.** `{d['reply']}`", ""]
    (OUT / "dx-relations-decisions.md").write_text("\n".join(L))

n_pairs = sum(len(v.get("secondary_to", [])) for v in caus_out.values())
n_rf = sum(len(v.get("risk_factors", [])) for v in risk_out.values())
src_use = {}
def count_src(o):
    if isinstance(o, dict):
        for k, x in o.items():
            if k == "source" and isinstance(x, list):
                for key in x: src_use[STATUS_WORDS[S[key][1]]] = src_use.get(STATUS_WORDS[S[key][1]], 0) + 1
            elif k != "sources": count_src(x)
    elif isinstance(o, list):
        for x in o: count_src(x)
for o in (SUBTYPES, CAUSES, RISKS): count_src(o)
report = {"parents_refined": len(sub_out), "subtype_entries": sum(len(v["subtypes"]) for v in sub_out.values()), "stage_scales": len(stages_out),
          "effects_with_causes": sum(1 for v in caus_out.values() if "secondary_to" in v), "cause_pairs": n_pairs, "reciprocal_pairs": len(recip),
          "risk_outcomes": sum(1 for v in risk_out.values() if "risk_factors" in v), "risk_pairs": n_rf,
          "cause_labels_set_to_complication_by_signed_list": len(relabelled), "dual_role_pairs": len(dual), "tests_used_not_on_default_menu": sorted(off_menu), "proposed_terms": len(TERMS), "vignettes": len(V), "decisions": len(DECISIONS),
          "citations_by_status": src_use, "errors": len(errors), "warnings": len(warnings)}
print(json.dumps(report, indent=1, ensure_ascii=False))
for e in errors: print("ERROR", e)
for w in warnings: print("warn ", w)
if "--check" not in sys.argv:
    (OUT / "BUILD-CHECK.json").write_text(json.dumps({"report": report, "errors": errors, "warnings": warnings}, indent=2, ensure_ascii=False) + "\n")
sys.exit(1 if errors else 0)
