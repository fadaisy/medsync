# ADR 0380 — GS1 keyboard-wedge parsing

**Status:** Accepted — 2026-10-21, Pharmacy Phase 2 GATE A signed by Fadhul (CSO) (`docs/pharmacy/phase-2/gate-a-proposal.md`).

Rules: SC-1 to SC-3, D-PH2-20.

## Decision

- A keyboard-wedge scan is parsed for AIs 01, 10 and 17, with day 00 meaning the end of the month. A GTIN maps to at most one active product per hospital.
- A scan that does not parse is treated as typed text. Nothing requires a scan.
