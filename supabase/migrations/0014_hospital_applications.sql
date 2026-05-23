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
