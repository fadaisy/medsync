-- ─────────────────────────────────────────────────────────────────────────
-- 0091_encounter_closure — ⚠️ GATED — owner-applied (npm run db:migrate).
--
-- Closing the encounter: admission with a bed, and the patient's copy (docs/emr/closure/, ADRs 0197–0203).
-- ADDITIVE and re-runnable: new tables, new columns, functions, triggers, policies. No row is changed.
--
--   1. admissions (ADR 0198): one row per inpatient stay; one open per patient; awaiting_bed → bed_allocated →
--      arrived, or cancelled. Moves only as the guard allows; never deleted.
--   2. bed_assignments gains admission_id, arrived_at, arrived_by (ADR 0199): an open assignment for an admission
--      with no arrived_at is Arriving. Rows without an admission are Occupied as before (no backfill).
--   3. Four functions, service role only (ADR 0200), each one transaction under row locks:
--        admit_from_encounter   the admission, the bed or the waiting list, and the close as 'admitted'
--        allocate_admission_bed a bed for an admission on the waiting list (ward staff)
--        confirm_bed_arrival    Arrived: the bed is Occupied, the inpatient encounter opens, nursing elsewhere ends
--        release_admission_bed  cancel an allocation (back to waiting, or end the admission), or end a wait
--      Refusals the user can act on start with "AD4xx " (the Edge Functions return the words after the code).
--   4. patient_visit_summaries (ADR 0203): append-only, versioned share/hold decisions; the patient reads only their
--      own current shared row.
--   5. self_medications.source_prescription_id: "Add to my medicines", once per prescription.
--   6. Live: admissions broadcast on ward-beds:<hospital>, as the bed tables do (PHI-free).
--   7. Audit verbs: 0090's list verbatim + the four admission verbs.
--
-- GATED: owner-applied, after 0090. Until it runs, ENCOUNTER_CLOSE_V2 and PATIENT_VISIT_SUMMARY stay off.
-- ─────────────────────────────────────────────────────────────────────────


-- ─── 1. admissions ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.admissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  patient_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_encounter_id uuid NOT NULL REFERENCES public.encounters(id),
  inpatient_encounter_id uuid REFERENCES public.encounters(id),
  ward_id uuid NOT NULL REFERENCES public.hospital_wards(id),
  leading_condition_id uuid REFERENCES public.conditions(id),
  status text NOT NULL DEFAULT 'awaiting_bed',
  decided_by uuid NOT NULL,
  decided_at timestamptz NOT NULL DEFAULT now(),
  bed_wait_reason text,
  bed_wait_note_ciphertext text,
  arrived_at timestamptz,
  arrived_by uuid,
  cancelled_at timestamptz,
  cancelled_by uuid,
  cancel_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT admissions_status_check CHECK (status IN ('awaiting_bed', 'bed_allocated', 'arrived', 'cancelled')),
  CONSTRAINT admissions_wait_reason_check CHECK (
    bed_wait_reason IS NULL OR bed_wait_reason IN ('no_free_bed', 'extra_bed', 'floor', 'other')),
  CONSTRAINT admissions_wait_note_check CHECK (
    bed_wait_reason IS DISTINCT FROM 'other' OR bed_wait_note_ciphertext IS NOT NULL),
  CONSTRAINT admissions_arrival_check CHECK (
    (arrived_at IS NULL) = (arrived_by IS NULL)
    AND (status <> 'arrived' OR (arrived_at IS NOT NULL AND inpatient_encounter_id IS NOT NULL))),
  CONSTRAINT admissions_cancel_check CHECK (
    (status = 'cancelled') = (cancelled_at IS NOT NULL)
    AND (cancelled_at IS NULL) = (cancelled_by IS NULL)
    AND (cancelled_at IS NULL OR char_length(cancel_reason) BETWEEN 3 AND 200))
);
CREATE UNIQUE INDEX IF NOT EXISTS admissions_one_open_per_patient
  ON public.admissions (patient_user_id) WHERE status IN ('awaiting_bed', 'bed_allocated', 'arrived');
