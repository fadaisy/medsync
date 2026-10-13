# Lab Phase 2: research import report (RI-8)

Generated from `docs/lab/catalogue-research/lab-catalogue-research.v1.json` (SHA-256 `7779d0fd73b5847d547a620b690743746a11615973c15f601ec1f12b4504a3af`) against the v2 component lists. Every row below lands in a hospital as an **unsigned draft**; nothing flags until the laboratory lead and the CSO sign it.

## Counts

| What                                                        | Count |
| ----------------------------------------------------------- | ----- |
| Reference-interval drafts (per test and result)             | 45    |
| Their bands                                                 | 411   |
| Drafts where two sources disagree (the lead chooses)        | 33    |
| Decision-scheme drafts                                      | 23    |
| Their bands                                                 | 72    |
| Scheme drafts unsignable until a person sets the boundaries | 23    |
| Verification blockers                                       | 8     |

## Rejected at import

| Result  | Bands | Why                                     |
| ------- | ----- | --------------------------------------- |
| obs.esr | 2     | age-continuous formula: entered by hand |

## Not imported (kit-specific or on the patient's plan: RI-7, LD-08, LD-09)

- obs.troponin
- obs.troponin_i_hs
- obs.troponin_t_hs
- obs.tsh
- obs.ft4
- obs.ft3
- obs.pt
- obs.aptt
- obs.d_dimer
- obs.d_dimer_ddu
- obs.inr

## Verification blockers (RI-5)

| Test     | Result  | Problem                                                                                                                                               |
| -------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| test.cd4 | obs.cd4 | Lugada Table 3 CD4 absolute: column assignment unverified (a second extraction disagreed). A person must read the counts from the PDF before signing. |
| test.cd4 | obs.cd4 | Lugada Table 3 CD4 absolute: column assignment unverified (a second extraction disagreed). A person must read the counts from the PDF before signing. |
| test.cd4 | obs.cd4 | Lugada Table 3 CD4 absolute: column assignment unverified (a second extraction disagreed). A person must read the counts from the PDF before signing. |
| test.cd4 | obs.cd4 | Lugada Table 3 CD4 absolute: column assignment unverified (a second extraction disagreed). A person must read the counts from the PDF before signing. |
| test.cd4 | obs.cd4 | Lugada Table 3 CD4 absolute: column assignment unverified (a second extraction disagreed). A person must read the counts from the PDF before signing. |
| test.cd4 | obs.cd4 | Lugada Table 3 CD4 absolute: column assignment unverified (a second extraction disagreed). A person must read the counts from the PDF before signing. |
| test.cd4 | obs.cd4 | Lugada Table 3 CD4 absolute: column assignment unverified (a second extraction disagreed). A person must read the counts from the PDF before signing. |
| test.cd4 | obs.cd4 | Lugada Table 3 CD4 absolute: column assignment unverified (a second extraction disagreed). A person must read the counts from the PDF before signing. |

## Scheme drafts

| Result              | Scheme as the research names it                              | Rows | Signable as imported   |
| ------------------- | ------------------------------------------------------------ | ---- | ---------------------- |
| obs.haemoglobin     | Khurana R                                                    | 5    | no: set the boundaries |
| obs.cd4_percent     | WHO                                                          | 4    | no: set the boundaries |
| obs.cd4             | WHO                                                          | 1    | no: set the boundaries |
| obs.egfr            | KDIGO 2024 Clinical Practice Guideline for the Evaluation an | 1    | no: set the boundaries |
| obs.glucose_fasting | WHO/IDF                                                      | 1    | no: set the boundaries |
| obs.glucose_fasting | American Diabetes Association Professional Practice Committe | 1    | no: set the boundaries |
| obs.glucose         | American Diabetes Association Professional Practice Committe | 1    | no: set the boundaries |
| obs.glucose         | WHO/IDF                                                      | 1    | no: set the boundaries |
| obs.glucose         | Kibaya RS                                                    | 1    | no: set the boundaries |
| obs.chol_ldl        | NHLBI                                                        | 1    | no: set the boundaries |
| obs.chol_ldl        | Mach F                                                       | 1    | no: set the boundaries |
| obs.chol_total      | NHLBI                                                        | 1    | no: set the boundaries |
| obs.chol_hdl        | NHLBI                                                        | 1    | no: set the boundaries |
| obs.triglycerides   | NHLBI                                                        | 1    | no: set the boundaries |
| obs.triglycerides   | Mach F                                                       | 1    | no: set the boundaries |
| obs.hba1c           | WHO                                                          | 1    | no: set the boundaries |
| obs.hba1c           | American Diabetes Association Professional Practice Committe | 1    | no: set the boundaries |
| obs.hba1c           | ADA Standards of Care in Diabetes-2025                       | 1    | no: set the boundaries |
| obs.hiv_viral_load  | WHO policy brief 2023                                        | 2    | no: set the boundaries |
| obs.hiv_viral_load  | Ministry of Health Uganda                                    | 1    | no: set the boundaries |
| obs.hiv_viral_load  | ASLM LabCoP webinar presentation                             | 1    | no: set the boundaries |
| obs.uacr            | KDIGO 2024 Clinical Practice Guideline for the Evaluation an | 1    | no: set the boundaries |
| obs.uacr            | KDIGO 2024                                                   | 2    | no: set the boundaries |

