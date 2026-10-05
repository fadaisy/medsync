"""The pack as it stood before the fifth-review fixes: k_r5 and its vignettes stubbed out (baseline for attributing regressions)."""
import sys, os, io, contextlib, types
PK = "/Users/airm1/Desktop/medsync-ncd/docs/ncd/diabetes/pack-0.3.0-draft"
sys.path.insert(0, PK + "/tools/build"); sys.argv = ["x"]
sys.modules["k_r5"] = types.SimpleNamespace(SEMANTICS={})
sys.modules["k_r5_vignettes"] = types.ModuleType("k_r5_vignettes")
_cwd = os.getcwd(); os.chdir(PK)
with contextlib.redirect_stdout(io.StringIO()):
    import build; build.annotate()
os.chdir(_cwd)
def run(values, band="adult", est=True, site="district"):
    return build.run_vignette({"id": "X", "site": site, "established": est, "ageBand": band, "values": values})
