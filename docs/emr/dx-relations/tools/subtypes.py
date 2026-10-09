"""R3: refinement of a broad diagnosis into a subtype, and severity scales kept as stage (not subtype).

Each subtype: (id, display, proposed, decided_by tests, criteria in plain words, source key, claim ids or "")
"""

def st(id, display, decided_by, criteria, source, claims="", proposed=False, restricted=None):
    return dict(id=id, display=display, proposed=proposed, decided_by=decided_by,
                criteria=criteria, source=source, claims=claims, restricted_class=restricted)

PARENTS = {
    # ---------------------------------------------------------------- ACS: two steps (ECG, then troponin)
    "dx.acs": dict(
        why="ACS is a working diagnosis. The ECG splits it at once into STEMI or NSTE-ACS; serial troponin then splits NSTE-ACS into NSTEMI or unstable angina.",
        subtypes=[
            st("dx.stemi", "ST-elevation myocardial infarction (STEMI)", ["test.ecg", "test.troponin"],
               "Working diagnosis from the ECG alone: new, persistent ST-elevation at the J-point in 2 contiguous leads, ≥1 mm in all leads other than V2–V3; in V2–V3 ≥2 mm in men ≥40 years, ≥2.5 mm in men <40 years, ≥1.5 mm in women regardless of age (or an ST-elevation equivalent). Myocardial infarction is final only when troponin shows a rise and/or fall with at least 1 value above the 99th percentile upper reference limit; ESC notes MI will not be the final diagnosis in every working STEMI. Do not wait for troponin to act on the ECG.",
               "UDMI-2018; ESC-ACS-2023", proposed=True),
            st("dx.nste_acs", "Acute coronary syndrome without ST-elevation (NSTE-ACS)", ["test.ecg"],
               "ECG shows no persistent ST-elevation or equivalent. This is still a working diagnosis: serial troponin decides between NSTEMI and unstable angina.",
               "ESC-ACS-2023", proposed=True),
        ],
        alternatives_if_ruled_out=["dx.pericarditis", "dx.pulmonary_embolism", "dx.aortic_dissection", "dx.msk_chest_pain", "dx.gord", "dx.chest_pain_unexplained"],
        note_before="Acute coronary syndrome, type to be decided by ECG and troponin",
        note_after="{subtype} (refined from acute coronary syndrome after {deciding})"),
    "dx.nste_acs": dict(
        why="Second step of the ACS ladder.",
        subtypes=[
            st("dx.nstemi", "Non-ST-elevation myocardial infarction (NSTEMI)", ["test.troponin"],
               "No persistent ST-elevation, and troponin shows a rise and/or fall with at least 1 value above the 99th percentile upper reference limit, with clinical or ECG evidence of ischaemia (new horizontal or downsloping ST-depression ≥0.5 mm in 2 contiguous leads and/or T inversion >1 mm in 2 contiguous leads with prominent R wave or R/S ratio >1 supports ischaemia). A single troponin never decides: the rise or fall needs serial values.",
               "UDMI-2018; ESC-ACS-2023", proposed=True),
            st("dx.unstable_angina", "Unstable angina", ["test.troponin"],
               "Myocardial ischaemia at rest or on minimal exertion in the absence of acute cardiomyocyte injury: serial troponin without a rise or fall above the 99th percentile upper reference limit.",
               "ESC-ACS-2023", proposed=True),
        ],
        alternatives_if_ruled_out=["dx.pericarditis", "dx.pulmonary_embolism", "dx.aortic_dissection", "dx.msk_chest_pain", "dx.gord"],
        note_before="Acute coronary syndrome without ST-elevation, type to be decided by serial troponin",
        note_after="{subtype} (refined from acute coronary syndrome after {deciding})"),
    # ---------------------------------------------------------------- anaemia: by mechanism (severity is a stage)
    "dx.anaemia": dict(
        why="Anaemia is refined by mechanism once the blood count, film and iron studies decide it. Severity is not a subtype: it is the stage scale below (WHO 2024), kept on the same condition.",
        subtypes=[
            st("dx.iron_deficiency_anaemia", "Iron-deficiency anaemia", ["test.fbc", "test.ferritin_iron", "test.blood_film"],
               "Low haemoglobin with microcytic, hypochromic indices and low iron stores (low ferritin; ferritin can be falsely normal in infection or inflammation). The cause (blood loss, hookworm, pregnancy, poor intake) is then recorded as a cause link, not as a subtype.",
               "TEXTBOOK"),
            st("dx.megaloblastic_anaemia", "Megaloblastic anaemia", ["test.fbc", "test.b12_folate", "test.blood_film"],
               "Macrocytic anaemia with megaloblastic features on the film and low vitamin B12 or folate.", "TEXTBOOK"),
            st("dx.haemolytic_anaemia", "Haemolytic anaemia", ["test.fbc", "test.reticulocytes", "test.blood_film", "test.lft"],
               "Anaemia with evidence of haemolysis: raised reticulocytes, unconjugated bilirubin, film changes. Malaria, sickle cell disease and G6PD deficiency are recorded as causes.",
               "TEXTBOOK"),
        ],
        note_before="Anaemia ({stage}), cause being investigated",
        note_after="{subtype} ({stage})"),
    "dx.anaemia_unexplained": dict(
        why="Symptom-level placeholder. Once a cause is linked or the mechanism is known, the desk offers to refine it to Anaemia (or a mechanism) so the note stops saying 'cause not yet known'.",
        subtypes=[
            st("dx.anaemia", "Anaemia", ["test.fbc"], "Haemoglobin below the WHO 2024 cutoff for age, sex and pregnancy (see the anaemia stage scale), and a cause or mechanism now recorded.", "WHO-HB-2024", proposed=True),
            st("dx.iron_deficiency_anaemia", "Iron-deficiency anaemia", ["test.fbc", "test.ferritin_iron"], "As under dx.anaemia.", "TEXTBOOK"),
            st("dx.megaloblastic_anaemia", "Megaloblastic anaemia", ["test.fbc", "test.b12_folate"], "As under dx.anaemia.", "TEXTBOOK"),
            st("dx.haemolytic_anaemia", "Haemolytic anaemia", ["test.fbc", "test.reticulocytes", "test.blood_film"], "As under dx.anaemia.", "TEXTBOOK"),
        ],
        note_before="Anaemia, cause not yet known",
        note_after="{subtype}"),
    # ---------------------------------------------------------------- malaria
    "dx.malaria_unconfirmed": dict(
        why="Malaria is confirmed by a parasitological test before it is classed. A negative test refutes it; it does not refine it.",
        subtypes=[
            st("dx.malaria_uncomplicated", "Malaria, uncomplicated", ["test.malaria_rdt", "test.malaria_smear"],
               "Positive malaria RDT or blood smear, and none of the WHO features of severe malaria present. Species (for example P. falciparum) is a qualifier from the test result, not a subtype.",
               "WHO-MAL-GL"),
            st("dx.malaria_severe", "Malaria, severe", ["test.malaria_smear", "test.malaria_rdt", "test.capillary_glucose", "test.fbc", "test.urea_electrolytes", "test.lactate"],
               "P. falciparum asexual parasitaemia with one or more of the WHO criteria, without an identified alternative cause: impaired consciousness (Glasgow Coma Score <11 in adults, Blantyre <3 in children); acidosis (base deficit >8 meq/l, or bicarbonate <15 mM, or venous lactate >5 mM); hypoglycaemia (glucose <2.2 mM, <40 mg/dl); severe malarial anaemia (Hb <5 g/dl or haematocrit <15% in children <12 years; <7 g/dl and <20% in adults; with parasite count >10 000/µl); renal impairment (creatinine >265 µM (3 mg/dl) or urea >20 mM); jaundice (bilirubin >50 µM (3 mg/dl) with parasite count >100 000/µl); pulmonary oedema (radiological, or SpO2 <92% on room air with respiratory rate >30/min); significant bleeding; shock (decompensated: systolic <70 mmHg in children or <80 mmHg in adults with impaired perfusion); hyperparasitaemia (>10%). WHO's clinical guidance also lists prostration and multiple convulsions.",
               "WHO-SM-2014; WHO-MAL-GL"),
        ],
        note_before="Malaria, not confirmed by a test",
        note_after="{subtype} ({qualifier})"),
    "dx.malaria_uncomplicated": dict(
        why="Progression to severe malaria at the same visit is a refinement of the same infection (a new version), not a second diagnosis.",
        subtypes=[st("dx.malaria_severe", "Malaria, severe", ["test.malaria_smear", "test.capillary_glucose", "test.fbc", "test.urea_electrolytes"],
                     "One or more WHO severe-malaria criteria now present (see dx.malaria_unconfirmed).", "WHO-SM-2014")],
        note_before="Malaria, uncomplicated", note_after="{subtype} ({qualifier})"),
    "dx.malaria_severe": dict(
        why="Cerebral malaria is the form of severe malaria defined by coma.",
        subtypes=[st("dx.malaria_cerebral", "Cerebral malaria", ["test.capillary_glucose", "test.csf_analysis", "test.malaria_smear"],
                     "Unrousable coma (Glasgow Coma Scale <11) in malaria, having excluded as far as possible other causes of coma; coma persisting >1 h after a seizure irrespective of anticonvulsant medicines. Hypoglycaemia must be checked and corrected first, and meningitis considered.",
                     "WHO-SM-2014")],
        note_before="Malaria, severe ({features})", note_after="{subtype}"),
    # ---------------------------------------------------------------- stroke
    "dx.stroke": dict(
        why="Stroke is the working diagnosis until imaging decides the type. Treatment differs completely between types, so the note must say when the type is not yet known.",
        subtypes=[
            st("dx.stroke_ischaemic", "Ischaemic stroke", ["test.ct_head"], "Acute focal neurological deficit of vascular origin with CT showing no haemorrhage (an early CT may be normal) or showing infarction.", "TEXTBOOK"),
            st("dx.stroke_haemorrhagic", "Intracerebral haemorrhage", ["test.ct_head"], "Acute focal deficit with intracerebral blood on CT.", "TEXTBOOK"),
            st("dx.sah", "Subarachnoid haemorrhage", ["test.ct_head", "test.csf_analysis"], "Subarachnoid blood on CT, or xanthochromia or blood in CSF when CT is negative and suspicion remains.", "TEXTBOOK"),
            st("dx.tia", "Transient ischaemic attack", ["test.ct_head"], "Transient focal neurological dysfunction from focal brain, spinal cord or retinal ischaemia, without acute infarction on imaging (tissue-based definition). Full resolution of symptoms alone does not make it a TIA if imaging shows infarction.", "AHA-TIA-2009"),
        ],
        alternatives_if_ruled_out=["dx.hypoglycaemia_no_dm", "dx.hypoglycaemia_dm", "dx.space_occupying_lesion", "dx.cerebral_toxoplasmosis", "dx.subdural_haematoma", "dx.bells_palsy", "dx.seizure_unexplained"],
        note_before="Stroke, type to be decided by CT head",
        note_after="{subtype}"),
    # ---------------------------------------------------------------- heart failure
    "dx.heart_failure": dict(
        why="Heart failure is classed by left ventricular ejection fraction on echo. The 2026 ESC guideline removed the mildly-reduced class; the 2021 guideline and the Universal Definition keep it. Store the LVEF number so either can be derived (decision D-REL-13). Acute decompensation is a complication (dx.heart_failure_acute), not a subtype.",
        subtypes=[
            st("dx.hfref", "Heart failure with reduced ejection fraction (HFrEF)", ["test.echo", "test.bnp"],
               "Symptoms and/or signs of heart failure with LVEF <50% (ESC 2026). Under ESC 2021: LVEF ≤40%.", "ESC-HF-2026; ESC-HF-2021", proposed=True),
            st("dx.hfpef", "Heart failure with preserved ejection fraction (HFpEF)", ["test.echo", "test.bnp"],
               "Symptoms and/or signs of heart failure with LVEF ≥50%, plus objective evidence of structural or functional cardiac abnormality consistent with LV diastolic dysfunction or raised filling pressures, including raised natriuretic peptides.", "ESC-HF-2026; ESC-HF-2021", proposed=True),
            st("dx.hfmref", "Heart failure with mildly reduced ejection fraction (HFmrEF)", ["test.echo"],
               "Only if D-REL-13 keeps the 2021 classes: LVEF 41–49% (ESC 2021). The 2026 ESC guideline counts this range as HFrEF.", "ESC-HF-2021", proposed=True),
        ],
        suppressed_when={"related_by": "due_to", "to_any": ["dx.rheumatic_heart_disease", "dx.aortic_stenosis"],
                         "why": "The LVEF classes were defined for heart failure without significant valve disease; with a valvular cause the desk shows the LVEF as a number and offers no class (vignette DXV-07)."},
        note_before="Heart failure, ejection fraction not yet measured",
        note_after="{subtype}, LVEF {lvef}%"),
    # ---------------------------------------------------------------- diabetes and hyperglycaemia
    "dx.hyperglycaemia_unconfirmed": dict(
        why="A raised glucose is not a diagnosis. The diabetes pack's confirm lane decides; this file only names where it can go. Every number lives in the pack's signed REF-DM entries (one number, one place).",
        subtypes=[
            st("dx.dm_type_unknown", "Diabetes, type not yet determined", ["test.hba1c", "test.glucose_fasting", "test.glucose_random", "test.ogtt_75g"], "WHO diagnostic criteria met, as the diabetes pack's confirm lane defines them (never a single value without symptoms).", "WHO-DM-2019"),
            st("dx.intermediate_hyperglycaemia", "Intermediate hyperglycaemia", ["test.glucose_fasting", "test.ogtt_75g", "test.hba1c"], "Values in the intermediate range as the diabetes pack defines it.", "WHO-DM-2019"),
            st("dx.steroid_induced_hyperglycaemia", "Raised blood glucose on steroid treatment", ["test.glucose_random"], "Hyperglycaemia arising on glucocorticoid treatment without prior diabetes; reassess after the steroid stops.", "TEXTBOOK"),
            st("dx.gestational_diabetes", "Gestational diabetes", ["test.ogtt_75g"], "Pregnant: hyperglycaemia first detected in pregnancy meeting the WHO 2013 gestational criteria (diabetes pack REF-DM).", "WHO-HIP-2013"),
            st("dx.diabetes_in_pregnancy", "Diabetes in pregnancy", ["test.ogtt_75g", "test.glucose_fasting"], "Pregnant: hyperglycaemia first detected in pregnancy meeting the WHO 2013 criteria for diabetes in pregnancy (diabetes pack REF-DM).", "WHO-HIP-2013"),
        ],
        note_before="Raised blood glucose, not yet a diagnosis",
        note_after="{subtype}"),
    "dx.dm_type_unknown": dict(
        why="Type is never inferred from body build alone. The diabetes pack's classify lane supplies the evidence; the clinician refines.",
        subtypes=[
            st("dx.dm_type1", "Type 1 diabetes", ["test.ketones", "test.gad_antibodies", "test.c_peptide"], "As the diabetes pack's classify lane defines it.", "WHO-DM-2019"),
            st("dx.dm_type2", "Type 2 diabetes", ["test.hba1c"], "As the diabetes pack's classify lane defines it.", "WHO-DM-2019"),
        ],
        note_before="Diabetes, type not yet determined",
        note_after="{subtype}"),
    # ---------------------------------------------------------------- pneumonia (severity is a stage)
    "dx.pneumonia": dict(
        why="Setting of acquisition changes the likely organisms and the treatment protocol. Severity (CURB-65) is a stage, not a subtype.",
        subtypes=[
            st("dx.pneumonia_community", "Community-acquired pneumonia", ["test.chest_xray"], "Pneumonia acquired outside hospital, including pneumonia appearing within 48 hours of admission.", "ATS-IDSA-HAP-2016", proposed=True),
            st("dx.pneumonia_hospital", "Hospital-acquired pneumonia", ["test.chest_xray", "test.blood_culture", "test.sputum_mcs"], "Pneumonia not incubating at admission and occurring 48 hours or more after admission.", "ATS-IDSA-HAP-2016", proposed=True),
            st("dx.aspiration_pneumonia", "Aspiration pneumonia", ["test.chest_xray"], "Pneumonia after a witnessed or likely aspiration (reduced consciousness, impaired swallow, vomiting), usually in dependent lung segments.", "TEXTBOOK"),
            st("dx.pcp", "Pneumocystis pneumonia", ["test.chest_xray", "test.cd4", "test.blood_gas"], "Subacute breathlessness and hypoxia with bilateral interstitial change in a person with advanced immunosuppression. Reveals HIV status by inference: see D-REL-10.", "TEXTBOOK"),
        ],
        alternatives_if_ruled_out=["dx.tb_pulmonary_clinical", "dx.pulmonary_embolism", "dx.heart_failure_acute", "dx.lung_cancer"],
        note_before="Pneumonia ({stage})",
        note_after="{subtype} ({stage})"),
    # ---------------------------------------------------------------- hypertensive crisis
    "dx.hypertensive_crisis": dict(
        why="The sources agree that the BP number alone does not make an emergency: acute organ damage does. The term 'hypertensive urgency' is dropped by ESC 2019, AHA 2024 and AHA/ACC 2025 but kept by ESH 2023 and (as recalled) UCG 2023; MedSync's wording follows decision D-REL-16 and the hypertension pack's D-HTN-01. The BP threshold is the hypertension pack's signed number, not restated here.",
        subtypes=[
            st("dx.hypertensive_emergency", "Hypertensive emergency", ["test.urinalysis_dipstick", "test.urea_electrolytes", "test.ecg", "test.troponin", "test.ct_head"],
               "Substantially raised BP with acute hypertension-mediated organ damage: encephalopathy, intracranial haemorrhage or acute ischaemic stroke, acute coronary syndrome, acute heart failure with pulmonary oedema, aortic dissection, retinal haemorrhages or papilloedema, acute kidney injury, eclampsia or severe pre-eclampsia. Uganda's NCD guideline 2019 gives 'BP > 200 mmHg systolic or >120 mmHg diastolic or BP > 180mmHg systolic or >110 mmHg diastolic with symptoms consistent with evidence of end organ damage'.",
               "HTN-EMERG; HTN-ISH-2020", claims="H11-01, H11-15, H11-27, H6-209, H1-39, H1-40", proposed=True),
            st("dx.severe_hypertension_no_aod", "Severe hypertension without acute organ damage", ["test.urinalysis_dipstick", "test.urea_electrolytes", "test.ecg"],
               "Very high BP with no acute hypertension-mediated organ damage after assessment. Not an emergency: sources advise oral treatment and early review rather than emergency lowering.",
               "HTN-EMERG; HTN-ISH-2020", claims="H11-07, H11-08, H11-16, H6-215", proposed=True),
        ],
        note_before="Hypertensive crisis, organ damage being assessed",
        note_after="{subtype}"),
    # ---------------------------------------------------------------- CKD
    "dx.ckd": dict(
        why="CKD is staged by GFR and albuminuria (a stage, below). A cause-specific term exists only for diabetes in the catalogue; selecting it also offers the complication link to diabetes.",
        subtypes=[st("dx.diabetic_kidney_disease", "Diabetic kidney disease", ["test.uacr", "test.creatinine"],
                     "CKD attributed to diabetes, as the diabetes pack's stratify lane defines it. Selecting it offers the link 'complication of diabetes'.", "KDIGO-CKD-2024; WHO-DM-2019")],
        note_before="Chronic kidney disease {stage}",
        note_after="{subtype}, {stage}"),
    # ---------------------------------------------------------------- meningitis
    "dx.meningitis_unexplained": dict(
        why="The CSF and the cryptococcal antigen decide the cause; each cause has a different treatment, so the note must say when it is not yet known.",
        subtypes=[
            st("dx.meningitis_bacterial", "Bacterial meningitis", ["test.csf_analysis", "test.blood_culture"], "CSF with bacteria on Gram stain or culture, or a neutrophilic CSF with low glucose and high protein, consistent clinical picture.", "WHO-MENING-2025"),
            st("dx.cryptococcal_meningitis", "Cryptococcal meningitis", ["test.crag", "test.csf_analysis"], "Positive cryptococcal antigen in CSF, or India ink or culture positive; a positive blood CrAg with meningitic symptoms makes it likely until the CSF is examined. Reveals HIV status by inference: see D-REL-10.", "WHO-CRYPTO-2022"),
            st("dx.tb_meningitis", "Tuberculous meningitis", ["test.csf_analysis", "test.tb_xpert", "test.tb_lam"], "Bacteriologically confirmed (Xpert or culture on CSF) or clinically diagnosed TB meningitis.", "WHO-TB-DEF", restricted="tb"),
            st("dx.meningitis_viral", "Viral meningitis", ["test.csf_analysis", "test.crag"], "Lymphocytic CSF with normal glucose after bacterial, cryptococcal and TB causes have been reasonably excluded. A diagnosis of exclusion.", "WHO-MENING-2025", proposed=True),
        ],
        note_before="Meningitis, cause not yet known (awaiting CSF and CrAg)",
        note_after="{subtype}"),
    # ---------------------------------------------------------------- TB (restricted class)
    "dx.tb_pulmonary_clinical": dict(
        why="A clinically diagnosed case later found bacteriologically positive is reclassified as bacteriologically confirmed. Drug resistance is a qualifier from the Xpert result, kept as a stage, not a separate term.",
        subtypes=[st("dx.tb_pulmonary_confirmed", "Pulmonary tuberculosis, bacteriologically confirmed", ["test.tb_xpert", "test.tb_lam", "test.sputum_afb"],
                     "TB diagnosed in a biological specimen by a WHO-approved rapid test such as Xpert MTB/RIF or LF-LAM, smear microscopy or culture, involving the lung parenchyma or tracheobronchial tree.", "WHO-TB-DEF", restricted="tb")],
        note_before="Pulmonary tuberculosis, clinically diagnosed",
        note_after="{subtype}{resistance}"),
    "dx.tb_extrapulmonary": dict(
        why="Extrapulmonary TB is refined by site. A patient with both pulmonary and extrapulmonary disease is classed as pulmonary in WHO reporting.",
        subtypes=[
            st("dx.tb_meningitis", "Tuberculous meningitis", ["test.csf_analysis", "test.tb_xpert"], "TB involving the meninges (bacteriologically confirmed or clinically diagnosed).", "WHO-TB-DEF", restricted="tb"),
            st("dx.tb_pericarditis", "Tuberculous pericarditis", ["test.echo", "test.tb_lam"], "TB involving the pericardium.", "WHO-TB-DEF", restricted="tb"),
            st("dx.tb_spine", "Tuberculosis of the spine", ["test.xray_spine", "test.mri_spine", "test.tissue_biopsy"], "TB involving the spine.", "WHO-TB-DEF", restricted="tb"),
        ],
        note_before="Extrapulmonary tuberculosis, site being confirmed",
        note_after="{subtype}"),
    # ---------------------------------------------------------------- HIV (restricted class)
    "dx.hiv": dict(
        why="Advanced HIV disease changes the work-up (CD4, CrAg, TB-LAM). Restricted class: nothing here may appear for a viewer without the HIV class.",
        subtypes=[st("dx.hiv_advanced", "Advanced HIV disease", ["test.cd4"],
                     "Adults, adolescents and children 5 years and older: CD4 count <200 cells/mm³ or a WHO stage 3 or 4 event; all children younger than 5 years living with HIV.", "WHO-AHD-2017", restricted="hiv")],
        note_before="HIV infection", note_after="{subtype}"),
    # ---------------------------------------------------------------- pre-eclampsia (Uganda source, read and re-read)
    "dx.pre_eclampsia": dict(
        why="Pre-eclampsia with severe features is a refinement of the same condition. Eclampsia (convulsions) is a complication link, not a subtype.",
        subtypes=[st("dx.pre_eclampsia_severe", "Severe pre-eclampsia", ["test.urinalysis_dipstick", "test.fbc", "test.lft", "test.creatinine"],
                     "Pre-eclampsia with any one severe feature, Uganda 2022: BP greater or equal to 160/110 mmHg; persistent headache, altered mentation, persistent epigastric or right upper quadrant pain, visual changes; urine output less than 100 ml in 4 hours; pulmonary oedema or SpO2 less than 90%; platelets less than 100,000 per microlitre; AST or ALT twice the upper limit of normal; creatinine above 1.1 mg/dL or 90 µmol/L (the source pairs two values that are not equal; see the hypertension conflicts list) or doubling; HELLP.",
                     "UG-EMNCC-2022", claims="H2-04, H2-05, H2-07, H2-08, H2-09, H2-10, H2-11, H2-12")],
        note_before="Pre-eclampsia without severe features", note_after="{subtype} ({features})"),
    # ---------------------------------------------------------------- symptom-level resolution (generic rule, examples)
    "dx.chest_pain_unexplained": dict(
        why="Symptom-level terms are placeholders. When a diagnosis explains the symptom, the placeholder is refined (new version) to that diagnosis, so the note does not carry both.",
        subtypes=[st(x, d, ["test.ecg", "test.troponin"], "The diagnosis's own criteria are met.", "TEXTBOOK", proposed=(x in ("dx.nste_acs",)))
                  for x, d in [("dx.acs", "Acute coronary syndrome"), ("dx.pulmonary_embolism", "Pulmonary embolism"), ("dx.aortic_dissection", "Aortic dissection"), ("dx.pericarditis", "Acute pericarditis"), ("dx.msk_chest_pain", "Musculoskeletal chest pain"), ("dx.gord", "Gastro-oesophageal reflux disease")]],
        note_before="Chest pain, cause not yet known", note_after="{subtype}"),
    "dx.shock_unexplained": dict(
        why="Symptom-level resolution: shock is refined to its mechanism.",
        subtypes=[st(x, d, ["test.lactate", "test.pocus_lung_cardiac", "test.ecg"], "The mechanism's own criteria are met.", "TEXTBOOK")
                  for x, d in [("dx.septic_shock", "Septic shock"), ("dx.hypovolaemic_shock", "Hypovolaemic shock"), ("dx.cardiogenic_shock", "Cardiogenic shock"), ("dx.anaphylaxis", "Anaphylaxis")]],
        note_before="Shock, cause not yet known", note_after="{subtype}"),
}

