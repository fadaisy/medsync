-- 0104 — Reference ranges and critical limits as signed, versioned sets per hospital (Lab Phase 1, ADRs
-- 0246–0247; gate-a-proposal §5, D-LAB1-09..-12, E-LAB1-02).
--
-- No value ships: every band and limit is typed by the hospital and signed by the laboratory lead and the
-- CSO, two different people (a recorded exception otherwise, D-LAB1-12). A version's bands or limits never
-- change once it leaves draft: an edit is a new draft, and the signed version stays in force until the new
-- one is signed. Ages are stored in days; `from` is inclusive, `to` exclusive (RR-4).
--
-- ADDITIVE and re-runnable. GATED: owner-applied (`npm run db:migrate -- 0104`).

-- ─── 1. Reference ranges ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.reference_range_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  test_id uuid NOT NULL REFERENCES public.test_catalogue(id) ON DELETE RESTRICT,
  concept_id text NOT NULL REFERENCES public.clinical_concepts(id) ON DELETE RESTRICT,
  unit_ucum text NOT NULL REFERENCES public.ucum_units(code) ON DELETE RESTRICT,
  version integer NOT NULL CHECK (version > 0),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','signed','superseded')),
  authored_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  lead_signed_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  lead_signed_at timestamptz,
  cso_signed_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  cso_signed_at timestamptz,
  exception_note text CHECK (exception_note IS NULL OR char_length(exception_note) BETWEEN 10 AND 500),
  in_force_from timestamptz,
  superseded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rrv_version UNIQUE (hospital_id, test_id, concept_id, version),
  CONSTRAINT rrv_signed_by_two CHECK (status = 'draft' OR (lead_signed_by IS NOT NULL AND cso_signed_by IS NOT NULL
    AND in_force_from IS NOT NULL AND (lead_signed_by <> cso_signed_by OR exception_note IS NOT NULL)))
);
CREATE UNIQUE INDEX IF NOT EXISTS rrv_one_signed ON public.reference_range_versions (hospital_id, test_id, concept_id)
  WHERE status = 'signed';

CREATE TABLE IF NOT EXISTS public.reference_range_bands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id uuid NOT NULL REFERENCES public.reference_range_versions(id) ON DELETE CASCADE,
  sex text NOT NULL CHECK (sex IN ('female','male','any')),
  age_from_days integer CHECK (age_from_days IS NULL OR age_from_days >= 0),
  age_to_days integer CHECK (age_to_days IS NULL OR age_to_days > 0),
  low numeric,
  high numeric,
  source text NOT NULL CHECK (char_length(source) BETWEEN 3 AND 500),
  CONSTRAINT rrb_a_bound CHECK (low IS NOT NULL OR high IS NOT NULL),
  CONSTRAINT rrb_order CHECK (low IS NULL OR high IS NULL OR low < high),
  CONSTRAINT rrb_ages CHECK (age_from_days IS NULL OR age_to_days IS NULL OR age_from_days < age_to_days)
);
CREATE INDEX IF NOT EXISTS rrb_version ON public.reference_range_bands (version_id);

-- ─── 2. Critical limits ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.critical_limit_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  version integer NOT NULL CHECK (version > 0),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','signed','superseded')),
  authored_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  lead_signed_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  lead_signed_at timestamptz,
  cso_signed_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  cso_signed_at timestamptz,
  exception_note text CHECK (exception_note IS NULL OR char_length(exception_note) BETWEEN 10 AND 500),
  in_force_from timestamptz,
  superseded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT clv_version UNIQUE (hospital_id, version),
  CONSTRAINT clv_signed_by_two CHECK (status = 'draft' OR (lead_signed_by IS NOT NULL AND cso_signed_by IS NOT NULL
    AND in_force_from IS NOT NULL AND (lead_signed_by <> cso_signed_by OR exception_note IS NOT NULL)))
);
CREATE UNIQUE INDEX IF NOT EXISTS clv_one_signed ON public.critical_limit_versions (hospital_id) WHERE status = 'signed';

CREATE TABLE IF NOT EXISTS public.critical_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id uuid NOT NULL REFERENCES public.critical_limit_versions(id) ON DELETE CASCADE,
  test_id uuid NOT NULL REFERENCES public.test_catalogue(id) ON DELETE RESTRICT,
  concept_id text NOT NULL REFERENCES public.clinical_concepts(id) ON DELETE RESTRICT,
  unit_ucum text NOT NULL REFERENCES public.ucum_units(code) ON DELETE RESTRICT,
  age_from_days integer CHECK (age_from_days IS NULL OR age_from_days >= 0),
  age_to_days integer CHECK (age_to_days IS NULL OR age_to_days > 0),
  low numeric,
  high numeric,
  reference_id text NOT NULL CHECK (char_length(reference_id) BETWEEN 1 AND 60),
  source text NOT NULL CHECK (char_length(source) BETWEEN 3 AND 500),
  CONSTRAINT cl_a_bound CHECK (low IS NOT NULL OR high IS NOT NULL),
  CONSTRAINT cl_order CHECK (low IS NULL OR high IS NULL OR low < high),
  CONSTRAINT cl_ages CHECK (age_from_days IS NULL OR age_to_days IS NULL OR age_from_days < age_to_days)
);
CREATE INDEX IF NOT EXISTS cl_version ON public.critical_limits (version_id, concept_id);

