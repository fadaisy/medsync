# Scheduling — GATE A Proposal

> **Status: Awaiting Caroline / Usama sign-off.** Nothing in this proposal has been migrated, deployed, or merged. This is a reviewable design doc that consolidates the schema, the answers to the PRD's 7 open questions, and the dependency reality I found in reconnaissance.

## 1. Reconnaissance findings — what changes from the PRD

The PRD assumes several upstream pieces. Mapping reality before I commit:

| Dependency                                                                                | PRD assumption                                                  | Reality                                                                                                                                   | My call for GATE A                                                                                                                                                                                                                                                                                                                                     |
| ----------------------------------------------------------------------------------------- | --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Monitoring + alerts (`alerts` table, threshold-breach mechanism)                          | "build against an interface if not live"                        | **Does not exist.** No `alerts` table, no Edge Function.                                                                                  | Ship `appointments.triggered_by_alert_id` as **text, not FK**. Documented as "becomes FK to `alerts.id` when monitoring lands; backfill is the migration." Urgent-from-alert in GATE E builds against a clean **internal interface** (function signature) that anything — including a future cron, a webhook, or a manual superadmin call — can drive. |
| SMS (Africa's Talking) + Push                                                             | "wire if ready; stub if not"                                    | **Does not exist.** No client, no env var, no Edge Function. The only notifications table is `sa_notifications` (superadmin in-app only). | Ship `appointment_reminders` table (queued reminders with `channel: push                                                                                                                                                                                                                                                                               | sms | email`, `scheduled_at`, `state`). **No dispatcher in this feature.** Reminders sit in `queued` state forever until a future Africa's Talking + Web Push dispatcher Edge Function consumes them. Booking confirmations are surfaced **in-app only** (the patient sees them on their dashboard); SMS landing is a separate prompt. |
| Encounters / clinical module                                                              | "rooming creates an encounter"                                  | **Does not exist.** No `encounters` table. The clinical module hasn't shipped.                                                            | Ship a **minimal `encounters` table** (id, appointment_id, patient_user_id, clinician_user_id, hospital_id, started_at, ended_at, state) so scheduling has somewhere to hand off. The clinical module enriches the row later (vitals, notes, etc.). The seam exists and is real.                                                                       |
| Care teams / primary clinician                                                            | "booking suggests primary doctor first, then care-team members" | **Does not exist.** No `care_team` table, no `primary_clinician_id` on `patient_profiles`.                                                | Booking suggests **"any active clinician at the patient's primary facility, optionally filtered by department/specialty."** When the care-team feature lands, the suggestion logic upgrades — no schema change needed in scheduling. Documented in ADR.                                                                                                |
| Responsive primitives (`ResponsivePanel`, `MobileTabBar`, `BottomActionBar`, step-wizard) | "shared primitives used across all patient functions"           | **Do not exist.** Only `Sheet` (always side-anchored, no mobile bottom-sheet mode).                                                       | Build them in **GATE C** as the patient app's responsive foundation. Scheduling is the first consumer; future patient features inherit.                                                                                                                                                                                                                |
| Date pickers                                                                              | "the project date picker handles display"                       | **`DatePicker` + `DateRangePicker` exist** at `components/forms/`. Native mobile picker on iOS/Android.                                   | Reuse as-is for dates. **Build a small time picker** for slot selection (5 mins of work).                                                                                                                                                                                                                                                              |
| `patient_profiles.primaryFacilityId`                                                      | "patient belongs to a hospital"                                 | **Exists.** Single FK to `hospitals`. Can be NULL for a patient who hasn't set one.                                                       | Booking blocks with a friendly "set your primary hospital first" if NULL. (Cross-hospital booking remains out of scope per the PRD.)                                                                                                                                                                                                                   |
| `staff_affiliations` clinician → hospital                                                 | "clinicians scoped by hospital"                                 | **Exists.** `(user_id, hospital_id, department_id, state)`. Only `state='active'` is bookable.                                            | Booking joins through this.                                                                                                                                                                                                                                                                                                                            |
| Audit helpers + scope helpers                                                             | reused                                                          | **Exist.** `recordSaAudit`, `requireHospitalAdminScope` from prior gates.                                                                 | Add new `SaAuditAction` values via migration; reuse helpers.                                                                                                                                                                                                                                                                                           |

**What this means in practice:**

- Scheduling ships as a structurally complete feature. Booking, lifecycle, availability, queue, urgent-from-alert seam, virtual-vs-in-person, admin policy, superadmin rollup — all real, all tested.
- The pieces that _can't_ ship until upstream features land (live monitoring, SMS delivery, full clinical encounter) are **clean seams**, not invented half-features.

## 2. Answers to the PRD's 7 open questions

| #   | Question                             | Recommendation                                                                                                                                                                                                                                                                                                   | Rationale                                                                                                                        |
| --- | ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| 1   | Monitoring live or stub?             | **Stub the interface.** `triggered_by_alert_id` is text (not FK) until alerts exist. The urgent-proposal Edge Function takes the alert payload as input — anything can call it (cron, webhook, manual).                                                                                                          | Reality: no alerts table. Building the interface now means the day monitoring lands it's a wiring change, not a feature rewrite. |
| 2   | Virtual now or flag-only?            | **Flag-only.** Schema carries `type: in_person                                                                                                                                                                                                                                                                   | virtual`. Virtual appointments do NOT create queue entries. No video/tele-consult tooling built.                                 | Cheap structural change now; expensive product later. The PRD also recommends this. |
| 3   | Notifications live or stubbed?       | **Data layer ships, dispatcher doesn't.** `appointment_reminders` rows are written on booking with the right channels + scheduled_at. They sit in `queued`. In-app notification surfaces already work for booking confirmations (the patient dashboard renders them). SMS + push delivery is a separate feature. | Same logic as #1 — wire the interface, defer the integration. Reduces the surface area of "wait, why is this failing in prod?"   |
| 4   | No-show policy strictness            | **Capture reasons + surface patterns to the clinic as an operational signal. No patient-punitive automation.** A clinician marks `no_show` with a reason; aggregated counts feed the admin overview. No automatic ban, no fee, no future-block.                                                                  | Matches PRD recommendation. Consistent with patient-wellbeing principles.                                                        |
| 5   | Reminder lead time default           | **`[1440, 60]` minutes** (24h + 1h before). Configurable per department via `department_scheduling_policy.reminder_lead_minutes`.                                                                                                                                                                                | PRD recommendation. Sensible operational default.                                                                                |
| 6   | Who can book on behalf of a patient? | **Patient, clinician, nurse, reception** — all scoped to the hospital. `created_by_user_id` records who. Patient is notified when someone-else booked. Audited.                                                                                                                                                  | Common OPD reality. The audit + notification preserve the patient's awareness.                                                   |
| 7   | Buffer / slot granularity defaults   | **15-min slots, 0 buffer.** Override at department level via `department_scheduling_policy`; override at clinician level via `clinician_scheduling_settings`.                                                                                                                                                    | PRD recommendation. The defaults are sane; departments can tune.                                                                 |

## 3. Proposed schema (migration 0028)

**Additive only.** No existing column changed. Seven new tables.

### 3.1 `availability_blocks`

A clinician's declared time. Bookable blocks generate the slot grid; non-bookable blocks (teaching, ward rounds, admin, leave) carve gaps out of it.

```sql
CREATE TABLE public.availability_blocks (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id     uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  clinician_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  department_id   uuid REFERENCES public.hospital_departments(id) ON DELETE SET NULL,
  kind            text NOT NULL,
    -- bookable | teaching | ward_round | admin | leave | unavailable
  starts_at       timestamptz NOT NULL,
  ends_at         timestamptz NOT NULL,
  recurrence      text NOT NULL DEFAULT 'none',
    -- none | weekly  (extend later if needed)
  recurrence_weekday smallint,  -- 1..7 (Mon..Sun) when recurrence='weekly'
  recurrence_until timestamptz, -- nullable; rolls forever if null
  location        text,         -- e.g. 'IM Clinic Room 3'
  notes           text,
  state           text NOT NULL DEFAULT 'active',  -- active | cancelled
  created_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at),
  CHECK (kind IN ('bookable','teaching','ward_round','admin','leave','unavailable')),
  CHECK (recurrence IN ('none','weekly')),
  CHECK (state IN ('active','cancelled'))
);
CREATE INDEX availability_blocks_clinician_idx
  ON public.availability_blocks (clinician_user_id, starts_at);
CREATE INDEX availability_blocks_hospital_idx
  ON public.availability_blocks (hospital_id, starts_at);
```

**RLS:** clinician owns their own; hospital_admin/superadmin SELECT scoped; service-role writes.

### 3.2 `clinician_scheduling_settings`

Per-clinician, per-hospital config (a clinician at Mulago and a private clinic has two rows).

```sql
CREATE TABLE public.clinician_scheduling_settings (
  clinician_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  hospital_id     uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  auto_confirm    boolean NOT NULL DEFAULT false,
    -- false = manual approval before confirmed; true = requested -> confirmed directly
  default_slot_minutes integer NOT NULL DEFAULT 15,
  buffer_minutes  integer NOT NULL DEFAULT 0,
  allow_virtual   boolean NOT NULL DEFAULT false,
  allow_out_of_hours_override boolean NOT NULL DEFAULT true,
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (clinician_user_id, hospital_id),
  CHECK (default_slot_minutes BETWEEN 5 AND 240),
  CHECK (buffer_minutes BETWEEN 0 AND 60)
);
```

### 3.3 `department_scheduling_policy`

Department-level defaults the admin / HOD sets; per-clinician settings override.

```sql
CREATE TABLE public.department_scheduling_policy (
  department_id   uuid PRIMARY KEY REFERENCES public.hospital_departments(id) ON DELETE CASCADE,
  default_slot_minutes integer NOT NULL DEFAULT 15,
  default_buffer_minutes integer NOT NULL DEFAULT 0,
  default_auto_confirm boolean NOT NULL DEFAULT false,
  bookable_weekdays smallint[] NOT NULL DEFAULT ARRAY[1,2,3,4,5]::smallint[],
    -- 1..7 Mon..Sun
  bookable_start_minutes_local integer NOT NULL DEFAULT 480, -- 08:00 EAT
  bookable_end_minutes_local integer NOT NULL DEFAULT 1020,  -- 17:00 EAT
  reminder_lead_minutes integer[] NOT NULL DEFAULT ARRAY[1440, 60]::integer[],
    -- 24h + 1h before
  allow_virtual   boolean NOT NULL DEFAULT false,
  notes           text,
  updated_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
```

### 3.4 `appointments` — the core object

```sql
CREATE TABLE public.appointments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id     uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  department_id   uuid NOT NULL REFERENCES public.hospital_departments(id) ON DELETE RESTRICT,
  patient_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  clinician_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,

  starts_at       timestamptz NOT NULL,
  ends_at         timestamptz NOT NULL,

  reason          text NOT NULL,
    -- follow_up | new_concern | refill | routine | urgent_review | other
  reason_note     text,    -- optional patient/clinician explanation

  origin          text NOT NULL,
    -- patient | clinician | nurse | reception | system_urgent | walk_in
  status          text NOT NULL DEFAULT 'requested',
    -- requested | pending_approval | confirmed | arrived | in_progress | completed
    -- | cancelled | no_show | rescheduled | declined
  priority        text NOT NULL DEFAULT 'routine',
    -- routine | urgent
  type            text NOT NULL DEFAULT 'in_person',
    -- in_person | virtual  (virtual = no physical queue entry)

  location_room   text,
  cancelled_reason text,
  cancelled_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  declined_reason text,

  rescheduled_from_appointment_id uuid REFERENCES public.appointments(id) ON DELETE SET NULL,

  -- Intent: FK to alerts.id when the monitoring module ships. Until
  -- then TEXT so we can store an opaque alert payload identifier
  -- without a dangling FK. Backfill migration when alerts lands.
  triggered_by_alert_id text,

  created_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  notify_lead_minutes integer[],  -- override of department default

  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  CHECK (ends_at > starts_at),
  CHECK (reason IN ('follow_up','new_concern','refill','routine','urgent_review','other')),
  CHECK (origin IN ('patient','clinician','nurse','reception','system_urgent','walk_in')),
  CHECK (status IN (
    'requested','pending_approval','confirmed','arrived','in_progress','completed',
    'cancelled','no_show','rescheduled','declined'
  )),
  CHECK (priority IN ('routine','urgent')),
  CHECK (type IN ('in_person','virtual'))
);
CREATE INDEX appointments_patient_idx ON public.appointments (patient_user_id, starts_at DESC);
CREATE INDEX appointments_clinician_idx ON public.appointments (clinician_user_id, starts_at DESC);
CREATE INDEX appointments_hospital_status_idx ON public.appointments (hospital_id, status, starts_at);
CREATE INDEX appointments_urgent_idx ON public.appointments (hospital_id, priority, starts_at)
  WHERE priority = 'urgent';
CREATE UNIQUE INDEX appointments_no_double_booking
  ON public.appointments (clinician_user_id, starts_at)
  WHERE status IN ('confirmed','arrived','in_progress','requested','pending_approval');
```

### 3.5 `queue_entries` — same-day arrival queue

```sql
CREATE TABLE public.queue_entries (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id     uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  department_id   uuid NOT NULL REFERENCES public.hospital_departments(id) ON DELETE RESTRICT,
  appointment_id  uuid REFERENCES public.appointments(id) ON DELETE SET NULL,
    -- nullable: walk-ins have no appointment
  patient_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind            text NOT NULL,
    -- scheduled_arrival | walk_in | urgent_walk_in
  state           text NOT NULL DEFAULT 'waiting',
    -- waiting | being_seen | left | done
  arrived_at      timestamptz NOT NULL DEFAULT now(),
  called_at       timestamptz,
  called_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  completed_at    timestamptz,
  notes           text,
  -- Encounter handoff: filled when the clinician begins rooming. The
  -- encounters table is the seam to the clinical module (3.7).
  encounter_id    uuid REFERENCES public.encounters(id) ON DELETE SET NULL,
  -- Sequence within (hospital, department, date) so the patient sees
  -- their position. Computed by a trigger on INSERT.
  sequence_number integer NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CHECK (kind IN ('scheduled_arrival','walk_in','urgent_walk_in')),
  CHECK (state IN ('waiting','being_seen','left','done'))
);
CREATE INDEX queue_entries_dept_state_idx
  ON public.queue_entries (hospital_id, department_id, state, arrived_at);
```

### 3.6 `appointment_reminders`

Queued reminders. No dispatcher in this feature — rows sit in `queued` until a future Edge Function consumes them.

```sql
CREATE TABLE public.appointment_reminders (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id  uuid NOT NULL REFERENCES public.appointments(id) ON DELETE CASCADE,
  channel         text NOT NULL,  -- push | sms | email | in_app
  scheduled_at    timestamptz NOT NULL,
  state           text NOT NULL DEFAULT 'queued',
    -- queued | sent | failed | cancelled
  sent_at         timestamptz,
  failure_reason  text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CHECK (channel IN ('push','sms','email','in_app')),
  CHECK (state IN ('queued','sent','failed','cancelled'))
);
CREATE INDEX appointment_reminders_dispatcher_idx
  ON public.appointment_reminders (state, scheduled_at)
  WHERE state = 'queued';
```

### 3.7 `encounters` — minimal seam to the future clinical module

Only what scheduling needs to hand off. The clinical module enriches later.

```sql
CREATE TABLE public.encounters (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id     uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  appointment_id  uuid REFERENCES public.appointments(id) ON DELETE SET NULL,
    -- nullable: walk-ins create an encounter without an appointment
  patient_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  clinician_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  department_id   uuid REFERENCES public.hospital_departments(id) ON DELETE SET NULL,
  started_at      timestamptz NOT NULL DEFAULT now(),
  ended_at        timestamptz,
  state           text NOT NULL DEFAULT 'in_progress',
    -- in_progress | completed | cancelled
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CHECK (state IN ('in_progress','completed','cancelled'))
);
CREATE INDEX encounters_patient_idx ON public.encounters (patient_user_id, started_at DESC);
```

### 3.8 `sa_audit_log` widening

Migration 0028 also widens the action + targetKind CHECKs:

**New actions:** `book_appointment`, `confirm_appointment_request`, `decline_appointment_request`, `cancel_appointment`, `reschedule_appointment`, `mark_no_show`, `mark_arrived`, `start_encounter`, `complete_encounter`, `propose_urgent_appointment`, `record_walkin`, `set_clinician_availability`, `update_clinician_settings`, `update_department_policy`, `override_out_of_hours_booking`.

**New targetKinds:** `appointment`, `availability_block`, `queue_entry`, `encounter`, `clinician_scheduling_settings`, `department_scheduling_policy`.

## 4. RLS shape (sketched — final policies land with the migration)

- `availability_blocks` — clinician SELECT/UPDATE own; hospital_admin SELECT for own hospital; service-role full.
- `clinician_scheduling_settings` — same as availability_blocks.
- `department_scheduling_policy` — hospital_admin + HOD (when HOD role lands) SELECT/UPDATE for own department; clinicians SELECT for departments they're affiliated to.
- `appointments` — patient SELECT own; clinician SELECT own (where they're the clinician); hospital_admin SELECT scoped; care-team SELECT (when that table lands — no policy change needed now).
- `queue_entries` — same hospital-scoped read; mutation via Edge Function (service-role).
- `appointment_reminders` — service-role only (admin-internal infrastructure).
- `encounters` — patient SELECT own; clinician SELECT own; hospital_admin SELECT scoped. Mutation deferred to clinical module.

## 5. Edge Functions to build

Following the integration contract from the hospital-admin shell (CORS → method → Zod → caller → role → scope → audit → mutation → log → typed response). Approx 14 new functions across the 7 gates:

| Gate | Function                            | Purpose                                                                                                                                                                                      |
| ---- | ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B    | `ha-set-clinician-availability`     | Create/update an availability block (clinician or admin-on-behalf).                                                                                                                          |
| B    | `ha-cancel-clinician-availability`  | Cancel a block; refuse if it conflicts with confirmed appointments.                                                                                                                          |
| B    | `ha-set-clinician-settings`         | Update auto-confirm + slot/buffer settings.                                                                                                                                                  |
| C    | `pt-request-appointment`            | Patient submits a booking. Returns `confirmed` (auto-confirm) or `pending_approval`.                                                                                                         |
| D    | `ha-confirm-appointment-request`    | Clinician confirms a pending request.                                                                                                                                                        |
| D    | `ha-decline-appointment-request`    | Clinician declines; reason required.                                                                                                                                                         |
| D    | `cancel-appointment`                | Patient or staff cancels; reason required.                                                                                                                                                   |
| D    | `reschedule-appointment`            | Mints a new appointment + links via `rescheduled_from_appointment_id`.                                                                                                                       |
| D    | `ha-mark-no-show`                   | Clinician/nurse marks a confirmed appointment as no-show after a window.                                                                                                                     |
| E    | `system-propose-urgent-appointment` | The interface for monitoring. Widening fallback (primary doc → care team → any clinician in department). Internal-call-only via service-role + a header secret OR superadmin manual trigger. |
| E    | `ha-mark-arrived`                   | Patient arrives; creates `queue_entries` row + sets appointment to `arrived`.                                                                                                                |
| E    | `ha-start-encounter`                | Clinician calls a queue entry; creates `encounters` row + flips appointment to `in_progress`.                                                                                                |
| F    | `ha-update-department-policy`       | Hospital admin updates department scheduling policy.                                                                                                                                         |
| F    | `pt-record-walkin`                  | Walk-in registration (patient or reception); no appointment, direct queue entry.                                                                                                             |

All write `sa_audit_log` rows with operator reasons. Service-role-only mutations on the underlying tables.

## 6. Responsive primitives (GATE C foundation)

Five new components, built once, reused everywhere a patient surface needs to be mobile-native:

1. **`ResponsiveSheet`** — wraps the existing `Sheet`. Side-anchored on `md:` and up; bottom-anchored full-height drag-to-dismiss on mobile. Same API as `Sheet`.
2. **`MobileTabBar`** — bottom-pinned tab bar (Home / Appointments / Records / More). Renders only `< md`; the desktop equivalent is the existing sidebar.
3. **`BottomActionBar`** — sticky bottom strip for primary CTA (Confirm, Book, Save). Auto-stacks the "Continue" button + "Back" link on mobile; in-flow on desktop.
4. **`StepWizard`** — multi-step form pattern (one decision per screen on mobile, progressively disclosed steps on desktop). Includes step indicator, swipe-back, keyboard nav.
5. **`ResponsiveTable`** — dense table on `md:` and up; stacked tappable cards on mobile. Same column config drives both.

All five live under `components/responsive/` so the patient surfaces and future features find them in one place.

## 7. Out of scope (explicit — will be flagged at GATE G)

- Cross-hospital booking / referrals.
- Tele-consult video tooling for virtual appointments (only the `type=virtual` flag ships).
- Africa's Talking SMS dispatcher Edge Function (reminders queue but never send).
- Web Push / Expo Push dispatcher.
- Live monitoring integration (the interface ships; the producer doesn't exist).
- Full clinical encounter UI (we ship a minimal `encounters` row only).
- Care-team based suggestions (booking suggests "any active clinician at the patient's primary facility").
- Patient-punitive no-show automation.

## 8. Asks of you before I migrate anything

Please confirm or override each of these. Anything you don't speak to, I'll proceed with the recommendation as written.

1. **Schema (Section 3)** — any tables you'd shape differently? Any column to add/remove? Especially: `appointments.reason` enum values (`follow_up | new_concern | refill | routine | urgent_review | other`) — does that match the OPD reality, or do we need `lab_review`, `vaccination`, `mch`, etc.?
2. **Booking permissions (Q6)** — confirm patient/clinician/nurse/reception is the right set. Anyone else? (HOD? Pharmacist?)
3. **Reminder defaults (Q5)** — `[1440, 60]` minutes (24h + 1h). OK?
4. **Slot / buffer defaults (Q7)** — 15 min slots, 0 buffer. OK as global default? Departments will tune.
5. **Out-of-hours override default (clinician settings)** — `allow_out_of_hours_override: true` (clinician's discretion). OK?
6. **Out-of-scope list (Section 7)** — anything you want pulled back in?
7. **Urgent-from-alert interface** — for the producer side of GATE E, I'll define a function `proposeUrgentAppointment({ patient_user_id, hospital_id, reason_note, alert_id_text })` callable by either the future monitoring module OR a superadmin manual trigger. Sound right, or do you want different shape?

Once you sign off (anything from "looks good, ship it" to "change #X then go"), I'll write migration 0028, propose it to the linter / typecheck, and move into GATE B.
