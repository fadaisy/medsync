#!/usr/bin/env python3
"""Build and validate the MedSync diabetes knowledge pack.

    python3 build.py            build into ../out/medsync-ncd-diabetes and validate
    python3 build.py --check    validate only

Exit code is non-zero on any validation error or any vignette that does not hold.
"""
import json, os, sys, csv, re, copy, collections, hashlib
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import lib
from lib import REFS, FEATURES, CLAIMS, USED_CLAIMS, preds_of, strip_refs, dose_hits, walk_strings
import k_refs, k_features, k_dx, k_strat, k_act, k_review, k_r4, k_wire, k_clerk, k_r5, k_r6, k_r7, k_vignettes, k_r4_vignettes, k_r5_vignettes, k_r6_vignettes, k_r7_vignettes, k_decisions, k_grid
from k_model import REG

OUT = os.path.join(lib.ROOT, "out", "medsync-ncd-diabetes")
PACK = {"id": "MS-NCD-DM-PACK-001", "version": "0.3.4-draft", "generated": "2026-10-05", "condition": "diabetes",
        "extends": "DIABETES_CATALOG v0.1.0 (lib/ncd/catalog/diabetes)", "dossier": "MS-NCD-DM-DOSSIER-001 (draft content for Gate 2)",
        "briefingCommit": "8e45d34"}
errors, warnings = [], []
E = lambda path, msg: errors.append(f"{path}: {msg}")
W = lambda path, msg: warnings.append(f"{path}: {msg}")

# ── collect every Criterion in the pack ─────────────────────────────────────
def all_criteria():
    for cs in REG["diagnosis"] + REG["diagnosis_pending"]:
        for c in cs["anyOf"]: yield f"criteriaSet.{cs['id']}", c
    for c in REG["classifications"]:
        for k in c["supportedBy"] + c.get("refutedBy", []): yield f"classification.{c['code']}", k
    for c in REG["complications"]:
        for k in c["establishedBy"]: yield f"complication.{c['code']}", k
        for st in c.get("staging", []):
            for s in st["stages"]: yield f"complication.{c['code']}.staging.{st['id']}", s["when"]
    for a in REG["complication_amendments"]:
        if isinstance(a["change"], dict) and "criterion" in a["change"]: yield f"amend.{a['target']}", a["change"]["criterion"]
    for v in REG["validityCaveats"]: yield f"caveat.{v['id']}", v["when"]
    for m in REG["riskModels"]:
        for b in m["bands"]: yield f"riskModel.{m['id']}", b["when"]
    for t in REG["therapyFlags"]: yield f"therapyFlag.{t['id']}", t["when"]
    for s in REG["management"]:
        yield f"step.{s['id']}", s["when"]
        for k in s.get("contraindications", []): yield f"step.{s['id']}.contra", k
    for r in REG["rules"]: yield f"rule.{r['id']}", r["when"]
    for t in REG["targets"]: yield f"target.{t['id']}", t["when"]
    for kind in ("rules", "management", "therapyFlags", "targets", "diagnosis", "diagnosis_pending"):
        for it in REG[kind]:
            for key in ("notWhen", "cautions"):
                for k in it["x"].get(key, []): yield f"{kind}.{it['id']}.{key}", k

NUM_OPS = {">=", ">", "<=", "<"}
def check_pred(path, p):
    f = FEATURES.get(p["feature"])
    if not f:
        E(path, f"unknown feature {p['feature']}"); return
    opts = [o["value"] for o in f.get("options", [])]
    if p["op"] in NUM_OPS:
        if "_ref" not in p: E(path, f"numeric threshold on {p['feature']} is not drawn from a REF-DM entry")
        if f["valueType"] not in ("number", "series"): E(path, f"numeric comparison on non-numeric feature {p['feature']}")
        if not f.get("unit"): E(path, f"numeric comparison on unitless feature {p['feature']}")
        elif p.get("unit") != f["unit"]: E(path, f"unit mismatch on {p['feature']}: predicate {p.get('unit')} vs feature {f['unit']}")
    elif p["op"] in ("==", "!=", "in"):
        vals = p["value"] if isinstance(p["value"], list) else [p["value"]]
        if p["op"] == "in" and not isinstance(p["value"], list): E(path, f"'in' needs a list on {p['feature']}")
        if opts:
            for v in vals:
                if v not in opts: E(path, f"option '{v}' not declared on {p['feature']}")
        elif f["valueType"] in ("single_select", "multi_select"): E(path, f"select feature {p['feature']} has no options")
    elif p["op"] in ("present", "absent"):
        if f["valueType"] not in ("boolean",): W(path, f"present/absent on non-boolean {p['feature']} ({f['valueType']})")
    elif p["op"] == "recorded":
        if "value" in p: E(path, f"'recorded' takes no value on {p['feature']}")
    if f.get("offProtocol"): E(path, f"offProtocol feature {p['feature']} used in a rule")

def check_citation(path, c):
    if not c: E(path, "missing citation"); return
    if not c.get("title"): E(path, "citation without title")
    if not c.get("url") and not c.get("needsCsoInput"): E(path, "citation with neither url nor needsCsoInput")
    if c.get("csoSigned"): E(path, "citation marked csoSigned: nothing in this pack is signed")
    if c["x"]["verified"] and not c.get("quote"): W(path, "verified citation without a quote")

