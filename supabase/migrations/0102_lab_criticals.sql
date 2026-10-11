-- 0102 — Critical results: settings, signed response times, contacts, marks, alerts and their append-only
-- events, the escalation heartbeat, SMS templates (Lab Phase 1, ADRs 0239–0244; docs/lab/phase-1/
-- gate-a-proposal.md §5, signed 2026-10-11).
--
-- No clinical number is stored here by the migration: response times are typed and signed per hospital
-- through the set-up screen, and none ships. Every table: RLS ENABLE + FORCE, a reader policy scoped to
-- the hospital, no client INSERT/UPDATE/DELETE (writes run as the owner after the permission check, as
-- every EMR write does), audited. critical_alert_events and critical_marks are append-only for every
-- role, the owner included.
--
-- ADDITIVE and re-runnable. GATED: owner-applied (`npm run db:migrate -- 0102`).

-- ─── 1. Per-hospital lab settings ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.lab_settings (
  hospital_id uuid PRIMARY KEY REFERENCES public.hospitals(id) ON DELETE CASCADE,
  lab_phone text CHECK (lab_phone IS NULL OR char_length(lab_phone) BETWEEN 3 AND 40),
  second_check boolean NOT NULL DEFAULT false,
  sms_live boolean NOT NULL DEFAULT false,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ─── 2. Response times: a signed, versioned set per hospital (D-LAB1-08, -11, -12) ─
CREATE TABLE IF NOT EXISTS public.critical_response_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  version integer NOT NULL CHECK (version > 0),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','signed','superseded')),
  ack_within_min integer NOT NULL CHECK (ack_within_min > 0),
  level1_after_min integer CHECK (level1_after_min IS NULL OR level1_after_min > 0),
  level2_after_min integer CHECK (level2_after_min IS NULL OR level2_after_min > 0),
  source text NOT NULL CHECK (char_length(source) BETWEEN 3 AND 500),
  authored_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  lead_signed_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  lead_signed_at timestamptz,
  cso_signed_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  cso_signed_at timestamptz,
  exception_note text CHECK (exception_note IS NULL OR char_length(exception_note) BETWEEN 10 AND 500),
  created_at timestamptz NOT NULL DEFAULT now(),
  superseded_at timestamptz,
  CONSTRAINT crv_version_unique UNIQUE (hospital_id, version),
  -- Signed means both signatures, by two different people; one person may sign both only with a recorded
  -- exception (D-LAB1-12: no second eligible person exists).
  CONSTRAINT crv_signed_by_two CHECK (status = 'draft' OR (lead_signed_by IS NOT NULL AND cso_signed_by IS NOT NULL
    AND (lead_signed_by <> cso_signed_by OR exception_note IS NOT NULL))),
  CONSTRAINT crv_levels_in_order CHECK (level2_after_min IS NULL OR level1_after_min IS NOT NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS crv_one_signed ON public.critical_response_versions (hospital_id) WHERE status = 'signed';

-- ─── 3. Critical-results contacts (RC-2, RC-3) ───────────────────────────
CREATE TABLE IF NOT EXISTS public.critical_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  department_id uuid REFERENCES public.hospital_departments(id) ON DELETE CASCADE,
  level smallint NOT NULL CHECK (level IN (1, 2)),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  position integer NOT NULL DEFAULT 0 CHECK (position >= 0),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  -- Level 1 belongs to a department; level 2 to the hospital.
  CONSTRAINT cc_level_place CHECK ((level = 1) = (department_id IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS cc_unique ON public.critical_contacts
  (hospital_id, coalesce(department_id, '00000000-0000-0000-0000-000000000000'::uuid), level, user_id);

-- ─── 4. Alerts (CA-1, CA-2) ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.critical_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  patient_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  report_id uuid NOT NULL REFERENCES public.diagnostic_reports(id) ON DELETE RESTRICT,
  order_id uuid REFERENCES public.encounter_orders(id) ON DELETE RESTRICT,
  correction_of uuid REFERENCES public.critical_alerts(id) ON DELETE RESTRICT,
  restricted boolean NOT NULL DEFAULT false,
  state text NOT NULL DEFAULT 'open' CHECK (state IN ('open','acknowledged')),
  sub_state text CHECK (sub_state IN ('sent','not_sent','escalated')),
  level smallint NOT NULL DEFAULT 0 CHECK (level BETWEEN 0 AND 2),
  sent_at timestamptz NOT NULL DEFAULT now(),
  due_at timestamptz,
  acknowledged_at timestamptz,
  acknowledged_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  acknowledged_via text CHECK (acknowledged_via IN ('app','phone')),
  response_code text CHECK (response_code IN ('reviewing','asked_team','already_aware')),
  note_ciphertext text,
  logged_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  client_key text,
  created_at timestamptz NOT NULL DEFAULT now(),
  -- open ⇔ a sub-state and no acknowledgement; acknowledged ⇔ who, when and how. Nothing else exists.
  CONSTRAINT ca_open_shape CHECK (state <> 'open' OR (sub_state IS NOT NULL AND acknowledged_at IS NULL
    AND acknowledged_by IS NULL AND acknowledged_via IS NULL)),
  CONSTRAINT ca_ack_shape CHECK (state <> 'acknowledged' OR (sub_state IS NULL AND acknowledged_at IS NOT NULL
    AND acknowledged_by IS NOT NULL AND acknowledged_via IS NOT NULL)),
  CONSTRAINT ca_phone_logged CHECK (acknowledged_via IS DISTINCT FROM 'phone' OR logged_by IS NOT NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS ca_client_key ON public.critical_alerts (client_key) WHERE client_key IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ca_one_per_report ON public.critical_alerts (report_id) WHERE correction_of IS NULL;
CREATE INDEX IF NOT EXISTS ca_open ON public.critical_alerts (hospital_id, state, sent_at);
CREATE INDEX IF NOT EXISTS ca_patient ON public.critical_alerts (patient_user_id, created_at DESC);

-- ─── 5. Marks (CM-1..CM-5): committed only with the release, never changed ─
CREATE TABLE IF NOT EXISTS public.critical_marks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_id uuid NOT NULL REFERENCES public.critical_alerts(id) ON DELETE RESTRICT,
  report_id uuid NOT NULL REFERENCES public.diagnostic_reports(id) ON DELETE RESTRICT,
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  patient_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  concept_id text NOT NULL,
  source text NOT NULL CHECK (source IN ('manual','auto')),
  limit_id uuid,
  limit_version integer,
  direction text CHECK (direction IN ('low','high')),
  check_kind text NOT NULL CHECK (check_kind IN ('repeated','checked_not_repeated','could_not_check')),
  repeat_value numeric,
  could_not_check_reason text CHECK (could_not_check_reason IN ('not_enough_sample','analyser_down','no_reagent','other')),
  could_not_check_text text CHECK (could_not_check_text IS NULL OR char_length(could_not_check_text) <= 200),
  sample_checked boolean NOT NULL,
  second_checker_id uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  solo_reason text CHECK (solo_reason IS NULL OR char_length(solo_reason) BETWEEN 3 AND 200),
  actor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cm_repeat CHECK ((check_kind = 'repeated') = (repeat_value IS NOT NULL)),
  CONSTRAINT cm_cannot CHECK ((check_kind = 'could_not_check') = (could_not_check_reason IS NOT NULL)),
  CONSTRAINT cm_other_text CHECK (could_not_check_reason IS DISTINCT FROM 'other' OR could_not_check_text IS NOT NULL),
  CONSTRAINT cm_auto_limit CHECK (source = 'manual' OR (limit_id IS NOT NULL AND limit_version IS NOT NULL AND direction IS NOT NULL)),
  CONSTRAINT cm_second_differs CHECK (second_checker_id IS NULL OR second_checker_id <> actor_id)
);
CREATE INDEX IF NOT EXISTS cm_alert ON public.critical_marks (alert_id);

-- ─── 6. Events (CA-4): append-only, for every role ───────────────────────
CREATE TABLE IF NOT EXISTS public.critical_alert_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_id uuid NOT NULL REFERENCES public.critical_alerts(id) ON DELETE RESTRICT,
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  kind text NOT NULL CHECK (kind IN ('created','notified','seen','call_logged','could_not_reach','escalated',
    'acknowledged','disputed','corrected')),
  level smallint CHECK (level BETWEEN 0 AND 2),
  actor_id uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  recipient_id uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  channel text CHECK (channel IN ('app','sms','phone')),
  outcome text CHECK (outcome IN ('queued','delivered','failed','skipped','off')),
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cae_alert ON public.critical_alert_events (alert_id, at);
CREATE INDEX IF NOT EXISTS cae_recipient ON public.critical_alert_events (recipient_id, at DESC) WHERE recipient_id IS NOT NULL;

-- ─── 7. Escalation heartbeat (ES-5) ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.escalation_heartbeats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL CHECK (source IN ('scheduler','lazy')),
  ran_at timestamptz NOT NULL DEFAULT now(),
  escalated integer NOT NULL DEFAULT 0 CHECK (escalated >= 0)
);
CREATE INDEX IF NOT EXISTS eh_ran_at ON public.escalation_heartbeats (source, ran_at DESC);

-- ─── 8. SMS templates: two different approvers (MS-3, D-LAB1-17) ─────────
CREATE TABLE IF NOT EXISTS public.lab_sms_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('level0','escalation')),
  version integer NOT NULL CHECK (version > 0),
  body text NOT NULL CHECK (char_length(body) BETWEEN 10 AND 320),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','pending_review','approved','retired')),
  authored_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  first_approver uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  approved_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT lst_version UNIQUE (kind, version),
  CONSTRAINT lst_two_approvers CHECK (status <> 'approved' OR (first_approver IS NOT NULL AND approved_by IS NOT NULL
    AND first_approver <> approved_by))
);
CREATE UNIQUE INDEX IF NOT EXISTS lst_one_approved ON public.lab_sms_templates (kind) WHERE status = 'approved';

-- ─── 9. Append-only and audit triggers ───────────────────────────────────
DROP TRIGGER IF EXISTS critical_alert_events_no_mutation ON public.critical_alert_events;
CREATE TRIGGER critical_alert_events_no_mutation BEFORE UPDATE OR DELETE ON public.critical_alert_events
  FOR EACH ROW EXECUTE FUNCTION public.block_modify_append_only();
DROP TRIGGER IF EXISTS critical_marks_no_mutation ON public.critical_marks;
CREATE TRIGGER critical_marks_no_mutation BEFORE UPDATE OR DELETE ON public.critical_marks
  FOR EACH ROW EXECUTE FUNCTION public.block_modify_append_only();

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['lab_settings','critical_response_versions','critical_contacts','critical_alerts',
    'critical_marks','critical_alert_events','lab_sms_templates'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS audit_%1$s ON public.%1$I', t);
    EXECUTE format('CREATE TRIGGER audit_%1$s AFTER INSERT OR UPDATE OR DELETE ON public.%1$I
      FOR EACH ROW EXECUTE FUNCTION public.audit_log_changes()', t);
  END LOOP;
END $$;

-- ─── 10. RLS ─────────────────────────────────────────────────────────────
-- Patient-bearing rows (alerts, marks, events): this hospital, and a patient the reader may open, or an
-- alert the reader was notified of (D-LAB1-29: a recipient sees the alert they must acknowledge).
CREATE OR REPLACE FUNCTION private.critical_alert_visible(p_alert uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.critical_alerts a
    WHERE a.id = p_alert AND a.hospital_id = private.current_hospital_id()
      AND (a.patient_user_id IN (SELECT private.accessible_patient_ids())
           OR EXISTS (SELECT 1 FROM public.critical_alert_events e
                      WHERE e.alert_id = a.id AND e.kind = 'notified'
                        AND e.recipient_id = private.current_user_id())));
$$;
REVOKE ALL ON FUNCTION private.critical_alert_visible(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.critical_alert_visible(uuid) TO medsync_clinical_reader;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['lab_settings','critical_response_versions','critical_contacts','critical_alerts',
    'critical_marks','critical_alert_events','escalation_heartbeats','lab_sms_templates'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.%I FROM anon, authenticated', t);
    EXECUTE format('GRANT SELECT ON public.%I TO medsync_clinical_reader', t);
  END LOOP;
END $$;

DROP POLICY IF EXISTS lab_settings_select ON public.lab_settings;
CREATE POLICY lab_settings_select ON public.lab_settings FOR SELECT TO medsync_clinical_reader
  USING (hospital_id = (SELECT private.current_hospital_id()));
DROP POLICY IF EXISTS crv_select ON public.critical_response_versions;
CREATE POLICY crv_select ON public.critical_response_versions FOR SELECT TO medsync_clinical_reader
  USING (hospital_id = (SELECT private.current_hospital_id()));
DROP POLICY IF EXISTS cc_select ON public.critical_contacts;
CREATE POLICY cc_select ON public.critical_contacts FOR SELECT TO medsync_clinical_reader
  USING (hospital_id = (SELECT private.current_hospital_id()));
DROP POLICY IF EXISTS ca_select ON public.critical_alerts;
CREATE POLICY ca_select ON public.critical_alerts FOR SELECT TO medsync_clinical_reader
  USING (private.critical_alert_visible(id));
DROP POLICY IF EXISTS cm_select ON public.critical_marks;
CREATE POLICY cm_select ON public.critical_marks FOR SELECT TO medsync_clinical_reader
  USING (private.critical_alert_visible(alert_id));
DROP POLICY IF EXISTS cae_select ON public.critical_alert_events;
CREATE POLICY cae_select ON public.critical_alert_events FOR SELECT TO medsync_clinical_reader
  USING (private.critical_alert_visible(alert_id));
DROP POLICY IF EXISTS eh_select ON public.escalation_heartbeats;
CREATE POLICY eh_select ON public.escalation_heartbeats FOR SELECT TO medsync_clinical_reader USING (true);
DROP POLICY IF EXISTS lst_select ON public.lab_sms_templates;
CREATE POLICY lst_select ON public.lab_sms_templates FOR SELECT TO medsync_clinical_reader USING (true);
