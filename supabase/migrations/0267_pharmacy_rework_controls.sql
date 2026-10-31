-- 0267 — Pharmacy rework, P3 Controls (docs/pharmacy/rework/PRD.md §5 S1, S3, S4, S7–S9; §6.5; TECH-SPEC §2.2, §7 tests 5–6).
--
-- GATED: owner-applied (`npm run db:migrate`), after 0265 (and 0266 when the lead's P2 migration ships).
--
--   1. pharmacy_cd_doses: the controlled dose beside its ledger line(s) (`ward_used`, source_id = the dose): patient,
--      prescriber, who gave it, dose and route, residue and its disposal. The register is the ledger itself.
--      pharmacy_controlled_entries is left as it is: its kind and witness CHECKs are 0127's dispensing-point supply
--      record, and rewriting them would change that record's rules.
--   2. pharmacy_cd_events: what is added to a dose line afterwards, never by editing it: a witness added late (one
--      fresh approval, S3), a residue disposal recorded late, an early dose reviewed, a paper witness checked.
--   3. pharmacy_cd_checks (+ lines): a blind balance check with a witness (a phone approval, a paper name, or the
--      incoming person of an accepted shift handover). A line that does not match opens a case (High, 24 h).
--   4. pharmacy_control_resolutions: how a difference was closed (recounted, late entry, confirmed loss or excess),
--      for a balance check line or a shift handover line. A loss or excess is the in-charge's, with an incident number.
--      Closing a difference marks its case "number fixed".
--   5. pharmacy_shift_handovers (+ lines, items) and pharmacy_shift_handover_misses: the station handover. Only the
--      person's own station unless they are the in-charge (S9, PRD §2 station rule), checked here and in the app.
--      Accepting a handover with controlled lines writes a balance check; other differences open a case.
--      (`pharmacy_handovers` is the patient hand-over, 0126.)
--   6. pharmacy_cases (+ events): investigations. Severity sets the deadline (controlled High 24 h, high-risk Medium
--      48 h, others Low 72 h). Every change names who made it (`changed_by`); assigning, sending back and signing off
--      are the in-charge's; submitting needs the number fixed (derived cases), a cause and an action; signing off
--      needs a submission. A person signs off their own submission only when they are the only in-charge, and the
--      case is then flagged (`self_signed`). Events are append-only.
--
-- ADDITIVE and re-runnable. No client grants: the server writes; readers see their own hospital (the 0180 pattern).
-- Reverse: DROP the tables and functions named above.

-- ─── 0. Helpers ─────────────────────────────────────────────────────────
-- A medicine is controlled here when its product carries the class, or the signed controlled set names it (0265 §1).
CREATE OR REPLACE FUNCTION private.pharmacy_medicine_controlled(p_hospital uuid, p_medicine text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM public.pharmacy_products p
                  WHERE p.hospital_id = p_hospital AND p.medicine_id = p_medicine AND p.controlled_class IS NOT NULL)
      OR EXISTS (SELECT 1 FROM public.pharmacy_signed_sets s
                  WHERE s.hospital_id = p_hospital AND s.kind = 'controlled_classes' AND s.status = 'signed'
                    AND coalesce(s.content ->> p_medicine, 'not_controlled') <> 'not_controlled');
$$;

-- The in-charge: the pharmacy head (`pharmacy.manage`) or an in-charge line on today's duty roster.
CREATE OR REPLACE FUNCTION private.pharmacy_is_in_charge(p_user uuid, p_hospital uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT p_user IS NOT NULL AND (
    private.pharmacy_can_user(p_user, p_hospital, 'pharmacy.manage')
    OR EXISTS (SELECT 1 FROM public.pharmacy_duty_roster r
                WHERE r.hospital_id = p_hospital AND r.user_id = p_user AND r.role = 'in_charge' AND r.ended_at IS NULL
                  AND (now() AT TIME ZONE 'Africa/Kampala')::date BETWEEN r.date_from AND r.date_to));
$$;

-- How many people are in-charge at the hospital today (S9: self sign-off only when there is one).
CREATE OR REPLACE FUNCTION private.pharmacy_in_charge_count(p_hospital uuid) RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT count(DISTINCT u)::int FROM (
    SELECT h.user_id AS u FROM public.department_heads h
     WHERE h.hospital_id = p_hospital AND private.pharmacy_can_user(h.user_id, p_hospital, 'pharmacy.manage')
    UNION
    SELECT r.user_id FROM public.pharmacy_duty_roster r
     WHERE r.hospital_id = p_hospital AND r.role = 'in_charge' AND r.ended_at IS NULL
       AND (now() AT TIME ZONE 'Africa/Kampala')::date BETWEEN r.date_from AND r.date_to) x;
$$;

-- A person's own station: on today's roster at that place (a whole-pharmacy line covers the pharmacy's own places),
-- affiliated to the place's department, or holding a ward right there.
CREATE OR REPLACE FUNCTION private.pharmacy_own_station(p_user uuid, p_hospital uuid, p_place uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
      SELECT 1 FROM public.pharmacy_duty_roster r JOIN public.pharmacy_locations l ON l.id = p_place
       WHERE r.hospital_id = p_hospital AND r.user_id = p_user AND r.ended_at IS NULL
         AND (now() AT TIME ZONE 'Africa/Kampala')::date BETWEEN r.date_from AND r.date_to + 1
         AND (r.location_id = p_place OR (r.location_id IS NULL AND l.kind IN ('store','dispensing_point'))))
    OR EXISTS (
      SELECT 1 FROM public.staff_affiliations sa JOIN public.pharmacy_locations l ON l.department_id = sa.department_id
       WHERE sa.user_id = p_user AND sa.hospital_id = p_hospital AND l.id = p_place
         AND sa.state IN ('approved','active'))
    OR private.pharmacy_location_right(p_user, p_place, 'ward_read');
$$;

-- ─── 1. Doses ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pharmacy_cd_doses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  location_id uuid NOT NULL REFERENCES public.pharmacy_locations(id) ON DELETE RESTRICT,
  medicine_id text NOT NULL CHECK (char_length(medicine_id) BETWEEN 1 AND 120),
  patient_user_id uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  -- As the register shows it: the patient's name and number, or what was typed for someone not listed.
  patient_label text NOT NULL CHECK (char_length(patient_label) BETWEEN 2 AND 160),
  bed text CHECK (bed IS NULL OR char_length(bed) BETWEEN 1 AND 40),
  prescriber_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  -- NULL: the person who recorded it gave it.
  given_by_user_id uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  dose_mg numeric(10,2) NOT NULL CHECK (dose_mg > 0),
  route text NOT NULL CHECK (char_length(route) BETWEEN 1 AND 20),
  units integer NOT NULL CHECK (units > 0),
  residue_mg numeric(10,2) NOT NULL DEFAULT 0 CHECK (residue_mg >= 0),
  residue_disposed boolean NOT NULL,
  -- A dose entered after a count found it missing (S8). The movement's own `late` says by how much.
  late_entry boolean NOT NULL DEFAULT false,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pcdd_residue CHECK (residue_mg > 0 OR residue_disposed)
);
CREATE INDEX IF NOT EXISTS pcdd_place ON public.pharmacy_cd_doses (hospital_id, location_id, medicine_id, created_at);
CREATE INDEX IF NOT EXISTS pcdd_patient ON public.pharmacy_cd_doses (hospital_id, medicine_id, patient_label);

-- ─── 2. Afterwards, never by editing ────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pharmacy_cd_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  movement_id uuid NOT NULL REFERENCES public.pharmacy_stock_movements(id) ON DELETE RESTRICT,
  kind text NOT NULL CHECK (kind IN ('witness_added','residue_recorded','early_reviewed','paper_checked')),
  witness_attestation_id uuid REFERENCES public.pharmacy_attestations(id) ON DELETE RESTRICT,
  reason text CHECK (reason IS NULL OR char_length(reason) BETWEEN 2 AND 200),
  actor_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pcde_witness CHECK (kind NOT IN ('witness_added','residue_recorded') OR witness_attestation_id IS NOT NULL),
  CONSTRAINT pcde_reason CHECK (kind <> 'early_reviewed' OR reason IS NOT NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS pcde_once ON public.pharmacy_cd_events (movement_id, kind);

CREATE OR REPLACE FUNCTION private.pharmacy_cd_event_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE _place uuid;
BEGIN
  SELECT coalesce(location_id, dispensing_point_id) INTO _place FROM public.pharmacy_stock_movements
   WHERE id = NEW.movement_id AND hospital_id = NEW.hospital_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'pharmacy_cd: that line is not at this hospital'; END IF;
  IF NEW.kind = 'paper_checked' AND NOT private.pharmacy_is_in_charge(NEW.actor_user_id, NEW.hospital_id) THEN
    RAISE EXCEPTION 'pharmacy_cd: only the in-charge checks a paper witness' USING ERRCODE = 'P0001', HINT = 'in_charge_only';
  END IF;
  IF NEW.witness_attestation_id IS NOT NULL THEN
    PERFORM private.pharmacy_use_attestation(NEW.witness_attestation_id, NEW.hospital_id, NEW.actor_user_id, _place,
      'controlled:' || NEW.kind);
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS pcde_guard ON public.pharmacy_cd_events;
CREATE TRIGGER pcde_guard BEFORE INSERT ON public.pharmacy_cd_events
  FOR EACH ROW EXECUTE FUNCTION private.pharmacy_cd_event_guard();

-- ─── 5a. Shift handovers (before the checks, which name them) ───────────
CREATE TABLE IF NOT EXISTS public.pharmacy_shift_handovers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  location_id uuid NOT NULL REFERENCES public.pharmacy_locations(id) ON DELETE RESTRICT,
  -- The 08:00 or 17:00 slot it answers; NULL is a mid-shift handover.
  slot_at timestamptz,
  from_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  to_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  keys_handed boolean NOT NULL,
  seal_no text CHECK (seal_no IS NULL OR char_length(seal_no) BETWEEN 2 AND 40),
  seal_new boolean NOT NULL DEFAULT false,
  fridge_temp numeric(4,1),
  notes text CHECK (notes IS NULL OR char_length(notes) BETWEEN 1 AND 1000),
  created_at timestamptz NOT NULL DEFAULT now(),
  accepted_at timestamptz,
  CONSTRAINT psh_two_people CHECK (from_user_id <> to_user_id)
);
CREATE INDEX IF NOT EXISTS psh_place ON public.pharmacy_shift_handovers (hospital_id, location_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.pharmacy_shift_handover_lines (
  handover_id uuid NOT NULL REFERENCES public.pharmacy_shift_handovers(id) ON DELETE RESTRICT,
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  medicine_id text NOT NULL CHECK (char_length(medicine_id) BETWEEN 1 AND 120),
  -- Counted for being high-risk ward stock (the signed list); controlled is read from the medicine.
  high_risk boolean NOT NULL DEFAULT false,
  expected integer NOT NULL,
  counted integer NOT NULL CHECK (counted >= 0),
  PRIMARY KEY (handover_id, medicine_id)
);

CREATE TABLE IF NOT EXISTS public.pharmacy_shift_handover_items (
  handover_id uuid NOT NULL REFERENCES public.pharmacy_shift_handovers(id) ON DELETE RESTRICT,
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  n integer NOT NULL CHECK (n >= 0),
  text text NOT NULL CHECK (char_length(text) BETWEEN 2 AND 300),
  seen_at timestamptz NOT NULL,
  PRIMARY KEY (handover_id, n)
);

CREATE TABLE IF NOT EXISTS public.pharmacy_shift_handover_misses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  location_id uuid NOT NULL REFERENCES public.pharmacy_locations(id) ON DELETE RESTRICT,
  slot_at timestamptz NOT NULL,
  why text NOT NULL CHECK (why IN ('paper','covered','not_done')),
  note text CHECK (note IS NULL OR char_length(note) BETWEEN 3 AND 500),
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pshm_note CHECK (why <> 'not_done' OR note IS NOT NULL),
  CONSTRAINT pshm_once UNIQUE (location_id, slot_at)
);

-- The station rule (PRD §2): the outgoing person hands over their own station, unless they are the in-charge.
-- A miss is explained at the place's own station or by the in-charge. Accepting changes only `accepted_at`, once.
CREATE OR REPLACE FUNCTION private.pharmacy_shift_handover_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'pharmacy_shift_handovers: never deleted'; END IF;
  IF TG_OP = 'UPDATE' THEN
    IF OLD.accepted_at IS NOT NULL OR NEW.accepted_at IS NULL
       OR (to_jsonb(NEW) - 'accepted_at') <> (to_jsonb(OLD) - 'accepted_at') THEN
      RAISE EXCEPTION 'pharmacy_shift_handovers: a handover is accepted once, and nothing else changes';
    END IF;
    RETURN NEW;
  END IF;
  IF NOT private.pharmacy_is_in_charge(NEW.from_user_id, NEW.hospital_id)
     AND NOT private.pharmacy_own_station(NEW.from_user_id, NEW.hospital_id, NEW.location_id) THEN
    RAISE EXCEPTION 'pharmacy_shift_handovers: you hand over only your own station'
      USING ERRCODE = 'P0001', HINT = 'not_your_station';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS psh_guard ON public.pharmacy_shift_handovers;
CREATE TRIGGER psh_guard BEFORE INSERT OR UPDATE OR DELETE ON public.pharmacy_shift_handovers
  FOR EACH ROW EXECUTE FUNCTION private.pharmacy_shift_handover_guard();

CREATE OR REPLACE FUNCTION private.pharmacy_shift_miss_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF NOT private.pharmacy_is_in_charge(NEW.created_by, NEW.hospital_id)
     AND NOT private.pharmacy_own_station(NEW.created_by, NEW.hospital_id, NEW.location_id) THEN
    RAISE EXCEPTION 'pharmacy_shift_handovers: a missed handover is explained at its own station or by the in-charge'
      USING ERRCODE = 'P0001', HINT = 'not_your_station';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS pshm_guard ON public.pharmacy_shift_handover_misses;
CREATE TRIGGER pshm_guard BEFORE INSERT ON public.pharmacy_shift_handover_misses
  FOR EACH ROW EXECUTE FUNCTION private.pharmacy_shift_miss_guard();

-- ─── 3. Balance checks ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pharmacy_cd_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  location_id uuid NOT NULL REFERENCES public.pharmacy_locations(id) ON DELETE RESTRICT,
  checked_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  witness_attestation_id uuid REFERENCES public.pharmacy_attestations(id) ON DELETE RESTRICT,
  paper_witness_name text CHECK (paper_witness_name IS NULL OR char_length(paper_witness_name) BETWEEN 2 AND 120),
  shift_handover_id uuid REFERENCES public.pharmacy_shift_handovers(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pcdc_witnessed CHECK (num_nonnulls(witness_attestation_id, paper_witness_name, shift_handover_id) >= 1)
);
CREATE INDEX IF NOT EXISTS pcdc_place ON public.pharmacy_cd_checks (hospital_id, location_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS pcdc_one_per_handover ON public.pharmacy_cd_checks (shift_handover_id)
  WHERE shift_handover_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.pharmacy_cd_check_lines (
  check_id uuid NOT NULL REFERENCES public.pharmacy_cd_checks(id) ON DELETE RESTRICT,
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  medicine_id text NOT NULL CHECK (char_length(medicine_id) BETWEEN 1 AND 120),
  expected integer NOT NULL,
  counted integer NOT NULL CHECK (counted >= 0),
  PRIMARY KEY (check_id, medicine_id)
);

CREATE OR REPLACE FUNCTION private.pharmacy_cd_check_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.witness_attestation_id IS NOT NULL THEN
    PERFORM private.pharmacy_use_attestation(NEW.witness_attestation_id, NEW.hospital_id, NEW.checked_by,
      NEW.location_id, 'controlled:cd_check');
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS pcdc_guard ON public.pharmacy_cd_checks;
CREATE TRIGGER pcdc_guard BEFORE INSERT ON public.pharmacy_cd_checks
  FOR EACH ROW EXECUTE FUNCTION private.pharmacy_cd_check_guard();

-- ─── 6. Cases ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pharmacy_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  source_type text NOT NULL CHECK (source_type IN ('cd_check','handover','count','manual')),
  source_id uuid,
  medicine_id text NOT NULL CHECK (char_length(medicine_id) BETWEEN 1 AND 120),
  location_id uuid NOT NULL REFERENCES public.pharmacy_locations(id) ON DELETE RESTRICT,
  -- Counted minus expected; 0 for a report by hand that a count would not show.
  qty integer NOT NULL,
  what text CHECK (what IS NULL OR char_length(what) BETWEEN 2 AND 200),
  severity text NOT NULL CHECK (severity IN ('high','medium','low')),
  due_at timestamptz NOT NULL,
  owner_user_id uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  assigned_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  assigned_at timestamptz,
  fixed_at timestamptz,
  findings jsonb,
  submitted_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  submitted_at timestamptz,
  signed_off_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  signed_off_at timestamptz,
  self_signed boolean NOT NULL DEFAULT false,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  -- Who made the last change; every update names them.
  changed_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  CONSTRAINT pcs_manual CHECK ((source_type = 'manual') = (source_id IS NULL) AND (source_type <> 'manual' OR what IS NOT NULL)),
  CONSTRAINT pcs_submitted CHECK ((submitted_at IS NULL) = (submitted_by IS NULL)),
  CONSTRAINT pcs_signed CHECK ((signed_off_at IS NULL) = (signed_off_by IS NULL) AND (signed_off_at IS NULL OR submitted_at IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS pcs_one_per_source ON public.pharmacy_cases (source_type, source_id, medicine_id)
  WHERE source_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS pcase_open ON public.pharmacy_cases (hospital_id, created_at DESC) WHERE signed_off_at IS NULL;

CREATE TABLE IF NOT EXISTS public.pharmacy_case_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  case_id uuid NOT NULL REFERENCES public.pharmacy_cases(id) ON DELETE RESTRICT,
  kind text NOT NULL CHECK (kind IN ('opened','assigned','taken','step','fixed','submitted','sent_back','escalated',
    'signed_off')),
  what text CHECK (what IS NULL OR char_length(what) BETWEEN 2 AND 200),
  note text CHECK (note IS NULL OR char_length(note) BETWEEN 1 AND 1000),
  actor_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pce_case ON public.pharmacy_case_events (case_id, created_at);

-- Severity sets the deadline (PRD §6.5): High 24 h, Medium 48 h, Low 72 h. Mirrored for display in the app's RULES.
CREATE OR REPLACE FUNCTION private.pharmacy_case_hours(p_severity text) RETURNS integer
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE p_severity WHEN 'high' THEN 24 WHEN 'medium' THEN 48 ELSE 72 END;
$$;

CREATE OR REPLACE FUNCTION private.pharmacy_open_case(p_hospital uuid, p_source text, p_source_id uuid, p_medicine text,
  p_place uuid, p_qty integer, p_severity text, p_by uuid, p_at timestamptz) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE _id uuid;
BEGIN
  INSERT INTO public.pharmacy_cases (hospital_id, source_type, source_id, medicine_id, location_id, qty, severity,
    due_at, created_by, created_at)
  VALUES (p_hospital, p_source, p_source_id, p_medicine, p_place, p_qty, p_severity,
    p_at + make_interval(hours => private.pharmacy_case_hours(p_severity)), p_by, p_at)
  ON CONFLICT DO NOTHING RETURNING id INTO _id;
  IF _id IS NOT NULL THEN
    INSERT INTO public.pharmacy_case_events (hospital_id, case_id, kind, actor_user_id, created_at)
    VALUES (p_hospital, _id, 'opened', p_by, p_at);
  END IF;
  RETURN _id;
END;
$$;

-- A balance check line that does not match opens a High case (controlled).
CREATE OR REPLACE FUNCTION private.pharmacy_cd_line_case() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE _c public.pharmacy_cd_checks;
BEGIN
  IF NEW.counted = NEW.expected THEN RETURN NEW; END IF;
  SELECT * INTO _c FROM public.pharmacy_cd_checks WHERE id = NEW.check_id;
  PERFORM private.pharmacy_open_case(_c.hospital_id, 'cd_check', _c.id, NEW.medicine_id, _c.location_id,
    NEW.counted - NEW.expected, 'high', _c.checked_by, _c.created_at);
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS pcdl_case ON public.pharmacy_cd_check_lines;
CREATE TRIGGER pcdl_case AFTER INSERT ON public.pharmacy_cd_check_lines
  FOR EACH ROW EXECUTE FUNCTION private.pharmacy_cd_line_case();

-- Accepting a handover: its controlled lines become a balance check (witnessed by the incoming person); its other
-- differences open a case (high-risk Medium, others Low). Controlled differences open theirs through the check.
CREATE OR REPLACE FUNCTION private.pharmacy_shift_handover_accepted() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE _check uuid; _l record;
BEGIN
  IF OLD.accepted_at IS NOT NULL OR NEW.accepted_at IS NULL THEN RETURN NEW; END IF;
  IF EXISTS (SELECT 1 FROM public.pharmacy_shift_handover_lines l WHERE l.handover_id = NEW.id
              AND private.pharmacy_medicine_controlled(NEW.hospital_id, l.medicine_id)) THEN
    INSERT INTO public.pharmacy_cd_checks (hospital_id, location_id, checked_by, shift_handover_id, created_at)
    VALUES (NEW.hospital_id, NEW.location_id, NEW.from_user_id, NEW.id, NEW.accepted_at) RETURNING id INTO _check;
    INSERT INTO public.pharmacy_cd_check_lines (check_id, hospital_id, medicine_id, expected, counted)
    SELECT _check, NEW.hospital_id, l.medicine_id, l.expected, l.counted
      FROM public.pharmacy_shift_handover_lines l
     WHERE l.handover_id = NEW.id AND private.pharmacy_medicine_controlled(NEW.hospital_id, l.medicine_id);
  END IF;
  FOR _l IN SELECT * FROM public.pharmacy_shift_handover_lines l
             WHERE l.handover_id = NEW.id AND l.counted <> l.expected
               AND NOT private.pharmacy_medicine_controlled(NEW.hospital_id, l.medicine_id) LOOP
    PERFORM private.pharmacy_open_case(NEW.hospital_id, 'handover', NEW.id, _l.medicine_id, NEW.location_id,
      _l.counted - _l.expected, CASE WHEN _l.high_risk THEN 'medium' ELSE 'low' END, NEW.to_user_id, NEW.accepted_at);
  END LOOP;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS psh_accepted ON public.pharmacy_shift_handovers;
CREATE TRIGGER psh_accepted AFTER UPDATE ON public.pharmacy_shift_handovers
  FOR EACH ROW EXECUTE FUNCTION private.pharmacy_shift_handover_accepted();

-- The case's rules (S9): who may change what, and what each step needs.
CREATE OR REPLACE FUNCTION private.pharmacy_case_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE
  _who uuid := NEW.changed_by;
  _boss boolean;
  _findings_ok boolean := NEW.findings IS NOT NULL AND coalesce(NEW.findings ->> 'cause', '') <> ''
    AND jsonb_typeof(NEW.findings -> 'actions') = 'array' AND jsonb_array_length(NEW.findings -> 'actions') > 0;
  _fixed_ok boolean := NEW.source_type = 'manual' OR NEW.fixed_at IS NOT NULL;
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'pharmacy_cases: a case is never deleted'; END IF;
  IF OLD.signed_off_at IS NOT NULL THEN RAISE EXCEPTION 'pharmacy_cases: a signed-off case never changes'; END IF;
  IF (to_jsonb(NEW) - ARRAY['due_at','owner_user_id','assigned_by','assigned_at','fixed_at','findings','submitted_by',
        'submitted_at','signed_off_by','signed_off_at','self_signed','changed_by'])
     <> (to_jsonb(OLD) - ARRAY['due_at','owner_user_id','assigned_by','assigned_at','fixed_at','findings','submitted_by',
        'submitted_at','signed_off_by','signed_off_at','self_signed','changed_by']) THEN
    RAISE EXCEPTION 'pharmacy_cases: what was found never changes';
  END IF;
  IF OLD.fixed_at IS NOT NULL AND NEW.fixed_at IS DISTINCT FROM OLD.fixed_at THEN
    RAISE EXCEPTION 'pharmacy_cases: the number is fixed once';
  END IF;
  -- Marking the number fixed is the database's own step (a resolution closed it); nothing else changes with it.
  IF OLD.fixed_at IS NULL AND NEW.fixed_at IS NOT NULL THEN RETURN NEW; END IF;
  IF _who IS NULL THEN RAISE EXCEPTION 'pharmacy_cases: every change names who made it'; END IF;
  _boss := private.pharmacy_is_in_charge(_who, NEW.hospital_id);

  IF NEW.owner_user_id IS DISTINCT FROM OLD.owner_user_id OR NEW.due_at <> OLD.due_at THEN
    IF NOT (_boss OR (OLD.owner_user_id IS NULL AND NEW.owner_user_id = _who)) THEN
      RAISE EXCEPTION 'pharmacy_cases: only the in-charge assigns a case' USING ERRCODE = 'P0001', HINT = 'in_charge_only';
    END IF;
  END IF;
  IF OLD.submitted_at IS NULL AND NEW.submitted_at IS NOT NULL THEN
    IF NOT (_boss OR NEW.owner_user_id = _who) OR NEW.submitted_by <> _who THEN
      RAISE EXCEPTION 'pharmacy_cases: the owner or the in-charge submits the findings';
    END IF;
    IF NOT _fixed_ok THEN
      RAISE EXCEPTION 'pharmacy_cases: fix the number at the source first' USING ERRCODE = 'P0001', HINT = 'not_fixed';
    END IF;
    IF NOT _findings_ok THEN
      RAISE EXCEPTION 'pharmacy_cases: findings need a cause and an action' USING ERRCODE = 'P0001', HINT = 'no_findings';
    END IF;
  ELSIF OLD.submitted_at IS NOT NULL AND NEW.submitted_at IS NULL AND NOT _boss THEN
    RAISE EXCEPTION 'pharmacy_cases: only the in-charge sends a case back' USING ERRCODE = 'P0001', HINT = 'in_charge_only';
  END IF;
  IF NEW.signed_off_at IS NOT NULL THEN
    IF NOT _boss OR NEW.signed_off_by <> _who THEN
      RAISE EXCEPTION 'pharmacy_cases: only the in-charge signs a case off' USING ERRCODE = 'P0001', HINT = 'in_charge_only';
    END IF;
    IF NOT _fixed_ok OR NOT _findings_ok THEN
      RAISE EXCEPTION 'pharmacy_cases: sign-off needs the number fixed and the findings'
        USING ERRCODE = 'P0001', HINT = 'not_ready';
    END IF;
    IF NEW.submitted_by = _who THEN
      IF private.pharmacy_in_charge_count(NEW.hospital_id) > 1 THEN
        RAISE EXCEPTION 'pharmacy_cases: another in-charge signs off what you submitted'
          USING ERRCODE = 'P0001', HINT = 'own_submission';
      END IF;
      NEW.self_signed := true;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS pcs_guard ON public.pharmacy_cases;
CREATE TRIGGER pcs_guard BEFORE UPDATE OR DELETE ON public.pharmacy_cases
  FOR EACH ROW EXECUTE FUNCTION private.pharmacy_case_guard();

-- ─── 4. Resolutions ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pharmacy_control_resolutions (
  source_type text NOT NULL CHECK (source_type IN ('cd_check','handover')),
  source_id uuid NOT NULL,
  medicine_id text NOT NULL,
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  how text NOT NULL CHECK (how IN ('recount','late_entry','loss','excess')),
  why text CHECK (why IS NULL OR char_length(why) BETWEEN 2 AND 200),
  note text CHECK (note IS NULL OR char_length(note) BETWEEN 1 AND 500),
  incident_ref text CHECK (incident_ref IS NULL OR char_length(incident_ref) BETWEEN 3 AND 60),
  -- The late entry's dose (controlled) or ledger line (high-risk), or the loss/excess line.
  dose_id uuid REFERENCES public.pharmacy_cd_doses(id) ON DELETE RESTRICT,
  movement_id uuid REFERENCES public.pharmacy_stock_movements(id) ON DELETE RESTRICT,
  witness_attestation_id uuid REFERENCES public.pharmacy_attestations(id) ON DELETE RESTRICT,
  resolved_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  resolved_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (source_type, source_id, medicine_id),
  CONSTRAINT pcr_incident CHECK (how NOT IN ('loss','excess') OR (incident_ref IS NOT NULL AND movement_id IS NOT NULL)),
  CONSTRAINT pcr_late CHECK (how <> 'late_entry' OR dose_id IS NOT NULL OR movement_id IS NOT NULL)
);

CREATE OR REPLACE FUNCTION private.pharmacy_resolution_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE _place uuid; _diff integer;
BEGIN
  IF NEW.source_type = 'cd_check' THEN
    SELECT c.location_id, l.counted - l.expected INTO _place, _diff
      FROM public.pharmacy_cd_checks c JOIN public.pharmacy_cd_check_lines l ON l.check_id = c.id
     WHERE c.id = NEW.source_id AND l.medicine_id = NEW.medicine_id AND c.hospital_id = NEW.hospital_id;
    IF NEW.witness_attestation_id IS NULL THEN
      RAISE EXCEPTION 'pharmacy_cd: a controlled difference closes only with a witness'
        USING ERRCODE = 'P0001', HINT = 'witness_needed';
    END IF;
  ELSE
    SELECT h.location_id, l.counted - l.expected INTO _place, _diff
      FROM public.pharmacy_shift_handovers h JOIN public.pharmacy_shift_handover_lines l ON l.handover_id = h.id
     WHERE h.id = NEW.source_id AND l.medicine_id = NEW.medicine_id AND h.hospital_id = NEW.hospital_id;
  END IF;
  IF _place IS NULL OR _diff = 0 THEN RAISE EXCEPTION 'pharmacy_cd: there is no difference to close here'; END IF;
  IF NEW.how IN ('loss','excess') AND NOT private.pharmacy_is_in_charge(NEW.resolved_by, NEW.hospital_id) THEN
    RAISE EXCEPTION 'pharmacy_cd: only the in-charge confirms a loss' USING ERRCODE = 'P0001', HINT = 'in_charge_only';
  END IF;
  IF (NEW.how = 'loss' AND _diff > 0) OR (NEW.how IN ('excess') AND _diff < 0) OR (NEW.how = 'late_entry' AND _diff > 0) THEN
    RAISE EXCEPTION 'pharmacy_cd: that does not explain this difference';
  END IF;
  IF NEW.witness_attestation_id IS NOT NULL THEN
    PERFORM private.pharmacy_use_attestation(NEW.witness_attestation_id, NEW.hospital_id, NEW.resolved_by, _place,
      'controlled:resolution');
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS pcr_guard ON public.pharmacy_control_resolutions;
CREATE TRIGGER pcr_guard BEFORE INSERT ON public.pharmacy_control_resolutions
  FOR EACH ROW EXECUTE FUNCTION private.pharmacy_resolution_guard();

-- Closing the difference fixes the case's number, and the fix shows on its timeline.
CREATE OR REPLACE FUNCTION private.pharmacy_resolution_fixes_case() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE _case uuid;
BEGIN
  UPDATE public.pharmacy_cases SET fixed_at = NEW.resolved_at
   WHERE source_type = NEW.source_type AND source_id = NEW.source_id AND medicine_id = NEW.medicine_id
     AND fixed_at IS NULL
  RETURNING id INTO _case;
  IF _case IS NOT NULL THEN
    INSERT INTO public.pharmacy_case_events (hospital_id, case_id, kind, what, actor_user_id, created_at)
    VALUES (NEW.hospital_id, _case, 'fixed', NEW.how, NEW.resolved_by, NEW.resolved_at);
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS pcr_fixes_case ON public.pharmacy_control_resolutions;
CREATE TRIGGER pcr_fixes_case AFTER INSERT ON public.pharmacy_control_resolutions
  FOR EACH ROW EXECUTE FUNCTION private.pharmacy_resolution_fixes_case();

-- ─── 7. Append-only, audit, RLS (the 0180 pattern) ─────────────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['pharmacy_cd_doses','pharmacy_cd_events','pharmacy_cd_checks','pharmacy_cd_check_lines',
    'pharmacy_control_resolutions','pharmacy_shift_handover_lines','pharmacy_shift_handover_items',
    'pharmacy_shift_handover_misses','pharmacy_case_events'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %1$s_append_only ON public.%1$I', t);
    EXECUTE format('CREATE TRIGGER %1$s_append_only BEFORE UPDATE OR DELETE ON public.%1$I
      FOR EACH ROW EXECUTE FUNCTION public.block_modify_append_only()', t);
  END LOOP;
  FOREACH t IN ARRAY ARRAY['pharmacy_cd_doses','pharmacy_cd_events','pharmacy_cd_checks','pharmacy_cd_check_lines',
    'pharmacy_control_resolutions','pharmacy_shift_handovers','pharmacy_shift_handover_lines',
    'pharmacy_shift_handover_items','pharmacy_shift_handover_misses','pharmacy_cases','pharmacy_case_events'] LOOP
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

REVOKE ALL ON FUNCTION private.pharmacy_medicine_controlled(uuid, text), private.pharmacy_is_in_charge(uuid, uuid),
  private.pharmacy_in_charge_count(uuid), private.pharmacy_own_station(uuid, uuid, uuid),
  private.pharmacy_open_case(uuid, text, uuid, text, uuid, integer, text, uuid, timestamptz) FROM PUBLIC;
