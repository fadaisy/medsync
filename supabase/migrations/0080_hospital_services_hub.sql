-- ─────────────────────────────────────────────────────────────────────────
-- 0080_hospital_services_hub — ⚠️ GATED — owner-applied (npm run db:migrate).
--
-- Departments & services hub (docs/hospital-services/gate-a-proposal.md §2; ADRs 0150–0160).
-- ADDITIVE and idempotent: columns on existing tables, new tables, triggers, seeds. Two client
-- write policies are dropped (hospital_departments, hospital_wards): every writer already uses the
-- service role, and the hub's law is "no client writes". Nothing else is removed.
--
-- Numbered 0080 on purpose: feat/emr-engine holds 0071–0073. The migrator applies by name.
--
--   1. Places, then department / ward / clinic / clinic-day columns (reuse map §1)
--   2. Heads (new) and ward in-charges (0031 table + acting)
--   3. Beds (optional register; never more beds than the ward's count)
--   4. Diagnostics overlay, capability values (four-eyes), availability events (append-only)
--   5. Public holidays (seeded) and closures
--   6. Hub state (one-time legacy import), staff helper, RLS, audit verbs
--   7. Backfill: existing departments stay live; codes from slugs; start from the application
-- ─────────────────────────────────────────────────────────────────────────

-- ─── 1. Places ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.hospital_places (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
  building text CHECK (char_length(building) <= 60),
  floor text CHECK (char_length(floor) <= 30),
  room text CHECK (char_length(room) <= 30),
  directions text CHECK (char_length(directions) <= 140),   -- fits one SMS
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS hospital_places_hospital_idx ON public.hospital_places (hospital_id);

-- ─── 1b. Departments: kind, code, live, archive, start, place, hours (STR-1, STR-2) ──
ALTER TABLE public.hospital_departments
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'clinical',
  ADD COLUMN IF NOT EXISTS catalogue_code text,
  ADD COLUMN IF NOT EXISTS medsync_live_at timestamptz,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS is_start boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS place_id uuid REFERENCES public.hospital_places(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS service_hours text;
ALTER TABLE public.hospital_departments DROP CONSTRAINT IF EXISTS hospital_departments_kind_check;
ALTER TABLE public.hospital_departments ADD CONSTRAINT hospital_departments_kind_check
  CHECK (kind IN ('clinical','diagnostic','support','administrative'));
ALTER TABLE public.hospital_departments DROP CONSTRAINT IF EXISTS hospital_departments_hours_len;
ALTER TABLE public.hospital_departments ADD CONSTRAINT hospital_departments_hours_len
  CHECK (service_hours IS NULL OR char_length(service_hours) <= 60);

-- ─── 1c. Wards: type, sex, age group, place, temporary closure, archive (§5.4) ──
ALTER TABLE public.hospital_wards
  ADD COLUMN IF NOT EXISTS ward_type text,
  ADD COLUMN IF NOT EXISTS sex text,
  ADD COLUMN IF NOT EXISTS age_group text,
  ADD COLUMN IF NOT EXISTS place_id uuid REFERENCES public.hospital_places(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS closed_at timestamptz,
  ADD COLUMN IF NOT EXISTS closed_reason text,
  ADD COLUMN IF NOT EXISTS expected_reopen_on date,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;
ALTER TABLE public.hospital_wards DROP CONSTRAINT IF EXISTS hospital_wards_type_check;
ALTER TABLE public.hospital_wards ADD CONSTRAINT hospital_wards_type_check CHECK (
  ward_type IS NULL OR ward_type IN ('general','hdu','icu','nicu','maternity','labour_suite',
    'isolation','paediatric','surgical','emergency_observation','private'));
ALTER TABLE public.hospital_wards DROP CONSTRAINT IF EXISTS hospital_wards_sex_check;
ALTER TABLE public.hospital_wards ADD CONSTRAINT hospital_wards_sex_check
  CHECK (sex IS NULL OR sex IN ('female','male','mixed'));
ALTER TABLE public.hospital_wards DROP CONSTRAINT IF EXISTS hospital_wards_age_check;
ALTER TABLE public.hospital_wards ADD CONSTRAINT hospital_wards_age_check
  CHECK (age_group IS NULL OR age_group IN ('adult','paediatric','neonatal','all'));
ALTER TABLE public.hospital_wards DROP CONSTRAINT IF EXISTS hospital_wards_closed_has_reason;
ALTER TABLE public.hospital_wards ADD CONSTRAINT hospital_wards_closed_has_reason
  CHECK (closed_at IS NULL OR char_length(coalesce(closed_reason, '')) BETWEEN 3 AND 200);

-- ─── 1d. Clinics = service_lines (E-SVC-02: plain columns) ───────────────
ALTER TABLE public.service_lines
  ADD COLUMN IF NOT EXISTS catalogue_code text,
  ADD COLUMN IF NOT EXISTS audience text NOT NULL DEFAULT 'patients',
  ADD COLUMN IF NOT EXISTS place_id uuid REFERENCES public.hospital_places(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS unit_id uuid REFERENCES public.hospital_departments(id) ON DELETE SET NULL,
  -- Planned = active false, archived_at null; Live = active; Archived = archived_at set (never deleted).
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;
ALTER TABLE public.service_lines DROP CONSTRAINT IF EXISTS service_lines_archived_inactive;
ALTER TABLE public.service_lines ADD CONSTRAINT service_lines_archived_inactive
  CHECK (archived_at IS NULL OR active = false);
ALTER TABLE public.service_lines DROP CONSTRAINT IF EXISTS service_lines_audience_check;
ALTER TABLE public.service_lines ADD CONSTRAINT service_lines_audience_check
  CHECK (audience IN ('patients','referral','staff'));

-- ─── 1e. Clinic days = session_templates (CLN-3) ─────────────────────────
ALTER TABLE public.session_templates
  ADD COLUMN IF NOT EXISTS repeat_every_weeks smallint NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS nth_weekday smallint,
  ADD COLUMN IF NOT EXISTS runs_on_holidays boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS place_id uuid REFERENCES public.hospital_places(id) ON DELETE SET NULL;
ALTER TABLE public.session_templates DROP CONSTRAINT IF EXISTS session_templates_recurrence_check;
ALTER TABLE public.session_templates ADD CONSTRAINT session_templates_recurrence_check CHECK (
  repeat_every_weeks BETWEEN 1 AND 8
  AND (nth_weekday IS NULL OR nth_weekday IN (1,2,3,4,5,-1))
  AND NOT (nth_weekday IS NOT NULL AND repeat_every_weeks > 1));

-- ─── 2. Heads of department (STR-3) ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.department_heads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  department_id uuid NOT NULL REFERENCES public.hospital_departments(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  acting boolean NOT NULL DEFAULT false,
  starts_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz,
  set_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  notes text CHECK (char_length(notes) <= 280),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT department_heads_time_order CHECK (ends_at IS NULL OR ends_at >= starts_at)
);
-- One open substantive head and one open acting head per department.
CREATE UNIQUE INDEX IF NOT EXISTS department_heads_one_open
  ON public.department_heads (department_id, acting) WHERE ends_at IS NULL;
CREATE INDEX IF NOT EXISTS department_heads_user_idx ON public.department_heads (user_id);

-- Ward in-charge: the 0031 table, now with acting (readers ask "is this nurse in charge?").
ALTER TABLE public.ward_in_charge_assignments
  ADD COLUMN IF NOT EXISTS acting boolean NOT NULL DEFAULT false;
DROP INDEX IF EXISTS public.ward_in_charge_one_active;
CREATE UNIQUE INDEX IF NOT EXISTS ward_in_charge_one_open
  ON public.ward_in_charge_assignments (ward_id, acting) WHERE ends_at IS NULL;

-- ─── 3. Beds (STR-5) ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.hospital_beds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  ward_id uuid NOT NULL REFERENCES public.hospital_wards(id) ON DELETE CASCADE,
  label text NOT NULL CHECK (char_length(label) BETWEEN 1 AND 20),
  bed_type text CHECK (char_length(bed_type) <= 40),
  closed_at timestamptz,
  closed_reason text CHECK (char_length(closed_reason) <= 200),
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hospital_beds_closed_has_reason CHECK (closed_at IS NULL OR closed_reason IS NOT NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS hospital_beds_ward_label ON public.hospital_beds (ward_id, label);

-- STR-5: the register never holds more (unarchived) beds than the ward's count, from either side.
CREATE OR REPLACE FUNCTION public.hospital_beds_within_count()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE
  v_ward uuid;
  v_count integer;
  v_beds integer;
BEGIN
  -- Separate branches: PL/pgSQL would resolve both record fields inside one CASE.
  IF TG_TABLE_NAME = 'hospital_wards' THEN
    v_ward := NEW.id;
  ELSE
    v_ward := NEW.ward_id;
  END IF;
  SELECT bed_count INTO v_count FROM public.hospital_wards WHERE id = v_ward;
  SELECT count(*) INTO v_beds FROM public.hospital_beds WHERE ward_id = v_ward AND archived_at IS NULL;
  IF v_beds > v_count THEN
    RAISE EXCEPTION 'STR-5: ward % has % beds in its register but a bed count of %', v_ward, v_beds, v_count
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS hospital_beds_within_count ON public.hospital_beds;
CREATE CONSTRAINT TRIGGER hospital_beds_within_count
  AFTER INSERT OR UPDATE ON public.hospital_beds
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.hospital_beds_within_count();
DROP TRIGGER IF EXISTS hospital_wards_count_covers_beds ON public.hospital_wards;
CREATE CONSTRAINT TRIGGER hospital_wards_count_covers_beds
  AFTER UPDATE OF bed_count ON public.hospital_wards
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.hospital_beds_within_count();

-- ─── 4a. Diagnostics overlay (DX-1, DX-3) ────────────────────────────────
-- kind 'lab': code = loinc_codes.code (the ordering catalogue). kind 'imaging': catalogue A.4.
-- Keyed by code, so feat/emr-engine's test_catalogue reconciles by code at merge.
CREATE TABLE IF NOT EXISTS public.diagnostic_offerings (
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('lab','imaging')),
  code text NOT NULL CHECK (code ~ '^[A-Za-z0-9._-]{1,40}$'),
  provision text NOT NULL CHECK (provision IN ('in_house','referred','not_offered')),
  section_id uuid REFERENCES public.hospital_departments(id) ON DELETE SET NULL,
  hours text CHECK (hours IN ('24h','scheduled')),
  hours_note text CHECK (char_length(hours_note) <= 60),
  stated_tat text CHECK (char_length(stated_tat) <= 40),        -- operational, never a clinical target
  referred_to text CHECK (char_length(referred_to) <= 120),
  machines integer CHECK (machines >= 0),
  confirmed_at timestamptz,                                  -- NULL = Planned (preset / legacy import)
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (hospital_id, kind, code)
);

-- ─── 4b. Capability values with four-eyes (CAP-1, CAP-5) ────────────────
-- `value` is the verified (or non-routing) value; `pending_*` is a routing change awaiting a second
-- person. For the emergency pathway's own keys (CAP-2) the value lives in `hospitals` columns and
-- only the pending/verification state lives here.
CREATE TABLE IF NOT EXISTS public.capability_values (
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  key text NOT NULL CHECK (key ~ '^[a-z0-9_]{2,40}$'),
  value jsonb,
  authored_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  authored_at timestamptz,
  verified_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  verified_at timestamptz,
  pending_value jsonb,
  pending_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  pending_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (hospital_id, key),
  CONSTRAINT capability_values_four_eyes CHECK (verified_by IS NULL OR verified_by IS DISTINCT FROM authored_by),
  CONSTRAINT capability_values_pending_shape CHECK (
    (pending_at IS NULL) = (pending_by IS NULL) AND (pending_value IS NULL OR pending_at IS NOT NULL))
);

-- ─── 4c. Availability (AV-1): append-only events; the state is a projection ──
CREATE TABLE IF NOT EXISTS public.availability_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  problem_id uuid NOT NULL,
  subject_kind text NOT NULL CHECK (subject_kind IN
    ('department','ward','clinic','test','lab_section','imaging','capability')),
  subject_ref text NOT NULL CHECK (char_length(subject_ref) BETWEEN 1 AND 80),
  subject_label text NOT NULL CHECK (char_length(subject_label) BETWEEN 1 AND 120),
  event text NOT NULL CHECK (event IN ('reported','updated','resolved','confirmed')),
  state text CHECK (state IN ('unavailable','limited')),
  reason text CHECK (reason IN ('equipment_down','stock_out','staff','power_water','maintenance',
    'building_works','other')),
  note text CHECK (char_length(note) <= 280),
  expected_back_at timestamptz,
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT availability_events_report_shape CHECK (
    event NOT IN ('reported','updated') OR (state IS NOT NULL AND reason IS NOT NULL)),
  CONSTRAINT availability_events_other_note CHECK (reason IS DISTINCT FROM 'other' OR note IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS availability_events_hospital_at ON public.availability_events (hospital_id, at DESC);
CREATE INDEX IF NOT EXISTS availability_events_problem ON public.availability_events (problem_id, at);
DROP TRIGGER IF EXISTS availability_events_append_only ON public.availability_events;
CREATE TRIGGER availability_events_append_only
  BEFORE UPDATE OR DELETE ON public.availability_events
  FOR EACH ROW EXECUTE FUNCTION public.block_modify_append_only();

-- ─── 5a. Public holidays (reference; D-SVC-09) ───────────────────────────
CREATE TABLE IF NOT EXISTS public.public_holidays (
  id serial PRIMARY KEY,
  holiday_date date NOT NULL,
  name text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('fixed','movable','one_off')),
  provisional boolean NOT NULL DEFAULT false,               -- e.g. Eid: subject to moon sighting
  source text NOT NULL,
  verified_on date NOT NULL,
  UNIQUE (holiday_date, name)
);
INSERT INTO public.public_holidays (holiday_date, name, kind, provisional, source, verified_on) VALUES
  ('2026-01-01','New Year''s Day','fixed',false,'officeholidays.com/countries/uganda/2026','2026-09-26'),
  ('2026-01-15','Public holiday (general elections)','one_off',false,'officeholidays.com/countries/uganda/2026','2026-09-26'),
  ('2026-01-16','Public holiday (general elections)','one_off',false,'officeholidays.com/countries/uganda/2026','2026-09-26'),
  ('2026-01-26','NRM Liberation Day','fixed',false,'officeholidays.com/countries/uganda/2026','2026-09-26'),
  ('2026-02-16','Archbishop Janani Luwum Day','fixed',false,'officeholidays.com/countries/uganda/2026','2026-09-26'),
  ('2026-03-08','International Women''s Day','fixed',false,'officeholidays.com/countries/uganda/2026','2026-09-26'),
  ('2026-03-20','Eid al-Fitr','movable',true,'officeholidays.com/countries/uganda/2026','2026-09-26'),
  ('2026-04-03','Good Friday','movable',false,'officeholidays.com/countries/uganda/2026','2026-09-26'),
  ('2026-04-06','Easter Monday','movable',false,'officeholidays.com/countries/uganda/2026','2026-09-26'),
  ('2026-05-01','Labour Day','fixed',false,'officeholidays.com/countries/uganda/2026','2026-09-26'),
  ('2026-05-12','Public holiday (presidential inauguration)','one_off',false,'officeholidays.com/countries/uganda/2026','2026-09-26'),
  ('2026-05-27','Eid al-Adha','movable',true,'officeholidays.com/countries/uganda/2026','2026-09-26'),
  ('2026-06-03','Martyrs'' Day','fixed',false,'officeholidays.com/countries/uganda/2026','2026-09-26'),
  ('2026-06-09','National Heroes'' Day','fixed',false,'officeholidays.com/countries/uganda/2026','2026-09-26'),
  ('2026-07-28','Public holiday (local elections)','one_off',false,'officeholidays.com/countries/uganda/2026','2026-09-26'),
  ('2026-10-09','Independence Day','fixed',false,'officeholidays.com/countries/uganda/2026','2026-09-26'),
  ('2026-12-25','Christmas Day','fixed',false,'officeholidays.com/countries/uganda/2026','2026-09-26'),
  ('2026-12-26','Boxing Day','fixed',false,'officeholidays.com/countries/uganda/2026','2026-09-26'),
  -- 2027: fixed dates + Easter (28 Mar 2027). Eid dates are added when the government announces them.
  ('2027-01-01','New Year''s Day','fixed',false,'Public holidays in Uganda (fixed dates), verified','2026-09-26'),
  ('2027-01-26','NRM Liberation Day','fixed',false,'Public holidays in Uganda (fixed dates), verified','2026-09-26'),
  ('2027-02-16','Archbishop Janani Luwum Day','fixed',false,'Public holidays in Uganda (fixed dates), verified','2026-09-26'),
  ('2027-03-08','International Women''s Day','fixed',false,'Public holidays in Uganda (fixed dates), verified','2026-09-26'),
  ('2027-03-26','Good Friday','movable',false,'Computus (Easter Sunday 28 Mar 2027)','2026-09-26'),
  ('2027-03-29','Easter Monday','movable',false,'Computus (Easter Sunday 28 Mar 2027)','2026-09-26'),
  ('2027-05-01','Labour Day','fixed',false,'Public holidays in Uganda (fixed dates), verified','2026-09-26'),
  ('2027-06-03','Martyrs'' Day','fixed',false,'Public holidays in Uganda (fixed dates), verified','2026-09-26'),
  ('2027-06-09','National Heroes'' Day','fixed',false,'Public holidays in Uganda (fixed dates), verified','2026-09-26'),
  ('2027-10-09','Independence Day','fixed',false,'Public holidays in Uganda (fixed dates), verified','2026-09-26'),
  ('2027-12-25','Christmas Day','fixed',false,'Public holidays in Uganda (fixed dates), verified','2026-09-26'),
  ('2027-12-26','Boxing Day','fixed',false,'Public holidays in Uganda (fixed dates), verified','2026-09-26')
ON CONFLICT (holiday_date, name) DO NOTHING;

-- ─── 5b. Closures (CLN-4: closures always win) ───────────────────────────
CREATE TABLE IF NOT EXISTS public.service_closures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  scope text NOT NULL CHECK (scope IN ('hospital','department','ward','clinic')),
  department_id uuid REFERENCES public.hospital_departments(id) ON DELETE CASCADE,
  ward_id uuid REFERENCES public.hospital_wards(id) ON DELETE CASCADE,
  service_line_id uuid REFERENCES public.service_lines(id) ON DELETE CASCADE,
  starts_on date NOT NULL,
  ends_on date NOT NULL,
  reason text NOT NULL CHECK (char_length(reason) BETWEEN 8 AND 280),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  lifted_at timestamptz,
  lifted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT service_closures_dates CHECK (ends_on >= starts_on),
  CONSTRAINT service_closures_target CHECK (
    (scope = 'hospital'   AND department_id IS NULL AND ward_id IS NULL AND service_line_id IS NULL) OR
    (scope = 'department' AND department_id IS NOT NULL AND ward_id IS NULL AND service_line_id IS NULL) OR
    (scope = 'ward'       AND ward_id IS NOT NULL AND department_id IS NULL AND service_line_id IS NULL) OR
    (scope = 'clinic'     AND service_line_id IS NOT NULL AND department_id IS NULL AND ward_id IS NULL))
);
CREATE INDEX IF NOT EXISTS service_closures_hospital_dates ON public.service_closures (hospital_id, starts_on, ends_on);

-- ─── 6a. Hub state: the one-time legacy import decision (S2) ─────────────
CREATE TABLE IF NOT EXISTS public.hospital_services_state (
  hospital_id uuid PRIMARY KEY REFERENCES public.hospitals(id) ON DELETE CASCADE,
  legacy_import text CHECK (legacy_import IN ('accepted','declined')),
  legacy_decided_at timestamptz,
  legacy_decided_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ─── 6b. Staff of a hospital, clinical or not (reception reads the internal view) ──
CREATE OR REPLACE FUNCTION public.is_hospital_staff(p_hospital uuid)
  RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.staff_affiliations sa
    WHERE sa.user_id = auth.uid() AND sa.hospital_id = p_hospital AND sa.state IN ('active','approved'));
$$;
REVOKE ALL ON FUNCTION public.is_hospital_staff(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_hospital_staff(uuid) TO authenticated;

-- ─── 6c. Triggers + RLS on every hub table (read: admin, superadmin, staff; write: none) ──
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['hospital_places','department_heads','hospital_beds','diagnostic_offerings',
    'capability_values','availability_events','service_closures','hospital_services_state']
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS audit_%1$s ON public.%1$s', t);
    EXECUTE format('CREATE TRIGGER audit_%1$s AFTER INSERT OR UPDATE OR DELETE ON public.%1$s
      FOR EACH ROW EXECUTE FUNCTION public.audit_log_changes()', t);
    EXECUTE format('ALTER TABLE public.%s ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE public.%s FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %1$s_select_scoped ON public.%1$s', t);
    EXECUTE format('CREATE POLICY %1$s_select_scoped ON public.%1$s FOR SELECT TO authenticated USING (
      public.user_has_role(''superadmin'') OR public.user_has_role(''hospital_admin'', hospital_id)
      OR public.is_hospital_staff(hospital_id))', t);
  END LOOP;
  FOREACH t IN ARRAY ARRAY['hospital_places','department_heads','hospital_beds','diagnostic_offerings',
    'capability_values','hospital_services_state']
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS set_updated_at_%1$s ON public.%1$s', t);
    EXECUTE format('CREATE TRIGGER set_updated_at_%1$s BEFORE UPDATE ON public.%1$s
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()', t);
  END LOOP;
END $$;

ALTER TABLE public.public_holidays ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.public_holidays FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS public_holidays_select_all ON public.public_holidays;
CREATE POLICY public_holidays_select_all ON public.public_holidays FOR SELECT TO anon, authenticated USING (true);
GRANT SELECT ON public.public_holidays TO anon, authenticated;
GRANT SELECT ON public.hospital_places, public.department_heads, public.hospital_beds,
  public.diagnostic_offerings, public.capability_values, public.availability_events,
  public.service_closures, public.hospital_services_state TO authenticated;

-- No client writes anywhere in the hub: every writer is an Edge Function on the service role.
DROP POLICY IF EXISTS hospital_departments_modify_admin ON public.hospital_departments;
DROP POLICY IF EXISTS hospital_wards_write_admin ON public.hospital_wards;

-- ─── 6d. Audit verbs (0070's list verbatim + the hub's; nothing removed) ──
ALTER TABLE public.sa_audit_log DROP CONSTRAINT IF EXISTS sa_audit_log_action_check;
ALTER TABLE public.sa_audit_log ADD CONSTRAINT sa_audit_log_action_check CHECK (
  action IN (
    'approve_staff_affiliation', 'reject_staff_affiliation', 'approve_hospital_application',
    'reject_hospital_application', 'cross_tenant_read', 'cross_tenant_export', 'elevate_admin',
    'create_superadmin', 'demote_admin', 'break_glass_open', 'break_glass_close',
    'four_eyes_request', 'four_eyes_confirm', 'four_eyes_cancel', 'activate_hospital',
    'suspend_user', 'reset_user_mfa', 'deactivate_user', 'reactivate_user', 'export_audit_log',
    'sa_create_hospital', 'sa_invite_hospital_admin', 'hospital_admin_claimed',
    'request_staff_info', 'suspend_staff_affiliation', 'deactivate_staff_affiliation',
    'reactivate_staff_affiliation', 'reset_staff_mfa', 'assign_staff_role', 'invite_staff',
    'revoke_staff_invitation', 'book_appointment', 'confirm_appointment_request',
    'decline_appointment_request', 'cancel_appointment', 'reschedule_appointment',
    'mark_no_show', 'mark_arrived', 'start_encounter', 'complete_encounter',
    'propose_urgent_appointment', 'record_walkin', 'set_clinician_availability',
    'cancel_clinician_availability', 'update_clinician_settings', 'update_department_policy',
    'override_out_of_hours_booking', 'assign_supervision', 'end_supervision', 'cosign_request',
    'cosign_approve', 'cosign_return', 'cosign_cancel', 'cosign_expire', 'update_cosign_policy',
    'phi_access_break_glass', 'record_observation', 'correct_observation',
    'administer_medication', 'withhold_medication', 'submit_handover', 'assign_patient_to_nurse',
    'unassign_patient_from_nurse', 'assign_ward_in_charge', 'end_ward_in_charge',
    'escalate_to_medical_team', 'register_intake', 'update_intake', 'cancel_intake',
    'check_in_patient', 'patient_declare_intake', 'compute_triage', 'assign_triage',
    'override_triage', 'adjust_triage_baseline', 'open_resus_episode', 'conclude_resus_episode',
    'record_resus_event', 'correct_resus_event', 'assign_resus_role', 'end_resus_role',
    'mobilise_resus_team', 'detect_resus_arrest', 'set_emergency_phone', 'rate_visit',
    'update_service_line', 'update_session_template', 'cancel_session', 'book_on_behalf',
    'reconcile_identity', 'unreconcile_identity', 'add_booking_agent', 'join_waitlist',
    'accept_waitlist_offer', 'accept_rebooking', 'confirm_attendance', 'set_session_delay',
    'sms_stop', 'set_service_line_fee', 'submit_symptoms', 'emergency_interrupt_shown',
    'emergency_declined', 'emergency_call_tapped', 'request_same_day', 'create_pre_arrival',
    'update_pre_arrival', 'sign_catalog_version', 'verify_emergency_contact',
    'set_hospital_emergency_settings', 'set_resus_phase', 'stop_resuscitation', 'confirm_death',
    'set_resus_disposition', 'cancel_resus_episode', 'close_resus_administratively',
    'reactivate_resus', 'record_resus_arrest_record', 'submit_resus_debrief',
    'record_resus_after_death_task', 'update_resus_settings', 'retire_assignment',
    'verify_hospital_application',
    -- 0080: the Departments & services hub
    'update_department', 'set_department_live', 'set_start_department', 'assign_department_head',
    'end_department_head', 'archive_structure', 'unarchive_structure', 'update_ward', 'update_beds',
    'update_place', 'update_diagnostics', 'set_capability', 'verify_capability', 'reject_capability',
    'report_availability', 'add_closure', 'lift_closure', 'apply_service_preset',
    'import_legacy_services'
  )
);

-- ─── 7. Backfill ─────────────────────────────────────────────────────────
-- Every department is visible to sign-up and queues today: keep it so (D-SVC-02, no behaviour change).
UPDATE public.hospital_departments SET medsync_live_at = created_at WHERE medsync_live_at IS NULL;

-- Catalogue codes from slugs (INTERNAL_MEDICINE ↔ internal-medicine, legacy underscores too).
UPDATE public.hospital_departments
   SET catalogue_code = upper(replace(slug, '-', '_'))
 WHERE catalogue_code IS NULL AND parent_id IS NULL
   AND upper(replace(slug, '-', '_')) IN (
     'INTERNAL_MEDICINE','FAMILY_MEDICINE','GENERAL_SURGERY','ORTHOPAEDICS','UROLOGY','NEUROSURGERY',
     'CARDIOTHORACIC','PAEDIATRIC_SURGERY','PLASTIC_RECONSTRUCTIVE','ENT','MAXILLOFACIAL',
     'OBSTETRICS_GYNAECOLOGY','PAEDIATRICS_CHILD_HEALTH','NEONATOLOGY','EMERGENCY','ANAESTHESIA',
     'INTENSIVE_CARE','PSYCHIATRY','PHYSIOTHERAPY_REHAB','PALLIATIVE_CARE','DENTAL_ORAL',
     'PUBLIC_HEALTH','OPHTHALMOLOGY','LABORATORY','RADIOLOGY_IMAGING','PHARMACY',
     'NUTRITION_DIETETICS','MORTUARY','RECORDS_HEALTH_INFO','RECEPTION_FRONT_DESK');

-- Start department from the application's primary pick (hyphenated twin preferred; one per hospital).
WITH primary_pick AS (
  SELECT DISTINCT ON (ha.approved_hospital_id) ha.approved_hospital_id AS hospital_id,
         had.department_family AS code
    FROM public.hospital_applications ha
    JOIN public.hospital_application_departments had ON had.application_id = ha.id
   WHERE had.is_primary AND ha.approved_hospital_id IS NOT NULL
   ORDER BY ha.approved_hospital_id, ha.created_at DESC
), target AS (
  SELECT DISTINCT ON (d.hospital_id) d.id
    FROM public.hospital_departments d
    JOIN primary_pick p ON p.hospital_id = d.hospital_id
   WHERE d.parent_id IS NULL AND d.archived_at IS NULL AND upper(replace(d.slug, '-', '_')) = p.code
     AND NOT EXISTS (SELECT 1 FROM public.hospital_departments s WHERE s.hospital_id = d.hospital_id AND s.is_start)
   ORDER BY d.hospital_id, (position('_' IN d.slug) > 0), d.created_at
)
UPDATE public.hospital_departments SET is_start = true WHERE id IN (SELECT id FROM target);

-- STR-2 backstops, added after the backfill so it can satisfy them.
CREATE UNIQUE INDEX IF NOT EXISTS hospital_departments_one_start
  ON public.hospital_departments (hospital_id) WHERE is_start;
ALTER TABLE public.hospital_departments DROP CONSTRAINT IF EXISTS hospital_departments_start_shape;
ALTER TABLE public.hospital_departments ADD CONSTRAINT hospital_departments_start_shape CHECK (
  NOT is_start OR (parent_id IS NULL AND medsync_live_at IS NOT NULL AND archived_at IS NULL));
