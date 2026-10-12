# Pharmacy Phase 1 — hazard log

**Status: Step 1 draft for GATE A. Nothing in this log is signed.** It completes the seed in Appendix C of the
[prompt](PROMPT-PHARMACY-PHASE-1.md) (43 hazards) and adds 16 found while reading the repo at Step 0
([STOP-REPORTS.md](STOP-REPORTS.md)) and the design choices in the [GATE A brief](gate-a-brief.md) (D-PH1-41 to 48).
It is completed at Step 9, when every control below exists and its proving test passes. Until then, every
"proving test" is the test this slice will write, named so that Step 3 to Step 9 can be checked against it.

**Who sets the scores.** The severity and likelihood figures are proposals for the Clinical Safety Officer and the
pharmacist reviewer to set. They are not a signed assessment.

## Key

**Severity (S)**

| S   | Word         | Meaning                                                                                                       |
| --- | ------------ | ------------------------------------------------------------------------------------------------------------- |
| 1   | Negligible   | No harm; a record is untidy and is put right                                                                  |
| 2   | Minor        | A record is wrong, or care is briefly delayed; no harm expected                                               |
| 3   | Moderate     | A medicine is missed, delayed or wrongly supplied with possible temporary harm; or one patient's privacy lost |
| 4   | Major        | A wrong medicine, strength or quantity is taken, or a controlled drug is lost, with harm likely               |
| 5   | Catastrophic | Death or permanent harm likely                                                                                |

**Likelihood (L)**, per live dispensing point

| L   | Word           | Meaning                  |
| --- | -------------- | ------------------------ |
| 1   | Very unlikely  | Not expected in years    |
| 2   | Unlikely       | About once a year        |
| 3   | Possible       | About once a month       |
| 4   | Likely         | About once a week        |
| 5   | Almost certain | Daily, or already so now |

**Risk = S × L.** 1–4 low · 5–9 medium · 10–16 high · 20–25 very high. "Initial" is with no control beyond what
Phase 0 already has. "Residual" assumes the control is built, its test passes and the hospital's signed sets are in
force.

**Test words.** `unit` = the pure-engine suite under `tests/pharmacy/phase-1/`; `lane` = the PGlite lane
(`EMR_PGLITE=1 vitest run tests/emr-db`, one connection, so races are proven one transaction after another);
`race` = the real race test (dev Supabase): two postgres-js connections in `tests/rls`, run by the owner; `rls` = the
RLS probe table (Section 7); `harness` = the local harness (PGlite + Next + CDP screenshots + axe), as in Phase 0.
`S1`–`S96` are the scenarios of Section 9. "New:" names a test the prompt does not already ask for.

**Status words.** _Proposed_: a control is designed and a test named. _Proposed, weak_: the control reduces the risk
only a little, and this log says why. _Open_: no control beyond words, or the control sits outside this slice.

## Summary

| #   | Hazard                                                                             | Initial | Residual | Status         |
| --- | ---------------------------------------------------------------------------------- | ------- | -------- | -------------- |
| 01  | A medicine is handed to the wrong patient                                          | 4×3=12  | 4×2=8    | Proposed       |
| 02  | The wrong medicine, strength or form is supplied for a line                        | 4×3=12  | 4×2=8    | Proposed, weak |
| 03  | An expired batch is supplied                                                       | 3×3=9   | 3×1=3    | Proposed       |
| 04  | A supply with no stock movement, or a movement with no supply                      | 2×4=8   | 2×1=2    | Proposed       |
| 05  | Two people supply the last units of one batch at once                              | 2×3=6   | 2×1=2    | Proposed       |
| 06  | One line is supplied twice                                                         | 4×3=12  | 4×2=8    | Proposed       |
| 07  | A high-risk prescription is supplied with no pharmacist having seen it             | 4×3=12  | 4×2=8    | Proposed       |
| 08  | The lane rule is unsigned, mis-set or too wide                                     | 3×3=9   | 3×2=6    | Proposed       |
| 09  | "Supply without a pharmacist" becomes the normal way of working                    | 4×3=12  | 4×2=8    | Proposed, weak |
| 10  | A query never reaches the prescriber, and the pharmacy believes it did             | 3×4=12  | 3×2=6    | Proposed       |
| 11  | A line changed after review or staging is supplied on its old version              | 4×3=12  | 4×1=4    | Proposed       |
| 12  | A prescription awaiting co-signature is supplied                                   | 3×3=9   | 3×1=3    | Proposed       |
| 13  | A line not supplied or declined drops out of sight                                 | 3×4=12  | 3×2=6    | Proposed       |
| 14  | A patient sent to buy outside cannot, and nobody learns of it                      | 3×4=12  | 3×3=9    | Proposed, weak |
| 15  | A patient is told a medicine is waiting, and it is not                             | 2×3=6   | 2×1=2    | Proposed       |
| 16  | The slip is altered, copied or presented alone                                     | 3×2=6   | 3×2=6    | Proposed, weak |
| 17  | A substitution changes the dose taken, or the label's directions                   | 4×2=8   | 4×1=4    | Proposed       |
| 18  | Directions on a label differ from what the prescriber wrote                        | 4×3=12  | 4×1=4    | Proposed       |
| 19  | A typed quantity does not match the course intended                                | 3×4=12  | 3×4=12   | Proposed, weak |
| 20  | A refill date is wrong                                                             | 2×3=6   | 2×1=2    | Proposed       |
| 21  | The prescriber is told the shelf holds a medicine when it does not, or the reverse | 2×4=8   | 2×3=6    | Proposed       |
| 22  | A prescriber stops prescribing a needed medicine because it showed out             | 3×3=9   | 3×2=6    | Proposed       |
| 23  | A controlled drug is supplied without a witness, or one who did not look           | 4×3=12  | 4×2=8    | Proposed, weak |
| 24  | A controlled drug is not treated as controlled                                     | 4×3=12  | 4×1=4    | Proposed       |
| 25  | The controlled-drug record and the statutory register disagree                     | 3×3=9   | 3×2=6    | Proposed       |
| 26  | Staff stop keeping the statutory paper                                             | 3×3=9   | 3×3=9    | Proposed, weak |
| 27  | A stock count is falsified, or an adjustment hides a loss                          | 3×3=9   | 3×2=6    | Proposed, weak |
| 28  | A message reveals a patient's medicine or condition                                | 3×3=9   | 3×1=3    | Proposed       |
| 29  | The identity check is read from the screen, or "another way" becomes routine       | 4×3=12  | 4×2=8    | Proposed, weak |
| 30  | A reversed or corrected supply and the patient's list disagree                     | 2×3=6   | 2×1=2    | Proposed       |
| 31  | A supply against the wrong patient is found days later and cannot be put right     | 3×3=9   | 3×2=6    | Proposed       |
| 32  | A downtime sheet is never entered, or entered twice                                | 3×3=9   | 3×2=6    | Proposed       |
| 33  | A back-entered supply carries the entry time as the supply time                    | 2×4=8   | 2×1=2    | Proposed       |
| 34  | A downtime supply skipped a check, and nobody looks afterwards                     | 4×3=12  | 4×2=8    | Proposed       |
| 35  | A downtime supply against a paper prescription MedSync never sees                  | 3×3=9   | 3×2=6    | Proposed       |
| 36  | A pharmacy technician is shown, recorded or printed as a pharmacist                | 2×3=6   | 2×1=2    | Proposed       |
| 37  | One person signs the content, approves the switch and reviews the audit            | 3×5=15  | 3×4=12   | Proposed, weak |
| 38  | A point goes live before its stock is counted                                      | 2×3=6   | 2×1=2    | Proposed       |
| 39  | On go-live day the queue fills with old prescriptions                              | 2×4=8   | 2×1=2    | Proposed       |
| 40  | A point is switched off and its open lines are stranded                            | 3×2=6   | 3×1=3    | Proposed       |
| 41  | A known interaction is missed because staff assume MedSync checks                  | 4×3=12  | 4×3=12   | **Open**       |
| 42  | An inpatient's first dose is delayed waiting for pharmacy review                   | 4×2=8   | 4×1=4    | Proposed       |
| 43  | A patient with no date of birth and no phone on file is turned away                | 3×2=6   | 3×1=3    | Proposed       |
| 44  | The new prescriber cancel cancels the wrong line, or one it should not             | 4×2=8   | 4×1=4    | Proposed       |
| 45  | A "change" places the new line but leaves the old one active                       | 4×3=12  | 4×2=8    | Proposed       |
| 46  | A change made outside a query loses the link to the old line                       | 3×3=9   | 3×2=6    | Proposed, weak |
| 47  | A line not continued at visit close is supplied, or a continued line is dropped    | 4×3=12  | 4×1=4    | Proposed       |
| 48  | An admission medicine is stopped but its prescription stays active                 | 4×3=12  | 4×3=12   | **Open**       |
| 49  | The doctor's print carries cancelled and completed lines                           | 3×3=9   | 3×2=6    | **Open**       |
| 50  | "Changed since printing" cannot be computed                                        | 4×3=12  | 4×3=12   | **Open**       |
| 51  | Generalising downtime changes the lab's behaviour, or mixes the workspaces         | 3×2=6   | 3×1=3    | Proposed       |
| 52  | A stale acting point writes events at the wrong point                              | 2×3=6   | 2×1=2    | Proposed       |
| 53  | The second-person attestation leaks a secret, is brute-forced or replayed          | 4×2=8   | 4×1=4    | Proposed       |
| 54  | The identity check is used to discover a patient's date of birth or phone          | 3×2=6   | 3×2=6    | Proposed, weak |
| 55  | A stale or never-counted point gives a misleading stock answer or stock-out        | 2×3=6   | 2×2=4    | Proposed       |
| 56  | The stock-answer snapshot fails and takes the prescription down with it            | 4×2=8   | 4×1=4    | Proposed       |
| 57  | Signed content is altered after signature, or a retired version acts               | 4×2=8   | 4×1=4    | Proposed       |
| 58  | Generalising the template store changes NCD sending or weakens the scan            | 3×2=6   | 3×1=3    | Proposed       |
| 59  | A paper prescription is transcribed wrongly at back-entry                          | 4×3=12  | 4×2=8    | Proposed, weak |

