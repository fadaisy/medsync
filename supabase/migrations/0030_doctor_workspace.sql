-- 0030 — Doctor Workspace: supervision, co-sign policies + requests, PHI access log.
--
-- Per docs/doctor-workspace-gate-a-proposal.md (signed off 2026-05-27).
--
-- Additive only. Four new tables:
--   1. clinical_supervision          (intern → consultant pairings)
--   2. clinical_cosign_policies      (per-hospital/department policy matrix)
--   3. clinical_cosign_requests      (workflow object for flagged actions)
--   4. clinical_phi_access_log       (append-only "who viewed which patient")
--
-- Plus:
--   - Default policy seed for every existing active hospital (§2 of the proposal).
--   - sa_audit_log action + target_kind widening for the new audit verbs.
--
-- Design notes:
--   - cadre_code is denormalised into policies + requests (text rather than FK
--     to cadres.id) so the policy row is human-readable in SQL and the request
--     row carries its own cadre snapshot at submission time (important for
--     audit — the requester's cadre at the moment of request, not "now").
--   - All four tables are RLS-enabled. Writes are service-role only (Edge
--     Functions own the workflow); reads are scoped by hospital + clinical
--     legitimacy.
--   - phi_access_log is append-only at the privilege layer (REVOKE
--     UPDATE/DELETE from authenticated). Same pattern as audit_log.


-- ─── 1. clinical_supervision ─────────────────────────────────────────
CREATE TABLE public.clinical_supervision (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  supervisee_affiliation_id uuid NOT NULL
    REFERENCES public.staff_affiliations(id) ON DELETE CASCADE,
  supervisor_affiliation_id uuid NOT NULL
    REFERENCES public.staff_affiliations(id) ON DELETE CASCADE,

  relationship_kind text NOT NULL DEFAULT 'primary',
    -- 'primary' (named on the supervisee's home) | 'backup' (fallback)
  starts_on date NOT NULL DEFAULT CURRENT_DATE,
  ends_on date,
  notes text,

  created_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT supervision_kind_check
    CHECK (relationship_kind IN ('primary','backup')),
  CONSTRAINT supervision_self_pair_check
    CHECK (supervisee_affiliation_id <> supervisor_affiliation_id),
  CONSTRAINT supervision_date_order
    CHECK (ends_on IS NULL OR ends_on >= starts_on)
);
CREATE INDEX clinical_supervision_supervisee_idx
  ON public.clinical_supervision (supervisee_affiliation_id, starts_on DESC);
CREATE INDEX clinical_supervision_supervisor_idx
  ON public.clinical_supervision (supervisor_affiliation_id, starts_on DESC);
CREATE INDEX clinical_supervision_hospital_active_idx
  ON public.clinical_supervision (hospital_id)
  WHERE ends_on IS NULL;

ALTER TABLE public.clinical_supervision ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clinical_supervision FORCE ROW LEVEL SECURITY;

-- SELECT: superadmin sees all; hospital_admin sees own hospital;
-- a clinician sees rows where they are the supervisee OR the supervisor.
CREATE POLICY clinical_supervision_select_scoped ON public.clinical_supervision
  FOR SELECT TO authenticated
  USING (
    public.user_has_role('superadmin')
    OR public.user_has_role('hospital_admin', hospital_id)
    OR supervisee_affiliation_id IN (
      SELECT id FROM public.staff_affiliations WHERE user_id = auth.uid()
    )
    OR supervisor_affiliation_id IN (
      SELECT id FROM public.staff_affiliations WHERE user_id = auth.uid()
    )
  );
-- No write policy for authenticated — Edge Functions own pairing.

DROP TRIGGER IF EXISTS clinical_supervision_updated_at ON public.clinical_supervision;
CREATE TRIGGER clinical_supervision_updated_at
  BEFORE UPDATE ON public.clinical_supervision
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS audit_clinical_supervision ON public.clinical_supervision;
CREATE TRIGGER audit_clinical_supervision
  AFTER INSERT OR UPDATE OR DELETE ON public.clinical_supervision
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_changes();


-- ─── 2. clinical_cosign_policies ─────────────────────────────────────
-- Per-hospital (optional per-department override) policy: which action
-- kinds require co-sign for which junior cadres.
CREATE TABLE public.clinical_cosign_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  department_id uuid REFERENCES public.hospital_departments(id) ON DELETE CASCADE,
    -- NULL = hospital-wide default; specific = department override.

  cadre_code text NOT NULL,
    -- e.g. 'INTERN_DOCTOR', 'CLINICAL_OFFICER', 'MEDICAL_OFFICER'
  action_kind text NOT NULL,
    -- 'prescription_routine' | 'prescription_controlled' |
    -- 'order_high_cost_imaging' | 'admit_patient' | 'discharge_patient'
  requirement text NOT NULL,
    -- 'allowed' | 'cosign_required' | 'blocked'

  notes text,
  set_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT cosign_policy_requirement_check
    CHECK (requirement IN ('allowed','cosign_required','blocked')),
  CONSTRAINT cosign_policy_action_check CHECK (action_kind IN (
    'prescription_routine','prescription_controlled',
    'order_high_cost_imaging','admit_patient','discharge_patient'
  ))
);
-- Unique on (hospital, department, cadre, action). COALESCE the
-- department_id to a sentinel so NULL means "hospital-wide row" and
-- the unique constraint catches "two hospital-wide rows for the same
-- cadre+action."
CREATE UNIQUE INDEX cosign_policy_unique
  ON public.clinical_cosign_policies
  (hospital_id, COALESCE(department_id, '00000000-0000-0000-0000-000000000000'::uuid),
   cadre_code, action_kind);
CREATE INDEX cosign_policy_lookup_idx
  ON public.clinical_cosign_policies (hospital_id, cadre_code, action_kind);

ALTER TABLE public.clinical_cosign_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clinical_cosign_policies FORCE ROW LEVEL SECURITY;

-- SELECT: any authenticated clinician at the hospital needs to read
-- policy to know what they can do. Hospital admin reads their hospital
-- for the admin UI; superadmin sees all.
CREATE POLICY clinical_cosign_policies_select_scoped ON public.clinical_cosign_policies
  FOR SELECT TO authenticated
  USING (
    public.user_has_role('superadmin')
    OR public.user_has_role('hospital_admin', hospital_id)
    OR EXISTS (
      SELECT 1 FROM public.staff_affiliations sa
      WHERE sa.user_id = auth.uid()
        AND sa.hospital_id = clinical_cosign_policies.hospital_id
        AND sa.state IN ('active','approved')
    )
  );
-- No write policy for authenticated — Edge Functions / admin actions own writes.

DROP TRIGGER IF EXISTS clinical_cosign_policies_updated_at ON public.clinical_cosign_policies;
CREATE TRIGGER clinical_cosign_policies_updated_at
  BEFORE UPDATE ON public.clinical_cosign_policies
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS audit_clinical_cosign_policies ON public.clinical_cosign_policies;
CREATE TRIGGER audit_clinical_cosign_policies
  AFTER INSERT OR UPDATE OR DELETE ON public.clinical_cosign_policies
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_changes();


-- ─── 3. clinical_cosign_requests ─────────────────────────────────────
CREATE TABLE public.clinical_cosign_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  patient_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  requested_by_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  requested_by_affiliation_id uuid NOT NULL
    REFERENCES public.staff_affiliations(id) ON DELETE RESTRICT,
  requested_by_cadre_code text NOT NULL,    -- snapshot at request time

  action_kind text NOT NULL,
  action_payload jsonb NOT NULL,
    -- Self-contained snapshot of the proposed action so the supervisor
    -- can review without joining six tables.

  state text NOT NULL DEFAULT 'pending_review',
    -- pending_review | approved | returned | cancelled | expired
  reviewed_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  review_note text,

  expires_at timestamptz,                   -- escalation timer
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT cosign_state_check CHECK (state IN
    ('pending_review','approved','returned','cancelled','expired')),
  CONSTRAINT cosign_action_kind_check CHECK (action_kind IN (
    'prescription_routine','prescription_controlled',
    'order_high_cost_imaging','admit_patient','discharge_patient'
  )),
  CONSTRAINT cosign_review_consistency CHECK (
    (state = 'pending_review' AND reviewed_by_user_id IS NULL AND reviewed_at IS NULL)
    OR (state IN ('approved','returned')
        AND reviewed_by_user_id IS NOT NULL AND reviewed_at IS NOT NULL)
    OR (state IN ('cancelled','expired'))
  )
);
CREATE INDEX cosign_reviewer_queue_idx
  ON public.clinical_cosign_requests (hospital_id, state, created_at)
  WHERE state = 'pending_review';
