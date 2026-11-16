-- GATED — applied by the owner (`npm run db:migrate`), never auto-run.
-- 0299: patient payments core (patient app v2 §8.2, laws PA1–PA6; docs/patient-app/gate-a-proposal.md §3).
--
-- Tether never holds patient money (PA1): money goes from the patient's Mobile Money to the hospital's own
-- collection account through a licensed provider. These tables hold bills, payment requests, the provider's
-- callbacks, receipts and refund requests, never a balance or a wallet. Patients and staff only READ them
-- (PA5): every write is a SECURITY DEFINER function run by the service role from an Edge Function.
-- Amounts come only from the booking's fee snapshot (appointments.quoted_fee_ugx, fee resolution, ADR 0092).

-- ─── 1. Refund approver (D-PA-05): a per-hospital designation ───────────────────
ALTER TABLE public.hospital_designations DROP CONSTRAINT IF EXISTS hospital_designations_role_check;
ALTER TABLE public.hospital_designations ADD CONSTRAINT hospital_designations_role_check CHECK (role IN
  ('data_protection_lead','ipc_lead','ipc_link_nurse','surveillance_focal_person','accounts_supervisor'));

-- ─── 2. The hospital's provider account (no secrets here; keys live in the function's environment) ──
CREATE TABLE IF NOT EXISTS public.hospital_payment_accounts (
  hospital_id   uuid PRIMARY KEY REFERENCES public.hospitals(id) ON DELETE CASCADE,
  provider      text NOT NULL CHECK (provider IN ('sandbox','flutterwave','pesapal')),
  live          boolean NOT NULL DEFAULT false,
  merchant_ref  text,
  networks      text[] NOT NULL DEFAULT ARRAY['mtn','airtel'],
  refund_cutoff_hours integer NOT NULL DEFAULT 24 CHECK (refund_cutoff_hours BETWEEN 0 AND 168),
  enabled       boolean NOT NULL DEFAULT false,
  updated_by    uuid REFERENCES auth.users(id),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hpa_live_needs_real CHECK (NOT live OR provider <> 'sandbox')
);

-- ─── 3. Bills ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.bills (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id     uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  appointment_id  uuid REFERENCES public.appointments(id) ON DELETE RESTRICT,
  patient_user_id uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  provisional_patient_id uuid REFERENCES public.provisional_patients(id) ON DELETE RESTRICT,
  kind            text NOT NULL CHECK (kind IN ('visit','top_up','programme')),
  status          text NOT NULL DEFAULT 'open' CHECK (status IN ('open','paid','part_paid','waived','refunded')),
  currency        text NOT NULL DEFAULT 'UGX' CHECK (currency = 'UGX'),
  total_ugx       integer NOT NULL CHECK (total_ugx > 0),
  paid_ugx        integer NOT NULL DEFAULT 0 CHECK (paid_ugx >= 0),
  refunded_ugx    integer NOT NULL DEFAULT 0 CHECK (refunded_ugx >= 0),
  confidential    boolean NOT NULL DEFAULT false,
  -- Tether's platform share, paid by the provider's split at settlement; Tether never holds the rest (ADR 0516).
  platform_share_ugx integer NOT NULL DEFAULT 0 CHECK (platform_share_ugx >= 0),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT bills_share_le_total CHECK (platform_share_ugx <= total_ugx),
  CONSTRAINT bills_one_patient CHECK ((patient_user_id IS NOT NULL)::int + (provisional_patient_id IS NOT NULL)::int = 1),
  CONSTRAINT bills_paid_le_total CHECK (paid_ugx <= total_ugx),
  CONSTRAINT bills_refund_le_paid CHECK (refunded_ugx <= paid_ugx)
);
CREATE UNIQUE INDEX IF NOT EXISTS bills_one_visit_bill ON public.bills (appointment_id) WHERE kind = 'visit';
CREATE INDEX IF NOT EXISTS bills_patient ON public.bills (patient_user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.bill_items (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bill_id     uuid NOT NULL REFERENCES public.bills(id) ON DELETE CASCADE,
  kind        text NOT NULL CHECK (kind IN ('consultation','new_patient_file','top_up','programme','programme_addon')),
  label       text NOT NULL CHECK (length(label) BETWEEN 1 AND 80),
  amount_ugx  integer NOT NULL CHECK (amount_ugx > 0)
);

-- ─── 4. Payment intents (one per attempt; the idempotency key makes a retry the same attempt) ──
CREATE TABLE IF NOT EXISTS public.payment_intents (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bill_id         uuid NOT NULL REFERENCES public.bills(id) ON DELETE RESTRICT,
  hospital_id     uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  amount_ugx      integer NOT NULL CHECK (amount_ugx > 0),
  channel         text NOT NULL CHECK (channel IN ('app','phone_prompt','counter')),
  network         text CHECK (network IN ('mtn','airtel')),
  msisdn_masked   text CHECK (msisdn_masked IS NULL OR length(msisdn_masked) <= 20),
  payer_user_id   uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  idempotency_key text NOT NULL CHECK (length(idempotency_key) BETWEEN 8 AND 80),
  provider        text NOT NULL CHECK (provider IN ('sandbox','flutterwave','pesapal','counter')),
  provider_ref    text,
  status          text NOT NULL DEFAULT 'created'
                  CHECK (status IN ('created','prompted','succeeded','failed','expired')),
  failure_reason  text CHECK (failure_reason IS NULL OR failure_reason IN
                  ('declined','not_enough_balance','timeout','amount_mismatch','provider_error')),
  expires_at      timestamptz NOT NULL DEFAULT now() + interval '10 minutes',
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (idempotency_key)
);
CREATE UNIQUE INDEX IF NOT EXISTS payment_intents_provider_ref ON public.payment_intents (provider, provider_ref)
  WHERE provider_ref IS NOT NULL;
CREATE INDEX IF NOT EXISTS payment_intents_bill ON public.payment_intents (bill_id);

-- ─── 5. Provider callbacks, raw and append-only; one row per provider event (exactly once, PA4) ──
CREATE TABLE IF NOT EXISTS public.payment_callbacks (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider      text NOT NULL,
  event_id      text NOT NULL,
  provider_ref  text,
  outcome       text NOT NULL CHECK (outcome IN ('succeeded','failed')),
  amount_ugx    integer,
  verified      boolean NOT NULL,
  result        text NOT NULL,
  received_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, event_id)
);

