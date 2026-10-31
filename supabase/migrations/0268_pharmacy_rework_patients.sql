-- 0268 — Pharmacy rework, P4 patients and cold chain (docs/pharmacy/rework/PRD.md §6.3, §6.4 Cold chain; TECH-SPEC §2.2).
--
-- GATED: owner-applied (`npm run db:migrate`), after 0265.
--
--   1. Cold chain: pharmacy_fridges (a fridge at a place, with an optional per-fridge sensor key), its readings
--      (sensor or the am/pm paper chart; append-only), excursion acknowledgements (append-only) and what is kept in it
--      (a listing ends, never deletes).
--   2. Wards: pharmacy_round_picks (+ lines). A round or a patient pick is one issue (pharmacy_issues) to the ward;
--      these rows say which patient and prescription each quantity was for. Pharmacy notes on an inpatient.
--   3. Outpatients: the pill count brought back at a refill and antibiotic course check-ins (append-only). The refill
--      tables of 0230 stay the refill record.
--   4. Immunisation (no EMR register exists): the clinic's place, the vaccine products, clients, VVM readings, doses
--      and open multi-dose vials. A dose row must name its own ledger movement: one `ward_used` of 1 from the same
--      batch at the EPI clinic, made for this dose (source_kind 'adjustment', reason_code 'vaccinated', source_id =
--      the dose); an expired, recalled or VVM 3–4 batch is refused. So a recorded vaccination always takes one dose
--      off stock. Wastage leaves the ledger as `adjusted` with reason_code 'wastage:<cause>' (opened_vial, expired,
--      vvm, frozen, heat, damaged, recalled): an opened vial's leftover doses carry source_id = the vial, a fridge
--      discard source_id = the fridge. Records' losses read `reason_code LIKE 'wastage:%'`.
--   5. Reminders: SMS rules (versioned; the latest row per rule wins), messages (one per hospital, day and reason)
--      and opt-outs (by the phone's blind index).
--
-- ADDITIVE and re-runnable. No client grants: server writes; readers see their own hospital (the 0180 pattern).
-- Reverse: DROP the tables and functions named above.

-- ─── 1. Cold chain ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pharmacy_fridges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  location_id uuid NOT NULL REFERENCES public.pharmacy_locations(id) ON DELETE RESTRICT,
  code text NOT NULL CHECK (char_length(code) BETWEEN 1 AND 20),
  name text NOT NULL CHECK (char_length(name) BETWEEN 2 AND 120),
  model text CHECK (model IS NULL OR char_length(model) <= 120),
  -- sha256 hex of the sensor's own secret; NULL: no sensor, readings come from the paper chart only.
  sensor_key_hash text CHECK (sensor_key_hash IS NULL OR sensor_key_hash ~ '^[0-9a-f]{64}$'),
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz,
  UNIQUE (hospital_id, code)
);

CREATE TABLE IF NOT EXISTS public.pharmacy_fridge_readings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  fridge_id uuid NOT NULL REFERENCES public.pharmacy_fridges(id) ON DELETE RESTRICT,
  read_at timestamptz NOT NULL,
  temp_c numeric(4,1) NOT NULL CHECK (temp_c BETWEEN -40 AND 60),
  source text NOT NULL CHECK (source IN ('sensor','chart')),
  slot text CHECK (slot IS NULL OR slot IN ('am','pm')),
  freeze_indicator text CHECK (freeze_indicator IS NULL OR freeze_indicator IN ('ok','x')),
  initials text CHECK (initials IS NULL OR char_length(initials) BETWEEN 1 AND 6),
  recorded_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  -- A chart reading is a person's, with their initials and slot; a sensor reading is nobody's.
  CONSTRAINT pfr_source CHECK (
    (source = 'chart' AND recorded_by IS NOT NULL AND slot IS NOT NULL AND initials IS NOT NULL)
    OR (source = 'sensor' AND recorded_by IS NULL AND slot IS NULL AND freeze_indicator IS NULL)),
  CONSTRAINT pfr_not_future CHECK (read_at <= created_at + interval '5 minutes')
);
CREATE INDEX IF NOT EXISTS pfr_fridge_time ON public.pharmacy_fridge_readings (fridge_id, read_at);
-- One sensor sample per fridge per instant: a re-sent sample is not counted twice.
CREATE UNIQUE INDEX IF NOT EXISTS pfr_sensor_once ON public.pharmacy_fridge_readings (fridge_id, read_at)
  WHERE source = 'sensor';

