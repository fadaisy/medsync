-- GATED — applied by the owner (`npm run db:migrate`), never auto-run.
-- 0305: a hospital's own price per laboratory test (ADR 0527). The laboratory is not booked like a clinic: a visit
-- costs the total of its tests. The laws are the pharmacy's (0257, Law 11): a price is whole Uganda shillings above
-- zero or the row is `free`; UGX 0 is never stored. History is append-only from a date (the price in force is the
-- latest row on or before the day), so no row is ever updated or deleted. No price ships with this migration.
-- Reads: hospital staff (MFA-gated) and the clinical reader. Writes: only the server (owner role), from
-- lib/lab/prices-store.ts after the hospital-admin or lab.manage check. ADDITIVE and idempotent.
--
-- Rollback (nothing else references the table):
--   DROP TABLE IF EXISTS public.lab_test_prices;

CREATE TABLE IF NOT EXISTS public.lab_test_prices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  -- test_catalogue.code (the catalogue's key is (coalesce(hospital_id), code), so no foreign key).
  code text NOT NULL CHECK (code ~ '^test\.[a-z0-9_]{2,60}$'),
  price_ugx integer CHECK (price_ugx IS NULL OR price_ugx > 0),
  free boolean NOT NULL DEFAULT false,
  from_date date NOT NULL,
  set_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ltp_price_or_free CHECK ((free AND price_ugx IS NULL) OR (NOT free AND price_ugx IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS ltp_test ON public.lab_test_prices (hospital_id, code, from_date DESC, created_at DESC);

DROP TRIGGER IF EXISTS audit_lab_test_prices ON public.lab_test_prices;
CREATE TRIGGER audit_lab_test_prices AFTER INSERT OR UPDATE OR DELETE ON public.lab_test_prices
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_changes();

ALTER TABLE public.lab_test_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lab_test_prices FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.lab_test_prices FROM anon, authenticated;
GRANT SELECT ON public.lab_test_prices TO authenticated, medsync_clinical_reader;

DROP POLICY IF EXISTS ltp_select ON public.lab_test_prices;
CREATE POLICY ltp_select ON public.lab_test_prices FOR SELECT TO authenticated USING (
  public.user_has_role('superadmin') OR public.user_has_role('hospital_admin', hospital_id)
  OR public.is_hospital_staff(hospital_id));
DROP POLICY IF EXISTS ltp_select_reader ON public.lab_test_prices;
CREATE POLICY ltp_select_reader ON public.lab_test_prices FOR SELECT TO medsync_clinical_reader
  USING (hospital_id = (SELECT private.current_hospital_id()));
DROP POLICY IF EXISTS mfa_gate ON public.lab_test_prices;
CREATE POLICY mfa_gate ON public.lab_test_prices AS RESTRICTIVE FOR ALL TO authenticated
  USING ((SELECT public.caller_mfa_ok())) WITH CHECK ((SELECT public.caller_mfa_ok()));
