-- ─────────────────────────────────────────────────────────────────────────
-- 0021_hospital_applications_extended_profile
--
-- Hospital-registration-upgrade GATE A — extends `hospital_applications`
-- with the institution / clinical / verification / agreement fields
-- required by the upgraded onboarding flow.
--
-- Additive only — every column add uses IF NOT EXISTS so the migration
-- is safely re-runnable. The `state` CHECK is dropped + re-added with
-- the extended value list (legacy 'pending_approval' retained as alias
-- for 'applied' so existing rows keep working).
--
-- Two junction tables land here:
--   - hospital_application_departments (reference-data-anchored,
--     keyed off public.roles.department_family)
--   - hospital_application_specialties (FK to public.specialties)
--
-- The agreement-version FK is set up in migration 0022 (after the
-- hospital_dpa_versions table exists). This migration only adds the
-- column without the REFERENCES clause; the FK is attached later.
-- ─────────────────────────────────────────────────────────────────────────

-- ─── Institution profile (kickoff §B) ───────────────────────────────────

ALTER TABLE public.hospital_applications
  ADD COLUMN IF NOT EXISTS hospital_aka      text,
  ADD COLUMN IF NOT EXISTS year_established  integer,
  ADD COLUMN IF NOT EXISTS main_phone        text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS official_email    text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS website           text,
  ADD COLUMN IF NOT EXISTS region_id         uuid REFERENCES public.regions(id) ON DELETE RESTRICT;

-- Year-established sanity (only when set — old rows have NULL).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'hospital_applications_year_sane') THEN
    ALTER TABLE public.hospital_applications
      ADD CONSTRAINT hospital_applications_year_sane CHECK (
        year_established IS NULL OR (year_established BETWEEN 1900 AND EXTRACT(YEAR FROM now())::int)
      );
  END IF;
END$$;

-- ─── Clinical & operating profile (kickoff §C–§E5) ──────────────────────

ALTER TABLE public.hospital_applications
  ADD COLUMN IF NOT EXISTS specialised_clinics       text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS specialised_clinics_other text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS diagnostic_services       text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS support_services          text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS services_offered          text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS has_onsite_pharmacy       boolean,
  ADD COLUMN IF NOT EXISTS bed_capacity_band         text,
  ADD COLUMN IF NOT EXISTS clinical_staff_band       text,
  ADD COLUMN IF NOT EXISTS daily_opd_band            text,
  ADD COLUMN IF NOT EXISTS internet_connectivity     text,
  ADD COLUMN IF NOT EXISTS power_backup              text,
  ADD COLUMN IF NOT EXISTS existing_emr              text,
  ADD COLUMN IF NOT EXISTS existing_emr_name         text;

-- Enum-like CHECKs (concise text sets — extend additively).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'hospital_applications_clinics_subset') THEN
    ALTER TABLE public.hospital_applications
      ADD CONSTRAINT hospital_applications_clinics_subset CHECK (
        specialised_clinics <@ ARRAY[
          'diabetes','hypertension_cardiac','renal_dialysis','oncology','hiv_art',
          'tb','antenatal_maternal','asthma_copd','mental_health'
        ]::text[]
      );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'hospital_applications_diagnostics_subset') THEN
    ALTER TABLE public.hospital_applications
      ADD CONSTRAINT hospital_applications_diagnostics_subset CHECK (
        diagnostic_services <@ ARRAY[
          'lab_chem','lab_haem','lab_micro','lab_histo',
          'img_xray','img_ultrasound','img_ct','img_mri','img_mammography',
          'ecg','echo','endoscopy'
        ]::text[]
      );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'hospital_applications_support_subset') THEN
    ALTER TABLE public.hospital_applications
      ADD CONSTRAINT hospital_applications_support_subset CHECK (
        support_services <@ ARRAY[
          'pharmacy','blood_bank','operating_theatres','mortuary','ambulance'
        ]::text[]
      );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'hospital_applications_services_subset') THEN
    ALTER TABLE public.hospital_applications
      ADD CONSTRAINT hospital_applications_services_subset CHECK (
        services_offered <@ ARRAY[
          'opd','inpatient','day_care','emergency_24_7','referral'
        ]::text[]
      );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'hospital_applications_capacity_band') THEN
    ALTER TABLE public.hospital_applications
      ADD CONSTRAINT hospital_applications_capacity_band CHECK (
        bed_capacity_band IS NULL OR bed_capacity_band IN ('<25','25-99','100-299','300-799','800+')
      );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'hospital_applications_staff_band') THEN
    ALTER TABLE public.hospital_applications
      ADD CONSTRAINT hospital_applications_staff_band CHECK (
        clinical_staff_band IS NULL OR clinical_staff_band IN ('<10','10-49','50-199','200-499','500+')
      );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'hospital_applications_opd_band') THEN
    ALTER TABLE public.hospital_applications
      ADD CONSTRAINT hospital_applications_opd_band CHECK (
        daily_opd_band IS NULL OR daily_opd_band IN ('<25','25-99','100-299','300-799','800+')
      );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'hospital_applications_connectivity') THEN
    ALTER TABLE public.hospital_applications
      ADD CONSTRAINT hospital_applications_connectivity CHECK (
        internet_connectivity IS NULL OR internet_connectivity IN ('reliable','intermittent','limited')
      );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'hospital_applications_power') THEN
    ALTER TABLE public.hospital_applications
      ADD CONSTRAINT hospital_applications_power CHECK (
        power_backup IS NULL OR power_backup IN ('yes','generator','unreliable')
      );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'hospital_applications_emr') THEN
    ALTER TABLE public.hospital_applications
      ADD CONSTRAINT hospital_applications_emr CHECK (
        existing_emr IS NULL OR existing_emr IN ('none','paper','existing')
      );
  END IF;
