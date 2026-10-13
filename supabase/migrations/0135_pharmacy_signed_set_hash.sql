-- 0135 — A signed set's fingerprint is always its content's (Pharmacy Phase 1, HZ-PH1-57; D-PH1-43).
--
-- GATED: owner-applied (`npm run db:migrate`), after 0134.
--
-- 0122 stored `sha256` as given by the writer and never re-checked it. From here the database computes it
-- from the content itself on every insert and update (jsonb's text form is canonical: keys sorted, no
-- whitespace), so the stored fingerprint cannot disagree with what acts. With 0122's guard (a signed set
-- never changes; a retired one never moves), signed content cannot drift. ADDITIVE and re-runnable.

CREATE OR REPLACE FUNCTION private.pharmacy_signed_set_hash() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  NEW.sha256 := encode(sha256(convert_to(NEW.content::text, 'UTF8')), 'hex');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS pharmacy_signed_sets_hash ON public.pharmacy_signed_sets;
CREATE TRIGGER pharmacy_signed_sets_hash BEFORE INSERT OR UPDATE OF content ON public.pharmacy_signed_sets
  FOR EACH ROW EXECUTE FUNCTION private.pharmacy_signed_set_hash();

-- Rows written before this migration: recompute (a draft only; a signed row whose stored hash disagrees with its
-- content is left for a person to look at, and listed by this query).
UPDATE public.pharmacy_signed_sets SET content = content WHERE status = 'draft';
