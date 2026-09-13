-- 0060 — Identity and lifecycle: provisional patients, booking agents,
-- `void` (Gate D, ADR 0089).
--
-- ⚠️ GATED — DO NOT APPLY TO PRODUCTION WITHOUT EXPLICIT, NAMED OWNER
-- AUTHORIZATION. Apply via `npm run db:migrate`.
--
-- docs/booking-app-gate-a-proposal.md §5.8, §5.9, §6; PRD §2.8, §2.9; ADR 0089.
--
-- Additive except ONE step, §3: `appointments.patient_user_id` DROPS its
-- NOT NULL so a booking can name a provisional patient instead. Every
-- shipped row keeps its patient, and the new CHECK (at least one of the two
-- ids) admits exactly what NOT NULL admitted for them.
--
-- Sections, in order:
--   1. provisional_patients     the booking identity (§5.8) — NEVER auto-merged
--   2. booking_agents           who books for whom (§5.9) — adults only
--   3. appointments             provisional_patient_id, patient_user_id NULL,
--                               `void` joins the status CHECK, agent read policy
--   4. patient_intakes          the same pair, at-least-one CHECK widened
--   5. sa_audit_log CHECKs      +3 actions, +2 target kinds
--
-- The one rule everything here serves (PRD §2.8): a booking never writes
-- into the clinical MPI. `reconciled_patient_user_id` and the
-- `patient_user_id` of a provisional's bookings are set by ONE writer,
-- `ha-reconcile-identity`, after a human at the desk confirmed. No trigger,
-- no default, no other function sets them; a test greps for that.


-- ─── 1. provisional_patients ─────────────────────────────────────────
--
-- Who a booking is for when there is no account: a caller the desk books
-- for, a household member an agent books for, later a USSD user. Name and
-- phone are AES-256-GCM (`lib/encryption.ts` / `_shared/encryption.ts`,
-- one wire format); `phone_hmac` is the blind index the search-by-phone and
-- the reconciliation candidates key on (HMAC-SHA256, hex, keyed by
-- SHA-256("medsync-blind-index" || MEDSYNC_PHI_KEY)).
--
-- reconciliation_state:
--   unreconciled  born this way
--   confirmed     the desk matched it to an existing patient_profiles row
--   created       the desk registered a new patient for it, then confirmed
--   rejected      the desk said "not a person we can match" — nothing else changes
--
-- expires_at: 30 days. The cleanup-drafts cron deletes rows still
-- `unreconciled` past it that hold no appointment and no live agent link.
-- A provisional that ever held a booking stays with the booking (the FK
-- below is RESTRICT): the appointment row is the retention owner.
--
-- hospital_id: the facility whose desk created the row (ha-book-on-behalf).
-- NULL for a HOUSEHOLD MEMBER added from the patient app
-- (pt-add-household-member) — a household list is not per facility, and
-- the member may be booked at any hospital (ADR 0086). Such a row is
-- readable by the staff of every hospital it holds a booking at, and by
-- nobody else (policy below). §5.8 wrote NOT NULL before household rows
-- existed; ADR 0089 records the widening.

CREATE TABLE IF NOT EXISTS public.provisional_patients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid REFERENCES public.hospitals(id) ON DELETE CASCADE,

  declared_name_encrypted text NOT NULL,
  phone_encrypted text NOT NULL,
  phone_hmac text NOT NULL,
  date_of_birth date,
  age_years smallint,
  phone_verified_at timestamptz,

  reconciliation_state text NOT NULL DEFAULT 'unreconciled',
  -- Set ONLY by ha-reconcile-identity. Never by a trigger, never by a default.
  reconciled_patient_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reconciled_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reconciled_at timestamptz,

  created_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 days'),

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT provisional_patients_dob_or_age CHECK (
    date_of_birth IS NOT NULL OR age_years IS NOT NULL
  ),
  CONSTRAINT provisional_patients_age_range CHECK (
    age_years IS NULL OR age_years BETWEEN 0 AND 130
  ),
  CONSTRAINT provisional_patients_state_check CHECK (
    reconciliation_state IN ('unreconciled','confirmed','created','rejected')
  ),
  -- Only a reconciled row may name a patient; an unreconciled or rejected
  -- row names nobody. (One-directional so the FK's SET NULL never trips it.)
  CONSTRAINT provisional_patients_reconciled_names_patient CHECK (
    reconciliation_state IN ('confirmed','created') OR reconciled_patient_user_id IS NULL
  ),
  -- A row with no facility must name who added it (the household agent).
  CONSTRAINT provisional_patients_hospital_or_creator CHECK (
    hospital_id IS NOT NULL OR created_by_user_id IS NOT NULL
  )
);
CREATE INDEX IF NOT EXISTS provisional_patients_hospital_phone_idx
  ON public.provisional_patients (hospital_id, phone_hmac);