CREATE TABLE IF NOT EXISTS public.pharmacy_excursion_acks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  fridge_id uuid NOT NULL REFERENCES public.pharmacy_fridges(id) ON DELETE RESTRICT,
  -- The excursion is named by its fridge and first reading outside 2–8 °C.
  excursion_start timestamptz NOT NULL,
  actions text[] NOT NULL CHECK (cardinality(actions) BETWEEN 1 AND 10),
  shake_test text CHECK (shake_test IS NULL OR shake_test IN ('passed','failed')),
  acted_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  acted_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (fridge_id, excursion_start)
);

CREATE TABLE IF NOT EXISTS public.pharmacy_fridge_contents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  fridge_id uuid NOT NULL REFERENCES public.pharmacy_fridges(id) ON DELETE RESTRICT,
  product_id uuid NOT NULL REFERENCES public.pharmacy_products(id) ON DELETE RESTRICT,
  added_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  added_at timestamptz NOT NULL DEFAULT now(),
  ended_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  ended_at timestamptz,
  CONSTRAINT pfc_end CHECK ((ended_at IS NULL) = (ended_by IS NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS pfc_one_listing ON public.pharmacy_fridge_contents (fridge_id, product_id)
  WHERE ended_at IS NULL;

-- Rows that change only by being ended (ended_at/ended_by, or discarded_*): one guard, given the columns.
CREATE OR REPLACE FUNCTION private.pharmacy_end_only_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE _cols text[] := TG_ARGV;
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION '%: rows are ended, never deleted', TG_TABLE_NAME; END IF;
  IF to_jsonb(OLD) ->> _cols[1] IS NOT NULL OR to_jsonb(NEW) ->> _cols[1] IS NULL
     OR (to_jsonb(NEW) - _cols) <> (to_jsonb(OLD) - _cols) THEN
    RAISE EXCEPTION '%: only ending a row changes it', TG_TABLE_NAME;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS pfc_guard ON public.pharmacy_fridge_contents;
CREATE TRIGGER pfc_guard BEFORE UPDATE OR DELETE ON public.pharmacy_fridge_contents
  FOR EACH ROW EXECUTE FUNCTION private.pharmacy_end_only_guard('ended_at', 'ended_by');

-- ─── 2. Wards ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pharmacy_round_picks (
  -- The client's key for the send: a replay finds this row.
  id uuid PRIMARY KEY,
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  ward_location_id uuid NOT NULL REFERENCES public.pharmacy_locations(id) ON DELETE RESTRICT,
  kind text NOT NULL CHECK (kind IN ('round','patient')),
  -- Hours ahead for a round (12, 24, 48); NULL for a patient pick (next 24 h or rest of course, chosen by quantity).
  window_h smallint CHECK (window_h IS NULL OR window_h IN (12, 24, 48)),
  issue_id uuid NOT NULL REFERENCES public.pharmacy_issues(id) ON DELETE RESTRICT,
  picked_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  picked_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT prp_window CHECK ((kind = 'round') = (window_h IS NOT NULL))
);
CREATE TABLE IF NOT EXISTS public.pharmacy_round_pick_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id uuid NOT NULL REFERENCES public.pharmacy_round_picks(id) ON DELETE RESTRICT,
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  patient_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  prescription_id uuid NOT NULL REFERENCES public.prescriptions(id) ON DELETE RESTRICT,
  product_id uuid NOT NULL REFERENCES public.pharmacy_products(id) ON DELETE RESTRICT,
  quantity integer NOT NULL CHECK (quantity > 0)
);
CREATE INDEX IF NOT EXISTS prpl_rx ON public.pharmacy_round_pick_lines (prescription_id);

CREATE TABLE IF NOT EXISTS public.pharmacy_ip_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  patient_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  body text NOT NULL CHECK (char_length(body) BETWEEN 2 AND 500),
  written_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  written_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pipn_patient ON public.pharmacy_ip_notes (patient_user_id, written_at);

-- ─── 3. Outpatients ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pharmacy_op_pill_counts (
  id uuid PRIMARY KEY,
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  prescription_id uuid NOT NULL REFERENCES public.prescriptions(id) ON DELETE RESTRICT,
  -- NULL: the patient did not bring their medicine back.
  brought_back integer CHECK (brought_back IS NULL OR brought_back BETWEEN 0 AND 100000),
  counted_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  counted_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS popc_rx ON public.pharmacy_op_pill_counts (prescription_id, counted_at);

CREATE TABLE IF NOT EXISTS public.pharmacy_op_checkins (
  id uuid PRIMARY KEY,
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  prescription_id uuid NOT NULL REFERENCES public.prescriptions(id) ON DELETE RESTRICT,
  how text NOT NULL CHECK (how IN ('call','sms','visit')),
  status text NOT NULL CHECK (status IN ('taking','missed_some','stopped','not_started')),
  missed integer NOT NULL DEFAULT 0 CHECK (missed BETWEEN 0 AND 200),
  side_effects text[] NOT NULL DEFAULT '{}',
  checked_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  checked_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT poc_missed CHECK (status <> 'taking' OR missed = 0)
);
CREATE INDEX IF NOT EXISTS poc_rx ON public.pharmacy_op_checkins (prescription_id, checked_at);

-- ─── 4. Immunisation ─────────────────────────────────────────────────────
-- The hospital's EPI clinic place: vaccinations come off its stock.
CREATE TABLE IF NOT EXISTS public.pharmacy_epi_clinics (
  hospital_id uuid PRIMARY KEY REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  location_id uuid NOT NULL REFERENCES public.pharmacy_locations(id) ON DELETE RESTRICT,
  set_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  set_at timestamptz NOT NULL DEFAULT now()
);

-- Which product is which vaccine, with its doses per vial and the clinic's stock level (max).
CREATE TABLE IF NOT EXISTS public.pharmacy_epi_vaccines (
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  vaccine text NOT NULL CHECK (vaccine IN ('bcg','bopv','ipv','penta','pcv','rota','mr','hpv','td')),
  product_id uuid NOT NULL REFERENCES public.pharmacy_products(id) ON DELETE RESTRICT,
  doses_per_vial smallint NOT NULL CHECK (doses_per_vial BETWEEN 1 AND 50),
  max_level integer CHECK (max_level IS NULL OR max_level > 0),
  set_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  set_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (hospital_id, vaccine),
  UNIQUE (product_id)
);

CREATE TABLE IF NOT EXISTS public.pharmacy_epi_clients (
  id uuid PRIMARY KEY,
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  kind text NOT NULL CHECK (kind IN ('child','woman','girl')),
  name text NOT NULL CHECK (char_length(name) BETWEEN 3 AND 120),
  sex text NOT NULL CHECK (sex IN ('F','M')),
  dob date NOT NULL,
  card_no text NOT NULL CHECK (char_length(card_no) BETWEEN 3 AND 30),
  carer text NOT NULL CHECK (char_length(carer) BETWEEN 2 AND 120),
  phone_encrypted text NOT NULL,
  phone_hmac text NOT NULL,
  village text CHECK (village IS NULL OR char_length(village) <= 80),
  note text CHECK (note IS NULL OR char_length(note) <= 200),
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (hospital_id, card_no),
  CONSTRAINT pec_girl CHECK (kind = 'child' OR sex = 'F')
);

CREATE TABLE IF NOT EXISTS public.pharmacy_epi_appointments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  client_id uuid NOT NULL REFERENCES public.pharmacy_epi_clients(id) ON DELETE RESTRICT,
  come_back_on date NOT NULL,
  set_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  set_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pea_client ON public.pharmacy_epi_appointments (client_id, set_at);

-- A VVM reading for a batch; the latest wins. Stage 3 or 4: the batch is not used.
CREATE TABLE IF NOT EXISTS public.pharmacy_vvm_readings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  batch_id uuid NOT NULL REFERENCES public.pharmacy_batches(id) ON DELETE RESTRICT,
  stage smallint NOT NULL CHECK (stage BETWEEN 1 AND 4),
  read_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  read_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pvr_batch ON public.pharmacy_vvm_readings (batch_id, read_at DESC);

CREATE TABLE IF NOT EXISTS public.pharmacy_epi_open_vials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  batch_id uuid NOT NULL REFERENCES public.pharmacy_batches(id) ON DELETE RESTRICT,
  doses_per_vial smallint NOT NULL CHECK (doses_per_vial BETWEEN 2 AND 50),
  opened_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  opened_at timestamptz NOT NULL DEFAULT now(),
  discarded_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  discarded_at timestamptz,
  -- The ledger line that took the leftover doses off stock (none when the vial was used up).
  wasted_movement_id uuid REFERENCES public.pharmacy_stock_movements(id) ON DELETE RESTRICT,
  CONSTRAINT peov_discard CHECK ((discarded_at IS NULL) = (discarded_by IS NULL)
    AND (wasted_movement_id IS NULL OR discarded_at IS NOT NULL))
);
DROP TRIGGER IF EXISTS peov_guard ON public.pharmacy_epi_open_vials;
CREATE TRIGGER peov_guard BEFORE UPDATE OR DELETE ON public.pharmacy_epi_open_vials
  FOR EACH ROW EXECUTE FUNCTION private.pharmacy_end_only_guard('discarded_at', 'discarded_by', 'wasted_movement_id');

CREATE TABLE IF NOT EXISTS public.pharmacy_epi_doses (
  id uuid PRIMARY KEY,
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  client_id uuid NOT NULL REFERENCES public.pharmacy_epi_clients(id) ON DELETE RESTRICT,
  -- The schedule's label: BCG, OPV0, Penta1, MR2, Td3, HPV …
  antigen text NOT NULL CHECK (antigen ~ '^[A-Za-z]{2,6}[0-9]?$'),
  vaccine text NOT NULL CHECK (vaccine IN ('bcg','bopv','ipv','penta','pcv','rota','mr','hpv','td')),
  batch_id uuid NOT NULL REFERENCES public.pharmacy_batches(id) ON DELETE RESTRICT,
  movement_id uuid NOT NULL UNIQUE REFERENCES public.pharmacy_stock_movements(id) ON DELETE RESTRICT,
  vial_id uuid REFERENCES public.pharmacy_epi_open_vials(id) ON DELETE RESTRICT,
  site text NOT NULL CHECK (char_length(site) BETWEEN 2 AND 80),
  aefi text NOT NULL CHECK (aefi IN ('none','mild','serious')),
  given_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  given_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id, antigen)
);
CREATE INDEX IF NOT EXISTS ped_given ON public.pharmacy_epi_doses (hospital_id, given_at);

