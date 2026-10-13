-- 0128 — Downtime, generalised once for the lab and the pharmacy (DT-1, D-PH1-46; gate-a-proposal §1, §7).
--
-- GATED: owner-applied (`npm run db:migrate`), after 0127. Touches 0105's tables; the lab's behaviour is
-- unchanged and its tests run as they were (lab rows default to workspace 'lab', and the lab's moves are
-- checked exactly as 0105 checked them).
--
--   1. downtime_periods: shared as it is. One outage is one outage.
--   2. downtime_form_numbers gains `workspace` ('lab' | 'pharmacy'), the pharmacy's states `to_enter` and
--      `complete`, the dispensing point and the downtime period a pharmacy sheet was used in. One number
--      space per hospital: a pharmacy sheet prints its number as DS-00031. The guard keeps the lab's moves
--      (unused → entered | voided, once) and adds the pharmacy's (unused → to_enter | voided;
--      to_enter → complete).
--   3. downtime_drills gains `workspace` and `dispensing_point_id`; a drill writes no patient record (DT-11).
--   4. paper_prescriptions and their lines: a paper prescription transcribed at back-entry is its own record,
--      never a row in `prescriptions` (DT-5, E-PH1-10). Append-only.
--
-- ADDITIVE and re-runnable.

-- ─── 2. Sheet numbers ────────────────────────────────────────────────────
ALTER TABLE public.downtime_form_numbers
  ADD COLUMN IF NOT EXISTS workspace text NOT NULL DEFAULT 'lab',
  ADD COLUMN IF NOT EXISTS dispensing_point_id uuid REFERENCES public.pharmacy_dispensing_points(department_id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS downtime_period_id uuid REFERENCES public.downtime_periods(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS completed_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT;

ALTER TABLE public.downtime_form_numbers DROP CONSTRAINT IF EXISTS downtime_form_numbers_state_check;
ALTER TABLE public.downtime_form_numbers DROP CONSTRAINT IF EXISTS dfn_workspace;
ALTER TABLE public.downtime_form_numbers ADD CONSTRAINT dfn_workspace CHECK (
  (workspace = 'lab' AND state IN ('unused','entered','voided') AND dispensing_point_id IS NULL)
  OR (workspace = 'pharmacy' AND state IN ('unused','to_enter','complete','voided') AND report_id IS NULL
      AND dispensing_point_id IS NOT NULL
      AND (state NOT IN ('to_enter','complete') OR downtime_period_id IS NOT NULL)
      AND ((state = 'complete') = (completed_at IS NOT NULL AND completed_by IS NOT NULL))));

CREATE OR REPLACE FUNCTION private.downtime_number_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'downtime_form_numbers: numbers are never deleted; void one'; END IF;
  IF NEW.workspace IS DISTINCT FROM OLD.workspace OR NEW.number IS DISTINCT FROM OLD.number
     OR NEW.hospital_id IS DISTINCT FROM OLD.hospital_id THEN
    RAISE EXCEPTION 'downtime_form_numbers: a number keeps its hospital and workspace';
  END IF;
  IF OLD.workspace = 'lab' THEN
    -- 0105, unchanged: a number moves only from unused, once.
    IF OLD.state <> 'unused' THEN
      RAISE EXCEPTION 'downtime_form_numbers: form % is already %', OLD.number, OLD.state;
    END IF;
    RETURN NEW;
  END IF;
  IF (OLD.state = 'unused' AND NEW.state IN ('to_enter','voided'))
     OR (OLD.state = 'to_enter' AND NEW.state = 'complete') THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'downtime_form_numbers: sheet % cannot move from % to %', OLD.number, OLD.state, NEW.state;
END;
$$;

CREATE INDEX IF NOT EXISTS dfn_workspace_state ON public.downtime_form_numbers (hospital_id, workspace, state);

-- ─── 3. Drills ───────────────────────────────────────────────────────────
ALTER TABLE public.downtime_drills
  ADD COLUMN IF NOT EXISTS workspace text NOT NULL DEFAULT 'lab',
  ADD COLUMN IF NOT EXISTS dispensing_point_id uuid REFERENCES public.pharmacy_dispensing_points(department_id) ON DELETE RESTRICT;
ALTER TABLE public.downtime_drills DROP CONSTRAINT IF EXISTS ddr_workspace;
ALTER TABLE public.downtime_drills ADD CONSTRAINT ddr_workspace CHECK (
  (workspace = 'lab' AND dispensing_point_id IS NULL) OR (workspace = 'pharmacy' AND dispensing_point_id IS NOT NULL));

-- ─── 4. Paper prescriptions ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.paper_prescriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  dispensing_point_id uuid NOT NULL REFERENCES public.pharmacy_dispensing_points(department_id) ON DELETE RESTRICT,
  patient_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  prescriber_name text NOT NULL CHECK (char_length(prescriber_name) BETWEEN 2 AND 120),
  prescriber_cadre text NOT NULL CHECK (char_length(prescriber_cadre) BETWEEN 2 AND 80),
  written_on date NOT NULL,
  sheet_number integer NOT NULL,
  transcribed_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  transcribed_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.paper_prescription_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  paper_prescription_id uuid NOT NULL REFERENCES public.paper_prescriptions(id) ON DELETE RESTRICT,
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  line_no integer NOT NULL CHECK (line_no > 0),
  medicine_id text,
  medicine_as_written text NOT NULL CHECK (char_length(medicine_as_written) BETWEEN 2 AND 200),
  directions_as_written text NOT NULL CHECK (char_length(directions_as_written) BETWEEN 1 AND 500),
  quantity_as_written text CHECK (quantity_as_written IS NULL OR char_length(quantity_as_written) <= 80),
  not_supplied_reason text CHECK (not_supplied_reason IS NULL OR char_length(not_supplied_reason) BETWEEN 2 AND 60),
  not_supplied_outcome text CHECK (not_supplied_outcome IS NULL OR not_supplied_outcome IN ('owed','buying_outside')),
  UNIQUE (paper_prescription_id, line_no),
  CONSTRAINT ppl_not_supplied CHECK ((not_supplied_reason IS NULL) = (not_supplied_outcome IS NULL))
);

ALTER TABLE public.pharmacy_supplies DROP CONSTRAINT IF EXISTS ps_paper_line_fk;
ALTER TABLE public.pharmacy_supplies ADD CONSTRAINT ps_paper_line_fk
  FOREIGN KEY (paper_prescription_line_id) REFERENCES public.paper_prescription_lines(id) ON DELETE RESTRICT;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['paper_prescriptions','paper_prescription_lines'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %1$s_append_only ON public.%1$I', t);
    EXECUTE format('CREATE TRIGGER %1$s_append_only BEFORE UPDATE OR DELETE ON public.%1$I
      FOR EACH ROW EXECUTE FUNCTION public.block_modify_append_only()', t);
    EXECUTE format('DROP TRIGGER IF EXISTS audit_%1$s ON public.%1$I', t);
    EXECUTE format('CREATE TRIGGER audit_%1$s AFTER INSERT ON public.%1$I
      FOR EACH ROW EXECUTE FUNCTION public.audit_log_changes()', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
    EXECUTE format('GRANT SELECT ON public.%I TO medsync_clinical_reader', t);
    EXECUTE format('DROP POLICY IF EXISTS %1$s_select ON public.%1$I', t);
    EXECUTE format('CREATE POLICY %1$s_select ON public.%1$I FOR SELECT TO medsync_clinical_reader
      USING (hospital_id = (SELECT private.current_hospital_id()) AND (SELECT private.pharmacy_can(''pharmacy.view'')))', t);
  END LOOP;
END $$;
