-- 0151 — Lab Phase 4: referrals from To refer, their append-only events, manifests and their prints, aliquots,
-- and the live events (docs/lab/phase-4/gate-a-proposal.md §3.2, §5.1, §5.2; RF-1..RF-12, MF-1..MF-4; P1, P11).
--
-- A referral belongs to the original order lines and specimen (Law 2); its state is a cached projection of its
-- events, rewritten by the writer in the same transaction. Events, prints are append-only by trigger (owner path
-- included). No PHI on the live channel. ADDITIVE and re-runnable. GATED: owner-applied (`npm run db:migrate -- 0151`).
-- Reverse: DROP the five tables and the column specimens.parent_specimen_id (no other table refers to them
-- until 0152).

-- ─── Aliquots (RF-2) ─────────────────────────────────────────────────────
ALTER TABLE public.specimens ADD COLUMN IF NOT EXISTS parent_specimen_id uuid
  REFERENCES public.specimens(id) ON DELETE RESTRICT;
CREATE INDEX IF NOT EXISTS specimens_parent ON public.specimens (parent_specimen_id)
  WHERE parent_specimen_id IS NOT NULL;

-- ─── Referrals (RF-1..RF-12) ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.lab_referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  number text NOT NULL CHECK (number ~ '^RF-[0-9]{4}-[0-9]{4,}$'),
  specimen_id uuid NOT NULL REFERENCES public.specimens(id) ON DELETE RESTRICT,
  patient_user_id uuid NOT NULL,
  order_ids uuid[] NOT NULL CHECK (cardinality(order_ids) >= 1),
  partner_id uuid NOT NULL REFERENCES public.lab_partners(id) ON DELETE RESTRICT,
  routine boolean NOT NULL,                      -- false: an outbreak referral (RF-7), never on a manifest
  external_ids jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(external_ids) = 'object'),
  packing jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(packing) = 'object'),
  partner_tests_config_id uuid REFERENCES public.lab_signed_configs(id) ON DELETE RESTRICT,
  consent_ref text CHECK (consent_ref IS NULL OR char_length(consent_ref) BETWEEN 3 AND 200),
  informed jsonb,                                -- outbreak: who was informed (RF-7)
  recollect_of uuid REFERENCES public.lab_referrals(id) ON DELETE RESTRICT,   -- RF-9
  client_key text NOT NULL CHECK (char_length(client_key) BETWEEN 8 AND 120),
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  -- Cached projection of lab_referral_events (RF-4), rewritten by the writer only:
  state text NOT NULL DEFAULT 'draft' CHECK (state IN ('draft','packed','handed_over','at_hub','received_by_lab',
    'accepted','rejected','in_progress','on_hold','completed','failed','lost','cancelled')),
  state_at timestamptz NOT NULL DEFAULT now(),
  cancel_requested boolean NOT NULL DEFAULT false,
  sent_at timestamptz,                           -- handed over (RF-5 counts from here)
  completed_at timestamptz,
  CONSTRAINT lab_referrals_number UNIQUE (hospital_id, number),
  CONSTRAINT lab_referrals_one_per_destination UNIQUE (specimen_id, partner_id),
  CONSTRAINT lab_referrals_key UNIQUE (hospital_id, client_key),
  CONSTRAINT lab_referrals_outbreak CHECK (routine OR informed IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS lab_referrals_open ON public.lab_referrals (hospital_id, state)
  WHERE state NOT IN ('completed','failed','lost','cancelled','rejected');
CREATE INDEX IF NOT EXISTS lab_referrals_patient ON public.lab_referrals (hospital_id, patient_user_id);
CREATE INDEX IF NOT EXISTS lab_referrals_ext ON public.lab_referrals USING gin (external_ids);

CREATE TABLE IF NOT EXISTS public.lab_referral_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  referral_id uuid NOT NULL REFERENCES public.lab_referrals(id) ON DELETE RESTRICT,
  kind text NOT NULL CHECK (kind IN ('created','packed','handed_over','at_hub','received_by_lab','accepted',
    'rejected','in_progress','on_hold','completed','failed','lost','cancel_requested','cancelled','note','call',
    'result_filed')),
  event_at timestamptz NOT NULL,
  seq bigint GENERATED ALWAYS AS IDENTITY,
  source text NOT NULL CHECK (source IN ('person','partner_message','system')),
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  document text CHECK (document IS NULL OR document IN ('rider_log','phone_call','signed_manifest',
    'their_portal','their_paper','sms','in_person','other')),
  message_id uuid,                               -- exchange_messages.id (0153), for partner_message
  reason_code text CHECK (reason_code IS NULL OR char_length(reason_code) BETWEEN 2 AND 60),
  note text CHECK (note IS NULL OR char_length(note) BETWEEN 1 AND 1000),
  applied boolean NOT NULL,                      -- EX-7: false = stored and shown, not applied
  recorded_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT lre_source CHECK (
    (source = 'person' AND actor_user_id IS NOT NULL) OR (source = 'partner_message' AND message_id IS NOT NULL)
    OR source = 'system')
);
CREATE INDEX IF NOT EXISTS lab_referral_events_referral ON public.lab_referral_events (referral_id, event_at, seq);

