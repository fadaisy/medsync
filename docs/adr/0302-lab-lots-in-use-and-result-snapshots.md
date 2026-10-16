# ADR 0302 — Lots in use and the lot snapshot on every released result

**Status:** Accepted — 2026-10-13 (owner, also the CSO, on the instruction to pass every gate on the recommendations: [GATE A](../lab/phase-3/gate-a-proposal.md)). Built on `feat/lab-quality-registers` behind its flag; migrations 0112–0118 are GATED and owner-applied. No clinical value is set by this decision.

## Context

When a lot is later found bad, the laboratory must know which results it produced. Phase 2 stored only the bedside
strip lot on the report.

## Decision

1. `lab_lots_in_use` (append-only) records which lot is in use per analyser or bedside device (or bench section) and
   per component kind: reagent, calibrator, control, strip, kit (LU-1). Setting a lot in use needs it accepted or
   already in use, and not expired (LU-2; a trigger refuses a lot that is not accepted).
2. **At release** (`prepareFixedUnits`, where Phase 1 and 2 already write `lab_result_snapshots`), with `labStock`
   on, each component's snapshot gains `lots`: the lots in use on its device at the result time, with their numbers,
   or `"not_recorded"` (LU-3). A downtime result is read at the paper form's result time.
3. A snapshot is never rewritten: a lot set in use later leaves earlier results unchanged.

## Consequences

Lots on a bench with no device join only when results carry a section. A result from an analyser not linked to a
device records "not recorded" rather than a guess.
