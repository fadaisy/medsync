"""Constructors for NcdCatalog-shaped content (lib/ncd/catalog/schema.ts, Appendix A
of the briefing). Anything the schema cannot hold goes under the key "x" and is
listed as a schema change in the hand-back; the strict shape is everything else.
"""
import collections
from lib import cite, refcite, REFS, claim, _bodies, CLAIMS

REG = collections.OrderedDict((k, []) for k in [
    "capabilities", "sections", "diagnosis", "diagnosis_pending", "classifications", "complications",
    "complication_amendments", "validityCaveats", "riskModels", "therapyFlags", "interpretation",
    "orderables", "management", "conditions", "rules", "designb_extra", "targets",
])

def _std(cid):
    c = CLAIMS[cid]
    return _bodies(c["standard"])[0], str(c.get("version") or "")

def X(lane, family, **kw):
    d = {"lane": lane, "family": family}
    d.update({k: v for k, v in kw.items() if v is not None})
    return d

def capability(code, display, tier, status="new"):
    REG["capabilities"].append({"code": code, "display": display, "tier": tier, "x": {"status": status}})
    return code

def section(sid, display, order, description=None, groups=None, status="new", segmented=None):
    s = {"id": sid, "display": display, "order": order}
    if description: s["description"] = description
    if groups: s["groups"] = [{"id": g[0], "display": g[1], "order": i + 1, **(g[2] if len(g) > 2 else {})} for i, g in enumerate(groups)]
    if segmented: s["segmented"] = True
    s["x"] = {"status": status}
    REG["sections"].append(s)

def criteria_set(sid, claim_id, anyOf, lane="confirm", family="DM-CON-CRIT", pending=None, note=None, pregnancy="not_pregnant", runWhen="not_established", verdict="diabetes"):
    body, version = _std(claim_id)
    cs = {"id": sid, "standard": body, "version": version, "anyOf": anyOf, "citation": cite(claim_id),
          "x": X(lane, family, note=note, verdict=verdict, appliesTo={"pregnancy": pregnancy, "runWhen": runWhen})}
    if pending:
        cs["x"]["pending"] = pending
        REG["diagnosis_pending"].append(cs)
    else:
        REG["diagnosis"].append(cs)
    return sid

def band(code, display, tone, frm=None, to=None, alert=None):
    b = {"code": code, "display": display, "tone": tone}
    if frm is not None: b["from"] = frm
    if to is not None: b["to"] = to
    if alert: b["alert"] = {"title": alert[0], "action": alert[1]}
    return b

def interp(tid, feature, claim_id, bands, when=None, note=None, toneLabels=None, toneColors=None,
           refs=(), lane="confirm", family="DM-CON-CRIT", status="new"):
    body, version = _std(claim_id)
    t = {"id": tid, "feature": feature, "standard": body, "version": version, "bands": bands, "citation": cite(claim_id)}
    if when: t["when"] = when
    if note: t["note"] = note
    if toneLabels: t["toneLabels"] = toneLabels
    if toneColors: t["toneColors"] = toneColors
    t["x"] = X(lane, family, refs=list(refs), status=status)
    REG["interpretation"].append(t)

def caveat(cid, feature, label, when, direction, blocks, claim_id, alternative=None, status="new", family="DM-CON-VALID"):
    assert direction in ("masks", "manufactures", "unpredictable")
    assert (not blocks) or alternative, f"{cid}: a blocking caveat needs an alternative"
    c = {"id": cid, "feature": feature, "label": label, "when": when, "direction": direction,
         "blocksDiagnosis": blocks, "citation": cite(claim_id)}
    if alternative: c["alternative"] = alternative
    c["x"] = X("confirm", family, status=status)
    REG["validityCaveats"].append(c)

def classification(code, display, supportedBy, claim_id, refutedBy=None, discriminators=None, status="new", family="DM-CLS-T1", note=None):
    c = {"code": code, "display": display, "supportedBy": supportedBy, "citation": cite(claim_id)}
    if refutedBy: c["refutedBy"] = refutedBy
    if discriminators: c["discriminators"] = discriminators
    c["x"] = X("classify", family, status=status, note=note)
    REG["classifications"].append(c)

def stage(code, display, severity, when):
    return {"code": code, "display": display, "when": when, "severity": severity}

def staging(sid, display, claim_id, stages):
    body, version = _std(claim_id)
    return {"id": sid, "display": display, "standard": body, "version": version, "stages": stages, "citation": cite(claim_id)}

def interval(months_ref, forStage=None):
    e = REFS[months_ref]
    assert e["unit"] == "months", months_ref
    d = {"months": e["value"], "citation": refcite(months_ref), "x": {"ref": months_ref}}
    if forStage: d["forStage"] = forStage
    return d

def complication(code, display, timing, establishedBy, screenedBy, claim_id, intervals=None, stagings=None,
                 emergency=None, family=None, status="new", note=None):
    c = {"code": code, "display": display, "timing": timing, "establishedBy": establishedBy,
         "screenedBy": screenedBy, "citation": cite(claim_id)}
    if intervals: c["screeningIntervals"] = intervals
    if stagings: c["staging"] = stagings
    if emergency:
        c["emergency"] = {"severity": emergency[0], "action": emergency[1], "citation": cite(emergency[2])}
    assert timing != "acute" or emergency, f"{code}: acute complication needs an emergency action"
    c["x"] = X("stratify" if timing == "chronic" else "acute_route", family, status=status, note=note)
    REG["complications"].append(c)

