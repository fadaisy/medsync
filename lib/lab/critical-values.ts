/**
 * Laboratory critical-value (panic-value) catalog (lab-tech workspace) — CITED
 * reference data, fetched from current PRIMARY sources at build time (CAP Q-Probes
 * / ARUP / Beaumont / LabCorp / WHO), NEVER from memory. Each entry carries its
 * source {guideline, version, url} so staleness is visible. Uganda-calibrated
 * notes where relevant (endemic anaemia baseline, malaria hyperparasitaemia,
 * haemolysis false-highs).
 *
 * A result crossing a critical threshold fires an alert back to the ordering
 * clinician + flags priority release — it never sits silently. The engine is
 * decision-support: it proposes the critical flag from the entered value; the lab
 * tech + clinician act. NO threshold is invented here.
 *
 * CRITICAL_VALUES_CSO_SIGNED stays FALSE until Fadhul ratifies the thresholds —
 * 17 of 31 carry confidence "needs_cso_input" (labs diverge, e.g. Mg/Ca/phosphate
 * high limits). The alerting reads the catalog only when signed; until then the
 * workspace shows it as "pending CSO sign-off" and does not auto-fire alerts on
 * unsigned thresholds.
 */

export const CRITICAL_VALUES_CSO_SIGNED = false;

/** When this tranche was sourced (drives the re-verification cadence). */
export const CRITICAL_VALUES_BUILT = "2026-06-14";

export type CriticalConfidence = "high" | "medium" | "needs_cso_input";

export interface CriticalValueSource {
  guideline: string;
  version: string;
  url: string;
}

export interface CriticalValue {
  /** Stable slug. */
  code: string;
  analyte: string;
  /** LOINC code where confidently known (the join key to a result). */
  loinc: string;
  /** Critical LOW threshold (value <= low → panic_low); null if none. */
  low: number | null;
  /** Critical HIGH threshold (value >= high → panic_high); null if none. */
  high: number | null;
  unit: string;
  confidence: CriticalConfidence;
  /** Qualitative criticals (positive blood culture, hyperparasitaemia) — flagged
   *  by the tech, not by a numeric comparison. */
  qualitative: boolean;
  /** The raw threshold text + variability (kept honest — labs diverge). */
  note: string;
  ugandaNote: string;
  source: CriticalValueSource;
}

