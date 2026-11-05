-- 0277 — Health and laboratory supplies across the pharmacy (SUPPLIES.md, EMHSLU 2023 Sections B, C, D).
--
-- GATED: owner-applied (`npm run db:migrate`), after 0276. 0278 loads the list.
--
--   1. cat_supply_items: the master list, read-only to the hospital. Section C is readable only where the hospital's
--      switch (pharmacy_hospital_settings.section_c, off by default) is on.
--   2. pharmacy_products: item_type, derived from the EMHSLU section and never typed; level_of_care, sterile, test_kit,
--      no_expiry, free_issue. A Section C item cannot be added while the switch is off.
--   3. pharmacy_delivery_lines: seal and kit_temp. At finish the database refuses an accepted sterile line with its seal
--      unanswered or broken, and an accepted kit line unanswered or kept hot.
--   4. Dispense: a supply never reaches pharmacy_supplies or a `supplied` movement. It is issued, not dispensed.
--   5. Billing: pharmacy_supply_bill_lines takes a line only for a supply with a price in force, never a free one.
--   6. Expiry: a no_expiry batch always holds 2099-12-31, so no expiry or at-risk window can reach it.

-- ─── 1. The master list ──────────────────────────────────────────────────
ALTER TABLE public.pharmacy_hospital_settings
  ADD COLUMN IF NOT EXISTS section_c boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.cat_supply_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  section text NOT NULL CHECK (section IN ('B','C','D')),
  category text NOT NULL CHECK (char_length(category) BETWEEN 2 AND 120),
  name text NOT NULL CHECK (char_length(name) BETWEEN 2 AND 300),
  specification text NOT NULL DEFAULT '' CHECK (char_length(specification) <= 200),
  -- As printed: Sections B and C print none.
  unit_printed text NOT NULL DEFAULT '' CHECK (char_length(unit_printed) <= 40),
  issue_unit text NOT NULL CHECK (issue_unit IN ('piece','pair','packet','roll','test','strip','bottle')),
  level_printed text NOT NULL DEFAULT '' CHECK (char_length(level_printed) <= 12),
  level_of_care text CHECK (level_of_care IN ('HC1','HC2','HC3','HC4','H','RR','NR')),
  ven text CHECK (ven IN ('V','E','N')),
  sterile boolean NOT NULL DEFAULT false,
  test_kit boolean NOT NULL DEFAULT false,
  no_expiry boolean NOT NULL DEFAULT false,
  free_issue boolean NOT NULL DEFAULT false,
  UNIQUE (section, category, name, specification, unit_printed, level_printed)
);
ALTER TABLE public.cat_supply_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cat_supply_items FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.cat_supply_items FROM anon, authenticated;
GRANT SELECT ON public.cat_supply_items TO medsync_clinical_reader;
DROP POLICY IF EXISTS cat_supply_items_read ON public.cat_supply_items;
CREATE POLICY cat_supply_items_read ON public.cat_supply_items FOR SELECT TO medsync_clinical_reader
  USING (section <> 'C' OR EXISTS (SELECT 1 FROM public.pharmacy_hospital_settings s
    WHERE s.hospital_id = (SELECT private.current_hospital_id()) AND s.section_c));

