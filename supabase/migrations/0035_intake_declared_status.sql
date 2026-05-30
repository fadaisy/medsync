-- 0035 — Patient-initiated intake: the 'declared' status.
--
-- Per docs/book-or-queue-gate-a-proposal.md §2.
--
-- The post-primary-hospital-selection choice point lets a patient
-- declare "I'm coming today" before they physically arrive. That's a
-- new state for patient_intakes — `declared` — distinct from `arrived`
-- (physically present) so staff boards don't treat a not-yet-arrived
-- person as physically waiting.
--
-- Additive only. Schema deltas:
--   1. intakes_status_check widened to include 'declared'.
--   2. checked_in_at timestamptz — set at declared→arrived transition.
--   3. declared_by_patient boolean — explicit flag so staff boards
--      can render a chip distinguishing patient-initiated declarations
--      from staff-registered intakes.
--   4. patient_intakes_hospital_status_idx partial predicate widened
--      to include 'declared' (keeps today-board query hot).
--   5. sa_audit_log action CHECK widened with 'patient_declare_intake'.


-- ─── 1. status enum widening ──────────────────────────────────────
-- Migration 0033 already widened to add 'completed'; we widen further
-- to add 'declared'. Same DROP-then-ADD pattern.
ALTER TABLE public.patient_intakes
  DROP CONSTRAINT IF EXISTS intakes_status_check;
ALTER TABLE public.patient_intakes
  ADD CONSTRAINT intakes_status_check CHECK (
    status IN ('declared','arrived','awaiting_triage','triaged','completed','cancelled')
  );


-- ─── 2. checked_in_at ─────────────────────────────────────────────
-- Populated when reception (or auto check-in) flips a declared intake
-- to arrived. NULL on staff-created arrived rows (they're already
-- here at row creation; arrived_at carries the same timestamp).
ALTER TABLE public.patient_intakes
  ADD COLUMN IF NOT EXISTS checked_in_at timestamptz;


-- ─── 3. declared_by_patient ────────────────────────────────────────
-- Explicit flag (not inferred from "no registered_by_user_id") so the
-- staff-board chip is unambiguous. Default false keeps every existing
-- row unchanged.
ALTER TABLE public.patient_intakes
  ADD COLUMN IF NOT EXISTS declared_by_patient boolean NOT NULL DEFAULT false;


-- ─── 4. index predicate widening ───────────────────────────────────
-- Keep the partial-index hot path for the today-board query, which
-- will now also surface declared rows.
DROP INDEX IF EXISTS public.patient_intakes_hospital_status_idx;
CREATE INDEX patient_intakes_hospital_status_idx
  ON public.patient_intakes (hospital_id, status, arrived_at DESC)
  WHERE status IN ('declared','arrived','awaiting_triage');


-- ─── 5. sa_audit_log action widening ──────────────────────────────
-- Pull the existing CHECK, append 'patient_declare_intake', re-add.
-- Mirror of the migration 0033 + 0034 widening pattern.
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
      -- New (book-or-queue, migration 0035)
      'patient_declare_intake'
    )
  );
