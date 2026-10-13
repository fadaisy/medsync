# ADR 0306 — Nonconformities as a generic engine

**Status:** Accepted — 2026-10-13 (owner, also the CSO, on the instruction to pass every gate on the recommendations: [GATE A](../lab/phase-3/gate-a-proposal.md)). Built on `feat/lab-quality-registers` behind its flag; migrations 0112–0118 are GATED and owner-applied. No clinical value is set by this decision.

## Context

QC rejects, failed kit controls, rejected lots, temperature excursions and unacceptable EQA results all need the same
thing: an owner, actions, a look-back where patients may be affected, and a closure that proves the cause was found
and fixed.

## Decision

1. `lab_nonconformities` (E-LAB3-07): `source` and `subject` are open text keys, so microbiology and blood bank can
   reuse the engine. Automatic sources are opened by MedSync with the lead as owner; only a QC reject halts testing
   (NC-1). Numbers are NC-YYYY-NNN per hospital.
2. Everything after opening is an append-only `lab_nc_events` row: actions (to do, done, cancelled with a reason),
   links, notifications, resumption and closure (NC-2). What was opened is kept; the row is frozen once closed.
3. **Resumption** after a QC reject needs a passing run after the reject, the look-back finished and the lead
   (NC-3). **Closure** needs the cause, every look-back result decided, every action done or cancelled with a reason,
   the effectiveness check met and the lead's signature with a fresh second factor (NC-4). Nothing auto-closes;
   overdue actions are listed (NC-5).
4. `/lab/quality/nonconformities` and `/[id]` open with `labQc` or `labEqa`.

## Consequences

A weak cause recorded in good faith still closes the record; the lead's signature carries it.
