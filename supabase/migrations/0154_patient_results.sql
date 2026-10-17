-- 0154 — Lab Phase 5: patients see their results (docs/lab/phase-5/gate-a-proposal.md §3, §4, §10; PR-1..PR-17;
-- A1..A7, A16). The never-shown floor in the database, the clinician's told events, holds, notes, the patient's
-- result views, guardian links, records requests, two consent types, a results-ready dispatch kind, and the signed
-- configuration kinds for the release table, plain words, the minors rule, the SMS template, floor additions and
-- the results consent notice.
--
-- No clinical number or text ships here: release rules, hold maximum, aged window, plain words and every patient
-- sentence are entered and signed in the product. ADDITIVE and re-runnable.
-- GATED: owner-applied (`npm run db:migrate -- 0154`).
-- Reverse: DROP the new tables and functions; restore the CHECKs below to their 0150, 0006 and 0062 lists.

-- ─── The never-shown floor (PR-3, D-LAB5-03, A16) ─────────────────────────
-- Tissue and cytology have no tests yet; a test gets its group here when it is added.
ALTER TABLE public.test_catalogue ADD COLUMN IF NOT EXISTS patient_group text
  CHECK (patient_group IS NULL OR patient_group IN ('tissue','cytology'));

-- True when a test's results, its name and its pending state must never reach a patient surface or an SMS: the
-- four restricted classes, pregnancy tests, tissue and cytology, plus the hospital's signed additions. The floor
-- is code and schema; configuration only adds.
CREATE OR REPLACE FUNCTION private.never_shown(p_test uuid, p_hospital uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.test_catalogue t
     WHERE t.id = p_test
       AND (t.restricted_class IN ('hiv','tb','mental_health','sexual_reproductive_health')
            OR t.code = 'test.pregnancy_urine'
            OR t.patient_group IN ('tissue','cytology')
            OR EXISTS (SELECT 1 FROM public.lab_signed_configs c
                        WHERE c.hospital_id = p_hospital AND c.kind = 'patient_floor_additions'
                          AND c.status = 'signed' AND c.payload->'testCodes' ? t.code)));
$$;
REVOKE ALL ON FUNCTION private.never_shown(uuid, uuid) FROM PUBLIC;

-- ─── Told events (PR-4) ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.patient_told_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  report_id uuid NOT NULL REFERENCES public.diagnostic_reports(id) ON DELETE RESTRICT,
  patient_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  how text NOT NULL CHECK (how IN ('in_person','phone','guardian')),
  told_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  told_at timestamptz NOT NULL,
  client_key text NOT NULL CHECK (char_length(client_key) BETWEEN 8 AND 120),
  recorded_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT patient_told_key UNIQUE (hospital_id, client_key)
);
CREATE INDEX IF NOT EXISTS patient_told_report ON public.patient_told_events (report_id);

-- ─── Holds (PR-7): append-only events; the state is the latest event ───────
CREATE TABLE IF NOT EXISTS public.patient_hold_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  report_logical_id uuid NOT NULL,
  report_id uuid NOT NULL REFERENCES public.diagnostic_reports(id) ON DELETE RESTRICT,
  patient_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  kind text NOT NULL CHECK (kind IN ('set','extend','release')),
  reason text CHECK (reason IS NULL OR reason IN ('explain_in_person','harm_to_patient')),
  until_on date,
  by_user uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  at timestamptz NOT NULL DEFAULT now(),
  client_key text NOT NULL CHECK (char_length(client_key) BETWEEN 8 AND 120),
  CONSTRAINT phe_shape CHECK ((kind = 'release') = (reason IS NULL AND until_on IS NULL)),
  CONSTRAINT phe_key UNIQUE (hospital_id, client_key)
);
CREATE INDEX IF NOT EXISTS phe_logical ON public.patient_hold_events (report_logical_id, id DESC);

-- ─── A clinician's note to the patient (5.2 Next) ───────────────────────
CREATE TABLE IF NOT EXISTS public.clinician_notes_to_patient (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  report_id uuid NOT NULL REFERENCES public.diagnostic_reports(id) ON DELETE RESTRICT,
  patient_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  text_ciphertext text NOT NULL,
  author_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  at timestamptz NOT NULL DEFAULT now(),
  client_key text NOT NULL CHECK (char_length(client_key) BETWEEN 8 AND 120),
  CONSTRAINT cnp_key UNIQUE (hospital_id, client_key)
);
CREATE INDEX IF NOT EXISTS cnp_report ON public.clinician_notes_to_patient (report_id, at DESC);

