# ADR 0373 — Ward and cart use from counts, never from doses

**Status:** Accepted — 2026-10-21, Pharmacy Phase 2 GATE A signed by Fadhul (CSO) (`docs/pharmacy/phase-2/gate-a-proposal.md`).

Rules: Law 4, D-PH2-06, WS-1 to WS-3, EC-1 to EC-4.

## Decision

- The administration record stores a free-text dose and no product, quantity or batch (STOP 0, Q3). So a ward's holding is known only when it is counted.
- Use since the last count is the ledger balance before the count minus the count. Doses charted, and cart uses recorded on the resus desk, are shown as context and never subtracted. Tests prove that no figure depends on them.
