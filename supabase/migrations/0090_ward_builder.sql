-- ─────────────────────────────────────────────────────────────────────────
-- 0090_ward_builder — ⚠️ GATED — owner-applied (npm run db:migrate).
--
-- The ward builder and the live bed board (docs/wards/ward-builder/, ADRs 0191–0196).
-- ADDITIVE and re-runnable: new tables, new columns, triggers, policies. No row is changed.
--
--   1. ward_layouts: one JSON document per version; one draft and one published per ward. Published
--      and superseded rows are append-only (only published → superseded may change; a draft may be
--      discarded). Drafts are working copies: only published and superseded rows are row-audited.
--   2. hospital_beds: layout position, rotation and room; bed_type checked to standard | icu | cot |
--      couch NOT VALID (a value already there stays valid). An occupied bed can't be archived or closed.
--   3. hospital_bed_services: the services at each bed (ADR 0193), one row per (bed, code).
--   4. bed_assignments (patient ↔ bed; one open per bed, one per patient; closed once, never deleted)
--      and bed_state_events (cleaning | reserved | free; append-only) — ADR 0194.
--   5. public.ward_layout_publish(jsonb): the reconcile (ADR 0192), applied in one transaction under
--      row locks; service role only. The Edge Function plans it with the pure reconcile().
--   6. RLS: layouts, services and state events read like the hub tables (admins, superadmins, hospital
--      staff); assignments name a patient, so only admins, superadmins and active clinical staff read
--      them. No client writes anywhere (ha-services-hub writes on the service role).
--   7. Live: a PHI-free broadcast { kind, ward_id, at } on the private topic ward-beds:<hospital> when
--      an assignment, a state event, a bed's closure or a published layout changes; hospital admins
--      and active clinical staff of that hospital may listen.
--   8. Audit verbs: 0080's list verbatim + the ward builder's five.
--
-- GATED: owner-applied, after 0089. Until it runs, WARD_BUILDER stays off.
-- ─────────────────────────────────────────────────────────────────────────


