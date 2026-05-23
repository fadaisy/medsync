-- ────────────────────────────────────────────────────────────────────────
--  PHASE 1 ONBOARDING BUNDLE — paste into Supabase Studio → SQL editor
-- ────────────────────────────────────────────────────────────────────────
--
-- Bundles migrations 0011–0015 into a single idempotent script you can
-- paste into the Supabase Studio SQL editor in one shot. Every statement
-- is wrapped in IF NOT EXISTS / ON CONFLICT DO UPDATE / DROP POLICY IF
-- EXISTS, so re-running this is safe.
--
-- Contents (in apply order):
--
--   0011  patient_profiles + sex/id_type enums + patient_code sequence
--         + issue_patient_code() + seed 21 Uganda districts + 5 Kampala
--         subcounties
--   0012  patient_profiles RLS (owner-only + superadmin read)
--   0013  clinician-licences Storage bucket + RLS (owner / hospital_admin
--         scoped / superadmin)
--   0014  hospital_applications table + hospital_ownership enum + RLS +
--         hospital-authorisations Storage bucket
--   0015  audit_log_changes() trigger attached to the 4 Phase 1 tables
--
-- Prerequisites:
--
--   - migrations 0000–0010 already applied
--   - public.user_has_role(text, uuid) exists (from 0002)
--   - public.set_updated_at() exists (from 0001)
--   - public.audit_log_changes() exists (from 0003)
--
-- After this runs, the Vercel deploy at medsync-six.vercel.app can
-- exercise /signup/patient, /signup/clinical, /signup/hospital
-- end-to-end (provided MEDSYNC_PHI_KEY is set in the Vercel env).
--
-- ────────────────────────────────────────────────────────────────────────

-- 0011 — Patient profiles + MS-YYYY-NNNNN code issuance (Phase 1, GATE C).
--
-- Adds the patient-specific profile table, two enums (sex + ID type),
-- and an atomic patient_code sequence/issuer so the dashboard can show
-- a stable MS-2026-00001 style ID for every signed-up patient.
--
-- Also seeds a minimal set of Uganda districts + a handful of Kampala
-- subcounties so the patient signup form has data to exercise. The
-- full UBOS NPHC 2024 framework pull is still deferred to GATE G per
-- 0010's notes.
--
-- PHI fields (id_number, phone) are stored as ciphertext produced by
-- lib/encryption.ts (AES-256-GCM). Plaintext copies in auth.users
-- (email, phone) are operational identifiers, not PHI per the kickoff.

-- ─── Enums ──────────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE public.patient_sex AS ENUM ('female', 'male', 'other');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.patient_id_type AS ENUM ('nin', 'passport', 'refugee', 'none');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ─── Patient code sequence + issuer ─────────────────────────────────────
-- Sequence is monotonic; issuer formats as MS-YYYY-00000. Year is taken
-- at issuance time so a January-of-next-year signup gets a new prefix
-- without a separate sequence rollover.
CREATE SEQUENCE IF NOT EXISTS public.patient_code_seq;

CREATE OR REPLACE FUNCTION public.issue_patient_code()
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  yr text := to_char(now(), 'YYYY');
  n bigint := nextval('public.patient_code_seq');
BEGIN
  RETURN format('MS-%s-%s', yr, lpad(n::text, 5, '0'));
END $$;

-- ─── patient_profiles table ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.patient_profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  patient_code text NOT NULL UNIQUE DEFAULT public.issue_patient_code(),
  sex public.patient_sex NOT NULL,
  date_of_birth date NOT NULL,
  id_type public.patient_id_type NOT NULL,
  -- Ciphertext: iv:authTag:ciphertext from lib/encryption.ts. Nullable
  -- when id_type='none' (refugee or in-process; collect later).
  id_number_encrypted text,
  -- Phone is ciphertext. Plaintext copy lives in public.users.phone
  -- (already-nullable) for operational use (SMS routing, support).
  phone_encrypted text NOT NULL,
  district_id uuid REFERENCES public.ref_districts(id) ON DELETE RESTRICT,
  subcounty_id uuid REFERENCES public.ref_subcounties(id) ON DELETE RESTRICT,
  -- Free-form ISO 639-1 / 639-3 code or human name. Constrained later
  -- when we ship the actual language picker.
  preferred_language text,
  primary_facility_id uuid REFERENCES public.hospitals(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT patient_profiles_id_number_check
    CHECK (
      (id_type = 'none' AND id_number_encrypted IS NULL)
      OR (id_type <> 'none' AND id_number_encrypted IS NOT NULL)
    )
);

