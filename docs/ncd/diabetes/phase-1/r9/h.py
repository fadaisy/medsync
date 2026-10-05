import sys, os, json
PK = "/Users/airm1/Desktop/medsync-ncd/docs/ncd/diabetes/pack-0.3.0-draft"
sys.path.insert(0, PK + "/tools/build"); sys.argv = ["x"]
os.chdir(PK)
import build; build.annotate()
from build import REG
R = {r["id"]: r for r in REG["rules"]}; S = {s["id"]: s for s in REG["management"]}
F = {f["id"]: f for f in REG["therapyFlags"]}
def run(values, est=False, band="adult", site="referral", show=True, label=""):
    r = build.run_vignette({"id": "X", "site": site, "established": est, "ageBand": band, "values": values})
    if show:
        print("---", label)
        print(" fired:", {k: r["urgency"].get(k, r["fired"][k]) for k in r["fired"]})
        print(" interrupt:", r["interrupt"], "| viaUnknown:", r["metViaUnknown"])
        for k in ("diagnosis","targets","bands","risk","cautions","gaps","caveats","withheld","complications","classification"):
            v = r[k]
            if k=="diagnosis": v={a:b for a,b in v.items() if b!="not_applicable"}
            if k in ("complications","classification"): v={a:b for a,b in v.items() if b=="met"}
            if v: print(f" {k}:", v)
    return r
def pp(p):
    if "all" in p or "any" in p or "atLeast" in p: return cs(p)
    v = p.get("value"); 
    return f"{p['feature']} {p['op']}{'' if v is None else ' '+str(v)}"
def cs(c):
    out=[]
    if c.get("all"): out.append("ALL[" + "; ".join(pp(p) for p in c["all"]) + "]")
    if c.get("any"): out.append("ANY[" + "; ".join(pp(p) for p in c["any"]) + "]")
    if c.get("atLeast"): 
        of=c["atLeast"]["of"]; s="; ".join(pp(p) for p in of)
        if len(s)>200: s=s[:200]+"..."
        out.append(f"ATLEAST{c['atLeast']['n']}[" + s + "]")
    return " & ".join(out)
def show(it):
    x=it["x"]
    print(f"== {it['id']} [{x.get('lane',x.get('kind',''))}] urg={it.get('urgency',x.get('urgency'))} ages={it.get('ageBands',x.get('ages'))} run={x.get('runWhen')} preg={(x.get('appliesTo') or {}).get('pregnancy')} enabled={x.get('enabled')}")
    print("  D:", it.get("display"))
    print("  W:", cs(it["when"]))
    for k in x.get("notWhen",[]): print("  NOT:", k.get("label","")[:90], "=>", cs(k))
    if x.get("pregnancyUnknownCounts"): print("  PUC", x.get("unknownUrgency"))
