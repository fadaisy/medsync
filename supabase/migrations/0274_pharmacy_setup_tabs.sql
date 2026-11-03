-- 0274 — Set-up › Going live, Places, Rules and Messages (rework kit 5, SETUP-TABS.md §E).
--
-- GATED: owner-applied (`npm run db:migrate`), after 0273.
--
--   1. Going live: pharmacy_golive_items (the record and mark answers, owner and due date of any item; an automatic
--      item can never be ticked by hand), pharmacy_golive_state (changed only by an event), pharmacy_golive_events
--      (append-only; target date, practice and paper retirement only by the in-charge), pharmacy_golive_signatures
--      (the in-charge and the medical superintendent; the second signature switches the hospital live, refused while
--      anything blocks). private.pharmacy_golive_auto() is the one query behind the automatic items.
--   2. Practice: pharmacy_practice_sessions; the practice data lives in the pharmacy_practice schema and is deleted
--      when the session ends. Who trained is kept in pharmacy_practice_trained (a training record, not practice data).
--   3. Places: pharmacy_locations gains clinic and theatre, opening hours, supplied from, suppliers, handover slots,
--      the device it is worked from, and closing (refused while stock or an open handover is there). A store is never
--      supplied from itself or from another place. pharmacy_devices: when each place's device was last seen.
--   4. Cold chain: a fridge may be unplaced (one place at most is its column); a sensor id; a typed reading outside
--      2–8 °C carries a note; an excursion opens by trigger (a typed reading at once, sensor readings after the
--      signed number of minutes) and closes on the next reading in range.
--   5. pharmacy_suppliers: cycle, lead time, budget and contact (phone encrypted).
--   6. Rules: proposals gain a kind (change, new), the new rule's name and applies-to, and rejection with a note;
--      pharmacy_rule_group_signatures signs a whole group (in-charge and a second, different person).
--   7. Messages: the provider (the API key encrypted, never readable by the client role), the monthly budget,
--      templates with timing and a Luganda check, the outbox with parts, cost, queued and delivered, and opt-outs with
--      a reason. The database refuses to send to an opted-out number, in quiet hours, past the weekly cap per
--      patient, or past the monthly budget cap.
--
-- ADDITIVE and re-runnable. No client grants: writes come from the server connection.
-- Reverse: drop the new tables, schema and functions; restore the 0273 pharmacy_rule_sign and the 0268 SMS checks.