-- ─── Manifests (MF-1..MF-4) ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.lab_manifests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  number text NOT NULL CHECK (number ~ '^MF-[0-9]{4}-[0-9]{4,}$'),
  partner_id uuid NOT NULL REFERENCES public.lab_partners(id) ON DELETE RESTRICT,
  transport text NOT NULL CHECK (char_length(transport) BETWEEN 1 AND 80),
  packages integer CHECK (packages IS NULL OR packages > 0),
  state text NOT NULL DEFAULT 'open' CHECK (state IN ('open','sealed','handed_over','received','discrepancy')),
  sealed_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  sealed_at timestamptz,
  handed_to text CHECK (handed_to IS NULL OR char_length(handed_to) BETWEEN 2 AND 120),
  handed_at timestamptz,
  received jsonb,                                -- {how, by, at, condition[], count, note}
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT lab_manifests_number UNIQUE (hospital_id, number),
  CONSTRAINT lm_sealed CHECK (state = 'open' OR (sealed_by IS NOT NULL AND sealed_at IS NOT NULL)),
  CONSTRAINT lm_handed CHECK (state IN ('open','sealed') OR (handed_to IS NOT NULL AND handed_at IS NOT NULL))
);
CREATE TABLE IF NOT EXISTS public.lab_manifest_items (
  manifest_id uuid NOT NULL REFERENCES public.lab_manifests(id) ON DELETE RESTRICT,
  referral_id uuid NOT NULL REFERENCES public.lab_referrals(id) ON DELETE RESTRICT,
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  position integer NOT NULL CHECK (position > 0),
  added_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  added_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (manifest_id, referral_id),
  CONSTRAINT lmi_one_manifest UNIQUE (referral_id)
);
CREATE TABLE IF NOT EXISTS public.lab_manifest_prints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  manifest_id uuid NOT NULL REFERENCES public.lab_manifests(id) ON DELETE RESTRICT,
  copy boolean NOT NULL,
  printed_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  printed_at timestamptz NOT NULL DEFAULT now()
);

-- A sealed manifest cannot change (MF-3); an outbreak referral never joins one (RF-7, Law 10).
CREATE OR REPLACE FUNCTION public.lab_manifest_items_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE v_state text; v_routine boolean; v_partner uuid; v_mpartner uuid;
BEGIN
  IF TG_OP <> 'INSERT' THEN RAISE EXCEPTION 'lab_manifest_items is append-only'; END IF;
  SELECT state, partner_id INTO v_state, v_mpartner FROM public.lab_manifests WHERE id = NEW.manifest_id;
  IF v_state IS DISTINCT FROM 'open' THEN RAISE EXCEPTION 'manifest is sealed'; END IF;
  SELECT routine, partner_id INTO v_routine, v_partner FROM public.lab_referrals WHERE id = NEW.referral_id;
  IF NOT v_routine THEN RAISE EXCEPTION 'a high-risk referral never joins a routine manifest'; END IF;
  IF v_partner IS DISTINCT FROM v_mpartner THEN RAISE EXCEPTION 'referral and manifest go to different partners'; END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS lab_manifest_items_guard ON public.lab_manifest_items;
CREATE TRIGGER lab_manifest_items_guard BEFORE INSERT OR UPDATE OR DELETE ON public.lab_manifest_items
  FOR EACH ROW EXECUTE FUNCTION public.lab_manifest_items_guard();

-- The manifest's state only moves forward.
CREATE OR REPLACE FUNCTION public.lab_manifests_forward() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE rank_old int; rank_new int;
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'manifests are kept'; END IF;
  rank_old := array_position(ARRAY['open','sealed','handed_over','received'], CASE WHEN OLD.state = 'discrepancy' THEN 'received' ELSE OLD.state END);
  rank_new := array_position(ARRAY['open','sealed','handed_over','received'], CASE WHEN NEW.state = 'discrepancy' THEN 'received' ELSE NEW.state END);
  IF rank_new < rank_old OR NEW.id <> OLD.id OR NEW.hospital_id <> OLD.hospital_id OR NEW.number <> OLD.number
     OR NEW.partner_id <> OLD.partner_id THEN
    RAISE EXCEPTION 'manifest changes only forward';
  END IF;
  IF OLD.state <> 'open' AND (NEW.transport <> OLD.transport) THEN RAISE EXCEPTION 'manifest is sealed'; END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS lab_manifests_forward ON public.lab_manifests;
