-- 0250 — Pharmacy demo data (owner request, 26 Oct 2026; ADR 0450). One press in a demo hospital fills every pharmacy
-- page with a national referral hospital's day: demo points, stores, staff, patients labelled "Demo", prescriptions at
-- every stage, stock, packs signed by demo staff, clinical records and refills.
--
-- A demo hospital is one a superadmin marked in `lab_demo_hospitals` (0157): that row makes the hospital a sandbox for
-- every workspace's demo, so a real hospital can never receive demo rows (the foreign keys below). Pharmacy records
-- are append-only by design, so the demo is not deleted here. ADDITIVE and re-runnable.
-- GATED: owner-applied (`npm run db:migrate`).
-- Reverse: DROP TABLE public.pharmacy_demo_patients, public.pharmacy_demo_loads.

CREATE TABLE IF NOT EXISTS public.pharmacy_demo_loads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.lab_demo_hospitals(hospital_id) ON DELETE RESTRICT,
  started_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  scenario text NOT NULL CHECK (scenario IN ('national_referral_day')),
  counts jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(counts) = 'object'),
  -- A section that failed, by name, with its message; the other sections carried on.
  notes jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(notes) = 'object'),
  error text
);

CREATE TABLE IF NOT EXISTS public.pharmacy_demo_patients (
  load_id uuid NOT NULL REFERENCES public.pharmacy_demo_loads(id) ON DELETE RESTRICT,
  hospital_id uuid NOT NULL REFERENCES public.lab_demo_hospitals(hospital_id) ON DELETE RESTRICT,
  patient_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  label text NOT NULL CHECK (label LIKE 'Demo %'),
  PRIMARY KEY (load_id, patient_user_id)
);

-- Read and written by the app's own connection only (the hospital admin's demo page); no client role reads them.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['pharmacy_demo_loads','pharmacy_demo_patients'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS audit_%1$s ON public.%1$I', t);
    EXECUTE format('CREATE TRIGGER audit_%1$s AFTER INSERT OR UPDATE OR DELETE ON public.%1$I
      FOR EACH ROW EXECUTE FUNCTION public.audit_log_changes()', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
  END LOOP;
END $$;
