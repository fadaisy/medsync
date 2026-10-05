"""The CSO decision list (D-DM). The first option is the recommendation. The build fails if the pack cites a decision that is not here."""
D = []
def dec(n, title, question, options, why, affects, needs=None):
    D.append({"id": f"D-DM-{n:02d}", "title": title, "question": question, "recommended": options[0], "alternatives": options[1:], "why": why, "affects": affects, "needsFromCso": needs, "decision": None, "signedBy": None, "signedOn": None})

dec(1, "Default criteria set for Uganda", "Which diagnostic criteria set does MedSync apply by default?",
    ["WHO HEARTS-D 2020 now; replace it with Uganda's own set as soon as the text is supplied (UCG 2023 section 8.1.3, or the 2026 Integrated Diabetes Management Guidelines if they are in force).",
     "Enable no diagnostic rule until the Uganda text has been read."],
    "D-NCD-11 names UCG 2023, but no copy of its diabetes section could be read: every copy is one large PDF and the reading tool stops in the front matter. WHO HEARTS-D is the document UCG is built on and was read in full.",
    "who_hearts_d_2020; the empty sets ug_ucg_2023 and ug_integrated_dm_2026", "UCG 2023 sections 1.1.6, 4.1.6, 8.1.3, 8.1.4, 16.2.5, 20.2.3 (name the printing); the 2026 guideline PDF")
dec(2, "Which symptoms let one glucose value diagnose", "With symptoms, one diabetes-range value is diagnostic. Which symptoms count?",
    ["Thirst, passing a lot of urine, unexplained weight loss: the three WHO and ADA both name.", "Add blurred vision and fatigue, which HEARTS-D also lists."],
    "Fatigue and blurred vision are common and non-specific; counting them would diagnose on a single value far more often.", "The symptom criteria of who_hearts_d_2020; DM-SUS-SYMP-01 and -02")
dec(3, "Random glucose of 11 or 11.1 in HIV care", "Uganda's 2022 HIV guideline prints 'RBG ≥ 11mmol'. Which number does the engine use?",
    ["11.1 mmol/L everywhere (WHO and ADA).", "11 in HIV clinics, to match the guideline's wording."],
    "The guideline's line defines a client category in a summary table; it is not written as a diagnostic criterion, and its algorithm pages could not be read.", "REF-DM-DX-HIVGL-FBG, REF-DM-DX-HIVGL-RBG (not used by any rule)", "Uganda HIV Guidelines 2022, about pp. 186 to 189 and 237 to 251")
dec(4, "A glucose meter for diagnosis and for control", "May a site with no laboratory diagnose, and judge control, on a meter?",
    ["Yes, as WHO allows: diagnose on a meter with symptoms or with a repeat on another day; never rule out on a meter value near a threshold; read a fasting or post-meal meter value against WHO's surrogates for control.",
     "Meter for suspicion only (the laboratory-medicine position ADA follows): district sites then cannot confirm and must refer every case."],
    "Most Ugandan primary care has a meter and no laboratory glucose. Two steps here are this pack's own and need your signature: any meter reading of 12.2 or more with symptoms counts whatever its timing, and WHO's plasma surrogates are read from a meter.",
    "who_hd_fcap_*, who_hd_ogtt_cap_*, who_hd_random_cap_symptoms, who_hd_cap_high_symptoms; fcap_control_who, pcap_control_who; DM-ACT-RX-01B; DM-CON-VALID-02")
dec(5, "Who is offered a test without symptoms", "Which eligibility rules run?",
    ["WHO's rule everywhere (40 or over and overweight). ADA's 'overweight with another risk factor' at sites with a laboratory. ADA's 'everyone from 35' off.", "WHO's rule only.", "All three."],
    "No diabetes risk score has been validated in Uganda, so the pack uses published eligibility rules and no points score. Universal testing from 35 would load laboratories with low-yield tests.", "DM-SUS-RISK-01 to -03, DM-SUS-RISK-NEVER")
dec(6, "What counts as 'tested and negative'", "When may the engine record that diabetes has been excluded?",
    ["'Full' only with a normal 2-hour OGTT. A normal fasting glucose or HbA1c alone is 'limited', with a re-test date.", "Accept a normal fasting glucose as full exclusion."],
    "In African cohorts a single fasting glucose or HbA1c missed roughly a third to a half of OGTT-defined diabetes. No guideline states what excludes diabetes in a high-risk African adult: this grade is a MedSync rule.", "DM-CON-GRADE-01")