-- ─── 6. Receipts: numbered per hospital without gaps or duplicates ──────────────
CREATE TABLE IF NOT EXISTS public.receipt_counters (
  hospital_id uuid PRIMARY KEY REFERENCES public.hospitals(id) ON DELETE CASCADE,
  last_number integer NOT NULL DEFAULT 0 CHECK (last_number >= 0)
);

CREATE TABLE IF NOT EXISTS public.receipts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id     uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  number          integer NOT NULL CHECK (number > 0),
  bill_id         uuid NOT NULL REFERENCES public.bills(id) ON DELETE RESTRICT,
  intent_id       uuid NOT NULL UNIQUE REFERENCES public.payment_intents(id) ON DELETE RESTRICT,
  total_ugx       integer NOT NULL CHECK (total_ugx > 0),
  method          text NOT NULL CHECK (method IN ('mtn','airtel','counter')),
  reference       text,
  payer_user_id   uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  item_label      text NOT NULL,
  efris_number    text,
  efris_qr        text,
  issued_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (hospital_id, number)
);

-- ─── 7. Refund requests (PA6: a second person approves, unless the hospital cancelled) ──
CREATE TABLE IF NOT EXISTS public.refund_requests (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_id    uuid NOT NULL REFERENCES public.receipts(id) ON DELETE RESTRICT,
  hospital_id   uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  amount_ugx    integer NOT NULL CHECK (amount_ugx > 0),
  reason        text NOT NULL CHECK (reason IN ('patient_cancel','hospital_cancel','staff')),
  requested_by  uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  automatic     boolean NOT NULL DEFAULT false,
  status        text NOT NULL DEFAULT 'waiting'
                CHECK (status IN ('waiting','approved','declined','sent','failed')),
  decided_by    uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  decided_at    timestamptz,
  provider_ref  text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT refund_second_person CHECK (decided_by IS NULL OR requested_by IS NULL OR decided_by <> requested_by),
  CONSTRAINT refund_auto_only_hospital CHECK (NOT automatic OR reason = 'hospital_cancel')
);

