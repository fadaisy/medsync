-- 0181 — Pharmacy Phase 2, part 2: the records around the ledger (deliveries, orders, requisitions and issues,
-- location packs, cart checks, write-offs, recall contacts and ward notices, month end, signed-set kinds, prints).
-- ADRs 0372, 0375 to 0378; GATE A signed 21 Oct 2026.
--
-- GATED: owner-applied (`npm run db:migrate`), after 0180. ADDITIVE.
--
-- Every record here is a projection's input, never a stored balance (Law 2). Movements stay in the ledger; these
-- rows say why each movement happened and who answered for it. Closed or confirmed records never change.

-- ─── 1. Orders (5.9, 5.10, OQ-1 to OQ-6) ─────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pharmacy_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  counterparty_id uuid REFERENCES public.pharmacy_counterparties(id) ON DELETE RESTRICT,
  kind text NOT NULL CHECK (kind IN ('cycle','emergency')),
  state text NOT NULL DEFAULT 'draft' CHECK (state IN ('draft','open','closed')),
  cut_at timestamptz NOT NULL,
  parameters_set_id uuid REFERENCES public.pharmacy_signed_sets(id) ON DELETE RESTRICT,
  budget numeric(16,2) CHECK (budget IS NULL OR budget >= 0),
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  saved_at timestamptz,
  saved_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  closed_at timestamptz
);
CREATE TABLE IF NOT EXISTS public.pharmacy_order_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.pharmacy_orders(id) ON DELETE RESTRICT,
  medicine_id text NOT NULL,
  product_id uuid NOT NULL REFERENCES public.pharmacy_products(id) ON DELETE RESTRICT,
  -- OQ-6: the inputs, each step and the parameter versions, as computed at the cut.
  inputs jsonb NOT NULL,
  proposed_units integer CHECK (proposed_units IS NULL OR proposed_units >= 0),
  proposed_packs integer CHECK (proposed_packs IS NULL OR proposed_packs >= 0),
  chosen_units integer CHECK (chosen_units IS NULL OR chosen_units >= 0),
  reason text CHECK (reason IS NULL OR char_length(reason) BETWEEN 2 AND 300),
  -- OQ-5: a proposed cut and its confirmation (with a typed reason for a vital line).
  cut jsonb,
  closed_at timestamptz,
  closed_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  close_reason text CHECK (close_reason IS NULL OR close_reason IN ('received','supplier_out','cancelled','substituted','other')),
  close_note text CHECK (close_note IS NULL OR char_length(close_note) <= 300),
  UNIQUE (order_id, product_id)
);
-- A saved order's lines change only by closing; a draft changes freely.
CREATE OR REPLACE FUNCTION private.pharmacy_order_line_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE _state text;
BEGIN
  SELECT state INTO _state FROM public.pharmacy_orders WHERE id = coalesce(NEW.order_id, OLD.order_id);
  IF _state = 'draft' THEN RETURN coalesce(NEW, OLD); END IF;
  IF TG_OP = 'DELETE' OR OLD.closed_at IS NOT NULL THEN
    RAISE EXCEPTION 'pharmacy_order_lines: a saved order line is closed, never removed or reopened';
  END IF;
  IF (to_jsonb(NEW) - ARRAY['closed_at','closed_by','close_reason','close_note'])
     IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['closed_at','closed_by','close_reason','close_note']) THEN
    RAISE EXCEPTION 'pharmacy_order_lines: a saved order line changes only by closing';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS pol_guard ON public.pharmacy_order_lines;
CREATE TRIGGER pol_guard BEFORE UPDATE OR DELETE ON public.pharmacy_order_lines
  FOR EACH ROW EXECUTE FUNCTION private.pharmacy_order_line_guard();
