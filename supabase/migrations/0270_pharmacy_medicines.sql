-- 0270 — Set-up › Medicines, the medicine master (docs/pharmacy/rework/MEDICINES-TAB.md §14).
--
-- GATED: owner-applied (`npm run db:migrate`), after 0269.
--
-- Mapped onto the existing tables first (TECH-SPEC §0):
--   1. pharmacy_products is the "line": identity (generic, strength, form, route), classification, VEN, handling
--      flags (Controlled stays `controlled_class`), packs, loose, local items, review and stop. The unique index
--      `pp_line_identity` is the database form of the duplicate guard.
--   2. pharmacy_reorder_levels gains `location_id` and `product_id`: a top-up level for any place (store, point, ward),
--      append-only as before; the latest row per line and place wins.
--   3. pharmacy_payers kinds: insurance, community, employer (cash, scheme, staff and other stay).
--   4. pharmacy_line_brands, each with its own cash price (null = the generic's price).
--   5. pharmacy_rules, pharmacy_rule_proposals, pharmacy_rule_signatures: a rule's text changes only when the in-charge
--      and a second, different person have signed (trigger `prs_apply`).
--   6. pharmacy_saved_views (per user) and pharmacy_line_history (append-only, one line per changed area).
--   7. cat_medicines gains the master catalogue's classification (ATC level 1, class, group, sale category), which
--      lists carry it, default flags and packs, and the last supplier prices. Filled by scripts/import-catalogue.ts.
--   8. pharmacy_order_asks: "Add to the order" from a line, picked up by the next order proposal.
--   9. Live stock: a broadcast on `pharmacy-stock:<hospital>` after each movement and fridge reading.
--
-- ADDITIVE and re-runnable. No client grants: writes come from the server connection.
-- Reverse: DROP the tables in 4–6 and 8, the triggers and functions named below, and the added columns.

-- ─── 1. The line ─────────────────────────────────────────────────────────
ALTER TABLE public.pharmacy_products
  ADD COLUMN IF NOT EXISTS generic text CHECK (generic IS NULL OR char_length(generic) BETWEEN 2 AND 160),
  ADD COLUMN IF NOT EXISTS form text CHECK (form IS NULL OR char_length(form) BETWEEN 2 AND 60),
  ADD COLUMN IF NOT EXISTS route text CHECK (route IS NULL OR char_length(route) BETWEEN 2 AND 60),
  ADD COLUMN IF NOT EXISTS therapeutic_class text CHECK (therapeutic_class IS NULL OR char_length(therapeutic_class) BETWEEN 2 AND 80),
  ADD COLUMN IF NOT EXISTS pharm_group text CHECK (pharm_group IS NULL OR char_length(pharm_group) BETWEEN 2 AND 120),
  ADD COLUMN IF NOT EXISTS sale_category text CHECK (sale_category IS NULL OR sale_category IN
    ('controlled','prescription_only','pharmacy_only','over_the_counter')),
  ADD COLUMN IF NOT EXISTS ven text CHECK (ven IS NULL OR ven IN ('V','E','N')),
  ADD COLUMN IF NOT EXISTS high_risk boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS cold_chain boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS freeze_sensitive boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS cytotoxic boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS packs integer[] NOT NULL DEFAULT '{}' CHECK (0 < ALL (packs) OR packs = '{}'),
  ADD COLUMN IF NOT EXISTS loose boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS hand_added boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS local_reason text CHECK (local_reason IS NULL OR local_reason IN
    ('specialist_request','donation','not_on_national_list','bought_in_stock_out','other')),
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS reviewed_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS stopped_at timestamptz,
  ADD COLUMN IF NOT EXISTS stopped_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pp_local_reason') THEN
    ALTER TABLE public.pharmacy_products ADD CONSTRAINT pp_local_reason CHECK (hand_added = (local_reason IS NOT NULL));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pp_stopped') THEN
    ALTER TABLE public.pharmacy_products ADD CONSTRAINT pp_stopped
      CHECK ((stopped_at IS NULL) = (stopped_by IS NULL) AND (stopped_at IS NULL OR NOT active));
  END IF;
END $$;

-- A hand-added (local) line is in no catalogue, so it cannot link to one (0264 required a link). Its Controlled flag is
-- set by a person, and a line on the national controlled list is always controlled (the app locks it).
ALTER TABLE public.pharmacy_products DROP CONSTRAINT IF EXISTS pp_local_medicine_linked;
ALTER TABLE public.pharmacy_products ADD CONSTRAINT pp_local_medicine_linked
  CHECK (item_kind <> 'local_medicine' OR catalogue_medicine_id IS NOT NULL OR hand_added);

-- The duplicate guard: one stocked line per generic + strength + form + route.
CREATE UNIQUE INDEX IF NOT EXISTS pp_line_identity ON public.pharmacy_products
  (hospital_id, lower(generic), lower(coalesce(strength, '')), lower(coalesce(form, '')), lower(coalesce(route, '')))
  WHERE active AND generic IS NOT NULL;

-- ─── 2. Top-up levels for any place ──────────────────────────────────────
ALTER TABLE public.pharmacy_reorder_levels
  ADD COLUMN IF NOT EXISTS location_id uuid REFERENCES public.pharmacy_locations(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS product_id uuid REFERENCES public.pharmacy_products(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS valid_from date;
ALTER TABLE public.pharmacy_reorder_levels ALTER COLUMN dispensing_point_id DROP NOT NULL;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'prl_place') THEN
    ALTER TABLE public.pharmacy_reorder_levels ADD CONSTRAINT prl_place
      CHECK (dispensing_point_id IS NOT NULL OR (location_id IS NOT NULL AND product_id IS NOT NULL));
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS prl_line_current ON public.pharmacy_reorder_levels (product_id, location_id, set_at DESC)
  WHERE product_id IS NOT NULL;

-- ─── 3. Payer kinds ──────────────────────────────────────────────────────
ALTER TABLE public.pharmacy_payers DROP CONSTRAINT IF EXISTS pharmacy_payers_kind_check;
ALTER TABLE public.pharmacy_payers ADD CONSTRAINT pharmacy_payers_kind_check
  CHECK (kind IN ('cash','scheme','staff','other','insurance','community','employer'));
CREATE UNIQUE INDEX IF NOT EXISTS pharmacy_payers_name ON public.pharmacy_payers (hospital_id, lower(name)) WHERE active;

-- ─── 4. Brands ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pharmacy_line_brands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  product_id uuid NOT NULL REFERENCES public.pharmacy_products(id) ON DELETE RESTRICT,
  brand text NOT NULL CHECK (char_length(brand) BETWEEN 1 AND 120),
  maker text CHECK (maker IS NULL OR char_length(maker) BETWEEN 1 AND 120),
  nda_reg_no text CHECK (nda_reg_no IS NULL OR char_length(nda_reg_no) BETWEEN 2 AND 80),
  -- UGX per issue unit, for the cash payer; null = the generic's price. Changes are in pharmacy_line_history.
  price_ugx integer CHECK (price_ugx IS NULL OR price_ugx > 0),
  added_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  added_at timestamptz NOT NULL DEFAULT now(),
  removed_at timestamptz,
  removed_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  CONSTRAINT plb_removed CHECK ((removed_at IS NULL) = (removed_by IS NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS plb_one_name ON public.pharmacy_line_brands (product_id, lower(brand))
  WHERE removed_at IS NULL;


-- ─── 5. Rules with two signatures ────────────────────────────────────────
-- A rule row exists once its text first changes or a line gets its own rule; until then the signed default stands.
CREATE TABLE IF NOT EXISTS public.pharmacy_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  rule_group text NOT NULL CHECK (rule_group ~ '^[a-z_]{2,40}$'),
  key text NOT NULL CHECK (char_length(key) BETWEEN 1 AND 120),
  text text NOT NULL CHECK (char_length(text) BETWEEN 2 AND 400),
  -- 'line' rules belong to one product.
  product_id uuid REFERENCES public.pharmacy_products(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (hospital_id, rule_group, key)
);

CREATE TABLE IF NOT EXISTS public.pharmacy_rule_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  rule_group text NOT NULL CHECK (rule_group ~ '^[a-z_]{2,40}$'),
  key text NOT NULL CHECK (char_length(key) BETWEEN 1 AND 120),
  old_text text CHECK (old_text IS NULL OR char_length(old_text) <= 400),
  new_text text NOT NULL CHECK (char_length(new_text) BETWEEN 2 AND 400),
  reason text NOT NULL CHECK (char_length(reason) BETWEEN 2 AND 300),
  product_id uuid REFERENCES public.pharmacy_products(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','applied','withdrawn')),
  proposed_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  proposed_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  CONSTRAINT prp_closed CHECK ((status = 'pending') = (closed_at IS NULL))
);
-- One open proposal per rule, so a pending change shows the same everywhere the rule appears.
CREATE UNIQUE INDEX IF NOT EXISTS prp_one_open ON public.pharmacy_rule_proposals (hospital_id, rule_group, key)
  WHERE status = 'pending';

CREATE TABLE IF NOT EXISTS public.pharmacy_rule_signatures (
  proposal_id uuid NOT NULL REFERENCES public.pharmacy_rule_proposals(id) ON DELETE RESTRICT,
  role text NOT NULL CHECK (role IN ('in_charge','second')),
  signed_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  signed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (proposal_id, role)
);

-- A proposal is withdrawn or applied, never edited; a signature is never changed.
CREATE OR REPLACE FUNCTION private.pharmacy_rule_proposal_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'pharmacy_rule_proposals: never deleted'; END IF;
  IF OLD.status <> 'pending' THEN RAISE EXCEPTION 'pharmacy_rule_proposals: a closed proposal never changes'; END IF;
  IF (to_jsonb(NEW) - ARRAY['status','closed_at']) IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['status','closed_at']) THEN
    RAISE EXCEPTION 'pharmacy_rule_proposals: only its status changes';
  END IF;
  IF NEW.status = 'applied' AND current_setting('pharmacy.rule_apply', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'pharmacy_rule_proposals: applied only by two signatures' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS prp_guard ON public.pharmacy_rule_proposals;
CREATE TRIGGER prp_guard BEFORE UPDATE OR DELETE ON public.pharmacy_rule_proposals
  FOR EACH ROW EXECUTE FUNCTION private.pharmacy_rule_proposal_guard();

-- A rule's text changes only through `prs_apply` (both signatures in).
CREATE OR REPLACE FUNCTION private.pharmacy_rule_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'pharmacy_rules: never deleted'; END IF;
  IF current_setting('pharmacy.rule_apply', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'pharmacy_rules: a rule changes only with two signatures' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS pr_guard ON public.pharmacy_rules;
CREATE TRIGGER pr_guard BEFORE INSERT OR UPDATE OR DELETE ON public.pharmacy_rules
  FOR EACH ROW EXECUTE FUNCTION private.pharmacy_rule_guard();

-- The second signature applies the proposal: both roles, two different people, on a pending proposal.
CREATE OR REPLACE FUNCTION private.pharmacy_rule_sign() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE p public.pharmacy_rule_proposals; n int; people int;
BEGIN
  SELECT * INTO p FROM public.pharmacy_rule_proposals WHERE id = NEW.proposal_id FOR UPDATE;
  IF p.status <> 'pending' THEN
    RAISE EXCEPTION 'pharmacy_rule_signatures: the proposal is closed' USING ERRCODE = 'check_violation';
  END IF;
  SELECT count(*), count(DISTINCT signed_by) INTO n, people
    FROM public.pharmacy_rule_signatures WHERE proposal_id = NEW.proposal_id;
  IF n = 2 AND people < 2 THEN
    RAISE EXCEPTION 'pharmacy_rule_signatures: two different people sign' USING ERRCODE = 'check_violation';
  END IF;
  IF n = 2 THEN
    PERFORM set_config('pharmacy.rule_apply', 'on', true);
    INSERT INTO public.pharmacy_rules (hospital_id, rule_group, key, text, product_id)
    VALUES (p.hospital_id, p.rule_group, p.key, p.new_text, p.product_id)
    ON CONFLICT (hospital_id, rule_group, key) DO UPDATE SET text = EXCLUDED.text, updated_at = now();
    UPDATE public.pharmacy_rule_proposals SET status = 'applied', closed_at = now() WHERE id = p.id;
    PERFORM set_config('pharmacy.rule_apply', 'off', true);
  END IF;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS prs_apply ON public.pharmacy_rule_signatures;
CREATE TRIGGER prs_apply AFTER INSERT ON public.pharmacy_rule_signatures
  FOR EACH ROW EXECUTE FUNCTION private.pharmacy_rule_sign();
DROP TRIGGER IF EXISTS prs_append_only ON public.pharmacy_rule_signatures;
CREATE TRIGGER prs_append_only BEFORE UPDATE OR DELETE ON public.pharmacy_rule_signatures
  FOR EACH ROW EXECUTE FUNCTION public.block_modify_append_only();

-- ─── 6. Saved views and line history ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pharmacy_saved_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
  conditions jsonb NOT NULL CHECK (jsonb_typeof(conditions) = 'array'),
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE INDEX IF NOT EXISTS psv_user ON public.pharmacy_saved_views (hospital_id, user_id) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS public.pharmacy_line_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  product_id uuid NOT NULL REFERENCES public.pharmacy_products(id) ON DELETE RESTRICT,
  area text NOT NULL CHECK (area ~ '^[a-z_]{2,30}$'),
  line text NOT NULL CHECK (char_length(line) BETWEEN 2 AND 600),
  from_date date,
  actor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  actor_label text NOT NULL CHECK (char_length(actor_label) BETWEEN 1 AND 160),
  bulk boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS plh_line ON public.pharmacy_line_history (product_id, created_at DESC);
DROP TRIGGER IF EXISTS plh_append_only ON public.pharmacy_line_history;
CREATE TRIGGER plh_append_only BEFORE UPDATE OR DELETE ON public.pharmacy_line_history
  FOR EACH ROW EXECUTE FUNCTION public.block_modify_append_only();

-- ─── 7. The master catalogue's classification ────────────────────────────
ALTER TABLE public.cat_medicines
  ADD COLUMN IF NOT EXISTS generic text CHECK (generic IS NULL OR char_length(generic) BETWEEN 2 AND 160),
  ADD COLUMN IF NOT EXISTS form_label text CHECK (form_label IS NULL OR char_length(form_label) BETWEEN 2 AND 60),
  ADD COLUMN IF NOT EXISTS route_label text CHECK (route_label IS NULL OR char_length(route_label) BETWEEN 2 AND 60),
  ADD COLUMN IF NOT EXISTS issue_unit text CHECK (issue_unit IS NULL OR char_length(issue_unit) BETWEEN 2 AND 40),
  -- The full ATC code only under a WHO licence; without one, the level-1 letter and the class (§11.1).
  ADD COLUMN IF NOT EXISTS atc_code text CHECK (atc_code IS NULL OR atc_code ~ '^[A-Z][0-9]{2}[A-Z]{0,2}[0-9]{0,2}$'),
  ADD COLUMN IF NOT EXISTS atc_level1 text CHECK (atc_level1 IS NULL OR atc_level1 ~ '^[ABCDGHJLMNPRSV]$'),
  ADD COLUMN IF NOT EXISTS therapeutic_class text CHECK (therapeutic_class IS NULL OR char_length(therapeutic_class) BETWEEN 2 AND 80),
  ADD COLUMN IF NOT EXISTS pharm_group text CHECK (pharm_group IS NULL OR char_length(pharm_group) BETWEEN 2 AND 120),
  ADD COLUMN IF NOT EXISTS sale_category text CHECK (sale_category IS NULL OR sale_category IN
    ('controlled','prescription_only','pharmacy_only','over_the_counter')),
  ADD COLUMN IF NOT EXISTS sources text[] NOT NULL DEFAULT '{}'
    CHECK (sources <@ ARRAY['EMHSLU','NMS','JMS','UNEPI']::text[]),
  ADD COLUMN IF NOT EXISTS default_flags jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(default_flags) = 'object'),
  ADD COLUMN IF NOT EXISTS default_packs integer[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS national_controlled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS nda_reg_nos text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS supplier_prices jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(supplier_prices) = 'object');
CREATE INDEX IF NOT EXISTS cm_identity ON public.cat_medicines
  (lower(generic), lower(coalesce(strength_text, '')), lower(coalesce(form_label, '')), lower(coalesce(route_label, '')))
  WHERE generic IS NOT NULL;

-- ─── 8. "Add to the order" ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pharmacy_order_asks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  product_id uuid NOT NULL REFERENCES public.pharmacy_products(id) ON DELETE RESTRICT,
  quantity integer NOT NULL CHECK (quantity > 0),
  asked_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  asked_at timestamptz NOT NULL DEFAULT now(),
  -- Withdrawn (Undo) or taken into an order draft; never deleted.
  withdrawn_at timestamptz,
  order_id uuid REFERENCES public.pharmacy_orders(id) ON DELETE RESTRICT,
  CONSTRAINT poa_once CHECK (withdrawn_at IS NULL OR order_id IS NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS poa_one_open ON public.pharmacy_order_asks (product_id)
  WHERE withdrawn_at IS NULL AND order_id IS NULL;

-- ─── RLS: read as the viewer; no client grants ───────────────────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['pharmacy_line_brands','pharmacy_rules','pharmacy_rule_proposals','pharmacy_saved_views',
    'pharmacy_line_history','pharmacy_order_asks'] LOOP
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
END $$;
ALTER TABLE public.pharmacy_rule_signatures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pharmacy_rule_signatures FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.pharmacy_rule_signatures FROM anon, authenticated;
GRANT SELECT ON public.pharmacy_rule_signatures TO medsync_clinical_reader;
DROP POLICY IF EXISTS pharmacy_rule_signatures_select ON public.pharmacy_rule_signatures;
CREATE POLICY pharmacy_rule_signatures_select ON public.pharmacy_rule_signatures FOR SELECT TO medsync_clinical_reader
  USING (EXISTS (SELECT 1 FROM public.pharmacy_rule_proposals p WHERE p.id = proposal_id
    AND p.hospital_id = (SELECT private.current_hospital_id())) AND (SELECT private.pharmacy_can('pharmacy.view')));

-- ─── 9. Live stock ───────────────────────────────────────────────────────
-- The client re-reads the server on a message; it never renders the payload. A failing realtime layer never blocks
-- a stock write.
CREATE OR REPLACE FUNCTION public.pharmacy_stock_broadcast()
  RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE h uuid;
BEGIN
  BEGIN
    IF TG_TABLE_NAME = 'pharmacy_fridge_readings' THEN
      SELECT f.hospital_id INTO h FROM public.pharmacy_fridges f WHERE f.id = NEW.fridge_id;
    ELSE
      h := NEW.hospital_id;
    END IF;
    IF h IS NOT NULL THEN
      PERFORM realtime.send(jsonb_build_object('kind', TG_TABLE_NAME, 'at', now()), 'change',
        'pharmacy-stock:' || h::text, true);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS pharmacy_stock_broadcast ON public.pharmacy_stock_movements;
CREATE TRIGGER pharmacy_stock_broadcast AFTER INSERT ON public.pharmacy_stock_movements
  FOR EACH ROW EXECUTE FUNCTION public.pharmacy_stock_broadcast();
DROP TRIGGER IF EXISTS pharmacy_stock_broadcast ON public.pharmacy_fridge_readings;
CREATE TRIGGER pharmacy_stock_broadcast AFTER INSERT ON public.pharmacy_fridge_readings
  FOR EACH ROW EXECUTE FUNCTION public.pharmacy_stock_broadcast();

DO $do$
BEGIN
  IF to_regclass('realtime.messages') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS pharmacy_stock_realtime_receive ON realtime.messages';
    EXECUTE $p$
      CREATE POLICY pharmacy_stock_realtime_receive ON realtime.messages
        FOR SELECT TO authenticated
        USING (
          realtime.messages.extension = 'broadcast'
          AND (SELECT realtime.topic()) LIKE 'pharmacy-stock:%'
          AND EXISTS (
            SELECT 1 FROM public.hospitals h
            WHERE h.id::text = substring((SELECT realtime.topic()) FROM 16)
              AND public.is_active_clinical_staff(h.id)
          )
        )
    $p$;
  END IF;
END
$do$;
