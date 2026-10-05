"""r9 extension of k_grid: floors the r8 fixes promised but k_grid.floor does not encode."""
exec(open('/Users/airm1/Desktop/medsync-ncd/docs/ncd/diabetes/phase-1/r9/h.py').read())
import itertools, collections, k_grid
RANK={None:0,"routine":0,"urgent":1,"same_day":2,"immediate":3,"folded":3}
def top(r): return max([RANK.get(r["urgency"].get(k),0) for k in r["fired"]]+[0])
fails=collections.defaultdict(list)
STATES={"acetone":{"acetone_breath":True},"dehydrated":{"dehydration":True},"vomit":{"vomiting":True},"vomit+dehyd":{"vomiting":True,"dehydration":True}}
KET={"u_neg":{"urine_ketones":"neg"},"u_trace":{"urine_ketones":"trace"},"u_1+":{"urine_ketones":"1plus"},"b0.3":{"bohb":0.3},"b1.0":{"bohb":1.0},"b1.4":{"bohb":1.4}}
GLU={"5":{"capillary_glucose":5.0},"7":{"capillary_glucose":7.0},"14":{"capillary_glucose":14.0}}
n=0
for site,(band,age),(prof,(pv,est)),(st,sv),(g,gv),(k,kv) in itertools.product(("referral","district"),k_grid.BANDS.items(),[(p,v) for p,v in k_grid.PROFILES.items() if p!="noinfo"],STATES.items(),GLU.items(),KET.items()):
    if site=="district" and k.startswith("b"): continue      # no blood ketone meter at district
    r=build.run_vignette({"id":"G","site":site,"established":est,"ageBand":band,"values":{"sex":"male","age_years":age,**pv,**sv,**gv,**kv}}); n+=1
    t=top(r); cell=(site,band,prof,st,g,k)
    child=band in("child","adolescent"); ins=prof in("T1_ins","ins_nostatus","T1_nostatus")
    # A: acetone/dehydration in diabetes with ketones not measured-normal (urine strip any; blood 0.6-1.5) -> same day (r8 T04 fix text; pack caveat urine_ketones_low_despite_picture)
    if st in("acetone","dehydrated","vomit+dehyd") and k!="b0.3" and t<2: fails["A acetone/dehydration, ketones urine-only or 0.6-1.5, < same_day"].append(cell)
    # B: insulin-treated or type 1, vomiting, urine strip only (blood ketones not measured) -> same day (ROUTE-23/23D intent)
    if ins and st.startswith("vomit") and k.startswith("u_") and t<2: fails["B insulin/T1 vomiting, urine strip only, < same_day"].append(cell)
    # C: child with diabetes vomiting, glucose and ketones recorded -> same day (r8 T05 fix; ISPAD 2022 ch.13)
    if child and st.startswith("vomit") and t<2: fails["C child with diabetes vomiting, < same_day"].append(cell)
print("men cells",n)
# women
W=0
for (p,pv),(bp,bv),(sy,yv),(dm,dv) in itertools.product(k_grid.PREG.items(),{"165/112":{"bp_systolic":165,"bp_diastolic":112},"185/120":{"bp_systolic":185,"bp_diastolic":120}}.items(),{"headache":{"hypertensive_symptoms":True},"none":{}}.items(),{"nodm":({},False),"T2":({"dm_status":"known","dm_type_recorded":"type_2","glucose_lowering_therapy":["metformin"]},True)}.items()):
    r=build.run_vignette({"id":"G","site":"referral","established":dv[1],"ageBand":"adult","values":{"sex":"female","age_years":30,**pv,**bv,**yv,**dv[0]}}); W+=1
    if p in k_grid.POSSIBLE and sy=="headache" and top(r)<3: fails["D possible pregnancy/postpartum, severe-range BP with headache, < immediate (same woman at 145/95 interrupts via 27D)"].append((p,bp,sy,dm,sorted((k,r['urgency'][k]) for k in r['fired'] if 'ROUTE' in k)))
print("women cells",W)
import collections as C2
for k,v in fails.items():
    print(k, C2.Counter((c[0],c[1],c[2]) if len(c)==6 else c[0] for c in v))
for k,v in []:
    print(f"\n{k}: {len(v)}"); 
    for c in v[:8]: print("  ",c)
