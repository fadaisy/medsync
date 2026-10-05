"""REF-DM reference catalogue: every number the diabetes pack uses, typed once.

This is the content of Gate 2 (MS-NCD-DM-DOSSIER-001). Status is `draft` for
every entry; an entry whose source could not be opened carries needsCsoInput.
Units: glucose mmol/L, HbA1c %, eGFR mL/min/1.73m2, ACR mg/mmol, BP mmHg.
"""
from lib import ref

MM, PCT, EG, ACR, HG = "mmol/L", "%", "mL/min/1.73m2", "mg/mmol", "mmHg"

# ── DX: diagnostic thresholds ───────────────────────────────────────────────
G = "diagnosis"
ref("REF-DM-DX-FPG", "Fasting plasma glucose at or above this value is in the diabetes range", 7.0, MM, ["A2-02", "A2-01", "A3-01"], group=G,
    note="WHO, ADA and IDF agree. WHO: fasting capillary and venous plasma values are identical.")
ref("REF-DM-DX-OGTT2H", "2-hour venous plasma glucose after 75 g at or above this value is in the diabetes range", 11.1, MM, ["A2-02", "A3-01"], group=G)
ref("REF-DM-DX-OGTT2H-CAP", "2-hour CAPILLARY plasma glucose after 75 g at or above this value is in the diabetes range (WHO only)", 12.2, MM, ["A2-13", "A2-02"], group=G,
    conflicts="ADA states its criteria on venous plasma and has no capillary post-load value. After a glucose load capillary values run about 1.7 mmol/L higher (A11-23).")
ref("REF-DM-DX-RANDOM", "Random plasma glucose at or above this value WITH classic symptoms (or a hyperglycaemic crisis) is diagnostic", 11.1, MM, ["A2-02", "A3-03"], group=G,
    note="Without symptoms a random value is a reason to test, never a diagnosis.")
ref("REF-DM-DX-HBA1C", "HbA1c at or above this value is in the diabetes range, where the assay is quality-assured and no validity caveat holds", 6.5, PCT, ["A2-06", "A3-01", "A11-35"], group=G,
    note="WHO: a value below 6.5% does not exclude diabetes diagnosed by glucose tests.")
ref("REF-DM-DX-OGTT1H-IDF", "1-hour plasma glucose after 75 g at or above this value defines type 2 diabetes in the IDF 2024 position statement; needs a repeat test", 11.6, MM, ["A10-56", "A10-57"], group=G, conf="moderate",
    conflicts="Not adopted by WHO or ADA (A3-20). IDF prints the mg/dL equivalent as 209 in the position statement and 210 in its 2025 recommendations.")
ref("REF-DM-DX-FAST-MIN-H", "Fasting means no caloric intake for at least this many hours", 8, "h", ["A11-20", "A11-56"], group=G,
    note="WHO 1999 gives an overnight fast of 8 to 14 hours; ADA gives no upper limit.")
ref("REF-DM-DX-REPEAT-WHO", "Asymptomatic: one abnormal result is not a diagnosis. Repeat, preferably the same test, on a subsequent day.", None, None, ["A2-04", "A2-05", "A11-55"], group=G)
ref("REF-DM-DX-CONFIRM-ADA", "Without unequivocal hyperglycaemia, two abnormal results are needed: two different tests (which may be from the same sample) or the same test at two time points.", None, None, ["A3-02", "A11-58"], group=G,
    conflicts="WHO requires the repeat on a subsequent day; ADA accepts fasting glucose plus HbA1c from one sample.")
ref("REF-DM-DX-DISCORDANT", "If two different tests disagree, repeat the one above its cut point; the diagnosis rests on the confirmed test.", None, None, ["A3-07"], group=G)
ref("REF-DM-DX-NEAR-THRESHOLD-MIN", "A result close to the threshold: repeat the test after at least this long", 3, "months", ["A3-08", "A11-41"], group=G, note="ADA gives 3 to 6 months.")
ref("REF-DM-DX-NEAR-THRESHOLD-MAX", "A result close to the threshold: repeat the test within this long", 6, "months", ["A3-08"], group=G)
ref("REF-DM-DX-POC-WHO", "WHO allows a point-of-care device for diagnosis where no laboratory is available; urine glucose only supports suspicion in a symptomatic person and a negative does not exclude.", None, None, ["A2-14"], group=G,
    conflicts="ADLM/ADA 2023: portable meters should not be used to diagnose diabetes (A11-15). See D-DM-04.")
ref("REF-DM-DX-HIVGL-FBG", "Uganda HIV guidelines 2022 print fasting blood glucose at or above this value for uncontrolled chronic illness", 7, MM, ["A1-23"], group=G, conf="moderate",
    needs="The figure is from the summary-of-changes table. The diabetes screening algorithm for people moving to dolutegravir (Figures 42 to 44, about pp. 186 to 189) was not read.")
ref("REF-DM-DX-HIVGL-RBG", "Uganda HIV guidelines 2022 print random blood glucose at or above this value", 11, MM, ["A1-23"], group=G, conf="moderate",
    conflicts="Printed as 11 mmol, not 11.1. Do not round WHO's 11.1 down to match; see D-DM-03.",
    needs="As above: algorithm figures not read.")
ref("REF-DM-DX-UCG-CRITERIA", "Uganda Clinical Guidelines 2023, section 8.1.3: diagnostic criteria for diabetes mellitus", None, None, ["A1-03", "A1-01"], group=G,
    needs="UCG 2023 pp. 471 to 478 could not be opened. No UCG value is recorded. Supply the pages; until then the Uganda criteria set stays empty and WHO applies by precedence (D-DM-01).")
ref("REF-DM-DX-UG-2026", "Integrated Diabetes Management Guidelines for Uganda (2026, comprehensive version), MoH library", None, None, ["A1-41"], group=G,
    needs="The document is listed in the MoH library and could not be opened. It probably supersedes UCG 2023 for diabetes. Supply it (D-DM-01).")

# ── IH: intermediate hyperglycaemia ─────────────────────────────────────────
G = "intermediate_hyperglycaemia"
ref("REF-DM-IH-IFG-WHO", "WHO impaired fasting glucose starts at this fasting plasma glucose", 6.1, MM, ["A2-10", "A2-11"], group=G,
    conflicts="ADA starts at 5.6 mmol/L. WHO considered 5.6 and declined it (A2-11).")
ref("REF-DM-IH-IFG-ADA", "ADA impaired fasting glucose starts at this fasting plasma glucose", 5.6, MM, ["A3-05", "A3-06"], group=G)
ref("REF-DM-IH-IGT", "Impaired glucose tolerance starts at this 2-hour plasma glucose (with fasting below the diabetes threshold)", 7.8, MM, ["A2-09", "A3-05"], group=G)
ref("REF-DM-IH-HBA1C-ADA", "ADA prediabetes starts at this HbA1c", 5.7, PCT, ["A3-05", "A2-07"], group=G,
    conflicts="WHO made no recommendation on HbA1c below 6.5% and defines no HbA1c prediabetes band (A2-07).")
ref("REF-DM-IH-OGTT1H-IDF", "IDF 2024: 1-hour plasma glucose at or above this value is intermediate hyperglycaemia", 8.6, MM, ["A10-56"], group=G, conf="moderate",
    conflicts="Not adopted by WHO or ADA.")
ref("REF-DM-IH-OGTT-NEXT", "A fasting plasma glucose in the WHO impaired-fasting range should be followed by an OGTT to establish glucose tolerance status.", None, None, ["A2-12", "A2-23"], group=G)
ref("REF-DM-IH-RETEST", "People with intermediate hyperglycaemia are re-tested at least every", 12, "months", ["A3-50", "A3-23"], group=G, conv="source says 'at least annually' = 12 months")

# ── PREG: hyperglycaemia first detected in pregnancy ────────────────────────
G = "pregnancy"
ref("REF-DM-PREG-GDM-FPG", "WHO 2013: gestational diabetes if fasting plasma glucose is at or above this value (and below the diabetes threshold)", 5.1, MM, ["A10-03"], group=G, conf="moderate",
    note="WHO graded the evidence very low and the recommendation weak. WHO announced on 25 Sep 2026 that these criteria are being revised (A10-04): keep the entry versioned.")
ref("REF-DM-PREG-GDM-1H", "WHO 2013: gestational diabetes if 1-hour plasma glucose after 75 g is at or above this value", 10.0, MM, ["A10-03"], group=G, conf="moderate")
ref("REF-DM-PREG-GDM-2H", "WHO 2013: gestational diabetes if 2-hour plasma glucose after 75 g is at or above this value (and below the diabetes threshold)", 8.5, MM, ["A10-03"], group=G, conf="moderate")
ref("REF-DM-PREG-DIP", "WHO 2013: diabetes in pregnancy is diagnosed by the non-pregnant WHO glucose criteria (fasting, 2-hour, or random with symptoms). HbA1c is not in the WHO 2013 list.", None, None, ["A10-02", "A10-01"], group=G)
ref("REF-DM-PREG-WINDOW-START", "Usual window for testing for gestational diabetes starts at this gestation", 24, "weeks", ["A10-20", "A10-22"], group=G, conf="moderate",
    conflicts="This is FIGO 2015. WHO has NO recommendation on routine screening or its timing (A10-05, A10-12). See D-DM-12.")
ref("REF-DM-PREG-WINDOW-END", "Usual window for testing for gestational diabetes ends at this gestation", 28, "weeks", ["A10-20", "A10-22"], group=G, conf="moderate")
ref("REF-DM-PREG-POSTPARTUM-FROM", "After gestational diabetes, re-assess glucose tolerance from this many weeks after birth", 6, "weeks", ["A10-10"], group=G,
    conflicts="ADA: 75 g OGTT at 4 to 12 weeks (A10-19, not opened). 6 to 12 weeks satisfies both.")
ref("REF-DM-PREG-POSTPARTUM-TO", "After gestational diabetes, re-assess glucose tolerance by this many weeks after birth", 12, "weeks", ["A10-10"], group=G)
ref("REF-DM-PREG-CARE-WHO", "WHO 2025: pregnant women with type 1 or type 2 diabetes receive multidisciplinary specialised care; retinopathy screening and renal function when antenatal care starts; individualised glycaemic targets with no single number.", None, None, ["A10-11", "A10-09", "A10-07"], group=G)
ref("REF-DM-PREG-REVISION", "WHO is revising the 2013 criteria for hyperglycaemia first detected in pregnancy; the guideline group meets 20 to 24 October 2026.", None, None, ["A10-04"], group=G)
ref("REF-DM-PREG-UCG", "Uganda Clinical Guidelines 2023, section 16.2.5 Diabetes in pregnancy (p. 711)", None, None, ["A1-18"], group=G,
    needs="Section not opened; no value recorded.")

