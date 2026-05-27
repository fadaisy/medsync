-- 0028 — Scheduling, Appointments & Booking foundation.
--
-- Per docs/scheduling-gate-a-proposal.md (signed off 2026-05-27).
--
-- Additive only. Seven new tables:
--   1. availability_blocks
--   2. clinician_scheduling_settings
--   3. department_scheduling_policy
--   4. appointments              (the core object)
--   5. encounters                (minimal seam to the future clinical module)
--   6. queue_entries
--   7. appointment_reminders
--
-- Plus a widening of sa_audit_log.action + target_kind CHECKs.
--
-- Notes:
--   - `appointments.triggered_by_alert_id` ships as TEXT (not FK). The
--     monitoring module hasn't shipped; when alerts table lands, a
--     future migration upgrades this to a real FK with a backfill.
--   - `queue_entries.encounter_id` -> encounters(id) — encounters is
--     created BEFORE queue_entries so the FK validates.
--   - All mutation paths go through Edge Functions running as
--     service-role. RLS policies grant SELECT to the right roles +
--     deny writes to authenticated. The agreement-gate pattern is
--     reused: write paths happen out-of-band via Edge Functions, and
--     the table-level audit trigger captures every change.


-- ─── 1. availability_blocks ──────────────────────────────────────────
CREATE TABLE public.availability_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  clinician_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  department_id uuid REFERENCES public.hospital_departments(id) ON DELETE SET NULL,

  kind text NOT NULL,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,

  recurrence text NOT NULL DEFAULT 'none',
  recurrence_weekday smallint,
  recurrence_until timestamptz,

  location text,
  notes text,
  state text NOT NULL DEFAULT 'active',

  created_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT availability_blocks_kind_check CHECK (
    kind IN ('bookable','teaching','ward_round','admin','leave','unavailable')
  ),
  CONSTRAINT availability_blocks_recurrence_check CHECK (
    recurrence IN ('none','weekly')
  ),
  CONSTRAINT availability_blocks_state_check CHECK (state IN ('active','cancelled')),
  CONSTRAINT availability_blocks_time_order CHECK (ends_at > starts_at),
  CONSTRAINT availability_blocks_weekday_range CHECK (
    recurrence_weekday IS NULL OR recurrence_weekday BETWEEN 1 AND 7
  )
);
CREATE INDEX availability_blocks_clinician_idx
  ON public.availability_blocks (clinician_user_id, starts_at);
CREATE INDEX availability_blocks_hospital_idx
  ON public.availability_blocks (hospital_id, starts_at);

ALTER TABLE public.availability_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.availability_blocks FORCE ROW LEVEL SECURITY;

-- SELECT: clinician sees their own; hospital_admin sees their hospital;
-- superadmin sees all. (Other clinicians at the same hospital can also
-- see — useful for HOD oversight and for the booking surface.)
CREATE POLICY availability_blocks_select_scoped ON public.availability_blocks
  FOR SELECT TO authenticated
  USING (
    clinician_user_id = auth.uid()
    OR public.user_has_role('superadmin')
    OR public.user_has_role('hospital_admin', hospital_id)
    OR public.user_has_role('clinician', hospital_id)
    OR public.user_has_role('nurse', hospital_id)
  );

-- No INSERT/UPDATE/DELETE for authenticated — Edge Functions (service-role) own it.


-- ─── 2. clinician_scheduling_settings ────────────────────────────────
CREATE TABLE public.clinician_scheduling_settings (
  clinician_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,

  auto_confirm boolean NOT NULL DEFAULT false,
  default_slot_minutes integer NOT NULL DEFAULT 15,
  buffer_minutes integer NOT NULL DEFAULT 0,
  allow_virtual boolean NOT NULL DEFAULT false,
  allow_out_of_hours_override boolean NOT NULL DEFAULT true,
  notes text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  PRIMARY KEY (clinician_user_id, hospital_id),
  CONSTRAINT clinician_scheduling_slot_range CHECK (default_slot_minutes BETWEEN 5 AND 240),
  CONSTRAINT clinician_scheduling_buffer_range CHECK (buffer_minutes BETWEEN 0 AND 60)
);

ALTER TABLE public.clinician_scheduling_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clinician_scheduling_settings FORCE ROW LEVEL SECURITY;

CREATE POLICY clinician_settings_select_scoped ON public.clinician_scheduling_settings
  FOR SELECT TO authenticated
  USING (
    clinician_user_id = auth.uid()
    OR public.user_has_role('superadmin')
    OR public.user_has_role('hospital_admin', hospital_id)
  );


