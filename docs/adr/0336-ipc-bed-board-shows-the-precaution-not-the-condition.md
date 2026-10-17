# ADR 0336 — The bed board shows an infection prevention precaution, never the condition

**Status:** Accepted — 17 Oct 2026 (owner, also the CSO, signing Lab Phase 5 [GATE A](../lab/phase-5/gate-a-proposal.md) as recommended). Built on `feat/lab-beyond-lis`; migrations 0154–0157 are GATED and owner-applied.

## Context

Step 5 put the IPC flag, including the condition, into the bed board's patient object, which every board viewer sees, including the hospital admin who sees only hospital numbers. The board's invariant is "name and MRN only".

## Decision

The board carries `ipc` beside the patient, not inside it, and it holds only the precautions in force ("Infection prevention: airborne"). The condition stays in `/ipc`.

## Consequences

Ward staff know how to approach the bed; the condition is not disclosed beyond IPC (Law 8). `tests/wards/invariants.test.ts` holds the rule.