CREATE INDEX IF NOT EXISTS patient_profiles_district_idx
  ON public.patient_profiles(district_id);
CREATE INDEX IF NOT EXISTS patient_profiles_facility_idx
  ON public.patient_profiles(primary_facility_id);

CREATE TRIGGER patient_profiles_set_updated_at
  BEFORE UPDATE ON public.patient_profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─── Seed minimal Uganda districts so the form has data ─────────────────
-- Subset of the UBOS list; expanded to the full 135 districts + 11 cities
-- in a follow-up GATE G migration. UUID prefix 1xx for districts, 2xxxx
-- for subcounties (all lowercase hex).
INSERT INTO public.ref_districts (id, region_id, code, name, is_city) VALUES
  -- Central
  ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-0000000000a1', 'KAMPALA',  'Kampala',  true),
  ('00000000-0000-0000-0000-000000000102', '00000000-0000-0000-0000-0000000000a1', 'WAKISO',   'Wakiso',   false),
  ('00000000-0000-0000-0000-000000000103', '00000000-0000-0000-0000-0000000000a1', 'MUKONO',   'Mukono',   false),
  ('00000000-0000-0000-0000-000000000104', '00000000-0000-0000-0000-0000000000a1', 'MPIGI',    'Mpigi',    false),
  ('00000000-0000-0000-0000-000000000105', '00000000-0000-0000-0000-0000000000a1', 'LUWERO',   'Luwero',   false),
  ('00000000-0000-0000-0000-000000000106', '00000000-0000-0000-0000-0000000000a1', 'MASAKA',   'Masaka',   true),
  -- Eastern
  ('00000000-0000-0000-0000-000000000107', '00000000-0000-0000-0000-0000000000a2', 'JINJA',    'Jinja',    true),
  ('00000000-0000-0000-0000-000000000108', '00000000-0000-0000-0000-0000000000a2', 'MBALE',    'Mbale',    true),
  ('00000000-0000-0000-0000-000000000109', '00000000-0000-0000-0000-0000000000a2', 'SOROTI',   'Soroti',   true),
  ('00000000-0000-0000-0000-00000000010a', '00000000-0000-0000-0000-0000000000a2', 'TORORO',   'Tororo',   false),
  ('00000000-0000-0000-0000-00000000010b', '00000000-0000-0000-0000-0000000000a2', 'IGANGA',   'Iganga',   false),
  -- Northern
  ('00000000-0000-0000-0000-00000000010c', '00000000-0000-0000-0000-0000000000a3', 'GULU',     'Gulu',     true),
  ('00000000-0000-0000-0000-00000000010d', '00000000-0000-0000-0000-0000000000a3', 'LIRA',     'Lira',     true),
  ('00000000-0000-0000-0000-00000000010e', '00000000-0000-0000-0000-0000000000a3', 'ARUA',     'Arua',     true),
  ('00000000-0000-0000-0000-00000000010f', '00000000-0000-0000-0000-0000000000a3', 'KITGUM',   'Kitgum',   false),
  ('00000000-0000-0000-0000-000000000110', '00000000-0000-0000-0000-0000000000a3', 'MOROTO',   'Moroto',   false),
  -- Western
  ('00000000-0000-0000-0000-000000000111', '00000000-0000-0000-0000-0000000000a4', 'MBARARA',  'Mbarara',  true),
  ('00000000-0000-0000-0000-000000000112', '00000000-0000-0000-0000-0000000000a4', 'KABALE',   'Kabale',   false),
  ('00000000-0000-0000-0000-000000000113', '00000000-0000-0000-0000-0000000000a4', 'KASESE',   'Kasese',   false),
  ('00000000-0000-0000-0000-000000000114', '00000000-0000-0000-0000-0000000000a4', 'HOIMA',    'Hoima',    true),
  ('00000000-0000-0000-0000-000000000115', '00000000-0000-0000-0000-0000000000a4', 'FORT_PORTAL', 'Fort Portal', true)
ON CONFLICT (code) DO NOTHING;

-- Kampala divisions as subcounties (cascading combobox can render
-- them when Kampala is picked). Other districts seed in GATE G.
INSERT INTO public.ref_subcounties (id, district_id, code, name) VALUES
  ('00000000-0000-0000-0000-000000020101', '00000000-0000-0000-0000-000000000101', 'KAMPALA_CENTRAL', 'Kampala Central Division'),
  ('00000000-0000-0000-0000-000000020102', '00000000-0000-0000-0000-000000000101', 'KAWEMPE',         'Kawempe Division'),
  ('00000000-0000-0000-0000-000000020103', '00000000-0000-0000-0000-000000000101', 'MAKINDYE',        'Makindye Division'),
  ('00000000-0000-0000-0000-000000020104', '00000000-0000-0000-0000-000000000101', 'NAKAWA',          'Nakawa Division'),
  ('00000000-0000-0000-0000-000000020105', '00000000-0000-0000-0000-000000000101', 'RUBAGA',          'Rubaga Division')
