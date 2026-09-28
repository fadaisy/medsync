# MS-EMR-DX-CAT-001: build, source check and clinical review

**Built:** 28 Sep 2026.

**Status:** DRAFT for CSO sign-off. Nothing here is signed.

The full review tables are in `catalogue-build/review_part1.md` (infection, cardiovascular, respiratory, renal, and all rules) and `catalogue-build/review_part2.md` (endocrine, GI, haematology, oncology, toxicology, skin, injury, obstetric, neurology, mental health, musculoskeletal, symptom-level terms, and the REF_DX values). Each ends with an "Applied" section that lists what was changed for every finding.

## 1. Counts (final build)

| Item                                | Count                                                                                                                                                                                                                                                                                                                          |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Profiles                            | **272**: 85 on existing REF-DX-TERMS ids, 187 on proposed additions                                                                                                                                                                                                                                                            |
| By category                         | infection 65, cardiovascular 28, symptom-level 26, endocrine and metabolic 21, neurology 21, gastro-hepatic 16, oncology 15, respiratory 13, toxicology and environment 13, mental health 9, musculoskeletal 8, renal and urological 8, haematology 7, ENT and eye 6, obstetric 5, sexual and reproductive 5, injury 3, skin 3 |
| Restricted profiles                 | 28: mental_health 9, hiv 8, tb 6, sexual_reproductive_health 5                                                                                                                                                                                                                                                                 |
| Must-not-miss                       | **89** (99 before review)                                                                                                                                                                                                                                                                                                      |
| Time-critical                       | 86 (9 of them are not must-not-miss)                                                                                                                                                                                                                                                                                           |
| suggest_for / suggest_against atoms | 1,781 / 125                                                                                                                                                                                                                                                                                                                    |
| Ask targets                         | 2,285                                                                                                                                                                                                                                                                                                                          |
| Tests referenced                    | 97: 35 existing and 62 proposed                                                                                                                                                                                                                                                                                                |
| Differential rules (`ddx_rules`)    | **100**                                                                                                                                                                                                                                                                                                                        |
| Profiles not reached by any rule    | 13. They are entered directly (burn, open wound, poisonings, rabies, dental abscess), confirmed by a test (confirmed pulmonary TB), or chronic labels (obesity, dyslipidaemia, dyspepsia, alcohol dependence)                                                                                                                  |
| REF-DX reference entries            | 14 (all draft)                                                                                                                                                                                                                                                                                                                 |
| Named scales                        | 10                                                                                                                                                                                                                                                                                                                             |
| New sources                         | 24 (all `verified: false`)                                                                                                                                                                                                                                                                                                     |
| Engine rules                        | 13                                                                                                                                                                                                                                                                                                                             |
| Decisions (`decisions_needed`)      | 10                                                                                                                                                                                                                                                                                                                             |
| Size                                | 880 KB raw, 130 KB gzipped                                                                                                                                                                                                                                                                                                     |

## 2. How it was made

1. **Ids.** Built on the repo's own catalogues:
   - REF-DX-TERMS for terminology;
   - the history catalogue (96 symptoms and their red flags, past and family history, medicines, social);
   - the examination catalogue (149 items with their options and attributes, 24 classifiers, vital signs, REF-EX-\*);
   - the test catalogue.

   A validator (`catalogue-build/build.py`) resolves every id and fails the build on any unknown id.

2. **Authoring.** Five authors wrote the profiles by body system from a common brief (`catalogue-build/AUTHORING.md`). They drew on the archived per-complaint differential weights (17 complaints, each weight cited; tag `archive/clerkship-v1`) for discriminators and CSO notes.
3. **Differential rules.**
   - The 17 archived complaint lists were lifted as suggestion lists **without scores**.
   - Triggers were added for red flags, vital signs and examination findings.
4. **Independent clinical review.** Two physician reviewers who did not write the content each took half.

   |                                          | Critical | Major | Minor |
   | ---------------------------------------- | -------- | ----- | ----- |
   | Part 1 (119 profiles and the rules)      | 6        | 39    | 54    |
   | Part 2 (153 profiles and the references) | 8        | 28    | 55    |

   Every critical and major finding was applied, apart from the items in §5. Most minor findings were applied too.

5. **Restricted-fact check.** Added after the review. The build now **fails** if a restricted fact is used as evidence on a standard diagnosis. It knows sensitivity at every level: item, option, red flag, past, family, medicine and social. This caught 10 leaks, including 3 the reviewers missed.

## 3. What the review changed (main items)

