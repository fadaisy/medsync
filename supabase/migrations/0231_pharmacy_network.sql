-- 0231 — Pharmacy Phase 4, second merge's data: the partner register, agreements, consent per routing, routings
-- and partner supplies (PN-1 to PN-5, AG-1, RT-1 to RT-7; ADRs 0428 to 0431; GATE A signed 26 Oct 2026).
--
-- GATED: owner-applied (`npm run db:migrate`), after 0230. ADDITIVE. Nothing reads these tables until the flags
-- `networkRegistry` and `pharmacyNetwork` are on. Partner routing also needs the hospital's data-protection officer
-- or legal adviser to sign (D-PH4-29) and legal questions 3 and 5 answered.
--
--   1. partner_pharmacies (D-PH4-22): partners are never hospitals rows. Licences, responsible pharmacists,
--      verifications, interests and status are append-only rows; "in force" is a projection (PN-2).
--   2. network_verifiers: the MedSync network verifier role (superadmins named by Fadhul; empty until named).
--   3. partner_staff: one partner per user, with network.admin, network.supply or network.record (PN-5).
--   4. partner_agreements, _lines, _events (AG-1): switching on needs a second approver; interested people excluded.
--   5. pharmacy_routing_consents, pharmacy_routings, _events, pharmacy_partner_identity_attempts (RT-1 to RT-7).
--      A controlled line is never routed (Law 5 backstop).
--   6. pharmacy_supplies gains the partner variant (RT-5): a supply names a supplying hospital or a supplying partner,
--      exactly one. A partner supply has no product or batch keys and no stock movement; Law 3's pairing exempts
--      exactly that case (amending Phase 1 Law 3 and SL-10).

-- ─── 1. Partners ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.partner_pharmacies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trading_name text NOT NULL CHECK (char_length(trading_name) BETWEEN 2 AND 120),
  legal_name text CHECK (legal_name IS NULL OR char_length(legal_name) BETWEEN 2 AND 160),
  district text NOT NULL CHECK (char_length(district) BETWEEN 2 AND 80),
  area text CHECK (area IS NULL OR char_length(area) BETWEEN 2 AND 120),
  address text CHECK (address IS NULL OR char_length(address) BETWEEN 2 AND 300),
  phone text CHECK (phone IS NULL OR char_length(phone) BETWEEN 7 AND 20),
  opening_times text CHECK (opening_times IS NULL OR char_length(opening_times) <= 300),
  applied_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pp_listing ON public.partner_pharmacies (district, trading_name);

CREATE TABLE IF NOT EXISTS public.partner_licences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES public.partner_pharmacies(id) ON DELETE RESTRICT,
  licence_number text NOT NULL CHECK (char_length(licence_number) BETWEEN 2 AND 60),
  licence_class text CHECK (licence_class IS NULL OR char_length(licence_class) BETWEEN 1 AND 60),
  expires_on date NOT NULL,
  document_ref text CHECK (document_ref IS NULL OR char_length(document_ref) BETWEEN 2 AND 300),
  recorded_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  recorded_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pl_partner ON public.partner_licences (partner_id, recorded_at DESC);

CREATE TABLE IF NOT EXISTS public.partner_pharmacists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES public.partner_pharmacies(id) ON DELETE RESTRICT,
  name text NOT NULL CHECK (char_length(name) BETWEEN 2 AND 120),
  registration_number text NOT NULL CHECK (char_length(registration_number) BETWEEN 2 AND 60),
  registration_expires_on date,
  recorded_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  recorded_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pph_partner ON public.partner_pharmacists (partner_id, recorded_at DESC);

