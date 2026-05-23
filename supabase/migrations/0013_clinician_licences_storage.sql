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
