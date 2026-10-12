-- 0123 — The catalogue: products and the national list (Pharmacy Phase 1, CT-1 to CT-7; gate-a-proposal §8).
--
-- GATED: owner-applied (`npm run db:migrate`), after 0122.
--
--   1. pharmacy_products: what a hospital stocks for one medicine of the prescribing list (CT-1, CT-2). The
--      medicine is the catalogue's own id (lib/prescribing/reference/general-formulary.ts); there is one
--      medicine list. `strength` is the pack's own wording (gate-a-proposal §1 H2), shown beside the
--      prescribed strength and never converted (CT-4). The issue unit locks once the product has a
--      movement (trigger in 0124). Price is optional, Uganda shillings, and is snapshotted on each supply
--      (CT-5); nothing adds prices up.
--   2. pharmacy_product_points: a product is at a point while it has an active row there (CT-2).
--   3. National list reference data (CT-3): editions, their rows, and the links a person makes from a
--      medicine to a row. Nothing is matched by guess; unmatched rows wait for a person.
--
-- ADDITIVE and re-runnable. Config tables: mutable, audited. No client grants.

CREATE TABLE IF NOT EXISTS public.pharmacy_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  medicine_id text NOT NULL CHECK (medicine_id ~ '^[a-z0-9_]{2,80}$'),
  name text NOT NULL CHECK (char_length(name) BETWEEN 2 AND 160),
  manufacturer text CHECK (manufacturer IS NULL OR char_length(manufacturer) BETWEEN 2 AND 160),
  strength text CHECK (strength IS NULL OR char_length(strength) BETWEEN 1 AND 80),
  pack_size text CHECK (pack_size IS NULL OR char_length(pack_size) BETWEEN 1 AND 80),
  issue_unit text NOT NULL CHECK (char_length(issue_unit) BETWEEN 1 AND 40),
  registration_number text CHECK (registration_number IS NULL OR char_length(registration_number) BETWEEN 2 AND 80),
  price_ugx numeric(14,2) CHECK (price_ugx IS NULL OR price_ugx >= 0),
  active boolean NOT NULL DEFAULT true,
  added_at_window boolean NOT NULL DEFAULT false,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pharmacy_products_medicine ON public.pharmacy_products (hospital_id, medicine_id);

CREATE TABLE IF NOT EXISTS public.pharmacy_product_points (
  product_id uuid NOT NULL REFERENCES public.pharmacy_products(id) ON DELETE RESTRICT,
  dispensing_point_id uuid NOT NULL REFERENCES public.pharmacy_dispensing_points(department_id) ON DELETE RESTRICT,
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  active boolean NOT NULL DEFAULT true,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  ended_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  PRIMARY KEY (product_id, dispensing_point_id),
  CONSTRAINT ppp_ended CHECK (active = (ended_at IS NULL))
);
CREATE INDEX IF NOT EXISTS ppp_point ON public.pharmacy_product_points (dispensing_point_id) WHERE active;

CREATE TABLE IF NOT EXISTS public.pharmacy_national_list_editions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (char_length(name) BETWEEN 2 AND 160),
  published_on date,
  source_ref text NOT NULL CHECK (char_length(source_ref) BETWEEN 2 AND 500),
  imported_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  imported_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (name)
);

CREATE TABLE IF NOT EXISTS public.pharmacy_national_list_rows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  edition_id uuid NOT NULL REFERENCES public.pharmacy_national_list_editions(id) ON DELETE CASCADE,
  generic_name text NOT NULL CHECK (char_length(generic_name) BETWEEN 1 AND 200),
  form text CHECK (form IS NULL OR char_length(form) <= 120),
  strength text CHECK (strength IS NULL OR char_length(strength) <= 120),
  level_of_care text CHECK (level_of_care IS NULL OR char_length(level_of_care) <= 40),
  ven_class text CHECK (ven_class IS NULL OR ven_class IN ('V','E','N')),
  therapeutic_class text CHECK (therapeutic_class IS NULL OR char_length(therapeutic_class) <= 200),
  source_line integer
);
CREATE INDEX IF NOT EXISTS pnlr_edition ON public.pharmacy_national_list_rows (edition_id);
DROP TRIGGER IF EXISTS pnlr_append_only ON public.pharmacy_national_list_rows;
CREATE TRIGGER pnlr_append_only BEFORE UPDATE ON public.pharmacy_national_list_rows
  FOR EACH ROW EXECUTE FUNCTION public.block_modify_append_only();

CREATE TABLE IF NOT EXISTS public.pharmacy_medicine_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  medicine_id text NOT NULL CHECK (medicine_id ~ '^[a-z0-9_]{2,80}$'),
  row_id uuid NOT NULL REFERENCES public.pharmacy_national_list_rows(id) ON DELETE CASCADE,
  edition_id uuid NOT NULL REFERENCES public.pharmacy_national_list_editions(id) ON DELETE CASCADE,
  linked_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  linked_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (edition_id, medicine_id)
);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['pharmacy_products','pharmacy_product_points','pharmacy_national_list_editions',
    'pharmacy_national_list_rows','pharmacy_medicine_links'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS audit_%1$s ON public.%1$I', t);
    IF t <> 'pharmacy_national_list_rows' THEN  -- rows are bulk reference data; the edition carries the audit
      EXECUTE format('CREATE TRIGGER audit_%1$s AFTER INSERT OR UPDATE OR DELETE ON public.%1$I
        FOR EACH ROW EXECUTE FUNCTION public.audit_log_changes()', t);
    END IF;
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
    EXECUTE format('GRANT SELECT ON public.%I TO medsync_clinical_reader', t);
    EXECUTE format('DROP POLICY IF EXISTS %1$s_select ON public.%1$I', t);
  END LOOP;
END $$;

CREATE POLICY pharmacy_products_select ON public.pharmacy_products FOR SELECT TO medsync_clinical_reader
  USING (hospital_id = (SELECT private.current_hospital_id()) AND (SELECT private.pharmacy_can('pharmacy.view')));
CREATE POLICY pharmacy_product_points_select ON public.pharmacy_product_points FOR SELECT TO medsync_clinical_reader
  USING (hospital_id = (SELECT private.current_hospital_id()) AND (SELECT private.pharmacy_can('pharmacy.view')));
-- The national list is public reference data; any pharmacy viewer reads it.
CREATE POLICY pharmacy_national_list_editions_select ON public.pharmacy_national_list_editions
  FOR SELECT TO medsync_clinical_reader USING ((SELECT private.pharmacy_can('pharmacy.view')));
CREATE POLICY pharmacy_national_list_rows_select ON public.pharmacy_national_list_rows
  FOR SELECT TO medsync_clinical_reader USING ((SELECT private.pharmacy_can('pharmacy.view')));
CREATE POLICY pharmacy_medicine_links_select ON public.pharmacy_medicine_links
  FOR SELECT TO medsync_clinical_reader USING ((SELECT private.pharmacy_can('pharmacy.view')));