CREATE TABLE IF NOT EXISTS public.network_verifiers (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE RESTRICT,
  named_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  named_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.partner_interests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES public.partner_pharmacies(id) ON DELETE RESTRICT,
  -- Who holds the interest: MedSync, one of its owners, or a hospital; user_id names a person who may never verify
  -- or approve this partner (PN-4, D-PH4-14).
  holder text NOT NULL CHECK (char_length(holder) BETWEEN 2 AND 160),
  interest text NOT NULL CHECK (char_length(interest) BETWEEN 2 AND 500),
  user_id uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  hospital_id uuid REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  recorded_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  recorded_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.partner_verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES public.partner_pharmacies(id) ON DELETE RESTRICT,
  kind text NOT NULL CHECK (kind IN ('verified','confirmed')),
  verification_id uuid REFERENCES public.partner_verifications(id) ON DELETE RESTRICT,
  licence_id uuid REFERENCES public.partner_licences(id) ON DELETE RESTRICT,
  pharmacist_id uuid REFERENCES public.partner_pharmacists(id) ON DELETE RESTRICT,
  -- What was checked and how, in the signed standard's terms; never a claim that the regulator verified it.
  checked jsonb NOT NULL DEFAULT '{}'::jsonb,
  how text CHECK (how IS NULL OR char_length(how) BETWEEN 2 AND 1000),
  standard_version integer,
  actor_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pv_shape CHECK (
    (kind = 'verified' AND verification_id IS NULL AND licence_id IS NOT NULL AND pharmacist_id IS NOT NULL
      AND how IS NOT NULL AND standard_version IS NOT NULL)
    OR (kind = 'confirmed' AND verification_id IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS pv_confirmed_once ON public.partner_verifications (verification_id)
  WHERE kind = 'confirmed';

-- PN-4: a named verifier, a second person to confirm, and nobody with a disclosed interest in the partner.
CREATE OR REPLACE FUNCTION private.partner_interested(p_partner uuid, p_user uuid) RETURNS boolean
LANGUAGE sql STABLE SET search_path = public, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM public.partner_interests i WHERE i.partner_id = p_partner AND i.user_id = p_user);
$$;
CREATE OR REPLACE FUNCTION private.partner_verification_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE _v public.partner_verifications;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.network_verifiers WHERE user_id = NEW.actor_user_id) THEN
    RAISE EXCEPTION 'network: only a named network verifier verifies a partner (PN-4)' USING ERRCODE = 'P0001';
  END IF;
  IF private.partner_interested(NEW.partner_id, NEW.actor_user_id) THEN
    RAISE EXCEPTION 'network: a person with a disclosed interest never verifies this partner (PN-4)'
      USING ERRCODE = 'P0001', HINT = 'interested';
  END IF;
  IF NEW.kind = 'confirmed' THEN
    SELECT * INTO _v FROM public.partner_verifications WHERE id = NEW.verification_id;
    IF _v.kind <> 'verified' OR _v.partner_id <> NEW.partner_id THEN
      RAISE EXCEPTION 'network: a confirmation names a verification of the same partner';
    END IF;
    IF _v.actor_user_id = NEW.actor_user_id THEN
      RAISE EXCEPTION 'network: a verification is confirmed by a second person (PN-4)'
        USING ERRCODE = 'P0001', HINT = 'four_eyes';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS pv_guard ON public.partner_verifications;
CREATE TRIGGER pv_guard BEFORE INSERT ON public.partner_verifications
  FOR EACH ROW EXECUTE FUNCTION private.partner_verification_guard();

CREATE TABLE IF NOT EXISTS public.partner_status_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES public.partner_pharmacies(id) ON DELETE RESTRICT,
  kind text NOT NULL CHECK (kind IN ('suspended','reinstated','withdrawn')),
  reason text NOT NULL CHECK (char_length(reason) BETWEEN 2 AND 500),
  actor_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pse_partner ON public.partner_status_events (partner_id, at DESC);

-- ─── 2. Partner staff (PN-5) ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.partner_staff (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id uuid NOT NULL REFERENCES public.partner_pharmacies(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  permission text NOT NULL CHECK (permission IN ('network.admin','network.supply','network.record')),
  approved_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  approved_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  ended_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  CONSTRAINT pst_ended CHECK ((ended_at IS NULL) = (ended_by IS NULL)),
  CONSTRAINT pst_not_self CHECK (approved_by <> user_id)
);
-- One partner organisation per user at a time.
CREATE UNIQUE INDEX IF NOT EXISTS pst_one_partner ON public.partner_staff (user_id) WHERE ended_at IS NULL;
CREATE OR REPLACE FUNCTION private.partner_staff_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'network: partner staff are ended, never deleted'; END IF;
  IF OLD.ended_at IS NOT NULL
     OR (to_jsonb(NEW) - 'ended_at' - 'ended_by') <> (to_jsonb(OLD) - 'ended_at' - 'ended_by') THEN
    RAISE EXCEPTION 'network: partner staff change only by being ended';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS pst_guard ON public.partner_staff;
CREATE TRIGGER pst_guard BEFORE UPDATE OR DELETE ON public.partner_staff
  FOR EACH ROW EXECUTE FUNCTION private.partner_staff_guard();

-- The current user's partner, if they are partner staff.
CREATE OR REPLACE FUNCTION private.current_partner_id() RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT s.partner_id FROM public.partner_staff s
   WHERE s.user_id = private.current_user_id() AND s.ended_at IS NULL LIMIT 1;
$$;
CREATE OR REPLACE FUNCTION private.network_verifier_now() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM public.network_verifiers v JOIN public.user_roles r ON r.user_id = v.user_id
                  WHERE v.user_id = private.current_user_id() AND r.role = 'superadmin');
$$;

-- ─── 3. Agreements (AG-1) ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.partner_agreements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  partner_id uuid NOT NULL REFERENCES public.partner_pharmacies(id) ON DELETE RESTRICT,
  reference text NOT NULL CHECK (char_length(reference) BETWEEN 2 AND 120),
  starts_on date NOT NULL,
  ends_on date,
  kinds text[] NOT NULL CHECK (cardinality(kinds) > 0 AND kinds <@ ARRAY['refills','out_of_stock']::text[]),
  dispensing_point_ids uuid[] NOT NULL CHECK (cardinality(dispensing_point_ids) > 0),
  -- A programme medicine is routed only where the agreement names the programme and its authority (D-PH4-05).
  programmes jsonb NOT NULL DEFAULT '[]'::jsonb,
  template_version integer NOT NULL,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pa_dates CHECK (ends_on IS NULL OR ends_on >= starts_on)
);
CREATE INDEX IF NOT EXISTS pa_hospital ON public.partner_agreements (hospital_id, partner_id);

