-- 0068 — Resus Desk v2: modes, ALS arrest records, close-out, realtime.
--
-- Per docs/resus-v2-gate-a-proposal.md §8 (CSO-signed 2026-09-23) and the
-- catalogs docs/clinical/resus-{als,post-rosc,closeout}-clinical-catalog.md.
--
-- ADDITIVE. Nothing existing is altered in meaning, and nothing is closed:
--   1. resus_episodes          + phase, activity, arrest seq, close-out columns;
--                               disposition CHECK + hdu / labour_ward / discharged
--   2. resus_timeline_events   + 6 kinds, step 'post', arrest_seq,
--                               client_event_id (idempotency), late_entry
--   3. hospital_care_units     what each unit can deliver (level-of-care mapping)
--   4. resus_bay_profiles      the defibrillator registered to a bay
--   5. hospital_resus_settings antiarrhythmic choice + audio defaults
--   6. resus_arrest_records    immutable Utstein snapshot per arrest
--   7. resus_debriefs          the post-event debrief (immutable once submitted)
--   8. resus_after_death_tasks append-only checklist history
--   9. triggers                activity bump, PHI-free realtime broadcast,
--                               episode audit without per-event noise
--  10. realtime.messages       private-topic authorisation (guarded)
--  11. sa_notifications / sa_audit_log CHECK widening
--  12. legacy backfill        last_activity_at, phase, current_arrest_seq
--
-- DECISION-SUPPORT, NOT AUTONOMOUS. The timeline stays hard append-only.
-- No clinical number lives in the database: they are in the signed catalogs.
-- No seed rows: a unit's capabilities and a bay's defibrillator are facts
-- about a real hospital, entered by it (scripts/seed-resus-units.ts).


-- ─── 1. resus_episodes ───────────────────────────────────────────────
ALTER TABLE public.resus_episodes
  ADD COLUMN phase text NOT NULL DEFAULT 'survey',
  ADD COLUMN last_activity_at timestamptz,
  ADD COLUMN current_arrest_seq integer NOT NULL DEFAULT 0,
  ADD COLUMN outcome_code text,
  ADD COLUMN closure_kind text,
  ADD COLUMN closed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN cancel_reason text,
  ADD COLUMN disposition_decided_at timestamptz,
  ADD COLUMN suggested_level text,
  ADD COLUMN chosen_level text,
  ADD COLUMN level_mismatch_code text,
  ADD COLUMN death_confirmed_at timestamptz,
  ADD COLUMN pending_encounter_handoff boolean NOT NULL DEFAULT false,
  ADD COLUMN idle_notified_at timestamptz;

ALTER TABLE public.resus_episodes
  ADD CONSTRAINT re_phase_check CHECK (phase IN ('survey','arrest','post_rosc','boarding')),
  ADD CONSTRAINT re_arrest_seq_check CHECK (current_arrest_seq >= 0),
  ADD CONSTRAINT re_outcome_code_check CHECK (
    outcome_code IS NULL OR outcome_code IN (
      'stabilised','rosc_sustained','rosc_not_sustained',
      'died_after_cpr','died_cpr_not_attempted','transferred_out'
    )
  ),
  ADD CONSTRAINT re_outcome_code_state_check CHECK (outcome_code IS NULL OR state = 'concluded'),
  ADD CONSTRAINT re_closure_kind_check CHECK (
    closure_kind IS NULL OR (closure_kind IN ('bedside','administrative') AND state = 'concluded')
  ),
  ADD CONSTRAINT re_level_check CHECK (
    (suggested_level IS NULL OR suggested_level IN ('ward','l1','l2','l3'))
    AND (chosen_level IS NULL OR chosen_level IN ('ward','l1','l2','l3'))
  ),
  ADD CONSTRAINT re_level_mismatch_check CHECK (
    level_mismatch_code IS NULL OR level_mismatch_code IN
      ('no_bed','ceiling_of_care','family_declined','transfer_arranged','clinical_judgement')
  );

