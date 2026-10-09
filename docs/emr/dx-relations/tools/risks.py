"""R2: risk factors. A risk factor raises the chance of the outcome; it is not this visit's cause.

The desk SHOWS the patient's matching risk factors (from the problem list, this visit's diagnoses and the social
history) as one line under the outcome. Nothing is stored unless the clinician includes the line in the note
(decision D-REL-04). Recorded exposures that are not diagnoses (tobacco) come from the social history.
"""

def r(id, src):
    return dict(id=id, source=src)

OUTCOMES = {
    "dx.acs": [r(x, "INTERHEART-2004") for x in ["dx.dm_type2", "dx.dm_type1", "dx.dm_type_unknown", "dx.hypertension", "dx.dyslipidaemia", "dx.obesity"]] + [r("dx.ckd", "KDIGO-CKD-2024"), r("dx.hiv", "TEXTBOOK")],
    "dx.angina_stable": "same_as:dx.acs",
    "dx.stroke": [r(x, "INTERSTROKE-2016") for x in ["dx.hypertension", "dx.af", "dx.dm_type2", "dx.dm_type1", "dx.dyslipidaemia", "dx.obesity"]] + [r("dx.sickle_cell_disease", "TEXTBOOK"), r("dx.rheumatic_heart_disease", "TEXTBOOK"), r("dx.ckd", "TEXTBOOK"), r("dx.hiv", "TEXTBOOK")],
    "dx.stroke_ischaemic": "same_as:dx.stroke",
    "dx.tia": "same_as:dx.stroke",
    "dx.stroke_haemorrhagic": [r("dx.hypertension", "INTERSTROKE-2016"), r("dx.alcohol_dependence", "INTERSTROKE-2016"), r("dx.liver_cirrhosis", "TEXTBOOK")],
    "dx.tb_pulmonary_clinical": [r(x, "WHO-TB-RISK") for x in ["dx.hiv", "dx.hiv_advanced", "dx.dm_type2", "dx.dm_type1", "dx.dm_type_unknown", "dx.undernutrition", "dx.alcohol_dependence"]] + [r("dx.ckd", "TEXTBOOK")],
    "dx.tb_pulmonary_confirmed": "same_as:dx.tb_pulmonary_clinical",
    "dx.tb_extrapulmonary": "same_as:dx.tb_pulmonary_clinical",
    "dx.heart_failure": [r(x, "ESC-HF-2026") for x in ["dx.hypertension", "dx.dm_type2", "dx.ckd", "dx.obesity", "dx.angina_stable"]],
    "dx.ckd": [r(x, "KDIGO-CKD-2024") for x in ["dx.dm_type2", "dx.dm_type1", "dx.hypertension", "dx.hiv", "dx.sickle_cell_disease", "dx.obesity", "dx.urolithiasis"]],
    "dx.pad": [r(x, "TEXTBOOK") for x in ["dx.dm_type2", "dx.hypertension", "dx.dyslipidaemia", "dx.ckd"]],
    "dx.af": [r(x, "TEXTBOOK") for x in ["dx.hypertension", "dx.dm_type2", "dx.obesity", "dx.heart_failure", "dx.rheumatic_heart_disease"]],
    "dx.dvt": [r(x, "TEXTBOOK") for x in ["dx.nephrotic_syndrome", "dx.heart_failure", "dx.fracture", "dx.obesity", "dx.breast_cancer", "dx.lung_cancer", "dx.colorectal_cancer", "dx.cancer_suspected", "dx.hiv"]],
    "dx.pulmonary_embolism": "same_as:dx.dvt",
    "dx.dm_type2": [r(x, "WHO-DM-2019") for x in ["dx.obesity", "dx.intermediate_hyperglycaemia", "dx.hypertension", "dx.dyslipidaemia"]],
    "dx.pneumonia": [r(x, "TEXTBOOK") for x in ["dx.copd", "dx.hiv", "dx.heart_failure", "dx.dm_type2", "dx.alcohol_dependence", "dx.sickle_cell_disease", "dx.ckd"]],
    "dx.pre_eclampsia": [r(x, "UG-EMNCC-2022") for x in ["dx.hypertension", "dx.dm_type1", "dx.dm_type2", "dx.ckd", "dx.sle", "dx.obesity"]],
    "dx.diabetic_foot": [r(x, "TEXTBOOK") for x in ["dx.peripheral_neuropathy", "dx.diabetic_neuropathy", "dx.pad"]],
    "dx.hcc": [r(x, "TEXTBOOK") for x in ["dx.hepatitis_b_chronic", "dx.hepatitis_c_chronic", "dx.liver_cirrhosis"]],
    "dx.bladder_cancer": [r("dx.schistosomiasis", "TEXTBOOK")],
    "dx.cellulitis": [r(x, "TEXTBOOK") for x in ["dx.lymphatic_filariasis", "dx.dm_type2", "dx.tinea", "dx.obesity"]],
    "dx.pyelonephritis": [r(x, "TEXTBOOK") for x in ["dx.dm_type2", "dx.urolithiasis", "dx.bph"]],
    "dx.osteomyelitis": [r("dx.sickle_cell_disease", "TEXTBOOK"), r("dx.diabetic_foot", "TEXTBOOK")],
    "dx.herpes_zoster": [r("dx.hiv", "TEXTBOOK")],
    "dx.gout": [r(x, "TEXTBOOK") for x in ["dx.ckd", "dx.obesity", "dx.hypertension"]],
    "dx.liver_cirrhosis": [r("dx.obesity", "TEXTBOOK"), r("dx.dm_type2", "TEXTBOOK")],
}

# Exposures that are not diagnoses, read from the social history (never stored as a condition).
EXPOSURES = [
    {"id": "exposure.tobacco_current", "display": "Current tobacco use", "outcomes": ["dx.acs", "dx.angina_stable", "dx.stroke", "dx.stroke_ischaemic", "dx.pad", "dx.copd", "dx.tb_pulmonary_clinical", "dx.tb_pulmonary_confirmed", "dx.lung_cancer", "dx.bladder_cancer"], "source": "INTERHEART-2004; INTERSTROKE-2016; WHO-TB-RISK"},
    {"id": "exposure.alcohol_harmful", "display": "Harmful alcohol use", "outcomes": ["dx.stroke_haemorrhagic", "dx.tb_pulmonary_clinical", "dx.pneumonia", "dx.liver_cirrhosis", "dx.pancreatitis_acute"], "source": "INTERSTROKE-2016; WHO-TB-RISK"},
    {"id": "exposure.physical_inactivity", "display": "Physical inactivity", "outcomes": ["dx.acs", "dx.stroke", "dx.dm_type2"], "source": "INTERHEART-2004; INTERSTROKE-2016"},
]
