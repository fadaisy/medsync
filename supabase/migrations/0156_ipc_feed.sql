-- 0156 — Lab Phase 5: the infection prevention feed (docs/lab/phase-5/gate-a-proposal.md §8; IC-1..IC-14;
-- A12..A14). Two new designations (the IPC link nurse and the surveillance focal person), the alert list as signed
-- configuration (the IPC lead, countersigned by a laboratory lead), alerts with the minimum dataset, append-only
-- actions, the patient flag as append-only events, and the surveillance focal person's check of a list entry.
--
-- No alert list entry, precaution or IDSR route ships here: each is entered and signed in the product.
-- ADDITIVE and re-runnable. GATED: owner-applied (`npm run db:migrate -- 0156`).
-- Reverse: DROP the four new tables and private.ipc_reader(); restore the CHECKs to their 0150/0155 lists.

ALTER TABLE public.hospital_designations DROP CONSTRAINT IF EXISTS hospital_designations_role_check;
ALTER TABLE public.hospital_designations ADD CONSTRAINT hospital_designations_role_check CHECK (role IN
  ('data_protection_lead','ipc_lead','ipc_link_nurse','surveillance_focal_person'));

ALTER TABLE public.lab_signed_configs DROP CONSTRAINT IF EXISTS lab_signed_configs_kind_check;
ALTER TABLE public.lab_signed_configs ADD CONSTRAINT lab_signed_configs_kind_check CHECK (kind IN
  ('scheme','flag_basis','elevation','hiv_algorithm','ncd_mapping','ref','addendum',
   'qc_plan','qc_policy','kit_qc_rule','acceptance_plan','device_qc_rule','competency_validity','hmis_mapping',
   'register_config',
   'partner_tests','partner_packing','partner_legal','partner_fields','referral_ops','referral_wording',
   'patient_release','plain_words','minors_rule','sms_template','patient_floor_additions','results_consent_notice',
   'delta_rule','panel_rule','pattern_rule',
   'ipc_alert_entry'));

