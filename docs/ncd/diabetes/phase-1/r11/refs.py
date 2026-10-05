from h import *
import json, k_clerk
from lib import REFS
def walk(o, path, out):
    if isinstance(o, dict):
        if o.get("_ref") in ("REF-DM-ACU-DKA-HCO3","REF-DM-ACU-HHS-GLU","REF-DM-CVD-LDL-ASCVD","REF-DM-ACT-EDU-WEIGHT"):
            out.append((path, o["_ref"], o.get("value"), o.get("feature"), o.get("op")))
        for k, v in o.items(): walk(v, path + "/" + str(o.get("id", k)) if k in ("x","when") or isinstance(v,(dict,list)) else path, out)
    elif isinstance(o, list):
        for i, v in enumerate(o): walk(v, path, out)
out = []
for k, lst in REG.items(): walk(lst, k, out)
for x in sorted(set(out)): print(x)
for r in ("REF-DM-ACU-DKA-HCO3","REF-DM-ACU-HHS-GLU","REF-DM-CVD-LDL-ASCVD","REF-DM-ACT-EDU-WEIGHT"): print(r, REFS[r]["value"], REFS[r]["label"] if "label" in REFS[r] else REFS[r].get("display"))
print("clerk", {k: v for k, v in k_clerk.DX_REFS.items() if k in ("REF-DX-GLU-HHS","REF-DX-BICARB-DKA")})
blob = json.dumps(REG, default=str)
import re
for m in set(re.findall(r'[^"]{0,80}33\.3[^"]{0,60}', blob)): print("33.3>>", m)
for m in set(re.findall(r'[^"]{0,80}(?:bicarbonate|HCO3)[^"]{0,80}', blob)): print("HCO3>>", m)
for m in set(re.findall(r'[^"]{0,60}LDL[^"]{0,60}', blob)): print("LDL>>", m)
for m in set(re.findall(r'[^"]{0,60}(?:5%|5 %|five per)[^"]{0,60}', blob)): print("5%>>", m)
