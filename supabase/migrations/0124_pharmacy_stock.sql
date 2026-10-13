-- 0124 — The stock ledger (Pharmacy Phase 1, SL-1 to SL-11; gate-a-proposal §5, §8, §10).
--
-- GATED: owner-applied (`npm run db:migrate`), after 0123.
--
--   1. pharmacy_batches: a product, a batch number and an expiry, at one point (SL-3). The number and
--      expiry change only with a pharmacy_batch_corrections row in the same transaction (SL-11); the
--      values first recorded are kept beside them for ever.
--   2. pharmacy_stock_movements: the ledger, append-only (SL-1). A balance is the sum of a batch's
--      movements (SL-2). Before each movement the guard locks the batch row and refuses a live one that
--      would take the batch below zero, or a live supply from an expired batch (SL-4, SL-5). A movement
--      entered after downtime (`downtime = true`) is let through and marks the batch for a count (DT-7).
--   3. Counts (blind; SL-6), reorder levels (D-PH1-23), requests between points (SL-7), batch corrections
--      (SL-11), and the stock-out projection kept by trigger (SL-9).
--   4. A product's issue unit locks once any of its batches has a movement (CT-4).
--
-- ADDITIVE and re-runnable. No client grants. Hospital-local date: Africa/Kampala.

CREATE OR REPLACE FUNCTION private.pharmacy_local_date() RETURNS date
LANGUAGE sql STABLE SET search_path = pg_catalog AS $$
  SELECT (now() AT TIME ZONE 'Africa/Kampala')::date;
$$;

-- An expiry given as a month runs to the end of that month (SL-5).
CREATE OR REPLACE FUNCTION private.pharmacy_expires_on(p_expiry date, p_month_only boolean) RETURNS date
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog AS $$
  SELECT CASE WHEN p_month_only THEN (date_trunc('month', p_expiry) + interval '1 month - 1 day')::date
              ELSE p_expiry END;
$$;

-- ─── 1. Batches ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pharmacy_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  dispensing_point_id uuid NOT NULL REFERENCES public.pharmacy_dispensing_points(department_id) ON DELETE RESTRICT,
  product_id uuid NOT NULL REFERENCES public.pharmacy_products(id) ON DELETE RESTRICT,
  batch_number text NOT NULL CHECK (char_length(batch_number) BETWEEN 1 AND 60),
  expiry date NOT NULL,
  expiry_month_only boolean NOT NULL DEFAULT false,
  first_batch_number text NOT NULL,
  first_expiry date NOT NULL,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (dispensing_point_id, product_id, batch_number)
);
CREATE INDEX IF NOT EXISTS pharmacy_batches_product ON public.pharmacy_batches (dispensing_point_id, product_id);

-- ─── 2. The ledger ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pharmacy_stock_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  dispensing_point_id uuid NOT NULL REFERENCES public.pharmacy_dispensing_points(department_id) ON DELETE RESTRICT,
  batch_id uuid NOT NULL REFERENCES public.pharmacy_batches(id) ON DELETE RESTRICT,
  kind text NOT NULL CHECK (kind IN ('received','supplied','reversed','adjusted','count_correction',
    'transfer_out','transfer_in')),
  quantity integer NOT NULL CHECK (quantity <> 0),
  effective_at timestamptz NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  actor_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  reason_code text CHECK (reason_code IS NULL OR char_length(reason_code) BETWEEN 2 AND 60),
  reason_note text CHECK (reason_note IS NULL OR char_length(reason_note) <= 500),
  source_kind text NOT NULL CHECK (source_kind IN ('delivery','supply','reversal','count','adjustment','transfer',
    'found_on_shelf','downtime')),
  source_id uuid,
  delivery_from text CHECK (delivery_from IS NULL OR delivery_from IN ('main_store','supplier','borrowed','ward_return')),
  delivery_ref text CHECK (delivery_ref IS NULL OR char_length(delivery_ref) <= 120),
  witness_attestation_id uuid REFERENCES public.pharmacy_attestations(id) ON DELETE RESTRICT,
  downtime boolean NOT NULL DEFAULT false,
  CONSTRAINT psm_sign CHECK (
    (kind IN ('received','reversed','transfer_in') AND quantity > 0)
    OR (kind IN ('supplied','transfer_out') AND quantity < 0)
    OR kind IN ('adjusted','count_correction')),
  CONSTRAINT psm_reason CHECK (kind NOT IN ('adjusted','count_correction') OR reason_code IS NOT NULL),
  CONSTRAINT psm_effective CHECK (effective_at <= recorded_at + interval '5 minutes')
);
CREATE INDEX IF NOT EXISTS psm_batch ON public.pharmacy_stock_movements (batch_id, recorded_at);
CREATE INDEX IF NOT EXISTS psm_point_day ON public.pharmacy_stock_movements (dispensing_point_id, effective_at);