ALTER TABLE public.resus_episodes DROP CONSTRAINT IF EXISTS re_disposition_check;
ALTER TABLE public.resus_episodes
  ADD CONSTRAINT re_disposition_check CHECK (
    disposition IS NULL OR disposition IN (
      'theatre','icu','cath_lab','ward','mortuary','transferred','deceased',
      -- New (v2, 0068)
      'hdu','labour_ward','discharged'
    )
  );

CREATE INDEX resus_episodes_board_idx
  ON public.resus_episodes (hospital_id, state, last_activity_at DESC);


-- ─── 2. resus_timeline_events ────────────────────────────────────────
-- ADD COLUMN is DDL: the append-only row triggers do not fire.
ALTER TABLE public.resus_timeline_events
  ADD COLUMN arrest_seq integer,
  ADD COLUMN client_event_id uuid,
  ADD COLUMN late_entry boolean NOT NULL DEFAULT false;

ALTER TABLE public.resus_timeline_events DROP CONSTRAINT IF EXISTS rte_kind_check;
ALTER TABLE public.resus_timeline_events
  ADD CONSTRAINT rte_kind_check CHECK (kind IN (
    'assessment','action','drug','fluid','procedure','vital','decision',
    'role_change','mobilisation','reassessment','arrest_detected',
    'cpr_started','handover','note',
    -- New (v2, 0068)
    'context','rhythm_check','shock','rosc','resuscitation_stopped','death_confirmed'
  ));

ALTER TABLE public.resus_timeline_events DROP CONSTRAINT IF EXISTS rte_step_check;
ALTER TABLE public.resus_timeline_events
  ADD CONSTRAINT rte_step_check CHECK (
    step IS NULL OR step IN ('pre','A','B','C','D','E','arrest','post')
  );

ALTER TABLE public.resus_timeline_events
  ADD CONSTRAINT rte_arrest_seq_check CHECK (arrest_seq IS NULL OR arrest_seq >= 1);

-- Idempotency: one row per client write, per episode.
CREATE UNIQUE INDEX resus_timeline_client_event_uidx
  ON public.resus_timeline_events (episode_id, client_event_id)
  WHERE client_event_id IS NOT NULL;


-- Shared predicate for the new tables: active clinical staff at a hospital.
CREATE OR REPLACE FUNCTION public.is_active_clinical_staff(p_hospital uuid)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.staff_affiliations sa
    JOIN public.cadres c ON c.id = sa.cadre_id
    WHERE sa.user_id = auth.uid()
      AND sa.hospital_id = p_hospital
      AND sa.state IN ('active','approved')
      AND c.is_clinical = true
  );
$$;
REVOKE ALL ON FUNCTION public.is_active_clinical_staff(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_active_clinical_staff(uuid) TO authenticated;

-- One append-only guard for the three immutable v2 tables.
CREATE OR REPLACE FUNCTION public.resus_v2_block_mutation()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION '% is append-only; % forbidden (correct via a new superseding row)',
    TG_TABLE_NAME, TG_OP;
END;
$$;


-- ─── 3. hospital_care_units ──────────────────────────────────────────
CREATE TABLE public.hospital_care_units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  name text NOT NULL,
  unit_type text NOT NULL,
  age_group text NOT NULL DEFAULT 'adult',
  continuous_ecg boolean NOT NULL DEFAULT false,
  arterial_line boolean NOT NULL DEFAULT false,
  vasopressors boolean NOT NULL DEFAULT false,
  niv_cpap boolean NOT NULL DEFAULT false,
  invasive_ventilation boolean NOT NULL DEFAULT false,
  rrt boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT hcu_unit_type_check CHECK (unit_type IN (
    'ward','hdu','icu','theatre','cath_lab','labour_ward','paeds_ward','picu','nicu','ed_obs'
  )),
  CONSTRAINT hcu_age_group_check CHECK (age_group IN ('adult','paediatric','all')),
  CONSTRAINT hcu_name_unique UNIQUE (hospital_id, name)
);

ALTER TABLE public.hospital_care_units ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hospital_care_units FORCE ROW LEVEL SECURITY;