CREATE UNIQUE INDEX IF NOT EXISTS admissions_source_encounter ON public.admissions (source_encounter_id);
CREATE INDEX IF NOT EXISTS admissions_ward_status_idx ON public.admissions (ward_id, status, decided_at);
CREATE INDEX IF NOT EXISTS admissions_hospital_idx ON public.admissions (hospital_id);

-- Only the status moves, as ADR 0198 §2 allows; arrival and cancellation are stamped once, with the move that
-- makes them; nothing else changes and nothing is deleted.
CREATE OR REPLACE FUNCTION public.admissions_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE
  moving text[] := ARRAY['status', 'inpatient_encounter_id', 'arrived_at', 'arrived_by', 'cancelled_at',
                         'cancelled_by', 'cancel_reason', 'updated_at'];
BEGIN
  IF TG_OP = 'DELETE' THEN
    -- Only a cascade from the hospital or patient row removes one (pg_trigger_depth() > 1).
    IF pg_trigger_depth() < 2 THEN
      RAISE EXCEPTION 'An admission is kept for good' USING ERRCODE = 'check_violation';
    END IF;
    RETURN OLD;
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.status NOT IN ('awaiting_bed', 'bed_allocated') OR NEW.arrived_at IS NOT NULL
       OR NEW.cancelled_at IS NOT NULL OR NEW.inpatient_encounter_id IS NOT NULL THEN
      RAISE EXCEPTION 'An admission starts waiting for a bed or with a bed allocated'
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;
  IF (to_jsonb(NEW) - moving) <> (to_jsonb(OLD) - moving) THEN
    RAISE EXCEPTION 'Only an admission''s status moves' USING ERRCODE = 'check_violation';
  END IF;
  IF NOT ((OLD.status, NEW.status) IN (('awaiting_bed', 'bed_allocated'), ('awaiting_bed', 'cancelled'),
          ('bed_allocated', 'awaiting_bed'), ('bed_allocated', 'arrived'), ('bed_allocated', 'cancelled'))) THEN
    RAISE EXCEPTION 'An admission cannot go from % to %', OLD.status, NEW.status
      USING ERRCODE = 'check_violation';
  END IF;
  IF (NEW.status <> 'arrived' AND (NEW.arrived_at IS NOT NULL OR NEW.inpatient_encounter_id IS NOT NULL))
     OR (NEW.status <> 'cancelled' AND NEW.cancelled_at IS NOT NULL) THEN
    RAISE EXCEPTION 'Arrival and cancellation are stamped with their own move'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS admissions_guard ON public.admissions;
CREATE TRIGGER admissions_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.admissions
  FOR EACH ROW EXECUTE FUNCTION public.admissions_guard();
DROP TRIGGER IF EXISTS admissions_updated_at ON public.admissions;
CREATE TRIGGER admissions_updated_at BEFORE UPDATE ON public.admissions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ─── 2. bed_assignments: the admission and the arrival ───────────────────
ALTER TABLE public.bed_assignments ADD COLUMN IF NOT EXISTS admission_id uuid REFERENCES public.admissions(id);
ALTER TABLE public.bed_assignments ADD COLUMN IF NOT EXISTS arrived_at timestamptz;
ALTER TABLE public.bed_assignments ADD COLUMN IF NOT EXISTS arrived_by uuid;
ALTER TABLE public.bed_assignments DROP CONSTRAINT IF EXISTS bed_assignments_arrival_check;
ALTER TABLE public.bed_assignments ADD CONSTRAINT bed_assignments_arrival_check CHECK (
  (arrived_at IS NULL) = (arrived_by IS NULL) AND (arrived_at IS NULL OR admission_id IS NOT NULL));
CREATE INDEX IF NOT EXISTS bed_assignments_admission_idx
  ON public.bed_assignments (admission_id) WHERE admission_id IS NOT NULL;

-- 0090's guard, plus: an open assignment for an admission is marked arrived once, and starts not arrived.
CREATE OR REPLACE FUNCTION public.bed_assignments_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE
  moving text[] := ARRAY['ended_at', 'ended_by', 'reason', 'arrived_at', 'arrived_by'];
