-- 0230 — Pharmacy Phase 4, first merge: repeat authorisations, repeat instances, renewal requests, refill requests,
-- named collectors, and prepared (held) stock (RP-1 to RP-6, RI-1, RF-1 to RF-5, RN-1 to RN-4, SA-1 to SA-6; ADR range
-- 0426 to 0444, docs/NUMBERS.md; GATE A signed 26 Oct 2026, D-PH4-29: the CSO signs alone for Steps 2 to 5).
--
-- GATED: owner-applied (`npm run db:migrate`), after 0212. ADDITIVE. Nothing reads these tables until the flags
-- `pharmacyRepeats` and `pharmacyRefills` are on, and they stay off until legal questions 1 and 2 are answered.
--
--   1. prescription_repeat_authorisations: the prescriber's record beside one prescription line (a prescriptions
--      row is one line version). Append-only. `stopped` is the only later event; `ended` is a projection (RP-3).
--      No column is added to prescriptions. A controlled line can never carry one (RP-2 backstop).
--   2. pharmacy_repeat_instances and their events (RI-1): one open instance per line at a time.
--   3. prescription_renewal_requests and events (RN-1 to RN-4): the first answer wins; nothing closes by itself.
--   4. pharmacy_refill_requests, _lines, _events (RF-1): states are events; nothing closes by itself.
--   5. patient_collectors (D-PH4-26): the patient's named collectors; only removal changes a row.
--   6. The `prepared` location kind and its paired movements (SA-1, amending Phase 2 LC-1 and LC-3).
--   7. `routed` and `route_returned` line outcomes (amending Phase 1 LO-4), written by the network merge.

-- ─── 1. Repeat authorisations ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.prescription_repeat_authorisations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  patient_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  prescription_id uuid NOT NULL UNIQUE REFERENCES public.prescriptions(id) ON DELETE RESTRICT,
  further_supplies integer NOT NULL CHECK (further_supplies BETWEEN 1 AND 99),
  min_interval_days integer NOT NULL CHECK (min_interval_days >= 1),
  not_after date NOT NULL,
  review_by date,
  rule_version integer NOT NULL CHECK (rule_version >= 1),
  prescriber_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  prescriber_cadre text,
  authorised_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pra_dates CHECK (not_after >= (authorised_at AT TIME ZONE 'Africa/Kampala')::date
    AND (review_by IS NULL OR review_by >= (authorised_at AT TIME ZONE 'Africa/Kampala')::date))
);
CREATE INDEX IF NOT EXISTS pra_patient ON public.prescription_repeat_authorisations (patient_user_id, hospital_id);

-- RP-2 backstop: controlled drugs are never repeated, and the authorisation matches its line.
CREATE OR REPLACE FUNCTION private.repeat_authorisation_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE _p public.prescriptions;
BEGIN
  SELECT * INTO _p FROM public.prescriptions WHERE id = NEW.prescription_id;
  IF _p.controlled THEN
    RAISE EXCEPTION 'pharmacy: a controlled medicine is never repeated (RP-2)' USING ERRCODE = 'P0001', HINT = 'controlled';
  END IF;
  IF _p.hospital_id <> NEW.hospital_id OR _p.patient_user_id <> NEW.patient_user_id THEN
    RAISE EXCEPTION 'pharmacy: the authorisation does not match its prescription line';
  END IF;
  IF _p.state = 'cancelled' THEN
    RAISE EXCEPTION 'pharmacy: a cancelled line cannot be authorised for repeats (RP-3)' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS pra_guard ON public.prescription_repeat_authorisations;
CREATE TRIGGER pra_guard BEFORE INSERT ON public.prescription_repeat_authorisations
  FOR EACH ROW EXECUTE FUNCTION private.repeat_authorisation_guard();

CREATE TABLE IF NOT EXISTS public.prescription_repeat_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  authorisation_id uuid NOT NULL REFERENCES public.prescription_repeat_authorisations(id) ON DELETE RESTRICT,
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  kind text NOT NULL CHECK (kind IN ('stopped')),
  reason text NOT NULL CHECK (char_length(reason) BETWEEN 2 AND 500),
  actor_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  actor_cadre text,
  at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS pre_stopped_once ON public.prescription_repeat_events (authorisation_id)
  WHERE kind = 'stopped';

