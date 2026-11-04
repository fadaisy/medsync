-- 0275 — Stock › Main store (rework kit 5, STORE.md §G).
--
-- GATED: owner-applied (`npm run db:migrate`), after 0274.
--
--   1. Vouchers: one server-side sequence per prefix (RIV TRF GRN RTS RTN ADJ CNT) per hospital.
--   2. Dispatches: pharmacy_issues gains a voucher, its kind and the witness (the attester of the S3 approval). Stock goes store → the hospital's
--      `transit` location on issue and transit → the place on confirmation, so a place's stock counts only once it is
--      confirmed (confirmations gain a note). The ledger refuses: an issue leg that is not first expiry first, a
--      controlled leg without a witness who is not the issuer, a place leg before its confirmation.
--   3. Requisitions gain urgent and the reason.
--   4. Top-up runs (place, weekdays, time) and the log of each run sent.
--   5. Returns to the store (proposed by the place, accepted on an RTS).
--   6. Orders gain the supplier, sent at/by; a trim (`cut`) never on a V line.
--   7. Put away: a non-cold line is refused while a cold-chain line from a delivery waits; undo appends a row.
--   8. Shelves, blind shelf counts (the expected quantity written at save) and stock-takes. A count difference over
--      the sign-off value (stored per count, from Rules › Stock) is posted only once the in-charge signs; a stock-take
--      closes only with every shelf counted and signed, by the in-charge.
--   9. Quarantine decisions (destroy with a witness, or return), losses (a witness and a case for controlled; a case
--      for theft), store room readings.
--  10. Cases from balances, receipts and losses; pharmacy_place_balance_month (a view over the ledger).
--  11. Live: requisitions, confirmations and room readings join the pharmacy-stock broadcast (0270).
--
-- ADDITIVE and re-runnable. No client grants: writes come from the server connection.
-- Reverse: drop the new tables, view and functions and the new columns; restore the 0274 location kinds and the 0267
-- case source types.

-- ─── 1. Vouchers ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pharmacy_voucher_seq (
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  prefix text NOT NULL CHECK (prefix IN ('RIV','TRF','GRN','RTS','RTN','ADJ','CNT')),
  last integer NOT NULL DEFAULT 0 CHECK (last >= 0),
  PRIMARY KEY (hospital_id, prefix)
);
CREATE OR REPLACE FUNCTION private.pharmacy_next_voucher(p_hospital uuid, p_prefix text) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE _n integer;
BEGIN
  INSERT INTO public.pharmacy_voucher_seq (hospital_id, prefix, last) VALUES (p_hospital, p_prefix, 1)
  ON CONFLICT (hospital_id, prefix) DO UPDATE SET last = pharmacy_voucher_seq.last + 1
  RETURNING last INTO _n;
  RETURN p_prefix || '-' || lpad(_n::text, 4, '0');
END;
$$;

-- ─── 2. Dispatches ───────────────────────────────────────────────────────
ALTER TABLE public.pharmacy_locations DROP CONSTRAINT IF EXISTS pharmacy_locations_kind_check;
ALTER TABLE public.pharmacy_locations ADD CONSTRAINT pharmacy_locations_kind_check CHECK (kind IN (
  'store','dispensing_point','ward','cart','quarantine','prepared','clinic','theatre','transit'));
CREATE UNIQUE INDEX IF NOT EXISTS pl_one_transit ON public.pharmacy_locations (hospital_id) WHERE kind = 'transit';