CREATE POLICY hospital_care_units_select_scoped ON public.hospital_care_units
  FOR SELECT TO authenticated
  USING (
    public.user_has_role('superadmin')
    OR public.is_active_clinical_staff(hospital_id)
  );
-- Writes: service role only (superadmin seed script until the wards feature).

CREATE TRIGGER hospital_care_units_updated_at
  BEFORE UPDATE ON public.hospital_care_units
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER audit_hospital_care_units
  AFTER INSERT OR UPDATE OR DELETE ON public.hospital_care_units
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_changes();


-- ─── 4. resus_bay_profiles ───────────────────────────────────────────
CREATE TABLE public.resus_bay_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  bay_label text NOT NULL,
  device_model text,
  waveform text NOT NULL DEFAULT 'unknown',
  -- Manufacturer energy sequence (J), entered by biomedical engineering and
  -- CSO-approved. NULL → the console shows "highest available setting" only.
  energy_sequence_j integer[],
  capnography boolean NOT NULL DEFAULT false,
  ultrasound boolean NOT NULL DEFAULT false,
  mechanical_cpr boolean NOT NULL DEFAULT false,
  ecpr boolean NOT NULL DEFAULT false,
  verified_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  verified_at timestamptz,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT rbp_waveform_check CHECK (waveform IN (
    'monophasic','biphasic_truncated_exponential','rectilinear_biphasic','pulsed_biphasic','unknown'
  )),
  CONSTRAINT rbp_energy_positive CHECK (
    energy_sequence_j IS NULL OR (cardinality(energy_sequence_j) BETWEEN 1 AND 10
      AND 0 < ALL (energy_sequence_j) AND 400 >= ALL (energy_sequence_j))
  ),
  CONSTRAINT rbp_bay_unique UNIQUE (hospital_id, bay_label)
);

ALTER TABLE public.resus_bay_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resus_bay_profiles FORCE ROW LEVEL SECURITY;

CREATE POLICY resus_bay_profiles_select_scoped ON public.resus_bay_profiles
  FOR SELECT TO authenticated
  USING (
    public.user_has_role('superadmin')
    OR public.is_active_clinical_staff(hospital_id)
  );

CREATE TRIGGER resus_bay_profiles_updated_at
  BEFORE UPDATE ON public.resus_bay_profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER audit_resus_bay_profiles
  AFTER INSERT OR UPDATE OR DELETE ON public.resus_bay_profiles
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_changes();

ALTER TABLE public.resus_episodes
  ADD COLUMN bay_profile_id uuid REFERENCES public.resus_bay_profiles(id) ON DELETE SET NULL,
  ADD COLUMN destination_unit_id uuid REFERENCES public.hospital_care_units(id) ON DELETE SET NULL;


-- ─── 5. hospital_resus_settings ──────────────────────────────────────
CREATE TABLE public.hospital_resus_settings (
  hospital_id uuid PRIMARY KEY REFERENCES public.hospitals(id) ON DELETE CASCADE,
  antiarrhythmic text NOT NULL DEFAULT 'amiodarone',
  rhythm_check_tone boolean NOT NULL DEFAULT true,
  metronome boolean NOT NULL DEFAULT false,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT hrs_antiarrhythmic_check CHECK (antiarrhythmic IN ('amiodarone','lidocaine'))
);

ALTER TABLE public.hospital_resus_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hospital_resus_settings FORCE ROW LEVEL SECURITY;

CREATE POLICY hospital_resus_settings_select_scoped ON public.hospital_resus_settings
  FOR SELECT TO authenticated
  USING (
    public.user_has_role('superadmin')
    OR public.is_active_clinical_staff(hospital_id)
  );

CREATE TRIGGER hospital_resus_settings_updated_at
  BEFORE UPDATE ON public.hospital_resus_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER audit_hospital_resus_settings
  AFTER INSERT OR UPDATE OR DELETE ON public.hospital_resus_settings
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_changes();


