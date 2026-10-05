import sys, os, json
PACK = "/Users/airm1/Desktop/medsync-ncd/docs/ncd/diabetes/pack-0.3.0-draft"
sys.path.insert(0, PACK + "/tools/build"); sys.argv = ["x"]
os.chdir(PACK)
import build; build.annotate()
from k_model import REG
R = {r["id"]: r for r in REG["rules"]}
M = {s["id"]: s for s in REG["management"]}
F = {t["id"]: t for t in REG["therapyFlags"]}
def run(vals, site="referral", est=None, band=None, show=True, tag=""):
    age = vals.get("age_years", 45)
    if band is None:
        band = "child" if age < 10 else "adolescent" if age < 16 else "older_adult" if age >= 65 else "adult"
    if est is None:
        est = vals.get("dm_status") == "known"
    r = build.run_vignette({"id": "X", "site": site, "established": est, "ageBand": band, "values": vals})
    if show:
        fired = {k: r["urgency"].get(k, r["fired"][k]) for k in r["fired"]}
        print("--", tag, site, band, "est" if est else "new")
        print("   fired:", fired)
        if r["interrupt"]: print("   interrupt:", r["interrupt"], "| actions:", r["interruptActions"])
        for k in ("diagnosis", "targets", "bands", "risk", "cautions", "gaps", "caveats", "withheld", "actionOverride", "classification", "stages"):
            v = r.get(k)
            if k == "diagnosis": v = {a: b for a, b in v.items() if b not in ("not_applicable",)}
            if k == "classification": v = {a: b for a, b in (v or {}).items() if b == "met"}
            if v: print("  ", k + ":", v)
    return r
def top(r):
    RANK = {None: 0, "routine": 0, "urgent": 1, "same_day": 2, "immediate": 3, "folded": 3}
    return max([RANK.get(r["urgency"].get(k), 0) for k in r["fired"]] + [0])