-- The hospital's one "on the way" location, made on first use.
CREATE OR REPLACE FUNCTION private.pharmacy_transit_location(p_hospital uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE _id uuid;
BEGIN
  SELECT id INTO _id FROM public.pharmacy_locations WHERE hospital_id = p_hospital AND kind = 'transit';
  IF _id IS NULL THEN
    INSERT INTO public.pharmacy_locations (hospital_id, kind, name, live_at)
    VALUES (p_hospital, 'transit', 'On the way', now())
    ON CONFLICT DO NOTHING RETURNING id INTO _id;
    IF _id IS NULL THEN
      SELECT id INTO _id FROM public.pharmacy_locations WHERE hospital_id = p_hospital AND kind = 'transit';
    END IF;
  END IF;
  RETURN _id;
END;
$$;

ALTER TABLE public.pharmacy_issues
  ADD COLUMN IF NOT EXISTS voucher text CHECK (voucher IS NULL OR voucher ~ '^(RIV|TRF|RTS|RTN)-[0-9]{4,}$'),
  ADD COLUMN IF NOT EXISTS dispatch_kind text CHECK (dispatch_kind IS NULL OR dispatch_kind IN
    ('requisition','topup','urgent','transfer','straight','no_requisition','expiry_move','return')),
  ADD COLUMN IF NOT EXISTS witness_id uuid REFERENCES auth.users(id) ON DELETE RESTRICT;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pis_dispatch') THEN
    ALTER TABLE public.pharmacy_issues ADD CONSTRAINT pis_dispatch CHECK ((voucher IS NULL) = (dispatch_kind IS NULL));
    ALTER TABLE public.pharmacy_issues ADD CONSTRAINT pis_witness CHECK (witness_id IS NULL OR witness_id <> issued_by);
  END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS pis_voucher ON public.pharmacy_issues (hospital_id, voucher) WHERE voucher IS NOT NULL;
CREATE INDEX IF NOT EXISTS pis_dispatches ON public.pharmacy_issues (hospital_id, issued_at DESC) WHERE voucher IS NOT NULL;

ALTER TABLE public.pharmacy_issue_confirmations
  ADD COLUMN IF NOT EXISTS note text CHECK (note IS NULL OR char_length(note) BETWEEN 2 AND 300);

-- The 0265 movement guard, with two lines changed for `transit`: a dispatch already on its way arrives even if it
-- expires on the road, and its witness stood at the issue. Every other rule is unchanged.
CREATE OR REPLACE FUNCTION private.pharmacy_movement_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE
  _b public.pharmacy_batches;
  _o public.pharmacy_stock_movements;
  _balance bigint;
  _place uuid := coalesce(NEW.location_id, NEW.dispensing_point_id);
  _kind text;
  _controlled boolean;
BEGIN
  SELECT * INTO _b FROM public.pharmacy_batches WHERE id = NEW.batch_id FOR UPDATE;
  IF coalesce(_b.location_id, _b.dispensing_point_id) <> _place OR _b.hospital_id <> NEW.hospital_id THEN
    RAISE EXCEPTION 'pharmacy_stock: batch % is not at this location', NEW.batch_id;
  END IF;
  SELECT kind INTO _kind FROM public.pharmacy_locations WHERE id = _place;

  -- The reversal rule: the exact mirror of one movement, once (psm_one_reversal).
  IF NEW.reverses_id IS NOT NULL THEN
    SELECT * INTO _o FROM public.pharmacy_stock_movements WHERE id = NEW.reverses_id;
    IF NOT FOUND OR _o.batch_id <> NEW.batch_id OR _o.quantity <> -NEW.quantity OR _o.reverses_id IS NOT NULL THEN
      RAISE EXCEPTION 'pharmacy_stock: a reversal mirrors one movement exactly'
        USING ERRCODE = 'P0001', HINT = 'reversal_mismatch';
    END IF;
  END IF;

  -- S3: a controlled medicine leaving any place (or a controlled reversal) needs one fresh witness approval. The
  -- on-the-way location holds nothing of its own: the witness stood at the issue, not again at the arrival.
  _controlled := private.pharmacy_batch_controlled(NEW.batch_id);
  IF _controlled AND _kind IS DISTINCT FROM 'transit' AND (NEW.quantity < 0 OR NEW.reverses_id IS NOT NULL) THEN
    IF NEW.witness_attestation_id IS NOT NULL THEN
      PERFORM private.pharmacy_use_attestation(NEW.witness_attestation_id, NEW.hospital_id, NEW.actor_user_id,
        _place, 'movement:' || NEW.kind);
    ELSIF NOT (NEW.downtime AND NEW.paper_witness_name IS NOT NULL) THEN
      RAISE EXCEPTION 'pharmacy_stock: a controlled medicine leaves only with a witness'
        USING ERRCODE = 'P0001', HINT = 'witness_needed';
    END IF;
  END IF;

  -- S2, H6: a downtime back-entry is allowed; the batch then needs a count before its next live movement out.
  IF NEW.downtime THEN RETURN NEW; END IF;
  IF NEW.quantity < 0 AND NEW.kind NOT IN ('adjusted','count_correction','quarantined_out')
     AND private.pharmacy_batch_needs_count(NEW.batch_id) THEN
    RAISE EXCEPTION 'pharmacy_stock: batch % needs a count after back-entry', _b.batch_number
      USING ERRCODE = 'P0001', HINT = 'needs_count';
  END IF;
  -- SL-14: blocked batches leave only into quarantine, back to the supplier, or by write-off from quarantine.
  IF NEW.quantity < 0 AND _kind IS DISTINCT FROM 'transit' AND NEW.kind NOT IN ('adjusted','count_correction','ward_used','cart_used',
       'quarantined_out','written_off','returned_to_supplier') THEN
    IF private.pharmacy_expires_on(_b.expiry, _b.expiry_month_only) < private.pharmacy_local_date() THEN
      RAISE EXCEPTION 'pharmacy_stock: batch % expired on %', _b.batch_number,
        private.pharmacy_expires_on(_b.expiry, _b.expiry_month_only) USING ERRCODE = 'P0001', HINT = 'expired';
    END IF;
    IF _kind = 'quarantine' THEN
      RAISE EXCEPTION 'pharmacy_stock: batch % is in quarantine', _b.batch_number
        USING ERRCODE = 'P0001', HINT = 'quarantined';
    END IF;
    IF private.pharmacy_batch_recalled(_b.id) THEN
      RAISE EXCEPTION 'pharmacy_stock: batch % is recalled', _b.batch_number
        USING ERRCODE = 'P0001', HINT = 'recalled';
    END IF;
  END IF;
  IF NEW.kind IN ('written_off','returned_to_supplier') AND _kind IS DISTINCT FROM 'quarantine' THEN
    RAISE EXCEPTION 'pharmacy_stock: write-off and return to supplier are from quarantine only'
      USING ERRCODE = 'P0001', HINT = 'not_quarantine';
  END IF;
  SELECT coalesce(sum(quantity), 0) INTO _balance FROM public.pharmacy_stock_movements WHERE batch_id = NEW.batch_id;
  IF _balance + NEW.quantity < 0 THEN
    RAISE EXCEPTION 'pharmacy_stock: batch % holds %', _b.batch_number, _balance
      USING ERRCODE = 'P0001', HINT = 'below_zero';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private.pharmacy_dispatch_leg_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE
  _i public.pharmacy_issues;
  _b public.pharmacy_batches;
  _place uuid := coalesce(NEW.location_id, NEW.dispensing_point_id);
BEGIN
  IF NEW.source_kind <> 'issue' OR NEW.source_id IS NULL THEN RETURN NEW; END IF;
  SELECT * INTO _i FROM public.pharmacy_issues WHERE id = NEW.source_id;
  IF _i.id IS NULL OR _i.voucher IS NULL THEN RETURN NEW; END IF;
  IF NEW.kind = 'issued' AND _place = _i.from_location_id THEN
    SELECT * INTO _b FROM public.pharmacy_batches WHERE id = NEW.batch_id;
    IF private.pharmacy_batch_controlled(NEW.batch_id) AND (_i.witness_id IS NULL OR _i.witness_id = _i.issued_by) THEN
      RAISE EXCEPTION 'pharmacy_store: a controlled line needs a witness who is not the issuer'
        USING ERRCODE = 'P0001', HINT = 'witness';
    END IF;
    -- First expiry first: no earlier batch of the product here that could still be issued.
    IF _i.dispatch_kind NOT IN ('straight','expiry_move') AND EXISTS (
      SELECT 1 FROM public.pharmacy_batches o
       WHERE coalesce(o.location_id, o.dispensing_point_id) = _place AND o.product_id = _b.product_id
         AND o.id <> _b.id AND o.expiry < _b.expiry
         AND private.pharmacy_expires_on(o.expiry, o.expiry_month_only) >= private.pharmacy_local_date()
         AND NOT private.pharmacy_batch_recalled(o.id)
         AND (SELECT coalesce(sum(m.quantity), 0) FROM public.pharmacy_stock_movements m WHERE m.batch_id = o.id) > 0
    ) THEN
      RAISE EXCEPTION 'pharmacy_store: batch % is not the first to expire', _b.batch_number
        USING ERRCODE = 'P0001', HINT = 'fefo';
    END IF;
  ELSIF NEW.kind = 'received_from_issue' AND _place = _i.to_location_id
        AND NOT EXISTS (SELECT 1 FROM public.pharmacy_issue_confirmations c WHERE c.issue_id = _i.id) THEN
    RAISE EXCEPTION 'pharmacy_store: a dispatch reaches the place only when it is confirmed'
      USING ERRCODE = 'P0001', HINT = 'not_confirmed';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS psm_dispatch_leg ON public.pharmacy_stock_movements;
CREATE TRIGGER psm_dispatch_leg BEFORE INSERT ON public.pharmacy_stock_movements
  FOR EACH ROW EXECUTE FUNCTION private.pharmacy_dispatch_leg_guard();

-- ─── 3. Requisitions ─────────────────────────────────────────────────────
ALTER TABLE public.pharmacy_requisitions
  ADD COLUMN IF NOT EXISTS urgent boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reason text CHECK (reason IS NULL OR char_length(reason) BETWEEN 2 AND 200);

-- ─── 4. Top-up runs ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pharmacy_topup_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  location_id uuid NOT NULL REFERENCES public.pharmacy_locations(id) ON DELETE RESTRICT,
  -- ISO weekdays, 1 Monday … 7 Sunday.
  weekdays smallint[] NOT NULL CHECK (cardinality(weekdays) BETWEEN 1 AND 7 AND weekdays <@ '{1,2,3,4,5,6,7}'),
  at time NOT NULL,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS ptr_one ON public.pharmacy_topup_runs (location_id) WHERE ended_at IS NULL;
CREATE TABLE IF NOT EXISTS public.pharmacy_topup_run_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  run_id uuid NOT NULL REFERENCES public.pharmacy_topup_runs(id) ON DELETE RESTRICT,
  on_date date NOT NULL,
  issue_id uuid NOT NULL UNIQUE REFERENCES public.pharmacy_issues(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (run_id, on_date)
);

-- ─── 5. Returns to the store ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pharmacy_store_returns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  location_id uuid NOT NULL REFERENCES public.pharmacy_locations(id) ON DELETE RESTRICT,
  batch_id uuid NOT NULL REFERENCES public.pharmacy_batches(id) ON DELETE RESTRICT,
  qty integer NOT NULL CHECK (qty > 0),
  reason text NOT NULL CHECK (char_length(reason) BETWEEN 2 AND 200),
  proposed_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  proposed_at timestamptz NOT NULL DEFAULT now(),
  accepted_issue_id uuid UNIQUE REFERENCES public.pharmacy_issues(id) ON DELETE RESTRICT,
  accepted_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  accepted_at timestamptz,
  CONSTRAINT psr_accepted CHECK (num_nulls(accepted_issue_id, accepted_by, accepted_at) IN (0, 3))
);
CREATE OR REPLACE FUNCTION private.pharmacy_store_return_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' OR OLD.accepted_at IS NOT NULL OR
     (to_jsonb(NEW) - ARRAY['accepted_issue_id','accepted_by','accepted_at'])
       IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['accepted_issue_id','accepted_by','accepted_at']) THEN
    RAISE EXCEPTION 'pharmacy_store_returns: a return is accepted once and never changes';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS psr_guard ON public.pharmacy_store_returns;
