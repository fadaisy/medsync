# ADR 0238 — Laboratory staff keep access to the patients whose specimens they hold

**Status:** Accepted — 2026-10-11 (owner, also the CSO), as a hotfix before Lab Phase 1
([STOP 0](../lab/phase-1/STOP-REPORTS.md), verdict 3). Migration 0101 (owner-applied).

## Context

The EMR access rule (`private.patient_access_basis` and its set form `private.accessible_patient_ids`, migration 0071) grants access by active encounter, nursing assignment, open intake today, department within 30 days, or
break-glass. None describes laboratory work. A technologist matched only "open intake", because the laboratory is never
the encounter's department, so after midnight, or once the patient's visit completed (admitted patients included), a
specimen already in the lab could not be resulted: "No legitimate clinical access to this patient." Reproduced in the
harness at 00:15 Kampala.

## Decision

1. A new basis, `lab_work`: an approved or active affiliation at the hospital with a laboratory cadre (`LAB_TECH`,
   `LAB_TECHNOLOGIST`), and a laboratory order for the patient at that hospital within the last 30 days, the window the
   rule already uses for `department_recent`. It sits after `department_recent` and before break-glass.
2. Both bodies of the rule gain the same arm; the access log's basis constraint (SQL and Drizzle) gains `lab_work`, so
   these reads are logged as what they are.

## Consequences

- The lab can result, amend and record calls for any patient with a recent lab order at its hospital, whatever the
  visit's state or the date. It gains nothing for patients without one, nothing at another hospital, and loses it on
  suspension. Proven in `tests/emr-db/lab-work-access.test.ts`; the set-form equivalence and parity probes still pass.
- The lab sees the record of a patient it holds a specimen for, not only that specimen. That matches how the other bases
  work (each grants the patient, not a slice); a per-order rule would need the reads re-scoped and is not proposed.