END$$;

-- ─── Verification & authority (kickoff §E6) ─────────────────────────────

ALTER TABLE public.hospital_applications
  ADD COLUMN IF NOT EXISTS licensing_body            text,
  ADD COLUMN IF NOT EXISTS facility_licence_path     text,
  ADD COLUMN IF NOT EXISTS applicant_full_name       text,
  ADD COLUMN IF NOT EXISTS applicant_work_email      text,
  ADD COLUMN IF NOT EXISTS applicant_phone           text,
  ADD COLUMN IF NOT EXISTS applicant_council_number  text,
  ADD COLUMN IF NOT EXISTS authority_officer_name    text,
  ADD COLUMN IF NOT EXISTS authority_officer_title   text,
  ADD COLUMN IF NOT EXISTS authority_letter_path     text,
  ADD COLUMN IF NOT EXISTS callback_contact_value    text,
  ADD COLUMN IF NOT EXISTS callback_contact_kind     text,
  ADD COLUMN IF NOT EXISTS email_domain_mismatch     boolean NOT NULL DEFAULT false;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'hospital_applications_licensing_body_check') THEN
    ALTER TABLE public.hospital_applications
      ADD CONSTRAINT hospital_applications_licensing_body_check CHECK (
        licensing_body IS NULL OR licensing_body IN ('moh','umdpc','other')
      );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'hospital_applications_callback_kind_check') THEN
    ALTER TABLE public.hospital_applications
      ADD CONSTRAINT hospital_applications_callback_kind_check CHECK (
        callback_contact_kind IS NULL OR callback_contact_kind IN ('phone','email')
      );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'hospital_applications_callback_pair') THEN
    ALTER TABLE public.hospital_applications
      ADD CONSTRAINT hospital_applications_callback_pair CHECK (
        (callback_contact_value IS NULL) = (callback_contact_kind IS NULL)
      );
  END IF;
END$$;

-- ─── Agreement metadata (kickoff §E7) ───────────────────────────────────
-- The accepted-version FK lands in migration 0022 once
-- hospital_dpa_versions exists.

ALTER TABLE public.hospital_applications
  ADD COLUMN IF NOT EXISTS signatory_name             text,
  ADD COLUMN IF NOT EXISTS signatory_title            text,
  ADD COLUMN IF NOT EXISTS authorised_to_bind         boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS agreement_accepted_version uuid,
  ADD COLUMN IF NOT EXISTS agreement_accepted_at      timestamptz;

-- ─── State CHECK extension (no-op — column is enum-typed) ──────────────
-- hospital_applications.state is typed as public.lifecycle_state (the
-- enum), not as plain text. The enum itself is the value constraint —
-- migration 0020 already extended the enum with under_review,
-- agreement_signed, provisioning, offboarded, and agreement_expired,
-- so no additional CHECK is needed (or possible without breaking the
-- enum cast).
--
-- The kickoff's `applied` is a NARRATIVE alias for the canonical
-- `pending_approval` enum value — the lifecycle.ts comments document
-- the equivalence. We do not add `applied` to the enum because:
--   - it would create two values with the same semantics, and
--   - existing rows + every Edge Function already use 'pending_approval'.
--
-- A defensive DROP of any pre-existing legacy CHECK keeps the migration
-- idempotent on environments that may have had a hand-applied check.
ALTER TABLE public.hospital_applications
  DROP CONSTRAINT IF EXISTS hospital_applications_state_check;