dec(7, "How near is 'near the threshold'", "ADA says to repeat a result 'close to' the threshold in 3 to 6 months. How close?",
    ["Within the fasting glucose's own within-person variation (REF-DM-VAL-FPG-CV) below the threshold.", "A fixed band you choose."],
    "ADA gives no number. The variation figure is the only sourced quantity that bears on it.", "DM-CON-DISC-02")
dec(8, "Time windows that are product settings", "How far back does the engine look for an unfollowed raised glucose, and how old may a glucose result be and still count as evidence at this visit?",
    ["You set both. Until you do, the rules that depend on them stay dark (REF-DX-RESULT-AGE-GLUCOSE has no value on purpose).", "Reuse the 3-month control window (REF-DM-CTRL-WINDOW-ABOVE) for the age of a glucose result."],
    "No guideline gives these numbers. The pack will not invent them.", "DM-SUS-INCID-WINDOW; every clerking atom with max_age_ref on glucose")
dec(9, "Order of the next-best test", "In what order does the engine propose tests?",
    ["As written in DM-ACT-TEST-01: symptomatic, a random glucose now; no symptoms with a laboratory, fasting plasma glucose, then an OGTT if it is 6.1 to 6.9; HbA1c only where no caveat holds; no laboratory, a fasting meter reading repeated on another day; pregnant, a 75 g OGTT; on steroids, after a meal.", "A different order you specify."],
    "Each step follows a source; the ORDER between them is a judgement.", "DM-ACT-TEST-01")
dec(10, "Suspecting type 1", "How many features raise the flag, and how urgently?",
     ["Two of: under 35, BMI below 25, unexplained weight loss (and, in established diabetes, glucose above 20 at presentation). Same day when the diagnosis is new or the type is unclassified and the person is not on insulin; routine once a clinician has recorded the type.", "One feature.", "Three features."],
     "WHO refers 'clinical suspicion of type 1 in a newly diagnosed patient' the same day but does not define suspicion. ADA/EASD says no single feature confirms it; its figures are from White European data. The count is this pack's.", "DM-CLS-T1-02, -04, -05")
dec(11, "C-peptide thresholds", "May the engine use C-peptide to support or refute type 1?",
     ["Not yet. Keep both criteria held out until a person has read the source figure (Holt 2021 Fig. 1; ADA 2026 Fig. 2.1), then restore them with the timing conditions.", "Restore now on the legend text alone."],
     "The meaning of the 200 and 600 pmol/L thresholds sits inside a flowchart image that could not be read. Used wrongly, a high value invites stopping insulin in early type 1.", "classification type_1 (x.heldOut); REF-DM-CLS-CPEP-LOW, -HIGH", "The two figures, read by a person")
dec(12, "Testing in pregnancy", "Does the engine prompt for a 75 g OGTT in pregnancy?",
     ["Yes, at 24 weeks or more, at sites that can run one (FIGO). Elsewhere it stays off and the meter referral rules apply.", "Off everywhere: WHO makes no universal recommendation."],
     "WHO's 2013 criteria say how to diagnose, not whom to test. UCG 2023 section 16.2.5 was not read.", "DM-SUS-PREG-01", "UCG 2023 section 16.2.5")
dec(13, "Exactly at the target", "Is an HbA1c of exactly 7.0%, a fasting glucose of exactly 7.0 or a post-meal glucose of exactly 9.0 at target?",
     ["Follow WHO's clinical wording: fasting 7.0 and post-meal 9.0 are AT target ('at or below'); HbA1c 7.0% is not ('below 7.0%', as WHO's indicator and ADA print). This needs an inclusive upper edge on two bands.", "'Below' for all three, as the bands are built today."],
     "WHO's text says 'at or below' for the two glucose surrogates and its own indicator table says 'below'; for HbA1c the text has no operator. The treatment step already uses 'above 7.0' for fasting glucose.", "hba1c_control_*, fpg_control_who, ppg_control_who, fcap_control_who, pcap_control_who; DM-ACT-RX-01")
