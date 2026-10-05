# Uganda 2026 diabetes guideline compared with the diabetes pack

**Document read:** _Integrated Diabetes Management Guideline for Uganda: the summarised version for healthcare professionals._ Ministry of Health, Republic of Uganda, with the Uganda Diabetes Association. **June 2026.** Version: **summarised** (for healthcare professionals); 84 PDF pages, 18 chapters.
**Read in full:** every one of the 84 pages, from the extracted text; the pages whose figures or tables the extraction scrambled were rendered and read as images (PDF pp. 19, 26, 29, 33, 36, 38, 39, 41, 50, 71); the other figure pages read coherently as text.
**Pack compared:** `data/ncd/diabetes-pack.json`, **0.4.2-draft** as on disk at 18:00 on 2026-10-05 (working copy, uncommitted; it already carries the sources-review items applied today: RX-02 EMHSLU wording, EDU-05 storage, DM-ACU-ROUTE-35, the low C-peptide criterion), with `tools/build/k_signed.py` (GATE A, signed 2026-10-05) and `sources-review.md`.
**For:** the Clinical Safety Officer. Prepared 2026-10-05.

**How to read the citations.** "p. N" is the **PDF page** (PDF page 1 is the cover). The printed page number is two lower (PDF p. 18 is printed page 16). Quotes are verbatim, in quotation marks; "[dose omitted]" marks where a drug dose was cut out on purpose. Nothing in this document copies a dose. Where the summarised version says nothing on a point, this document says "not in the summarised version"; the comprehensive version (not read) may say more.

**Status of the document itself.** The guideline calls itself advisory: "The guidelines are advisory and are not intended as a set of rigid rules" (p. 7), and says it "serves to complement the section on diabetes management in the 2023 Uganda Clinical Guidelines" (p. 8). It also departs from UCG 2023 on purpose: "While the 2023 Uganda Clinical Guidelines recommend an algorithmic approach to managing type 2 diabetes, recent evidence supports an individualised or person-centered approach" (p. 31). Its pharmaceutical funders are named on p. 6 (Ajanta, Cipla, Denk, Microlabs, Sanofi, Zydus). The pack's own placeholder for it, `diagnosisPending.ug_integrated_dm_2026` (empty, "was not opened"), and D-DM-01 ("UCG 2023 ... or the 2026 Integrated Diabetes Management Guidelines if they are in force") anticipated this document.

---

## Summary

| #   | Area                                  | Guideline 2026 (short)                                                                                                                                                                                                  | Pack now                                                                                                                                                 | Verdict                                                 | Pages             |
| --- | ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- | ----------------- |
| 1a  | Diagnostic thresholds                 | FBG ≥7.0, 2h ≥11.1, HbA1c ≥6.5, RBG ≥11.1 (all "≥")                                                                                                                                                                     | Default `ug_ucg_2023`: same numbers with ">" (P0-25); WHO set alongside with "≥"                                                                         | DIFFERENT (operator)                                    | 18                |
| 1b  | Single test with symptoms             | RBG ≥11.1 **or FBG ≥7.0** with any of 8 symptoms (5 P's, 3 W's) or a hyperglycaemic crisis                                                                                                                              | UCG set: only RBG, 4 symptoms; FBG always needs a repeat. WHO set: any test, 3 symptoms                                                                  | DIFFERENT                                               | 18                |
| 1c  | Without symptoms                      | Two abnormal tests "at the same time or at two different time points"; RBG may be one of them                                                                                                                           | Second result "on a later day" (WHO) / "a repeat" (UCG); RBG never counts without symptoms                                                               | DIFFERENT                                               | 19                |
| 1d  | Meter vs laboratory                   | Venous plasma on an analyser recommended in hospitals; never point-of-care HbA1c for diagnosis                                                                                                                          | Meter may diagnose with symptoms or a repeat (D-DM-04); no HbA1c method input                                                                            | DIFFERENT                                               | 19                |
| 1e  | Intermediate hyperglycaemia           | "Prediabetes": FBG 5.6–6.9, 2h 7.8–11.0, HbA1c 5.7–6.4, **RBG 7.8–11.0**                                                                                                                                                | WHO (IFG 6.1) and ADA sets both pending; INCID-04 uses 6.1                                                                                               | DIFFERENT                                               | 18                |
| 2   | Screening without symptoms            | Targeted, high-risk at least yearly, normal results at least every 3 years; risk factors not listed. HIV: every 6 months. TB: RBG, then FBG/HbA1c if RBG ≥6.1                                                           | RISK-01/02/04/05 (WHO 40+ and overweight; ADA risk factors at lab sites); HIV yearly on ART; TB: fasting glucose                                         | SAME (general); DIFFERENT (HIV, TB)                     | 19, 79, 80        |
| 3a  | Who to test in pregnancy              | **Universal**, at first ANC; OGTT 24–28 weeks if early tests normal                                                                                                                                                     | Risk-factor screening (DM-SUS-PREG-UCG); universal OGTT off (D-DM-12)                                                                                    | DIFFERENT                                               | 70, 71            |
| 3b  | GDM criteria                          | FBG ≥5.1, 1h ≥10.0, 2h ≥8.5; early FBG ≥5.1, RBG ≥11.1 or **HbA1c ≥6.5%** → manage as HIP                                                                                                                               | Default `who_2013_gdm` same thresholds; UCG set (>5.6, >7.8) alongside; HbA1c blocked in pregnancy                                                       | SAME (OGTT); DIFFERENT (UCG set, HbA1c)                 | 71                |
| 3c  | Treatment, targets, postpartum        | Insulin first line, metformin second; targets FBG <5.3, 1h <7.8 or 2h <6.7; aspirin from 12–16 weeks (pre-gestational); postpartum OGTT/FBG 6–12 weeks, then every 1–3 years                                            | Red flag for other agents (insulin and/or metformin); **no pregnancy targets**; re-test 6–12 weeks; every 3 years                                        | PACK SILENT (targets, aspirin, order)                   | 73, 74, 76, 77    |
| 4   | Classification                        | Lists subtypes incl. ketosis-prone, LADA, MODY, type 5 (no criteria); T1D in the young: hyperglycaemia **plus ≥2 islet antibodies**; C-peptide cut-offs as an insulin indication                                        | Type 1 on one positive antibody or low C-peptide (with conditions); KPD, LADA, MODY rules                                                                | DIFFERENT                                               | 17, 34, 60        |
| 5   | Glycaemic targets, hypoglycaemia      | <7%; <6.5% newly diagnosed young; **<8% elderly (≥60)** with risk; FBG <7.0, PPG <10.0; HbA1c 3-monthly if poorly controlled; hypo levels <3.9 / <3.0 / severe                                                          | <7%; <8% relaxed on frailty etc.; <7.5% at ≥65 (ADA); FBG <7.0, PPG <10.0; HbA1c 6-monthly (3 after a change); same hypo levels                          | SAME (FBG, PPG, hypo); DIFFERENT (older, frequency)     | 29, 43, 62        |
| 6   | Type 2 ladder, levels of care         | Person-centred (Table 8); **combination therapy at diagnosis if HbA1c ≥7.5%**; SGLT2i/GLP-1 RA first line with metformin in high CV risk, ASCVD, renal, HF; drugs at HC IV and above; insulin indications list          | UCG ladder: lifestyle 3 months, metformin, glimepiride (EMHSLU levels), insulin; SGLT2i/GLP-1 RA referral sites only                                     | DIFFERENT                                               | 31–35             |
| 7   | BP, statin, aspirin, ACEi/ARB         | BP <130/80; class algorithm; statin by age band and risk; ezetimibe; LDL <1.8 / <2.6; aspirin secondary only; ACEi/ARB in hypertension **and/or** albuminuria                                                           | BP <130/80; statin at ≥40; aspirin secondary only; ACEi/ARB when albuminuria **and** raised BP                                                           | SAME (BP target, aspirin); DIFFERENT (statin, ACEi/ARB) | 38–42, 49, 50, 67 |
| 8   | Complication screening                | Eyes 2-yearly if none, yearly mild–moderate, 3–6-monthly severe, <3-monthly PDR; kidney yearly; feet yearly + every visit; PAD >50 yearly; lipids yearly                                                                | Eyes 24 / 12 (24 if controlled) / 6 / 3 / 1 months; kidney, feet, sensation, lipids yearly                                                               | SAME except mild NPDR                                   | 22, 28, 40, 48–55 |
| 9   | Acute: DKA, HHS, hypo, sick days      | DKA glucose >11.0, ketones >3.0 or >2+, HCO3 <15 and/or pH <7.3; **HHS glucose ≥30**; HC III starts fluids then refers; children with unexplained vomiting without diarrhoea: fingerstick glucose                       | Routes on ketones 2+ / ≥3.0; HHS suspected at **≥33.3**; route only, no fluid content; no glucose prompt for an undiagnosed vomiting child               | DIFFERENT                                               | 44–46, 64         |
| 10  | Referral                              | Emergencies HC IV+; insulin mainly HC IV+; DR treatment by ophthalmologist; HT specialist after 3 drugs + MRA                                                                                                           | Same-day and routine REFER-\* (eGFR, ACR, BP on 2 drugs, eyes by ICO grade, feet)                                                                        | MOSTLY GUIDELINE SILENT; DIFFERENT (BP)                 | 32, 39, 44, 51    |
| 11  | Education, insulin storage, follow-up | 7 self-care behaviours; plate model with local foods; no supplements; insulin <30 °C, plastic container with dry cotton wool, never in water/floor/sand; needle lengths; 3-monthly visits                               | EDU-01 generic ("no food list"); EDU-05 EADSG storage (no clay pots); 3-monthly review                                                                   | SAME (storage); PACK SILENT (diet detail)               | 25, 26, 35–37, 22 |
| 12  | Children and adolescents              | T1D: MDI/basal-bolus; targets RBG 4–10, FBG 4–7, HbA1c <7% 3-monthly; complications screening from 11 or puberty after 2–5 years; BP percentiles; lipids; autoimmune screening                                          | Recognition and same-day/immediate routing; adult screening steps; T1 screening starts at 5 years' duration (unused refs)                                | PACK SILENT / DIFFERENT                                 | 59–68             |
| 13  | HIV, TB, steroids                     | Screen PLHIV before and on ART every 6 months; **avoid dolutegravir in diabetes**; TB two-step screen; TB screen at diabetes diagnosis; insulin/metformin/SU by severity and BMI in TB; rifampicin lowers metformin too | HIV yearly; never proposes ART change (D-DM-33); TB fasting glucose; TB assessed only on cough; rifampicin flag names SUs only and keeps metformin first | DIFFERENT                                               | 78–81             |
| 14  | Other                                 | Universal admission screening and inpatient targets; peri-operative rules; initial-visit tests (HIV serology, TSH, psychosocial, B12); prevention (7% weight loss, metformin)                                           | Inpatient rule only after glucose >7.8; SGLT2 surgery flag; none of the initial-visit tests                                                              | PACK SILENT                                             | 24, 27–28, 56–58  |

**Differences needing a CSO decision: 46 (UG-01 to UG-46), listed at the end.**

---

## 1. Diagnosis of diabetes and intermediate hyperglycaemia

### What the guideline says

- Symptoms: "These classic symptoms include: 1. The 5P's - polyuria, polydipsia, polyphagia, paraesthesia, pruritis, and 2. The 3W's - weight loss, wasting, and weakness." (p. 18)
- OGTT: "The OGTT should be performed after overnight fasting for at least eight hours using 75 grams of anhydrous glucose dissolved in 250 ml of water and ingested within five to ten minutes." "Patients should be encouraged to have balanced meals for at least 3 days before the OGTT is performed to avoid inaccurate results." (p. 18)
- Table 2 (p. 18): normoglycaemia / prediabetes / diabetes — FBG "<5.6 mmol/l" / "5.6 - 6.9 mmol/l" / "≥ 7.0 mmol/l"; 2h BG after OGTT "<7.8 mmol/l" / "7.8 - 11.0 mmol/l" / "≥ 11.1 mmol/l"; HbA1c "≤5.6%" / "5.7-6.4%" / "≥ 6.5%"; RBG "<7.8 mmol/l" / "7.8-11.0 mmol/l" / "≥ 11.1 mmol/l".
- One test: "In the presence of classic symptoms of hyperglycaemia described above and/or a hyperglycaemic crisis such as diabetic ketoacidosis or hyperosmolar hyperglycaemic state, a single blood glucose test (RBG ≥11.1 mmol/l or 200 mg/dl or FBG ≥7.0 mmol/l or 126 mg/dl) is sufficient to diagnose diabetes." (p. 18)
- Two tests: "In cases where an individual doesn't present with the classic symptoms of hyperglycaemia discussed above, the diagnosis of diabetes should be based on two abnormal tests (RBG or FBG or 2h BG after an OGTT or HbA1c) performed at the same time or at two different time points." (pp. 18–19)
- "The OGTT is the gold standard test for diagnosing diabetes because performing only a FBG test can miss 30% of cases of diabetes." (p. 19)
- Meter vs laboratory: "In hospitals, venous plasma glucose measurement using clinical chemistry analyser machines, as opposed to capillary blood glucose measurement using glucometers, is the recommended method of blood glucose assessment because it provides more accurate results." (p. 19)
- HbA1c: "The HbA1c test must be performed in the laboratory using assays that are standardised and clinical chemistry analysers that are regularly calibrated." "Do not use point-of-care HbA1c machines to diagnose diabetes because they provide inaccurate results." "Remember that the accuracy of HbA1c results can be affected by several clinical factors such as iron and vitamin B12 deficiency, anaemia due to blood loss, pregnancy, and certain haemoglobin traits such as sickle cell trait." (p. 19)
- Glucometers are listed as community-level equipment ("Glucometers (preferably calibrated ones) with an adequate supply of glucose strips", Table 3, p. 21); HC III/IV get "A biochemical analyser machine (for measurement of venous plasma glucose, glycated haemoglobin, renal and liver function tests, lipid profile)" (p. 21).
- In hospital: "An admission glycated haemoglobin (HbA1c) ≥6.5% (48 mmol/mol) suggests overt diabetes preceding hospitalisation." (p. 56)

### What the pack does