BEGIN
  IF TG_OP = 'DELETE' THEN
    -- Only a cascade from the bed, ward or hospital row removes one (pg_trigger_depth() > 1).
    IF pg_trigger_depth() < 2 THEN
      RAISE EXCEPTION 'A bed assignment is kept for good' USING ERRCODE = 'check_violation';
    END IF;
    RETURN OLD;
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.ended_at IS NOT NULL OR NEW.arrived_at IS NOT NULL THEN
      RAISE EXCEPTION 'A bed assignment starts open' USING ERRCODE = 'check_violation';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.hospital_beds b
                    WHERE b.id = NEW.bed_id AND b.ward_id = NEW.ward_id AND b.hospital_id = NEW.hospital_id
                      AND b.archived_at IS NULL AND b.closed_at IS NULL) THEN
      RAISE EXCEPTION 'Bed % is not an open bed of ward %', NEW.bed_id, NEW.ward_id
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;
  IF OLD.ended_at IS NOT NULL
     OR (to_jsonb(NEW) - moving) <> (to_jsonb(OLD) - moving)
     OR (OLD.arrived_at IS NOT NULL AND NEW.arrived_at IS DISTINCT FROM OLD.arrived_at) THEN
    RAISE EXCEPTION 'A bed assignment only ends, once' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

-- The board hears an arrival too.
DROP TRIGGER IF EXISTS ward_beds_broadcast ON public.bed_assignments;
CREATE TRIGGER ward_beds_broadcast AFTER INSERT OR UPDATE OF ended_at, arrived_at ON public.bed_assignments
  FOR EACH ROW EXECUTE FUNCTION public.ward_beds_broadcast();
DROP TRIGGER IF EXISTS ward_beds_broadcast ON public.admissions;
CREATE TRIGGER ward_beds_broadcast AFTER INSERT OR UPDATE OF status ON public.admissions
  FOR EACH ROW EXECUTE FUNCTION public.ward_beds_broadcast();


-- ─── 3. The admission functions (service role only) ──────────────────────

-- A bed of this ward that is open and free: no open assignment, not cleaning or reserved since its last
-- patient (ADR 0194 §1). Locks the bed row so two callers queue on it. Returns the bed's label.
CREATE OR REPLACE FUNCTION public.admission_free_bed(p_hospital uuid, p_ward uuid, p_bed uuid)
RETURNS text
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_label text;
  v_state text;
BEGIN
  SELECT label INTO v_label FROM public.hospital_beds
   WHERE id = p_bed AND ward_id = p_ward AND hospital_id = p_hospital
     AND archived_at IS NULL AND closed_at IS NULL
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'AD409 That bed is not an open bed of this ward.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.bed_assignments WHERE bed_id = p_bed AND ended_at IS NULL) THEN
    RAISE EXCEPTION 'AD409 Bed % was just taken. Choose another.', v_label;
  END IF;
  SELECT e.state INTO v_state FROM public.bed_state_events e
   WHERE e.bed_id = p_bed
     AND e.set_at >= coalesce((SELECT max(a.ended_at) FROM public.bed_assignments a WHERE a.bed_id = p_bed),
                              '-infinity'::timestamptz)
   ORDER BY e.set_at DESC LIMIT 1;
  IF v_state IN ('cleaning', 'reserved') THEN
    RAISE EXCEPTION 'AD409 Bed % is % just now. Choose another.', v_label,
      CASE v_state WHEN 'cleaning' THEN 'being cleaned' ELSE 'reserved' END;
  END IF;
  RETURN v_label;
END;
$$;

