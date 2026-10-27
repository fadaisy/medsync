-- 0257 — A hospital's own prices: payers, point charge modes, pay before collecting, price rules that propose, prices
-- from a date, supplier price lists, and the supply's snapshot kind (catalogue slice Step 8; ADRs 0460, 0461).
--
-- GATED: owner-applied (`npm run db:migrate`), after 0256. (GATE A numbered this 0256; A-7 moved it.)
--
-- Laws 10–14 and D-CAT-10/-11. Every table is hospital-scoped under RLS; nothing is shared across hospitals and the
-- catalogue holds no price (S32). Prices are integer Uganda shillings; a price is > 0 or the row is `free` (Law 11:
-- UGX 0 is never stored). Prices, charge modes, pay-first settings and rules are append-only: a change is a new row
-- from a date (Law 12). No price rule is shipped (D-CAT-10). Pay before collecting is per point and off until set
-- (D-CAT-11); with no row the hospital's `payment_status_required` stands, so nothing changes on apply.
-- The existing `pharmacy_products.price_ugx` is copied in as payer `cash`, source `typed`, from its last update
-- date; the column stays (never dropped in this slice). A zero price is not copied: it becomes "Price not set".
-- `pharmacy_supplies` gains `payer_id` and `price_kind` (priced | free | price_not_set) beside its `price_ugx`
-- snapshot. No ledger table is read or changed. ADDITIVE and re-runnable.
-- Reverse: ALTER TABLE public.pharmacy_supplies DROP COLUMN price_kind, DROP COLUMN payer_id; DROP TABLE
--   public.pharmacy_price_list_lines, public.pharmacy_price_lists, public.pharmacy_product_prices,
--   public.pharmacy_price_rules, public.pharmacy_point_pay_first, public.pharmacy_point_charge_modes,
--   public.pharmacy_payers.

CREATE TABLE IF NOT EXISTS public.pharmacy_payers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  code text NOT NULL CHECK (code ~ '^[a-z0-9_]{2,40}$'),
  name text NOT NULL CHECK (char_length(name) BETWEEN 2 AND 120),
  kind text NOT NULL CHECK (kind IN ('cash','scheme','staff','other')),
  active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (hospital_id, code)
);

CREATE TABLE IF NOT EXISTS public.pharmacy_point_charge_modes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  dispensing_point_id uuid NOT NULL REFERENCES public.pharmacy_dispensing_points(department_id) ON DELETE CASCADE,
  mode text NOT NULL CHECK (mode IN ('charged','free')),
  from_date date NOT NULL,
  set_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ppcm_point ON public.pharmacy_point_charge_modes (dispensing_point_id, from_date DESC, created_at DESC);

CREATE TABLE IF NOT EXISTS public.pharmacy_point_pay_first (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  dispensing_point_id uuid NOT NULL REFERENCES public.pharmacy_dispensing_points(department_id) ON DELETE CASCADE,
  required boolean NOT NULL,
  from_date date NOT NULL,
  set_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pppf_point ON public.pharmacy_point_pay_first (dispensing_point_id, from_date DESC, created_at DESC);

CREATE TABLE IF NOT EXISTS public.pharmacy_price_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  multiplier numeric(6,3) NOT NULL CHECK (multiplier > 0 AND multiplier <= 100),
  rounding_step integer NOT NULL CHECK (rounding_step BETWEEN 1 AND 100000),
  -- {payer_id: multiplier} applied after the markup; a payer not named pays the markup price.
  payer_adjustments jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(payer_adjustments) = 'object'),
  from_date date NOT NULL,
  set_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ppr_hospital ON public.pharmacy_price_rules (hospital_id, from_date DESC, created_at DESC);