-- ─── 6. resus_arrest_records (immutable Utstein snapshot) ────────────
CREATE TABLE public.resus_arrest_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  episode_id uuid NOT NULL REFERENCES public.resus_episodes(id) ON DELETE CASCADE,
  arrest_seq integer NOT NULL,
  record jsonb NOT NULL,
  supersedes_record_id uuid REFERENCES public.resus_arrest_records(id) ON DELETE SET NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT rar_seq_check CHECK (arrest_seq >= 1)
);

CREATE INDEX resus_arrest_records_episode_idx
  ON public.resus_arrest_records (episode_id, arrest_seq, created_at DESC);

CREATE TRIGGER resus_arrest_records_no_update
  BEFORE UPDATE ON public.resus_arrest_records
  FOR EACH ROW EXECUTE FUNCTION public.resus_v2_block_mutation();
CREATE TRIGGER resus_arrest_records_no_delete
  BEFORE DELETE ON public.resus_arrest_records
  FOR EACH ROW EXECUTE FUNCTION public.resus_v2_block_mutation();
REVOKE UPDATE, DELETE ON public.resus_arrest_records FROM PUBLIC;
REVOKE UPDATE, DELETE ON public.resus_arrest_records FROM anon;
REVOKE UPDATE, DELETE ON public.resus_arrest_records FROM authenticated;

ALTER TABLE public.resus_arrest_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resus_arrest_records FORCE ROW LEVEL SECURITY;

CREATE POLICY resus_arrest_records_select_scoped ON public.resus_arrest_records
  FOR SELECT TO authenticated
  USING (
    public.user_has_role('superadmin')
    OR EXISTS (
      SELECT 1 FROM public.resus_episodes e
      WHERE e.id = resus_arrest_records.episode_id
        AND public.is_active_clinical_staff(e.hospital_id)
    )
  );


-- ─── 7. resus_debriefs ───────────────────────────────────────────────
CREATE TABLE public.resus_debriefs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  episode_id uuid NOT NULL REFERENCES public.resus_episodes(id) ON DELETE CASCADE,
  facilitator_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  attendee_count integer,
  went_well text,
  to_improve text,
  actions text,
  equipment_issues text,
  welfare_check_done boolean NOT NULL DEFAULT false,
  metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'draft',
  submitted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT rdb_status_check CHECK (status IN ('draft','submitted')),
  CONSTRAINT rdb_attendees_check CHECK (attendee_count IS NULL OR attendee_count >= 0),
  CONSTRAINT rdb_episode_unique UNIQUE (episode_id)
);

-- Immutable once submitted; never deleted.
CREATE OR REPLACE FUNCTION public.resus_debrief_guard()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'resus_debriefs rows are never deleted';
  END IF;
  IF OLD.status = 'submitted' THEN
    RAISE EXCEPTION 'resus_debriefs is immutable once submitted';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER resus_debriefs_guard
  BEFORE UPDATE OR DELETE ON public.resus_debriefs
  FOR EACH ROW EXECUTE FUNCTION public.resus_debrief_guard();
CREATE TRIGGER resus_debriefs_updated_at
  BEFORE UPDATE ON public.resus_debriefs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER audit_resus_debriefs
  AFTER INSERT OR UPDATE ON public.resus_debriefs
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_changes();

ALTER TABLE public.resus_debriefs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resus_debriefs FORCE ROW LEVEL SECURITY;

CREATE POLICY resus_debriefs_select_scoped ON public.resus_debriefs
  FOR SELECT TO authenticated
  USING (
    public.user_has_role('superadmin')
    OR EXISTS (
      SELECT 1 FROM public.resus_episodes e
      WHERE e.id = resus_debriefs.episode_id
        AND public.is_active_clinical_staff(e.hospital_id)
    )
  );


-- ─── 8. resus_after_death_tasks (append-only history) ────────────────
CREATE TABLE public.resus_after_death_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  episode_id uuid NOT NULL REFERENCES public.resus_episodes(id) ON DELETE CASCADE,
  task_id text NOT NULL,
  state text NOT NULL,
  note text,
  recorded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT radt_state_check CHECK (state IN ('done','not_applicable','pending')),
  CONSTRAINT radt_task_check CHECK (task_id ~ '^CO-ADT-[0-9]{2}$')
);

