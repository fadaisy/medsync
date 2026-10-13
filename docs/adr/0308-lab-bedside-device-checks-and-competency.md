# ADR 0308 — Bedside device checks and operator competency

**Status:** Accepted — 2026-10-13 (owner, also the CSO, on the instruction to pass every gate on the recommendations: [GATE A](../lab/phase-3/gate-a-proposal.md)). Built on `feat/lab-quality-registers` behind its flag; migrations 0112–0118 are GATED and owner-applied. No clinical value is set by this decision.

## Context

A bedside meter that failed its control check, or an operator whose competency lapsed, could still record results
(Step 0 baseline test b; hazards 20, 21). Phase 2's operator grant never expires.

## Decision

1. **The device rule** is signed configuration (`device_qc_rule`, key = test, laboratory lead alone): triggers (each
   day of use, new strip lot, new control vial, after a drop or error), levels, required before use, source.
2. **Ranges belong to the strip lot** (`lab_stock_lots.insert_ranges`), entered once by the laboratory from the vial;
   a check of a level with no range is refused. A check is a `lab_control_checks` row (subject `device`) storing the
   lot's ranges, the readings, the strip lot and the control vial in use.
3. **A failed check blocks the device** (`blocked`) until a check passes; selection is refused on the server (BQ-2).
   A new strip lot, a new control vial or a recorded drop needs a passing check before the next result; "not done
   today" informs ("Control check not done today." on the result) unless the rule says required before use (D-LAB3-15).
4. **Competency per test** (`lab_competencies`, D-LAB3-16): assessed by the laboratory (methods from the signed
   `competency_validity`), valid to a date; lapsed or revoked operators are refused; **Switch on** gives existing
   operators one grandfathered row valid for the signed grace period. A reassessment is a new row.
5. Each observation's context records `bedsideQuality: {deviceCheck, competency, checkId}` (BQ-5).
6. Behind `labPoctQuality` (`LAB_POCT_QUALITY`, needs bedside and stock): the nurse's `/nurse/bedside/devices` and the
   lab's `/lab/quality/bedside`. A device blocked while the flag was on stays blocked after it is switched off.

## Consequences

There is no revocation action and no booking store for reassessment: the lapsed line tells the nurse to ask the
laboratory, and the lab page lists lapsed operators.
