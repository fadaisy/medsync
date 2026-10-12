# ADR 0254 — The method register and eGFR as a calculated result

**Status:** Accepted — 2026-10-12 (owner, also the CSO, on the instruction to pass every gate on the recommendations: [GATE A](../lab/phase-2/gate-a-proposal.md)). Built on `feat/lab-one-menu` behind its flag; migrations 0107–0111 are GATED and owner-applied. No clinical value is set by this decision.

## Decision

1. The method (and, for creatinine, IDMS traceability) is a field of Phase 1's versioned measure: a change is a new
   version, and every result keeps the method it was entered with. A band may name a method; bands for this method are
   used first, then bands naming none; another method's never.
2. eGFR (CKD-EPI 2021, race-free) is calculated with the creatinine, never typed: adults only, sex recorded, an
   IDMS-traceable method declared, the hospital reporting it, and the constants from the signed REF entry. An amended
   creatinine recalculates it. When a condition fails, the creatinine's snapshot says which; the caveat is always shown.
