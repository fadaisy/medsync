-- 0107 — Lab catalogue v2: signed configuration, research drafts, methods, analyser profiles, interpretation
-- snapshots (Lab Phase 2, ADRs 0251–0254; docs/lab/phase-2/gate-a-proposal.md §3).
--
--   1. ucum_units: the units the accepted concepts need (F-1, F-3). Codes and words only.
--   2. lab_signed_configs: one two-signature, versioned store for decision schemes, flag bases, elevation,
--      the HIV algorithm, NCD field mappings, REF entries and the concept addendum (P1). A payload is frozen
--      once it leaves draft; the same two-different-people rule as 0104.
--   3. Research drafts on Phase 1's range store: provenance, the verification blocker and its check, and a
--      rejected alternative's reason (RI-2, RI-5, RI-6).
--   4. lab_component_measures: method and IDMS traceability, versioned with the measure (ME-1, P2).
--   5. lab_settings: eGFR reporting, payment mode, the high-risk procedure link.
--   6. test_catalogue: restricted class (CC-8) and the hub offering code (OM-1).
--   7. analyser_profiles (AP-*), research_imports (RI-1), interpretation on the snapshot (DS-9).
--
-- No clinical number ships here: every range, cut-off, elevation and constant arrives as a draft and is
-- signed in the product. ADDITIVE and re-runnable. GATED: owner-applied (`npm run db:migrate -- 0107`).

-- ─── 1. Units ────────────────────────────────────────────────────────────
INSERT INTO public.ucum_units (code, display, words) VALUES
  ('{copies}/mL', 'copies/mL', 'copies per millilitre'),
  ('{log_copies}/mL', 'log₁₀ copies/mL', 'log ten copies per millilitre'),
  ('ng/L', 'ng/L', 'nanograms per litre'),
  ('mg/L{FEU}', 'mg/L FEU', 'milligrams per litre, fibrinogen-equivalent units'),
  ('mg/L{DDU}', 'mg/L DDU', 'milligrams per litre, D-dimer units'),
  ('[pH]', 'pH', 'pH'),
  ('d', 'days', 'days'),
  ('{count}', 'count', 'count')
ON CONFLICT (code) DO NOTHING;

-- ─── 2. Signed configuration ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.lab_signed_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid REFERENCES public.hospitals(id) ON DELETE CASCADE,   -- NULL: global (REF entries, addendum)
  kind text NOT NULL CHECK (kind IN ('scheme','flag_basis','elevation','hiv_algorithm','ncd_mapping','ref',
    'addendum')),
  key text NOT NULL CHECK (char_length(key) BETWEEN 1 AND 80),
  version integer NOT NULL CHECK (version > 0),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','signed','superseded')),
  payload jsonb NOT NULL,
  authored_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  lead_signed_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  lead_signed_at timestamptz,
  cso_signed_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  cso_signed_at timestamptz,
  exception_note text CHECK (exception_note IS NULL OR char_length(exception_note) BETWEEN 10 AND 500),
  in_force_from timestamptz,
  superseded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT lsc_signed_by_two CHECK (status = 'draft' OR (lead_signed_by IS NOT NULL AND cso_signed_by IS NOT NULL
    AND in_force_from IS NOT NULL AND (lead_signed_by <> cso_signed_by OR exception_note IS NOT NULL)))
);
CREATE UNIQUE INDEX IF NOT EXISTS lsc_version
  ON public.lab_signed_configs (coalesce(hospital_id, '00000000-0000-0000-0000-000000000000'::uuid), kind, key, version);
CREATE UNIQUE INDEX IF NOT EXISTS lsc_one_signed
  ON public.lab_signed_configs (coalesce(hospital_id, '00000000-0000-0000-0000-000000000000'::uuid), kind, key)
  WHERE status = 'signed';

