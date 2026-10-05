import sys
B = __import__("base_r4" if "r4" in sys.argv else "base")
cases = [
 ("L-C12 child T1 glucose 20 acetone breath only", dict(sex="male", age_years=8, dm_status="known", dm_type_recorded="type_1", glucose_lowering_therapy=["insulin"], capillary_glucose=20.0, acetone_breath=True), "child", True),
 ("L-C12b child no-DM glucose 20 acetone breath", dict(sex="male", age_years=8, capillary_glucose=20.0, acetone_breath=True), "child", False),
 ("L-A4 adult insulin vomiting+dehydrated glucose 7 no ketones", dict(sex="male", age_years=30, dm_status="known", dm_type_recorded="type_1", glucose_lowering_therapy=["insulin"], vomiting=True, dehydration=True, capillary_glucose=7.0), "adult", True),
 ("L-A5 adult insulin vomiting+drowsy glucose 7 no ketones", dict(sex="male", age_years=30, dm_status="known", dm_type_recorded="type_1", glucose_lowering_therapy=["insulin"], vomiting=True, mental_status="drowsy", capillary_glucose=7.0), "adult", True),
 ("L-A6 adult insulin vomiting glucose 7 no ketones", dict(sex="male", age_years=30, dm_status="known", dm_type_recorded="type_1", glucose_lowering_therapy=["insulin"], vomiting=True, capillary_glucose=7.0), "adult", True),
 ("L-S3 SGLT2 status blank drowsy no glucose", dict(sex="male", age_years=55, glucose_lowering_therapy=["sglt2_inhibitor"], mental_status="drowsy"), "adult", True),
 ("L-A1 new adult glu28 vomiting urine 1+", dict(sex="male", age_years=40, dm_status="not_known", vomiting=True, capillary_glucose=28.0, urine_ketones="1plus"), "adult", False),
 ("L-B4 3w postpartum 200/120 organ damage", dict(sex="female", age_years=29, pregnant=False, postpartum_weeks=3, bp_systolic=200, bp_diastolic=120, hypertensive_organ_damage=True), "adult", False),
 ("L-B5 34w 150/100 organ damage", dict(sex="female", age_years=29, pregnant=True, gestation_weeks=34, bp_systolic=150, bp_diastolic=100, hypertensive_organ_damage=True), "adult", False),
 ("L-B5x 34w 150/100 drowsy", dict(sex="female", age_years=29, pregnant=True, gestation_weeks=34, bp_systolic=150, bp_diastolic=100, mental_status="drowsy"), "adult", False),
]
for lab, v, band, est in cases:
    try:
        r = B.run(v, band=band, est=est, site="referral")
        print(lab, "->", {k: r["urgency"].get(k) for k in r["fired"] if r["urgency"].get(k) not in (None, "routine")}, "caveats", r["caveats"])
    except Exception as e: print(lab, "ERR", e)
