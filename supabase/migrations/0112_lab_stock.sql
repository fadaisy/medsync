-- 0112 — Lab stock: items, lots with their state machine, an append-only ledger, deliveries, counts, lot
-- acceptance and lots in use; Phase 2's bedside lots moved into the ledger keeping their ids; eight new signed
-- configuration kinds; operational quality settings; what each released result was made with
-- (Lab Phase 3, docs/lab/phase-3/gate-a-proposal.md §3.1, §3.2, §7; E-LAB3-01, -02, -12; P1, P4, P12, P19).
--
-- No clinical number ships here: stock levels, plans and insert ranges are entered by the laboratory lead.
-- Event tables are append-only by trigger, including through the owner path. ADDITIVE and re-runnable.
-- GATED: owner-applied (`npm run db:migrate -- 0112`).
--
-- poct_lots → lab_stock_lots (§7), forward:
--   1. one stock item per (hospital, device test, strip or kit) that has a bedside lot, with a fixed id
--      (md5 of the key) so a re-run adds nothing; named "{test} strips|kits (from Phase 2)" for the lead to rename;
--   2. every poct_lots row copied with the SAME id, state `in_use`, basis `before_medsync` and the lead-facing
--      statement below, plus one lot event (none → in_use, actor MedSync) and one lots-in-use row (its device);
--   3. diagnostic_reports.lot_id re-pointed from poct_lots to lab_stock_lots (ids unchanged: no report touched);
--   4. poct_lots kept, append-only as before; until Step 4 moves the bedside code onto the ledger, a lot the
--      Phase 2 screens still add there is copied the same way by trigger (poct_lots_into_ledger);
--   5. the count check at the end refuses the migration unless every poct_lots row is in the ledger.
-- Reverse (no data lost either way; every id still exists in poct_lots):
--   ALTER TABLE public.diagnostic_reports DROP CONSTRAINT diagnostic_reports_lot_id_fkey;
--   ALTER TABLE public.diagnostic_reports ADD CONSTRAINT diagnostic_reports_lot_id_fkey
--     FOREIGN KEY (lot_id) REFERENCES public.poct_lots(id) ON DELETE RESTRICT;
--   DROP TRIGGER poct_lots_into_ledger ON public.poct_lots;   -- and point the bedside readers back at poct_lots.

-- ─── Who reads the lab's quality records (used by 0112–0117 policies) ────
-- Lab staff of the reader's hospital (the lab cadres, approved or active), or the head (substantive or acting)
-- of LABORATORY or one of its sections there.
CREATE OR REPLACE FUNCTION private.lab_reader() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.staff_affiliations sa JOIN public.cadres c ON c.id = sa.cadre_id
     WHERE sa.user_id = private.current_user_id() AND sa.hospital_id = private.current_hospital_id()
       AND sa.state IN ('active','approved') AND c.code IN ('LAB_TECH','LAB_TECHNOLOGIST'))
  OR EXISTS (
    SELECT 1 FROM public.department_heads h
      JOIN public.hospital_departments d ON d.id = h.department_id
      LEFT JOIN public.hospital_departments p ON p.id = d.parent_id
     WHERE h.user_id = private.current_user_id() AND h.hospital_id = private.current_hospital_id()
       AND h.ends_at IS NULL AND 'LABORATORY' IN (d.catalogue_code, p.catalogue_code));
$$;
-- A granted bedside operator's bedside devices: those on a ward of one of their departments, or on no ward.
-- ponytail: ward via the affiliation's department; add nursing_assignments wards if operators float.
CREATE OR REPLACE FUNCTION private.bedside_device_ids() RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT d.id FROM public.devices d
   WHERE d.hospital_id = private.current_hospital_id()
     AND d.kind IN ('glucometer','ketone_meter','hba1c_analyser','bp_monitor','rdt_kit','dipstick')
     AND EXISTS (SELECT 1 FROM public.poct_operators o
                  WHERE o.hospital_id = d.hospital_id AND o.user_id = private.current_user_id() AND o.revoked_at IS NULL)
     AND (d.ward_id IS NULL OR d.ward_id IN (
       SELECT w.id FROM public.hospital_wards w JOIN public.staff_affiliations sa ON sa.department_id = w.department_id
        WHERE sa.user_id = private.current_user_id() AND sa.hospital_id = d.hospital_id
          AND sa.state IN ('active','approved')));
