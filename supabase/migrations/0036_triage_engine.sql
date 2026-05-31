-- 0036 — Smart Triage Engine.
--
-- Per docs/triage-engine-gate-a-proposal.md §B (CSO-approved) and the
-- clinical-safety artifact docs/clinical/triage-medical-research.md.
--
-- Additive only. Schema deltas:
--   1. triage_discriminators   reference data (the §A.2 red-flag list)
--   2. triage_records          the medico-legal triage record (PHI)
--   3. triage_config           per-hospital target-time / threshold overrides
--   4. patient_intakes         + triage_level, + triaged_at (board sort key)
--   5. queue_entries           + priority_order (triage re-rank w/o losing FIFO)
--   6. clinical_observations   obs_kind_check widened with 'acvpu' (R4)
--                              + triage_record_id link
--   7. clinical_cosign_policies/requests action_kind widened with
--      'triage_patient' + 'triage_downgrade' (R1) + default seed
--   8. sa_audit_log            action + target_kind CHECK widening
--
-- The triage SCORING is a pure deterministic function in lib/triage
-- (GATE B/C) — this migration is its storage + authority substrate.


-- ─── 1. triage_discriminators (reference data) ──────────────────────
-- The SATS-style red-flag list. Seeded from the ratified §A.2 table;
-- CSO-extensible without a code change. lib/triage/discriminators.ts is
-- the in-app mirror + test oracle.
CREATE TABLE public.triage_discriminators (
  code text PRIMARY KEY,
  label text NOT NULL,
  min_acuity_level smallint NOT NULL,
  applies_to text NOT NULL DEFAULT 'all',
  source text NOT NULL DEFAULT 'manual',
  is_life_threat boolean NOT NULL DEFAULT false,
  is_conditional boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT td_min_acuity_check CHECK (min_acuity_level BETWEEN 1 AND 5),
  CONSTRAINT td_applies_to_check
    CHECK (applies_to IN ('all','adult','paediatric','obstetric')),
  CONSTRAINT td_source_check CHECK (source IN ('manual','derived'))
);

ALTER TABLE public.triage_discriminators ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.triage_discriminators FORCE ROW LEVEL SECURITY;

-- Reference data: any authenticated user reads (matches entry_types).
CREATE POLICY triage_discriminators_select_all ON public.triage_discriminators
  FOR SELECT TO authenticated USING (true);
-- Writes via service-role / migration only (CSO-gated).

INSERT INTO public.triage_discriminators
  (code, label, min_acuity_level, applies_to, source, is_life_threat, is_conditional, sort_order)
VALUES
  ('airway_compromise',                'Airway compromise / stridor',                         1, 'all',        'manual',  true,  false, 10),
  ('absent_agonal_breathing',          'Absent or agonal breathing',                          1, 'all',        'manual',  true,  false, 20),
  ('cardiac_arrest_no_pulse',          'No palpable pulse / cardiac arrest',                  1, 'all',        'manual',  true,  false, 30),
  ('unresponsive',                     'Unresponsive (U on ACVPU)',                           1, 'all',        'manual',  true,  false, 40),
  ('active_seizure',                   'Active seizure (incl. eclampsia)',                    1, 'all',        'manual',  true,  false, 50),
  ('exsanguinating_haemorrhage',       'Exsanguinating / uncontrolled haemorrhage',           1, 'all',        'manual',  true,  false, 60),
  ('spo2_critical_under_90_on_o2',     'SpO2 < 90% despite oxygen',                           1, 'all',        'derived', true,  false, 70),
  ('glucose_critical_under_3',         'Glucose < 3.0 mmol/L',                                1, 'all',        'derived', true,  false, 80),
  ('cardiac_chest_pain',               'Cardiac-sounding chest pain',                         2, 'adult',      'manual',  false, false, 90),
  ('focal_neuro_deficit',              'Focal neuro deficit / suspected stroke',              2, 'all',        'manual',  false, false, 100),
  ('sepsis_suspicion',                 'Sepsis suspicion (infection source)',                 2, 'adult',      'manual',  false, true,  110),
  ('severe_resp_distress',             'Severe respiratory distress (working hard)',          2, 'all',        'manual',  false, false, 120),
  ('shock_index_high',                 'Shock Index >= 1.0 (occult shock)',                   2, 'adult',      'derived', false, false, 130),
  ('obstetric_severe_htn',             'SBP >= 160 or DBP >= 110 (severe pre-eclampsia)',     1, 'obstetric',  'derived', false, false, 140),
  ('obstetric_heavy_pv_bleeding',      'Heavy PV bleeding',                                   1, 'obstetric',  'manual',  false, false, 150),
  ('obstetric_preeclampsia_triad',     'Pre-eclampsia triad (headache + visual + epigastric)',2, 'obstetric',  'manual',  false, false, 160),
  ('reduced_fetal_movements',          'Reduced fetal movements',                             2, 'obstetric',  'manual',  false, false, 170),
  ('paed_grunting_cyanosis_caprefill', 'Grunting / cyanosis / cap refill > 3s',               2, 'paediatric', 'manual',  false, false, 180),
  ('paed_non_blanching_rash',          'Non-blanching rash',                                  1, 'paediatric', 'manual',  false, false, 190),
  ('paed_infant_fever',                'Infant < 3 months, fever >= 38C',                     2, 'paediatric', 'manual',  false, false, 200),
  ('severe_pain',                      'Severe pain (>= 7/10)',                               3, 'all',        'manual',  false, false, 210)