# ── SUS: who to test ────────────────────────────────────────────────────────
G = "suspect"
ref("REF-DM-SUS-AGE-WHO", "WHO HEARTS-D tests asymptomatic adults from this age when overweight", 40, "years", ["A2-21"], group=G)
ref("REF-DM-SUS-BMI", "Body mass index at or above this value counts as overweight for testing", 25, "kg/m2", ["A2-21", "A3-22"], group=G,
    note="HEARTS-D prints 'at or above 25' in Fig. 1 and 'above 25' in Fig. 2. In Uganda a third of non-autoimmune adult-onset diabetes is lean (A10-47): a normal BMI must never close the question in a symptomatic person.")
ref("REF-DM-SUS-AGE-ADA", "ADA tests everyone from this age regardless of risk factors", 35, "years", ["A3-21", "A3-23"], group=G)
ref("REF-DM-SUS-RESCREEN", "If testing is normal, repeat at intervals of at most", 36, "months", ["A11-41", "A3-23"], group=G,
    note="ADA. WHO states no re-screening interval in the documents opened (A11-40).", conv="source says 'a minimum of 3-year intervals' = 36 months")
ref("REF-DM-SUS-GDM-RETEST-MAX", "After gestational diabetes, test for diabetes at least every this many months, lifelong", 36, "months", ["A3-23", "A11-41"], group=G, note="ADA gives every 1 to 3 years.", conv="source says 'at least every 1-3 years'; upper bound 3 years = 36 months")
ref("REF-DM-SUS-HOSP-GLU", "In hospital, any glucose above this value is hyperglycaemia and needs follow-up", 7.8, MM, ["A11-36", "A11-37", "A9-55"], group=G,
    conflicts="NICE defines hyperglycaemia after acute coronary syndrome at above 11.0 mmol/L (A11-39).")
ref("REF-DM-SUS-HOSP-HBA1C-LOOKBACK", "Check HbA1c in an inpatient with hyperglycaemia if none is on record from the last", 3, "months", ["A11-36"], group=G)
ref("REF-DM-SUS-STRESS", "Severe hyperglycaemia found during acute infective, traumatic, circulatory or other stress may be transitory and is not in itself diagnostic.", None, None, ["A11-54", "A11-38"], group=G)
ref("REF-DM-SUS-HIV-ADA", "People with HIV: fasting plasma glucose before starting ART, at switching, and 3 to 6 months after starting or switching; yearly if normal.", None, None, ["A3-26", "A3-27"], group=G)
ref("REF-DM-SUS-HIV-UG", "Uganda MoH guidance on glucose screening for people moving to or on dolutegravir", None, None, ["A10-24", "A1-25", "A1-19", "A1-20"], group=G,
    needs="Only secondary quotations were read (they describe 3-monthly glucose checks for people aged 45 or over, with raised BMI or hypertension, and avoiding dolutegravir in known diabetes under the 2020 guidance). The 2022 guideline's algorithm was not read. Supply HIV Guidelines 2022 pp. 186 to 189 and 237 to 251.")
ref("REF-DM-SUS-TB", "Offer a diabetes test to everyone in TB care who does not know their diabetes status; if testing is limited, prioritise those with symptoms, those over 40 who are overweight, and those who are obese.", None, None, ["A10-31", "A10-30"], group=G)
ref("REF-DM-SUS-TB-RECHECK", "Hyperglycaemia found at TB diagnosis: reassess glycaemic status after", 1, "months", ["A10-32"], group=G, conf="moderate",
    needs="The '1 month' figure is as extracted by the reader; re-read WHO TB handbook (2025) diabetes chapter 4.1 before signing.")
ref("REF-DM-SUS-STEROID", "Recurrent or long-term glucocorticoids: monitor postprandial or random glucose, not fasting.", None, None, ["A3-29", "A10-39"], group=G,
    note="With a morning dose glucose rises by late morning and falls overnight, so a fasting value misses it (JBDS).")
ref("REF-DM-SUS-STEROID-CBG", "On glucocorticoids without known diabetes: a capillary glucose above this value steps testing up to four times daily (JBDS inpatient guidance)", 12.0, MM, ["A10-37"], group=G, conf="moderate")
ref("REF-DM-SUS-STEROID-HBA1C-DELAY", "After steroids stop, wait this long before using HbA1c to screen", 3, "months", ["A10-39"], group=G, conf="moderate")
ref("REF-DM-SUS-ANTIPSYCHOTIC", "Second-generation antipsychotics: screen at baseline, 12 to 16 weeks after starting, and yearly.", None, None, ["A3-28", "A11-46"], group=G)
ref("REF-DM-SUS-PANCREATITIS", "After acute pancreatitis: screen within 3 to 6 months and yearly after; yearly in chronic pancreatitis.", None, None, ["A3-31"], group=G)
ref("REF-DM-SUS-DRUGS", "Consider screening people on statins, thiazide diuretics and some HIV medicines.", None, None, ["A3-28", "A11-46"], group=G)
ref("REF-DM-SUS-RISK-FACTORS-ADA", "ADA Table 2.5 risk factors, any one with overweight: first-degree relative with diabetes, cardiovascular disease, hypertension, low HDL or high triglycerides, polycystic ovary syndrome, physical inactivity, severe obesity or acanthosis nigricans.", None, None, ["A11-45", "A3-22"], group=G)
ref("REF-DM-SUS-WAIST-M", "IDF central obesity cut-point for men (European value, applied to sub-Saharan Africa 'until more specific data are available')", 94, "cm", ["A11-43"], group=G, conf="moderate",
    conflicts="Pooled sub-Saharan data propose about 81 cm for both sexes (A11-44); a research proposal, not adopted. The exam catalogue's REF-EX-WAIST already holds 94/102 and 80/88.")
ref("REF-DM-SUS-WAIST-F", "IDF central obesity cut-point for women", 80, "cm", ["A11-43"], group=G, conf="moderate")
ref("REF-DM-SUS-NO-SCORE", "No diabetes risk score is validated for use in Uganda. FINDRISC bands do not transfer (Kenya optimum 7 versus Finnish 12 to 15); the African Diabetes Risk Score points table could not be read.", None, None, ["A11-53", "A11-02", "A11-25", "A11-06"], group=G,
    note="So DM-SUS-RISK is built from published eligibility criteria (WHO HEARTS-D, ADA Table 2.5), not from a points score. See D-DM-05.")
ref("REF-DM-SUS-ONE-TEST-WEAK", "A single normal fasting glucose or HbA1c is a weak negative in a high-risk African adult: each misses a third or more of OGTT-defined diabetes. The 2-hour OGTT is the most sensitive test.", None, None, ["A11-42", "A11-09", "A11-24", "A11-12"], group=G,
    note="This is the evidence behind screened_negative grade 'limited' versus 'full' (D-DM-06).")
ref("REF-DM-SUS-PAED-4T", "A child with thirst, polyuria, tiredness or weight loss needs a capillary glucose immediately.", None, None, ["A9-29", "A9-31"], group=G)
ref("REF-DM-SUS-PAED-SAMEDAY", "A child or young person with suspected type 1 diabetes is referred the same day; confirmation is not delayed to another day.", None, None, ["A9-30"], group=G)
ref("REF-DM-SUS-PAED-MIMIC", "In limited-resource settings DKA in a child is mistaken for gastroenteritis, respiratory or urinary infection, or malaria.", None, None, ["A9-32", "A9-33"], group=G)

# ── VAL: when a result cannot be trusted ────────────────────────────────────
G = "validity"
ref("REF-DM-VAL-HBA1C-USE-GLUCOSE", "Where the HbA1c to glycaemia relationship is altered (some haemoglobin variants, pregnancy, G6PD deficiency, HIV, altered red-cell turnover), diagnose on plasma glucose.", None, None, ["A3-10", "A11-32"], group=G)
ref("REF-DM-VAL-HBA1C-RBC", "Anything that shortens red-cell survival (haemolysis, recovery from blood loss, transfusion, HbSS, HbSC, malaria) falsely LOWERS HbA1c whatever the assay.", None, None, ["A11-26", "A10-62", "A10-64"], group=G)
ref("REF-DM-VAL-HBA1C-IRON", "Iron deficiency (and vitamin B12 deficiency) falsely RAISES HbA1c; treating the deficiency lowers it.", None, None, ["A11-28", "A10-64", "A11-30"], group=G,
    conflicts="Late pregnancy: ADA says HbA1c reads low (red-cell turnover); NGSP says it rises through iron deficiency. Direction is unpredictable in pregnancy, so the pack blocks HbA1c for diagnosis there.")
ref("REF-DM-VAL-HBA1C-HIV", "HbA1c underestimates glycaemia in people with HIV on ART (protease inhibitor or NNRTI regimens, zidovudine, raised MCV, low CD4).", None, None, ["A10-27", "A10-28", "A3-27"], group=G)
ref("REF-DM-VAL-HBA1C-G6PD", "The African-ancestry G6PD G202A variant lowers HbA1c by about this many percentage points per allele in hemizygous men", 0.81, PCT, ["A10-63", "A11-33"], group=G, conf="moderate")
ref("REF-DM-VAL-HBA1C-VARIANT", "Haemoglobin-variant interference (HbS trait, HbC trait, raised HbF) depends on the assay method; direction is method-specific.", None, None, ["A11-27", "A10-61", "A3-13"], group=G)
ref("REF-DM-VAL-HBA1C-HBSS", "HbA1c cannot be measured in sickle cell disease (HbSS) or other homozygous variants.", None, None, ["A4-12", "A11-34"], group=G)
ref("REF-DM-VAL-HBA1C-CKD-EGFR", "HbA1c accuracy declines when eGFR is below this value, and is low on dialysis", 30, EG, ["A6-37", "A11-29"], group=G)
ref("REF-DM-VAL-HBA1C-DRUGS", "WHO lists antiretrovirals, ribavirin, dapsone, splenomegaly and erythropoietin, iron or B12 treatment among causes of a lowered HbA1c; splenectomy raises it.", None, None, ["A11-30", "A11-31"], group=G,
    conflicts="Hypertriglyceridaemia: WHO lists it as lowering HbA1c (assay effect); several textbooks say it raises it. Treat as unpredictable.")
ref("REF-DM-VAL-GLYCOLYSIS", "Glucose in an uncentrifuged blood sample falls by about this much per hour", 0.6, "mmol/L per h", ["A11-19", "A11-18"], group=G,
    note="Fluoride tubes alone do not prevent it (ADLM/ADA 2023). A delayed sample reads falsely LOW.")
ref("REF-DM-VAL-FPG-CV", "Fasting plasma glucose varies within one person by about this percentage between occasions", 5.7, PCT, ["A11-22"], group=G)
ref("REF-DM-VAL-METER", "ISO 15197:2013: 95% of meter readings fall within 15% of the laboratory value at or above 5.55 mmol/L (within 0.83 mmol/L below it).", None, None, ["A11-14", "A11-59"], group=G,
    note="Haematocrit (anaemia), poor perfusion, oedema and some medicines add error.")