export const CRITICAL_VALUES: CriticalValue[] = [
  {
    code: "potassium",
    analyte: "Potassium (serum/plasma)",
    loinc: "2823-3",
    low: 2.8,
    high: 6.0,
    unit: "mmol/L",
    confidence: "high",
    qualitative: false,
    note: "< 2.8 (commonly 2.5-3.0) / > 6.0 (commonly 6.0-6.5)",
    ugandaNote:
      "Spurious hyperkalaemia from haemolysis (delayed sample transport, manual draws, ambient heat) is a major false-positive source; confirm against an undelayed/non-haemolysed sample before acting. Renal failure from severe malaria and HIV-associated nephropathy raises true hyperkalaemia prevalence.",
    source: {
      guideline:
        "ARUP Laboratories Critical Values List (cross-checked vs CAP Q-Probes survey of 163 labs, Wagar et al. Arch Pathol Lab Med 2007;131:1769 mean limits K 2.8 / 6.2)",
      version: "CORP-APPEND-0104A, Rev. 46, April 2026",
      url: "https://www.aruplab.com/files/resources/testing/ARUP_Critical_Values.pdf",
    },
  },
  {
    code: "sodium",
    analyte: "Sodium (serum/plasma)",
    loinc: "2951-2",
    low: 120.0,
    high: 160.0,
    unit: "mmol/L",
    confidence: "high",
    qualitative: false,
    note: "< 120 / > 160 (commonly 155-160)",
    ugandaNote:
      "Severe hyponatraemia is common in advanced HIV/TB, cryptococcal meningitis and severe malaria; pair the alert with a note to avoid rapid correction (ODS risk) given limited access to frequent repeat Na and hypertonic saline.",
    source: {
      guideline:
        "ARUP Critical Values List; concordant with LabCorp (120/160) and Beaumont adult (120/160); CAP Q-Probes mean 120 low / 158 high (Wagar 2007)",
      version: "ARUP Rev. 46, April 2026; LabCorp 01/19/2024; Beaumont eff. 03/04/2024",
      url: "https://www.aruplab.com/files/resources/testing/ARUP_Critical_Values.pdf",
    },
  },
  {
    code: "calcium_total",
    analyte: "Calcium, total (serum)",
    loinc: "17861-6",
    low: 1.6,
    high: 3.25,
    unit: "mmol/L",
    confidence: "needs_cso_input",
    qualitative: false,
    note: "< 1.6 (commonly 1.5-1.75) / > 3.25 (commonly 3.2-3.5)",
    ugandaNote:
      "Hypoalbuminaemia is very common (malnutrition, nephrotic syndrome, chronic infection/HIV), so total calcium under-reads true (ionised) calcium and may trigger false-low alerts. Strongly prefer albumin-corrected calcium or ionised calcium where the assay is available.",
    source: {
      guideline:
        "ARUP Critical Values List (cross-checked Beaumont, LabCorp; CAP Q-Probes mean 1.65 low / 3.22 high, Wagar 2007)",
      version: "ARUP Rev. 46, April 2026; Beaumont eff. 03/04/2024; LabCorp 01/19/2024",
      url: "https://www.aruplab.com/files/resources/testing/ARUP_Critical_Values.pdf",
    },
  },
  {
    code: "calcium_ionised",
    analyte: "Calcium, ionised (serum/whole blood)",
    loinc: "1995-0",
    low: 0.78,
    high: 1.58,
    unit: "mmol/L",
    confidence: "high",
    qualitative: false,
    note: "< 0.78 (commonly 0.75-0.80) / > 1.58 (commonly 1.55-1.62)",
    ugandaNote:
      "Given high hypoalbuminaemia prevalence, ionised calcium is the more reliable critical analyte than total calcium where the blood-gas/ISE analyser is available; flag preanalytic anaerobic-handling requirements (air exposure/heparin falsely lowers iCa).",
    source: {
      guideline: "ARUP Critical Values List (Beaumont and Rochester concordant after conversion)",
      version: "ARUP Rev. 46, April 2026; Beaumont eff. 03/04/2024; Rochester (Strong/URMC) list",
      url: "https://www.aruplab.com/files/resources/testing/ARUP_Critical_Values.pdf",
    },
  },
  {
    code: "magnesium",
    analyte: "Magnesium (serum)",
    loinc: "19123-9",
    low: 0.41,
    high: 1.85,
    unit: "mmol/L",
    confidence: "needs_cso_input",
    qualitative: false,
    note: "< 0.41 (commonly 0.4-0.5) / > 1.85 (range 1.85-3.7 across labs)",
    ugandaNote:
      "Magnesium is given in eclampsia (very prevalent obstetric emergency); a high-Mg alert is clinically important for monitoring toxicity (areflexia/respiratory depression) when serum Mg is available. Assay may be unavailable in lower-tier labs - flag clinically (reflexes/RR) where the test is not offered.",
    source: {
      guideline: "ARUP and Beaumont Critical Values Lists (note divergent high limits)",
      version: "ARUP Rev. 46, April 2026; Beaumont eff. 03/04/2024",
      url: "https://www.aruplab.com/files/resources/testing/ARUP_Critical_Values.pdf",
    },
  },
  {
    code: "phosphate_phosphorus",
    analyte: "Phosphate / Phosphorus (serum)",
    loinc: "2777-1",
    low: 0.32,
    high: 2.9,
    unit: "mmol/L",
    confidence: "needs_cso_input",
    qualitative: false,
    note: "< 0.32 (commonly 0.3-0.4) / > 2.9 (commonly 2.9-3.2)",
    ugandaNote:
      "Refeeding hypophosphataemia is a real risk in severe malnutrition/HIV wasting; the low-phosphate alert is clinically valuable. Phosphate assay is not universally available in district labs - flag where unavailable.",
    source: {
      guideline: "ARUP and Beaumont Critical Values Lists (Rochester concordant)",
      version: "ARUP Rev. 46, April 2026; Beaumont eff. 03/04/2024",
      url: "https://www.aruplab.com/files/resources/testing/ARUP_Critical_Values.pdf",
    },
  },
  {
    code: "glucose_low",
    analyte: "Glucose (serum/plasma) - LOW",
    loinc: "2345-7",
    low: 2.8,
    high: null,
    unit: "mmol/L",
    confidence: "needs_cso_input",
    qualitative: false,
    note: "< 2.8 (commonly 2.2-3.0)",
    ugandaNote:
      "Hypoglycaemia is a WHO severe-malaria criterion (blood glucose < 2.2 mmol/L / < 40 mg/dL) and is also driven by quinine therapy, sepsis and malnutrition - very high prevalence. Consider aligning the adult low-alert with the WHO severe-malaria cutoff (2.2 mmol/L) vs the lab-standard 2.8; CSO decision.",
    source: {
      guideline:
        "ARUP / LabCorp / Beaumont Critical Values Lists; WHO severe malaria criteria (glucose < 2.2 mmol/L) for endemic calibration",
      version: "ARUP Rev. 46, April 2026; LabCorp 01/19/2024; Beaumont eff. 03/04/2024",
      url: "https://www.aruplab.com/files/resources/testing/ARUP_Critical_Values.pdf",
    },
  },
  {
    code: "glucose_high",
    analyte: "Glucose (serum/plasma) - HIGH",
    loinc: "2345-7",
    low: null,
    high: 25.0,
    unit: "mmol/L",
    confidence: "needs_cso_input",
    qualitative: false,
    note: "> 25 (commonly 25-28)",
    ugandaNote:
      "Rising type-2 diabetes burden; HHS often presents late. The high-glucose alert should travel with a prompt to check ketones/venous bicarbonate where point-of-care ketones are limited.",
    source: {
      guideline: "ARUP / LabCorp / Beaumont Critical Values Lists (high limit varies 25-28 mmol/L)",
      version: "ARUP Rev. 46, April 2026; LabCorp 01/19/2024; Beaumont eff. 03/04/2024",
      url: "https://www.aruplab.com/files/resources/testing/ARUP_Critical_Values.pdf",
    },
  },
  {
    code: "bicarbonate_total_co2",
    analyte: "Bicarbonate / Total CO2 (serum)",
    loinc: "1963-8",
    low: 10.0,
    high: 40.0,
    unit: "mmol/L",
    confidence: "high",
    qualitative: false,
    note: "< 10 (commonly 10-11) / > 40 (commonly 40)",
    ugandaNote:
      "Low bicarbonate is a strong, accessible surrogate for the metabolic acidosis of severe malaria and sepsis where blood-gas/lactate is unavailable - a high-value alert in resource-limited settings (acidosis is a leading predictor of malaria death). Pair with respiratory-distress/deep-breathing assessment.",
    source: {
      guideline: "ARUP Critical Values List (Beaumont and Rochester concordant)",
      version: "ARUP Rev. 46, April 2026; Beaumont eff. 03/04/2024",
      url: "https://www.aruplab.com/files/resources/testing/ARUP_Critical_Values.pdf",
    },
  },
  {
    code: "creatinine_severe_aki",
    analyte: "Creatinine (serum) - severe AKI",
    loinc: "2160-0",
    low: null,
    high: 619.0,
    unit: "umol/L",
    confidence: "needs_cso_input",
    qualitative: false,
    note: "> 619 (lab default; consider > 265 for severe malaria AKI / acute rise)",
    ugandaNote:
      "WHO severe-malaria renal criterion is creatinine > 265 umol/L (3.0 mg/dL) or urea > 20 mmol/L - consider this lower, endemic-calibrated alert for the IM/malaria population rather than the very high US lab default (~619 umol/L). Black-African (non-corrected) eGFR equations and limited dialysis access make early AKI flagging important.",
    source: {
      guideline:
        "Beaumont Critical Values List (lab default) + WHO Guidelines for the Treatment of Malaria / severe-malaria definition (renal impairment criterion) for endemic calibration; KDIGO AKI definition for delta-check rationale",
      version: "Beaumont eff. 03/04/2024; WHO severe malaria criteria (creatinine > 265 umol/L)",
      url: "https://www.beaumontlaboratory.com/docs/default-source/hcp-resources/critical-values/bl.op.rg.006.r04-bl-critical-values.pdf",
    },
  },
  {
    code: "urea_bun_severe_aki",
    analyte: "Urea / BUN (serum) - severe AKI",
    loinc: "3091-6",
    low: null,
    high: 35.7,
    unit: "mmol/L",
    confidence: "needs_cso_input",
    qualitative: false,
    note: "> 35.7 (lab default ~BUN 100 mg/dL); consider > 20 for severe malaria",
    ugandaNote:
      "WHO severe-malaria criterion uses blood urea > 20 mmol/L as a renal-impairment marker - an endemic-calibrated alert that is lower than the US lab default (BUN 100 mg/dL = urea ~35.7 mmol/L). Note BUN (mg/dL) vs urea (mmol/L) unit confusion is a real safety hazard; standardise on urea mmol/L (urea mmol/L = BUN mg/dL x 0.357).",
    source: {
      guideline:
        "Beaumont Critical Values List (BUN default) + WHO severe-malaria definition (urea > 20 mmol/L) for endemic calibration",
      version: "Beaumont eff. 03/04/2024; WHO severe malaria criteria",
      url: "https://www.beaumontlaboratory.com/docs/default-source/hcp-resources/critical-values/bl.op.rg.006.r04-bl-critical-values.pdf",
    },
  },
  {
    code: "lactate_lactic_acid",
    analyte: "Lactate / Lactic acid (blood)",
    loinc: "2524-7",
    low: null,
    high: 4.0,
    unit: "mmol/L",
    confidence: "needs_cso_input",
    qualitative: false,
    note: ">= 4.0 (lab critical-call commonly 3.4-5.0)",
    ugandaNote:
      "Lactate > 5 mmol/L is a WHO severe-malaria criterion and a leading predictor of malaria death. Point-of-care lactate is often unavailable in district labs - where absent, low bicarbonate is the practical acidosis surrogate. If POC lactate exists, the >= 4 (sepsis) / > 5 (severe malaria) thresholds are high-value.",
    source: {
      guideline:
        "Surviving Sepsis Campaign / AAFP review (Espinosa & Brown, Am Fam Physician 2021) for lactate >= 4.0 mortality threshold; ARUP/Beaumont/Rochester for lab critical-call values; WHO severe malaria criteria (> 5 mmol/L)",
      version: "AAFP 2021; ARUP Rev. 46, April 2026; Beaumont eff. 03/04/2024",
      url: "https://www.aafp.org/pubs/afp/issues/2021/0301/p309.html",
    },
  },
  {
    code: "haemoglobin_whole_blood",
    analyte: "Haemoglobin (low) — whole blood",
    loinc: "718-7",
    low: 7.0,
    high: null,
    unit: "g/dL",
    confidence: "needs_cso_input",
    qualitative: false,
    note: "< 7.0",
    ugandaNote:
      "Endemic malaria, hookworm, sickle cell and nutritional deficiency mean chronic anaemia is highly prevalent, so a fixed <7.0 g/dL fires very frequently and could cause alert fatigue. WHO severe malaria criteria define severe malarial anaemia in ADULTS as Hb <7 g/dL (children <5 g/dL) with parasitaemia >10,000/µL — so <7.0 g/dL is clinically well-aligned for an IM/malaria-endemic setting. Consider that WHO transfusion thresholds in high-transmission areas are lower (Hb <4 g/dL, or <6 g/dL with complications). CSO may wish to set the LAB critical-alert at <7.0 g/dL but pair it with delta-check/acute-drop logic so chronic stable severe anaemia does not swamp the alert channel.",
    source: {
      guideline: "ARUP Laboratories Critical Values List (national reference laboratory)",
      version: "CORP-APPEND-0104A, Rev. 46, April 2026",
      url: "https://www.aruplab.com/files/resources/testing/ARUP_Critical_Values.pdf",
    },
  },
  {
    code: "platelet_count_thrombocytopenia",
    analyte: "Platelet count (low) — thrombocytopenia",
    loinc: "777-3",
    low: 20.0,
    high: null,
    unit: "x10^9/L",
    confidence: "high",
    qualitative: false,
    note: "< 20",
    ugandaNote:
      "Thrombocytopenia is extremely common with malaria and is itself a marker of malaria severity, plus dengue/arboviral and HIV-related causes — a fixed low alert will fire often in IM wards. The threshold is still clinically valid; combine with delta-check and clinical context (active bleeding) at the bedside.",
    source: {
      guideline: "ARUP Laboratories Critical Values List (national reference laboratory)",
      version: "CORP-APPEND-0104A, Rev. 46, April 2026",
      url: "https://www.aruplab.com/files/resources/testing/ARUP_Critical_Values.pdf",
    },
  },
  {
    code: "platelet_count_thrombocytosis",
    analyte: "Platelet count (high) — thrombocytosis",
    loinc: "777-3",
    low: null,
    high: 1000.0,
    unit: "x10^9/L",
    confidence: "high",
    qualitative: false,
    note: "> 1000",
    ugandaNote:
      "Reactive thrombocytosis from chronic infection/inflammation and iron deficiency is common; the >1000 x10^9/L alert remains appropriate as a flag but most cases will be reactive rather than myeloproliferative.",
    source: {
      guideline: "ARUP Laboratories Critical Values List (national reference laboratory)",
      version: "CORP-APPEND-0104A, Rev. 46, April 2026",
      url: "https://www.aruplab.com/files/resources/testing/ARUP_Critical_Values.pdf",
    },
  },
  {
    code: "white_cell_count_leukopenia_severe_neutropenia",
    analyte: "White cell count (low) — leukopenia / severe neutropenia",
    loinc: "6690-2",
    low: 2.0,
    high: null,
    unit: "x10^9/L",
    confidence: "needs_cso_input",
    qualitative: false,
    note: "< 2.0",
    ugandaNote:
      "Benign ethnic neutropenia is common in populations of African ancestry — baseline neutrophil counts run lower than European-derived reference ranges, so a WBC/ANC alert calibrated to Western ranges will over-fire. HIV, antiretroviral/anti-TB therapy and chemotherapy are major causes. CSO should consider an ANC-based alert (e.g. <0.5 x10^9/L = severe neutropenia / febrile-neutropenia risk) rather than total WBC alone, and account for benign ethnic neutropenia in the lower-end interpretation.",
    source: {
      guideline:
        "ARUP Laboratories Critical Values List (total WBC); corroborated by StatPearls/Merck neutropenia classification (ANC)",
      version: "ARUP CORP-APPEND-0104A Rev. 46, April 2026; StatPearls Neutropenia 2024",
      url: "https://www.aruplab.com/files/resources/testing/ARUP_Critical_Values.pdf",
    },
  },
  {
    code: "white_cell_count_leukocytosis_hyperleukocytosis",
    analyte: "White cell count (high) — leukocytosis / hyperleukocytosis",
    loinc: "6690-2",
    low: null,
    high: 40.0,
    unit: "x10^9/L",
    confidence: "medium",
    qualitative: false,
    note: "> 40",
    ugandaNote:
      "Marked reactive leukocytosis is common with bacterial sepsis and pertussis; the >40 x10^9/L flag should prompt smear review to distinguish leukaemoid reaction from leukaemia, given limited flow-cytometry access in many Ugandan labs.",
    source: {
      guideline: "ARUP Laboratories Critical Values List (national reference laboratory)",
      version: "CORP-APPEND-0104A, Rev. 46, April 2026",
      url: "https://www.aruplab.com/files/resources/testing/ARUP_Critical_Values.pdf",
    },
  },
  {
    code: "inr_prothrombin_time",
    analyte: "INR (International Normalised Ratio) / Prothrombin time",
    loinc: "34714-6",
    low: null,
    high: 5.0,
    unit: "ratio (dimensionless)",
    confidence: "high",
    qualitative: false,
    note: "> 5.0",
    ugandaNote:
      "Warfarin remains the dominant oral anticoagulant (DOACs less available/affordable), and INR control is harder with intermittent monitoring, so over-anticoagulation alerts are clinically important. Liver disease (viral hepatitis) and severe sepsis/DIC are common non-warfarin causes of a critical INR in IM wards.",
    source: {
      guideline:
        "Lippi G, Adcock D, Simundic A-M, Tripodi A, Favaloro EJ. Critical laboratory values in hemostasis: toward consensus. Annals of Medicine",
      version: "2017; vol 49(6):455-461 (PMID 28042729)",
      url: "https://pubmed.ncbi.nlm.nih.gov/28042729/",
    },
  },
  {
    code: "aptt",
    analyte: "APTT (Activated Partial Thromboplastin Time)",
    loinc: "14979-9",
    low: null,
    high: 100.0,
    unit: "seconds",
    confidence: "needs_cso_input",
    qualitative: false,
    note: "> 100",
    ugandaNote:
      "Heparin-monitoring context: unfractionated-heparin APTT monitoring is common where anti-Xa assays are unavailable. Reagent/analyser variability is significant, so the APTT critical value MUST be validated against the local reagent's reference range rather than transplanted as an absolute number.",
    source: {
      guideline:
        "Lippi G et al. Critical laboratory values in hemostasis: toward consensus. Annals of Medicine (consensus); corroborated by ARUP Critical Values List",
      version: "Ann Med 2017;49(6):455-461 (PMID 28042729); ARUP Rev. 46 April 2026",
      url: "https://pubmed.ncbi.nlm.nih.gov/28042729/",
    },
  },
  {
    code: "fibrinogen_hypofibrinogenaemia",
    analyte: "Fibrinogen (low) — hypofibrinogenaemia",
    loinc: "3255-7",
    low: 1.0,
    high: null,
    unit: "g/L",
    confidence: "high",
    qualitative: false,
    note: "< 1.0",
    ugandaNote:
      "Obstetric haemorrhage and DIC (sepsis, severe malaria, abruption, pre-eclampsia) are leading causes of critical hypofibrinogenaemia in the Ugandan setting; fibrinogen (or a Clauss assay) may not be universally available, so where it is measured the critical alert is high-value. Note cryoprecipitate availability constraints when designing the downstream action.",
    source: {
      guideline:
        "Lippi G et al. Critical laboratory values in hemostasis: toward consensus. Annals of Medicine (consensus); corroborated by ARUP Critical Values List",
      version: "Ann Med 2017;49(6):455-461 (PMID 28042729); ARUP Rev. 46 April 2026",
      url: "https://pubmed.ncbi.nlm.nih.gov/28042729/",
    },
  },
  {
    code: "arterial_blood_ph",
    analyte: "Arterial blood pH",
    loinc: "2744-1",
    low: 7.2,
    high: 7.6,
    unit: "pH units",
    confidence: "needs_cso_input",
    qualitative: false,
    note: "< 7.2 / > 7.6",
    ugandaNote:
      "Confirm bounds against the actual blood-gas analyser in use (many Ugandan units have only point-of-care i-STAT or no ABG at all). Where no ABG is available, severe metabolic acidosis is inferred from venous bicarbonate/lactate; WHO severe-malaria acidosis is defined as base deficit > 8 mEq/L or bicarbonate < 15 mmol/L or venous lactate >= 5 mmol/L.",
    source: {
      guideline: "Vanderbilt Medical Laboratories - Clinical Laboratory Critical Values",
      version: "January 2025",
      url: "https://www.testmenu.com/vanderbiltmedicallabs/TestDirectory/SiteFile?fileName=sidebar%5CVanderbilt+Laboratory+Laboratories+Critical+Values+0125.pdf",
    },
  },
  {
    code: "blood_gas_pco2",
    analyte: "Blood gas pCO2 (PaCO2, arterial)",
    loinc: "2019-8",
    low: 20.0,
    high: 70.0,
    unit: "mmHg",
    confidence: "needs_cso_input",
    qualitative: false,
    note: "< 20 mmHg / > 70 mmHg",
    ugandaNote:
      "Applicable only where ABG analysis exists. The high cut-off matters most for COPD/asthma and post-ictal/poisoning patients on general wards without continuous monitoring; ensure the alert routes to a prescriber who can escalate ventilatory support, which may be limited.",
    source: {
      guideline:
        "University of Rochester Medical Center (URMC) - Clinical Laboratory Critical Value Immediate Notification Test List",
      version: "Approved 2008, current public posting",
      url: "https://www.urmc.rochester.edu/medialibraries/urmcmedia/urmc-labs/clinical/documents/CriticalValuesList.pdf",
    },
  },
  {
    code: "blood_gas_po2",
    analyte: "Blood gas pO2 (PaO2, arterial)",
    loinc: "2703-7",
    low: 46.0,
    high: null,
    unit: "mmHg",
    confidence: "needs_cso_input",
    qualitative: false,
    note: "< 46 mmHg",
    ugandaNote:
      "Where ABG is unavailable, pulse oximetry SpO2 is the practical surrogate (WHO severe malaria uses SpO2 < 92% on room air as a severity marker). Many Ugandan wards rely on SpO2 alone; ensure the tool can ingest oximetry as the hypoxaemia alert when no PaO2 is measured.",
    source: {
      guideline:
        "University of Rochester Medical Center (URMC) - Clinical Laboratory Critical Value Immediate Notification Test List",
      version: "Approved 2008, current public posting",
      url: "https://www.urmc.rochester.edu/medialibraries/urmcmedia/urmc-labs/clinical/documents/CriticalValuesList.pdf",
    },
  },
  {
    code: "total_bilirubin_neonatal",
    analyte: "Total bilirubin - neonatal (<= 30 days)",
    loinc: "1975-2",
    low: null,
    high: 15.0,
    unit: "mg/dL (also micromol/L)",
    confidence: "high",
    qualitative: false,
    note: "> 15 mg/dL (257 micromol/L)",
    ugandaNote:
      "G6PD deficiency is common in the region and is an AAP-defined neurotoxicity risk factor lowering the action threshold - couple the bilirubin alert with G6PD status where known. Where direct/conjugated fractionation or transcutaneous bilirubinometry is unavailable, treat any high total bilirubin in a jaundiced neonate as urgent. Capacity for exchange transfusion is limited, so early phototherapy escalation is the priority.",
    source: {
      guideline:
        "Vanderbilt Medical Laboratories - Clinical Laboratory Critical Values (numeric flag); clinical action threshold per AAP 2022 Clinical Practice Guideline on hyperbilirubinemia (>= 35 weeks)",
      version: "Vanderbilt January 2025; AAP guideline 2022",
      url: "https://www.testmenu.com/vanderbiltmedicallabs/TestDirectory/SiteFile?fileName=sidebar%5CVanderbilt+Laboratory+Laboratories+Critical+Values+0125.pdf",
    },
  },
  {
    code: "total_bilirubin_adult",
    analyte: "Total bilirubin - adult",
    loinc: "1975-2",
    low: null,
    high: null,
    unit: "mg/dL",
    confidence: "needs_cso_input",
    qualitative: true,
    note: "",
    ugandaNote:
      "WHO uses serum bilirubin > 50 micromol/L (3 mg/dL) WITH a P. falciparum parasite count > 100 000/microL as a severe-malaria criterion (malarial jaundice) - so in the malaria context an elevated bilirubin plus high parasitaemia should trigger a severe-malaria alert even though bilirubin alone is not a generic adult critical value. CSO should decide whether to add an adult bilirubin critical flag (e.g. for fulminant hepatic failure) given local practice.",
    source: {
      guideline:
        "Vanderbilt Medical Laboratories - Clinical Laboratory Critical Values (adult section lists no total bilirubin); WHO Guidelines for malaria (malarial jaundice criterion)",
      version: "Vanderbilt January 2025; WHO 13 August 2025",
      url: "https://www.testmenu.com/vanderbiltmedicallabs/TestDirectory/SiteFile?fileName=sidebar%5CVanderbilt+Laboratory+Laboratories+Critical+Values+0125.pdf",
    },
  },
  {
    code: "cardiac_troponin",
    analyte: "Cardiac troponin (high-sensitivity, positive/elevated)",
    loinc: "67151-1",
    low: null,
    high: 99.0,
    unit: "ng/L",
    confidence: "needs_cso_input",
    qualitative: false,
    note: "> 99th-percentile URL (assay-specific); operationalised as first positive hs-cTnT >= 52 ng/L",
    ugandaNote:
      "The threshold is ASSAY-SPECIFIC - the numeric cut-off must be taken from the 99th-percentile URL of the exact analyser/platform in the local lab (and is sex-specific for some assays). Many Ugandan labs use point-of-care or conventional (non-high-sensitivity) troponin, or only qualitative tests; the alert logic must read the platform's own 99th-percentile value rather than the 52 ng/L Vanderbilt hs-cTnT example. Hence needs_cso_input.",
    source: {
      guideline:
        "Vanderbilt Medical Laboratories - Clinical Laboratory Critical Values (operational threshold); Fourth Universal Definition of MI / IFCC Committee on Clinical Application of Cardiac Bio-Markers (diagnostic principle)",
      version: "Vanderbilt January 2025; UDMI 4th (2018); IFCC Clin Chem 2022",
      url: "https://www.testmenu.com/vanderbiltmedicallabs/TestDirectory/SiteFile?fileName=sidebar%5CVanderbilt+Laboratory+Laboratories+Critical+Values+0125.pdf",
    },
  },
  {
    code: "blood_culture_positive_gram_stain",
    analyte: "Blood culture positive / Gram stain (any organism in blood)",
    loinc: "600-7",
    low: null,
    high: null,
    unit: "qualitative (organisms seen)",
    confidence: "high",
    qualitative: true,
    note: "Positive Gram stain / any organism seen in blood",
    ugandaNote:
      "Blood-culture capacity (automated incubators, Gram-stain turnaround) is uneven across Ugandan hospitals; where culture is available the positive-smear alert is high value. The alert must reach a prescriber who can act on empiric therapy. In settings without culture, sepsis is treated clinically, so the tool should not gate sepsis escalation on a culture result.",
    source: {
      guideline:
        "University of Rochester Medical Center (URMC) - Critical Value Immediate Notification Test List (Microbiology)",
      version: "Approved 2008, current public posting",
      url: "https://www.urmc.rochester.edu/medialibraries/urmcmedia/urmc-labs/clinical/documents/CriticalValuesList.pdf",
    },
  },
  {
    code: "csf_glucose",
    analyte: "CSF glucose",
    loinc: "2342-4",
    low: 20.0,
    high: null,
    unit: "mg/dL (also mmol/L)",
    confidence: "high",
    qualitative: false,
    note: "< 20 mg/dL (1.1 mmol/L)",
    ugandaNote:
      "TB meningitis and cryptococcal meningitis (in HIV) are major causes of low CSF glucose in Uganda; pair the alert with CSF cell count, protein, India-ink/CrAg and Gram stain. Where CSF glucose assay is delayed, a positive CSF Gram stain or CrAg should itself drive the alert.",
    source: {
      guideline: "Vanderbilt Medical Laboratories - Clinical Laboratory Critical Values",
      version: "January 2025",
      url: "https://www.testmenu.com/vanderbiltmedicallabs/TestDirectory/SiteFile?fileName=sidebar%5CVanderbilt+Laboratory+Laboratories+Critical+Values+0125.pdf",
    },
  },
  {
    code: "csf_protein",
    analyte: "CSF protein",
    loinc: "2880-3",
    low: null,
    high: 300.0,
    unit: "mg/dL",
    confidence: "high",
    qualitative: false,
    note: "> 300 mg/dL",
    ugandaNote:
      "Very high CSF protein supports TB meningitis (often with a spider-web clot) - common in this setting and in HIV co-infection. Use with the meningitis panel rather than in isolation.",
    source: {
      guideline: "Vanderbilt Medical Laboratories - Clinical Laboratory Critical Values",
      version: "January 2025",
      url: "https://www.testmenu.com/vanderbiltmedicallabs/TestDirectory/SiteFile?fileName=sidebar%5CVanderbilt+Laboratory+Laboratories+Critical+Values+0125.pdf",
    },
  },
  {
    code: "csf_cell_count_microscopy_flags",
    analyte: "CSF cell count / microscopy flags (organisms, cryptococcal yeast, raised WBC)",
    loinc: "806-0",
    low: null,
    high: null,
    unit: "qualitative microscopy; cells/microL for count",
    confidence: "needs_cso_input",
    qualitative: true,
    note: "Presence of organisms / cryptococcal-like yeast / intracellular bacteria on CSF smear (qualitative); markedly raised CSF WBC",
    ugandaNote:
      "Cryptococcal meningitis is a leading cause of meningitis in HIV-positive Ugandan adults - the explicit 'cryptococcal-like yeast' microscopy flag (and CrAg) is high yield here. Vanderbilt explicitly lists 'presence of cryptococcal-like yeast or intracellular bacteria' as the CSF critical microscopy trigger. A specific numeric CSF-WBC critical cut-off is not standardised across the surveyed labs (commonly any frank pleocytosis is flagged), so the exact numeric trigger needs a local CSO decision.",
    source: {
      guideline:
        "Vanderbilt Medical Laboratories - Clinical Laboratory Critical Values (Hematology - CSF); URMC Microbiology list (organisms in CSF smear)",
      version: "Vanderbilt January 2025; URMC current",
      url: "https://www.testmenu.com/vanderbiltmedicallabs/TestDirectory/SiteFile?fileName=sidebar%5CVanderbilt+Laboratory+Laboratories+Critical+Values+0125.pdf",
    },
  },
  {
    code: "malaria_parasitaemia",
    analyte: "Malaria parasitaemia (P. falciparum hyperparasitaemia)",
    loinc: "32207-3",
    low: null,
    high: 10.0,
    unit: "% parasitised erythrocytes (also parasites/microL)",
    confidence: "high",
    qualitative: false,
    note: "> 10% parasitised RBC (severe); >= 4% (uncomplicated hyperparasitaemia, monitor)",
    ugandaNote:
      "Uganda is a high-transmission setting: semi-immune individuals can tolerate higher densities, so the WHO uses % parasitaemia/density cut-offs (> 10% = severe; >= 4% = uncomplicated hyperparasitaemia to monitor). Report parasite density as % AND/OR parasites/microL on every positive falciparum film. Couple with severe-malaria endemic anaemia (WHO severe malarial anaemia Hb <= 5 g/dL children / < 7 g/dL adults with parasites > 10 000/microL) and WHO severe-malaria biochemistry flags: glucose < 2.2 mmol/L (40 mg/dL), bicarbonate < 15 mmol/L / lactate >= 5 mmol/L, creatinine > 265 micromol/L, bilirubin > 50 micromol/L with parasites > 100 000/microL. P. knowlesi hyperparasitaemia threshold differs (> 100 000/microL).",
    source: {
      guideline:
        "WHO Guidelines for malaria - definition of severe falciparum malaria and uncomplicated hyperparasitaemia",
      version: "13 August 2025 (NCBI Bookshelf NBK588130)",
      url: "https://www.ncbi.nlm.nih.gov/books/NBK588130/pdf/Bookshelf_NBK588130.pdf",
    },
  },
];

