# Lab Phase 3 research notes (13 Oct 2026)

Two research strands for the Phase 3 prompt. Part A covers Uganda HMIS laboratory reporting, registers and stock tools. Part B covers QC, EQA, reagents, equipment and quality indicators. Confidence is marked on each item. Everything here was read from the linked sources; anything unverified says so.

---

# Part A

Researched 2026-10-13. Method: sources were opened through a web-fetch tool that extracts PDF text. Direct downloads (curl) were blocked by the egress proxy, so no PDF was rendered page by page. Row labels below are the fetch tool's transcription of the PDF text. They were **not** compared visually against the printed form, so spelling (for example "Shistosoma", "Askaris", "Borrellia", "Comb's") may be the form's own or an extraction artefact. Before you hard-code anything, check it against a printed HMIS 105 or the DHIS2 data-element list (eHMIS: hmis.health.go.ug, which needs a login).

Confidence levels: **H** = read in a primary MoH document; **M** = primary document, but older version or partly extracted; **L** = secondary source or inference.

---

## 1. HMIS 105, Health Unit Outpatient Monthly Report

**Source opened:** HMIS 105 form, "Print Version September 2019" (some page headers read "September 20019", a typo). This is the form rolled out in the 2020 HMIS revision. It is hosted by Malaria Consortium:
https://www.malariaconsortium.org/gallery-file/06081045-69-hmis105healthunitoutpatientmonthlyreport.pdf (**H** for structure, **M** for exact spelling)

### Where the lab section sits

The laboratory content is **Section 10: LABORATORY** (pp. 25–29). It is **not** Section 6. In this version, Section 6 is _Essential Medicines and Health Supplies_.

The older pre-2020 HMIS 105 had _Section 6 = stock status_ and _Section 7 = laboratory tests_. This is confirmed in CPHL's Lab SPARS guide (2017): https://cphl.go.ug/web/sites/default/files/2024-10/Lab%20SPARS%20Data%20Collection%20%26%20Support%20Supervision%20Guide%2024062017.pdf. CPHL's 2017 notice board also calls the lab part "HMIS 105-6". Do not mix the two versions.

Section list (2019 print version):

1. OPD Attendances, Referrals and Diagnoses
2. Maternal and Child Health
3. Hepatitis
4. HTS
5. SMC
6. Essential Medicines and Health Supplies
7. Outreach
8. Meetings
9. Support Supervision
10. Laboratory
11. Financial summary (referenced only)
12. Comments by Health Facility In-charge

Instruction on the form: Section 10 data is "obtained from Table 17a (Laboratory Tests Daily Summary)".

### 10.1 Lab visits and specimens

| Item    | Content                                                                                 |
| ------- | --------------------------------------------------------------------------------------- |
| Rows    | LV01 Outpatient (OPD); LV02 Inpatient (IPD); SC01 Collected (IN); SC02 Received (OUT)   |
| Columns | Blood; Stool/Rectal swab; Urine; Sputum; CSF; Pus Swab; Genital Swab; Skin Snip; Others |

Inpatient lab visits are reported here, on HMIS 105.

### 10.2 LABORATORY ROUTINE TESTS

Sub-heading: 10.2.1 Number of Routine Tests Done in Facility Laboratory.

Columns are **Lab Tests | Number Done | Number Positive**, printed as two side-by-side blocks. There is **no age or sex split** in this table. The text extraction could not show which "Number Positive" cells are shaded out.

**HAEMATOLOGY (BLOOD)**

- HE01 Hb (Non automated)
- HE02 CBC
- HE03 Film Comment
- HE04 ESR
- HE05 Bleeding time
- HE06 Prothrombin time
- HE07 Clotting time
- HE08 Sickle Cell
- HE09 Others

**BLOOD TRANSFUSION**

