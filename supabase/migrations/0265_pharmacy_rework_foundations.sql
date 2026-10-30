-- 0265 — Pharmacy rework, P1 foundations (docs/pharmacy/rework/PRD.md §5 S1–S4, S10; TECH-SPEC §2.1).
--
-- GATED: owner-applied (`npm run db:migrate`), after 0264.
--
--   1. pharmacy_products.controlled_class: the medicine's controlled class, kept by the app from the signed list, so the
--      ledger guard can tell a controlled batch without reading TypeScript. The guard also reads the signed
--      `controlled_classes` set, so a product the app has not synced yet is still caught.
--   2. The ledger gains `reverses_id` (one reversal per movement, mirroring it exactly), `paper_witness_name` (downtime
--      only), `idempotency_key` and a generated `late` (entered more than 30 minutes after it happened).
--   3. pharmacy_attestation_uses: a witness approval covers one action (one transaction) and lasts 10 minutes (S3).
--   4. pharmacy_duty_roster: who is on duty where, in which role and shift. A witness must be on duty at the place (S10).
--      A hospital with no roster yet is not blocked; Going live lists the roster as missing.
--   5. pharmacy_witness_requests: the actor asks a named person; the witness approves on their own device.
--   6. pharmacy_cd_prescribers: who may prescribe controlled medicines, for the dose record's drop-down.
--   7. The movement guard is rewritten: S2 (no negative, expired, recalled or quarantined stock out; downtime is
--      allowed but the batch needs a count before its next live movement out), S3 (a controlled movement out of any
--      place needs an unused, 10-minute witness approval from another person on duty) and the reversal rule.
--   8. pharmacy_controlled_entries gains `location_id`, so wards and carts have registers (S4).
--
-- ADDITIVE and re-runnable. No client grants.
-- Reverse: restore private.pharmacy_movement_guard and private.pharmacy_controlled_witness_guard from 0180 and 0127,
--   then DROP the tables and columns named above.

-- ─── 1. Controlled marker ────────────────────────────────────────────────
ALTER TABLE public.pharmacy_products
  ADD COLUMN IF NOT EXISTS controlled_class text
    CHECK (controlled_class IS NULL OR char_length(controlled_class) BETWEEN 1 AND 80);

CREATE OR REPLACE FUNCTION private.pharmacy_batch_controlled(p_batch uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.pharmacy_batches b JOIN public.pharmacy_products p ON p.id = b.product_id
     WHERE b.id = p_batch
       AND (p.controlled_class IS NOT NULL
            OR EXISTS (SELECT 1 FROM public.pharmacy_signed_sets s
                        WHERE s.hospital_id = p.hospital_id AND s.kind = 'controlled_classes' AND s.status = 'signed'
                          AND coalesce(s.content ->> p.medicine_id, 'not_controlled') <> 'not_controlled')));
$$;

