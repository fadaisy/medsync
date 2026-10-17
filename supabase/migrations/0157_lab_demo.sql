-- 0157 — Lab demo data (owner request, 17 Oct 2026; gate-a-proposal.md A19). A hospital is marked as a demo
-- hospital by a superadmin; only there may the lab demo loader write, through the normal lab write path, synthetic
-- patients labelled "Demo" with orders, specimens and results. Every demo patient is recorded against its load.
--
-- Laboratory records are append-only by design, so demo data is not deleted: the demo hospital is the sandbox,
-- and a real hospital can never receive demo rows (the foreign key below). ADDITIVE and re-runnable.
-- GATED: owner-applied (`npm run db:migrate -- 0157`).
-- Reverse: DROP TABLE public.lab_demo_patients, public.lab_demo_loads, public.lab_demo_hospitals.

CREATE TABLE IF NOT EXISTS public.lab_demo_hospitals (
  hospital_id uuid PRIMARY KEY REFERENCES public.hospitals(id) ON DELETE CASCADE,
  marked_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  marked_at timestamptz NOT NULL DEFAULT now(),
  note text NOT NULL CHECK (char_length(note) BETWEEN 3 AND 300)
);

CREATE TABLE IF NOT EXISTS public.lab_demo_loads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.lab_demo_hospitals(hospital_id) ON DELETE RESTRICT,
  started_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  scenario text NOT NULL CHECK (scenario IN ('lab_day')),
  counts jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(counts) = 'object'),
  error text
);

CREATE TABLE IF NOT EXISTS public.lab_demo_patients (
  load_id uuid NOT NULL REFERENCES public.lab_demo_loads(id) ON DELETE RESTRICT,
  hospital_id uuid NOT NULL REFERENCES public.lab_demo_hospitals(hospital_id) ON DELETE RESTRICT,
  patient_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  label text NOT NULL CHECK (label LIKE 'Demo %'),
  PRIMARY KEY (load_id, patient_user_id)
);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['lab_demo_hospitals','lab_demo_loads','lab_demo_patients'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS audit_%1$s ON public.%1$I', t);
    EXECUTE format('CREATE TRIGGER audit_%1$s AFTER INSERT OR UPDATE OR DELETE ON public.%1$I
      FOR EACH ROW EXECUTE FUNCTION public.audit_log_changes()', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
    EXECUTE format('GRANT SELECT ON public.%I TO medsync_clinical_reader', t);
    EXECUTE format('DROP POLICY IF EXISTS lab_read ON public.%I', t);
    EXECUTE format('CREATE POLICY lab_read ON public.%I FOR SELECT TO medsync_clinical_reader
      USING (hospital_id = (SELECT private.current_hospital_id()) AND (SELECT private.lab_reader()))', t);
  END LOOP;
END $$;
