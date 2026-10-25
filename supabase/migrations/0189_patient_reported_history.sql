-- 0189 — The patient's own history from the phone: conditions, allergies, family history (Tide v1, ADR 0355).
--
-- One patient-owned table, one row per thing the patient reports, in the clinician's own vocabulary
-- (the signed clerking catalogue MS-EMR-CLERK-CAT-001, data/clerking/clerking-history-catalogue.v1.json):
--   kind 'condition'          item_id = past_history.conditions id (or 'other' + other_text);
--                             onset_year optional; resolved = "I no longer have it".
--   kind 'allergy'            item_id = allergies.quick_picks id (or 'other' + other_text);
--                             reactions = allergies.reactions ids; severity = allergies.severity id.
--   kind 'family'             item_id = family_history.conditions id (or 'other' + other_text);
--                             relation = option_sets.relations id.
--   kind 'no_known_allergies' the patient says they have none. Recording an allergy retires it.
--
-- What the patient reports is never a clinical record: the clerking desk shows it as
-- "patient-reported, not yet confirmed" and only a clinician's confirm writes the record.
--
-- Append-only and audited: the patient inserts rows and may only retire one (state active → removed);
-- an edit is a new row naming the one it replaces (supersedes_id), which a trigger retires in the same
-- statement. No DELETE. Every change lands in audit_log_changes.
-- The care team reads active rows (owner decision, 18 Oct 2026, as 0188 did for the patient's log):
-- anyone with public.has_clinical_relationship to the patient; the desk's reader role under the record's
-- own access rule (private.accessible_patient_ids, 0071).
--
-- ADDITIVE and re-runnable. Owner-applied (`npm run db:migrate`).
-- Reverse: DROP TABLE public.patient_reported_history; DROP FUNCTION private.patient_reported_history_retire().

CREATE TABLE IF NOT EXISTS public.patient_reported_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL,
  item_id text,
  other_text text,
  onset_year smallint,
  resolved boolean,
  relation text,
  reactions text[] NOT NULL DEFAULT '{}',
  severity text,
  supersedes_id uuid REFERENCES public.patient_reported_history(id),
  state text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  removed_at timestamptz,

  CONSTRAINT patient_reported_history_kind_check
    CHECK (kind IN ('condition','allergy','family','no_known_allergies')),
  CONSTRAINT patient_reported_history_state_check CHECK (state IN ('active','removed')),
  CONSTRAINT patient_reported_history_item_check
    CHECK (item_id IS NULL OR item_id ~ '^[a-z0-9_]{1,64}$'),
  CONSTRAINT patient_reported_history_other_check
    CHECK ((item_id = 'other') = (other_text IS NOT NULL) OR kind = 'no_known_allergies'),
  CONSTRAINT patient_reported_history_other_len
    CHECK (other_text IS NULL OR char_length(btrim(other_text)) BETWEEN 1 AND 120),
  CONSTRAINT patient_reported_history_year_check
    CHECK (onset_year IS NULL OR onset_year BETWEEN 1900 AND 2100),
  CONSTRAINT patient_reported_history_relation_check
    CHECK (relation IS NULL OR relation IN ('mother','father','sibling','child','grandparent','other_relative')),
  CONSTRAINT patient_reported_history_severity_check
    CHECK (severity IS NULL OR severity IN ('mild','moderate','severe')),
  CONSTRAINT patient_reported_history_reactions_check
    CHECK (cardinality(reactions) <= 8),
  -- Each kind carries only its own fields.
  CONSTRAINT patient_reported_history_shape CHECK (
    CASE kind
      WHEN 'condition' THEN item_id IS NOT NULL AND relation IS NULL AND severity IS NULL
        AND cardinality(reactions) = 0
      WHEN 'allergy' THEN item_id IS NOT NULL AND relation IS NULL AND onset_year IS NULL
        AND resolved IS NULL
      WHEN 'family' THEN item_id IS NOT NULL AND relation IS NOT NULL AND onset_year IS NULL
        AND resolved IS NULL AND severity IS NULL AND cardinality(reactions) = 0
      ELSE item_id IS NULL AND other_text IS NULL AND onset_year IS NULL AND resolved IS NULL
        AND relation IS NULL AND severity IS NULL AND cardinality(reactions) = 0
    END
  ),
  CONSTRAINT patient_reported_history_removed_check
    CHECK ((state = 'removed') = (removed_at IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS patient_reported_history_active_idx
  ON public.patient_reported_history (patient_user_id, kind)
  WHERE state = 'active';

ALTER TABLE public.patient_reported_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patient_reported_history FORCE ROW LEVEL SECURITY;

-- Rows are written once; the only change is retiring one (two columns).
REVOKE ALL ON public.patient_reported_history FROM anon, authenticated;
GRANT SELECT, INSERT ON public.patient_reported_history TO authenticated;
GRANT UPDATE (state, removed_at) ON public.patient_reported_history TO authenticated;
GRANT SELECT ON public.patient_reported_history TO medsync_clinical_reader;

DROP POLICY IF EXISTS patient_reported_history_select_own ON public.patient_reported_history;
CREATE POLICY patient_reported_history_select_own ON public.patient_reported_history
  FOR SELECT TO authenticated
  USING (patient_user_id = auth.uid() OR public.user_has_role('superadmin'));

DROP POLICY IF EXISTS patient_reported_history_select_care_team ON public.patient_reported_history;
CREATE POLICY patient_reported_history_select_care_team ON public.patient_reported_history
  FOR SELECT TO authenticated
  USING (state = 'active' AND public.has_clinical_relationship(patient_user_id));

-- The clerking desk reads as medsync_clinical_reader under the record's one access rule (0071).
DROP POLICY IF EXISTS patient_reported_history_select_clinical ON public.patient_reported_history;
CREATE POLICY patient_reported_history_select_clinical ON public.patient_reported_history
  FOR SELECT TO medsync_clinical_reader
  USING (state = 'active' AND patient_user_id IN (SELECT private.accessible_patient_ids()));

DROP POLICY IF EXISTS patient_reported_history_insert_own ON public.patient_reported_history;
CREATE POLICY patient_reported_history_insert_own ON public.patient_reported_history
  FOR INSERT TO authenticated
  WITH CHECK (patient_user_id = auth.uid() AND state = 'active' AND removed_at IS NULL);

DROP POLICY IF EXISTS patient_reported_history_retire_own ON public.patient_reported_history;
CREATE POLICY patient_reported_history_retire_own ON public.patient_reported_history
  FOR UPDATE TO authenticated
  USING (patient_user_id = auth.uid() AND state = 'active')
  WITH CHECK (patient_user_id = auth.uid() AND state = 'removed');

-- An edit retires the row it replaces; an allergy retires "no known allergies", in the same statement.
-- SECURITY INVOKER: it runs as the patient, so RLS still limits it to their own rows.
-- (A trigger function needs no EXECUTE grant: the trigger, not the caller, invokes it.)
CREATE OR REPLACE FUNCTION private.patient_reported_history_retire()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.supersedes_id IS NOT NULL THEN
    UPDATE public.patient_reported_history
       SET state = 'removed', removed_at = now()
     WHERE id = NEW.supersedes_id
       AND patient_user_id = NEW.patient_user_id
       AND state = 'active';
  END IF;
  IF NEW.kind = 'allergy' THEN
    UPDATE public.patient_reported_history
       SET state = 'removed', removed_at = now()
     WHERE patient_user_id = NEW.patient_user_id
       AND kind = 'no_known_allergies'
       AND state = 'active';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION private.patient_reported_history_retire() FROM PUBLIC;

DROP TRIGGER IF EXISTS patient_reported_history_retire ON public.patient_reported_history;
CREATE TRIGGER patient_reported_history_retire
  AFTER INSERT ON public.patient_reported_history
  FOR EACH ROW EXECUTE FUNCTION private.patient_reported_history_retire();

DROP TRIGGER IF EXISTS audit_patient_reported_history ON public.patient_reported_history;
CREATE TRIGGER audit_patient_reported_history
  AFTER INSERT OR UPDATE OR DELETE ON public.patient_reported_history
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_changes();