-- PRD §6.3 AC: a vaccination is a stock movement. The dose names its own `ward_used` of exactly 1, of the same batch,
-- at the EPI clinic, made for this dose (source_id); never from an expired, recalled or VVM 3–4 batch.
CREATE OR REPLACE FUNCTION private.pharmacy_epi_dose_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE
  _m public.pharmacy_stock_movements;
  _b public.pharmacy_batches;
  _clinic uuid;
  _stage smallint;
BEGIN
  SELECT location_id INTO _clinic FROM public.pharmacy_epi_clinics WHERE hospital_id = NEW.hospital_id;
  SELECT * INTO _m FROM public.pharmacy_stock_movements WHERE id = NEW.movement_id;
  IF _clinic IS NULL OR NOT FOUND OR _m.kind <> 'ward_used' OR _m.quantity <> -1 OR _m.batch_id <> NEW.batch_id
     OR coalesce(_m.location_id, _m.dispensing_point_id) <> _clinic OR _m.hospital_id <> NEW.hospital_id
     OR _m.source_id IS DISTINCT FROM NEW.id THEN
    RAISE EXCEPTION 'pharmacy_epi: a dose takes exactly one dose off the clinic''s stock'
      USING ERRCODE = 'P0001', HINT = 'dose_movement';
  END IF;
  SELECT * INTO _b FROM public.pharmacy_batches WHERE id = NEW.batch_id;
  IF private.pharmacy_expires_on(_b.expiry, _b.expiry_month_only) < private.pharmacy_local_date() THEN
    RAISE EXCEPTION 'pharmacy_epi: batch % expired', _b.batch_number USING ERRCODE = 'P0001', HINT = 'expired';
  END IF;
  IF private.pharmacy_batch_recalled(_b.id) THEN
    RAISE EXCEPTION 'pharmacy_epi: batch % is recalled', _b.batch_number USING ERRCODE = 'P0001', HINT = 'recalled';
  END IF;
  -- VVM is read per batch number: a reading on the cold room's copy of the batch counts at the clinic too.
  SELECT v.stage INTO _stage FROM public.pharmacy_vvm_readings v JOIN public.pharmacy_batches b ON b.id = v.batch_id
   WHERE b.hospital_id = _b.hospital_id AND b.product_id = _b.product_id AND b.batch_number = _b.batch_number
   ORDER BY v.read_at DESC LIMIT 1;
  IF _stage >= 3 THEN
    RAISE EXCEPTION 'pharmacy_epi: batch % is at VVM stage %', _b.batch_number, _stage
      USING ERRCODE = 'P0001', HINT = 'vvm';
  END IF;
  IF NEW.vial_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM public.pharmacy_epi_open_vials o WHERE o.id = NEW.vial_id AND o.batch_id = NEW.batch_id
          AND o.discarded_at IS NULL
          AND (SELECT count(*) FROM public.pharmacy_epi_doses d WHERE d.vial_id = o.id) < o.doses_per_vial) THEN
    RAISE EXCEPTION 'pharmacy_epi: that vial is used up or discarded' USING ERRCODE = 'P0001', HINT = 'vial';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS ped_guard ON public.pharmacy_epi_doses;