-- ADR 0200 §1. Payload: encounter_id, actor, ward_id, bed_id?, bed_wait_reason?, bed_wait_note_ciphertext?,
-- leading_condition_id?, disposition_detail? (object), completion_reason?.
CREATE OR REPLACE FUNCTION public.admit_from_encounter(p jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := (p->>'actor')::uuid;
  v_bed uuid := nullif(p->>'bed_id', '')::uuid;
  v_enc public.encounters%ROWTYPE;
  v_ward public.hospital_wards%ROWTYPE;
  v_label text;
  v_adm uuid;
  v_asg uuid;
  v_detail jsonb;
BEGIN
  SELECT * INTO v_enc FROM public.encounters WHERE id = (p->>'encounter_id')::uuid FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'AD404 Visit not found.';
  END IF;
  IF v_enc.state <> 'in_progress' THEN
    RAISE EXCEPTION 'AD409 This visit is not in progress, so it cannot be closed as an admission.';
  END IF;
  SELECT * INTO v_ward FROM public.hospital_wards
   WHERE id = (p->>'ward_id')::uuid AND hospital_id = v_enc.hospital_id;
  IF NOT FOUND OR v_ward.archived_at IS NOT NULL OR v_ward.state <> 'active' OR v_ward.closed_at IS NOT NULL THEN
    RAISE EXCEPTION 'AD409 That ward is not taking admissions at this hospital.';
  END IF;
  IF v_bed IS NULL AND (p->>'bed_wait_reason') IS NULL THEN
    RAISE EXCEPTION 'AD400 Choose a bed, or say why the patient waits for one.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.admissions
              WHERE patient_user_id = v_enc.patient_user_id
                AND status IN ('awaiting_bed', 'bed_allocated', 'arrived')) THEN
    RAISE EXCEPTION 'AD409 This patient already has an open admission.';
  END IF;
  IF v_bed IS NOT NULL THEN
    v_label := public.admission_free_bed(v_enc.hospital_id, v_ward.id, v_bed);
    IF EXISTS (SELECT 1 FROM public.bed_assignments
                WHERE patient_user_id = v_enc.patient_user_id AND ended_at IS NULL) THEN
      RAISE EXCEPTION 'AD409 This patient is already in a bed. The ward releases it first.';
    END IF;
  END IF;

  INSERT INTO public.admissions (hospital_id, patient_user_id, source_encounter_id, ward_id, leading_condition_id,
                                 status, decided_by, bed_wait_reason, bed_wait_note_ciphertext)
  VALUES (v_enc.hospital_id, v_enc.patient_user_id, v_enc.id, v_ward.id,
          nullif(p->>'leading_condition_id', '')::uuid,
          CASE WHEN v_bed IS NULL THEN 'awaiting_bed' ELSE 'bed_allocated' END, v_actor,
          CASE WHEN v_bed IS NULL THEN p->>'bed_wait_reason' END,
          CASE WHEN v_bed IS NULL THEN p->>'bed_wait_note_ciphertext' END)
  RETURNING id INTO v_adm;

  IF v_bed IS NOT NULL THEN
    INSERT INTO public.bed_assignments (hospital_id, ward_id, bed_id, patient_user_id, encounter_id, admission_id,
                                        started_by)
    VALUES (v_enc.hospital_id, v_ward.id, v_bed, v_enc.patient_user_id, v_enc.id, v_adm, v_actor)
    RETURNING id INTO v_asg;
  END IF;

  v_detail := coalesce(nullif(p->'disposition_detail', 'null'::jsonb), '{}'::jsonb)
    || jsonb_build_object('admission_id', v_adm::text, 'ward_id', v_ward.id::text, 'ward', v_ward.name)
    || CASE WHEN v_bed IS NULL THEN jsonb_build_object('bed', 'waiting')
            ELSE jsonb_build_object('bed_id', v_bed::text, 'bed', v_label) END;
  UPDATE public.encounters
     SET state = 'completed', ended_at = now(), completed_by = v_actor, closure_kind = 'clinical',
         completion_reason = coalesce(p->>'completion_reason', 'ended_by_clinician'),
         disposition = 'admitted', disposition_detail = v_detail
   WHERE id = v_enc.id;
  INSERT INTO public.encounter_events (encounter_id, kind, label, actor_user_id, recorded_at)
  VALUES (v_enc.id, 'disposition',
          'Visit completed: admitted to ' || v_ward.name
            || CASE WHEN v_bed IS NULL THEN ', waiting for a bed' ELSE ', bed ' || v_label END,
          v_actor, now());

  RETURN jsonb_build_object('admission_id', v_adm, 'assignment_id', v_asg, 'ward', v_ward.name, 'bed', v_label,
                            'patient_user_id', v_enc.patient_user_id, 'hospital_id', v_enc.hospital_id);
