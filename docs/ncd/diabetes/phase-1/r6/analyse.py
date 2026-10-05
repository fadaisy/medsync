import json, collections
G = {t: json.load(open(f"grid-{t}.json")) for t in ("r5", "r4")}
DM = lambda p: p != "noinfo"
ISUT1 = {"T2_SU","T1_ins","ins_nostatus","T1_nostatus","blanklist"}
HIGH = {"15","28","HI"}
def need(x):
    b,p,s,g,k = x["band"],x["prof"],x["state"],x["glu"],x["ket"]; ch = b != "adult"
    im = (g == "HI" or (k == "b3.5" and (DM(p) or g in HIGH)) or (k == "b2.0" and s == "vomit" and (DM(p) or g in HIGH))
          or (s == "kussmaul" and (DM(p) or g in HIGH or (ch and g == "none")))
          or (s == "drowsy" and (g == "3.5" or g in HIGH or (g == "none" and (DM(p) or ch))))
          or (g == "3.5" and p in ISUT1)
          or (p == "SGLT2" and s in ("vomit","kussmaul") and k != "b0.3")
          or (ch and DM(p) and s == "vomit" and g == "none"))
    if im: return "immediate"
    sd = ((s == "vomit" and g in HIGH and k in ("none","u_trace","u_1+","b1.0"))
          or (g == "3.5" and DM(p))
          or (DM(p) and s == "vomit" and k in ("u_trace","u_1+","b1.0"))
          or (k == "b2.0" and (DM(p) or g in HIGH))
          or (p in ("T1_ins","ins_nostatus","T1_nostatus") and s == "vomit" and k == "none")
          or (g in ("28",) and k == "none"))
    return "same_day" if sd else None
RANK = {None:0, "urgent":1, "same_day":2, "immediate":3}
def top(a): return max([RANK[u] for u in a.values()] + [0])
def key(x): return (x["band"],x["prof"],x["state"],x["glu"],x["ket"])
R4 = {key(x): x for x in G["r4"]}
silent, double, noisy = [], [], []
for x in G["r5"]:
    n = need(x); t = top(x["acute"]); old = R4[key(x)]
    if n and t < RANK[n]: silent.append((x, n, old))
    if sum(1 for u in x["acute"].values() if u == "immediate") >= 2: double.append((x, old))
    if x["state"] == "well" and x["glu"] in ("none","7","15") and x["ket"] in ("none","u_neg","u_trace","b0.3") and t >= 2: noisy.append((x, old))
fmt = lambda x: f'{x["band"]:10s} {x["prof"]:12s} {x["state"]:8s} glu={x["glu"]:4s} ket={x["ket"]:7s}'
sh = lambda a: " ".join(f'{k.replace("DM-ACU-ROUTE-","R").replace("DM-ACT-","").replace("DM-CON-","").replace("DM-SUS-","")}:{u[:3]}' for k,u in a.items()) or "-"
print(f"SILENT {len(silent)}  (new vs pre-K: {sum(1 for x,n,o in silent if top(o['acute'])>=RANK[n])})")
for x,n,o in silent: print("  ", fmt(x), "need", n[:3], "| now:", sh(x["acute"]), "| preK:", sh(o["acute"]))
pairs = collections.Counter(tuple(sorted(k for k,u in x["acute"].items() if u=="immediate")) for x,o in double)
newd = [x for x,o in double if sum(1 for u in o["acute"].values() if u=="immediate") < 2]
print(f"\nDOUBLE {len(double)} (new vs pre-K: {len(newd)})")
for p,c in pairs.most_common(): print("  ", c, p)
newpairs = collections.Counter(tuple(sorted(k for k,u in x["acute"].items() if u=="immediate")) for x in newd)
print(" new pairs:", newpairs.most_common())
print(f"\nNOISY {len(noisy)}")
for x,o in noisy: print("  ", fmt(x), "| now:", sh(x["acute"]), "| preK:", sh(o["acute"]))