$$;
REVOKE ALL ON FUNCTION private.lab_reader(), private.bedside_device_ids() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.lab_reader(), private.bedside_device_ids() TO medsync_clinical_reader;

-- ─── Signed configuration: eight new kinds and their signers (§3.1, E-LAB3-12) ─
ALTER TABLE public.lab_signed_configs DROP CONSTRAINT IF EXISTS lab_signed_configs_kind_check;
ALTER TABLE public.lab_signed_configs ADD CONSTRAINT lab_signed_configs_kind_check CHECK (kind IN
  ('scheme','flag_basis','elevation','hiv_algorithm','ncd_mapping','ref','addendum',
   'qc_plan','qc_policy','kit_qc_rule','acceptance_plan','device_qc_rule','competency_validity','hmis_mapping',
   'register_config'));
-- Lead-only kinds need the lead alone; the rest need a second, different signer (the CSO; the HMIS focal
-- person for hmis_mapping, checked by the action).
ALTER TABLE public.lab_signed_configs DROP CONSTRAINT IF EXISTS lsc_signed_by_two;
ALTER TABLE public.lab_signed_configs ADD CONSTRAINT lsc_signed_by_two CHECK (status = 'draft' OR (
  lead_signed_by IS NOT NULL AND in_force_from IS NOT NULL AND (
    kind IN ('kit_qc_rule','acceptance_plan','device_qc_rule','competency_validity','register_config')
    OR (cso_signed_by IS NOT NULL AND (lead_signed_by <> cso_signed_by OR exception_note IS NOT NULL)))));

-- Operational settings (never clinical): expiry alert window, consumption look-back, count frequency, ST-9
-- tolerance, EQA tester window, alternative-assessment period. Set by the lead, audited, not signed.
ALTER TABLE public.lab_settings ADD COLUMN IF NOT EXISTS quality jsonb NOT NULL DEFAULT '{}';

-- ─── Items and lots ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.lab_stock_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(name) BETWEEN 2 AND 160),
  kind text NOT NULL CHECK (kind IN ('reagent','kit','control','calibrator','stain','consumable','strip')),
  unit_of_issue text NOT NULL CHECK (char_length(unit_of_issue) BETWEEN 1 AND 40),
  pack_size integer CHECK (pack_size IS NULL OR pack_size > 0),
  tests_per_unit numeric CHECK (tests_per_unit IS NULL OR tests_per_unit > 0),
  test_codes text[] NOT NULL DEFAULT '{}',
  concept_ids text[] NOT NULL DEFAULT '{}',
  storage_device_id uuid REFERENCES public.devices(id) ON DELETE RESTRICT,
  hmis_tracer_code text CHECK (hmis_tracer_code IS NULL OR hmis_tracer_code ~ '^[A-Za-z0-9._-]{1,40}$'),
  min_months numeric CHECK (min_months IS NULL OR min_months >= 0),
  max_months numeric CHECK (max_months IS NULL OR max_months >= 0),
  active boolean NOT NULL DEFAULT true,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT lsi_levels CHECK (min_months IS NULL OR max_months IS NULL OR min_months <= max_months)
);

