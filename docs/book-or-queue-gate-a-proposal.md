# Book-or-Queue — GATE A wire-up proposal

**Status:** Awaiting sign-off (2026-05-30)
**Scope:** Per `prompts/book-or-queue-kickoff.md`. Wire the post–primary-hospital-selection moment into a two-door choice point that reuses the existing scheduling-booking engine + entry-points pre-queue. **No new engine.**

---

## 1. Wire-up confirmation

| Door                    | Reuses                                                                                                                              | Net-new                                                                                                                     |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| **Book an appointment** | [`/patient/book`](../app/patient/book/page.tsx) wizard → `pt-request-appointment` Edge Function → existing `appointments` lifecycle | nothing — already exists                                                                                                    |
| **Join today's queue**  | [`patient_intakes`](../db/schema/patient-intakes.ts) table + entry-types taxonomy + RLS already wired by migration 0032             | one Edge Function (`pt-declare-intake`), one patient route (`/patient/queue`), one new status value (`'declared'`) — see §2 |
| **Not now**             | navigation only — patient stays on `/patient`                                                                                       | nothing                                                                                                                     |

The choice point itself is a small client surface that lives:

- **Inline on `/patient/hospitals`** after a successful `selectPrimaryHospitalAction` — replaces the current single "Book a visit here" CTA
- **As a quick-action tile-group on `/patient`** — replaces the current single "Book a visit" tile, becomes "Today / Future" pair

No primary-hospital flow change; we keep [`selectPrimaryHospitalAction`](../app/patient/hospitals/actions.ts) as-is.

---

## 2. Pre-queued vs arrived — proposed schema delta (Migration 0035)

The kickoff calls out distinguishing **declared** (patient said "I'm coming today") from **arrived** (patient is physically present / checked in). Today `patient_intakes.status` is `('arrived','awaiting_triage','triaged','completed','cancelled')` — there is no place to live for "intake created by the patient, not yet here."

**Proposed (additive only):**

1. Widen `intakes_status_check` to include `'declared'`. The state graph becomes:
   ```
   declared ──(reception/auto check-in)──▶ arrived ──▶ awaiting_triage ──▶ triaged ──▶ completed
       │                                       │              │              │
       └─────────────────── cancelled ─────────┴──────────────┴──────────────┘
   ```
2. Add nullable column `checked_in_at timestamptz` — populated at the `declared → arrived` transition. `arrived_at` keeps its existing semantics ("intake row created at"); for `'declared'` rows that's the declaration moment, and for staff-created rows it's still the physical-arrival moment as today. The new column makes the "actually here at" timestamp first-class without re-typing the existing one.
3. Add nullable `declared_by_patient boolean` (default false) — explicit flag so staff boards can render a chip distinguishing patient-initiated declarations from staff-registered intakes, without inferring from "no `registered_by_user_id`". Trivial column, trivial RLS impact.

**Index updates:**

- Extend `patient_intakes_hospital_status_idx` partial-index predicate to include `'declared'`: `WHERE status IN ('declared','arrived','awaiting_triage')` — keeps the today-board query path on the hot index.

**Status-graph enforcement:** Today there's no state-machine trigger; transitions are enforced application-side. We keep that — `pt-declare-intake` inserts `status='declared'`; the existing `ha-check-in-patient` Edge Function extends to also accept a `declared` intake and flip it forward (instead of always creating a new row from a booking). See §5.

**Why this delta is minimum-viable:**

- One status value + one timestamp + one boolean. No new tables.
- All existing intake reads (reception today board, dept queues, nurse arrivals view) need ONE filter widening to include `'declared'`; nothing breaks if they don't get it (declared rows just don't appear).
- RLS unchanged — the existing `patient_intakes_select_scoped` policy already grants the patient SELECT on their own intake row, so the patient can poll status from their workspace.

---

## 3. Department / service selection for queue

Reuse [`listDepartments({ hospitalId })`](../lib/reference-data.ts) — already returns top-level departments at the chosen hospital. The patient picks one. We make this the only required field (plus optional reason note) — no clinician choice (queue is dept-scoped per kickoff §3 and matches entry-points already-built behaviour).

---

## 4. Capacity / closed handling

We have no `accepting_walkins` or `closed_today` flags on `hospital_departments` or `departmentSchedulingPolicy`. **Proposal: do NOT add one in this gate** — reuse the signals we already have, honestly:

