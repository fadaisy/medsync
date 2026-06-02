-- 0038 — ABCDE Resuscitation surface.
--
-- Per docs/resus-abcde-gate-a-proposal.md §B/§C (CSO-signed 2026-06-02)
-- and the clinical-safety artifact resuscitation-abcde-clinical-reference.md.
--
-- Additive only. Schema deltas:
--   1. resus_episodes             one per resus activation (the header; PHI-linked)
--   2. resus_timeline_events      the append-only, immutable medico-legal log
--   3. resus_role_assignments     who holds which team role over time
--   4. resus_mobilisation_alerts  the team-call + the "who's responding" view
--   5. sa_audit_log               action + target_kind CHECK widening
--   6. sa_notifications           kind CHECK widening (resus mobilisation)
--
-- DECISION-SUPPORT, NOT AUTONOMOUS: these tables RECORD what the team
-- does; the clinician leads; the app never acts/orders/auto-administers.
-- The timeline is HARD append-only (block trigger + REVOKE UPDATE/DELETE)
-- — corrections are NEW events that supersede an earlier one via
-- supersedes_event_id; nothing is silently edited or deleted.
-- lib/resus/timeline.ts is the pure reconstruction + test oracle.
--
-- The full cardiac-arrest ALS algorithm is a SEPARATE later module — this
-- surface only detects arrest and routes to it (see §A.5 of the proposal).


-- ─── 1. resus_episodes (the header; PHI-linked) ─────────────────────
CREATE TABLE public.resus_episodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  department_id uuid REFERENCES public.hospital_departments(id) ON DELETE SET NULL,
  triage_record_id uuid REFERENCES public.triage_records(id) ON DELETE SET NULL,
  intake_id uuid REFERENCES public.patient_intakes(id) ON DELETE SET NULL,
  patient_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  encounter_id uuid REFERENCES public.encounters(id) ON DELETE SET NULL,

  trigger_kind text NOT NULL,
  trigger_reason text,

  state text NOT NULL DEFAULT 'active',
  disposition text,
  outcome text,

  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  arrest_detected_at timestamptz,

  opened_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT re_trigger_kind_check
    CHECK (trigger_kind IN ('triage_red','step0_life_threat','in_resus_deterioration')),
  CONSTRAINT re_state_check CHECK (state IN ('active','concluded','cancelled')),
  CONSTRAINT re_disposition_check CHECK (
    disposition IS NULL OR disposition IN
      ('theatre','icu','cath_lab','ward','mortuary','transferred','deceased')
  )
);

CREATE INDEX resus_episodes_hospital_idx ON public.resus_episodes (hospital_id, started_at DESC);
CREATE INDEX resus_episodes_patient_idx ON public.resus_episodes (patient_user_id, started_at DESC);
CREATE INDEX resus_episodes_triage_idx ON public.resus_episodes (triage_record_id);

ALTER TABLE public.resus_episodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resus_episodes FORCE ROW LEVEL SECURITY;

-- SELECT: superadmin; the patient (transparency); whoever opened it; any
-- active CLINICAL-staff member at the hospital (the converging team). The
-- is_clinical=true predicate keeps reception out at the DB.
CREATE POLICY resus_episodes_select_scoped ON public.resus_episodes
  FOR SELECT TO authenticated
  USING (
    public.user_has_role('superadmin')
    OR patient_user_id = auth.uid()
    OR opened_by_user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.staff_affiliations sa
      JOIN public.cadres c ON c.id = sa.cadre_id
      WHERE sa.user_id = auth.uid()
        AND sa.hospital_id = resus_episodes.hospital_id
        AND sa.state IN ('active','approved')
        AND c.is_clinical = true
    )
  );
-- Writes via server action (service role) only — owns authority + audit.

DROP TRIGGER IF EXISTS resus_episodes_updated_at ON public.resus_episodes;
CREATE TRIGGER resus_episodes_updated_at
  BEFORE UPDATE ON public.resus_episodes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS audit_resus_episodes ON public.resus_episodes;
CREATE TRIGGER audit_resus_episodes
  AFTER INSERT OR UPDATE OR DELETE ON public.resus_episodes
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_changes();