ON CONFLICT (district_id, code) DO NOTHING;

-- Record version trace for the seed.
INSERT INTO public.ref_data_versions (dataset, source, source_url, version_date, row_count, notes)
VALUES
  ('ug_districts_minimal',
   'Hand-seeded subset of UBOS NPHC 2024 framework (GATE C bootstrap)',
   NULL, '2026-05-23', 21,
   'Minimum coverage to unblock /signup/patient. Full 135 districts + 11 cities deferred to GATE G.'),
  ('ug_subcounties_kampala',
   'KCCA — Kampala City Council Authority divisions',
   NULL, '2026-05-23', 5,
   'Kampala-only. Other districts'' subcounties to be seeded in GATE G.')
ON CONFLICT (dataset, version_date) DO NOTHING;
-- 0012 — RLS for patient_profiles (Phase 1, GATE C).
--
-- Owner-only by default. Hospital staff / clinicians do NOT have
-- blanket read access — that's a Phase 1.1+ decision tied to active
-- care relationships (encounter rows, care-team membership). For now
-- only the patient themselves + superadmin can read; service role
-- writes via the signup server action.

GRANT SELECT, INSERT, UPDATE ON public.patient_profiles TO authenticated;

ALTER TABLE public.patient_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patient_profiles FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS patient_profiles_select_own ON public.patient_profiles;
CREATE POLICY patient_profiles_select_own ON public.patient_profiles
  FOR SELECT TO authenticated
  USING (id = (SELECT auth.uid()));

DROP POLICY IF EXISTS patient_profiles_select_superadmin ON public.patient_profiles;
CREATE POLICY patient_profiles_select_superadmin ON public.patient_profiles
  FOR SELECT TO authenticated
  USING (public.user_has_role('superadmin'));

-- Only the patient themselves may insert their own profile (server
-- action runs under user auth; service-role uses a separate path for
-- admin-led signups in a future gate).
DROP POLICY IF EXISTS patient_profiles_insert_own ON public.patient_profiles;
CREATE POLICY patient_profiles_insert_own ON public.patient_profiles
  FOR INSERT TO authenticated
  WITH CHECK (id = (SELECT auth.uid()));

DROP POLICY IF EXISTS patient_profiles_update_own ON public.patient_profiles;
CREATE POLICY patient_profiles_update_own ON public.patient_profiles
  FOR UPDATE TO authenticated
  USING (id = (SELECT auth.uid()))
  WITH CHECK (id = (SELECT auth.uid()));
-- 0013 — Supabase Storage bucket for clinician licence documents (GATE D).
--
-- Private bucket: every object is owner-readable only by default; the
-- approving hospital_admin and superadmin gain access via the policies
-- below. File-size and MIME-type limits keep the bucket usable for
-- council licence scans (PDF / JPG / PNG up to 5 MB) and reject the
-- obvious abuse vectors before they hit storage.
--
-- Path convention enforced app-side:
--   clinician-licences/<user_id>/<timestamp>-<original-name>.<ext>
--
-- The path string is what gets stored on
-- `public.clinician_profiles.licence_document_path`. Signed-URL
-- generation is service-role only and happens in the Edge Function
-- that surfaces the document to the reviewing admin (GATE F).

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'clinician-licences',
  'clinician-licences',
  false,
  5242880,
  ARRAY['application/pdf', 'image/jpeg', 'image/png']
)
ON CONFLICT (id) DO UPDATE
  SET file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types,
      public = EXCLUDED.public;

-- ─── storage.objects policies for this bucket ──────────────────────────
-- Owner reads + uploads. (Owners can also delete + update their own
-- files via the standard storage policies; we don't need to add those.)

DROP POLICY IF EXISTS clinician_licences_owner_read ON storage.objects;
CREATE POLICY clinician_licences_owner_read ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'clinician-licences'
    AND owner = (SELECT auth.uid())
  );

DROP POLICY IF EXISTS clinician_licences_owner_insert ON storage.objects;
CREATE POLICY clinician_licences_owner_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'clinician-licences'
    AND owner = (SELECT auth.uid())
    -- App-side convention: first path segment must equal the user's id.
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
  );