- **Falsely reassuring "against" evidence removed from dangerous diagnoses:**
  - "no fever" on cerebral malaria (the history often comes from relatives of a comatose patient);
  - bilateral oedema on DVT;
  - "JVP not raised" on cardiogenic shock;
  - low glucose on stroke, TIA and DKA (a low reading persists after correction);
  - painless jaundice on cholangitis;
  - slow pulse on thyroid storm;
  - chronic liver signs on acute liver failure;
  - facial palsy or dysphasia on cord compression;
  - fever on GBS;
  - dullness on pneumothorax;
  - pulse ≥ 91 on heart block;
  - GCS on tetanus;
  - co-trimoxazole on toxoplasmosis and PCP;
  - bilateral oedema on cellulitis;
  - and others (see the Applied sections).
- **Restricted leaks removed** (all 10 above). Restricted facts now appear on standard diagnoses only as ask targets.
- **Must-not-miss:**
  - Demoted: hyponatraemia, diabetic foot, DIC (still time-critical), suspected cancer, lymphoma, delirium, rhabdomyolysis (still time-critical), rabies (clinical), yellow fever, advanced HIV and TB spine.
  - Added: GI bleeding, source not yet known.
  - Kept, as documented exceptions among symptom-level terms: meningitis, cause not yet known, and GI bleeding, source not yet known.
- **Rule noise removed.** Must-not-miss diagnoses that pinned on every common complaint now sit behind specific triggers:
  - VHF: fever with bleeding or exposure, petechiae, bleeding signs;
  - giant cell arteritis: new headache over 50;
  - ruptured AAA: age 65 or over with abdominal, back or loin pain, or collapse;
  - necrotising infection: hot, red skin or blistering.
- **Rule gaps filled:**
  - TB meningitis added to headache and confusion; confusion also gains hypertensive crisis, status epilepticus and SAH;
  - fever with bleeding gains leukaemia;
  - new triggers: speech change, loin pain, vomiting, bleeding tendency, change in vision, pelvic pain, vaginal bleeding with a missed period or fainting, neck trauma, and fever with cancer (febrile neutropenia).
- **Restricted rule triggers.** Co-trimoxazole, antiretrovirals, HIV-associated signs and genital symptoms were split out or gated. Engine rules now say a rule with a restricted trigger fires only for viewers who hold that class, and that sex-specific diagnoses are never suggested to the other sex.
- **Thresholds added:**
  - `REF-DX-BP-OBST-SEVERE` (160/110): severe pre-eclampsia was using 180/120;
  - `REF-DX-GLU-HHS` (33.3 mmol/L): separates HHS from DKA.
- **Grading:**
  - hypoglycaemia severity now includes level 3 (needs assistance), graded by the clinician;
  - cancers, HIV, chronic hepatitis B and C, and heart failure reach the problem list only when Final.
- **Notes corrected:**
  - the HbSC claim on sickle cell disease;
  - the Wernicke wording, so it can never be read as delaying glucose;
  - unsourced percentages removed;
  - hypertensive emergency separated from hypertensive urgency.
- **Sepsis profile enriched:** evidence for mottling and low urine output, and source-finding asks (abdomen, loin, skin, pressure injury, lines and catheters, drains). It has no qSOFA.

## 4. ICD-11 codes (not verified)

- **Access.** The build had no access to icd.who.int or the findacode mirror: the egress proxy blocked every ICD-11 page. **None of the 187 proposed codes is verified.**
- **Search hints.** Web search did work. For 151 terms it returned findacode page _titles_ (code and title), which are recorded as `icd11.search_hint`. They are marked UNVERIFIED and serve as a worklist for Phase 1.
  - 26 hints match the proposed code.
  - 116 give a code where none was proposed.
  - 9 differ from the proposal.
  - 36 found nothing.
- **Likely corrections**, from the hints and unconfirmed:
  - ischaemic stroke: 8B11.5Z, not 8B11.Z;
  - anxiety disorder (generic): 6B0Z, not 6B00, which is generalised anxiety disorder;
  - syncope and oedema: the leaves MG45.Z and MG29.Z;
  - SAH: 8B01.2 (not known if aneurysmal).
- **Offline database.** A public GitHub repo holds an offline SQLite of the WHO ICD-11 MMS 2026-01 release. The session's safety check blocked its use, and it was not used. If the CSO wants it, it needs explicit permission. Codes must still be read on the WHO browser before any export.
- **Rule.** Phase 1 verifies every code on the WHO ICD-11 browser. Until then a proposed term is used "as typed, not coded" and never exported with a code.

Details: `catalogue-build/icd_verification.md` and `.json`.