def amend(target, kind, change, claims, family, lane="stratify"):
    """A change to something the live catalog already has (dka, hhs, hypoglycaemia, DKD, foot)."""
    REG["complication_amendments"].append({"target": target, "kind": kind, "change": change,
                                           "citations": [cite(c) for c in claims], "x": X(lane, family)})

def risk_band(code, display, severity, when):
    return {"code": code, "display": display, "severity": severity, "when": when}

def risk_model(mid, display, claim_id, requires, bands, validatedIn=None, applicabilityNote=None, family="DM-STR-CVD", extra=None):
    body, version = _std(claim_id)
    m = {"id": mid, "display": display, "standard": body, "version": version, "requires": requires,
         "bands": bands, "citation": cite(claim_id)}
    if validatedIn is not None: m["validatedIn"] = validatedIn
    if applicabilityNote: m["applicabilityNote"] = applicabilityNote
    m["x"] = X("stratify", family, **(extra or {}))
    REG["riskModels"].append(m)

def therapy_flag(fid, display, severity, when, action, claim_id, status="new", family="DM-ACT-THERAPY"):
    f = {"id": fid, "display": display, "severity": severity, "when": when, "action": action, "citation": cite(claim_id)}
    f["x"] = X("act", family, status=status)
    REG["therapyFlags"].append(f)

KINDS = {"test", "screen", "refer", "recall", "educate", "target", "therapy_review", "reconcile", "examine"}
URG = {"routine", "same_day", "urgent", "immediate"}

def step(sid, display, when, claim_id, kind, family, lane="act", urgency="routine", prescribing=False,
         contraindications=None, proposal=None, level=None, standardSet=None, note=None, district=None, ages="adult"):
    assert kind in KINDS and urgency in URG
    body, version = _std(claim_id)
    s = {"id": sid, "display": display, "when": when, "standard": body, "version": version,
         "requiresPrescribing": prescribing, "citation": cite(claim_id)}
    if contraindications: s["contraindications"] = contraindications
    s["x"] = X(lane, family, kind=kind, urgency=urgency, proposal=proposal, levelOfCare=level,
               standardSet=standardSet, note=note, districtPathway=district, ages=ages,
               appliesTo={"pregnancy": "not_pregnant"} if kind == "therapy_review" else None)
    REG["management"].append(s)

def condition(code, display, claim_id, complication_code=None, ageBands=None, status="new"):
    c = {"code": code, "display": display, "citation": cite(claim_id)}
    if complication_code: c["complication"] = complication_code
    if ageBands: c["ageBands"] = ageBands
    c["x"] = {"status": status}
    REG["conditions"].append(c)

def drule(rid, display, cond, when, posterior, urgency, confirmWith, mimics, claim_id, family, lane="suspect",
          ageBands=None, rulesOut=None, notes=None, proposal=None):
    assert posterior in ("low", "moderate", "high") and urgency in URG
    r = {"id": rid, "display": display, "condition": cond, "when": when, "posterior": posterior, "urgency": urgency,
         "confirmWith": confirmWith, "mimicsToExclude": mimics, "citation": cite(claim_id)}
    if ageBands: r["ageBands"] = ageBands
    if rulesOut: r["rulesOut"] = rulesOut
    if notes: r["notes"] = notes
    r["x"] = X(lane, family, proposal=proposal)
    REG["rules"].append(r)

def orderable(code, display, fills, because=None, status="new", capability=None, test_menu=None):
    o = {"code": code, "display": display, "fills": fills}
    if because: o["because"] = because
    o["x"] = {"status": status, "capability": capability, "testMenu": test_menu}
    REG["orderables"].append(o)

def designb(rid, family, lane, title, predicate, params, reads, emits, claims, minTrust=2, appliesTo=None, note=None):
    """A Design B RuleDef for logic the NcdCatalog grammar cannot hold (time windows, counts, ranking)."""
    REG["designb_extra"].append({
        "id": rid, "family": family, "lane": lane, "title": title,
        "appliesTo": appliesTo or {"pregnancy": "any"}, "reads": reads, "predicate": predicate,
        "params": params, "minTrust": minTrust, "emits": emits,
        "citations": [{"source": CLAIMS[c]["document"], "section": CLAIMS[c]["section"], "url": CLAIMS[c]["url"] or "",
                       "verifiedOn": CLAIMS[c]["retrieved"] if CLAIMS[c]["verified"] and not CLAIMS[c]["from_memory"] else None,
                       "claim": c} for c in claims if claim(c)],
        "status": "draft", "x": {"note": note} if note else {},
    })

def target(tid, measure, tier, display, when, upper_ref=None, lower_ref=None, claim_id=None, note=None, pregnancy="not_pregnant"):
    """Proposed construct TargetRule (schema change S-DM-06)."""
    t = {"id": tid, "measure": measure, "tier": tier, "display": display, "when": when, "citation": cite(claim_id)}
    if upper_ref: t["upper"] = {"ref": upper_ref, "value": REFS[upper_ref]["value"], "unit": REFS[upper_ref]["unit"]}
    if lower_ref: t["lower"] = {"ref": lower_ref, "value": REFS[lower_ref]["value"], "unit": REFS[lower_ref]["unit"]}
    if note: t["note"] = note
    t["x"] = X("act", "DM-ACT-TARGET", appliesTo={"pregnancy": pregnancy})
    REG["targets"].append(t)
