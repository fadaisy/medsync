-- 0096 — condition_relations: how diagnoses relate, held in the record (ADR 0220; dx-relations-design §5,
-- signed by the CSO at GATE A 2026-10-09, all 17 decisions = A; docs/emr/dx-relations/gate-a-signoff.json).
--
--   1. conditions.refined_from: a refinement is the next version of the same condition (D-REL-05); this
--      names the version and term it was refined from and the results that decided it. Not `stage`:
--      stage is severity, recomputed as results change (D-REL-14), and must not carry provenance.
--   2. condition_relations: append-only, versioned (logical_id / version / supersedes_id, as the fact
--      envelope), four relation types (D-REL-03/04), due_to labels, position (D-REL-12), coded
--      non-diagnosis causes as qualifiers (D-REL-11), restricted classes of both ends (D-REL-09).
--      Ends are conditions.logical_id, so a relation follows its conditions through refinement.
--   3. The guard (before insert): same patient and hospital, no self, nothing on a removed end, no
--      due_to / associated_with on a differential or refuted end (D-REL-08), episode_of from a visit
--      diagnosis to a problem-list item, no loop, due_to chains of at most 4 (certificate lines a–d),
--      chains already hanging below counted; sensitivity and classes only ever rise.
--   4. An end entered in error, cancelled or refuted retires its active relations (origin
--      system_end_removed), from a trigger on conditions, so every path that removes a condition does it.
--   5. RLS (FORCED): read = hospital + the one access rule + every restricted class of the row
--      (private.can_view_restricted). No client writes: lib/emr/write/relations.ts writes as the owner
--      after the access check, as every EMR write does. Audited, and on the chart's realtime topic.
--
-- Classes: conditions carry only sensitivity; a condition's class (hiv, tb, mental_health,
-- sexual_reproductive_health, ADR 0206) comes from the signed diagnosis catalogue, so the writer passes
-- the classes of both ends and the guard unions them with the previous version's. The viewer's classes
-- are the transaction-local GUC app.restricted_classes (comma list, 'none' for none); unset, a clinical
-- reader holds every class (D-SI-18, lib/clerking/impression/facts CLINICAL_VIEWER).
--
-- ADDITIVE and re-runnable. GATED: owner-applied (`npm run db:migrate`), after 0095.


-- ─── 1. conditions.refined_from ──────────────────────────────────────
ALTER TABLE public.conditions ADD COLUMN IF NOT EXISTS refined_from jsonb;   -- { versionId, termId, decidedBy[] }
CREATE OR REPLACE VIEW public.conditions_current WITH (security_invoker = true) AS
  SELECT c.* FROM public.conditions c
  WHERE NOT EXISTS (SELECT 1 FROM public.conditions s WHERE s.supersedes_id = c.id);


