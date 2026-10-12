# ADR 0259 — Bedside results, the NCD feed, and the HIV algorithm as configuration

**Status:** Accepted — 2026-10-12 (owner, also the CSO, on the instruction to pass every gate on the recommendations: [GATE A](../lab/phase-2/gate-a-proposal.md)). Built on `feat/lab-one-menu` behind its flag; migrations 0107–0111 are GATED and owner-applied. No clinical value is set by this decision.

## Decision

1. **Bedside**: an order fulfilled at the bedside by its operator (intent `bedside`), released with a registered,
   verified device and a current lot; HI and LO are stored as answers, never numbers; a scheme applies only if it names
   the bedside method.
2. **NCD feed**: each registry field maps to a concept, a unit, methods and a look-back window, signed by the registry
   lead and the CSO, with no default in code. The visit reads the newest released current result, keeps only a
   reference, lists results in another unit as not usable, and keeps outside results as printed with their laboratory.
   The diabetes pack keeps its own signed reader in this slice (its windows are signed pack data).
3. **HIV algorithm**: a versioned, signed configuration (assays, rule table, retest interval, the circular it follows);
   the outcome names its version and is never re-derived.
