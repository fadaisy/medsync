-- 0171 — Lab test menu v2: set up tests, not results (docs/lab/test-menu-v2/gate-a-proposal.md §1; ADRs 0350–0355).
--
--   1. test_catalogue: the catalogue facts a hospital inherits (TM-2). Changed only through a signed addendum
--      (0172 fills them). `specimen` and `tube` are the Ugandan wording; specimen_type and container stay enum keys.
--   2. diagnostic_offerings: re-keyed by test id for the lab (TM-3; code = test_catalogue.code), with a section
--      override and the stated turnaround in minutes (operational, never a clinical target: D-SVC-10, OM-5).
--   3. lab_settings.hidden_sections (TM-5).
--   4. lab_order_profiles (TM-10) and lab_catalogue_requests (TM-11).
--
-- No clinical number. loinc_codes is unchanged apart from a comment: it is a code reference, never a menu (ADR 0355).
-- ADDITIVE and re-runnable. GATED: owner-applied (`npm run db:migrate`), before 0172.

-- ─── 1. Catalogue facts on the test ──────────────────────────────────────
ALTER TABLE public.test_catalogue
  ADD COLUMN IF NOT EXISTS section text CHECK (section IS NULL OR section IN ('haematology','blood_transfusion',
    'clinical_chemistry','immunology_serology','microbiology','parasitology','molecular','histopathology_cytology')),
  ADD COLUMN IF NOT EXISTS aliases text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS specimen text CHECK (specimen IS NULL OR char_length(specimen) <= 200),
  ADD COLUMN IF NOT EXISTS tube text CHECK (tube IS NULL OR char_length(tube) <= 200),
  ADD COLUMN IF NOT EXISTS order_loinc text CHECK (order_loinc IS NULL OR order_loinc ~ '^[0-9]{1,7}-[0-9]$'),
  ADD COLUMN IF NOT EXISTS min_level text CHECK (min_level IS NULL OR min_level IN ('HC II','HC III','HC IV','GH','RRH',
    'NRH','Reference')),
  ADD COLUMN IF NOT EXISTS level_basis jsonb,
  ADD COLUMN IF NOT EXISTS usual_route text CHECK (usual_route IS NULL OR usual_route IN ('in_house','referred')),
  ADD COLUMN IF NOT EXISTS refer_to text CHECK (refer_to IS NULL OR refer_to IN ('CPHL','NTRL','UVRI','UBTS','UCI',
    'private','MAK_PATH')),
  ADD COLUMN IF NOT EXISTS kit_dependent_ranges boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS advisory text CHECK (advisory IS NULL OR char_length(advisory) <= 300),
  ADD COLUMN IF NOT EXISTS offer_by_default boolean NOT NULL DEFAULT true;

-- ─── 2. The offering, per test ───────────────────────────────────────────
ALTER TABLE public.diagnostic_offerings
  ADD COLUMN IF NOT EXISTS section_override text CHECK (section_override IS NULL OR section_override IN ('haematology',
    'blood_transfusion','clinical_chemistry','immunology_serology','microbiology','parasitology','molecular',
    'histopathology_cytology')),
  ADD COLUMN IF NOT EXISTS stated_turnaround_minutes integer
    CHECK (stated_turnaround_minutes IS NULL OR stated_turnaround_minutes BETWEEN 1 AND 129600);

-- ─── 3. Sections a hospital does not run ─────────────────────────────────
ALTER TABLE public.lab_settings
  ADD COLUMN IF NOT EXISTS hidden_sections text[] NOT NULL DEFAULT '{}';

-- ─── 4. Profiles and requests ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.lab_order_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(name) BETWEEN 2 AND 80),
  note text CHECK (note IS NULL OR char_length(note) <= 300),
  test_codes text[] NOT NULL CHECK (cardinality(test_codes) BETWEEN 1 AND 30),
  active boolean NOT NULL DEFAULT true,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  updated_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  client_key text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS lab_order_profiles_name_uidx ON public.lab_order_profiles (hospital_id, lower(name))
  WHERE active;

CREATE TABLE IF NOT EXISTS public.lab_catalogue_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  requested_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  name text NOT NULL CHECK (char_length(name) BETWEEN 2 AND 120),
  purpose text NOT NULL CHECK (char_length(purpose) BETWEEN 3 AND 500),
  specimen text NOT NULL CHECK (char_length(specimen) BETWEEN 2 AND 120),
  route text NOT NULL CHECK (route IN ('in_house','referred')),
  reference text CHECK (reference IS NULL OR char_length(reference) <= 300),
  state text NOT NULL DEFAULT 'new' CHECK (state IN ('new','in_review','added','declined')),
  reason text CHECK (reason IS NULL OR char_length(reason) BETWEEN 3 AND 500),
  test_code text CHECK (test_code IS NULL OR test_code ~ '^test\.[a-z0-9_]{2,60}$'),
  decided_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  decided_at timestamptz,
  client_key text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT lcr_decided CHECK (
    (state <> 'declined' OR reason IS NOT NULL) AND (state <> 'added' OR test_code IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS lab_catalogue_requests_hospital ON public.lab_catalogue_requests (hospital_id, created_at);

-- ─── 5. RLS, audit, grants: reads scoped, writes only through the server ─
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['lab_order_profiles','lab_catalogue_requests'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS audit_%1$s ON public.%1$I', t);
    EXECUTE format('CREATE TRIGGER audit_%1$s AFTER INSERT OR UPDATE OR DELETE ON public.%1$I
      FOR EACH ROW EXECUTE FUNCTION public.audit_log_changes()', t);
    EXECUTE format('DROP TRIGGER IF EXISTS set_updated_at_%1$s ON public.%1$I', t);
    EXECUTE format('CREATE TRIGGER set_updated_at_%1$s BEFORE UPDATE ON public.%1$I
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.%I FROM anon, authenticated', t);
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated, medsync_clinical_reader', t);
  END LOOP;
END $$;

DROP POLICY IF EXISTS lop_select ON public.lab_order_profiles;
CREATE POLICY lop_select ON public.lab_order_profiles FOR SELECT TO authenticated USING (
  public.user_has_role('superadmin') OR public.user_has_role('hospital_admin', hospital_id)
  OR public.is_hospital_staff(hospital_id));
DROP POLICY IF EXISTS lop_select_reader ON public.lab_order_profiles;
CREATE POLICY lop_select_reader ON public.lab_order_profiles FOR SELECT TO medsync_clinical_reader
  USING (hospital_id = (SELECT private.current_hospital_id()));

DROP POLICY IF EXISTS lcr_select ON public.lab_catalogue_requests;
CREATE POLICY lcr_select ON public.lab_catalogue_requests FOR SELECT TO authenticated USING (
  public.user_has_role('superadmin') OR public.user_has_role('hospital_admin', hospital_id)
  OR public.is_hospital_staff(hospital_id));
DROP POLICY IF EXISTS lcr_select_reader ON public.lab_catalogue_requests;
CREATE POLICY lcr_select_reader ON public.lab_catalogue_requests FOR SELECT TO medsync_clinical_reader
  USING (hospital_id = (SELECT private.current_hospital_id()));

COMMENT ON TABLE public.loinc_codes IS
  'A code reference (LOINC terms and names). Never a menu: hospitals set up catalogue tests (ADR 0355).';