CREATE TRIGGER psr_guard BEFORE UPDATE OR DELETE ON public.pharmacy_store_returns
  FOR EACH ROW EXECUTE FUNCTION private.pharmacy_store_return_guard();

-- ─── 6. Orders ───────────────────────────────────────────────────────────
ALTER TABLE public.pharmacy_orders
  ADD COLUMN IF NOT EXISTS supplier_id uuid REFERENCES public.pharmacy_suppliers(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS sent_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT;
CREATE UNIQUE INDEX IF NOT EXISTS po_one_draft ON public.pharmacy_orders (supplier_id)
  WHERE state = 'draft' AND supplier_id IS NOT NULL;

CREATE OR REPLACE FUNCTION private.pharmacy_order_trim_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.cut IS NOT NULL AND (SELECT p.ven FROM public.pharmacy_products p WHERE p.id = NEW.product_id) = 'V' THEN
    RAISE EXCEPTION 'pharmacy_orders: a vital line is never trimmed' USING ERRCODE = 'P0001', HINT = 'vital_trim';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS pol_trim ON public.pharmacy_order_lines;
CREATE TRIGGER pol_trim BEFORE INSERT OR UPDATE ON public.pharmacy_order_lines
  FOR EACH ROW EXECUTE FUNCTION private.pharmacy_order_trim_guard();

-- ─── 7. Put away ─────────────────────────────────────────────────────────
ALTER TABLE public.pharmacy_batch_shelves ALTER COLUMN shelf DROP NOT NULL;
ALTER TABLE public.pharmacy_batch_shelves
  ADD COLUMN IF NOT EXISTS undoes uuid REFERENCES public.pharmacy_batch_shelves(id) ON DELETE RESTRICT;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pbs_undo') THEN
    ALTER TABLE public.pharmacy_batch_shelves ADD CONSTRAINT pbs_undo CHECK ((shelf IS NULL) = (undoes IS NOT NULL));
  END IF;
END $$;

-- A store batch is waiting when it came on a delivery, still holds stock and has no shelf (latest row wins).
CREATE OR REPLACE FUNCTION private.pharmacy_batch_waiting(p_batch uuid) RETURNS boolean
LANGUAGE sql STABLE SET search_path = public, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM public.pharmacy_stock_movements m WHERE m.batch_id = p_batch AND m.kind = 'received')
     AND (SELECT coalesce(sum(m.quantity), 0) FROM public.pharmacy_stock_movements m WHERE m.batch_id = p_batch) > 0
     AND (SELECT s.shelf FROM public.pharmacy_batch_shelves s WHERE s.batch_id = p_batch
           ORDER BY s.created_at DESC, s.id DESC LIMIT 1) IS NULL;
