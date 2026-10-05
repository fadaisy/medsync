from r4lib import run
run({"sex":"female","age_years":50,"polydipsia":True,"capillary_glucose":16,"capillary_glucose_context":"random","egfr":20,"bp_systolic":230,"bp_diastolic":130,"hypertensive_symptoms":True}, est=False, label="P31 woman 50 new dx, pregnancy blank, eGFR 20, BP 230/130")
run({"sex":"female","age_years":50,"pregnancy_possible":False,"polydipsia":True,"capillary_glucose":16,"capillary_glucose_context":"random","egfr":20,"bp_systolic":230,"bp_diastolic":130,"hypertensive_symptoms":True}, est=False, label="P31b same, pregnancy not possible")
