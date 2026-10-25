import sys, csv, openpyxl
wb = openpyxl.load_workbook(sys.argv[1], read_only=True, data_only=True)
ws = wb["03 NV_sum_39 (per 100g EP)"]
w = csv.writer(sys.stdout)
w.writerow(["code","name","kj","kcal","water","protein","fat","carb","fibre","ash","source","row"])
for i, r in enumerate(ws.iter_rows(values_only=True), start=1):
    if r[0] and "_" in str(r[0]) and r[1]:
        w.writerow([r[0], r[1], r[6], r[7], r[8], r[9], r[10], r[11], r[12], r[13], r[4], i])
