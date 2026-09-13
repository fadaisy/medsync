-- 0061 — Notifications, waitlist, cancellation (Gate E, ADR 0090).
--
-- ⚠️ GATED — DO NOT APPLY TO PRODUCTION WITHOUT EXPLICIT, NAMED OWNER
-- AUTHORIZATION. Apply via `npm run db:migrate`.
--
-- docs/booking-app-gate-a-proposal.md §5.7, §5.11, §7; PRD §1.5, §3.2,
-- §3.3.3, §3.3.4, §3.3.6, §3.6, §4.6, §5.2; ADR 0090.
--
-- Additive throughout. Sections, in order:
--   1. notification_dispatches   the ONE outbound queue (§5.11) — every writer
--                                inserts a row here, the */15 cron drains it
--   2. push_tokens               Expo push tokens, own-row RLS
--   3. waitlist_entries          FIFO release-and-refill (§5.7)
--   3b. offer_released_capacity() the FIFO claim as ONE statement (0059's pattern)
--   4. hospitals                 quiet_hours_* (facility policy, 21:00–07:00)
--   5. department_scheduling_policy.release_unconfirmed_hours (NULL = off)
--   6. clinic_sessions.delay_minutes; appointments.confirmed_by_patient_at
--   7. consent_versions          sms_communication v1 (CSO-provisional copy)
--   8. sa_audit_log CHECKs       +5 actions, +2 target kinds
--
-- `appointment_reminders` is NOT dropped: the cron keeps draining it until
-- empty. New bookings write here instead.


-- ─── 1. notification_dispatches ──────────────────────────────────────
--
-- The "formally defined interface" of PRD §3.3.6 is this row. No body is
-- stored (PHI rule, lib/notifications/sink.ts): the dispatcher composes the
-- text from the related row at send time.
--
-- Channel policy (ADR 0090): push-first, SMS fallback. A push row carries
-- `fallback_channel='sms'` + `fallback_after`; if `acknowledged_at` is still
-- NULL by then the dispatcher inserts the SMS row (idempotency key
-- `<kind>:<related_kind>:<related_id>:sms`). `booking_receipt` and
-- `session_cancelled` are written as BOTH rows up front — always both.
--
-- state:
--   queued     due at scheduled_at
--   held       quiet hours — scheduled_at moved to the end of the window
--   sent       claimed and handed to the provider (at-most-once, as 0028)
--   delivered  provider receipt (AT delivery report / Expo receipt)
--   failed     provider refused, or no reachable recipient — failure_reason says
--   cancelled  the related row stopped being live before send
--
-- recipient: an account (recipient_user_id) OR a provisional patient's
-- phone ciphertext (recipient_phone_encrypted — copied from
-- provisional_patients at write time, same key, same wire format).
--
-- payload: ids only (a `session_cancelled` row names the next equivalent
-- session; a `window_shifted` row the delay). Never a name, never a phone.
-- Deviation from §5.11 (which has no payload column), recorded in ADR 0090.
-- kind 'unconfirmed_release' is also beyond §5.11: the message a patient
-- gets when a facility with `release_unconfirmed_hours` set releases their
-- unconfirmed place (PRD §3.2.3) — a release must never be silent.

CREATE TABLE IF NOT EXISTS public.notification_dispatches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  kind text NOT NULL,

  recipient_user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  recipient_phone_encrypted text,
  language text NOT NULL DEFAULT 'en',

  channel text NOT NULL,
  fallback_channel text,
  scheduled_at timestamptz NOT NULL,
  fallback_after timestamptz,

  state text NOT NULL DEFAULT 'queued',
  sent_at timestamptz,
  delivered_at timestamptz,
  acknowledged_at timestamptz,
  failure_reason text,

  provider_message_id text,
  cost_amount numeric(10,4),
  cost_currency text,

  idempotency_key text NOT NULL,
  related_kind text NOT NULL,
  related_id uuid NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT notification_dispatches_kind_check CHECK (
    kind IN (
      'booking_receipt','confirmation_request','reminder','arrival_window',
      'waitlist_offer','session_cancelled','window_shifted','position_called',
      'payment','deterioration_flag',
      'unconfirmed_release'
    )
  ),
  CONSTRAINT notification_dispatches_recipient_check CHECK (
    recipient_user_id IS NOT NULL OR recipient_phone_encrypted IS NOT NULL
  ),
  CONSTRAINT notification_dispatches_channel_check CHECK (
    channel IN ('push','sms','in_app')
  ),
  CONSTRAINT notification_dispatches_fallback_channel_check CHECK (
    fallback_channel IS NULL OR fallback_channel IN ('sms')
  ),
  CONSTRAINT notification_dispatches_state_check CHECK (
    state IN ('queued','sent','delivered','failed','cancelled','held')
  ),
  CONSTRAINT notification_dispatches_related_kind_check CHECK (
    related_kind IN ('appointment','waitlist_entry','clinic_session','intake')
  ),
  CONSTRAINT notification_dispatches_idempotency_unique UNIQUE (idempotency_key)
);
-- The dispatcher's scan: due rows, queued or held.
CREATE INDEX IF NOT EXISTS notification_dispatches_dispatcher_idx
  ON public.notification_dispatches (state, scheduled_at)
  WHERE state IN ('queued','held');
