# ADR 0375 — The order method from EMHS 2023; MedSync does not send it

**Status:** Accepted — 2026-10-21, Pharmacy Phase 2 GATE A signed by Fadhul (CSO) (`docs/pharmacy/phase-2/gate-a-proposal.md`).

Rules: OQ-1 to OQ-7, Law 10, D-PH2-09, D-PH2-10, D-PH2-16.

## Decision

- The adjusted average monthly consumption follows §3.3.1.1. Maximum stock is that × the signed maximum months. The proposal is maximum minus stock on hand (store and points only), rounded up to whole packs and never negative.
- Every parameter is a signed pack. While one is unsigned, nothing is calculated.
- The order prints as HMIS 085, HMIS 084B or a purchase list, or is copied as text. MedSync sends nothing.