def validate():
    seen = set()
    for path, c in all_criteria():
        key = (path.split(".")[0], c["id"])
        if not c.get("label"): E(path, f"criterion {c['id']} has no label")
        ps = preds_of(c)
        if not ps: E(path, f"criterion {c['id']} has no predicates")
        if "atLeast" in c and not (1 <= c["atLeast"]["n"] <= len(c["atLeast"]["of"])): E(path, f"atLeast.n out of range in {c['id']}")
        for p in ps: check_pred(f"{path}.{c['id']}", p)
        check_citation(f"{path}.{c['id']}", c.get("citation"))
        # the label must state every REF number its predicates use
        lab = c["label"].replace(",", "")
        for p in ps:
            if "_ref" in p and isinstance(p["value"], (int, float)):
                v = p["value"]; forms = {str(v), f"{v:.1f}", str(int(v)) if float(v) == int(v) else str(v)}
                if p["op"] == "<":   # an upper bound may be written as the inclusive end of a range: "6.1 to 6.9", "30 to 59"
                    forms |= {f"{v - 0.1:.1f}", str(int(v) - 1) if float(v) == int(v) else "", f"{v - 0.01:.2f}"} - {""}
                if not any(re.search(r"(?<![\d.])" + re.escape(s) + r"(?![\d])", lab) for s in forms):
                    W(f"{path}.{c['id']}", f"label does not state {v} ({p['feature']} {p['op']})")
    ids = collections.Counter()
    for kind in ("management", "rules", "therapyFlags", "validityCaveats", "riskModels", "interpretation", "targets", "designb_extra"):
        for it in REG[kind]: ids[it["id"]] += 1
    for cs in REG["diagnosis"] + REG["diagnosis_pending"]: ids[cs["id"]] += 1
    for k, n in ids.items():
        if n > 1: E("ids", f"duplicate id {k}")
    conds = {c["code"] for c in REG["conditions"]}
    comps = {c["code"] for c in REG["complications"]} | {"dka", "hhs", "hypoglycaemia", "diabetic_kidney_disease", "diabetic_foot"}
    for r in REG["rules"]:
        p = f"rule.{r['id']}"
        if r["condition"] not in conds: E(p, f"unknown condition {r['condition']}")
        if not r["confirmWith"]: E(p, "empty confirmWith")
        if not r["mimicsToExclude"]: E(p, "empty mimicsToExclude")
        for f in r["confirmWith"]:
            if f not in FEATURES: E(p, f"confirmWith unknown feature {f}")
        for c in r.get("rulesOut", []):
            if c not in conds: E(p, f"rulesOut unknown condition {c}")
        check_citation(p, r["citation"])
    for c in REG["conditions"]:
        if c.get("complication") and c["complication"] not in comps: E(f"condition.{c['code']}", "unknown complication")
        check_citation(f"condition.{c['code']}", c["citation"])
    caps = {c["code"] for c in REG["capabilities"]}
    secs = {s["id"] for s in REG["sections"]} | {"status", "symptoms", "examination", "precipitants", "glycaemia", "hba1c_validity", "acute", "kidney", "foot", "history"}
    groups = {g["id"] for s in REG["sections"] for g in s.get("groups", [])}
    for code, f in FEATURES.items():
        p = f"feature.{code}"
        if f.get("requires") and f["requires"] not in caps: E(p, f"unknown capability {f['requires']}")
        if f["section"] not in secs: E(p, f"unknown section {f['section']}")
        if f.get("group") and f["group"] not in groups: E(p, f"unknown group {f['group']}")
        if f.get("parent") and f["parent"] not in FEATURES: E(p, f"unknown parent {f['parent']}")
        if f["valueType"] in ("single_select", "multi_select") and not f.get("options"): E(p, "select without options")
        if f["valueType"] in ("number", "series") and not f.get("unit"): E(p, "number without unit")
    for c in REG["complications"]:
        p = f"complication.{c['code']}"
        if not c["establishedBy"] or not c["screenedBy"]: E(p, "needs establishedBy and screenedBy")
        for f in c["screenedBy"]:
            if f not in FEATURES: E(p, f"screenedBy unknown feature {f}")
        check_citation(p, c["citation"])
    for v in REG["validityCaveats"]:
        if v["feature"] not in FEATURES: E(f"caveat.{v['id']}", "unknown feature")
        if v["blocksDiagnosis"] and not v.get("alternative"): E(f"caveat.{v['id']}", "blocking caveat without alternative")
    for t in REG["interpretation"]:
        p = f"interpretation.{t['id']}"; b = t["bands"]; f = FEATURES.get(t["feature"])
        if not f: E(p, "unknown feature"); continue
        if "from" in b[0] or "to" in b[-1]: E(p, "bands must be open at both ends")
        for a, c in zip(b, b[1:]):
            if a.get("to") != c.get("from"): E(p, f"gap or overlap between {a['code']} and {c['code']}")
        bounds = {x.get("from") for x in b} | {x.get("to") for x in b}; bounds.discard(None)
        refvals = {REFS[r]["value"] for r in t["x"]["refs"]}
        if bounds != refvals: E(p, f"band boundaries {sorted(bounds)} do not match REF values {sorted(refvals)}")
        for r in t["x"]["refs"]:
            if REFS[r]["unit"] != f["unit"]: E(p, f"{r} unit {REFS[r]['unit']} vs feature {f['unit']}")
        if t.get("when"): check_pred(p + ".when", t["when"])
    for m in REG["riskModels"]:
        if not m.get("validatedIn") and not m.get("applicabilityNote"): E(f"riskModel.{m['id']}", "needs validatedIn or applicabilityNote")
        for f in m["requires"]:
            if f not in FEATURES: E(f"riskModel.{m['id']}", f"requires unknown feature {f}")
    for t in REG["therapyFlags"]:
        if not t["action"]: E(f"therapyFlag.{t['id']}", "no action")
    for d in REG["designb_extra"]:
        for k, r in d["params"].items():
            if r not in REFS: E(f"designb.{d['id']}", f"unknown REF {r}")
    for o in REG["orderables"]:
        for f in o["fills"]:
            if f not in FEATURES: E(f"orderable.{o['code']}", f"fills unknown feature {f}")
        if o["x"]["capability"] and o["x"]["capability"] not in caps: E(f"orderable.{o['code']}", "unknown capability")
    GLUCOSE_NOW = ["capillary_glucose", "random_pg", "fasting_pg", "postprandial_pg", "ogtt_1h_pg", "ogtt_2h_pg"]
    for rid in ("DM-ACU-ROUTE-06", "DM-ACU-ROUTE-14"):
        got = {p["feature"] for r in REG["rules"] if r["id"] == rid for p in preds_of(r["when"])}
        for g in GLUCOSE_NOW:
            if g not in got: E(f"rule.{rid}", f"does not read the glucose field {g}: a dangerous value there would pass silently")
    for kind in ("rules", "management", "therapyFlags"):
        for it in REG[kind]:
            if it["x"].get("enabled") is False and not it["x"].get("enabledBy"): E(f"{kind}.{it['id']}", "switched off with no decision named")
    # invariant I5: no dose, anywhere, outside verbatim source quotes
    scan = {"catalog": REG, "refs": {k: {kk: vv for kk, vv in v.items() if kk != "x"} for k, v in REFS.items()},
            "clerking": {"history": k_clerk.HISTORY, "exam": k_clerk.EXAM, "profiles": k_clerk.PROFILES, "ddx": k_clerk.DDX_RULES, "care": k_clerk.PLAN_CARE},
            "wire": {"formulary": k_wire.FORMULARY_ADD, "tests": k_wire.TEST_MENU_ADD}, "vignettes": k_vignettes.VIGNETTES}
    for path, s in walk_strings(scan):
        hits = dose_hits(s)
        if hits: E(path, f"possible dose {hits} in: {s[:110]}")
    # REF numbers must be found in the claim they cite, unless a conversion is declared
    for rid, r in REFS.items():
        if r["value"] is None or r["x"].get("conversion"): continue
        hay = ""
        for c in r["x"]["claims"]:
            cl = CLAIMS[c]; hay += " " + cl["claim"] + " " + json.dumps(cl["values"], ensure_ascii=False) + " " + (cl.get("quote") or "")
        hay = hay.replace(",", "")
        v = r["value"]; forms = {str(v)}
        if isinstance(v, (int, float)):
            forms |= {f"{v:.1f}"} | ({str(int(v))} if float(v) == int(v) else set())
        if not any(re.search(r"(?<![\d.])" + re.escape(s) + r"(?![\d])", hay) for s in forms):
            E(f"ref.{rid}", f"value {v} not found in cited claims {r['x']['claims']}")
    # clerking cross-checks
    dxrefs = set(k_clerk.DX_REFS)
    exrefs = set(k_clerk.EXAM["reference_entries.add"]) | {"REF-EX-HYPO-L1", "REF-EX-HYPO-L2", "REF-EX-GLU-HIGH"}
    def atom_refs(o):
        if isinstance(o, dict):
            for k, v in o.items():
                if k in ("display_ref", "options_ref"): continue
                if (k.endswith("_ref") or k == "ref") and isinstance(v, str) and v.startswith("REF-"): yield v
                else: yield from atom_refs(v)
        elif isinstance(o, list):
            for v in o: yield from atom_refs(v)
    for src_name, blob in (("profiles", k_clerk.PROFILES), ("ddx", k_clerk.DDX_RULES), ("care", k_clerk.PLAN_CARE), ("exam", k_clerk.EXAM)):
        for r in atom_refs(blob):
            if r not in dxrefs and r not in exrefs: E(f"clerking.{src_name}", f"undefined REF {r}")
    used = set()
    for blob in (k_clerk.PROFILES, k_clerk.DDX_RULES, k_clerk.PLAN_CARE, k_clerk.EXAM, k_clerk.HISTORY): used |= set(atom_refs(blob))
    for r in (set(k_clerk.DX_REFS) | set(k_clerk.EXAM["reference_entries.add"])) - used:
        E(f"clerking.ref.{r}", "defined and used by nothing")
    for p in k_clerk.PROFILES:
        if p["_op"] == "add" and p["id"] not in k_clerk.TERMS_ADD: E(f"clerking.profile.{p['id']}", "new diagnosis with no REF-DX-TERMS label")
    srcs = set(k_clerk.SOURCES) | {"UCG-2023"}
    for p in k_clerk.PROFILES:
        for s in p["sources"]:
            if s not in srcs: E(f"clerking.profile.{p['id']}", f"unknown source {s}")
        if p["severity"]["kind"] == "named_scale" and p["severity"]["id"] not in set(k_clerk.NAMED_SCALES) | {"kdigo_ckd"}: E(f"clerking.profile.{p['id']}", "unknown named scale")
    known_dx = {p["id"] for p in k_clerk.PROFILES} | {"dx.hypertension", "dx.sepsis", "dx.stroke", "dx.aki", "dx.hypoglycaemia_no_dm", "dx.malaria_severe", "dx.obesity", "dx.dyslipidaemia", "dx.diabetic_foot", "dx.cataract"}
    for r in k_clerk.DDX_RULES:
        for d in r["suggest"] + r["must_not_miss_first"]:
            if d not in known_dx: E(f"clerking.ddx.{r['id']}", f"unknown dx {d}")
    for c in k_clerk.PLAN_CARE:
        for d in c["problems"]:
            if d not in known_dx: E(f"clerking.care.{c['id']}", f"unknown dx {d}")
        for r in c["refs_dm"]:
            if r not in REFS: E(f"clerking.care.{c['id']}", f"unknown REF {r}")
        if c["source"] not in srcs: E(f"clerking.care.{c['id']}", f"unknown source {c['source']}")
    for blob in (k_clerk.HISTORY["flag_rules.add"], k_clerk.EXAM["flag_rules.add"], k_clerk.EXAM["suggestion_rules.add"]):
        for r in blob:
            for x in r.get("refs_dm", []):
                if x not in REFS: E(f"clerking.{r['id']}", f"unknown REF {x}")
            if r["source"] not in srcs: E(f"clerking.{r['id']}", f"unknown source {r['source']}")
    for k, v in list(k_clerk.DX_REFS.items()) + list(k_clerk.EXAM["reference_entries.add"].items()):
        m = v.get("mirrors")
        for r in ([m] if isinstance(m, str) else (m or [])):
            if r not in REFS: E(f"clerking.ref.{k}", f"mirrors unknown {r}")