CREATE TABLE IF NOT EXISTS public.partner_agreement_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agreement_id uuid NOT NULL REFERENCES public.partner_agreements(id) ON DELETE RESTRICT,
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  medicine_id text NOT NULL CHECK (medicine_id ~ '^[a-z0-9_]{2,80}$'),
  CONSTRAINT pal_once UNIQUE (agreement_id, medicine_id)
);

CREATE TABLE IF NOT EXISTS public.partner_agreement_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agreement_id uuid NOT NULL REFERENCES public.partner_agreements(id) ON DELETE RESTRICT,
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  kind text NOT NULL CHECK (kind IN ('switched_on','paused','resumed','ended')),
  reason text CHECK (reason IS NULL OR char_length(reason) BETWEEN 2 AND 500),
  actor_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  second_approver_user_id uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pae_four_eyes CHECK (kind NOT IN ('switched_on','resumed')
    OR (second_approver_user_id IS NOT NULL AND second_approver_user_id <> actor_user_id)),
  CONSTRAINT pae_reason CHECK (kind NOT IN ('paused','ended') OR reason IS NOT NULL)
);
CREATE OR REPLACE FUNCTION private.partner_agreement_event_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE _partner uuid;
BEGIN
  SELECT partner_id INTO _partner FROM public.partner_agreements WHERE id = NEW.agreement_id;
  IF private.partner_interested(_partner, NEW.actor_user_id)
     OR (NEW.second_approver_user_id IS NOT NULL AND private.partner_interested(_partner, NEW.second_approver_user_id)) THEN
    RAISE EXCEPTION 'network: a person with a disclosed interest never approves this partner''s agreement (PN-4)'
      USING ERRCODE = 'P0001', HINT = 'interested';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS pae_guard ON public.partner_agreement_events;
