from pcx import *
import sys
ids = sys.argv[1:]
for r in REG["rules"]:
    if ids and not any(r["id"].endswith(i) or r["id"]==i for i in ids): continue
    if not ids and not r["id"].startswith("DM-ACU"): continue
    print(f"\n## {r['id']} [{r['urgency']}] ages={r.get('ageBands')} runWhen={r['x'].get('runWhen')} pUnk={r['x'].get('pregnancyUnknownCounts')} cap={r['x'].get('requiresCapability')} enabled={r['x'].get('enabled')}")
    print("  DISPLAY:", r.get("display"))
    print("  LABEL:", r["when"].get("label"))
    print("  WHEN:", pc(r["when"]))
    for k in r["x"].get("notWhen", []): print("  NOT:", k["id"], "|", k["label"], "|", pc(k))
