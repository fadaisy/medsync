-- 0103 — Fixed units and result snapshots (Lab Phase 1, ADRs 0245–0246; gate-a-proposal §5, D-LAB1-26).
--
--   1. ucum_units: the curated list offered in set-up. Codes, display and words only: no clinical
--      numbers. UCUM is © Regenstrief Institute; see THIRD-PARTY-NOTICES.md.
--   2. lab_component_measures: per hospital, per test, per component: result type, the one unit, decimal
--      places, an optional LOINC code (validated against loinc_codes) and an optional entry-check band
--      typed by the laboratory lead. A unit changes only through a new version (UN-4).
--   3. lab_result_snapshots: what was true when a value was released (Law 8): the value as entered (a
--      decimal, never a float), its unit, the measure version, the range band used and the flags. Append-only.
--
-- Nothing is converted, and no existing column changes: results before this slice keep their typed
-- unit and range (UN-8). ADDITIVE and re-runnable. GATED: owner-applied (`npm run db:migrate -- 0103`).

-- ─── 1. Curated UCUM units ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ucum_units (
  code text PRIMARY KEY CHECK (char_length(code) BETWEEN 1 AND 40),
  display text NOT NULL,
  words text NOT NULL
);
INSERT INTO public.ucum_units (code, display, words) VALUES
  ('mmol/L', 'mmol/L', 'millimoles per litre'),
  ('umol/L', 'µmol/L', 'micromoles per litre'),
  ('nmol/L', 'nmol/L', 'nanomoles per litre'),
  ('pmol/L', 'pmol/L', 'picomoles per litre'),
  ('mmol/mol', 'mmol/mol', 'millimoles per mole'),
  ('mg/dL', 'mg/dL', 'milligrams per decilitre'),
  ('mg/L', 'mg/L', 'milligrams per litre'),
  ('g/L', 'g/L', 'grams per litre'),
  ('g/dL', 'g/dL', 'grams per decilitre'),
  ('ug/L', 'µg/L', 'micrograms per litre'),
  ('ng/mL', 'ng/mL', 'nanograms per millilitre'),
  ('U/L', 'U/L', 'units per litre'),
  ('[IU]/L', 'IU/L', 'international units per litre'),
  ('m[IU]/L', 'mIU/L', 'milli-international units per litre'),
  ('10*9/L', '×10⁹/L', 'times ten to the ninth per litre'),
  ('10*12/L', '×10¹²/L', 'times ten to the twelfth per litre'),
  ('/uL', '/µL', 'per microlitre'),
  ('%', '%', 'per cent'),
  ('fL', 'fL', 'femtolitres'),
  ('pg', 'pg', 'picograms'),
  ('mm/h', 'mm/h', 'millimetres per hour'),
  ('s', 's', 'seconds'),
  ('{ratio}', 'ratio', 'ratio'),
  ('mL/min/{1.73_m2}', 'mL/min/1.73 m²', 'millilitres per minute per 1.73 square metres'),
  ('mg/mmol', 'mg/mmol', 'milligrams per millimole'),
  ('mmol/d', 'mmol/day', 'millimoles per day'),
  ('mosm/kg', 'mOsm/kg', 'milliosmoles per kilogram'),
  ('kU/L', 'kU/L', 'kilounits per litre')
ON CONFLICT (code) DO NOTHING;

-- ─── 2. Measurement facts per component (UN-1..UN-7) ─────────────────────
CREATE TABLE IF NOT EXISTS public.lab_component_measures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  test_id uuid NOT NULL REFERENCES public.test_catalogue(id) ON DELETE RESTRICT,
  concept_id text NOT NULL REFERENCES public.clinical_concepts(id) ON DELETE RESTRICT,
  version integer NOT NULL CHECK (version > 0),
  result_type text NOT NULL CHECK (result_type IN ('number','coded','text')),
  unit_ucum text REFERENCES public.ucum_units(code) ON DELETE RESTRICT,
  unit_display text,
  decimal_places smallint CHECK (decimal_places IS NULL OR decimal_places BETWEEN 0 AND 6),
  loinc_code text REFERENCES public.loinc_codes(code) ON DELETE RESTRICT,
  entry_check_low numeric,
  entry_check_high numeric,
  superseded_by uuid REFERENCES public.lab_component_measures(id) ON DELETE RESTRICT,
  authored_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT lcm_version UNIQUE (hospital_id, test_id, concept_id, version),
  -- A number has one unit, shown as typed in the curated list (UN-1).
  CONSTRAINT lcm_number_unit CHECK (result_type <> 'number' OR (unit_ucum IS NOT NULL AND unit_display IS NOT NULL
    AND decimal_places IS NOT NULL)),
  CONSTRAINT lcm_entry_check CHECK (entry_check_low IS NULL OR entry_check_high IS NULL OR entry_check_low < entry_check_high)
);
CREATE UNIQUE INDEX IF NOT EXISTS lcm_current ON public.lab_component_measures (hospital_id, test_id, concept_id)
  WHERE superseded_by IS NULL;