CREATE OR REPLACE FUNCTION private.pharmacy_order_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.state = 'draft' THEN RETURN OLD; END IF;
    RAISE EXCEPTION 'pharmacy_orders: a saved order is closed, never deleted';
  END IF;
  IF OLD.state = 'closed' THEN RAISE EXCEPTION 'pharmacy_orders: a closed order never changes'; END IF;
  IF OLD.state = 'open' AND ((to_jsonb(NEW) - ARRAY['state','closed_at']) IS DISTINCT FROM
                             (to_jsonb(OLD) - ARRAY['state','closed_at']) OR NEW.state <> 'closed') THEN
    RAISE EXCEPTION 'pharmacy_orders: a saved order changes only by closing';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS po_guard ON public.pharmacy_orders;
CREATE TRIGGER po_guard BEFORE UPDATE OR DELETE ON public.pharmacy_orders
  FOR EACH ROW EXECUTE FUNCTION private.pharmacy_order_guard();

-- ─── 2. Deliveries (5.2, RG-1 to RG-6) ───────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pharmacy_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  location_id uuid NOT NULL REFERENCES public.pharmacy_locations(id) ON DELETE RESTRICT,
  supplier_id uuid NOT NULL REFERENCES public.pharmacy_counterparties(id) ON DELETE RESTRICT,
  note_number text NOT NULL CHECK (char_length(note_number) BETWEEN 1 AND 80),
  order_id uuid REFERENCES public.pharmacy_orders(id) ON DELETE RESTRICT,
  arrived_at timestamptz NOT NULL,
  counted_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  witness_name text CHECK (witness_name IS NULL OR char_length(witness_name) BETWEEN 2 AND 120),
  deliverer_name text CHECK (deliverer_name IS NULL OR char_length(deliverer_name) BETWEEN 2 AND 120),
  vehicle_registration text CHECK (vehicle_registration IS NULL OR char_length(vehicle_registration) BETWEEN 2 AND 20),
  state text NOT NULL DEFAULT 'counting' CHECK (state IN ('counting','received','abandoned')),
  abandon_reason text CHECK (abandon_reason IS NULL OR char_length(abandon_reason) BETWEEN 3 AND 300),
  finished_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pd_finished CHECK ((state = 'counting') = (finished_at IS NULL)
    AND (state <> 'abandoned' OR abandon_reason IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS pd_note ON public.pharmacy_deliveries (hospital_id, supplier_id, note_number)
  WHERE state <> 'abandoned';
CREATE TABLE IF NOT EXISTS public.pharmacy_delivery_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_id uuid NOT NULL REFERENCES public.pharmacy_deliveries(id) ON DELETE RESTRICT,
  line_no integer NOT NULL CHECK (line_no > 0),
  -- RG-3: the product actually delivered; a wrong product names what the note said.
  product_id uuid NOT NULL REFERENCES public.pharmacy_products(id) ON DELETE RESTRICT,
  note_product_id uuid REFERENCES public.pharmacy_products(id) ON DELETE RESTRICT,
  order_line_id uuid REFERENCES public.pharmacy_order_lines(id) ON DELETE RESTRICT,
  note_quantity integer CHECK (note_quantity IS NULL OR note_quantity >= 0),
  accepted_quantity integer NOT NULL DEFAULT 0 CHECK (accepted_quantity >= 0),
  rejected_kept_quantity integer NOT NULL DEFAULT 0 CHECK (rejected_kept_quantity >= 0),
  rejected_returned_quantity integer NOT NULL DEFAULT 0 CHECK (rejected_returned_quantity >= 0),
  reject_reason text CHECK (reject_reason IS NULL OR reject_reason IN
    ('damaged','wrong_product','expired','short_dated','other')),
  batch_number text CHECK (batch_number IS NULL OR char_length(batch_number) BETWEEN 1 AND 60),
  expiry date,
  expiry_month_only boolean NOT NULL DEFAULT false,
  unit_cost numeric(14,2) CHECK (unit_cost IS NULL OR unit_cost >= 0),
  short_dated_decision text CHECK (short_dated_decision IS NULL OR short_dated_decision IN ('accept','accept_tell','reject')),
  note text CHECK (note IS NULL OR char_length(note) <= 300),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (delivery_id, line_no),
  CONSTRAINT pdl_rejected_reason CHECK (rejected_kept_quantity + rejected_returned_quantity = 0 OR reject_reason IS NOT NULL),
  CONSTRAINT pdl_batch CHECK (accepted_quantity + rejected_kept_quantity = 0 OR (batch_number IS NOT NULL AND expiry IS NOT NULL))
);
CREATE OR REPLACE FUNCTION private.pharmacy_delivery_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE _state text;
BEGIN
  IF TG_TABLE_NAME = 'pharmacy_deliveries' THEN
    IF TG_OP = 'DELETE' OR OLD.state <> 'counting' THEN
      RAISE EXCEPTION 'pharmacy_deliveries: a finished delivery never changes';
    END IF;
    RETURN NEW;
  END IF;
  SELECT state INTO _state FROM public.pharmacy_deliveries WHERE id = coalesce(NEW.delivery_id, OLD.delivery_id);
  IF _state <> 'counting' THEN RAISE EXCEPTION 'pharmacy_delivery_lines: the delivery is finished'; END IF;
  RETURN coalesce(NEW, OLD);
END;
$$;
DROP TRIGGER IF EXISTS pd_guard ON public.pharmacy_deliveries;
CREATE TRIGGER pd_guard BEFORE UPDATE OR DELETE ON public.pharmacy_deliveries
  FOR EACH ROW EXECUTE FUNCTION private.pharmacy_delivery_guard();
DROP TRIGGER IF EXISTS pdl_guard ON public.pharmacy_delivery_lines;
CREATE TRIGGER pdl_guard BEFORE INSERT OR UPDATE OR DELETE ON public.pharmacy_delivery_lines
  FOR EACH ROW EXECUTE FUNCTION private.pharmacy_delivery_guard();

-- ─── 3. Requisitions, issues and confirmations (5.3, IS-1 to IS-7) ──────
CREATE TABLE IF NOT EXISTS public.pharmacy_requisitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  requesting_location_id uuid NOT NULL REFERENCES public.pharmacy_locations(id) ON DELETE RESTRICT,
  issuing_location_id uuid NOT NULL REFERENCES public.pharmacy_locations(id) ON DELETE RESTRICT,
  raised_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  raised_at timestamptz NOT NULL DEFAULT now(),
  state text NOT NULL DEFAULT 'raised' CHECK (state IN
    ('raised','issued','part_issued','refused','withdrawn','confirmed','confirmed_with_difference')),
  refused_reason text CHECK (refused_reason IS NULL OR char_length(refused_reason) BETWEEN 2 AND 300),
  closed_at timestamptz,
  CONSTRAINT prq_places CHECK (requesting_location_id <> issuing_location_id),
  CONSTRAINT prq_refused CHECK (state <> 'refused' OR refused_reason IS NOT NULL)
);
CREATE TABLE IF NOT EXISTS public.pharmacy_requisition_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requisition_id uuid NOT NULL REFERENCES public.pharmacy_requisitions(id) ON DELETE RESTRICT,
  product_id uuid NOT NULL REFERENCES public.pharmacy_products(id) ON DELETE RESTRICT,
  quantity_asked integer NOT NULL CHECK (quantity_asked > 0),
  quantity_issued integer CHECK (quantity_issued IS NULL OR quantity_issued >= 0),
  not_issued_reason text CHECK (not_issued_reason IS NULL OR char_length(not_issued_reason) BETWEEN 2 AND 60),
  UNIQUE (requisition_id, product_id),
  CONSTRAINT prl_not_issued CHECK (quantity_issued IS NULL OR quantity_issued > 0 OR not_issued_reason IS NOT NULL)
);
-- An issue (or a return, or a cart restock): the event its movement pairs point at as their source.
CREATE TABLE IF NOT EXISTS public.pharmacy_issues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  kind text NOT NULL CHECK (kind IN ('issue','return','restock','cart_move')),
  from_location_id uuid NOT NULL REFERENCES public.pharmacy_locations(id) ON DELETE RESTRICT,
  to_location_id uuid NOT NULL REFERENCES public.pharmacy_locations(id) ON DELETE RESTRICT,
  requisition_id uuid REFERENCES public.pharmacy_requisitions(id) ON DELETE RESTRICT,
  return_reason text CHECK (return_reason IS NULL OR char_length(return_reason) BETWEEN 2 AND 60),
  issued_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  witness_attestation_id uuid REFERENCES public.pharmacy_attestations(id) ON DELETE RESTRICT,
  issued_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pis_places CHECK (from_location_id <> to_location_id),
  CONSTRAINT pis_return CHECK (kind <> 'return' OR return_reason IS NOT NULL)
);
CREATE TABLE IF NOT EXISTS public.pharmacy_issue_confirmations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_id uuid NOT NULL UNIQUE REFERENCES public.pharmacy_issues(id) ON DELETE RESTRICT,
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  confirmed_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  attestation_id uuid REFERENCES public.pharmacy_attestations(id) ON DELETE RESTRICT,
  -- {batchId: {expected, found, reason}} for each line that differed; empty when everything arrived.
  differences jsonb NOT NULL DEFAULT '{}'::jsonb,
  confirmed_at timestamptz NOT NULL DEFAULT now()
);
CREATE OR REPLACE FUNCTION private.pharmacy_requisition_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION '%: never deleted', TG_TABLE_NAME; END IF;
  IF TG_TABLE_NAME = 'pharmacy_requisitions' THEN
    IF OLD.state IN ('refused','withdrawn','confirmed','confirmed_with_difference') THEN
      RAISE EXCEPTION 'pharmacy_requisitions: a closed requisition never changes';
    END IF;
    IF (to_jsonb(NEW) - ARRAY['state','refused_reason','closed_at'])
       IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['state','refused_reason','closed_at']) THEN
      RAISE EXCEPTION 'pharmacy_requisitions: only its state changes';
    END IF;
  ELSE
    IF OLD.quantity_issued IS NOT NULL OR NEW.requisition_id <> OLD.requisition_id
       OR NEW.product_id <> OLD.product_id OR NEW.quantity_asked <> OLD.quantity_asked THEN
      RAISE EXCEPTION 'pharmacy_requisition_lines: a line is issued once';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS prq_guard ON public.pharmacy_requisitions;
