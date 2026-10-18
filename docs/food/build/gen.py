import csv, json, re, sys
from spec import F, COMBOS, GI

OUT, DL = sys.argv[1], sys.argv[2]
SR = f"{DL}/sr/FoodData_Central_sr_legacy_food_csv_2018-04/"

ke = {r["code"]: r for r in csv.DictReader(open(f"{OUT}/kenya.csv"))}
wa = {r["code"]: r for r in csv.DictReader(open(f"{OUT}/wafct.csv"))}
us = {r["fdc_id"]: r for r in csv.DictReader(open(f"{OUT}/usda.csv"))}
portions = {r["id"]: r for r in csv.DictReader(open(SR + "food_portion.csv"))}

def num(v, required=False):
    v = (v or "").strip().strip("[]")
    if v == "tr": return 0
    if v in ("", "-"):
        assert not required, "missing required value"
        return None
    return float(v)

def r1(x): return None if x is None else round(x, 1)

# Table A1 items: number -> (description, page, GI)
a1 = {}
lines = open(f"{OUT}/gi1.txt").read().split("\n")
page = 0
for i, l in enumerate(lines):
    m = re.match(r"=====PAGE (\d+)=====", l)
    if m: page = int(m.group(1)); continue
    m = re.match(r"^(\d+) (.*?) (\d+)(?:±\d+)? (\d+)(?:±\d+)? Normal", l)
    if m and m.group(1) not in a1:
        nxt = lines[i + 1].strip()
        desc = m.group(2)
        if nxt and not re.match(r"^\d+ |^=====|^mean of", nxt) and len(nxt) < 70 and not nxt[0].isupper() or re.match(r"^\(", nxt):
            desc += " " + nxt
        a1[m.group(1)] = (re.sub(r"(\d+(, \d+)?)$", "", desc).strip(), page, int(m.group(3)))

def gi_ref(key):
    kind, value, label = GI[key]
    if kind == "A1":
        desc, pg, gi = a1[label]
        assert gi == value, (key, gi, value)
        return value, {"source": "GI-2008", "item": f"Table A1 #{label}: {desc}", "where": f"online appendix, p. {pg}"}
    if kind == "T1":
        return value, {"source": "GI-2008", "item": label, "where": "Table 1"}
    return value, {"source": "KE-GI-2021", "item": label, "where": "Table 1"}

def comp(ref):
    src, code = ref.split(":")
    if src == "KE":
        r = ke[code]
        per = dict(kcal=num(r["kcal"], True), carbsG=num(r["carb"], True), proteinG=num(r["protein"]),
                   fatG=num(r["fat"]), fibreG=num(r["fibre"]))
        return per, {"source": "KE-FCT-2018", "item": f"{code} {r['name']}", "where": f"PDF p. {r['page']}"}
    if src == "WA":
        r = wa[code]
        per = dict(kcal=num(r["kcal"], True), carbsG=num(r["carb"], True), proteinG=num(r["protein"]),
                   fatG=num(r["fat"]), fibreG=num(r["fibre"]))
        return per, {"source": "WAFCT-2019", "item": f"{code} {r['name']}", "where": "sheet 03 NV_sum_39"}
    r = us[code]
    fib = num(r["fibre"]) or 0
    per = dict(kcal=num(r["kcal"], True), carbsG=r1(num(r["carbdiff"], True) - fib), proteinG=num(r["protein"]),
               fatG=num(r["fat"]), fibreG=num(r["fibre"]))
    return per, {"source": "USDA-SR-LEGACY", "item": f"FDC {code} (NDB {r['ndb']}) {r['name']}",
                 "where": "available carbohydrate = carbohydrate by difference − total dietary fibre"}

def portion(p):
    out = {"label": p[0], "grams": p[1]}
    if len(p) == 3:
        pid = p[2].split(":")[1]
        r = portions[pid]
        assert float(r["gram_weight"]) == p[1], (p, r["gram_weight"])
        out["source"] = {"source": "USDA-SR-LEGACY",
                         "item": f"food_portion {pid}: {r['amount']} {r['modifier']} = {r['gram_weight']} g (FDC {r['fdc_id']})"}
    return out

def cat(gi):
    if gi is None: return "unknown"
    return "low" if gi <= 55 else "medium" if gi < 70 else "high"

foods, ids = [], set()
for f in F:
    assert f["id"] not in ids, f["id"]; ids.add(f["id"])
    per, src = comp(f["comp"])
    sources = [src]
    gi = None
    if f["gi"]:
        gi, gsrc = gi_ref(f["gi"])
        sources.append(gsrc)
    for p in f["portions"]:
        assert 0 < p[1] <= 1500, p
    food = {"id": f["id"], "name": f["name"], "localNames": f["local"], "group": f["group"],
            "portions": [portion(p) for p in f["portions"]], "per100g": per,
            "gi": gi, "giCategory": cat(gi), "sources": sources}
    if f["note"]: food["note"] = f["note"]
    foods.append(food)

combos = []
for c in COMBOS:
    for pid, _ in c["parts"]: assert pid in ids, pid
    combos.append({"id": c["id"], "name": c["name"], "localNames": c["local"], "group": c["group"],
                   "description": c["description"], "parts": [{"foodId": p, "grams": g} for p, g in c["parts"]]})

def ts(v): return json.dumps(v, ensure_ascii=False, indent=2)
print(f"""/**
 * The built-in Ugandan food list (ADR 0353). Generated from published tables:
 * every per-100 g value and GI below names its source row in `sources`.
 * A food with no published GI has `gi: null` ("unknown"); never fill one in.
 * A portion without `source` is a MedSync household estimate, not a table value.
 * Signed off by the owner as clinical reference data, 18 Oct 2026.
 */
import type {{ Combo, Food }} from "./types";

export const FOODS: Food[] = {ts(foods)};

/** Dishes logged as their parts, so every number still comes from a sourced food. */
export const COMBOS: Combo[] = {ts(combos)};
""")
print(f"{len(foods)} foods, {sum(1 for f in foods if f['gi'] is not None)} with GI, {len(combos)} combos", file=sys.stderr)