CREATE INDEX resus_after_death_tasks_episode_idx
  ON public.resus_after_death_tasks (episode_id, task_id, recorded_at DESC);

CREATE TRIGGER resus_after_death_tasks_no_update
  BEFORE UPDATE ON public.resus_after_death_tasks
  FOR EACH ROW EXECUTE FUNCTION public.resus_v2_block_mutation();
CREATE TRIGGER resus_after_death_tasks_no_delete
  BEFORE DELETE ON public.resus_after_death_tasks
  FOR EACH ROW EXECUTE FUNCTION public.resus_v2_block_mutation();
REVOKE UPDATE, DELETE ON public.resus_after_death_tasks FROM PUBLIC;
REVOKE UPDATE, DELETE ON public.resus_after_death_tasks FROM anon;
REVOKE UPDATE, DELETE ON public.resus_after_death_tasks FROM authenticated;

ALTER TABLE public.resus_after_death_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resus_after_death_tasks FORCE ROW LEVEL SECURITY;

CREATE POLICY resus_after_death_tasks_select_scoped ON public.resus_after_death_tasks
  FOR SELECT TO authenticated
  USING (
    public.user_has_role('superadmin')
    OR EXISTS (
      SELECT 1 FROM public.resus_episodes e
      WHERE e.id = resus_after_death_tasks.episode_id
        AND public.is_active_clinical_staff(e.hospital_id)
    )
  );


-- ─── 12. legacy backfill (before the broadcast triggers exist) ───────
-- Nothing is closed. Legacy episodes idle ≥ 2 h surface under "Needs closing".
UPDATE public.resus_episodes e
SET last_activity_at = COALESCE(
      (SELECT max(t.created_at) FROM public.resus_timeline_events t WHERE t.episode_id = e.id),
      e.started_at),
    phase = CASE WHEN e.state = 'active' AND e.arrest_detected_at IS NOT NULL
                 THEN 'arrest' ELSE 'survey' END,
    current_arrest_seq = CASE WHEN e.arrest_detected_at IS NOT NULL THEN 1 ELSE 0 END;


-- ─── 9. triggers: activity, realtime broadcast, quieter audit ────────
-- The episode audit trigger no longer writes a row when only the activity
-- clock moved (one timeline insert would otherwise audit the header too).
DROP TRIGGER IF EXISTS audit_resus_episodes ON public.resus_episodes;
CREATE TRIGGER audit_resus_episodes
  AFTER INSERT OR DELETE ON public.resus_episodes
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_changes();
CREATE TRIGGER audit_resus_episodes_update
  AFTER UPDATE ON public.resus_episodes
  FOR EACH ROW
  WHEN ((to_jsonb(OLD) - 'last_activity_at' - 'updated_at')
        IS DISTINCT FROM (to_jsonb(NEW) - 'last_activity_at' - 'updated_at'))
  EXECUTE FUNCTION public.audit_log_changes();

-- Realtime payloads carry ids and kinds only — never PHI. A missing or
-- failing realtime layer must never block the record, so errors are caught.
CREATE OR REPLACE FUNCTION public.resus_timeline_after_insert()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = ''
AS $$
BEGIN
  UPDATE public.resus_episodes
     SET last_activity_at = GREATEST(COALESCE(last_activity_at, NEW.created_at), NEW.created_at)
   WHERE id = NEW.episode_id;
  BEGIN
    PERFORM realtime.send(
      jsonb_build_object('eventId', NEW.id, 'kind', NEW.kind, 'recordedAt', NEW.recorded_at),
      'event',
      'resus:' || NEW.episode_id::text,
      true
    );
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  RETURN NULL;
END;
$$;

CREATE TRIGGER resus_timeline_after_insert
  AFTER INSERT ON public.resus_timeline_events
  FOR EACH ROW EXECUTE FUNCTION public.resus_timeline_after_insert();