-- The DLR webhook's join key.
CREATE INDEX IF NOT EXISTS notification_dispatches_provider_idx
  ON public.notification_dispatches (provider_message_id)
  WHERE provider_message_id IS NOT NULL;
-- Fallback candidates: sent push rows past their fallback instant.
CREATE INDEX IF NOT EXISTS notification_dispatches_fallback_idx
  ON public.notification_dispatches (fallback_after)
  WHERE channel = 'push' AND fallback_channel IS NOT NULL AND acknowledged_at IS NULL;
-- "Sent today" per hospital (§3.4 reports seed) and the related-row lookups.
CREATE INDEX IF NOT EXISTS notification_dispatches_hospital_created_idx
  ON public.notification_dispatches (hospital_id, created_at);
CREATE INDEX IF NOT EXISTS notification_dispatches_related_idx
  ON public.notification_dispatches (related_kind, related_id);

ALTER TABLE public.notification_dispatches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_dispatches FORCE ROW LEVEL SECURITY;

-- The recipient reads their own rows (the app's notification list and the
-- ack); staff at the hospital read the facility's (the "Sent today" panel).
-- No writes for authenticated: every INSERT is an Edge Function or the cron.
DROP POLICY IF EXISTS notification_dispatches_select_recipient ON public.notification_dispatches;
CREATE POLICY notification_dispatches_select_recipient ON public.notification_dispatches
  FOR SELECT TO authenticated
  USING (recipient_user_id = auth.uid());

DROP POLICY IF EXISTS notification_dispatches_select_staff ON public.notification_dispatches;
CREATE POLICY notification_dispatches_select_staff ON public.notification_dispatches
  FOR SELECT TO authenticated
  USING (
    public.user_has_role('superadmin')
    OR public.user_has_role('hospital_admin', hospital_id)
    OR EXISTS (
      SELECT 1 FROM public.staff_affiliations sa
      WHERE sa.user_id = auth.uid()
        AND sa.hospital_id = notification_dispatches.hospital_id
        AND sa.state IN ('active','approved')
    )
  );

DROP TRIGGER IF EXISTS notification_dispatches_updated_at ON public.notification_dispatches;
CREATE TRIGGER notification_dispatches_updated_at
  BEFORE UPDATE ON public.notification_dispatches
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ─── 2. push_tokens ──────────────────────────────────────────────────
--
-- One row per device. The phone registers after sign-in and deletes on
-- sign-out; the dispatcher deletes a token Expo reports DeviceNotRegistered.
-- Own-row RLS for every verb: the token is the user's own device, and the
-- service role reads all for a send.

