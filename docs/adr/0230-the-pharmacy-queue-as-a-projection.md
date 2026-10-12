# ADR 0230 — The pharmacy queue as a projection: the placement id, three lanes, nothing disappears

**Status:** Accepted — 2026-10-10 (owner, also the CSO), Pharmacy Phase 0 GATE A, D-PH0-08, -12, -18, E-PH0-02
([gate-a-proposal](../pharmacy/phase-0/gate-a-proposal.md) §4.2, §5.1).

## Context

`prescriptions` is one row per medicine, and nothing grouped the lines a prescriber placed together; every line of one
placement shares one `created_at`, and nothing recorded the order written. Where the patient goes is known only once
the visit closes.

## Decision

1. Migration 0099 adds `prescriptions.placement_id` and `placement_line`. Both writers stamp them: the Plan draws one
   id per basket and numbers its lines 1 up; one EMR-sheet prescribe is one placement, line 1. No backfill.
2. One queue row is one placement; older rows are grouped by encounter + prescriber + `created_at` and marked
   "grouped by time". Medicines appear in the order written (`placement_line`, then time, then id).
3. Three lanes: **For the window** (a closed visit not admitted), **On the wards** (inpatient, admitted, or under
   observation), **Visit open**. Lane counts are taken before the lane filter and add up to All.
4. No queue table: `computeQueue` projects stored rows; the browser re-projects on a lane or state switch, so the
   switch needs no request. Cancelled and changed prescriptions stay, marked.
5. A dispensing point's `serves` picks the opening lane (ADR 0236).

## Consequences

- Every placement written in the period appears exactly once under All (property test, 500 runs).
- The two writer edits are the only prescribing-code changes in this phase.

## Alternatives considered

Grouping by time only (an inference); a header table (a second write model); one lane when the data cannot tell
(hides most of the day's prescriptions in clinics that close late).