-- ─── 2. condition_relations ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.condition_relations (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  logical_id           uuid NOT NULL,                     -- shared by every version of the relation
  version              integer NOT NULL DEFAULT 1,
  supersedes_id        uuid REFERENCES public.condition_relations(id) ON DELETE RESTRICT,
  hospital_id          uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  patient_user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  encounter_id         uuid NOT NULL REFERENCES public.encounters(id) ON DELETE RESTRICT,   -- asserted at
  condition_id         uuid NOT NULL,     -- conditions.logical_id: the effect, the factor, this visit's episode
  related_condition_id uuid NOT NULL,     -- conditions.logical_id: the cause, the outcome, the problem-list item
  relation_type        text NOT NULL,
  label                text,              -- due_to only
  position             smallint NOT NULL DEFAULT 1,
  qualifiers           text[] NOT NULL DEFAULT '{}',
  restricted_classes   text[] NOT NULL DEFAULT '{}',     -- both ends' classes; the guard keeps them
  sensitivity          text NOT NULL DEFAULT 'standard',  -- restricted if either end is (set by the guard)
  state                text NOT NULL DEFAULT 'active',
  reason_code          text,
  reason_ciphertext    text,
  origin               text NOT NULL,
  catalogue_ref        text,              -- e.g. 'MS-EMR-DX-CAUSES-001@1.0.0:dx.anaemia<-dx.malaria_severe'
  recorded_by_user_id  uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  author_cadre         text,
  recorded_at          timestamptz NOT NULL DEFAULT now(),
  cosigned_by_user_id  uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  cosigned_at          timestamptz,
  client_key           text,
  CONSTRAINT condition_relations_version_check CHECK (version >= 1),
  CONSTRAINT condition_relations_version_chain CHECK ((version = 1) = (supersedes_id IS NULL)),
  CONSTRAINT condition_relations_relation_type_check
    CHECK (relation_type IN ('due_to','associated_with','risk_factor_for','episode_of')),
  CONSTRAINT condition_relations_label_check
    CHECK (label IS NULL OR label IN ('complication','secondary','precipitated_by')),
  CONSTRAINT condition_relations_label_rule CHECK ((relation_type = 'due_to') = (label IS NOT NULL)),
  CONSTRAINT condition_relations_position_check CHECK (position BETWEEN 1 AND 20),
  CONSTRAINT condition_relations_qualifiers_check CHECK (qualifiers <@ ARRAY['cause.insulin_omission',
    'cause.new_medicine','cause.treatment_interruption','cause.alcohol','cause.pregnancy','cause.immobility']::text[]),
  CONSTRAINT condition_relations_classes_check
    CHECK (restricted_classes <@ ARRAY['hiv','tb','mental_health','sexual_reproductive_health']::text[]),
  CONSTRAINT condition_relations_sensitivity_check CHECK (sensitivity IN ('standard','restricted')),
  CONSTRAINT condition_relations_state_check CHECK (state IN ('active','retired','entered_in_error')),
  CONSTRAINT condition_relations_reason_rule
    CHECK (state = 'active' OR reason_code IS NOT NULL OR reason_ciphertext IS NOT NULL),
  CONSTRAINT condition_relations_origin_check
    CHECK (origin IN ('clinician','system_end_removed','system_merge','backfill_confirmed')),
  CONSTRAINT condition_relations_cosign_pair CHECK ((cosigned_by_user_id IS NULL) = (cosigned_at IS NULL)),
  CONSTRAINT condition_relations_no_self CHECK (condition_id <> related_condition_id),
  CONSTRAINT condition_relations_symmetric_once
    CHECK (relation_type <> 'associated_with' OR condition_id < related_condition_id));

CREATE UNIQUE INDEX IF NOT EXISTS condition_relations_logical_version ON public.condition_relations (logical_id, version);
CREATE UNIQUE INDEX IF NOT EXISTS condition_relations_client_key ON public.condition_relations (client_key)
  WHERE client_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS condition_relations_supersedes ON public.condition_relations (supersedes_id)
  WHERE supersedes_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS condition_relations_patient ON public.condition_relations (patient_user_id, state);
CREATE INDEX IF NOT EXISTS condition_relations_condition ON public.condition_relations (condition_id);
CREATE INDEX IF NOT EXISTS condition_relations_related ON public.condition_relations (related_condition_id);
CREATE INDEX IF NOT EXISTS condition_relations_encounter ON public.condition_relations (encounter_id);

CREATE OR REPLACE VIEW public.condition_relations_current WITH (security_invoker = true) AS
  SELECT r.* FROM public.condition_relations r
  WHERE NOT EXISTS (SELECT 1 FROM public.condition_relations s WHERE s.supersedes_id = r.id);


-- ─── 3. The guard ────────────────────────────────────────────────────
-- Messages starting 'Relation refused: ' are shown to the clinician as they are (lib/emr/write/relations.ts).
CREATE OR REPLACE FUNCTION private.condition_relations_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  a public.conditions; b public.conditions; prev public.condition_relations;
  above int; below int;
