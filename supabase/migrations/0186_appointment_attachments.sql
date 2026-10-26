-- 0186 — Photos, videos and voice notes a patient sends with "Ask for a day" (Tide v1, ADR 0345).
--
-- 1. storage bucket 'appointment-attachments' (private): `<uploader id>/<appointment id>/<uuid>.<ext>`,
--    like every other bucket (0016). Images, short videos and voice notes only, 50 MB at most.
-- 2. public.appointment_attachments: one row per file, pointing at its object. Append-only, like the record
--    it travels with: no update or delete policy. A row is readable by whoever can read its appointment
--    (the patient, the agent who booked, the clinician, hospital admin and nurses, superadmin), because the
--    check runs public.appointments' own RLS. Only the patient or the agent who made the booking may add one.
-- 3. storage.objects: the uploader writes into their own folder; an object is readable wherever its
--    attachment row is.
--
-- Descriptive, like the booking's symptoms (ADR 0095): nothing orders, routes or scores a booking by it.
-- ADDITIVE and re-runnable. Owner-applied (`npm run db:migrate -- 0186`).
-- Reverse: DROP TABLE public.appointment_attachments; DROP POLICY appointment_attachments_* ON storage.objects;
-- DELETE FROM storage.buckets WHERE id = 'appointment-attachments' (after emptying it).

-- ─── 1. The bucket ───────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'appointment-attachments',
  'appointment-attachments',
  false,
  52428800, -- 50 MB: a one-minute phone video
  ARRAY[
    'image/jpeg', 'image/png', 'image/heic', 'image/heif', 'image/webp',
    'video/mp4', 'video/quicktime',
    'audio/mp4', 'audio/m4a', 'audio/x-m4a', 'audio/aac', 'audio/mpeg', 'audio/webm'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- ─── 2. The rows ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.appointment_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id uuid NOT NULL REFERENCES public.appointments(id) ON DELETE CASCADE,
  uploaded_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  kind text NOT NULL CHECK (kind IN ('photo', 'video', 'voice')),
  storage_path text NOT NULL UNIQUE CHECK (char_length(storage_path) <= 300),
  mime text NOT NULL CHECK (char_length(mime) <= 100),
  bytes bigint CHECK (bytes IS NULL OR bytes BETWEEN 0 AND 52428800),
  duration_ms integer CHECK (duration_ms IS NULL OR duration_ms >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  -- The object sits in the uploader's own folder, under this appointment.
  CONSTRAINT appointment_attachments_path_shape CHECK (
    storage_path LIKE uploaded_by::text || '/' || appointment_id::text || '/%'
  )
);
CREATE INDEX IF NOT EXISTS appointment_attachments_appointment_idx
  ON public.appointment_attachments (appointment_id, created_at);

ALTER TABLE public.appointment_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointment_attachments FORCE ROW LEVEL SECURITY;

-- Whoever can read the appointment (its own RLS decides) reads what came with it.
DROP POLICY IF EXISTS appointment_attachments_select ON public.appointment_attachments;
CREATE POLICY appointment_attachments_select ON public.appointment_attachments
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.appointments a WHERE a.id = appointment_id));

DROP POLICY IF EXISTS appointment_attachments_insert_own ON public.appointment_attachments;
CREATE POLICY appointment_attachments_insert_own ON public.appointment_attachments
  FOR INSERT TO authenticated
  WITH CHECK (
    uploaded_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.appointments a
      WHERE a.id = appointment_id
        AND (a.patient_user_id = auth.uid() OR a.created_by_user_id = auth.uid())
    )
  );

-- ─── 3. The objects ──────────────────────────────────────────────────────
DROP POLICY IF EXISTS appointment_attachments_insert_own ON storage.objects;
CREATE POLICY appointment_attachments_insert_own ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'appointment-attachments'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS appointment_attachments_select ON storage.objects;
CREATE POLICY appointment_attachments_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'appointment-attachments'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR EXISTS (SELECT 1 FROM public.appointment_attachments x WHERE x.storage_path = name)
    )
  );
