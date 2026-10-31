-- 0269 — Pharmacy rework, P5 records (docs/pharmacy/rework/PRD.md §5 S1, S7, S9; §6.6; TECH-SPEC §2.2
--   `pharmacy_reports`, `pharmacy_risk_actions`).
--
-- GATED: owner-applied (`npm run db:migrate`), after 0265.
--
--   1. The ledger gains `correction_of_id`: the right line that replaces a reversed one (S7). It must follow the
--      reversal of its original in the ledger, be the same kind of line, for the same medicine at the same place, and an
--      original has at most one replacement. (A correction's reason is required by the app; 0265's reversals stay as
--      they are, so no new constraint is added on them.)
--   2. pharmacy_reports: a monthly report, checked by anyone, submitted by the in-charge (S9) with the figures frozen in
--      `snapshot`. A draft has no row. Only checked → submitted moves it; nothing deletes it.
--   3. pharmacy_risk_actions: what was done about stock that will expire before it is used (offer, swap, use first),
--      with who and when. Append-only.
--   4. private.pharmacy_rows_if(table, hospital): the rows of a pharmacy table as jsonb, or none when the table does not
--      exist yet. The audit trail, losses and reports read the other areas' tables through it, so a page never breaks
--      on a migration the owner has not applied.
--
-- ADDITIVE and re-runnable. No client grants: writes come from the server connection.
-- Reverse: DROP FUNCTION private.pharmacy_rows_if(text, uuid), private.pharmacy_report_guard(),
--   private.pharmacy_correction_guard(); DROP TABLE public.pharmacy_risk_actions, public.pharmacy_reports;
--   DROP TRIGGER psm_correction; ALTER TABLE public.pharmacy_stock_movements DROP COLUMN correction_of_id.

-- ─── 1. Corrections ──────────────────────────────────────────────────────
ALTER TABLE public.pharmacy_stock_movements
  ADD COLUMN IF NOT EXISTS correction_of_id uuid REFERENCES public.pharmacy_stock_movements(id) ON DELETE RESTRICT;
CREATE UNIQUE INDEX IF NOT EXISTS psm_one_replacement ON public.pharmacy_stock_movements (correction_of_id)
  WHERE correction_of_id IS NOT NULL;

CREATE OR REPLACE FUNCTION private.pharmacy_correction_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE
  _o public.pharmacy_stock_movements;
BEGIN
  IF NEW.correction_of_id IS NULL THEN RETURN NEW; END IF;
  SELECT * INTO _o FROM public.pharmacy_stock_movements WHERE id = NEW.correction_of_id;
  IF NOT FOUND OR NEW.reverses_id IS NOT NULL OR _o.reverses_id IS NOT NULL OR _o.correction_of_id IS NOT NULL
     OR _o.hospital_id <> NEW.hospital_id OR _o.kind <> NEW.kind OR sign(_o.quantity) <> sign(NEW.quantity)
     OR coalesce(_o.location_id, _o.dispensing_point_id) <> coalesce(NEW.location_id, NEW.dispensing_point_id)
     OR NOT EXISTS (SELECT 1 FROM public.pharmacy_stock_movements r WHERE r.reverses_id = _o.id)
     OR (SELECT product_id FROM public.pharmacy_batches WHERE id = _o.batch_id)
        <> (SELECT product_id FROM public.pharmacy_batches WHERE id = NEW.batch_id) THEN
    RAISE EXCEPTION 'pharmacy_stock: a replacement follows the reversal of its original, same kind, medicine and place'
      USING ERRCODE = 'P0001', HINT = 'correction_mismatch';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS psm_correction ON public.pharmacy_stock_movements;
CREATE TRIGGER psm_correction BEFORE INSERT ON public.pharmacy_stock_movements
  FOR EACH ROW EXECUTE FUNCTION private.pharmacy_correction_guard();

