-- 0062 — Low-bandwidth channels: USSD and inbound SMS (Gate F, ADR 0091).
--
-- ⚠️ GATED — DO NOT APPLY TO PRODUCTION WITHOUT EXPLICIT, NAMED OWNER
-- AUTHORIZATION. Apply via `npm run db:migrate`.
--
-- docs/booking-app-gate-a-proposal.md §5.12, §10 row F; PRD §3.2 journey 2,
-- §3.3.7, §4.5, §4.7, §6.4; ADR 0091.
--
-- Additive throughout. Sections, in order:
--   1. ussd_sessions                 resumable menu state (§5.12), service-role only
--   2. inbound_sms                   every inbound SMS once (idempotency on AT's id)
--   3. sms_opt_outs                  STOP by phone — stronger than consent, covers
--                                    provisional phones that hold no account
--   4. patient_profiles.phone_hmac   the blind index USSD/SMS look a caller up by
--   5. appointments_origin_check     + 'ussd'
--   6. notification_dispatches       hospital_id nullable (a platform reply has
--                                    no facility); kind + 'sms_reply';
--                                    related_kind + 'inbound_sms'
--   7. sa_audit_log CHECKs           + 'sms_stop'


-- ─── 1. ussd_sessions ────────────────────────────────────────────────
--
-- One row per Africa's Talking `sessionId`. The route loads it, runs the
-- pure machine (`lib/channels/ussd.ts`), stores `step` + `selections` back,
-- and answers. `last_input` / `last_reply` make a replayed callback (same
-- sessionId + text) return the same screen and do nothing twice.
--
-- The phone is ciphertext + blind index, like provisional_patients. Zero
-- RLS policies: nobody but the service role reads or writes this table.
-- Rows expire ten minutes after the last step and are swept by the
-- cleanup-drafts cron.

CREATE TABLE IF NOT EXISTS public.ussd_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_session_id text NOT NULL,
  phone_encrypted text NOT NULL,
  phone_hmac text NOT NULL,
  language text NOT NULL DEFAULT 'en',
  step text NOT NULL DEFAULT 'root',
  selections jsonb NOT NULL DEFAULT '{}'::jsonb,
  hospital_id uuid REFERENCES public.hospitals(id) ON DELETE SET NULL,
  service_line_id uuid REFERENCES public.service_lines(id) ON DELETE SET NULL,
  provisional_patient_id uuid REFERENCES public.provisional_patients(id) ON DELETE SET NULL,
  last_input text,
  last_reply text,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '10 minutes'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT ussd_sessions_provider_unique UNIQUE (provider_session_id)
);
CREATE INDEX IF NOT EXISTS ussd_sessions_expires_idx ON public.ussd_sessions (expires_at);
-- The per-phone rate limit: sessions this phone opened in the last hour.
CREATE INDEX IF NOT EXISTS ussd_sessions_phone_created_idx
  ON public.ussd_sessions (phone_hmac, created_at);

ALTER TABLE public.ussd_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ussd_sessions FORCE ROW LEVEL SECURITY;
-- No policies: service-role only.

DROP TRIGGER IF EXISTS ussd_sessions_updated_at ON public.ussd_sessions;
CREATE TRIGGER ussd_sessions_updated_at
  BEFORE UPDATE ON public.ussd_sessions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ─── 2. inbound_sms ──────────────────────────────────────────────────
--
-- Every inbound SMS, once: AT's `id` is UNIQUE, so a redelivered webhook
-- inserts nothing and answers nothing. The body is NOT stored — only the
-- keyword the parser recognised and the code it carried (a booking code is
-- not PHI; the receipts already send it). The reply's dispatch row points
-- here (`related_kind = 'inbound_sms'`). Zero RLS policies.

CREATE TABLE IF NOT EXISTS public.inbound_sms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_message_id text NOT NULL,
  phone_encrypted text NOT NULL,
  phone_hmac text NOT NULL,
  keyword text NOT NULL,
  booking_code text,
  outcome text NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT inbound_sms_provider_unique UNIQUE (provider_message_id),
  CONSTRAINT inbound_sms_keyword_check CHECK (
    keyword IN ('confirm','cancel','stop','help','unknown')
  )
);
-- The per-phone rate limit: messages this phone sent in the last hour.
CREATE INDEX IF NOT EXISTS inbound_sms_phone_received_idx
  ON public.inbound_sms (phone_hmac, received_at);

ALTER TABLE public.inbound_sms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inbound_sms FORCE ROW LEVEL SECURITY;