- BT01 AHG (Comb's Test)
- BT02 ABO Grouping
- BT03 Rhesus Grouping
- BT04 Cross Matching

**SEROLOGY**

- SR01 VDRL/RPR
- SR02 TPHA
- SR03 Shigella Dysentery
- SR04 Hepatitis B SAgS
- SR05 Brucella
- SR06 Pregnancy Test (HCG)
- SR07 CRAG
- SR08 Rheumatoid factor
- SR09 Hep B Core Ag
- SR10 Hep C
- SR11 Hep A

**MICROBIOLOGY (CSF, URINE, STOOL, BLOOD, SPUTUM, SWABS)**

- MB01 Auramine (FM) for AFBs
- MB02 ZN for AFBs
- MB03 Leishman Stain
- MB04 Gram
- MB05 India Ink
- MB06 Urine Microscopy
- MB07 Wet Preps
- MB08 Others

**IMMUNOLOGY**

- IG01 CD4 test
- IG02 Viral Load Test
- IG03 Hep B Viral Load
- IG04 TB LAM

**MOLECULAR**

- ML01 TB Genexpert (For Genexpert sites only), with sub-labels MTB+ and RR
- ML02 Latent TB Infection test
- ML03 TB Lamp Test

**PARASITOLOGY (Blood)**

- PS01 Malaria Microscopy
- PS02 Malaria RDTs
- PS03 Trypanosoma
- PS04 Microfilaria
- PS05 Leishmania
- PS06 Trichinella
- PS07 Borrellia

**STOOL MICROSCOPY**

- MS01 Entamoeba
- MS02 Giardia Lumblia
- MS03 Cryptosporidium
- MS04 Isospora
- MS05 Cyclospora
- MS06 Strongyloides
- MS07 Shistosoma
- MS08 Taenia
- MS09 Askaris
- MS10 Hookworm
- MS11 Trichuris
- MS12 Other parasites
- MS13 Total Tests Done for Stool Microscopy

Because MS13 exists separately, MS01–MS12 are positives by organism, while MS13 is the number of stool microscopy tests done. That is an inference. Verify it on the printed form.

**CLINICAL CHEMISTRY**

- Renal Profile:
  - RP01 Urea
  - RP02 Calcium
  - RP03 Potassium
  - RP04 Sodium
  - RP05 Creatinine
- Liver Profile:
  - LP01 ALT
  - LP02 AST
  - LP03 Albumin
  - LP04 Total Protein
- Lipid/Thyroid Profile:
  - LC01 Triglycerides
  - LC02 Cholesterol
  - LC03 Free T3
  - LC04 Free T4
  - LC05 TSH
- Other:
  - CX01 Alkaline Phosphate
  - CX02 Amylase
  - CX03 Glucose
  - CX04 Total Bilirubin
  - CX05 Lipase
  - CX06 AFP
  - CX07 Others

The renal and liver profiles are counted **per analyte**, not as "RFT" or "LFT" panels.

**CULTURE & SENSITIVITY**

- CS01 Blood
- CS02 Urine
- CS03 Stool
- CS04 Genital Swabs
- CS05 Sputum

### Malaria age splits

- **Lab section:** PS01 and PS02 have Number Done and Number Positive only, with **no <5 / ≥5 split**.
- **Section 1.3.1 Epidemic-Prone Diseases (p. 1):**
  - Rows: EP01a Suspected fever; EP01b Malaria total; EP01c Malaria confirmed (B/s and RDT positive); EP01d Malaria cases treated.
  - Split by sex and by age bands 0–28 d, 29 d–4 y, 5–9, 10–19, 20+.
  - This is a diagnosis count, not a lab count. There is no "tested" row by age.

### 10.3 SUMMARY OF HIV TESTS BY PURPOSE

| Item               | Content                                                                                                                                                 |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Rows (kits)        | Determine; Statpak; SD Bioline; HIV Syphilis DUO; Oraquick (Self Testing)                                                                               |
| Columns (purposes) | HCT; eMTCT; Clinical Diagnosis; SMC; Test for Verification; Recency Testing; IQC; EQA; Total; Inconclusive Results; Repeat Testers; DNA Confirmed Tests |

The IQC and EQA columns mean QC tests **are** counted here, separately by purpose. Syphilis appears both as SR01/SR02 and as the DUO kit row.

### 10.4 REFERRAL TESTING (10.4.1 Volume of Sample Referred)

Columns: Type of Test | No. of Specimen Referred | Average Turn Around Time (Days) | No. of Pending Results/Feedback

| Group        | Rows                                                                                                                                                                                                                                                                               |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Virology     | VS01 EID; VS02 Viral Load for HIV; VS03 CD4; VS04 Sickle Cell Disease Confirmation; VS05 Histology; VS06 Polio/AFP; VS07 SARS/SARI; VS08 TB GeneXpert; VS09 DST for MDR TB                                                                                                         |
| Microbiology | VS10 Typhoid; VS11 Cholera; VS12 Dysentery; VS13 Rota Virus; VS14 Meningitis; VS15 Neonatal tetanus; VS16 Plague; VS17 Isolates; VS19 VHF; VS20 Animal bites (suspected rabies); VS21 Suspected outbreak samples; VS22 Hep B core Ag; VS23 Hep B Viral Load; VS24 Hep C Viral Load |
| Parasitology | VS25 Hemo parasites; VS26 Intestinal parasites; VS27 Tissue parasites                                                                                                                                                                                                              |

VS18 was absent from the extracted text. This may be an extraction gap.

### 10.5 Routine tests not conducted at facility and referred

Columns:

- Routine Test Type (specify)
- Equipment break down
- Reagent stock out
- Supplies stock out
- Power outage
- No testing expertise
- Lack of required equipment
- Confirmatory testing
- For QA re-testing
- Others

### 10.6 AMR SURVEILANCE

10.6.1 National Priority AMR Organisms, plus other organisms. Reports isolate counts with R/I/S results by antibiotic. The full antibiotic list was not extracted.

### 10.7 LABORATORY SPECIMEN REJECTION

| Item    | Content                                                                                                                                                                                                                                   |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Rows    | RS01 Inadequate specimen volume … RS14 Other reasons, plus Totals. Rows seen include: Hemolyzed specimen; Specimen without lab request form; Wrong/Unclear specimen label; Too old specimen; Specimen type unacceptable for required test |
| Columns | Blood; Stool/Rectal Swab; Urine; Sputum; Pus Swab; Genital Swab; Skin snip; Others                                                                                                                                                        |

Not all of RS02–RS13 were extracted. Rejected specimens are reported here, so they should not also appear as "done" in 10.2. That last point is an inference; no MoH text says it.

### Other HMIS 105 rows that touch the lab

- **Section 6 stock status (Table 6.1):** columns are SN, Name, Unit, Quantity consumed, Days out of stock, Stock on hand, Quantity expired. Lab tracer items:
  - SS07 Determine HIV 1&2
  - SS08 Stat-pak
  - SS09 SD Bioline tie-breaker
  - SS10 CD4 reagent
  - SS11 Malaria RDTs
  - SS12 GeneXpert cartridges
  - SS26 Blood 450 ml
- **Section 1.4 TB:** rows TP01–TP07, with age bands <5, 5–9, 10–14, 15–19, 20+ split by sex. These cover screening, presumptive and diagnosed cases. There is no sputum-test row.

## 2. HMIS 108 and recent changes

- **HMIS 108 "Health Unit Inpatient Monthly Report" exists.** Sources: the 2010 HMIS Health Unit Procedure Manual Vol. 1, p. 312 (https://www.gou.go.ug/sites/default/files/media-files/THE%20HEALTH%20MANAGEMENT%20INFORMATION%20SYSTEM_0.pdf), and the Streamline EMR list (secondary). (**H** that it exists)
- **I could not open an HMIS 108 form**, so I cannot confirm whether it has lab rows. (**unknown**)
  - The 2010 manual also lists "Table 7 Surgical Operations, X-Ray, Investigation Services and Inpatient Referrals" (p. 267) in the inpatient module. Whether that feeds HMIS 108 is unverified.
  - HMIS 105 §10.1 LV02 explicitly captures **inpatient** lab visits. Together with "Table 17a", this suggests all lab test counts, OPD and IPD, go on HMIS 105 §10. (**M/L**)
- **2023–2025 changes to the HMIS 105 lab section:** I found **no** published MoH source showing a revision after the September 2019 print version. Searches covered MoH, CPHL, METS and DHI. This is not proof that none exists. MoH sometimes adds DHIS2 data elements without reprinting the form, so check the live eHMIS 105 dataset. (**L**, absence of evidence)

## 3. Laboratory registers and request forms

**Primary source: HMIS Health Unit Procedure Manual Vol. 1, August 2010 (MoH)**, list of forms (gou.go.ug link above). (**M**: these are 2010 numbers and may have been renumbered in 2020.)

| Tool                                                                         | Page in manual                                                                                                            |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| HMIS 055A1 Daily Activity Lab Register for HC II & III                       | p. 214                                                                                                                    |
| HMIS 055A2 HC IV Daily Activity Lab Register for General Analysis            | p. 218                                                                                                                    |
| HMIS 055A3 General Hospital Daily Activity Lab Register for General Analysis | p. 222                                                                                                                    |
| HMIS 055A4 Daily Activity Register for Recording HIV Tests                   | p. 226                                                                                                                    |
| HMIS 089 TB Laboratory Register                                              | p. 230                                                                                                                    |
| HMIS 090 Clinical Chemistry Register                                         | p. 233                                                                                                                    |
| HMIS 091B Blood Transfusion Record                                           | p. 236. The number 091B is also listed for the Inpatient Tally Sheet, so the numbering is inconsistent.                   |
| HMIS 092 Other Serological Tests and Viral Load                              | p. 239                                                                                                                    |
| HMIS 093 Microbiology and Serology Hospital Lab Register                     | p. 242                                                                                                                    |
| HMIS 094 Haematological Indices                                              | p. 247                                                                                                                    |
| HMIS 095 CD4 Count                                                           | p. 250. The number 095 is also used for the VHT/ICCM Register.                                                            |
| Table 17 Laboratory Tests Monthly Summary                                    | p. 253                                                                                                                    |
| HMIS 055B HIV Counselling & Testing Register                                 | p. 84                                                                                                                     |
| Annex I: HMIS 018B1 NMS/JMS General Laboratory Report and Order Form         | p. 365. This is an **order form for supplies**. The fetch tool's description of it as "the lab request form" is doubtful. |
| Annexes II–III: Request Forms for Sputum Examination                         | pp. 372–373                                                                                                               |

- **Register columns: NOT obtained.** The fetch tool extracted only the first ~40 pages of the 393-page manual, so pp. 214–254 were not readable. No column list is reported here.
- **No numbered general "Laboratory Test Request Form" was found.**
  - CPHL's HMIS Tools Review Workshop page (https://cphl.go.ug/node/246, year not stated) names the standardised paper lab tools without numbers. It also says they are passed to MoH DHI to be folded into the HMIS tools. The tools it names:
    - laboratory request form
    - sample rejection form
    - laboratory results report form
    - sample referral form
    - sample reception register
    - hub register
    - HC III daily activity register
    - HC IV/GH daily activity register
    - HIV consumption log
    - CD4 and VL register
    - TB request form and register
    - haematological indices register
    - clinical chemistry register
    - blood bank register
    - microbiology request/results form and daily activity register
    - monthly/quarterly lab reports
  - Basajja and Nambobi (Data Intelligence, ~2022, https://direct.mit.edu/dint/article/4/4/882/112748) also describe an un-numbered "Lab Request Form" and "Laboratory Register". (**L**)
- HMIS 105 (2019) says Section 10 is filled from **"Table 17a (Laboratory Tests Daily Summary)"**. This matches the 2010 Table 17 lab summary. (**H**)

## 4. Reporting rules

| Rule                                                                                                           | Source                           | Confidence |
| -------------------------------------------------------------------------------------------------------------- | -------------------------------- | ---------- |
| HMIS 105 "Timing: 7th day of the following month"                                                              | HMIS 105 (2019) instructions     | H          |
| Completed by the Health Unit In-Charge, who signs with name, title, signature, phone, email and date           | HMIS 105 (2019)                  | H          |
| Triplicate: white copy to the District (or DHO/KCCA for RRH/NRH), pink to the HSD, yellow kept at the facility | HMIS 105 (2019)                  | H          |
| Section 12 comments are also written in the unit logbook                                                       | HMIS 105 (2019)                  | H          |
| Report type: National, Refugee or Foreigner                                                                    | HMIS 105 (2019)                  | H          |
| DHIS2 entry by the facility if it has access, otherwise by the HSD or district                                 | Basajja and Nambobi              | L          |
| No DHIS2-specific deadline found in a primary source                                                           | 2010 manual predates DHIS2       | —          |
| Counting unit is "Number Done" per test type, and per analyte for chemistry                                    | Inferred from the row structure  | M          |
| No MoH text found on per-test vs per-patient counting, or on repeats                                           | HMIS 105 instructions are silent | —          |
| IQC and EQA HIV tests are counted in separate 10.3 columns                                                     | HMIS 105 §10.3                   | H          |
| Rejected specimens are reported in 10.7                                                                        | HMIS 105 §10.7                   | H          |
| Referred-out tests go in 10.4/10.5, not 10.2 ("Tests Done in Facility Laboratory")                             | HMIS 105 §10.2 heading           | H          |
| CPHL Lab SPARS: reported figures are verified against registers and stock cards                                | Lab SPARS guide (2017)           | M          |

## 5. A-LIS

**Source:** "Guidelines for Using ASLM-Laboratory Information System (A-LIS)", Version 3, June 2021, MoH/CPHL (UNHLS). https://cphl.go.ug/web/sites/default/files/2024-10/ALIS%20User%20Guide.pdf (**H**)

- **HMIS 105 output:**
  - §3.3.3.7 "HMIS105 Report": "This is an auto generated required monthly report".
  - FAQ 3: it summarises data by the HMIS 105 lab section for printing, and "will later be able to upload data to DHIS2". In other words, there was **no direct DHIS2 push** as of v3.
  - FAQ 10: 033A and 033B are planned for the next build. The foreword nevertheless lists HMIS 105-6, 033A and 033B as outputs, which is inconsistent.
- **Other reports:**
  - patient lab history
  - general test result report (interim and final)
  - daily log
  - positivity rates
  - surveillance report
  - counts (tests and specimens, grouped and ungrouped)
  - turnaround time
  - test summary
  - user statistics
  - biosafety report
  - stock levels
  - equipment performance (listed as "coming later")
- **Request fields:**
  - visit type (OPD/IPD)
  - ward/unit/clinic
  - bed no. (IPD)
  - clinical notes
  - previous therapy
  - current therapy
  - sample type
  - lab section
  - tests selected
- Patient search is by OPD/IPD number or name. The test catalogue holds measure name, type, unit and target TAT.
- §2.19 describes a monthly aggregate upload as JSON over HTTPS to a central server, without naming DHIS2.

## 6. Commodity and stock tools

From the 2010 Health Unit Procedure Manual, Module 4. (**M**: 2010 numbering. The current EMHS Manual 2019, https://library.health.go.ug/sites/default/files/resources/EMHS%20Manual_MASTER_COPY_14-Mar-2019.pdf, could **not** be opened because robots were blocked.)

- HMIS 015 Stock Card (p. 142)
- HMIS 083 Stock Book (p. 148)
- HMIS 016 Prescription and Dispensing Log
- HMIS 017 Requisition and Issue Voucher (p. 154)
- HMIS 084A Bi-Monthly Report and Order Calculation Form (p. 159)
- HMIS 085 Order Form for EMHS (p. 163)
- HMIS 087 Discrepancy Report
- HMIS 088 Expired/Spoiled Medicines Register
- Table 16 Monthly Consumption Summary
- Annex I: HMIS 018B1 NMS/JMS General Laboratory Report and Order Form (p. 365)
- Bi-monthly ordering, plus a bi-monthly "HIV test kit report" (2010 manual) (**M**)

Monthly lab reagent reporting:

- **Yes, for tracer items only.** HMIS 105 Section 6 (SS07–SS12, SS26) reports consumption, days out of stock, stock on hand and quantity expired each month. (**H**)
- No separate monthly "lab commodities consumption" HMIS form was found.
- Lab SPARS (2017) lists tracer items including ZN reagent, references "HMIS 018" and "Bi-monthly report & HIV test kit order calculation", and requires one stock card per item, with physical counts marked "PC" in red. (**M**)
- "RRF" was **not** found in MoH sources opened. Do not use it as a tool name without verification.

## Not opened or blocked

- Malaria Consortium PDF: curl was blocked, read through the fetch tool only.
- EMHS Manual 2019 (library.health.go.ug): robots disallowed.
- moam.info HMIS manual: robots disallowed.
- Scribd and Yumpu copies: needed JavaScript or returned empty.
- PMC13032546 (Teso DHIS2 study): captcha page.
- Springer s12936-026-05951-8: rate-limited (HTTP 429), not read.
- 2010 manual pp. 214–254 (lab register columns): beyond the extractable text.
- No HMIS 108 form was found online.

## Recommended verification before build

1. Get a printed or scanned HMIS 105 (2020) and HMIS 108 from the MoH DHI, or the eHMIS data-element export (dataset "HMIS 105"). Confirm the exact labels, codes and shaded "positive" cells.
2. Get the current lab register (Table 17a source) from CPHL or DHI, to confirm column layouts and whether the 055A-series numbering still applies.

---

# Part B

Compiled 2026-10-13. Every fact below was read from the linked source during this session unless it is marked **[UNVERIFIED]**. Most quotes are short extracts, and page numbers are the ones each document prints.
Confidence: **H** = read in a primary or authoritative source. **M** = read in a secondary summary, or the source was only partly readable. **L** = inferred or not found.

---

## 1. ISO 15189:2022 clause map

**Primary source:** ISO 15189:2022 (4th ed.) full text, hosted on a Brunei government site:
https://www.mofe.gov.bn/Shared%20Documents/SDT%202024/ISO%2015189;2022%20ed.4%20-%20id.76677%20Publication%20Word%20(en).pdf
(The page numbers below are the ones printed in this PDF.)

**Cross-checks:**

- SADCAS F134(c), _Assessment Cycle Matrix for Medical Laboratories – ISO 15189:2022_, Issue 1 (lists every clause from 4.1 to 8.9). https://sadcas.org/sites/default/files/2024-03/SADCAS_F134_%28c%29_-_Assessment_Cycle_Matrix_for_Medical_Laboratories_-_ISO_15189_-_2022_%5BIssue_1%5D.pdf
- NATA, _ISO 15189:2022 Standard Application Document_ (effective Feb 2026). Its contents page lists 7.3.7.2, 7.3.7.3 and 7.3.7.4 on pp. 11, 13 and 14. https://nata.com.au/files/2025/11/ISO-15189-2022-Standard-Application-Document-Effective-Feb-2026.pdf
- CAP ISO 15189 poster. https://documents.cap.org/documents/ISO_15189_Poster12x18_041323.pdf
- ASLM LabCoP ECHO slides (Jan 2023), slide 19 crosswalk: "4.14.7 Quality indicators" → "8.8.2 Quality indicators" and "5.5 d)", and "4.14.5" → "8.8.3 Internal audits". https://aslm.org/wp-content/uploads/2023/01/PPT-LabCoP-ECHO_New-ISO15189-CLSI-Jan2023-v2.pdf

| Clause  | Title                                                                                                                                                                                                                                                           | Conf.                      |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| 5.5 d)  | Objectives and policies: "The laboratory shall establish quality indicators to evaluate performance throughout key aspects" of the pre-examination, examination and post-examination processes (p. 11)                                                          | H                          |
| 6.4     | Equipment: 6.4.1 General, 6.4.2 Equipment requirements, 6.4.3 Equipment acceptance procedure, 6.4.4 Equipment instructions for use, 6.4.5 Equipment maintenance and repair (later sub-clauses such as adverse incident reporting and records were not captured) | H                          |
| 6.5     | Equipment calibration and metrological traceability: 6.5.1 General, 6.5.2 Equipment calibration, 6.5.3 Metrological traceability of measurement results                                                                                                         | H                          |
| 6.6     | Reagents and consumables: 6.6.1 General, 6.6.2 Receipt and storage, 6.6.3 Acceptance testing, 6.6.4 Inventory management, 6.6.5 Instructions for use, 6.6.7 Records (6.6.6 not captured; it is probably adverse incident reporting **[UNVERIFIED]**)            | H                          |
| 7.3.7   | Ensuring the validity of examination results: 7.3.7.1 General, **7.3.7.2 Internal quality control (IQC)**, **7.3.7.3 External quality assessment (EQA)**, **7.3.7.4 Comparability of examination results**                                                      | H                          |
| 7.4.1.3 | Critical result reports                                                                                                                                                                                                                                         | H                          |
| 7.5     | Nonconforming work (pp. 32–33)                                                                                                                                                                                                                                  | H                          |
| 8.7     | Nonconformities and corrective actions (8.7.1 Actions when nonconformity occurs)                                                                                                                                                                                | H                          |
| 8.8     | Evaluations: 8.8.2 **Quality indicators**, 8.8.3 Internal audits. The 8.8.1 "General" title was not seen directly.                                                                                                                                              | H (8.8.2/8.8.3), M (8.8.1) |
| 8.9     | Management reviews                                                                                                                                                                                                                                              | H                          |

### Requirement content a developer needs (paraphrased from the standard)

**6.6.3 Acceptance testing (p. 18)**

- Verify each new reagent formulation, new lot and new shipment before use or before results are released.
- New-lot IQC comparison is acceptable evidence. Patient samples are preferred for comparing reagent lots.
- A certificate of analysis may sometimes be enough.

**6.6.4 Inventory management (p. 18)**

- The lab must have an inventory system.
- Accepted items must be kept separate from items that are uninspected or not yet accepted.

**6.6.7 Records, kept for each reagent or consumable**

- identity
- manufacturer name, instructions, and batch or lot number
- date received and condition on receipt
- expiry date
- date of first use
- date removed from service
- acceptance records (initial and ongoing)
- for in-house preparations, also the preparer and the preparation and expiry dates

**7.3.7.2 IQC (pp. 26–28), items a) to g)**

- a) Have a documented procedure. It should detect reagent or calibrator lot-to-lot variation, avoid changing the IQC lot on the same day as a reagent or calibrator change, and consider third-party IQC material ("The use of third-party IQC material should be considered").
- b) Choose IQC material that is stable, has a matrix close to patient samples, and has concentrations near clinical decision limits.
- c) If no suitable IQC material exists, consider patient-based trending, comparison with an alternative method, or retesting of retained samples.
- d) Base IQC frequency on method stability and robustness and on the risk of harm to the patient.
- e) Record data so that trends and shifts can be detected, using statistical techniques where applicable.
- f) Review data against defined criteria at regular intervals.
- g) **Prevent release of patient results when IQC fails.** Re-examine the affected samples and evaluate results reported since the last successful IQC.