CREATE TRIGGER ped_guard BEFORE INSERT ON public.pharmacy_epi_doses
  FOR EACH ROW EXECUTE FUNCTION private.pharmacy_epi_dose_guard();

-- ─── 5. Reminders ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pharmacy_sms_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  rule text NOT NULL CHECK (rule IN ('refill_due','refill_missed','course','epi_tomorrow','epi_defaulter')),
  enabled boolean NOT NULL,
  -- NULL: the signed default wording. An edited template is a draft until signed.
  template_en text CHECK (template_en IS NULL OR char_length(template_en) BETWEEN 10 AND 160),
  template_lg text CHECK (template_lg IS NULL OR char_length(template_lg) BETWEEN 10 AND 160),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','signed')),
  set_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  set_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS psr_latest ON public.pharmacy_sms_rules (hospital_id, rule, set_at DESC);

CREATE TABLE IF NOT EXISTS public.pharmacy_sms_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  day date NOT NULL,
  rule text NOT NULL CHECK (rule IN ('refill_due','refill_missed','course','epi_tomorrow','epi_defaulter')),
  -- What the message is about, e.g. `refill_due:<prescription>`; one message per reason per day.
  ref_key text NOT NULL CHECK (char_length(ref_key) BETWEEN 3 AND 120),
  recipient text NOT NULL CHECK (char_length(recipient) BETWEEN 1 AND 120),
  phone_encrypted text NOT NULL,
  phone_hmac text NOT NULL,
  lang text NOT NULL CHECK (lang IN ('en','lg')),
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 160),
  status text NOT NULL CHECK (status IN ('scheduled','sent','failed','skipped','called')),
  provider_id text,
  cost text,
  failure text,
  sent_at timestamptz,
  status_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  status_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (hospital_id, day, ref_key)
);
-- A message moves forward only: scheduled → sent | failed | skipped; failed → sent (retry) | called.
CREATE OR REPLACE FUNCTION private.pharmacy_sms_message_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'pharmacy_sms_messages: never deleted'; END IF;
  IF NOT ((OLD.status = 'scheduled' AND NEW.status IN ('sent','failed','skipped'))
          OR (OLD.status = 'failed' AND NEW.status IN ('sent','failed','called')))
     OR (to_jsonb(NEW) - ARRAY['status','provider_id','cost','failure','sent_at','status_by','status_at'])
        <> (to_jsonb(OLD) - ARRAY['status','provider_id','cost','failure','sent_at','status_by','status_at']) THEN
    RAISE EXCEPTION 'pharmacy_sms_messages: % cannot become %', OLD.status, NEW.status;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS psm_sms_guard ON public.pharmacy_sms_messages;