# ── restricted classes ride with every item that reads a restricted feature ─
def restricted_of(crits):
    out = set()
    for c in crits:
        for p in preds_of(c):
            rc = FEATURES.get(p["feature"], {}).get("x", {}).get("restrictedClass")
            if rc: out.add(rc)
    return sorted(out)

def annotate():
    for r in REG["rules"]:
        rc = restricted_of([r["when"]]);  r["x"]["restrictedClasses"] = rc
        lane = r["x"]["lane"]
        r["x"]["runWhen"] = {"suspect": "not_established", "confirm": "not_established", "classify": "established", "stratify": "established", "act": "established", "acute_route": "always"}[lane]
    for rid in ("DM-CLS-DRUG-01",):
        next(r for r in REG["rules"] if r["id"] == rid)["x"]["runWhen"] = "always"
    for s in REG["management"]:
        s["x"]["restrictedClasses"] = restricted_of([s["when"]] + s.get("contraindications", []))
        s["x"]["runWhen"] = "established"
        s["x"]["ages"] = s["x"].get("agesOverride") or "adult"
    next(s for s in REG["management"] if s["id"] == "DM-SUS-RECON-01")["x"]["runWhen"] = "always"
    next(s for s in REG["management"] if s["id"] == "DM-ACT-EDU-10")["x"]["runWhen"] = "not_established"
    for r in REG["rules"]:
        if r["x"].get("runWhenOverride"): r["x"]["runWhen"] = r["x"].pop("runWhenOverride")
    for s in REG["management"]:
        if s["x"].get("runWhenOverride"): s["x"]["runWhen"] = s["x"].pop("runWhenOverride")
    for t in REG["therapyFlags"]: t["x"]["restrictedClasses"] = restricted_of([t["when"]])
    for v in REG["validityCaveats"]: v["x"]["restrictedClasses"] = restricted_of([v["when"]])
    for t in REG["targets"]: t["x"]["restrictedClasses"] = restricted_of([t["when"]])
    k_review.apply_neutral()
    for kind in ("rules", "management", "therapyFlags", "validityCaveats", "targets"):
        for it in REG[kind]:
            if not it["x"].get("restrictedClasses"): continue
            need = ["neutralDisplay"] + (["neutralAction"] if kind == "therapyFlags" else []) + (["neutralAlternative"] if kind == "validityCaveats" and it.get("alternative") else [])
            for key in need:
                if not it["x"].get(key): E(f"{kind}.{it['id']}", f"reads a restricted feature ({it['x']['restrictedClasses']}) and has no {key}")
                for word in ("HIV", "ART", "TB", "antipsychotic", "dolutegravir", "rifampicin", "pregnan", "conceive", "tuberculosis"):
                    if re.search(r"\b" + word, it["x"].get(key, "")): E(f"{kind}.{it['id']}", f"{key} leaks '{word}'")

# ── reference evaluator: the four states of briefing 3.1 ────────────────────
MET, NOT, INS, UNA = "met", "not_met", "insufficient", "unavailable"
def vstate(code, values, site):
    if code in values: return "recorded", values[code]
    cap = FEATURES[code].get("requires")
    if cap and site != "ALL" and cap not in site: return "unavailable", None
    return "not_assessed", None
def truthy(v):
    if isinstance(v, bool): return v
    if isinstance(v, str): return v not in ("none", "neg")
    return v is not None
def ev_pred(p, values, site, blocked=()):
    st, v = vstate(p["feature"], values, site)
    if st != "recorded": return UNA if st == "unavailable" else INS
    if p["feature"] in blocked: return INS          # a value under a blocking caveat is not read by a routine step
    op, t = p["op"], p.get("value")
    if op == "recorded": return MET
    if op == "present": return MET if truthy(v) else NOT
    if op == "absent": return MET if not truthy(v) else NOT
    if isinstance(v, list):
        r = {"==": t in v, "!=": t not in v, "in": any(x in v for x in (t if isinstance(t, list) else [t]))}[op]
    else:
        r = {"==": lambda: v == t, "!=": lambda: v != t, "in": lambda: v in t, ">=": lambda: v >= t, ">": lambda: v > t, "<=": lambda: v <= t, "<": lambda: v < t}[op]()
    return MET if r else NOT
def AND(sts):
    if NOT in sts: return NOT
    if UNA in sts: return UNA
    if INS in sts: return INS
    return MET
def OR(sts):
    if MET in sts: return MET
    if INS in sts: return INS
    if UNA in sts: return UNA
    return NOT
def ev_crit(c, values, site, blocked=()):
    groups = []
    if c.get("all"): groups.append(AND([ev_pred(p, values, site, blocked) for p in c["all"]]))
    if c.get("any"): groups.append(OR([ev_pred(p, values, site, blocked) for p in c["any"]]))
    if c.get("atLeast"):
        sts = [ev_pred(p, values, site, blocked) for p in c["atLeast"]["of"]]; n = c["atLeast"]["n"]
        m, i, u = sts.count(MET), sts.count(INS), sts.count(UNA)
        groups.append(MET if m >= n else NOT if m + i + u < n else INS if m + i >= n else UNA)
    return AND(groups)

def preg_state(vals, band=None):
    """pregnant | not_pregnant | unknown. Unknown unless the person is male, a child (fourth review, J25), the platform says pregnancy is not possible, or the answer is recorded."""
    if vals.get("pregnant") is True: return "pregnant"
    if vals.get("pregnant") is False or vals.get("sex") == "male" or vals.get("pregnancy_possible") is False or band in ("neonate", "infant", "child"): return "not_pregnant"
    return "unknown"

