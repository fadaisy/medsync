-- GATED — applied by the owner (`npm run db:migrate`), never auto-run.
-- 0300: Tether membership, Plus prices and entitlements; Questions for the doctor (patient app v2 §5.5, §5.9,
-- §8.1; laws MR9, D-MR-08 as amended at GATE A (booking for household members stays free), D-MR-09, D-MR-10,
-- D-PA-10).
--
-- Plus never buys care (MR9): `entitlement_allows` answers true for every protected feature whatever the tier,
-- and the tier only adds the Plus extras. Prices live on the server (D-MR-10) as owner-approved rows; the app
-- bundle holds none. Paying for Plus goes through 0299's engine at Step 10 (after the trial; no card, no
-- automatic charge, D-MR-09).

-- ─── 1. Plus prices (UGX; yearly = 10 months) ───────────────────────────────────
CREATE TABLE IF NOT EXISTS public.plus_prices (
  tier         text NOT NULL CHECK (tier IN ('plus_family','plus_care','family_care')),
  period       text NOT NULL CHECK (period IN ('monthly','yearly')),
  amount_ugx   integer NOT NULL CHECK (amount_ugx > 0),
  effective_from date NOT NULL DEFAULT current_date,
  approved_by  uuid REFERENCES auth.users(id),
  approved_at  timestamptz,
  PRIMARY KEY (tier, period, effective_from)
);
-- Draft prices for the owner to approve (approved_by stays NULL until then; the app shows only approved rows).
-- Benchmarks: a medical officer visit is about UGX 20,000-30,000 (UMDPC proposed GP cap UGX 30,000), so the
-- dearest monthly plan costs less than a third of one visit.
INSERT INTO public.plus_prices (tier, period, amount_ugx) VALUES
  ('plus_family','monthly',3000), ('plus_family','yearly',30000),
  ('plus_care','monthly',5000),   ('plus_care','yearly',50000),
  ('family_care','monthly',7000), ('family_care','yearly',70000)
ON CONFLICT DO NOTHING;

-- ─── 2. Memberships ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.memberships (
  user_id         uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  tier            text NOT NULL DEFAULT 'basic' CHECK (tier IN ('basic','plus_family','plus_care','family_care')),
  period          text CHECK (period IN ('monthly','yearly')),
  status          text NOT NULL DEFAULT 'active' CHECK (status IN ('trial','active','lapsed','cancelled')),
  trial_ends_at   timestamptz,
  period_ends_at  timestamptz,
  trial_used      boolean NOT NULL DEFAULT false,
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT memberships_basic_plain CHECK (tier <> 'basic' OR (period IS NULL AND status = 'active')),
  CONSTRAINT memberships_trial_has_end CHECK (status <> 'trial' OR trial_ends_at IS NOT NULL)
);

-- ─── 3. Entitlements (MR9) ──────────────────────────────────────────────────────
-- Protected: never gated by tier. Plus extras: the only features a tier adds.
CREATE OR REPLACE FUNCTION public.entitlement_allows(p_user uuid, p_feature text, p_now timestamptz DEFAULT now())
  RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE m public.memberships; v_tier text := 'basic';
BEGIN
  IF p_feature IN ('queue_order','triage','results_release','help','danger_flows','reminders','booking',
                   'booking_for_household','care_team_reach','readings','plan','wellness','widgets',
                   'basic_card','medical_id','tickets') THEN
    RETURN true;
  END IF;
  SELECT * INTO m FROM public.memberships WHERE user_id = p_user;
  IF FOUND AND ((m.status = 'trial' AND m.trial_ends_at > p_now)
             OR (m.status = 'active' AND (m.period_ends_at IS NULL OR m.period_ends_at > p_now))) THEN
    v_tier := m.tier;
  END IF;
  RETURN CASE p_feature
    WHEN 'household_calendar'   THEN v_tier IN ('plus_family','family_care')
    WHEN 'pay_for_household'    THEN v_tier IN ('plus_family','family_care')
    WHEN 'helper_in_loop'       THEN v_tier IN ('plus_family','family_care')
    WHEN 'helper_readings'      THEN v_tier IN ('plus_care','family_care')
    WHEN 'texts_and_alerts'     THEN v_tier IN ('plus_care','family_care')
    WHEN 'refills_packed'       THEN v_tier IN ('plus_care','family_care')
    WHEN 'report_12m'           THEN v_tier IN ('plus_care','family_care')
    ELSE false
  END;
