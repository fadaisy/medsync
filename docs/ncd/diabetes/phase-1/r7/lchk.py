from base import *
T2m = dict(dm_status="known", dm_type_recorded="type_2", glucose_lowering_therapy=["metformin"])
for tier in ["general","tight","relaxed","avoid_symptoms",None]:
    for age,band in [(72,"older_adult"),(50,"adult")]:
        v = M(age_years=age, **T2m, hba1c=7.3)
        if tier: v["glycaemic_target_tier"]=tier
        r = run(v, band=band, site="referral")
        print("L09", tier, age, r["targets"], r["withheld"])
c(M(age_years=10, **T1, capillary_glucose=25.0, urine_ketones="neg"), band="child", label="A15 10y T1 glu25 ketones neg well")
c(M(age_years=10, **T1, capillary_glucose=25.0), band="child", label="A15b 10y T1 glu25 no ketones well")
c(M(age_years=10, **T1, capillary_glucose=25.0, urine_ketones="neg"), band="child", site="district", label="A15c district")
c(M(age_years=40, dm_status="not_known", vomiting=True, capillary_glucose=28.0, urine_ketones="1plus"), est=False, site="district", label="L-A1 dist")
c(M(age_years=40, dm_status="not_known", vomiting=True, capillary_glucose=15.0, urine_ketones="trace"), est=False, site="district", label="L-A1b dist 15 trace")
c(M(age_years=40, vomiting=True, capillary_glucose=15.0, bohb=1.0), est=False, site="referral", label="L-A1c ref 15 b1.0")
c(M(age_years=60, **T2, glucose_lowering_therapy=["metformin","sglt2_inhibitor"], mental_status="drowsy", capillary_glucose=8.0), label="L-S1")
c(M(age_years=8, **T1, vomiting=True, capillary_glucose=7.0, urine_ketones="neg"), band="child", site="district", label="L-C4 at district")
