# ADR 0371 — Two-leg movements and the new kinds

**Status:** Accepted — 2026-10-21, Pharmacy Phase 2 GATE A signed by Fadhul (CSO) (`docs/pharmacy/phase-2/gate-a-proposal.md`).

Rules: SL-12, SL-13, SL-14, E-PH2-03.

## Decision

- The ledger gains kinds for issues, returns, loans, ward and cart use, quarantine, write-off and return to the supplier.
- It also gains a `pair_id`. A deferred constraint trigger refuses a paired kind without its other leg, with the opposite quantity, in the same transaction.
- The guard refuses any out-movement of a blocked batch (expired, in quarantine, or under an open recall), except into quarantine or by write-off. Downtime back-entry is the one exception, flagged for look-back.
