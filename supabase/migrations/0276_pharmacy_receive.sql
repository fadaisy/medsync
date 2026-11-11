-- 0276 — Stock › Receive a delivery (rework kit 6, RECEIVE.md §I).
--
-- GATED: owner-applied (`npm run db:migrate`), after 0275.
--
--   1. Medicines: vaccine, own_code (an in-house barcode), usual_shelf. Vouchers gain CLM and OWN.
--   2. Deliveries: the kind and its source (supplier, donation, facility, ward), blind count, invoice, GRN, shelved at
--      and the second checker. A reference is unique per source, abandoned excluded.
--   3. Lines: what was counted, on the note, cost, arrival temperature, VVM, freeze, approval, rejection, witness. Stock
--      columns (accepted, rejected) are written at finish only.
--   4. The finish guard: on counting → received the database refuses an expired line, a recalled batch, VVM 3–4, a tripped
--      or unchecked freeze indicator, a cold line outside its range, a short-dated acceptance without an in-charge's
--      approval, a controlled line without a witness who is not the receiver, and a delivery over the limit without a
--      second checker who is not the receiver. Numbers come from pharmacy_rules, else the registry default named here.
--   5. Pack serials: unique per GTIN.
--   6. Photos: a storage path on the delivery, never the image.
--   7. Put away: one row per line, shelving itself stays on pharmacy_batch_shelves (0272, 0275's cold-first guard).
--   8. Orders: chased and edited dates; lines gain packs, price and received packs, editable while the order is open, never
--      below what arrived.
--   9. Supplier claims: supplier deliveries only; credit needs the credit note.
--  10. Live: the same broadcast as stock, for the board and the in-charge's approvals.

-- ─── 1. Medicines and vouchers ───────────────────────────────────────────
ALTER TABLE public.pharmacy_products
  ADD COLUMN IF NOT EXISTS vaccine boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS own_code boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS usual_shelf text CHECK (usual_shelf IS NULL OR char_length(usual_shelf) BETWEEN 1 AND 20);

ALTER TABLE public.pharmacy_voucher_seq DROP CONSTRAINT IF EXISTS pharmacy_voucher_seq_prefix_check;
ALTER TABLE public.pharmacy_voucher_seq ADD CONSTRAINT pharmacy_voucher_seq_prefix_check
  CHECK (prefix IN ('RIV','TRF','GRN','RTS','RTN','ADJ','CNT','CLM','OWN'));

-- A signed number for this hospital, else the registry's default.
CREATE OR REPLACE FUNCTION private.pharmacy_rule_n(p_hospital uuid, p_group text, p_key text, p_default numeric)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT coalesce((SELECT (r.params ->> 'n')::numeric FROM public.pharmacy_rules r
                    WHERE r.hospital_id = p_hospital AND r.rule_group = p_group AND r.key = p_key), p_default);
$$;
REVOKE ALL ON FUNCTION private.pharmacy_rule_n(uuid, text, text, numeric) FROM PUBLIC;

CREATE OR REPLACE FUNCTION private.pharmacy_product_controlled(p_product uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.pharmacy_products p
     WHERE p.id = p_product
       AND (p.controlled_class IS NOT NULL
            OR EXISTS (SELECT 1 FROM public.pharmacy_signed_sets s
                        WHERE s.hospital_id = p.hospital_id AND s.kind = 'controlled_classes' AND s.status = 'signed'
                          AND coalesce(s.content ->> p.medicine_id, 'not_controlled') <> 'not_controlled')));
$$;
REVOKE ALL ON FUNCTION private.pharmacy_product_controlled(uuid) FROM PUBLIC;

-- ─── 2. Deliveries ───────────────────────────────────────────────────────
ALTER TABLE public.pharmacy_deliveries ALTER COLUMN supplier_id DROP NOT NULL;
ALTER TABLE public.pharmacy_deliveries
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'supplier' CHECK (kind IN ('supplier','donation','facility','ward')),
  ADD COLUMN IF NOT EXISTS pharmacy_supplier_id uuid REFERENCES public.pharmacy_suppliers(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS from_text text CHECK (from_text IS NULL OR char_length(from_text) BETWEEN 2 AND 120),
  ADD COLUMN IF NOT EXISTS from_location_id uuid REFERENCES public.pharmacy_locations(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS blind boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS invoice_no text CHECK (invoice_no IS NULL OR char_length(invoice_no) <= 80),
  ADD COLUMN IF NOT EXISTS invoice_total numeric(16,2) CHECK (invoice_total IS NULL OR invoice_total >= 0),
  ADD COLUMN IF NOT EXISTS grn text,
  ADD COLUMN IF NOT EXISTS shelved_at timestamptz,
  ADD COLUMN IF NOT EXISTS second_checker_id uuid REFERENCES auth.users(id) ON DELETE RESTRICT;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pd_source') THEN
    ALTER TABLE public.pharmacy_deliveries ADD CONSTRAINT pd_source CHECK (CASE kind
      WHEN 'supplier' THEN coalesce(pharmacy_supplier_id::text, supplier_id::text) IS NOT NULL
      WHEN 'ward' THEN from_location_id IS NOT NULL
      ELSE from_text IS NOT NULL END);
  END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS pd_source_note ON public.pharmacy_deliveries (hospital_id, kind,
  coalesce(pharmacy_supplier_id::text, supplier_id::text, from_location_id::text, lower(from_text)), lower(note_number))
  WHERE state <> 'abandoned';
CREATE INDEX IF NOT EXISTS pd_place_state ON public.pharmacy_deliveries (location_id, state);

-- ─── 3. Lines ────────────────────────────────────────────────────────────
ALTER TABLE public.pharmacy_delivery_lines DROP CONSTRAINT IF EXISTS pharmacy_delivery_lines_reject_reason_check;
ALTER TABLE public.pharmacy_delivery_lines ADD CONSTRAINT pharmacy_delivery_lines_reject_reason_check
  CHECK (reject_reason IS NULL OR reject_reason IN
    ('damaged','wrong_product','expired','short_dated','recall','cold_chain','other'));
ALTER TABLE public.pharmacy_delivery_lines DROP CONSTRAINT IF EXISTS pharmacy_delivery_lines_identity_source_check;
ALTER TABLE public.pharmacy_delivery_lines ADD CONSTRAINT pharmacy_delivery_lines_identity_source_check
  CHECK (identity_source IS NULL OR identity_source IN ('scan','catalogue','typed','order'));
ALTER TABLE public.pharmacy_delivery_lines
  ADD COLUMN IF NOT EXISTS counted_packs integer CHECK (counted_packs IS NULL OR counted_packs BETWEEN 0 AND 1000000),
  ADD COLUMN IF NOT EXISTS note_packs integer CHECK (note_packs IS NULL OR note_packs BETWEEN 0 AND 1000000),
  ADD COLUMN IF NOT EXISTS cost_per_pack numeric(14,2) CHECK (cost_per_pack IS NULL OR cost_per_pack >= 0),
  ADD COLUMN IF NOT EXISTS expiry_text text CHECK (expiry_text IS NULL OR char_length(expiry_text) <= 20),
  ADD COLUMN IF NOT EXISTS temp_c numeric(4,1) CHECK (temp_c IS NULL OR temp_c BETWEEN -40 AND 60),
  ADD COLUMN IF NOT EXISTS vvm_stage smallint CHECK (vvm_stage IS NULL OR vvm_stage BETWEEN 1 AND 4),
  ADD COLUMN IF NOT EXISTS freeze_check text CHECK (freeze_check IS NULL OR freeze_check IN ('ok','tripped')),
  ADD COLUMN IF NOT EXISTS approval_asked_at timestamptz,
  ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS rej_packs integer CHECK (rej_packs IS NULL OR rej_packs >= 0),
  ADD COLUMN IF NOT EXISTS rej_fate text CHECK (rej_fate IS NULL OR rej_fate IN ('driver','quarantine')),
  ADD COLUMN IF NOT EXISTS witness_id uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS owed_frozen integer;

-- A finished delivery changes only by being shelved. Lines stay frozen.
CREATE OR REPLACE FUNCTION private.pharmacy_delivery_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE _state text;
BEGIN
  IF TG_TABLE_NAME = 'pharmacy_deliveries' THEN
    IF TG_OP = 'DELETE' THEN
      RAISE EXCEPTION 'pharmacy_deliveries: a finished delivery never changes';
    END IF;
    IF OLD.state <> 'counting' AND (to_jsonb(NEW) - 'shelved_at') IS DISTINCT FROM (to_jsonb(OLD) - 'shelved_at') THEN
      RAISE EXCEPTION 'pharmacy_deliveries: a finished delivery never changes';
    END IF;
    RETURN NEW;
  END IF;
  SELECT state INTO _state FROM public.pharmacy_deliveries WHERE id = coalesce(NEW.delivery_id, OLD.delivery_id);
  IF _state <> 'counting' THEN RAISE EXCEPTION 'pharmacy_delivery_lines: the delivery is finished'; END IF;
  RETURN coalesce(NEW, OLD);
END;
$$;

-- ─── 4. The finish guard ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION private.pharmacy_delivery_finish_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE
  h uuid := NEW.hospital_id;
  _today date := (now() AT TIME ZONE 'Africa/Kampala')::date;
  _look numeric := private.pharmacy_rule_n(h, 'recv', 'look', 180);
  _low numeric := private.pharmacy_rule_n(h, 'recv', 'temp_low', 2);
  _high numeric := private.pharmacy_rule_n(h, 'recv', 'temp_high', 8);
  _limit numeric := private.pharmacy_rule_n(h, 'recv', 'second_check', 2000000);
  _value numeric := 0;
  l record;
  _expires date;
BEGIN
  -- A delivery naming an old counterparty is the older writer, which only the demo seed still calls; it keeps its rules.
  IF NEW.pharmacy_supplier_id IS NULL AND NEW.supplier_id IS NOT NULL THEN RETURN NEW; END IF;
  IF NOT (OLD.state = 'counting' AND NEW.state = 'received') THEN RETURN NEW; END IF;
  FOR l IN
    SELECT dl.*, p.cold_chain, p.vaccine, private.pharmacy_product_controlled(p.id) AS controlled
      FROM public.pharmacy_delivery_lines dl JOIN public.pharmacy_products p ON p.id = dl.product_id
     WHERE dl.delivery_id = NEW.id AND dl.accepted_quantity > 0
  LOOP
    _value := _value + (coalesce(l.counted_packs, 0) - coalesce(l.rej_packs, 0)) * coalesce(l.cost_per_pack, 0);
    _expires := private.pharmacy_expires_on(l.expiry, l.expiry_month_only);
    IF _expires < _today THEN
      RAISE EXCEPTION 'pharmacy_deliveries: an expired line cannot go into stock' USING ERRCODE = 'P0001', HINT = 'expired';
    END IF;
    IF EXISTS (SELECT 1 FROM public.pharmacy_recalls r
                WHERE r.hospital_id = h AND r.product_id = l.product_id AND r.closed_at IS NULL
                  AND (r.batch_number IS NULL OR upper(r.batch_number) = upper(l.batch_number))) THEN
      RAISE EXCEPTION 'pharmacy_deliveries: a recalled batch cannot go into stock' USING ERRCODE = 'P0001', HINT = 'recall';
    END IF;
    IF l.vaccine AND (l.vvm_stage IS NULL OR l.vvm_stage >= 3) THEN
      RAISE EXCEPTION 'pharmacy_deliveries: a vaccine needs a usable VVM stage' USING ERRCODE = 'P0001', HINT = 'vvm';
    END IF;
    IF l.vaccine AND l.freeze_check IS DISTINCT FROM 'ok' THEN
      RAISE EXCEPTION 'pharmacy_deliveries: a vaccine needs its freeze indicator fine' USING ERRCODE = 'P0001', HINT = 'freeze';
    END IF;
    IF l.cold_chain AND (l.temp_c IS NULL OR l.temp_c < _low OR l.temp_c > _high) THEN
      RAISE EXCEPTION 'pharmacy_deliveries: a cold line needs its temperature in range' USING ERRCODE = 'P0001', HINT = 'cold_range';
    END IF;
    IF _expires < _today + _look::int AND (l.approved_by IS NULL
         OR NOT private.pharmacy_is_in_charge(l.approved_by, h)) THEN
      RAISE EXCEPTION 'pharmacy_deliveries: a short-dated line needs the in-charge''s approval'
        USING ERRCODE = 'P0001', HINT = 'short_dated';
    END IF;
    IF l.controlled AND (l.witness_id IS NULL OR l.witness_id = NEW.finished_by) THEN
      RAISE EXCEPTION 'pharmacy_deliveries: a controlled line needs a witness who is not the receiver'
        USING ERRCODE = 'P0001', HINT = 'witness';
    END IF;
  END LOOP;
  IF _value > _limit AND (NEW.second_checker_id IS NULL OR NEW.second_checker_id = NEW.finished_by) THEN
    RAISE EXCEPTION 'pharmacy_deliveries: over the limit needs a second checker who is not the receiver'
      USING ERRCODE = 'P0001', HINT = 'second_check';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS pd_finish ON public.pharmacy_deliveries;
CREATE TRIGGER pd_finish BEFORE UPDATE OF state ON public.pharmacy_deliveries
  FOR EACH ROW EXECUTE FUNCTION private.pharmacy_delivery_finish_guard();

-- ─── 5. Pack serials ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pharmacy_pack_serials (
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  gtin text NOT NULL CHECK (char_length(gtin) BETWEEN 8 AND 14),
  serial text NOT NULL CHECK (char_length(serial) BETWEEN 1 AND 40),
  delivery_id uuid NOT NULL REFERENCES public.pharmacy_deliveries(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (hospital_id, gtin, serial)
);

-- ─── 6. Photos ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pharmacy_delivery_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  delivery_id uuid NOT NULL REFERENCES public.pharmacy_deliveries(id) ON DELETE RESTRICT,
  kind text NOT NULL CHECK (kind IN ('note','invoice','damage')),
  file text NOT NULL CHECK (char_length(file) BETWEEN 3 AND 300),
  by_user uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pdp_delivery ON public.pharmacy_delivery_photos (delivery_id);
DO $$ BEGIN
  IF to_regclass('storage.buckets') IS NOT NULL THEN
    EXECUTE $q$INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
      VALUES ('pharmacy-delivery-photos', 'pharmacy-delivery-photos', false, 5242880, ARRAY['image/jpeg','image/png','image/webp'])
      ON CONFLICT (id) DO NOTHING$q$;
  END IF;
END $$;

-- ─── 7. Put away ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pharmacy_delivery_put_away (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  delivery_line_id uuid NOT NULL UNIQUE REFERENCES public.pharmacy_delivery_lines(id) ON DELETE RESTRICT,
  batch_id uuid NOT NULL REFERENCES public.pharmacy_batches(id) ON DELETE RESTRICT,
  shelf text CHECK (shelf IS NULL OR char_length(shelf) BETWEEN 1 AND 20),
  qty integer NOT NULL CHECK (qty >= 0),
  sent_qty integer NOT NULL DEFAULT 0 CHECK (sent_qty >= 0),
  shelf_row_id uuid REFERENCES public.pharmacy_batch_shelves(id) ON DELETE RESTRICT,
  done_at timestamptz,
  done_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ─── 8. Orders ───────────────────────────────────────────────────────────
ALTER TABLE public.pharmacy_orders
  ADD COLUMN IF NOT EXISTS chased_on date,
  ADD COLUMN IF NOT EXISTS edited_on date;
ALTER TABLE public.pharmacy_order_lines
  ADD COLUMN IF NOT EXISTS packs integer CHECK (packs IS NULL OR packs > 0),
  ADD COLUMN IF NOT EXISTS per_pack integer CHECK (per_pack IS NULL OR per_pack > 0),
  ADD COLUMN IF NOT EXISTS price_per_pack numeric(14,2) CHECK (price_per_pack IS NULL OR price_per_pack >= 0),
  ADD COLUMN IF NOT EXISTS received_packs integer NOT NULL DEFAULT 0 CHECK (received_packs >= 0);

CREATE OR REPLACE FUNCTION private.pharmacy_order_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.state = 'draft' THEN RETURN OLD; END IF;
    RAISE EXCEPTION 'pharmacy_orders: a saved order is closed, never deleted';
  END IF;
  IF OLD.state = 'closed' THEN RAISE EXCEPTION 'pharmacy_orders: a closed order never changes'; END IF;
  IF OLD.state = 'open' AND (
       (to_jsonb(NEW) - ARRAY['state','closed_at','chased_on','edited_on']) IS DISTINCT FROM
       (to_jsonb(OLD) - ARRAY['state','closed_at','chased_on','edited_on'])
       OR NEW.state NOT IN ('open','closed')) THEN
    RAISE EXCEPTION 'pharmacy_orders: a saved order changes only by closing, chasing or editing its lines';
  END IF;
  RETURN NEW;
END;
$$;

-- An open order's lines may be edited (RECEIVE §C2), never below what arrived. A line with nothing received may go.
CREATE OR REPLACE FUNCTION private.pharmacy_order_line_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE
  _state text;
  _free text[] := ARRAY['closed_at','closed_by','close_reason','close_note',
                        'packs','per_pack','price_per_pack','received_packs','chosen_units'];
BEGIN
  SELECT state INTO _state FROM public.pharmacy_orders WHERE id = coalesce(NEW.order_id, OLD.order_id);
  IF _state = 'draft' THEN RETURN coalesce(NEW, OLD); END IF;
  IF TG_OP = 'INSERT' THEN
    IF _state = 'open' THEN RETURN NEW; END IF;
    RAISE EXCEPTION 'pharmacy_order_lines: a closed order takes no new line';
  END IF;
  IF TG_OP = 'DELETE' THEN
    IF _state = 'open' AND OLD.received_packs = 0 THEN RETURN OLD; END IF;
    RAISE EXCEPTION 'pharmacy_order_lines: a saved order line is closed, never removed or reopened';
  END IF;
  IF OLD.closed_at IS NOT NULL THEN
    RAISE EXCEPTION 'pharmacy_order_lines: a saved order line is closed, never removed or reopened';
  END IF;
  IF (to_jsonb(NEW) - _free) IS DISTINCT FROM (to_jsonb(OLD) - _free) THEN
    RAISE EXCEPTION 'pharmacy_order_lines: a saved order line changes only by closing or an edit of its quantity and price';
  END IF;
  IF NEW.packs IS NOT NULL AND NEW.packs < NEW.received_packs AND NEW.packs IS DISTINCT FROM OLD.packs THEN
    RAISE EXCEPTION 'pharmacy_order_lines: ordered cannot be less than what arrived'
      USING ERRCODE = 'P0001', HINT = 'below_received';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS pol_guard ON public.pharmacy_order_lines;
CREATE TRIGGER pol_guard BEFORE INSERT OR UPDATE OR DELETE ON public.pharmacy_order_lines
  FOR EACH ROW EXECUTE FUNCTION private.pharmacy_order_line_guard();

-- ─── 9. Supplier claims ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pharmacy_supplier_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  ref text NOT NULL,
  delivery_id uuid NOT NULL UNIQUE REFERENCES public.pharmacy_deliveries(id) ON DELETE RESTRICT,
  pharmacy_supplier_id uuid NOT NULL REFERENCES public.pharmacy_suppliers(id) ON DELETE RESTRICT,
  state text NOT NULL DEFAULT 'draft' CHECK (state IN ('draft','sent','credit')),
  total numeric(16,2) NOT NULL CHECK (total >= 0),
  sent_at timestamptz,
  sent_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  credit_note text CHECK (credit_note IS NULL OR char_length(credit_note) BETWEEN 1 AND 80),
  credited_at timestamptz,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (hospital_id, ref),
  CONSTRAINT psc_credit CHECK (state <> 'credit' OR credit_note IS NOT NULL)
);
CREATE TABLE IF NOT EXISTS public.pharmacy_claim_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id uuid NOT NULL REFERENCES public.pharmacy_supplier_claims(id) ON DELETE RESTRICT,
  product_id uuid NOT NULL REFERENCES public.pharmacy_products(id) ON DELETE RESTRICT,
  kind text NOT NULL CHECK (char_length(kind) BETWEEN 2 AND 60),
  packs integer NOT NULL CHECK (packs >= 0),
  value numeric(16,2) NOT NULL CHECK (value >= 0)
);
CREATE INDEX IF NOT EXISTS pcl_claim ON public.pharmacy_claim_lines (claim_id);
CREATE OR REPLACE FUNCTION private.pharmacy_claim_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF (SELECT kind FROM public.pharmacy_deliveries WHERE id = NEW.delivery_id) <> 'supplier' THEN
    RAISE EXCEPTION 'pharmacy_supplier_claims: only a supplier delivery makes a claim' USING ERRCODE = 'P0001', HINT = 'no_claim';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS psc_guard ON public.pharmacy_supplier_claims;
CREATE TRIGGER psc_guard BEFORE INSERT ON public.pharmacy_supplier_claims
  FOR EACH ROW EXECUTE FUNCTION private.pharmacy_claim_guard();

-- ─── RLS, audit ──────────────────────────────────────────────────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['pharmacy_pack_serials','pharmacy_delivery_photos','pharmacy_delivery_put_away',
    'pharmacy_supplier_claims','pharmacy_claim_lines'] LOOP
    IF t <> 'pharmacy_pack_serials' THEN
      EXECUTE format('DROP TRIGGER IF EXISTS audit_%1$s ON public.%1$I', t);
      EXECUTE format('CREATE TRIGGER audit_%1$s AFTER INSERT OR UPDATE OR DELETE ON public.%1$I
        FOR EACH ROW EXECUTE FUNCTION public.audit_log_changes()', t);
    END IF;
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
    EXECUTE format('GRANT SELECT ON public.%I TO medsync_clinical_reader', t);
    EXECUTE format('DROP POLICY IF EXISTS %1$s_select ON public.%1$I', t);
    IF t = 'pharmacy_claim_lines' THEN
      EXECUTE format('CREATE POLICY %1$s_select ON public.%1$I FOR SELECT TO medsync_clinical_reader
        USING (EXISTS (SELECT 1 FROM public.pharmacy_supplier_claims c WHERE c.id = claim_id
          AND c.hospital_id = (SELECT private.current_hospital_id())) AND (SELECT private.pharmacy_can(''pharmacy.view'')))', t);
    ELSE
      EXECUTE format('CREATE POLICY %1$s_select ON public.%1$I FOR SELECT TO medsync_clinical_reader
        USING (hospital_id = (SELECT private.current_hospital_id()) AND (SELECT private.pharmacy_can(''pharmacy.view'')))', t);
    END IF;
  END LOOP;
END $$;

-- ─── 10. Live ────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS pharmacy_stock_broadcast ON public.pharmacy_deliveries;
CREATE TRIGGER pharmacy_stock_broadcast AFTER INSERT OR UPDATE ON public.pharmacy_deliveries
  FOR EACH ROW EXECUTE FUNCTION public.pharmacy_stock_broadcast();

-- The in-charge's device hears an approval being asked, and the counting device hears the answer. A line has no hospital.
CREATE OR REPLACE FUNCTION public.pharmacy_delivery_line_broadcast()
  RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE h uuid;
BEGIN
  BEGIN
    SELECT d.hospital_id INTO h FROM public.pharmacy_deliveries d WHERE d.id = NEW.delivery_id;
    IF h IS NOT NULL THEN
      PERFORM realtime.send(jsonb_build_object('kind', TG_TABLE_NAME, 'at', now()), 'change',
        'pharmacy-stock:' || h::text, true);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.pharmacy_delivery_line_broadcast() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS pharmacy_delivery_line_broadcast ON public.pharmacy_delivery_lines;
CREATE TRIGGER pharmacy_delivery_line_broadcast AFTER UPDATE OF approval_asked_at, approved_by ON public.pharmacy_delivery_lines
  FOR EACH ROW EXECUTE FUNCTION public.pharmacy_delivery_line_broadcast();
