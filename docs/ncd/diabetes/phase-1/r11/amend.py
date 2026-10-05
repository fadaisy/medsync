from h import *
import json
for a in REG["complication_amendments"]:
    s = json.dumps(a, default=str)
    if "HCO3" in s or "HHS-GLU" in s or "33.3" in s:
        print(json.dumps({k: v for k, v in a.items() if k != "citations"}, default=str)[:2500]); print()
