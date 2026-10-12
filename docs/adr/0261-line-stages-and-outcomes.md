# ADR 0261 — Line stages and outcomes; nothing closes by itself

**Status:** Accepted — 2026-10-12 (owner, also the CSO), Pharmacy Phase 1 GATE A ([gate-a-proposal](../pharmacy/phase-1/gate-a-proposal.md) §14), LO-1 to LO-9, D-PH1-12.

## Decision

1. Every line in scope has one stage (awaiting co-sign, to review, queried, ready) or one outcome (supplied, cancelled
   by the prescriber, replaced, declined, closed, reviewed; open: owed, buying outside), derived by folding the line's
   append-only events through one table, `MOVES` in `lib/pharmacy/lines.ts` (LO-4). A move outside the table is refused.
2. Nothing moves with time: no derivation reads a clock (LO-5). Old lines stay listed until a person closes them.
3. A line set `completed` at visit close was not continued: closed as cancelled by the prescriber (H1).

## Consequences

- The exhaustive test walks every status against every move; property tests check that no sequence escapes the table.

## Alternatives considered

- Status columns updated in place: rejected (ADR 0260).
