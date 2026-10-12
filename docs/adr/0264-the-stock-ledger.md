# ADR 0264 — The stock ledger: movements, batches, balance as a projection, blind counts

**Status:** Accepted — 2026-10-12 (owner, also the CSO), Pharmacy Phase 1 GATE A ([gate-a-proposal](../pharmacy/phase-1/gate-a-proposal.md) §14), E-PH1-02, SL-1 to SL-11, D-PH1-23, D-PH1-24.

## Decision

1. Stock is `pharmacy_stock_movements`, append-only. A batch's balance at a point is the sum of its movements; no
   balance is stored as an editable figure (migration 0124).
2. A guard trigger locks the batch row before every movement and refuses a live one that would take the batch below zero,
   or a live supply from an expired batch (a month-only expiry runs to the end of the month; the date is Africa/Kampala).
   Back-entry after downtime is let through and marks the medicine "Count needed" (DT-7).
3. A batch's number and expiry change only beside a `pharmacy_batch_corrections` row in the same transaction; the first
   values are kept on the batch for ever (SL-11). A product's issue unit locks once stock has moved (CT-4).
4. Counts are blind: the counter types the figure, then the balance is recorded beside it and any difference is a
   `count_correction` movement with a reason (SL-6).
5. Stock-outs are a projection kept by trigger for Phase 2's reports (SL-9).

## Consequences

- The database itself refuses an overdraw even if application code is wrong.
- A count's expected figure is never shown before the count is typed.

## Alternatives considered

- A stored balance updated in place: rejected (loses history, races).
- Reservations for "ready" lines: rejected (E-PH1-03).
