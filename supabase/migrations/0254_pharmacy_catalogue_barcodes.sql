-- 0254 — Barcode links: local first, shared after review (catalogue slice Step 5; GATE A §3, §6; ADR 0458).
--
-- GATED: owner-applied (`npm run db:migrate`), after 0253.
--
-- A hospital links a barcode to a pack: the link is `local` and used there at once, and a `new_barcode` proposal
-- asks the catalogue team. A curator's confirmation adds the `confirmed` shared row (hospital_id null), which every
-- hospital then resolves (S14). One code linked to two packs anywhere (two hospitals, or local against shared)
-- marks every link involved `conflict`: no hospital resolves it until the team decides (S15). The marking runs as
-- the definer, because no hospital can see another's links.
--
-- RLS narrows: a hospital reads the shared links and its own, its own proposals and photos; curators read all.
-- `pharmacy_delivery_lines.serials`: the serial of each scanned pack, kept on the receipt line only and read by
-- nothing (brief §10). Delivery lines are not ledger rows. ADDITIVE and re-runnable.
-- Reverse: DROP TRIGGER cat_pack_codes_conflicts; DROP FUNCTION private.cat_code_conflicts(); DROP INDEX cpc_one_shared,
--   cpc_one_local; restore the 0251 select policies on cat_pack_codes, cat_proposals, cat_pack_photos;
--   ALTER TABLE public.pharmacy_delivery_lines DROP COLUMN serials.

-- One shared link per code; one local link per code per hospital ("cannot be linked again": it opens the conflict).
CREATE UNIQUE INDEX IF NOT EXISTS cpc_one_shared ON public.cat_pack_codes (code_type, code)
  WHERE hospital_id IS NULL AND state = 'confirmed';
CREATE UNIQUE INDEX IF NOT EXISTS cpc_one_local ON public.cat_pack_codes (hospital_id, code_type, code)
  WHERE state = 'local';

CREATE OR REPLACE FUNCTION private.cat_code_conflicts() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.state IN ('local','confirmed') AND EXISTS (
    SELECT 1 FROM public.cat_pack_codes c
     WHERE c.code_type = NEW.code_type AND c.code = NEW.code AND c.pack_id <> NEW.pack_id
       AND c.state IN ('local','confirmed','conflict')) THEN
    UPDATE public.cat_pack_codes SET state = 'conflict'
     WHERE code_type = NEW.code_type AND code = NEW.code AND state IN ('local','confirmed');
  END IF;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION private.cat_code_conflicts() FROM PUBLIC;
DROP TRIGGER IF EXISTS cat_pack_codes_conflicts ON public.cat_pack_codes;
CREATE TRIGGER cat_pack_codes_conflicts AFTER INSERT OR UPDATE OF state, pack_id ON public.cat_pack_codes
  FOR EACH ROW EXECUTE FUNCTION private.cat_code_conflicts();

DROP POLICY IF EXISTS cat_pack_codes_select ON public.cat_pack_codes;
CREATE POLICY cat_pack_codes_select ON public.cat_pack_codes FOR SELECT TO medsync_clinical_reader
  USING ((SELECT private.catalogue_can_curate()) OR ((SELECT private.pharmacy_can('pharmacy.view'))
    AND (hospital_id IS NULL OR hospital_id = (SELECT private.current_hospital_id()))));
DROP POLICY IF EXISTS cat_proposals_select ON public.cat_proposals;
CREATE POLICY cat_proposals_select ON public.cat_proposals FOR SELECT TO medsync_clinical_reader
  USING ((SELECT private.catalogue_can_curate()) OR ((SELECT private.pharmacy_can('pharmacy.view'))
    AND (hospital_id IS NULL OR hospital_id = (SELECT private.current_hospital_id()))));
DROP POLICY IF EXISTS cat_pack_photos_select ON public.cat_pack_photos;
CREATE POLICY cat_pack_photos_select ON public.cat_pack_photos FOR SELECT TO medsync_clinical_reader
  USING ((SELECT private.catalogue_can_curate()) OR ((SELECT private.pharmacy_can('pharmacy.view'))
    AND (hospital_id IS NULL OR hospital_id = (SELECT private.current_hospital_id()))));

ALTER TABLE public.pharmacy_delivery_lines ADD COLUMN IF NOT EXISTS serials text[]
  CHECK (serials IS NULL OR cardinality(serials) <= 1000);