**7.3.7.3 EQA (pp. 28–29), items a) to i)**

- Participate in EQA, including for POCT.
- Have a procedure covering enrolment, participation and performance.
- EQA samples are tested by the staff who routinely test patient samples.
- Prefer schemes that meet ISO/IEC 17043 and use patient-like material.
- Consider the type of target value used: reference method, overall consensus, peer group or expert panel.
- If no EQA exists, use alternatives: sample exchange, interlaboratory comparison of identical IQC material, split or blind samples, reference materials, or retained patient samples.
- Review EQA results regularly and act when they fall outside criteria. Where the failure is clinically significant, review affected patient results and notify users.

**7.3.7.4 Comparability**

- Use a procedure to show that different methods, equipment or sites give comparable results.
- Record the comparisons and review them periodically.
- Assess the effect of any difference on reference intervals and decision limits.
- Inform users of clinically significant differences.

**7.4.1.3 Critical results**

- Notify as soon as possible.
- Record date, time, the responsible person, the person notified, the results given, verification of the communication (e.g. read-back) and any difficulties.
- Have an escalation route for when the responsible person cannot be reached.

**7.5 Nonconforming work**

- Halt examinations and withhold reports when there is risk of harm to patients ("examinations are halted, and reports withheld when there is a risk of harm to patients").
- Assess clinical impact, including on results already released.
- Revise results and notify users where needed.
- Define who authorises resumption of work.
- Take corrective action and keep records.

