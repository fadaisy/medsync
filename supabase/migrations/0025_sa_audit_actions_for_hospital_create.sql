-- ─────────────────────────────────────────────────────────────────────────
-- 0025_sa_audit_actions_for_hospital_create
--
-- Extends the sa_audit_log.action CHECK with the three new actions
-- introduced by GATE E (superadmin-initiated hospital creation):
--
--   - sa_create_hospital            superadmin creates a hospital tenant
--   - sa_invite_hospital_admin      superadmin invites a real admin
--   - hospital_admin_claimed        invitee accepts → role granted +
--                                    roster row written
--
-- Also extends the target_kind CHECK with `hospital_admin_invitation`
-- so the invitation rows can be precisely targeted in audit queries.
-- ─────────────────────────────────────────────────────────────────────────

ALTER TABLE public.sa_audit_log DROP CONSTRAINT IF EXISTS sa_audit_log_action_check;
ALTER TABLE public.sa_audit_log ADD CONSTRAINT sa_audit_log_action_check CHECK (
  action IN (
    'approve_staff_affiliation',
    'reject_staff_affiliation',
    'approve_hospital_application',
    'reject_hospital_application',
    'cross_tenant_read',
    'cross_tenant_export',
    'elevate_admin',
    'create_superadmin',
    'demote_admin',
    'break_glass_open',
    'break_glass_close',
    'four_eyes_request',
    'four_eyes_confirm',
    'four_eyes_cancel',
    'activate_hospital',
    'suspend_user',
    'reset_user_mfa',
    'deactivate_user',
    'reactivate_user',
    'export_audit_log',
    -- GATE E (hospital-registration-upgrade)
    'sa_create_hospital',
    'sa_invite_hospital_admin',
    'hospital_admin_claimed'
  )
);

ALTER TABLE public.sa_audit_log DROP CONSTRAINT IF EXISTS sa_audit_log_target_kind_check;
ALTER TABLE public.sa_audit_log ADD CONSTRAINT sa_audit_log_target_kind_check CHECK (
  target_kind IN (
    'staff_affiliation',
    'hospital_application',
    'hospital',
    'user',
    'patient_profile',
    'pending_approval',
    'break_glass_grant',
    'audit_log_export',
    -- GATE E (hospital-registration-upgrade)
    'hospital_admin_invitation'
  )
);
