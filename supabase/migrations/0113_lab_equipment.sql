-- 0113 — Lab equipment: the machine record is the existing `devices` table, widened with analyser and lab
-- equipment kinds, a section, service details, linked tests and schedules; one append-only equipment log
-- (maintenance, calibration, temperature, repair, error, drop); breakdowns; analyser profiles linked to their
-- analyser (Lab Phase 3, gate-a-proposal §3.2, P2, P3, E-LAB3-09, D-LAB3-11).
--
-- Up and down status still reaches ordering only through the hub's own action (ha-services-hub
-- report_problem / resolve_problem); nothing here copies it. Schedules and temperature ranges are operational,
-- set by the laboratory lead. ADDITIVE and re-runnable. GATED: owner-applied (`npm run db:migrate -- 0113`).

ALTER TABLE public.devices DROP CONSTRAINT IF EXISTS devices_kind_check;
ALTER TABLE public.devices ADD CONSTRAINT devices_kind_check CHECK (kind IN
  ('glucometer','ketone_meter','hba1c_analyser','bp_monitor','rdt_kit','dipstick',
   'analyser','centrifuge','fridge','freezer','incubator','water_bath','microscope','pipette','thermometer','timer',
   'safety_cabinet','other'));
-- `down`: out of service (a breakdown is open). `blocked`: a bedside device whose last control check failed
-- (D-LAB3-15), cleared by a passing one.
ALTER TABLE public.devices DROP CONSTRAINT IF EXISTS devices_state_check;
ALTER TABLE public.devices ADD CONSTRAINT devices_state_check
  CHECK (state IN ('not_verified','in_use','retired','down','blocked'));
ALTER TABLE public.devices
  ADD COLUMN IF NOT EXISTS section_id uuid REFERENCES public.hospital_departments(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS details jsonb NOT NULL DEFAULT '{}',          -- model notes, location, service provider and contact, installed on
  ADD COLUMN IF NOT EXISTS linked_concepts text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS linked_tests text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS schedules jsonb NOT NULL DEFAULT '{}';        -- maintenance tasks, calibration items, temperature range and readings per day

ALTER TABLE public.analyser_profiles
  ADD COLUMN IF NOT EXISTS device_id uuid REFERENCES public.devices(id) ON DELETE RESTRICT;

CREATE TABLE IF NOT EXISTS public.lab_equipment_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  device_id uuid NOT NULL REFERENCES public.devices(id) ON DELETE RESTRICT,
  kind text NOT NULL CHECK (kind IN ('maintenance','calibration','temperature','repair','error','drop')),
  task_key text CHECK (task_key IS NULL OR task_key ~ '^[A-Za-z0-9._-]{1,60}$'),
  value numeric,
  unit text CHECK (unit IS NULL OR char_length(unit) BETWEEN 1 AND 40),
  in_range boolean,
  note text CHECK (note IS NULL OR char_length(note) BETWEEN 1 AND 1000),
  file_path text CHECK (file_path IS NULL OR char_length(file_path) BETWEEN 3 AND 300),
  done_at timestamptz NOT NULL,
  actor uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  at timestamptz NOT NULL DEFAULT now(),
  client_key text UNIQUE,
  CONSTRAINT lel_temperature CHECK (kind <> 'temperature' OR (value IS NOT NULL AND unit IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS lab_equipment_logs_device ON public.lab_equipment_logs (device_id, done_at DESC);

CREATE TABLE IF NOT EXISTS public.lab_breakdowns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  device_id uuid NOT NULL REFERENCES public.devices(id) ON DELETE RESTRICT,
  since timestamptz NOT NULL,
  cause text NOT NULL CHECK (char_length(cause) BETWEEN 3 AND 500),
  reported_to text CHECK (reported_to IS NULL OR char_length(reported_to) BETWEEN 2 AND 160),
  ticket text CHECK (ticket IS NULL OR char_length(ticket) BETWEEN 1 AND 60),
  hub_problem_ids uuid[] NOT NULL DEFAULT '{}',
  specimens_to_refer integer NOT NULL DEFAULT 0 CHECK (specimens_to_refer >= 0),
  repair_log_id uuid REFERENCES public.lab_equipment_logs(id) ON DELETE RESTRICT,
  back_at timestamptz,
  back_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  downtime_minutes integer CHECK (downtime_minutes IS NULL OR downtime_minutes >= 0),
  CONSTRAINT lb_back CHECK ((back_at IS NULL) = (back_by IS NULL) AND (back_at IS NULL OR (repair_log_id IS NOT NULL
    AND downtime_minutes IS NOT NULL AND back_at >= since)))
);
CREATE UNIQUE INDEX IF NOT EXISTS lab_breakdowns_open ON public.lab_breakdowns (device_id) WHERE back_at IS NULL;
-- The closing fields are set once; nothing else changes and nothing is deleted.
CREATE OR REPLACE FUNCTION private.lab_breakdown_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' OR OLD.back_at IS NOT NULL
     OR (to_jsonb(NEW) - 'repair_log_id' - 'back_at' - 'back_by' - 'downtime_minutes')
        IS DISTINCT FROM (to_jsonb(OLD) - 'repair_log_id' - 'back_at' - 'back_by' - 'downtime_minutes') THEN
    RAISE EXCEPTION 'lab_breakdowns: a breakdown is only ever closed, once';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS lab_breakdowns_guard ON public.lab_breakdowns;
CREATE TRIGGER lab_breakdowns_guard BEFORE UPDATE OR DELETE ON public.lab_breakdowns
  FOR EACH ROW EXECUTE FUNCTION private.lab_breakdown_guard();

DROP TRIGGER IF EXISTS lab_equipment_logs_no_mutation ON public.lab_equipment_logs;
CREATE TRIGGER lab_equipment_logs_no_mutation BEFORE UPDATE OR DELETE ON public.lab_equipment_logs
  FOR EACH ROW EXECUTE FUNCTION public.block_modify_append_only();
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['lab_equipment_logs','lab_breakdowns'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS audit_%1$s ON public.%1$I', t);
    EXECUTE format('CREATE TRIGGER audit_%1$s AFTER INSERT OR UPDATE OR DELETE ON public.%1$I
      FOR EACH ROW EXECUTE FUNCTION public.audit_log_changes()', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.%I FROM anon, authenticated', t);
    EXECUTE format('GRANT SELECT ON public.%I TO medsync_clinical_reader', t);
  END LOOP;
END $$;
-- The lab reads every log; a bedside operator reads the logs of their own ward's devices.
DROP POLICY IF EXISTS lab_read ON public.lab_equipment_logs;
CREATE POLICY lab_read ON public.lab_equipment_logs FOR SELECT TO medsync_clinical_reader
  USING (hospital_id = (SELECT private.current_hospital_id())
         AND ((SELECT private.lab_reader()) OR device_id IN (SELECT private.bedside_device_ids())));
DROP POLICY IF EXISTS lab_read ON public.lab_breakdowns;
CREATE POLICY lab_read ON public.lab_breakdowns FOR SELECT TO medsync_clinical_reader
  USING (hospital_id = (SELECT private.current_hospital_id()) AND (SELECT private.lab_reader()));