CREATE TABLE IF NOT EXISTS public.push_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token text NOT NULL,
  platform text NOT NULL,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT push_tokens_token_unique UNIQUE (token),
  CONSTRAINT push_tokens_platform_check CHECK (platform IN ('ios','android')),
  CONSTRAINT push_tokens_token_shape CHECK (token ~ '^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]+\]$')
);
CREATE INDEX IF NOT EXISTS push_tokens_user_idx ON public.push_tokens (user_id);

ALTER TABLE public.push_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_tokens FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS push_tokens_select_own ON public.push_tokens;
CREATE POLICY push_tokens_select_own ON public.push_tokens
  FOR SELECT TO authenticated USING (user_id = auth.uid());
DROP POLICY IF EXISTS push_tokens_insert_own ON public.push_tokens;
CREATE POLICY push_tokens_insert_own ON public.push_tokens
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS push_tokens_update_own ON public.push_tokens;
CREATE POLICY push_tokens_update_own ON public.push_tokens
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS push_tokens_delete_own ON public.push_tokens;
CREATE POLICY push_tokens_delete_own ON public.push_tokens
  FOR DELETE TO authenticated USING (user_id = auth.uid());


-- ─── 3. waitlist_entries ─────────────────────────────────────────────
--
-- Proposal §5.7, plus three columns it did not have (ADR 0090):
--   reason                   the Appendix A reason the accepted booking will
--                            carry (appointments.reason is NOT NULL and the
--                            line's reason_codes are checked at booking)
--   released_appointment_id  the cancelled/declined row whose capacity is
--                            offered — a SLOT offer needs its clinician,
--                            department and times to book through the core
--   created_by_user_id       the booking agent (PRD §2.9) for a household
--                            member's entry; the patient for their own
--
-- state: waiting → offered → accepted | expired | withdrawn. An offer is a
-- notification, not a hold (C12): the accept books through the core, and a
-- 409 there puts the entry back to `waiting` with its original created_at,
-- so the patient keeps their place in the line.
--
-- offer_expires_at is set provisionally at offer time (now + 2 h) and
-- re-stamped by the dispatcher when the offer is actually SENT (a quiet-
-- hours hold must not eat the acceptance window).

CREATE TABLE IF NOT EXISTS public.waitlist_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  service_line_id uuid NOT NULL REFERENCES public.service_lines(id) ON DELETE CASCADE,
  patient_user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  provisional_patient_id uuid REFERENCES public.provisional_patients(id) ON DELETE CASCADE,
  created_by_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  reason text NOT NULL,
  preferred_from date NOT NULL,
  preferred_to date,

  state text NOT NULL DEFAULT 'waiting',
  offered_session_id uuid REFERENCES public.clinic_sessions(id) ON DELETE SET NULL,
  offered_starts_at timestamptz,
  offer_expires_at timestamptz,
  released_appointment_id uuid REFERENCES public.appointments(id) ON DELETE SET NULL,
  accepted_appointment_id uuid REFERENCES public.appointments(id) ON DELETE SET NULL,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT waitlist_entries_member_exactly_one CHECK (
    (patient_user_id IS NOT NULL)::int + (provisional_patient_id IS NOT NULL)::int = 1
  ),
  CONSTRAINT waitlist_entries_state_check CHECK (
    state IN ('waiting','offered','accepted','expired','withdrawn')
  ),
  CONSTRAINT waitlist_entries_window_order CHECK (
    preferred_to IS NULL OR preferred_to >= preferred_from
  ),
  CONSTRAINT waitlist_entries_reason_check CHECK (
    reason IN (
      'follow_up','post_discharge','new_concern','refill','test_results',
      'antenatal','immunisation','child_wellness','specialist_review','routine',
      'procedure','counselling','second_opinion',
      'other'
    )
  ),
  CONSTRAINT waitlist_entries_offer_pair CHECK (
    state <> 'offered' OR (offered_starts_at IS NOT NULL AND offer_expires_at IS NOT NULL)
  )
);
-- Offer order is FIFO within a line.
CREATE INDEX IF NOT EXISTS waitlist_entries_line_state_idx
  ON public.waitlist_entries (service_line_id, state, created_at);
