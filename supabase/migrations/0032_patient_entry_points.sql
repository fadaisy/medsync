-- 0032 — Patient Entry Points: the front door + the triage seam.
--
-- Per docs/patient-entry-points-gate-a-proposal.md.
--
-- Additive only. Two new tables:
--   1. entry_types         reference data — 11 entry types as rows
--                          so adding a 12th doesn't need a code release
--   2. patient_intakes     the unified intake / encounter-precursor
--                          record (the thing the next-build triage
--                          will consume)
--
-- Plus widening of sa_audit_log action + target_kind CHECKs.


-- ─── 1. entry_types (reference) ──────────────────────────────────────
CREATE TABLE public.entry_types (
  code text PRIMARY KEY,
  name text NOT NULL,
  is_emergency boolean NOT NULL DEFAULT false,
  default_priority_hint text NOT NULL DEFAULT 'routine',
  requires_appointment_link boolean NOT NULL DEFAULT false,
  requires_referral boolean NOT NULL DEFAULT false,
  allows_unknown_patient boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT entry_types_priority_check
    CHECK (default_priority_hint IN ('routine','high','urgent'))
);

INSERT INTO public.entry_types
  (code, name, is_emergency, default_priority_hint,
   requires_appointment_link, requires_referral, allows_unknown_patient, sort_order)
VALUES
  ('booked_arrival',                'Booked appointment arrival',           false, 'routine', true,  false, false, 10),
  ('walk_in',                       'Walk-in (non-emergency)',              false, 'routine', false, false, false, 20),
  ('external_referral_routine',     'External referral (routine)',          false, 'routine', false, true,  false, 30),
  ('external_referral_emergency',   'Emergency referral',                   true,  'urgent',  false, false, true,  40),
  ('emergency_self_presentation',   'Emergency self-presentation',          true,  'urgent',  false, false, true,  50),
  ('self_referral_bypass',          'Self-referral / bypass',               false, 'routine', false, false, false, 60),
  ('internal_transfer',             'Internal transfer / inter-department', false, 'routine', false, false, false, 70),
  ('inter_facility_transfer',       'Inter-facility transfer (incoming)',   false, 'high',    false, false, true,  80),
  ('program_visit',                 'Program / recurring clinic',           false, 'routine', false, false, false, 90),
  ('follow_up',                     'Return / follow-up',                   false, 'routine', false, false, false, 100),
  ('virtual',                       'Virtual / tele entry',                 false, 'routine', true,  false, false, 110);

ALTER TABLE public.entry_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.entry_types FORCE ROW LEVEL SECURITY;

-- Reference data: any authenticated user reads.
CREATE POLICY entry_types_select_all ON public.entry_types
  FOR SELECT TO authenticated USING (true);


-- ─── 2. patient_intakes ─────────────────────────────────────────────
CREATE TABLE public.patient_intakes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,

  -- Entry classification
  entry_type_code text NOT NULL REFERENCES public.entry_types(code),
  entry_point text,
    -- 'casualty' | 'medical_emergency_unit' | 'paeds_acu' | 'assessment_centre'
    -- | 'opd' | 'ward' | 'virtual' | 'other'
  receiving_department_id uuid REFERENCES public.hospital_departments(id) ON DELETE SET NULL,
  receiving_ward_id uuid REFERENCES public.hospital_wards(id) ON DELETE SET NULL,

  -- Patient linkage. Nullable so emergency capture can land before
  -- identification (a comatose patient brought by ambulance). The
  -- patient_or_unknown CHECK below is the never-block-emergency
  -- rule encoded in the schema.
  patient_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  patient_unknown_label text,

  appointment_id uuid REFERENCES public.appointments(id) ON DELETE SET NULL,

  -- Referral fields — all optional, all conditional. Emergency types
  -- skip; routine external referrals warn-but-don't-block.
  referring_hospital_id uuid REFERENCES public.hospitals(id) ON DELETE SET NULL,
  referring_facility_other text,
  referring_clinician_name text,
  referral_reason text,
  referral_document_url text,
  referral_date date,

  -- Clinical context (seed for triage; not a triage decision)
  presenting_complaint text,
  brought_by text,
  priority_hint text NOT NULL DEFAULT 'routine',

  status text NOT NULL DEFAULT 'awaiting_triage',
  arrived_at timestamptz NOT NULL DEFAULT now(),

  registered_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  notes text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT intakes_priority_check
    CHECK (priority_hint IN ('routine','high','urgent')),
  CONSTRAINT intakes_status_check
    CHECK (status IN ('arrived','awaiting_triage','triaged','cancelled')),
  CONSTRAINT intakes_patient_or_unknown
    CHECK (patient_user_id IS NOT NULL OR patient_unknown_label IS NOT NULL)
);

CREATE INDEX patient_intakes_hospital_status_idx
  ON public.patient_intakes (hospital_id, status, arrived_at DESC)
  WHERE status IN ('arrived','awaiting_triage');
CREATE INDEX patient_intakes_patient_idx
  ON public.patient_intakes (patient_user_id, arrived_at DESC)
  WHERE patient_user_id IS NOT NULL;
CREATE INDEX patient_intakes_dept_idx
  ON public.patient_intakes (receiving_department_id, status, arrived_at DESC);
CREATE INDEX patient_intakes_type_idx
  ON public.patient_intakes (entry_type_code, arrived_at DESC);

ALTER TABLE public.patient_intakes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patient_intakes FORCE ROW LEVEL SECURITY;

-- SELECT: superadmin all; hospital_admin own hospital; the patient
-- sees their own intakes; any active clinical-staff member at the
-- hospital sees them (legitimate-access basis is enforced at the
-- application layer for the per-patient detail panel via the existing
-- audited-decrypt path — this RLS guarantees nobody outside the
-- hospital reads).
CREATE POLICY patient_intakes_select_scoped ON public.patient_intakes
  FOR SELECT TO authenticated
  USING (
    public.user_has_role('superadmin')
    OR public.user_has_role('hospital_admin', hospital_id)
    OR patient_user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.staff_affiliations sa
      WHERE sa.user_id = auth.uid()
        AND sa.hospital_id = patient_intakes.hospital_id
        AND sa.state IN ('active','approved')
    )
  );
-- Writes via the Edge Function (ha-register-intake) only.

DROP TRIGGER IF EXISTS patient_intakes_updated_at ON public.patient_intakes;
CREATE TRIGGER patient_intakes_updated_at
  BEFORE UPDATE ON public.patient_intakes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS audit_patient_intakes ON public.patient_intakes;
CREATE TRIGGER audit_patient_intakes
  AFTER INSERT OR UPDATE OR DELETE ON public.patient_intakes
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_changes();


-- ─── 3. sa_audit_log widening ──────────────────────────────────────
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
      -- New (patient entry points)
      'register_intake', 'update_intake', 'cancel_intake'
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
      -- New (patient entry points)
      'patient_intake'
    )
  );