-- ─── The patient's views (PR-13) ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.patient_result_views (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  report_id uuid NOT NULL REFERENCES public.diagnostic_reports(id) ON DELETE RESTRICT,
  patient_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  viewer_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  device_class text NOT NULL CHECK (device_class IN ('phone','tablet','desktop','unknown')),
  viewed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS prv_report ON public.patient_result_views (report_id, viewed_at DESC);

-- ─── Guardians (PR-11, A6): made at the hospital, never in the app ──────
CREATE TABLE IF NOT EXISTS public.guardian_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  guardian_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  child_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  relationship text NOT NULL CHECK (relationship IN ('parent','guardian')),
  verified_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  verified_at timestamptz NOT NULL DEFAULT now(),
  evidence text NOT NULL CHECK (char_length(evidence) BETWEEN 3 AND 300),
  ended_at timestamptz,
  ended_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  CONSTRAINT gl_not_self CHECK (guardian_user_id <> child_user_id),
  CONSTRAINT gl_end CHECK ((ended_at IS NULL) = (ended_by IS NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS gl_open ON public.guardian_links (guardian_user_id, child_user_id) WHERE ended_at IS NULL;

-- ─── Records requests (PR-15): DPPA s.24, fulfilled by the records office ─
CREATE TABLE IF NOT EXISTS public.records_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  patient_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  requested_at timestamptz NOT NULL DEFAULT now(),
  due_on date NOT NULL,
  fulfilled_at timestamptz,
  fulfilled_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  note text CHECK (note IS NULL OR char_length(note) BETWEEN 3 AND 500),
  client_key text NOT NULL CHECK (char_length(client_key) BETWEEN 8 AND 120),
  CONSTRAINT rr_fulfil CHECK ((fulfilled_at IS NULL) = (fulfilled_by IS NULL)),
  CONSTRAINT rr_key UNIQUE (patient_user_id, client_key)
);

-- ─── Consent types (PR-12, A5) and the results-ready dispatch (PS, A15) ──
ALTER TABLE public.consent_records DROP CONSTRAINT IF EXISTS consent_records_type_check;
ALTER TABLE public.consent_records ADD CONSTRAINT consent_records_type_check CHECK (consent_type IN
  ('data_processing','sms_communication','research_use','third_party_share','results_in_app','results_sms'));
-- 0006 named this one consent_versions_type_check.
ALTER TABLE public.consent_versions DROP CONSTRAINT IF EXISTS consent_versions_type_check;
ALTER TABLE public.consent_versions DROP CONSTRAINT IF EXISTS consent_versions_consent_type_check;
ALTER TABLE public.consent_versions ADD CONSTRAINT consent_versions_type_check CHECK (consent_type IN
  ('data_processing','sms_communication','research_use','third_party_share','results_in_app','results_sms'));

ALTER TABLE public.notification_dispatches DROP CONSTRAINT IF EXISTS notification_dispatches_kind_check;
ALTER TABLE public.notification_dispatches ADD CONSTRAINT notification_dispatches_kind_check CHECK (kind IN (
  'booking_receipt','confirmation_request','reminder','arrival_window','waitlist_offer','session_cancelled',
  'window_shifted','position_called','payment','deterioration_flag','unconfirmed_release','sms_reply',
  'results_ready'));
ALTER TABLE public.notification_dispatches DROP CONSTRAINT IF EXISTS notification_dispatches_related_kind_check;
ALTER TABLE public.notification_dispatches ADD CONSTRAINT notification_dispatches_related_kind_check CHECK (
  related_kind IN ('appointment','waitlist_entry','clinic_session','intake','inbound_sms','patient'));

-- ─── Signed configuration kinds (A7) ────────────────────────────────────
-- patient_release, plain_words, minors_rule, sms_template, patient_floor_additions: the laboratory lead drafts and
-- signs (lead slot), the CSO countersigns. results_consent_notice: the data protection lead alone.
ALTER TABLE public.lab_signed_configs DROP CONSTRAINT IF EXISTS lab_signed_configs_kind_check;
ALTER TABLE public.lab_signed_configs ADD CONSTRAINT lab_signed_configs_kind_check CHECK (kind IN
  ('scheme','flag_basis','elevation','hiv_algorithm','ncd_mapping','ref','addendum',
   'qc_plan','qc_policy','kit_qc_rule','acceptance_plan','device_qc_rule','competency_validity','hmis_mapping',
   'register_config',
   'partner_tests','partner_packing','partner_legal','partner_fields','referral_ops','referral_wording',
   'patient_release','plain_words','minors_rule','sms_template','patient_floor_additions','results_consent_notice'));
ALTER TABLE public.lab_signed_configs DROP CONSTRAINT IF EXISTS lsc_signed_by_two;
ALTER TABLE public.lab_signed_configs ADD CONSTRAINT lsc_signed_by_two CHECK (status = 'draft' OR (
  lead_signed_by IS NOT NULL AND in_force_from IS NOT NULL AND (
    kind IN ('kit_qc_rule','acceptance_plan','device_qc_rule','competency_validity','register_config',
             'partner_tests','partner_packing','partner_legal','partner_fields','referral_ops',
             'results_consent_notice')
    OR (cso_signed_by IS NOT NULL AND (lead_signed_by <> cso_signed_by OR exception_note IS NOT NULL)))));

-- ─── The patient's own results: the database floor (A16) ─────────────────
-- Released, current version, not in the floor, adult (the minors rule is the engine's, and until it is signed
-- nothing shows to under-18s), results consent in force, reviewed (A1), told when critical (PR-4), not held
-- (PR-7). The engine (lib/lab/patient-release.ts) then applies the signed release table. One body, two entries.
CREATE OR REPLACE FUNCTION private.patient_visible_report_ids(p_patient uuid) RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT r.id FROM public.diagnostic_reports r
    JOIN public.patient_profiles pp ON pp.id = r.patient_user_id
   WHERE r.patient_user_id = p_patient
     AND r.status IN ('final','amended','corrected')
     AND NOT EXISTS (SELECT 1 FROM public.diagnostic_reports n WHERE n.supersedes_id = r.id)
     AND NOT private.never_shown(r.test_id, r.hospital_id)
     AND pp.date_of_birth <= ((now() AT TIME ZONE 'Africa/Kampala')::date - interval '18 years')
     AND EXISTS (SELECT 1 FROM public.consent_records c WHERE c.user_id = p_patient
                  AND c.consent_type = 'results_in_app' AND c.revoked_at IS NULL)
     AND EXISTS (SELECT 1 FROM public.result_acknowledgements a WHERE a.report_id = r.id
                  AND a.action IN ('seen','acted'))
     AND (NOT r.critical OR EXISTS (SELECT 1 FROM public.patient_told_events t WHERE t.report_id = r.id))
     AND NOT EXISTS (
       SELECT 1 FROM (SELECT h.kind, h.until_on FROM public.patient_hold_events h
                       WHERE h.report_logical_id = r.logical_id ORDER BY h.id DESC LIMIT 1) last
        WHERE last.kind <> 'release');
$$;
REVOKE ALL ON FUNCTION private.patient_visible_report_ids(uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.patient_results_for_me() RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT private.patient_visible_report_ids(auth.uid()) WHERE auth.uid() IS NOT NULL;
$$;
REVOKE ALL ON FUNCTION public.patient_results_for_me() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.patient_results_for_me() TO authenticated;

-- ─── Append-only, audit, RLS ────────────────────────────────────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['patient_told_events','patient_hold_events','clinician_notes_to_patient',
                           'patient_result_views'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %1$s_no_mutation ON public.%1$I', t);
    EXECUTE format('CREATE TRIGGER %1$s_no_mutation BEFORE UPDATE OR DELETE ON public.%1$I
      FOR EACH ROW EXECUTE FUNCTION public.block_modify_append_only()', t);
  END LOOP;
  FOREACH t IN ARRAY ARRAY['patient_told_events','patient_hold_events','clinician_notes_to_patient',
                           'patient_result_views','guardian_links','records_requests'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS audit_%1$s ON public.%1$I', t);
    EXECUTE format('CREATE TRIGGER audit_%1$s AFTER INSERT OR UPDATE OR DELETE ON public.%1$I
      FOR EACH ROW EXECUTE FUNCTION public.audit_log_changes()', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
    EXECUTE format('GRANT SELECT ON public.%I TO medsync_clinical_reader', t);
    -- A clinician who may open the patient (the EMR's access basis) reads these at their hospital.
    EXECUTE format('DROP POLICY IF EXISTS clinician_read ON public.%I', t);
    EXECUTE format('CREATE POLICY clinician_read ON public.%I FOR SELECT TO medsync_clinical_reader
      USING (%s)', t, CASE
        WHEN t = 'patient_result_views' THEN 'patient_user_id IN (SELECT private.accessible_patient_ids())'
        -- guardian_links is keyed by the child: the child's clinicians read it.
        WHEN t = 'guardian_links' THEN 'hospital_id = (SELECT private.current_hospital_id())
              AND child_user_id IN (SELECT private.accessible_patient_ids())'
        ELSE 'hospital_id = (SELECT private.current_hospital_id())
              AND patient_user_id IN (SELECT private.accessible_patient_ids())' END);
  END LOOP;
END $$;
