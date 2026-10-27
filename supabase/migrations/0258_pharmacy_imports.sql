-- 0258 — Imports as drafts: products, opening stock per place, supplier price lists (catalogue slice Step 9; ADR 0462).
--
-- GATED: owner-applied (`npm run db:migrate`), after 0257. (GATE A numbered this 0257; A-7 moved it.)
--
-- A CSV file becomes a draft: one row per line with the proposed match and why (matched | check |
-- not_in_catalogue), and one decision per row by a person. Commit writes only the accepted rows, through the
-- existing stores (S34). An opening-stock draft writes no count and no movement: the imported figures stay on the
-- draft, and the place still needs its blind opening count before going live (S36). Hospital-scoped under RLS; the
-- rows are written by the owner through the pharmacy write path. No ledger table is read or changed. ADDITIVE and
-- re-runnable.
-- Reverse: DROP TABLE public.pharmacy_import_rows, public.pharmacy_import_drafts.

CREATE TABLE IF NOT EXISTS public.pharmacy_import_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('products','opening_stock','price_list')),
  file_name text NOT NULL CHECK (char_length(file_name) BETWEEN 1 AND 200),
  row_count integer NOT NULL CHECK (row_count BETWEEN 1 AND 5000),
  -- Opening stock: the place (a store that is not live). A price list: the supplier and the edition date.
  location_id uuid REFERENCES public.pharmacy_locations(id) ON DELETE RESTRICT,
  supplier_id uuid REFERENCES public.pharmacy_counterparties(id) ON DELETE RESTRICT,
  edition_date date,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  committed_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  committed_at timestamptz,
  price_list_id uuid REFERENCES public.pharmacy_price_lists(id) ON DELETE RESTRICT,
  CONSTRAINT pid_place CHECK ((kind = 'opening_stock') = (location_id IS NOT NULL)),
  CONSTRAINT pid_supplier CHECK ((kind = 'price_list') = (supplier_id IS NOT NULL AND edition_date IS NOT NULL)),
  CONSTRAINT pid_commit CHECK ((committed_at IS NULL) = (committed_by IS NULL))
);
CREATE INDEX IF NOT EXISTS pid_hospital ON public.pharmacy_import_drafts (hospital_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.pharmacy_import_rows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  draft_id uuid NOT NULL REFERENCES public.pharmacy_import_drafts(id) ON DELETE CASCADE,
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  line_no integer NOT NULL CHECK (line_no >= 1),
  raw jsonb NOT NULL CHECK (jsonb_typeof(raw) = 'object'),
  match text NOT NULL CHECK (match IN ('matched','check','not_in_catalogue','invalid')),
  why text NOT NULL CHECK (char_length(why) BETWEEN 1 AND 300),
  -- What the engine proposes (a pack, a product, a medicine) and what the person chose; never a different strength.
  proposal jsonb,
  decision text CHECK (decision IS NULL OR decision IN ('accept','skip','add_supply')),
  chosen jsonb,
  decided_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  decided_at timestamptz,
  committed_id uuid,
  UNIQUE (draft_id, line_no),
  CONSTRAINT pir_decided CHECK ((decision IS NULL) = (decided_by IS NULL))
);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['pharmacy_import_drafts','pharmacy_import_rows'] LOOP
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