## 5. Open for the CSO (beyond `decisions_needed`)

1. **Must-not-miss list (89).**

   | Category        | Count | Diagnoses                                                                                                                                                                                                                                                                                                                            |
   | --------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
   | Cardiovascular  | 13    | ruptured AAA, ACS, acute limb ischaemia, aortic dissection, cardiac tamponade, cardiogenic shock, DVT, heart block, acute heart failure, hypertensive crisis, hypovolaemic shock, PE, ventricular arrhythmia                                                                                                                         |
   | Endocrine       | 8     | adrenal insufficiency, DKA, HHS, hyperkalaemia, hypoglycaemia (both), myxoedema coma, thyroid storm                                                                                                                                                                                                                                  |
   | Gastro-hepatic  | 9     | acute liver failure, appendicitis, bowel obstruction, cholangitis, drug-induced liver injury, hepatic encephalopathy, perforated viscus, SBP, variceal bleed                                                                                                                                                                         |
   | Haematology     | 1     | sickle cell crisis                                                                                                                                                                                                                                                                                                                   |
   | Infection       | 19    | cerebral toxoplasmosis, cholera, cryptococcal meningitis, encephalitis, febrile neutropenia, infective endocarditis, cerebral malaria, severe malaria, bacterial meningitis, necrotising soft-tissue infection, PCP, rabies exposure, sepsis, septic arthritis, septic shock, TB meningitis, TB pericarditis, tetanus, suspected VHF |
   | Mental health   | 2     | alcohol withdrawal, suicidal thoughts or self-harm                                                                                                                                                                                                                                                                                   |
   | Musculoskeletal | 1     | giant cell arteritis                                                                                                                                                                                                                                                                                                                 |
   | Neurology       | 12    | cord compression, CVST, GBS, SAH, space-occupying lesion, status epilepticus, stroke (three terms), subdural haematoma, TIA, Wernicke                                                                                                                                                                                                |
   | Obstetric       | 4     | eclampsia, ectopic pregnancy, pre-eclampsia, severe pre-eclampsia                                                                                                                                                                                                                                                                    |
   | Oncology        | 2     | leukaemia, oncological emergency                                                                                                                                                                                                                                                                                                     |
   | Respiratory     | 3     | pneumothorax, respiratory failure, upper airway obstruction                                                                                                                                                                                                                                                                          |
   | Skin            | 1     | SJS/TEN                                                                                                                                                                                                                                                                                                                              |
   | Symptom-level   | 2     | GI bleed, meningitis                                                                                                                                                                                                                                                                                                                 |
   | Toxicology      | 12    | anaphylaxis, angioedema, heat stroke, accidental hypothermia, methanol, opioid or sedative toxicity, organophosphate, paracetamol overdose, poisoning (three terms), snakebite                                                                                                                                                       |

   Reviewer judgement calls to confirm:
   - appendicitis, drug-induced liver injury, pre-eclampsia (non-severe) and leukaemia are marked must-not-miss;
   - AF, rheumatic heart disease, aortic stenosis, pericardial effusion, and asthma and COPD exacerbations are not (the archive marked some).

2. **Time-critical (86).** Reviewers did not challenge the list much. The CSO should scan it for over-marking.
3. **Cross-class restricted evidence (7).**
   - Known HIV counts as evidence on five TB-class terms, and known TB on dx.hiv and dx.hiv_advanced.
   - These are allowed because the engine shows a fact only to viewers who hold its class.
   - Confirm, or forbid in the build.
4. **The restricted-fact trade-off.** Post-TB lung disease, chronic pulmonary aspergillosis and bronchiectasis (standard terms) cannot use "previous TB" as evidence, which is their defining fact. The same applies to drug-induced liver injury (anti-TB drugs and antiretrovirals) and adrenal insufficiency (adrenal TB or HIV).
   - Options: accept this, make these terms restricted, or allow the evidence with viewer gating (as in item 3).
5. **Rabies exposure** fires only on the fever red flag "contact with sick or dead animals", which misses most dog bites. The history catalogue has no bite item; see §6.
6. **Pregnancy status.** Obstetric suggestions (ectopic pregnancy, pre-eclampsia) are sex-gated but still need a pregnancy-status field to be safe. The history catalogue lacks one.

## 6. Gaps found in the other catalogues (proposed addenda; not built here)

Found while authoring. None was invented. Each is named in the relevant profile's note.

**History catalogue (MS-EMR-CLERK-CAT-001) v1.3 candidates**

- **Pregnancy and gestation:**
  - pregnancy status;
  - weeks of gestation;
  - postpartum up to 6 weeks.
