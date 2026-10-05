from r5lib import c, disp, IDX
T1 = {"dm_status":"known","dm_type_recorded":"type_1","glucose_lowering_therapy":["insulin"]}
T2 = {"dm_status":"known","dm_type_recorded":"type_2"}
M = lambda **k: {"sex":"male", **k}; F = lambda **k: {"sex":"female", **k}
c(M(age_years=80, **T2, glucose_lowering_therapy=["gliclazide"], frailty_or_limited_life_expectancy=True, recent_transfusion=True, hba1c=6.4, fasting_pg=14.0), band="older_adult", label="B01 80 frail gliclazide, recent transfusion, HbA1c 6.4 (invalid), FPG 14")
c(M(age_years=80, **T2, glucose_lowering_therapy=["gliclazide"], frailty_or_limited_life_expectancy=True, egfr=22, hba1c=6.4, capillary_glucose=16.0), band="older_adult", label="B01b eGFR22 HbA1c6.4 meter 16")
c(M(age_years=9, **T1, dehydration=True, capillary_glucose=7.0, bohb=0.2), band="child", label="B02 child T1 diarrhoea dehydrated, glucose 7, bohb 0.2")
c(F(age_years=30, pregnant=True, gestation_weeks=28, bp_systolic=142, bp_diastolic=92, urine_protein_strip="neg"), est=False, label="B03 pregnant 142/92 protein neg")
c(M(age_years=40, **T1, vomiting=True), label="B04 adult T1 vomiting, nothing measured")
c(M(age_years=40, **T2, glucose_lowering_therapy=["metformin"], vomiting=True, capillary_glucose=12, urine_ketones="neg"), label="B05 T2 vomiting glucose 12 ketones neg")
c(M(age_years=40, **T2, glucose_lowering_therapy=["metformin"], capillary_glucose=19, urine_ketones="neg", care_setting="inpatient", on_glucocorticoid=True), label="B06 inpatient steroid 19 neg")
c(F(age_years=26, pregnant=True, gestation_weeks=20, capillary_glucose=19, urine_ketones="neg"), est=False, label="B07 pregnant meter 19 ketones neg")
c(M(age_years=60, mental_status="coma", deep_rapid_breathing=True), est=False, label="B08 unknown adult coma + Kussmaul")
c(M(age_years=45, dm_status="not_known", capillary_glucose=6.5, capillary_glucose_context="fasting", prior_intermediate_hyperglycaemia=True), est=False, site="district", label="B09 district fcap 6.5 prior IH")
c(M(age_years=35, **T2, glucose_lowering_therapy=["metformin"], capillary_glucose=8, acetone_breath=True), label="B10 T2 metformin acetone breath only, glu 8 (fasting/keto diet?)")
c(M(age_years=14, dm_status="not_known", capillary_glucose=19, urine_ketones="neg"), est=False, band="adolescent", label="B11 14y new glucose 19 ketones neg")
c(M(age_years=58, **T2, glucose_lowering_therapy=["metformin"], hba1c=6.8, urine_ketones="1plus", capillary_glucose=6.0, sglt2_inhibitor=None) if False else M(age_years=58, **T2, glucose_lowering_therapy=["insulin"], capillary_glucose=3.8, mental_status="drowsy"), label="B12 insulin 3.8 drowsy")
print("\nROUTE-04 when.label:", IDX["DM-ACU-ROUTE-04"][1]["when"]["label"])
