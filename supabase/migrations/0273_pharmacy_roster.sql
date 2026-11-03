-- 0273 — Set-up › People and roster (rework kit 5, PEOPLE-ROSTER.md §16).
--
-- GATED: owner-applied (`npm run db:migrate`), after 0272.
--
--   1. Rules carry their numbers: pharmacy_rules.params and pharmacy_rule_proposals.params (`{"n": 6}`). The second
--      signature copies them, and the proposer can never be the second signer. private.pharmacy_rule_n() reads one.
--   2. pharmacy_roster_people: who can be rostered, their cadre and the pharmacy places they work at.
--   3. pharmacy_staff_licences: append-only, the latest per person wins.
--   4. pharmacy_roster_delegations: the in-charge hands making the roster to someone, for some or all places.
--   5. pharmacy_roster_week_events: publish and unlock, append-only; a week's state is its latest event.
--   6. pharmacy_staff_leave: approval frees the person's shifts in the range, in the same transaction.
--   7. pharmacy_roster_requests + events: swaps and covers; approved only after the colleague accepted, by the
--      roster maker of both places.
--   8. pharmacy_shift_attendance, pharmacy_roster_reminders, public_holidays (gazetted days only; fixed days and
--      Easter are computed in code).
--   9. pharmacy_duty_roster (0265) keeps its shape: once a hospital lists its people, every new line is one duty
--      (one date, one place) and the guard enforces the roster rules. Readers of the table are unchanged.
--  10. The SMS queue learns the four staff reminders.
--
-- ADDITIVE and re-runnable. No client grants: writes come from the server connection.
-- Reverse: drop the new tables and functions; restore the 0270 pharmacy_rule_sign and the 0268 SMS checks.

-- ─── 1. Rule numbers ─────────────────────────────────────────────────────
ALTER TABLE public.pharmacy_rules ADD COLUMN IF NOT EXISTS params jsonb;
ALTER TABLE public.pharmacy_rule_proposals ADD COLUMN IF NOT EXISTS params jsonb;

CREATE OR REPLACE FUNCTION private.pharmacy_rule_n(p_hospital uuid, p_group text, p_key text, p_default numeric)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT coalesce((SELECT (r.params->>'n')::numeric FROM public.pharmacy_rules r
                    WHERE r.hospital_id = p_hospital AND r.rule_group = p_group AND r.key = p_key), p_default);
$$;

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
    INSERT INTO public.pharmacy_rules (hospital_id, rule_group, key, text, product_id, params)
    VALUES (p.hospital_id, p.rule_group, p.key, p.new_text, p.product_id, p.params)
    ON CONFLICT (hospital_id, rule_group, key)
      DO UPDATE SET text = EXCLUDED.text, params = coalesce(EXCLUDED.params, pharmacy_rules.params), updated_at = now();
    UPDATE public.pharmacy_rule_proposals SET status = 'applied', closed_at = now() WHERE id = p.id;
    PERFORM set_config('pharmacy.rule_apply', 'off', true);
  END IF;
  RETURN NULL;
END $$;

