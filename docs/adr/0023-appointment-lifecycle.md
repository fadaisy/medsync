# ADR 0023 — Appointment lifecycle + mutation pattern

**Status:** Accepted (2026-05-27)
**Context:** Scheduling feature (migration 0028, GATEs A–G). Builds on the integration contract from the hospital-admin shell.

## Decision

The appointment is a state machine. **States:**

```
requested → pending_approval → confirmed → arrived → in_progress → completed
                                 ↘ cancelled
                                 ↘ rescheduled (links old↔new via
                                                 rescheduled_from_appointment_id)
              ↘ declined         ↘ no_show
              ↘ cancelled
```

Initial state on `pt-request-appointment`:

- clinician's `auto_confirm = true` → `confirmed`
- otherwise → `pending_approval`

Side states (`cancelled`, `declined`, `no_show`, `rescheduled`) carry a reason and a `cancelled_by_user_id`/equivalent attribution.

## Mutation pattern (every state edge)

Each state transition is a dedicated Edge Function. They share the same shape:

1. CORS preflight + method gate.
2. Zod parse of input (always includes `reason: z.string().min(8)`).
3. `getCaller(request)` — JWT-validated user from the Authorization header.
4. Role check — patient/clinician/nurse/hospital_admin/superadmin as appropriate for the edge.
5. Cross-tenant scope check via `requireHospitalAdminScope` when the caller isn't the patient or clinician.
6. State precondition check (e.g. cancel refuses already-completed; mark-no-show requires past start_time).
7. Audit first — `recordSaAudit` with action name + before/after snapshot.
8. Mutation — service-role UPDATE/INSERT on `appointments`.
9. Side-effect cleanup — reap queued `appointment_reminders` on cancel/reschedule.
10. PII-redacted info log + typed response.

The audit step running BEFORE the mutation means a partial failure leaves a documented intent that didn't take effect, not an orphan state change with no record.

## Edge Functions that ship

| Edge                                | Edge → state                                      | Caller                      |
| ----------------------------------- | ------------------------------------------------- | --------------------------- |
| `pt-request-appointment`            | requested → confirmed _or_ pending_approval       | patient                     |
| `ha-confirm-appointment-request`    | pending_approval → confirmed                      | clinician / admin           |
| `ha-decline-appointment-request`    | pending_approval → declined                       | clinician / admin           |
| `cancel-appointment`                | live → cancelled                                  | patient / clinician / admin |
| `reschedule-appointment`            | live → rescheduled + new live row                 | patient / clinician / admin |
| `ha-mark-no-show`                   | confirmed-or-arrived (past start) → no_show       | clinician / nurse / admin   |
| `ha-mark-arrived`                   | confirmed → arrived (+ queue entry for in-person) | patient / staff             |
| `ha-start-encounter`                | arrived → in_progress (+ encounter row)           | clinician / nurse           |
| `system-propose-urgent-appointment` | → confirmed (priority=urgent)                     | service-role / superadmin   |

`completed` is owned by the future clinical module — scheduling doesn't write that state, only hands the encounter row off.

## Why not a single mega Edge Function

Considered a `transition-appointment` function taking `target_state`. Rejected because:

- Each transition has different role rules. A single function would collapse them into a `case` block that hides which roles can do what.
- Each transition has different side effects (`mark_arrived` creates queue entries; `cancel` reaps reminders; `reschedule` mints a new row). A single function would be a long ladder.
- The audit `action` names need to be distinct anyway (per the `sa_audit_log.action` CHECK), so the trade-off doesn't save much code.

The per-edge Edge Functions are slightly more files but each is short, single-purpose, and easy to review independently.

## Consequences

- The partial UNIQUE index `appointments_no_double_booking` on `(clinician_user_id, starts_at) WHERE status IN ('requested','pending_approval','confirmed','arrived','in_progress')` enforces "no two live bookings at the same slot" at the DB layer. A race past the JS check still gets a 23505.
- `rescheduled_from_appointment_id` links any rescheduled chain. We don't enforce DAG-ness at the DB; it's possible to reschedule a reschedule of a reschedule. That's actually fine and useful (full history).
- `cancelled`, `no_show`, `completed` and `rescheduled` rows stay in the table forever — they're the audit trail. Cleanup is a future operational decision, not a default.
