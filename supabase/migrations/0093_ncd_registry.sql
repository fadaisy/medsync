-- ─────────────────────────────────────────────────────────────────────────
-- 0093_ncd_registry — ⚠️ GATED — owner-applied (npm run db:migrate).
--
-- NCDSync, the hospital NCD registry (docs/ncd/, PROMPT-NCDSYNC-BUILD-v2, ADRs 0208–0212).
-- ADDITIVE and re-runnable: new roles, functions, tables, triggers and policies. No existing row is
-- changed and no existing table is altered.
--   1. Roles medsync_ncd_app (no BYPASSRLS; every NCD read and write) and medsync_ncd_analytics
--      (no identifier column is granted to it; dashboards and the indicator engine).
--   2. The capability map (I1) as data, and the SQL that resolves a user's NCD roles from cadres,
--      the hospital admin roster and explicit assignments. Superadmin resolves to no role.
--   3. Engine tables, every one keyed on facility_id (= hospitals.id).
--   4. Interlocks as triggers: synthetic-only before go-live, real-only after, DEMO- numbers,
--      non-synthetic rows can never be deleted, signed snapshots are immutable, append-only logs,
--      four-eyes approvals, draft core modules, the CSO role only by the database owner.
--   5. audit_log_changes() on every NCD table.
--   6. Row-level policies, generated from lib/ncdreg/table-access.ts (npm run ncdreg:policies).
-- GATED: owner-applied, after 0090. Until it runs and NCD_REGISTRY names a hospital, the module is off.
-- ─────────────────────────────────────────────────────────────────────────

-- ─── 1. Roles ───────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'medsync_ncd_app') THEN
    CREATE ROLE medsync_ncd_app NOLOGIN;        -- no BYPASSRLS: every policy applies
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'medsync_ncd_analytics') THEN
    CREATE ROLE medsync_ncd_analytics NOLOGIN;  -- no BYPASSRLS, no identifier columns
  END IF;
END $$;
GRANT medsync_ncd_app TO CURRENT_USER;
GRANT medsync_ncd_analytics TO CURRENT_USER;
CREATE SCHEMA IF NOT EXISTS private;
GRANT USAGE ON SCHEMA public, private TO medsync_ncd_app, medsync_ncd_analytics;

-- ─── 2. Capability map ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ncd_capability_grant (
  role text NOT NULL,
  capability text NOT NULL,
  PRIMARY KEY (role, capability)
);
ALTER TABLE public.ncd_capability_grant ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ncd_capability_grant_read ON public.ncd_capability_grant;
CREATE POLICY ncd_capability_grant_read ON public.ncd_capability_grant FOR SELECT
  TO medsync_ncd_app, medsync_ncd_analytics USING (true);
GRANT SELECT ON public.ncd_capability_grant TO medsync_ncd_app, medsync_ncd_analytics;

