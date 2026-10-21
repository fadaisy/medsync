-- 0182 — Pharmacy Phase 2, part 3: what the store's go-live and its loans need that 0180–0181 cannot hold
-- (5.3 loans, 5.12 going live per location; GATE A signed 21 Oct 2026).
--
-- GATED: owner-applied (`npm run db:migrate`), after 0181. ADDITIVE: no existing row is updated or deleted.
--
--   1. pharmacy_loan_closures: a loan closed with a reason and no return (IS-7, "until it is returned or closed
--      with a reason"). Append-only; one per loan movement. No stock moves: the ledger is unchanged.
--   2. downtime_drills gains `location_id` and whether the drill included a delivery and an issue on paper (5.12:
--      "for the store, a downtime drill that includes a delivery and an issue on paper"). The Phase 1 point column
--      keeps its meaning; a pharmacy drill now names a point or a location.
--   3. pharmacy_briefings gains `location_id`: a store's, ward's or cart's people briefed (5.12).

-- ─── 1. Loan closures (IS-7) ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pharmacy_loan_closures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  loan_movement_id uuid NOT NULL UNIQUE REFERENCES public.pharmacy_stock_movements(id) ON DELETE RESTRICT,
  reason text NOT NULL CHECK (char_length(reason) BETWEEN 3 AND 300),
  actor_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  closed_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION private.pharmacy_loan_closure_check() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.pharmacy_stock_movements m
                  WHERE m.id = NEW.loan_movement_id AND m.hospital_id = NEW.hospital_id
                    AND m.kind IN ('lent','borrowed')) THEN
    RAISE EXCEPTION 'pharmacy_loan_closures: only a loan of this hospital is closed';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS plc_check ON public.pharmacy_loan_closures;
CREATE TRIGGER plc_check BEFORE INSERT ON public.pharmacy_loan_closures
  FOR EACH ROW EXECUTE FUNCTION private.pharmacy_loan_closure_check();

DROP TRIGGER IF EXISTS audit_pharmacy_loan_closures ON public.pharmacy_loan_closures;
CREATE TRIGGER audit_pharmacy_loan_closures AFTER INSERT OR UPDATE OR DELETE ON public.pharmacy_loan_closures
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_changes();
DROP TRIGGER IF EXISTS pharmacy_loan_closures_append_only ON public.pharmacy_loan_closures;
CREATE TRIGGER pharmacy_loan_closures_append_only BEFORE UPDATE OR DELETE ON public.pharmacy_loan_closures
  FOR EACH ROW EXECUTE FUNCTION public.block_modify_append_only();
ALTER TABLE public.pharmacy_loan_closures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pharmacy_loan_closures FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.pharmacy_loan_closures FROM anon, authenticated;
GRANT SELECT ON public.pharmacy_loan_closures TO medsync_clinical_reader;
DROP POLICY IF EXISTS pharmacy_loan_closures_select ON public.pharmacy_loan_closures;
CREATE POLICY pharmacy_loan_closures_select ON public.pharmacy_loan_closures FOR SELECT TO medsync_clinical_reader
  USING (hospital_id = (SELECT private.current_hospital_id()) AND (SELECT private.pharmacy_can('pharmacy.view')));

-- ─── 2. Drills at a location (5.12) ──────────────────────────────────────
ALTER TABLE public.downtime_drills
  ADD COLUMN IF NOT EXISTS location_id uuid REFERENCES public.pharmacy_locations(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS included_delivery boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS included_issue boolean NOT NULL DEFAULT false;
ALTER TABLE public.downtime_drills DROP CONSTRAINT IF EXISTS ddr_workspace;
ALTER TABLE public.downtime_drills ADD CONSTRAINT ddr_workspace CHECK (
  (workspace = 'lab' AND dispensing_point_id IS NULL AND location_id IS NULL)
  OR (workspace = 'pharmacy' AND (dispensing_point_id IS NOT NULL OR location_id IS NOT NULL)));

-- ─── 3. Briefings at a location (5.12) ───────────────────────────────────
ALTER TABLE public.pharmacy_briefings
  ADD COLUMN IF NOT EXISTS location_id uuid REFERENCES public.pharmacy_locations(id) ON DELETE RESTRICT;
