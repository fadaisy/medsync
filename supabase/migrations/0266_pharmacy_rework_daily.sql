-- 0266 — Pharmacy rework, P2 daily work (docs/pharmacy/rework/PRD.md §6.2, §6.4; TECH-SPEC §2.2, §7 tests 4 and 8).
--
-- GATED: owner-applied (`npm run db:migrate`), after 0265.
--
--   1. pharmacy_rx_checks: the pharmacist's answer to each check flag on a line before it is handed over. Append-only;
--      the latest answer per (line, code) stands. A stop is never answered "checked": it needs the prescriber, named.
--   2. pharmacy_count_sheets (+ _lines): a count saved as you type and resumable (counting → approval → done). The
--      differences post to the ledger only when the sheet is approved (review finding C4), by someone other than the
--      counter who, once the hospital has a duty roster, is on it as in-charge.
--
-- ADDITIVE and re-runnable. No client grants.
-- Reverse: DROP the three tables and the two guard functions.

-- ─── 1. Check answers at the window ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pharmacy_rx_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  -- The prescription line's current version.
  line_id uuid NOT NULL REFERENCES public.prescriptions(id) ON DELETE RESTRICT,
  code text NOT NULL CHECK (char_length(code) BETWEEN 2 AND 60),
  level text NOT NULL CHECK (level IN ('stop','check')),
  answer text NOT NULL CHECK (answer IN ('checked','prescriber_confirmed','query')),
  reason text CHECK (char_length(reason) BETWEEN 2 AND 200),
  prescriber_user_id uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT prc_stop_needs_prescriber CHECK (level <> 'stop' OR answer <> 'checked'),
  CONSTRAINT prc_prescriber_named CHECK (answer <> 'prescriber_confirmed' OR prescriber_user_id IS NOT NULL),
  CONSTRAINT prc_checked_why CHECK (answer <> 'checked' OR reason IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS prc_line ON public.pharmacy_rx_checks (hospital_id, line_id, created_at DESC);
DROP TRIGGER IF EXISTS prc_append_only ON public.pharmacy_rx_checks;
CREATE TRIGGER prc_append_only BEFORE UPDATE OR DELETE ON public.pharmacy_rx_checks
  FOR EACH ROW EXECUTE FUNCTION public.block_modify_append_only();

-- ─── 2. Count sheets ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pharmacy_count_sheets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  location_id uuid NOT NULL REFERENCES public.pharmacy_locations(id) ON DELETE RESTRICT,
  scope text NOT NULL CHECK (scope IN ('shelf','medicine','month_end')),
  label text NOT NULL CHECK (char_length(label) BETWEEN 1 AND 120),
  status text NOT NULL DEFAULT 'counting' CHECK (status IN ('counting','approval','done','cancelled')),
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  approved_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  approved_at timestamptz,
  witness_attestation_id uuid REFERENCES public.pharmacy_attestations(id) ON DELETE RESTRICT,
  -- The ledger count the approval posted.
  count_id uuid REFERENCES public.pharmacy_counts(id) ON DELETE RESTRICT,
  CONSTRAINT pcs_done CHECK ((status = 'done') = (approved_by IS NOT NULL AND count_id IS NOT NULL)),
  CONSTRAINT pcs_not_self CHECK (approved_by IS NULL OR approved_by <> created_by)
);
CREATE INDEX IF NOT EXISTS pcs_open ON public.pharmacy_count_sheets (hospital_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS public.pharmacy_count_sheet_lines (
  sheet_id uuid NOT NULL REFERENCES public.pharmacy_count_sheets(id) ON DELETE RESTRICT,
  batch_id uuid NOT NULL REFERENCES public.pharmacy_batches(id) ON DELETE RESTRICT,
  shelf text CHECK (char_length(shelf) <= 40),
  pack_size integer NOT NULL DEFAULT 1 CHECK (pack_size BETWEEN 1 AND 100000),
  counted_packs integer CHECK (counted_packs >= 0),
  counted_units integer CHECK (counted_units >= 0),
  -- A batch the counter found that was not on the sheet.
  found boolean NOT NULL DEFAULT false,
  reason text CHECK (char_length(reason) BETWEEN 2 AND 60),
  note text CHECK (char_length(note) <= 300),
  updated_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (sheet_id, batch_id)
);

CREATE OR REPLACE FUNCTION private.pharmacy_count_sheet_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE roster boolean;
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'pharmacy_count_sheets: never deleted'; END IF;
  IF (to_jsonb(NEW) - 'status' - 'sent_at' - 'approved_by' - 'approved_at' - 'witness_attestation_id' - 'count_id')
     <> (to_jsonb(OLD) - 'status' - 'sent_at' - 'approved_by' - 'approved_at' - 'witness_attestation_id' - 'count_id') THEN
    RAISE EXCEPTION 'pharmacy_count_sheets: only the status moves';
  END IF;
  IF NOT ((OLD.status = 'counting' AND NEW.status IN ('counting','approval','cancelled'))
       OR (OLD.status = 'approval' AND NEW.status IN ('counting','done'))) THEN
    RAISE EXCEPTION 'pharmacy_count_sheets: a % count cannot become %', OLD.status, NEW.status;
  END IF;
  IF NEW.status = 'done' THEN
    SELECT EXISTS (SELECT 1 FROM pharmacy_duty_roster WHERE hospital_id = NEW.hospital_id AND ended_at IS NULL)
      INTO roster;
    IF roster AND NOT EXISTS (
      SELECT 1 FROM pharmacy_duty_roster
       WHERE hospital_id = NEW.hospital_id AND user_id = NEW.approved_by AND role = 'in_charge' AND ended_at IS NULL
         AND current_date BETWEEN date_from AND coalesce(date_to, current_date)) THEN
      RAISE EXCEPTION 'pharmacy_count_sheets: only the in-charge approves a count'
        USING ERRCODE = 'P0001', HINT = 'not_in_charge';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS pcs_guard ON public.pharmacy_count_sheets;
CREATE TRIGGER pcs_guard BEFORE UPDATE OR DELETE ON public.pharmacy_count_sheets
  FOR EACH ROW EXECUTE FUNCTION private.pharmacy_count_sheet_guard();

-- Lines change only while their sheet is still being counted.
CREATE OR REPLACE FUNCTION private.pharmacy_count_sheet_line_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF (SELECT status FROM pharmacy_count_sheets WHERE id = coalesce(NEW.sheet_id, OLD.sheet_id)) <> 'counting' THEN
    RAISE EXCEPTION 'pharmacy_count_sheet_lines: the count was sent for approval; it is not changed now'
      USING ERRCODE = 'P0001', HINT = 'count_sent';
  END IF;
  RETURN coalesce(NEW, OLD);
END;
$$;
DROP TRIGGER IF EXISTS pcsl_guard ON public.pharmacy_count_sheet_lines;
CREATE TRIGGER pcsl_guard BEFORE INSERT OR UPDATE OR DELETE ON public.pharmacy_count_sheet_lines
  FOR EACH ROW EXECUTE FUNCTION private.pharmacy_count_sheet_line_guard();

-- ─── 3. RLS (the 0180 pattern) ───────────────────────────────────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['pharmacy_rx_checks','pharmacy_count_sheets','pharmacy_count_sheet_lines'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS audit_%1$s ON public.%1$I', t);
    EXECUTE format('CREATE TRIGGER audit_%1$s AFTER INSERT OR UPDATE OR DELETE ON public.%1$I
      FOR EACH ROW EXECUTE FUNCTION public.audit_log_changes()', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
  END LOOP;
  FOREACH t IN ARRAY ARRAY['pharmacy_rx_checks','pharmacy_count_sheets'] LOOP
    EXECUTE format('GRANT SELECT ON public.%I TO medsync_clinical_reader', t);
    EXECUTE format('DROP POLICY IF EXISTS %1$s_select ON public.%1$I', t);
    EXECUTE format('CREATE POLICY %1$s_select ON public.%1$I FOR SELECT TO medsync_clinical_reader
      USING (hospital_id = (SELECT private.current_hospital_id()) AND (SELECT private.pharmacy_can(''pharmacy.view'')))', t);
  END LOOP;
END $$;
GRANT SELECT ON public.pharmacy_count_sheet_lines TO medsync_clinical_reader;
DROP POLICY IF EXISTS pharmacy_count_sheet_lines_select ON public.pharmacy_count_sheet_lines;
CREATE POLICY pharmacy_count_sheet_lines_select ON public.pharmacy_count_sheet_lines FOR SELECT TO medsync_clinical_reader
  USING (EXISTS (SELECT 1 FROM public.pharmacy_count_sheets s WHERE s.id = sheet_id
    AND s.hospital_id = (SELECT private.current_hospital_id()) AND (SELECT private.pharmacy_can('pharmacy.view'))));
