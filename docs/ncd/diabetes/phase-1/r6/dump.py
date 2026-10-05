import sys, json; ARGS = sys.argv[1:]
from base import *
from lib import REFS
def pp(p):
    v = p.get("value")
    if "ref" in p: v = f"{REFS[p['ref']]['value']}[{p['ref'].replace('REF-DM-','')}]"
    return f"{p['feature']} {p['op']}" + ("" if v is None else f" {v}")
def pc(c):
    s = []
    if c.get("all"): s.append("ALL(" + "; ".join(pp(p) for p in c["all"]) + ")")
    if c.get("any"): s.append("ANY(" + "; ".join(pp(p) for p in c["any"]) + ")")
    if c.get("atLeast"): s.append(f"ATLEAST{c['atLeast']['n']}(" + "; ".join(pp(p) for p in c["atLeast"]["of"]) + ")")
    return " & ".join(s)
def d(it):
    print("==", it["id"], it.get("urgency") or it["x"].get("urgency"), "bands=", it.get("ageBands"), "ages=", it["x"].get("ages"), "run=", it["x"].get("runWhen"), "enabled=", it["x"].get("enabled"))
    print("  disp:", it.get("display"))
    print("  label:", it["when"].get("label"))
    print("  WHEN:", pc(it["when"]))
    for k in it["x"].get("notWhen", []): print("  NOT[", k["id"], "]:", pc(k), "|", k.get("label"))
    if it.get("notes"): print("  notes:", it["notes"][:400])
    if it["x"].get("proposal"): print("  prop:", it["x"]["proposal"])
if __name__ == "__main__":
    for a in ARGS:
        for it in REG["rules"] + REG["management"] + REG["targets"]:
            if it["id"] == a or (a.endswith("*") and it["id"].startswith(a[:-1])): d(it)
