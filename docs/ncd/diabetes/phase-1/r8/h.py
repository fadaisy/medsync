import sys, os, json
PK = "/Users/airm1/Desktop/medsync-ncd/docs/ncd/diabetes/pack-0.3.0-draft"
sys.path.insert(0, PK + "/tools/build"); sys.argv = ["x"]
import io, contextlib
with contextlib.redirect_stdout(io.StringIO()):
    import build; build.annotate()
from k_model import REG
R = {r["id"]: r for r in REG["rules"]}
M = {s["id"]: s for s in REG["management"]}
TF = {t["id"]: t for t in REG["therapyFlags"]}
VC = {c["id"]: c for c in REG["validityCaveats"]}
def run(vals, site="referral", est=None, band="adult", show=True, name=""):
    if est is None: est = vals.get("dm_status") == "known"
    r = build.run_vignette({"id": "X", "site": site, "established": est, "ageBand": band, "values": vals})
    if show:
        print("====", name, site, band, "est" if est else "new")
        print(" dx:", {k: v for k, v in r["diagnosis"].items() if v != "not_applicable"})
        print(" fired:", {k: (r["urgency"].get(k) or v) for k, v in r["fired"].items()})
        if r["interrupt"]: print(" INTERRUPT:", r["interrupt"], "| actions:", r["interruptActions"])
        for k in ("metViaUnknown", "dark", "caveats", "blocked_criteria", "targets", "withheld", "bands", "bands_blocked", "stages", "risk", "classification", "complications", "cautions", "gaps", "restricted"):
            if r[k]: print(f" {k}:", r[k] if not isinstance(r[k], dict) else {a: b for a, b in r[k].items() if b not in ("not_met",)})
    return r
def disp(i):
    it = R.get(i) or M.get(i) or TF.get(i) or VC.get(i)
    return it.get("display") or it.get("action") or it.get("title")
