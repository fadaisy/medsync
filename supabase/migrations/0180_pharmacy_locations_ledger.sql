-- 0180 — Pharmacy Phase 2, part 1: stock locations and the ledger extended (LC-1 to LC-5, SL-12 to SL-18; ADRs 0370,
-- 0371, 0379; GATE A signed 21 Oct 2026).
--
-- GATED: owner-applied (`npm run db:migrate`), after 0136. ADDITIVE: no existing row is updated or deleted.
--
--   1. pharmacy_locations: five kinds (store, dispensing_point, ward, cart, quarantine). Every Phase 1 dispensing
--      point is copied in under its own id, and a trigger copies points made later, so `dispensing_point_id`
--      columns keep their meaning. A row's place is coalesce(location_id, dispensing_point_id).
--   2. pharmacy_counterparties: suppliers and other facilities (LC-2: no balance here).
--   3. The ledger: batches, movements and counts gain `location_id`; their `dispensing_point_id` becomes nullable
--      (always written for a point, so every Phase 1 read is unchanged). Movements gain the SL-12 kinds, `pair_id`
--      (SL-13, checked at commit), `unit_cost` (SL-17, on `received` only), `allocated` (SL-18) and
--      `counterparty_id`. The guard adds SL-14: a blocked batch (expired, in quarantine, or under an open recall)
--      takes no out-movement except into quarantine or back to the supplier; downtime back-entry is the exception.
--   4. pharmacy_cost_corrections (SL-17), the GTIN on products (SC-3), product-location placement.
--   5. Permission map v3: `pharmacy.store` for both pharmacy cadres; `pharmacy.manage` also for the head of a store.
--      Ward and cart rights come from hub assignments (private.pharmacy_location_right), outside `pharmacy.*`.

CREATE SCHEMA IF NOT EXISTS private;

