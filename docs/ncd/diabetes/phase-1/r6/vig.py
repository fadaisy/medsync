from base import *
import build, k_vignettes
build.errors.clear() if hasattr(build.errors, "clear") else None
n0 = len(build.errors)
build.check_vignettes()
errs = build.errors[n0:]
print("vignette errors:", len(errs)); [print("  ", e) for e in errs[:30]]
IDS = ["DMV-36","DMV-86","DMV-88","DMV-92","DMV-95","DMV-96","DMV-97"] + [f"DMV-{i}" for i in range(101,114)]
for v in k_vignettes.VIGNETTES:
    if v["id"] in IDS:
        print(f"\n### {v['id']} {v.get('title')} band={v['ageBand']} est={v['established']} site={v['site']}")
        print("   values:", v["values"]); print("   expect:", v["expect"])
        c(v["values"], site=v["site"], est=v["established"], band=v["ageBand"], label=v["id"])