- **Default set `ug_ucg_2023`** (D-DM-01, D-DM-02, P0-25, signed): `ucg_fpg_repeat` fasting_pg **>** 7.0 + repeat (REF-DM-DX-UCG-FPG 7.0); `ucg_ogtt_repeat` ogtt_2h_pg **>** 11.1 + repeat (REF-DM-DX-UCG-OGTT2H); `ucg_hba1c_repeat` hba1c **>** 6.5 + repeat (REF-DM-DX-UCG-HBA1C); `ucg_random_symptoms` random_pg **>** 11.1 with polyuria, polydipsia, polyphagia or foot numbness/burning (REF-DM-DX-UCG-RBS). No fasting-with-symptoms criterion; no crisis criterion.
- **Alongside, `who_hearts_d_2020`** (default false): each test **≥** threshold (REF-DM-DX-FPG 7.0, -OGTT2H 11.1, -HBA1C 6.5, -RANDOM 11.1) with polyuria, polydipsia or unexplained weight loss, or with `repeat_abnormal_result` ("a second diabetes-range result on a later day"); meter criteria (fasting capillary ≥7.0; capillary ≥11.1 random; ≥12.2 any time, REF-DM-DX-OGTT2H-CAP; meter HI). Referrals that wait for "diabetes met" run when either set is met.
- DM-SUS-INCID-01: "Glucose 11.1 mmol/L or more on a random sample or a meter: diagnostic with symptoms; without them, repeat on another day and do not leave it". DM-SUS-INCID-02: "One result in the diabetes range: confirm it. Repeat on another day ...". DM-SUS-INCID-03 (fasting meter ≥7.0), DM-SUS-INCID-04 (fasting capillary 6.1–<7.0: repeat; OGTT where possible, WHO 2006).
- Intermediate: `who_2006_intermediate` (IFG 6.1–6.9, REF-DM-IH-IFG-WHO; IGT 7.8–11.0) and `ada_2026_prediabetes` (FPG 5.6–6.9, REF-DM-IH-IFG-ADA; 2h 7.8–11.0; HbA1c 5.7–6.4, REF-DM-IH-HBA1C-ADA) — both **pending**, no verdict.
- OGTT preparation: REF-DM-DX-FAST-MIN-H 8 h, REF-DM-VAL-OGTT-PREP.
- HbA1c caveats (all blocking): `hba1c_b12_or_iron_deficiency`, `hba1c_variant_trait`, `hba1c_sickle_cell_disease`, `hba1c_pregnancy`, `hba1c_red_cell_turnover`, `hba1c_g6pd`, `hba1c_hiv_on_art`, `hba1c_low_egfr`, `hba1c_dapsone_or_spleen`, `hba1c_haematinic_or_epo`.
- No feature records whether an HbA1c came from a laboratory or a point-of-care device.

### Comparison

