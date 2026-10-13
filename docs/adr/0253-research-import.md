# ADR 0253 — Importing the researched catalogue as drafts

**Status:** Accepted — 2026-10-12 (owner, also the CSO, on the instruction to pass every gate on the recommendations: [GATE A](../lab/phase-2/gate-a-proposal.md)). Built on `feat/lab-one-menu` behind its flag; migrations 0107–0111 are GATED and owner-applied. No clinical value is set by this decision.

## Decision

1. The research file is data: validated against its own conventions, imported once per hospital per file hash.
2. Reference bands arrive as **unsigned drafts** on Phase 1's range store, each with its citation, population, method,
   confidence and reason. Overlapping sources stay side by side; the laboratory lead keeps one and the others stay visible
   as rejected alternatives with the reason. Nothing is averaged.
3. A band marked `verification` cannot be signed (by the lead or the CSO) until the check is recorded: what was found and
   which table or page.
4. Decision bands arrive as scheme drafts with the limits as printed; their free-text inclusivity is never guessed, so
   every imported scheme stays unsignable until a person sets each boundary.
5. Kit-specific tests (troponin, thyroid, PT/APTT, D-dimer) and INR targets are not imported (LD-08, LD-09).
6. The import report is `docs/lab/phase-2/import-report.md`.
