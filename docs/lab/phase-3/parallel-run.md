# Lab Phase 3: HMIS 105 parallel run (S45, owner action)

S45 cannot be run by the build: it needs one full month of the laboratory's paper tally of section 10 (OA-10) kept
beside MedSync with `labHmis` on. This file is the template the laboratory lead and the HMIS focal person fill
for that month. Patient details never go in it: only row codes, counts and the reason for each difference.

## How to run it

1. Switch `labHmis` on for the test hospital (after the CSO signs the Phase 3 copy). Sign the mapping first
   (the lead, then the HMIS focal person, once OA-1 has verified the form rows).
2. For the whole month, the laboratory keeps its paper tally exactly as before. Nobody copies numbers from
   MedSync into the paper, or the other way.
3. On the 1st of the next month, the lead counts the month in MedSync (`/lab/hmis`, **Count the month**) and
   prints the form (**Print form**). Do not check or sign yet.
4. Fill the table below, one line per row that has a number on either side. Every difference gets one of three
   explanations and an action:
   - **Mapping fix**: the row's source, positive rule or column choice was wrong. Change the mapping, sign it
     again, count the month again, and re-compare the row.
   - **Counting rule**: the paper and MedSync count different things on purpose (for example HM-3 (g): an amended
     result counts once; (c): QC and EQA are not patient tests). Write which rule.
   - **Paper error**: the tally was wrong (a missed line, a double count). Write what was found in the register.
5. When every difference is explained, the lead checks the report and the In-Charge signs it. Attach this file
   (filled) to the STOP report for Step 11.

## Header

| Field                                 | Value                    |
| ------------------------------------- | ------------------------ |
| Hospital                              | \_\_\_\_                 |
| Month                                 | \_\_\_\_                 |
| Form version and file hash            | 2019-09-print · \_\_\_\_ |
| Mapping version signed on             | \_\_\_\_                 |
| Paper tally kept by                   | \_\_\_\_                 |
| Compared by (lead) and on             | \_\_\_\_                 |
| Checked by (HMIS focal person) and on | \_\_\_\_                 |

## Comparison table

| Section | Row code  | Row (as on the form) | Column            | Paper tally | MedSync | Difference | Explanation (mapping fix / counting rule / paper error) | What was done |
| ------- | --------- | -------------------- | ----------------- | ----------- | ------- | ---------- | ------------------------------------------------------- | ------------- |
| 10.1    | LV01      | Outpatient (OPD)     | Blood             |             |         |            |                                                         |               |
| 10.2    | HE02      | CBC                  | Number Done       |             |         |            |                                                         |               |
| 10.2    | PS02      | Malaria RDTs         | Number Done       |             |         |            |                                                         |               |
| 10.2    | PS02      | Malaria RDTs         | Number Positive   |             |         |            |                                                         |               |
| 10.3    | Determine | Determine            | Total             |             |         |            |                                                         |               |
| 10.7    | RS14      | Other reasons        | Blood             |             |         |            |                                                         |               |
| 6       | SS11      | Malaria RDTs         | Quantity consumed |             |         |            |                                                         |               |
| …       |           |                      |                   |             |         |            |                                                         |               |

(The rows above are only examples of the layout; list every row with a number on either side.)

## Summary

| Measure                                                                         | Count  |
| ------------------------------------------------------------------------------- | ------ |
| Rows compared                                                                   | \_\_\_ |
| Rows equal                                                                      | \_\_\_ |
| Differences explained by a mapping fix (mapping re-signed)                      | \_\_\_ |
| Differences explained by a counting rule                                        | \_\_\_ |
| Differences explained by a paper error                                          | \_\_\_ |
| Differences not explained (must be 0 before signing)                            | \_\_\_ |
| Cells still entered by hand (10.3 repeat testers and DNA-confirmed, 10.4, 10.6) | \_\_\_ |