-- ─── 3. department_scheduling_policy ─────────────────────────────────
CREATE TABLE public.department_scheduling_policy (
  department_id uuid PRIMARY KEY REFERENCES public.hospital_departments(id) ON DELETE CASCADE,

  default_slot_minutes integer NOT NULL DEFAULT 15,
  default_buffer_minutes integer NOT NULL DEFAULT 0,
  default_auto_confirm boolean NOT NULL DEFAULT false,

  bookable_weekdays smallint[] NOT NULL DEFAULT ARRAY[1,2,3,4,5]::smallint[],
  bookable_start_minutes_local integer NOT NULL DEFAULT 480,  -- 08:00 EAT
  bookable_end_minutes_local integer NOT NULL DEFAULT 1020,   -- 17:00 EAT
  reminder_lead_minutes integer[] NOT NULL DEFAULT ARRAY[1440, 60]::integer[],

  allow_virtual boolean NOT NULL DEFAULT false,
  notes text,

  updated_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT dept_policy_slot_range CHECK (default_slot_minutes BETWEEN 5 AND 240),
  CONSTRAINT dept_policy_buffer_range CHECK (default_buffer_minutes BETWEEN 0 AND 60),
  CONSTRAINT dept_policy_window_order CHECK (
    bookable_end_minutes_local > bookable_start_minutes_local
  ),
  CONSTRAINT dept_policy_window_range CHECK (
    bookable_start_minutes_local BETWEEN 0 AND 1440
    AND bookable_end_minutes_local BETWEEN 0 AND 1440
  )
);

ALTER TABLE public.department_scheduling_policy ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.department_scheduling_policy FORCE ROW LEVEL SECURITY;

-- SELECT: any authenticated user at the hospital that owns the
-- department can see the policy (patients filter clinicians by it;
-- clinicians need the bookable window).
CREATE POLICY dept_policy_select_scoped ON public.department_scheduling_policy
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.hospital_departments hd
      WHERE hd.id = department_scheduling_policy.department_id
      AND (
        public.user_has_role('superadmin')
        OR public.user_has_role('hospital_admin', hd.hospital_id)
        OR public.user_has_role('clinician', hd.hospital_id)
        OR public.user_has_role('nurse', hd.hospital_id)
        OR public.user_has_role('patient')
      )
    )
  );


-- ─── 4. appointments ─────────────────────────────────────────────────
CREATE TABLE public.appointments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  department_id uuid NOT NULL REFERENCES public.hospital_departments(id) ON DELETE RESTRICT,
  patient_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  clinician_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,

  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,

  reason text NOT NULL,
  reason_note text,

  origin text NOT NULL,
  status text NOT NULL DEFAULT 'requested',
  priority text NOT NULL DEFAULT 'routine',
  type text NOT NULL DEFAULT 'in_person',

  location_room text,
  cancelled_reason text,
  cancelled_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  declined_reason text,

  rescheduled_from_appointment_id uuid REFERENCES public.appointments(id) ON DELETE SET NULL,

  -- Intent: FK to alerts.id when monitoring module ships. Stays text now.
  triggered_by_alert_id text,

  created_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  notify_lead_minutes integer[],

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT appointments_time_order CHECK (ends_at > starts_at),
  CONSTRAINT appointments_reason_check CHECK (
    reason IN ('follow_up','new_concern','refill','routine','urgent_review','other')
  ),
  CONSTRAINT appointments_origin_check CHECK (
    origin IN ('patient','clinician','nurse','reception','system_urgent','walk_in')
  ),
  CONSTRAINT appointments_status_check CHECK (
    status IN (
      'requested','pending_approval','confirmed','arrived','in_progress','completed',
      'cancelled','no_show','rescheduled','declined'
    )
  ),
  CONSTRAINT appointments_priority_check CHECK (priority IN ('routine','urgent')),
  CONSTRAINT appointments_type_check CHECK (type IN ('in_person','virtual'))
);
CREATE INDEX appointments_patient_idx ON public.appointments (patient_user_id, starts_at DESC);
CREATE INDEX appointments_clinician_idx ON public.appointments (clinician_user_id, starts_at DESC);
CREATE INDEX appointments_hospital_status_idx
  ON public.appointments (hospital_id, status, starts_at);
CREATE INDEX appointments_urgent_idx
  ON public.appointments (hospital_id, priority, starts_at)
  WHERE priority = 'urgent';
