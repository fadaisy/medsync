# ADR 0239 — Critical results live in their own store, with append-only events

**Status:** Accepted — 2026-10-11 (owner, also the CSO; [GATE A](../lab/phase-1/gate-a-proposal.md) E-LAB1-01, E-LAB1-02, E-LAB1-03). Built on `feat/lab-safety-floor` behind `LAB_CRITICALS`; migrations 0102–0106 are GATED and owner-applied. No clinical value is set by this decision.

## Context

Phase 0 told the lab "Automatic critical flagging is off" and had nowhere to record a critical result, an attempt to reach
a doctor, or an acknowledgement. The legacy path checked a critical value and wrote nothing a ward could act on (F3). No
reusable per-hospital signed store existed to hang this on (STOP 0, Q5).

## Decision

1. Dedicated tables (migration 0102): `critical_marks` (which component, manual or automatic, the limit and its version,
   the check made), `critical_alerts` (one row per alert: state, sub-state, level, due time, acknowledgement),
   `critical_alert_events` (everything that happened to it), `critical_contacts`, `critical_response_versions`,
   `escalation_heartbeats`, `lab_sms_templates`, `lab_settings`.
2. `critical_alert_events` is append-only: a BEFORE UPDATE OR DELETE trigger raises for every role, the owner included
   (CA-4). An alert's history is its events; its row is a projection that the events can rebuild.
3. A release that carries a mark writes the report, the marks, the alert and its `created` event in one transaction
   (`releaseWithCriticalMark`, `lib/lab/criticals/store.ts`). Delivery runs after commit and never rolls the release
   back (CA-3).
4. RLS on every table (ENABLE + FORCE), reads through the clinical reader role scoped to the hospital, no client writes;
   writes run as the owner after the permission check, like every EMR write.

## Consequences

- Every critical mark has exactly one alert (CA-14, checked on the record in PGlite and by property tests over random
  event sequences). F3 is fixed.
- The alert is a clinical record: it cannot be edited or deleted, only added to.
- Two places describe an alert (row and events); the row is written only by the store, in the same transaction as the
  event that changes it.

## Alternatives considered

A generic signed-document store (none existed; building one first would have delayed the safety floor); notifications
rows as the alert (they carry no state machine and can be dismissed).
