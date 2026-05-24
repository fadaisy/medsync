-- ─────────────────────────────────────────────────────────────────────────
-- 0018_superadmin_workspace
--
-- Superadmin workspace (kickoff section 1–5). Adds the operational
-- state tables behind four-eyes wiring, break-glass patient access,
-- and in-app notifications, plus two small additive column adds on
-- Phase 0 tables (hospitals.state + users suspension trio).
--
-- Tables added (all RLS deny-by-default + FORCE + audit trigger):
--   1. sa_pending_approvals  — four-eyes intent + state machine
--   2. sa_break_glass_grants — time-boxed patient-record grants
--   3. sa_notifications      — in-app alerts (break-glass MVP)
--
-- Column adds (additive — never edits a shipped migration's columns):
--   - public.hospitals.state            lifecycle_state default 'active'
--   - public.users.suspended_by         uuid (who suspended)
--   - public.users.suspended_at         timestamptz
--   - public.users.suspension_reason    text
--
-- sa_audit_log.action enum extended with break_glass_open /
-- break_glass_close (additive enum-list update — see ALTER below).
-- ─────────────────────────────────────────────────────────────────────────

-- ─── Column additions on Phase 0 tables ─────────────────────────────────

ALTER TABLE public.hospitals
  ADD COLUMN IF NOT EXISTS state public.lifecycle_state NOT NULL DEFAULT 'active';

CREATE INDEX IF NOT EXISTS hospitals_state_idx ON public.hospitals(state);

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS suspended_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS suspended_at timestamptz,
  ADD COLUMN IF NOT EXISTS suspension_reason text;

-- Defence: if state isn't 'suspended' the trio should stay null. CHECK
-- enforces the pairing so a bug can't write suspended_by without a
-- matching state, or leave a stale suspended_by after re-activation.
ALTER TABLE public.users
  ADD CONSTRAINT users_suspension_pair CHECK (
    (state = 'suspended'
      AND suspended_by IS NOT NULL
      AND suspended_at IS NOT NULL
      AND suspension_reason IS NOT NULL)
    OR
    (state <> 'suspended'
      AND suspended_by IS NULL
      AND suspended_at IS NULL
      AND suspension_reason IS NULL)
  );

-- ─── sa_audit_log.action enum extension ─────────────────────────────────
-- The CHECK in migration 0015 hard-codes the allowed action strings.
-- Drop and re-create with the new values added.

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
    -- New in GATE A/F:
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
    'export_audit_log'
  )
);

-- target_kind enum extension (additive)
ALTER TABLE public.sa_audit_log DROP CONSTRAINT IF EXISTS sa_audit_log_target_kind_check;
ALTER TABLE public.sa_audit_log ADD CONSTRAINT sa_audit_log_target_kind_check CHECK (
  target_kind IN (
    'staff_affiliation',
    'hospital_application',
    'hospital',
    'user',
    'patient_profile',
    -- New:
    'pending_approval',
    'break_glass_grant',
    'audit_log_export'
  )
);