-- ─── 2. resus_timeline_events (immutable, append-only) ──────────────
CREATE TABLE public.resus_timeline_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  episode_id uuid NOT NULL REFERENCES public.resus_episodes(id) ON DELETE CASCADE,
  kind text NOT NULL,
  step text,
  recorded_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),   -- clinical time (bedside)
  created_at timestamptz NOT NULL DEFAULT now(),     -- system time (row written)
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  narrative_encrypted text,                          -- PHI, AES-256-GCM, nullable
  supersedes_event_id uuid REFERENCES public.resus_timeline_events(id) ON DELETE SET NULL,

  CONSTRAINT rte_kind_check CHECK (kind IN (
    'assessment','action','drug','fluid','procedure','vital','decision',
    'role_change','mobilisation','reassessment','arrest_detected',
    'cpr_started','handover','note'
  )),
  CONSTRAINT rte_step_check CHECK (
    step IS NULL OR step IN ('pre','A','B','C','D','E','arrest')
  )
);

CREATE INDEX resus_timeline_episode_recorded_idx
  ON public.resus_timeline_events (episode_id, recorded_at);
CREATE INDEX resus_timeline_episode_created_idx
  ON public.resus_timeline_events (episode_id, created_at);

-- Append-only enforcement (mirrors sa_audit_log, migration 0015). A
-- correction is a NEW row whose supersedes_event_id points at the row it
-- replaces — the original is RETAINED and only hidden from the active
-- view (lib/resus/timeline.ts). UPDATE/DELETE are forbidden outright.
CREATE OR REPLACE FUNCTION public.resus_timeline_block_mutation()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION 'resus_timeline_events is append-only; % forbidden (correct via a new superseding event)', TG_OP;
END;
$$;

DROP TRIGGER IF EXISTS resus_timeline_no_update ON public.resus_timeline_events;
CREATE TRIGGER resus_timeline_no_update
  BEFORE UPDATE ON public.resus_timeline_events
  FOR EACH ROW EXECUTE FUNCTION public.resus_timeline_block_mutation();

DROP TRIGGER IF EXISTS resus_timeline_no_delete ON public.resus_timeline_events;
CREATE TRIGGER resus_timeline_no_delete
  BEFORE DELETE ON public.resus_timeline_events
  FOR EACH ROW EXECUTE FUNCTION public.resus_timeline_block_mutation();

-- Defence in depth: revoke direct UPDATE/DELETE at the privilege layer.
REVOKE UPDATE, DELETE ON public.resus_timeline_events FROM PUBLIC;
REVOKE UPDATE, DELETE ON public.resus_timeline_events FROM anon;
REVOKE UPDATE, DELETE ON public.resus_timeline_events FROM authenticated;

ALTER TABLE public.resus_timeline_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resus_timeline_events FORCE ROW LEVEL SECURITY;

-- SELECT scoped through the parent episode: superadmin; the patient; any
-- active clinical staff at the episode's hospital; the recorder.
CREATE POLICY resus_timeline_select_scoped ON public.resus_timeline_events
  FOR SELECT TO authenticated
  USING (
    public.user_has_role('superadmin')
    OR recorded_by_user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.resus_episodes e
      WHERE e.id = resus_timeline_events.episode_id
        AND (
          e.patient_user_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.staff_affiliations sa
            JOIN public.cadres c ON c.id = sa.cadre_id
            WHERE sa.user_id = auth.uid()
              AND sa.hospital_id = e.hospital_id
              AND sa.state IN ('active','approved')
              AND c.is_clinical = true
          )
        )
    )
  );
-- Writes (INSERT only) via server action (service role).


-- ─── 3. resus_role_assignments (who holds which role over time) ─────
CREATE TABLE public.resus_role_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  episode_id uuid NOT NULL REFERENCES public.resus_episodes(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  assigned_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT rra_role_check CHECK (role IN (
    'leader','airway','circulation','scribe','runner','cpr_provider','family_liaison'
  ))
);

CREATE INDEX resus_role_episode_open_idx
  ON public.resus_role_assignments (episode_id, role)
  WHERE ended_at IS NULL;

ALTER TABLE public.resus_role_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resus_role_assignments FORCE ROW LEVEL SECURITY;

