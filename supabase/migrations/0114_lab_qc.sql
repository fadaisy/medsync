-- 0114 — Lab quality control: one append-only row per QC run (values, rule breaks and the decision), the QC
-- status cache per analyser and component, kit, stain and device control checks, nonconformities with their
-- events and look-back items, and the held components of a released report
-- (Lab Phase 3, gate-a-proposal §3.2, §5.2–§5.4, P5–P7, E-LAB3-03, -04, -07, -08; D-LAB3-01, -08, -14).
--
-- QC plans, targets, SDs and rules are signed configuration (lab_signed_configs kind qc_plan / qc_policy, 0112);
-- no value ships here. ADDITIVE and re-runnable. GATED: owner-applied (`npm run db:migrate -- 0114`).

CREATE TABLE IF NOT EXISTS public.lab_qc_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  device_id uuid NOT NULL REFERENCES public.devices(id) ON DELETE RESTRICT,
  concept_id text NOT NULL,
  plan_config_id uuid NOT NULL REFERENCES public.lab_signed_configs(id) ON DELETE RESTRICT,
  plan_version integer NOT NULL,
  "values" jsonb NOT NULL,                    -- [{level, lotId, value, z}]
  breaks jsonb NOT NULL DEFAULT '[]',         -- [{rule, kind, scope, level?, runIds}]
  decision text NOT NULL CHECK (decision IN ('accepted','warning','rejected')),
  first_step text CHECK (first_step IS NULL OR char_length(first_step) BETWEEN 3 AND 300),
  note text CHECK (note IS NULL OR char_length(note) BETWEEN 1 AND 1000),
  run_at timestamptz NOT NULL,
  recorded_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  client_key text UNIQUE,
  CONSTRAINT lqr_first_step CHECK (decision <> 'rejected' OR first_step IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS lab_qc_runs_series ON public.lab_qc_runs (device_id, concept_id, run_at DESC);

-- A cache, rewritten with each run (E-LAB3-04). `no_plan` and `not_run_in_window` are computed, never stored.
CREATE TABLE IF NOT EXISTS public.lab_qc_status (
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  device_id uuid NOT NULL REFERENCES public.devices(id) ON DELETE RESTRICT,
  concept_id text NOT NULL,
  status text NOT NULL CHECK (status IN ('passed','warning','failed','provisional_target')),
  run_id uuid REFERENCES public.lab_qc_runs(id) ON DELETE RESTRICT,
  plan_config_id uuid REFERENCES public.lab_signed_configs(id) ON DELETE RESTRICT,
  held boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (hospital_id, device_id, concept_id)
);

CREATE TABLE IF NOT EXISTS public.lab_control_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  subject text NOT NULL CHECK (subject IN ('kit','stain','device')),
  item_id uuid REFERENCES public.lab_stock_items(id) ON DELETE RESTRICT,
  lot_id uuid REFERENCES public.lab_stock_lots(id) ON DELETE RESTRICT,
  device_id uuid REFERENCES public.devices(id) ON DELETE RESTRICT,
  trigger text NOT NULL CHECK (trigger ~ '^[a-z_]{2,40}$'),
  controls jsonb NOT NULL,                    -- [{name, expected, observed, pass}]
  outcome text NOT NULL CHECK (outcome IN ('pass','fail')),
  hmis_iqc boolean NOT NULL DEFAULT false,
  operator uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  at timestamptz NOT NULL DEFAULT now(),
  client_key text UNIQUE,
  CONSTRAINT lcc_subject CHECK ((subject = 'device') = (device_id IS NOT NULL) AND (subject = 'device' OR item_id IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS lab_control_checks_device ON public.lab_control_checks (device_id, at DESC) WHERE device_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.lab_nonconformities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  number text NOT NULL CHECK (number ~ '^NC-[0-9]{4}-[0-9]{3,}$'),
  source text NOT NULL CHECK (source IN ('qc_reject','kit_qc_fail','eqa_unacceptable','temperature','lot_rejected',
    'equipment','complaint','specimen','other')),
  source_ref text CHECK (source_ref IS NULL OR char_length(source_ref) BETWEEN 1 AND 120),
  subject_device_id uuid REFERENCES public.devices(id) ON DELETE RESTRICT,
  subject_concept_id text,
  title text NOT NULL CHECK (char_length(title) BETWEEN 3 AND 160),
  what_happened text NOT NULL CHECK (char_length(what_happened) BETWEEN 3 AND 2000),
  risk_text text CHECK (risk_text IS NULL OR char_length(risk_text) BETWEEN 3 AND 2000),
  testing_halted boolean NOT NULL DEFAULT false,
  owner uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  state text NOT NULL DEFAULT 'open' CHECK (state IN ('open','closed')),
  cause_category text CHECK (cause_category IS NULL OR cause_category ~ '^[a-z_]{2,40}$'),
  effectiveness_plan text CHECK (effectiveness_plan IS NULL OR char_length(effectiveness_plan) BETWEEN 3 AND 1000),
  effectiveness_met boolean,
  opened_at timestamptz NOT NULL DEFAULT now(),
  opened_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,     -- NULL: MedSync
  resumed_at timestamptz,
  resumed_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  closed_at timestamptz,
  closed_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  UNIQUE (hospital_id, number),
  CONSTRAINT lnc_resumed CHECK ((resumed_at IS NULL) = (resumed_by IS NULL)),
  CONSTRAINT lnc_closed CHECK ((state = 'closed') = (closed_at IS NOT NULL AND closed_by IS NOT NULL)
    AND (state <> 'closed' OR (cause_category IS NOT NULL AND effectiveness_met IS TRUE)))
);
-- What happened stays as opened; a closed nonconformity is frozen; nothing is deleted (D-LAB3-14).
CREATE OR REPLACE FUNCTION private.lab_nc_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE frozen text[] := ARRAY['id','hospital_id','number','source','source_ref','subject_device_id',
  'subject_concept_id','title','what_happened','opened_at','opened_by'];
BEGIN
  IF TG_OP = 'DELETE' OR OLD.state = 'closed' OR EXISTS (
       SELECT 1 FROM unnest(frozen) k WHERE to_jsonb(NEW) -> k IS DISTINCT FROM to_jsonb(OLD) -> k) THEN
    RAISE EXCEPTION 'lab_nonconformities: what was opened is kept; a closed nonconformity is frozen';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS lab_nonconformities_guard ON public.lab_nonconformities;
CREATE TRIGGER lab_nonconformities_guard BEFORE UPDATE OR DELETE ON public.lab_nonconformities
  FOR EACH ROW EXECUTE FUNCTION private.lab_nc_guard();

CREATE TABLE IF NOT EXISTS public.lab_nc_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nc_id uuid NOT NULL REFERENCES public.lab_nonconformities(id) ON DELETE RESTRICT,
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  kind text NOT NULL CHECK (kind IN ('action_added','action_updated','linked','notified','resumed','closed','note')),
  payload jsonb NOT NULL DEFAULT '{}',
  actor uuid REFERENCES auth.users(id) ON DELETE RESTRICT,     -- NULL: MedSync
  at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS lab_nc_events_nc ON public.lab_nc_events (nc_id, at);

-- The look-back belongs to its nonconformity (NC-3). Patient rows: read only with access to the patient.
CREATE TABLE IF NOT EXISTS public.lab_lookback_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nc_id uuid NOT NULL REFERENCES public.lab_nonconformities(id) ON DELETE RESTRICT,
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  patient_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  report_id uuid NOT NULL REFERENCES public.diagnostic_reports(id) ON DELETE RESTRICT,
  observation_id uuid NOT NULL REFERENCES public.clinical_observations(id) ON DELETE RESTRICT,
  released_at timestamptz NOT NULL,
  value numeric NOT NULL,
  sort text NOT NULL CHECK (sort IN ('flag_might_change','critical_nearby','unchanged')),
  decision text CHECK (decision IS NULL OR decision IN ('stands','repeat','amend')),
  decided_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  decided_at timestamptz,
  amendment_report_id uuid REFERENCES public.diagnostic_reports(id) ON DELETE RESTRICT,
  UNIQUE (nc_id, observation_id),
  CONSTRAINT lli_decided CHECK ((decision IS NULL) = (decided_by IS NULL) AND (decision IS NULL) = (decided_at IS NULL)),
  CONSTRAINT lli_amend CHECK (amendment_report_id IS NULL OR decision = 'amend')
);
-- The decision (and its amendment) is set once; nothing else changes and nothing is deleted.
CREATE OR REPLACE FUNCTION private.lab_lookback_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' OR OLD.decision IS NOT NULL
     OR (to_jsonb(NEW) - 'decision' - 'decided_by' - 'decided_at' - 'amendment_report_id')
        IS DISTINCT FROM (to_jsonb(OLD) - 'decision' - 'decided_by' - 'decided_at' - 'amendment_report_id') THEN
    RAISE EXCEPTION 'lab_lookback_items: a look-back item is decided once';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS lab_lookback_items_guard ON public.lab_lookback_items;
CREATE TRIGGER lab_lookback_items_guard BEFORE UPDATE OR DELETE ON public.lab_lookback_items
  FOR EACH ROW EXECUTE FUNCTION private.lab_lookback_guard();

-- E-LAB3-08: components held for QC stay `preliminary` inside a `final` report; a completion version releases them.
ALTER TABLE public.diagnostic_reports ADD COLUMN IF NOT EXISTS qc_held text[];

-- ─── Append-only, audit, RLS ─────────────────────────────────────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['lab_qc_runs','lab_control_checks','lab_nc_events'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %1$s_no_mutation ON public.%1$I', t);
    EXECUTE format('CREATE TRIGGER %1$s_no_mutation BEFORE UPDATE OR DELETE ON public.%1$I
      FOR EACH ROW EXECUTE FUNCTION public.block_modify_append_only()', t);
  END LOOP;
  FOREACH t IN ARRAY ARRAY['lab_qc_runs','lab_qc_status','lab_control_checks','lab_nonconformities','lab_nc_events',
    'lab_lookback_items'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS audit_%1$s ON public.%1$I', t);
    EXECUTE format('CREATE TRIGGER audit_%1$s AFTER INSERT OR UPDATE OR DELETE ON public.%1$I
      FOR EACH ROW EXECUTE FUNCTION public.audit_log_changes()', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.%I FROM anon, authenticated', t);
    EXECUTE format('GRANT SELECT ON public.%I TO medsync_clinical_reader', t);
  END LOOP;
  FOREACH t IN ARRAY ARRAY['lab_qc_runs','lab_qc_status','lab_nonconformities','lab_nc_events'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS lab_read ON public.%I', t);
    EXECUTE format('CREATE POLICY lab_read ON public.%I FOR SELECT TO medsync_clinical_reader
      USING (hospital_id = (SELECT private.current_hospital_id()) AND (SELECT private.lab_reader()))', t);
  END LOOP;
END $$;
-- A bedside operator reads their own ward's device checks.
DROP POLICY IF EXISTS lab_read ON public.lab_control_checks;
CREATE POLICY lab_read ON public.lab_control_checks FOR SELECT TO medsync_clinical_reader
  USING (hospital_id = (SELECT private.current_hospital_id())
         AND ((SELECT private.lab_reader()) OR device_id IN (SELECT private.bedside_device_ids())));
-- PHI: lab readers, and only for patients they may access; never the hospital admin.
DROP POLICY IF EXISTS lab_read ON public.lab_lookback_items;
CREATE POLICY lab_read ON public.lab_lookback_items FOR SELECT TO medsync_clinical_reader
  USING (hospital_id = (SELECT private.current_hospital_id()) AND (SELECT private.lab_reader())
         AND patient_user_id IN (SELECT private.accessible_patient_ids()));
