# ADR 0327 — A referred critical value is checked against the report, not repeated

**Status:** Proposed — 2026-10-17. Built at Lab Phase 4 Step 12 within RB-5 as signed at [GATE A](../lab/phase-4/gate-a-proposal.md); the CSO is asked to countersign the check wording.

## Context

Phase 1 refuses to release a value past the signed critical limits without a check (CM-3, CM-4): a repeat, checked not repeated, or could not check. At Step 12, S24 showed that a referred result past the limits could not be released at all, on paper or electronically: the release had no check to give and the reference lab's sample is not here to repeat.

## Decision

1. When a referred result is released (paper) or filed (electronic), each value the signed limits flag in this hospital's unit gets the check **checked, not repeated**, sample not checked here; the second checker is the transcription's second person, or the reason is "Entered by one person" (paper) or "Filed from {partner}'s system" (electronic). The call then runs exactly as Phase 1's (RB-5).
2. The shared `alertAfterRelease` takes this as an optional `autoCheck`, applied only to flagged values; every other release path is unchanged.

## Consequences

A referred critical value raises the same call and acknowledgement as an in-house one (S24, PGlite lane). **The CSO is asked to countersign this rule** (it is within RB-5 as signed, but the check wording is new).
