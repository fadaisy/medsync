-- 0109 — One menu, one record: labels, payment, identity at collection, high-risk warning, scan to receive and
-- the hospital's live lab channel (Lab Phase 2, ADRs 0255–0258; gate-a-proposal §3).
--
--   1. lab_labels: one label number per order, issued when first printed, voidable once (ID-1, ID-5, P13).
--   2. lab_payment_events: the order's payment state, newest event wins (PY-1, PY-4). Written at placement
--      when payment is collected; `emergency` is decided there from the order itself (PY-2).
--   3. lab_identity_checks: every label check, match or not (ID-3).
--   4. lab_high_risk_events: flag and clear per encounter (HR-1, HR-2).
--   5. specimens and specimen_events: payment state at collection, profile pinned at receipt, how it was
--      received, procedure followed (AP-5, SR-3).
--   6. lab:<hospital>: ids and event names only, for lab staff of that hospital (LV-1).
--
-- Event tables are append-only by trigger, including through the owner path. ADDITIVE and re-runnable.
-- GATED: owner-applied (`npm run db:migrate -- 0109`).

-- ─── 1. Labels ───────────────────────────────────────────────────────────
CREATE SEQUENCE IF NOT EXISTS public.lab_label_seq;
CREATE TABLE IF NOT EXISTS public.lab_labels (
  label_no text PRIMARY KEY DEFAULT ('L' || lpad(nextval('public.lab_label_seq')::text, 8, '0')),
  order_id uuid NOT NULL REFERENCES public.encounter_orders(id) ON DELETE RESTRICT,
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  patient_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  issued_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  issued_at timestamptz NOT NULL DEFAULT now(),
  voided_by uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  voided_at timestamptz,
  void_reason text CHECK (void_reason IS NULL OR char_length(void_reason) BETWEEN 3 AND 200),
  CONSTRAINT ll_void CHECK ((voided_at IS NULL) = (voided_by IS NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS lab_labels_live ON public.lab_labels (order_id) WHERE voided_at IS NULL;
-- Only the void fields may be set, and only once.
CREATE OR REPLACE FUNCTION private.lab_label_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' OR OLD.voided_at IS NOT NULL
     OR (to_jsonb(NEW) - 'voided_by' - 'voided_at' - 'void_reason')
        IS DISTINCT FROM (to_jsonb(OLD) - 'voided_by' - 'voided_at' - 'void_reason') THEN
    RAISE EXCEPTION 'lab_labels: a label is only ever voided, once';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS lab_labels_guard ON public.lab_labels;
CREATE TRIGGER lab_labels_guard BEFORE UPDATE OR DELETE ON public.lab_labels
  FOR EACH ROW EXECUTE FUNCTION private.lab_label_guard();

-- ─── 2–4. Event tables ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.lab_payment_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.encounter_orders(id) ON DELETE RESTRICT,
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  state text NOT NULL CHECK (state IN ('awaiting','paid','insured','waived','emergency')),
  receipt_no text CHECK (receipt_no IS NULL OR char_length(receipt_no) BETWEEN 1 AND 60),
  insurer text CHECK (insurer IS NULL OR char_length(insurer) BETWEEN 2 AND 120),
  authorisation_no text CHECK (authorisation_no IS NULL OR char_length(authorisation_no) BETWEEN 1 AND 60),
  reason text CHECK (reason IS NULL OR char_length(reason) BETWEEN 3 AND 200),
  approver_id uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  actor_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  client_key text UNIQUE,
  CONSTRAINT lpe_fields CHECK (
    (state <> 'paid' OR receipt_no IS NOT NULL) AND
    (state <> 'insured' OR (insurer IS NOT NULL AND authorisation_no IS NOT NULL)) AND
    (state <> 'waived' OR (reason IS NOT NULL AND approver_id IS NOT NULL)))
);
CREATE INDEX IF NOT EXISTS lab_payment_events_order ON public.lab_payment_events (order_id, recorded_at);
-- PY-2, PY-4: once an order is an emergency, nothing follows it.
CREATE OR REPLACE FUNCTION private.lab_payment_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.lab_payment_events WHERE order_id = NEW.order_id AND state = 'emergency') THEN
    RAISE EXCEPTION 'lab_payment_events: an emergency order is never held and its payment state never changes';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS lab_payment_events_emergency ON public.lab_payment_events;
CREATE TRIGGER lab_payment_events_emergency BEFORE INSERT ON public.lab_payment_events
  FOR EACH ROW EXECUTE FUNCTION private.lab_payment_guard();

CREATE TABLE IF NOT EXISTS public.lab_identity_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.encounter_orders(id) ON DELETE RESTRICT,
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  patient_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  label_typed text NOT NULL CHECK (char_length(label_typed) BETWEEN 1 AND 60),
  outcome text NOT NULL CHECK (outcome IN ('match','other_patient','other_order_same_patient','unknown_label','voided_label')),
  method text NOT NULL CHECK (method IN ('scan','typed')),
  wristband_checked boolean NOT NULL DEFAULT false,
  actor_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  client_key text UNIQUE
);
CREATE INDEX IF NOT EXISTS lab_identity_checks_order ON public.lab_identity_checks (order_id, recorded_at);