ref("REF-DM-VAL-CAP-POSTLOAD", "After a glucose load capillary glucose reads higher than venous by a mean of about", 1.7, MM, ["A11-23"], group=G)
ref("REF-DM-VAL-OGTT-PREP", "OGTT: morning, after 3 days of unrestricted diet and usual activity, overnight fast of 8 to 14 hours, no smoking, 75 g anhydrous glucose in water over 5 minutes, sample at 2 hours.", None, None, ["A11-56", "A11-21"], group=G)
ref("REF-DM-VAL-URINE-KETONE", "Urine ketone strips underestimate ketonaemia early in DKA and overestimate it in recovery; captopril and valproate give false positives.", None, None, ["A9-14", "A9-13"], group=G)
ref("REF-DM-VAL-EGFR-ARK", "In Malawi, South Africa and Uganda (ARK study) creatinine-based eGFR overestimated kidney function; no equation was within 30% of measured GFR for 75% of people.", None, None, ["A6-25", "A6-23"], group=G,
    note="An eGFR just above a cut-off is weaker reassurance here than the number suggests. Never apply an ethnicity coefficient.")
ref("REF-DM-VAL-EGFR-EQUATION", "eGFR equation: CKD-EPI 2021 creatinine, race-free (the platform's signed equation, D-CFC-06).", None, None, ["A6-21", "A6-22", "A6-20"], group=G)
ref("REF-DM-VAL-EGFR-STEADY", "Creatinine-based eGFR is invalid when creatinine is not in steady state (acute kidney injury, hyperglycaemic crisis) and is not validated in pregnancy.", None, None, ["A6-65"], group=G)
ref("REF-DM-VAL-UACR-TRANSIENT", "Exercise within 24 hours, infection, fever, heart failure, marked hyperglycaemia, menstruation and marked hypertension raise urine albumin without kidney damage.", None, None, ["A6-13", "A6-14"], group=G)
ref("REF-DM-VAL-OPHTHALMOSCOPY", "Direct ophthalmoscopy by general practitioners detects diabetic retinopathy with a sensitivity of only 25 to 66%.", None, None, ["A7-21", "A7-20"], group=G,
    note="A 'normal' undilated direct ophthalmoscopy is not a retinal screen.")
ref("REF-DM-VAL-ABI-HIGH", "An ankle-brachial index above this value suggests calcified arteries and does not exclude peripheral artery disease", 1.3, "ratio", ["A8-39", "A8-38"], group=G)

# ── CLS: classification ─────────────────────────────────────────────────────
G = "classify"
ref("REF-DM-CLS-T1-AGE", "ADA/EASD: age at diagnosis below this value points towards type 1 diabetes (the most discriminating single feature, in White European data)", 35, "years", ["A10-49"], group=G, conf="moderate",
    conflicts="Derived in White European populations. In Uganda 32% of non-autoimmune adult-onset diabetes is lean and about 65% of young clinically diagnosed type 1 is antibody negative (A10-47, A10-48).")
ref("REF-DM-CLS-T1-BMI", "ADA/EASD: body mass index below this value points towards type 1 diabetes", 25, "kg/m2", ["A10-49"], group=G, conf="moderate")
ref("REF-DM-CLS-T1-GLU", "ADA/EASD: glucose at presentation above this value points towards type 1 diabetes", 20, MM, ["A10-49"], group=G, conf="moderate")
ref("REF-DM-CLS-UG-LEAN", "Uganda: share of antibody-negative adults with newly diagnosed diabetes who were lean (BMI below 25)", 32, PCT, ["A10-47"], group=G)
ref("REF-DM-CLS-UG-AB-NEG", "Cameroon, Uganda and South Africa: share of young people with clinically diagnosed type 1 diabetes who were islet-autoantibody negative", 65.1, PCT, ["A10-48"], group=G)
ref("REF-DM-CLS-AB-ORDER", "Islet autoantibodies: GAD first; if negative, IA-2 and/or ZnT8. A negative result does not exclude type 1 diabetes.", None, None, ["A3-35", "A10-50"], group=G)
ref("REF-DM-CLS-CPEP-HIGH", "Random C-peptide at or above this value (with concurrent glucose, within 5 hours of eating) strongly suggests type 2 diabetes", 600, "pmol/L", ["A3-36", "A10-51"], group=G)
ref("REF-DM-CLS-CPEP-LOW", "Random C-peptide below this value indicates type 1 diabetes (insulin deficiency)", 200, "pmol/L", ["A10-51", "A3-36"], group=G)
ref("REF-DM-CLS-CPEP-VLOW", "Random C-peptide below this value needs no repeat", 80, "pmol/L", ["A3-36"], group=G)
ref("REF-DM-CLS-CPEP-TIMING", "C-peptide is used only in insulin-treated people, ideally more than this long after diagnosis, and not within 2 weeks of a hyperglycaemic emergency", 3, "years", ["A10-51", "A3-36"], group=G)
ref("REF-DM-CLS-UNCLASSIFIED", "'Unclassified diabetes' is a legitimate temporary label near diagnosis when the type is not yet clear; efforts to classify continue.", None, None, ["A2-16", "A2-15", "A2-19"], group=G)
ref("REF-DM-CLS-KPD", "Ketosis-prone type 2 diabetes: presents with ketosis and severe insulin deficiency, later remits off insulin; described in sub-Saharan African populations. It is a WHO 2019 'hybrid form'.", None, None, ["A2-18", "A10-46", "A9-18"], group=G)
ref("REF-DM-CLS-SLOW-IMMUNE", "Slowly evolving immune-mediated diabetes of adults: GAD antibody positive, age over 35 at diagnosis, no insulin needed in the first 6 to 12 months. No agreed criteria.", None, None, ["A2-17", "A3-41"], group=G)
ref("REF-DM-CLS-T1-MISSED", "More than 40% of people who develop type 1 diabetes after age 30 are first treated as type 2.", None, None, ["A10-52"], group=G)
ref("REF-DM-CLS-MODY-HBA1C", "Consider monogenic diabetes if HbA1c at diagnosis is below this value, with one parent affected or other specific features", 7.5, PCT, ["A3-39", "A10-52"], group=G)
ref("REF-DM-CLS-MODY", "Suspect MODY: onset typically before 35 (classically before 25), a parent affected in each generation, no islet antibodies, low insulin requirement, no significant obesity, or mild stable fasting hyperglycaemia.", None, None, ["A10-53"], group=G)
ref("REF-DM-CLS-PANC", "Pancreatogenic (type 3c) diabetes: exocrine insufficiency, abnormal pancreatic imaging and no type 1 autoimmunity; usually misclassified as type 2.", None, None, ["A10-42", "A3-31"], group=G)
ref("REF-DM-CLS-FCPD", "Fibrocalculous pancreatic diabetes: a lean young person with recurrent abdominal pain and steatorrhoea, pancreatic calculi on X-ray or ultrasound, insulin-requiring but ketosis-resistant.", None, None, ["A10-43"], group=G)
ref("REF-DM-CLS-T5", "Type 5 (malnutrition-related) diabetes has NO formal diagnostic criteria yet. Described features: BMI below 18.5, onset before 30, early-life undernutrition, ketosis resistance, antibody negative, normal pancreas on imaging.", None, None, ["A10-45", "A10-44"], group=G,
    note="The pack flags the phenotype as atypical and never applies the label (MS-NCD-ENG-001, DM-CLS-ATYP).")
ref("REF-DM-CLS-T5-BMI", "Body mass index below this value is the lean threshold in the IDF type 5 consensus description", 18.5, "kg/m2", ["A10-44"], group=G, conf="moderate")
ref("REF-DM-CLS-T5-AGE", "Onset before this age in the IDF type 5 consensus description", 30, "years", ["A10-44"], group=G, conf="moderate")
ref("REF-DM-CLS-DTG", "Dolutegravir and hyperglycaemia in Uganda: a signal in ART-experienced people who switched (16 of 3417 versus 1 of 3230); low incidence in ART-naive cohorts.", None, None, ["A10-23", "A10-25", "A10-26"], group=G, conf="moderate",
    needs="Lamorde 2020 was read through a secondary summary only.")
ref("REF-DM-CLS-REMISSION-HBA1C", "Remission of type 2 diabetes: HbA1c below this value", 6.5, PCT, ["A10-54", "A10-55"], group=G)
ref("REF-DM-CLS-REMISSION-MONTHS", "Remission: measured at least this long after stopping all glucose-lowering medicines", 3, "months", ["A10-54"], group=G)
ref("REF-DM-CLS-T1-SAMEDAY", "Suspected type 1 diabetes in a newly diagnosed person is a same-day referral (WHO HEARTS-D).", None, None, ["A2-37"], group=G)

# ── CTRL: glycaemic control and targets ─────────────────────────────────────
G = "control"
ref("REF-DM-CTRL-HBA1C-TARGET", "General HbA1c target: at or below this value", 7.0, PCT, ["A2-28", "A4-03", "A10-58"], group=G,
    note="WHO: 'aim for an HbA1c of 7.0%'. ADA: below 7%. The pack treats at_target as HbA1c at or below the individual target.")
ref("REF-DM-CTRL-HBA1C-RELAXED", "Relaxed HbA1c target (frequent severe hypoglycaemia, advanced complications, serious comorbidity, low life expectancy, frailty): below this value", 8.0, PCT, ["A2-29", "A4-05"], group=G)
ref("REF-DM-CTRL-HBA1C-TIGHT", "A lower HbA1c goal may suit people in good health with low treatment risk: below this value", 6.5, PCT, ["A4-04"], group=G, conf="moderate")
ref("REF-DM-CTRL-FPG-SURROGATE", "Where HbA1c is unavailable or unreliable, a fasting plasma glucose at or below this value is the WHO surrogate for control", 7.0, MM, ["A2-28", "A2-58"], group=G,
    conflicts="ADA preprandial goal is 4.4 to 7.2 mmol/L; IDF 4.0 to 8.0 (A10-58).")
ref("REF-DM-CTRL-PPG-SURROGATE", "Where HbA1c is unavailable or unreliable, a postprandial plasma glucose at or below this value is the WHO surrogate for control", 9.0, MM, ["A2-28"], group=G,
    conflicts="ADA peak postprandial below 10.0 mmol/L; IDF 4.0 to 8.0.")
