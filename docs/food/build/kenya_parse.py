import re, sys, csv
lines = open(sys.argv[1]).read().split("\n")
TOK = r"(?:\[?[\d.]+\]?|tr|-)"
NUMS = re.compile(rf"^((?:{TOK} ){{7,8}}{TOK})$")
TAIL = re.compile(rf"^(\d{{5}}) ?(.*?) ?((?:{TOK} ){{7,8}}{TOK})$")
def cont(s):
    return s and not re.match(r"^(n |SD|\d{5}|=====|\d+$|[\d.\-\[\] ]+$)", s)
seen, page, prox = {}, 0, False
out = csv.writer(sys.stdout)
out.writerow(["code","name","page","edible","kj","kcal","water","protein","fat","carb","fibre","ash"])
for i, l in enumerate(lines):
    m = re.match(r"=====PAGE (\d+)=====", l)
    if m:
        page = int(m.group(1)); prox = any("(kJ)" in x for x in lines[i:i+8]); continue
    if not prox: continue
    mc = re.match(r"^(\d{5})\b ?(.*)$", l)
    if not mc: continue
    code = mc.group(1)
    if code in seen: continue
    m = TAIL.match(l)
    if m:
        name, nums = m.group(2).strip(), m.group(3).split()
        if not name:
            name = " ".join(x for x in (lines[i-1].strip(), lines[i+1].strip() if cont(lines[i+1].strip()) else "") if x)
    elif NUMS.match(lines[i+1].strip()):
        nums = lines[i+1].split()
        nxt = lines[i+2].strip()
        name = (mc.group(2).strip() + (" " + nxt if cont(nxt) else "")).strip()
    else:
        continue
    if len(nums) == 8: nums = [""] + nums
    try:
        kj, kcal = float(nums[1].strip("[]")), float(nums[2].strip("[]"))
    except ValueError: continue
    if not (kcal == kj == 0 or 4.0 <= kj / max(kcal, 0.1) <= 4.35): continue
    seen[code] = 1
    out.writerow([code, name, page] + nums)
