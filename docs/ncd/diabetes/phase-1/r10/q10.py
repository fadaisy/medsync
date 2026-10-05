import pickle, collections
res = pickle.load(open("/Users/airm1/Desktop/medsync-ncd/docs/ncd/diabetes/phase-1/r10/grid10.pkl", "rb"))
DM = lambda p: p != "noinfo"
INS = {"T2_ins", "T1_ins"}
CHILD = {"child", "adolescent"}
def check(name, pred, need):
    bad = [(k, v) for k, v in res.items() if pred(*k) and v[0] < need]
    c = collections.Counter((k[0], k[1], k[2], k[3]) for k, v in bad)
    print(f"\n== {name}: {len(bad)} cells below {need}")
    for key, n in list(c.most_common(25)): 
        ex = next((k, v) for k, v in bad if (k[0], k[1], k[2], k[3]) == key); print("  ", n, key, "e.g.", ex[0][4:], ex[1])
check("dm drowsy", lambda site, band, p, s, g, k: DM(p) and s == "drowsy", 3)
check("dm kussmaul", lambda site, band, p, s, g, k: DM(p) and s == "kussmaul", 3)
check("LO/<3", lambda site, band, p, s, g, k: g in ("LO", "2.5"), 3)
check("HI/30", lambda site, band, p, s, g, k: g in ("HI",), 3)
check("dm ket high", lambda site, band, p, s, g, k: DM(p) and k in ("u_2", "u_3", "b3.5"), 3)
check("3.5 ins/SU/unknown", lambda site, band, p, s, g, k: g == "3.5" and p in ("T2_SU", "T2_ins", "T1_ins", "known_only", "uncl_metf"), 3)
check("3.5 other dm", lambda site, band, p, s, g, k: g == "3.5" and DM(p), 2)
check("SGLT2 unwell", lambda site, band, p, s, g, k: p == "SGLT2" and s in ("vomit", "pain", "ill", "dehyd", "kussmaul", "drowsy", "vomit_acetone", "vomit_dehyd") and k != "b0.3", 3)
check("child dm vomit/pain", lambda site, band, p, s, g, k: band in CHILD and DM(p) and s in ("vomit", "pain"), 2)
check("child dm acetone/dehyd", lambda site, band, p, s, g, k: band in CHILD and DM(p) and s in ("acetone", "dehyd") and k != "b0.3", 3)
check("insulin vomit/pain adult any ket", lambda site, band, p, s, g, k: band not in CHILD and p in INS and s in ("vomit", "pain"), 2)
check("insulin ill adult", lambda site, band, p, s, g, k: band not in CHILD and p in INS and s == "ill", 2)
check("dm acetone/dehyd adult not b0.3", lambda site, band, p, s, g, k: band not in CHILD and DM(p) and s in ("acetone", "dehyd") and k != "b0.3", 2)
check("dm vomit glu>=20", lambda site, band, p, s, g, k: DM(p) and s == "vomit" and g in ("20", "30"), 2)
check("dm b1.8", lambda site, band, p, s, g, k: DM(p) and k == "b1.8", 2)
check("dm b0.8 unwell", lambda site, band, p, s, g, k: DM(p) and k == "b0.8" and s != "well", 2)
check("dm u_tr/u_1 unwell", lambda site, band, p, s, g, k: DM(p) and k in ("u_tr", "u_1") and s not in ("well",), 2)
check("insulin omitted", lambda site, band, p, s, g, k: s == "insulin_omit", 2)
check("nondm glu>=13 with sign", lambda site, band, p, s, g, k: p == "noinfo" and g in ("13", "20", "30") and s in ("kussmaul", "drowsy", "acetone", "dehyd", "vomit_acetone", "vomit_dehyd"), 3)
check("nondm child glu>11 vomit", lambda site, band, p, s, g, k: p == "noinfo" and band in CHILD and g in ("13", "20", "30") and s in ("vomit", "pain"), 3)
# noise: well, ordinary
c = collections.Counter()
for k, v in res.items():
    site, band, p, s, g, kk = k
    if s == "well" and g in ("none", "5", "9", "13") and kk in ("none", "u_neg", "b0.3") and v[0] >= 2: c[(p, band, g, tuple(v[1]))] += 1
print("\n== noise on well patients (glu<=13, ketones neg):", sum(c.values()))
for x, n in c.most_common(30): print("  ", n, x)