$$;

CREATE OR REPLACE FUNCTION private.pharmacy_put_away_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE _b public.pharmacy_batches; _cold boolean; _u public.pharmacy_batch_shelves;
BEGIN
  IF NEW.undoes IS NOT NULL THEN
    SELECT * INTO _u FROM public.pharmacy_batch_shelves WHERE id = NEW.undoes;
    IF _u.batch_id IS DISTINCT FROM NEW.batch_id OR _u.actor_id IS DISTINCT FROM NEW.actor_id THEN
      RAISE EXCEPTION 'pharmacy_batch_shelves: only the person who put it away undoes it'
        USING ERRCODE = 'P0001', HINT = 'undo_own';
    END IF;
    RETURN NEW;
  END IF;
  SELECT * INTO _b FROM public.pharmacy_batches WHERE id = NEW.batch_id;
  SELECT cold_chain INTO _cold FROM public.pharmacy_products WHERE id = _b.product_id;
  IF NOT coalesce(_cold, false) AND EXISTS (
    SELECT 1 FROM public.pharmacy_batches o JOIN public.pharmacy_products p ON p.id = o.product_id
     WHERE coalesce(o.location_id, o.dispensing_point_id) = coalesce(_b.location_id, _b.dispensing_point_id)
       AND o.id <> _b.id AND p.cold_chain AND private.pharmacy_batch_waiting(o.id)
  ) THEN
    RAISE EXCEPTION 'pharmacy_batch_shelves: cold-chain lines are put away first'
      USING ERRCODE = 'P0001', HINT = 'cold_first';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS pbs_cold_first ON public.pharmacy_batch_shelves;
