# ADR 0395: Reconciliation at discharge, opened by the prescriber

**Status:** Accepted, 25 Oct 2026. Pharmacy Phase 3 GATE A (D-PH3-16 as found, D-PH3-17, D-PH3-18), Step 9.

## Decision

- **Opening (MR-1).** There is no discharge event, so the discharging prescriber opens the reconciliation with **Prepare medicines for home**. It opens on a page off the patient's chart. There is one reconciliation per admission (`pharmacy_reconciliations.admission_id` is unique, 0212).
- **The rows (MR-2).** Rows are the union of three sets, matched by catalogue id:
  - the patient's medication statements, with the admission decision (0088);
  - the ward lines, prescribed between arrival and opening, with their last charted dose;
  - the active lines prescribed after opening (the discharge prescription).

  Uncoded medicines stand as their own rows.
- **Decisions.** Every row needs the prescriber's decision for home, stored append-only in `pharmacy_reconciliation_decisions`; the latest decision wins. Stay stopped, Paused and Changed each need a reason. Nothing is inferred.
- **Discrepancies (MR-3).** Discrepancies come only from the rules signed on in the `reconciliation_rules` pack. MedSync checks twelve of the fourteen; R7 (directions differ) and R9 (a course with no stop) are listed on the page as not checked. A pharmacist explains a discrepancy with a reason from the signed list.
- **Confirming (MR-4).** **Confirm the list** is checked again on the server. It writes an event carrying the list as it stood.
- **Reopening (MR-5).** A decision made after confirmation reopens that row, and the page says so.
- **Closing (MR-6).** A person closes a reconciliation with a reason. Nothing holds a discharge (Law 5).
- **The patient's sheet (MR-7).** The sheet prints from the confirmed list only, in its own wording (`PHARMACY_RECONCILIATION_COPY`, draft). That wording is kept apart so the signed Phase 3 wording stays signed. The flag `PHARMACY_RECONCILIATION` stays off in production until that wording is signed.

## Limits (ponytail)

- **Where decisions are made.** The prescriber decides on a page, not inside the plan step.
- **No patient list entry.** Nothing is written to the patient's medicine list (Phase 1 Step 9 is not built), so the sheet is the patient's copy and says so.
- **No discharge event.** "Patient has gone home" cannot be detected, because there is no discharge event.
- **Lane reason not wired.** The lane reason for an open discrepancy (S46) is not wired into the lanes.
