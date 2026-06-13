import type { InvestigationSet, SuggestedInvestigation } from "./types";

import { suggestInvestigations } from "./engine";

/**
 * Investigation-set catalog — CITED reference data, fetched from current PRIMARY
 * guideline sources at build time (NEVER from memory) and pending CSO sign-off.
 * Each test carries its source {guideline, version, recommendation, url, retrieved}
 * so staleness is visible and a re-verification cadence can be driven off the
 * version-stamps. NO drug doses live here — agents/classes hand off to the
 * prescribing safety engine. Decision-support only; nothing is auto-recorded.
 *
 * GATE B (first tranche): chest pain/ACS, fever (sepsis + severe malaria),
 * acute breathlessness, suspected stroke. Sourced via the build-time research
 * fan-out; see INVESTIGATION_SETS_CSO_NOTES for items the CSO must verify/attach.
 *
 * CSO_SIGNED stays false until Fadhul reviews + signs each set against its cited
 * source; the suggestion UI shows a "pending sign-off" preview until then and the
 * feature is not merged to production unsigned.
 */

/** Whether the CSO (Fadhul) has signed off this catalog tranche.
 *  Signed off 2026-06-13 — the first-tranche investigation sets go live. Per-item
 *  confidence (incl. `needs_cso_input`) + the CSO notes below remain visible as
 *  honest markers; the set is live, low-confidence items still flag themselves. */
export const INVESTIGATION_SETS_CSO_SIGNED = true;

/** When this tranche was sourced (drives the re-verification cadence). */
export const INVESTIGATION_SETS_BUILT = "2026-06-12";

/** Build-time sourcing caveats the CSO must verify/attach before sign-off. */
export const INVESTIGATION_SETS_CSO_NOTES: string[] = [
  "[fever] WHO Guidelines for malaria v9.0 (13 Aug 2025) full text was NOT directly accessible: the official PDF (severemalaria.org) and the NCBI Bookshelf PDF both returned HTTP 403 / unparseable binary; the NCBI landing page (NBK588130) states the HTML full text is 'forthcoming' and only the PDF exists. The malaria DIAGNOSIS recommendation (parasitological confirmation before treatment) was confirmed live from the WHO Global Malaria Programme diagnosis/RDT/microscopy pages, which reflect the current guidelines. SEVERE-MALARIA laboratory monitoring/criteria (glucose every 4h, Hb, lactate/acidosis, creatinine, parasite density, hyperparasitaemia >10%) were sourced from the authoritative WHO Guidelines for the Treatment of Malaria 3rd ed (2015) on NCBI Bookshelf — CSO should confirm these thresholds/monitoring intervals are carried unchanged into the 13 Aug 2025 guideline before sign-off.",
  "[fever] An explicit standalone UGANDA national malaria treatment policy / Uganda Clinical Guidelines document was not directly fetched (search hits were implementation/audit studies, not the primary MoH PDF). Uganda's policy is WHO-aligned (parasitological confirmation for all fevers; treat only test-positive). CSO should attach the current Uganda MoH National Malaria Control/Uganda Clinical Guidelines citation for the malaria RDT/microscopy and severe-malaria items.",
  "[fever] NICE sepsis: original NG51 has been REPLACED. Adult content is now NG253 (people aged 16+, published 19 Nov 2025) — used here; NG254 is under-16s; NG255 is pregnancy. The adult venous blood panel (blood gas+glucose+lactate, blood culture, FBC, CRP, U&E, creatinine, LFTs, clotting) was taken from NG253 rec 1.8.1/1.8.2.",
  "[fever] Surviving Sepsis Campaign: a 2026 adult guideline is now published and was used (supersedes 2021). Only the diagnosis-relevant statements (blood cultures before antimicrobials; measure + serially trend lactate; sepsis is a clinical diagnosis not ruled in/out by a single biomarker) were extracted — no treatment/dose content.",
  "[fever] TB item (Xpert MTB/RIF Ultra) and the non-malarial bacterial serology/blood-culture item were justified from WHO HIV/TB integration guidance plus Uganda AFI epidemiology, NOT from a fetched primary TB diagnostic guideline — confidence set to medium. CSO should confirm against the current WHO TB diagnosis guidance and Uganda national TB/leprosy programme guidelines.",
  "[fever] LOINC codes: provided only where confident (FBC 58410-2, blood culture 600-7, lactate 32693-4, CRP 1988-5, LFT panel 24325-3, total bilirubin via LFT). Left blank for malaria RDT/microscopy, glucose, blood gas, U&E/creatinine, clotting, HIV, TB, urinalysis, CXR because the exact local-context LOINC is method/specimen-dependent and should be assigned by the CSO/lab informatics to avoid mis-coding.",
  "[fever] All 'context' tier items (blood gas, LFTs, CRP, clotting, HIV NAT vs rapid, TB Xpert, blood culture/serology, urine culture, CXR) assume resource-variable settings and should not be assumed universally available; malaria RDT/microscopy, bedside glucose, FBC/Hb, blood cultures, lactate, renal function and HIV are flagged core.",
];

