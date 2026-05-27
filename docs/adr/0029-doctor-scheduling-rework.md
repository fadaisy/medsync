# ADR 0029 — Doctor scheduling: origins-on-calendar + dept-policy resolution

**Status:** Accepted (2026-05-27)
**Context:** [`docs/doctor-scheduling-gate-a-proposal.md`](../doctor-scheduling-gate-a-proposal.md). The scheduling addendum gave us a reusable calendar (ADR-implicit, PR #33). The doctor workspace gave us the cadre model + audited PHI access (ADRs 0027 / 0028). This ADR captures the **doctor scheduling rework's** non-obvious decisions, all presentation + orchestration (no engine, schema, or lifecycle change beyond one new Edge Function).

## Decision

### 1. The three appointment origins converge on the same calendar canvas

All three PRD origins land as `appointments` rows the calendar already renders:

| Origin                     | Visual rendering                                                                               | Doctor's path                                                                                                  |
| -------------------------- | ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Patient + auto-confirm     | Solid teal block (status: `confirmed`).                                                        | None — the doctor just sees it.                                                                                |
| Patient + manual approval  | Outlined amber block + rail entry.                                                             | Approve / decline inline on the pending rail.                                                                  |
| System (urgent from alert) | Solid block + **rose ring** (already shipped in PR #33).                                       | Open the slide-out; the `triggered_by_alert_id` surfaces (when the monitoring engine eventually populates it). |
| Walk-in / arrived          | **Not on the time-grid** (walk-ins aren't time-positioned). Lands in the day's **queue rail**. | Call → start encounter.                                                                                        |

The queue rail is a distinct surface beside the calendar, not a calendar layer. Mixing walk-ins as zero-duration time-grid blocks was rejected — it would force a meaningless start-time and visually clash with the bookable grid. The rail is honest about what walk-ins are.

### 2. Settings resolution = clinician override → dept policy → hard default

The `clinician_scheduling_settings` row is the doctor's override; absent fields fall back to `department_scheduling_policy`; absent again, the hard safe defaults (15-min slots, no buffer, manual confirm, no virtual). The UI shows `(dept default)` next to fields the doctor hasn't overridden so the doctor knows what they're inheriting.

**Why not auto-create a clinician row on first login**: it would be a write masquerading as a read, and silently locks in defaults as overrides — making "I want to follow the dept" indistinguishable from "I want exactly these values, ignore the dept." Reading is cheap; writing on intent is honest.

### 3. Cadre does NOT gate availability editing

Availability is operational ("when am I working?"), not clinical-safety. The cadre→capability mapping (ADR 0027) is for actions with clinical consequences — prescribing, admitting, discharging. Junior doctors needing per-booking triage already have the `auto_confirm = false` knob.

**If a hospital insists** juniors' schedule edits route through a supervisor, the answer is **a new `action_kind` in `clinical_cosign_policies`** (e.g. `update_availability`) — additive, no schema change. **Flagged for Clinical Safety Officer review** if a future hospital requests it.

### 4. `ha-record-walkin` Edge Function — the single behaviour addition

The `record_walkin` audit verb was reserved in migration 0028 but no Edge Function existed; without one, walk-ins couldn't enter the queue. We added the function under the existing PRD contract: reception / nurse / clinician at the hospital can call it; audited with operator-reason ≥ 8 chars; computes `sequence_number` per `(hospital, department, today)` — mirroring `ha-mark-arrived`.

Nothing else in the rework adds engine behaviour — every other action is a thin wrapper around an existing Edge Function (`ha-confirm-appointment-request`, `ha-decline-appointment-request`, `ha-mark-arrived`, `ha-start-encounter`, `ha-set-clinician-settings`).

### 5. View preference = cookie, not DB

`medsync.doctor.schedule.view` cookie, max-age 365d. No schema, no service-side state, scoped per-browser. If a future need arises for cross-device pref persistence (separate from device-specific defaults), a per-user UI-prefs table is straightforward.

## What this is NOT

- Not a new calendar — reuses PR #33's `MedSyncCalendar` component as-is.
- Not a new detail panel — reuses `AppointmentDetailSheet` from `/clinician/schedule` as-is.
- Not a new booking flow — book-on-behalf wraps the existing `/patient/book` wizard (deferred to a follow-up; the surface is flagged on the doctor schedule TODO).
- Not the card-grid alternate view — deferred to a follow-up; the calendar is sufficient for the working doctor surface.
- Not a real monitoring engine — the urgent flow's seam exists (`triggered_by_alert_id`); the alerts table itself doesn't yet.
- Not real notification dispatch — `appointment_reminders` queue is correct, dispatcher is its own ticket.

## Consequences

- The doctor's scheduling life lives in one URL (`/doctor/schedule`) — calendar + stats + pending rail + queue + settings together. No more navigating to `/clinician/availability` for routine work (the link remains for block editing).
- The pending rail only renders for manual-confirm doctors. Auto-confirm doctors get a leaner surface.
- The queue rail is department-wide (not doctor-specific) — appropriate for the cover-and-rotate reality of inpatient/OPD work.
- Walk-in recording lands a `queue_entries` row without ever touching `appointments` — the engine stays correct (no zero-duration appointments to clean up later).
- The audit trail (`sa_audit_log` + `audit_log`) captures every approval, decline, walk-in, settings change, encounter start. Nothing in this surface bypasses the audited path.

## Related

- [ADR 0023 — Appointment lifecycle](0023-appointment-lifecycle.md)
- [ADR 0024 — Urgent-from-alert fallback](0024-urgent-appointment-fallback.md)
- [ADR 0027 — Doctor cadre→capability mapping](0027-doctor-cadre-capability-mapping.md)
- [ADR 0028 — Patient access basis](0028-patient-access-basis.md)
