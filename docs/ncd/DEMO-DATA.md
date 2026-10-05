# NCDSync demo data

Demo data lets a facility that has not gone live judge the registry on realistic, synthetic patients, and remove them
without residue. Source: `docs/ncd/demo/ncd-demo-catalog.v1.json` (catalogue 1.0.0, standard "NCDReg 0.1 draft"), the
only source of demo patients. Every date in it is a whole-day offset from day 0, the day demo data is switched on.

## Turning it on and off

- **Administration › Demo data › Turn on demo data** (registry lead or administrator). Choose **Scenario patients** (the
  catalogue's 26 hand-written patients; loads in seconds) or **Full clinic** (the scenario patients plus a generated cohort,
  about 1,284 registered persons not recorded as died; the scenario patients load first, then the cohort continues in
  chunks while the card is open, and through `app/api/cron/ncd-demo` once scheduled).
- The banner "Demo data is on. Nothing here is a real patient." is on every NCD screen and print layout, with **Turn off
  demo data** for managers. Empty screens offer **Turn on demo data** to managers only.
- **Turn off demo data** asks for confirmation ("This removes every demo patient and everything recorded against them.
  Real records are not touched."), removes every record of the load's synthetic persons in one transaction, verifies that
  no row refers to the load, restores the condition modules to their previous settings, and keeps the audit log.
- **Remove all synthetic records** (go-live panel) removes demo-loaded and hand-entered synthetic persons alike; a go-live
  request is refused while any exists.

## How the load writes

Through the normal command path as the `demo_loader` principal (the switching user's authority, confined by policy to
synthetic persons' rows), each record entered on its own day: enrolment after a search, registrations, visits (each closed
on its day), reviews, events, then day 0 (arrival, the nurse part, the stage), then recall calls and flags. Command ids are
UUID v5 of (load, catalogue key, position), so a replay is a no-op. Monthly snapshots for the 12 complete months before day
0 are computed by the engine and marked synthetic; they can never be signed. The data-quality step keeps a same-day
duplicate visit for OL so the query list is not empty. The catalogue's demo SMS templates are seeded when the facility has
none, as drafts; nothing is approved.

## What each scenario patient shows

| Key                            | Shows                                                                                                                                                                                                |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AN                             | Featured patient: diabetes and hypertension, six visits, today's nurse part (150/92, BMI 31.5), eGFR 66–68 (G2), foot risk 0, HbA1c/eyes/lipids due, an admission for severe hypoglycaemia           |
| KT                             | Hypertension improving into range; with the clinician today; kidney and lipids due                                                                                                                   |
| OL                             | Diabetes in range, every review done, visit closed today; the same-day duplicate query                                                                                                               |
| MA                             | Random glucose only (not classifiable); mild retinopathy → care band with complications                                                                                                              |
| RB                             | Type 1 diabetes on insulin; HbA1c due                                                                                                                                                                |
| JO                             | Hypertension, current smoker, dipstick trace; lipids due                                                                                                                                             |
| SW                             | Long follow-up, eyes due (last 520 days ago)                                                                                                                                                         |
| EK, PN                         | Not yet arrived today                                                                                                                                                                                |
| GW, FN, CO, VM, DK, TL, HS, BA | The eight overdue patients (62 … 6 days), with call outcomes: no answer, none, call later, will return (promise recorded, still overdue), no phone, none, wrong number (phone flagged invalid), none |
| AK, NN                         | Near namesakes for the duplicate-check demonstration                                                                                                                                                 |
| PK                             | Dialysis, heart-failure admission, death: status died, no pending reminders                                                                                                                          |
| JN                             | Transferred out                                                                                                                                                                                      |
| SO                             | Lost to follow-up                                                                                                                                                                                    |
| MK                             | Hypertension with chronic kidney disease (core, clinician-recorded): G3b, A3                                                                                                                         |
| RA                             | Hypertension with heart failure (core): NYHA class and oedema                                                                                                                                        |
| LN                             | Asthma only (core): no care band                                                                                                                                                                     |
| TO                             | Epilepsy only (core): no care band                                                                                                                                                                   |

All of the catalogue's `expect` blocks are asserted by the acceptance walk (`tests/ncdreg-db/demo.test.ts`).

## Safety interlocks (§10.6)

| #   | Interlock                                                                                             | Test                                       |
| --- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| 1   | Demo data only before go-live; after it, the catalogue's message                                      | `tests/ncdreg-db/demo.test.ts` (last test) |
| 2   | Go-live refused while a synthetic person exists                                                       | `demo.test.ts`, `interlocks.test.ts`       |
| 3   | No SMS to a synthetic person, whatever the transport; demo numbers labelled, no dial link             | `tests/ncdreg-db/recall.test.ts`           |
| 4   | Removal can never delete a record of a person who is not synthetic                                    | `demo.test.ts` (trigger + selection)       |
| 5   | Every figure from the indicator engine                                                                | `tests/ncdreg/interlocks-static.test.ts`   |
| 6   | While demo data is on or any synthetic person exists: exports marked; DHIS2, FHIR and research refuse | `tests/ncdreg-db/exchange.test.ts`         |
| 7   | No report signed while demo data is on                                                                | `demo.test.ts`                             |
| 8   | The DEMO- series reserved                                                                             | `tests/ncdreg-db/interlocks.test.ts`       |
| 9   | The demo banner on every screen and print                                                             | `interlocks-static.test.ts`                |

## Calibration (§10.4)

The generator (`lib/ncdreg/fixtures/generator.ts`, seed 20261005) is tuned only through its probabilities (`PARAMS`).
Five tuning rounds were made on an in-memory mirror of the writer and loader (D-26):

| Round | Within tolerance | What changed                                                                                                                                          |
| ----- | ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | 30/38            | First parameters                                                                                                                                      |
| 2     | 30/38            | Deaths topped up; a lost-before-12-months share; complications clustered on reduced-eGFR persons; first-quarter control lowered; HbA1c testing raised |
| 3     | 33/38            | Fewer on-time visits; longer gaps after a miss; HbA1c 0.36; amputation hazard                                                                         |
| 4     | **35/38 (kept)** | Long-interval stable patients (95–120 days); more returns after a call; foot ulcer and dialysis hazards                                               |
| 5     | 33/38            | Glucose in-range share, dialysis and amputation hazards — worse overall; round 4 restored                                                             |

Remaining gaps after round 5 (in-memory): C07 blood sugar in range (18.1 against 24 ± 4), H08 dialysis starts (12 against
8 per 1,000 ± 40 %), H08 amputations (2 against 5 per 1,000 ± 40 %). Small event counts move by a few events between seeds.

The database-backed gate run's table (every target beside its measured value) is in `docs/ncd/calibration-result.md`.
