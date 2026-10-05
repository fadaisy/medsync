import sys, os, io, contextlib
PK = "/Users/airm1/Desktop/medsync-ncd/docs/ncd/diabetes/pack-0.3.0-draft"
sys.path.insert(0, PK + "/tools/build"); sys.argv = ["x"]
_cwd = os.getcwd(); os.chdir(PK)
with contextlib.redirect_stdout(io.StringIO()):
    import build; build.annotate()
os.chdir(_cwd)
from k_model import REG
RULES = {r["id"]: r for r in REG["rules"]}
MGMT = {s["id"]: s for s in REG["management"]}
def run(values, band="adult", est=True, site="district"):
    return build.run_vignette({"id": "X", "site": site, "established": est, "ageBand": band, "values": values})
def short(r):
    out = []
    for k in r["fired"]:
        out.append(f"{k}:{r['urgency'].get(k, r['fired'][k])}")
    return out
def show(name, values, **kw):
    r = run(values, **kw)
    print(name, "->", short(r), "dark:", list(r["dark"]), "gaps:", r["gaps"], "caveats:", r["caveats"], "withheld:", r["withheld"])
    return r
IDX = {}
for kind in ("rules", "management", "therapyFlags", "targets", "validityCaveats"):
    for it in REG[kind]: IDX[it.get("id", it.get("code"))] = (kind, it)
def disp(i):
    k, it = IDX.get(i, (None, {}))
    return it.get("display") or it.get("label") or ""
T1 = {"dm_status":"known","dm_type_recorded":"type_1","glucose_lowering_therapy":["insulin"]}
T2 = {"dm_status":"known","dm_type_recorded":"type_2"}
M = lambda **k: {"sex":"male", **k}; F = lambda **k: {"sex":"female", **k}
def c(values, site="referral", est=True, band="adult", label="", full=False):
    r = run(values, band=band, est=est, site=site)
    print(f"\n=== {label} [{site[:4]}, est={est}, {band}]")
    nr = []
    for i, kind in r["fired"].items():
        u = r["urgency"].get(i, "")
        if kind == "step" and u == "routine" and not full: nr.append(i); continue
        print(f"  {kind[:5]} {u or 'flag':9s} {i}: {disp(i)[:120]}" + (f"  gaps={r['gaps'].get(i)}" if r['gaps'].get(i) else ""))
    if nr: print(f"  (+{len(nr)} routine: {nr})")
    for k in ("dark", "withheld", "targets", "caveats", "gaps"):
        if r[k]: print(f"  {k}:", r[k])
    return r
