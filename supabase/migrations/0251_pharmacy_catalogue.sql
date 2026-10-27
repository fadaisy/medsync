-- 0251 — The shared medicines catalogue (catalogue slice Step 2; GATE A signed 27 Oct 2026; ADR 0456).
--
-- GATED: owner-applied (`npm run db:migrate`), after 0250.
--
-- One MedSync-wide catalogue above every hospital's stock: substances → medicines (ingredients, routes) →
-- products (a brand) → packs (and their codes). No hospital_id on any of these, and no prices (Law 10).
-- Pack facts only: no doses, limits, indications or interactions (Law 2). Strength is text as printed; the
-- parsed columns beside it are for search and grouping only (Law 3).
--
-- Every fact arrives through a proposal (Law 6, Law 7): a medicine, substance, product or pack row names the
-- applied proposal it came from, and a proposal is applied only after its reviews. A proposal that adds or
-- changes a medicine (kinds new_medicine and correction) needs two different curators, neither the proposer
-- (the two-person rule); the others need one. The database enforces both, because curator writes run as the
-- owner connection (`asClinicalWriter`), which RLS does not bind.
--
-- Who curates: an open row in catalogue_curators (the `catalogue.curate` right), granted by a superadmin.
-- Readers: any pharmacy viewer, and curators. No client role writes anything here.
--
-- ATC codes are deliberately absent (D-CAT-06: WHOCC terms forbid commercial copying); the EMHSLU therapeutic
-- class is carried instead. EDQM columns stay null until EDQM's terms are cleared (O-3).
--
-- ADDITIVE and re-runnable.
-- Reverse: DROP TABLE public.cat_changes, public.cat_proposal_reviews, public.cat_pack_photos, public.cat_pack_codes,
--   public.cat_packs, public.cat_products, public.cat_register_editions, public.cat_manufacturers,
--   public.cat_medicine_links, public.cat_medicine_routes, public.cat_medicine_ingredients, public.cat_medicines,
--   public.cat_substance_names, public.cat_substances, public.cat_routes, public.cat_dose_forms,
--   public.cat_proposals, public.catalogue_curators; DROP FUNCTION private.catalogue_can_curate(),
--   private.catalogue_is_curator(uuid), private.cat_review_guard(), private.cat_proposal_guard(),
--   private.cat_from_applied().

/* ─── Who curates ─────────────────────────────────────────────────────────────────────────────── */
CREATE TABLE IF NOT EXISTS public.catalogue_curators (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  granted_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  starts_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz,
  note text CHECK (note IS NULL OR char_length(note) <= 300),
  CONSTRAINT cc_not_self CHECK (granted_by <> user_id),
  CONSTRAINT cc_window CHECK (ends_at IS NULL OR ends_at >= starts_at)
);
CREATE UNIQUE INDEX IF NOT EXISTS cc_one_open ON public.catalogue_curators (user_id) WHERE ends_at IS NULL;

CREATE OR REPLACE FUNCTION private.catalogue_is_curator(p_user uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM public.catalogue_curators c
    WHERE c.user_id = p_user AND c.starts_at <= now() AND (c.ends_at IS NULL OR c.ends_at > now()));
$$;
CREATE OR REPLACE FUNCTION private.catalogue_can_curate() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT private.catalogue_is_curator(auth.uid());
$$;

