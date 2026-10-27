-- 0255 — A hospital's products linked to the catalogue; health supplies in stock (catalogue slice Step 6; ADR 0459).
--
-- GATED: owner-applied (`npm run db:migrate`), after 0254.
--
-- Every existing product is `formulary` and keeps every value, batch and movement (S17).
-- A-1 as amended by Fadhul (CSO), 27 Oct 2026: `medicine_id` stays NOT NULL. A product that is not on the prescribing
-- list carries a catalogue key, `cat_` and 32 hex digits. No formulary id begins `cat_`, so it never matches a
-- prescription, and every reader that looks a medicine up already copes with one the formulary does not hold.
-- D-CAT-18 (Fadhul, 27 Oct 2026): local medicines are refused until the CSO decides how their controlled status is
-- set: a local medicine has no signed controlled class, so it would move without a witness. `pp_no_local_medicine`
-- holds that; a later migration drops it with the decision. Health supplies are never controlled.
-- ADDITIVE and re-runnable.
-- Reverse: DROP TRIGGER pp_catalogue_link; DROP FUNCTION private.pp_catalogue_link(); ALTER TABLE
--   public.pharmacy_products DROP CONSTRAINT pp_kind_key, DROP CONSTRAINT pp_no_local_medicine, DROP COLUMN
--   local_proposal_id, DROP COLUMN catalogue_medicine_id, DROP COLUMN catalogue_pack_id, DROP COLUMN item_kind.

ALTER TABLE public.pharmacy_products
  ADD COLUMN IF NOT EXISTS item_kind text NOT NULL DEFAULT 'formulary'
    CHECK (item_kind IN ('formulary','local_medicine','health_supply')),
  ADD COLUMN IF NOT EXISTS catalogue_pack_id uuid REFERENCES public.cat_packs(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS catalogue_medicine_id uuid REFERENCES public.cat_medicines(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS local_proposal_id uuid REFERENCES public.cat_proposals(id) ON DELETE RESTRICT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pp_kind_key') THEN
    ALTER TABLE public.pharmacy_products ADD CONSTRAINT pp_kind_key
      CHECK ((item_kind = 'formulary') = (medicine_id !~ '^cat_'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pp_no_local_medicine') THEN
    ALTER TABLE public.pharmacy_products ADD CONSTRAINT pp_no_local_medicine CHECK (item_kind <> 'local_medicine');
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS pp_catalogue_pack ON public.pharmacy_products (catalogue_pack_id)
  WHERE catalogue_pack_id IS NOT NULL;

-- A pack names its medicine, so the product's medicine follows the pack. The catalogue medicine's kind matches the
-- product's: a health supply is never a medicine, nor a medicine a supply. Definer: the hospital cannot see why not.
CREATE OR REPLACE FUNCTION private.pp_catalogue_link() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE k text;
BEGIN
  IF NEW.catalogue_pack_id IS NOT NULL THEN
    SELECT p.medicine_id INTO NEW.catalogue_medicine_id
      FROM public.cat_packs k JOIN public.cat_products p ON p.id = k.product_id WHERE k.id = NEW.catalogue_pack_id;
  END IF;
  IF NEW.catalogue_medicine_id IS NOT NULL THEN
    SELECT m.kind INTO k FROM public.cat_medicines m WHERE m.id = NEW.catalogue_medicine_id;
    IF (NEW.item_kind = 'health_supply') <> (k = 'health_supply') THEN
      RAISE EXCEPTION 'pharmacy_products: a % product cannot link to a catalogue %', NEW.item_kind, k
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.pp_catalogue_link() FROM PUBLIC;
DROP TRIGGER IF EXISTS pp_catalogue_link ON public.pharmacy_products;
CREATE TRIGGER pp_catalogue_link BEFORE INSERT OR UPDATE OF catalogue_pack_id, catalogue_medicine_id, item_kind
  ON public.pharmacy_products FOR EACH ROW EXECUTE FUNCTION private.pp_catalogue_link();
