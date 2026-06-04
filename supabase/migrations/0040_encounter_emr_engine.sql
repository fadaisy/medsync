-- 0040 — Encounter / EMR engine + structured clerkship documentation.
--
-- ⚠️ GATED — DO NOT APPLY TO PRODUCTION WITHOUT EXPLICIT, NAMED CSO/OWNER
-- AUTHORIZATION. This is the clinical-data spine; applying it is hard-to-reverse.
-- It is committed for review + sign-off per docs/encounter-emr-engine-gate-a-
-- proposal.md (GATE A — schema + access model + clerkship structure). Same
-- gated posture as 0039. The TypeScript engine + clerkship surface are built
-- against this schema; the live feature needs this migration applied first.
--
-- Per docs/encounter-emr-engine-gate-a-proposal.md (§B access model — INFERRED,
-- CSO ratify) + docs/clinical/clerkship-clinical-reference.md (Hutchison).
--
-- Additive only. Schema deltas:
--   1. encounters (ALTER)        + disposition, triage_record_id, encounter_class
--   2. clinical_documentation    versioned, append-only clerkship documentation
--   3. encounter_diagnoses       the differential (working/final/excluded)
--   4. problem_list              patient-level problem list (acute + chronic)
--   5. patient_allergies         → the prescribing allergy check reads this
--      (shared with the gated 0039; this migration reconciles it idempotently)
--   6. encounter_medications     meds elicited/recorded in the clerking
--   7. encounter_orders/results  investigations (LOINC) — execution is a seam
--   8. encounter_events          the append-only encounter timeline
--   9. has_clinical_relationship() helper for the patient-level RLS predicate
--
-- CLINICAL-SAFETY + PDPO-CRITICAL. Documentation + the timeline are HARD
-- append-only (block trigger) — corrections are NEW versions that supersede an
-- earlier one. PHI free-text lives inside section_data (encrypted at the app
-- layer, like other note bodies). Clinical WRITES go through service-role
-- server actions (RLS has no client write policy); reception (is_clinical=false)
-- is excluded at the DB. Decision-support, not autonomous — no auto-diagnosis.

-- ─── 1. encounters (ALTER) ──────────────────────────────────────────────
ALTER TABLE public.encounters
  ADD COLUMN IF NOT EXISTS disposition text,
  ADD COLUMN IF NOT EXISTS triage_record_id uuid REFERENCES public.triage_records(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS encounter_class text NOT NULL DEFAULT 'scheduled';

ALTER TABLE public.encounters DROP CONSTRAINT IF EXISTS encounters_disposition_check;
ALTER TABLE public.encounters ADD CONSTRAINT encounters_disposition_check CHECK (
  disposition IS NULL OR disposition IN ('admit','discharge','refer','observe','transfer','deceased')
);

-- ─── helper: legitimate clinical relationship to a patient ──────────────
-- A clinical staff member has a legitimate relationship with a patient if they
-- are active clinical staff (is_clinical=true) at a hospital where the patient
-- has an encounter. Reception (is_clinical=false) never matches. Break-glass
-- (sa_break_glass_grants) is the audited emergency out-of-relationship read.
CREATE OR REPLACE FUNCTION public.has_clinical_relationship(p_patient uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.staff_affiliations sa
    JOIN public.cadres c ON c.id = sa.cadre_id
    JOIN public.encounters e ON e.hospital_id = sa.hospital_id
    WHERE sa.user_id = auth.uid()
      AND sa.state IN ('active','approved')
      AND c.is_clinical = true
      AND e.patient_user_id = p_patient
  )
  OR EXISTS (
    SELECT 1 FROM public.sa_break_glass_grants g
    WHERE g.actor_id = auth.uid()
      AND g.patient_id = p_patient
      AND g.revoked_at IS NULL
      AND g.expires_at > now()
  );
$$;
REVOKE EXECUTE ON FUNCTION public.has_clinical_relationship(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_clinical_relationship(uuid) TO authenticated;

-- ─── append-only guard (shared) ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.block_modify_append_only()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'append-only: % on % is not allowed (corrections create a new version)', TG_OP, TG_TABLE_NAME;
END;
$$;

-- ─── 2. clinical_documentation (versioned, append-only clerkship) ───────
CREATE TABLE public.clinical_documentation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  encounter_id uuid NOT NULL REFERENCES public.encounters(id) ON DELETE CASCADE,
  patient_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  version integer NOT NULL DEFAULT 1,
  supersedes_id uuid REFERENCES public.clinical_documentation(id) ON DELETE SET NULL,
  section_data jsonb NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  authored_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  author_cadre_code text,
  cosigned_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT clin_doc_status_check CHECK (status IN ('draft','final')),
  -- One row per (encounter, version): a racing second corrector errors rather
  -- than silently minting a duplicate version number (read-then-insert race).
  CONSTRAINT clin_doc_encounter_version_unique UNIQUE (encounter_id, version)
);
CREATE INDEX clin_doc_patient_idx ON public.clinical_documentation (patient_user_id, created_at);

ALTER TABLE public.clinical_documentation ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clinical_documentation FORCE ROW LEVEL SECURITY;
CREATE POLICY clin_doc_select_scoped ON public.clinical_documentation
  FOR SELECT TO authenticated
  USING (
    patient_user_id = auth.uid()
    OR public.user_has_role('superadmin')
    OR public.has_clinical_relationship(patient_user_id)
  );
-- Append-only: writes via service role; no UPDATE/DELETE ever.
CREATE TRIGGER clin_doc_no_update BEFORE UPDATE ON public.clinical_documentation
  FOR EACH ROW EXECUTE FUNCTION public.block_modify_append_only();
CREATE TRIGGER clin_doc_no_delete BEFORE DELETE ON public.clinical_documentation
  FOR EACH ROW EXECUTE FUNCTION public.block_modify_append_only();

-- ─── 3. encounter_diagnoses ─────────────────────────────────────────────
CREATE TABLE public.encounter_diagnoses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  encounter_id uuid NOT NULL REFERENCES public.encounters(id) ON DELETE CASCADE,
  patient_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  icd10_code text,
  text text NOT NULL,
  rank integer,
  must_not_miss boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'working',
  authored_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT enc_dx_status_check CHECK (status IN ('working','final','excluded'))
);
CREATE INDEX enc_dx_encounter_idx ON public.encounter_diagnoses (encounter_id);
CREATE INDEX enc_dx_patient_idx ON public.encounter_diagnoses (patient_user_id, created_at);
ALTER TABLE public.encounter_diagnoses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.encounter_diagnoses FORCE ROW LEVEL SECURITY;
CREATE POLICY enc_dx_select_scoped ON public.encounter_diagnoses
  FOR SELECT TO authenticated USING (
    patient_user_id = auth.uid() OR public.user_has_role('superadmin')
    OR public.has_clinical_relationship(patient_user_id)
  );