CREATE TRIGGER pbs_cold_first BEFORE INSERT ON public.pharmacy_batch_shelves
  FOR EACH ROW EXECUTE FUNCTION private.pharmacy_put_away_guard();

-- ─── 8. Shelves, counts, stock-takes ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pharmacy_shelves (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  location_id uuid NOT NULL REFERENCES public.pharmacy_locations(id) ON DELETE RESTRICT,
  -- A bin belongs to the shelf when it is the code or starts with "<code>-" (A → A-02; CR-01 → CR-01).
  code text NOT NULL CHECK (code ~ '^[A-Z0-9][A-Z0-9-]{0,9}$'),
  name text NOT NULL CHECK (char_length(name) BETWEEN 2 AND 80),
  -- The controlled cupboard is counted daily (Rules › Stock); every other shelf on the count rule.
  controlled boolean NOT NULL DEFAULT false,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS psh_code ON public.pharmacy_shelves (location_id, code) WHERE archived_at IS NULL;

CREATE TABLE IF NOT EXISTS public.pharmacy_stocktakes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  location_id uuid NOT NULL REFERENCES public.pharmacy_locations(id) ON DELETE RESTRICT,
  started_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  started_at timestamptz NOT NULL DEFAULT now(),
  closed_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  closed_at timestamptz,
  -- Filed in Records on close: shelves, differences and sign-offs.
  report jsonb,
  CONSTRAINT pst_closed CHECK (num_nulls(closed_by, closed_at, report) IN (0, 3))
);
CREATE UNIQUE INDEX IF NOT EXISTS pst_one_open ON public.pharmacy_stocktakes (location_id) WHERE closed_at IS NULL;

CREATE TABLE IF NOT EXISTS public.pharmacy_shelf_counts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  shelf_id uuid NOT NULL REFERENCES public.pharmacy_shelves(id) ON DELETE RESTRICT,
  stocktake_id uuid REFERENCES public.pharmacy_stocktakes(id) ON DELETE RESTRICT,
  voucher text NOT NULL CHECK (voucher ~ '^CNT-[0-9]{4,}$'),
  counted_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  counted_at timestamptz NOT NULL DEFAULT now(),
  -- UGX, every line's |counted − expected| × unit cost; the sign-off value in force when it was saved.
  diff_value bigint NOT NULL CHECK (diff_value >= 0),
  sign_over bigint NOT NULL CHECK (sign_over >= 0),
  needs_sign boolean GENERATED ALWAYS AS (diff_value > sign_over) STORED,
  signed_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  signed_at timestamptz,
  CONSTRAINT psc_signed CHECK ((signed_by IS NULL) = (signed_at IS NULL)),
  UNIQUE (hospital_id, voucher)
);
CREATE INDEX IF NOT EXISTS psc_shelf ON public.pharmacy_shelf_counts (shelf_id, counted_at DESC);
CREATE TABLE IF NOT EXISTS public.pharmacy_shelf_count_lines (
  count_id uuid NOT NULL REFERENCES public.pharmacy_shelf_counts(id) ON DELETE RESTRICT,
  batch_id uuid NOT NULL REFERENCES public.pharmacy_batches(id) ON DELETE RESTRICT,
  expected integer NOT NULL CHECK (expected >= 0),
  counted integer NOT NULL CHECK (counted >= 0),
  unit_cost numeric(14,2) NOT NULL DEFAULT 0 CHECK (unit_cost >= 0),
  PRIMARY KEY (count_id, batch_id)
);