DROP TRIGGER IF EXISTS psm_append_only ON public.pharmacy_stock_movements;
CREATE TRIGGER psm_append_only BEFORE UPDATE OR DELETE ON public.pharmacy_stock_movements
  FOR EACH ROW EXECUTE FUNCTION public.block_modify_append_only();

-- SL-4, SL-5: the guard. The batch row lock serialises every movement on one batch, whoever writes it.
CREATE OR REPLACE FUNCTION private.pharmacy_movement_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE
  _b public.pharmacy_batches;
  _balance bigint;
BEGIN
  SELECT * INTO _b FROM public.pharmacy_batches WHERE id = NEW.batch_id FOR UPDATE;
  IF _b.dispensing_point_id <> NEW.dispensing_point_id OR _b.hospital_id <> NEW.hospital_id THEN
    RAISE EXCEPTION 'pharmacy_stock: batch % is not at this point', NEW.batch_id;
  END IF;
  IF NEW.downtime THEN RETURN NEW; END IF;
  IF NEW.kind = 'supplied'
     AND private.pharmacy_expires_on(_b.expiry, _b.expiry_month_only) < private.pharmacy_local_date() THEN
    RAISE EXCEPTION 'pharmacy_stock: batch % expired on %', _b.batch_number,
      private.pharmacy_expires_on(_b.expiry, _b.expiry_month_only) USING ERRCODE = 'P0001', HINT = 'expired';
  END IF;
  SELECT coalesce(sum(quantity), 0) INTO _balance FROM public.pharmacy_stock_movements WHERE batch_id = NEW.batch_id;
  IF _balance + NEW.quantity < 0 THEN
    RAISE EXCEPTION 'pharmacy_stock: batch % holds %', _b.batch_number, _balance
      USING ERRCODE = 'P0001', HINT = 'below_zero';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS psm_guard ON public.pharmacy_stock_movements;
CREATE TRIGGER psm_guard BEFORE INSERT ON public.pharmacy_stock_movements
  FOR EACH ROW EXECUTE FUNCTION private.pharmacy_movement_guard();

-- Batches: only number and expiry change, and only beside a correction (SL-11). Never deleted.
CREATE OR REPLACE FUNCTION private.pharmacy_batch_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'pharmacy_batches: a batch is never deleted'; END IF;
  IF NEW.id <> OLD.id OR NEW.hospital_id <> OLD.hospital_id OR NEW.dispensing_point_id <> OLD.dispensing_point_id
     OR NEW.product_id <> OLD.product_id OR NEW.first_batch_number <> OLD.first_batch_number
     OR NEW.first_expiry <> OLD.first_expiry OR NEW.created_by <> OLD.created_by OR NEW.created_at <> OLD.created_at THEN
    RAISE EXCEPTION 'pharmacy_batches: only the batch number and expiry are corrected';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.pharmacy_batch_corrections c
                  WHERE c.batch_id = NEW.id AND c.new_batch_number = NEW.batch_number
                    AND c.new_expiry = NEW.expiry AND c.corrected_at = now()) THEN
    RAISE EXCEPTION 'pharmacy_batches: a correction is recorded first (SL-11)';
  END IF;
  RETURN NEW;
END;
$$;

-- CT-4: the issue unit locks once a batch of the product has a movement.
CREATE OR REPLACE FUNCTION private.pharmacy_product_unit_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'pharmacy_products: a product is ended, never deleted'; END IF;
  IF NEW.issue_unit IS DISTINCT FROM OLD.issue_unit AND EXISTS (
       SELECT 1 FROM public.pharmacy_stock_movements m JOIN public.pharmacy_batches b ON b.id = m.batch_id
        WHERE b.product_id = OLD.id) THEN
    RAISE EXCEPTION 'pharmacy_products: the issue unit is fixed once stock has moved; add a new product';
  END IF;
  IF NEW.medicine_id IS DISTINCT FROM OLD.medicine_id OR NEW.hospital_id IS DISTINCT FROM OLD.hospital_id THEN
    RAISE EXCEPTION 'pharmacy_products: the medicine and hospital of a product never change';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS pharmacy_products_unit_guard ON public.pharmacy_products;
CREATE TRIGGER pharmacy_products_unit_guard BEFORE UPDATE OR DELETE ON public.pharmacy_products
  FOR EACH ROW EXECUTE FUNCTION private.pharmacy_product_unit_guard();

