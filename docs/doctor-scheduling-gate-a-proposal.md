# Doctor Scheduling Rework — GATE A Proposal

> **Status: Awaiting Caroline / Usama sign-off.** Nothing migrated, deployed, or merged. This is a reviewable design doc consolidating recon + the reuse-vs-stub matrix + cadre/availability question + dept-policy source + any schema deltas, per the kickoff's GATE A.

## 1. What the rework is

Re-express the doctor's scheduling surface so the **calendar (just shipped in PR #33) is the primary canvas** and the **card/stat-rail is the alternate browse view**. Behaviour stays the PRD's; presentation switches to the addendum's; scope stays the doctor-workspace cadre model's. Today's calendar is read-only; we're adding the orchestration + interactions on top.

## 2. Engines + components — reuse vs stub

| Piece                                                                                                                        | Status                                         | Note                                                                                                                                                                                                                                                                                                                                             |
| ---------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Appointments table + state machine                                                                                           | **Reuse**                                      | Migration 0028; ADR 0023. Lifecycle: `requested → pending_approval → confirmed → arrived → in_progress → completed`, sides: `cancelled / declined / no_show / rescheduled`.                                                                                                                                                                      |
| Availability blocks + recurrence                                                                                             | **Reuse**                                      | `availability_blocks` (kind: `bookable / teaching / ward_round / admin / leave / unavailable`; `recurrence: none / weekly`).                                                                                                                                                                                                                     |
| `clinician_scheduling_settings` (auto-confirm, slot, buffer, virtual, OOH override)                                          | **Reuse**                                      | Exists. Read for the auto-confirm toggle + the booking flow's slot generation.                                                                                                                                                                                                                                                                   |
| `department_scheduling_policy` (default slot / buffer / auto-confirm / bookable weekdays / hours / reminder leads / virtual) | **Reuse as source-of-truth for dept defaults** | See §4.                                                                                                                                                                                                                                                                                                                                          |
| Encounter handoff (`ha-start-encounter`)                                                                                     | **Reuse**                                      | Existing Edge Function. `arrived → in_progress` transitions land here.                                                                                                                                                                                                                                                                           |
| Urgent-from-alert flow (`system-propose-urgent-appointment`)                                                                 | **Reuse the seam**                             | Edge function exists; **no alerts table yet** (monitoring engine deferred per the patient-workspace ADR family). The doctor calendar shows urgent appointments with the rose ring already (calendar GATE A); the alert link surface on the slide-out is a small addition.                                                                        |
| `queue_entries` table (waiting / being_seen / left / done; kinds `scheduled_arrival / walk_in / urgent_walk_in`)             | **Reuse**                                      | Table exists in migration 0028. **No UI yet.** Walk-in renders + arrival-from-scheduled need building (this gate).                                                                                                                                                                                                                               |
| Walk-in record Edge Function                                                                                                 | **Net-new (small)**                            | `record_walkin` audit verb is reserved (migration 0028) but no `*-record-walkin` Edge Function file exists. **Flagged per the kickoff** as the one behaviour addition required — without it, walk-ins can't enter the queue. Proposed: `ha-record-walkin` (hospital_admin / reception / nurse, audited, validates patient + department).         |
| Approval / cancel / reschedule / no-show / mark-arrived Edge Functions                                                       | **Reuse**                                      | All exist: `ha-confirm-appointment-request`, `ha-decline-appointment-request`, `cancel-appointment`, `reschedule-appointment`, `ha-mark-no-show`, `ha-mark-arrived`.                                                                                                                                                                             |
| Booking flow (patient + on-behalf)                                                                                           | **Reuse `/patient/book`** for the patient path | The PRD's "book on behalf" path needs a clinician/reception entry point. **Today it doesn't exist as a UI** — the Edge Function (`pt-request-appointment`) accepts the request regardless of caller, but only the patient surface drives it. Book-on-behalf UI is built in GATE E (reuses the same booking wizard with a "patient picker" step). |
| Calendar component (month/week/day/agenda + view switcher + slide-out hookup)                                                | **Reuse (just shipped PR #33)**                | The doctor calendar at `/doctor/schedule` already renders availability + appointments; click → AppointmentDetailSheet. We extend, don't rebuild.                                                                                                                                                                                                 |
| AppointmentDetailSheet (confirm / decline / cancel / no-show)                                                                | **Reuse**                                      | At `app/clinician/schedule/_components/appointment-detail-sheet.tsx`. Add: arrived → start-encounter button (GATE C); urgent's alert-link line (GATE D).                                                                                                                                                                                         |
| Monitoring engine + alerts table                                                                                             | **Stubbed (honest)**                           | The urgent flow has the input seam (`triggered_by_alert_id` text column). The doctor surface shows the column when present; otherwise renders generic "Urgent".                                                                                                                                                                                  |
| Notifications dispatcher (push / SMS)                                                                                        | **Stubbed**                                    | `appointment_reminders` are queued but not sent. UI shows "we'll text the patient" / "reminder queued" — honest framing per the patient-workspace pattern.                                                                                                                                                                                       |
| Care-team coordination tables                                                                                                | **Stubbed (per ADR 0027)**                     | The slide-out shows "Care-team view lands with the clinical module" — no fake content.                                                                                                                                                                                                                                                           |

**Net-new in this feature (presentation + orchestration only):**

| Surface                                               | What lands                                                                                                                              |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Doctor scheduling shell (`/doctor/schedule` extended) | View switcher (calendar ⇄ grid ⇄ list — calendar already in); availability inline-edit; stat-card rail; pending-approvals rail.         |
| Card-grid alternate view                              | Per the addendum — time-pill + reason + patient-code/avatar. Sortable / period-selected.                                                |
| Pending-approvals rail (manual-confirm doctors only)  | Reuses `ha-confirm-appointment-request` / `ha-decline-appointment-request` inline.                                                      |
| Stat rail                                             | Total / Confirmed / Pending / Urgent / Completed / Cancelled for the selected period; trend delta vs prior period; honest zero states.  |
| Day view + live queue rail                            | Renders `queue_entries` for the doctor's department + today; click `waiting` → call → `being_seen` (action wraps `ha-start-encounter`). |
| `ha-record-walkin` Edge Function                      | Net-new (small) — see above.                                                                                                            |
| Book-on-behalf entry point                            | Wraps the patient booking wizard with a patient picker as Step 0.                                                                       |

**Honestly stubbed in the UI** (the screen shows them but the underlying engine isn't live):

- The slide-out's "Why was this urgent?" line displays `triggered_by_alert_id` when present; says "no source alert" when null.
- Notification status on actions ("we'll text the patient" rather than "texted").

## 3. Cadre → availability-edit rights

**Recommendation: cadre does NOT gate availability editing. Every active doctor edits their own; HOD / hospital admin can edit anyone's in their department.**

**Rationale:**

1. Availability is **operational, not clinical-safety**. The cadre→capability matrix (ADR 0027) was scoped to actions with clinical consequences — prescribing, admitting, discharging. "When am I free this week?" doesn't fit that taxonomy.
2. The PRD's "auto-confirm vs manual-approval" toggle is already a per-clinician knob; juniors who feel they need senior triage on every booking can simply leave it `manual` (the safer default for juniors anyway).
3. Edge-of-policy cases (a hospital that wants "interns can't run their own clinic without supervisor sign-off on the schedule") can be expressed via the **department scheduling policy** rather than a new cadre lock — the policy can override the doctor's autonomy at the hospital's discretion.

**Where it would change**: if a hospital insists juniors' schedule edits route through the supervisor first, that's a new co-sign action kind (`update_availability`) added to the existing `clinical_cosign_policies` matrix from ADR 0027 — **no schema change**, just a new `action_kind` enum value. **Flagged for Clinical Safety Officer review** if the answer is yes.

**Ask:** (Q-1) Default: doctors edit their own availability without supervisor co-sign. OK to ship that way? (Adding a co-sign path later is a small, additive change.)

## 4. Department default policy source

**Single source of truth: the `department_scheduling_policy` table** (migration 0028).

- `default_slot_minutes`, `default_buffer_minutes`, `default_auto_confirm` — the policy defaults the doctor inherits when they haven't overridden their own `clinician_scheduling_settings`.
- `bookable_weekdays`, `bookable_start_minutes_local`, `bookable_end_minutes_local` — the department's working window (rendered as the calendar's bookable backdrop).
- `reminder_lead_minutes` — the cadence the reminders queue uses.
- `allow_virtual` — whether the doctor can opt-in to virtual via their own settings.

**Resolution order at any decision point** (booking validation, slot generation, calendar render):

1. The doctor's own `clinician_scheduling_settings` row, if present.
2. Otherwise the `department_scheduling_policy` row.
3. Otherwise hard-coded safe defaults (480–1020 min local = 08:00–17:00 EAT; 15-min slots; 0 buffer; manual confirm).

The UI's "Your settings" panel shows the effective value + a small note "(department default)" when the doctor hasn't overridden. Editing the field on the doctor's panel writes to `clinician_scheduling_settings`, never to the policy. **No new tables.**

**Ask:** (Q-2) OK with the resolution order above? Specifically — when a doctor hasn't set their own settings yet, should the calendar render with department defaults from day one, or should we show an empty "set up your schedule" CTA?

## 5. Schema deltas

**None to migrate.** Two soft additions, both client-side / API-side only:

1. **View preference (last-chosen calendar view + last-chosen alternate)**: stored in a cookie (`medsync.doctor.schedule.view`, max-age 365d). No DB schema change. Survives sessions, scoped per-browser.
2. **`record_walkin` audit verb**: already reserved in migration 0028's `sa_audit_log` CHECK. The Edge Function lands without a migration.

**Ask:** (Q-3) Cookie-based view pref vs a DB-persisted per-user UI pref? Cookie is simpler + sufficient unless you want it to survive a new browser.

## 6. Origins on the calendar — the rendering rules

These are presentation rules only; the engine already classifies appointments correctly.

| Origin                           | Calendar rendering                                                                                                          | Pending-rail rendering                                                               |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Patient → auto-confirm doctor    | Solid block, status colour `confirmed` (teal). No pending-rail entry.                                                       | —                                                                                    |
| Patient → manual-approval doctor | Outlined / muted block, status colour `pending` (amber).                                                                    | Appears in the rail with inline Accept / Reject.                                     |
| Urgent (system-from-alert)       | Solid block + **rose ring** (already shipped in calendar GATE A); top-of-day in stat rail.                                  | If `pending_approval` for any reason, also appears in the rail with an "Urgent" tag. |
| Walk-in (queue)                  | Does **not** appear on the time-grid (walk-ins aren't time-positioned). Appears in the **live queue rail** beside day view. | —                                                                                    |
| Arrived (scheduled → arrived)    | Time block flips status colour to `arrived` (blue). Also surfaces in the live queue rail with kind=`scheduled_arrival`.     | —                                                                                    |
| In progress                      | Time block flips colour. The encounter Edge Function fires on "Call / Start".                                               | —                                                                                    |
| Completed / cancelled / no-show  | Standard muted / strike-through rendering already shipped in calendar GATE A.                                               | —                                                                                    |

## 7. Out of scope (explicit — flagged at GATE F)

- Monitoring engine + real alerts (so all "urgent" today is synthetic / manually triggered — the seam is correct).
- Real notification dispatch (SMS / push) — reminders queue stays accurate; sending is its own ticket.
- Care-team coordination per-patient surface — the slide-out shows the placeholder.
- HOD's department calendar overlay — the HOD surface doesn't exist (per scheduling addendum recon). The doctor's aggregate utilisation feeds the HOD's eventual dashboard via plain queries; nothing to wire here.
- Patient-side calendar — the patient app uses the redesigned card list at `/patient/appointments` (already shipped). No calendar for the patient.
- Tele-consult video for `type=virtual` — the calendar shows a virtual tag; the meeting URL surface is a separate ticket.

## 8. Asks of you before I build

1. **Cadre on availability (§3)**: ship the "every doctor edits their own; HOD edits dept" default? Co-sign path deferrable as additive later?
2. **Default policy resolution (§4)**: order is clinician-settings → dept-policy → hard-coded; with a "(department default)" hint inline. OK? Empty CTA vs immediate calendar with defaults?
3. **View pref storage (§5)**: cookie-only? Or a DB pref?
4. **`ha-record-walkin` Edge Function (§2)**: this is the one new behaviour addition (no walk-in UI works without it). Authoring it under the existing PRD's Edge Function contract — hospital_admin / nurse / reception only; operator-reason ≥ 8 chars; audited. OK?
5. **Out-of-scope list (§7)**: anything you want pulled back in?

Once signed off, I build GATE B → F. No migration is required for the doctor scheduling rework itself.