-- A count is signed once, only when it needs it, by the in-charge.
CREATE OR REPLACE FUNCTION private.pharmacy_shelf_count_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' OR OLD.signed_at IS NOT NULL OR NOT OLD.needs_sign OR NEW.signed_at IS NULL
     OR (to_jsonb(NEW) - ARRAY['signed_by','signed_at','needs_sign'])
        IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['signed_by','signed_at','needs_sign']) THEN
    RAISE EXCEPTION 'pharmacy_shelf_counts: a count changes only by its one sign-off'
      USING ERRCODE = 'P0001', HINT = 'count_fixed';
  END IF;
  IF NOT private.pharmacy_is_in_charge(NEW.signed_by, NEW.hospital_id) THEN
    RAISE EXCEPTION 'pharmacy_shelf_counts: only the in-charge signs off a count'
      USING ERRCODE = 'P0001', HINT = 'in_charge_only';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS psc_guard ON public.pharmacy_shelf_counts;
CREATE TRIGGER psc_guard BEFORE UPDATE OR DELETE ON public.pharmacy_shelf_counts
  FOR EACH ROW EXECUTE FUNCTION private.pharmacy_shelf_count_guard();

-- A shelf count's correction legs post only when it needs no sign-off or is signed.
CREATE OR REPLACE FUNCTION private.pharmacy_count_post_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.kind = 'count_correction' AND NEW.source_kind = 'count' AND EXISTS (
    SELECT 1 FROM public.pharmacy_shelf_counts c WHERE c.id = NEW.source_id AND c.needs_sign AND c.signed_at IS NULL
  ) THEN
    RAISE EXCEPTION 'pharmacy_store: a count difference over the sign-off value posts only once signed'
      USING ERRCODE = 'P0001', HINT = 'needs_sign';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS psm_count_post ON public.pharmacy_stock_movements;
CREATE TRIGGER psm_count_post BEFORE INSERT ON public.pharmacy_stock_movements
  FOR EACH ROW EXECUTE FUNCTION private.pharmacy_count_post_guard();

-- A stock-take closes once, by the in-charge, with every shelf counted in it and every count signed.
CREATE OR REPLACE FUNCTION private.pharmacy_stocktake_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' OR OLD.closed_at IS NOT NULL OR NEW.closed_at IS NULL
     OR (to_jsonb(NEW) - ARRAY['closed_by','closed_at','report'])
        IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['closed_by','closed_at','report']) THEN
    RAISE EXCEPTION 'pharmacy_stocktakes: a stock-take changes only by closing, once'
      USING ERRCODE = 'P0001', HINT = 'stocktake_fixed';
  END IF;
  IF NOT private.pharmacy_is_in_charge(NEW.closed_by, NEW.hospital_id) THEN
    RAISE EXCEPTION 'pharmacy_stocktakes: only the in-charge closes a stock-take'
      USING ERRCODE = 'P0001', HINT = 'in_charge_only';
  END IF;
  IF EXISTS (SELECT 1 FROM public.pharmacy_shelves s WHERE s.location_id = NEW.location_id AND s.archived_at IS NULL
              AND NOT EXISTS (SELECT 1 FROM public.pharmacy_shelf_counts c WHERE c.shelf_id = s.id AND c.stocktake_id = NEW.id)) THEN
    RAISE EXCEPTION 'pharmacy_stocktakes: count every shelf first' USING ERRCODE = 'P0001', HINT = 'uncounted';
  END IF;
  IF EXISTS (SELECT 1 FROM public.pharmacy_shelf_counts c WHERE c.stocktake_id = NEW.id AND c.needs_sign
              AND c.signed_at IS NULL) THEN
    RAISE EXCEPTION 'pharmacy_stocktakes: a count still needs the in-charge''s sign-off'
      USING ERRCODE = 'P0001', HINT = 'unsigned';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS pst_guard ON public.pharmacy_stocktakes;
CREATE TRIGGER pst_guard BEFORE UPDATE OR DELETE ON public.pharmacy_stocktakes
  FOR EACH ROW EXECUTE FUNCTION private.pharmacy_stocktake_guard();

-- ─── 9. Quarantine, losses, room readings ────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pharmacy_quarantine_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  batch_id uuid NOT NULL UNIQUE REFERENCES public.pharmacy_batches(id) ON DELETE RESTRICT,
  decided text NOT NULL CHECK (decided IN ('destroy','return')),
  qty integer NOT NULL CHECK (qty > 0),
  value_ugx bigint NOT NULL CHECK (value_ugx >= 0),
  voucher text NOT NULL CHECK (voucher ~ '^(ADJ|RTN)-[0-9]{4,}$'),
  witness_id uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  decided_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  decided_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pqd_witness CHECK ((decided <> 'destroy' OR witness_id IS NOT NULL)
    AND (witness_id IS NULL OR witness_id <> decided_by))
);