CREATE TABLE IF NOT EXISTS public.lab_high_risk_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  encounter_id uuid NOT NULL REFERENCES public.encounters(id) ON DELETE RESTRICT,
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  patient_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  kind text NOT NULL CHECK (kind IN ('flag','clear')),
  source text NOT NULL CHECK (source IN ('rule','manual')),
  rule_id text CHECK (rule_id IS NULL OR char_length(rule_id) BETWEEN 3 AND 60),
  reason text CHECK (reason IS NULL OR char_length(reason) BETWEEN 3 AND 300),
  actor_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  client_key text UNIQUE,
  CONSTRAINT lhre_reason CHECK ((source = 'rule' AND kind = 'flag' AND rule_id IS NOT NULL) OR reason IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS lab_high_risk_events_encounter ON public.lab_high_risk_events (encounter_id, recorded_at);

-- ─── 5. Specimens and receipts ───────────────────────────────────────────
ALTER TABLE public.specimens
  ADD COLUMN IF NOT EXISTS payment_state text
    CHECK (payment_state IS NULL OR payment_state IN ('not_required','awaiting','paid','insured','waived','emergency')),
  ADD COLUMN IF NOT EXISTS payment_reason text CHECK (payment_reason IS NULL OR char_length(payment_reason) BETWEEN 3 AND 200);
ALTER TABLE public.specimen_events
  ADD COLUMN IF NOT EXISTS profile_id uuid REFERENCES public.analyser_profiles(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS received_via text CHECK (received_via IS NULL OR received_via IN ('scan','click')),
  ADD COLUMN IF NOT EXISTS procedure_followed_at timestamptz,
  ADD COLUMN IF NOT EXISTS reversal_of uuid REFERENCES public.specimen_events(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS receive_reason text CHECK (receive_reason IS NULL OR char_length(receive_reason) BETWEEN 3 AND 200);
-- SR-5: an undo is an event of its own kind.
ALTER TABLE public.specimen_events DROP CONSTRAINT IF EXISTS specimen_events_kind_check;
ALTER TABLE public.specimen_events ADD CONSTRAINT specimen_events_kind_check
  CHECK (kind IN ('received','rejected','receipt_undone'));
ALTER TABLE public.specimen_events DROP CONSTRAINT IF EXISTS se_undo;
ALTER TABLE public.specimen_events ADD CONSTRAINT se_undo CHECK ((kind = 'receipt_undone') = (reversal_of IS NOT NULL));

-- ─── Append-only, audit, RLS ─────────────────────────────────────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['lab_payment_events','lab_identity_checks','lab_high_risk_events'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %1$s_no_mutation ON public.%1$I', t);
    EXECUTE format('CREATE TRIGGER %1$s_no_mutation BEFORE UPDATE OR DELETE ON public.%1$I
      FOR EACH ROW EXECUTE FUNCTION public.block_modify_append_only()', t);
  END LOOP;
  FOREACH t IN ARRAY ARRAY['lab_labels','lab_payment_events','lab_identity_checks','lab_high_risk_events'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS audit_%1$s ON public.%1$I', t);
    EXECUTE format('CREATE TRIGGER audit_%1$s AFTER INSERT OR UPDATE OR DELETE ON public.%1$I
      FOR EACH ROW EXECUTE FUNCTION public.audit_log_changes()', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.%I FROM anon, authenticated', t);
    EXECUTE format('GRANT SELECT ON public.%I TO medsync_clinical_reader', t);
  END LOOP;
END $$;
DROP POLICY IF EXISTS ll_select ON public.lab_labels;
CREATE POLICY ll_select ON public.lab_labels FOR SELECT TO medsync_clinical_reader
  USING (hospital_id = (SELECT private.current_hospital_id())
         AND patient_user_id IN (SELECT private.accessible_patient_ids()));
DROP POLICY IF EXISTS lpe_select ON public.lab_payment_events;
CREATE POLICY lpe_select ON public.lab_payment_events FOR SELECT TO medsync_clinical_reader
  USING (hospital_id = (SELECT private.current_hospital_id())
         AND EXISTS (SELECT 1 FROM public.encounter_orders o WHERE o.id = order_id
                     AND o.patient_user_id IN (SELECT private.accessible_patient_ids())));
DROP POLICY IF EXISTS lic_select ON public.lab_identity_checks;
CREATE POLICY lic_select ON public.lab_identity_checks FOR SELECT TO medsync_clinical_reader
  USING (hospital_id = (SELECT private.current_hospital_id())
         AND patient_user_id IN (SELECT private.accessible_patient_ids()));
DROP POLICY IF EXISTS lhre_select ON public.lab_high_risk_events;
CREATE POLICY lhre_select ON public.lab_high_risk_events FOR SELECT TO medsync_clinical_reader
  USING (hospital_id = (SELECT private.current_hospital_id())
         AND patient_user_id IN (SELECT private.accessible_patient_ids()));

-- ─── 6. The live lab channel ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.lab_live_broadcast()
  RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_specimen uuid;
  v_event text;
BEGIN
  IF TG_TABLE_NAME = 'specimens' THEN
    v_specimen := NEW.id; v_event := 'collected';
  ELSIF TG_TABLE_NAME = 'specimen_events' THEN
    v_specimen := NEW.specimen_id; v_event := NEW.kind;
  ELSE
    v_specimen := NEW.specimen_id;
    v_event := CASE WHEN NEW.status = 'preliminary' THEN 'resulted' ELSE 'released' END;
  END IF;
  IF v_specimen IS NULL THEN RETURN NULL; END IF;
  BEGIN
    PERFORM realtime.send(jsonb_build_object('specimenId', v_specimen, 'event', v_event, 'at', now()),
      'change', 'lab:' || NEW.hospital_id::text, true);
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS specimens_lab_live ON public.specimens;
CREATE TRIGGER specimens_lab_live AFTER INSERT ON public.specimens
  FOR EACH ROW EXECUTE FUNCTION public.lab_live_broadcast();
DROP TRIGGER IF EXISTS specimen_events_lab_live ON public.specimen_events;
CREATE TRIGGER specimen_events_lab_live AFTER INSERT ON public.specimen_events
  FOR EACH ROW EXECUTE FUNCTION public.lab_live_broadcast();
DROP TRIGGER IF EXISTS diagnostic_reports_lab_live ON public.diagnostic_reports;
CREATE TRIGGER diagnostic_reports_lab_live AFTER INSERT ON public.diagnostic_reports
  FOR EACH ROW WHEN (NEW.kind = 'lab') EXECUTE FUNCTION public.lab_live_broadcast();

-- Lab staff of that hospital (the lab_tech role 0097 keeps in step with lab affiliations). A function, so the
-- predicate is testable where the realtime schema is absent (LV-5).
CREATE OR REPLACE FUNCTION private.may_hear_lab(p_topic text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT p_topic ~ '^lab:[0-9a-f-]{36}$' AND EXISTS (
    SELECT 1 FROM public.user_roles r
     WHERE r.user_id = auth.uid() AND r.role = 'lab_tech'
       AND r.hospital_id::text = substring(p_topic FROM 5));
$$;
REVOKE ALL ON FUNCTION private.may_hear_lab(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.may_hear_lab(text) TO authenticated;

DO $do$
BEGIN
  IF to_regclass('realtime.messages') IS NOT NULL THEN
    EXECUTE 'DROP POLICY IF EXISTS lab_realtime_receive ON realtime.messages';
    EXECUTE $p$
      CREATE POLICY lab_realtime_receive ON realtime.messages
        FOR SELECT TO authenticated
        USING (realtime.messages.extension = 'broadcast'
               AND (SELECT realtime.topic()) LIKE 'lab:%'
               AND private.may_hear_lab((SELECT realtime.topic())))
    $p$;
  END IF;
END
$do$;
