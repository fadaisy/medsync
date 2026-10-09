"""Sources cited by the dx-relations catalogues.

status says how each was checked in this session (9 October 2026):
  read       = opened and read today (exact page or table named)
  research   = read through the MedSync hypertension research claims (6 October 2026)
  pack       = already signed in the MedSync diabetes pack (reuse its REF-DM entries)
  reference  = cited from a standard reference; not opened today; the CSO confirms or swaps for UCG 2023
"""

S = {
    "WHO-HB-2024": ("WHO. Guideline on haemoglobin cutoffs to define anaemia in individuals and populations. Geneva: WHO; 2024. Table 3 (severity in individuals).",
                    "read", "https://www.ncbi.nlm.nih.gov/books/NBK602183/table/fm-ch1.tab2/"),
    "WHO-SM-2014": ("WHO. Severe malaria. Trop Med Int Health 2014;19(Suppl 1):7-131. Table 4 (definition of severe falciparum malaria, p. 11); Section 2 (cerebral malaria, p. 12) and Section 4 (p. 27).",
                    "read", "https://www.severemalaria.org/sites/default/files/content/document/who-severe-malaria-tmih-supplement-2014_0.pdf"),
    "WHO-MAL-GL": ("WHO Guidelines for malaria (current consolidated version): parasitological confirmation before treatment; clinical features of severe malaria including prostration and multiple convulsions.",
                   "reference", "https://www.who.int/publications/i/item/guidelines-for-malaria"),
    "UDMI-2018": ("Thygesen K, et al. Fourth Universal Definition of Myocardial Infarction (2018). Circulation 2018;138:e618-e651. Sections 26-27 and Table 2.",
                  "read", "https://www.ahajournals.org/doi/10.1161/CIR.0000000000000617"),
    "ESC-ACS-2023": ("Byrne RA, et al. 2023 ESC Guidelines for the management of acute coronary syndromes. Eur Heart J 2023;44:3720-3826. Sections 2.1 and 3.2.",
                     "read", "https://academic.oup.com/eurheartj/article/44/38/3720/7243210"),
    "ESC-HF-2026": ("2026 ESC Guidelines for the management of heart failure. Eur Heart J, published 28 August 2026 (doi:10.1093/eurheartj/ehag100). Section 3.3.1: HFmrEF removed; HFrEF LVEF <50%, HFpEF LVEF ≥50%.",
                    "read", "https://academic.oup.com/eurheartj/advance-article/doi/10.1093/eurheartj/ehag100/8766302"),
    "ESC-HF-2021": ("McDonagh TA, et al. 2021 ESC Guidelines for acute and chronic heart failure. Eur Heart J 2021;42:3599-3726. HFrEF LVEF ≤40%, HFmrEF 41-49%, HFpEF ≥50% (as quoted in the 2026 guideline).",
                    "read", "https://academic.oup.com/eurheartj/article/42/36/3599/6358045"),
    "KDIGO-CKD-2024": ("KDIGO 2024 Clinical Practice Guideline for the Evaluation and Management of CKD. Kidney Int 2024;105(4S). GFR categories G1-G5 and albuminuria categories A1-A3.",
                       "read", "https://www.kidney.org/how-to-classify-ckd"),
    "KDIGO-AKI-2012": ("KDIGO Clinical Practice Guideline for Acute Kidney Injury. Kidney Int Suppl 2012;2:1-138. Section 2.1 (definition and staging).",
                       "research", "https://kdigo.org/guidelines/acute-kidney-injury/"),
    "BTS-CURB65": ("British Thoracic Society. Guidelines for the management of community acquired pneumonia in adults (2009 update): CURB65. As summarised by RCEMLearning.",
                   "read", "https://www.rcemlearning.co.uk/modules/community-acquired-pneumonia-in-adults/lessons/clinical-assessment-31/topic/risk-stratification/"),
    "ATS-IDSA-HAP-2016": ("Kalil AC, et al. Management of adults with hospital-acquired and ventilator-associated pneumonia: 2016 IDSA/ATS guidelines. Clin Infect Dis 2016;63:e61. HAP: pneumonia not incubating at admission, occurring 48 hours or more after admission.",
                          "reference", "https://academic.oup.com/cid/article/63/5/e61/2237650"),
    "WHO-TB-DEF": ("WHO consolidated guidelines on tuberculosis: definitions (NCBI Bookshelf NBK579383); WHO Definitions and reporting framework for tuberculosis, 2013 revision.",
                   "read", "https://www.ncbi.nlm.nih.gov/books/NBK579383/"),
    "WHO-TB-RISK": ("WHO Global Tuberculosis Report (2024 edition): TB cases attributable to five risk factors: undernutrition, HIV infection, alcohol use disorders, smoking and diabetes.",
                    "reference", "https://www.who.int/teams/global-tuberculosis-programme/tb-reports"),
    "WHO-DM-2019": ("WHO. Classification of diabetes mellitus. Geneva: WHO; 2019. Reuse the diabetes pack's signed REF-DM entries; do not restate numbers here.",
                    "pack", "https://www.who.int/publications/i/item/classification-of-diabetes-mellitus"),
    "WHO-HIP-2013": ("WHO. Diagnostic criteria and classification of hyperglycaemia first detected in pregnancy. 2013. Reuse the diabetes pack's signed REF-DM entries.",
                     "pack", "https://www.who.int/publications/i/item/WHO-NMH-MND-13.2"),
    "AHA-TIA-2009": ("Easton JD, et al. Definition and evaluation of transient ischemic attack. Stroke 2009;40:2276-2293 (tissue-based definition).",
                     "reference", "https://www.ahajournals.org/doi/10.1161/STROKEAHA.108.192218"),
    "WHO-AHD-2017": ("WHO. Guidelines for managing advanced HIV disease and rapid initiation of antiretroviral therapy. 2017. Definition of advanced HIV disease.",
                     "reference", "https://www.who.int/publications/i/item/9789241550062"),
    "WHO-CRYPTO-2022": ("WHO. Guidelines for diagnosing, preventing and managing cryptococcal disease among adults, adolescents and children living with HIV. 2022.",
                        "reference", "https://www.who.int/publications/i/item/9789240052178"),
    "WHO-MENING-2025": ("WHO. Guidelines on meningitis diagnosis, treatment and care. 2025.",
                        "reference", "https://www.who.int/publications/i/item/9789240108042"),
    "UG-EMNCC-2022": ("Ministry of Health Uganda. Essential Maternal and Newborn Clinical Care Guidelines for Uganda, May 2022. Hypertensive disorders in pregnancy, printed p. 22 (definitions and severe features); aspirin risk factors.",
                      "research", "https://safemama.health.go.ug/"),
    "HTN-ISH-2020": ("Unger T, et al. 2020 International Society of Hypertension Global Hypertension Practice Guidelines. Hypertension 2020;75:1334-1357. Table 1 (classification) and section on hypertensive emergencies.",
                     "research", "https://www.ahajournals.org/doi/10.1161/HYPERTENSIONAHA.120.15026"),
    "HTN-EMERG": ("Hypertensive emergency definitions: ESC Council on Hypertension position document (van den Born BH, et al. Eur Heart J Cardiovasc Pharmacother 2019;5:37-46); 2023 ESH guideline section 16; Uganda Integrated Guidelines for the Management of NCDs 2019, section 4 (MedSync claims H11 and H1-39).",
                  "research", ""),
    "ADA-CRISES-2024": ("Umpierrez GE, et al. Hyperglycemic crises in adults with diabetes: a consensus report. Diabetes Care 2024;47:1257-1275. Precipitating causes.",
                        "reference", "https://diabetesjournals.org/care/article/47/8/1257/156808"),
    "INTERHEART-2004": ("Yusuf S, et al. Effect of potentially modifiable risk factors associated with myocardial infarction in 52 countries (INTERHEART). Lancet 2004;364:937-952.",
                        "reference", ""),
    "INTERSTROKE-2016": ("O'Donnell MJ, et al. Global and regional effects of potentially modifiable risk factors associated with acute stroke in 32 countries (INTERSTROKE). Lancet 2016;388:761-775.",
                         "reference", ""),
    "TEXTBOOK": ("Standard internal medicine reference (for example Davidson's Principles and Practice of Medicine, 24th ed., 2023, the relevant chapter). The CSO confirms the link or replaces this with the UCG 2023 section.",
                 "reference", ""),
}

STATUS_WORDS = {
    "read": "read today",
    "research": "read in the hypertension research, 6 October 2026",
    "pack": "already signed in the diabetes pack",
    "reference": "cited from a standard reference, not opened today",
}