CREATE INDEX cosign_requester_idx
  ON public.clinical_cosign_requests (requested_by_user_id, created_at DESC);
CREATE INDEX cosign_patient_idx
  ON public.clinical_cosign_requests (patient_user_id, created_at DESC);

ALTER TABLE public.clinical_cosign_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clinical_cosign_requests FORCE ROW LEVEL SECURITY;

-- SELECT: superadmin all; hospital_admin own hospital; requester sees
-- own; any senior at the same hospital sees the pending review queue
-- (an MO or consultant in the same department; we keep the policy
-- broad here and let the application layer filter the queue by the
-- supervision pairing — RLS guarantees nobody outside the hospital
-- can read).
CREATE POLICY clinical_cosign_requests_select_scoped ON public.clinical_cosign_requests
  FOR SELECT TO authenticated
  USING (
    public.user_has_role('superadmin')
    OR public.user_has_role('hospital_admin', hospital_id)
    OR requested_by_user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.staff_affiliations sa
      JOIN public.cadres c ON c.id = sa.cadre_id
      WHERE sa.user_id = auth.uid()
        AND sa.hospital_id = clinical_cosign_requests.hospital_id
        AND sa.state IN ('active','approved')
        AND c.code IN ('MEDICAL_OFFICER','MEDICAL_OFFICER_SG','CONSULTANT','SENIOR_CONSULTANT')
    )
  );