-- ─── 3. sms_opt_outs ─────────────────────────────────────────────────
--
-- "Reply STOP to opt out" (the consent text's own promise). By PHONE, so a
-- provisional patient — who holds no account and no consent record — can
-- stop too. Stronger than consent: the dispatcher refuses EVERY SMS to an
-- opted-out phone, the receipt included. An account holder's consent
-- record is revoked as well (`consent_records.revoked_at`). Re-granting in
-- the app removes the row.

CREATE TABLE IF NOT EXISTS public.sms_opt_outs (
  phone_hmac text PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.sms_opt_outs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sms_opt_outs FORCE ROW LEVEL SECURITY;


-- ─── 4. patient_profiles.phone_hmac ──────────────────────────────────
--
-- The blind index (`blindIndex()` in both runtimes) so a carrier-verified
-- USSD/SMS phone can find "my next visit" and be offered "Book as {first
-- name}?" — NEVER auto-linked (PRD §2.8). Written at signup and on every
-- phone change; NULL until then. Existing rows: `npm run db:backfill-phone-hmac`
-- (scripts/backfill-phone-hmac.ts, owner action — decrypts with MEDSYNC_PHI_KEY).

ALTER TABLE public.patient_profiles
  ADD COLUMN IF NOT EXISTS phone_hmac text;

CREATE INDEX IF NOT EXISTS patient_profiles_phone_hmac_idx
  ON public.patient_profiles (phone_hmac)
  WHERE phone_hmac IS NOT NULL;


-- ─── 5. appointments_origin_check + 'ussd' ───────────────────────────
--
-- `appointments_channel_check` already admits 'ussd' (0058). The origin
-- list is 0028's plus one.

ALTER TABLE public.appointments
  DROP CONSTRAINT IF EXISTS appointments_origin_check;
ALTER TABLE public.appointments
  ADD CONSTRAINT appointments_origin_check CHECK (
    origin IN ('patient','clinician','nurse','reception','system_urgent','walk_in','ussd')
  );


-- ─── 6. notification_dispatches: platform replies ────────────────────
--
-- A reply to STOP or to an unknown keyword belongs to no facility: the
-- cost is the platform's. hospital_id becomes nullable (a NULL row is simply
-- absent from every facility's "Sent today"). `sms_reply` joins the kinds;
-- its payload carries a reply KEY (rendered from lib/channels/strings.ts)
-- and, when there is one, the booking code — never free text.

ALTER TABLE public.notification_dispatches
  ALTER COLUMN hospital_id DROP NOT NULL;

ALTER TABLE public.notification_dispatches
  DROP CONSTRAINT IF EXISTS notification_dispatches_kind_check;
ALTER TABLE public.notification_dispatches
  ADD CONSTRAINT notification_dispatches_kind_check CHECK (
    kind IN (
      'booking_receipt','confirmation_request','reminder','arrival_window',
      'waitlist_offer','session_cancelled','window_shifted','position_called',
      'payment','deterioration_flag',
      'unconfirmed_release',
      'sms_reply'
    )
  );

ALTER TABLE public.notification_dispatches
  DROP CONSTRAINT IF EXISTS notification_dispatches_related_kind_check;
ALTER TABLE public.notification_dispatches
  ADD CONSTRAINT notification_dispatches_related_kind_check CHECK (
    related_kind IN ('appointment','waitlist_entry','clinic_session','intake','inbound_sms')
  );


-- ─── 7. sa_audit_log CHECKs re-issued ────────────────────────────────
--
-- The action list is 0061's verbatim plus `sms_stop` (an account holder
-- opted out by SMS; a provisional phone's STOP is recorded in inbound_sms
-- and sms_opt_outs — there is no user to audit against). Target kinds
-- unchanged.

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
      'set_emergency_phone',
      -- New (visit ratings, migration 0056)
      'rate_visit',
      -- New (capacity model, migration 0058 / ADR 0087)
      'update_service_line', 'update_session_template',
      'cancel_session', 'book_on_behalf',
      -- New (identity, migration 0060 / ADR 0089)
      'reconcile_identity', 'unreconcile_identity', 'add_booking_agent',
      -- New (notifications + waitlist, migration 0061 / ADR 0090)
      'join_waitlist', 'accept_waitlist_offer', 'accept_rebooking',
      'confirm_attendance', 'set_session_delay',
      -- New (low-bandwidth channels, migration 0062 / ADR 0091)
      'sms_stop'
    )
  );
