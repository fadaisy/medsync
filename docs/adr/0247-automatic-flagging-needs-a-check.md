# ADR 0247 — Automatic critical flagging: the pill at entry, and no release without a check

**Status:** Accepted — 2026-10-11 (owner, also the CSO; [GATE A](../lab/phase-1/gate-a-proposal.md) D-LAB1-10, D-LAB1-15, D-LAB1-16). Built on `feat/lab-safety-floor` behind signed limits (data, not a flag); migrations 0102–0106 are GATED and owner-applied. No clinical value is set by this decision.

## Context

Phase 0 said "Automatic critical flagging is off" (ADR 0226). Once a hospital has signed limits, MedSync can flag. A flag
that can be released past unchecked is worse than none.

## Decision

1. At entry, a value at or beyond a signed limit shows the Critical pill (icon and word) and "1 critical value needs a
   check before release." The release button becomes **Check and release**, which opens the mark panel with that value
   already marked, not removable (S30, S31).
2. The server refuses a plain final release that contains an unchecked automatic critical, inside the release's own
   transaction (`guardUncheckedCritical`).
3. Automatic marks carry the limit, its version and the direction. A value corrected below the limit before release
   raises no mark (S35). Limits in force at collection are the ones applied (S42).
4. The flagging notice reads the hospital's signed state (CF-1): neutral once limits and response times are both signed,
   the Phase 1 amber wording otherwise, and the Phase 0 notice exactly as before with `LAB_CRITICALS` off.
5. No limit covers a child unless one is signed for that age: the value is not flagged and the screen says "No critical
   limit for this age". A hand mark still works (S33).
6. Every critical alerts. There is no suppression (D-LAB1-15); alert fatigue is hazard 7, open.

## Consequences

Turning on automatic flagging is a signature, not a deploy.