## Gaps carried from the research (38)

- CD4 absolute (Lugada 2004, all ages): column assignment unverified - read Table 3 in the PDF before signing. Adult CD4 can use Karita 2009 (verified) meanwhile.
- Neonates 0-6 days: no haematology interval in any opened source; 7-27 days covered only by Lugada's pooled '<1 year' band. Kumwenda 2012 (Kampala/Malawi infants) has medians only.
- Paediatric chemistry: CALIPER main tables not opened (paywall/blocked); Kironde 2013 (Iganga, Uganda, 1-5 y) results table is an image; no African interval after the newborn period for chloride, bicarbonate, GGT or CRP; nothing for 15 days to 1 month.
- WHO 2024 anaemia cut-offs for children (6 months to 14 years) not yet loaded; WHO primary PDF not opened (adult values corroborated by a guideline digest).
- Uganda Clinical Guidelines 2023: diabetes, malaria, TB and syphilis chapters not read (PDF truncated/blocked) - Uganda-specific thresholds unverified.
- HIV: Uganda 2022 low-level viraemia definitions only partly readable; the Nov 2024 MoH change of HIV test kits seen only in a May 2025 news report.
- Lactate and CRP: only US (Mayo) intervals; no African source.
- FBC: no adult interval for IG, RDW-SD, PDW, PCT, P-LCR, P-LCC or 3-part MID/GRAN; MPV and RDW-CV from Eller only (Coulter analyser). DH-615 operator manual not found: HCT measured or calculated, PDW unit and Dymind default ranges unconfirmed.
- Adults over ~59 years are not represented in any African source; no sickle-cell-trait source opened.
- Thyroid: no paediatric interval (1 month-18 y); no Ugandan interval. PT, APTT and troponin are assay/reagent-specific - the lab must enter its own.
- Troponin 99th percentiles were read by text extraction from IFCC task-force papers - check against the current kit insert.
- LOINC: 24 of 119 concepts have no code. No LOINC term exists for malaria parasite density in parasites/uL (local code + request to LOINC). Xpert rifampicin resistance has only a TRIAL code (89372-7).
- TB: Cepheid Ultra / Uganda NTLP instructions on 'trace' results not opened; number of grades on the current Determine TB-LAM card unconfirmed.
- Malaria: which RDT type Uganda procures (HRP2 vs pLDH) and pfhrp2-deletion data not confirmed.
- Dipstick grade concentrations come from secondary sources (a reporting form and a CSF study), not the manufacturer IFU.
- Blocked during research: PMC/PubMed (browser check), Europe PMC and Springer (rate limits), parts of PLoS and Wiley. A person with library access can close several gaps above quickly.
- obs.haemoglobin any days 1-6: Neonatal days 1-6: No opened source gives a reference interval for postnatal days 1-6 (Lugada starts at 1 week within a single <1 y group; Kilifi starts at 4 weeks; Kumwenda 2012 Malawi/Uganda 0-6 mo
- obs.haemoglobin any days 7-27: Days 7-27: only Lugada '<1 y' (7-364 d) band covers this window as one pooled infant interval (see separate Lugada band); no neonatal-specific interval found in an opened source.
- obs.haematocrit any days 1-6: Neonatal days 1-6: No opened source gives a reference interval for postnatal days 1-6 (Lugada starts at 1 week within a single <1 y group; Kilifi starts at 4 weeks; Kumwenda 2012 Malawi/Uganda 0-6 mo
- obs.rbc any days 1-6: Neonatal days 1-6: No opened source gives a reference interval for postnatal days 1-6 (Lugada starts at 1 week within a single <1 y group; Kilifi starts at 4 weeks; Kumwenda 2012 Malawi/Uganda 0-6 mo
- obs.mcv any days 1-6: Neonatal days 1-6: No opened source gives a reference interval for postnatal days 1-6 (Lugada starts at 1 week within a single <1 y group; Kilifi starts at 4 weeks; Kumwenda 2012 Malawi/Uganda 0-6 mo
- obs.mch any days 1-6570: Days 1-6570: no opened East African paediatric source reported MCH reference limits (Lugada Table 1 and Kilifi Tables 1-2 do not include MCH).
- obs.mchc any days 1-27: Days 1-27: No opened source gives a reference interval for postnatal days 1-6 (Lugada starts at 1 week within a single <1 y group; Kilifi starts at 4 weeks; Kumwenda 2012 Malawi/Uganda 0-6 mo reports
- obs.mchc any days 548-6570: 18 mo-18 y: no opened East African source reported MCHC (Lugada Table 1 does not include MCHC).
- obs.platelets any days 1-6: Neonatal days 1-6: No opened source gives a reference interval for postnatal days 1-6 (Lugada starts at 1 week within a single <1 y group; Kilifi starts at 4 weeks; Kumwenda 2012 Malawi/Uganda 0-6 mo
- obs.wbc any days 1-6: Neonatal days 1-6: No opened source gives a reference interval for postnatal days 1-6 (Lugada starts at 1 week within a single <1 y group; Kilifi starts at 4 weeks; Kumwenda 2012 Malawi/Uganda 0-6 mo
- obs.neutrophils_abs any days 0-6: Days 0-6: No opened source gives a reference interval for postnatal days 1-6 (Lugada starts at 1 week within a single <1 y group; Kilifi starts at 4 weeks; Kumwenda 2012 Malawi/Uganda 0-6 mo reports o
- obs.lymphocytes_abs any days 0-6: Days 0-6: No opened source gives a reference interval for postnatal days 1-6 (Lugada starts at 1 week within a single <1 y group; Kilifi starts at 4 weeks; Kumwenda 2012 Malawi/Uganda 0-6 mo reports o
- obs.monocytes_abs any days 0-6: Days 0-6: No opened source gives a reference interval for postnatal days 1-6 (Lugada starts at 1 week within a single <1 y group; Kilifi starts at 4 weeks; Kumwenda 2012 Malawi/Uganda 0-6 mo reports o
- obs.eosinophils_abs any days 0-6: Days 0-6: No opened source gives a reference interval for postnatal days 1-6 (Lugada starts at 1 week within a single <1 y group; Kilifi starts at 4 weeks; Kumwenda 2012 Malawi/Uganda 0-6 mo reports o
- obs.cd4 any days 0-6: Days 0-6: no opened source; Lugada '<1 y' starts at 1 week.
- obs.cd4_percent any days 0-6: Days 0-6: no opened source; Lugada '<1 y' starts at 1 week.
- obs.bilirubin_total any days 0-28: neonatal jaundice is managed by hour-specific nomograms (e.g. NICE CG98 / AAP 2022), not reference intervals; NICE CG98 uses a threshold table by age in hours (babies >=38 weeks). CALIPER 0–14 d interval 4–253 umol/L (Fr [source looked at: https://www.nice.org.uk/guidance/CG98/chapter/Recommendations]
- obs.tsh any days 31-6574: No paediatric (1 month-18 y) TSH interval was opened in this strand. Must come from the lab's assay insert. [source looked at: https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0235234]
- obs.pt any days 0-None: Deliberately not modelled: no transferable PT interval exists. CLSI H47 3rd ed (2023) governs the procedure (https://clsi.org/shop/standards/h47/); CLSI EP28-A3c (2010) governs RI establishment and transference (https:// [source looked at: https://practical-haemostasis.com/Screening%20Tests/pt.html]
- obs.aptt any days 0-None: Not modelled; local derivation required (CLSI H47, EP28). [source looked at: https://practical-haemostasis.com/Screening%20Tests/aptt.html]
- obs.inr any days 0-None (No INR reference interval for the un-anticoagulated state was opened): No INR reference interval for the un-anticoagulated state was opened. Lab to enter one, or leave unset. [source looked at: https://practical-haemostasis.com/Screening%20Tests/pt.html]
- obs.hiv_viral_load any days 0-None (Threshold equals the assay LoD, so it is lab-entered per assay or specimen.): Threshold equals the assay LoD, so it is lab-entered per assay or specimen. [source looked at: https://www.who.int/publications/i/item/9789240055179]