-- ─── 8. Audit, RLS, grants: read-only to clients ─────────────────────────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['hospital_payment_accounts','bills','bill_items','payment_intents','payment_callbacks',
    'receipt_counters','receipts','refund_requests']
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS audit_%1$s ON public.%1$s', t);
    EXECUTE format('CREATE TRIGGER audit_%1$s AFTER INSERT OR UPDATE OR DELETE ON public.%1$s
      FOR EACH ROW EXECUTE FUNCTION public.audit_log_changes()', t);
    EXECUTE format('ALTER TABLE public.%s ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE public.%s FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%s FROM anon, authenticated', t);
  END LOOP;
END $$;

-- Staff of the hospital (desk, floor, cash office later) read its money rows; nobody writes from a client.
CREATE OR REPLACE FUNCTION private.pay_staff_reads(p_hospital uuid)
  RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT public.user_has_role('superadmin') OR public.user_has_role('hospital_admin', p_hospital)
      OR public.is_hospital_staff(p_hospital);
$$;
REVOKE ALL ON FUNCTION private.pay_staff_reads(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.pay_staff_reads(uuid) TO authenticated;

-- The patient, or a household member who paid this bill (D-PA-09).
CREATE OR REPLACE FUNCTION private.pay_patient_reads(p_bill uuid)
  RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT auth.uid() IS NOT NULL AND (
    EXISTS (SELECT 1 FROM public.bills b WHERE b.id = p_bill AND b.patient_user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.payment_intents i WHERE i.bill_id = p_bill AND i.payer_user_id = auth.uid()));
$$;
REVOKE ALL ON FUNCTION private.pay_patient_reads(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.pay_patient_reads(uuid) TO authenticated;

GRANT SELECT ON public.bills, public.bill_items, public.payment_intents, public.receipts, public.refund_requests,
  public.hospital_payment_accounts TO authenticated;

DROP POLICY IF EXISTS bills_read ON public.bills;
CREATE POLICY bills_read ON public.bills FOR SELECT TO authenticated
  USING (private.pay_patient_reads(id) OR private.pay_staff_reads(hospital_id));
DROP POLICY IF EXISTS bill_items_read ON public.bill_items;
CREATE POLICY bill_items_read ON public.bill_items FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.bills b WHERE b.id = bill_id
    AND (private.pay_patient_reads(b.id) OR private.pay_staff_reads(b.hospital_id))));
DROP POLICY IF EXISTS payment_intents_read ON public.payment_intents;
CREATE POLICY payment_intents_read ON public.payment_intents FOR SELECT TO authenticated
  USING (payer_user_id = auth.uid() OR private.pay_patient_reads(bill_id) OR private.pay_staff_reads(hospital_id));
DROP POLICY IF EXISTS receipts_read ON public.receipts;
CREATE POLICY receipts_read ON public.receipts FOR SELECT TO authenticated
  USING (private.pay_patient_reads(bill_id) OR private.pay_staff_reads(hospital_id));
DROP POLICY IF EXISTS refund_requests_read ON public.refund_requests;
CREATE POLICY refund_requests_read ON public.refund_requests FOR SELECT TO authenticated
  USING (private.pay_staff_reads(hospital_id) OR EXISTS (SELECT 1 FROM public.receipts r
    WHERE r.id = receipt_id AND private.pay_patient_reads(r.bill_id)));
DROP POLICY IF EXISTS hpa_read ON public.hospital_payment_accounts;
CREATE POLICY hpa_read ON public.hospital_payment_accounts FOR SELECT TO authenticated
  USING (private.pay_staff_reads(hospital_id));
-- payment_callbacks and receipt_counters: no policy, so no client reads them at all.

-- ─── 9. One payment truth (PA5): what every surface reads per appointment ─────────
CREATE OR REPLACE VIEW public.payment_status WITH (security_invoker = true) AS
SELECT b.appointment_id, b.hospital_id, b.id AS bill_id, b.kind, b.status, b.total_ugx, b.paid_ugx,
       b.refunded_ugx, b.confidential,
       (SELECT r.method FROM public.receipts r WHERE r.bill_id = b.id ORDER BY r.issued_at DESC LIMIT 1) AS method,
       (SELECT r.number FROM public.receipts r WHERE r.bill_id = b.id ORDER BY r.issued_at DESC LIMIT 1) AS receipt_number,
       (SELECT i.channel FROM public.payment_intents i WHERE i.bill_id = b.id AND i.status = 'succeeded'
          ORDER BY i.updated_at DESC LIMIT 1) AS paid_channel
FROM public.bills b;
GRANT SELECT ON public.payment_status TO authenticated;

-- ─── 10. Writes: SECURITY DEFINER, service role only ──────────────────────────────

-- A visit bill from the booking's fee snapshot. Idempotent: a second call returns the same bill.
CREATE OR REPLACE FUNCTION public.pay_bill_for_appointment(p_appointment uuid)
  RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE a record; v_bill uuid; v_conf boolean;
BEGIN
  SELECT id INTO v_bill FROM public.bills WHERE appointment_id = p_appointment AND kind = 'visit';
  IF v_bill IS NOT NULL THEN RETURN v_bill; END IF;
  SELECT * INTO a FROM public.appointments WHERE id = p_appointment;
  IF NOT FOUND THEN RAISE EXCEPTION 'appointment not found' USING ERRCODE = 'P0002'; END IF;
  IF a.quoted_fee_ugx IS NULL OR a.quoted_fee_ugx <= 0 THEN RETURN NULL; END IF; -- free: no bill
  SELECT coalesce(bool_or(sl.confidential), false) INTO v_conf
    FROM public.service_lines sl WHERE sl.department_id = a.department_id;
  INSERT INTO public.bills (hospital_id, appointment_id, patient_user_id, provisional_patient_id, kind, total_ugx,
                            confidential)
  VALUES (a.hospital_id, a.id, a.patient_user_id, a.provisional_patient_id, 'visit', a.quoted_fee_ugx, v_conf)
  RETURNING id INTO v_bill;
  INSERT INTO public.bill_items (bill_id, kind, label, amount_ugx)
  VALUES (v_bill, 'consultation', coalesce(nullif(a.quoted_fee_label, ''), 'Consultation'), a.quoted_fee_ugx);
  RETURN v_bill;
END $$;

-- A specialist top-up (P3). The amount is the fee difference the Edge Function resolves with fees.ts.
CREATE OR REPLACE FUNCTION public.pay_bill_top_up(p_appointment uuid, p_amount integer, p_label text)
  RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE a record; v_bill uuid; v_conf boolean;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'top-up must be positive' USING ERRCODE = '22023'; END IF;
  SELECT * INTO a FROM public.appointments WHERE id = p_appointment;
  IF NOT FOUND THEN RAISE EXCEPTION 'appointment not found' USING ERRCODE = 'P0002'; END IF;
  SELECT confidential INTO v_conf FROM public.bills WHERE appointment_id = p_appointment AND kind = 'visit';
  INSERT INTO public.bills (hospital_id, appointment_id, patient_user_id, provisional_patient_id, kind, total_ugx,
                            confidential)
  VALUES (a.hospital_id, a.id, a.patient_user_id, a.provisional_patient_id, 'top_up', p_amount, coalesce(v_conf, false))
  RETURNING id INTO v_bill;
  INSERT INTO public.bill_items (bill_id, kind, label, amount_ugx) VALUES (v_bill, 'top_up', p_label, p_amount);
  RETURN v_bill;
END $$;

-- Start (or return) a payment attempt. Same idempotency key, same attempt (PA4).
CREATE OR REPLACE FUNCTION public.pay_intent_start(p_bill uuid, p_key text, p_channel text, p_network text,
  p_msisdn_masked text, p_payer uuid, p_provider text)
  RETURNS public.payment_intents LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE b record; v public.payment_intents;
BEGIN
  SELECT * INTO v FROM public.payment_intents WHERE idempotency_key = p_key;
  IF FOUND THEN
    IF v.bill_id <> p_bill THEN RAISE EXCEPTION 'key reused for another bill' USING ERRCODE = '23505'; END IF;
    RETURN v;
  END IF;
  SELECT * INTO b FROM public.bills WHERE id = p_bill FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'bill not found' USING ERRCODE = 'P0002'; END IF;
  IF b.status NOT IN ('open','part_paid') THEN RAISE EXCEPTION 'bill is %', b.status USING ERRCODE = '22023'; END IF;
  -- A payer other than the patient must be their booking agent (D-PA-09; Plus Family is checked in the function).
  IF p_payer IS NOT NULL AND p_payer IS DISTINCT FROM b.patient_user_id AND NOT EXISTS (
    SELECT 1 FROM public.booking_agents g WHERE g.agent_user_id = p_payer AND g.revoked_at IS NULL
      AND (g.patient_user_id = b.patient_user_id OR g.provisional_patient_id = b.provisional_patient_id))
  THEN RAISE EXCEPTION 'payer is not in this household' USING ERRCODE = '42501'; END IF;
  INSERT INTO public.payment_intents (bill_id, hospital_id, amount_ugx, channel, network, msisdn_masked, payer_user_id,
                                      idempotency_key, provider)
  VALUES (b.id, b.hospital_id, b.total_ugx - b.paid_ugx, p_channel, p_network, p_msisdn_masked, p_payer, p_key,
          p_provider)
  RETURNING * INTO v;
  RETURN v;
END $$;

CREATE OR REPLACE FUNCTION public.pay_intent_prompted(p_intent uuid, p_provider_ref text)
  RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
  UPDATE public.payment_intents SET status = 'prompted', provider_ref = p_provider_ref, updated_at = now()
   WHERE id = p_intent AND status = 'created';
$$;

-- Apply one provider event, exactly once (PA4). Returns what happened, for the log and the tests:
-- 'paid' | 'failed' | 'duplicate' | 'unknown_intent' | 'late' | 'unverified' | 'amount_mismatch'.
CREATE OR REPLACE FUNCTION public.pay_apply_event(p_provider text, p_event_id text, p_provider_ref text,
  p_outcome text, p_amount integer, p_verified boolean, p_reason text DEFAULT NULL)
  RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v public.payment_intents; b public.bills; v_result text; v_no integer;
BEGIN
  IF EXISTS (SELECT 1 FROM public.payment_callbacks WHERE provider = p_provider AND event_id = p_event_id) THEN
    RETURN 'duplicate';
  END IF;
  SELECT * INTO v FROM public.payment_intents WHERE provider = p_provider AND provider_ref = p_provider_ref FOR UPDATE;
  IF NOT p_verified THEN v_result := 'unverified';
  ELSIF NOT FOUND THEN v_result := 'unknown_intent';
  ELSIF v.status IN ('succeeded','failed','expired') THEN v_result := 'late';
  ELSIF p_outcome = 'succeeded' AND p_amount IS DISTINCT FROM v.amount_ugx THEN
    UPDATE public.payment_intents SET status = 'failed', failure_reason = 'amount_mismatch', updated_at = now()
     WHERE id = v.id;
    v_result := 'amount_mismatch';
  ELSIF p_outcome = 'succeeded' THEN
    UPDATE public.payment_intents SET status = 'succeeded', updated_at = now() WHERE id = v.id;
    UPDATE public.bills SET paid_ugx = paid_ugx + v.amount_ugx,
           status = CASE WHEN paid_ugx + v.amount_ugx >= total_ugx THEN 'paid' ELSE 'part_paid' END,
           updated_at = now()
     WHERE id = v.bill_id RETURNING * INTO b;
    INSERT INTO public.receipt_counters (hospital_id, last_number) VALUES (b.hospital_id, 1)
      ON CONFLICT (hospital_id) DO UPDATE SET last_number = public.receipt_counters.last_number + 1
      RETURNING last_number INTO v_no;
    INSERT INTO public.receipts (hospital_id, number, bill_id, intent_id, total_ugx, method, reference, payer_user_id,
                                 item_label)
    VALUES (b.hospital_id, v_no, b.id, v.id, v.amount_ugx, coalesce(v.network, 'counter'), p_provider_ref,
            v.payer_user_id,
            CASE WHEN b.confidential THEN 'Clinic visit'
                 ELSE (SELECT label FROM public.bill_items WHERE bill_id = b.id ORDER BY amount_ugx DESC LIMIT 1) END);
    v_result := 'paid';
  ELSE
    UPDATE public.payment_intents SET status = 'failed',
           failure_reason = CASE WHEN p_reason IN ('declined','not_enough_balance','timeout','provider_error')
                                 THEN p_reason ELSE 'declined' END,
           updated_at = now()
     WHERE id = v.id;
    v_result := 'failed';
  END IF;
  INSERT INTO public.payment_callbacks (provider, event_id, provider_ref, outcome, amount_ugx, verified, result)
  VALUES (p_provider, p_event_id, p_provider_ref, p_outcome, p_amount, p_verified, v_result);
  RETURN v_result;
END $$;

-- Expire prompts nobody answered (S13): the booking is untouched; the bill stays open.
CREATE OR REPLACE FUNCTION public.pay_expire_stale(p_now timestamptz DEFAULT now())
  RETURNS integer LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
  WITH x AS (UPDATE public.payment_intents SET status = 'expired', failure_reason = 'timeout', updated_at = p_now
              WHERE status IN ('created','prompted') AND expires_at <= p_now RETURNING 1)
  SELECT count(*)::int FROM x;
$$;

-- Ask for a refund (P5). Never more than what is left on the receipt (S15).
CREATE OR REPLACE FUNCTION public.pay_refund_request(p_receipt uuid, p_amount integer, p_reason text,
  p_requested_by uuid)
  RETURNS public.refund_requests LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE r public.receipts; v_open integer; v public.refund_requests; v_auto boolean := (p_reason = 'hospital_cancel');
BEGIN
  SELECT * INTO r FROM public.receipts WHERE id = p_receipt FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'receipt not found' USING ERRCODE = 'P0002'; END IF;
  SELECT coalesce(sum(amount_ugx), 0) INTO v_open FROM public.refund_requests
   WHERE receipt_id = p_receipt AND status <> 'declined' AND status <> 'failed';
  IF p_amount <= 0 OR v_open + p_amount > r.total_ugx THEN
    RAISE EXCEPTION 'refund over the receipt' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.refund_requests (receipt_id, hospital_id, amount_ugx, reason, requested_by, automatic, status,
                                      decided_at)
  VALUES (r.id, r.hospital_id, p_amount, p_reason, p_requested_by, v_auto,
          CASE WHEN v_auto THEN 'approved' ELSE 'waiting' END, CASE WHEN v_auto THEN now() END)
  RETURNING * INTO v;
  RETURN v;
END $$;

-- The accounts supervisor decides (D-PA-05); never the person who asked (PA6).
CREATE OR REPLACE FUNCTION public.pay_refund_decide(p_refund uuid, p_actor uuid, p_approve boolean)
  RETURNS public.refund_requests LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v public.refund_requests;
BEGIN
  SELECT * INTO v FROM public.refund_requests WHERE id = p_refund FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'refund not found' USING ERRCODE = 'P0002'; END IF;
  IF v.status <> 'waiting' THEN RAISE EXCEPTION 'refund is %', v.status USING ERRCODE = '22023'; END IF;
  IF v.requested_by = p_actor THEN RAISE EXCEPTION 'a second person decides' USING ERRCODE = '42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.hospital_designations h WHERE h.hospital_id = v.hospital_id
      AND h.user_id = p_actor AND h.role = 'accounts_supervisor'
      AND h.starts_on <= current_date AND (h.ends_on IS NULL OR h.ends_on >= current_date)) THEN
    RAISE EXCEPTION 'only the accounts supervisor decides' USING ERRCODE = '42501';
  END IF;
  UPDATE public.refund_requests SET status = CASE WHEN p_approve THEN 'approved' ELSE 'declined' END,
         decided_by = p_actor, decided_at = now(), updated_at = now()
   WHERE id = p_refund RETURNING * INTO v;
  RETURN v;