-- Prevents two live bookings landing on the same clinician at the same
-- minute. Cancelled / no_show / completed rows are ignored so the slot
-- can be re-used.
CREATE UNIQUE INDEX appointments_no_double_booking
  ON public.appointments (clinician_user_id, starts_at)
  WHERE status IN ('requested','pending_approval','confirmed','arrived','in_progress');

ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointments FORCE ROW LEVEL SECURITY;

-- SELECT shape:
--   - Patient sees their own.
--   - Clinician sees their own (where clinician_user_id = auth.uid()).
--   - Nurse at hospital sees all (assignment lookup is a future
--     feature; the hospital scope is the operational reality today).
--   - Hospital admin / superadmin scoped as expected.
CREATE POLICY appointments_select_scoped ON public.appointments
  FOR SELECT TO authenticated
  USING (
    patient_user_id = auth.uid()
    OR clinician_user_id = auth.uid()
    OR public.user_has_role('superadmin')
    OR public.user_has_role('hospital_admin', hospital_id)
    OR public.user_has_role('nurse', hospital_id)
  );


-- ─── 5. encounters ───────────────────────────────────────────────────
-- Minimal seam to the future clinical module. Scheduling fills the
-- row on rooming; the clinical module enriches later.
CREATE TABLE public.encounters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  appointment_id uuid REFERENCES public.appointments(id) ON DELETE SET NULL,
  patient_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  clinician_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  department_id uuid REFERENCES public.hospital_departments(id) ON DELETE SET NULL,

  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  state text NOT NULL DEFAULT 'in_progress',

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT encounters_state_check CHECK (state IN ('in_progress','completed','cancelled')),
  CONSTRAINT encounters_time_order CHECK (ended_at IS NULL OR ended_at >= started_at)
);
CREATE INDEX encounters_patient_idx ON public.encounters (patient_user_id, started_at DESC);
CREATE INDEX encounters_clinician_idx ON public.encounters (clinician_user_id, started_at DESC);
CREATE INDEX encounters_hospital_idx ON public.encounters (hospital_id, started_at DESC);

ALTER TABLE public.encounters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.encounters FORCE ROW LEVEL SECURITY;

CREATE POLICY encounters_select_scoped ON public.encounters
  FOR SELECT TO authenticated
  USING (
    patient_user_id = auth.uid()
    OR clinician_user_id = auth.uid()
    OR public.user_has_role('superadmin')
    OR public.user_has_role('hospital_admin', hospital_id)
    OR public.user_has_role('nurse', hospital_id)
  );


-- ─── 6. queue_entries ────────────────────────────────────────────────
CREATE TABLE public.queue_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  department_id uuid NOT NULL REFERENCES public.hospital_departments(id) ON DELETE RESTRICT,
  appointment_id uuid REFERENCES public.appointments(id) ON DELETE SET NULL,
  patient_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  kind text NOT NULL,
  state text NOT NULL DEFAULT 'waiting',

  arrived_at timestamptz NOT NULL DEFAULT now(),
  called_at timestamptz,
  called_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  completed_at timestamptz,
  notes text,

  encounter_id uuid REFERENCES public.encounters(id) ON DELETE SET NULL,
  sequence_number integer NOT NULL,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT queue_entries_kind_check CHECK (
    kind IN ('scheduled_arrival','walk_in','urgent_walk_in')
  ),
  CONSTRAINT queue_entries_state_check CHECK (
    state IN ('waiting','being_seen','left','done')
  )
);
CREATE INDEX queue_entries_dept_state_idx
  ON public.queue_entries (hospital_id, department_id, state, arrived_at);
CREATE INDEX queue_entries_patient_idx
  ON public.queue_entries (patient_user_id, arrived_at DESC);

ALTER TABLE public.queue_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.queue_entries FORCE ROW LEVEL SECURITY;

CREATE POLICY queue_entries_select_scoped ON public.queue_entries
  FOR SELECT TO authenticated
  USING (
    patient_user_id = auth.uid()
    OR public.user_has_role('superadmin')
    OR public.user_has_role('hospital_admin', hospital_id)
    OR public.user_has_role('clinician', hospital_id)
    OR public.user_has_role('nurse', hospital_id)
  );