HELD_KINDS = ("therapy_review",)      # routine steps that may not read a value under a blocking caveat
def run_vignette(v):
    vals = v["values"]; site = "ALL" if v["site"] == "referral" else k_vignettes.DISTRICT
    est, band = v["established"], v["ageBand"]
    adult = band in ("adult", "older_adult")
    met_cav = [c for c in REG["validityCaveats"] if ev_crit(c["when"], vals, site) == MET]
    caveats = [c for c in met_cav if c["blocksDiagnosis"] or c["feature"] in vals]      # a warning on a value shows only when the value exists
    blocking = [c for c in caveats if c["blocksDiagnosis"]]
    blocked_any = {c["feature"] for c in blocking}
    blocked_pos = {c["feature"] for c in blocking if c["direction"] in ("manufactures", "unpredictable")}   # an abnormal result cannot be trusted
    blocked_neg = {c["feature"] for c in blocking if c["direction"] in ("masks", "unpredictable")}          # a normal result cannot be trusted
    reads = lambda c, feats: any(p["feature"] in feats for p in preds_of(c))
    def guarded(c, s, dx=False):
        """Apply blocking caveats to a criterion state. In a diagnostic set any blocking caveat stops a positive (as the live catalog does)."""
        if s == MET and reads(c, blocked_any if dx else blocked_pos): return INS
        if s == NOT and reads(c, blocked_neg): return INS
        return s
    ps = preg_state(vals, band)
    def applies(x):           # True, False, or None when pregnancy status is needed and unknown
        a = (x.get("appliesTo") or {}).get("pregnancy")
        if a in (None, "any"): return True
        return None if ps == "unknown" else a == ps
    suppressed = lambda it: any(ev_crit(k, vals, site) == MET for k in it["x"].get("notWhen", []))
    ages_ok = lambda it: adult or it["x"].get("ages") != "adult"
    def site_ok(it):
        cap = it["x"].get("requiresCapability")
        return not cap or site == "ALL" or cap in site
    res = {"caveats": [c["id"] for c in caveats], "fired": {}, "dark": {}, "states": {}, "diagnosis": {}, "criteria": {}, "blocked_criteria": [], "unavailable_features": set(),
           "complications": {}, "stages": {}, "risk": {}, "targets": [], "bands": {}, "bands_blocked": [], "classification": {}, "restricted": set(), "steps_fired": [], "cautions": {}, "gaps": {}, "urgency": {}, "withheld": [], "metViaUnknown": {}}
    for cs in REG["diagnosis"] + REG["diagnosis_pending"]:
        rw = cs["x"]["appliesTo"]["runWhen"]; ap = applies(cs["x"])
        if ap is False or (rw == "established") != est:
            res["diagnosis"][cs["id"]] = "not_applicable"; continue
        if ap is None:
            res["diagnosis"][cs["id"]] = INS; res["gaps"].setdefault(cs["id"], []).append("pregnant"); continue
        sts = []
        for c in cs["anyOf"]:
            raw = ev_crit(c, vals, site); res["criteria"][c["id"]] = raw
            for p in preds_of(c):
                if vstate(p["feature"], vals, site)[0] == "unavailable": res["unavailable_features"].add(p["feature"])
            s = guarded(c, raw, dx=True)
            if raw == MET and s == INS: res["blocked_criteria"].append(c["id"])
            sts.append(s)
        d = OR(sts) if sts else INS
        if d == MET and suppressed(cs): d = NOT
        res["diagnosis"][cs["id"]] = d
    for a in REG["complication_amendments"]:
        if isinstance(a["change"], dict) and "criterion" in a["change"]:
            c = a["change"]["criterion"]; res["criteria"][c["id"]] = guarded(c, ev_crit(c, vals, site))
    def met_ignoring_pregnancy(sid):     # fourth review, J04: an unanswered pregnancy question never hides a referral
        cs = next(c for c in REG["diagnosis"] if c["id"] == sid)
        d = OR([guarded(c, ev_crit(c, vals, site), dx=True) for c in cs["anyOf"]])
        return d == MET and not suppressed(cs)
    met_now = res["diagnosis"].get("who_hearts_d_2020") == MET or (ps == "unknown" and met_ignoring_pregnancy("who_hearts_d_2020"))
    def gate(rw):
        return {"always": True, "established": est, "not_established": not est, "established_or_met": est or met_now, "newly_met": (not est) and met_now}[rw]
    def fire(item, kind, state):
        if state == MET and suppressed(item): state = "suppressed"
        if state == MET and not site_ok(item): state = "unavailable_here"
        res["states"][item["id"]] = state
        if state == MET:
            if item["x"].get("enabled") is False:
                res["dark"][item["id"]] = item["x"].get("enabledBy"); return "dark"     # fourth review, J16: dark is reported only as dark
            else:
                res["fired"][item["id"]] = kind
                for rc in item["x"].get("restrictedClasses", []): res["restricted"].add(rc)
        return state
    for r in REG["rules"]:
        if not gate(r["x"]["runWhen"]): continue
        if r.get("ageBands") and band not in r["ageBands"]: continue
        cap = r["x"].get("unlessCapability")
        if cap and (site == "ALL" or cap in site): continue      # seventh review, Q12: the pathway for a site WITHOUT this test
        st = ev_crit(r["when"], vals, site); via = None
        if st != MET and r["x"].get("pregnancyUnknownCounts"):      # sixth/seventh review, L13, Q01: unanswered is 'possible', and named
            alt = None
            if ps == "unknown": alt = ({**vals, "pregnant": True}, "pregnant")
            elif (vals.get("pregnant") is False and "postpartum_weeks" not in vals and vals.get("sex") == "female"
                  and vals.get("pregnancy_possible") is not False and band not in ("neonate", "infant", "child")): alt = ({**vals, "postpartum_weeks": 0}, "postpartum_weeks")
            if alt and ev_crit(r["when"], alt[0], site) == MET: st, via = MET, alt[1]
        if fire(r, "rule", st) == MET:
            res["urgency"][r["id"]] = r["urgency"]
            if via: res["gaps"].setdefault(r["id"], []).append(via); res["metViaUnknown"][r["id"]] = via
    for s in REG["management"]:
        if not gate(s["x"]["runWhen"]) or not ages_ok(s): continue
        held = s["x"]["kind"] in HELD_KINDS and not s["x"].get("lessTreatment")      # fourth review, J11: asking for less treatment reads every value
        st = ev_crit(s["when"], vals, site, blocked_any if held else ())
        if held and st != MET and ev_crit(s["when"], vals, site) == MET:      # fifth review, K14: the blocked value is a named gap, never read
            res["gaps"].setdefault(s["id"], []).extend(sorted({p["feature"] for p in preds_of(s["when"])} & blocked_any))
        if st == MET and any(ev_crit(k, vals, site) == MET for k in s.get("contraindications", [])): st = "contraindicated"
        if applies(s["x"]) is None:
            if st == MET and not suppressed(s) and s["x"].get("enabled") is not False: res["withheld"].append(s["id"])     # waits for the pregnancy answer, and says so
            continue
        if not applies(s["x"]): continue
        if fire(s, "step", st) == MET:
            res["steps_fired"].append(s["id"]); res["urgency"][s["id"]] = s["x"]["urgency"]
            cz = [k["id"] for k in s["x"].get("cautions", []) if ev_crit(k, vals, site) == MET]
            gz = [g["feature"] for g in s["x"].get("needsBeforeActing", []) if g["feature"] not in vals]
            if cz: res["cautions"][s["id"]] = cz
            if gz: res["gaps"][s["id"]] = gz
    for t in REG["therapyFlags"]:
        if ages_ok(t): fire(t, "therapyFlag", ev_crit(t["when"], vals, site))
    for c in caveats:
        for rc in c["x"].get("restrictedClasses", []): res["restricted"].add(rc)
    if est:
        for c in REG["complications"]:
            sts = [guarded(k, ev_crit(k, vals, site)) for k in c["establishedBy"]]
            d = OR(sts)
            nr = c["x"].get("notMetRequires")
            if d == NOT and nr and ev_crit(nr, vals, site) != MET: d = INS      # 'no disease' needs an examination able to show it
            res["complications"][c["code"]] = d
            for st in c.get("staging", []):
                for sg in st["stages"]:
                    if ev_crit(sg["when"], vals, site) == MET:
                        neg = sg["severity"] == "none"
                        if not reads(sg["when"], blocked_neg if neg else blocked_pos) and not (neg and nr and ev_crit(nr, vals, site) != MET): res["stages"][st["id"]] = sg["code"]
                        break
        for t in REG["targets"]:
            if not (ages_ok(t) and ev_crit(t["when"], vals, site) == MET and not suppressed(t)): continue
            if t["measure"] in blocked_any: continue                               # no target on a measure that is not valid for this patient
            ap = applies(t["x"])
            if ap is None: res["withheld"].append(t["id"])
            elif ap: res["targets"].append(t["id"])
        for c in REG["classifications"]:
            d = OR([guarded(k, ev_crit(k, vals, site)) for k in c["supportedBy"]])
            if d == NOT and c["x"].get("neverNotMet"): d = INS
            res["classification"][c["code"]] = d
    sup = {s for t in REG["targets"] if t["id"] in res["targets"] for s in t["x"].get("supersedes", [])}      # sixth review, L09
    res["targets"] = [t for t in res["targets"] if t not in sup]
    imm = sorted((k for k in res["fired"] if res["urgency"].get(k) == "immediate"),
                 key=lambda k: (k in res["metViaUnknown"], k_r6.ACUTE_ORDER.index(k) if k in k_r6.ACUTE_ORDER else len(k_r6.ACUTE_ORDER)))      # seventh review, Q03
    res["interrupt"] = imm[0] if imm else None; res["foldedInto"] = {}
    rules_by_id = {r["id"]: r for r in REG["rules"]}
    res["interruptActions"] = [(rules_by_id[k]["x"]["unknownDisplay"] if k in res["metViaUnknown"] else rules_by_id[k]["display"]) if k in rules_by_id else k for k in imm]      # Q07
    for k in imm[1:]: res["urgency"][k] = "folded"; res["foldedInto"][k] = imm[0]      # sixth review, L07: one interrupt per event
    for m in REG["riskModels"]:
        if not ages_ok(m): continue
        for b in m["bands"]:
            if ev_crit(b["when"], vals, site) == MET: res["risk"][m["id"]] = b["code"]; break
    for t in REG["interpretation"]:
        if t["feature"] not in vals or not ages_ok(t): continue
        if t["x"]["lane"] == "stratify" and not est: continue
        if not applies(t["x"]): continue
        if t.get("when") and ev_pred(t["when"], vals, site) != MET: continue
        if t["feature"] in blocked_any: res["bands_blocked"].append(t["id"]); continue   # never 'at target' on a value that is not valid
        x = vals[t["feature"]]
        for b in t["bands"]:
            if (b.get("from") is None or x >= b["from"]) and (b.get("to") is None or x < b["to"]): res["bands"][t["id"]] = b["code"]; break
    return res