CREATE POLICY resus_roles_select_scoped ON public.resus_role_assignments
  FOR SELECT TO authenticated
  USING (
    public.user_has_role('superadmin')
    OR user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.resus_episodes e
      JOIN public.staff_affiliations sa ON sa.hospital_id = e.hospital_id
      JOIN public.cadres c ON c.id = sa.cadre_id
      WHERE e.id = resus_role_assignments.episode_id
        AND sa.user_id = auth.uid()
        AND sa.state IN ('active','approved')
        AND c.is_clinical = true
    )
  );

DROP TRIGGER IF EXISTS audit_resus_role_assignments ON public.resus_role_assignments;
CREATE TRIGGER audit_resus_role_assignments
  AFTER INSERT OR UPDATE OR DELETE ON public.resus_role_assignments
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_changes();


-- ─── 4. resus_mobilisation_alerts (team-call + responding view) ─────
CREATE TABLE public.resus_mobilisation_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  episode_id uuid NOT NULL REFERENCES public.resus_episodes(id) ON DELETE CASCADE,
  recipient_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  channel text NOT NULL DEFAULT 'in_app',
  sa_notification_id uuid REFERENCES public.sa_notifications(id) ON DELETE SET NULL,
  sent_at timestamptz NOT NULL DEFAULT now(),
  delivered_at timestamptz,
  acknowledged_at timestamptz,
  responding boolean NOT NULL DEFAULT false,

  CONSTRAINT rma_channel_check CHECK (channel IN ('in_app','sms','push'))
);

CREATE INDEX resus_mobilisation_episode_idx ON public.resus_mobilisation_alerts (episode_id);
CREATE INDEX resus_mobilisation_recipient_idx
  ON public.resus_mobilisation_alerts (recipient_user_id, sent_at DESC);

ALTER TABLE public.resus_mobilisation_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resus_mobilisation_alerts FORCE ROW LEVEL SECURITY;

-- SELECT: superadmin; the recipient (own alert); active clinical staff at
-- the episode's hospital (so the converging team sees who's responding).
CREATE POLICY resus_mobilisation_select_scoped ON public.resus_mobilisation_alerts
  FOR SELECT TO authenticated
  USING (
    public.user_has_role('superadmin')
    OR recipient_user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.resus_episodes e
      JOIN public.staff_affiliations sa ON sa.hospital_id = e.hospital_id
      JOIN public.cadres c ON c.id = sa.cadre_id
      WHERE e.id = resus_mobilisation_alerts.episode_id
        AND sa.user_id = auth.uid()
        AND sa.state IN ('active','approved')
        AND c.is_clinical = true
    )
  );

DROP TRIGGER IF EXISTS audit_resus_mobilisation_alerts ON public.resus_mobilisation_alerts;
CREATE TRIGGER audit_resus_mobilisation_alerts
  AFTER INSERT OR UPDATE OR DELETE ON public.resus_mobilisation_alerts
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_changes();


-- ─── 5. sa_audit_log widening ───────────────────────────────────────
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
      'mobilise_resus_team', 'detect_resus_arrest'
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
      'resus_role_assignment', 'resus_mobilisation_alert'
    )
  );


-- ─── 6. sa_notifications kind widening (resus mobilisation) ──────────
ALTER TABLE public.sa_notifications
  DROP CONSTRAINT IF EXISTS sa_notifications_kind_check;
ALTER TABLE public.sa_notifications
  ADD CONSTRAINT sa_notifications_kind_check CHECK (
    kind IN (
      'break_glass_access',
      'admin_action_on_tenant',
      'account_security',
      'clinical_triage_alert',
      -- New (resus, migration 0038): a resus activation summoning the
      -- recipient's department team to converge (recognition→call→response).
      'clinical_resus_mobilisation'
    )
  );


-- ─── 7. clinical_observations: continuous-monitoring kinds (GATE D) ──
-- Device-ready additions for the resus surface: end-tidal CO2 (capnography)
-- and urine output. Additive — existing kinds preserved.
ALTER TABLE public.clinical_observations
  DROP CONSTRAINT IF EXISTS obs_kind_check;
ALTER TABLE public.clinical_observations
  ADD CONSTRAINT obs_kind_check CHECK (observation_kind IN (
    'bp','hr','temperature','rr','spo2','glucose','pain',
    'weight','height','intake','output','gcs','other','acvpu',
    -- New (resus monitoring, migration 0038)
    'etco2','urine_output'
  ));
