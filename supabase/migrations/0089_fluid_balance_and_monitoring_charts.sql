-- 0089 — Fluid balance entries and the monitoring-chart registry.
--
-- Per docs/emr/clerking-v2/plan/MONITORING-CHARTS.md §5 and ADR 0189.
--
-- ADDITIVE. Two new tables, no row changed.
--   1. fluid_balance_entries: append-only. One row per volume in or out, for the hour it happened
--      (effective_at). "Not measured" urine is a row with measured = false and no volume, never 0.
--      A correction is a new row that names the one it replaces (replaces_id, at most once);
--      entered in error is a new row with no volume and a reason.
--   2. monitoring_charts: the charts the plan opened, each with opened_by (a pointer to the plan
--      item, in words and ids), its frequency, and when it closed. One open chart per kind per visit.
--      Closing and a changed frequency are updates, kept by the audit trigger; a row is never deleted.
--   3. both: RLS forced, the clinical reader's scoped SELECT, writes revoked from anon and
--      authenticated (the server writes as the owner, as every EMR table), audit triggers.
--
-- Re-runnable: CREATE TABLE / INDEX IF NOT EXISTS, DROP-then-CREATE for triggers and policies.
--
-- GATED: owner-applied (`npm run db:migrate`), after 0088 (entries point at prescriptions).
-- Until it runs, CLERKING_PLAN_V2 stays off.


-- ─── 1. fluid_balance_entries ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.fluid_balance_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  patient_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  encounter_id uuid NOT NULL REFERENCES public.encounters(id) ON DELETE RESTRICT,
  kind text NOT NULL,
  -- oral_in: oral | ng; other_out: vomit | drain | stool | other
  route_detail text,
  volume_ml numeric,
  measured boolean NOT NULL DEFAULT true,
  prescription_id uuid REFERENCES public.prescriptions(id) ON DELETE RESTRICT,
  effective_at timestamptz NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  recorded_by_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  state text NOT NULL DEFAULT 'recorded',
  replaces_id uuid REFERENCES public.fluid_balance_entries(id) ON DELETE RESTRICT,
  reason_code text,
  client_key text,
  CONSTRAINT fbe_kind_check CHECK (kind IN ('iv_in','oral_in','urine_out','other_out')),
  CONSTRAINT fbe_state_check CHECK (state IN ('recorded','entered_in_error')),
  CONSTRAINT fbe_route_detail_check CHECK (route_detail IS NULL OR route_detail IN
    ('oral','ng','vomit','drain','stool','other')),
  CONSTRAINT fbe_volume CHECK (volume_ml IS NULL OR volume_ml >= 0),
  -- A recorded entry has a volume, except urine stated as not measured.
  CONSTRAINT fbe_measured CHECK (state = 'entered_in_error'
    OR (measured AND volume_ml IS NOT NULL)
    OR (NOT measured AND volume_ml IS NULL AND kind = 'urine_out')),
  -- Entered in error withdraws the entry it names, carries no volume, and says why.
  CONSTRAINT fbe_entered_in_error CHECK (state <> 'entered_in_error'
    OR (replaces_id IS NOT NULL AND volume_ml IS NULL AND reason_code IS NOT NULL)),
  -- IV in is the only kind tied to a prescription.
  CONSTRAINT fbe_prescription_kind CHECK (prescription_id IS NULL OR kind = 'iv_in'));
CREATE INDEX IF NOT EXISTS fluid_balance_entries_encounter_time
  ON public.fluid_balance_entries (encounter_id, effective_at);
CREATE UNIQUE INDEX IF NOT EXISTS fluid_balance_entries_replaces
  ON public.fluid_balance_entries (replaces_id) WHERE replaces_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS fluid_balance_entries_client_key
  ON public.fluid_balance_entries (client_key) WHERE client_key IS NOT NULL;
