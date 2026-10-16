-- 0136 — The national list as the pharmacy's catalogue (Pharmacy Phase 1, CT-3 completed; ADR 0282).
--
-- GATED: owner-applied (`npm run db:migrate`), after 0123.
--
--   1. pharmacy_national_list_rows gains what an edition prints beside the six import columns: whether the
--      row is a medicine or a health supply, its list section (A medicines; B, C, D supplies), a supply's unit
--      or specification, the "specialist medicines" band, the source page, and `check_note`, the reason a
--      row was not read with confidence. Every value is the edition's own, as printed; nothing is corrected.
--   2. pharmacy_national_list_row_checks: a person's record that a flagged row was checked against the
--      source. Append-only, one per row.
--   3. A guard on pharmacy_medicine_links: a link is to a medicine row of the same edition, and never to a
--      flagged row nobody has checked (CT-3: nothing is matched by guess).
--
-- ADDITIVE and re-runnable. Writes come from the superadmin console (the CSO, nationally) and the owner's
-- loader script; no client grants.

ALTER TABLE public.pharmacy_national_list_rows
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'medicine' CHECK (kind IN ('medicine', 'supply')),
  ADD COLUMN IF NOT EXISTS list_section text CHECK (list_section IS NULL OR char_length(list_section) <= 10),
  ADD COLUMN IF NOT EXISTS unit text CHECK (unit IS NULL OR char_length(unit) <= 120),
  ADD COLUMN IF NOT EXISTS specialist boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS source_page integer CHECK (source_page IS NULL OR source_page > 0),
  ADD COLUMN IF NOT EXISTS check_note text CHECK (check_note IS NULL OR char_length(check_note) BETWEEN 1 AND 600);
CREATE INDEX IF NOT EXISTS pnlr_edition_kind ON public.pharmacy_national_list_rows (edition_id, kind);

CREATE TABLE IF NOT EXISTS public.pharmacy_national_list_row_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  row_id uuid NOT NULL UNIQUE REFERENCES public.pharmacy_national_list_rows(id) ON DELETE CASCADE,
  checked_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  checked_at timestamptz NOT NULL DEFAULT now(),
  note text NOT NULL CHECK (char_length(note) BETWEEN 10 AND 600)
);
DROP TRIGGER IF EXISTS pnlrc_append_only ON public.pharmacy_national_list_row_checks;
CREATE TRIGGER pnlrc_append_only BEFORE UPDATE OR DELETE ON public.pharmacy_national_list_row_checks
  FOR EACH ROW EXECUTE FUNCTION public.block_modify_append_only();
DROP TRIGGER IF EXISTS audit_pharmacy_national_list_row_checks ON public.pharmacy_national_list_row_checks;
CREATE TRIGGER audit_pharmacy_national_list_row_checks AFTER INSERT ON public.pharmacy_national_list_row_checks
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_changes();
ALTER TABLE public.pharmacy_national_list_row_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pharmacy_national_list_row_checks FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.pharmacy_national_list_row_checks FROM anon, authenticated;
GRANT SELECT ON public.pharmacy_national_list_row_checks TO medsync_clinical_reader;
DROP POLICY IF EXISTS pharmacy_national_list_row_checks_select ON public.pharmacy_national_list_row_checks;
CREATE POLICY pharmacy_national_list_row_checks_select ON public.pharmacy_national_list_row_checks
  FOR SELECT TO medsync_clinical_reader USING ((SELECT private.pharmacy_can('pharmacy.view')));

CREATE OR REPLACE FUNCTION private.pharmacy_medicine_link_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE r record;
BEGIN
  SELECT edition_id, kind, check_note INTO r FROM public.pharmacy_national_list_rows WHERE id = NEW.row_id;
  IF r.edition_id IS DISTINCT FROM NEW.edition_id THEN
    RAISE EXCEPTION 'The national-list row is not in this edition.' USING ERRCODE = 'check_violation';
  END IF;
  IF r.kind <> 'medicine' THEN
    RAISE EXCEPTION 'Only a medicine row links to a prescribing-list medicine.' USING ERRCODE = 'check_violation';
  END IF;
  IF r.check_note IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.pharmacy_national_list_row_checks c WHERE c.row_id = NEW.row_id) THEN
    RAISE EXCEPTION 'This row is flagged: check it against the source before linking it.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS pml_guard ON public.pharmacy_medicine_links;
CREATE TRIGGER pml_guard BEFORE INSERT OR UPDATE ON public.pharmacy_medicine_links
  FOR EACH ROW EXECUTE FUNCTION private.pharmacy_medicine_link_guard();
