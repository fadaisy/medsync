-- 0152 — Lab Phase 4: results back on the original order. The report gains its referral and provenance; each
-- value's snapshot gains where its range came from and what was printed; scans of the paper report and the
-- second-person checks are kept; a private bucket holds the scans
-- (docs/lab/phase-4/gate-a-proposal.md §3.3; RB-1..RB-10; P2, P3; A2, A3, A9, A19).
--
-- A result's source is not a new column: it is performer × entry_mode, which the report already has (P2):
-- in_house+direct typed here · in_house+interface from an analyser · external+transcribed referred on paper ·
-- external+interface referred electronically. ADDITIVE and re-runnable. GATED: owner-applied
-- (`npm run db:migrate -- 0152`).
-- Reverse: DROP the two tables and the four columns; DELETE the bucket row once it holds no object.

-- ─── The report: its referral and provenance (RB-8) ──────────────────────
ALTER TABLE public.diagnostic_reports
  ADD COLUMN IF NOT EXISTS referral_id uuid REFERENCES public.lab_referrals(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS provenance jsonb;
ALTER TABLE public.diagnostic_reports DROP CONSTRAINT IF EXISTS dr_referral_external;
ALTER TABLE public.diagnostic_reports ADD CONSTRAINT dr_referral_external
  CHECK (referral_id IS NULL OR (performer = 'external' AND provenance IS NOT NULL AND order_id IS NOT NULL));
CREATE INDEX IF NOT EXISTS diagnostic_reports_referral ON public.diagnostic_reports (referral_id)
  WHERE referral_id IS NOT NULL;

-- ─── Each value: whose range, and what was printed or sent (RB-3, RB-4; AB-10 later) ─
ALTER TABLE public.lab_result_snapshots
  ADD COLUMN IF NOT EXISTS range_source text NOT NULL DEFAULT 'hospital',
  ADD COLUMN IF NOT EXISTS printed jsonb,      -- {value, unit, range, flagText, converted} as printed or sent
  ADD COLUMN IF NOT EXISTS interfaced jsonb;   -- {value, unit, flags, ranges, editReason} (Step 10)
-- A referred value's range is the performing lab's (D-LAB4-09): its own range state. The snapshot holds the value
-- in this hospital's unit (so Phase 1's critical check reads it unchanged); what was printed is in `printed`.
ALTER TABLE public.lab_result_snapshots DROP CONSTRAINT IF EXISTS lab_result_snapshots_range_state_check;
ALTER TABLE public.lab_result_snapshots ADD CONSTRAINT lab_result_snapshots_range_state_check CHECK (range_state IN
  ('signed','unsigned','no_band_for_age','sex_or_age_missing','no_signed_range','performing_lab'));
ALTER TABLE public.lab_result_snapshots DROP CONSTRAINT IF EXISTS lrs_range_source;
ALTER TABLE public.lab_result_snapshots ADD CONSTRAINT lrs_range_source
  CHECK (range_source IN ('hospital','performing_lab') AND (range_source = 'hospital' OR printed IS NOT NULL)
         AND ((range_source = 'performing_lab') = (range_state = 'performing_lab')));

-- ─── Scans of the paper report (RB-6; RB-9 keeps the old ones) ───────────
CREATE TABLE IF NOT EXISTS public.lab_result_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  referral_id uuid NOT NULL REFERENCES public.lab_referrals(id) ON DELETE RESTRICT,
  report_id uuid REFERENCES public.diagnostic_reports(id) ON DELETE RESTRICT,
  path text NOT NULL CHECK (path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.(pdf|jpg|png)$'),
  sha256 text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  bytes integer NOT NULL CHECK (bytes > 0 AND bytes <= 10485760),
  mime text NOT NULL CHECK (mime IN ('application/pdf','image/jpeg','image/png')),
  their_report text CHECK (their_report IS NULL OR char_length(their_report) BETWEEN 1 AND 80),
  uploaded_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT lra_path UNIQUE (path)
);
CREATE INDEX IF NOT EXISTS lab_result_attachments_referral ON public.lab_result_attachments (referral_id);

-- ─── Second-person checks (RB-7, A19) ────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.lab_transcription_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  report_id uuid NOT NULL REFERENCES public.diagnostic_reports(id) ON DELETE RESTRICT,
  kind text NOT NULL CHECK (kind IN ('checked_at_entry','task_opened','checked_later','differs_amended')),
  checker_user_id uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  scan_confirmed boolean NOT NULL DEFAULT false,  -- "The scan shows report {number}" (A19)
  note text CHECK (note IS NULL OR char_length(note) BETWEEN 1 AND 1000),
  at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ltc_checker CHECK (kind = 'task_opened' OR (checker_user_id IS NOT NULL AND scan_confirmed))
);
CREATE INDEX IF NOT EXISTS lab_transcription_checks_report ON public.lab_transcription_checks (report_id, at);

-- ─── The bucket (A9): private, no client policy; the server reads and writes ─
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('lab-report-scans', 'lab-report-scans', false, 10485760,
        ARRAY['application/pdf', 'image/jpeg', 'image/png'])
ON CONFLICT (id) DO NOTHING;

-- ─── Append-only, audit, RLS ─────────────────────────────────────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['lab_result_attachments','lab_transcription_checks'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %1$s_no_mutation ON public.%1$I', t);
    EXECUTE format('CREATE TRIGGER %1$s_no_mutation BEFORE UPDATE OR DELETE ON public.%1$I
      FOR EACH ROW EXECUTE FUNCTION public.block_modify_append_only()', t);
    EXECUTE format('DROP TRIGGER IF EXISTS audit_%1$s ON public.%1$I', t);
    EXECUTE format('CREATE TRIGGER audit_%1$s AFTER INSERT OR UPDATE OR DELETE ON public.%1$I
      FOR EACH ROW EXECUTE FUNCTION public.audit_log_changes()', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.%I FROM anon, authenticated', t);
    EXECUTE format('GRANT SELECT ON public.%I TO medsync_clinical_reader', t);
  END LOOP;
END $$;

-- Scans: the lab, and a clinician who may open the patient (the doctor's "Open the original report").
DROP POLICY IF EXISTS lab_result_attachments_read ON public.lab_result_attachments;
CREATE POLICY lab_result_attachments_read ON public.lab_result_attachments FOR SELECT TO medsync_clinical_reader
  USING (hospital_id = (SELECT private.current_hospital_id())
         AND ((SELECT private.lab_reader())
              OR referral_id IN (SELECT r.id FROM public.lab_referrals r
                                  WHERE r.patient_user_id IN (SELECT private.accessible_patient_ids()))));
-- Checks: the lab only.
DROP POLICY IF EXISTS lab_read ON public.lab_transcription_checks;
CREATE POLICY lab_read ON public.lab_transcription_checks FOR SELECT TO medsync_clinical_reader
  USING (hospital_id = (SELECT private.current_hospital_id()) AND (SELECT private.lab_reader()));