/* ─── Proposals and their reviews ─────────────────────────────────────────────────────────────── */
CREATE TABLE IF NOT EXISTS public.cat_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('new_medicine','new_name','new_product','new_pack','new_barcode',
    'correction','register_change')),
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  -- Where the fact comes from (Law 7): "EMHSLU 2023 p.12 line 40", "NDA register June 2024 row 811", a photo.
  source text NOT NULL CHECK (char_length(source) BETWEEN 2 AND 500),
  hospital_id uuid REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  -- A person, or a named loader (a seed has no person to exclude from its review).
  proposed_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  proposer_source text CHECK (proposer_source IS NULL OR char_length(proposer_source) BETWEEN 2 AND 120),
  -- A loader's stable key for one source row: re-running the loader proposes nothing twice.
  seed_key text CHECK (seed_key IS NULL OR char_length(seed_key) BETWEEN 2 AND 200),
  required_reviews smallint NOT NULL CHECK (required_reviews IN (1, 2)),
  state text NOT NULL DEFAULT 'open' CHECK (state IN ('open','applied','rejected','withdrawn')),
  created_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz,
  CONSTRAINT cp_proposer CHECK ((proposed_by IS NULL) <> (proposer_source IS NULL)),
  CONSTRAINT cp_two_person CHECK (kind NOT IN ('new_medicine','correction') OR required_reviews = 2),
  CONSTRAINT cp_decided CHECK ((state = 'open') = (decided_at IS NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS cp_seed_key ON public.cat_proposals (proposer_source, seed_key)
  WHERE seed_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS cp_open ON public.cat_proposals (kind, created_at) WHERE state = 'open';

CREATE TABLE IF NOT EXISTS public.cat_proposal_reviews (
  proposal_id uuid NOT NULL REFERENCES public.cat_proposals(id) ON DELETE RESTRICT,
  reviewer uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  decision text NOT NULL CHECK (decision IN ('confirm','reject')),
  note text CHECK (note IS NULL OR char_length(note) <= 600),
  reviewed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (proposal_id, reviewer)
);

-- A review is by a curator, never the proposer, and only of an open proposal.
CREATE OR REPLACE FUNCTION private.cat_review_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE p record;
BEGIN
  SELECT state, proposed_by INTO p FROM public.cat_proposals WHERE id = NEW.proposal_id;
  IF p.state <> 'open' THEN
    RAISE EXCEPTION 'cat_review_guard: the proposal is already decided' USING ERRCODE = 'check_violation';
  END IF;
  IF p.proposed_by = NEW.reviewer THEN
    RAISE EXCEPTION 'cat_review_guard: nobody reviews their own proposal' USING ERRCODE = 'check_violation';
  END IF;
  IF NOT private.catalogue_is_curator(NEW.reviewer) THEN
    RAISE EXCEPTION 'cat_review_guard: only a curator reviews' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS cat_review_guard ON public.cat_proposal_reviews;
CREATE TRIGGER cat_review_guard BEFORE INSERT ON public.cat_proposal_reviews
  FOR EACH ROW EXECUTE FUNCTION private.cat_review_guard();

-- A proposal moves once, from open: to applied only with enough confirmations, to rejected only with a reject.
CREATE OR REPLACE FUNCTION private.cat_proposal_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE n_confirm int; n_reject int;
BEGIN
  IF OLD.state <> 'open' THEN
    RAISE EXCEPTION 'cat_proposal_guard: a decided proposal does not change' USING ERRCODE = 'check_violation';
  END IF;
  IF (NEW.kind, NEW.payload, NEW.source, NEW.hospital_id, NEW.proposed_by, NEW.proposer_source, NEW.seed_key,
      NEW.required_reviews, NEW.created_at)
     IS DISTINCT FROM (OLD.kind, OLD.payload, OLD.source, OLD.hospital_id, OLD.proposed_by, OLD.proposer_source,
      OLD.seed_key, OLD.required_reviews, OLD.created_at) THEN
    RAISE EXCEPTION 'cat_proposal_guard: only the state changes' USING ERRCODE = 'check_violation';
  END IF;
  SELECT count(*) FILTER (WHERE decision = 'confirm'), count(*) FILTER (WHERE decision = 'reject')
    INTO n_confirm, n_reject FROM public.cat_proposal_reviews WHERE proposal_id = NEW.id;
  IF NEW.state = 'applied' AND (n_confirm < NEW.required_reviews OR n_reject > 0) THEN
    RAISE EXCEPTION 'cat_proposal_guard: % confirmation(s) needed, % given, % rejection(s)',
      NEW.required_reviews, n_confirm, n_reject USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.state = 'rejected' AND n_reject = 0 THEN
    RAISE EXCEPTION 'cat_proposal_guard: a rejection needs a reviewer''s reject' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS cat_proposal_guard ON public.cat_proposals;
CREATE TRIGGER cat_proposal_guard BEFORE UPDATE ON public.cat_proposals
  FOR EACH ROW EXECUTE FUNCTION private.cat_proposal_guard();

/* ─── Vocabularies (D-CAT-04): MedSync's own en-GB lists; EDQM mapping once its terms are cleared ─── */
CREATE TABLE IF NOT EXISTS public.cat_dose_forms (
  code text PRIMARY KEY CHECK (code ~ '^[a-z0-9_]{2,40}$'),
  label text NOT NULL CHECK (char_length(label) BETWEEN 2 AND 80),
  edqm_code text CHECK (edqm_code IS NULL OR char_length(edqm_code) <= 20),
  edqm_retrieved_on date,
  status text NOT NULL CHECK (status IN ('draft','signed')),
  CONSTRAINT cdf_edqm_dated CHECK ((edqm_code IS NULL) = (edqm_retrieved_on IS NULL))
);
CREATE TABLE IF NOT EXISTS public.cat_routes (
  code text PRIMARY KEY CHECK (code ~ '^[a-z0-9_]{2,40}$'),
  label text NOT NULL CHECK (char_length(label) BETWEEN 2 AND 80),
  edqm_code text CHECK (edqm_code IS NULL OR char_length(edqm_code) <= 20),
  edqm_retrieved_on date,
  status text NOT NULL CHECK (status IN ('draft','signed')),
  CONSTRAINT cr_edqm_dated CHECK ((edqm_code IS NULL) = (edqm_retrieved_on IS NULL))
);

/* ─── Substances and names ────────────────────────────────────────────────────────────────────── */
CREATE TABLE IF NOT EXISTS public.cat_substances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- The preferred name, lower-cased with punctuation as spaces: one substance per key.
  key text NOT NULL UNIQUE CHECK (key ~ '^[a-z0-9 ]{2,200}$'),
  preferred_name text NOT NULL CHECK (char_length(preferred_name) BETWEEN 2 AND 200),
  kind text NOT NULL CHECK (kind IN ('medicine','health_supply','other')),
  emhslu_class text CHECK (emhslu_class IS NULL OR char_length(emhslu_class) <= 200),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','withdrawn')),
  version integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  proposal_id uuid NOT NULL REFERENCES public.cat_proposals(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.cat_substance_names (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  substance_id uuid NOT NULL REFERENCES public.cat_substances(id) ON DELETE RESTRICT,
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 200),
  type text NOT NULL CHECK (type IN ('INN','BAN','USAN','JAN','former','local','abbreviation',
    'other_language','common_misspelling','printed')),
  language text NOT NULL DEFAULT 'en' CHECK (language ~ '^[a-z]{2,3}$'),
  source text NOT NULL CHECK (char_length(source) BETWEEN 2 AND 500),
  proposal_id uuid NOT NULL REFERENCES public.cat_proposals(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS csn_one ON public.cat_substance_names (substance_id, lower(name), type);

/* ─── Medicines (an item: a medicine or a health supply) ──────────────────────────────────────── */
CREATE TABLE IF NOT EXISTS public.cat_medicines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Ingredients, strength as printed and form, normalised for identity only: one medicine per key.
  key text NOT NULL UNIQUE CHECK (char_length(key) BETWEEN 2 AND 400),
  display_name text NOT NULL CHECK (char_length(display_name) BETWEEN 2 AND 300),
  kind text NOT NULL CHECK (kind IN ('medicine','health_supply','other')),
  dose_form_code text REFERENCES public.cat_dose_forms(code) ON DELETE RESTRICT,
  issue_unit_kind text CHECK (issue_unit_kind IS NULL OR issue_unit_kind ~ '^[a-z_]{2,30}$'),
  -- The whole strength as printed on the source row (Law 3); ingredients carry their part where it splits.
  strength_text text CHECK (strength_text IS NULL OR char_length(strength_text) <= 120),
  -- A health supply's specification or unit, as printed.
  spec text CHECK (spec IS NULL OR char_length(spec) <= 200),
  emhslu_level text CHECK (emhslu_level IS NULL OR char_length(emhslu_level) <= 40),
  emhslu_ven text CHECK (emhslu_ven IS NULL OR emhslu_ven IN ('V','E','N')),
  -- Carried from the source: a row not read with confidence stays flagged (Law 7).
  flagged boolean NOT NULL DEFAULT false,
  check_note text CHECK (check_note IS NULL OR char_length(check_note) <= 600),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','withdrawn')),
  version integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  proposal_id uuid NOT NULL REFERENCES public.cat_proposals(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cm_supply_no_form CHECK (kind <> 'health_supply' OR dose_form_code IS NULL)
);

CREATE TABLE IF NOT EXISTS public.cat_medicine_ingredients (
  medicine_id uuid NOT NULL REFERENCES public.cat_medicines(id) ON DELETE RESTRICT,
  position smallint NOT NULL CHECK (position BETWEEN 1 AND 12),
  substance_id uuid NOT NULL REFERENCES public.cat_substances(id) ON DELETE RESTRICT,
  strength_text text CHECK (strength_text IS NULL OR char_length(strength_text) <= 120),
  amount numeric CHECK (amount IS NULL OR amount > 0),
  unit text CHECK (unit IS NULL OR char_length(unit) <= 20),
  per_amount numeric CHECK (per_amount IS NULL OR per_amount > 0),
  per_unit text CHECK (per_unit IS NULL OR char_length(per_unit) <= 20),
  basis text CHECK (basis IS NULL OR char_length(basis) <= 120),
  PRIMARY KEY (medicine_id, position),
  UNIQUE (medicine_id, substance_id)
);

CREATE TABLE IF NOT EXISTS public.cat_medicine_routes (
  medicine_id uuid NOT NULL REFERENCES public.cat_medicines(id) ON DELETE RESTRICT,
  route_code text NOT NULL REFERENCES public.cat_routes(code) ON DELETE RESTRICT,
  PRIMARY KEY (medicine_id, route_code)
);

-- Medicine ↔ an EMHSLU row it came from; medicine ↔ a prescribing-list id (prescribable only through this).
CREATE TABLE IF NOT EXISTS public.cat_medicine_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  medicine_id uuid NOT NULL REFERENCES public.cat_medicines(id) ON DELETE RESTRICT,
  link_kind text NOT NULL CHECK (link_kind IN ('emhslu_row','formulary')),
  row_id uuid REFERENCES public.pharmacy_national_list_rows(id) ON DELETE RESTRICT,
  formulary_id text CHECK (formulary_id IS NULL OR formulary_id ~ '^[a-z0-9_]{2,80}$'),
  proposal_id uuid NOT NULL REFERENCES public.cat_proposals(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cml_target CHECK (
    (link_kind = 'emhslu_row' AND row_id IS NOT NULL AND formulary_id IS NULL) OR
    (link_kind = 'formulary' AND formulary_id IS NOT NULL AND row_id IS NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS cml_row ON public.cat_medicine_links (row_id) WHERE row_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS cml_formulary ON public.cat_medicine_links (medicine_id, formulary_id)
  WHERE formulary_id IS NOT NULL;

/* ─── Makers, register editions, brands, packs, codes ─────────────────────────────────────────── */
CREATE TABLE IF NOT EXISTS public.cat_manufacturers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (char_length(name) BETWEEN 2 AND 200),
  country text CHECK (country IS NULL OR char_length(country) <= 80),
  other_names text[] NOT NULL DEFAULT '{}',
  proposal_id uuid NOT NULL REFERENCES public.cat_proposals(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS cmf_name ON public.cat_manufacturers (lower(name), coalesce(lower(country), ''));

CREATE TABLE IF NOT EXISTS public.cat_register_editions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE CHECK (char_length(name) BETWEEN 2 AND 160),
  edition_date date NOT NULL,
  file_name text NOT NULL CHECK (char_length(file_name) BETWEEN 1 AND 300),
  file_sha256 text NOT NULL UNIQUE CHECK (file_sha256 ~ '^[0-9a-f]{64}$'),
  row_count integer NOT NULL CHECK (row_count >= 0),
  applied_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  applied_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.cat_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  medicine_id uuid NOT NULL REFERENCES public.cat_medicines(id) ON DELETE RESTRICT,
  -- Null brand: "Unbranded".
  brand_name text CHECK (brand_name IS NULL OR char_length(brand_name) BETWEEN 1 AND 200),
  manufacturer_id uuid REFERENCES public.cat_manufacturers(id) ON DELETE RESTRICT,
  nda_number text CHECK (nda_number IS NULL OR char_length(nda_number) BETWEEN 2 AND 60),
  nda_state text NOT NULL DEFAULT 'unknown' CHECK (nda_state IN ('registered','lapsed','not_found','unknown')),
  -- The 2026 Act adds notification and listing beside registration (s.21).
  registration_kind text CHECK (registration_kind IS NULL OR registration_kind IN ('registered','notified','listed')),
  valid_to date,
  source_edition_id uuid REFERENCES public.cat_register_editions(id) ON DELETE RESTRICT,
  source_row integer CHECK (source_row IS NULL OR source_row > 0),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','withdrawn')),
  version integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  proposal_id uuid NOT NULL REFERENCES public.cat_proposals(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cpr_source_row CHECK (source_row IS NULL OR source_edition_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS cpr_medicine ON public.cat_products (medicine_id);
CREATE INDEX IF NOT EXISTS cpr_nda ON public.cat_products (nda_number) WHERE nda_number IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.cat_packs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.cat_products(id) ON DELETE RESTRICT,
  description text NOT NULL CHECK (char_length(description) BETWEEN 1 AND 200),
  -- A whole number of the medicine's issue unit, or unknown (Law 4).
  contents integer CHECK (contents IS NULL OR contents > 0),
  container text CHECK (container IS NULL OR char_length(container) <= 80),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','withdrawn')),
  proposal_id uuid NOT NULL REFERENCES public.cat_proposals(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cpk_product ON public.cat_packs (product_id);

-- A code on a pack. Scope: shared (hospital_id null) or one hospital's local link (Law 6). Uniqueness and
-- conflicts are 0254's (Step 5).
CREATE TABLE IF NOT EXISTS public.cat_pack_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pack_id uuid NOT NULL REFERENCES public.cat_packs(id) ON DELETE RESTRICT,
  code_type text NOT NULL CHECK (code_type IN ('GTIN','NMS','JMS','supplier','other')),
  code text NOT NULL CHECK (char_length(code) BETWEEN 1 AND 80),
  hospital_id uuid REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  state text NOT NULL CHECK (state IN ('local','confirmed','conflict','withdrawn')),
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  evidence jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(evidence) = 'object'),
  proposal_id uuid REFERENCES public.cat_proposals(id) ON DELETE RESTRICT,
  CONSTRAINT cpc_gtin CHECK (code_type <> 'GTIN' OR code ~ '^[0-9]{14}$'),
  CONSTRAINT cpc_scope CHECK ((state = 'local') = (hospital_id IS NOT NULL) OR state IN ('conflict','withdrawn'))
);
CREATE INDEX IF NOT EXISTS cpc_code ON public.cat_pack_codes (code_type, code);

CREATE TABLE IF NOT EXISTS public.cat_pack_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id uuid NOT NULL REFERENCES public.cat_proposals(id) ON DELETE RESTRICT,
  hospital_id uuid REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  asset_path text NOT NULL CHECK (char_length(asset_path) BETWEEN 3 AND 400),
  uploaded_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  uploaded_at timestamptz NOT NULL DEFAULT now()
);

/* ─── The change log (Law 7) ──────────────────────────────────────────────────────────────────── */
CREATE TABLE IF NOT EXISTS public.cat_changes (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  table_name text NOT NULL CHECK (table_name ~ '^cat_[a-z_]{2,40}$'),
  row_id text NOT NULL CHECK (char_length(row_id) BETWEEN 1 AND 200),
  before jsonb,
  after jsonb,
  source text NOT NULL CHECK (char_length(source) BETWEEN 2 AND 500),
  proposal_id uuid REFERENCES public.cat_proposals(id) ON DELETE RESTRICT,
  changed_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  changed_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cch_something CHECK (before IS NOT NULL OR after IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS cch_row ON public.cat_changes (table_name, row_id, changed_at);

/* ─── A catalogue fact exists only from an applied proposal ───────────────────────────────────── */
CREATE OR REPLACE FUNCTION private.cat_from_applied() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.proposal_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.cat_proposals p WHERE p.id = NEW.proposal_id AND p.state = 'applied') THEN
    RAISE EXCEPTION 'cat_from_applied: % needs an applied proposal', TG_TABLE_NAME USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['cat_substances','cat_substance_names','cat_medicines','cat_medicine_links',
    'cat_manufacturers','cat_products','cat_packs','cat_pack_codes'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %1$s_from_applied ON public.%1$I', t);
    EXECUTE format('CREATE TRIGGER %1$s_from_applied BEFORE INSERT OR UPDATE OF proposal_id ON public.%1$I
      FOR EACH ROW EXECUTE FUNCTION private.cat_from_applied()', t);
  END LOOP;
  -- The logs are append-only. Facts change (a correction), and every change is in cat_changes.
  FOREACH t IN ARRAY ARRAY['cat_proposal_reviews','cat_changes','cat_register_editions','cat_pack_photos'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %1$s_append_only ON public.%1$I', t);
    EXECUTE format('CREATE TRIGGER %1$s_append_only BEFORE UPDATE OR DELETE ON public.%1$I
      FOR EACH ROW EXECUTE FUNCTION public.block_modify_append_only()', t);
  END LOOP;
  FOREACH t IN ARRAY ARRAY['catalogue_curators','cat_proposals','cat_proposal_reviews','cat_dose_forms','cat_routes',
    'cat_substances','cat_substance_names','cat_medicines','cat_medicine_ingredients','cat_medicine_routes',
    'cat_medicine_links','cat_manufacturers','cat_register_editions','cat_products','cat_packs','cat_pack_codes',
    'cat_pack_photos','cat_changes'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS audit_%1$s ON public.%1$I', t);
    -- The log is its own audit; the rest of these have no id column for audit_log.record_id.
    IF t NOT IN ('cat_changes','cat_medicine_ingredients','cat_medicine_routes','cat_proposal_reviews',
                 'cat_dose_forms','cat_routes') THEN
      EXECUTE format('CREATE TRIGGER audit_%1$s AFTER INSERT OR UPDATE OR DELETE ON public.%1$I
        FOR EACH ROW EXECUTE FUNCTION public.audit_log_changes()', t);
    END IF;
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
    EXECUTE format('GRANT SELECT ON public.%I TO medsync_clinical_reader', t);
    EXECUTE format('DROP POLICY IF EXISTS %1$s_select ON public.%1$I', t);
    EXECUTE format('CREATE POLICY %1$s_select ON public.%1$I FOR SELECT TO medsync_clinical_reader
      USING ((SELECT private.pharmacy_can(''pharmacy.view'')) OR (SELECT private.catalogue_can_curate()))', t);
  END LOOP;
END $$;
