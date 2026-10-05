import json, sys, collections
sys.path.insert(0, '/Users/airm1/Desktop/medsync-ncd/docs/ncd/diabetes/pack-0.3.0-draft/tools/build')
import build
live = json.load(open('/private/tmp/claude-501/ncd-p0/live-truth.json'))
S = ["met","not_met","insufficient","unavailable"]
vals = {}
for i in range(4):
    for s in S:
        c = f"f{i}_{s}"
        build.FEATURES[c] = {"code": c, "valueType": "boolean", **({"requires": "cap.missing"} if s == "unavailable" else {})}
        if s == "met": vals[c] = True
        if s == "not_met": vals[c] = False
site = ["cap.ok"]
P = lambda i, s: {"feature": f"f{i}_{s}", "op": "present"}
diff = collections.defaultdict(list); n = 0
for key, lv in live.items():
    kind, rest = key.split("|", 1)
    if kind == "probe": continue
    c = rest.split(",")
    ps = [P(i, s) for i, s in enumerate(c)]
    if kind == "all": crit = {"all": ps}
    elif kind == "any": crit = {"any": ps}
    elif kind == "mixed": crit = {"all": [ps[0]], "any": [ps[1]], "atLeast": {"n": 1, "of": [ps[2]]}}
    else: crit = {"atLeast": {"n": int(kind[7:]), "of": ps}}
    rv = build.ev_crit(crit, vals, site); n += 1
    if rv != lv: diff[kind].append((rest, "live=" + lv, "ref=" + rv))
print("compared", n)
for k, v in diff.items():
    print(k, len(v))
    for x in v: print("   ", x)
# probes on the reference side
build.FEATURES.update({"uk": {"valueType": "single_select"}, "n": {"valueType": "number", "unit": "u"}, "ms": {"valueType": "multi_select"},
                       "dur": {"valueType": "duration"}, "ser": {"valueType": "series"}, "lab": {"valueType": "number", "requires": "cap.missing"}})
def ref(p, v):
    try: return build.ev_pred(p, v, site)
    except Exception as e: return "ERROR " + type(e).__name__
R = {
 "neg_present": ref({"feature": "uk", "op": "present"}, {"uk": "neg"}),
 "zero_present": ref({"feature": "n", "op": "present"}, {"n": 0}),
 "emptylist_present": ref({"feature": "ms", "op": "present"}, {"ms": []}),
 "ms_ne_insulin_metformin": ref({"feature": "ms", "op": "!=", "value": "insulin"}, {"ms": ["metformin"]}),
 "ms_ne_insulin_unknown": ref({"feature": "ms", "op": "!=", "value": "insulin"}, {"ms": ["unknown"]}),
 "ms_ne_insulin_blank": ref({"feature": "ms", "op": "!=", "value": "insulin"}, {}),
 "ms_in_scalar": ref({"feature": "ms", "op": "in", "value": "insulin"}, {"ms": ["insulin"]}),
 "recorded_op": ref({"feature": "n", "op": "recorded"}, {"n": 5}),
 "unknown_feature": ref({"feature": "nope", "op": "present"}, {}),
 "explicit_unavailable": "n/a (no explicit-unavailable capture in build.py)",
 "lab_recorded_at_site_without_cap": ref({"feature": "lab", "op": ">=", "value": 1}, {"lab": 2}),
 "string_vs_number": ref({"feature": "n", "op": ">=", "value": 1}, {"n": "HI"}),
 "duration_120mo_ge_10y": ref({"feature": "dur", "op": ">=", "value": 10, "unit": "years"}, {"dur": {"value": 120, "unit": "months"}}),
 "series_latest": ref({"feature": "ser", "op": ">=", "value": 140}, {"ser": [{"value": 160, "at": "08:00"}, {"value": 130, "at": "09:00"}]}),
 "empty_criterion": build.ev_crit({}, {}, site),
}
print("\nprobe | live | ref")
for k, v in R.items(): print(f"{k} | {live['probe|'+k]} | {v}")