CREATE TABLE IF NOT EXISTS public.pharmacy_store_losses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  location_id uuid NOT NULL REFERENCES public.pharmacy_locations(id) ON DELETE RESTRICT,
  batch_id uuid NOT NULL REFERENCES public.pharmacy_batches(id) ON DELETE RESTRICT,
  qty integer NOT NULL CHECK (qty > 0),
  reason text NOT NULL CHECK (reason IN ('damaged','broken','spoilt','missing','other','destroyed','returned')),
  note text CHECK (note IS NULL OR char_length(note) BETWEEN 2 AND 300),
  value_ugx bigint NOT NULL CHECK (value_ugx >= 0),
  voucher text NOT NULL CHECK (voucher ~ '^(ADJ|RTN)-[0-9]{4,}$'),
  witness_id uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  case_id uuid REFERENCES public.pharmacy_cases(id) ON DELETE RESTRICT,
  quarantine_decision_id uuid UNIQUE REFERENCES public.pharmacy_quarantine_decisions(id) ON DELETE RESTRICT,
  recorded_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT psl_from CHECK ((reason IN ('destroyed','returned')) = (quarantine_decision_id IS NOT NULL)),
  CONSTRAINT psl_note CHECK (reason IN ('destroyed','returned') OR note IS NOT NULL),
  CONSTRAINT psl_witness CHECK (witness_id IS NULL OR witness_id <> recorded_by)
);
CREATE INDEX IF NOT EXISTS psl_when ON public.pharmacy_store_losses (hospital_id, recorded_at DESC);

-- A controlled loss needs a witness and a case; theft (missing) needs a case.
CREATE OR REPLACE FUNCTION private.pharmacy_store_loss_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE _cd boolean := private.pharmacy_batch_controlled(NEW.batch_id);
BEGIN
  IF NEW.reason NOT IN ('destroyed','returned') THEN
    IF _cd AND NEW.witness_id IS NULL THEN
      RAISE EXCEPTION 'pharmacy_store_losses: a controlled loss needs a witness' USING ERRCODE = 'P0001', HINT = 'witness';
    END IF;
    IF (_cd OR NEW.reason = 'missing') AND NEW.case_id IS NULL THEN
      RAISE EXCEPTION 'pharmacy_store_losses: theft or a controlled loss opens a case' USING ERRCODE = 'P0001', HINT = 'case';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS psl_guard ON public.pharmacy_store_losses;
CREATE TRIGGER psl_guard BEFORE INSERT ON public.pharmacy_store_losses
  FOR EACH ROW EXECUTE FUNCTION private.pharmacy_store_loss_guard();

CREATE TABLE IF NOT EXISTS public.pharmacy_store_room_readings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  location_id uuid NOT NULL REFERENCES public.pharmacy_locations(id) ON DELETE RESTRICT,
  read_at timestamptz NOT NULL DEFAULT now(),
  temp_c numeric(4,1) NOT NULL CHECK (temp_c BETWEEN -10 AND 60),
  humidity integer NOT NULL CHECK (humidity BETWEEN 0 AND 100),
  recorded_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS psrr_when ON public.pharmacy_store_room_readings (location_id, read_at DESC);

-- ─── 10. Cases and place balances ────────────────────────────────────────
ALTER TABLE public.pharmacy_cases DROP CONSTRAINT IF EXISTS pharmacy_cases_source_type_check;
ALTER TABLE public.pharmacy_cases ADD CONSTRAINT pharmacy_cases_source_type_check CHECK (source_type IN
  ('cd_check','handover','count','manual','balance','receipt','loss'));

-- Per place, product and Kampala month, from the ledger: what came in (only confirmed dispatches reach a place), what
-- was dispensed or given, what was sent on (transfers, returns), the count and other adjustments, the opening and the
-- closing. Unexplained = opening + received − used − sent − closing (= − adjustments).
CREATE OR REPLACE VIEW public.pharmacy_place_balance_month WITH (security_invoker = true) AS
WITH d AS (
  SELECT m.hospital_id, coalesce(m.location_id, m.dispensing_point_id) AS location_id, b.product_id,
         date_trunc('month', m.effective_at AT TIME ZONE 'Africa/Kampala')::date AS month,
         coalesce(sum(m.quantity) FILTER (WHERE m.kind IN ('received','received_from_issue','transfer_in','returned_in',
           'borrowed','loan_returned_in','quarantined_in')), 0)::bigint AS received,
         coalesce(-sum(m.quantity) FILTER (WHERE m.kind IN ('supplied','ward_used','cart_used','set_aside_out',
           'released_in','reversed')), 0)::bigint AS used,
         coalesce(-sum(m.quantity) FILTER (WHERE m.kind IN ('issued','transfer_out','returned_out','lent',
           'loan_returned_out','quarantined_out','written_off','returned_to_supplier','set_aside_in','released_out')), 0)::bigint AS sent,
         coalesce(sum(m.quantity) FILTER (WHERE m.kind IN ('adjusted','count_correction')), 0)::bigint AS adjusted,
         sum(m.quantity)::bigint AS net
    FROM public.pharmacy_stock_movements m
    JOIN public.pharmacy_batches b ON b.id = m.batch_id
   GROUP BY 1, 2, 3, 4
)
SELECT hospital_id, location_id, product_id, month, received, used, sent, adjusted,
       (coalesce(sum(net) OVER w, 0) - net)::bigint AS opening,
       coalesce(sum(net) OVER w, 0)::bigint AS closing,
       (-adjusted)::bigint AS unexplained
  FROM d
