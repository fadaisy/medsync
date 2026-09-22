-- 0066 — The patient symptom catalog, symptom submissions, emergency pre-arrivals,
--        emergency contacts, facility emergency capability (PRD MS-PRD-SYM-001, ADR 0098).
--
-- ⚠️ GATED — DO NOT APPLY TO PRODUCTION WITHOUT EXPLICIT, NAMED OWNER
-- AUTHORIZATION. Apply via `npm run db:migrate`.
--
-- Owner + CSO ruling 2026-09-21 (the PRD): symptom input may produce advisory
-- tiering; an emergency-tier selection opens the Emergency Pathway; a patient
-- or bystander may pre-alert a MedSync hospital; the hospital sees it on an
-- Incoming board and converts an arrival into an intake awaiting triage.
-- Clinical content ships DRAFT and production renders only SIGNED content
-- (Gate CS) — nothing here changes what a production patient sees until a
-- version row is signed.
--
-- Additive throughout. Sections, in order:
--   1. patient_symptom_catalog_versions / _items   provenance + mirror of the package
--   2. symptom_submissions                          what the patient reported (PHI)
--   3. emergency_pre_arrivals                       the pre-alert engine (PHI)
--   4. emergency_contacts                           reference data with verification
--   5. pre_arrival_outbox                           rows for the future notifications engine
--   6. hospitals                                    emergency capability + coordinates
--   7. appointments / patient_intakes               linkage columns
--   8. entry_types                                  + self_presentation_prealerted
--   9. sa_audit_log CHECKs                          + the new actions and target kinds
--  10. seeds                                        Appendix B contacts (statuses as stated)
--
-- Sequencing: apply BEFORE deploying the functions that write these tables
-- (pt-submit-symptoms, pt-request-same-day, pt-create-pre-arrival,
-- pt-pre-arrival-status, ha-update-pre-arrival, ha-pre-arrival-arrived,
-- ha-set-hospital-emergency-settings, sa-verify-emergency-contact,
-- pt-emergency-event, pt-declare-intake) and BEFORE the Next app. The
-- catalog version row is registered by `npm run db:seed-symptom-catalog`,
-- which reads the signed artifact and its checksum — never hand-typed here.

-- ─── 1. Catalog provenance and mirror ─────────────────────────────────
CREATE TABLE IF NOT EXISTS public.patient_symptom_catalog_versions (
  version               text PRIMARY KEY,
  status                text NOT NULL DEFAULT 'draft',
  checksum              text NOT NULL,
  item_count            integer NOT NULL DEFAULT 0,
  signed_by_user_id     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  signed_at             timestamptz,
  signoff_artifact_ref  text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT patient_symptom_catalog_versions_status_check
    CHECK (status IN ('draft','signed','retired'))
);

CREATE TABLE IF NOT EXISTS public.patient_symptom_catalog_items (
  key                      text NOT NULL,
  version                  text NOT NULL REFERENCES public.patient_symptom_catalog_versions(version) ON DELETE CASCADE,
  tier                     text NOT NULL,
  category                 text NOT NULL,
  audience                 text[] NOT NULL DEFAULT '{}',
  triage_discriminator_ref text,
  reasoning_token_ref      text,
  flags                    text[] NOT NULL DEFAULT '{}',
  PRIMARY KEY (key, version),
  CONSTRAINT patient_symptom_catalog_items_tier_check CHECK (tier IN ('E','U','R'))
);

ALTER TABLE public.patient_symptom_catalog_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patient_symptom_catalog_versions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.patient_symptom_catalog_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patient_symptom_catalog_items FORCE ROW LEVEL SECURITY;

-- Provenance is not PHI: anyone (the phone checks whether its bundled
-- version is signed before showing the catalog in production).
DROP POLICY IF EXISTS patient_symptom_catalog_versions_select_public ON public.patient_symptom_catalog_versions;
CREATE POLICY patient_symptom_catalog_versions_select_public ON public.patient_symptom_catalog_versions
  FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS patient_symptom_catalog_items_select_public ON public.patient_symptom_catalog_items;