CREATE TRIGGER pae_guard BEFORE INSERT ON public.partner_agreement_events
  FOR EACH ROW EXECUTE FUNCTION private.partner_agreement_event_guard();

-- ─── 4. Consent and routing (RT-1 to RT-7) ────────────────────────────────
ALTER TABLE public.pharmacy_refill_requests DROP CONSTRAINT IF EXISTS prq_partner_fk;
ALTER TABLE public.pharmacy_refill_requests ADD CONSTRAINT prq_partner_fk
  FOREIGN KEY (partner_id) REFERENCES public.partner_pharmacies(id) ON DELETE RESTRICT;

CREATE TABLE IF NOT EXISTS public.pharmacy_routing_consents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  patient_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  partner_id uuid NOT NULL REFERENCES public.partner_pharmacies(id) ON DELETE RESTRICT,
  given_by text NOT NULL CHECK (given_by IN ('patient','proxy')),
  proxy_collector_id uuid REFERENCES public.patient_collectors(id) ON DELETE RESTRICT,
  how text NOT NULL CHECK (how IN ('app','window')),
  wording_version integer NOT NULL,
  recorded_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  prescription_ids uuid[] NOT NULL CHECK (cardinality(prescription_ids) > 0),
  given_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT prc_proxy CHECK ((given_by = 'proxy') = (proxy_collector_id IS NOT NULL)),
  CONSTRAINT prc_window CHECK (how = 'app' OR recorded_by IS NOT NULL)
);
-- RT-2: a proxy consents only where the patient recorded them as a proxy (H4-18).
CREATE OR REPLACE FUNCTION private.routing_consent_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.given_by = 'proxy' AND NOT EXISTS (SELECT 1 FROM public.patient_collectors c
       WHERE c.id = NEW.proxy_collector_id AND c.patient_user_id = NEW.patient_user_id AND c.is_proxy
         AND c.removed_at IS NULL) THEN
    RAISE EXCEPTION 'network: consent by a proxy needs a proxy the patient recorded (RT-2)' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS prc_guard ON public.pharmacy_routing_consents;
CREATE TRIGGER prc_guard BEFORE INSERT ON public.pharmacy_routing_consents
  FOR EACH ROW EXECUTE FUNCTION private.routing_consent_guard();

CREATE TABLE IF NOT EXISTS public.pharmacy_routings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  patient_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  prescription_id uuid NOT NULL REFERENCES public.prescriptions(id) ON DELETE RESTRICT,
  instance_id uuid REFERENCES public.pharmacy_repeat_instances(id) ON DELETE RESTRICT,
  partner_id uuid NOT NULL REFERENCES public.partner_pharmacies(id) ON DELETE RESTRICT,
  agreement_id uuid NOT NULL REFERENCES public.partner_agreements(id) ON DELETE RESTRICT,
  consent_id uuid NOT NULL REFERENCES public.pharmacy_routing_consents(id) ON DELETE RESTRICT,
  code text NOT NULL UNIQUE CHECK (code ~ '^[A-HJKMNP-Z2-9]{8,12}$'),
  routed_quantity integer NOT NULL CHECK (routed_quantity > 0),
  routed_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  routed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS prt_line ON public.pharmacy_routings (prescription_id, routed_at DESC);
CREATE INDEX IF NOT EXISTS prt_partner ON public.pharmacy_routings (partner_id, routed_at DESC);