- **"Open for walk-in today?"** = `departmentSchedulingPolicy` exists for this dept AND today's weekday is in `bookableWeekdays` AND current-time-local is within `[bookableStartMinutesLocal, bookableEndMinutesLocal]`.
- **If "no" →** the queue step for that dept disables with copy _"This department isn't accepting same-day visits today. You can book a future appointment instead → Book."_ Never fabricate an open queue.
- **Capacity →** show real-time count of `'declared' + 'arrived' + 'awaiting_triage'` intakes for that dept today: _"12 ahead right now."_ No estimated wait time (we don't have one); no hard cap.

**Trade-off explicitly accepted:** A department that has a clinician availability block today but no `departmentSchedulingPolicy` row will read as "closed" by this heuristic. Mitigation: hospitals with patient-facing queue intent should always have a policy row anyway; the admin Department-policy editor (built earlier) prompts for this. If this becomes a real friction point in pilot, we add `accepting_walkins` flag — additive, deferred.

---

## 5. Entry type + Edge Function

- **Entry type:** reuse `walk_in` from migration 0032's seeded taxonomy. The patient-initiated case is conceptually a walk-in; `status='declared'` carries the "they haven't shown up yet" semantic. **No new entry-type row.**
- **New Edge Function: `pt-declare-intake`** (patient-initiated, parallels `pt-request-appointment`):
  - Input: `hospital_id`, `receiving_department_id`, optional `presenting_complaint`
  - Auth: caller must be the patient themselves (patient_user_id = auth.uid())
  - Validates: dept belongs to hospital; dept is "open for walk-in today" per §4; patient does NOT already have a confirmed/arrived appointment for today at this dept (see §6 reconciliation)
  - Writes: `patient_intakes` row with `entry_type_code='walk_in'`, `status='declared'`, `declared_by_patient=true`, `patient_user_id=auth.uid()`, `registered_by_user_id=auth.uid()`, `priority_hint='routine'`
  - sa_audit_log verb: new — `'patient_declare_intake'`
- **Extend existing `ha-check-in-patient` Edge Function** to accept `intake_id` as an alternative to `appointment_id`. When given an `intake_id` of a `declared` row, it flips status to `'arrived'` + stamps `checked_in_at`. No duplicate row.

---

## 6. Edge cases / rules

| Case                                                                        | Rule                                                                                                                                                                                                                                                                                                                          |
| --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Patient has a confirmed appointment today at the same dept                  | `pt-declare-intake` rejects with 409 + payload `{existing_appointment_id, starts_at}`. UI surfaces "You already have a booking at HH:MM — we'll check you in when you arrive" with a link to that appointment.                                                                                                                |
| Patient has a confirmed appointment today at a DIFFERENT dept               | Allowed. Per-event presence is already the model; two separate intake/appointment rows.                                                                                                                                                                                                                                       |
| Patient already has a `declared` or `arrived` intake today at this hospital | Reject with 409 — link to the existing queue ticket.                                                                                                                                                                                                                                                                          |
| Department not "open for walk-in today" (§4)                                | Reject with 409 — UI offers booking instead.                                                                                                                                                                                                                                                                                  |
| Emergency self-presentation                                                 | Out of scope for this consumer flow — kickoff §6 is explicit. Emergencies route via in-person presentation + staff-side entry-points (`emergency_self_presentation` type, `allows_unknown_patient=true`). The UI surfaces the emergency-care guidance prominently but does NOT route emergencies through `pt-declare-intake`. |

---

## 7. Staff surfacing (no new mechanics — reuse staggered presence)

| Surface                                                                 | Today                                                                    | After this gate                                                                                       |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| Reception today board ([`fetchTodayFlow`](../lib/reception/queries.ts)) | Lists `arrived`+`awaiting_triage`+`triaged` intakes + appointments       | Widens to also list `declared` intakes, with a "Declared · not here yet" chip distinct from "Arrived" |
| Department queue (nurse/doctor incoming-intake panels)                  | Filters on `arrived`+`awaiting_triage`                                   | Widens to also include `declared` — chip distinguishes; pre-arrival rows are sortable below arrivals  |
| Clinician schedule                                                      | Unchanged — bookings only (queue is dept-scoped, not clinician-scoped)   | Unchanged                                                                                             |
| Patient view (`/patient/queue/[intakeId]` or extend `/patient`)         | n/a                                                                      | Live status: "You're declared · 12 ahead" → "You're here · awaiting triage" once checked in           |
| Admin / superadmin aggregates                                           | Booking vs walk-in mix already partially trackable via `entry_type_code` | Same — `'declared'` rolls under the same `walk_in` entry_type for aggregate purposes                  |

No new RLS, no new policies — the existing `patient_intakes_select_scoped` already gates by hospital affiliation + patient ownership.

---

## 8. Net-new files / routes

```
supabase/migrations/0035_intake_declared_status.sql      ← schema delta (§2)
supabase/functions/pt-declare-intake/index.ts             ← new (§5)
supabase/functions/ha-check-in-patient/index.ts           ← MODIFY: accept intake_id
db/schema/patient-intakes.ts                              ← MODIFY: add columns
lib/reception/queries.ts                                  ← MODIFY: widen status filter
app/patient/hospitals/_components/post-select-choice.tsx  ← new (the choice card)
app/patient/page.tsx                                      ← MODIFY: replace single book tile with Book / Queue pair
app/patient/queue/page.tsx                                ← new (dept picker + declare flow)
app/patient/queue/[intakeId]/page.tsx                     ← new (live status + cancel)
app/patient/queue/actions.ts                              ← new (calls pt-declare-intake)
docs/adr/0034-book-or-queue-choice-point.md               ← new (closeout)
```

---

## 9. Explicitly deferred (out of GATE A–D scope)

- `accepting_walkins` / `closed_today` admin flag (§4 — reuse policy instead)
- Estimated-wait-time calculation (no signal today; show count-ahead only)
- Patient name-search / phone-search Edge Function (already deferred from reception PR)
- Queue position notifications (push / SMS) — separate ticket
- Auto-decay of stale `declared` intakes after EOD — cron, separate ticket

---

## 10. ADR placeholder

ADR 0034 — "Patient-initiated intake is a status, not a new entry type" — will land at GATE D closeout. Captures: why we widened status instead of adding an entry type; why we reuse `departmentSchedulingPolicy` for capacity; why patient-side writes go through a `pt-*` Edge Function with the same sa_audit shape as `pt-request-appointment`.

---

**STOP — awaiting sign-off on:**

1. Schema delta scope (§2): adding `'declared'` + `checked_in_at` + `declared_by_patient` to `patient_intakes` is the minimal-viable change. Approve?
2. Reuse `departmentSchedulingPolicy` for "open today?" instead of new flag (§4). Approve?
3. Reuse `walk_in` entry-type rather than a new `patient_declared` type (§5). Approve?
4. Reconciliation rule §6: same-dept-today-booking → reject declare (409, link to booking). Approve?
