-- 0054 — sa_audit_log accepts 'set_emergency_phone'.
--
-- ⚠️ GATED — DO NOT APPLY TO PRODUCTION WITHOUT EXPLICIT, NAMED OWNER
-- AUTHORIZATION. Apply via `npm run db:migrate`.
--
-- ⚠️ SEQUENCING — this must land BEFORE `sa-set-emergency-phone` is deployed,
-- and it is the thing that makes that function work at all. The function
-- audits BEFORE it mutates (GATE F), so with the old constraint in place
-- `recordSaAudit` raises, the function returns 500 "audit write failed", and
-- hospitals.emergency_phone is NOT written. Failing closed is the correct
-- direction — but until this lands, migration 0053's column is still a column
-- read by six patient files and written by nothing.
--
-- Migration 0053 added `hospitals.emergency_phone`; ADR 0084 §3 makes a
-- superadmin recording a DIALLED number the only way one gets there. That
-- write needs a verb, and no existing verb fits: `activate_hospital` would
-- falsify the activation trail (the number is set at any time, deliberately
-- decoupled from activation, because Mulago and the test tenant are already
-- `active` and could never be reached through it), and there is no
-- `update_hospital`. So: one new value.
--
-- `sa_audit_log_target_kind_check` is untouched — 'hospital' has been in it
-- since 0015.
--
-- ADDITIVE. DROP-then-ADD is the house pattern for this constraint
-- (0025/0027/0028/0030/0031/0032/0033/0035/0036/0038); the list below is
-- migration 0038's verbatim, plus one line. Every existing row still passes.

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
      -- New (resus, migration 0038)
      'open_resus_episode', 'conclude_resus_episode',
      'record_resus_event', 'correct_resus_event',
      'assign_resus_role', 'end_resus_role',
      'mobilise_resus_team', 'detect_resus_arrest',
      -- New (emergency phone, migration 0054)
      'set_emergency_phone'
    )
  );