def check_vignettes():
    results = {}
    for v in k_vignettes.VIGNETTES:
        r = run_vignette(v); ex = v["expect"]; p = f"vignette.{v['id']}"
        for k in v["values"]:
            if k not in FEATURES: E(p, f"unknown feature {k}")
        for k, want in ex.get("diagnosis", {}).items():
            if r["diagnosis"].get(k) != want: E(p, f"diagnosis {k}: expected {want}, got {r['diagnosis'].get(k)}")
        if "criterion" in ex and r["criteria"].get(ex["criterion"]) != MET: E(p, f"criterion {ex['criterion']} not met")
        for k, want in {**ex.get("criteria", {}), **ex.get("amend_criteria", {})}.items():
            if r["criteria"].get(k) != want: E(p, f"criterion {k}: expected {want}, got {r['criteria'].get(k)}")
        for k in ex.get("not_met_criteria", []):
            if r["criteria"].get(k) != NOT: E(p, f"criterion {k} should be not_met, got {r['criteria'].get(k)}")
        for k in ex.get("insufficient_criteria", []):
            if r["criteria"].get(k) != INS: E(p, f"criterion {k} should be insufficient, got {r['criteria'].get(k)}")
        for k in ex.get("blocked_criteria", []):
            if k not in r["blocked_criteria"]: E(p, f"criterion {k} should be blocked by a caveat")
        for k in ex.get("caveats", []):
            if k not in r["caveats"]: E(p, f"caveat {k} should be in force")
        for k in ex.get("caveats_absent", []):
            if k in r["caveats"]: E(p, f"caveat {k} should not be in force")
        for k in ex.get("fires", []):
            if ":" in k:
                kid, want = k.split(":")
                if r["states"].get(kid) != want: E(p, f"{kid}: expected {want}, got {r['states'].get(kid)}")
            elif k not in r["fired"] and k not in r["dark"]: E(p, f"{k} should fire (state {r['states'].get(k)})")
        for k in ex.get("silent", []):
            if k in r["fired"] or k in r["dark"]: E(p, f"{k} should stay silent")
        for k in ex.get("dark", []):
            if k not in r["dark"]: E(p, f"{k} should be met but dark (off until its decision); fired={k in r['fired']} state={r['states'].get(k)}")
        for k in ex.get("withheld", []):
            if k not in r["withheld"]: E(p, f"{k} should be withheld for the pregnancy answer, got {r['withheld']}")
        for k in ex.get("bands_blocked", []):
            if k not in r["bands_blocked"]: E(p, f"band {k} should be withheld by a validity caveat")
        if "max_fired" in ex and len(r["fired"]) > ex["max_fired"]: E(p, f"too much fires on an ordinary patient: {sorted(r['fired'])}")
        for k in ex.get("targets_absent", []):
            if k in r["targets"]: E(p, f"target {k} must not be proposed")
        if ex.get("nothing_fires") and r["fired"]: E(p, f"nothing should fire, got {sorted(r['fired'])}")
        if ex.get("no_management_steps"):
            bad = [k for k in r["steps_fired"] if next(s for s in REG["management"] if s["id"] == k)["x"]["kind"] != "refer"]
            if bad: E(p, f"under 16 only referral steps may fire, got {bad}")
        for k, want in ex.get("complications", {}).items():
            if r["complications"].get(k) != want: E(p, f"complication {k}: expected {want}, got {r['complications'].get(k)}")
        for k, want in ex.get("stages", {}).items():
            if r["stages"].get(k) != want: E(p, f"stage {k}: expected {want}, got {r['stages'].get(k)}")
        for k, want in ex.get("risk", {}).items():
            if r["risk"].get(k) != want: E(p, f"risk {k}: expected {want}, got {r['risk'].get(k)}")
        for k, want in ex.get("bands", {}).items():
            if r["bands"].get(k) != want: E(p, f"band {k}: expected {want}, got {r['bands'].get(k)}")
        if "bands" in ex and not ex["bands"] and r["bands"] and v["id"] in ("DMV-17",): E(p, f"no control band may be read without a current measure, got {r['bands']}")
        if ex.get("no_targets") and r["targets"]: E(p, f"no target may be proposed, got {r['targets']}")
        for k in ex.get("targets", []):
            if k not in r["targets"]: E(p, f"target {k} should be proposed")
        for k, want in ex.get("classification", {}).items():
            if r["classification"].get(k) != want: E(p, f"classification {k}: expected {want}, got {r['classification'].get(k)}")
        for k in ex.get("bands_absent", []):
            if k in r["bands"]: E(p, f"band table {k} must not be read here, got {r['bands'][k]}")
        for k in ex.get("stages_absent", []):
            if k in r["stages"]: E(p, f"no stage may be assigned on {k}, got {r['stages'][k]}")
        for k, want in ex.get("cautions", {}).items():
            if sorted(r["cautions"].get(k, [])) != sorted(want): E(p, f"cautions on {k}: expected {want}, got {r['cautions'].get(k)}")
        for k, want in ex.get("gaps", {}).items():
            if sorted(r["gaps"].get(k, [])) != sorted(want): E(p, f"gaps on {k}: expected {want}, got {r['gaps'].get(k)}")
        for k, want in ex.get("urgency", {}).items():
            if r["urgency"].get(k) != want: E(p, f"urgency of {k}: expected {want}, got {r['urgency'].get(k)}")
        if ex.get("something_fires") and not r["fired"]: E(p, "a dangerous patient on whom nothing fires")
        if ex.get("no_bands") and r["bands"]: E(p, f"no band may be read, got {r['bands']}")
        if ex.get("no_risk") and r["risk"]: E(p, f"no risk model may run, got {r['risk']}")
        if ex.get("no_flags") and any(kind == "therapyFlag" for kind in r["fired"].values()): E(p, f"no therapy flag may fire, got {sorted(k for k, kd in r['fired'].items() if kd == 'therapyFlag')}")
        for k in ex.get("unavailable_features", []):
            if k not in r["unavailable_features"]: E(p, f"{k} should be unavailable at this site")
        for k in ex.get("restricted", []):
            if k not in r["restricted"]: E(p, f"restricted class {k} should ride with the output")
        if ex.get("no_complication_state_is_met_or_not_met") and any(s in (MET, NOT) for s in r["complications"].values()): E(p, "a complication took a definite state on an empty record")
        results[v["id"]] = {"diagnosis": r["diagnosis"], "caveatsInForce": r["caveats"], "blockedCriteria": r["blocked_criteria"], "fired": dict(sorted(r["fired"].items())),
                            "metButDark": dict(sorted(r["dark"].items())), "withheldForPregnancyAnswer": r["withheld"], "bandsWithheldByCaveat": r["bands_blocked"],
                            "complications": r["complications"], "stages": r["stages"], "risk": r["risk"], "targets": r["targets"], "bands": r["bands"],
                            "classification": r["classification"], "unavailableFeatures": sorted(r["unavailable_features"]), "restrictedClasses": sorted(r["restricted"]),
                            "urgency": r["urgency"], "interrupt": r["interrupt"], "foldedInto": r["foldedInto"], "interruptActions": r["interruptActions"], "metViaUnknown": r["metViaUnknown"], "cautions": r["cautions"], "gaps": r["gaps"], "pregnancyState": preg_state(v["values"], v["ageBand"])}
    return results

