# ADR 0244 — Escalation: a pure planner, three callers and a heartbeat

**Status:** Accepted — 2026-10-11 (owner, also the CSO; [GATE A](../lab/phase-1/gate-a-proposal.md) D-LAB1-08, D-LAB1-19, D-LAB1-27, E-LAB1-04, E-LAB1-05). Built on `feat/lab-safety-floor` behind `LAB_CRITICALS`; migrations 0102–0106 are GATED and owner-applied. No clinical value is set by this decision.

## Context

An alert nobody acknowledges must move up the ladder on time, and nobody must be left believing escalation runs when
the job has stopped.

## Decision

1. A pure planner (`lib/lab/criticals/escalation.ts`, ES-1 to ES-5): each level waits its own signed time from when the
   alert reached it. Level 2 is the last; the alert stays open there and is marked overdue. With no signed response
   times there is no automatic escalation, and the panel says so (S13).
2. One idempotent executor, `runEscalations`, with three callers:
   - `pg_cron` every minute via `pg_net` to `/api/cron/lab-escalations` (bearer secret from Vault), set up by the owner
     once with `private.schedule_lab_escalations(url)` (migration 0106);
   - lazily, before every read of alerts (lab Criticals, the doctor's alert, the header count);
   - tests, with a fixed clock (ES-3).
3. "Could not reach anyone" escalates at once (S9).
4. Each run writes a heartbeat. If the heartbeat is older than 3 minutes, Criticals shows "Escalations may be delayed…"
   (ES-5, S14).

## Consequences

- An escalation is written at most a minute after it is due, and at once on any read.
- Running from both the cron job and a read is harmless (idempotent).
