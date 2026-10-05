from h import *
import itertools, collections, k_grid
cnt = collections.Counter(); ex = {}
for site, (band, age), (prof, (pv, est)), (state, sv), (glu, gv), (ket, kv) in itertools.product(k_grid.SITES, k_grid.BANDS.items(), k_grid.PROFILES.items(), k_grid.STATES.items(), k_grid.GLUCOSE.items(), k_grid.KETONES.items()):
    if prof == "noinfo" or state not in ("acetone", "dehydrated"): continue
    r = build.run_vignette({"id": "G", "site": site, "established": est, "ageBand": band, "values": {"sex": "male", "age_years": age, **pv, **sv, **gv, **kv}})
    urg = {r["urgency"].get(k) for k in r["fired"]}
    top = "immediate" if (urg & {"immediate", "folded"}) else "same_day" if "same_day" in urg else None
    if top is None:
        key = (state, glu if glu in ("none",) else "glu recorded", "child" if band in ("child","adolescent") else "adult", ket if ket in ("b0.3","none") else "other ket")
        cnt[key] += 1; ex.setdefault(key, (site, band, prof, state, glu, ket))
for k, v in sorted(cnt.items()): print(v, k, "eg", ex[k])