# ── emit ────────────────────────────────────────────────────────────────────
def dump(rel, obj):
    path = os.path.join(OUT, rel); os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, indent=1); f.write("\n")
    return path

def designb_rules(usage):
    TRUST = {"suspect": 2, "confirm": 3, "classify": 3, "stratify": 2, "act": 2, "acute_route": 1}
    out = []
    def reads(crits):
        s = []
        for c in crits:
            for p in preds_of(c):
                cfc = FEATURES[p["feature"]]["x"].get("cfc") or f"ncd.{p['feature']} (no CFC concept yet)"
                if cfc not in s: s.append(cfc)
        return s
    def cits(item):
        c = item["citation"]; cl = CLAIMS[c["x"]["claim"]]
        return [{"source": c["title"], "section": c["x"]["section"], "url": c.get("url", ""), "verifiedOn": c.get("retrieved") if c["x"]["verified"] else None, "claim": c["x"]["claim"]}]
    def refs_of(crits):
        r = {}
        for c in crits:
            for x in usage.get(c["id"], []): r[x.replace("REF-DM-", "").lower()] = x
        return r
    for r in REG["rules"]:
        out.append({"id": r["id"], "family": r["x"]["family"], "lane": r["x"]["lane"], "title": r["display"],
                    "appliesTo": {"ageBands": r.get("ageBands"), "pregnancy": "pregnant" if (any(p["feature"] == "pregnant" for p in preds_of(r["when"]))
                                  and not any(p["feature"] == "postpartum_weeks" for p in preds_of(r["when"])) and not r["x"].get("pregnancyUnknownCounts")) else "any"},      # seventh review, Q04
                    "reads": reads([r["when"]]), "predicate": f"catalog.rule:{r['when']['id']}", "params": refs_of([r["when"]]), "minTrust": TRUST[r["x"]["lane"]],
                    "emits": ["acute_signal"] if r["x"]["lane"] == "acute_route" else ["state", "proposal"] if r["x"]["lane"] in ("suspect", "confirm") else ["flag", "proposal"],
                    "citations": cits(r), "status": "draft", "x": {"proposal": r["x"].get("proposal"), "neutralProposal": r["x"].get("neutralProposal"), "urgency": r["urgency"], "posterior": r["posterior"], "restrictedClasses": r["x"]["restrictedClasses"],
                          "interruptRank": r["x"].get("interruptRank"), "pregnancyUnknownCounts": r["x"].get("pregnancyUnknownCounts", False), "unknownDisplay": r["x"].get("unknownDisplay"),
                          "requiresCapability": r["x"].get("requiresCapability"), "unlessCapability": r["x"].get("unlessCapability"), "notWhen": [k["id"] for k in r["x"].get("notWhen", [])]}})
    for s in REG["management"]:
        out.append({"id": s["id"], "family": s["x"]["family"], "lane": s["x"]["lane"], "title": s["display"], "appliesTo": {"ageBands": ["adult", "older_adult"], "pregnancy": "any"},
                    "reads": reads([s["when"]] + s.get("contraindications", [])), "predicate": f"catalog.step:{s['when']['id']}", "params": refs_of([s["when"]] + s.get("contraindications", [])),
                    "minTrust": 2, "emits": ["proposal"], "citations": cits(s), "status": "draft",
                    "x": {"proposal": s["x"].get("proposal"), "neutralProposal": s["x"].get("neutralProposal"), "kind": s["x"]["kind"], "urgency": s["x"]["urgency"], "requiresPrescribing": s["requiresPrescribing"], "restrictedClasses": s["x"]["restrictedClasses"]}})
    for t in REG["therapyFlags"]:
        out.append({"id": "DM-ACT-FLAG-" + t["id"].upper().replace("_", "-"), "family": "DM-ACT-THERAPY", "lane": "act", "title": t["display"], "appliesTo": {"pregnancy": "any"},
                    "reads": reads([t["when"]]), "predicate": f"catalog.therapyFlag:{t['id']}", "params": refs_of([t["when"]]), "minTrust": 2, "emits": ["flag"], "citations": cits(t), "status": "draft",
                    "x": {"severity": t["severity"], "action": t["action"], "restrictedClasses": t["x"]["restrictedClasses"]}})
    for v in REG["validityCaveats"]:
        out.append({"id": "DM-CON-VALID-" + v["id"].upper().replace("_", "-"), "family": v["x"]["family"], "lane": "confirm", "title": v["label"], "appliesTo": {"pregnancy": "any"},
                    "reads": reads([v["when"]]), "predicate": f"catalog.caveat:{v['id']}", "params": refs_of([v["when"]]), "minTrust": 2, "emits": ["flag", "data_gap"], "citations": cits(v), "status": "draft",
                    "x": {"direction": v["direction"], "blocksDiagnosis": v["blocksDiagnosis"], "alternative": v.get("alternative"), "restrictedClasses": v["x"]["restrictedClasses"]}})
    for c in REG["complications"]:
        out.append({"id": {"diabetic_retinopathy": "DM-STR-EYE-01", "peripheral_neuropathy_probable": "DM-STR-NEURO-00"}[c["code"]], "family": c["x"]["family"], "lane": "stratify", "title": c["display"],
                    "appliesTo": {"pregnancy": "any"}, "reads": reads(c["establishedBy"]), "predicate": f"catalog.complication:{c['code']}", "params": refs_of(c["establishedBy"]) | {f"interval_{i}": iv["x"]["ref"] for i, iv in enumerate(c.get("screeningIntervals", []))},
                    "minTrust": 2, "emits": ["state", "proposal", "data_gap"], "citations": cits(c), "status": "draft", "x": {}})
    for m in REG["riskModels"]:
        out.append({"id": {"who_cvd_2019_eastern_ssa": "DM-STR-CVD-01", "hypoglycaemia_risk_ada": "DM-STR-HYPO-02"}[m["id"]], "family": m["x"]["family"], "lane": "stratify", "title": m["display"],
                    "appliesTo": {"pregnancy": "any"}, "reads": [FEATURES[f]["x"].get("cfc") or f"ncd.{f}" for f in m["requires"]], "predicate": f"catalog.riskModel:{m['id']}",
                    "params": refs_of([b["when"] for b in m["bands"]]), "minTrust": 2, "emits": ["state"], "citations": cits(m), "status": "draft", "x": {"applicabilityNote": m.get("applicabilityNote")}})
    return out + REG["designb_extra"]

