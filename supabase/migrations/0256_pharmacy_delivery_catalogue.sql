-- 0256 — Counting a delivery against the catalogue: packs, where the identity came from, and the registration reason
-- (catalogue slice Step 7; Laws 4 and 9; D-CAT-08, D-CAT-09).
--
-- GATED: owner-applied (`npm run db:migrate`), after 0255.
--
-- Adaptation A-7 (Step 7): GATE A planned no migration for Step 7, but Law 9 needs the coded reason kept on the line
-- the in-charge reads. Prices move to 0257, imports to 0258 and distribution to 0259.
-- `packs` and `pack_contents` record what the person counted (Law 4: packs convert only by the pack's own whole
-- contents; the accepted quantity stays in issue units and is what moves). `identity_source` says how the line's
-- product was found: `scan`, `catalogue` or `typed` (S20). `registration_reason` is required, by the app, for a
-- product whose registration is lapsed or absent; the codes are draft until the legal answers (D-CAT-08).
-- Existing lines keep every value; the new columns are null. ADDITIVE and re-runnable.
-- Reverse: ALTER TABLE public.pharmacy_delivery_lines DROP COLUMN registration_note, DROP COLUMN registration_reason,
--   DROP COLUMN identity_source, DROP COLUMN pack_contents, DROP COLUMN packs.

ALTER TABLE public.pharmacy_delivery_lines
  ADD COLUMN IF NOT EXISTS packs integer CHECK (packs IS NULL OR packs BETWEEN 0 AND 1000000),
  ADD COLUMN IF NOT EXISTS pack_contents integer CHECK (pack_contents IS NULL OR pack_contents > 0),
  ADD COLUMN IF NOT EXISTS identity_source text CHECK (identity_source IS NULL OR identity_source IN ('scan','catalogue','typed')),
  ADD COLUMN IF NOT EXISTS registration_reason text CHECK (registration_reason IS NULL OR registration_reason IN
    ('donation','no_registered_alternative','renewal_pending','other')),
  ADD COLUMN IF NOT EXISTS registration_note text CHECK (registration_note IS NULL OR char_length(registration_note) <= 300);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pdl_packs_whole') THEN
    ALTER TABLE public.pharmacy_delivery_lines ADD CONSTRAINT pdl_packs_whole
      CHECK (packs IS NULL OR (pack_contents IS NOT NULL AND accepted_quantity = packs * pack_contents));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pdl_registration_other') THEN
    ALTER TABLE public.pharmacy_delivery_lines ADD CONSTRAINT pdl_registration_other
      CHECK (registration_reason IS DISTINCT FROM 'other' OR char_length(trim(registration_note)) >= 3);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS pdl_registration ON public.pharmacy_delivery_lines (delivery_id)
  WHERE registration_reason IS NOT NULL;
