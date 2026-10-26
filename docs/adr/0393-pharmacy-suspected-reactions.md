# ADR 0393: Suspected reactions are a record and a printed report; MedSync sends nothing

**Status:** Accepted, 2026-10-25. Pharmacy Phase 3 GATE A (D-PH3-12 to D-PH3-15), Step 8.

## Decision

- **Recording (AR-2).** Pharmacy staff with `pharmacy.dispense` record an event. A suspected reaction, in the same transaction, writes one **unconfirmed** `allergies` entry per suspected medicine through `lib/emr/write/reactions.ts`. The criticality is unable to assess, and the informant is a clinician observer.
- **Prescribing checks (AR-4).** These already fire on unconfirmed entries and skip refuted ones (`lib/emr/allergy.ts`). A prescriber confirms or refutes by recording a new version.
- **The report (AR-5).** It follows the national form's order and carries the patient's initials, age and sex only. The name is decrypted only to make the initials, and it never leaves the server.
- **Printing and copying.** Both happen in the browser, and each one is logged as an event.
- **Submission and closing (AR-6).** These are events in `pharmacy_reaction_events` (0211, append-only):
  - **Submitted** needs a route and a date (`pre_submitted`).
  - **Closed, not submitted** needs a reason.
  - **Causality** is WHO-UMC.
- **Due-by.** It is computed only from a signed `reaction_timelines` entry. With none signed, no due-by is shown.

## Limits (ponytail)

- The form takes one suspected medicine, though the write accepts up to ten.
- The suspected-medicine choices are the patient's prescriptions in the last 90 days.
- There is no confirm/refute screen yet; the existing `recordAllergy` path with `supersedesId` covers it.