-- ─── 1. Locations ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pharmacy_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  kind text NOT NULL CHECK (kind IN ('store','dispensing_point','ward','cart','quarantine')),
  -- The hub unit it is, or belongs to. A ward is its hub ward; a cart names its crash cart.
  department_id uuid REFERENCES public.hospital_departments(id) ON DELETE RESTRICT,
  ward_id uuid REFERENCES public.hospital_wards(id) ON DELETE RESTRICT,
  crash_cart_id uuid REFERENCES public.crash_carts(id) ON DELETE RESTRICT,
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
  -- D-PH2-05: a ward is stocked (counted) or issue-only (receipts are use); nothing defaults.
  ward_supply_model text CHECK (ward_supply_model IS NULL OR ward_supply_model IN ('stocked','issue_only')),
  -- D-PH2-04: any nurse on the ward may confirm receipt, if the site allows.
  any_nurse_confirms boolean NOT NULL DEFAULT false,
  in_charge_user_id uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  live_at timestamptz,
  switched_off_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz,
  CONSTRAINT pl_point_id CHECK (kind <> 'dispensing_point' OR department_id = id),
  CONSTRAINT pl_ward CHECK ((kind = 'ward') = (ward_id IS NOT NULL) AND (kind = 'ward' OR ward_supply_model IS NULL)),
  CONSTRAINT pl_unit CHECK (kind NOT IN ('store','dispensing_point') OR department_id IS NOT NULL),
  CONSTRAINT pl_cart CHECK (kind <> 'cart' OR crash_cart_id IS NOT NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS pl_one_ward ON public.pharmacy_locations (ward_id) WHERE ward_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS pl_one_cart ON public.pharmacy_locations (crash_cart_id) WHERE crash_cart_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS pl_hospital ON public.pharmacy_locations (hospital_id, kind);

-- LC-1: Phase 1's points, copied under their own id. Their live state stays on pharmacy_dispensing_points.
INSERT INTO public.pharmacy_locations (id, hospital_id, kind, department_id, name)
SELECT p.department_id, p.hospital_id, 'dispensing_point', p.department_id, d.name
  FROM public.pharmacy_dispensing_points p JOIN public.hospital_departments d ON d.id = p.department_id
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION private.pharmacy_point_location() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  INSERT INTO public.pharmacy_locations (id, hospital_id, kind, department_id, name)
  SELECT NEW.department_id, NEW.hospital_id, 'dispensing_point', NEW.department_id, d.name
    FROM public.hospital_departments d WHERE d.id = NEW.department_id
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS pdp_location ON public.pharmacy_dispensing_points;
CREATE TRIGGER pdp_location AFTER INSERT ON public.pharmacy_dispensing_points
  FOR EACH ROW EXECUTE FUNCTION private.pharmacy_point_location();

-- The live state is changed only by a go-live row (GL2-1), and nothing else about a location's identity changes.
CREATE OR REPLACE FUNCTION private.pharmacy_location_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'pharmacy_locations: a location is archived, never deleted'; END IF;
  IF NEW.id <> OLD.id OR NEW.hospital_id <> OLD.hospital_id OR NEW.kind <> OLD.kind
     OR NEW.department_id IS DISTINCT FROM OLD.department_id OR NEW.ward_id IS DISTINCT FROM OLD.ward_id
     OR NEW.crash_cart_id IS DISTINCT FROM OLD.crash_cart_id THEN
    RAISE EXCEPTION 'pharmacy_locations: what a location is never changes';
  END IF;
  IF (NEW.live_at IS DISTINCT FROM OLD.live_at OR NEW.switched_off_at IS DISTINCT FROM OLD.switched_off_at)
     AND current_setting('pharmacy.golive', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'pharmacy_locations: a location goes live or off only through the go-live record';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS pl_guard ON public.pharmacy_locations;
CREATE TRIGGER pl_guard BEFORE UPDATE OR DELETE ON public.pharmacy_locations
  FOR EACH ROW EXECUTE FUNCTION private.pharmacy_location_guard();

-- GL2-1: the Phase 1 two-person switch, for stores, wards, carts and quarantine.
CREATE TABLE IF NOT EXISTS public.pharmacy_location_golive (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  location_id uuid NOT NULL REFERENCES public.pharmacy_locations(id) ON DELETE RESTRICT,
  action text NOT NULL CHECK (action IN ('on','off')),
  conditions jsonb NOT NULL,
  reason text CHECK (reason IS NULL OR char_length(reason) BETWEEN 10 AND 500),
  requested_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  approved_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  approval_attestation_id uuid REFERENCES public.pharmacy_attestations(id) ON DELETE RESTRICT,
  at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT plg_second_person CHECK (approved_by <> requested_by),
  CONSTRAINT plg_off_reason CHECK (action = 'on' OR reason IS NOT NULL)
);
CREATE OR REPLACE FUNCTION private.pharmacy_location_golive_apply() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM set_config('pharmacy.golive', 'on', true);
  IF NEW.action = 'on' THEN
    UPDATE public.pharmacy_locations SET live_at = NEW.at, switched_off_at = NULL WHERE id = NEW.location_id;
  ELSE
    UPDATE public.pharmacy_locations SET switched_off_at = NEW.at WHERE id = NEW.location_id;
  END IF;
  PERFORM set_config('pharmacy.golive', 'off', true);
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS plg_apply ON public.pharmacy_location_golive;
CREATE TRIGGER plg_apply AFTER INSERT ON public.pharmacy_location_golive
  FOR EACH ROW EXECUTE FUNCTION private.pharmacy_location_golive_apply();

-- ─── 2. Counterparties (LC-2) ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pharmacy_counterparties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  kind text NOT NULL CHECK (kind IN ('supplier','facility')),
  name text NOT NULL CHECK (char_length(name) BETWEEN 2 AND 160),
  code text CHECK (code IS NULL OR char_length(code) BETWEEN 1 AND 40),
  takes_returns boolean NOT NULL DEFAULT false,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  retired_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS pcp_name ON public.pharmacy_counterparties (hospital_id, kind, lower(name));

-- ─── 3. Products: GTIN (SC-3) and placement at any location ─────────────
ALTER TABLE public.pharmacy_products ADD COLUMN IF NOT EXISTS gtin text
  CHECK (gtin IS NULL OR gtin ~ '^[0-9]{14}$');
CREATE UNIQUE INDEX IF NOT EXISTS pp_gtin ON public.pharmacy_products (hospital_id, gtin)
  WHERE gtin IS NOT NULL AND active;

CREATE TABLE IF NOT EXISTS public.pharmacy_product_locations (
  product_id uuid NOT NULL REFERENCES public.pharmacy_products(id) ON DELETE RESTRICT,
  location_id uuid NOT NULL REFERENCES public.pharmacy_locations(id) ON DELETE RESTRICT,
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  active boolean NOT NULL DEFAULT true,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  ended_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  PRIMARY KEY (product_id, location_id)
);

-- ─── 4. The ledger ───────────────────────────────────────────────────────
ALTER TABLE public.pharmacy_batches ALTER COLUMN dispensing_point_id DROP NOT NULL;
ALTER TABLE public.pharmacy_batches ADD COLUMN IF NOT EXISTS location_id uuid
  REFERENCES public.pharmacy_locations(id) ON DELETE RESTRICT;
ALTER TABLE public.pharmacy_batches DROP CONSTRAINT IF EXISTS pb_place;
ALTER TABLE public.pharmacy_batches ADD CONSTRAINT pb_place CHECK (
  coalesce(location_id, dispensing_point_id) IS NOT NULL
  AND (location_id IS NULL OR dispensing_point_id IS NULL OR location_id = dispensing_point_id));
CREATE UNIQUE INDEX IF NOT EXISTS pb_place_batch ON public.pharmacy_batches
  (coalesce(location_id, dispensing_point_id), product_id, batch_number);

ALTER TABLE public.pharmacy_counts ALTER COLUMN dispensing_point_id DROP NOT NULL;
ALTER TABLE public.pharmacy_counts ADD COLUMN IF NOT EXISTS location_id uuid
  REFERENCES public.pharmacy_locations(id) ON DELETE RESTRICT;
ALTER TABLE public.pharmacy_counts DROP CONSTRAINT IF EXISTS pharmacy_counts_scope_check;
ALTER TABLE public.pharmacy_counts ADD CONSTRAINT pharmacy_counts_scope_check CHECK (scope IN
  ('medicine','full','controlled_supply','controlled_shift','opening','ward','cart','month_end','delivery'));
ALTER TABLE public.pharmacy_counts DROP CONSTRAINT IF EXISTS pc_place;
ALTER TABLE public.pharmacy_counts ADD CONSTRAINT pc_place CHECK (coalesce(location_id, dispensing_point_id) IS NOT NULL);

ALTER TABLE public.pharmacy_stock_movements ALTER COLUMN dispensing_point_id DROP NOT NULL;
ALTER TABLE public.pharmacy_stock_movements
  ADD COLUMN IF NOT EXISTS location_id uuid REFERENCES public.pharmacy_locations(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS pair_id uuid,
  ADD COLUMN IF NOT EXISTS unit_cost numeric(14,2) CHECK (unit_cost IS NULL OR unit_cost >= 0),
  ADD COLUMN IF NOT EXISTS allocated boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS counterparty_id uuid REFERENCES public.pharmacy_counterparties(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS loan_movement_id uuid REFERENCES public.pharmacy_stock_movements(id) ON DELETE RESTRICT;
ALTER TABLE public.pharmacy_stock_movements DROP CONSTRAINT IF EXISTS pharmacy_stock_movements_kind_check;
ALTER TABLE public.pharmacy_stock_movements ADD CONSTRAINT pharmacy_stock_movements_kind_check CHECK (kind IN (
  'received','supplied','reversed','adjusted','count_correction','transfer_out','transfer_in',
  'issued','received_from_issue','returned_out','returned_in','lent','borrowed','loan_returned_out',
  'loan_returned_in','ward_used','cart_used','quarantined_out','quarantined_in','written_off','returned_to_supplier'));
ALTER TABLE public.pharmacy_stock_movements DROP CONSTRAINT IF EXISTS pharmacy_stock_movements_source_kind_check;
ALTER TABLE public.pharmacy_stock_movements ADD CONSTRAINT pharmacy_stock_movements_source_kind_check CHECK (source_kind IN (
  'delivery','supply','reversal','count','adjustment','transfer','found_on_shelf','downtime',
  'issue','return','loan','quarantine','write_off','supplier_return','opening'));
ALTER TABLE public.pharmacy_stock_movements DROP CONSTRAINT IF EXISTS psm_sign;
ALTER TABLE public.pharmacy_stock_movements ADD CONSTRAINT psm_sign CHECK (
  (kind IN ('received','reversed','transfer_in','received_from_issue','returned_in','borrowed','loan_returned_in',
            'quarantined_in') AND quantity > 0)
  OR (kind IN ('supplied','transfer_out','issued','returned_out','lent','loan_returned_out','ward_used','cart_used',
               'quarantined_out','written_off','returned_to_supplier') AND quantity < 0)
  OR kind IN ('adjusted','count_correction'));
ALTER TABLE public.pharmacy_stock_movements DROP CONSTRAINT IF EXISTS psm_place;
ALTER TABLE public.pharmacy_stock_movements ADD CONSTRAINT psm_place CHECK (
  coalesce(location_id, dispensing_point_id) IS NOT NULL
  AND (location_id IS NULL OR dispensing_point_id IS NULL OR location_id = dispensing_point_id));
ALTER TABLE public.pharmacy_stock_movements DROP CONSTRAINT IF EXISTS psm_pairs;
ALTER TABLE public.pharmacy_stock_movements ADD CONSTRAINT psm_pairs CHECK (
  (kind IN ('issued','received_from_issue','returned_out','returned_in','quarantined_out','quarantined_in'))
  = (pair_id IS NOT NULL));
ALTER TABLE public.pharmacy_stock_movements DROP CONSTRAINT IF EXISTS psm_cost;
ALTER TABLE public.pharmacy_stock_movements ADD CONSTRAINT psm_cost CHECK (unit_cost IS NULL OR kind = 'received');
ALTER TABLE public.pharmacy_stock_movements DROP CONSTRAINT IF EXISTS psm_counterparty;
ALTER TABLE public.pharmacy_stock_movements ADD CONSTRAINT psm_counterparty CHECK (
  kind NOT IN ('lent','borrowed','loan_returned_out','loan_returned_in','returned_to_supplier')
  OR counterparty_id IS NOT NULL);
ALTER TABLE public.pharmacy_stock_movements DROP CONSTRAINT IF EXISTS psm_loan_link;
ALTER TABLE public.pharmacy_stock_movements ADD CONSTRAINT psm_loan_link CHECK (
  (kind IN ('loan_returned_out','loan_returned_in')) = (loan_movement_id IS NOT NULL));
CREATE INDEX IF NOT EXISTS psm_location_day ON public.pharmacy_stock_movements
  (coalesce(location_id, dispensing_point_id), effective_at);
CREATE INDEX IF NOT EXISTS psm_pair ON public.pharmacy_stock_movements (pair_id) WHERE pair_id IS NOT NULL;

-- Batches at a location, kept with Phase 1's per-batch rules: only number and expiry are ever corrected.
CREATE OR REPLACE FUNCTION private.pharmacy_batch_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'pharmacy_batches: a batch is never deleted'; END IF;
  IF NEW.id <> OLD.id OR NEW.hospital_id <> OLD.hospital_id
     OR NEW.dispensing_point_id IS DISTINCT FROM OLD.dispensing_point_id
     OR NEW.location_id IS DISTINCT FROM OLD.location_id
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

-- ─── 5. Recalls (RC-1), needed by the guard ──────────────────────────────
CREATE TABLE IF NOT EXISTS public.pharmacy_recalls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  product_id uuid NOT NULL REFERENCES public.pharmacy_products(id) ON DELETE RESTRICT,
  -- NULL: every batch of the product.
  batch_number text CHECK (batch_number IS NULL OR char_length(batch_number) BETWEEN 1 AND 60),
  source text NOT NULL CHECK (source IN ('nda','supplier','manufacturer','hospital')),
  notice_ref text NOT NULL CHECK (char_length(notice_ref) BETWEEN 1 AND 120),
  notice_date date NOT NULL,
  stated_class text NOT NULL CHECK (stated_class IN ('A','B','C','not_stated')),
  level text NOT NULL CHECK (char_length(level) BETWEEN 2 AND 200),
  instructions text NOT NULL CHECK (char_length(instructions) BETWEEN 2 AND 2000),
  -- D-PH2-17: list 4 is messaged only when the CSO approves it for this recall.
  may_have_message_approved_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  may_have_message_approved_at timestamptz,
  started_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  started_at timestamptz NOT NULL DEFAULT now(),
  closed_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  closed_at timestamptz,
  returned_quantity integer CHECK (returned_quantity IS NULL OR returned_quantity >= 0),
  destroyed_quantity integer CHECK (destroyed_quantity IS NULL OR destroyed_quantity >= 0),
  close_note text CHECK (close_note IS NULL OR char_length(close_note) <= 1000),
  CONSTRAINT prc_closed CHECK ((closed_at IS NULL) = (closed_by IS NULL)
    AND (closed_at IS NULL OR (returned_quantity IS NOT NULL AND destroyed_quantity IS NOT NULL)))
);
CREATE INDEX IF NOT EXISTS prc_open ON public.pharmacy_recalls (hospital_id, product_id) WHERE closed_at IS NULL;
CREATE OR REPLACE FUNCTION private.pharmacy_recall_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' OR OLD.closed_at IS NOT NULL THEN
    RAISE EXCEPTION 'pharmacy_recalls: a closed recall never changes';
  END IF;
  IF (to_jsonb(NEW) - ARRAY['closed_at','closed_by','returned_quantity','destroyed_quantity','close_note',
        'may_have_message_approved_by','may_have_message_approved_at'])
     IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['closed_at','closed_by','returned_quantity','destroyed_quantity',
        'close_note','may_have_message_approved_by','may_have_message_approved_at']) THEN
    RAISE EXCEPTION 'pharmacy_recalls: only the approval and the close change a recall';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS prc_guard ON public.pharmacy_recalls;
CREATE TRIGGER prc_guard BEFORE UPDATE OR DELETE ON public.pharmacy_recalls
  FOR EACH ROW EXECUTE FUNCTION private.pharmacy_recall_guard();

-- RC-1: a batch is under an open recall if its product matches and its number, now or before a correction, does.
CREATE OR REPLACE FUNCTION private.pharmacy_batch_recalled(p_batch uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.pharmacy_batches b
      JOIN public.pharmacy_recalls r ON r.product_id = b.product_id AND r.hospital_id = b.hospital_id
     WHERE b.id = p_batch AND r.closed_at IS NULL
       AND (r.batch_number IS NULL
            OR lower(r.batch_number) = lower(b.batch_number)
            OR lower(r.batch_number) = lower(b.first_batch_number)
            OR EXISTS (SELECT 1 FROM public.pharmacy_batch_corrections c
                        WHERE c.batch_id = b.id AND lower(c.old_batch_number) = lower(r.batch_number))));
$$;

-- SL-4, SL-5, SL-14: the guard, extended to every location. The batch row lock serialises every movement on a batch.
CREATE OR REPLACE FUNCTION private.pharmacy_movement_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE
  _b public.pharmacy_batches;
  _balance bigint;
  _place uuid := coalesce(NEW.location_id, NEW.dispensing_point_id);
  _kind text;
BEGIN
  SELECT * INTO _b FROM public.pharmacy_batches WHERE id = NEW.batch_id FOR UPDATE;
  IF coalesce(_b.location_id, _b.dispensing_point_id) <> _place OR _b.hospital_id <> NEW.hospital_id THEN
    RAISE EXCEPTION 'pharmacy_stock: batch % is not at this location', NEW.batch_id;
  END IF;
  IF NEW.downtime THEN RETURN NEW; END IF;
  SELECT kind INTO _kind FROM public.pharmacy_locations WHERE id = _place;
  -- SL-14: blocked batches leave only into quarantine, back to the supplier, or by write-off from quarantine.
  IF NEW.quantity < 0 AND NEW.kind NOT IN ('adjusted','count_correction','ward_used','cart_used',
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

-- SL-13: a paired kind has its other leg, same pair id and opposite quantity, by the end of the transaction.
CREATE OR REPLACE FUNCTION private.pharmacy_pair_check() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE
  _other text := CASE NEW.kind
    WHEN 'issued' THEN 'received_from_issue' WHEN 'received_from_issue' THEN 'issued'
    WHEN 'returned_out' THEN 'returned_in' WHEN 'returned_in' THEN 'returned_out'
    WHEN 'quarantined_out' THEN 'quarantined_in' WHEN 'quarantined_in' THEN 'quarantined_out' END;
BEGIN
  IF _other IS NULL THEN RETURN NULL; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.pharmacy_stock_movements m
                  WHERE m.pair_id = NEW.pair_id AND m.kind = _other AND m.quantity = -NEW.quantity
                    AND m.id <> NEW.id) THEN
    RAISE EXCEPTION 'pharmacy_stock: % without its other leg (SL-13)', NEW.kind USING ERRCODE = 'P0001', HINT = 'one_leg';
  END IF;
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS psm_pair_check ON public.pharmacy_stock_movements;
CREATE CONSTRAINT TRIGGER psm_pair_check AFTER INSERT ON public.pharmacy_stock_movements
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION private.pharmacy_pair_check();

-- Phase 1's stock-out projection is per dispensing point; rows elsewhere are skipped (CN-3 projects the hospital).
CREATE OR REPLACE FUNCTION private.pharmacy_stockout_project() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE
  _medicine text;
  _total bigint;
BEGIN
  IF NEW.dispensing_point_id IS NULL THEN RETURN NULL; END IF;
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

-- SL-17: a mistyped cost is corrected by an event, never by editing the receipt.
CREATE TABLE IF NOT EXISTS public.pharmacy_cost_corrections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  movement_id uuid NOT NULL REFERENCES public.pharmacy_stock_movements(id) ON DELETE RESTRICT,
  old_cost numeric(14,2),
  new_cost numeric(14,2) NOT NULL CHECK (new_cost >= 0),
  reason text NOT NULL CHECK (char_length(reason) BETWEEN 3 AND 300),
  actor_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  corrected_at timestamptz NOT NULL DEFAULT now()
);

-- ─── 6. Permission map v3 and location rights ───────────────────────────
CREATE OR REPLACE FUNCTION private.pharmacy_cadre_permissions(p_cadre text)
RETURNS text[]
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog AS $$
  -- Permission map v3 (signed 21 Oct 2026): `pharmacy.store` added for both pharmacy cadres.
  SELECT CASE p_cadre
    WHEN 'PHARMACIST' THEN ARRAY['pharmacy.view','pharmacy.review','pharmacy.dispense','pharmacy.stock',
                                 'pharmacy.controlled','pharmacy.store']
    WHEN 'PHARMACY_TECH' THEN ARRAY['pharmacy.view','pharmacy.dispense','pharmacy.stock','pharmacy.store']
    ELSE ARRAY[]::text[]
  END;
$$;

CREATE OR REPLACE FUNCTION private.pharmacy_can_user(p_user uuid, p_hospital uuid, p_perm text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT p_user IS NOT NULL AND p_hospital IS NOT NULL AND (
    CASE WHEN p_perm = 'pharmacy.manage' THEN
      EXISTS (
        SELECT 1
          FROM public.department_heads h
          JOIN public.hospital_departments d ON d.id = h.department_id
          LEFT JOIN public.hospital_departments parent ON parent.id = d.parent_id
         WHERE h.user_id = p_user
           AND h.hospital_id = p_hospital
           AND h.starts_at <= now()
           AND (h.ends_at IS NULL OR h.ends_at > now())
           AND (d.catalogue_code = 'PHARMACY'
                OR (parent.catalogue_code = 'PHARMACY'
                    AND (EXISTS (SELECT 1 FROM public.pharmacy_dispensing_points p WHERE p.department_id = d.id)
                         OR EXISTS (SELECT 1 FROM public.pharmacy_locations l
                                     WHERE l.department_id = d.id AND l.kind IN ('store','quarantine')))))
      )
      AND EXISTS (
        SELECT 1 FROM public.staff_affiliations sa JOIN public.cadres c ON c.id = sa.cadre_id
         WHERE sa.user_id = p_user AND sa.hospital_id = p_hospital
           AND sa.state IN ('approved','active') AND c.code IN ('PHARMACIST','PHARMACY_TECH')
      )
    ELSE
      EXISTS (
        SELECT 1 FROM public.staff_affiliations sa JOIN public.cadres c ON c.id = sa.cadre_id
         WHERE sa.user_id = p_user AND sa.hospital_id = p_hospital
           AND sa.state IN ('approved','active')
           AND p_perm = ANY (private.pharmacy_cadre_permissions(c.code))
      )
    END
  );
$$;

-- Appendix A: hub-assignment rights at a ward or cart, outside `pharmacy.*` (Phase 1 PA2-5 still holds).
--   ward_act     the ward's nurse in charge: requisitions, ward counts, receipt, notices
--   ward_read    ward_act, or (when the site allows) a nurse affiliated to the ward's department
--   ward_confirm ward_act, or ward_read when the location allows any nurse to confirm (D-PH2-04)
--   cart_confirm the head of the cart's unit (nurse in charge or clinical lead), or the in-charge of its ward
CREATE OR REPLACE FUNCTION private.pharmacy_location_right(p_user uuid, p_location uuid, p_right text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  WITH l AS (SELECT * FROM public.pharmacy_locations WHERE id = p_location AND archived_at IS NULL),
  in_charge AS (
    SELECT EXISTS (SELECT 1 FROM l JOIN public.ward_in_charge_assignments w ON w.ward_id = l.ward_id
                    WHERE w.nurse_user_id = p_user AND w.starts_at <= now()
                      AND (w.ends_at IS NULL OR w.ends_at > now())) AS ok),
  on_ward AS (
    SELECT EXISTS (SELECT 1 FROM l JOIN public.hospital_wards hw ON hw.id = l.ward_id
                     JOIN public.staff_affiliations sa ON sa.department_id = hw.department_id
                      AND sa.hospital_id = l.hospital_id AND sa.user_id = p_user
                      AND sa.state IN ('approved','active')
                     JOIN public.cadres c ON c.id = sa.cadre_id AND c.code ILIKE '%NURS%'
                    WHERE l.any_nurse_confirms) AS ok),
  cart_head AS (
    SELECT EXISTS (SELECT 1 FROM l JOIN public.crash_carts cc ON cc.id = l.crash_cart_id
                     JOIN public.department_heads h ON h.department_id = cc.department_id
                    WHERE l.kind = 'cart' AND h.user_id = p_user AND h.starts_at <= now()
                      AND (h.ends_at IS NULL OR h.ends_at > now()))
        OR EXISTS (SELECT 1 FROM l JOIN public.crash_carts cc ON cc.id = l.crash_cart_id
                     JOIN public.hospital_wards hw ON hw.department_id = cc.department_id
                     JOIN public.ward_in_charge_assignments w ON w.ward_id = hw.id
                    WHERE l.kind = 'cart' AND w.nurse_user_id = p_user AND w.starts_at <= now()
                      AND (w.ends_at IS NULL OR w.ends_at > now())) AS ok)
  SELECT p_user IS NOT NULL AND EXISTS (SELECT 1 FROM l) AND CASE p_right
    WHEN 'ward_act' THEN (SELECT ok FROM in_charge)
    WHEN 'ward_read' THEN (SELECT ok FROM in_charge) OR (SELECT ok FROM on_ward)
    WHEN 'ward_confirm' THEN (SELECT ok FROM in_charge) OR (SELECT ok FROM on_ward)
    WHEN 'cart_confirm' THEN (SELECT ok FROM cart_head)
    ELSE false END;
$$;

-- Reads: pharmacy staff of the hospital, or a person with a ward or cart right at that location.
CREATE OR REPLACE FUNCTION private.pharmacy_location_reader(p_location uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT private.pharmacy_location_right(private.current_user_id(), p_location, 'ward_read')
      OR private.pharmacy_location_right(private.current_user_id(), p_location, 'cart_confirm');
$$;
REVOKE ALL ON FUNCTION private.pharmacy_location_right(uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.pharmacy_location_reader(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.pharmacy_location_reader(uuid) TO medsync_clinical_reader;

-- ─── 7. Grants, RLS, audit ───────────────────────────────────────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['pharmacy_locations','pharmacy_location_golive','pharmacy_counterparties',
    'pharmacy_product_locations','pharmacy_recalls','pharmacy_cost_corrections'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS audit_%1$s ON public.%1$I', t);
    EXECUTE format('CREATE TRIGGER audit_%1$s AFTER INSERT OR UPDATE OR DELETE ON public.%1$I
      FOR EACH ROW EXECUTE FUNCTION public.audit_log_changes()', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
    EXECUTE format('GRANT SELECT ON public.%I TO medsync_clinical_reader', t);
    EXECUTE format('DROP POLICY IF EXISTS %1$s_select ON public.%1$I', t);
    EXECUTE format('CREATE POLICY %1$s_select ON public.%1$I FOR SELECT TO medsync_clinical_reader
      USING (hospital_id = (SELECT private.current_hospital_id()) AND (SELECT private.pharmacy_can(''pharmacy.view'')))', t);
  END LOOP;
  FOREACH t IN ARRAY ARRAY['pharmacy_location_golive','pharmacy_cost_corrections'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %1$s_append_only ON public.%1$I', t);
    EXECUTE format('CREATE TRIGGER %1$s_append_only BEFORE UPDATE OR DELETE ON public.%1$I
      FOR EACH ROW EXECUTE FUNCTION public.block_modify_append_only()', t);
  END LOOP;
END $$;

-- A ward's or cart's people read their own location, its batches and its movements (Section 7 probes).
DROP POLICY IF EXISTS pharmacy_locations_people ON public.pharmacy_locations;
CREATE POLICY pharmacy_locations_people ON public.pharmacy_locations FOR SELECT TO medsync_clinical_reader
  USING (hospital_id = (SELECT private.current_hospital_id()) AND private.pharmacy_location_reader(id));
DROP POLICY IF EXISTS pharmacy_batches_people ON public.pharmacy_batches;
CREATE POLICY pharmacy_batches_people ON public.pharmacy_batches FOR SELECT TO medsync_clinical_reader
  USING (location_id IS NOT NULL AND hospital_id = (SELECT private.current_hospital_id())
         AND private.pharmacy_location_reader(location_id));
DROP POLICY IF EXISTS pharmacy_stock_movements_people ON public.pharmacy_stock_movements;
CREATE POLICY pharmacy_stock_movements_people ON public.pharmacy_stock_movements FOR SELECT TO medsync_clinical_reader
  USING (location_id IS NOT NULL AND hospital_id = (SELECT private.current_hospital_id())
         AND private.pharmacy_location_reader(location_id));
DROP POLICY IF EXISTS pharmacy_product_locations_people ON public.pharmacy_product_locations;
CREATE POLICY pharmacy_product_locations_people ON public.pharmacy_product_locations FOR SELECT
  TO medsync_clinical_reader
  USING (hospital_id = (SELECT private.current_hospital_id()) AND private.pharmacy_location_reader(location_id));
DROP POLICY IF EXISTS pharmacy_products_people ON public.pharmacy_products;
CREATE POLICY pharmacy_products_people ON public.pharmacy_products FOR SELECT TO medsync_clinical_reader
  USING (hospital_id = (SELECT private.current_hospital_id()) AND EXISTS (
    SELECT 1 FROM public.pharmacy_product_locations pl
     WHERE pl.product_id = pharmacy_products.id AND private.pharmacy_location_reader(pl.location_id)));