-- ─── 2. Ledger columns ───────────────────────────────────────────────────
ALTER TABLE public.pharmacy_stock_movements
  ADD COLUMN IF NOT EXISTS reverses_id uuid REFERENCES public.pharmacy_stock_movements(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS paper_witness_name text
    CHECK (paper_witness_name IS NULL OR char_length(paper_witness_name) BETWEEN 2 AND 120),
  ADD COLUMN IF NOT EXISTS idempotency_key text
    CHECK (idempotency_key IS NULL OR char_length(idempotency_key) BETWEEN 8 AND 160),
  ADD COLUMN IF NOT EXISTS late boolean GENERATED ALWAYS AS (recorded_at - effective_at > interval '30 minutes') STORED;
CREATE UNIQUE INDEX IF NOT EXISTS psm_one_reversal ON public.pharmacy_stock_movements (reverses_id)
  WHERE reverses_id IS NOT NULL;
-- One action may write several lines (batches); the key is per action and line, so a replay writes nothing new.
CREATE UNIQUE INDEX IF NOT EXISTS psm_idempotency ON public.pharmacy_stock_movements (hospital_id, idempotency_key, batch_id)
  WHERE idempotency_key IS NOT NULL;
ALTER TABLE public.pharmacy_stock_movements DROP CONSTRAINT IF EXISTS psm_paper_witness;
ALTER TABLE public.pharmacy_stock_movements ADD CONSTRAINT psm_paper_witness
  CHECK (paper_witness_name IS NULL OR downtime);

-- ─── 3. One approval, one action ─────────────────────────────────────────
-- One row per transaction that used the approval. The only second transaction allowed is the controlled hand-over
-- that follows its own witnessed count ("witness first, count, then supply"): the count and the supply are one act.
CREATE TABLE IF NOT EXISTS public.pharmacy_attestation_uses (
  attestation_id uuid NOT NULL REFERENCES public.pharmacy_attestations(id) ON DELETE RESTRICT,
  xact bigint NOT NULL,
  used_at timestamptz NOT NULL DEFAULT now(),
  used_for text NOT NULL CHECK (char_length(used_for) BETWEEN 2 AND 80),
  PRIMARY KEY (attestation_id, xact)
);
DROP TRIGGER IF EXISTS pharmacy_attestation_uses_append_only ON public.pharmacy_attestation_uses;
CREATE TRIGGER pharmacy_attestation_uses_append_only BEFORE UPDATE OR DELETE ON public.pharmacy_attestation_uses
  FOR EACH ROW EXECUTE FUNCTION public.block_modify_append_only();

-- ─── 4. Duty roster ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pharmacy_duty_roster (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  -- NULL: the whole pharmacy (every pharmacy place).
  location_id uuid REFERENCES public.pharmacy_locations(id) ON DELETE RESTRICT,
  role text NOT NULL CHECK (role IN ('pharmacist','technician','store_keeper','in_charge','second_nurse',
    'nurse_in_charge','doctor_on_duty','epi_nurse')),
  shift text NOT NULL CHECK (shift IN ('day','night','call')),
  date_from date NOT NULL,
  date_to date NOT NULL,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  -- A roster line is ended by a new line, never edited away.
  ended_at timestamptz,
  ended_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  CONSTRAINT pdr_dates CHECK (date_to >= date_from),
  CONSTRAINT pdr_end CHECK ((ended_at IS NULL) = (ended_by IS NULL))
);
CREATE INDEX IF NOT EXISTS pdr_who ON public.pharmacy_duty_roster (hospital_id, user_id, date_from, date_to);

CREATE OR REPLACE FUNCTION private.pharmacy_roster_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'pharmacy_duty_roster: lines are ended, never deleted'; END IF;
  IF OLD.ended_at IS NOT NULL OR NEW.ended_at IS NULL
     OR (to_jsonb(NEW) - 'ended_at' - 'ended_by') <> (to_jsonb(OLD) - 'ended_at' - 'ended_by') THEN
    RAISE EXCEPTION 'pharmacy_duty_roster: only ending a line changes it';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS pdr_guard ON public.pharmacy_duty_roster;
CREATE TRIGGER pdr_guard BEFORE UPDATE OR DELETE ON public.pharmacy_duty_roster
  FOR EACH ROW EXECUTE FUNCTION private.pharmacy_roster_guard();

-- Day 08:00–17:00, night 17:00–08:00 (a night line on date d runs into d+1), call 24 h. Africa/Kampala time.
CREATE OR REPLACE FUNCTION private.pharmacy_on_duty(p_hospital uuid, p_user uuid, p_place uuid, p_at timestamptz)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  WITH t AS (SELECT (p_at AT TIME ZONE 'Africa/Kampala') AS ts)
  SELECT NOT EXISTS (SELECT 1 FROM public.pharmacy_duty_roster r WHERE r.hospital_id = p_hospital AND r.ended_at IS NULL)
      OR EXISTS (
        SELECT 1 FROM public.pharmacy_duty_roster r, t
         WHERE r.hospital_id = p_hospital AND r.user_id = p_user AND r.ended_at IS NULL
           AND (r.location_id IS NULL OR r.location_id = p_place)
           AND (
             (r.shift = 'call' AND t.ts::date BETWEEN r.date_from AND r.date_to)
             OR (r.shift = 'day' AND t.ts::date BETWEEN r.date_from AND r.date_to
                 AND t.ts::time >= '08:00' AND t.ts::time < '17:00')
             OR (r.shift = 'night' AND (
                   (t.ts::date BETWEEN r.date_from AND r.date_to AND t.ts::time >= '17:00')
                   OR ((t.ts::date - 1) BETWEEN r.date_from AND r.date_to AND t.ts::time < '08:00')))));
$$;

-- ─── 5. Witness requests (approved on the witness's own device) ──────────
CREATE TABLE IF NOT EXISTS public.pharmacy_witness_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  actor_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  witness_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  location_id uuid REFERENCES public.pharmacy_locations(id) ON DELETE RESTRICT,
  purpose text NOT NULL CHECK (char_length(purpose) BETWEEN 2 AND 80),
  summary text NOT NULL CHECK (char_length(summary) BETWEEN 2 AND 300),
  status text NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting','approved','declined','withdrawn')),
  attestation_id uuid REFERENCES public.pharmacy_attestations(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz,
  CONSTRAINT pwr_not_self CHECK (witness_user_id <> actor_user_id),
  CONSTRAINT pwr_approved CHECK ((status = 'approved') = (attestation_id IS NOT NULL)),
  CONSTRAINT pwr_decided CHECK ((status = 'waiting') = (decided_at IS NULL))
);
CREATE INDEX IF NOT EXISTS pwr_witness_waiting ON public.pharmacy_witness_requests (witness_user_id, created_at DESC)
  WHERE status = 'waiting';

CREATE OR REPLACE FUNCTION private.pharmacy_witness_request_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'pharmacy_witness_requests: never deleted'; END IF;
  IF OLD.status <> 'waiting'
     OR (to_jsonb(NEW) - 'status' - 'attestation_id' - 'decided_at') <> (to_jsonb(OLD) - 'status' - 'attestation_id' - 'decided_at') THEN
    RAISE EXCEPTION 'pharmacy_witness_requests: a request is decided once';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS pwr_guard ON public.pharmacy_witness_requests;
CREATE TRIGGER pwr_guard BEFORE UPDATE OR DELETE ON public.pharmacy_witness_requests
  FOR EACH ROW EXECUTE FUNCTION private.pharmacy_witness_request_guard();

-- ─── 6. Controlled-drug prescribers ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pharmacy_cd_prescribers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  department text CHECK (department IS NULL OR char_length(department) BETWEEN 2 AND 80),
  cd_allowed boolean NOT NULL DEFAULT true,
  -- Empty: every controlled medicine. Otherwise the medicine ids this prescriber may write.
  only_medicines text[] NOT NULL DEFAULT '{}',
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pcp_hospital ON public.pharmacy_cd_prescribers (hospital_id, user_id, created_at DESC);
DROP TRIGGER IF EXISTS pcp_append_only ON public.pharmacy_cd_prescribers;
CREATE TRIGGER pcp_append_only BEFORE UPDATE OR DELETE ON public.pharmacy_cd_prescribers
  FOR EACH ROW EXECUTE FUNCTION public.block_modify_append_only();

-- ─── 7. The witness check and the movement guard ─────────────────────────
-- Raises unless the approval stands for this actor, at this place, now; then marks it used by this transaction.
CREATE OR REPLACE FUNCTION private.pharmacy_use_attestation(p_attestation uuid, p_hospital uuid, p_actor uuid,
  p_place uuid, p_for text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  _a public.pharmacy_attestations;
  _mine boolean;
  _others text[];
BEGIN
  SELECT * INTO _a FROM public.pharmacy_attestations WHERE id = p_attestation;
  IF NOT FOUND OR _a.purpose <> 'witness' OR _a.outcome <> 'passed' OR _a.hospital_id <> p_hospital
     OR _a.actor_user_id <> p_actor OR _a.attester_user_id = p_actor THEN
    RAISE EXCEPTION 'pharmacy_witness: the witness approval does not stand for this person'
      USING ERRCODE = 'P0001', HINT = 'witness_invalid';
  END IF;
  IF _a.attested_at < now() - interval '10 minutes' THEN
    RAISE EXCEPTION 'pharmacy_witness: the witness approval is more than 10 minutes old'
      USING ERRCODE = 'P0001', HINT = 'witness_expired';
  END IF;
  IF NOT private.pharmacy_on_duty(p_hospital, _a.attester_user_id, p_place, now()) THEN
    RAISE EXCEPTION 'pharmacy_witness: the witness is not on duty here now'
      USING ERRCODE = 'P0001', HINT = 'witness_off_duty';
  END IF;
  SELECT bool_or(xact = txid_current()), array_agg(used_for) FILTER (WHERE xact <> txid_current())
    INTO _mine, _others FROM public.pharmacy_attestation_uses WHERE attestation_id = p_attestation;
  IF coalesce(array_length(_others, 1), 0) > 0
     AND NOT (_others <@ ARRAY['controlled:count','movement:count_correction']
              AND p_for IN ('controlled:supply','movement:supplied')) THEN
    RAISE EXCEPTION 'pharmacy_witness: this witness approval was already used'
      USING ERRCODE = 'P0001', HINT = 'witness_used';
  END IF;
  IF coalesce(_mine, false) THEN RETURN; END IF;
  INSERT INTO public.pharmacy_attestation_uses (attestation_id, xact, used_for) VALUES (p_attestation, txid_current(), p_for);
END;
$$;

CREATE OR REPLACE FUNCTION private.pharmacy_batch_needs_count(p_batch uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.pharmacy_stock_movements d
     WHERE d.batch_id = p_batch AND d.downtime
       AND NOT EXISTS (SELECT 1 FROM public.pharmacy_count_lines cl JOIN public.pharmacy_counts c ON c.id = cl.count_id
                        WHERE cl.batch_id = p_batch AND c.counted_at > d.recorded_at));
$$;

ALTER TABLE public.pharmacy_stock_movements DROP CONSTRAINT IF EXISTS psm_reversal_kind;
ALTER TABLE public.pharmacy_stock_movements ADD CONSTRAINT psm_reversal_kind
  CHECK (reverses_id IS NULL OR kind IN ('reversed','adjusted'));

CREATE OR REPLACE FUNCTION private.pharmacy_movement_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE
  _b public.pharmacy_batches;
  _o public.pharmacy_stock_movements;
  _balance bigint;
  _place uuid := coalesce(NEW.location_id, NEW.dispensing_point_id);
  _kind text;
  _controlled boolean;
BEGIN
  SELECT * INTO _b FROM public.pharmacy_batches WHERE id = NEW.batch_id FOR UPDATE;
  IF coalesce(_b.location_id, _b.dispensing_point_id) <> _place OR _b.hospital_id <> NEW.hospital_id THEN
    RAISE EXCEPTION 'pharmacy_stock: batch % is not at this location', NEW.batch_id;
  END IF;
  SELECT kind INTO _kind FROM public.pharmacy_locations WHERE id = _place;

  -- The reversal rule: the exact mirror of one movement, once (psm_one_reversal).
  IF NEW.reverses_id IS NOT NULL THEN
    SELECT * INTO _o FROM public.pharmacy_stock_movements WHERE id = NEW.reverses_id;
    IF NOT FOUND OR _o.batch_id <> NEW.batch_id OR _o.quantity <> -NEW.quantity OR _o.reverses_id IS NOT NULL THEN
      RAISE EXCEPTION 'pharmacy_stock: a reversal mirrors one movement exactly'
        USING ERRCODE = 'P0001', HINT = 'reversal_mismatch';
    END IF;
  END IF;

  -- S3: a controlled medicine leaving any place (or a controlled reversal) needs one fresh witness approval.
  _controlled := private.pharmacy_batch_controlled(NEW.batch_id);
  IF _controlled AND (NEW.quantity < 0 OR NEW.reverses_id IS NOT NULL) THEN
    IF NEW.witness_attestation_id IS NOT NULL THEN
      PERFORM private.pharmacy_use_attestation(NEW.witness_attestation_id, NEW.hospital_id, NEW.actor_user_id,
        _place, 'movement:' || NEW.kind);
    ELSIF NOT (NEW.downtime AND NEW.paper_witness_name IS NOT NULL) THEN
      RAISE EXCEPTION 'pharmacy_stock: a controlled medicine leaves only with a witness'
        USING ERRCODE = 'P0001', HINT = 'witness_needed';
    END IF;
  END IF;

  -- S2, H6: a downtime back-entry is allowed; the batch then needs a count before its next live movement out.
  IF NEW.downtime THEN RETURN NEW; END IF;
  IF NEW.quantity < 0 AND NEW.kind NOT IN ('adjusted','count_correction','quarantined_out')
     AND private.pharmacy_batch_needs_count(NEW.batch_id) THEN
    RAISE EXCEPTION 'pharmacy_stock: batch % needs a count after back-entry', _b.batch_number
      USING ERRCODE = 'P0001', HINT = 'needs_count';
  END IF;
  -- SL-14: blocked batches leave only into quarantine, back to the supplier, or by write-off from quarantine.
  IF NEW.quantity < 0 AND NEW.kind NOT IN ('adjusted','count_correction','ward_used','cart_used',
       'quarantined_out','written_off','returned_to_supplier') THEN
    IF private.pharmacy_expires_on(_b.expiry, _b.expiry_month_only) < private.pharmacy_local_date() THEN
      RAISE EXCEPTION 'pharmacy_stock: batch % expired on %', _b.batch_number,
        private.pharmacy_expires_on(_b.expiry, _b.expiry_month_only) USING ERRCODE = 'P0001', HINT = 'expired';
    END IF;
    IF _kind = 'quarantine' THEN
      RAISE EXCEPTION 'pharmacy_stock: batch % is in quarantine', _b.batch_number
        USING ERRCODE = 'P0001', HINT = 'quarantined';
    END IF;
    IF private.pharmacy_batch_recalled(_b.id) THEN
      RAISE EXCEPTION 'pharmacy_stock: batch % is recalled', _b.batch_number
        USING ERRCODE = 'P0001', HINT = 'recalled';
    END IF;
  END IF;
  IF NEW.kind IN ('written_off','returned_to_supplier') AND _kind IS DISTINCT FROM 'quarantine' THEN
    RAISE EXCEPTION 'pharmacy_stock: write-off and return to supplier are from quarantine only'
      USING ERRCODE = 'P0001', HINT = 'not_quarantine';
  END IF;
  SELECT coalesce(sum(quantity), 0) INTO _balance FROM public.pharmacy_stock_movements WHERE batch_id = NEW.batch_id;
  IF _balance + NEW.quantity < 0 THEN
    RAISE EXCEPTION 'pharmacy_stock: batch % holds %', _b.batch_number, _balance
      USING ERRCODE = 'P0001', HINT = 'below_zero';
  END IF;
  RETURN NEW;
END;
$$;

-- ─── 8. Controlled entries: a register per medicine per place ────────────
ALTER TABLE public.pharmacy_controlled_entries
  ALTER COLUMN dispensing_point_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS location_id uuid REFERENCES public.pharmacy_locations(id) ON DELETE RESTRICT;
ALTER TABLE public.pharmacy_controlled_entries DROP CONSTRAINT IF EXISTS pce_place;
ALTER TABLE public.pharmacy_controlled_entries ADD CONSTRAINT pce_place
  CHECK (coalesce(location_id, dispensing_point_id) IS NOT NULL);
CREATE INDEX IF NOT EXISTS pce_location_medicine ON public.pharmacy_controlled_entries (location_id, medicine_id, recorded_at)
  WHERE location_id IS NOT NULL;

-- The entry's witness: same rules as the movement it sits beside, and the same single use.
CREATE OR REPLACE FUNCTION private.pharmacy_controlled_witness_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.witness_attestation_id IS NULL THEN RETURN NEW; END IF;
  PERFORM private.pharmacy_use_attestation(NEW.witness_attestation_id, NEW.hospital_id, NEW.actor_user_id,
    coalesce(NEW.location_id, NEW.dispensing_point_id), 'controlled:' || NEW.kind);
  RETURN NEW;
END;
$$;

-- ─── 9. Demo data stays out of the live database (S14, C3) ──────────────
-- Demo removal disabled triggers on tables every hospital shares. Removal is now a dry run only: it reports what a
-- demo holds and never deletes. Demos run in a separate project; demo hospitals stay soft-marked (lab_demo_hospitals).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
              WHERE n.nspname = 'public' AND p.proname = 'pharmacy_demo_remove')
     AND NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
              WHERE n.nspname = 'private' AND p.proname = 'pharmacy_demo_remove_frozen') THEN
    ALTER FUNCTION public.pharmacy_demo_remove(uuid, uuid, boolean) SET SCHEMA private;
    ALTER FUNCTION private.pharmacy_demo_remove(uuid, uuid, boolean) RENAME TO pharmacy_demo_remove_frozen;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.pharmacy_demo_remove(p_hospital uuid, p_actor uuid, p_dry_run boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT p_dry_run THEN
    RAISE EXCEPTION 'pharmacy_demo_remove: removal is off; demos run in a separate project'
      USING ERRCODE = 'P0001', HINT = 'demo_frozen';
  END IF;
  RETURN private.pharmacy_demo_remove_frozen(p_hospital, p_actor, true);
END;
$$;

-- ─── 10. A witness approves on their own device ─────────────────────────
-- The witness, already signed in with their second factor on their own phone or computer, approves the request
-- there: method 'session'. Nobody types a password on the actor's screen.
ALTER TABLE public.pharmacy_attestations DROP CONSTRAINT IF EXISTS pharmacy_attestations_method_check;
ALTER TABLE public.pharmacy_attestations ADD CONSTRAINT pharmacy_attestations_method_check
  CHECK (method IN ('password+totp','session'));

-- ─── 11. RLS on the new tables (the 0180 pattern): server writes only; readers see their hospital ────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['pharmacy_attestation_uses','pharmacy_duty_roster','pharmacy_witness_requests',
    'pharmacy_cd_prescribers'] LOOP
    IF t <> 'pharmacy_attestation_uses' THEN
      EXECUTE format('DROP TRIGGER IF EXISTS audit_%1$s ON public.%1$I', t);
      EXECUTE format('CREATE TRIGGER audit_%1$s AFTER INSERT OR UPDATE OR DELETE ON public.%1$I
        FOR EACH ROW EXECUTE FUNCTION public.audit_log_changes()', t);
    END IF;
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
  END LOOP;
  -- attestation_uses has no hospital column; it is read through its attestation only.
  FOREACH t IN ARRAY ARRAY['pharmacy_duty_roster','pharmacy_witness_requests','pharmacy_cd_prescribers'] LOOP
    EXECUTE format('GRANT SELECT ON public.%I TO medsync_clinical_reader', t);
    EXECUTE format('DROP POLICY IF EXISTS %1$s_select ON public.%1$I', t);
    EXECUTE format('CREATE POLICY %1$s_select ON public.%1$I FOR SELECT TO medsync_clinical_reader
      USING (hospital_id = (SELECT private.current_hospital_id()) AND (SELECT private.pharmacy_can(''pharmacy.view'')))', t);
  END LOOP;
END $$;
