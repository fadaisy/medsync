-- 0058 — Service lines, session templates, clinic sessions (Gate B, ADR 0087).
--
-- ⚠️ GATED — DO NOT APPLY TO PRODUCTION WITHOUT EXPLICIT, NAMED OWNER
-- AUTHORIZATION. Apply via `npm run db:migrate`.
--
-- docs/booking-app-gate-a-proposal.md §5.2–§5.6, §5.13; ADR 0087.
--
-- Additive except ONE step, §5 below: `appointments_no_double_booking` is
-- dropped and re-created with `session_id IS NULL` added to its predicate.
-- Every shipped appointment row has session_id NULL (the column is born here),
-- so the re-scoped index admits exactly the rows the old one admitted.
--
-- Sections, in order:
--   1. service_lines            + backfill (one per hospital_departments row)
--   2. session_templates
--   3. clinic_sessions
--   4. appointments columns     (idempotency, channel, session position, code)
--   5. appointments_no_double_booking re-scope   ← the one non-additive step
--   6. appointments_reason_check widened to Appendix A
--   7. sa_audit_log CHECKs re-issued (+4 actions, +3 target kinds)
--
-- Every new table: RLS ENABLE + FORCE, SELECT policies only. Writes are
-- service-role Edge Functions (`ha-upsert-service-line`,
-- `ha-upsert-session-template`, the nightly materialiser), each of which
-- writes an sa_audit_log row. updated_at is `public.set_updated_at()` (0001),
-- exactly as 0028 wires it.


