-- GATED — applied by the owner (`npm run db:migrate`), never auto-run.
-- 0296: clinics and schedule (docs/clinics-schedule/gate-a-proposal.md §C, ADRs 0501–0507).
-- An editor over the engine's own records. The missing fields are COLUMNS on those records (service_lines,
-- session_templates, hospital_places, staff_affiliations, desk_devices, availability_blocks); the only new tables
-- are the draft log, versions, scheduled publishes, fee bands and per-hospital holiday decisions — none of them
-- holds a clinic, session, place, holiday, closure or person (CS2). The engine tables stay the published version
-- that patients, desks, screens and SMS read (CS3). `cs_publish` applies a set of draft changes in ONE
-- transaction (P4). Written only by service-role server actions after the hospital-admin scope check: RLS on,
-- no client policy, plus the MFA gate.

/* ─── the clinic: service_lines ─────────────────────────────────── */
ALTER TABLE public.service_lines
  ADD COLUMN IF NOT EXISTS short_name text CHECK (short_name IS NULL OR length(short_name) <= 16),
  -- CS5: never red, ≥ 3:1 on white — checked in the app (pure `colourCheck`) and shape-checked here.
  ADD COLUMN IF NOT EXISTS colour text CHECK (colour IS NULL OR colour ~ '^#[0-9a-fA-F]{6}$'),
  ADD COLUMN IF NOT EXISTS room_place_ids uuid[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS block_place_id uuid REFERENCES public.hospital_places(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS tier text NOT NULL DEFAULT 'general' CHECK (tier IN ('general', 'private', 'both')),
  ADD COLUMN IF NOT EXISTS ages text NOT NULL DEFAULT 'all' CHECK (ages IN ('all', 'children')),
  ADD COLUMN IF NOT EXISTS patient_words text CHECK (patient_words IS NULL OR length(patient_words) <= 140),
  ADD COLUMN IF NOT EXISTS referral_required boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS fee_mode text CHECK (fee_mode IS NULL OR fee_mode IN ('free', 'band', 'flat')),
  ADD COLUMN IF NOT EXISTS fee_private_ugx integer CHECK (fee_private_ugx IS NULL OR fee_private_ugx >= 0),
  ADD COLUMN IF NOT EXISTS fee_overrides jsonb NOT NULL DEFAULT '{}',
  -- aheadDays, closes, sameDay, walkins, reminder, followUpSkipTriage (D-CS-19: default false)
  ADD COLUMN IF NOT EXISTS booking_rules jsonb NOT NULL DEFAULT
    '{"aheadDays":30,"closes":"start","sameDay":true,"walkins":true,"reminder":true,"followUpSkipTriage":false}',
  ADD COLUMN IF NOT EXISTS pay_options jsonb NOT NULL DEFAULT '{"cash":true,"mtn":false,"airtel":false,"when":"arrive"}',
  ADD COLUMN IF NOT EXISTS team_user_ids uuid[] NOT NULL DEFAULT '{}',
  -- P7: pause is immediate and audited; resume goes through publish.
  ADD COLUMN IF NOT EXISTS paused_at timestamptz,
  ADD COLUMN IF NOT EXISTS paused_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

/* ─── the session: session_templates ────────────────────────────── */
-- The single clinician_user_id / place_id stay (older readers); the arrays are the full truth and the server keeps
-- the singles equal to the first element.
ALTER TABLE public.session_templates
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'day' CHECK (kind IN ('day', 'times')),
  ADD COLUMN IF NOT EXISTS slot_minutes smallint CHECK (slot_minutes IS NULL OR slot_minutes BETWEEN 5 AND 120),
  ADD COLUMN IF NOT EXISTS visit_minutes smallint CHECK (visit_minutes IS NULL OR visit_minutes BETWEEN 5 AND 120),
  ADD COLUMN IF NOT EXISTS walk_in_hold_pct smallint NOT NULL DEFAULT 0 CHECK (walk_in_hold_pct IN (0, 10, 20, 30)),
  ADD COLUMN IF NOT EXISTS break_start_minutes smallint,
  ADD COLUMN IF NOT EXISTS break_end_minutes smallint,
  ADD COLUMN IF NOT EXISTS place_ids uuid[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS clinician_user_ids uuid[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS places_set boolean NOT NULL DEFAULT true;
ALTER TABLE public.session_templates DROP CONSTRAINT IF EXISTS session_templates_break_inside;
ALTER TABLE public.session_templates ADD CONSTRAINT session_templates_break_inside CHECK (
  (break_start_minutes IS NULL AND break_end_minutes IS NULL) OR
  (break_start_minutes > start_minutes_local AND break_end_minutes > break_start_minutes
   AND break_end_minutes < start_minutes_local + duration_minutes));

/* ─── places: blocks and wings, rooms in them ──────────────────── */
ALTER TABLE public.hospital_places
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'room' CHECK (kind IN ('block', 'room')),
  ADD COLUMN IF NOT EXISTS parent_id uuid REFERENCES public.hospital_places(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS tier text CHECK (tier IS NULL OR tier IN ('general', 'private'));
ALTER TABLE public.hospital_places DROP CONSTRAINT IF EXISTS hospital_places_block_shape;
ALTER TABLE public.hospital_places ADD CONSTRAINT hospital_places_block_shape CHECK (
  (kind = 'block' AND parent_id IS NULL) OR kind = 'room');

/* ─── people: grade band, office, booking-card consent (CS8) ─────── */
ALTER TABLE public.staff_affiliations
  ADD COLUMN IF NOT EXISTS fee_band text CHECK (fee_band IS NULL OR fee_band IN ('nurse', 'co', 'mo', 'specialist', 'consultant')),
  ADD COLUMN IF NOT EXISTS office_place_id uuid REFERENCES public.hospital_places(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS card_name boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS card_photo boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS card_consent_on date,
  ADD COLUMN IF NOT EXISTS card_consent_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.staff_affiliations DROP CONSTRAINT IF EXISTS staff_affiliations_card_consent;
ALTER TABLE public.staff_affiliations ADD CONSTRAINT staff_affiliations_card_consent CHECK (
  (NOT card_name AND NOT card_photo) OR (card_consent_on IS NOT NULL AND card_consent_by IS NOT NULL));

/* ─── devices: kind, place, clinic coverage, lock, pairing (ADR 0507) ─ */
ALTER TABLE public.desk_devices
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'desk' CHECK (kind IN ('desk', 'tablet', 'screen')),
  ADD COLUMN IF NOT EXISTS place text CHECK (place IS NULL OR length(place) <= 60),
  ADD COLUMN IF NOT EXISTS mine_service_line_ids uuid[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS lock_minutes smallint CHECK (lock_minutes IS NULL OR lock_minutes IN (5, 10, 15)),
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz,
  ADD COLUMN IF NOT EXISTS pair_code_hash text CHECK (pair_code_hash IS NULL OR pair_code_hash LIKE '$2%'),
  ADD COLUMN IF NOT EXISTS pair_code_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS pair_code_used_at timestamptz;

-- One code per device, single use, 15 minutes; the plain code is returned once and never stored.
CREATE OR REPLACE FUNCTION public.desk_pair_issue(p_device_id uuid, p_code text)
  RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp
AS $$
BEGIN
  IF p_code !~ '^[A-HJ-NP-Z2-9]{6}$' THEN RAISE EXCEPTION 'code_format' USING ERRCODE = '22023'; END IF;
  UPDATE public.desk_devices
     SET pair_code_hash = crypt(p_code, gen_salt('bf', 8)), pair_code_expires_at = now() + interval '15 minutes',
         pair_code_used_at = NULL
   WHERE id = p_device_id;
END;
$$;
CREATE OR REPLACE FUNCTION public.desk_pair_claim(p_hospital uuid, p_code text)
  RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp
AS $$
DECLARE d uuid;
BEGIN
  SELECT id INTO d FROM public.desk_devices
   WHERE hospital_id = p_hospital AND pair_code_used_at IS NULL AND pair_code_expires_at > now()
     AND pair_code_hash = crypt(upper(p_code), pair_code_hash)
   FOR UPDATE LIMIT 1;
  IF d IS NULL THEN RETURN NULL; END IF;
  UPDATE public.desk_devices SET pair_code_used_at = now(), last_seen_at = now() WHERE id = d;
  RETURN d;
END;
$$;
REVOKE ALL ON FUNCTION public.desk_pair_issue(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.desk_pair_claim(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.desk_pair_issue(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.desk_pair_claim(uuid, text) TO service_role;

/* ─── leave requests (ADR 0506) ─────────────────────────────────── */
ALTER TABLE public.availability_blocks DROP CONSTRAINT IF EXISTS availability_blocks_state_check;
ALTER TABLE public.availability_blocks ADD CONSTRAINT availability_blocks_state_check
  CHECK (state IN ('active', 'cancelled', 'requested', 'declined'));
ALTER TABLE public.availability_blocks
  ADD COLUMN IF NOT EXISTS cover_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS booking_policy text CHECK (booking_policy IS NULL OR booking_policy IN ('offer', 'call')),
  ADD COLUMN IF NOT EXISTS decided_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS decided_at timestamptz;

/* ─── closures: part of the day and what happens to bookings ────── */
ALTER TABLE public.service_closures
  ADD COLUMN IF NOT EXISTS part_start_minutes smallint,
  ADD COLUMN IF NOT EXISTS part_end_minutes smallint,
  ADD COLUMN IF NOT EXISTS booking_policy text NOT NULL DEFAULT 'offer' CHECK (booking_policy IN ('offer', 'call'));

/* ─── fee bands (ADR 0503; four-eyes) ───────────────────────────── */
CREATE TABLE IF NOT EXISTS public.hospital_fee_bands (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id  uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  band         text NOT NULL CHECK (band IN ('nurse', 'co', 'mo', 'specialist', 'consultant')),
  general_ugx  integer NOT NULL CHECK (general_ugx >= 0),
  private_ugx  integer NOT NULL CHECK (private_ugx >= 0),
  version      integer NOT NULL DEFAULT 1,
  proposed_by  uuid NOT NULL REFERENCES auth.users(id),
  approved_by  uuid REFERENCES auth.users(id),
  approved_at  timestamptz,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (hospital_id, band),
  CONSTRAINT hospital_fee_bands_four_eyes CHECK (approved_by IS NULL OR approved_by <> proposed_by)
);

/* ─── holiday decisions (D-CS-12): no row = Not decided ─────────── */
CREATE TABLE IF NOT EXISTS public.hospital_holiday_decisions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  holiday_id  integer NOT NULL REFERENCES public.public_holidays(id) ON DELETE CASCADE,
  decision    text NOT NULL CHECK (decision IN ('closed', 'open')),
  decided_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  decided_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (hospital_id, holiday_id)
);

/* ─── the draft log, versions and scheduled publishes (ADR 0502) ── */
CREATE TABLE IF NOT EXISTS public.schedule_versions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id  uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  number       integer NOT NULL,
  published_by uuid NOT NULL REFERENCES auth.users(id),
  published_at timestamptz NOT NULL DEFAULT now(),
  change_ids   uuid[] NOT NULL,
  texts_sent   integer NOT NULL DEFAULT 0,
  UNIQUE (hospital_id, number)
);
CREATE TABLE IF NOT EXISTS public.schedule_publish_jobs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  run_at      timestamptz NOT NULL,
  author      uuid NOT NULL REFERENCES auth.users(id),
  change_ids  uuid[] NOT NULL,
  status      text NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'done', 'failed', 'cancelled')),
  failure     text CHECK (failure IS NULL OR length(failure) <= 280),
  ran_at      timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS schedule_publish_jobs_due ON public.schedule_publish_jobs (run_at) WHERE status = 'waiting';
CREATE TABLE IF NOT EXISTS public.schedule_changes (
  id          uuid PRIMARY KEY,
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  summary     text NOT NULL CHECK (length(summary) <= 200),
  -- [{entity, key, before, after}] in the workspace's shape; no patient data (CS11).
  edits       jsonb NOT NULL CHECK (jsonb_typeof(edits) = 'array'),
  author      uuid NOT NULL REFERENCES auth.users(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  status      text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'published', 'undone')),
  version_id  uuid REFERENCES public.schedule_versions(id),
  job_id      uuid REFERENCES public.schedule_publish_jobs(id),
  -- The later of two admins saving the same field wins; the earlier is told (P2).
  superseded_by uuid
);
CREATE INDEX IF NOT EXISTS schedule_changes_open ON public.schedule_changes (hospital_id, created_at)
  WHERE status IN ('draft', 'scheduled');

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['hospital_fee_bands', 'hospital_holiday_decisions', 'schedule_versions',
                           'schedule_publish_jobs', 'schedule_changes']
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS mfa_gate ON public.%I', t);
    EXECUTE format('CREATE POLICY mfa_gate ON public.%I AS RESTRICTIVE FOR ALL TO authenticated '
                   'USING ((SELECT public.caller_mfa_ok())) WITH CHECK ((SELECT public.caller_mfa_ok()))', t);
  END LOOP;
END $$;
-- Versions are history (D-CS-17): never edited or deleted.
REVOKE UPDATE, DELETE ON public.schedule_versions FROM PUBLIC, anon, authenticated, service_role;

/* ─── cs_publish: every edit in one transaction (P4) ────────────── */
-- p_ops: [{t, op: insert|update|delete, id, v: {column: value}}], built by the server from the draft edits.
-- Only the tables and columns below can be written; hospital_id is forced to p_hospital; any refusal raises and
-- the whole publish rolls back. Returns the new version number.
CREATE OR REPLACE FUNCTION public.cs_publish(
  p_hospital uuid, p_actor uuid, p_change_ids uuid[], p_ops jsonb, p_texts integer)
  RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  allow constant jsonb := '{
    "service_lines": ["name","slug","department_id","active","catalogue_code","audience","place_id","fee_ugx",
      "payment_posture","capacity_mode","archived_at","short_name","colour","room_place_ids","block_place_id","tier",
      "ages","patient_words","referral_required","fee_mode","fee_private_ugx","fee_overrides","booking_rules",
      "pay_options","team_user_ids","paused_at","paused_by"],
    "session_templates": ["service_line_id","department_id","clinician_user_id","place_id","venue","weekday",
      "start_minutes_local","duration_minutes","capacity_total","capacity_booked","valid_from","valid_until","active",
      "repeat_every_weeks","nth_weekday","kind","slot_minutes","visit_minutes","walk_in_hold_pct",
      "break_start_minutes","break_end_minutes","place_ids","clinician_user_ids","places_set"],
    "hospital_places": ["name","building","kind","parent_id","tier","archived_at"],
    "staff_affiliations": ["fee_band","office_place_id","card_name","card_photo","card_consent_on","card_consent_by"],
    "desk_devices": ["label","kind","place","mine_service_line_ids","lock_minutes","created_by"],
    "service_closures": ["scope","department_id","service_line_id","starts_on","ends_on","reason","created_by",
      "lifted_at","lifted_by","part_start_minutes","part_end_minutes","booking_policy"],
    "availability_blocks": ["clinician_user_id","department_id","kind","starts_at","ends_at","recurrence","state",
      "notes","label","created_by_user_id","cover_user_id","booking_policy","decided_by","decided_at"],
    "hospital_holiday_decisions": ["holiday_id","decision","decided_by"],
    "hospital_fee_bands": ["band","general_ugx","private_ugx","version","proposed_by","approved_by","approved_at"]
  }';
  o jsonb; t text; v jsonb; cols text; n integer; vid uuid; k text; hit integer;
BEGIN
  IF (SELECT count(*) FROM public.schedule_changes
       WHERE id = ANY (p_change_ids) AND hospital_id = p_hospital AND status IN ('draft', 'scheduled'))
     <> coalesce(array_length(p_change_ids, 1), 0) THEN
    RAISE EXCEPTION 'cs_stale_changes' USING ERRCODE = 'P0001';
  END IF;
  FOR o IN SELECT * FROM jsonb_array_elements(p_ops) LOOP
    t := o->>'t';
    IF NOT allow ? t THEN RAISE EXCEPTION 'cs_table %', t USING ERRCODE = '42501'; END IF;
    v := coalesce(o->'v', '{}'::jsonb);
    FOR k IN SELECT jsonb_object_keys(v) LOOP
      IF NOT (allow->t) ? k THEN RAISE EXCEPTION 'cs_column %.%', t, k USING ERRCODE = '42501'; END IF;
    END LOOP;
    SELECT string_agg(format('%I', key), ',') INTO cols FROM jsonb_object_keys(v) AS key;
    IF o->>'op' = 'insert' THEN
      v := v || jsonb_build_object('id', o->>'id', 'hospital_id', p_hospital);
      SELECT string_agg(format('%I', key), ',') INTO cols FROM jsonb_object_keys(v) AS key;
      EXECUTE format('INSERT INTO public.%I (%s) SELECT %s FROM jsonb_populate_record(NULL::public.%I, $1)',
                     t, cols, cols, t) USING v;
    ELSIF o->>'op' = 'update' AND cols IS NOT NULL THEN
      EXECUTE format('UPDATE public.%I SET (%s) = (SELECT %s FROM jsonb_populate_record(NULL::public.%I, $1)) '
                     'WHERE id = $2 AND hospital_id = $3', t, cols, cols, t)
        USING v, (o->>'id')::uuid, p_hospital;
      GET DIAGNOSTICS hit = ROW_COUNT;
      IF hit <> 1 THEN RAISE EXCEPTION 'cs_missing %', o->>'id' USING ERRCODE = 'P0002'; END IF;
    ELSIF o->>'op' = 'delete' AND t = 'hospital_holiday_decisions' THEN
      EXECUTE format('DELETE FROM public.%I WHERE id = $1 AND hospital_id = $2', t) USING (o->>'id')::uuid, p_hospital;
    ELSE
      RAISE EXCEPTION 'cs_op %', o->>'op' USING ERRCODE = '42501';
    END IF;
  END LOOP;
  SELECT coalesce(max(number), 0) + 1 INTO n FROM public.schedule_versions WHERE hospital_id = p_hospital;
  INSERT INTO public.schedule_versions (hospital_id, number, published_by, change_ids, texts_sent)
  VALUES (p_hospital, n, p_actor, p_change_ids, coalesce(p_texts, 0)) RETURNING id INTO vid;
  UPDATE public.schedule_changes SET status = 'published', version_id = vid WHERE id = ANY (p_change_ids);
  RETURN n;
END;
$$;
REVOKE ALL ON FUNCTION public.cs_publish(uuid, uuid, uuid[], jsonb, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cs_publish(uuid, uuid, uuid[], jsonb, integer) TO service_role;

/* ─── audit (CS10): 0294's verbs verbatim + this slice's ──────────── */
ALTER TABLE public.sa_audit_log DROP CONSTRAINT IF EXISTS sa_audit_log_action_check;
ALTER TABLE public.sa_audit_log ADD CONSTRAINT sa_audit_log_action_check CHECK (
  action IN (
    'approve_staff_affiliation', 'reject_staff_affiliation', 'approve_hospital_application',
    'reject_hospital_application', 'cross_tenant_read', 'cross_tenant_export', 'elevate_admin',
    'create_superadmin', 'demote_admin', 'break_glass_open', 'break_glass_close',
    'four_eyes_request', 'four_eyes_confirm', 'four_eyes_cancel', 'activate_hospital',
    'suspend_user', 'reset_user_mfa', 'deactivate_user', 'reactivate_user', 'export_audit_log',
    'sa_create_hospital', 'sa_invite_hospital_admin', 'hospital_admin_claimed',
    'request_staff_info', 'suspend_staff_affiliation', 'deactivate_staff_affiliation',
    'reactivate_staff_affiliation', 'reset_staff_mfa', 'assign_staff_role', 'invite_staff',
    'revoke_staff_invitation', 'book_appointment', 'confirm_appointment_request',
    'decline_appointment_request', 'cancel_appointment', 'reschedule_appointment',
    'mark_no_show', 'mark_arrived', 'start_encounter', 'complete_encounter',
    'propose_urgent_appointment', 'record_walkin', 'set_clinician_availability',
    'cancel_clinician_availability', 'update_clinician_settings', 'update_department_policy',
    'override_out_of_hours_booking', 'assign_supervision', 'end_supervision', 'cosign_request',
    'cosign_approve', 'cosign_return', 'cosign_cancel', 'cosign_expire', 'update_cosign_policy',
    'phi_access_break_glass', 'record_observation', 'correct_observation',
    'administer_medication', 'withhold_medication', 'submit_handover', 'assign_patient_to_nurse',
    'unassign_patient_from_nurse', 'assign_ward_in_charge', 'end_ward_in_charge',
    'escalate_to_medical_team', 'register_intake', 'update_intake', 'cancel_intake',
    'check_in_patient', 'patient_declare_intake', 'compute_triage', 'assign_triage',
    'override_triage', 'adjust_triage_baseline', 'open_resus_episode', 'conclude_resus_episode',
    'record_resus_event', 'correct_resus_event', 'assign_resus_role', 'end_resus_role',
    'mobilise_resus_team', 'detect_resus_arrest', 'set_emergency_phone', 'rate_visit',
    'update_service_line', 'update_session_template', 'cancel_session', 'book_on_behalf',
    'reconcile_identity', 'unreconcile_identity', 'add_booking_agent', 'join_waitlist',
    'accept_waitlist_offer', 'accept_rebooking', 'confirm_attendance', 'set_session_delay',
    'sms_stop', 'set_service_line_fee', 'submit_symptoms', 'emergency_interrupt_shown',
    'emergency_declined', 'emergency_call_tapped', 'request_same_day', 'create_pre_arrival',
    'update_pre_arrival', 'sign_catalog_version', 'verify_emergency_contact',
    'set_hospital_emergency_settings', 'set_resus_phase', 'stop_resuscitation', 'confirm_death',
    'set_resus_disposition', 'cancel_resus_episode', 'close_resus_administratively',
    'reactivate_resus', 'record_resus_arrest_record', 'submit_resus_debrief',
    'record_resus_after_death_task', 'update_resus_settings', 'retire_assignment',
    'verify_hospital_application',
    -- 0080: the Departments & services hub
    'update_department', 'set_department_live', 'set_start_department', 'assign_department_head',
    'end_department_head', 'archive_structure', 'unarchive_structure', 'update_ward', 'update_beds',
    'update_place', 'update_diagnostics', 'set_capability', 'verify_capability', 'reject_capability',
    'report_availability', 'add_closure', 'lift_closure', 'apply_service_preset',
    'import_legacy_services',
    -- 0090: the ward builder and the bed board
    'save_ward_layout', 'publish_ward_layout', 'set_bed_state', 'assign_bed', 'release_bed',
    -- 0091: admission with a bed
    'admit_patient', 'allocate_bed', 'confirm_arrival', 'cancel_allocation',
    -- 0291: a walk-in registered at the desk
    'register_patient',
    -- 0292: the desk's claim code, and the patient taking the record over
    'issue_claim_code', 'claim_desk_record',
    -- 0294: the reception desk
    'desk_identity_check', 'close_day', 'undo_close_day', 'desk_switch_user', 'desk_set_pin', 'desk_pin_locked',
    -- 0296: clinics and schedule
    'cs_draft', 'cs_undo', 'cs_publish', 'cs_schedule', 'cs_cancel_schedule', 'cs_restore', 'cs_pause',
    'cs_leave_decision', 'cs_pair_device', 'cs_unpair_device', 'cs_switch_user'
  )
);