-- ─── 3. Tables ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ncd_facility_settings (
  facility_id uuid PRIMARY KEY REFERENCES public.hospitals(id) ON DELETE CASCADE,
  time_zone text NOT NULL DEFAULT 'Africa/Kampala',
  glucose_unit text NOT NULL DEFAULT 'mmol' CHECK (glucose_unit IN ('mmol','mgdl')),
  creatinine_unit text NOT NULL DEFAULT 'umol' CHECK (creatinine_unit IN ('umol','mgdl')),
  reminder_before_days integer NOT NULL DEFAULT 2,
  reminder_after_days integer NOT NULL DEFAULT 3,
  reminder_max_missed integer NOT NULL DEFAULT 2,
  send_window_start time NOT NULL DEFAULT '08:00',
  send_window_end time NOT NULL DEFAULT '18:00',
  default_interval_weeks integer[] NOT NULL DEFAULT '{4,8,12}',
  live_sms_enabled boolean NOT NULL DEFAULT false,
  hospital_display_name text,
  clinic_phone text,
  version integer NOT NULL DEFAULT 1,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ncd_demo_load (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  mode text NOT NULL CHECK (mode IN ('scenario','full_clinic')),
  catalogue_version text NOT NULL,
  seed integer NOT NULL,
  day0 date NOT NULL,
  status text NOT NULL DEFAULT 'loading' CHECK (status IN ('loading','on','removing','off','failed')),
  progress jsonb NOT NULL DEFAULT '{}'::jsonb,
  previous_condition_settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  counts jsonb NOT NULL DEFAULT '{}'::jsonb,
  started_by uuid NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_by uuid,
  ended_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS ncd_demo_load_one_active_idx ON public.ncd_demo_load (facility_id)
  WHERE status IN ('loading','on','removing');

CREATE TABLE IF NOT EXISTS public.ncd_condition_setting (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  condition_code text NOT NULL,
  enabled boolean NOT NULL,
  module_level text NOT NULL CHECK (module_level IN ('full','core')),
  module_status text NOT NULL CHECK (module_status IN ('draft','approved')),
  module_version text NOT NULL,
  version integer NOT NULL,
  reason text,
  demo_load_id uuid REFERENCES public.ncd_demo_load(id),
  set_by uuid,
  set_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (facility_id, condition_code, version)
);

CREATE TABLE IF NOT EXISTS public.ncd_staff_role (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ncd_role text NOT NULL CHECK (ncd_role IN ('registry_lead','head_of_department','auditor','clinical_safety_officer')),
  granted_by uuid,
  granted_at timestamptz NOT NULL DEFAULT now(),
  revoked_by uuid,
  revoked_at timestamptz
);
CREATE INDEX IF NOT EXISTS ncd_staff_role_user_idx ON public.ncd_staff_role (user_id, facility_id);

CREATE TABLE IF NOT EXISTS public.ncd_registry_counter (
  facility_id uuid PRIMARY KEY REFERENCES public.hospitals(id) ON DELETE CASCADE,
  next_value integer NOT NULL DEFAULT 1
);
ALTER TABLE public.ncd_registry_counter ENABLE ROW LEVEL SECURITY;  -- no policy: reached only by the function

CREATE TABLE IF NOT EXISTS public.ncd_person (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  registry_number text NOT NULL,
  is_synthetic boolean NOT NULL DEFAULT false,
  demo_load_id uuid REFERENCES public.ncd_demo_load(id),
  hospital_number_ciphertext text,
  hospital_number_hmac text,
  national_id_ciphertext text,
  national_id_hmac text,
  given_name_ciphertext text NOT NULL,
  family_name_ciphertext text NOT NULL,
  sex text NOT NULL CHECK (sex IN ('female','male')),
  date_of_birth date,
  birth_year integer NOT NULL,
  dob_estimated boolean NOT NULL DEFAULT false,
  phone1_ciphertext text,
  phone1_hmac text,
  phone1_invalid boolean NOT NULL DEFAULT false,
  phone2_ciphertext text,
  phone2_hmac text,
  phone2_invalid boolean NOT NULL DEFAULT false,
  nok_name_ciphertext text,
  nok_phone_ciphertext text,
  district_code text,
  district_name text,
  subcounty_code text,
  subcounty_name text,
  parish_ciphertext text,
  village_ciphertext text,
  sms_allowed boolean NOT NULL DEFAULT false,
  calls_allowed boolean NOT NULL DEFAULT true,
  sms_opted_out_at timestamptz,
  privacy_notice_version text NOT NULL,
  privacy_notice_ack_at timestamptz NOT NULL,
  height_cm numeric(5,1),
  tobacco text CHECK (tobacco IN ('never','former','current')),
  alcohol text CHECK (alcohol IN ('none','occasional','regular')),
  known_cvd text[] NOT NULL DEFAULT '{}',
  known_kidney_disease boolean,
  family_history_diabetes boolean,
  family_history_hypertension boolean,
  recall_removed_at timestamptz,
  merged_into_id uuid REFERENCES public.ncd_person(id),
  merged_at timestamptz,
  patient_user_id uuid REFERENCES public.patient_profiles(id) ON DELETE SET NULL,
  provisional_patient_id uuid REFERENCES public.provisional_patients(id) ON DELETE SET NULL,
  principal text NOT NULL DEFAULT 'user' CHECK (principal IN ('user','system','demo_loader')),
  entered_by uuid,
  entered_by_label text,
  entered_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (facility_id, registry_number),
  CHECK (NOT is_synthetic OR (patient_user_id IS NULL AND provisional_patient_id IS NULL)),
  CHECK (entered_by_label IS NULL OR is_synthetic)
);
CREATE INDEX IF NOT EXISTS ncd_person_phone1_idx ON public.ncd_person (facility_id, phone1_hmac);
CREATE INDEX IF NOT EXISTS ncd_person_phone2_idx ON public.ncd_person (facility_id, phone2_hmac);
CREATE INDEX IF NOT EXISTS ncd_person_hospnum_idx ON public.ncd_person (facility_id, hospital_number_hmac);
CREATE INDEX IF NOT EXISTS ncd_person_natid_idx ON public.ncd_person (facility_id, national_id_hmac);
CREATE INDEX IF NOT EXISTS ncd_person_synthetic_idx ON public.ncd_person (facility_id, is_synthetic);

CREATE TABLE IF NOT EXISTS public.ncd_name_index (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  person_id uuid NOT NULL REFERENCES public.ncd_person(id),
  token_hmac text NOT NULL
);
CREATE INDEX IF NOT EXISTS ncd_name_index_token_idx ON public.ncd_name_index (facility_id, token_hmac);
CREATE INDEX IF NOT EXISTS ncd_name_index_person_idx ON public.ncd_name_index (person_id);

CREATE TABLE IF NOT EXISTS public.ncd_registration (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  person_id uuid NOT NULL REFERENCES public.ncd_person(id),
  condition_code text NOT NULL,
  subtype text NOT NULL,
  registration_date date NOT NULL,
  diagnosis_year integer NOT NULL,
  diagnosis_month integer CHECK (diagnosis_month BETWEEN 1 AND 12),
  basis_of_diagnosis text NOT NULL,
  where_first_diagnosed text,
  referral_source text,
  is_historical boolean NOT NULL DEFAULT false,
  superseded_by_id uuid REFERENCES public.ncd_registration(id),
  principal text NOT NULL DEFAULT 'user',
  entered_by uuid,
  entered_by_label text,
  entered_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ncd_registration_person_idx ON public.ncd_registration (person_id);
CREATE INDEX IF NOT EXISTS ncd_registration_facility_idx ON public.ncd_registration (facility_id, condition_code);

CREATE TABLE IF NOT EXISTS public.ncd_appointment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  person_id uuid NOT NULL REFERENCES public.ncd_person(id),
  appointment_date date NOT NULL,
  source_visit_id uuid,
  source_call_id uuid,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','attended','cancelled','superseded')),
  status_reason text,
  entered_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ncd_appointment_day_idx ON public.ncd_appointment (facility_id, appointment_date);
CREATE INDEX IF NOT EXISTS ncd_appointment_person_idx ON public.ncd_appointment (person_id);

CREATE TABLE IF NOT EXISTS public.ncd_visit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  person_id uuid NOT NULL REFERENCES public.ncd_person(id),
  appointment_id uuid REFERENCES public.ncd_appointment(id),
  visit_date date NOT NULL,
  visit_type text NOT NULL CHECK (visit_type IN ('scheduled','unscheduled','refill_only','remote')),
  is_historical boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
  is_invalid boolean NOT NULL DEFAULT false,
  stage text NOT NULL DEFAULT 'waiting' CHECK (stage IN ('waiting','measurements_taken','with_clinician','closed')),
  arrived_at timestamptz,
  weight_kg numeric(5,1),
  bp_readings jsonb NOT NULL DEFAULT '[]'::jsonb,
  visit_systolic integer,
  visit_diastolic integer,
  bmi numeric(4,1),
  height_cm_used numeric(5,1),
  bmi_formula text,
  bp_formula text,
  glucose_mmol numeric(4,1),
  glucose_original_value numeric(6,1),
  glucose_original_unit text CHECK (glucose_original_unit IN ('mmol','mgdl')),
  glucose_type text CHECK (glucose_type IN ('fasting','random','post_meal')),
  glucose_method text CHECK (glucose_method IN ('capillary','laboratory')),
  hba1c_percent numeric(4,1),
  hba1c_mmol_mol integer,
  hba1c_result_date date,
  hypoglycaemia text CHECK (hypoglycaemia IN ('none','mild_self_treated','severe_needed_help','not_asked')),
  medicines text[] NOT NULL DEFAULT '{}',
  medicines_other_ciphertext text,
  medicines_confirmed_unchanged boolean,
  missed_doses text CHECK (missed_doses IN ('none','1_to_2_days','3_or_more_days','not_asked')),
  medicines_obtained text CHECK (medicines_obtained IN ('full','partial','none','not_applicable')),
  not_obtained_reason text CHECK (not_obtained_reason IN ('stock_out','cost','other')),
  next_appointment_date date,
  disposition text CHECK (disposition IN ('transfer_out','discharged_to_primary_care')),
  nurse_saved_by uuid,
  nurse_saved_at timestamptz,
  nurse_saved_label text,
  clinician_started_by uuid,
  clinician_started_at timestamptz,
  clinician_saved_by uuid,
  clinician_saved_at timestamptz,
  clinician_saved_label text,
  closed_by uuid,
  closed_at timestamptz,
  principal text NOT NULL DEFAULT 'user',
  entered_by uuid,
  entered_at timestamptz NOT NULL DEFAULT now(),
  client_ts timestamptz,
  version integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (status <> 'closed' OR next_appointment_date IS NOT NULL OR disposition IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS ncd_visit_person_idx ON public.ncd_visit (person_id, visit_date);
CREATE INDEX IF NOT EXISTS ncd_visit_facility_day_idx ON public.ncd_visit (facility_id, visit_date);

CREATE TABLE IF NOT EXISTS public.ncd_observation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  person_id uuid NOT NULL REFERENCES public.ncd_person(id),
  visit_id uuid NOT NULL REFERENCES public.ncd_visit(id),
  registration_id uuid NOT NULL REFERENCES public.ncd_registration(id),
  code text NOT NULL,
  value_text text,
  value_num numeric,
  entered_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (visit_id, registration_id, code)
);
CREATE INDEX IF NOT EXISTS ncd_observation_person_idx ON public.ncd_observation (person_id);

CREATE TABLE IF NOT EXISTS public.ncd_review (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  person_id uuid NOT NULL REFERENCES public.ncd_person(id),
  component text NOT NULL CHECK (component IN ('kidney','eyes','feet','lipids','other')),
  review_date date NOT NULL,
  data jsonb NOT NULL,
  derived jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_historical boolean NOT NULL DEFAULT false,
  is_invalid boolean NOT NULL DEFAULT false,
  principal text NOT NULL DEFAULT 'user',
  entered_by uuid,
  entered_by_label text,
  entered_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ncd_review_person_idx ON public.ncd_review (person_id, component, review_date);

CREATE TABLE IF NOT EXISTS public.ncd_event (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  person_id uuid NOT NULL REFERENCES public.ncd_person(id),
  event_type text NOT NULL,
  event_date date NOT NULL,
  date_estimated boolean NOT NULL DEFAULT false,
  reporting_unit text NOT NULL,
  admission_reason text,
  death_place text CHECK (death_place IN ('this_facility','other_facility','home','unknown')),
  death_cause_ciphertext text,
  death_source text CHECK (death_source IN ('ward','family_call','records','other')),
  transfer_destination_ciphertext text,
  is_invalid boolean NOT NULL DEFAULT false,
  principal text NOT NULL DEFAULT 'user',
  entered_by uuid,
  entered_by_label text,
  entered_at timestamptz NOT NULL DEFAULT now(),
  version integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ncd_event_person_idx ON public.ncd_event (person_id, event_type);

CREATE TABLE IF NOT EXISTS public.ncd_call (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  person_id uuid NOT NULL REFERENCES public.ncd_person(id),
  appointment_id uuid REFERENCES public.ncd_appointment(id),
  call_date date NOT NULL,
  outcome text NOT NULL CHECK (outcome IN ('will_return','call_later','no_answer','moved_or_transferred','died','wrong_number','declined')),
  new_appointment_date date,
  phone_slot integer,
  principal text NOT NULL DEFAULT 'user',
  entered_by uuid,
  entered_by_label text,
  entered_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ncd_call_person_idx ON public.ncd_call (person_id, call_date);

CREATE TABLE IF NOT EXISTS public.ncd_sms_template (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  purpose text NOT NULL CHECK (purpose IN ('appointment_reminder','missed_visit')),
  language text NOT NULL,
  body text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','pending_review','approved','retired')),
  version integer NOT NULL DEFAULT 1,
  created_by uuid,
  first_approver uuid,
  approved_by uuid,
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (status <> 'approved' OR (first_approver IS NOT NULL AND approved_by IS NOT NULL AND first_approver <> approved_by))
);

CREATE TABLE IF NOT EXISTS public.ncd_reminder (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  person_id uuid NOT NULL REFERENCES public.ncd_person(id),
  appointment_id uuid NOT NULL REFERENCES public.ncd_appointment(id),
  kind text NOT NULL CHECK (kind IN ('before','missed')),
  seq integer NOT NULL DEFAULT 1,
  due_on date NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','cancelled','blocked')),
  status_reason text,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (appointment_id, kind, seq)
);
CREATE INDEX IF NOT EXISTS ncd_reminder_due_idx ON public.ncd_reminder (facility_id, status, due_on);

CREATE TABLE IF NOT EXISTS public.ncd_sms_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  person_id uuid NOT NULL REFERENCES public.ncd_person(id),
  reminder_id uuid REFERENCES public.ncd_reminder(id),
  to_hmac text,
  body text NOT NULL,
  transport text NOT NULL,
  result text NOT NULL CHECK (result IN ('logged','sent','failed','blocked')),
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ncd_query (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  person_id uuid NOT NULL REFERENCES public.ncd_person(id),
  rule_id text NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved','dismissed')),
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  resolution_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_by uuid,
  resolved_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS ncd_query_open_idx ON public.ncd_query (facility_id, person_id, rule_id) WHERE status = 'open';

CREATE TABLE IF NOT EXISTS public.ncd_audit_sample (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  person_id uuid NOT NULL REFERENCES public.ncd_person(id),
  visit_id uuid NOT NULL REFERENCES public.ncd_visit(id),
  month date NOT NULL,
  seed text NOT NULL,
  field_agreement jsonb,
  checked_by uuid,
  checked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (facility_id, month, visit_id)
);

CREATE TABLE IF NOT EXISTS public.ncd_merge_request (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  person_id uuid NOT NULL REFERENCES public.ncd_person(id),
  loser_person_id uuid NOT NULL REFERENCES public.ncd_person(id),
  reason text,
  status text NOT NULL DEFAULT 'requested' CHECK (status IN ('requested','approved','refused')),
  requested_by uuid NOT NULL,
  requested_at timestamptz NOT NULL DEFAULT now(),
  decided_by uuid,
  decided_at timestamptz,
  CHECK (decided_by IS NULL OR decided_by <> requested_by),
  CHECK (person_id <> loser_person_id)
);

CREATE TABLE IF NOT EXISTS public.ncd_record_version (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  person_id uuid NOT NULL REFERENCES public.ncd_person(id),
  record_table text NOT NULL,
  record_id uuid NOT NULL,
  version integer NOT NULL,
  data jsonb NOT NULL,
  reason text NOT NULL,
  changed_by uuid,
  changed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ncd_record_version_record_idx ON public.ncd_record_version (record_table, record_id);

CREATE TABLE IF NOT EXISTS public.ncd_command_log (
  command_id uuid PRIMARY KEY,
  facility_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  person_id uuid REFERENCES public.ncd_person(id),
  type text NOT NULL,
  principal text NOT NULL,
  user_id uuid,
  client_ts timestamptz,
  entered_at timestamptz NOT NULL,
  result jsonb NOT NULL DEFAULT '{}'::jsonb,
  demo_load_id uuid REFERENCES public.ncd_demo_load(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ncd_command_log_person_idx ON public.ncd_command_log (person_id);

CREATE TABLE IF NOT EXISTS public.ncd_indicator_snapshot (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  month date NOT NULL,
  definition_version text NOT NULL,
  results jsonb NOT NULL,
  is_synthetic boolean NOT NULL DEFAULT false,
  demo_load_id uuid REFERENCES public.ncd_demo_load(id),
  computed_at timestamptz NOT NULL DEFAULT now(),
  signed_by uuid,
  signed_at timestamptz,
  UNIQUE (facility_id, month, is_synthetic)
);

CREATE TABLE IF NOT EXISTS public.ncd_go_live_request (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'requested' CHECK (status IN ('requested','approved','refused','withdrawn')),
  note text,
  requested_by uuid NOT NULL,
  requested_at timestamptz NOT NULL DEFAULT now(),
  decided_by uuid,
  decided_at timestamptz,
  CHECK (decided_by IS NULL OR decided_by <> requested_by)
);
CREATE UNIQUE INDEX IF NOT EXISTS ncd_go_live_one_idx ON public.ncd_go_live_request (facility_id)
  WHERE status IN ('requested','approved');

CREATE TABLE IF NOT EXISTS public.ncd_export_request (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('research_extract','full_export','aggregate_csv','dhis2','fhir')),
  status text NOT NULL DEFAULT 'requested' CHECK (status IN ('requested','approved','released','refused')),
  approval_reference text,
  requested_by uuid NOT NULL,
  requested_at timestamptz NOT NULL DEFAULT now(),
  approved_by uuid,
  approved_at timestamptz,
  released_at timestamptz,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  CHECK (approved_by IS NULL OR approved_by <> requested_by)
);

CREATE TABLE IF NOT EXISTS public.ncd_definition_version (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  definition_id text NOT NULL,
  version text NOT NULL,
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed','approved','refused')),
  author uuid NOT NULL,
  approver uuid,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (facility_id, definition_id, version),
  CHECK (approver IS NULL OR approver <> author)
);

CREATE TABLE IF NOT EXISTS public.ncd_access_event (
  id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  facility_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  user_id uuid,
  principal text NOT NULL DEFAULT 'user',
  action text NOT NULL,
  person_id uuid,
  demo_load_id uuid,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ncd_access_event_facility_idx ON public.ncd_access_event (facility_id, at);

-- ─── 2b. Identity and capability functions ──────────────────────────────
CREATE OR REPLACE FUNCTION private.ncd_principal() RETURNS text
LANGUAGE sql STABLE SET search_path = pg_catalog AS $$
  SELECT coalesce(nullif(current_setting('app.ncd_principal', true), ''), 'user');
$$;

-- A user's NCD roles at a hospital, derived from the repository's own roles (D-10).
CREATE OR REPLACE FUNCTION private.ncd_user_roles(p_user uuid, p_hospital uuid) RETURNS text[]
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT CASE
    WHEN p_user IS NULL OR p_hospital IS NULL THEN '{}'::text[]
    WHEN EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = p_user AND ur.role = 'superadmin') THEN '{}'::text[]
    ELSE coalesce((
      SELECT array_agg(DISTINCT r ORDER BY r) FROM (
        SELECT CASE
          WHEN c.code IN ('NURSE','MIDWIFE','SPECIALIST_NURSE') THEN 'triage_nurse'
          WHEN c.code IN ('INTERN_DOCTOR','MEDICAL_OFFICER','MEDICAL_OFFICER_SG','CONSULTANT','SENIOR_CONSULTANT','CLINICAL_OFFICER') THEN 'clinician'
          WHEN c.code = 'RECEPTION' THEN 'registry_officer'
        END AS r
        FROM public.staff_affiliations sa JOIN public.cadres c ON c.id = sa.cadre_id
        WHERE sa.user_id = p_user AND sa.hospital_id = p_hospital AND sa.state::text IN ('active','approved')
        UNION ALL
        SELECT 'administrator' FROM public.hospital_admin_roster h
        WHERE h.user_id = p_user AND h.hospital_id = p_hospital AND h.succeeded_at IS NULL
        UNION ALL
        SELECT s.ncd_role FROM public.ncd_staff_role s
        WHERE s.user_id = p_user AND s.facility_id = p_hospital AND s.revoked_at IS NULL
      ) x WHERE r IS NOT NULL), '{}'::text[])
  END;
$$;

-- The roles in force for this transaction: a person's, or a principal's (system, demo_loader).
CREATE OR REPLACE FUNCTION private.ncd_current_roles() RETURNS text[]
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  _p text := private.ncd_principal();
  _user_roles text[] := private.ncd_user_roles(private.current_user_id(), private.current_hospital_id());
BEGIN
  IF private.current_hospital_id() IS NULL THEN
    RETURN '{}'::text[];
  ELSIF _p = 'system' THEN
    RETURN ARRAY['system'];
  ELSIF _p = 'demo_loader' THEN
    -- The loader acts only while the user who switched demo data on holds demo_data_manage here.
    IF EXISTS (SELECT 1 FROM public.ncd_capability_grant g
               WHERE g.role = ANY(_user_roles) AND g.capability = 'demo_data_manage') THEN
      RETURN ARRAY['demo_loader'];
    END IF;
    RETURN '{}'::text[];
  END IF;
  RETURN _user_roles;
END;
$$;

CREATE OR REPLACE FUNCTION private.ncd_can_any(p_caps text[]) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM public.ncd_capability_grant g
                 WHERE g.role = ANY(private.ncd_current_roles()) AND g.capability = ANY(p_caps));
$$;

CREATE OR REPLACE FUNCTION private.ncd_has_any_capability() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM public.ncd_capability_grant g WHERE g.role = ANY(private.ncd_current_roles()));
$$;

-- NULL person → true (a row that names no person); unknown person → false.
CREATE OR REPLACE FUNCTION private.ncd_person_synthetic(p_person uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT CASE WHEN p_person IS NULL THEN true
              ELSE coalesce((SELECT is_synthetic FROM public.ncd_person WHERE id = p_person), false) END;
$$;

-- The demo loader may write only synthetic persons' rows.
CREATE OR REPLACE FUNCTION private.ncd_synthetic_ok(p_synthetic boolean) RETURNS boolean
LANGUAGE sql STABLE SET search_path = pg_catalog AS $$
  SELECT private.ncd_principal() <> 'demo_loader' OR coalesce(p_synthetic, false);
$$;

CREATE OR REPLACE FUNCTION private.ncd_facility_approved(p_facility uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM public.ncd_go_live_request r WHERE r.facility_id = p_facility AND r.status = 'approved');
$$;

CREATE OR REPLACE FUNCTION private.ncd_demo_active(p_facility uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM public.ncd_demo_load d WHERE d.facility_id = p_facility AND d.status IN ('loading','on','removing'));
$$;

-- The live registry number sequence: NCD-<year>-<5 digits>. Never issues the DEMO- series.
CREATE OR REPLACE FUNCTION private.ncd_next_registry_number(p_year integer) RETURNS text
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  _f uuid := private.current_hospital_id();
  _n integer;
BEGIN
  IF _f IS NULL OR NOT private.ncd_can_any('{enrol,legacy_entry}'::text[]) THEN
    RAISE EXCEPTION 'ncd: not allowed to issue a registry number' USING ERRCODE = '42501';
  END IF;
  INSERT INTO public.ncd_registry_counter (facility_id, next_value) VALUES (_f, 2)
  ON CONFLICT (facility_id) DO UPDATE SET next_value = ncd_registry_counter.next_value + 1
  RETURNING next_value - 1 INTO _n;
  RETURN 'NCD-' || p_year::text || '-' || lpad(_n::text, 5, '0');
END;
$$;

REVOKE ALL ON FUNCTION private.ncd_user_roles(uuid, uuid), private.ncd_current_roles(), private.ncd_can_any(text[]),
  private.ncd_has_any_capability(), private.ncd_person_synthetic(uuid), private.ncd_facility_approved(uuid),
  private.ncd_demo_active(uuid), private.ncd_next_registry_number(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.ncd_principal(), private.ncd_user_roles(uuid, uuid), private.ncd_current_roles(),
  private.ncd_can_any(text[]), private.ncd_has_any_capability(), private.ncd_person_synthetic(uuid),
  private.ncd_synthetic_ok(boolean), private.ncd_facility_approved(uuid), private.ncd_demo_active(uuid),
  private.current_user_id(), private.current_hospital_id()
  TO medsync_ncd_app, medsync_ncd_analytics;
GRANT EXECUTE ON FUNCTION private.ncd_next_registry_number(integer) TO medsync_ncd_app;

-- ─── 4. Interlocks ──────────────────────────────────────────────────────
-- §8.3: synthetic only before go-live, real only after; DEMO- numbers belong to synthetic persons.
CREATE OR REPLACE FUNCTION private.ncd_person_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.is_synthetic <> NEW.is_synthetic THEN
    RAISE EXCEPTION 'ncd: is_synthetic cannot change' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF private.ncd_facility_approved(NEW.facility_id) AND NEW.is_synthetic THEN
      RAISE EXCEPTION 'ncd: synthetic persons cannot be created at a facility approved for patient data' USING ERRCODE = '23514';
    END IF;
    IF NOT private.ncd_facility_approved(NEW.facility_id) AND NOT NEW.is_synthetic THEN
      RAISE EXCEPTION 'ncd: the registry is not approved for patient data' USING ERRCODE = '23514';
    END IF;
  END IF;
  IF (NEW.registry_number LIKE 'DEMO-%') <> NEW.is_synthetic THEN
    RAISE EXCEPTION 'ncd: the DEMO- series is reserved for synthetic persons' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS ncd_person_guard ON public.ncd_person;
CREATE TRIGGER ncd_person_guard BEFORE INSERT OR UPDATE ON public.ncd_person
  FOR EACH ROW EXECUTE FUNCTION private.ncd_person_guard();

-- §10.5 / interlock 4: a record of a person who is not synthetic is never deleted, by anyone.
CREATE OR REPLACE FUNCTION private.ncd_delete_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE _synthetic boolean;
BEGIN
  IF TG_TABLE_NAME = 'ncd_person' THEN
    _synthetic := OLD.is_synthetic;
  ELSIF TG_TABLE_NAME = 'ncd_indicator_snapshot' THEN
    _synthetic := OLD.is_synthetic AND OLD.signed_at IS NULL;
  ELSIF TG_TABLE_NAME = 'ncd_command_log' AND OLD.person_id IS NULL THEN
    _synthetic := OLD.demo_load_id IS NOT NULL;
  ELSE
    _synthetic := coalesce((SELECT is_synthetic FROM public.ncd_person WHERE id = OLD.person_id), false);
  END IF;
  IF NOT _synthetic THEN
    RAISE EXCEPTION 'ncd: % rows of a person who is not synthetic are never deleted', TG_TABLE_NAME USING ERRCODE = '42501';
  END IF;
  RETURN OLD;
END;
$$;
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['ncd_person','ncd_name_index','ncd_registration','ncd_visit','ncd_observation','ncd_review',
    'ncd_event','ncd_appointment','ncd_reminder','ncd_call','ncd_sms_log','ncd_query','ncd_audit_sample',
    'ncd_merge_request','ncd_record_version','ncd_command_log','ncd_indicator_snapshot'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS ncd_delete_guard ON public.%I', t);
    EXECUTE format('CREATE TRIGGER ncd_delete_guard BEFORE DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION private.ncd_delete_guard()', t);
  END LOOP;
END $$;

-- Append-only logs.
CREATE OR REPLACE FUNCTION private.ncd_append_only() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  RAISE EXCEPTION 'ncd: % is append-only', TG_TABLE_NAME USING ERRCODE = '42501';
END;
$$;
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['ncd_access_event','ncd_record_version','ncd_command_log','ncd_condition_setting'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS ncd_append_only ON public.%I', t);
    EXECUTE format('CREATE TRIGGER ncd_append_only BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION private.ncd_append_only()', t);
  END LOOP;
END $$;
DROP TRIGGER IF EXISTS ncd_append_only_delete ON public.ncd_access_event;
CREATE TRIGGER ncd_append_only_delete BEFORE DELETE ON public.ncd_access_event
  FOR EACH ROW EXECUTE FUNCTION private.ncd_append_only();
DROP TRIGGER IF EXISTS ncd_append_only_delete ON public.ncd_condition_setting;
CREATE TRIGGER ncd_append_only_delete BEFORE DELETE ON public.ncd_condition_setting
  FOR EACH ROW EXECUTE FUNCTION private.ncd_append_only();

-- §6 / F5: a signed snapshot is immutable; signing needs an approved facility with no demo data on.
CREATE OR REPLACE FUNCTION private.ncd_snapshot_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF OLD.signed_at IS NOT NULL THEN
    RAISE EXCEPTION 'ncd: a signed snapshot is immutable' USING ERRCODE = '42501';
  END IF;
  IF NEW.signed_at IS NOT NULL THEN
    IF NEW.is_synthetic THEN
      RAISE EXCEPTION 'ncd: a synthetic snapshot cannot be signed' USING ERRCODE = '42501';
    END IF;
    IF NOT private.ncd_facility_approved(NEW.facility_id) THEN
      RAISE EXCEPTION 'ncd: no report can be signed before go-live approval' USING ERRCODE = '42501';
    END IF;
    IF private.ncd_demo_active(NEW.facility_id) THEN
      RAISE EXCEPTION 'ncd: no report can be signed while demo data is on' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS ncd_snapshot_guard ON public.ncd_indicator_snapshot;
CREATE TRIGGER ncd_snapshot_guard BEFORE UPDATE ON public.ncd_indicator_snapshot
  FOR EACH ROW EXECUTE FUNCTION private.ncd_snapshot_guard();

-- I4: after go-live only an approved core module can be enabled.
CREATE OR REPLACE FUNCTION private.ncd_condition_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.enabled AND NEW.module_level = 'core' AND NEW.module_status = 'draft'
     AND private.ncd_facility_approved(NEW.facility_id) THEN
    RAISE EXCEPTION 'ncd: a draft core module cannot be enabled at a facility approved for patient data' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS ncd_condition_guard ON public.ncd_condition_setting;
CREATE TRIGGER ncd_condition_guard BEFORE INSERT ON public.ncd_condition_setting
  FOR EACH ROW EXECUTE FUNCTION private.ncd_condition_guard();

-- §8.3: go-live approval by a different user holding clinical safety approval; refused while any
-- synthetic person exists, demo data is on, or an enabled core module is draft.
CREATE OR REPLACE FUNCTION private.ncd_go_live_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.status = 'approved' AND OLD.status <> 'approved' THEN
    IF NEW.decided_by IS NULL OR NEW.decided_by = NEW.requested_by THEN
      RAISE EXCEPTION 'ncd: go-live needs a second, different approver' USING ERRCODE = '42501';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.ncd_capability_grant g
                   WHERE g.role = ANY(private.ncd_user_roles(NEW.decided_by, NEW.facility_id))
                     AND g.capability = 'clinical_safety_approve') THEN
      RAISE EXCEPTION 'ncd: the approver must hold clinical safety approval' USING ERRCODE = '42501';
    END IF;
    IF EXISTS (SELECT 1 FROM public.ncd_person p WHERE p.facility_id = NEW.facility_id AND p.is_synthetic) THEN
      RAISE EXCEPTION 'ncd: go-live is refused while synthetic persons exist' USING ERRCODE = '23514';
    END IF;
    IF private.ncd_demo_active(NEW.facility_id) THEN
      RAISE EXCEPTION 'ncd: go-live is refused while demo data is on' USING ERRCODE = '23514';
    END IF;
    IF EXISTS (
      SELECT 1 FROM (
        SELECT DISTINCT ON (condition_code) enabled, module_level, module_status
        FROM public.ncd_condition_setting WHERE facility_id = NEW.facility_id
        ORDER BY condition_code, version DESC) s
      WHERE s.enabled AND s.module_level = 'core' AND s.module_status = 'draft') THEN
      RAISE EXCEPTION 'ncd: go-live is refused while an enabled core module is draft' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS ncd_go_live_guard ON public.ncd_go_live_request;
CREATE TRIGGER ncd_go_live_guard BEFORE UPDATE ON public.ncd_go_live_request
  FOR EACH ROW EXECUTE FUNCTION private.ncd_go_live_guard();

-- §10.6 interlock 1: demo data only before go-live.
CREATE OR REPLACE FUNCTION private.ncd_demo_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF private.ncd_facility_approved(NEW.facility_id) THEN
    RAISE EXCEPTION 'ncd: Demo data cannot be turned on once the registry is approved for patient data.' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS ncd_demo_guard ON public.ncd_demo_load;
CREATE TRIGGER ncd_demo_guard BEFORE INSERT ON public.ncd_demo_load
  FOR EACH ROW EXECUTE FUNCTION private.ncd_demo_guard();

-- D-11: the clinical safety officer role is assigned only by the database owner, never by the app.
CREATE OR REPLACE FUNCTION private.ncd_staff_role_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.ncd_role = 'clinical_safety_officer' AND current_user IN ('medsync_ncd_app','medsync_ncd_analytics','authenticated','anon') THEN
    RAISE EXCEPTION 'ncd: the clinical safety officer role is not assignable from the application' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS ncd_staff_role_guard ON public.ncd_staff_role;
CREATE TRIGGER ncd_staff_role_guard BEFORE INSERT OR UPDATE ON public.ncd_staff_role
  FOR EACH ROW EXECUTE FUNCTION private.ncd_staff_role_guard();

-- §5.5 hard block, held in the database too: no visit after a recorded death.
CREATE OR REPLACE FUNCTION private.ncd_visit_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.ncd_event e WHERE e.person_id = NEW.person_id AND e.event_type = 'death'
             AND NOT e.is_invalid AND e.event_date < NEW.visit_date) THEN
    RAISE EXCEPTION 'ncd: a visit cannot be dated after a recorded death' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS ncd_visit_guard ON public.ncd_visit;
CREATE TRIGGER ncd_visit_guard BEFORE INSERT OR UPDATE OF visit_date ON public.ncd_visit
  FOR EACH ROW EXECUTE FUNCTION private.ncd_visit_guard();

-- ─── 5. Audit ───────────────────────────────────────────────────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['ncd_facility_settings','ncd_demo_load','ncd_condition_setting','ncd_staff_role','ncd_person',
    'ncd_name_index','ncd_registration','ncd_appointment','ncd_visit','ncd_observation','ncd_review','ncd_event','ncd_call',
    'ncd_sms_template','ncd_reminder','ncd_sms_log','ncd_query','ncd_audit_sample','ncd_merge_request','ncd_record_version',
    'ncd_command_log','ncd_indicator_snapshot','ncd_go_live_request','ncd_export_request','ncd_definition_version',
    'ncd_access_event'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS audit_%s ON public.%I', t, t);
    EXECUTE format('CREATE TRIGGER audit_%s AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.audit_log_changes()', t, t);
  END LOOP;
END $$;

-- Nothing for anon/authenticated: the module is reached only through the app's roles.
DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename LIKE 'ncd\_%' LOOP
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
  END LOOP;
END $$;

-- The analytics role sees every column except identifiers (*_ciphertext, *_hmac).
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT c.table_name, c.column_name FROM information_schema.columns c
           WHERE c.table_schema = 'public'
             AND c.table_name IN ('ncd_facility_settings','ncd_condition_setting','ncd_person','ncd_registration','ncd_visit',
               'ncd_observation','ncd_review','ncd_event','ncd_appointment','ncd_call','ncd_demo_load','ncd_go_live_request',
               'ncd_indicator_snapshot')
             AND c.column_name NOT LIKE '%\_ciphertext' AND c.column_name NOT LIKE '%\_hmac' LOOP
    EXECUTE format('GRANT SELECT (%I) ON public.%I TO medsync_ncd_analytics', r.column_name, r.table_name);
  END LOOP;
END $$;

-- ─── 6. Policies (generated: npm run ncdreg:policies — do not edit by hand) ──
-- BEGIN GENERATED POLICIES
-- ncd_facility_settings
ALTER TABLE public.ncd_facility_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ncd_facility_settings FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ncd_facility_settings_select ON public.ncd_facility_settings;
CREATE POLICY ncd_facility_settings_select ON public.ncd_facility_settings FOR SELECT TO medsync_ncd_app USING (facility_id = (SELECT private.current_hospital_id()) AND (SELECT private.ncd_has_any_capability()));
DROP POLICY IF EXISTS ncd_facility_settings_insert ON public.ncd_facility_settings;
CREATE POLICY ncd_facility_settings_insert ON public.ncd_facility_settings FOR INSERT TO medsync_ncd_app WITH CHECK (facility_id = (SELECT private.current_hospital_id()) AND (SELECT private.ncd_can_any('{code_list_manage,condition_catalogue_manage,demo_write}'::text[])));
DROP POLICY IF EXISTS ncd_facility_settings_update ON public.ncd_facility_settings;
CREATE POLICY ncd_facility_settings_update ON public.ncd_facility_settings FOR UPDATE TO medsync_ncd_app USING (facility_id = (SELECT private.current_hospital_id()) AND (SELECT private.ncd_can_any('{code_list_manage,condition_catalogue_manage,demo_write}'::text[]))) WITH CHECK (facility_id = (SELECT private.current_hospital_id()) AND (SELECT private.ncd_can_any('{code_list_manage,condition_catalogue_manage,demo_write}'::text[])));
GRANT SELECT, INSERT, UPDATE ON public.ncd_facility_settings TO medsync_ncd_app;
DROP POLICY IF EXISTS ncd_facility_settings_analytics ON public.ncd_facility_settings;
CREATE POLICY ncd_facility_settings_analytics ON public.ncd_facility_settings FOR SELECT TO medsync_ncd_analytics USING (facility_id = (SELECT private.current_hospital_id()) AND (SELECT private.ncd_can_any('{aggregate_view,report_view,report_sign,drill_down,own_panel,person_search,recall_work,data_quality,snapshot_compute,demo_write,aggregate_export,export_approve}'::text[])));

-- ncd_condition_setting
ALTER TABLE public.ncd_condition_setting ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ncd_condition_setting FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ncd_condition_setting_select ON public.ncd_condition_setting;
CREATE POLICY ncd_condition_setting_select ON public.ncd_condition_setting FOR SELECT TO medsync_ncd_app USING (facility_id = (SELECT private.current_hospital_id()) AND (SELECT private.ncd_has_any_capability()));
DROP POLICY IF EXISTS ncd_condition_setting_insert ON public.ncd_condition_setting;
CREATE POLICY ncd_condition_setting_insert ON public.ncd_condition_setting FOR INSERT TO medsync_ncd_app WITH CHECK (facility_id = (SELECT private.current_hospital_id()) AND (SELECT private.ncd_can_any('{condition_catalogue_manage,demo_data_manage,demo_write}'::text[])));
GRANT SELECT, INSERT ON public.ncd_condition_setting TO medsync_ncd_app;
DROP POLICY IF EXISTS ncd_condition_setting_analytics ON public.ncd_condition_setting;
CREATE POLICY ncd_condition_setting_analytics ON public.ncd_condition_setting FOR SELECT TO medsync_ncd_analytics USING (facility_id = (SELECT private.current_hospital_id()) AND (SELECT private.ncd_can_any('{aggregate_view,report_view,report_sign,drill_down,own_panel,person_search,recall_work,data_quality,snapshot_compute,demo_write,aggregate_export,export_approve}'::text[])));

-- ncd_staff_role
ALTER TABLE public.ncd_staff_role ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ncd_staff_role FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ncd_staff_role_select ON public.ncd_staff_role;
CREATE POLICY ncd_staff_role_select ON public.ncd_staff_role FOR SELECT TO medsync_ncd_app USING (facility_id = (SELECT private.current_hospital_id()) AND (SELECT private.ncd_has_any_capability()));
DROP POLICY IF EXISTS ncd_staff_role_insert ON public.ncd_staff_role;
CREATE POLICY ncd_staff_role_insert ON public.ncd_staff_role FOR INSERT TO medsync_ncd_app WITH CHECK (facility_id = (SELECT private.current_hospital_id()) AND (SELECT private.ncd_can_any('{ncd_role_assign}'::text[])));
DROP POLICY IF EXISTS ncd_staff_role_update ON public.ncd_staff_role;
CREATE POLICY ncd_staff_role_update ON public.ncd_staff_role FOR UPDATE TO medsync_ncd_app USING (facility_id = (SELECT private.current_hospital_id()) AND (SELECT private.ncd_can_any('{ncd_role_assign}'::text[]))) WITH CHECK (facility_id = (SELECT private.current_hospital_id()) AND (SELECT private.ncd_can_any('{ncd_role_assign}'::text[])));
GRANT SELECT, INSERT, UPDATE ON public.ncd_staff_role TO medsync_ncd_app;

-- ncd_person
ALTER TABLE public.ncd_person ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ncd_person FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ncd_person_select ON public.ncd_person;
CREATE POLICY ncd_person_select ON public.ncd_person FOR SELECT TO medsync_ncd_app USING (facility_id = (SELECT private.current_hospital_id()) AND (SELECT private.ncd_can_any('{person_search,drill_down,recall_work,data_quality,merge_request,merge_approve,legacy_entry,late_lab_results,own_panel,export_approve,reminder_dispatch,demo_write}'::text[])) AND private.ncd_synthetic_ok(is_synthetic));
DROP POLICY IF EXISTS ncd_person_insert ON public.ncd_person;
CREATE POLICY ncd_person_insert ON public.ncd_person FOR INSERT TO medsync_ncd_app WITH CHECK (facility_id = (SELECT private.current_hospital_id()) AND (SELECT private.ncd_can_any('{enrol,legacy_entry,demo_write}'::text[])) AND private.ncd_synthetic_ok(is_synthetic));
DROP POLICY IF EXISTS ncd_person_update ON public.ncd_person;
CREATE POLICY ncd_person_update ON public.ncd_person FOR UPDATE TO medsync_ncd_app USING (facility_id = (SELECT private.current_hospital_id()) AND (SELECT private.ncd_can_any('{enrol,recall_work,data_quality,merge_approve,event_write,demo_write}'::text[])) AND private.ncd_synthetic_ok(is_synthetic)) WITH CHECK (facility_id = (SELECT private.current_hospital_id()) AND (SELECT private.ncd_can_any('{enrol,recall_work,data_quality,merge_approve,event_write,demo_write}'::text[])) AND private.ncd_synthetic_ok(is_synthetic));
DROP POLICY IF EXISTS ncd_person_delete ON public.ncd_person;
CREATE POLICY ncd_person_delete ON public.ncd_person FOR DELETE TO medsync_ncd_app USING (facility_id = (SELECT private.current_hospital_id()) AND is_synthetic AND (SELECT private.ncd_can_any('{demo_write}'::text[])));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ncd_person TO medsync_ncd_app;
DROP POLICY IF EXISTS ncd_person_analytics ON public.ncd_person;
CREATE POLICY ncd_person_analytics ON public.ncd_person FOR SELECT TO medsync_ncd_analytics USING (facility_id = (SELECT private.current_hospital_id()) AND (SELECT private.ncd_can_any('{aggregate_view,report_view,report_sign,drill_down,own_panel,person_search,recall_work,data_quality,snapshot_compute,demo_write,aggregate_export,export_approve}'::text[])));

-- ncd_name_index
ALTER TABLE public.ncd_name_index ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ncd_name_index FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ncd_name_index_select ON public.ncd_name_index;
CREATE POLICY ncd_name_index_select ON public.ncd_name_index FOR SELECT TO medsync_ncd_app USING (facility_id = (SELECT private.current_hospital_id()) AND (SELECT private.ncd_can_any('{person_search,drill_down,recall_work,data_quality,merge_request,merge_approve,legacy_entry,late_lab_results,own_panel,export_approve,reminder_dispatch,demo_write}'::text[])) AND private.ncd_synthetic_ok(private.ncd_person_synthetic(person_id)));
DROP POLICY IF EXISTS ncd_name_index_insert ON public.ncd_name_index;
CREATE POLICY ncd_name_index_insert ON public.ncd_name_index FOR INSERT TO medsync_ncd_app WITH CHECK (facility_id = (SELECT private.current_hospital_id()) AND (SELECT private.ncd_can_any('{enrol,legacy_entry,data_quality,demo_write}'::text[])) AND private.ncd_synthetic_ok(private.ncd_person_synthetic(person_id)));
DROP POLICY IF EXISTS ncd_name_index_delete ON public.ncd_name_index;
CREATE POLICY ncd_name_index_delete ON public.ncd_name_index FOR DELETE TO medsync_ncd_app USING (facility_id = (SELECT private.current_hospital_id()) AND private.ncd_person_synthetic(person_id) AND (SELECT private.ncd_can_any('{demo_write}'::text[])));
GRANT SELECT, INSERT, DELETE ON public.ncd_name_index TO medsync_ncd_app;

-- ncd_registration
ALTER TABLE public.ncd_registration ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ncd_registration FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ncd_registration_select ON public.ncd_registration;
CREATE POLICY ncd_registration_select ON public.ncd_registration FOR SELECT TO medsync_ncd_app USING (facility_id = (SELECT private.current_hospital_id()) AND (SELECT private.ncd_can_any('{person_search,drill_down,recall_work,data_quality,merge_request,merge_approve,legacy_entry,late_lab_results,own_panel,export_approve,reminder_dispatch,demo_write}'::text[])) AND private.ncd_synthetic_ok(private.ncd_person_synthetic(person_id)));
DROP POLICY IF EXISTS ncd_registration_insert ON public.ncd_registration;
CREATE POLICY ncd_registration_insert ON public.ncd_registration FOR INSERT TO medsync_ncd_app WITH CHECK (facility_id = (SELECT private.current_hospital_id()) AND (SELECT private.ncd_can_any('{enrol,legacy_entry,demo_write}'::text[])) AND private.ncd_synthetic_ok(private.ncd_person_synthetic(person_id)));
DROP POLICY IF EXISTS ncd_registration_update ON public.ncd_registration;
CREATE POLICY ncd_registration_update ON public.ncd_registration FOR UPDATE TO medsync_ncd_app USING (facility_id = (SELECT private.current_hospital_id()) AND (SELECT private.ncd_can_any('{enrol,data_quality,merge_approve,demo_write}'::text[])) AND private.ncd_synthetic_ok(private.ncd_person_synthetic(person_id))) WITH CHECK (facility_id = (SELECT private.current_hospital_id()) AND (SELECT private.ncd_can_any('{enrol,data_quality,merge_approve,demo_write}'::text[])) AND private.ncd_synthetic_ok(private.ncd_person_synthetic(person_id)));
DROP POLICY IF EXISTS ncd_registration_delete ON public.ncd_registration;
CREATE POLICY ncd_registration_delete ON public.ncd_registration FOR DELETE TO medsync_ncd_app USING (facility_id = (SELECT private.current_hospital_id()) AND private.ncd_person_synthetic(person_id) AND (SELECT private.ncd_can_any('{demo_write}'::text[])));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ncd_registration TO medsync_ncd_app;
DROP POLICY IF EXISTS ncd_registration_analytics ON public.ncd_registration;
CREATE POLICY ncd_registration_analytics ON public.ncd_registration FOR SELECT TO medsync_ncd_analytics USING (facility_id = (SELECT private.current_hospital_id()) AND (SELECT private.ncd_can_any('{aggregate_view,report_view,report_sign,drill_down,own_panel,person_search,recall_work,data_quality,snapshot_compute,demo_write,aggregate_export,export_approve}'::text[])));

-- ncd_visit
ALTER TABLE public.ncd_visit ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ncd_visit FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ncd_visit_select ON public.ncd_visit;
CREATE POLICY ncd_visit_select ON public.ncd_visit FOR SELECT TO medsync_ncd_app USING (facility_id = (SELECT private.current_hospital_id()) AND (SELECT private.ncd_can_any('{person_search,drill_down,recall_work,data_quality,merge_request,merge_approve,legacy_entry,late_lab_results,own_panel,export_approve,reminder_dispatch,demo_write}'::text[])) AND private.ncd_synthetic_ok(private.ncd_person_synthetic(person_id)));
DROP POLICY IF EXISTS ncd_visit_insert ON public.ncd_visit;
CREATE POLICY ncd_visit_insert ON public.ncd_visit FOR INSERT TO medsync_ncd_app WITH CHECK (facility_id = (SELECT private.current_hospital_id()) AND (SELECT private.ncd_can_any('{nurse_visit_write,clinician_visit_write,legacy_entry,demo_write}'::text[])) AND private.ncd_synthetic_ok(private.ncd_person_synthetic(person_id)));
DROP POLICY IF EXISTS ncd_visit_update ON public.ncd_visit;
CREATE POLICY ncd_visit_update ON public.ncd_visit FOR UPDATE TO medsync_ncd_app USING (facility_id = (SELECT private.current_hospital_id()) AND (SELECT private.ncd_can_any('{nurse_visit_write,clinician_visit_write,legacy_entry,demo_write,late_lab_results,data_quality,merge_approve}'::text[])) AND private.ncd_synthetic_ok(private.ncd_person_synthetic(person_id))) WITH CHECK (facility_id = (SELECT private.current_hospital_id()) AND (SELECT private.ncd_can_any('{nurse_visit_write,clinician_visit_write,legacy_entry,demo_write,late_lab_results,data_quality,merge_approve}'::text[])) AND private.ncd_synthetic_ok(private.ncd_person_synthetic(person_id)));
DROP POLICY IF EXISTS ncd_visit_delete ON public.ncd_visit;
CREATE POLICY ncd_visit_delete ON public.ncd_visit FOR DELETE TO medsync_ncd_app USING (facility_id = (SELECT private.current_hospital_id()) AND private.ncd_person_synthetic(person_id) AND (SELECT private.ncd_can_any('{demo_write}'::text[])));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ncd_visit TO medsync_ncd_app;
DROP POLICY IF EXISTS ncd_visit_analytics ON public.ncd_visit;
CREATE POLICY ncd_visit_analytics ON public.ncd_visit FOR SELECT TO medsync_ncd_analytics USING (facility_id = (SELECT private.current_hospital_id()) AND (SELECT private.ncd_can_any('{aggregate_view,report_view,report_sign,drill_down,own_panel,person_search,recall_work,data_quality,snapshot_compute,demo_write,aggregate_export,export_approve}'::text[])));

-- ncd_observation
ALTER TABLE public.ncd_observation ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ncd_observation FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ncd_observation_select ON public.ncd_observation;
CREATE POLICY ncd_observation_select ON public.ncd_observation FOR SELECT TO medsync_ncd_app USING (facility_id = (SELECT private.current_hospital_id()) AND (SELECT private.ncd_can_any('{person_search,drill_down,recall_work,data_quality,merge_request,merge_approve,legacy_entry,late_lab_results,own_panel,export_approve,reminder_dispatch,demo_write}'::text[])) AND private.ncd_synthetic_ok(private.ncd_person_synthetic(person_id)));
DROP POLICY IF EXISTS ncd_observation_insert ON public.ncd_observation;
CREATE POLICY ncd_observation_insert ON public.ncd_observation FOR INSERT TO medsync_ncd_app WITH CHECK (facility_id = (SELECT private.current_hospital_id()) AND (SELECT private.ncd_can_any('{nurse_visit_write,clinician_visit_write,legacy_entry,demo_write}'::text[])) AND private.ncd_synthetic_ok(private.ncd_person_synthetic(person_id)));
DROP POLICY IF EXISTS ncd_observation_update ON public.ncd_observation;
CREATE POLICY ncd_observation_update ON public.ncd_observation FOR UPDATE TO medsync_ncd_app USING (facility_id = (SELECT private.current_hospital_id()) AND (SELECT private.ncd_can_any('{nurse_visit_write,clinician_visit_write,legacy_entry,demo_write,merge_approve}'::text[])) AND private.ncd_synthetic_ok(private.ncd_person_synthetic(person_id))) WITH CHECK (facility_id = (SELECT private.current_hospital_id()) AND (SELECT private.ncd_can_any('{nurse_visit_write,clinician_visit_write,legacy_entry,demo_write,merge_approve}'::text[])) AND private.ncd_synthetic_ok(private.ncd_person_synthetic(person_id)));
DROP POLICY IF EXISTS ncd_observation_delete ON public.ncd_observation;
CREATE POLICY ncd_observation_delete ON public.ncd_observation FOR DELETE TO medsync_ncd_app USING (facility_id = (SELECT private.current_hospital_id()) AND private.ncd_person_synthetic(person_id) AND (SELECT private.ncd_can_any('{demo_write}'::text[])));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ncd_observation TO medsync_ncd_app;
DROP POLICY IF EXISTS ncd_observation_analytics ON public.ncd_observation;
CREATE POLICY ncd_observation_analytics ON public.ncd_observation FOR SELECT TO medsync_ncd_analytics USING (facility_id = (SELECT private.current_hospital_id()) AND (SELECT private.ncd_can_any('{aggregate_view,report_view,report_sign,drill_down,own_panel,person_search,recall_work,data_quality,snapshot_compute,demo_write,aggregate_export,export_approve}'::text[])));

-- ncd_review
ALTER TABLE public.ncd_review ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ncd_review FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ncd_review_select ON public.ncd_review;
CREATE POLICY ncd_review_select ON public.ncd_review FOR SELECT TO medsync_ncd_app USING (facility_id = (SELECT private.current_hospital_id()) AND (SELECT private.ncd_can_any('{person_search,drill_down,recall_work,data_quality,merge_request,merge_approve,legacy_entry,late_lab_results,own_panel,export_approve,reminder_dispatch,demo_write}'::text[])) AND private.ncd_synthetic_ok(private.ncd_person_synthetic(person_id)));
DROP POLICY IF EXISTS ncd_review_insert ON public.ncd_review;
CREATE POLICY ncd_review_insert ON public.ncd_review FOR INSERT TO medsync_ncd_app WITH CHECK (facility_id = (SELECT private.current_hospital_id()) AND (SELECT private.ncd_can_any('{review_write,legacy_entry,demo_write}'::text[])) AND private.ncd_synthetic_ok(private.ncd_person_synthetic(person_id)));
DROP POLICY IF EXISTS ncd_review_update ON public.ncd_review;
CREATE POLICY ncd_review_update ON public.ncd_review FOR UPDATE TO medsync_ncd_app USING (facility_id = (SELECT private.current_hospital_id()) AND (SELECT private.ncd_can_any('{review_write,data_quality,merge_approve,demo_write}'::text[])) AND private.ncd_synthetic_ok(private.ncd_person_synthetic(person_id))) WITH CHECK (facility_id = (SELECT private.current_hospital_id()) AND (SELECT private.ncd_can_any('{review_write,data_quality,merge_approve,demo_write}'::text[])) AND private.ncd_synthetic_ok(private.ncd_person_synthetic(person_id)));
DROP POLICY IF EXISTS ncd_review_delete ON public.ncd_review;
CREATE POLICY ncd_review_delete ON public.ncd_review FOR DELETE TO medsync_ncd_app USING (facility_id = (SELECT private.current_hospital_id()) AND private.ncd_person_synthetic(person_id) AND (SELECT private.ncd_can_any('{demo_write}'::text[])));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ncd_review TO medsync_ncd_app;
DROP POLICY IF EXISTS ncd_review_analytics ON public.ncd_review;
CREATE POLICY ncd_review_analytics ON public.ncd_review FOR SELECT TO medsync_ncd_analytics USING (facility_id = (SELECT private.current_hospital_id()) AND (SELECT private.ncd_can_any('{aggregate_view,report_view,report_sign,drill_down,own_panel,person_search,recall_work,data_quality,snapshot_compute,demo_write,aggregate_export,export_approve}'::text[])));

-- ncd_event
ALTER TABLE public.ncd_event ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ncd_event FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ncd_event_select ON public.ncd_event;
CREATE POLICY ncd_event_select ON public.ncd_event FOR SELECT TO medsync_ncd_app USING (facility_id = (SELECT private.current_hospital_id()) AND (SELECT private.ncd_can_any('{person_search,drill_down,recall_work,data_quality,merge_request,merge_approve,legacy_entry,late_lab_results,own_panel,export_approve,reminder_dispatch,demo_write}'::text[])) AND private.ncd_synthetic_ok(private.ncd_person_synthetic(person_id)));
DROP POLICY IF EXISTS ncd_event_insert ON public.ncd_event;
CREATE POLICY ncd_event_insert ON public.ncd_event FOR INSERT TO medsync_ncd_app WITH CHECK (facility_id = (SELECT private.current_hospital_id()) AND (SELECT private.ncd_can_any('{event_write,demo_write}'::text[])) AND private.ncd_synthetic_ok(private.ncd_person_synthetic(person_id)));
DROP POLICY IF EXISTS ncd_event_update ON public.ncd_event;
CREATE POLICY ncd_event_update ON public.ncd_event FOR UPDATE TO medsync_ncd_app USING (facility_id = (SELECT private.current_hospital_id()) AND (SELECT private.ncd_can_any('{event_write,data_quality,merge_approve,demo_write}'::text[])) AND private.ncd_synthetic_ok(private.ncd_person_synthetic(person_id))) WITH CHECK (facility_id = (SELECT private.current_hospital_id()) AND (SELECT private.ncd_can_any('{event_write,data_quality,merge_approve,demo_write}'::text[])) AND private.ncd_synthetic_ok(private.ncd_person_synthetic(person_id)));
DROP POLICY IF EXISTS ncd_event_delete ON public.ncd_event;
CREATE POLICY ncd_event_delete ON public.ncd_event FOR DELETE TO medsync_ncd_app USING (facility_id = (SELECT private.current_hospital_id()) AND private.ncd_person_synthetic(person_id) AND (SELECT private.ncd_can_any('{demo_write}'::text[])));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ncd_event TO medsync_ncd_app;
DROP POLICY IF EXISTS ncd_event_analytics ON public.ncd_event;
CREATE POLICY ncd_event_analytics ON public.ncd_event FOR SELECT TO medsync_ncd_analytics USING (facility_id = (SELECT private.current_hospital_id()) AND (SELECT private.ncd_can_any('{aggregate_view,report_view,report_sign,drill_down,own_panel,person_search,recall_work,data_quality,snapshot_compute,demo_write,aggregate_export,export_approve}'::text[])));

-- ncd_appointment
ALTER TABLE public.ncd_appointment ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ncd_appointment FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ncd_appointment_select ON public.ncd_appointment;
CREATE POLICY ncd_appointment_select ON public.ncd_appointment FOR SELECT TO medsync_ncd_app USING (facility_id = (SELECT private.current_hospital_id()) AND (SELECT private.ncd_can_any('{person_search,drill_down,recall_work,data_quality,merge_request,merge_approve,legacy_entry,late_lab_results,own_panel,export_approve,reminder_dispatch,demo_write}'::text[])) AND private.ncd_synthetic_ok(private.ncd_person_synthetic(person_id)));
DROP POLICY IF EXISTS ncd_appointment_insert ON public.ncd_appointment;
CREATE POLICY ncd_appointment_insert ON public.ncd_appointment FOR INSERT TO medsync_ncd_app WITH CHECK (facility_id = (SELECT private.current_hospital_id()) AND (SELECT private.ncd_can_any('{nurse_visit_write,clinician_visit_write,legacy_entry,demo_write,recall_work}'::text[])) AND private.ncd_synthetic_ok(private.ncd_person_synthetic(person_id)));
DROP POLICY IF EXISTS ncd_appointment_update ON public.ncd_appointment;
CREATE POLICY ncd_appointment_update ON public.ncd_appointment FOR UPDATE TO medsync_ncd_app USING (facility_id = (SELECT private.current_hospital_id()) AND (SELECT private.ncd_can_any('{nurse_visit_write,clinician_visit_write,legacy_entry,demo_write,recall_work,event_write,merge_approve,reminder_dispatch}'::text[])) AND private.ncd_synthetic_ok(private.ncd_person_synthetic(person_id))) WITH CHECK (facility_id = (SELECT private.current_hospital_id()) AND (SELECT private.ncd_can_any('{nurse_visit_write,clinician_visit_write,legacy_entry,demo_write,recall_work,event_write,merge_approve,reminder_dispatch}'::text[])) AND private.ncd_synthetic_ok(private.ncd_person_synthetic(person_id)));
DROP POLICY IF EXISTS ncd_appointment_delete ON public.ncd_appointment;
CREATE POLICY ncd_appointment_delete ON public.ncd_appointment FOR DELETE TO medsync_ncd_app USING (facility_id = (SELECT private.current_hospital_id()) AND private.ncd_person_synthetic(person_id) AND (SELECT private.ncd_can_any('{demo_write}'::text[])));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ncd_appointment TO medsync_ncd_app;
DROP POLICY IF EXISTS ncd_appointment_analytics ON public.ncd_appointment;
CREATE POLICY ncd_appointment_analytics ON public.ncd_appointment FOR SELECT TO medsync_ncd_analytics USING (facility_id = (SELECT private.current_hospital_id()) AND (SELECT private.ncd_can_any('{aggregate_view,report_view,report_sign,drill_down,own_panel,person_search,recall_work,data_quality,snapshot_compute,demo_write,aggregate_export,export_approve}'::text[])));

-- ncd_reminder
ALTER TABLE public.ncd_reminder ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ncd_reminder FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ncd_reminder_select ON public.ncd_reminder;
CREATE POLICY ncd_reminder_select ON public.ncd_reminder FOR SELECT TO medsync_ncd_app USING (facility_id = (SELECT private.current_hospital_id()) AND (SELECT private.ncd_can_any('{person_search,drill_down,recall_work,data_quality,merge_request,merge_approve,legacy_entry,late_lab_results,own_panel,export_approve,reminder_dispatch,demo_write,audit_view}'::text[])) AND private.ncd_synthetic_ok(private.ncd_person_synthetic(person_id)));
DROP POLICY IF EXISTS ncd_reminder_insert ON public.ncd_reminder;
CREATE POLICY ncd_reminder_insert ON public.ncd_reminder FOR INSERT TO medsync_ncd_app WITH CHECK (facility_id = (SELECT private.current_hospital_id()) AND (SELECT private.ncd_can_any('{nurse_visit_write,clinician_visit_write,legacy_entry,demo_write,recall_work}'::text[])) AND private.ncd_synthetic_ok(private.ncd_person_synthetic(person_id)));
DROP POLICY IF EXISTS ncd_reminder_update ON public.ncd_reminder;
CREATE POLICY ncd_reminder_update ON public.ncd_reminder FOR UPDATE TO medsync_ncd_app USING (facility_id = (SELECT private.current_hospital_id()) AND (SELECT private.ncd_can_any('{nurse_visit_write,clinician_visit_write,legacy_entry,demo_write,recall_work,event_write,merge_approve,reminder_dispatch}'::text[])) AND private.ncd_synthetic_ok(private.ncd_person_synthetic(person_id))) WITH CHECK (facility_id = (SELECT private.current_hospital_id()) AND (SELECT private.ncd_can_any('{nurse_visit_write,clinician_visit_write,legacy_entry,demo_write,recall_work,event_write,merge_approve,reminder_dispatch}'::text[])) AND private.ncd_synthetic_ok(private.ncd_person_synthetic(person_id)));
DROP POLICY IF EXISTS ncd_reminder_delete ON public.ncd_reminder;
CREATE POLICY ncd_reminder_delete ON public.ncd_reminder FOR DELETE TO medsync_ncd_app USING (facility_id = (SELECT private.current_hospital_id()) AND private.ncd_person_synthetic(person_id) AND (SELECT private.ncd_can_any('{demo_write}'::text[])));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ncd_reminder TO medsync_ncd_app;

-- ncd_call
ALTER TABLE public.ncd_call ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ncd_call FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ncd_call_select ON public.ncd_call;
CREATE POLICY ncd_call_select ON public.ncd_call FOR SELECT TO medsync_ncd_app USING (facility_id = (SELECT private.current_hospital_id()) AND (SELECT private.ncd_can_any('{person_search,drill_down,recall_work,data_quality,merge_request,merge_approve,legacy_entry,late_lab_results,own_panel,export_approve,reminder_dispatch,demo_write}'::text[])) AND private.ncd_synthetic_ok(private.ncd_person_synthetic(person_id)));
DROP POLICY IF EXISTS ncd_call_insert ON public.ncd_call;
CREATE POLICY ncd_call_insert ON public.ncd_call FOR INSERT TO medsync_ncd_app WITH CHECK (facility_id = (SELECT private.current_hospital_id()) AND (SELECT private.ncd_can_any('{recall_work,demo_write}'::text[])) AND private.ncd_synthetic_ok(private.ncd_person_synthetic(person_id)));
DROP POLICY IF EXISTS ncd_call_update ON public.ncd_call;
CREATE POLICY ncd_call_update ON public.ncd_call FOR UPDATE TO medsync_ncd_app USING (facility_id = (SELECT private.current_hospital_id()) AND (SELECT private.ncd_can_any('{merge_approve,demo_write}'::text[])) AND private.ncd_synthetic_ok(private.ncd_person_synthetic(person_id))) WITH CHECK (facility_id = (SELECT private.current_hospital_id()) AND (SELECT private.ncd_can_any('{merge_approve,demo_write}'::text[])) AND private.ncd_synthetic_ok(private.ncd_person_synthetic(person_id)));
DROP POLICY IF EXISTS ncd_call_delete ON public.ncd_call;
CREATE POLICY ncd_call_delete ON public.ncd_call FOR DELETE TO medsync_ncd_app USING (facility_id = (SELECT private.current_hospital_id()) AND private.ncd_person_synthetic(person_id) AND (SELECT private.ncd_can_any('{demo_write}'::text[])));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ncd_call TO medsync_ncd_app;
DROP POLICY IF EXISTS ncd_call_analytics ON public.ncd_call;
CREATE POLICY ncd_call_analytics ON public.ncd_call FOR SELECT TO medsync_ncd_analytics USING (facility_id = (SELECT private.current_hospital_id()) AND (SELECT private.ncd_can_any('{aggregate_view,report_view,report_sign,drill_down,own_panel,person_search,recall_work,data_quality,snapshot_compute,demo_write,aggregate_export,export_approve}'::text[])));

-- ncd_sms_log
ALTER TABLE public.ncd_sms_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ncd_sms_log FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ncd_sms_log_select ON public.ncd_sms_log;
CREATE POLICY ncd_sms_log_select ON public.ncd_sms_log FOR SELECT TO medsync_ncd_app USING (facility_id = (SELECT private.current_hospital_id()) AND (SELECT private.ncd_can_any('{recall_work,data_quality,audit_view,reminder_dispatch,demo_write}'::text[])) AND private.ncd_synthetic_ok(private.ncd_person_synthetic(person_id)));
DROP POLICY IF EXISTS ncd_sms_log_insert ON public.ncd_sms_log;
CREATE POLICY ncd_sms_log_insert ON public.ncd_sms_log FOR INSERT TO medsync_ncd_app WITH CHECK (facility_id = (SELECT private.current_hospital_id()) AND (SELECT private.ncd_can_any('{reminder_dispatch}'::text[])) AND private.ncd_synthetic_ok(private.ncd_person_synthetic(person_id)));
DROP POLICY IF EXISTS ncd_sms_log_delete ON public.ncd_sms_log;
CREATE POLICY ncd_sms_log_delete ON public.ncd_sms_log FOR DELETE TO medsync_ncd_app USING (facility_id = (SELECT private.current_hospital_id()) AND private.ncd_person_synthetic(person_id) AND (SELECT private.ncd_can_any('{demo_write}'::text[])));
GRANT SELECT, INSERT, DELETE ON public.ncd_sms_log TO medsync_ncd_app;

-- ncd_sms_template
ALTER TABLE public.ncd_sms_template ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ncd_sms_template FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ncd_sms_template_select ON public.ncd_sms_template;
CREATE POLICY ncd_sms_template_select ON public.ncd_sms_template FOR SELECT TO medsync_ncd_app USING (facility_id = (SELECT private.current_hospital_id()) AND (SELECT private.ncd_has_any_capability()));
DROP POLICY IF EXISTS ncd_sms_template_insert ON public.ncd_sms_template;
CREATE POLICY ncd_sms_template_insert ON public.ncd_sms_template FOR INSERT TO medsync_ncd_app WITH CHECK (facility_id = (SELECT private.current_hospital_id()) AND (SELECT private.ncd_can_any('{code_list_manage,demo_write}'::text[])));
DROP POLICY IF EXISTS ncd_sms_template_update ON public.ncd_sms_template;
CREATE POLICY ncd_sms_template_update ON public.ncd_sms_template FOR UPDATE TO medsync_ncd_app USING (facility_id = (SELECT private.current_hospital_id()) AND (SELECT private.ncd_can_any('{code_list_manage,sms_template_approve}'::text[]))) WITH CHECK (facility_id = (SELECT private.current_hospital_id()) AND (SELECT private.ncd_can_any('{code_list_manage,sms_template_approve}'::text[])));
GRANT SELECT, INSERT, UPDATE ON public.ncd_sms_template TO medsync_ncd_app;

-- ncd_query
ALTER TABLE public.ncd_query ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ncd_query FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ncd_query_select ON public.ncd_query;
CREATE POLICY ncd_query_select ON public.ncd_query FOR SELECT TO medsync_ncd_app USING (facility_id = (SELECT private.current_hospital_id()) AND (SELECT private.ncd_can_any('{data_quality,audit_view,demo_write}'::text[])) AND private.ncd_synthetic_ok(private.ncd_person_synthetic(person_id)));
DROP POLICY IF EXISTS ncd_query_insert ON public.ncd_query;
CREATE POLICY ncd_query_insert ON public.ncd_query FOR INSERT TO medsync_ncd_app WITH CHECK (facility_id = (SELECT private.current_hospital_id()) AND (SELECT private.ncd_can_any('{enrol,nurse_visit_write,clinician_visit_write,review_write,event_write,recall_work,legacy_entry,late_lab_results,data_quality,merge_request,merge_approve,reminder_dispatch,demo_write}'::text[])) AND private.ncd_synthetic_ok(private.ncd_person_synthetic(person_id)));
DROP POLICY IF EXISTS ncd_query_update ON public.ncd_query;
CREATE POLICY ncd_query_update ON public.ncd_query FOR UPDATE TO medsync_ncd_app USING (facility_id = (SELECT private.current_hospital_id()) AND (SELECT private.ncd_can_any('{data_quality,merge_approve,demo_write}'::text[])) AND private.ncd_synthetic_ok(private.ncd_person_synthetic(person_id))) WITH CHECK (facility_id = (SELECT private.current_hospital_id()) AND (SELECT private.ncd_can_any('{data_quality,merge_approve,demo_write}'::text[])) AND private.ncd_synthetic_ok(private.ncd_person_synthetic(person_id)));
DROP POLICY IF EXISTS ncd_query_delete ON public.ncd_query;
CREATE POLICY ncd_query_delete ON public.ncd_query FOR DELETE TO medsync_ncd_app USING (facility_id = (SELECT private.current_hospital_id()) AND private.ncd_person_synthetic(person_id) AND (SELECT private.ncd_can_any('{demo_write}'::text[])));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ncd_query TO medsync_ncd_app;

-- ncd_audit_sample
ALTER TABLE public.ncd_audit_sample ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ncd_audit_sample FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ncd_audit_sample_select ON public.ncd_audit_sample;
CREATE POLICY ncd_audit_sample_select ON public.ncd_audit_sample FOR SELECT TO medsync_ncd_app USING (facility_id = (SELECT private.current_hospital_id()) AND (SELECT private.ncd_can_any('{data_quality,audit_view,demo_write}'::text[])) AND private.ncd_synthetic_ok(private.ncd_person_synthetic(person_id)));
DROP POLICY IF EXISTS ncd_audit_sample_insert ON public.ncd_audit_sample;
CREATE POLICY ncd_audit_sample_insert ON public.ncd_audit_sample FOR INSERT TO medsync_ncd_app WITH CHECK (facility_id = (SELECT private.current_hospital_id()) AND (SELECT private.ncd_can_any('{data_quality}'::text[])) AND private.ncd_synthetic_ok(private.ncd_person_synthetic(person_id)));
DROP POLICY IF EXISTS ncd_audit_sample_update ON public.ncd_audit_sample;
CREATE POLICY ncd_audit_sample_update ON public.ncd_audit_sample FOR UPDATE TO medsync_ncd_app USING (facility_id = (SELECT private.current_hospital_id()) AND (SELECT private.ncd_can_any('{data_quality}'::text[])) AND private.ncd_synthetic_ok(private.ncd_person_synthetic(person_id))) WITH CHECK (facility_id = (SELECT private.current_hospital_id()) AND (SELECT private.ncd_can_any('{data_quality}'::text[])) AND private.ncd_synthetic_ok(private.ncd_person_synthetic(person_id)));
DROP POLICY IF EXISTS ncd_audit_sample_delete ON public.ncd_audit_sample;
CREATE POLICY ncd_audit_sample_delete ON public.ncd_audit_sample FOR DELETE TO medsync_ncd_app USING (facility_id = (SELECT private.current_hospital_id()) AND private.ncd_person_synthetic(person_id) AND (SELECT private.ncd_can_any('{demo_write}'::text[])));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ncd_audit_sample TO medsync_ncd_app;

-- ncd_merge_request
ALTER TABLE public.ncd_merge_request ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ncd_merge_request FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ncd_merge_request_select ON public.ncd_merge_request;
CREATE POLICY ncd_merge_request_select ON public.ncd_merge_request FOR SELECT TO medsync_ncd_app USING (facility_id = (SELECT private.current_hospital_id()) AND (SELECT private.ncd_can_any('{data_quality,merge_request,merge_approve,audit_view,demo_write}'::text[])) AND private.ncd_synthetic_ok(private.ncd_person_synthetic(person_id)));
DROP POLICY IF EXISTS ncd_merge_request_insert ON public.ncd_merge_request;
CREATE POLICY ncd_merge_request_insert ON public.ncd_merge_request FOR INSERT TO medsync_ncd_app WITH CHECK (facility_id = (SELECT private.current_hospital_id()) AND (SELECT private.ncd_can_any('{merge_request,merge_approve}'::text[])) AND private.ncd_synthetic_ok(private.ncd_person_synthetic(person_id)));
DROP POLICY IF EXISTS ncd_merge_request_update ON public.ncd_merge_request;
CREATE POLICY ncd_merge_request_update ON public.ncd_merge_request FOR UPDATE TO medsync_ncd_app USING (facility_id = (SELECT private.current_hospital_id()) AND (SELECT private.ncd_can_any('{merge_approve}'::text[])) AND private.ncd_synthetic_ok(private.ncd_person_synthetic(person_id))) WITH CHECK (facility_id = (SELECT private.current_hospital_id()) AND (SELECT private.ncd_can_any('{merge_approve}'::text[])) AND private.ncd_synthetic_ok(private.ncd_person_synthetic(person_id)));
DROP POLICY IF EXISTS ncd_merge_request_delete ON public.ncd_merge_request;
CREATE POLICY ncd_merge_request_delete ON public.ncd_merge_request FOR DELETE TO medsync_ncd_app USING (facility_id = (SELECT private.current_hospital_id()) AND private.ncd_person_synthetic(person_id) AND (SELECT private.ncd_can_any('{demo_write}'::text[])));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ncd_merge_request TO medsync_ncd_app;

-- ncd_record_version
ALTER TABLE public.ncd_record_version ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ncd_record_version FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ncd_record_version_select ON public.ncd_record_version;
CREATE POLICY ncd_record_version_select ON public.ncd_record_version FOR SELECT TO medsync_ncd_app USING (facility_id = (SELECT private.current_hospital_id()) AND (SELECT private.ncd_can_any('{data_quality,audit_view,drill_down,demo_write}'::text[])) AND private.ncd_synthetic_ok(private.ncd_person_synthetic(person_id)));
DROP POLICY IF EXISTS ncd_record_version_insert ON public.ncd_record_version;
CREATE POLICY ncd_record_version_insert ON public.ncd_record_version FOR INSERT TO medsync_ncd_app WITH CHECK (facility_id = (SELECT private.current_hospital_id()) AND (SELECT private.ncd_can_any('{enrol,nurse_visit_write,clinician_visit_write,review_write,event_write,recall_work,legacy_entry,late_lab_results,data_quality,merge_request,merge_approve,reminder_dispatch,demo_write}'::text[])) AND private.ncd_synthetic_ok(private.ncd_person_synthetic(person_id)));
DROP POLICY IF EXISTS ncd_record_version_delete ON public.ncd_record_version;
CREATE POLICY ncd_record_version_delete ON public.ncd_record_version FOR DELETE TO medsync_ncd_app USING (facility_id = (SELECT private.current_hospital_id()) AND private.ncd_person_synthetic(person_id) AND (SELECT private.ncd_can_any('{demo_write}'::text[])));
GRANT SELECT, INSERT, DELETE ON public.ncd_record_version TO medsync_ncd_app;

-- ncd_command_log
ALTER TABLE public.ncd_command_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ncd_command_log FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ncd_command_log_select ON public.ncd_command_log;
CREATE POLICY ncd_command_log_select ON public.ncd_command_log FOR SELECT TO medsync_ncd_app USING (facility_id = (SELECT private.current_hospital_id()) AND (SELECT private.ncd_can_any('{enrol,nurse_visit_write,clinician_visit_write,review_write,event_write,recall_work,legacy_entry,late_lab_results,data_quality,merge_request,merge_approve,reminder_dispatch,demo_write,audit_view}'::text[])) AND private.ncd_synthetic_ok(private.ncd_person_synthetic(person_id)));
DROP POLICY IF EXISTS ncd_command_log_insert ON public.ncd_command_log;
CREATE POLICY ncd_command_log_insert ON public.ncd_command_log FOR INSERT TO medsync_ncd_app WITH CHECK (facility_id = (SELECT private.current_hospital_id()) AND (SELECT private.ncd_can_any('{enrol,nurse_visit_write,clinician_visit_write,review_write,event_write,recall_work,legacy_entry,late_lab_results,data_quality,merge_request,merge_approve,reminder_dispatch,demo_write}'::text[])) AND private.ncd_synthetic_ok(private.ncd_person_synthetic(person_id)));
DROP POLICY IF EXISTS ncd_command_log_delete ON public.ncd_command_log;
CREATE POLICY ncd_command_log_delete ON public.ncd_command_log FOR DELETE TO medsync_ncd_app USING (facility_id = (SELECT private.current_hospital_id()) AND private.ncd_person_synthetic(person_id) AND (SELECT private.ncd_can_any('{demo_write}'::text[])));
GRANT SELECT, INSERT, DELETE ON public.ncd_command_log TO medsync_ncd_app;

-- ncd_indicator_snapshot
ALTER TABLE public.ncd_indicator_snapshot ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ncd_indicator_snapshot FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ncd_indicator_snapshot_select ON public.ncd_indicator_snapshot;
CREATE POLICY ncd_indicator_snapshot_select ON public.ncd_indicator_snapshot FOR SELECT TO medsync_ncd_app USING (facility_id = (SELECT private.current_hospital_id()) AND (SELECT private.ncd_can_any('{aggregate_view,report_view,report_sign,drill_down,snapshot_compute,demo_write}'::text[])) AND private.ncd_synthetic_ok(is_synthetic));
DROP POLICY IF EXISTS ncd_indicator_snapshot_insert ON public.ncd_indicator_snapshot;
CREATE POLICY ncd_indicator_snapshot_insert ON public.ncd_indicator_snapshot FOR INSERT TO medsync_ncd_app WITH CHECK (facility_id = (SELECT private.current_hospital_id()) AND (SELECT private.ncd_can_any('{snapshot_compute}'::text[])) AND private.ncd_synthetic_ok(is_synthetic));
DROP POLICY IF EXISTS ncd_indicator_snapshot_update ON public.ncd_indicator_snapshot;
CREATE POLICY ncd_indicator_snapshot_update ON public.ncd_indicator_snapshot FOR UPDATE TO medsync_ncd_app USING (facility_id = (SELECT private.current_hospital_id()) AND (SELECT private.ncd_can_any('{report_sign,snapshot_compute}'::text[])) AND private.ncd_synthetic_ok(is_synthetic)) WITH CHECK (facility_id = (SELECT private.current_hospital_id()) AND (SELECT private.ncd_can_any('{report_sign,snapshot_compute}'::text[])) AND private.ncd_synthetic_ok(is_synthetic));
DROP POLICY IF EXISTS ncd_indicator_snapshot_delete ON public.ncd_indicator_snapshot;
CREATE POLICY ncd_indicator_snapshot_delete ON public.ncd_indicator_snapshot FOR DELETE TO medsync_ncd_app USING (facility_id = (SELECT private.current_hospital_id()) AND is_synthetic AND (SELECT private.ncd_can_any('{demo_write}'::text[])));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ncd_indicator_snapshot TO medsync_ncd_app;
DROP POLICY IF EXISTS ncd_indicator_snapshot_analytics ON public.ncd_indicator_snapshot;
CREATE POLICY ncd_indicator_snapshot_analytics ON public.ncd_indicator_snapshot FOR SELECT TO medsync_ncd_analytics USING (facility_id = (SELECT private.current_hospital_id()) AND (SELECT private.ncd_can_any('{aggregate_view,report_view,report_sign,drill_down,own_panel,person_search,recall_work,data_quality,snapshot_compute,demo_write,aggregate_export,export_approve}'::text[])));

-- ncd_demo_load
ALTER TABLE public.ncd_demo_load ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ncd_demo_load FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ncd_demo_load_select ON public.ncd_demo_load;
CREATE POLICY ncd_demo_load_select ON public.ncd_demo_load FOR SELECT TO medsync_ncd_app USING (facility_id = (SELECT private.current_hospital_id()) AND (SELECT private.ncd_has_any_capability()));
DROP POLICY IF EXISTS ncd_demo_load_insert ON public.ncd_demo_load;
CREATE POLICY ncd_demo_load_insert ON public.ncd_demo_load FOR INSERT TO medsync_ncd_app WITH CHECK (facility_id = (SELECT private.current_hospital_id()) AND (SELECT private.ncd_can_any('{demo_data_manage}'::text[])));
DROP POLICY IF EXISTS ncd_demo_load_update ON public.ncd_demo_load;
CREATE POLICY ncd_demo_load_update ON public.ncd_demo_load FOR UPDATE TO medsync_ncd_app USING (facility_id = (SELECT private.current_hospital_id()) AND (SELECT private.ncd_can_any('{demo_data_manage,demo_write}'::text[]))) WITH CHECK (facility_id = (SELECT private.current_hospital_id()) AND (SELECT private.ncd_can_any('{demo_data_manage,demo_write}'::text[])));
GRANT SELECT, INSERT, UPDATE ON public.ncd_demo_load TO medsync_ncd_app;
DROP POLICY IF EXISTS ncd_demo_load_analytics ON public.ncd_demo_load;
CREATE POLICY ncd_demo_load_analytics ON public.ncd_demo_load FOR SELECT TO medsync_ncd_analytics USING (facility_id = (SELECT private.current_hospital_id()) AND (SELECT private.ncd_can_any('{aggregate_view,report_view,report_sign,drill_down,own_panel,person_search,recall_work,data_quality,snapshot_compute,demo_write,aggregate_export,export_approve}'::text[])));

-- ncd_go_live_request
ALTER TABLE public.ncd_go_live_request ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ncd_go_live_request FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ncd_go_live_request_select ON public.ncd_go_live_request;
CREATE POLICY ncd_go_live_request_select ON public.ncd_go_live_request FOR SELECT TO medsync_ncd_app USING (facility_id = (SELECT private.current_hospital_id()) AND (SELECT private.ncd_has_any_capability()));
DROP POLICY IF EXISTS ncd_go_live_request_insert ON public.ncd_go_live_request;
CREATE POLICY ncd_go_live_request_insert ON public.ncd_go_live_request FOR INSERT TO medsync_ncd_app WITH CHECK (facility_id = (SELECT private.current_hospital_id()) AND (SELECT private.ncd_can_any('{go_live_request}'::text[])));
DROP POLICY IF EXISTS ncd_go_live_request_update ON public.ncd_go_live_request;
CREATE POLICY ncd_go_live_request_update ON public.ncd_go_live_request FOR UPDATE TO medsync_ncd_app USING (facility_id = (SELECT private.current_hospital_id()) AND (SELECT private.ncd_can_any('{clinical_safety_approve}'::text[]))) WITH CHECK (facility_id = (SELECT private.current_hospital_id()) AND (SELECT private.ncd_can_any('{clinical_safety_approve}'::text[])));
GRANT SELECT, INSERT, UPDATE ON public.ncd_go_live_request TO medsync_ncd_app;
DROP POLICY IF EXISTS ncd_go_live_request_analytics ON public.ncd_go_live_request;
CREATE POLICY ncd_go_live_request_analytics ON public.ncd_go_live_request FOR SELECT TO medsync_ncd_analytics USING (facility_id = (SELECT private.current_hospital_id()) AND (SELECT private.ncd_can_any('{aggregate_view,report_view,report_sign,drill_down,own_panel,person_search,recall_work,data_quality,snapshot_compute,demo_write,aggregate_export,export_approve}'::text[])));

-- ncd_export_request
ALTER TABLE public.ncd_export_request ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ncd_export_request FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ncd_export_request_select ON public.ncd_export_request;
CREATE POLICY ncd_export_request_select ON public.ncd_export_request FOR SELECT TO medsync_ncd_app USING (facility_id = (SELECT private.current_hospital_id()) AND (SELECT private.ncd_can_any('{export_request,export_approve,aggregate_export,audit_view}'::text[])));
DROP POLICY IF EXISTS ncd_export_request_insert ON public.ncd_export_request;
CREATE POLICY ncd_export_request_insert ON public.ncd_export_request FOR INSERT TO medsync_ncd_app WITH CHECK (facility_id = (SELECT private.current_hospital_id()) AND (SELECT private.ncd_can_any('{export_request,aggregate_export,export_approve}'::text[])));
DROP POLICY IF EXISTS ncd_export_request_update ON public.ncd_export_request;
CREATE POLICY ncd_export_request_update ON public.ncd_export_request FOR UPDATE TO medsync_ncd_app USING (facility_id = (SELECT private.current_hospital_id()) AND (SELECT private.ncd_can_any('{export_approve}'::text[]))) WITH CHECK (facility_id = (SELECT private.current_hospital_id()) AND (SELECT private.ncd_can_any('{export_approve}'::text[])));
GRANT SELECT, INSERT, UPDATE ON public.ncd_export_request TO medsync_ncd_app;

-- ncd_definition_version
ALTER TABLE public.ncd_definition_version ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ncd_definition_version FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ncd_definition_version_select ON public.ncd_definition_version;
CREATE POLICY ncd_definition_version_select ON public.ncd_definition_version FOR SELECT TO medsync_ncd_app USING (facility_id = (SELECT private.current_hospital_id()) AND (SELECT private.ncd_has_any_capability()));
DROP POLICY IF EXISTS ncd_definition_version_insert ON public.ncd_definition_version;
CREATE POLICY ncd_definition_version_insert ON public.ncd_definition_version FOR INSERT TO medsync_ncd_app WITH CHECK (facility_id = (SELECT private.current_hospital_id()) AND (SELECT private.ncd_can_any('{code_list_manage}'::text[])));
DROP POLICY IF EXISTS ncd_definition_version_update ON public.ncd_definition_version;
CREATE POLICY ncd_definition_version_update ON public.ncd_definition_version FOR UPDATE TO medsync_ncd_app USING (facility_id = (SELECT private.current_hospital_id()) AND (SELECT private.ncd_can_any('{code_list_manage}'::text[]))) WITH CHECK (facility_id = (SELECT private.current_hospital_id()) AND (SELECT private.ncd_can_any('{code_list_manage}'::text[])));
GRANT SELECT, INSERT, UPDATE ON public.ncd_definition_version TO medsync_ncd_app;

-- ncd_access_event
ALTER TABLE public.ncd_access_event ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ncd_access_event FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ncd_access_event_select ON public.ncd_access_event;
CREATE POLICY ncd_access_event_select ON public.ncd_access_event FOR SELECT TO medsync_ncd_app USING (facility_id = (SELECT private.current_hospital_id()) AND (SELECT private.ncd_can_any('{audit_view}'::text[])));
DROP POLICY IF EXISTS ncd_access_event_insert ON public.ncd_access_event;
CREATE POLICY ncd_access_event_insert ON public.ncd_access_event FOR INSERT TO medsync_ncd_app WITH CHECK (facility_id = (SELECT private.current_hospital_id()) AND (SELECT private.ncd_has_any_capability()));
GRANT SELECT, INSERT ON public.ncd_access_event TO medsync_ncd_app;
-- END GENERATED POLICIES

-- ─── 7. Capability map seed (lib/ncdreg/capabilities.ts; a test asserts equality) ──
-- BEGIN GENERATED GRANTS
DELETE FROM public.ncd_capability_grant;
INSERT INTO public.ncd_capability_grant (role, capability) VALUES
  ('administrator', 'aggregate_export'),
  ('administrator', 'aggregate_view'),
  ('administrator', 'demo_data_manage'),
  ('administrator', 'ncd_role_assign'),
  ('administrator', 'report_view'),
  ('auditor', 'audit_view'),
  ('clinical_safety_officer', 'clinical_safety_approve'),
  ('clinician', 'clinician_visit_write'),
  ('clinician', 'drill_down'),
  ('clinician', 'enrol'),
  ('clinician', 'event_write'),
  ('clinician', 'identifier_reveal'),
  ('clinician', 'nurse_visit_write'),
  ('clinician', 'own_panel'),
  ('clinician', 'person_search'),
  ('clinician', 'review_write'),
  ('demo_loader', 'demo_write'),
  ('demo_loader', 'snapshot_compute'),
  ('head_of_department', 'aggregate_view'),
  ('head_of_department', 'drill_down'),
  ('head_of_department', 'export_request'),
  ('head_of_department', 'report_view'),
  ('registry_lead', 'aggregate_export'),
  ('registry_lead', 'aggregate_view'),
  ('registry_lead', 'clinician_visit_write'),
  ('registry_lead', 'code_list_manage'),
  ('registry_lead', 'condition_catalogue_manage'),
  ('registry_lead', 'data_quality'),
  ('registry_lead', 'demo_data_manage'),
  ('registry_lead', 'drill_down'),
  ('registry_lead', 'enrol'),
  ('registry_lead', 'event_write'),
  ('registry_lead', 'export_approve'),
  ('registry_lead', 'go_live_request'),
  ('registry_lead', 'identifier_reveal'),
  ('registry_lead', 'late_lab_results'),
  ('registry_lead', 'legacy_entry'),
  ('registry_lead', 'merge_approve'),
  ('registry_lead', 'nurse_visit_write'),
  ('registry_lead', 'own_panel'),
  ('registry_lead', 'person_search'),
  ('registry_lead', 'report_sign'),
  ('registry_lead', 'report_view'),
  ('registry_lead', 'review_write'),
  ('registry_lead', 'sms_template_approve'),
  ('registry_officer', 'enrol'),
  ('registry_officer', 'event_write'),
  ('registry_officer', 'export_request'),
  ('registry_officer', 'identifier_reveal'),
  ('registry_officer', 'late_lab_results'),
  ('registry_officer', 'legacy_entry'),
  ('registry_officer', 'merge_request'),
  ('registry_officer', 'person_search'),
  ('registry_officer', 'recall_work'),
  ('system', 'reminder_dispatch'),
  ('system', 'snapshot_compute'),
  ('triage_nurse', 'event_write'),
  ('triage_nurse', 'identifier_reveal'),
  ('triage_nurse', 'nurse_visit_write'),
  ('triage_nurse', 'person_search');
-- END GENERATED GRANTS
