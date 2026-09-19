-- 0063 — Fees by clinician cadre, and the quote a booking keeps (Gate G, ADR 0092).
--
-- ⚠️ GATED — DO NOT APPLY TO PRODUCTION WITHOUT EXPLICIT, NAMED OWNER
-- AUTHORIZATION. Apply via `npm run db:migrate`.
--
-- Owner ruling 2026-09-19: "a facility can set fees depending on the cadre of
-- the dr". PRD §8; docs/booking-app-build/GATE-G-BUILD.md; ADR 0092.
--
-- Additive throughout. Sections, in order:
--   1. service_line_fees          a SPARSE override: (line, cadre) → fee. Zero
--                                 rows = today's flat behaviour, unchanged
--   2. appointments.quoted_fee_*  the number the patient was told, snapshotted
--   3. sa_audit_log CHECKs        + set_service_line_fee, + service_line_fee
--
-- WHY SPARSE, AND WHY FLAT REMAINS THE DEFAULT
--
-- Uganda's MoH "Guidelines for Management of Private Healthcare Services in
-- Health Units" (binding 1 July 2025) price private care in public units as
-- a DRG/APG case-mix weight x a base rate, where the base rate varies by
-- geography, facility level and service class (Basic/VIP/VVIP/Executive
-- Suite). Clinician cadre is NEVER an input. Mulago's own Specialised
-- hospital charges a flat UGX 50,000 consultation whoever sees you, and the
-- Health Minister told Parliament that clinical services are "offered to all
-- patients at all levels irrespective of pay" — the class buys accommodation,
-- not a more senior clinician. The one cadre split in a Ugandan public price
-- list is "nurse care" vs "doctor care" as INPATIENT per-night line items.
--
-- So cadre pricing is an override a facility may choose, not the model. A
-- facility that prices the Ugandan way inserts nothing here and behaves
-- exactly as it does today. `COALESCE(override, service_lines.fee_ugx)` is the
-- whole resolution rule.


-- ─── 1. service_line_fees ────────────────────────────────────────────
--
-- One row per (service line, cadre) a facility chooses to price differently.
-- `cadre_id` is the REGISTERED qualification from public.cadres — rendered
-- verbatim beside the number ("Consultant · UGX 85,000") and never dressed as
-- seniority: UMDPC Code of Professional Ethics 2019 §5(d) forbids implying one
-- practitioner is better qualified than another in the same field, and §4
-- brings mobile apps inside the advertising rules.
--
-- No effective-dating and no history table. A facility editing a fee changes
-- what FUTURE bookings are quoted; every held booking keeps its own snapshot
-- (§2), which is the only stability a patient can actually perceive.

CREATE TABLE IF NOT EXISTS public.service_line_fees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_line_id uuid NOT NULL REFERENCES public.service_lines(id) ON DELETE CASCADE,
  cadre_id uuid NOT NULL REFERENCES public.cadres(id) ON DELETE RESTRICT,
  fee_ugx integer NOT NULL,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT service_line_fees_nonneg CHECK (fee_ugx >= 0),
  -- A ceiling that is obviously wrong rather than silently expensive: the
  -- highest figure anywhere in Annex I is UGX 3,000,000 (KCCA Executive
  -- Suite inpatient base rate). Ten million is a typo, not a price.
  CONSTRAINT service_line_fees_sane CHECK (fee_ugx <= 10000000),
  CONSTRAINT service_line_fees_unique UNIQUE (service_line_id, cadre_id)
);

CREATE INDEX IF NOT EXISTS service_line_fees_line_idx
  ON public.service_line_fees (service_line_id);

ALTER TABLE public.service_line_fees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_line_fees FORCE ROW LEVEL SECURITY;

-- A price a patient is asked to pay is a price they may read. MoH §3.4.2
-- makes this an obligation, not a courtesy: "Health units shall develop and
-- display a price list for the services offered." Readable by anyone signed
-- in; writable only by the Edge Function (service role).
DROP POLICY IF EXISTS service_line_fees_select_all ON public.service_line_fees;
CREATE POLICY service_line_fees_select_all ON public.service_line_fees
  FOR SELECT TO authenticated
  USING (true);

DROP TRIGGER IF EXISTS service_line_fees_updated_at ON public.service_line_fees;
CREATE TRIGGER service_line_fees_updated_at
  BEFORE UPDATE ON public.service_line_fees
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS service_line_fees_audit ON public.service_line_fees;
CREATE TRIGGER service_line_fees_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.service_line_fees
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_changes();


-- ─── 2. appointments: the quote the patient keeps ────────────────────
--
-- The same rule `arrival_window_start/end` already follows: derived once at
-- confirmation and STORED, so what the patient was told never moves under
-- them. Written in exactly one place — `_shared/book.ts`, the one booking
-- core — and read by every surface that shows money, none of which joins
-- back to service_lines or service_line_fees. An invariant test greps both.
--
-- NULL = no fee was quoted (payment_posture 'none', or a booking made before
-- this migration). It is not 0: "free" and "nobody said" are different facts.
--
-- `quoted_fee_label` is the cadre's registered name, or the service line's
-- name when the base fee answered. Stored rather than joined so the words on
-- an old booking survive a facility renaming a line.

ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS quoted_fee_ugx integer,
  ADD COLUMN IF NOT EXISTS quoted_fee_label text,
  ADD COLUMN IF NOT EXISTS quoted_fee_at timestamptz;

ALTER TABLE public.appointments
  DROP CONSTRAINT IF EXISTS appointments_quoted_fee_nonneg;
ALTER TABLE public.appointments
  ADD CONSTRAINT appointments_quoted_fee_nonneg CHECK (
    quoted_fee_ugx IS NULL OR quoted_fee_ugx >= 0
  );

-- A quote is a number, a label and an instant, or it is nothing at all.
ALTER TABLE public.appointments
  DROP CONSTRAINT IF EXISTS appointments_quoted_fee_complete;
ALTER TABLE public.appointments
  ADD CONSTRAINT appointments_quoted_fee_complete CHECK (
    (quoted_fee_ugx IS NULL AND quoted_fee_at IS NULL)
    OR (quoted_fee_ugx IS NOT NULL AND quoted_fee_at IS NOT NULL)
  );


-- ─── 3. sa_audit_log CHECKs re-issued ────────────────────────────────
--
-- DROP-then-ADD is the house pattern; the lists are 0061's verbatim plus one
-- action and one target kind. (0062 added `sms_stop`; it is carried here.)

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
      'open_resus_episode', 'conclude_resus_episode',
      'record_resus_event', 'correct_resus_event',
      'assign_resus_role', 'end_resus_role',
      'mobilise_resus_team', 'detect_resus_arrest',
      'set_emergency_phone',
      'rate_visit',
      'update_service_line', 'update_session_template',
      'cancel_session', 'book_on_behalf',
      'reconcile_identity', 'unreconcile_identity', 'add_booking_agent',
      'join_waitlist', 'accept_waitlist_offer', 'accept_rebooking',
      'confirm_attendance', 'set_session_delay',
      -- New (low-bandwidth channels, migration 0062 / ADR 0091)
      'sms_stop',
      -- New (cadre fees, migration 0063 / ADR 0092)
      'set_service_line_fee'
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
      'resus_episode', 'resus_timeline_event',
      'resus_role_assignment', 'resus_mobilisation_alert',
      'service_line', 'session_template', 'clinic_session',
      'provisional_patient', 'booking_agent',
      'waitlist_entry', 'notification_dispatch',
      -- New (cadre fees, migration 0063 / ADR 0092)
      'service_line_fee'
    )
  );