CREATE TABLE IF NOT EXISTS public.pharmacy_product_prices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.pharmacy_products(id) ON DELETE CASCADE,
  payer_id uuid NOT NULL REFERENCES public.pharmacy_payers(id) ON DELETE RESTRICT,
  price_ugx integer CHECK (price_ugx IS NULL OR price_ugx > 0),
  free boolean NOT NULL DEFAULT false,
  from_date date NOT NULL,
  source text NOT NULL CHECK (source IN ('rule_accepted','typed','import')),
  -- The arithmetic a person accepted (S26), kept with the price.
  basis jsonb,
  set_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ppp_price_or_free CHECK ((free AND price_ugx IS NULL) OR (NOT free AND price_ugx IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS ppp_product ON public.pharmacy_product_prices (product_id, payer_id, from_date DESC, created_at DESC);

CREATE TABLE IF NOT EXISTS public.pharmacy_price_lists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  supplier_id uuid NOT NULL REFERENCES public.pharmacy_counterparties(id) ON DELETE RESTRICT,
  edition_date date NOT NULL,
  file_name text CHECK (file_name IS NULL OR char_length(file_name) <= 200),
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.pharmacy_price_list_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  price_list_id uuid NOT NULL REFERENCES public.pharmacy_price_lists(id) ON DELETE CASCADE,
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  raw_text text NOT NULL CHECK (char_length(raw_text) BETWEEN 1 AND 500),
  pack_id uuid REFERENCES public.cat_packs(id) ON DELETE RESTRICT,
  product_id uuid REFERENCES public.pharmacy_products(id) ON DELETE SET NULL,
  pack_price_ugx integer CHECK (pack_price_ugx IS NULL OR pack_price_ugx > 0),
  supplier_code text CHECK (supplier_code IS NULL OR char_length(supplier_code) <= 80),
  gtin text CHECK (gtin IS NULL OR gtin ~ '^\d{14}$'),
  matched_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ppll_list ON public.pharmacy_price_list_lines (price_list_id);
CREATE INDEX IF NOT EXISTS ppll_pack ON public.pharmacy_price_list_lines (hospital_id, pack_id) WHERE pack_id IS NOT NULL;

ALTER TABLE public.pharmacy_supplies
  ADD COLUMN IF NOT EXISTS payer_id uuid REFERENCES public.pharmacy_payers(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS price_kind text CHECK (price_kind IS NULL OR price_kind IN ('priced','free','price_not_set'));

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['pharmacy_payers','pharmacy_point_charge_modes','pharmacy_point_pay_first',
    'pharmacy_price_rules','pharmacy_product_prices','pharmacy_price_lists','pharmacy_price_list_lines'] LOOP
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
    -- Law 12: history is append-only, except a payer's `active` and a price list line's match.
    IF t IN ('pharmacy_point_charge_modes','pharmacy_point_pay_first','pharmacy_price_rules','pharmacy_product_prices') THEN
      EXECUTE format('DROP TRIGGER IF EXISTS %1$s_append_only ON public.%1$I', t);
      EXECUTE format('CREATE TRIGGER %1$s_append_only BEFORE UPDATE OR DELETE ON public.%1$I
        FOR EACH ROW EXECUTE FUNCTION public.block_modify_append_only()', t);
    END IF;
  END LOOP;
END $$;

-- The cash payer, for every hospital that has a product.
INSERT INTO public.pharmacy_payers (hospital_id, code, name, kind)
SELECT DISTINCT p.hospital_id, 'cash', 'Cash', 'cash' FROM public.pharmacy_products p
ON CONFLICT (hospital_id, code) DO NOTHING;

-- The existing single price, as cash, from its last update date (a zero is not a price: Law 11).
INSERT INTO public.pharmacy_product_prices (hospital_id, product_id, payer_id, price_ugx, from_date, source, set_by, basis)
SELECT p.hospital_id, p.id, y.id, round(p.price_ugx)::integer, (p.updated_at AT TIME ZONE 'Africa/Kampala')::date,
       'typed', p.created_by, jsonb_build_object('migrated_from', 'pharmacy_products.price_ugx', 'value', p.price_ugx)
  FROM public.pharmacy_products p
  JOIN public.pharmacy_payers y ON y.hospital_id = p.hospital_id AND y.code = 'cash'
 WHERE p.price_ugx IS NOT NULL AND round(p.price_ugx) > 0
   AND NOT EXISTS (SELECT 1 FROM public.pharmacy_product_prices x
                    WHERE x.product_id = p.id AND x.basis->>'migrated_from' = 'pharmacy_products.price_ugx');