CREATE TRIGGER prq_guard BEFORE UPDATE OR DELETE ON public.pharmacy_requisitions
  FOR EACH ROW EXECUTE FUNCTION private.pharmacy_requisition_guard();
DROP TRIGGER IF EXISTS prl_guard ON public.pharmacy_requisition_lines;
CREATE TRIGGER prl_guard BEFORE UPDATE OR DELETE ON public.pharmacy_requisition_lines
  FOR EACH ROW EXECUTE FUNCTION private.pharmacy_requisition_guard();

-- ─── 4. Ward levels and cart lists (Appendix D, signed per location) ────
CREATE TABLE IF NOT EXISTS public.pharmacy_location_packs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  location_id uuid NOT NULL REFERENCES public.pharmacy_locations(id) ON DELETE RESTRICT,
  kind text NOT NULL CHECK (kind IN ('ward_levels','cart_list')),
  version integer NOT NULL CHECK (version > 0),
  -- ward_levels: {levels: {productId: n}}; cart_list: {items: {productId: n}, checkIntervalDays, names: [..]}
  content jsonb NOT NULL,
  sha256 text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','signed','retired')),
  authored_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  first_signer uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  first_signer_role text,
  second_signer uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  second_signer_role text,
  exception_text text CHECK (exception_text IS NULL OR char_length(exception_text) BETWEEN 10 AND 500),
  signed_at timestamptz,
  retired_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (location_id, kind, version),
  CONSTRAINT plp_signed CHECK (status = 'draft' OR (first_signer IS NOT NULL AND signed_at IS NOT NULL
    AND ((second_signer IS NOT NULL AND second_signer <> first_signer) OR exception_text IS NOT NULL)))
);
CREATE UNIQUE INDEX IF NOT EXISTS plp_one_signed ON public.pharmacy_location_packs (location_id, kind)
  WHERE status = 'signed';
