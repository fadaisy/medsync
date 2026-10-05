import r5lib, build, k_vignettes
from r5lib import disp
ids = ["DMV-40","DMV-41","DMV-63","DMV-71","DMV-73","DMV-82"] + [f"DMV-{i}" for i in range(84,101)]
for v in k_vignettes.VIGNETTES:
    if v["id"] not in ids: continue
    r = build.run_vignette(v)
    print(f"\n{v['id']} [{v['site']},est={v['established']},{v['ageBand']}] {v.get('title') or v.get('name') or ''}")
    print("  values:", v["values"])
    print("  expect:", v["expect"])
    print("  fired:", {k: r['urgency'].get(k, kind) for k, kind in r['fired'].items() if not (kind=='step' and r['urgency'].get(k)=='routine')}, "| routine steps:", [k for k,kind in r['fired'].items() if kind=='step' and r['urgency'].get(k)=='routine'])
    print("  dark:", r["dark"], "withheld:", r["withheld"], "gaps:", r["gaps"], "targets:", r["targets"], "bands:", r["bands"])
