# ADR 0337 — Autoverification and the microbiology feed wait for their preconditions

**Status:** Accepted — 17 Oct 2026 (owner, also the CSO, signing Lab Phase 5 [GATE A](../lab/phase-5/gate-a-proposal.md) as recommended). Built on `feat/lab-beyond-lis`; migrations 0154–0157 are GATED and owner-applied.

## Context

Step 9 (autoverification) needs an analyser on the Phase 4 bridge, three months of live delta checks and current QC; Step 10 needs a microbiology module that emits isolates. None exists.

## Decision

Nothing is built for either; no flag is added. `docs/lab/phase-5/autoverify-gap.md` maps each AV-2 check to what is live and what is missing; `micro-gap.md` lists what MB-1 to MB-6 need. Every result is released by a person.

## Consequences

No rule can release a typed result. Organism and phenotype alert entries can be signed today and wait.