**NATA (Australia) application examples for 7.3.7.2 (p. 11)**

- Haematology and haemostasis: multi-level controls at least daily, or on each day of testing.
- Blood gas: two or more levels daily.
- Cartridge systems: QC each new lot, then ongoing QC at each site.
- Immunofluorescence: positive and negative control on each run.
- Microbiology ID kits: QC with each new lot.

---

## 2. Westgard multirules, Levey-Jennings, Sigma rules

**Source A:** "Westgard Rules" page. https://www.westgard.com/westgard-rules.html (the old /mltirule.htm URL redirects here). **H**

| Rule                   | Definition (quoted)                                                                                                                                                                                                     | Type                                        |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| 1-2s                   | used "when the control limits are set as the mean plus/minus 2s"; in manual use "should be used as a warning to trigger application of the other rules"; "Computer applications don't need to use the 12s warning rule" | **Warning**                                 |
| 1-3s                   | "A run is rejected when a single control measurement exceeds the mean plus 3s or the mean minus 3s control limit."                                                                                                      | Reject                                      |
| 2-2s                   | "reject when 2 consecutive control measurements exceed the same mean plus 2s or the same mean minus 2s control limit."                                                                                                  | Reject                                      |
| R-4s                   | "reject when 1 control measurement in a group exceeds the mean plus 2s and another exceeds the mean minus 2s." "**this rule should only be interpreted within-run, not between-run.**"                                  | Reject, within-run only                     |
| 4-1s                   | "reject when 4 consecutive control measurements exceed the same mean plus 1s or the same mean minus 1s control limit."                                                                                                  | Reject                                      |
| 10-x                   | "reject when 10 consecutive control measurements fall on one side of the mean."                                                                                                                                         | Reject                                      |
| 3-1s                   | "3 consecutive … exceed the same mean plus 1s or mean minus 1s"                                                                                                                                                         | Reject (variant used with 3 control levels) |
| 2of3-2s                | "2 out of 3 control measurements exceed the same mean plus 2s or mean minus 2s"                                                                                                                                         | Reject (3 levels)                           |
| 6-x / 8-x / 9-x / 12-x | 6, 8, 9 or 12 consecutive results on one side of the mean                                                                                                                                                               | Reject (variants)                           |

