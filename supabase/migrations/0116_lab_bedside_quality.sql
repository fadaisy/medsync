-- 0116 — Bedside quality: competency per operator and test, beside the Phase 2 grant (poct_operators), assessed
-- by the laboratory (Lab Phase 3, gate-a-proposal §3.2, P14; BQ-4, D-LAB3-15, -16). Device state `blocked` is
-- in 0113's CHECK; device control checks are lab_control_checks (0114); strip-lot control ranges are each lot's
-- insert_ranges (0112).
--
-- Validity comes from signed configuration (kind competency_validity); no number ships here. A reassessment is
-- a new row; the only change ever made to a row is its revocation, once. ADDITIVE and re-runnable.
-- GATED: owner-applied (`npm run db:migrate -- 0116`).

CREATE TABLE IF NOT EXISTS public.lab_competencies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  test_code text NOT NULL CHECK (test_code ~ '^test\.[a-z0-9_]{2,60}$'),
  assessed_on date NOT NULL,
  assessor uuid REFERENCES auth.users(id) ON DELETE RESTRICT,     -- NULL only when grandfathered at switch-on
  method text[] NOT NULL DEFAULT '{}',
  valid_to date NOT NULL,
  grandfathered boolean NOT NULL DEFAULT false,
  revoked_at timestamptz,
  revoked_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  CONSTRAINT lcomp_assessor CHECK (assessor IS NOT NULL OR grandfathered),
  CONSTRAINT lcomp_valid CHECK (valid_to >= assessed_on),
  CONSTRAINT lcomp_revoked CHECK ((revoked_at IS NULL) = (revoked_by IS NULL))
);
CREATE INDEX IF NOT EXISTS lab_competencies_user ON public.lab_competencies (hospital_id, user_id, test_code, assessed_on DESC);

CREATE OR REPLACE FUNCTION private.lab_competency_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' OR OLD.revoked_at IS NOT NULL
     OR (to_jsonb(NEW) - 'revoked_at' - 'revoked_by') IS DISTINCT FROM (to_jsonb(OLD) - 'revoked_at' - 'revoked_by') THEN
    RAISE EXCEPTION 'lab_competencies: a competency is only ever revoked, once; reassess with a new row';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS lab_competencies_guard ON public.lab_competencies;
CREATE TRIGGER lab_competencies_guard BEFORE UPDATE OR DELETE ON public.lab_competencies
  FOR EACH ROW EXECUTE FUNCTION private.lab_competency_guard();

DROP TRIGGER IF EXISTS audit_lab_competencies ON public.lab_competencies;
CREATE TRIGGER audit_lab_competencies AFTER INSERT OR UPDATE OR DELETE ON public.lab_competencies
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_changes();
ALTER TABLE public.lab_competencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lab_competencies FORCE ROW LEVEL SECURITY;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.lab_competencies FROM anon, authenticated;
GRANT SELECT ON public.lab_competencies TO medsync_clinical_reader;
-- The lab reads every competency; an operator reads their own.
DROP POLICY IF EXISTS lab_read ON public.lab_competencies;
CREATE POLICY lab_read ON public.lab_competencies FOR SELECT TO medsync_clinical_reader
  USING (hospital_id = (SELECT private.current_hospital_id())
         AND ((SELECT private.lab_reader()) OR user_id = (SELECT private.current_user_id())));