CREATE INDEX IF NOT EXISTS provisional_patients_phone_idx
  ON public.provisional_patients (phone_hmac);
CREATE INDEX IF NOT EXISTS provisional_patients_expiry_idx
  ON public.provisional_patients (expires_at)
  WHERE reconciliation_state = 'unreconciled';

ALTER TABLE public.provisional_patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.provisional_patients FORCE ROW LEVEL SECURITY;

-- The SELECT policy is created in §3, after `appointments.provisional_patient_id`
-- exists — it reads that column.

DROP TRIGGER IF EXISTS provisional_patients_updated_at ON public.provisional_patients;
CREATE TRIGGER provisional_patients_updated_at
  BEFORE UPDATE ON public.provisional_patients
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Row-level audit, as patient_intakes has (0032): every reconciliation
-- change is a before/after pair in audit_log, on top of the sa_audit_log
-- row the function writes.
DROP TRIGGER IF EXISTS audit_provisional_patients ON public.provisional_patients;
CREATE TRIGGER audit_provisional_patients
  AFTER INSERT OR UPDATE OR DELETE ON public.provisional_patients
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_changes();


-- ─── 2. booking_agents ───────────────────────────────────────────────
--
-- "A son with the only smartphone" (PRD §2.9): one account, many patients.
-- The member is EITHER an existing patient (patient_user_id) OR a
-- provisional record (provisional_patient_id) — exactly one.
--
-- ADULTS ONLY at this gate (Part 8 #12 unruled): `declared_adult` must be
-- true, and the function refuses a minor with "Booking for a child is not
-- available yet." `consent_basis` starts 'agent_declared'; it flips to
-- 'member_confirmed' when the member first signs in themselves (§2.9) —
-- no writer for that yet.
--
-- member_label: the name the agent uses for this person, plaintext, the
-- agent's own words — what the household list shows. It is not the
-- clinical record and never joins it; the encrypted declared name lives on
-- provisional_patients. Visible only to the agent (RLS below).
--
-- Removal is `revoked_at = now()`: one UPDATE, and the agent's read policy
-- stops seeing the row at once.

CREATE TABLE IF NOT EXISTS public.booking_agents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  patient_user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  provisional_patient_id uuid REFERENCES public.provisional_patients(id) ON DELETE CASCADE,

  member_label text NOT NULL,
  relationship text NOT NULL,
  consent_basis text NOT NULL DEFAULT 'agent_declared',
  declared_adult boolean NOT NULL,
  revoked_at timestamptz,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT booking_agents_member_exactly_one CHECK (
    (patient_user_id IS NOT NULL)::int + (provisional_patient_id IS NOT NULL)::int = 1
  ),
  CONSTRAINT booking_agents_not_self CHECK (patient_user_id IS DISTINCT FROM agent_user_id),
  CONSTRAINT booking_agents_label_len CHECK (length(trim(member_label)) BETWEEN 1 AND 80),
  CONSTRAINT booking_agents_relationship_check CHECK (
    relationship IN ('parent','guardian','child','spouse','relative','vht','other')
  ),
  CONSTRAINT booking_agents_consent_basis_check CHECK (
    consent_basis IN ('agent_declared','member_confirmed')
  ),
  CONSTRAINT booking_agents_adults_only CHECK (declared_adult)
);
-- One live link per (agent, member).
CREATE UNIQUE INDEX IF NOT EXISTS booking_agents_live_patient_unique
  ON public.booking_agents (agent_user_id, patient_user_id)
  WHERE revoked_at IS NULL AND patient_user_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS booking_agents_live_provisional_unique
  ON public.booking_agents (agent_user_id, provisional_patient_id)
  WHERE revoked_at IS NULL AND provisional_patient_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS booking_agents_agent_idx
  ON public.booking_agents (agent_user_id)
  WHERE revoked_at IS NULL;

