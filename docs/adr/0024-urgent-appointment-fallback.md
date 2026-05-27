# ADR 0024 — Urgent appointment widening fallback + alert-id seam

**Status:** Accepted (2026-05-27)
**Context:** Scheduling feature, GATE E. Implements PRD §1.4.

## Decision

**Producer interface.** The urgent path has one producer-facing Edge Function — `system-propose-urgent-appointment` — callable by:

- the future monitoring/alerts module (service-role + a secret), OR
- a superadmin (manual override).

Both go through the same code path, so monitoring landing later is a wiring change, not a new feature.

**Alert id is text, not a foreign key.** `appointments.triggered_by_alert_id` is a `text` column. When the monitoring module ships an `alerts` table, a follow-up migration upgrades the column to a real `uuid REFERENCES alerts(id)` with a backfill (text → uuid cast where valid; null otherwise). The interface and the data model already align; the wire is the only missing piece.

**Widening fallback.** When picking a clinician for the urgent slot:

1. **(Phase 1 hook)** The patient's primary clinician in the preferred department — _not yet implemented_ because the care-team concept doesn't exist. The function leaves a comment marker where the fallback step lands. Until then, step 1 collapses into step 2.
2. Any active clinician at the preferred department.
3. Any active clinician at the hospital.

For each candidate, the earliest bookable slot in the next 7 days wins. Selection is greedy — earliest available across all candidates, not first candidate's slot.

**Urgent skips manual approval.** Status lands at `confirmed`, not `pending_approval`, regardless of the clinician's `auto_confirm` setting. The clinician sees the urgent appointment on their schedule with a red accent dot + can decline / cancel if they need to — but the patient gets a confirmed slot immediately. Per PRD: "your care team wants to see you", not "we're asking your clinician for permission to slot you in."

**Reminders** are 30 + 5 minutes before (not the standard 24h + 1h) because urgent means soon.

## Why not block on monitoring landing

The PRD called this out: "build against an interface/stub now so the urgent seam is real and ready." Reasoning:

- The data model for an appointment doesn't depend on the alert's shape. Storing an opaque pointer is enough.
- Monitoring's design is in-flight and its rate / latency / payload aren't pinned. Building the producer here means we can iterate the consumer (`system-propose-urgent-appointment`) without churn on the monitoring side.
- The superadmin can drive it manually today via the same function — gives an emergency override even before monitoring exists.

## What "monitoring landed" looks like, concretely

When the alerts module ships:

1. A new migration adds `public.alerts` + RLS + indexes.
2. A follow-up migration converts `appointments.triggered_by_alert_id text` → `uuid REFERENCES public.alerts(id) ON DELETE SET NULL`. Backfill: rows whose existing text value parses as a uuid AND matches an alert row get the FK; the rest become null.
3. The alerts producer (a cron / DB trigger / Edge Function depending on how monitoring is built) calls `system-propose-urgent-appointment` with the new alert's uuid. No change in the consumer.

## Consequences

- The day a urgent appointment fires, the patient gets a confirmed slot and the clinician sees red on their schedule. They can decline (decline-appointment-request still works against urgent rows; `declined_reason` surfaces back).
- "No urgent slot found in the next 7 days" returns 404 with a clear reason. The PRD says this should "escalate as a flagged urgent item" — for now the 404 is the escalation signal; a future surface in the superadmin workspace shows these failures (deferred to its own ticket).
- Per-clinician opt-out from urgent isn't supported. Adding it would mean another setting on `clinician_scheduling_settings`; not built because the current shape favours "urgent reaches whoever is available" over "this clinician is too busy for urgents."