dec(14, "Eyes: how often, and who is referred", "Which recall interval and which referral rule?",
     ["No retinopathy: every 2 years (WHO). Mild or moderate: 12 and 6 months unless control is confirmed at target. Refer by grade (ICO): urgent for severe, proliferative or centre-involving disease; routine for moderate. Grade by ICDR ('more than 20' haemorrhages).",
      "Uganda's Eye Care Guidelines 2016: refer everyone with diabetes to a retina clinic.", "Yearly for everyone (ADA)."],
     "Uganda had 51 ophthalmologists in 2023 and 95% of stakeholders reported no community screening, so 'refer all' may not be deliverable; but it is the national document. UCG 2023 section 20.2.3 was not read.", "diabetic_retinopathy intervals; DM-ACT-SCREEN-EYE-01; DM-ACT-REFER-EYE-01 to -03; classifier dr_review", "UCG 2023 section 20.2.3")
dec(15, "Lipid testing at district sites", "Does the yearly lipid prompt run where there is no lipid profile?",
     ["Off where the site has no lipid profile; on where it has. The statin prompt in type 2 diabetes at 40 or over does not depend on it.", "On everywhere, as a referral prompt."],
     "WHO HEARTS-D sets no lipid interval and gives the statin without one. ADA's yearly profile is expert opinion (grade E).", "DM-ACT-SCREEN-LIPID-01")
dec(16, "'Kidney failure' as a hypoglycaemia risk", "ADA lists 'kidney failure' as a major risk factor. What eGFR does the engine read that as?",
     ["Below 30 for 'high'; below 60 for 'raised'.", "Below 15 for 'high'."],
     "ADA gives no number for 'kidney failure'. Insulin and sulfonylurea clearance falls well before dialysis.", "hypoglycaemia_risk_ada")
dec(17, "An ACR of exactly 30 mg/mmol", "Moderately or severely increased?",
     ["Severely increased (30 or more), as KDIGO's own figures and ADA have it.", "Moderately increased (KDIGO 2024 Table 3: A3 is 'above 30')."],
     "KDIGO 2024 disagrees with itself at this value. The safer reading is the higher category.", "REF-DM-KID-ACR-A3; the live albuminuria staging")
dec(18, "Loss of protective sensation", "One abnormal test, or two?",
     ["One (IWGDF): monofilament or vibration; light touch where neither tool exists.", "Monofilament plus one other (ADA)."],
     "IWGDF's rule needs one tool and is the more sensitive. The foot domain already follows IWGDF.", "The live foot complication; ipswich_sites_missed")
dec(19, "eGFR below 30", "How urgent is the referral?",
     ["Same day from primary care (WHO HEARTS-D).", "Urgent, not same day, where a physician is on site."],
     "WHO lists it with anuria under same-day referral. KDIGO names it as a reason for kidney care and gives no time.", "DM-ACT-REFER-EGFR-01")
dec(20, "Treatment suggestions in version 1", "Do the class-level treatment review steps (DM-ACT-RX-01 to -12) show in version 1?",
     ["Tests, screening, referral, education, targets and safety flags: on. Treatment review steps: on as review prompts with no dose, once you have read them against UCG 2023 section 8.1.3; dark until then.",
      "Dark until version 1.1, as MS-NCD-ENG-001 reserves.", "On now, on WHO's ladder."],
     "You asked for the system to suggest management. Without these steps it can say what is due and what is unsafe, but not what the next treatment step is. Uganda's own ladder has not been read, and WHO's own documents disagree on when metformin starts (D-DM-34).",
     "Every management step of kind therapy_review (proposal kind therapy.review)", "UCG 2023 section 8.1.3")
dec(21, "SGLT2 inhibitors and GLP-1 agonists for heart and kidney protection", "Does the engine propose them?",
     ["At referral sites only, as 'refer for consideration'. Off at district sites.", "Off everywhere until supply improves.", "On everywhere."],
     "ADA and KDIGO recommend them whatever the HbA1c. EMHSLU 2023 lists dapagliflozin at tertiary level, and a 2025 analysis found no public-sector availability.", "DM-ACT-RX-05, DM-ACT-RX-05B")