-- ─── 7. appointment_reminders ────────────────────────────────────────
-- Reminder queue. No dispatcher in this feature — rows sit in 'queued'
-- until a future SMS/push Edge Function consumes them.
CREATE TABLE public.appointment_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id uuid NOT NULL REFERENCES public.appointments(id) ON DELETE CASCADE,
  channel text NOT NULL,
  scheduled_at timestamptz NOT NULL,
  state text NOT NULL DEFAULT 'queued',
  sent_at timestamptz,
  failure_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT reminders_channel_check CHECK (channel IN ('push','sms','email','in_app')),
  CONSTRAINT reminders_state_check CHECK (state IN ('queued','sent','failed','cancelled'))
);
CREATE INDEX appointment_reminders_dispatcher_idx
  ON public.appointment_reminders (state, scheduled_at)
  WHERE state = 'queued';

ALTER TABLE public.appointment_reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointment_reminders FORCE ROW LEVEL SECURITY;
-- Service-role only (admin-internal infrastructure). No policies for
-- authenticated.


-- ─── 8. updated_at triggers ──────────────────────────────────────────
-- Re-use the project's set_updated_at trigger from migration 0001.
DROP TRIGGER IF EXISTS availability_blocks_updated_at ON public.availability_blocks;
CREATE TRIGGER availability_blocks_updated_at
  BEFORE UPDATE ON public.availability_blocks
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS clinician_settings_updated_at ON public.clinician_scheduling_settings;
CREATE TRIGGER clinician_settings_updated_at
  BEFORE UPDATE ON public.clinician_scheduling_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS dept_policy_updated_at ON public.department_scheduling_policy;
CREATE TRIGGER dept_policy_updated_at
  BEFORE UPDATE ON public.department_scheduling_policy
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS appointments_updated_at ON public.appointments;
CREATE TRIGGER appointments_updated_at
  BEFORE UPDATE ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS encounters_updated_at ON public.encounters;
CREATE TRIGGER encounters_updated_at
  BEFORE UPDATE ON public.encounters
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS queue_entries_updated_at ON public.queue_entries;
CREATE TRIGGER queue_entries_updated_at
  BEFORE UPDATE ON public.queue_entries
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS reminders_updated_at ON public.appointment_reminders;
CREATE TRIGGER reminders_updated_at
  BEFORE UPDATE ON public.appointment_reminders
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ─── 9. sa_audit_log CHECK widening ──────────────────────────────────
ALTER TABLE public.sa_audit_log
  DROP CONSTRAINT IF EXISTS sa_audit_log_action_check;

ALTER TABLE public.sa_audit_log
  ADD CONSTRAINT sa_audit_log_action_check CHECK (
    action IN (
      -- Existing (mirror of migration 0027) -----------------------
      'approve_staff_affiliation', 'reject_staff_affiliation',
      'approve_hospital_application', 'reject_hospital_application',
      'cross_tenant_read', 'cross_tenant_export',
      'elevate_admin', 'create_superadmin', 'demote_admin',
      'break_glass_open', 'break_glass_close',
      'four_eyes_request', 'four_eyes_confirm', 'four_eyes_cancel',
      'activate_hospital', 'suspend_user', 'reset_user_mfa',
      'deactivate_user', 'reactivate_user', 'export_audit_log',
      'sa_create_hospital', 'sa_invite_hospital_admin', 'hospital_admin_claimed',
      'request_staff_info', 'suspend_staff_affiliation',
      'deactivate_staff_affiliation', 'reactivate_staff_affiliation',
      'reset_staff_mfa', 'assign_staff_role',
      'invite_staff', 'revoke_staff_invitation',
      -- New: scheduling actions -----------------------------------
      'book_appointment',
      'confirm_appointment_request',
      'decline_appointment_request',
      'cancel_appointment',
      'reschedule_appointment',
      'mark_no_show',
      'mark_arrived',
      'start_encounter',
      'complete_encounter',
      'propose_urgent_appointment',
      'record_walkin',
      'set_clinician_availability',
      'cancel_clinician_availability',
      'update_clinician_settings',
      'update_department_policy',
      'override_out_of_hours_booking'
    )
  );

ALTER TABLE public.sa_audit_log
  DROP CONSTRAINT IF EXISTS sa_audit_log_target_kind_check;

ALTER TABLE public.sa_audit_log
  ADD CONSTRAINT sa_audit_log_target_kind_check CHECK (
    target_kind IN (
      'staff_affiliation', 'hospital_application', 'hospital', 'user', 'patient_profile',
      'break_glass_grant', 'audit_log_export', 'hospital_admin_invitation',
      'staff_invitation',
      -- New: scheduling targets -----------------------------------
      'appointment',
      'availability_block',
      'queue_entry',
      'encounter',
      'clinician_scheduling_settings',
      'department_scheduling_policy'
    )
  );