CREATE OR REPLACE FUNCTION public.resus_episode_broadcast()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.state IS NOT DISTINCT FROM OLD.state
     AND NEW.phase IS NOT DISTINCT FROM OLD.phase
     AND NEW.current_arrest_seq IS NOT DISTINCT FROM OLD.current_arrest_seq
     AND NEW.disposition_decided_at IS NOT DISTINCT FROM OLD.disposition_decided_at THEN
    RETURN NULL;
  END IF;
  BEGIN
    PERFORM realtime.send(
      jsonb_build_object('episodeId', NEW.id, 'state', NEW.state, 'phase', NEW.phase),
      'episode',
      'resus-board:' || NEW.hospital_id::text,
      true
    );
    PERFORM realtime.send(
      jsonb_build_object('episodeId', NEW.id, 'state', NEW.state, 'phase', NEW.phase),
      'episode',
      'resus:' || NEW.id::text,
      true
    );
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  RETURN NULL;
END;
$$;

CREATE TRIGGER resus_episode_broadcast
  AFTER INSERT OR UPDATE ON public.resus_episodes
  FOR EACH ROW EXECUTE FUNCTION public.resus_episode_broadcast();


-- ─── 10. realtime.messages: private-topic authorisation ──────────────
-- resus:<episodeId>       → active clinical staff at that episode's hospital
-- resus-board:<hospitalId> → active clinical staff at that hospital
-- Guarded: environments without the realtime schema skip this block.
DO $do$
BEGIN
  IF to_regclass('realtime.messages') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS resus_realtime_receive ON realtime.messages';
    EXECUTE $p$
      CREATE POLICY resus_realtime_receive ON realtime.messages
        FOR SELECT TO authenticated
        USING (
          realtime.messages.extension = 'broadcast'
          AND (
            (
              (SELECT realtime.topic()) LIKE 'resus:%'
              AND EXISTS (
                SELECT 1 FROM public.resus_episodes e
                WHERE e.id::text = substring((SELECT realtime.topic()) FROM 7)
                  AND public.is_active_clinical_staff(e.hospital_id)
              )
            )
            OR (
              (SELECT realtime.topic()) LIKE 'resus-board:%'
              AND EXISTS (
                SELECT 1 FROM public.hospitals h
                WHERE h.id::text = substring((SELECT realtime.topic()) FROM 13)
                  AND public.is_active_clinical_staff(h.id)
              )
            )
          )
        )
    $p$;
  END IF;
END
$do$;


-- ─── 11. sa_notifications / sa_audit_log widening ────────────────────
ALTER TABLE public.sa_notifications
  DROP CONSTRAINT IF EXISTS sa_notifications_kind_check;
ALTER TABLE public.sa_notifications
  ADD CONSTRAINT sa_notifications_kind_check CHECK (
    kind IN (
      'break_glass_access', 'admin_action_on_tenant', 'account_security',
      'clinical_triage_alert', 'clinical_resus_mobilisation',
      -- New (v2, 0068): one call per cardiac arrest; the 12 h idle notice.
      'clinical_resus_arrest_call', 'clinical_resus_idle'
    )
  );

-- DROP-then-ADD: 0066's lists verbatim plus the v2 actions and target kinds.
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
      'sms_stop',
      'set_service_line_fee',
      'submit_symptoms', 'emergency_interrupt_shown', 'emergency_declined',
      'emergency_call_tapped', 'request_same_day',
      'create_pre_arrival', 'update_pre_arrival',
      'sign_catalog_version', 'verify_emergency_contact',
      'set_hospital_emergency_settings',
      -- New (resus desk v2, migration 0068)
      'set_resus_phase', 'stop_resuscitation', 'confirm_death',
      'set_resus_disposition', 'cancel_resus_episode',
      'close_resus_administratively', 'reactivate_resus',
      'record_resus_arrest_record', 'submit_resus_debrief',
      'record_resus_after_death_task', 'update_resus_settings'
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
      'service_line_fee',
      'symptom_submission', 'emergency_pre_arrival', 'emergency_contact',
      'patient_symptom_catalog_version',
      -- New (resus desk v2, migration 0068)
      'resus_arrest_record', 'resus_debrief', 'resus_after_death_task',
      'hospital_care_unit', 'resus_bay_profile', 'hospital_resus_settings'
    )
  );