CREATE TRIGGER lab_manifests_forward BEFORE UPDATE OR DELETE ON public.lab_manifests
  FOR EACH ROW EXECUTE FUNCTION public.lab_manifests_forward();

-- ─── Live (LV-1, P11): {event, at} only ──────────────────────────────────
CREATE OR REPLACE FUNCTION public.lab_referral_live() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  BEGIN
    PERFORM realtime.send(jsonb_build_object('event', 'referral_updated', 'at', now()),
      'change', 'lab:' || NEW.hospital_id::text, true);
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS lab_referral_events_live ON public.lab_referral_events;
CREATE TRIGGER lab_referral_events_live AFTER INSERT ON public.lab_referral_events
  FOR EACH ROW EXECUTE FUNCTION public.lab_referral_live();

-- ─── Append-only, audit, RLS ─────────────────────────────────────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['lab_referral_events','lab_manifest_prints'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %1$s_no_mutation ON public.%1$I', t);
    EXECUTE format('CREATE TRIGGER %1$s_no_mutation BEFORE UPDATE OR DELETE ON public.%1$I
      FOR EACH ROW EXECUTE FUNCTION public.block_modify_append_only()', t);
  END LOOP;
  FOREACH t IN ARRAY ARRAY['lab_referrals','lab_referral_events','lab_manifests','lab_manifest_items',
    'lab_manifest_prints'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS audit_%1$s ON public.%1$I', t);
    EXECUTE format('CREATE TRIGGER audit_%1$s AFTER INSERT OR UPDATE OR DELETE ON public.%1$I
      FOR EACH ROW EXECUTE FUNCTION public.audit_log_changes()', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.%I FROM anon, authenticated', t);
    EXECUTE format('GRANT SELECT ON public.%I TO medsync_clinical_reader', t);
  END LOOP;
  -- Manifests are the lab's alone.
  FOREACH t IN ARRAY ARRAY['lab_manifests','lab_manifest_items','lab_manifest_prints'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS lab_read ON public.%I', t);
    EXECUTE format('CREATE POLICY lab_read ON public.%I FOR SELECT TO medsync_clinical_reader
      USING (hospital_id = (SELECT private.current_hospital_id()) AND (SELECT private.lab_reader()))', t);
  END LOOP;
END $$;

-- Referrals: the lab; a clinician for the patients they may open (RF-11, §5.5); never the hospital admin's rows.
DROP POLICY IF EXISTS lab_referrals_read ON public.lab_referrals;
CREATE POLICY lab_referrals_read ON public.lab_referrals FOR SELECT TO medsync_clinical_reader
  USING (hospital_id = (SELECT private.current_hospital_id())
         AND ((SELECT private.lab_reader())
              OR patient_user_id IN (SELECT private.accessible_patient_ids())));
DROP POLICY IF EXISTS lab_referral_events_read ON public.lab_referral_events;
CREATE POLICY lab_referral_events_read ON public.lab_referral_events FOR SELECT TO medsync_clinical_reader
  USING (hospital_id = (SELECT private.current_hospital_id())
         AND ((SELECT private.lab_reader())
              OR referral_id IN (SELECT r.id FROM public.lab_referrals r
                                  WHERE r.patient_user_id IN (SELECT private.accessible_patient_ids()))));

-- Aggregates for the hospital admin (§7 RLS table: counts only, no patient rows).
CREATE OR REPLACE FUNCTION private.lab_referral_counts(p_from timestamptz, p_to timestamptz)
RETURNS TABLE (sent integer, back integer, waiting integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT (count(*) FILTER (WHERE sent_at >= p_from AND sent_at < p_to))::int,
         (count(*) FILTER (WHERE completed_at >= p_from AND completed_at < p_to))::int,
         (count(*) FILTER (WHERE sent_at IS NOT NULL
            AND state NOT IN ('completed','failed','lost','cancelled','rejected')))::int
    FROM public.lab_referrals
   WHERE hospital_id = private.current_hospital_id()
     AND (private.hospital_admin_reader() OR private.lab_reader());
$$;
REVOKE ALL ON FUNCTION private.lab_referral_counts(timestamptz, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.lab_referral_counts(timestamptz, timestamptz) TO medsync_clinical_reader;