-- Forward only, signatures kept (0104's guard), and the payload frozen once out of draft.
DROP TRIGGER IF EXISTS lab_signed_configs_guard ON public.lab_signed_configs;
CREATE TRIGGER lab_signed_configs_guard BEFORE UPDATE OR DELETE ON public.lab_signed_configs
  FOR EACH ROW EXECUTE FUNCTION private.lab_version_guard();
CREATE OR REPLACE FUNCTION private.lab_config_payload_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF OLD.status <> 'draft' AND NEW.payload IS DISTINCT FROM OLD.payload THEN
    RAISE EXCEPTION 'lab_signed_configs: a signed payload is frozen; start a new draft';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS lab_signed_configs_payload ON public.lab_signed_configs;
CREATE TRIGGER lab_signed_configs_payload BEFORE UPDATE ON public.lab_signed_configs
  FOR EACH ROW EXECUTE FUNCTION private.lab_config_payload_guard();

-- ─── 3. Research drafts on the Phase 1 range store ───────────────────────
ALTER TABLE public.reference_range_versions ADD COLUMN IF NOT EXISTS import_hash text;
ALTER TABLE public.reference_range_bands
  ADD COLUMN IF NOT EXISTS provenance jsonb,
  ADD COLUMN IF NOT EXISTS verification text,
  ADD COLUMN IF NOT EXISTS check_note text CHECK (check_note IS NULL OR char_length(check_note) BETWEEN 3 AND 500),
  ADD COLUMN IF NOT EXISTS checked_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS checked_at timestamptz,
  ADD COLUMN IF NOT EXISTS rejected_reason text CHECK (rejected_reason IS NULL OR char_length(rejected_reason) BETWEEN 3 AND 300),
  ADD COLUMN IF NOT EXISTS method_code text CHECK (method_code IS NULL OR method_code ~ '^[a-z0-9_]{2,40}$');  -- ME-2
-- A band with an open verification problem cannot be in a signed set (RI-5): the check must be recorded.
CREATE OR REPLACE FUNCTION private.lab_version_checks_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.status = 'signed' AND OLD.status = 'draft' AND EXISTS (
       SELECT 1 FROM public.reference_range_bands b
        WHERE b.version_id = NEW.id AND b.rejected_reason IS NULL
          AND b.verification IS NOT NULL AND b.checked_by IS NULL) THEN
    RAISE EXCEPTION 'reference_range_versions: a band''s verification check is not recorded';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS reference_range_versions_checks ON public.reference_range_versions;
CREATE TRIGGER reference_range_versions_checks BEFORE UPDATE ON public.reference_range_versions
  FOR EACH ROW EXECUTE FUNCTION private.lab_version_checks_guard();

-- ─── 4. Method on the measure (versioned with it) ────────────────────────
ALTER TABLE public.lab_component_measures
  ADD COLUMN IF NOT EXISTS method_code text CHECK (method_code IS NULL OR method_code ~ '^[a-z0-9_]{2,40}$'),
  ADD COLUMN IF NOT EXISTS idms_traceable boolean;

-- ─── 5. Lab settings ─────────────────────────────────────────────────────
ALTER TABLE public.lab_settings
  ADD COLUMN IF NOT EXISTS report_egfr boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS payment_mode text NOT NULL DEFAULT 'off' CHECK (payment_mode IN ('off','inform','hold')),
  ADD COLUMN IF NOT EXISTS high_risk_procedure text
    CHECK (high_risk_procedure IS NULL OR char_length(high_risk_procedure) BETWEEN 3 AND 300);

-- ─── 6. Test catalogue: restricted class and hub link ────────────────────
ALTER TABLE public.test_catalogue
  ADD COLUMN IF NOT EXISTS restricted_class text
    CHECK (restricted_class IS NULL OR restricted_class IN ('hiv','tb','mental_health','sexual_reproductive_health')),
  ADD COLUMN IF NOT EXISTS offering_code text CHECK (offering_code IS NULL OR offering_code ~ '^[A-Za-z0-9._-]{1,40}$');
-- CC-8 with CrAg kept restricted (P9). Only the default menu (hospital_id NULL) and only while unset: a
-- hospital's own row and a class the CSO has since changed are never touched.
UPDATE public.test_catalogue t SET restricted_class = v.cls
  FROM (VALUES ('test.hiv_rapid','hiv'), ('test.hiv_viral_load','hiv'), ('test.cd4','hiv'), ('test.crag','hiv'),
               ('test.tb_xpert','tb'), ('test.tb_lam','tb'), ('test.sputum_afb','tb'),
               ('test.syphilis','sexual_reproductive_health'),
               ('test.pregnancy_urine','sexual_reproductive_health')) AS v(code, cls)
 WHERE t.code = v.code AND t.hospital_id IS NULL AND t.restricted_class IS NULL;

-- ─── 7. Analyser profiles, imports, interpretation snapshots ─────────────
CREATE TABLE IF NOT EXISTS public.analyser_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  test_id uuid NOT NULL REFERENCES public.test_catalogue(id) ON DELETE RESTRICT,
  model text NOT NULL CHECK (char_length(model) BETWEEN 2 AND 80),
  bench text CHECK (bench IS NULL OR char_length(bench) BETWEEN 1 AND 60),
  kind text NOT NULL CHECK (kind IN ('five_part','three_part','chemistry','other')),
  state text NOT NULL DEFAULT 'draft' CHECK (state IN ('draft','in_use','retired')),
  mappings jsonb NOT NULL DEFAULT '[]',          -- [{code, concept, visibility: clinician|lab_only|never}]
  open_checks jsonb NOT NULL DEFAULT '[]',       -- [{code, question, resolution?, resolved_by?}]
  verified_concepts text[] NOT NULL DEFAULT '{}',
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  activated_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  activated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
-- One profile in use per test and bench (AP-5 pins the one in use at receipt).
CREATE UNIQUE INDEX IF NOT EXISTS analyser_profiles_in_use
  ON public.analyser_profiles (hospital_id, test_id, coalesce(bench, '')) WHERE state = 'in_use';
-- An in-use profile's mapping never changes; retire it and make a new one.
CREATE OR REPLACE FUNCTION private.analyser_profile_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'analyser_profiles: never deleted; retire it'; END IF;
  IF OLD.state = 'retired' OR (OLD.state = 'in_use' AND (NEW.state NOT IN ('in_use','retired')
      OR NEW.mappings IS DISTINCT FROM OLD.mappings OR NEW.verified_concepts IS DISTINCT FROM OLD.verified_concepts)) THEN
    RAISE EXCEPTION 'analyser_profiles: a profile in use is frozen; retire it and make a new one';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS analyser_profiles_guard ON public.analyser_profiles;
CREATE TRIGGER analyser_profiles_guard BEFORE UPDATE OR DELETE ON public.analyser_profiles
  FOR EACH ROW EXECUTE FUNCTION private.analyser_profile_guard();

CREATE TABLE IF NOT EXISTS public.research_imports (
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  hash text NOT NULL CHECK (hash ~ '^[0-9a-f]{64}$'),
  imported_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  imported_at timestamptz NOT NULL DEFAULT now(),
  report jsonb NOT NULL,
  PRIMARY KEY (hospital_id, hash)
);
DROP TRIGGER IF EXISTS research_imports_no_mutation ON public.research_imports;
CREATE TRIGGER research_imports_no_mutation BEFORE UPDATE OR DELETE ON public.research_imports
  FOR EACH ROW EXECUTE FUNCTION public.block_modify_append_only();

ALTER TABLE public.lab_result_snapshots
  ADD COLUMN IF NOT EXISTS interpretation jsonb,
  ADD COLUMN IF NOT EXISTS profile_id uuid REFERENCES public.analyser_profiles(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS method_code text,
  ADD COLUMN IF NOT EXISTS lab_only boolean NOT NULL DEFAULT false;

-- ─── 8. Audit and RLS (set-up data: hospital-scoped reads; writes only as the clinical writer) ─
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['lab_signed_configs','analyser_profiles','research_imports'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS audit_%1$s ON public.%1$I', t);
    EXECUTE format('CREATE TRIGGER audit_%1$s AFTER INSERT OR UPDATE OR DELETE ON public.%1$I
      FOR EACH ROW EXECUTE FUNCTION public.audit_log_changes()', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.%I FROM anon, authenticated', t);
    EXECUTE format('GRANT SELECT ON public.%I TO medsync_clinical_reader', t);
  END LOOP;
END $$;
DROP POLICY IF EXISTS lsc_select ON public.lab_signed_configs;
CREATE POLICY lsc_select ON public.lab_signed_configs FOR SELECT TO medsync_clinical_reader
  USING (hospital_id IS NULL OR hospital_id = (SELECT private.current_hospital_id()));
DROP POLICY IF EXISTS ap_select ON public.analyser_profiles;
CREATE POLICY ap_select ON public.analyser_profiles FOR SELECT TO medsync_clinical_reader
  USING (hospital_id = (SELECT private.current_hospital_id()));
DROP POLICY IF EXISTS ri_select ON public.research_imports;
CREATE POLICY ri_select ON public.research_imports FOR SELECT TO medsync_clinical_reader
  USING (hospital_id = (SELECT private.current_hospital_id()));