END $$;
REVOKE ALL ON FUNCTION public.entitlement_allows(uuid, text, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.entitlement_allows(uuid, text, timestamptz) TO authenticated, service_role;

-- Start the 30-day trial once (D-MR-09). No card, no charge when it ends: it simply lapses to Basic.
CREATE OR REPLACE FUNCTION public.membership_start_trial(p_user uuid, p_tier text, p_now timestamptz DEFAULT now())
  RETURNS public.memberships LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE m public.memberships;
BEGIN
  IF p_tier NOT IN ('plus_family','plus_care','family_care') THEN
    RAISE EXCEPTION 'no trial for %', p_tier USING ERRCODE = '22023';
  END IF;
  SELECT * INTO m FROM public.memberships WHERE user_id = p_user FOR UPDATE;
  IF FOUND AND m.trial_used THEN RAISE EXCEPTION 'trial already used' USING ERRCODE = '22023'; END IF;
  INSERT INTO public.memberships (user_id, tier, period, status, trial_ends_at, trial_used, updated_at)
  VALUES (p_user, p_tier, 'monthly', 'trial', p_now + interval '30 days', true, p_now)
  ON CONFLICT (user_id) DO UPDATE SET tier = excluded.tier, period = excluded.period, status = 'trial',
    trial_ends_at = excluded.trial_ends_at, trial_used = true, updated_at = p_now
  RETURNING * INTO m;
  RETURN m;
END $$;
REVOKE ALL ON FUNCTION public.membership_start_trial(uuid, text, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.membership_start_trial(uuid, text, timestamptz) TO service_role;

-- Lapse ended trials and periods to Basic: never a charge (S25).
CREATE OR REPLACE FUNCTION public.membership_lapse(p_now timestamptz DEFAULT now())
  RETURNS integer LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
  WITH x AS (UPDATE public.memberships SET tier = 'basic', period = NULL, status = 'active', trial_ends_at = NULL,
                    period_ends_at = NULL, updated_at = p_now
              WHERE (status = 'trial' AND trial_ends_at <= p_now)
                 OR (status = 'active' AND tier <> 'basic' AND period_ends_at <= p_now) RETURNING 1)
  SELECT count(*)::int FROM x;
$$;
REVOKE ALL ON FUNCTION public.membership_lapse(timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.membership_lapse(timestamptz) TO service_role;

-- ─── 4. Questions for the doctor (D-PA-10) ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.visit_questions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id  uuid NOT NULL REFERENCES public.appointments(id) ON DELETE CASCADE,
  author_user_id  uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body            text NOT NULL CHECK (length(trim(body)) BETWEEN 1 AND 280),
  suggested       boolean NOT NULL DEFAULT false,
  asked_at        timestamptz,
  removed_at      timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS visit_questions_appt ON public.visit_questions (appointment_id);

-- The visit's patient (or their booking agent) writes; the visit hospital's nurses and clinicians read.
-- Reception and every other role never read (D-PA-10).
CREATE OR REPLACE FUNCTION private.visit_question_owner(p_appt uuid)
  RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM public.appointments a WHERE a.id = p_appt AND (a.patient_user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.booking_agents g WHERE g.agent_user_id = auth.uid() AND g.revoked_at IS NULL
      AND (g.patient_user_id = a.patient_user_id OR g.provisional_patient_id = a.provisional_patient_id))));
$$;
CREATE OR REPLACE FUNCTION private.visit_question_clinical(p_appt uuid)
  RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM public.appointments a WHERE a.id = p_appt
    AND (public.user_has_role('nurse', a.hospital_id) OR public.user_has_role('clinician', a.hospital_id)));
$$;
REVOKE ALL ON FUNCTION private.visit_question_owner(uuid), private.visit_question_clinical(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.visit_question_owner(uuid), private.visit_question_clinical(uuid) TO authenticated;

-- ─── 5. Audit, RLS ──────────────────────────────────────────────────────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['plus_prices','memberships','visit_questions'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS audit_%1$s ON public.%1$s', t);
    EXECUTE format('CREATE TRIGGER audit_%1$s AFTER INSERT OR UPDATE OR DELETE ON public.%1$s
      FOR EACH ROW EXECUTE FUNCTION public.audit_log_changes()', t);
    EXECUTE format('ALTER TABLE public.%s ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE public.%s FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%s FROM anon, authenticated', t);
  END LOOP;
END $$;

GRANT SELECT ON public.plus_prices, public.memberships TO authenticated;
DROP POLICY IF EXISTS plus_prices_read ON public.plus_prices;
CREATE POLICY plus_prices_read ON public.plus_prices FOR SELECT TO authenticated USING (approved_at IS NOT NULL);
DROP POLICY IF EXISTS memberships_read ON public.memberships;
CREATE POLICY memberships_read ON public.memberships FOR SELECT TO authenticated USING (user_id = auth.uid());

GRANT SELECT, INSERT ON public.visit_questions TO authenticated;
GRANT UPDATE (asked_at, removed_at) ON public.visit_questions TO authenticated;
DROP POLICY IF EXISTS visit_questions_read ON public.visit_questions;
CREATE POLICY visit_questions_read ON public.visit_questions FOR SELECT TO authenticated
  USING (private.visit_question_owner(appointment_id) OR private.visit_question_clinical(appointment_id));
DROP POLICY IF EXISTS visit_questions_write ON public.visit_questions;
CREATE POLICY visit_questions_write ON public.visit_questions FOR INSERT TO authenticated
  WITH CHECK (author_user_id = auth.uid() AND private.visit_question_owner(appointment_id));
DROP POLICY IF EXISTS visit_questions_tick ON public.visit_questions;
CREATE POLICY visit_questions_tick ON public.visit_questions FOR UPDATE TO authenticated
  USING (private.visit_question_owner(appointment_id) OR private.visit_question_clinical(appointment_id))
  WITH CHECK (private.visit_question_owner(appointment_id) OR private.visit_question_clinical(appointment_id));