dec(22, "Glibenclamide, and which sulfonylurea at which level", "How does the engine treat glibenclamide?",
     ["Recognise it (patients still take it), flag it at 60 or over, with reduced kidney function and where lows are a concern, and never propose it. Name the sulfonylurea per level of care only after the EMHSLU 2023 endocrine pages are read.", "Propose glimepiride at primary care now, on the secondary source."],
     "EMHSLU 2023 deleted glibenclamide; UCG 2023 reportedly still names it. The levels of care were read in a journal article, not in the list.", "glibenclamide_* flags; DM-ACT-RX-02; formulary additions", "EMHSLU 2023 endocrine and laboratory sections")
dec(23, "Blood pressure threshold in diabetes", "At what pressure does the engine prompt a treatment review?",
     ["130/80 on two occasions (WHO HEARTS-D).", "140/90 (WHO's hypertension guideline treats everyone at this level and makes 130 to 139 in diabetes a conditional recommendation)."],
     "UCG 2023 section 4.1.6 was not read; the hypertension pack will own this in the end.", "DM-ACT-RX-07; bp_*_who_hearts_d; tgt_bp", "UCG 2023 section 4.1.6")
dec(24, "A glucose of exactly 3.9 or 3.0", "Is 3.9 hypoglycaemia? Is 3.0 level 2?",
     ["ADA's levels, as the live catalog uses: below 3.9 is level 1, below 3.0 is level 2.", "WHO's wording: 'at or below 3.9'."],
     "The sources differ only at the exact value. UCG 2023 section 1.1.6 was not read.", "DM-ACU-ROUTE-06, -07; the LOW band", "UCG 2023 section 1.1.6")
dec(25, "'Above 7.8' in hospital", "The source says above 7.8; the vital-sign atom has only 'at or above'.",
     ["Add gt_ref to the vital atom.", "Accept 'at or above' (the difference is a reading of exactly 7.8)."], "A one-line engine change; keeps the rule faithful to the source.", "DDX-GLUCOSE-IN-HOSPITAL")
dec(26, "Insulin storage advice", "The East Africa Diabetes Study Group advises against clay pots on hygiene grounds; a field study (recalled, not re-read) found they keep insulin cooler.",
     ["Carry only the advice nobody contests (refrigerate unopened insulin, never freeze it, keep a vial in use out of the sun) and say nothing about clay pots until you have read both sources.", "Carry the regional group's advice in full, including 'no clay pots'."],
     "Many patients have no refrigerator, so this advice matters; it should not rest on a contested claim either way.", "DM-ACT-EDU-05; REF-DM-ACT-EDU-INSULIN-STORE")
dec(27, "Vaccines", "Does the engine prompt for vaccines in adults with diabetes?",
     ["No. Uganda's routine schedule has none for this group, and ADA's table is the US schedule.", "Yes, as advice where available."], "A prompt nobody can act on is noise.", "REF-DM-ACT-VACCINES (not used by any rule)")
dec(28, "A meter reading in pregnancy", "What may the engine do with a meter value in a pregnant woman?",
     ["Refer on it: any reading of 11.1 or more, or a fasting reading of 7.0 or more, today; a fasting reading of 5.1 to 6.9, for a laboratory glucose. Diagnose gestational diabetes on plasma glucose only.", "Also diagnose on a plasma-calibrated meter where no laboratory exists."],
     "Most antenatal care is at health centre III with a meter. WHO's criteria are for plasma; FIGO 2015 discusses meters and was not read for this point.", "DM-CON-PREG-03, -04, -05; DDX-PREGNANCY-GLUCOSE")
dec(29, "A raised glucose during acute illness or at TB diagnosis", "Warn, or hold the diagnosis?",
     ["Warn beside the value and let the criteria run; the clinician decides. Re-test after recovery (TB: after the first month).", "Hold the diagnosis as 'pending re-test after recovery' unless ketones are raised or symptoms came before the illness."],
     "WHO: hyperglycaemia under acute stress 'should not in itself be regarded as diagnostic'. But holding a diagnosis delays treatment in a person who does have diabetes.", "glucose_acute_illness and the five related caveats")
dec(30, "Which pregnancy facts are a restricted class", "Are pregnancy, previous gestational diabetes and 'could become pregnant' restricted as sexual and reproductive health?",
     ["'Could become pregnant' and previous gestational diabetes: restricted. Current pregnancy: not restricted, because medicine safety checks must read it everywhere.", "All three restricted.", "None restricted."],
     "Today only 'could become pregnant' is tagged. The answer changes which staff see which prompts.", "Features pregnant, prior_gdm, could_conceive, pcos; hx.prior_gdm; the history question on diabetes in a previous pregnancy")