def emit(vresults):
    usage = {}
    cat = strip_refs(copy.deepcopy(REG), usage)
    feats = [copy.deepcopy(f) for f in FEATURES.values()]
    by = lambda items, lane: [i for i in items if i["x"]["lane"] == lane]
    meta = lambda title, extra=None: {"pack": PACK, "file": title, "shape": "lib/ncd/catalog/schema.ts (briefing Appendix A). Keys named 'x' are outside the schema: provenance, lane and family, and proposed fields.", **(extra or {})}
    dump("catalog/00-capabilities-sections.json", {**meta("capabilities and sections"), "capabilities": cat["capabilities"], "sections": cat["sections"], "semantics": k_r5.SEMANTICS})
    dump("catalog/01-features.json", {**meta("features", {"counts": dict(collections.Counter(f["x"]["status"] for f in feats))}), "features": feats})
    dump("catalog/10-suspect.json", {**meta("lane: suspect"), "conditions": [c for c in cat["conditions"]], "rules": by(cat["rules"], "suspect"), "management": by(cat["management"], "suspect")})
    dump("catalog/20-confirm.json", {**meta("lane: confirm"), "diagnosis": cat["diagnosis"], "diagnosisPending": cat["diagnosis_pending"],
                                      "interpretation": by(cat["interpretation"], "confirm"), "validityCaveats": cat["validityCaveats"], "rules": by(cat["rules"], "confirm")})
    dump("catalog/30-classify.json", {**meta("lane: classify"), "classifications": cat["classifications"], "rules": by(cat["rules"], "classify")})
    dump("catalog/40-stratify.json", {**meta("lane: stratify"), "complications": cat["complications"], "complicationAmendments": by(cat["complication_amendments"], "stratify"),
                                       "riskModels": cat["riskModels"], "interpretation": by(cat["interpretation"], "stratify"), "rules": by(cat["rules"], "stratify"), "targetsProposed": cat["targets"]})
    dump("catalog/50-act.json", {**meta("lane: act"), "management": by(cat["management"], "act"), "therapyFlags": cat["therapyFlags"], "orderables": cat["orderables"]})
    dump("catalog/60-acute-route.json", {**meta("lane: acute_route"), "rules": by(cat["rules"], "acute_route"), "interpretation": by(cat["interpretation"], "acute_route"),
                                          "complicationAmendments": by(cat["complication_amendments"], "acute_route")})
    dump("catalog/ref-usage.json", {**meta("which REF-DM entry each criterion's numbers come from"), "usage": usage})
    # dossier
    refs = list(REFS.values())
    used_refs = {r for v in usage.values() for r in v} | {r for d in REG["designb_extra"] for r in d["params"].values()}
    for r in refs: r["x"]["usedByCriteria"] = sorted(k for k, v in usage.items() if r["id"] in v)
    dump("dossier/ref-dm.v1.json", {"id": "MS-NCD-DM-DOSSIER-001", "title": "Diabetes reference catalogue (REF-DM)", "version": PACK["version"], "status": "draft",
                                     "shape": "RefEntry of MS-NCD-ENG-001 [04], plus x for provenance", "count": len(refs),
                                     "verification": dict(collections.Counter(r["x"]["verification"]["verdict"] for r in refs)),
                                     "counts": {"withValue": sum(1 for r in refs if r["value"] is not None), "needsCsoInput": sum(1 for r in refs if r["x"].get("needsCsoInput")),
                                                "withConflict": sum(1 for r in refs if r["x"].get("conflicts")), "usedByARule": len(used_refs)}, "entries": refs})
    with open(os.path.join(OUT, "dossier", "ref-dm.v1.csv"), "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f); w.writerow(["id", "group", "value", "unit", "text", "source", "section", "url", "verifiedOn", "confidence", "needsCsoInput", "conflicts", "note", "claims", "quote", "recheck_verdict", "recheck_note", "recheck_quote", "usedByCriteria"])
        for r in refs:
            w.writerow([r["id"], r["x"]["group"], r["value"], r["unit"], r["text"], r["source"], r["x"]["section"], r["url"], r["verifiedOn"], r["confidence"],
                        r["x"].get("needsCsoInput", ""), r["x"].get("conflicts", ""), r["x"].get("note", ""), " ".join(r["x"]["claims"]), r["x"]["quote"],
                        r["x"]["verification"]["verdict"], r["x"]["verification"]["note"], r["x"]["verification"]["foundQuote"], " ".join(r["x"]["usedByCriteria"])])
    claim_refs = collections.defaultdict(list)
    for r in refs:
        for c in r["x"]["claims"]: claim_refs[c].append(r["id"])
    table = []
    for cid, c in CLAIMS.items():
        d = dict(c); d["usedByRefs"] = claim_refs.get(cid, []); d["citedDirectly"] = USED_CLAIMS.get(cid, 0) > 0
        if not c.get("verified") or c.get("from_memory"): d["needsCsoInput"] = "Not verified against the primary text in this research pass."
        table.append(d)
    dump("dossier/research-table.json", {"title": "Research table: every claim gathered, with its source", "retrieved": "2026-10-03", "count": len(table),
                                          "verified": sum(1 for c in table if c["verified"] and not c["from_memory"]), "note": "Quotes were read through a text-extraction tool and many sources through mirrors: spot-check before signing.", "claims": table})
    with open(os.path.join(OUT, "dossier", "research-table.csv"), "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f); w.writerow(["id", "topic", "claim", "standard", "version", "document", "section", "url", "quote", "retrieved", "verified", "from_memory", "conflicts", "usedByRefs"])
        for c in table:
            w.writerow([c["id"], c["topic"], c["claim"], c["standard"], c["version"], c["document"], c["section"], c["url"], c.get("quote", ""), c["retrieved"], c["verified"], c["from_memory"], c.get("conflicts", ""), " ".join(c["usedByRefs"])])
    # Design B
    rules = designb_rules(usage)
    dump("designb/pack-manifest.draft.json", {"id": "diabetes", "version": PACK["version"], "status": "draft", "semantics": k_r5.SEMANTICS,
        "criteriaSets": [c["id"] for c in REG["diagnosis"] + REG["diagnosis_pending"]], "defaultCriteriaSet": "who_hearts_d_2020",
        "defaultCriteriaSetNote": "D-NCD-11 names UCG 2023. Its text was not read, so the WHO set is the working default until D-DM-01 is decided.",
        "families": dict(sorted(collections.Counter(r["family"] for r in rules).items())), "lanes": dict(collections.Counter(r["lane"] for r in rules)), "rules": rules})
    # clerking v2
    dump("clerking-v2/00-engine-changes.json", {"pack": PACK, "engineChanges": k_clerk.ENGINE_CHANGES, "sourcesToAdd": k_clerk.sources_block()})
    dump("clerking-v2/04-history.amendment.json", {"pack": PACK, "catalogue": "MS-EMR-CLERK-CAT-001", "file": "data/clerking/clerking-history-catalogue.v1.json", "amendment": k_clerk.HISTORY})
    dump("clerking-v2/07-exam.amendment.json", {"pack": PACK, "catalogue": "MS-EMR-EXAM-CAT-001", "file": "data/clerking/clerking-exam-catalogue.v1.json", "amendment": k_clerk.EXAM})
    dump("clerking-v2/09-diagnosis.amendment.json", {"pack": PACK, "catalogue": "MS-EMR-DX-CAT-001", "file": "data/clerking/clerking-diagnosis-catalogue.v1.json",
         "amendSemantics": k_clerk.AMEND_SEMANTICS,
         "amendment": {"reference_entries.add": k_clerk.DX_REFS, "REF-DX-TERMS.add": k_clerk.TERMS_ADD, "named_scales.add": k_clerk.NAMED_SCALES, "profiles": k_clerk.PROFILES, "ddx_rules.add": k_clerk.DDX_RULES, "ddx_rules.amend": k_clerk.DDX_AMEND}})
    dump("clerking-v2/10-plan-care.v1.json", {"pack": PACK, "id": "MS-EMR-PLAN-CARE-001", "status": "draft", "note": "Unsigned: the Plan shows no suggested care until the CSO signs this list.", "items": k_clerk.PLAN_CARE})
    dump("wiring/test-menu.additions.json", {"pack": PACK, "file": "data/emr/test-catalogue.v1.json", "shape": k_wire.TEST_MENU_SHAPE, "add": k_wire.TEST_MENU_ADD})
    dump("wiring/formulary.additions.json", {"pack": PACK, "file": "data/prescribing/drug-catalogue.v0.json", **k_wire.FORMULARY_ADD})
    cfc_map = [{"feature": f["code"], "concept": f["x"].get("cfc"), "status": "existing" if f["x"].get("cfc") else "none", "valueType": f["valueType"], "unit": f.get("unit"),
                "restrictedClass": f["x"].get("restrictedClass")} for f in feats]
    dump("wiring/cfc-addendum.proposal.json", {"pack": PACK, "diffFirst": k_wire.CFC_NOTE, "note": "For a CFC addendum (next free number after v1.4) and a GATED seed migration (next free number 0092 or later). The owner applies migrations.",
         "featureToConcept": cfc_map, "conceptsToPropose": k_wire.CFC_PROPOSE, "qualifiersNeeded": k_wire.CFC_QUALIFIERS, "diagnosisTermToConcept": k_wire.CONDITION_CONCEPTS})
    # review log: every finding of the two reviews with what was done about it
    log = []
    for fname in ("R1-clinical.json", "R2-clerking.json", "R3-recheck.json", "R4-review.json", "R5-review.json", "R6-review.json", "R7-review.json"):
        for f in json.load(open(os.path.join(lib.ROOT, "review", fname), encoding="utf-8")):
            st, what = k_review.DISPOSITION[f["id"]]
            log.append({"id": f["id"], "review": fname[:2], "severity": f["severity"], "where": f["where"], "finding": f["finding"], "why": f["why"], "reviewerFix": f["fix"], "status": st, "done": what})
    dump("review/REVIEW-LOG.json", {"pack": PACK, "note": "R1 (clinical) and R2 (clerking wiring) read version 0.2.0-draft. R3 (clinical) re-read the fixes and found more; its findings are answered here too. 'fixed' means changed in this pack and, for the rule catalog, proved by a vignette. 'fixed_in_part' says what remains. 'cso_decision' and 'phase_0' are not fixed here.",
        "counts": {"bySeverity": dict(collections.Counter(x["severity"] for x in log)), "byStatus": dict(collections.Counter(x["status"] for x in log)),
                   "criticalNotFullyFixed": [x["id"] for x in log if x["severity"] == "critical" and x["status"] != "fixed"]}, "findings": log})
    with open(os.path.join(OUT, "review", "REVIEW-LOG.csv"), "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f); w.writerow(["id", "severity", "status", "where", "finding", "done"])
        for x in log: w.writerow([x["id"], x["severity"], x["status"], x["where"], x["finding"], x["done"]])
    # every catalogue id the clerking wiring uses, for Phase 0 to resolve against the live catalogues
    ids = collections.defaultdict(set)
    def walk_ids(o, where):
        if isinstance(o, dict):
            for v in o.values(): walk_ids(v, where)
        elif isinstance(o, list):
            for v in o: walk_ids(v, where)
        elif isinstance(o, str):
            for m in re.finditer(r"\b(sym|dx|ex|vs|test|sign|obs|exam|derived|soc|hx|cond|proc|event|target)\.[a-z0-9_.]+", o): ids[m.group(0).rstrip(".")].add(where)
    for where, blob in (("history", k_clerk.HISTORY), ("exam", k_clerk.EXAM), ("diagnosis", [k_clerk.PROFILES, k_clerk.DDX_RULES, k_clerk.DDX_AMEND]), ("plan", k_clerk.PLAN_CARE), ("test-menu", k_wire.TEST_MENU_ADD)):
        walk_ids(blob, where)
    new_dx = {p["id"] for p in k_clerk.PROFILES if p["_op"] == "add"}; new_tests = {t["id"] for t in k_wire.TEST_MENU_ADD}; new_cfc = {c["code"] for c in k_wire.CFC_PROPOSE}
    new_items = set(k_clerk.EXAM["items.add"]) | {p["id"] for p in k_clerk.EXAM["vital_signs.panels.add"]}
    dump("wiring/reconcile-ids.json", {"pack": PACK, "note": "Every catalogue id the clerking wiring names. 'proposed' ids are created by this pack. Every other id was written from the briefing's samples and MUST be found in the live catalogue in Phase 0; an id that is not found is reported, never guessed.",
        "ids": [{"id": k, "usedIn": sorted(v), "status": "proposed" if k in new_dx | new_tests | new_cfc | new_items else "resolve in Phase 0"} for k, v in sorted(ids.items())]})
    dump("decisions/d-dm.v1.json", {"pack": PACK, "note": "The first option of each decision is the recommendation. Nothing is decided until the CSO fills 'decision', 'signedBy' and 'signedOn'.", "count": len(k_decisions.D), "decisions": k_decisions.D})
    vs = []
    for v in k_vignettes.VIGNETTES:
        d = dict(v); d["computed"] = vresults[v["id"]]; vs.append(d)
    dump("vignettes/golden-vignettes.json", {"pack": PACK, "note": "Synthetic patients. 'computed' is what the reference evaluator produced from this pack; 'expect' is asserted against it at build time.",
         "sites": {"referral": "every capability", "district": k_vignettes.DISTRICT}, "count": len(vs), "vignettes": vs})
    return usage, rules

def summary(usage, rules):
    c = collections.Counter
    s = {"refs": len(REFS), "refsWithValue": sum(1 for r in REFS.values() if r["value"] is not None), "refsNeedCso": sum(1 for r in REFS.values() if r["x"].get("needsCsoInput")),
         "refsWithConflict": sum(1 for r in REFS.values() if r["x"].get("conflicts")),
         "claims": len(CLAIMS), "claimsVerified": sum(1 for x in CLAIMS.values() if x["verified"] and not x["from_memory"]), "claimsCited": len(USED_CLAIMS),
         "features": dict(c(f["x"]["status"] for f in FEATURES.values())), "catalog": {k: len(v) for k, v in REG.items()},
         "criteria": sum(1 for _ in all_criteria()), "designBRules": len(rules), "designBFamilies": len({r["family"] for r in rules}),
         "clerking": {"profiles": len(k_clerk.PROFILES), "newProfiles": sum(1 for p in k_clerk.PROFILES if p["_op"] == "add"), "ddxRules": len(k_clerk.DDX_RULES), "dxRefs": len(k_clerk.DX_REFS),
                      "examFlags": len(k_clerk.EXAM["flag_rules.add"]), "examSuggestions": len(k_clerk.EXAM["suggestion_rules.add"]), "historyFlags": len(k_clerk.HISTORY["flag_rules.add"]), "planCare": len(k_clerk.PLAN_CARE)},
         "recheck": dict(c(r["x"]["verification"]["verdict"] for r in REFS.values())),
         "beforeReview": k_review.BEFORE,
         "review": {"findings": len(k_review.DISPOSITION), "byStatus": dict(c(v[0] for v in k_review.DISPOSITION.values()))},
         "refsUsedByARule": len({r for v in usage.values() for r in v} | {r for d in REG["designb_extra"] for r in d["params"].values()}),
         "vignettes": len(k_vignettes.VIGNETTES), "acuteGrid": GRID, "errors": len(errors), "warnings": len(warnings)}
    return s

def check_neutral_proposals():      # fifth review, K17
    for kind in ("rules", "management"):
        for it in REG[kind]:
            p = it["x"].get("proposal") or {}
            if p.get("restrictedClass") and not it["x"].get("neutralProposal"): E(f"{kind}.{it['id']}", "proposal names a restricted class and has no neutralProposal")

GRID = {}
def check_acute_grid():      # sixth review: the escalation floor (D-DM-41) over 4,608 patients
    GRID.update(k_grid.check(run_vignette, E))

def check_decisions():
    known = {d["id"] for d in k_decisions.D}
    blob = json.dumps([REG, list(REFS.values()), k_clerk.PROFILES, k_clerk.DDX_RULES, k_clerk.PLAN_CARE, k_clerk.EXAM, k_clerk.HISTORY, k_clerk.ENGINE_CHANGES, k_clerk.DX_REFS, k_review.DISPOSITION,
                       k_wire.FORMULARY_ADD, [f for f in FEATURES.values()]], default=str, ensure_ascii=False)
    for d in sorted(set(re.findall(r"D-DM-\d+", blob))):
        if d not in known: E("decisions", f"{d} is cited in the pack and is not in the decision list")

if __name__ == "__main__":
    annotate(); validate(); check_neutral_proposals(); check_decisions(); vres = check_vignettes(); check_acute_grid()
    check_only = "--check" in sys.argv
    usage, rules = ({}, []) if check_only else emit(vres)
    s = summary(usage, rules)
    if not check_only:
        dump("BUILD-REPORT.json", {"pack": PACK, "summary": s, "errors": errors, "warnings": warnings})
    print(json.dumps(s, indent=1))
    for w in warnings: print("WARN ", w)
    for e in errors: print("ERROR", e)
    sys.exit(1 if errors else 0)
