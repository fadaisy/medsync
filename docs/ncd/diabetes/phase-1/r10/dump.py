from h import *
HERE="/Users/airm1/Desktop/medsync-ncd/docs/ncd/diabetes/phase-1/r10"
def cs(c):
    if not c: return ""
    out=[]
    def p(x): return f"{x['feature']} {x['op']} {x.get('value','')}".strip()
    if c.get("all"): out.append("ALL[" + "; ".join(p(x) for x in c["all"]) + "]")
    if c.get("any"): out.append("ANY[" + "; ".join(p(x) for x in c["any"]) + "]")
    if c.get("atLeast"): out.append(f"ATLEAST{c['atLeast']['n']}[" + "; ".join(p(x) for x in c["atLeast"]["of"]) + "]")
    return " & ".join(out)
with open(HERE+"/rules.txt","w") as f:
    for r in REG["rules"]:
        x=r["x"]
        f.write(f"\n### {r['id']} lane={x['lane']} urg={r.get('urgency')} run={x.get('runWhen')} ages={r.get('ageBands')} preg={(x.get('appliesTo') or {}).get('pregnancy')} unlessCap={x.get('unlessCapability')} reqCap={x.get('requiresCapability')} enabled={x.get('enabled')} pUC={x.get('pregnancyUnknownCounts')} uU={x.get('unknownUrgency')}\n  D: {r['display']}\n  W: {cs(r['when'])}\n")
        for k in x.get("notWhen",[]): f.write(f"  NOT[{k['id']}]: {cs(k)}\n")
with open(HERE+"/mgmt.txt","w") as f:
    for s in REG["management"]:
        x=s["x"]
        f.write(f"\n### {s['id']} kind={x.get('kind')} urg={x.get('urgency')} run={x.get('runWhen')} ages={x.get('ages')} preg={(x.get('appliesTo') or {}).get('pregnancy')} less={x.get('lessTreatment')} enabled={x.get('enabled')} measures={x.get('measures')}\n  D: {s.get('display')}\n  W: {cs(s['when'])}\n")
        for k in x.get("notWhen",[]): f.write(f"  NOT[{k['id']}]: {cs(k)}\n")
        for k in s.get("contraindications",[]): f.write(f"  CI[{k['id']}]: {cs(k)}\n")
        for k in x.get("cautions",[]): f.write(f"  CAU[{k['id']}]: {cs(k)}\n")
    f.write("\n\n######## FLAGS\n")
    for t in REG["therapyFlags"]:
        x=t["x"]; f.write(f"\n### {t['id']} ages={x.get('ages')} u16={x.get('under16Action')}\n  D: {t.get('display')}\n  A: {t.get('action')}\n  W: {cs(t['when'])}\n")
        for k in x.get("notWhen",[]): f.write(f"  NOT[{k['id']}]: {cs(k)}\n")
    f.write("\n\n######## TARGETS\n")
    for t in REG["targets"]:
        x=t["x"]; f.write(f"\n### {t['id']} measure={t['measure']} ages={x.get('ages')} preg={(x.get('appliesTo') or {}).get('pregnancy')} sup={x.get('supersedes')}\n  D: {t.get('display')}\n  W: {cs(t['when'])}\n")
        for k in x.get("notWhen",[]): f.write(f"  NOT[{k['id']}]: {cs(k)}\n")
    f.write("\n\n######## CAVEATS\n")
    for c in REG["validityCaveats"]:
        f.write(f"\n### {c['id']} feat={c['feature']} block={c['blocksDiagnosis']} dir={c['direction']}\n  W: {cs(c['when'])}\n")
        for k in c["x"].get("notWhen",[]): f.write(f"  NOT[{k['id']}]: {cs(k)}\n")
    f.write("\n\n######## RISK\n")
    for m in REG["riskModels"]:
        f.write(f"\n### {m['id']} mustHave={m['x'].get('mustHave')}\n")
        for b in m["bands"]: f.write(f"  {b['code']}: {cs(b['when'])}\n")
    f.write("\n\n######## INTERP\n")
    for t in REG["interpretation"]:
        f.write(f"\n### {t['id']} feat={t['feature']} lane={t['x'].get('lane')} forTarget={t['x'].get('forTarget')} when={t.get('when')} preg={(t['x'].get('appliesTo') or {}).get('pregnancy')}\n  " + " | ".join(f"{b['code']}[{b.get('from')},{b.get('to')})" for b in t["bands"]) + "\n")