ref("REF-DM-CTRL-PRE-LOW-ADA", "ADA preprandial capillary glucose goal, lower bound", 4.4, MM, ["A4-06"], group=G)
ref("REF-DM-CTRL-PRE-HIGH-ADA", "ADA preprandial capillary glucose goal, upper bound", 7.2, MM, ["A4-06"], group=G)
ref("REF-DM-CTRL-PPG-ADA", "ADA peak postprandial capillary glucose goal: below this value", 10.0, MM, ["A4-06"], group=G)
ref("REF-DM-CTRL-OLDER-HEALTHY", "Healthy older adults: HbA1c goal below 7.0 to this value", 7.5, PCT, ["A4-49"], group=G)
ref("REF-DM-CTRL-OLDER-COMPLEX", "Older adults with intermediate or complex health: HbA1c goal below this value", 8.0, PCT, ["A4-50"], group=G)
ref("REF-DM-CTRL-OLDER-POOR", "Older adults in very complex or poor health: do not rely on HbA1c; avoid hypoglycaemia and symptomatic hyperglycaemia.", None, None, ["A4-51"], group=G)
ref("REF-DM-CTRL-TB", "During TB treatment WHO allows a more lenient HbA1c target: for example below this value", 8.0, PCT, ["A10-36"], group=G)
ref("REF-DM-CTRL-CKD-LOW", "KDIGO: individualised HbA1c target in diabetes with CKD ranges from below this value", 6.5, PCT, ["A6-38"], group=G)
ref("REF-DM-CTRL-CKD-HIGH", "KDIGO: individualised HbA1c target in diabetes with CKD ranges up to below this value", 8.0, PCT, ["A6-38"], group=G)
ref("REF-DM-CTRL-WINDOW-AT-TARGET", "A control measure older than this is not current when the person was last at target", 6, "months", ["A12-67", "A4-01", "A6-37"], group=G,
    note="WHO PEN: every six months once controlled. ADA and KDIGO: at least twice a year.")
ref("REF-DM-CTRL-WINDOW-ABOVE", "A control measure older than this is not current when the person was above target or therapy changed", 3, "months", ["A12-67", "A4-01", "A12-61"], group=G)
ref("REF-DM-CTRL-INSULIN-FPG-LOW", "HEARTS-D insulin annex: fasting glucose goal, lower bound", 4.0, MM, ["A2-30"], group=G)
ref("REF-DM-CTRL-INSULIN-REFER-HBA1C", "HEARTS-D insulin annex: HbA1c above this value on basal insulin prompts referral", 7.5, PCT, ["A2-30"], group=G)
ref("REF-DM-CTRL-SEVERE-HBA1C", "ADA: consider insulin whatever the background therapy when HbA1c is above this value", 10.0, PCT, ["A4-34"], group=G)
ref("REF-DM-CTRL-SEVERE-GLU", "ADA: consider insulin whatever the background therapy when glucose is at or above this value", 16.7, MM, ["A4-34"], group=G)
ref("REF-DM-CTRL-RAPID-FALL", "A rapid fall in HbA1c is associated with early worsening of retinopathy; check retinopathy status when intensifying.", None, None, ["A7-36"], group=G)
ref("REF-DM-CTRL-UCG", "Uganda Clinical Guidelines 2023: glycaemic targets", None, None, ["A1-08"], group=G,
    needs="Recalled, not read: fasting below 7 mmol/L, postprandial below 10 mmol/L, HbA1c below 7% (7.5% in the elderly). Not usable until the page is supplied.")

# ── HYPO ────────────────────────────────────────────────────────────────────
G = "hypoglycaemia"
ref("REF-DM-HYPO-L1", "Hypoglycaemia level 1: glucose below this value (and at or above the level 2 value)", 3.9, MM, ["A4-14", "A9-34", "A9-35"], group=G,
    conflicts="WHO HEARTS-D writes 'at or below 3.9' (A2-39). The exam catalogue's REF-EX-HYPO-L1 holds 3.9 with 'below'.")
ref("REF-DM-HYPO-L2", "Hypoglycaemia level 2: glucose below this value", 3.0, MM, ["A4-14", "A9-34", "A9-35"], group=G)
ref("REF-DM-HYPO-L3", "Hypoglycaemia level 3: a severe event needing another person's help, whatever the glucose.", None, None, ["A4-14", "A2-39"], group=G)
ref("REF-DM-HYPO-WHO-IV", "WHO HEARTS-D: glucose at or below this value, unconscious, or unable to swallow needs intravenous glucose", 2.8, MM, ["A2-39"], group=G)
ref("REF-DM-HYPO-MALARIA", "WHO severe malaria: hypoglycaemia is glucose below this value", 2.2, MM, ["A9-46"], group=G,
    note="A different threshold for a different disease. In a person on insulin or a sulfonylurea the diabetes thresholds apply.")
ref("REF-DM-HYPO-IAH", "A Gold or Clarke score at or above this value implies impaired awareness of hypoglycaemia", 4, "score", ["A9-41"], group=G)
ref("REF-DM-HYPO-REVIEW", "Review hypoglycaemia history at every encounter for everyone at risk; screen for impaired awareness at least yearly.", None, None, ["A4-17"], group=G)
ref("REF-DM-HYPO-DEINTENSIFY", "One or more level 2 or 3 episodes should prompt re-evaluation of the plan, with deintensification or a switch of the causing medicine.", None, None, ["A4-20", "A4-21"], group=G)
ref("REF-DM-HYPO-RISK", "Major risk factors on insulin or a sulfonylurea: level 2 or 3 hypoglycaemia in the last 3 to 6 months, intensive insulin, impaired awareness, kidney failure, cognitive impairment, food insecurity, fasting. Others: age 75 or over, CKD, basal insulin, alcohol.", None, None, ["A4-15", "A4-16", "A12-63"], group=G)
ref("REF-DM-HYPO-RISK-AGE", "Age at or above this value is a hypoglycaemia risk factor on insulin or a sulfonylurea", 75, "years", ["A4-16"], group=G)

# ── ACU: acute danger, routed and never managed ─────────────────────────────
G = "acute"
ref("REF-DM-ACU-DKA-GLU", "DKA: glucose at or above this value OR a prior history of diabetes", 11.1, MM, ["A9-01", "A9-03"], group=G,
    conflicts="WHO HEARTS-D Table 5 still prints 13.9 mmol/L ('occasionally lower') (A2-40); JBDS uses above 11.0 (A9-19).")
ref("REF-DM-ACU-DKA-BOHB", "DKA: blood beta-hydroxybutyrate at or above this value", 3.0, MM, ["A9-01"], group=G)
ref("REF-DM-ACU-DKA-UKET", "DKA: urine ketone strip at or above this grade", "2plus", "strip", ["A9-01", "A9-23"], group=G, conv="source says 'urine ketone strip 2+ or greater'; stored as the catalog option code 2plus")
ref("REF-DM-ACU-DKA-PH", "DKA: venous pH below this value", 7.3, "pH", ["A9-01"], group=G)
ref("REF-DM-ACU-DKA-HCO3", "DKA: bicarbonate below this value", 18, MM, ["A9-01"], group=G,
    conflicts="JBDS (UK) uses below 15.0 mmol/L (A9-19).")
ref("REF-DM-ACU-DKA-SEV-PH", "Severe DKA: pH below this value", 7.0, "pH", ["A9-04"], group=G)
ref("REF-DM-ACU-DKA-MOD-PH", "Moderate DKA: pH at or below this value (and at or above the severe value)", 7.25, "pH", ["A9-04"], group=G)
ref("REF-DM-ACU-DKA-SEV-HCO3", "Severe DKA: bicarbonate below this value", 10, MM, ["A9-04"], group=G)
ref("REF-DM-ACU-DKA-MOD-HCO3", "Moderate DKA: bicarbonate below this value (and at or above the severe value)", 15, MM, ["A9-04"], group=G)
ref("REF-DM-ACU-DKA-SEV-BOHB", "Severe DKA: beta-hydroxybutyrate above this value", 6.0, MM, ["A9-04"], group=G)
ref("REF-DM-ACU-EDKA", "Euglycaemic DKA: ketosis and acidosis with glucose below 11.1 mmol/L; about 10% of DKA. Causes include SGLT2 inhibitors, reduced food intake, pregnancy, alcohol and liver failure.", None, None, ["A9-05", "A9-06", "A4-65"], group=G)
ref("REF-DM-ACU-HHS-GLU", "HHS: plasma glucose at or above this value", 33.3, MM, ["A9-07", "A2-40"], group=G, conflicts="JBDS uses 30 mmol/L or more (A9-22).")
ref("REF-DM-ACU-HHS-OSM-EFF", "HHS: effective osmolality (2 x sodium + glucose) above this value", 300, "mOsm/kg", ["A9-07"], group=G)
ref("REF-DM-ACU-HHS-OSM-TOTAL", "HHS: total osmolality (2 x sodium + glucose + urea) above this value", 320, "mOsm/kg", ["A9-07"], group=G)
ref("REF-DM-ACU-HHS-HCO3", "HHS: bicarbonate at or above this value (no significant acidosis)", 15, MM, ["A9-07"], group=G)
ref("REF-DM-ACU-MIXED", "DKA and HHS overlap in more than a third of hyperglycaemic crises, with higher mortality than either alone.", None, None, ["A9-08"], group=G)
ref("REF-DM-ACU-KETONE-TEST-GLU", "WHO primary care: measure urine ketones when plasma glucose is at or above this value", 18, MM, ["A9-48", "A2-14", "A2-22"], group=G)
ref("REF-DM-ACU-FPG-SEVERE-SYMPT", "WHO HEARTS-D severe stratum: fasting plasma glucose at or above this value with symptoms", 15, MM, ["A2-22"], group=G)
ref("REF-DM-ACU-KETONE-LOW", "Blood ketones below this value are normal", 0.6, MM, ["A9-51", "A9-10"], group=G)
ref("REF-DM-ACU-KETONE-RISK", "Blood ketones at or above this value: at risk of DKA, seek advice the same day", 1.6, MM, ["A9-51", "A9-50"], group=G, conf="moderate",
    note="Trend UK sick-day leaflet bands. ISPAD: urgent review if ketones stay above 1.5 despite extra insulin and fluids.")
ref("REF-DM-ACU-PAED-DKA", "ISPAD paediatric DKA: glucose above 11 mmol/L, venous pH below 7.3 or bicarbonate below 18 mmol/L, and ketonaemia (3 mmol/L or more) or moderate to large ketonuria.", None, None, ["A9-23", "A9-24"], group=G,
    note="Recognition and referral only under 16. Severity bands (pH 7.2, 7.1) are recorded in the research table and are not used by any rule.")
