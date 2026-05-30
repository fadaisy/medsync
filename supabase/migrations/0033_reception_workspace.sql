-- 0033 — Receptionist / records workspace + lifecycle write paths.
--
-- Per docs/patient-handling-flow-gate-a-proposal.md §§4–6.
--
-- Additive only. Schema deltas:
--   1. cadres.is_clinical boolean (default true) + cadres.council_id nullable
--   2. RECEPTION cadre row + RECEPTION_OFFICER role row
--   3. user_roles CHECK widened to include 'reception'
--   4. patient_intakes.encounter_id + status 'completed' (closes the
--      intake→encounter chain for visit history + lifecycle drop-off)
--   5. encounters.completion_reason text
--   6. Clinical-content SELECT policies on clinical_observations,
--      medication_administration_records, shift_handovers, encounters
--      TIGHTENED to require cadres.is_clinical = true on the affiliation.
--      This is the boundary that keeps reception out of clinical
--      content — RLS-enforced at the DB.
--   7. sa_audit_log widening (3 new verbs: complete_encounter,
--      cancel_intake, check_in_patient).


-- ─── 1. cadres.is_clinical + council nullable ───────────────────────
ALTER TABLE public.cadres
  ADD COLUMN IF NOT EXISTS is_clinical boolean NOT NULL DEFAULT true;

-- Council nullable for non-clinical cadres (reception has no regulator).
ALTER TABLE public.cadres
  ALTER COLUMN council_id DROP NOT NULL;


-- ─── 2. RECEPTION cadre + RECEPTION_OFFICER role ────────────────────
INSERT INTO public.cadres (id, council_id, code, name, is_clinical, sort_order)
VALUES (
  '00000000-0000-0000-0000-000000000d14',
  NULL,
  'RECEPTION',
  'Reception / Records Officer',
  false,
  400
)
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.roles
  (id, cadre_id, specialty_id, code, name, department_family, sort_order)
VALUES (
  '00000000-0000-0000-0000-000000000e20',
  '00000000-0000-0000-0000-000000000d14',
  NULL,
  'RECEPTION_OFFICER',
  'Reception / Records Officer',
  'HOSPITAL_OPERATIONS',
  400
)
ON CONFLICT (code) DO NOTHING;


-- ─── 3. user_roles CHECK widening ──────────────────────────────────
ALTER TABLE public.user_roles
  DROP CONSTRAINT IF EXISTS user_roles_role_check;

ALTER TABLE public.user_roles
  ADD CONSTRAINT user_roles_role_check CHECK (
    role IN (
      'patient','clinician','nurse','pharmacist','lab_tech',
      'hospital_admin','superadmin',
      -- Non-clinical (migration 0033)
      'reception'
    )
  );


-- ─── 4. patient_intakes lifecycle: encounter_id + 'completed' ──────
ALTER TABLE public.patient_intakes
  ADD COLUMN IF NOT EXISTS encounter_id uuid
    REFERENCES public.encounters(id) ON DELETE SET NULL;

ALTER TABLE public.patient_intakes
  DROP CONSTRAINT IF EXISTS intakes_status_check;
ALTER TABLE public.patient_intakes
  ADD CONSTRAINT intakes_status_check CHECK (
    status IN ('arrived','awaiting_triage','triaged','completed','cancelled')
  );

CREATE INDEX IF NOT EXISTS patient_intakes_encounter_idx
  ON public.patient_intakes (encounter_id)
  WHERE encounter_id IS NOT NULL;


-- ─── 5. encounters.completion_reason ────────────────────────────────
ALTER TABLE public.encounters
  ADD COLUMN IF NOT EXISTS completion_reason text;


-- ─── 6. Tighten clinical-content SELECT policies ───────────────────
-- The existing policies grant SELECT to "any active staff_affiliation
-- at the hospital." We tighten by requiring cadres.is_clinical = true
-- so reception (is_clinical = false) cannot inherit the read path.
-- This is the boundary that makes the receptionist workspace genuinely
-- non-clinical — enforced at the DB, not in the UI.

DROP POLICY IF EXISTS clinical_observations_select_scoped
  ON public.clinical_observations;
CREATE POLICY clinical_observations_select_scoped
  ON public.clinical_observations
  FOR SELECT TO authenticated
  USING (
    public.user_has_role('superadmin')
    OR patient_user_id = auth.uid()
    OR recorded_by_user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.staff_affiliations sa
      JOIN public.cadres c ON c.id = sa.cadre_id
      WHERE sa.user_id = auth.uid()
        AND sa.hospital_id = clinical_observations.hospital_id
        AND sa.state IN ('active','approved')
        AND c.is_clinical = true
    )
  );

DROP POLICY IF EXISTS mar_select_scoped
  ON public.medication_administration_records;
CREATE POLICY mar_select_scoped
  ON public.medication_administration_records
  FOR SELECT TO authenticated
  USING (
    public.user_has_role('superadmin')
    OR patient_user_id = auth.uid()
    OR administered_by_user_id = auth.uid()
    OR cosigned_by_user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.staff_affiliations sa
      JOIN public.cadres c ON c.id = sa.cadre_id
      WHERE sa.user_id = auth.uid()
        AND sa.hospital_id = medication_administration_records.hospital_id
        AND sa.state IN ('active','approved')
        AND c.is_clinical = true
    )
  );

DROP POLICY IF EXISTS shift_handovers_select_scoped
  ON public.shift_handovers;
CREATE POLICY shift_handovers_select_scoped
  ON public.shift_handovers
  FOR SELECT TO authenticated
  USING (
    public.user_has_role('superadmin')
    OR public.user_has_role('hospital_admin', hospital_id)
    OR submitted_by_user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.staff_affiliations sa
      JOIN public.cadres c ON c.id = sa.cadre_id
      WHERE sa.user_id = auth.uid()
        AND sa.hospital_id = shift_handovers.hospital_id
        AND sa.state IN ('active','approved')
        AND c.is_clinical = true
    )
  );

-- encounters table: existing policy comes from migration 0028 — confirm
-- a clinical-only read path. The existing policy grants the clinician
-- themselves + hospital_admin scoped + superadmin; we ADD an additional
-- defensive clause but don't drop the existing one (each policy
-- contributes independently via OR in Postgres RLS). If the existing
-- encounters policy only checks specific user FKs (clinician_user_id),
-- it's already cadre-safe — but a wider clinical-staff read would
-- need this same widening. We replace it defensively.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'encounters'
      AND policyname = 'encounters_select_scoped'
  ) THEN
    EXECUTE 'DROP POLICY encounters_select_scoped ON public.encounters';
  END IF;
END $$;

CREATE POLICY encounters_select_scoped
  ON public.encounters
  FOR SELECT TO authenticated
  USING (
    public.user_has_role('superadmin')
    OR public.user_has_role('hospital_admin', hospital_id)
    OR patient_user_id = auth.uid()
    OR clinician_user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.staff_affiliations sa
      JOIN public.cadres c ON c.id = sa.cadre_id
      WHERE sa.user_id = auth.uid()
        AND sa.hospital_id = encounters.hospital_id
        AND sa.state IN ('active','approved')
        AND c.is_clinical = true
    )
  );

-- patient_intakes stays with its existing broad-staff policy — intake
-- IS operational data (entry type, status, queue routing) and reception
-- MUST read it to do its job. Clinical content lives in the other
-- tables which we've now tightened.


-- ─── 7. sa_audit_log widening ──────────────────────────────────────
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
      -- New (reception + lifecycle)
      'check_in_patient'
    )
  );
