-- GATED — applied by the owner (`npm run db:migrate`), never auto-run.
-- 0301: Care mode engine (patient app v2 §5.6–5.8, §8.1; laws MR2, MR3, MR8, MR10, MR11, MR13; D-MR-01,
-- D-MR-06, D-MR-11). Care mode is clinical: every screen that reads these stays behind `careMode`, off in
-- production until Gate CG is signed (MR11). Nothing here holds a dose amount (MR3).
--
-- Who writes what:
--   the hospital (service role, from the care team's tools): enrolment, the plan, the team, helpers;
--   the patient (service role, from pt-* functions): readings and dose events with a client key (MR13), messages;
--   the care team (through RLS): messages and alert acknowledgements.

-- ─── 1. Enrolment: the server switches Care mode on (D-MR-01); leaving keeps the data ──
CREATE TABLE IF NOT EXISTS public.care_enrolments (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_user_id  uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  hospital_id      uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  programme        text NOT NULL CHECK (programme IN ('diabetes','hypertension','diabetes_hypertension')),
  started_at       timestamptz NOT NULL DEFAULT now(),
  ended_at         timestamptz,
  enrolled_by      uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  ended_by         uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  CONSTRAINT care_enrolments_span CHECK (ended_at IS NULL OR ended_at >= started_at)
);
CREATE UNIQUE INDEX IF NOT EXISTS care_enrolments_one_live ON public.care_enrolments (patient_user_id, hospital_id)
  WHERE ended_at IS NULL;

-- ─── 2. The plan, versioned; written from the doctor's plan, never typed in a screen ──
CREATE TABLE IF NOT EXISTS public.care_plan_versions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enrolment_id    uuid NOT NULL REFERENCES public.care_enrolments(id) ON DELETE RESTRICT,
  version         integer NOT NULL CHECK (version > 0),
  items           jsonb NOT NULL CHECK (jsonb_typeof(items) = 'array'),
  targets         jsonb NOT NULL CHECK (jsonb_typeof(targets) = 'object'),
  check_intervals jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(check_intervals) = 'object'),
  authored_by     uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (enrolment_id, version),
  -- MR3 at the database: no plan item may carry an amount.
  CONSTRAINT care_plan_no_dose CHECK (items::text !~* '"(dose|amount|strength|mg|units?|tablets?)"\s*:')
);

-- ─── 3. Dose events: taken, skipped (with a reason), snoozed; never an amount ──
CREATE TABLE IF NOT EXISTS public.dose_events (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_user_id  uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_version_id  uuid REFERENCES public.care_plan_versions(id) ON DELETE RESTRICT,
  medicine_key     text NOT NULL CHECK (length(medicine_key) BETWEEN 1 AND 80),
  due_at           timestamptz NOT NULL,
  status           text NOT NULL CHECK (status IN ('taken','skipped','snoozed')),
  skip_reason      text CHECK (skip_reason IS NULL OR skip_reason IN
                   ('felt_unwell','ran_out','forgot','side_effects','other')),
  client_key       text NOT NULL CHECK (length(client_key) BETWEEN 8 AND 80),
  recorded_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (patient_user_id, client_key),
  CONSTRAINT dose_events_reason_only_skip CHECK (skip_reason IS NULL OR status = 'skipped')
);

-- ─── 4. Readings: a client key so an offline queue syncs once (MR13, S18) ──
ALTER TABLE public.personal_health_logs ADD COLUMN IF NOT EXISTS client_key text
  CHECK (client_key IS NULL OR length(client_key) BETWEEN 8 AND 80);
CREATE UNIQUE INDEX IF NOT EXISTS personal_health_logs_client_key
  ON public.personal_health_logs (patient_user_id, client_key) WHERE client_key IS NOT NULL;

