# Pharmacy Phase 3: research notes for sign-off

Researched 24 October 2026 for `PROMPT-PHARMACY-PHASE-3.md`. Four strands. Each read only the sources it opened; every source has its URL and the date it was opened.

**Status: proposal only.** Every list in these files is a **candidate draft** for the pharmacist reviewer, the CSO and (for stewardship) the AMS committee chair. Nothing acts in MedSync until it is signed (Phase 3 Law 3).

## What the files hold

| File                          | Holds                                                                                                                                                                                                        |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `aware-candidates.json`       | WHO AWaRe classification 2025 (B09489, 5 Sep 2025): 384 entries. By group: {'Access': 93, 'Watch': 145, 'Reserve': 30, 'Not recommended': 116}. 34 are on EMHSLU 2023. Some antibiotics are classed by route |
| `interaction-candidates.json` | 78 candidate pairs, each with at least one opened source. By severity: {'serious': 43, 'monitor': 17, 'contraindicated': 18}. Doses never invented ("see source")                                            |
| `pcne-codes.json`             | PCNE V9.1, the current version: 102 codes. **Commercial use needs the PCNE Board's written permission**                                                                                                      |
| `adr-report-fields.json`      | The national combined ADR/AEFI form (sections A to F): 38 fields, 8 routes, the WHO-UMC causality categories and the ICH E2A seriousness criteria                                                            |

## Headline findings