ON CONFLICT (code) DO NOTHING;


-- ─── 2. triage_records (the medico-legal record; PHI) ───────────────
CREATE TABLE public.triage_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  intake_id uuid REFERENCES public.patient_intakes(id) ON DELETE SET NULL,
  patient_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  department_id uuid REFERENCES public.hospital_departments(id) ON DELETE SET NULL,

  ruleset text NOT NULL,
    -- 'adult_news2' | 'paediatric_pews' | 'obstetric_meows'

  -- The exact inputs used + the full transparent breakdown — the
  -- reproducibility substrate. Recomputable by lib/triage from these.
  vitals_snapshot jsonb NOT NULL,
  computed_level smallint NOT NULL,
  computed_score integer,
  computed_breakdown jsonb NOT NULL,

  -- After clinician confirm/override (Step 7).
  assigned_level smallint NOT NULL,
  override_direction text NOT NULL DEFAULT 'none',
    -- 'up' | 'down' | 'none'
  override_reason text,

  baseline_adjusted boolean NOT NULL DEFAULT false,
  baseline_reason text,
  life_threat_fast_tracked boolean NOT NULL DEFAULT false,
  provisional boolean NOT NULL DEFAULT false,

  triaged_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  triaged_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT tr_ruleset_check
    CHECK (ruleset IN ('adult_news2','paediatric_pews','obstetric_meows')),
  CONSTRAINT tr_computed_level_check CHECK (computed_level BETWEEN 1 AND 5),
  CONSTRAINT tr_assigned_level_check CHECK (assigned_level BETWEEN 1 AND 5),
  CONSTRAINT tr_override_direction_check
    CHECK (override_direction IN ('up','down','none')),
  -- A down-override MUST carry a reason (safety: under-triage is audited).
  CONSTRAINT tr_override_reason_required
    CHECK (override_direction <> 'down' OR override_reason IS NOT NULL),
  -- A baseline adjustment MUST carry a reason.
  CONSTRAINT tr_baseline_reason_required
    CHECK (baseline_adjusted = false OR baseline_reason IS NOT NULL)
);

CREATE INDEX triage_records_intake_idx ON public.triage_records (intake_id);
CREATE INDEX triage_records_patient_idx
  ON public.triage_records (patient_user_id, triaged_at DESC);
CREATE INDEX triage_records_hospital_idx
  ON public.triage_records (hospital_id, triaged_at DESC);

ALTER TABLE public.triage_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.triage_records FORCE ROW LEVEL SECURITY;

