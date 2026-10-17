-- 0153 — Lab Phase 4: the exchange. Machine identities (a partner's system or an analyser bridge), the
-- append-only message store with its events, the outbox projection, short-lived tokens and the replay cache, and
-- the lab's reconciliation queue (docs/lab/phase-4/gate-a-proposal.md §3.4, §5.3–5.4, §6;
-- EX-1..EX-10, MA-1..MA-9; D-LAB4-13, D-LAB4-15; B2, B3; E-LAB4-01).
--
-- Store before acknowledge (EX-2): private.exchange_store_inbound commits the message before the route answers.
-- The raw payload is encrypted by the server (lib/encryption.ts) before it is stored, and no client role can read
-- the payload column. MedSync holds no machine's private key and stores only the hash of a token.
-- Messages and events are never updated or deleted, dead letters never purged (owner path included).
-- ADDITIVE and re-runnable. GATED: owner-applied (`npm run db:migrate -- 0153`).
-- Reverse: DROP the eight tables and the two functions (nothing outside them refers to them; 0151's
-- lab_referral_events.message_id holds bare ids).

-- ─── Machine identities (svc.partner:{id}, svc.bridge:{id}) ──────────────
CREATE TABLE IF NOT EXISTS public.exchange_senders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  kind text NOT NULL CHECK (kind IN ('partner','bridge')),
  partner_id uuid REFERENCES public.lab_partners(id) ON DELETE RESTRICT,
  name text NOT NULL CHECK (char_length(name) BETWEEN 2 AND 120),
  state text NOT NULL DEFAULT 'pairing' CHECK (state IN ('pairing','active','revoked')),
  jwks jsonb CHECK (jwks IS NULL OR jsonb_typeof(jwks) = 'object'),   -- public keys only
  key_fingerprint text,                                               -- B3: compared by the lab lead
  scopes text[] NOT NULL DEFAULT '{}' CHECK (scopes <@ ARRAY['system/exchange.inbound.write',
    'system/exchange.config.read','system/exchange.heartbeat.write']::text[]),
  zone text NOT NULL DEFAULT 'Africa/Kampala' CHECK (char_length(zone) BETWEEN 3 AND 64),   -- EX-8
  pairing_hash text,
  pairing_expires_at timestamptz,
  pairing_failures integer NOT NULL DEFAULT 0 CHECK (pairing_failures >= 0),
  enabled_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  enabled_at timestamptz,
  last_heard_at timestamptz,
  revoked_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  revoked_at timestamptz,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT es_partner CHECK ((kind = 'partner') = (partner_id IS NOT NULL)),
  CONSTRAINT es_active CHECK (state <> 'active' OR (jwks IS NOT NULL AND enabled_by IS NOT NULL)),
  CONSTRAINT es_revoked CHECK ((state = 'revoked') = (revoked_at IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS public.exchange_tokens (
  token_hash text PRIMARY KEY CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  sender_id uuid NOT NULL REFERENCES public.exchange_senders(id) ON DELETE RESTRICT,
  scopes text[] NOT NULL,
  issued_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  CONSTRAINT et_short CHECK (expires_at <= issued_at + interval '5 minutes')
);
CREATE TABLE IF NOT EXISTS public.exchange_jti (
  jti text PRIMARY KEY CHECK (char_length(jti) BETWEEN 8 AND 200),
  sender_id uuid NOT NULL REFERENCES public.exchange_senders(id) ON DELETE RESTRICT,
  expires_at timestamptz NOT NULL
);

-- ─── The message store (EX-1, EX-3) ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.exchange_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  sender_id uuid REFERENCES public.exchange_senders(id) ON DELETE RESTRICT,   -- NULL: a manual note
  direction text NOT NULL CHECK (direction IN ('in','out')),
  channel text NOT NULL CHECK (channel IN ('fhir','hl7v2','astm','file','manual_note')),
  content_type text NOT NULL CHECK (char_length(content_type) BETWEEN 3 AND 120),
  payload_ciphertext text,
  payload_path text,
  sha256 text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  external_id text CHECK (external_id IS NULL OR char_length(external_id) BETWEEN 1 AND 200),
  about text NOT NULL CHECK (char_length(about) BETWEEN 1 AND 160),   -- PHI-free: "Result, form RL-55031"
  received_at timestamptz NOT NULL DEFAULT now(),
  sender_time text,                          -- as given (EX-8)
  sender_time_utc timestamptz,               -- parsed under zone_assumed
  zone_assumed text,
  CONSTRAINT em_payload CHECK ((payload_ciphertext IS NULL) <> (payload_path IS NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS exchange_messages_external
  ON public.exchange_messages (hospital_id, sender_id, direction, external_id) WHERE external_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS exchange_messages_hash
  ON public.exchange_messages (hospital_id, coalesce(sender_id, '00000000-0000-0000-0000-000000000000'::uuid),
                               direction, sha256);

CREATE TABLE IF NOT EXISTS public.exchange_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  message_id uuid NOT NULL REFERENCES public.exchange_messages(id) ON DELETE RESTRICT,
  state text NOT NULL CHECK (state IN ('received','duplicate','parsed','matched','filed','waiting_match',
    'unreadable','pending','sending','delivered','retrying','dead','retried_by_person','set_aside','raw_viewed')),
  detail jsonb,                              -- no PHI: reason codes, attempt numbers, parse errors by path
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ee_person CHECK (state NOT IN ('retried_by_person','set_aside','raw_viewed')
                              OR (actor_user_id IS NOT NULL AND detail ? 'reason'))
);
CREATE INDEX IF NOT EXISTS exchange_events_message ON public.exchange_events (message_id, id);

-- The latest outbound state (EX-4), claimed by the worker with a conditional UPDATE.
CREATE TABLE IF NOT EXISTS public.exchange_outbox (
  message_id uuid PRIMARY KEY REFERENCES public.exchange_messages(id) ON DELETE RESTRICT,
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  sender_id uuid NOT NULL REFERENCES public.exchange_senders(id) ON DELETE RESTRICT,
  state text NOT NULL CHECK (state IN ('pending','sending','delivered','retrying','dead','set_aside')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  next_at timestamptz,
  last_error text CHECK (last_error IS NULL OR char_length(last_error) <= 300),
  claimed_until timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS exchange_outbox_due ON public.exchange_outbox (next_at)
  WHERE state IN ('pending','retrying');

-- ─── The reconciliation queue (MA-3..MA-9) ───────────────────────────────
-- One row per component of every inbound result (EX-6): reason NULL and state 'filed' when it filed by itself.
CREATE TABLE IF NOT EXISTS public.lab_match_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  message_id uuid NOT NULL REFERENCES public.exchange_messages(id) ON DELETE RESTRICT,
  component_key text NOT NULL CHECK (char_length(component_key) BETWEEN 1 AND 120),
  reason text CHECK (reason IS NULL OR reason IN ('not_found','not_received','demographics_disagree','ambiguous',
    'not_ordered','already_released','unit_differs','code_unmapped','partner_not_enabled')),
  candidate_referral_id uuid REFERENCES public.lab_referrals(id) ON DELETE RESTRICT,
  candidate_specimen_id uuid REFERENCES public.specimens(id) ON DELETE RESTRICT,
  comparison jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(comparison) = 'array'),   -- Same/Differs/Cannot
  state text NOT NULL CHECK (state IN ('waiting','filed','not_ours','kept_unordered','set_aside')),
  report_id uuid REFERENCES public.diagnostic_reports(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz,
  CONSTRAINT lmi_component UNIQUE (message_id, component_key),
  CONSTRAINT lmi_reason CHECK ((state = 'waiting') <= (reason IS NOT NULL)),
  CONSTRAINT lmi_filed CHECK (state <> 'filed' OR report_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS lab_match_items_waiting ON public.lab_match_items (hospital_id, created_at)
  WHERE state = 'waiting';

CREATE TABLE IF NOT EXISTS public.lab_match_resolutions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  item_id uuid NOT NULL REFERENCES public.lab_match_items(id) ON DELETE RESTRICT,
  action text NOT NULL CHECK (action IN ('file_after_confirming','not_ours','receive_then_file','keep_unordered',
    'set_aside','asked_partner')),
  method text CHECK (method IS NULL OR method IN ('corrected_report','phone_call')),
  spoke_to text CHECK (spoke_to IS NULL OR char_length(spoke_to) BETWEEN 2 AND 120),
  second_user_id uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  reason text NOT NULL CHECK (char_length(reason) BETWEEN 3 AND 1000),
  actor_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT lmr_confirm CHECK (action <> 'file_after_confirming' OR (method IS NOT NULL AND second_user_id IS NOT NULL
    AND second_user_id <> actor_user_id AND (method <> 'phone_call' OR spoke_to IS NOT NULL)))
);

-- ─── Store before acknowledge (EX-2, EX-3) ───────────────────────────────
-- Called by the server, on its own connection, after it has checked the sender's token. The hospital comes from
-- the sender row, never from the caller. A duplicate (same external id, or same content) is recorded as an event
-- and returns the first message's id.
CREATE OR REPLACE FUNCTION private.exchange_store_inbound(
  p_sender uuid, p_channel text, p_content_type text, p_payload_ciphertext text, p_payload_path text,
  p_sha256 text, p_external_id text, p_about text, p_sender_time text, p_sender_time_utc timestamptz)
RETURNS TABLE (message_id uuid, duplicate boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_hospital uuid; v_zone text; v_id uuid;
BEGIN
  SELECT s.hospital_id, s.zone INTO v_hospital, v_zone FROM public.exchange_senders s
   WHERE s.id = p_sender AND s.state = 'active';
  IF v_hospital IS NULL THEN RAISE EXCEPTION 'sender not active' USING ERRCODE = '42501'; END IF;
  SELECT m.id INTO v_id FROM public.exchange_messages m
   WHERE m.hospital_id = v_hospital AND m.sender_id = p_sender AND m.direction = 'in'
     AND ((p_external_id IS NOT NULL AND m.external_id = p_external_id) OR m.sha256 = p_sha256)
   ORDER BY m.received_at LIMIT 1;
  IF v_id IS NOT NULL THEN
    INSERT INTO public.exchange_events (hospital_id, message_id, state, detail)
      VALUES (v_hospital, v_id, 'duplicate', jsonb_build_object('sha256', p_sha256));
    message_id := v_id; duplicate := true; RETURN NEXT; RETURN;
  END IF;
  INSERT INTO public.exchange_messages (hospital_id, sender_id, direction, channel, content_type, payload_ciphertext,
      payload_path, sha256, external_id, about, sender_time, sender_time_utc, zone_assumed)
    VALUES (v_hospital, p_sender, 'in', p_channel, p_content_type, p_payload_ciphertext, p_payload_path, p_sha256,
      p_external_id, p_about, p_sender_time, p_sender_time_utc, v_zone)
    RETURNING id INTO v_id;
  INSERT INTO public.exchange_events (hospital_id, message_id, state) VALUES (v_hospital, v_id, 'received');
  UPDATE public.exchange_senders SET last_heard_at = now() WHERE id = p_sender;
  message_id := v_id; duplicate := false; RETURN NEXT;
END;
$$;
REVOKE ALL ON FUNCTION private.exchange_store_inbound(uuid, text, text, text, text, text, text, text, text,
  timestamptz) FROM PUBLIC;

-- A machine's own configuration: nothing else (AB-6).
CREATE OR REPLACE FUNCTION private.exchange_sender_config(p_sender uuid)
RETURNS TABLE (id uuid, kind text, name text, zone text, scopes text[])
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT s.id, s.kind, s.name, s.zone, s.scopes FROM public.exchange_senders s
   WHERE s.id = p_sender AND s.state = 'active';
$$;
REVOKE ALL ON FUNCTION private.exchange_sender_config(uuid) FROM PUBLIC;

-- ─── Live (P11): {event, at} only ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.exchange_live() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_event text;
BEGIN
  IF TG_TABLE_NAME = 'lab_match_items' THEN
    IF NEW.state <> 'waiting' THEN RETURN NULL; END IF;
    v_event := 'match_waiting';
  ELSE
    IF NEW.state <> 'dead' OR (TG_OP = 'UPDATE' AND OLD.state = 'dead') THEN RETURN NULL; END IF;
    v_event := 'message_dead';
  END IF;
  BEGIN
    PERFORM realtime.send(jsonb_build_object('event', v_event, 'at', now()),
      'change', 'lab:' || NEW.hospital_id::text, true);
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS lab_match_items_live ON public.lab_match_items;
CREATE TRIGGER lab_match_items_live AFTER INSERT ON public.lab_match_items
  FOR EACH ROW EXECUTE FUNCTION public.exchange_live();
DROP TRIGGER IF EXISTS exchange_outbox_live ON public.exchange_outbox;
CREATE TRIGGER exchange_outbox_live AFTER INSERT OR UPDATE ON public.exchange_outbox
  FOR EACH ROW EXECUTE FUNCTION public.exchange_live();

-- ─── Append-only, audit, RLS ─────────────────────────────────────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['exchange_messages','exchange_events','lab_match_resolutions'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %1$s_no_mutation ON public.%1$I', t);
    EXECUTE format('CREATE TRIGGER %1$s_no_mutation BEFORE UPDATE OR DELETE ON public.%1$I
      FOR EACH ROW EXECUTE FUNCTION public.block_modify_append_only()', t);
  END LOOP;
  -- Tokens and the replay cache churn; they are not audited row by row (the token endpoint logs issuance).
  FOREACH t IN ARRAY ARRAY['exchange_senders','exchange_messages','exchange_events','exchange_outbox',
    'lab_match_items','lab_match_resolutions'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS audit_%1$s ON public.%1$I', t);
    EXECUTE format('CREATE TRIGGER audit_%1$s AFTER INSERT OR UPDATE OR DELETE ON public.%1$I
      FOR EACH ROW EXECUTE FUNCTION public.audit_log_changes()', t);
  END LOOP;
  FOREACH t IN ARRAY ARRAY['exchange_senders','exchange_tokens','exchange_jti','exchange_messages',
    'exchange_events','exchange_outbox','lab_match_items','lab_match_resolutions'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
  END LOOP;
  FOREACH t IN ARRAY ARRAY['exchange_events','exchange_outbox','lab_match_items','lab_match_resolutions'] LOOP
    EXECUTE format('GRANT SELECT ON public.%I TO medsync_clinical_reader', t);
    EXECUTE format('DROP POLICY IF EXISTS lab_read ON public.%I', t);
    EXECUTE format('CREATE POLICY lab_read ON public.%I FOR SELECT TO medsync_clinical_reader
      USING (hospital_id = (SELECT private.current_hospital_id()) AND (SELECT private.lab_reader()))', t);
  END LOOP;
END $$;
-- Tokens and the replay cache: no reader at all (no GRANT).

-- Messages: listed by the lab without the payload (EX-9); the raw view goes through the server, with a reason,
-- recorded as a 'raw_viewed' event.
REVOKE ALL ON public.exchange_messages FROM medsync_clinical_reader;
GRANT SELECT (id, hospital_id, sender_id, direction, channel, content_type, sha256, external_id, about,
  received_at, sender_time, sender_time_utc, zone_assumed) ON public.exchange_messages TO medsync_clinical_reader;
DROP POLICY IF EXISTS lab_read ON public.exchange_messages;
CREATE POLICY lab_read ON public.exchange_messages FOR SELECT TO medsync_clinical_reader
  USING (hospital_id = (SELECT private.current_hospital_id()) AND (SELECT private.lab_reader()));

-- Senders: the lab sees names, states and fingerprints; never the pairing hash.
REVOKE ALL ON public.exchange_senders FROM medsync_clinical_reader;
GRANT SELECT (id, hospital_id, kind, partner_id, name, state, key_fingerprint, scopes, zone, enabled_by,
  enabled_at, last_heard_at, revoked_at, created_at) ON public.exchange_senders TO medsync_clinical_reader;
DROP POLICY IF EXISTS lab_read ON public.exchange_senders;
CREATE POLICY lab_read ON public.exchange_senders FOR SELECT TO medsync_clinical_reader
  USING (hospital_id = (SELECT private.current_hospital_id()) AND (SELECT private.lab_reader()));
