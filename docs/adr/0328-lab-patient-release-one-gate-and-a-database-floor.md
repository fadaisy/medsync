# ADR 0328 — One gate decides what a patient sees, with a never-shown floor in code and in the database

**Status:** Accepted — 17 Oct 2026 (owner, also the CSO, signing Lab Phase 5 [GATE A](../lab/phase-5/gate-a-proposal.md) as recommended). Built on `feat/lab-beyond-lis`; migrations 0154–0157 are GATED and owner-applied.

## Context

Patients may see their own results (DPPA 2019 s.24; Patients' Charter 2009 Art. 16), but a result seen before the clinician, a critical seen before anyone spoke to the patient, or an HIV or pregnancy result in an app on a shared phone causes harm. Every patient surface and the SMS must agree on what is visible.

## Decision

1. `visibleToPatient` (`lib/lab/patient-release.ts`) is the only decision, evaluated over a snapshot read once (`resultFacts`). Rows, in order: never-shown, minors rule, consent, released and current, signed release table, being checked, reviewed, told, held, visible. The first failing row is the reason; the doctor's chip and the patient's line are both derived from it.
2. **The floor (PR-3):** HIV, TB, mental health and sexual and reproductive health classes, urine pregnancy tests, and the tissue and cytology groups are never shown, never named under "Not ready to show yet", never announced by SMS. Configuration can add tests (`patient_floor_additions`) but never remove one.
3. The floor is also in the database (`private.never_shown`, 0154) and an adult patient's list must also pass `private.patient_visible_report_ids`, reached through `patient_results_for_me()` (SECURITY DEFINER, `auth.uid()` only, revoked from `anon`).
4. Nothing is visible until the hospital's release table is signed by a laboratory lead and countersigned by the CSO.

## Consequences

One place to reason about patient visibility; a 200,000-case property test and lanes S21 to S38 prove it. A test mis-classed in the catalogue is the residual risk (HZ-5-03).

## Alternatives considered

Per-surface checks (rejected: they drift). Floor in configuration only (rejected: a careless signature could remove it).
