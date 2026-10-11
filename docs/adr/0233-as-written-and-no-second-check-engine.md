# ADR 0233 — As written, and no second check engine; check levels stored from now on

**Status:** Accepted — 2026-10-10 (owner, also the CSO), Pharmacy Phase 0 GATE A, D-PH0-20, Laws 5 and 6
([gate-a-proposal](../pharmacy/phase-0/gate-a-proposal.md) §5.1, §5.2).

## Context

The pharmacy must show doses exactly as written and only the check outcomes stored at prescribing. Only answered checks
were stored, without their level, so "stop overridden" could not rest on data.

## Decision

1. Every stored text field passes through untouched (byte-equality tests). A changed pre-set dose shows the original
   struck through.
2. The pharmacy never runs a check. Its chips and side column come from `check_answers` and `confirmed_flags` only.
3. From Phase 0 the Plan writer stores each answer's level: `check_answers` entries are `{code, answer, outcome}`.
   Older rows: only `allergy` (always a stop when answered) reads as a stop.
4. The prescriber's reasons are shown as the one stored text per line, verbatim.

## Consequences

- Passed checks and notes are not shown: they were never stored.

## Alternatives considered

Re-running the checks in the pharmacy (a second engine that could disagree with what the prescriber saw).
