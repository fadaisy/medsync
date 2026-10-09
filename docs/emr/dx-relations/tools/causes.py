"""R1: clinically standard causal links. effect <- cause.

label: secondary   = the cause produces a distinct condition (severe anaemia secondary to malaria)
       precipitated_by = the cause triggers an episode of a known or new condition (DKA precipitated by pneumonia)
       complication = already in the signed complication list; repeated here only where the effect has other causes too
The desk only OFFERS these when the cause is already on the board (or on the problem list) and suggest_when is met.
It never creates a link by itself.
"""

def c(id, label, when, src="TEXTBOOK"):
    return dict(id=id, label=label, suggest_when=when, source=src)

INFX = "the infection is on the board (leading, also this visit or background) at this visit"

EFFECTS = {
    "dx.anaemia": [
        c("dx.malaria_uncomplicated", "secondary", "Malaria confirmed at this visit and haemoglobin below the WHO cutoff; most suggestive with haemolysis signs or a fall from a known baseline.", "WHO-SM-2014"),
        c("dx.malaria_severe", "secondary", "Severe malaria on the board; severe malarial anaemia is itself a WHO severe criterion (Hb <7 g/dl in adults, <5 g/dl in children <12 years, with parasite count >10 000/µl).", "WHO-SM-2014"),
        c("dx.hookworm_helminth", "secondary", "Helminth infection recorded (stool microscopy) with microcytic indices or low ferritin."),
        c("dx.schistosomiasis", "secondary", "Schistosomiasis recorded with haematuria, gastrointestinal blood loss or splenomegaly."),
        c("dx.hiv", "secondary", "HIV on the board or problem list with anaemia and no other cause yet found (restricted class: the link is visible only with HIV access)."),
        c("dx.hiv_advanced", "secondary", "Advanced HIV disease with anaemia (restricted class)."),
        c("dx.sickle_cell_disease", "secondary", "Known sickle cell disease (haemolysis is the usual mechanism)."),
        c("dx.sickle_cell_crisis", "secondary", "Sickle cell crisis at this visit with a fall in haemoglobin from baseline (sequestration, aplastic or haemolytic crisis)."),
        c("dx.peptic_ulcer", "secondary", "Upper gastrointestinal bleeding or melaena with peptic ulcer on the board."),
        c("dx.variceal_bleed", "secondary", "Variceal bleeding on the board."),
        c("dx.gi_bleed_unexplained", "secondary", "Gastrointestinal bleeding on the board, source not yet known."),
        c("dx.colorectal_cancer", "secondary", "Colorectal cancer on the board with iron-deficiency indices."),
        c("dx.ckd", "secondary", "CKD G3b or worse (eGFR below 45) with normocytic anaemia and no other cause found.", "KDIGO-CKD-2024"),
        c("dx.visceral_leishmaniasis", "secondary", "Visceral leishmaniasis recorded (pancytopenia with splenomegaly)."),
        c("dx.leukaemia", "secondary", "Leukaemia on the board (marrow failure)."),
        c("dx.tb_pulmonary_confirmed", "secondary", "TB on the board with normocytic anaemia (anaemia of inflammation); restricted class."),
    ],
    "dx.anaemia_unexplained": "same_as:dx.anaemia",
    "dx.iron_deficiency_anaemia": [
        c("dx.hookworm_helminth", "secondary", "Helminth infection recorded."),
        c("dx.peptic_ulcer", "secondary", "Peptic ulcer with bleeding history or melaena."),
        c("dx.colorectal_cancer", "secondary", "Colorectal cancer on the board, or occult blood positive with change in bowel habit."),
        c("dx.gastric_cancer", "secondary", "Gastric cancer on the board."),
        c("dx.schistosomiasis", "secondary", "Schistosomiasis with blood loss in urine or stool."),
    ],
    "dx.aki": [
        c("dx.sepsis", "secondary", "Sepsis on the board and creatinine rise meeting the KDIGO definition.", "KDIGO-AKI-2012"),
        c("dx.septic_shock", "secondary", "Septic shock on the board.", "KDIGO-AKI-2012"),
        c("dx.malaria_severe", "secondary", "Severe malaria on the board; renal impairment is a WHO severe criterion (creatinine >265 µM or urea >20 mM).", "WHO-SM-2014"),
        c("dx.gastroenteritis", "secondary", "Diarrhoea or vomiting with signs of volume depletion.", "KDIGO-AKI-2012"),
        c("dx.cholera", "secondary", "Cholera on the board.", "KDIGO-AKI-2012"),
        c("dx.hypovolaemic_shock", "secondary", "Hypovolaemic shock on the board.", "KDIGO-AKI-2012"),
        c("dx.rhabdomyolysis", "secondary", "Raised CK with dark urine or muscle injury."),
        c("dx.obstructive_uropathy", "secondary", "Hydronephrosis on ultrasound or urinary retention."),
        c("dx.urinary_retention", "secondary", "Acute urinary retention on the board."),
        c("dx.snakebite", "secondary", "Snakebite envenoming with coagulopathy or haemolysis."),
        c("dx.leptospirosis", "secondary", "Leptospirosis on the board."),
        c("dx.nephritic_syndrome", "secondary", "Haematuria, proteinuria, oedema and raised BP."),
        c("dx.heart_failure_acute", "secondary", "Acute heart failure with falling urine output (cardiorenal)."),
        c("dx.hhs", "secondary", "Hyperosmolar hyperglycaemic state on the board (volume depletion)."),
        c("dx.dka", "secondary", "DKA on the board with volume depletion."),
        c("dx.haemolytic_anaemia", "secondary", "Acute haemolysis with haemoglobinuria (for example blackwater fever)."),
        c("dx.pre_eclampsia_severe", "secondary", "Severe pre-eclampsia on the board (creatinine is one of its severe features).", "UG-EMNCC-2022"),
    ],
    "dx.dka": [
        c("dx.pneumonia", "precipitated_by", INFX, "ADA-CRISES-2024"),
        c("dx.uti", "precipitated_by", INFX, "ADA-CRISES-2024"),
        c("dx.pyelonephritis", "precipitated_by", INFX, "ADA-CRISES-2024"),
        c("dx.sepsis", "precipitated_by", INFX, "ADA-CRISES-2024"),
        c("dx.malaria_uncomplicated", "precipitated_by", INFX, "ADA-CRISES-2024"),
        c("dx.malaria_severe", "precipitated_by", INFX, "ADA-CRISES-2024"),
        c("dx.gastroenteritis", "precipitated_by", INFX, "ADA-CRISES-2024"),
        c("dx.cellulitis", "precipitated_by", INFX, "ADA-CRISES-2024"),
        c("dx.diabetic_foot", "precipitated_by", "Infected diabetic foot on the board.", "ADA-CRISES-2024"),
        c("dx.acs", "precipitated_by", "ACS on the board.", "ADA-CRISES-2024"),
        c("dx.pancreatitis_acute", "precipitated_by", "Acute pancreatitis on the board.", "ADA-CRISES-2024"),
        c("dx.covid19", "precipitated_by", INFX, "ADA-CRISES-2024"),
    ],
    "dx.hhs": [
        c("dx.pneumonia", "precipitated_by", INFX, "ADA-CRISES-2024"),
        c("dx.uti", "precipitated_by", INFX, "ADA-CRISES-2024"),
        c("dx.sepsis", "precipitated_by", INFX, "ADA-CRISES-2024"),
        c("dx.stroke", "precipitated_by", "Stroke on the board.", "ADA-CRISES-2024"),
        c("dx.acs", "precipitated_by", "ACS on the board.", "ADA-CRISES-2024"),
        c("dx.gastroenteritis", "precipitated_by", INFX, "ADA-CRISES-2024"),
    ],
    "dx.hypoglycaemia_dm": [
        c("dx.aki", "precipitated_by", "AKI on the board in a person on insulin or a sulfonylurea (reduced clearance).", "ADA-CRISES-2024"),
        c("dx.ckd", "precipitated_by", "CKD G4 or worse on insulin or a sulfonylurea.", "KDIGO-CKD-2024"),
        c("dx.sepsis", "precipitated_by", INFX),
        c("dx.malaria_severe", "precipitated_by", "Severe malaria on the board.", "WHO-SM-2014"),
        c("dx.gastroenteritis", "precipitated_by", "Reduced intake from vomiting or diarrhoea."),
    ],
    "dx.hypoglycaemia_no_dm": [
        c("dx.malaria_severe", "secondary", "Severe malaria on the board; hypoglycaemia (glucose <2.2 mM) is a WHO severe criterion.", "WHO-SM-2014"),
        c("dx.malaria_cerebral", "secondary", "Cerebral malaria on the board.", "WHO-SM-2014"),
        c("dx.sepsis", "secondary", "Sepsis on the board."),
        c("dx.alcohol_intoxication", "secondary", "Alcohol intoxication on the board (restricted class: mental_health)."),
        c("dx.adrenal_insufficiency", "secondary", "Adrenal insufficiency on the board."),
        c("dx.acute_liver_failure", "secondary", "Acute liver failure on the board."),
        c("dx.undernutrition", "secondary", "Undernutrition recorded."),
        c("dx.poisoning_medicine", "secondary", "Medicine overdose on the board (for example a sulfonylurea or insulin)."),
    ],
    "dx.heart_failure": [
        c("dx.hypertension", "secondary", "Hypertension on the board or problem list; LV hypertrophy on ECG or echo supports it.", "ESC-HF-2026"),
        c("dx.rheumatic_heart_disease", "secondary", "Valve disease on echo consistent with rheumatic heart disease.", "ESC-HF-2026"),
        c("dx.cardiomyopathy", "secondary", "Cardiomyopathy on echo.", "ESC-HF-2026"),
        c("dx.acs", "secondary", "Recent or current ACS, or regional wall-motion abnormality.", "ESC-HF-2026"),
        c("dx.angina_stable", "secondary", "Known ischaemic heart disease.", "ESC-HF-2026"),
        c("dx.aortic_stenosis", "secondary", "Aortic stenosis on echo.", "ESC-HF-2026"),
        c("dx.af", "secondary", "Persistent fast AF with reduced function (tachycardia-induced).", "ESC-HF-2026"),
        c("dx.thyrotoxicosis", "secondary", "Thyrotoxicosis on the board.", "ESC-HF-2026"),
        c("dx.pulmonary_hypertension", "secondary", "Right heart failure with pulmonary hypertension on echo."),
        c("dx.tb_pericarditis", "secondary", "Tuberculous pericarditis (constriction); restricted class."),
        c("dx.hiv", "secondary", "HIV with dilated cardiomyopathy and no other cause; restricted class."),
    ],
    "dx.heart_failure_acute": [
        c("dx.acs", "precipitated_by", "ACS on the board.", "ESC-HF-2026"),
        c("dx.af", "precipitated_by", "New or fast AF on the board.", "ESC-HF-2026"),
        c("dx.hypertensive_crisis", "precipitated_by", "Hypertensive crisis on the board.", "ESC-HF-2026"),
        c("dx.hypertensive_emergency", "precipitated_by", "Hypertensive emergency on the board.", "ESC-HF-2026"),
        c("dx.pneumonia", "precipitated_by", INFX, "ESC-HF-2026"),
        c("dx.infective_endocarditis", "precipitated_by", "Infective endocarditis on the board.", "ESC-HF-2026"),
        c("dx.anaemia", "precipitated_by", "Severe anaemia on the board.", "ESC-HF-2026"),
        c("dx.thyrotoxicosis", "precipitated_by", "Thyrotoxicosis on the board.", "ESC-HF-2026"),
        c("dx.aki", "precipitated_by", "AKI with fluid overload.", "ESC-HF-2026"),
        c("dx.pulmonary_embolism", "precipitated_by", "Pulmonary embolism on the board.", "ESC-HF-2026"),
    ],
    "dx.sickle_cell_crisis": [
        c("dx.malaria_uncomplicated", "precipitated_by", INFX),
        c("dx.malaria_severe", "precipitated_by", INFX),
        c("dx.sepsis", "precipitated_by", INFX),
        c("dx.pneumonia", "precipitated_by", INFX),
        c("dx.gastroenteritis", "precipitated_by", "Dehydration from vomiting or diarrhoea."),
    ],
    "dx.sepsis": [
        c(x, "secondary", "The source infection is on the board.")
        for x in ["dx.pneumonia", "dx.pyelonephritis", "dx.uti", "dx.cellulitis", "dx.necrotising_soft_tissue", "dx.meningitis_bacterial",
                  "dx.cholangitis", "dx.sbp", "dx.perforated_viscus", "dx.typhoid", "dx.pid", "dx.septic_arthritis", "dx.osteomyelitis",
                  "dx.liver_abscess", "dx.infective_endocarditis", "dx.diabetic_foot", "dx.pyomyositis", "dx.appendicitis", "dx.aspiration_pneumonia"]
    ],
    "dx.stroke_ischaemic": [
        c("dx.af", "secondary", "AF on ECG or history (cardioembolic).", "INTERSTROKE-2016"),
        c("dx.rheumatic_heart_disease", "secondary", "Rheumatic valve disease, especially mitral stenosis or AF (cardioembolic)."),
        c("dx.infective_endocarditis", "secondary", "Endocarditis on the board (septic emboli)."),
        c("dx.sickle_cell_disease", "secondary", "Known sickle cell disease."),
        c("dx.aortic_dissection", "secondary", "Dissection on the board."),
        c("dx.tb_meningitis", "secondary", "TB meningitis with infarcts (vasculitis); restricted class."),
        c("dx.giant_cell_arteritis", "secondary", "Giant cell arteritis on the board."),
        c("dx.hypertensive_emergency", "secondary", "Acute stroke presenting with a hypertensive emergency; the BP may be a response to the stroke, so the clinician decides the direction.", "HTN-EMERG"),
        c("dx.hypertensive_crisis", "secondary", "As above, while organ damage is still being assessed.", "HTN-EMERG"),
    ],
    "dx.stroke_haemorrhagic": [
        c("dx.hypertension", "secondary", "Hypertension on the board or problem list.", "INTERSTROKE-2016"),
        c("dx.hypertensive_emergency", "secondary", "Hypertensive emergency on the board; as above, the clinician decides the direction.", "HTN-EMERG"),
        c("dx.hypertensive_crisis", "secondary", "As above, while organ damage is still being assessed.", "HTN-EMERG"),
        c("dx.thrombocytopenia", "secondary", "Platelets low enough to bleed."),
        c("dx.dic", "secondary", "DIC on the board."),
        c("dx.liver_cirrhosis", "secondary", "Cirrhosis with coagulopathy."),
    ],
    "dx.stroke": "same_as:dx.stroke_ischaemic",
    "dx.hypertensive_crisis": [
        c("dx.hypertension", "complication", "Known or newly found hypertension.", "HTN-EMERG"),
        c("dx.nephritic_syndrome", "secondary", "Nephritic picture on urinalysis."),
        c("dx.ckd", "secondary", "CKD on the board."),
        c("dx.alcohol_withdrawal", "secondary", "Alcohol withdrawal on the board (restricted class: mental_health)."),
        c("dx.thyrotoxicosis", "secondary", "Thyrotoxicosis on the board."),
    ],
    "dx.hypertensive_emergency": "same_as:dx.hypertensive_crisis",
    "dx.cardiomyopathy": [
        c("dx.hiv", "secondary", "HIV on the board (restricted class)."),
        c("dx.alcohol_dependence", "secondary", "Alcohol dependence on the board (restricted class: mental_health)."),
        c("dx.thyrotoxicosis", "secondary", "Thyrotoxicosis on the board."),
    ],
    "dx.af": [
        c("dx.rheumatic_heart_disease", "secondary", "Rheumatic heart disease on echo."),
        c("dx.thyrotoxicosis", "secondary", "Thyrotoxicosis on the board."),
        c("dx.hypertension", "secondary", "Hypertension on the board or problem list."),
        c("dx.heart_failure", "secondary", "Heart failure on the board."),
        c("dx.pneumonia", "precipitated_by", "New AF during an acute infection."),
        c("dx.sepsis", "precipitated_by", "New AF during sepsis."),
        c("dx.pulmonary_embolism", "precipitated_by", "Pulmonary embolism on the board."),
    ],
    "dx.respiratory_failure": [
        c(x, "secondary", "The cause is on the board and SpO2 or blood gas meets respiratory failure.")
        for x in ["dx.pneumonia", "dx.pcp", "dx.asthma_exacerbation", "dx.copd_exacerbation", "dx.pulmonary_embolism", "dx.heart_failure_acute",
                  "dx.gbs", "dx.myasthenia", "dx.organophosphate_poisoning", "dx.opioid_sedative_toxicity", "dx.snakebite", "dx.covid19"]
    ],
    "dx.status_epilepticus": [
        c("dx.epilepsy", "complication", "Known epilepsy."),
        c("dx.malaria_cerebral", "secondary", "Cerebral malaria on the board.", "WHO-SM-2014"),
        c("dx.meningitis_bacterial", "secondary", "Bacterial meningitis on the board."),
        c("dx.hypoglycaemia_no_dm", "secondary", "Hypoglycaemia found at the time of the seizure."),
        c("dx.hypoglycaemia_dm", "secondary", "Hypoglycaemia found at the time of the seizure."),
        c("dx.eclampsia", "secondary", "Pregnant or up to 6 weeks after birth with raised BP."),
        c("dx.cerebral_toxoplasmosis", "secondary", "Cerebral toxoplasmosis on the board."),
        c("dx.alcohol_withdrawal", "secondary", "Alcohol withdrawal on the board (restricted class)."),
        c("dx.stroke", "secondary", "Stroke on the board."),
    ],
    "dx.delirium": [
        c(x, "secondary", "The cause is on the board.")
        for x in ["dx.sepsis", "dx.pneumonia", "dx.uti", "dx.malaria_severe", "dx.hypoglycaemia_dm", "dx.hypoglycaemia_no_dm",
                  "dx.hyponatraemia", "dx.hypercalcaemia", "dx.alcohol_withdrawal", "dx.hepatic_encephalopathy", "dx.aki", "dx.urinary_retention"]
    ],
    "dx.aspiration_pneumonia": [
        c(x, "secondary", "Reduced consciousness or impaired swallow from this cause.")
        for x in ["dx.stroke", "dx.stroke_ischaemic", "dx.stroke_haemorrhagic", "dx.alcohol_intoxication", "dx.status_epilepticus",
                  "dx.opioid_sedative_toxicity", "dx.organophosphate_poisoning", "dx.oesophageal_cancer"]
    ],
    "dx.hyponatraemia": [
        c(x, "secondary", "The cause is on the board and sodium is low.")
        for x in ["dx.heart_failure", "dx.liver_cirrhosis", "dx.adrenal_insufficiency", "dx.hypothyroidism", "dx.gastroenteritis",
                  "dx.tb_meningitis", "dx.meningitis_bacterial", "dx.pneumonia", "dx.lung_cancer"]
    ],
    "dx.hyperkalaemia": [
        c(x, "secondary", "The cause is on the board and potassium is high (repeat if the sample may be haemolysed).")
        for x in ["dx.aki", "dx.ckd", "dx.dka", "dx.rhabdomyolysis", "dx.adrenal_insufficiency"]
    ],
    "dx.hypokalaemia": [
        c(x, "secondary", "The cause is on the board and potassium is low.")
        for x in ["dx.gastroenteritis", "dx.cholera", "dx.hyperemesis", "dx.dka"]
    ],
    "dx.pulmonary_hypertension": [
        c(x, "secondary", "The cause is on the board and echo suggests pulmonary hypertension.")
        for x in ["dx.rheumatic_heart_disease", "dx.post_tb_lung_disease", "dx.copd", "dx.schistosomiasis", "dx.pulmonary_embolism", "dx.sickle_cell_disease", "dx.hiv"]
    ],
    "dx.liver_cirrhosis": [
        c("dx.hepatitis_b_chronic", "secondary", "HBsAg positive."),
        c("dx.hepatitis_c_chronic", "secondary", "Hepatitis C antibody positive with viraemia if tested."),
        c("dx.alcohol_dependence", "secondary", "Alcohol dependence recorded (restricted class)."),
    ],
    "dx.variceal_bleed": [
        c("dx.liver_cirrhosis", "complication", "Cirrhosis on the board or problem list."),
        c("dx.schistosomiasis", "secondary", "Hepatosplenic schistosomiasis (portal hypertension)."),
    ],
    "dx.hepatic_encephalopathy": [
        c(x, "precipitated_by", "The precipitant is on the board.")
        for x in ["dx.variceal_bleed", "dx.sbp", "dx.sepsis", "dx.aki", "dx.hypokalaemia", "dx.gastroenteritis"]
    ],
    "dx.nephrotic_syndrome": [
        c(x, "secondary", "The cause is on the board.")
        for x in ["dx.hepatitis_b_chronic", "dx.hiv", "dx.dm_type2", "dx.sle", "dx.syphilis", "dx.malaria_uncomplicated"]
    ],
    "dx.pericardial_effusion": [
        c(x, "secondary", "The cause is on the board.")
        for x in ["dx.tb_pericarditis", "dx.ckd", "dx.hypothyroidism", "dx.hiv", "dx.breast_cancer", "dx.lung_cancer", "dx.pericarditis"]
    ],
    "dx.pleural_effusion": [
        c(x, "secondary", "The cause is on the board.")
        for x in ["dx.tb_pulmonary_confirmed", "dx.tb_pulmonary_clinical", "dx.tb_extrapulmonary", "dx.heart_failure", "dx.pneumonia",
                  "dx.lung_cancer", "dx.breast_cancer", "dx.liver_abscess", "dx.liver_cirrhosis", "dx.nephrotic_syndrome"]
    ],
    "dx.cord_compression": [
        c(x, "secondary", "The cause is on the board, or back pain with red flags in a person with this condition.")
        for x in ["dx.tb_spine", "dx.prostate_cancer", "dx.myeloma", "dx.breast_cancer", "dx.lung_cancer", "dx.fracture"]
    ],
    "dx.obstructive_uropathy": [
        c(x, "secondary", "The cause is on the board.")
        for x in ["dx.bph", "dx.prostate_cancer", "dx.schistosomiasis", "dx.urolithiasis", "dx.bladder_cancer"]
    ],
    "dx.hypercalcaemia": [
        c(x, "secondary", "The cause is on the board.")
        for x in ["dx.myeloma", "dx.breast_cancer", "dx.lung_cancer", "dx.tumour_lysis_or_hypercalcaemia_malignancy"]
    ],
    "dx.dic": [
        c(x, "secondary", "The cause is on the board.")
        for x in ["dx.sepsis", "dx.septic_shock", "dx.malaria_severe", "dx.snakebite", "dx.pre_eclampsia_severe", "dx.vhf_suspected", "dx.leukaemia"]
    ],
    "dx.thrombocytopenia": [
        c(x, "secondary", "The cause is on the board.")
        for x in ["dx.malaria_uncomplicated", "dx.malaria_severe", "dx.hiv", "dx.sepsis", "dx.dic", "dx.liver_cirrhosis", "dx.visceral_leishmaniasis", "dx.leukaemia", "dx.sle"]
    ],
    "dx.rhabdomyolysis": [
        c(x, "secondary", "The cause is on the board and CK is raised.")
        for x in ["dx.heat_stroke", "dx.status_epilepticus", "dx.snakebite", "dx.pyomyositis", "dx.alcohol_intoxication"]
    ],
    "dx.wernicke": [
        c(x, "secondary", "The cause is on the board.")
        for x in ["dx.alcohol_dependence", "dx.hyperemesis", "dx.undernutrition"]
    ],
    "dx.subdural_haematoma": [c("dx.head_injury", "secondary", "Head injury recorded.")],
    "dx.pcp": [c("dx.hiv_advanced", "secondary", "Advanced HIV disease (restricted class).", "WHO-AHD-2017"), c("dx.hiv", "secondary", "HIV (restricted class).", "WHO-AHD-2017")],
    "dx.cryptococcal_meningitis": [c("dx.hiv_advanced", "secondary", "Advanced HIV disease (restricted class).", "WHO-CRYPTO-2022"), c("dx.hiv", "secondary", "HIV (restricted class).", "WHO-CRYPTO-2022")],
    "dx.cerebral_toxoplasmosis": [c("dx.hiv_advanced", "secondary", "Advanced HIV disease (restricted class).", "WHO-AHD-2017")],
    "dx.kaposi_sarcoma": [c("dx.hiv", "secondary", "HIV (restricted class).", "WHO-AHD-2017"), c("dx.hiv_advanced", "secondary", "Advanced HIV disease (restricted class).", "WHO-AHD-2017")],
    "dx.oesophageal_candidiasis": [c("dx.hiv_advanced", "secondary", "Advanced HIV disease (restricted class).", "WHO-AHD-2017")],
    "dx.diabetic_kidney_disease": [c(x, "complication", "Diabetes on the board or problem list.", "WHO-DM-2019") for x in ["dx.dm_type1", "dx.dm_type2", "dx.dm_type_unknown"]],
    "dx.ckd": [
        c("dx.dm_type2", "complication", "Diabetes with albuminuria or falling eGFR and no other cause (or choose Diabetic kidney disease).", "KDIGO-CKD-2024"),
        c("dx.dm_type1", "complication", "As above.", "KDIGO-CKD-2024"),
        c("dx.hypertension", "secondary", "Long-standing hypertension with no other cause.", "KDIGO-CKD-2024"),
        c("dx.hiv", "secondary", "HIV-associated nephropathy suspected (restricted class).", "KDIGO-CKD-2024"),
        c("dx.obstructive_uropathy", "secondary", "Chronic obstruction on ultrasound.", "KDIGO-CKD-2024"),
        c("dx.sickle_cell_disease", "secondary", "Known sickle cell disease.", "KDIGO-CKD-2024"),
        c("dx.nephrotic_syndrome", "secondary", "Nephrotic syndrome on the board or problem list.", "KDIGO-CKD-2024"),
    ],
}

