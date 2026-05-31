-- 0037 — Triage Red/Orange in-app notifications.
--
-- Per docs/triage-engine-gate-a-proposal.md §G.1 (R2): a high-acuity
-- triage outcome alerts the receiving department's clinical staff in
-- app NOW; SMS/push ride a stubbed NotificationSink until a dedicated
-- dispatcher build. This migration only widens the notification-kind
-- CHECK so the existing sa_notifications table (single recipient,
-- own-row RLS) can carry a triage alert. The triage action fans out
-- one row per active clinical staff member at the department.
--
-- Additive only.
ALTER TABLE public.sa_notifications
  DROP CONSTRAINT IF EXISTS sa_notifications_kind_check;
ALTER TABLE public.sa_notifications
  ADD CONSTRAINT sa_notifications_kind_check CHECK (
    kind IN (
      'break_glass_access',
      'admin_action_on_tenant',
      'account_security',
      -- New (triage, migration 0037): a Red/Orange triage outcome for a
      -- patient arriving in the recipient's department.
      'clinical_triage_alert'
    )
  );