ref("REF-DM-ACU-PAED-CEREBRAL", "Cerebral injury in paediatric DKA: headache or vomiting after treatment starts, slowing heart rate, change in neurological state. Usually within the first 12 hours of treatment.", None, None, ["A9-25"], group=G)
ref("REF-DM-ACU-PRECIPITANTS", "Commonest precipitants of a hyperglycaemic crisis: infection (urinary, pneumonia) and insulin omission; also new-onset diabetes and SGLT2 inhibitors.", None, None, ["A9-09"], group=G)
ref("REF-DM-ACU-SICKDAY-INSULIN", "Sick-day rule: never completely stop insulin; check glucose and ketones often; keep hydrated; seek urgent advice if ketones persist or the person is vomiting.", None, None, ["A9-49", "A4-63", "A9-50"], group=G)
ref("REF-DM-ACU-REFER-ALL", "All suspected DKA or HHS is referred to hospital (WHO HEARTS-D).", None, None, ["A2-40", "A2-37"], group=G)
ref("REF-DM-ACU-INFECTIONS", "Infections that are near-specific to diabetes and kill: rhinocerebral mucormycosis (with ketoacidosis), emphysematous pyelonephritis and cholecystitis, necrotising (malignant) otitis externa, Fournier's gangrene.", None, None, ["A9-59", "A9-60", "A9-61", "A9-62", "A9-63"], group=G)
ref("REF-DM-ACU-BP-REFER-SBP", "WHO HEARTS-D same-day referral: systolic blood pressure above this value", 200, HG, ["A2-37"], group=G)
ref("REF-DM-ACU-BP-REFER-DBP", "WHO HEARTS-D same-day referral: diastolic blood pressure above this value", 110, HG, ["A2-37"], group=G,
    note="Also above 180/110 with symptoms.")

# ── KID: kidney ─────────────────────────────────────────────────────────────
G = "kidney"
ref("REF-DM-KID-PERSIST", "CKD requires the abnormality to persist for at least", 3, "months", ["A6-01", "A6-66"], group=G)
ref("REF-DM-KID-GFR-G2", "GFR category G1 is at or above this eGFR", 90, EG, ["A6-03"], group=G)
ref("REF-DM-KID-GFR-G3A", "GFR category G2 is at or above this eGFR; below it is G3a or worse (reduced eGFR)", 60, EG, ["A6-03", "A2-35"], group=G)
ref("REF-DM-KID-GFR-G3B", "GFR category G3a is at or above this eGFR", 45, EG, ["A6-03"], group=G)
ref("REF-DM-KID-GFR-G4", "GFR category G3b is at or above this eGFR", 30, EG, ["A6-03"], group=G)
ref("REF-DM-KID-GFR-G5", "GFR category G4 is at or above this eGFR; below it is G5", 15, EG, ["A6-03"], group=G)
ref("REF-DM-KID-ACR-A2", "Albuminuria category A2 (moderately increased) starts at this ACR", 3, ACR, ["A6-04", "A2-35"], group=G)
ref("REF-DM-KID-ACR-A3", "Albuminuria category A3 (severely increased) is ABOVE this ACR", 30, ACR, ["A6-04"], group=G,
    conflicts="Boundary at exactly 30 mg/mmol (300 mg/g): KDIGO Table 3 puts it in A2; ADA and KDIGO's own referral figure put it in the severe band. See D-DM-17.")
ref("REF-DM-KID-UACR-CONFIRM", "Albuminuria is confirmed by 2 of 3 abnormal specimens collected within 3 to 6 months.", None, None, ["A6-12", "A6-66"], group=G)
ref("REF-DM-KID-SCREEN-INTERVAL", "Kidney screening (urine ACR and eGFR, preferably both) at least every", 12, "months", ["A2-35", "A6-09", "A12-68"], group=G, conv="source says 'once a year' = 12 months")
ref("REF-DM-KID-SCREEN-START-T1", "Type 1 diabetes: kidney screening starts this long after diagnosis (type 2: at diagnosis)", 5, "years", ["A6-09", "A6-11"], group=G)
ref("REF-DM-KID-MONITOR-GRID", "KDIGO 2024 Figure 13: monitoring frequency per year by GFR and albuminuria category, from 1 to 4 or more.", None, None, ["A6-06", "A6-07", "A6-10"], group=G,
    note="Grid recorded in the research table (A6-06). The colour of each cell was not verified (A6-64).")
ref("REF-DM-KID-DIPSTICK", "Where ACR is unavailable WHO ranks: protein-to-creatinine ratio, then a reagent strip read by machine, then a strip read by eye. A positive strip must be confirmed by a laboratory ratio.", None, None, ["A2-35", "A6-15", "A6-16", "A6-17"], group=G)
ref("REF-DM-KID-STRIP-MAP", "Approximate relation of protein strip to albuminuria category (KDIGO 2012 Table 7): negative to trace about A1; trace to 1+ about A2; 1+ or greater about A3.", None, None, ["A6-19"], group=G,
    needs="KDIGO 2012 Table 7 was recalled, not opened. WHO HEARTS-D prints a different overlap (trace/1+ moderate; 1+/2+ severe). The existing catalog's kdigo_dipstick_fallback staging depends on this.")
ref("REF-DM-KID-REFER-EGFR", "Refer to kidney care when eGFR is below this value", 30, EG, ["A6-47", "A6-51", "A2-37"], group=G,
    note="WHO HEARTS-D lists eGFR below 30 (or anuria) under same-day referral.")
ref("REF-DM-KID-REFER-ACR", "KDIGO 2024: refer for a consistent ACR above this value", 70, ACR, ["A6-47"], group=G,
    conflicts="KDIGO 2012 referred at ACR of 30 mg/mmol or more (A6-48). WHO HEARTS-D lists any moderate or severe albuminuria for routine referral (A2-38).")
ref("REF-DM-KID-REFER-FALL", "KDIGO 2024: refer for a sustained fall in eGFR of more than this percentage", 20, PCT, ["A6-47", "A6-49"], group=G)
ref("REF-DM-KID-NDKD", "Suspect a non-diabetic kidney disease: active urinary sediment, rapidly rising albuminuria or nephrotic syndrome, rapidly falling eGFR, or no retinopathy in type 1 diabetes.", None, None, ["A6-52"], group=G)
ref("REF-DM-KID-RASI-CHECK", "After starting or increasing an ACE inhibitor or ARB: check blood pressure, creatinine and potassium within 2 to 4 weeks.", None, None, ["A6-29", "A5-13"], group=G)
ref("REF-DM-KID-RASI-CREAT-RISE", "Continue the ACE inhibitor or ARB unless creatinine rises by more than this percentage within 4 weeks", 30, PCT, ["A6-30"], group=G)
ref("REF-DM-KID-K-ACTION", "Potassium above this value triggers action on hyperkalaemia", 5.5, MM, ["A6-59"], group=G)
ref("REF-DM-KID-K-MODERATE", "Moderate hyperkalaemia starts at this potassium", 6.0, MM, ["A6-60"], group=G)
ref("REF-DM-KID-K-SEVERE", "Severe hyperkalaemia: potassium at or above this value needs immediate assessment and ECG monitoring", 6.5, MM, ["A6-60"], group=G)
ref("REF-DM-KID-AKI", "Acute kidney injury (KDIGO): creatinine up by 26.5 micromol/L or more within 48 hours, or to 1.5 times baseline within 7 days, or urine below 0.5 mL/kg/h for 6 hours.", None, None, ["A6-55"], group=G)
ref("REF-DM-KID-ROUTINE-REFER-EGFR", "WHO HEARTS-D routine referral: eGFR 30 to 59, or moderately or severely increased albuminuria.", None, None, ["A2-38"], group=G)

# ── EYE ─────────────────────────────────────────────────────────────────────
G = "eye"
ref("REF-DM-EYE-INTERVAL-WHO", "WHO HEARTS-D: retinal examination at diagnosis and then every", 24, "months", ["A2-34", "A12-62", "A7-48"], group=G,
    conflicts="ADA: yearly; every 1 to 2 years only if no retinopathy and glycaemia at goal (A7-28).", conv="source says 'biennially' = 24 months")
ref("REF-DM-EYE-INTERVAL-ADA", "ADA: dilated eye examination at least every", 12, "months", ["A7-28"], group=G, conv="source says 'at least annually' = 12 months")
ref("REF-DM-EYE-START-T1", "Type 1 diabetes: first eye examination this long after onset (type 2: at diagnosis)", 5, "years", ["A7-26", "A7-27"], group=G)
ref("REF-DM-EYE-ICDR", "ICDR grades: none; mild NPDR (microaneurysms only); moderate NPDR (more than microaneurysms, less than severe); severe NPDR (any of: more than 20 intraretinal haemorrhages in each of 4 quadrants, venous beading in 2 or more quadrants, prominent IRMA in 1 or more quadrant; and no proliferative signs); proliferative (neovascularisation, or vitreous or preretinal haemorrhage).", None, None, ["A7-04", "A7-01", "A7-02", "A7-03", "A7-05", "A7-10"], group=G,
    note="ICDR 2003 says 'more than 20' haemorrhages; ICO 2017 rewords it as '20 or more'.")
ref("REF-DM-EYE-DME", "ICO 2017 macular oedema: none; non-centre-involving; centre-involving (thickening in the 1 mm central subfield).", None, None, ["A7-09", "A7-06"], group=G)
ref("REF-DM-EYE-RECALL-NONE-MILD-MAX", "ICO low and intermediate resource: no apparent retinopathy or mild NPDR, re-examine within", 24, "months", ["A7-16"], group=G, note="Stated as 1 to 2 years; referral not required.", conv="source says '1-2 years'; upper bound 2 years = 24 months")
ref("REF-DM-EYE-RECALL-MODERATE-MAX", "ICO low and intermediate resource: moderate NPDR, re-examine within this long, referral required", 12, "months", ["A7-16"], group=G, note="Stated as 6 to 12 months.")
ref("REF-DM-EYE-RECALL-SEVERE", "ICO low and intermediate resource: severe NPDR, re-examine in under this long, referral required", 3, "months", ["A7-16"], group=G,
    conflicts="Uganda MoH Eye Care Guidelines 2016: review in 6 months, or pan-retinal laser if follow-up is unreliable (A7-63).")
ref("REF-DM-EYE-RECALL-PDR", "ICO low and intermediate resource: proliferative retinopathy, re-examine in under this long, referral required", 1, "months", ["A7-16"], group=G)
ref("REF-DM-EYE-RECALL-DME-CI", "ICO low and intermediate resource: centre-involving macular oedema, re-examine in this long, referral required", 1, "months", ["A7-16"], group=G)
ref("REF-DM-EYE-CONTROLLED-ONLY", "The ICO re-examination schedule applies only where diabetes is controlled.", None, None, ["A7-17"], group=G)
ref("REF-DM-EYE-REFER-VA", "ICO: refer if visual acuity is worse than 6/12 or the person has visual symptoms, whatever the grade.", None, None, ["A7-18", "A7-46"], group=G)
ref("REF-DM-EYE-REFER-NOVIEW", "ICO: if visual acuity or an adequate retinal view cannot be obtained, refer.", None, None, ["A7-19"], group=G)
ref("REF-DM-EYE-REFER-ADA", "ADA: promptly refer any macular oedema, moderate or worse NPDR, or any proliferative retinopathy to an ophthalmologist.", None, None, ["A7-33"], group=G)
ref("REF-DM-EYE-UG-2016", "Uganda MoH Eye Care Guidelines 2016: all people with diabetes are referred to a secondary or tertiary facility for retinal evaluation; staging follows ICDR.", None, None, ["A7-62", "A7-63"], group=G)
ref("REF-DM-EYE-UCG", "Uganda Clinical Guidelines 2023, section 20.2.3 Diabetic retinopathy (about p. 933)", None, None, ["A7-64"], group=G, needs="Section not opened.")
ref("REF-DM-EYE-PREG", "Pre-existing diabetes in pregnancy: retinal assessment when antenatal care starts (WHO 2025); ICO: again at 28 weeks if the first is normal. Not needed in gestational diabetes.", None, None, ["A10-09", "A7-24", "A7-32"], group=G)
ref("REF-DM-EYE-METHOD", "WHO: screening is visual acuity plus dilated ophthalmoscopy or retinal photography by a trained person.", None, None, ["A2-34", "A7-14", "A7-22"], group=G)

