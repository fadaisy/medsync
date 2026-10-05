# MedSync diabetes knowledge pack: hand-back

**MS-NCD-DM-PACK-001 · version 0.3.0-draft · 2026-10-05 · for the Clinical Safety Officer**
Draft content for dossier MS-NCD-DM-DOSSIER-001 (Gate 2). Extends `DIABETES_CATALOG` v0.1.0. Written against briefing commit `8e45d34`.

## Where this stands

The pack is complete as a draft and passes its own checks: 335 cited reference values, 284 criteria, and 83 worked patients that run against the rules every time the pack is built. **Nothing in it is signed and nothing in it is live.** 37 decisions are yours (section 3).

Four things to know before you read further:

1. **Uganda's own diabetes text has not been read.** No copy of the UCG 2023 diabetes sections could be opened past the front matter, and the 2026 Integrated Diabetes Management Guidelines would not open at all. The working default is WHO HEARTS-D 2020, which was read in full. Two empty criteria sets hold the place for the Uganda text. Section 10 lists the pages I need from you.
2. **A second reader re-checked 331 of the reference values against their sources and found no wrong number.** 225 were confirmed as written. 95 needed a qualifier, an operator or a corrected attribution, and all of those corrections are applied. 10 could not be found or opened in full; each is marked as needing your input, and none of them supplies a number to a live rule.
3. **Independent review found the pack unsafe to sign, twice, and both times it was right.** The first two reviews found 14 critical gaps (11 in the rules, 3 in the clerking wiring), almost all of them patients the rules stayed silent on: metformin with an eGFR below 30, a drowsy hyperglycaemic adult with no ketone result, a foot ulcer on its own, a fasting glucose of 3.2 shown as "at target". I fixed them. A second reviewer then re-read the fixes and found 7 more critical problems, several of which the fixes themselves had caused: referral switched off under 16, no referral at the visit where diabetes is first found, an HbA1c the pack calls invalid still shown as "at target", interrupts firing on ordinary abdominal pain. Those are fixed too, each with a test patient.
4. **The second round of fixes has not been re-read by anyone but me.** I stopped the review loop there, as you asked me to finish. The pack is fit to go to you as a draft for your decisions. It is not fit to switch on. The build prompt makes a fresh independent clinical read the first step of Phase 1, before you sign anything.

## 1. Scope

**What the pack teaches the encounter system**

| You asked for | What the pack provides |
|---|---|
| Predict a diagnosis | Who to test (23 rules: symptoms, risk, incidental results, pregnancy, HIV, TB, steroids, antipsychotics, pancreatitis, children). What confirms (8 criteria sets, one live and seven held for a schema change or for the Uganda text). When a result cannot be trusted (27 validity caveats). Every conclusion is one of four states: met, not met, insufficient, or not available at this site. |
| Risk-stratify | Type (rules that stop a lean young adult being assumed type 2; nothing writes a type). Control against the agreed target, with a LOW band. Hypoglycaemia risk. Eyes (new: ICDR grades and ICO macular oedema). Kidney, nerves and feet (amendments to what is built). Cardiovascular risk on the WHO chart for Eastern Sub-Saharan Africa, with the warning that it has not been validated there. |
| Suggest management | What is due and what was never done. Referral with its urgency (23 referral steps). What to teach. An individual target to agree. 19 medicine-safety flags. Class-level treatment review steps on WHO's ladder, switched off in the data (`enabled: false`) until you decide D-DM-20. Acute danger is routed to triage, never managed here. |

**Adults only.** Under 16 the pack recognises and refers; it shows no adult target, band, risk model, flag or treatment step (D-DM-32).

**Out of scope:** every dose and titration; the treatment of ketoacidosis, the hyperosmolar state and hypoglycaemia (owned by the acute pathway); paediatric management; glycaemic targets in pregnancy; insulin regimens; inpatient glucose control; the hypertension pack.

## 2. Research

802 claims were gathered from guidelines and studies on 3 October 2026, each recorded with its document, section and link, and with a verbatim quote wherever the source was read. 711 were read at the source; the rest are marked, and anything built on one of them carries `needsCsoInput`. The full table is `dossier/research-table.csv`.

| Body | Claims | Read at source |
|---|---|---|
| ADA Standards of Care 2026 (2025 where the 2026 page would not open) | 329 | 295 |
| WHO (HEARTS-D 2020, PEN, hyperglycaemia in pregnancy 2013 and 2025, TB and diabetes, CVD risk charts) | 133 | 121 |
| Peer-reviewed studies and other bodies (Ugandan and African cohorts, laboratory standards) | 125 | 114 |
| KDIGO 2022 (diabetes in CKD) and 2024 (CKD) | 49 | 46 |
| Uganda Ministry of Health (UCG 2023, HIV guidelines 2022, EMHSLU 2023, Eye Care 2016) | 48 | 21 |
| IWGDF 2023 (foot) | 45 | 45 |
| ADA/EASD and joint consensus reports (hyperglycaemic crises 2024, type 1 2021) | 18 | 18 |
| ICO 2017 (eye) | 15 | 15 |
| IDF | 10 | 7 |
| ISPAD 2022 | 10 | 10 |
| JBDS | 7 | 7 |
| ESC 2023 | 5 | 4 |
| Endocrine Society | 5 | 5 |
| NICE (NG18, NG19) | 3 | 3 |

**Where the sources disagree** (each is a decision in section 3)

- **Borderline glucose.** WHO starts impaired fasting glucose at 6.1 mmol/L, ADA at 5.6; ADA has an HbA1c band of 5.7 to 6.4% and WHO has none.
- **Meters.** WHO allows a meter for diagnosis where there is no laboratory; the laboratory guideline ADA follows does not (D-DM-04).
- **WHO HEARTS-D against itself.** BMI "≥25" in one figure and ">25" in another; ketones ">2+" and "≥2+"; glucose "≥18" and ">18"; fasting target "≤7.0" in the text and "<7.0" in the indicator table; metformin started at diagnosis in one protocol and after lifestyle advice in the other (D-DM-13, D-DM-34).
- **Eyes.** WHO every 2 years; ADA yearly; ICO by grade, and only where diabetes is controlled; Uganda's 2016 Eye Care Guidelines refer everyone to a retina clinic (D-DM-14).
- **Kidney.** An ACR of exactly 30 mg/mmol is moderately increased in KDIGO's table and severely increased in KDIGO's own figures (D-DM-17).
- **Blood pressure.** HEARTS-D treats at 130/80 in diabetes; WHO's hypertension guideline treats at 140/90 and makes 130 to 139 conditional (D-DM-23).
- **Ketoacidosis.** The 2024 consensus uses glucose 11.1 or known diabetes; HEARTS-D prints 13.9. The pack follows the consensus and records the other.
- **Uganda.** EMHSLU 2023 deleted glibenclamide; UCG 2023 reportedly still names it (D-DM-22). UCG 2023's HIV chapter lists "known diabetics" as a contraindication to dolutegravir (D-DM-33).

**What could not be read**

- UCG 2023 sections 1.1.6, 4.1.6, 8.1.3, 8.1.4, 16.2.5 and 20.2.3 (the reading tool stops in the front matter of every copy). Only the table of contents, the introduction and three passages of the HIV chapter were read.
- The 2026 Integrated Diabetes Management Guidelines for Uganda: not even the title.
- Uganda HIV Guidelines 2022 beyond about page 11; EMHSLU 2023 beyond about page 32.
- Three figures that are images: the C-peptide flowchart (Holt 2021 Fig. 1; ADA 2026 Fig. 2.1), HEARTS-D Fig. 1 (which step "review in 1 month" follows), and KDIGO 2024 Fig. 13 (cell positions were inferred from a text run and should be checked once by eye).
- KDIGO 2012 Table 7 (urine strip to albuminuria category) and the WHO HEARTS risk-based management module.

## 3. Decisions for the CSO

The first option is the recommendation. The machine-readable register is `decisions/d-dm.v1.json`; nothing is decided until you fill it in.

