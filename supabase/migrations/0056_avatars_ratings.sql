-- 0056 — Photographs and visit ratings (ADR 0085).
--
-- ⚠️ GATED — DO NOT APPLY TO PRODUCTION WITHOUT EXPLICIT, NAMED OWNER
-- AUTHORIZATION. Apply via `npm run db:migrate`.
--
-- Additive: one column, one bucket with policies, one table, one view, one
-- audit verb. Nothing existing changes shape.
--
-- ─── 1. users.avatar_path ─────────────────────────────────────────────
-- The storage key of the person's photograph in the `avatars` bucket, or
-- null. One column for staff and patients alike — `users` is the one table
-- both have a row in. `users_update_own` (0002) already lets a person write
-- their own row, so the phone can set this after it uploads.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS avatar_path text;

-- ─── 2. avatars bucket ────────────────────────────────────────────────
-- PRIVATE (no public URLs — reads are signed, ADR 0085 §1). Key shape
-- `<userId>/<uuid>.<ext>` like every other bucket (0016).

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'avatars',
  'avatars',
  false,
  2097152, -- 2 MB; the clients downscale to 512px before upload
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- Owner writes their own folder.
DROP POLICY IF EXISTS avatars_insert_own ON storage.objects;
CREATE POLICY avatars_insert_own
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS avatars_update_own ON storage.objects;
CREATE POLICY avatars_update_own
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS avatars_delete_own ON storage.objects;
CREATE POLICY avatars_delete_own
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Every signed-in person may read: a clinician's face is shown to the
-- patients who may book them, a patient's to the staff who see their record.
-- Names already are. The bucket stays private so a URL is never enough.
DROP POLICY IF EXISTS avatars_select_authenticated ON storage.objects;
CREATE POLICY avatars_select_authenticated
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (bucket_id = 'avatars');

-- ─── 3. visit_ratings ─────────────────────────────────────────────────
-- One rating per attended appointment, written only by `pt-rate-visit`,
-- which checks the caller is the patient and the visit happened. Re-rating
-- replaces (the UNIQUE on appointment_id is what makes the upsert honest).

CREATE TABLE IF NOT EXISTS public.visit_ratings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id uuid NOT NULL UNIQUE REFERENCES public.appointments(id) ON DELETE CASCADE,
  patient_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  clinician_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  stars smallint NOT NULL,
  comment text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT visit_ratings_stars_range CHECK (stars BETWEEN 1 AND 5),
  CONSTRAINT visit_ratings_comment_length CHECK (comment IS NULL OR char_length(comment) <= 500)
);
CREATE INDEX IF NOT EXISTS visit_ratings_clinician_idx
  ON public.visit_ratings (clinician_user_id);

ALTER TABLE public.visit_ratings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.visit_ratings FORCE ROW LEVEL SECURITY;

-- SELECT: the patient sees their own; the clinician sees ratings of them
-- (without the comment being hidden — a rating is feedback, not PHI);
-- hospital_admin and superadmin as usual. No INSERT/UPDATE/DELETE for
-- authenticated — the Edge Function owns the write.
DROP POLICY IF EXISTS visit_ratings_select_scoped ON public.visit_ratings;
CREATE POLICY visit_ratings_select_scoped
  ON public.visit_ratings
  FOR SELECT
  TO authenticated
  USING (
    patient_user_id = auth.uid()
    OR clinician_user_id = auth.uid()
    OR public.user_has_role('superadmin')
    OR public.user_has_role('hospital_admin', hospital_id)
  );

-- ─── 4. clinician_rating_summary ──────────────────────────────────────
-- Average and count per clinician — what "★ 4.8 · 12 reviews" reads from.
-- `security_invoker` so RLS on the table still governs who can see what
-- through it; `pt-bookable-clinicians` reads it with the service role.

CREATE OR REPLACE VIEW public.clinician_rating_summary
  WITH (security_invoker = true) AS
  SELECT
    clinician_user_id,
    round(avg(stars)::numeric, 1) AS average,
    count(*)::integer AS count
  FROM public.visit_ratings
  GROUP BY clinician_user_id;

-- ─── 5. sa_audit_log accepts 'rate_visit' ─────────────────────────────
-- DROP-then-ADD is the house pattern; the list is migration 0054's
-- verbatim, plus one line.

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
      'rate_visit'
    )
  );
