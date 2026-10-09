# Diagnosis relations: build rulings for the CSO

ADR 0220. Judgement calls made while building on the signed catalogues (GATE A, 2026-10-09). Each can be changed in
one place. Status: **signed by the CSO, 2026-10-09 ("Sign all four").**

| id     | The call made                                                                                                                                          | Why                                                                                                                                                                                                                                                                                          | Alternative                                                                                     |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| STG-01 | Anaemia severity at 65 and over uses the WHO 2024 rows for women and men aged 15–65.                                                                   | The signed scale (WHO 2024, Table 3, as read) gives no row past 65; without this, older adults get no severity.                                                                                                                                                                              | Leave anaemia unstaged from 65 until the older-adult rows are read.                             |
| STG-02 | CKD albuminuria categories in mg/mmol: A1 below 3, A2 3 to 30, A3 above 30.                                                                            | KDIGO's standard SI conversion of 30 and 300 mg/g; the signed file marks the mmol figures "to check".                                                                                                                                                                                        | Stage CKD by eGFR only until the KDIGO page is re-read.                                         |
| STG-03 | CURB-65 without a urea is scored as CRB-65 and says so ("urea not recorded"); any other missing item gives no score.                                   | The signed scale's note: CRB-65 applies where urea is unavailable; a missing item is never 0.                                                                                                                                                                                                | No score without urea.                                                                          |
| REF-01 | "Refine to …" lists each subtype with its criteria and the deciding tests' status (ordered, done, result), but never picks one: the clinician chooses. | The subtype criteria are text (ECG ST-elevation thresholds, troponin rise and/or fall) and the record holds no structured ECG reading, so a criterion cannot be judged met by the desk. The design's "offer when a result meets the criteria" becomes "show the criteria beside the result". | Structure the ECG and troponin-series readings first (a later build), then offer automatically. |

## Gate B answers (CSO, 2026-10-09)

- **D-REL-10 withdrawn.** Its premise was wrong: the signed catalogue (ADR 0206) already marks cryptococcal
  meningitis, PCP, Kaposi sarcoma, cerebral toxoplasmosis and oesophageal candidiasis HIV-restricted. They stay
  restricted; every clinician on the desk holds every class today, so the treating team still sees them. Revisit
  when per-user classes arrive.
- **Demotion to the differential.** A centred confirm names the links that will be retired; on confirm they are
  retired with a reason and the linked diagnoses become co-existing. Swapping the leading with a co-existing
  diagnosis keeps both working, so no link is lost.
- **Look-back.** A relation may point at a diagnosis from an earlier visit that is still active, or was resolved
  within 90 days; the note names when it was treated.

## Added while wiring stages (signed by the CSO, 2026-10-09)

| id     | The call made                                                                                                                                             | Why                                                                                                                                 | Alternative                                 |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| STG-04 | The AKI baseline is the lowest creatinine in the 90 days before the current one; with none, no AKI stage.                                                 | KDIGO stages against a baseline; the lowest recent value is the usual working baseline, and no baseline must never read as stage 1. | Ask the clinician for a baseline each time. |
| STG-05 | Windows: haemoglobin 7 days; creatinine and urea 2 days (this illness); eGFR and ACR 365 days (as the diabetes pack). Older values count as not recorded. | Severity describes this visit; chronic categories use the year.                                                                     | Other windows.                              |

## Final gate answers (CSO, 2026-10-09)

- **STG-04 and STG-05 signed** as written.
- **A stage not yet computable** is shown on the desk only ("needs haemoglobin"); the note names the diagnosis
  without a stage. Blank is still never written as the lowest band.
- **Placeholder already explained by a diagnosis on the visit** ("Anaemia, cause not yet known" beside Anaemia):
  "Refine … into Anaemia" removes the placeholder as entered in error with the reason "Refined into Anaemia,
  already on this visit" (D-REL-15: one entry per problem; audited).
- **"Considered and unlikely"**: a must-not-miss marked Unlikely with its reason gets its own line after the
  differential, not a numbered alternative.