# ── FOOT ────────────────────────────────────────────────────────────────────
G = "foot"
ref("REF-DM-FOOT-IWGDF", "IWGDF 2023 risk: 0 no loss of protective sensation (LOPS) and no PAD; 1 LOPS or PAD; 2 two of LOPS, PAD, deformity; 3 LOPS or PAD with a previous ulcer, an amputation or end-stage kidney disease.", None, None, ["A8-27", "A8-28"], group=G,
    note="IWGDF states the screening intervals are expert opinion. ADA Table 12.1 is a reprint (A8-29), not corroboration.")
ref("REF-DM-FOOT-INT-0", "IWGDF risk 0: screen every", 12, "months", ["A8-27"], group=G)
ref("REF-DM-FOOT-INT-1", "IWGDF risk 1: screen at least every (stated as 6 to 12 months)", 12, "months", ["A8-27"], group=G)
ref("REF-DM-FOOT-INT-2", "IWGDF risk 2: screen at least every (stated as 3 to 6 months)", 6, "months", ["A8-27"], group=G)
ref("REF-DM-FOOT-INT-3", "IWGDF risk 3: screen at least every (stated as 1 to 3 months)", 3, "months", ["A8-27"], group=G)
ref("REF-DM-FOOT-MONO", "10 g monofilament: three sites on each foot; sensation is absent at a site when two of three answers are wrong.", None, None, ["A8-32", "A8-33"], group=G)
ref("REF-DM-FOOT-IPSWICH", "Ipswich touch test (no monofilament or tuning fork): LOPS is likely when light touch is not felt at this many of 6 sites or more", 2, "sites", ["A8-35"], group=G)
ref("REF-DM-FOOT-LOPS-RULE", "IWGDF: LOPS by one test (monofilament or 128 Hz vibration; light touch as fallback).", None, None, ["A8-31"], group=G,
    conflicts="ADA: absent monofilament PLUS one other abnormal test confirms LOPS (A8-36). The exam catalogue's iwgdf_risk classifier follows IWGDF.")
ref("REF-DM-FOOT-EVERY-VISIT", "Examine the feet for ulcers at every visit; assess amputation risk yearly.", None, None, ["A2-36", "A12-62", "A8-81"], group=G)
ref("REF-DM-FOOT-INF-MIN-CM", "Foot infection: erythema of more than this extent around the wound is one of the local signs", 0.5, "cm", ["A8-50"], group=G)
ref("REF-DM-FOOT-INF-MOD-CM", "Moderate foot infection: erythema extending this far or more from the wound margin, or deeper tissue involved", 2, "cm", ["A8-51"], group=G)
ref("REF-DM-FOOT-INF-SEVERE", "Severe foot infection: any infection with two or more of temperature above 38 or below 36 C, heart rate above 90, respiratory rate above 20, abnormal white cell count.", None, None, ["A8-52", "A9-58"], group=G)
ref("REF-DM-FOOT-ISCH-ABI", "Urgent vascular opinion: ankle-brachial index below this value", 0.4, "ratio", ["A8-44", "A8-45"], group=G)
ref("REF-DM-FOOT-ISCH-ANKLE", "Urgent vascular opinion: ankle pressure below this value", 50, HG, ["A8-44"], group=G)
ref("REF-DM-FOOT-ISCH-TOE", "Urgent vascular opinion: toe pressure below this value", 30, HG, ["A8-44"], group=G)
ref("REF-DM-FOOT-ABI-LOW", "Peripheral artery disease is less likely with an ankle-brachial index at or above this value (and at or below 1.3)", 0.9, "ratio", ["A8-38"], group=G, note="No value excludes PAD.")
ref("REF-DM-FOOT-CHARCOT", "A warm, swollen, red foot with intact skin in a person with neuropathy is active Charcot until shown otherwise: offload knee-high at once and refer. No skin-temperature threshold is endorsed.", None, None, ["A8-61", "A8-62", "A8-63", "A8-76"], group=G)
ref("REF-DM-FOOT-URGENT", "Refer immediately: ulcer with fever or any sign of sepsis, ulcer with limb ischaemia, suspected deep soft-tissue or bone infection, gangrene.", None, None, ["A8-74", "A2-37"], group=G)
ref("REF-DM-FOOT-1DAY", "Any other active foot problem: refer within 1 working day.", None, None, ["A8-75"], group=G, conf="moderate", note="NICE (UK) service standard; the timeframe is a local decision in Uganda.")
ref("REF-DM-FOOT-NO-IMPROVE", "An ulcer that has not reduced in area by this percentage within 4 weeks despite good care needs vascular reassessment", 50, PCT, ["A8-46"], group=G)

# ── NEU: neuropathy ─────────────────────────────────────────────────────────
G = "neuropathy"
ref("REF-DM-NEU-INTERVAL", "Assess for peripheral neuropathy at diagnosis of type 2 diabetes (5 years after type 1) and at least every", 12, "months", ["A8-01"], group=G, conv="source says 'at least annually' = 12 months")
ref("REF-DM-NEU-TESTS", "Assessment: history, a small-fibre test (pinprick or temperature) and a large-fibre test (128 Hz vibration), plus a yearly 10 g monofilament.", None, None, ["A8-02", "A8-03", "A8-09"], group=G)
ref("REF-DM-NEU-ASYMPTOMATIC", "Up to half of diabetic peripheral neuropathy is asymptomatic, so screening cannot rely on symptoms.", None, None, ["A8-04"], group=G)
ref("REF-DM-NEU-EXCLUSION", "Diabetic neuropathy is a diagnosis of exclusion: consider alcohol, neurotoxic medicines, vitamin B12 deficiency, hypothyroidism, kidney disease, HIV, malignancy and inherited neuropathy.", None, None, ["A8-06", "A8-07"], group=G,
    note="Uganda: isoniazid and linezolid in TB treatment add neuropathy risk in diabetes (A10-35).")
ref("REF-DM-NEU-ATYPICAL", "Refer when features are atypical: acute or subacute onset, not length-dependent, motor more than sensory, or asymmetrical.", None, None, ["A8-08"], group=G)
ref("REF-DM-NEU-TORONTO", "Toronto: probable neuropathy is two or more of neuropathic symptoms, reduced distal sensation, reduced or absent ankle reflexes.", None, None, ["A8-12", "A8-11"], group=G)
ref("REF-DM-NEU-AUTONOMIC", "Ask yearly about autonomic symptoms: dizziness or weakness on standing, fainting, exercise intolerance, constipation, diarrhoea, urinary retention or incontinence, altered sweating.", None, None, ["A8-19", "A8-16", "A8-17"], group=G)
ref("REF-DM-NEU-TACHY", "Resting heart rate above this value suggests cardiovascular autonomic neuropathy", 100, "/min", ["A8-20"], group=G)
ref("REF-DM-NEU-OH-SBP", "Orthostatic hypotension: fall in systolic pressure on standing of more than this value", 20, HG, ["A8-20"], group=G,
    conflicts="ADA writes 'more than 20' with no time window; the consensus definition is 'at least 20 within 3 minutes' (A8-21). The exam catalogue's orthostatic_hypotension classifier owns the rule.")
ref("REF-DM-NEU-OH-DBP", "Orthostatic hypotension: fall in diastolic pressure on standing of more than this value", 10, HG, ["A8-20"], group=G)
ref("REF-DM-NEU-B12", "Consider measuring vitamin B12 in people on long-term metformin, especially with anaemia or peripheral neuropathy.", None, None, ["A3-56", "A4-38"], group=G)
ref("REF-DM-NEU-PAIN", "Painful neuropathy: first-line classes are gabapentinoids, SNRIs, tricyclic antidepressants and sodium channel blockers. Opioids are not recommended.", None, None, ["A8-26"], group=G)

# ── CVD: blood pressure, lipids, cardiovascular risk ────────────────────────
G = "cardiovascular"
ref("REF-DM-CVD-BP-SBP", "In diabetes WHO HEARTS-D starts treatment at, and targets below, this systolic pressure", 130, HG, ["A2-31", "A5-08", "A5-53"], group=G,
    conflicts="WHO hypertension guideline 2021: treat at 140/90; 130 to 139 systolic in diabetes is a conditional recommendation (A5-46, A5-47).")
ref("REF-DM-CVD-BP-DBP", "In diabetes WHO HEARTS-D starts treatment at, and targets below, this diastolic pressure", 80, HG, ["A2-31", "A5-08"], group=G)
ref("REF-DM-CVD-BP-CONFIRM", "Hypertension in diabetes is averaged over two or more measurements on two or more occasions.", None, None, ["A5-02"], group=G)
ref("REF-DM-CVD-BP-2DRUG-SBP", "ADA: start two antihypertensive medicines promptly at a confirmed systolic pressure at or above this value", 150, HG, ["A5-09"], group=G)
ref("REF-DM-CVD-BP-2DRUG-DBP", "ADA: start two antihypertensive medicines promptly at a confirmed diastolic pressure at or above this value", 90, HG, ["A5-09"], group=G)
ref("REF-DM-CVD-BP-INTERVAL", "Measure blood pressure at every visit; after starting or changing treatment review monthly until at target, then every 3 to 6 months.", None, None, ["A5-01", "A5-51", "A12-62"], group=G)
ref("REF-DM-CVD-STATIN-AGE", "WHO HEARTS-D: a statin for everyone with type 2 diabetes at or above this age", 40, "years", ["A2-32", "A5-20"], group=G,
    note="'Provided this does not compromise access to glucose- and blood-pressure-lowering medicines'; if not feasible, prioritise those at highest risk.")
