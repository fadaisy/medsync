import sys, csv, os
d = sys.argv[1]
want = {"1008":"kcal","1003":"protein","1004":"fat","1005":"carbdiff","1079":"fibre"}
foods = {r["fdc_id"]: r["description"] for r in csv.DictReader(open(os.path.join(d,"food.csv")))}
ndb = {r["fdc_id"]: r["NDB_number"] for r in csv.DictReader(open(os.path.join(d,"sr_legacy_food.csv")))}
vals = {}
for r in csv.DictReader(open(os.path.join(d,"food_nutrient.csv"))):
    k = want.get(r["nutrient_id"])
    if k: vals.setdefault(r["fdc_id"], {})[k] = r["amount"]
w = csv.writer(sys.stdout)
w.writerow(["fdc_id","ndb","name","kcal","protein","fat","carbdiff","fibre"])
for f, name in foods.items():
    v = vals.get(f, {})
    w.writerow([f, ndb.get(f,""), name] + [v.get(k,"") for k in ["kcal","protein","fat","carbdiff","fibre"]])