ALTER TABLE public.booking_agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_agents FORCE ROW LEVEL SECURITY;

-- The agent sees their live links; a member with an account sees every
-- link about them (revoked included — "who could book for me" is theirs
-- to know). Writes via pt-add-household-member (service role) only.
DROP POLICY IF EXISTS booking_agents_select_agent ON public.booking_agents;
CREATE POLICY booking_agents_select_agent ON public.booking_agents
  FOR SELECT TO authenticated
  USING (agent_user_id = auth.uid() AND revoked_at IS NULL);

DROP POLICY IF EXISTS booking_agents_select_member ON public.booking_agents;
CREATE POLICY booking_agents_select_member ON public.booking_agents
  FOR SELECT TO authenticated
  USING (patient_user_id = auth.uid());

DROP TRIGGER IF EXISTS booking_agents_updated_at ON public.booking_agents;
CREATE TRIGGER booking_agents_updated_at
  BEFORE UPDATE ON public.booking_agents
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS audit_booking_agents ON public.booking_agents;
CREATE TRIGGER audit_booking_agents
  AFTER INSERT OR UPDATE OR DELETE ON public.booking_agents
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_changes();


-- ─── 3. appointments: the provisional pair, `void`, the agent's read ─
--
-- provisional_patient_id is the PROVENANCE of a booking made without an
-- account. When the desk reconciles, ha-reconcile-identity sets
-- patient_user_id and LEAVES provisional_patient_id in place — the audit
-- trail of where the booking came from — so the CHECK is at-least-one, not
-- exactly-one. Both NULL is the only shape refused.
--
-- THE ONE NON-ADDITIVE STEP: patient_user_id DROP NOT NULL. Every shipped
-- row has a patient; the CHECK admits them all.
--
-- Every reader that joined patient_profiles on patient_user_id still
-- works (a LEFT JOIN finds nothing for a provisional row); the dispatcher
-- reads the provisional's phone instead (ADR 0089).

ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS provisional_patient_id uuid
    REFERENCES public.provisional_patients(id) ON DELETE RESTRICT;

ALTER TABLE public.appointments
  ALTER COLUMN patient_user_id DROP NOT NULL;

ALTER TABLE public.appointments
  DROP CONSTRAINT IF EXISTS appointments_patient_or_provisional;
ALTER TABLE public.appointments
  ADD CONSTRAINT appointments_patient_or_provisional CHECK (
    patient_user_id IS NOT NULL OR provisional_patient_id IS NOT NULL
  );

CREATE INDEX IF NOT EXISTS appointments_provisional_idx
  ON public.appointments (provisional_patient_id)
  WHERE provisional_patient_id IS NOT NULL;

