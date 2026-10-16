# count105 fixture month: how every expected cell is reached

For a person to review `count105-expected.json` against `count105-month.ts`. Month: September 2026, hospital-local
(Africa/Kampala, UTC+3). Hospital A unless said. Every row, code, answer and quantity is a fixture; the mapping is a
small invented subset of GATE A §8.2, not the mapping anyone will sign. The rule letters are HM-3 (a)–(i).

## 10.2 routine tests

| Cell                      | Expected     | Why                                                                                                                                                                                                                                                                                                                        |
| ------------------------- | ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| HE02 Number Done          | 3            | fbc-1 (10 SEP); fbc-2 (30 SEP 23:30 Kampala = 20:30Z) (a); fbc-4 entered 9 OCT, form time 29 SEP (a). Not: fbc-3 (1 OCT 00:30 Kampala, 30 SEP in UTC) (a); fbc-18 preliminary (a); fbc-20 withdrawn (`entered_in_error`) (g); fbc-19 hospital B; the clotted FBC specimen sp-6 has no report (d). The manual 99 is ignored |
| HE04 Number Done          | 0            | ESR is on the menu, none done (i)                                                                                                                                                                                                                                                                                          |
| HE06 Number Done          | blank        | Mapped to `test.inr_pt`, which is not on the menu (i)                                                                                                                                                                                                                                                                      |
| CX02                      | absent       | Not in the mapping at all: blank, absent from the CSV (i)                                                                                                                                                                                                                                                                  |
| RP01 Number Done          | 1            | ue-5's urea (b)                                                                                                                                                                                                                                                                                                            |
| RP03 Number Done          | 2            | ue-5's potassium; ue-7's potassium once, though corrected in October (g: month from the first release, content from the current version). The potassium EQA sample adds 0 (c)                                                                                                                                              |
| RP04 Number Done          | 2            | ue-5 and ue-7 sodium (b, g)                                                                                                                                                                                                                                                                                                |
| RP05 Number Done          | 2            | ue-5's creatinine and the stand-alone creat-6 (two sources, one row) (b); ue-5's eGFR maps nowhere and is never counted                                                                                                                                                                                                    |
| CX07 Number Done          | 2            | ue-5's chloride and bicarbonate (b). hba1c-9 is an outside result (`performer: external`) and adds 0 (f)                                                                                                                                                                                                                   |
| SR01 Number Done/Positive | 1 / 1        | rpr-8 counted once (g); positive from its amended answer `reactive`, not the first `non_reactive`                                                                                                                                                                                                                          |
| PS02 Number Done          | 4, bedside 2 | rdt-10, rdt-11 at the bench; rdt-12, rdt-13 at the bedside (h). The malaria kit control check (hmisIqc false) adds 0 (c)                                                                                                                                                                                                   |
| PS02 Number Positive      | 2, bedside 1 | rdt-10 (bench) and rdt-12 (bedside) are `positive` (h)                                                                                                                                                                                                                                                                     |
| ML01 Done / MTB+ / RR     | 1 / 1 / 1    | xpert-14: MTB `detected_low`, rifampicin `detected` (sub-columns)                                                                                                                                                                                                                                                          |
| MB01 Done / Positive      | 1 / 1        | afb-15, stain method `fm`, result `scanty`                                                                                                                                                                                                                                                                                 |
| MB02 Done / Positive      | 0 / 0        | Same test on the menu, but no `zn` smear: the `where` filter keeps afb-15 out of both cells (i)                                                                                                                                                                                                                            |
| IG02 Number Done          | blank        | Viral load is not done in house (not on the menu) (i); its orders went to 10.5 (e)                                                                                                                                                                                                                                         |

## 10.1 visits and specimens (HM-4)

| Cell              | Expected | Why                                                                                                                   |
| ----------------- | -------- | --------------------------------------------------------------------------------------------------------------------- |
| LV01 Blood        | 5        | P1 on 10 SEP (two blood specimens, one visit), P1 on 11 SEP, P4 15 SEP, P7 16 SEP, P5 (emergency → LV01) 30 SEP 23:30 |
| SC01 Blood        | 6        | Specimens, not visits: sp-1, sp-2, sp-3, sp-6, sp-7, sp-9. sp-8 is 1 OCT 00:30 Kampala; sp-10 is hospital B           |
| LV02 Sputum       | 1        | P2, inpatient                                                                                                         |
| SC01 Sputum       | 1        | sp-4                                                                                                                  |
| LV01 / SC01 Urine | 1 / 1    | P3 (sp-5, later rejected: still a visit with a specimen received)                                                     |
| SC02 any          | absent   | Nothing received from elsewhere this month                                                                            |