-- ─── 3. Counts, levels, requests, corrections, stock-outs ────────────────
CREATE TABLE IF NOT EXISTS public.pharmacy_counts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  dispensing_point_id uuid NOT NULL REFERENCES public.pharmacy_dispensing_points(department_id) ON DELETE RESTRICT,
  scope text NOT NULL CHECK (scope IN ('medicine','full','controlled_supply','controlled_shift')),
  medicine_id text,
  counted_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  witness_attestation_id uuid REFERENCES public.pharmacy_attestations(id) ON DELETE RESTRICT,
  counted_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pc_controlled_witness CHECK (scope NOT LIKE 'controlled%' OR witness_attestation_id IS NOT NULL)
);
CREATE TABLE IF NOT EXISTS public.pharmacy_count_lines (
  count_id uuid NOT NULL REFERENCES public.pharmacy_counts(id) ON DELETE RESTRICT,
  batch_id uuid NOT NULL REFERENCES public.pharmacy_batches(id) ON DELETE RESTRICT,
  counted_quantity integer NOT NULL CHECK (counted_quantity >= 0),
  -- Written with the line, read back only after the count is committed (blind count, SL-6, CD-3).
  recorded_balance integer NOT NULL,
  difference_reason text CHECK (difference_reason IS NULL OR char_length(difference_reason) BETWEEN 2 AND 60),
  difference_note text CHECK (difference_note IS NULL OR char_length(difference_note) <= 500),
  PRIMARY KEY (count_id, batch_id)
);

CREATE TABLE IF NOT EXISTS public.pharmacy_reorder_levels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  dispensing_point_id uuid NOT NULL REFERENCES public.pharmacy_dispensing_points(department_id) ON DELETE RESTRICT,
  medicine_id text NOT NULL,
  level integer CHECK (level IS NULL OR level >= 0),
  set_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  set_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS prl_current ON public.pharmacy_reorder_levels (dispensing_point_id, medicine_id, set_at DESC);

CREATE TABLE IF NOT EXISTS public.pharmacy_stock_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  from_point_id uuid NOT NULL REFERENCES public.pharmacy_dispensing_points(department_id) ON DELETE RESTRICT,
  to_point_id uuid NOT NULL REFERENCES public.pharmacy_dispensing_points(department_id) ON DELETE RESTRICT,
  medicine_id text NOT NULL,
  quantity integer CHECK (quantity IS NULL OR quantity > 0),
  prescription_id uuid REFERENCES public.prescriptions(id) ON DELETE RESTRICT,
  requested_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  requested_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  closed_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  close_reason text CHECK (close_reason IS NULL OR char_length(close_reason) BETWEEN 2 AND 200),
  transfer_movement_id uuid REFERENCES public.pharmacy_stock_movements(id) ON DELETE RESTRICT,
  CONSTRAINT psr_points CHECK (from_point_id <> to_point_id),
  CONSTRAINT psr_closed CHECK ((closed_at IS NULL) = (closed_by IS NULL)
    AND (closed_at IS NULL OR transfer_movement_id IS NOT NULL OR close_reason IS NOT NULL))
);
-- A request is closed once, and nothing else about it changes.
CREATE OR REPLACE FUNCTION private.pharmacy_request_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' OR OLD.closed_at IS NOT NULL THEN
    RAISE EXCEPTION 'pharmacy_stock_requests: a closed request never changes';
  END IF;
  IF (to_jsonb(NEW) - ARRAY['closed_at','closed_by','close_reason','transfer_movement_id'])
     IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['closed_at','closed_by','close_reason','transfer_movement_id']) THEN
    RAISE EXCEPTION 'pharmacy_stock_requests: only closing changes a request';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS psr_guard ON public.pharmacy_stock_requests;
CREATE TRIGGER psr_guard BEFORE UPDATE OR DELETE ON public.pharmacy_stock_requests
  FOR EACH ROW EXECUTE FUNCTION private.pharmacy_request_guard();

CREATE TABLE IF NOT EXISTS public.pharmacy_batch_corrections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES public.pharmacy_batches(id) ON DELETE RESTRICT,
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  old_batch_number text NOT NULL,
  new_batch_number text NOT NULL CHECK (char_length(new_batch_number) BETWEEN 1 AND 60),
  old_expiry date NOT NULL,
  new_expiry date NOT NULL,
  actor_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  reason text NOT NULL CHECK (char_length(reason) BETWEEN 3 AND 300),
  witness_attestation_id uuid REFERENCES public.pharmacy_attestations(id) ON DELETE RESTRICT,
  corrected_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pbc_changed CHECK (old_batch_number <> new_batch_number OR old_expiry <> new_expiry)
);
DROP TRIGGER IF EXISTS pharmacy_batches_guard ON public.pharmacy_batches;
CREATE TRIGGER pharmacy_batches_guard BEFORE UPDATE OR DELETE ON public.pharmacy_batches
  FOR EACH ROW EXECUTE FUNCTION private.pharmacy_batch_guard();

