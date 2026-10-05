import sys, json
IDS = sys.argv[1:]
from h import *
def compact(c):
    if not isinstance(c, dict): return c
    out = {}
    for k in ("id","label","all","any","atLeast"):
        if k in c and c[k]:
            if k in ("all","any"): out[k] = [f'{p["feature"]} {p["op"]} {p.get("value","")}' for p in c[k]]
            elif k == "atLeast": out[k] = (c[k]["n"], [f'{p["feature"]} {p["op"]} {p.get("value","")}' for p in c[k]["of"]])
            else: out[k] = c[k]
    return out
for i in IDS:
    it = R.get(i) or M.get(i) or F.get(i) or next((t for k in ("targets","interpretation","validityCaveats","diagnosis","diagnosis_pending") for t in REG[k] if t.get("id")==i), None)
    print("=====", i)
    if not it: print("NOT FOUND"); continue
    d = {k: v for k, v in it.items() if k not in ("citation","x","when","anyOf")}
    print(json.dumps(d, default=str))
    if "when" in it: print("WHEN", compact(it["when"]))
    if "anyOf" in it:
        for c in it["anyOf"]: print(" ANY", compact(c))
    x = it.get("x", {})
    print("X", json.dumps({k: v for k, v in x.items() if k not in ("notWhen",)}, default=str)[:1500])
    for k in x.get("notWhen", []): print(" NOTWHEN", compact(k))