-- ─── Alerts (IC-2..IC-5, IC-9) ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ipc_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  patient_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  entry_key text NOT NULL CHECK (char_length(entry_key) BETWEEN 2 AND 80),
  entry_config_id uuid NOT NULL REFERENCES public.lab_signed_configs(id) ON DELETE RESTRICT,
  trigger text NOT NULL CHECK (trigger IN ('result','referral','readmission')),
  -- IC-3: one alert per patient per condition per admission (or visit); `admission:{id}` or `encounter:{id}`.
  episode_key text NOT NULL CHECK (char_length(episode_key) BETWEEN 3 AND 120),
  report_id uuid REFERENCES public.diagnostic_reports(id) ON DELETE RESTRICT,
  referral_id uuid REFERENCES public.lab_referrals(id) ON DELETE RESTRICT,
  ward_id uuid REFERENCES public.hospital_wards(id) ON DELETE RESTRICT,
  bed_id uuid REFERENCES public.hospital_beds(id) ON DELETE RESTRICT,
  admitted_at timestamptz,
  specimen_at timestamptz,
  released_at timestamptz,
  route text NOT NULL CHECK (route IN ('notify_now','weekly_item','programme_route','none')),
  idsr_item text CHECK (idsr_item IS NULL OR char_length(idsr_item) BETWEEN 2 AND 120),
  screening boolean NOT NULL DEFAULT false,
  -- Law 9: the condition belongs to the restricted class `tb`; IPC sees the alert, never the result.
  restricted_class text CHECK (restricted_class IS NULL OR restricted_class = 'tb'),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ia_source CHECK ((trigger = 'result') = (report_id IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS ia_once ON public.ipc_alerts (hospital_id, patient_user_id, entry_key, episode_key)
  WHERE trigger <> 'readmission';
CREATE INDEX IF NOT EXISTS ia_hospital ON public.ipc_alerts (hospital_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.ipc_alert_actions (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  alert_id uuid NOT NULL REFERENCES public.ipc_alerts(id) ON DELETE RESTRICT,
  kind text NOT NULL CHECK (kind IN ('precautions_started','already_in_precautions','not_needed','contacts_listed',
    'notified','escalated','result_corrected','attached','viewed')),
  detail jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(detail) = 'object'),
  by_user uuid REFERENCES auth.users(id) ON DELETE RESTRICT,   -- NULL: MedSync (escalated, attached, corrected)
  at timestamptz NOT NULL DEFAULT now(),
  client_key text CHECK (client_key IS NULL OR char_length(client_key) BETWEEN 8 AND 120),
  CONSTRAINT iaa_person CHECK (kind IN ('escalated','result_corrected','attached') OR by_user IS NOT NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS iaa_key ON public.ipc_alert_actions (hospital_id, client_key) WHERE client_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS iaa_alert ON public.ipc_alert_actions (alert_id, id);

-- ─── The patient flag (IC-8): set by IPC's recorded action, cleared only by IPC with a reason ─
CREATE TABLE IF NOT EXISTS public.patient_ipc_flag_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  patient_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  entry_key text NOT NULL,
  condition text NOT NULL CHECK (char_length(condition) BETWEEN 2 AND 160),
  precaution text NOT NULL CHECK (char_length(precaution) BETWEEN 2 AND 160),
  kind text NOT NULL CHECK (kind IN ('set','clear')),
  reason text CHECK (reason IS NULL OR char_length(reason) BETWEEN 3 AND 500),
  alert_id uuid REFERENCES public.ipc_alerts(id) ON DELETE RESTRICT,
  by_user uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pife_clear_reason CHECK (kind <> 'clear' OR reason IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS pife_patient ON public.patient_ipc_flag_events (patient_user_id, entry_key, id DESC);

-- ─── The surveillance focal person's check of an entry (D-LAB5-20) ───────
CREATE TABLE IF NOT EXISTS public.ipc_list_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  config_id uuid NOT NULL REFERENCES public.lab_signed_configs(id) ON DELETE RESTRICT,
  checked_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  checked_at timestamptz NOT NULL DEFAULT now(),
  note text CHECK (note IS NULL OR char_length(note) BETWEEN 3 AND 500)
);

-- ─── Who reads (IC-4, Law 8): IPC designations, the ward's in-charge, the focal person for routed alerts ─
CREATE OR REPLACE FUNCTION private.ipc_reader() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT (SELECT private.designated('ipc_link_nurse')) OR (SELECT private.designated('ipc_lead'));
$$;
REVOKE ALL ON FUNCTION private.ipc_reader() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.ipc_reader() TO medsync_clinical_reader;

CREATE OR REPLACE FUNCTION private.in_charge_of(p_ward uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM public.ward_in_charge_assignments w
    WHERE w.ward_id = p_ward AND w.nurse_user_id = private.current_user_id()
      AND w.hospital_id = private.current_hospital_id()
      AND w.starts_at <= now() AND (w.ends_at IS NULL OR w.ends_at > now()));
$$;
REVOKE ALL ON FUNCTION private.in_charge_of(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.in_charge_of(uuid) TO medsync_clinical_reader;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['ipc_alert_actions','patient_ipc_flag_events','ipc_list_checks'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %1$s_no_mutation ON public.%1$I', t);
    EXECUTE format('CREATE TRIGGER %1$s_no_mutation BEFORE UPDATE OR DELETE ON public.%1$I
      FOR EACH ROW EXECUTE FUNCTION public.block_modify_append_only()', t);
  END LOOP;
  FOREACH t IN ARRAY ARRAY['ipc_alerts','ipc_alert_actions','patient_ipc_flag_events','ipc_list_checks'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS audit_%1$s ON public.%1$I', t);
    EXECUTE format('CREATE TRIGGER audit_%1$s AFTER INSERT OR UPDATE OR DELETE ON public.%1$I
      FOR EACH ROW EXECUTE FUNCTION public.audit_log_changes()', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
    EXECUTE format('GRANT SELECT ON public.%I TO medsync_clinical_reader', t);
  END LOOP;
END $$;
-- Alerts are immutable once raised; their state is their actions.
DROP TRIGGER IF EXISTS ipc_alerts_no_mutation ON public.ipc_alerts;
CREATE TRIGGER ipc_alerts_no_mutation BEFORE UPDATE OR DELETE ON public.ipc_alerts
  FOR EACH ROW EXECUTE FUNCTION public.block_modify_append_only();

DROP POLICY IF EXISTS ipc_read ON public.ipc_alerts;
CREATE POLICY ipc_read ON public.ipc_alerts FOR SELECT TO medsync_clinical_reader
  USING (hospital_id = (SELECT private.current_hospital_id()) AND (
    (SELECT private.ipc_reader())
    OR (ward_id IS NOT NULL AND private.in_charge_of(ward_id))
    OR (route IN ('notify_now','weekly_item') AND (SELECT private.designated('surveillance_focal_person')))));
DROP POLICY IF EXISTS ipc_read ON public.ipc_alert_actions;
CREATE POLICY ipc_read ON public.ipc_alert_actions FOR SELECT TO medsync_clinical_reader
  USING (hospital_id = (SELECT private.current_hospital_id())
         AND EXISTS (SELECT 1 FROM public.ipc_alerts a WHERE a.id = alert_id));
DROP POLICY IF EXISTS ipc_read ON public.patient_ipc_flag_events;
CREATE POLICY ipc_read ON public.patient_ipc_flag_events FOR SELECT TO medsync_clinical_reader
  USING (hospital_id = (SELECT private.current_hospital_id())
         AND ((SELECT private.ipc_reader())
              OR patient_user_id IN (SELECT private.accessible_patient_ids())));
DROP POLICY IF EXISTS ipc_read ON public.ipc_list_checks;
CREATE POLICY ipc_read ON public.ipc_list_checks FOR SELECT TO medsync_clinical_reader
  USING (hospital_id = (SELECT private.current_hospital_id())
         AND ((SELECT private.ipc_reader()) OR (SELECT private.lab_reader())
              OR (SELECT private.designated('surveillance_focal_person'))));
