# ADR 0250 — Red for critical-result alerts: an amendment to the red law

**Status:** Accepted — 2026-10-11 (owner, also the CSO; [GATE A](../lab/phase-1/gate-a-proposal.md) D-LAB1-18). Built on `feat/lab-safety-floor` behind `LAB_CRITICALS`; migrations 0102–0106 are GATED and owner-applied. No clinical value is set by this decision.

## Context

The design system keeps red for genuine emergencies, never alone and never decorative. A critical result is an
emergency for a patient and must not look like an ordinary amber notice.

## Decision

1. The critical tint is allowed in exactly two places on the new routes: the doctor's pinned critical alert and the
   Critical pill. Each carries the critical octagon icon and words, never colour alone.
2. Everything else on the lab routes stays red-free. Late, overdue, unsigned and "not sent" are amber with an icon and
   words; nothing is green.
3. `tests/design/red-reserved.test.ts` enforces this: engines may hold "critical" as data, never as a class.
4. No sound, no flashing and no animation on alerts. The alert is announced once, assertively; updates are polite.

## Consequences

The icon is the design system's octagon, not the triangle named in D-LAB1-18 (the triangle means amber caution here).
The owner may change it.