# Severity and stage scales: kept on the same condition (conditions.stage jsonb), never a subtype.
STAGES = {
    "dx.anaemia": dict(
        scale="Severity by haemoglobin (g/L), WHO 2024, Table 3", source="WHO-HB-2024",
        applies_also_to=["dx.anaemia_unexplained", "dx.iron_deficiency_anaemia", "dx.megaloblastic_anaemia", "dx.haemolytic_anaemia"],
        rows=[
            {"group": "Children 6–23 months", "none": "≥105", "mild": "95–104", "moderate": "70–94", "severe": "<70"},
            {"group": "Children 24–59 months", "none": "≥110", "mild": "100–109", "moderate": "70–99", "severe": "<70"},
            {"group": "Children 5–11 years", "none": "≥115", "mild": "110–114", "moderate": "80–109", "severe": "<80"},
            {"group": "12–14 years (girls not pregnant, and boys)", "none": "≥120", "mild": "110–119", "moderate": "80–109", "severe": "<80"},
            {"group": "Women 15–65 years, not pregnant", "none": "≥120", "mild": "110–119", "moderate": "80–109", "severe": "<80"},
            {"group": "Men 15–65 years", "none": "≥130", "mild": "110–129", "moderate": "80–109", "severe": "<80"},
            {"group": "Pregnancy, first trimester", "none": "≥110", "mild": "100–109", "moderate": "70–99", "severe": "<70"},
            {"group": "Pregnancy, second trimester", "none": "≥105", "mild": "95–104", "moderate": "70–94", "severe": "<70"},
            {"group": "Pregnancy, third trimester", "none": "≥110", "mild": "100–109", "moderate": "70–99", "severe": "<70"},
        ],
        notes="Units are g/L (the record may hold g/dL: 7 g/dL = 70 g/L). Pregnancy state unknown means the non-pregnant row cannot be applied to a woman who could be pregnant: the stage is 'insufficient', as in the diabetes pack. Over 65 years: the table read stops at 65; the CSO decides whether the adult rows apply. The WHO severe-malaria anaemia criterion (Hb <7 g/dl adults, <5 g/dl children <12 years, with parasite count >10 000/µl) is a different definition and is not this scale."),
    "dx.ckd": dict(
        scale="GFR category and albuminuria category (KDIGO 2024)", source="KDIGO-CKD-2024",
        rows=[
            {"code": "G1", "egfr_ml_min_1_73m2": "≥90", "words": "Normal or high"},
            {"code": "G2", "egfr_ml_min_1_73m2": "60-89", "words": "Mildly decreased"},
            {"code": "G3a", "egfr_ml_min_1_73m2": "45-59", "words": "Mildly to moderately decreased"},
            {"code": "G3b", "egfr_ml_min_1_73m2": "30-44", "words": "Moderately to severely decreased"},
            {"code": "G4", "egfr_ml_min_1_73m2": "15-29", "words": "Severely decreased"},
            {"code": "G5", "egfr_ml_min_1_73m2": "<15", "words": "Kidney failure"},
            {"code": "A1", "acr_mg_g": "<30", "acr_mg_mmol": "<3 (to check on the KDIGO page)", "words": "Normal to mildly increased"},
            {"code": "A2", "acr_mg_g": "30-300", "acr_mg_mmol": "3-30 (to check)", "words": "Moderately increased"},
            {"code": "A3", "acr_mg_g": ">300", "acr_mg_mmol": ">30 (to check)", "words": "Severely increased"},
        ],
        notes="CKD needs abnormality present for more than 3 months (KDIGO; not on the page read today). Uganda's NCD guideline 2019 footnote prints 'albumin-creatinine ratio of ≥ 30mg/mmol' for moderate or severe albuminuria, which as printed would mean severe only (hypertension claim H1-68): raise with the Ministry."),
    "dx.aki": dict(
        scale="KDIGO 2012 AKI stage", source="KDIGO-AKI-2012", claims="H11-86, H11-87",
        rows=[
            {"stage": "1", "creatinine": "1.5–1.9 times baseline OR ≥0.3 mg/dl (≥26.5 μmol/l) increase", "urine_output": "<0.5 ml/kg/h for 6–12 hours (urine criteria to check)"},
            {"stage": "2", "creatinine": "2.0–2.9 times baseline", "urine_output": "<0.5 ml/kg/h for ≥12 hours (to check)"},
            {"stage": "3", "creatinine": "3.0 times baseline OR increase in serum creatinine to ≥4.0 mg/dl (≥353.6 μmol/l) OR initiation of renal replacement therapy", "urine_output": "<0.3 ml/kg/h for ≥24 hours or anuria for ≥12 hours (to check)"},
        ],
        notes="Creatinine criteria from claims H11-86 and H11-87 (two reads differed on H11-87; check the page). Urine-output criteria not in the claims."),
    "dx.pneumonia": dict(
        scale="CURB-65 (adults, community-acquired pneumonia)", source="BTS-CURB65",
        rows=[
            {"item": "Confusion", "point": "new disorientation in time, place or person, or abbreviated mental test score ≤8/10"},
            {"item": "Urea", "point": ">7 mmol/l"},
            {"item": "Respiratory rate", "point": "≥30/min"},
            {"item": "Blood pressure", "point": "systolic <90 mmHg or diastolic ≤60 mmHg"},
            {"item": "Age", "point": "≥65 years"},
        ],
        bands=[{"score": "0–1", "words": "most patients can be managed in the community"}, {"score": "2", "words": "consider hospital treatment"}, {"score": "3 or more", "words": "severe pneumonia; urgent admission"}],
        notes="Urea is often unavailable at HC III and IV: CRB-65 (without urea) applies there, and a missing urea is never scored as 0 (blank is never negative)."),
    "dx.hypertension": dict(
        scale="BP grade: defer to the hypertension pack (decision D-HTN-05). Shown here only so the subtype file is complete.", source="HTN-ISH-2020",
        claims="H6-10, H6-11, H7-93, H1-15",
        rows=[
            {"grade": "Grade 1", "systolic": "140–159", "join": "and/or", "diastolic": "90–99", "source": "ISH 2020 Table 1"},
            {"grade": "Grade 2", "systolic": "≥160", "join": "and/or", "diastolic": "≥100", "source": "ISH 2020 Table 1"},
            {"grade": "Grade 3 (ESH only)", "systolic": "≥180", "join": "and/or", "diastolic": "≥110", "source": "ESH 2023 (text layer drops '≥'; check the page image)"},
        ],
        notes="Uganda's NCD guideline 2019 has no grading table in the pages read; UCG 2023's table could not be opened (recalled as JNC 7 stages). The hypertension pack decides; this file must not become a second source of these numbers."),
    "dx.tb_pulmonary_confirmed": dict(
        scale="Drug-resistance qualifier (restricted class: tb)", source="WHO-TB-DEF",
        rows=[{"qualifier": "RR-TB", "words": "TB caused by Mycobacterium tuberculosis strains resistant to rifampicin"},
              {"qualifier": "MDR-TB", "words": "resistant to at least both rifampicin and isoniazid"}],
        notes="Set from the Xpert MTB/RIF or drug-susceptibility result. 'Rifampicin resistance not detected' is drug-susceptible for the rifampicin axis only."),
}
