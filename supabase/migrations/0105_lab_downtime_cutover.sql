-- 0105 — Downtime and the cut-over to one result path (Lab Phase 1, ADRs 0248–0249; gate-a-proposal §5).
--
--   1. downtime_periods: a record of when the system was down, entered afterwards (DT-1: a record, not a mode).
--   2. downtime_form_numbers: numbers reserved on the server before printing, one per sheet; each is
--      unused, entered or voided, and a number is entered once (DT-2).
--   3. downtime_entries: the paper form's true times on a back-entered report (DT-3, Law 9).
--   4. downtime_drills and lab_briefings: records only; no patient record (DT-8).
--   5. lab_cutover: the audited switch of a hospital to one result path, with a second approver (CO-2).
--
-- ADDITIVE and re-runnable. GATED: owner-applied (`npm run db:migrate -- 0105`).

CREATE TABLE IF NOT EXISTS public.downtime_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  reason text NOT NULL CHECK (reason IN ('network','power','system','other')),
  note text CHECK (note IS NULL OR char_length(note) <= 500),
  recorded_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dp_order CHECK (starts_at < ends_at)
);
CREATE INDEX IF NOT EXISTS dp_hospital ON public.downtime_periods (hospital_id, starts_at DESC);

CREATE TABLE IF NOT EXISTS public.downtime_form_numbers (
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  number integer NOT NULL CHECK (number > 0),
  state text NOT NULL DEFAULT 'unused' CHECK (state IN ('unused','entered','voided')),
  reserved_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  reserved_at timestamptz NOT NULL DEFAULT now(),
  report_id uuid REFERENCES public.diagnostic_reports(id) ON DELETE RESTRICT,
  voided_reason text CHECK (voided_reason IS NULL OR char_length(voided_reason) BETWEEN 3 AND 200),
  PRIMARY KEY (hospital_id, number),
  CONSTRAINT dfn_entered CHECK ((state = 'entered') = (report_id IS NOT NULL)),
  CONSTRAINT dfn_voided CHECK ((state = 'voided') = (voided_reason IS NOT NULL))
);

-- A number moves only from unused, once.
CREATE OR REPLACE FUNCTION private.downtime_number_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'downtime_form_numbers: numbers are never deleted; void one'; END IF;
  IF OLD.state <> 'unused' THEN
    RAISE EXCEPTION 'downtime_form_numbers: form % is already %', OLD.number, OLD.state;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS downtime_form_numbers_guard ON public.downtime_form_numbers;
CREATE TRIGGER downtime_form_numbers_guard BEFORE UPDATE OR DELETE ON public.downtime_form_numbers
  FOR EACH ROW EXECUTE FUNCTION private.downtime_number_guard();

CREATE TABLE IF NOT EXISTS public.downtime_entries (
  report_id uuid PRIMARY KEY REFERENCES public.diagnostic_reports(id) ON DELETE RESTRICT,
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  patient_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  form_number integer NOT NULL,
  collected_at timestamptz NOT NULL,
  resulted_at timestamptz NOT NULL,
  entered_at timestamptz NOT NULL DEFAULT now(),
  released_on_paper_by text NOT NULL CHECK (char_length(released_on_paper_by) BETWEEN 2 AND 120),
  outside_period_reason text CHECK (outside_period_reason IS NULL OR char_length(outside_period_reason) BETWEEN 3 AND 200),
  entered_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  CONSTRAINT de_times CHECK (collected_at <= resulted_at AND resulted_at <= entered_at),
  CONSTRAINT de_form FOREIGN KEY (hospital_id, form_number) REFERENCES public.downtime_form_numbers (hospital_id, number)
);
CREATE UNIQUE INDEX IF NOT EXISTS de_form_once ON public.downtime_entries (hospital_id, form_number);
DROP TRIGGER IF EXISTS downtime_entries_no_mutation ON public.downtime_entries;
CREATE TRIGGER downtime_entries_no_mutation BEFORE UPDATE OR DELETE ON public.downtime_entries
  FOR EACH ROW EXECUTE FUNCTION public.block_modify_append_only();

CREATE TABLE IF NOT EXISTS public.downtime_drills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  held_on date NOT NULL,
  participants text NOT NULL CHECK (char_length(participants) BETWEEN 2 AND 500),
  what_was_done text NOT NULL CHECK (char_length(what_was_done) BETWEEN 3 AND 1000),
  problems text CHECK (problems IS NULL OR char_length(problems) <= 1000),
  recorded_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.lab_briefings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  held_on date NOT NULL,
  audience text NOT NULL CHECK (char_length(audience) BETWEEN 2 AND 300),
  notes text CHECK (notes IS NULL OR char_length(notes) <= 1000),
  recorded_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.lab_cutover (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  conditions jsonb NOT NULL,
  requested_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  requested_at timestamptz NOT NULL DEFAULT now(),
  approved_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  switched_at timestamptz,
  reversed_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  reversal_approved_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  reversed_at timestamptz,
  reversal_reason text CHECK (reversal_reason IS NULL OR char_length(reversal_reason) BETWEEN 10 AND 500),
  CONSTRAINT lc_second_approver CHECK (approved_by IS NULL OR approved_by <> requested_by),
  CONSTRAINT lc_switched CHECK ((switched_at IS NOT NULL) = (approved_by IS NOT NULL)),
  CONSTRAINT lc_reversal CHECK (reversed_at IS NULL OR (reversed_by IS NOT NULL AND reversal_approved_by IS NOT NULL
    AND reversal_approved_by <> reversed_by AND reversal_reason IS NOT NULL))
);
-- One live switch per hospital (requested or switched, not reversed).
CREATE UNIQUE INDEX IF NOT EXISTS lc_one_live ON public.lab_cutover (hospital_id) WHERE reversed_at IS NULL;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['downtime_periods','downtime_form_numbers','downtime_entries','downtime_drills',
    'lab_briefings','lab_cutover'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS audit_%1$s ON public.%1$I', t);
    EXECUTE format('CREATE TRIGGER audit_%1$s AFTER INSERT OR UPDATE OR DELETE ON public.%1$I
      FOR EACH ROW EXECUTE FUNCTION public.audit_log_changes()', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.%I FROM anon, authenticated', t);
    EXECUTE format('GRANT SELECT ON public.%I TO medsync_clinical_reader', t);
    EXECUTE format('DROP POLICY IF EXISTS %1$s_select ON public.%1$I', t);
  END LOOP;
END $$;

CREATE POLICY downtime_periods_select ON public.downtime_periods FOR SELECT TO medsync_clinical_reader
  USING (hospital_id = (SELECT private.current_hospital_id()));
CREATE POLICY downtime_form_numbers_select ON public.downtime_form_numbers FOR SELECT TO medsync_clinical_reader
  USING (hospital_id = (SELECT private.current_hospital_id()));
CREATE POLICY downtime_entries_select ON public.downtime_entries FOR SELECT TO medsync_clinical_reader
  USING (hospital_id = (SELECT private.current_hospital_id())
         AND patient_user_id IN (SELECT private.accessible_patient_ids()));
CREATE POLICY downtime_drills_select ON public.downtime_drills FOR SELECT TO medsync_clinical_reader
  USING (hospital_id = (SELECT private.current_hospital_id()));
CREATE POLICY lab_briefings_select ON public.lab_briefings FOR SELECT TO medsync_clinical_reader
  USING (hospital_id = (SELECT private.current_hospital_id()));
CREATE POLICY lab_cutover_select ON public.lab_cutover FOR SELECT TO medsync_clinical_reader
  USING (hospital_id = (SELECT private.current_hospital_id()));
