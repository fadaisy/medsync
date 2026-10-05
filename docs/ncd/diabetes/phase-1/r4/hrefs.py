import r4lib, re
from k_model import REG
from lib import REFS, preds_of
def crits(it):
    out = [it.get("when")] + it.get("contraindications", []) + it["x"].get("notWhen", []) + it["x"].get("cautions", [])
    return [c for c in out if isinstance(c, dict)]
for kind in ("rules","management","therapyFlags","targets"):
    for it in REG[kind]:
        rv = [x for x in it.get("x",{}).get("review",[]) if x.startswith("H")]
        if not rv: continue
        vals = set()
        for c in crits(it):
            for p in preds_of(c):
                r = p.get("ref") or (p.get("value") if isinstance(p.get("value"), dict) else None)
                v = p.get("value")
                if isinstance(v, dict) and "ref" in v: r = v["ref"]
                if r and r in REFS: vals.add((p["feature"], p["op"], r, REFS[r]["value"], REFS[r].get("unit")))
                elif isinstance(v,(int,float)) and not isinstance(v,bool): vals.add((p["feature"], p["op"], None, v, None))
        txt = " | ".join(filter(None, [it.get("display"), (it.get("when") or {}).get("label")] + [c.get("label") for c in it["x"].get("notWhen", [])]))
        nums = sorted(set(re.findall(r"\d+(?:\.\d+)?", txt)))
        print(it.get("id", it.get("code")), "NUMS:", nums)
        for v in sorted(vals, key=str): print("    ", v)
