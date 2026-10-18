# ADR 0338 — Lab demo data only in a hospital marked as a demo hospital

**Status:** Accepted — 17 Oct 2026 (owner, also the CSO, signing Lab Phase 5 [GATE A](../lab/phase-5/gate-a-proposal.md) as recommended). Built on `feat/lab-beyond-lis`; migrations 0154–0157 are GATED and owner-applied. Owner request (A19).

## Context

The owner asked for demo data in the lab for showing the workflow. Laboratory records are append-only and a real hospital must never receive invented patients.

## Decision

1. A superadmin marks a hospital in `lab_demo_hospitals` (0157). Only there, a laboratory lead can press "Load a demo lab day" (`/lab/setup/demo`).
2. A load adds eight patients "Demo patient 01" to "08" with accounts that cannot sign in, recorded in `lab_demo_patients` against the load, with tests at every worklist stage.
3. Orders and specimens are written as the Phase 1 trial writes them; results go through the normal entry and release path. A result is the middle of the hospital's own signed reference range; nothing clinical is invented. A test without a signed range is left received.
4. Demo records are never deleted; the demo hospital is the sandbox.

## Consequences

`tests/emr-db/lab-demo.test.ts`. "Removable" in A19 is met by the sandbox, not by deleting clinical rows.
