# ADR 0316 — The matching rule and the reconciliation queue

**Status:** Accepted — 2026-10-17 (owner, also the CSO, signing Lab Phase 4 [GATE A](../lab/phase-4/gate-a-proposal.md) as recommended). Built on `feat/lab-connect-outward` behind `labReferral` / `labExchange`; migrations 0150–0153 are GATED and owner-applied.

## Context

An electronic or typed result names a patient and a number. Filing it on the wrong patient is the worst failure of this slice.

## Decision

1. **MA-1:** a partner result files only when its identifier maps to exactly one open referral, and name with date of birth, or the hospital number, agrees. A matched electronic result waits as "Back, to file" for a lab user (RB-10).
2. Everything else waits in **Waiting for a match** with one reason; the comparison says Same, Differs or Cannot compare, and values stay hidden until a decision.
3. MedSync never creates a patient, order or specimen from a message and never picks between candidates.
4. Filing after a mismatch needs how it was confirmed, a second person and a reason; the doctor sees "Filed by hand after a mismatch".

## Consequences

Tested on the simulator lane (S32–S34) and the paper lane (S21). The stricter variant (a differing hospital number always waits) was raised to the CSO and not applied.