-- ─── 1. Going live ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pharmacy_golive_items (
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  key text NOT NULL CHECK (key IN ('q1','q24','wit','mfa','dev','demo','places','levels','prices','opening','sensor',
    'supp','roster','lic','presc','train','words','rules','lug','hmis')),
  status text NOT NULL DEFAULT 'todo' CHECK (status IN ('todo','done')),
  answer text CHECK (answer IS NULL OR char_length(answer) BETWEEN 1 AND 600),
  answer_choice text CHECK (answer_choice IS NULL OR char_length(answer_choice) BETWEEN 1 AND 160),
  decided_by text CHECK (decided_by IS NULL OR char_length(decided_by) BETWEEN 1 AND 120),
  done_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  done_at timestamptz,
  owner_role text CHECK (owner_role IS NULL OR char_length(owner_role) BETWEEN 2 AND 60),
  due_on date,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (hospital_id, key),
  -- §I.2: an automatic item is computed from live data and never ticked by hand.
  CONSTRAINT pgi_auto CHECK (key NOT IN ('mfa','places','levels','prices','opening','sensor','roster','lic','train','rules')
    OR (status = 'todo' AND answer IS NULL)),
  CONSTRAINT pgi_done CHECK ((status = 'done') = (done_at IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS public.pharmacy_golive_state (
  hospital_id uuid PRIMARY KEY REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  target_date date,
  phase text NOT NULL DEFAULT 'setup' CHECK (phase IN ('setup','practice','parallel','retired')),
  live_at timestamptz,
  retired_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pgs_live CHECK ((phase IN ('parallel','retired')) = (live_at IS NOT NULL)),
  CONSTRAINT pgs_retired CHECK ((phase = 'retired') = (retired_at IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS public.pharmacy_golive_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  kind text NOT NULL CHECK (kind IN ('target','practice_start','practice_end','retire','sign','live','mark','unmark',
    'answer','owner','done')),
  item_key text,
  detail text CHECK (detail IS NULL OR char_length(detail) <= 400),
  by_user uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pge_latest ON public.pharmacy_golive_events (hospital_id, at DESC);

CREATE TABLE IF NOT EXISTS public.pharmacy_golive_signatures (
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  role text NOT NULL CHECK (role IN ('in_charge','ms')),
  signed_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  signed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (hospital_id, role)
);

-- ─── 2. Practice ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pharmacy_practice_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  started_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  ended_at timestamptz,
  CONSTRAINT pps_end CHECK ((ended_at IS NULL) = (ended_by IS NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS pps_one_open ON public.pharmacy_practice_sessions (hospital_id) WHERE ended_at IS NULL;

CREATE SCHEMA IF NOT EXISTS pharmacy_practice;
CREATE TABLE IF NOT EXISTS pharmacy_practice.dispenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  session_id uuid NOT NULL REFERENCES public.pharmacy_practice_sessions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sample text NOT NULL CHECK (char_length(sample) BETWEEN 2 AND 200),
  at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.pharmacy_practice_trained (
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (hospital_id, user_id)
);

-- A practice dispense needs an open session; it marks the person trained.
CREATE OR REPLACE FUNCTION private.pharmacy_practice_dispense() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.pharmacy_practice_sessions s
                  WHERE s.id = NEW.session_id AND s.hospital_id = NEW.hospital_id AND s.ended_at IS NULL) THEN
    RAISE EXCEPTION 'pharmacy_practice: no practice day is running' USING ERRCODE = 'check_violation';
  END IF;
  INSERT INTO public.pharmacy_practice_trained (hospital_id, user_id) VALUES (NEW.hospital_id, NEW.user_id)
    ON CONFLICT DO NOTHING;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS ppd_guard ON pharmacy_practice.dispenses;
CREATE TRIGGER ppd_guard BEFORE INSERT ON pharmacy_practice.dispenses
  FOR EACH ROW EXECUTE FUNCTION private.pharmacy_practice_dispense();

-- ─── 3. Places ───────────────────────────────────────────────────────────
ALTER TABLE public.pharmacy_locations DROP CONSTRAINT IF EXISTS pharmacy_locations_kind_check;
ALTER TABLE public.pharmacy_locations ADD CONSTRAINT pharmacy_locations_kind_check CHECK (kind IN (
  'store','dispensing_point','ward','cart','quarantine','prepared','clinic','theatre'));
ALTER TABLE public.pharmacy_locations
  ADD COLUMN IF NOT EXISTS hours text CHECK (hours IS NULL OR hours IN ('24h','day','weekdays')),
  ADD COLUMN IF NOT EXISTS supplied_from uuid REFERENCES public.pharmacy_locations(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS supplier_ids uuid[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS handover_slots text[] NOT NULL DEFAULT '{08:00,17:00}',
  ADD COLUMN IF NOT EXISTS device_label text CHECK (device_label IS NULL OR char_length(device_label) BETWEEN 2 AND 60),
  ADD COLUMN IF NOT EXISTS closed_at timestamptz,
  ADD COLUMN IF NOT EXISTS closed_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS closed_note text CHECK (closed_note IS NULL OR char_length(closed_note) <= 200);
DO $$ BEGIN
  ALTER TABLE public.pharmacy_locations ADD CONSTRAINT pl_slots
    CHECK (cardinality(handover_slots) <= 3 AND handover_slots <@ ARRAY['08:00','17:00','20:00']);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.pharmacy_locations ADD CONSTRAINT pl_closed CHECK ((closed_at IS NULL) = (closed_by IS NULL));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Lines with stock on hand at a place: a batch's balance is the sum of its movements.
CREATE OR REPLACE FUNCTION private.pharmacy_place_lines(p_hospital uuid, p_place uuid) RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT count(DISTINCT x.product_id)::int FROM (
    SELECT b.product_id FROM public.pharmacy_batches b
      JOIN public.pharmacy_stock_movements m ON m.batch_id = b.id
     WHERE b.hospital_id = p_hospital AND coalesce(b.location_id, b.dispensing_point_id) = p_place
     GROUP BY b.id, b.product_id HAVING sum(m.quantity) > 0) x;
$$;

CREATE OR REPLACE FUNCTION private.pharmacy_location_setup_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE n int;
BEGIN
  IF NEW.supplied_from IS NOT NULL THEN
    IF NEW.kind = 'store' OR NEW.supplied_from = NEW.id THEN
      RAISE EXCEPTION 'pharmacy_locations: a store cannot be supplied from itself' USING ERRCODE = 'check_violation',
        HINT = 'self_supply';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.pharmacy_locations s WHERE s.id = NEW.supplied_from
                    AND s.hospital_id = NEW.hospital_id AND s.kind = 'store' AND s.closed_at IS NULL) THEN
      RAISE EXCEPTION 'pharmacy_locations: supplied from an open store of this hospital' USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.closed_at IS NULL AND NEW.closed_at IS NOT NULL THEN
    n := private.pharmacy_place_lines(NEW.hospital_id, NEW.id);
    IF n > 0 THEN
      RAISE EXCEPTION 'pharmacy_locations: % lines are still here', n USING ERRCODE = 'check_violation',
        HINT = 'stock_here';
    END IF;
    IF EXISTS (SELECT 1 FROM public.pharmacy_shift_handovers h WHERE h.location_id = NEW.id AND h.accepted_at IS NULL) THEN
      RAISE EXCEPTION 'pharmacy_locations: a handover is open' USING ERRCODE = 'check_violation', HINT = 'handover_open';
    END IF;
    IF EXISTS (SELECT 1 FROM public.pharmacy_locations c WHERE c.supplied_from = NEW.id AND c.closed_at IS NULL) THEN
      RAISE EXCEPTION 'pharmacy_locations: places are still supplied from here' USING ERRCODE = 'check_violation',
        HINT = 'supplies_others';
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS pl_setup_guard ON public.pharmacy_locations;
CREATE TRIGGER pl_setup_guard BEFORE INSERT OR UPDATE ON public.pharmacy_locations
  FOR EACH ROW EXECUTE FUNCTION private.pharmacy_location_setup_guard();

CREATE TABLE IF NOT EXISTS public.pharmacy_devices (
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  location_id uuid NOT NULL REFERENCES public.pharmacy_locations(id) ON DELETE RESTRICT,
  last_seen_at timestamptz NOT NULL,
  PRIMARY KEY (location_id)
);

-- ─── 4. Cold chain ───────────────────────────────────────────────────────
ALTER TABLE public.pharmacy_fridges ALTER COLUMN location_id DROP NOT NULL;
ALTER TABLE public.pharmacy_fridges
  ADD COLUMN IF NOT EXISTS sensor_id text CHECK (sensor_id IS NULL OR sensor_id ~ '^[A-Z0-9-]{2,40}$');
CREATE UNIQUE INDEX IF NOT EXISTS pf_sensor_once ON public.pharmacy_fridges (hospital_id, sensor_id)
  WHERE sensor_id IS NOT NULL;

ALTER TABLE public.pharmacy_fridge_readings
  ADD COLUMN IF NOT EXISTS note text CHECK (note IS NULL OR char_length(note) BETWEEN 2 AND 300);
-- A typed reading is a person's; its check slot is set only when it falls within 90 minutes of 08:00 or 17:00.
ALTER TABLE public.pharmacy_fridge_readings DROP CONSTRAINT IF EXISTS pfr_source;
ALTER TABLE public.pharmacy_fridge_readings ADD CONSTRAINT pfr_source CHECK (
  (source = 'chart' AND recorded_by IS NOT NULL)
  OR (source = 'sensor' AND recorded_by IS NULL AND slot IS NULL AND freeze_indicator IS NULL));
DO $$ BEGIN
  ALTER TABLE public.pharmacy_fridge_readings ADD CONSTRAINT pfr_note
    CHECK (source <> 'chart' OR temp_c BETWEEN 2 AND 8 OR note IS NOT NULL);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.pharmacy_fridge_excursions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  fridge_id uuid NOT NULL REFERENCES public.pharmacy_fridges(id) ON DELETE RESTRICT,
  started_at timestamptz NOT NULL,
  ended_at timestamptz,
  peak_c numeric(4,1) NOT NULL,
  action_note text CHECK (action_note IS NULL OR char_length(action_note) BETWEEN 2 AND 300),
  checked_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT
);
CREATE UNIQUE INDEX IF NOT EXISTS pfe_one_open ON public.pharmacy_fridge_excursions (fridge_id) WHERE ended_at IS NULL;
CREATE INDEX IF NOT EXISTS pfe_fridge_time ON public.pharmacy_fridge_excursions (fridge_id, started_at DESC);

-- Outside 2–8 °C: a typed reading opens an excursion at once; sensor readings once they have been out for the signed
-- number of minutes (Rules › Stock and cold chain › Excursion). The next reading in range closes it.
CREATE OR REPLACE FUNCTION private.pharmacy_fridge_excursion() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE out_ boolean := NEW.temp_c < 2 OR NEW.temp_c > 8; run_start timestamptz; mins numeric;
BEGIN
  IF NOT out_ THEN
    UPDATE public.pharmacy_fridge_excursions SET ended_at = NEW.read_at WHERE fridge_id = NEW.fridge_id AND ended_at IS NULL;
    RETURN NULL;
  END IF;
  IF EXISTS (SELECT 1 FROM public.pharmacy_fridge_excursions WHERE fridge_id = NEW.fridge_id AND ended_at IS NULL) THEN
    UPDATE public.pharmacy_fridge_excursions
       SET peak_c = CASE WHEN abs(NEW.temp_c - 5) > abs(peak_c - 5) THEN NEW.temp_c ELSE peak_c END,
           action_note = coalesce(action_note, NEW.note), checked_by = coalesce(checked_by, NEW.recorded_by)
     WHERE fridge_id = NEW.fridge_id AND ended_at IS NULL;
    RETURN NULL;
  END IF;
  IF NEW.source = 'sensor' THEN
    SELECT min(r.read_at) INTO run_start FROM public.pharmacy_fridge_readings r
     WHERE r.fridge_id = NEW.fridge_id AND r.read_at <= NEW.read_at
       AND r.read_at > coalesce((SELECT max(i.read_at) FROM public.pharmacy_fridge_readings i
                                  WHERE i.fridge_id = NEW.fridge_id AND i.read_at <= NEW.read_at
                                    AND i.temp_c BETWEEN 2 AND 8), '-infinity');
    mins := private.pharmacy_rule_n(NEW.hospital_id, 'cold', 'excursion', 30);
    IF run_start IS NULL OR NEW.read_at - run_start < make_interval(mins => mins::int) THEN RETURN NULL; END IF;
  END IF;
  INSERT INTO public.pharmacy_fridge_excursions (hospital_id, fridge_id, started_at, peak_c, action_note, checked_by)
  VALUES (NEW.hospital_id, NEW.fridge_id, coalesce(run_start, NEW.read_at), NEW.temp_c, NEW.note, NEW.recorded_by);
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS pfr_excursion ON public.pharmacy_fridge_readings;
CREATE TRIGGER pfr_excursion AFTER INSERT ON public.pharmacy_fridge_readings
  FOR EACH ROW EXECUTE FUNCTION private.pharmacy_fridge_excursion();

-- ─── 5. Suppliers ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pharmacy_suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80),
  what text CHECK (what IS NULL OR char_length(what) <= 200),
  cycle_months integer NOT NULL DEFAULT 0 CHECK (cycle_months BETWEEN 0 AND 24),
  next_cycle_on date,
  lead_days integer NOT NULL DEFAULT 7 CHECK (lead_days BETWEEN 0 AND 365),
  budget_ugx bigint NOT NULL DEFAULT 0 CHECK (budget_ugx >= 0),
  used_ugx bigint NOT NULL DEFAULT 0 CHECK (used_ugx >= 0),
  budget_period text CHECK (budget_period IS NULL OR char_length(budget_period) <= 40),
  contact text CHECK (contact IS NULL OR char_length(contact) <= 120),
  phone_encrypted text,
  updated_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT psup_budget CHECK (budget_ugx = 0 OR used_ugx <= budget_ugx)
);
CREATE UNIQUE INDEX IF NOT EXISTS psup_name ON public.pharmacy_suppliers (hospital_id, lower(name));

-- ─── 6. Rules ────────────────────────────────────────────────────────────
ALTER TABLE public.pharmacy_rules
  ADD COLUMN IF NOT EXISTS name text CHECK (name IS NULL OR char_length(name) BETWEEN 2 AND 80),
  ADD COLUMN IF NOT EXISTS applies_to text CHECK (applies_to IS NULL OR char_length(applies_to) <= 120);
ALTER TABLE public.pharmacy_rule_proposals
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'change' CHECK (kind IN ('change','new')),
  ADD COLUMN IF NOT EXISTS name text CHECK (name IS NULL OR char_length(name) BETWEEN 2 AND 80),
  ADD COLUMN IF NOT EXISTS applies_to text CHECK (applies_to IS NULL OR char_length(applies_to) <= 120),
  ADD COLUMN IF NOT EXISTS reject_note text CHECK (reject_note IS NULL OR char_length(reject_note) BETWEEN 2 AND 300),
  ADD COLUMN IF NOT EXISTS rejected_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT;
ALTER TABLE public.pharmacy_rule_proposals DROP CONSTRAINT IF EXISTS pharmacy_rule_proposals_status_check;
ALTER TABLE public.pharmacy_rule_proposals ADD CONSTRAINT pharmacy_rule_proposals_status_check
  CHECK (status IN ('pending','applied','withdrawn','rejected'));
DO $$ BEGIN
  ALTER TABLE public.pharmacy_rule_proposals ADD CONSTRAINT prp_rejected
    CHECK ((status = 'rejected') = (reject_note IS NOT NULL AND rejected_by IS NOT NULL));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.pharmacy_rule_proposals ADD CONSTRAINT prp_new_named CHECK (kind <> 'new' OR name IS NOT NULL);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE OR REPLACE FUNCTION private.pharmacy_rule_proposal_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'pharmacy_rule_proposals: never deleted'; END IF;
  IF OLD.status <> 'pending' THEN RAISE EXCEPTION 'pharmacy_rule_proposals: a closed proposal never changes'; END IF;
  IF (to_jsonb(NEW) - ARRAY['status','closed_at','reject_note','rejected_by'])
     IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['status','closed_at','reject_note','rejected_by']) THEN
    RAISE EXCEPTION 'pharmacy_rule_proposals: only its status changes';
  END IF;
  IF NEW.status = 'applied' AND current_setting('pharmacy.rule_apply', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'pharmacy_rule_proposals: applied only by two signatures' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION private.pharmacy_rule_sign() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE p public.pharmacy_rule_proposals; n int; people int;
BEGIN
  SELECT * INTO p FROM public.pharmacy_rule_proposals WHERE id = NEW.proposal_id FOR UPDATE;
  IF p.status <> 'pending' THEN
    RAISE EXCEPTION 'pharmacy_rule_signatures: the proposal is closed' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.role = 'second' AND NEW.signed_by = p.proposed_by THEN
    RAISE EXCEPTION 'pharmacy_rule_signatures: the proposer cannot be the second signer' USING ERRCODE = 'check_violation';
  END IF;
  SELECT count(*), count(DISTINCT signed_by) INTO n, people
    FROM public.pharmacy_rule_signatures WHERE proposal_id = NEW.proposal_id;
  IF n = 2 AND people < 2 THEN
    RAISE EXCEPTION 'pharmacy_rule_signatures: two different people sign' USING ERRCODE = 'check_violation';
  END IF;
  IF n = 2 THEN
    PERFORM set_config('pharmacy.rule_apply', 'on', true);
    INSERT INTO public.pharmacy_rules (hospital_id, rule_group, key, text, product_id, params, name, applies_to)
    VALUES (p.hospital_id, p.rule_group, p.key, p.new_text, p.product_id, p.params, p.name, p.applies_to)
    ON CONFLICT (hospital_id, rule_group, key)
      DO UPDATE SET text = EXCLUDED.text, params = coalesce(EXCLUDED.params, pharmacy_rules.params),
        name = coalesce(EXCLUDED.name, pharmacy_rules.name),
        applies_to = coalesce(EXCLUDED.applies_to, pharmacy_rules.applies_to), updated_at = now();
    UPDATE public.pharmacy_rule_proposals SET status = 'applied', closed_at = now() WHERE id = p.id;
    PERFORM set_config('pharmacy.rule_apply', 'off', true);
  END IF;
  RETURN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.pharmacy_rule_group_signatures (
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  group_key text NOT NULL CHECK (group_key IN ('cd','ho','inv','rx','cold','ord','price','roster','swap','msg')),
  role text NOT NULL CHECK (role IN ('in_charge','second')),
  signed_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  signed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (hospital_id, group_key, role)
);
CREATE OR REPLACE FUNCTION private.pharmacy_rule_group_sign() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.role = 'in_charge' AND NOT private.pharmacy_is_in_charge(NEW.signed_by, NEW.hospital_id) THEN
    RAISE EXCEPTION 'pharmacy_rule_group_signatures: only the in-charge signs as in-charge' USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (SELECT 1 FROM public.pharmacy_rule_group_signatures g WHERE g.hospital_id = NEW.hospital_id
              AND g.group_key = NEW.group_key AND g.signed_by = NEW.signed_by) THEN
    RAISE EXCEPTION 'pharmacy_rule_group_signatures: two different people sign' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS prgs_guard ON public.pharmacy_rule_group_signatures;
CREATE TRIGGER prgs_guard BEFORE INSERT ON public.pharmacy_rule_group_signatures
  FOR EACH ROW EXECUTE FUNCTION private.pharmacy_rule_group_sign();

-- ─── 7. Messages ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pharmacy_sms_provider (
  hospital_id uuid PRIMARY KEY REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  name text NOT NULL CHECK (char_length(name) BETWEEN 2 AND 80),
  sender_id text NOT NULL CHECK (sender_id ~ '^[A-Z0-9 ]{1,11}$'),
  -- Encrypted by the server (lib/encryption); the client role is never granted this column.
  api_key_encrypted text NOT NULL,
  cost_ugx integer NOT NULL CHECK (cost_ugx > 0),
  facility_label text CHECK (facility_label IS NULL OR char_length(facility_label) <= 60),
  connected boolean NOT NULL DEFAULT false,
  updated_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.pharmacy_sms_settings (
  hospital_id uuid PRIMARY KEY REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  monthly_budget_ugx bigint CHECK (monthly_budget_ugx IS NULL OR monthly_budget_ugx >= 0),
  updated_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Templates: timing and the Luganda check. Six parts at most (6 × 153).
ALTER TABLE public.pharmacy_sms_rules
  ADD COLUMN IF NOT EXISTS timing text CHECK (timing IS NULL OR char_length(timing) BETWEEN 1 AND 40),
  ADD COLUMN IF NOT EXISTS lg_checked_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS lg_checked_at timestamptz;
ALTER TABLE public.pharmacy_sms_rules DROP CONSTRAINT IF EXISTS pharmacy_sms_rules_template_en_check;
ALTER TABLE public.pharmacy_sms_rules DROP CONSTRAINT IF EXISTS pharmacy_sms_rules_template_lg_check;
ALTER TABLE public.pharmacy_sms_rules ADD CONSTRAINT pharmacy_sms_rules_template_en_check
  CHECK (template_en IS NULL OR char_length(template_en) BETWEEN 10 AND 918);
ALTER TABLE public.pharmacy_sms_rules ADD CONSTRAINT pharmacy_sms_rules_template_lg_check
  CHECK (template_lg IS NULL OR char_length(template_lg) BETWEEN 10 AND 918);

-- Outbox: parts and cost, queued (held by quiet hours) and delivered (the provider's callback); test messages.
ALTER TABLE public.pharmacy_sms_messages
  ADD COLUMN IF NOT EXISTS parts integer NOT NULL DEFAULT 1 CHECK (parts BETWEEN 1 AND 6),
  ADD COLUMN IF NOT EXISTS cost_ugx integer NOT NULL DEFAULT 0 CHECK (cost_ugx >= 0),
  ADD COLUMN IF NOT EXISTS note text CHECK (note IS NULL OR char_length(note) <= 200),
  ADD COLUMN IF NOT EXISTS delivered_at timestamptz;
ALTER TABLE public.pharmacy_sms_messages DROP CONSTRAINT IF EXISTS pharmacy_sms_messages_body_check;
ALTER TABLE public.pharmacy_sms_messages ADD CONSTRAINT pharmacy_sms_messages_body_check
  CHECK (char_length(body) BETWEEN 1 AND 918);
ALTER TABLE public.pharmacy_sms_messages DROP CONSTRAINT IF EXISTS pharmacy_sms_messages_status_check;
ALTER TABLE public.pharmacy_sms_messages ADD CONSTRAINT pharmacy_sms_messages_status_check
  CHECK (status IN ('scheduled','queued','sent','delivered','failed','skipped','called'));
DO $$
DECLARE rules text := $r$('refill_due','refill_missed','course','epi_tomorrow','epi_defaulter',
  'staff_eve','staff_change','staff_unpub','staff_licence','test')$r$;
BEGIN
  ALTER TABLE public.pharmacy_sms_messages DROP CONSTRAINT IF EXISTS pharmacy_sms_messages_rule_check;
  EXECUTE 'ALTER TABLE public.pharmacy_sms_messages ADD CONSTRAINT pharmacy_sms_messages_rule_check CHECK (rule IN ' || rules || ')';
END $$;

-- A message moves forward only: scheduled → queued | sent | failed | skipped; queued → sent | failed | skipped;
-- sent → delivered | failed; failed → sent (retry) | failed | called.
CREATE OR REPLACE FUNCTION private.pharmacy_sms_message_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE moving text[] := ARRAY['status','provider_id','cost','cost_ugx','failure','note','sent_at','delivered_at',
  'status_by','status_at'];
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'pharmacy_sms_messages: never deleted'; END IF;
  IF NOT ((OLD.status = 'scheduled' AND NEW.status IN ('queued','sent','failed','skipped'))
          OR (OLD.status = 'queued' AND NEW.status IN ('queued','sent','failed','skipped'))
          OR (OLD.status = 'sent' AND NEW.status IN ('delivered','failed'))
          OR (OLD.status = 'failed' AND NEW.status IN ('sent','failed','called')))
     OR (to_jsonb(NEW) - moving) <> (to_jsonb(OLD) - moving) THEN
    RAISE EXCEPTION 'pharmacy_sms_messages: % cannot become %', OLD.status, NEW.status;
  END IF;
  RETURN NEW;
END;
$$;

-- PRD §6.3 and SETUP-TABS §G: never to an opted-out number, in quiet hours (20:00–07:00 Kampala; tests excepted),
-- past the weekly cap per patient (Rules › Messages › Per patient), or past the monthly budget cap.
CREATE OR REPLACE FUNCTION private.pharmacy_sms_optout_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE at_ timestamptz; h int; budget bigint; spent bigint; cap numeric; week_n int;
BEGIN
  IF NEW.status <> 'sent' OR (TG_OP = 'UPDATE' AND OLD.status = 'sent') THEN RETURN NEW; END IF;
  IF EXISTS (SELECT 1 FROM public.pharmacy_sms_optouts o
       WHERE o.hospital_id = NEW.hospital_id AND o.phone_hmac = NEW.phone_hmac) THEN
    RAISE EXCEPTION 'pharmacy_sms: that number opted out' USING ERRCODE = 'P0001', HINT = 'opted_out';
  END IF;
  at_ := coalesce(NEW.sent_at, now());
  h := extract(hour FROM at_ AT TIME ZONE 'Africa/Kampala');
  IF NEW.rule <> 'test' AND (h >= 20 OR h < 7) THEN
    RAISE EXCEPTION 'pharmacy_sms: quiet hours' USING ERRCODE = 'P0001', HINT = 'quiet_hours';
  END IF;
  IF NEW.rule <> 'test' AND NEW.rule NOT LIKE 'staff\_%' THEN
    week_n := private.pharmacy_rule_n(NEW.hospital_id, 'msg', 'per_patient', 3)::int;
    IF (SELECT count(*) FROM public.pharmacy_sms_messages m
         WHERE m.hospital_id = NEW.hospital_id AND m.phone_hmac = NEW.phone_hmac AND m.id <> NEW.id
           AND m.status IN ('sent','delivered') AND m.rule <> 'test' AND m.rule NOT LIKE 'staff\_%'
           AND m.sent_at > at_ - interval '7 days') >= week_n THEN
      RAISE EXCEPTION 'pharmacy_sms: weekly cap per patient' USING ERRCODE = 'P0001', HINT = 'weekly_cap';
    END IF;
  END IF;
  SELECT monthly_budget_ugx INTO budget FROM public.pharmacy_sms_settings WHERE hospital_id = NEW.hospital_id;
  IF coalesce(budget, 0) > 0 THEN
    cap := budget * private.pharmacy_rule_n(NEW.hospital_id, 'msg', 'monthly_cap', 100) / 100;
    SELECT coalesce(sum(m.parts * m.cost_ugx), 0) INTO spent FROM public.pharmacy_sms_messages m
     WHERE m.hospital_id = NEW.hospital_id AND m.id <> NEW.id AND m.status IN ('sent','delivered')
       AND date_trunc('month', m.sent_at AT TIME ZONE 'Africa/Kampala') = date_trunc('month', at_ AT TIME ZONE 'Africa/Kampala');
    IF spent + NEW.parts * NEW.cost_ugx > cap THEN
      RAISE EXCEPTION 'pharmacy_sms: monthly budget cap' USING ERRCODE = 'P0001', HINT = 'budget_cap';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

ALTER TABLE public.pharmacy_sms_optouts
  ADD COLUMN IF NOT EXISTS reason text CHECK (reason IS NULL OR char_length(reason) BETWEEN 2 AND 60),
  ADD COLUMN IF NOT EXISTS phone_encrypted text;

-- ─── 8. The automatic go-live items and the blocker count ───────────────
-- One query behind the Going live checklist and the go-live guard (done of total per automatic item).
CREATE OR REPLACE FUNCTION private.pharmacy_golive_auto(p_hospital uuid)
RETURNS TABLE (key text, done integer, total integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE today date := (now() AT TIME ZONE 'Africa/Kampala')::date; target date; mon date; mfa int := 0;
BEGIN
  SELECT s.target_date INTO target FROM public.pharmacy_golive_state s WHERE s.hospital_id = p_hospital;
  mon := coalesce(target, today) - ((extract(isodow FROM coalesce(target, today))::int + 6) % 7);
  -- Pharmacy accounts: the people listed for the roster.
  IF to_regclass('auth.mfa_factors') IS NOT NULL THEN
    EXECUTE 'SELECT count(DISTINCT p.user_id)::int FROM public.pharmacy_roster_people p
       JOIN auth.mfa_factors f ON f.user_id = p.user_id AND f.status = ''verified''
      WHERE p.hospital_id = $1 AND p.ended_at IS NULL' INTO mfa USING p_hospital;
  END IF;
  RETURN QUERY
  WITH open_places AS (
    SELECT l.* FROM public.pharmacy_locations l
     WHERE l.hospital_id = p_hospital AND l.closed_at IS NULL AND l.archived_at IS NULL
       AND l.kind IN ('store','dispensing_point','ward','clinic','theatre')),
  products AS (SELECT p.id FROM public.pharmacy_products p WHERE p.hospital_id = p_hospital AND p.active),
  stocked AS (
    SELECT DISTINCT b.product_id, coalesce(b.location_id, b.dispensing_point_id) AS place
      FROM public.pharmacy_batches b JOIN public.pharmacy_stock_movements m ON m.batch_id = b.id
     WHERE b.hospital_id = p_hospital GROUP BY b.id HAVING sum(m.quantity) > 0),
  levels AS (
    SELECT DISTINCT ON (r.product_id, r.location_id) r.product_id, r.location_id, r.level
      FROM public.pharmacy_reorder_levels r WHERE r.hospital_id = p_hospital AND r.product_id IS NOT NULL
     ORDER BY r.product_id, r.location_id, r.set_at DESC),
  staff AS (SELECT p.user_id, p.cadre FROM public.pharmacy_roster_people p
             WHERE p.hospital_id = p_hospital AND p.ended_at IS NULL)
  SELECT 'mfa', mfa, (SELECT count(*)::int FROM staff)
  UNION ALL
  SELECT 'places', (SELECT count(*)::int FROM open_places o WHERE o.device_label IS NOT NULL
                      AND cardinality(o.handover_slots) > 0), (SELECT count(*)::int FROM open_places)
  UNION ALL
  SELECT 'levels', (SELECT count(*)::int FROM products p WHERE NOT EXISTS (
                      SELECT 1 FROM stocked s JOIN open_places o ON o.id = s.place WHERE s.product_id = p.id
                         AND NOT EXISTS (SELECT 1 FROM levels v WHERE v.product_id = p.id AND v.location_id = s.place
                                           AND v.level IS NOT NULL))),
                   (SELECT count(*)::int FROM products)
  UNION ALL
  SELECT 'prices', (SELECT count(*)::int FROM products p WHERE EXISTS (
                      SELECT 1 FROM public.pharmacy_product_prices pp
                        JOIN public.pharmacy_payers py ON py.id = pp.payer_id AND py.code = 'cash'
                       WHERE pp.product_id = p.id AND pp.from_date <= today)),
                   (SELECT count(*)::int FROM products)
  UNION ALL
  SELECT 'opening', (SELECT count(*)::int FROM open_places o WHERE EXISTS (
                       SELECT 1 FROM public.pharmacy_count_sheets c WHERE c.location_id = o.id AND c.status = 'done')),
                    (SELECT count(*)::int FROM open_places)
  UNION ALL
  SELECT 'sensor', (SELECT count(*)::int FROM public.pharmacy_fridges f WHERE f.hospital_id = p_hospital
                      AND f.archived_at IS NULL AND (f.sensor_id IS NOT NULL OR f.sensor_key_hash IS NOT NULL)),
                   (SELECT count(*)::int FROM public.pharmacy_fridges f WHERE f.hospital_id = p_hospital
                      AND f.archived_at IS NULL)
  UNION ALL
  SELECT 'roster', ((private.pharmacy_week_published(p_hospital, mon))::int
                    + (private.pharmacy_week_published(p_hospital, mon + 7))::int), 2
  UNION ALL
  SELECT 'lic', (SELECT count(*)::int FROM staff s WHERE s.cadre IN ('pharmacist','technician','dispenser')
                   AND (SELECT l.expires_on FROM public.pharmacy_staff_licences l WHERE l.hospital_id = p_hospital
                          AND l.user_id = s.user_id ORDER BY l.recorded_at DESC LIMIT 1) >= today),
                (SELECT count(*)::int FROM staff s WHERE s.cadre IN ('pharmacist','technician','dispenser'))
  UNION ALL
  SELECT 'train', (SELECT count(*)::int FROM staff s JOIN public.pharmacy_practice_trained t
                     ON t.hospital_id = p_hospital AND t.user_id = s.user_id), (SELECT count(*)::int FROM staff)
  UNION ALL
  SELECT 'rules', (SELECT count(*)::int FROM (SELECT g.group_key FROM public.pharmacy_rule_group_signatures g
                     WHERE g.hospital_id = p_hospital GROUP BY g.group_key HAVING count(*) = 2) x), 10;
END $$;

-- Blocking items still open: record and mark items not done, automatic items not complete (an empty total counts as
-- not done, so a hospital with nothing set up never goes live by accident).
CREATE OR REPLACE FUNCTION private.pharmacy_golive_blockers(p_hospital uuid) RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT (SELECT count(*)::int FROM unnest(ARRAY['q1','q24','wit','dev','demo']) k
           WHERE NOT EXISTS (SELECT 1 FROM public.pharmacy_golive_items i
                              WHERE i.hospital_id = p_hospital AND i.key = k AND i.status = 'done'))
       + (SELECT count(*)::int FROM private.pharmacy_golive_auto(p_hospital) a
           WHERE a.key IN ('mfa','levels','opening','roster','lic','train','rules') AND (a.total = 0 OR a.done < a.total));
$$;

-- Target date, practice and paper retirement: the in-charge only. The state changes only here.
CREATE OR REPLACE FUNCTION private.pharmacy_golive_event() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE s public.pharmacy_golive_state;
BEGIN
  IF NEW.kind NOT IN ('target','practice_start','practice_end','retire') THEN RETURN NEW; END IF;
  IF NOT private.pharmacy_is_in_charge(NEW.by_user, NEW.hospital_id) THEN
    RAISE EXCEPTION 'pharmacy_golive: only the in-charge changes this' USING ERRCODE = 'check_violation', HINT = 'not_in_charge';
  END IF;
  INSERT INTO public.pharmacy_golive_state (hospital_id) VALUES (NEW.hospital_id) ON CONFLICT DO NOTHING;
  SELECT * INTO s FROM public.pharmacy_golive_state WHERE hospital_id = NEW.hospital_id FOR UPDATE;
  PERFORM set_config('pharmacy.golive_apply', 'on', true);
  IF NEW.kind = 'target' THEN
    IF s.live_at IS NOT NULL OR NEW.detail IS NULL OR NEW.detail !~ '^\d{4}-\d{2}-\d{2}$'
       OR NEW.detail::date <= (now() AT TIME ZONE 'Africa/Kampala')::date THEN
      RAISE EXCEPTION 'pharmacy_golive: the go-live date is after today' USING ERRCODE = 'check_violation';
    END IF;
    UPDATE public.pharmacy_golive_state SET target_date = NEW.detail::date, updated_at = now() WHERE hospital_id = s.hospital_id;
  ELSIF NEW.kind = 'practice_start' THEN
    IF s.phase <> 'setup' THEN RAISE EXCEPTION 'pharmacy_golive: practice only before going live' USING ERRCODE = 'check_violation'; END IF;
    INSERT INTO public.pharmacy_practice_sessions (hospital_id, started_by) VALUES (NEW.hospital_id, NEW.by_user);
    UPDATE public.pharmacy_golive_state SET phase = 'practice', updated_at = now() WHERE hospital_id = s.hospital_id;
  ELSIF NEW.kind = 'practice_end' THEN
    IF s.phase <> 'practice' THEN RAISE EXCEPTION 'pharmacy_golive: no practice day is running' USING ERRCODE = 'check_violation'; END IF;
    DELETE FROM pharmacy_practice.dispenses WHERE hospital_id = NEW.hospital_id;
    UPDATE public.pharmacy_practice_sessions SET ended_at = now(), ended_by = NEW.by_user
     WHERE hospital_id = NEW.hospital_id AND ended_at IS NULL;
    UPDATE public.pharmacy_golive_state SET phase = 'setup', updated_at = now() WHERE hospital_id = s.hospital_id;
  ELSE
    IF s.phase <> 'parallel' THEN RAISE EXCEPTION 'pharmacy_golive: paper is retired only when live' USING ERRCODE = 'check_violation'; END IF;
    UPDATE public.pharmacy_golive_state SET phase = 'retired', retired_at = now(), updated_at = now() WHERE hospital_id = s.hospital_id;
  END IF;
  PERFORM set_config('pharmacy.golive_apply', 'off', true);
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS pge_apply ON public.pharmacy_golive_events;
CREATE TRIGGER pge_apply BEFORE INSERT ON public.pharmacy_golive_events
  FOR EACH ROW EXECUTE FUNCTION private.pharmacy_golive_event();

CREATE OR REPLACE FUNCTION private.pharmacy_golive_state_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' OR (TG_OP = 'UPDATE' AND current_setting('pharmacy.golive_apply', true) IS DISTINCT FROM 'on') THEN
    RAISE EXCEPTION 'pharmacy_golive_state: changed only by the in-charge''s events and the two signatures'
      USING ERRCODE = 'check_violation';
  END IF;
  IF TG_OP = 'INSERT' AND NEW.phase <> 'setup' THEN
    RAISE EXCEPTION 'pharmacy_golive_state: starts in set-up' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS pgs_guard ON public.pharmacy_golive_state;
CREATE TRIGGER pgs_guard BEFORE INSERT OR UPDATE OR DELETE ON public.pharmacy_golive_state
  FOR EACH ROW EXECUTE FUNCTION private.pharmacy_golive_state_guard();

-- §I.1: the in-charge and the medical superintendent (a hospital admin of this hospital), two different people, and
-- nothing blocking. The second signature switches the hospital live.
CREATE OR REPLACE FUNCTION private.pharmacy_golive_sign() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE n int;
BEGIN
  IF TG_OP = 'INSERT' AND TG_WHEN = 'BEFORE' THEN
    IF EXISTS (SELECT 1 FROM public.pharmacy_golive_state s WHERE s.hospital_id = NEW.hospital_id AND s.live_at IS NOT NULL) THEN
      RAISE EXCEPTION 'pharmacy_golive: already live' USING ERRCODE = 'check_violation';
    END IF;
    n := private.pharmacy_golive_blockers(NEW.hospital_id);
    IF n > 0 THEN
      RAISE EXCEPTION 'pharmacy_golive: % things still block going live', n USING ERRCODE = 'check_violation', HINT = 'blocked';
    END IF;
    IF NEW.role = 'in_charge' AND NOT private.pharmacy_is_in_charge(NEW.signed_by, NEW.hospital_id) THEN
      RAISE EXCEPTION 'pharmacy_golive: only the in-charge signs as in-charge' USING ERRCODE = 'check_violation', HINT = 'role';
    END IF;
    IF NEW.role = 'ms' AND NOT EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = NEW.signed_by
                                         AND r.hospital_id = NEW.hospital_id AND r.role = 'hospital_admin') THEN
      RAISE EXCEPTION 'pharmacy_golive: only the medical superintendent signs as such' USING ERRCODE = 'check_violation', HINT = 'role';
    END IF;
    IF EXISTS (SELECT 1 FROM public.pharmacy_golive_signatures g WHERE g.hospital_id = NEW.hospital_id
                AND g.signed_by = NEW.signed_by) THEN
      RAISE EXCEPTION 'pharmacy_golive: two different people sign' USING ERRCODE = 'check_violation', HINT = 'same_person';
    END IF;
    RETURN NEW;
  END IF;
  IF (SELECT count(*) FROM public.pharmacy_golive_signatures g WHERE g.hospital_id = NEW.hospital_id) = 2 THEN
    INSERT INTO public.pharmacy_golive_state (hospital_id) VALUES (NEW.hospital_id) ON CONFLICT DO NOTHING;
    PERFORM set_config('pharmacy.golive_apply', 'on', true);
    UPDATE public.pharmacy_golive_state SET phase = 'parallel', live_at = now(), updated_at = now()
     WHERE hospital_id = NEW.hospital_id;
    PERFORM set_config('pharmacy.golive_apply', 'off', true);
    INSERT INTO public.pharmacy_golive_events (hospital_id, kind, by_user) VALUES (NEW.hospital_id, 'live', NEW.signed_by);
  END IF;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS pgsig_guard ON public.pharmacy_golive_signatures;
CREATE TRIGGER pgsig_guard BEFORE INSERT ON public.pharmacy_golive_signatures
  FOR EACH ROW EXECUTE FUNCTION private.pharmacy_golive_sign();
DROP TRIGGER IF EXISTS pgsig_live ON public.pharmacy_golive_signatures;
CREATE TRIGGER pgsig_live AFTER INSERT ON public.pharmacy_golive_signatures
  FOR EACH ROW EXECUTE FUNCTION private.pharmacy_golive_sign();

-- ─── Append-only, audit, RLS ─────────────────────────────────────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['pharmacy_golive_events','pharmacy_golive_signatures','pharmacy_practice_trained',
    'pharmacy_rule_group_signatures'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %1$s_append_only ON public.%1$I', t);
    EXECUTE format('CREATE TRIGGER %1$s_append_only BEFORE UPDATE OR DELETE ON public.%1$I
      FOR EACH ROW EXECUTE FUNCTION public.block_modify_append_only()', t);
  END LOOP;
  FOREACH t IN ARRAY ARRAY['pharmacy_golive_items','pharmacy_golive_state','pharmacy_golive_events',
    'pharmacy_golive_signatures','pharmacy_practice_sessions','pharmacy_practice_trained','pharmacy_devices',
    'pharmacy_fridge_excursions','pharmacy_suppliers','pharmacy_rule_group_signatures','pharmacy_sms_provider',
    'pharmacy_sms_settings'] LOOP
    IF t <> 'pharmacy_devices' THEN
      EXECUTE format('DROP TRIGGER IF EXISTS audit_%1$s ON public.%1$I', t);
      EXECUTE format('CREATE TRIGGER audit_%1$s AFTER INSERT OR UPDATE OR DELETE ON public.%1$I
        FOR EACH ROW EXECUTE FUNCTION public.audit_log_changes()', t);
    END IF;
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
    IF t <> 'pharmacy_sms_provider' THEN
      EXECUTE format('GRANT SELECT ON public.%I TO medsync_clinical_reader', t);
    END IF;
    EXECUTE format('DROP POLICY IF EXISTS %1$s_select ON public.%1$I', t);
    EXECUTE format('CREATE POLICY %1$s_select ON public.%1$I FOR SELECT TO medsync_clinical_reader
      USING (hospital_id = (SELECT private.current_hospital_id()) AND (SELECT private.pharmacy_can(''pharmacy.view'')))', t);
  END LOOP;
END $$;

-- The API key column is never granted to the client role.
REVOKE ALL ON public.pharmacy_sms_provider FROM medsync_clinical_reader;
GRANT SELECT (hospital_id, name, sender_id, cost_ugx, facility_label, connected, updated_by, updated_at)
  ON public.pharmacy_sms_provider TO medsync_clinical_reader;

ALTER TABLE pharmacy_practice.dispenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE pharmacy_practice.dispenses FORCE ROW LEVEL SECURITY;
REVOKE ALL ON SCHEMA pharmacy_practice FROM PUBLIC;
REVOKE ALL ON pharmacy_practice.dispenses FROM anon, authenticated;
GRANT USAGE ON SCHEMA pharmacy_practice TO medsync_clinical_reader;
GRANT SELECT ON pharmacy_practice.dispenses TO medsync_clinical_reader;
DROP POLICY IF EXISTS practice_dispenses_select ON pharmacy_practice.dispenses;
CREATE POLICY practice_dispenses_select ON pharmacy_practice.dispenses FOR SELECT TO medsync_clinical_reader
  USING (hospital_id = (SELECT private.current_hospital_id()) AND (SELECT private.pharmacy_can('pharmacy.view')));

REVOKE ALL ON FUNCTION private.pharmacy_golive_auto(uuid), private.pharmacy_golive_blockers(uuid),
  private.pharmacy_place_lines(uuid, uuid) FROM PUBLIC;

-- Realtime: fridge readings already broadcast (0270); the outbox joins them for the Messages tab.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'pharmacy_stock_broadcast') THEN
    DROP TRIGGER IF EXISTS pharmacy_stock_broadcast ON public.pharmacy_sms_messages;
    CREATE TRIGGER pharmacy_stock_broadcast AFTER INSERT OR UPDATE ON public.pharmacy_sms_messages
      FOR EACH ROW EXECUTE FUNCTION public.pharmacy_stock_broadcast();
  END IF;
END $$;
