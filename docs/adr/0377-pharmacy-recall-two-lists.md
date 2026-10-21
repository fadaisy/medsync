# ADR 0377 — Recall: the exact list and the "may have received" list

**Status:** Accepted — 2026-10-21, Pharmacy Phase 2 GATE A signed by Fadhul (CSO) (`docs/pharmacy/phase-2/gate-a-proposal.md`).

Rules: RC-1 to RC-6, Law 8, D-PH2-17.

## Decision

- List 2 comes only from recorded supplies of the batch, matched by its current or any earlier batch number. List 4 (ward and cart windows) is separate, labelled, and never merged with list 2.
- Messages are PHI-free and signed. A person sends them, to list 2, and to list 4 only with the CSO's approval for that recall.
- A message that could not go records no outcome. The patient stays on the printed list until a person records how they were reached.
