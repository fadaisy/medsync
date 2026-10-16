# ADR 0269 — The availability seam's real answer, and why the prescriber sees no quantity

**Status:** Accepted — 2026-10-12 (owner, also the CSO), Pharmacy Phase 1 GATE A ([gate-a-proposal](../pharmacy/phase-1/gate-a-proposal.md) §14), AV-1 to AV-9, D-PH1-22, D-PH1-44, H8.

## Decision

1. With a live point serving the patient, `getAvailability` answers in order: not stocked, not counted, out, low, in
   stock; otherwise "Pharmacy not linked yet", as before.
2. The prescriber sees words only: no quantity reaches any prescriber surface (a type and a deep walk prove it).
3. Note for on the shelf, low and not counted; Check for out and not stocked, with one tap to continue; never a Stop.
4. Every answer shown is stored in `pharmacy_stock_answers` in its own savepoint; a failure never stops a prescription.

## Consequences

- One SQL statement reads the stock for up to five medicines.

## Alternatives considered

- Showing quantities to prescribers: rejected; counts go stale and invite holding stock.
