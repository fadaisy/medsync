"""USDA FoodData Central SR Legacy (April 2018, public domain) -> mobile/src/data/food/usda.json.

Every food with energy and carbohydrate, its category mapped to the app's groups, available
carbohydrate as carbohydrate by difference minus total dietary fibre, and up to three household
portions from food_portion. Usage: python3 usda_catalog.py <sr_legacy_csv_dir> <out.json>
"""
import csv, json, os, sys

src, out = sys.argv[1], sys.argv[2]
GROUP = {  # food_category id -> app group; the rest are left out
    "1": "drinks", "2": "basics", "4": "basics", "5": "meat-fish-eggs", "6": "basics",
    "7": "meat-fish-eggs", "8": "staples", "9": "fruits", "10": "meat-fish-eggs",
    "11": "greens-vegetables", "12": "legumes", "13": "meat-fish-eggs", "14": "drinks",
    "15": "meat-fish-eggs", "16": "legumes", "17": "meat-fish-eggs", "18": "staples",
    "19": "snacks", "20": "staples", "21": "snacks", "22": "staples", "23": "snacks",
    "25": "snacks", "28": "drinks",
}  # left out: 3 baby foods, 24 regional (US native) foods, 26 branded, 27 quality-control materials
NUT = {"1008": "kcal", "1003": "protein", "1004": "fat", "1005": "carbdiff", "1079": "fibre"}

foods = {r["fdc_id"]: r for r in csv.DictReader(open(os.path.join(src, "food.csv")))}
vals = {}
for r in csv.DictReader(open(os.path.join(src, "food_nutrient.csv"))):
    k = NUT.get(r["nutrient_id"])
    if k: vals.setdefault(r["fdc_id"], {})[k] = float(r["amount"])
portions = {}
for r in csv.DictReader(open(os.path.join(src, "food_portion.csv"))):
    portions.setdefault(r["fdc_id"], []).append(r)

def amount(a):
    x = float(a)
    return str(int(x)) if x == int(x) else ("%g" % x)

rows = []
for fid, f in foods.items():
    g = GROUP.get(f["food_category_id"])
    v = vals.get(fid, {})
    if not g or "kcal" not in v or "carbdiff" not in v: continue
    fib = v.get("fibre")
    carbs = round(max(0.0, v["carbdiff"] - (fib or 0)), 1)
    ps = []
    for p in sorted(portions.get(fid, []), key=lambda p: int(p["seq_num"] or 0)):
        label = f"{amount(p['amount'])} {p['modifier']}".strip() if p["modifier"] else p["portion_description"]
        w = float(p["gram_weight"])
        if label and w > 0 and all(x[0] != label for x in ps): ps.append([label, round(w, 1)])
        if len(ps) == 3: break
    r1 = lambda x: None if x is None else round(x, 1)
    rows.append([int(fid), f["description"], g, round(v["kcal"]), carbs, r1(v.get("protein")), r1(v.get("fat")), r1(fib), ps])

rows.sort(key=lambda r: r[1].lower())
json.dump({"source": "USDA FoodData Central SR Legacy, April 2018 (public domain)",
           "fields": ["fdc", "name", "group", "kcal", "carbsG", "proteinG", "fatG", "fibreG", "portions"],
           "foods": rows}, open(out, "w"), separators=(",", ":"), ensure_ascii=False)
print(len(rows), "foods", os.path.getsize(out), "bytes", file=sys.stderr)