High residuals (10 or more): 19, 37, 41, 48, 50. Medium residuals (5–9): 01, 02, 06, 07, 08, 09, 10, 13, 14, 16, 21,
22, 23, 25, 26, 27, 29, 31, 32, 34, 35, 45, 46, 49, 54, 59.

---

## Hazards from Appendix C

### HZ-PH1-01 A medicine is handed to the wrong patient

| Field         | Entry                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cause         | Similar names at a busy window; a representative collects; the supplier reads details out from the screen                                                                                                                                                                                                                                                                                                                                                |
| Effect        | Patient: one patient takes another's medicine, the other goes without. Record: a supply against the wrong patient                                                                                                                                                                                                                                                                                                                                        |
| Control       | Law 6; SU-4 (full name attested, then date of birth or phone typed and compared on the server, never sent to the client; five wrong tries close the typed check; "identified another way" stored, listed and counted); SU-5 (collector recorded); SU-2 refuses a hand-over without it; D-PH1-16 (the MedSync number does not count); D-PH1-02 ward-staff route; Section 10 (the identity section never exposes the stored value to assistive technology) |
| Proving test  | unit SU-4 (normalising spaces, date and phone formats; the fifth wrong try closes the check); lane `pharmacy-supply` S36, S37, S55; rls "no stored date of birth or phone number returned" for every pharmacy read; harness S36 (the identity section's DOM and accessible tree carry neither value)                                                                                                                                                     |
| Residual risk | The first identifier is the supplier's word. The ward-staff route asks no typed identifier. "Identified another way" is counted, not capped (see HZ-PH1-29)                                                                                                                                                                                                                                                                                              |
| S×L           | Initial 4×3=12 · residual 4×2=8                                                                                                                                                                                                                                                                                                                                                                                                                          |

### HZ-PH1-02 The wrong medicine, strength or form is supplied for a line

| Field         | Entry                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cause         | A product linked to the wrong medicine; the wrong box taken from the shelf; strengths that share one catalogue id                                                                                                                                                                                                                                                                                                                                                      |
| Effect        | Patient: the wrong medicine or strength is taken. Record: the supply names a product that does not match the line                                                                                                                                                                                                                                                                                                                                                      |
| Control       | CT-1 (one medicine list, the catalogue's stable ids); CT-2 (a product belongs to one medicine); CT-4 and E-PH1-05 (no conversion; a different unit is a new product); 5.3.1 (the picker offers only products of the prescribed medicine); SU-2 (the product belongs to the prescribed medicine, or SU-8 applies); AV-9 (exact match); "Added at the window" products marked for the pharmacy in charge to check; label and record carry the product as supplied (LB-1) |
| Proving test  | unit CT-2, CT-4, SU-2 (product of another medicine refused); lane `pharmacy-supply` S48; lane `pharmacy-stock` S7, S8. New: `pharmacy-supply` "a product of another medicine is refused at hand-over, including by a forged call"                                                                                                                                                                                                                                      |
| Residual risk | **Weak on strength.** Step 0 (Q6): the catalogue has no strength field; strength sits on regimens or in the name, and fluids alone have one id per strength. A product of the wrong strength linked to the right catalogue id passes every check above. Picking the wrong box is not detectable (no scanning, Section 15). See the missing controls at the end                                                                                                         |
| S×L           | Initial 4×3=12 · residual 4×2=8                                                                                                                                                                                                                                                                                                                                                                                                                                        |

### HZ-PH1-03 An expired batch is supplied

| Field         | Entry                                                                                                                                                                                                                                                                                  |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cause         | An expired batch is still on the shelf and in the record; a month-only expiry read as the first of the month; server date used instead of hospital-local date                                                                                                                          |
| Effect        | Patient: an expired medicine is taken. Record: availability counts stock that cannot be used                                                                                                                                                                                           |
| Control       | SL-5 (expired against the hospital-local date; a month expiry ends at month end; never offered, never counted); SU-2 (unexpired batch required); SU-3 (first expiry skips expired batches); 5.3.1 (listed as "Expired … Remove it" in amber); DT-10 flags a back-entered expired batch |
| Proving test  | unit SL-5 (month-only expiry; the local-midnight boundary), SU-3 (expired first batch); lane `pharmacy-stock` S4; lane `pharmacy-downtime` S74                                                                                                                                         |
| Residual risk | The expiry is typed by hand at receipt; a mistyped expiry is caught only by a person (SL-11, S11)                                                                                                                                                                                      |
| S×L           | Initial 3×3=9 · residual 3×1=3                                                                                                                                                                                                                                                         |

### HZ-PH1-04 A supply is recorded and no stock leaves the ledger, or stock leaves with no supply

| Field         | Entry                                                                                                                                                                                                                                                                                             |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cause         | The supply and the movement written in separate statements; a crash between them; a movement written by another path                                                                                                                                                                              |
| Effect        | Record: the balance is wrong, the stock answer misleads, a loss is hidden                                                                                                                                                                                                                         |
| Control       | Law 3; SU-1 (one transaction: supply, movement, outcome, hand-over); SL-1 (append-only ledger by trigger); SL-8 (every movement names its source event); SL-10 (property: no `supplied` movement without a supply, and none in reverse); one SECURITY DEFINER function per supply (STOP 0 item 4) |
| Proving test  | unit SL-10 property; Step 3 "injected failure after the supply row and before the movement: neither exists"; lane `pharmacy-supply` S35; lane `pharmacy-stock` S5 (the transfer equivalent); rls append-only proof including the service-role path                                                |
| Residual risk | Low                                                                                                                                                                                                                                                                                               |
| S×L           | Initial 2×4=8 · residual 2×1=2                                                                                                                                                                                                                                                                    |

### HZ-PH1-05 Two people supply the last units of one batch at the same moment

| Field         | Entry                                                                                                                                                                                                                                                                         |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cause         | Two hand-overs read the same balance before either writes                                                                                                                                                                                                                     |
| Effect        | Record: the batch goes below zero; one patient is told they have a medicine the shelf cannot give                                                                                                                                                                             |
| Control       | SL-4 (check and write under a row lock on the batch); SU-2 (batch holds the quantity); the balance guard trigger (owner's answer to STOP 0 item 4); E-PH1-03 (nothing is held, so the lock at hand-over is the only arbiter); 5.6 ("Batch {no} now holds {n}. Choose again.") |
| Proving test  | lane `pharmacy-supply` S42 (sequential refusal); unit SL-10 property; **race** "concurrent supplies of the last units: exactly one succeeds" (Step 3)                                                                                                                         |
| Residual risk | The true two-connection proof runs only when the owner runs the race test on dev Supabase; the PGlite lane proves the refusal one transaction after another                                                                                                                   |
| S×L           | Initial 2×3=6 · residual 2×1=2                                                                                                                                                                                                                                                |

### HZ-PH1-06 One line is supplied twice: at two points, or once on screen and once from a downtime sheet

| Field         | Entry                                                                                                                                                                                                                                                                                                                                                                                    |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cause         | Two points open the same prescription; a double tap; a sheet row entered for a line also supplied live                                                                                                                                                                                                                                                                                   |
| Effect        | Patient: a double quantity is taken home. Record: stock leaves twice                                                                                                                                                                                                                                                                                                                     |
| Control       | Law 10; SU-2 (row lock on each line: the line must be at `ready`, or the quantity no more than what is left); SU-10 (client key: a double tap writes one); LO-9 (quantities supplied never exceed what was decided); DT-10 (a back-entered row for a line that already has a supply is recorded and flagged "may be a double supply"); 5.6 ("… was already supplied at {point}, {time}") |
| Proving test  | lane `pharmacy-supply` S43, S45, S40 (a quantity above what is owed is refused); **race** "two hand-overs of the same line at two points with different batches: exactly one succeeds"; unit LO-9 property; lane `pharmacy-downtime` S74                                                                                                                                                 |
| Residual risk | Downtime against live is caught only after the medicine has gone. STOP 0 item 4 proposed a unique index on (line, line version) for supplies: it would refuse SU-3's split across batches and a later supply of what was owed (S38, S40), so the guard must be quantity-based under the line lock (see the missing controls)                                                             |
| S×L           | Initial 4×3=12 · residual 4×2=8                                                                                                                                                                                                                                                                                                                                                          |

### HZ-PH1-07 A high-risk prescription is supplied with no pharmacist having seen it

| Field         | Entry                                                                                                                                                                                                                                                                                                                                                             |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cause         | No lane rule fires; a pharmacy technician supplies; a forged call skips acceptance                                                                                                                                                                                                                                                                                |
| Effect        | Patient: a dangerous prescription error is not caught before the medicine is taken                                                                                                                                                                                                                                                                                |
| Control       | LN-2 (any matching active line makes the whole prescription pharmacist-first); LN-4 (no signed rule: everything pharmacist-first); LN-5 (controlled is always pharmacist-first); PA2-2 (`pharmacy.review` to the Pharmacist cadre only); RQ-1; SU-2 (acceptance of that version, or D-PH1-05's reason); Section 8 (`recordNotSupplied` refused before acceptance) |
| Proving test  | lane `pharmacy-review` S12, S13 (forged `acceptLine` and `recordNotSupplied` refused), S14; lane `pharmacy-supply` S54; unit LN-2, LN-4, LN-5                                                                                                                                                                                                                     |
| Residual risk | The lane reads only stored facts (LN-3). Step 0 (Q7): the renal check leaves no trace when a creatinine was on record; no high-risk list is signed (D-PH1-29), so that reason does not fire; "typed dose" is off (D-PH1-04). A risky prescription with none of the stored facts goes to the standard lane, checked at supply (D-PH1-06)                           |
| S×L           | Initial 4×3=12 · residual 4×2=8                                                                                                                                                                                                                                                                                                                                   |

### HZ-PH1-08 The lane rule is unsigned, mis-set or too wide

| Field         | Entry                                                                                                                                                                                                                                                                                                                              |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cause         | No signed rule; a reason switched on that catches almost everything; a rule edited after it was signed                                                                                                                                                                                                                             |
| Effect        | Patient: the pharmacist-first lane is ignored (too wide, everyone waits, staff route round it) or high-risk prescriptions go standard (too narrow). Record: the lane cannot be explained afterwards                                                                                                                                |
| Control       | LN-1 (signed, versioned, per hospital); LN-4 (unsigned: every prescription pharmacist-first, and the queue says so); LN-7 (lane, reasons and rule version snapshotted on first event); RD-1 (no go-live without a signed rule); D-PH1-04 (each reason switched on with Q7's counts in hand); D-PH1-43 (only `signed` content acts) |
| Proving test  | lane `pharmacy-review` S12; unit LN-1, LN-4, LN-7 (a later rule change never rewrites a snapshot); lane `pharmacy-golive` S79                                                                                                                                                                                                      |
| Residual risk | Q7's counts (owner SQL B) are not yet returned, so how wide each reason is remains unknown at GATE A                                                                                                                                                                                                                               |
| S×L           | Initial 3×3=9 · residual 3×2=6                                                                                                                                                                                                                                                                                                     |

### HZ-PH1-09 "Supply without a pharmacist" becomes the normal way of working

| Field         | Entry                                                                                                                                                                                                                                                                      |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cause         | Too few pharmacists; the exception is quicker than waiting                                                                                                                                                                                                                 |
| Effect        | Patient: pharmacist-first prescriptions are supplied unreviewed. Record: the look-back list grows and is never cleared                                                                                                                                                     |
| Control       | D-PH1-05 (off by default; on only with legal question 1 answered and a second approver); RQ-12; a signed reason list; every such supply on the look-back list until a pharmacist looks; CD-4 (never for a controlled line); Section 13 counts look-backs older than 7 days |
| Proving test  | lane `pharmacy-supply` S54; lane `pharmacy-golive` S80 (setting refused without the legal answer and a second approver); unit RQ-12                                                                                                                                        |
| Residual risk | **Weak.** There is no presence signal (Step 0 Q21), so 5.3's "not offered while a pharmacist is present" cannot be built; the control is the reason and the look-back. Nothing caps how often the exception is used                                                        |
| S×L           | Initial 4×3=12 · residual 4×2=8                                                                                                                                                                                                                                            |

### HZ-PH1-10 A pharmacist's query never reaches the prescriber, and the pharmacy believes it did

| Field         | Entry                                                                                                                                                                                                                                                                                                                                                     |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cause         | Realtime or network failure; no recipient resolvable; the prescriber is offline                                                                                                                                                                                                                                                                           |
| Effect        | Patient: waits at the window, or leaves without the medicine; the problem the pharmacist saw is never fixed                                                                                                                                                                                                                                               |
| Control       | Law 11; RQ-2 (`notified` with outcome); RQ-3 (no recipient: created `not_sent`, "Call the ward or clinic"); RQ-8 (`seen` never shown as an answer); RQ-10 (delivery never throws; no escalation by decision); D-PH1-47 (`user:<id>` topic, PHI-free, 15 s polling fallback); 5.4 wording: "Query sent … not answered", "The prescriber has NOT been told" |
| Proving test  | lane `pharmacy-review` S20, S21; harness S15 (the timing budget); unit RQ-3, RQ-8, RQ-10                                                                                                                                                                                                                                                                  |
| Residual risk | Delivered is not read. With no escalation, an unanswered query depends on the pharmacy calling                                                                                                                                                                                                                                                            |
| S×L           | Initial 3×4=12 · residual 3×2=6                                                                                                                                                                                                                                                                                                                           |

### HZ-PH1-11 A prescriber changes a line after it was reviewed or staged, and the old version is supplied

| Field         | Entry                                                                                                                                                                                                                                                                                                                             |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cause         | The screen was open while the prescriber changed the line; a staged decision is reused                                                                                                                                                                                                                                            |
| Effect        | Patient: takes the medicine the prescriber replaced                                                                                                                                                                                                                                                                               |
| Control       | A line version is the prescription row id (owner's answer, STOP 0 item 5); D-PH1-41 (a change is a new line and a cancel of the old); RQ-9 (a change voids acceptances and staged decisions in both lanes); SU-2 (the current version is the one decided on); LN-8; 5.3 ("Changed by the prescriber at {time}. Review it again.") |
| Proving test  | lane `pharmacy-review` S17; lane `pharmacy-supply` S44; unit RQ-9, LN-8, SU-2 (version check)                                                                                                                                                                                                                                     |
| Residual risk | Depends on D-PH1-41. Under its alternative (no prescriber change path), a "change" is a phone call and the old line stays active until co-sign withdrawal or visit close; see HZ-PH1-45 to 47                                                                                                                                     |
| S×L           | Initial 4×3=12 · residual 4×1=4                                                                                                                                                                                                                                                                                                   |

### HZ-PH1-12 A prescription awaiting co-signature is supplied

| Field         | Entry                                                                                                                                                                                                        |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Cause         | The pharmacy reads the row's `state` alone; Step 0 (Q3) found a withheld co-sign is computed on read and the row is not changed                                                                              |
| Effect        | Patient: takes a medicine a senior has not approved                                                                                                                                                          |
| Control       | Law 10; LO-4 (`awaiting_cosign` has no supply decision); SU-2 (co-signed where needed, and not cancelled); 5.2 ("Cannot be supplied yet"); DT-10 flags a back-entered row that was awaiting co-signature     |
| Proving test  | lane `pharmacy-review` S28; lane `pharmacy-supply` S46. New: unit "the pharmacy's co-sign state uses the same computation as prescribing" (a fixture whose co-sign is withheld, with the row still `active`) |
| Residual risk | Low                                                                                                                                                                                                          |
| S×L           | Initial 3×3=9 · residual 3×1=3                                                                                                                                                                               |

### HZ-PH1-13 A line that was not supplied or was declined drops out of sight, and the patient goes without

| Field         | Entry                                                                                                                                                                                                                                                              |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Cause         | A filter or a time-out removes it; nobody tells the prescriber                                                                                                                                                                                                     |
| Effect        | Patient: misses a needed medicine with nobody aware                                                                                                                                                                                                                |
| Control       | Law 4; LO-3 (in the queue until every line has an outcome); LO-5 (nothing moves with time); LO-9; Open lines; RQ-11 (a not-supplied notice to the prescriber); LO-7 and D-PH1-10 (declining tells the prescriber); D-PH1-12 (a person closes, with a reason); ML-2 |
| Proving test  | lane `pharmacy-review` S24, S29, S30; unit LO-5 (30-day clock), LO-9 property; Section 13 "lines that left the queue without an outcome"                                                                                                                           |
| Residual risk | The prescriber sees the notice only on opening the plan; the patient hears only what the window tells them when SMS and the list are off                                                                                                                           |
| S×L           | Initial 3×4=12 · residual 3×2=6                                                                                                                                                                                                                                    |

### HZ-PH1-14 A patient sent to buy outside cannot get the medicine, and nobody learns of it

| Field         | Entry                                                                                                                                                                  |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cause         | No outside stock; cost; the patient does not return                                                                                                                    |
| Effect        | Patient: goes without                                                                                                                                                  |
| Control       | LO-2 (`buying_outside` stays open until confirmed or closed); Open lines; ML-4 ("I could not get it" keeps the line open, marks it and tells the prescriber); D-PH1-32 |
| Proving test  | lane `pharmacy-review` S25, S26; lane `pharmacy-patient-list` S91                                                                                                      |
| Residual risk | **Weak.** ML-4 is Step 9, which GATE A may defer (D-PH1-40); then only a returning patient or a phone call tells anyone. An open line is a list, not a follow-up       |
| S×L           | Initial 3×4=12 · residual 3×3=9 (3×4=12 if Step 9 is deferred)                                                                                                         |

### HZ-PH1-15 A patient is told a medicine is waiting for them, and it is not

| Field         | Entry                                                                                                                                                                                                          |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cause         | A message promises a held item; the last units go to another patient before they arrive                                                                                                                        |
| Effect        | Patient: a wasted journey; trust lost                                                                                                                                                                          |
| Control       | E-PH1-03 (nothing is held); D-PH1-31 (nothing tells a patient a medicine is held); MS-4 (the "in stock today" message only by a person, only while on the shelf); 5.11 (it promises nothing more); 5.5 wording |
| Proving test  | lane `pharmacy-patient-list` S94; unit MS-4; the banned-term and copy scans over the three templates (S93)                                                                                                     |
| Residual risk | Stock can still go between the message and the visit; the wording says "in stock today", not "kept for you"                                                                                                    |
| S×L           | Initial 2×3=6 · residual 2×1=2                                                                                                                                                                                 |

### HZ-PH1-16 The slip is used to obtain medicines it should not: altered, copied or presented alone

| Field         | Entry                                                                                                                                                                                                                                                                                 |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cause         | A plain A5 print is easy to change or copy                                                                                                                                                                                                                                            |
| Effect        | Patient or others: medicines obtained without a valid prescription; a medicine supplied twice outside                                                                                                                                                                                 |
| Control       | LB-5 (only `buying_outside` lines; never a controlled line); LB-6 (random verification code, resolves only for this hospital's pharmacy staff); D-PH1-13 ("Give this to the pharmacy together with your signed prescription"); copy count printed and every print logged (LB-4); CD-4 |
| Proving test  | lane `pharmacy-review` S25 (code resolves here, "no prescription" elsewhere), S26; lane `pharmacy-supply` S41; unit LB-5, LB-6; lane `pharmacy-controlled` S60                                                                                                                        |
| Residual risk | **Weak.** Paper is forgeable and an outside pharmacy may not call. Legal question 5 is unanswered, so whether the slip lets another pharmacy supply is not settled                                                                                                                    |
| S×L           | Initial 3×2=6 · residual 3×2=6                                                                                                                                                                                                                                                        |

### HZ-PH1-17 A substitution changes the dose the patient takes, or the label carries directions for a different strength

| Field         | Entry                                                                                                                                                                                                                                                                                                                            |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cause         | A different strength supplied with the original directions                                                                                                                                                                                                                                                                       |
| Effect        | Patient: takes a multiple or a fraction of the intended dose                                                                                                                                                                                                                                                                     |
| Control       | SU-8 and D-PH1-14 (a different strength only by a pharmacist, under the signed rule, with a reason and the pharmacist's own typed line, shown side by side, printed marked "From the pharmacist"; the prescriber informed); Law 7 and CT-4 (the system computes nothing); Appendix D (unsigned rule: no strength change offered) |
| Proving test  | lane `pharmacy-supply` S48; unit SU-8; Step 3 byte-equality test (the pharmacist's line on screen, label and list)                                                                                                                                                                                                               |
| Residual risk | The pharmacist's line is human arithmetic, and the prescriber learns after supply. The cautious alternative in D-PH1-14 (no strength change in this slice) removes this hazard                                                                                                                                                   |
| S×L           | Initial 4×2=8 · residual 4×1=4                                                                                                                                                                                                                                                                                                   |

### HZ-PH1-18 Directions on a label differ from what the prescriber wrote

| Field         | Entry                                                                                                                                                                                                                       |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cause         | Reformatting, trimming, unit conversion, "plain words" built by guess                                                                                                                                                       |
| Effect        | Patient: takes the medicine differently from the prescription                                                                                                                                                               |
| Control       | Law 7; LB-2 (directions byte for byte; plain words only from a signed template); D-PH1-18 (no plain words ship); LB-3 (warning lines only from signed lists); 5.6 (nothing typed onto a label except the pharmacist's line) |
| Proving test  | Step 3 byte-equality test on screen, label and slip (mixed units, trailing spaces, a decimal comma); lane `pharmacy-supply` S47; Section 13 "directions shown or printed differently"                                       |
| Residual risk | Byte equality keeps an unclear direction unclear (EMR-sheet lines are free text, Step 0 Q3). In "written by hand" label mode the copy is the supplier's, and is not checked                                                 |
| S×L           | Initial 4×3=12 · residual 4×1=4                                                                                                                                                                                             |

### HZ-PH1-19 A dispenser types a quantity that does not match the course intended, because the prescription carries no quantity

| Field         | Entry                                                                                                                                                                                                                                                                                                           |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cause         | Step 0 (Q3): **no structured quantity exists on any prescription line.** Plan lines carry a frequency code and a course code; EMR-sheet lines carry free text; the dispenser works the quantity out in their head                                                                                               |
| Effect        | Patient: too little (runs out, course incomplete) or too much (a larger supply at home than intended)                                                                                                                                                                                                           |
| Control       | SU-6 (never derived from the dose text, frequency or duration); D-PH1-15 (the dispenser types it; structured quantity is its own prescribing slice); the quantity field's accessible name includes the medicine and issue unit (Section 10); a pharmacist sees the line first only in the pharmacist-first lane |
| Proving test  | lane `pharmacy-supply` S49 (empty and required; nothing pre-filled); unit SU-6                                                                                                                                                                                                                                  |
| Residual risk | **Weak: the system cannot check the number typed**, and this slice may not change prescribing. The control prevents a wrong number from the system; it does nothing about a wrong number from a person. Residual likelihood is unchanged                                                                        |
| S×L           | Initial 3×4=12 · residual 3×4=12                                                                                                                                                                                                                                                                                |

### HZ-PH1-20 A refill date is wrong, and a patient on long-term treatment runs out or is chased for nothing

| Field         | Entry                                                                                                                                                                             |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cause         | A date estimated from text, or from a part supply                                                                                                                                 |
| Effect        | Patient: runs out before coming back, or is recalled early                                                                                                                        |
| Control       | ML-3 and D-PH1-30 (a date only from typed days covered, or a structured duration supplied in full; "around {date}"; otherwise none); ML-5 (refill status from supply events only) |
| Proving test  | lane `pharmacy-patient-list` S90, S92; unit ML-3 (part supply gives no date; free-text duration gives no date)                                                                    |
| Residual risk | Days covered are typed by hand. Step 9 is deferrable, so the date may not exist at all                                                                                            |
| S×L           | Initial 2×3=6 · residual 2×1=2                                                                                                                                                    |

### HZ-PH1-21 The prescriber is told a medicine is on the shelf when it is not, or the reverse

| Field         | Entry                                                                                                                                                                                                                                                                                                           |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cause         | The ledger drifts from the shelf between counts (unrecorded loss, a supply on paper not yet entered); the wrong point answers                                                                                                                                                                                   |
| Effect        | Patient: sent to a window with nothing for them, or given a different medicine for no reason                                                                                                                                                                                                                    |
| Control       | AV-2 (the point whose `serves` matches); AV-3 order (`not_counted` before `out`, `low`, `in_stock`); AV-4 ("Counted {when}" only from a count); AV-8 (what was shown is stored); AV-9 (exact match); E-PH1-03; D-PH1-22 (no state is a Stop); D-PH1-44 (stored in `check_answers` and `pharmacy_stock_answers`) |
| Proving test  | lane `pharmacy-stock-answer` S84, S85, S87; unit AV-1 to AV-9 (every state, every pair, and no quantity leaves the function)                                                                                                                                                                                    |
| Residual risk | Count freshness is unset by default (D-PH1-23), so a count never goes stale until the in-charge sets one; see HZ-PH1-55                                                                                                                                                                                         |
| S×L           | Initial 2×4=8 · residual 2×3=6                                                                                                                                                                                                                                                                                  |

### HZ-PH1-22 A prescriber stops prescribing a needed medicine because the screen said it was out

| Field         | Entry                                                                                                                                                                                         |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cause         | The stock answer is read as "not allowed"                                                                                                                                                     |
| Effect        | Patient: a second-choice medicine, or none                                                                                                                                                    |
| Control       | Law 10; AV-7 (never blocks placing); D-PH1-22 (Check at most, "Aware; prescribe anyway"); AV-5 (other points that hold it are named); the buy-outside route; 5.10 (no suggested alternatives) |
| Proving test  | lane `pharmacy-stock-answer` S85, S86, S88; unit AV-7                                                                                                                                         |
| Residual risk | Behaviour, not software: the answer will change some choices. Its level and wording are signed by the CSO                                                                                     |
| S×L           | Initial 3×3=9 · residual 3×2=6                                                                                                                                                                |

### HZ-PH1-23 A controlled drug is supplied without a witness, or with a witness who did not look

| Field         | Entry                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cause         | Step 0 (Q9): **no witness anywhere in MedSync proves who they are** (resus takes a typed name); a busy colleague confirms without watching                                                                                                                                                                                                                                                                                      |
| Effect        | Patient or others: diversion or a count error goes unseen. Record: a witnessed entry that was not witnessed                                                                                                                                                                                                                                                                                                                     |
| Control       | CD-2 (witness on the signed list, a different user, authenticated with their own factor); CD-3 (witness first; the count committed before MedSync's figure is shown); PA2-6 and D-PH1-27; **D-PH1-42** (the witness's password and TOTP re-checked on a throwaway client that never touches the active session; `witness_user_id`, method and time recorded; five failures lock it); the witness's own agreement sentence (5.9) |
| Proving test  | lane `pharmacy-controlled` S57, S58 (self-witness refused; the supplier's own factor refused), S59, S62, S63; unit PA2-6. New: unit `lib/auth/attest.ts` "the active session's cookies are unchanged after an attestation"                                                                                                                                                                                                      |
| Residual risk | **Weak, and dependent on D-PH1-42.** If GATE A takes the alternative (the witness confirms from their own device within a window), the proof is weaker and S58 must change. No system can prove a witness looked                                                                                                                                                                                                                |
| S×L           | Initial 4×3=12 · residual 4×2=8                                                                                                                                                                                                                                                                                                                                                                                                 |

### HZ-PH1-24 A controlled drug is not treated as controlled, because prescribing did not flag it

| Field         | Entry                                                                                                                                                                                                            |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cause         | Step 0 (Q6): `controlled` is a draft flag on 8 catalogue drugs, not a signed class                                                                                                                               |
| Effect        | Patient or others: a controlled medicine goes through the standard lane with no witness or count                                                                                                                 |
| Control       | CD-1 (controlled if the prescription is flagged **or** the medicine has a signed class); RD-1 (a signed decision, "not controlled" included, for every medicine the point stocks before go-live); D-PH1-28; LN-5 |
| Proving test  | lane `pharmacy-controlled` S61 (a signed-controlled medicine that prescribing does not flag takes the full path); lane `pharmacy-golive` S79; unit CD-1                                                          |
| Residual risk | Low once the decisions are signed; it rests on the pharmacist reviewer's reading of the schedules (Appendix E question 4)                                                                                        |
| S×L           | Initial 4×3=12 · residual 4×1=4                                                                                                                                                                                  |

### HZ-PH1-25 The controlled-drug record and the statutory register disagree

| Field         | Entry                                                                                                                                                                                                                                                                                   |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cause         | One record is written and the other not; transcription error; back-entry                                                                                                                                                                                                                |
| Effect        | Record: two balances, neither trusted; a loss cannot be traced                                                                                                                                                                                                                          |
| Control       | CD-3 (witnessed count; a difference recorded with both figures and listed for the in-charge); CD-6 (the page's running balance equals `balance()` at every row); LB-7 (a register slip to copy from); DT-8 (back-entered controlled supplies confirmed against the register, witnessed) |
| Proving test  | lane `pharmacy-controlled` S59, S62, S66; lane `pharmacy-downtime` S75; unit CD-6                                                                                                                                                                                                       |
| Residual risk | MedSync never reads the register; the two are reconciled by people                                                                                                                                                                                                                      |
| S×L           | Initial 3×3=9 · residual 3×2=6                                                                                                                                                                                                                                                          |

### HZ-PH1-26 Staff stop keeping the statutory paper because MedSync has a record

| Field         | Entry                                                                                                                                                                                                                                                       |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cause         | A complete-looking screen makes the books feel redundant                                                                                                                                                                                                    |
| Effect        | Record: the legal record is lost; the hospital is out of step with the Act                                                                                                                                                                                  |
| Control       | Law 9; CD-7 (nothing marks the paper done); the non-dismissible notice (5.9, signed copy); both paper attestations each time; LB-7's heading "This is not the register"; Section 13 metric "screens that say or imply MedSync replaces the statutory paper" |
| Proving test  | lane `pharmacy-controlled` S57 (refused without either attestation), S66. New: unit copy scan "no string says or implies the paper is replaced"                                                                                                             |
| Residual risk | **Wording only.** The attestations record what the supplier said; nothing checks the paper. Legal questions 2 and 3 are open                                                                                                                                |
| S×L           | Initial 3×3=9 · residual 3×3=9                                                                                                                                                                                                                              |

### HZ-PH1-27 A stock count is falsified, or an adjustment hides a loss

| Field         | Entry                                                                                                                                                                                                                                                                   |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cause         | The counter types the expected figure; a loss written off as "damaged"                                                                                                                                                                                                  |
| Effect        | Record: diversion is hidden; stock answers are wrong                                                                                                                                                                                                                    |
| Control       | SL-6 and D-PH1-24 (blind count; a difference is a correction with a reason); SL-1 (append-only); 5.8 (no adjustment without a reason); Section 12 (each count, adjustment and reversal visible to the in-charge with who did it); CD-3 and CD-5 (controlled: witnessed) |
| Proving test  | lane `pharmacy-stock` S2, S3, S9; lane `pharmacy-controlled` S62; unit SL-6 (the expected figure is not in the count form's payload)                                                                                                                                    |
| Residual risk | **Weak for non-controlled stock:** one person may count and adjust with no second person; collusion is not detectable                                                                                                                                                   |
| S×L           | Initial 3×3=9 · residual 3×2=6                                                                                                                                                                                                                                          |

### HZ-PH1-28 A message reveals a patient's medicine or condition, through its text or through the name of a hospital, clinic or dispensing point

| Field         | Entry                                                                                                                                                                                                                                                                   |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cause         | Template wording; a hospital name that names a condition                                                                                                                                                                                                                |
| Effect        | Patient: privacy lost to whoever sees the phone                                                                                                                                                                                                                         |
| Control       | Law 12; MS-1 (renderers take kind, message name and phone only); MS-2 (banned-term scan in CI with fixtures that must fail); MS-3; D-PH1-31; D-PH1-39 (a signed neutral message name); RD-4; D-PH1-48 (the generalised store keeps its two-approver CHECK and the scan) |
| Proving test  | unit MS-1, MS-2 (a medicine, a clinic and a dispensing-point name each fail); lane `pharmacy-patient-list` S93, S95, S96                                                                                                                                                |
| Residual risk | Low                                                                                                                                                                                                                                                                     |
| S×L           | Initial 3×3=9 · residual 3×1=3                                                                                                                                                                                                                                          |

### HZ-PH1-29 The identity check is passed by reading from the screen, or "identified another way" becomes routine

| Field         | Entry                                                                                                                                                                                                                                                                                |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Cause         | Values visible on screen or paper; the typed check is slower than the other route                                                                                                                                                                                                    |
| Effect        | Patient: HZ-PH1-01 again, with a record that says identity was confirmed                                                                                                                                                                                                             |
| Control       | SU-4 and Section 12 (stored values never reach a pharmacy client); D-PH1-16 (the MedSync number does not count); 5.6 signed wording ("Ask the person to say them; do not read them out"); "another way" listed for the in-charge, filterable in Supplied today and counted at Step 9 |
| Proving test  | lane `pharmacy-supply` S36; rls probe on every pharmacy read; harness S36. New: lane "the queue, review and hand-over payloads carry no date of birth or phone"                                                                                                                      |
| Residual risk | **Weak on routine use:** "another way" is listed and counted, never capped or reviewed by a second person. The full name is on screen, so the first identifier proves little                                                                                                         |
| S×L           | Initial 4×3=12 · residual 4×2=8                                                                                                                                                                                                                                                      |

### HZ-PH1-30 A supply is reversed or corrected and the patient's list still shows the medicine, or the reverse

| Field         | Entry                                                                                                                                                                                                                        |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cause         | The list entry is written or withdrawn outside the supply's transaction                                                                                                                                                      |
| Effect        | Patient: believes they hold a medicine they do not, or the reverse                                                                                                                                                           |
| Control       | SU-1 (list entries in the hand-over transaction); SU-11, SU-14 and ML-6 (reversal and correction withdraw the entry); the tracker's own contract (Step 0 Q13: `self_medications.source_prescription_id`, unique per patient) |
| Proving test  | lane `pharmacy-supply` S51, S52; lane `pharmacy-patient-list` S90. New: lane "a line reversed, then supplied again, writes one list entry" (the uniqueness on `source_prescription_id` must not refuse the second supply)    |
| Residual risk | Low; Step 9 may be deferred, in which case there is no list entry to go wrong                                                                                                                                                |
| S×L           | Initial 2×3=6 · residual 2×1=2                                                                                                                                                                                               |

### HZ-PH1-31 A supply recorded against the wrong patient is found days later and cannot be put right

| Field         | Entry                                                                                                                                                                                                                                |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Cause         | Reversal is same-day only; append-only events cannot be edited                                                                                                                                                                       |
| Effect        | Record: two patients' records are wrong; the right patient's line looks supplied                                                                                                                                                     |
| Control       | SU-14 and D-PH1-25 (`correctSupplyRecord`: "recorded in error", moves no stock, withdraws the list entry, tells the prescriber, returns the line to where it stood so it can be supplied); CD-5 (witnessed for a controlled product) |
| Proving test  | lane `pharmacy-supply` S52; unit SU-14                                                                                                                                                                                               |
| Residual risk | The record is put right; the medicine is still with the wrong person, and finding them is a human task                                                                                                                               |
| S×L           | Initial 3×3=9 · residual 3×2=6                                                                                                                                                                                                       |

### HZ-PH1-32 A downtime sheet is never entered, or is entered twice

| Field         | Entry                                                                                                                                                                                                   |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cause         | Paper is lost; two people enter the same sheet                                                                                                                                                          |
| Effect        | Record: supplies missing (stock wrong, lines look unsupplied, risking a second supply) or doubled                                                                                                       |
| Control       | DT-2 (server-reserved numbers; `to_enter` until **Sheet complete**; a row entered once); D-PH1-46 (the shared number space and guard trigger); the navigation count of sheets to enter                  |
| Proving test  | lane `pharmacy-downtime` S67, S68, S69; unit DT-2                                                                                                                                                       |
| Residual risk | A used sheet that the in-charge does not name in "Record a downtime" stays `unused`, and S69 says unused sheets do not count as waiting. It is invisible until someone looks (see the missing controls) |
| S×L           | Initial 3×3=9 · residual 3×2=6                                                                                                                                                                          |

### HZ-PH1-33 A back-entered supply carries the entry time as the supply time

| Field         | Entry                                                                                                                                                                        |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cause         | Server time used for everything                                                                                                                                              |
| Effect        | Record: the timeline is wrong; refill dates and stock-out periods shift                                                                                                      |
| Control       | Law 13; DT-3 (`supplied_at` from the sheet, `entered_at` from the server; the movement's `effective_at` is the sheet's); DT-4 (future and out-of-period times refused); DL-2 |
| Proving test  | lane `pharmacy-downtime` S68, S72, S78; unit DT-3, DT-4                                                                                                                      |
| Residual risk | Low                                                                                                                                                                          |
| S×L           | Initial 2×4=8 · residual 2×1=2                                                                                                                                               |

### HZ-PH1-34 A medicine is supplied during downtime with no identity check, no pharmacist or no witness, and nobody looks afterwards

| Field         | Entry                                                                                                                                                                                                                                                                                   |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cause         | Paper has no hard stops                                                                                                                                                                                                                                                                 |
| Effect        | Patient: the HZ-PH1-01, 07 or 23 harms, with no record that a check was missed                                                                                                                                                                                                          |
| Control       | DT-6 (identity as written on the sheet); DT-8 (a controlled row listed until confirmed against the register, witnessed); DT-10 (every check SU-2 would have refused is evaluated at the sheet's time and flagged); the look-back list; Section 13 count of look-backs older than 7 days |
| Proving test  | lane `pharmacy-downtime` S74, S75; unit DT-10 (one flag per reason)                                                                                                                                                                                                                     |
| Residual risk | The look-back happens after the medicine has gone. A long list may be cleared without care                                                                                                                                                                                              |
| S×L           | Initial 4×3=12 · residual 4×2=8                                                                                                                                                                                                                                                         |

### HZ-PH1-35 A medicine is supplied during downtime against a paper prescription that MedSync never sees

| Field         | Entry                                                                                                                                                                 |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cause         | The prescriber also wrote on paper during the outage                                                                                                                  |
| Effect        | Record: a supply with no prescription; the prescriber's plan does not show it                                                                                         |
| Control       | DT-5 and E-PH1-10 (`paper_prescriptions` with each line as transcribed and who transcribed it; never a prescriptions row); the patient's list marks it as transcribed |
| Proving test  | lane `pharmacy-downtime` S70 (no prescriptions row written)                                                                                                           |
| Residual risk | The paper prescription is linked to no encounter, so the prescriber is not told; transcription is one person's (HZ-PH1-59)                                            |
| S×L           | Initial 3×3=9 · residual 3×2=6                                                                                                                                        |

### HZ-PH1-36 A pharmacy technician is shown, recorded or printed as a pharmacist

| Field         | Entry                                                                                                                                                                                          |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cause         | A generic "pharmacist" word in copy, prints or audit lines                                                                                                                                     |
| Effect        | Record: the reviewer's qualification is misstated; a patient or regulator is misled                                                                                                            |
| Control       | Law 15; PA2-2 (review only for the Pharmacist cadre); PA2-7 (events keep the cadre as it was); "Reviewed by {cadre}" and "Standard lane: checked at supply" (5.6, D-PH1-06); Section 13 metric |
| Proving test  | lane `pharmacy-review` S13; lane `pharmacy-controlled` S63. New: unit copy and print scan "no string or print calls a pharmacy technician a pharmacist"                                        |
| Residual risk | Low                                                                                                                                                                                            |
| S×L           | Initial 2×3=6 · residual 2×1=2                                                                                                                                                                 |

### HZ-PH1-37 One person signs the content, approves the switch and reviews the audit

| Field         | Entry                                                                                                                                                                                                                                                                                                                                                                      |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cause         | Few people. **Recorded exception: Fadhul holds the superadmin, CSO and audit-reviewer roles at once** (Section 12), and the pharmacist reviewer is not yet named                                                                                                                                                                                                           |
| Effect        | Record: an error passes because the person who made it is the only one who checks it                                                                                                                                                                                                                                                                                       |
| Control       | D-PH1-36 (who signs what; the author is not the only signer; the CSO is not the switch's second approver where another person exists; otherwise the exception in words on the signature); D-PH1-43 (CHECK: the two signers differ unless the exception text is present); RD-2 and RD-3 (second approver; S80, requester cannot approve); D-PH1-48 (two template approvers) |
| Proving test  | lane `pharmacy-golive` S80; New: lane `pharmacy-signed-sets` "two signers must differ; one signer is accepted only with the exception text, which is shown on the set"                                                                                                                                                                                                     |
| Residual risk | **Weak today.** The CHECKs stop a single account from signing twice; they cannot stop one person holding several roles. The exception stands until a second eligible person exists at each role                                                                                                                                                                            |
| S×L           | Initial 3×5=15 · residual 3×4=12                                                                                                                                                                                                                                                                                                                                           |

### HZ-PH1-38 A hospital switches a point on before its stock is counted, and every stock answer is wrong on day one

| Field         | Entry                                                                                                                                                               |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cause         | Pressure to go live                                                                                                                                                 |
| Effect        | Patient: sent to the window for stock that is not there                                                                                                             |
| Control       | RD-1 condition 3 (every active product has an opening count); RD-2; D-PH1-35 (stock set-up first); AV-3 (`not_counted` while uncounted); 5.8 opening-count progress |
| Proving test  | lane `pharmacy-golive` S79, S80; lane `pharmacy-stock-answer` S87                                                                                                   |
| Residual risk | An opening count can itself be wrong; a medicine with no product set up answers `not_stocked`                                                                       |
| S×L           | Initial 2×3=6 · residual 2×1=2                                                                                                                                      |

### HZ-PH1-39 On the day a point goes live, the queue fills with old prescriptions and real ones are lost among them

| Field         | Entry                                                                                                                                             |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cause         | Every earlier prescription has no outcome                                                                                                         |
| Effect        | Patient: today's patients wait behind records nobody will collect                                                                                 |
| Control       | LO-6 (scope starts when the first point went live); D-PH1-38 (earlier ones only when a person brings one in; nothing closed in bulk); 5.2 divider |
| Proving test  | lane `pharmacy-review` S32; unit LO-6                                                                                                             |
| Residual risk | Low                                                                                                                                               |
| S×L           | Initial 2×4=8 · residual 2×1=2                                                                                                                    |

### HZ-PH1-40 A point is switched off and its open lines are stranded

| Field         | Entry                                                                                                                                                         |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cause         | Writes refused at a point that is not live                                                                                                                    |
| Effect        | Patient: an owed medicine is never supplied                                                                                                                   |
| Control       | RD-3 (Open lines stays; lines at a stage can be handled from any live point); PA2-4 (closing, confirming and correcting stay allowed at a switched-off point) |
| Proving test  | lane `pharmacy-golive` S81, S82; unit PA2-4                                                                                                                   |
| Residual risk | At a hospital with only one point, switching it off leaves no live point to supply from; the lines stay listed for closing                                    |
| S×L           | Initial 3×2=6 · residual 3×1=3                                                                                                                                |

### HZ-PH1-41 A known interaction is missed because staff assume MedSync checks

| Field         | Entry                                                                                                                                                                    |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Cause         | No interaction check exists (Step 0 R8: always `not_checked`); a review screen looks complete                                                                            |
| Effect        | Patient: harm from an interaction a pharmacist would have caught                                                                                                         |
| Control       | **The notice is the only control in this slice.** CK-2 (`interactionsChecked` stays false); the notice on every review surface, not dismissible (Phase 0 R5, Appendix B) |
| Proving test  | unit CK-2; harness "the notice is present and has no dismiss control on the queue, review, hand-over and controlled screens"                                             |
| Residual risk | **Open.** Interaction checks are roadmap Phase 3 (Section 15). Nothing reduces the likelihood                                                                            |
| S×L           | Initial 4×3=12 · residual 4×3=12                                                                                                                                         |

### HZ-PH1-42 The inpatient's first dose is delayed waiting for pharmacy review

| Field         | Entry                                                                                                                                                                 |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cause         | A ward reads the review state as a hold                                                                                                                               |
| Effect        | Patient: a time-critical first dose is late                                                                                                                           |
| Control       | Law 10; D-PH1-33 (a read-only chip that never holds a dose); PA2-5 (nurses read the review state only); D-PH1-02 (ward lines review-only; ward doses from ward stock) |
| Proving test  | lane `pharmacy-review` S33; lane `pharmacy-patient-list` S89 (the first dose can be charted with "not yet reviewed")                                                  |
| Residual risk | Behaviour: a nurse may still wait by choice. The chip's words are signed                                                                                              |
| S×L           | Initial 4×2=8 · residual 4×1=4                                                                                                                                        |

### HZ-PH1-43 A patient with no date of birth and no phone on file is turned away

| Field         | Entry                                                                                                                                                                                                     |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cause         | The typed second identifier cannot be given                                                                                                                                                               |
| Effect        | Patient: goes without                                                                                                                                                                                     |
| Control       | Step 0 (Q17): both are NOT NULL, so "neither on file" is zero by schema; D-PH1-16 and SU-4 ("identified another way"; nobody is turned away); the decrypt-and-compare fallback where `phone_hmac` is null |
| Proving test  | lane `pharmacy-supply` S36 ("another way" lets the hand-over through). New: unit SU-4 "a patient with no `phone_hmac` is matched by the fallback"                                                         |
| Residual risk | A person who does not know either value relies on "another way" (HZ-PH1-29). Owner SQL D (unindexed phones) is awaited                                                                                    |
| S×L           | Initial 3×2=6 · residual 3×1=3                                                                                                                                                                            |

---

## Hazards added at Step 1 (not in Appendix C)

### HZ-PH1-44 The new prescriber cancel action cancels the wrong line, or one it should not

**Why added:** D-PH1-41 creates MedSync's first prescriber cancel of a placed line; a new write on prescriptions is a new way to lose one.

| Field         | Entry                                                                                                                                                                                                                                                                                              |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cause         | The action takes a line id from a stale screen; a whole-prescription "Stop the remaining medicines" includes a line already supplied; a caller who may not prescribe for the patient                                                                                                               |
| Effect        | Patient: a needed medicine is stopped. Record: a supplied line shows as cancelled                                                                                                                                                                                                                  |
| Control       | D-PH1-41 (`cancelPrescriptionLine`: active → cancelled only, coded reason, audited, prescribing permission for that patient, Zod and client key); LO-4 (a cancel on a supplied line does not unsupply it); RQ-5 ("stopped" cancels every **remaining** line); 5.4 names the medicine on the button |
| Proving test  | New: lane `prescribing-cancel` "only `active` lines move; a supplied line's outcome is unchanged; another hospital's clinician is refused; a repeat with the same client key writes once"; lane `pharmacy-review` S18, S19                                                                         |
| Residual risk | Choosing the wrong line on a correct screen is a human error the system cannot see                                                                                                                                                                                                                 |
| S×L           | Initial 4×2=8 · residual 4×1=4                                                                                                                                                                                                                                                                     |

### HZ-PH1-45 A "change" places the new line but leaves the old one active

**Why added:** under D-PH1-41 "Change" is two writes (place, then cancel); if the second never happens, two active lines exist.

| Field         | Entry                                                                                                                                                                                                                                                      |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cause         | The prescriber closes the dialog after placing; the cancel fails; a whole-prescription change is never confirmed with **Changes made**                                                                                                                     |
| Effect        | Patient: both the old and the new medicine are supplied (duplicate therapy)                                                                                                                                                                                |
| Control       | Proposed for D-PH1-41: where the dialog is opened from a one-line query, the new line and the old line's cancel commit in one transaction. RQ-5 (a whole-prescription query stays open until **Changes made**, so the pharmacy keeps every line `queried`) |
| Proving test  | New: lane `prescribing-cancel` "an injected failure after the new line and before the cancel leaves neither"; lane `pharmacy-review` S17, S19, S27                                                                                                         |
| Residual risk | A change made from the plan step outside any query is two separate actions, and nothing ties them                                                                                                                                                          |
| S×L           | Initial 4×3=12 · residual 4×2=8                                                                                                                                                                                                                            |

### HZ-PH1-46 A change made outside a query loses the link to the old line

**Why added:** D-PH1-41 stores the old → new link only on the pharmacy's query event, but RQ-9 needs it to show what was already supplied.

| Field         | Entry                                                                                                                                                                                                                           |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cause         | A prescriber cancels an owed or part-supplied line and prescribes again with no query open                                                                                                                                      |
| Effect        | Patient: the new line is supplied in full on top of the part already given                                                                                                                                                      |
| Control       | RQ-9 (the new line shows the quantity and date supplied on the old version); the reviewer sees the old line as `cancelled_by_prescriber` beside the new one on the same prescription                                            |
| Proving test  | New: lane `pharmacy-review` "a part-supplied line is cancelled and a new line placed with no query; the review screen shows the earlier supply"                                                                                 |
| Residual risk | **Weak.** Without a stored link the screen can only show what was supplied for the same medicine on the same prescription, not "this replaces that". A coded link on the cancel event would close it (see the missing controls) |
| S×L           | Initial 3×3=9 · residual 3×2=6                                                                                                                                                                                                  |

### HZ-PH1-47 A line not continued at visit close is supplied, or a continued line is dropped

**Why added:** Step 0 (Q3): visit close writes `completed` on the lines the prescriber chose **not** to continue
(`stopRxIds`, `lib/emr/write/encounter.ts:251-275`); continued lines stay `active`. Phase 0 shows `completed` as
"Not continued at home" (signed 2026-10-11).

| Field         | Entry                                                                                                                                                                                                                 |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cause         | The pharmacy reads `completed` as "supplied" or as still suppliable, or treats every non-`active` line alike                                                                                                          |
| Effect        | Patient: a medicine the prescriber stopped at close is supplied; or the record shows a stopped line as supplied                                                                                                       |
| Control       | A `completed` line takes the closed outcome `cancelled_by_prescriber`, reason "not continued at visit close"; only `active` lines are suppliable; SU-2 re-checks `state` under the line lock (gate-a-proposal §1, H1) |
| Proving test  | New: unit `lib/pharmacy/lines.ts` "a `completed` line has outcome cancelled_by_prescriber and no supply decision"; lane: "a hand-over of a line completed at close is refused"                                        |
| Residual risk | Low once the rule is written down and tested                                                                                                                                                                          |
| S×L           | Initial 4×3=12 · residual 4×1=4                                                                                                                                                                                       |

### HZ-PH1-48 An admission medicine is stopped but its prescription stays active

**Why added:** Step 0 (Q4, item 11a): "Stop/Hold" on a `prescribed_here` statement acts on `medication_statements` only, so the pharmacy still sees an active line.

| Field         | Entry                                                                                                                                       |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Cause         | Two records of one medicine, and the stop updates one                                                                                       |
| Effect        | Patient: the pharmacy supplies a medicine the clinician stopped                                                                             |
| Control       | None in this slice. D-PH1-41's `cancelPrescriptionLine` could be called by that Stop; that is a change to prescribing outside Section 7     |
| Proving test  | New (reproduce first): lane `prescribing` "Stop on a `prescribed_here` statement leaves its prescription active", as `it.fails` until fixed |
| Residual risk | **Open.** Reported at STOP 0, not fixed                                                                                                     |
| S×L           | Initial 4×3=12 · residual 4×3=12                                                                                                            |

### HZ-PH1-49 The doctor's print carries cancelled and completed lines

**Why added:** Step 0 (R17, item 11c): the printed prescription does not filter out cancelled lines, and that paper is what reaches the window, an outside pharmacy and the downtime sheet.

| Field         | Entry                                                                                                                  |
| ------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Cause         | The print page reads every line                                                                                        |
| Effect        | Patient: a cancelled medicine is supplied from paper, outside or during downtime                                       |
| Control       | Live: SU-2 refuses a cancelled line. Downtime: DT-10 flags a line cancelled at the sheet's time. Outside: none         |
| Proving test  | lane `pharmacy-supply` S44 (live refusal); lane `pharmacy-downtime` S74 extended with a cancelled line                 |
| Residual risk | **Open** for paper used outside MedSync. A fix is a change to how a prescription is printed, which Section 7 rules out |
| S×L           | Initial 3×3=9 · residual 3×2=6                                                                                         |

### HZ-PH1-50 "Changed since printing" cannot be computed

**Why added:** Step 0 (Q20): the doctor's print records no print event per prescription, yet the queue chip (PQ-7), the slip's warning and CD-8's first attestation all rely on it.

| Field         | Entry                                                                                                                                                                                        |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cause         | Only a page-open access log exists, with no prescription ids                                                                                                                                 |
| Effect        | Patient: a controlled supply is attested against out-of-date paper, or a slip goes out with the old line on it                                                                               |
| Control       | None as designed. CD-8's attestation ("the signed paper matches the screen") is the supplier's own comparison; `pharmacy_print_events` covers only pharmacy prints                           |
| Proving test  | lane `pharmacy-controlled` S65 can only pass once doctor prints are recorded                                                                                                                 |
| Residual risk | **Open.** Needs a print event on the doctor's print (a change Section 7 rules out), or S65 and the chip are dropped and the attestation carries the whole control (see the missing controls) |
| S×L           | Initial 4×3=12 · residual 4×3=12                                                                                                                                                             |

### HZ-PH1-51 Generalising downtime changes the lab's behaviour, or mixes the workspaces

**Why added:** D-PH1-46 changes a live, signed lab guard (`private.downtime_number_guard`, 0105), which today allows one move only, from `unused`.

| Field         | Entry                                                                                                                                                                                                                                        |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cause         | The new `to_enter → complete` move is allowed for lab numbers too; the CHECK `dfn_entered` is loosened; one number space lets a lab form number be entered as a pharmacy sheet, or the reverse                                               |
| Effect        | Record: a lab form entered twice (lab hazard 18 reopened), or a pharmacy sheet consumed by a lab entry                                                                                                                                       |
| Control       | D-PH1-46 (`workspace` column, default `lab`; the guard keeps the lab's transitions exactly and adds the pharmacy's for `workspace = 'pharmacy'`; `report_id` for lab numbers only); DT-1 ("never two"; the lab's behaviour proved unchanged) |
| Proving test  | lane `lab-downtime` unchanged and passing; New: lane `pharmacy-downtime` "a lab number cannot move to `to_enter`; a pharmacy number cannot be entered against a lab report; each workspace's entry refuses the other's number"               |
| Residual risk | Low; the change to the lab's signed hazard log returns it to draft only if the lab's tests change                                                                                                                                            |
| S×L           | Initial 3×2=6 · residual 3×1=3                                                                                                                                                                                                               |

### HZ-PH1-52 A stale acting point writes events at the wrong point

**Why added:** D-PH1-45 keeps the acting point in a per-user cookie; ADR 0280 lets several accounts share one browser.

| Field         | Entry                                                                                                                                                                                                                                             |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cause         | The affiliation to that point has ended; the point was switched off; the account was switched in the same browser                                                                                                                                 |
| Effect        | Record: stock moved and controlled entries written at a point the person is not at; that point's balance and register are wrong                                                                                                                   |
| Control       | D-PH1-45 (the cookie is re-checked on every write against a current affiliation and the point's hospital); PA2-4 (the point belongs to the hospital; live where the action needs it); the point is stored on every event and shown in the top bar |
| Proving test  | New: lane `pharmacy-access` "a write with a cookie naming a point whose affiliation ended, another hospital's point, or another user's point is refused"; unit PA2-4                                                                              |
| Residual risk | A person working at point B with point A still chosen, both valid, is not detectable; the top bar shows it                                                                                                                                        |
| S×L           | Initial 2×3=6 · residual 2×1=2                                                                                                                                                                                                                    |

### HZ-PH1-53 The second-person attestation leaks a secret, is brute-forced or replayed

**Why added:** D-PH1-42 has a second person type their password and code on another person's device, which no flow in MedSync does today.

| Field         | Entry                                                                                                                                                                                                                                                         |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cause         | The password reaches a log, the client's state or an error message; the throwaway client leaves a session on the device; repeated guesses; an attestation reused for a later action                                                                           |
| Effect        | Record: the witness's account is taken over, or a witness is recorded who was not there                                                                                                                                                                       |
| Control       | D-PH1-42 (server action only; a throwaway Supabase client that never writes the active session's cookies; `witness_user_id`, method and time recorded; five failures lock the attestation for that action); the house PII-redacted log (Section 8); Zod; AAL2 |
| Proving test  | New: unit `lib/auth/attest.ts` "no cookie is set; the password is in no log line or return value; the sixth try is refused; an attestation id is accepted for one action only and expires"; lane `pharmacy-controlled` S58                                    |
| Residual risk | The lock is per action, so a person can be guessed at across several actions; a lock per witness account per period is not in the design (see the missing controls). Shoulder-surfing at the window is a human risk                                           |
| S×L           | Initial 4×2=8 · residual 4×1=4                                                                                                                                                                                                                                |

### HZ-PH1-54 The second-identifier check is used to discover a patient's date of birth or phone

**Why added:** SU-4 closes the typed check after five wrong tries on **one hand-over**; a new hand-over starts the count again.

| Field         | Entry                                                                                                                           |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Cause         | A member of pharmacy staff tries values against a patient across several hand-overs                                             |
| Effect        | Patient: their date of birth or phone is learned by someone with no need                                                        |
| Control       | SU-4 (every attempt logged in `pharmacy_identity_attempts` with the actor); the attempts are visible to the in-charge           |
| Proving test  | unit SU-4 (five per hand-over). New: lane `pharmacy-supply` "attempts across hand-overs for one patient are counted and listed" |
| Residual risk | **Weak:** logging deters, nothing stops. A cap per patient (or per user) per day would (see the missing controls)               |
| S×L           | Initial 3×2=6 · residual 3×2=6                                                                                                  |

### HZ-PH1-55 A stale or never-counted point gives a misleading stock answer or stock-out

**Why added:** AV-3 puts `not_counted` ahead of `out`, and SL-9 starts a stock-out from a balance that may never have been true.

| Field         | Entry                                                                                                                                                                             |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cause         | A medicine at zero on a stale count answers "not counted … may be wrong" (a Note), not "not on the shelf" (a Check); a stock-out "since {date}" is drawn from an uncounted ledger |
| Effect        | Patient: the prescriber is not warned that a medicine is out. Record: Phase 2's stock-out reports start from false data                                                           |
| Control       | AV-3 (by design: an uncertain answer is never stated as certain); the Note's words say the answer may be wrong; D-PH1-23 (count freshness per point); RD-1 opening count          |
| Proving test  | lane `pharmacy-stock-answer` S87; unit AV-3 (uncounted and zero answers `not_counted`), SL-9                                                                                      |
| Residual risk | Accepted by design; the CSO signs the level of `not_counted` (D-PH1-22)                                                                                                           |
| S×L           | Initial 2×3=6 · residual 2×2=4                                                                                                                                                    |

### HZ-PH1-56 The stock-answer snapshot fails and takes the prescription down with it

**Why added:** D-PH1-44 writes `pharmacy_stock_answers` in the placement transaction, so a pharmacy write can now make prescribing fail (Law 10).

| Field         | Entry                                                                                                                                                                                             |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cause         | A constraint, RLS or availability error inside the placement transaction; the 0088 CHECK on `check_answers` (Step 0 Q5: a stock answer stored without a reason)                                   |
| Effect        | Patient: the prescriber cannot place the prescription                                                                                                                                             |
| Control       | AV-7 (never blocks placing); `getAvailability` never throws (an error answers as `not_linked`); a stock answer is stored in `check_answers` only at Check level, where a reason exists (D-PH1-44) |
| Proving test  | New: lane `pharmacy-stock-answer` "an injected failure in the snapshot write still places the prescription, with no snapshot and an audit line"; S85, S88                                         |
| Residual risk | Low if the snapshot is written so that its failure is caught; the latent 0088 bug in Step 0 Q5 is outside this slice                                                                              |
| S×L           | Initial 4×2=8 · residual 4×1=4                                                                                                                                                                    |

### HZ-PH1-57 Signed content is altered after signature, or a retired version acts

**Why added:** D-PH1-43 puts every behaviour-driving list in one jsonb store; a change to `content` after signing would act with the old signatures.

| Field         | Entry                                                                                                                                                                                                                                 |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cause         | An UPDATE on a signed row; two versions `signed` at once; a reader that does not check status                                                                                                                                         |
| Effect        | Patient: a lane, class or label rule acts that nobody signed                                                                                                                                                                          |
| Control       | D-PH1-43 (content acts only when `signed`; sha256 stored); Law 8; LN-7 (the rule version on every event); proposed: a trigger refusing any change to a signed row except to `retired`, and one `signed` version per hospital and kind |
| Proving test  | New: lane `pharmacy-signed-sets` "UPDATE of a signed row's content is refused, service role included; the sha256 is checked on read; a second signed version retires the first"; Section 13 "unsigned content that acted"             |
| Residual risk | Low                                                                                                                                                                                                                                   |
| S×L           | Initial 4×2=8 · residual 4×1=4                                                                                                                                                                                                        |

### HZ-PH1-58 Generalising the template store changes NCD sending or weakens the scan

**Why added:** D-PH1-48 changes `ncd_sms_template`, which drives live NCD recall messages.

| Field         | Entry                                                                                                                                 |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Cause         | A purpose CHECK widened so NCD reads pharmacy templates; the scan's term list not extended to pharmacy products and dispensing points |
| Effect        | Patient: a wrong message, or one that names a medicine or point                                                                       |
| Control       | D-PH1-48 (a `workspace` column; the two-approver CHECK and banned-term scan kept); MS-2 (pharmacy terms added to the scan)            |
| Proving test  | NCD recall tests unchanged and passing; unit MS-2 (a dispensing-point name fails); lane `pharmacy-patient-list` S93                   |
| Residual risk | Low                                                                                                                                   |
| S×L           | Initial 3×2=6 · residual 3×1=3                                                                                                        |

### HZ-PH1-59 A paper prescription is transcribed wrongly at back-entry

**Why added:** DT-5 has one person type each paper line, and the transcription then drives the patient's list and the dispensing log.

| Field         | Entry                                                                                                                          |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Cause         | Handwriting; haste after an outage                                                                                             |
| Effect        | Record: the medicine, strength or directions on the record differ from the paper. Patient: their list shows wrong directions   |
| Control       | DT-5 (who transcribed is stored; marked "Transcribed from a paper prescription" wherever shown); the paper stays the authority |
| Proving test  | lane `pharmacy-downtime` S70; harness "the transcribed mark shows on the supply, the list and the log"                         |
| Residual risk | **Weak:** no second check of a transcription. A pharmacist's look-back on every paper-prescription supply would add one        |
| S×L           | Initial 4×3=12 · residual 4×2=8                                                                                                |

---

## Controls the prompt's design is missing (for GATE A)

1. **Strength is not part of the medicine key (HZ-PH1-02).** The catalogue has no strength field, so "a product of the
   prescribed medicine" does not prove strength. Proposed: `pharmacy_products` carries the strength as text, the
   review and hand-over screens show the prescribed strength and the product's side by side, and a different
   strength takes SU-8's path. Nothing is compared or converted by the system.
2. **No unique index for double supply (HZ-PH1-06).** STOP 0 item 4's unique index on (line, line version) would
   refuse splits across batches and later supplies of what was owed. The guard is "quantity supplied ≤ quantity
   decided" under the advisory lock per line, tested by the race test.
3. **`completed` means "not continued at visit close" (HZ-PH1-47).** It is a closed outcome, never suppliable; write it into LO-1, LN-2 and SU-2 at GATE A.
4. **Changed since printing (HZ-PH1-50).** Either record a print event on the doctor's print (a change to printing that
   Section 7 rules out, so a D-decision), or drop the chip, the slip's warning and S65, and let CD-8's attestation
   carry the control.
5. **The old → new link outside a query (HZ-PH1-46).** Let `cancelPrescriptionLine` take an optional "replaced by"
   line id, stored on its own audited cancel event (no column on `prescriptions`).
6. **A per-patient cap on identity attempts (HZ-PH1-54)**, and a per-account lock on witness attestations across
   actions (HZ-PH1-53).
7. **Used sheets that were never named (HZ-PH1-32).** Show sheets reserved more than a set number of days ago and
   still `unused` to the in-charge, rather than hiding them.
8. **The admission-medicine stop (HZ-PH1-48)** needs a prescribing fix before a ward goes live with individual
   inpatient supply.

## Sign-off

This log is a **Step 1 draft**. It is completed at Step 9, when every control exists and its test passes, and only
then goes for signature. No score, control or status above is signed.

| Role                    | Name   | Date | Status   | Decision |
| ----------------------- | ------ | ---- | -------- | -------- |
| Clinical Safety Officer | Fadhul |      | Awaiting |          |
| Pharmacist reviewer     |        |      | Awaiting |          |

Recorded exception (HZ-PH1-37): the Clinical Safety Officer also holds the superadmin and audit-reviewer roles.
Where no second eligible person exists for a signature or an approval, the exception is written on that signature.