-- A measure's facts never change once written; a new version supersedes it (UN-4). Only superseded_by
-- may be set, once.
CREATE OR REPLACE FUNCTION private.lab_measure_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'lab_component_measures: measures are never deleted; create a new version';
  END IF;
  IF (to_jsonb(NEW) - 'superseded_by') IS DISTINCT FROM (to_jsonb(OLD) - 'superseded_by')
     OR OLD.superseded_by IS NOT NULL THEN
    RAISE EXCEPTION 'lab_component_measures: a measure is immutable; create a new version';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS lab_component_measures_guard ON public.lab_component_measures;
CREATE TRIGGER lab_component_measures_guard BEFORE UPDATE OR DELETE ON public.lab_component_measures
  FOR EACH ROW EXECUTE FUNCTION private.lab_measure_guard();

-- ─── 3. Snapshots: what was true at release (Law 8, UN-2, RR-7, FL-3) ────
CREATE TABLE IF NOT EXISTS public.lab_result_snapshots (
  observation_id uuid PRIMARY KEY REFERENCES public.clinical_observations(id) ON DELETE RESTRICT,
  report_id uuid NOT NULL REFERENCES public.diagnostic_reports(id) ON DELETE RESTRICT,
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  patient_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  measure_id uuid NOT NULL REFERENCES public.lab_component_measures(id) ON DELETE RESTRICT,
  measure_version integer NOT NULL,
  value_decimal numeric NOT NULL,
  value_text text NOT NULL,
  unit_ucum text NOT NULL,
  unit_display text NOT NULL,
  range_state text NOT NULL CHECK (range_state IN ('signed','unsigned','no_band_for_age','sex_or_age_missing',
    'no_signed_range')),
  range_low numeric,
  range_high numeric,
  range_band_id uuid,
  range_version_id uuid,
  flag_computed text CHECK (flag_computed IN ('low','high','normal')),
  flag_final text CHECK (flag_final IN ('low','high','normal')),
  flag_change_reason text CHECK (flag_change_reason IS NULL OR char_length(flag_change_reason) BETWEEN 3 AND 200),
  flag_changed_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  entry_check_confirmed_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT lrs_flag_change CHECK ((flag_final IS DISTINCT FROM flag_computed)
    = (flag_change_reason IS NOT NULL AND flag_changed_by IS NOT NULL)),
  CONSTRAINT lrs_signed_band CHECK (range_state <> 'signed' OR range_band_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS lrs_report ON public.lab_result_snapshots (report_id);
DROP TRIGGER IF EXISTS lab_result_snapshots_no_mutation ON public.lab_result_snapshots;
CREATE TRIGGER lab_result_snapshots_no_mutation BEFORE UPDATE OR DELETE ON public.lab_result_snapshots
  FOR EACH ROW EXECUTE FUNCTION public.block_modify_append_only();

-- ─── 4. Audit and RLS ────────────────────────────────────────────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['lab_component_measures','lab_result_snapshots'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS audit_%1$s ON public.%1$I', t);
    EXECUTE format('CREATE TRIGGER audit_%1$s AFTER INSERT OR UPDATE OR DELETE ON public.%1$I
      FOR EACH ROW EXECUTE FUNCTION public.audit_log_changes()', t);
  END LOOP;
  FOREACH t IN ARRAY ARRAY['ucum_units','lab_component_measures','lab_result_snapshots'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.%I FROM anon, authenticated', t);
  END LOOP;
END $$;

GRANT SELECT ON public.ucum_units TO authenticated, medsync_clinical_reader;
DROP POLICY IF EXISTS ucum_units_select ON public.ucum_units;
CREATE POLICY ucum_units_select ON public.ucum_units FOR SELECT TO authenticated, medsync_clinical_reader USING (true);

GRANT SELECT ON public.lab_component_measures TO medsync_clinical_reader;
DROP POLICY IF EXISTS lcm_select ON public.lab_component_measures;
CREATE POLICY lcm_select ON public.lab_component_measures FOR SELECT TO medsync_clinical_reader
  USING (hospital_id = (SELECT private.current_hospital_id()));

GRANT SELECT ON public.lab_result_snapshots TO medsync_clinical_reader;
DROP POLICY IF EXISTS lrs_select ON public.lab_result_snapshots;
CREATE POLICY lrs_select ON public.lab_result_snapshots FOR SELECT TO medsync_clinical_reader
  USING (hospital_id = (SELECT private.current_hospital_id())
         AND patient_user_id IN (SELECT private.accessible_patient_ids()));