### Decisions that gate clinical use

**D-DM-01 · Default criteria set for Uganda**  
Which diagnostic criteria set does MedSync apply by default?
- **Recommended:** WHO HEARTS-D 2020 now; replace it with Uganda's own set as soon as the text is supplied (UCG 2023 section 8.1.3, or the 2026 Integrated Diabetes Management Guidelines if they are in force).
- Or: Enable no diagnostic rule until the Uganda text has been read.
- Why it is open: D-NCD-11 names UCG 2023, but no copy of its diabetes section could be read: every copy is one large PDF and the reading tool stops in the front matter. WHO HEARTS-D is the document UCG is built on and was read in full.
- Changes: who_hearts_d_2020; the empty sets ug_ucg_2023 and ug_integrated_dm_2026  
- **Needs from you:** UCG 2023 sections 1.1.6, 4.1.6, 8.1.3, 8.1.4, 16.2.5, 20.2.3 (name the printing); the 2026 guideline PDF

**D-DM-04 · A glucose meter for diagnosis and for control**  
May a site with no laboratory diagnose, and judge control, on a meter?
- **Recommended:** Yes, as WHO allows: diagnose on a meter with symptoms or with a repeat on another day; never rule out on a meter value near a threshold; read a fasting or post-meal meter value against WHO's surrogates for control.
- Or: Meter for suspicion only (the laboratory-medicine position ADA follows): district sites then cannot confirm and must refer every case.
- Why it is open: Most Ugandan primary care has a meter and no laboratory glucose. Two steps here are this pack's own and need your signature: any meter reading of 12.2 or more with symptoms counts whatever its timing, and WHO's plasma surrogates are read from a meter.
- Changes: who_hd_fcap_*, who_hd_ogtt_cap_*, who_hd_random_cap_symptoms, who_hd_cap_high_symptoms; fcap_control_who, pcap_control_who; DM-ACT-RX-01B; DM-CON-VALID-02

**D-DM-10 · Suspecting type 1**  
How many features raise the flag, and how urgently?
- **Recommended:** Two of: under 35, BMI below 25, unexplained weight loss (and, in established diabetes, glucose above 20 at presentation). Same day when the diagnosis is new or the type is unclassified and the person is not on insulin; routine once a clinician has recorded the type.
- Or: One feature.
- Or: Three features.
- Why it is open: WHO refers 'clinical suspicion of type 1 in a newly diagnosed patient' the same day but does not define suspicion. ADA/EASD says no single feature confirms it; its figures are from White European data. The count is this pack's.
- Changes: DM-CLS-T1-02, -04, -05

**D-DM-14 · Eyes: how often, and who is referred**  
Which recall interval and which referral rule?
- **Recommended:** No retinopathy: every 2 years (WHO). Mild or moderate: 12 and 6 months unless control is confirmed at target. Refer by grade (ICO): urgent for severe, proliferative or centre-involving disease; routine for moderate. Grade by ICDR ('more than 20' haemorrhages).
- Or: Uganda's Eye Care Guidelines 2016: refer everyone with diabetes to a retina clinic.
- Or: Yearly for everyone (ADA).
- Why it is open: Uganda had 51 ophthalmologists in 2023 and 95% of stakeholders reported no community screening, so 'refer all' may not be deliverable; but it is the national document. UCG 2023 section 20.2.3 was not read.
- Changes: diabetic_retinopathy intervals; DM-ACT-SCREEN-EYE-01; DM-ACT-REFER-EYE-01 to -03; classifier dr_review  
- **Needs from you:** UCG 2023 section 20.2.3

**D-DM-20 · Treatment suggestions in version 1**  
Do the class-level treatment review steps (DM-ACT-RX-01 to -12) show in version 1?
- **Recommended:** Tests, screening, referral, education, targets and safety flags: on. Treatment review steps: on as review prompts with no dose, once you have read them against UCG 2023 section 8.1.3; dark until then.
- Or: Dark until version 1.1, as MS-NCD-ENG-001 reserves.
- Or: On now, on WHO's ladder.
- Why it is open: You asked for the system to suggest management. Without these steps it can say what is due and what is unsafe, but not what the next treatment step is. Uganda's own ladder has not been read, and WHO's own documents disagree on when metformin starts (D-DM-34).
- Changes: Every management step of kind therapy_review (proposal kind therapy.review)  
- **Needs from you:** UCG 2023 section 8.1.3

**D-DM-22 · Glibenclamide, and which sulfonylurea at which level**  
How does the engine treat glibenclamide?
- **Recommended:** Recognise it (patients still take it), flag it at 60 or over, with reduced kidney function and where lows are a concern, and never propose it. Name the sulfonylurea per level of care only after the EMHSLU 2023 endocrine pages are read.
- Or: Propose glimepiride at primary care now, on the secondary source.
- Why it is open: EMHSLU 2023 deleted glibenclamide; UCG 2023 reportedly still names it. The levels of care were read in a journal article, not in the list.
- Changes: glibenclamide_* flags; DM-ACT-RX-02; formulary additions  
- **Needs from you:** EMHSLU 2023 endocrine and laboratory sections

**D-DM-28 · A meter reading in pregnancy**  
What may the engine do with a meter value in a pregnant woman?
- **Recommended:** Refer on it: any reading of 11.1 or more, or a fasting reading of 7.0 or more, today; a fasting reading of 5.1 to 6.9, for a laboratory glucose. Diagnose gestational diabetes on plasma glucose only.
- Or: Also diagnose on a plasma-calibrated meter where no laboratory exists.
- Why it is open: Most antenatal care is at health centre III with a meter. WHO's criteria are for plasma; FIGO 2015 discusses meters and was not read for this point.
- Changes: DM-CON-PREG-03, -04, -05; DDX-PREGNANCY-GLUCOSE

**D-DM-32 · Where 'adult' starts**  
Under 16 the engine offers recognition and referral only. Confirm the boundary.
- **Recommended:** 16, and the platform's adolescent band ends there, so 16 to 19-year-olds get the adult rules.
- Or: The platform's band as it stands, with the adult rules extended down to it.
- Why it is open: If the adolescent band runs past 16, people aged 16 to 19 would lose every adult rule and gain nothing in its place.
- Changes: x.ages on targets, bands, risk models and flags; ageBands on rules; REF-DX-ADULT-AGE

**D-DM-33 · Dolutegravir and glucose**  
What does the engine say when a person on dolutegravir has a raised glucose, or has diabetes?
- **Recommended:** Propose a glucose test; show UCG's words with their source; never propose an ART change; say 'discuss with the ART clinic'. Show the dolutegravir-metformin warning once, to be acknowledged, not at every visit.
- Or: Follow UCG 2023 literally: propose substitution.
- Why it is open: UCG 2023's HIV chapter, read word for word, lists 'known diabetics' as a contraindication to dolutegravir and says 'Do RBS to confirm hyperglycaemia then substitute with EFV'. The 2022 HIV guideline's algorithm, which may differ, could not be read. An NCD engine should not change ART.
- Changes: DM-SUS-POP-DTG-01; dolutegravir_with_metformin; REF-DM-SUS-HIV-UG  
- **Needs from you:** Uganda HIV Guidelines 2022, the dolutegravir glucose algorithm (about pp. 186 to 189)

**D-DM-36 · Pregnancy not recorded**  
A woman who could be pregnant, with no answer recorded: what may the engine conclude?
- **Recommended:** Nothing that applies only outside pregnancy: the non-pregnant criteria set, the targets and the treatment steps wait for the answer. Acute and suspicion rules still run.
- Or: Block only HbA1c; let glucose criteria run.
- Why it is open: HbA1c is not valid in pregnancy and several medicines are contraindicated. One recorded answer releases everything.
- Changes: appliesTo.pregnancy on criteria sets, targets, therapy steps; feature pregnancy_possible