-- ─── 2. People who can be rostered ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pharmacy_roster_people (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  cadre text NOT NULL CHECK (cadre IN ('pharmacist','technician','dispenser','store_keeper')),
  places uuid[] NOT NULL CHECK (cardinality(places) BETWEEN 1 AND 40),
  added_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  -- A change is a new row: the old one is ended.
  ended_at timestamptz,
  ended_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  CONSTRAINT prp_people_end CHECK ((ended_at IS NULL) = (ended_by IS NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS prpe_one ON public.pharmacy_roster_people (hospital_id, user_id) WHERE ended_at IS NULL;

-- ─── 3. Licences ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pharmacy_staff_licences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  body text NOT NULL CHECK (body IN ('PSU','AHPC')),
  number text NOT NULL CHECK (char_length(number) BETWEEN 2 AND 40),
  expires_on date NOT NULL,
  recorded_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  recorded_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS psl_latest ON public.pharmacy_staff_licences (hospital_id, user_id, recorded_at DESC);

-- ─── 4. Who makes the roster ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pharmacy_roster_delegations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  from_user uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  to_user uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  -- Empty: every pharmacy place.
  places uuid[] NOT NULL DEFAULT '{}',
  until date,
  can_publish boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  revoked_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  CONSTRAINT prd_self CHECK (from_user <> to_user),
  -- Choosing places switches publishing off (§5).
  CONSTRAINT prd_publish CHECK (cardinality(places) = 0 OR NOT can_publish),
  CONSTRAINT prd_revoke CHECK ((revoked_at IS NULL) = (revoked_by IS NULL))
);
-- One handover per person; a new one replaces the old one.
CREATE UNIQUE INDEX IF NOT EXISTS prd_one ON public.pharmacy_roster_delegations (hospital_id, to_user) WHERE revoked_at IS NULL;

-- A user makes the roster for a pharmacy place: the in-charge, or an active delegate covering it.
CREATE OR REPLACE FUNCTION private.pharmacy_roster_maker(p_hospital uuid, p_user uuid, p_place uuid, p_publish boolean)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT private.pharmacy_can_user(p_user, p_hospital, 'pharmacy.manage')
      OR EXISTS (SELECT 1 FROM public.pharmacy_roster_delegations d
                  WHERE d.hospital_id = p_hospital AND d.to_user = p_user AND d.revoked_at IS NULL
                    AND (d.until IS NULL OR d.until >= (now() AT TIME ZONE 'Africa/Kampala')::date)
                    AND (p_place IS NULL OR cardinality(d.places) = 0 OR p_place = ANY (d.places))
                    AND (NOT p_publish OR d.can_publish));
$$;

CREATE OR REPLACE FUNCTION private.pharmacy_delegation_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'pharmacy_roster_delegations: revoked, never deleted'; END IF;
  IF TG_OP = 'INSERT' THEN
    IF NOT private.pharmacy_can_user(NEW.from_user, NEW.hospital_id, 'pharmacy.manage') THEN
      RAISE EXCEPTION 'pharmacy_roster_delegations: only the in-charge hands the roster over' USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.until IS NOT NULL AND NEW.until < (now() AT TIME ZONE 'Africa/Kampala')::date THEN
      RAISE EXCEPTION 'pharmacy_roster_delegations: the end date has passed' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;
  IF OLD.revoked_at IS NOT NULL OR NEW.revoked_at IS NULL
     OR (to_jsonb(NEW) - 'revoked_at' - 'revoked_by') <> (to_jsonb(OLD) - 'revoked_at' - 'revoked_by') THEN
    RAISE EXCEPTION 'pharmacy_roster_delegations: only taking it back changes it';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS prd_guard ON public.pharmacy_roster_delegations;
CREATE TRIGGER prd_guard BEFORE INSERT OR UPDATE OR DELETE ON public.pharmacy_roster_delegations
  FOR EACH ROW EXECUTE FUNCTION private.pharmacy_delegation_guard();

-- ─── 5. Publishing ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pharmacy_roster_week_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  week_start date NOT NULL CHECK (extract(isodow FROM week_start) = 1),
  action text NOT NULL CHECK (action IN ('publish','unlock')),
  reason text CHECK (reason IS NULL OR char_length(reason) BETWEEN 2 AND 300),
  actor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT prwe_reason CHECK (action <> 'unlock' OR reason IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS prwe_latest ON public.pharmacy_roster_week_events (hospital_id, week_start, at DESC);

CREATE OR REPLACE FUNCTION private.pharmacy_week_published(p_hospital uuid, p_date date)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT coalesce((SELECT e.action = 'publish' FROM public.pharmacy_roster_week_events e
                    WHERE e.hospital_id = p_hospital AND e.week_start = date_trunc('week', p_date)::date
                    ORDER BY e.at DESC LIMIT 1), false);
$$;

CREATE OR REPLACE FUNCTION private.pharmacy_week_event_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE published boolean := private.pharmacy_week_published(NEW.hospital_id, NEW.week_start);
BEGIN
  IF NOT private.pharmacy_roster_maker(NEW.hospital_id, NEW.actor_id, NULL, true) THEN
    RAISE EXCEPTION 'pharmacy_roster_week_events: only the in-charge or a delegate who can publish'
      USING ERRCODE = 'check_violation';
  END IF;
  IF (NEW.action = 'publish') = published THEN
    RAISE EXCEPTION 'pharmacy_roster_week_events: the week is already %', CASE WHEN published THEN 'published' ELSE 'a draft' END
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS prwe_guard ON public.pharmacy_roster_week_events;
CREATE TRIGGER prwe_guard BEFORE INSERT ON public.pharmacy_roster_week_events
  FOR EACH ROW EXECUTE FUNCTION private.pharmacy_week_event_guard();

-- ─── 6. Leave ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pharmacy_staff_leave (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  kind text NOT NULL CHECK (kind IN ('annual','day_off','study','sick')),
  date_from date NOT NULL,
  date_to date NOT NULL,
  reason text CHECK (reason IS NULL OR char_length(reason) <= 300),
  late boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','declined','withdrawn')),
  note text CHECK (note IS NULL OR char_length(note) <= 300),
  decided_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT psl_dates CHECK (date_to >= date_from),
  CONSTRAINT psl_decided CHECK ((status = 'pending') = (decided_at IS NULL) AND (decided_at IS NULL) = (decided_by IS NULL))
);
CREATE INDEX IF NOT EXISTS psle_who ON public.pharmacy_staff_leave (hospital_id, user_id, date_from, date_to);

CREATE OR REPLACE FUNCTION private.pharmacy_leave_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'pharmacy_staff_leave: never deleted'; END IF;
  IF OLD.status <> 'pending' OR NEW.status = 'pending'
     OR (to_jsonb(NEW) - 'status' - 'note' - 'decided_by' - 'decided_at')
        <> (to_jsonb(OLD) - 'status' - 'note' - 'decided_by' - 'decided_at') THEN
    RAISE EXCEPTION 'pharmacy_staff_leave: a decided request never changes';
  END IF;
  IF NEW.status = 'withdrawn' AND NEW.decided_by <> OLD.user_id THEN
    RAISE EXCEPTION 'pharmacy_staff_leave: only the person who asked withdraws' USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.status IN ('approved','declined') AND NOT private.pharmacy_roster_maker(NEW.hospital_id, NEW.decided_by, NULL, true) THEN
    RAISE EXCEPTION 'pharmacy_staff_leave: only the in-charge or a delegate who can publish decides'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.status = 'approved' THEN
    -- Approval frees the shifts in the range, in this transaction.
    PERFORM set_config('pharmacy.roster_via', 'request', true);
    UPDATE public.pharmacy_duty_roster SET ended_at = now(), ended_by = NEW.decided_by
     WHERE hospital_id = NEW.hospital_id AND user_id = NEW.user_id AND ended_at IS NULL
       AND date_from BETWEEN NEW.date_from AND NEW.date_to AND date_from = date_to;
    PERFORM set_config('pharmacy.roster_via', '', true);
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS psle_guard ON public.pharmacy_staff_leave;
CREATE TRIGGER psle_guard BEFORE UPDATE OR DELETE ON public.pharmacy_staff_leave
  FOR EACH ROW EXECUTE FUNCTION private.pharmacy_leave_guard();

-- ─── 7. Swaps and covers ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pharmacy_roster_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  from_user uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  to_user uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  kind text NOT NULL CHECK (kind IN ('cover','swap')),
  give_date date NOT NULL,
  give_place uuid NOT NULL REFERENCES public.pharmacy_locations(id) ON DELETE RESTRICT,
  give_shift text NOT NULL CHECK (give_shift IN ('day','night','call')),
  take_date date,
  take_place uuid REFERENCES public.pharmacy_locations(id) ON DELETE RESTRICT,
  take_shift text CHECK (take_shift IS NULL OR take_shift IN ('day','night','call')),
  reason text CHECK (reason IS NULL OR char_length(reason) <= 300),
  status text NOT NULL DEFAULT 'colleague'
    CHECK (status IN ('colleague','incharge','approved','declined','rejected','withdrawn')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT prr_self CHECK (from_user <> to_user),
  CONSTRAINT prr_take CHECK ((kind = 'swap') = (take_date IS NOT NULL)
    AND (take_date IS NULL) = (take_place IS NULL) AND (take_date IS NULL) = (take_shift IS NULL))
);
CREATE INDEX IF NOT EXISTS prr_open ON public.pharmacy_roster_requests (hospital_id, status);

CREATE TABLE IF NOT EXISTS public.pharmacy_roster_request_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.pharmacy_roster_requests(id) ON DELETE RESTRICT,
  actor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  action text NOT NULL CHECK (action IN ('asked','accepted','declined','approved','rejected','withdrawn')),
  note text CHECK (note IS NULL OR char_length(note) <= 300),
  at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS prre_req ON public.pharmacy_roster_request_events (request_id, at);

-- A request moves only by its events: the colleague answers first; then the roster maker of both places.
CREATE OR REPLACE FUNCTION private.pharmacy_request_event_apply() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE r public.pharmacy_roster_requests; nxt text;
BEGIN
  SELECT * INTO r FROM public.pharmacy_roster_requests WHERE id = NEW.request_id FOR UPDATE;
  IF NEW.action = 'asked' THEN
    IF NEW.actor_id <> r.from_user OR r.status <> 'colleague' THEN
      RAISE EXCEPTION 'pharmacy_roster_requests: asked once, by the person asking' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;
  nxt := CASE
    WHEN NEW.action IN ('accepted','declined') AND r.status = 'colleague' AND NEW.actor_id = r.to_user
      THEN CASE NEW.action WHEN 'accepted' THEN 'incharge' ELSE 'declined' END
    WHEN NEW.action IN ('approved','rejected') AND r.status = 'incharge'
         AND private.pharmacy_roster_maker(r.hospital_id, NEW.actor_id, r.give_place, false)
         AND (r.take_place IS NULL OR private.pharmacy_roster_maker(r.hospital_id, NEW.actor_id, r.take_place, false))
      THEN NEW.action
    WHEN NEW.action = 'withdrawn' AND r.status IN ('colleague','incharge') AND NEW.actor_id = r.from_user
      THEN 'withdrawn'
  END;
  IF nxt IS NULL THEN
    RAISE EXCEPTION 'pharmacy_roster_requests: % is not allowed while %', NEW.action, r.status
      USING ERRCODE = 'check_violation', HINT = 'request_state';
  END IF;
  PERFORM set_config('pharmacy.request_move', 'on', true);
  UPDATE public.pharmacy_roster_requests SET status = nxt WHERE id = r.id;
  PERFORM set_config('pharmacy.request_move', '', true);
  IF nxt = 'approved' THEN
    -- The roster changes now, in this transaction; the duty guard still checks place, leave, licence and room.
    PERFORM set_config('pharmacy.roster_via', 'request', true);
    UPDATE public.pharmacy_duty_roster SET ended_at = now(), ended_by = NEW.actor_id
     WHERE hospital_id = r.hospital_id AND ended_at IS NULL AND date_from = date_to
       AND ((user_id = r.from_user AND date_from = r.give_date AND location_id = r.give_place AND shift = r.give_shift)
         OR (r.kind = 'swap' AND user_id = r.to_user AND date_from = r.take_date AND location_id = r.take_place
             AND shift = r.take_shift));
    INSERT INTO public.pharmacy_duty_roster (hospital_id, user_id, location_id, role, shift, date_from, date_to, created_by)
    SELECT r.hospital_id, x.u, x.p, coalesce(
             (SELECT CASE pp.cadre WHEN 'dispenser' THEN 'technician' ELSE pp.cadre END FROM public.pharmacy_roster_people pp
               WHERE pp.hospital_id = r.hospital_id AND pp.user_id = x.u AND pp.ended_at IS NULL), 'technician'),
           x.s, x.d, x.d, NEW.actor_id
      FROM (VALUES (r.to_user, r.give_place, r.give_shift, r.give_date),
                   (CASE WHEN r.kind = 'swap' THEN r.from_user END, r.take_place, r.take_shift, r.take_date)) AS x(u, p, s, d)
     WHERE x.u IS NOT NULL;
    PERFORM set_config('pharmacy.roster_via', '', true);
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS prre_apply ON public.pharmacy_roster_request_events;
CREATE TRIGGER prre_apply BEFORE INSERT ON public.pharmacy_roster_request_events
  FOR EACH ROW EXECUTE FUNCTION private.pharmacy_request_event_apply();
DROP TRIGGER IF EXISTS prre_append_only ON public.pharmacy_roster_request_events;
CREATE TRIGGER prre_append_only BEFORE UPDATE OR DELETE ON public.pharmacy_roster_request_events
  FOR EACH ROW EXECUTE FUNCTION public.block_modify_append_only();

CREATE OR REPLACE FUNCTION private.pharmacy_request_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'pharmacy_roster_requests: never deleted'; END IF;
  IF TG_OP = 'INSERT' AND NEW.status <> 'colleague' THEN
    RAISE EXCEPTION 'pharmacy_roster_requests: a request starts with the colleague' USING ERRCODE = 'check_violation';
  END IF;
  IF TG_OP = 'UPDATE' AND (current_setting('pharmacy.request_move', true) IS DISTINCT FROM 'on'
     OR (to_jsonb(NEW) - 'status') <> (to_jsonb(OLD) - 'status')) THEN
    RAISE EXCEPTION 'pharmacy_roster_requests: changes only through its events' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS prr_guard ON public.pharmacy_roster_requests;
CREATE TRIGGER prr_guard BEFORE INSERT OR UPDATE OR DELETE ON public.pharmacy_roster_requests
  FOR EACH ROW EXECUTE FUNCTION private.pharmacy_request_guard();

-- ─── 8. Attendance, reminders, holidays ──────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pharmacy_shift_attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  location_id uuid NOT NULL REFERENCES public.pharmacy_locations(id) ON DELETE RESTRICT,
  duty_date date NOT NULL,
  -- On call has no sign-in.
  shift text NOT NULL CHECK (shift IN ('day','night')),
  signed_in_at timestamptz NOT NULL DEFAULT now(),
  device_id text CHECK (device_id IS NULL OR char_length(device_id) <= 80),
  UNIQUE (hospital_id, user_id, duty_date, shift)
);
DROP TRIGGER IF EXISTS psa_append_only ON public.pharmacy_shift_attendance;
CREATE TRIGGER psa_append_only BEFORE UPDATE OR DELETE ON public.pharmacy_shift_attendance
  FOR EACH ROW EXECUTE FUNCTION public.block_modify_append_only();

CREATE TABLE IF NOT EXISTS public.pharmacy_roster_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  eve_on boolean NOT NULL,
  eve_time text NOT NULL CHECK (eve_time IN ('17:00','18:00','19:00','20:00')),
  change_on boolean NOT NULL,
  unpub_on boolean NOT NULL,
  lic_on boolean NOT NULL,
  set_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  set_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS prrm_latest ON public.pharmacy_roster_reminders (hospital_id, set_at DESC);
DROP TRIGGER IF EXISTS prrm_append_only ON public.pharmacy_roster_reminders;
CREATE TRIGGER prrm_append_only BEFORE UPDATE OR DELETE ON public.pharmacy_roster_reminders
  FOR EACH ROW EXECUTE FUNCTION public.block_modify_append_only();

-- Gazetted days (Eid al-Fitr, Eid al-Adha, one-offs). Fixed days and Easter are computed in code.
CREATE TABLE IF NOT EXISTS public.public_holidays (
  day date PRIMARY KEY,
  name text NOT NULL CHECK (char_length(name) BETWEEN 2 AND 80),
  confirmed boolean NOT NULL DEFAULT false,
  recorded_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  recorded_at timestamptz NOT NULL DEFAULT now()
);

-- ─── 9. The duty roster's rules ──────────────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS pdr_one_duty ON public.pharmacy_duty_roster (hospital_id, user_id, date_from, shift)
  WHERE ended_at IS NULL AND date_from = date_to;

CREATE OR REPLACE FUNCTION private.pharmacy_duty_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE
  person public.pharmacy_roster_people; lic date; cap int; taken int; place_kind text;
  via boolean := coalesce(current_setting('pharmacy.roster_via', true) = 'request', false);
  actor uuid := CASE WHEN TG_OP = 'INSERT' THEN NEW.created_by ELSE NEW.ended_by END;
BEGIN
  -- Hospitals that have not listed their people keep the 0265 behaviour.
  IF NOT EXISTS (SELECT 1 FROM public.pharmacy_roster_people p WHERE p.hospital_id = NEW.hospital_id) THEN RETURN NEW; END IF;
  IF NEW.date_from <> NEW.date_to OR NEW.location_id IS NULL THEN
    IF TG_OP = 'UPDATE' THEN RETURN NEW; END IF;  -- ending a 0265 range line
    RAISE EXCEPTION 'pharmacy_duty_roster: one duty is one date at one place' USING ERRCODE = 'check_violation';
  END IF;
  SELECT kind INTO place_kind FROM public.pharmacy_locations WHERE id = NEW.location_id AND hospital_id = NEW.hospital_id;
  IF place_kind IS NULL OR place_kind NOT IN ('store','dispensing_point') THEN
    RAISE EXCEPTION 'pharmacy_duty_roster: only pharmacy places are rostered here' USING ERRCODE = 'check_violation';
  END IF;
  IF NOT via AND NOT private.pharmacy_roster_maker(NEW.hospital_id, actor, NEW.location_id, false) THEN
    RAISE EXCEPTION 'pharmacy_duty_roster: you are not making the roster for this place'
      USING ERRCODE = 'check_violation', HINT = 'roster_view_only';
  END IF;
  IF NOT via AND private.pharmacy_week_published(NEW.hospital_id, NEW.date_from) THEN
    RAISE EXCEPTION 'pharmacy_duty_roster: this week is published' USING ERRCODE = 'check_violation', HINT = 'roster_locked';
  END IF;
  IF TG_OP = 'UPDATE' THEN RETURN NEW; END IF;

  SELECT * INTO person FROM public.pharmacy_roster_people
   WHERE hospital_id = NEW.hospital_id AND user_id = NEW.user_id AND ended_at IS NULL;
  IF person.id IS NULL OR NOT (NEW.location_id = ANY (person.places)) THEN
    RAISE EXCEPTION 'pharmacy_duty_roster: not listed at this place' USING ERRCODE = 'check_violation', HINT = 'roster_place';
  END IF;
  IF EXISTS (SELECT 1 FROM public.pharmacy_staff_leave l WHERE l.hospital_id = NEW.hospital_id AND l.user_id = NEW.user_id
              AND l.status = 'approved' AND NEW.date_from BETWEEN l.date_from AND l.date_to) THEN
    RAISE EXCEPTION 'pharmacy_duty_roster: on leave' USING ERRCODE = 'check_violation', HINT = 'roster_leave';
  END IF;
  IF person.cadre <> 'store_keeper' THEN
    SELECT expires_on INTO lic FROM public.pharmacy_staff_licences
     WHERE hospital_id = NEW.hospital_id AND user_id = NEW.user_id ORDER BY recorded_at DESC LIMIT 1;
    IF lic IS NULL OR lic < NEW.date_from THEN
      RAISE EXCEPTION 'pharmacy_duty_roster: licence expired or not recorded'
        USING ERRCODE = 'check_violation', HINT = 'roster_licence';
    END IF;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext(NEW.location_id::text || NEW.date_from::text || NEW.shift));
  cap := CASE WHEN NEW.shift = 'call' THEN 1
              ELSE private.pharmacy_rule_n(NEW.hospital_id, 'roster', 'per_shift', 2)::int END;
  SELECT count(*) INTO taken FROM public.pharmacy_duty_roster
   WHERE hospital_id = NEW.hospital_id AND location_id = NEW.location_id AND shift = NEW.shift
     AND ended_at IS NULL AND date_from = NEW.date_from AND date_to = NEW.date_from;
  IF taken >= cap THEN
    RAISE EXCEPTION 'pharmacy_duty_roster: the shift is full' USING ERRCODE = 'check_violation', HINT = 'roster_full';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS pdr_rules ON public.pharmacy_duty_roster;
CREATE TRIGGER pdr_rules BEFORE INSERT OR UPDATE ON public.pharmacy_duty_roster
  FOR EACH ROW EXECUTE FUNCTION private.pharmacy_duty_guard();

-- ─── 10. Staff reminders in the SMS queue ────────────────────────────────
DO $$
DECLARE rules text := $r$('refill_due','refill_missed','course','epi_tomorrow','epi_defaulter',
  'staff_eve','staff_change','staff_unpub','staff_licence')$r$;
BEGIN
  ALTER TABLE public.pharmacy_sms_rules DROP CONSTRAINT IF EXISTS pharmacy_sms_rules_rule_check;
  EXECUTE 'ALTER TABLE public.pharmacy_sms_rules ADD CONSTRAINT pharmacy_sms_rules_rule_check CHECK (rule IN ' || rules || ')';
  ALTER TABLE public.pharmacy_sms_messages DROP CONSTRAINT IF EXISTS pharmacy_sms_messages_rule_check;
  EXECUTE 'ALTER TABLE public.pharmacy_sms_messages ADD CONSTRAINT pharmacy_sms_messages_rule_check CHECK (rule IN ' || rules || ')';
END $$;

-- ─── Append-only, audit, RLS ─────────────────────────────────────────────
DROP TRIGGER IF EXISTS psl_append_only ON public.pharmacy_staff_licences;
CREATE TRIGGER psl_append_only BEFORE UPDATE OR DELETE ON public.pharmacy_staff_licences
  FOR EACH ROW EXECUTE FUNCTION public.block_modify_append_only();
DROP TRIGGER IF EXISTS prwe_append_only ON public.pharmacy_roster_week_events;
CREATE TRIGGER prwe_append_only BEFORE UPDATE OR DELETE ON public.pharmacy_roster_week_events
  FOR EACH ROW EXECUTE FUNCTION public.block_modify_append_only();
CREATE OR REPLACE FUNCTION private.pharmacy_roster_people_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'pharmacy_roster_people: ended, never deleted'; END IF;
  IF OLD.ended_at IS NOT NULL OR NEW.ended_at IS NULL
     OR (to_jsonb(NEW) - 'ended_at' - 'ended_by') <> (to_jsonb(OLD) - 'ended_at' - 'ended_by') THEN
    RAISE EXCEPTION 'pharmacy_roster_people: only ending a row changes it';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS prpe_guard ON public.pharmacy_roster_people;
CREATE TRIGGER prpe_guard BEFORE UPDATE OR DELETE ON public.pharmacy_roster_people
  FOR EACH ROW EXECUTE FUNCTION private.pharmacy_roster_people_guard();

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['pharmacy_roster_people','pharmacy_staff_licences','pharmacy_roster_delegations',
    'pharmacy_roster_week_events','pharmacy_staff_leave','pharmacy_roster_requests','pharmacy_shift_attendance',
    'pharmacy_roster_reminders'] LOOP
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

ALTER TABLE public.pharmacy_roster_request_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pharmacy_roster_request_events FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.pharmacy_roster_request_events FROM anon, authenticated;
GRANT SELECT ON public.pharmacy_roster_request_events TO medsync_clinical_reader;
DROP POLICY IF EXISTS pharmacy_roster_request_events_select ON public.pharmacy_roster_request_events;
CREATE POLICY pharmacy_roster_request_events_select ON public.pharmacy_roster_request_events FOR SELECT
  TO medsync_clinical_reader
  USING (EXISTS (SELECT 1 FROM public.pharmacy_roster_requests r WHERE r.id = request_id
    AND r.hospital_id = (SELECT private.current_hospital_id())) AND (SELECT private.pharmacy_can('pharmacy.view')));

ALTER TABLE public.public_holidays ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.public_holidays FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.public_holidays FROM anon, authenticated;
GRANT SELECT ON public.public_holidays TO medsync_clinical_reader;
DROP POLICY IF EXISTS public_holidays_select ON public.public_holidays;
CREATE POLICY public_holidays_select ON public.public_holidays FOR SELECT TO medsync_clinical_reader USING (true);