# Causes that are not diagnoses. Recorded as a qualifier on the effect, never as a condition (decision D-REL-11).
NON_DIAGNOSIS_CAUSES = [
    {"id": "cause.insulin_omission", "display": "Missed or stopped insulin", "applies_to": ["dx.dka", "dx.hhs"], "source": "ADA-CRISES-2024"},
    {"id": "cause.new_medicine", "display": "A new or changed medicine (named in the medication record)", "applies_to": ["dx.dka", "dx.hhs", "dx.aki", "dx.hyperkalaemia", "dx.hyponatraemia", "dx.hypoglycaemia_dm", "dx.drug_rash", "dx.drug_induced_liver_injury", "dx.angioedema"], "source": "TEXTBOOK"},
    {"id": "cause.treatment_interruption", "display": "Medicines not taken (adherence or stock-out)", "applies_to": ["dx.heart_failure_acute", "dx.hypertensive_crisis", "dx.hypertensive_emergency", "dx.status_epilepticus", "dx.asthma_exacerbation", "dx.copd_exacerbation"], "source": "TEXTBOOK"},
    {"id": "cause.alcohol", "display": "Alcohol excess (restricted class: mental_health when linked to dependence)", "applies_to": ["dx.af", "dx.pancreatitis_acute", "dx.hypoglycaemia_no_dm"], "source": "TEXTBOOK"},
    {"id": "cause.pregnancy", "display": "Pregnancy (from the pregnancy record)", "applies_to": ["dx.anaemia", "dx.iron_deficiency_anaemia", "dx.dvt", "dx.pulmonary_embolism", "dx.uti", "dx.pyelonephritis"], "source": "WHO-HB-2024"},
    {"id": "cause.immobility", "display": "Immobility or recent surgery", "applies_to": ["dx.dvt", "dx.pulmonary_embolism", "dx.pressure_injury"], "source": "TEXTBOOK"},
]

# Pairs where the direction is a clinical judgement even though only one direction is listed
# (acute stroke raises BP; very high BP causes stroke). A drop on these always opens the chooser.
AMBIGUOUS = {("dx.stroke_haemorrhagic", "dx.hypertensive_emergency"), ("dx.stroke_ischaemic", "dx.hypertensive_emergency"),
             ("dx.stroke_haemorrhagic", "dx.hypertensive_crisis"), ("dx.stroke_ischaemic", "dx.hypertensive_crisis")}