DROP TRIGGER IF EXISTS fluid_balance_entries_no_mutation ON public.fluid_balance_entries;
CREATE TRIGGER fluid_balance_entries_no_mutation BEFORE UPDATE OR DELETE ON public.fluid_balance_entries
  FOR EACH ROW EXECUTE FUNCTION public.block_modify_append_only();
DROP TRIGGER IF EXISTS audit_fluid_balance_entries ON public.fluid_balance_entries;
CREATE TRIGGER audit_fluid_balance_entries AFTER INSERT OR UPDATE OR DELETE ON public.fluid_balance_entries
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_changes();


-- ─── 2. monitoring_charts ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.monitoring_charts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  patient_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  encounter_id uuid NOT NULL REFERENCES public.encounters(id) ON DELETE RESTRICT,
  kind text NOT NULL,
  -- {rule, label, items: [{type, id}]}: the rule that fired and the plan item(s) behind it.
  opened_by jsonb NOT NULL,
  frequency text,
  measure_urine boolean NOT NULL DEFAULT false,
  opened_at timestamptz NOT NULL DEFAULT now(),
  opened_by_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  closed_at timestamptz,
  closed_by_user_id uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  close_reason_code text,
  client_key text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT mc_kind_check CHECK (kind IN ('observations','temperature','fluid_balance','glucose','mar')),
  CONSTRAINT mc_frequency_check CHECK (frequency IS NULL OR frequency IN
    ('continuous','hourly','4h','6h','12h','daily','with_observations')),
  CONSTRAINT mc_opened_by_shape CHECK (jsonb_typeof(opened_by) = 'object' AND opened_by ? 'rule'),
  CONSTRAINT mc_closed CHECK ((closed_at IS NULL) = (closed_by_user_id IS NULL)));
CREATE UNIQUE INDEX IF NOT EXISTS monitoring_charts_one_open
  ON public.monitoring_charts (encounter_id, kind) WHERE closed_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS monitoring_charts_client_key
  ON public.monitoring_charts (client_key) WHERE client_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS monitoring_charts_patient
  ON public.monitoring_charts (patient_user_id, opened_at DESC);
DROP TRIGGER IF EXISTS monitoring_charts_no_delete ON public.monitoring_charts;
CREATE TRIGGER monitoring_charts_no_delete BEFORE DELETE ON public.monitoring_charts
  FOR EACH ROW EXECUTE FUNCTION public.block_modify_append_only();
DROP TRIGGER IF EXISTS monitoring_charts_updated_at ON public.monitoring_charts;
CREATE TRIGGER monitoring_charts_updated_at BEFORE UPDATE ON public.monitoring_charts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS audit_monitoring_charts ON public.monitoring_charts;
CREATE TRIGGER audit_monitoring_charts AFTER INSERT OR UPDATE OR DELETE ON public.monitoring_charts
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_changes();


-- ─── 3. RLS: the clinical reader, scoped; no client writes ──────────
ALTER TABLE public.fluid_balance_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fluid_balance_entries FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS fluid_balance_entries_select_clinical ON public.fluid_balance_entries;
CREATE POLICY fluid_balance_entries_select_clinical ON public.fluid_balance_entries FOR SELECT TO medsync_clinical_reader
  USING (hospital_id = (SELECT private.current_hospital_id())
         AND patient_user_id IN (SELECT private.accessible_patient_ids()));
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.fluid_balance_entries FROM anon, authenticated;
GRANT SELECT ON public.fluid_balance_entries TO medsync_clinical_reader;

ALTER TABLE public.monitoring_charts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.monitoring_charts FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS monitoring_charts_select_clinical ON public.monitoring_charts;
CREATE POLICY monitoring_charts_select_clinical ON public.monitoring_charts FOR SELECT TO medsync_clinical_reader
  USING (hospital_id = (SELECT private.current_hospital_id())
         AND patient_user_id IN (SELECT private.accessible_patient_ids()));
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.monitoring_charts FROM anon, authenticated;
GRANT SELECT ON public.monitoring_charts TO medsync_clinical_reader;
