-- 0088 — Prescriptions from the Plan: how it is given, its problem, its edits and its answered
-- checks; fluids; a held admission medicine; the MAR's link to the prescription.
--
-- Per docs/emr/clerking-v2/plan/PROMPT-CLERKING-PLAN.md Phase 2 and ADR 0186.
--
-- ADDITIVE. No row changed; 0039's and 0074's columns, CHECKs and policies keep their meaning.
--   1. prescriptions + method, infusion_over, diluent, prn, regimen_id, edits, condition_id (the
--      problem: a conditions version id, as encounter_orders.reason_condition_ids), start, kind,
--      the fluid columns (purpose, volume, time, giving set, warmed) and check_answers.
--      Course is 0074's `duration`; it is not duplicated.
--   2. medication_statements.reconciliation gains 'held', which needs a reason as 'stopped' does
--   3. medication_administration_records + emr_prescription_id, a real foreign key to
--      prescriptions. The 0031 `prescription_id` stays: it holds free text that cannot be cast.
--
-- Re-runnable: ADD COLUMN IF NOT EXISTS, DROP-then-ADD for constraints, IF NOT EXISTS for indexes.
--
-- GATED: owner-applied (`npm run db:migrate`), after 0074 and 0087. Apply before deploying the
-- branch that carries it: the Drizzle schema names these columns. Until it runs,
-- CLERKING_PLAN_V2 stays off.


-- ─── 1. prescriptions ────────────────────────────────────────────────
ALTER TABLE public.prescriptions
  ADD COLUMN IF NOT EXISTS method text,
  ADD COLUMN IF NOT EXISTS infusion_over text,
  ADD COLUMN IF NOT EXISTS diluent text,
  ADD COLUMN IF NOT EXISTS prn boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS regimen_id text,
  ADD COLUMN IF NOT EXISTS edits jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS condition_id uuid
    REFERENCES public.conditions(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS start text,
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'drug',
  ADD COLUMN IF NOT EXISTS fluid_purpose text,
  ADD COLUMN IF NOT EXISTS volume_ml numeric,
  ADD COLUMN IF NOT EXISTS over_minutes integer,
  ADD COLUMN IF NOT EXISTS giving_set_drops_per_ml integer,
  ADD COLUMN IF NOT EXISTS warmed boolean,
  ADD COLUMN IF NOT EXISTS check_answers jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.prescriptions DROP CONSTRAINT IF EXISTS prescriptions_start_check;
ALTER TABLE public.prescriptions ADD CONSTRAINT prescriptions_start_check
  CHECK (start IS NULL OR start IN ('now','next_round'));
ALTER TABLE public.prescriptions DROP CONSTRAINT IF EXISTS prescriptions_kind_check;
ALTER TABLE public.prescriptions ADD CONSTRAINT prescriptions_kind_check
  CHECK (kind IN ('drug','fluid'));
ALTER TABLE public.prescriptions DROP CONSTRAINT IF EXISTS prescriptions_fluid_purpose_check;
ALTER TABLE public.prescriptions ADD CONSTRAINT prescriptions_fluid_purpose_check
  CHECK (fluid_purpose IS NULL OR fluid_purpose IN ('bolus','maintenance','replacement'));
ALTER TABLE public.prescriptions DROP CONSTRAINT IF EXISTS prescriptions_giving_set_check;
ALTER TABLE public.prescriptions ADD CONSTRAINT prescriptions_giving_set_check
  CHECK (giving_set_drops_per_ml IS NULL OR giving_set_drops_per_ml IN (20, 60));
ALTER TABLE public.prescriptions DROP CONSTRAINT IF EXISTS prescriptions_fluid_amounts;
ALTER TABLE public.prescriptions ADD CONSTRAINT prescriptions_fluid_amounts
  CHECK ((volume_ml IS NULL OR volume_ml > 0) AND (over_minutes IS NULL OR over_minutes > 0));
-- A fluid names its purpose, volume and time; a drug carries none of them.
ALTER TABLE public.prescriptions DROP CONSTRAINT IF EXISTS prescriptions_fluid_shape;
ALTER TABLE public.prescriptions ADD CONSTRAINT prescriptions_fluid_shape
  CHECK ((kind = 'fluid' AND fluid_purpose IS NOT NULL AND volume_ml IS NOT NULL AND over_minutes IS NOT NULL)
      OR (kind = 'drug' AND fluid_purpose IS NULL AND volume_ml IS NULL AND over_minutes IS NULL
          AND giving_set_drops_per_ml IS NULL AND warmed IS NULL));
-- An answered check is never a silent pass: its reason is on the row (0074's rule, for answers).
ALTER TABLE public.prescriptions DROP CONSTRAINT IF EXISTS prescriptions_answer_reason;
ALTER TABLE public.prescriptions ADD CONSTRAINT prescriptions_answer_reason
  CHECK (check_answers = '[]'::jsonb OR confirm_reason_ciphertext IS NOT NULL);

CREATE INDEX IF NOT EXISTS prescriptions_condition_idx
  ON public.prescriptions (condition_id) WHERE condition_id IS NOT NULL;


-- ─── 2. a held admission medicine needs a reason ─────────────────────
ALTER TABLE public.medication_statements DROP CONSTRAINT IF EXISTS medication_statements_reconciliation_check;
ALTER TABLE public.medication_statements ADD CONSTRAINT medication_statements_reconciliation_check
  CHECK (reconciliation IS NULL OR reconciliation IN ('continued','stopped','changed','held'));
ALTER TABLE public.medication_statements DROP CONSTRAINT IF EXISTS ms_hold_reason;
ALTER TABLE public.medication_statements ADD CONSTRAINT ms_hold_reason
  CHECK (reconciliation IS DISTINCT FROM 'held' OR reason_code IS NOT NULL OR reason_ciphertext IS NOT NULL);


-- ─── 3. the MAR points at the prescription ───────────────────────────
ALTER TABLE public.medication_administration_records
  ADD COLUMN IF NOT EXISTS emr_prescription_id uuid
    REFERENCES public.prescriptions(id) ON DELETE RESTRICT;
CREATE INDEX IF NOT EXISTS mar_emr_prescription_idx
  ON public.medication_administration_records (emr_prescription_id, scheduled_for)
  WHERE emr_prescription_id IS NOT NULL;