-- SL-9: the stock-out projection, kept by trigger in recorded order. A stock-out that begins only because
-- the last batch expired is derived when read (lib/pharmacy/stock), not here.
-- ponytail: recorded order, not effective order; back-entered movements are re-projected by
-- private.pharmacy_rebuild_stockouts when downtime entry lands (Step 8).
CREATE TABLE IF NOT EXISTS public.pharmacy_stockouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  dispensing_point_id uuid NOT NULL REFERENCES public.pharmacy_dispensing_points(department_id) ON DELETE RESTRICT,
  medicine_id text NOT NULL,
  started_at timestamptz NOT NULL,
  start_movement_id uuid REFERENCES public.pharmacy_stock_movements(id) ON DELETE RESTRICT,
  ended_at timestamptz,
  end_movement_id uuid REFERENCES public.pharmacy_stock_movements(id) ON DELETE RESTRICT
);
CREATE UNIQUE INDEX IF NOT EXISTS pso_one_open ON public.pharmacy_stockouts (dispensing_point_id, medicine_id)
  WHERE ended_at IS NULL;

CREATE OR REPLACE FUNCTION private.pharmacy_stockout_project() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE
  _medicine text;
  _total bigint;
BEGIN
  SELECT p.medicine_id INTO _medicine
    FROM public.pharmacy_batches b JOIN public.pharmacy_products p ON p.id = b.product_id WHERE b.id = NEW.batch_id;
  SELECT coalesce(sum(m.quantity), 0) INTO _total
    FROM public.pharmacy_stock_movements m
    JOIN public.pharmacy_batches b ON b.id = m.batch_id
    JOIN public.pharmacy_products p ON p.id = b.product_id
   WHERE m.dispensing_point_id = NEW.dispensing_point_id AND p.medicine_id = _medicine
     AND private.pharmacy_expires_on(b.expiry, b.expiry_month_only) >= private.pharmacy_local_date();
  IF _total <= 0 THEN
    INSERT INTO public.pharmacy_stockouts (hospital_id, dispensing_point_id, medicine_id, started_at, start_movement_id)
    VALUES (NEW.hospital_id, NEW.dispensing_point_id, _medicine, NEW.effective_at, NEW.id)
    ON CONFLICT (dispensing_point_id, medicine_id) WHERE ended_at IS NULL DO NOTHING;
  ELSE
    UPDATE public.pharmacy_stockouts SET ended_at = NEW.effective_at, end_movement_id = NEW.id
     WHERE dispensing_point_id = NEW.dispensing_point_id AND medicine_id = _medicine AND ended_at IS NULL;
  END IF;
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS psm_stockout ON public.pharmacy_stock_movements;
CREATE TRIGGER psm_stockout AFTER INSERT ON public.pharmacy_stock_movements
  FOR EACH ROW EXECUTE FUNCTION private.pharmacy_stockout_project();

-- Append-only event tables.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['pharmacy_counts','pharmacy_count_lines','pharmacy_reorder_levels',
    'pharmacy_batch_corrections'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %1$s_append_only ON public.%1$I', t);
    EXECUTE format('CREATE TRIGGER %1$s_append_only BEFORE UPDATE OR DELETE ON public.%1$I
      FOR EACH ROW EXECUTE FUNCTION public.block_modify_append_only()', t);
  END LOOP;
END $$;

-- ─── Grants, RLS, audit ─────────────────────────────────────────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['pharmacy_batches','pharmacy_stock_movements','pharmacy_counts','pharmacy_count_lines',
    'pharmacy_reorder_levels','pharmacy_stock_requests','pharmacy_batch_corrections','pharmacy_stockouts'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS audit_%1$s ON public.%1$I', t);
    EXECUTE format('CREATE TRIGGER audit_%1$s AFTER INSERT OR UPDATE OR DELETE ON public.%1$I
      FOR EACH ROW EXECUTE FUNCTION public.audit_log_changes()', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
    EXECUTE format('GRANT SELECT ON public.%I TO medsync_clinical_reader', t);
    EXECUTE format('DROP POLICY IF EXISTS %1$s_select ON public.%1$I', t);
    IF t = 'pharmacy_count_lines' THEN
      EXECUTE format('CREATE POLICY %1$s_select ON public.%1$I FOR SELECT TO medsync_clinical_reader
        USING (EXISTS (SELECT 1 FROM public.pharmacy_counts c WHERE c.id = count_id
                 AND c.hospital_id = (SELECT private.current_hospital_id()))
               AND (SELECT private.pharmacy_can(''pharmacy.view'')))', t);
    ELSE
      EXECUTE format('CREATE POLICY %1$s_select ON public.%1$I FOR SELECT TO medsync_clinical_reader
        USING (hospital_id = (SELECT private.current_hospital_id()) AND (SELECT private.pharmacy_can(''pharmacy.view'')))', t);
    END IF;
  END LOOP;
END $$;
