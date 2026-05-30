-- 0034 — Non-clinical staff identity profile + storage bucket.
--
-- Per docs/reception-registration-gate-a-proposal.md.
--
-- One new table + one new storage bucket. No changes to clinician_profiles
-- (that table stays the clinical track; non-clinical staff write here
-- instead). RECEPTION cadre + RECEPTION_OFFICER role + user_roles 'reception'
-- + non-clinical RLS boundary all shipped in migration 0033.


-- ─── 1. staff_identity_profiles ─────────────────────────────────────
-- Mirror of clinician_profiles for staff who have no professional
-- council registration. The hospital admin's approval IS the
-- verification anchor; NIN is the identity anchor; appointment letter
-- + staff number + authorising officer are optional supporting
-- evidence (encouraged, not required).
CREATE TABLE public.staff_identity_profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Identity anchor (replaces council registration number).
  nin_encrypted text NOT NULL,

  -- Optional supporting evidence. Each strengthens trust; none gate
  -- the form. The verification basis (admin approval) is the floor.
  staff_number text,
  appointment_letter_url text,           -- storage.objects path in staff-identity-documents
  authorising_officer_name text,
  authorising_officer_role text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.staff_identity_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_identity_profiles FORCE ROW LEVEL SECURITY;

-- SELECT: own + superadmin + hospital_admin (scoped — any hospital
-- where the profile owner holds a staff_affiliations row).
CREATE POLICY staff_identity_profiles_select_scoped
  ON public.staff_identity_profiles
  FOR SELECT TO authenticated
  USING (
    id = auth.uid()
    OR public.user_has_role('superadmin')
    OR EXISTS (
      SELECT 1 FROM public.staff_affiliations sa
      WHERE sa.user_id = staff_identity_profiles.id
        AND public.user_has_role('hospital_admin', sa.hospital_id)
    )
  );

-- INSERT: own row only (the signup action runs as the freshly-created
-- auth user). Service-role bypasses this for backfill.
CREATE POLICY staff_identity_profiles_insert_own
  ON public.staff_identity_profiles
  FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid());

-- UPDATE: own row only (lets the user re-upload a fresh appointment letter
-- or correct their staff number). Admins update via service-role.
CREATE POLICY staff_identity_profiles_update_own
  ON public.staff_identity_profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

DROP TRIGGER IF EXISTS staff_identity_profiles_updated_at
  ON public.staff_identity_profiles;
CREATE TRIGGER staff_identity_profiles_updated_at
  BEFORE UPDATE ON public.staff_identity_profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS audit_staff_identity_profiles
  ON public.staff_identity_profiles;
CREATE TRIGGER audit_staff_identity_profiles
  AFTER INSERT OR UPDATE OR DELETE ON public.staff_identity_profiles
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_changes();


-- ─── 2. staff-identity-documents storage bucket ─────────────────────
-- Mirrors clinician-licences (migration 0016) in shape. Path layout:
-- `<userId>/appointment-letter.<ext>` so the existing folder-key RLS
-- pattern works unchanged.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'staff-identity-documents',
  'staff-identity-documents',
  false,
  5242880, -- 5 MB
  ARRAY['application/pdf', 'image/jpeg', 'image/png']
)
ON CONFLICT (id) DO NOTHING;

-- INSERT: owner writes to their own folder.
DROP POLICY IF EXISTS staff_identity_docs_insert_own ON storage.objects;
CREATE POLICY staff_identity_docs_insert_own
  ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'staff-identity-documents'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- SELECT: owner + superadmin + scoped hospital_admin (any hospital
-- where the object owner holds a staff_affiliations row).
DROP POLICY IF EXISTS staff_identity_docs_select_scoped ON storage.objects;
CREATE POLICY staff_identity_docs_select_scoped
  ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'staff-identity-documents'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR public.user_has_role('superadmin')
      OR EXISTS (
        SELECT 1 FROM public.staff_affiliations sa
        WHERE sa.user_id::text = (storage.foldername(name))[1]
          AND public.user_has_role('hospital_admin', sa.hospital_id)
      )
    )
  );

-- UPDATE / DELETE own (re-upload).
DROP POLICY IF EXISTS staff_identity_docs_update_own ON storage.objects;
CREATE POLICY staff_identity_docs_update_own
  ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'staff-identity-documents'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS staff_identity_docs_delete_own ON storage.objects;
CREATE POLICY staff_identity_docs_delete_own
  ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'staff-identity-documents'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