const BY_LOINC = new Map(CRITICAL_VALUES.filter((c) => c.loinc).map((c) => [c.loinc, c]));
const BY_CODE = new Map(CRITICAL_VALUES.map((c) => [c.code, c]));

/** Find the critical-value entry for a result by its LOINC code (or catalog code). */
export function criticalValueFor(
  loinc: string | null | undefined,
  code?: string,
): CriticalValue | undefined {
  if (loinc && BY_LOINC.has(loinc)) return BY_LOINC.get(loinc);
  if (code && BY_CODE.has(code)) return BY_CODE.get(code);
  return undefined;
}

export type CriticalFlag = "panic_low" | "panic_high" | null;

/**
 * The PURE numeric comparison: value at/below low → panic_low; at/above high →
 * panic_high; else null. Ignores gating (tested directly). Never throws/invents.
 */
export function compareToThresholds(entry: CriticalValue, value: number): CriticalFlag {
  if (entry.qualitative || !Number.isFinite(value)) return null;
  if (entry.low != null && value <= entry.low) return "panic_low";
  if (entry.high != null && value >= entry.high) return "panic_high";
  return null;
}

/**
 * Evaluate whether a result crosses a critical threshold — decision-support; the
 * proposed flag the lab tech confirms. GATED: returns null unless the catalog is
 * CSO-signed AND the entry's threshold is ratified (never auto-fires on a
 * `needs_cso_input` or qualitative entry, nor on a non-numeric value).
 */
export function evaluateCriticalFlag(
  entry: CriticalValue | undefined,
  value: number,
): CriticalFlag {
  if (!CRITICAL_VALUES_CSO_SIGNED) return null;
  if (!entry || entry.qualitative || entry.confidence === "needs_cso_input") return null;
  return compareToThresholds(entry, value);
}
