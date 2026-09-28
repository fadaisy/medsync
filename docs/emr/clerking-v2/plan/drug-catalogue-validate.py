#!/usr/bin/env python3
"""Validate drug-catalogue.v0.json (MS-RX-CAT-001).

Usage:
    python3 drug-catalogue-validate.py [catalogue.json] [diagnosis-catalogue.json]

Defaults resolve next to this script:
    ./drug-catalogue.v0.json
    ../clerking-summary-impression/clerking-diagnosis-catalogue.v1.json

Exits 0 when every check passes, 1 otherwise. The most important check is
that no dose content has slipped in: this draft must carry no dose, dose
range, per-kg amount, frequency, maximum or duration for any drug.
"""
import json
import os
import re
import sys
from collections import Counter

HERE = os.path.dirname(os.path.abspath(__file__))
CAT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, "drug-catalogue.v0.json")
DX = sys.argv[2] if len(sys.argv) > 2 else os.path.join(
    HERE, "..", "clerking-summary-impression", "clerking-diagnosis-catalogue.v1.json")

ROUTES = {"oral", "iv", "im", "sc", "pr", "inhaled", "nebulised", "topical",
          "sublingual", "buccal", "intranasal", "infusion"}
CHARTS = {"mar", "fluid_balance", "glucose", "observations", "neuro", "temperature", "drug_level"}
SUPPORTIVE = {"fluids", "oxygen", "blood_products", "nutrition"}
FLAGS = ["renal", "hepatic", "weightBasedInChildren", "weightBasedInAdults", "controlled",
         "highAlert", "narrowTherapeuticIndex", "reserveAntibiotic"]
DOSE_KEYS = {"status", "verifyAt", "regimens", "bands", "renal", "hepatic", "pregnancy"}
BANDS = {"adult", "olderAdult", "child"}

# Amount with a unit. A percentage is matched on its own because "%" is not a
# word character, so a trailing \b would never fire after it.
DOSE_RE = re.compile(
    r"\d+(?:[.,]\d+)?\s*(?:"
    r"(?:mg/kg|mcg/kg|micrograms?/kg|g/kg|units?/kg|mg/m2|"
    r"mg|g|mcg|µg|ug|micrograms?|mL|ml|L|units?|IU|mmol|mEq|drops?)\b"
    r"|%)",
    re.IGNORECASE)
# Frequency, per-kg and duration wording.
FREQ_RE = re.compile(
    r"\b(?:once|twice|thrice|three times|four times)\s+(?:a\s+|per\s+)?(?:day|daily|week|weekly)\b"
    r"|\b(?:od|bd|bid|tds|tid|qds|qid|nocte|mane|prn|stat|q\d+h)\b"
    r"|\bevery\s+\d+\s*(?:min(?:ute)?s?|h|hrs?|hours?|days?|weeks?)\b"
    r"|\b(?:for|x)\s*\d+\s*(?:days?|weeks?|months?|doses?)\b"
    r"|\bper\s+kg\b|/kg\b"
    r"|\bmax(?:imum)?\s+(?:dose|daily)\b",
    re.IGNORECASE)

errors, warnings = [], []


def err(msg):
    errors.append(msg)


def walk_strings(node, path):
    """Yield (path, string) for every string value and dict key under node."""
    if isinstance(node, str):
        yield path, node
    elif isinstance(node, dict):
        for k, v in node.items():
            yield f"{path}.{k}(key)", k
            yield from walk_strings(v, f"{path}.{k}")
    elif isinstance(node, list):
        for i, v in enumerate(node):
            yield from walk_strings(v, f"{path}[{i}]")


def scan_no_dose(node, path, exempt_paths=()):
    for p, s in walk_strings(node, path):
        if p in exempt_paths:
            # Legitimate strength-in-name (e.g. "Glucose 50%"). Still forbid
            # frequency and duration wording there.
            if FREQ_RE.search(s):
                err(f"frequency/duration wording in {p}: {s!r}")
            continue
        m = DOSE_RE.search(s)
        if m:
            err(f"dose-like text in {p}: {s!r} (matched {m.group(0)!r})")
        m = FREQ_RE.search(s)
        if m:
            err(f"frequency/duration wording in {p}: {s!r} (matched {m.group(0)!r})")


def unique(items, key, label):
    ids = [x.get(key) for x in items]
    for i, n in Counter(ids).items():
        if n > 1:
            err(f"duplicate {label} id: {i}")
        if not i:
            err(f"{label} with empty id")
    return set(ids)


with open(CAT, encoding="utf-8") as f:
    cat = json.load(f)
with open(DX, encoding="utf-8") as f:
    dx = json.load(f)
dx_ids = set(dx.get("profiles", {}).keys())
if not dx_ids:
    err(f"no profiles found in diagnosis catalogue {DX}")

