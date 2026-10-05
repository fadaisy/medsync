from base import *
import build, k_vignettes, k_grid
n0=len(build.errors); build.check_vignettes(); print("vignette errors", build.errors[n0:])
n0=len(build.errors); print(k_grid.check(build.run_vignette, build.E)); print(build.errors[n0:][:5])
for v in k_vignettes.VIGNETTES:
    if v["id"] in ["DMV-92","DMV-100","DMV-111"]+[f"DMV-{i}" for i in range(114,122)]:
        r = c(v["values"], site=v["site"], est=v["established"], band=v["ageBand"], label=v["id"]+" "+v["title"])