-- The expiry sweep.
CREATE INDEX IF NOT EXISTS waitlist_entries_offer_expiry_idx
  ON public.waitlist_entries (offer_expires_at)
  WHERE state = 'offered';
-- One live entry per (line, member).
CREATE UNIQUE INDEX IF NOT EXISTS waitlist_entries_live_patient_unique
  ON public.waitlist_entries (service_line_id, patient_user_id)
  WHERE state IN ('waiting','offered') AND patient_user_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS waitlist_entries_live_provisional_unique
  ON public.waitlist_entries (service_line_id, provisional_patient_id)
  WHERE state IN ('waiting','offered') AND provisional_patient_id IS NOT NULL;

ALTER TABLE public.waitlist_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.waitlist_entries FORCE ROW LEVEL SECURITY;

-- The patient reads their own; the agent the entries they created; staff at
-- the hospital all of theirs. Writes are pt-join-waitlist / pt-withdraw-
-- waitlist / pt-accept-waitlist-offer / releaseCapacity (service role).
DROP POLICY IF EXISTS waitlist_entries_select_patient ON public.waitlist_entries;
CREATE POLICY waitlist_entries_select_patient ON public.waitlist_entries
  FOR SELECT TO authenticated
  USING (patient_user_id = auth.uid());

DROP POLICY IF EXISTS waitlist_entries_select_agent ON public.waitlist_entries;
CREATE POLICY waitlist_entries_select_agent ON public.waitlist_entries
  FOR SELECT TO authenticated
  USING (created_by_user_id = auth.uid());

DROP POLICY IF EXISTS waitlist_entries_select_staff ON public.waitlist_entries;
CREATE POLICY waitlist_entries_select_staff ON public.waitlist_entries
  FOR SELECT TO authenticated
  USING (
    public.user_has_role('superadmin')
    OR public.user_has_role('hospital_admin', hospital_id)
    OR EXISTS (
      SELECT 1 FROM public.staff_affiliations sa
      WHERE sa.user_id = auth.uid()
        AND sa.hospital_id = waitlist_entries.hospital_id
        AND sa.state IN ('active','approved')
    )
  );

DROP TRIGGER IF EXISTS waitlist_entries_updated_at ON public.waitlist_entries;
CREATE TRIGGER waitlist_entries_updated_at
  BEFORE UPDATE ON public.waitlist_entries
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ─── 3b. offer_released_capacity(p_appointment) ──────────────────────
--
-- The FIFO claim, as ONE statement — the allocator's pattern (0059). Called
-- by `releaseCapacity()` in `_shared/waitlist.ts` (the three Edge release
-- hooks) and by the cron (expiry cascade, unconfirmed release), so the
-- rule "who is offered a freed place" exists once.
--
-- Given the appointment whose capacity was freed: the head of the line for
-- its service line (a slot booking: any active slot-mode line of its
-- department) whose preferred window covers the visit's local day, not the
-- patient who just freed it, FIFO by created_at, FOR UPDATE SKIP LOCKED so
-- two concurrent releases never offer the same entry. Zero rows when the
-- place is in the past, the clinic day is not published, the place has
-- already been taken again, or nobody is waiting.
--
-- The offer is a NOTIFICATION, not a hold (C12): offer_expires_at is
-- provisional (now + 2 h) and re-stamped when the offer is actually sent.
-- Returns the entry and what a `waitlist_offer` dispatch row needs — the
-- provisional's phone ciphertext included, so the caller reads nothing else.

