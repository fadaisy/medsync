-- 0259 — Distribution checks: picks on an issue, ward-use gap reasons, cart seal events (catalogue slice Step 10;
-- ADRs 0463–0465).
--
-- GATED: owner-applied (`npm run db:migrate`), after 0258. (GATE A numbered this 0258; A-7 moved it.)
--
-- Each table records a check, never stock: no movement is written from a pick, a gap reason or a seal (S43). The
-- ledger tables are not read or changed here. Hospital-scoped under RLS; written by the owner through the pharmacy
-- (or ward) write path. Append-only and audited. ADDITIVE and re-runnable.
-- Reverse: DROP TABLE public.pharmacy_seal_events, public.pharmacy_use_gap_reasons, public.pharmacy_issue_picks.

-- A pack picked for a requisition line: scanned (with the code read) or ticked by hand (D-CAT-15), and the batch's
-- later-than-planned reason when it is not the first to expire.
CREATE TABLE IF NOT EXISTS public.pharmacy_issue_picks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  requisition_id uuid NOT NULL REFERENCES public.pharmacy_requisitions(id) ON DELETE CASCADE,
  line_id uuid NOT NULL REFERENCES public.pharmacy_requisition_lines(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.pharmacy_products(id) ON DELETE RESTRICT,
  batch_id uuid REFERENCES public.pharmacy_batches(id) ON DELETE RESTRICT,
  method text NOT NULL CHECK (method IN ('scan','hand')),
  code text CHECK (code IS NULL OR char_length(code) <= 300),
  later_batch_reason text CHECK (later_batch_reason IS NULL OR char_length(later_batch_reason) BETWEEN 2 AND 60),
  picked_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  picked_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pip_scan_code CHECK ((method = 'scan') = (code IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS pip_requisition ON public.pharmacy_issue_picks (requisition_id, line_id, picked_at);

-- A ward-use gap's reason, from the signed list (D-CAT-14), for one product at one ward count.
CREATE TABLE IF NOT EXISTS public.pharmacy_use_gap_reasons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  location_id uuid NOT NULL REFERENCES public.pharmacy_locations(id) ON DELETE RESTRICT,
  count_id uuid NOT NULL REFERENCES public.pharmacy_counts(id) ON DELETE RESTRICT,
  product_id uuid NOT NULL REFERENCES public.pharmacy_products(id) ON DELETE RESTRICT,
  gap integer NOT NULL CHECK (gap <> 0),
  reason_code text NOT NULL CHECK (char_length(reason_code) BETWEEN 2 AND 60),
  note text CHECK (note IS NULL OR char_length(note) <= 300),
  recorded_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (count_id, product_id)
);

-- A cart's seal: applied at "Restock and seal", or reported broken (from the cart page or the ward-stock page).
CREATE TABLE IF NOT EXISTS public.pharmacy_seal_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  location_id uuid NOT NULL REFERENCES public.pharmacy_locations(id) ON DELETE RESTRICT,
  kind text NOT NULL CHECK (kind IN ('applied','broken')),
  seal_number text CHECK (seal_number IS NULL OR char_length(seal_number) BETWEEN 1 AND 40),
  cart_check_id uuid REFERENCES public.pharmacy_cart_checks(id) ON DELETE RESTRICT,
  note text CHECK (note IS NULL OR char_length(note) <= 300),
  reported_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  reported_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pse_applied CHECK (kind <> 'applied' OR (seal_number IS NOT NULL AND cart_check_id IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS pse_location ON public.pharmacy_seal_events (location_id, reported_at DESC);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['pharmacy_issue_picks','pharmacy_use_gap_reasons','pharmacy_seal_events'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS audit_%1$s ON public.%1$I', t);
    EXECUTE format('CREATE TRIGGER audit_%1$s AFTER INSERT OR UPDATE OR DELETE ON public.%1$I
      FOR EACH ROW EXECUTE FUNCTION public.audit_log_changes()', t);
    EXECUTE format('DROP TRIGGER IF EXISTS %1$s_append_only ON public.%1$I', t);
    EXECUTE format('CREATE TRIGGER %1$s_append_only BEFORE UPDATE OR DELETE ON public.%1$I
      FOR EACH ROW EXECUTE FUNCTION public.block_modify_append_only()', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
    EXECUTE format('GRANT SELECT ON public.%I TO medsync_clinical_reader', t);
    EXECUTE format('DROP POLICY IF EXISTS %1$s_select ON public.%1$I', t);
    EXECUTE format('CREATE POLICY %1$s_select ON public.%1$I FOR SELECT TO medsync_clinical_reader
      USING (hospital_id = (SELECT private.current_hospital_id()) AND (SELECT private.pharmacy_can(''pharmacy.view'')))', t);
  END LOOP;
END $$;
