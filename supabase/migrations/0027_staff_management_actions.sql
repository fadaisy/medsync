-- GATE A of the hospital-admin staff-management feature.
--
-- Additive only. Two changes:
--   1. staff_affiliations gains a `review_note` column so an admin can
--      ask the applicant for more info without rejecting them. The
--      state stays `pending_approval`; the applicant sees the note on
--      their /onboarding/clinical-pending page and re-submits with
--      whatever was missing.
--   2. sa_audit_log's action + target_kind CHECKs widen to cover the
--      new staff-management actions every hospital-admin Edge Function
--      will record. Old action values stay accepted; this is a
--      drop-in widening, never a narrowing.
--
-- No data backfill, no destructive change, no shipped migration
-- altered.

-- ─── 1. staff_affiliations.review_note ─────────────────────────────
ALTER TABLE public.staff_affiliations
  ADD COLUMN IF NOT EXISTS review_note text;

COMMENT ON COLUMN public.staff_affiliations.review_note IS
  'Optional free-text note from the hospital admin asking the applicant '
  'for more information. State stays pending_approval. Cleared by the '
  'next approve/reject/request-info action.';

-- ─── 2. sa_audit_log CHECK widening ────────────────────────────────
ALTER TABLE public.sa_audit_log
  DROP CONSTRAINT IF EXISTS sa_audit_log_action_check;

ALTER TABLE public.sa_audit_log
  ADD CONSTRAINT sa_audit_log_action_check CHECK (
    action IN (
      -- Existing actions (mirror of migration 0025) ---------------
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
      'sa_create_hospital',
      'sa_invite_hospital_admin',
      'hospital_admin_claimed',
      -- New: hospital-admin staff-management actions --------------
      'request_staff_info',
      'suspend_staff_affiliation',
      'deactivate_staff_affiliation',
      'reactivate_staff_affiliation',
      'reset_staff_mfa',
      'assign_staff_role',
      'invite_staff',
      'revoke_staff_invitation'
    )
  );

ALTER TABLE public.sa_audit_log
  DROP CONSTRAINT IF EXISTS sa_audit_log_target_kind_check;

ALTER TABLE public.sa_audit_log
  ADD CONSTRAINT sa_audit_log_target_kind_check CHECK (
    target_kind IN (
      -- Existing target kinds ---------------
      'staff_affiliation',
      'hospital_application',
      'hospital',
      'user',
      'patient_profile',
      'break_glass_grant',
      'audit_log_export',
      'hospital_admin_invitation',
      -- New ---------------
      'staff_invitation'
    )
  );