CREATE OR REPLACE FUNCTION public.offer_released_capacity(p_appointment uuid)
RETURNS TABLE (
  entry_id uuid,
  patient_user_id uuid,
  provisional_patient_id uuid,
  phone_encrypted text,
  hospital_id uuid,
  service_line_id uuid,
  offered_session_id uuid,
  offered_starts_at timestamptz,
  offer_expires_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  a record;
  v_lines uuid[];
  v_day date;
  v_entry uuid;
BEGIN
  SELECT ap.id, ap.hospital_id, ap.department_id, ap.session_id, ap.starts_at,
         ap.clinician_user_id, ap.patient_user_id, ap.provisional_patient_id,
         cs.service_line_id, cs.status AS session_status,
         (cs.booked_count < ceil(cs.capacity_booked * cs.overbooking_factor)) AS session_has_room
    INTO a
    FROM public.appointments ap
    LEFT JOIN public.clinic_sessions cs ON cs.id = ap.session_id
   WHERE ap.id = p_appointment;
  IF NOT FOUND OR a.starts_at <= now() THEN RETURN; END IF;

  IF a.session_id IS NOT NULL THEN
    IF a.session_status <> 'published' OR NOT a.session_has_room THEN RETURN; END IF;
    v_lines := ARRAY[a.service_line_id];
  ELSE
    -- A slot is per clinician, not per line: taken again means a live row at the same start.
    IF EXISTS (
      SELECT 1 FROM public.appointments x
       WHERE x.clinician_user_id = a.clinician_user_id AND x.starts_at = a.starts_at
         AND x.session_id IS NULL
         AND x.status IN ('requested','pending_approval','confirmed','arrived','in_progress')
    ) THEN RETURN; END IF;
    SELECT coalesce(array_agg(sl.id), '{}'::uuid[]) INTO v_lines
      FROM public.service_lines sl
     WHERE sl.department_id = a.department_id AND sl.capacity_mode = 'slot' AND sl.active;
  END IF;

  v_day := (a.starts_at AT TIME ZONE 'Africa/Kampala')::date;

  UPDATE public.waitlist_entries w
     SET state = 'offered',
         offered_session_id = a.session_id,
         offered_starts_at = a.starts_at,
         offer_expires_at = now() + interval '2 hours',
         released_appointment_id = a.id
   WHERE w.id = (
     SELECT c.id FROM public.waitlist_entries c
      WHERE c.service_line_id = ANY (v_lines)
        AND c.state = 'waiting'
        AND c.preferred_from <= v_day
        AND (c.preferred_to IS NULL OR c.preferred_to >= v_day)
        AND (a.patient_user_id IS NULL OR c.patient_user_id IS DISTINCT FROM a.patient_user_id)
        AND (a.provisional_patient_id IS NULL
             OR c.provisional_patient_id IS DISTINCT FROM a.provisional_patient_id)
      ORDER BY c.created_at
      LIMIT 1
      FOR UPDATE SKIP LOCKED
   )
  RETURNING w.id INTO v_entry;
  IF v_entry IS NULL THEN RETURN; END IF;

  RETURN QUERY
    SELECT w.id, w.patient_user_id, w.provisional_patient_id, pp.phone_encrypted,
           w.hospital_id, w.service_line_id, w.offered_session_id, w.offered_starts_at,
           w.offer_expires_at
      FROM public.waitlist_entries w
      LEFT JOIN public.provisional_patients pp ON pp.id = w.provisional_patient_id
     WHERE w.id = v_entry;
END;
$$;

REVOKE ALL ON FUNCTION public.offer_released_capacity(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.offer_released_capacity(uuid) TO service_role;


-- ─── 4. hospitals: quiet hours ───────────────────────────────────────
--
-- Facility policy (PRD §3.3.3 "no waitlist offers outside facility-set
-- hours"). Minutes past local midnight in Africa/Kampala; the window wraps
-- midnight when start > end. DEFAULT 21:00–07:00. The dispatcher HOLDS
-- waitlist_offer / confirmation_request / arrival_window / window_shifted /
-- reminder inside it; booking_receipt and session_cancelled are exempt.

ALTER TABLE public.hospitals
  ADD COLUMN IF NOT EXISTS quiet_hours_start_minutes_local smallint NOT NULL DEFAULT 1260,
  ADD COLUMN IF NOT EXISTS quiet_hours_end_minutes_local smallint NOT NULL DEFAULT 420;

ALTER TABLE public.hospitals
  DROP CONSTRAINT IF EXISTS hospitals_quiet_hours_range;
ALTER TABLE public.hospitals
  ADD CONSTRAINT hospitals_quiet_hours_range CHECK (
    quiet_hours_start_minutes_local BETWEEN 0 AND 1440
    AND quiet_hours_end_minutes_local BETWEEN 0 AND 1440
  );


-- ─── 5. department_scheduling_policy.release_unconfirmed_hours ───────
--
-- PRD §3.2.3 "unconfirmed bookings release at T-minus-X". NULL = OFF, and
-- OFF is the default (§3.3.4: no punitive automation by default). When set,
-- the cron cancels session/slot bookings still unconfirmed by the patient
-- at T-X with reason 'unconfirmed_release', notifies, and offers the place
-- to the waitlist.

ALTER TABLE public.department_scheduling_policy
  ADD COLUMN IF NOT EXISTS release_unconfirmed_hours smallint;

ALTER TABLE public.department_scheduling_policy
  DROP CONSTRAINT IF EXISTS dept_policy_release_unconfirmed_range;
ALTER TABLE public.department_scheduling_policy
  ADD CONSTRAINT dept_policy_release_unconfirmed_range CHECK (
    release_unconfirmed_hours IS NULL OR release_unconfirmed_hours BETWEEN 1 AND 20
  );


-- ─── 6. clinic_sessions.delay_minutes; appointments.confirmed_by_patient_at
--
-- delay_minutes: "Running late by N minutes" on the board (PRD §3.6). The
-- stored arrival windows of un-arrived positions move by the difference;
-- a window_shifted dispatch goes when the shift is ≥ 30 minutes.
-- confirmed_by_patient_at: the answer to the T-24h confirmation request.

ALTER TABLE public.clinic_sessions
  ADD COLUMN IF NOT EXISTS delay_minutes smallint NOT NULL DEFAULT 0;

ALTER TABLE public.clinic_sessions
  DROP CONSTRAINT IF EXISTS clinic_sessions_delay_range;
ALTER TABLE public.clinic_sessions
  ADD CONSTRAINT clinic_sessions_delay_range CHECK (delay_minutes BETWEEN 0 AND 480);

ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS confirmed_by_patient_at timestamptz;


-- ─── 7. consent_versions: sms_communication v1 ───────────────────────
--
-- The CHECK admitted 'sms_communication' since 0006 but no version row was
-- ever seeded, so no consent could be recorded. CSO-PROVISIONAL copy; a
-- finalised text supersedes it with a new row (never edit this one).
-- Declining = in-app/push only (PRD §5.2). The booking receipt is the one
-- SMS sent regardless (it is the booking's proof, requested by the act of
-- booking — ADR 0090); provisional patients gave their phone for exactly
-- these messages (PRD §2.8).

CREATE EXTENSION IF NOT EXISTS pgcrypto;

INSERT INTO public.consent_versions (consent_type, version, effective_date, body, body_sha256)
SELECT
  'sms_communication',
  'v1.0',
  '2026-09-13'::date,
  body,
  encode(digest(body, 'sha256'), 'hex')
FROM (VALUES (
  'MedSync may send SMS about your bookings: confirmation, reminders and changes. No marketing. Reply STOP to opt out.'
)) AS t(body)
ON CONFLICT (consent_type, version) DO NOTHING;


-- ─── 8. sa_audit_log CHECKs re-issued ────────────────────────────────
--
-- DROP-then-ADD is the house pattern; the action list is 0060's verbatim
-- plus five, the target_kind list 0060's plus two. `cancel_session` already
-- exists (0058).

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
      'confirm_attendance', 'set_session_delay'
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
      'patient_intake',
      'triage_record',
      -- New (resus, migration 0038)
      'resus_episode', 'resus_timeline_event',
      'resus_role_assignment', 'resus_mobilisation_alert',
      -- New (capacity model, migration 0058 / ADR 0087)
      'service_line', 'session_template', 'clinic_session',
      -- New (identity, migration 0060 / ADR 0089)
      'provisional_patient', 'booking_agent',
      -- New (notifications + waitlist, migration 0061 / ADR 0090)
      'waitlist_entry', 'notification_dispatch'
    )
  );