-- ─── 1. service_lines ────────────────────────────────────────────────
--
-- The table everything else hangs on: capacity mode, time-to-care,
-- continuity, confidentiality, payment posture (proposal §5.2).
--
-- capacity_mode (ruling C2): 'slot' | 'session' | 'open_queue'. The column
-- DEFAULT is 'session' — Part 8 #3, the mode for every line created after
-- this lands. Every BACKFILLED line (§1b) is 'slot', so nothing shipped
-- changes behaviour.
--
-- time_to_care_days (Part 8 #5): the Appendix A proposals, which are
-- **CSO-PROVISIONAL** — proposed by the PRD author, not yet clinically
-- signed. One column can carry one DEFAULT, so the DEFAULT is 7 (General OPD,
-- "new or worsening problem" — the family a default line serves) and the
-- per-family proposals are recorded here for the console editor to offer:
--
--   follow_up 30 · post_discharge 3 · new_concern 7 · refill 7 ·
--   test_results 7 · antenatal 7 · immunisation 14 · child_wellness 14 ·
--   specialist_review 14 · routine 30 · procedure 7 · counselling 14 ·
--   second_opinion 14
--
-- Backfilled slot lines get 30 explicitly (§1b). Nothing at Gate B consumes
-- the value; the no-silent-wait ordering ships at Gate C.
--
-- reason_codes: the Appendix A reasons this line accepts. The CHECK is the
-- 13 patient codes plus 'other' (the five shipped codes minus
-- 'urgent_review', which is system-only since 0053 and can never be a
-- line's offer). `<@` is element-wise containment, as 0052 uses it.

CREATE TABLE IF NOT EXISTS public.service_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  department_id uuid NOT NULL REFERENCES public.hospital_departments(id) ON DELETE CASCADE,

  name text NOT NULL,
  slug text NOT NULL,

  capacity_mode text NOT NULL DEFAULT 'session',
  time_to_care_days smallint NOT NULL DEFAULT 7,   -- CSO-PROVISIONAL, see header
  continuity_default boolean NOT NULL DEFAULT false,
  confidential boolean NOT NULL DEFAULT false,

  payment_posture text NOT NULL DEFAULT 'none',
  fee_ugx integer,
  deposit_ugx integer,

  reason_codes text[] NOT NULL DEFAULT '{}'::text[],
  is_default boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT service_lines_capacity_mode_check CHECK (
    capacity_mode IN ('slot','session','open_queue')
  ),
  CONSTRAINT service_lines_time_to_care_range CHECK (time_to_care_days BETWEEN 1 AND 365),
  CONSTRAINT service_lines_payment_posture_check CHECK (
    payment_posture IN ('none','deposit','full')
  ),
  CONSTRAINT service_lines_fee_nonneg CHECK (fee_ugx IS NULL OR fee_ugx >= 0),
  CONSTRAINT service_lines_deposit_nonneg CHECK (deposit_ugx IS NULL OR deposit_ugx >= 0),
  CONSTRAINT service_lines_fee_required CHECK (
    payment_posture = 'none' OR fee_ugx IS NOT NULL
  ),
  CONSTRAINT service_lines_reason_codes_check CHECK (
    reason_codes <@ ARRAY[
      'follow_up','post_discharge','new_concern','refill','test_results',
      'antenatal','immunisation','child_wellness','specialist_review','routine',
      'procedure','counselling','second_opinion',
      'other'
    ]::text[]
  ),
  CONSTRAINT service_lines_hospital_slug_unique UNIQUE (hospital_id, slug)
);
-- ADR 0084 §5's "general OPD marked default", finally: at most one per hospital.
CREATE UNIQUE INDEX IF NOT EXISTS service_lines_one_default_per_hospital
  ON public.service_lines (hospital_id)
  WHERE is_default;
CREATE INDEX IF NOT EXISTS service_lines_hospital_active_idx
  ON public.service_lines (hospital_id, active);

ALTER TABLE public.service_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_lines FORCE ROW LEVEL SECURITY;

-- Every signed-in user may read (patients discover lines) — the
-- `dept_policy_select_authenticated` shape from 0055. No writes for
-- authenticated; `ha-upsert-service-line` (service role) owns them.
DROP POLICY IF EXISTS service_lines_select_authenticated ON public.service_lines;
CREATE POLICY service_lines_select_authenticated ON public.service_lines
  FOR SELECT TO authenticated
  USING (true);

DROP TRIGGER IF EXISTS service_lines_updated_at ON public.service_lines;
CREATE TRIGGER service_lines_updated_at
  BEFORE UPDATE ON public.service_lines
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─── 1b. Backfill: one slot-mode line per existing department ────────
--
-- C2's "nothing shipped changes": every department that books today keeps
-- booking exactly as it does, now with a named line. `capacity_mode='slot'`,
-- the five shipped patient reasons, 30 days (a follow-up horizon; provisional
-- like the rest), never the default.
--
-- `hospital_departments_unique_slug` is (hospital_id, parent_id, slug), so
-- two sub-departments under different parents may share a slug within one
-- hospital. Those get a deterministic suffix rather than losing their line to
-- ON CONFLICT — the conflict clause is for a re-run, not for data.

INSERT INTO public.service_lines
  (hospital_id, department_id, name, slug, capacity_mode, time_to_care_days,
   reason_codes, is_default)
SELECT
  hd.hospital_id,
  hd.id,
  hd.name,
  CASE
    WHEN count(*) OVER (PARTITION BY hd.hospital_id, hd.slug) > 1
      THEN hd.slug || '-' || left(hd.id::text, 8)
    ELSE hd.slug
  END,
  'slot',
  30,
  ARRAY['follow_up','new_concern','refill','routine','other']::text[],
  false
FROM public.hospital_departments hd
ON CONFLICT (hospital_id, slug) DO NOTHING;


-- ─── 2. session_templates ────────────────────────────────────────────
--
-- "Every Tuesday, 08:00, 4 hours, cap 60, 36 bookable" — the weekly rule a
-- clinic_sessions row is stamped from (proposal §5.4). The capacity columns
-- are COPIED into each instance so editing a template never rewrites a
-- published session.
--
-- weekday is ISO 1..7 (0052's convention). start_minutes_local is minutes
-- past local midnight in the hospital's zone — `expandSessionTemplate` in
-- `_shared/slots.ts` turns it into instants with the same DST-safe arithmetic
-- as `availability_blocks` weekly recurrence.
--
-- capacity_booked is NOT NULL with no DEFAULT: a default cannot read a
-- sibling column, so the writer supplies ceil(0.6 × capacity_total) when the
-- admin leaves it blank (Part 8 #4, the 60/40 split). interleave 2:1 is a
-- plain DEFAULT.

CREATE TABLE IF NOT EXISTS public.session_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_line_id uuid NOT NULL REFERENCES public.service_lines(id) ON DELETE CASCADE,
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  department_id uuid NOT NULL REFERENCES public.hospital_departments(id) ON DELETE CASCADE,
  clinician_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  venue text,

  weekday smallint NOT NULL,
  start_minutes_local smallint NOT NULL,
  duration_minutes smallint NOT NULL,

  capacity_total smallint NOT NULL,
  capacity_booked smallint NOT NULL,
  interleave_booked smallint NOT NULL DEFAULT 2,
  interleave_walk_in smallint NOT NULL DEFAULT 1,
  overbooking_factor numeric(3,2) NOT NULL DEFAULT 1.00,

  valid_from date NOT NULL,
  valid_until date,
  active boolean NOT NULL DEFAULT true,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT session_templates_weekday_range CHECK (weekday BETWEEN 1 AND 7),
  CONSTRAINT session_templates_start_range CHECK (start_minutes_local BETWEEN 0 AND 1440),
  CONSTRAINT session_templates_duration_range CHECK (duration_minutes BETWEEN 15 AND 720),
  CONSTRAINT session_templates_capacity_total_positive CHECK (capacity_total > 0),
  CONSTRAINT session_templates_capacity_booked_range CHECK (
    capacity_booked > 0 AND capacity_booked <= capacity_total
  ),
  CONSTRAINT session_templates_interleave_positive CHECK (
    interleave_booked > 0 AND interleave_walk_in > 0
  ),
  CONSTRAINT session_templates_overbooking_range CHECK (
    overbooking_factor BETWEEN 1.00 AND 2.00
  ),
  CONSTRAINT session_templates_validity_order CHECK (
    valid_until IS NULL OR valid_until >= valid_from
  ),
  CONSTRAINT session_templates_unique_rule UNIQUE (
    service_line_id, weekday, start_minutes_local, valid_from
  )
);
CREATE INDEX IF NOT EXISTS session_templates_hospital_idx
  ON public.session_templates (hospital_id, active);

ALTER TABLE public.session_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.session_templates FORCE ROW LEVEL SECURITY;

-- Staff at the hospital read; the `availability_blocks_select_scoped` shape
-- (0028). Patients never need the rule — they see its instances (§3).
DROP POLICY IF EXISTS session_templates_select_scoped ON public.session_templates;
CREATE POLICY session_templates_select_scoped ON public.session_templates
  FOR SELECT TO authenticated
  USING (
    public.user_has_role('superadmin')
    OR public.user_has_role('hospital_admin', hospital_id)
    OR public.user_has_role('clinician', hospital_id)
    OR public.user_has_role('nurse', hospital_id)
  );

DROP TRIGGER IF EXISTS session_templates_updated_at ON public.session_templates;
CREATE TRIGGER session_templates_updated_at
  BEFORE UPDATE ON public.session_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ─── 3. clinic_sessions ──────────────────────────────────────────────
--
-- One dated instance: "Tuesday 15 Sep, 08:00–12:00, Dr X, cap 60 / 36
-- bookable" (proposal §5.3). Materialised 14 days ahead from a template, or
-- created directly (template_id NULL).
--
-- booked_count / next_position are the two counters the Gate C allocator
-- moves in ONE statement (`_shared/sessions-sql.ts`):
--
--   UPDATE clinic_sessions
--      SET booked_count = booked_count + 1, next_position = next_position + 1
--    WHERE id = $1 AND status = 'published'
--      AND booked_count < ceil(capacity_booked * overbooking_factor)
--   RETURNING next_position
--
-- The CHECK below is the belt; that WHERE is the braces. A cancellation
-- decrements booked_count only — next_position is monotonic, so a position
-- number is never re-issued (PRD §4.4).
--
-- clinician_user_id NULL is the §3.6 "unset" state, not an error.

CREATE TABLE IF NOT EXISTS public.clinic_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  department_id uuid NOT NULL REFERENCES public.hospital_departments(id) ON DELETE CASCADE,
  service_line_id uuid NOT NULL REFERENCES public.service_lines(id) ON DELETE CASCADE,
  template_id uuid REFERENCES public.session_templates(id) ON DELETE SET NULL,
  clinician_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  venue text,

  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,

  capacity_total smallint NOT NULL,
  capacity_booked smallint NOT NULL,
  interleave_booked smallint NOT NULL DEFAULT 2,
  interleave_walk_in smallint NOT NULL DEFAULT 1,
  overbooking_factor numeric(3,2) NOT NULL DEFAULT 1.00,

  booked_count smallint NOT NULL DEFAULT 0,
  next_position smallint NOT NULL DEFAULT 0,

  status text NOT NULL DEFAULT 'published',
  cancelled_reason text,
  cancelled_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  cancelled_at timestamptz,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT clinic_sessions_time_order CHECK (ends_at > starts_at),
  CONSTRAINT clinic_sessions_capacity_total_positive CHECK (capacity_total > 0),
  CONSTRAINT clinic_sessions_capacity_booked_range CHECK (
    capacity_booked > 0 AND capacity_booked <= capacity_total
  ),
  CONSTRAINT clinic_sessions_interleave_positive CHECK (
    interleave_booked > 0 AND interleave_walk_in > 0
  ),
  CONSTRAINT clinic_sessions_overbooking_range CHECK (
    overbooking_factor BETWEEN 1.00 AND 2.00
  ),
  CONSTRAINT clinic_sessions_booked_count_range CHECK (
    booked_count >= 0
    AND booked_count <= ceil(capacity_booked * overbooking_factor)
  ),
  CONSTRAINT clinic_sessions_next_position_nonneg CHECK (next_position >= 0),
  CONSTRAINT clinic_sessions_status_check CHECK (
    status IN ('draft','published','cancelled','closed')
  )
);
-- Discovery: "the next published sessions of this line".
CREATE INDEX IF NOT EXISTS clinic_sessions_line_published_idx
  ON public.clinic_sessions (service_line_id, starts_at)
  WHERE status = 'published';
CREATE INDEX IF NOT EXISTS clinic_sessions_hospital_idx
  ON public.clinic_sessions (hospital_id, starts_at);
-- Materialisation is idempotent on this: the generator INSERTs
-- ON CONFLICT (template_id, starts_at) DO NOTHING, so a re-run — the
-- template write and the nightly cron both expand the same 14 days — never
-- overwrites a published instance.
CREATE UNIQUE INDEX IF NOT EXISTS clinic_sessions_template_start_unique
  ON public.clinic_sessions (template_id, starts_at)
  WHERE template_id IS NOT NULL;

ALTER TABLE public.clinic_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clinic_sessions FORCE ROW LEVEL SECURITY;

-- Discovery: any signed-in user sees published sessions (patients pick one).
DROP POLICY IF EXISTS clinic_sessions_select_published ON public.clinic_sessions;
CREATE POLICY clinic_sessions_select_published ON public.clinic_sessions
  FOR SELECT TO authenticated
  USING (status = 'published');

-- Staff at the hospital see every row, draft and cancelled included — the
-- `patient_intakes_select_scoped` shape (0032). Permissive policies OR.
DROP POLICY IF EXISTS clinic_sessions_select_staff ON public.clinic_sessions;
CREATE POLICY clinic_sessions_select_staff ON public.clinic_sessions
  FOR SELECT TO authenticated
  USING (
    public.user_has_role('superadmin')
    OR public.user_has_role('hospital_admin', hospital_id)
    OR EXISTS (
      SELECT 1 FROM public.staff_affiliations sa
      WHERE sa.user_id = auth.uid()
        AND sa.hospital_id = clinic_sessions.hospital_id
        AND sa.state IN ('active','approved')
    )
  );

DROP TRIGGER IF EXISTS clinic_sessions_updated_at ON public.clinic_sessions;
CREATE TRIGGER clinic_sessions_updated_at
  BEFORE UPDATE ON public.clinic_sessions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ─── 4. appointments: booking-request + session-position columns ─────
--
-- Proposal §5.5 / §5.6. All nullable or defaulted; every shipped row is a
-- slot booking (session_id NULL, channel 'web').
--
-- idempotency_key: a retry on 2G returns the same booking id — on 23505
-- against this index the writer SELECTs the existing (patient, key) row and
-- returns it as 200.
-- channel: where the booking came in.
-- session_id / position_number: the number the patient holds in session
-- mode, allocated at confirmation from `clinic_sessions.next_position`,
-- never renumbered. Both or neither.
-- arrival_window_*: derived ONCE at confirmation and stored so the SMS the
-- patient holds never changes. Stored at Gate B; rendered only after C10.
-- booking_code: 6 chars from an unambiguous alphabet, on the receipt,
-- searched by reception (§3.6). Generated at Gate C.

ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS idempotency_key text,
  ADD COLUMN IF NOT EXISTS channel text NOT NULL DEFAULT 'web',
  ADD COLUMN IF NOT EXISTS session_id uuid REFERENCES public.clinic_sessions(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS position_number smallint,
  ADD COLUMN IF NOT EXISTS arrival_window_start timestamptz,
  ADD COLUMN IF NOT EXISTS arrival_window_end timestamptz,
  ADD COLUMN IF NOT EXISTS booking_code text;

ALTER TABLE public.appointments
  DROP CONSTRAINT IF EXISTS appointments_channel_check;
ALTER TABLE public.appointments
  ADD CONSTRAINT appointments_channel_check CHECK (
    channel IN ('web','app','ussd','desk','system')
  );

ALTER TABLE public.appointments
  DROP CONSTRAINT IF EXISTS appointments_session_position_pair;
ALTER TABLE public.appointments
  ADD CONSTRAINT appointments_session_position_pair CHECK (
    (session_id IS NULL) = (position_number IS NULL)
  );

ALTER TABLE public.appointments
  DROP CONSTRAINT IF EXISTS appointments_hospital_booking_code_unique;
ALTER TABLE public.appointments
  ADD CONSTRAINT appointments_hospital_booking_code_unique UNIQUE (hospital_id, booking_code);

CREATE UNIQUE INDEX IF NOT EXISTS appointments_idempotency_unique
  ON public.appointments (patient_user_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS appointments_session_position_unique
  ON public.appointments (session_id, position_number)
  WHERE session_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS appointments_session_idx
  ON public.appointments (session_id)
  WHERE session_id IS NOT NULL;


-- ─── 5. appointments_no_double_booking re-scope ──────────────────────
--
-- THE ONE NON-ADDITIVE STEP (flagged in proposal §5.6, ruled in ADR 0087).
--
-- The 0028 index is UNIQUE on live (clinician_user_id, starts_at). In
-- session mode every position in a session shares the session's starts_at
-- and (usually) its clinician, so the second position of any session would
-- be a 23505. Slot mode keeps the guard exactly as it was; session mode is
-- guarded by the allocator's counter instead.
--
-- Safe to drop and re-create: the new predicate is the old one AND
-- `session_id IS NULL`, and session_id was born NULL on every row in §4. The
-- status list is 0028's verbatim.

DROP INDEX IF EXISTS public.appointments_no_double_booking;
CREATE UNIQUE INDEX appointments_no_double_booking
  ON public.appointments (clinician_user_id, starts_at)
  WHERE session_id IS NULL
    AND status IN ('requested','pending_approval','confirmed','arrived','in_progress');


-- ─── 6. appointments_reason_check → Appendix A (ruling C5) ───────────
--
-- The 13 Appendix A codes, plus the two shipped values that are not in
-- Appendix A: 'urgent_review' (system-only — 0053's
-- `appointments_patient_reason_check` is untouched and still keeps it off the
-- patient path) and 'other'. Every existing row's reason is in the old list,
-- and the old list is a subset of this one.

ALTER TABLE public.appointments
  DROP CONSTRAINT IF EXISTS appointments_reason_check;
ALTER TABLE public.appointments
  ADD CONSTRAINT appointments_reason_check CHECK (
    reason IN (
      'follow_up','post_discharge','new_concern','refill','test_results',
      'antenatal','immunisation','child_wellness','specialist_review','routine',
      'procedure','counselling','second_opinion',
      'urgent_review','other'
    )
  );


-- ─── 7. sa_audit_log CHECKs re-issued ────────────────────────────────
--
-- DROP-then-ADD is the house pattern; the action list is migration 0056's
-- verbatim plus four lines. The target_kind list is 0038's verbatim plus the
-- three tables this migration creates — without them the new functions'
-- audit INSERT raises and they fail closed on the first write (0054's
-- failure mode, deliberately avoided here).

ALTER TABLE public.sa_audit_log
  DROP CONSTRAINT IF EXISTS sa_audit_log_action_check;

ALTER TABLE public.sa_audit_log
  ADD CONSTRAINT sa_audit_log_action_check CHECK (
    action IN (
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
      'book_appointment', 'confirm_appointment_request',
      'decline_appointment_request', 'cancel_appointment',
      'reschedule_appointment', 'mark_no_show', 'mark_arrived',
      'start_encounter', 'complete_encounter',
      'propose_urgent_appointment', 'record_walkin',
      'set_clinician_availability', 'cancel_clinician_availability',
      'update_clinician_settings', 'update_department_policy',
      'override_out_of_hours_booking',
      'assign_supervision', 'end_supervision',
      'cosign_request', 'cosign_approve', 'cosign_return',
      'cosign_cancel', 'cosign_expire',
      'update_cosign_policy',
      'phi_access_break_glass',
      'record_observation', 'correct_observation',
      'administer_medication', 'withhold_medication',
      'submit_handover',
      'assign_patient_to_nurse', 'unassign_patient_from_nurse',
      'assign_ward_in_charge', 'end_ward_in_charge',
      'escalate_to_medical_team',
      'register_intake', 'update_intake', 'cancel_intake',
      'check_in_patient',
      'patient_declare_intake',
      'compute_triage', 'assign_triage', 'override_triage',
      'adjust_triage_baseline',
      -- New (resus, migration 0038)
      'open_resus_episode', 'conclude_resus_episode',
      'record_resus_event', 'correct_resus_event',
      'assign_resus_role', 'end_resus_role',
      'mobilise_resus_team', 'detect_resus_arrest',
      -- New (emergency phone, migration 0054)
      'set_emergency_phone',
      -- New (visit ratings, migration 0056)
      'rate_visit',
      -- New (capacity model, migration 0058 / ADR 0087)
      'update_service_line', 'update_session_template',
      'cancel_session', 'book_on_behalf'
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
      'appointment', 'availability_block', 'queue_entry', 'encounter',
      'clinician_scheduling_settings', 'department_scheduling_policy',
      'clinical_supervision', 'clinical_cosign_request',
      'clinical_cosign_policy', 'clinical_phi_access',
      'nursing_assignment', 'ward_in_charge_assignment',
      'clinical_observation', 'medication_administration_record',
      'shift_handover',
      'patient_intake',
      'triage_record',
      -- New (resus, migration 0038)
      'resus_episode', 'resus_timeline_event',
      'resus_role_assignment', 'resus_mobilisation_alert',
      -- New (capacity model, migration 0058 / ADR 0087)
      'service_line', 'session_template', 'clinic_session'
    )
  );