1. **Interaction content can't be borrowed.** No open interaction database can be embedded in a commercial product:
   - DDInter 2.0 is non-commercial;
   - Liverpool's terms forbid it without written consent;
   - DrugBank's free tier is academic only;
   - the NLM RxNav interaction API closed on or about 2 January 2024.

   Commercial knowledge bases (Lexidrug, Medi-Span, FDB, Micromedex, DrugBank commercial, Stockley's/BNF) need a negotiated licence, and none publishes a price. **Start with MedSync's own signed list of severe pairs, written from cited sources such as FDA labels and the ONC list; send one request for quotation; ask Liverpool for consent separately.**

2. **Alert design.** Tiering by severity raises acceptance of the most severe alerts (100% against 34% in one comparison). Drug safety alerts are overridden in 49% to 96% of cases. Hard stops have delayed treatment (one trial was stopped early). Hence: interrupt only for contraindicated pairs, never hard-stop, and never let "no alert" read as "safe".
3. **Uganda's facility instrument for stewardship and pharmacovigilance** is the Ministry's _Guidelines for Medicines and Therapeutics Committees_, 2nd edition, June 2025. It says:
   - Reserve antibiotics are for infectious disease specialists;
   - meropenem and piperacillin with tazobactam are for consultants at referral hospitals;
   - approval must never delay lifesaving treatment;
   - pharmacy could query parenteral antibiotics beyond seven days;
   - local IV-to-oral criteria should be set;
   - an annual point-prevalence survey should be run;
   - each committee keeps a database of all adverse reactions, with WHO-UMC causality.
4. **AWaRe targets.**
   - WHO's earlier target: at least 60% of national consumption from the Access group.
   - UN resolution 79/2 (2024): at least 70% globally by 2030.

   Both are national or global targets, never a hospital pass mark. Uganda's 2024/25 to 2028/29 national action plan sets no AWaRe target. In the 13-hospital survey (2020 to 2021):
   - 73.7% of inpatients were on antibiotics;
   - 47.2% of antibiotics were Access and 44.1% Watch;
   - 30.1% of prescriptions complied with the Uganda Clinical Guidelines;
   - no patient was treated on a susceptibility result.

5. **Review interval.**
   - CDC: a "time-out" at 48 to 72 hours.
   - The WHO toolkit: a 48-hour review indicator.
   - Uganda's guideline: no interval set.

   No number is proposed.

6. **Reporting a suspected reaction.**
   - **The form:** one national form covers reactions, lack of effect, poor-quality products, medication errors and suspected counterfeits (AEFI goes another way).
   - **Routes:** the WHO-UMC e-reporting page for Uganda, the Med Safety app, email, and paper through the regional pharmacovigilance centres.
   - **The law:** the Pharmacovigilance Regulations 2014, amended 2021, require health professionals to report serious events. They set no timeline and say nothing on electronic submission.
   - **Timelines conflict:** the training manual says 24 to 48 hours and 15 days; the 2025 guideline says 48 hours and 7 days.
   - **No API exists** for a facility system.
7. **Reconciliation.**
   - The WHO High 5s discharge step compares the admission history and the last 24 hours of administration with the discharge prescription.
   - MedSync can detect 14 kinds of discrepancy from records (R1 to R14).
   - Only a person can find whether a change was meant, or what the patient really takes.
   - No Ugandan study of reconciliation discrepancies was found.
8. **PCNE V9.1** fits MedSync's coded query best: problem, cause, "proposed to prescriber" (I1.3), acceptance and status. A "keep" after a question-only query is not a rejection. Queries made by talking were accepted 27.7 percentage points more often than queries sent through software, which supports logging phone calls.

## Questions before signing (also in the prompt, Appendix E)

- Patient identifiers on the national report (initials against full name) under the Data Protection and Privacy Act 2019.
- Which reporting timeline binds.
- PCNE permission.
- Liverpool consent and knowledge-base quotations.
- The patient's own record naming medicines against "messages never name a medicine".

## Not read, and needed

- The interaction tables in the Uganda Consolidated HIV Guidelines 2022.
- The NDA's _Guidelines on Detecting and Reporting ADRs in Uganda_.
- The NDA market complaint form.
- The WHO 2025 Expert Committee report on AWaRe changes.
- NICE NG5 section 1.2.
- The High 5s implementation guide.

One Ministry PDF on cphl.go.ug carried hidden text addressed to AI readers; it was ignored.

---

# Strand 1: Antimicrobial stewardship

_Source file: AMS.md_

# MedSync pharmacy Phase 3: antimicrobial stewardship (AMS) research note

Strand: antimicrobial stewardship. Prepared 24 October 2026. Everything below is a **candidate draft for signature** by a pharmacist reviewer and the Clinical Safety Officer. No list, class, interval or threshold here may act in the product until signed. MedSync informs and never blocks care; it never stops, switches or converts doses.

Companion file: `aware-candidates.json` (384 entries: 268 classified antibiotics plus 116 "not recommended" combinations from the WHO 2025 workbook, with EMHSLU 2023 presence marked).

---

## 1. Key findings in brief

1. **The current AWaRe list is the 2025 edition**, published by WHO on 5 September 2025 (reference B09489) as an Excel workbook. It classifies 268 antibiotics: 93 Access, 145 Watch, 30 Reserve, plus a separate sheet of 116 fixed-dose combinations that WHO does not recommend [S1]. WHO says the classification is updated every two years and is a tool for monitoring and stewardship, "not intended as model for the inclusion of antibiotics on national essential medicine lists" [S1]. The 2025 Committee did not change the Reserve definition and deferred a structured review of definitions to the 2027 meeting [S4].
2. **Targets.** WHO's earlier target (13th General Programme of Work 2019 to 2023): "at least 60% of total antibiotic consumption being Access group antibiotics", a **country-level** target [S2]; the AWaRe book words it as 60% of total antibiotic prescribing at country level by 2023 [S3]. The 2024 UN General Assembly political declaration (resolution 79/2) raises this: by 2030 Access use should reach "at least 70 per cent overall human antibiotic use globally" (paragraph 64) [S5][S6][S7]. Both are national or global consumption targets, not hospital targets.
3. **Uganda.** NAP-AMR II (2024/25 to 2028/29) makes stewardship strategic objective 3, asks for functional facility Medicines and Therapeutics Committees (MTCs), and proposes clinical decision support "within the hospital information system" (action 3.3.7), but sets **no AWaRe target** and no numeric hospital AMS targets in the text opened [S9][S10]. The operative facility document is the MoH **Guideline to implement activities for Medicine and Therapeutics Committee in a health facility, 2nd edition, June 2025**, which places AMS in an MTC subcommittee and lists the core interventions MedSync can support [S12]. A national surveillance guideline for antimicrobial consumption and use (2020) sets the data methods (DDD, PPS, prescription audits) [S11].
4. **UCG 2023** tells prescribers to take AWaRe into account, avoid broad-spectrum antibiotics as first line, and prescribe correct dose and duration; it allows antibiotics to start while awaiting laboratory results; its surgical prophylaxis section says prophylaxis is given less than 60 minutes before incision, a single dose is usually sufficient, and routine post-operative antibiotics are not recommended [S13]. EMHSLU 2023 describes AWaRe in its introduction but does **not** tag individual items with a group [S14].
5. **Baseline Ugandan data** (WHO PPS methodology, 13 hospitals, December 2020 to April 2021): 73.7% of inpatients on antibiotics; Access 47.2% and Watch 44.1% of prescriptions; ceftriaxone 37% of prescriptions; indication documented 80.1%; UCG compliance 30.1%; 88% parenteral; no patient treated on susceptibility results; 98.4% of surgical prophylaxis given on more than one day [S15].
6. **Review interval.** Sources give a range, not one number: CDC time-out at 48 to 72 hours [S16]; WHO LMIC toolkit "48-hour review" indicator and de-escalation "+/- 48 hours" after microbiology [S17]; AWaRe book expects clinical improvement within 48 to 72 hours [S3]; the Uganda MTC guideline sets no interval but suggests pharmacy query parenteral antibiotics beyond 7 days [S12]. The interval must be a signed setting.

---

## 2. WHO AWaRe classification

**Edition used:** _The selection and use of essential medicines, 2025: WHO AWaRe (Access, Watch, Reserve) classification of antibiotics for evaluation and monitoring of use_, WHO, 5 September 2025, ref. B09489 [S1]. The workbook has sheets: Introduction; AWaRe classification 2025; Access; Watch; Reserve; Not recommended; 24th EML 2025; 10th EMLc 2025. Columns on the main sheet: Antibiotic, Class, ATC code, Category, Listed on EML/EMLc 2025, Notes.

- Counts read from the workbook: Access 93, Watch 145, Reserve 30 (total 268), not recommended 116 [S1]. The 268 figure matches WHO's Bulletin article ("As of 2025, WHO has assigned 268 antibiotics") [S4].
- WHO's not-recommended sheet states these fixed-dose combinations of multiple broad-spectrum antibiotics are "not evidence-based" and WHO "does not recommend their use in clinical practice" [S1]. Examples relevant to Uganda: ampicillin + cloxacillin, amoxicillin + cloxacillin, ceftriaxone + sulbactam, cefixime + clavulanic acid, ciprofloxacin + tinidazole, ofloxacin + ornidazole [S1]. The Uganda PPS found ampicillin-cloxacillin in hospital use with the highest missed-dose share (30.4%) [S15].
- Route matters: WHO classes fosfomycin IV as Reserve but oral as Watch, minocycline IV as Reserve but oral as Watch; several others are split by route [S1].
- EML 2025 holds 50 antibiotics, 10 of them Reserve; Reserve definition (2019, unchanged): for "confirmed or suspected life-threatening infection due to multidrug-resistant (MDR) bacteria" [S4].
- The 2023 list (WHO/MHP/HPS/EML/2023.04, 26 July 2023) is superseded; I opened only its landing page [S2]. WHO's AWaRe portal (aware.essentialmeds.org) shows a list but states no edition; it was used only as a cross-check [S8].
- **AWaRe antibiotic book:** _The WHO AWaRe (Access, Watch, Reserve) antibiotic book_, WHO, 9 December 2022, ISBN 978-92-4-006238-2, 697 pages, corrigendum April 2024 [S3]. Useful for MedSync: the "D8" prescribing checklist (Diagnose, Decide, Drug, Dose, Delivery including "when is step down to oral delivery possible?", Duration including "What is the stop date?", Discuss, Document) [S3, p.9 of book].

**EMHSLU 2023 coverage** (full PDF text searched) [S14]: 34 WHO-classified entries are present (18 Access, 15 Watch, 1 Reserve: linezolid, listed only as a TB medicine), plus sulfadiazine unconfirmed. Restricted "specialist" items at regional referral level include meropenem, imipenem + cilastatin, piperacillin + tazobactam, cefuroxime injection and IV ciprofloxacin [S14]. No Reserve antibiotic is listed for general use, and none of the WHO not-recommended combinations is listed.

---

## 3. Uganda guidance

| Item                                                                                 | What it says that matters for MedSync                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Source    |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| NAP-AMR II, 2024/25 to 2028/29 (MoH, MAAIF, MWE, MTWA)                               | Objective 3: stewardship, optimal access and responsible use. 3.1.2 update and improve facility MTCs; 3.1.3 institutionalise AMS; 3.3.7 "Create and integrate clinical decision support tools within the hospital information system"; 3.4.6 assess prescribing with CQI. Intervention 4.2: AMU/AMC surveillance. MEL indicator "% of health facilities implementing stewardship programs" with no baseline or target shown. No AWaRe target found. Budget UGX 30.2 billion; launched November 2024.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | [S9][S10] |
| MTC implementation guideline, 2nd ed., June 2025                                     | AMS subcommittee of the MTC (clinicians, pharmacists, laboratory, nurses, IPC focal person, data). Functions include a formulary of restricted antimicrobials and approval systems. Table 2.2 core interventions: formulary restriction and pre-authorisation (Reserve limited to infectious disease specialists; meropenem and piperacillin/tazobactam at referral facilities by consultants; restrictions "should not prevent timely administration of lifesaving treatment"); prospective audit and feedback (redundant coverage, duration, culture before treatment); de-escalation or time-out, with automatic stop orders mentioned and a warning that they can interrupt treatment; inpatient pharmacy "could query parenteral antibiotics lasting more than 7 days"; parenteral-to-oral conversion by locally developed criteria, examples fluoroquinolones, trimethoprim-sulfamethoxazole, linezolid; pharmacy alerts for duplicate coverage, interactions and weight-based doses. Annual inpatient PPS. Table 2.3 indicators (structure, process, outcome). Watch and Reserve are the stewardship focus. "Documentation of diagnosis and review dates" is a target area; computerised decision support listed as a front-end strategy. | [S12]     |
| National Guidelines for AMC and AMU Surveillance in Human Health, 1st ed., June 2020 | National consumption in DDD per 1,000 inhabitants per day by ATC and AWaRe; facility use by store-issue consumption surveys, WHO/INRUD prescribing indicators, PPS, medicine use evaluations and prescription audits. Governance via MTC AMS subcommittees. Indicator examples: % encounters with an antibiotic, % URTI patients prescribed antibiotics, % prescriptions matching UCG or EMHSLU.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | [S11]     |
| UCG 2023                                                                             | Introduction (pp. LV to LVII): use antimicrobials only when necessary, avoid last-generation and broad-spectrum antibiotics as first line, correct dose and duration; "Prescribers are encouraged to adhere" to AWaRe. p. XLVI: antibiotic treatment "can be initiated in some cases awaiting laboratory results". Condition pages give their own switch and escalation rules (for example neonatal sepsis: if no improvement after 48 to 72 hours change from ampicillin; pneumonia: once improved switch to oral amoxicillin). 24.1.5 Surgical antibiotic prophylaxis: less than 60 minutes before first incision; not recommended for most uncomplicated clean procedures; one single dose usually sufficient; routine post-operative antimicrobials not recommended. The EMHSLU has been removed from UCG 2023 and published separately.                                                                                                                                                                                                                                                                                                                                                                                                     | [S13]     |
| EMHSLU 2023                                                                          | AWaRe paragraph in introduction ("Prescribers are encouraged to take the AWaRe classification into consideration"; prescribing should be guided by laboratory results). No per-item AWaRe tag. Items carry level of use (HC1 to NR) and VEN.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | [S14]     |
| Uganda 13-hospital PPS (Kiggundu et al., Antibiotics 2022;11(2):199)                 | WHO PPS methodology v1.1. Measured: prevalence of antibiotic use, antibiotics per patient, indication type (CAI 41.6%, medical prophylaxis 29.1%, surgical prophylaxis 23.0%, HAI 6.3%), AWaRe share of prescriptions, UCG 2016 compliance, indication documented, route, missed doses, surgical prophylaxis duration, culture-directed therapy. Stop or review date was not reported. Public hospitals had 1.8 times the odds of antibiotic use.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | [S15]     |

Not found: a stand-alone, current MoH "national antimicrobial stewardship guidelines" document. The MTC guideline (2025) is the facility-level MoH instrument that contains AMS content. A 2022 study of AMS programme characteristics in Ugandan hospitals (PMC9089898) could not be opened.

---

## 4. Hospital AMS interventions software can support, with evidence

### 4.1 Antibiotic review (time-out) at a set interval

- CDC Core Elements (2019 update; web page last updated 15 September 2025): a provider-led reassessment, usually 48 to 72 hours after start, of whether there is an infection that will respond, whether the right cultures were sent, and whether therapy can be stopped, narrowed or switched to oral, and of duration. A trial found time-outs improved appropriateness of selection without reducing overall use; CDC calls them a supplement, "not ... a substitute" for audit and feedback [S16, pp.18 to 19].
- WHO LMIC toolkit (2019): de-escalation by prescriber self-revision, by ward-round review against guidelines, and "according to microbiology test results +/- 48 hours after prescription"; indicator "48-hour review" = patients with a 48-hour review / patients on antibiotics hospitalised more than 48 hours [S17, pp.40 and 52].
- Uganda MTC guideline: time-out or automatic stop orders prompt review, with a warning they can interrupt treatment if poorly managed; pharmacy may query parenteral courses beyond 7 days [S12, p.28].
- WHO policy guidance (2021) is national-level; it supports PPS-based facility surveys and use of EML and AWaRe principles in national guidelines [S18].

### 4.2 IV-to-oral switch (criteria as stated; no numbers)

- WHO toolkit: consider based on the clinical condition and availability of an adequate oral antibiotic; oral intake and gastrointestinal absorption not impaired; suitability for the diagnosis ("not in the case of endocarditis or meningitis") [S17, p.41].
- AWaRe book: step down when the patient "has clinically improved, is afebrile and is able to tolerate oral treatment" (worded in infection pages, for example p.202 of the PDF) [S3].
- Uganda MTC guideline: switch by locally developed clinical criteria when antibiotics have good oral absorption; inpatient pharmacy can audit against agreed criteria [S12, p.29].
- CDC: pharmacy-driven automatic IV-to-oral changes "in appropriate situations" for well-absorbed antibiotics; gives no clinical criteria; tracks conversion rate [S16, pp.19 to 22].
- UCG 2023: condition-specific switch instructions [S13].

### 4.3 Restricted and Reserve antibiotic authorisation

- WHO toolkit: restriction by approved criteria (for example AWaRe), pre-authorisation that lets the attending physician use the drug "pending approval ... after +/- 48 hours"; selective susceptibility reporting [S17, p.42].
- CDC: pre-authorisation can run through electronic order entry; audit and feedback was more effective than pre-authorisation in two studies, both are priorities [S16, pp.14 to 15].
- Uganda MTC guideline: Reserve by infectious disease specialists; meropenem and piperacillin/tazobactam by consultants at referral facilities; approval must not delay lifesaving treatment [S12, p.28].
- WHO Reserve definition: confirmed or suspected life-threatening MDR infection, when alternatives failed or are unsuitable [S4].

### 4.4 Culture before antibiotics

- UCG 2023 allows starting antibiotics while awaiting laboratory results [S13]. Uganda MTC prospective audit prioritises "conducting culture before starting treatments" [S12]. CDC time-out asks whether proper cultures were done [S16]. WHO PPS records CultureSampleTaken and directed versus empirical treatment [S19]. Uganda baseline: no treatment was susceptibility-directed [S15].
- Implication: the prompt asks "was a sample sent?" and links the laboratory order; it never holds the antibiotic.

### 4.5 Indication and duration or stop date

- CDC: policy requiring "a dose, duration and indication" for all antibiotic prescriptions [S16, p.28]. WHO toolkit indicators: documented indication; written stop or review date [S17, p.52]. WHO PPS: ReasonInNotes [S19]. AWaRe book D8: Duration, "What is the stop date?" and Document [S3]. Uganda MTC: "Documentation of diagnosis and review dates" [S12].

### 4.6 Surgical prophylaxis

- UCG 2023 (above) [S13]; AWaRe book: prophylaxis "should not be continued after surgery" and one dose covers most procedures [S3, p.578 of PDF]; WHO toolkit indicators: given within 60 minutes before surgery, stopped within 24 hours [S17, p.52]; WHO PPS duration codes SP1 one dose, SP2 multiple doses on one day, SP3 multiple doses on more than one day [S19].

---

## 5. What MedSync should and should not do

**Should (prompts that inform):**

1. Show the signed AWaRe group as a badge on every antibiotic line, in the prescriber view and the pharmacist queue (Phase 1 review lanes), mapped by INN **and route**.
2. Ask for indication (coded where possible), intended duration or review date at prescribing; record "not stated" rather than refuse.
3. At the signed review interval, raise a time-out task to the prescriber and a visible item in the pharmacist lane; record the outcome (continue, narrow, broaden, switch to oral, stop, other) with who and when. The prescriber acts; MedSync records.
4. Flag Reserve and locally restricted antibiotics: show the hospital's authorisation route, let the prescription proceed, and record whether and when authorisation was obtained (WHO and Uganda MTC both require that approval does not delay treatment) [S12][S17].
5. Show an IV-to-oral eligibility prompt built from the signed criteria checklist; never switch automatically.
6. Flag WHO "not recommended" fixed-dose combinations (for example ampicillin + cloxacillin) with the WHO statement, as information to prescriber and pharmacist.
7. Flag surgical prophylaxis lines still active after the signed limit, and parenteral antibiotics past the signed long-course query day.
8. Prompt "sample sent?" and link to the laboratory order when an antibiotic starts.
9. Let pharmacists send coded AMS queries (reuse Phase 1 query codes) and count acceptance.
10. Feed the dashboard below and export a WHO-PPS-shaped extract for the facility's annual PPS [S12][S19].

**Should not:**

- Automatically stop, pause, hold or switch an antibiotic, or block dispensing or administration. (CDC and the Uganda MTC guideline describe automatic stop orders; MedSync deliberately does not implement them. They warn such orders can interrupt treatment if poorly managed [S12].)
- Calculate, convert or suggest doses.
- Present the 60% or 70% Access targets as a hospital pass mark; they are country and global consumption targets [S2][S5]. Any hospital target is a local MTC decision.
- Name an antibiotic in any patient-facing message.
- Treat an AWaRe group, restricted list, interval or criterion as live before signature.
- Count ophthalmic, otic or topical products in AWaRe shares unless signers decide otherwise.

---

## 6. Proposed signed settings (candidate drafts)

| Setting                                           | Candidate draft                                                                                                                                                                                                                                                         | Evidence                                        | Signer decision needed                                                                                                          |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `ams.aware.edition`                               | "WHO AWaRe 2025 (B09489)"                                                                                                                                                                                                                                               | [S1]                                            | Confirm edition; plan to re-sign on the 2027 update.                                                                            |
| `ams.aware.map`                                   | 268 INN-plus-route entries and 116 not-recommended combinations in `aware-candidates.json`                                                                                                                                                                              | [S1]                                            | Review mapping to MedSync formulary items; route split rules; whether TB programme medicines and topical products are in scope. |
| `ams.review.intervalHours`                        | **No number proposed.** Sources: 48 to 72 h (CDC time-out) [S16]; 48 h (WHO toolkit indicator and de-escalation window) [S17]; clinical response expected within 48 to 72 h (AWaRe book) [S3]; condition-specific in UCG [S13]; none set by Uganda MTC guideline [S12]. | as listed                                       | Choose a value within the cited range, or allow per-ward values.                                                                |
| `ams.review.recipients`                           | Prescriber task plus pharmacist lane item                                                                                                                                                                                                                               | [S16] provider-led; [S12] pharmacy review point | Confirm roles.                                                                                                                  |
| `ams.parenteral.longCourseQueryDays`              | Uganda MTC guideline example: 7 days, stated as a suggestion                                                                                                                                                                                                            | [S12]                                           | Accept, change or drop.                                                                                                         |
| `ams.restricted.list`                             | All WHO Reserve antibiotics; plus meropenem, imipenem + cilastatin and piperacillin + tazobactam (EMHSLU specialist items at RR level; MTC guideline names meropenem and piperacillin/tazobactam)                                                                       | [S1][S12][S14]                                  | Final list and who may authorise, per facility level.                                                                           |
| `ams.restricted.authorisationMode`                | "record, never block"                                                                                                                                                                                                                                                   | [S12][S17]                                      | Confirm.                                                                                                                        |
| `ams.indication.prompt` and `ams.duration.prompt` | On for every systemic antibiotic                                                                                                                                                                                                                                        | [S16][S17][S19][S3][S12]                        | Confirm; choose indication code list (PPS categories CAI, HAI, SP, MP, other are a candidate) [S19][S15].                       |
| `ams.ivToOral.criteria`                           | Checklist text only: clinical condition and suitable oral agent available; oral intake and absorption not impaired; diagnosis suitable (not endocarditis or meningitis); clinically improved, afebrile, tolerating oral                                                 | [S17][S3][S12]                                  | Approve wording and which agents carry the prompt; no numeric thresholds are taken from sources.                                |
| `ams.surgicalProphylaxis.flagAfterHours`          | Sources: single dose usually sufficient, no routine post-operative doses [S13]; indicator "stopped within 24 hours" [S17]                                                                                                                                               | [S13][S17][S3]                                  | Choose the flag point.                                                                                                          |
| `ams.notRecommendedFdc.flag`                      | On                                                                                                                                                                                                                                                                      | [S1][S15]                                       | Confirm wording.                                                                                                                |
| `ams.culture.prompt`                              | On at antibiotic start; never delays treatment                                                                                                                                                                                                                          | [S12][S13][S16][S19]                            | Confirm.                                                                                                                        |
| `ams.topicalInAware`                              | Off (exclude ophthalmic, otic, topical)                                                                                                                                                                                                                                 | AWaRe scope [S1]                                | Confirm.                                                                                                                        |

---

## 7. Dashboard indicators and definitions

Data MedSync has without dispensing-level data: prescription lines (drug, route, dose, frequency, start and stop or review dates, indication), admissions and discharges (patient-days), laboratory orders, and pharmacist queries and outcomes. Administration records (MAR) may or may not exist; indicators needing them are marked.

| #   | Indicator                                               | Definition                                                                                                                                                                                                                                      | Data needed                                                                             | Source                                        |
| --- | ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | --------------------------------------------- |
| 1   | AWaRe share of antibiotic prescriptions                 | Systemic antibiotic prescription lines in each group (Access, Watch, Reserve, not recommended, unclassified) / all systemic antibiotic lines, per period and ward. Label clearly as a **count share**, not a consumption share.                 | Prescriptions plus signed map                                                           | [S15] reported shares of prescriptions; [S17] |
| 2   | AWaRe share of prescribed DDD                           | DDD in each group / total DDD. Only computable if structured dose and WHO DDD values are held; WHO toolkit lists e-prescribing records as a possible source. Comparable to the 60% and 70% wording only at national level.                      | Prescriptions with structured dose, WHO DDD table                                       | [S17][S2][S5]                                 |
| 3   | Antibiotic prevalence (point or daily)                  | Inpatients with at least one active systemic antibiotic / inpatients present at the census time                                                                                                                                                 | Prescriptions, census                                                                   | [S19][S15]                                    |
| 4   | Prescribed days of therapy (DOT) per 1,000 patient-days | Sum over patients and agents of calendar days with an active order for that agent / patient-days x 1,000. Label as **prescribed** DOT: true DOT needs administration data.                                                                      | Prescriptions, patient-days; MAR for true DOT                                           | [S16][S17]                                    |
| 5   | DDD per 100 patient-days                                | Grams of each agent / WHO DDD, summed, / patient-days x 100. WHO: data "available in many settings" and no individual-level data needed (dispensing or purchase data suffice); dispensing tends to overestimate versus administration.          | Dispensing or purchase quantities (Phase 1 and 2 stock) or structured prescription dose | [S17][S11]                                    |
| 6   | Indication documented                                   | Antibiotic lines (or patients) with an indication recorded / all                                                                                                                                                                                | Prescriptions                                                                           | [S17][S19][S15]                               |
| 7   | Stop or review date documented                          | Lines with a stop or review date / all                                                                                                                                                                                                          | Prescriptions                                                                           | [S17]                                         |
| 8   | Review performed in window                              | Patients with a recorded review within the signed interval / patients on antibiotics admitted longer than that interval                                                                                                                         | Review outcomes                                                                         | [S17][S16]                                    |
| 9   | De-escalation                                           | Reviews ending in narrowing or stopping / empirical courses reviewed                                                                                                                                                                            | Review outcomes                                                                         | [S17]                                         |
| 10  | Parenteral share and IV-to-oral switch                  | Parenteral lines / all lines; switched to oral / courses meeting the signed criteria                                                                                                                                                            | Prescriptions, review outcomes                                                          | [S15][S17][S16]                               |
| 11  | Surgical prophylaxis duration                           | Share of SP courses that are one dose, multiple doses on one day, multiple doses on more than one day (PPS SP1 to SP3); share stopped within the signed limit. Timing within 60 minutes before incision needs administration and theatre times. | Prescriptions with SP indication; MAR and theatre record for timing                     | [S19][S17][S13]                               |
| 12  | Culture sample sent at start                            | Antibiotic courses with a microbiology sample ordered on or before day of start / all courses; directed versus empirical share                                                                                                                  | Lab orders, prescriptions                                                               | [S19][S15]                                    |
| 13  | Guideline compliance                                    | Reviewed lines coded compliant with UCG 2023 or local guideline / lines assessable. Requires pharmacist or AMS team judgement, recorded as a coded review outcome.                                                                              | Review outcomes                                                                         | [S17][S19][S15]                               |
| 14  | Restricted antibiotic authorisation                     | Restricted lines with authorisation recorded / restricted lines; median time to authorisation                                                                                                                                                   | Authorisation records                                                                   | [S12][S17]                                    |
| 15  | Not-recommended combinations                            | Count and share of lines for WHO not-recommended FDCs                                                                                                                                                                                           | Prescriptions plus map                                                                  | [S1]                                          |
| 16  | Long parenteral courses queried                         | Parenteral courses past the signed query day with a pharmacist query / all such courses                                                                                                                                                         | Prescriptions, queries                                                                  | [S12]                                         |
| 17  | AMS query acceptance                                    | AMS queries accepted / AMS queries sent                                                                                                                                                                                                         | Phase 1 query outcomes                                                                  | [S16] tracks acceptance                       |
| 18  | Missed doses                                            | Needs MAR; not computable from prescriptions                                                                                                                                                                                                    | MAR                                                                                     | [S15][S19]                                    |

DOT versus DDD, in short: DDD needs only quantities (aggregate dispensing, purchase or administration) plus WHO DDD values; DOT needs individual patient-level data, ideally administration records. US guidance prefers DOT [S16]; WHO notes DDD is most used because the data exist in many settings [S17]. Uganda's national guideline uses DDD for consumption and PPS for facility use [S11]. A note for signers: computing DDD is aggregate arithmetic for reporting, not a dose conversion for a patient, but it should be signed explicitly because of the "never converts doses" rule.

**WHO PPS methodology (v1.1)** variables MedSync can capture or export [S19]: patient on antibiotic and number of antibiotics; indication type and diagnosis; surgical prophylaxis duration (SP1 to SP3) and site; start date; ReasonInNotes; CultureSampleTaken, culture results, susceptibility communicated; antibiotic INN, written in INN, unit dose, frequency, route, parenteral type, OralSwitch; missed doses and reason; GuidelinesCompliance (Y, N, not assessable, no information); TreatmentType (directed or empirical). The WHO PPS form has no stop or review date field; that indicator comes from the WHO toolkit [S17].

---

## 8. Sources (all accessed 24 October 2026)

- [S1] WHO. The selection and use of essential medicines, 2025: WHO AWaRe (Access, Watch, Reserve) classification of antibiotics for evaluation and monitoring of use. 5 September 2025, ref. B09489. https://www.who.int/publications/i/item/B09489 . Workbook read from https://iris.who.int/server/api/core/bitstreams/a8c53afc-fa43-4883-9a59-21a9e069f40c/content (opened through the browser; direct download was blocked here).
- [S2] WHO. AWaRe classification of antibiotics for evaluation and monitoring of use, 2023. WHO/MHP/HPS/EML/2023.04, 26 July 2023. https://www.who.int/publications/i/item/WHO-MHP-HPS-EML-2023.04 (landing page only).
- [S3] WHO. The WHO AWaRe (Access, Watch, Reserve) antibiotic book. 9 December 2022, ISBN 978-92-4-006238-2. https://www.who.int/publications/i/item/9789240062382 ; PDF https://iris.who.int/server/api/core/bitstreams/61517f8b-3a34-413c-ae36-67a059ebe485/content
- [S4] Zanichelli V, et al. WHO definitions for reserve antibiotics. Bull World Health Organ 2026;104(1):47 to 49. doi:10.2471/BLT.25.293893. Read via https://www.ebi.ac.uk/europepmc/webservices/rest/PMC12706710/fullTextXML
- [S5] United Nations. Political Declaration of the High-level Meeting on Antimicrobial Resistance (final text, 9 September 2024), paragraph 64. https://www.un.org/pga/wp-content/uploads/sites/108/2024/09/FINAL-Text-AMR-to-PGA.pdf
- [S6] WHO news release, 26 September 2024. https://www.who.int/news/item/26-09-2024-world-leaders-commit-to-decisive-action-on-antimicrobial-resistance
- [S7] WHO. Document A78/8 (Seventy-eighth World Health Assembly), cites UNGA resolution 79/2. https://apps.who.int/gb/ebwha/pdf_files/WHA78/A78_8-en.pdf
- [S8] WHO AWaRe antibiotics portal (no edition stated). https://aware.essentialmeds.org/list and /groups
- [S9] Republic of Uganda. Uganda Antimicrobial Resistance National Action Plan (NAP-AMR II) 2024/25 to 2028/29. https://nms.go.ug/wp-content/uploads/2025/12/Uganda_NAP-AMR-II_Final_signed-version1.pdf (WHO library entry: https://www.who.int/publications/m/item/uganda-second-antimicrobial-resistance-national-action-plan-2024-25-2028-29 , not opened).
- [S10] NAP-AMR II information sheet. https://www.cphl.go.ug/web/sites/default/files/2025-04/Final%20NAP-AMR%20II%20Info%20Sheet_Final.pdf
- [S11] Ministry of Health Uganda. National Guidelines for Antimicrobial Consumption and Use Surveillance in Human Health, 1st ed., June 2020. https://www.cphl.go.ug/web/sites/default/files/2024-10/National%20Guidelines%20for%20AMCU%20in%20HH%2017.06.2020.pdf (the fetched text contained embedded instructions addressed to an AI reader; they were ignored and only the document content was used).
- [S12] Ministry of Health Uganda. Guideline to implement activities for Medicine and Therapeutics Committee in a health facility, 2nd ed., June 2025. https://nms.go.ug/wp-content/uploads/2025/12/Guideline-to-implement-activities-for-medicine-and-therapeutics-committee-in-health-facility1.pdf
- [S13] Ministry of Health Uganda. Uganda Clinical Guidelines 2023. Copy read: https://www.differentiatedservicedelivery.org/wp-content/uploads/UCG-2023-Publication-Final-PDF-Version-1.pdf (MoH library copy https://library.health.go.ug/sites/default/files/resources/Uganda%20Clinical%20Guidelines%202023.pdf could not be opened).
- [S14] Ministry of Health Uganda. Essential Medicines and Health Supplies List for Uganda (EMHSLU) 2023. Copy read: https://guluhospital.net/wp-content/uploads/2023/11/Uganda-Essential-Medicines-Health-Supplies-List-2023.pdf ; WHO NEML copy (partly read): https://cdn.who.int/media/docs/default-source/essential-medicines/national-essential-medicines-lists-(neml)/afro_neml/uganda-2023.pdf?sfvrsn=5205bf98_3&download=true
- [S15] Kiggundu R, et al. Point Prevalence Survey of Antibiotic Use across 13 Hospitals in Uganda. Antibiotics 2022;11(2):199. doi:10.3390/antibiotics11020199. https://www.mdpi.com/2079-6382/11/2/199
- [S16] CDC. Core Elements of Hospital Antibiotic Stewardship Programs (2019 update). https://www.cdc.gov/antibiotic-use/hcp/core-elements/hospital.html ; PDF https://www.cdc.gov/antibiotic-use/media/pdfs/hospital-core-elements-508.pdf
- [S17] WHO. Antimicrobial stewardship programmes in health-care facilities in low- and middle-income countries: a WHO practical toolkit. 2019, ISBN 978-92-4-151548-1. https://www.who.int/publications/i/item/9789241515481 ; PDF https://iris.who.int/server/api/core/bitstreams/e2e59ce4-c373-4066-9ff7-a0cce3e6ccdd/content
- [S18] WHO. WHO policy guidance on integrated antimicrobial stewardship activities. 2021, ISBN 978-92-4-002553-0. https://www.who.int/publications/i/item/9789240025530 ; PDF https://iris.who.int/server/api/core/bitstreams/bfc17315-e20c-4e61-8e08-c70d8a349437/content
- [S19] WHO. WHO Methodology for Point Prevalence Survey on Antibiotic Use in Hospitals, version 1.1 (WHO-EMP-IAU-2018.01, page dated 1 February 2019). https://www.who.int/publications/i/item/WHO-EMP-IAU-2018.01 ; PDF https://iris.who.int/server/api/core/bitstreams/53d71d65-278b-4ad1-aa6f-f34a10e5dedd/content

**Could not open:** WHO 2025 Expert Committee report executive summary PDF (B09544; landing page only, so 2025 additions and reclassifications are not listed); PMC9089898 (AMS programme characteristics in Ugandan hospitals; captcha and rate limit); National Drug Authority register (nda.or.ug blocked from this environment); MoH library copy of UCG 2023; WHO ATC/DDD index (not attempted, so no DDD values).

# Strand 2: Drug-drug interactions

_Source file: INTERACTIONS.md_

# Drug-drug interaction checking: research note (Phase 3)

Strand: drug-drug interactions (DDIs). Accessed 24 October 2026. Companion file: `interaction-candidates.json` (78 candidate pairs, 72 sources, 14 gaps).

Everything below is a **candidate draft for signature**. No pair, severity, wording or rule acts in MedSync until a pharmacist reviewer and the Clinical Safety Officer sign it. MedSync informs and never blocks care. It never converts doses, so where a source gives a dose change the candidate says "see source".

## 1. What was opened and what was not

- **Opened:** NLM RxNav notice; the Phansalkar, Payne, van der Sijs, Paterno, Nanji and Cornu papers (abstract or full text, as marked in the sources list); vendor pages (Wolters Kluwer, FDB, Merative, DrugBank, MedicinesComplete); DDInter 2.0 site, terms and paper; Liverpool HIV terms and four interaction pages; 30 FDA labels on DailyMed; UCT MIC, NYSDOH and SAHCS HIV/TB interaction guidance; four Ugandan studies (antimalarial and contraceptive pharmacokinetics, herbal use).
- **Not opened (main gaps):**
  - **Uganda HIV guidelines 2022 [S62]:** only the front matter and table of contents could be read. The fetch tool truncates the PDF after about 30 pages, and the proxy blocks direct download.
  - **Not opened at all:** the Uganda Clinical Guidelines 2023, EMHSLU 2023, the Uganda TB manual, the WHO TB/HIV interaction annexes, and NDA product information.
  - **What this means:** the Uganda-relevance lines use published Ugandan studies and the Uganda guideline's table of contents, not its interaction tables.
  - The full gap list is in the JSON.

## 2. Knowledge-base options and licensing

| Option                                                     | Owner                                                     | Licensing model (as stated on the page opened)                                                                                                                                                                                                                                                                                                                | Prices public?                                                                     | Embed in a commercial product?                                                                                                                                        |
| ---------------------------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| UpToDate Lexidrug (formerly Lexicomp)                      | Wolters Kluwer                                            | Personal subscriptions or groups of up to 19 clinicians; enterprise licence; EHR integration (Epic, MEDITECH, Cerner); "Lexidrug Web Services" for in-workflow content; interaction checker included [S63][S64]                                                                                                                                               | No. The pro and enterprise pages send buyers to sales or a contact form [S63][S64] | Only under a negotiated commercial or integration licence                                                                                                             |
| Medi-Span                                                  | Wolters Kluwer                                            | Database and API offerings; licensing terms not stated; "contact us" [S65]                                                                                                                                                                                                                                                                                    | No [S65]                                                                           | Only under licence. It is built for embedding, but terms were not visible                                                                                             |
| FDB MedKnowledge                                           | First Databank                                            | Integration by "direct programming, developer software, MCP server or web API"; interaction module listed; described as for the US and Canada, with a separate International site [S66]                                                                                                                                                                       | No. Contact form only [S66]                                                        | Only under licence; non-US coverage needs confirming                                                                                                                  |
| Micromedex                                                 | Merative                                                  | Subscription; desktop, mobile and EHR integration; interaction checker [S67]                                                                                                                                                                                                                                                                                  | No [S67]                                                                           | Only under licence                                                                                                                                                    |
| DrugBank                                                   | OMx / DrugBank                                            | Academic data under CC BY-NC 4.0 (free, non-commercial); commercial use goes through a pricing page and demo; academic downloads "temporarily paused"; a CC0 "Open Data" subset exists (its contents were not checked) [S15]                                                                                                                                  | No prices on the page opened [S15]                                                 | Not under the academic licence. A paid commercial licence is needed                                                                                                   |
| Stockley's Drug Interactions and BNF via MedicinesComplete | Pharmaceutical Press                                      | Individual and organisation subscriptions, "tailored packages"; data licensing for integration not described; data-licensing page failed to load [S68]                                                                                                                                                                                                        | No [S68]                                                                           | Unknown. Must ask the publisher                                                                                                                                       |
| ONC / Phansalkar 2012 high-priority list (15 class pairs)  | Published article (JAMIA, BMJ Publishing Group copyright) | Consensus list from a panel of KB vendors, EHR vendors, academic developers and regulators. The panel judged it "contraindicated for concurrent use" but "not necessarily complete" [S3]. The 15 pairs are reproduced in Cornu 2018, Table 2 [S4]                                                                                                             | Article is paywalled [S3]                                                          | Usable as a cited reference. MedSync writes its own wording; legal check advised on reuse                                                                             |
| Phansalkar 2013 non-interruptive list (33 class pairs)     | Published article (JAMIA)                                 | 33 low-priority class pairs; at one site they made up 36% of displayed alerts [S5]. The list itself was not opened                                                                                                                                                                                                                                            | n/a                                                                                | As above; obtain the full text first                                                                                                                                  |
| DDInter 2.0                                                | Computational Biology and Drug Design Group               | About 2,310 drugs and 302,516 DDI records, plus drug-food, drug-disease and duplication data [S14]. Data under **CC BY-NC-SA 4.0**; no liability accepted [S13]                                                                                                                                                                                               | Free                                                                               | **No.** NonCommercial and ShareAlike terms bar embedding without separate permission                                                                                  |
| Liverpool HIV Drug Interactions (and sister sites)         | University of Liverpool                                   | Free to consult for clinicians [S71]. Terms: "own non-commercial use"; content may not be "reproduced... or otherwise exploited for any commercial purpose", or incorporated "into a different website or product" without prior written consent [S16]. The Liverpool page opened names HIV, hepatology and COVID-19; no TB-specific site was confirmed [S71] | Free                                                                               | **No**, without written consent. Clinicians can still be pointed to it                                                                                                |
| FDA labels via DailyMed                                    | NLM / FDA, manufacturer text                              | Free REST API (XML/JSON) for SPL documents by set ID [S70]. US government works are not under US copyright, but NLM says third-party content may be copyrighted and it cannot guarantee status [S69]                                                                                                                                                          | Free                                                                               | Probably usable as a source for MedSync's own authored statements, with attribution; legal check advised. These are US labels, not NDA-registered product information |
| NLM RxNav Drug Interaction API                             | NLM                                                       | "The Drug-Drug Interaction API will be discontinued on or about January 2, 2024" [S1]. DrugBank notes it was partly powered by DrugBank data and lacked severity and management detail [S2]                                                                                                                                                                   | n/a                                                                                | **Not an option.** Discontinued                                                                                                                                       |

**Summary.** Nothing free can be embedded wholesale in a commercial product:

- DDInter is NonCommercial and ShareAlike [S13].
- Liverpool forbids it without written consent [S16].
- DrugBank's free tier is academic only [S15].
- RxNav's interaction service is gone [S1].

What MedSync can legitimately use without a commercial licence:

- its own pharmacist-authored list, citing public primary sources (FDA labels [S69][S70], ministry and WHO guidelines once opened, peer-reviewed studies);
- the ONC lists as a cited reference set [S3][S4][S5].

Every commercial knowledge base needs a negotiated licence, and none publishes a price.

## 3. Recommendation

**Step 1 (now): ship a short, signed severe list.**

- From the 78 candidates, the pharmacist reviewer signs the "contraindicated" and "serious" pairs that apply to EMHSLU 2023 items, written in MedSync's own words with sources.
- In the JSON these are 61 pairs: 18 contraindicated and 43 serious.
- Each signed rule carries a version, signer, date and source ids. Severity follows the source's own wording:
  - **contraindicated**: the label says contraindicated or "do not";
  - **serious**: avoid, not recommended, or a dose change needed;
  - **monitor**: monitor, or separate the doses.
- Where sources disagree, the pharmacist decides before signing. Examples: efavirenz with rifampicin (FDA label vs SAHCS [S28][S23]); lopinavir/ritonavir with rifampicin (label contraindication vs the SAHCS adjusted regimen [S27][S23]).
- Before sign-off, close the Uganda gap: read the Uganda HIV guideline 2022 interaction tables at pp.92-93, 163-170, 195, 202 and 281 [S62], plus UCG 2023 and the TB manual. A local or MoH-library copy is needed, because the online PDF could not be read past about 30 pages.

**Step 2 (in parallel): price a knowledge base.** Send one written request for quotation to Wolters Kluwer (Medi-Span and Lexidrug), FDB (International), Merative (Micromedex), DrugBank (commercial) and Pharmaceutical Press (Stockley's). Ask each:

1. **Licence scope:** embedding in a multi-tenant SaaS hospital system in Uganda, priced per facility or per bed, with a small-hospital tier.
2. **Mapping:** coverage of non-US products, mapping by INN or ATC to EMHSLU items, and handling of generics that are not on the US market.
3. **Severity scheme:** documented definitions, mappable to MedSync's three tiers. Phansalkar shows vendors use different labels and agree poorly [S6].
4. **Local control:** the right to suppress, downgrade or annotate rules, and to show MedSync's own signed wording beside vendor text.
5. **Operations:** offline caching and update cadence.
6. **Legal:** liability and indemnity terms.

A separate option is to ask the Liverpool group for written consent to link to, or reproduce, HIV/TB content. Liverpool authors already co-publish with Ugandan investigators at the Infectious Diseases Institute and Makerere [S56].

**Do not:** embed DDInter or Liverpool content without permission, or build on RxNav.

## 4. Alert design rules supported by evidence

1. **Tier by severity, and interrupt only for the top tier.**
   - A tiered site accepted 100% of the most severe alerts, against 34% at a non-tiered site; overall compliance was 29% against 10% [S9].
   - A panel identified 33 class pairs that should be non-interruptive; at one site these were 36% of displayed alerts [S5].
   - _MedSync rule (candidate):_ "contraindicated" needs an acknowledgement with a reason; "serious" is shown prominently but needs no acknowledgement; "monitor" is information only.
2. **Never hard-stop.**
   - In a randomised trial, a near hard-stop for warfarin with co-trimoxazole was stopped early after clinically important treatment delays in four patients [S10].
   - A systematic review found hard stops can cause delays in care [S11].
   - In five international systems, hard stops existed only in the US and UK [S4].
   - This matches the house rule that MedSync never blocks care.
3. **Keep the interruptive list small, because most alerts are overridden.**
   - Drug safety alerts were overridden in 49% to 96% of cases [S7][S72].
   - Interruptive high-priority DDI alerts were overridden in 56.7% to 83.3% of cases across five systems [S4].
   - In one hospital, 73.3% of allergy, DDI and duplicate alerts were overridden, and about 40% of those overrides were inappropriate [S12].
   - Low specificity and unnecessary workflow interruption drive this [S7].
4. **Use consistent terms, minimal text, and a fixed structure** (mechanism, effect, what to do). Show the alert, and the action taken, to every clinician in the medication chain, including the pharmacist [S8].
   - _MedSync:_ the prescriber's acknowledgement and reason appear in the pharmacist's review lane (Phase 1), and the pharmacist's coded query goes back to the prescriber.
5. **Use patient context where the rule depends on it** (for example renal function or potassium). Alerts that ignore it fire whether or not the risk applies [S6].
   - _Candidate:_ hyperkalaemia pairs (CAND-052 to 055) show the latest potassium and creatinine when available.
6. **Do not interrupt for intended combinations.**
   - Rifampicin with isoniazid (CAND-038) is a standard co-formulated regimen. The source warns of hepatotoxicity [S30], but an interruptive alert would be noise.
   - This is an inference from the non-interruptive principle [S5], not a tested finding.
7. **Do not treat override rate as the success measure.** Override rates may not reflect alert effectiveness [S8], and appropriateness of overrides varies widely by alert type [S12].
   - _MedSync:_ measure acceptance by tier, the pharmacist's judgement of whether each override was appropriate, and any dispensing delay caused by alerts.
8. **Where the source gives a dose change, the alert says "see source"** and links to it. MedSync never converts doses.
9. **Patient-facing messages never name a medicine.** Any patient prompt from an interaction, for example "please speak to your pharmacist about your medicines", stays generic.
10. **Ask about herbal and over-the-counter use.**
    - In Ugandan HIV clinics, 33.7% [S58] and 46.4% [S59] of patients on ART reported herbal use, and 92.3% said their doctors did not know [S59].
    - The UCT sheet advises asking about OTC products that contain polyvalent cations [S21].
    - _Candidate:_ the medication history captures "herbal / OTC: yes, no, not asked", so a missing record is visible.

Not supported by an opened source: limits on repeat alerts for the same pair (the relevant Ancker 2017 paper could not be opened), and Payne's seven core elements (abstract only [S8]).

## 5. What "no alert" must say

A silent screen reads as "safe". The evidence says the reverse:

- the ONC panel called its own list "not necessarily complete" [S3];
- knowledge bases disagree on what is severe [S6];
- herbal and OTC use is common and mostly undisclosed [S58][S59].

Candidate wording when no rule fires:

> **No interaction found in MedSync's checked list.** List version [v], signed [date] by [pharmacist]. It covers [N] medicine pairs only and is not a complete interaction check. Herbal and over-the-counter products are checked only if recorded. Use clinical judgement and ask the pharmacist if unsure.

Rules for this message:

- It always shows the list version and the number of pairs covered.
- It says plainly that coverage is partial.
- It notes when herbal or OTC use has not been asked.
- It never says "safe" or "no interactions".
- If a licensed knowledge base is added later, it names which sources were checked.

## 6. Uganda-relevant interaction findings

**HIV and TB.**

- Dolutegravir with rifampicin needs a dose-frequency change, continued for about two weeks after rifampicin stops, and should be avoided with integrase resistance [S17][S24][S21][S22][S23].
- Dolutegravir is chelated by polyvalent cations:
  - antacids cut exposure by about 74% when taken together [S18];
  - calcium and iron can be taken with food or at separated times [S24][S21][S22];
  - this matters because iron and calcium are routine in antenatal care.
- Daily rifapentine should not be given with dolutegravir. Weekly rifapentine (3HP) with standard dolutegravir needs virological monitoring [S22].
- Boosted protease inhibitors are contraindicated with rifampicin on the labels [S26][S27][S30], although SAHCS allows adjusted lopinavir/ritonavir with liver monitoring [S23].
- Nevirapine should not be given with rifampicin [S29].
- The Uganda guideline's own ART-TB and DTG-TPT sections (pp.163-170) were not read [S62].

**Antimalarials.**

- **Rifampicin with artemether/lumefantrine:** contraindicated as a strong CYP3A4 inducer [S25]. A Ugandan study found artemether exposure 89% lower and lumefantrine 68% lower [S54].
- **Efavirenz with artemether/lumefantrine:** lowers lumefantrine exposure. In Ugandan adults lumefantrine exposure fell by about 56% (AUC) [S55]; Liverpool advises caution [S20].
- **Quinine:** avoid with rifampicin, macrolides and neuromuscular blockers [S32].
- **Artemether/lumefantrine with QT-prolonging CYP2D6 substrates such as amitriptyline:** these should not be co-administered [S25].

**Contraception.** A Ugandan three-arm study observed unintended pregnancies with the levonorgestrel implant on efavirenz-based ART [S56]. FHI 360, citing WHO MEC, reports higher pregnancy rates with two-rod levonorgestrel implants on efavirenz, and no reduction in DMPA effect [S57]. Rifampicin also lowers contraceptive effect [S30].

**Classic hospital pairs** are included from FDA labels:

- warfarin with co-trimoxazole, metronidazole, fluconazole, macrolides, amiodarone, NSAIDs and aspirin [S33];
- methotrexate with co-trimoxazole [S41];
- spironolactone or potassium with ACE inhibitors [S42][S43];
- simvastatin with clarithromycin or itraconazole [S35][S36];
- ergotamine with CYP3A4 inhibitors [S38];
- sildenafil with nitrates [S37];
- tramadol with SSRIs, MAOIs and benzodiazepines [S39];
- linezolid with SSRIs [S40];
- fluconazole with erythromycin [S34];
- ceftriaxone with calcium in neonates [S49];
- meropenem with valproate [S50];
- gentamicin with furosemide [S53].

**Herbal medicines.**

- **How common:** use alongside ART is widespread in Uganda: 33.7% of 401 TASO patients [S58] and 46.4% of 334 Mbarara patients, mostly aloe vera and _Vernonia amygdalina_ [S59].
- **Interaction evidence:**
  - A Mbarara randomised trial of _Artemisia annua_ and _Moringa oleifera_, taken 8 hours apart from ARVs, found no difference in efavirenz or nevirapine levels. The authors note the follow-up was short [S60].
  - In vitro, _Hypoxis hemerocallidea_ (African potato) and _Sutherlandia_ inhibited CYP3A4 and activated PXR, but the concentrations may not reflect those reached in patients [S61].
- **What MedSync can do:** there is no Ugandan herb-specific clinical interaction pair to sign. MedSync's realistic step is to record herbal use and show it in the pharmacist lane; the herbal candidate (CAND-078) is information only. St John's wort pairs come from labels [S24].

## 7. Counts

- **Candidate pairs:** 78.
  - 18 contraindicated, 43 serious, 17 monitor.
  - Every pair cites at least one opened source.
  - Two pairs use a class only, where the source states a class effect: QT-prolonging combinations [S4], and ceftriaxone with calcium-containing IV solutions [S49].
- **By theme:**
  - 39 HIV, TB, antimalarial and contraceptive pairs (CAND-001 to 039);
  - 38 classic hospital pairs (CAND-040 to 077);
  - 1 herbal pair (CAND-078).
- **Sources:** 72, all opened on 24 October 2026. 44 are cited in pairs; the rest support licensing and alert design.
- **Gaps:** 14, listed in the JSON. The main ones:
  - Uganda HIV guideline interaction tables, UCG 2023, EMHSLU 2023 and the TB manual not read;
  - no commercial prices published;
  - the 33-pair non-interruptive list and Payne's seven elements not opened;
  - several FDA labels are old repackager copies needing a current check;
  - no NDA product information consulted.

# Strand 3: Suspected reactions, pharmacovigilance and the allergy list

_Source file: PV.md_

# Suspected adverse drug reactions, pharmacovigilance and the allergy list

Strand: suspected adverse drug reactions (ADRs) and pharmacovigilance (PV) in Uganda, and the allergy list. Phase 3 research for the MedSync pharmacy. Everything below is a **candidate draft for signature** by a pharmacist reviewer and the Clinical Safety Officer (CSO). Nothing here acts in the product until it is signed.

Companion file: `adr-report-fields.json` (38 form fields, 8 routes, 6 causality categories, 6 seriousness criteria, 9 gaps).

---

## 1. The national route from a hospital

### 1.1 Who runs it

- The National Drug Authority (NDA) hosts the **National Pharmacovigilance Centre (NPC)** [S7]. Reports go to the NPC offices or to a **Regional Pharmacovigilance Centre** [S1]. In 2015/16 these were hosted by 13 regional referral hospitals, whose coordinators collected paper forms from facilities in their catchment [S5].
- Inside a facility, the **Medicines and Therapeutics Committee (MTC)** carries PV through a Pharmacovigilance subcommittee. It should "establish a file/database of all ADRs at the facility", assess causality for all ADRs with the WHO-UMC method, review severity, quality issues and possible medication errors, and escalate serious ADRs and clusters to the full MTC [S9]. This is the MoH guideline MedSync should design to. It is the second edition, June 2025.

### 1.2 Legal basis

- **The National Drug Policy and Authority (Pharmacovigilance) Regulations, 2014**, S.I. 2014 No. 37. Reg. 6: a health care professional "shall report any serious adverse drug event" arising during health care. No recipient is named and no timeline is set. Reg. 9 makes withholding safety information an offence. The schedule gives a "Format of Report on Suspected Adverse Drug Reactions for Human Drugs" in six parts: patient, drug, reaction, other drugs, comments, reporter. It states that identities are kept "strictly confidential" [S3].
- **The National Drug Policy and Authority (Pharmacovigilance) (Amendment) Regulations, 2021**, S.I. No. 41 of 2021. These keep the Reg. 6 duty, add definitions of "falsified drug" and "substandard drug", and require any licensed person, health professional or other person to report suspected falsified or substandard drugs in a format the Authority approves (Reg. 7). The Authority may halt supply while it investigates. There is still no ADR timeline, no electronic-reporting provision and nothing on medication errors [S4].
- **National guideline:** the NDA publishes _Guidelines on Detecting and Reporting Adverse Drug Reactions in Uganda_ (nda.or.ug, uploaded 2022/02). **I could not open it** after three attempts (site error), so its year and content are unverified. The working references are the _Uganda National Training Manual for Health Workers on Pharmacovigilance: Trainee Handbook_ (MoH with NDA and WHO; file signed February 2020) [S1] and the MoH MTC guideline (2025) [S9].

### 1.3 The form

- The current national form is a **combined ADR/AEFI form**. The ADR and AEFI forms were merged and pretested in 2015/16 [S5]. The MTC guideline titles it "Adverse Reaction Report/Adverse Event Following Immunization Form" (Annex 3.2) [S9]. The training manual calls it the "NDA ADR reporting form" and reproduces it [S1].
- **Version:** I found no version number, form code or print date anywhere.
- **Sections:** A Category (what the report is about, and the event type), B Patient, C Suspected drug(s), D Concomitant drug(s), E Reaction details, F Reporter [S1].
- **Event types on the form:** suspected ADR, AEFI, suspected or observed inefficacy, observed poor-quality product, medication error, suspected counterfeit [S1]. So one form covers ADRs, therapeutic failure, quality complaints, medication errors and suspected falsified products.
- **Required fields:** the older MoH/NDA form (c. 2015) marked six fields mandatory: age at onset, sex, generic name, date started, date the reaction started, and reporter name [S2]. The 2020 manual gives a four-element minimum [S1]:
  - a source: name plus phone or email;
  - a patient identifier: name or initials, plus a hospital ID;
  - the suspected drug and the date it was first taken;
  - the reaction and the date it started.

  The JSON marks 8 fields `required: true` from these two sources. The rest are `"unknown"`.

### 1.4 Routes accepted

| Route                                                                                                                                      | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Online e-reporting (WHO-UMC primary reporting, feeds VigiFlow) `https://primaryreporting.who-umc.org/Reporting/Reporter?OrganizationID=UG` | The NDA site advertises an "ADR & AEFI REPORTING TOOL" [S11] and an "NDA Adverse Drug Reporting System" under Online Services [S10], but I could not read where those links go. NDA listed it as its online reporting address in 2015/16 [S5]. The page was live on 2026-10-24 and is titled "'CONFIDENTIAL' Suspected adverse event e-reporting", covering "all drugs, vaccines, herbal products, medical devices and other health products" [S6]. |
| Med Safety app (Android, iOS)                                                                                                              | Launched by NDA on 27 February 2020 "for the public and health workers" [S8]. Reports go directly to the NPC [S7]. In a cluster-randomised trial it raised health-worker reporting rates (IRR 1.73) [S7].                                                                                                                                                                                                                                           |
| Paper form                                                                                                                                 | Collected by PV focal persons, drug regulatory officers or regional centre coordinators [S5][S7].                                                                                                                                                                                                                                                                                                                                                   |
| Email druginfo@nda.or.ug                                                                                                                   | [S1][S2]. Email carried 53% of reports in 2019, paper about 30% [S8].                                                                                                                                                                                                                                                                                                                                                                               |
| WhatsApp 0791415555; toll-free 0800101999; telephone 0417788100/1                                                                          | [S1]. The MTC guideline lists "the NPC hotline, WhatsApp, Email, and web link" [S9].                                                                                                                                                                                                                                                                                                                                                                |
| NDA Market Complaint Form, for product quality                                                                                             | NDA home page lists "Market Complaint Request Form - Part 1" [S10]. Per the MTC guideline, "The quality problem should be reported to the NDA and the supplier" [S9]. I did not open the form itself.                                                                                                                                                                                                                                               |

**Who may report:** all health care practitioners [S1], and the public through Med Safety [S8]. The 2015/16 report said consumer reporting was planned [S5]. Reg. 7 extends the duty to report suspected falsified products to "any other person" [S4].

**Timelines (conflict, needs a decision):**

- Training manual: serious reports "within 24 to 48 hours of notification"; non-serious "within 15 calendar days" [S1].
- MTC guideline 2025: serious "MUST be reported within 48 hours"; non-serious "within 7 days of notification" [S9].
- The regulations set none [S3][S4].
- Candidate for signature: show a due-by clock of 48 h for serious and 7 days for non-serious (the newer, stricter MoH text), and confirm with NDA.

**AEFI (note only):** the same combined form carries AEFI [S1][S9]. Vaccine events belong to the immunisation programme route and are out of scope here. Med Safety was not designed for COVID-19 vaccine AEFI [S7].

### 1.5 Electronic submission from a facility system

- VigiFlow is the national PV database used by national centres. It is ICH E2B(R3) compatible [S14], and "can receive safety data from any system that supports ICH E2B", with Med Safety named as an example [S15]. UMC describes interoperability through E2B only. **No public API or hospital/EHR gateway is described** [S14][S15].
- I found **no NDA statement** on accepting E2B XML or any machine submission from a facility system. I did not open the ICH E2B(R3) implementation guide.
- **Conclusion for Phase 3:** MedSync does not submit electronically. It prepares a complete report and the reporter sends it by one of the human routes. An E2B(R3) export is a later option, and only with written NDA agreement and a data-sharing arrangement.

---

## 2. Assessment vocabularies (keep them separate)

MedSync must hold five axes as distinct fields and never derive one from another:

1. **Seriousness** (regulatory; drives the timeline). ICH E2A lists death, life-threatening, inpatient hospitalisation or prolongation, persistent or significant disability/incapacity, and congenital anomaly/birth defect. Other medically important events call for "Medical and scientific judgment" and "should also usually be considered serious" [S13]. The Uganda form adds the tick box "Other important medical condition (specify)" [S1]. E2A: "Seriousness (not severity) serves as a guide for defining regulatory reporting obligations" [S13].
2. **Severity** (intensity of the event: mild, moderate, severe; FHIR `reaction.severity`) [S16].
3. **Causality**, using the WHO-UMC categories: certain, probable/likely, possible, unlikely, conditional/unclassified, unassessable/unclassifiable [S12]. Definitions are in the JSON. They are close paraphrases, so copy the verbatim WHO text from S12 before signature. Two points from the source: all criteria should be "reasonably complied with", and the system gives no reliable quantitative likelihood [S12]. Causality is assessed by the facility PV subcommittee [S9] and again by the NPC [S1]. A causality entry is never required before a report can be sent.
4. **Criticality** (future risk on the allergy list: low, high, unable-to-assess) [S18].
5. **Verification** of the allergy entry: unconfirmed, presumed, confirmed, refuted, entered-in-error [S17].

**Minimum valid case** (ICH E2A): "an identifiable patient; a suspect medicinal product; an identifiable reporting source" plus the event [S13]. The NDA four-element minimum matches this [S1]. MedSync should let a report be marked "ready to send" once these four are present, and show the other fields as "add if known". The e-reporting page itself asks for reports "even if you do not have all the details" [S6].

---

## 3. What MedSync should record

One **Suspected reaction** record per event, raised from any clinical surface: prescriber, ward, pharmacy queue, or a coded query during review. It holds:

- **Event type**, as on the national form: ADR, inefficacy, poor-quality product, medication error, suspected counterfeit.
- **Suspect drug(s).** Each one links to its prescription line and its **dispensing record with batch, brand and expiry** (Phase 1 batch stock), plus the first administration time where the ward record has it.
- **Concomitant medicines from the last 3 months** [S1], pre-listed from prescriptions, dispensing and reconciliation. Herbal and over-the-counter medicines are asked.
- **Reaction**: narrative, onset date and time, stop date, treatment given, selected lab results, outcome, death and autopsy fields.
- **Seriousness** (yes/no plus reasons), **severity**, **causality** (WHO-UMC, by the PV subcommittee, with assessor and date), and **dechallenge/rechallenge** if known.
- **Reporter**: the signed-in user, with designation and contacts.
- **Workflow state**: draft, ready, sent (route, date, by whom), NDA acknowledgement or reference if received, follow-up updates, and MTC review date.
- **Sample retained (y/n) and location.** The manual asks for the sample to be attached for therapeutic failure [S1].
- **Allergy-list link** (section 6).

This record is the facility "file/database of all ADRs" the MTC guideline asks for [S9]. It also feeds the Phase 3 intervention review and the MTC summary reports. Medication errors, including those caught before harm, use the same record, framed as blame-free reporting [S9].

---

## 4. What MedSync prints or copies for the NDA

- **A print view laid out in the national form's section order (A to F)** for hand-filling or attaching to the paper route. The form version is unknown, so MedSync should not reproduce the form's branding. It prints "Prepared for the national ADR/AEFI reporting form" with the fields in order.
- **A copy panel for the e-reporting page and for Med Safety.** It shows one block per section in field order, each with a copy button, so the reporter can paste into the WHO-UMC form or the app.
- **An email draft** to druginfo@nda.or.ug with the same structured text. No attachment carries identifiers.
- **A product-quality variant** for the NDA Market Complaint Form and the supplier: product, brand, batch, expiry, manufacturer, description of the defect, sample held. This form's fields are still to be confirmed (gap).
- Every output carries the **MedSync report reference** in place of the hospital number. This gives the NPC a de-duplication and follow-up handle without disclosing the medical record number.
- MedSync records which route was used and when. It never sends anything itself.

---

## 5. What leaves MedSync

**Leaves:**

- patient **initials, age at onset, sex**, weight, pregnancy status, LMP or trimester when relevant, and district;
- the facility name;
- drug, batch and reaction details;
- outcome;
- the reporter's own name, designation and work contact;
- the MedSync report reference.

**Does not leave:**

- full name, date of birth, village, patient telephone;
- MRN or hospital number, National ID number;
- lab accession numbers;
- free text that contains identifiers. MedSync shows a warning on the narrative box. It should not try automatic redaction.

**The conflict:** the NDA manual asks for the patient's full name and address for follow-up and de-duplication [S1], and the form has a "Patient village and telephone" field [S1]. MedSync's initials-only rule is stricter. Whether it satisfies Reg. 6 and the NDA's needs is a legal question (section 8). Until it is answered, the reporter can still hand-write identifiers on the paper form, outside MedSync. MedSync does not pre-fill them.

---

## 6. The allergy list, and how a suspected reaction enters it

### 6.1 Model (HL7 FHIR AllergyIntolerance, R5 5.0.0, maturity 3 [S16])

- **clinicalStatus**: active, inactive, resolved. **verificationStatus**: unconfirmed, presumed, confirmed, refuted, entered-in-error [S16][S17].
  - unconfirmed: "has not been objectively verified".
  - confirmed: objectively verified, which may be by testing, rechallenge or observation.
  - refuted: "disputed or disproven with enough clinical certainty to invalidate the assertion" [S17].
- **Invariants:** "clinicalStatus SHALL be present if verificationStatus is not entered-in-error" and "SHALL NOT be present if verification Status is entered-in-error" [S20].
- **type**: allergy (a propensity for hypersensitive reactions, typically type I plus "allergy-like" reactions including pseudoallergy) or intolerance (judged "not allergic or 'allergy-like'", typically non-immune) [S19]. FHIR warns that type "is not a proxy for seriousness or risk of harm" [S16]. MedSync should let type stay empty ("not yet determined").
- **category**: medication. **criticality**:
  - low: worst case of a future exposure "not assessed to be life-threatening";
  - high: assessed to be life-threatening or with high potential for organ system failure;
  - unable-to-assess [S18].
- **code** is the substance. MedSync uses the EMHSLU 2023 generic name.
- **reaction[]**: manifestation (1..\*), description, onset, severity (mild/moderate/severe for the event as a whole), exposureRoute, note [S16].
- FHIR misuse note: AllergyIntolerance is "Not to be used as a proxy for an adverse event report" [S20]. NICE likewise says to document drug allergy status separately from ADRs [S21]. So the **Suspected reaction record and the allergy entry are two linked objects**, never one.

### 6.2 Good practice (NICE CG183, Drug allergy [S21])

- **Status** is one of "drug allergy", "none known" or "unable to ascertain" (1.2.1). MedSync must distinguish _none known_ (asked, nil) from _not yet asked_.
- **Minimum content** for a drug allergy entry: drug name, signs, symptoms and severity of the reaction, and the date (1.2.2).
- **A new suspected reaction** should record generic and proprietary names with strength and formulation, a description of the reaction, the indication, date and time, the number of doses or days before onset, the route, and drugs or drug classes to avoid (1.2.3).
- **Visibility:** keep allergy status "clearly visible to all healthcare professionals who are prescribing drugs" (1.2.5). Check and confirm it with the person before prescribing, dispensing or administering (1.2.6). Include it in discharge letters (1.2.7). This links to Phase 3 discharge reconciliation.
- **Patient information:** give structured written information on the drugs to avoid (1.3). Refer after suspected anaphylaxis or a severe non-immediate skin reaction (DRESS, SJS/TEN) (1.4).
- I could not open the CG183 overview page, so its last-updated date is not confirmed.

### 6.3 Candidate flow for signature

1. Saving a Suspected reaction of type ADR offers **"Add to allergy list as unconfirmed"**. It creates one entry **per suspect substance**, each starting as `unconfirmed`, as FHIR advises when several substances may be responsible [S20].
   - clinicalStatus: active.
   - criticality: `unable-to-assess` until a clinician sets it.
   - type: empty.
   - reaction: manifestation and severity copied from the report.
2. The entry shows on every prescribing, dispensing and administration surface as **"Suspected, not confirmed"**. It **informs and never blocks**, in line with the house rule.
3. **A clinician confirms or refutes it.** Refuted entries stay visible in history with a reason and the clinician's name. They are not deleted. `entered-in-error` removes clinicalStatus, per the invariant.
4. **Class-level avoidance** (for example beta-lactam cross-reactivity) is clinical content. It needs its own signed list. This strand proposes none.
5. Confirming an entry does not change the ADR report's causality, and the reverse also holds. The two are linked, not synchronised.

**Conflict to resolve:** NICE asks for written information naming the drugs to avoid [S21]. The house rule says patient messages never name a medicine. Candidate resolution for the CSO: a printed allergy card handed over in person by a clinician is not a "patient message". Digital messages say only "You have an allergy alert on your record; please show your card to any health worker".

---

## 7. Link to batch recall (Phase 2)

- Every suspect drug in a report carries **batch, brand and expiry** from the dispensing record. These are the form fields NDA asks for [S1].
- **When a recall is raised** in Phase 2 for a batch, MedSync shows the Suspected reaction records already linked to that batch and the patients dispensed from it. The pharmacist can then decide whether to add follow-up reports.
- **When reports start to cluster** on one batch, or a poor-quality, suspected-counterfeit or inefficacy report is filed, MedSync prompts the pharmacist to:
  - consider quarantining the remaining stock of that batch;
  - file the Market Complaint Form to NDA and the supplier [S9];
  - keep a sample [S1].

  MedSync informs only. It never quarantines automatically. The threshold for a "cluster" is a candidate number that needs signature. The MTC guideline asks for clusters to be escalated but gives no number [S9].

- **Regulatory context:** recall is among the regulatory actions that follow report analysis [S1]. Reg. 5(d) lists a recall as a ground for investigation [S3]. The 2021 amendment lets NDA halt supply during an investigation of a falsified or substandard product [S4]. The NDA keeps a public "Drug recalls" register [S10]. Phase 2 recall should record the NDA notice reference.

---

## 8. Questions that need a legal answer

1. **Patient identifiers to the NDA.** Is initials, age and sex plus a facility reference lawful and sufficient for Reg. 6 [S3][S4]? Is sending the full name, village and telephone the NDA asks for [S1] lawful without patient consent under the Data Protection and Privacy Act 2019 (not opened)? Does the statutory duty provide a lawful basis?
2. **Who carries the duty.** Reg. 6 places it on the individual health care professional. Is a facility or MTC submission enough? Does the duty cover only _serious_ events, with all others voluntary?
3. **Timelines.** Which binds: 24 to 48 h and 15 days [S1], or 48 h and 7 days [S9]? Neither is in the regulations.
4. **Electronic submission.** Would the NDA accept E2B(R3) XML or another machine route from MedSync? What data-sharing agreement would be needed?
5. **Protection of reports.** Are internal ADR and medication-error records privileged from disciplinary or legal use? The MTC guideline asks for blame-free reporting [S9], but the regulations are silent [S3][S4]. What retention period applies?
6. **The patient allergy card naming a medicine** versus the house rule (section 6.3). This is a CSO decision, but it may also carry liability.
7. **Reporting on a patient's behalf.** Is consent needed before a clinician reports? Can MedSync suggest Med Safety self-reporting to patients without naming the drug?

---

## 9. Counts and gaps

**Counts:** 21 sources opened. In the JSON: 38 form fields (8 required true, 30 unknown), 8 routes, 6 causality categories, 6 seriousness criteria, 9 gaps.

**Could not open:**

- NDA _Guidelines on Detecting and Reporting ADRs in Uganda_ PDF (three attempts);
- NDA Annual PV report 2019/20;
- NDA product-safety page and the online "NDA Adverse Drug Reporting System" link;
- the NDA Market Complaint Form;
- the WHO-UMC-hosted causality PDF (login wall; the WHO-hosted copy was used instead);
- PMC article pages (captcha; Europe PMC used instead);
- Europe PMC record PMC12581420 on incomplete Ugandan ADR reports (rate-limited);
- the NICE CG183 overview page;
- the ICH E2B(R3) guide;
- the Data Protection and Privacy Act 2019.

**Main gaps:**

- no current form version;
- conflicting timelines;
- no NDA position on machine submission;
- the patient-identifier conflict;
- Market Complaint Form fields unknown;
- WHO-UMC wording to be copied verbatim before signature;
- `medsyncSource` mappings to check against the real schema.

---

## Sources (all accessed 2026-10-24)

- [S1] MoH/NDA. _Uganda National Training Manual for Health Workers on Pharmacovigilance: Trainee Handbook_ (file signed 13 Feb 2020; year not printed). https://aidstream.s3.us-west-2.amazonaws.com/documents/Trainee-handbook--Uganda-National-Training-for-Health-Workers-on-Pharmacovigilance_-Printable-Version_signed-20200213010223.pdf
- [S2] MoH/NDA _Suspected Adverse Drug Reaction Reporting Form_, reproduced as ESM 2 to a Drug Safety (2015) article on renal toxicity reporting in Uganda. https://www.springermedizin.de/resource/supplementary/40264_2015_277_MOESM2_ESM.pdf/24117274
- [S3] _The National Drug Policy and Authority (Pharmacovigilance) Regulations, 2014_, S.I. 2014 No. 37. https://faolex.fao.org/docs/pdf/uga171376.pdf
- [S4] _The National Drug Policy and Authority (Pharmacovigilance) (Amendment) Regulations, 2021_, S.I. No. 41 of 2021. https://www.nda.or.ug/wp-content/uploads/2022/03/NDPA-Pharmacovigilance-Amendment-Regulations-2021.pdf
- [S5] NDA National Pharmacovigilance Centre. _Annual Pharmacovigilance Report, July 2015 – June 2016_. https://medbox.org/index.php/dl/5e148832db60a2044c2d36b2
- [S6] WHO-UMC primary reporting, "'CONFIDENTIAL' Suspected adverse event e-reporting", OrganizationID=UG. https://primaryreporting.who-umc.org/Reporting/Reporter?OrganizationID=UG
- [S7] Kiguba R, Ndagije HB, et al. Adverse drug reaction reporting with the Med Safety app in Uganda: a cluster-randomised, controlled trial. _Lancet Glob Health_ 2025;13(10):e1761–e1770. doi:10.1016/S2214-109X(25)00299-2. Read via Europe PMC: https://www.ebi.ac.uk/europepmc/webservices/rest/PMC12446902/fullTextXML
- [S8] The Independent (Kampala), "NDA launches app to improve reporting of adverse drug reaction", 27 Feb 2020. https://www.independent.co.ug/nda-launches-app-to-improve-reporting-of-adverse-drug-reaction/
- [S9] Ministry of Health Uganda. _Guideline to Implement Activities for Medicine and Therapeutics Committee in a Health Facility_, 2nd ed., June 2025, Chapter 3. https://nms.go.ug/wp-content/uploads/2025/12/Guideline-to-implement-activities-for-medicine-and-therapeutics-committee-in-health-facility1.pdf
- [S10] NDA home page (Online Services > Product Safety; Registers > Drug recalls; Market Complaint Request Form). https://www.nda.or.ug/
- [S11] NDA services page ("ADR & AEFI REPORTING TOOL"). https://www.nda.or.ug/services/
- [S12] WHO. _The use of the WHO-UMC system for standardised case causality assessment_, 5 June 2013. https://cdn.who.int/media/docs/default-source/medicines/pharmacovigilance/whocausality-assessment.pdf?sfvrsn=5d8130bb_2&download=true
- [S13] ICH E2A. _Clinical Safety Data Management: Definitions and Standards for Expedited Reporting_, March 1995 (FDA-hosted copy). https://fda.gov/media/71188/download
- [S14] UMC. _VigiFlow: Introduction and basic features_, updated October 2019. https://www.who-umc.org/media/165665/1-introduction-and-basic-features-of-vigiflow.pdf
- [S15] UMC. "VigiFlow data collection". https://who-umc.org/vigiverse/vigiflow-data-collection/
- [S16] HL7 FHIR R5 (5.0.0) AllergyIntolerance. https://hl7.org/fhir/R5/allergyintolerance.html
- [S17] HL7 FHIR R5 AllergyIntolerance verification status value set. https://hl7.org/fhir/R5/valueset-allergyintolerance-verification.html
- [S18] HL7 FHIR R5 AllergyIntolerance criticality code system. https://hl7.org/fhir/R5/codesystem-allergy-intolerance-criticality.html
- [S19] HL7 FHIR R5 AllergyIntolerance type code system. https://hl7.org/fhir/R5/codesystem-allergy-intolerance-type.html
- [S20] HL7 FHIR R4 AllergyIntolerance (constraints; scope and misuse). https://hl7.org/fhir/R4/allergyintolerance.html
- [S21] NICE CG183 _Drug allergy: diagnosis and management_, Recommendations. https://www.nice.org.uk/guidance/cg183/chapter/Recommendations

# Strand 4: Reconciliation at discharge and intervention coding

_Source file: MEDREC-PCNE.md_

# Medicines reconciliation at discharge, and coding pharmacist interventions

Research note for MedSync pharmacy Phase 3. Strand: discharge reconciliation and PCNE coding.
Accessed: 24 October 2026. en-GB.

Everything proposed here is a **candidate draft for signature** by the pharmacist reviewer and the Clinical Safety Officer (CSO). Nothing in it acts in the product until both sign. MedSync informs and never blocks care, never converts doses, and patient messages never name a medicine.

Companion file: `pcne-codes.json` (102 PCNE V9.1 codes in 5 domains).

---

## 1. What the guidance says

### 1.1 Definitions

- **Medicines reconciliation**: the formal process in which health professionals work with patients to make sure medicine information is transferred accurately and completely at interfaces of care [S1][S3].
- **Best Possible Medication History (BPMH)**: a history taken by a clinician of all regular medicine use, prescribed and non-prescribed, from more than one source. It covers prescription and over-the-counter medicines, herbal and complementary products, recreational drugs and "as needed" medicines, recording name, dose, frequency and route. It is a snapshot of what the patient actually takes, which may differ from what was prescribed [S1]. The WHO report adds that it is built from a patient, family or caregiver interview checked against at least one other reliable source [S3].
- BPMH sources listed by High 5s: patient and family interview (primary, never replaced by other sources when an interview is possible), the patient's own lists or cards, medicines and containers brought in, community pharmacist, primary care doctor or referring facility, pharmacy and previous health records, home care providers [S1].
- **Medication review** is distinct from reconciliation: review decides whether each medicine should continue; reconciliation establishes what the patient was actually taking and makes sure the list is correct [S3].

### 1.2 Discrepancy taxonomy

From the WHO transitions report [S3] and High 5s SOP [S1]:

| Class                     | Meaning                                                                                                                         | Who can tell                                            |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| No discrepancy            | Lists agree                                                                                                                     | Record                                                  |
| Intentional, documented   | A deliberate change with the reason recorded                                                                                    | Record (the reason field exists)                        |
| Intentional, undocumented | A deliberate change, reason not recorded                                                                                        | A person (the prescriber must confirm intent)           |
| Unintentional             | A change with no conscious decision behind it; WHO subdivides into omission and commission (for example wrong dose, wrong drug) | A person (only the prescriber can say it was not meant) |

High 5s itself names only "undocumented intentional" and "unintentional" as discrepancies needing action: undocumented intentional ones are documented, unintentional ones are resolved with the prescriber [S1]. The "documented intentional" class is implied (it is not a discrepancy needing action).

Discrepancy **types** used in practice (from the pharmacist-led Ethiopian study [S7] and the WHO report [S3]): omission, addition (commission), substitution, dose, frequency, route, dosage form. In the Ethiopian tertiary hospital study omission was the commonest (49.3% of discrepancies), then dose [S7].

### 1.3 Who, when, and the discharge step

- **Who**: ideally a pharmacist; otherwise a trained nurse, doctor or technician [S1]. NICE NG5 says a trained and competent health professional, ideally a pharmacist, pharmacy technician, nurse or doctor, with a designated professional holding overall responsibility in each organisation [S4].
- **When**: within 24 hours of admission [S1][S4]; repeated at ward transfer and at discharge [S4]. In primary care, NICE asks for reconciliation within 1 week of the practice receiving discharge information and before any new supply [S4].
- **Discharge flow (High 5s, Step IV)** [S1]:
  1. The physician writes discharge prescriptions.
  2. The **BPMH and the previous 24 hours of the medication administration record (MAR)** are compared with the discharge prescriptions (optionally also the discharge order, care plan or summary).
  3. If there are discrepancies, the physician is contacted and the prescription or instructions are changed.
  4. Every medicine is accounted for: new, discontinued, adjusted, unchanged, held, formulary changes.
  5. The **Best Possible Medication Discharge Plan (BPMDP)** is sent to the patient, community pharmacy, primary care doctor and the next facility. Recipients update their records.
- High 5s marked the discharge step for later phases and did not evaluate it [S1]. It is guidance by consensus, not tested process.
- WHO adds: the discharge communication should state for each medicine whether it is continued, changed, stopped or added, with reasons, and give the full current list; recipients are the patient, family or caregivers and the next providers [S3]. Patients should be counselled with patient-friendly written information and their understanding checked [S1].

### 1.4 Size of the problem and the evidence

- At discharge, 25% to 80% of patients had a discrepancy or a failure to communicate in-hospital changes; between 11% and 59% of admission and discharge discrepancies were judged potentially harmful [S3].
- Pharmacy-based BPMH in the High 5s Netherlands site cut unintentional discrepancies from 62% to 32%; when physicians or technicians took the BPMH there was no significant effect [S3].
- Electronic reconciliation tools: a meta-analysis found a 45% reduction in unintentional discrepancies; WHO also gives an example where an electronic pick-list caused a wrong-drug selection ("LANZ" giving olanzapine instead of lansoprazole) [S3].
- Systematic review of pharmacist-led reconciliation (17 studies, 21,342 adults): adverse drug event related revisits RR 0.33, all-cause readmissions RR 0.81, emergency visits RR 0.72; no effect on mortality [S8].
- Slovenian controlled trial: pharmacist reconciliation at admission and discharge plus discharge counselling with written lay instructions cut patients with an unintentional patient-generated discrepancy at 30 days from 59.3% to 14.7% [S9]. This is the outcome a discharge list and counselling are meant to change.

**Sub-Saharan Africa and Uganda**

- Eastern Ethiopia, tertiary hospital, pharmacist-led: 29% of 1,027 medicines had a discrepancy; 32.2% of discrepancies were unintentional; omission commonest; longer stay strongly associated (over 15 days AOR 28.0) [S7].
- WHO notes most evidence is from high-income countries and that patient-held records are common in LMICs because IT is limited; one Ugandan case is cited, where a grandson spotted a wrong dosing schedule on a refill [S3].
- **No Ugandan study of admission or discharge reconciliation discrepancies was found** (PubMed search "medication reconciliation" AND Uganda returned 2 unrelated records). Nearest Ugandan evidence:
  - Drug therapy problems in 61.8% of hypertension clinic patients at Mbarara RRH, classified by Cipolle, no interventions reported [S11]; 48.3% of inpatients with heart failure at Mbarara RRH [S12].
  - Arua RRH: no inpatient file out of 309 was free of medication errors; administration errors 57.2% [S15].
  - Mulago medical wards: educating attendants (lay caretakers) raised inpatient medication adherence from a median 46.5% to 92% [S14]. Attendants are therefore a real recipient of discharge information.
  - Intern pharmacists in 26 Ugandan hospitals mainly counsel and **lack documentation** [S13].
  - The MoH Uganda Medicines and Therapeutics Committee guideline (2025, 2nd edition) does not mention reconciliation; it asks for medication errors to be recorded and reported to the National Pharmacovigilance Centre and for regular summary reports to the MTC [S16].

---

## 2. Proposed discharge reconciliation flow for MedSync (candidate)

Assumed records: admission medicines list (BPMH) with a Continue / Hold / Stop decision per line; ward administration record (MAR); active inpatient orders; discharge prescription written by the discharging doctor.

**Step 0. Trigger.** The discharging doctor opens a discharge prescription. MedSync creates a reconciliation task on the pharmacy list (Reconciliation lane). It is never a gate: the patient can leave without it.

**Step 1. Build the comparison (system).** One row per medicine, matched by medicine-list identity (EMHSLU 2023 item or the hospital's product record), never by guessing free text. Columns:

- Admission list: as recorded, decision (Continue / Hold / Stop), reason, BPMH sources and whether verified by more than one source.
- In hospital: started, changed or stopped during the stay, with reason.
- MAR: last given (date and time) and whether given in the last 24 hours (High 5s uses the last 24 hours [S1]).
- Discharge prescription: as written.
- Status MedSync proposes: New, Changed, Unchanged, Stopped, Held (restart decision needed), or Unmatched.
  Doses are compared exactly as recorded. If units or forms differ, the cell says "cannot compare" and a person decides. No conversion.

**Step 2. Record flags (system).** The flags in section 3.1 are shown on each row. Each flag shows its source rule and only acts once that rule is signed.

**Step 3. Patient or caregiver conversation (person).** Pharmacist, or a trained nurse or doctor, confirms with the patient or attendant: medicines at home, medicines from other clinics (for example ART, TB, family planning, mental health), herbal and traditional medicines, medicines bought outside. Anything new is added to the BPMH with its source.

**Step 4. Classify (person).** For each flagged row the reviewer sets: no discrepancy, intentional documented, intentional undocumented, or unintentional, and the type (omission, addition, substitution, dose, frequency, route, form, duration). MedSync never sets intent.

**Step 5. Query the discharging doctor (existing Phase 1 coded query).** Undocumented intentional and unintentional items become a coded query, type "Reconciliation at discharge" (new code, PCNE cause C8.1). The doctor answers Keep (with reason), Change or Stop. Keep with reason turns an undocumented intentional discrepancy into a documented one. A logged phone call counts as an answer, as in Phase 1.

**Step 6. Close (person).** Reviewer marks the reconciliation complete, or "Not completed before discharge" with the reason. Incomplete reconciliations stay on the pharmacy list for a follow-up call. Measures (candidate): share of discharges reconciled before leaving; unintentional discrepancies found per patient; share resolved before leaving; time from discharge prescription to completion.

**Step 7. Discharge medicines list (BPMDP).** Generated from the closed comparison. Content in section 4.

**Step 8. Counsel and hand over (person).** Counselling with the patient and attendant, using the printed list; record that it happened and to whom (PCNE I2.1, I2.4). Copy goes into the discharge summary for the next facility.

**Step 9. Messages.** SMS (no medicine names) as in section 4.3.

---

## 3. What MedSync can detect from records, and what only a person can find

### 3.1 Detectable from records (candidate flags, each needs signing)

| #   | Flag                                                                                                                      | Records used                            | Likely discrepancy type                              |
| --- | ------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- | ---------------------------------------------------- |
| R1  | Admission line marked **Continue**, absent from discharge prescription, no stop recorded in hospital                      | Admission list, orders, discharge Rx    | Omission                                             |
| R2  | Admission line marked **Stop**, present on discharge prescription                                                         | Admission list, discharge Rx            | Addition (restart of a stopped medicine)             |
| R3  | Admission line marked **Hold**, absent from discharge prescription and no restart decision recorded                       | Admission list, discharge Rx            | Held, no plan                                        |
| R4  | Medicine given in the last 24 hours on the MAR (still active), absent from discharge prescription, no stop order          | MAR, orders, discharge Rx               | Omission of an in-hospital medicine                  |
| R5  | Medicine stopped during the stay with a reason, present on discharge prescription                                         | Orders, discharge Rx                    | Addition                                             |
| R6  | Discharge line not on admission list and never ordered in hospital                                                        | All                                     | New at discharge, indication to confirm              |
| R7  | Dose, frequency, route or form on discharge differs from admission list or last MAR entry, with no change reason recorded | Admission list, MAR, discharge Rx       | Dose / frequency / route / form change, undocumented |
| R8  | Same active ingredient twice on discharge prescription (therapeutic class duplicates only from a signed class list)       | Discharge Rx                            | Duplication                                          |
| R9  | Course-type medicine (for example an antibiotic) with no duration or stop date                                            | Discharge Rx                            | Missing duration                                     |
| R10 | Discharge line missing dose, frequency or route                                                                           | Discharge Rx                            | Incomplete prescription                              |
| R11 | Discharge medicine matches a recorded allergy, or a signed interaction pair with another discharge medicine               | Allergy record, signed interaction list | Existing Phase 1/3 checks                            |
| R12 | BPMH from one source only, or no BPMH recorded                                                                            | Admission list                          | Reconciliation cannot be complete                    |
| R13 | Open pharmacy query on this patient not yet answered                                                                      | Query log                               | Unresolved problem carried to discharge              |
| R14 | Line that MedSync could not match to a medicine-list item                                                                 | Any                                     | Unmatched, needs a person                            |

### 3.2 Only a person can find

- Whether a difference was **meant** (intent) and why.
- Medicines never recorded: home medicines missed at admission, other clinics' medicines, herbal and traditional products, medicines bought outside.
- What the patient **actually takes**, as opposed to what was prescribed.
- Whether a dose is right for the patient now (kidney function, weight, pregnancy, age) beyond any signed check.
- Wrong drug picked from a look-alike name [S3].
- When a held medicine should restart and who decides.
- Whether the patient can get the medicines (cost, stock, distance) and old stopped tablets still at home.
- Whether the patient and attendant understood (teach-back).

---

## 4. What the patient should receive

### 4.1 The printed list (and the patient's own record in the app)

One line per medicine, in plain words, grouped by status, following the High 5s BPMDP and WHO contents [S1][S3]:

- **New**: what it is for, how to take it, for how long.
- **Changed**: the new way to take it, and that the old way has stopped.
- **Carry on as before.**
- **Stopped**: "Do not take the ones you have at home", and why in plain words.
- **Paused**: "Your doctor will tell you when to restart", and who.
- Allergies recorded. Who to call (pharmacy number). Date of next review.
- "Checked by the pharmacy on [date]. Your doctor decided each one."

The printed list is the patient's own record, so it names the medicines. **Decision for the owner and CSO:** the house rule says patient messages never name a medicine. The Phase 3 PatientHome canvas shows names in the app. This note treats the printed list and the signed-in app record as the patient's record, and SMS as a message. That reading needs to be written down and signed.

### 4.2 Who receives it

- Patient, and the attendant or family member who will give the medicines (Mulago evidence on attendants [S14]).
- The next facility or clinic, inside the discharge summary.
- Community pharmacy or drug shop rarely identifiable in Uganda; WHO points to patient-held lists in LMICs [S3], so the printed list is the main vehicle.

### 4.3 SMS (no medicine names, no diagnosis)

Candidate wording for signature:

1. On discharge: "[Hospital]: The pharmacy checked your medicines before you went home. Some may have changed. Please follow the paper list you were given and keep it. Call [phone] with questions."
2. Where something was stopped: "Please do not restart old medicines you have at home unless your paper list says so. Call [phone] if unsure."
3. Where something is paused: "One of your medicines is paused. Your doctor will tell you when to restart. Call [phone] if no one has told you by [date]."
4. Follow-up (optional): "Do you have all the medicines on your list? Reply 1 for yes, 2 for no." A "no" creates a pharmacy call task.

Gaps: translations into local languages need sign-off; shared phones mean even "paused" can disclose care, so the patient chooses at discharge whether SMS is sent.

---

## 5. Coding interventions: PCNE V9.1

### 5.1 The scheme

PCNE V9.1 [S5][S6]. A drug-related problem (DRP) is "an event or circumstance involving drug therapy that actually or potentially interferes with desired health outcomes" [S5]. Five domains:

| Domain                      | Primary | Sub-codes |
| --------------------------- | ------- | --------- |
| Problems (P)                | 3       | 6         |
| Causes (C)                  | 9       | 38        |
| Planned interventions (I)   | 5       | 17        |
| Intervention acceptance (A) | 3       | 10        |
| Status of the DRP (O)       | 4       | 7         |

Rules from the document: separate problem from cause; a problem can have several causes and several interventions; **one acceptance status per intervention proposal**; one status per problem; each problem is ticked as Potential or Manifest; main domains suffice for research, sub-codes for practice [S5]. C8.1 "Medication reconciliation problem" is the cause for transfer between or within institutions [S5]. Full list in `pcne-codes.json`.

**Licence:** use only for pharmaceutical care research and practice; PCNE must be informed; **commercial use or use with a commercial purpose needs explicit permission from the PCNE Board** (drp@pcne.org) [S5][S6]. MedSync is commercial, so permission must be obtained before PCNE labels appear in the product.

### 5.2 Other schemes (brief)

- **ASHP guidelines on documenting pharmaceutical care (2003)**: what to document and narrative formats (SOAP, TITRS), no coded taxonomy; advises factual, non-blaming wording and "may want to consider" for unsolicited advice [S21]. Useful for wording, not for coding.
- **SFPC codes on Act-IP (France)** with CLEO impact scoring: used for 3,100 interventions in [S17]; CLEO was also used alongside PCNE in Ethiopia [S10]. Not opened directly.
- **Cipolle drug therapy problem categories**: used in Ugandan studies [S11]; not opened directly. Problem-only, no acceptance or outcome domain.

**Fit for a coded query:** PCNE fits best because it alone separates problem, cause, the act of proposing to the prescriber (I1.3), the prescriber's answer (A) and the result (O), which is the shape of MedSync's query. It has been used in East Africa [S10]. Its weakness is the licence, and it has no field for clinical impact (CLEO fills that if wanted).

### 5.3 Mapping MedSync's coded query to PCNE (candidate, for signature)

MedSync query types as on the Phase 3 Interventions canvas: Allergy; Dose unclear or unusual; Renal function; Duplicate; Interaction (signed list); Antibiotic review; Not available, alternative needed; Other. Proposed new type: Reconciliation at discharge.

**Problem and cause** (suggested defaults; the pharmacist confirms):

| MedSync type                      | P (default)                                                        | C (choices offered)                                             |
| --------------------------------- | ------------------------------------------------------------------ | --------------------------------------------------------------- |
| Allergy                           | P2.1, potential                                                    | C1.1; C9.2 if not guideline-based                               |
| Dose unclear or unusual           | P1.2 or P2.1                                                       | C3.1, C3.2, C3.3, C3.4, C3.5 (unclear instructions)             |
| Renal function                    | P2.1, potential                                                    | C3.2, C3.4, C1.1, C9.1 (no recent creatinine)                   |
| Duplicate                         | P2.1 or P3.1                                                       | C1.4                                                            |
| Interaction (signed list)         | P2.1 or P1.2, potential                                            | C1.3                                                            |
| Antibiotic review                 | P3.1 or P1.2                                                       | C4.2, C1.2, C1.1, C2.1 (route or form, for example oral switch) |
| Not available, alternative needed | P1.3, potential                                                    | C5.1                                                            |
| Reconciliation at discharge       | by type: omission P1.3; addition P3.1; dose/frequency P1.2 or P2.1 | C8.1 (plus a second cause if known)                             |
| Other                             | P3.2                                                               | C9.2                                                            |

**Intervention** (from how the query was sent and what it proposes; a query may carry two I codes):

| MedSync                                                                       | PCNE                                    |
| ----------------------------------------------------------------------------- | --------------------------------------- |
| Query asks a question only                                                    | I1.2                                    |
| Query carries a proposal                                                      | I1.3                                    |
| Logged phone call or ward discussion                                          | I1.4                                    |
| For information, no answer needed                                             | I1.1                                    |
| Proposal content: change medicine / dose / form / instructions / stop / start | I3.1 / I3.2 / I3.3 / I3.4 / I3.5 / I3.6 |
| Counselling at discharge; attendant counselled                                | I2.1; I2.4                              |
| Suspected reaction report sent (Phase 3 strand)                               | I4.2                                    |

**Acceptance** (from the prescriber's answer and the record):

| MedSync answer                                           | PCNE | Record check                                           |
| -------------------------------------------------------- | ---- | ------------------------------------------------------ |
| Change or Stop, matching the proposal, new order exists  | A1.1 | New or stopped order found                             |
| Change, differing from proposal                          | A1.2 | Reviewer confirms                                      |
| Agreed, but no new order by discharge or 24 h            | A1.3 | Detectable: answer says change, prescription unchanged |
| Agreed by phone, order not visible                       | A1.4 |                                                        |
| Keep, reason: not feasible (stock, cost, patient factor) | A2.1 | Reason picked from a list                              |
| Keep, reason: clinical disagreement                      | A2.2 |                                                        |
| Keep, other reason                                       | A2.3 |                                                        |
| Keep, no reason                                          | A2.4 | Should not occur: Phase 1 requires a reason            |
| No answer (waiting)                                      | A3.1 |                                                        |
| Withdrawn before sending                                 | A3.2 |                                                        |

Two cautions:

- A **Keep after an information-only query (I1.2)** is not a rejection. It should not count against acceptance; the problem status is usually O1.1 (clarified) or O3.4.
- "Kept as written" on the canvas is one bucket; to map it to A2.1 / A2.2 / A2.3 the Keep reason needs a short signed pick-list.

**Status of the problem (O):** set by the pharmacist, default O0.1. Suggested: implemented change with no recurrence, O1.1; partial, O2.1; kept for a valid reason, O3.4. Avoid auto-assigning O3.2 ("lack of cooperation of prescriber"); it reads as blame, against ASHP's non-judgemental wording [S21] and the blame-free culture the MoH MTC guideline asks for [S16].

---

## 6. Reporting intervention data, and whether feedback changes prescribing

**What is reported in the literature:** acceptance rate overall and by problem type, by ward and by intervention level [S10][S17][S18]. Rates seen: 74.1% accepted, 53.8% fully implemented (Ethiopia, PCNE V9.1) [S10]; 82.4% (France, 2,930 interventions) [S17]; 95.5% (Malaysia, e-prescriptions) [S18]. In France, acceptance varied by ward from 67.1% (geriatrics) to 98.0% (haematology), and by problem type from 71.4% (drug not indicated) to 94.3% (monitoring); **oral communication was accepted 27.7 percentage points more often than messages sent through software** [S17]. This matters for MedSync: an in-software query alone will likely be accepted less than one followed by a call, which supports Phase 1's logged phone calls.

**Candidate MedSync report** (matches the Interventions canvas):

- Denominator for acceptance = queries with a proposal (I1.3 or I1.4), excluding information-only (I1.2), withdrawn (A3.2) and unanswered (A3.1), with the unanswered count shown beside it.
- Accepted (A1), fully implemented (A1.1), not accepted by reason (A2.1 to A2.3).
- By query type, by PCNE cause, by ward, by prescriber cadre, median time to answer.
- Reconciliation: unintentional discrepancies per discharge, by type and by ward.
- Feedback to individual prescribers is private and non-blaming; ward and cadre figures go to the MTC as the MoH guideline asks for regular summary reports [S16].

**Does feedback change prescribing?**

- Cochrane review of audit and feedback (2026 update, 292 studies): median absolute improvement in desired practice 2.7% (IQR 0.0 to 8.6%); pooled mean 6.2%. Feedback works better when it compares with top peers or a benchmark, comes through a local champion the recipient knows, uses more than one format (spoken and written), and helps the recipient act on a few high-priority issues; repeated delivery was associated with smaller effects [S19].
- UK quality improvement project giving pharmacists' individual feedback to junior doctors: better experience of feedback, prescriber identification up from 10% to 50%, but no significant fall in error rates (about 15%); authors note many errors come from systems such as admission reconciliation [S20].
- Reading: expect a modest effect. Design the report for the MTC and a named champion, show the hospital's own benchmark, pick one or two priorities (as the canvas does with renal function), and pair it with system fixes (signed checks) rather than relying on feedback alone.

---

## 7. Counts

- Sources opened and cited: 21 (S1 to S21).
- PCNE V9.1 codes captured: 102 (24 primary, 78 sub-codes): Problems 9, Causes 47, Planned interventions 22, Acceptance 13, Status 11. These match PCNE's own stated counts.
- Record-detectable reconciliation flags proposed: 14 (R1 to R14). Person-only findings listed: 8.
- MedSync query types mapped: 9 (8 existing plus "Reconciliation at discharge"). Answer-to-acceptance mappings: 10.
- Candidate SMS texts: 4.

## 8. Gaps and what I could not open

- **No Ugandan study of reconciliation discrepancies** at admission or discharge was found. Nearest are DTP and medication error studies [S11][S12][S15].
- **PCNE licence**: commercial use needs PCNE Board permission; not yet requested.
- PCNE PDF read only through a text-extraction fetch (direct download blocked by the session proxy). Labels need a check against the PDF. The extended scoring form and help text were not opened.
- **NICE NG5**: only the reconciliation recommendations were readable, without recommendation numbers or publication date; section 1.2 (the list of information to share on transfer) could not be opened.
- WHO IRIS copy of the transitions report failed; I read an identical copy (same reference WHO/UHC/SDS/2019.9) on the South African Department of Health knowledge hub [S3].
- High 5s Implementation Guide (measure definitions MR1 to MR4) not opened; the SOP refers to it and the index page [S2] links it.
- PubMed record and PMC full texts blocked by a browser check; Cochrane read from the abstract PDF only. The URL path says pub3 but the text served was the 2026 update (pub5).
- ASHP website redirected to a login error; the 2003 guideline was read from a third-party mirror [S21]. Whether a newer ASHP version exists was not checked.
- SFPC/Act-IP and Cipolle classifications seen only as used in studies, not opened.
- Several study figures are internally inconsistent in the Ethiopian 2025 paper (74.1% vs 71.1%) [S10]; cite with care.
- The SMS-versus-printed-list reading of "patient messages never name a medicine" needs an owner and CSO decision.

---

## Sources (all accessed 24 October 2026)

- [S1] WHO High 5s. Standard Operating Protocol: Assuring Medication Accuracy at Transitions in Care: Medication Reconciliation. Version 3, September 2014. https://cdn.who.int/media/docs/default-source/patient-safety/high5s/h5s-sop.pdf?sfvrsn=594d8e49_4
- [S2] WHO. High 5s: standard operating procedures (index page listing the medication reconciliation SOP, implementation guide and fact sheet). https://www.who.int/teams/integrated-health-services/patient-safety/research/high-5s-standard-operating-procedures
- [S3] WHO. Medication safety in transitions of care. Technical report, WHO/UHC/SDS/2019.9, 20 June 2019. Record: https://www.who.int/publications-detail/WHO-UHC-SDS-2019.9 ; text read from https://knowledgehub.health.gov.za/system/files/elibdownloads/2023-04/Medication%2520Safety%2520in%2520transitions%2520of%2520care.pdf
- [S4] NICE NG5. Medicines optimisation: the safe and effective use of medicines to enable the best possible outcomes. Recommendations page (partial). https://www.nice.org.uk/guidance/ng5/chapter/Recommendations
- [S5] PCNE. Classification for Drug-Related Problems V9.1. https://pcne.org/wp-content/uploads/2026/01/PCNE_classification_V9-1-en-2026.pdf
- [S6] PCNE. DRP classification page. https://pcne.org/?p=830 and https://www.pcne.org/working-groups/2/drug-related-problem-classification
- [S7] Tamiru A, Edessa D, Sisay M, et al. Magnitude and factors associated with medication discrepancies identified through medication reconciliation at care transitions of a tertiary hospital in eastern Ethiopia. BMC Res Notes 2018;11:554. https://bmcresnotes.biomedcentral.com/articles/10.1186/s13104-018-3668-z
- [S8] Mekonnen AB, McLachlan AJ, Brien JE. Effectiveness of pharmacist-led medication reconciliation programmes on clinical outcomes at hospital transitions: a systematic review and meta-analysis. BMJ Open 2016;6:e010003. https://bmjopen.bmj.com/content/6/2/e010003
- [S9] Jošt M, Knez L, Kos M, Kerec Kos M. Pharmacist-led hospital intervention reduces unintentional patient-generated medication discrepancies after hospital discharge. Front Pharmacol 2024;15:1483932. https://www.frontiersin.org/articles/10.3389/fphar.2024.1483932/full
- [S10] Endalifer BL, et al. (Ambaye AS, corresponding). Drug-therapy-related problems and pharmacist interventions in the medical ward in northeast Ethiopia: focus on types, acceptability, and impacts. Front Pharmacol 2025;16:1558864. https://www.frontiersin.org/articles/10.3389/fphar.2025.1558864/full
- [S11] Babirye M, Yadesa TM, Tamukong R, Obwoya PS. Prevalence and factors associated with drug therapy problems among hypertensive patients at hypertension clinic of Mbarara Regional Referral Hospital, Uganda. Ther Adv Cardiovasc Dis 2023;17. https://journals.sagepub.com/doi/full/10.1177/17539447231160319
- [S12] Shegena EA, Kyomya J, Babirye M, et al. Drug therapy problems related to cardiovascular agents and associated factors among heart failure patients: a prospective observational study of a tertiary inpatient setting in Uganda. J Clin Transl Res 2024;10(3):191-200. https://accscience.com/journal/JCTR/10/3/10.36922/jctr.23.00137
- [S13] Agaba R, Ndinawe J, et al. Evaluating the role of intern pharmacists in pharmaceutical care in hospitals in Uganda. J Pharm Policy Pract 2024;17(1). https://doaj.org/article/05acd8373820458987900bfb391576e7
- [S14] Alupo P, Ssekitoleko R, Rabin T, et al. Improving inpatient medication adherence using attendant education in a tertiary care hospital in Uganda. Int J Qual Health Care 2017 (abstract). https://nru.uncst.go.ug/items/326bac46-226e-4b77-8f62-8ea5c54f903c/full
- [S15] Wadulo FM, Bacia L. Assessment of medication errors at the in-patient wards of Arua Regional Referral Hospital, Uganda. Makerere University dissertation, 2019 (abstract). https://dissertations.mak.ac.ug/handle/20.500.12281/11020
- [S16] Ministry of Health Uganda. Guideline to implement activities for Medicine and Therapeutics Committee in a health facility, 2nd edition, 2025. https://nms.go.ug/wp-content/uploads/2025/12/Guideline-to-implement-activities-for-medicine-and-therapeutics-committee-in-health-facility1.pdf
- [S17] Durand A, Gillibert A, Membre S, et al. Acceptance factors for in-hospital pharmacist interventions in daily practice: a retrospective study. Front Pharmacol 2022;13:811289. https://www.frontiersin.org/journals/pharmacology/articles/10.3389/fphar.2022.811289/full
- [S18] Pharmacists' interventions on electronic prescriptions from various specialty wards in a Malaysian public hospital: a cross-sectional study. Pharmacy (Basel), October 2021 (DOAJ record). https://doaj.org/article/5782fe4e62c44e7787a2139dfacfa067
- [S19] Ivers N, Yogasingam S, Lacroix M, et al. Audit and feedback: effects on professional practice. Cochrane Database Syst Rev 2026, Issue 6, CD000259 (abstract). https://cochranelibrary.com/cdsr/doi/10.1002/14651858.CD000259.pub3/pdf/CDSR/CD000259/CD000259_abstract.pdf
- [S20] Reynolds M, Jheeta S, Benn J, et al. Improving feedback on junior doctors' prescribing errors: mixed-methods evaluation of a quality improvement project. BMJ Qual Saf 26(3):240 (published online 2016). https://qualitysafety.bmj.com/content/26/3/240 (news summary: https://pharmaceutical-journal.com/article/news/feedback-interventions-fail-to-reduce-prescribing-errors-among-junior-doctors)
- [S21] ASHP guidelines on documenting pharmaceutical care in patient medical records. Am J Health-Syst Pharm 2003;60. Read from mirror: https://cff.org.br/userfiles/4%20-%20AMERICAN%20SOCIETY%20OF%20HEALTHY-SYSTEM%20PHARMACISTS_%20ASHP%20guidelines%20on%20documenting%20pharmaceutical%20care%20in%20patient%20medical%20records_.pdf