-- ─── 2. The item ─────────────────────────────────────────────────────────
ALTER TABLE public.pharmacy_products
  ADD COLUMN IF NOT EXISTS item_type text NOT NULL DEFAULT 'medicine'
    CHECK (item_type IN ('medicine','health_supply','lab_supply')),
  ADD COLUMN IF NOT EXISTS supply_item_id uuid REFERENCES public.cat_supply_items(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS level_of_care text CHECK (level_of_care IN ('HC1','HC2','HC3','HC4','H','RR','NR')),
  ADD COLUMN IF NOT EXISTS sterile boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS test_kit boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS no_expiry boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS free_issue boolean NOT NULL DEFAULT false;
-- Medicines always carry an expiry.
ALTER TABLE public.pharmacy_products DROP CONSTRAINT IF EXISTS pp_no_expiry_supply;
ALTER TABLE public.pharmacy_products ADD CONSTRAINT pp_no_expiry_supply CHECK (item_type <> 'medicine' OR NOT no_expiry);
CREATE INDEX IF NOT EXISTS pp_item_type ON public.pharmacy_products (hospital_id, item_type) WHERE active;
UPDATE public.pharmacy_products SET item_type = 'health_supply' WHERE item_kind = 'health_supply' AND item_type = 'medicine';

CREATE OR REPLACE FUNCTION private.pharmacy_product_item_type() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE _section text; _level text;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.supply_item_id IS DISTINCT FROM OLD.supply_item_id AND OLD.supply_item_id IS NOT NULL THEN
    RAISE EXCEPTION 'pharmacy_products: a supply keeps its EMHSLU item' USING ERRCODE = 'P0001', HINT = 'supply_item';
  END IF;
  IF NEW.supply_item_id IS NOT NULL THEN
    SELECT section, level_of_care INTO _section, _level FROM public.cat_supply_items WHERE id = NEW.supply_item_id;
    IF _section = 'C' AND (TG_OP = 'INSERT' OR OLD.supply_item_id IS NULL) AND NOT EXISTS (
      SELECT 1 FROM public.pharmacy_hospital_settings s WHERE s.hospital_id = NEW.hospital_id AND s.section_c) THEN
      RAISE EXCEPTION 'pharmacy_products: Section C is off for this hospital' USING ERRCODE = 'P0001', HINT = 'section_c';
    END IF;
    NEW.item_kind := 'health_supply';
    NEW.level_of_care := _level;
    NEW.item_type := CASE _section WHEN 'D' THEN 'lab_supply' ELSE 'health_supply' END;
  ELSIF NEW.item_kind = 'health_supply' THEN
    NEW.item_type := 'health_supply';
  ELSE
    NEW.item_type := 'medicine';
    NEW.level_of_care := NULL;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.pharmacy_product_item_type() FROM PUBLIC;
DROP TRIGGER IF EXISTS pp_item_type ON public.pharmacy_products;
CREATE TRIGGER pp_item_type BEFORE INSERT OR UPDATE ON public.pharmacy_products
  FOR EACH ROW EXECUTE FUNCTION private.pharmacy_product_item_type();

-- ─── 3. The receipt line ─────────────────────────────────────────────────
ALTER TABLE public.pharmacy_delivery_lines
  ADD COLUMN IF NOT EXISTS seal text CHECK (seal IN ('ok','broken')),
  ADD COLUMN IF NOT EXISTS kit_temp text CHECK (kit_temp IN ('ok','hot'));

CREATE OR REPLACE FUNCTION private.pharmacy_delivery_supply_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE l record;
BEGIN
  IF NOT (OLD.state = 'counting' AND NEW.state = 'received') THEN RETURN NEW; END IF;
  FOR l IN
    SELECT dl.seal, dl.kit_temp, p.sterile, p.test_kit
      FROM public.pharmacy_delivery_lines dl JOIN public.pharmacy_products p ON p.id = dl.product_id
     WHERE dl.delivery_id = NEW.id AND dl.accepted_quantity > 0 AND (p.sterile OR p.test_kit)
  LOOP
    IF l.sterile AND l.seal IS NULL THEN
      RAISE EXCEPTION 'pharmacy_deliveries: a sterile line needs its seal checked' USING ERRCODE = 'P0001', HINT = 'seal_unanswered';
    END IF;
    IF l.sterile AND l.seal = 'broken' THEN
      RAISE EXCEPTION 'pharmacy_deliveries: a broken sterile seal cannot go into stock' USING ERRCODE = 'P0001', HINT = 'seal_broken';
    END IF;
    IF l.test_kit AND l.kit_temp IS NULL THEN
      RAISE EXCEPTION 'pharmacy_deliveries: a test kit needs its storage on the way confirmed' USING ERRCODE = 'P0001', HINT = 'kit_unanswered';
    END IF;
    IF l.test_kit AND l.kit_temp = 'hot' THEN
      RAISE EXCEPTION 'pharmacy_deliveries: test kits kept hot cannot go into stock' USING ERRCODE = 'P0001', HINT = 'kit_hot';
    END IF;
  END LOOP;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS pd_finish_supplies ON public.pharmacy_deliveries;
CREATE TRIGGER pd_finish_supplies BEFORE UPDATE OF state ON public.pharmacy_deliveries
  FOR EACH ROW EXECUTE FUNCTION private.pharmacy_delivery_supply_guard();

-- ─── 4. Dispense ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION private.pharmacy_no_dispensed_supply() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE _type text;
BEGIN
  IF TG_TABLE_NAME = 'pharmacy_supplies' THEN
    SELECT item_type INTO _type FROM public.pharmacy_products WHERE id = NEW.product_id;
  ELSIF NEW.kind = 'supplied' THEN
    SELECT p.item_type INTO _type FROM public.pharmacy_batches b JOIN public.pharmacy_products p ON p.id = b.product_id
     WHERE b.id = NEW.batch_id;
  END IF;
  IF _type IN ('health_supply','lab_supply') THEN
    RAISE EXCEPTION 'pharmacy: supplies are issued, not dispensed' USING ERRCODE = 'P0001', HINT = 'supply_not_dispensed';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.pharmacy_no_dispensed_supply() FROM PUBLIC;
DROP TRIGGER IF EXISTS ps_no_supply_item ON public.pharmacy_supplies;
CREATE TRIGGER ps_no_supply_item BEFORE INSERT ON public.pharmacy_supplies
  FOR EACH ROW EXECUTE FUNCTION private.pharmacy_no_dispensed_supply();
DROP TRIGGER IF EXISTS a_psm_no_supply_item ON public.pharmacy_stock_movements;
CREATE TRIGGER a_psm_no_supply_item BEFORE INSERT ON public.pharmacy_stock_movements
  FOR EACH ROW EXECUTE FUNCTION private.pharmacy_no_dispensed_supply();

-- ─── 5. Billing ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pharmacy_supply_bill_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  product_id uuid NOT NULL REFERENCES public.pharmacy_products(id) ON DELETE RESTRICT,
  patient_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  payer_id uuid NOT NULL REFERENCES public.pharmacy_payers(id) ON DELETE RESTRICT,
  quantity integer NOT NULL CHECK (quantity > 0),
  unit_price_ugx integer NOT NULL CHECK (unit_price_ugx > 0),
  billed_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  billed_at timestamptz NOT NULL DEFAULT now()
);
CREATE OR REPLACE FUNCTION private.pharmacy_supply_bill_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE _p record; _price record;
BEGIN
  SELECT item_type, free_issue INTO _p FROM public.pharmacy_products WHERE id = NEW.product_id AND hospital_id = NEW.hospital_id;
  IF _p.item_type IS NULL OR _p.item_type = 'medicine' THEN
    RAISE EXCEPTION 'pharmacy_supply_bill_lines: only a supply' USING ERRCODE = 'P0001', HINT = 'not_a_supply';
  END IF;
  IF _p.free_issue THEN
    RAISE EXCEPTION 'pharmacy_supply_bill_lines: this supply is issued free' USING ERRCODE = 'P0001', HINT = 'supply_free';
  END IF;
  SELECT price_ugx, free INTO _price FROM public.pharmacy_product_prices
   WHERE hospital_id = NEW.hospital_id AND product_id = NEW.product_id AND payer_id = NEW.payer_id
     AND from_date <= (now() AT TIME ZONE 'Africa/Kampala')::date
   ORDER BY from_date DESC, created_at DESC LIMIT 1;
  IF NOT FOUND OR _price.free OR _price.price_ugx IS NULL THEN
    RAISE EXCEPTION 'pharmacy_supply_bill_lines: no price is set on this supply' USING ERRCODE = 'P0001', HINT = 'supply_no_price';
  END IF;
  NEW.unit_price_ugx := _price.price_ugx;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.pharmacy_supply_bill_guard() FROM PUBLIC;