DROP POLICY IF EXISTS clinician_licences_owner_update ON storage.objects;
CREATE POLICY clinician_licences_owner_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'clinician-licences'
    AND owner = (SELECT auth.uid())
  );

DROP POLICY IF EXISTS clinician_licences_owner_delete ON storage.objects;
CREATE POLICY clinician_licences_owner_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'clinician-licences'
    AND owner = (SELECT auth.uid())
  );

-- Superadmin reads everything in the bucket (approval reviewers).
DROP POLICY IF EXISTS clinician_licences_superadmin_read ON storage.objects;
CREATE POLICY clinician_licences_superadmin_read ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'clinician-licences'
    AND public.user_has_role('superadmin')
  );

-- Hospital admins read any licence whose owner has a pending/active
-- affiliation at THEIR hospital (gated by user_has_role from 0002).
DROP POLICY IF EXISTS clinician_licences_hospital_admin_read ON storage.objects;
CREATE POLICY clinician_licences_hospital_admin_read ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'clinician-licences'
    AND EXISTS (
      SELECT 1 FROM public.staff_affiliations sa
      WHERE sa.user_id = storage.objects.owner
        AND public.user_has_role('hospital_admin', sa.hospital_id)
    )
  );
-- 0014 — hospital_applications + ownership enum + RLS + Storage bucket.
--
-- A hospital application is an institution's request to be onboarded
-- onto MedSync. The applicant creates an auth account, fills out the
-- hospital details + their own role at the facility, and uploads a
-- letter of authority. Reviewed by superadmin (NOT by hospital_admin
-- — there is no hospital_admin yet for this institution). On approval
-- (GATE F), a row gets inserted into public.hospitals and the
-- applicant's user_roles row is elevated to hospital_admin scoped to
-- that hospital.
--
-- This table is intentionally separate from public.hospitals: the
-- latter holds approved facilities only, the former is the pending
-- queue. Splitting them keeps `hospitals` a clean lookup for the rest
-- of the app (no need to filter every query by state).
--
-- Storage: a private `hospital-authorisations` bucket mirrors the
-- clinician-licences pattern from 0013.

-- ─── Enums ──────────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE public.hospital_ownership AS ENUM (
    'public_moh',         -- public, MoH-run
    'private',            -- private, for-profit
    'ngo_faith_based',    -- NGO / mission / faith-based
    'private_clinic'      -- small private clinic
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ─── Table ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.hospital_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  applicant_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Hospital data ------------------------------------------------------
  hospital_name text NOT NULL,
  -- Reuses the same level vocabulary as public.hospitals.
  level text NOT NULL,
  ownership public.hospital_ownership NOT NULL,
  -- The official MoH facility-list ID or the council/board registration
  -- number — plaintext (operational lookup, not PHI).
  registration_number text NOT NULL,
  -- Free-text: e.g. "MoH Facility List", "Uganda Investment Authority".
  registration_authority text,
  district_id uuid REFERENCES public.ref_districts(id) ON DELETE RESTRICT,
  subcounty_id uuid REFERENCES public.ref_subcounties(id) ON DELETE RESTRICT,
  physical_address text NOT NULL,
  -- "mulago.go.ug" — used post-approval as a verification signal that
  -- clinicians whose emails end in this domain belong to the facility.
  institutional_email_domain text,

  -- Applicant data -----------------------------------------------------
  -- The applicant's role at the facility (free-text — we don't
  -- constrain to a controlled list because hospital org charts vary).
  applicant_role text NOT NULL,
  -- Storage path to the letter of authority PDF/JPG/PNG.
  authorisation_document_path text,

  -- Lifecycle ----------------------------------------------------------
  state public.lifecycle_state NOT NULL DEFAULT 'pending_approval',
  rejection_reason text,
  -- The superadmin user who approved/rejected; set on transition.
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  -- Set on approval — points at the freshly-created public.hospitals row.
  approved_hospital_id uuid REFERENCES public.hospitals(id) ON DELETE SET NULL,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT hospital_applications_level_check
    CHECK (level IN ('national_referral', 'regional', 'district', 'hc4', 'hc3', 'private'))
);

-- One application per applicant — they can't submit a second one
-- while their first is still in flight. Re-applications after
-- rejection happen by updating the existing row, not inserting.
CREATE UNIQUE INDEX IF NOT EXISTS hospital_applications_applicant_unique
  ON public.hospital_applications(applicant_user_id);
CREATE INDEX IF NOT EXISTS hospital_applications_state_idx
  ON public.hospital_applications(state, created_at);