-- SELECT: superadmin; the patient (transparency); the triaging
-- clinician; any active CLINICAL-staff member at the hospital. The
-- is_clinical=true predicate keeps reception out at the DB (mig 0033
-- pattern). Reception delivers patients to awaiting_triage but can
-- never read a triage assessment.
CREATE POLICY triage_records_select_scoped ON public.triage_records
  FOR SELECT TO authenticated
  USING (
    public.user_has_role('superadmin')
    OR patient_user_id = auth.uid()
    OR triaged_by_user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.staff_affiliations sa
      JOIN public.cadres c ON c.id = sa.cadre_id
      WHERE sa.user_id = auth.uid()
        AND sa.hospital_id = triage_records.hospital_id
        AND sa.state IN ('active','approved')
        AND c.is_clinical = true
    )
  );
-- Writes via Edge Function (ha-triage-*) only — owns authority + audit.

DROP TRIGGER IF EXISTS triage_records_updated_at ON public.triage_records;
CREATE TRIGGER triage_records_updated_at
  BEFORE UPDATE ON public.triage_records
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS audit_triage_records ON public.triage_records;
CREATE TRIGGER audit_triage_records
  AFTER INSERT OR UPDATE OR DELETE ON public.triage_records
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_changes();


-- ─── 3. triage_config (per-hospital overrides; optional) ────────────
-- Safe validated defaults live in lib/triage/constants.ts; a row here
-- overrides target-times / thresholds for one hospital. Follows
-- department_scheduling_policy's shape. CSO-gated for clinical thresholds.
CREATE TABLE public.triage_config (
  hospital_id uuid PRIMARY KEY REFERENCES public.hospitals(id) ON DELETE CASCADE,
  target_minutes_by_level jsonb,
    -- e.g. {"1":0,"2":10,"3":60,"4":120,"5":240}
  threshold_overrides jsonb,
  updated_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.triage_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.triage_config FORCE ROW LEVEL SECURITY;

CREATE POLICY triage_config_select_scoped ON public.triage_config
  FOR SELECT TO authenticated
  USING (
    public.user_has_role('superadmin')
    OR EXISTS (
      SELECT 1 FROM public.staff_affiliations sa
      WHERE sa.user_id = auth.uid()
        AND sa.hospital_id = triage_config.hospital_id
        AND sa.state IN ('active','approved')
    )
  );

DROP TRIGGER IF EXISTS triage_config_updated_at ON public.triage_config;
CREATE TRIGGER triage_config_updated_at
  BEFORE UPDATE ON public.triage_config
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ─── 4. patient_intakes: denormalized board-sort keys ───────────────
ALTER TABLE public.patient_intakes
  ADD COLUMN IF NOT EXISTS triage_level smallint;
ALTER TABLE public.patient_intakes
  ADD COLUMN IF NOT EXISTS triaged_at timestamptz;
ALTER TABLE public.patient_intakes
  DROP CONSTRAINT IF EXISTS intakes_triage_level_check;
ALTER TABLE public.patient_intakes
  ADD CONSTRAINT intakes_triage_level_check
    CHECK (triage_level IS NULL OR triage_level BETWEEN 1 AND 5);

CREATE INDEX IF NOT EXISTS patient_intakes_triage_sort_idx
  ON public.patient_intakes (hospital_id, triage_level, triaged_at)
  WHERE triage_level IS NOT NULL;


-- ─── 5. queue_entries: priority_order (triage re-rank) ──────────────
-- sequence_number stays the immutable FIFO arrival order; priority_order
-- is the triage-assigned sort key (lower = seen sooner). Null until
-- triaged → falls back to sequence_number in the board query.
ALTER TABLE public.queue_entries
  ADD COLUMN IF NOT EXISTS priority_order integer;


-- ─── 6. clinical_observations: ACVPU (R4) + triage link ─────────────
ALTER TABLE public.clinical_observations
  DROP CONSTRAINT IF EXISTS obs_kind_check;
ALTER TABLE public.clinical_observations
  ADD CONSTRAINT obs_kind_check CHECK (observation_kind IN (
    'bp','hr','temperature','rr','spo2','glucose','pain',
    'weight','height','intake','output','gcs','other',
    -- New (triage, migration 0036): ACVPU consciousness (R4).
    'acvpu'
  ));

ALTER TABLE public.clinical_observations
  ADD COLUMN IF NOT EXISTS triage_record_id uuid
    REFERENCES public.triage_records(id) ON DELETE SET NULL;


-- ─── 7. cosign action_kind: triage authority (R1) ───────────────────
-- triage_patient = may perform a triage at all (clinical cadres allowed,
--   reception blocked). triage_downgrade = may assign BELOW the computed
--   level (doctors / clinical officers only — R1).
ALTER TABLE public.clinical_cosign_policies
  DROP CONSTRAINT IF EXISTS cosign_policy_action_check;
ALTER TABLE public.clinical_cosign_policies
  ADD CONSTRAINT cosign_policy_action_check CHECK (action_kind IN (
    'prescription_routine','prescription_controlled',
    'order_high_cost_imaging','admit_patient','discharge_patient',
    'high_alert_med_administration','independent_complex_procedure',
    'triage_patient','triage_downgrade'
  ));

ALTER TABLE public.clinical_cosign_requests
  DROP CONSTRAINT IF EXISTS cosign_action_kind_check;
ALTER TABLE public.clinical_cosign_requests
  ADD CONSTRAINT cosign_action_kind_check CHECK (action_kind IN (
    'prescription_routine','prescription_controlled',
    'order_high_cost_imaging','admit_patient','discharge_patient',
    'high_alert_med_administration','independent_complex_procedure',
    'triage_patient','triage_downgrade'
  ));

-- Default seed (per §A.4 matrix). Clinical cadres may triage; only
-- doctor / clinical-officer cadres may down-triage. Reception is
-- non-clinical → no row → resolver default 'blocked' (and RLS denies).
INSERT INTO public.clinical_cosign_policies
  (hospital_id, department_id, cadre_code, action_kind, requirement, notes)
SELECT
  h.id, NULL, p.cadre_code, p.action_kind, p.requirement,
  'Default seeded by migration 0036 (triage authority §A.4 / R1).'
FROM public.hospitals h
CROSS JOIN (
  VALUES
    -- May triage (allowed for all clinical cadres).
    ('NURSE',             'triage_patient',   'allowed'),
    ('MIDWIFE',           'triage_patient',   'allowed'),
    ('SPECIALIST_NURSE',  'triage_patient',   'allowed'),
    ('INTERN_DOCTOR',     'triage_patient',   'allowed'),
    ('MEDICAL_OFFICER',   'triage_patient',   'allowed'),
    ('MEDICAL_OFFICER_SG','triage_patient',   'allowed'),
    ('CONSULTANT',        'triage_patient',   'allowed'),
    ('SENIOR_CONSULTANT', 'triage_patient',   'allowed'),
    ('CLINICAL_OFFICER',  'triage_patient',   'allowed'),
    -- May down-triage (R1: doctors + clinical officers only).
    ('NURSE',             'triage_downgrade', 'blocked'),
    ('MIDWIFE',           'triage_downgrade', 'blocked'),
    ('SPECIALIST_NURSE',  'triage_downgrade', 'blocked'),
    ('INTERN_DOCTOR',     'triage_downgrade', 'allowed'),
    ('MEDICAL_OFFICER',   'triage_downgrade', 'allowed'),
    ('MEDICAL_OFFICER_SG','triage_downgrade', 'allowed'),
    ('CONSULTANT',        'triage_downgrade', 'allowed'),
    ('SENIOR_CONSULTANT', 'triage_downgrade', 'allowed'),
    ('CLINICAL_OFFICER',  'triage_downgrade', 'allowed')
) AS p(cadre_code, action_kind, requirement)
WHERE h.state = 'active'
ON CONFLICT DO NOTHING;


-- ─── 8. sa_audit_log widening ──────────────────────────────────────
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
      -- New (triage, migration 0036)
      'compute_triage', 'assign_triage', 'override_triage',
      'adjust_triage_baseline'
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
      -- New (triage, migration 0036)
      'triage_record'
    )
  );
