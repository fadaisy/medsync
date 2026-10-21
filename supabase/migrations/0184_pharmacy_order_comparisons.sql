-- 0184 — Pharmacy Phase 2, part 5: the order's paper comparison (5.12 "Ordering goes live after one cycle's proposal
-- was checked against the in-charge's own paper calculation, and every difference was explained in writing";
-- Section 8 `recordPaperOrderComparison`; GATE A signed 21 Oct 2026).
--
-- GATED: owner-applied (`npm run db:migrate`), after 0181. ADDITIVE: one new table; no existing row is touched.
--
-- Why a table: 0181 holds the proposal and the in-charge's chosen quantity, but nowhere to keep the paper figure for
-- each line and the written explanation of each difference, which is the ordering go-live evidence (GL2-1). One row
-- per comparison, append-only; a later comparison is a new row, and readiness reads the latest.

CREATE TABLE IF NOT EXISTS public.pharmacy_order_comparisons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  order_id uuid NOT NULL REFERENCES public.pharmacy_orders(id) ON DELETE RESTRICT,
  -- [{productId, proposedUnits, paperUnits, explanation}] for every line of the order.
  lines jsonb NOT NULL CHECK (jsonb_typeof(lines) = 'array' AND jsonb_array_length(lines) > 0),
  recorded_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  recorded_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS poc_hospital ON public.pharmacy_order_comparisons (hospital_id, recorded_at DESC);

DROP TRIGGER IF EXISTS audit_pharmacy_order_comparisons ON public.pharmacy_order_comparisons;
CREATE TRIGGER audit_pharmacy_order_comparisons AFTER INSERT OR UPDATE OR DELETE ON public.pharmacy_order_comparisons
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_changes();
DROP TRIGGER IF EXISTS pharmacy_order_comparisons_append_only ON public.pharmacy_order_comparisons;
CREATE TRIGGER pharmacy_order_comparisons_append_only BEFORE UPDATE OR DELETE ON public.pharmacy_order_comparisons
  FOR EACH ROW EXECUTE FUNCTION public.block_modify_append_only();
ALTER TABLE public.pharmacy_order_comparisons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pharmacy_order_comparisons FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.pharmacy_order_comparisons FROM anon, authenticated;
GRANT SELECT ON public.pharmacy_order_comparisons TO medsync_clinical_reader;
DROP POLICY IF EXISTS pharmacy_order_comparisons_select ON public.pharmacy_order_comparisons;
CREATE POLICY pharmacy_order_comparisons_select ON public.pharmacy_order_comparisons FOR SELECT TO medsync_clinical_reader
  USING (hospital_id = (SELECT private.current_hospital_id()) AND (SELECT private.pharmacy_can('pharmacy.view')));