CREATE OR REPLACE FUNCTION private.pharmacy_location_pack_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status = 'draft' THEN RETURN OLD; END IF;
    RAISE EXCEPTION 'pharmacy_location_packs: a signed pack is retired, never deleted';
  END IF;
  NEW.sha256 := encode(sha256(convert_to(NEW.content::text, 'UTF8')), 'hex');
  IF TG_OP = 'UPDATE' AND OLD.status <> 'draft' THEN
    IF NOT (OLD.status = 'signed' AND NEW.status = 'retired'
            AND (to_jsonb(NEW) - ARRAY['status','retired_at']) = (to_jsonb(OLD) - ARRAY['status','retired_at'])) THEN
      RAISE EXCEPTION 'pharmacy_location_packs: a signed pack never changes; write a new version';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS plp_guard ON public.pharmacy_location_packs;
CREATE TRIGGER plp_guard BEFORE INSERT OR UPDATE OR DELETE ON public.pharmacy_location_packs
  FOR EACH ROW EXECUTE FUNCTION private.pharmacy_location_pack_guard();

-- ─── 5. Cart checks (5.5, EC-1 to EC-4) ──────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pharmacy_cart_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  location_id uuid NOT NULL REFERENCES public.pharmacy_locations(id) ON DELETE RESTRICT,
  count_id uuid NOT NULL REFERENCES public.pharmacy_counts(id) ON DELETE RESTRICT,
  restock_issue_id uuid REFERENCES public.pharmacy_issues(id) ON DELETE RESTRICT,
  seal_number text CHECK (seal_number IS NULL OR char_length(seal_number) BETWEEN 1 AND 40),
  -- {batchId: {gap, explanation: used_not_recorded|broken|moved|cannot_explain, note, toCart}}
  explanations jsonb NOT NULL DEFAULT '{}'::jsonb,
  checked_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  confirmed_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  confirm_attestation_id uuid REFERENCES public.pharmacy_attestations(id) ON DELETE RESTRICT,
  checked_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pcc_two CHECK (confirmed_by <> checked_by)
);

