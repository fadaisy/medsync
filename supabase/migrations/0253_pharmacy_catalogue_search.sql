-- 0253 — Searching the shared catalogue by any name (catalogue slice Step 3; GATE A A-4; ADR 0456).
--
-- GATED: owner-applied (`npm run db:migrate`), after 0252.
--
-- Two extensions Supabase provides, new to this repo: pg_trgm (similarity, so a misspelling still finds the
-- medicine) and unaccent (so "Hartmann’s" and "Hartmanns" meet). Installed like pgcrypto (0001): no schema clause.
-- `private.cat_fold` folds text the same way for every index and every query: unaccented, lower case, any
-- run of punctuation or space as one space. It is IMMUTABLE so it can be indexed (unaccent itself is STABLE;
-- the dictionary is named so the result never depends on search_path).
--
-- Each searched name gets a stored `name_fold` beside it, indexed by trigram. A new table, cat_medicine_names,
-- holds a medicine's own names (a combination's or a class's abbreviation), signed with the names list.
--
-- Search terms are not stored or logged (brief §7). ADDITIVE and re-runnable.
-- Reverse: DROP TABLE public.cat_medicine_names; DROP INDEX the cat_*_fold_trgm indexes and pp_name_fold_trgm;
--   ALTER TABLE … DROP COLUMN name_fold on cat_substances, cat_substance_names, cat_medicines, cat_products,
--   cat_manufacturers; DROP FUNCTION private.cat_fold(text);
--   DROP EXTENSION unaccent; DROP EXTENSION pg_trgm (only if nothing else uses them).

CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;

-- unaccent may already live in another schema (Supabase installs into `extensions` from its dashboard): name it.
DO $do$
DECLARE s text;
BEGIN
  SELECT n.nspname INTO s FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace WHERE e.extname = 'unaccent';
  EXECUTE format($f$
    CREATE OR REPLACE FUNCTION private.cat_fold(p text) RETURNS text
    LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT SET search_path = public, pg_temp AS $b$
      SELECT btrim(regexp_replace(lower(%1$I.unaccent(%2$L::regdictionary, p)), '[^a-z0-9%%]+', ' ', 'g'));
    $b$
  $f$, s, s || '.unaccent');
END $do$;
GRANT EXECUTE ON FUNCTION private.cat_fold(text) TO medsync_clinical_reader;

-- The folded text is stored beside each searched name (a generated column), so a search compares plain columns
-- and never runs the fold per row. gin_trgm_ops lives with pg_trgm; the indexes find it on the search_path.
ALTER TABLE public.cat_substances ADD COLUMN IF NOT EXISTS name_fold text
  GENERATED ALWAYS AS (private.cat_fold(preferred_name)) STORED;
ALTER TABLE public.cat_substance_names ADD COLUMN IF NOT EXISTS name_fold text
  GENERATED ALWAYS AS (private.cat_fold(name)) STORED;
ALTER TABLE public.cat_medicines ADD COLUMN IF NOT EXISTS name_fold text
  GENERATED ALWAYS AS (private.cat_fold(display_name)) STORED;
ALTER TABLE public.cat_products ADD COLUMN IF NOT EXISTS name_fold text
  GENERATED ALWAYS AS (private.cat_fold(brand_name)) STORED;
ALTER TABLE public.cat_manufacturers ADD COLUMN IF NOT EXISTS name_fold text
  GENERATED ALWAYS AS (private.cat_fold(name)) STORED;
CREATE INDEX IF NOT EXISTS cs_fold_trgm ON public.cat_substances USING gin (name_fold gin_trgm_ops);
CREATE INDEX IF NOT EXISTS csn_fold_trgm ON public.cat_substance_names USING gin (name_fold gin_trgm_ops);
CREATE INDEX IF NOT EXISTS cm_fold_trgm ON public.cat_medicines USING gin (name_fold gin_trgm_ops);
CREATE INDEX IF NOT EXISTS cpr_fold_trgm ON public.cat_products USING gin (name_fold gin_trgm_ops);
CREATE INDEX IF NOT EXISTS cmf_fold_trgm ON public.cat_manufacturers USING gin (name_fold gin_trgm_ops);
-- A hospital's own products, found by name in the same search: a small table per hospital, so an expression
-- index serves (no new column on a hospital table).
CREATE INDEX IF NOT EXISTS pp_name_fold_trgm ON public.pharmacy_products USING gin (private.cat_fold(name) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS csn_substance ON public.cat_substance_names (substance_id);
CREATE INDEX IF NOT EXISTS cmi_substance ON public.cat_medicine_ingredients (substance_id);

-- A name for a medicine rather than a substance: a combination's abbreviation (AL, TLD, RHZE) or a class's
-- (ACT, ARVs), on each medicine it fits. Signed with the names list (GATE A §5); from an applied proposal.
CREATE TABLE IF NOT EXISTS public.cat_medicine_names (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  medicine_id uuid NOT NULL REFERENCES public.cat_medicines(id) ON DELETE RESTRICT,
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 200),
  type text NOT NULL CHECK (type IN ('abbreviation','class_abbreviation','local')),
  source text NOT NULL CHECK (char_length(source) BETWEEN 2 AND 500),
  proposal_id uuid NOT NULL REFERENCES public.cat_proposals(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS cmn_one ON public.cat_medicine_names (medicine_id, lower(name));
ALTER TABLE public.cat_medicine_names ADD COLUMN IF NOT EXISTS name_fold text
  GENERATED ALWAYS AS (private.cat_fold(name)) STORED;
CREATE INDEX IF NOT EXISTS cmn_fold ON public.cat_medicine_names (name_fold);
DROP TRIGGER IF EXISTS cat_medicine_names_from_applied ON public.cat_medicine_names;
CREATE TRIGGER cat_medicine_names_from_applied BEFORE INSERT OR UPDATE OF proposal_id ON public.cat_medicine_names
  FOR EACH ROW EXECUTE FUNCTION private.cat_from_applied();
DROP TRIGGER IF EXISTS audit_cat_medicine_names ON public.cat_medicine_names;
CREATE TRIGGER audit_cat_medicine_names AFTER INSERT OR UPDATE OR DELETE ON public.cat_medicine_names
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_changes();
ALTER TABLE public.cat_medicine_names ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cat_medicine_names FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.cat_medicine_names FROM anon, authenticated;
GRANT SELECT ON public.cat_medicine_names TO medsync_clinical_reader;
DROP POLICY IF EXISTS cat_medicine_names_select ON public.cat_medicine_names;
CREATE POLICY cat_medicine_names_select ON public.cat_medicine_names FOR SELECT TO medsync_clinical_reader
  USING ((SELECT private.pharmacy_can('pharmacy.view')) OR (SELECT private.catalogue_can_curate()));