WINDOW w AS (PARTITION BY location_id, product_id ORDER BY month ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW);
GRANT SELECT ON public.pharmacy_place_balance_month TO medsync_clinical_reader;

-- ─── 11. Live ────────────────────────────────────────────────────────────
DO $$
DECLARE t text;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'pharmacy_stock_broadcast') THEN
    FOREACH t IN ARRAY ARRAY['pharmacy_requisitions','pharmacy_issue_confirmations','pharmacy_store_room_readings',
      'pharmacy_shelf_counts','pharmacy_store_returns'] LOOP
      EXECUTE format('DROP TRIGGER IF EXISTS pharmacy_stock_broadcast ON public.%I', t);
      EXECUTE format('CREATE TRIGGER pharmacy_stock_broadcast AFTER INSERT OR UPDATE ON public.%I
        FOR EACH ROW EXECUTE FUNCTION public.pharmacy_stock_broadcast()', t);
    END LOOP;
  END IF;
END $$;

-- ─── Append-only, audit, RLS ─────────────────────────────────────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['pharmacy_topup_run_log','pharmacy_shelf_count_lines','pharmacy_quarantine_decisions',
    'pharmacy_store_losses','pharmacy_store_room_readings'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %1$s_append_only ON public.%1$I', t);
    EXECUTE format('CREATE TRIGGER %1$s_append_only BEFORE UPDATE OR DELETE ON public.%1$I
      FOR EACH ROW EXECUTE FUNCTION public.block_modify_append_only()', t);
  END LOOP;
  FOREACH t IN ARRAY ARRAY['pharmacy_voucher_seq','pharmacy_topup_runs','pharmacy_topup_run_log',
    'pharmacy_store_returns','pharmacy_shelves','pharmacy_stocktakes','pharmacy_shelf_counts',
    'pharmacy_shelf_count_lines','pharmacy_quarantine_decisions','pharmacy_store_losses',
    'pharmacy_store_room_readings'] LOOP
    IF t NOT IN ('pharmacy_voucher_seq','pharmacy_shelf_count_lines') THEN
      EXECUTE format('DROP TRIGGER IF EXISTS audit_%1$s ON public.%1$I', t);
      EXECUTE format('CREATE TRIGGER audit_%1$s AFTER INSERT OR UPDATE OR DELETE ON public.%1$I
        FOR EACH ROW EXECUTE FUNCTION public.audit_log_changes()', t);
    END IF;
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
    IF t = 'pharmacy_shelf_count_lines' THEN
      EXECUTE format('GRANT SELECT ON public.%I TO medsync_clinical_reader', t);
      EXECUTE format('DROP POLICY IF EXISTS %1$s_select ON public.%1$I', t);
      EXECUTE format('CREATE POLICY %1$s_select ON public.%1$I FOR SELECT TO medsync_clinical_reader
        USING (EXISTS (SELECT 1 FROM public.pharmacy_shelf_counts c WHERE c.id = count_id
          AND c.hospital_id = (SELECT private.current_hospital_id())) AND (SELECT private.pharmacy_can(''pharmacy.view'')))', t);
    ELSIF t <> 'pharmacy_voucher_seq' THEN
      EXECUTE format('GRANT SELECT ON public.%I TO medsync_clinical_reader', t);
      EXECUTE format('DROP POLICY IF EXISTS %1$s_select ON public.%1$I', t);
      EXECUTE format('CREATE POLICY %1$s_select ON public.%1$I FOR SELECT TO medsync_clinical_reader
        USING (hospital_id = (SELECT private.current_hospital_id()) AND (SELECT private.pharmacy_can(''pharmacy.view'')))', t);
    END IF;
  END LOOP;
END $$;

REVOKE ALL ON FUNCTION private.pharmacy_next_voucher(uuid, text), private.pharmacy_transit_location(uuid) FROM PUBLIC;