CREATE TRIGGER psm_sms_guard BEFORE UPDATE OR DELETE ON public.pharmacy_sms_messages
  FOR EACH ROW EXECUTE FUNCTION private.pharmacy_sms_message_guard();

CREATE TABLE IF NOT EXISTS public.pharmacy_sms_optouts (
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  phone_hmac text NOT NULL,
  source text NOT NULL CHECK (source IN ('reply_stop','staff')),
  recorded_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (hospital_id, phone_hmac)
);
-- PRD §6.3 AC: no message is sent to a number that opted out, whatever the app does.
CREATE OR REPLACE FUNCTION private.pharmacy_sms_optout_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.status = 'sent' AND EXISTS (SELECT 1 FROM public.pharmacy_sms_optouts o
       WHERE o.hospital_id = NEW.hospital_id AND o.phone_hmac = NEW.phone_hmac) THEN
    RAISE EXCEPTION 'pharmacy_sms: that number opted out' USING ERRCODE = 'P0001', HINT = 'opted_out';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS psm_sms_optout ON public.pharmacy_sms_messages;
CREATE TRIGGER psm_sms_optout BEFORE INSERT OR UPDATE ON public.pharmacy_sms_messages
  FOR EACH ROW EXECUTE FUNCTION private.pharmacy_sms_optout_guard();

