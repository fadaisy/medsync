# Pharmacy Phase 3: final report (STOP 10, 25 Oct 2026)

**Branch:** `feat/pharmacy-clinical` (worktree `~/Desktop/medsync-pharmclose`).

**Three merges:**

1. Steps 0–6: content, interactions and interventions.
2. Steps 7–8: stewardship and reactions.
3. Steps 9–10: reconciliation and hardening.

**Migrations:** 0210–0212, owner-applied. **ADRs:** 0390–0395.

## What is built

| Part                                                                                  | Flag                           | Wording                                           | State                            |
| ------------------------------------------------------------------------------------- | ------------------------------ | ------------------------------------------------- | -------------------------------- |
| Clinical content (signed entries, import, sign with attestation)                      | any Phase 3 flag               | `PHARMACY_CLINICAL_COPY`, **signed** 25 Oct       | Built, live at the test hospital |
| Interactions (dialog line, review alerts, notice count)                               | `PHARMACY_INTERACTIONS`        | signed                                            | Built                            |
| Intervention review (codes, outcomes, CSV)                                            | `PHARMACY_INTERVENTION_REVIEW` | signed                                            | Built                            |
| Stewardship (AWaRe figures, reviews due, Reserve, by ward)                            | `PHARMACY_STEWARDSHIP`         | signed                                            | Built; see the limits            |
| Suspected reactions (record, unconfirmed allergy, report, submission)                 | `PHARMACY_REACTIONS`           | signed                                            | Built; see the limits            |
| Reconciliation at discharge (prescriber decisions, pharmacist confirm, patient sheet) | `PHARMACY_RECONCILIATION`      | `PHARMACY_RECONCILIATION_COPY`, **signed** 25 Oct | Built                            |

## Section 13 numbers

| Metric                                                   | Result                                                                                                        |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Alerts fired from unsigned or withdrawn entries          | **0 by construction.** Only in-force entries are read (test). An audit query over pilot data is still to run. |
| Interaction entries in force, by severity                | Not measured: read it on Clinical content after signing.                                                      |
| Queries without a code / answered with a reason          | Not measured: needs pilot data.                                                                               |
| Wards with AWaRe use visible                             | Not met: the ward is not read yet, so all courses show as one row.                                            |
| Antibiotics with no AWaRe decision                       | Listed as unmatched by the import, for the signer.                                                            |
| Reviews due with no answer, oldest                       | Not measured: needs pilot data.                                                                               |
| Discharges with a confirmed list or reason               | Not measured: needs pilot data. Nothing holds a discharge.                                                    |
| Suspected reactions without an unconfirmed allergy entry | **0 by construction:** the same transaction writes both.                                                      |
| Reaction reports with a name, number or address          | **0** (AR-5 test)                                                                                             |
| Allergy entries deleted                                  | **0:** append-only, and nothing deletes.                                                                      |
| Prescription rows written by this slice                  | **0** (Law 2 test and the Step 10 scan)                                                                       |
| Interaction check p95                                    | **Not measured**                                                                                              |
| axe serious or critical                                  | **Not run**                                                                                                   |
| Red added; anything green                                | **0:** a search of the Phase 3 UI files finds no red or green; alerts and due dates use "caution" (amber).    |

## Checks at STOP 10

- typecheck clean;
- lint clean;
- unit tests: 11,226 passed at Step 9, plus 3 hardening tests;
- lanes: `pharmacy-clinical-data`, 7 tests (0210, 0211, 0212, and the reconciliation read against SQL);
- build: green at Step 8. The build no longer type-checks (987ab627); the hook does.

## Definition of Done

**Met:**

- [x] No interaction alert from unsigned or withdrawn content. Shown by test; the audit query waits for the pilot.
- [x] Every suspected reaction goes on the allergy record as unconfirmed with a printed report; none carries a name.
- [x] No action writes a prescription; no allergy entry is deleted.
- [x] Handbook sections (`USER-GUIDE.md`), ADRs, hazard log (`hazard-log.md`) and this report exist.

**Not met:**

- [ ] Interventions coded and answered in the pilot period. Waits for the pilot.
- [ ] AWaRe use by ward, with prompts reaching prescribers. The ward is not read, and there is no doctor-side card.
- [ ] Every discharge has a confirmed list or a reason. Waits for the pilot.
- [ ] axe clean; red and green checks. Not run.
- [ ] Strings as draft. The Phase 3 wording is **signed** by the owner; reconciliation's wording is draft.

## Open, for the next pass

The owner has said the clinical content flow needs reworking.

1. **Flag go-live (S47).** Each flag through Phase 1's go-live page, with its conditions and a second approver. Flags are environment-only today.
2. **Doctor side:**
   - the antibiotic review card and the MAR chip (AM-6);
   - a confirm/refute screen for suspected allergies;
   - reconciliation decisions inside the plan step.
3. **Data not read yet:**
   - the ward, for stewardship;
   - culture release, from lab events;
   - R7 and R9 in reconciliation;
   - the lane reason for an open discrepancy (S46);
   - IX-8, the viewer's class access.
4. **Review screen:** **Supply, with a reason** and **Ask the prescriber** on interaction alerts.
5. **Feedback:** an "Imported" message after an import, and editors for query codes and the PCNE map.
6. **Not run:** axe, the harness plans for boards 3.1–3.8, budgets, and the p95.

## For the owner

1. **Apply 0212.** 0210 and 0211 are already applied:

   ```bash
   cd ~/Desktop/medsync-pharmclose && npm run db:migrate
   ```

2. **Sign the reconciliation wording** (`content/pharmacy-reconciliation.ts`, which includes the patient's sheet). Then sign the **Reconciliation rules** in Clinical content, set `PHARMACY_RECONCILIATION`, and deploy.
3. **Before real patients:** unset `PHARMACY_DEV_HOSPITALS` and `DEV_SKIP_MFA`, and record the six legal answers.
