"""Shared helpers for the MedSync diabetes knowledge pack builder.

Everything clinical is traced to a research claim (research/A*.json). A number is
typed once, in a REF-DM entry; every predicate that needs it points at the REF.
"""
import json, os, re, glob, collections

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)

# ── research claims ─────────────────────────────────────────────────────────
CLAIMS = {}
for _f in sorted(glob.glob(os.path.join(ROOT, "research", "A*.json"))):
    for _c in json.load(open(_f, encoding="utf-8")):
        CLAIMS[_c["id"]] = _c

# Research standard label → NcdCatalog StandardBody (schema.ts) + the body we
# would name if the union were widened (schema change S-DM-01).
def _bodies(std):
    s = std or ""
    table = [
        ("UCG", "local", "UG-MOH"), ("MoH-Uganda", "local", "UG-MOH"),
        ("ADA/EASD/JBDS/AACE/DTS", "EASD", "ADA-EASD-CONSENSUS"),
        ("JBDS", "local", "JBDS"), ("NICE", "local", "NICE"),
        ("Endocrine Society", "local", "ENDO-SOC"), ("ISPAD", "local", "ISPAD"),
        ("ICO", "local", "ICO"), ("IWGDF", "IWGDF", "IWGDF"), ("KDIGO", "KDIGO", "KDIGO"),
        ("ESC", "ESC", "ESC"), ("IDF", "IDF", "IDF"), ("WHO", "WHO", "WHO"), ("ADA", "ADA", "ADA"),
    ]
    for key, body, proposed in table:
        if key in s:
            return body, proposed
    return "local", "OTHER"

USED_CLAIMS = collections.Counter()

def claim(cid):
    if cid not in CLAIMS:
        raise KeyError(f"unknown claim {cid}")
    USED_CLAIMS[cid] += 1
    return CLAIMS[cid]

def cite(cid, needs=None, section=None):
    """A schema.ts Citation built from one research claim. Never typed by hand."""
    c = claim(cid)
    body, proposed = _bodies(c["standard"])
    out = {
        "standard": body,
        "version": str(c.get("version") or ""),
        "title": c.get("document") or "",
        "url": c.get("url") or None,
        "quote": (c.get("quote") or "").strip() or None,
        "retrieved": c.get("retrieved"),
        "csoSigned": False,
    }
    why = needs
    if not c.get("verified") or c.get("from_memory"):
        why = why or "Source text was not opened during research; the value is from memory or a secondary source. Confirm against the primary document before signing."
    if why:
        out["needsCsoInput"] = why
    out = {k: v for k, v in out.items() if v is not None}
    out["x"] = {"claim": cid, "section": section or c.get("section"), "bodyProposed": proposed,
                "verified": bool(c.get("verified")) and not c.get("from_memory")}
    return out

# ── REF-DM reference catalogue (Design B RefEntry + provenance) ─────────────
REFS = collections.OrderedDict()

def ref(rid, text, value=None, unit=None, claims=(), conf=None, needs=None, group=None,
        conflicts=None, note=None, district=None, conv=None):
    assert rid.startswith("REF-DM-"), rid
    assert rid not in REFS, f"duplicate {rid}"
    claims = [claims] if isinstance(claims, str) else list(claims)
    assert claims, f"{rid} has no claim"
    cs = [claim(c) for c in claims]
    first = cs[0]
    verified = all(bool(c.get("verified")) and not c.get("from_memory") for c in cs[:1])
    body, proposed = _bodies(first["standard"])
    if not verified:
        needs = needs or "Primary source not opened; value from memory or a secondary source."
    e = {
        "id": rid, "text": text, "value": value, "unit": unit,
        "source": f"{proposed} · {first.get('document')} · {first.get('version')}",
        "url": first.get("url") or "",
        "verifiedOn": first.get("retrieved") if verified else None,
        "confidence": conf or ("high" if verified else "low"),
        "status": "draft",
        "x": {
            "group": group, "standard": body, "bodyProposed": proposed,
            "section": first.get("section"), "quote": (first.get("quote") or "").strip(),
            "claims": claims, "verified": verified,
        },
    }
    if needs: e["x"]["needsCsoInput"] = needs
    if conflicts: e["x"]["conflicts"] = conflicts
    if note: e["x"]["note"] = note
    if district: e["x"]["districtFallback"] = district
    if conv: e["x"]["conversion"] = conv
    REFS[rid] = e
    return rid

def refcite(rid, needs=None):
    """A Citation for something whose number lives in a REF."""
    e = REFS[rid]
    c = cite(e["x"]["claims"][0], needs=needs or e["x"].get("needsCsoInput"))
    c["x"]["ref"] = rid
    return c

# ── features ────────────────────────────────────────────────────────────────
FEATURES = collections.OrderedDict()