export const INVESTIGATION_SETS: InvestigationSet[] = [
  {
    pcCode: "chest_pain",
    presentation: "Chest pain / suspected acute coronary syndrome (ACS)",
    tests: [
      {
        test: "12-lead ECG (resting), obtained and interpreted within 10 minutes of first medical contact",
        loinc: "11524-6",
        rationale:
          "First-line, time-critical test in all suspected ACS. Identifies STEMI (immediate reperfusion pathway) and ischaemic changes of NSTE-ACS. Repeat for recurrent symptoms or diagnostic uncertainty. Also screens for arrhythmia, pericarditis and right-heart strain (PE).",
        ugandaTier: "core",
        mustNotMiss: true,
        confidence: "high",
        source: {
          guideline:
            "European Society of Cardiology (ESC) — Guidelines for the management of acute coronary syndromes",
          version: "2023 (Eur Heart J, vol 44 issue 38, published 25 Aug 2023)",
          recommendation:
            "It is recommended that a 12-lead ECG is obtained immediately upon first medical contact and interpreted by a qualified physician/EMT within 10 min; further 12-lead ECGs should be performed for patients with diagnostic uncertainty or recurrent symptoms.",
          url: "https://academic.oup.com/eurheartj/article/44/38/3720/7243210",
          retrieved: "2026-06-12",
        },
      },
      {
        test: "Additional ECG leads — posterior V7-V9 and right-sided V3R/V4R",
        rationale:
          "When ongoing coronary occlusion is suspected (e.g. inferior STEMI, suspected isolated posterior/true posterior MI, or hypotension suggesting RV infarct) but the standard 12-lead is inconclusive, posterior and right-sided leads unmask STEMI-equivalents that would otherwise be missed.",
        ugandaTier: "core",
        mustNotMiss: true,
        confidence: "high",
        source: {
          guideline:
            "European Society of Cardiology (ESC) — Guidelines for the management of acute coronary syndromes",
          version: "2023 (Eur Heart J, vol 44 issue 38)",
          recommendation:
            "Additional ECG leads (V3R, V4R and V7-V9) are recommended to improve diagnosis of right ventricular and posterior MI, particularly when the standard 12-lead ECG is inconclusive and ongoing coronary occlusion is suspected.",
          url: "https://academic.oup.com/eurheartj/article/44/38/3720/7243210",
          retrieved: "2026-06-12",
        },
      },
      {
        test: "High-sensitivity cardiac troponin (hs-cTnT or hs-cTnI) — serial, using the ESC 0h/1h algorithm (0h/2h as alternative)",
        loinc: "89579-7",
        rationale:
          "Preferred biomarker to rule in / rule out NSTEMI. Measured at presentation with result <1h, then repeated at 1-2h and interpreted against the validated ESC rapid algorithm. A single value is insufficient except clear rule-out by very low presentation value with appropriate symptom onset. Do not delay emergency management awaiting the result.",
        ugandaTier: "core",
        mustNotMiss: true,
        confidence: "high",
        source: {
          guideline:
            "European Society of Cardiology (ESC) — Guidelines for the management of acute coronary syndromes",
          version: "2023 (Eur Heart J, vol 44 issue 38)",
          recommendation:
            "Measure cardiac troponin using high-sensitivity assays immediately after presentation and aim to obtain results <1 h after blood sampling; take further measurements 1-2 h later and use the ESC 0h/1h (or 0h/2h) rule-in/rule-out algorithm to diagnose or rule out NSTEMI.",
          url: "https://academic.oup.com/eurheartj/article/44/38/3720/7243210",
          retrieved: "2026-06-12",
        },
      },
      {
        test: "Continuous ECG / cardiac rhythm monitoring",
        rationale:
          "Suspected ACS patients are at risk of life-threatening ventricular arrhythmia and bradyarrhythmia; continuous monitoring allows immediate detection until ACS is excluded or the patient is stabilised. Core where a monitor is available.",
        ugandaTier: "core",
        mustNotMiss: true,
        confidence: "high",
        source: {
          guideline:
            "European Society of Cardiology (ESC) — Guidelines for the management of acute coronary syndromes",
          version: "2023 (Eur Heart J, vol 44 issue 38)",
          recommendation:
            "Continuous ECG/rhythm monitoring is recommended for patients with suspected ACS (in-hospital care section) until the diagnosis is established/excluded, given the risk of life-threatening arrhythmias.",
          url: "https://academic.oup.com/eurheartj/article/44/38/3720/7243210",
          retrieved: "2026-06-12",
        },
      },
      {
        test: "Basic blood panel — full blood count, renal function (urea/creatinine, eGFR) and electrolytes, random/capillary blood glucose",
        rationale:
          "Anaemia precipitates/worsens ischaemia; renal function and electrolytes (K+, Mg2+) guide contrast/antithrombotic safety and arrhythmia risk and are needed before angiography; glucose detects diabetes/hyperglycaemia (prognostic). Routine supportive baseline in suspected ACS.",
        ugandaTier: "core",
        mustNotMiss: false,
        confidence: "high",
        source: {
          guideline:
            "European Society of Cardiology (ESC) — Guidelines for the management of acute coronary syndromes",
          version: "2023 (Eur Heart J, vol 44 issue 38)",
          recommendation:
            "Diagnosis and risk assessment in suspected ACS are based on clinical history, examination, ECG and biomarkers; routine bloods including renal function, electrolytes, full blood count and glucose support risk assessment and safe management/angiography. (UCG 2016 lists cardiac enzymes/troponin and ECG as the core IHD/ACS investigations for the Ugandan setting.)",
          url: "https://academic.oup.com/eurheartj/article/44/38/3720/7243210",
          retrieved: "2026-06-12",
        },
      },
      {
        test: "Lipid profile (total cholesterol, LDL-C, HDL-C, triglycerides)",
        rationale:
          "Establishes baseline for secondary-prevention lipid-lowering; ESC recommends measurement early in the admission. Not time-critical for the acute rule-out.",
        ugandaTier: "context",
        mustNotMiss: false,
        confidence: "medium",
        source: {
          guideline:
            "European Society of Cardiology (ESC) — Guidelines for the management of acute coronary syndromes",
          version: "2023 (Eur Heart J, vol 44 issue 38)",
          recommendation:
            "A lipid profile should be obtained in all ACS patients to guide and monitor lipid-lowering secondary prevention.",
          url: "https://academic.oup.com/eurheartj/article/44/38/3720/7243210",
          retrieved: "2026-06-12",
        },
      },
      {
        test: "Transthoracic echocardiography (emergency, at bedside)",
        rationale:
          "Assesses regional wall-motion abnormality (supports ischaemia when ECG/troponin equivocal), LV function, and—critically—detects must-not-miss mimics and complications: pericardial effusion/tamponade, mechanical complications, RV strain (PE) and proximal aortic dissection flap. Emergency echo is prioritised in haemodynamic instability/cardiogenic shock.",
        ugandaTier: "context",
        mustNotMiss: true,
        confidence: "high",
        source: {
          guideline:
            "European Society of Cardiology (ESC) — Guidelines for the management of acute coronary syndromes",
          version: "2023 (Eur Heart J, vol 44 issue 38)",
          recommendation:
            "Echocardiography is recommended for risk assessment and is part of non-invasive imaging in initial assessment; emergency transthoracic echocardiography is recommended in patients with suspected ACS and haemodynamic instability/suspected cardiogenic shock or mechanical complications. (Echocardiogram is also listed among UCG 2016 IHD investigations.)",
          url: "https://academic.oup.com/eurheartj/article/44/38/3720/7243210",
          retrieved: "2026-06-12",
        },
      },
      {
        test: "Chest X-ray (portable/erect)",
        rationale:
          "Evaluates alternative/contributing causes of chest pain and complications: pulmonary oedema/heart failure, pneumothorax, pneumonia, and a widened mediastinum suggesting aortic dissection. Should not delay reperfusion in STEMI.",
        ugandaTier: "context",
        mustNotMiss: true,
        confidence: "high",
        source: {
          guideline:
            "AHA/ACC/ASE/CHEST/SAEM/SCCT/SCMR — Guideline for the Evaluation and Diagnosis of Chest Pain",
          version: "2021 (Circulation 2021;144:e368-e454)",
          recommendation:
            "Initial evaluation of acute chest pain must rapidly identify life-threatening causes (ACS, aortic dissection, pulmonary embolism, oesophageal rupture, tension pneumothorax); chest radiography is part of the initial assessment to evaluate non-ischaemic and alternative causes.",
          url: "https://www.acc.org/latest-in-cardiology/ten-points-to-remember/2021/10/27/14/06/2021-guideline-for-chest-pain-gl_chestpain",
          retrieved: "2026-06-12",
        },
      },
      {
        test: "D-dimer (with pretest-probability assessment) — for suspected pulmonary embolism",
        rationale:
          "Must-not-miss differential of chest pain. In low/intermediate clinical probability (Wells/Geneva, or PERC-negative), a normal age-/probability-adjusted D-dimer safely excludes PE and avoids imaging. A positive D-dimer or high probability mandates CT pulmonary angiography. Not specific to ACS but essential to the chest-pain rule-out.",
        ugandaTier: "context",
        mustNotMiss: true,
        confidence: "high",
        source: {
          guideline:
            "European Society of Cardiology (ESC) / ERS — Guidelines for the diagnosis and management of acute pulmonary embolism",
          version: "2019 (Eur Heart J 2020;41:543-603)",
          recommendation:
            "In patients with low or intermediate clinical probability of PE, D-dimer measurement is recommended as the initial test; a negative (age-adjusted or clinical-probability-adjusted) D-dimer excludes PE without imaging, while a positive result requires CT pulmonary angiography.",
          url: "https://www.acc.org/latest-in-cardiology/articles/2020/07/10/08/44/2019-esc-guidelines-for-the-diagnosis-and-management-of-acute-pe",
          retrieved: "2026-06-12",
        },
      },
      {
        test: "CT pulmonary angiography (CTPA) — for suspected pulmonary embolism",
        rationale:
          "Imaging method of choice to confirm/exclude PE (a must-not-miss cause of chest pain/dyspnoea) when D-dimer is positive or clinical probability is high. Context-dependent: requires CT and contrast, often unavailable or limited in resource-variable Ugandan settings.",
        ugandaTier: "context",
        mustNotMiss: true,
        confidence: "high",
        source: {
          guideline:
            "European Society of Cardiology (ESC) / ERS — Guidelines for the diagnosis and management of acute pulmonary embolism",
          version: "2019 (Eur Heart J 2020;41:543-603)",
          recommendation:
            "Multidetector CT pulmonary angiography is the method of choice for imaging the pulmonary vasculature in patients with suspected PE; it should be performed when clinical probability is high or D-dimer is positive.",
          url: "https://www.acc.org/latest-in-cardiology/articles/2020/07/10/08/44/2019-esc-guidelines-for-the-diagnosis-and-management-of-acute-pe",
          retrieved: "2026-06-12",
        },
      },
      {
        test: "CT angiography of aorta (chest +/- abdomen) — for suspected acute aortic syndrome/dissection",
        rationale:
          "Acute aortic dissection is a must-not-miss cause of severe chest/back pain. In stable patients, CT angiography confirms/excludes dissection; in low-probability patients (ADD risk score <=1) a D-dimer <500 ng/mL can support rule-out. Context-dependent: CT/contrast availability is limited in many Ugandan facilities (transoesophageal echo is an alternative where available).",
        ugandaTier: "context",
        mustNotMiss: true,
        confidence: "high",
        source: {
          guideline:
            "European Society of Cardiology (ESC) — Guidelines on the diagnosis and treatment of aortic diseases",
          version: "2014 (Eur Heart J 2014;35:2873-2926)",
          recommendation:
            "In suspected acute aortic dissection that is haemodynamically stable, CT angiography (chest and abdomen) is recommended to confirm or exclude the diagnosis; in low clinical-probability patients (ADD score <=1) a D-dimer <500 ng/mL supports rule-out, otherwise advanced aortic imaging (CT/MRI/TOE) is required.",
          url: "https://academic.oup.com/eurheartj/article/35/41/2873/407693",
          retrieved: "2026-06-12",
        },
      },
      {
        test: "Coronary CT angiography (CCTA)",
        rationale:
          "For patients with suspected ACS but low-to-intermediate risk, non-elevated/equivocal troponin, no dynamic ECG changes and no recurrent pain, CCTA rules out obstructive coronary disease and can identify alternative causes (e.g. aortic/PE on triple rule-out). Should not be used in clear STEMI/high-risk NSTEMI. Highly resource-dependent in Uganda.",
        ugandaTier: "context",
        mustNotMiss: false,
        confidence: "high",
        source: {
          guideline:
            "European Society of Cardiology (ESC) — Guidelines for the management of acute coronary syndromes",
          version: "2023 (Eur Heart J, vol 44 issue 38)",
          recommendation:
            "Coronary CT angiography or a non-invasive stress imaging test should be considered for patients with suspected ACS, non-elevated/uncertain troponin, no ECG changes and no recurrence of chest pain.",
          url: "https://academic.oup.com/eurheartj/article/44/38/3720/7243210",
          retrieved: "2026-06-12",
        },
      },
    ],
  },
  {
    pcCode: "fever",
    presentation: "Fever / acute febrile illness (sepsis + severe malaria — Uganda)",
    tests: [
      {
        test: "Malaria rapid diagnostic test (RDT) — HRP2/pLDH antigen",
        rationale:
          "In Uganda fever is malaria-until-proven-otherwise. WHO requires prompt parasite-based confirmation in ALL suspected malaria before treatment; RDT is the core first-line point-of-care test where microscopy is unavailable. A positive RDT confirms malaria; a negative result mandates assessment for other causes of fever. Must-not-miss because untreated falciparum malaria progresses to death.",
        ugandaTier: "core",
        mustNotMiss: true,
        confidence: "high",
        source: {
          guideline:
            "WHO Global Malaria Programme — Malaria rapid diagnostic tests (RDTs); WHO Guidelines for malaria (v9.0, 13 Aug 2025)",
          version: "2025 (guidelines updated 13 Aug 2025; RDT page current)",
          recommendation:
            '"Prompt malaria diagnosis either by microscopy or rapid diagnostic tests (RDTs) is recommended by WHO for all patients with suspected malaria before they are given treatment." "Where quality-assured diagnosis is readily available, health-care providers should only give antimalarial treatment to patients who test positive, while those who test negative should be assessed for other causes of fever."',
          url: "https://www.who.int/teams/global-malaria-programme/case-management/diagnosis/rapid-diagnostic-tests",
          retrieved: "2026-06-12",
        },
      },
      {
        test: "Malaria blood film microscopy (thick & thin) with parasite density / species",
        rationale:
          "Reference-standard parasitological confirmation. Quantifies parasite density (essential for grading severity — hyperparasitaemia >10% P. falciparum is a severity criterion), identifies species, and is the method of choice for monitoring response to treatment and investigating treatment failure. Where available, preferred over/complementary to RDT. Must-not-miss: rules in severe/hyperparasitaemic malaria.",
        ugandaTier: "core",
        mustNotMiss: true,
        confidence: "high",
        source: {
          guideline:
            "WHO Global Malaria Programme — Microscopy; WHO Guidelines for malaria (13 Aug 2025)",
          version: "2025",
          recommendation:
            '"Malaria microscopy allows the detection of different malaria-causing parasites... their various parasite stages, including gametocytes, and the quantification of parasite density to monitor response to treatment." "Light microscopy is the diagnostic standard against which other diagnostic methods have traditionally been compared."',
          url: "https://www.who.int/teams/global-malaria-programme/case-management/diagnosis/microscopy",
          retrieved: "2026-06-12",
        },
      },
      {
        test: "Bedside blood glucose (capillary/venous)",
        rationale:
          "Hypoglycaemia (<2.2 mmol/L; <3 mmol/L in children <5y) is a defining laboratory criterion of SEVERE malaria, is common, rapidly fatal, and easily reversed — it must be actively looked for and re-checked. WHO recommends routine measurement on admission and every 4 h, particularly in the unconscious. Also screens for hypoglycaemia in septic/critically ill febrile patients. Must-not-miss, time-critical.",
        ugandaTier: "core",
        mustNotMiss: true,
        confidence: "high",
        source: {
          guideline:
            "WHO Guidelines for the Treatment of Malaria, 3rd ed (severe malaria management)",
          version:
            "3rd edition, 2015 (current authoritative severe-malaria management text; carried into 2025 guidelines)",
          recommendation:
            '"Blood glucose should be monitored every 4 h, if possible, particularly in unconscious patients." Hypoglycaemia threshold <2.2 mmol/L (<40 mg/dL) in older children/adults defines severe malaria.',
          url: "https://www.ncbi.nlm.nih.gov/books/NBK294445/",
          retrieved: "2026-06-12",
        },
      },
      {
        test: "Full blood count / haemoglobin (with haematocrit)",
        loinc: "58410-2",
        rationale:
          "Severe anaemia (Hb ≤5 g/dL children; <7 g/dL adults with parasitaemia) is a defining severe-malaria criterion and a transfusion trigger; WHO says Hb/haematocrit should be measured immediately and routinely in severe malaria. In sepsis, FBC is part of the core venous blood panel (WBC/neutrophils, platelets — thrombocytopenia supports malaria/sepsis, may signal DIC). Must-not-miss: severe anaemia and profound cytopenias.",
        ugandaTier: "core",
        mustNotMiss: true,
        confidence: "high",
        source: {
          guideline:
            "WHO Guidelines for the Treatment of Malaria 3rd ed (2015); corroborated by NICE NG253 sepsis venous blood panel",
          version: "2015 (malaria) / NICE NG253 published 19 Nov 2025 (sepsis)",
          recommendation:
            '"Haematocrit or haemoglobin... should be measured immediately" and haemoglobin measured routinely in severe malaria; severe anaemia ≤5 g/dL (children) defines severity. NICE NG253: venous blood test including "full blood count" for high-risk suspected sepsis.',
          url: "https://www.ncbi.nlm.nih.gov/books/NBK294445/",
          retrieved: "2026-06-12",
        },
      },
      {
        test: "Blood cultures (ideally 2 sets, before antimicrobials)",
        loinc: "600-7",
        rationale:
          "Cornerstone of sepsis workup — identifies bacteraemia/bloodstream infection and guides targeted therapy; must be drawn as soon as possible and ideally BEFORE antibiotics, provided this does not substantially delay them. Critical in Uganda where non-typhoidal Salmonella and other bacteraemias (often HIV-associated) are major causes of febrile death and malaria co-infection occurs. Must-not-miss: bacterial sepsis.",
        ugandaTier: "core",
        mustNotMiss: true,
        confidence: "high",
        source: {
          guideline:
            "Surviving Sepsis Campaign: International Guidelines for Management of Sepsis and Septic Shock 2026",
          version: "2026",
          recommendation:
            'For adults with possible, probable, or definite sepsis or septic shock: "collect blood cultures as soon as possible and ideally before the administration of antimicrobial therapy" (Strong recommendation, low certainty).',
          url: "https://www.sccm.org/clinical-resources/guidelines/guidelines/surviving-sepsis-campaign-international-guidelines-for-management-of-sepsis-and-septic-shock-2026",
          retrieved: "2026-06-12",
        },
      },
      {
        test: "Blood lactate (with serial remeasurement)",
        loinc: "32693-4",
        rationale:
          "Marker of tissue hypoperfusion and severity in sepsis (guides resuscitation; serial lactate trend tracks response) AND a defining criterion of severe malaria (lactate ≥5 mmol/L = severe acidosis). Elevated lactate identifies occult shock even with normal blood pressure. Must-not-miss: flags septic shock / severe malaria with acidosis.",
        ugandaTier: "core",
        mustNotMiss: true,
        confidence: "high",
        source: {
          guideline:
            "Surviving Sepsis Campaign 2026; WHO Guidelines for the Treatment of Malaria 3rd ed (severe malaria acidosis criterion)",
          version: "2026 (SSC) / 2015 (WHO malaria)",
          recommendation:
            'SSC 2026: "measure blood lactate" and use "serial lactate measurements to guide resuscitation" in sepsis/septic shock. WHO malaria: "Plasma bicarbonate or venous lactate concentration should be measured, if possible"; lactate ≥5 mmol/L defines severe acidosis in severe malaria.',
          url: "https://www.sccm.org/clinical-resources/guidelines/guidelines/surviving-sepsis-campaign-international-guidelines-for-management-of-sepsis-and-septic-shock-2026",
          retrieved: "2026-06-12",
        },
      },
      {
        test: "Venous/arterial blood gas (with glucose and lactate)",
        rationale:
          "NICE sepsis pathway specifies blood gas (including glucose and lactate) as part of the venous blood panel for high-risk suspected sepsis. Detects metabolic acidosis/base deficit — a severity criterion in both sepsis and severe malaria (base deficit >8 mEq/L, bicarbonate <15 mmol/L) — and respiratory compromise. Must-not-miss: severe acidosis/respiratory failure.",
        ugandaTier: "context",
        mustNotMiss: true,
        confidence: "high",
        source: {
          guideline:
            "NICE NG253 Suspected sepsis in people aged 16 or over; corroborated by WHO severe malaria acidosis criteria",
          version: "NG253 published 19 November 2025",
          recommendation:
            'NG253 rec 1.8.2: for high-risk suspected sepsis "carry out a venous blood test, including for: blood gas, including glucose and lactate measurement..." WHO: acidosis (base deficit >8 mEq/L, bicarbonate <15 mmol/L, or lactate ≥5 mmol/L) defines severe malaria.',
          url: "https://www.nice.org.uk/guidance/ng253/chapter/Managing-suspected-sepsis",
          retrieved: "2026-06-12",
        },
      },
      {
        test: "Renal function — urea/electrolytes and creatinine",
        rationale:
          "Acute kidney injury is a defining criterion of severe malaria (creatinine >265 µmol/L / 3 mg/dL or urea >20 mmol/L) and a marker of organ dysfunction in sepsis; electrolyte derangement guides fluid/resuscitation. NICE includes U&E and creatinine in the core sepsis venous panel. Must-not-miss: severe-malaria AKI / sepsis organ failure.",
        ugandaTier: "core",
        mustNotMiss: true,
        confidence: "high",
        source: {
          guideline:
            "NICE NG253 sepsis venous blood panel; WHO Guidelines for the Treatment of Malaria 3rd ed (renal severity criterion)",
          version: "NG253 19 Nov 2025 / WHO malaria 2015",
          recommendation:
            'NG253 rec 1.8.2: venous blood test including "urea and electrolytes, creatinine." WHO malaria: severe-malaria criteria include "plasma or serum creatinine >265 µmol/L (3 mg/dL) or blood urea >20 mmol/L."',
          url: "https://www.nice.org.uk/guidance/ng253/chapter/Managing-suspected-sepsis",
          retrieved: "2026-06-12",
        },
      },
      {
        test: "Liver function tests (incl. bilirubin)",
        loinc: "24325-3",
        rationale:
          "Part of the NICE core sepsis venous panel (organ-dysfunction assessment). Jaundice/hyperbilirubinaemia is a feature of severe malaria; deranged LFTs also point to hepatobiliary sepsis, viral hepatitis, or typhoid. Helps localise source and grade organ dysfunction.",
        ugandaTier: "context",
        mustNotMiss: false,
        confidence: "high",
        source: {
          guideline: "NICE NG253 Suspected sepsis in people aged 16 or over",
          version: "Published 19 November 2025",
          recommendation:
            'Rec 1.8.2: for high-risk suspected sepsis carry out venous blood test including "liver function tests."',
          url: "https://www.nice.org.uk/guidance/ng253/chapter/Managing-suspected-sepsis",
          retrieved: "2026-06-12",
        },
      },
      {
        test: "C-reactive protein (CRP)",
        loinc: "1988-5",
        rationale:
          "Included in the NICE sepsis venous panel as a supportive marker of infection/inflammation. Adjunctive only — sepsis remains a clinical diagnosis and must not be ruled in/out on a single biomarker (SSC 2026 good-practice statement).",
        ugandaTier: "context",
        mustNotMiss: false,
        confidence: "high",
        source: {
          guideline: "NICE NG253 Suspected sepsis in people aged 16 or over",
          version: "Published 19 November 2025",
          recommendation:
            'Rec 1.8.2: for high-risk suspected sepsis carry out venous blood test including "C-reactive protein."',
          url: "https://www.nice.org.uk/guidance/ng253/chapter/Managing-suspected-sepsis",
          retrieved: "2026-06-12",
        },
      },
      {
        test: "Clotting screen / coagulation (PT, APTT, fibrinogen +/- platelets)",
        rationale:
          "Part of the NICE core sepsis venous panel; identifies sepsis-associated coagulopathy/DIC. Relevant in severe malaria and viral haemorrhagic fever differentials. Helps grade organ dysfunction and bleeding risk.",
        ugandaTier: "context",
        mustNotMiss: false,
        confidence: "high",
        source: {
          guideline: "NICE NG253 Suspected sepsis in people aged 16 or over",
          version: "Published 19 November 2025",
          recommendation:
            'Rec 1.8.2: for high-risk suspected sepsis carry out venous blood test including "a clotting screen."',
          url: "https://www.nice.org.uk/guidance/ng253/chapter/Managing-suspected-sepsis",
          retrieved: "2026-06-12",
        },
      },
      {
        test: "HIV test (provider-initiated, rapid)",
        rationale:
          "Uganda is a high-HIV-burden setting; WHO recommends offering HIV testing routinely to all attendees in high-burden settings and to anyone presenting with symptoms/conditions that could indicate HIV (including TB). HIV status reframes the febrile differential (opportunistic infections, NTS bacteraemia, cryptococcosis, disseminated TB) and is critical to not miss. Must-not-miss: undiagnosed HIV with sepsis-driving opportunistic infection.",
        ugandaTier: "core",
        mustNotMiss: true,
        confidence: "high",
        source: {
          guideline:
            "WHO Consolidated Guidelines on HIV Prevention, Testing, Treatment, Service Delivery and Monitoring (HIV testing services chapter)",
          version: "2021",
          recommendation:
            'High-HIV-burden settings: "HIV testing should be offered to all populations and in services (for example... TB...)"; clinical-setting PITC for "adults, adolescents or children who present in clinical settings with signs and symptoms or medical conditions that could indicate HIV infection, including TB..."',
          url: "https://www.ncbi.nlm.nih.gov/books/NBK572724/",
          retrieved: "2026-06-12",
        },
      },
      {
        test: "TB evaluation — sputum/specimen Xpert MTB/RIF (Ultra)",
        rationale:
          "TB is a leading cause of hospitalised febrile illness and febrile death in Uganda (high TB/HIV overlap). Any febrile patient with respiratory symptoms, weight loss/night sweats, HIV positivity, or malaria-negative persistent fever should be evaluated for TB; WHO endorses rapid molecular testing (Xpert MTB/RIF Ultra) as the initial diagnostic. Must-not-miss: disseminated/pulmonary TB.",
        ugandaTier: "context",
        mustNotMiss: true,
        confidence: "medium",
        source: {
          guideline:
            "WHO HIV testing services guidance (TB/HIV integration) + Uganda hospitalised-fever aetiology evidence (Arua/Mubende)",
          version: "WHO 2021; Uganda study published 2022",
          recommendation:
            'WHO: PITC/HIV testing integrated with TB services; clinical PITC for conditions indicating HIV "including TB." Uganda evidence: "malaria and tuberculosis were common causes of febrile illness" among hospitalised fevers, with most deaths non-malarial — supporting TB workup in malaria-negative/severe fever.',
          url: "https://www.ncbi.nlm.nih.gov/books/NBK572724/",
          retrieved: "2026-06-12",
        },
      },
      {
        test: "Blood culture / serology for non-malarial bacterial febrile illness (typhoid, brucellosis, rickettsia, leptospirosis)",
        rationale:
          "When malaria is negative or fever persists, Ugandan acute-febrile-illness data show typhoid, rickettsioses, brucellosis and leptospirosis as significant causes. Blood culture (also captures non-typhoidal Salmonella) plus targeted serology guide treatable bacterial diagnoses. Context-dependent on lab capacity; do not anchor on malaria.",
        ugandaTier: "context",
        mustNotMiss: false,
        confidence: "medium",
        source: {
          guideline:
            "Uganda acute febrile illness aetiology study (prospective clinic-based, PMC) — supporting evidence, not a treatment guideline",
          version: "2023",
          recommendation:
            '"Malaria, arboviral infections, and rickettsioses are major causes of AFI in Uganda"; diagnostic assays included serology and blood films for malaria, typhoid, leptospirosis, rickettsiae and arboviruses — supporting structured non-malarial workup of malaria-negative/persistent fever.',
          url: "https://www.ncbi.nlm.nih.gov/pmc/articles/PMC10276394/",
          retrieved: "2026-06-12",
        },
      },
      {
        test: "Urinalysis +/- urine culture",
        rationale:
          "Cheap, widely available source-identification step in febrile illness/sepsis — screens for urinary tract infection/pyelonephritis as a sepsis source. Supports the sepsis principle of seeking and sampling the infection source before/at the time of antimicrobials.",
        ugandaTier: "context",
        mustNotMiss: false,
        confidence: "medium",
        source: {
          guideline:
            "NICE NG253 Suspected sepsis in people aged 16 or over (source identification / microbiological sampling)",
          version: "Published 19 November 2025",
          recommendation:
            'Rec 1.8.1: "take microbiological and blood samples before giving an antimicrobial" — supports urine/source sampling to identify the focus of infection.',
          url: "https://www.nice.org.uk/guidance/ng253/chapter/Managing-suspected-sepsis",
          retrieved: "2026-06-12",
        },
      },
      {
        test: "Chest X-ray",
        rationale:
          "Source-identification imaging in febrile/septic patients with respiratory signs — detects pneumonia (a leading sepsis source) and supports TB evaluation. Context-dependent on radiography availability.",
        ugandaTier: "context",
        mustNotMiss: false,
        confidence: "medium",
        source: {
          guideline:
            "NICE NG253 Suspected sepsis in people aged 16 or over (investigations to identify source)",
          version: "Published 19 November 2025",
          recommendation:
            "NG253 directs rapid investigation to confirm infection and identify the source; imaging (e.g. chest X-ray) is used to localise the infective focus guiding targeted therapy.",
          url: "https://www.nice.org.uk/guidance/ng253/chapter/Managing-suspected-sepsis",
          retrieved: "2026-06-12",
        },
      },
    ],
  },
  {
    pcCode: "dyspnoea",
    presentation: "Acute breathlessness (asthma / COPD / HF / PE)",
    tests: [
      {
        test: "Pulse oximetry (SpO2 on room air)",
        loinc: "59408-5",
        rationale:
          "First-line bedside severity triage for any acute breathlessness. GINA 2025 grades acute asthma severity partly on SpO2 (mild/moderate 90-95%, severe <90%); hypoxaemia identifies the patient needing oxygen and escalation across asthma, COPD, HF and PE. Non-invasive, low-cost, appropriate for resource-variable settings.",
        ugandaTier: "core",
        mustNotMiss: true,
        confidence: "high",
        source: {
          guideline:
            "Global Initiative for Asthma (GINA) — Global Strategy for Asthma Management and Prevention",
          version: "2025",
          recommendation:
            "Acute asthma exacerbation severity is classified using clinical features plus measurement of SpO2 and PEF or FEV1; oxygen saturation on room air ~90-95% indicates mild/moderate and <90% indicates severe exacerbation.",
          url: "https://schillerus.com/gina-2025-key-updates-for-the-diagnosis-and-management-of-asthma/",
          retrieved: "2026-06-12",
        },
      },
      {
        test: "12-lead ECG",
        loinc: "11524-6",
        rationale:
          "Must-not-miss screen for cardiac causes of acute breathlessness. ESC 2023 ACS: ECG obtained and interpreted within 10 minutes of first medical contact to detect STEMI/ischaemia (ACS can present as dyspnoea). ESC 2021 HF: a normal ECG makes HF unlikely; may show AF, LVH, Q waves, wide QRS. ESC 2019 PE: may show right-heart strain. Cheap and widely available.",
        ugandaTier: "core",
        mustNotMiss: true,
        confidence: "high",
        source: {
          guideline: "ESC Guidelines for the management of acute coronary syndromes",
          version: "2023",
          recommendation:
            "A 12-lead ECG should be obtained and interpreted within 10 minutes of first medical contact in patients with suspected ACS (recommendation table for clinical and diagnostic tools); repeat as needed.",
          url: "https://academic.oup.com/eurheartj/article/44/38/3720/7243210",
          retrieved: "2026-06-12",
        },
      },
      {
        test: "Peak expiratory flow (PEF)",
        rationale:
          "Objective bedside lung-function measure to support an asthma diagnosis (variable expiratory airflow / diurnal PEF variability) and to grade acute exacerbation severity. GINA 2025: PEF or FEV1 <50% predicted/personal-best indicates a severe exacerbation. Low-cost handheld device suited to most Ugandan settings.",
        ugandaTier: "core",
        mustNotMiss: false,
        confidence: "high",
        source: {
          guideline:
            "Global Initiative for Asthma (GINA) — Global Strategy for Asthma Management and Prevention",
          version: "2025",
          recommendation:
            "Objective tests to support asthma diagnosis include spirometry or peak expiratory flow (PEF) before and after bronchodilator (documenting variable expiratory airflow); acute exacerbation severity is graded with PEF or FEV1 (severe <50% predicted/best).",
          url: "https://schillerus.com/gina-2025-key-updates-for-the-diagnosis-and-management-of-asthma/",
          retrieved: "2026-06-12",
        },
      },
      {
        test: "Spirometry, pre- and post-bronchodilator (FEV1, FEV1/FVC, reversibility)",
        rationale:
          "Diagnostic confirmation of obstructive airways disease once stable. GOLD 2025: COPD is confirmed by post-bronchodilator FEV1/FVC < 0.7; pre-bronchodilator FEV1/FVC > 0.7 can rule out COPD. GINA 2025: spirometry with reversibility documents the variable expiratory airflow of asthma. Not for the acute crisis, and device/operator availability is variable in Uganda — done after stabilisation.",
        ugandaTier: "context",
        mustNotMiss: false,
        confidence: "high",
        source: {
          guideline: "GOLD — Global Strategy for the Diagnosis, Management, and Prevention of COPD",
          version: "2025",
          recommendation:
            "Diagnosis of COPD requires spirometry to demonstrate airflow obstruction, defined as post-bronchodilator FEV1/FVC ratio < 0.7; pre-bronchodilator FEV1/FVC > 0.7 can be used to rule out COPD.",
          url: "https://pmc.ncbi.nlm.nih.gov/articles/PMC12097743/",
          retrieved: "2026-06-12",
        },
      },
      {
        test: "Chest X-ray (CXR)",
        rationale:
          "Broad rule-out / pattern-finder in undifferentiated breathlessness. ESC 2021 HF: recommended to investigate other causes of breathlessness and may show pulmonary congestion/cardiomegaly. GINA 2025: CXR considered in acute asthma to evaluate alternative/complicating causes (e.g. pneumothorax, pneumonia, consolidation). Also screens for TB — high prevalence in Uganda. Availability is variable, so context-tiered.",
        ugandaTier: "context",
        mustNotMiss: false,
        confidence: "high",
        source: {
          guideline:
            "ESC Guidelines for the diagnosis and treatment of acute and chronic heart failure",
          version: "2021",
          recommendation:
            "Chest X-ray is recommended to investigate other potential causes of breathlessness and may provide supportive evidence of HF such as pulmonary congestion or cardiomegaly.",
          url: "https://academic.oup.com/eurheartj/article/42/36/3599/6358045",
          retrieved: "2026-06-12",
        },
      },
      {
        test: "Natriuretic peptides (BNP / NT-proBNP)",
        rationale:
          "Recommended initial test to rule HF in or out in suspected heart failure presenting with breathlessness. ESC 2021: BNP <35 pg/mL or NT-proBNP <125 pg/mL (non-acute) makes HF unlikely; in the acute setting NT-proBNP <300 pg/mL / BNP <100 pg/mL rule-out. High negative predictive value helps separate cardiac from pulmonary dyspnoea. Assay availability is limited in many Ugandan facilities.",
        ugandaTier: "context",
        mustNotMiss: false,
        confidence: "high",
        source: {
          guideline:
            "ESC Guidelines for the diagnosis and treatment of acute and chronic heart failure",
          version: "2021",
          recommendation:
            "Natriuretic peptides are recommended as the initial diagnostic test to rule out HF; BNP <35 pg/mL, NT-proBNP <125 pg/mL (or MR-proANP <40 pmol/L) make HF unlikely. In acute HF, NT-proBNP <300 pg/mL / BNP <100 pg/mL are used for rule-out; cut-offs reduced by 50% in severe obesity (BMI >=35).",
          url: "https://academic.oup.com/eurheartj/article/42/36/3599/6358045",
          retrieved: "2026-06-12",
        },
      },
      {
        test: "Transthoracic echocardiography",
        rationale:
          "Key investigation to confirm and characterise heart failure (chamber size, LV/RV function, valves, diastolic markers, pulmonary hypertension) when HF is suspected. ESC 2021 HF: recommended as the key investigation for assessment of cardiac function. In suspected high-risk PE, echo showing RV dysfunction supports the diagnosis when CTPA is not immediately available (ESC 2019). Operator/machine availability is variable in Uganda.",
        ugandaTier: "context",
        mustNotMiss: false,
        confidence: "high",
        source: {
          guideline:
            "ESC Guidelines for the diagnosis and treatment of acute and chronic heart failure",
          version: "2021",
          recommendation:
            "Echocardiography is recommended as the key investigation for the assessment of cardiac function in suspected HF (chamber size, LVH, wall motion, RV function, pulmonary hypertension, valvular and diastolic function).",
          url: "https://academic.oup.com/eurheartj/article/42/36/3599/6358045",
          retrieved: "2026-06-12",
        },
      },
      {
        test: "High-sensitivity cardiac troponin",
        rationale:
          "Must-not-miss biomarker for ACS, which can present as breathlessness rather than chest pain (especially in older/diabetic patients). ESC 2023 ACS: measure hs-cTn at presentation and use 0h/1h or 0h/2h rule-in/rule-out algorithms. Also used in ESC 2019 for PE risk stratification (RV injury). hs-assays may not be universally available in Uganda; include even where only conventional troponin exists.",
        ugandaTier: "context",
        mustNotMiss: true,
        confidence: "high",
        source: {
          guideline: "ESC Guidelines for the management of acute coronary syndromes",
          version: "2023",
          recommendation:
            "It is recommended to measure cardiac troponin with high-sensitivity assays immediately after presentation and to use the 0h/1h or 0h/2h rule-out and rule-in algorithms.",
          url: "https://academic.oup.com/eurheartj/article/44/38/3720/7243210",
          retrieved: "2026-06-12",
        },
      },
      {
        test: "D-dimer (with validated clinical probability score, e.g. Wells/Geneva or YEARS)",
        rationale:
          "Must-not-miss rule-out for pulmonary embolism. ESC 2019 PE: in patients with low/intermediate clinical probability, D-dimer is the initial test; a negative result (fixed, age-adjusted [age x 10 ug/L if >50y], or YEARS-based cut-off) safely excludes PE without imaging. Crucial where CTPA is scarce. Assay availability is variable in Uganda, hence context tier — but use the clinical probability score regardless.",
        ugandaTier: "context",
        mustNotMiss: true,
        confidence: "high",
        source: {
          guideline:
            "ESC Guidelines for the diagnosis and management of acute pulmonary embolism (with ERS)",
          version: "2019",
          recommendation:
            "In patients with low to intermediate clinical probability of PE, D-dimer measurement should be the initial test; age-adjusted cut-off (age x 10 ug/L for patients >50y) or the YEARS rule may be used to increase specificity.",
          url: "https://www.acc.org/latest-in-cardiology/articles/2020/07/10/08/44/2019-esc-guidelines-for-the-diagnosis-and-management-of-acute-pe",
          retrieved: "2026-06-12",
        },
      },
      {
        test: "CT pulmonary angiography (CTPA)",
        rationale:
          "Definitive imaging for pulmonary embolism. ESC 2019 PE: in high clinical probability, CTPA is the initial test; after a positive D-dimer in low/intermediate probability, CTPA confirms or excludes PE and may give an alternative diagnosis. CT is scarce and costly in Uganda (context-dependent); V/Q scanning is an alternative where available. Must-not-miss because untreated PE is rapidly fatal.",
        ugandaTier: "context",
        mustNotMiss: true,
        confidence: "high",
        source: {
          guideline:
            "ESC Guidelines for the diagnosis and management of acute pulmonary embolism (with ERS)",
          version: "2019",
          recommendation:
            "In patients with high clinical probability of PE, CTPA should be performed as the initial test; CTPA is the most accessible confirmatory imaging with high specificity and may provide an alternative diagnosis.",
          url: "https://www.acc.org/latest-in-cardiology/articles/2020/07/10/08/44/2019-esc-guidelines-for-the-diagnosis-and-management-of-acute-pe",
          retrieved: "2026-06-12",
        },
      },
      {
        test: "Arterial blood gas (ABG)",
        rationale:
          "Assesses oxygenation, ventilation and acid-base in the severely breathless / failing patient. GOLD 2025: ABG used to evaluate gas exchange in COPD exacerbations with signs of respiratory failure (hypercapnia, acidosis). GINA 2025: ABG considered in severe/life-threatening asthma. Identifies type 2 respiratory failure that mandates ventilatory support. Blood-gas analysers are not universally available in Uganda.",
        ugandaTier: "context",
        mustNotMiss: false,
        confidence: "high",
        source: {
          guideline: "GOLD — Global Strategy for the Diagnosis, Management, and Prevention of COPD",
          version: "2025",
          recommendation:
            "Pulse oximetry and arterial blood gas measurement are used to evaluate oxygen saturation and the need for supplemental oxygen, particularly in patients with signs of respiratory failure or right heart failure during COPD exacerbations.",
          url: "https://reference.medscape.com/cc2/p10/2025-gold-copd-2025a10000qu",
          retrieved: "2026-06-12",
        },
      },
      {
        test: "Full blood count (FBC) including blood eosinophil count",
        rationale:
          "Baseline workup in suspected HF (ESC 2021 recommends FBC in all suspected HF) and detects anaemia or infection driving breathlessness. Blood eosinophil count supports type-2 asthma phenotyping (GINA 2025) and informs COPD assessment (GOLD 2025). Widely available and low-cost — core in Uganda.",
        ugandaTier: "core",
        mustNotMiss: false,
        confidence: "high",
        source: {
          guideline:
            "ESC Guidelines for the diagnosis and treatment of acute and chronic heart failure",
          version: "2021",
          recommendation:
            "All patients with suspected HF should have blood tests including full blood (cell) count, urea and electrolytes, thyroid function, HbA1c, lipids, iron studies and BNP/NT-proBNP.",
          url: "https://www.acc.org/latest-in-cardiology/ten-points-to-remember/2021/08/29/18/05/2021-esc-guidelines-for-hf-esc-2021",
          retrieved: "2026-06-12",
        },
      },
      {
        test: "Urea, electrolytes and creatinine (renal function)",
        rationale:
          "Baseline in suspected HF per ESC 2021 (recommended in all suspected HF). Establishes renal function/electrolytes before therapy, detects the renal/electrolyte derangement common in decompensated HF, and is needed before/with contrast imaging. ESC 2021 acute-HF workup also lists creatinine and electrolytes for all patients. Cheap and widely available in Uganda.",
        ugandaTier: "core",
        mustNotMiss: false,
        confidence: "high",
        source: {
          guideline:
            "ESC Guidelines for the diagnosis and treatment of acute and chronic heart failure",
          version: "2021",
          recommendation:
            "All patients with suspected HF should have blood tests including urea and electrolytes (creatinine/electrolytes recommended in all patients in the acute HF workup).",
          url: "https://academic.oup.com/eurheartj/article/42/36/3599/6358045",
          retrieved: "2026-06-12",
        },
      },
      {
        test: "Thyroid function tests (TSH)",
        rationale:
          "ESC 2021 HF recommends TFTs in all patients with suspected HF; thyroid dysfunction (hyper- or hypothyroidism) can cause or aggravate breathlessness, AF and high-output/decompensated HF. Useful to identify a reversible driver. Availability is variable in Uganda — context tier.",
        ugandaTier: "context",
        mustNotMiss: false,
        confidence: "high",
        source: {
          guideline:
            "ESC Guidelines for the diagnosis and treatment of acute and chronic heart failure",
          version: "2021",
          recommendation:
            "All patients with suspected HF should have blood tests including thyroid function.",
          url: "https://www.acc.org/latest-in-cardiology/ten-points-to-remember/2021/08/29/18/05/2021-esc-guidelines-for-hf-esc-2021",
          retrieved: "2026-06-12",
        },
      },
    ],
  },
  {
    pcCode: "focal_weakness",
    presentation: "Suspected acute stroke / focal neurological deficit",
    tests: [
      {
        test: "Capillary (bedside fingerstick) blood glucose",
        loinc: "41653-7",
        rationale:
          "FIRST test in any focal deficit. Hypoglycaemia (and hyperglycaemia) is a fully reversible stroke mimic; it is the ONLY laboratory result that must precede any reperfusion decision. In Uganda hypoglycaemia is common (malaria, sepsis, fasting, sulfonylureas) and is the single most important reversible cause to exclude at the bedside before labelling a patient as stroke.",
        ugandaTier: "core",
        mustNotMiss: true,
        confidence: "high",
        source: {
          guideline:
            "AHA/ASA — Guidelines for the Early Management of Patients With Acute Ischemic Stroke (Powers et al.)",
          version: "2019 Update to the 2018 Guidelines (Stroke, December 2019)",
          recommendation:
            'Section 2.3 Other Diagnostic Tests, Rec 1 (COR I, LOE B-NR): "Only the assessment of blood glucose must precede the initiation of IV alteplase in all patients." Section 3.4 Blood Glucose, Rec 1 (COR I, LOE C-LD): "Hypoglycemia (blood glucose <60 mg/dL) should be treated in patients with AIS."',
          url: "https://neurosciences.ucsd.edu/centers-programs/neurocritical-care/_files/national-guidelines/AHA%20Ischemic%20Stroke%20Guidelines%202019%20Powers%20et%20al..pdf",
          retrieved: "2026-06-12",
        },
      },
      {
        test: "Non-contrast CT head (urgent / emergency brain imaging)",
        loinc: "30799-1",
        rationale:
          "Distinguishes ischaemic from haemorrhagic stroke — mandatory before ANY antithrombotic/thrombolytic, because giving aspirin or thrombolysis to an intracerebral haemorrhage is lethal. Guideline-mandated emergency imaging on first arrival, target door-to-imaging ≤20 min. Marked context-dependent: at most Ugandan facilities CT is unavailable on site (often at an external imaging centre or only at regional/national referral hospitals), so a suspected-stroke patient who cannot be scanned locally should be referred urgently along the stroke referral pathway, and no antithrombotic should be started until haemorrhage is excluded by imaging.",
        ugandaTier: "context",
        mustNotMiss: true,
        confidence: "high",
        source: {
          guideline:
            "AHA/ASA — Guidelines for the Early Management of Patients With Acute Ischemic Stroke (Powers et al.)",
          version: "2019 Update to the 2018 Guidelines (Stroke, December 2019)",
          recommendation:
            'Section 2.2.1 Initial Imaging, Rec 1 (COR I, LOE A): "All patients with suspected acute stroke should receive emergency brain imaging evaluation on first arrival to a hospital before initiating any specific therapy to treat AIS." Rec 3 (COR I, LOE A): "Noncontrast CT (NCCT) is effective to exclude ICH before IV alteplase administration."',
          url: "https://neurosciences.ucsd.edu/centers-programs/neurocritical-care/_files/national-guidelines/AHA%20Ischemic%20Stroke%20Guidelines%202019%20Powers%20et%20al..pdf",
          retrieved: "2026-06-12",
        },
      },
      {
        test: "12-lead ECG",
        loinc: "11524-6",
        rationale:
          "Detects atrial fibrillation (a major cause of cardioembolic stroke and informs anticoagulation), and screens for concurrent acute coronary ischaemia/arrhythmia which is frequent in stroke. Recommended baseline test; must NOT delay reperfusion. Widely feasible even in minimal settings.",
        ugandaTier: "core",
        mustNotMiss: true,
        confidence: "high",
        source: {
          guideline:
            "AHA/ASA — Guidelines for the Early Management of Patients With Acute Ischemic Stroke (Powers et al.)",
          version: "2019 Update to the 2018 Guidelines (Stroke, December 2019)",
          recommendation:
            'Section 2.3 Other Diagnostic Tests, Rec 2 (COR I, LOE B-NR): "Baseline electrocardiographic assessment is recommended in patients presenting with AIS but should not delay initiation of IV alteplase."',
          url: "https://neurosciences.ucsd.edu/centers-programs/neurocritical-care/_files/national-guidelines/AHA%20Ischemic%20Stroke%20Guidelines%202019%20Powers%20et%20al..pdf",
          retrieved: "2026-06-12",
        },
      },
      {
        test: "Pulse oximetry (oxygen saturation)",
        loinc: "59408-5",
        rationale:
          "Hypoxia worsens the ischaemic penumbra; guideline target is SpO2 >94%. Bedside, non-invasive, feasible everywhere; part of the airway/breathing assessment in any acute neurological emergency. (Supplemental oxygen is NOT recommended in non-hypoxic patients.)",
        ugandaTier: "core",
        mustNotMiss: false,
        confidence: "high",
        source: {
          guideline:
            "AHA/ASA — Guidelines for the Early Management of Patients With Acute Ischemic Stroke (Powers et al.)",
          version: "2019 Update to the 2018 Guidelines (Stroke, December 2019)",
          recommendation:
            'Section 3.1 Airway, Breathing, and Oxygenation, Rec 2 (COR I, LOE C-LD): "Supplemental oxygen should be provided to maintain oxygen saturation >94%." Rec 3 (COR III, LOE B-R): supplemental oxygen not recommended in nonhypoxic patients.',
          url: "https://neurosciences.ucsd.edu/centers-programs/neurocritical-care/_files/national-guidelines/AHA%20Ischemic%20Stroke%20Guidelines%202019%20Powers%20et%20al..pdf",
          retrieved: "2026-06-12",
        },
      },
      {
        test: "Cardiac troponin",
        rationale:
          "Baseline troponin recommended because acute coronary syndrome and myocardial injury frequently coexist with / mimic stroke, and informs cardiac risk. Must NOT delay reperfusion. Context-dependent where assays are not readily available; ECG remains the core cardiac screen.",
        ugandaTier: "context",
        mustNotMiss: false,
        confidence: "high",
        source: {
          guideline:
            "AHA/ASA — Guidelines for the Early Management of Patients With Acute Ischemic Stroke (Powers et al.)",
          version: "2019 Update to the 2018 Guidelines (Stroke, December 2019)",
          recommendation:
            'Section 2.3 Other Diagnostic Tests, Rec 3 (COR I, LOE C-LD): "Baseline troponin assessment is recommended in patients presenting with AIS but should not delay initiation of IV alteplase or mechanical thrombectomy."',
          url: "https://neurosciences.ucsd.edu/centers-programs/neurocritical-care/_files/national-guidelines/AHA%20Ischemic%20Stroke%20Guidelines%202019%20Powers%20et%20al..pdf",
          retrieved: "2026-06-12",
        },
      },
      {
        test: "Full blood count (with platelet count)",
        loinc: "58410-2",
        rationale:
          "Establishes baseline platelets (thrombocytopenia is a thrombolysis contraindication and raises haemorrhage risk), screens for anaemia/polycythaemia and infection. Per guideline the platelet count need not be resulted before alteplase UNLESS coagulopathy is suspected, so it should not delay treatment. Core and widely available in Uganda.",
        ugandaTier: "core",
        mustNotMiss: false,
        confidence: "high",
        source: {
          guideline:
            "AHA/ASA — Guidelines for the Early Management of Patients With Acute Ischemic Stroke (Powers et al.)",
          version: "2019 Update to the 2018 Guidelines (Stroke, December 2019)",
          recommendation:
            'Section 2.3 Other Diagnostic Tests, narrative to Rec 1: "Other tests, for example, international normalized ratio, activated partial thromboplastin time, and platelet count, may be necessary in some circumstances if there is suspicion of coagulopathy... IV alteplase treatment should not be delayed while waiting for hematologic or coagulation testing if there is no reason to suspect an abnormal test."',
          url: "https://neurosciences.ucsd.edu/centers-programs/neurocritical-care/_files/national-guidelines/AHA%20Ischemic%20Stroke%20Guidelines%202019%20Powers%20et%20al..pdf",
          retrieved: "2026-06-12",
        },
      },
      {
        test: "Coagulation studies (PT/INR and aPTT)",
        loinc: "34714-6",
        rationale:
          "Identifies coagulopathy and quantifies anticoagulant effect (warfarin/heparin) — both affect haemorrhage risk and thrombolysis eligibility. Indicated when coagulopathy or anticoagulant use is suspected; otherwise should not delay reperfusion. Context-dependent on assay availability.",
        ugandaTier: "context",
        mustNotMiss: false,
        confidence: "high",
        source: {
          guideline:
            "AHA/ASA — Guidelines for the Early Management of Patients With Acute Ischemic Stroke (Powers et al.)",
          version: "2019 Update to the 2018 Guidelines (Stroke, December 2019)",
          recommendation:
            'Section 2.3 Other Diagnostic Tests, narrative to Rec 1: "...international normalized ratio, activated partial thromboplastin time, and platelet count, may be necessary in some circumstances if there is suspicion of coagulopathy... treatment should not be delayed while waiting for hematologic or coagulation testing if there is no reason to suspect an abnormal test."',
          url: "https://neurosciences.ucsd.edu/centers-programs/neurocritical-care/_files/national-guidelines/AHA%20Ischemic%20Stroke%20Guidelines%202019%20Powers%20et%20al..pdf",
          retrieved: "2026-06-12",
        },
      },
      {
        test: "Serum electrolytes and renal function (creatinine/BUN)",
        rationale:
          "Baseline renal function informs safe use of contrast for CT angiography (though CTA should not be delayed for creatinine in suspected LVO without prior renal disease); electrolyte derangement can cause/mimic neurological deficits. Standard part of the acute stroke metabolic panel. Context-dependent on lab access.",
        ugandaTier: "context",
        mustNotMiss: false,
        confidence: "high",
        source: {
          guideline:
            "AHA/ASA — Guidelines for the Early Management of Patients With Acute Ischemic Stroke (Powers et al.)",
          version: "2019 Update to the 2018 Guidelines (Stroke, December 2019)",
          recommendation:
            'Section 2.2.3 Mechanical Thrombectomy Eligibility—Vessel Imaging, Rec 3 (COR IIa, LOE B-NR): "In patients with suspected intracranial LVO and no history of renal impairment, who otherwise meet criteria for mechanical thrombectomy, it is reasonable to proceed with CTA if indicated before obtaining a serum creatinine concentration." (implies baseline renal function is part of standard evaluation)',
          url: "https://neurosciences.ucsd.edu/centers-programs/neurocritical-care/_files/national-guidelines/AHA%20Ischemic%20Stroke%20Guidelines%202019%20Powers%20et%20al..pdf",
          retrieved: "2026-06-12",
        },
      },
      {
        test: "CT angiography / MR angiography of head and neck (non-invasive vessel imaging)",
        rationale:
          "Identifies large-vessel occlusion to select candidates for mechanical thrombectomy and characterises vascular anatomy. Recommended during initial imaging in thrombectomy-capable settings. Strongly context-dependent in Uganda — CTA/MRA and thrombectomy are available only at a few tertiary centres; relevant only after a thrombectomy referral pathway exists.",
        ugandaTier: "context",
        mustNotMiss: false,
        confidence: "high",
        source: {
          guideline:
            "AHA/ASA — Guidelines for the Early Management of Patients With Acute Ischemic Stroke (Powers et al.)",
          version: "2019 Update to the 2018 Guidelines (Stroke, December 2019)",
          recommendation:
            'Section 2.2.3 Mechanical Thrombectomy Eligibility—Vessel Imaging, Rec 1 (COR I, LOE A): "For patients who otherwise meet criteria for mechanical thrombectomy, noninvasive vessel imaging of the intracranial arteries is recommended during the initial imaging evaluation." Section 2.2.1 Rec 5 (COR I, LOE A): "CTA with CTP or MR angiography (MRA) with diffusion-weighted MRI (DW-MRI) with or without MR perfusion is recommended for certain patients."',
          url: "https://neurosciences.ucsd.edu/centers-programs/neurocritical-care/_files/national-guidelines/AHA%20Ischemic%20Stroke%20Guidelines%202019%20Powers%20et%20al..pdf",
          retrieved: "2026-06-12",
        },
      },
      {
        test: "MRI brain with diffusion-weighted imaging (DWI)",
        loinc: "24590-2",
        rationale:
          "Effective to exclude haemorrhage and more sensitive than CT for early/small ischaemia; in wake-up / unknown-onset stroke, DWI-FLAIR mismatch helps select reperfusion candidates. Highly context-dependent — MRI is scarce in Uganda and should never delay treatment; NCCT is sufficient for most decisions.",
        ugandaTier: "context",
        mustNotMiss: false,
        confidence: "high",
        source: {
          guideline:
            "AHA/ASA — Guidelines for the Early Management of Patients With Acute Ischemic Stroke (Powers et al.)",
          version: "2019 Update to the 2018 Guidelines (Stroke, December 2019)",
          recommendation:
            'Section 2.2.1 Initial Imaging, Rec 4 (COR I, LOE B-NR): "Magnetic resonance (MR) imaging (MRI) is effective to exclude ICH before IV alteplase administration." Section 2.2.2 Rec 3 (COR IIa, LOE B-R): wake-up/unclear-onset patients — DWI-positive FLAIR-negative lesions can select for alteplase.',
          url: "https://neurosciences.ucsd.edu/centers-programs/neurocritical-care/_files/national-guidelines/AHA%20Ischemic%20Stroke%20Guidelines%202019%20Powers%20et%20al..pdf",
          retrieved: "2026-06-12",
        },
      },
      {
        test: "Malaria rapid diagnostic test (and/or thick/thin blood film) +/- HIV test",
        rationale:
          "Uganda-specific mimic safety net: in an endemic setting, cerebral malaria can present with altered consciousness, seizures and focal signs and is a time-critical, treatable must-not-miss in any acute neuro presentation with fever. HIV strongly raises stroke risk and predisposes to opportunistic CNS infection mimics. This is a Uganda-calibration addition, not a recommendation from the AHA/ASA stroke guideline — flagged for CSO confirmation against Uganda Clinical Guidelines.",
        ugandaTier: "core",
        mustNotMiss: true,
        confidence: "needs_cso_input",
        source: {
          guideline:
            "Frontiers in Neurology — Minimal Setting Stroke Unit in a Sub-Saharan African Public Hospital (sub-Saharan context; cross-referenced with sub-Saharan stroke risk-factor literature for HIV/diabetes)",
          version: "2019",
          recommendation:
            "Establishes that in sub-Saharan settings acute focal deficits require exclusion of regional mimics and that imaging to distinguish stroke subtype is often externalised; HIV and diabetes significantly raise stroke risk in the region. Specific malaria/HIV testing thresholds should be reconciled with the Uganda Clinical Guidelines by the CSO.",
          url: "https://www.frontiersin.org/journals/neurology/articles/10.3389/fneur.2019.00856/full",
          retrieved: "2026-06-12",
        },
      },
    ],
  },
];

/** Convenience wrapper over the real catalog. */
export function suggestedInvestigationsFor(pcCodes: string[]): SuggestedInvestigation[] {
  return suggestInvestigations(pcCodes, INVESTIGATION_SETS);
}