for k in ("id", "version", "createdAt", "status", "systems", "classes", "drugs", "diagnosisLinks"):
    if k not in cat:
        err(f"missing top-level field: {k}")

systems = cat.get("systems", [])
classes = cat.get("classes", [])
drugs = cat.get("drugs", [])
links = cat.get("diagnosisLinks", [])
agroups = cat.get("allergyGroups")
supportive = cat.get("supportive", [])

system_ids = unique(systems, "id", "system")
class_ids = unique(classes, "id", "class")
drug_ids = unique(drugs, "id", "drug")
ag_ids = unique(agroups, "id", "allergyGroup") if agroups is not None else None
unique(supportive, "id", "supportive")
for s in supportive:
    if s["id"] not in SUPPORTIVE:
        err(f"supportive item {s['id']} not in allowed set {sorted(SUPPORTIVE)}")
    for c in s.get("classes", []):
        if c not in class_ids:
            err(f"supportive {s['id']}: unknown class {c}")
overlap = (class_ids & drug_ids) | (system_ids & class_ids)
if overlap:
    warnings.append(f"ids shared across kinds (allowed, but check): {sorted(overlap)}")

# ---- classes
by_class = {c["id"]: c for c in classes}
children = Counter()
for c in classes:
    cid = c["id"]
    for k in ("name", "system", "parent", "allergyGroup"):
        if k not in c:
            err(f"class {cid}: missing field {k}")
    if c.get("system") not in system_ids:
        err(f"class {cid}: unknown system {c.get('system')}")
    par = c.get("parent")
    if par is not None:
        if par not in class_ids:
            err(f"class {cid}: unknown parent {par}")
        elif par == cid:
            err(f"class {cid}: is its own parent")
        else:
            children[par] += 1
    ag = c.get("allergyGroup")
    if ag is not None and ag_ids is not None and ag not in ag_ids:
        err(f"class {cid}: unknown allergyGroup {ag}")
    # cycle check
    seen, cur = set(), cid
    while cur is not None and cur in by_class:
        if cur in seen:
            err(f"class {cid}: parent cycle")
            break
        seen.add(cur)
        cur = by_class[cur].get("parent")
    scan_no_dose(c, f"class[{cid}]", exempt_paths={f"class[{cid}].name"})

# ---- drugs
drugs_per_class = Counter()
for d in drugs:
    did = d.get("id")
    path = f"drug[{did}]"
    for k in ("generic", "class", "routes", "methods", "presentationsDraft", "allergyGroups",
              "flags", "charts", "dose", "onEmhsluDraft"):
        if k not in d:
            err(f"{path}: missing field {k}")
    if d.get("class") not in class_ids:
        err(f"{path}: unknown class {d.get('class')}")
    drugs_per_class[d.get("class")] += 1
    routes = d.get("routes", [])
    if not routes:
        err(f"{path}: no routes")
    if len(set(routes)) != len(routes):
        err(f"{path}: duplicate routes")
    for r in routes:
        if r not in ROUTES:
            err(f"{path}: route {r!r} not allowed")
    methods = d.get("methods", {})
    if set(methods) != set(routes):
        err(f"{path}: methods keys {sorted(methods)} != routes {sorted(routes)}")
    for r, ms in methods.items():
        if not isinstance(ms, list) or not ms or not all(isinstance(x, str) and x for x in ms):
            err(f"{path}: methods[{r}] must be a non-empty list of labels")
    if not d.get("presentationsDraft"):
        err(f"{path}: presentationsDraft empty")
    for ag in d.get("allergyGroups", []):
        if ag_ids is not None and ag not in ag_ids:
            err(f"{path}: unknown allergyGroup {ag}")
    cls = by_class.get(d.get("class"), {})
    if cls.get("allergyGroup") and cls["allergyGroup"] not in d.get("allergyGroups", []):
        err(f"{path}: missing its class allergyGroup {cls['allergyGroup']}")
    fl = d.get("flags", {})
    if set(fl) != set(FLAGS):
        err(f"{path}: flags keys {sorted(fl)} != {sorted(FLAGS)}")
    for k, v in fl.items():
        if not isinstance(v, bool):
            err(f"{path}: flag {k} must be true/false")
    charts = d.get("charts", [])
    for ch in charts:
        if ch not in CHARTS:
            err(f"{path}: chart {ch!r} not allowed")
    if "mar" not in charts:
        warnings.append(f"{path}: charts does not include mar")
    if d.get("onEmhsluDraft") not in (True, False, None):
        err(f"{path}: onEmhsluDraft must be true, false or null")
    if fl.get("controlled") and "observations" not in charts:
        warnings.append(f"{path}: controlled drug without observations chart")

    # ---- dose must be empty
    dose = d.get("dose", {})
    if set(dose) != DOSE_KEYS:
        err(f"{path}: dose keys {sorted(dose)} != {sorted(DOSE_KEYS)}")
    if dose.get("status") != "to-verify":
        err(f"{path}: dose.status must be 'to-verify', got {dose.get('status')!r}")
    if dose.get("regimens") != []:
        err(f"{path}: dose.regimens must be empty")
    bands = dose.get("bands", {})
    if set(bands) != BANDS:
        err(f"{path}: dose.bands keys {sorted(bands)} != {sorted(BANDS)}")
    for b, v in bands.items():
        if v is not None:
            err(f"{path}: dose.bands.{b} must be null")
    for k in ("renal", "hepatic", "pregnancy"):
        if dose.get(k) is not None:
            err(f"{path}: dose.{k} must be null")
    if not dose.get("verifyAt"):
        err(f"{path}: dose.verifyAt empty")

    scan_no_dose(d, path, exempt_paths={f"{path}.generic"})