-- ─── 6. Write-offs (5.6, EX-2) ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pharmacy_write_offs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  location_id uuid NOT NULL REFERENCES public.pharmacy_locations(id) ON DELETE RESTRICT,
  register_number text NOT NULL CHECK (char_length(register_number) BETWEEN 1 AND 40),
  reason text NOT NULL CHECK (char_length(reason) BETWEEN 2 AND 60),
  note text CHECK (note IS NULL OR char_length(note) <= 500),
  witness_attestation_id uuid NOT NULL REFERENCES public.pharmacy_attestations(id) ON DELETE RESTRICT,
  actor_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  written_off_at timestamptz NOT NULL DEFAULT now(),
  disposal_reference text CHECK (disposal_reference IS NULL OR char_length(disposal_reference) BETWEEN 2 AND 120),
  disposal_on date,
  disposal_recorded_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  UNIQUE (hospital_id, register_number)
);
CREATE OR REPLACE FUNCTION private.pharmacy_write_off_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' OR OLD.disposal_reference IS NOT NULL THEN
    RAISE EXCEPTION 'pharmacy_write_offs: a write-off never changes once its disposal is recorded';
  END IF;
  IF (to_jsonb(NEW) - ARRAY['disposal_reference','disposal_on','disposal_recorded_by'])
     IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['disposal_reference','disposal_on','disposal_recorded_by']) THEN
    RAISE EXCEPTION 'pharmacy_write_offs: only the disposal reference is added later';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS pwo_guard ON public.pharmacy_write_offs;
CREATE TRIGGER pwo_guard BEFORE UPDATE OR DELETE ON public.pharmacy_write_offs
  FOR EACH ROW EXECUTE FUNCTION private.pharmacy_write_off_guard();