-- ─── 1. ward_layouts ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ward_layouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  ward_id uuid NOT NULL REFERENCES public.hospital_wards(id) ON DELETE CASCADE,
  version integer NOT NULL,
  revision integer NOT NULL DEFAULT 1,
  state text NOT NULL DEFAULT 'draft',
  floor_w_cells integer NOT NULL,
  floor_h_cells integer NOT NULL,
  cell_mm integer NOT NULL DEFAULT 500,
  document jsonb NOT NULL,
  warnings jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  published_by uuid,
  published_at timestamptz,
  CONSTRAINT ward_layouts_state_check CHECK (state IN ('draft', 'published', 'superseded')),
  CONSTRAINT ward_layouts_version_check CHECK (version >= 1 AND revision >= 1),
  CONSTRAINT ward_layouts_floor_check CHECK (
    floor_w_cells BETWEEN 8 AND 120 AND floor_h_cells BETWEEN 8 AND 120 AND cell_mm > 0),
  CONSTRAINT ward_layouts_document_check CHECK (
    jsonb_typeof(document) = 'object' AND document->>'v' = '1'
    AND jsonb_typeof(warnings) = 'array'),
  CONSTRAINT ward_layouts_published_check CHECK ((state = 'draft') = (published_at IS NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS ward_layouts_one_draft
  ON public.ward_layouts (ward_id) WHERE state = 'draft';
CREATE UNIQUE INDEX IF NOT EXISTS ward_layouts_one_published
  ON public.ward_layouts (ward_id) WHERE state = 'published';
CREATE UNIQUE INDEX IF NOT EXISTS ward_layouts_ward_version ON public.ward_layouts (ward_id, version);
CREATE INDEX IF NOT EXISTS ward_layouts_hospital_idx ON public.ward_layouts (hospital_id);

-- The ward is this hospital's; a new row is a draft; a published row may only become superseded; a
-- superseded row never changes; only a draft may be deleted (discarded).
CREATE OR REPLACE FUNCTION public.ward_layouts_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    -- pg_trigger_depth() > 1: a cascade from the ward or hospital row, which may go.
    IF OLD.state <> 'draft' AND pg_trigger_depth() < 2 THEN
      RAISE EXCEPTION 'A % ward layout is kept for good', OLD.state USING ERRCODE = 'check_violation';
    END IF;
    RETURN OLD;
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.state <> 'draft' THEN
      RAISE EXCEPTION 'A ward layout starts as a draft' USING ERRCODE = 'check_violation';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.hospital_wards w
                    WHERE w.id = NEW.ward_id AND w.hospital_id = NEW.hospital_id) THEN
      RAISE EXCEPTION 'Ward % is not at hospital %', NEW.ward_id, NEW.hospital_id
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.hospital_id <> OLD.hospital_id OR NEW.ward_id <> OLD.ward_id OR NEW.version <> OLD.version
     OR NEW.created_at <> OLD.created_at OR NEW.created_by IS DISTINCT FROM OLD.created_by THEN
    RAISE EXCEPTION 'A ward layout keeps its ward, version and author' USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.state = 'published' THEN
    IF NEW.state <> 'superseded'
       OR (to_jsonb(NEW) - 'state' - 'updated_at') <> (to_jsonb(OLD) - 'state' - 'updated_at') THEN
      RAISE EXCEPTION 'A published ward layout only becomes superseded' USING ERRCODE = 'check_violation';
    END IF;
  ELSIF OLD.state = 'superseded' THEN
    RAISE EXCEPTION 'A superseded ward layout never changes' USING ERRCODE = 'check_violation';
  ELSIF NEW.state = 'superseded' THEN
    RAISE EXCEPTION 'A draft is published before it is superseded' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS ward_layouts_guard ON public.ward_layouts;
CREATE TRIGGER ward_layouts_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.ward_layouts
  FOR EACH ROW EXECUTE FUNCTION public.ward_layouts_guard();
DROP TRIGGER IF EXISTS set_updated_at_ward_layouts ON public.ward_layouts;
CREATE TRIGGER set_updated_at_ward_layouts BEFORE UPDATE ON public.ward_layouts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Row images for the record, not the working copy: autosaved drafts stay out of audit_log.
DROP TRIGGER IF EXISTS audit_ward_layouts_insert ON public.ward_layouts;
CREATE TRIGGER audit_ward_layouts_insert AFTER INSERT ON public.ward_layouts
  FOR EACH ROW WHEN (NEW.state <> 'draft') EXECUTE FUNCTION public.audit_log_changes();
DROP TRIGGER IF EXISTS audit_ward_layouts_update ON public.ward_layouts;
CREATE TRIGGER audit_ward_layouts_update AFTER UPDATE ON public.ward_layouts
  FOR EACH ROW WHEN (OLD.state <> 'draft' OR NEW.state <> 'draft')
  EXECUTE FUNCTION public.audit_log_changes();
DROP TRIGGER IF EXISTS audit_ward_layouts_delete ON public.ward_layouts;
CREATE TRIGGER audit_ward_layouts_delete AFTER DELETE ON public.ward_layouts
  FOR EACH ROW WHEN (OLD.state <> 'draft') EXECUTE FUNCTION public.audit_log_changes();


-- ─── 2. hospital_beds: where each bed stands ─────────────────────────────
ALTER TABLE public.hospital_beds ADD COLUMN IF NOT EXISTS layout_x integer;
ALTER TABLE public.hospital_beds ADD COLUMN IF NOT EXISTS layout_y integer;
ALTER TABLE public.hospital_beds ADD COLUMN IF NOT EXISTS rotation integer;
ALTER TABLE public.hospital_beds ADD COLUMN IF NOT EXISTS room_key text;

ALTER TABLE public.hospital_beds DROP CONSTRAINT IF EXISTS hospital_beds_rotation_check;
ALTER TABLE public.hospital_beds ADD CONSTRAINT hospital_beds_rotation_check
  CHECK (rotation IS NULL OR rotation IN (0, 90, 180, 270));
ALTER TABLE public.hospital_beds DROP CONSTRAINT IF EXISTS hospital_beds_layout_check;
ALTER TABLE public.hospital_beds ADD CONSTRAINT hospital_beds_layout_check
  CHECK ((layout_x IS NULL) = (layout_y IS NULL) AND (layout_x IS NULL OR (layout_x >= 0 AND layout_y >= 0))
    AND (room_key IS NULL OR char_length(room_key) <= 32));
-- NOT VALID: new and changed rows are checked; a value written before 0090 stays valid.
ALTER TABLE public.hospital_beds DROP CONSTRAINT IF EXISTS hospital_beds_bed_type_check;
ALTER TABLE public.hospital_beds ADD CONSTRAINT hospital_beds_bed_type_check
  CHECK (bed_type IS NULL OR bed_type IN ('standard', 'icu', 'cot', 'couch')) NOT VALID;


-- ─── 3. hospital_bed_services ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.hospital_bed_services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bed_id uuid NOT NULL REFERENCES public.hospital_beds(id) ON DELETE CASCADE,
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  service_code text NOT NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hospital_bed_services_code_check CHECK (service_code IN (
    'o2', 'suction', 'air', 'monitor', 'call', 'power', 'pump', 'iv_pole', 'locker',
    'overbed_table', 'pressure_mattress', 'curtain_track'))
);
CREATE UNIQUE INDEX IF NOT EXISTS hospital_bed_services_bed_code
  ON public.hospital_bed_services (bed_id, service_code);
