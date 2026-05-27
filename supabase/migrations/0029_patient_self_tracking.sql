-- 0029 — Patient Workspace: self-tracking foundation.
--
-- Per docs/patient-workspace-gate-a-proposal.md (signed off 2026-05-27).
--
-- Additive only. Three new tables, all patient-owned:
--   1. personal_health_logs       (single table, kind discriminator)
--   2. self_medications           (patient-managed med list)
--   3. self_medication_takes      (confirmed-taken events; adherence)
--
-- All three are "personal until elevated":
--   - Patient owns row (patient_user_id = auth.uid()).
--   - Patient SELECT / INSERT / UPDATE / DELETE on own rows.
--   - No clinician policy yet — that lands when the clinical module
--     ships `clinical_observations` and a care-relationship table; this
--     migration deliberately stops at the patient boundary.
--   - sa_audit_log is god-mode only; we attach the existing
--     audit_log_changes() trigger so every row mutation lands in the
--     per-tenant ledger.
--
-- Reuses (no schema delta):
--   - patient_profiles.primary_facility_id IS the care-relationship
--     intent (kickoff Q3). Patient picks a hospital → UPDATE on that
--     column. No new table needed.


-- ─── 1. personal_health_logs ─────────────────────────────────────────
CREATE TABLE public.personal_health_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  kind text NOT NULL,
    -- glucose | bp | weight | spo2 | temperature | symptom | note | other
  recorded_at timestamptz NOT NULL DEFAULT now(),

  -- Two numeric slots cover every shape we need today:
  --   glucose / weight / spo2 / temperature → slot 1
  --   bp                                    → slot 1 (systolic) + slot 2 (diastolic)
  numeric_value_1 numeric,
  numeric_value_2 numeric,
  unit text,        -- 'mg/dL', 'mmol/L', 'kg', 'lb', '%', '°C', '°F', 'mmHg'

  severity smallint,  -- 1..5 for symptoms (optional)
  note text,          -- free text on any kind

  state text NOT NULL DEFAULT 'active',  -- active | deleted (soft delete)

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT personal_health_logs_kind_check CHECK (
    kind IN ('glucose','bp','weight','spo2','temperature','symptom','note','other')
  ),
  CONSTRAINT personal_health_logs_state_check CHECK (state IN ('active','deleted')),
  CONSTRAINT personal_health_logs_severity_range CHECK (
    severity IS NULL OR severity BETWEEN 1 AND 5
  )
);
CREATE INDEX personal_health_logs_patient_kind_idx
  ON public.personal_health_logs (patient_user_id, kind, recorded_at DESC);
CREATE INDEX personal_health_logs_patient_recent_idx
  ON public.personal_health_logs (patient_user_id, recorded_at DESC)
  WHERE state = 'active';

ALTER TABLE public.personal_health_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.personal_health_logs FORCE ROW LEVEL SECURITY;

-- Patient owns + manages own rows. No clinician access from this table
-- yet (kickoff §3.4 — boundary is explicit). Superadmin can SELECT for
-- support but not write.
CREATE POLICY personal_health_logs_select_own ON public.personal_health_logs
  FOR SELECT TO authenticated
  USING (
    patient_user_id = auth.uid()
    OR public.user_has_role('superadmin')
  );

CREATE POLICY personal_health_logs_insert_own ON public.personal_health_logs
  FOR INSERT TO authenticated
  WITH CHECK (patient_user_id = auth.uid());

CREATE POLICY personal_health_logs_update_own ON public.personal_health_logs
  FOR UPDATE TO authenticated
  USING (patient_user_id = auth.uid())
  WITH CHECK (patient_user_id = auth.uid());

CREATE POLICY personal_health_logs_delete_own ON public.personal_health_logs
  FOR DELETE TO authenticated
  USING (patient_user_id = auth.uid());

DROP TRIGGER IF EXISTS personal_health_logs_updated_at ON public.personal_health_logs;
CREATE TRIGGER personal_health_logs_updated_at
  BEFORE UPDATE ON public.personal_health_logs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS audit_personal_health_logs ON public.personal_health_logs;