-- ─── 4. problem_list ────────────────────────────────────────────────────
CREATE TABLE public.problem_list (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  item text NOT NULL,
  icd10_code text,
  active boolean NOT NULL DEFAULT true,
  onset text,
  resolved_at timestamptz,
  source_encounter_id uuid REFERENCES public.encounters(id) ON DELETE SET NULL,
  authored_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX problem_list_patient_idx ON public.problem_list (patient_user_id, active);
ALTER TABLE public.problem_list ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.problem_list FORCE ROW LEVEL SECURITY;
CREATE POLICY problem_list_select_scoped ON public.problem_list
  FOR SELECT TO authenticated USING (
    patient_user_id = auth.uid() OR public.user_has_role('superadmin')
    OR public.has_clinical_relationship(patient_user_id)
  );
DROP TRIGGER IF EXISTS problem_list_updated_at ON public.problem_list;
CREATE TRIGGER problem_list_updated_at BEFORE UPDATE ON public.problem_list
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─── 5. patient_allergies (→ prescribing allergy check) ─────────────────
-- SHARED OWNERSHIP, reconciled forward. `patient_allergies` is also declared in
-- the gated 0039_smart_prescribing.sql (CREATE TABLE IF NOT EXISTS) — neither
-- migration has been applied to prod, so there is no single historical creator.
-- This migration is the AUTHORITATIVE owner: it creates the table idempotently
-- (so it is safe whether or not 0039 ran first, in the natural 0039→0040 order)
-- and SUPERSEDES 0039's hospital-scoped SELECT policy with the relationship-based
-- one below (0039 keyed off staff_affiliations.hospital_id; the EMR spine keys
-- off has_clinical_relationship). Shape matches db/schema/prescribing.ts exactly
-- so the prescribing allergy check reads it.
CREATE TABLE IF NOT EXISTS public.patient_allergies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  patient_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  substance text NOT NULL,
  reaction text,
  severity text,
  recorded_by_user_id uuid NOT NULL REFERENCES auth.users(id),
  recorded_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT patient_allergies_severity_check CHECK (
    severity IS NULL OR severity IN ('mild','moderate','severe','anaphylaxis','unknown')
  )
);
CREATE INDEX IF NOT EXISTS patient_allergies_patient_idx ON public.patient_allergies (patient_user_id, recorded_at);
ALTER TABLE public.patient_allergies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patient_allergies FORCE ROW LEVEL SECURITY;
-- Supersede 0039's hospital-scoped policy with the relationship-based predicate.
DROP POLICY IF EXISTS patient_allergies_select_scoped ON public.patient_allergies;
CREATE POLICY patient_allergies_select_scoped ON public.patient_allergies
  FOR SELECT TO authenticated USING (
    patient_user_id = auth.uid() OR public.user_has_role('superadmin')
    OR public.has_clinical_relationship(patient_user_id)
  );