-- ─── Junction: application ↔ departments (ref-data-anchored) ────────────

CREATE TABLE IF NOT EXISTS public.hospital_application_departments (
  application_id     uuid NOT NULL REFERENCES public.hospital_applications(id) ON DELETE CASCADE,
  department_family  text NOT NULL,
  is_primary         boolean NOT NULL DEFAULT false,
  PRIMARY KEY (application_id, department_family)
);

CREATE UNIQUE INDEX IF NOT EXISTS hospital_application_primary_dept_unique
  ON public.hospital_application_departments (application_id) WHERE is_primary;

DROP TRIGGER IF EXISTS audit_hospital_application_departments ON public.hospital_application_departments;
CREATE TRIGGER audit_hospital_application_departments
  AFTER INSERT OR UPDATE OR DELETE ON public.hospital_application_departments
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_changes();

ALTER TABLE public.hospital_application_departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hospital_application_departments FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS hospital_app_depts_select_scoped ON public.hospital_application_departments;
CREATE POLICY hospital_app_depts_select_scoped
  ON public.hospital_application_departments
  FOR SELECT TO authenticated
  USING (
    public.user_has_role('superadmin')
    OR EXISTS (
      SELECT 1 FROM public.hospital_applications a
      WHERE a.id = application_id AND a.applicant_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS hospital_app_depts_insert_applicant ON public.hospital_application_departments;
CREATE POLICY hospital_app_depts_insert_applicant
  ON public.hospital_application_departments
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.hospital_applications a
      WHERE a.id = application_id
        AND a.applicant_user_id = auth.uid()
        AND a.state IN ('pending_approval','applied')
    )
  );

DROP POLICY IF EXISTS hospital_app_depts_delete_applicant ON public.hospital_application_departments;
CREATE POLICY hospital_app_depts_delete_applicant
  ON public.hospital_application_departments
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.hospital_applications a
      WHERE a.id = application_id
        AND a.applicant_user_id = auth.uid()
        AND a.state IN ('pending_approval','applied')
    )
  );

-- ─── Junction: application ↔ specialties ────────────────────────────────

CREATE TABLE IF NOT EXISTS public.hospital_application_specialties (
  application_id uuid NOT NULL REFERENCES public.hospital_applications(id) ON DELETE CASCADE,
  specialty_id   uuid NOT NULL REFERENCES public.specialties(id) ON DELETE RESTRICT,
  PRIMARY KEY (application_id, specialty_id)
);

DROP TRIGGER IF EXISTS audit_hospital_application_specialties ON public.hospital_application_specialties;
CREATE TRIGGER audit_hospital_application_specialties
  AFTER INSERT OR UPDATE OR DELETE ON public.hospital_application_specialties
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_changes();

ALTER TABLE public.hospital_application_specialties ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hospital_application_specialties FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS hospital_app_specs_select_scoped ON public.hospital_application_specialties;
CREATE POLICY hospital_app_specs_select_scoped
  ON public.hospital_application_specialties
  FOR SELECT TO authenticated
  USING (
    public.user_has_role('superadmin')
    OR EXISTS (
      SELECT 1 FROM public.hospital_applications a
      WHERE a.id = application_id AND a.applicant_user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS hospital_app_specs_insert_applicant ON public.hospital_application_specialties;
CREATE POLICY hospital_app_specs_insert_applicant
  ON public.hospital_application_specialties
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.hospital_applications a
      WHERE a.id = application_id
        AND a.applicant_user_id = auth.uid()
        AND a.state IN ('pending_approval','applied')
    )
  );

DROP POLICY IF EXISTS hospital_app_specs_delete_applicant ON public.hospital_application_specialties;
CREATE POLICY hospital_app_specs_delete_applicant
  ON public.hospital_application_specialties
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.hospital_applications a
      WHERE a.id = application_id
        AND a.applicant_user_id = auth.uid()
        AND a.state IN ('pending_approval','applied')
    )
  );
