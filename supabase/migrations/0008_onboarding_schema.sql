-- 0008 — Onboarding schema (Phase 1, GATE A).
--
-- Tables for:
--   - Reference data: ref_data_versions, ref_regions, ref_districts,
--     ref_subcounties, ref_councils, ref_cadres, ref_cadre_grades,
--     ref_specialties, ref_roles
--   - Identity + affiliation: clinician_profiles, staff_affiliations
--   - Multi-step form persistence: signup_drafts
--
-- Also adds:
--   - public.lifecycle_state enum (used by users + staff_affiliations)
--   - public.users.state column (defaults 'unverified' for new rows)
--
-- RLS for these tables lives in 0009. Seed data lives in 0010.

-- ─── Lifecycle state enum ────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE public.lifecycle_state AS ENUM (
    'unverified',
    'verified',
    'pending_approval',
    'approved',
    'active',
    'rejected',
    'suspended',
    'deactivated'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Add state to users. Existing Phase 0 rows default to 'verified' (the
-- realistic state for any seeded/test user); new rows default to 'unverified'.
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS state public.lifecycle_state NOT NULL DEFAULT 'unverified';

UPDATE public.users SET state = 'verified' WHERE state = 'unverified';
-- After backfill, switch default for NEW rows to 'unverified' (the
-- normal signup path: account created → verify OTP → state advances).
ALTER TABLE public.users ALTER COLUMN state SET DEFAULT 'unverified';

-- ─── Reference data versions (traceability for every seed) ──────────────
CREATE TABLE IF NOT EXISTS public.ref_data_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dataset text NOT NULL,
  source text NOT NULL,
  source_url text,
  version_date text NOT NULL,
  row_count integer,
  notes text,
  applied_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ref_data_versions_dataset_idx ON public.ref_data_versions(dataset);
CREATE UNIQUE INDEX IF NOT EXISTS ref_data_versions_unique
  ON public.ref_data_versions(dataset, version_date);

-- ─── Geography (regions → districts → subcounties) ──────────────────────
CREATE TABLE IF NOT EXISTS public.ref_regions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ref_regions_code_unique ON public.ref_regions(code);

CREATE TABLE IF NOT EXISTS public.ref_districts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  region_id uuid NOT NULL REFERENCES public.ref_regions(id) ON DELETE RESTRICT,
  code text NOT NULL,
  name text NOT NULL,
  is_city boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ref_districts_code_unique ON public.ref_districts(code);
CREATE INDEX IF NOT EXISTS ref_districts_region_idx ON public.ref_districts(region_id);
CREATE INDEX IF NOT EXISTS ref_districts_name_idx ON public.ref_districts(name);

CREATE TABLE IF NOT EXISTS public.ref_subcounties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  district_id uuid NOT NULL REFERENCES public.ref_districts(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ref_subcounties_district_code_unique
  ON public.ref_subcounties(district_id, code);
CREATE INDEX IF NOT EXISTS ref_subcounties_district_idx
  ON public.ref_subcounties(district_id);

-- ─── Clinical catalog (councils → cadres → grades + specialties + roles) ─
CREATE TABLE IF NOT EXISTS public.ref_councils (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,
  name text NOT NULL,
  short_name text NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ref_councils_code_unique ON public.ref_councils(code);

CREATE TABLE IF NOT EXISTS public.ref_cadres (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  council_id uuid NOT NULL REFERENCES public.ref_councils(id) ON DELETE RESTRICT,
  code text NOT NULL,
  name text NOT NULL,
  description text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ref_cadres_code_unique ON public.ref_cadres(code);
CREATE INDEX IF NOT EXISTS ref_cadres_council_idx ON public.ref_cadres(council_id);

CREATE TABLE IF NOT EXISTS public.ref_cadre_grades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cadre_id uuid NOT NULL REFERENCES public.ref_cadres(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ref_cadre_grades_cadre_code_unique
  ON public.ref_cadre_grades(cadre_id, code);
CREATE INDEX IF NOT EXISTS ref_cadre_grades_cadre_idx ON public.ref_cadre_grades(cadre_id);

CREATE TABLE IF NOT EXISTS public.ref_specialties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,
  name text NOT NULL,
  parent_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ref_specialties_code_unique ON public.ref_specialties(code);
CREATE INDEX IF NOT EXISTS ref_specialties_parent_idx ON public.ref_specialties(parent_id);

CREATE TABLE IF NOT EXISTS public.ref_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cadre_id uuid NOT NULL REFERENCES public.ref_cadres(id) ON DELETE RESTRICT,
  specialty_id uuid REFERENCES public.ref_specialties(id) ON DELETE SET NULL,
  code text NOT NULL,
  name text NOT NULL,
  department_family text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ref_roles_code_unique ON public.ref_roles(code);
CREATE INDEX IF NOT EXISTS ref_roles_cadre_idx ON public.ref_roles(cadre_id);
CREATE INDEX IF NOT EXISTS ref_roles_specialty_idx ON public.ref_roles(specialty_id);
CREATE INDEX IF NOT EXISTS ref_roles_dept_family_idx ON public.ref_roles(department_family);

-- ─── Clinician identity + affiliations ──────────────────────────────────
CREATE TABLE IF NOT EXISTS public.clinician_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  council_id uuid NOT NULL REFERENCES public.ref_councils(id) ON DELETE RESTRICT,
  registration_number text NOT NULL,
  licence_document_path text,
  registration_expiry timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS clinician_profiles_council_reg_unique
  ON public.clinician_profiles(council_id, registration_number);
CREATE INDEX IF NOT EXISTS clinician_profiles_user_idx ON public.clinician_profiles(user_id);

CREATE TABLE IF NOT EXISTS public.staff_affiliations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  department_id uuid NOT NULL REFERENCES public.hospital_departments(id) ON DELETE RESTRICT,
  cadre_id uuid NOT NULL REFERENCES public.ref_cadres(id) ON DELETE RESTRICT,
  cadre_grade_id uuid REFERENCES public.ref_cadre_grades(id) ON DELETE SET NULL,
  role_id uuid NOT NULL REFERENCES public.ref_roles(id) ON DELETE RESTRICT,
  specialty_id uuid REFERENCES public.ref_specialties(id) ON DELETE SET NULL,
  employment_type text NOT NULL,
  state public.lifecycle_state NOT NULL DEFAULT 'pending_approval',
  rejection_reason text,
  approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT staff_affiliations_employment_check
    CHECK (employment_type IN ('full_time', 'visiting', 'locum'))
);
CREATE UNIQUE INDEX IF NOT EXISTS staff_affiliations_unique
  ON public.staff_affiliations(user_id, hospital_id, department_id, role_id);
CREATE INDEX IF NOT EXISTS staff_affiliations_user_idx ON public.staff_affiliations(user_id);
CREATE INDEX IF NOT EXISTS staff_affiliations_hospital_state_idx
  ON public.staff_affiliations(hospital_id, state);

-- ─── Signup drafts (multi-step form persistence) ────────────────────────
CREATE TABLE IF NOT EXISTS public.signup_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  draft_kind text NOT NULL,
  owner_key text NOT NULL,
  access_token text,
  payload jsonb NOT NULL,
  current_step text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '14 days'),
  CONSTRAINT signup_drafts_kind_check
    CHECK (draft_kind IN ('patient', 'clinical', 'hospital'))
);
CREATE UNIQUE INDEX IF NOT EXISTS signup_drafts_owner_kind_unique
  ON public.signup_drafts(draft_kind, owner_key);
CREATE INDEX IF NOT EXISTS signup_drafts_expires_idx ON public.signup_drafts(expires_at);

-- ─── updated_at triggers (the 0001 trigger function is reusable) ────────
CREATE TRIGGER clinician_profiles_set_updated_at
  BEFORE UPDATE ON public.clinician_profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER staff_affiliations_set_updated_at
  BEFORE UPDATE ON public.staff_affiliations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER signup_drafts_set_updated_at
  BEFORE UPDATE ON public.signup_drafts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
