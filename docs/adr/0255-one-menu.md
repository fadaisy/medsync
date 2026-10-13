# ADR 0255 — One test menu: availability read from the hub

**Status:** Accepted — 2026-10-12 (owner, also the CSO, on the instruction to pass every gate on the recommendations: [GATE A](../lab/phase-2/gate-a-proposal.md)). Built on `feat/lab-one-menu` behind its flag; migrations 0107–0111 are GATED and owner-applied. No clinical value is set by this decision.

## Decision

1. Each test is linked to its hub offering per hospital (`lab_test_services`; HARMONISATION §9).
2. What a test is today (in house, referred, analyser down, not offered, not linked, not known) is read from the hub at
   query time, through the hub's own projection, and never copied. The order sheet, the Plan basket and the resus
   proposals all read it.
3. A not-offered or unlinked test cannot be ordered here (the server refuses it); unknown says "Not known today" and is
   orderable. What ordering showed is kept on the order line. A change after ordering never cancels it; the specimen
   shows on **To refer**.