DROP TRIGGER IF EXISTS psbl_guard ON public.pharmacy_supply_bill_lines;
CREATE TRIGGER psbl_guard BEFORE INSERT ON public.pharmacy_supply_bill_lines
  FOR EACH ROW EXECUTE FUNCTION private.pharmacy_supply_bill_guard();
DROP TRIGGER IF EXISTS psbl_append_only ON public.pharmacy_supply_bill_lines;
CREATE TRIGGER psbl_append_only BEFORE UPDATE OR DELETE ON public.pharmacy_supply_bill_lines
  FOR EACH ROW EXECUTE FUNCTION public.block_modify_append_only();
DROP TRIGGER IF EXISTS audit_pharmacy_supply_bill_lines ON public.pharmacy_supply_bill_lines;
CREATE TRIGGER audit_pharmacy_supply_bill_lines AFTER INSERT ON public.pharmacy_supply_bill_lines
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_changes();
ALTER TABLE public.pharmacy_supply_bill_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pharmacy_supply_bill_lines FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.pharmacy_supply_bill_lines FROM anon, authenticated;
GRANT SELECT ON public.pharmacy_supply_bill_lines TO medsync_clinical_reader;
DROP POLICY IF EXISTS pharmacy_supply_bill_lines_select ON public.pharmacy_supply_bill_lines;
CREATE POLICY pharmacy_supply_bill_lines_select ON public.pharmacy_supply_bill_lines FOR SELECT TO medsync_clinical_reader
  USING (hospital_id = (SELECT private.current_hospital_id()) AND (SELECT private.pharmacy_can('pharmacy.view')));

-- ─── 6. Expiry ───────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION private.pharmacy_batch_no_expiry() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.pharmacy_products p WHERE p.id = NEW.product_id AND p.no_expiry) THEN
    NEW.expiry := DATE '2099-12-31';
    NEW.first_expiry := DATE '2099-12-31';
    NEW.expiry_month_only := false;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.pharmacy_batch_no_expiry() FROM PUBLIC;
DROP TRIGGER IF EXISTS pb_a_no_expiry ON public.pharmacy_batches;
CREATE TRIGGER pb_a_no_expiry BEFORE INSERT ON public.pharmacy_batches
  FOR EACH ROW EXECUTE FUNCTION private.pharmacy_batch_no_expiry();
