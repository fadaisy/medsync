-- 0264 — Local medicines from the catalogue (ADR 0470; supersedes D-CAT-18 "Refuse for now" for catalogue medicines).
--
-- GATED: owner-applied (`npm run db:migrate`), after 0263.
--
-- Owner decision, 29 Oct 2026: a catalogue medicine that is not on the prescribing list may be stocked as a
-- `local_medicine`. Its controlled status is not typed: it comes from the signed list of controlled substances
-- (`data/pharmacy/controlled-substances.v1.json`), by the catalogue medicine's ingredients. So a local medicine is
-- always linked to its catalogue medicine: `pp_local_medicine_linked` replaces `pp_no_local_medicine`.
-- No data changes: every existing product already passes (no local medicine exists).
-- Reverse: ALTER TABLE public.pharmacy_products DROP CONSTRAINT pp_local_medicine_linked, ADD CONSTRAINT
--   pp_no_local_medicine CHECK (item_kind <> 'local_medicine'); (refused while any local medicine exists).

ALTER TABLE public.pharmacy_products DROP CONSTRAINT IF EXISTS pp_no_local_medicine;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pp_local_medicine_linked') THEN
    ALTER TABLE public.pharmacy_products ADD CONSTRAINT pp_local_medicine_linked
      CHECK (item_kind <> 'local_medicine' OR catalogue_medicine_id IS NOT NULL);
  END IF;
END $$;