ref("REF-DM-CVD-STATIN-AGE-MAX", "ADA: the moderate-intensity statin recommendation covers ages 40 to this value; above it, continue if already taking", 75, "years", ["A5-20", "A5-24"], group=G)
ref("REF-DM-CVD-LDL-ASCVD", "ADA: with established atherosclerotic disease the LDL cholesterol goal is below this value", 1.4, MM, ["A5-28"], group=G)
ref("REF-DM-CVD-LDL-HIGHRISK", "ADA: age 40 to 75 with additional risk factors, LDL cholesterol goal below this value", 1.8, MM, ["A5-22"], group=G)
ref("REF-DM-CVD-LIPID-INTERVAL", "Lipid profile at diagnosis and then at least every", 12, "months", ["A5-18"], group=G, conf="moderate", note="ADA; HEARTS-D sets no lipid testing interval.", conv="source says 'annually thereafter' = 12 months")
ref("REF-DM-CVD-TC-REFER", "WHO HEARTS-D routine referral: total cholesterol above this value", 8, MM, ["A2-38"], group=G)
ref("REF-DM-CVD-TG-PANCREATITIS", "Fasting triglycerides at or above this value: look for secondary causes and treat to reduce pancreatitis risk", 5.7, MM, ["A5-30"], group=G)
ref("REF-DM-CVD-ANTIPLATELET", "Antiplatelet treatment in diabetes is for secondary prevention after a cardiovascular event.", None, None, ["A2-33", "A5-33"], group=G,
    conflicts="ADA: aspirin 'may be considered' for primary prevention at increased risk after discussion (A5-34).")
ref("REF-DM-CVD-ASCVD", "Established atherosclerotic disease: acute coronary syndrome, myocardial infarction, angina, arterial revascularisation, stroke, transient ischaemic attack, or peripheral artery disease.", None, None, ["A5-41"], group=G)
ref("REF-DM-CVD-CHART", "WHO 2019 cardiovascular risk charts, Eastern Sub-Saharan Africa region (includes Uganda). Laboratory chart inputs: age 40 to 74, sex, smoking, systolic pressure, diabetes, total cholesterol. The non-laboratory chart replaces cholesterol and diabetes with BMI.", None, None, ["A5-54", "A5-55", "A5-56", "A2-53"], group=G)
ref("REF-DM-CVD-CHART-AGE-MIN", "WHO risk charts apply from this age", 40, "years", ["A5-55"], group=G)
ref("REF-DM-CVD-CHART-AGE-MAX", "WHO risk charts apply up to this age", 74, "years", ["A5-55"], group=G)
ref("REF-DM-CVD-BAND-5", "WHO chart band boundary: 10-year risk", 5, PCT, ["A5-57", "A5-55"], group=G)
ref("REF-DM-CVD-BAND-10", "WHO chart band boundary: 10-year risk", 10, PCT, ["A5-57", "A5-55"], group=G)
ref("REF-DM-CVD-BAND-20", "WHO chart band boundary: 10-year risk; HEARTS gives a statin at or above this risk", 20, PCT, ["A5-57", "A5-59"], group=G)
ref("REF-DM-CVD-BAND-30", "WHO chart band boundary: 10-year risk", 30, PCT, ["A5-57", "A5-55"], group=G)
ref("REF-DM-CVD-NONLAB-UNDER", "In six Eastern Sub-Saharan African STEPS surveys the non-laboratory chart underestimated risk in this percentage of people with diabetes", 57.6, PCT, ["A5-67"], group=G,
    note="The non-laboratory chart has no diabetes input. In known diabetes use the laboratory chart, or say the risk is a floor.")
ref("REF-DM-CVD-NOT-VALIDATED", "The WHO risk models were validated in Asia-Pacific, New Zealand, China, Thailand, Iran and the UK, and in no sub-Saharan African cohort.", None, None, ["A5-58", "A5-68"], group=G)
ref("REF-DM-CVD-EXEMPT", "People who are treated as high risk without a chart: established cardiovascular disease, total cholesterol 8 mmol/L or more, persistently very high blood pressure, diabetes with overt nephropathy or other significant kidney disease.", None, None, ["A5-60"], group=G,
    needs="Recalled from the WHO HEARTS technical package; page not verified.")
ref("REF-DM-CVD-FOLLOWUP", "HEARTS follow-up by risk: under 5% 12 months; 5 to under 10% every 3 months until at target then 6 to 9 months; 10 to under 20% every 3 to 6 months; 20% or more every 3 months.", None, None, ["A5-59"], group=G)
ref("REF-DM-CVD-RASI-ALBUMINURIA", "With hypertension and albuminuria an ACE inhibitor or ARB is the recommended class; never combine the two.", None, None, ["A5-11", "A5-12", "A6-27", "A5-49"], group=G)
ref("REF-DM-CVD-PREG-CONTRA", "ACE inhibitors, ARBs, mineralocorticoid antagonists and statins are contraindicated in pregnancy and avoided in women who could conceive and are not using reliable contraception.", None, None, ["A5-14", "A5-26"], group=G)
ref("REF-DM-CVD-ESC-NOTE", "SCORE2-Diabetes (ESC 2023) is calibrated to four European risk regions only and is not offered in this pack.", None, None, ["A5-65", "A5-63"], group=G)

# ── RX: therapy at class level. Names only where the source names them. No doses. ──
G = "therapy_class"
ref("REF-DM-RX-LADDER-WHO", "WHO primary-care ladder for type 2 diabetes: diet and physical activity; then metformin; then add a sulfonylurea (gliclazide preferred); then human insulin or referral. A DPP-4 inhibitor, SGLT2 inhibitor or thiazolidinedione only if insulin is unsuitable. Review 3 months after each step.", None, None, ["A2-24", "A2-25", "A2-41", "A2-42", "A2-43"], group=G)
ref("REF-DM-RX-METFORMIN-STOP-EGFR", "Metformin is contraindicated when eGFR is below this value", 30, EG, ["A2-26", "A4-37", "A6-39"], group=G)
ref("REF-DM-RX-METFORMIN-NOSTART-EGFR", "ADA: do not START metformin when eGFR is below this value; reassess benefit and risk if it falls below it on treatment", 45, EG, ["A4-37", "A6-39"], group=G)
ref("REF-DM-RX-METFORMIN-CONTRA", "Other WHO metformin contraindications: severe liver impairment, acute cardiac or respiratory insufficiency, alcohol abuse, history of lactic acidosis.", None, None, ["A2-26"], group=G)
ref("REF-DM-RX-GLIB-AGE", "Glibenclamide is not recommended at or above this age, or where hypoglycaemia is a particular concern", 60, "years", ["A2-27", "A2-47", "A4-42"], group=G,
    note="Removed from the WHO EML in 2013 and deleted from Uganda's EMHSLU 2023 (A1-29); UCG 2023 reportedly still names it (A1-31). See D-DM-22.")
ref("REF-DM-RX-CARDIORENAL", "ADA: with established or high risk of atherosclerotic disease, heart failure or CKD, an SGLT2 inhibitor and/or GLP-1 receptor agonist with proven benefit is recommended whatever the HbA1c.", None, None, ["A4-32", "A4-25", "A4-26", "A4-27"], group=G,
    note="Uganda public-sector access to dapagliflozin was zero in a 2025 analysis (A1-43); EMHSLU 2023 places it at tertiary level.")
ref("REF-DM-RX-SGLT2-EGFR", "KDIGO: an SGLT2 inhibitor is started in type 2 diabetes with CKD when eGFR is at or above this value", 20, EG, ["A6-32", "A4-41"], group=G)
ref("REF-DM-RX-SGLT2-HOLD", "SGLT2 inhibitors carry a DKA risk, including with near-normal glucose: stop before scheduled surgery, during critical illness and during prolonged fasting.", None, None, ["A4-39", "A4-64", "A9-52"], group=G)
ref("REF-DM-RX-PIO-HF", "Pioglitazone should not be used in heart failure.", None, None, ["A4-43"], group=G)
ref("REF-DM-RX-INSULIN-T1", "Type 1 diabetes is treated with insulin from diagnosis. WHO: human insulin (short-acting and intermediate-acting) is the standard; long-acting analogues only for frequent severe hypoglycaemia on human insulin.", None, None, ["A2-44", "A2-45", "A4-22"], group=G)
ref("REF-DM-RX-GLUCAGON", "Glucagon should be available to everyone taking insulin or at high risk of hypoglycaemia.", None, None, ["A4-18"], group=G, note="Glucagon injection was added to EMHSLU 2023 (A1-30).")
ref("REF-DM-RX-TB-RIFAMPICIN", "Rifampicin lowers sulfonylurea levels (loss of control); insulin is unaffected; metformin's effect may increase. WHO keeps metformin as the initial medicine during TB treatment.", None, None, ["A10-34", "A10-36"], group=G)
ref("REF-DM-RX-PREG", "WHO 2025: in pregnancy with type 2 or gestational diabetes not controlled by diet and activity, start metformin or insulin; replace medicines with safety concerns by insulin and/or metformin.", None, None, ["A10-08"], group=G,
    conflicts="ADA: insulin preferred; metformin and glibenclamide not first-line because they cross the placenta (A10-16, not opened).")
ref("REF-DM-RX-OLDER", "Older adults: prefer medicines with low hypoglycaemia risk, deintensify insulin and sulfonylureas in those at high risk, and simplify complex regimens.", None, None, ["A4-54", "A4-57"], group=G)
ref("REF-DM-RX-REASSESS", "Re-evaluate the medication plan every 3 to 6 months; intensify or deintensify without delay when goals are not met or the person is overtreated.", None, None, ["A4-45", "A12-80"], group=G)
ref("REF-DM-RX-LOWCOST", "Where cost is a barrier, lower-cost medicines are metformin, sulfonylureas, thiazolidinediones and human insulin.", None, None, ["A4-47", "A4-46"], group=G)
ref("REF-DM-RX-EML", "WHO Model List: metformin; gliclazide; human insulin; long-acting analogues; empagliflozin (2021, with canagliflozin and dapagliflozin); semaglutide (2025, type 2 diabetes with cardiovascular or kidney disease and BMI 30 or more).", None, None, ["A2-46", "A2-47", "A2-48", "A2-49", "A2-50", "A2-51"], group=G)
ref("REF-DM-RX-EMHSLU", "Uganda EMHSLU 2023: glibenclamide deleted; dapagliflozin, gliclazide, glucagon, insulin aspart, insulin glargine and biphasic insulin aspart added. Metformin and glimepiride are the oral agents designated for primary care.", None, None, ["A1-29", "A1-30", "A1-31"], group=G,
    needs="Levels of care per medicine were read from a peer-reviewed analysis, not from the list's endocrine section. Supply EMHSLU 2023 section for diabetes medicines and the laboratory section.")
ref("REF-DM-RX-UCG-LADDER", "Uganda Clinical Guidelines 2023: treatment ladder for type 2 diabetes and insulin for type 1", None, None, ["A1-09", "A1-10", "A1-11"], group=G,
    needs="Not read. Recollection only (metformin, then a sulfonylurea, then insulin from HC IV). No UCG step ships until the pages are supplied.")