CREATE INDEX IF NOT EXISTS hospital_bed_services_hospital_code
  ON public.hospital_bed_services (hospital_id, service_code);


-- ─── 4. bed_assignments and bed_state_events ─────────────────────────────
CREATE TABLE IF NOT EXISTS public.bed_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  ward_id uuid NOT NULL REFERENCES public.hospital_wards(id) ON DELETE CASCADE,
  bed_id uuid NOT NULL REFERENCES public.hospital_beds(id) ON DELETE CASCADE,
  patient_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  encounter_id uuid REFERENCES public.encounters(id),
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  started_by uuid NOT NULL,
  ended_by uuid,
  reason text,
  CONSTRAINT bed_assignments_time_check CHECK (ended_at IS NULL OR ended_at >= started_at),
  CONSTRAINT bed_assignments_end_check CHECK (
    (ended_at IS NULL) = (ended_by IS NULL) AND (ended_at IS NULL OR reason IS NOT NULL)),
  CONSTRAINT bed_assignments_reason_check CHECK (reason IS NULL OR char_length(reason) BETWEEN 3 AND 200)
);
CREATE UNIQUE INDEX IF NOT EXISTS bed_assignments_one_open_per_bed
  ON public.bed_assignments (bed_id) WHERE ended_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS bed_assignments_one_open_per_patient
  ON public.bed_assignments (patient_user_id) WHERE ended_at IS NULL;
CREATE INDEX IF NOT EXISTS bed_assignments_ward_idx ON public.bed_assignments (ward_id, ended_at);
CREATE INDEX IF NOT EXISTS bed_assignments_hospital_idx ON public.bed_assignments (hospital_id);

-- A patient goes into an active, open bed of this ward and hospital; an assignment ends once (its end,
-- by whom and why) and is never deleted.
CREATE OR REPLACE FUNCTION public.bed_assignments_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    -- Only a cascade from the bed, ward or hospital row removes one (pg_trigger_depth() > 1).
    IF pg_trigger_depth() < 2 THEN
      RAISE EXCEPTION 'A bed assignment is kept for good' USING ERRCODE = 'check_violation';
    END IF;
    RETURN OLD;
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.ended_at IS NOT NULL THEN
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
     OR (to_jsonb(NEW) - 'ended_at' - 'ended_by' - 'reason') <> (to_jsonb(OLD) - 'ended_at' - 'ended_by' - 'reason') THEN
    RAISE EXCEPTION 'A bed assignment only ends, once' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS bed_assignments_guard ON public.bed_assignments;
CREATE TRIGGER bed_assignments_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.bed_assignments
  FOR EACH ROW EXECUTE FUNCTION public.bed_assignments_guard();

