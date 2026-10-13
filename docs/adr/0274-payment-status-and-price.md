# ADR 0274 — Payment status and price as recorded facts, with no billing

**Status:** Accepted — 2026-10-12 (owner, also the CSO), Pharmacy Phase 1 GATE A ([gate-a-proposal](../pharmacy/phase-1/gate-a-proposal.md) §14), SU-12, CT-5, D-PH1-20, D-PH1-21.

## Decision

1. Payment status (paid, exempt, insured, emergency, not recorded) is recorded on the review screen or at hand-over
   (0131, append-only) and stamped on the hand-over; MedSync checks no payment. Where a hospital requires a status,
   "not recorded" cannot be handed over; Emergency always can.
2. A product may carry a price; a supply stores it as it was. Nothing adds prices up.

## Consequences

- "Exempt" needs a signed exemption list.

## Alternatives considered

- Billing and receipts: out of scope.