-- ─── 2. Repeat instances (RI-1) ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pharmacy_repeat_instances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  patient_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  authorisation_id uuid NOT NULL REFERENCES public.prescription_repeat_authorisations(id) ON DELETE RESTRICT,
  prescription_id uuid NOT NULL REFERENCES public.prescriptions(id) ON DELETE RESTRICT,
  -- k of n at creation: supplied instances so far + 1. Informative; RP-4 counts hand-overs, not this.
  ordinal integer NOT NULL CHECK (ordinal >= 1),
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pri_line ON public.pharmacy_repeat_instances (prescription_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.pharmacy_repeat_instance_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id uuid NOT NULL REFERENCES public.pharmacy_repeat_instances(id) ON DELETE RESTRICT,
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  kind text NOT NULL CHECK (kind IN ('accepted','prepared','routed','route_returned','supplied','released','closed',
    'reopened')),
  reason_code text CHECK (reason_code IS NULL OR char_length(reason_code) BETWEEN 2 AND 60),
  reason_note text CHECK (reason_note IS NULL OR char_length(reason_note) <= 1000),
  supply_id uuid REFERENCES public.pharmacy_supplies(id) ON DELETE RESTRICT,
  actor_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  actor_cadre text,
  at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT prie_supplied CHECK (kind <> 'supplied' OR supply_id IS NOT NULL),
  CONSTRAINT prie_reason CHECK (kind NOT IN ('released','closed','reopened') OR reason_code IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS prie_instance ON public.pharmacy_repeat_instance_events (instance_id, at);

-- RI-1: one open instance per line. An instance is finished once supplied, released or closed, and not reopened
-- after that.
CREATE OR REPLACE FUNCTION private.repeat_instance_open(p_instance uuid) RETURNS boolean
LANGUAGE sql STABLE SET search_path = public, pg_temp AS $$
  SELECT coalesce((SELECT e.kind NOT IN ('supplied','released','closed')
                     FROM public.pharmacy_repeat_instance_events e
                    WHERE e.instance_id = p_instance AND e.kind IN ('supplied','released','closed','reopened')
                    ORDER BY e.at DESC, e.id DESC LIMIT 1), true);
$$;
CREATE OR REPLACE FUNCTION private.repeat_instance_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE _a public.prescription_repeat_authorisations;
BEGIN
  SELECT * INTO _a FROM public.prescription_repeat_authorisations WHERE id = NEW.authorisation_id FOR UPDATE;
  IF _a.prescription_id <> NEW.prescription_id OR _a.hospital_id <> NEW.hospital_id
     OR _a.patient_user_id <> NEW.patient_user_id THEN
    RAISE EXCEPTION 'pharmacy: the instance does not match its authorisation';
  END IF;
  IF EXISTS (SELECT 1 FROM public.pharmacy_repeat_instances i
              WHERE i.prescription_id = NEW.prescription_id AND private.repeat_instance_open(i.id)) THEN
    RAISE EXCEPTION 'pharmacy: this line already has an open repeat (RI-1)' USING ERRCODE = 'P0001', HINT = 'open_instance';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS pri_guard ON public.pharmacy_repeat_instances;
CREATE TRIGGER pri_guard BEFORE INSERT ON public.pharmacy_repeat_instances
  FOR EACH ROW EXECUTE FUNCTION private.repeat_instance_guard();

-- ─── 3. Named collectors (D-PH4-26) ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.patient_collectors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  name text NOT NULL CHECK (char_length(name) BETWEEN 2 AND 120),
  relationship text NOT NULL CHECK (char_length(relationship) BETWEEN 2 AND 80),
  -- A proxy may also give routing consent for the patient (RT-2); a plain collector may only collect.
  is_proxy boolean NOT NULL DEFAULT false,
  saved_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  saved_at timestamptz NOT NULL DEFAULT now(),
  removed_at timestamptz,
  removed_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  CONSTRAINT pc_removed CHECK ((removed_at IS NULL) = (removed_by IS NULL))
);
CREATE INDEX IF NOT EXISTS pc_patient ON public.patient_collectors (patient_user_id) WHERE removed_at IS NULL;
CREATE OR REPLACE FUNCTION private.patient_collector_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'pharmacy: a collector is removed, never deleted'; END IF;
  IF OLD.removed_at IS NOT NULL
     OR (to_jsonb(NEW) - 'removed_at' - 'removed_by') <> (to_jsonb(OLD) - 'removed_at' - 'removed_by') THEN
    RAISE EXCEPTION 'pharmacy: a collector only changes by being removed';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS pc_guard ON public.patient_collectors;
CREATE TRIGGER pc_guard BEFORE UPDATE OR DELETE ON public.patient_collectors
  FOR EACH ROW EXECUTE FUNCTION private.patient_collector_guard();

-- ─── 4. Renewal requests (RN-1 to RN-4) ───────────────────────────────────
CREATE TABLE IF NOT EXISTS public.prescription_renewal_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  patient_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  prescription_id uuid NOT NULL REFERENCES public.prescriptions(id) ON DELETE RESTRICT,
  reason text NOT NULL CHECK (reason IN ('no_authorisation','none_left','expired','stopped','blocked','too_early',
    'asked_by_pharmacy')),
  blocked_reason text CHECK (blocked_reason IS NULL OR blocked_reason IN ('stewardship_review','suspected_reaction')),
  note text CHECK (note IS NULL OR char_length(note) <= 500),
  asked_by text NOT NULL CHECK (asked_by IN ('patient','pharmacy')),
  asked_by_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  asked_at timestamptz NOT NULL DEFAULT now(),
  client_key text UNIQUE CHECK (client_key IS NULL OR char_length(client_key) BETWEEN 8 AND 120),
  CONSTRAINT prr_blocked CHECK ((reason = 'blocked') = (blocked_reason IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS prr_hospital ON public.prescription_renewal_requests (hospital_id, asked_at DESC);
CREATE INDEX IF NOT EXISTS prr_patient ON public.prescription_renewal_requests (patient_user_id);

CREATE TABLE IF NOT EXISTS public.prescription_renewal_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  renewal_id uuid NOT NULL REFERENCES public.prescription_renewal_requests(id) ON DELETE RESTRICT,
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  kind text NOT NULL CHECK (kind IN ('renewed','visit_needed','declined','withdrawn')),
  new_prescription_id uuid REFERENCES public.prescriptions(id) ON DELETE RESTRICT,
  reason_code text CHECK (reason_code IS NULL OR char_length(reason_code) BETWEEN 2 AND 60),
  note text CHECK (note IS NULL OR char_length(note) <= 500),
  actor_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  actor_cadre text,
  at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pren_renewed CHECK ((kind = 'renewed') = (new_prescription_id IS NOT NULL)),
  CONSTRAINT pren_declined CHECK (kind <> 'declined' OR reason_code IS NOT NULL)
);
-- RN-2: the first answer wins; every kind is final.
CREATE UNIQUE INDEX IF NOT EXISTS pren_one_answer ON public.prescription_renewal_events (renewal_id);

-- ─── 5. Refill requests (RF-1) ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pharmacy_refill_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  patient_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  channel text NOT NULL CHECK (channel IN ('app','window','phone')),
  recorded_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  collector text NOT NULL CHECK (collector IN ('self','named')),
  collector_id uuid REFERENCES public.patient_collectors(id) ON DELETE RESTRICT,
  place_kind text NOT NULL CHECK (place_kind IN ('point','partner')),
  dispensing_point_id uuid REFERENCES public.pharmacy_dispensing_points(department_id) ON DELETE RESTRICT,
  partner_id uuid, -- FK added by 0231 (the network)
  note text CHECK (note IS NULL OR char_length(note) <= 500),
  requested_at timestamptz NOT NULL DEFAULT now(),
  client_key text UNIQUE CHECK (client_key IS NULL OR char_length(client_key) BETWEEN 8 AND 120),
  CONSTRAINT prq_recorded CHECK (channel = 'app' OR recorded_by IS NOT NULL),
  CONSTRAINT prq_collector CHECK ((collector = 'named') = (collector_id IS NOT NULL)),
  CONSTRAINT prq_place CHECK ((place_kind = 'point' AND dispensing_point_id IS NOT NULL AND partner_id IS NULL)
    OR (place_kind = 'partner' AND partner_id IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS prq_hospital ON public.pharmacy_refill_requests (hospital_id, requested_at DESC);
CREATE INDEX IF NOT EXISTS prq_patient ON public.pharmacy_refill_requests (patient_user_id);

CREATE TABLE IF NOT EXISTS public.pharmacy_refill_request_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.pharmacy_refill_requests(id) ON DELETE RESTRICT,
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  prescription_id uuid NOT NULL REFERENCES public.prescriptions(id) ON DELETE RESTRICT,
  -- repeatStatus at the moment of the request (RF-2).
  status_at_request text NOT NULL CHECK (status_at_request IN ('allowed','too_early','none_left','expired','stopped',
    'blocked','not_allowed')),
  instance_id uuid REFERENCES public.pharmacy_repeat_instances(id) ON DELETE RESTRICT,
  renewal_id uuid REFERENCES public.prescription_renewal_requests(id) ON DELETE RESTRICT,
  CONSTRAINT prl_one UNIQUE (request_id, prescription_id),
  CONSTRAINT prl_route CHECK (
    (status_at_request = 'allowed' AND instance_id IS NOT NULL AND renewal_id IS NULL)
    OR (status_at_request = 'too_early' AND renewal_id IS NULL)
    OR (status_at_request NOT IN ('allowed','too_early') AND renewal_id IS NOT NULL AND instance_id IS NULL))
);

CREATE TABLE IF NOT EXISTS public.pharmacy_refill_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.pharmacy_refill_requests(id) ON DELETE RESTRICT,
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  line_id uuid REFERENCES public.pharmacy_refill_request_lines(id) ON DELETE RESTRICT,
  kind text NOT NULL CHECK (kind IN ('to_prepare','needs_clinic','prepared','collected','not_collected','held_longer',
    'released','routed','closed')),
  held_until date,
  reason_code text CHECK (reason_code IS NULL OR char_length(reason_code) BETWEEN 2 AND 60),
  reason_note text CHECK (reason_note IS NULL OR char_length(reason_note) <= 1000),
  actor_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  actor_cadre text,
  at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pre_held CHECK (kind NOT IN ('prepared','held_longer') OR held_until IS NOT NULL),
  CONSTRAINT pre_reason CHECK (kind NOT IN ('released','held_longer','closed') OR reason_code IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS pre_request ON public.pharmacy_refill_events (request_id, at);

-- ─── 6. Prepared stock (SA-1, amending Phase 2 LC-1 and LC-3) ─────────────
ALTER TABLE public.pharmacy_locations DROP CONSTRAINT IF EXISTS pharmacy_locations_kind_check;
ALTER TABLE public.pharmacy_locations ADD CONSTRAINT pharmacy_locations_kind_check CHECK (kind IN (
  'store','dispensing_point','ward','cart','quarantine','prepared'));

ALTER TABLE public.pharmacy_stock_movements DROP CONSTRAINT IF EXISTS pharmacy_stock_movements_kind_check;
ALTER TABLE public.pharmacy_stock_movements ADD CONSTRAINT pharmacy_stock_movements_kind_check CHECK (kind IN (
  'received','supplied','reversed','adjusted','count_correction','transfer_out','transfer_in',
  'issued','received_from_issue','returned_out','returned_in','lent','borrowed','loan_returned_out',
  'loan_returned_in','ward_used','cart_used','quarantined_out','quarantined_in','written_off','returned_to_supplier',
  'set_aside_out','set_aside_in','released_out','released_in'));
ALTER TABLE public.pharmacy_stock_movements DROP CONSTRAINT IF EXISTS pharmacy_stock_movements_source_kind_check;
ALTER TABLE public.pharmacy_stock_movements ADD CONSTRAINT pharmacy_stock_movements_source_kind_check CHECK (source_kind IN (
  'delivery','supply','reversal','count','adjustment','transfer','found_on_shelf','downtime',
  'issue','return','loan','quarantine','write_off','supplier_return','opening','set_aside','release'));
ALTER TABLE public.pharmacy_stock_movements DROP CONSTRAINT IF EXISTS psm_sign;
ALTER TABLE public.pharmacy_stock_movements ADD CONSTRAINT psm_sign CHECK (
  (kind IN ('received','reversed','transfer_in','received_from_issue','returned_in','borrowed','loan_returned_in',
            'quarantined_in','set_aside_in','released_in') AND quantity > 0)
  OR (kind IN ('supplied','transfer_out','issued','returned_out','lent','loan_returned_out','ward_used','cart_used',
               'quarantined_out','written_off','returned_to_supplier','set_aside_out','released_out') AND quantity < 0)
  OR kind IN ('adjusted','count_correction'));
ALTER TABLE public.pharmacy_stock_movements DROP CONSTRAINT IF EXISTS psm_pairs;
ALTER TABLE public.pharmacy_stock_movements ADD CONSTRAINT psm_pairs CHECK (
  (kind IN ('issued','received_from_issue','returned_out','returned_in','quarantined_out','quarantined_in',
            'set_aside_out','set_aside_in','released_out','released_in'))
  = (pair_id IS NOT NULL));

-- LC-3 for `prepared`: in by set_aside_in; out by released_out, supplied or quarantined_out; nothing else. The
-- set-aside and release legs never touch any other kind of place.
CREATE OR REPLACE FUNCTION private.pharmacy_prepared_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE _kind text;
BEGIN
  SELECT kind INTO _kind FROM public.pharmacy_locations WHERE id = coalesce(NEW.location_id, NEW.dispensing_point_id);
  IF _kind = 'prepared' AND NEW.kind NOT IN ('set_aside_in','released_out','supplied','quarantined_out') THEN
    RAISE EXCEPTION 'pharmacy_stock: a prepared place takes only set-aside, release, supply and quarantine (SA-1)'
      USING ERRCODE = 'P0001', HINT = 'prepared_kind';
  END IF;
  IF NEW.kind IN ('set_aside_in','released_out') AND _kind IS DISTINCT FROM 'prepared' THEN
    RAISE EXCEPTION 'pharmacy_stock: % belongs to a prepared place (SA-1)', NEW.kind USING ERRCODE = 'P0001';
  END IF;
  IF NEW.kind IN ('set_aside_out','released_in') AND _kind IS DISTINCT FROM 'dispensing_point' THEN
    RAISE EXCEPTION 'pharmacy_stock: % belongs to a dispensing point (SA-1)', NEW.kind USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS psm_prepared_guard ON public.pharmacy_stock_movements;
CREATE TRIGGER psm_prepared_guard BEFORE INSERT ON public.pharmacy_stock_movements
  FOR EACH ROW EXECUTE FUNCTION private.pharmacy_prepared_guard();

-- ─── 7. Line outcomes (amending Phase 1 LO-4) ─────────────────────────────
ALTER TABLE public.pharmacy_line_events DROP CONSTRAINT IF EXISTS pharmacy_line_events_kind_check;
ALTER TABLE public.pharmacy_line_events ADD CONSTRAINT pharmacy_line_events_kind_check CHECK (kind IN (
  'accepted','accepted_overridden_stop','reviewed','decision_saved','decision_cleared','supplied_without_review',
  'owed','buying_outside','open_outcome_changed','supplied','part_supplied','declined','closed',
  'closed_not_collected','filled_elsewhere','replaced','cancelled_by_prescriber','returned','patient_reported',
  'accepted_interaction','routed','route_returned'));

-- ─── Grants, RLS, audit, append-only ──────────────────────────────────────
-- Writes go through server actions on the service path; no client writes anything (Section 7).
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['prescription_repeat_authorisations','prescription_repeat_events',
    'pharmacy_repeat_instances','pharmacy_repeat_instance_events','prescription_renewal_requests',
    'prescription_renewal_events','pharmacy_refill_requests','pharmacy_refill_request_lines',
    'pharmacy_refill_events','patient_collectors'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS audit_%1$s ON public.%1$I', t);
    EXECUTE format('CREATE TRIGGER audit_%1$s AFTER INSERT OR UPDATE OR DELETE ON public.%1$I
      FOR EACH ROW EXECUTE FUNCTION public.audit_log_changes()', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
    EXECUTE format('GRANT SELECT ON public.%I TO medsync_clinical_reader', t);
    IF t <> 'patient_collectors' THEN
      EXECUTE format('DROP TRIGGER IF EXISTS %1$s_append_only ON public.%1$I', t);
      EXECUTE format('CREATE TRIGGER %1$s_append_only BEFORE UPDATE OR DELETE ON public.%1$I
        FOR EACH ROW EXECUTE FUNCTION public.block_modify_append_only()', t);
      -- Hospital pharmacy staff read their hospital's rows.
      EXECUTE format('DROP POLICY IF EXISTS %1$s_pharmacy ON public.%1$I', t);
      EXECUTE format('CREATE POLICY %1$s_pharmacy ON public.%1$I FOR SELECT TO medsync_clinical_reader
        USING (hospital_id = (SELECT private.current_hospital_id()) AND (SELECT private.pharmacy_can(''pharmacy.view'')))', t);
    END IF;
  END LOOP;
END $$;

-- Prescribers read authorisations, stops and renewal requests at their hospital (the problem card, the renewals lane).
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['prescription_repeat_authorisations','prescription_repeat_events',
    'prescription_renewal_requests','prescription_renewal_events'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %1$s_prescriber ON public.%1$I', t);
    EXECUTE format('CREATE POLICY %1$s_prescriber ON public.%1$I FOR SELECT TO medsync_clinical_reader
      USING (hospital_id = (SELECT private.current_hospital_id()) AND (SELECT private.may_prescribe_here()))', t);
  END LOOP;
END $$;

-- The patient reads their own rows (the refill page). Event tables are read through their parent.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['prescription_repeat_authorisations','pharmacy_repeat_instances',
    'prescription_renewal_requests','pharmacy_refill_requests','patient_collectors'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %1$s_own ON public.%1$I', t);
    EXECUTE format('CREATE POLICY %1$s_own ON public.%1$I FOR SELECT TO medsync_clinical_reader
      USING (patient_user_id = (SELECT private.current_user_id()))', t);
  END LOOP;
END $$;
DROP POLICY IF EXISTS pharmacy_refill_request_lines_own ON public.pharmacy_refill_request_lines;
CREATE POLICY pharmacy_refill_request_lines_own ON public.pharmacy_refill_request_lines FOR SELECT
  TO medsync_clinical_reader USING (EXISTS (SELECT 1 FROM public.pharmacy_refill_requests r
    WHERE r.id = request_id AND r.patient_user_id = (SELECT private.current_user_id())));
DROP POLICY IF EXISTS pharmacy_refill_events_own ON public.pharmacy_refill_events;
CREATE POLICY pharmacy_refill_events_own ON public.pharmacy_refill_events FOR SELECT
  TO medsync_clinical_reader USING (EXISTS (SELECT 1 FROM public.pharmacy_refill_requests r
    WHERE r.id = request_id AND r.patient_user_id = (SELECT private.current_user_id())));
DROP POLICY IF EXISTS prescription_renewal_events_own ON public.prescription_renewal_events;
CREATE POLICY prescription_renewal_events_own ON public.prescription_renewal_events FOR SELECT
  TO medsync_clinical_reader USING (EXISTS (SELECT 1 FROM public.prescription_renewal_requests r
    WHERE r.id = renewal_id AND r.patient_user_id = (SELECT private.current_user_id())));
DROP POLICY IF EXISTS pharmacy_repeat_instance_events_own ON public.pharmacy_repeat_instance_events;
CREATE POLICY pharmacy_repeat_instance_events_own ON public.pharmacy_repeat_instance_events FOR SELECT
  TO medsync_clinical_reader USING (EXISTS (SELECT 1 FROM public.pharmacy_repeat_instances i
    WHERE i.id = instance_id AND i.patient_user_id = (SELECT private.current_user_id())));

-- Pharmacy staff read the named collectors of patients who asked for a refill at their hospital (the hand-over).
DROP POLICY IF EXISTS patient_collectors_pharmacy ON public.patient_collectors;
CREATE POLICY patient_collectors_pharmacy ON public.patient_collectors FOR SELECT TO medsync_clinical_reader
  USING ((SELECT private.pharmacy_can('pharmacy.view')) AND EXISTS (SELECT 1 FROM public.pharmacy_refill_requests r
    WHERE r.patient_user_id = patient_collectors.patient_user_id AND r.hospital_id = (SELECT private.current_hospital_id())));

REVOKE ALL ON FUNCTION private.repeat_instance_open(uuid) FROM PUBLIC;