CREATE TABLE IF NOT EXISTS public.bed_state_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  bed_id uuid NOT NULL REFERENCES public.hospital_beds(id) ON DELETE CASCADE,
  state text NOT NULL,
  reason text,
  set_by uuid NOT NULL,
  set_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT bed_state_events_state_check CHECK (state IN ('cleaning', 'reserved', 'free')),
  CONSTRAINT bed_state_events_reason_check CHECK (
    (reason IS NULL OR char_length(reason) BETWEEN 1 AND 200) AND (state <> 'reserved' OR reason IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS bed_state_events_bed_idx ON public.bed_state_events (bed_id, set_at DESC);
CREATE INDEX IF NOT EXISTS bed_state_events_hospital_idx ON public.bed_state_events (hospital_id);

CREATE OR REPLACE FUNCTION public.bed_state_events_block_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  -- A cascade from the bed or hospital row may remove events (pg_trigger_depth() > 1); nothing else.
  IF TG_OP = 'DELETE' AND pg_trigger_depth() > 1 THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'bed_state_events is append-only' USING ERRCODE = 'check_violation';
END;
$$;
DROP TRIGGER IF EXISTS bed_state_events_append_only ON public.bed_state_events;
CREATE TRIGGER bed_state_events_append_only
  BEFORE UPDATE OR DELETE ON public.bed_state_events
  FOR EACH ROW EXECUTE FUNCTION public.bed_state_events_block_mutation();

-- A bed with a patient in it can't be archived or taken out of service, whoever tries (ADR 0194 §2).
CREATE OR REPLACE FUNCTION public.hospital_beds_occupied_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF ((NEW.archived_at IS NOT NULL AND OLD.archived_at IS NULL)
      OR (NEW.closed_at IS NOT NULL AND OLD.closed_at IS NULL))
     AND EXISTS (SELECT 1 FROM public.bed_assignments a WHERE a.bed_id = NEW.id AND a.ended_at IS NULL) THEN
    RAISE EXCEPTION 'WL409 Bed % has a patient in it. Move or release the patient first.', OLD.label
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS hospital_beds_occupied_guard ON public.hospital_beds;
CREATE TRIGGER hospital_beds_occupied_guard
  BEFORE UPDATE OF archived_at, closed_at ON public.hospital_beds
  FOR EACH ROW EXECUTE FUNCTION public.hospital_beds_occupied_guard();


-- ─── 5. ward_layout_publish(jsonb): the reconcile in one transaction ─────
-- Payload: publishPayload() in supabase/functions/_shared/ward-layout.ts. Refusals the admin can act on
-- start with "WL409 " (the Edge Function returns them as 409 with the words after the code).
CREATE OR REPLACE FUNCTION public.ward_layout_publish(p jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_hospital uuid := (p->>'hospital_id')::uuid;
  v_ward uuid := (p->>'ward_id')::uuid;
  v_actor uuid := (p->>'actor')::uuid;
  v_doc jsonb := p->'document';
  v_draft public.ward_layouts%ROWTYPE;
  v_keep_ids uuid[];
  v_archive_ids uuid[];
  v_labels text[];
  v_created jsonb := '{}'::jsonb;
  v_busy text;
  v_row jsonb;
  v_id uuid;
  v_label text;
  v_n integer;
BEGIN
  PERFORM 1 FROM public.hospital_wards WHERE id = v_ward AND hospital_id = v_hospital FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'WL404 Ward not found at this hospital.';
  END IF;
  SELECT * INTO v_draft FROM public.ward_layouts
   WHERE id = (p->>'draft_id')::uuid AND ward_id = v_ward AND state = 'draft' FOR UPDATE;
  IF NOT FOUND OR v_draft.revision <> (p->>'draft_revision')::integer THEN
    RAISE EXCEPTION 'WL409 The draft changed since you checked it. Look again, then publish.';
  END IF;
  PERFORM 1 FROM public.hospital_beds WHERE ward_id = v_ward FOR UPDATE;

  SELECT coalesce(array_agg((k->>'bed_id')::uuid), '{}') INTO v_keep_ids
    FROM jsonb_array_elements(coalesce(p->'keep', '[]'::jsonb)) k;
  SELECT coalesce(array_agg(x::uuid), '{}') INTO v_archive_ids
    FROM jsonb_array_elements_text(coalesce(p->'archive', '[]'::jsonb)) x;
  SELECT coalesce(array_agg(x->>'label'), '{}') INTO v_labels
    FROM (SELECT k AS x FROM jsonb_array_elements(coalesce(p->'keep', '[]'::jsonb)) k
          UNION ALL SELECT c FROM jsonb_array_elements(coalesce(p->'create', '[]'::jsonb)) c) s;

  -- The plan was made from this register: every bed it names is this ward's, and every active bed
  -- is kept or archived (a bed added meanwhile would otherwise be missed).
  IF EXISTS (SELECT 1 FROM unnest(v_keep_ids || v_archive_ids) u(id)
              WHERE NOT EXISTS (SELECT 1 FROM public.hospital_beds b WHERE b.id = u.id AND b.ward_id = v_ward))
     OR EXISTS (SELECT 1 FROM public.hospital_beds b
                 WHERE b.ward_id = v_ward AND b.archived_at IS NULL
                   AND NOT (b.id = ANY (v_keep_ids || v_archive_ids))) THEN
    RAISE EXCEPTION 'WL409 The bed register changed since you checked it. Look again, then publish.';
  END IF;

  -- Occupancy, again, under the locks: nobody leaves the plan or goes out of service with a patient in.
  SELECT string_agg(b.label, ', ' ORDER BY b.label) INTO v_busy
    FROM public.hospital_beds b
    JOIN public.bed_assignments a ON a.bed_id = b.id AND a.ended_at IS NULL
   WHERE b.id = ANY (v_archive_ids)
      OR b.id IN (SELECT (k->>'bed_id')::uuid FROM jsonb_array_elements(coalesce(p->'keep', '[]'::jsonb)) k
                   WHERE k->>'closed_reason' IS NOT NULL);
  IF v_busy IS NOT NULL THEN
    RAISE EXCEPTION 'WL409 A patient is in % now. Move or release them first, then publish.', v_busy;
  END IF;

  UPDATE public.hospital_beds SET archived_at = now() WHERE id = ANY (v_archive_ids);

  -- A bed off the plan that holds a number the plan uses gives it up ("B3 (old 1)"): labels are unique
  -- per ward, archived ones included.
  FOR v_id, v_label IN
    SELECT b.id, b.label FROM public.hospital_beds b
     WHERE b.ward_id = v_ward AND NOT (b.id = ANY (v_keep_ids)) AND b.label = ANY (v_labels)
  LOOP
    v_n := 1;
    WHILE EXISTS (SELECT 1 FROM public.hospital_beds
                   WHERE ward_id = v_ward AND label = left(v_label, 11) || ' (old ' || v_n || ')') LOOP
      v_n := v_n + 1;
    END LOOP;
    UPDATE public.hospital_beds SET label = left(v_label, 11) || ' (old ' || v_n || ')' WHERE id = v_id;
  END LOOP;

  -- Kept beds step through a temporary label, so two beds may swap numbers.
  UPDATE public.hospital_beds SET label = '~' || substr(replace(id::text, '-', ''), 1, 19)
   WHERE id = ANY (v_keep_ids);

  FOR v_row IN SELECT * FROM jsonb_array_elements(coalesce(p->'keep', '[]'::jsonb)) LOOP
    v_id := (v_row->>'bed_id')::uuid;
    UPDATE public.hospital_beds b SET
      label = v_row->>'label',
      bed_type = v_row->>'bed_type',
      layout_x = (v_row->>'x')::integer,
      layout_y = (v_row->>'y')::integer,
      rotation = (v_row->>'rotation')::integer,
      room_key = v_row->>'room_key',
      archived_at = NULL,
      closed_reason = v_row->>'closed_reason',
      closed_at = CASE
        WHEN v_row->>'closed_reason' IS NULL THEN NULL
        WHEN b.closed_at IS NOT NULL AND b.closed_reason = v_row->>'closed_reason' THEN b.closed_at
        ELSE now() END
     WHERE b.id = v_id;
    DELETE FROM public.hospital_bed_services s
     WHERE s.bed_id = v_id
       AND NOT (s.service_code = ANY (ARRAY(SELECT jsonb_array_elements_text(v_row->'services'))));
    INSERT INTO public.hospital_bed_services (bed_id, hospital_id, service_code, created_by)
    SELECT v_id, v_hospital, x, v_actor FROM jsonb_array_elements_text(v_row->'services') x
    ON CONFLICT (bed_id, service_code) DO NOTHING;
  END LOOP;

  FOR v_row IN SELECT * FROM jsonb_array_elements(coalesce(p->'create', '[]'::jsonb)) LOOP
    INSERT INTO public.hospital_beds (hospital_id, ward_id, label, bed_type, layout_x, layout_y, rotation,
                                      room_key, closed_at, closed_reason)
    VALUES (v_hospital, v_ward, v_row->>'label', v_row->>'bed_type', (v_row->>'x')::integer,
            (v_row->>'y')::integer, (v_row->>'rotation')::integer, v_row->>'room_key',
            CASE WHEN v_row->>'closed_reason' IS NULL THEN NULL ELSE now() END, v_row->>'closed_reason')
    RETURNING id INTO v_id;
    INSERT INTO public.hospital_bed_services (bed_id, hospital_id, service_code, created_by)
    SELECT v_id, v_hospital, x, v_actor FROM jsonb_array_elements_text(v_row->'services') x;
    v_created := v_created || jsonb_build_object(v_row->>'key', v_id);
  END LOOP;

  -- STR-5 is deferred to commit: the count and the register agree when this transaction ends.
  UPDATE public.hospital_wards SET bed_count = (p->>'bed_count')::integer WHERE id = v_ward;

  -- The published document carries every bed's register id.
  v_doc := jsonb_set(v_doc, '{beds}', coalesce((
    SELECT jsonb_agg(CASE WHEN v_created ? (b->>'key')
                          THEN b || jsonb_build_object('bedId', v_created->>(b->>'key')) ELSE b END
                     ORDER BY o)
      FROM jsonb_array_elements(v_doc->'beds') WITH ORDINALITY AS t(b, o)), '[]'::jsonb));

  UPDATE public.ward_layouts SET state = 'superseded' WHERE ward_id = v_ward AND state = 'published';
  UPDATE public.ward_layouts SET
    state = 'published',
    document = v_doc,
    floor_w_cells = (v_doc->'floor'->>'w')::integer,
    floor_h_cells = (v_doc->'floor'->>'h')::integer,
    warnings = coalesce(p->'warnings', '[]'::jsonb),
    published_by = v_actor,
    published_at = now()
   WHERE id = v_draft.id;

  RETURN jsonb_build_object(
    'layout_id', v_draft.id, 'version', v_draft.version, 'created', v_created,
    'archived', coalesce(array_length(v_archive_ids, 1), 0), 'bed_count', (p->>'bed_count')::integer);
END;
$$;
REVOKE ALL ON FUNCTION public.ward_layout_publish(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ward_layout_publish(jsonb) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ward_layout_publish(jsonb) TO service_role;


-- ─── 6. RLS, grants and row audit ────────────────────────────────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['ward_layouts', 'hospital_bed_services', 'bed_assignments', 'bed_state_events']
  LOOP
    EXECUTE format('ALTER TABLE public.%s ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE public.%s FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %1$s_select_scoped ON public.%1$s', t);
    EXECUTE format('REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.%s FROM anon, authenticated', t);
    EXECUTE format('GRANT SELECT ON public.%s TO authenticated', t);
  END LOOP;
  FOREACH t IN ARRAY ARRAY['ward_layouts', 'hospital_bed_services', 'bed_state_events']
  LOOP
    EXECUTE format('CREATE POLICY %1$s_select_scoped ON public.%1$s FOR SELECT TO authenticated USING (
      public.user_has_role(''superadmin'') OR public.user_has_role(''hospital_admin'', hospital_id)
      OR public.is_hospital_staff(hospital_id))', t);
  END LOOP;
  FOREACH t IN ARRAY ARRAY['hospital_bed_services', 'bed_assignments', 'bed_state_events']
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS audit_%1$s ON public.%1$s', t);
    EXECUTE format('CREATE TRIGGER audit_%1$s AFTER INSERT OR UPDATE OR DELETE ON public.%1$s
      FOR EACH ROW EXECUTE FUNCTION public.audit_log_changes()', t);
  END LOOP;
END $$;

-- A bed assignment names a patient: admins, superadmins and active clinical staff of the hospital.
CREATE POLICY bed_assignments_select_scoped ON public.bed_assignments FOR SELECT TO authenticated USING (
  public.user_has_role('superadmin') OR public.user_has_role('hospital_admin', hospital_id)
  OR public.is_active_clinical_staff(hospital_id));


-- ─── 7. Live: ward-beds:<hospital> ───────────────────────────────────────
-- The client re-reads the server on a message; it never renders the payload. A missing or failing
-- realtime layer never blocks a write (as 0069).
CREATE OR REPLACE FUNCTION public.ward_beds_broadcast()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = ''
AS $$
DECLARE
  v_ward uuid;
BEGIN
  BEGIN
    IF TG_TABLE_NAME = 'bed_state_events' THEN
      SELECT b.ward_id INTO v_ward FROM public.hospital_beds b WHERE b.id = NEW.bed_id;
    ELSE
      v_ward := NEW.ward_id;
    END IF;
    PERFORM realtime.send(
      jsonb_build_object('kind', TG_TABLE_NAME, 'ward_id', v_ward, 'at', now()),
      'change',
      'ward-beds:' || NEW.hospital_id::text,
      true
    );
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS ward_beds_broadcast ON public.bed_assignments;
CREATE TRIGGER ward_beds_broadcast AFTER INSERT OR UPDATE OF ended_at ON public.bed_assignments
  FOR EACH ROW EXECUTE FUNCTION public.ward_beds_broadcast();
DROP TRIGGER IF EXISTS ward_beds_broadcast ON public.bed_state_events;
CREATE TRIGGER ward_beds_broadcast AFTER INSERT ON public.bed_state_events
  FOR EACH ROW EXECUTE FUNCTION public.ward_beds_broadcast();
DROP TRIGGER IF EXISTS ward_beds_broadcast ON public.hospital_beds;
CREATE TRIGGER ward_beds_broadcast AFTER INSERT OR UPDATE OF closed_at, archived_at, label
  ON public.hospital_beds
  FOR EACH ROW EXECUTE FUNCTION public.ward_beds_broadcast();
DROP TRIGGER IF EXISTS ward_beds_broadcast ON public.ward_layouts;
CREATE TRIGGER ward_beds_broadcast AFTER UPDATE OF state ON public.ward_layouts
  FOR EACH ROW WHEN (NEW.state = 'published') EXECUTE FUNCTION public.ward_beds_broadcast();

-- ward-beds:<hospitalId> → that hospital's admins, active clinical staff and superadmins. Guarded:
-- environments without the realtime schema skip this block.
DO $do$
BEGIN
  IF to_regclass('realtime.messages') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS ward_beds_realtime_receive ON realtime.messages';
    EXECUTE $p$
      CREATE POLICY ward_beds_realtime_receive ON realtime.messages
        FOR SELECT TO authenticated
        USING (
          realtime.messages.extension = 'broadcast'
          AND (SELECT realtime.topic()) LIKE 'ward-beds:%'
          AND EXISTS (
            SELECT 1 FROM public.hospitals h
            WHERE h.id::text = substring((SELECT realtime.topic()) FROM 11)
              AND (public.user_has_role('superadmin') OR public.user_has_role('hospital_admin', h.id)
                   OR public.is_active_clinical_staff(h.id))
          )
        )
    $p$;
  END IF;
END
$do$;


-- ─── 8. Audit verbs (0080's list verbatim + the ward builder's) ──────────
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
    'save_ward_layout', 'publish_ward_layout', 'set_bed_state', 'assign_bed', 'release_bed'
  )
);