- **Chest pain character:**
  - pleuritic;
  - tearing;
  - radiation to the back or arm;
  - relieved by sitting forward;
  - reproducible on palpation.
- **Timing and triggers:**
  - syncope prodrome, trigger and posture;
  - palpitation onset and offset;
  - "deficit fully resolved" (TIA).
- **Headache character:**
  - throbbing;
  - aura;
  - photophobia;
  - jaw claudication.
- **Exposures and injuries:**
  - animal bite or scratch (dog, snake, other);
  - ingestion or exposure: substance, time, amount, intent;
  - mechanism of injury;
  - cold exposure or long lie;
  - fresh-water or lake contact;
  - unpasteurised dairy;
  - biomass smoke.
- **Past history:**
  - past rheumatic fever;
  - prosthetic valve;
  - thyroidectomy or radioiodine;
  - recent surgery or immobility.
- **Medicines** (only "over-the-counter painkillers" exists today):
  - anticoagulants (warfarin);
  - loop diuretics;
  - digoxin;
  - corticosteroids;
  - chemotherapy or immunosuppressants;
  - benzodiazepines, sedatives and antipsychotics;
  - metoclopramide;
  - a named NSAID;
  - named antiretrovirals (efavirenz, zidovudine, nevirapine, abacavir; restricted);
  - isoniazid (restricted).
- **Vaccinations:** yellow fever, tetanus.
- **Symptom qualifiers:**
  - skin hyperpigmentation;
  - pain migrating to the right iliac fossa;
  - pain radiating to the back.
- **Complaint course:** better, worse or unchanged (the Summary one-liner needs it; prompt Q7).
- **Scores:** 4AT, AUDIT.

**Examination catalogue (MS-EMR-EXAM-CAT-001) candidates**

- **Pupils:** a size band (pinpoint) as an option, for organophosphate and opioid poisoning.
- **Neurological tests:**
  - Dix-Hallpike and HINTS;
  - temporal artery tenderness.
- **Chest and abdomen:**
  - chest-wall tenderness;
  - cervical motion or adnexal tenderness (restricted).
- **Skin, wounds and burns:**
  - a wound, burn (depth, % TBSA, airway) or bite-site item;
  - eschar;
  - limb crepitus;
  - deep muscle swelling;
  - a dermatomal distribution for a rash.
- **Other signs:**
  - conjunctival suffusion;
  - trismus or spasms;
  - breast examination.
- **Evidence-language gap (this catalogue's build).** The examination rule language supports `grid` atoms (power, reflexes, plantars, pulses) and `panel` atoms (postural BP, both arms, PEF). The diagnosis catalogue's authoring language does not yet emit them. So areflexia (GBS), absent foot pulses (limb ischaemia, PAD) and an inter-arm difference (dissection) cannot be evidence yet. Phase 2 should add grid and panel atoms and update those profiles.
- **`inter_arm_difference` classifier:** it has no result ids, so it can be asked but not used as evidence.

**Test catalogue:** proposed tests missing from both lists:

- ASO titre;
- Aspergillus IgG;
- ABPI;
- arterial Doppler;
- mast cell tryptase;
- serum protein electrophoresis and free light chains;
- H. pylori;
- urine sodium and osmolality;
- PTH;
- G6PD;
- Coombs and LDH;
- C-peptide and diabetes antibodies;
- cholera RDT;
- leptospira and rickettsial serology;
- HCV RNA;
- CSF HSV PCR;
- cysticercus serology;
- filarial antigen;
- KOH skin scraping;
- induced sputum;
- acetylcholine-receptor antibodies;
- MRI brain;
- thiamine.

**Diagnosis terms not yet in the catalogue:**

- hyper-reactive malarial splenomegaly;
- podoconiosis;
- chikungunya;
- testicular torsion (restricted class to decide).

## 7. Sources

- The catalogue adds 24 source ids, all `verified: false`, because the build could not open them.
- Most profiles cite source ids that already exist, with their verification status recorded in the history or examination catalogue: NICE, WHO, UCG-2023, RCP-NEWS2, SSC-2026 and others.
- Several profiles cite `CLINICAL-METHODS` or `DRAFT-MEDSYNC` where no guideline id exists yet. Examples:
  - Tokyo guidelines (cholangitis);
  - Revised Atlanta (pancreatitis);
  - ESC syncope, AF, valve, pericardial and aortic guidelines;
  - BTS pleural;
  - GINA;
  - the Jones criteria;
  - KDIGO glomerular.
- Phase 1 opens each new source and sets `verified` honestly, as the examination build did.