-- Audit-on-write (idempotent; matches 0039) so 0040 is self-sufficient if applied alone.
DROP TRIGGER IF EXISTS audit_patient_allergies ON public.patient_allergies;
CREATE TRIGGER audit_patient_allergies
  AFTER INSERT OR UPDATE OR DELETE ON public.patient_allergies
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_changes();

-- ─── 6. encounter_medications ───────────────────────────────────────────
CREATE TABLE public.encounter_medications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  encounter_id uuid NOT NULL REFERENCES public.encounters(id) ON DELETE CASCADE,
  patient_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  dose text, route text, frequency text,
  status text NOT NULL DEFAULT 'active',
  source text NOT NULL DEFAULT 'clerking',
  authored_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT enc_med_status_check CHECK (status IN ('active','stopped','suspended'))
);
CREATE INDEX enc_med_encounter_idx ON public.encounter_medications (encounter_id);
ALTER TABLE public.encounter_medications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.encounter_medications FORCE ROW LEVEL SECURITY;
CREATE POLICY enc_med_select_scoped ON public.encounter_medications
  FOR SELECT TO authenticated USING (
    patient_user_id = auth.uid() OR public.user_has_role('superadmin')
    OR public.has_clinical_relationship(patient_user_id)
  );

-- ─── 7. encounter_orders + encounter_results ────────────────────────────
CREATE TABLE public.encounter_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  encounter_id uuid NOT NULL REFERENCES public.encounters(id) ON DELETE CASCADE,
  patient_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL,
  loinc_code text,
  text text NOT NULL,
  justification text,
  status text NOT NULL DEFAULT 'ordered',
  authored_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT enc_order_kind_check CHECK (kind IN ('bloods','imaging','bedside','special','other')),
  CONSTRAINT enc_order_status_check CHECK (status IN ('ordered','collected','resulted','cancelled'))
);
CREATE INDEX enc_order_encounter_idx ON public.encounter_orders (encounter_id, status);
ALTER TABLE public.encounter_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.encounter_orders FORCE ROW LEVEL SECURITY;
CREATE POLICY enc_order_select_scoped ON public.encounter_orders
  FOR SELECT TO authenticated USING (
    patient_user_id = auth.uid() OR public.user_has_role('superadmin')
    OR public.has_clinical_relationship(patient_user_id)
  );

CREATE TABLE public.encounter_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.encounter_orders(id) ON DELETE CASCADE,
  value text NOT NULL,
  unit text, abnormal_flag text, loinc_code text,
  resulted_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX enc_result_order_idx ON public.encounter_results (order_id);
ALTER TABLE public.encounter_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.encounter_results FORCE ROW LEVEL SECURITY;
CREATE POLICY enc_result_select_scoped ON public.encounter_results
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.encounter_orders o
      WHERE o.id = encounter_results.order_id
        AND (o.patient_user_id = auth.uid() OR public.user_has_role('superadmin')
             OR public.has_clinical_relationship(o.patient_user_id))
    )
  );

-- ─── 8. encounter_events (append-only timeline) ─────────────────────────
CREATE TABLE public.encounter_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  encounter_id uuid NOT NULL REFERENCES public.encounters(id) ON DELETE CASCADE,
  kind text NOT NULL,
  ref_id uuid,
  label text NOT NULL,
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT enc_event_kind_check CHECK (
    kind IN ('documentation','diagnosis','problem','order','result','medication','allergy','disposition','note','access')
  )
);
CREATE INDEX enc_event_encounter_idx ON public.encounter_events (encounter_id, recorded_at);
ALTER TABLE public.encounter_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.encounter_events FORCE ROW LEVEL SECURITY;
CREATE POLICY enc_event_select_scoped ON public.encounter_events
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.encounters e
      WHERE e.id = encounter_events.encounter_id
        AND (e.patient_user_id = auth.uid() OR public.user_has_role('superadmin')
             OR public.has_clinical_relationship(e.patient_user_id))
    )
  );
CREATE TRIGGER enc_event_no_update BEFORE UPDATE ON public.encounter_events
  FOR EACH ROW EXECUTE FUNCTION public.block_modify_append_only();
CREATE TRIGGER enc_event_no_delete BEFORE DELETE ON public.encounter_events
  FOR EACH ROW EXECUTE FUNCTION public.block_modify_append_only();