**D-DM-37 · Rules with no sentence to quote**  
Six items rest on reasoning, not on a quotable sentence. Sign each as a MedSync rule or strike it.
- **Recommended:** Sign all six with their reasons.
- Or: Strike any you do not accept; the build removes its vignette.
- Why it is open: (1) Diabetes and unwell with no glucose on record: test today (DM-ACU-ROUTE-13); drowsy: test now (DM-ACU-ROUTE-20). (2) No antiplatelet after a bleeding or untyped stroke. (3) Any meter reading of 12.2 or more, or HI, with symptoms is diagnostic. (4) The three pregnancy meter rules. (5) The count of two features for suspected type 1. (6) Repeated self-treated lows prompt the same review as one severe low.
- Changes: The items whose citation carries needsCsoInput

### Boundaries, wording and local settings

**D-DM-02 · Which symptoms let one glucose value diagnose**  
With symptoms, one diabetes-range value is diagnostic. Which symptoms count?
- **Recommended:** Thirst, passing a lot of urine, unexplained weight loss: the three WHO and ADA both name.
- Or: Add blurred vision and fatigue, which HEARTS-D also lists.
- Why it is open: Fatigue and blurred vision are common and non-specific; counting them would diagnose on a single value far more often.
- Changes: The symptom criteria of who_hearts_d_2020; DM-SUS-SYMP-01 and -02

**D-DM-03 · Random glucose of 11 or 11.1 in HIV care**  
Uganda's 2022 HIV guideline prints 'RBG ≥ 11mmol'. Which number does the engine use?
- **Recommended:** 11.1 mmol/L everywhere (WHO and ADA).
- Or: 11 in HIV clinics, to match the guideline's wording.
- Why it is open: The guideline's line defines a client category in a summary table; it is not written as a diagnostic criterion, and its algorithm pages could not be read.
- Changes: REF-DM-DX-HIVGL-FBG, REF-DM-DX-HIVGL-RBG (not used by any rule)  
- **Needs from you:** Uganda HIV Guidelines 2022, about pp. 186 to 189 and 237 to 251

**D-DM-05 · Who is offered a test without symptoms**  
Which eligibility rules run?
- **Recommended:** WHO's rule everywhere (40 or over and overweight). ADA's 'overweight with another risk factor' at sites with a laboratory. ADA's 'everyone from 35' off.
- Or: WHO's rule only.
- Or: All three.
- Why it is open: No diabetes risk score has been validated in Uganda, so the pack uses published eligibility rules and no points score. Universal testing from 35 would load laboratories with low-yield tests.
- Changes: DM-SUS-RISK-01 to -03, DM-SUS-RISK-NEVER

**D-DM-06 · What counts as 'tested and negative'**  
When may the engine record that diabetes has been excluded?
- **Recommended:** 'Full' only with a normal 2-hour OGTT. A normal fasting glucose or HbA1c alone is 'limited', with a re-test date.
- Or: Accept a normal fasting glucose as full exclusion.
- Why it is open: In African cohorts a single fasting glucose or HbA1c missed roughly a third to a half of OGTT-defined diabetes. No guideline states what excludes diabetes in a high-risk African adult: this grade is a MedSync rule.
- Changes: DM-CON-GRADE-01

**D-DM-07 · How near is 'near the threshold'**  
ADA says to repeat a result 'close to' the threshold in 3 to 6 months. How close?
- **Recommended:** Within the fasting glucose's own within-person variation (REF-DM-VAL-FPG-CV) below the threshold.
- Or: A fixed band you choose.
- Why it is open: ADA gives no number. The variation figure is the only sourced quantity that bears on it.
- Changes: DM-CON-DISC-02

**D-DM-08 · Time windows that are product settings**  
How far back does the engine look for an unfollowed raised glucose, and how old may a glucose result be and still count as evidence at this visit?
- **Recommended:** You set both. Until you do, the rules that depend on them stay dark (REF-DX-RESULT-AGE-GLUCOSE has no value on purpose).
- Or: Reuse the 3-month control window (REF-DM-CTRL-WINDOW-ABOVE) for the age of a glucose result.
- Why it is open: No guideline gives these numbers. The pack will not invent them.
- Changes: DM-SUS-INCID-WINDOW; every clerking atom with max_age_ref on glucose

**D-DM-09 · Order of the next-best test**  
In what order does the engine propose tests?
- **Recommended:** As written in DM-ACT-TEST-01: symptomatic, a random glucose now; no symptoms with a laboratory, fasting plasma glucose, then an OGTT if it is 6.1 to 6.9; HbA1c only where no caveat holds; no laboratory, a fasting meter reading repeated on another day; pregnant, a 75 g OGTT; on steroids, after a meal.
- Or: A different order you specify.
- Why it is open: Each step follows a source; the ORDER between them is a judgement.
- Changes: DM-ACT-TEST-01

**D-DM-11 · C-peptide thresholds**  
May the engine use C-peptide to support or refute type 1?
- **Recommended:** Not yet. Keep both criteria held out until a person has read the source figure (Holt 2021 Fig. 1; ADA 2026 Fig. 2.1), then restore them with the timing conditions.
- Or: Restore now on the legend text alone.
- Why it is open: The meaning of the 200 and 600 pmol/L thresholds sits inside a flowchart image that could not be read. Used wrongly, a high value invites stopping insulin in early type 1.
- Changes: classification type_1 (x.heldOut); REF-DM-CLS-CPEP-LOW, -HIGH  
- **Needs from you:** The two figures, read by a person

**D-DM-12 · Testing in pregnancy**  
Does the engine prompt for a 75 g OGTT in pregnancy?
- **Recommended:** Yes, at 24 weeks or more, at sites that can run one (FIGO). Elsewhere it stays off and the meter referral rules apply.
- Or: Off everywhere: WHO makes no universal recommendation.
- Why it is open: WHO's 2013 criteria say how to diagnose, not whom to test. UCG 2023 section 16.2.5 was not read.
- Changes: DM-SUS-PREG-01  
- **Needs from you:** UCG 2023 section 16.2.5

**D-DM-13 · Exactly at the target**  
Is an HbA1c of exactly 7.0%, a fasting glucose of exactly 7.0 or a post-meal glucose of exactly 9.0 at target?
- **Recommended:** Follow WHO's clinical wording: fasting 7.0 and post-meal 9.0 are AT target ('at or below'); HbA1c 7.0% is not ('below 7.0%', as WHO's indicator and ADA print). This needs an inclusive upper edge on two bands.
- Or: 'Below' for all three, as the bands are built today.
- Why it is open: WHO's text says 'at or below' for the two glucose surrogates and its own indicator table says 'below'; for HbA1c the text has no operator. The treatment step already uses 'above 7.0' for fasting glucose.
- Changes: hba1c_control_*, fpg_control_who, ppg_control_who, fcap_control_who, pcap_control_who; DM-ACT-RX-01

**D-DM-15 · Lipid testing at district sites**  
Does the yearly lipid prompt run where there is no lipid profile?
- **Recommended:** Off where the site has no lipid profile; on where it has. The statin prompt in type 2 diabetes at 40 or over does not depend on it.
- Or: On everywhere, as a referral prompt.
- Why it is open: WHO HEARTS-D sets no lipid interval and gives the statin without one. ADA's yearly profile is expert opinion (grade E).
- Changes: DM-ACT-SCREEN-LIPID-01

**D-DM-16 · 'Kidney failure' as a hypoglycaemia risk**  
ADA lists 'kidney failure' as a major risk factor. What eGFR does the engine read that as?
- **Recommended:** Below 30 for 'high'; below 60 for 'raised'.
- Or: Below 15 for 'high'.
- Why it is open: ADA gives no number for 'kidney failure'. Insulin and sulfonylurea clearance falls well before dialysis.
- Changes: hypoglycaemia_risk_ada

**D-DM-17 · An ACR of exactly 30 mg/mmol**  
Moderately or severely increased?
- **Recommended:** Severely increased (30 or more), as KDIGO's own figures and ADA have it.
- Or: Moderately increased (KDIGO 2024 Table 3: A3 is 'above 30').
- Why it is open: KDIGO 2024 disagrees with itself at this value. The safer reading is the higher category.
- Changes: REF-DM-KID-ACR-A3; the live albuminuria staging

