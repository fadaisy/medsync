-- 0031 — Nurse Workspace: nursing assignments + ward in-charge + observations + MAR + handovers.
--
-- Per docs/nurse-workspace-gate-a-proposal.md (signed off 2026-05-27).
--
-- Additive only. Five new tables:
--   1. nursing_assignments               patient ↔ nurse pairing for a shift/period
--   2. ward_in_charge_assignments        who is currently in-charge of a ward
--   3. clinical_observations             nurse-recorded vitals/obs (general clinical, the seam
--                                        reserved in ADR 0026 for clinician-recorded observation)
--   4. medication_administration_records administer + document; prescription_id as TEXT seam
--   5. shift_handovers                   structured between-shift handover
--
-- Plus:
--   - clinical_cosign_policies + clinical_cosign_requests action_kind widening
--     (high_alert_med_administration, independent_complex_procedure)
--   - Default policy seed for nursing cadres × every active hospital
--   - sa_audit_log action + target_kind widening (nursing verbs)


-- ─── 1. nursing_assignments ─────────────────────────────────────────
CREATE TABLE public.nursing_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  ward_id uuid REFERENCES public.hospital_wards(id) ON DELETE CASCADE,
    -- ward_id null = department-level (e.g. OPD nurse w/o ward)
  department_id uuid NOT NULL REFERENCES public.hospital_departments(id) ON DELETE CASCADE,
  nurse_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  patient_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  relationship_kind text NOT NULL DEFAULT 'primary',
    -- 'primary' (patient's primary nurse this shift) | 'cover'
  starts_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz,
  assigned_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT na_kind_check CHECK (relationship_kind IN ('primary','cover')),
  CONSTRAINT na_time_order CHECK (ends_at IS NULL OR ends_at >= starts_at)
);
CREATE INDEX nursing_assignments_nurse_active_idx
  ON public.nursing_assignments (nurse_user_id, starts_at DESC)
  WHERE ends_at IS NULL;
CREATE INDEX nursing_assignments_patient_active_idx
  ON public.nursing_assignments (patient_user_id, starts_at DESC)
  WHERE ends_at IS NULL;
CREATE INDEX nursing_assignments_ward_active_idx
  ON public.nursing_assignments (ward_id, starts_at DESC)
  WHERE ends_at IS NULL;

ALTER TABLE public.nursing_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nursing_assignments FORCE ROW LEVEL SECURITY;

-- SELECT: superadmin all; hospital_admin own hospital; the nurse sees
-- their own assignments; any active clinical-staff member at the
-- hospital sees assignments for their department's wards (care-team
-- visibility).
CREATE POLICY nursing_assignments_select_scoped ON public.nursing_assignments
  FOR SELECT TO authenticated
  USING (
    public.user_has_role('superadmin')
    OR public.user_has_role('hospital_admin', hospital_id)
    OR nurse_user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.staff_affiliations sa
      WHERE sa.user_id = auth.uid()
        AND sa.hospital_id = nursing_assignments.hospital_id
        AND sa.state IN ('active','approved')
    )
  );
-- Writes go through Edge Functions only (assignment is a sensitive
-- operation — only the ward in-charge or hospital admin should do it).

DROP TRIGGER IF EXISTS nursing_assignments_updated_at ON public.nursing_assignments;
CREATE TRIGGER nursing_assignments_updated_at
  BEFORE UPDATE ON public.nursing_assignments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS audit_nursing_assignments ON public.nursing_assignments;
CREATE TRIGGER audit_nursing_assignments
  AFTER INSERT OR UPDATE OR DELETE ON public.nursing_assignments
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_changes();


-- ─── 2. ward_in_charge_assignments ─────────────────────────────────
CREATE TABLE public.ward_in_charge_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  ward_id uuid NOT NULL REFERENCES public.hospital_wards(id) ON DELETE CASCADE,
  nurse_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  starts_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz,
  set_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT wic_time_order CHECK (ends_at IS NULL OR ends_at >= starts_at)
);
-- One active in-charge per ward at a time (partial unique).
CREATE UNIQUE INDEX ward_in_charge_one_active
  ON public.ward_in_charge_assignments (ward_id) WHERE ends_at IS NULL;