CREATE TABLE IF NOT EXISTS public.lab_stock_lots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES public.lab_stock_items(id) ON DELETE RESTRICT,
  lot text NOT NULL CHECK (char_length(lot) BETWEEN 1 AND 60),
  use_by date,
  received_at timestamptz NOT NULL DEFAULT now(),
  condition jsonb,
  opened_at timestamptz,
  -- `expired` is never stored: it is the clock's verdict at the end of the use-by day, hospital-local (ST-2, ST-8).
  state text NOT NULL DEFAULT 'received' CHECK (state IN ('received','in_acceptance','accepted','in_use','finished',
    'quarantined','rejected')),
  accepted_basis text CHECK (accepted_basis IS NULL OR accepted_basis IN ('plan','qc','certificate','none',
    'before_medsync')),
  statement text CHECK (statement IS NULL OR char_length(statement) BETWEEN 10 AND 500),
  insert_ranges jsonb,
  CONSTRAINT lsl_basis CHECK (state NOT IN ('accepted','in_use','finished') OR accepted_basis IS NOT NULL),
  CONSTRAINT lsl_statement CHECK (accepted_basis IS DISTINCT FROM 'before_medsync' OR statement IS NOT NULL)
);
-- One row per item and lot number. Phase 2 kept lots per device, so two meters on one strip lot arrive as two
-- rows (same ids as before): the moved rows are exempt; everything received from now on is unique.
CREATE UNIQUE INDEX IF NOT EXISTS lab_stock_lots_item_lot ON public.lab_stock_lots (item_id, lot)
  WHERE accepted_basis IS DISTINCT FROM 'before_medsync';
CREATE INDEX IF NOT EXISTS lab_stock_lots_hospital ON public.lab_stock_lots (hospital_id, state);

CREATE TABLE IF NOT EXISTS public.lab_stock_lot_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lot_id uuid NOT NULL REFERENCES public.lab_stock_lots(id) ON DELETE RESTRICT,
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  from_state text,
  to_state text NOT NULL,
  reason text CHECK (reason IS NULL OR char_length(reason) BETWEEN 3 AND 300),
  ref_kind text CHECK (ref_kind IS NULL OR ref_kind ~ '^[a-z_]{2,40}$'),
  ref_id uuid,
  actor uuid REFERENCES auth.users(id) ON DELETE RESTRICT,     -- NULL: MedSync
  at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS lab_stock_lot_events_lot ON public.lab_stock_lot_events (lot_id, at);

-- §5.1: a lot is born `received` (or moved in as `before_medsync`); its state moves only along the diagram, and
-- only with a matching lot event written in the same transaction. Identity never changes; nothing is deleted.
CREATE OR REPLACE FUNCTION private.lab_stock_lot_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.state <> 'received' AND NEW.accepted_basis IS DISTINCT FROM 'before_medsync' THEN
      RAISE EXCEPTION 'lab_stock_lots: a lot starts as received';
    END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'lab_stock_lots: a lot is never deleted'; END IF;
  IF (NEW.hospital_id, NEW.item_id, NEW.lot) IS DISTINCT FROM (OLD.hospital_id, OLD.item_id, OLD.lot) THEN
    RAISE EXCEPTION 'lab_stock_lots: a lot''s item and number never change';
  END IF;
  IF NEW.state IS DISTINCT FROM OLD.state THEN
    IF (OLD.state, NEW.state) NOT IN (('received','in_acceptance'),('received','accepted'),('received','quarantined'),
         ('in_acceptance','accepted'),('in_acceptance','rejected'),('in_acceptance','quarantined'),
         ('accepted','in_use'),('accepted','quarantined'),('in_use','finished'),('in_use','quarantined'),
         ('quarantined','accepted'),('quarantined','rejected')) THEN
      RAISE EXCEPTION 'lab_stock_lots: % to % is not a lot transition', OLD.state, NEW.state;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.lab_stock_lot_events e
                    WHERE e.lot_id = NEW.id AND e.from_state = OLD.state AND e.to_state = NEW.state
                      AND e.xmin = pg_current_xact_id()::xid) THEN
      RAISE EXCEPTION 'lab_stock_lots: a state change needs its lot event in the same transaction';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS lab_stock_lots_guard ON public.lab_stock_lots;
CREATE TRIGGER lab_stock_lots_guard BEFORE INSERT OR UPDATE OR DELETE ON public.lab_stock_lots
  FOR EACH ROW EXECUTE FUNCTION private.lab_stock_lot_guard();