**D-DM-18 · Loss of protective sensation**  
One abnormal test, or two?
- **Recommended:** One (IWGDF): monofilament or vibration; light touch where neither tool exists.
- Or: Monofilament plus one other (ADA).
- Why it is open: IWGDF's rule needs one tool and is the more sensitive. The foot domain already follows IWGDF.
- Changes: The live foot complication; ipswich_sites_missed

**D-DM-19 · eGFR below 30**  
How urgent is the referral?
- **Recommended:** Same day from primary care (WHO HEARTS-D).
- Or: Urgent, not same day, where a physician is on site.
- Why it is open: WHO lists it with anuria under same-day referral. KDIGO names it as a reason for kidney care and gives no time.
- Changes: DM-ACT-REFER-EGFR-01

**D-DM-21 · SGLT2 inhibitors and GLP-1 agonists for heart and kidney protection**  
Does the engine propose them?
- **Recommended:** At referral sites only, as 'refer for consideration'. Off at district sites.
- Or: Off everywhere until supply improves.
- Or: On everywhere.
- Why it is open: ADA and KDIGO recommend them whatever the HbA1c. EMHSLU 2023 lists dapagliflozin at tertiary level, and a 2025 analysis found no public-sector availability.
- Changes: DM-ACT-RX-05, DM-ACT-RX-05B