def feat(code, display, kind, valueType, section, status="new", unit=None, options=None,
         requires=None, group=None, parent=None, cfc=None, claim_id=None, **extra):
    """status: reuse (seen in the briefing's catalog excerpts), reconcile (probably
    exists under this or another code; Phase 0 maps it), new (proposed)."""
    assert code not in FEATURES, f"duplicate feature {code}"
    assert status in ("reuse", "reconcile", "new")
    f = {"code": code, "display": display, "kind": kind, "valueType": valueType, "section": section}
    if unit: f["unit"] = unit
    if options:
        f["options"] = [{"value": o[0], "display": o[1]} if isinstance(o, (tuple, list)) else o for o in options]
    if requires: f["requires"] = requires
    if group: f["group"] = group
    if parent: f["parent"] = parent
    if claim_id: f["citation"] = cite(claim_id)
    xs = {"status": status}
    for k in list(extra):
        if k.startswith("x_"):
            xs[k[2:]] = extra.pop(k)
        elif k == "restricted":
            xs["restrictedClass"] = extra.pop(k)
    f.update(extra)
    f["x"] = xs
    if cfc: f["x"]["cfc"] = cfc
    FEATURES[code] = f
    return code

# ── predicates and criteria ─────────────────────────────────────────────────
OPS = {">=", ">", "<=", "<", "==", "!=", "in", "present", "absent", "recorded"}   # "recorded" is proposed (S-DM-13): true when a value exists; never false

def P(feature, op="present", value=None, ref=None, unit=None):
    assert op in OPS, op
    p = {"feature": feature, "op": op}
    if ref:
        e = REFS[ref]
        assert e["value"] is not None, f"{ref} has no value"
        p["value"] = e["value"]; unit = unit or e["unit"]
        p["_ref"] = ref
    elif value is not None:
        p["value"] = value
    if unit: p["unit"] = unit
    return p

def crit(cid, label, all=None, any=None, atLeast=None, claim_id=None, ref_id=None, confirm=None, needs=None):
    c = {"id": cid, "label": label}
    if all: c["all"] = all
    if any: c["any"] = any
    if atLeast: c["atLeast"] = {"n": atLeast[0], "of": atLeast[1]}
    if confirm is not None: c["requiresConfirmation"] = confirm
    assert claim_id or ref_id, f"criterion {cid} has no citation"
    c["citation"] = refcite(ref_id, needs) if ref_id else cite(claim_id, needs)
    return c

def preds_of(c):
    return list(c.get("all") or []) + list(c.get("any") or []) + list((c.get("atLeast") or {}).get("of") or [])

def strip_refs(obj, usage, path=""):
    """Remove the non-schema _ref keys, recording which REF each criterion used."""
    if isinstance(obj, dict):
        if "feature" in obj and "op" in obj and "_ref" in obj:
            usage.setdefault(path, []).append(obj["_ref"])
        cid = obj.get("id") if ("label" in obj and "citation" in obj) else None
        here = cid or path
        return {k: strip_refs(v, usage, here) for k, v in obj.items() if k != "_ref"}
    if isinstance(obj, list):
        return [strip_refs(v, usage, path) for v in obj]
    return obj

# ── the no-dose guard (invariant I5) ────────────────────────────────────────
# A threshold in mmol/L, %, mmHg, mL/min is a criterion. A drug amount is a dose.
DOSE_RX = re.compile(
    r"\b\d+(\.\d+)?\s?(mg|mcg|µg|microgram|g|units?|iu|ml|mL|tablets?|tabs?|puffs?)\b(?!\s*/\s*(dL|dl|g|mmol|L|l|24|min|day creat))"
    r"|\b(once|twice|three times)\s+(a\s+)?(daily|day)\b|\b(od|bd|tds|qds|nocte)\b",
    re.I)
DOSE_OK = re.compile(r"mg/dL|mg/g|mg/mmol|mL/min|mL/kg/h|mg/24|g/day|g/kg|g per|g of carbohydrate|75[- ]?g|10[- ]?g monofilament|100[- ]?g|50[- ]?g", re.I)

def dose_hits(text):
    hits = []
    for m in DOSE_RX.finditer(text or ""):
        ctx = text[max(0, m.start() - 12): m.end() + 14]
        if DOSE_OK.search(ctx):
            continue
        hits.append(m.group(0))
    return hits

def walk_strings(obj, path=""):
    if isinstance(obj, dict):
        for k, v in obj.items():
            if k in ("quote", "x", "url"):   # verbatim source text and provenance are exempt
                continue
            yield from walk_strings(v, f"{path}.{k}")
    elif isinstance(obj, list):
        for i, v in enumerate(obj):
            yield from walk_strings(v, f"{path}[{i}]")
    elif isinstance(obj, str):
        yield path, obj
