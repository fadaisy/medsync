-- GATED — applied by the owner (`npm run db:migrate`), never auto-run.
-- 0303: paying for Plus through the one engine (patient app v2 §5.9, Step 10; ADR 0523). Plus is Tether's own
-- product, so its bill has no hospital: Tether is the merchant (the open item in payments-setup: Tether's own
-- merchant agreement). Until that agreement is signed nothing real moves: the sandbox adapter only, and
-- `mobilePayments` off. Everything else is 0299's engine unchanged: one intent per key, exactly-once callbacks,
-- one receipt per payment, a receipt counter with no gaps (Tether's own, apart from every hospital's).
--
-- The trial needs none of this: it starts with no card and ends with no charge (0300, S25). Plus never buys
-- care (MR9, S26): `entitlement_allows` is unchanged.

-- ─── 1. A membership bill: no hospital, the tier and period it buys ────────────────
ALTER TABLE public.bills DROP CONSTRAINT IF EXISTS bills_kind_check;
ALTER TABLE public.bills ADD CONSTRAINT bills_kind_check CHECK (kind IN ('visit','top_up','programme','membership'));
ALTER TABLE public.bills ALTER COLUMN hospital_id DROP NOT NULL;
ALTER TABLE public.bills ADD COLUMN IF NOT EXISTS membership_tier text
  CHECK (membership_tier IS NULL OR membership_tier IN ('plus_family','plus_care','family_care'));
ALTER TABLE public.bills ADD COLUMN IF NOT EXISTS membership_period text
  CHECK (membership_period IS NULL OR membership_period IN ('monthly','quarterly','yearly'));
ALTER TABLE public.bills DROP CONSTRAINT IF EXISTS bills_merchant;
ALTER TABLE public.bills ADD CONSTRAINT bills_merchant CHECK (
  (kind = 'membership') = (hospital_id IS NULL)
  AND (kind = 'membership') = (membership_tier IS NOT NULL AND membership_period IS NOT NULL));

ALTER TABLE public.bill_items DROP CONSTRAINT IF EXISTS bill_items_kind_check;
ALTER TABLE public.bill_items ADD CONSTRAINT bill_items_kind_check
  CHECK (kind IN ('consultation','new_patient_file','top_up','programme','programme_addon','membership'));

ALTER TABLE public.payment_intents ALTER COLUMN hospital_id DROP NOT NULL;
ALTER TABLE public.receipts ALTER COLUMN hospital_id DROP NOT NULL;
-- Tether's receipts number on their own (a hospital's never skip because of Plus).
CREATE UNIQUE INDEX IF NOT EXISTS receipts_tether_number ON public.receipts (number) WHERE hospital_id IS NULL;
CREATE TABLE IF NOT EXISTS public.tether_receipt_counter (
  one          boolean PRIMARY KEY DEFAULT true CHECK (one),
  last_number  integer NOT NULL DEFAULT 0 CHECK (last_number >= 0)
);
ALTER TABLE public.tether_receipt_counter ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tether_receipt_counter FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.tether_receipt_counter FROM anon, authenticated;

-- ─── 2. Make the bill from the approved price; the client never sends an amount ────
CREATE OR REPLACE FUNCTION public.pay_bill_membership(p_user uuid, p_tier text, p_period text)
  RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_amount integer; v_bill uuid;
BEGIN
  SELECT amount_ugx INTO v_amount FROM public.plus_prices
   WHERE tier = p_tier AND period = p_period AND approved_at IS NOT NULL AND effective_from <= current_date
   ORDER BY effective_from DESC LIMIT 1;
  IF v_amount IS NULL THEN RAISE EXCEPTION 'no approved price for % %', p_tier, p_period USING ERRCODE = '22023'; END IF;
  -- One open membership bill at a time: a second tap pays the same bill.
  SELECT id INTO v_bill FROM public.bills
   WHERE patient_user_id = p_user AND kind = 'membership' AND status IN ('open','part_paid')
     AND membership_tier = p_tier AND membership_period = p_period
   ORDER BY created_at DESC LIMIT 1;
  IF v_bill IS NOT NULL THEN RETURN v_bill; END IF;
  INSERT INTO public.bills (hospital_id, patient_user_id, kind, total_ugx, platform_share_ugx, membership_tier,
                            membership_period)
  VALUES (NULL, p_user, 'membership', v_amount, v_amount, p_tier, p_period)
  RETURNING id INTO v_bill;
  INSERT INTO public.bill_items (bill_id, kind, label, amount_ugx)
  VALUES (v_bill, 'membership', 'Tether Plus', v_amount);
  RETURN v_bill;
END $$;
REVOKE ALL ON FUNCTION public.pay_bill_membership(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pay_bill_membership(uuid, text, text) TO service_role;

-- ─── 3. The engine: Tether's own counter for a membership; the membership starts when paid ──
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
    IF b.hospital_id IS NULL THEN
      INSERT INTO public.tether_receipt_counter (one, last_number) VALUES (true, 1)
        ON CONFLICT (one) DO UPDATE SET last_number = public.tether_receipt_counter.last_number + 1
        RETURNING last_number INTO v_no;
    ELSE
      INSERT INTO public.receipt_counters (hospital_id, last_number) VALUES (b.hospital_id, 1)
        ON CONFLICT (hospital_id) DO UPDATE SET last_number = public.receipt_counters.last_number + 1
        RETURNING last_number INTO v_no;
    END IF;
    INSERT INTO public.receipts (hospital_id, number, bill_id, intent_id, total_ugx, method, reference, payer_user_id,
                                 item_label)
    VALUES (b.hospital_id, v_no, b.id, v.id, v.amount_ugx, coalesce(v.network, 'counter'), p_provider_ref,
            v.payer_user_id,
            CASE WHEN b.confidential THEN 'Clinic visit'
                 ELSE (SELECT label FROM public.bill_items WHERE bill_id = b.id ORDER BY amount_ugx DESC LIMIT 1) END);
    -- A paid membership bill starts (or extends) the period it bought; a trial in progress ends now, paid.
    IF b.kind = 'membership' AND b.status = 'paid' THEN
      INSERT INTO public.memberships (user_id, tier, period, status, period_ends_at, trial_ends_at, updated_at)
      VALUES (b.patient_user_id, b.membership_tier, b.membership_period, 'active',
              now() + CASE b.membership_period WHEN 'monthly' THEN interval '1 month'
                                               WHEN 'quarterly' THEN interval '3 months' ELSE interval '1 year' END,
              NULL, now())
      ON CONFLICT (user_id) DO UPDATE SET tier = excluded.tier, period = excluded.period, status = 'active',
        trial_ends_at = NULL,
        period_ends_at = greatest(coalesce(public.memberships.period_ends_at, now()), now())
          + CASE excluded.period WHEN 'monthly' THEN interval '1 month'
                                 WHEN 'quarterly' THEN interval '3 months' ELSE interval '1 year' END,
        updated_at = now();
    END IF;
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

-- ─── 4. The MFA gate every RLS table carries since 0288 (no client reads this table at all) ──
DROP POLICY IF EXISTS mfa_gate ON public.tether_receipt_counter;
CREATE POLICY mfa_gate ON public.tether_receipt_counter AS RESTRICTIVE FOR ALL TO authenticated
  USING ((SELECT public.caller_mfa_ok())) WITH CHECK ((SELECT public.caller_mfa_ok()));