-- No write policy for authenticated — Edge Functions own the workflow.

DROP TRIGGER IF EXISTS clinical_cosign_requests_updated_at ON public.clinical_cosign_requests;
CREATE TRIGGER clinical_cosign_requests_updated_at
  BEFORE UPDATE ON public.clinical_cosign_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS audit_clinical_cosign_requests ON public.clinical_cosign_requests;
CREATE TRIGGER audit_clinical_cosign_requests
  AFTER INSERT OR UPDATE OR DELETE ON public.clinical_cosign_requests
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_changes();


-- ─── 4. clinical_phi_access_log ──────────────────────────────────────
-- Append-only "who viewed which patient's PHI, when, why". Distinct from
-- audit_log (which captures row mutations) — this captures reads.
CREATE TABLE public.clinical_phi_access_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  clinician_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  patient_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  access_basis text NOT NULL,
    -- 'care_team' | 'active_encounter' | 'department_recent' | 'break_glass'
  request_id uuid,                          -- from app.request_id GUC
  surface text,                             -- e.g. 'patient_summary_panel'

  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT phi_access_basis_check CHECK (access_basis IN
    ('care_team','active_encounter','department_recent','break_glass'))
);
CREATE INDEX phi_access_patient_idx
  ON public.clinical_phi_access_log (patient_user_id, created_at DESC);
CREATE INDEX phi_access_clinician_idx
  ON public.clinical_phi_access_log (clinician_user_id, created_at DESC);
CREATE INDEX phi_access_hospital_idx
  ON public.clinical_phi_access_log (hospital_id, created_at DESC);

ALTER TABLE public.clinical_phi_access_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clinical_phi_access_log FORCE ROW LEVEL SECURITY;

-- SELECT: superadmin all; hospital_admin own hospital; patient sees
-- accesses to their own record (the "who viewed me?" surface, when it
-- ships in the patient consent centre); clinician sees their own
-- accesses (for review / self-audit).
CREATE POLICY phi_access_log_select_scoped ON public.clinical_phi_access_log
  FOR SELECT TO authenticated
  USING (
    public.user_has_role('superadmin')
    OR public.user_has_role('hospital_admin', hospital_id)
    OR patient_user_id = auth.uid()
    OR clinician_user_id = auth.uid()
  );
-- No write policy for authenticated — only service-role inserts (via
-- the audited-decrypt helper). Append-only at the privilege layer:
REVOKE UPDATE, DELETE ON public.clinical_phi_access_log FROM PUBLIC;
REVOKE UPDATE, DELETE ON public.clinical_phi_access_log FROM authenticated;
REVOKE UPDATE, DELETE ON public.clinical_phi_access_log FROM anon;

-- BEFORE UPDATE/DELETE block — defence in depth (same pattern as audit_log).
CREATE OR REPLACE FUNCTION public.phi_access_log_block_modify()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'clinical_phi_access_log is append-only; % forbidden', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$;
DROP TRIGGER IF EXISTS phi_access_log_no_modify ON public.clinical_phi_access_log;
CREATE TRIGGER phi_access_log_no_modify
  BEFORE UPDATE OR DELETE ON public.clinical_phi_access_log
  FOR EACH ROW EXECUTE FUNCTION public.phi_access_log_block_modify();
