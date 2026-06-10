import type { ReasoningMap } from "@/lib/clerkship/reasoning/types";

/**
 * CSO-signed reasoning maps (one per worked presenting complaint). Code reference
 * data — reviewed in the PR diff (ADR 0065). Enriched: rule-in/out use the app's
 * tap-option wording; supportingSymptoms/refutingSymptoms use ROS vocabulary for
 * cross-system highlighting; riskFactors drive per-candidate history matching.
 * Decision-support — CONSIDER/ASK/EXAMINE/RULE-OUT, never a verdict; the engine
 * keeps the differential plural + always shows the must-not-miss.
 */
export const REASONING_MAPS: ReasoningMap[] = [
  {
    code: "chest_pain",
    display: "Chest pain",
    triggerCodes: ["chest_pain", "pleuritic_chest_pain"],
    problemReprHint:
      "Frame by tempo (sudden vs gradual) + character + exertional relation in this patient (age, cardiac risk).",
    differential: [
      {
        dx: "Acute coronary syndrome / MI",
        likelihood: "must_not_miss",
        ruleIn: ["Crushing", "Radiation to left arm", "Radiation to jaw", "Exertional"],
        ruleOut: ["Reproducible on palpation", "Pleuritic"],
        supportingSymptoms: [
          {
            system: "cardiovascular",
            symptom: "palpitations",
          },
          {
            system: "respiratory",
            symptom: "dyspnoea",
          },
        ],
        refutingSymptoms: [],
        riskFactors: [
          "hypertension",
          "diabetes mellitus",
          "hyperlipidaemia",
          "ischaemic heart disease",
          "smoking",
          "family history premature cardiac death",
        ],
      },
      {
        dx: "Aortic dissection",
        likelihood: "must_not_miss",
        ruleIn: ["Tearing or ripping", "Maximal at onset", "Radiation to back", "Unequal pulses"],
        ruleOut: ["Reproducible on palpation", "Burning postprandial"],
        supportingSymptoms: [
          {
            system: "cardiovascular",
            symptom: "syncope",
          },
        ],
        refutingSymptoms: [],
        riskFactors: ["hypertension", "Marfan / connective tissue disease"],
      },
      {
        dx: "Pulmonary embolism",
        likelihood: "must_not_miss",
        ruleIn: ["Pleuritic", "Sudden"],
        ruleOut: ["Reproducible on palpation", "Exertional"],
        supportingSymptoms: [
          {
            system: "respiratory",
            symptom: "dyspnoea",
          },
          {
            system: "respiratory",
            symptom: "haemoptysis",
          },
          {
            system: "cardiovascular",
            symptom: "leg swelling",
          },
        ],
        refutingSymptoms: [],
        riskFactors: [
          "cancer",
          "recent immobility or surgery",
          "prior VTE",
          "oestrogen / pregnancy",
        ],
      },
      {
        dx: "Tension pneumothorax",
        likelihood: "must_not_miss",
        ruleIn: ["Pleuritic", "Sudden"],
        ruleOut: ["Reproducible on palpation"],
        supportingSymptoms: [
          {
            system: "respiratory",
            symptom: "dyspnoea",
          },
        ],
        refutingSymptoms: [],
        riskFactors: ["asthma", "COPD", "tall thin young male", "chest trauma"],
      },
      {
        dx: "Pericarditis",
        likelihood: "less_likely",
        ruleIn: ["Pleuritic", "Relieved sitting forward", "Worse lying flat"],
        ruleOut: ["Exertional"],
        supportingSymptoms: [
          {
            system: "general",
            symptom: "fever",
          },
        ],
        refutingSymptoms: [],
        riskFactors: ["recent viral illness"],
      },
      {
        dx: "Musculoskeletal / costochondritis",
        likelihood: "likely",
        ruleIn: ["Reproducible on palpation", "Sharp"],
        ruleOut: ["Exertional", "Radiation to jaw", "Crushing"],
        supportingSymptoms: [],
        refutingSymptoms: [
          {
            system: "respiratory",
            symptom: "dyspnoea",
          },
        ],
        riskFactors: ["recent strain or trauma"],
      },
      {
        dx: "GORD / oesophageal",
        likelihood: "likely",
        ruleIn: ["Burning", "Postprandial", "Acid taste"],
        ruleOut: ["Exertional"],
        supportingSymptoms: [
          {
            system: "gastrointestinal",
            symptom: "heartburn",
          },
        ],
        refutingSymptoms: [],
        riskFactors: ["peptic ulcer disease"],
      },
    ],
    discriminatingHpc: [
      "exertional vs at rest",
      "character",
      "radiation",
      "relation to breathing",
      "reproducible on palpation",
    ],
    associated: ["sweating", "dyspnoea", "palpitations", "calf swelling", "syncope", "nausea"],
    redFlags: [
      "unequal BP/pulses",
      "syncope",
      "hypoxia",
      "haemodynamic instability",
      "tearing pain maximal at onset",
    ],
    examTargets: [
      {
        area: "Vascular",
        sign: "BP in both arms",
        discriminates: "Aortic dissection",
      },
      {
        area: "Cardiovascular",
        sign: "Pericardial rub",
        discriminates: "Pericarditis",
      },
      {
        area: "Cardiovascular",
        sign: "New murmur",
        discriminates: "ACS / dissection",
      },
      {
        area: "Respiratory",
        sign: "Tracheal deviation + hyper-resonance",
        discriminates: "Tension pneumothorax",
      },
      {
        area: "Peripheral",
        sign: "Unilateral calf swelling/tenderness",
        discriminates: "Pulmonary embolism (DVT)",
      },
    ],
    historyEmphasis: [
      "cardiac risk factors",
      "prior VTE",
      "anticoagulation",
      "connective tissue disease",
      "smoking",
    ],
    combinations: [
      {
        features: ["Tearing or ripping", "Unequal pulses"],
        suggests: "Aortic dissection",
        action: "urgent CT angiogram, senior + cardiothoracic; avoid thrombolysis",
      },
      {
        features: ["Pleuritic", "leg swelling"],
        suggests: "Pulmonary embolism",
        action: "Wells score + CTPA/D-dimer; anticoagulation assessment",
      },
      {
        features: ["Crushing", "Exertional", "sweating"],
        suggests: "Acute coronary syndrome",
        action: "12-lead ECG + troponin + ACS pathway",
      },
    ],
    source: "Hutchison Ch 2-3 (clinical reasoning) — CSO-signed (enriched)",
  },
  {
    code: "dyspnoea",
    display: "Breathlessness (dyspnoea)",
    triggerCodes: ["dyspnoea", "exertional_dyspnoea", "wheeze"],
    problemReprHint:
      "Frame by onset (sudden vs gradual), exertional tolerance, and orthopnoea/wheeze in this patient.",
    differential: [
      {
        dx: "Pulmonary embolism",
        likelihood: "must_not_miss",
        ruleIn: ["Sudden", "Pleuritic"],
        ruleOut: ["Gradual", "Wheeze"],
        supportingSymptoms: [
          {
            system: "respiratory",
            symptom: "pleuritic chest pain",
          },
          {
            system: "respiratory",
            symptom: "haemoptysis",
          },
          {
            system: "cardiovascular",
            symptom: "leg swelling",
          },
        ],
        refutingSymptoms: [],
        riskFactors: [
          "cancer",
          "prior VTE",
          "recent immobility or surgery",
          "oestrogen / pregnancy",
        ],
      },
      {
        dx: "Tension pneumothorax",
        likelihood: "must_not_miss",
        ruleIn: ["Sudden", "Pleuritic"],
        ruleOut: ["Gradual"],
        supportingSymptoms: [],
        refutingSymptoms: [],
        riskFactors: ["asthma", "COPD", "chest trauma"],
      },
      {
        dx: "Acute pulmonary oedema (heart failure)",
        likelihood: "must_not_miss",
        ruleIn: ["Orthopnoea", "Paroxysmal nocturnal dyspnoea", "Gradual"],
        ruleOut: ["Pleuritic"],
        supportingSymptoms: [
          {
            system: "cardiovascular",
            symptom: "orthopnoea",
          },
          {
            system: "cardiovascular",
            symptom: "paroxysmal nocturnal dyspnoea",
          },
          {
            system: "cardiovascular",
            symptom: "leg swelling",
          },
        ],
        refutingSymptoms: [],
        riskFactors: [
          "heart failure",
          "ischaemic heart disease",
          "hypertension",
          "atrial fibrillation",
        ],
      },
      {
        dx: "Severe asthma / COPD exacerbation",
        likelihood: "must_not_miss",
        ruleIn: ["Wheeze"],
        ruleOut: ["Orthopnoea"],
        supportingSymptoms: [
          {
            system: "respiratory",
            symptom: "wheeze",
          },
          {
            system: "respiratory",
            symptom: "cough",
          },
        ],
        refutingSymptoms: [],
        riskFactors: ["asthma", "COPD", "smoking"],
      },
      {
        dx: "Pneumonia / sepsis",
        likelihood: "likely",
        ruleIn: ["Gradual"],
        ruleOut: [],
        supportingSymptoms: [
          {
            system: "general",
            symptom: "fever",
          },
          {
            system: "respiratory",
            symptom: "sputum",
          },
          {
            system: "respiratory",
            symptom: "cough",
          },
        ],
        refutingSymptoms: [],
        riskFactors: ["COPD", "diabetes mellitus", "HIV"],
      },
      {
        dx: "Anaemia",
        likelihood: "likely",
        ruleIn: ["Exertional only", "Gradual"],
        ruleOut: ["Pleuritic"],
        supportingSymptoms: [
          {
            system: "haematological",
            symptom: "pallor",
          },
          {
            system: "general",
            symptom: "fatigue",
          },
        ],
        refutingSymptoms: [],
        riskFactors: ["sickle-cell disease", "GI blood loss", "heavy menstrual bleeding"],
      },
      {
        dx: "Anxiety / hyperventilation",
        likelihood: "less_likely",
        ruleIn: ["Situational"],
        ruleOut: ["Wheeze", "Orthopnoea"],
        supportingSymptoms: [
          {
            system: "psychiatric",
            symptom: "anxiety",
          },
        ],
        refutingSymptoms: [
          {
            system: "general",
            symptom: "fever",
          },
        ],
        riskFactors: ["depression/anxiety"],
      },
    ],
    discriminatingHpc: [
      "onset sudden vs gradual",
      "exertional tolerance",
      "orthopnoea / PND",
      "wheeze",
      "fever + cough",
    ],
    associated: [
      "chest pain",
      "palpitations",
      "ankle swelling",
      "calf pain",
      "fever",
      "haemoptysis",
    ],
    redFlags: [
      "SpO2 low",
      "respiratory rate >=25",
      "exhaustion / silent chest",
      "cyanosis",
      "hypotension",
    ],
    examTargets: [
      {
        area: "Respiratory",
        sign: "Trachea + percussion + breath sounds",
        discriminates: "Pneumothorax / effusion / consolidation",
      },
      {
        area: "Cardiovascular",
        sign: "Raised JVP + gallop + bibasal crackles",
        discriminates: "Heart failure",
      },
      {
        area: "Respiratory",
        sign: "Wheeze",
        discriminates: "Asthma / COPD",
      },
      {
        area: "Peripheral",
        sign: "Unilateral calf swelling",
        discriminates: "Pulmonary embolism (DVT)",
      },
      {
        area: "General",
        sign: "Conjunctival pallor",
        discriminates: "Anaemia",
      },
    ],
    historyEmphasis: [
      "smoking",
      "cardiac / respiratory history",
      "VTE risk",
      "occupational exposure",
    ],
    combinations: [
      {
        features: ["Sudden", "leg swelling"],
        suggests: "Pulmonary embolism",
        action: "Wells + CTPA; anticoagulation assessment",
      },
      {
        features: ["Orthopnoea", "Paroxysmal nocturnal dyspnoea", "leg swelling"],
        suggests: "Heart failure",
        action: "CXR + BNP + echo; treat oedema",
      },
      {
        features: ["Wheeze", "silent chest"],
        suggests: "Life-threatening asthma",
        action: "resus pathway: O2 + nebs + steroid + magnesium + senior/ICU",
      },
    ],
    source: "Hutchison Ch 2-3 (clinical reasoning) — CSO-signed (enriched)",
  },
  {
    code: "headache",
    display: "Headache",
    triggerCodes: ["headache"],
    problemReprHint:
      "Frame by onset (thunderclap vs gradual), whether DIFFERENT from usual, and red-flag context (age, immunosuppression, focal signs).",
    differential: [
      {
        dx: "Subarachnoid haemorrhage",
        likelihood: "must_not_miss",
        ruleIn: ["Thunderclap", "Maximal at onset"],
        ruleOut: ["Same as usual headache"],
        supportingSymptoms: [
          {
            system: "neurological",
            symptom: "seizures",
          },
          {
            system: "gastrointestinal",
            symptom: "nausea/vomiting",
          },
        ],
        refutingSymptoms: [],
        riskFactors: ["hypertension", "polycystic kidney disease", "family history SAH"],
      },
      {
        dx: "Meningitis / encephalitis",
        likelihood: "must_not_miss",
        ruleIn: ["Worse with fever"],
        ruleOut: [],
        supportingSymptoms: [
          {
            system: "general",
            symptom: "fever",
          },
          {
            system: "skin",
            symptom: "rash",
          },
          {
            system: "neurological",
            symptom: "seizures",
          },
        ],
        refutingSymptoms: [],
        riskFactors: ["HIV", "immunosuppression"],
      },
      {
        dx: "Raised ICP / space-occupying lesion",
        likelihood: "must_not_miss",
        ruleIn: ["Worse on waking", "Worse on coughing/bending"],
        ruleOut: [],
        supportingSymptoms: [
          {
            system: "gastrointestinal",
            symptom: "nausea/vomiting",
          },
          {
            system: "neurological",
            symptom: "visual disturbance",
          },
          {
            system: "neurological",
            symptom: "weakness",
          },
        ],
        refutingSymptoms: [],
        riskFactors: ["cancer", "HIV"],
      },
      {
        dx: "Giant cell arteritis",
        likelihood: "must_not_miss",
        ruleIn: ["Temporal", "New headache age over 50"],
        ruleOut: [],
        supportingSymptoms: [
          {
            system: "neurological",
            symptom: "visual disturbance",
          },
          {
            system: "musculoskeletal",
            symptom: "joint pain",
          },
        ],
        refutingSymptoms: [],
        riskFactors: ["age over 50", "polymyalgia rheumatica"],
      },
      {
        dx: "Cerebral malaria",
        likelihood: "must_not_miss",
        ruleIn: ["Worse with fever"],
        ruleOut: [],
        supportingSymptoms: [
          {
            system: "general",
            symptom: "fever",
          },
          {
            system: "neurological",
            symptom: "seizures",
          },
          {
            system: "neurological",
            symptom: "memory/cognitive change",
          },
        ],
        refutingSymptoms: [],
        riskFactors: ["malaria", "malaria-endemic residence/travel"],
      },
      {
        dx: "Migraine",
        likelihood: "likely",
        ruleIn: ["Throbbing", "Aura", "Photophobia"],
        ruleOut: ["Thunderclap"],
        supportingSymptoms: [
          {
            system: "gastrointestinal",
            symptom: "nausea/vomiting",
          },
          {
            system: "neurological",
            symptom: "visual disturbance",
          },
        ],
        refutingSymptoms: [
          {
            system: "general",
            symptom: "fever",
          },
        ],
        riskFactors: ["known migraine"],
      },
      {
        dx: "Tension-type headache",
        likelihood: "likely",
        ruleIn: ["Band-like", "Same as usual headache"],
        ruleOut: ["Thunderclap", "Worse on waking"],
        supportingSymptoms: [],
        refutingSymptoms: [
          {
            system: "general",
            symptom: "fever",
          },
          {
            system: "neurological",
            symptom: "weakness",
          },
        ],
        riskFactors: ["stress"],
      },
    ],
    discriminatingHpc: [
      "onset thunderclap vs gradual",
      "DIFFERENT from usual?",
      "worse on waking / coughing",
      "temporal + jaw claudication",
      "fever + neck stiffness",
    ],
    associated: [
      "visual disturbance",
      "focal weakness",
      "seizure",
      "fever",
      "non-blanching rash",
      "jaw claudication",
    ],
    redFlags: [
      "thunderclap onset",
      "fever + neck stiffness",
      "focal neurological deficit",
      "papilloedema",
      "new headache age >50 or immunocompromised",
      "progressive / positional",
    ],
    examTargets: [
      {
        area: "Neurological",
        sign: "GCS + focal signs",
        discriminates: "Stroke / SAH / SOL",
      },
      {
        area: "Neurological",
        sign: "Neck stiffness / Kernig",
        discriminates: "Meningitis / SAH",
      },
      {
        area: "Eyes",
        sign: "Fundi for papilloedema",
        discriminates: "Raised ICP",
      },
      {
        area: "Vascular",
        sign: "Temporal artery tenderness",
        discriminates: "Giant cell arteritis",
      },
      {
        area: "Skin",
        sign: "Non-blanching rash",
        discriminates: "Meningococcal disease",
      },
    ],
    historyEmphasis: [
      "different from usual?",
      "anticoagulants",
      "immunosuppression / HIV",
      "malignancy",
      "age",
      "malaria exposure",
    ],
    combinations: [
      {
        features: ["Thunderclap", "Maximal at onset"],
        suggests: "Subarachnoid haemorrhage",
        action: "urgent CT head (± LP); senior + neuro",
      },
      {
        features: ["Worse with fever", "non-blanching rash"],
        suggests: "Meningococcal meningitis",
        action: "do not delay antibiotics; sepsis bundle; senior",
      },
      {
        features: ["Temporal", "New headache age over 50"],
        suggests: "Giant cell arteritis",
        action: "ESR/CRP + urgent steroids to protect vision; refer",
      },
    ],
    source: "Hutchison Ch 2-3 (clinical reasoning) — CSO-signed (enriched)",
  },
  {
    code: "abdominal_pain",
    display: "Abdominal pain",
    triggerCodes: ["abdominal_pain"],
    problemReprHint:
      "Frame by site + radiation, colicky vs constant, and whether the patient is a woman of reproductive age (pregnancy).",
    differential: [
      {
        dx: "Ruptured abdominal aortic aneurysm",
        likelihood: "must_not_miss",
        ruleIn: ["Sudden", "Radiation to back", "Tearing"],
        ruleOut: [],
        supportingSymptoms: [
          {
            system: "cardiovascular",
            symptom: "syncope",
          },
        ],
        refutingSymptoms: [],
        riskFactors: ["hypertension", "smoking", "age over 60 male"],
      },
      {
        dx: "Perforation / peritonitis",
        likelihood: "must_not_miss",
        ruleIn: ["Sudden", "Constant", "Worse on movement"],
        ruleOut: ["Colicky"],
        supportingSymptoms: [
          {
            system: "general",
            symptom: "fever",
          },
          {
            system: "gastrointestinal",
            symptom: "nausea/vomiting",
          },
        ],
        refutingSymptoms: [],
        riskFactors: ["peptic ulcer disease", "NSAID use"],
      },
      {
        dx: "Bowel obstruction / ischaemia",
        likelihood: "must_not_miss",
        ruleIn: ["Colicky"],
        ruleOut: [],
        supportingSymptoms: [
          {
            system: "gastrointestinal",
            symptom: "nausea/vomiting",
          },
          {
            system: "gastrointestinal",
            symptom: "abdominal distension",
          },
          {
            system: "gastrointestinal",
            symptom: "change in bowel habit",
          },
        ],
        refutingSymptoms: [],
        riskFactors: ["prior abdominal surgery", "atrial fibrillation"],
      },
      {
        dx: "Ectopic pregnancy",
        likelihood: "must_not_miss",
        ruleIn: ["Sudden"],
        ruleOut: [],
        supportingSymptoms: [
          {
            system: "genitourinary",
            symptom: "vaginal/urethral discharge",
          },
          {
            system: "cardiovascular",
            symptom: "syncope",
          },
        ],
        refutingSymptoms: [],
        riskFactors: ["reproductive-age woman", "missed period", "prior PID / ectopic"],
      },
      {
        dx: "Acute pancreatitis",
        likelihood: "likely",
        ruleIn: ["Radiation to back", "Epigastric", "Constant"],
        ruleOut: [],
        supportingSymptoms: [
          {
            system: "gastrointestinal",
            symptom: "nausea/vomiting",
          },
        ],
        refutingSymptoms: [],
        riskFactors: ["alcohol", "gallstones"],
      },
      {
        dx: "Appendicitis",
        likelihood: "likely",
        ruleIn: ["Right iliac fossa", "Migrated from umbilicus"],
        ruleOut: [],
        supportingSymptoms: [
          {
            system: "general",
            symptom: "fever",
          },
          {
            system: "general",
            symptom: "appetite loss",
          },
        ],
        refutingSymptoms: [],
        riskFactors: [],
      },
      {
        dx: "Inferior MI (epigastric)",
        likelihood: "must_not_miss",
        ruleIn: ["Epigastric", "Exertional"],
        ruleOut: ["Worse on movement"],
        supportingSymptoms: [
          {
            system: "respiratory",
            symptom: "dyspnoea",
          },
        ],
        refutingSymptoms: [],
        riskFactors: ["diabetes mellitus", "ischaemic heart disease", "hypertension"],
      },
    ],
    discriminatingHpc: [
      "site + radiation",
      "colicky vs constant",
      "relation to food / movement",
      "pregnancy possibility",
      "vomiting + bowel change",
    ],
    associated: [
      "fever",
      "vomiting",
      "change in bowel habit",
      "rectal bleeding",
      "urinary symptoms",
      "missed period",
    ],
    redFlags: [
      "peritonism",
      "haemodynamic instability",
      "pulsatile expansile mass",
      "GI bleeding",
      "pregnancy + shock",
      "absolute constipation + vomiting",
    ],
    examTargets: [
      {
        area: "Abdominal",
        sign: "Pulsatile expansile mass",
        discriminates: "Ruptured AAA",
      },
      {
        area: "Abdominal",
        sign: "Peritonism / guarding / rigidity",
        discriminates: "Perforation / peritonitis",
      },
      {
        area: "Abdominal",
        sign: "Distension + tinkling/absent bowel sounds",
        discriminates: "Bowel obstruction",
      },
      {
        area: "Obstetric",
        sign: "Pregnancy assessment + beta-hCG",
        discriminates: "Ectopic pregnancy",
      },
      {
        area: "Cardiovascular",
        sign: "ECG",
        discriminates: "Inferior MI",
      },
    ],
    historyEmphasis: ["LMP / pregnancy", "prior surgery", "alcohol", "vascular risk", "NSAIDs"],
    combinations: [
      {
        features: ["Sudden", "Radiation to back", "Tearing"],
        suggests: "Ruptured AAA",
        action: "resus + urgent CT/theatre + vascular; do not delay",
      },
      {
        features: ["reproductive-age woman", "Sudden", "missed period"],
        suggests: "Ectopic pregnancy",
        action: "beta-hCG + USS + urgent gynae; resuscitate if shock",
      },
      {
        features: ["Colicky", "abdominal distension"],
        suggests: "Bowel obstruction",
        action: "AXR/CT + surgical referral + NG/fluids",
      },
    ],
    source: "Hutchison Ch 2-3 (clinical reasoning) — CSO-signed (enriched)",
  },
  {
    code: "palpitations",
    display: "Palpitations",
    triggerCodes: ["palpitations"],
    problemReprHint:
      "Frame by rhythm (regular vs irregular), onset/offset, and any syncope/chest pain (high-risk) in this patient.",
    differential: [
      {
        dx: "Ventricular tachycardia / malignant arrhythmia",
        likelihood: "must_not_miss",
        ruleIn: ["Regular fast", "With syncope", "With chest pain"],
        ruleOut: [],
        supportingSymptoms: [
          {
            system: "cardiovascular",
            symptom: "syncope",
          },
          {
            system: "cardiovascular",
            symptom: "chest pain",
          },
        ],
        refutingSymptoms: [],
        riskFactors: [
          "ischaemic heart disease",
          "heart failure",
          "cardiomyopathy",
          "family history sudden death",
        ],
      },
      {
        dx: "AF with rapid ventricular response",
        likelihood: "must_not_miss",
        ruleIn: ["Irregularly irregular", "Sudden onset"],
        ruleOut: [],
        supportingSymptoms: [
          {
            system: "respiratory",
            symptom: "dyspnoea",
          },
          {
            system: "cardiovascular",
            symptom: "chest pain",
          },
        ],
        refutingSymptoms: [],
        riskFactors: ["atrial fibrillation", "hypertension", "thyroid disease", "alcohol"],
      },
      {
        dx: "Supraventricular tachycardia",
        likelihood: "likely",
        ruleIn: ["Regular fast", "Sudden onset and offset"],
        ruleOut: ["Irregularly irregular"],
        supportingSymptoms: [],
        refutingSymptoms: [],
        riskFactors: ["WPW"],
      },
      {
        dx: "Thyrotoxicosis",
        likelihood: "likely",
        ruleIn: ["Persistent"],
        ruleOut: [],
        supportingSymptoms: [
          {
            system: "endocrine",
            symptom: "heat intolerance",
          },
          {
            system: "general",
            symptom: "weight loss",
          },
          {
            system: "neurological",
            symptom: "tremor",
          },
        ],
        refutingSymptoms: [],
        riskFactors: ["thyroid disease"],
      },
      {
        dx: "Anaemia",
        likelihood: "likely",
        ruleIn: ["With exertion"],
        ruleOut: [],
        supportingSymptoms: [
          {
            system: "haematological",
            symptom: "pallor",
          },
          {
            system: "general",
            symptom: "fatigue",
          },
        ],
        refutingSymptoms: [],
        riskFactors: ["sickle-cell disease", "GI blood loss"],
      },
      {
        dx: "Anxiety / ectopics",
        likelihood: "less_likely",
        ruleIn: ["Situational", "Single skipped beats"],
        ruleOut: ["With syncope"],
        supportingSymptoms: [
          {
            system: "psychiatric",
            symptom: "anxiety",
          },
        ],
        refutingSymptoms: [
          {
            system: "cardiovascular",
            symptom: "syncope",
          },
        ],
        riskFactors: ["depression/anxiety", "caffeine / stimulants"],
      },
    ],
    discriminatingHpc: [
      "regular vs irregularly irregular",
      "sudden vs gradual onset/offset",
      "associated syncope / chest pain",
      "thyroid symptoms",
      "relation to exertion / caffeine",
    ],
    associated: ["syncope", "chest pain", "dyspnoea", "heat intolerance", "weight loss", "pallor"],
    redFlags: [
      "palpitations with syncope",
      "palpitations with chest pain",
      "known structural heart disease",
      "family history sudden death",
      "sustained fast rate / instability",
    ],
    examTargets: [
      {
        area: "Cardiovascular",
        sign: "12-lead ECG (during symptoms if possible)",
        discriminates: "VT / AF / SVT",
      },
      {
        area: "Cardiovascular",
        sign: "Pulse rate + rhythm",
        discriminates: "AF (irregularly irregular)",
      },
      {
        area: "Endocrine",
        sign: "Goitre + tremor + eye signs",
        discriminates: "Thyrotoxicosis",
      },
      {
        area: "General",
        sign: "Conjunctival pallor",
        discriminates: "Anaemia",
      },
      {
        area: "Cardiovascular",
        sign: "Murmur / heart failure signs",
        discriminates: "Structural heart disease",
      },
    ],
    historyEmphasis: [
      "caffeine / alcohol / stimulants",
      "thyroid disease",
      "cardiac history",
      "family history sudden death",
      "diuretics (electrolytes)",
    ],
    combinations: [
      {
        features: ["Regular fast", "With syncope"],
        suggests: "Ventricular tachycardia",
        action: "urgent ECG + monitoring + senior; peri-arrest arrhythmia pathway",
      },
      {
        features: ["Irregularly irregular", "Sudden onset"],
        suggests: "AF with RVR",
        action: "ECG + rate/rhythm + anticoagulation assessment",
      },
      {
        features: ["Persistent", "weight loss", "heat intolerance"],
        suggests: "Thyrotoxicosis",
        action: "TFTs; treat thyroid + rate control",
      },
    ],
    source: "Hutchison Ch 2-3 (clinical reasoning) — CSO-signed (enriched)",
  },
  {
    code: "syncope",
    display: "Syncope / transient loss of consciousness",
    triggerCodes: ["syncope", "faints"],
    problemReprHint:
      "Frame by posture/circumstance, prodrome, and recovery; exertional or no-warning syncope is ominous (cardiac).",
    differential: [
      {
        dx: "Cardiac syncope (arrhythmia / outflow obstruction)",
        likelihood: "must_not_miss",
        ruleIn: ["Exertional", "Supine", "No prodrome"],
        ruleOut: ["Prolonged standing trigger"],
        supportingSymptoms: [
          {
            system: "cardiovascular",
            symptom: "palpitations",
          },
          {
            system: "cardiovascular",
            symptom: "chest pain",
          },
        ],
        refutingSymptoms: [],
        riskFactors: [
          "ischaemic heart disease",
          "heart failure",
          "aortic stenosis",
          "family history sudden death",
        ],
      },
      {
        dx: "Pulmonary embolism / MI as collapse",
        likelihood: "must_not_miss",
        ruleIn: ["No prodrome"],
        ruleOut: [],
        supportingSymptoms: [
          {
            system: "respiratory",
            symptom: "dyspnoea",
          },
          {
            system: "cardiovascular",
            symptom: "chest pain",
          },
        ],
        refutingSymptoms: [],
        riskFactors: ["prior VTE", "ischaemic heart disease", "cancer"],
      },
      {
        dx: "Subarachnoid haemorrhage",
        likelihood: "must_not_miss",
        ruleIn: [],
        ruleOut: [],
        supportingSymptoms: [
          {
            system: "neurological",
            symptom: "headache",
          },
        ],
        refutingSymptoms: [],
        riskFactors: ["hypertension"],
      },
      {
        dx: "Ruptured AAA / ectopic as collapse",
        likelihood: "must_not_miss",
        ruleIn: [],
        ruleOut: [],
        supportingSymptoms: [
          {
            system: "gastrointestinal",
            symptom: "abdominal pain",
          },
        ],
        refutingSymptoms: [],
        riskFactors: ["reproductive-age woman", "smoking", "hypertension"],
      },
      {
        dx: "Vasovagal syncope",
        likelihood: "likely",
        ruleIn: ["Prolonged standing trigger", "Prodrome nausea/warmth", "Rapid recovery"],
        ruleOut: ["Exertional", "Supine"],
        supportingSymptoms: [],
        refutingSymptoms: [
          {
            system: "cardiovascular",
            symptom: "chest pain",
          },
        ],
        riskFactors: [],
      },
      {
        dx: "Orthostatic hypotension",
        likelihood: "likely",
        ruleIn: ["On standing"],
        ruleOut: ["Supine"],
        supportingSymptoms: [],
        refutingSymptoms: [],
        riskFactors: ["antihypertensives", "diabetes mellitus", "volume depletion"],
      },
      {
        dx: "Seizure (distinguish)",
        likelihood: "less_likely",
        ruleIn: ["Prolonged post-event confusion", "Tongue-biting", "Incontinence"],
        ruleOut: ["Rapid recovery"],
        supportingSymptoms: [
          {
            system: "neurological",
            symptom: "seizures",
          },
        ],
        refutingSymptoms: [],
        riskFactors: ["epilepsy"],
      },
    ],
    discriminatingHpc: [
      "posture / circumstance",
      "prodrome (none vs warning)",
      "recovery (rapid vs prolonged confusion)",
      "witness account",
      "exertional or supine?",
    ],
    associated: [
      "palpitations",
      "chest pain",
      "dyspnoea",
      "headache",
      "abdominal/back pain",
      "missed period",
    ],
    redFlags: [
      "exertional or supine syncope",
      "no prodrome",
      "palpitations/chest pain preceding",
      "family history sudden death",
      "abnormal ECG",
      "collapse + shock",
    ],
    examTargets: [
      {
        area: "Cardiovascular",
        sign: "Lying/standing BP",
        discriminates: "Orthostatic hypotension",
      },
      {
        area: "Cardiovascular",
        sign: "ECG",
        discriminates: "Cardiac syncope (arrhythmia)",
      },
      {
        area: "Cardiovascular",
        sign: "Ejection systolic murmur",
        discriminates: "Aortic stenosis / HOCM",
      },
      {
        area: "Abdominal",
        sign: "Pulsatile mass / tenderness + beta-hCG",
        discriminates: "AAA / ectopic",
      },
      {
        area: "Neurological",
        sign: "Capillary glucose + focal signs",
        discriminates: "Hypoglycaemia / neuro cause",
      },
    ],
    historyEmphasis: [
      "cardiac / arrhythmia history",
      "family history sudden death",
      "medications (antihypertensive/QT)",
      "pregnancy possibility",
      "anticoagulation",
    ],
    combinations: [
      {
        features: ["Exertional", "No prodrome"],
        suggests: "Cardiac syncope",
        action: "ECG + monitoring + senior cardiology; admit",
      },
      {
        features: ["Prolonged standing trigger", "Prodrome nausea/warmth", "Rapid recovery"],
        suggests: "Vasovagal syncope",
        action: "reassure + safety advice; rule out cardiac first",
      },
    ],
    source: "Hutchison Ch 2-3 (clinical reasoning) — CSO-signed (enriched)",
  },
  {
    code: "fever",
    display: "Fever",
    triggerCodes: ["fever"],
    problemReprHint:
      "Frame by tempo/pattern, localising symptoms, and exposures (malaria-endemic residence, HIV, TB contact).",
    differential: [
      {
        dx: "Sepsis / septic shock",
        likelihood: "must_not_miss",
        ruleIn: ["Rigors"],
        ruleOut: [],
        supportingSymptoms: [
          {
            system: "general",
            symptom: "fatigue",
          },
          {
            system: "neurological",
            symptom: "memory/cognitive change",
          },
        ],
        refutingSymptoms: [],
        riskFactors: ["diabetes mellitus", "HIV", "immunosuppression", "indwelling device"],
      },
      {
        dx: "Malaria",
        likelihood: "must_not_miss",
        ruleIn: ["Relapsing / tertian pattern", "Rigors"],
        ruleOut: [],
        supportingSymptoms: [
          {
            system: "gastrointestinal",
            symptom: "jaundice",
          },
          {
            system: "neurological",
            symptom: "memory/cognitive change",
          },
        ],
        refutingSymptoms: [],
        riskFactors: ["malaria", "malaria-endemic residence/travel"],
      },
      {
        dx: "Meningitis / encephalitis",
        likelihood: "must_not_miss",
        ruleIn: [],
        ruleOut: [],
        supportingSymptoms: [
          {
            system: "neurological",
            symptom: "headache",
          },
          {
            system: "skin",
            symptom: "rash",
          },
          {
            system: "neurological",
            symptom: "seizures",
          },
        ],
        refutingSymptoms: [],
        riskFactors: ["HIV", "immunosuppression"],
      },
      {
        dx: "Tuberculosis",
        likelihood: "must_not_miss",
        ruleIn: ["Prolonged fever"],
        ruleOut: [],
        supportingSymptoms: [
          {
            system: "general",
            symptom: "night sweats",
          },
          {
            system: "general",
            symptom: "weight loss",
          },
          {
            system: "respiratory",
            symptom: "cough",
          },
        ],
        refutingSymptoms: [],
        riskFactors: ["tuberculosis", "HIV", "TB contact"],
      },
      {
        dx: "Infective endocarditis",
        likelihood: "must_not_miss",
        ruleIn: ["Prolonged fever"],
        ruleOut: [],
        supportingSymptoms: [
          {
            system: "cardiovascular",
            symptom: "dyspnoea",
          },
        ],
        refutingSymptoms: [],
        riskFactors: ["rheumatic heart disease", "IV drug use", "prosthetic valve"],
      },
      {
        dx: "Urinary tract infection / pyelonephritis",
        likelihood: "likely",
        ruleIn: [],
        ruleOut: [],
        supportingSymptoms: [
          {
            system: "genitourinary",
            symptom: "dysuria",
          },
          {
            system: "genitourinary",
            symptom: "urinary frequency",
          },
        ],
        refutingSymptoms: [],
        riskFactors: ["diabetes mellitus"],
      },
      {
        dx: "Respiratory infection / pneumonia",
        likelihood: "likely",
        ruleIn: [],
        ruleOut: [],
        supportingSymptoms: [
          {
            system: "respiratory",
            symptom: "cough",
          },
          {
            system: "respiratory",
            symptom: "sputum",
          },
          {
            system: "respiratory",
            symptom: "pleuritic chest pain",
          },
        ],
        refutingSymptoms: [],
        riskFactors: ["COPD", "HIV"],
      },
    ],
    discriminatingHpc: [
      "tempo + pattern (relapsing?)",
      "localising symptoms by system",
      "travel / residence / exposures",
      "rigors",
      "duration acute vs prolonged",
    ],
    associated: [
      "neck stiffness",
      "cough/sputum",
      "dysuria",
      "diarrhoea",
      "night sweats + weight loss",
      "new murmur",
    ],
    redFlags: [
      "sepsis physiology (NEWS2/qSOFA)",
      "non-blanching rash",
      "neck stiffness",
      "immunocompromise / neutropenia",
      "returning traveller with fever",
    ],
    examTargets: [
      {
        area: "General",
        sign: "Full vitals + sepsis screen",
        discriminates: "Sepsis",
      },
      {
        area: "Haematological",
        sign: "Malaria film / RDT",
        discriminates: "Malaria",
      },
      {
        area: "Neurological",
        sign: "Neck stiffness / Kernig",
        discriminates: "Meningitis",
      },
      {
        area: "Cardiovascular",
        sign: "New murmur + peripheral stigmata",
        discriminates: "Infective endocarditis",
      },
      {
        area: "Skin",
        sign: "Blanching vs non-blanching rash",
        discriminates: "Meningococcal disease",
      },
    ],
    historyEmphasis: [
      "travel / residence (malaria)",
      "HIV status",
      "TB contact / symptoms",
      "immunosuppression",
      "recent procedures / devices / IVDU",
    ],
    combinations: [
      {
        features: ["Relapsing / tertian pattern", "Rigors"],
        suggests: "Malaria",
        action: "malaria film/RDT urgently; treat per severity",
      },
      {
        features: ["Prolonged fever", "night sweats", "weight loss"],
        suggests: "TB / HIV-related",
        action: "CXR + sputum + HIV test; TB work-up",
      },
      {
        features: ["Rigors"],
        suggests: "Bacteraemia / sepsis",
        action: "sepsis bundle: cultures + antibiotics + fluids + lactate",
      },
    ],
    source: "Hutchison Ch 2-3 (clinical reasoning) — CSO-signed (enriched)",
  },
  {
    code: "weight_loss",
    display: "Unintentional weight loss",
    triggerCodes: ["weight_loss"],
    problemReprHint:
      "Frame by amount/time, appetite (reduced vs increased), and alarm features; screen for malignancy, TB, HIV.",
    differential: [
      {
        dx: "Malignancy",
        likelihood: "must_not_miss",
        ruleIn: ["Reduced appetite"],
        ruleOut: [],
        supportingSymptoms: [
          {
            system: "haematological",
            symptom: "lymphadenopathy",
          },
          {
            system: "gastrointestinal",
            symptom: "change in bowel habit",
          },
          {
            system: "respiratory",
            symptom: "haemoptysis",
          },
        ],
        refutingSymptoms: [],
        riskFactors: ["cancer", "smoking", "family cancer history"],
      },
      {
        dx: "Tuberculosis",
        likelihood: "must_not_miss",
        ruleIn: [],
        ruleOut: [],
        supportingSymptoms: [
          {
            system: "general",
            symptom: "night sweats",
          },
          {
            system: "general",
            symptom: "fever",
          },
          {
            system: "respiratory",
            symptom: "cough",
          },
        ],
        refutingSymptoms: [],
        riskFactors: ["tuberculosis", "HIV", "TB contact"],
      },
      {
        dx: "HIV / AIDS",
        likelihood: "must_not_miss",
        ruleIn: [],
        ruleOut: [],
        supportingSymptoms: [
          {
            system: "general",
            symptom: "night sweats",
          },
          {
            system: "haematological",
            symptom: "recurrent infections",
          },
          {
            system: "gastrointestinal",
            symptom: "change in bowel habit",
          },
        ],
        refutingSymptoms: [],
        riskFactors: ["HIV", "high-risk exposure"],
      },
      {
        dx: "Hyperthyroidism",
        likelihood: "likely",
        ruleIn: ["Increased appetite"],
        ruleOut: [],
        supportingSymptoms: [
          {
            system: "endocrine",
            symptom: "heat intolerance",
          },
          {
            system: "cardiovascular",
            symptom: "palpitations",
          },
          {
            system: "neurological",
            symptom: "tremor",
          },
        ],
        refutingSymptoms: [],
        riskFactors: ["thyroid disease"],
      },
      {
        dx: "New diabetes mellitus",
        likelihood: "likely",
        ruleIn: ["Increased appetite"],
        ruleOut: [],
        supportingSymptoms: [
          {
            system: "endocrine",
            symptom: "polyuria/polydipsia",
          },
          {
            system: "general",
            symptom: "fatigue",
          },
        ],
        refutingSymptoms: [],
        riskFactors: ["diabetes mellitus"],
      },
      {
        dx: "Depression",
        likelihood: "likely",
        ruleIn: ["Reduced appetite"],
        ruleOut: [],
        supportingSymptoms: [
          {
            system: "psychiatric",
            symptom: "low mood",
          },
        ],
        refutingSymptoms: [
          {
            system: "general",
            symptom: "fever",
          },
        ],
        riskFactors: ["depression/anxiety"],
      },
    ],
    discriminatingHpc: [
      "quantify amount + time",
      "appetite reduced vs increased",
      "localising alarm symptoms",
      "fever / night sweats",
      "mood / anhedonia",
    ],
    associated: [
      "fever + night sweats",
      "GI alarm features",
      "haemoptysis",
      "polyuria",
      "heat intolerance",
      "lymphadenopathy",
    ],
    redFlags: [
      "weight loss + alarm feature (GI bleeding, dysphagia, haemoptysis, mass, lymphadenopathy)",
      "rapid loss",
      "age >50 with new symptoms",
    ],
    examTargets: [
      {
        area: "Haematological",
        sign: "Lymphadenopathy + hepatosplenomegaly",
        discriminates: "Malignancy / TB / HIV",
      },
      {
        area: "Abdominal",
        sign: "Abdominal mass",
        discriminates: "Malignancy",
      },
      {
        area: "Endocrine",
        sign: "Goitre + tremor + eye signs",
        discriminates: "Thyrotoxicosis",
      },
      {
        area: "General",
        sign: "Oral candidiasis / HIV stigmata",
        discriminates: "HIV",
      },
      {
        area: "Respiratory",
        sign: "Chest signs",
        discriminates: "TB / lung cancer",
      },
    ],
    historyEmphasis: [
      "appetite / mood",
      "HIV status + TB symptoms/contact",
      "smoking",
      "family cancer history",
      "diabetes symptoms",
    ],
    combinations: [
      {
        features: ["Reduced appetite", "lymphadenopathy"],
        suggests: "Malignancy / lymphoma",
        action: "examine + image + biopsy pathway; HIV test",
      },
      {
        features: ["night sweats", "fever", "cough"],
        suggests: "TB",
        action: "CXR + sputum + HIV test",
      },
      {
        features: ["Increased appetite", "polyuria/polydipsia"],
        suggests: "New diabetes",
        action: "capillary + lab glucose; assess for DKA",
      },
    ],
    source: "Hutchison Ch 2-3 (clinical reasoning) — CSO-signed (enriched)",
  },
  {
    code: "fatigue",
    display: "Fatigue / tiredness",
    triggerCodes: ["fatigue"],
    problemReprHint:
      "Fatigue is non-specific - frame to BROADEN and screen (physical vs mental, systemic features); do not anchor on 'tired'.",
    differential: [
      {
        dx: "Malignancy",
        likelihood: "must_not_miss",
        ruleIn: [],
        ruleOut: [],
        supportingSymptoms: [
          {
            system: "general",
            symptom: "weight loss",
          },
          {
            system: "haematological",
            symptom: "lymphadenopathy",
          },
          {
            system: "haematological",
            symptom: "easy bruising/bleeding",
          },
        ],
        refutingSymptoms: [],
        riskFactors: ["cancer", "smoking"],
      },
      {
        dx: "HIV / TB",
        likelihood: "must_not_miss",
        ruleIn: [],
        ruleOut: [],
        supportingSymptoms: [
          {
            system: "general",
            symptom: "night sweats",
          },
          {
            system: "general",
            symptom: "weight loss",
          },
          {
            system: "general",
            symptom: "fever",
          },
        ],
        refutingSymptoms: [],
        riskFactors: ["HIV", "tuberculosis", "TB contact"],
      },
      {
        dx: "Heart failure",
        likelihood: "must_not_miss",
        ruleIn: ["Exertional"],
        ruleOut: [],
        supportingSymptoms: [
          {
            system: "cardiovascular",
            symptom: "exertional dyspnoea",
          },
          {
            system: "cardiovascular",
            symptom: "leg swelling",
          },
          {
            system: "cardiovascular",
            symptom: "orthopnoea",
          },
        ],
        refutingSymptoms: [],
        riskFactors: ["heart failure", "ischaemic heart disease", "hypertension"],
      },
      {
        dx: "Anaemia",
        likelihood: "likely",
        ruleIn: ["Exertional"],
        ruleOut: [],
        supportingSymptoms: [
          {
            system: "haematological",
            symptom: "pallor",
          },
          {
            system: "cardiovascular",
            symptom: "palpitations",
          },
        ],
        refutingSymptoms: [],
        riskFactors: ["sickle-cell disease", "GI blood loss", "heavy menstrual bleeding"],
      },
      {
        dx: "Hypothyroidism",
        likelihood: "likely",
        ruleIn: [],
        ruleOut: [],
        supportingSymptoms: [
          {
            system: "endocrine",
            symptom: "cold intolerance",
          },
          {
            system: "general",
            symptom: "appetite loss",
          },
        ],
        refutingSymptoms: [],
        riskFactors: ["thyroid disease"],
      },
      {
        dx: "Depression",
        likelihood: "likely",
        ruleIn: ["Mental more than physical"],
        ruleOut: [],
        supportingSymptoms: [
          {
            system: "psychiatric",
            symptom: "low mood",
          },
        ],
        refutingSymptoms: [],
        riskFactors: ["depression/anxiety"],
      },
      {
        dx: "Diabetes mellitus",
        likelihood: "likely",
        ruleIn: [],
        ruleOut: [],
        supportingSymptoms: [
          {
            system: "endocrine",
            symptom: "polyuria/polydipsia",
          },
          {
            system: "general",
            symptom: "weight loss",
          },
        ],
        refutingSymptoms: [],
        riskFactors: ["diabetes mellitus"],
      },
    ],
    discriminatingHpc: [
      "duration + pattern",
      "physical vs mental fatigue",
      "weight / fever / night sweats",
      "polyuria / cold intolerance",
      "mood / sleep",
    ],
    associated: [
      "breathlessness",
      "pallor",
      "B-symptoms",
      "polyuria",
      "low mood",
      "postural dizziness",
    ],
    redFlags: [
      "fatigue + weight loss / fever / night sweats / lymphadenopathy / bleeding",
      "severe pallor",
      "breathlessness at rest",
    ],
    examTargets: [
      {
        area: "General",
        sign: "Conjunctival pallor",
        discriminates: "Anaemia",
      },
      {
        area: "Haematological",
        sign: "Lymphadenopathy + hepatosplenomegaly",
        discriminates: "Malignancy / TB / HIV",
      },
      {
        area: "Endocrine",
        sign: "Thyroid exam",
        discriminates: "Hypothyroidism",
      },
      {
        area: "Cardiovascular",
        sign: "Heart failure signs",
        discriminates: "Heart failure",
      },
      {
        area: "Cardiovascular",
        sign: "Lying/standing BP",
        discriminates: "Addison's / orthostatic",
      },
    ],
    historyEmphasis: [
      "mood / sleep",
      "HIV / TB",
      "menstrual / GI blood loss",
      "thyroid / renal / liver history",
      "diabetes symptoms",
    ],
    combinations: [
      {
        features: ["Exertional", "leg swelling", "exertional dyspnoea"],
        suggests: "Heart failure",
        action: "CXR + BNP + echo",
      },
      {
        features: ["weight loss", "night sweats", "fever"],
        suggests: "HIV / TB / malignancy",
        action: "HIV test + CXR + examine for lymphadenopathy",
      },
    ],
    source: "Hutchison Ch 2-3 (clinical reasoning) — CSO-signed (enriched)",
  },
  {
    code: "dizziness",
    display: "Dizziness / vertigo",
    triggerCodes: ["dizziness"],
    problemReprHint:
      "FIRST split the type: true spinning (vertigo) vs light-headed (presyncope) vs unsteady; then central vs peripheral.",
    differential: [
      {
        dx: "Posterior-circulation stroke / TIA (central)",
        likelihood: "must_not_miss",
        ruleIn: ["Continuous", "With focal neuro symptoms"],
        ruleOut: ["Triggered by head movement, brief"],
        supportingSymptoms: [
          {
            system: "neurological",
            symptom: "speech disturbance",
          },
          {
            system: "neurological",
            symptom: "visual disturbance",
          },
          {
            system: "neurological",
            symptom: "weakness",
          },
        ],
        refutingSymptoms: [],
        riskFactors: ["hypertension", "atrial fibrillation", "diabetes mellitus", "smoking"],
      },
      {
        dx: "Cardiac arrhythmia (presyncope)",
        likelihood: "must_not_miss",
        ruleIn: ["Light-headed / faint type"],
        ruleOut: ["True spinning"],
        supportingSymptoms: [
          {
            system: "cardiovascular",
            symptom: "palpitations",
          },
          {
            system: "cardiovascular",
            symptom: "syncope",
          },
        ],
        refutingSymptoms: [],
        riskFactors: ["ischaemic heart disease", "atrial fibrillation"],
      },
      {
        dx: "Hypoglycaemia",
        likelihood: "must_not_miss",
        ruleIn: ["Light-headed / faint type"],
        ruleOut: [],
        supportingSymptoms: [
          {
            system: "general",
            symptom: "fatigue",
          },
        ],
        refutingSymptoms: [],
        riskFactors: ["diabetes mellitus", "insulin / sulfonylurea"],
      },
      {
        dx: "BPPV",
        likelihood: "likely",
        ruleIn: ["Triggered by head movement, brief", "True spinning"],
        ruleOut: ["Continuous", "With focal neuro symptoms"],
        supportingSymptoms: [],
        refutingSymptoms: [
          {
            system: "neurological",
            symptom: "weakness",
          },
        ],
        riskFactors: [],
      },
      {
        dx: "Vestibular neuritis / labyrinthitis",
        likelihood: "likely",
        ruleIn: ["Continuous", "True spinning"],
        ruleOut: ["With focal neuro symptoms"],
        supportingSymptoms: [
          {
            system: "ent_eyes",
            symptom: "hearing loss",
          },
        ],
        refutingSymptoms: [],
        riskFactors: ["recent viral illness"],
      },
      {
        dx: "Orthostatic hypotension",
        likelihood: "likely",
        ruleIn: ["On standing", "Light-headed / faint type"],
        ruleOut: ["True spinning"],
        supportingSymptoms: [],
        refutingSymptoms: [],
        riskFactors: ["antihypertensives", "diabetes mellitus", "volume depletion"],
      },
    ],
    discriminatingHpc: [
      "type: spinning vs light-headed vs unsteady",
      "triggers (head movement / standing)",
      "duration",
      "central features (diplopia/dysarthria/ataxia)",
      "hearing loss / tinnitus",
    ],
    associated: [
      "hearing loss/tinnitus",
      "focal neuro/brainstem symptoms",
      "palpitations/chest pain",
      "melaena/pallor",
    ],
    redFlags: [
      "new neurological deficit",
      "inability to stand/walk",
      "severe headache/neck pain",
      "direction-changing nystagmus",
      "central HINTS findings",
      "vascular risk factors",
    ],
    examTargets: [
      {
        area: "Neurological",
        sign: "Cerebellar signs + cranial nerves + gait",
        discriminates: "Central (stroke)",
      },
      {
        area: "Neurological",
        sign: "HINTS exam",
        discriminates: "Central vs peripheral vertigo",
      },
      {
        area: "Cardiovascular",
        sign: "Lying/standing BP + ECG",
        discriminates: "Orthostatic / arrhythmia",
      },
      {
        area: "Neurological",
        sign: "Capillary glucose",
        discriminates: "Hypoglycaemia",
      },
      {
        area: "ENT",
        sign: "Ear exam",
        discriminates: "Labyrinthitis / Meniere's",
      },
    ],
    historyEmphasis: [
      "vascular risk factors",
      "cardiac history",
      "ototoxic / sedating drugs",
      "anaemia / GI-bleed risk",
    ],
    combinations: [
      {
        features: ["Continuous", "With focal neuro symptoms"],
        suggests: "Posterior-circulation stroke",
        action: "urgent stroke pathway + CT/MRI; do not dismiss as peripheral",
      },
      {
        features: ["Triggered by head movement, brief", "True spinning"],
        suggests: "BPPV",
        action: "Dix-Hallpike + Epley; reassure once central excluded",
      },
    ],
    source: "Hutchison Ch 2-3 (clinical reasoning) — CSO-signed (enriched)",
  },
  {
    code: "cough",
    display: "Cough / haemoptysis",
    triggerCodes: ["cough", "haemoptysis"],
    problemReprHint:
      "Frame by duration (acute vs chronic >3-8wk), dry vs productive, and haemoptysis; in Uganda keep TB threshold low.",
    differential: [
      {
        dx: "Tuberculosis",
        likelihood: "must_not_miss",
        ruleIn: ["Chronic over 3 weeks"],
        ruleOut: [],
        supportingSymptoms: [
          {
            system: "respiratory",
            symptom: "haemoptysis",
          },
          {
            system: "general",
            symptom: "night sweats",
          },
          {
            system: "general",
            symptom: "weight loss",
          },
        ],
        refutingSymptoms: [],
        riskFactors: ["tuberculosis", "HIV", "TB contact"],
      },
      {
        dx: "Lung cancer",
        likelihood: "must_not_miss",
        ruleIn: ["Chronic over 3 weeks"],
        ruleOut: [],
        supportingSymptoms: [
          {
            system: "respiratory",
            symptom: "haemoptysis",
          },
          {
            system: "general",
            symptom: "weight loss",
          },
        ],
        refutingSymptoms: [],
        riskFactors: ["smoking", "cancer"],
      },
      {
        dx: "Pulmonary embolism",
        likelihood: "must_not_miss",
        ruleIn: [],
        ruleOut: [],
        supportingSymptoms: [
          {
            system: "respiratory",
            symptom: "pleuritic chest pain",
          },
          {
            system: "respiratory",
            symptom: "haemoptysis",
          },
          {
            system: "respiratory",
            symptom: "dyspnoea",
          },
        ],
        refutingSymptoms: [],
        riskFactors: ["prior VTE", "cancer", "recent immobility or surgery"],
      },
      {
        dx: "Pneumonia / sepsis",
        likelihood: "likely",
        ruleIn: ["Acute under 3 weeks"],
        ruleOut: [],
        supportingSymptoms: [
          {
            system: "general",
            symptom: "fever",
          },
          {
            system: "respiratory",
            symptom: "sputum",
          },
          {
            system: "respiratory",
            symptom: "pleuritic chest pain",
          },
        ],
        refutingSymptoms: [],
        riskFactors: ["COPD", "HIV"],
      },
      {
        dx: "Heart failure",
        likelihood: "likely",
        ruleIn: [],
        ruleOut: [],
        supportingSymptoms: [
          {
            system: "cardiovascular",
            symptom: "orthopnoea",
          },
          {
            system: "cardiovascular",
            symptom: "leg swelling",
          },
          {
            system: "cardiovascular",
            symptom: "paroxysmal nocturnal dyspnoea",
          },
        ],
        refutingSymptoms: [],
        riskFactors: ["heart failure", "ischaemic heart disease"],
      },
      {
        dx: "Asthma / COPD",
        likelihood: "likely",
        ruleIn: ["Dry"],
        ruleOut: [],
        supportingSymptoms: [
          {
            system: "respiratory",
            symptom: "wheeze",
          },
        ],
        refutingSymptoms: [],
        riskFactors: ["asthma", "COPD", "smoking"],
      },
      {
        dx: "ACE-inhibitor cough / post-nasal drip / GORD",
        likelihood: "likely",
        ruleIn: ["Dry", "Chronic over 3 weeks"],
        ruleOut: ["Haemoptysis"],
        supportingSymptoms: [],
        refutingSymptoms: [
          {
            system: "general",
            symptom: "weight loss",
          },
        ],
        riskFactors: ["hypertension"],
      },
    ],
    discriminatingHpc: [
      "duration acute vs chronic",
      "dry vs productive + sputum colour",
      "haemoptysis (quantify)",
      "fever",
      "weight loss / night sweats",
    ],
    associated: [
      "night sweats + weight loss + haemoptysis",
      "pleuritic pain + leg swelling",
      "fever + purulent sputum",
      "orthopnoea/PND",
    ],
    redFlags: [
      "haemoptysis (with weight loss / smoking / age)",
      "chronic cough >3-8 weeks",
      "breathlessness / hypoxia",
      "systemic features",
    ],
    examTargets: [
      {
        area: "Haematological",
        sign: "Lymphadenopathy + cachexia",
        discriminates: "TB / malignancy",
      },
      {
        area: "Respiratory",
        sign: "Consolidation / effusion / wheeze / crackles",
        discriminates: "Pneumonia / effusion / airways",
      },
      {
        area: "Respiratory",
        sign: "Clubbing",
        discriminates: "Malignancy / bronchiectasis",
      },
      {
        area: "Cardiovascular",
        sign: "Heart failure signs",
        discriminates: "Heart failure",
      },
      {
        area: "Peripheral",
        sign: "Unilateral calf swelling",
        discriminates: "PE (DVT)",
      },
    ],
    historyEmphasis: [
      "TB contact / prior TB",
      "HIV status",
      "smoking",
      "occupational exposure",
      "ACE-inhibitor",
      "VTE risk",
    ],
    combinations: [
      {
        features: ["Chronic over 3 weeks", "Haemoptysis", "weight loss"],
        suggests: "TB or lung cancer",
        action: "CXR + sputum (AFB/GeneXpert) + HIV test; low threshold for TB",
      },
      {
        features: ["Acute under 3 weeks", "fever", "sputum"],
        suggests: "Pneumonia",
        action: "CXR + sepsis screen + antibiotics",
      },
    ],
    source: "Hutchison Ch 2-3 (clinical reasoning) — CSO-signed (enriched)",
  },
  {
    code: "jaundice",
    display: "Jaundice",
    triggerCodes: ["jaundice"],
    problemReprHint:
      "Frame as pre-hepatic vs hepatic vs obstructive (stool/urine colour, itch, pain, fever); flag cholangitis + liver failure.",
    differential: [
      {
        dx: "Ascending cholangitis",
        likelihood: "must_not_miss",
        ruleIn: ["Right upper quadrant pain", "With fever"],
        ruleOut: [],
        supportingSymptoms: [
          {
            system: "general",
            symptom: "fever",
          },
          {
            system: "gastrointestinal",
            symptom: "abdominal pain",
          },
        ],
        refutingSymptoms: [],
        riskFactors: ["gallstones"],
      },
      {
        dx: "Pancreatic / biliary malignancy",
        likelihood: "must_not_miss",
        ruleIn: ["Painless", "Pale stools / dark urine"],
        ruleOut: [],
        supportingSymptoms: [
          {
            system: "general",
            symptom: "weight loss",
          },
          {
            system: "skin",
            symptom: "pruritus",
          },
        ],
        refutingSymptoms: [],
        riskFactors: ["cancer", "smoking"],
      },
      {
        dx: "Acute liver failure / fulminant hepatitis",
        likelihood: "must_not_miss",
        ruleIn: [],
        ruleOut: [],
        supportingSymptoms: [
          {
            system: "neurological",
            symptom: "memory/cognitive change",
          },
          {
            system: "haematological",
            symptom: "easy bruising/bleeding",
          },
        ],
        refutingSymptoms: [],
        riskFactors: ["liver disease", "hepatitis B/C", "paracetamol overdose"],
      },
      {
        dx: "Severe malaria / sickle haemolytic crisis",
        likelihood: "must_not_miss",
        ruleIn: ["With fever"],
        ruleOut: ["Pale stools / dark urine"],
        supportingSymptoms: [
          {
            system: "general",
            symptom: "fever",
          },
          {
            system: "haematological",
            symptom: "pallor",
          },
        ],
        refutingSymptoms: [],
        riskFactors: ["malaria", "sickle-cell disease"],
      },
      {
        dx: "Viral hepatitis",
        likelihood: "likely",
        ruleIn: [],
        ruleOut: [],
        supportingSymptoms: [
          {
            system: "general",
            symptom: "fatigue",
          },
          {
            system: "general",
            symptom: "appetite loss",
          },
        ],
        refutingSymptoms: [],
        riskFactors: ["hepatitis B/C", "HIV"],
      },
      {
        dx: "Alcoholic / decompensated liver disease",
        likelihood: "likely",
        ruleIn: [],
        ruleOut: [],
        supportingSymptoms: [
          {
            system: "gastrointestinal",
            symptom: "abdominal distension",
          },
          {
            system: "gastrointestinal",
            symptom: "haematemesis",
          },
        ],
        refutingSymptoms: [],
        riskFactors: ["liver disease", "alcohol"],
      },
      {
        dx: "Gallstones (obstructive)",
        likelihood: "likely",
        ruleIn: ["Right upper quadrant pain", "Pale stools / dark urine"],
        ruleOut: ["Painless"],
        supportingSymptoms: [
          {
            system: "skin",
            symptom: "pruritus",
          },
        ],
        refutingSymptoms: [],
        riskFactors: ["gallstones"],
      },
    ],
    discriminatingHpc: [
      "pre-hepatic vs hepatic vs obstructive pattern",
      "stool/urine colour + itch",
      "RUQ pain + fever (cholangitis)",
      "painless progressive (malignancy)",
      "confusion / bruising (liver failure)",
    ],
    associated: [
      "fever + RUQ pain",
      "confusion + bruising",
      "pale stools/dark urine/itch",
      "weight loss",
      "pallor (haemolysis)",
    ],
    redFlags: [
      "jaundice + fever + RUQ pain (cholangitis)",
      "encephalopathy / coagulopathy (liver failure)",
      "GI bleeding",
    ],
    examTargets: [
      {
        area: "General",
        sign: "Vitals (sepsis)",
        discriminates: "Cholangitis",
      },
      {
        area: "Abdominal",
        sign: "Hepatic stigmata + asterixis + ascites",
        discriminates: "Liver failure / cirrhosis",
      },
      {
        area: "Abdominal",
        sign: "RUQ tenderness / Murphy's",
        discriminates: "Cholangitis / cholecystitis",
      },
      {
        area: "Abdominal",
        sign: "Palpable gallbladder (Courvoisier)",
        discriminates: "Biliary / pancreatic malignancy",
      },
      {
        area: "General",
        sign: "Conjunctival pallor",
        discriminates: "Haemolysis",
      },
    ],
    historyEmphasis: [
      "alcohol",
      "hepatitis risk (transfusion/sexual/IVDU)",
      "drugs (paracetamol / herbal / TB drugs)",
      "sickle / malaria",
      "prior gallstones",
    ],
    combinations: [
      {
        features: ["Right upper quadrant pain", "With fever"],
        suggests: "Ascending cholangitis",
        action: "sepsis bundle + urgent imaging + biliary drainage; senior",
      },
      {
        features: ["Painless", "Pale stools / dark urine", "weight loss"],
        suggests: "Biliary / pancreatic malignancy",
        action: "USS/CT + tumour markers; refer",
      },
    ],
    source: "Hutchison Ch 2-3 (clinical reasoning) — CSO-signed (enriched)",
  },
  {
    code: "gi_bleeding",
    display: "Gastrointestinal bleeding",
    triggerCodes: ["gi_bleeding", "haematemesis", "rectal_bleeding"],
    problemReprHint:
      "Frame upper (haematemesis/melaena) vs lower (fresh PR), volume, and haemodynamic compromise; flag varices + shock.",
    differential: [
      {
        dx: "Variceal haemorrhage",
        likelihood: "must_not_miss",
        ruleIn: ["Haematemesis"],
        ruleOut: [],
        supportingSymptoms: [
          {
            system: "gastrointestinal",
            symptom: "abdominal distension",
          },
          {
            system: "gastrointestinal",
            symptom: "jaundice",
          },
        ],
        refutingSymptoms: [],
        riskFactors: ["liver disease", "alcohol", "hepatitis B/C"],
      },
      {
        dx: "Major upper-GI bleed with shock",
        likelihood: "must_not_miss",
        ruleIn: ["Haematemesis", "Melaena", "With dizziness/syncope"],
        ruleOut: [],
        supportingSymptoms: [
          {
            system: "cardiovascular",
            symptom: "syncope",
          },
          {
            system: "haematological",
            symptom: "pallor",
          },
        ],
        refutingSymptoms: [],
        riskFactors: ["peptic ulcer disease", "NSAID / anticoagulant use"],
      },
      {
        dx: "Colorectal malignancy",
        likelihood: "must_not_miss",
        ruleIn: ["Fresh red PR bleeding"],
        ruleOut: [],
        supportingSymptoms: [
          {
            system: "gastrointestinal",
            symptom: "change in bowel habit",
          },
          {
            system: "general",
            symptom: "weight loss",
          },
        ],
        refutingSymptoms: [],
        riskFactors: ["cancer", "family bowel cancer"],
      },
      {
        dx: "Ruptured AAA / aorto-enteric fistula",
        likelihood: "must_not_miss",
        ruleIn: [],
        ruleOut: [],
        supportingSymptoms: [
          {
            system: "gastrointestinal",
            symptom: "abdominal pain",
          },
          {
            system: "cardiovascular",
            symptom: "syncope",
          },
        ],
        refutingSymptoms: [],
        riskFactors: ["hypertension", "smoking", "prior aortic graft"],
      },
      {
        dx: "Peptic ulcer / gastritis",
        likelihood: "likely",
        ruleIn: ["Haematemesis", "Melaena"],
        ruleOut: [],
        supportingSymptoms: [
          {
            system: "gastrointestinal",
            symptom: "heartburn",
          },
        ],
        refutingSymptoms: [],
        riskFactors: ["peptic ulcer disease", "NSAID use"],
      },
      {
        dx: "Haemorrhoids / diverticular",
        likelihood: "likely",
        ruleIn: ["Fresh red PR bleeding"],
        ruleOut: ["Haematemesis", "Melaena"],
        supportingSymptoms: [],
        refutingSymptoms: [
          {
            system: "general",
            symptom: "weight loss",
          },
        ],
        riskFactors: [],
      },
    ],
    discriminatingHpc: [
      "haematemesis/melaena (upper) vs fresh PR (lower)",
      "volume",
      "haemodynamic symptoms",
      "NSAIDs / anticoagulants / alcohol",
      "known liver disease",
    ],
    associated: [
      "dizziness/syncope/pallor",
      "liver stigmata",
      "weight loss + bowel change",
      "abdominal/back pain",
    ],
    redFlags: [
      "haemodynamic instability / shock",
      "large-volume bleed",
      "known varices / cirrhosis",
      "syncope",
    ],
    examTargets: [
      {
        area: "General",
        sign: "Vitals + shock assessment",
        discriminates: "Major bleed (priority)",
      },
      {
        area: "Abdominal",
        sign: "PR exam (melaena / mass / haemorrhoids)",
        discriminates: "Upper vs lower / malignancy",
      },
      {
        area: "Abdominal",
        sign: "Liver stigmata + ascites",
        discriminates: "Variceal bleed",
      },
      {
        area: "Abdominal",
        sign: "Pulsatile mass",
        discriminates: "AAA / aorto-enteric fistula",
      },
      {
        area: "General",
        sign: "Conjunctival pallor",
        discriminates: "Significant blood loss",
      },
    ],
    historyEmphasis: [
      "NSAIDs / aspirin / anticoagulants",
      "alcohol / liver disease",
      "prior ulcer / varices",
      "weight loss / bowel change",
      "AAA risk",
    ],
    combinations: [
      {
        features: ["Haematemesis", "With dizziness/syncope"],
        suggests: "Major upper-GI bleed",
        action: "resuscitate (permissive + MHP) + urgent endoscopy; transfusion",
      },
      {
        features: ["Haematemesis", "jaundice", "abdominal distension"],
        suggests: "Variceal haemorrhage",
        action: "resus + terlipressin + antibiotics + urgent endoscopy",
      },
    ],
    source: "Hutchison Ch 2-3 (clinical reasoning) — CSO-signed (enriched)",
  },
  {
    code: "oedema",
    display: "Oedema / leg swelling",
    triggerCodes: ["oedema", "leg_swelling"],
    problemReprHint:
      "FIRST split unilateral (DVT/cellulitis/local) vs bilateral (cardiac/renal/hepatic/hypoalbuminaemic).",
    differential: [
      {
        dx: "Deep vein thrombosis (to PE)",
        likelihood: "must_not_miss",
        ruleIn: ["Unilateral", "Acute and painful"],
        ruleOut: ["Bilateral"],
        supportingSymptoms: [
          {
            system: "respiratory",
            symptom: "pleuritic chest pain",
          },
          {
            system: "respiratory",
            symptom: "dyspnoea",
          },
        ],
        refutingSymptoms: [],
        riskFactors: [
          "cancer",
          "prior VTE",
          "recent immobility or surgery",
          "oestrogen / pregnancy",
        ],
      },
      {
        dx: "Cellulitis / necrotising fasciitis",
        likelihood: "must_not_miss",
        ruleIn: ["Unilateral", "Red and warm"],
        ruleOut: ["Bilateral"],
        supportingSymptoms: [
          {
            system: "general",
            symptom: "fever",
          },
        ],
        refutingSymptoms: [],
        riskFactors: ["diabetes mellitus", "skin breach"],
      },
      {
        dx: "Heart failure",
        likelihood: "must_not_miss",
        ruleIn: ["Bilateral"],
        ruleOut: ["Unilateral"],
        supportingSymptoms: [
          {
            system: "cardiovascular",
            symptom: "orthopnoea",
          },
          {
            system: "cardiovascular",
            symptom: "paroxysmal nocturnal dyspnoea",
          },
          {
            system: "cardiovascular",
            symptom: "exertional dyspnoea",
          },
        ],
        refutingSymptoms: [],
        riskFactors: ["heart failure", "ischaemic heart disease", "hypertension"],
      },
      {
        dx: "Nephrotic syndrome",
        likelihood: "likely",
        ruleIn: ["Bilateral", "Facial / periorbital"],
        ruleOut: ["Unilateral"],
        supportingSymptoms: [
          {
            system: "genitourinary",
            symptom: "frothy urine",
          },
        ],
        refutingSymptoms: [],
        riskFactors: ["diabetes mellitus", "chronic kidney disease"],
      },
      {
        dx: "Decompensated liver disease",
        likelihood: "likely",
        ruleIn: ["Bilateral"],
        ruleOut: ["Unilateral"],
        supportingSymptoms: [
          {
            system: "gastrointestinal",
            symptom: "abdominal distension",
          },
          {
            system: "gastrointestinal",
            symptom: "jaundice",
          },
        ],
        refutingSymptoms: [],
        riskFactors: ["liver disease", "alcohol"],
      },
      {
        dx: "Venous insufficiency / dependent / drug-induced",
        likelihood: "likely",
        ruleIn: ["Bilateral", "Worse in evening"],
        ruleOut: ["Acute and painful"],
        supportingSymptoms: [],
        refutingSymptoms: [
          {
            system: "general",
            symptom: "fever",
          },
        ],
        riskFactors: ["calcium-channel blocker"],
      },
    ],
    discriminatingHpc: [
      "unilateral vs bilateral",
      "acute + painful (DVT/cellulitis)",
      "dyspnoea/orthopnoea (cardiac)",
      "frothy urine (nephrotic)",
      "fever + redness (cellulitis)",
    ],
    associated: [
      "dyspnoea / pleuritic pain (PE)",
      "orthopnoea / PND (HF)",
      "proteinuria / facial oedema",
      "ascites / jaundice",
      "fever + redness + pain",
    ],
    redFlags: [
      "unilateral painful swollen calf + chest symptom (PE)",
      "fever + spreading erythema + pain out of proportion (nec fasc)",
      "gross bilateral + breathlessness",
    ],
    examTargets: [
      {
        area: "Peripheral",
        sign: "Unilateral vs bilateral + calf tenderness",
        discriminates: "DVT vs systemic",
      },
      {
        area: "Skin",
        sign: "Erythema / warmth / demarcation",
        discriminates: "Cellulitis / nec fasc",
      },
      {
        area: "Cardiovascular",
        sign: "Raised JVP + heart failure signs",
        discriminates: "Heart failure",
      },
      {
        area: "Abdominal",
        sign: "Ascites + liver stigmata",
        discriminates: "Liver disease",
      },
      {
        area: "Genitourinary",
        sign: "Urine dipstick (protein)",
        discriminates: "Nephrotic syndrome",
      },
    ],
    historyEmphasis: [
      "VTE risk (immobility/surgery/malignancy/oestrogen/pregnancy)",
      "cardiac / renal / liver history",
      "drugs (CCBs)",
      "recent trauma / skin breach",
    ],
    combinations: [
      {
        features: ["Unilateral", "Acute and painful"],
        suggests: "DVT",
        action: "Wells + Doppler/D-dimer; anticoagulation; assess for PE",
      },
      {
        features: ["Unilateral", "Red and warm", "fever"],
        suggests: "Cellulitis (exclude nec fasc)",
        action: "antibiotics; surgical review if pain out of proportion / systemic toxicity",
      },
    ],
    source: "Hutchison Ch 2-3 (clinical reasoning) — CSO-signed (enriched)",
  },
  {
    code: "joint_pain",
    display: "Joint pain / swelling",
    triggerCodes: ["joint_pain", "joint_swelling"],
    problemReprHint:
      "An acute hot swollen joint is septic until proven otherwise; otherwise split inflammatory vs mechanical pattern.",
    differential: [
      {
        dx: "Septic arthritis",
        likelihood: "must_not_miss",
        ruleIn: ["Single hot swollen joint", "With fever", "Acute"],
        ruleOut: ["Worse with use"],
        supportingSymptoms: [
          {
            system: "general",
            symptom: "fever",
          },
        ],
        refutingSymptoms: [],
        riskFactors: ["diabetes mellitus", "HIV", "immunosuppression", "prosthetic joint"],
      },
      {
        dx: "Rheumatic fever",
        likelihood: "must_not_miss",
        ruleIn: ["Migratory", "Acute"],
        ruleOut: [],
        supportingSymptoms: [
          {
            system: "general",
            symptom: "fever",
          },
          {
            system: "ent_eyes",
            symptom: "sore throat/hoarseness",
          },
        ],
        refutingSymptoms: [],
        riskFactors: ["rheumatic heart disease", "recent sore throat"],
      },
      {
        dx: "Haemarthrosis",
        likelihood: "must_not_miss",
        ruleIn: ["Acute", "Single joint"],
        ruleOut: ["With fever"],
        supportingSymptoms: [
          {
            system: "haematological",
            symptom: "easy bruising/bleeding",
          },
        ],
        refutingSymptoms: [],
        riskFactors: ["anticoagulant", "bleeding disorder"],
      },
      {
        dx: "Gout / pseudogout",
        likelihood: "likely",
        ruleIn: ["Single hot swollen joint", "Acute"],
        ruleOut: [],
        supportingSymptoms: [],
        refutingSymptoms: [],
        riskFactors: ["gout", "chronic kidney disease"],
      },
      {
        dx: "Rheumatoid / inflammatory arthritis",
        likelihood: "likely",
        ruleIn: ["Morning stiffness over 30 min", "Symmetrical small joints"],
        ruleOut: ["Worse with use"],
        supportingSymptoms: [
          {
            system: "general",
            symptom: "fatigue",
          },
        ],
        refutingSymptoms: [],
        riskFactors: ["rheumatoid arthritis"],
      },
      {
        dx: "Osteoarthritis / mechanical",
        likelihood: "likely",
        ruleIn: ["Worse with use", "Brief stiffness"],
        ruleOut: ["With fever", "Morning stiffness over 30 min"],
        supportingSymptoms: [],
        refutingSymptoms: [
          {
            system: "general",
            symptom: "fever",
          },
        ],
        riskFactors: ["age", "obesity"],
      },
    ],
    discriminatingHpc: [
      "acute single hot joint (septic)?",
      "inflammatory vs mechanical pattern",
      "monoarticular vs polyarticular",
      "fever",
      "preceding sore throat / infection",
    ],
    associated: [
      "fever + single hot joint",
      "rash / uveitis / urethritis",
      "preceding sore throat",
      "morning stiffness",
      "prior gout",
    ],
    redFlags: [
      "acute hot swollen joint + fever (septic)",
      "inability to weight-bear",
      "systemic sepsis",
    ],
    examTargets: [
      {
        area: "Musculoskeletal",
        sign: "Effusion / warmth / erythema / range",
        discriminates: "Septic / crystal arthritis",
      },
      {
        area: "General",
        sign: "Fever / vitals",
        discriminates: "Septic arthritis",
      },
      {
        area: "Musculoskeletal",
        sign: "Number + pattern of joints",
        discriminates: "Inflammatory vs mechanical",
      },
      {
        area: "Cardiovascular",
        sign: "New murmur",
        discriminates: "Rheumatic fever",
      },
      {
        area: "Skin",
        sign: "Rash / nodules / nail changes",
        discriminates: "Connective-tissue / psoriatic",
      },
    ],
    historyEmphasis: [
      "preceding infection / sore throat (rheumatic fever)",
      "prior gout / RA",
      "immunosuppression / diabetes (septic risk)",
      "anticoagulants",
      "trauma",
    ],
    combinations: [
      {
        features: ["Single hot swollen joint", "With fever"],
        suggests: "Septic arthritis",
        action: "urgent joint aspiration + antibiotics; do not delay; ortho/rheum",
      },
      {
        features: ["Migratory", "recent sore throat"],
        suggests: "Rheumatic fever",
        action: "ASOT + ECG/echo; treat per Jones criteria",
      },
    ],
    source: "Hutchison Ch 2-3 (clinical reasoning) — CSO-signed (enriched)",
  },
  {
    code: "confusion",
    display: "Altered consciousness / confusion",
    triggerCodes: ["confusion"],
    problemReprHint:
      "CHECK GLUCOSE FIRST. Frame by onset (acute delirium vs chronic dementia) + reversible causes; collateral essential.",
    differential: [
      {
        dx: "Hypoglycaemia",
        likelihood: "must_not_miss",
        ruleIn: ["Acute"],
        ruleOut: [],
        supportingSymptoms: [],
        refutingSymptoms: [],
        riskFactors: ["diabetes mellitus", "insulin / sulfonylurea"],
      },
      {
        dx: "Sepsis / meningitis / encephalitis",
        likelihood: "must_not_miss",
        ruleIn: ["Acute", "Fluctuating"],
        ruleOut: [],
        supportingSymptoms: [
          {
            system: "general",
            symptom: "fever",
          },
          {
            system: "neurological",
            symptom: "headache",
          },
          {
            system: "skin",
            symptom: "rash",
          },
        ],
        refutingSymptoms: [],
        riskFactors: ["HIV", "immunosuppression", "indwelling device"],
      },
      {
        dx: "Stroke / intracranial bleed / raised ICP",
        likelihood: "must_not_miss",
        ruleIn: ["Acute"],
        ruleOut: [],
        supportingSymptoms: [
          {
            system: "neurological",
            symptom: "weakness",
          },
          {
            system: "neurological",
            symptom: "headache",
          },
          {
            system: "neurological",
            symptom: "speech disturbance",
          },
        ],
        refutingSymptoms: [],
        riskFactors: ["hypertension", "atrial fibrillation", "anticoagulant"],
      },
      {
        dx: "Cerebral malaria",
        likelihood: "must_not_miss",
        ruleIn: ["Acute"],
        ruleOut: [],
        supportingSymptoms: [
          {
            system: "general",
            symptom: "fever",
          },
          {
            system: "neurological",
            symptom: "seizures",
          },
        ],
        refutingSymptoms: [],
        riskFactors: ["malaria", "malaria-endemic residence/travel"],
      },
      {
        dx: "DKA / HHS",
        likelihood: "must_not_miss",
        ruleIn: ["Acute"],
        ruleOut: [],
        supportingSymptoms: [
          {
            system: "endocrine",
            symptom: "polyuria/polydipsia",
          },
        ],
        refutingSymptoms: [],
        riskFactors: ["diabetes mellitus"],
      },
      {
        dx: "Drug / alcohol intoxication or withdrawal",
        likelihood: "likely",
        ruleIn: ["Acute"],
        ruleOut: [],
        supportingSymptoms: [],
        refutingSymptoms: [],
        riskFactors: ["alcohol", "opioids / sedatives"],
      },
      {
        dx: "Dementia (chronic)",
        likelihood: "likely",
        ruleIn: ["Gradual"],
        ruleOut: ["Acute", "Fluctuating"],
        supportingSymptoms: [
          {
            system: "neurological",
            symptom: "memory/cognitive change",
          },
        ],
        refutingSymptoms: [
          {
            system: "general",
            symptom: "fever",
          },
        ],
        riskFactors: ["age"],
      },
    ],
    discriminatingHpc: [
      "onset acute vs gradual",
      "fluctuation (delirium)",
      "fever (infection)",
      "focal deficit (stroke)",
      "glucose / drugs / alcohol / trauma",
    ],
    associated: [
      "fever + neck stiffness (meningitis)",
      "focal weakness (stroke)",
      "hypoxia / shock (fix first)",
      "pinpoint pupils + low RR (opioid)",
      "polyuria / ketones (DKA)",
    ],
    redFlags: [
      "GCS <=8 (to airway - back to A)",
      "focal deficit",
      "meningism",
      "falling GCS",
      "Cushing's response (raised ICP)",
    ],
    examTargets: [
      {
        area: "Neurological",
        sign: "GCS + capillary glucose + pupils",
        discriminates: "Hypoglycaemia / depth + cause",
      },
      {
        area: "General",
        sign: "Vitals (sepsis / hypoxia)",
        discriminates: "Sepsis / respiratory failure",
      },
      {
        area: "Neurological",
        sign: "Neck stiffness",
        discriminates: "Meningitis",
      },
      {
        area: "Neurological",
        sign: "Focal neurological signs",
        discriminates: "Stroke / SOL",
      },
      {
        area: "Haematological",
        sign: "Malaria film",
        discriminates: "Cerebral malaria",
      },
    ],
    historyEmphasis: [
      "baseline cognition + time-course (collateral)",
      "drugs / alcohol",
      "diabetes",
      "HIV / malaria exposure",
      "recent infection / trauma",
    ],
    combinations: [
      {
        features: ["Acute", "low glucose"],
        suggests: "Hypoglycaemia",
        action: "give IV glucose immediately + recheck; reversible",
      },
      {
        features: ["Acute", "fever", "neck stiffness"],
        suggests: "Meningitis / encephalitis",
        action: "do not delay antimicrobials; sepsis bundle; senior",
      },
    ],
    source: "Hutchison Ch 2-3 (clinical reasoning) — CSO-signed (enriched)",
  },
  {
    code: "focal_weakness",
    display: "Focal weakness / suspected stroke",
    triggerCodes: ["focal_weakness", "weakness"],
    problemReprHint:
      "Establish EXACT onset time (thrombolysis window) + deficit pattern; check glucose (mimic). Time-critical.",
    differential: [
      {
        dx: "Acute ischaemic stroke",
        likelihood: "must_not_miss",
        ruleIn: ["Sudden", "Unilateral face/arm/leg", "Speech disturbance"],
        ruleOut: ["Gradual over weeks"],
        supportingSymptoms: [
          {
            system: "neurological",
            symptom: "speech disturbance",
          },
          {
            system: "neurological",
            symptom: "visual disturbance",
          },
          {
            system: "neurological",
            symptom: "weakness",
          },
        ],
        refutingSymptoms: [],
        riskFactors: [
          "hypertension",
          "atrial fibrillation",
          "diabetes mellitus",
          "smoking",
          "stroke/TIA",
        ],
      },
      {
        dx: "Intracranial haemorrhage",
        likelihood: "must_not_miss",
        ruleIn: ["Sudden"],
        ruleOut: [],
        supportingSymptoms: [
          {
            system: "neurological",
            symptom: "headache",
          },
          {
            system: "gastrointestinal",
            symptom: "nausea/vomiting",
          },
          {
            system: "neurological",
            symptom: "memory/cognitive change",
          },
        ],
        refutingSymptoms: [],
        riskFactors: ["hypertension", "anticoagulant"],
      },
      {
        dx: "Subarachnoid haemorrhage",
        likelihood: "must_not_miss",
        ruleIn: ["Thunderclap"],
        ruleOut: [],
        supportingSymptoms: [
          {
            system: "neurological",
            symptom: "headache",
          },
        ],
        refutingSymptoms: [],
        riskFactors: ["hypertension", "family history SAH"],
      },
      {
        dx: "Hypoglycaemia (stroke mimic)",
        likelihood: "must_not_miss",
        ruleIn: ["Sudden"],
        ruleOut: [],
        supportingSymptoms: [],
        refutingSymptoms: [],
        riskFactors: ["diabetes mellitus", "insulin / sulfonylurea"],
      },
      {
        dx: "Space-occupying lesion",
        likelihood: "must_not_miss",
        ruleIn: ["Gradual over weeks"],
        ruleOut: ["Sudden"],
        supportingSymptoms: [
          {
            system: "neurological",
            symptom: "headache",
          },
          {
            system: "neurological",
            symptom: "seizures",
          },
        ],
        refutingSymptoms: [],
        riskFactors: ["cancer", "HIV"],
      },
      {
        dx: "Todd's paresis (post-seizure)",
        likelihood: "likely",
        ruleIn: ["Sudden", "Preceding seizure"],
        ruleOut: [],
        supportingSymptoms: [
          {
            system: "neurological",
            symptom: "seizures",
          },
        ],
        refutingSymptoms: [],
        riskFactors: ["epilepsy"],
      },
      {
        dx: "Bell's palsy / peripheral lesion",
        likelihood: "likely",
        ruleIn: ["Isolated facial (forehead involved)"],
        ruleOut: ["Unilateral face/arm/leg"],
        supportingSymptoms: [],
        refutingSymptoms: [
          {
            system: "neurological",
            symptom: "weakness",
          },
        ],
        riskFactors: [],
      },
    ],
    discriminatingHpc: [
      "EXACT onset time",
      "deficit pattern (face/arm/leg, speech, visual)",
      "sudden vs gradual",
      "headache + reduced consciousness (haemorrhage)",
      "preceding seizure (Todd's) / glucose",
    ],
    associated: [
      "headache/vomiting/reduced GCS (haemorrhage)",
      "seizure",
      "hypoglycaemia",
      "visual disturbance",
      "prior similar (TIA)",
    ],
    redFlags: [
      "any acute focal deficit (time-critical)",
      "reduced GCS / headache (haemorrhage)",
      "thunderclap headache (SAH)",
    ],
    examTargets: [
      {
        area: "Neurological",
        sign: "Stroke assessment (FAST / NIHSS)",
        discriminates: "Stroke severity + territory",
      },
      {
        area: "Neurological",
        sign: "GCS + capillary glucose + pupils",
        discriminates: "Hypoglycaemia / haemorrhage",
      },
      {
        area: "Neurological",
        sign: "Forehead sparing vs involvement",
        discriminates: "Central (UMN) vs Bell's (LMN)",
      },
      {
        area: "Cardiovascular",
        sign: "Pulse rhythm (AF) + BP",
        discriminates: "Cardioembolic source",
      },
      {
        area: "Cardiovascular",
        sign: "Carotid bruit",
        discriminates: "Carotid source",
      },
    ],
    historyEmphasis: [
      "EXACT onset time",
      "vascular risk factors (AF, hypertension, diabetes, smoking)",
      "anticoagulation (haemorrhage risk + thrombolysis contraindication)",
      "prior stroke / TIA",
    ],
    combinations: [
      {
        features: ["Sudden", "Unilateral face/arm/leg", "Speech disturbance"],
        suggests: "Acute stroke",
        action: "time-critical stroke pathway: CT head + glucose + thrombolysis assessment",
      },
      {
        features: ["Sudden", "low glucose"],
        suggests: "Hypoglycaemia (mimic)",
        action: "give IV glucose + recheck before calling it a stroke",
      },
    ],
    source: "Hutchison Ch 2-3 (clinical reasoning) — CSO-signed (enriched)",
  },
];