-- ─── sa_pending_approvals ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.sa_pending_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  target_kind text NOT NULL,
  target_id text NOT NULL,
  requested_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  requested_at timestamptz NOT NULL DEFAULT now(),
  justification text NOT NULL,
  state text NOT NULL DEFAULT 'pending_second_approval',
  approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at timestamptz,
  executed_at timestamptz,
  execution_error text,
  cancelled_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  cancelled_at timestamptz,
  cancellation_reason text,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT sa_pending_approvals_action_check CHECK (action IN (
    'deactivate_tenant',
    'suspend_tenant',
    'deactivate_superadmin',
    'demote_superadmin',
    'bulk_export',
    'edit_permission_mapping',
    'delete_reference_data'
  )),
  CONSTRAINT sa_pending_approvals_target_kind_check CHECK (target_kind IN (
    'hospital',
    'user',
    'role_permission',
    'reference_data',
    'export'
  )),
  CONSTRAINT sa_pending_approvals_state_check CHECK (state IN (
    'pending_second_approval',
    'auto_satisfied',
    'executed',
    'cancelled',
    'expired'
  )),
  CONSTRAINT sa_pending_approvals_justification_min CHECK (length(trim(justification)) >= 8),
  CONSTRAINT sa_pending_approvals_two_eyes CHECK (
    approved_by IS NULL OR approved_by <> requested_by
  ),
  CONSTRAINT sa_pending_approvals_auto_satisfied_pair CHECK (
    state <> 'auto_satisfied'
    OR (approved_by IS NULL AND executed_at IS NOT NULL)
  ),
  CONSTRAINT sa_pending_approvals_executed_pair CHECK (
    state <> 'executed' OR executed_at IS NOT NULL
  ),
  CONSTRAINT sa_pending_approvals_cancelled_pair CHECK (
    state <> 'cancelled'
    OR (cancelled_at IS NOT NULL AND cancellation_reason IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS sa_pending_approvals_state_expires_idx
  ON public.sa_pending_approvals (state, expires_at);
CREATE INDEX IF NOT EXISTS sa_pending_approvals_requested_by_idx
  ON public.sa_pending_approvals (requested_by, requested_at DESC);
CREATE INDEX IF NOT EXISTS sa_pending_approvals_target_idx
  ON public.sa_pending_approvals (target_kind, target_id);

DROP TRIGGER IF EXISTS audit_sa_pending_approvals ON public.sa_pending_approvals;
CREATE TRIGGER audit_sa_pending_approvals
  AFTER INSERT OR UPDATE OR DELETE ON public.sa_pending_approvals
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_changes();

ALTER TABLE public.sa_pending_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sa_pending_approvals FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sa_pending_approvals_select_superadmin ON public.sa_pending_approvals;
CREATE POLICY sa_pending_approvals_select_superadmin
  ON public.sa_pending_approvals
  FOR SELECT
  TO authenticated
  USING (public.user_has_role('superadmin'));

-- ─── sa_break_glass_grants ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.sa_break_glass_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  patient_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  purpose text NOT NULL,
  category text NOT NULL,
  granted_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '15 minutes'),
  revoked_at timestamptz,
  revoked_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  revocation_reason text,
  hospital_id uuid REFERENCES public.hospitals(id) ON DELETE SET NULL,
  notified_at timestamptz,
  sa_audit_log_id bigint NOT NULL REFERENCES public.sa_audit_log(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT sa_break_glass_category_check CHECK (category IN (
    'emergency',
    'regulator_request',
    'safety_review',
    'research_per_pdc',
    'other'
  )),
  CONSTRAINT sa_break_glass_expires_after_grant CHECK (expires_at > granted_at),
  CONSTRAINT sa_break_glass_purpose_min CHECK (length(trim(purpose)) >= 16),
  CONSTRAINT sa_break_glass_revocation_trio CHECK (
    (revoked_at IS NULL AND revoked_by IS NULL AND revocation_reason IS NULL)
    OR
    (revoked_at IS NOT NULL AND revocation_reason IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS sa_break_glass_expires_idx
  ON public.sa_break_glass_grants (expires_at);
CREATE INDEX IF NOT EXISTS sa_break_glass_actor_idx
  ON public.sa_break_glass_grants (actor_id, granted_at DESC);
CREATE INDEX IF NOT EXISTS sa_break_glass_patient_idx
  ON public.sa_break_glass_grants (patient_id);

DROP TRIGGER IF EXISTS audit_sa_break_glass_grants ON public.sa_break_glass_grants;
CREATE TRIGGER audit_sa_break_glass_grants
  AFTER INSERT OR UPDATE OR DELETE ON public.sa_break_glass_grants
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_changes();

ALTER TABLE public.sa_break_glass_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sa_break_glass_grants FORCE ROW LEVEL SECURITY;

-- Patient sees grants on themselves (transparency). Hospital admin of
-- the patient's hospital sees grants in their tenant. Superadmin sees
-- everything (oversight).
DROP POLICY IF EXISTS sa_break_glass_grants_select_scoped ON public.sa_break_glass_grants;
CREATE POLICY sa_break_glass_grants_select_scoped
  ON public.sa_break_glass_grants
  FOR SELECT
  TO authenticated
  USING (
    public.user_has_role('superadmin')
    OR patient_id = auth.uid()
    OR (hospital_id IS NOT NULL AND public.user_has_role('hospital_admin', hospital_id))
  );

-- ─── sa_notifications ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.sa_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL,
  subject text NOT NULL,
  body text NOT NULL,
  related_kind text,
  related_id text,
  delivered_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz,
  dismissed_at timestamptz,

  CONSTRAINT sa_notifications_kind_check CHECK (kind IN (
    'break_glass_access',
    'admin_action_on_tenant',
    'account_security'
  ))
);

CREATE INDEX IF NOT EXISTS sa_notifications_recipient_idx
  ON public.sa_notifications (recipient_user_id, read_at, delivered_at DESC);

ALTER TABLE public.sa_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sa_notifications FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sa_notifications_select_scoped ON public.sa_notifications;
CREATE POLICY sa_notifications_select_scoped
  ON public.sa_notifications
  FOR SELECT
  TO authenticated
  USING (
    recipient_user_id = auth.uid()
    OR public.user_has_role('superadmin')
  );

DROP POLICY IF EXISTS sa_notifications_update_own ON public.sa_notifications;
CREATE POLICY sa_notifications_update_own
  ON public.sa_notifications
  FOR UPDATE
  TO authenticated
  USING (recipient_user_id = auth.uid())
  WITH CHECK (recipient_user_id = auth.uid());

-- Only read_at + dismissed_at are user-editable. Revoke UPDATE on
-- every other column so a malicious authenticated user can't rewrite
-- the message body or recipient.
REVOKE UPDATE (
  recipient_user_id, kind, subject, body, related_kind, related_id, delivered_at
) ON public.sa_notifications FROM authenticated;
