# ADR 0217 — A diagnosis added by mistake comes off in one tap

**Status:** Accepted — 2026-10-08 (owner: "make it so that one can remove a diagnosis … I can mis-click a diagnosis").
Amends D-SI-13 (ADR 0180) for one case.

## Context

Step 09 removed a diagnosis only with a reason (Added by mistake, Duplicate, Ruled out, Other), and the leading
diagnosis had no Remove at all: it had to be moved to the differential first. A mis-click therefore cost three or
four taps. Past history already treats a slip differently: a medicine or allergy first recorded at this visit by
this clinician comes off with its X, entered in error, with no question.

## Decision

1. A diagnosis whose first version this clinician recorded at this visit (`addedHere`, from the condition's version 1:
   this encounter, this recorder) is removed in one tap, entered in error with the reason "Added by mistake".
2. Any other diagnosis (from another clinician, or carried) still asks why (D-SI-13).
3. The leading diagnosis gets Remove too, under the same two rules.
4. Nothing is deleted: removal is the existing entered-in-error event, audited, and the record stays append-only.