-- ─── 2. Reports ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pharmacy_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  kind text NOT NULL CHECK (kind IN ('hmis_meds','hmis_epi','cd_return','losses')),
  -- The first day of the reported month.
  period date NOT NULL CHECK (extract(day FROM period) = 1),
  status text NOT NULL DEFAULT 'checked' CHECK (status IN ('checked','submitted')),
  remarks jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(remarks) = 'object'),
  checked_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  checked_at timestamptz NOT NULL DEFAULT now(),
  submitted_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  submitted_at timestamptz,
  snapshot jsonb,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pr_once UNIQUE (hospital_id, kind, period),
  CONSTRAINT pr_submitted CHECK ((status = 'submitted')
    = (submitted_by IS NOT NULL AND submitted_at IS NOT NULL AND snapshot IS NOT NULL))
);

CREATE OR REPLACE FUNCTION private.pharmacy_report_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'pharmacy_reports: a report is never deleted'; END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'checked' OR NEW.checked_by <> NEW.created_by THEN
      RAISE EXCEPTION 'pharmacy_reports: a report starts as checked, by the person who checked it';
    END IF;
    RETURN NEW;
  END IF;
  IF OLD.status <> 'checked' OR NEW.status <> 'submitted'
     OR (to_jsonb(NEW) - 'status' - 'submitted_by' - 'submitted_at' - 'snapshot')
        <> (to_jsonb(OLD) - 'status' - 'submitted_by' - 'submitted_at' - 'snapshot') THEN
    RAISE EXCEPTION 'pharmacy_reports: only submitting a checked report changes it'
      USING ERRCODE = 'P0001', HINT = 'report_frozen';
  END IF;
  -- S9: only the in-charge submits.
  IF NOT private.pharmacy_can_user(NEW.submitted_by, NEW.hospital_id, 'pharmacy.manage') THEN
    RAISE EXCEPTION 'pharmacy_reports: only the in-charge submits a report'
      USING ERRCODE = 'P0001', HINT = 'not_in_charge';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS pr_guard ON public.pharmacy_reports;
CREATE TRIGGER pr_guard BEFORE INSERT OR UPDATE OR DELETE ON public.pharmacy_reports
  FOR EACH ROW EXECUTE FUNCTION private.pharmacy_report_guard();

-- ─── 3. Stock at risk: what was done about it ────────────────────────────
CREATE TABLE IF NOT EXISTS public.pharmacy_risk_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  product_id uuid NOT NULL REFERENCES public.pharmacy_products(id) ON DELETE RESTRICT,
  -- A batch number spans places (each place holds its own batch row).
  batch_number text NOT NULL CHECK (char_length(batch_number) BETWEEN 1 AND 60),
  action text NOT NULL CHECK (action IN ('offer','swap','use_first')),
  value_ugx integer NOT NULL CHECK (value_ugx >= 0),
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pra_batch ON public.pharmacy_risk_actions (hospital_id, product_id, batch_number);

-- ─── 4. Rows of a table that may not exist yet ───────────────────────────
-- ponytail: reads the hospital's whole table as jsonb; add a time window when an event table grows past pilot size.
CREATE OR REPLACE FUNCTION private.pharmacy_rows_if(p_table text, p_hospital uuid) RETURNS SETOF jsonb
LANGUAGE plpgsql STABLE SET search_path = public, pg_temp AS $$
BEGIN
  IF p_table !~ '^pharmacy_[a-z0-9_]{1,60}$' OR to_regclass('public.' || p_table) IS NULL THEN RETURN; END IF;
  RETURN QUERY EXECUTE format('SELECT to_jsonb(t) FROM public.%I t WHERE t.hospital_id = $1', p_table)
    USING p_hospital;
END;
$$;
REVOKE ALL ON FUNCTION private.pharmacy_rows_if(text, uuid) FROM PUBLIC;

-- ─── 5. Grants, RLS, audit ───────────────────────────────────────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['pharmacy_reports','pharmacy_risk_actions'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS audit_%1$s ON public.%1$I', t);
    EXECUTE format('CREATE TRIGGER audit_%1$s AFTER INSERT OR UPDATE OR DELETE ON public.%1$I
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
DROP TRIGGER IF EXISTS pharmacy_risk_actions_append_only ON public.pharmacy_risk_actions;
CREATE TRIGGER pharmacy_risk_actions_append_only BEFORE UPDATE OR DELETE ON public.pharmacy_risk_actions
  FOR EACH ROW EXECUTE FUNCTION public.block_modify_append_only();