**Within-run versus across-run**

- 1-3s, 2-2s and R-4s "can be applied within a run" when N ≥ 2.
- "Often the 41s and 10x must be used across runs."
- "The 10x rule usually has to be applied across runs and often across materials."
- 2-2s can be applied across levels within a run, or within one level across runs (the standard reading).

**Classic versus modern use**

- In the classic 1981 multirule, 1-2s is a warning that triggers checking of the other rules.
- In the modern rules the 1-2s warning is dropped, so 4-1s is checked directly.
- Source: Westgard blog, 17 Mar 2026. https://www.westgard.com/blog/4-1s-when-is-it-violated-under-different-westgard-rules.html **H**

**Westgard Sigma Rules.** https://westgard.com/lessons/westgard-rules/westgard-rules/westgard-sigma-rules.html **H**

| Sigma | 2 control levels                                 | 3 control levels                                |
| ----- | ------------------------------------------------ | ----------------------------------------------- |
| ≥6    | 1-3s, N=2, R=1                                   | 1-3s, N=3 (1 per level)                         |
| 5     | 1-3s/2-2s/R-4s, N=2, R=1                         | 1-3s/2of3-2s/R-4s                               |
| 4     | 1-3s/2-2s/R-4s/4-1s, N=4 R=1 (or N=2 R=2)        | add 3-1s                                        |
| <4    | multirule plus 8-x, N=4 R=2 (or N=2 over 4 runs) | add 6-x, N=6 R=1 (or N=3 R=2; 9-x lets N=3 R=3) |

- Westgard also says "you don't need to interpret the 4:1s unless the method is 4 Sigma or lower" (2026 blog above).
- **Sigma formula:** "Sigma = (%TEa − |%Bias|)/%CV". Source: Westgard, Bayat & Westgard, _Clin Chem Lab Med_ 2022;60(9):e199–e201, p. e199. https://diagnostics.roche.com/content/dam/diagnostics/vn/2026/qc360/tai-lieu-tham-khao/R010.pdf **H**

**Levey-Jennings chart**

The sources give the same core definition but different collection periods. The point count agrees at 20; the time window does not.

- **WHO LQMS Handbook 2011, ch. 7 (p. 79):** "At least 20 data points must be collected over a 20–30-day period." (p. 84): "A Levey–Jennings chart can then be drawn, showing the mean value as well as +1, 2, and 3 SD." **H**
- **Westgard lesson "QC: The Levey-Jennings Control Chart":** a "minimum of 20 measurements over at least 10 days". The chart has time on the x-axis and a y-axis running from mean −4SD to mean +4SD. https://westgard.com/lessons/basic-qc-practices/lesson12.html **H**
- **Westgard blog Q&A (J.O. Westgard, 16 Jan 2017)**, which cites "The new C24-Ed4 document": "obtain a minimum of 20 measurements over a 20 day period to establish a new mean and SD." https://www.westgard.com/blog/q-a-establishing-new-control-ranges-for-unassayed-chem-controls.html **H**
- **Build default:** 20 points over 20 days. Provisional limits are allowed earlier. _Clin Lab News_ (Parnas, Aug 2015, citing C24-A3) describes a fallback of 4 runs a day for 5 days, recalculated once more data exist. https://myadlm.org/cln/articles/2015/august/quality-control-parameters **M**
- **WHO LQMS (p. 86)** also defines a shift ("the control is on the same side of the mean for five consecutive runs"; the handbook elsewhere says 6) and a trend. **H**