-- ─── 5. The care team (MR8: roles always, names only with consent) and family helpers ──
CREATE TABLE IF NOT EXISTS public.care_team_members (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enrolment_id   uuid NOT NULL REFERENCES public.care_enrolments(id) ON DELETE CASCADE,
  user_id        uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  role           text NOT NULL CHECK (role IN ('nurse','doctor','clinical_officer','nutritionist','counsellor',
                   'pharmacist','vht')),
  first_contact  boolean NOT NULL DEFAULT false,
  name_consent   boolean NOT NULL DEFAULT false,
  next_step      text CHECK (next_step IS NULL OR length(next_step) <= 140),
  added_at       timestamptz NOT NULL DEFAULT now(),
  removed_at     timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS care_team_one_first_contact ON public.care_team_members (enrolment_id)
  WHERE first_contact AND removed_at IS NULL;

CREATE TABLE IF NOT EXISTS public.care_helpers (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_user_id  uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  helper_user_id   uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  scope            text NOT NULL CHECK (scope IN ('readings','all')),
  granted_at       timestamptz NOT NULL DEFAULT now(),
  revoked_at       timestamptz,
  CONSTRAINT care_helpers_not_self CHECK (helper_user_id <> patient_user_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS care_helpers_one_live ON public.care_helpers (patient_user_id, helper_user_id)
  WHERE revoked_at IS NULL;

-- ─── 6. Messages: one thread per enrolment; hours shown (D-MR-06); not for emergencies ──
CREATE TABLE IF NOT EXISTS public.care_messages (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enrolment_id    uuid NOT NULL REFERENCES public.care_enrolments(id) ON DELETE CASCADE,
  author_user_id  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  from_patient    boolean NOT NULL,
  kind            text NOT NULL DEFAULT 'text' CHECK (kind IN ('text','auto_reply','request')),
  body            text NOT NULL CHECK (length(trim(body)) BETWEEN 1 AND 1000),
  client_key      text CHECK (client_key IS NULL OR length(client_key) BETWEEN 8 AND 80),
  read_at         timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS care_messages_client_key ON public.care_messages (enrolment_id, client_key)
  WHERE client_key IS NOT NULL;

-- ─── 7. Danger alerts to the team (S19); raised by the server's copy of the patient's rule (S2) ──
CREATE TABLE IF NOT EXISTS public.care_alerts (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enrolment_id     uuid NOT NULL REFERENCES public.care_enrolments(id) ON DELETE CASCADE,
  reading_id       uuid NOT NULL UNIQUE REFERENCES public.personal_health_logs(id) ON DELETE CASCADE,
  kind             text NOT NULL CHECK (kind IN ('low_sugar','high_sugar','very_high_bp','low_bp','pulse')),
  rules_version    text NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  acknowledged_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  acknowledged_at  timestamptz
);

-- ─── 8. Who may read ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION private.care_on_team(p_enrolment uuid)
  RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (SELECT 1 FROM public.care_team_members m
    WHERE m.enrolment_id = p_enrolment AND m.user_id = auth.uid() AND m.removed_at IS NULL);
$$;
CREATE OR REPLACE FUNCTION private.care_is_patient(p_enrolment uuid)
  RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM public.care_enrolments e WHERE e.id = p_enrolment AND e.patient_user_id = auth.uid());
$$;
CREATE OR REPLACE FUNCTION private.care_helper_of(p_patient uuid, p_scope text)
  RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM public.care_helpers h WHERE h.patient_user_id = p_patient
    AND h.helper_user_id = auth.uid() AND h.revoked_at IS NULL AND (h.scope = 'all' OR h.scope = p_scope));
$$;
CREATE OR REPLACE FUNCTION private.care_team_of_patient(p_patient uuid)
  RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM public.care_enrolments e JOIN public.care_team_members m ON m.enrolment_id = e.id
    WHERE e.patient_user_id = p_patient AND e.ended_at IS NULL AND m.user_id = auth.uid() AND m.removed_at IS NULL);
$$;
REVOKE ALL ON FUNCTION private.care_on_team(uuid), private.care_is_patient(uuid), private.care_helper_of(uuid, text),
  private.care_team_of_patient(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.care_on_team(uuid), private.care_is_patient(uuid), private.care_helper_of(uuid, text),
  private.care_team_of_patient(uuid) TO authenticated;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['care_enrolments','care_plan_versions','dose_events','care_team_members','care_helpers',
    'care_messages','care_alerts']
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS audit_%1$s ON public.%1$s', t);
    EXECUTE format('CREATE TRIGGER audit_%1$s AFTER INSERT OR UPDATE OR DELETE ON public.%1$s
      FOR EACH ROW EXECUTE FUNCTION public.audit_log_changes()', t);
    EXECUTE format('ALTER TABLE public.%s ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE public.%s FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%s FROM anon, authenticated', t);
    EXECUTE format('GRANT SELECT ON public.%s TO authenticated', t);
  END LOOP;
END $$;

CREATE POLICY care_enrolments_read ON public.care_enrolments FOR SELECT TO authenticated
  USING (patient_user_id = auth.uid() OR private.care_on_team(id) OR private.care_helper_of(patient_user_id, 'all'));
CREATE POLICY care_plan_read ON public.care_plan_versions FOR SELECT TO authenticated
  USING (private.care_is_patient(enrolment_id) OR private.care_on_team(enrolment_id) OR EXISTS (
    SELECT 1 FROM public.care_enrolments e WHERE e.id = enrolment_id AND private.care_helper_of(e.patient_user_id, 'all')));
CREATE POLICY dose_events_read ON public.dose_events FOR SELECT TO authenticated
  USING (patient_user_id = auth.uid() OR private.care_team_of_patient(patient_user_id)
    OR private.care_helper_of(patient_user_id, 'all'));
CREATE POLICY care_team_read ON public.care_team_members FOR SELECT TO authenticated
  USING (private.care_is_patient(enrolment_id) OR private.care_on_team(enrolment_id) OR EXISTS (
    SELECT 1 FROM public.care_enrolments e WHERE e.id = enrolment_id AND private.care_helper_of(e.patient_user_id, 'all')));
CREATE POLICY care_helpers_read ON public.care_helpers FOR SELECT TO authenticated
  USING (patient_user_id = auth.uid() OR helper_user_id = auth.uid());
CREATE POLICY care_messages_read ON public.care_messages FOR SELECT TO authenticated
  USING (private.care_is_patient(enrolment_id) OR private.care_on_team(enrolment_id));
CREATE POLICY care_alerts_read ON public.care_alerts FOR SELECT TO authenticated
  USING (private.care_on_team(enrolment_id) OR private.care_is_patient(enrolment_id));

-- The team writes in the thread and acknowledges alerts; patients write through pt-care-message.
GRANT INSERT ON public.care_messages TO authenticated;
CREATE POLICY care_messages_team_write ON public.care_messages FOR INSERT TO authenticated
  WITH CHECK (NOT from_patient AND author_user_id = auth.uid() AND private.care_on_team(enrolment_id));
GRANT UPDATE (acknowledged_by, acknowledged_at) ON public.care_alerts TO authenticated;
CREATE POLICY care_alerts_ack ON public.care_alerts FOR UPDATE TO authenticated
  USING (private.care_on_team(enrolment_id)) WITH CHECK (acknowledged_by = auth.uid());

-- Helpers with the readings scope read the patient's readings (existing table, one more policy).
DROP POLICY IF EXISTS personal_health_logs_helper_read ON public.personal_health_logs;
CREATE POLICY personal_health_logs_helper_read ON public.personal_health_logs FOR SELECT TO authenticated
  USING (private.care_helper_of(patient_user_id, 'readings') OR private.care_team_of_patient(patient_user_id));

-- ─── 9. The mode, one read for both apps ────────────────────────────────────────
CREATE OR REPLACE VIEW public.patient_mode WITH (security_invoker = true) AS
SELECT e.patient_user_id, e.hospital_id, e.id AS enrolment_id, e.programme, 'care'::text AS mode
  FROM public.care_enrolments e WHERE e.ended_at IS NULL;
GRANT SELECT ON public.patient_mode TO authenticated;

-- ─── 10. Writes from the patient's functions (service role only), idempotent by client key ──
CREATE OR REPLACE FUNCTION public.care_record_reading(p_patient uuid, p_client_key text, p_kind text, p_v1 numeric,
  p_v2 numeric, p_unit text, p_note text, p_recorded_at timestamptz)
  RETURNS TABLE (reading_id uuid, created boolean) LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = public, pg_temp AS $$
DECLARE v uuid;
BEGIN
  SELECT id INTO v FROM public.personal_health_logs WHERE patient_user_id = p_patient AND client_key = p_client_key;
  IF v IS NOT NULL THEN RETURN QUERY SELECT v, false; RETURN; END IF;
  INSERT INTO public.personal_health_logs (patient_user_id, kind, recorded_at, numeric_value_1, numeric_value_2, unit,
                                           note, client_key)
  VALUES (p_patient, p_kind, coalesce(p_recorded_at, now()), p_v1, p_v2, p_unit, p_note, p_client_key)
  RETURNING id INTO v;
  RETURN QUERY SELECT v, true;
END $$;

CREATE OR REPLACE FUNCTION public.care_raise_alert(p_reading uuid, p_kind text, p_rules_version text)
  RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_enrolment uuid; v uuid;
BEGIN
  SELECT e.id INTO v_enrolment FROM public.personal_health_logs l
    JOIN public.care_enrolments e ON e.patient_user_id = l.patient_user_id AND e.ended_at IS NULL
   WHERE l.id = p_reading ORDER BY e.started_at DESC LIMIT 1;
  IF v_enrolment IS NULL THEN RETURN NULL; END IF; -- not in a programme: nobody to tell, Help still shows
  INSERT INTO public.care_alerts (enrolment_id, reading_id, kind, rules_version)
  VALUES (v_enrolment, p_reading, p_kind, p_rules_version)
  ON CONFLICT (reading_id) DO NOTHING RETURNING id INTO v;
  RETURN v;
END $$;

CREATE OR REPLACE FUNCTION public.care_record_dose(p_patient uuid, p_client_key text, p_plan_version uuid,
  p_medicine_key text, p_due_at timestamptz, p_status text, p_skip_reason text)
  RETURNS TABLE (dose_event_id uuid, created boolean) LANGUAGE plpgsql SECURITY DEFINER
  SET search_path = public, pg_temp AS $$
DECLARE v uuid;
BEGIN
  SELECT id INTO v FROM public.dose_events WHERE patient_user_id = p_patient AND client_key = p_client_key;
  IF v IS NOT NULL THEN RETURN QUERY SELECT v, false; RETURN; END IF;
  INSERT INTO public.dose_events (patient_user_id, plan_version_id, medicine_key, due_at, status, skip_reason, client_key)
  VALUES (p_patient, p_plan_version, p_medicine_key, p_due_at, p_status, p_skip_reason, p_client_key)
  RETURNING id INTO v;
  RETURN QUERY SELECT v, true;
END $$;

CREATE OR REPLACE FUNCTION public.care_patient_message(p_patient uuid, p_client_key text, p_body text)
  RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_enrolment uuid; v uuid;
BEGIN
  SELECT id INTO v_enrolment FROM public.care_enrolments WHERE patient_user_id = p_patient AND ended_at IS NULL
   ORDER BY started_at DESC LIMIT 1;
  IF v_enrolment IS NULL THEN RAISE EXCEPTION 'not in a care programme' USING ERRCODE = '42501'; END IF;
  SELECT id INTO v FROM public.care_messages WHERE enrolment_id = v_enrolment AND client_key = p_client_key;
  IF v IS NOT NULL THEN RETURN v; END IF;
  INSERT INTO public.care_messages (enrolment_id, author_user_id, from_patient, body, client_key)
  VALUES (v_enrolment, p_patient, true, p_body, p_client_key) RETURNING id INTO v;
  RETURN v;
END $$;

DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY['care_record_reading(uuid,text,text,numeric,numeric,text,text,timestamptz)',
    'care_raise_alert(uuid,text,text)', 'care_record_dose(uuid,text,uuid,text,timestamptz,text,text)',
    'care_patient_message(uuid,text,text)']
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon, authenticated', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO service_role', f);
  END LOOP;
END $$;