ref("REF-DM-RX-DTG-METFORMIN", "Uganda HIV chapter: dolutegravir raises metformin levels; follow up closely.", None, None, ["A1-21"], group=G,
    needs="Read from a mirror of the UCG HIV chapter, not the 2022 HIV guideline itself. No dose ceiling is recorded here by design.")
ref("REF-DM-RX-SICKDAY-HOLD", "During illness with poor oral intake or risk of acute kidney injury, consider holding metformin and SGLT2 inhibitors. KDIGO describes the SADMANS list and does not endorse it for lack of evidence.", None, None, ["A4-64", "A6-57", "A6-58", "A9-53"], group=G)
ref("REF-DM-RX-INSULIN-CONTINUE", "When insulin is started other glucose-lowering medicines are continued and sulfonylureas reassessed for hypoglycaemia risk.", None, None, ["A4-36"], group=G)

# ── ACT: schedule, referral, education ──────────────────────────────────────
G = "act"
ref("REF-DM-ACT-REVIEW", "Review in 3 months, or at once if symptoms appear; review 1 month after a treatment change.", None, None, ["A12-61", "A2-25"], group=G)
ref("REF-DM-ACT-CADENCE", "Monitor glycaemic control every three months until controlled, then every six months.", None, None, ["A12-67"], group=G)
ref("REF-DM-ACT-EVERY-VISIT", "Every visit: blood pressure; feet examined for ulcers; counselling on diet, physical activity and taking medicines.", None, None, ["A12-62", "A12-60", "A12-07"], group=G)
ref("REF-DM-ACT-REFER-SAMEDAY", "WHO HEARTS-D same-day referral: suspected DKA or HHS; urine ketones above 2+; glucose 18 mmol/L or more not improving on treatment; unresolved hypoglycaemia; suspected type 1 in a new diagnosis; symptoms of heart disease or stroke; recent deterioration of vision; blood pressure above 200/110; anuria or eGFR below 30; infected foot ulcer or gangrene; critical limb ischaemia.", None, None, ["A2-37"], group=G)
ref("REF-DM-ACT-REFER-ROUTINE", "WHO HEARTS-D routine referral: glycaemic goal not met despite taking oral medicines (and insulin); eGFR 30 to 59; moderate or severe albuminuria; peripheral vascular disease; blood pressure above 130/80 on two medicines; total cholesterol above 8 mmol/L.", None, None, ["A2-38"], group=G)
ref("REF-DM-ACT-LEVELS", "Uganda levels of care: HC1 community, HC2, HC3 (clinical officer), HC4 (medical officer), H general hospital, RR regional referral, NR national referral. A medicine's listed level is the lowest at which it may be prescribed.", None, None, ["A1-02", "A1-26", "A1-27"], group=G)
ref("REF-DM-ACT-EDU-DIET", "Healthy balanced diet as for the general population; eat less if overweight; avoid tobacco and harmful alcohol.", None, None, ["A12-59", "A12-25"], group=G,
    note="No official Uganda guidance on local staple foods was found (A12-83, A12-84). The pack carries no food list.")
ref("REF-DM-ACT-EDU-PA-MIN", "Physical activity: at least this many minutes a week of moderate or vigorous aerobic activity, over at least 3 days", 150, "min/week", ["A12-59", "A12-69"], group=G)
ref("REF-DM-ACT-EDU-WEIGHT", "With overweight or obesity aim for weight loss of at least this percentage", 5, PCT, ["A12-29", "A12-55"], group=G, note="ADA 2026 words it as 'at least 5 to 7%'.")
ref("REF-DM-ACT-EDU-SUGAR", "WHO: free sugars below this percentage of energy intake", 10, PCT, ["A12-72"], group=G)
ref("REF-DM-ACT-EDU-FOOT", "Foot care counselling: inspect daily, wash and dry well, never walk barefoot, well-fitting shoes, careful nail cutting.", None, None, ["A12-64", "A8-69"], group=G)
ref("REF-DM-ACT-EDU-HYPO", "On insulin or a sulfonylurea: discuss skipped meals, unusually hard physical work and alcohol as causes of hypoglycaemia, and how to recognise and treat it.", None, None, ["A12-63", "A9-47"], group=G)
ref("REF-DM-ACT-EDU-INSULIN-STORE", "Insulin storage (East Africa Diabetes Study Group): refrigerate unopened insulin, never freeze; a vial in use may be kept at room temperature away from sunlight for a limited time; clay pots are advised against on hygiene grounds.", None, None, ["A12-73", "A12-74"], group=G, conf="moderate",
    conflicts="Ogle 2016 found clay pots lower storage temperature (A12-75, recalled). HEARTS-D is silent (A12-65).")
ref("REF-DM-ACT-EDU-INJECTION", "Check injection sites for lipohypertrophy at least every 3 months; rotate sites; do not inject into lumps.", None, None, ["A12-77", "A12-76"], group=G, conf="moderate")
ref("REF-DM-ACT-EDU-RAMADAN", "Fasting: assess risk 6 to 8 weeks before Ramadan; break the fast if glucose is below 3.9 or above 16.6 mmol/L or the person feels unwell; testing does not break the fast.", None, None, ["A10-65", "A12-38", "A10-66"], group=G, conf="moderate")
ref("REF-DM-ACT-TB-COUGH", "Ask people with diabetes about cough lasting more than this long, at diagnosis and at each check-up", 2, "weeks", ["A10-30", "A10-33"], group=G)
ref("REF-DM-ACT-DENTAL", "Dental examination at least every", 12, "months", ["A12-17", "A11-47"], group=G, conf="moderate", conv="source says 'at least once per year' = 12 months")
ref("REF-DM-ACT-SMBG", "Self-monitoring: for people on insulin; in others it has not consistently lowered HbA1c. WHO HEARTS-D makes no statement.", None, None, ["A12-51", "A12-52", "A12-65"], group=G)
ref("REF-DM-ACT-DSMES", "Offer self-management education at diagnosis, yearly or when goals are not met, when complications develop, and at transitions of care.", None, None, ["A12-20", "A12-19"], group=G)
ref("REF-DM-ACT-PRECONCEPTION", "Women who could conceive: discuss pregnancy planning; medicines with safety concerns are changed before conception.", None, None, ["A10-08", "A5-14"], group=G, conf="moderate",
    conflicts="ADA's numeric preconception HbA1c goal (below 6.5%) was not opened (A10-14); WHO 2025 sets none.")
ref("REF-DM-ACT-VACCINES", "ADA lists seven adult vaccines for people with diabetes; Uganda's routine schedule has none of them for adults except tetanus-containing vaccine for women.", None, None, ["A12-12", "A12-13"], group=G, conf="low",
    note="No vaccination proposal ships. See D-DM-27.")
ref("REF-DM-ACT-TABLE41", "ADA Table 4.1 laboratory evaluation: HbA1c; lipids; liver tests; urine ACR; creatinine and eGFR; vitamin B12 if on metformin; potassium if on an ACE inhibitor, ARB or diuretic; TSH in type 1.", None, None, ["A12-08", "A12-09"], group=G)

# ── EPI: local context shown beside a rule, never a threshold ───────────────
G = "context"
ref("REF-DM-EPI-UG-PREVALENCE", "Uganda STEPS 2023: adults aged 18 to 69 with raised blood glucose", 3.3, PCT, ["A1-33", "A1-34"], group=G, note="Up from 1.5% in 2014.")
ref("REF-DM-EPI-UG-UNAWARE", "Uganda STEPS 2014: share of people found to have diabetes who did not know", 48.9, PCT, ["A1-35", "A11-51"], group=G)
ref("REF-DM-EPI-UG-FPG-SENS", "Eastern Uganda: sensitivity of fasting plasma glucose at 7.0 mmol/L against the OGTT", 62.6, PCT, ["A11-24"], group=G)
ref("REF-DM-EPI-UG-HBA1C-SENS", "Eastern Uganda: sensitivity of HbA1c at 6.5% against the OGTT", 69.8, PCT, ["A11-24"], group=G)
ref("REF-DM-EPI-FPG-MISSED", "Ethiopia and Nigeria community screening: share of diabetes found by fasting glucose plus 2-hour OGTT that fasting glucose alone missed", 44.4, PCT, ["A11-09"], group=G)
ref("REF-DM-EPI-UG-DR", "Pooled prevalence of diabetic retinopathy among adult Ugandans with diabetes", 19.5, PCT, ["A7-58"], group=G, conf="moderate")
ref("REF-DM-EPI-UG-EYE-CAPACITY", "Uganda 2024: 95% of stakeholders reported no community retinopathy screening programme; 51 ophthalmologists nationally.", None, None, ["A7-60"], group=G)

# ── numbers used by rules that had no entry of their own ────────────────────
ref("REF-DM-SUS-ANTIPSYCH-WEEKS", "Second-generation antipsychotic: repeat the glucose test this many weeks after starting (stated as 12 to 16)", 12, "weeks", ["A3-28"], group="suspect")
ref("REF-DM-CTRL-OLDER-AGE", "ADA treats people at or above this age as older adults", 65, "years", ["A4-56", "A4-49"], group="control")
ref("REF-DM-ACT-REVIEW-MONTHS", "WHO HEARTS-D protocol: routine review interval", 3, "months", ["A12-61", "A2-25"], group="act")
ref("REF-DM-ACT-REVIEW-AFTER-CHANGE", "WHO HEARTS-D protocol: review this long after a treatment change", 1, "months", ["A2-25", "A12-61"], group="act",
    needs="The '1 month' box is in Fig. 1 as relayed by the reader (A2-25 lists '3-5 days; 1 month; 2-3 months; 3 months'). Confirm which interval follows which step.")
ref("REF-DM-RX-DEESC-HBA1C", "Age 75 or over and moderately or severely frail: an HbA1c below this value signals high hypoglycaemia risk on a sulfonylurea or insulin", 7.0, "%", ["A10-67"], group="therapy_class", conf="moderate",
    note="A consensus paper (Strain 2021), not a guideline body. ADA makes the same point without a number (A4-54).")
ref("REF-DM-ACU-PAED-GLU", "NICE and ISPAD: a child with these symptoms and a glucose above this value goes to hospital now", 11, "mmol/L", ["A9-31", "A9-23"], group="acute")
ref("REF-DM-KID-UACR-COUNT", "Albuminuria is confirmed when at least this many of 3 specimens are abnormal", 2, "results", ["A6-12"], group="kidney")
ref("REF-DM-CVD-BP-REFER-MEDS", "WHO HEARTS-D routine referral: blood pressure above 130/80 despite this many medicines", 2, "medicines", ["A2-38"], group="cardiovascular", conv="source says 'two medications'")
ref("REF-DM-EYE-RECALL-DME-NCI", "ICO low and intermediate resource: non-centre-involving macular oedema, re-examine in this long", 3, "months", ["A7-16"], group="eye")

import k_fixes  # corrections and verdicts from the independent re-read