-- ─── Deliveries, counts and the ledger (P12: lines immutable, the ledger is the fact) ─
CREATE TABLE IF NOT EXISTS public.lab_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  supplier text NOT NULL CHECK (supplier IN ('nms','jms','other')),
  supplier_name text CHECK (supplier_name IS NULL OR char_length(supplier_name) BETWEEN 2 AND 120),
  note_number text CHECK (note_number IS NULL OR char_length(note_number) BETWEEN 1 AND 60),
  received_at timestamptz NOT NULL DEFAULT now(),
  received_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  lines jsonb NOT NULL,                       -- [{itemId, lotId, received, accepted, rejected, condition, next}]
  CONSTRAINT ld_other CHECK (supplier <> 'other' OR supplier_name IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS public.lab_stock_counts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  counted_at timestamptz NOT NULL DEFAULT now(),
  counted_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  lines jsonb NOT NULL                        -- [{itemId, lotId, expected, counted, reason}]
);

CREATE TABLE IF NOT EXISTS public.lab_stock_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  item_id uuid NOT NULL REFERENCES public.lab_stock_items(id) ON DELETE RESTRICT,
  lot_id uuid REFERENCES public.lab_stock_lots(id) ON DELETE RESTRICT,
  kind text NOT NULL CHECK (kind IN ('receipt','issue','adjustment','count','write_off','return')),
  quantity integer NOT NULL,                  -- signed, units of issue
  to_kind text CHECK (to_kind IS NULL OR to_kind IN ('bench','device','ward')),
  to_ref uuid,
  reason text CHECK (reason IS NULL OR char_length(reason) BETWEEN 3 AND 300),
  fefo_reason text CHECK (fefo_reason IS NULL OR char_length(fefo_reason) BETWEEN 3 AND 300),
  delivery_id uuid REFERENCES public.lab_deliveries(id) ON DELETE RESTRICT,
  count_id uuid REFERENCES public.lab_stock_counts(id) ON DELETE RESTRICT,
  actor uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  at timestamptz NOT NULL DEFAULT now(),
  client_key text UNIQUE,
  CONSTRAINT lst_sign CHECK ((kind <> 'receipt' OR quantity > 0) AND (kind NOT IN ('issue','write_off') OR quantity < 0)
    AND (kind = 'count' OR quantity <> 0)),
  CONSTRAINT lst_issue CHECK (kind <> 'issue' OR (to_kind IS NOT NULL AND lot_id IS NOT NULL)),
  CONSTRAINT lst_reason CHECK (kind NOT IN ('adjustment','write_off') OR reason IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS lab_stock_transactions_item ON public.lab_stock_transactions (item_id, at);

-- ─── Acceptance and lots in use ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.lab_lot_acceptances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  lot_id uuid NOT NULL REFERENCES public.lab_stock_lots(id) ON DELETE RESTRICT,
  plan_config_id uuid REFERENCES public.lab_signed_configs(id) ON DELETE RESTRICT,
  plan_version integer,
  method text NOT NULL CHECK (method IN ('qc_pass','lot_comparison','certificate','none')),
  pairs jsonb NOT NULL DEFAULT '[]',          -- [{observationId, level, current, candidate}]; never patient identity (LA-5)
  qc_check_ids uuid[] NOT NULL DEFAULT '{}',
  certificate_path text CHECK (certificate_path IS NULL OR char_length(certificate_path) BETWEEN 3 AND 300),
  outcome text NOT NULL CHECK (outcome IN ('accepted','rejected')),
  reason text CHECK (reason IS NULL OR char_length(reason) BETWEEN 3 AND 300),
  decided_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  decided_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT lla_plan CHECK ((plan_config_id IS NULL) = (plan_version IS NULL)),
  CONSTRAINT lla_reason CHECK (outcome <> 'rejected' OR reason IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS public.lab_lots_in_use (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  device_id uuid REFERENCES public.devices(id) ON DELETE RESTRICT,
  section_id uuid REFERENCES public.hospital_departments(id) ON DELETE RESTRICT,
  concept_id text,
  kind text NOT NULL CHECK (kind IN ('reagent','calibrator','control','strip','kit')),
  lot_id uuid NOT NULL REFERENCES public.lab_stock_lots(id) ON DELETE RESTRICT,
  from_at timestamptz NOT NULL DEFAULT now(),
  set_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  CONSTRAINT lliu_place CHECK (device_id IS NOT NULL OR section_id IS NOT NULL)
);
-- Current = newest row per (device or section, concept, kind).
CREATE INDEX IF NOT EXISTS lab_lots_in_use_place ON public.lab_lots_in_use (hospital_id, device_id, section_id, from_at DESC);
-- LU-2, Law 6: only an accepted lot (or one already in use) is ever set in use. Expiry is the server's check.
CREATE OR REPLACE FUNCTION private.lab_lot_in_use_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.lab_stock_lots l WHERE l.id = NEW.lot_id AND l.state IN ('accepted','in_use')) THEN
    RAISE EXCEPTION 'lab_lots_in_use: only an accepted lot can be set in use';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS lab_lots_in_use_accepted ON public.lab_lots_in_use;
CREATE TRIGGER lab_lots_in_use_accepted BEFORE INSERT ON public.lab_lots_in_use
  FOR EACH ROW EXECUTE FUNCTION private.lab_lot_in_use_guard();

-- ─── What each released result was made with (Law 4, LU-3) ───────────────
ALTER TABLE public.lab_result_snapshots
  ADD COLUMN IF NOT EXISTS lots jsonb,       -- reagent, calibrator, control lot ids and numbers, or "not_recorded"
  ADD COLUMN IF NOT EXISTS qc jsonb;         -- {status, runId, override?}

-- ─── Append-only, audit, RLS ─────────────────────────────────────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['lab_stock_lot_events','lab_stock_transactions','lab_deliveries','lab_stock_counts',
    'lab_lot_acceptances','lab_lots_in_use'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %1$s_no_mutation ON public.%1$I', t);
    EXECUTE format('CREATE TRIGGER %1$s_no_mutation BEFORE UPDATE OR DELETE ON public.%1$I
      FOR EACH ROW EXECUTE FUNCTION public.block_modify_append_only()', t);
  END LOOP;
  FOREACH t IN ARRAY ARRAY['lab_stock_items','lab_stock_lots','lab_stock_lot_events','lab_stock_transactions',
    'lab_deliveries','lab_stock_counts','lab_lot_acceptances','lab_lots_in_use'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS audit_%1$s ON public.%1$I', t);
    EXECUTE format('CREATE TRIGGER audit_%1$s AFTER INSERT OR UPDATE OR DELETE ON public.%1$I
      FOR EACH ROW EXECUTE FUNCTION public.audit_log_changes()', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.%I FROM anon, authenticated', t);
    EXECUTE format('GRANT SELECT ON public.%I TO medsync_clinical_reader', t);
  END LOOP;
  -- The lab reads everything; nobody else reads the ledger, deliveries, counts or acceptances.
  FOREACH t IN ARRAY ARRAY['lab_stock_lot_events','lab_stock_transactions','lab_deliveries','lab_stock_counts',
    'lab_lot_acceptances'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS lab_read ON public.%I', t);
    EXECUTE format('CREATE POLICY lab_read ON public.%I FOR SELECT TO medsync_clinical_reader
      USING (hospital_id = (SELECT private.current_hospital_id()) AND (SELECT private.lab_reader()))', t);
  END LOOP;
END $$;
-- A bedside operator reads the lots in use on their own devices, those lots and their items.
DROP POLICY IF EXISTS lab_read ON public.lab_lots_in_use;
CREATE POLICY lab_read ON public.lab_lots_in_use FOR SELECT TO medsync_clinical_reader
  USING (hospital_id = (SELECT private.current_hospital_id())
         AND ((SELECT private.lab_reader()) OR device_id IN (SELECT private.bedside_device_ids())));
DROP POLICY IF EXISTS lab_read ON public.lab_stock_lots;
CREATE POLICY lab_read ON public.lab_stock_lots FOR SELECT TO medsync_clinical_reader
  USING (hospital_id = (SELECT private.current_hospital_id())
         AND ((SELECT private.lab_reader()) OR id IN (SELECT u.lot_id FROM public.lab_lots_in_use u
                                                     WHERE u.device_id IN (SELECT private.bedside_device_ids()))));
DROP POLICY IF EXISTS lab_read ON public.lab_stock_items;
CREATE POLICY lab_read ON public.lab_stock_items FOR SELECT TO medsync_clinical_reader
  USING (hospital_id = (SELECT private.current_hospital_id())
         AND ((SELECT private.lab_reader()) OR id IN (SELECT l.item_id FROM public.lab_stock_lots l)));

-- ─── poct_lots → lab_stock_lots (§7) ─────────────────────────────────────
CREATE OR REPLACE FUNCTION private.poct_lot_into_ledger(p_lot uuid) RETURNS void
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE
  p public.poct_lots;
  d public.devices;
  v_kind text;
  v_item uuid;
BEGIN
  SELECT * INTO p FROM public.poct_lots WHERE id = p_lot;
  SELECT * INTO d FROM public.devices WHERE id = p.device_id;
  v_kind := CASE WHEN d.kind = 'rdt_kit' THEN 'kit' ELSE 'strip' END;
  v_item := md5('poct-item:' || p.hospital_id || ':' || coalesce(d.test_code, d.kind) || ':' || v_kind)::uuid;
  INSERT INTO public.lab_stock_items (id, hospital_id, name, kind, unit_of_issue, test_codes, created_by)
  VALUES (v_item, p.hospital_id,
          coalesce((SELECT t.display FROM public.test_catalogue t WHERE t.code = d.test_code AND t.hospital_id IS NULL),
                   d.test_code, d.model)
            || CASE v_kind WHEN 'kit' THEN ' kits' ELSE ' strips' END || ' (from Phase 2)',
          v_kind, 'pack', array_remove(ARRAY[d.test_code], NULL), p.added_by)
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.lab_stock_lots (id, hospital_id, item_id, lot, use_by, received_at, state, accepted_basis, statement)
  VALUES (p.id, p.hospital_id, v_item, p.lot, p.use_by, p.added_at, 'in_use', 'before_medsync',
          'Recorded as a bedside lot in Phase 2 before stock and acceptance existed.')
  ON CONFLICT (id) DO NOTHING;
  IF FOUND THEN
    INSERT INTO public.lab_stock_lot_events (lot_id, hospital_id, from_state, to_state, reason, ref_kind, ref_id, actor, at)
    VALUES (p.id, p.hospital_id, NULL, 'in_use', 'Moved from the Phase 2 bedside lots', 'poct_lot', p.id, NULL, p.added_at);
    INSERT INTO public.lab_lots_in_use (hospital_id, device_id, kind, lot_id, from_at, set_by)
    VALUES (p.hospital_id, d.id, v_kind, p.id, p.added_at, p.added_by);
  END IF;
END;
$$;
CREATE OR REPLACE FUNCTION private.poct_lots_into_ledger() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM private.poct_lot_into_ledger(NEW.id);
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS poct_lots_into_ledger ON public.poct_lots;
CREATE TRIGGER poct_lots_into_ledger AFTER INSERT ON public.poct_lots
  FOR EACH ROW EXECUTE FUNCTION private.poct_lots_into_ledger();

SELECT private.poct_lot_into_ledger(id) FROM (SELECT id FROM public.poct_lots ORDER BY added_at, id) moved;

ALTER TABLE public.diagnostic_reports DROP CONSTRAINT IF EXISTS diagnostic_reports_lot_id_fkey;
ALTER TABLE public.diagnostic_reports ADD CONSTRAINT diagnostic_reports_lot_id_fkey
  FOREIGN KEY (lot_id) REFERENCES public.lab_stock_lots(id) ON DELETE RESTRICT;

-- Count check (§7 step 6): every bedside lot is in the ledger with its id, and every report's lot resolves.
DO $$
BEGIN
  IF (SELECT count(*) FROM public.poct_lots) <> (SELECT count(*) FROM public.lab_stock_lots s
       WHERE s.accepted_basis = 'before_medsync' AND s.id IN (SELECT id FROM public.poct_lots)) THEN
    RAISE EXCEPTION '0112: poct_lots and the moved ledger lots differ in number';
  END IF;
  IF EXISTS (SELECT 1 FROM public.diagnostic_reports r WHERE r.lot_id IS NOT NULL
              AND NOT EXISTS (SELECT 1 FROM public.lab_stock_lots s WHERE s.id = r.lot_id)) THEN
    RAISE EXCEPTION '0112: a bedside report''s lot is missing from the ledger';
  END IF;
END $$;
