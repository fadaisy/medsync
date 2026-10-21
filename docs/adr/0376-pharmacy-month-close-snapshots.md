# ADR 0376 — Month close: immutable snapshots, late entries forward

**Status:** Accepted — 2026-10-21, Pharmacy Phase 2 GATE A signed by Fadhul (CSO) (`docs/pharmacy/phase-2/gate-a-proposal.md`).

Rules: MR-1 to MR-6, D-PH2-12.

## Decision

- Closing needs `pharmacy.manage` and a second approver who attests with their own second factor. It writes an immutable snapshot hashed with sha256.
- A closed month never re-opens. A movement back-dated into it shows in the next open month, labelled "Belongs to {month}".
- Unexplained differences are carried as lines, never absorbed into the opening figure.
