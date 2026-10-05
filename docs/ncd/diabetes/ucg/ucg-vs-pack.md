# UCG 2023 against the pack (WHO HEARTS-D default)

Source: *Uganda Clinical Guidelines 2023, Publication Final PDF Version 1* (1,158 PDF pages; supplied by the CSO, 2026-10-05). Every quote is in `ucg-2023-claims.json` with its PDF page, checked as a verbatim substring of the PDF's text layer. PDF page = printed page + 66 in chapter 8 (8.1.3 starts on printed p. 469, PDF p. 535).

**Operator check.** The PDF's text layer encodes "≥" correctly elsewhere (17 lines, e.g. "If blood pressure ≥ 140/90" in 4.1.6), and the diabetes criteria use a plain ">" (U+003E). UCG prints strict inequalities where WHO prints "≥". A rendered look at PDF p. 537 is recommended before signature (page rendering was not available in this session).

Not supplied, so unchanged: the 2026 Integrated Diabetes Management Guidelines, the Uganda HIV Guidelines 2022, EMHSLU 2023.

## Differences, by decision

| # | Topic | UCG 2023 says | Pack (WHO HEARTS-D / others) | Bears on |
|---|---|---|---|---|
| U1 | Diagnostic thresholds | FBS **>7.0**; 2-h after 75 g **>11.1**; HbA1c **>6.5%**; random **>11.1** with classical symptoms (UCG-DM-01, p. 537) | ≥7.0 / ≥11.1 / ≥6.5% / ≥11.1 (WHO, ADA, IDF agree) | D-DM-01: does the Uganda set copy ">" literally (a value of exactly 7.0 is not diabetes) or read it as WHO's "≥"? |
| U2 | OGTT load | "75mg of glucose" | 75 g | Typographical: 16.2.5 says "75 g". Read as 75 g. |
| U3 | Specimen | "Blood sugar", no plasma/capillary/meter distinction | Plasma, with capillary 2-h 12.2 | D-DM-04 not settled by UCG |
| U4 | Confirmation | Criteria 1–3 confirmed by repeat testing "in the absence of unequivocal hyperglycaemia"; "one single slightly elevated blood sugar in the absence of symptoms IS NOT DIAGNOSTIC" (UCG-DM-02) | Same principle | Consistent. "Unequivocal" has no number. |
| U5 | Symptoms that let one value diagnose | Classical symptoms: polyuria, polydipsia, **polyphagia, polyneuropathy**. Weight loss is listed under "other symptoms" (UCG-DM-03) | Thirst, polyuria, unexplained weight loss | D-DM-02: UCG's list differs from WHO/ADA's |
| U6 | Who to test | Type 2 risk factors: age >40, first-degree family history, GDM, baby >4 kg; modifiable factors listed (UCG-DM-04). No screening rule stated | WHO: 40+ and overweight; ADA options | D-DM-05 |
| U7 | Baseline tests | RFTs, lipid profile, ECG, urine protein or microalbuminuria (UCG-DM-05) | Lipid yearly (ADA, grade E); WHO none | D-DM-15: UCG asks for a lipid profile at baseline |
| U8 | Glycaemic targets | FBS **<7**, postprandial **<10**, HbA1c **<7% (7.5% for elderly)** (UCG-DM-10) | FPG surrogate 7.0 "at or below"; PPG surrogate **9.0**; HbA1c 7.0; older-healthy 7.5 (ADA) | D-DM-13 (UCG says "below" for all three); postprandial 10 vs 9.0; "elderly" has no age in UCG |
| U9 | BP target in diabetes | 8.1.3: "target BP **120/80**" (UCG-DM-06). 4.1.6: "<130/80 mmHg in people with high CVD risk", diabetes counted as high risk (UCG-HTN-02). Hypertension defined >140/90 on 2–3 occasions (UCG-HTN-01) | 130/80 (HEARTS-D) | D-DM-23. **UCG contradicts itself** (120/80 vs 130/80) |
| U10 | Statin | "Consider statin… especially if" IHD/CVD present or **age >40** (UCG-DM-07/08) | WHO ≥40 | Operator only (exactly 40) |
| U11 | Beta-blockers | 8.1.3: "Do not use beta blockers, e.g., atenolol in diabetes" (UCG-DM-09). 4.1.6's table: diabetes → "Carvedilol or Bisoprolol only" | No beta-blocker flag in the pack | New: a possible therapy flag (atenolol in diabetes). UCG contradicts itself on the class. |
| U12 | When metformin starts | "If sugar levels not very high, and patient is willing, try lifestyle modifications for 3 months, and reassess"; metformin if not enough "and/or sugar level initially very high" (UCG-DM-13/14) | Recommendation: metformin when a measure is above target, with lifestyle | D-DM-34: UCG chooses the alternative (lifestyle first), except when "very high" (no number) |
| U13 | Second-line agent | **Glimepiride** only ("0r Glimepiride", the "Or" suggesting a deleted first option) (UCG-DM-16). Glibenclamide appears in UCG only as a rifampicin interaction (TB chapter) | Handback: "UCG 2023 reportedly still names glibenclamide" | D-DM-22: **corrects the handback**. UCG agrees with EMHSLU 2023 deleting glibenclamide |
| U14 | Third line | Basal insulin (UCG-DM-17) | Same ladder (dark, D-DM-20) | D-DM-20 can now be read against UCG |
| U15 | Metformin and kidney | "Contraindicated in advanced kidney disease" (UCG-DM-18), no eGFR number | ADA eGFR <30 contraindicated; 30–44 caution | Consistent; UCG gives no number |
| U16 | Acute illness | "Do not use oral anti-diabetics in acute complications, and in acutely sick patients: use insulin" (UCG-DM-19) | Flags: metformin / SGLT2 during acute illness | Supports the pack's flags; UCG is broader (all oral agents) |
| U17 | Type 1 | "Oral antidiabetic medicines are NOT used in type 1. Metformin… only under specialist advice" (UCG-DM-12) | — | Possible flag: oral agent recorded in type 1 |
| U18 | Hypoglycaemia | "Symptoms generally occur with a blood glucose <3.0 mmol/L" (UCG-HYPO-01). No levels | ADA levels <3.9 / <3.0 | D-DM-24: UCG does not define levels |
| U19 | DKA / HHS | DKA: ketosis, acidosis, hyperglycaemia; features incl. abdominal pain, vomiting, altered consciousness, deep breathing, acetone breath. HHS: "no/few ketones in urine" (UCG-DKA-01..03) | 2024 consensus | Consistent; UCG gives no thresholds |
| U20 | GDM criteria | FBS **>5.6** or 2-h **>7.8** after 75 g (UCG-GDM-03) | WHO 2013: FPG 5.1–6.9, 1-h ≥10.0, 2-h 8.5–11.0 | **Major.** UCG gives no source for these; against WHO 2013 they are higher for fasting and lower for 2-h, and have no 1-h value. D-DM-28 / D-DM-12 |
| U21 | Who to test in pregnancy | Risk-based: BMI >35, age >40, previous GDM, family history, previous unexplained third-trimester death or baby >4 kg, polyhydramnios, glycosuria, large-for-dates (UCG-GDM-01/02) | Pack: 75 g OGTT at 24 weeks+ at capable sites (FIGO), D-DM-12 | D-DM-12: UCG is risk-based, not universal |
| U22 | Retinopathy | No interval, no grading; treatment at regional referral (UCG-DR-01) | WHO 2 years; ICO by grade | D-DM-14 not settled by UCG |
| U23 | Dolutegravir | "Contraindications for DTG… including: known diabetics" (UCG-HIV-01, p. 274) | Same text already in the pack | D-DM-33 confirmed verbatim |

## What this means for the Uganda criteria set

`ug_ucg_2023` can now be filled from U1, U4 and U5. Two choices only the CSO can make:
1. **">" literally or as "≥"?** Literal changes the verdict only at exactly 7.0, 11.1 and 6.5%.
2. **Which symptoms** gate the single random value (UCG's four classical symptoms, or WHO/ADA's three)?

Nothing here supplies a dose: UCG's doses are deliberately not transcribed.