| Point                                  | Verdict                                                                                                                                         |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Threshold numbers                      | SAME (7.0, 11.1, 6.5, 11.1)                                                                                                                     |
| Operators                              | DIFFERENT: guideline "≥" throughout; pack default ">" (UG-01)                                                                                   |
| Which symptoms                         | DIFFERENT: guideline 8 (polyuria, polydipsia, polyphagia, paraesthesia, pruritus, weight loss, wasting, weakness); UCG set 4; WHO set 3 (UG-02) |
| Single FBG with symptoms               | DIFFERENT: guideline yes; UCG set no (WHO set yes) (UG-02)                                                                                      |
| Hyperglycaemic crisis as "symptomatic" | PACK SILENT in the criteria (the acute lane routes the crisis) (UG-02)                                                                          |
| Two tests on the same day              | DIFFERENT: guideline allows "at the same time"; pack wants "a later day" (WHO) (UG-03)                                                          |
| RBG without symptoms as one of two     | DIFFERENT: guideline counts it; pack never does (UG-03)                                                                                         |
| Meter vs lab                           | DIFFERENT for hospitals (UG-04); GUIDELINE SILENT on meters at community/HC level beyond listing them as equipment                              |
| Point-of-care HbA1c                    | PACK SILENT (no method input) (UG-04)                                                                                                           |
| HbA1c interferences                    | SAME (pack's list is longer)                                                                                                                    |
| OGTT preparation                       | SAME                                                                                                                                            |
| Prediabetes                            | DIFFERENT: guideline uses ADA's bands plus a random band; pack's sets pending and its live prompt uses WHO's 6.1 (UG-05)                        |
| Admission HbA1c ≥6.5% = prior diabetes | SAME in spirit (DM-SUS-INPT-01 checks HbA1c)                                                                                                    |

Note: the guideline's normal HbA1c is "≤5.6%" and prediabetes "5.7-6.4%" (no gap); its RBG "prediabetes" band (7.8–11.0) has no equivalent in WHO or ADA.

---

## 2. Who to screen without symptoms; HIV, TB, pregnancy

### Guideline

- Figure 1 (p. 19, read as image): "WHY SCREEN? Laboratory testing is safe and cheap. Screening offers an opportunity to identify and manage co-existing cardiovascular risk factors such as hypertension and dyslipidaemia." "HOW TO SCREEN? Use a targeted strategy (identify and test high-risk individuals) Performing either a RBG, FBG, OGTT, or HbA1c test." "WHEN TO SCREEN? Monitor high-risk individuals at least annually. For individuals with normal blood glucose results, repeat screening at least every 3 years. Screen individuals with symptoms suggestive of diabetes"
- The risk factors that make someone "high-risk" are **not listed in the summarised version**. The only ages/BMI given are for preventive metformin: "especially in individuals aged 25-44 years, with a BMI ≥35 kg/m2, and women with a prior history of gestational diabetes mellitus" (p. 24).
- HIV: "Screen all individuals living with HIV for type 2 diabetes and related cardiovascular risk factors such as hypertension and dyslipidaemia before the initiation of antiretroviral therapy (ART) and while on ART." "Screen all individuals living with HIV for type 2 diabetes every six months" (p. 79).
- TB: "Screen for diabetes in individuals with tuberculosis (TB) by measuring random blood glucose (RBG) levels initially followed by the measurement of either the fasting blood glucose (preferably) or glycated haemoglobin levels if the RBG level is ≥6.1 mmol/l" and "Screen for diabetes at diagnosis of TB or first clinical encounter" (p. 80).
- Pregnancy: universal (section 3).
- In hospital: "Routinely screen all admitted medical and surgical patients for hyperglycaemia by measuring random blood glucose (RBG) and glycated haemoglobin (HbA1c) levels." (p. 56)
- Drugs: Table 5 asks at the initial visit for "History of long-term use of drugs associated with an increased risk of diabetes , such as corticosteroids, anti-psychotics, and older-generation beta blockers" (p. 27).

### Pack

- DM-SUS-RISK-01 (WHO): 40 or over and BMI ≥25 (REF-DM-SUS-AGE-WHO 40, REF-DM-SUS-BMI 25), 36 months (REF-DM-SUS-RESCREEN). DM-SUS-RISK-02 (ADA): BMI ≥25 with a risk factor (lab sites, D-DM-05). DM-SUS-RISK-03 (ADA from 35): off (D-DM-05). DM-SUS-RISK-04: prior intermediate hyperglycaemia, yearly (REF-DM-IH-RETEST 12). DM-SUS-RISK-05: prior GDM, at least every 3 years (REF-DM-SUS-GDM-RETEST-MAX 36).
- DM-SUS-POP-HIV-01: "Living with HIV on ART: fasting glucose every year" (notes: before ART, at a switch and 3–6 months after are Design B rules, not live; "Uganda's own rule is REF-DM-SUS-HIV-UG, not yet read").
- DM-SUS-POP-TB-01: "TB: offer a diabetes test to everyone who does not know their status" (proposal: fasting glucose); caveats `glucose_tb_at_diagnosis` (re-check after a month, REF-DM-SUS-TB-RECHECK).
- DM-SUS-INPT-01: glucose >7.8 in emergency/inpatient → HbA1c and follow-up. DM-SUS-POP-STEROID-01, -ANTIPSYCH-01/02, -PANC-01, -DTG-01.

### Comparison

- General screening: SAME in substance (the guideline gives no risk-factor list; the pack's yearly re-test of high-risk people [RISK-04] and 3-yearly re-test after a normal result match Figure 1).
- HIV: DIFFERENT — every 6 months and before ART (guideline) vs yearly on ART (pack) (UG-36).
- TB: DIFFERENT method — RBG first, then FBG/HbA1c if RBG ≥6.1 (guideline) vs a fasting glucose (pack) (UG-38).
- Hospital admission: DIFFERENT — universal (guideline) vs only after a raised value (pack) (UG-34).
- Steroids, antipsychotics, pancreatitis: GUIDELINE SILENT on how to test; pack keeps ADA/JBDS rules.

---

## 3. Gestational diabetes and diabetes in pregnancy

### Guideline

- Definitions: "Pre-existing or pre-gestational diabetes (diabetes known to exist before the index pregnancy)." "Overt diabetes in pregnancy (DIP), which appears for the first time after the first trimester in an asymptomatic woman and may resolve following delivery in some women." "Gestational diabetes mellitus (GDM)." (p. 69)
- Who and when: "Screen HIP using the one-step approach as recommended by the International Association of Diabetes and Pregnancy Study Groups (IADPSG) and the World Health Organisation (WHO)." "It involves performing an oral glucose tolerance test (OGTT) using 75 grams of anhydrous glucose at any gestation age or 24-28 weeks of gestation." "Based on current evidence, universal screening for HIP using the one-step approach is superior to the selective risk-based approach, which can miss over 30% of women with HIP." (p. 70)
- Figure 12 (p. 71, read as image): "Screen all pregnant women using OGTT, FBS, RBG, and/or HbA1c at first ANC contact or visit". Under 24 weeks and unable to do an OGTT: "Perform FBG, RBG, and/or HbA1c measurement"; "Abnormal -FBG ≥5.1 mmol/l (92 mg/dl) -RBG ≥11.1 mmol/l (200 mg/dl) -HbA1c ≥6.5% (48 mmol/mol)" → "Manage as HIP"; "Normal" → "Perform an OGTT at 24-28 weeks". Able to do an OGTT: "Abnormal -FBG ≥5.1 mmol/l (92 mg/dl) -1-hour post-load blood glucose ≥10.0 mmol/l (180 mg/dl) -2-hour post-load blood glucose ≥8.5 mmol/l (153 mg/dl)" → "Manage as HIP"; normal → "Continue with routine ANC". Bottom box: "Manage as HIP if: FBG ≥5.1 mmol/l (92 mg/dl), 1-hour post-load blood glucose ≥10.0 mmol/l (180 mg/dl), and 2-hour post-load blood glucose ≥8.5 mmol/l (153 mg/dl)". Over 24 weeks: "Follow the algorithm and diagnostic approach for HIP as shown in the section of the <24 weeks gestation ANC visit" (both branch boxes under ">24 weeks" read "Unable to perform an OGTT", a typographical error).
- The figure gives **no separate thresholds for diabetes in pregnancy** (no FBG ≥7.0 / 2h ≥11.1 split); RBG ≥11.1 and HbA1c ≥6.5% lead to "Manage as HIP".
- Treatment, GDM: "Lifestyle behavioural modification is the first-line approach for managing GDM." "Pharmacological management is recommended in women who are unable to attain optimal glycaemic control outcomes with lifestyle behavioural modification measures." (p. 72) "Insulin is recommended as the first-line agent for managing GDM" (the guideline gives a dose). "Metformin can be used as the second-line mode of management of GDM in women who refuse insulin or cannot access insulin". "Avoid using sulfonylureas because they cross the placenta and are associated with an increased risk of neonatal hypoglycaemia, macrosomia, and adiposity" (p. 73).
- Treatment, pre-gestational: "Insulin is recommended as the first-line agent using a basal-bolus insulin regimen, preferably" (the guideline gives doses by trimester). "Metformin can be used as the second-line therapy or an add-on therapy if optimal glycaemic targets are not achieved." "Start aspirin [dose omitted] once daily from 12–16 weeks of gestation to reduce the risk of preeclampsia." "Avoid using sulfonylureas, dipeptidyl peptidase 4 inhibitors, sodium-glucose cotransporter 2 inhibitors, thiazolidinediones, and injectable glucagon-like peptide 1 agonists in pregnancy due to a lack of evidence about their safety when used in pregnancy." (p. 76)
- Targets: "Women with GDM should be optimally managed to achieve these glycaemic targets: 1. FBG <5.3 mmol/l (95 mg/dl) and either 2. One-hour postprandial blood glucose level <7.8 mmol/l (140 mg/dl) or two-hour postprandial blood glucose level <6.7 mmol/l (120 mg/dl)." (p. 74) Preconception: "Counsel all women with HIP to plan future pregnancies when glycaemic control is optimal (HbA1c <6.5% or 48 mmol/mol)." (p. 77)
- Pre-gestational care: "Counsel women with type 1 and type 2 diabetes about the risk of diabetic ketoacidosis and new-onset diabetic retinopathy in pregnancy." "Screen all women with type 1 and type 2 diabetes for diabetic retinopathy before conception and in the first trimester, and repeat the screening 3-12 months later, depending on its severity." (p. 75) Euglycaemic DKA "occurs in ... pregnancy" (p. 45).
- Postpartum: "repeat an OGTT between 6-12 weeks postpartum and perform lifetime screening for diabetes every 1-3 years using either FBG, HbA1c, or OGTT in all women with a history of GDM." (p. 74) But: "For women with a prior diagnosis of GDM, measure the FBG level at 6-12 weeks post-delivery to diagnose postpartum diabetes, followed by lifelong screening for type 2 diabetes by FBG, RBG, and/or HbA1c measurement every 1-3 years." (p. 77) — the two pages disagree on the 6–12-week test (OGTT vs FBG).
- Obstetric and neonatal (pp. 74, 76): fetal scans and surveillance, delivery timing by control and complications ("Avoid planning deliveries after 40 weeks of gestation"), caesarean consideration for estimated fetal weight ≥4.5 kg, "Closely monitor all babies of women with HIP for neonatal hypoglycaemia for at least 24 hours post-delivery", immediate breastfeeding, contraception counselling (p. 77).

### Pack

- `who_2013_gdm` (**default**, P0-26 signed): fasting 5.1–6.9 (REF-DM-PREG-GDM-FPG 5.1), 1h ≥10.0 (REF-DM-PREG-GDM-1H), 2h 8.5–11.0 (REF-DM-PREG-GDM-2H); any one. `who_2013_diabetes_in_pregnancy` (pending): FPG ≥7.0, 2h ≥11.1, random ≥11.1 with symptoms. `ug_ucg_2023_gdm` (shown alongside): FBS >5.6 (REF-DM-PREG-UCG-FBS), 2h >7.8 (REF-DM-PREG-UCG-2H).
- DM-SUS-PREG-01 (universal OGTT from 24 weeks): **off** (D-DM-12 signed: "Screen on UCG's risk factors at every site; a universal 24–28-week OGTT only at sites that choose it"). DM-SUS-PREG-UCG (on): pregnant with BMI >35, age >40, prior GDM, first-degree relative, previous baby >4 kg or unexplained third-trimester death, polyhydramnios, glycosuria, large for dates.
- DM-CON-PREG-01 (WHO gestational range, refer today), -02 (diabetes range), -03 (any glucose ≥11.1, meter included, refer today), -04 (fasting meter ≥5.1: lab glucose), -05 (fasting meter ≥7.0: refer today). DM-ACT-SCREEN-PREG-01 (pre-existing diabetes: retina and kidney now). DM-ACU-ROUTE-35 (pregnant with diabetes and unwell: ketones now, same day; JBDS 2023).
- Caveat `hba1c_pregnancy` (blocking): "HbA1c is not used to diagnose hyperglycaemia in pregnancy".
- Therapy flag `other_glucose_lowering_in_pregnancy` (red): "WHO 2025: in pregnancy, medicines with safety concerns are replaced by insulin and/or metformin". `ras_blocker_or_statin_in_pregnancy` (red).
- Targets: every target has `appliesTo.pregnancy = not_pregnant`. **No pregnancy target.**
- Postpartum: DM-SUS-PREG-02 (re-test 6–12 weeks, REF-DM-PREG-POSTPARTUM-FROM/TO), DM-SUS-RISK-05 (every 3 years).
- No aspirin prompt; no obstetric or neonatal content.

### Comparison

- OGTT thresholds: SAME as the pack default (WHO 2013 = IADPSG). The UCG set the pack shows alongside is not used by the 2026 guideline (UG-07). The figure's bottom box says "and" across the three values while the "Abnormal" box lists them separately; IADPSG/WHO read any one value. UG-07.
- Who: DIFFERENT (universal vs risk-based) (UG-06).
- Early HbA1c ≥6.5%: DIFFERENT (UG-08).
- Diabetes-in-pregnancy split (≥7.0 / ≥11.1): GUIDELINE SILENT in the figure; the pack's DM-CON-PREG-02/-03/-05 (refer today) are not contradicted.
- Treatment: SAME on what to avoid; the guideline orders insulin first and metformin second (UG-10).
- Targets: PACK SILENT (UG-09). Aspirin: PACK SILENT (UG-11). Postpartum window: SAME; test type inconsistent inside the guideline (UG-12). Obstetric/neonatal: PACK SILENT (UG-13).

---

## 4. Classification

### Guideline

- Table 1 (p. 17): common subtypes type 1, type 2, hyperglycaemia in pregnancy; rare subtypes "Hybrid forms of diabetes, such as ketosis-prone diabetes and slowly evolving immune-mediated diabetes of adults or latent autoimmune diabetes of adults (LADA)", "Monogenic diabetes (neonatal diabetes and maturity-onset diabetes of the youth or MODY)", exocrine pancreas ("chronic pancreatitis and fibrocalculous pancreatic diabetes"), endocrine and "drug- or chemical-induced diabetes", "Type 5 diabetes or malnutrition-related diabetes". **No criteria for any rare subtype in the summarised version.**
- Type 1 in children, adolescents and young adults: "In addition to the above clinical signs and symptoms, diagnose T1D by confirming the presence of hyperglycaemia and ≥2 islet-cell autoantibodies." Antibodies: GADA, IA-2A, ZnT8A, IAA "(before initiation of insulin)". Glucose: "Random blood glucose [RBG] level ≥11.1 mmol/l", "Fasting blood glucose [FBG] level ≥7.1 mmol/l or 126 mg/dl" (7.1 here, 7.0 on p. 18: a typographical inconsistency), "Glycated haemoglobin [HbA1c] ≥6.5 %" (p. 60).
- C-peptide, as an insulin indication in type 2: "Biochemically confirmed insulin deficiency (fasting serum C-peptide <0.76 ng/ml [0.25 nmol/l] or random serum C-peptide concentration <1.80 ng/ml [0.6 nmol/l])" (p. 34). C-peptide at the initial visit at secondary and tertiary level (Table 4, p. 22; Table 5, p. 28).
- Type 2 phenotype for drug choice: lean (BMI <25, "signs of low insulin secretion") vs insulin resistance ("overweight or obesity, acanthosis nigricans, and dyslipidaemia") (pp. 31–32).

### Pack

- `classifications.type_1`: `t1_antibody` (one positive antibody; note: about 65% of young clinically diagnosed type 1 in Cameroon, Uganda and South Africa were antibody negative, REF-DM-CLS-UG-AB-NEG 65.1%); `t1_cpeptide_low` (random C-peptide <200 pmol/L, REF-DM-CLS-CPEP-LOW, on insulin, no emergency in 2 weeks, under 35 or >3 years since diagnosis); high criterion (≥600) held out.
- `slowly_evolving_immune_mediated` (antibody positive, diagnosed after 35, WHO 2019). `ketosis_prone_type_2` (ketosis at presentation, antibody negative, off insulin without relapse).
- Rules DM-CLS-T1-01..05, DM-CLS-ATYP-01 (lean, young), DM-CLS-MODY-01, DM-CLS-PANC-01/02, DM-CLS-DRUG-01.

### Comparison

- Rare subtypes: GUIDELINE SILENT on criteria; pack keeps WHO 2019/ADA criteria. No change.
- Type 1 needs ≥2 antibodies (guideline) vs one antibody supports and none is required (pack): DIFFERENT (UG-14).
- C-peptide: different use and different cut-off (guideline: <0.6 nmol/L = <600 pmol/L random means insulin deficiency → insulin; pack: <200 pmol/L supports type 1 classification) (UG-15).

---

## 5. Glycaemic targets and hypoglycaemia

### Guideline

- Table 6 (p. 29, read as image): "Nonpregnant individuals with diabetes <7% (53 mmol/mol)"; "Newly diagnosed young individuals with a long-life expectancy (>10 years), no comorbidities, and a low risk of hypoglycaemia <6.5% (48 mmol/mol)"; "Elderly individuals (≥60 years) with long-standing diabetes, a high risk of hypoglycaemia, short-life expectancy, and comorbidities such as renal dysfunction and atherosclerotic cardiovascular diseases <8% (64 mmol/mol)".
- "The recommended optimal FBG and PPG levels are <7.0 mmol/l (126 mg/dl) and <10.0 mmol/l (180 mg/dl), respectively." "A PPG measurement should be performed at least one to two hours after the beginning of the meal." (p. 29)
- Frequency: "All individuals with poorly controlled diabetes should have an HbA1c measurement every three months." "In individuals with well-controlled diabetes, the HbA1c measurement should be performed every six months." (p. 29) Table 5: HbA1c "every 3-6 months" (p. 28).
- Lower glucose limit for older adults: **not in the summarised version** (no fasting floor by age or frailty).
- SMBG, Table 7 (p. 30): basal-bolus "3 - 4 times a day"; twice-daily premixed "2 - 3 times a day"; bedtime basal "Once a day (preferably in the morning to measure the fasting blood glucose level)"; oral agents and stable "2 - 3 times per week"; critically ill, prolonged poor control, frequent hypoglycaemia "≥4 times per day".
- Hypoglycaemia, Table 10 (p. 43): "Level 1 or mild hypoglycaemia Measured blood glucose concentration of <3.9 mmol/l (<70 mg/dl), but ≥ 3.0 mmol/l (≥54 mg/dl)"; "Level 2 or moderate hypoglycaemia Measured blood glucose concentration of <3.0 mmol/l (<54 mg/dl)"; "Level 3 or severe hypoglycaemia Severe life-threatening event characterised by altered mental and physical status requiring assistance." "Assess every individual with diabetes for the risk of hypoglycaemia at every clinical visit in routine care." (p. 43) Risk factors include "insulin (especially human insulins) and sulfonylureas (especially glibenclamide)" (p. 43).
- Type 1 young people: "blood glucose level ≤3.9 mmol/l or 70 mg/dl" in Whipple's triad (p. 63; "≤", not "<").
- Peri-operative: "Elective surgery HbA1c goal: <8% (64 mmol/mol)" (p. 58).
- PAD: "Optimally manage glycaemia (HbA1c <8%)" (p. 55).

### Pack

- Targets: `tgt_hba1c_general` <7.0 (REF-DM-CTRL-HBA1C-TARGET); `tgt_hba1c_relaxed` <8.0 on frailty/limited life expectancy, cognitive impairment, a significant low, impaired awareness; `tgt_hba1c_older_healthy` <7.5 at **65** or over (ADA; REF-DM-CTRL-OLDER-AGE 65; D-DM-13 used 7.5% "until UCG's 'elderly' is defined"); `tgt_hba1c_tight` <6.5 only when a tight tier is agreed and not on insulin; `tgt_hba1c_ckd` <6.5–<8.0; `tgt_hba1c_tb` <8.0; `tgt_fpg_surrogate` <7.0; `tgt_ppg_surrogate` <10.0 (REF-DM-CTRL-PPG-UCG, D-DM-13).
- Bands: `fpg_control_who`, `ppg_control_who`, `fcap_control_who`, `pcap_control_who` (low <3.9; at target 3.9–7.0 / 3.9–10.0).
- HbA1c timing: DM-ACT-TEST-HBA1C-01 (6 months), -02 (3 months after a treatment change).
- Hypoglycaemia: REF-DM-HYPO-L1 3.9, -L2 3.0, -L3; D-DM-24; DM-ACU-ROUTE-06 (<3.0 or LO: interrupt), -07 (<3.9 in diabetes), -26, -31; flag `hypoglycaemia_needing_help_on_treatment` ("Review hypoglycaemia at every visit"); RX-10, RX-11, RX-11B.
- D-DM-40 / sources-review §4 (ADA older-adult glucose floor 4.4 / 5.0): waiting for this comparison.

### Comparison

- FBG <7.0, PPG <10.0, general HbA1c <7%: SAME.
- Hypoglycaemia levels: SAME (the "≤3.9" on p. 63 is a single-word inconsistency inside the guideline; no change).
- Older adults: DIFFERENT — 60 vs 65, <8% vs <7.5% (UG-16).
- Young, newly diagnosed: DIFFERENT — <6.5% as the profile's target vs only when agreed (UG-16).
- HbA1c frequency: DIFFERENT for people above target without a recent change (UG-17).
- Older-adult glucose floor (sources-review §4): **GUIDELINE SILENT**. The 2026 summarised version sets no lower fasting limit for older people, so it neither supports nor blocks ADA 2026 Table 13.2; the §4 proposal can be decided on ADA alone.
- SMBG frequency: PACK SILENT (UG-44).

---

## 6. Treatment of type 2 diabetes and levels of care

### Guideline

- Approach: "While the 2023 Uganda Clinical Guidelines recommend an algorithmic approach to managing type 2 diabetes, recent evidence supports an individualised or person-centered approach." Factors: age, BMI, complications and comorbidities, duration, "External factors such as availability and cost of the drug, side effect profile, and patient preference." (p. 31)
- Table 8 (pp. 31–32, the "ABCD and 2Ps approach"; every row's health-centre level is "IV, secondary, & tertiary levels"):
  - Age: "Elderly patients (≥ 60 years)": "-Metformin -DPP-IV inhibitors such as sitagliptin, teneligliptin, and vildagliptin -SGLT2i such as dapagliflozin and empagliflozin -Gliclazide is the SU of choice".
  - BMI: "-SU and DPP-IV inhibitors in individuals with BMI <25 kg/m2 (lean type 2 diabetes)"; "-GLP-1 RA such as semaglutide, SGLT2i, and metformin for individuals with BMI ≥25 kg/m2 (non-lean type 2 diabetes)".
  - Complications: "-High risk of ASCVD* -Established ASCVD -Renal dysfunction -Heart failure (regardless of the ejection fraction) -High risk of hypoglycaemia": "-SGLT2i and GLP-1 RA as the first-line in combination with metformin or other oral glucose-lowering agents -In addition to SGLT2i and GLP-1 RA, DPP-IV inhibitors can be used if the risk of hypoglycaemia is high". Footnote: "*High risk for atherosclerotic cardiovascular diseases: presence of overweight or obesity, hypertension, dyslipidaemia, hyperuricaemia, albuminuria, 10-year risk of ASCVD >20% on using the pooled cohort risk equations score or Framingham risk score".
  - Duration ≥10 years: "-SGLT2i, GLP-1 RA, DPP-IV inhibitors, and metformin".
  - Pathophysiology / pancreatic function: insulin resistance → "Metformin, GLP-1 RA, SGLT2i, and TZDs"; pancreatic dysfunction (BMI <25, no metabolic syndrome, severe hyperglycaemia) → "SU and DPP-IV inhibitors".
- Cautions (p. 33, read as image): "Do not prescribe glibenclamide for elderly individuals (age ≥60 years) due to its high risk of hypoglycaemia"; "Avoid using pioglitazone in patients at risk of osteoporosis and heart failure such as elderly patients"; "Avoid using metformin in individuals with diabetes and an estimated glomerular filtration rate (e-GFR) <30 ml/min/1.73 m2"; "Avoid using SGLT2i and GLP-1 RA in individuals with type 2 diabetes and an e-GFR <20 mL/min/1.73 m2".
- Combination at diagnosis (p. 33): "Because type 2 diabetes develops due to multiple underlying pathophysiological defects, combination glucose-lowering therapy is recommended in its management" "Initiate combination glucose-lowering therapy as clinically indicated in: 1. Individuals with newly diagnosed type 2 diabetes with glycated haemoglobin (HbA1c) ≥ 7.5% or 58 mmol/mol OR 2. Individuals with HbA1c levels 1.5 - 2.0% above target."
- A lifestyle-only period before medicine for type 2 diabetes: **not in the summarised version** (lifestyle appears in prevention, p. 23, and education, p. 25).
- Insulin indications (p. 34, ten boxes): "Symptomatic patients with newly diagnosed type 2 diabetes and fasting blood glucose (FBG) >14 mmol/l (250 mg/dl), random blood glucose (RBG) >16.7 mmol/l (300 mg/dl), and/or HbA1c ≥10% (86 mmol/mol)."; "Presence of secondary oral hypoglycaemic agent failure (failure to attain optimal glycaemic control despite using maximum doses of >2 oral hypoglycaemic agents)"; C-peptide (section 4); "Persistently high HbA1c levels (≥2 results of HbA1c ≥10% or 86 mmol/mol over 6-12 months)"; "Clinical presentation in diabetic ketoacidosis"; "In cases of surgery (pre-, intra-, and post-operative periods)"; "Patients on high-dose steroids for management of any medical condition"; "Pre-gestational and gestational diabetes."; "Patients with acute illnesses necessitating inpatient management such as sepsis and post-myocardial infarction"; "Patients with comorbidities or complications that deem the use of oral hypoglycaemic agents as contraindicated, such as end-stage renal and hepatic dysfunction, and acute or chronic pancreatitis".
- Insulin start and titration (Figure 5, p. 35): basal insulin ± non-insulin agents, then basal-bolus or premixed intensification; target FBG "<7 mmol/l" (the guideline gives doses and titration steps).
- Level of care: "In Uganda, insulin therapy is mainly available at the level of health centre IV, secondary, and tertiary healthcare levels." (p. 34) Hyperglycaemic emergencies "should be managed at health centre IVs, secondary, and tertiary health care levels" (p. 44). Table 3 (p. 21) puts HC III and IV together as "Primary" with a biochemical analyser for venous glucose, HbA1c, renal, liver and lipids.
- Hypoglycaemia risk: "sulfonylureas (especially glibenclamide)" (p. 43).

### Pack

- DM-ACT-RX-01: "Type 2 diabetes above target and not on medicine: review treatment. UCG 2023: if sugars are not very high and the person is willing, lifestyle for 3 months first; otherwise, or if that is not enough, metformin, with diet and activity" (D-DM-20, D-DM-34; the "very high" arm dark, P0-28). RX-01B: same on a fasting meter reading.
- DM-ACT-RX-02: "... UCG 2023's second line is glimepiride; EMHSLU 2023 stocks it from general hospitals upward, so at a health centre refer for it. Never start glibenclamide (deleted from EMHSLU 2023)" (D-DM-22).
- DM-ACT-RX-03: metformin + SU above target → "WHO's next step is human insulin, or referral for it". DM-ACT-REFER-TARGET-01: "Above target on two tablets: refer for insulin where this site does not start it". DM-ACT-REFER-TARGET-02: on insulin, HbA1c >7.5% → refer.
- DM-ACT-RX-04: "Type 2 or unclassified diabetes, not on insulin, with HbA1c above 10% or glucose 16.7 mmol/L or more: ADA says consider insulin. Check ketones first" (REF-DM-CTRL-SEVERE-HBA1C 10.0, -GLU 16.7).
- DM-ACT-RX-05 / RX-05B: established CVD or heart failure / confirmed CKD → SGLT2i or GLP-1 RA, `requiresCapability: site.referral`, as "refer for consideration" (D-DM-21).
- Flags: `glibenclamide_age_60` (REF-DM-RX-GLIB-AGE 60), `glibenclamide_ckd`, `glibenclamide_hypoglycaemia_concern`, `pioglitazone_heart_failure`, `metformin_egfr_below_30` (red), `metformin_egfr_30_44` (amber, ADA "do not start below 45"), REF-DM-RX-SGLT2-EGFR 20.
- Sources-review §2 (applied): EMHSLU 2023 levels — metformin HC3; glimepiride H; gliclazide, vildagliptin, dapagliflozin, pioglitazone RR; soluble/isophane insulin HC4; glargine and aspart H; glibenclamide deleted; sitagliptin, empagliflozin, semaglutide not listed.

### Comparison against the DM-ACT-RX-\* displays (answers sources-review §6)

| Id            | 2026 guideline                                                                                                                                                                                                                      | Verdict                                       |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| RX-01, RX-01B | No lifestyle-only 3 months; combination therapy at diagnosis if HbA1c ≥7.5% (p. 33)                                                                                                                                                 | DIFFERENT (UG-18)                             |
| RX-02         | No single second line; gliclazide is "the SU of choice" in the elderly; SU or DPP-4i if lean; GLP-1 RA/SGLT2i/metformin if BMI ≥25 (pp. 31–32). Glimepiride is not named                                                            | DIFFERENT (UG-19); level of care (UG-21)      |
| RX-03         | Insulin after failure of ">2" oral agents at maximum dose (p. 34)                                                                                                                                                                   | DIFFERENT (UG-22)                             |
| RX-04         | FBG >14, RBG >16.7 and/or HbA1c ≥10% if symptomatic and newly diagnosed; or ≥2 HbA1c ≥10% over 6–12 months (p. 34)                                                                                                                  | DIFFERENT in thresholds and operators (UG-22) |
| RX-05, RX-05B | First line with metformin for high ASCVD risk (broad), ASCVD, renal dysfunction, HF; HC IV and above (p. 32)                                                                                                                        | DIFFERENT (UG-20, UG-21)                      |
| RX-06         | Statin by age band and risk; all with DKD (pp. 41, 50)                                                                                                                                                                              | DIFFERENT (UG-26)                             |
| RX-07         | <130/80; class algorithm (pp. 38–39)                                                                                                                                                                                                | SAME threshold; DIFFERENT content (UG-24)     |
| RX-08         | ACEi/ARB with hypertension and/or albuminuria (p. 49); confirmed albuminuria in T1D → ACEi/ARB (p. 67)                                                                                                                              | DIFFERENT (UG-25)                             |
| RX-09         | Secondary prevention only (p. 42)                                                                                                                                                                                                   | SAME                                          |
| RX-10         | Hypoglycaemia risk at every visit (p. 43)                                                                                                                                                                                           | SAME in direction                             |
| RX-11, RX-11B | <8% for elderly ≥60 at risk (p. 29); no glibenclamide ≥60 (p. 33)                                                                                                                                                                   | SAME in direction; age differs (UG-16)        |
| RX-12         | Lists gabapentin, pregabalin, duloxetine, carbamazepine, valproic acid, tramadol, alpha-lipoic acid (p. 51)                                                                                                                         | DIFFERENT (UG-41)                             |
| Flags         | Glibenclamide ≥60: SAME. Metformin <30: SAME. SGLT2i/GLP-1 RA <20: SAME (pack has no GLP-1 RA eGFR flag). Pioglitazone HF: SAME; osteoporosis/elderly: PACK SILENT (UG-19). Metformin 30–44: GUIDELINE SILENT (pack stricter, keep) | mostly SAME                                   |

---

## 7. Blood pressure, statin, aspirin, ACEi/ARB

### Guideline

- BP (p. 38, read as image): "Routinely measure blood pressure (BP) at each clinic visit"; "Individualise BP targets"; "Less stringent BP targets are recommended in the elderly, patients with orthostatic hypotension, and cognitive dysfunction"; "Generally, the recommended optimal BP targets are <130/80 mmHg in all individuals with type 2 diabetes and hypertension". DKD prevention: BP "<130/80 mmHg" (p. 49). PAD: "blood pressure (<140/90 mmHg)" (p. 55) — inconsistent with p. 38.
- Drugs (p. 39, flowchart): "Initial BP <150/90 mmHg and no renal dysfunction or CVD" → "Initiate one BP-lowering agent (ACEI or ARBs or CCB or Thiazide-diuretic)"; "Initial BP <150/90 mmHg and confirmed renal dysfunction or CVD" → "Initiate either an ACEI or ARB"; "Initial BP ≥150/90 mmHg" → "Initial two agents -ACEI or ARB and CCB (first-line) OR -ACEI or ARB and thiazide diuretic"; then a third class; "If optimal BP target is not attained with three BP-lowering drugs, add a MRA such as spironolactone or eplerenone [dose omitted]" "- Refer to a HT specialist for further evaluation". "Use beta-blocker therapy as an add-on BP-lowering therapy only in patients with heart failure with reduced ejection fraction, atrial fibrillation, post-myocardial infarction, stable and unstable angina, and hyperthyroidism." "Avoid using loop diuretics such as furosemide as a BP-lowering therapy." (p. 39)
- ACEi/ARB: "Do not routinely use angiotensin converting enzyme inhibitors (ACEI) or angiotensin II receptor blockers (ARBs) as a strategy for preventing DKD in individuals with diabetes without co-existing hypertension and/or albuminuria." (p. 49) "Avoid using a combination of ACEI and ARB because it increases the risk of hyperkalemia and hypotension." (p. 50) Type 1: confirmed UACR ≥3 mg/mmol → "Initiate ARB or ACEI therapy" and "Counsel women of childbearing age about the teratogenic potential of ACEI and ARB" (p. 67).
- Lipids (p. 40): "A random or non-fasting lipid profile test is preferred because it is convenient"; at diagnosis; "Lipid profile testing should be repeated 4-12 weeks after the initiation of lipid-lowering therapy and then annually". Targets: "TC: <5.0 mmol/l", "TGL: <1.7 mmol/l", HDL ">1.0 mmol/l (40 mg/dl) for males and >1.3 mmol/l (50 mg/dl) females", "In individuals with established CVD or high cardiovascular disease risk: LDLC level <1.8 mmol/l (70 mg/dl).", "In those without CVD, LDLC level <2.6 mmol/l (100 mg/dl)".
- Statin (p. 41, read as image): secondary prevention: "Initiate immediately combination therapy of high-intensity statin and ezetimibe therapy to achieve the optimal lipid treatment targets (LDLC <1.8 mmol/l or 70 mg/dl)". Primary prevention: "If aged 20-39 years" → "Consider lifestyle modification and statin therapy if there are co-existing CVD risk factors"; "If aged 40-75 years" → "-Consider lifestyle modification and moderate-intensity statin therapy in those without CVD OR -High-intensity statin therapy in those with ≥1 CVD risk factor"; "If aged >75 years" → "Consider lifestyle modification and moderate-intensity statin therapy (perform a benefit-risk assessment)"; then ezetimibe if targets are not met (the guideline gives doses, Table 9, p. 42). DKD: "Initiate all individuals with DKD on moderate- or high-intensity statin therapy ([doses omitted]) depending on the prevalent cardiovascular risk status." (p. 50) HIV: "Initiate statin therapy in individuals living with HIV and low- to moderate-risk of cardiovascular disease (CVD) to reduce the rates of CVD" (p. 79).
- Aspirin (p. 42): "Initiate low-dose oral antiplatelet therapy (cardiac aspirin or clopidogrel [dose omitted]) in individuals with type 2 diabetes and a history of ASCVD (ischemic stroke, stable and unstable angina, myocardial infarction, and peripheral arterial disease) as secondary prophylaxis." "Don't use low-dose oral antiplatelet therapy as primary prophylaxis for ASCVD in individuals with type 2 diabetes because of a lack of clinical evidence about its effectiveness in reducing all-cause and CV-related mortality."
- CV risk: "Screen all individuals with type 2 diabetes for CV risk factors at the time of diagnosis or initial clinical visit and then repeat annually." (p. 38)

### Pack

- `tgt_bp` <130/80 (REF-DM-CVD-BP-SBP 130 / -DBP 80; D-DM-23, P0-27). RX-07 (review BP treatment at ≥130/80 twice). RX-08 (albuminuria **with** raised BP and no ACEi/ARB). REF-DM-CVD-BP-2DRUG-SBP 150 / -DBP 90 exist but no item uses them. DM-ACT-REFER-BP-02: above 130/80 on two medicines → routine referral. DM-ACT-REFER-BP-01 (>200/>110 same day), -BP-03, DM-ACU-ROUTE-29.
- RX-06: "Type 2 diabetes aged 40 or over, not on a statin: WHO recommends one" (REF-DM-CVD-STATIN-AGE 40). REF-DM-CVD-LDL-ASCVD 1.4 and -LDL-HIGHRISK 1.8 unused. DM-ACT-SCREEN-LIPID-01 yearly where `lab.lipids`. DM-ACT-REFER-CHOL-01 (TC >8).
- RX-09 (antiplatelet, secondary prevention only). Flags `dual_ras_blockade`, `ras_blocker_or_statin_in_pregnancy`, `ras_blocker_or_statin_could_conceive`, K+ flags. Risk model `who_cvd_2019_eastern_ssa`.

### Comparison

- BP target: SAME (<130/80). Less stringent in the elderly: GUIDELINE gives no number; pack has none (D-DM-40) — no change.
- PAD's <140/90: inconsistent inside the guideline; keep <130/80 (UG-46).
- Drug choice and referral point: DIFFERENT (UG-24). Beta-blocker and loop-diuretic cautions: PACK SILENT (UG-24).
- ACEi/ARB for albuminuria without hypertension: DIFFERENT (UG-25). Dual blockade: SAME.
- Statin: DIFFERENT (UG-26). Aspirin: SAME. Lipid interval: SAME (yearly), plus a 4–12-week re-check after starting (UG-26).

---

## 8. Complication screening

### Guideline

- Eyes: "Screen all individuals with type 2 diabetes for diabetic retinopathy (DR) at the time of diagnosis or initial clinical encounter"; "Repeat every two years if there are no signs of DR"; "In the presence of signs of DR, repeat the screening depending on the severity of the DR (annually for mild to moderate NPDR, 3-6 monthly screening for severe NPDR, and <3 monthly screening for PDR)". "Screen for DR using visual acuity assessment and indirect ophthalmoscopy using a dilated slit lamp examination or direct ophthalmoscopy using fundus photography". "Specialised treatment for DR should be performed by an experienced ophthalmologist" (p. 51; repeated p. 55). Primary level: visual acuity at initial and annual visits; non-mydriatic fundoscopy at secondary/tertiary (Table 4, p. 22). Referral grades: **not in the summarised version** (beyond treatment by an ophthalmologist).
- Kidney: "Screen all individuals with diabetes for diabetic kidney disease (DKD) at the time of diagnosis or initial clinical encounter and then repeat the assessment annually." Serum creatinine (eGFR) and UACR "on a random spot urine sample by immunoassay or a dipstick specific for microalbuminuria OR Perform a urinalysis to detect proteinuria (if unable to measure UACR)". "A normal UACR should be <30 mg/g (<3 mg/mmol). Levels between 30-300 mg/g (3-30 mg/mmol) and >300 mg/g (>30 mg/mmol) suggest the presence of microalbuminuria and macroalbuminuria, respectively." "... it is advised to perform two to three additional tests within three to six months to confirm any abnormality in renal function." (p. 48) CKD categories, Table 12 (p. 49). Nephrology referral thresholds: **not in the summarised version**.
- Feet: "Screen all individuals with diabetes for diabetic foot disease (DFD) at the time of diagnosis and then repeat it annually (or more frequently in individuals at risk of DFD)"; "Evaluation for loss of protective sensation, position, and vibration sense using a 10 g monofilament and a 128 HZ tuning fork, respectively"; "Routinely inspect the footwear of individuals with diabetes to ensure that it is well-fitting and appropriate." (p. 52) Detailed foot inspection at every 3-monthly visit at primary level (Table 4, p. 22); comprehensive foot examination at every follow-up visit (Table 5, p. 28). "In Uganda, most patients with DFD present with severe disease (Wagner classification 3-5)" (p. 52). Risk categories (IWGDF-style): **not in the summarised version**. Foot infection antibiotics by severity (Table 13, p. 54; the guideline gives drugs and durations).
- Neuropathy: "Screen for peripheral neuropathy at puberty or from 11 years with 2-5 years of diabetes duration and then repeat it annually." (p. 51 — the adult chapter carries the paediatric wording, apparently copied from Table 16.) Drugs listed (section 6, UG-41).
- PAD: "Screen all individuals with type 2 diabetes and >50 years of age for peripheral arterial disease (PAD) at the time of diagnosis or initial clinical visit and then repeat it annually." Medical management: HbA1c <8%, BP <140/90, LDL <1.8; "Initiate oral antiplatelet and high-intensity statin therapy"; "Initiate SGLT2 inhibitors of GLP-1 RA"; aspirin plus low-dose rivaroxaban "in those with a low bleeding risk" (doses given) (p. 55).
- Lipids: at diagnosis, 4–12 weeks after starting therapy, then annually (p. 40).

### Pack

- Eyes: DM-ACT-SCREEN-EYE-01 (never, 24 months, or ungradable; REF-DM-EYE-INTERVAL-WHO 24). Complication `diabetic_retinopathy.screeningIntervals`: none 24; mild 12, **24 if control confirmed** (REF-DM-EYE-RECALL-MILD-MIN / -NONE-MILD-MAX); moderate 6, 12 if controlled; severe 3; PDR 1; centre-involving DME 1; non-centre 3. Referral: DM-ACT-REFER-EYE-01 (severe/PDR/centre DME, ICO timings, signed), -02 (VA worse than 6/12 or ungradable), -03 (moderate, routine), DM-ACT-REFER-VISION-01. Type 1 start: REF-DM-EYE-START-T1 5 years (note: "Type 1: 5 years after onset").
- Kidney: DM-ACT-SCREEN-KIDNEY-01 (12 months); `dkd_albuminuria_2of3` (2 of 3 within 3–6 months); REF-DM-KID-ACR-A2 3, -A3 30 (≥30 severe, D-DM-17); referrals EGFR-01 (<30 same day), -02 (30–59 routine), -03 (fall >20%), ALB-01, ALB-02 (ACR >70); DM-STR-CKD-01; DM-ACT-TEST-ACR-01 (strip protein → lab ratio).
- Feet: DM-ACT-SCREEN-FOOT-01 (12 months; note "Feet are looked at for ulcers at every visit whatever the interval"); REF-DM-FOOT-INT-0..3 (12/12/6/3, IWGDF; unused); DM-ACT-SCREEN-NEURO-01 (12 months); referrals FOOT-01/02/03, CHARCOT-01, PVD-01, LIMB-01; EDU-02.
- Lipids: DM-ACT-SCREEN-LIPID-01 (12 months, lab sites).

### Comparison

- Eyes: SAME for none (2 years), severe (pack 3 months within 3–6), PDR (pack 1 month within "<3"); moderate: pack more frequent (6 vs 12) — keep; **mild with control confirmed: pack 24 months vs guideline annually** (UG-27). Referral grades: GUIDELINE SILENT; keep ICO (signed).
- Kidney: SAME (yearly; confirm on repeats within 3–6 months). ACR exactly 30 mg/mmol: guideline ">30" is macro, pack "≥30" severe (D-DM-17): one-value edge, no change proposed. Referral thresholds: GUIDELINE SILENT; keep pack.
- Feet: SAME (yearly plus every visit; monofilament and tuning fork). Footwear inspection: PACK SILENT (minor; can join EDU-02). Infection treatment: out of the pack's scope (the pack refers).
- Neuropathy: SAME (yearly).
- PAD: pack checks pulses in every foot assessment, broader than ">50" — keep; PAD medical therapy: PACK SILENT (UG-46).
- Type 1 start: DIFFERENT (UG-28).

---

## 9. Acute complications

### Guideline

- DKA, Table 11 (p. 44): "A triad of: 1. Hyperglycaemia (blood glucose >11.0 mmol/l or 200 mg/dl) 2. Significant ketonemia or ketonuria (serum ketone concentrations >3.0 mmol/l or >2+ ketones on urine dipsticks) 3. Acidosis (serum bicarbonate concentration of <15 mmol/l and/or venous pH <7.3)". Same triad for children (p. 64).
- HHS, Table 11 (p. 44): "1. Severe dehydration 2. Marked hypovolemia (hypotension and tachycardia) 3. Calculated effective serum osmolality >300 mOsm/kg or total serum osmolality >320 mOsm/kg 4. Hyperglycaemia (≥30 mmol/l or ≥540 mg/dl) 5. Absence of significant ketonemia (serum ketone concentrations ≤3.0 mmol/l or urine ketone strip test <2+) and acidosis (pH ≥7.3 and serum bicarbonate concentrations ≥15 mmol/l)."
- Euglycaemic DKA: "occurs in chronic alcoholic consumption, pregnancy, and individuals with type 2 diabetes on concomitant use of sodium-glucose cotransporters 2 (SGLT2) inhibitors and insulin therapy." "... ketosis and acidosis in the presence of normal or near-normal blood glucose levels (blood glucose levels <11.0 mmol/l or 200 mg/dl)." (p. 45)
- Precipitants: infections, intercurrent illness, poor adherence, MI and stroke (p. 45). Work-up list (p. 45).
- Level of care: "In Uganda, these hyperglycaemic emergencies should be managed at health centre IVs, secondary, and tertiary health care levels." "Healthcare professionals at health centre III should initiate fluid therapy and then promptly refer the patient to a health centre IV, secondary, and tertiary hospital for further management." (p. 44)
- Management (p. 46 adults; p. 65 children): fluids, insulin, potassium (the guideline gives volumes, rates and doses).
- Hypoglycaemia treatment: "Hypoglycaemia should be promptly managed by consuming any readily available fast-acting carbohydrate such as pure glucose powder." "Use intravenous glucose infusions such as 50% or 5% dextrose solutions in hospital settings." (p. 44) Children: "give sugar in any available form immediately, such as sweets, glucose tablets or powder, sugar, honey (1 tablespoon), a glass (125 mls) of juice or soda (not diet soda)." (p. 63)
- Children: "healthcare professionals should routinely perform fingerstick blood glucose measurement for children or adolescents presenting with unexplained reduced levels of consciousness, rapid breathing, abdominal pain, nausea, and vomiting without diarrhoea." (p. 64) Signs "may mimic several infections, such as malaria, pneumonia, and gastroenteritis" (p. 64).
- Sick-day rules (fluids, never stop insulin, ketone checks): **not in the summarised version**. Vomiting on insulin as an emergency: **not in the summarised version** (only the children's DKA recognition above). DKA in pregnancy: counselling (p. 75) and euglycaemic DKA in pregnancy (p. 45) only.

### Pack

- DM-ACU-ROUTE-02: ketones 2+ (urine) or ≥3.0 (blood) in diabetes or with a raised glucose → immediate (REF-DM-ACU-DKA-UKET 2plus, -BOHB 3.0, -GLU 11.1). REF-DM-ACU-DKA-PH 7.3, **REF-DM-ACU-DKA-HCO3 18** (no item uses either).
- DM-ACU-ROUTE-14: glucose **≥33.3** or HI → suspect HHS (REF-DM-ACU-HHS-GLU 33.3); REF-DM-ACU-HHS-OSM-EFF 300, -OSM-TOTAL 320 (unused). ROUTE-11 (signs + raised glucose), -24, -24B, -03 (SGLT2 at any glucose), -35 (pregnancy).
- Ketone-testing lane: ROUTE-01 (≥18 same day), -08, -13, -13B, -19, -21, -21B, -22, -23, -23D, -23R, -30, -34, -34B; DM-ACT-REFER-GLU-02.
- Hypoglycaemia: ROUTE-06, -07, -26, -31. Notes: "Route only: the treatment is owned by the acute pathway."
- Children: ROUTE-04 (vomiting/pain/breathing/dehydration/drowsy **with** a feature of diabetes or glucose >11), -15 (deep breathing or drowsy, no glucose), -18, -25, -25B, -25C, -32, -32B; DM-SUS-PAED-01..05. ROUTE-04 note: "Recognition and referral only: no fluid or insulin content is carried for children."
- Sick-day: DM-ACT-EDU-04, ROUTE-23R, -32B, flags `metformin_during_acute_illness`, `sglt2_during_acute_illness`.

### Comparison

- DKA: pack's triage thresholds are more sensitive (2+ vs ">2+"; ≥3.0 vs ">3.0") — keep. Unused REF-DM-ACU-DKA-HCO3 18 differs from 15 (UG-32).
- HHS: DIFFERENT (30 vs 33.3) (UG-31).
- Euglycaemic DKA: SAME in direction (ROUTE-03 SGLT2, ROUTE-35 pregnancy). Alcohol as a setting: PACK SILENT (minor; no item).
- HC III fluids before referral: DIFFERENT (UG-33).
- Hypoglycaemia treatment: GUIDELINE content is treatment; the pack routes by design. No item; the acute pathway owner should check its content against p. 44 and p. 63.
- Child with vomiting without diarrhoea, abdominal pain, rapid breathing or reduced consciousness, not known to have diabetes: pack prompts a glucose only for deep breathing or drowsiness (ROUTE-15) and weight loss (PAED-02) (UG-30).
- Sick-day rules: GUIDELINE SILENT; pack keeps ISPAD/Trend/ADA content.

---

## 10. Referral criteria

### Guideline

- Emergencies: HC III starts fluids and refers; managed at HC IV and above (p. 44).
- Insulin: "mainly available" at HC IV and above (p. 34).
- Eyes: treatment by "an experienced ophthalmologist" (p. 51); type 1: "Refer to an experienced ophthalmologist for specialised treatment" (p. 67).
- BP: "Refer to a HT specialist for further evaluation" after three drugs and an MRA (p. 39).
- Foot infection: surgical debridement, CT angiography/Doppler, urgent parenteral antibiotics for moderate–severe infection (p. 53).
- Specialists by level (Table 3, p. 21): podiatrist, physicians, ophthalmologists at secondary; diabetologists, nephrologists at tertiary.
- Same-day vs routine timings, eGFR/ACR referral thresholds: **not in the summarised version**.

### Pack

- Acute lane: 26 rules in `acuteOrder` (immediate/same-day routing); DM-ACT-REFER-GLU-01/02, -VISION-01, -BP-01/02/03, -EGFR-01/02/03, -ALB-01/02, -CHOL-01, -EYE-01/02/03, -CHARCOT-01, -FOOT-01/02/03, -PVD-01, -LIMB-01, -TARGET-01/02.

### Comparison

GUIDELINE SILENT on most timings; keep the pack's. DIFFERENT: BP referral point (UG-24); HC III fluids (UG-33); levels for drug starts (UG-21).

---

## 11. Self-management education, insulin storage and technique, follow-up

### Guideline

- "seven essential self-care behaviours should be emphasised and encouraged. These are: 1. Healthy eating 2. Being physically active 3. Self-monitoring of blood glucose 4. Adherence to medicine (glucose-lowering and other ancillary therapies) 5. Good problem-solving skills 6. Healthy coping skills 7. Reduction of risky behaviour." (p. 25)
- Plate: "fill half the plate with non-starchy vegetables such as greens, tomatoes, and onions, and one-quarter of the plate with lean protein such as fish, chicken, and lean meat. The remaining quarter of the plate can be filled with whole grains such as brown rice or starchy foods such as sweet potatoes, or legumes such as beans, groundnuts, and peas." "Serve portions that are equivalent to the fist of one's hand." (p. 25)
- "Generally, avoid honey, processed juices, and sugar"; "Routine use of micronutrient and herbal supplementation, such as chromium, vitamin D, cinnamon, and aloe vera, is also not recommended due to the lack of robust clinical evidence to support their use, and they are associated with an increased risk of hepato- and renal toxicity." (p. 26)
- Alcohol: "Ideally, alcohol consumption should be avoided. However, if it is to be consumed, consider moderate intake (one drink per day for women and up to 2 drinks per day for men)." (p. 23)
- Insulin storage: "Insulin should be stored in a cool environment of temperatures <30°C and away from exposure to extremes of temperature." "In the absence of a refrigerator, individuals on insulin therapy should be advised to store their insulin in a simple, clean plastic container with dry cotton wool in a cool environment at room temperature, as shown in the figure below." (p. 35) The photograph (p. 36) shows a metal tin lined with cotton wool. "Do not store insulin in water, on the floor, or sand" "This is because it increases the potential for contamination of insulin resulting in repeated injection abscesses" (p. 36). **Clay pots: not in the summarised version.**
- Devices: "The recommended insulin syringes for insulin administration are U100 0.5 ml or 1 ml insulin syringes with a 6 mm needle length"; "For insulin pen needles, the recommended ones should be 4 mm in length or 5 mm for individuals who are overweight or obese" (p. 36).
- Technique: sites "abdomen, thigh, buttocks, and outer aspect of the arms"; "These sites should be rotated to avoid excessive pain and lipo-hypertrophy"; "The insulin should be injected perpendicularly with or without a gentle skin pinch"; "The insulin syringe or insulin pen needle should ideally be changed daily." (p. 37)
- Follow-up: Table 4 (p. 22) initial, 3-monthly and annual visits by level; Table 5 (pp. 27–28). Hypoglycaemia education at each visit (p. 44). Foot care education (p. 53).

### Pack

- DM-ACT-EDU-01 (diet, activity, tobacco, alcohol, medicines; note: "The pack carries no food list: no official Ugandan guidance on local staples was found"); REF-DM-ACT-EDU-PA-MIN 150, -WEIGHT 5%, -SUGAR 10%. EDU-02 (foot care), EDU-03 (lows), EDU-04 (sick-day), **EDU-05** (EADSG storage: fridge 2–8 °C if kept >2 months, never frozen; in-use vial in a clean plastic box out of the sun for up to 6 weeks, 4 if the room reaches 30 °C; never in water; avoid clay pots), EDU-06..10. REF-DM-ACT-REVIEW-MONTHS 3. REF-DM-ACT-SMBG, REF-DM-ACT-DENTAL unused.

### Comparison

- Storage: SAME in substance (clean plastic container, never in water). The guideline adds dry cotton wool, "<30°C", and "not on the floor or sand"; it says nothing about clay pots, so the pack's EADSG line stands (UG-23).
- Needles, injection technique: PACK SILENT in wording (EDU-05 says only "check ... injection sites") (UG-23).
- Food guidance: PACK SILENT; the 2026 guideline now supplies the Ugandan food guidance the pack said it could not find (UG-44). SMBG frequency: PACK SILENT (UG-44).
- 3-monthly follow-up: SAME.

---

## 12. Children and adolescents

### Guideline (chapters 15–16, pp. 59–68)

- Diagnosis: section 4 (≥2 antibodies; symptoms in Figure 10, p. 59).
- Insulin: "Children, adolescents, and young adults with T1D should be managed using multiple daily insulin injections (MDI) or a basal-bolus insulin regimen" (p. 61; the guideline gives dose ranges by puberty).
- Monitoring and targets (p. 62): "Monitor blood glucose levels 4-6 times a day"; "The recommended target RBG and FBG levels are 4.0-10.0 mmol/l (70-180 mg/dl) and 4.0-7.0 mmol/l (70-126 mg/dl)"; "Perform the glycated haemoglobin (HbA1c) test every three months"; "The recommended target HbA1c for children, adolescents, and young adults with T1D is <7% (53 mmol/mol) without frequent hypoglycaemia and/or severe hypoglycaemia".
- Hypoglycaemia and nocturnal signs (p. 63); DKA recognition (p. 64); DKA management (p. 65, doses).
- Table 16 (pp. 67–68): DKD "Screen for DKD at puberty or from age 11 years, whichever is earlier, with 2–5 years of diabetes duration, and repeat it annually thereafter"; neuropathy "Screen at puberty or from 11 years with 2 -5 years of diabetes duration , and then repeat it annually."; DR "Screen at puberty or from age 11 years with 2 - 5 years of diabetes duration", "Repeat screening every two years for those with diabetes duration of <10 years, mild nonproliferative DR (NPDR) and optimal glycaemic targets", "Repeat screening every 3 years if no signs of DR", "Screen every three months for 6-12 months in those with long-standing suboptimal glycaemic control and moderate to severe NPDR and proliferative DR"; hypertension "Blood pressure (BP) ≥ the 95 th percentile for age, sex, and height OR -Systolic BP ≥130 and/or diastolic BP ≥80 mmHg (for older adolescents)", "Treat to a BP target <90th percentile for age, sex, and height"; dyslipidaemia "Screen by performing a random lipid profile test and repeat it every three years if normal." "Screen from 11 years of age" "Screen from as early as 2 years in the presence of a family history of either hypercholesterolemia or early cardiovascular death", statin "in children aged >10 years if the lifestyle management fails to achieve the optimal LDL level", "The optimal LDL level is <2.6 mmol/l (100 mg/dl)."
- Autoimmune screening (p. 68): "Type 1 diabetes is associated with several autoimmune conditions that should be screened for at diagnosis or initial clinical visit. These include: 1. Autoimmune thyroid dysfunction ... 2. Coeliac disease ... 3. Addison's disease ... 4. Pernicious anaemia ... 5. Autoimmune hepatitis".
- "Growth failure and pubertal delay are some of the early indicators of poor glycemic control" (p. 66).

### Pack

- Recognition and routing: DM-SUS-PAED-01..05, DM-ACU-ROUTE-04, -18, -25, -25B, -25C, -32, -32B; adult start at 16 (D-DM-32). Screening steps (DM-ACT-SCREEN-\*) carry `ages: adult`. Targets: none age-specific for children. REF-DM-KID-SCREEN-START-T1 5 and REF-DM-EYE-START-T1 5 (years after onset; no item uses them). No paediatric BP, lipid or autoimmune content.

### Comparison

PACK SILENT on children's chronic care; DIFFERENT on the screening start (5 years' duration vs 11/puberty with 2–5 years). UG-28, UG-29, UG-30.

---

## 13. HIV/ART, TB, steroids

### Guideline

- HIV (pp. 78–79): "An increased risk of new-onset type 2 diabetes with specific antiretroviral therapies such as protease inhibitors, integrase strand transfer inhibitors such as dolutegravir, and non-nucleoside reverse transcriptase inhibitors such as efavirenz" (p. 78). Screening before and on ART, every six months (p. 79). "Use metabolically neutral nucleoside reverse transcriptase inhibitors such as abacavir, tenofovir, emtricitabine, and lamivudine, and PIs such as darunavir and atazanavir"; "**Avoid dolutegravir in individuals with diabetes and HIV comorbidity**"; statin for low-to-moderate CVD risk (p. 79). HIV serology at the initial diabetes visit (Table 5, p. 28). HbA1c accuracy in HIV: not in the summarised version.
- TB (pp. 79–81): "Compelling evidence shows that diabetes increases the odds of developing tuberculosis (TB) by three times." (p. 79) "Screen for TB in individuals with diabetes using: 1. Sputum-smear microscopy 2. WHO-approved rapid molecular tests such as Gene Xpert 3. Chest radiograph" "Screen at the time of diagnosis or on presentation with symptoms of TB" (p. 80). Diabetes screen in TB (section 2). Treatment: "Because rifampicin is a potent inducer of cytochrome P450 enzymes, it reduces the plasma concentrations of most oral glucose-lowering therapies such as metformin, sulfonylureas, and DPP-IV inhibitors by 30-80%." "Because of this, dose adjustment of most oral glucose-lowering therapies will be required." "Start insulin therapy as the first-line diabetes therapy in individuals with TB and severe hyperglycaemia (HbA1c ≥10.0% or 86 mmol/mol, FBG ≥14.0 mmol/l or 250 mg/dl, and RBG ≥16.7 mmol/l or 300 mg/dl)"; "Use metformin as the first-line agent in obese or overweight individuals with TB and mild to moderate hyperglycaemia"; "In individuals with TB and mild to moderate hyperglycaemia (RBG <16.7 mmol/l or FBG <14.0 mmol/l) and BMI<25 kg/m2, start oral agents such as sulfonylureas and dipeptidyl peptidase IV (DPP-IV) inhibitors as first-line" (p. 81). An HbA1c target during TB: not in the summarised version.
- Steroids: "Patients on high-dose steroids for management of any medical condition" is an insulin indication (p. 34); long-term corticosteroids, antipsychotics and older beta-blockers asked at the first visit (p. 27). How to test on steroids: not in the summarised version.

### Pack

- DM-SUS-POP-HIV-01 (yearly on ART), DM-SUS-POP-DTG-01 (on DTG with symptoms: glucose today; never change ART; D-DM-33), flag `dolutegravir_with_metformin` (UCG 2023 HIV chapter), caveat `hba1c_hiv_on_art`. No HIV-test prompt for people with diabetes (DM-CLS-WTLOSS-01 "look for TB, HIV and cancer" only with weight loss).
- DM-SUS-POP-TB-01 (fasting glucose), DM-ACT-SCREEN-TB-01 (cough >2 weeks: assess for TB), `tgt_hba1c_tb` <8%, flag `sulfonylurea_with_rifampicin` ("Rifampicin lowers sulfonylurea levels ... Insulin is not affected; WHO keeps metformin as the initial medicine during TB treatment."), TB caveats.
- Steroids: DM-SUS-POP-STEROID-01, DM-CLS-DRUG-01, DM-STR-STEROID-01, caveat `fasting_glucose_on_steroids`.

### Comparison

HIV interval DIFFERENT (UG-36). Dolutegravir DIFFERENT (UG-37). HIV test at diabetes diagnosis PACK SILENT (UG-43). TB screens DIFFERENT (UG-38, UG-39). TB treatment and the rifampicin flag DIFFERENT (UG-40). Steroids: SAME in direction; high-dose steroids as an insulin indication PACK SILENT (UG-22).

---

## 14. Other decision-relevant content the pack does not cover

- **In hospital** (pp. 56–57): "In-hospital hyperglycaemia is defined as blood glucose levels >7.8 mmol/l (>140 mg/dl) in a hospitalised individual." "Initiate glucose-lowering therapy only if the blood glucose levels are persistently above 10 mmol/l (≥180 mg/dl)." "Treat critically ill hospitalised medical and surgical patients with hyperglycaemia to a glycaemic target of 7.8-10.0 mmol/l (140-180 mg/dl)." "Treat noncritically ill medical and surgical patients with in-hospital hyperglycaemia to a glycaemic target of 5.6-10.0 mmol/l (100-180 mg/dl)." Cautions: "Avoid using the sliding scale in administering insulin ..."; "Avoid using premixed insulin therapy (especially human insulin) in managing in-hospital hyperglycaemia ..."; "Avoid using metformin due to risk of developing lactic acidosis."; "Avoid using sulfonylureas such as glibenclamide and glimepiride because of the high risk of hypoglycaemia."; "Avoid using thiazolidinediones such as pioglitazone ..."; DPP-4 inhibitors "can also be used"; SGLT2i "can also be initiated early in hospitalised patients with hyperglycaemia and acute heart failure". (UG-34)
- **Peri-operative**, Table 14 (p. 58): "Elective surgery HbA1c goal: <8% (64 mmol/mol)"; "Random blood glucose goal within 4 hours of surgery: 5.6 –10.0 mmol/l"; "Hold metformin on the day of surgery."; "Discontinue sodium-glucose cotransporter 2 inhibitors 3-4 days before surgery."; "Hold other oral glucose-lowering agents on the morning of the surgery or procedure."; insulin reductions (the guideline gives percentages). (UG-35)
- **Initial and annual evaluation**, Table 5 (pp. 27–28): age of onset, family history (diabetes; autoimmune), mental health, alcohol/smoking; thyroid palpation; skin (injection sites, acanthosis nigricans); "Assess for any psychosocial disorders such as depression, anxiety, and diabetes distress." (initial, annual); waist circumference; oral examination; liver tests; "Serum potassium for individuals on angiotensin-converting enzyme inhibitors, angiotensin II receptor blockers, and/or diuretics" (initial, annual); "Random or fasting serum C-peptide" (initial); TSH/FT4 "in individuals with type 1 diabetes and selected individuals with type 2 diabetes"; "Serum vitamin B12 levels (if on long-term and high-dose metformin)" (annual); complete blood count; "HIV serology" (initial); calcium/phosphate if indicated; "Preconception counselling and family planning" at every visit. (UG-42, UG-43)
- **Prevention** (pp. 23–24): "achieving and maintaining a 7% body weight reduction, low-calorie intake, and ≥ 150 minutes of moderate-intensity physical activity per week"; drugs that lower risk: metformin, pioglitazone, semaglutide; metformin "especially in individuals aged 25-44 years, with a BMI ≥35 kg/m2, and women with a prior history of gestational diabetes mellitus". (UG-45)
- **PAD medical therapy** (p. 55). (UG-46)

---

## Differences that need a CSO decision

Each: what differs; the clinical consequence in one line; the recommendation. The default is to follow the 2026 guideline unless it is less safe or a signed decision requires the pack's way; where a signed decision is in the way, it is named, and following 2026 means superseding it.

**UG-01. Diagnostic operators.** Guideline: "≥ 7.0", "≥ 11.1", "≥ 6.5%" (p. 18). Pack default `ug_ucg_2023`: ">" for every threshold (P0-25), with WHO's "≥" only alongside.
Consequence: a fasting 7.0, an HbA1c of exactly 6.5% or a random 11.1 is not diabetes under the default set.
Recommendation: follow 2026. Fill `ug_integrated_dm_2026` with "≥" and make it the default; D-DM-01 already names the 2026 guideline as superseding UCG 2023 "if in force". Supersedes the default part of D-DM-01 and P0-25 (P0-25 itself stays true of the UCG set, which can remain alongside or be retired).

**UG-02. Which symptoms, and which single test, diagnose.** Guideline: 8 symptoms (5 P's: polyuria, polydipsia, polyphagia, paraesthesia, pruritus; 3 W's: weight loss, wasting, weakness) "and/or a hyperglycaemic crisis"; a single RBG ≥11.1 **or FBG ≥7.0** suffices (p. 18). Pack UCG set: only a random value, with 4 symptoms; FBG always needs a repeat. WHO set: 3 symptoms.
Consequence: a symptomatic person with a fasting 7.0–11.0, or with pruritus, wasting or weakness only, or presenting in DKA/HHS, is not "diabetes met" under the default set; referrals that wait for it wait.
Recommendation: follow 2026 (8 symptoms; FBG or RBG with symptoms; a recorded DKA/HHS counts as symptomatic). Supersedes D-DM-02 for the default set. Weakness and wasting are non-specific: the random-value path keeps its own threshold, so the effect is limited to people already above 11.1 or 7.0 fasting.

**UG-03. Confirming without symptoms.** Guideline: "two abnormal tests (RBG or FBG or 2h BG after an OGTT or HbA1c) performed at the same time or at two different time points" (p. 19). Pack: `repeat_abnormal_result` = "a second diabetes-range result on a later day" (WHO set) or "a repeat result" (UCG set); an asymptomatic RBG ≥11.1 never counts (DM-SUS-INCID-01 says repeat on another day).
Consequence: the pack asks for a second visit when two concordant tests from one sample (e.g., FBG and HbA1c) already diagnose under 2026; loss to follow-up delays diagnosis.
Recommendation: follow 2026 for two **different** concordant tests on the same day (also ADA's practice). For an asymptomatic RBG ≥11.1 as one of the two: follow 2026 only paired with a fasting or HbA1c result in the diabetes range, never two random values; CSO to confirm, since WHO and ADA do not count a random value without symptoms.

**UG-04. Meter versus laboratory; point-of-care HbA1c.** Guideline: in hospitals, venous plasma on an analyser "is the recommended method"; "Do not use point-of-care HbA1c machines to diagnose diabetes" (p. 19). Pack: meter values diagnose with symptoms or a repeat (D-DM-04; WHO set criteria `who_hd_fcap_*`, `who_hd_random_cap_*`, `who_hd_cap_high_symptoms`); no input says whether an HbA1c was laboratory or point-of-care.
Consequence: a point-of-care HbA1c can diagnose in the pack; at hospital sites a meter can stand in for the laboratory the guideline expects.
Recommendation: follow 2026: add an HbA1c method input and block point-of-care HbA1c for diagnosis (keep it for monitoring); at sites with an analyser (hospital level, and HC III/IV that have one per Table 3), ask for venous plasma to confirm a meter-based diagnosis. Keep D-DM-04 (meter diagnosis) at sites without an analyser: the guideline places glucometers at community level and does not forbid them there.

**UG-05. Intermediate hyperglycaemia.** Guideline "prediabetes": FBG 5.6–6.9, 2h 7.8–11.0, HbA1c 5.7–6.4, RBG 7.8–11.0 (p. 18). Pack: WHO (IFG from 6.1) and ADA sets both pending; the live prompt DM-SUS-INCID-04 starts at a fasting capillary 6.1.
Consequence: fasting 5.6–6.0 and HbA1c 5.7–6.4 are not flagged, so the yearly re-test (DM-SUS-RISK-04, DM-ACT-EDU-10) and prevention advice never start.
Recommendation: follow 2026: make the ADA-band set (`ada_2026_prediabetes`, same numbers) Uganda's intermediate set and move INCID-04's lower edge to 5.6. The random 7.8–11.0 band: use it as "test properly" (FBG/HbA1c/OGTT), not as a label, because no international body defines prediabetes on a random value.

**UG-06. Universal screening in pregnancy.** Guideline: "Screen all pregnant women ... at first ANC contact or visit"; OGTT at 24–28 weeks if early tests are normal; risk-based screening "can miss over 30% of women with HIP" (pp. 70–71). Pack: risk-factor screening only (DM-SUS-PREG-UCG); universal OGTT (DM-SUS-PREG-01) off unless a site opts in (D-DM-12, signed).
Consequence: by the guideline's own figure, about a third of women with hyperglycaemia in pregnancy are missed.
Recommendation: follow 2026: switch DM-SUS-PREG-01 on everywhere, with the figure's fallback (FBG, RBG and/or HbA1c at first contact where an OGTT cannot be done); keep DM-SUS-PREG-UCG as the "test early" trigger. Supersedes D-DM-12. Site OGTT capacity is the practical limit; the fallback covers it.

**UG-07. The UCG gestational set, and the "and" in Figure 12.** Guideline uses WHO 2013/IADPSG values only (p. 71); the pack shows `ug_ucg_2023_gdm` (>5.6, >7.8) beside its WHO default (P0-26). Figure 12's bottom box says "FBG ≥5.1 ..., 1-hour ... ≥10.0 ..., and 2-hour ... ≥8.5"; its "Abnormal" box lists them separately.
Consequence: the UCG set disagrees with both WHO and 2026 (it labels a 2h of 7.9–8.4 as GDM and misses a fasting 5.1–5.6), so showing it invites the wrong label; reading "and" literally would miss most GDM.
Recommendation: follow 2026: stop showing `ug_ucg_2023_gdm` (P0-26's default stands; its "alongside" part is superseded). Keep any-one-value (IADPSG, as the pack does) and record "and" as a typographical ambiguity to raise with the guideline authors.

**UG-08. HbA1c in early pregnancy.** Guideline: at first ANC (<24 weeks), "HbA1c ≥6.5% (48 mmol/mol)" is abnormal → "Manage as HIP" (p. 71). Pack: caveat `hba1c_pregnancy` blocks HbA1c in pregnancy.
Consequence: an early-pregnancy HbA1c ≥6.5% (probable pre-existing diabetes) produces nothing in the pack.
Recommendation: follow 2026 as rule-in only: HbA1c ≥6.5% before 24 weeks fires DM-CON-PREG-03's referral; a normal or low HbA1c in pregnancy stays blocked (the caveat's direction: pregnancy lowers HbA1c, so a high value is trustworthy and a normal one is not).

**UG-09. Glycaemic targets in pregnancy.** Guideline: FBG <5.3; 1h <7.8 or 2h <6.7 (p. 74); preconception HbA1c <6.5% (p. 77). Pack: every target is `not_pregnant`; no pregnancy target or band.
Consequence: a pregnant woman with a fasting 6.0 on treatment is never shown as above target.
Recommendation: follow 2026: add pregnancy targets and control bands (GDM and pre-existing), and a preconception HbA1c <6.5% prompt beside DM-ACT-EDU-08.

**UG-10. Which medicine in pregnancy.** Guideline: insulin first line; metformin second line ("women who refuse insulin or cannot access insulin" in GDM; second line or add-on in pre-existing); avoid SU, DPP-4i, SGLT2i, TZD, GLP-1 RA (pp. 73, 76). Pack: red flag `other_glucose_lowering_in_pregnancy` ("insulin and/or metformin", WHO 2025); no order.
Consequence: small; the flag already removes the unsafe agents, but a woman on metformin alone is not prompted toward insulin.
Recommendation: follow 2026 in the flag's action text ("insulin first; metformin if insulin is refused or unavailable, or as an add-on"). Review prompt only, no dose (D-DM-31).

**UG-11. Aspirin in pre-existing diabetes in pregnancy.** Guideline: aspirin from 12–16 weeks "to reduce the risk of preeclampsia" (p. 76; the guideline gives a dose). Pack: silent.
Consequence: pre-eclampsia prophylaxis is not prompted for a high-risk group.
Recommendation: follow 2026 as a review prompt (no dose) for pregnant women with type 1 or type 2 diabetes from 12 weeks; whether it extends to GDM is not in the summarised version — leave GDM out.

**UG-12. Postpartum test.** Guideline p. 74: "repeat an OGTT between 6-12 weeks postpartum"; p. 77: "measure the FBG level at 6-12 weeks post-delivery"; both then every 1–3 years. Pack: DM-SUS-PREG-02 (6–12 weeks, test not specified), DM-SUS-RISK-05 (at least every 3 years).
Consequence: none on timing; the test type is unclear inside the guideline (a fasting test alone misses some postpartum diabetes).
Recommendation: OGTT where the site can run one, otherwise FBG (both pages satisfied); keep 3 years as the maximum interval. Low priority.

**UG-13. Obstetric and neonatal content.** Guideline: fetal scans, delivery timing (39 weeks well controlled; 36–<37 or 36+0–38+6 with complications; not after 40 weeks), caesarean consideration for estimated fetal weight ≥4.5 kg, neonatal glucose monitoring for at least 24 hours, breastfeeding (pp. 74, 76). Pack: silent.
Consequence: none for the diabetes pack if the antenatal pathway owns these.
Recommendation: CSO to confirm scope: route to the antenatal/neonatal pathway, not the diabetes pack. If any part belongs here, "monitor the baby's glucose for at least 24 hours" is the one with a direct diabetes link.

**UG-14. Type 1 needs two antibodies.** Guideline: "diagnose T1D by confirming the presence of hyperglycaemia and ≥2 islet-cell autoantibodies" (p. 60). Pack: one positive antibody supports type 1; none is required; a negative does not refute (65% of young clinically diagnosed type 1 in Uganda, Cameroon and South Africa were antibody negative).
Consequence of following 2026: most Ugandan children with type 1 could not be classified (antibodies are rarely available and often negative); insulin and ketone education could wait on a test.
Recommendation: **keep the pack** (2026 is less safe here). Record the 2026 criterion; never make antibodies a precondition for treating as type 1.

**UG-15. C-peptide as an insulin indication.** Guideline: "fasting serum C-peptide <0.76 ng/ml [0.25 nmol/l] or random serum C-peptide concentration <1.80 ng/ml [0.6 nmol/l]" = biochemically confirmed insulin deficiency → insulin (p. 34). Pack: `t1_cpeptide_low` (random <200 pmol/L with conditions) supports type 1 classification only (sources-review §1, signed).
Consequence: a random C-peptide of 200–599 pmol/L, which 2026 treats as insulin deficiency, produces no prompt in the pack.
Recommendation: follow 2026 as a separate **treatment-review** prompt ("C-peptide in the insulin-deficient range: consider insulin", no dose) at sites that can measure C-peptide (secondary and tertiary, Table 3); keep the signed classification thresholds unchanged (different purpose; 200–600 stays "indeterminate" for the type).

**UG-16. HbA1c targets: older adults and the young.** Guideline: "Elderly individuals (≥60 years)" with long-standing diabetes, high hypoglycaemia risk, short life expectancy and comorbidities "<8%"; "Newly diagnosed young individuals with a long-life expectancy (>10 years), no comorbidities, and a low risk of hypoglycaemia <6.5%" (p. 29). Pack: `tgt_hba1c_older_healthy` <7.5% from 65 (ADA; D-DM-13: "7.5% for the elderly ... until UCG's 'elderly' is defined"); `tgt_hba1c_relaxed` <8% on frailty, cognitive impairment, significant lows, impaired awareness; `tgt_hba1c_tight` only when agreed.
Consequence: people aged 60–64 at high risk keep <7%; the young low-risk profile is not offered <6.5%.
Recommendation: follow 2026: "elderly" = 60 (D-DM-13 asked for this definition); propose <8% at 60 or over when any of the 2026 profile's features is recorded (long duration, hypoglycaemia risk, renal disease, ASCVD); propose <6.5% for newly diagnosed, young, no comorbidities, not on insulin or a sulfonylurea (keeping the pack's insulin exclusion, which is safer). The ADA <7.5% option at 65 can stay as an alternative.

**UG-17. HbA1c frequency.** Guideline: every 3 months if poorly controlled, every 6 months if well controlled (p. 29); type 1 young people every 3 months (p. 62). Pack: DM-ACT-TEST-HBA1C-01 at 6 months; -02 at 3 months only after a treatment change.
Consequence: a person above target with no recent change waits 6 months for the next HbA1c.
Recommendation: follow 2026: due at 3 months when the last HbA1c was above the proposed target, and always for type 1 under 16 (REF-DM-CTRL-WINDOW-ABOVE 3 months already exists).

**UG-18. Lifestyle first versus combination therapy at diagnosis.** Guideline: "Initiate combination glucose-lowering therapy as clinically indicated in: 1. Individuals with newly diagnosed type 2 diabetes with glycated haemoglobin (HbA1c) ≥ 7.5% ... OR 2. Individuals with HbA1c levels 1.5 - 2.0% above target." (p. 33); no lifestyle-only period. Pack: RX-01/RX-01B "UCG 2023: ... lifestyle for 3 months first" unless "very high" (dark, no number; D-DM-34, P0-28).
Consequence: under the pack, a new patient with HbA1c 9% is told lifestyle for 3 months; under 2026 they start two medicines.
Recommendation: follow 2026: RX-01 says "HbA1c 7.5% or more at diagnosis, or 1.5% or more above target: the 2026 guideline recommends starting two glucose-lowering medicines; below that, metformin with diet and activity". Supersedes D-DM-34 and P0-28. The 2026 insulin thresholds (UG-22) fill P0-28's missing "very high" number.

**UG-19. Which second medicine, by phenotype.** Guideline Table 8 (pp. 31–32): elderly ≥60 → metformin, DPP-4i, SGLT2i, "Gliclazide is the SU of choice"; BMI <25 → SU or DPP-4i; BMI ≥25 → GLP-1 RA, SGLT2i, metformin; avoid pioglitazone with osteoporosis risk (p. 33). Pack RX-02: "UCG 2023's second line is glimepiride"; no DPP-4i; pioglitazone flag for heart failure only.
Consequence: the pack names one sulfonylurea for everyone, including people of 60 or over (where 2026 prefers gliclazide) and the overweight (where 2026 prefers weight-reducing agents).
Recommendation: follow 2026 in RX-02's wording by phenotype (age ≥60: gliclazide or a DPP-4 inhibitor; BMI <25: a sulfonylurea or DPP-4 inhibitor; BMI ≥25: SGLT2i, GLP-1 RA), then the availability line from EMHSLU (UG-21). Supersedes D-DM-22's "name glimepiride" (keep its "never propose glibenclamide", which is safer than 2026's under-60 silence). Add an amber flag: pioglitazone at 60 or over or with osteoporosis.

**UG-20. Who gets an SGLT2 inhibitor or GLP-1 RA.** Guideline: first line with metformin for "High risk of ASCVD" (footnote: overweight or obesity, hypertension, dyslipidaemia, hyperuricaemia, albuminuria, 10-year risk >20%), "Established ASCVD", "Renal dysfunction", "Heart failure (regardless of the ejection fraction)"; at "IV, secondary, & tertiary levels" (p. 32). Pack: RX-05 (established CVD or heart failure) and RX-05B (confirmed CKD) only, at referral sites, as "refer for consideration" (D-DM-21).
Consequence: under 2026 most adults with type 2 diabetes in clinic qualify (overweight or hypertension alone); the pack prompts a small subset, and only at referral sites.
Recommendation: CSO decision, two parts. (a) Trigger: follow 2026 (add albuminuria, hypertension, dyslipidaemia, overweight/obesity, hyperuricaemia, high calculated risk). (b) Where: D-DM-21 (signed) restricts to referral sites, and EMHSLU 2023 stocks dapagliflozin only from regional referral hospitals (empagliflozin and semaglutide not listed). Recommend keeping "refer for consideration" below RR until the essential list changes, and saying "2026: first line with metformin" in the text.

**UG-21. Levels of care: 2026 versus EMHSLU.** Guideline: every non-insulin class in Table 8 at "IV, secondary, & tertiary levels" (pp. 31–32); insulin "mainly" at HC IV and above (p. 34). EMHSLU 2023 (sources-review §2, applied in RX-02): metformin HC3; glimepiride H; gliclazide, vildagliptin, dapagliflozin, pioglitazone RR.
Consequence: the two national documents disagree on where gliclazide, DPP-4i and SGLT2i can be started; the pack's "at a health centre refer for it" follows the stocking list.
Recommendation: keep EMHSLU for "can it be started here" (a medicine not stocked cannot be started), and name the 2026 level in the text so a stocked HC IV is not wrongly told to refer. Metformin at HC III: 2026 is silent on HC III, EMHSLU allows it — keep. CSO to sign which document governs, and to raise the conflict with the MoH.

**UG-22. When to start insulin.** Guideline: symptomatic, newly diagnosed with "FBG >14", "RBG >16.7" and/or "HbA1c ≥10%"; "≥2 results of HbA1c ≥10% ... over 6-12 months"; failure of ">2" oral agents at maximum dose; DKA; surgery; high-dose steroids; pregnancy; acute inpatient illness; contraindications to oral agents (p. 34). Pack RX-04: HbA1c **>10%** or glucose **≥16.7** on any sample (fasting included); RX-03 / REFER-TARGET-01: after metformin + a sulfonylurea (two agents).
Consequence: a symptomatic fasting 14.1–16.6, and an HbA1c of exactly 10.0%, are not prompted; steroids and inpatient illness are not insulin triggers in the pack.
Recommendation: follow 2026 thresholds and operators in RX-04 (FBG >14, RBG >16.7, HbA1c ≥10%), add the repeated-HbA1c, high-dose-steroid and contraindication triggers as review prompts. **Keep RX-03 at two agents** (pack safer and practical: a third oral agent is not stocked below RR; 2026's ">2" would delay insulin there).

**UG-23. Insulin storage and injection wording.** Guideline: "<30°C"; no fridge → "a simple, clean plastic container with dry cotton wool in a cool environment at room temperature"; "Do not store insulin in water, on the floor, or sand"; syringe and pen-needle lengths; rotate abdomen, thigh, buttocks, outer arm; inject perpendicularly; change the needle "ideally" daily (pp. 35–37). Pack EDU-05: EADSG wording (signed today), "check ... injection sites", clay pots avoided.
Consequence: small; the two agree; the guideline adds practical detail (cotton wool, floor and sand, needle length) and does not mention clay pots.
Recommendation: follow 2026: add "with dry cotton wool", "not on the floor or in sand", "below 30 °C", the needle lengths and site rotation to EDU-05; keep the EADSG fridge, 4–6-week and clay-pot lines (2026 silent on them).

**UG-24. Blood-pressure medicines and the referral point.** Guideline (p. 39): <150/90 without renal disease or CVD → one agent (ACEi, ARB, CCB or thiazide); with renal disease or CVD → ACEi or ARB; ≥150/90 → two agents (ACEi/ARB + CCB first line); third class; then MRA, then "Refer to a HT specialist"; beta-blockers only with compelling indications; "Avoid using loop diuretics such as furosemide as a BP-lowering therapy." Pack: RX-07 "review blood pressure treatment"; REFER-BP-02 "Blood pressure above 130/80 on two medicines: routine referral"; REF-DM-CVD-BP-2DRUG-SBP/DBP 150/90 unused.
Consequence: the pack gives no class guidance and refers after two drugs, earlier than 2026 (after three plus an MRA) — more referrals, not less safety.
Recommendation: follow 2026 in RX-07's text (class by BP level and renal/CVD status; two agents from 150/90 — the refs exist). Referral point: CSO; recommend keeping two medicines at HC III/IV (whether a third and fourth class are stocked there was not checked) and 2026's point (three plus an MRA) at hospital level. Add amber flags for a loop diuretic used for blood pressure alone, and for a beta-blocker without a listed indication. The hypertension pack may own this (D-DM-39).

**UG-25. ACEi/ARB for albuminuria without hypertension.** Guideline: do not use them for DKD prevention "without co-existing hypertension and/or albuminuria" (p. 49), i.e. use them with albuminuria; type 1: confirmed UACR ≥3 → "Initiate ARB or ACEI therapy" (p. 67). Pack RX-08: albuminuria **and** raised BP.
Consequence: normotensive confirmed albuminuria is not prompted.
Recommendation: follow 2026: RX-08 fires on confirmed albuminuria (2 of 3) whatever the BP; the pregnancy and could-conceive flags already cover the teratogenicity counselling 2026 asks for.

**UG-26. Statins and lipid targets.** Guideline: 20–39 with CVD risk factors → consider a statin; 40–75 → moderate intensity, high intensity with ≥1 risk factor; >75 → moderate after benefit-risk; established CVD → high intensity **plus ezetimibe** at once; all DKD on a statin; PLHIV at low–moderate risk on a statin; LDL <1.8 (CVD or high risk), <2.6 otherwise; re-check 4–12 weeks after starting (pp. 40–42, 50, 79). Pack RX-06: type 2, 40 or over, not on a statin (WHO); REF-DM-CVD-LDL-ASCVD 1.4 (unused) and -LDL-HIGHRISK 1.8 (unused); yearly lipids.
Consequence: adults under 40 with risk factors or kidney disease are not prompted; no intensity, ezetimibe or LDL target.
Recommendation: follow 2026 as review prompts with intensity words but no dose (D-DM-31): add under-40 with a CVD risk factor; any age with DKD; secondary prevention "high intensity, add ezetimibe"; LDL targets 1.8 / 2.6 (set REF-DM-CVD-LDL-ASCVD to 1.8 or retire it); lipid re-check 4–12 weeks after starting. Statin flags in pregnancy and could-conceive stay.

**UG-27. Eye recall for mild retinopathy.** Guideline: "annually for mild to moderate NPDR" (p. 51). Pack: mild NPDR 12 months, **24 months if control is confirmed** (ICO's far end; D-DM-14 signed).
Consequence: a person with mild retinopathy and confirmed control waits two years instead of one.
Recommendation: follow 2026: mild NPDR yearly whatever the control (drop the 24-month option). Supersedes that part of D-DM-14. Moderate stays at the pack's 6 months (safer than 2026's 12).

**UG-28. Children and adolescents with type 1: chronic-care screening.** Guideline Table 16 (pp. 67–68): kidney, nerves and eyes from puberty or age 11 (whichever earlier for kidney) after 2–5 years' duration, then yearly (eyes every 2 years, or 3 if none); BP at each visit with percentiles (treat to <90th); lipids from 11 (from 2 with a family history), every 3 years if normal; autoimmune screening at diagnosis (thyroid, coeliac, Addison's, pernicious anaemia, autoimmune hepatitis); TSH in type 1 (Table 5). Pack: screening steps are adult-only; type 1 start 5 years after onset (refs unused); no paediatric BP, lipid or autoimmune content.
Consequence: a 12-year-old with 3 years of diabetes gets no kidney, eye or nerve screening prompt.
Recommendation: follow 2026: extend DM-ACT-SCREEN-KIDNEY/EYE/NEURO to under-16s with type 1 from age 11 or puberty after 2 years' duration; add yearly TSH and an at-diagnosis autoimmune screen; paediatric BP by percentile needs a percentile table (separate work).

**UG-29. Children and adolescents with type 1: targets and monitoring.** Guideline: RBG 4.0–10.0, FBG 4.0–7.0, HbA1c <7% every three months, glucose 4–6 times a day (p. 62). Pack: no child-specific targets.
Consequence: no target or band is proposed for a child with type 1.
Recommendation: follow 2026: add child/adolescent type 1 targets and the 3-monthly HbA1c (UG-17).

**UG-30. A child with unexplained vomiting.** Guideline: "routinely perform fingerstick blood glucose measurement for children or adolescents presenting with unexplained reduced levels of consciousness, rapid breathing, abdominal pain, nausea, and vomiting without diarrhoea" (p. 64). Pack: for a child not known to have diabetes, a glucose is prompted for deep breathing or drowsiness (ROUTE-15), thirst/polyuria/enuresis (PAED-01) and weight loss (PAED-02); vomiting or abdominal pain alone prompts nothing (ROUTE-04 needs a feature of diabetes or a glucose).
Consequence: new-onset DKA presenting as "gastroenteritis" or "malaria" is missed — the guideline's stated reason for the rule.
Recommendation: follow 2026: add a same-day (immediate if any danger sign) rule "child or adolescent with vomiting without diarrhoea, or unexplained abdominal pain, and no glucose on record: capillary glucose now". Run it past the escalation-floor grid (D-DM-41) before it ships.

**UG-31. Glucose at which to suspect HHS.** Guideline: "Hyperglycaemia (≥30 mmol/l or ≥540 mg/dl)" (p. 44). Pack DM-ACU-ROUTE-14: ≥33.3 or HI (REF-DM-ACU-HHS-GLU).
Consequence: a glucose of 30.0–33.2 without signs gets same-day review (ROUTE-01, -34B, REFER-GLU-02) instead of an immediate route.
Recommendation: follow 2026 (more sensitive): REF-DM-ACU-HHS-GLU 30.0. Check the interrupt load in the shadow logs first.

**UG-32. DKA reference values.** Guideline: bicarbonate <15, pH <7.3, ketones ">3.0" or ">2+" (p. 44). Pack: REF-DM-ACU-DKA-HCO3 **18** (unused), -PH 7.3, triage at urine 2+ or blood ≥3.0.
Consequence: none now (HCO3 is unused); the triage thresholds are more sensitive than 2026's.
Recommendation: keep the pack's triage thresholds (safer). Set REF-DM-ACU-DKA-HCO3 to 15 (2026) before any item uses it.

**UG-33. Health centre III: start fluids, then refer.** Guideline: "Healthcare professionals at health centre III should initiate fluid therapy and then promptly refer the patient" (p. 44). Pack: route only; "no fluid or insulin content" (ROUTE-04 note); "the treatment is owned by the acute pathway".
Consequence: an HC III clinician routing a DKA/HHS patient is not told to start intravenous fluids before a transfer that can take hours.
Recommendation: follow 2026: add "start intravenous fluids before transfer (the 2026 guideline's regimen, p. 46 for adults, p. 65 for children)" to the route actions of ROUTE-02, -11, -14, -24, -24B at HC III and HC IV sites without inpatient care. Volumes stay in the acute pathway, not the pack (D-DM-31). CSO to confirm the acute pathway carries the 2026 regimen.

**UG-34. Hyperglycaemia in hospital.** Guideline: screen every admitted medical and surgical patient with RBG and HbA1c; start treatment only if persistently >10; targets 7.8–10.0 (critical) and 5.6–10.0 (non-critical); avoid sliding scales, premixed insulin, metformin, sulfonylureas and TZDs in hospital (pp. 56–57). Pack: DM-SUS-INPT-01 only after a glucose >7.8; no inpatient targets or cautions.
Consequence: undiagnosed diabetes on admission is found only if someone happens to measure a glucose; inpatient prescribing gets no warnings.
Recommendation: follow 2026: an admission prompt (RBG, plus HbA1c where valid), inpatient targets, and amber flags for metformin, sulfonylureas, pioglitazone, premixed insulin and sliding-scale-only insulin in inpatients. Needs a care-setting input the pack already has (`care_setting`).

**UG-35. Before surgery.** Guideline: elective HbA1c <8%; glucose 5.6–10.0 within 4 hours of surgery; hold metformin on the day; stop SGLT2i "3-4 days before surgery"; hold other oral agents that morning (p. 58). Pack: flag `sglt2_before_surgery_or_fast` (ADA, no number of days).
Consequence: small; the timing is missing.
Recommendation: follow 2026: add "3–4 days before" to the SGLT2 flag and a metformin "hold on the day of surgery" line; HbA1c <8% before elective surgery as a referral note.

**UG-36. Glucose screening in people living with HIV.** Guideline: before ART and while on ART, "every six months" (p. 79). Pack DM-SUS-POP-HIV-01: on ART, yearly; the before-ART and after-switch rules are Design B (skipped).
Consequence: half the screening frequency, and no screen before ART starts.
Recommendation: follow 2026: 6 months (rule fires at ≥6 months since the last glucose); add a "starting ART" trigger to the live rule, as Design B no longer carries it.

**UG-37. Dolutegravir.** Guideline: "Avoid dolutegravir in individuals with diabetes and HIV comorbidity" (p. 79). Pack: never proposes an ART change; "discuss with the ART clinic" (D-DM-33, signed); DM-SUS-POP-DTG-01 (glucose test); flag `dolutegravir_with_metformin` (UCG 2023 HIV chapter).
Consequence: the 2026 guideline asks the diabetes clinician to avoid the national first-line ART drug; acting on it unilaterally could disrupt HIV treatment, and ignoring it leaves the clinician unaware of the national diabetes guidance.
Recommendation: **keep D-DM-33** (never propose an ART change: ART belongs to the HIV programme, whose current guidance is not read). Add the 2026 sentence, with its source, to the DTG rule and flag, ending "discuss with the ART clinic". CSO to raise the conflict with the MoH HIV programme.

**UG-38. Diabetes screening in TB.** Guideline: RBG first; then FBG (preferred) or HbA1c "if the RBG level is ≥6.1 mmol/l"; at TB diagnosis (p. 80). Pack DM-SUS-POP-TB-01: a fasting glucose for everyone with TB of unknown status.
Consequence: small; the pack's fasting test is a reasonable first test but does not match the national two-step, and a non-fasting patient at TB diagnosis gets no immediate test.
Recommendation: follow 2026: propose an RBG at TB diagnosis; RBG ≥6.1 → FBG (or HbA1c where valid). Keep the "re-check after the first month" caveat.

**UG-39. TB screening in diabetes.** Guideline: screen for TB "at the time of diagnosis or on presentation with symptoms of TB" with smear, GeneXpert or chest X-ray (p. 80). Pack DM-ACT-SCREEN-TB-01: only for cough >2 weeks.
Consequence: TB without a long cough at diabetes diagnosis is not looked for (diabetes triples the odds of TB, p. 79).
Recommendation: follow 2026: a TB screen at diabetes diagnosis (symptom screen at minimum, with a test where available), plus the existing cough rule.

**UG-40. Diabetes treatment during TB, and the rifampicin flag.** Guideline: rifampicin lowers "metformin, sulfonylureas, and DPP-IV inhibitors by 30-80%"; insulin first line with severe hyperglycaemia (HbA1c ≥10, FBG ≥14, RBG ≥16.7); metformin first line if overweight; SU or DPP-4i if BMI <25 (p. 81). Pack flag `sulfonylurea_with_rifampicin`: "Rifampicin lowers sulfonylurea levels ... Insulin is not affected; WHO keeps metformin as the initial medicine during TB treatment."
Consequence: the flag tells a clinician that metformin is the TB first line for everyone and does not warn that metformin and DPP-4i levels fall too.
Recommendation: follow 2026: extend the flag to metformin and DPP-4i with rifampicin, and replace the WHO sentence with the 2026 choice by severity and BMI (insulin if severe). Keep `tgt_hba1c_tb` (WHO; 2026 silent).

**UG-41. Neuropathic pain medicines.** Guideline lists "gabapentin, pregabalin, duloxetine, carbamazepine, valproic acid, tramadol, and antioxidants such as alpha-lipoic acid" (p. 51). Pack RX-12: "ADA names the first-line classes; opioids are not among them".
Consequence: wording conflict: the national list includes tramadol (an opioid) without ranking; the pack implies opioids are wrong.
Recommendation: keep the pack's caution (ADA: opioids are not first line; 2026 does not rank) but cite the 2026 list: "the 2026 guideline lists gabapentin, pregabalin, duloxetine, carbamazepine, valproate, tramadol and alpha-lipoic acid; opioids such as tramadol are not first line (ADA)".

**UG-42. Vitamin B12 on metformin.** Guideline: B12 yearly "if on long-term and high-dose metformin" (p. 28). Pack DM-ACT-SCREEN-B12-01: only with numb or burning feet.
Consequence: deficiency is found only after neuropathy symptoms.
Recommendation: follow 2026 at sites that can measure B12 (secondary and tertiary, Table 3): yearly on long-term metformin; keep the symptom rule everywhere.

**UG-43. Initial and annual evaluation items the pack does not prompt.** Guideline Table 5 (pp. 27–28): HIV serology at the initial visit; psychosocial screen (depression, anxiety, diabetes distress) initially and yearly; oral/dental examination; waist circumference; serum potassium on ACEi/ARB/diuretics (initial, yearly); TSH/FT4 in type 1 and selected type 2; full blood count; liver tests; preconception counselling at every visit. Pack: none prompted (K+ only reactively; REF-DM-ACT-DENTAL unused).
Consequence: in Uganda the HIV test is the most consequential gap (it changes HbA1c validity, statin and ART-interaction decisions).
Recommendation: follow 2026: add an initial-visit checklist, HIV serology first; yearly potassium on ACEi/ARB/diuretics; yearly psychosocial screen and dental check. CSO to choose which become prompts and which stay as a clerking checklist.

**UG-44. Education content: food, supplements, self-monitoring.** Guideline: seven self-care behaviours; the plate with local foods; "avoid honey, processed juices, and sugar"; no chromium, vitamin D, cinnamon or aloe vera supplements; alcohol limits; SMBG frequency by regimen (Table 7) (pp. 23, 25, 26, 30). Pack EDU-01: generic; "The pack carries no food list: no official Ugandan guidance on local staples was found"; REF-DM-ACT-SMBG unused.
Consequence: patients get no national food or monitoring guidance from the pack.
Recommendation: follow 2026: EDU-01 carries the plate and the avoid-list (the official Ugandan guidance the note asked for); a self-monitoring line by regimen for people on insulin.

**UG-45. Prevention.** Guideline: "a 7% body weight reduction" and ≥150 minutes a week; metformin to prevent type 2 diabetes "especially in individuals aged 25-44 years, with a BMI ≥35 kg/m2, and women with a prior history of gestational diabetes" (pp. 23–24). Pack: EDU-10 (weight, activity, yearly test); REF-DM-ACT-EDU-WEIGHT 5%; no preventive metformin.
Consequence: small; a lower weight goal than the national one, and no prompt for preventive metformin.
Recommendation: follow 2026: REF-DM-ACT-EDU-WEIGHT 7% for prevention; a review prompt "consider metformin" for intermediate hyperglycaemia with age 25–44, BMI ≥35 or prior GDM (no dose).

**UG-46. Peripheral arterial disease.** Guideline: screen type 2 diabetes over 50 at diagnosis and yearly; HbA1c <8%, "blood pressure (<140/90 mmHg)", LDL <1.8; antiplatelet and high-intensity statin; SGLT2i or GLP-1 RA; aspirin plus low-dose rivaroxaban with low bleeding risk (p. 55). Pack: pulses in every foot assessment; DM-ACT-REFER-PVD-01 (routine), -LIMB-01 (today); BP target <130/80 (D-DM-23).
Consequence: the 2026 PAD page conflicts with its own BP target (<130/80, p. 38); following it would relax BP control in PAD.
Recommendation: keep <130/80 (signed D-DM-23; 2026's own general target); keep pulse checks for everyone (broader than ">50"). Add to RX-09/RX-06 that PAD counts as established ASCVD (antiplatelet, high-intensity statin); aspirin with low-dose rivaroxaban stays a referral-level decision (not checked against EMHSLU 2023).

---

### Also noted (no decision needed)

- Internal inconsistencies in the guideline to raise with its authors: FBG "≥7.1" for type 1 (p. 60) vs "≥7.0" (p. 18); Figure 12 "and" (p. 71) and its two "Unable to perform an OGTT" boxes; postpartum OGTT (p. 74) vs FBG (p. 77); BP <140/90 in PAD (p. 55) vs <130/80 (p. 38); the adult neuropathy screening start copied from the paediatric table (p. 51); type 1 eye re-screen "every two years" vs "every 3 years if no signs of DR" (p. 67); hypoglycaemia "≤3.9" (p. 63) vs "<3.9" (p. 43).
- Sources-review §4 (older-adult glucose floor): the 2026 summarised version is silent; decide on ADA 2026 alone.
- Sources-review §6 (RX prompts): answered in the table in section 6 and by UG-18 to UG-26 and UG-41.
- The comprehensive version of the 2026 guideline was not read; it may resolve some of the above (risk-factor list for screening, referral thresholds, sick-day rules).