---

## 3. CLSI C24

- **Current edition:** C24 Ed4, _Statistical Quality Control for Quantitative Measurement Procedures: Principles and Definitions_, published 29 Sep 2016. It replaces C24-A3 (2006). https://clsi.org/shop/standards/c24/ **H**
- No 5th edition was found as of 2026-10.
- **What it covers (CLSI page and Parvin's JALM summary):**
  - planning a QC strategy based on patient risk
  - expanded guidance on setting target values and SDs (subchapter 5.3)
  - QC frequency and schedules (subchapter 5.5)
  - frequency should take into account the reliability of the procedure, its imprecision and bias, patient testing rate, and potential severity of harm
  - it "does not recommend a specific QC strategy for any individual device or technology"
  - Summary: Parvin CA, _J Appl Lab Med_ 2017;1(5):581–584. https://academic.oup.com/jalm/article/1/5/581/5587376 **H (summary)**
- **Target and SD:** 20 measurements over 20 days, per the Westgard Q&A that cites C24-Ed4 (see section 2). **M (secondary)**
- **Number of levels:** C24 summaries do not fix a number. The common regulatory minimum is US CLIA 42 CFR 493.1256(d)(3):
  - (i) quantitative: "two control materials of different concentrations" at least once each day patient specimens are assayed
  - (ii) qualitative: "a negative and positive control material"
  - (e)(1): check each batch, lot number and shipment of reagents
  - (e)(2): test stains "each day of use"
  - (e)(3): fluorescent and IHC stains "each time of use"
  - https://www.ecfr.gov/current/title-42/chapter-IV/subchapter-G/part-493/subpart-K/subject-group-ECFR4b8d1fc7a8d2a4a/section-493.1256 **H**
- **WHO LQMS (p. 85):** Westgard "requires running two controls of different target values"; with three controls, use low, normal and high. **H**

---

## 4. QC for qualitative tests, kits and stains

**WHO LQMS Handbook 2011, ch. 8 (pp. 92–97).** Read via the WHO LQSI extract: https://extranet.who.int/lqsi/sites/default/files/attachedfiles/LQMS%206%207%208%20Quality%20Control.pdf **H**

- **Kit controls:** "preferably once each day of testing, or at least as often as recommended by the manufacturer". Also run "to validate a new lot number of test kits" and "when new testing personnel are carrying out the testing".
- **Built-in controls:** "Most built-in controls monitor only a portion of the examination phase."
- **Stains:** "stains should be checked each day of use with positive and negative QC materials". "In most cases, positive and negative controls should be stained with each batch of patients' slides."
- **Media:** commercial media are checked for "each new lot number" and in-house media for "each batch prepared". Sterility is checked by incubating overnight. Control organisms are used, e.g. _E. coli_ ATCC 25922. Selective media need one organism that should grow and one that should be inhibited.

**HIV RDTs: WHO _Improving the quality of HIV-related point-of-care testing_ (Dec 2015), p. 24.** Run QC specimens:

- "daily before starting to test patient specimens"
- or "once a week, preferably at the beginning of the week"
- when there is a new operator
- with a new kit lot
- "whenever a new shipment of test kits or controls is received"
- when kits are exposed to out-of-range environmental conditions

Other points from the same handbook:

- p. 25: EQA panels "one to three times a year".
- p. 23: supervision visits "at least every 3–6 months".
- p. 25: retest new positives on a new specimen by a second tester before ART.
- https://new.aidsdatahub.org/sites/default/files/resource/improving-quality-hiv-related-point-care-testing-2015.pdf **H**

**Uganda HIV-testing QC specifics** (HTS Policy 2022 sections on QC, DTS PT and RTCQI): **not retrieved**.

- The Consolidated HIV Guidelines 2022 refer readers to the "HIV Testing Services Policy and implementation guidelines 2022".
- The text I could read lists only section 2.16, "HIV tester and site certification".
- Needed: a copy of the HTS Policy 2022. **L**

**Malaria RDT**

- WHO/FIND lot testing can be done "pre-purchase or post-purchase", and "before or after the distribution to the field".
- To pass, an RDT must detect panels "at 200 parasites per microlitre".
- https://www.who.int/teams/global-malaria-programme/case-management/diagnosis/rapid-diagnostic-tests/lot-testing **H**
- No WHO page on user-level positive-control wells was found. **L**

**Giemsa: WHO MM-SOP-03C, _Quality control of Giemsa stock solution and buffered water_, v1, Jan 2016.** QC is event-driven. Perform it:

- "for every new batch or lot of stock solution prepared"
- before a stock is sent out to labs
- in the field, on receipt of a stock from the reference lab
- before a working solution is prepared
- "for every new batch of water buffered to pH 7.2 prepared"

How it is done:

- Use a thin film known to be malaria-positive, ideally _P. vivax_. Control films are stored at −20 °C or colder, ideally −70 °C.
- Test both 3% and 10% working solutions.
- Pass criteria: red or pink nucleus, blue cytoplasm, Schüffner's dots visible.
- Log date, batch numbers, results, actions and staff name.
- https://www.who.int/docs/default-source/wpro---documents/toolkit/malaria-sop/gmp-sop-03c.pdf **H**

**Malaria microscopy: WHO _Malaria Microscopy QA Manual_ v2 (2016), §5.2.1 p. 25**

- Daily: "Stained QC slides should be used to check the quality and performance of the Giemsa stain."
- QC slides can be kept "for up to 2 weeks", stained with the next patient batch and read first.
- Supervisors recheck a weekly selection of slides.
- https://medbox.org/dl/5e148832db60a2044c2d31b6 (WHO ISBN 978 92 4 154939 4) **H**

**ZN and auramine: GLI, _Laboratory Diagnosis of TB by Sputum Microscopy – The Handbook_ (2013)**

- p. 80: each newly prepared stain batch is tested on "Two positive control smears stained once" and "Two negative control smears stained three times" (the negatives check for environmental mycobacteria).
- Discard a batch that fails and record the reason.
- p. 79: technicians do "regular QC using positive control smears".
- p. 62, fluorescence: "use positive controls every day".
- Record everything in the QA logbook.
- https://stoptb.org/file/10502/download **H**

**Gram:** no stain-specific frequency was found beyond the general WHO LQMS rule ("each day of use", +/− controls) and CLIA (e)(2). **M**

---

## 5. EQA in Uganda

**"UNEQAS" could not be verified.** No web source uses that name for a Ugandan scheme, and the 2016 AJLM Uganda QA review does not mention it. Confirm the scheme name locally, possibly the NHLDS EQA programme. **L**

What _was_ verified:

- **AJLM 2016 review** (Aisu et al., _Afr J Lab Med_ 5(2):a447, doi:10.4102/ajlm.v5i2.447): **H**
  - "Only panels for HIV testing and tuberculosis smear microscopy are produced locally."
  - Chemistry, haematology, bacteriology, CD4 and viral load panels come from external providers.
  - "The EQA schemes and suppliers are not centrally coordinated."
  - Weaknesses named: poor POC EQA coverage and low response rates.
  - Mirror: https://distantreader.org/stacks/journals/ajlm/ajlm-447.htm
- **UVRI General Virology:** HIV PT panels go to HIV testers nationwide "every three months". Testers who fail are retrained and get on-site supervision. CD4 EQA through UK NEQAS has 343 registered participants. Blood banks have their own EQA covering six parameters. https://www.uvri.go.ug/node/50 **H** (the page does not say whether the panels are DTS)
- **TB smear, Randomized Blinded Rechecking (RBRC):** started 2008 by the national TB programme with the NTRL/SRL. Nsawotebba et al., _BMC Infect Dis_ 2023;23, doi:10.1186/s12879-023-08406-6: **H (abstract)**
  - 660 labs in 2008, 1,406 in 2017; over 1,600 microscopy units in the country
  - 265,523 smears rechecked over the decade
  - error categories: false positive, false negative, quantification error
  - sensitivity 93% → 97%
  - Sample size per lab per quarter and the LQAS parameters were not readable (the Springer PDF needs cookies and PMC showed a browser check). **L for those numbers**
- **TB Xpert PT (NTRL):** started 2015. Panels of 4 × 1 ml liquid samples. Participation grew from 56 to 148 labs (round 4, 2018). Scored as % agreement against expected/consensus results, with >80% as the analysed performance cut-off. Run to ISO 17043. Kabugo et al., _PLoS ONE_ 2021;16(5):e0251691. https://doaj.org/article/365bdb1af19243b899c79407cdc352ec **H**
  - SRL-Uganda has also validated DTS panels for Xpert Ultra PT, aimed at biannual rounds (_PLoS ONE_ 2023;18(3):e0282650). **H**
- **Malaria:** MoH, CPHL and NMCP rolled out malaria diagnostics EQA under Global Fund Round 10 in 56 districts (Malaria Consortium, Aug 2014). https://www.malariaconsortium.org/news/orientation-on-external-quality-assurance-for-malaria-diagnostics **H**
  - NHLDS produced "the region's first malaria Rapid Diagnostic Test (RDT) proficiency testing panels" and is working toward ISO 17043 (MoH/CPHL news, 9 May 2024). https://www.cphl.go.ug/node/129 **H**
  - Uganda's slide-rechecking sample size was not found. **L**
- **WHO generic guidance on HIV RDT retesting EQA:** "Usually 5-10% of HIV rapid test samples are randomly selected for retesting" (WHO LQMS training toolkit, module 10 annex 10-B). https://extranet.who.int/hslp/who-hslp-download/package/501/material/229 **H**

---

## 6. SLIPTA checklist v3 (2023)

**Source:** WHO-AFRO/ASLM, _SLIPTA Checklist Version 3:2023_. https://old.aslm.org/wp-content/uploads/2023/12/SLIPTA-Checklist-V3-2023.pdf **H**

- It is aligned to ISO 15189:2022 (Introduction, p. 1).
- Total score is 367 points (score sheet, p. 5).

| #      | Section                                    | Points |
| ------ | ------------------------------------------ | ------ |
| 1      | Documents and Records                      | 22     |
| 2      | Organisation and Leadership                | 26     |
| 3      | Personnel Management                       | 34     |
| 4      | Customer Focus                             | 24     |
| **5**  | **Equipment Management**                   | **38** |
| **6**  | **Assessments** (incl. quality indicators) | **24** |
| **7**  | **Supplier and Inventory Management**      | **27** |
| **8**  | **Process Management** (IQC/EQA)           | **71** |
| 9      | Information Management                     | 24     |
| **10** | **Nonconforming Event Management**         | **13** |
| 11     | Continual Improvement                      | 7      |
| 12     | Facilities and Safety                      | 57     |

**Star bands:** 0 stars = 0–205 (<55%); 1 = 206–240; 2 = 241–277; 3 = 278–314; 4 = 315–352; 5 = 353–367 (≥95%).

**Items relevant to MedSync (page, points)**

- **Equipment (section 5)**
  - 5.7 Equipment records / inventory (p. 21)
  - 5.8 Defective equipment waiting for repair; malfunctions go through the nonconforming procedure
  - 5.10 Calibration procedure (p. 22, 3): frequency, in-house calibrations (pipettes, thermometers, timers), external providers, metrological traceability, failed calibrations, records and stickers
  - 5.11 Calibration and metrological traceability (p. 22, 3)
  - 5.12 Preventive maintenance (p. 22, 2)
  - 5.13 Service maintenance (p. 23)
- **Assessments (section 6)**
  - 6.8 Quality indicators (p. 26, 2): covering pre-examination, examination and post-examination, "(e.g., turnaround times, rejected samples, stock-outs, etc.)"
  - 6.9 Monitoring of QIs (p. 26)
- **Supplier and inventory (section 7)**
  - 7.2 Purchasing and inventory control procedure
  - 7.3 Forecasting
  - 7.5 Supplier performance review
  - 7.6 Inventory control (p. 28, 3): records per reagent covering identity, lot, supplier, dates (received, expiry, in-service, removed), package insert, inspection on receipt, and in-house preparation details
  - 7.8 Inventory system (p. 28, 2): "minimum and maximum stock levels denoted and monitored", consumption rate, routine stock counts
  - 7.9 Storage
  - 7.10 FEFO (p. 29, 2): "Is First-Expiration-First-Out (FEFO) practiced?"
  - 7.11 Product expiration (p. 29, 2): "Expired controls and calibrators must not be used."
  - 7.12 Disposal of expired products
- **Process management (section 8)**
  - 8.13 Reagent and consumable acceptance testing (p. 34, 2): "for each new preparation, new lot, and new shipment"
  - 8.14 IQC procedure (p. 34, 3): acceptance and rejection criteria, frequency, ranges (package insert or in-house), alternatives, monitoring, troubleshooting
  - 8.15 Quality control (p. 34, 3): QC must be within limits before results are released; corrective action; patient samples since the last good QC are evaluated
  - 8.16 Monitoring QC performance (p. 34, 3): Levey-Jennings charts, trends and bias; action taken on rule violations
  - 8.17 Comparability (p. 35, 2)
  - 8.18 and 8.19 Environmental monitoring (daily temperatures for room, fridges, freezers, incubators and water baths; defined ranges)
  - 8.20 EQA procedure (pp. 35–36, 3): "All examinations, including POCT, must be enrolled in EQA or alternative methods"
  - 8.21 EQA participation (p. 36, 3): approved provider, samples handled like patient samples, review, root cause analysis and corrective action for unacceptable results
- **Nonconforming events (section 10, pp. 44–45)**
  - 10.1 Procedure (3)
  - 10.2 Identification and management (3): "examinations halted and results withheld or recalled"
  - 10.3 Records (2)
  - 10.4 Resumption of testing (2)
  - 10.5 Corrective action (3)

---

## 7. Quality indicators (IFCC WG-LEPS Model of Quality Indicators)

**Source:** Sciacovelli L et al., _Clin Chem Lab Med_ 2017, "Defining a roadmap for harmonizing quality indicators in Laboratory Medicine", Table 1. https://www.degruyterbrill.com/document/doi/10.1515/cclm-2017-0412/html **H**
Each QI is reported as a percentage of the denominator. Priority 1 means mandatory.

| Code                                        | Definition                                                                               | Pri |
| ------------------------------------------- | ---------------------------------------------------------------------------------------- | --- |
| Pre-MisR                                    | misidentified requests / total requests                                                  | 1   |
| Pre-MisS                                    | misidentified samples / total samples                                                    | 1   |
| Pre-InsV                                    | samples with insufficient volume / total samples                                         | 1   |
| Pre-Clot                                    | clotted samples / samples with anticoagulant checked for clots                           | 1   |
| Pre-HemV, Pre-HemI, Pre-HemR                | haemolysed samples, detected visually, by haemolysis index, or rejected                  | 1   |
| Pre-WroTy, Pre-WroCo                        | wrong sample type / wrong container                                                      | 1   |
| Pre-NotRec, Pre-DamS, Pre-InTem, Pre-ExcTim | samples not received, damaged, at improper temperature, or with excessive transport time | 1   |
| Intra-IQC                                   | tests not covered by IQC                                                                 | 1   |
| Intra-UnIQC                                 | IQC results outside limits                                                               | 1   |
| Intra-EQA                                   | "tests without EQA-PT control / total tests in the menu"                                 | 1   |
| Intra-Unac                                  | unacceptable EQA-PT performances per year                                                | 1   |
| Post-OutTime                                | reports delivered outside the specified time / total reports                             | 1   |
| Post-PotTAT (also INR, WBC, troponin)       | 90th-percentile STAT turnaround time                                                     | 1   |
| Post-RectRep                                | reports corrected after release                                                          | 1   |
| Post-InsCR, Post-OffCR                      | critical results notified within the agreed time (inpatient / outside patients)          | 1   |
| Post-InsCRT                                 | median time to communicate a critical result                                             | 4   |

- Sciacovelli et al., _CCLM_ 2016;54(7):1169–76, doi:10.1515/cclm-2015-0897, defines "Number of critical values notified after a consensually agreed time" as a QI. https://www.research.unipd.it/retrieve/e14fb26e-d558-3de1-e053-1705fe0ac030/10.1515_cclm-2015-0897.pdf **H**
- SLIPTA 6.8 examples: TAT, rejected samples, stock-outs.
- ISO 15189:2022 5.5 d) and 8.8.2 require QIs.

