from r4lib import run
M = {"sex":"male"}; F = {"sex":"female"}
KT2 = {"dm_status":"known","dm_type_recorded":"type_2"}
run({**M,"age_years":56,**KT2,"glucose_lowering_therapy":["metformin"],"hba1c":6.9,"bp_systolic":128,"bp_diastolic":78}, label="P09 ordinary T2 routine, sparse record")
run({**M,"age_years":50,"polydipsia":True,"capillary_glucose":16,"capillary_glucose_context":"random"}, est=False, site="district", label="P10 new 50y glucose 16 thirst district")
run({**M,"age_years":50,"polydipsia":True,"capillary_glucose":16,"capillary_glucose_context":"random","urine_ketones":"neg"}, est=False, site="district", label="P10b same after ketones neg")
run({**M,"age_years":17,"capillary_glucose":15,"polydipsia":True}, est=False, band="adolescent", label="P11 17y (pack band adolescent)")
run({**M,"age_years":17,"capillary_glucose":15,"polydipsia":True}, est=False, band="adult", label="P11b 17y banded adult")
run({**M,"age_years":40,**KT2,"glucose_lowering_therapy":["metformin"],"hiv_on_art":True,"art_regimen":"tdf_3tc_dtg","hba1c":7.8,"egfr":70}, label="P12 dolutegravir + metformin")
run({**M,"age_years":62,**KT2,"glucose_lowering_therapy":["metformin","glibenclamide"],"egfr":35}, band="older_adult", label="P13 eGFR 35 glib+met")
run({**M,"age_years":50,**KT2,"glucose_lowering_therapy":["metformin"],"bp_systolic":230,"bp_diastolic":130,"hypertensive_symptoms":True,"chest_pain_or_stroke_symptoms":False}, label="P14 hypertensive emergency confusion")
run({**M,"age_years":70,**KT2,"glucose_lowering_therapy":["metformin"],"capillary_glucose":30,"mental_status":"drowsy","dehydration":True}, site="district", label="P15 HHS district 30 drowsy no strip result")
run({**M,"age_years":40}, est=False, label="P16 blank except age/sex")
run({"age_years":40}, est=False, label="P16b blank except age (sex blank)")