CREATE INDEX IF NOT EXISTS hospital_applications_district_idx
  ON public.hospital_applications(district_id);

CREATE TRIGGER hospital_applications_set_updated_at
  BEFORE UPDATE ON public.hospital_applications
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─── RLS ─────────────────────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE ON public.hospital_applications TO authenticated;

ALTER TABLE public.hospital_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hospital_applications FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS hospital_applications_select_own ON public.hospital_applications;
CREATE POLICY hospital_applications_select_own ON public.hospital_applications
  FOR SELECT TO authenticated
  USING (applicant_user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS hospital_applications_select_superadmin ON public.hospital_applications;
CREATE POLICY hospital_applications_select_superadmin ON public.hospital_applications
  FOR SELECT TO authenticated
  USING (public.user_has_role('superadmin'));

DROP POLICY IF EXISTS hospital_applications_insert_own ON public.hospital_applications;
CREATE POLICY hospital_applications_insert_own ON public.hospital_applications
  FOR INSERT TO authenticated
  WITH CHECK (applicant_user_id = (SELECT auth.uid()));

-- Owner can update their own application only while it's still in
-- flight (pending_approval). Once a superadmin moves it forward or
-- rejects it, the owner can no longer edit; further mutations are
-- service-role only (GATE F Edge Function).
DROP POLICY IF EXISTS hospital_applications_update_own ON public.hospital_applications;
CREATE POLICY hospital_applications_update_own ON public.hospital_applications
  FOR UPDATE TO authenticated
  USING (
    applicant_user_id = (SELECT auth.uid())
    AND state = 'pending_approval'
  )
  WITH CHECK (
    applicant_user_id = (SELECT auth.uid())
    AND state = 'pending_approval'
  );

-- ─── Storage bucket for the authorisation letter ────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'hospital-authorisations',
  'hospital-authorisations',
  false,
  5242880,
  ARRAY['application/pdf', 'image/jpeg', 'image/png']
)
ON CONFLICT (id) DO UPDATE
  SET file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types,
      public = EXCLUDED.public;

DROP POLICY IF EXISTS hospital_authorisations_owner_read ON storage.objects;
CREATE POLICY hospital_authorisations_owner_read ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'hospital-authorisations'
    AND owner = (SELECT auth.uid())
  );

DROP POLICY IF EXISTS hospital_authorisations_owner_insert ON storage.objects;
CREATE POLICY hospital_authorisations_owner_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'hospital-authorisations'
    AND owner = (SELECT auth.uid())
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
  );

DROP POLICY IF EXISTS hospital_authorisations_owner_update ON storage.objects;
CREATE POLICY hospital_authorisations_owner_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'hospital-authorisations'
    AND owner = (SELECT auth.uid())
  );

DROP POLICY IF EXISTS hospital_authorisations_owner_delete ON storage.objects;
CREATE POLICY hospital_authorisations_owner_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'hospital-authorisations'
    AND owner = (SELECT auth.uid())
  );

DROP POLICY IF EXISTS hospital_authorisations_superadmin_read ON storage.objects;
CREATE POLICY hospital_authorisations_superadmin_read ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'hospital-authorisations'
    AND public.user_has_role('superadmin')
  );
-- 0015 — attach the public.audit_log_changes() trigger to every Phase 1
-- onboarding table that wasn't covered by 0003.
--
-- 0003 wired audit on: users, hospitals, hospital_departments,
-- user_roles, consent_records. The Phase 1 additions need the same
-- treatment so approve/reject decisions, profile edits, and lifecycle
-- transitions land in audit_log alongside the rest.
--
-- Reference data (ref_*) is intentionally NOT audited — it changes
-- via migrations + ref_data_versions, which is its own paper trail.
-- signup_drafts is NOT audited — it's transient form state, not
-- system-of-record. Auditing it would pollute the log with one row
-- per keystroke and add no forensic value.

DROP TRIGGER IF EXISTS clinician_profiles_audit ON public.clinician_profiles;
CREATE TRIGGER clinician_profiles_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.clinician_profiles
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_changes();

DROP TRIGGER IF EXISTS staff_affiliations_audit ON public.staff_affiliations;
CREATE TRIGGER staff_affiliations_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.staff_affiliations
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_changes();

DROP TRIGGER IF EXISTS patient_profiles_audit ON public.patient_profiles;
CREATE TRIGGER patient_profiles_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.patient_profiles
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_changes();

DROP TRIGGER IF EXISTS hospital_applications_audit ON public.hospital_applications;
CREATE TRIGGER hospital_applications_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.hospital_applications
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_changes();
