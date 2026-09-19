-- 0064 — Cancel reasons a patient can read are codes, never staff words (Gate H, ADR 0094).
--
-- ⚠️ GATED — DO NOT APPLY TO PRODUCTION WITHOUT EXPLICIT, NAMED OWNER
-- AUTHORIZATION. Apply via `npm run db:migrate`.
--
-- Owner ruling 2026-09-19: staff cancel reasons are STAFF ONLY. A patient reads
-- their `appointments` rows straight through RLS (the phone uses supabase-js),
-- so a reason typed by a clinician or an admin must not sit in a column they
-- can select. From this gate every writer puts a closed CODE in
-- `cancelled_reason` (`supabase/functions/_shared/cancel-reasons.ts`) and the
-- words go to the `sa_audit_log` row each writer already records first — the
-- `cancel_appointment` / `decline_appointment_request` rows carry the full
-- text in `reason`, so nothing below is lost, only moved out of reach.
--
-- Rows written before the ruling still hold the words; this rewrites them to
-- the code their writer now uses, then a CHECK closes the column. Every
-- writer codes as of this gate: cancel-appointment, ha-cancel-session, the
-- dispatcher's unconfirmed-release path, system-ussd-act and
-- reschedule-appointment. Sequencing: apply BEFORE those functions are
-- redeployed only if no cancel happens in between — otherwise apply after;
-- the rewrite below is idempotent and the CHECK is the last statement.

-- ─── 1. appointments.cancelled_reason ────────────────────────────────
--
-- The USSD/SMS template names the patient; a row the patient themself
-- cancelled is theirs; everything else was staff (clinician, hospital_admin,
-- superadmin — cancel-appointment allows no one else).
UPDATE public.appointments
SET cancelled_reason = CASE
  WHEN cancelled_reason LIKE 'Cancelled by the patient by %' THEN 'patient_cancelled'
  WHEN cancelled_by_user_id IS NOT NULL AND cancelled_by_user_id = patient_user_id
    THEN 'patient_cancelled'
  ELSE 'staff_cancelled'
END
WHERE status = 'cancelled'
  AND cancelled_reason IS NOT NULL
  AND cancelled_reason NOT IN (
    'session_cancelled', 'patient_cancelled', 'staff_cancelled',
    'unconfirmed_release', 'rescheduled'
  );

-- ─── 2. appointments.declined_reason ─────────────────────────────────
--
-- The clinician's words on a declined request. `ha-decline-appointment-request`
-- no longer writes the column; the status is the code, and the text is in the
-- function's `decline_appointment_request` audit row.
UPDATE public.appointments
SET declined_reason = NULL
WHERE declined_reason IS NOT NULL;

-- ─── 3. The old row of a move ────────────────────────────────────────
--
-- `reschedule-appointment` wrote "Rescheduled to <instant>"; the new row's
-- `rescheduled_from_appointment_id` already says where it went.
UPDATE public.appointments
SET cancelled_reason = 'rescheduled'
WHERE status = 'rescheduled'
  AND cancelled_reason IS NOT NULL
  AND cancelled_reason <> 'rescheduled';

-- ─── 4. Anything else that is still words ────────────────────────────
--
-- A non-null value on any other status can only be staff's; no patient path
-- writes the column outside 'cancelled'.
UPDATE public.appointments
SET cancelled_reason = 'staff_cancelled'
WHERE cancelled_reason IS NOT NULL
  AND cancelled_reason NOT IN (
    'session_cancelled', 'patient_cancelled', 'staff_cancelled',
    'unconfirmed_release', 'rescheduled'
  );

-- ─── 5. Close the column ─────────────────────────────────────────────
ALTER TABLE public.appointments
  ADD CONSTRAINT appointments_cancelled_reason_code CHECK (
    cancelled_reason IS NULL OR cancelled_reason IN (
      'session_cancelled', 'patient_cancelled', 'staff_cancelled',
      'unconfirmed_release', 'rescheduled'
    )
  );
