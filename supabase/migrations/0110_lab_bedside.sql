-- 0110 — Bedside tests: registered devices and kits, lots with use-by dates, operators, and the device and
-- lot on each bedside report (Lab Phase 2, ADR 0259; PC-*, D-LAB2-09..-13).
--
-- Reuses 0071's `devices` (never written until now): a device or kit starts "not verified" and is moved to
-- "in use" by the laboratory lead with a recorded verification (PC-10). A report is a bedside report when it
-- carries a device (P11). No reading or meter limit is set here. ADDITIVE and re-runnable.
-- GATED: owner-applied (`npm run db:migrate -- 0110`).

ALTER TABLE public.devices DROP CONSTRAINT IF EXISTS devices_kind_check;
ALTER TABLE public.devices ADD CONSTRAINT devices_kind_check
  CHECK (kind IN ('glucometer','ketone_meter','hba1c_analyser','bp_monitor','rdt_kit','dipstick'));
ALTER TABLE public.devices
  ADD COLUMN IF NOT EXISTS test_code text,
  ADD COLUMN IF NOT EXISTS ward_id uuid,
  ADD COLUMN IF NOT EXISTS state text NOT NULL DEFAULT 'not_verified'
    CHECK (state IN ('not_verified','in_use','retired')),
  ADD COLUMN IF NOT EXISTS verified_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS verification_note text
    CHECK (verification_note IS NULL OR char_length(verification_note) BETWEEN 3 AND 300);
ALTER TABLE public.devices DROP CONSTRAINT IF EXISTS devices_verified;
ALTER TABLE public.devices ADD CONSTRAINT devices_verified
  CHECK (state <> 'in_use' OR (verified_by IS NOT NULL AND verified_at IS NOT NULL AND verification_note IS NOT NULL));

CREATE TABLE IF NOT EXISTS public.poct_lots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  device_id uuid NOT NULL REFERENCES public.devices(id) ON DELETE RESTRICT,
  lot text NOT NULL CHECK (char_length(lot) BETWEEN 1 AND 60),
  use_by date NOT NULL,
  added_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  added_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (device_id, lot)
);

CREATE TABLE IF NOT EXISTS public.poct_operators (
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  granted_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  granted_at timestamptz NOT NULL DEFAULT now(),
  revoked_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  revoked_at timestamptz,
  PRIMARY KEY (hospital_id, user_id, granted_at)
);
CREATE UNIQUE INDEX IF NOT EXISTS poct_operators_live ON public.poct_operators (hospital_id, user_id) WHERE revoked_at IS NULL;

ALTER TABLE public.diagnostic_reports
  ADD COLUMN IF NOT EXISTS device_id uuid REFERENCES public.devices(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS lot_id uuid REFERENCES public.poct_lots(id) ON DELETE RESTRICT;
ALTER TABLE public.diagnostic_reports DROP CONSTRAINT IF EXISTS dr_bedside_lot;
ALTER TABLE public.diagnostic_reports ADD CONSTRAINT dr_bedside_lot CHECK ((device_id IS NULL) = (lot_id IS NULL));

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['poct_lots','poct_operators'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS audit_%1$s ON public.%1$I', t);
    EXECUTE format('CREATE TRIGGER audit_%1$s AFTER INSERT OR UPDATE OR DELETE ON public.%1$I
      FOR EACH ROW EXECUTE FUNCTION public.audit_log_changes()', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.%I FROM anon, authenticated', t);
    EXECUTE format('GRANT SELECT ON public.%I TO medsync_clinical_reader', t);
  END LOOP;
END $$;
DROP TRIGGER IF EXISTS poct_lots_no_mutation ON public.poct_lots;
CREATE TRIGGER poct_lots_no_mutation BEFORE UPDATE OR DELETE ON public.poct_lots
  FOR EACH ROW EXECUTE FUNCTION public.block_modify_append_only();
DROP POLICY IF EXISTS pl_select ON public.poct_lots;
CREATE POLICY pl_select ON public.poct_lots FOR SELECT TO medsync_clinical_reader
  USING (hospital_id = (SELECT private.current_hospital_id()));
DROP POLICY IF EXISTS po_select ON public.poct_operators;
CREATE POLICY po_select ON public.poct_operators FOR SELECT TO medsync_clinical_reader
  USING (hospital_id = (SELECT private.current_hospital_id()));

-- A bedside test is an order fulfilled at the bedside by its operator (PC-1): its own intent source, so it
-- never reaches the cashier and never needs a printed label.
ALTER TABLE public.encounter_orders DROP CONSTRAINT IF EXISTS enc_order_intent_check;
ALTER TABLE public.encounter_orders ADD CONSTRAINT enc_order_intent_check CHECK (intent_source IS NULL OR intent_source IN
  ('clinician','triage_recommendation','resus_handover','downtime_form','bedside'));