-- ─── 7. Recall contacts and ward notices (5.7, RC-5) ─────────────────────
CREATE TABLE IF NOT EXISTS public.pharmacy_recall_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recall_id uuid NOT NULL REFERENCES public.pharmacy_recalls(id) ON DELETE RESTRICT,
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  patient_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  list text NOT NULL CHECK (list IN ('exact','may_have')),
  outcome text NOT NULL CHECK (outcome IN ('told_by_message','reached_by_phone','reached_at_visit','could_not_reach')),
  note text CHECK (note IS NULL OR char_length(note) <= 300),
  actor_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.pharmacy_recall_ward_notices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recall_id uuid NOT NULL REFERENCES public.pharmacy_recalls(id) ON DELETE RESTRICT,
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  location_id uuid NOT NULL REFERENCES public.pharmacy_locations(id) ON DELETE RESTRICT,
  posted_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  posted_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (recall_id, location_id)
);

-- ─── 8. Month end (5.8, MR-1 to MR-6) ────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pharmacy_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  -- NULL: the hospital as a whole.
  location_id uuid REFERENCES public.pharmacy_locations(id) ON DELETE RESTRICT,
  month date NOT NULL CHECK (extract(day FROM month) = 1),
  closed_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  approved_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  approval_attestation_id uuid NOT NULL REFERENCES public.pharmacy_attestations(id) ON DELETE RESTRICT,
  closed_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pper_two CHECK (approved_by <> closed_by)
);
CREATE UNIQUE INDEX IF NOT EXISTS pper_once ON public.pharmacy_periods
  (hospital_id, coalesce(location_id, '00000000-0000-0000-0000-000000000000'::uuid), month);
CREATE TABLE IF NOT EXISTS public.pharmacy_period_snapshots (
  period_id uuid PRIMARY KEY REFERENCES public.pharmacy_periods(id) ON DELETE RESTRICT,
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  content jsonb NOT NULL,
  sha256 text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.pharmacy_period_difference_reasons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  location_id uuid NOT NULL REFERENCES public.pharmacy_locations(id) ON DELETE RESTRICT,
  month date NOT NULL CHECK (extract(day FROM month) = 1),
  product_id uuid NOT NULL REFERENCES public.pharmacy_products(id) ON DELETE RESTRICT,
  kind text NOT NULL CHECK (kind IN ('difference','not_counted')),
  reason_code text CHECK (reason_code IS NULL OR char_length(reason_code) BETWEEN 2 AND 60),
  unexplained boolean NOT NULL DEFAULT false,
  note text CHECK (note IS NULL OR char_length(note) <= 500),
  actor_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ppdr_reason CHECK (unexplained OR reason_code IS NOT NULL)
);

-- ─── 9. Signed-set kinds (Appendix D) and print kinds ────────────────────
ALTER TABLE public.pharmacy_signed_sets DROP CONSTRAINT IF EXISTS pharmacy_signed_sets_kind_check;
ALTER TABLE public.pharmacy_signed_sets ADD CONSTRAINT pharmacy_signed_sets_kind_check CHECK (kind IN (
  'lane_rule','high_risk_list','controlled_classes','witness_list','outcome_reasons','close_reasons',
  'decline_reasons','reversal_reasons','correction_reasons','adjustment_reasons','batch_choice_reasons',
  'count_difference_reasons','supply_without_pharmacist_reasons','payment_exemption_reasons',
  'identity_routes','query_codes','keep_reasons','withdraw_reasons','substitution_rule','label_fields',
  'warning_lines','additional_instructions','plain_words_templates','counselling_points','staff_copy',
  'patient_copy','message_name','availability_mapping',
  'order_parameters','tracer_list','cart_lookahead','month_end_rules','ward_rules','stores_reason_lists',
  'hmis_column_maps','recall_template','stockout_day_rule'));