-- audit_log_changes() is NOT attached here — phi_access_log is itself
-- an audit-like surface; double-auditing would loop.


-- ─── 5. Default policy seed (§2 of proposal) ─────────────────────────
-- One row per (hospital, cadre, action) combo for the hospital-wide
-- default. Hospital admins override per-department by inserting a
-- department-specific row.
INSERT INTO public.clinical_cosign_policies
  (hospital_id, department_id, cadre_code, action_kind, requirement, notes)
SELECT
  h.id,
  NULL,
  p.cadre_code,
  p.action_kind,
  p.requirement,
  'Default seeded by migration 0030.'
FROM public.hospitals h
CROSS JOIN (
  VALUES
    -- INTERN_DOCTOR (intern / JHO)
    ('INTERN_DOCTOR',     'prescription_routine',      'cosign_required'),
    ('INTERN_DOCTOR',     'prescription_controlled',   'blocked'),
    ('INTERN_DOCTOR',     'order_high_cost_imaging',   'cosign_required'),
    ('INTERN_DOCTOR',     'admit_patient',             'cosign_required'),
    ('INTERN_DOCTOR',     'discharge_patient',         'cosign_required'),
    -- CLINICAL_OFFICER
    ('CLINICAL_OFFICER',  'prescription_routine',      'cosign_required'),
    ('CLINICAL_OFFICER',  'prescription_controlled',   'blocked'),
    ('CLINICAL_OFFICER',  'order_high_cost_imaging',   'cosign_required'),
    ('CLINICAL_OFFICER',  'admit_patient',             'cosign_required'),
    ('CLINICAL_OFFICER',  'discharge_patient',         'cosign_required'),
    -- MEDICAL_OFFICER (independent except controlled substances)
    ('MEDICAL_OFFICER',   'prescription_routine',      'allowed'),
    ('MEDICAL_OFFICER',   'prescription_controlled',   'cosign_required'),
    ('MEDICAL_OFFICER',   'order_high_cost_imaging',   'allowed'),
    ('MEDICAL_OFFICER',   'admit_patient',             'allowed'),
    ('MEDICAL_OFFICER',   'discharge_patient',         'allowed'),
    -- MEDICAL_OFFICER_SG + CONSULTANT + SENIOR_CONSULTANT (full)
    ('MEDICAL_OFFICER_SG','prescription_routine',      'allowed'),
    ('MEDICAL_OFFICER_SG','prescription_controlled',   'allowed'),
    ('MEDICAL_OFFICER_SG','order_high_cost_imaging',   'allowed'),
    ('MEDICAL_OFFICER_SG','admit_patient',             'allowed'),
    ('MEDICAL_OFFICER_SG','discharge_patient',         'allowed'),
    ('CONSULTANT',        'prescription_routine',      'allowed'),
    ('CONSULTANT',        'prescription_controlled',   'allowed'),
    ('CONSULTANT',        'order_high_cost_imaging',   'allowed'),
    ('CONSULTANT',        'admit_patient',             'allowed'),
    ('CONSULTANT',        'discharge_patient',         'allowed'),
    ('SENIOR_CONSULTANT', 'prescription_routine',      'allowed'),
    ('SENIOR_CONSULTANT', 'prescription_controlled',   'allowed'),
    ('SENIOR_CONSULTANT', 'order_high_cost_imaging',   'allowed'),
    ('SENIOR_CONSULTANT', 'admit_patient',             'allowed'),
    ('SENIOR_CONSULTANT', 'discharge_patient',         'allowed')
) AS p(cadre_code, action_kind, requirement)
WHERE h.state = 'active'
ON CONFLICT DO NOTHING;


-- ─── 6. sa_audit_log widening ────────────────────────────────────────
ALTER TABLE public.sa_audit_log
  DROP CONSTRAINT IF EXISTS sa_audit_log_action_check;

ALTER TABLE public.sa_audit_log
  ADD CONSTRAINT sa_audit_log_action_check CHECK (
    action IN (
      -- Existing (mirror of migration 0028) -----------------------
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
      -- New: doctor workspace -------------------------------------
      'assign_supervision', 'end_supervision',
      'cosign_request', 'cosign_approve', 'cosign_return',
      'cosign_cancel', 'cosign_expire',
      'update_cosign_policy',
      'phi_access_break_glass'
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
      -- New: doctor workspace -------------------------------------
      'clinical_supervision', 'clinical_cosign_request',
      'clinical_cosign_policy', 'clinical_phi_access'
    )
  );