**D-DM-23 · Blood pressure threshold in diabetes**  
At what pressure does the engine prompt a treatment review?
- **Recommended:** 130/80 on two occasions (WHO HEARTS-D).
- Or: 140/90 (WHO's hypertension guideline treats everyone at this level and makes 130 to 139 in diabetes a conditional recommendation).
- Why it is open: UCG 2023 section 4.1.6 was not read; the hypertension pack will own this in the end.
- Changes: DM-ACT-RX-07; bp_*_who_hearts_d; tgt_bp  
- **Needs from you:** UCG 2023 section 4.1.6

**D-DM-24 · A glucose of exactly 3.9 or 3.0**  
Is 3.9 hypoglycaemia? Is 3.0 level 2?
- **Recommended:** ADA's levels, as the live catalog uses: below 3.9 is level 1, below 3.0 is level 2.
- Or: WHO's wording: 'at or below 3.9'.
- Why it is open: The sources differ only at the exact value. UCG 2023 section 1.1.6 was not read.
- Changes: DM-ACU-ROUTE-06, -07; the LOW band  
- **Needs from you:** UCG 2023 section 1.1.6

**D-DM-25 · 'Above 7.8' in hospital**  
The source says above 7.8; the vital-sign atom has only 'at or above'.
- **Recommended:** Add gt_ref to the vital atom.
- Or: Accept 'at or above' (the difference is a reading of exactly 7.8).
- Why it is open: A one-line engine change; keeps the rule faithful to the source.
- Changes: DDX-GLUCOSE-IN-HOSPITAL

**D-DM-26 · Insulin storage advice**  
The East Africa Diabetes Study Group advises against clay pots on hygiene grounds; a field study (recalled, not re-read) found they keep insulin cooler.
- **Recommended:** Carry only the advice nobody contests (refrigerate unopened insulin, never freeze it, keep a vial in use out of the sun) and say nothing about clay pots until you have read both sources.
- Or: Carry the regional group's advice in full, including 'no clay pots'.
- Why it is open: Many patients have no refrigerator, so this advice matters; it should not rest on a contested claim either way.
- Changes: DM-ACT-EDU-05; REF-DM-ACT-EDU-INSULIN-STORE

**D-DM-27 · Vaccines**  
Does the engine prompt for vaccines in adults with diabetes?
- **Recommended:** No. Uganda's routine schedule has none for this group, and ADA's table is the US schedule.
- Or: Yes, as advice where available.
- Why it is open: A prompt nobody can act on is noise.
- Changes: REF-DM-ACT-VACCINES (not used by any rule)

**D-DM-29 · A raised glucose during acute illness or at TB diagnosis**  
Warn, or hold the diagnosis?
- **Recommended:** Warn beside the value and let the criteria run; the clinician decides. Re-test after recovery (TB: after the first month).
- Or: Hold the diagnosis as 'pending re-test after recovery' unless ketones are raised or symptoms came before the illness.
- Why it is open: WHO: hyperglycaemia under acute stress 'should not in itself be regarded as diagnostic'. But holding a diagnosis delays treatment in a person who does have diabetes.
- Changes: glucose_acute_illness and the five related caveats

**D-DM-30 · Which pregnancy facts are a restricted class**  
Are pregnancy, previous gestational diabetes and 'could become pregnant' restricted as sexual and reproductive health?
- **Recommended:** 'Could become pregnant' and previous gestational diabetes: restricted. Current pregnancy: not restricted, because medicine safety checks must read it everywhere.
- Or: All three restricted.
- Or: None restricted.
- Why it is open: Today only 'could become pregnant' is tagged. The answer changes which staff see which prompts.
- Changes: Features pregnant, prior_gdm, could_conceive, pcos; hx.prior_gdm; the history question on diabetes in a previous pregnancy

**D-DM-31 · Words about changing a medicine**  
The rule is 'no doses'. May engine text say 'stop', 'hold' or 'reduce' when quoting a guideline?
- **Recommended:** 'Contraindicated', 'stop' and 'hold' when the source says so; never 'reduce' or 'increase'. Everything ends 'review with the prescriber'.
- Or: No direction words at all.
- Why it is open: A contraindication cannot be stated without the word. A direction of titration is a step towards a dose.
- Changes: Therapy flag actions; REF-DM-RX-METFORMIN-NOSTART-EGFR

**D-DM-34 · When metformin starts**  
At diagnosis with lifestyle advice, or only after lifestyle advice has not worked?
- **Recommended:** When a measure is above target and the person is on no medicine, alongside lifestyle advice (HEARTS-D Fig. 2, the WHO PEN protocol).
- Or: Only after a period of diet and activity alone (HEARTS-D text and Fig. 1).
- Why it is open: WHO HEARTS-D prints both. UCG 2023 may settle it.
- Changes: DM-ACT-RX-01, DM-ACT-RX-01B  
- **Needs from you:** UCG 2023 section 8.1.3

**D-DM-35 · Type 1 as must-not-miss on the clerking desk**  
The amendment sets must-not-miss true on type 1 diabetes.
- **Recommended:** Yes: untreated it becomes ketoacidosis.
- Or: Leave the live setting.
- Why it is open: If the live profile already says so, nothing changes.
- Changes: dx.dm_type1

## 4. Catalog content

| File | Lane | Contents |
|---|---|---|
| `catalog/01-features.json` | | 192 features: 50 seen in the briefing, 45 probably present under this or another code, 97 new |
| `catalog/10-suspect.json` | suspect | 23 rules on who to test |
| `catalog/20-confirm.json` | confirm | 1 live criteria set, 7 pending; 27 validity caveats; 5 pregnancy rules |
| `catalog/30-classify.json` | classify | 3 classifications; 11 rules. Both C-peptide criteria are held out |
| `catalog/40-stratify.json` | stratify | 2 complications with staging, 10 amendments to live ones, 2 risk models, 8 target proposals, control and blood-pressure bands |
| `catalog/50-act.json` | act | 59 management steps, 19 therapy flags, 19 orderables |
| `catalog/60-acute-route.json` | acute route | 19 rules that hand the patient to triage |
| `dossier/ref-dm.v1.json` and `.csv` | | 335 reference entries, 188 with a number, 114 read by a rule. **Every number in every rule is typed once, here** |
| `designb/pack-manifest.draft.json` | | 195 rules in 32 families, in the shape MS-NCD-ENG-001 specifies |
| `clerking-v2/*` | | 8 engine changes; history, examination and impression amendments; 44 suggested-care items |
| `wiring/*` | | Test menu, formulary classes (no doses), concept proposals, and every catalogue id to resolve |
| `vignettes/golden-vignettes.json` | | 83 synthetic patients with expected and computed results |
| `decisions/d-dm.v1.json` | | 37 decisions |
| `review/REVIEW-LOG.json` and `.csv` | | 122 review findings, each with what was done |

**Rules of the pack that the build enforces.** No dose anywhere (a pattern check over every string). Every numeric predicate draws its value from a reference entry. Every reference number is found in the claim it cites. Every label states the numbers its predicates test. Every item that reads a restricted fact carries a neutral display, action and alternative, and none of them names a restricted fact. Every field a current glucose can be typed into is read by the low-glucose rule and the very-high-glucose rule. Every item that is switched off names the decision that switches it on. Every decision cited exists. Every clerking reference is used. All 83 patients compute what is expected.

**What changed from 0.2.0.** 63 rules (was 35), 59 steps (was 49), 19 flags (was 14), 27 caveats (was 19), 83 patients (was 34). The tick-box "on insulin or a sulfonylurea" is gone: the engine reads the medicine list. Seven "never done" answers exist, so the never-tested and never-screened are no longer invisible. A blocking caveat acts by its direction: an undilated look that seems normal is not stored as normal, while proliferative disease seen on the same look still counts. A value under a blocking caveat is never shown as "at target". An interrupt needs a sign, not just a symptom, and each test prompt clears when its result is recorded.

**What is switched off in the data.** 12 treatment-review steps (D-DM-20), ADA's testing of everyone from 35 (D-DM-05) and the pregnancy OGTT prompt (D-DM-12). The evaluator reports them as "met but dark", so you can see what each would have said. The three steps that ask for less treatment (after a significant low; the frail older person on a sulfonylurea or on insulin) stay on with the safety flags.

## 5. Concept mapping (Clinical Fact Contract)

- 51 features map to a concept that exists; 141 have none yet (`wiring/cfc-addendum.proposal.json`, `featureToConcept`).
- 30 concepts are proposed. 6 of them probably exist already and are marked "verify": the proposal must be diffed against the generated concept catalogue before an addendum is written.
- 4 qualifiers are needed, above all glucose context and specimen: a rule may not read a glucose whose timing is unknown.
- 16 diagnosis terms map to condition concepts, 8 of them new.
- `wiring/reconcile-ids.json` lists all 98 catalogue ids the clerking wiring names; 63 must be found in the live catalogues in Phase 0. None is to be guessed.

The concept addendum and its seed migration are **gated: you apply them**. The next free migration number at the briefing was 0092.

## 6. Golden vignettes

Every patient is synthetic. The last column lists what the reference evaluator computed, by rule id (education steps omitted). The file holds the full expectation, including what must stay silent.

| Id | Patient | Site | The engine computes |
|---|---|---|---|
| DMV-01 | Thirst, polyuria and a random glucose of 14.2 | referral | diagnosis met; DM-SUS-INCID-01 |
| DMV-02 | One fasting glucose of 7.4, no symptoms, nothing repeated | referral | diagnosis insufficient; DM-SUS-INCID-02 |
| DMV-03 | Every test done and normal | referral | diagnosis not met; no rule fires |
| DMV-04 | A normal fasting glucose alone, in a high-risk woman | referral | diagnosis insufficient; DM-SUS-RISK-02 |
| DMV-05 | District site: eligible, nothing measured yet | district | diagnosis insufficient; DM-SUS-RISK-01; dark: DM-SUS-RISK-03 |
| DMV-06 | District site: two fasting meter readings of 8.1 and 8.4 on different days | district | diagnosis met; no rule fires |
| DMV-07 | HbA1c 6.9% twice, sickle cell trait on record | referral | diagnosis insufficient; caveat in force: hba1c_variant_trait; no rule fires |
| DMV-08 | Fasting glucose 5.9: prediabetes under ADA, normal under WHO | referral | diagnosis insufficient; no rule fires |
| DMV-09 | 1-hour glucose 11.9 with a 2-hour of 9.5: diabetes under IDF, impaired tolerance under WHO | referral | diagnosis insufficient; no rule fires |
| DMV-10 | Known type 2 on an SGLT2 inhibitor, vomiting, glucose 9.4, urine ketones 3+ | referral | DM-ACU-ROUTE-02, metformin_during_acute_illness, sglt2_during_acute_illness |
| DMV-11 | District: new patient, polyuria, meter glucose 24 | district | diagnosis met; DM-ACU-ROUTE-01, DM-SUS-INCID-01 |
| DMV-12 | The same patient with urine ketones 2+ | district | diagnosis met; DM-ACU-ROUTE-02, DM-CLS-T1-01, DM-SUS-INCID-01 |
| DMV-13 | On ART with an HbA1c of 6.6% | referral | diagnosis insufficient; DM-SUS-POP-HIV-01 |
| DMV-14 | A 9-year-old with weight loss, new bed-wetting, deep breathing and vomiting | referral | diagnosis insufficient; DM-ACU-ROUTE-04, DM-ACU-ROUTE-15, DM-SUS-PAED-01, DM-SUS-PAED-02 |
| DMV-15 | 19-year-old, BMI 17, diabetes diagnosed this year, no ketones | referral | DM-CLS-ATYP-01, DM-CLS-T1-05 |
| DMV-16 | Known type 2 on metformin, HbA1c 8.4% against a general target | referral | dark: DM-ACT-RX-02, DM-ACT-RX-06 |
| DMV-17 | Known type 2, last HbA1c 14 months ago | referral | DM-ACT-TEST-HBA1C-01 |
| DMV-18 | Known type 2: eGFR 52 and ACR 12 mg/mmol, each seen once | referral | DM-ACT-REFER-EGFR-02 |
| DMV-19 | Known type 2 on metformin: numb feet, monofilament not felt on both feet, ankle reflexes absent | referral | DM-ACT-SCREEN-B12-01, DM-STR-NEURO-01; dark: DM-ACT-RX-12 |
| DMV-20 | District: known type 2, last retinal examination 30 months ago, no camera | district | DM-ACT-SCREEN-EYE-01 |
| DMV-21 | Retina 'normal' on undilated direct ophthalmoscopy | referral | DM-ACT-SCREEN-EYE-01 |
| DMV-22 | Severe non-proliferative retinopathy on a retinal photograph | referral | DM-ACT-REFER-EYE-01 |
| DMV-23 | 26 weeks pregnant: OGTT fasting 5.4, 1-hour 9.2, 2-hour 8.0 | referral | DM-CON-PREG-01 |
| DMV-24 | Pregnant with known diabetes, on an ACE inhibitor and a statin | referral | DM-ACT-SCREEN-PREG-01, ras_blocker_or_statin_in_pregnancy |
| DMV-25 | 67-year-old on glibenclamide and metformin, eGFR 38 | referral | DM-ACT-REFER-EGFR-02, glibenclamide_age_60, glibenclamide_ckd, metformin_egfr_30_44 |
| DMV-26 | On TB treatment with rifampicin and gliclazide | referral | sulfonylurea_with_rifampicin |
| DMV-27 | Type 2, off all medicines for 8 months, HbA1c 6.1% | referral | education only |
| DMV-28 | 79-year-old, frail, on gliclazide, HbA1c 6.4% | referral | DM-ACT-REFER-EGFR-02, DM-ACT-RX-11 |
| DMV-29 | On prednisolone: fasting glucose 5.6, after lunch 13.4 | referral | diagnosis insufficient; DM-CLS-DRUG-01, DM-SUS-POP-STEROID-01 |
| DMV-30 | 58-year-old man with type 2 diabetes who smokes: WHO chart risk 14% (laboratory chart) | referral | dark: DM-ACT-RX-06, DM-ACT-RX-07 |
| DMV-31 | The same man assessed with the non-laboratory chart | district | caveat in force: who_chart_non_lab_in_diabetes |
| DMV-32 | On insulin, one low needing help in the last year | referral | DM-ACT-RX-10, hypoglycaemia_needing_help_on_treatment |
| DMV-33 | An empty record | referral | diagnosis insufficient; no rule fires |
| DMV-34 | Inpatient with pneumonia, glucose 9.6, no known diabetes | referral | diagnosis insufficient; DM-SUS-INPT-01 |
| DMV-35 | On metformin, eGFR 28, above target | referral | DM-ACT-REFER-EGFR-01, metformin_egfr_below_30 |
| DMV-36 | New adult, meter 27, vomiting, deep breathing, drowsy, no ketone result yet | district | diagnosis insufficient; DM-ACU-ROUTE-01, DM-ACU-ROUTE-11, DM-SUS-INCID-01 |
| DMV-37 | 72-year-old with type 2 diabetes, glucose 38, drowsy and dry, ketones negative | referral | DM-ACU-ROUTE-14 |
| DMV-38 | 7-year-old: vomiting, deep breathing, dry and drowsy. Nobody asked about thirst | district | diagnosis insufficient; DM-ACU-ROUTE-15, DM-ACU-ROUTE-18 |
| DMV-39 | The same child with a meter glucose of 26 | district | diagnosis insufficient; DM-ACU-ROUTE-01, DM-ACU-ROUTE-04, DM-SUS-PAED-03 |
| DMV-40 | 10-year-old with known type 1 diabetes on insulin: vomiting and abdominal pain, fasting glucose 3.1, BP 124/78 | referral | DM-ACU-ROUTE-04, DM-ACU-ROUTE-07, hypoglycaemia_needing_help_on_treatment |
| DMV-41 | 78-year-old on glibenclamide: a low needing help last month, fasting glucose 3.2, meter 2.6 now | referral | DM-ACT-RX-10, DM-ACU-ROUTE-06, DM-ACU-ROUTE-07, glibenclamide_age_60, glibenclamide_hypoglycaemia_concern and 1 more |
| DMV-42 | 60-year-old with diabetes and a foot ulcer; infection not graded, pulses not yet felt | district | DM-ACT-REFER-FOOT-02 |
| DMV-43 | The same foot with absent pulses | district | DM-ACT-REFER-FOOT-01 |
| DMV-44 | District antenatal clinic: 30 weeks pregnant, thirsty, meter 13.0 | district | DM-CON-PREG-03; dark: DM-SUS-PREG-01 |
| DMV-45 | District antenatal clinic: 30 weeks pregnant, fasting meter 6.2 | district | DM-CON-PREG-04; dark: DM-SUS-PREG-01 |
| DMV-46 | 28-year-old woman, pregnancy never asked, HbA1c 6.6% twice | referral | diagnosis insufficient; no rule fires |
| DMV-47 | Type 1 diabetes, off insulin for 3 months, HbA1c 6.3%, meter 15 | referral | DM-ACU-ROUTE-09 |
| DMV-48 | On ART, never had a glucose test, no symptoms | referral | diagnosis insufficient; DM-SUS-POP-HIV-01; dark: DM-SUS-RISK-03 |
| DMV-49 | Known type 2 diabetes for 6 years; no check of any kind has ever been done | referral | DM-ACT-SCREEN-EYE-01, DM-ACT-SCREEN-FOOT-01, DM-ACT-SCREEN-KIDNEY-01, DM-ACT-SCREEN-LIPID-01, DM-ACT-SCREEN-NEURO-01 and 1 more |
| DMV-50 | Thin 24-year-old with weight loss; meter 22, nobody recorded when it was taken | district | diagnosis met; DM-ACU-ROUTE-01, DM-CLS-T1-04, DM-SUS-INCID-01 |
| DMV-51 | Collecting glibenclamide every month; the record says no diabetes | referral | diagnosis insufficient; DM-SUS-RECON-01, glibenclamide_age_60 |
| DMV-52 | Ketosis at first presentation 8 years ago; came off insulin, stayed well; type 2 recorded; HbA1c 7.8% on no medicine | referral | dark: DM-ACT-RX-01 |
| DMV-53 | District: known type 2 diabetes on no medicine, fasting meter 12.4 | district | dark: DM-ACT-RX-01B |
| DMV-54 | On an ACE inhibitor, eGFR 25, potassium 6.2 | referral | DM-ACT-REFER-EGFR-01, DM-ACU-ROUTE-16, ras_blocker_potassium_6_or_more |
| DMV-55 | ACR 12 mg/mmol twice, but the samples were taken during a fever | referral | caveat in force: uacr_transient, uacr_count_transient |
| DMV-56 | Known type 2 diabetes, now on prednisolone, meter 15 | referral | DM-STR-STEROID-01 |
| DMV-57 | On olanzapine for 14 weeks; glucose normal before starting, none since | referral | diagnosis insufficient; DM-SUS-POP-ANTIPSYCH-01 |
| DMV-58 | Pregnant with type 2 diabetes, still on glibenclamide | referral | DM-ACT-SCREEN-PREG-01, other_glucose_lowering_in_pregnancy |
| DMV-59 | Known diabetes: chest pain since this morning | referral | DM-ACU-ROUTE-17 |
| DMV-60 | eGFR down 25% a month after starting an ACE inhibitor | referral | DM-ACT-REFER-EGFR-02 |
| DMV-61 | 15-year-old with type 1 diabetes, pregnant, on an ACE inhibitor, eGFR 20, sudden loss of vision, a foot ulcer with gangrene | referral | DM-ACT-REFER-EGFR-01, DM-ACT-REFER-FOOT-01, DM-ACT-REFER-FOOT-03, DM-ACT-REFER-VISION-01, DM-ACT-SCREEN-PREG-01 and 1 more |
| DMV-62 | Diabetes found today (meter 16 with thirst) in a man who came with gangrene of the foot; eGFR 20 | referral | diagnosis met; DM-ACT-REFER-EGFR-01, DM-ACT-REFER-FOOT-01, DM-ACT-REFER-FOOT-03, DM-ACU-ROUTE-08, DM-SUS-INCID-01 |
| DMV-63 | On insulin; a reading of 2.4 typed into the 'after a meal' box | referral | DM-ACU-ROUTE-06, DM-ACU-ROUTE-07 |
| DMV-64 | 8-year-old, meter 13.0, no symptom recorded | district | diagnosis insufficient; DM-SUS-PAED-03 |
| DMV-65 | Known type 2 diabetes on ART, HbA1c 6.4% against a general target | referral | caveat in force: hba1c_hiv_on_art |
| DMV-66 | 14 weeks pregnant with type 1 diabetes, fasting meter 6.8 | referral | DM-ACT-SCREEN-PREG-01 |
| DMV-67 | Type 2 diabetes on metformin, meter 12.0, abdominal pain and nothing else | referral | DM-ACU-ROUTE-19 |
| DMV-68 | Thin 19-year-old with diabetes; islet antibodies negative | referral | DM-CLS-ATYP-01, DM-CLS-T1-05 |
| DMV-69 | 79-year-old, frail and forgetful, on insulin; fasting glucose 4.2, HbA1c 5.9% | referral | DM-ACT-RX-11B |
| DMV-70 | Thin 24-year-old woman with weight loss, meter 16.5; nobody recorded whether she is pregnant | district | diagnosis insufficient; DM-ACU-ROUTE-08, DM-CLS-T1-04, DM-SUS-INCID-01 |
| DMV-71 | Known type 2 diabetes, HbA1c 9.0% on metformin; pregnancy never recorded | referral | 5 items wait for the pregnancy answer |
| DMV-72 | District: a fasting meter reading of 8.5, no symptoms, nothing repeated | district | diagnosis insufficient; DM-SUS-INCID-03 |
| DMV-73 | Retina recorded as 'no retinopathy'; nobody recorded how it was examined | referral | education only |
| DMV-74 | Proliferative retinopathy seen on an undilated look | referral | DM-ACT-REFER-EYE-01, DM-ACT-SCREEN-EYE-01 |
| DMV-75 | Lean 22-year-old on glibenclamide for two years; no type on record | referral | DM-CLS-T1-05 |
| DMV-76 | Type 1 diabetes on record; the medicine list is blank | referral | DM-ACU-ROUTE-09 |
| DMV-77 | Brought in unresponsive; glibenclamide in the bag; nothing else known | referral | diagnosis insufficient; DM-ACU-ROUTE-20, glibenclamide_age_60 |
| DMV-78 | Type 2 diabetes on metformin, well, meter 19, ketones negative, above target | referral | DM-ACT-REFER-GLU-01 |
| DMV-79 | District: lean 36-year-old, never tested, no symptoms | district | diagnosis insufficient; dark: DM-SUS-RISK-03 |
| DMV-80 | An ordinary visit: type 2 diabetes on metformin, HbA1c 6.8% a month ago, everything checked this year | referral | education only |
| DMV-81 | 30 weeks pregnant, fasting meter 9.8, at a site with no laboratory | district | DM-CON-PREG-05; dark: DM-SUS-PREG-01 |
| DMV-82 | Type 2 diabetes, off medicines for 6 months, HbA1c 6.0%, fasting meter 9.5 | referral | dark: DM-ACT-RX-01B |
| DMV-83 | 6-year-old with gastroenteritis: vomiting, urine ketones 2+, glucose 4.5 | referral | diagnosis insufficient; no rule fires |

Removing a safety rule makes the build fail (checked by removing the clinical-picture rule, the low-glucose rule and the metformin flag), so the patients are not decorative. One patient is deliberately ordinary (DMV-80: well, controlled, everything checked this year): two teaching prompts fire and nothing else.

## 7. Mapping to Design B (MS-NCD-ENG-001)

| Lane | Rules |
|---|---|
| suspect | 28 |
| confirm | 42 |
| classify | 11 |
| stratify | 12 |
| act | 82 |
| acute route | 20 |

23 of the 195 rules need code of their own, because the catalog grammar cannot hold a time window, a count across visits or the absence of a fact: the repeat on a different day, the look-back for an unfollowed result, "never tested", the recall date, the grade of a negative. They are specified in the manifest with their parameters, which are all reference entries.

| Invariant | How the pack keeps it |
|---|---|
| I1 Missing is never normal | Four-state evaluation; the empty record fires nothing and stages nothing (DMV-33); "never done" is an answer, not an inference |
| I2 A status falls only on evidence | The rule-out grade (D-DM-06); a blocking caveat makes a normal result insufficient (DMV-21, DMV-55) |
| I3 The engine proposes | Every output is a proposal; type, remission and target are clinician-owned; nothing writes a diagnosis |
| I4 One owner per danger | 19 routing rules, each ending in a signal to triage or a bedside test, none with treatment text |
| I5 No dose, no titration | Build check over every string; D-DM-31 settles the words "stop" and "hold" |
| I6 Every output names its rule | Each rule carries its id, family, criteria set, reference entries and claim |
| I7 Engines exchange facts | Rules read features and clinician-confirmed states only |
| I8 Restricted facts stay restricted | Restricted classes ride with every item that reads one; neutral displays are mandatory |
| I10 Unsigned packs never run | Everything is `draft`; `csoSigned` is false throughout and the build fails if it is ever true |
| I11 No emergency red on NCD surfaces | Acute rules emit a signal to triage; the NCD surface shows where it went |
| I9, I12 | Not touched by content; for the engine build |

## 8. Schema and engine changes proposed

**NCD catalog schema**

| Id | Change | Why |
|---|---|---|
| S-DM-01 | Widen `StandardBody` (Uganda MoH, ICO, ISPAD, JBDS, NICE and others) | Today every such source is filed as "local" |
| S-DM-02 | `CriteriaSet.verdict` and `appliesTo` | Intermediate hyperglycaemia, gestational diabetes, diabetes in pregnancy and remission are not "diabetes: yes or no" |
| S-DM-03 | The WHO cardiovascular risk as a chart lookup | Import WHO's chart values; never type them |
| S-DM-04 | A screening interval keyed by two stage codes | KDIGO's monitoring grid |
| S-DM-05 | Computed formulas `months_since` and "none on record" | Due and never-done rules |
| S-DM-06 | A target-rule construct | Individual targets |
| S-DM-07 | Nested predicate groups | Today written as `any` plus `atLeast` with n = 1 |
| S-DM-08 | `notWhen`, `cautions` and `needsBeforeActing` on a rule or step | A rule's stop condition; a caution shown beside a proposal; "kidney function not known" |
| S-DM-09 | `ages` on targets, bands, risk models and flags | The under-16 rule reached only rules and steps |
| S-DM-10 | A blocking caveat acts by its direction, and reaches bands, targets and treatment-review steps | An invalid examination must not be stored as normal; an invalid HbA1c must not read "at target" |
| S-DM-11 | An inclusive upper edge on a band | Needed if you choose "at or below 7.0" in D-DM-13 |
| S-DM-12 | `neutralDisplay`, `neutralAction` and `neutralAlternative` on any item that reads a restricted fact | A tag cannot redact a string |
| S-DM-13 | A predicate op `recorded` (true when a value exists, never false), for `notWhen` only | A test prompt must clear when its result is on record |
| S-DM-14 | `enabled` with `enabledBy`, and `requiresCapability`, on a rule or step | "Off by default" must be a field the evaluator honours, not a sentence in a note |
| S-DM-15 | `notMetRequires` on a complication; `neverNotMet` on a classification | "No retinopathy" needs an examination able to show it; a negative antibody never refutes type 1 |
| S-DM-16 | Pregnancy "unknown" as a state that withholds, and names, what waits on it | An empty box is not "not pregnant" |

Until each is accepted, the content lives under the key `x`, outside the schema, and changes nothing.

**Clerking desk**

| Id | Change |
|---|---|
| EC-1 | A result atom in the shared evaluator |
| EC-2 | Per-condition detail in Past history |
| EC-3 | A context qualifier on the glucose vital atom |
| EC-4 | A signed suggested-care list for the Plan |
| EC-5 | A pregnancy atom |
| EC-6 | Glucose entry: units, and readings that are not numbers |
| EC-7 | Smaller evaluator and catalogue additions this pack uses |
| EC-8 | What 'amend' means in a catalogue amendment |

## 9. How this was checked, and what is still open

**The re-read.** Eight readers, each given a slice of the reference catalogue and told to refute it against the source.

| Verdict | Entries |
|---|---|
| Confirmed as written | 225 |
| Confirmed, with a qualifier or attribution now corrected | 95 |
| Wrong value | 0 |
| Wrong attribution (corrected) | 1 |
| Not found in the pages that could be read | 8 |
| Source would not open | 2 |
| Added after the re-read | 4 |

Limits of that check: sources were read through a text tool, several through mirrors, and long PDFs only to about page 50. A quote in this pack is evidence that a reader saw those words; it is not a substitute for your own spot-check before you sign.

**The reviews.** Three reviews by readers who had not seen the pack being built.

| Review | Read | Findings | Critical | Fixed | Fixed in part | Your decision | Phase 0 |
|---|---|---|---|---|---|---|---|
| Clinical, first | 0.2.0 | 41 | 11 | 33 | 6 | 2 | 0 |
| Clerking wiring | 0.2.0 | 37 | 3 | 17 | 19 | 0 | 1 |
| Clinical, second | the fixes to 0.2.0 | 44 | 7 | 32 | 2 | 1 | 9 |

The second clinical reviewer ran about 230 patients through the reference evaluator and judged that only 2 of the first round's 11 clinical criticals were cleanly fixed; the rest were fixed too narrowly or had created a new problem. Every one of that reviewer's 44 findings is answered in `review/REVIEW-LOG.json`. Read that as the measure of how much a single pass of fixes can be trusted, including the last one.

**The clerking wiring is in a weaker state than the rule catalog.** It was written from the briefing's samples without sight of the live catalogues, most of its findings are "fixed in part", it was not re-read in the second round, and it should be treated as a specification to reconcile, not as data to load.

**Still open**

- **F09** (critical): DM-CON-PREG-03 and -04 give the meter-only antenatal site a referral rule. Unknown pregnancy in a woman who could be pregnant now makes the non-pregnant criteria set 'insufficient'. DMV-44 to DMV-46. Whether a meter may be used for gestational criteria is D-DM-28.
- **F25** (major): ROUTE-01 is same-day; the interrupt is rule 11. HI and LO are recordable and satisfy the rules. Unit entry (mmol/L or mg/dL) and a plausibility range are platform work: engine change EC-6.
- **F31** (major): The prompt clears once the person is on an antiplatelet and is contraindicated after a bleeding or untyped stroke. The exclusion has no quoted source: for CSO signature.
- **F36** (minor): RX-01 now uses 'above 7.0' for fasting glucose. The bands keep 'below' and say so: WHO disagrees with itself at exactly 7.0 and 9.0 (D-DM-13).
- **F37** (minor): Three flag actions reworded to 'review with the prescriber'. The reference text for metformin below 45 still paraphrases ADA: D-DM-31.
- **F38** (minor): Stop conditions added to PREG-01, PREG-02, RISK-01, TB-01; PAED-01 split by urgency. RISK-02 relies on the engine showing it once per episode.
- **F39** (minor): The dolutegravir-metformin text now quotes UCG 2023, read verbatim at verification. The Kampala signal and the eGFR-in-pregnancy caveat are marked needsCsoInput; the pregnancy caveat no longer blocks.
- **F40** (minor): RX-02 and the glibenclamide flag point to the level of care. Which sulfonylurea at which level is D-DM-22; whether pregnancy features are a restricted class is D-DM-30.
- **G09** (major): EC-1 now specifies the HbA1c validity behaviour and the restricted-reason display. Certification of the method is a qualifier Phase 0 must map.
- **G10** (major): Engine change EC-5 (pregnancy atom) is specified. Both pregnancy profiles and a new differential rule are gated on it and withheld until it exists; the statin, ACE inhibitor and ladder items exclude pregnancy.
- **G11** (major): EC-8 defines amend as merge-only. The per-profile diff against the live catalogue is Phase 0 work; the change to must-not-miss on type 1 is D-DM-35.
- **G16** (major): Rules added: class tags first, route for steroids. The unused also-ask is removed. The SGLT2 flag reads breathing pattern. Signed brand stems are Phase 0.
- **G17** (major): Specified as engine change EC-6; the catalog side (HI and LO as recordable values) is done.
- **G19** (major): Result atoms carry 'qualifiers' named after the fact model; the capillary 2-hour threshold has its own reference and atom. Exact values are mapped in Phase 0.
- **G20** (major): Clerking references are generated from the dossier at build time, never typed. Six unused entries removed; the build now fails on an unused or undefined one. The glucose result age has no value on purpose (D-DM-08). Plan labels still carry numbers as text.
- **G21** (major): Labels added for the eight new diagnoses. A generated file, wiring/reconcile-ids.json, lists every catalogue id the pack uses for Phase 0 to resolve.
- **G22** (major): Five concepts marked 'verify: probably exists'; one option-id set; the EC-2 contradiction stated. The diff against the generated catalogue is Phase 0.
- **G23** (major): Components listed (bicarbonate on the gas, three samples on the OGTT, three results on the retinal examination); two unused tests held. The live shape is Phase 0.
- **G24** (major): The entries name drug and class only. The file now says what does not work until Phase 0 completes them.
- **G27** (major): Label and rule changed (senior review; admit or refer; never overwrite). Capability-aware disposition is an engine item.
- **G28** (major): A 'due' field separates later-day tasks from today's basket. The steroid item uses a post-meal test. The early creatinine repeat exists but is 'needs-cso': its interval has no source in this pack.
- **G29** (major): Teaching items read the Plan basket (declared in EC-7) and show unconditionally on type 1. An SGLT2 item is added. The after-a-low item is 'needs-cso' until UCG 2023 section 1.1.6 is read.
- **G30** (major): Compound items split; labels match predicates; the foot interval follows the risk category; type 1 has its own eye item. 'Due' awareness (last date, recorded-within) is not built: the NCD engine owns it.
- **G31** (major): where_unavailable is structured by capability. The kidney fallback says a negative strip excludes nothing. Strip and capillary evidence atoms on the kidney and intermediate profiles are Phase 0.
- **G32** (major): 'Only in pregnancy' removed from the type list; a separate past-history question is proposed. Its restricted class is D-DM-30.
- **G35** (minor): Acute kidney injury is no longer put first on a result up to a year old. The other chip-noise items are Phase 0.
- **G36** (minor): Options in the third person, 'not sure' added, only 'none' exclusive, composer rule stated, acuity ids without '/', finding wording on injection sites. A 4+ ketone option waits on the live strip list.
- **G37** (minor): HbA1c removed from the steroid profile's deciding tests. Source keys for the local epidemiology sentences in profile notes are Phase 0.
- **H13** (major): DM-ACT-RX-11B for the frail or cognitively impaired person of 75 or over on insulin, and a referral for anyone on insulin above 7.5% (WHO's insulin annex). Bands with no lower edge now read 'not above the upper limit'. A lower safety limit for HbA1c in older adults has no number in this pack: the CSO supplies it from ADA's older-adults section.
- **H23** (minor): PREG-02 still has no upper bound; it clears on 'tested since the birth'. An upper bound needs a source.
- **H24** (minor): Harmless: the 'never tested' arm of two re-test rules cannot be true. Left for tidying.
- **H30** (minor): RX-10 and SCREEN-PREG-01 have no stop condition: the engine's 'done at this episode' state owns it.
- **H31** (minor): The baseline risk band still shows when the higher bands are unanswered. Display wording for the engine.
- **H33** (minor): ATYP-01 cannot fire at the diagnosis visit (it needs age at diagnosis); T1-04 covers that visit.
- **H37** (minor): The ketone table's alert wording is the same for a child. Children are routed by rules, not by this table; reword when the paediatric pack is written.
- **H38** (minor): The symptomatic blood-pressure rule stands down when the higher one fires. Holding routine items beside a same-day one is the engine's presentation rule.
- **H39** (minor): Education steps and targets still show beside an interrupt: a presentation rule for the engine (interrupts first, routine items collapsed).
- **H40** (minor): The dolutegravir flag quotes UCG 2023. Whether the national HIV guideline limits the metformin amount could not be read; D-DM-33.
- **H41** (minor): mental_status has no 'confused' option. Phase 0 adds it or maps the clerking desk's confusion finding; the acute rules then read it.
- **H42** (minor): Three earlier fixes work only on an explicit answer, by design: 'not asked' is never 'never'. Design B's whole-record rules cover the absent case.

**Not yet reviewed by anyone but me:** the answers to the second clinical review. Since version 0.2.0 the pack has gained 28 rules, 10 steps, 5 flags and 49 test patients; the last third of that has had no independent read. Phase 1 of the build prompt asks for one before you sign.

## 10. What I need from you

1. **UCG 2023** sections 1.1.6 (hypoglycaemia), 4.1.6 (hypertension), 8.1.3 and 8.1.4 (diabetes, ketoacidosis and the hyperosmolar state), 16.2.5 (diabetes in pregnancy) and 20.2.3 (diabetic retinopathy). Photographs of the pages are enough. Please name the printing: page numbers differ between copies (8.1.3 is page 469 in one and 471 in another).
2. **Integrated Diabetes Management Guidelines for Uganda (2026)**, if you have the file, and whether it is in force.
3. **EMHSLU 2023**, the endocrine and laboratory sections (levels of care for each medicine and test).
4. **Uganda HIV Guidelines 2022**, the dolutegravir and glucose algorithm (about pages 186 to 189) and the NCD section (about pages 237 to 251).
5. A look, by you or a colleague, at four figures: the C-peptide flowchart (Holt 2021 Fig. 1, reprinted as ADA 2026 Fig. 2.1), HEARTS-D Fig. 1 on page 16, KDIGO 2024 Fig. 13, and KDIGO 2012 Table 7.
6. Your answers in `decisions/d-dm.v1.json`.