CREATE TABLE IF NOT EXISTS public.pharmacy_routing_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  routing_id uuid NOT NULL REFERENCES public.pharmacy_routings(id) ON DELETE RESTRICT,
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  kind text NOT NULL CHECK (kind IN ('accepted','partner_declined','withdrawn','consent_withdrawn','returned',
    'supplied','locked')),
  quantity integer CHECK (quantity IS NULL OR quantity > 0),
  reason_code text CHECK (reason_code IS NULL OR char_length(reason_code) BETWEEN 2 AND 60),
  reason_note text CHECK (reason_note IS NULL OR char_length(reason_note) <= 1000),
  actor_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pre_accepted CHECK (kind <> 'accepted' OR quantity IS NOT NULL),
  CONSTRAINT pre_declined CHECK (kind NOT IN ('partner_declined','withdrawn','returned') OR reason_code IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS prte_routing ON public.pharmacy_routing_events (routing_id, at);
-- One answer per routing; supplied once; a code dies once (Law 7, E-PH4-03).
CREATE UNIQUE INDEX IF NOT EXISTS prte_one_answer ON public.pharmacy_routing_events (routing_id)
  WHERE kind IN ('accepted','partner_declined');
CREATE UNIQUE INDEX IF NOT EXISTS prte_one_end ON public.pharmacy_routing_events (routing_id)
  WHERE kind IN ('withdrawn','consent_withdrawn','returned','supplied');

-- A routing is live until it is supplied, withdrawn, returned or locked.
CREATE OR REPLACE FUNCTION private.routing_live(p_routing uuid) RETURNS boolean
LANGUAGE sql STABLE SET search_path = public, pg_temp AS $$
  SELECT NOT EXISTS (SELECT 1 FROM public.pharmacy_routing_events e WHERE e.routing_id = p_routing
    AND e.kind IN ('partner_declined','withdrawn','consent_withdrawn','returned','supplied','locked'));
$$;
-- Law 5 and Law 7 backstops: never a controlled line; one live routing per line or instance; the consent covers
-- this partner, patient and line; the agreement is this hospital's with this partner.
CREATE OR REPLACE FUNCTION private.routing_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE _p public.prescriptions; _c public.pharmacy_routing_consents; _a public.partner_agreements;
BEGIN
  SELECT * INTO _p FROM public.prescriptions WHERE id = NEW.prescription_id FOR UPDATE;
  IF _p.controlled THEN
    RAISE EXCEPTION 'network: a controlled medicine is never routed (Law 5)' USING ERRCODE = 'P0001', HINT = 'controlled';
  END IF;
  IF _p.hospital_id <> NEW.hospital_id OR _p.patient_user_id <> NEW.patient_user_id THEN
    RAISE EXCEPTION 'network: the routing does not match its line';
  END IF;
  SELECT * INTO _c FROM public.pharmacy_routing_consents WHERE id = NEW.consent_id;
  IF _c.partner_id <> NEW.partner_id OR _c.patient_user_id <> NEW.patient_user_id
     OR NOT (NEW.prescription_id = ANY (_c.prescription_ids)) THEN
    RAISE EXCEPTION 'network: no consent for this routing (Law 5)' USING ERRCODE = 'P0001', HINT = 'consent';
  END IF;
  SELECT * INTO _a FROM public.partner_agreements WHERE id = NEW.agreement_id;
  IF _a.hospital_id <> NEW.hospital_id OR _a.partner_id <> NEW.partner_id THEN
    RAISE EXCEPTION 'network: the agreement is not between this hospital and this partner' USING ERRCODE = 'P0001';
  END IF;
  IF EXISTS (SELECT 1 FROM public.pharmacy_routings r
              WHERE r.prescription_id = NEW.prescription_id
                AND r.instance_id IS NOT DISTINCT FROM NEW.instance_id AND private.routing_live(r.id)) THEN
    RAISE EXCEPTION 'network: this line is already routed (Law 7)' USING ERRCODE = 'P0001', HINT = 'routed';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS prt_guard ON public.pharmacy_routings;
CREATE TRIGGER prt_guard BEFORE INSERT ON public.pharmacy_routings
  FOR EACH ROW EXECUTE FUNCTION private.routing_guard();

CREATE TABLE IF NOT EXISTS public.pharmacy_partner_identity_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  routing_id uuid NOT NULL REFERENCES public.pharmacy_routings(id) ON DELETE RESTRICT,
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  partner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  identifier text NOT NULL CHECK (identifier IN ('date_of_birth','phone')),
  matched boolean NOT NULL,
  at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ppia_routing ON public.pharmacy_partner_identity_attempts (routing_id);

-- ─── 5. Partner supplies (RT-5; amending Phase 1 Law 3 and SL-10) ─────────
ALTER TABLE public.pharmacy_supplies ALTER COLUMN supplying_hospital_id DROP NOT NULL;
ALTER TABLE public.pharmacy_supplies ALTER COLUMN product_id DROP NOT NULL;
ALTER TABLE public.pharmacy_supplies ALTER COLUMN batch_id DROP NOT NULL;
ALTER TABLE public.pharmacy_supplies
  ADD COLUMN IF NOT EXISTS supplying_partner_id uuid REFERENCES public.partner_pharmacies(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS routing_id uuid REFERENCES public.pharmacy_routings(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS partner_product_text text
    CHECK (partner_product_text IS NULL OR char_length(partner_product_text) BETWEEN 2 AND 160),
  ADD COLUMN IF NOT EXISTS partner_registration_number text
    CHECK (partner_registration_number IS NULL OR char_length(partner_registration_number) BETWEEN 2 AND 60),
  ADD COLUMN IF NOT EXISTS partner_batch_text text
    CHECK (partner_batch_text IS NULL OR char_length(partner_batch_text) BETWEEN 1 AND 60),
  ADD COLUMN IF NOT EXISTS partner_expiry date,
  ADD COLUMN IF NOT EXISTS supervising_pharmacist_user_id uuid REFERENCES auth.users(id) ON DELETE RESTRICT;
ALTER TABLE public.pharmacy_supplies DROP CONSTRAINT IF EXISTS ps_supplier;
ALTER TABLE public.pharmacy_supplies ADD CONSTRAINT ps_supplier CHECK (
  (supplying_hospital_id IS NOT NULL AND supplying_partner_id IS NULL
    AND product_id IS NOT NULL AND batch_id IS NOT NULL AND routing_id IS NULL
    AND partner_product_text IS NULL AND partner_batch_text IS NULL AND partner_expiry IS NULL)
  OR (supplying_partner_id IS NOT NULL AND supplying_hospital_id IS NULL
    AND product_id IS NULL AND batch_id IS NULL AND routing_id IS NOT NULL AND prescription_id IS NOT NULL
    AND partner_product_text IS NOT NULL AND partner_batch_text IS NOT NULL AND partner_expiry IS NOT NULL));
CREATE UNIQUE INDEX IF NOT EXISTS ps_routing_once ON public.pharmacy_supplies (routing_id) WHERE routing_id IS NOT NULL;

-- Law 3 at COMMIT, as 0126, except a partner supply: it has no movement, and a movement never names one.
CREATE OR REPLACE FUNCTION private.pharmacy_supply_movement_pair() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE _supply uuid; _n integer;
BEGIN
  IF TG_TABLE_NAME = 'pharmacy_supplies' THEN
    IF NEW.supplying_partner_id IS NOT NULL THEN
      IF EXISTS (SELECT 1 FROM public.pharmacy_stock_movements m WHERE m.source_kind = 'supply' AND m.source_id = NEW.id) THEN
        RAISE EXCEPTION 'pharmacy: a partner supply moves no hospital stock (RT-5)';
      END IF;
      RETURN NULL;
    END IF;
    _supply := NEW.id;
  ELSIF NEW.kind = 'supplied' THEN
    IF NEW.source_kind <> 'supply' OR NEW.source_id IS NULL
       OR NOT EXISTS (SELECT 1 FROM public.pharmacy_supplies s WHERE s.id = NEW.source_id) THEN
      RAISE EXCEPTION 'pharmacy: a supplied movement without its supply (Law 3)';
    END IF;
    IF EXISTS (SELECT 1 FROM public.pharmacy_supplies s WHERE s.id = NEW.source_id AND s.supplying_partner_id IS NOT NULL) THEN
      RAISE EXCEPTION 'pharmacy: a partner supply moves no hospital stock (RT-5)';
    END IF;
    _supply := NEW.source_id;
  ELSE
    RETURN NULL;
  END IF;
  SELECT count(*) INTO _n FROM public.pharmacy_stock_movements m
   WHERE m.kind = 'supplied' AND m.source_kind = 'supply' AND m.source_id = _supply;
  IF _n <> 1 THEN
    RAISE EXCEPTION 'pharmacy: supply % has % supplied movements; exactly one is required (Law 3)', _supply, _n;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.pharmacy_supplies s JOIN public.pharmacy_stock_movements m
                   ON m.source_id = s.id AND m.kind = 'supplied'
                  WHERE s.id = _supply AND m.batch_id = s.batch_id AND m.quantity = -s.quantity
                    -- SA-1 (0230): a held refill is supplied out of its point's own prepared place.
                    AND (m.dispensing_point_id = s.dispensing_point_id
                         OR EXISTS (SELECT 1 FROM public.pharmacy_locations l WHERE l.id = m.location_id
                                     AND l.kind = 'prepared' AND l.department_id = s.dispensing_point_id))) THEN
    RAISE EXCEPTION 'pharmacy: supply % and its movement disagree on batch, point or quantity', _supply;
  END IF;
  RETURN NULL;
END;
$$;

-- ─── Grants, RLS, audit, append-only ──────────────────────────────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['partner_pharmacies','partner_licences','partner_pharmacists','network_verifiers',
    'partner_interests','partner_verifications','partner_status_events','partner_staff','partner_agreements',
    'partner_agreement_lines','partner_agreement_events','pharmacy_routing_consents','pharmacy_routings',
    'pharmacy_routing_events','pharmacy_partner_identity_attempts'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS audit_%1$s ON public.%1$I', t);
    EXECUTE format('CREATE TRIGGER audit_%1$s AFTER INSERT OR UPDATE OR DELETE ON public.%1$I
      FOR EACH ROW EXECUTE FUNCTION public.audit_log_changes()', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
    EXECUTE format('GRANT SELECT ON public.%I TO medsync_clinical_reader', t);
    -- partner_pharmacies changes its contact details; partner_staff only by being ended (its own guard).
    IF t NOT IN ('partner_pharmacies','partner_staff') THEN
      EXECUTE format('DROP TRIGGER IF EXISTS %1$s_append_only ON public.%1$I', t);
      EXECUTE format('CREATE TRIGGER %1$s_append_only BEFORE UPDATE OR DELETE ON public.%1$I
        FOR EACH ROW EXECUTE FUNCTION public.block_modify_append_only()', t);
    END IF;
  END LOOP;
END $$;

-- The network verifier reads the register (no patient data: routings and consents are not in this list).
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['partner_pharmacies','partner_licences','partner_pharmacists','network_verifiers',
    'partner_interests','partner_verifications','partner_status_events','partner_staff'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %1$s_verifier ON public.%1$I', t);
    EXECUTE format('CREATE POLICY %1$s_verifier ON public.%1$I FOR SELECT TO medsync_clinical_reader
      USING ((SELECT private.network_verifier_now()))', t);
  END LOOP;
END $$;

-- Partner staff read their own organisation's record (Licence and staff).
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['partner_licences','partner_pharmacists','partner_interests','partner_verifications',
    'partner_status_events','partner_staff'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %1$s_partner ON public.%1$I', t);
    EXECUTE format('CREATE POLICY %1$s_partner ON public.%1$I FOR SELECT TO medsync_clinical_reader
      USING (partner_id = (SELECT private.current_partner_id()))', t);
  END LOOP;
END $$;
DROP POLICY IF EXISTS partner_pharmacies_partner ON public.partner_pharmacies;
CREATE POLICY partner_pharmacies_partner ON public.partner_pharmacies FOR SELECT TO medsync_clinical_reader
  USING (id = (SELECT private.current_partner_id()));
DROP POLICY IF EXISTS partner_agreements_partner ON public.partner_agreements;
CREATE POLICY partner_agreements_partner ON public.partner_agreements FOR SELECT TO medsync_clinical_reader
  USING (partner_id = (SELECT private.current_partner_id()));
DROP POLICY IF EXISTS partner_agreement_lines_partner ON public.partner_agreement_lines;
CREATE POLICY partner_agreement_lines_partner ON public.partner_agreement_lines FOR SELECT TO medsync_clinical_reader
  USING (EXISTS (SELECT 1 FROM public.partner_agreements a WHERE a.id = agreement_id
    AND a.partner_id = (SELECT private.current_partner_id())));

-- Partner staff see a routing (the row, never the patient's record) only while it is live or supplied; the
-- minimum fields come from the partnerLineView server read (RT-6), not from these tables.
-- SECURITY DEFINER: the events table's own policy reads routings, so an invoker function here would recurse.
CREATE OR REPLACE FUNCTION private.routing_partner_visible(p_routing uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT NOT EXISTS (SELECT 1 FROM public.pharmacy_routing_events e WHERE e.routing_id = p_routing
    AND e.kind IN ('partner_declined','withdrawn','consent_withdrawn','returned','locked'));
$$;
REVOKE ALL ON FUNCTION private.routing_partner_visible(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.routing_partner_visible(uuid) TO medsync_clinical_reader;
DROP POLICY IF EXISTS pharmacy_routings_partner ON public.pharmacy_routings;
CREATE POLICY pharmacy_routings_partner ON public.pharmacy_routings FOR SELECT TO medsync_clinical_reader
  USING (partner_id = (SELECT private.current_partner_id()) AND private.routing_partner_visible(id));
DROP POLICY IF EXISTS pharmacy_routing_events_partner ON public.pharmacy_routing_events;
CREATE POLICY pharmacy_routing_events_partner ON public.pharmacy_routing_events FOR SELECT TO medsync_clinical_reader
  USING (EXISTS (SELECT 1 FROM public.pharmacy_routings r WHERE r.id = routing_id
    AND r.partner_id = (SELECT private.current_partner_id())));

-- Hospital pharmacy staff read their hospital's agreements, partners they have agreements with, consents and routings.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['partner_agreements','partner_agreement_lines','partner_agreement_events',
    'pharmacy_routing_consents','pharmacy_routings','pharmacy_routing_events','pharmacy_partner_identity_attempts'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %1$s_pharmacy ON public.%1$I', t);
    EXECUTE format('CREATE POLICY %1$s_pharmacy ON public.%1$I FOR SELECT TO medsync_clinical_reader
      USING (hospital_id = (SELECT private.current_hospital_id()) AND (SELECT private.pharmacy_can(''pharmacy.view'')))', t);
  END LOOP;
END $$;
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['partner_pharmacies','partner_licences','partner_pharmacists','partner_interests',
    'partner_status_events'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %1$s_hospital ON public.%1$I', t);
    EXECUTE format('CREATE POLICY %1$s_hospital ON public.%1$I FOR SELECT TO medsync_clinical_reader
      USING ((SELECT private.pharmacy_can(''pharmacy.view'')) AND EXISTS (SELECT 1 FROM public.partner_agreements a
        WHERE a.partner_id = %2$s AND a.hospital_id = (SELECT private.current_hospital_id())))',
      t, CASE WHEN t = 'partner_pharmacies' THEN 'partner_pharmacies.id' ELSE format('%I.partner_id', t) END);
  END LOOP;
END $$;
-- The patient reads their own consents and routings (the refill page).
DROP POLICY IF EXISTS pharmacy_routing_consents_own ON public.pharmacy_routing_consents;
CREATE POLICY pharmacy_routing_consents_own ON public.pharmacy_routing_consents FOR SELECT TO medsync_clinical_reader
  USING (patient_user_id = (SELECT private.current_user_id()));
DROP POLICY IF EXISTS pharmacy_routings_own ON public.pharmacy_routings;
CREATE POLICY pharmacy_routings_own ON public.pharmacy_routings FOR SELECT TO medsync_clinical_reader
  USING (patient_user_id = (SELECT private.current_user_id()));

REVOKE ALL ON FUNCTION private.current_partner_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.current_partner_id() TO medsync_clinical_reader;
REVOKE ALL ON FUNCTION private.network_verifier_now() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.network_verifier_now() TO medsync_clinical_reader;
REVOKE ALL ON FUNCTION private.routing_live(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.partner_interested(uuid, uuid) FROM PUBLIC;
