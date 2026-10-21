# ADR 0378 — Expiry, quarantine and write-off; disposal off-system

**Status:** Accepted — 2026-10-21, Pharmacy Phase 2 GATE A signed by Fadhul (CSO) (`docs/pharmacy/phase-2/gate-a-proposal.md`).

Rules: EX-1, EX-2, D-PH2-18.

## Decision

- Expired, damaged and recalled stock moves into quarantine as a pair.
- Write-off is only from quarantine. It needs `pharmacy.manage`, a witness, a reason and a register entry number, and prints the Expired or Spoiled Medicines Register entry.
- Disposal happens off-system. Only its reference is recorded.