CREATE TRIGGER audit_personal_health_logs
  AFTER INSERT OR UPDATE OR DELETE ON public.personal_health_logs
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_changes();


-- ─── 2. self_medications ─────────────────────────────────────────────
CREATE TABLE public.self_medications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  name text NOT NULL,           -- "Metformin"
  dose text,                    -- "500 mg"
  instructions text,            -- "with food"

  schedule_pattern text NOT NULL DEFAULT 'as_needed',
    -- as_needed | once_daily | twice_daily | thrice_daily | custom
  schedule_times time[],        -- reminder times, interpreted local-to-patient

  started_on date,
  ended_on date,

  state text NOT NULL DEFAULT 'active',  -- active | paused | ended
  notes text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT self_medications_state_check CHECK (state IN ('active','paused','ended')),
  CONSTRAINT self_medications_schedule_pattern_check CHECK (
    schedule_pattern IN ('as_needed','once_daily','twice_daily','thrice_daily','custom')
  )
);
CREATE INDEX self_medications_patient_idx
  ON public.self_medications (patient_user_id, state);

ALTER TABLE public.self_medications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.self_medications FORCE ROW LEVEL SECURITY;

CREATE POLICY self_medications_select_own ON public.self_medications
  FOR SELECT TO authenticated
  USING (
    patient_user_id = auth.uid()
    OR public.user_has_role('superadmin')
  );

CREATE POLICY self_medications_insert_own ON public.self_medications
  FOR INSERT TO authenticated
  WITH CHECK (patient_user_id = auth.uid());

CREATE POLICY self_medications_update_own ON public.self_medications
  FOR UPDATE TO authenticated
  USING (patient_user_id = auth.uid())
  WITH CHECK (patient_user_id = auth.uid());

CREATE POLICY self_medications_delete_own ON public.self_medications
  FOR DELETE TO authenticated
  USING (patient_user_id = auth.uid());

DROP TRIGGER IF EXISTS self_medications_updated_at ON public.self_medications;
CREATE TRIGGER self_medications_updated_at
  BEFORE UPDATE ON public.self_medications
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS audit_self_medications ON public.self_medications;
CREATE TRIGGER audit_self_medications
  AFTER INSERT OR UPDATE OR DELETE ON public.self_medications
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_changes();


-- ─── 3. self_medication_takes ────────────────────────────────────────
-- A confirmed-taken event. We compute today's doses + adherence from
-- (self_medications.schedule_times) JOIN (this table on the same day).
-- No separate generated-schedule table, no batch job.
CREATE TABLE public.self_medication_takes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  medication_id uuid NOT NULL REFERENCES public.self_medications(id) ON DELETE CASCADE,
  patient_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  scheduled_for timestamptz,    -- null for as-needed
  taken_at timestamptz NOT NULL DEFAULT now(),
  note text,

  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX self_medication_takes_patient_taken_idx
  ON public.self_medication_takes (patient_user_id, taken_at DESC);
CREATE INDEX self_medication_takes_med_idx
  ON public.self_medication_takes (medication_id, taken_at DESC);

ALTER TABLE public.self_medication_takes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.self_medication_takes FORCE ROW LEVEL SECURITY;

CREATE POLICY self_medication_takes_select_own ON public.self_medication_takes
  FOR SELECT TO authenticated
  USING (
    patient_user_id = auth.uid()
    OR public.user_has_role('superadmin')
  );

CREATE POLICY self_medication_takes_insert_own ON public.self_medication_takes
  FOR INSERT TO authenticated
  WITH CHECK (patient_user_id = auth.uid());

CREATE POLICY self_medication_takes_update_own ON public.self_medication_takes
  FOR UPDATE TO authenticated
  USING (patient_user_id = auth.uid())
  WITH CHECK (patient_user_id = auth.uid());

CREATE POLICY self_medication_takes_delete_own ON public.self_medication_takes
  FOR DELETE TO authenticated
  USING (patient_user_id = auth.uid());

DROP TRIGGER IF EXISTS audit_self_medication_takes ON public.self_medication_takes;
CREATE TRIGGER audit_self_medication_takes
  AFTER INSERT OR UPDATE OR DELETE ON public.self_medication_takes
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_changes();