-- ─── 6. RLS, audit, append-only (the 0180 pattern) ───────────────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['pharmacy_fridges','pharmacy_fridge_readings','pharmacy_excursion_acks',
    'pharmacy_fridge_contents','pharmacy_round_picks','pharmacy_round_pick_lines','pharmacy_ip_notes',
    'pharmacy_op_pill_counts','pharmacy_op_checkins','pharmacy_epi_clinics','pharmacy_epi_vaccines',
    'pharmacy_epi_clients','pharmacy_epi_appointments','pharmacy_vvm_readings','pharmacy_epi_open_vials',
    'pharmacy_epi_doses','pharmacy_sms_rules','pharmacy_sms_messages','pharmacy_sms_optouts'] LOOP
    -- Sensor readings arrive every few minutes; they are append-only and not audited row by row.
    IF t <> 'pharmacy_fridge_readings' THEN
      EXECUTE format('DROP TRIGGER IF EXISTS audit_%1$s ON public.%1$I', t);
      EXECUTE format('CREATE TRIGGER audit_%1$s AFTER INSERT OR UPDATE OR DELETE ON public.%1$I
        FOR EACH ROW EXECUTE FUNCTION public.audit_log_changes()', t);
    END IF;
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
    EXECUTE format('GRANT SELECT ON public.%I TO medsync_clinical_reader', t);
    EXECUTE format('DROP POLICY IF EXISTS %1$s_select ON public.%1$I', t);
    EXECUTE format('CREATE POLICY %1$s_select ON public.%1$I FOR SELECT TO medsync_clinical_reader
      USING (hospital_id = (SELECT private.current_hospital_id()) AND (SELECT private.pharmacy_can(''pharmacy.view'')))', t);
  END LOOP;
  FOREACH t IN ARRAY ARRAY['pharmacy_fridge_readings','pharmacy_excursion_acks','pharmacy_round_picks',
    'pharmacy_round_pick_lines','pharmacy_ip_notes','pharmacy_op_pill_counts','pharmacy_op_checkins',
    'pharmacy_epi_clients','pharmacy_epi_appointments','pharmacy_vvm_readings','pharmacy_epi_doses',
    'pharmacy_sms_rules'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %1$s_append_only ON public.%1$I', t);
    EXECUTE format('CREATE TRIGGER %1$s_append_only BEFORE UPDATE OR DELETE ON public.%1$I
      FOR EACH ROW EXECUTE FUNCTION public.block_modify_append_only()', t);
  END LOOP;
END $$;