BEGIN
  IF NEW.condition_id = NEW.related_condition_id THEN
    RAISE EXCEPTION 'Relation refused: a diagnosis cannot be linked to itself.';
  END IF;
  IF NEW.supersedes_id IS NOT NULL THEN
    SELECT * INTO prev FROM public.condition_relations WHERE id = NEW.supersedes_id;
    IF prev.logical_id IS DISTINCT FROM NEW.logical_id OR prev.version + 1 <> NEW.version
       OR (prev.patient_user_id, prev.hospital_id, prev.condition_id, prev.related_condition_id, prev.relation_type)
          IS DISTINCT FROM
          (NEW.patient_user_id, NEW.hospital_id, NEW.condition_id, NEW.related_condition_id, NEW.relation_type) THEN
      RAISE EXCEPTION 'condition_relations: a new version keeps its logical id, ends and type';
    END IF;
    IF prev.state <> 'active' THEN
      RAISE EXCEPTION 'Relation refused: this link was removed; link the diagnoses again instead.';
    END IF;
  ELSIF NEW.logical_id <> NEW.id THEN
    RAISE EXCEPTION 'condition_relations: version 1 carries logical_id = id';
  END IF;

  SELECT * INTO a FROM public.conditions WHERE logical_id = NEW.condition_id ORDER BY version DESC LIMIT 1;
  SELECT * INTO b FROM public.conditions WHERE logical_id = NEW.related_condition_id ORDER BY version DESC LIMIT 1;
  IF a.id IS NULL OR b.id IS NULL THEN
    RAISE EXCEPTION 'Relation refused: both diagnoses must be on the record.';
  END IF;
  IF a.patient_user_id <> NEW.patient_user_id OR b.patient_user_id <> NEW.patient_user_id
     OR a.hospital_id <> NEW.hospital_id OR b.hospital_id <> NEW.hospital_id THEN
    RAISE EXCEPTION 'Relation refused: both diagnoses must be this patient''s, at this hospital.';
  END IF;

  NEW.restricted_classes := ARRAY(SELECT DISTINCT x FROM unnest(NEW.restricted_classes || coalesce(prev.restricted_classes, '{}')) x ORDER BY x);
  NEW.sensitivity := CASE WHEN a.sensitivity = 'restricted' OR b.sensitivity = 'restricted'
                             OR prev.sensitivity = 'restricted' OR cardinality(NEW.restricted_classes) > 0
                          THEN 'restricted' ELSE 'standard' END;

  IF NEW.state <> 'active' THEN RETURN NEW; END IF;

  IF a.status IN ('entered_in_error','cancelled') OR b.status IN ('entered_in_error','cancelled')
     OR a.verification = 'refuted' OR b.verification = 'refuted' THEN
    RAISE EXCEPTION 'Relation refused: a diagnosis that was removed or ruled out cannot be linked.';
  END IF;
  IF NEW.relation_type IN ('due_to','associated_with')
     AND (a.verification = 'differential' OR b.verification = 'differential') THEN
    RAISE EXCEPTION 'Relation refused: a differential is not linked; promote it first.';
  END IF;
  IF NEW.relation_type = 'episode_of'
     AND (a.category <> 'encounter_diagnosis' OR b.category <> 'problem_list_item') THEN
    RAISE EXCEPTION 'Relation refused: "active this visit" joins a visit diagnosis to a problem-list item.';
  END IF;

  IF NEW.relation_type = 'due_to' THEN
    IF EXISTS (
      WITH RECURSIVE up(id) AS (
        SELECT NEW.related_condition_id
        UNION
        SELECT r.related_condition_id FROM public.condition_relations_current r JOIN up ON r.condition_id = up.id
        WHERE r.patient_user_id = NEW.patient_user_id AND r.relation_type = 'due_to' AND r.state = 'active')
      SELECT 1 FROM up WHERE id = NEW.condition_id) THEN
      RAISE EXCEPTION 'Relation refused: this link would make a loop.';
    END IF;
    -- Conditions from the cause upwards (the cause = 1), and effects already hanging below this one.
    WITH RECURSIVE up(id, d) AS (
      SELECT NEW.related_condition_id, 1
      UNION ALL
      SELECT r.related_condition_id, up.d + 1 FROM public.condition_relations_current r JOIN up ON r.condition_id = up.id
      WHERE r.patient_user_id = NEW.patient_user_id AND r.relation_type = 'due_to' AND r.state = 'active' AND up.d < 10)
    SELECT max(d) INTO above FROM up;
    WITH RECURSIVE down(id, d) AS (
      SELECT NEW.condition_id, 0
      UNION ALL
      SELECT r.condition_id, down.d + 1 FROM public.condition_relations_current r JOIN down ON r.related_condition_id = down.id
      WHERE r.patient_user_id = NEW.patient_user_id AND r.relation_type = 'due_to' AND r.state = 'active' AND down.d < 10)
    SELECT max(d) INTO below FROM down;
    IF above + 1 + below > 4 THEN
      RAISE EXCEPTION 'Relation refused: a chain of causes is limited to 4 levels.';
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS condition_relations_guard ON public.condition_relations;
CREATE TRIGGER condition_relations_guard BEFORE INSERT ON public.condition_relations
  FOR EACH ROW EXECUTE FUNCTION private.condition_relations_guard();