dec(31, "Words about changing a medicine", "The rule is 'no doses'. May engine text say 'stop', 'hold' or 'reduce' when quoting a guideline?",
     ["'Contraindicated', 'stop' and 'hold' when the source says so; never 'reduce' or 'increase'. Everything ends 'review with the prescriber'.", "No direction words at all."],
     "A contraindication cannot be stated without the word. A direction of titration is a step towards a dose.", "Therapy flag actions; REF-DM-RX-METFORMIN-NOSTART-EGFR")
dec(32, "Where 'adult' starts", "Under 16 the engine offers recognition and referral only. Confirm the boundary.",
     ["16, and the platform's adolescent band ends there, so 16 to 19-year-olds get the adult rules.", "The platform's band as it stands, with the adult rules extended down to it."],
     "If the adolescent band runs past 16, people aged 16 to 19 would lose every adult rule and gain nothing in its place.", "x.ages on targets, bands, risk models and flags; ageBands on rules; REF-DX-ADULT-AGE")
dec(33, "Dolutegravir and glucose", "What does the engine say when a person on dolutegravir has a raised glucose, or has diabetes?",
     ["Propose a glucose test; show UCG's words with their source; never propose an ART change; say 'discuss with the ART clinic'. Show the dolutegravir-metformin warning once, to be acknowledged, not at every visit.", "Follow UCG 2023 literally: propose substitution."],
     "UCG 2023's HIV chapter, read word for word, lists 'known diabetics' as a contraindication to dolutegravir and says 'Do RBS to confirm hyperglycaemia then substitute with EFV'. The 2022 HIV guideline's algorithm, which may differ, could not be read. An NCD engine should not change ART.",
     "DM-SUS-POP-DTG-01; dolutegravir_with_metformin; REF-DM-SUS-HIV-UG", "Uganda HIV Guidelines 2022, the dolutegravir glucose algorithm (about pp. 186 to 189)")
dec(34, "When metformin starts", "At diagnosis with lifestyle advice, or only after lifestyle advice has not worked?",
     ["When a measure is above target and the person is on no medicine, alongside lifestyle advice (HEARTS-D Fig. 2, the WHO PEN protocol).", "Only after a period of diet and activity alone (HEARTS-D text and Fig. 1)."],
     "WHO HEARTS-D prints both. UCG 2023 may settle it.", "DM-ACT-RX-01, DM-ACT-RX-01B", "UCG 2023 section 8.1.3")
dec(35, "Type 1 as must-not-miss on the clerking desk", "The amendment sets must-not-miss true on type 1 diabetes.",
     ["Yes: untreated it becomes ketoacidosis.", "Leave the live setting."], "If the live profile already says so, nothing changes.", "dx.dm_type1")
dec(36, "Pregnancy not recorded", "A woman who could be pregnant, with no answer recorded: what may the engine conclude?",
     ["Nothing that applies only outside pregnancy: the non-pregnant criteria set, the targets and the treatment steps wait for the answer. Acute and suspicion rules still run.", "Block only HbA1c; let glucose criteria run."],
     "HbA1c is not valid in pregnancy and several medicines are contraindicated. One recorded answer releases everything.", "appliesTo.pregnancy on criteria sets, targets, therapy steps; feature pregnancy_possible")
dec(37, "Rules with no sentence to quote", "Six items rest on reasoning, not on a quotable sentence. Sign each as a MedSync rule or strike it.",
     ["Sign all six with their reasons.", "Strike any you do not accept; the build removes its vignette."],
     "(1) Diabetes and unwell with no glucose on record: test today (DM-ACU-ROUTE-13); drowsy: test now (DM-ACU-ROUTE-20). (2) No antiplatelet after a bleeding or untyped stroke. (3) Any meter reading of 12.2 or more, or HI, with symptoms is diagnostic. (4) The three pregnancy meter rules. (5) The count of two features for suspected type 1. (6) Repeated self-treated lows prompt the same review as one severe low.",
     "The items whose citation carries needsCsoInput")