CREATE INDEX ward_in_charge_nurse_idx
  ON public.ward_in_charge_assignments (nurse_user_id, starts_at DESC);

ALTER TABLE public.ward_in_charge_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ward_in_charge_assignments FORCE ROW LEVEL SECURITY;

CREATE POLICY ward_in_charge_select_scoped ON public.ward_in_charge_assignments
  FOR SELECT TO authenticated
  USING (
    public.user_has_role('superadmin')
    OR public.user_has_role('hospital_admin', hospital_id)
    OR nurse_user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.staff_affiliations sa
      WHERE sa.user_id = auth.uid()
        AND sa.hospital_id = ward_in_charge_assignments.hospital_id
        AND sa.state IN ('active','approved')
    )
  );

DROP TRIGGER IF EXISTS ward_in_charge_updated_at ON public.ward_in_charge_assignments;
CREATE TRIGGER ward_in_charge_updated_at
  BEFORE UPDATE ON public.ward_in_charge_assignments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS audit_ward_in_charge ON public.ward_in_charge_assignments;
CREATE TRIGGER audit_ward_in_charge
  AFTER INSERT OR UPDATE OR DELETE ON public.ward_in_charge_assignments
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_changes();


-- ─── 3. clinical_observations ───────────────────────────────────────
-- Distinct from public.personal_health_logs (patient-private,
-- migration 0029). This is the general clinical observation table —
-- nurse-recorded today; clinician-prescribed monitoring writes land
-- here when the monitoring engine ships.
CREATE TABLE public.clinical_observations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  patient_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  encounter_id uuid REFERENCES public.encounters(id) ON DELETE SET NULL,
  recorded_by_user_id uuid NOT NULL REFERENCES auth.users(id),

  observation_kind text NOT NULL,
    -- 'bp' | 'hr' | 'temperature' | 'rr' | 'spo2' | 'glucose' | 'pain'
    -- | 'weight' | 'height' | 'intake' | 'output' | 'gcs' | 'other'
  numeric_value_1 numeric,
  numeric_value_2 numeric,
  unit text,
  pain_scale text,
    -- 'nrs_0_10' | 'wong_baker' | 'flacc'
  notes text,
  recorded_at timestamptz NOT NULL DEFAULT now(),

  state text NOT NULL DEFAULT 'active',
    -- 'active' | 'corrected' (superseded by another row)
  corrected_by_observation_id uuid REFERENCES public.clinical_observations(id),

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT obs_kind_check CHECK (observation_kind IN (
    'bp','hr','temperature','rr','spo2','glucose','pain',
    'weight','height','intake','output','gcs','other'
  )),
  CONSTRAINT obs_state_check CHECK (state IN ('active','corrected'))
);
CREATE INDEX clinical_observations_patient_kind_idx
  ON public.clinical_observations (patient_user_id, observation_kind, recorded_at DESC);
CREATE INDEX clinical_observations_recorded_by_idx
  ON public.clinical_observations (recorded_by_user_id, recorded_at DESC);
CREATE INDEX clinical_observations_patient_recent_idx
  ON public.clinical_observations (patient_user_id, recorded_at DESC)
  WHERE state = 'active';

ALTER TABLE public.clinical_observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clinical_observations FORCE ROW LEVEL SECURITY;

-- SELECT: superadmin all; the recorder sees their own; the patient
-- sees their own (transparency); any active clinical-staff member at
-- the hospital sees them (read access is broad among clinical staff;
-- writes are via Edge Function and respect patient-access-basis).
CREATE POLICY clinical_observations_select_scoped ON public.clinical_observations
  FOR SELECT TO authenticated
  USING (
    public.user_has_role('superadmin')
    OR patient_user_id = auth.uid()
    OR recorded_by_user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.staff_affiliations sa
      WHERE sa.user_id = auth.uid()
        AND sa.hospital_id = clinical_observations.hospital_id
        AND sa.state IN ('active','approved')
    )
  );
-- No write policy for authenticated — Edge Function (ha-record-observation)
-- owns writes + enforces patient-access basis.

