# GATE A: diabetes pack 0.3.7-draft (STOP 1)

For the Clinical Safety Officer. Nothing below is live; everything runs in shadow until signed (I10). Built on `phase-0-report.md` (pack against the repo) and `ucg/ucg-vs-pack.md` (Uganda's own text, supplied 2026-10-05).

## 1. Independent clinical review (Phase 1, before anything else)

The prompt requires a fresh independent read of the pack, fixed and re-read until a round finds no critical problem. Each round was a new reviewer who had not seen the pack being built, given the catalog, the vignettes, the previous brief and the reference evaluator, and told to assume the last round's fixes introduced errors. Every finding, the patient that showed it and what was done are in `pack-0.3.0-draft/review/REVIEW-LOG.json`; the fixes are in `tools/build/k_r4.py`, `k_r5.py` (and later rounds), each tagged with its finding id and proved by a test patient.

| Round | Read | Findings | Critical | Major | Of the criticals, caused by the previous round's fixes | Pack after fixes | Test patients |
|---|---|---|---|---|---|---|---|
| R4 | 0.3.0-draft (the hand-over) | 31 | 4 | 16 | 3 | 0.3.1-draft | 100 |
| R5 | 0.3.1-draft | 25 | 5 | 12 | 3 | 0.3.2-draft | 113 |
| R6 | 0.3.2-draft (with a 4,608-patient interrupt grid) | 29 | 5 | 12 | 2 (3 had always been there) | 0.3.3-draft | 121 |
| R7 | 0.3.3-draft (82,160-man and 12,000-woman extended grids) | 27 | 6 | 11 | 0 for men (no man below a sensible floor); the criticals were women's pregnancy/postpartum handling, ordering and the manifest | 0.3.4-draft | 129 |
| R8 | 0.3.4-draft, plus the first deep read of the suspect, confirm, classify, stratify and act lanes | 35 | 6 | 14 | 1 (Q13); the rest were missing-data gaps in pregnancy/postpartum, acetone in non-insulin diabetes, children below 11 mmol/L, and control bands | 0.3.5-draft | 135 |
| R9 | 0.3.5-draft | 26 | 7 | 11 | 3 (U02, U03, U05); 2 were fixes that missed their own patients; 1 (U07) a letter-of-the-rule breach rated low-harm by the reviewer | 0.3.6-draft | 141 |
| R10 (last, by your choice) | 0.3.6-draft, with its own 76,800-man and 36,288-woman sweep | 18 | 2 | 7 | 0; its sweep found no pattern below its floor, no urgency falling as the picture worsened, and no noise | 0.3.7-draft | 144 |

**The loop converged.** Criticals per round: 4, 5, 5, 6, 6, 7, 2, and R10's independent sweep of 113,088 synthetic patients found no gap in the acute floor. The build check now runs 25,088 men (both sites, four age bands, eight diabetes profiles, seven states including acute illness, seven glucose and eight ketone values) and 480 women (pregnancy and postpartum states, four pressures, symptoms, protein, glucose): 0 below the floor, 0 noisy, 0 ordering errors.

**Go-live items (not independently re-read).** R10's answers (V01–V16, `tools/build/k_r10.py`) were fixed, proved by a test patient each (DMV-142 to DMV-144) and pass every build check, but no reviewer has read them. Before anything leaves shadow, one more independent read must cover at least: V01 ('acutely unwell' now starts the sick-day pathway in ROUTE-13, 23, 23D, 32, 32B), V02 (fasting and post-meal targets and bands under a relaxed or 'avoid symptoms' plan), V04 (ROUTE-23R, the adult sick-day review), V05 (the sick-day flags now read 'creatinine not in steady state'), V13/V14 (tier logic for the tight, general and CKD HbA1c targets), and the rule that a low glucose band always shows.

**Why the fixes kept breaking things, and what changed.** In R4, R5 and R6 about a third of the criticals came from the previous round's patches: each fix changed one rule, and the rules disagreed on who 'has diabetes', on whether a meter HI counts as a glucose, and on which rule interrupts. After R6 the structure changed instead: one shared definition of diabetes for every acute rule; one interrupt per event, chosen by a declared order with the rest folded inside it; and the reviewer's 4,608-patient grid with a minimum-urgency table (D-DM-41) made a **failing build check**. At 0.3.3-draft the grid showed 0 patients below the floor, 0 double interrupts and 0 noisy ordinary visits, and a regression now fails the build instead of waiting for a reviewer. R7's much larger grid then found no man below a sensible floor; after its fixes the build grid covers 21,504 men (both sites, four bands, six states including acetone and dehydration, meter LO) and 180 women across pregnancy, postpartum, blood pressure, symptoms and protein, with ordering invariants: 0 silent, 0 noisy, 0 ordering errors at 0.3.4-draft.

**What the rounds changed, in clinical terms**
- Ketones: every band now has an owner. Normal blood ketones (below 0.6) or a negative strip clear a prompt; trace/1+ or 0.6–1.5 when unwell asks for a recheck and the diabetes team today; 1.6–2.9 is same day, and an interrupt with vomiting; 2+ or 3.0 and above interrupts in anyone with diabetes, whatever box was ticked (insulin, a sulfonylurea, an SGLT2 inhibitor or type 1 count as diabetes). On an SGLT2 inhibitor a urine strip never stands the ketoacidosis interrupt down.
- Hypoglycaemia: one interrupt per event; a blank medicine list is not "not on insulin"; any glucose below 3.9 with drowsiness interrupts whatever the medicines.
- Children: a sick child with diabetes and no glucose is asked for glucose and ketones now; known diabetes alone no longer reads as "suspected diabetes"; the vomiting child's interrupt needs a sign or a high glucose.
- Pregnancy and postpartum blood pressure (new, from UCG 2023 16.3.7): 140/90 asks for urine protein the same day, 160/110 interrupts, up to 6 weeks after birth.
- Hypertensive emergency (new, from UCG 2023 4.1.6.1): above 180/110 with drowsiness, organ-damage signs, chest pain or stroke signs interrupts.
- Noise: intermediate ketones in a well clinic patient, and routine gestational-diabetes visits, no longer raise same-day items.
- Three new decisions for you: D-DM-38 (glucose 18 or more without ketoacidosis: WHO PEN or HEARTS-D), D-DM-39 (blood pressure above 180/110 without organ damage: UCG admits), D-DM-40 (lower limits for older or high-risk people).


## 2. Decisions

Each shows the pack's recommendation; where Phase 0 or UCG 2023 changes the picture, an **updated recommendation** is given and is what a blanket signature would sign. ★ = gates clinical use.

### D-DM-01 ★ Default criteria set for Uganda

Which diagnostic criteria set does MedSync apply by default?

- **Recommended (pack):** WHO HEARTS-D 2020 now; replace it with Uganda's own set as soon as the text is supplied (UCG 2023 section 8.1.3, or the 2026 Integrated Diabetes Management Guidelines if they are in force).
- **Updated recommendation:** UCG 2023 as the default set (`ug_ucg_2023`, filled from UCG-DM-01..03), with WHO HEARTS-D 2020 shown alongside and every difference listed; operators as P0-25.
- Or: Enable no diagnostic rule until the Uganda text has been read.
- Why open: D-NCD-11 names UCG 2023, but no copy of its diabetes section could be read: every copy is one large PDF and the reading tool stops in the front matter. WHO HEARTS-D is the document UCG is built on and was read in full.
- Phase 0 / UCG: UCG 2023 8.1.3 is now read (U1, U4, U5). D-NCD-11 already names UCG 2023 as Uganda's default. Live `who_2019` would be replaced by the pack's WHO set (P0-13).
- Needs from you: UCG 2023 sections 1.1.6, 4.1.6, 8.1.3, 8.1.4, 16.2.5, 20.2.3 (name the printing); the 2026 guideline PDF

### D-DM-02 Which symptoms let one glucose value diagnose

With symptoms, one diabetes-range value is diagnostic. Which symptoms count?

- **Recommended (pack):** Thirst, passing a lot of urine, unexplained weight loss: the three WHO and ADA both name.
- **Updated recommendation:** Uganda set: UCG's four classical symptoms. WHO set: WHO/ADA's three. Each set states its own.
- Or: Add blurred vision and fatigue, which HEARTS-D also lists.
- Why open: Fatigue and blurred vision are common and non-specific; counting them would diagnose on a single value far more often.
- Phase 0 / UCG: UCG's classical symptoms are polyuria, polydipsia, polyphagia and polyneuropathy; weight loss is an 'other symptom' (U5).

### D-DM-03 Random glucose of 11 or 11.1 in HIV care

Uganda's 2022 HIV guideline prints 'RBG ≥ 11mmol'. Which number does the engine use?

- **Recommended (pack):** 11.1 mmol/L everywhere (WHO and ADA).
- Or: 11 in HIV clinics, to match the guideline's wording.
- Why open: The guideline's line defines a client category in a summary table; it is not written as a diagnostic criterion, and its algorithm pages could not be read.
- Phase 0 / UCG: Uganda HIV Guidelines 2022 not supplied; unchanged.
- Needs from you: Uganda HIV Guidelines 2022, about pp. 186 to 189 and 237 to 251

### D-DM-04 ★ A glucose meter for diagnosis and for control

May a site with no laboratory diagnose, and judge control, on a meter?

- **Recommended (pack):** Yes, as WHO allows: diagnose on a meter with symptoms or with a repeat on another day; never rule out on a meter value near a threshold; read a fasting or post-meal meter value against WHO's surrogates for control.
- Or: Meter for suspicion only (the laboratory-medicine position ADA follows): district sites then cannot confirm and must refer every case.
- Why open: Most Ugandan primary care has a meter and no laboratory glucose. Two steps here are this pack's own and need your signature: any meter reading of 12.2 or more with symptoms counts whatever its timing, and WHO's plasma surrogates are read from a meter.
- Phase 0 / UCG: UCG says 'blood sugar' without specimen (U3): silent.

### D-DM-05 Who is offered a test without symptoms

Which eligibility rules run?

- **Recommended (pack):** WHO's rule everywhere (40 or over and overweight). ADA's 'overweight with another risk factor' at sites with a laboratory. ADA's 'everyone from 35' off.
- Or: WHO's rule only.
- Or: All three.
- Why open: No diabetes risk score has been validated in Uganda, so the pack uses published eligibility rules and no points score. Universal testing from 35 would load laboratories with low-yield tests.
- Phase 0 / UCG: UCG lists type 2 risk factors (age >40, first-degree family history, GDM, baby >4 kg) but no screening rule (U6).

### D-DM-06 What counts as 'tested and negative'

When may the engine record that diabetes has been excluded?

- **Recommended (pack):** 'Full' only with a normal 2-hour OGTT. A normal fasting glucose or HbA1c alone is 'limited', with a re-test date.
- Or: Accept a normal fasting glucose as full exclusion.
- Why open: In African cohorts a single fasting glucose or HbA1c missed roughly a third to a half of OGTT-defined diabetes. No guideline states what excludes diabetes in a high-risk African adult: this grade is a MedSync rule.
- Phase 0 / UCG: UCG silent.

### D-DM-07 How near is 'near the threshold'

ADA says to repeat a result 'close to' the threshold in 3 to 6 months. How close?

- **Recommended (pack):** Within the fasting glucose's own within-person variation (REF-DM-VAL-FPG-CV) below the threshold.
- Or: A fixed band you choose.
- Why open: ADA gives no number. The variation figure is the only sourced quantity that bears on it.
- Phase 0 / UCG: UCG silent.

### D-DM-08 Time windows that are product settings

How far back does the engine look for an unfollowed raised glucose, and how old may a glucose result be and still count as evidence at this visit?

- **Recommended (pack):** You set both. Until you do, the rules that depend on them stay dark (REF-DX-RESULT-AGE-GLUCOSE has no value on purpose).
- Or: Reuse the 3-month control window (REF-DM-CTRL-WINDOW-ABOVE) for the age of a glucose result.
- Why open: No guideline gives these numbers. The pack will not invent them.
- Phase 0 / UCG: UCG silent.

### D-DM-09 Order of the next-best test

In what order does the engine propose tests?

- **Recommended (pack):** As written in DM-ACT-TEST-01: symptomatic, a random glucose now; no symptoms with a laboratory, fasting plasma glucose, then an OGTT if it is 6.1 to 6.9; HbA1c only where no caveat holds; no laboratory, a fasting meter reading repeated on another day; pregnant, a 75 g OGTT; on steroids, after a meal.
- Or: A different order you specify.
- Why open: Each step follows a source; the ORDER between them is a judgement.
- Phase 0 / UCG: UCG lists fasting, random, 2-h OGTT and HbA1c without an order.

### D-DM-10 ★ Suspecting type 1

How many features raise the flag, and how urgently?

- **Recommended (pack):** Two of: under 35, BMI below 25, unexplained weight loss (and, in established diabetes, glucose above 20 at presentation). Same day when the diagnosis is new or the type is unclassified and the person is not on insulin; routine once a clinician has recorded the type.
- Or: One feature.
- Or: Three features.
- Why open: WHO refers 'clinical suspicion of type 1 in a newly diagnosed patient' the same day but does not define suspicion. ADA/EASD says no single feature confirms it; its figures are from White European data. The count is this pack's.
- Phase 0 / UCG: UCG: type 1 'usually starts at a young age'; no count.

### D-DM-11 C-peptide thresholds

May the engine use C-peptide to support or refute type 1?

- **Recommended (pack):** Not yet. Keep both criteria held out until a person has read the source figure (Holt 2021 Fig. 1; ADA 2026 Fig. 2.1), then restore them with the timing conditions.
- Or: Restore now on the legend text alone.
- Why open: The meaning of the 200 and 600 pmol/L thresholds sits inside a flowchart image that could not be read. Used wrongly, a high value invites stopping insulin in early type 1.
- Phase 0 / UCG: Unchanged (figures not read).
- Needs from you: The two figures, read by a person

### D-DM-12 Testing in pregnancy

Does the engine prompt for a 75 g OGTT in pregnancy?

- **Recommended (pack):** Yes, at 24 weeks or more, at sites that can run one (FIGO). Elsewhere it stays off and the meter referral rules apply.
- **Updated recommendation:** Screen on UCG's risk factors at every site; a universal 24–28-week OGTT only at sites that choose it.
- Or: Off everywhere: WHO makes no universal recommendation.
- Why open: WHO's 2013 criteria say how to diagnose, not whom to test. UCG 2023 section 16.2.5 was not read.
- Phase 0 / UCG: UCG 16.2.5 screens on risk factors: BMI >35, age >40, previous GDM, family history, previous unexplained third-trimester death or baby >4 kg, polyhydramnios, glycosuria, large for dates (U21).
- Needs from you: UCG 2023 section 16.2.5

### D-DM-13 Exactly at the target

Is an HbA1c of exactly 7.0%, a fasting glucose of exactly 7.0 or a post-meal glucose of exactly 9.0 at target?

- **Recommended (pack):** Follow WHO's clinical wording: fasting 7.0 and post-meal 9.0 are AT target ('at or below'); HbA1c 7.0% is not ('below 7.0%', as WHO's indicator and ADA print). This needs an inclusive upper edge on two bands.
- **Updated recommendation:** Uganda targets from UCG: fasting below 7.0, postprandial below 10.0, HbA1c below 7.0% (7.5% for the elderly, age from REF-DM-CTRL-OLDER-AGE until UCG's 'elderly' is defined). No inclusive edge is then needed.
- Or: 'Below' for all three, as the bands are built today.
- Why open: WHO's text says 'at or below' for the two glucose surrogates and its own indicator table says 'below'; for HbA1c the text has no operator. The treatment step already uses 'above 7.0' for fasting glucose.
- Phase 0 / UCG: UCG: fasting <7, postprandial <10, HbA1c <7% (7.5% for the elderly): 'below' for all three, and 10 (not WHO's 9.0) after meals (U8).

### D-DM-14 ★ Eyes: how often, and who is referred

Which recall interval and which referral rule?

- **Recommended (pack):** No retinopathy: every 2 years (WHO). Mild or moderate: 12 and 6 months unless control is confirmed at target. Refer by grade (ICO): urgent for severe, proliferative or centre-involving disease; routine for moderate. Grade by ICDR ('more than 20' haemorrhages).
- Or: Uganda's Eye Care Guidelines 2016: refer everyone with diabetes to a retina clinic.
- Or: Yearly for everyone (ADA).
- Why open: Uganda had 51 ophthalmologists in 2023 and 95% of stakeholders reported no community screening, so 'refer all' may not be deliverable; but it is the national document. UCG 2023 section 20.2.3 was not read.
- Phase 0 / UCG: UCG 20.2.3 gives no interval and no grading (U22): unchanged.
- Needs from you: UCG 2023 section 20.2.3

### D-DM-15 Lipid testing at district sites

Does the yearly lipid prompt run where there is no lipid profile?

- **Recommended (pack):** Off where the site has no lipid profile; on where it has. The statin prompt in type 2 diabetes at 40 or over does not depend on it.
- **Updated recommendation:** A lipid profile at diagnosis where the site can run one (UCG); the yearly prompt off where it cannot.
- Or: On everywhere, as a referral prompt.
- Why open: WHO HEARTS-D sets no lipid interval and gives the statin without one. ADA's yearly profile is expert opinion (grade E).
- Phase 0 / UCG: UCG lists a lipid profile among baseline tests (U7).

### D-DM-16 'Kidney failure' as a hypoglycaemia risk

ADA lists 'kidney failure' as a major risk factor. What eGFR does the engine read that as?

- **Recommended (pack):** Below 30 for 'high'; below 60 for 'raised'.
- Or: Below 15 for 'high'.
- Why open: ADA gives no number for 'kidney failure'. Insulin and sulfonylurea clearance falls well before dialysis.
- Phase 0 / UCG: UCG silent.

### D-DM-17 An ACR of exactly 30 mg/mmol

Moderately or severely increased?

- **Recommended (pack):** Severely increased (30 or more), as KDIGO's own figures and ADA have it.
- Or: Moderately increased (KDIGO 2024 Table 3: A3 is 'above 30').
- Why open: KDIGO 2024 disagrees with itself at this value. The safer reading is the higher category.
- Phase 0 / UCG: UCG silent.

### D-DM-18 Loss of protective sensation

One abnormal test, or two?

- **Recommended (pack):** One (IWGDF): monofilament or vibration; light touch where neither tool exists.
- Or: Monofilament plus one other (ADA).
- Why open: IWGDF's rule needs one tool and is the more sensitive. The foot domain already follows IWGDF.
- Phase 0 / UCG: Phase 0: live LOPS reads monofilament only (P0-12).

### D-DM-19 eGFR below 30

How urgent is the referral?

- **Recommended (pack):** Same day from primary care (WHO HEARTS-D).
- Or: Urgent, not same day, where a physician is on site.
- Why open: WHO lists it with anuria under same-day referral. KDIGO names it as a reason for kidney care and gives no time.
- Phase 0 / UCG: UCG silent.

### D-DM-20 ★ Treatment suggestions in version 1

Do the class-level treatment review steps (DM-ACT-RX-01 to -12) show in version 1?

- **Recommended (pack):** Tests, screening, referral, education, targets and safety flags: on. Treatment review steps: on as review prompts with no dose, once you have read them against UCG 2023 section 8.1.3; dark until then.
- **Updated recommendation:** Treatment-review steps on as review prompts with no dose, following UCG's ladder (lifestyle, metformin, glimepiride, basal insulin).
- Or: Dark until version 1.1, as MS-NCD-ENG-001 reserves.
- Or: On now, on WHO's ladder.
- Why open: You asked for the system to suggest management. Without these steps it can say what is due and what is unsafe, but not what the next treatment step is. Uganda's own ladder has not been read, and WHO's own documents disagree on when metformin starts (D-DM-34).
- Phase 0 / UCG: UCG's ladder is now read: lifestyle for 3 months if sugars are not very high, then metformin, then glimepiride (second line), then basal insulin (U12–U14).
- Needs from you: UCG 2023 section 8.1.3

### D-DM-21 SGLT2 inhibitors and GLP-1 agonists for heart and kidney protection

Does the engine propose them?

- **Recommended (pack):** At referral sites only, as 'refer for consideration'. Off at district sites.
- Or: Off everywhere until supply improves.
- Or: On everywhere.
- Why open: ADA and KDIGO recommend them whatever the HbA1c. EMHSLU 2023 lists dapagliflozin at tertiary level, and a 2025 analysis found no public-sector availability.
- Phase 0 / UCG: UCG silent on SGLT2 inhibitors and GLP-1 agonists.

### D-DM-22 ★ Glibenclamide, and which sulfonylurea at which level

How does the engine treat glibenclamide?

- **Recommended (pack):** Recognise it (patients still take it), flag it at 60 or over, with reduced kidney function and where lows are a concern, and never propose it. Name the sulfonylurea per level of care only after the EMHSLU 2023 endocrine pages are read.
- **Updated recommendation:** Recognise glibenclamide and flag it in the pack's three situations; never propose it; name glimepiride (UCG) as the sulfonylurea when a step names one.
- Or: Propose glimepiride at primary care now, on the secondary source.
- Why open: EMHSLU 2023 deleted glibenclamide; UCG 2023 reportedly still names it. The levels of care were read in a journal article, not in the list.
- Phase 0 / UCG: UCG 8.1.3 names only glimepiride as second line; glibenclamide appears in UCG only as a rifampicin interaction (U13). This corrects the handback.
- Needs from you: EMHSLU 2023 endocrine and laboratory sections

### D-DM-23 Blood pressure threshold in diabetes

At what pressure does the engine prompt a treatment review?

- **Recommended (pack):** 130/80 on two occasions (WHO HEARTS-D).
- **Updated recommendation:** Below 130/80 (UCG 4.1.6, matching HEARTS-D); the 120/80 in 8.1.3 recorded as a conflict.
- Or: 140/90 (WHO's hypertension guideline treats everyone at this level and makes 130 to 139 in diabetes a conditional recommendation).
- Why open: UCG 2023 section 4.1.6 was not read; the hypertension pack will own this in the end.
- Phase 0 / UCG: UCG contradicts itself: 8.1.3 says target 120/80; 4.1.6 says below 130/80 for high CVD risk, diabetes included (U9).
- Needs from you: UCG 2023 section 4.1.6

### D-DM-24 A glucose of exactly 3.9 or 3.0

Is 3.9 hypoglycaemia? Is 3.0 level 2?

- **Recommended (pack):** ADA's levels, as the live catalog uses: below 3.9 is level 1, below 3.0 is level 2.
- Or: WHO's wording: 'at or below 3.9'.
- Why open: The sources differ only at the exact value. UCG 2023 section 1.1.6 was not read.
- Phase 0 / UCG: UCG: 'symptoms generally occur' below 3.0 mmol/L; no levels (U18). Phase 0: live raises red below 3.9 in anyone (P0-07).
- Needs from you: UCG 2023 section 1.1.6

### D-DM-25 'Above 7.8' in hospital

The source says above 7.8; the vital-sign atom has only 'at or above'.

- **Recommended (pack):** Add gt_ref to the vital atom.
- Or: Accept 'at or above' (the difference is a reading of exactly 7.8).
- Why open: A one-line engine change; keeps the rule faithful to the source.
- Phase 0 / UCG: —

### D-DM-26 Insulin storage advice

The East Africa Diabetes Study Group advises against clay pots on hygiene grounds; a field study (recalled, not re-read) found they keep insulin cooler.

- **Recommended (pack):** Carry only the advice nobody contests (refrigerate unopened insulin, never freeze it, keep a vial in use out of the sun) and say nothing about clay pots until you have read both sources.
- Or: Carry the regional group's advice in full, including 'no clay pots'.
- Why open: Many patients have no refrigerator, so this advice matters; it should not rest on a contested claim either way.
- Phase 0 / UCG: —

### D-DM-27 Vaccines

Does the engine prompt for vaccines in adults with diabetes?

- **Recommended (pack):** No. Uganda's routine schedule has none for this group, and ADA's table is the US schedule.
- Or: Yes, as advice where available.
- Why open: A prompt nobody can act on is noise.
- Phase 0 / UCG: —

### D-DM-28 ★ A meter reading in pregnancy

What may the engine do with a meter value in a pregnant woman?

- **Recommended (pack):** Refer on it: any reading of 11.1 or more, or a fasting reading of 7.0 or more, today; a fasting reading of 5.1 to 6.9, for a laboratory glucose. Diagnose gestational diabetes on plasma glucose only.
- **Updated recommendation:** Show both: UCG 2023 as the national set, WHO 2013 alongside; refer on a meter as the pack recommends; P0-26 chooses the default.
- Or: Also diagnose on a plasma-calibrated meter where no laboratory exists.
- Why open: Most antenatal care is at health centre III with a meter. WHO's criteria are for plasma; FIGO 2015 discusses meters and was not read for this point.
- Phase 0 / UCG: UCG's GDM criteria are fasting >5.6 or 2-h >7.8 mmol/L (U20), against WHO 2013's 5.1 / 10.0 / 8.5.

### D-DM-29 A raised glucose during acute illness or at TB diagnosis

Warn, or hold the diagnosis?

- **Recommended (pack):** Warn beside the value and let the criteria run; the clinician decides. Re-test after recovery (TB: after the first month).
- Or: Hold the diagnosis as 'pending re-test after recovery' unless ketones are raised or symptoms came before the illness.
- Why open: WHO: hyperglycaemia under acute stress 'should not in itself be regarded as diagnostic'. But holding a diagnosis delays treatment in a person who does have diabetes.
- Phase 0 / UCG: UCG: no oral agents in acute illness; insulin first (U16).

### D-DM-30 Which pregnancy facts are a restricted class

Are pregnancy, previous gestational diabetes and 'could become pregnant' restricted as sexual and reproductive health?

- **Recommended (pack):** 'Could become pregnant' and previous gestational diabetes: restricted. Current pregnancy: not restricted, because medicine safety checks must read it everywhere.
- Or: All three restricted.
- Or: None restricted.
- Why open: Today only 'could become pregnant' is tagged. The answer changes which staff see which prompts.
- Phase 0 / UCG: —

### D-DM-31 Words about changing a medicine

The rule is 'no doses'. May engine text say 'stop', 'hold' or 'reduce' when quoting a guideline?

- **Recommended (pack):** 'Contraindicated', 'stop' and 'hold' when the source says so; never 'reduce' or 'increase'. Everything ends 'review with the prescriber'.
- Or: No direction words at all.
- Why open: A contraindication cannot be stated without the word. A direction of titration is a step towards a dose.
- Phase 0 / UCG: Phase 0: the live catalog's wording 'reduce the insulin or sulfonylurea' breaks this (P0-08).

### D-DM-32 ★ Where 'adult' starts

Under 16 the engine offers recognition and referral only. Confirm the boundary.

- **Recommended (pack):** 16, and the platform's adolescent band ends there, so 16 to 19-year-olds get the adult rules.
- **Updated recommendation:** 16, by numeric age in the evaluation context, independent of the display band (P0-01).
- Or: The platform's band as it stands, with the adult rules extended down to it.
- Why open: If the adolescent band runs past 16, people aged 16 to 19 would lose every adult rule and gain nothing in its place.
- Phase 0 / UCG: Phase 0: the live adolescent band runs 10–19 (adult from 20); prescribing's cut is 16 (P0-01).

### D-DM-33 ★ Dolutegravir and glucose

What does the engine say when a person on dolutegravir has a raised glucose, or has diabetes?

- **Recommended (pack):** Propose a glucose test; show UCG's words with their source; never propose an ART change; say 'discuss with the ART clinic'. Show the dolutegravir-metformin warning once, to be acknowledged, not at every visit.
- Or: Follow UCG 2023 literally: propose substitution.
- Why open: UCG 2023's HIV chapter, read word for word, lists 'known diabetics' as a contraindication to dolutegravir and says 'Do RBS to confirm hyperglycaemia then substitute with EFV'. The 2022 HIV guideline's algorithm, which may differ, could not be read. An NCD engine should not change ART.
- Phase 0 / UCG: UCG 2023 HIV chapter confirmed verbatim: 'known diabetics' contraindicate DTG; 'Do RBS to confirm hyperglycaemia then substitute with EFV'; DTG raises metformin levels (UCG-HIV-01..04). The 2022 HIV guideline is still unread.
- Needs from you: Uganda HIV Guidelines 2022, the dolutegravir glucose algorithm (about pp. 186 to 189)

### D-DM-34 When metformin starts

At diagnosis with lifestyle advice, or only after lifestyle advice has not worked?

- **Recommended (pack):** When a measure is above target and the person is on no medicine, alongside lifestyle advice (HEARTS-D Fig. 2, the WHO PEN protocol).
- **Updated recommendation:** Follow UCG: lifestyle first for 3 months unless sugars are very high; the 'very high' arm dark until a number is signed (P0-28).
- Or: Only after a period of diet and activity alone (HEARTS-D text and Fig. 1).
- Why open: WHO HEARTS-D prints both. UCG 2023 may settle it.
- Phase 0 / UCG: UCG: lifestyle for 3 months unless sugars are very high, then metformin (U12). 'Very high' has no number.
- Needs from you: UCG 2023 section 8.1.3

### D-DM-35 Type 1 as must-not-miss on the clerking desk

The amendment sets must-not-miss true on type 1 diabetes.

- **Recommended (pack):** Yes: untreated it becomes ketoacidosis.
- Or: Leave the live setting.
- Why open: If the live profile already says so, nothing changes.
- Phase 0 / UCG: Phase 0: the live type 1 profile needs reason text and keeps an obese-BMI 'against' atom (P0-16).

### D-DM-36 ★ Pregnancy not recorded

A woman who could be pregnant, with no answer recorded: what may the engine conclude?

- **Recommended (pack):** Nothing that applies only outside pregnancy: the non-pregnant criteria set, the targets and the treatment steps wait for the answer. Acute and suspicion rules still run.
- Or: Block only HbA1c; let glucose criteria run.
- Why open: HbA1c is not valid in pregnancy and several medicines are contraindicated. One recorded answer releases everything.
- Phase 0 / UCG: Phase 0: nothing in the platform can yet say 'could be pregnant' (P0-02).

### D-DM-37 ★ Rules with no sentence to quote

Six items rest on reasoning, not on a quotable sentence. Sign each as a MedSync rule or strike it.

- **Recommended (pack):** Sign all six with their reasons.
- Or: Strike any you do not accept; the build removes its vignette.
- Why open: (1) Diabetes and unwell with no glucose on record: test today (DM-ACU-ROUTE-13); drowsy: test now (DM-ACU-ROUTE-20). (2) No antiplatelet after a bleeding or untyped stroke. (3) Any meter reading of 12.2 or more, or HI, with symptoms is diagnostic. (4) The three pregnancy meter rules. (5) The count of two features for suspected type 1. (6) Repeated self-treated lows prompt the same review as one severe low.
- Phase 0 / UCG: The fourth review added three more pack rules of this kind (ROUTE-13, -21, -26); listed in their citations.

### D-DM-38 ★ Glucose 18 or more without ketoacidosis

Which WHO rule refers a person with a glucose of 18 mmol/L or more whose ketones are not raised?

- **Recommended (pack):** WHO PEN: same-day review for everyone at this level (DM-ACT-REFER-GLU-02). Dark until signed.
- Or: WHO HEARTS-D: refer only when not improving on tablets (DM-ACT-REFER-GLU-01 alone).
- Why open: The 'not improving on tablets' box is usually blank, so the HEARTS-D rule rarely fires; the fourth review found a glucose of 25 on which nothing fired.
- Phase 0 / UCG: New in review R4 (J14). The switched item is dark until signed (K19); ROUTE-34/34B cover vomiting or acute illness with a high glucose regardless.

### D-DM-39 ★ Blood pressure above 180/110 without organ damage

UCG 2023 4.1.6.1 admits a hypertensive urgency (above 180/110, no organ damage). The pack refers same day above 200/110 (HEARTS-D). Which applies?

- **Recommended (pack):** UCG 2023: admit above 180/110, as the national text says; the hypertension pack will own it.
- Or: WHO HEARTS-D: same-day referral above 200/110, or above 180/110 with symptoms.
- Why open: The emergency (with organ damage) interrupts already (DM-ACU-ROUTE-29); this decides the urgency without it.
- Phase 0 / UCG: New in review R4 (J18), from UCG 4.1.6.1. The emergency with organ damage interrupts already (ROUTE-29).

### D-DM-40 ★ Lower limits for older or high-risk people

A fasting glucose of 4.2 reads 'at target' in a frail 79-year-old on insulin, and a BP of 80/50 has no low band. Supply lower limits?

- **Recommended (pack):** Read ADA Standards of Care section 13 (older adults) for the glucose floor and supply a low BP band from the hypertension pack's source; until then the bands carry no 'at target' below the general range for people on insulin or a sulfonylurea aged 65 or over.
- Or: Leave the bands as they are and rely on the hypoglycaemia risk model beside them.
- Why open: The pack will not type a number from memory (N2).
- Phase 0 / UCG: New in review R4 (J10); R8/R9 added the CVD chart's age range to the request.
- Needs from you: ADA SOC section 13 lower glucose goals for older adults on insulin or a sulfonylurea; WHO CVD risk chart age range (Eastern sub-Saharan Africa); ADA SOC section 13 relaxed fasting and post-meal goals for older adults (until signed, no glucose target is shown under a relaxed or 'avoid symptoms' plan)

### D-DM-41 ★ The acute escalation floor

The build fails if any patient in its grids gets less than the minimum urgency in `k_grid.floor` / `women_floor` (25,088 men over 2 sites × 4 age bands × 8 diabetes profiles × 7 states (including acute illness) × 7 glucose values × 8 ketone values; 480 women over pregnancy/postpartum × BP × symptoms × protein × glucose), or if the interrupt order breaks its invariants. Sign the floor?

- **Recommended (pack):** Sign it as the acute lane's contract. Interrupt on: a meter HI or LO; blood ketones 3.0 or more in diabetes or with a high glucose; ketones 1.6–2.9 with vomiting; deep breathing or drowsiness in diabetes, with a high glucose, or with no glucose at all; a glucose of 3.5 with drowsiness, or on insulin, a sulfonylurea, type 1 or unknown medicines; acetone or dehydration on insulin, an SGLT2 inhibitor, type 1, unknown medicines, or in a child with diabetes (unless blood ketones are normal); an SGLT2 inhibitor with vomiting, deep breathing, dehydration or drowsiness; a child with diabetes who is vomiting, in pain or acutely unwell with no glucose; in pregnancy or 6 weeks postpartum (or unanswered) 160/110, or 140/90 with organ damage, drowsiness or headache, or organ damage or drowsiness at any pressure. Same day for the intermediate patterns (ketones 0.6–2.9, vomiting with a high glucose, a low on other medicines, acetone or dehydration in other diabetes until blood ketones are below 0.6, a vomiting or acutely unwell child or insulin-treated adult with diabetes, 140/90 in pregnancy, and an asymptomatic 160/110 with pregnancy unanswered; with headache it interrupts).
- Or: Amend any row; the build then enforces the amended table.
- Why open: Three review rounds found that patching single rules made other patients silent or doubly interrupted. A table the build enforces stops that.
- Phase 0 / UCG: New in review R6; regenerated after R8/R9. The build enforces this table over 21,504 men and 480 women (k_grid.py).

### D-DM-42 ★ Vomiting with a high glucose on insulin; ketoacidosis in pregnancy

Should an adult on insulin, vomiting, with glucose 18 or more and only a negative urine strip, be an interrupt rather than same-day? Should pregnancy lower the ketone thresholds for routing?

- **Recommended (pack):** Supply ISPAD 2022 and JBDS sick-day and JBDS-IP (DKA in pregnancy) text; until then keep same-day with 'repeat the strip in 2 hours' and say so.
- Or: Interrupt now on the floor's current wording.
- Why open: The seventh review judged both patterns under-escalated; the pack will not add a threshold it has not read (N2).
- Phase 0 / UCG: New in review R7 (Q15/Q16).
- Needs from you: ISPAD 2022 sick-day chapter, JBDS sick-day rules, JBDS-IP DKA in pregnancy


## 3. Phase 0 rulings (pack against the repo)

| # | Ruling | Recommendation |
|---|---|---|
| P0-01 | Where adult starts (pack 16; live band 20) | Add numeric age to the context; adult rules from 16 by age, independent of the display band |
| P0-02 | Numeric age and "could be pregnant" as platform inputs | Derive both from demographics (DOB, sex at birth); unknown sex or age ⇒ pregnancy unknown |
| P0-03 | A list holding only "unknown" satisfies `!= insulin` | Treat `unknown`/blank as insufficient for `!=` |
| P0-04 | `atLeast` over insufficient/unavailable | Adopt the reference evaluator's rule (pack semantics), with truth-table tests |
| P0-05 | Blocking caveat in diagnosis: drop the criterion or "insufficient" | Insufficient by direction (N8) |
| P0-06 | Metformin with eGFR < 30: amber (live) or red (pack) | Keep amber (red is for emergencies; I11) |
| P0-07 | Live red emergency for glucose < 3.9 in anyone; red danger sign on vomiting with known diabetes | Align to N13 and D-DM-24: interrupt below 3.0 or with a sign; level 1 amber outside treated diabetes |
| P0-08 | Live wording "reduce the insulin or sulfonylurea" vs D-DM-31 | Reword to "review with the prescriber" |
| P0-09 | Glibenclamide: flag any use (live) or three situations (pack) | Pack's three situations plus UCG's glimepiride as named alternative |
| P0-10 | `sglt2_during_acute_illness` (same id, different trigger) | Pack's trigger, live id |
| P0-11 | DKD: staging from a strip; confirmation by 3-month flag or 2 of 3 ACRs | Keep strip as fallback category only; confirmation 2 of 3 over 3 months (KDIGO) |
| P0-12 | Vibration toward loss of protective sensation | Yes (IWGDF, D-DM-18) |
| P0-13 | Live `who_2019` vs pack `who_hearts_d_2020` | Replace live WHO set with the pack's (same thresholds, fuller); keep ADA/IDF |
| P0-14 | Low-glucose bands toned `diagnostic` | New tone or `low` with an alert; never "Diabetes range" |
| P0-15 | DKA "blood ketones < 0.6" against-atom on a must-not-miss | Drop (no signature-worthy source that low ketones exclude DKA in context) |
| P0-16 | Type 1 must-not-miss: reason text; live obese-BMI against-atom | Add reason "untreated it becomes ketoacidosis"; remove the obese-BMI against-atom |
| P0-17 | EC-8 scalar changes | Merge-only for lists; scalars only via explicit `_changes` the CSO signs per field |
| P0-18 | Clerking evaluator two-valued | Load nothing using context/pregnancy atoms until EC-3/EC-5; EC-1 gets a three-valued "unknown" |
| P0-19 | DDX-GLUCOSE-HIGH amend adds steroid hyperglycaemia to every glucose ≥ 11.1 | Drop (reviewer's reading: an error) |
| P0-20 | Concept ids (3 wrong; GDM one or two concepts; maculopathy/Ipswich answers; `hx.*` vs `hist.*`; addendum v1.4 or v1.5) | Fix the 3; two concepts; extend answers; use `hist.*`; v1.5 (v1.4 is pending) |
| P0-21 | Test ids: adopt dx catalogue ids or rename | Adopt the live ids |
| P0-22 | `oral_glucose_lowering` split | Split by `parent` classes; keep the old id as parent |
| P0-23 | Duplicates (SUG-DM-POSTURAL, DDX-GLUCOSE-VERY-HIGH, FLAG-EX-GLU-KETONE-TEST, REF-DX-GLU-HHS, SUG-* targets) | Drop the pack's; keep live ids |
| P0-24 | Nausea alone triggers vomiting rules until CFC v1.4 | Accept, documented, or sign CFC v1.4 alongside |
| P0-25 | UCG ">" literal or "≥" | Literal in `ug_ucg_2023` (it is the text); show both sets side by side |
| P0-26 | UCG GDM thresholds vs WHO 2013 | CSO choice: the national text (UCG) or WHO 2013 |
| P0-27 | UCG's two BP targets (120/80, < 130/80) | < 130/80 (the hypertension chapter's, consistent with HEARTS-D) |
| P0-28 | UCG lifestyle-first (D-DM-34) | Follow UCG: lifestyle 3 months unless "very high" (no number; dark until a number is signed) |


## 4. Reference values marked 'needs your input'

| Reference | What | Status now |
|---|---|---|
| REF-DM-DX-HIVGL-FBG | Uganda HIV guidelines 2022 print fasting blood glucose at or above this value for uncontro | The figure is from the summary-of-changes table. |
| REF-DM-DX-HIVGL-RBG | Uganda HIV guidelines 2022 print random blood glucose at or above this value | As above: algorithm figures not read.. |
| REF-DM-DX-UCG-CRITERIA | Uganda Clinical Guidelines 2023, section 8.1.3: diagnostic criteria for diabetes mellitus | **Resolved by UCG 2023** (UCG-DM-01, UCG-DM-02): the claim is now read at source |
| REF-DM-DX-UG-2026 | Integrated Diabetes Management Guidelines for Uganda (2026, comprehensive version), MoH li | The MoH library would not open on any attempt: not even the title was read. |
| REF-DM-PREG-UCG | Uganda Clinical Guidelines 2023, section 16.2.5 Diabetes in pregnancy (p. 711) | **Resolved by UCG 2023** (UCG-GDM-01..03): the claim is now read at source |
| REF-DM-SUS-HIV-UG | Uganda MoH guidance on glucose screening for people moving to or on dolutegravir | Only secondary quotations were read (they describe 3-monthly glucose checks for people aged 45 or over, with raised BMI or hypertension, and avoiding dolutegrav. |
| REF-DM-VAL-EGFR-STEADY | KDIGO 2024: non-steady-state conditions are a source of error in creatinine-based eGFR. | Only the steady-state clause was found, as 'source of error'. |
| REF-DM-CLS-CPEP-HIGH | Random C-peptide at or above this value (with concurrent glucose, within 5 hours of eating | 600 pmol/L is printed in the figure legend as the level above which 'the circumstances of testing do not matter'. |
| REF-DM-CLS-CPEP-LOW | Random C-peptide below this value indicates type 1 diabetes (insulin deficiency) | The 'below 200 pmol/L' band is printed inside the flowchart figure (Holt 2021 Fig. |
| REF-DM-CLS-DTG | Dolutegravir and hyperglycaemia in Uganda: a signal in ART-experienced people who switched | Lamorde 2020 was read through a secondary summary only.. |
| REF-DM-CTRL-UCG | Uganda Clinical Guidelines 2023: glycaemic targets | **Resolved by UCG 2023** (UCG-DM-10): the claim is now read at source |
| REF-DM-KID-STRIP-MAP | Approximate relation of protein strip to albuminuria category (KDIGO 2012 Table 7): negati | KDIGO 2012 Table 7 could not be read from any copy. |
| REF-DM-EYE-UCG | Uganda Clinical Guidelines 2023, section 20.2.3 Diabetic retinopathy (about p. 933) | **Resolved by UCG 2023** (UCG-DR-01 (UCG gives no interval or grading)): the claim is now read at source |
| REF-DM-CVD-EXEMPT | People who are treated as high risk without a chart: established cardiovascular disease, t | Recalled from the WHO HEARTS technical package; page not verified.. |
| REF-DM-RX-EMHSLU | Uganda EMHSLU 2023: glibenclamide deleted; dapagliflozin, gliclazide, glucagon, insulin as | Levels of care per medicine were read from a peer-reviewed analysis, not from the list's endocrine section. |
| REF-DM-RX-UCG-LADDER | Uganda Clinical Guidelines 2023: treatment ladder for type 2 diabetes and insulin for type | **Resolved by UCG 2023** (UCG-DM-13..17): the claim is now read at source |
| REF-DM-RX-DTG-METFORMIN | Uganda HIV chapter: dolutegravir raises metformin levels; follow up closely. | **Resolved by UCG 2023** (UCG-HIV-02 (read in UCG itself, not a mirror)): the claim is now read at source |
| REF-DM-ACT-REVIEW-AFTER-CHANGE | WHO HEARTS-D protocol: review this long after a treatment change | Not established at verification. |

Plus every citation carrying `needsCsoInput` on a rule (the D-DM-37 pack rules).


## 5. Schema and engine changes to accept or decline

Declining one turns dark every item that needs it; the evaluator then reports those items as dark, never as silent.

| Id | Change | Falls dark if declined |
|---|---|---|
| S-DM-01 | Widen `StandardBody` (UG-MOH, ICO, ISPAD, JBDS, NICE…) | Nothing; sources stay filed as 'local' |
| S-DM-02 | `verdict` and `appliesTo` on a criteria set | Intermediate hyperglycaemia, GDM, diabetes in pregnancy, remission sets |
| S-DM-03 | WHO CVD risk as a chart lookup | Out of scope (separate checked import) |
| S-DM-04 | Screening interval keyed by two stage codes | KDIGO monitoring grid intervals |
| S-DM-05 | `months_since` and 'none on record' | Due / never-done rules (Design B owns the record-wide form) |
| S-DM-06 | Target-rule construct | All 8 target proposals |
| S-DM-07 | Nested predicate groups | Nothing (written as any + atLeast) |
| S-DM-08 | `notWhen`, `cautions`, `needsBeforeActing` | Every rule with a stop condition fires without it: **must accept** for parity |
| S-DM-09 | `ages` on targets, bands, risk models, flags | Under-16 safety (N7): **must accept** |
| S-DM-10 | Blocking caveat by direction reaching bands, targets, review steps | N8: **must accept** |
| S-DM-11 | Inclusive upper band edge | Not needed if D-DM-13's updated recommendation is signed |
| S-DM-12 | Neutral strings on restricted items | N9: **must accept** |
| S-DM-13 | `recorded` op (stop conditions only) | Test prompts never clear |
| S-DM-14 | `enabled`/`enabledBy`, `requiresCapability` | Dark items would fire: **must accept** |
| S-DM-15 | `notMetRequires`, `neverNotMet` | 'No retinopathy' without an adequate look |
| S-DM-16 | Pregnancy 'unknown' that withholds and names | D-DM-36 |
| P0-01/02 | Numeric age and 'could be pregnant' in the context | Adult rules by age; pregnancy withholding |
| EC-1 | Result atom in the clerking evaluator (three-valued) | Every clerking atom on a lab result |
| EC-2 | Per-condition detail in Past history | Type, duration and control capture on the desk |
| EC-3 | Glucose context on the vital atom | Fasting/post-meal clerking rules (must not load without it) |
| EC-4 | Signed suggested-care list in the Plan | The 44 care items |
| EC-5 | Pregnancy atom | Pregnancy profiles and exclusions (must not load without it) |
| EC-6 | Units and HI/LO on glucose entry | HI/LO clerking rules |
| EC-7 | Smaller additions (medicine_group/derived atoms in dx, plan_basket_class, subacute onset…) | The items listed in clerking-notes.md |
| EC-8 | 'Amend' = merge for lists; scalars only by signed `_changes` | The seven amend profiles |


## 6. Plan for Phases 2 to 6

1. **Phase 2 (code, behind `NCD_DM_PACK` and the existing NCD flag):** port the reference evaluator's semantics into `lib/ncd` as a pure `runProtocol` (four states with the accepted `atLeast` rule, direction-aware caveats, `notWhen`/`cautions`/`needsBeforeActing`, `enabled`, ages by numeric age, pregnancy unknown, `lessTreatment`, the J04 gate); widen the schema types for what you accept. Truth-table tests identical to the reference evaluator; empty record fires nothing; flag-off behaviour unchanged.
2. **Phase 3 (data, shadow):** load the pack as a typed data catalog keeping live ids (feature map); the REF-DM registry with the N1/N5/N9/N10 checks in CI; port all 100 vignettes; **acceptance: the live evaluator reproduces `computed` for every patient**; mutation tests on every acute rule, red flag and blocking caveat.
3. **Phase 4 (Design B): skipped** by your earlier choice; the manifest stays as the seam.
4. **Phase 5 (clerking desk, behind `CLERKING_V2`):** the accepted engine changes (EC-3, EC-5, EC-6, EC-7, EC-8 first; EC-1 and EC-2 if accepted); amendments by merge from the per-profile diff you sign; flags, suggestions and the two classifiers with a firing and a silent test each; the care list empty until signed. Sign-off pins re-signed.
5. **Phase 6:** CFC addendum v1.5 and **gated migration 0092** (written, not applied); test-menu and formulary entries in the live shape with no dose; the shadow report over the synthetic patients; ADRs.


## 7. Signature

| | |
|---|---|
| Decisions D-DM-01..42 | |
| Phase 0 rulings P0-01..28 | |
| Schema / engine changes | |
| Signed by (CSO) | |
| Second reviewer (four-eyes, D-NCD-17) | |
| Date | |
