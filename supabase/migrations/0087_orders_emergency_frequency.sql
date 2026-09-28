-- 0087 — Test priority Emergency, and how often a routine test is repeated.
--
-- Per docs/emr/clerking-v2/plan/PROMPT-CLERKING-PLAN.md Phase 2 and ADR 0185.
--
-- ADDITIVE. No row changed.
--   1. enc_order_priority_check gains 'emergency' (routine | urgent | immediate | emergency)
--   2. encounter_orders.frequency: once | daily | 12h | 6h; NULL on every row stored before this
--   3. a routine order needs a frequency. Enforced on INSERT by a trigger, not by a CHECK: a CHECK
--      would refuse to validate against the routine rows already stored without one, and would bind
--      every later UPDATE of a legacy row.
--
-- Re-runnable: ADD COLUMN IF NOT EXISTS, DROP-then-ADD for the constraints and the trigger,
-- CREATE OR REPLACE for the function.
--
-- GATED: owner-applied (`npm run db:migrate`), after 0071. Apply before deploying the branch that
-- carries it: the Drizzle schema names encounter_orders.frequency. Until it runs, CLERKING_PLAN_V2
-- stays off.


-- ─── 1. Emergency ────────────────────────────────────────────────────
ALTER TABLE public.encounter_orders DROP CONSTRAINT IF EXISTS enc_order_priority_check;
ALTER TABLE public.encounter_orders ADD CONSTRAINT enc_order_priority_check
  CHECK (priority IS NULL OR priority IN ('routine','urgent','immediate','emergency'));


-- ─── 2. How often ────────────────────────────────────────────────────
ALTER TABLE public.encounter_orders ADD COLUMN IF NOT EXISTS frequency text;
ALTER TABLE public.encounter_orders DROP CONSTRAINT IF EXISTS enc_order_frequency_check;
ALTER TABLE public.encounter_orders ADD CONSTRAINT enc_order_frequency_check
  CHECK (frequency IS NULL OR frequency IN ('once','daily','12h','6h'));


-- ─── 3. A routine order names its frequency (new rows only) ─────────
CREATE OR REPLACE FUNCTION private.encounter_orders_routine_frequency() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  IF NEW.priority = 'routine' AND NEW.frequency IS NULL THEN
    RAISE EXCEPTION 'encounter_orders: a routine order needs a frequency (once, daily, 12h or 6h)'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS encounter_orders_routine_frequency ON public.encounter_orders;
CREATE TRIGGER encounter_orders_routine_frequency BEFORE INSERT ON public.encounter_orders
  FOR EACH ROW EXECUTE FUNCTION private.encounter_orders_routine_frequency();