---

## 8. Reagent and inventory management

**WHO LQMS Handbook 2011, ch. 4.** ISBN 978 92 4 154827 4. Full handbook: https://stacks.cdc.gov/view/cdc/12202/cdc_12202_DS1.pdf; section extracts on WHO LQSI as linked below. **H**

- **4-1 (p. 50):** "continuously monitor the expiration dates to make sure needed reagents are always on hand"; overstocking is wasteful.
- **4-2 (p. 51):** "All purchased material should be inspected and appropriately tested to ensure that specifications are met."
- **4-3 Quantification (p. 51):**
  - "Establish the minimum stock needed for an appropriate time period."
  - The system should alert "when there is a need to reorder".
  - Inputs: approximate usage per month and lead time ("length of time required to receive a delivery").
  - No formula is given. The usual one, **[UNVERIFIED in source]**, is min = AMC × (lead time + safety stock) and max = min + AMC × review period.
- **4-6 Receipt and storage (pp. 57–58):** https://extranet.who.int/lqsi/sites/default/files/attachedfiles/LQMS%204-6%20Receipt%20Storage%20of%20Supplies.pdf
  - Inspect on arrival; the receiver signs, dates each item, notes the expiry date and updates the log.
  - FEFO: "items with the first expiry dates are the first used"; new stock goes behind existing stock.
  - "label reagents with the date they are opened".
  - The store is kept clean, locked, ventilated and out of direct sun.
