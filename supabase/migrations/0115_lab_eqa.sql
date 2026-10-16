-- 0115 — External quality assessment: schemes (the tests they cover are the enrolment), rounds (samples, our
-- results, targets and scores as JSON; the provider's report as a stored file path) and alternative assessments
-- for tests with no scheme (Lab Phase 3, gate-a-proposal §3.2, P8; D-LAB3-13).
--
-- No acceptance limit ships here: each score and limit is the provider's, entered from its report.
-- ADDITIVE and re-runnable. GATED: owner-applied (`npm run db:migrate -- 0115`).

CREATE TABLE IF NOT EXISTS public.lab_eqa_schemes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(name) BETWEEN 2 AND 160),
  provider text NOT NULL CHECK (char_length(provider) BETWEEN 2 AND 160),
  covers text[] NOT NULL DEFAULT '{}',        -- test codes
  rounds_per_year integer CHECK (rounds_per_year IS NULL OR rounds_per_year BETWEEN 1 AND 52),
  active boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS public.lab_eqa_rounds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  scheme_id uuid NOT NULL REFERENCES public.lab_eqa_schemes(id) ON DELETE RESTRICT,
  label text NOT NULL CHECK (char_length(label) BETWEEN 1 AND 60),
  received_on date NOT NULL,
  due_on date,
  submitted_on date,
  scored_on date,                             -- the provider's report date: the look-back runs receipt → scoring (EA-4)
  tested_by uuid[] NOT NULL DEFAULT '{}',
  samples jsonb NOT NULL DEFAULT '[]',        -- [{sampleId, conceptId, ours, target?, score?, scoreKind?, limit?}]
  report_path text CHECK (report_path IS NULL OR char_length(report_path) BETWEEN 3 AND 300),
  outcome text CHECK (outcome IS NULL OR outcome IN ('acceptable','unacceptable','mixed')),
  nc_id uuid REFERENCES public.lab_nonconformities(id) ON DELETE RESTRICT,
  UNIQUE (scheme_id, label),
  CONSTRAINT ler_scored CHECK (scored_on IS NULL OR scored_on >= received_on)
);

CREATE TABLE IF NOT EXISTS public.lab_alt_assessments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  test_code text NOT NULL CHECK (test_code ~ '^test\.[a-z0-9_]{2,60}$'),
  method text NOT NULL CHECK (method IN ('split_sample','interlab','retained_samples')),
  partner text CHECK (partner IS NULL OR char_length(partner) BETWEEN 2 AND 160),
  done_on date NOT NULL,
  results jsonb NOT NULL,
  conclusion text NOT NULL CHECK (char_length(conclusion) BETWEEN 3 AND 1000),
  recorded_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  CONSTRAINT laa_partner CHECK (method = 'retained_samples' OR partner IS NOT NULL)
);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['lab_eqa_schemes','lab_eqa_rounds','lab_alt_assessments'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS audit_%1$s ON public.%1$I', t);
    EXECUTE format('CREATE TRIGGER audit_%1$s AFTER INSERT OR UPDATE OR DELETE ON public.%1$I
      FOR EACH ROW EXECUTE FUNCTION public.audit_log_changes()', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.%I FROM anon, authenticated', t);
    EXECUTE format('GRANT SELECT ON public.%I TO medsync_clinical_reader', t);
    EXECUTE format('DROP POLICY IF EXISTS lab_read ON public.%I', t);
    EXECUTE format('CREATE POLICY lab_read ON public.%I FOR SELECT TO medsync_clinical_reader
      USING (hospital_id = (SELECT private.current_hospital_id()) AND (SELECT private.lab_reader()))', t);
  END LOOP;
END $$;