ALTER TABLE public.pharmacy_print_events DROP CONSTRAINT IF EXISTS pharmacy_print_events_kind_check;
ALTER TABLE public.pharmacy_print_events ADD CONSTRAINT pharmacy_print_events_kind_check CHECK (kind IN (
  'label','label_reprint','slip','register_entry','dispensing_log','downtime_sheets',
  'discrepancy_report','goods_received_note','voucher','write_off_register','stock_status','tracer_audit',
  'order_085','order_084b','purchase_list','recall_list','recall_reconciliation','loan_record','quantities_text'));

-- ─── 10. Grants, RLS, audit, append-only ─────────────────────────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['pharmacy_orders','pharmacy_order_lines','pharmacy_deliveries','pharmacy_delivery_lines',
    'pharmacy_requisitions','pharmacy_requisition_lines','pharmacy_issues','pharmacy_issue_confirmations',
    'pharmacy_location_packs','pharmacy_cart_checks','pharmacy_write_offs','pharmacy_recall_events',
    'pharmacy_recall_ward_notices','pharmacy_periods','pharmacy_period_snapshots',
    'pharmacy_period_difference_reasons'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS audit_%1$s ON public.%1$I', t);
    EXECUTE format('CREATE TRIGGER audit_%1$s AFTER INSERT OR UPDATE OR DELETE ON public.%1$I
      FOR EACH ROW EXECUTE FUNCTION public.audit_log_changes()', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
    EXECUTE format('GRANT SELECT ON public.%I TO medsync_clinical_reader', t);
    EXECUTE format('DROP POLICY IF EXISTS %1$s_select ON public.%1$I', t);
    IF t IN ('pharmacy_order_lines') THEN
      EXECUTE format('CREATE POLICY %1$s_select ON public.%1$I FOR SELECT TO medsync_clinical_reader
        USING (EXISTS (SELECT 1 FROM public.pharmacy_orders o WHERE o.id = order_id
                 AND o.hospital_id = (SELECT private.current_hospital_id()))
               AND (SELECT private.pharmacy_can(''pharmacy.view'')))', t);
    ELSIF t = 'pharmacy_delivery_lines' THEN
      EXECUTE format('CREATE POLICY %1$s_select ON public.%1$I FOR SELECT TO medsync_clinical_reader
        USING (EXISTS (SELECT 1 FROM public.pharmacy_deliveries d WHERE d.id = delivery_id
                 AND d.hospital_id = (SELECT private.current_hospital_id()))
               AND (SELECT private.pharmacy_can(''pharmacy.view'')))', t);
    ELSIF t = 'pharmacy_requisition_lines' THEN
      EXECUTE format('CREATE POLICY %1$s_select ON public.%1$I FOR SELECT TO medsync_clinical_reader
        USING (EXISTS (SELECT 1 FROM public.pharmacy_requisitions r WHERE r.id = requisition_id
                 AND r.hospital_id = (SELECT private.current_hospital_id())
                 AND ((SELECT private.pharmacy_can(''pharmacy.view''))
                      OR private.pharmacy_location_reader(r.requesting_location_id))))', t);
    ELSE
      EXECUTE format('CREATE POLICY %1$s_select ON public.%1$I FOR SELECT TO medsync_clinical_reader
        USING (hospital_id = (SELECT private.current_hospital_id()) AND (SELECT private.pharmacy_can(''pharmacy.view'')))', t);
    END IF;
  END LOOP;
  FOREACH t IN ARRAY ARRAY['pharmacy_issues','pharmacy_issue_confirmations','pharmacy_cart_checks',
    'pharmacy_recall_events','pharmacy_recall_ward_notices','pharmacy_periods','pharmacy_period_snapshots',
    'pharmacy_period_difference_reasons'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %1$s_append_only ON public.%1$I', t);
    EXECUTE format('CREATE TRIGGER %1$s_append_only BEFORE UPDATE OR DELETE ON public.%1$I
      FOR EACH ROW EXECUTE FUNCTION public.block_modify_append_only()', t);
  END LOOP;
END $$;

-- Ward and cart people read their own location's records; a ward's notices name no patient.
DROP POLICY IF EXISTS pharmacy_requisitions_people ON public.pharmacy_requisitions;
CREATE POLICY pharmacy_requisitions_people ON public.pharmacy_requisitions FOR SELECT TO medsync_clinical_reader
  USING (hospital_id = (SELECT private.current_hospital_id())
         AND private.pharmacy_location_reader(requesting_location_id));
DROP POLICY IF EXISTS pharmacy_issues_people ON public.pharmacy_issues;
CREATE POLICY pharmacy_issues_people ON public.pharmacy_issues FOR SELECT TO medsync_clinical_reader
  USING (hospital_id = (SELECT private.current_hospital_id())
         AND (private.pharmacy_location_reader(to_location_id) OR private.pharmacy_location_reader(from_location_id)));
DROP POLICY IF EXISTS pharmacy_issue_confirmations_people ON public.pharmacy_issue_confirmations;
CREATE POLICY pharmacy_issue_confirmations_people ON public.pharmacy_issue_confirmations FOR SELECT
  TO medsync_clinical_reader
  USING (hospital_id = (SELECT private.current_hospital_id()) AND EXISTS (
    SELECT 1 FROM public.pharmacy_issues i WHERE i.id = issue_id AND private.pharmacy_location_reader(i.to_location_id)));
DROP POLICY IF EXISTS pharmacy_location_packs_people ON public.pharmacy_location_packs;
CREATE POLICY pharmacy_location_packs_people ON public.pharmacy_location_packs FOR SELECT TO medsync_clinical_reader
  USING (hospital_id = (SELECT private.current_hospital_id()) AND private.pharmacy_location_reader(location_id));
DROP POLICY IF EXISTS pharmacy_cart_checks_people ON public.pharmacy_cart_checks;
CREATE POLICY pharmacy_cart_checks_people ON public.pharmacy_cart_checks FOR SELECT TO medsync_clinical_reader
  USING (hospital_id = (SELECT private.current_hospital_id()) AND private.pharmacy_location_reader(location_id));
DROP POLICY IF EXISTS pharmacy_recall_ward_notices_people ON public.pharmacy_recall_ward_notices;
CREATE POLICY pharmacy_recall_ward_notices_people ON public.pharmacy_recall_ward_notices FOR SELECT
  TO medsync_clinical_reader
  USING (hospital_id = (SELECT private.current_hospital_id()) AND private.pharmacy_location_reader(location_id));

-- A ward's or cart's people read its counts, and the recall behind a notice posted to their ward.
DROP POLICY IF EXISTS pharmacy_counts_people ON public.pharmacy_counts;
CREATE POLICY pharmacy_counts_people ON public.pharmacy_counts FOR SELECT TO medsync_clinical_reader
  USING (location_id IS NOT NULL AND hospital_id = (SELECT private.current_hospital_id())
         AND private.pharmacy_location_reader(location_id));
DROP POLICY IF EXISTS pharmacy_count_lines_people ON public.pharmacy_count_lines;
CREATE POLICY pharmacy_count_lines_people ON public.pharmacy_count_lines FOR SELECT TO medsync_clinical_reader
  USING (EXISTS (SELECT 1 FROM public.pharmacy_counts c WHERE c.id = count_id AND c.location_id IS NOT NULL
                   AND c.hospital_id = (SELECT private.current_hospital_id())
                   AND private.pharmacy_location_reader(c.location_id)));
DROP POLICY IF EXISTS pharmacy_recalls_people ON public.pharmacy_recalls;
CREATE POLICY pharmacy_recalls_people ON public.pharmacy_recalls FOR SELECT TO medsync_clinical_reader
  USING (hospital_id = (SELECT private.current_hospital_id()) AND EXISTS (
    SELECT 1 FROM public.pharmacy_recall_ward_notices n
     WHERE n.recall_id = pharmacy_recalls.id AND private.pharmacy_location_reader(n.location_id)));