- **4-7 Monitoring (p. 57):** https://extranet.who.int/lqsi/sites/default/files/attachedfiles/LQMS%204-3%204-7%20Inventory%20management%20and%20monitoring.pdf
  - "conduct weekly physical counts of reagents and supplies"
  - Computerised systems "can be set up to alert when lot numbers are near the expiration date".
- **WHO LQSI TB stock-card template (AA32)**
  - Header: name and strength, unit, item code, expiry date, **average monthly consumption, minimum level, maximum level**.
  - Columns: Receipts (date, document no., quantity, location); Disbursements (document no., quantity, destination); Stock (quantity, unit value, total value).
  - https://extranet.who.int/lqsi/sites/default/files/attachedfiles/Guidance_on_specifications_for_TB_lab_supply_AA32.pdf **H**
- **SLIPTA 7.6, 7.8, 7.10, 7.11 and ISO 15189 6.6.3, 6.6.4, 6.6.7** are covered in sections 1 and 6 above.

**CLSI EP26 Ed2 (27 Apr 2022), _User Evaluation of Acceptability of a Reagent Lot Change_.** https://clsi.org/shop/standards/ep26 **H (summary)**

- Uses **patient samples** "to detect any clinically significant changes from the current reagent lot".
- Acceptance is judged against a **critical difference** set by the lab.
- Two stages. "Stage 1 sets up the protocol for each analyte", once per analyte. Stage 2 evaluates each new reagent lot.
- The sample number and rejection limit come from Stage 1 (per analyte), so MedSync should store them as configuration.
- ISO 15189 6.6.3 likewise prefers patient samples for comparing reagent lots.

---

## Couldn't open, or not found

- **pmc.ncbi.nlm.nih.gov:** reCAPTCHA browser check. Used the distantreader.org, doaj.org and degruyter mirrors instead.
- **europepmc REST:** rate-limited (HTTP 429), not retried.
- **Springer PDF for the RBRC paper:** needs cookies. Abstract taken from DOAJ.
- **WHO IRIS LQMS PDF:** fetch error. Used the CDC Stacks copy and the WHO LQSI chapter extracts.
- **HKAS AF06 .doc:** binary, unreadable.
- **Not found:** "UNEQAS" by name; the Uganda HTS Policy 2022 QC/DTS section; Uganda malaria slide-rechecking sample size; RBRC per-lab sample size; ISO 15189 8.8.1 title read directly; the 6.6.6 title.