# every system is used; leaf classes need drugs; parent classes may be empty
used_systems = {c.get("system") for c in classes}
for sid in sorted(system_ids - used_systems):
    err(f"system {sid}: has no classes")
for c in classes:
    if children[c["id"]] == 0 and drugs_per_class[c["id"]] == 0:
        err(f"class {c['id']}: leaf class with no drugs")

# ---- diagnosis links
unique([{"id": l.get("profileId")} for l in links], "id", "diagnosisLink")
for l in links:
    pid = l.get("profileId")
    if pid not in dx_ids:
        err(f"diagnosisLink {pid}: profile not in diagnosis catalogue")
    if not l.get("classes") and not l.get("supportive"):
        err(f"diagnosisLink {pid}: no classes and no supportive items")
    for c in l.get("classes", []):
        if c not in class_ids:
            err(f"diagnosisLink {pid}: unknown class {c}")
    if len(set(l.get("classes", []))) != len(l.get("classes", [])):
        err(f"diagnosisLink {pid}: duplicate classes")
    for s in l.get("supportive", []):
        if s not in SUPPORTIVE:
            err(f"diagnosisLink {pid}: supportive {s!r} not in {sorted(SUPPORTIVE)}")
    scan_no_dose(l, f"diagnosisLink[{pid}]")

# ---- everything else at top level
for k in ("id", "version", "createdAt", "status", "conventions", "systems", "allergyGroups", "supportive"):
    if k in cat:
        scan_no_dose(cat[k], k)

# ---- report
leaf = [c for c in classes if children[c["id"]] == 0]
fc = Counter()
for d in drugs:
    for k, v in d.get("flags", {}).items():
        if v:
            fc[k] += 1
emh = Counter(str(d.get("onEmhsluDraft")).lower() for d in drugs)
route_c = Counter(r for d in drugs for r in d.get("routes", []))
chart_c = Counter(c for d in drugs for c in d.get("charts", []))
sys_c = Counter(by_class[d["class"]]["system"] for d in drugs if d.get("class") in by_class)
linked = {c for l in links for c in l.get("classes", [])}
sup_classes = {s["id"]: s.get("classes", []) for s in supportive}
linked |= {c for l in links for s in l.get("supportive", []) for c in sup_classes.get(s, [])}

print(f"Catalogue: {cat.get('id')} {cat.get('version')}")
print(f"systems {len(systems)} | classes {len(classes)} ({len(leaf)} leaf, {len(classes) - len(leaf)} parent) | "
      f"drugs {len(drugs)} | diagnosis links {len(links)} | allergy groups {len(agroups or [])}")
print("drugs per system: " + ", ".join(f"{k} {v}" for k, v in sorted(sys_c.items())))
print("flags: " + ", ".join(f"{k} {fc[k]}" for k in FLAGS))
print(f"onEmhsluDraft: true {emh['true']}, false {emh['false']}, null (unsure) {emh['none']}")
print("routes: " + ", ".join(f"{k} {v}" for k, v in route_c.most_common()))
print("charts: " + ", ".join(f"{k} {v}" for k, v in chart_c.most_common()))
print(f"doses: {sum(1 for d in drugs if d.get('dose', {}).get('status') == 'to-verify')}/{len(drugs)} to-verify, "
      f"0 regimens allowed, dose-text scan {'clean' if not any('dose-like' in e or 'frequency' in e for e in errors) else 'FAILED'}")
unlinked = sorted(c["id"] for c in leaf if c["id"] not in linked)
if unlinked:
    print(f"leaf classes not reached from any diagnosis link ({len(unlinked)}): {', '.join(unlinked)}")
for w in warnings:
    print(f"WARN  {w}")
for e in errors:
    print(f"FAIL  {e}")
print("RESULT: " + ("PASS" if not errors else f"FAIL ({len(errors)} errors)"))
sys.exit(1 if errors else 0)
