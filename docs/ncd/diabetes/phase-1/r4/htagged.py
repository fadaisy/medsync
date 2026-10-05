import r4lib, json
from k_model import REG
for kind in ("rules","management","therapyFlags","targets","validityCaveats","interpretation","diagnosis","diagnosis_pending","classifications","complications"):
    for it in REG[kind]:
        rv = [x for x in it.get("x",{}).get("review",[]) if x.startswith("H")]
        if not rv: continue
        x = it["x"]
        print(f"[{kind}] {it.get('id', it.get('code'))} {rv} urg={it.get('urgency') or x.get('urgency')} run={x.get('runWhen')} ages={it.get('ageBands') or x.get('ages')} en={x.get('enabled')} preg={(x.get('appliesTo') or {}).get('pregnancy')}")
        print("   D:", it.get("display") or it.get("label"))
        w = it.get("when")
        if isinstance(w, dict) and "label" in w: print("   W:", w.get("label"))
        for k in x.get("notWhen", []): print("   NOT:", k.get("label"))
