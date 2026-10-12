# ADR 0275 — The look-back list

**Status:** Accepted — 2026-10-12 (owner, also the CSO), Pharmacy Phase 1 GATE A ([gate-a-proposal](../pharmacy/phase-1/gate-a-proposal.md) §14), RQ-7, RQ-12, DT-10, D-PH1-05.

## Decision

Supplies recorded without a check a live supply needs (a pharmacist-first supply without a pharmacist, a back-entered
row a live hand-over would have refused, a supply made on a phone answer later disputed) are flagged with each reason
and listed until a holder of `pharmacy.review` records a look-back.

## Consequences

- Back-entry never refuses what has already left the pharmacy; it flags it.

## Alternatives considered

- Refusing back-entry: rejected (Law 10).