## 10.7 rejections (d)

| Cell       | Expected | Why                                                                                                |
| ---------- | -------- | -------------------------------------------------------------------------------------------------- |
| RS14 Blood | 1        | sp-6, `clotted` (fixture mapping clotted → RS14)                                                   |
| RS01 Urine | 1        | sp-5, `insufficient`                                                                               |
| (unmapped) | listed   | sp-9, `wrong_container`, has no row in this fixture mapping: listed as `rejection:wrong_container` |

## 10.3 HIV tests by purpose (HM-5, KQ-6, EA-6)

Every kit row has every purpose column, IQC, EQA, Total and Inconclusive at 0 to start (HIV rapid is on the menu).

| Cell                                 | Expected  | Why                                                                                |
| ------------------------------------ | --------- | ---------------------------------------------------------------------------------- |
| Determine / Statpak / SD Bioline HCT | 1 / 1 / 1 | hiv-16, purpose `hct`: three kit tests (steps 1–3 from the algorithm's assays)     |
| Determine Total                      | 2         | hiv-16 step 1 and hiv-17 step 1                                                    |
| Statpak Total, SD Bioline Total      | 1, 1      | hiv-16 steps 2 and 3                                                               |
| SD Bioline Inconclusive              | 1         | hiv-16's outcome `inconclusive`, on the kit of the last step performed             |
| Determine IQC                        | 1         | The Determine control check with hmisIqc (KQ-6). Hospital B's check is not counted |
| Determine EQA                        | 2         | Two HIV panel samples tested on Determine, round submitted 21 SEP (EA-6)           |
| purposeNotRecorded                   | 1         | hiv-17 has no purpose: counted in Total, never guessed into a column               |
| Determine Repeat Testers             | 1 manual  | Entered by hand                                                                    |

## 10.4, 10.5, 10.6 (HM-6, HM-7, HM-8, e)

| Cell                                      | Expected | Why                                                 |
| ----------------------------------------- | -------- | --------------------------------------------------- |
| VS02 No. of Specimen Referred             | 2 manual | 10.4 is hand-entered until referral tracking        |
| test.hiv_viral_load, Equipment break down | 1        | ord-1, hub reason `equipment_down` (e)              |
| test.hiv_viral_load, Others               | 1        | ord-2 predates the reason on the snapshot (P17) (e) |
| (not counted)                             | —        | ord-3 is October; ord-4 is hospital B               |

## Section 6 tracer stock (HM-9)

| Cell                    | Expected | Why                                                                                      |
| ----------------------- | -------- | ---------------------------------------------------------------------------------------- |
| SS07 consumed           | 15       | Issues of 10 (5 SEP) and 5 (20 SEP). The issue at 1 OCT 00:30 Kampala belongs to October |
| SS07 days out of stock  | 0        | Never at 0 at the end of a Kampala day                                                   |
| SS07 stock on hand      | 82       | 100 − 10 − 5 − 3 at the end of 30 SEP, Kampala                                           |
| SS07 expired            | 3        | Write-off with reason `expired` on 25 SEP                                                |
| SS11 consumed / on hand | 10 / 0   | Received 10 on 1 SEP, issued 10 on 28 SEP                                                |
| SS11 days out of stock  | 3        | 28, 29 and 30 SEP ended at 0                                                             |
| SS11 expired            | 0        |                                                                                          |
| SS26                    | absent   | No stock item is mapped to it                                                            |

## Lists

- `unmapped`: `rejection:wrong_container` (above) and `test:test.lft` (on the menu, in no row, not excluded;
  `test.urinalysis_dipstick` is explicitly excluded and so is not listed).
- `manualIgnored`: `HE02|Number Done` (a manual value for a computed cell; the count stands).

Hospital B (same fixture, `hospitalId` B) counts only its own rows: HE02 = 1 (fbc-19), LV01 Blood = 1 (sp-10),
10.5 Reagent stock out = 1 (ord-4), Determine IQC = 1, and no Section 6 or 10.7 cells.