END $$;

-- The provider confirmed the money went back; the bill records it.
CREATE OR REPLACE FUNCTION public.pay_refund_sent(p_refund uuid, p_provider_ref text, p_ok boolean)
  RETURNS public.refund_requests LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v public.refund_requests;
BEGIN
  SELECT * INTO v FROM public.refund_requests WHERE id = p_refund FOR UPDATE;
  IF NOT FOUND OR v.status <> 'approved' THEN RETURN v; END IF; -- only an approved refund moves money, once
  UPDATE public.refund_requests SET status = CASE WHEN p_ok THEN 'sent' ELSE 'failed' END,
         provider_ref = p_provider_ref, updated_at = now() WHERE id = p_refund RETURNING * INTO v;
  IF p_ok THEN
    UPDATE public.bills b SET refunded_ugx = b.refunded_ugx + v.amount_ugx,
           status = CASE WHEN b.refunded_ugx + v.amount_ugx >= b.paid_ugx THEN 'refunded' ELSE b.status END,
           updated_at = now()
      FROM public.receipts r WHERE r.id = v.receipt_id AND b.id = r.bill_id;
  END IF;
  RETURN v;
END $$;

DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY['pay_bill_for_appointment(uuid)','pay_bill_top_up(uuid,integer,text)',
    'pay_intent_start(uuid,text,text,text,text,uuid,text)','pay_intent_prompted(uuid,text)',
    'pay_apply_event(text,text,text,text,integer,boolean,text)','pay_expire_stale(timestamptz)',
    'pay_refund_request(uuid,integer,text,uuid)','pay_refund_decide(uuid,uuid,boolean)',
    'pay_refund_sent(uuid,text,boolean)']
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon, authenticated', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO service_role', f);
  END LOOP;
END $$;
