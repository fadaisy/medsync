"""R4 helper: run a patient through the pack's reference evaluator and print what a clinician would see."""
import sys, os, io, contextlib
PACK = "/Users/airm1/Desktop/medsync-ncd/docs/ncd/diabetes/pack-0.3.0-draft"
sys.path.insert(0, os.path.join(PACK, "tools/build")); sys.argv = ["x"]
with contextlib.redirect_stdout(io.StringIO()):
    import build
    build.annotate()
from k_model import REG
IDX = {}
for kind in ("rules", "management", "therapyFlags", "targets", "validityCaveats"):
    for it in REG[kind]: IDX[it.get("id", it.get("code"))] = (kind, it)

def disp(i):
    k, it = IDX.get(i, (None, {}))
    return it.get("display") or it.get("label") or it.get("title") or ""

def run(values, site="referral", est=True, band="adult", label="", quiet=False):
    v = {"id": "R4", "site": site, "established": est, "ageBand": band, "values": values}
    r = build.run_vignette(v)
    if quiet: return r
    print(f"\n=== {label}  [{site}, est={est}, {band}]")
    print("  diagnosis:", {k: s for k, s in r["diagnosis"].items() if s != "not_applicable"})
    for i, kind in r["fired"].items():
        u = r["urgency"].get(i, "")
        sev = IDX[i][1].get("severity", "") if kind == "therapyFlag" else ""
        print(f"  FIRED {kind:11s} {u or sev:9s} {i}: {disp(i)[:150]}")
    if r["dark"]: print("  dark:", list(r["dark"]))
    if r["withheld"]: print("  withheld:", r["withheld"])
    if r["bands"]: print("  bands:", r["bands"])
    if r["bands_blocked"]: print("  bands_blocked:", r["bands_blocked"])
    if r["targets"]: print("  targets:", r["targets"])
    if r["risk"]: print("  risk:", r["risk"])
    if r["caveats"]: print("  caveats:", r["caveats"])
    if r["gaps"]: print("  gaps:", r["gaps"])
    if r["cautions"]: print("  cautions:", r["cautions"])
    cl = {k: s for k, s in r["classification"].items() if s != "not_met"}
    if cl: print("  classification:", cl)
    cm = {k: s for k, s in r["complications"].items() if s in ("met", "insufficient")}
    if cm: print("  complications:", cm, r["stages"])
    sup = [k for k, s in r["states"].items() if s in ("suppressed", "unavailable_here", "contraindicated")]
    if sup: print("  suppressed/unavail/contra:", [(k, r["states"][k]) for k in sup])
    return r

def c(values, site="referral", est=True, band="adult", label="", extra=()):
    """Compact: every fired rule/flag; steps only when not routine; plus counts."""
    r = run(values, site, est, band, quiet=True)
    print(f"\n=== {label} [{site[:4]}, est={est}, {band}]")
    nr = 0
    for i, kind in r["fired"].items():
        u = r["urgency"].get(i, "")
        if kind == "step" and u == "routine": nr += 1; continue
        print(f"  {kind[:5]} {u or 'flag':9s} {i}: {disp(i)[:110]}" + (f"  gaps={r['gaps'].get(i)}" if r['gaps'].get(i) else "") + (f" caut={r['cautions'].get(i)}" if r['cautions'].get(i) else ""))
    if nr: print(f"  (+{nr} routine steps: {[i for i,k in r['fired'].items() if k=='step' and r['urgency'].get(i)=='routine']})")
    d = {k: s for k, s in r["diagnosis"].items() if s not in ("not_applicable", "not_met")}
    if d: print("  dx:", d)
    sup = [(k, s) for k, s in r["states"].items() if s in ("suppressed", "unavailable_here", "contraindicated")]
    if sup: print("  supp:", sup)
    for k in ("dark", "withheld", "bands", "targets", "risk", "caveats") + tuple(extra):
        if r[k]: print(f"  {k}:", r[k] if not isinstance(r[k], dict) else dict(r[k]))
    return r
