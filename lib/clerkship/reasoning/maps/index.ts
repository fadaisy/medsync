import type { ReasoningMap } from "@/lib/clerkship/reasoning/types";

/**
 * CSO-signed reasoning maps (one per worked presenting complaint, §3). Code
 * reference data — reviewed in the PR diff (ADR 0065). Decision-support: these
 * encode what to CONSIDER / ASK / EXAMINE / RULE-OUT — NEVER a verdict. The
 * engine merges them into an always-plural differential; nothing is auto-marked.
 */
export const REASONING_MAPS: ReasoningMap[] = [
  {
    code: "chest_pain",
    display: "Chest pain",
    triggerCodes: ["chest_pain", "pleuritic_chest_pain"],
    problemReprHint:
      "Acute chest pain: frame as cardiovascular emergency. Discriminate time-critical emergencies (ACS/MI, aortic dissection, PE, tension pneumothorax, oesophageal rupture) from urgent mimics (musculoskeletal, GORD, pericarditis, anxiety). SOCRATES-structured history is load-bearing; exam hypotheses narrow differential.",
    differential: [
      {
        dx: "ACS / Myocardial infarction",
        likelihood: "likely",
        ruleIn: [
          "Crushing central chest pain",
          "Radiation to left arm or jaw",
          "Exertional onset",
          "Sweating, nausea",
        ],
        ruleOut: ["Reproducible on palpation", "Pleuritic"],
      },
      {
        dx: "Aortic dissection",
        likelihood: "must_not_miss",
        ruleIn: [
          "Tearing or ripping pain",
          "Maximal at onset",
          "Radiation to back",
          "Unequal BP or pulses",
          "Syncope",
        ],
        ruleOut: ["Reproducible on palpation", "Pleuritic"],
      },
      {
        dx: "Pulmonary Embolism",
        likelihood: "must_not_miss",
        ruleIn: ["Pleuritic pain", "Dyspnoea", "Hypoxia SpO2 <92%", "VTE risk factors"],
        ruleOut: ["Crushing without dyspnoea", "Reproducible"],
      },
      {
        dx: "Tension pneumothorax",
        likelihood: "must_not_miss",
        ruleIn: [
          "Acute dyspnoea",
          "Absent breath sounds unilateral",
          "Haemodynamic instability",
          "Tracheal deviation",
        ],
        ruleOut: ["Gradual onset", "Reproducible"],
      },
      {
        dx: "Oesophageal rupture",
        likelihood: "must_not_miss",
        ruleIn: [
          "Severe tearing pain",
          "Forceful vomiting preceding",
          "Subcutaneous emphysema",
          "Shock",
        ],
        ruleOut: ["Exertional", "Reproducible"],
      },
      {
        dx: "Pericarditis",
        likelihood: "likely",
        ruleIn: [
          "Positional worse-lying relieved-sitting-forward",
          "Pleuritic",
          "Fever",
          "Friction rub",
        ],
        ruleOut: ["Radiation to arm", "Exertional relief"],
      },
      {
        dx: "Musculoskeletal / Costochondritis",
        likelihood: "likely",
        ruleIn: [
          "Reproducible on palpation",
          "Localized tenderness",
          "Pleuritic on movement",
          "Recent trauma",
        ],
        ruleOut: ["Crushing", "Radiation"],
      },
      {
        dx: "GORD",
        likelihood: "likely",
        ruleIn: [
          "Burning character",
          "Postprandial onset",
          "Acid reflux sensation",
          "Relieved by antacids",
        ],
        ruleOut: ["Crushing", "Dyspnoea"],
      },
      {
        dx: "Anxiety / Panic attack",
        likelihood: "likely",
        ruleIn: [
          "Palpitations, dyspnoea, dizziness",
          "Hyperventilation",
          "Impending doom",
          "Normal ECG, troponin",
        ],
        ruleOut: ["Tearing character", "Haemodynamic instability"],
      },
    ],
    discriminatingHpc: [
      "Exertional vs rest onset",
      "Central crushing with arm radiation ACS vs tearing to back dissection",
      "Pleuritic with dyspnoea PE vs positional worse-lying pericarditis",
      "Reproducible-on-palpation MSK vs burning postprandial GORD",
      "Unequal BP and pulses dissection",
      "Associated sweating, nausea ACS",
      "Associated dyspnoea, haemoptysis, calf pain PE",
      "Fever pericarditis",
    ],
    associated: [
      "Sweating and diaphoresis ACS, shock",
      "Nausea, vomiting ACS, dissection",
      "Palpitations ACS, anxiety, PE",
      "Syncope dissection, PE, tension pneumothorax, ACS shock",
      "Dyspnoea ACS, PE, pneumothorax, anxiety",
      "Haemoptysis PE, pulmonary oedema",
      "Calf pain/swelling DVT, PE",
      "Fever pericarditis, pneumonia",
      "Haemodynamic instability dissection, PE, oesophageal rupture, ACS",
      "Subcutaneous emphysema tension pneumothorax, oesophageal rupture",
    ],
    redFlags: [
      "Haemodynamic instability SBP<90, HR>120",
      "Syncope or presyncope",
      "Tearing or ripping pain",
      "Unequal BP/pulses",
      "Hypoxia SpO2<92%",
      "New ECG changes ST elevation/depression",
      "New murmur or pericardial rub",
      "Silent chest with respiratory distress",
      "Subcutaneous emphysema",
      "Signs of shock",
    ],
    examTargets: [
      {
        area: "BP both arms",
        sign: "Difference >20 mmHg systolic",
        discriminates: "Aortic dissection",
      },
      {
        area: "Pulses",
        sign: "Unequal or diminished",
        discriminates: "Aortic dissection, shock",
      },
      {
        area: "Heart sounds",
        sign: "New murmur, pericardial rub, muffled",
        discriminates: "Aortic dissection, pericarditis, tamponade",
      },
      {
        area: "JVP",
        sign: "Raised JVP",
        discriminates: "Tamponade, RV infarction, tension pneumothorax",
      },
      {
        area: "Lung fields",
        sign: "Absent breath sounds hyperresonance, crackles, tracheal shift",
        discriminates: "Pneumothorax, pulmonary oedema, PE",
      },
      {
        area: "Chest wall palpation",
        sign: "Reproducible tenderness vs none",
        discriminates: "Musculoskeletal vs cardiac",
      },
      {
        area: "Calf",
        sign: "Swelling, warmth, tenderness",
        discriminates: "DVT, PE",
      },
      {
        area: "Abdomen",
        sign: "Emphysema, tenderness, guarding",
        discriminates: "Oesophageal rupture",
      },
    ],
    historyEmphasis: [
      "Cardiac risk factors age, smoking, diabetes, hypertension, family history",
      "Prior VTE or PE",
      "Anticoagulation non-compliance",
      "Connective tissue disease Marfan, Ehlers-Danlos",
      "Recent immobilization bed rest, long travel, cast",
      "Recent major trauma or surgery",
      "Recent forceful vomiting or Boerhaave manoeuvre",
      "Pregnancy or postpartum <=6 weeks",
      "Malignancy or chemotherapy",
      "Recent viral illness pericarditis",
      "COPD or asthma pneumotharax risk",
      "Prior spontaneous pneumothorax",
      "Chronic reflux disease",
    ],
    combinations: [
      {
        features: [
          "Central crushing chest pain",
          "Radiation to left arm or jaw",
          "Sweating and diaphoresis",
          "Nausea",
        ],
        suggests: "Acute coronary syndrome / myocardial infarction",
        action:
          "Immediate ECG, troponin, IV access, high-flow O2, aspirin and ACS protocols, cardiology, admit high-dependency",
      },
      {
        features: [
          "Tearing or ripping pain",
          "Maximal at onset",
          "Radiation to back",
          "Unequal BP and pulses",
          "Haemodynamic instability",
        ],
        suggests: "Aortic dissection type A",
        action:
          "Immediate senior cardiothoracic, IV large-bore access, urgent CT angiography, target BP SBP 100-120, ICU, emergency surgery",
      },
      {
        features: [
          "Acute dyspnoea",
          "Pleuritic chest pain",
          "Hypoxia SpO2 <92%",
          "Tachycardia",
          "VTE risk factors",
        ],
        suggests: "Pulmonary embolism",
        action:
          "Escalate immediately, urgent CTPA, IV heparin, high-flow O2, admission, consider thrombolysis if unstable",
      },
      {
        features: [
          "Acute dyspnoea",
          "Unilateral absent breath sounds hyperresonance",
          "Haemodynamic instability",
          "Tracheal deviation",
        ],
        suggests: "Tension pneumothorax emergency",
        action:
          "Immediate needle decompression 2nd ICS midclavicular, then chest drain, high-flow O2, IV access, ICU",
      },
      {
        features: [
          "Severe tearing pain",
          "Forceful vomiting preceding",
          "Subcutaneous emphysema",
          "Haemodynamic shock",
        ],
        suggests: "Oesophageal rupture Boerhaave",
        action:
          "Immediate upper GI surgeon, urgent CT chest water-soluble contrast, IV access, broad-spectrum antibiotics, NPO, ICU, emergency surgery",
      },
      {
        features: [
          "Positional worse-lying relieved-sitting-forward",
          "Pleuritic component",
          "Fever",
          "Pericardial friction rub",
        ],
        suggests: "Pericarditis",
        action:
          "ECG PR depression ST elevation, troponin, echocardiogram exclude tamponade, inflammatory markers, NSAIDs or colchicine, rule out ACS",
      },
      {
        features: [
          "Reproducible on palpation",
          "Tenderness over costochondral junctions",
          "Pleuritic on movement",
          "No systemic features",
        ],
        suggests: "Musculoskeletal / costochondritis",
        action:
          "Clinical diagnosis palpation-reproducible, rule out cardiac or PE with exam and ECG, analgesia, reassurance",
      },
      {
        features: [
          "Burning character",
          "Postprandial onset",
          "Heartburn and acid reflux",
          "Relieved by antacids",
        ],
        suggests: "Gastro-oesophageal reflux disease",
        action:
          "Clinical diagnosis, rule out ACS with ECG and troponin if cardiac risk factors, trial PPI or H2-blocker, lifestyle modification",
      },
      {
        features: [
          "Palpitations, dyspnoea, dizziness",
          "Hyperventilation",
          "Impending doom",
          "History of panic attacks",
          "Normal ECG and troponin",
        ],
        suggests: "Anxiety / panic attack",
        action:
          "Rule out organic causes with exam and ECG, reassurance, cognitive behavioural therapy, anxiolytic if needed, psychiatric follow-up",
      },
    ],
    source: "Hutchison Ch 2-3 (clinical reasoning) — CSO-signed",
  },
  {
    code: "dyspnoea",
    display: "Breathlessness / dyspnoea",
    triggerCodes: ["dyspnoea", "exertional_dyspnoea"],
    problemReprHint:
      'Acute or subacute dyspnoea — frame as a multi-system differential anchored on speed of onset (sudden → mechanical/vascular; gradual → pulmonary/cardiac/metabolic). Discriminate based on exertional tolerance, orthopnoea/PND, wheeze, pleuritic features, fever/cough, and leg/chest pain. Always rule out PE, tension pneumothorax, pulmonary oedema, ACS-equivalent, anaphylaxis, and severe asthma before attributing to "simple" diagnoses.',
    differential: [
      {
        dx: "Asthma / COPD",
        likelihood: "likely",
        ruleIn: [
          "wheeze on history or exam",
          "exertional dyspnoea",
          "known asthma or chronic smoking",
          "reduced exertional tolerance",
        ],
        ruleOut: [
          "fever and productive cough (suggests infection)",
          "orthopnoea and PND (suggests HF)",
          "pleuritic pain (suggests PE or pneumonia)",
        ],
      },
      {
        dx: "Heart failure",
        likelihood: "likely",
        ruleIn: [
          "orthopnoea",
          "paroxysmal nocturnal dyspnoea (PND)",
          "ankle swelling",
          "gradual onset",
          "known cardiac history",
        ],
        ruleOut: [
          "wheeze as sole feature (asthma)",
          "unilateral pleuritic pain (PE)",
          "productive cough without orthopnoea",
        ],
      },
      {
        dx: "Pneumonia",
        likelihood: "likely",
        ruleIn: ["fever", "cough", "purulent/coloured sputum", "pleuritic pain", "tachypnoea"],
        ruleOut: ["orthopnoea without fever (HF)", "wheeze without fever (asthma/COPD)"],
      },
      {
        dx: "Anaemia",
        likelihood: "likely",
        ruleIn: [
          "dyspnoea on exertion",
          "pallor",
          "weight loss and poor appetite",
          "no fever or chest symptoms",
        ],
        ruleOut: [
          "acute severe dyspnoea at rest (pneumothorax/PE/oedema)",
          "wheeze (asthma/COPD)",
          "fever (infection)",
        ],
      },
      {
        dx: "Anxiety",
        likelihood: "likely",
        ruleIn: [
          "gradual onset",
          "absent objective findings",
          "known anxiety disorder",
          "tachypnoea out of proportion to hypoxia",
        ],
        ruleOut: ["SpO2 <92%", "RR ≥25 with objective exam findings", "red-flag features present"],
      },
      {
        dx: "Pulmonary embolism",
        likelihood: "must_not_miss",
        ruleIn: [
          "sudden onset",
          "pleuritic chest pain",
          "leg pain or unilateral calf swelling (DVT)",
          "tachycardia",
          "risk factors: recent surgery, immobility, malignancy, OCP",
        ],
        ruleOut: [
          "fever (favours pneumonia)",
          "wheeze (asthma/COPD)",
          "productive cough with sputum",
        ],
      },
      {
        dx: "Tension pneumothorax",
        likelihood: "must_not_miss",
        ruleIn: [
          "sudden-onset dyspnoea",
          "severe distress",
          "unilateral reduced/absent breath sounds",
          "tracheal deviation (late sign)",
          "hypotension",
        ],
        ruleOut: ["gradual onset over days (pneumonia/HF)", "fever (infection)", "orthopnoea (HF)"],
      },
      {
        dx: "Acute pulmonary oedema",
        likelihood: "must_not_miss",
        ruleIn: [
          "acute onset",
          "orthopnoea",
          "pink/frothy sputum",
          "crackles on auscultation",
          "raised JVP",
          "known cardiac history",
        ],
        ruleOut: [
          "wheeze without crackles (asthma)",
          "fever-driven tachypnoea (pneumonia)",
          "unilateral findings (pneumothorax)",
        ],
      },
      {
        dx: "ACS-equivalent (acute coronary syndrome or myocardial infarction with dyspnoea as anginal equivalent)",
        likelihood: "must_not_miss",
        ruleIn: [
          "chest discomfort or pressure",
          "dyspnoea on exertion",
          "risk factors: age, smoking, diabetes, hypertension",
          "tachycardia",
        ],
        ruleOut: ["pleuritic pain (PE/pneumonia)", "wheeze (asthma)", "unilateral findings"],
      },
      {
        dx: "Anaphylaxis",
        likelihood: "must_not_miss",
        ruleIn: [
          "acute onset dyspnoea",
          "urticaria or angioedema",
          "hypotension",
          "recent exposure (food, drug, sting)",
          "stridor or wheeze",
        ],
        ruleOut: ["insidious onset over days (pneumonia/HF)", "fever without exposure history"],
      },
      {
        dx: "Severe asthma (acute severe exacerbation / status asthmaticus)",
        likelihood: "must_not_miss",
        ruleIn: [
          "known asthma",
          "wheeze",
          "exhaustion or silent chest",
          "peak flow reduction",
          "SpO2 <92%",
          "RR ≥25",
        ],
        ruleOut: ["fever (suggests infection)", "unilateral findings (pneumothorax)"],
      },
    ],
    discriminatingHpc: [
      "Onset (sudden → PE, pneumothorax, anaphylaxis, ACS; gradual → HF, COPD, anaemia, pneumonia)",
      "Exertional tolerance (reduced capacity → HF, anaemia, ACS; normal capacity → anxiety, local pathology)",
      "Orthopnoea and paroxysmal nocturnal dyspnoea (PND) — heart failure signature",
      "Wheeze (asthma, COPD, anaphylaxis, acute pulmonary oedema)",
      "Pleuritic pain ± haemoptysis (PE, pneumonia, pneumothorax)",
      "Fever + cough + sputum character (pneumonia, less so asthma/COPD unless secondary infection)",
      "Chest pain or discomfort (ACS-equivalent, PE, pneumonia, pneumothorax)",
      "Leg pain, calf swelling, or immobility history (DVT → PE)",
      "Palpitations (ACS, PE, arrhythmia secondary to hypoxia)",
      "Ankle swelling and weight gain (HF)",
      "Weight loss and poor appetite (anaemia, malignancy, chronic infection)",
      "Exposure history or triggers (anaphylaxis, occupational asthma/COPD)",
    ],
    associated: [
      "Chest pain (ACS, PE, pneumonia, pneumothorax, pleurisy)",
      "Palpitations (ACS, PE, secondary arrhythmia from hypoxia)",
      "Ankle swelling and dependent oedema (HF)",
      "Leg pain or unilateral calf swelling (DVT → PE risk)",
      "Fever (pneumonia, sepsis secondary to infection, anaphylaxis if toxin-mediated)",
      "Weight loss and poor appetite (anaemia, malignancy, chronic infection, HF)",
      "Urticaria or angioedema (anaphylaxis, allergy-driven wheeze)",
      "Cough and sputum production (pneumonia, HF with pulmonary oedema, asthma)",
      "Pink/frothy sputum (acute pulmonary oedema, HF)",
    ],
    redFlags: [
      "SpO2 <92% on room air — emergency",
      "RR ≥25 — tachypnoea indicates severity",
      "Exhaustion or silent chest (no wheeze despite asthma history) — severe asthma, fatigue",
      "Cyanosis — severe hypoxia",
      "Hypotension — cardiogenic shock (acute oedema, ACS), tension pneumothorax, anaphylaxis, septic shock",
      "Stridor or upper-airway compromise — anaphylaxis, airway obstruction",
      "Unilateral absent breath sounds ± tracheal deviation — tension pneumothorax",
      "Altered mental status — hypoxia, shock, sepsis",
      "Severe distress or exhaustion — imminent respiratory failure",
    ],
    examTargets: [
      {
        area: "General",
        sign: "Work of breathing, use of accessory muscles, exhaustion",
        discriminates:
          "Severity; silent chest in asthma is a red flag; accessory muscle use in anxiety is mild; severe distress in PE/pneumothorax/oedema",
      },
      {
        area: "Vital signs",
        sign: "SpO2, RR, HR, BP",
        discriminates:
          "SpO2 <92% and RR ≥25 are escalation markers; hypotension → shock (PE, oedema, anaphylaxis, ACS); tachycardia in anxiety vs. PE/ACS",
      },
      {
        area: "Trachea",
        sign: "Midline vs. deviated",
        discriminates: "Tracheal deviation (late sign of tension pneumothorax)",
      },
      {
        area: "Percussion",
        sign: "Resonant vs. dull vs. hyperresonant",
        discriminates:
          "Hyperresonance → pneumothorax; dullness → consolidation (pneumonia) or effusion (HF/PE)",
      },
      {
        area: "Breath sounds",
        sign: "Bilateral wheeze, unilateral reduction/absence, crackles",
        discriminates:
          "Bilateral wheeze → asthma/COPD/anaphylaxis; unilateral absence → pneumothorax/pneumonia; crackles → oedema (HF) or pneumonia",
      },
      {
        area: "Heart sounds",
        sign: "Gallop rhythm (S3), elevated JVP, pulsus paradoxus",
        discriminates:
          "S3 gallop and elevated JVP → HF; pulsus paradoxus in asthma (pulsus >10 mmHg drop on inspiration = severe exacerbation)",
      },
      {
        area: "Jugular venous pressure (JVP)",
        sign: "Height and waveform",
        discriminates:
          "Elevated JVP → HF, PE (acute RV strain), tension pneumothorax; prominent CV waves (HF)",
      },
      {
        area: "Ankle and lower limb",
        sign: "Oedema, calf tenderness, unilateral swelling",
        discriminates: "Bilateral ankle oedema → HF; unilateral calf swelling/pain → DVT (PE risk)",
      },
      {
        area: "Pallor",
        sign: "Skin, conjunctival pallor",
        discriminates: "Anaemia; pale, sweaty in ACS/shock",
      },
    ],
    historyEmphasis: [
      "Smoking history (COPD, ACS, lung cancer/malignancy → anaemia, asthma exacerbations)",
      "Known respiratory disease (asthma, COPD, interstitial lung disease)",
      "Known cardiac disease (HF, prior MI, arrhythmia; ACS risk in dyspnoea)",
      "VTE risk factors: recent surgery, immobility (bed rest, long flights), active malignancy, oral contraceptive use (OCP), thrombophilia",
      "Occupational or environmental exposure (asbestos, dusts, chemical fumes → COPD/asthma)",
      "Recent infections or systemic illness (anaemia from chronic infection, acute pneumonia, sepsis)",
      "Medication history (OCP → VTE risk; immunosuppression → opportunistic infection; cardiac meds → compliance, HF control)",
    ],
    combinations: [
      {
        features: [
          "sudden onset",
          "unilateral absent breath sounds",
          "tracheal deviation",
          "hypotension",
        ],
        suggests: "Tension pneumothorax",
        action:
          "Immediate needle decompression (2nd ICS midclavicular line); emergency chest tube; do not delay for imaging",
      },
      {
        features: ["acute onset", "orthopnoea", "pink/frothy sputum", "crackles", "elevated JVP"],
        suggests: "Acute pulmonary oedema (HF decompensation or ACS-triggered)",
        action:
          "Sit upright; assess for ACS (ECG, troponin); diuretics and vasodilators; supplemental O2; consider ICU",
      },
      {
        features: [
          "sudden onset",
          "pleuritic pain",
          "leg swelling/calf pain",
          "tachycardia",
          "low-normal SpO2",
        ],
        suggests: "Pulmonary embolism (with or without DVT)",
        action:
          "Assess D-dimer and/or imaging (CT pulmonary angiography if Wells score elevated); anticoagulation if no contraindication",
      },
      {
        features: ["fever", "cough", "sputum production", "pleuritic pain", "tachypnoea"],
        suggests: "Pneumonia (bacterial, viral, or atypical)",
        action:
          "Chest X-ray; blood cultures; antibiotics (empiric, then narrow based on culture); supportive care",
      },
      {
        features: [
          "wheeze",
          "reduced exertional tolerance",
          "known asthma/COPD",
          "trigger exposure",
        ],
        suggests: "Asthma or COPD exacerbation",
        action:
          "Peak flow or spirometry; inhaled bronchodilators (SABA); corticosteroids; assess for red-flag features (silent chest, SpO2 <92%)",
      },
      {
        features: ["orthopnoea", "PND", "ankle oedema", "elevated JVP", "S3 gallop", "weight gain"],
        suggests: "Heart failure decompensation",
        action:
          "ECG, troponin, BNP/NT-proBNP, chest X-ray; diuretics; ACE inhibitors/ARBs; address underlying cause",
      },
      {
        features: [
          "exertional dyspnoea",
          "pallor",
          "weight loss",
          "poor appetite",
          "no fever/chest symptoms",
        ],
        suggests: "Anaemia",
        action:
          "Full blood count; ferritin, B12, folate; reticulocyte count; assess for occult bleeding or haemolysis",
      },
      {
        features: [
          "acute onset",
          "urticaria/angioedema",
          "stridor",
          "hypotension",
          "recent exposure",
        ],
        suggests: "Anaphylaxis",
        action:
          "Intramuscular epinephrine (0.3–0.5 mL of 1:1000 immediately); IV access; antihistamines; corticosteroids; observation for biphasic reaction",
      },
      {
        features: [
          "chest discomfort/pressure",
          "dyspnoea on exertion",
          "risk factors (age, smoking, diabetes, hypertension)",
          "tachycardia",
        ],
        suggests: "ACS-equivalent (dyspnoea as anginal equivalent in MI)",
        action:
          "ECG immediately; troponin serial; continuous cardiac monitoring; aspirin (if not contraindicated); consider revascularisation",
      },
      {
        features: [
          "wheeze",
          "exhaustion",
          "silent chest",
          "peak flow reduction",
          "SpO2 <92%",
          "RR ≥25",
        ],
        suggests: "Severe acute asthma / status asthmaticus",
        action:
          "Continuous pulse oximetry; IM/IV corticosteroids; continuous nebulised bronchodilators; consider ICU/mechanical ventilation if failing",
      },
    ],
    source: "Hutchison Ch 2-3 (clinical reasoning) — CSO-signed",
  },
  {
    code: "headache",
    display: "Headache",
    triggerCodes: ["headache"],
    problemReprHint:
      'Headache is a common presenting complaint with broad differentials ranging from benign (tension, migraine, sinusitis) to immediately life-threatening (SAH, meningitis, raised ICP). CRITICAL: In patients with known migraine, always actively ask "is this different from your usual headache?" as new headaches in chronic migraineurs can mask serious pathology like SAH. Frame the assessment around discriminating history (thunderclap onset, fever + neck stiffness, focal neurology, age, immunocompromise) and escalation features. Decision support broadens the differential — clinician judgment determines diagnosis.',
    differential: [
      {
        dx: "Tension-type headache",
        likelihood: "likely",
        ruleIn: [
          "bilateral, pressing quality",
          "absence of nausea/vomiting",
          "absence of photophobia",
          "muscle tension on palpation",
          "normal neurology",
        ],
        ruleOut: [
          "thunderclap/sudden onset",
          "fever",
          "focal neurological deficit",
          "papilloedema",
          "new pattern in older patient",
        ],
      },
      {
        dx: "Migraine",
        likelihood: "likely",
        ruleIn: [
          "unilateral throbbing quality",
          "photophobia/nausea/vomiting",
          "aura preceding headache",
          "known migraine history",
          "duration 4–72 hours",
        ],
        ruleOut: [
          "thunderclap onset",
          "fever + neck stiffness",
          "focal weakness/numbness",
          "new headache pattern (if chronic migraineur)",
        ],
      },
      {
        dx: "Medication-overuse headache",
        likelihood: "likely",
        ruleIn: [
          "frequent analgesic use (>10–15 days/month)",
          "daily or near-daily headache",
          "history of migraine or tension-type treated with medication",
          "improvement on medication withdrawal",
        ],
        ruleOut: ["thunderclap onset", "fever", "acute focal deficit", "papilloedema"],
      },
      {
        dx: "Sinusitis",
        likelihood: "likely",
        ruleIn: [
          "facial pain/pressure over sinuses",
          "nasal congestion/rhinorrhoea",
          "maxillary/frontal tenderness",
          "recent upper respiratory infection",
          "fever (if acute)",
        ],
        ruleOut: [
          "thunderclap onset",
          "neck stiffness",
          "focal neurological deficit",
          "papilloedema",
        ],
      },
      {
        dx: "Cervicogenic headache",
        likelihood: "likely",
        ruleIn: [
          "neck pain/stiffness",
          "unilateral headache",
          "triggered by neck movement",
          "tension on cervical muscles",
          "restricted neck range of motion",
        ],
        ruleOut: [
          "thunderclap onset",
          "fever + neck stiffness (meningism)",
          "focal deficit",
          "papilloedema",
          "sudden severe onset",
        ],
      },
      {
        dx: "Subarachnoid haemorrhage",
        likelihood: "must_not_miss",
        ruleIn: [
          "thunderclap — maximal at onset (pathognomonic)",
          "worst headache of life",
          "sudden severe onset",
          "neck stiffness (meningism from blood)",
          "photophobia",
          "focal neurological deficit",
          "seizure",
          "loss of consciousness",
          "history of aneurysm, vasculitis, recent trauma",
        ],
        ruleOut: [
          "gradual onset",
          "known benign migraine (but SAH can hide behind migraine label in chronic migraineurs)",
        ],
      },
      {
        dx: "Meningitis/encephalitis",
        likelihood: "must_not_miss",
        ruleIn: [
          "fever",
          "neck stiffness (Kernig sign positive)",
          "photophobia",
          "altered consciousness/confusion",
          "rash (meningococcal non-blanching petechial/purpuric)",
          "seizure",
          "focal neurological deficit",
          "nausea/vomiting",
        ],
        ruleOut: [
          "clear sensorium (unless encephalitis)",
          "no fever",
          "no rash",
          "absence of neck stiffness",
        ],
      },
      {
        dx: "Raised intracranial pressure / space-occupying lesion (tumour, abscess, haematoma)",
        likelihood: "must_not_miss",
        ruleIn: [
          "worse on waking",
          "worse on coughing/straining/lying flat",
          "vomiting (often projectile, without nausea)",
          "progressive/worsening pattern",
          "focal neurological deficit",
          "papilloedema on fundoscopy",
          "seizure",
          "personality change/cognitive decline",
          "brainstem signs (if herniation)",
          "history of malignancy, immunosuppression, recent head trauma",
        ],
        ruleOut: [
          "normal fundoscopy (papilloedema absent)",
          "normal neurology",
          "stable/improving headache",
          "clear sensorium",
        ],
      },
      {
        dx: "Giant cell arteritis (temporal arteritis)",
        likelihood: "must_not_miss",
        ruleIn: [
          "age >50 years",
          "temporal headache",
          "jaw claudication (pain on chewing)",
          "visual loss/amaurosis fugax (risk of permanent blindness)",
          "scalp tenderness",
          "temporal artery tenderness/thickening/pulselessness",
          "systemic symptoms (malaise, weight loss, polymyalgia rheumatica)",
          "elevated ESR/CRP",
        ],
        ruleOut: [
          "age <50 (rare but possible)",
          "no temporal artery abnormality",
          "no visual symptoms",
          "normal ESR/CRP",
        ],
      },
      {
        dx: "Malignant hypertension",
        likelihood: "must_not_miss",
        ruleIn: [
          "severely elevated BP (systolic >180, diastolic >120 mmHg)",
          "headache (often severe/occipital)",
          "visual disturbance/visual loss",
          "focal neurological deficit",
          "seizure",
          "altered consciousness",
          "signs of end-organ damage (proteinuria, acute kidney injury, pulmonary oedema)",
        ],
        ruleOut: [
          "BP in normal/acceptable range",
          "no end-organ features",
          "no acute vision change",
        ],
      },
      {
        dx: "Cerebral venous sinus thrombosis",
        likelihood: "must_not_miss",
        ruleIn: [
          "progressive headache over days",
          "focal neurological deficit",
          "seizure",
          "papilloedema",
          "may present as increased ICP/space-occupying lesion",
          "risk factors: hypercoagulable state, malignancy, infection, oral contraceptives, dehydration, pregnancy/postpartum",
        ],
        ruleOut: ["thunderclap (usually gradual)", "no seizure", "normal neurology"],
      },
      {
        dx: "Cerebral malaria (Uganda context)",
        likelihood: "must_not_miss",
        ruleIn: [
          "fever",
          "headache",
          "altered consciousness/confusion",
          "seizure",
          "focal neurological deficit",
          "in endemic area (Uganda)",
          "positive malaria screen (thick film, RDT, PCR)",
          "may have associated features (jaundice, renal failure, anaemia)",
        ],
        ruleOut: ["negative malaria screen", "no fever", "clear sensorium"],
      },
    ],
    discriminatingHpc: [
      "Is this thunderclap — maximal at onset, or sudden catastrophic onset? (SAH)",
      "Is there fever + neck stiffness + photophobia? (meningitis/encephalitis)",
      "Is it worse on waking, worse on coughing/lying flat, with vomiting? (raised ICP)",
      "Is it unilateral throbbing, with aura, photophobia, nausea? (migraine)",
      "Is it temporal with jaw claudication or visual loss, age >50? (GCA)",
      "Is this a NEW or CHANGED headache pattern? Especially: is this different from your usual migraine (if chronic migraineur)? (new sinister diagnosis)",
      "Are there focal weakness, numbness, seizure, or personality change? (structural/serious pathology)",
      "Is there a rash (non-blanching petechial/purpuric)? (meningococcal meningitis)",
      "Recent infection, head trauma, or anticoagulation? (SAH, venous thrombosis, bleeding)",
      "Immunocompromised, HIV, malignancy, or recent chemotherapy? (opportunistic, CVST, secondary pathology)",
    ],
    associated: [
      "Visual disturbance (amaurosis fugax, loss of vision → GCA, malignant hypertension, space-occupying lesion)",
      "Focal weakness/numbness (focal neurological deficit → structural lesion, SAH, meningitis, stroke, CVST)",
      "Seizure (raised ICP, meningitis, cerebral malaria, CVST, SAH)",
      "Fever (meningitis, encephalitis, cerebral malaria, sinusitis, systemic infection)",
      "Rash — non-blanching petechial or purpuric (meningococcal meningitis)",
      "Jaw claudication (giant cell arteritis — risk of blindness)",
      "Nausea/vomiting (migraine, raised ICP, meningitis, SAH, malignant hypertension)",
      "Altered consciousness/confusion (meningitis, encephalitis, cerebral malaria, SAH, malignant hypertension, raised ICP)",
    ],
    redFlags: [
      "Thunderclap onset (SAH until proven otherwise)",
      "Fever + neck stiffness (meningitis/encephalitis)",
      "Focal neurological deficit (structural lesion, stroke, SAH, meningitis)",
      "Papilloedema on fundoscopy (raised ICP, CVST)",
      "New headache in patient aged >50 (GCA, malignancy, SAH)",
      "Headache in immunocompromised or cancer patient (opportunistic infection, meningitis, CVST, secondary malignancy)",
      "Progressive/worsening headache pattern",
      "Headache positional (worse lying flat/on waking → raised ICP, CVST)",
      "Seizure associated with headache",
      "Personality change, cognitive decline, altered behaviour",
      "Papilloedema + focal deficit (herniation risk)",
      "Severe hypertension (>180/120) with headache + visual disturbance (malignant hypertension)",
      "Non-blanching rash + fever + neck stiffness (meningococcal sepsis)",
    ],
    examTargets: [
      {
        area: "General consciousness & mental state",
        sign: "GCS score <15, confusion, drowsiness, personality change",
        discriminates:
          "raises suspicion of meningitis, encephalitis, SAH, raised ICP, cerebral malaria, malignant hypertension",
      },
      {
        area: "Neck",
        sign: "Neck stiffness, positive Kernig sign (inability to extend knee when hip flexed)",
        discriminates: "meningitis/encephalitis (meningism) vs. cervicogenic headache or tension",
      },
      {
        area: "Fundoscopy",
        sign: "Papilloedema (swollen optic disc, blurred margins), retinal haemorrhages, venous engorgement",
        discriminates:
          "raised ICP (space-occupying lesion, CVST, malignant hypertension) vs. benign headache",
      },
      {
        area: "Neurological system",
        sign: "Focal weakness, sensory level, cranial nerve palsies, hyperreflexia, extensor plantar response",
        discriminates:
          "focal structural lesion (SAH, tumour, stroke, CVST) vs. non-focal benign headache",
      },
      {
        area: "Temporal artery",
        sign: "Tenderness, thickening, pulselessness, scalp tenderness",
        discriminates:
          "giant cell arteritis vs. other headache causes (GCA is treatable; untreated → blindness)",
      },
      {
        area: "Blood pressure",
        sign: "Severely elevated BP (>180/120 mmHg), especially with headache + visual disturbance",
        discriminates: "malignant hypertension vs. primary headache disorder",
      },
      {
        area: "Skin",
        sign: "Non-blanching petechial or purpuric rash (meningococcal), blanching viral exanthem",
        discriminates:
          "meningococcal meningitis (medical emergency) vs. viral meningitis or other infection",
      },
      {
        area: "Fever assessment (if febrile)",
        sign: "Temperature, source (respiratory, ear, throat, abdomen), rigors, sweats",
        discriminates:
          "meningitis, encephalitis, cerebral malaria, sinusitis, other systemic infection",
      },
      {
        area: "Malaria screen (Uganda context)",
        sign: "Thick blood film, RDT, PCR positivity; jaundice, anaemia, thrombocytopaenia",
        discriminates:
          "cerebral malaria (common in Uganda) vs. other causes in febrile, altered patient",
      },
    ],
    historyEmphasis: [
      "Anticoagulation (warfarin, direct oral anticoagulant, heparin, aspirin) → increases risk of intracranial bleeding, SAH, CVST",
      "Immunosuppression/HIV (CD4 count if known) → opportunistic meningitis (TB, cryptococcal), CVST, malignancy",
      "Active malignancy or recent chemotherapy → CVST (hypercoagulable), secondary spread, leptomeningeal disease",
      "Recent infection (respiratory, ear, sinusitis, meningitis contact) → meningitis, encephalitis risk",
      "Age >50 → giant cell arteritis risk (especially with temporal/jaw symptoms), malignancy",
      "Recent head trauma or fall → subdural haematoma, epidural, SAH (even minor trauma in anticoagulated patients)",
      "Known aneurysm or previous SAH → recurrence risk",
      "Oral contraceptive use or pregnancy/postpartum → CVST risk",
      "CRITICAL — if chronic migraineur: 'Is this different from your usual migraine?' → SAH, new structural lesion can hide behind migraine label",
    ],
    combinations: [
      {
        features: [
          "Thunderclap onset",
          "worst headache of life",
          "neck stiffness",
          "focal neurological deficit",
        ],
        suggests: "Subarachnoid haemorrhage",
        action:
          "Urgent non-contrast CT head; if negative, proceed to lumbar puncture (xanthochromia); neurosurgery review",
      },
      {
        features: ["Fever", "neck stiffness", "photophobia", "confusion/altered consciousness"],
        suggests: "Meningitis (bacterial if acute with toxicity; viral if subacute)",
        action:
          "Blood cultures, urgent CSF examination (Gram stain, culture, PCR), empiric antibiotics pending results; isolation precautions",
      },
      {
        features: [
          "Fever",
          "headache",
          "altered consciousness",
          "seizure",
          "positive malaria screen",
        ],
        suggests: "Cerebral malaria (Uganda context)",
        action:
          "Malaria treatment (artemisinin derivative IV); supportive care; assess for complications (renal failure, anaemia); monitor neurological status",
      },
      {
        features: [
          "Worse on waking",
          "worse on coughing/lying flat",
          "projectile vomiting",
          "papilloedema",
          "focal deficit or seizure",
        ],
        suggests:
          "Raised intracranial pressure — space-occupying lesion (tumour, haematoma, abscess), cerebral oedema",
        action:
          "Urgent neuroimaging (CT or MRI head); neurosurgery review if mass or herniation sign; consider dexamethasone if brain oedema; address cause",
      },
      {
        features: [
          "Age >50",
          "temporal headache",
          "jaw claudication",
          "visual loss (amaurosis fugax) or visual disturbance",
        ],
        suggests: "Giant cell arteritis (temporal arteritis)",
        action:
          "ESR/CRP, temporal artery palpation/Doppler or biopsy; urgent high-dose corticosteroids to prevent blindness; rheumatology review",
      },
      {
        features: [
          "Severely elevated BP (>180/120)",
          "headache",
          "visual disturbance",
          "focal neurological deficit",
          "signs of end-organ damage",
        ],
        suggests: "Malignant hypertension (hypertensive emergency)",
        action:
          "Urgent IV antihypertensive agents (e.g., labetalol, hydralazine, nicardipine); monitor for hypertensive encephalopathy; address underlying cause; ICU care",
      },
      {
        features: [
          "Unilateral throbbing headache",
          "photophobia",
          "nausea/vomiting",
          "aura (visual, sensory, motor)",
          "no fever, no neck stiffness, normal neurology",
        ],
        suggests: "Migraine",
        action:
          "Confirm typical migraine pattern; initiate acute treatment (triptan, NSAID, antiemetic); consider preventive therapy if frequent; rule out red flags",
      },
      {
        features: ["Chronic migraineur", "presents with NEW or DIFFERENT headache"],
        suggests:
          "Must rule out secondary causes (SAH, CVST, meningitis, structural lesion) before attributing to migraine",
        action:
          "ACTIVE escalation pathway: ask 'is this different from usual?'; if YES or any red flags → neuroimaging; do NOT assume another migraine",
      },
    ],
    source: "Hutchison Ch 2-3 (clinical reasoning) — CSO-signed",
  },
  {
    code: "abdominal_pain",
    display: "Abdominal pain",
    triggerCodes: ["abdominal_pain"],
    problemReprHint:
      "Abdominal pain localised by site, radiation, colicky vs constant character; discriminated by associated features (fever, vomiting, bowel/urinary change, pregnancy), red-flag stability/peritonism, and hypothesis-driven exam. Differential is broad and region-dependent; rule out immediately dangerous conditions (ruptured AAA, perforation, bowel obstruction/ischaemia, ectopic pregnancy, acute pancreatitis) alongside common causes. Decision-support only; clinical examination and imaging drive diagnosis.",
    differential: [
      {
        dx: "Gastritis / peptic ulcer disease",
        likelihood: "likely",
        ruleIn: [
          "epigastric site",
          "constant character",
          "relation to food (relief or worsening)",
          "NSAIDs history",
        ],
        ruleOut: ["peritonism", "pulsatile mass", "radiation to back", "haemodynamic instability"],
      },
      {
        dx: "Biliary colic / cholecystitis",
        likelihood: "likely",
        ruleIn: [
          "right upper quadrant site",
          "colicky character",
          "possible radiation to back/right shoulder",
        ],
        ruleOut: ["peritonism", "fever (if colic)", "jaundice (acute colic)"],
      },
      {
        dx: "Renal colic",
        likelihood: "likely",
        ruleIn: ["loin-to-groin radiation", "colicky character", "urinary symptoms", "haematuria"],
        ruleOut: ["fever", "peritonism", "haemodynamic instability"],
      },
      {
        dx: "Gastroenteritis",
        likelihood: "likely",
        ruleIn: [
          "generalised or periumbilical pain",
          "vomiting",
          "diarrhoea",
          "fever (variable)",
          "recent food/travel history",
        ],
        ruleOut: ["peritonism", "bloody diarrhoea (alarm)", "severe dehydration signs"],
      },
      {
        dx: "Constipation",
        likelihood: "likely",
        ruleIn: ["diffuse/lower abdominal pain", "reduced bowel frequency", "no peritonism"],
        ruleOut: [
          "absolute constipation + vomiting (obstruction red flag)",
          "palpable mass",
          "peritonism",
        ],
      },
      {
        dx: "Urinary tract infection",
        likelihood: "likely",
        ruleIn: ["dysuria", "urinary frequency/urgency", "suprapubic/flank discomfort", "fever"],
        ruleOut: [
          "peritonism",
          "loin tenderness (severe pyelonephritis)",
          "haemodynamic instability",
        ],
      },
      {
        dx: "Gynaecological (women)",
        likelihood: "likely",
        ruleIn: [
          "reproductive-age woman",
          "lower/pelvic pain",
          "LMP status",
          "vaginal symptoms",
          "pregnancy risk",
        ],
        ruleOut: ["peritonism (if uncomplicated)", "haemodynamic instability (if uncomplicated)"],
      },
      {
        dx: "Musculoskeletal",
        likelihood: "likely",
        ruleIn: [
          "focal anterior wall tenderness",
          "pain with movement/posture",
          "reproducible on palpation",
          "no peritonism",
        ],
        ruleOut: ["peritonism", "systemic symptoms", "radiation pattern"],
      },
      {
        dx: "Ruptured abdominal aortic aneurysm",
        likelihood: "must_not_miss",
        ruleIn: [
          "epigastric or loin pain radiating to back",
          "pulsatile/expansile mass",
          "haemodynamic instability",
          "shock",
          "vascular risk factors",
        ],
        ruleOut: ["stable vitals", "no pulsatile mass"],
      },
      {
        dx: "Perforation / peritonitis",
        likelihood: "must_not_miss",
        ruleIn: [
          "acute severe pain",
          "peritonism (guarding, rebound, rigidity)",
          "haemodynamic instability",
          "absolute vomiting",
          "prior peptic ulcer/NSAIDs",
        ],
        ruleOut: ["mild localised tenderness without peritonism"],
      },
      {
        dx: "Bowel obstruction",
        likelihood: "must_not_miss",
        ruleIn: [
          "absolute constipation + vomiting",
          "colicky pain",
          "abdominal distension",
          "absent bowel sounds",
          "prior abdominal surgery (adhesions)",
        ],
        ruleOut: ["passage of stool/flatus", "soft abdomen", "active bowel sounds"],
      },
      {
        dx: "Bowel ischaemia",
        likelihood: "must_not_miss",
        ruleIn: [
          "severe pain out of proportion to exam",
          "haemodynamic instability",
          "bloody diarrhoea",
          "shock",
          "vascular/cardiac risk factors",
        ],
        ruleOut: ["mild pain", "stable vitals", "no peritonism"],
      },
      {
        dx: "Ectopic pregnancy",
        likelihood: "must_not_miss",
        ruleIn: [
          "reproductive-age woman",
          "positive or unknown pregnancy status",
          "lower abdominal/pelvic pain",
          "haemodynamic instability",
          "shock",
          "vaginal bleeding/spotting",
        ],
        ruleOut: ["negative beta-hCG", "intrauterine pregnancy confirmed", "stable haemodynamics"],
      },
      {
        dx: "Acute pancreatitis",
        likelihood: "must_not_miss",
        ruleIn: [
          "epigastric pain radiating to back",
          "severe constant pain",
          "vomiting",
          "elevated lipase",
          "alcohol/triglyceride history",
        ],
        ruleOut: ["normal lipase", "no radiation to back", "no vomiting"],
      },
      {
        dx: "Appendicitis",
        likelihood: "must_not_miss",
        ruleIn: [
          "right iliac fossa pain",
          "migration from periumbilicus",
          "fever",
          "anorexia",
          "guarding at McBurney's point",
          "prior atypical presentations",
        ],
        ruleOut: ["left iliac fossa site", "no fever", "no peritonism"],
      },
      {
        dx: "Inferior myocardial infarction",
        likelihood: "must_not_miss",
        ruleIn: [
          "epigastric/upper abdominal discomfort",
          "cardiac risk factors",
          "associated chest symptoms",
          "ECG changes",
          "dyspnoea/diaphoresis",
        ],
        ruleOut: ["no cardiac history", "no ECG changes", "reproducible tenderness"],
      },
      {
        dx: "Diabetic ketoacidosis",
        likelihood: "must_not_miss",
        ruleIn: [
          "generalised abdominal pain",
          "known/new-onset diabetes",
          "vomiting",
          "hyperventilation (Kussmaul)",
          "altered consciousness",
          "metabolic acidosis",
        ],
        ruleOut: ["normal blood glucose", "normal venous/arterial pH", "no diabetes"],
      },
    ],
    discriminatingHpc: [
      "Site of pain (localised region: epigastric, RUQ, loin, RIF, periumbilical, lower/pelvic, diffuse)",
      "Radiation (loin-to-groin renal colic pattern; epigastric to back pancreatitis/AAA; right shoulder biliary; none)",
      "Character (colicky vs constant; sharp vs dull; burning vs crampy)",
      "Onset (sudden vs gradual; acute vs subacute)",
      "Relation to food (relief/worsening; timing relative to meals)",
      "Relation to movement/posture (worse with movement, better with rest; positional changes)",
      "Vomiting (presence, onset, bilious vs non-bilious; absolute vomiting)",
      "Bowel habit change (diarrhoea, constipation, absolute constipation, blood/mucus)",
      "Urinary symptoms (dysuria, frequency, urgency, haematuria)",
      "Last menstrual period + pregnancy status (beta-hCG if reproductive-age woman)",
      "Associated fever (presence, height, timeline relative to pain onset)",
      "Alcohol history (pancreatitis risk)",
      "NSAID use (PUD/perforation risk)",
      "Prior abdominal surgery (adhesions, obstruction risk)",
    ],
    associated: [
      "Fever",
      "Vomiting (bilious vs non-bilious)",
      "Bowel habit and character (constipation, diarrhoea, haematochezia, melaena)",
      "Urinary symptoms (dysuria, frequency, urgency, haematuria)",
      "LMP and pregnancy status (positive/unknown/negative beta-hCG)",
      "Vaginal bleeding or spotting (gynaecological/ectopic)",
      "GI bleeding (haematemesis, melaena, haematochezia)",
      "Jaundice (biliary/hepatic)",
      "Back or flank pain (pancreatitis, AAA, renal colic)",
      "Shock/haemodynamic instability (early sign of major pathology)",
    ],
    redFlags: [
      "Peritonism (guarding, rebound tenderness, rigidity)",
      "Haemodynamic instability (hypotension, tachycardia, shock)",
      "Pulsatile abdominal mass (AAA)",
      "GI bleeding (haematemesis, melaena)",
      "Pregnancy + shock (ectopic pregnancy until proven otherwise)",
      "Absolute constipation + vomiting (bowel obstruction)",
      "Severe pain out of proportion to exam findings (bowel ischaemia)",
      "Absent bowel sounds (obstruction/paralytic ileus)",
    ],
    examTargets: [
      {
        area: "Vitals",
        sign: "Heart rate, blood pressure, respiratory rate, temperature, oxygen saturation",
        discriminates:
          "Haemodynamic instability or shock (AAA, ruptured ectopic, peritonitis, bowel ischaemia); fever (infection: appendicitis, cholecystitis, gastroenteritis, pyelonephritis, peritonitis)",
      },
      {
        area: "Abdomen inspection",
        sign: "Distension, surgical scars, visible masses, erythema, hernias",
        discriminates:
          "Obstruction (distension); prior surgery (adhesions); palpable mass (appendicitis, gynaecological mass)",
      },
      {
        area: "Abdomen palpation",
        sign: "Peritonism (guarding, rebound, rigidity), focal tenderness, organomegaly, pulsatile/expansile mass, hernias",
        discriminates:
          "Peritonitis (perforation, appendicitis) vs localised; AAA (pulsatile mass); hepatomegaly/splenomegaly (haemolysis, infection); inguinal hernia",
      },
      {
        area: "RUQ tenderness",
        sign: "Murphy's sign (inspiratory pause on RUQ palpation), guarding",
        discriminates: "Biliary colic vs cholecystitis (fever + peritonism)",
      },
      {
        area: "RIF tenderness",
        sign: "McBurney's point tenderness, Rovsing sign, guarding, rebound",
        discriminates: "Appendicitis (classic site + peritonism + fever)",
      },
      {
        area: "Costovertebral angle",
        sign: "Loin-to-groin tenderness, CVA tenderness on percussion",
        discriminates: "Renal colic/pyelonephritis vs other loin pain",
      },
      {
        area: "Bowel sounds",
        sign: "Presence, character (high-pitched/tinkling vs absent), frequency",
        discriminates:
          "Obstruction (absent or high-pitched early); peritonitis (absent); normal (gastroenteritis, PUD, constipation)",
      },
      {
        area: "Per rectum (if indicated)",
        sign: "Faecal impaction, blood, masses, tenderness, prostate",
        discriminates: "Faecal impaction (constipation); lower GI bleeding; lower abdominal mass",
      },
      {
        area: "Pregnancy assessment",
        sign: "Beta-hCG (serum), uterine tenderness, adnexal mass, haemodynamic stability",
        discriminates:
          "Ectopic pregnancy (positive hCG + instability + pain); intrauterine pregnancy; early miscarriage; normal pregnancy",
      },
      {
        area: "Pelvic exam (women, if indicated)",
        sign: "Cervical motion tenderness, adnexal mass, rebound, discharge, bleeding",
        discriminates: "Ectopic pregnancy, pelvic inflammatory disease, ovarian pathology",
      },
    ],
    historyEmphasis: [
      "Last menstrual period (LMP) and pregnancy status (critical for reproductive-age women; positive beta-hCG rules out ectopic only if intrauterine confirmed)",
      "Prior abdominal surgery (adhesions → obstruction risk)",
      "Alcohol consumption (pancreatitis risk)",
      "NSAID use (peptic ulcer, perforation risk)",
      "Diabetes mellitus (DKA risk; ischaemic heart disease → inferior MI)",
      "Vascular risk factors (AAA: smoking, hypertension, older age)",
      "Cardiac history (inferior MI can present as epigastric pain)",
      "Immune status (immunocompromised → atypical presentations)",
    ],
    combinations: [
      {
        features: ["Loin-to-groin radiation", "colicky pain", "haematuria/urinary symptoms"],
        suggests: "Renal colic",
        action: "Urinalysis + urea/creatinine; imaging (ultrasound/CT) if indicated; analgesia",
      },
      {
        features: ["Epigastric pain radiating to back", "vomiting", "severe constant character"],
        suggests: "Acute pancreatitis",
        action:
          "Serum lipase/amylase; withhold oral intake; IV fluids; imaging if diagnosis unclear",
      },
      {
        features: ["RUQ pain", "colicky character", "post-prandial onset"],
        suggests: "Biliary colic",
        action:
          "Ultrasound abdomen; urinalysis to rule out renal colic; monitor for cholecystitis (fever, peritonism)",
      },
      {
        features: ["RIF pain", "fever", "peritonism at McBurney point"],
        suggests: "Appendicitis",
        action:
          "Blood cultures if septic; imaging (ultrasound/CT); surgical review; NBM pending assessment",
      },
      {
        features: [
          "Epigastric/epigastric-to-back pain",
          "pulsatile mass",
          "haemodynamic instability/shock",
        ],
        suggests: "Ruptured AAA",
        action:
          "EMERGENCY: IV access (large bore), permissive hypotension, urgent vascular surgery, CT/bedside echo if stable enough",
      },
      {
        features: [
          "Acute severe pain",
          "peritonism (guarding/rebound/rigidity)",
          "haemodynamic instability",
        ],
        suggests: "Perforation / peritonitis",
        action:
          "EMERGENCY: NBM, IV fluids, broad-spectrum antibiotics, surgical review, CT/erect CXR if stable",
      },
      {
        features: [
          "Absolute constipation + vomiting",
          "abdominal distension",
          "absent bowel sounds",
        ],
        suggests: "Bowel obstruction",
        action:
          "EMERGENCY: NBM, IV fluids, NG tube if vomiting, CT abdomen/pelvis, surgical review",
      },
      {
        features: [
          "Severe pain out of proportion to exam",
          "haemodynamic instability",
          "bloody diarrhoea/shock",
        ],
        suggests: "Bowel ischaemia",
        action:
          "EMERGENCY: IV fluids, permissive hypotension, broad-spectrum antibiotics, urgent vascular/surgical review, CT angiography",
      },
      {
        features: [
          "Reproductive-age woman",
          "lower abdominal/pelvic pain",
          "positive/unknown pregnancy",
          "haemodynamic instability",
        ],
        suggests: "Ectopic pregnancy",
        action:
          "EMERGENCY: IV access, fluid resuscitation, urgent beta-hCG + transvaginal ultrasound, gynaecological/surgical review, OR availability",
      },
      {
        features: ["Epigastric discomfort", "cardiac risk factors", "ECG changes", "dyspnoea"],
        suggests: "Inferior myocardial infarction",
        action:
          "12-lead ECG urgently, cardiac biomarkers (troponin), continuous monitoring, cardiology review, aspirin (if not contraindicated)",
      },
      {
        features: [
          "Known/new diabetes",
          "generalised abdominal pain",
          "vomiting",
          "hyperventilation",
          "altered consciousness",
        ],
        suggests: "Diabetic ketoacidosis",
        action:
          "Blood glucose, venous/arterial blood gas, urinalysis (ketones), electrolytes, IV fluids, insulin, ICU/HDU level monitoring",
      },
      {
        features: ["Generalised or periumbilical pain", "vomiting", "diarrhoea", "fever"],
        suggests: "Gastroenteritis",
        action:
          "Supportive: fluid/electrolyte repletion, antiemetics if needed; stool culture/testing if bloody diarrhoea; rule out appendicitis if localisation",
      },
    ],
    source: "Hutchison Ch 2-3 (clinical reasoning) — CSO-signed",
  },
  {
    code: "palpitations",
    display: "Palpitations",
    triggerCodes: ["palpitations"],
    problemReprHint:
      "Palpitations are a subjective awareness of cardiac rhythm or rate. Frame as: is this a normal heart responding to a trigger (sinus tachycardia) or an abnormal rhythm? Is it benign or life-threatening? The differential is broad; always rule out structural disease and must-not-miss arrhythmias first.",
    differential: [
      {
        dx: "Sinus tachycardia (anxiety/fever/exertion)",
        likelihood: "likely",
        ruleIn: [
          "gradual onset and offset",
          "clear trigger (caffeine, anxiety, exercise, fever, anaemia, thyrotoxicosis)",
          "regular rhythm",
          "rate correlates with activity/emotional state",
        ],
        ruleOut: [
          "irregular rhythm",
          "sudden paroxysmal onset",
          "syncope or presyncope",
          "no identifiable trigger",
        ],
      },
      {
        dx: "Ectopic beats",
        likelihood: "likely",
        ruleIn: [
          "irregular rhythm",
          "sensation of 'skipped beat' or 'extra beat'",
          "brief episodes",
          "no haemodynamic compromise",
        ],
        ruleOut: ["sustained regular fast rhythm", "syncope", "structural heart disease"],
      },
      {
        dx: "Supraventricular tachycardia (SVT)",
        likelihood: "likely",
        ruleIn: [
          "sudden paroxysmal onset and offset",
          "regular rapid rhythm",
          "may occur at rest",
          "brief episodes lasting minutes to hours",
          "no clear external trigger",
        ],
        ruleOut: [
          "gradual onset",
          "irregular rhythm",
          "clear provocation (exertion, caffeine)",
          "no syncope",
        ],
      },
      {
        dx: "Atrial fibrillation (AF)",
        likelihood: "likely",
        ruleIn: [
          "irregularly irregular rhythm",
          "rapid rate",
          "may be paroxysmal or sustained",
          "associated chest pain, dyspnoea, syncope",
        ],
        ruleOut: ["regular rhythm", "bradycardia", "clear sinus tachycardia triggers"],
      },
      {
        dx: "Thyrotoxicosis",
        likelihood: "likely",
        ruleIn: [
          "associated heat intolerance, sweating, weight loss",
          "tremor, goitre, eye signs",
          "tachycardia (often persistent)",
          "may have AF component",
        ],
        ruleOut: [
          "no constitutional symptoms",
          "no thyroid examination findings",
          "normal TSH/free T4",
        ],
      },
      {
        dx: "Anaemia",
        likelihood: "likely",
        ruleIn: [
          "associated pallor, fatigue, dyspnoea",
          "palpitations may be only presenting symptom",
          "tachycardia at rest or with minimal exertion",
        ],
        ruleOut: ["no pallor or fatigue", "normal haemoglobin", "no dyspnoea"],
      },
      {
        dx: "Ventricular tachycardia (VT) or malignant arrhythmia",
        likelihood: "must_not_miss",
        ruleIn: [
          "syncope or presyncope",
          "known cardiomyopathy or structural heart disease",
          "family history of sudden cardiac death",
          "haemodynamic compromise (hypotension, shock, altered consciousness)",
          "sustained rapid rate",
          "chest pain",
        ],
        ruleOut: [
          "haemodynamically stable",
          "benign ectopic findings on ECG",
          "no structural disease",
        ],
      },
      {
        dx: "Atrial fibrillation with rapid ventricular response",
        likelihood: "must_not_miss",
        ruleIn: [
          "irregularly irregular rhythm at very fast rate (>140 bpm)",
          "associated syncope, chest pain, or dyspnoea",
          "haemodynamic compromise",
          "risk factors: structural heart disease, thyroid disease, alcohol, WPW",
        ],
        ruleOut: ["rate <100 bpm", "stable haemodynamics", "no AF on ECG"],
      },
      {
        dx: "Wolff-Parkinson-White syndrome (WPW)",
        likelihood: "must_not_miss",
        ruleIn: [
          "paroxysmal SVT triggered by accessory pathway",
          "may degenerate to AF with rapid ventricular response",
          "family history of sudden death or known WPW",
          "pre-excited complexes on baseline ECG",
        ],
        ruleOut: [
          "normal baseline ECG",
          "no paroxysmal arrhythmia history",
          "no family history of pre-excitation",
        ],
      },
      {
        dx: "Long-QT syndrome",
        likelihood: "must_not_miss",
        ruleIn: [
          "family history of sudden cardiac death in young people",
          "syncope triggered by emotion, exertion, or auditory stimuli",
          "prolonged QT interval on baseline ECG",
          "known electrolyte derangement (hypokalaemia, hypocalcaemia)",
        ],
        ruleOut: [
          "normal QT interval",
          "no family history",
          "no syncope episodes",
          "normal electrolytes",
        ],
      },
      {
        dx: "Arrhythmia causing syncope",
        likelihood: "must_not_miss",
        ruleIn: [
          "documented syncope or presyncope with palpitations",
          "brief loss of consciousness",
          "high risk of sudden death",
          "requires urgent investigation and possible device therapy",
        ],
        ruleOut: ["no syncope", "haemodynamic stability during palpitations", "benign prodrome"],
      },
      {
        dx: "Structural heart disease (valve disease, cardiomyopathy, coronary artery disease)",
        likelihood: "must_not_miss",
        ruleIn: [
          "known structural disease or family history",
          "associated chest pain, dyspnoea, syncope, or heart failure",
          "murmur on auscultation",
          "signs of heart failure (oedema, raised JVP, rales)",
          "risk factors: hypertension, diabetes, previous MI, rheumatic heart disease",
        ],
        ruleOut: [
          "no murmur",
          "no dyspnoea or heart failure signs",
          "no known cardiac history",
          "normal ECG and echocardiography",
        ],
      },
      {
        dx: "Electrolyte derangement (hypokalaemia, hypocalcaemia, hypomagnesaemia)",
        likelihood: "must_not_miss",
        ruleIn: [
          "on diuretics, laxatives, or other electrolyte-wasting drugs",
          "poor nutritional intake, diarrhoea, vomiting",
          "may precipitate or aggravate arrhythmias (SVT, AF, VT, long-QT)",
          "ECG may show prolonged QT or U waves",
        ],
        ruleOut: [
          "normal serum electrolytes",
          "no medications affecting electrolytes",
          "no gastrointestinal losses",
        ],
      },
    ],
    discriminatingHpc: [
      "Is the rhythm regular or irregularly irregular? (AF vs regular arrhythmia vs sinus)",
      "Onset and offset: was it sudden and paroxysmal (SVT/AF/WPW) or gradual (sinus tachycardia)?",
      "Heart rate: how fast? (can help narrow SVT vs AF vs sinus)",
      "Duration: seconds, minutes, hours, days? (brief ectopic vs sustained arrhythmia)",
      "Triggers: caffeine, alcohol, exercise, exertion, rest, emotion, auditory stimuli? (points toward sinus vs SVT vs long-QT)",
      "Associated chest pain, dyspnoea, syncope, or presyncope? (escalation to must-not-miss)",
      "Thyroid symptoms: heat intolerance, sweating, weight loss, tremor? (thyrotoxicosis)",
      "Family history of sudden cardiac death, inherited arrhythmia, or WPW? (must-not-miss",
      "Known cardiac disease, cardiomyopathy, valve disease, or structural abnormality? (escalation)",
      "Recent electrolyte-wasting drugs (diuretics), poor intake, or GI losses? (electrolyte derangement)",
    ],
    associated: [
      "Chest pain (high-risk for structural disease, ACS, VT)",
      "Dyspnoea (heart failure, AF, rapid rates)",
      "Syncope (ominous sign — arrhythmia causing haemodynamic compromise, must-not-miss)",
      "Presyncope (impending syncope, same concern)",
      "Sweating, heat intolerance, weight loss (thyroid disease)",
      "Pallor, fatigue (anaemia)",
      "Polyuria (may suggest thyroid or metabolic cause)",
    ],
    redFlags: [
      "Palpitations with syncope (high risk of life-threatening arrhythmia)",
      "Palpitations with chest pain (risk of structural disease, ACS, or malignant arrhythmia)",
      "Known structural heart disease, cardiomyopathy, or prior MI (context for VT risk)",
      "Family history of sudden cardiac death (inherited arrhythmia or structural disease)",
      "Haemodynamic compromise: hypotension, shock, altered consciousness (immediate risk)",
      "Sustained fast rate (>140 bpm or lasting hours; risk of AF RVR or VT)",
      "Palpitations in known long-QT, WPW, or Brugada (pre-existing arrhythmia substrate)",
    ],
    examTargets: [
      {
        area: "Pulse",
        sign: "rate, rhythm (regular vs irregular), character (strong vs weak, collapsing)",
        discriminates:
          "Rate discriminates sinus vs tachyarrhythmia; rhythm (irregularly irregular = AF; regular = SVT/VT/sinus); character hints at severity and valve disease",
      },
      {
        area: "Blood pressure",
        sign: "systolic/diastolic, presence of orthostatic drop",
        discriminates:
          "Hypotension during palpitations suggests haemodynamic compromise (VT, AF RVR); orthostasis suggests anaemia",
      },
      {
        area: "12-lead ECG",
        sign: "rate, rhythm, axis, QT interval, pre-excitation, ST/T-wave changes, signs of structural disease",
        discriminates:
          "Key diagnostic discriminator; shows sinus vs SVT vs AF vs VT; QT (long-QT syndrome); pre-excitation (WPW); acute MI; structural disease",
      },
      {
        area: "Heart sounds and murmurs",
        sign: "S3 gallop, S4, new or known murmur, pericardial friction rub",
        discriminates:
          "Murmur suggests structural valve disease; S3 suggests heart failure; friction rub suggests pericarditis",
      },
      {
        area: "Heart failure signs",
        sign: "raised JVP, peripheral oedema, pulmonary rales, hepatomegaly",
        discriminates:
          "Indicates underlying structural disease or persistent arrhythmia causing haemodynamic compromise",
      },
      {
        area: "Thyroid examination",
        sign: "goitre (size, nodules), tremor, eye signs (exophthalmos, lid lag)",
        discriminates: "Thyroid findings support thyrotoxicosis as cause of sinus tachycardia/AF",
      },
      {
        area: "Skin and mucosa",
        sign: "pallor of conjunctiva, palms, nail beds",
        discriminates: "Pallor supports anaemia as cause of palpitations",
      },
    ],
    historyEmphasis: [
      "Caffeine intake: high consumption raises sinus tachycardia and ectopic beat risk",
      "Alcohol and binge drinking: trigger AF and other arrhythmias",
      "Recreational drugs or stimulants (cocaine, amphetamines): cause SVT, VT, sudden death",
      "Prescription medications: sympathomimetics (bronchodilators, decongestants), tricyclic antidepressants, QT-prolonging drugs",
      "Thyroid disease history: known hypothyroidism/hyperthyroidism or recent diagnosis; TSH control",
      "Cardiac history: prior MI, valve disease, cardiomyopathy, arrhythmias, heart failure",
      "Family history of sudden cardiac death, inherited arrhythmia (WPW, long-QT, Brugada, catecholaminergic polymorphic VT), or structural disease",
      "Medications affecting electrolytes: diuretics, laxatives, vomiting/diarrhoea causing hypokalaemia or other derangement",
    ],
    combinations: [
      {
        features: [
          "sudden paroxysmal onset and offset",
          "regular rapid rhythm",
          "no external trigger",
        ],
        suggests: "SVT or WPW; accessory pathway-mediated tachycardia",
        action:
          "Urgent 12-lead ECG; look for pre-excitation (delta wave, short PR); if WPW confirmed, refer for electrophysiology study and possible ablation",
      },
      {
        features: [
          "irregularly irregular rhythm",
          "fast rate (>100 bpm)",
          "associated dyspnoea, chest pain, or syncope",
        ],
        suggests:
          "Atrial fibrillation (paroxysmal or sustained), especially with rapid ventricular response",
        action:
          "12-lead ECG (confirms AF); assess haemodynamics; if unstable or syncope, urgent cardiology review and rate/rhythm control",
      },
      {
        features: [
          "syncope or presyncope with palpitations",
          "known structural disease or family history of sudden death",
        ],
        suggests: "VT, long-QT syndrome, WPW with AF, or structural arrhythmia substrate",
        action:
          "Urgent ECG and monitoring; consider Holter/event monitoring; cardiology referral; assess QT, rule out electrolyte derangement; may require ICD evaluation",
      },
      {
        features: [
          "heat intolerance, sweating, weight loss",
          "tremor, goitre, or eye signs",
          "persistent sinus tachycardia",
        ],
        suggests:
          "Thyrotoxicosis (Graves' disease, toxic multinodular goitre, thyroiditis); may precipitate or exacerbate AF",
        action:
          "TSH and free T4; thyroid ultrasound if indicated; treat thyroid disease; control rate with beta-blocker; reassess arrhythmia after euthyroid state",
      },
      {
        features: ["pallor, fatigue, dyspnoea on mild exertion", "sinus tachycardia at rest"],
        suggests: "Anaemia as cause (compensatory tachycardia to maintain oxygen delivery)",
        action:
          "Full blood count; determine cause (iron deficiency, B12, folate, haemolysis, chronic disease); transfuse if Hb <7 g/dL or symptomatic; palpitations resolve with anaemia correction",
      },
      {
        features: [
          "on diuretics or other electrolyte-wasting agents",
          "poor nutritional intake or GI losses",
          "ECG shows prolonged QT or U waves",
        ],
        suggests:
          "Electrolyte derangement (hypokalaemia, hypocalcaemia, hypomagnesaemia); predisposes to SVT, AF, VT, torsades",
        action:
          "Serum electrolytes, magnesium; ECG analysis (QT, U waves); correct electrolytes; reduce or stop precipitant drugs; monitor response",
      },
      {
        features: [
          "murmur on auscultation",
          "dyspnoea, oedema, or signs of heart failure",
          "palpitations triggered by exertion",
        ],
        suggests:
          "Structural heart disease (valve disease, cardiomyopathy, coronary disease); palpitations may reflect compensatory tachycardia or arrhythmia secondary to structural disease",
        action:
          "12-lead ECG; chest X-ray; echocardiography; troponin (if chest pain); refer to cardiology for further workup and disease-specific management",
      },
    ],
    source: "Hutchison Ch 2-3 (clinical reasoning) — CSO-signed",
  },
  {
    code: "syncope",
    display: "Syncope / transient loss of consciousness",
    triggerCodes: ["syncope", "syncope_presyncope"],
    problemReprHint:
      'Syncope (transient loss of consciousness) with collateral risk stratification: distinguish benign (vasovagal/orthostatic/situational) from immediately dangerous cardiac/vascular/metabolic causes via acuity, prodrome presence, exertional context, and witness features (jerking/tongue-bite/incontinence suggest seizure mimic). Frame as: "What caused the collapse, and is there immediate organ risk (cardiac arrhythmia, structural obstruction, vascular rupture, metabolic derangement)?"',
    differential: [
      {
        dx: "Vasovagal/neurocardiogenic syncope",
        likelihood: "likely",
        ruleIn: [
          "Prodrome: nausea, warmth, visual greying",
          "Prolonged standing or standing in heat",
          "Emotional trigger",
          "Rapid recovery (seconds to minutes)",
          "No palpitations or chest pain",
        ],
        ruleOut: [
          "Exertional trigger",
          "Syncope while supine",
          "Palpitations preceding collapse",
          "Witness report of jerking or tongue-biting",
        ],
      },
      {
        dx: "Orthostatic hypotension",
        likelihood: "likely",
        ruleIn: [
          "Syncope on standing from lying or sitting",
          "Prodrome or syncope within seconds of postural change",
          "Known volume depletion or recent illness/diarrhoea",
          "Medications: antihypertensives, diuretics",
        ],
        ruleOut: [
          "Syncope while lying supine",
          "Exertional syncope",
          "Rapid postural blood-pressure recovery",
        ],
      },
      {
        dx: "Situational syncope (cough, micturition)",
        likelihood: "likely",
        ruleIn: [
          "Syncope preceded by coughing episode",
          "Syncope during or immediately after micturition",
          "Preceding circumstance clear to witness",
        ],
        ruleOut: ["No preceding cough or micturition", "Exertional syncope unrelated to cough"],
      },
      {
        dx: "Cardiac syncope (arrhythmia, structural obstruction, acute coronary event)",
        likelihood: "must_not_miss",
        ruleIn: [
          "Syncope during exertion or immediately post-exertional",
          "Syncope while supine with no warning",
          "Palpitations preceding collapse",
          "Chest pain preceding or during collapse",
          "Family history of sudden cardiac death",
          "Known structural heart disease (aortic stenosis, HOCM, cardiomyopathy)",
          "Known ischaemic heart disease",
          "Abnormal ECG on presenting evaluation",
          "Age >60 or multiple cardiac comorbidities",
          "Brief or absent prodrome",
        ],
        ruleOut: [
          "Obvious benign trigger (prolonged standing, heat, emotion)",
          "Rapid complete recovery without confusion or injury",
          "Witness report of convulsive movements",
        ],
      },
      {
        dx: "Pulmonary embolism",
        likelihood: "must_not_miss",
        ruleIn: [
          "Syncope with dyspnoea (during or preceding)",
          "Chest pain (pleuritic)",
          "Recent immobility, surgery, or long flight",
          "Leg swelling or calf pain (DVT signs)",
          "Tachycardia on examination",
          "Anticoagulation non-compliance",
        ],
        ruleOut: ["No dyspnoea or chest pain", "Clear benign precipitant"],
      },
      {
        dx: "Myocardial infarction",
        likelihood: "must_not_miss",
        ruleIn: [
          "Chest pain preceding or accompanying collapse",
          "Palpitations or severe dyspnoea",
          "Age >50 or cardiac risk factors (smoking, hypertension, diabetes, high cholesterol)",
          "Abnormal ECG with acute changes",
        ],
        ruleOut: [
          "No chest discomfort",
          "Young age without significant risk factors",
          "Normal ECG",
        ],
      },
      {
        dx: "Subarachnoid haemorrhage",
        likelihood: "must_not_miss",
        ruleIn: [
          "Collapse with severe headache (thunderclap or progressive)",
          "Syncope as sentinel bleed preceding worse headache",
          "Neck stiffness or photophobia",
          "Recent head trauma or anticoagulation",
        ],
        ruleOut: ["No headache", "Headache entirely post-event (suggests post-ictal)"],
      },
      {
        dx: "Ruptured or symptomatic abdominal aortic aneurysm",
        likelihood: "must_not_miss",
        ruleIn: [
          "Syncope with abdominal or back pain",
          "Shock on presentation (hypotension, tachycardia, altered perfusion)",
          "Age >60 with hypertension or smoking history",
          "Pulsatile abdominal mass on exam",
        ],
        ruleOut: ["No abdominal or back pain", "Stable vital signs"],
      },
      {
        dx: "Ectopic pregnancy rupture (reproductive-age woman)",
        likelihood: "must_not_miss",
        ruleIn: [
          "Syncope + abdominal/pelvic pain in reproductive-age woman",
          "Missed or irregular menses",
          "Positive beta-hCG",
          "Collapse with haemodynamic compromise",
        ],
        ruleOut: [
          "Not of reproductive age",
          "Reliable contraception and negative pregnancy test",
          "No abdominal pain",
        ],
      },
      {
        dx: "Hypoglycaemia",
        likelihood: "must_not_miss",
        ruleIn: [
          "Known diabetes on insulin or sulphonylureas",
          "Prodrome: tremor, sweating, confusion, palpitations",
          "Capillary glucose <3.0 mmol/L (or <54 mg/dL)",
          "Rapid recovery after glucose administration",
        ],
        ruleOut: [
          "Capillary glucose normal",
          "No diabetes history",
          "No prodrome of hypoglycaemia",
        ],
      },
      {
        dx: "Seizure (distinguish from syncope)",
        likelihood: "less_likely",
        ruleIn: [
          "Witness report of jerking or convulsive movements during or after collapse",
          "Tongue-biting or oral trauma",
          "Incontinence of urine (faeces less common)",
          "Post-ictal confusion (minutes to hours) rather than immediate clearheadedness",
          "Prior seizure history or family history of epilepsy",
          "Injury from uncontrolled fall pattern",
        ],
        ruleOut: [
          "No witnessed jerking",
          "Immediate clarity of consciousness after collapse",
          "No tongue injury or incontinence",
          "Rapid (seconds–minutes) recovery and orientation",
        ],
      },
      {
        dx: "Gastrointestinal bleed (melaena-related collapse)",
        likelihood: "less_likely",
        ruleIn: [
          "Syncope preceded by melaena or haematemesis",
          "Known peptic ulcer disease or varices",
          "Anticoagulation or antiplatelet therapy",
          "Pallor, tachycardia, low blood pressure on exam",
        ],
        ruleOut: ["No melaena", "No vomiting of blood", "Stable haemoglobin"],
      },
    ],
    discriminatingHpc: [
      "Posture and circumstance at syncope onset: on standing from recumbency (orthostatic) vs prolonged standing/heat exposure (vasovagal) vs during or immediately after exertion (cardiac, ominous) vs supine with no prodrome (cardiac, very ominous)",
      "Prodrome character and duration: absent or very brief (cardiac risk) vs nausea, warmth, visual greying, lightheadedness (vasovagal) vs palpitations (arrhythmia) vs chest pain (cardiac/PE/MI)",
      "Relationship to emotion, pain, or sight of blood: strong trigger suggests vasovagal",
      "Cough or micturition immediately preceding: situational syncope",
      "Recovery speed and character: immediate clarity within seconds–minutes (syncope) vs prolonged confusion, headache, or somnolence (seizure/SAH/metabolic)",
      "Witness account: jerking, tongue-biting, incontinence (seizure mimic) vs flaccid collapse with pallor (true syncope) vs cyanosis or gasping (cardiac/PE)",
      "Injury from fall: severe or unexplained injury pattern suggests unwitnessed seizure",
      "Associated symptoms during or immediately after: palpitations, chest pain, dyspnoea (cardiac/PE/MI) vs severe headache (SAH) vs abdominal/back pain (AAA/ectopic)",
      "Last menstrual period and pregnancy possibility (ectopic)",
      "Known cardiac or arrhythmia history, prior syncope episodes",
      "Current medications: antihypertensives, diuretics, QT-prolonging agents, insulin, anticoagulation",
    ],
    associated: [
      "Palpitations (before or during collapse) — cardiac arrhythmia, acute coronary event",
      "Chest pain or pressure (exertional or spontaneous) — acute coronary syndrome, PE, HOCM",
      "Dyspnoea (at rest or exertional) — PE, heart failure, acute coronary event",
      "Severe headache (thunderclap or progressive) — subarachnoid haemorrhage, posterior reversible encephalopathy",
      "Abdominal or back pain (sharp, tearing, or persistent) — ruptured AAA, mesenteric ischaemia, ectopic pregnancy",
      "Melaena or haematemesis — gastrointestinal bleed with volume loss",
      "Leg swelling or calf pain — deep-vein thrombosis (PE risk)",
      "Recent surgery, immobility, or long flight — VTE risk",
      "Tremor, sweating, altered mental status — hypoglycaemia, acute intoxication",
      "Focal neurological deficit post-event — stroke, TIA, SAH complication",
    ],
    redFlags: [
      "Syncope during exertion or immediately post-exertional — cardiac obstruction or arrhythmia until proven otherwise",
      "Syncope while supine or with minimal/no prodrome — high cardiac risk",
      "Palpitations or chest pain preceding or accompanying collapse — acute coronary syndrome, dangerous arrhythmia",
      "Family history of sudden cardiac death — inherited arrhythmia, cardiomyopathy, channelopathy",
      "Known structural heart disease (aortic stenosis, HOCM, cardiomyopathy) — obstructive or arrhythmogenic risk",
      "Known ischaemic heart disease — recurrent MI, cardiogenic shock",
      "Abnormal ECG on initial assessment — arrhythmia, ischaemic change, prolonged QT",
      "Age >60 combined with cardiac risk factors — increased acute coronary event probability",
      "Collapse with shock (hypotension, tachycardia, altered perfusion, pale/clammy) — catastrophic vascular cause (ruptured AAA, ectopic), PE with haemodynamic compromise, or cardiogenic shock",
      "Syncope in reproductive-age woman with abdominal/pelvic pain — ruptured ectopic pregnancy until excluded",
      "Severe or persistent headache during collapse recovery — SAH, stroke",
      "Witness report of jerking, tongue-biting, or incontinence with post-ictal confusion — seizure (but also syncope-related convulsive movements; epilepsy context is key)",
      "Anticoagulation or recent antiplatelet escalation — bleeding risk (GI bleed, intracranial)",
    ],
    examTargets: [
      {
        area: "Blood pressure (lying and standing)",
        sign: "Lying: baseline; Standing: drop ≥20 mmHg systolic or ≥10 mmHg diastolic within 3 minutes",
        discriminates:
          "Orthostatic hypotension; supports vasovagal if no orthostatic drop but prodrome history",
      },
      {
        area: "Pulse and rhythm",
        sign: "Tachycardia (>100 bpm), irregular rhythm, bradycardia (<50 bpm)",
        discriminates:
          "Tachycardia suggests hypovolaemia, sepsis, PE, or compensatory reflex; irregular rhythm suggests arrhythmia; bradycardia with syncope suggests vasovagal nadir or heart block",
      },
      {
        area: "12-lead ECG (priority if cardiac history or red flags)",
        sign: "Acute ST elevation/depression, T-wave inversion, prolonged QTc, Brugada pattern, epsilon waves, AV block, atrial fibrillation",
        discriminates:
          "Acute coronary event, inherited arrhythmia (long QT, Brugada, ARVC), structural disease (HOCM), heart block",
      },
      {
        area: "Cardiac auscultation",
        sign: "Murmur (systolic ejection murmur at right upper sternal border ± radiation to carotids = aortic stenosis; pansystolic or holosystolic = mitral regurgitation/HOCM), muffled heart sounds, new regurgitant murmur",
        discriminates:
          "Aortic stenosis or HOCM (exertional syncope risk); heart failure or pericardial effusion",
      },
      {
        area: "Lung bases",
        sign: "Crackles, diminished air entry, dullness to percussion, pleural rub",
        discriminates:
          "Pulmonary oedema (heart failure), pleural effusion (PE, malignancy), pneumonia",
      },
      {
        area: "Peripheral perfusion and oedema",
        sign: "Pale, cold, clammy peripheries; capillary refill >2 seconds; peripheral oedema; jugular venous pressure elevation",
        discriminates:
          "Shock (cardiogenic, hypovolaemic from bleeding or third-space loss, distributive); heart failure; cor pulmonale (PE)",
      },
      {
        area: "Abdominal examination",
        sign: "Pulsatile epigastric mass, periumbilical or flank tenderness, rigidity, bruising (Grey Turner's or Cullen's sign), rebound/guarding",
        discriminates:
          "Ruptured or symptomatic AAA; mesenteric ischaemia; intra-abdominal bleeding",
      },
      {
        area: "Pelvic and reproductive examination (if indicated)",
        sign: "Abdominal/pelvic tenderness, cervical motion tenderness, adnexal mass or tenderness, vaginal bleeding or discharge",
        discriminates: "Ectopic pregnancy rupture, pelvic inflammatory disease, ovarian torsion",
      },
      {
        area: "Neurological examination",
        sign: "Focal deficit (hemiparesis, aphasia, hemisensory loss), meningeal signs (neck stiffness, Kernig/Brudzinski positive), pupil asymmetry, downbeating nystagmus, ataxia",
        discriminates:
          "Acute ischaemic stroke, subarachnoid haemorrhage, posterior reversible encephalopathy, vertebral artery dissection; distinguishes from syncope-mimics",
      },
      {
        area: "Capillary glucose",
        sign: "<3.0 mmol/L (<54 mg/dL)",
        discriminates: "Hypoglycaemia (diabetes on insulin/sulphonylurea, starvation, alcohol)",
      },
      {
        area: "Beta-hCG (serum or urine, all reproductive-age women)",
        sign: "Positive (even if 'unlikely' pregnancy reported)",
        discriminates:
          "Ectopic pregnancy rupture or early pregnancy complications as cause of syncope/collapse",
      },
    ],
    historyEmphasis: [
      "Prior syncope episodes: frequency, context, outcomes — establishes pattern (vasovagal vs cardiac) and risk of recurrence",
      "Cardiac history: arrhythmia (paroxysmal or persistent), myocardial infarction, heart failure, valvular disease, cardiomyopathy, congenital heart disease — dramatically raises cardiac syncope pre-test probability",
      "Family history of sudden cardiac death (especially age <50, unexplained) — inherited arrhythmia or cardiomyopathy until excluded",
      "Family history of syncope or seizure — suggests familial arrhythmia (long QT, Brugada, CPVT) or familial epilepsy",
      "Medications affecting cardiac conduction or blood pressure: antiarrhythmics, QT-prolonging drugs (antipsychotics, macrolides, fluoroquinolones), antihypertensives, diuretics, insulin, anticoagulants, antiplatelets, sympathomimetics",
      "Volume status: recent diarrhoea, vomiting, polyuria (diabetes), reduced oral intake, bleeding (known or suspected)",
      "Pregnancy status and last menstrual period: pregnancy test mandatory in all reproductive-age women",
      "Anticoagulation or antiplatelet therapy: increases bleeding risk (GI, intracranial, intra-abdominal)",
      "Diabetes status and recent glycaemic control: hypoglycaemia risk in insulin or sulphonylurea users",
      "Sleep deprivation, stress, or emotional triggers: supports vasovagal aetiology",
      "Substance use (alcohol, recreational drugs): sympathomimetics (cocaine) cause syncope; alcohol causes orthostatic hypotension",
    ],
    combinations: [
      {
        features: [
          "Exertional syncope or syncope immediately post-exertional",
          "No prodrome or very brief prodrome",
          "Palpitations or chest pain during episode",
          "FH sudden cardiac death or known structural heart disease",
        ],
        suggests:
          "Cardiac syncope (arrhythmia, outflow obstruction, acute coronary event) — must-not-miss; high risk of sudden death or injury",
        action:
          "Urgent: 12-lead ECG, cardiac biomarkers (troponin), echocardiogram, cardiology referral, continuous cardiac monitoring, restrict exertion; consider ICD implantation or pharmacotherapy depending on aetiology",
      },
      {
        features: [
          "Prolonged standing or standing in heat",
          "Emotional trigger or sight of blood",
          "Prodrome: nausea, warmth, visual greying",
          "Rapid recovery (seconds–minutes) with no confusion",
        ],
        suggests:
          "Vasovagal/neurocardiogenic syncope — benign prognosis; reassurance and education on avoidance",
        action:
          "Counsel on recognition of prodrome, lying down immediately, avoiding prolonged standing/heat; maintain hydration and adequate salt intake; consider tilt-table testing if recurrent; medical therapy (midodrine, fludrocortisone) if frequent",
      },
      {
        features: [
          "Syncope on standing from lying or sitting",
          "Medications: antihypertensives, diuretics, or recent dose increase",
          "Recent illness, diarrhoea, or reduced oral intake",
          "Lying/standing BP drop ≥20 mmHg systolic",
        ],
        suggests:
          "Orthostatic hypotension (medication-induced or volume-depleted) — reversible with intervention",
        action:
          "Review medications, avoid rapid postural change, increase fluid and salt intake, compression stockings; discontinue or reduce offending agent if possible; may require IV fluids if severe",
      },
      {
        features: [
          "Syncope preceded by severe coughing or during micturition",
          "Clear temporal relationship to cough/micturition",
          "Rapid recovery",
        ],
        suggests:
          "Situational syncope (cough or micturition-induced) — benign but may indicate underlying airway or urinary pathology",
        action:
          "Counsel on avoiding straining; investigate underlying cause of chronic cough (COPD, ACE inhibitor, post-nasal drip); urinary retention (BPH) in men; reassurance regarding prognosis",
      },
      {
        features: [
          "Syncope with dyspnoea or pleuritic chest pain",
          "Recent immobility, surgery, or long-haul flight",
          "Leg swelling or calf pain (DVT signs)",
          "Tachycardia and hypoxia on exam",
        ],
        suggests: "Pulmonary embolism — life-threatening; immediate anticoagulation and imaging",
        action:
          "Urgent: CT pulmonary angiography (CTPA) or ventilation-perfusion scan, D-dimer if low clinical suspicion, start anticoagulation if high clinical suspicion while awaiting imaging, oxygen therapy, ICU if haemodynamically compromised",
      },
      {
        features: [
          "Syncope with chest pain, dyspnoea, or palpitations",
          "Cardiac risk factors (age, smoking, hypertension, diabetes, family history)",
          "Abnormal ECG (ST changes, T-wave inversion, arrhythmia)",
        ],
        suggests:
          "Acute coronary syndrome (myocardial infarction or unstable angina) — life-threatening; requires immediate reperfusion",
        action:
          "Urgent: 12-lead ECG (stat), serial troponins, aspirin + other dual antiplatelet therapy, beta-blocker, ACE inhibitor, consider coronary angiography and PCI or thrombolysis depending on STEMI/NSTEMI and time from symptom onset; ICU monitoring",
      },
      {
        features: [
          "Syncope with severe headache (thunderclap character or progressive)",
          "Neck stiffness or photophobia",
          "Focal neurological deficit or seizure-like activity",
        ],
        suggests:
          "Subarachnoid haemorrhage — life-threatening; requires urgent neuroimaging and neurosurgical consultation",
        action:
          "Urgent: non-contrast CT head (stat), if negative and high clinical suspicion then lumbar puncture (xanthochromia), neurosurgery referral, ICU admission, management of complications (rebleeding, vasospasm, hydrocephalus)",
      },
      {
        features: [
          "Syncope with abdominal or back pain",
          "Shock on presentation (hypotension, tachycardia, altered consciousness)",
          "Age >60 or hypertension history",
          "Pulsatile abdominal mass on exam",
        ],
        suggests:
          "Ruptured or acutely symptomatic abdominal aortic aneurysm — immediately life-threatening; exsanguinating bleed",
        action:
          "Emergency: call vascular surgery stat, large-bore IV access, type & cross for transfusion, urgent CT angiography or bedside ultrasound (if available), activate massive transfusion protocol, permissive hypotension (target SBP 90 mmHg) pending operative repair, avoid excess IV fluids pre-operatively",
      },
      {
        features: [
          "Syncope in reproductive-age woman",
          "Abdominal or pelvic pain",
          "Missed or irregular menses or positive pregnancy test",
          "Shock on presentation (haemodynamically unstable)",
        ],
        suggests:
          "Ruptured ectopic pregnancy — immediately life-threatening; intra-abdominal haemorrhage",
        action:
          "Emergency: stat beta-hCG and transvaginal ultrasound, large-bore IV access, type & cross for transfusion, activate massive transfusion protocol, urgent surgery (laparoscopy or laparotomy), ICU admission",
      },
      {
        features: [
          "Syncope with known diabetes on insulin or sulphonylurea",
          "Prodrome: tremor, sweating, confusion, palpitations",
          "Capillary glucose <3.0 mmol/L",
        ],
        suggests:
          "Hypoglycaemia — reversible but dangerous (seizure, arrhythmia, death if untreated)",
        action:
          "Immediate: administer fast-acting carbohydrate (15 g glucose tablets or juice) orally if conscious; if unconscious then IM glucagon or IV dextrose (stat), repeat glucose after 15 minutes, educate on recognition and prevention, review insulin dosing and meal timing, continuous glucose monitoring if recurrent",
      },
      {
        features: [
          "Syncope with witnessed jerking, tongue-biting, or incontinence",
          "Post-ictal confusion (minutes to hours) rather than immediate clarity",
          "Prior seizure history or family history of epilepsy",
          "Focal injury from uncontrolled fall",
        ],
        suggests:
          "Seizure (mimicking or superimposed on syncope) — requires EEG and neurology evaluation; may indicate new-onset epilepsy",
        action:
          "EEG (ideally within 24–48 hours if first unprovoked seizure), neurology referral, neuroimaging (MRI brain preferred) to exclude structural cause, consider antiepileptic medication pending investigation, driving restrictions, seizure precautions, counselling on seizure triggers and safety",
      },
      {
        features: [
          "Syncope preceded by melaena or haematemesis",
          "Known peptic ulcer disease, portal hypertension, or varices",
          "Anticoagulation or antiplatelet therapy",
          "Pallor, tachycardia, low blood pressure, low haemoglobin",
        ],
        suggests:
          "Gastrointestinal bleed (upper or lower) with hypovolaemic syncope — requires urgent resuscitation and source control",
        action:
          "Large-bore IV access, type & cross for transfusion, consider transfusion if Hb <7 g/dL (or <9 if cardiac disease), urgent gastroenterology or colorectal consultation, resuscitation (IV fluids, blood products), endoscopy or colonoscopy for source identification and haemostasis, discontinue anticoagulation (or reverse if high bleeding risk), proton-pump inhibitor therapy if peptic ulcer",
      },
    ],
    source: "Hutchison Ch 2-3 (clinical reasoning) — CSO-signed",
  },
  {
    code: "fever",
    display: "Fever (incl. tropical/Uganda lens)",
    triggerCodes: ["fever"],
    problemReprHint:
      "Fever presentation in an Uganda-endemic setting: first establish acuity and sepsis risk via NEWS2/qSOFA physiology and red flags (non-blanching rash, altered mentation, immunocompromise). Then discriminate via pattern (continuous/intermittent/relapsing — relapsing/tertian cardinal for malaria), localising features (respiratory/urinary/GI/CNS/abdominal), and travel/exposure history. Always rapid-test malaria (RDT/film) and rule out life-threatening sepsis, meningitis, and malaria in parallel; differentiate self-limiting viral from serious infection via clinical trajectory, source-hunt exam, and risk stratification.",
    differential: [
      {
        dx: "Viral infection (self-limiting)",
        likelihood: "likely",
        ruleIn: [
          "short duration (< 5 days)",
          "no localising symptoms",
          "low-grade fever",
          "normal vitals/not toxic-appearing",
          "clear upper respiratory prodrome (cough, rhinitis)",
        ],
        ruleOut: [
          "localising symptoms (dysuria, productive cough, neck stiffness)",
          "high fever (> 39°C) with rigors",
          "prolonged duration (> 7 days)",
          "altered mentation or sepsis physiology",
          "travel to malaria-endemic area within 3 months",
        ],
      },
      {
        dx: "Urinary tract infection (UTI/pyelonephritis)",
        likelihood: "likely",
        ruleIn: [
          "dysuria",
          "loin pain or suprapubic pain",
          "pyuria/positive urine dipstick",
          "female gender or recent urinary procedure",
        ],
        ruleOut: [
          "absence of urinary symptoms",
          "negative urinalysis",
          "male without urinary symptoms",
          "systemic sepsis physiology beyond local infection",
        ],
      },
      {
        dx: "Respiratory infection (upper/lower)",
        likelihood: "likely",
        ruleIn: [
          "productive cough",
          "pleuritic chest pain",
          "crackles/consolidation on chest examination",
          "short duration (< 5 days)",
        ],
        ruleOut: [
          "absence of respiratory symptoms",
          "normal chest examination",
          "no sputum production",
        ],
      },
      {
        dx: "Gastroenteritis",
        likelihood: "likely",
        ruleIn: [
          "diarrhoea",
          "abdominal pain/cramping",
          "nausea/vomiting",
          "recent food/water exposure",
          "short duration (< 5 days)",
        ],
        ruleOut: [
          "absence of GI symptoms",
          "no recent food/water exposure",
          "localising features elsewhere (headache, dysuria, rash)",
        ],
      },
      {
        dx: "Malaria",
        likelihood: "must_not_miss",
        ruleIn: [
          "fever pattern intermittent/relapsing/tertian (every 48 h) or quartan (every 72 h)",
          "travel/residence in malaria-endemic area (Uganda — always consider)",
          "rigors (bacteraemia-like, often misinterpreted as sepsis)",
          "recent return from endemic zone (within 1–3 months)",
          "positive malaria RDT or blood film (asexual parasites)",
          "anaemia (pallor, tachycardia)",
        ],
        ruleOut: [
          "negative malaria RDT and blood film (repeat if high suspicion and initial test negative)",
          "fever pattern strictly continuous without periodicity",
          "no travel/residence in endemic area and no risk exposure",
          "alternative source identified on examination (meningitis, pneumonia with consolidation)",
        ],
      },
      {
        dx: "Typhoid (enteric fever)",
        likelihood: "must_not_miss",
        ruleIn: [
          "travel to endemic region or poor sanitation (Uganda)",
          "prolonged fever (> 7 days) with step-ladder pattern",
          "diarrhoea or constipation (rose spots if visible)",
          "relative bradycardia despite high fever",
          "hepatomegaly/splenomegaly",
          "blood culture positive (gold standard)",
        ],
        ruleOut: [
          "acute onset (typhoid typically gradual)",
          "prominent respiratory or urinary localisation",
          "short duration (< 5 days)",
          "blood culture negative (though absence does not rule out early disease)",
        ],
      },
      {
        dx: "Tuberculosis (TB — pulmonary ± disseminated)",
        likelihood: "must_not_miss",
        ruleIn: [
          "night sweats + weight loss (constitutional triad)",
          "prolonged fever (weeks to months, not acute)",
          "productive cough (sometimes haemoptysis)",
          "chest X-ray findings (apical infiltrates, cavitation)",
          "TB contact history or high-prevalence setting",
          "HIV co-infection",
          "positive sputum smear/CBNAAT/Xpert",
        ],
        ruleOut: [
          "acute presentation (< 2 weeks typically)",
          "absence of night sweats/weight loss over prolonged observation",
          "negative sputum smear/CBNAAT",
          "alternative acute infection identified (pneumonia, malaria)",
        ],
      },
      {
        dx: "Sepsis/septic shock (source undifferentiated)",
        likelihood: "must_not_miss",
        ruleIn: [
          "NEWS2 score ≥ 5 or qSOFA ≥ 2 (hypotension, tachypnoea, altered mentation)",
          "lactate > 2 mmol/L",
          "evidence of infection (fever + source or biomarkers)",
          "acute organ dysfunction (creatinine rise, low platelets, hyperbilirubinaemia)",
          "hypotension despite fluid resuscitation",
        ],
        ruleOut: [
          "normal vitals + normal lactate + alert mentation",
          "no evidence of infection source",
          "alternative explanation for SIRS (MI, pancreatitis, trauma)",
        ],
      },
      {
        dx: "Meningitis/encephalitis (bacterial, viral, TB)",
        likelihood: "must_not_miss",
        ruleIn: [
          "neck stiffness (true meningism — resistance to passive flexion)",
          "photophobia",
          "headache (severe, often with nausea/vomiting)",
          "altered mentation/confusion",
          "non-blanching petechial/purpuric rash (meningococcaemia; not all meningitis)",
          "CSF pleocytosis + ↑ protein + ↓ glucose (bacterial) or lymphocytic (viral/TB)",
        ],
        ruleOut: [
          "absence of neck stiffness + normal mentation",
          "absence of headache",
          "CSF normal (though absence of pleocytosis does not exclude all viral meningitis)",
          "fever without meningeal signs (reassess if deterioration)",
        ],
      },
      {
        dx: "HIV-related/opportunistic infection (PCP, MAC, CMV, cryptococcal meningitis, TB)",
        likelihood: "must_not_miss",
        ruleIn: [
          "known HIV+ status or high-risk behaviour (IVDU, unprotected sex, men who have sex with men)",
          "CD4 < 200 (PCP, cryptococcal meningitis, MAC)",
          "subacute fever + night sweats + cough (PCP, TB)",
          "headache + meningeal signs with normal/low-glucose CSF (cryptococcal)",
          "prolonged fever + weight loss + diarrhoea (MAC, enteropathy)",
          "no prior ART or poor adherence",
        ],
        ruleOut: [
          "documented negative recent HIV antibody/Ag/Ab test (though window period applies)",
          "acute presentation in non-endemic setting without risk factors",
          "low suspicion and CD4 > 500 (though still possible)",
        ],
      },
      {
        dx: "Infective endocarditis",
        likelihood: "must_not_miss",
        ruleIn: [
          "prolonged fever (> 1 week) with malaise",
          "new or changing cardiac murmur (regurgitation murmur in native valve)",
          "risk factors: IVDU, congenital heart disease, prosthetic valve, rheumatic heart disease",
          "septic emboli (splinter haemorrhages, Osler nodes, Janeway lesions, Roth spots)",
          "haematuria/proteinuria (glomerulonephritis)",
          "positive blood cultures (not always — sterile culture endocarditis in treated cases)",
          "echocardiography findings (vegetation, valve perforation, paravalvular abscess)",
        ],
        ruleOut: [
          "short duration (< 5 days) and no cardiac murmur",
          "no risk factors and normal cardiac examination",
          "negative blood cultures with no clinical suspicion",
          "alternative localised infection identified (UTI, pneumonia)",
        ],
      },
      {
        dx: "Intra-abdominal collection (abscess, perforated viscus, peritonitis)",
        likelihood: "must_not_miss",
        ruleIn: [
          "localised abdominal pain + rebound/guarding",
          "fever with signs of peritonitis (rigid abdomen, absent bowel sounds)",
          "history of surgery, trauma, or perforation",
          "imaging findings (CT/ultrasound: free fluid, gas, loculated collection)",
          "elevated inflammatory markers (CRP, WBC)",
        ],
        ruleOut: [
          "absence of abdominal peritoneal signs",
          "no history of abdominal surgery/trauma",
          "alternative localisation on examination (respiratory, CNS)",
        ],
      },
      {
        dx: "Neutropenic sepsis",
        likelihood: "must_not_miss",
        ruleIn: [
          "known neutropenia (WBC < 0.5 × 10^9/L or acute drop)",
          "on chemotherapy, long-term immunosuppression, or bone-marrow disease",
          "fever (often the sole sign; may not mount inflammatory response)",
          "sepsis physiology (NEWS2, qSOFA, hypotension, altered mentation)",
          "high-grade fevers even with subtle source",
        ],
        ruleOut: [
          "normal absolute neutrophil count (ANC > 1.0 × 10^9/L)",
          "no history of immune compromise",
          "fever with obvious localised infection not escalating to sepsis",
        ],
      },
      {
        dx: "COVID-19/pandemic respiratory virus (SARS-CoV-2, influenza, RSV)",
        likelihood: "must_not_miss",
        ruleIn: [
          "respiratory symptoms (cough, dyspnoea, sore throat, rhinitis)",
          "known exposure or high-prevalence setting",
          "rapid viral antigen test or PCR positive",
          "bilateral pneumonia on imaging (in severe cases)",
          "mild-to-moderate presentation typical; severe if older/comorbid",
        ],
        ruleOut: [
          "negative rapid antigen or PCR test",
          "no respiratory symptoms and no exposure history",
          "localisation to non-respiratory site (pure meningitis, pure UTI)",
        ],
      },
    ],
    discriminatingHpc: [
      "Fever onset + pattern: continuous vs intermittent vs relapsing/tertian (every 48 h) or quartan (every 72 h) — cardinal for malaria",
      "Duration: acute (< 5 days) vs prolonged (> 7 days) — prolonged raises TB/HIV/endocarditis/typhoid",
      "Localising symptoms: cough/sputum colour/dyspnoea, dysuria/loin pain, diarrhoea/abdominal pain, headache/neck stiffness/photophobia, skin rash (blanching vs non-blanching)",
      "Travel + residence: malaria-endemic areas (Uganda — always ask), time since return (malaria window 1–3 months), exposure to animals, contaminated water, sick contacts",
      "Rigors: high-amplitude shaking, often misinterpreted as sepsis but cardinal for malaria + bacteraemia; note timing relative to fever spike",
      "Immunocompromise: known HIV status + CD4 count, chemotherapy/immunosuppression, asplenia, neutropenia, recent steroids",
      "Systemicity: night sweats + weight loss (TB/HIV/lymphoma/endocarditis), fatigue, myalgia/arthralgia",
      "Previous infections/procedures: recent surgery, UTI catheter, IVDU sites, prosthetic valves, bone-marrow disease",
      "Vaccination status: tetanus, meningococcal, pneumococcal, MMR (proxy for susceptibility)",
      "Sex contacts/behaviour: unprotected sex, IVDU history, healthcare worker exposure",
    ],
    associated: [
      "Neck stiffness + photophobia + rash → meningitis",
      "Productive cough + pleuritic pain → respiratory infection/pneumonia",
      "Dysuria + loin pain → UTI/pyelonephritis",
      "Diarrhoea → gastroenteritis; if bloody → shigella/salmonella/campylobacter",
      "Rash: blanching erythematous (viral exanthem, rubella, measles) vs non-blanching petechial/purpuric (meningococcaemia — urgent)",
      "New murmur + septic emboli (splinter haemorrhages, Osler nodes, Roth spots) → infective endocarditis",
      "Jaundice → malaria (haemolysis), hepatitis, leptospirosis, typhoid",
      "Night sweats + weight loss + productive cough → TB; + lymphadenopathy → also consider lymphoma/HIV",
      "Hepatomegaly + splenomegaly → malaria, EBV, typhoid, TB, HIV, endocarditis",
      "Lymphadenopathy (generalised) → EBV, CMV, TB, HIV, lymphoma",
      "Abdominal pain + rebound → peritonitis/intra-abdominal collection",
    ],
    redFlags: [
      "NEWS2 ≥ 5 or qSOFA ≥ 2: hypotension (SBP < 90), tachypnoea (RR ≥ 22), altered mentation — sepsis/septic shock until proven otherwise",
      "Non-blanching petechial or purpuric rash: meningococcaemia — treat empirically while investigating",
      "Neck stiffness + fever: meningitis — LP mandatory unless contraindicated; if meningococcaemia suspected, do NOT delay antibiotics for LP",
      "Immunocompromise (HIV CD4 < 200, chemotherapy, asplenia) + fever: assume opportunistic infection, broad-spectrum cover pending investigations",
      "Returning traveller with fever within 3 months of leaving malaria-endemic area: malaria is must-not-miss — rapid test + blood film mandatory",
      "Neutropenia (WBC < 0.5 × 10^9/L) + fever: empirically treat as sepsis, no delay for culture",
      "Fever in pregnancy with red flags (headache, seizure, non-blanching rash, severe thrombocytopenia): eclampsia/HELLP ± infection — obstetric emergency",
      "Progressive deterioration: hypoxia, acidosis, coagulopathy, multi-organ failure — escalate to critical care",
    ],
    examTargets: [
      {
        area: "Vital signs (full set)",
        sign: "NEWS2 score; hypotension, tachycardia, tachypnoea, low O₂ sat, fever magnitude",
        discriminates:
          "Acute severity; sepsis vs self-limiting. Sepsis when NEWS2 ≥ 5 or qSOFA ≥ 2.",
      },
      {
        area: "General appearance",
        sign: "Toxic vs well; rash (blanching vs non-blanching), jaundice, pallor, dehydration, lymphadenopathy",
        discriminates:
          "Severity tier; non-blanching rash → meningococcaemia (MUST-NOT-MISS). Jaundice → malaria/hepatitis. Pallor/anaemia → malaria, chronic TB, HIV.",
      },
      {
        area: "Respiratory",
        sign: "Crackles (alveolar involvement), consolidation, wheeze, pleural rub",
        discriminates:
          "Pneumonia vs upper respiratory vs pleurisy. Bilateral crackles → PCP/TB/pneumonia.",
      },
      {
        area: "Abdomen",
        sign: "Rebound/guarding (peritonitis), hepatomegaly, splenomegaly, RLQ tenderness (appendicitis), suprapubic/loin tenderness",
        discriminates:
          "Peritonitis/intra-abdominal collection vs hepato-splenic (malaria/endocarditis/EBV/TB) vs UTI-localisation.",
      },
      {
        area: "Cardiovascular",
        sign: "New murmur (regurgitation), splinter haemorrhages (nail beds), Osler nodes (finger pads), Janeway lesions (palms/soles), Roth spots (fundus)",
        discriminates:
          "Infective endocarditis. Absence does not rule out; early disease may have no signs.",
      },
      {
        area: "Neck/CNS",
        sign: "Neck stiffness (passive flexion resistance), photophobia, Kernig/Brudzinski signs, pupil reactivity, focal neuro deficit, GCS",
        discriminates:
          "Meningitis/encephalitis vs viral prodrome. Altered GCS or focal deficit → urgent neuro/LP assessment.",
      },
      {
        area: "Skin",
        sign: "Rash morphology (maculopapular, petechial, purpuric), distribution, blanching, associated lymph nodes",
        discriminates:
          "Meningococcaemia (non-blanching) vs viral exanthem (blanching). Absence of rash does not exclude meningitis.",
      },
      {
        area: "Joints",
        sign: "Swelling, warmth, effusion (septic arthritis), arthralgias (viral, RF, SLE)",
        discriminates: "Gonococcal septic arthritis vs viral arthralgia.",
      },
      {
        area: "Malaria rapid diagnostic",
        sign: "Malaria RDT or blood film (asexual parasites, species, parasitaemia %)",
        discriminates:
          "Confirm/exclude malaria. Always do in Uganda/endemic setting. Repeat if high clinical suspicion + initial negative.",
      },
    ],
    historyEmphasis: [
      "Travel/residence: malaria-endemic region (Uganda — presumptive treatment era). Time since return (1–3 months window for malaria). Highlands vs lowlands (P. malariae in highlands).",
      "HIV status: known positive/negative/unknown. CD4 count if known (< 200 = high OI risk). ART adherence. Recent OI prophylaxis.",
      "TB history: active TB contact (household, workplace), prior TB treatment, TB preventive therapy status, TB symptoms (night sweats, cough, weight loss). High-prevalence setting (Uganda).",
      "Immunosuppression: chemotherapy (type, timing), steroids (duration, dose), biological agents, asplenia, dialysis, transplant.",
      "Sick contacts: TB, meningitis, gastroenteritis, measles/chickenpox, SARS-CoV-2, influenza.",
      "Recent procedures: UTI catheter, IV lines, surgery (type, timing, complication). IVDU history (endocarditis risk).",
      "Vaccination: meningococcal (serogroup), pneumococcal, MMR (measles), COVID-19, polio, BCG. Status determines susceptibility.",
      "Drug/toxin history: antibiotics (prior treatment, prophylaxis, allergy), NSAIDs (GI risk), herbal remedies (hepatotoxicity), alcohol (aspiration pneumonia, cirrhosis).",
      "Sexual history: partners, protection, STI symptoms. Gonorrhoea risk (septic arthritis).",
      "Chronic conditions: diabetes (UTI, DKA risk), sickle cell (splenic dysfunction, invasive infection), renal disease (infection risk, immunosuppression).",
    ],
    combinations: [
      {
        features: [
          "intermittent/tertian fever pattern (every 48 h)",
          "rigors",
          "travel to/residence in malaria-endemic area (Uganda)",
          "anaemia (pallor, tachycardia)",
        ],
        suggests: "Plasmodium falciparum malaria (most lethal in Uganda)",
        action:
          "Urgent malaria RDT + blood film (thick/thin); DO NOT delay pending result if high suspicion — start antimalarial while investigating. Check for severe features (cerebral, renal, acidosis, severe anaemia).",
      },
      {
        features: [
          "neck stiffness",
          "photophobia",
          "headache + fever",
          "altered mentation or focal neurology",
        ],
        suggests: "Meningitis/encephalitis (bacterial > viral in acuteness)",
        action:
          "Urgent LP (unless contraindicated: space-occupying lesion, coagulopathy, shock). Blood cultures × 2. If non-blanching rash or meningococcaemia suspected, empiric antibiotics (ceftriaxone) DO NOT wait for LP. CSF analysis (protein, glucose, cell count, Gram, culture, CBNAAT if TB suspected).",
      },
      {
        features: ["non-blanching petechial or purpuric rash", "fever", "shock/hypotension"],
        suggests: "Meningococcaemia (medical emergency)",
        action:
          "Empiric IV ceftriaxone (or IV penicillin if allergy) immediately — DO NOT delay for LP or cultures. Supportive care, fluid resuscitation, consider ICU. Blood cultures. Contact tracing + prophylaxis for close contacts.",
      },
      {
        features: [
          "prolonged fever (> 7 days)",
          "night sweats",
          "weight loss",
          "productive cough (sometimes haemoptysis)",
        ],
        suggests: "Tuberculosis (pulmonary ± disseminated) or HIV-related opportunistic infection",
        action:
          "Sputum smear microscopy, CBNAAT/Xpert MTB/RIF, chest X-ray. If suspicion high but sputum negative, consider EBUS or other sampling. Test for HIV. Check CD4 if positive. Consider TB and HIV co-infection in Uganda (high prevalence).",
      },
      {
        features: ["dysuria", "loin pain", "fever", "pyuria/positive urine dipstick"],
        suggests: "Urinary tract infection (cystitis ± pyelonephritis)",
        action:
          "Urine culture + sensitivity. Renal function (creatinine, electrolytes). If pyelonephritis (systemic toxicity, loin pain, costovertebral angle tenderness), start empiric antibiotics (e.g. ceftriaxone or fluoroquinolone pending culture); if mild cystitis, oral antibiotic. Consider imaging (ultrasound/CT) if complicated (pregnancy, obstruction, recurrent).",
      },
      {
        features: [
          "diarrhoea",
          "abdominal cramps",
          "fever",
          "recent food/water exposure or sick contacts with GI symptoms",
        ],
        suggests: "Gastroenteritis (viral > bacterial unless bloody)",
        action:
          "Stool culture if bloody or severe. Ensure fluid/electrolyte repletion. Oral rehydration first-line. Antibiotics only if invasive (bloody diarrhoea, systemic toxicity, high-risk patient). Screen for cholera/shigella/campylobacter/salmonella if community outbreak.",
      },
      {
        features: [
          "productive cough",
          "dyspnoea",
          "pleuritic chest pain",
          "crackles or consolidation on exam",
        ],
        suggests: "Community-acquired pneumonia (bacterial > viral; consider COVID-19, influenza)",
        action:
          "Chest X-ray. Blood culture × 2. Sputum culture if productive. Respiratory viral PCR (COVID-19, influenza, RSV) if epidemiologically relevant. Start empiric antibiotics if pneumonia likely (age, risk factors, hypoxia). Monitor O₂ sat; consider admission if SpO₂ < 90%.",
      },
      {
        features: [
          "fever + NEWS2 ≥ 5 or qSOFA ≥ 2 (hypotension, tachypnoea, altered mentation)",
          "no obvious localisation",
          "lactate > 2 mmol/L",
        ],
        suggests: "Sepsis/septic shock (source undetermined at presentation)",
        action:
          "Broad-spectrum empiric antibiotics per sepsis protocol (ceftriaxone ± gentamicin ± metronidazole depending on likely source). Blood cultures before antibiotics if possible. Lactate, FBC, U&E, LFT, clotting. Fluid resuscitation per protocol. Source hunt: chest X-ray, urinalysis, abdominal exam. ICU involvement. Re-assess for localisation as investigations return.",
      },
      {
        features: [
          "prolonged fever (weeks)",
          "new or changing cardiac murmur",
          "risk factors (IVDU, congenital heart disease, prosthetic valve, rheumatic disease)",
          "septic emboli (splinter haemorrhages, Osler nodes, Roth spots)",
        ],
        suggests: "Infective endocarditis",
        action:
          "Blood cultures × 2–3 before antibiotics. Echocardiography (TTE first, TEE if high suspicion or prosthetic valve). Duke criteria assessment. Empiric antibiotics if endocarditis likely (e.g. IV flucloxacillin + gentamicin); adjust per culture/sensitivities. Cardiology input. Exclude from peripheral blood on IV lines (central line preferred).",
      },
      {
        features: [
          "fever + immunocompromise (HIV CD4 < 200, chemotherapy, asplenia)",
          "subacute presentation",
          "night sweats + cough or diarrhoea + weight loss",
        ],
        suggests: "Opportunistic infection (PCP, TB, MAC, cryptococcal meningitis, toxoplasmosis)",
        action:
          "Blood cultures, CD4 count if HIV unknown, sputum/BAL/CSF sampling as indicated. Chest X-ray, abdominal imaging. Start empiric cover: high-dose TMP-SMX or atovaquone for PCP; standard TB regimen; antifungal for meningitis. Ensure ART or initiate if not on. Monitor for IRIS.",
      },
      {
        features: [
          "fever",
          "acute WBC < 0.5 × 10^9/L (neutropenia)",
          "no obvious localisation but systemic symptoms",
        ],
        suggests:
          "Neutropenic sepsis (may not mount inflammatory response; fever may be sole sign)",
        action:
          "Empiric broad-spectrum antibiotics immediately (typically piperacillin-tazobactam ± gentamicin, adjust per local resistance). Blood cultures (peripheral + any central lines). FBC, U&E, LFT. Source hunt (mouth, perirectal, lines, lungs). Granulocyte colony-stimulating factor (G-CSF) may be indicated. ICU if septic shock. Assume sepsis until proven otherwise.",
      },
      {
        features: [
          "fever in returning traveller (< 3 months)",
          "malaria RDT/film negative",
          "prolonged fever + night sweats + localising features absent",
        ],
        suggests:
          "Typhoid (enteric fever) or other imported fever (dengue, chikungunya, yellow fever if endemic exposure)",
        action:
          "Blood culture (gold standard for typhoid; multiple sets improve yield). Widal serology (limited sensitivity/specificity; interpret with caution). Chest X-ray, abdominal imaging if complications suspected (perforation, hepatomegaly). Empiric fluoroquinolone or ceftriaxone if typhoid suspected. Repeat blood cultures if first negative but suspicion high.",
      },
      {
        features: [
          "fever",
          "non-localised",
          "exposure to SARS-CoV-2 or high-prevalence setting",
          "respiratory symptoms (cough, sore throat, dyspnoea) + anosmia/ageusia",
        ],
        suggests: "COVID-19 (mild-to-moderate; severe if older/comorbid)",
        action:
          "Rapid antigen test or NAATs (PCR). Pulse oximetry, chest imaging if dyspnoeic. FBC, D-dimer if concerned about thrombosis. Supportive care, isolation. Consider antivirals if high-risk (Paxlovid within 5 days onset). Monitor for post-viral complications.",
      },
    ],
    source: "Hutchison Ch 2-3 (clinical reasoning) — CSO-signed",
  },
  {
    code: "weight_loss",
    display: "Unintentional weight loss",
    triggerCodes: ["weight_loss", "weight_change"],
    problemReprHint:
      "Unintentional weight loss: quantify amount and timeline; distinguish intentional from unintentional; assess appetite trajectory (reduced vs paradoxically increased); screen for alarm features by system (dysphagia, bowel change + bleeding, haemoptysis, lymph nodes); fever/night sweats; mood/anhedonia. Always rule out malignancy, TB, HIV/AIDS, chronic infection, undiagnosed diabetes, organ failure first.",
    differential: [
      {
        dx: "Depression",
        likelihood: "likely",
        ruleIn: ["reduced appetite", "anhedonia", "mood disturbance", "social withdrawal"],
        ruleOut: ["ongoing fever", "lymphadenopathy", "haemoptysis", "dysphagia"],
      },
      {
        dx: "Hyperthyroidism",
        likelihood: "likely",
        ruleIn: [
          "weight loss despite increased appetite",
          "heat intolerance",
          "tremor",
          "palpitations",
          "thyroid signs on exam",
        ],
        ruleOut: ["dysphagia", "rectal bleeding", "fever without thyrotoxic signs"],
      },
      {
        dx: "New undiagnosed diabetes",
        likelihood: "likely",
        ruleIn: [
          "polyuria",
          "polydipsia",
          "weight loss with increased appetite",
          "young/middle age",
        ],
        ruleOut: ["lymphadenopathy", "dysphagia", "haemoptysis"],
      },
      {
        dx: "Malabsorption (coeliac, tropical sprue, etc)",
        likelihood: "likely",
        ruleIn: [
          "chronic diarrhoea",
          "abdominal distension",
          "failure to thrive pattern",
          "steatorrhoea",
        ],
        ruleOut: ["acute dysphagia", "haemoptysis", "systemic B-symptoms"],
      },
      {
        dx: "Chronic inflammatory disease (IBD, rheumatologic)",
        likelihood: "likely",
        ruleIn: [
          "chronic diarrhoea",
          "rectal bleeding",
          "abdominal pain",
          "systemic symptoms",
          "joint/skin manifestations",
        ],
        ruleOut: ["acute onset", "isolated fever without GI symptoms"],
      },
      {
        dx: "Malignancy (GI/lung/lymphoma)",
        likelihood: "must_not_miss",
        ruleIn: [
          "age > 50 with new symptoms",
          "alarm features (dysphagia, rectal bleeding, haemoptysis)",
          "rapid weight loss",
          "lymphadenopathy",
          "hepatosplenomegaly",
          "abdominal mass",
          "anorexia",
          "B-symptoms",
        ],
        ruleOut: ["purely functional symptoms", "normal exam in low-risk patient"],
      },
      {
        dx: "Tuberculosis",
        likelihood: "must_not_miss",
        ruleIn: [
          "fever",
          "night sweats",
          "chronic cough/haemoptysis",
          "TB contact history",
          "high HIV prevalence setting (Uganda)",
          "constitutional symptoms",
          "lymphadenopathy",
        ],
        ruleOut: ["acute presentation without respiratory symptoms"],
      },
      {
        dx: "HIV/AIDS",
        likelihood: "must_not_miss",
        ruleIn: [
          "Uganda context (high prevalence)",
          "fever",
          "night sweats",
          "oral candidiasis",
          "lymphadenopathy",
          "recurrent infections",
          "HIV stigmata",
          "CD4 < 200 indicators (PCP, CMV)",
        ],
        ruleOut: ["negative HIV antibody/antigen if tested"],
      },
      {
        dx: "Other chronic infection (fungal, parasitic)",
        likelihood: "must_not_miss",
        ruleIn: [
          "fever",
          "night sweats",
          "geographic exposure (endemic fungal)",
          "lymphadenopathy",
          "chronic cough",
          "abdominal involvement",
        ],
        ruleOut: ["absence of systemic symptoms"],
      },
      {
        dx: "Undiagnosed diabetes with DKA risk",
        likelihood: "must_not_miss",
        ruleIn: [
          "polyuria",
          "polydipsia",
          "fatigue",
          "rapid onset weight loss",
          "young age (type 1)",
          "abdominal pain",
          "altered mental state",
        ],
        ruleOut: ["normal glucose tolerance on random/fasting test"],
      },
      {
        dx: "Severe organ failure (renal, hepatic, cardiac)",
        likelihood: "must_not_miss",
        ruleIn: [
          "cachexia",
          "oedema (renal/cardiac)",
          "jaundice/ascites (hepatic)",
          "dyspnoea",
          "reduced appetite",
          "functional limitation",
          "relevant past medical history",
        ],
        ruleOut: ["normal organ function tests"],
      },
    ],
    discriminatingHpc: [
      "Quantify weight loss: absolute kg and timeline (weeks/months)",
      "Intentional vs unintentional",
      "Appetite trajectory: reduced (malignancy/depression) vs increased + loss (thyrotoxicosis/diabetes)",
      "Fever and pattern (daily/evening/night sweats)?",
      "Mood/anhedonia/social withdrawal",
      "Dysphagia (alarm: malignancy/stricture)",
      "Change in bowel habit and rectal bleeding (alarm: malignancy/IBD)",
      "Cough and haemoptysis (alarm: TB/malignancy/infection)",
      "Lymph node lumps palpated by patient",
      "Polyuria/polydipsia (diabetes/hyperthyroidism)",
      "Heat intolerance and tremor (thyrotoxicosis)",
      "Chronic diarrhoea and stool character (malabsorption/IBD)",
      "TB contact history or symptoms (night sweats/fever/cough)",
      "HIV status and risk; oral thrush; recurrent infections",
      "Smoking history (lung malignancy)",
      "Alcohol intake (organ failure/malabsorption)",
      "Family history of cancer/diabetes/autoimmune",
      "Recent medications (including appetite suppressants, chemotherapy)",
    ],
    associated: [
      "B-symptoms (fever, night sweats, chills)",
      "GI alarm features (dysphagia, vomiting, abdominal pain, rectal bleeding, mass, ascites)",
      "Respiratory alarm features (cough, haemoptysis, dyspnoea, chest pain)",
      "Lymphadenopathy (localised or generalised)",
      "Hepatosplenomegaly",
      "Polyuria/polydipsia",
      "Heat intolerance, tremor, palpitations",
      "Chronic diarrhoea",
      "Oral candidiasis and HIV stigmata",
      "Jaundice and ascites",
      "Oedema (lower limb/anasarca)",
      "Altered mental state (DKA, infections, malignancy)",
    ],
    redFlags: [
      "Weight loss + any alarm feature (GI bleeding, dysphagia, haemoptysis, lymphadenopathy, mass)",
      "Rapid weight loss (>10% body weight in <3 months)",
      "Age > 50 with new symptoms (malignancy/TB/organ failure risk)",
      "Age with new symptoms + smoking or alcohol (malignancy/organ failure)",
      "Fever/night sweats (TB/lymphoma/HIV/chronic infection)",
      "Dysphagia (malignancy/stricture emergency)",
      "Haemoptysis (TB/malignancy/infection)",
      "Altered mental state (DKA, CNS infections, advanced malignancy)",
      "Cachexia appearance with organ failure signs (renal/hepatic/cardiac)",
      "Oedema + ascites (hepatic decompensation)",
      "Uganda context + fever/night sweats + lymphadenopathy (TB/HIV/endemic fungal)",
    ],
    examTargets: [
      {
        area: "Weight/anthropometry",
        sign: "Weight, height, BMI, cachexia severity (temporal wasting, rib visibility, sacral prominence)",
        discriminates:
          "Quantify severity; track trajectory. Cachexia pattern suggests malignancy, organ failure, chronic infection vs simple depression/malabsorption.",
      },
      {
        area: "Lymph nodes",
        sign: "Cervical, axillary, inguinal; size, consistency, matting, mobility",
        discriminates:
          "Hard/rubbery/fixed = malignancy; soft/mobile = reactive/infection; generalised = lymphoma/HIV/TB/chronic infection",
      },
      {
        area: "Abdomen",
        sign: "Hepatomegaly, splenomegaly, masses, ascites, tenderness, abdominal distension",
        discriminates:
          "Liver enlargement (malignancy, infection, organ failure); splenic enlargement (lymphoma, HIV, TB); mass (malignancy); ascites (malignancy, portal hypertension)",
      },
      {
        area: "Breast/chest wall",
        sign: "Lumps, nipple discharge, skin dimpling, asymmetry",
        discriminates: "Palpable mass = malignancy; discharge = endocrine/infection",
      },
      {
        area: "Thyroid",
        sign: "Size, nodules, tenderness, bruit, tremor, eye signs (exophthalmos)",
        discriminates:
          "Diffuse enlargement + tremor + heat intolerance = hyperthyroidism; nodule = malignancy risk; tenderness = thyroiditis",
      },
      {
        area: "Chest",
        sign: "Focal consolidation, crackles, wheeze, pleural effusion signs, HR/rhythm, blood pressure",
        discriminates:
          "Consolidation/crackles = TB/pneumonia; pleural effusion = malignancy/infection/organ failure; tachycardia/hypertension = hyperthyroidism",
      },
      {
        area: "Digital rectal exam (if indicated)",
        sign: "Masses, polyps, stool colour, fissures, hemorrhoids",
        discriminates:
          "Mass = malignancy; blood = IBD/malignancy; pale stool = biliary obstruction",
      },
      {
        area: "Oral cavity",
        sign: "Candidiasis (white coating, erythema), ulcers, dental caries, KS lesions",
        discriminates:
          "Oral candidiasis = CD4 < 200 (AIDS); ulcers = infection/malignancy; KS = advanced HIV",
      },
      {
        area: "Skin/general",
        sign: "Pallor (anaemia), jaundice, dermatitis, pruritus, cachexia severity",
        discriminates:
          "Pallor = anaemia (malignancy, GI bleeding, hemolysis); jaundice = hepatic/biliary (malignancy, organ failure)",
      },
      {
        area: "Thyrotoxic signs (if hyperthyroidism suspected)",
        sign: "Tremor (fine, resting vs action), tachycardia (>90 at rest), brisk reflexes, warm peripheries, heat intolerance",
        discriminates:
          "Tremor + tachycardia + reflex briskness = hyperthyroidism vs depression/malignancy",
      },
    ],
    historyEmphasis: [
      "Appetite trend: reduced (malignancy/depression) vs increased despite loss (thyrotoxicosis/diabetes) — critical discriminator",
      "Mood/anhedonia/social withdrawal — depression diagnosis probability",
      "GI symptoms: dysphagia, change in bowel habit, rectal bleeding, abdominal pain — alarm features",
      "Respiratory symptoms: cough, haemoptysis, dyspnoea — TB/malignancy/infection",
      "HIV status (tested? result? date? CD4/VL if known) — Uganda context makes this mandatory",
      "TB symptoms and contact history (fever, night sweats, productive cough, TB contact) — Uganda context",
      "Smoking history (cigarettes/cannabis/bidis) — lung malignancy/TB",
      "Alcohol intake and pattern (daily? heavy? GI bleeding? liver disease?) — organ failure/malabsorption/malignancy risk",
      "Diabetes symptoms if any (polyuria, polydipsia, fatigue, visual changes) — new diabetes or DKA risk",
      "Family history of cancer (type, age at onset), diabetes, autoimmune — pre-test probability",
      "Recent medications (including chemotherapy, antiretrovirals, immunosuppressants, appetite suppressants)",
      "Geographic exposures and travel (endemic fungal/parasitic infections)",
      "Occupational exposure (asbestos, dust, chemical — malignancy risk)",
    ],
    combinations: [
      {
        features: ["fever", "night sweats", "lymphadenopathy", "cough/haemoptysis"],
        suggests:
          "TB, lymphoma, or HIV-related infection (consider CD4 < 200 opportunistic infections)",
        action:
          "CXR urgent; TB sputum/GeneXpert; consider CT chest if CXR normal but high suspicion; HIV test; FBC/LDH for lymphoma; fever workup (blood cultures if febrile)",
      },
      {
        features: [
          "weight loss",
          "reduced appetite",
          "anorexia",
          "anhedonia",
          "age > 50 with alarm symptoms",
        ],
        suggests:
          "Malignancy (especially GI/lung/lymphoma); must exclude before depression diagnosis",
        action:
          "FBC (anaemia, leukopenia); CRP/ESR (inflammation); LFTs (liver mets); CXR; consider CT abdomen if GI alarm features; endoscopy if dysphagia/rectal bleeding",
      },
      {
        features: [
          "weight loss despite increased appetite",
          "heat intolerance",
          "tremor",
          "palpitations",
          "tachycardia",
        ],
        suggests: "Hyperthyroidism (Graves, toxic nodule, thyroiditis)",
        action:
          "TSH + free T4; thyroid antibodies if indicated; thyroid ultrasound if nodule palpated",
      },
      {
        features: ["polyuria", "polydipsia", "weight loss", "fatigue", "young/middle age"],
        suggests:
          "Undiagnosed diabetes (type 1 or 2); assess DKA risk if rapid onset + abdominal pain",
        action:
          "Fasting glucose, random glucose, HbA1c; venous blood gas if DKA suspected; urinalysis (ketones, glucose); electrolytes",
      },
      {
        features: ["chronic diarrhoea", "abdominal distension", "steatorrhoea", "weight loss"],
        suggests:
          "Malabsorption (coeliac, tropical sprue, Whipple's, chronic pancreatitis); rule out TB/parasitic infection",
        action:
          "FBC (B12/folate deficiency anaemia); albumin; coeliac serology; consider stool microscopy + culture; faecal elastase; CT abdomen if pancreatic disease suspected",
      },
      {
        features: [
          "weight loss",
          "chronic diarrhoea",
          "rectal bleeding",
          "abdominal pain",
          "systemic symptoms",
        ],
        suggests:
          "IBD (Crohn's/ulcerative colitis); chronic infection (TB, parasitic); malabsorption",
        action:
          "FBC, CRP, ESR, albumin; sigmoidoscopy/colonoscopy with biopsy; TB sputum/GeneXpert; stool microscopy",
      },
      {
        features: ["rapid weight loss", "cachexia", "hepatosplenomegaly", "jaundice", "ascites"],
        suggests:
          "Malignancy with hepatic involvement; decompensated liver disease; advanced HIV/opportunistic infection",
        action:
          "LFTs (bilirubin, ALP, ALT, albumin); coagulation; abdominal ultrasound ± CT; AFP/PSA if indicated; HIV test; viral hepatitis serology",
      },
      {
        features: ["weight loss", "oedema", "reduced appetite", "dyspnoea", "elevated JVP"],
        suggests: "Cardiac or renal failure; advanced malignancy; severe infection",
        action:
          "BNP/NT-proBNP; echocardiogram; renal function (creatinine, eGFR); urinalysis (proteinuria); CXR (pulmonary oedema/effusion)",
      },
      {
        features: [
          "fever",
          "night sweats",
          "oral candidiasis",
          "lymphadenopathy",
          "recurrent infections",
        ],
        suggests:
          "Advanced HIV (CD4 < 200); other immunosuppression (malignancy, organ failure, severe infection)",
        action:
          "HIV test + CD4/VL if HIV+; opportunistic infection screening (PCP, CMV, MAC); FBC; LFTs; consider prophylaxis if CD4 < 200",
      },
      {
        features: [
          "weight loss",
          "normal/high appetite",
          "polyuria/polydipsia",
          "abdominal pain",
          "altered mental state",
        ],
        suggests: "Undiagnosed diabetes with DKA; metabolic derangement",
        action:
          "Urgent: venous blood gas, glucose, ketones, electrolytes, renal function; HbA1c; ICU/HDU if DKA confirmed",
      },
    ],
    source: "Hutchison Ch 2-3 (clinical reasoning) — CSO-signed",
  },
  {
    code: "fatigue",
    display: "Fatigue / tiredness",
    triggerCodes: ["fatigue", "fatigue_malaise"],
    problemReprHint:
      "Non-specific systemic symptom requiring broad differential screen — fatigue alone does not narrow diagnosis; prioritize red-flag detection (weight loss, fever, lymphadenopathy, severe anaemia signs, breathlessness at rest) and stratify by pattern (exertional breathlessness suggests cardiac/anaemic; mood/anhedonia suggests mental-health driver; B-symptoms suggest malignancy/TB/HIV). In Uganda, weight loss + fever + constitutional symptoms mandate TB/HIV screening before closure.",
    differential: [
      {
        dx: "Anaemia",
        likelihood: "likely",
        ruleIn: [
          "exertional breathlessness",
          "pallor (conjunctival)",
          "menstrual blood loss history",
          "GI bleed history",
          "dysphagia (iron deficiency)",
        ],
        ruleOut: ["no bleeding stigmata", "normal conjunctival colour"],
      },
      {
        dx: "Depression / anxiety",
        likelihood: "likely",
        ruleIn: [
          "mood disturbance / low mood",
          "anhedonia",
          "sleep disturbance",
          "lack of exertional breathlessness",
          "psychiatric history",
        ],
        ruleOut: [
          "no objective signs (weight, pallor, lymphadenopathy)",
          "normal sleep architecture",
        ],
      },
      {
        dx: "Hypothyroidism",
        likelihood: "likely",
        ruleIn: [
          "cold intolerance",
          "weight gain",
          "bradycardia",
          "dry skin / hair loss",
          "thyroid history",
        ],
        ruleOut: ["no thyroid palpable abnormality", "normal reflexes"],
      },
      {
        dx: "Poor sleep / obstructive sleep apnoea",
        likelihood: "likely",
        ruleIn: [
          "snoring history",
          "witnessed apnoeas",
          "unrefreshing sleep",
          "daytime somnolence",
          "neck circumference / obesity",
        ],
        ruleOut: ["no snoring / apnoeas", "normal sleep architecture on history"],
      },
      {
        dx: "Viral / post-viral illness",
        likelihood: "likely",
        ruleIn: [
          "recent infection (respiratory / GI)",
          "persistent symptoms weeks after acute illness",
          "myalgia",
          "low-grade fever",
        ],
        ruleOut: ["no recent infectious trigger", "no post-viral timeline"],
      },
      {
        dx: "Lifestyle (sedentary, poor nutrition, overwork)",
        likelihood: "likely",
        ruleIn: [
          "excessive work hours / stress",
          "poor diet / malnutrition",
          "physical inactivity",
          "limited rest days",
          "low socioeconomic resources",
        ],
        ruleOut: ["structured work-life balance", "adequate nutrition"],
      },
      {
        dx: "Malignancy",
        likelihood: "must_not_miss",
        ruleIn: [
          "B-symptoms (fever + night sweats + weight loss)",
          "lymphadenopathy",
          "hepatosplenomegaly",
          "age > 40",
          "smoking history (lung)",
          "constitutional symptoms > 2 weeks",
        ],
        ruleOut: ["no weight loss", "no lymphadenopathy", "no B-symptoms"],
      },
      {
        dx: "HIV / AIDS",
        likelihood: "must_not_miss",
        ruleIn: [
          "B-symptoms (fever + night sweats)",
          "weight loss",
          "lymphadenopathy (persistent / generalized)",
          "oral candidiasis",
          "HIV stigmata",
          "high-risk exposure / Uganda endemic",
          "CD4 < 200 (opportunistic infections)",
        ],
        ruleOut: ["no B-symptoms", "no weight loss", "known negative recent test"],
      },
      {
        dx: "Tuberculosis (pulmonary or extrapulmonary)",
        likelihood: "must_not_miss",
        ruleIn: [
          "B-symptoms (fever + night sweats > 2 weeks)",
          "weight loss",
          "chronic cough (pulmonary)",
          "TB exposure / HIV co-infection",
          "lymphadenopathy",
          "Uganda endemic",
        ],
        ruleOut: ["no B-symptoms", "no weight loss", "no TB contact history"],
      },
      {
        dx: "Heart failure",
        likelihood: "must_not_miss",
        ruleIn: [
          "exertional breathlessness",
          "orthopnoea",
          "paroxysmal nocturnal dyspnoea",
          "peripheral oedema",
          "elevated JVP",
          "displaced apex beat",
          "cardiac history / hypertension",
        ],
        ruleOut: ["no exertional breathlessness", "no orthopnoea", "normal heart sounds"],
      },
      {
        dx: "Chronic kidney disease",
        likelihood: "must_not_miss",
        ruleIn: [
          "polyuria",
          "nocturia",
          "pale / puffy face (uraemia)",
          "hypertension history",
          "diabetes / hypertension",
          "anaemia (EPO deficiency)",
        ],
        ruleOut: ["no polyuria", "normal renal function history"],
      },
      {
        dx: "Chronic liver disease",
        likelihood: "must_not_miss",
        ruleIn: [
          "hepatosplenomegaly",
          "jaundice",
          "ascites",
          "alcohol / viral hepatitis history",
          "weight loss",
          "palmar erythema / spider naevi",
        ],
        ruleOut: ["no jaundice", "normal liver palpation"],
      },
      {
        dx: "Diabetes mellitus",
        likelihood: "must_not_miss",
        ruleIn: [
          "polyuria",
          "polydipsia",
          "weight loss (type 1) / gradual onset (type 2)",
          "blurred vision",
          "family history",
          "obesity (type 2)",
        ],
        ruleOut: ["no polyuria / polydipsia", "normal fasting glucose on recent check"],
      },
      {
        dx: "Addison's disease / adrenal insufficiency",
        likelihood: "must_not_miss",
        ruleIn: [
          "postural dizziness / syncope",
          "hyperpigmentation (skin creases / buccal mucosa)",
          "hypotension / postural hypotension",
          "hyponatraemia",
          "weight loss",
          "nausea",
        ],
        ruleOut: ["no hyperpigmentation", "normal blood pressure (upright and supine)"],
      },
      {
        dx: "Severe anaemia (haemoglobin < 7 g/dL)",
        likelihood: "must_not_miss",
        ruleIn: [
          "severe pallor (conjunctival, palmar)",
          "dyspnoea at rest",
          "tachycardia at rest",
          "syncope",
          "angina / cardiac ischaemia",
        ],
        ruleOut: ["no pallor", "normal heart rate"],
      },
      {
        dx: "Occult chronic infection (non-TB: endocarditis, osteomyelitis, abscess)",
        likelihood: "must_not_miss",
        ruleIn: [
          "B-symptoms (low-grade fever > 2 weeks, night sweats)",
          "weight loss",
          "valvular lesion on exam (endocarditis)",
          "focal signs (e.g. splinter nails, Osler nodes)",
          "IVDU history",
        ],
        ruleOut: ["no fever", "no weight loss", "normal cardiac exam"],
      },
    ],
    discriminatingHpc: [
      "Duration of fatigue (acute < 2 weeks vs subacute/chronic); pattern (constant vs episodic vs exertional)?",
      "Physical vs mental fatigue driver — exertional breathlessness (cardiac/anaemic) vs mood/anhedonia (depression/anxiety)?",
      "Associated weight change (loss = malignancy/TB/HIV/CKD/liver; gain = hypothyroidism/lifestyle)?",
      "Fever / night sweats (B-symptoms — malignancy/TB/HIV/occult infection)?",
      "Polyuria / polydipsia (diabetes)?",
      "Cold intolerance (hypothyroidism)?",
      "Sleep pattern + snoring / apnoea witnesses (OSA)?",
      "Breathlessness (exertional → anaemia/cardiac; orthopnoea → heart failure)?",
      "Postural dizziness / syncope (Addison's, anaemia, orthostatic hypotension)?",
      "Pigmentation changes, especially skin creases (Addison's)?",
      "Mood / anhedonia / recent life stressor (depression/anxiety)?",
    ],
    associated: [
      "Breathlessness / pallor (anaemia / heart failure)",
      "B-symptoms: fever, night sweats, weight loss (malignancy, TB, HIV, occult infection)",
      "Polyuria / polydipsia (diabetes, CKD)",
      "Low mood / anhedonia (depression / anxiety)",
      "Postural dizziness + hyperpigmentation (Addison's)",
      "Jaundice / hepatosplenomegaly (chronic liver disease)",
      "Lymphadenopathy / hepatosplenomegaly (malignancy, TB, HIV)",
      "Bleeding (gum bleed, menorrhagia, GI bleed) — rule-out mechanism for anaemia",
    ],
    redFlags: [
      "Fatigue + weight loss + fever + night sweats → malignancy / TB / HIV / occult infection screen mandatory",
      "Severe pallor (conjunctival) → investigate anaemia (Hb < 7 may cause symptoms at rest)",
      "Breathlessness at rest → acute decompensation (heart failure, severe anaemia); investigate immediately",
      "Lymphadenopathy (especially persistent / generalized) → malignancy / TB / HIV",
      "B-symptoms > 2 weeks without explained cause → broaden differential; don't anchor on benign diagnosis",
      "Postural dizziness + hyperpigmentation → Addison's (can precipitate acute crisis)",
      "Bleeding (mucosal, GI, menorrhagia) + fatigue → severe anaemia; transfusion threshold approach",
    ],
    examTargets: [
      {
        area: "Conjunctivae / palms",
        sign: "Pallor",
        discriminates:
          "Anaemia (exertional breathlessness + pallor = high pre-test probability); severe anaemia if conjunctival pallor + dyspnoea at rest",
      },
      {
        area: "Cervical, axillary, inguinal nodes",
        sign: "Lymphadenopathy (tender, rubbery, matted, > 1 cm, fixed)",
        discriminates:
          "Malignancy (esp. > 2 weeks + B-symptoms), TB, HIV; absence makes these less likely but does not exclude",
      },
      {
        area: "Liver edge, spleen tip",
        sign: "Hepatosplenomegaly",
        discriminates:
          "Malignancy, TB, HIV, occult infection, cirrhosis; in isolation, common in Uganda (chronic infection), but + B-symptoms = red flag",
      },
      {
        area: "Thyroid (palpation, size, nodules, bruit)",
        sign: "Enlargement / nodules / bruit (toxic) / firm (Hashimoto's)",
        discriminates:
          "Hypothyroidism (+ cold intolerance, weight gain) vs hyperthyroidism (+ tachycardia, weight loss)",
      },
      {
        area: "Heart (JVP, apex beat, S3, peripheral oedema)",
        sign: "Elevated JVP, displaced apex, S3 gallop, ankle oedema, orthopnoea",
        discriminates:
          "Heart failure (+ exertional breathlessness, orthopnoea = high pre-test); absence reassuring",
      },
      {
        area: "Blood pressure (supine + standing after 1–3 min)",
        sign: "Postural drop > 20 mmHg systolic or > 10 mmHg diastolic OR symptomatic dizziness on standing",
        discriminates: "Addison's (+ hyperpigmentation), severe dehydration, autonomic dysfunction",
      },
      {
        area: "Skin (creases, buccal mucosa, palms)",
        sign: "Hyperpigmentation (brown/bronze tone, esp. creases, knuckles, buccal)",
        discriminates:
          "Addison's disease (if + postural drop + hyponatraemia = must investigate cortisol)",
      },
      {
        area: "Skin, oral cavity, nails",
        sign: "HIV stigmata: oral candidiasis, Kaposi sarcoma, onycholysis; TB stigmata: cachexia, lymphadenopathy",
        discriminates: "HIV/AIDS (+ B-symptoms, low CD4), TB (+ cough, night sweats)",
      },
      {
        area: "BMI, weight loss trajectory",
        sign: "BMI, % weight loss from usual body weight over time",
        discriminates:
          "Lifestyle (obesity; sedentary) vs malignancy/TB/HIV/CKD (progressive weight loss)",
      },
    ],
    historyEmphasis: [
      "Mood disturbance / psychiatric history (depression / anxiety predisposes; screen PHQ-9 / GAD-7)",
      "Sleep history: hours, quality, snoring, witnessed apnoea, daytime somnolence (OSA → fatigue)",
      "HIV / TB history: prior test results, risk factors, TB exposure, endemic region (Uganda: TB/HIV co-infection must be screened)",
      "Menstrual / GI blood loss: menorrhagia, melaena, haematochezia (anaemia mechanism)",
      "Thyroid / renal / liver disease history: prior diagnoses, medications, dialysis, cirrhosis (chronic disease fatigue)",
      "Medications: sedatives, diuretics, beta-blockers, chemotherapy (iatrogenic fatigue drivers)",
      "Diabetes symptoms: polyuria, polydipsia, vision, foot symptoms (glycaemic control poor → fatigue)",
      "Work / social stress: overwork, financial strain, lack of rest days, food insecurity (lifestyle driver)",
      "Smoking / alcohol: tobacco (malignancy risk), alcohol (hepatic disease, neuropathy)",
    ],
    combinations: [
      {
        features: ["weight loss", "fever", "night sweats", "lymphadenopathy"],
        suggests:
          "Malignancy, TB, or HIV/AIDS (B-symptoms cluster = must-not-miss); also endocarditis, chronic osteomyelitis",
        action:
          "FBC, CXR, HIV rapid test, TB-LAMP or GeneXpert sputum; if CXR abnormal or TB exposure → TB screen; if CD4 suspicion → VL + CD4 count",
      },
      {
        features: ["exertional breathlessness", "pallor", "tachycardia"],
        suggests:
          "Moderate-to-severe anaemia (Hb likely 7–9 g/dL) or cardiac cause (heart failure); less likely depression/hypothyroidism",
        action:
          "FBC + smear; ECG; echo if cardiac signs; iron studies / reticulocyte count if anaemia confirmed",
      },
      {
        features: ["postural dizziness", "hyperpigmentation", "hyponatraemia on biochemistry"],
        suggests: "Addison's disease (adrenal crisis risk)",
        action:
          "Stat cortisol 9am (< 3 mcg/dL diagnostic of insufficiency); if critical → IV hydrocortisone 100 mg stat; refer endocrinology",
      },
      {
        features: ["cold intolerance", "weight gain", "dry skin", "bradycardia"],
        suggests: "Hypothyroidism",
        action: "TSH + free T4; if TSH > 10 mIU/L, start levothyroxine titration",
      },
      {
        features: ["snoring", "daytime somnolence", "unrefreshing sleep", "obesity (BMI > 30)"],
        suggests: "Obstructive sleep apnoea",
        action:
          "Sleep study (polysomnography) for confirmation; assess CV risk (HTN, CAD); CPAP trial if moderate-severe",
      },
      {
        features: ["polyuria", "polydipsia", "weight loss", "blurred vision"],
        suggests: "Diabetes mellitus (type 1 acute, type 2 insidious)",
        action:
          "Fasting glucose > 126 or random > 200 + symptoms = diabetes; HbA1c for glycaemic control; refer diabetes clinic",
      },
      {
        features: [
          "low mood",
          "anhedonia",
          "sleep disturbance",
          "no objective signs (pallor, weight loss, fever)",
        ],
        suggests: "Depression / anxiety (primary or secondary to chronic disease)",
        action:
          "PHQ-9 / GAD-7 screening; assess suicidality; psychosocial stressor; trial SSRI if indicated; consider CBT",
      },
      {
        features: ["orthopnoea", "exertional breathlessness", "peripheral oedema", "elevated JVP"],
        suggests: "Heart failure (systolic or diastolic)",
        action:
          "ECG, echo, CXR, BNP/NT-proBNP; assess EF; start ACE-I + diuretic if LVEF low; cardiology referral",
      },
    ],
    source: "Hutchison Ch 2-3 (clinical reasoning) — CSO-signed",
  },
  {
    code: "dizziness",
    display: "Dizziness / vertigo",
    triggerCodes: ["dizziness", "dizziness_vertigo"],
    problemReprHint:
      "Vertigo/dizziness presents across three phenotypes: true spinning (vertigo = vestibular), light-headedness/faint (presyncope = cardiovascular/metabolic), or unsteadiness (disequilibrium = central/multi-system). History type is the FIRST diagnostic discriminator before exam.",
    differential: [
      {
        dx: "Benign Paroxysmal Positional Vertigo (BPPV)",
        likelihood: "likely",
        ruleIn: [
          "Head movement (specific direction) triggers spinning",
          "Very brief duration (seconds)",
          "Nausea/vomiting with true vertigo",
          "Repeatable with positional maneuver",
        ],
        ruleOut: [
          "No hearing loss/tinnitus",
          "No central neurological features",
          "No vascular risk factors",
          "No chest pain/palpitations",
        ],
      },
      {
        dx: "Vestibular Neuritis / Labyrinthitis",
        likelihood: "likely",
        ruleIn: [
          "Days-long duration of true vertigo",
          "Peripheral vestibular pattern (unidirectional nystagmus)",
          "May follow viral illness",
          "Hearing loss and/or tinnitus if labyrinthitis",
        ],
        ruleOut: [
          "No direction-changing nystagmus",
          "No central neurological deficit",
          "No vascular risk factors",
        ],
      },
      {
        dx: "Meniere's disease",
        likelihood: "likely",
        ruleIn: [
          "Hearing loss with vertigo episodes",
          "Tinnitus",
          "Aural fullness sensation",
          "Episodic attacks (hours)",
        ],
        ruleOut: ["No central neurological features", "No stroke risk factors"],
      },
      {
        dx: "Orthostatic Hypotension",
        likelihood: "likely",
        ruleIn: [
          "Light-headedness or faintness (presyncope) on standing",
          "Symptoms on position change (lying to sitting/standing)",
          "Sedating medications or volume depletion history",
          "Postural BP drop ≥20 mmHg systolic",
        ],
        ruleOut: ["No true spinning sensation", "No central neurological features", "No nystagmus"],
      },
      {
        dx: "Presyncope / Cardiac Arrhythmia",
        likelihood: "likely",
        ruleIn: [
          "Faintness, not true spinning",
          "Palpitations",
          "Chest pain/discomfort",
          "History of syncope or palpitations",
          "Cardiac risk factors",
        ],
        ruleOut: ["No nystagmus", "No true vertigo", "Regular ECG rhythm"],
      },
      {
        dx: "Anxiety / Panic",
        likelihood: "likely",
        ruleIn: [
          "Light-headedness or unsteadiness",
          "Associated hyperventilation",
          "Psychological stressors",
          "Disproportionate symptom severity",
        ],
        ruleOut: [
          "No true vertigo with nystagmus",
          "No central neurological features",
          "No objective vital sign abnormality",
        ],
      },
      {
        dx: "Medication side-effect",
        likelihood: "likely",
        ruleIn: [
          "Temporal relationship to initiation of sedating/ototoxic drug",
          "Symptom improvement/resolution on cessation",
          "Dizziness/balance impairment in drug side-effect profile",
        ],
        ruleOut: ["Consider in all cases; less prominent if no clear medication link"],
      },
      {
        dx: "Posterior-circulation stroke / TIA (central vertigo)",
        likelihood: "must_not_miss",
        ruleIn: [
          "Acute onset true vertigo",
          "Associated central neurological deficit: diplopia, dysarthria, dysphagia, focal weakness/numbness",
          "Severe ataxia or gait abnormality",
          "Direction-changing nystagmus",
          "Abnormal HINTS examination (head-impulse, nystagmus, test-of-skew)",
          "Vascular risk factors: age, hypertension, diabetes, atrial fibrillation, smoking",
        ],
        ruleOut: ["Peripheral-only findings argue AGAINST central stroke"],
      },
      {
        dx: "Cerebellar lesion (haemorrhage, infarct, mass)",
        likelihood: "must_not_miss",
        ruleIn: [
          "Inability to stand or walk",
          "Severe ataxia",
          "Severe headache or neck pain",
          "Nausea/vomiting",
          "Central neurological exam findings",
        ],
        ruleOut: ["No pure peripheral vestibular pattern"],
      },
      {
        dx: "Hypoglycaemia",
        likelihood: "must_not_miss",
        ruleIn: [
          "Dizziness/light-headedness with altered mental state or autonomic symptoms",
          "Known diabetes",
          "Insulin or oral hypoglycaemic use",
          "Capillary glucose <3.5 mmol/L",
        ],
        ruleOut: ["Normal capillary glucose rules out acute hypoglycaemia"],
      },
      {
        dx: "Severe anaemia / GI bleed",
        likelihood: "must_not_miss",
        ruleIn: [
          "Presyncope or light-headedness",
          "Pallor",
          "Tachycardia",
          "Melaena or signs of GI blood loss",
          "Dyspnoea on exertion",
        ],
        ruleOut: ["Normal colour, normal heart rate, no melaena argue against"],
      },
      {
        dx: "Vertebrobasilar / cervical vascular pathology",
        likelihood: "must_not_miss",
        ruleIn: [
          "Vascular risk factors",
          "Central neurological features on exam or in discriminating history",
          "Acute onset in high-risk individual",
        ],
        ruleOut: ["Absence of vascular risk or central features de-prioritises this"],
      },
    ],
    discriminatingHpc: [
      "Type of dizziness: true spinning (vertigo) vs light-headedness/faint (presyncope) vs unsteadiness (disequilibrium)?",
      "Trigger for onset: head movement (direction?), standing, exertion, stress, medication start?",
      "Duration: seconds (BPPV), hours (Meniere's), days (neuritis), progressive?",
      "Associated hearing loss, tinnitus, aural fullness (Meniere's/labyrinthitis)?",
      "Associated palpitations, chest pain, syncope history (cardiac)?",
      "Associated neurological symptoms: diplopia, dysarthria, dysphagia, focal weakness/numbness, severe ataxia (CENTRAL MUST-NOT-MISS)?",
      "Recent viral illness (preceding neuritis)?",
      "Ototoxic drug exposure (aminoglycosides, loop diuretics)?",
      "Sedating medication use (orthostatic risk)?",
      "GI bleed risk: melaena, haematemesis, chronic anticoagulation, NSAIDs?",
      "Diabetes or hypoglycaemia risk?",
      "Vascular risk factors: age, hypertension, diabetes, atrial fibrillation, smoking, prior TIA/stroke?",
    ],
    associated: [
      "Hearing loss",
      "Tinnitus",
      "Aural fullness",
      "Diplopia (binocular vision loss)",
      "Dysarthria (slurred speech)",
      "Dysphagia (swallowing difficulty)",
      "Focal weakness or numbness",
      "Severe ataxia or inability to stand/walk",
      "Palpitations",
      "Chest pain or discomfort",
      "Melaena (tarry stool)",
      "Haematemesis (vomiting blood)",
      "Pallor",
      "Dyspnoea on exertion",
      "Severe headache",
      "Neck pain",
      "Nausea and vomiting",
    ],
    redFlags: [
      "New focal neurological deficit (diplopia, dysarthria, dysphagia, weakness, numbness)",
      "Inability to stand or walk safely",
      "Severe headache or neck pain with dizziness",
      "Direction-changing nystagmus (suggests central pathology)",
      "Abnormal HINTS examination findings (head-impulse, nystagmus, test-of-skew)",
      "Vascular risk factors in acute presentation (age, hypertension, diabetes, atrial fibrillation, smoking)",
      "Signs of GI bleed: melaena, haematemesis, haemodynamic instability",
      "Hypoglycaemia confirmed on capillary glucose",
      "Signs of severe anaemia: profound pallor, tachycardia, haemodynamic compromise",
    ],
    examTargets: [
      {
        area: "Neurological exam — cranial nerves",
        sign: "CN III/IV/VI palsy (diplopia), CN VII (facial asymmetry), CN IX/X (dysphonia/dysphagia), CN XII (tongue deviation)",
        discriminates: "Central vs peripheral; stroke localisation",
      },
      {
        area: "Neurological exam — cerebellar",
        sign: "Dysmetria, dysdiadochokinesia, nystagmus (direction and type)",
        discriminates: "Cerebellar vs peripheral; true vertigo vs disequilibrium",
      },
      {
        area: "Neurological exam — gait",
        sign: "Ability to stand, Romberg sign, gait ataxia, veering",
        discriminates: "Severity; central vs peripheral; safety for discharge",
      },
      {
        area: "Nystagmus characterisation",
        sign: "Unidirectional and horizontal (peripheral) vs direction-changing or vertical (central); nystagmus axis and direction relative to gaze",
        discriminates: "Peripheral vs central; HINTS positive/negative",
      },
      {
        area: "HINTS examination (where competent)",
        sign: "Head-impulse test (peripheral = normal VOR; central = abnormal), nystagmus (unidirectional vs direction-changing), test-of-skew (vertical heterophoria; abnormal in central brainstem lesion)",
        discriminates: "Central vs peripheral stroke; urgent imaging threshold",
      },
      {
        area: "Cardiovascular exam — posture",
        sign: "Lying and standing blood pressure, heart rate; orthostatic hypotension (drop ≥20 mmHg systolic or ≥10 mmHg diastolic or symptomatic)",
        discriminates: "Orthostatic vs other cause; medication/volume depletion effect",
      },
      {
        area: "Cardiovascular exam — pulse and rhythm",
        sign: "Pulse rate (tachycardia in anaemia/GI bleed/arrhythmia), regularity (atrial fibrillation risk for TIA/stroke)",
        discriminates: "Cardiac arrhythmia; haemodynamic compromise",
      },
      {
        area: "ECG (if cardiac history or presyncope)",
        sign: "QTc prolongation, arrhythmia, signs of acute MI",
        discriminates: "Cardiac cause; presyncope vs vertigo distinction",
      },
      {
        area: "Ear examination",
        sign: "Nystagmus direction with head turn (Dix–Hallpike for BPPV), ear canal/tympanum (infection, effusion in labyrinthitis), tuning fork tests (sensorineural vs conductive hearing loss in Meniere's/labyrinthitis)",
        discriminates: "Peripheral cause; Meniere's vs BPPV vs neuritis",
      },
      {
        area: "Capillary glucose (point-of-care)",
        sign: "Hypoglycaemia <3.5 mmol/L",
        discriminates: "Metabolic dizziness; urgent treatment threshold",
      },
      {
        area: "General inspection",
        sign: "Pallor (anaemia/GI bleed), diaphoresis, visible tremor or anxiety",
        discriminates: "Anaemia; hypoglycaemia; anxiety vs organic cause",
      },
    ],
    historyEmphasis: [
      "Vascular risk factors (age >60, hypertension, diabetes, atrial fibrillation, smoking, prior TIA/stroke): shifts pre-test probability toward posterior-circulation stroke in acute onset",
      "Cardiac history (prior MI, arrhythmia, syncope, heart failure): shifts toward presyncope/arrhythmia",
      "Ototoxic drug exposure (aminoglycosides, amphotericin B, loop diuretics, NSAIDs, aspirin): shifts toward labyrinthitis/hearing loss",
      "Sedating medication (benzodiazepines, opioids, antipsychotics, tricyclic antidepressants, anticholinergics): shifts toward orthostatic hypotension or medication side-effect",
      "Diabetes or insulin use: shifts toward hypoglycaemia risk and orthostatic hypotension",
      "Chronic GI bleed risk (chronic aspirin/NSAID use, anticoagulation, cirrhosis, peptic ulcer history): shifts toward severe anaemia/GI bleed must-not-miss",
      "Prior vestibular disorder (BPPV, Meniere's, neuritis): raises likelihood of recurrence",
      "Recent viral illness (upper respiratory, viral labyrinthitis syndrome): raises likelihood of vestibular neuritis",
      "Psychological stressors or panic history: context for anxiety as likely differential",
    ],
    combinations: [
      {
        features: [
          "True spinning vertigo",
          "Head movement trigger (specific direction)",
          "Brief duration (seconds)",
          "Nausea/vomiting",
        ],
        suggests: "BPPV",
        action:
          "Perform Dix–Hallpike maneuver; refer ENT/physiotherapy if positive; safety assessment for fall risk",
      },
      {
        features: ["Hearing loss", "Tinnitus", "Aural fullness", "True vertigo episodes (hours)"],
        suggests: "Meniere's disease",
        action:
          "Audiometry; ENT referral; diuretic trial and dietary sodium restriction; neuroimaging if atypical",
      },
      {
        features: [
          "True spinning vertigo",
          "Onset over hours/days",
          "Peripheral nystagmus (unidirectional)",
          "No hearing loss",
        ],
        suggests: "Vestibular neuritis",
        action:
          "Supportive care (vestibular exercises, antiemetics); monitor for central features; neuroimaging if red flags develop",
      },
      {
        features: [
          "Light-headedness or faintness",
          "Symptoms on standing/position change",
          "Hypotensive on lying/standing BP measurement",
        ],
        suggests: "Orthostatic hypotension",
        action:
          "Review sedating/ototoxic drugs; assess volume status; physical counter-maneuvers; compression stockings; repeat BP in supine after 5 minutes then standing after 3 minutes",
      },
      {
        features: ["Presyncope without true vertigo", "Palpitations", "Chest pain"],
        suggests: "Cardiac arrhythmia / presyncope",
        action:
          "ECG; cardiac monitoring; troponin if chest pain; cardiologist referral; hold rate-controlling agents pending review",
      },
      {
        features: [
          "True vertigo or light-headedness",
          "Diplopia, dysarthria, dysphagia, or focal weakness/numbness",
          "Abnormal HINTS findings",
          "Vascular risk factors",
        ],
        suggests: "Posterior-circulation stroke / TIA (CENTRAL MUST-NOT-MISS)",
        action:
          "URGENT neuroimaging (CT/MRI brain); stroke-team activation; ECG and cardiac monitoring; aspirin post-imaging confirmation; time-dependent thrombolytic/thrombectomy eligibility assessment",
      },
      {
        features: [
          "Inability to stand safely",
          "Severe ataxia",
          "Severe headache or neck pain",
          "Nausea/vomiting",
        ],
        suggests: "Cerebellar lesion (haemorrhage, infarct, mass) (CENTRAL MUST-NOT-MISS)",
        action:
          "URGENT neuroimaging (CT brain ±angio); ICU consideration; neurosurgery consultation; airway protection if deteriorating",
      },
      {
        features: [
          "Dizziness with altered mental state or autonomic symptoms",
          "Capillary glucose <3.5 mmol/L",
          "Diabetes history or insulin/oral agent use",
        ],
        suggests: "Hypoglycaemia (MUST-NOT-MISS)",
        action:
          "IMMEDIATE: IV dextrose or oral fast-acting glucose; recheck glucose in 15 minutes; identify cause and prevent recurrence; continuous monitoring",
      },
      {
        features: [
          "Presyncope or light-headedness",
          "Pallor, tachycardia",
          "Melaena or haematemesis",
          "GI bleed risk factors",
        ],
        suggests: "Severe anaemia / GI bleed (MUST-NOT-MISS)",
        action:
          "Full blood count; cross-match; establish IV access; haemodynamic monitoring; gastroenterology/surgery review; blood transfusion if Hb critical or haemodynamic instability",
      },
    ],
    source: "Hutchison Ch 2-3 (clinical reasoning) — CSO-signed",
  },
  {
    code: "cough",
    display: "Cough / haemoptysis",
    triggerCodes: ["cough", "haemoptysis"],
    problemReprHint:
      "Acute vs chronic cough ± haemoptysis: frame as multi-system differential (respiratory, cardiac, infectious, neoplastic, iatrogenic) with Uganda context (high TB burden) and must-not-miss safety gate (TB, lung cancer, pneumonia, PE, heart failure).",
    differential: [
      {
        dx: "TB",
        likelihood: "must_not_miss",
        ruleIn: [
          "chronic cough >8 weeks",
          "haemoptysis",
          "night sweats",
          "weight loss",
          "TB contact history",
        ],
        ruleOut: ["acute onset <3 weeks", "lack of constitutional symptoms"],
      },
      {
        dx: "Pneumonia/sepsis",
        likelihood: "must_not_miss",
        ruleIn: ["fever", "purulent sputum", "acute onset", "respiratory distress", "hypoxia"],
        ruleOut: ["afebrile with clear sputum"],
      },
      {
        dx: "Pulmonary embolism",
        likelihood: "must_not_miss",
        ruleIn: ["haemoptysis", "pleuritic pain", "dyspnoea", "leg swelling", "hypoxia"],
        ruleOut: ["absence of pleuritic pain", "no leg swelling", "normal perfusion"],
      },
      {
        dx: "Lung cancer",
        likelihood: "must_not_miss",
        ruleIn: [
          "chronic cough >3-8 weeks",
          "haemoptysis",
          "smoking history",
          "weight loss",
          "age",
          "occupational exposure",
        ],
        ruleOut: ["acute onset", "young non-smoker", "lack of constitutional symptoms"],
      },
      {
        dx: "Heart failure",
        likelihood: "must_not_miss",
        ruleIn: [
          "orthopnoea",
          "PND",
          "dyspnoea",
          "paroxysmal nocturnal dyspnoea",
          "cardiac history",
        ],
        ruleOut: ["absence of orthopnoea/PND", "no cardiac risk factors"],
      },
      {
        dx: "Upper respiratory tract infection (URTI)",
        likelihood: "likely",
        ruleIn: ["acute onset <3 weeks", "dry cough", "nasal symptoms", "rhinitis features"],
        ruleOut: ["chronic cough >8 weeks", "haemoptysis", "weight loss", "night sweats"],
      },
      {
        dx: "Acute bronchitis",
        likelihood: "likely",
        ruleIn: ["acute cough", "productive sputum", "post-viral", "no consolidation"],
        ruleOut: ["chronic course >8 weeks", "fever + purulence suggesting pneumonia"],
      },
      {
        dx: "Asthma/COPD",
        likelihood: "likely",
        ruleIn: ["wheeze", "dyspnoea", "smoking history", "reversible airflow obstruction"],
        ruleOut: ["haemoptysis as primary feature", "fever + infiltrate suggesting infection"],
      },
      {
        dx: "Post-nasal drip",
        likelihood: "likely",
        ruleIn: ["productive cough", "nasal discharge", "rhinitis history"],
        ruleOut: ["haemoptysis", "weight loss", "night sweats"],
      },
      {
        dx: "GORD",
        likelihood: "likely",
        ruleIn: ["chronic cough", "heartburn", "supine symptoms", "cough on lying down"],
        ruleOut: ["haemoptysis", "fever", "weight loss"],
      },
      {
        dx: "ACE-inhibitor cough",
        likelihood: "likely",
        ruleIn: ["dry cough", "on ACE-inhibitor", "temporal relationship to medication start"],
        ruleOut: ["haemoptysis", "fever", "weight loss"],
      },
      {
        dx: "Bronchiectasis",
        likelihood: "less_likely",
        ruleIn: [
          "chronic productive cough",
          "haemoptysis",
          "prior lung disease",
          "recurrent infections",
        ],
        ruleOut: ["acute onset", "lack of prior chronic cough"],
      },
    ],
    discriminatingHpc: [
      "Duration (acute <3 weeks vs chronic >8 weeks)",
      "Sputum character (dry vs productive; colour/volume)",
      "Haemoptysis quantification and duration",
      "Fever presence and pattern",
      "Wheeze",
      "Weight loss and night sweats",
      "Orthopnoea and PND",
      "ACE-inhibitor use and timing",
      "Pleuritic pain",
      "Leg swelling",
      "Smoking history",
      "TB contact history",
      "Prior TB",
      "HIV status",
    ],
    associated: [
      "Night sweats + weight loss + haemoptysis (TB/malignancy indicator)",
      "Pleuritic pain + leg swelling (PE indicator)",
      "Fever + purulent sputum (pneumonia indicator)",
      "Orthopnoea + PND (heart failure indicator)",
      "Smoking history (lung cancer/COPD risk)",
      "Occupational exposure (malignancy/bronchiectasis risk)",
    ],
    redFlags: [
      "Haemoptysis (especially with weight loss, smoking, age >40)",
      "Chronic cough >3-8 weeks duration",
      "Breathlessness or hypoxia on exam",
      "Systemic features (fever, weight loss, night sweats)",
      "Clinical signs of consolidation/effusion/hypoxia → mandate CXR + TB work-up + malignancy assessment",
      "Uganda context: low threshold for TB exclusion",
    ],
    examTargets: [
      {
        area: "Vital signs",
        sign: "RR elevation, SpO2 <94%, fever",
        discriminates: "Acute infection, pneumonia, PE, hypoxia severity",
      },
      {
        area: "Lymph nodes + body habitus",
        sign: "Lymphadenopathy, cachexia",
        discriminates: "TB, lung cancer, other malignancy",
      },
      {
        area: "Chest exam",
        sign: "Consolidation, effusion, wheeze, crackles, decreased air entry",
        discriminates: "Pneumonia, PE, asthma/COPD, heart failure, bronchiectasis",
      },
      {
        area: "Nails/digits",
        sign: "Clubbing",
        discriminates: "Lung cancer, bronchiectasis, chronic lung disease",
      },
      {
        area: "Cardiac exam",
        sign: "Elevated JVP, peripheral oedema, heart failure signs",
        discriminates: "Heart failure as cough aetiology",
      },
      {
        area: "Lower limbs",
        sign: "Calf swelling, warmth, tenderness (DVT signs)",
        discriminates: "Thromboembolism → PE",
      },
    ],
    historyEmphasis: [
      "TB contact/prior TB history (Uganda endemic setting)",
      "HIV status (TB risk amplifier, immunocompromise)",
      "Smoking history and pack-years (lung cancer, COPD)",
      "Occupational exposure (malignancy, bronchiectasis, silicosis)",
      "ACE-inhibitor use and timeline (medication-induced cough)",
      "VTE risk factors (PE differential)",
      "Cardiac history and heart failure risk (HF-induced cough)",
      "Prior lung disease or recurrent infections (bronchiectasis)",
    ],
    combinations: [
      {
        features: ["chronic cough >8 weeks", "night sweats", "weight loss"],
        suggests: "TB or malignancy (high pre-test probability in Uganda)",
        action:
          "Obtain CXR, TB work-up (sputum microscopy ± GeneXpert), malignancy assessment (smoking/age >40)",
      },
      {
        features: ["haemoptysis", "pleuritic pain", "leg swelling"],
        suggests: "Pulmonary embolism until excluded",
        action: "Assess hypoxia, obtain CXR, evaluate VTE risk, consider CT-PE protocol",
      },
      {
        features: ["fever", "acute cough", "purulent sputum", "focal consolidation on exam"],
        suggests: "Bacterial pneumonia ± sepsis",
        action: "CXR, blood cultures if systemically unwell, empiric antibiotics based on severity",
      },
      {
        features: ["orthopnoea", "PND", "dyspnoea", "peripheral oedema"],
        suggests: "Heart failure as primary cause of cough",
        action:
          "Assess JVP, lung crackles, obtain CXR (pulmonary oedema pattern), consider echocardiography",
      },
      {
        features: ["dry cough", "on ACE-inhibitor", "no other pulmonary features"],
        suggests: "Medication-induced (ACE-inhibitor) cough",
        action:
          "Timeline match; consider switch to ARB or other class; trial cessation if diagnostic uncertainty",
      },
      {
        features: ["wheeze", "dyspnoea", "smoking history"],
        suggests: "Asthma or COPD exacerbation",
        action:
          "Spirometry, peak flow, response to bronchodilator; CXR to exclude infection/other pathology",
      },
    ],
    source: "Hutchison Ch 2-3 (clinical reasoning) — CSO-signed",
  },
  {
    code: "jaundice",
    display: "Jaundice",
    triggerCodes: ["jaundice"],
    problemReprHint:
      "Jaundice in an adult patient; frame as a differential of pre-hepatic (haemolysis), hepatic (liver synthetic dysfunction), and post-hepatic/obstructive (biliary obstruction) aetiologies. Distinguish benign from life-threatening: viral hepatitis and gallstones (common) vs acute liver failure, sepsis from ascending cholangitis, and malignancy (time-critical). Clinical urgency escalates with fever, RUQ pain, encephalopathy, or coagulopathy.",
    differential: [
      {
        dx: "Viral hepatitis",
        likelihood: "likely",
        ruleIn: [
          "prodromal symptoms (malaise, nausea, myalgia)",
          "lack of RUQ pain",
          "no obstructive features",
        ],
        ruleOut: [
          "painless progressive weight loss",
          "pale stools with dark urine and itch (obstruction)",
          "fever + RUQ pain",
        ],
      },
      {
        dx: "Alcoholic liver disease",
        likelihood: "likely",
        ruleIn: ["heavy alcohol history", "no obstructive features"],
        ruleOut: [
          "painless progressive weight loss",
          "fever + RUQ pain + dark urine with pale stools",
        ],
      },
      {
        dx: "Gallstones (obstructive/cholecystitis)",
        likelihood: "likely",
        ruleIn: ["pale stools + dark urine + pruritus", "RUQ pain", "no fever"],
        ruleOut: [
          "fever + RUQ pain (suggests cholangitis, not simple cholecystitis)",
          "progressive weight loss without prior episodes",
        ],
      },
      {
        dx: "Drug-induced liver injury",
        likelihood: "likely",
        ruleIn: [
          "recent exposure to paracetamol, herbal remedies, or TB drugs",
          "absence of obstructive features",
        ],
        ruleOut: ["fever + RUQ pain", "progressive weight loss"],
      },
      {
        dx: "Haemolysis",
        likelihood: "likely",
        ruleIn: ["anaemia symptoms", "dark urine but normal/pale stools"],
        ruleOut: ["pale stools + dark urine + pruritus (obstructive)", "fever + RUQ pain"],
      },
      {
        dx: "Ascending cholangitis",
        likelihood: "must_not_miss",
        ruleIn: [
          "fever + RUQ pain + jaundice (Charcot triad)",
          "signs of sepsis (tachycardia, hypotension, altered mentation)",
        ],
        ruleOut: ["afebrile presentation with painless progressive jaundice"],
      },
      {
        dx: "Pancreatic or biliary malignancy",
        likelihood: "must_not_miss",
        ruleIn: [
          "painless progressive jaundice",
          "weight loss",
          "palpable gallbladder on exam (Courvoisier sign)",
        ],
        ruleOut: ["acute presentation with fever + RUQ pain", "prodromal viral symptoms"],
      },
      {
        dx: "Acute liver failure",
        likelihood: "must_not_miss",
        ruleIn: [
          "encephalopathy (confusion/altered mentation)",
          "coagulopathy (bruising/bleeding)",
          "rapidly progressive jaundice",
        ],
        ruleOut: [
          "stable clinical presentation",
          "absence of neurological or bleeding manifestations",
        ],
      },
      {
        dx: "Fulminant hepatitis",
        likelihood: "must_not_miss",
        ruleIn: ["encephalopathy + coagulopathy", "rapid clinical deterioration"],
        ruleOut: ["gradual onset", "absence of acute liver failure signs"],
      },
      {
        dx: "Severe malaria or sickle-cell haemolytic crisis",
        likelihood: "must_not_miss",
        ruleIn: [
          "Uganda context: fever, anaemia, jaundice",
          "sickle-cell disease or malaria risk exposure",
          "pallor, splenomegaly",
        ],
        ruleOut: ["afebrile presentation", "absence of anaemia symptoms or haemolytic stigmata"],
      },
      {
        dx: "Decompensated cirrhosis with bleeding",
        likelihood: "must_not_miss",
        ruleIn: [
          "jaundice with GI bleeding",
          "bruising/coagulopathy",
          "signs of portal hypertension (ascites, spider naevi)",
        ],
        ruleOut: ["stable jaundice without bleeding or portal hypertension signs"],
      },
    ],
    discriminatingHpc: [
      "Urine colour and stool colour (pale stools + dark urine → obstructive; dark urine + normal stool → pre-hepatic)",
      "Fever and RUQ pain (present → cholangitis/acute abdomen; absent → non-obstructive or uncomplicated gallstones)",
      "Pruritus (obstructive bile duct obstruction)",
      "Prodromal symptoms: malaise, nausea, myalgia, headache (viral hepatitis)",
      "Alcohol consumption (heavy use → alcoholic liver disease)",
      "Drug exposure: paracetamol, herbal remedies, TB drugs (drug-induced liver injury)",
      "Weight loss: painless progressive (malignancy); gradual (chronic liver disease)",
      "Anaemia symptoms: fatigue, dyspnoea, palpitations (haemolysis, malaria, sickle-cell)",
      "Confusion, asterixis, bleeding (hepatic encephalopathy and coagulopathy → acute liver failure)",
      "Risk factors for hepatitis: transfusion, sexual contact, IVDU, tattoos",
      "Sickle-cell or malaria risk in Uganda context",
    ],
    associated: [
      "Fever + RUQ pain (cholangitis, acute cholecystitis, ascending choledocholithiasis)",
      "Confusion, asterixis, bruising (hepatic encephalopathy and coagulopathy in acute liver failure)",
      "Pale stools, dark urine, pruritus (biliary obstruction)",
      "Weight loss (malignancy, decompensated cirrhosis, chronic hepatitis)",
      "Anaemia (haemolysis, malaria, sickle-cell crisis, chronic liver disease)",
      "GI bleeding (decompensated cirrhosis, portal hypertension)",
      "Splenomegaly (malaria, sickle-cell crisis, cirrhosis with portal hypertension, viral hepatitis)",
      "Lymphadenopathy (viral hepatitis, malignancy, tuberculosis)",
    ],
    redFlags: [
      "Jaundice + fever + RUQ pain (ascending cholangitis → sepsis, requires urgent antibiotics and drainage)",
      "Encephalopathy or asterixis + coagulopathy (acute liver failure → ICU, transplant consideration)",
      "GI bleeding (haematemesis, melaena) with jaundice (decompensated cirrhosis, variceal bleeding → resuscitation, endoscopy)",
      "Signs of sepsis: tachycardia, hypotension, tachypnoea, altered mentation (cholangitis, fulminant hepatitis)",
      "Rapidly progressive jaundice over days (fulminant hepatitis, acute liver failure)",
    ],
    examTargets: [
      {
        area: "Vital signs",
        sign: "Fever, tachycardia, hypotension, tachypnoea",
        discriminates:
          "Sepsis from ascending cholangitis or fulminant hepatitis vs stable chronic liver disease or uncomplicated gallstones",
      },
      {
        area: "General appearance",
        sign: "Pallor",
        discriminates: "Anaemia from haemolysis, malaria, or sickle-cell crisis",
      },
      {
        area: "Hepatic stigmata",
        sign: "Spider naevi, palmar erythema, ascites",
        discriminates:
          "Chronic liver disease (cirrhosis) vs acute hepatitis or obstructive jaundice",
      },
      {
        area: "Neurological examination",
        sign: "Encephalopathy, asterixis (flap), confusion",
        discriminates: "Acute liver failure vs other causes of jaundice",
      },
      {
        area: "Skin and mucosae",
        sign: "Bruising, petechiae",
        discriminates: "Coagulopathy from acute liver failure vs other causes",
      },
      {
        area: "Abdomen: RUQ",
        sign: "Hepatomegaly, RUQ tenderness, Murphy's sign, palpable gallbladder",
        discriminates:
          "Hepatitis/cirrhosis vs cholecystitis/cholangitis vs gallstone obstruction. Courvoisier sign (painless palpable gallbladder) suggests malignancy",
      },
      {
        area: "Abdomen: general",
        sign: "Splenomegaly, lymphadenopathy",
        discriminates:
          "Malaria, sickle-cell crisis, viral hepatitis, malignancy vs simple gallstones",
      },
      {
        area: "Abdomen: peritoneal",
        sign: "Ascites, rebound, guarding",
        discriminates:
          "Portal hypertension/decompensated cirrhosis vs acute peritonitis (cholangitis, cholecystitis)",
      },
    ],
    historyEmphasis: [
      "Alcohol consumption: frequency, quantity, duration (alcoholic liver disease risk)",
      "Hepatitis exposure: transfusion history, sexual contact, IVDU, tattoos, healthcare work (viral hepatitis risk)",
      "Drug history: paracetamol use/overdose, herbal remedies, TB drugs, other hepatotoxins (drug-induced liver injury)",
      "Sickle-cell disease or malaria risk exposure in Uganda context (haemolytic crisis)",
      "Prior episodes of biliary colic or gallstones (recurrent choledocholithiasis vs malignancy masquerading as stones)",
      "Weight loss: duration, unintentional (malignancy, chronic liver disease)",
      "Chronic liver disease: prior cirrhosis diagnosis, portal hypertension, variceal bleeding (decompensated cirrhosis)",
      "Rapid vs gradual onset of jaundice (acute hepatitis/liver failure vs chronic/malignancy)",
    ],
    combinations: [
      {
        features: ["Fever", "RUQ pain", "Jaundice"],
        suggests:
          "Ascending cholangitis (Charcot triad), acute cholecystitis, or choledocholithiasis with infection",
        action:
          "Urgent: obtain imaging (ultrasound/ERCP), blood cultures, lactate; start broad-spectrum antibiotics; monitor for septic shock",
      },
      {
        features: [
          "Encephalopathy",
          "Coagulopathy (bruising/bleeding)",
          "Rapidly progressive jaundice",
        ],
        suggests: "Acute liver failure or fulminant hepatitis",
        action:
          "ICU admission, urgent labs (INR, prothrombin time, ammonia), consider transfer for transplant evaluation, supportive care",
      },
      {
        features: ["Pale stools", "Dark urine", "Pruritus", "RUQ pain (if present)"],
        suggests: "Post-hepatic/obstructive jaundice (gallstones, cholangitis, or malignancy)",
        action:
          "Ultrasound to visualise biliary tree and pancreas; if fever + RUQ pain → urgent ERCP; if painless progressive → malignancy workup (CT, CA 19-9)",
      },
      {
        features: [
          "Anaemia symptoms",
          "Dark urine",
          "Normal/pale stools",
          "No obstructive features",
        ],
        suggests: "Pre-hepatic jaundice (haemolysis, malaria, or sickle-cell crisis)",
        action:
          "Full blood count, peripheral blood smear, reticulocyte count, LDH, haptoglobin; in Uganda → malaria test, sickle-cell screen",
      },
      {
        features: [
          "Prodromal illness (malaise, nausea, myalgia)",
          "No obstructive features",
          "No fever + RUQ pain",
        ],
        suggests: "Viral hepatitis",
        action:
          "Serologies (hepatitis A/B/C/E), transaminases; supportive care; counsel on transmission; monitor for fulminant course",
      },
      {
        features: [
          "Painless progressive jaundice",
          "Weight loss",
          "Palpable gallbladder (Courvoisier)",
        ],
        suggests: "Pancreatic or biliary malignancy",
        action:
          "Urgent imaging: CT abdomen/pelvis with contrast; arrange oncology referral; consider ERCP for stent if obstructed",
      },
      {
        features: ["GI bleeding (haematemesis/melaena)", "Jaundice", "Ascites", "Spider naevi"],
        suggests: "Decompensated cirrhosis with variceal bleeding",
        action:
          "ICU, resuscitation, urgent endoscopy, variceal banding/sclerotherapy, transfusion support, FFP for coagulopathy",
      },
      {
        features: ["Jaundice", "Fever", "Splenomegaly", "Pallor", "Anaemia symptoms"],
        suggests: "Severe malaria or sickle-cell haemolytic crisis (Uganda context)",
        action:
          "Malaria test (RDT/blood smear), sickle-cell screen/Hb electrophoresis, full blood count; malaria → artemisinin-based therapy, blood transfusion support if severe",
      },
    ],
    source: "Hutchison Ch 2-3 (clinical reasoning) — CSO-signed",
  },
  {
    code: "gi_bleeding",
    display: "Gastrointestinal bleeding",
    triggerCodes: ["haematemesis", "rectal_bleeding", "melaena"],
    problemReprHint:
      "Frame as acute gastrointestinal bleeding with bifurcated differential: upper-GI source (above ligament of Treitz) vs lower-GI source (below), stratified by risk. The presenting pattern (haematemesis/melaena vs fresh PR bleeding) and haemodynamic status are initial discriminators. Must-not-miss pathologies are decompensated variceal disease, major upper-GI bleed with shock, colorectal malignancy, aorto-enteric fistula, and ruptured AAA presenting as GI collapse.",
    differential: [
      {
        dx: "Peptic ulcer disease (duodenal or gastric)",
        likelihood: "likely",
        ruleIn: ["haematemesis or melaena", "NSAID use", "epigastric pain", "prior ulcer history"],
        ruleOut: [
          "fresh bright red PR bleeding alone",
          "weight loss with bowel change",
          "liver stigmata",
        ],
      },
      {
        dx: "Gastritis or oesophagitis",
        likelihood: "likely",
        ruleIn: [
          "haematemesis or coffee-ground vomit",
          "alcohol use",
          "retrosternal or epigastric discomfort",
        ],
        ruleOut: [
          "melaena (suggests more distal source)",
          "significant volume loss with shock",
          "weight loss",
        ],
      },
      {
        dx: "Mallory-Weiss tear",
        likelihood: "likely",
        ruleIn: ["haematemesis following forceful vomiting or retching", "alcohol use"],
        ruleOut: ["melaena as primary symptom", "haemodynamic instability", "known varices"],
      },
      {
        dx: "Variceal haemorrhage (oesophageal or gastric)",
        likelihood: "must_not_miss",
        ruleIn: [
          "known liver disease or cirrhosis",
          "haemodynamic instability or shock",
          "large-volume haematemesis",
          "melaena",
          "ascites or liver stigmata on exam",
        ],
        ruleOut: ["isolated haemorrhoids", "diverticular disease", "NSAID use as sole risk factor"],
      },
      {
        dx: "Haemorrhoids (internal)",
        likelihood: "likely",
        ruleIn: [
          "fresh bright red blood on toilet paper or in pan",
          "visible with straining",
          "pain with defaecation",
        ],
        ruleOut: [
          "haematemesis or melaena",
          "weight loss",
          "anaemia without clear source",
          "abdominal pain",
        ],
      },
      {
        dx: "Diverticular disease",
        likelihood: "likely",
        ruleIn: ["bright red PR bleeding", "age >40", "no pain typically"],
        ruleOut: ["haematemesis", "weight loss", "fever", "altered bowel habit as primary feature"],
      },
      {
        dx: "Colorectal cancer",
        likelihood: "must_not_miss",
        ruleIn: [
          "weight loss",
          "altered bowel habit",
          "anaemia",
          "PR bleeding",
          "family history or risk factors",
        ],
        ruleOut: ["acute massive haemorrhage", "haematemesis", "known haemorrhoids alone"],
      },
      {
        dx: "Inflammatory bowel disease (Crohn or ulcerative colitis)",
        likelihood: "likely",
        ruleIn: [
          "PR bleeding with mucus or diarrhoea",
          "abdominal pain or cramping",
          "weight loss",
          "prior diagnosis",
        ],
        ruleOut: ["acute shock presentation", "haematemesis alone", "clear mechanical source"],
      },
      {
        dx: "Angiodysplasia",
        likelihood: "less_likely",
        ruleIn: ["occult or intermittent PR bleeding", "age >60", "no other clear source"],
        ruleOut: ["acute massive bleeding", "weight loss", "mechanical obstruction"],
      },
      {
        dx: "Aorto-enteric fistula",
        likelihood: "must_not_miss",
        ruleIn: [
          "major upper-GI bleed with shock",
          "prior aortic surgery or repair",
          "abdominal/back pain",
          "haemodynamic collapse",
        ],
        ruleOut: ["isolated haemorrhoids", "chronic bleeding pattern"],
      },
      {
        dx: "Ruptured abdominal aortic aneurysm (AAA)",
        likelihood: "must_not_miss",
        ruleIn: [
          "haemodynamic shock or collapse",
          "abdominal or back pain",
          "pulsatile abdominal mass",
          "age >60 with cardiovascular risk",
        ],
        ruleOut: ["isolated PR bleeding", "haemorrhoids"],
      },
      {
        dx: "Major upper-GI bleed with shock",
        likelihood: "must_not_miss",
        ruleIn: [
          "haemodynamic instability or syncope",
          "large-volume haematemesis or melaena",
          "pallor",
          "tachycardia",
          "hypotension",
        ],
        ruleOut: ["haemodynamically stable patient"],
      },
    ],
    discriminatingHpc: [
      "Haematemesis vs melaena vs fresh bright red PR bleeding (anatomic localization)",
      "Coffee-ground vomitus (suggest slower upper bleed)",
      "Volume of blood loss (major vs minor)",
      "Haemodynamic symptoms: dizziness, syncope, dyspnoea",
      "NSAID, aspirin, or anticoagulant use",
      "Alcohol use and quantity",
      "Known liver disease or cirrhosis",
      "Prior peptic ulcer, variceal bleed, or GI procedures",
      "Weight loss and duration",
      "Bowel habit change: diarrhoea, constipation, altered calibre",
      "Abdominal pain: character, location, duration",
      "Back pain (AAA concern)",
      "Straining or constipation (haemorrhoid context)",
    ],
    associated: [
      "Dizziness or lightheadedness (significant volume loss)",
      "Syncope (major bleed or shock)",
      "Pallor and fatigue (anaemia from chronic or acute blood loss)",
      "Liver disease stigmata: jaundice, spider naevi, palmar erythema, gynaecomastia (varices risk)",
      "Ascites (cirrhosis and variceal risk)",
      "Weight loss and altered bowel habit (malignancy concern)",
      "Abdominal or back pain (AAA, aorto-enteric fistula, severe pancreatic/gastric pathology)",
      "Fever (infectious gastroenteritis, IBD flare, diverticulitis)",
    ],
    redFlags: [
      "Haemodynamic instability: hypotension, shock, syncope",
      "Large-volume bleeding or ongoing haemorrhage",
      "Known cirrhosis or variceal history",
      "Abdominal or back pain with shock (AAA concern)",
      "Pulsatile abdominal mass",
      "Prior aortic surgery (aorto-enteric fistula risk)",
      "Age >60 with cardiovascular risk and collapse (AAA rupture)",
      "Pallor indicating significant anaemia",
    ],
    examTargets: [
      {
        area: "Vital signs and shock assessment",
        sign: "Hypotension, tachycardia, tachypnoea, altered mental status, poor perfusion",
        discriminates: "Identifies major bleed requiring resuscitation and urgent endoscopy",
      },
      {
        area: "Abdominal examination",
        sign: "Pulsatile mass, expansile pulsation, epigastric tenderness",
        discriminates: "Detects AAA rupture (must-not-miss) vs localised GI pathology",
      },
      {
        area: "Abdominal palpation",
        sign: "Liver size, splenomegaly, ascites, abdominal masses",
        discriminates: "Liver stigmata suggest varices; masses suggest malignancy",
      },
      {
        area: "Liver stigmata",
        sign: "Jaundice, spider naevi, palmar erythema, gynaecomastia",
        discriminates: "Cirrhosis and decompensation → variceal bleeding",
      },
      {
        area: "Rectal examination",
        sign: "Melaena, bright red blood, internal/external haemorrhoids, masses, stool calibre",
        discriminates:
          "Haemorrhoids vs melaena (upper source) vs colorectal mass; direct inspection of bleeding site",
      },
      {
        area: "General inspection",
        sign: "Pallor, cyanosis, visible distension",
        discriminates:
          "Significant anaemia or shock; abdominal distension suggests other pathology",
      },
    ],
    historyEmphasis: [
      "NSAID, aspirin, and anticoagulant use (peptic ulcer risk, ongoing bleeding risk)",
      "Alcohol consumption: quantity, pattern, duration (gastritis, varices, liver disease)",
      "Liver disease or cirrhosis: known diagnosis, hepatitis exposure, transfusion history",
      "Prior GI bleeding: peptic ulcer, variceal bleed, interventions (endoscopy, banding)",
      "Prior aortic surgery or aneurysm repair (aorto-enteric fistula risk)",
      "Cardiovascular risk factors: age >60, hypertension, smoking (AAA risk)",
      "Weight loss: amount, duration, context (malignancy concern)",
      "Bowel habit change: constipation, diarrhoea, altered calibre (IBD, cancer)",
      "Family history of colorectal cancer or polyposis",
      "Rheumatological or autoimmune disease (IBD association)",
    ],
    combinations: [
      {
        features: ["haematemesis or coffee-ground vomit", "NSAID use"],
        suggests: "Peptic ulcer or gastritis",
        action: "Early endoscopy for visualisation and haemostasis; consider proton-pump inhibitor",
      },
      {
        features: ["haematemesis", "known cirrhosis or liver stigmata", "haemodynamic instability"],
        suggests: "Variceal haemorrhage (decompensated liver disease)",
        action:
          "Urgent resuscitation, variceal band ligation or sclerotherapy, consider octreotide; ICU-level care",
      },
      {
        features: ["fresh bright red PR bleeding", "visible haemorrhoids", "pain with defaecation"],
        suggests: "Internal haemorrhoids",
        action:
          "Conservative management; exclude upper source if anaemic or ongoing; reassess if persistent",
      },
      {
        features: ["PR bleeding", "weight loss", "altered bowel habit", "anaemia"],
        suggests: "Colorectal malignancy",
        action: "Urgent colonoscopy for direct visualisation and biopsy; staging if confirmed",
      },
      {
        features: ["PR bleeding", "abdominal pain or cramping", "diarrhoea or mucus"],
        suggests: "Inflammatory bowel disease",
        action:
          "Colonoscopy for mucosal assessment and biopsy; inflammatory markers (CRP, faecal calprotectin)",
      },
      {
        features: ["major upper-GI bleed", "haemodynamic shock", "syncope"],
        suggests:
          "Life-threatening upper-GI source (varices, aorto-enteric fistula, or massive ulcer bleed)",
        action:
          "Resuscitation, urgent endoscopy, cross-matched blood; vascular surgery standby if aorto-enteric suspected",
      },
      {
        features: ["abdominal or back pain", "haemodynamic collapse", "pulsatile mass"],
        suggests: "Ruptured abdominal aortic aneurysm",
        action:
          "Emergency CT angiography or bedside ultrasound; vascular surgery emergency; massive transfusion protocol",
      },
      {
        features: ["bright red PR bleeding", "age >40", "no pain"],
        suggests: "Diverticular disease",
        action:
          "Colonoscopy to exclude other sources; conservative management if source identified; repeat exam if recurrent",
      },
    ],
    source: "Hutchison Ch 2-3 (clinical reasoning) — CSO-signed",
  },
  {
    code: "oedema",
    display: "Oedema / leg swelling",
    triggerCodes: ["oedema", "ankle_leg_swelling"],
    problemReprHint:
      "Frame as: unilateral vs bilateral swelling; if unilateral + painful calf → DVT/cellulitis must dominate; if bilateral → shift focus to systemic causes (cardiac, renal, hepatic, nutritional); onset pattern (acute vs insidious) and triggers (immobility, recent trauma, medication) reshape pre-test probability",
    differential: [
      {
        dx: "Dependent/venous insufficiency",
        likelihood: "likely",
        ruleIn: [
          "bilateral symmetric swelling",
          "chronic history",
          "improved with elevation",
          "worse at end of day",
          "normal urine dipstick",
        ],
        ruleOut: [
          "unilateral onset",
          "acute painful calf",
          "fever/erythema",
          "frothy urine",
          "dyspnoea/orthopnoea",
        ],
      },
      {
        dx: "Heart failure",
        likelihood: "likely",
        ruleIn: [
          "bilateral symmetric swelling",
          "associated dyspnoea",
          "orthopnoea/PND",
          "JVP elevation",
          "peripheral crepitations",
        ],
        ruleOut: [
          "unilateral tender calf",
          "unilateral erythema",
          "normal JVP",
          "no breathlessness",
        ],
      },
      {
        dx: "Hypoalbuminaemia (nephrotic/liver/malnutrition)",
        likelihood: "likely",
        ruleIn: [
          "bilateral swelling",
          "periorbital oedema",
          "frothy urine (nephrotic)",
          "ascites/jaundice (liver)",
          "low albumin context",
        ],
        ruleOut: [
          "unilateral swelling",
          "fever/erythema",
          "calf tenderness",
          "normal urine dipstick (nephrotic)",
        ],
      },
      {
        dx: "Drug-induced (calcium channel blockers)",
        likelihood: "likely",
        ruleIn: [
          "bilateral symmetric swelling",
          "on CCB therapy",
          "timeline matches drug start",
          "absence of systemic disease",
        ],
        ruleOut: ["unilateral swelling", "fever", "dyspnoea", "proteinuria"],
      },
      {
        dx: "Lymphoedema",
        likelihood: "likely",
        ruleIn: [
          "chronic progressive swelling",
          "non-pitting",
          "history of lymph node dissection/malignancy/infection",
          "upper limb involvement possible",
        ],
        ruleOut: ["acute onset", "pitting swelling", "fever", "unilateral painful calf"],
      },
      {
        dx: "Deep vein thrombosis",
        likelihood: "must_not_miss",
        ruleIn: [
          "unilateral tender swollen calf",
          "acute onset",
          "calf circumference increase",
          "VTE risk factor (immobility/surgery/malignancy/OCP/pregnancy)",
          "positive Homan's sign/calf tenderness",
        ],
        ruleOut: [
          "bilateral symmetric swelling",
          "normal calf circumference",
          "no pain",
          "no VTE risk factors",
          "no unilateral erythema/warmth",
        ],
      },
      {
        dx: "Cellulitis",
        likelihood: "must_not_miss",
        ruleIn: [
          "unilateral swelling",
          "fever",
          "erythema/warmth",
          "demarcated borders",
          "recent trauma/skin breach",
          "pain",
          "systemic toxicity",
        ],
        ruleOut: [
          "bilateral swelling",
          "afebrile",
          "no erythema",
          "no clear demarcation",
          "no recent skin breach",
        ],
      },
      {
        dx: "Necrotising fasciitis",
        likelihood: "must_not_miss",
        ruleIn: [
          "unilateral swelling",
          "fever + spreading erythema",
          "pain out of proportion to findings",
          "systemic toxicity",
          "rapid progression",
          "recent trauma/skin breach",
        ],
        ruleOut: [
          "bilateral swelling",
          "afebrile",
          "pain proportionate to swelling",
          "slow progression",
          "no skin breach",
        ],
      },
      {
        dx: "Baker's cyst",
        likelihood: "less_likely",
        ruleIn: [
          "unilateral popliteal swelling",
          "history of knee arthritis/meniscal tear",
          "no fever",
          "no systemic symptoms",
        ],
        ruleOut: ["bilateral swelling", "calf swelling beyond popliteal", "fever", "erythema"],
      },
      {
        dx: "Compartment syndrome",
        likelihood: "must_not_miss",
        ruleIn: [
          "unilateral painful tense swelling",
          "recent trauma/crush injury",
          "pain out of proportion",
          "pain with passive stretch",
          "tense compartments on palpation",
        ],
        ruleOut: ["bilateral swelling", "non-tense swelling", "no trauma history", "mild pain"],
      },
    ],
    discriminatingHpc: [
      "Unilateral vs bilateral swelling (localised vs systemic)?",
      "Onset pattern: acute (hours-days; DVT/cellulitis) vs insidious (weeks-months; venous/lymphatic/drug)?",
      "Associated dyspnoea/orthopnoea/paroxysmal nocturnal dyspnoea (heart failure)?",
      "Frothy urine or periorbital oedema (nephrotic syndrome)?",
      "Abdominal swelling/jaundice (hepatic disease)?",
      "Fever + redness + pain (cellulitis) vs pain out of proportion + rapid spread (necrotising fasciitis)?",
      "Calf pain/tenderness/circumference increase (DVT)?",
      "DVT risk factors: immobility, recent surgery/malignancy, oral contraceptives, pregnancy, prior VTE?",
      "Recent trauma or skin breach (cellulitis/compartment syndrome)?",
      "Improved with elevation/worse at day-end (venous insufficiency)?",
      "Timeline of any new drug, especially CCBs?",
    ],
    associated: [
      "Dyspnoea/pleuritic chest pain (PE from DVT)",
      "Orthopnoea/paroxysmal nocturnal dyspnoea (heart failure)",
      "Proteinuria/facial oedema (nephrotic syndrome)",
      "Ascites/jaundice/spider naevi (liver disease)",
      "Fever + spreading erythema + systemic toxicity (cellulitis/necrotising fasciitis)",
      "Unilateral calf tenderness (DVT)",
      "Pitting vs non-pitting character (pitting suggests systemic/venous; non-pitting suggests lymphoedema)",
      "Weight gain/recent diuretic use (fluid overload)",
      "Recent long flight/immobility (VTE risk)",
    ],
    redFlags: [
      "Unilateral painful swollen calf + ANY chest symptom (DVT + PE — immediate imaging/anticoagulation pathway)",
      "Fever + spreading erythema + systemic toxicity + pain out of proportion (necrotising fasciitis — surgical emergency)",
      "Gross bilateral swelling + breathlessness (acute decompensated heart failure or acute renal crisis)",
      "Tense compartments + pain with passive stretch (compartment syndrome — fasciotomy window)",
      "Rapid calf circumference increase + unilateral erythema/warmth (DVT or severe cellulitis)",
      "Skin necrosis/bullae/crepitus (necrotising fasciitis)",
    ],
    examTargets: [
      {
        area: "Bilateral/unilateral pattern",
        sign: "Visual inspection and circumference measurement both legs (same point, e.g. 10cm below knee joint)",
        discriminates:
          "Bilateral symmetric → systemic (cardiac/renal/hepatic/drug); unilateral → DVT/cellulitis/local cause",
      },
      {
        area: "Calf",
        sign: "Tenderness, calf circumference discrepancy >3cm, Homan's sign, warmth",
        discriminates:
          "Positive findings support DVT; also assess for erythema/demarcation (cellulitis)",
      },
      {
        area: "Skin",
        sign: "Erythema, warmth, sharp demarcation, blistering, crepitus, pain-out-of-proportion",
        discriminates:
          "Sharp erythema with demarcation + fever → cellulitis; rapid spread + toxicity + crepitus → necrotising fasciitis",
      },
      {
        area: "Cardiovascular",
        sign: "JVP height, heart rate, blood pressure, heart sounds, peripheral crepitations",
        discriminates: "Elevated JVP + crepitations → heart failure as cause of bilateral swelling",
      },
      {
        area: "Abdomen",
        sign: "Ascites (shifting dullness), hepatomegaly, jaundice, spider naevi, splenomegaly",
        discriminates:
          "Ascites + liver stigmata → liver disease; proteinuria on urine dip + periorbital oedema → nephrotic",
      },
      {
        area: "Eyes",
        sign: "Periorbital oedema/puffiness",
        discriminates:
          "Present suggests nephrotic syndrome or liver disease (not typical of DVT/cellulitis/venous insufficiency)",
      },
      {
        area: "Urine",
        sign: "Dipstick: proteinuria (≥2+ suggests nephrotic), glycosuria, haematuria",
        discriminates:
          "Proteinuria + periorbital oedema + bilateral swelling → nephrotic syndrome; absence narrows systemic causes",
      },
    ],
    historyEmphasis: [
      "VTE risk factors (immobility, recent surgery, active malignancy, OCP use, pregnancy, prior VTE, thrombophilia) — escalates DVT likelihood",
      "Cardiac history (prior MI, arrhythmia, valvular disease, reduced EF) — supports heart failure",
      "Renal history (CKD, diabetes, glomerulonephritis, prior proteinuria) — supports nephrotic/renal oedema",
      "Liver history (cirrhosis, hepatitis, alcohol use, portal hypertension) — supports hepatic hypoalbuminaemia",
      "Malnutrition/cachexia/recent weight loss — supports nutritional hypoalbuminaemia",
      "Current medications: CCBs (amlodipine/diltiazem/verapamil), NSAIDs, estrogens — drug-induced",
      "Recent trauma, surgery, or skin breach (cellulitis/compartment syndrome risk)",
      "Lymph node dissection or prior malignancy (lymphoedema risk)",
    ],
    combinations: [
      {
        features: [
          "unilateral tender calf",
          "acute onset (hours-days)",
          "calf circumference increase ≥3cm",
          "VTE risk factor present",
        ],
        suggests: "DVT with high pre-test probability",
        action:
          "Urgent venous duplex ultrasound; if high clinical suspicion and imaging delayed, consider bridge anticoagulation; assess for PE (chest pain/dyspnoea)",
      },
      {
        features: [
          "unilateral erythema",
          "fever",
          "demarcated borders",
          "recent skin breach",
          "normal calf circumference",
        ],
        suggests: "Cellulitis",
        action:
          "Culture if purulent, systemic antibiotic therapy, limb elevation, monitor for spread; if rapidly spreading + pain-out-of-proportion, consider necrotising fasciitis (MRI/surgical exploration)",
      },
      {
        features: [
          "bilateral symmetric swelling",
          "dyspnoea",
          "orthopnoea",
          "elevated JVP",
          "crepitations",
        ],
        suggests: "Acute decompensated heart failure",
        action:
          "BNP/NT-proBNP, echocardiography, diuretics, ACE inhibitor/beta-blocker; assess for precipitants (infection, arrhythmia, MI, uncontrolled hypertension)",
      },
      {
        features: [
          "bilateral swelling",
          "periorbital oedema",
          "proteinuria ≥2+",
          "frothy urine",
          "normal renal function or elevated creatinine",
        ],
        suggests: "Nephrotic syndrome",
        action:
          "24-hour urine protein, serum albumin, lipid panel, renal biopsy if indicated; treat underlying cause (FSGS/membranous/MPGN)",
      },
      {
        features: ["bilateral swelling", "jaundice", "ascites", "spider naevi", "hepatomegaly"],
        suggests: "Hepatic hypoalbuminaemia (decompensated cirrhosis)",
        action:
          "LFTs, PT/INR, ultrasound ± fibroscan, diuretics, fluid restriction, consider variceal screening if first presentation",
      },
      {
        features: [
          "bilateral swelling",
          "on amlodipine/diltiazem",
          "onset after drug start",
          "no systemic disease markers",
        ],
        suggests: "Drug-induced oedema (CCB)",
        action:
          "Consider alternative antihypertensive; if drug-switching not feasible, add non-loop diuretic or topical nitrate",
      },
      {
        features: [
          "unilateral painful tense calf",
          "recent crush/compartment trauma",
          "pain with passive stretch",
          "pain out of proportion",
        ],
        suggests: "Compartment syndrome",
        action:
          "Urgent fasciotomy referral; do not delay for imaging if clinical suspicion high; measure compartment pressures if borderline",
      },
      {
        features: [
          "rapid bilateral swelling",
          "breathlessness",
          "elevated JVP",
          "pulmonary crackles",
        ],
        suggests: "Acute pulmonary oedema (cardiogenic or renal crisis)",
        action:
          "Oxygen, IV diuretics, echocardiography, consider ICU monitoring; rule out sepsis/infection if febrile",
      },
    ],
    source: "Hutchison Ch 2-3 (clinical reasoning) — CSO-signed",
  },
  {
    code: "joint_pain",
    display: "Joint pain / swelling",
    triggerCodes: ["joint_pain", "joint_swelling"],
    problemReprHint:
      "Categorize as monoarticular vs polyarticular; acute single hot swollen joint is septic arthritis until proven otherwise. Discriminate inflammatory pattern (morning stiffness >30min, improves with activity, symmetrical small joints) from mechanical (worse with use, brief stiffness, weight-bearing joints). Identify high-risk features: fever, preceding infection, inability to weight-bear, systemic sepsis signs.",
    differential: [
      {
        dx: "Septic arthritis",
        likelihood: "must_not_miss",
        ruleIn: [
          "acute single hot swollen joint",
          "fever",
          "inability to weight-bear",
          "systemic sepsis signs",
          "joint warmth/erythema/effusion on exam",
        ],
        ruleOut: [
          "afebrile and gradually progressive over weeks",
          "symmetrical polyarticular pattern",
          "clear mechanical trauma history",
        ],
      },
      {
        dx: "Osteoarthritis",
        likelihood: "likely",
        ruleIn: [
          "mechanical pattern (worse with use)",
          "brief morning stiffness (<30min)",
          "weight-bearing joints affected",
          "gradual onset over months/years",
        ],
        ruleOut: [
          "fever",
          "acute hot joint",
          "symmetrical small-joint polyarthritis",
          "morning stiffness >30min",
        ],
      },
      {
        dx: "Rheumatoid/inflammatory arthritis",
        likelihood: "likely",
        ruleIn: [
          "morning stiffness >30min",
          "improves with use/activity",
          "symmetrical small joints (hands, feet)",
          "polyarticular pattern",
        ],
        ruleOut: [
          "monoarticular presentation",
          "mechanical trauma history",
          "sudden acute onset over hours",
        ],
      },
      {
        dx: "Gout/pseudogout",
        likelihood: "likely",
        ruleIn: [
          "prior gout history",
          "acute monoarticular onset",
          "severe pain",
          "possible crystal deposition",
        ],
        ruleOut: [
          "symmetrical polyarthritis",
          "fever with systemic sepsis",
          "preceding infection unrelated to gout",
        ],
      },
      {
        dx: "Reactive arthritis",
        likelihood: "likely",
        ruleIn: [
          "preceding infection (GI/GU/respiratory)",
          "polyarticular or monoarticular",
          "rash/uveitis/urethritis (extra-articular)",
          "fever possible",
        ],
        ruleOut: ["chronic progressive course", "no preceding infection within weeks"],
      },
      {
        dx: "Rheumatic fever",
        likelihood: "must_not_miss",
        ruleIn: [
          "preceding sore throat (high in Uganda)",
          "polyarticular migratory arthritis",
          "fever",
          "rash/nodules",
          "cardiac murmur on exam",
        ],
        ruleOut: [
          "no recent pharyngeal infection",
          "monoarticular joint disease",
          "absence of carditis signs",
        ],
      },
      {
        dx: "Crystal arthritis vs septic arthritis (overlap)",
        likelihood: "must_not_miss",
        ruleIn: [
          "acute hot joint with fever",
          "prior gout/pseudogout history + current fever",
          "joint aspiration required to differentiate",
        ],
        ruleOut: ["clear history of gout without current systemic illness"],
      },
      {
        dx: "Mechanical/soft-tissue injury",
        likelihood: "likely",
        ruleIn: [
          "clear trauma history",
          "localized swelling without systemic signs",
          "pain worse with specific movements",
          "afebrile",
        ],
        ruleOut: ["fever", "systemic inflammatory signs", "acute hot joint appearance"],
      },
      {
        dx: "Malignancy/bone involvement",
        likelihood: "less_likely",
        ruleIn: ["persistent joint symptoms", "constitutional symptoms", "radiographic changes"],
        ruleOut: [
          "acute presentation",
          "fever and septic picture",
          "clear inflammatory/mechanical trigger",
        ],
      },
      {
        dx: "Haemarthrosis (bleeding disorder/anticoagulant-related)",
        likelihood: "must_not_miss",
        ruleIn: [
          "on anticoagulants or known bleeding disorder",
          "acute swollen joint",
          "no fever (distinguishes from septic)",
          "history of bleeding",
        ],
        ruleOut: [
          "no anticoagulant use",
          "fever present (septic more likely)",
          "gradual chronic swelling",
        ],
      },
    ],
    discriminatingHpc: [
      "Is the joint single (monoarticular) or multiple (polyarticular)?",
      "Is the joint acutely hot, swollen, and tender — how rapidly did it develop (hours vs days vs weeks)?",
      "Is there fever or systemic symptoms (chills, malaise)?",
      "What is the morning stiffness duration — >30 minutes (inflammatory) vs brief (<5min, mechanical)?",
      "Does activity improve or worsen the pain — inflammatory improves with use, mechanical worsens?",
      "Is there a preceding infection — sore throat (rheumatic fever risk in Uganda), GI/GU symptoms, respiratory illness?",
      "Is there trauma history to this joint or others?",
      "Prior gout attacks or gout family history?",
      "Are other joints symmetrical (small joints of hands/feet suggests RA) or asymmetrical?",
      "Rash, uveitis, urethritis, or other systemic features (reactive arthritis)?",
    ],
    associated: [
      "Fever + single hot joint = septic arthritis",
      "Rash + urethritis + uveitis = reactive arthritis",
      "Preceding sore throat = rheumatic fever (Uganda-specific risk)",
      "Morning stiffness + polyarticular symmetrical = rheumatoid arthritis",
      "Prior gout episodes = gout/pseudogout",
      "Inability to weight-bear + systemic sepsis = urgent septic picture",
    ],
    redFlags: [
      "Acute hot swollen joint + fever (septic arthritis — aspirate immediately, do not delay for imaging)",
      "Inability to weight-bear (septic or severe inflammatory)",
      "Signs of systemic sepsis (hypotension, altered mental status, widespread erythema)",
      "Bleeding history or on anticoagulants with acute swelling (haemarthrosis)",
    ],
    examTargets: [
      {
        area: "The affected joint(s)",
        sign: "Effusion, warmth, erythema, reduced range of motion",
        discriminates:
          "Acute hot joint with effusion suggests septic arthritis (urgent) vs inflammatory (morning stiffness pattern) vs mechanical (localised to movement-triggered areas)",
      },
      {
        area: "Vital signs (temperature, blood pressure, heart rate)",
        sign: "Fever, tachycardia, hypotension",
        discriminates:
          "Fever + acute joint = septic arthritis or rheumatic fever; systemic sepsis signs = urgent; afebrile monoarthritis = gout/mechanical more likely",
      },
      {
        area: "Pattern of joint involvement",
        sign: "Monoarticular vs polyarticular; symmetrical small joints (DIP/PIP/MCP of hands, forefeet) vs large weight-bearing joints",
        discriminates:
          "Symmetrical small-joint polyarthritis + morning stiffness = RA; monoarticular large joint = septic/gout; polyarticular migratory = rheumatic fever",
      },
      {
        area: "Extra-articular signs",
        sign: "Nodules, rash, nail changes, oral ulcers",
        discriminates:
          "Subcutaneous nodules/rash = rheumatic fever or systemic inflammatory; urethritis/conjunctivitis/rash = reactive arthritis",
      },
      {
        area: "Cardiac auscultation",
        sign: "New murmur or signs of carditis",
        discriminates:
          "Murmur + polyarthritis + fever + sore throat history = rheumatic fever (must-not-miss in Uganda)",
      },
    ],
    historyEmphasis: [
      "Preceding infection: sore throat (rheumatic fever — Uganda-endemic), GI/GU symptoms, respiratory illness (reactive arthritis)",
      "Prior gout or pseudogout episodes (gout/pseudogout recurrence)",
      "Prior RA or rheumatological disease (RA relapse/flare)",
      "Immunosuppression (diabetes, HIV, medications) — increases septic arthritis risk",
      "Anticoagulant or bleeding disorder (haemarthrosis risk)",
      "Recent trauma to joint(s)",
      "Family history of RA or gout",
    ],
    combinations: [
      {
        features: ["acute single hot swollen joint", "fever", "inability to weight-bear"],
        suggests: "Septic arthritis — joint-destroying emergency",
        action:
          "Aspirate immediately for gram stain/culture/WBC/crystals; do not delay; start empiric antibiotics after aspiration; imaging (ultrasound/plain X-ray) as needed but secondary to aspiration",
      },
      {
        features: ["monoarticular", "prior gout history", "fever"],
        suggests: "Gout with secondary septic arthritis (overlap) or gout alone",
        action:
          "Joint aspiration to identify crystals AND exclude bacteria; if septic features dominate (systemic sepsis signs), treat as septic first",
      },
      {
        features: [
          "polyarticular symmetrical",
          "morning stiffness >30min",
          "improves with activity",
        ],
        suggests: "Rheumatoid arthritis or systemic inflammatory",
        action:
          "ESR/CRP, RF/anti-CCP labs; gradually escalate DMARD if diagnosis confirmed; assess for extra-articular complications",
      },
      {
        features: ["polyarticular migratory", "preceding sore throat", "fever", "rash/nodules"],
        suggests: "Rheumatic fever (Uganda risk)",
        action:
          "Cardiology referral urgently; echo to assess for carditis; prolonged penicillin prophylaxis if confirmed; don't miss carditis",
      },
      {
        features: ["acute monoarticular", "rash + urethritis + uveitis", "fever"],
        suggests: "Reactive arthritis (post-infection syndrome)",
        action:
          "Identify triggering infection; NSAIDs for symptom relief; self-limited but may require immunosuppression if chronic",
      },
      {
        features: [
          "mechanical trauma history",
          "localised swelling",
          "afebrile",
          "pain worse with weight-bearing/use",
        ],
        suggests: "Soft-tissue injury or mechanical joint dysfunction",
        action:
          "Rest, ice, physiotherapy; reassess if fever develops or swelling worsens despite conservative care",
      },
    ],
    source: "Hutchison Ch 2-3 (clinical reasoning) — CSO-signed",
  },
  {
    code: "confusion",
    display: "Altered consciousness / confusion",
    triggerCodes: ["confusion", "altered_consciousness"],
    problemReprHint:
      "Acute or subacute change in mental status (confusion, altered consciousness, inattention). Frame as ALWAYS: delirium until proven otherwise — acute onset, fluctuating course, inattention. Distinguish from dementia (chronic, baseline), intoxication/withdrawal (temporal link to substance), postictal (post-seizure). GOLDEN RULE: check glucose and airway FIRST; infection/hypoxia/shock are immediately life-threatening.",
    differential: [
      {
        dx: "Delirium (infection/metabolic/drugs)",
        likelihood: "likely",
        ruleIn: [
          "acute onset",
          "fluctuating course",
          "inattention",
          "agitation or lethargy",
          "disorganized thought",
        ],
        ruleOut: [
          "clear sensorium with intact attention",
          "stable baseline cognition without change",
        ],
      },
      {
        dx: "Infection (sepsis/meningitis/encephalitis)",
        likelihood: "must_not_miss",
        ruleIn: [
          "fever",
          "neck stiffness",
          "headache",
          "rapid onset",
          "tachycardia",
          "hypotension",
        ],
        ruleOut: ["afebrile with normal white cell count", "absence of focal infection source"],
      },
      {
        dx: "Hypoglycaemia",
        likelihood: "must_not_miss",
        ruleIn: [
          "diabetes history",
          "insulin/oral hypoglycaemic use",
          "sweating",
          "tremor",
          "agitation",
          "documented low glucose",
        ],
        ruleOut: ["glucose >100 mg/dL on testing"],
      },
      {
        dx: "Hypoxia/hypercapnia",
        likelihood: "must_not_miss",
        ruleIn: [
          "respiratory distress",
          "low oxygen saturation",
          "cyanosis",
          "rapid shallow breathing",
          "history of COPD/asthma",
        ],
        ruleOut: ["normal oxygen saturation (>94%)", "normal respiratory rate and pattern"],
      },
      {
        dx: "Stroke/intracranial bleed/raised ICP",
        likelihood: "must_not_miss",
        ruleIn: [
          "focal neurological deficit",
          "headache",
          "Cushing's response (bradycardia, hypertension, irregular respirations)",
          "unequal pupils",
          "age/hypertension/atrial fibrillation history",
        ],
        ruleOut: [
          "symmetrical pupils",
          "no focal weakness or sensory loss",
          "normal reflexes bilaterally",
        ],
      },
      {
        dx: "Cerebral malaria (Uganda context)",
        likelihood: "must_not_miss",
        ruleIn: [
          "travel/residence in endemic area",
          "fever",
          "seizures",
          "rapid deterioration",
          "positive malaria film",
        ],
        ruleOut: ["negative malaria film", "afebrile", "no risk exposure"],
      },
      {
        dx: "DKA/HHS",
        likelihood: "must_not_miss",
        ruleIn: [
          "diabetes history",
          "polyuria",
          "polydipsia",
          "acetone breath",
          "Kussmaul respirations",
          "documented hyperglycaemia",
          "ketonuria/serum ketones",
        ],
        ruleOut: ["normal blood glucose", "normal acid-base status", "absence of ketones"],
      },
      {
        dx: "Electrolyte/hepatic/uraemic encephalopathy",
        likelihood: "likely",
        ruleIn: [
          "liver disease history",
          "renal failure/chronic kidney disease",
          "hyponatraemia",
          "asterixis (flapping tremor)",
          "abnormal liver/renal function tests",
        ],
        ruleOut: ["normal sodium, potassium, calcium", "normal liver and renal function"],
      },
      {
        dx: "Status epilepticus/non-convulsive seizure",
        likelihood: "must_not_miss",
        ruleIn: [
          "preceding tonic-clonic seizure",
          "eye deviation",
          "nystagmus",
          "automatisms",
          "EEG evidence of ongoing seizure activity",
        ],
        ruleOut: ["no history of seizure disorder", "normal EEG", "recovery of full consciousness"],
      },
      {
        dx: "Opioid/drug toxicity",
        likelihood: "likely",
        ruleIn: [
          "history of opioid/sedative use",
          "pinpoint pupils",
          "low respiratory rate (<10)",
          "depressed consciousness",
          "needle marks",
        ],
        ruleOut: [
          "normal pupil size",
          "normal respiratory rate",
          "no substance use history or access",
        ],
      },
      {
        dx: "Intoxication/withdrawal (alcohol/benzodiazepines)",
        likelihood: "likely",
        ruleIn: [
          "temporal relationship to substance use",
          "tremor",
          "autonomic hyperactivity (tachycardia, hypertension, diaphoresis)",
          "smell of alcohol",
        ],
        ruleOut: ["no substance use history", "no odour of alcohol", "stable vital signs"],
      },
      {
        dx: "Wernicke encephalopathy",
        likelihood: "less_likely",
        ruleIn: [
          "alcohol use disorder",
          "malnutrition",
          "ophthalmoplegia",
          "ataxia",
          "confusion triad",
        ],
        ruleOut: ["no alcohol history", "normal eye movements", "normal gait"],
      },
      {
        dx: "Dementia (chronic baseline)",
        likelihood: "less_likely",
        ruleIn: [
          "insidious onset over months/years",
          "stable baseline known to caregivers",
          "gradual progressive decline",
          "no acute precipitant",
        ],
        ruleOut: [
          "acute onset documented by collateral",
          "previously normal cognition",
          "fluctuating course",
        ],
      },
      {
        dx: "Postictal state",
        likelihood: "likely",
        ruleIn: [
          "witnessed seizure immediately preceding",
          "gradual recovery over minutes to hours",
          "tongue biting",
          "incontinence",
          "post-ictal exhaustion",
        ],
        ruleOut: [
          "no witnessed seizure",
          "no evidence of tongue trauma",
          "full alertness immediately",
        ],
      },
    ],
    discriminatingHpc: [
      "Acute onset vs gradual (delirium/vascular/metabolic vs dementia)",
      "Fluctuating course throughout day (hallmark of delirium)",
      "Fever presence and temporal relationship (infection)",
      "Focal neurological deficit (stroke)",
      "Recent drug/alcohol use or access (intoxication/withdrawal)",
      "Preceding seizure activity (status/postictal)",
      "Travel history or malaria exposure (Uganda context — cerebral malaria)",
      "Diabetes history and last meal/insulin timing (hypoglycaemia/DKA)",
      "Recent trauma or head injury (intracranial bleed)",
      "Liver/kidney disease history (hepatic/uraemic encephalopathy)",
      "HIV status and opportunistic infection risk",
      "Medication list (especially sedatives, opioids, anticonvulsants)",
    ],
    associated: [
      "Fever with neck stiffness (meningitis — rule-out essential)",
      "Focal weakness (stroke — rule-out essential)",
      "Hypoxia or shock (A/B/C derangement — address FIRST)",
      "Pinpoint pupils with low respiratory rate (opioid toxicity)",
      "Polyuria and ketones (DKA)",
      "Headache (infection, bleed, malaria)",
      "Seizure activity (status epilepticus, post-ictal)",
    ],
    redFlags: [
      "GCS ≤8 (AIRWAY EMERGENCY — intubate)",
      "Falling GCS trend (worsening encephalopathy — escalate immediately)",
      "Focal neurological deficit (stroke/bleed/mass — CT/MRI)",
      "Meningism (neck stiffness + fever + headache → meningitis/encephalitis until proven otherwise)",
      "Cushing's response: bradycardia + hypertension + irregular respirations (raised ICP — emergency decompression may be needed)",
      "Unequal pupils or blown pupil (herniation risk)",
      "Status epilepticus or ongoing seizure activity (airway + anticonvulsant emergency)",
      "Hypoxia (SpO₂ <90%) or severe hypercapnia (respiratory emergency)",
      "Shock physiology: hypotension, tachycardia, poor perfusion (sepsis/hypovolaemia — IV access + fluids/antibiotics)",
      "Documented hypoglycaemia (treat immediately — glucose >100 mg/dL target)",
    ],
    examTargets: [
      {
        area: "Consciousness/cognition",
        sign: "Glasgow Coma Scale (GCS), attention (digit span/months backward), orientation (person/place/time), fluctuation",
        discriminates:
          "GCS ≤8 → airway; GCS 9–12 → aspiration risk; inattention → delirium; stable orientation → not delirium",
      },
      {
        area: "Glucose",
        sign: "Point-of-care blood glucose (capillary or venous)",
        discriminates:
          "MANDATORY FIRST TEST; <70 mg/dL → treat immediately (hypoglycaemia); >200 mg/dL with DKA signs → DKA",
      },
      {
        area: "Pupils and eye movements",
        sign: "Pupil size, reactivity, symmetry; eye deviation; nystagmus; ophthalmoplegia",
        discriminates:
          "Pinpoint → opioid; blown → raised ICP/herniation; eye deviation → seizure/stroke; ophthalmoplegia → Wernicke's",
      },
      {
        area: "Vital signs",
        sign: "Temperature, heart rate, blood pressure, respiratory rate, oxygen saturation",
        discriminates:
          "Fever + tachycardia → infection; hypotension + tachycardia → sepsis/shock; low RR → opioid/respiratory depression; low SpO₂ → hypoxia",
      },
      {
        area: "Neck",
        sign: "Neck stiffness (Kernig, Brudzinski sign), nuchal rigidity",
        discriminates:
          "Present → meningitis/encephalitis (rule-out critical); absent helps exclude meningitis but does not exclude encephalitis",
      },
      {
        area: "Motor",
        sign: "Focal weakness, drift, tone (hypertonia vs flaccid), reflexes (hyperreflexia vs absent), plantar responses",
        discriminates:
          "Focal deficit → stroke/bleed; hyperreflexia + upgoing plantars → upper motor neuron lesion; flaccid weakness → lower motor neuron/metabolic",
      },
      {
        area: "Hands/asterixis",
        sign: "Flapping tremor (asterixis) with wrists extended, tremor character",
        discriminates:
          "Asterixis → hepatic/uraemic/metabolic encephalopathy; tremor with autonomic signs → withdrawal",
      },
      {
        area: "Skin/needle marks",
        sign: "Injection marks, abscesses, track marks, rash (petechial/meningococcal)",
        discriminates:
          "Needle marks → IV drug use (opioid/sepsis risk); petechial rash → meningococcal sepsis",
      },
      {
        area: "Breath",
        sign: "Odour (alcohol, acetone), Kussmaul respirations (deep/laboured)",
        discriminates: "Acetone breath + Kussmaul → DKA; alcohol smell → intoxication",
      },
      {
        area: "Malaria film (Uganda context)",
        sign: "Thick and thin blood smear, parasite presence/density",
        discriminates:
          "Positive → cerebral malaria (must rule-out/treat); negative → other causes prioritized",
      },
    ],
    historyEmphasis: [
      "Baseline cognition and functional status (collateral from family/caregiver ESSENTIAL to diagnose delirium vs dementia)",
      "Exact time-course from onset (acute minutes–hours → delirium/metabolic/vascular; gradual days–weeks → dementia/chronic encephalopathy)",
      "Diabetes history and glucose control (hypoglycaemia/DKA risk)",
      "Liver disease, chronic kidney disease, cirrhosis (hepatic/uraemic encephalopathy)",
      "HIV status and CD4 (opportunistic infection, metabolic derangement)",
      "Malaria exposure and previous episodes (Uganda — cerebral malaria)",
      "Medication list (especially sedatives, opioids, anticonvulsants, antihypertensives — toxicity/withdrawal risk)",
      "Alcohol use disorder and recent intake/cessation (intoxication/withdrawal)",
      "Recent infection, trauma, or surgery (delirium precipitants)",
      "Seizure history and adherence to anticonvulsants (status/non-convulsive seizure)",
      "Recent travel (malaria, other endemic infection)",
    ],
    combinations: [
      {
        features: ["fever", "neck stiffness", "rapid onset", "headache"],
        suggests: "Meningitis or encephalitis (must-not-miss infection)",
        action:
          "Blood cultures, LP (if no contraindication), empiric antibiotics + aciclovir without delay (don't wait for CSF)",
      },
      {
        features: ["acute focal weakness", "facial droop", "speech difficulty", "unilateral signs"],
        suggests: "Acute stroke or intracranial bleed",
        action:
          "Immediate CT/MRI head, get time-last-known-well, neurology consult, rule-out hypoglycaemia FIRST",
      },
      {
        features: ["pinpoint pupils", "low respiratory rate (<10)", "depressed consciousness"],
        suggests: "Opioid toxicity",
        action:
          "IV naloxone challenge (0.4–2 mg), IV access, respiratory support if needed, watch for re-sedation",
      },
      {
        features: [
          "polyuria",
          "polydipsia",
          "acetone breath",
          "Kussmaul respirations",
          "hyperglycaemia",
        ],
        suggests: "DKA or HHS",
        action:
          "Venous blood gas, electrolytes, ketones (serum and urine), insulin, IV fluids, potassium monitoring",
      },
      {
        features: ["malaria exposure/endemic area", "fever", "seizures or rapid deterioration"],
        suggests: "Cerebral malaria (Uganda — must-not-miss)",
        action:
          "Malaria film (thick and thin), artemisinin-based combination therapy (ACT), supportive care for seizures/raised ICP",
      },
      {
        features: ["asterixis", "jaundice", "elevated transaminases"],
        suggests: "Hepatic encephalopathy",
        action:
          "Liver function tests, ammonia level, lactulose, restrict protein, treat underlying liver disease",
      },
      {
        features: [
          "fluctuating course throughout day",
          "inattention",
          "disorganized thought",
          "no focal deficit",
        ],
        suggests: "Delirium (infection/metabolic/drugs) — search for and treat cause",
        action:
          "Collateral history, full metabolic panel, infection screen (blood cultures, urinalysis, CXR), medication review, treat reversible cause",
      },
      {
        features: ["tremor", "autonomic hyperactivity", "agitation", "recent alcohol cessation"],
        suggests: "Alcohol withdrawal",
        action:
          "Benzodiazepine (lorazepam), thiamine, correction of electrolytes (especially magnesium), supportive care",
      },
      {
        features: ["ophthalmoplegia", "ataxia", "confusion", "alcohol use disorder"],
        suggests: "Wernicke encephalopathy",
        action:
          "Parenteral thiamine immediately (100 mg IV/IM before glucose if concurrent hypoglycaemia suspicion), supportive care",
      },
      {
        features: [
          "preceding generalized seizure",
          "post-ictal exhaustion",
          "tongue biting",
          "gradual recovery",
        ],
        suggests: "Postictal state or status epilepticus if ongoing",
        action:
          "If single seizure: observation, seizure precautions, EEG if unclear; if status: airway, anticonvulsant (lorazepam/phenytoin), address cause",
      },
    ],
    source: "Hutchison Ch 2-3 (clinical reasoning) — CSO-signed",
  },
  {
    code: "focal_weakness",
    display: "Focal weakness / suspected stroke",
    triggerCodes: ["weakness"],
    problemReprHint:
      "Acute focal neurological deficit with sudden onset. Frame as time-critical vascular emergency until proven otherwise — distinguish acute ischaemic stroke (thrombolysis/thrombectomy window ≤4.5–24h) from haemorrhagic stroke, mimics, and stroke-like presentations. Exact onset time is the single most discriminating history feature.",
    differential: [
      {
        dx: "Acute ischaemic stroke",
        likelihood: "must_not_miss",
        ruleIn: [
          "sudden onset focal neurological deficit",
          "unilateral face/arm/leg weakness",
          "dysphasia",
          "visual field loss or gaze deviation",
          "ataxia",
          "vascular risk factors (AF, hypertension, diabetes, smoking)",
        ],
        ruleOut: [
          "preceding seizure (rules toward Todd's paresis)",
          "headache + vomiting + reduced consciousness (favours haemorrhage)",
          "normal glucose (rules out hypoglycaemia)",
        ],
      },
      {
        dx: "Intracranial haemorrhage (parenchymal/subdural)",
        likelihood: "must_not_miss",
        ruleIn: [
          "headache + vomiting",
          "reduced consciousness",
          "focal deficit",
          "anticoagulation or antiplatelet use (bleeding risk)",
          "trauma history",
        ],
        ruleOut: [
          "clear consciousness with normal GCS (less typical for acute bleeding)",
          "absence of headache (uncommon in acute ICH)",
        ],
      },
      {
        dx: "Subarachnoid haemorrhage (SAH)",
        likelihood: "must_not_miss",
        ruleIn: [
          "sudden-onset severe headache ('thunderclap')",
          "neck stiffness",
          "reduced consciousness",
          "focal deficit possible",
          "preceding trauma or unwitnessed fall",
        ],
        ruleOut: [
          "focal weakness without headache (less typical presentation)",
          "gradual onset (SAH is abrupt)",
        ],
      },
      {
        dx: "Hypoglycaemia (mimic)",
        likelihood: "must_not_miss",
        ruleIn: [
          "any patient with diabetes on insulin/sulfonylurea",
          "focal neurological deficit",
          "reduced consciousness or altered behaviour",
          "sweating, palpitations",
        ],
        ruleOut: ["normal capillary/laboratory glucose (rules out as primary cause)"],
      },
      {
        dx: "Transient ischaemic attack (TIA)",
        likelihood: "likely",
        ruleIn: [
          "sudden focal neurological deficit",
          "unilateral motor/sensory loss",
          "dysphasia or visual loss",
          "complete resolution within 24 hours (historically <1h)",
          "prior similar episode",
        ],
        ruleOut: ["persistent deficit >24h (would be stroke, not TIA)"],
      },
      {
        dx: "Todd's paresis (post-ictal)",
        likelihood: "likely",
        ruleIn: [
          "witnessed or reported preceding seizure",
          "focal weakness in immediate post-ictal phase",
          "recovery within hours after seizure",
        ],
        ruleOut: ["no preceding seizure activity (rules out Todd's)"],
      },
      {
        dx: "Space-occupying lesion (tumour, abscess, haematoma)",
        likelihood: "must_not_miss",
        ruleIn: [
          "focal neurological deficit",
          "headache",
          "gradual onset over days/weeks",
          "reduced consciousness (mass effect/raised ICP)",
        ],
        ruleOut: ["sudden onset (acute stroke more typical; SOL onset usually insidious)"],
      },
      {
        dx: "Bell's palsy (isolated facial weakness)",
        likelihood: "less_likely",
        ruleIn: [
          "isolated lower-motor-neuron facial weakness",
          "sparing of forehead (if upper-motor-neuron, suggests stroke)",
        ],
        ruleOut: [
          "arm/leg weakness (Bell's is facial only)",
          "dysphasia (not in isolated Bell's)",
          "central facial weakness with arm weakness (stroke, not Bell's)",
        ],
      },
      {
        dx: "Migraine with aura",
        likelihood: "less_likely",
        ruleIn: [
          "prior migraine history",
          "visual aura preceding headache",
          "gradual onset of deficit over minutes",
        ],
        ruleOut: [
          "sudden abrupt onset (migraine aura is gradual, over 5–20 min)",
          "permanent focal deficit (migraine aura resolves)",
        ],
      },
      {
        dx: "Functional/non-organic deficit",
        likelihood: "less_likely",
        ruleIn: [
          "inconsistent neurological findings",
          "hoover's sign or give-way weakness",
          "prior psychiatric history or functional overlay",
        ],
        ruleOut: [
          "clear focal neurological localisation on formal testing (argues against functional)",
        ],
      },
    ],
    discriminatingHpc: [
      "EXACT time of onset (to within minutes if possible) — critical for thrombolysis/thrombectomy window eligibility",
      "Mode of onset: sudden (vascular) vs gradual over hours/days (space-occupying lesion, infection, migraine)",
      "Pattern of deficit: which body part(s) affected — unilateral face/arm/leg (vascular; stroke pattern), isolated face (Bell's palsy), visual field (vascular localisation)",
      "Associated symptoms at onset: headache, vomiting, reduced consciousness (haemorrhage/SAH/mass), seizure before weakness (Todd's paresis)",
      "Has the deficit resolved? Complete resolution within 24h → TIA; partial/persistent → stroke or other pathology",
      "Preceding events: recent head trauma (subdural haematoma, SAH), witnessed seizure (Todd's), visual symptoms before motor (migraine aura), recent procedure/anticoagulation (bleeding risk)",
      "Glucose check at presentation (point-of-care or formal — hypoglycaemia is a must-not-miss mimic)",
      "Vascular risk factors: atrial fibrillation, hypertension, diabetes, smoking, prior stroke/TIA, anticoagulation/antiplatelet therapy",
    ],
    associated: [
      "Headache (haemorrhage/SAH favours this; ischaemic stroke less likely to have prominent headache)",
      "Vomiting (suggests raised ICP — haemorrhage, space-occupying lesion, SAH)",
      "Reduced consciousness/confusion (haemorrhage, mass effect, SAH; can occur with large-territory ischaemic stroke)",
      "Seizure activity (preceding = Todd's paresis; concurrent = consider stroke with seizure or primary seizure)",
      "Visual disturbance (hemianopia/neglect = vascular localisation; gradual/monocular = non-vascular)",
      "Dysphasia or speech difficulty (left-hemisphere ischaemic stroke if receptive/expressive)",
      "Ataxia/gait disturbance (cerebellar stroke, brainstem stroke, or intoxication/metabolic)",
      "Hypoglycaemia (mimic — check glucose urgently)",
      "Trauma history (subdural haematoma, SAH risk)",
    ],
    redFlags: [
      "ANY acute focal neurological deficit → EMERGENCY STROKE PATHWAY (time-critical; assume acute ischaemic stroke until proven otherwise)",
      "Reduced consciousness or Glasgow Coma Scale <15 → haemorrhage likely; urgent CT head and neurosurgical evaluation",
      "Severe headache + focal deficit + neck stiffness → SAH (thunderclap) — CT head ± lumbar puncture if CT negative",
      "Headache + vomiting + focal deficit → intracranial haemorrhage or mass effect — urgent imaging",
      "Last-known-well time >4.5h (beyond IV thrombolysis window) → assess for thrombectomy candidacy (up to 24h in selected cases)",
      "Hypoglycaemia on bedside glucose → treat urgently (mimic that can be reversed)",
    ],
    examTargets: [
      {
        area: "Consciousness/cognition",
        sign: "Glasgow Coma Scale score",
        discriminates:
          "reduced GCS (≤14) suggests haemorrhage, mass effect, or large-territory ischaemic stroke; alert GCS 15 does not exclude acute stroke",
      },
      {
        area: "Stroke screening (FAST protocol or NIHSS-equivalent)",
        sign: "Face drooping, Arm weakness, Speech difficulty, Time of onset",
        discriminates:
          "documents focal deficit pattern and onset timing; any positive FAST feature warrants emergency imaging and stroke unit care",
      },
      {
        area: "Focal motor deficit",
        sign: "Grading of arm/leg strength (MRC scale 0–5); unilateral vs bilateral; proximal vs distal",
        discriminates:
          "unilateral weakness → vascular (stroke, TIA, Bell's if face only); bilateral → consider cervical myelopathy, functional, metabolic (less acute stroke)",
      },
      {
        area: "Facial nerve",
        sign: "Central vs peripheral facial weakness (forehead sparing indicates central/stroke)",
        discriminates:
          "forehead weakness = Bell's palsy or isolated LMN lesion; forehead sparing + arm/leg weakness = stroke (UMN)",
      },
      {
        area: "Pupils and eye movements",
        sign: "Pupil size/reactivity, gaze deviation, nystagmus",
        discriminates:
          "gaze deviation (toward weakness in hemispheric stroke, away in brainstem); fixed dilated pupil → raised ICP/herniation; brainstem signs → posterior circulation stroke",
      },
      {
        area: "Speech and language",
        sign: "Expressive/receptive aphasia, dysarthria, dysphonia",
        discriminates:
          "Broca's aphasia (non-fluent) → left frontal stroke; Wernicke's (fluent, comprehension loss) → left temporal stroke; dysarthria → brainstem/cerebellar",
      },
      {
        area: "Vision and gaze",
        sign: "Visual field defect (hemianopia), diplopia, nystagmus, ability to follow commands",
        discriminates:
          "homonymous hemianopia → occipital or optic-radiation stroke; neglect → non-dominant parietal; diplopia/nystagmus → brainstem/cerebellar",
      },
      {
        area: "Cerebellar function",
        sign: "Dysdiadochokinesia, past-pointing, nystagmus, ataxic gait",
        discriminates:
          "cerebellar signs → posterior-circulation stroke (PICA/AICA/SCA distribution), can present with dizziness misattributed to benign paroxysmal positional vertigo",
      },
      {
        area: "Gait and balance",
        sign: "Ataxia, foot drop, asymmetry",
        discriminates:
          "ataxia alone without weakness → cerebellar stroke; foot drop + weakness → motor cortex/pyramidal tract stroke",
      },
      {
        area: "Blood pressure",
        sign: "Systolic and diastolic BP; compare arms",
        discriminates:
          "hypertension → risk factor for haemorrhage and ischaemic stroke; unequal arm BP → aortic pathology risk",
      },
      {
        area: "Cardiac examination",
        sign: "Heart rate (regular vs irregular), murmurs, signs of heart failure",
        discriminates:
          "atrial fibrillation → cardio-embolic stroke source; irregular pulse → indicates need for ECG and anticoagulation assessment",
      },
      {
        area: "Neck examination",
        sign: "Carotid bruits, neck stiffness, nuchal rigidity",
        discriminates:
          "carotid bruit → stenosis risk; neck stiffness + headache + focal deficit → SAH",
      },
      {
        area: "Glucose",
        sign: "Capillary or laboratory blood glucose",
        discriminates:
          "hypoglycaemia → must-not-miss mimic (treat immediately); hyperglycaemia → poor prognostic marker in acute stroke but not ruling diagnosis",
      },
    ],
    historyEmphasis: [
      "Atrial fibrillation or known arrhythmia (cardio-embolic stroke risk; also affects anticoagulation/thrombolysis decisions)",
      "Hypertension (risk factor for both ischaemic and haemorrhagic stroke; affects BP targets in acute phase)",
      "Diabetes mellitus on insulin or sulfonylureas (hypoglycaemia risk as mimic; also independent stroke risk factor)",
      "Smoking history (independent vascular risk; recent quit still high-risk)",
      "Prior stroke or TIA (marks patient as high-risk; prior TIA may present again)",
      "Current anticoagulation (warfarin, DOACs) or antiplatelet therapy (affects haemorrhage risk; alters thrombolysis eligibility)",
      "Migraine with aura (rare but increases stroke risk, especially if migraine-with-aura + oral contraceptives + smoking)",
      "Recent head trauma or falls (subdural haematoma, SAH risk — can present with focal deficit days later)",
      "Seizure history (Todd's paresis possible; prior seizures lower threshold for seizure as cause of acute deficit)",
      "Recent surgery or immobilisation (DVT/PE with paradoxical embolism or in-situ thrombosis risk)",
    ],
    combinations: [
      {
        features: [
          "sudden onset focal weakness",
          "within 4.5 hours of last known well",
          "no headache/vomiting/reduced GCS",
          "vascular risk factors present",
        ],
        suggests: "Acute ischaemic stroke (likely thrombolysis candidate)",
        action:
          "STAT CT head (rule out haemorrhage), ECG (AF screen), glucose, coagulation screen, troponin; activate stroke team for IV thrombolysis discussion; consider thrombectomy imaging if large-vessel occlusion suspected",
      },
      {
        features: [
          "sudden focal weakness",
          "headache",
          "vomiting",
          "reduced consciousness (GCS <15)",
        ],
        suggests: "Intracranial haemorrhage (ischaemic stroke less likely)",
        action:
          "STAT CT head (confirm haemorrhage), neurosurgical consultation if ICH confirmed, avoid thrombolysis, manage BP cautiously, prepare for possible ICP monitoring/evacuation",
      },
      {
        features: [
          "thunderclap severe headache",
          "neck stiffness",
          "focal deficit",
          "reduced consciousness",
        ],
        suggests: "Subarachnoid haemorrhage",
        action:
          "STAT CT head (thin-slice protocol to detect subarachnoid blood), neurosurgical consultation, lumbar puncture if CT negative but high clinical suspicion, manage BP, prepare for vasospasm monitoring",
      },
      {
        features: [
          "focal neurological deficit",
          "any diabetes history",
          "bedside glucose available",
        ],
        suggests: "Hypoglycaemia must be excluded (reversible mimic)",
        action:
          "Check capillary/lab glucose immediately; if <3.0 mmol/L (or symptomatic hypoglycaemia), treat with IV dextrose or glucagon while investigating stroke pathway in parallel",
      },
      {
        features: [
          "focal weakness",
          "preceded by witnessed seizure",
          "weakness begins to resolve within minutes to hours post-ictal",
        ],
        suggests: "Todd's paresis (post-ictal transient weakness)",
        action:
          "Observe for continued improvement; seizure prophylaxis/anti-epileptic loading if appropriate; still image head if first seizure; long-term anti-epileptic consideration",
      },
      {
        features: [
          "sudden focal deficit",
          "completely resolved within 24 hours",
          "recurrent similar episodes",
        ],
        suggests: "Transient ischaemic attack (high stroke risk in ensuing days/weeks)",
        action:
          "Urgent carotid imaging (ultrasound/CTA), ECG, continuous cardiac monitoring, secondary prevention (antiplatelet ± anticoagulation based on cardio-embolic risk), neurology follow-up",
      },
      {
        features: [
          "focal deficit",
          "gradual onset over days/weeks",
          "progressive worsening",
          "headache and/or reduced consciousness",
        ],
        suggests: "Space-occupying lesion (tumour, abscess, subdural haematoma) — not acute stroke",
        action:
          "CT or MRI head with contrast (if not contraindicated), neurosurgical consultation, treatment depends on lesion type",
      },
      {
        features: [
          "isolated lower-motor-neuron facial weakness",
          "forehead involvement (indicates peripheral, not central)",
          "no arm/leg involvement",
        ],
        suggests: "Bell's palsy (peripheral facial nerve lesion, not stroke)",
        action:
          "Assess for other neurological deficits to exclude stroke; if isolated facial weakness confirmed, treat with corticosteroids ± eye care; consider MRI if atypical features",
      },
    ],
    source: "Hutchison Ch 2-3 (clinical reasoning) — CSO-signed",
  },
];