DROP TRIGGER IF EXISTS clinical_observations_updated_at ON public.clinical_observations;
CREATE TRIGGER clinical_observations_updated_at
  BEFORE UPDATE ON public.clinical_observations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS audit_clinical_observations ON public.clinical_observations;
CREATE TRIGGER audit_clinical_observations
  AFTER INSERT OR UPDATE OR DELETE ON public.clinical_observations
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_changes();


-- ─── 4. medication_administration_records ──────────────────────────
CREATE TABLE public.medication_administration_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  patient_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  encounter_id uuid REFERENCES public.encounters(id) ON DELETE SET NULL,
  administered_by_user_id uuid NOT NULL REFERENCES auth.users(id),
  cosigned_by_user_id uuid REFERENCES auth.users(id),

  -- Prescription seam: TEXT until the prescribing engine lands.
  prescription_id text,
  drug_name text NOT NULL,
  dose text NOT NULL,
  route text NOT NULL,
    -- 'oral' | 'iv' | 'im' | 'sc' | 'topical' | 'inhaled' | 'pr' | 'other'
  is_high_alert boolean NOT NULL DEFAULT false,

  state text NOT NULL,
    -- 'administered' | 'withheld' | 'refused' | 'wasted'
  withheld_reason text,
  scheduled_for timestamptz,
  administered_at timestamptz NOT NULL DEFAULT now(),
  notes text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT mar_state_check CHECK (state IN
    ('administered','withheld','refused','wasted')),
  CONSTRAINT mar_route_check CHECK (route IN
    ('oral','iv','im','sc','topical','inhaled','pr','other')),
  CONSTRAINT mar_withheld_reason CHECK (
    state = 'administered' OR withheld_reason IS NOT NULL
  )
);
CREATE INDEX mar_patient_idx
  ON public.medication_administration_records (patient_user_id, administered_at DESC);
CREATE INDEX mar_administered_by_idx
  ON public.medication_administration_records (administered_by_user_id, administered_at DESC);

ALTER TABLE public.medication_administration_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.medication_administration_records FORCE ROW LEVEL SECURITY;

CREATE POLICY mar_select_scoped ON public.medication_administration_records
  FOR SELECT TO authenticated
  USING (
    public.user_has_role('superadmin')
    OR patient_user_id = auth.uid()
    OR administered_by_user_id = auth.uid()
    OR cosigned_by_user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.staff_affiliations sa
      WHERE sa.user_id = auth.uid()
        AND sa.hospital_id = medication_administration_records.hospital_id
        AND sa.state IN ('active','approved')
    )
  );
-- No write policy for authenticated — Edge Function (ha-administer-medication)
-- owns writes + enforces cadre/cosign policy.

DROP TRIGGER IF EXISTS mar_updated_at ON public.medication_administration_records;
CREATE TRIGGER mar_updated_at
  BEFORE UPDATE ON public.medication_administration_records
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS audit_mar ON public.medication_administration_records;
CREATE TRIGGER audit_mar
  AFTER INSERT OR UPDATE OR DELETE ON public.medication_administration_records
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_changes();


-- ─── 5. shift_handovers ────────────────────────────────────────────
CREATE TABLE public.shift_handovers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  ward_id uuid NOT NULL REFERENCES public.hospital_wards(id) ON DELETE CASCADE,
  submitted_by_user_id uuid NOT NULL REFERENCES auth.users(id),

  shift_label text NOT NULL,
    -- 'day' | 'evening' | 'night' | 'custom'
  summary text NOT NULL,
  patients_of_concern jsonb,
    -- [{patient_user_id, concern, action_due}, ...]
  submitted_at timestamptz NOT NULL DEFAULT now(),

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT sh_shift_label_check CHECK (shift_label IN
    ('day','evening','night','custom'))
);
CREATE INDEX shift_handovers_ward_recent_idx
  ON public.shift_handovers (ward_id, submitted_at DESC);
CREATE INDEX shift_handovers_hospital_recent_idx
  ON public.shift_handovers (hospital_id, submitted_at DESC);