-- provisional_patients' SELECT policy (from §1). Staff read (the `patient_intakes_select_scoped` shape minus its patient
-- clause): at the hospital that created the row, or at any hospital the
-- row holds a booking at (a household member's row, hospital_id NULL).
-- NO patient policy: there is no account, and the agent who created it
-- reads only their booking_agents row (§2). The columns are ciphertext
-- anyway; the desk decrypts server-side.
DROP POLICY IF EXISTS provisional_patients_select_staff ON public.provisional_patients;
CREATE POLICY provisional_patients_select_staff ON public.provisional_patients
  FOR SELECT TO authenticated
  USING (
    public.user_has_role('superadmin')
    OR EXISTS (
      SELECT 1 FROM public.staff_affiliations sa
      WHERE sa.user_id = auth.uid()
        AND sa.state IN ('active','approved')
        AND (
          sa.hospital_id = provisional_patients.hospital_id
          OR EXISTS (
            SELECT 1 FROM public.appointments a
            WHERE a.provisional_patient_id = provisional_patients.id
              AND a.hospital_id = sa.hospital_id
          )
        )
    )
    -- Guarded: user_has_role(role, NULL) means "at ANY hospital", which would
    -- open every household row (hospital_id NULL) to every hospital admin.
    OR (hospital_id IS NOT NULL AND public.user_has_role('hospital_admin', hospital_id))
    OR EXISTS (
      SELECT 1 FROM public.appointments a
      WHERE a.provisional_patient_id = provisional_patients.id
        AND public.user_has_role('hospital_admin', a.hospital_id)
    )
  );


-- Replay safety for a booking whose patient has no account: the
-- (patient_user_id, idempotency_key) index (0058) cannot see a NULL
-- patient, so the key is ALSO unique per creator. Every shipped row has
-- created_by_user_id = patient_user_id, so this admits what 0058's does.
-- `_shared/book.ts` replays on (created_by_user_id, idempotency_key).
CREATE UNIQUE INDEX IF NOT EXISTS appointments_creator_idempotency_unique
  ON public.appointments (created_by_user_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL AND created_by_user_id IS NOT NULL;

-- `void` — FHIR entered-in-error (§6). NO WRITER at this gate: a
-- superadmin four-eyes action writes it later. It is absent from
-- LIVE_APPOINTMENT_STATUSES (`_shared/slots.ts`) and from the
-- appointments_no_double_booking predicate (0058) by construction —
-- neither lists it.
ALTER TABLE public.appointments
  DROP CONSTRAINT IF EXISTS appointments_status_check;
ALTER TABLE public.appointments
  ADD CONSTRAINT appointments_status_check CHECK (
    status IN (
      'requested','pending_approval','confirmed','arrived','in_progress',
      'completed','cancelled','no_show','rescheduled','declined',
      'void'
    )
  );

-- A booking agent reads the bookings THEY made (PRD §2.9: logistics only —
-- date, place, service, code). Permissive policies OR with 0028's. No
-- column restriction: appointments carries no PHI beyond `reason_note`,
-- which the agent typed themselves. A confidential line is never
-- bookable by an agent (`_shared/book.ts` refuses), so no confidential
-- booking is ever theirs to read.
DROP POLICY IF EXISTS appointments_select_agent ON public.appointments;
CREATE POLICY appointments_select_agent ON public.appointments
  FOR SELECT TO authenticated
  USING (created_by_user_id = auth.uid());


-- ─── 4. patient_intakes: the same pair ───────────────────────────────
--
-- A provisional patient who arrives gets an intake row that names the
-- provisional; `patient_unknown_label` stays for the comatose-by-ambulance
-- case it was born for (0032). At-least-one of the three.

ALTER TABLE public.patient_intakes
  ADD COLUMN IF NOT EXISTS provisional_patient_id uuid
    REFERENCES public.provisional_patients(id) ON DELETE RESTRICT;

ALTER TABLE public.patient_intakes
  DROP CONSTRAINT IF EXISTS intakes_patient_or_unknown;
ALTER TABLE public.patient_intakes
  ADD CONSTRAINT intakes_patient_or_unknown CHECK (
    patient_user_id IS NOT NULL
    OR provisional_patient_id IS NOT NULL
    OR patient_unknown_label IS NOT NULL
  );

CREATE INDEX IF NOT EXISTS patient_intakes_provisional_idx
  ON public.patient_intakes (provisional_patient_id)
  WHERE provisional_patient_id IS NOT NULL;


-- ─── 5. sa_audit_log CHECKs re-issued ────────────────────────────────
--
-- DROP-then-ADD is the house pattern; the action list is 0058's verbatim
-- plus three, the target_kind list 0058's plus two. Without them the new
-- functions' audit INSERT raises and they fail closed on the first write.

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
      'reconcile_identity', 'unreconcile_identity', 'add_booking_agent'
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
      'provisional_patient', 'booking_agent'
    )
  );