CREATE POLICY patient_symptom_catalog_items_select_public ON public.patient_symptom_catalog_items
  FOR SELECT TO anon, authenticated USING (true);
-- Writes: the seed script and sa-sign-catalog-version only (service role).

-- ─── 2. Symptom submissions ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.symptom_submissions (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id        uuid REFERENCES public.hospitals(id) ON DELETE SET NULL,
  patient_user_id    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reporter_user_id   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  audience           text NOT NULL,
  pregnant           boolean NOT NULL DEFAULT false,
  items              jsonb NOT NULL DEFAULT '[]'::jsonb,
  qualifiers         jsonb NOT NULL DEFAULT '{}'::jsonb,
  computed_tier      text NOT NULL,
  rule_trace         jsonb NOT NULL DEFAULT '[]'::jsonb,
  catalog_version    text NOT NULL,
  free_text_enc      text,
  outcome            text NOT NULL DEFAULT 'abandoned',
  appointment_id     uuid REFERENCES public.appointments(id) ON DELETE SET NULL,
  intake_id          uuid REFERENCES public.patient_intakes(id) ON DELETE SET NULL,
  pre_arrival_id     uuid,
  device_hash        text,
  channel            text NOT NULL DEFAULT 'web',
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT symptom_submissions_audience_check
    CHECK (audience IN ('adult','child_u2m','child_2m_5y','child_5_12','pregnant')),
  CONSTRAINT symptom_submissions_tier_check CHECK (computed_tier IN ('E','U','R')),
  CONSTRAINT symptom_submissions_outcome_check
    CHECK (outcome IN ('booked','queued','same_day','emergency','emergency_declined','abandoned')),
  CONSTRAINT symptom_submissions_channel_check CHECK (channel IN ('web','app','desk')),
  CONSTRAINT symptom_submissions_items_is_list CHECK (jsonb_typeof(items) = 'array'),
  CONSTRAINT symptom_submissions_someone
    CHECK (patient_user_id IS NOT NULL OR reporter_user_id IS NOT NULL OR device_hash IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS symptom_submissions_patient_idx ON public.symptom_submissions (patient_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS symptom_submissions_hospital_idx ON public.symptom_submissions (hospital_id, created_at DESC);

ALTER TABLE public.symptom_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.symptom_submissions FORCE ROW LEVEL SECURITY;

-- PRD §9.3: patient reads own; reporter reads own; staff at the facility the
-- submission was made for — and only once it is ATTACHED to something there
-- (a booking, a queue ticket or a pre-alert): an abandoned report is the
-- patient's alone. Superadmin is deliberately absent (no routine PHI).
DROP POLICY IF EXISTS symptom_submissions_select_scoped ON public.symptom_submissions;
CREATE POLICY symptom_submissions_select_scoped ON public.symptom_submissions
  FOR SELECT TO authenticated
  USING (
    patient_user_id = auth.uid()
    OR reporter_user_id = auth.uid()
    OR (
      hospital_id IS NOT NULL
      AND (appointment_id IS NOT NULL OR intake_id IS NOT NULL OR pre_arrival_id IS NOT NULL)
      AND EXISTS (
        SELECT 1 FROM public.staff_affiliations sa
        WHERE sa.user_id = auth.uid()
          AND sa.hospital_id = symptom_submissions.hospital_id
          AND sa.state IN ('active','approved')
      )
    )
  );
-- Writes via pt-submit-symptoms only.

DROP TRIGGER IF EXISTS symptom_submissions_updated_at ON public.symptom_submissions;
CREATE TRIGGER symptom_submissions_updated_at
  BEFORE UPDATE ON public.symptom_submissions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
-- No `audit_log_changes()` trigger here: it snapshots whole rows, which would
-- copy the encrypted free text (and the hashes) into append-only audit_log
-- and defeat the 30-day purge (PRD §9.5, Gate A item 8). Every writer records
-- a PHI-free `sa_audit_log` row instead (§9.6).
DROP TRIGGER IF EXISTS audit_symptom_submissions ON public.symptom_submissions;

-- ─── 3. Emergency pre-arrivals ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.emergency_pre_arrivals (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id           uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  submission_id         uuid REFERENCES public.symptom_submissions(id) ON DELETE SET NULL,
  patient_user_id       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reporter_user_id      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  -- {audience, age_band?, sex?, pregnant?} — never a name (PRD §8.5 "subject descriptor")
  subject_descriptor    jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- catalog item keys, in the order chosen; the board prints their lay labels
  red_flags             text[] NOT NULL DEFAULT '{}',
  tier                  text NOT NULL DEFAULT 'E',
  isolation_flag        boolean NOT NULL DEFAULT false,
  onset_at              timestamptz,
  last_known_well_at    timestamptz,
  transport_mode        text NOT NULL DEFAULT 'boda',
  eta_band              text NOT NULL DEFAULT '15_30',
  callback_phone_enc    text,
  location_enc          text,
  status                text NOT NULL DEFAULT 'sent',
  verified              boolean NOT NULL DEFAULT false,
  acknowledged_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  acknowledged_at       timestamptz,
  ready_at              timestamptz,
  arrived_at            timestamptz,
  arrived_intake_id     uuid REFERENCES public.patient_intakes(id) ON DELETE SET NULL,
  closed_at             timestamptz,
  reporter_token_hash   text NOT NULL,
  device_hash           text,
  phone_hash            text,
  expires_at            timestamptz NOT NULL DEFAULT (now() + interval '6 hours'),
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT emergency_pre_arrivals_tier_check CHECK (tier IN ('E','U','R')),
  CONSTRAINT emergency_pre_arrivals_transport_check
    CHECK (transport_mode IN ('boda','car','taxi','ambulance','walking')),
  CONSTRAINT emergency_pre_arrivals_eta_check
    CHECK (eta_band IN ('under_15','15_30','30_60','over_60')),
  CONSTRAINT emergency_pre_arrivals_status_check
    CHECK (status IN ('sent','seen','ready','arrived','cancelled','expired','not_arriving','hoax')),
  CONSTRAINT emergency_pre_arrivals_descriptor_is_object CHECK (jsonb_typeof(subject_descriptor) = 'object')
);
CREATE INDEX IF NOT EXISTS emergency_pre_arrivals_board_idx
  ON public.emergency_pre_arrivals (facility_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS emergency_pre_arrivals_device_idx ON public.emergency_pre_arrivals (device_hash, created_at DESC);
CREATE INDEX IF NOT EXISTS emergency_pre_arrivals_phone_idx ON public.emergency_pre_arrivals (phone_hash, created_at DESC);
CREATE INDEX IF NOT EXISTS emergency_pre_arrivals_token_idx ON public.emergency_pre_arrivals (reporter_token_hash);

ALTER TABLE public.symptom_submissions
  DROP CONSTRAINT IF EXISTS symptom_submissions_pre_arrival_fk;
ALTER TABLE public.symptom_submissions
  ADD CONSTRAINT symptom_submissions_pre_arrival_fk
  FOREIGN KEY (pre_arrival_id) REFERENCES public.emergency_pre_arrivals(id) ON DELETE SET NULL;

ALTER TABLE public.emergency_pre_arrivals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.emergency_pre_arrivals FORCE ROW LEVEL SECURITY;

-- PRD §9.3: the facility's board roles read their facility's rows (reception
-- and clinical affiliations alike — authoriseAtHospital's set); a signed-in
-- patient reads their own. The unauthenticated reporter reads/cancels through
-- pt-pre-arrival-status with the capability token — never through RLS.
-- Superadmin absent. All writes via Edge Functions.
DROP POLICY IF EXISTS emergency_pre_arrivals_select_scoped ON public.emergency_pre_arrivals;
CREATE POLICY emergency_pre_arrivals_select_scoped ON public.emergency_pre_arrivals
  FOR SELECT TO authenticated
  USING (
    patient_user_id = auth.uid()
    OR reporter_user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.staff_affiliations sa
      WHERE sa.user_id = auth.uid()
        AND sa.hospital_id = emergency_pre_arrivals.facility_id
        AND sa.state IN ('active','approved')
    )
  );

DROP TRIGGER IF EXISTS emergency_pre_arrivals_updated_at ON public.emergency_pre_arrivals;
CREATE TRIGGER emergency_pre_arrivals_updated_at
  BEFORE UPDATE ON public.emergency_pre_arrivals
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
-- Same as symptom_submissions: no full-row audit trigger (callback phone and
-- location ciphertext would outlive the purge). `sa_audit_log` carries every
-- status change with counts and ids only.
DROP TRIGGER IF EXISTS audit_emergency_pre_arrivals ON public.emergency_pre_arrivals;

-- The Incoming board's live channel (PRD §8.6): Realtime delivers the row
-- itself under the SELECT policy above. The publication exists on every
-- Supabase project; adding the table is idempotent.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'emergency_pre_arrivals'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.emergency_pre_arrivals;
  END IF;
END $$;
ALTER TABLE public.emergency_pre_arrivals REPLICA IDENTITY FULL;

-- ─── 4. Emergency contacts (reference data with verification) ─────────
CREATE TABLE IF NOT EXISTS public.emergency_contacts (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key                  text NOT NULL UNIQUE,
  scope                text NOT NULL,
  district             text,
  facility_id          uuid REFERENCES public.hospitals(id) ON DELETE CASCADE,
  label                text NOT NULL,
  number               text,
  kind                 text NOT NULL,
  priority             integer NOT NULL DEFAULT 100,
  verification_status  text NOT NULL DEFAULT 'unverified',
  verified_by_user_id  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  verified_at          timestamptz,
  basis                text,
  active               boolean NOT NULL DEFAULT true,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT emergency_contacts_scope_check CHECK (scope IN ('national','district','facility')),
  CONSTRAINT emergency_contacts_kind_check CHECK (kind IN ('general','ambulance','crisis','sv')),
  CONSTRAINT emergency_contacts_status_check
    CHECK (verification_status IN ('verified','unverified','to_source')),
  CONSTRAINT emergency_contacts_verified_has_number
    CHECK (verification_status <> 'verified' OR number IS NOT NULL),
  CONSTRAINT emergency_contacts_facility_scope
    CHECK (scope <> 'facility' OR facility_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS emergency_contacts_lookup_idx
  ON public.emergency_contacts (active, verification_status, scope, priority);

ALTER TABLE public.emergency_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.emergency_contacts FORCE ROW LEVEL SECURITY;

-- Public read of what may be dialled: active AND verified. Drafts are read
-- server-side (Drizzle) by non-production surfaces under the watermark.
DROP POLICY IF EXISTS emergency_contacts_select_verified ON public.emergency_contacts;
CREATE POLICY emergency_contacts_select_verified ON public.emergency_contacts
  FOR SELECT TO anon, authenticated
  USING (active = true AND verification_status = 'verified');
-- Writes: sa-verify-emergency-contact (four-eyes) and
-- ha-set-hospital-emergency-settings (own facility rows) only.

DROP TRIGGER IF EXISTS emergency_contacts_updated_at ON public.emergency_contacts;
CREATE TRIGGER emergency_contacts_updated_at
  BEFORE UPDATE ON public.emergency_contacts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS audit_emergency_contacts ON public.emergency_contacts;
CREATE TRIGGER audit_emergency_contacts
  AFTER INSERT OR UPDATE OR DELETE ON public.emergency_contacts
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_changes();

-- ─── 5. Outbox for the notifications engine that is not built ─────────
--
-- The existing notification_dispatches is patient-shaped (recipient CHECK,
-- daily drain, related-row hydration for appointments only); a facility SMS
-- pre-alert does not fit it. These rows exist so the future engine has
-- them; nothing reads them as "sent".
CREATE TABLE IF NOT EXISTS public.pre_arrival_outbox (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pre_arrival_id  uuid NOT NULL REFERENCES public.emergency_pre_arrivals(id) ON DELETE CASCADE,
  facility_id     uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  channel         text NOT NULL DEFAULT 'facility_sms',
  body            text NOT NULL,
  state           text NOT NULL DEFAULT 'awaiting_notifications_engine',
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pre_arrival_outbox_channel_check CHECK (channel IN ('facility_sms')),
  CONSTRAINT pre_arrival_outbox_state_check
    CHECK (state IN ('awaiting_notifications_engine','sent','failed','cancelled'))
);
ALTER TABLE public.pre_arrival_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pre_arrival_outbox FORCE ROW LEVEL SECURITY;
-- No client policy of any kind: service role only.

-- ─── 6. Facility emergency capability ─────────────────────────────────
ALTER TABLE public.hospitals
  ADD COLUMN IF NOT EXISTS emergency_capability text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS pre_alert_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS board_owner_note text,
  ADD COLUMN IF NOT EXISTS emergency_entrance_directions text,
  ADD COLUMN IF NOT EXISTS emergency_sms_number text,
  ADD COLUMN IF NOT EXISTS ambulance_number text,
  ADD COLUMN IF NOT EXISTS latitude double precision,
  ADD COLUMN IF NOT EXISTS longitude double precision;

ALTER TABLE public.hospitals DROP CONSTRAINT IF EXISTS hospitals_emergency_capability_check;
ALTER TABLE public.hospitals
  ADD CONSTRAINT hospitals_emergency_capability_check
  CHECK (emergency_capability IN ('none','daytime','24h'));
-- A board nobody owns is a board nobody watches (PRD §12): enabling needs a name.
ALTER TABLE public.hospitals DROP CONSTRAINT IF EXISTS hospitals_pre_alert_has_owner;
ALTER TABLE public.hospitals
  ADD CONSTRAINT hospitals_pre_alert_has_owner
  CHECK (pre_alert_enabled = false OR board_owner_note IS NOT NULL);
ALTER TABLE public.hospitals DROP CONSTRAINT IF EXISTS hospitals_emergency_sms_format;
ALTER TABLE public.hospitals
  ADD CONSTRAINT hospitals_emergency_sms_format
  CHECK (emergency_sms_number IS NULL OR emergency_sms_number ~ '^[+]2567[0-9]{8}$|^[+]256[23489][0-9]{7,8}$');
ALTER TABLE public.hospitals DROP CONSTRAINT IF EXISTS hospitals_ambulance_format;
ALTER TABLE public.hospitals
  ADD CONSTRAINT hospitals_ambulance_format
  CHECK (ambulance_number IS NULL OR ambulance_number ~ '^[+]2567[0-9]{8}$|^[+]256[23489][0-9]{7,8}$|^0800[0-9]{6}$');
ALTER TABLE public.hospitals DROP CONSTRAINT IF EXISTS hospitals_coordinates_range;
ALTER TABLE public.hospitals
  ADD CONSTRAINT hospitals_coordinates_range
  CHECK (
    (latitude IS NULL AND longitude IS NULL)
    OR (latitude BETWEEN -2 AND 5 AND longitude BETWEEN 29 AND 36)
  );

-- ─── 7. Linkage columns ───────────────────────────────────────────────
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS symptom_tier text,
  ADD COLUMN IF NOT EXISTS symptom_submission_id uuid REFERENCES public.symptom_submissions(id) ON DELETE SET NULL;
ALTER TABLE public.appointments DROP CONSTRAINT IF EXISTS appointments_symptom_tier_check;
ALTER TABLE public.appointments
  ADD CONSTRAINT appointments_symptom_tier_check
  CHECK (symptom_tier IS NULL OR symptom_tier IN ('E','U','R'));

ALTER TABLE public.patient_intakes
  ADD COLUMN IF NOT EXISTS pre_arrival_id uuid REFERENCES public.emergency_pre_arrivals(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS symptom_submission_id uuid REFERENCES public.symptom_submissions(id) ON DELETE SET NULL;

-- ─── 8. The new way in ────────────────────────────────────────────────
INSERT INTO public.entry_types
  (code, name, is_emergency, default_priority_hint,
   requires_appointment_link, requires_referral, allows_unknown_patient, sort_order)
VALUES
  ('self_presentation_prealerted', 'Emergency self-presentation (pre-alerted)', true, 'urgent', false, false, true, 55)
ON CONFLICT (code) DO NOTHING;

-- ─── 9. sa_audit_log CHECKs re-issued ─────────────────────────────────
--
-- DROP-then-ADD is the house pattern; the lists are 0063's verbatim plus the
-- actions and target kinds this PRD introduces.
ALTER TABLE public.sa_audit_log
  DROP CONSTRAINT IF EXISTS sa_audit_log_action_check;

ALTER TABLE public.sa_audit_log
  ADD CONSTRAINT sa_audit_log_action_check CHECK (
    action IN (
      'approve_staff_affiliation', 'reject_staff_affiliation',
      'approve_hospital_application', 'reject_hospital_application',
      'cross_tenant_read', 'cross_tenant_export',
      'elevate_admin', 'create_superadmin', 'demote_admin',
      'break_glass_open', 'break_glass_close',
      'four_eyes_request', 'four_eyes_confirm', 'four_eyes_cancel',
      'activate_hospital', 'suspend_user', 'reset_user_mfa',
      'deactivate_user', 'reactivate_user', 'export_audit_log',
      'sa_create_hospital', 'sa_invite_hospital_admin', 'hospital_admin_claimed',
      'request_staff_info', 'suspend_staff_affiliation',
      'deactivate_staff_affiliation', 'reactivate_staff_affiliation',
      'reset_staff_mfa', 'assign_staff_role',
      'invite_staff', 'revoke_staff_invitation',
      'book_appointment', 'confirm_appointment_request',
      'decline_appointment_request', 'cancel_appointment',
      'reschedule_appointment', 'mark_no_show', 'mark_arrived',
      'start_encounter', 'complete_encounter',
      'propose_urgent_appointment', 'record_walkin',
      'set_clinician_availability', 'cancel_clinician_availability',
      'update_clinician_settings', 'update_department_policy',
      'override_out_of_hours_booking',
      'assign_supervision', 'end_supervision',
      'cosign_request', 'cosign_approve', 'cosign_return',
      'cosign_cancel', 'cosign_expire',
      'update_cosign_policy',
      'phi_access_break_glass',
      'record_observation', 'correct_observation',
      'administer_medication', 'withhold_medication',
      'submit_handover',
      'assign_patient_to_nurse', 'unassign_patient_from_nurse',
      'assign_ward_in_charge', 'end_ward_in_charge',
      'escalate_to_medical_team',
      'register_intake', 'update_intake', 'cancel_intake',
      'check_in_patient',
      'patient_declare_intake',
      'compute_triage', 'assign_triage', 'override_triage',
      'adjust_triage_baseline',
      'open_resus_episode', 'conclude_resus_episode',
      'record_resus_event', 'correct_resus_event',
      'assign_resus_role', 'end_resus_role',
      'mobilise_resus_team', 'detect_resus_arrest',
      'set_emergency_phone',
      'rate_visit',
      'update_service_line', 'update_session_template',
      'cancel_session', 'book_on_behalf',
      'reconcile_identity', 'unreconcile_identity', 'add_booking_agent',
      'join_waitlist', 'accept_waitlist_offer', 'accept_rebooking',
      'confirm_attendance', 'set_session_delay',
      'sms_stop',
      'set_service_line_fee',
      -- New (symptom catalog + emergency pathway, migration 0066 / ADR 0098)
      'submit_symptoms', 'emergency_interrupt_shown', 'emergency_declined',
      'emergency_call_tapped', 'request_same_day',
      'create_pre_arrival', 'update_pre_arrival',
      'sign_catalog_version', 'verify_emergency_contact',
      'set_hospital_emergency_settings'
    )
  );

ALTER TABLE public.sa_audit_log
  DROP CONSTRAINT IF EXISTS sa_audit_log_target_kind_check;

ALTER TABLE public.sa_audit_log
  ADD CONSTRAINT sa_audit_log_target_kind_check CHECK (
    target_kind IN (
      'staff_affiliation', 'hospital_application', 'hospital', 'user', 'patient_profile',
      'break_glass_grant', 'audit_log_export', 'hospital_admin_invitation',
      'staff_invitation',
      'appointment', 'availability_block', 'queue_entry', 'encounter',
      'clinician_scheduling_settings', 'department_scheduling_policy',
      'clinical_supervision', 'clinical_cosign_request',
      'clinical_cosign_policy', 'clinical_phi_access',
      'nursing_assignment', 'ward_in_charge_assignment',
      'clinical_observation', 'medication_administration_record',
      'shift_handover',
      'patient_intake',
      'triage_record',
      'resus_episode', 'resus_timeline_event',
      'resus_role_assignment', 'resus_mobilisation_alert',
      'service_line', 'session_template', 'clinic_session',
      'provisional_patient', 'booking_agent',
      'waitlist_entry', 'notification_dispatch',
      'service_line_fee',
      -- New (symptom catalog + emergency pathway, migration 0066 / ADR 0098)
      'symptom_submission', 'emergency_pre_arrival', 'emergency_contact',
      'patient_symptom_catalog_version'
    )
  );

-- ─── 10. Seeds — Appendix B, statuses exactly as stated ──────────────
--
-- Nothing here is `verified`: nobody at MedSync has dialled these yet, and
-- production renders verified numbers only (Gate CS). The runbook
-- docs/runbooks/emergency-contacts-verification.md is how they become so.
INSERT INTO public.emergency_contacts
  (key, scope, district, facility_id, label, number, kind, priority, verification_status, basis)
VALUES
  ('UG.NATIONAL.112',     'national', NULL, NULL, 'Police emergency line (mobile)', '112',           'general',   10, 'unverified', 'Uganda Police NECC; gov.ug emergency page — likely live, verify'),
  ('UG.NATIONAL.999',     'national', NULL, NULL, 'Police emergency line',          '999',           'general',   20, 'unverified', 'Uganda Police NECC; gov.ug emergency page — likely live, verify'),
  ('UG.NATIONAL.912',     'national', NULL, NULL, 'Ministry of Health ambulance',   '912',           'ambulance', 30, 'unverified', 'MoH DGHS statement Nov 2025 — announced, launch status unknown'),
  ('UG.KAMPALA.KCCA',     'district', 'Kampala', NULL, 'KCCA city ambulance (toll-free)', '0800299000', 'ambulance', 40, 'unverified', 'KCCA announcement — verify'),
  ('UG.NATIONAL.URCS',    'national', NULL, NULL, 'Uganda Red Cross highway ambulances', NULL,      'ambulance', 50, 'to_source',  'URCS — number to source'),
  ('UG.NATIONAL.CRISIS',  'national', NULL, NULL, 'Crisis and mental health line',   NULL,           'crisis',    60, 'to_source',  'Butabika NRH switchboard as interim candidate — to source and verify'),
  ('UG.NATIONAL.SV',      'national', NULL, NULL, 'Sexual violence support',         NULL,           'sv',        70, 'to_source',  'To source and verify')
ON CONFLICT (key) DO NOTHING;