END;
$$;

-- A bed for an admission on the waiting list (ward staff; ADR 0199 §3). Payload: hospital_id, admission_id,
-- bed_id, actor.
CREATE OR REPLACE FUNCTION public.allocate_admission_bed(p jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_adm public.admissions%ROWTYPE;
  v_label text;
  v_asg uuid;
BEGIN
  SELECT * INTO v_adm FROM public.admissions
   WHERE id = (p->>'admission_id')::uuid AND hospital_id = (p->>'hospital_id')::uuid FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'AD404 That admission is not at this hospital.';
  END IF;
  IF v_adm.status <> 'awaiting_bed' THEN
    RAISE EXCEPTION 'AD409 This patient is no longer waiting for a bed.';
  END IF;
  v_label := public.admission_free_bed(v_adm.hospital_id, v_adm.ward_id, (p->>'bed_id')::uuid);
  IF EXISTS (SELECT 1 FROM public.bed_assignments WHERE patient_user_id = v_adm.patient_user_id AND ended_at IS NULL) THEN
    RAISE EXCEPTION 'AD409 This patient is already in a bed.';
  END IF;
  INSERT INTO public.bed_assignments (hospital_id, ward_id, bed_id, patient_user_id, encounter_id, admission_id,
                                      started_by)
  VALUES (v_adm.hospital_id, v_adm.ward_id, (p->>'bed_id')::uuid, v_adm.patient_user_id, v_adm.source_encounter_id,
          v_adm.id, (p->>'actor')::uuid)
  RETURNING id INTO v_asg;
  UPDATE public.admissions SET status = 'bed_allocated' WHERE id = v_adm.id;
  RETURN jsonb_build_object('assignment_id', v_asg, 'bed', v_label);
END;
$$;

-- Arrived (ward staff; ADR 0199 §4, ADR 0200 §3, §5). Payload: hospital_id, assignment_id, actor.
CREATE OR REPLACE FUNCTION public.confirm_bed_arrival(p jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := (p->>'actor')::uuid;
  v_asg public.bed_assignments%ROWTYPE;
  v_adm public.admissions%ROWTYPE;
  v_dept uuid;
  v_enc uuid;
  v_ended integer;
BEGIN
  SELECT * INTO v_asg FROM public.bed_assignments
   WHERE id = (p->>'assignment_id')::uuid AND hospital_id = (p->>'hospital_id')::uuid FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'AD404 That bed assignment is not at this hospital.';
  END IF;
  IF v_asg.ended_at IS NOT NULL OR v_asg.admission_id IS NULL OR v_asg.arrived_at IS NOT NULL THEN
    RAISE EXCEPTION 'AD409 Nobody is arriving in this bed.';
  END IF;
  SELECT * INTO v_adm FROM public.admissions WHERE id = v_asg.admission_id FOR UPDATE;
  IF v_adm.status <> 'bed_allocated' THEN
    RAISE EXCEPTION 'AD409 This admission is not waiting for arrival.';
  END IF;
  SELECT department_id INTO v_dept FROM public.hospital_wards WHERE id = v_adm.ward_id;

  -- The stay's encounter: one per admission (the guard stamps inpatient_encounter_id once).
  INSERT INTO public.encounters (hospital_id, patient_user_id, clinician_user_id, department_id, state,
                                 encounter_type, started_at, last_activity_at)
  VALUES (v_adm.hospital_id, v_adm.patient_user_id, v_adm.decided_by, v_dept, 'in_progress', 'inpatient', now(),
          now())
  RETURNING id INTO v_enc;
  UPDATE public.bed_assignments SET arrived_at = now(), arrived_by = v_actor WHERE id = v_asg.id;
  UPDATE public.admissions
     SET status = 'arrived', arrived_at = now(), arrived_by = v_actor, inpatient_encounter_id = v_enc
   WHERE id = v_adm.id;
  -- Nursing elsewhere (EU, another ward) ends now that the ward has the patient.
  UPDATE public.nursing_assignments SET ends_at = now()
   WHERE patient_user_id = v_adm.patient_user_id AND hospital_id = v_adm.hospital_id
     AND (ends_at IS NULL OR ends_at > now()) AND ward_id IS DISTINCT FROM v_adm.ward_id;
  GET DIAGNOSTICS v_ended = ROW_COUNT;
  RETURN jsonb_build_object('inpatient_encounter_id', v_enc, 'admission_id', v_adm.id,
                            'nursing_ended', v_ended);
END;
$$;

-- Cancel an allocation (back to waiting, or end the admission), or end a wait (ward staff; ADR 0199 §5).
-- Payload: hospital_id, admission_id, actor, reason (3–200), outcome 'wait' | 'end'.
CREATE OR REPLACE FUNCTION public.release_admission_bed(p jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := (p->>'actor')::uuid;
  v_reason text := btrim(coalesce(p->>'reason', ''));
  v_outcome text := p->>'outcome';
  v_adm public.admissions%ROWTYPE;
  v_asg uuid;
BEGIN
  IF char_length(v_reason) NOT BETWEEN 3 AND 200 THEN
    RAISE EXCEPTION 'AD400 Say why, in a few words.';
  END IF;
  IF v_outcome NOT IN ('wait', 'end') THEN
    RAISE EXCEPTION 'AD400 Say whether the patient still needs a bed.';
  END IF;
  SELECT * INTO v_adm FROM public.admissions
   WHERE id = (p->>'admission_id')::uuid AND hospital_id = (p->>'hospital_id')::uuid FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'AD404 That admission is not at this hospital.';
  END IF;
  IF v_adm.status = 'awaiting_bed' AND v_outcome = 'wait' THEN
    RAISE EXCEPTION 'AD409 This patient is already waiting for a bed.';
  END IF;
  IF v_adm.status NOT IN ('awaiting_bed', 'bed_allocated') THEN
    RAISE EXCEPTION 'AD409 This admission can no longer be changed here.';
  END IF;
  IF v_adm.status = 'bed_allocated' THEN
    UPDATE public.bed_assignments SET ended_at = now(), ended_by = v_actor, reason = v_reason
     WHERE admission_id = v_adm.id AND ended_at IS NULL AND arrived_at IS NULL
    RETURNING id INTO v_asg;
  END IF;
  UPDATE public.admissions
     SET status = CASE v_outcome WHEN 'wait' THEN 'awaiting_bed' ELSE 'cancelled' END,
         cancelled_at = CASE v_outcome WHEN 'end' THEN now() END,
         cancelled_by = CASE v_outcome WHEN 'end' THEN v_actor END,
         cancel_reason = CASE v_outcome WHEN 'end' THEN v_reason END
   WHERE id = v_adm.id;
  RETURN jsonb_build_object('admission_id', v_adm.id, 'assignment_id', v_asg, 'outcome', v_outcome);
END;
$$;

DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY['admission_free_bed(uuid, uuid, uuid)', 'admit_from_encounter(jsonb)',
                           'allocate_admission_bed(jsonb)', 'confirm_bed_arrival(jsonb)',
                           'release_admission_bed(jsonb)']
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC', f);
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM anon, authenticated', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO service_role', f);
  END LOOP;
END $$;


-- ─── 4. patient_visit_summaries ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.patient_visit_summaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  patient_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  encounter_id uuid NOT NULL REFERENCES public.encounters(id),
  version integer NOT NULL,
  state text NOT NULL,
  -- The composed copy (lib/patient/visit-summary.ts), encrypted; shared rows only.
  copy_ciphertext text,
  -- The items the clinician removed, by id (never their content).
  removed_item_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  hold_reason text,
  hold_note_ciphertext text,
  decided_by uuid NOT NULL,
  decided_at timestamptz NOT NULL DEFAULT now(),
  superseded_at timestamptz,
  superseded_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT patient_visit_summaries_state_check CHECK (state IN ('shared', 'held')),
  CONSTRAINT patient_visit_summaries_shape_check CHECK (
    (state = 'shared') = (copy_ciphertext IS NOT NULL)
    AND (state = 'held') = (hold_reason IS NOT NULL)
    AND (hold_reason IS DISTINCT FROM 'other' OR hold_note_ciphertext IS NOT NULL)
    AND jsonb_typeof(removed_item_ids) = 'array'
    AND (superseded_at IS NULL) = (superseded_by IS NULL)
    AND version >= 1),
  CONSTRAINT patient_visit_summaries_hold_reason_check CHECK (
    hold_reason IS NULL OR hold_reason IN ('tell_in_person', 'awaiting_result', 'patient_declined', 'other'))
);
CREATE UNIQUE INDEX IF NOT EXISTS patient_visit_summaries_encounter_version
  ON public.patient_visit_summaries (encounter_id, version);
CREATE UNIQUE INDEX IF NOT EXISTS patient_visit_summaries_one_current
  ON public.patient_visit_summaries (encounter_id) WHERE superseded_at IS NULL;
CREATE INDEX IF NOT EXISTS patient_visit_summaries_patient_idx
  ON public.patient_visit_summaries (patient_user_id, decided_at DESC) WHERE superseded_at IS NULL;

-- A decision is kept as made: only its supersession is stamped, once; never deleted.
CREATE OR REPLACE FUNCTION public.patient_visit_summaries_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF pg_trigger_depth() < 2 THEN
      RAISE EXCEPTION 'A visit summary decision is kept for good' USING ERRCODE = 'check_violation';
    END IF;
    RETURN OLD;
  END IF;
  IF OLD.superseded_at IS NOT NULL
     OR (to_jsonb(NEW) - 'superseded_at' - 'superseded_by') <> (to_jsonb(OLD) - 'superseded_at' - 'superseded_by') THEN
    RAISE EXCEPTION 'A visit summary decision is only superseded, once' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS patient_visit_summaries_guard ON public.patient_visit_summaries;
CREATE TRIGGER patient_visit_summaries_guard
  BEFORE UPDATE OR DELETE ON public.patient_visit_summaries
  FOR EACH ROW EXECUTE FUNCTION public.patient_visit_summaries_guard();


-- ─── 5. self_medications: "Add to my medicines" ──────────────────────────
ALTER TABLE public.self_medications ADD COLUMN IF NOT EXISTS source_prescription_id uuid
  REFERENCES public.prescriptions(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX IF NOT EXISTS self_medications_one_per_prescription
  ON public.self_medications (patient_user_id, source_prescription_id) WHERE source_prescription_id IS NOT NULL;


-- ─── 6. RLS, grants and row audit ────────────────────────────────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['admissions', 'patient_visit_summaries']
  LOOP
    EXECUTE format('ALTER TABLE public.%s ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE public.%s FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %1$s_select_scoped ON public.%1$s', t);
    EXECUTE format('REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.%s FROM anon, authenticated', t);
    EXECUTE format('GRANT SELECT ON public.%s TO authenticated', t);
    EXECUTE format('DROP TRIGGER IF EXISTS audit_%1$s ON public.%1$s', t);
    EXECUTE format('CREATE TRIGGER audit_%1$s AFTER INSERT OR UPDATE OR DELETE ON public.%1$s
      FOR EACH ROW EXECUTE FUNCTION public.audit_log_changes()', t);
  END LOOP;
END $$;

-- An admission names a patient: admins, superadmins and active clinical staff of the hospital (as 0090).
CREATE POLICY admissions_select_scoped ON public.admissions FOR SELECT TO authenticated USING (
  public.user_has_role('superadmin') OR public.user_has_role('hospital_admin', hospital_id)
  OR public.is_active_clinical_staff(hospital_id));

-- The patient sees only their own current shared summary; staff as for the record.
CREATE POLICY patient_visit_summaries_select_scoped ON public.patient_visit_summaries FOR SELECT TO authenticated
USING (
  (patient_user_id = auth.uid() AND state = 'shared' AND superseded_at IS NULL)
  OR public.user_has_role('superadmin') OR public.user_has_role('hospital_admin', hospital_id)
  OR public.is_active_clinical_staff(hospital_id));


-- ─── 7. Audit verbs (0090's list verbatim + the admission's) ─────────────
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
    'admit_patient', 'allocate_bed', 'confirm_arrival', 'cancel_allocation'
  )
);