-- ─── 3. A set's contents are frozen once it leaves draft ─────────────────
CREATE OR REPLACE FUNCTION private.lab_signed_set_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE
  v_status text;
  v_version uuid := CASE WHEN TG_OP = 'DELETE' THEN OLD.version_id ELSE NEW.version_id END;
BEGIN
  IF TG_TABLE_NAME = 'reference_range_bands' THEN
    SELECT status INTO v_status FROM public.reference_range_versions WHERE id = v_version;
  ELSE
    SELECT status INTO v_status FROM public.critical_limit_versions WHERE id = v_version;
  END IF;
  IF v_status IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION '%: a % set is frozen once it leaves draft; start a new draft', TG_TABLE_NAME, v_status;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.version_id <> NEW.version_id THEN
    RAISE EXCEPTION '%: a row cannot move between versions', TG_TABLE_NAME;
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;
DROP TRIGGER IF EXISTS reference_range_bands_guard ON public.reference_range_bands;
CREATE TRIGGER reference_range_bands_guard BEFORE INSERT OR UPDATE OR DELETE ON public.reference_range_bands
  FOR EACH ROW EXECUTE FUNCTION private.lab_signed_set_guard();
DROP TRIGGER IF EXISTS critical_limits_guard ON public.critical_limits;
CREATE TRIGGER critical_limits_guard BEFORE INSERT OR UPDATE OR DELETE ON public.critical_limits
  FOR EACH ROW EXECUTE FUNCTION private.lab_signed_set_guard();

-- A version moves only forward: draft → signed → superseded; signatures are never removed.
CREATE OR REPLACE FUNCTION private.lab_version_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status <> 'draft' THEN RAISE EXCEPTION '%: only a draft may be deleted', TG_TABLE_NAME; END IF;
    RETURN OLD;
  END IF;
  IF OLD.status = 'superseded'
     OR (OLD.status = 'signed' AND NEW.status NOT IN ('signed','superseded'))
     OR (OLD.lead_signed_by IS NOT NULL AND NEW.lead_signed_by IS DISTINCT FROM OLD.lead_signed_by)
     OR (OLD.cso_signed_by IS NOT NULL AND NEW.cso_signed_by IS DISTINCT FROM OLD.cso_signed_by) THEN
    RAISE EXCEPTION '%: a version only moves forward and keeps its signatures', TG_TABLE_NAME;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS reference_range_versions_guard ON public.reference_range_versions;
CREATE TRIGGER reference_range_versions_guard BEFORE UPDATE OR DELETE ON public.reference_range_versions
  FOR EACH ROW EXECUTE FUNCTION private.lab_version_guard();
DROP TRIGGER IF EXISTS critical_limit_versions_guard ON public.critical_limit_versions;
CREATE TRIGGER critical_limit_versions_guard BEFORE UPDATE OR DELETE ON public.critical_limit_versions
  FOR EACH ROW EXECUTE FUNCTION private.lab_version_guard();
DROP TRIGGER IF EXISTS critical_response_versions_guard ON public.critical_response_versions;
CREATE TRIGGER critical_response_versions_guard BEFORE UPDATE OR DELETE ON public.critical_response_versions
  FOR EACH ROW EXECUTE FUNCTION private.lab_version_guard();

-- ─── 4. Audit and RLS (set-up data: no patient, hospital-scoped reads) ───
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['reference_range_versions','reference_range_bands','critical_limit_versions',
    'critical_limits'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS audit_%1$s ON public.%1$I', t);
    EXECUTE format('CREATE TRIGGER audit_%1$s AFTER INSERT OR UPDATE OR DELETE ON public.%1$I
      FOR EACH ROW EXECUTE FUNCTION public.audit_log_changes()', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.%I FROM anon, authenticated', t);
    EXECUTE format('GRANT SELECT ON public.%I TO medsync_clinical_reader', t);
  END LOOP;
END $$;

DROP POLICY IF EXISTS rrv_select ON public.reference_range_versions;
CREATE POLICY rrv_select ON public.reference_range_versions FOR SELECT TO medsync_clinical_reader
  USING (hospital_id = (SELECT private.current_hospital_id()));
DROP POLICY IF EXISTS rrb_select ON public.reference_range_bands;
CREATE POLICY rrb_select ON public.reference_range_bands FOR SELECT TO medsync_clinical_reader
  USING (EXISTS (SELECT 1 FROM public.reference_range_versions v WHERE v.id = version_id
                 AND v.hospital_id = (SELECT private.current_hospital_id())));
DROP POLICY IF EXISTS clv_select ON public.critical_limit_versions;
CREATE POLICY clv_select ON public.critical_limit_versions FOR SELECT TO medsync_clinical_reader
  USING (hospital_id = (SELECT private.current_hospital_id()));
DROP POLICY IF EXISTS cl_select ON public.critical_limits;
CREATE POLICY cl_select ON public.critical_limits FOR SELECT TO medsync_clinical_reader
  USING (EXISTS (SELECT 1 FROM public.critical_limit_versions v WHERE v.id = version_id
                 AND v.hospital_id = (SELECT private.current_hospital_id())));