DROP TRIGGER IF EXISTS condition_relations_no_mutation ON public.condition_relations;
CREATE TRIGGER condition_relations_no_mutation BEFORE UPDATE OR DELETE ON public.condition_relations
  FOR EACH ROW EXECUTE FUNCTION public.block_modify_append_only();
DROP TRIGGER IF EXISTS audit_condition_relations ON public.condition_relations;
CREATE TRIGGER audit_condition_relations AFTER INSERT OR UPDATE OR DELETE ON public.condition_relations
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_changes();
DROP TRIGGER IF EXISTS emr_chart_broadcast ON public.condition_relations;
CREATE TRIGGER emr_chart_broadcast AFTER INSERT ON public.condition_relations
  FOR EACH ROW EXECUTE FUNCTION public.emr_chart_broadcast();


-- ─── 4. A removed end retires its relations (system_end_removed) ─────
-- The next version of each active relation on the condition, by the person who removed it. The effect
-- of a removed cause stays; the desk shows "Cause removed: review" from this row (DXV-13).
CREATE OR REPLACE FUNCTION private.retire_condition_relations() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  INSERT INTO public.condition_relations
    (id, logical_id, version, supersedes_id, hospital_id, patient_user_id, encounter_id, condition_id,
     related_condition_id, relation_type, label, position, qualifiers, restricted_classes, sensitivity, state,
     reason_code, origin, catalogue_ref, recorded_by_user_id, author_cadre, recorded_at)
  SELECT gen_random_uuid(), r.logical_id, r.version + 1, r.id, r.hospital_id, r.patient_user_id, r.encounter_id,
         r.condition_id, r.related_condition_id, r.relation_type, r.label, r.position, r.qualifiers,
         r.restricted_classes, r.sensitivity, 'retired',
         CASE WHEN NEW.verification = 'refuted' AND NEW.status NOT IN ('entered_in_error','cancelled')
              THEN 'end_refuted' ELSE 'end_entered_in_error' END,
         'system_end_removed', r.catalogue_ref, NEW.recorded_by_user_id, NEW.author_cadre, NEW.recorded_at
  FROM public.condition_relations_current r
  WHERE r.patient_user_id = NEW.patient_user_id AND r.state = 'active'
    AND (r.condition_id = NEW.logical_id OR r.related_condition_id = NEW.logical_id);
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS conditions_retire_relations ON public.conditions;
CREATE TRIGGER conditions_retire_relations AFTER INSERT ON public.conditions
  FOR EACH ROW WHEN (NEW.version > 1 AND (NEW.status IN ('entered_in_error','cancelled') OR NEW.verification = 'refuted'))
  EXECUTE FUNCTION private.retire_condition_relations();


-- ─── 5. RLS and grants ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION private.can_view_restricted(p_sensitivity text, p_classes text[]) RETURNS boolean
LANGUAGE sql STABLE SET search_path = pg_catalog AS $$
  WITH v AS (
    SELECT CASE WHEN coalesce(current_setting('app.restricted_classes', true), '') = ''
                THEN ARRAY['hiv','tb','mental_health','sexual_reproductive_health']
                ELSE array_remove(string_to_array(current_setting('app.restricted_classes', true), ','), 'none')
           END AS held)
  -- Every class of the row held; a restricted row with no class needs some class (lib/clerking/impression/board).
  SELECT p_classes <@ v.held AND (p_sensitivity = 'standard' OR cardinality(v.held) > 0) FROM v;
$$;
REVOKE ALL ON FUNCTION private.condition_relations_guard(), private.retire_condition_relations(),
  private.can_view_restricted(text, text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.can_view_restricted(text, text[]) TO medsync_clinical_reader;

ALTER TABLE public.condition_relations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.condition_relations FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS condition_relations_select_clinical ON public.condition_relations;
CREATE POLICY condition_relations_select_clinical ON public.condition_relations FOR SELECT TO medsync_clinical_reader
  USING (hospital_id = (SELECT private.current_hospital_id())
         AND patient_user_id IN (SELECT private.accessible_patient_ids())
         AND private.can_view_restricted(sensitivity, restricted_classes));
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.condition_relations FROM anon, authenticated;
GRANT SELECT ON public.condition_relations TO medsync_clinical_reader;

REVOKE ALL ON public.condition_relations_current FROM anon, authenticated;
GRANT SELECT ON public.condition_relations_current TO medsync_clinical_reader;