ALTER TABLE public.shift_handovers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shift_handovers FORCE ROW LEVEL SECURITY;

CREATE POLICY shift_handovers_select_scoped ON public.shift_handovers
  FOR SELECT TO authenticated
  USING (
    public.user_has_role('superadmin')
    OR public.user_has_role('hospital_admin', hospital_id)
    OR submitted_by_user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.staff_affiliations sa
      WHERE sa.user_id = auth.uid()
        AND sa.hospital_id = shift_handovers.hospital_id
        AND sa.state IN ('active','approved')
    )
  );
-- No write policy for authenticated — Edge Function (ha-submit-handover) only.

DROP TRIGGER IF EXISTS shift_handovers_updated_at ON public.shift_handovers;
CREATE TRIGGER shift_handovers_updated_at
  BEFORE UPDATE ON public.shift_handovers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS audit_shift_handovers ON public.shift_handovers;
CREATE TRIGGER audit_shift_handovers
  AFTER INSERT OR UPDATE OR DELETE ON public.shift_handovers
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_changes();


-- ─── 6. clinical_cosign_policies / requests action_kind widening ───
ALTER TABLE public.clinical_cosign_policies
  DROP CONSTRAINT IF EXISTS cosign_policy_action_check;
ALTER TABLE public.clinical_cosign_policies
  ADD CONSTRAINT cosign_policy_action_check CHECK (action_kind IN (
    'prescription_routine','prescription_controlled',
    'order_high_cost_imaging','admit_patient','discharge_patient',
    'high_alert_med_administration','independent_complex_procedure'
  ));

ALTER TABLE public.clinical_cosign_requests
  DROP CONSTRAINT IF EXISTS cosign_action_kind_check;
ALTER TABLE public.clinical_cosign_requests
  ADD CONSTRAINT cosign_action_kind_check CHECK (action_kind IN (
    'prescription_routine','prescription_controlled',
    'order_high_cost_imaging','admit_patient','discharge_patient',
    'high_alert_med_administration','independent_complex_procedure'
  ));


-- ─── 7. Default policy seed (nursing cadres) ───────────────────────
-- One hospital-wide row per (cadre, action) for every active hospital.
-- Per the GATE A §6.6 matrix. (Grade-level distinction inside NURSE
-- — enrolled vs registered — enforced in the application layer by
-- reading staff_affiliations.cadre_grade_id.)
INSERT INTO public.clinical_cosign_policies
  (hospital_id, department_id, cadre_code, action_kind, requirement, notes)
SELECT
  h.id, NULL, p.cadre_code, p.action_kind, p.requirement,
  'Default seeded by migration 0031 (nursing).'
FROM public.hospitals h
CROSS JOIN (
  VALUES
    -- NURSE — the application layer downgrades ENROLLED to cosign on
    -- 'allowed' high-alert via cadre_grade lookup; the table default
    -- is registered-level.
    ('NURSE',            'high_alert_med_administration', 'allowed'),
    ('NURSE',            'independent_complex_procedure', 'cosign_required'),
    -- MIDWIFE mirrors NURSE.
    ('MIDWIFE',          'high_alert_med_administration', 'allowed'),
    ('MIDWIFE',          'independent_complex_procedure', 'cosign_required'),
    -- SPECIALIST_NURSE — full scope.
    ('SPECIALIST_NURSE', 'high_alert_med_administration', 'allowed'),
    ('SPECIALIST_NURSE', 'independent_complex_procedure', 'allowed')
) AS p(cadre_code, action_kind, requirement)
WHERE h.state = 'active'
ON CONFLICT DO NOTHING;


-- ─── 8. sa_audit_log widening ──────────────────────────────────────
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
      -- New (nursing)
      'record_observation', 'correct_observation',
      'administer_medication', 'withhold_medication',
      'submit_handover',
      'assign_patient_to_nurse', 'unassign_patient_from_nurse',
      'assign_ward_in_charge', 'end_ward_in_charge',
      'escalate_to_medical_team'
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
      -- New (nursing)
      'nursing_assignment', 'ward_in_charge_assignment',
      'clinical_observation', 'medication_administration_record',
      'shift_handover'
    )
  );
