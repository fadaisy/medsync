# ADR 0379 — Cost recorded at receipt only

**Status:** Accepted — 2026-10-21, Pharmacy Phase 2 GATE A signed by Fadhul (CSO) (`docs/pharmacy/phase-2/gate-a-proposal.md`).

Rules: SL-17, D-PH2-14.

## Decision

- An optional unit cost is recorded on the `received` movement and inherited by the batch. It is corrected only by an event, while the receipt's period is open.
- Money appears only where a cost was recorded. The patient price is never used as cost.
