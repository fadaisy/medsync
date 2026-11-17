-- GATED — applied by the owner (`npm run db:migrate`), never auto-run.
-- 0304: the MFA gate (Review C-2, 0288) on every table patient app v2 turned RLS on for in 0299–0301. Those
-- migrations enabled RLS in a loop, which the guard (tests/auth/mfa-below-pages) cannot see, and left the gate out.
-- A patient always passes `caller_mfa_ok()`; hospital staff need AAL2 to read bills, receipts, refunds, care
-- rows and questions. ADDITIVE and idempotent; apply after 0299–0303.

DROP POLICY IF EXISTS mfa_gate ON public.bill_items;
CREATE POLICY mfa_gate ON public.bill_items AS RESTRICTIVE FOR ALL TO authenticated
  USING ((SELECT public.caller_mfa_ok())) WITH CHECK ((SELECT public.caller_mfa_ok()));
DROP POLICY IF EXISTS mfa_gate ON public.bills;
CREATE POLICY mfa_gate ON public.bills AS RESTRICTIVE FOR ALL TO authenticated
  USING ((SELECT public.caller_mfa_ok())) WITH CHECK ((SELECT public.caller_mfa_ok()));
DROP POLICY IF EXISTS mfa_gate ON public.care_alerts;
CREATE POLICY mfa_gate ON public.care_alerts AS RESTRICTIVE FOR ALL TO authenticated
  USING ((SELECT public.caller_mfa_ok())) WITH CHECK ((SELECT public.caller_mfa_ok()));
DROP POLICY IF EXISTS mfa_gate ON public.care_enrolments;
CREATE POLICY mfa_gate ON public.care_enrolments AS RESTRICTIVE FOR ALL TO authenticated
  USING ((SELECT public.caller_mfa_ok())) WITH CHECK ((SELECT public.caller_mfa_ok()));
DROP POLICY IF EXISTS mfa_gate ON public.care_helpers;
CREATE POLICY mfa_gate ON public.care_helpers AS RESTRICTIVE FOR ALL TO authenticated
  USING ((SELECT public.caller_mfa_ok())) WITH CHECK ((SELECT public.caller_mfa_ok()));
DROP POLICY IF EXISTS mfa_gate ON public.care_messages;
CREATE POLICY mfa_gate ON public.care_messages AS RESTRICTIVE FOR ALL TO authenticated
  USING ((SELECT public.caller_mfa_ok())) WITH CHECK ((SELECT public.caller_mfa_ok()));
DROP POLICY IF EXISTS mfa_gate ON public.care_plan_versions;
CREATE POLICY mfa_gate ON public.care_plan_versions AS RESTRICTIVE FOR ALL TO authenticated
  USING ((SELECT public.caller_mfa_ok())) WITH CHECK ((SELECT public.caller_mfa_ok()));
DROP POLICY IF EXISTS mfa_gate ON public.care_programme_addons;
CREATE POLICY mfa_gate ON public.care_programme_addons AS RESTRICTIVE FOR ALL TO authenticated
  USING ((SELECT public.caller_mfa_ok())) WITH CHECK ((SELECT public.caller_mfa_ok()));
DROP POLICY IF EXISTS mfa_gate ON public.care_programme_periods;
CREATE POLICY mfa_gate ON public.care_programme_periods AS RESTRICTIVE FOR ALL TO authenticated
  USING ((SELECT public.caller_mfa_ok())) WITH CHECK ((SELECT public.caller_mfa_ok()));
DROP POLICY IF EXISTS mfa_gate ON public.care_programmes;
CREATE POLICY mfa_gate ON public.care_programmes AS RESTRICTIVE FOR ALL TO authenticated
  USING ((SELECT public.caller_mfa_ok())) WITH CHECK ((SELECT public.caller_mfa_ok()));
DROP POLICY IF EXISTS mfa_gate ON public.care_team_members;
CREATE POLICY mfa_gate ON public.care_team_members AS RESTRICTIVE FOR ALL TO authenticated
  USING ((SELECT public.caller_mfa_ok())) WITH CHECK ((SELECT public.caller_mfa_ok()));
DROP POLICY IF EXISTS mfa_gate ON public.dose_events;
CREATE POLICY mfa_gate ON public.dose_events AS RESTRICTIVE FOR ALL TO authenticated
  USING ((SELECT public.caller_mfa_ok())) WITH CHECK ((SELECT public.caller_mfa_ok()));
DROP POLICY IF EXISTS mfa_gate ON public.hospital_payment_accounts;
CREATE POLICY mfa_gate ON public.hospital_payment_accounts AS RESTRICTIVE FOR ALL TO authenticated
  USING ((SELECT public.caller_mfa_ok())) WITH CHECK ((SELECT public.caller_mfa_ok()));
DROP POLICY IF EXISTS mfa_gate ON public.memberships;
CREATE POLICY mfa_gate ON public.memberships AS RESTRICTIVE FOR ALL TO authenticated
  USING ((SELECT public.caller_mfa_ok())) WITH CHECK ((SELECT public.caller_mfa_ok()));
DROP POLICY IF EXISTS mfa_gate ON public.payment_callbacks;
CREATE POLICY mfa_gate ON public.payment_callbacks AS RESTRICTIVE FOR ALL TO authenticated
  USING ((SELECT public.caller_mfa_ok())) WITH CHECK ((SELECT public.caller_mfa_ok()));
DROP POLICY IF EXISTS mfa_gate ON public.payment_intents;
CREATE POLICY mfa_gate ON public.payment_intents AS RESTRICTIVE FOR ALL TO authenticated
  USING ((SELECT public.caller_mfa_ok())) WITH CHECK ((SELECT public.caller_mfa_ok()));
DROP POLICY IF EXISTS mfa_gate ON public.plus_prices;
CREATE POLICY mfa_gate ON public.plus_prices AS RESTRICTIVE FOR ALL TO authenticated
  USING ((SELECT public.caller_mfa_ok())) WITH CHECK ((SELECT public.caller_mfa_ok()));
DROP POLICY IF EXISTS mfa_gate ON public.receipt_counters;
CREATE POLICY mfa_gate ON public.receipt_counters AS RESTRICTIVE FOR ALL TO authenticated
  USING ((SELECT public.caller_mfa_ok())) WITH CHECK ((SELECT public.caller_mfa_ok()));
DROP POLICY IF EXISTS mfa_gate ON public.receipts;
CREATE POLICY mfa_gate ON public.receipts AS RESTRICTIVE FOR ALL TO authenticated
  USING ((SELECT public.caller_mfa_ok())) WITH CHECK ((SELECT public.caller_mfa_ok()));
DROP POLICY IF EXISTS mfa_gate ON public.refund_requests;
CREATE POLICY mfa_gate ON public.refund_requests AS RESTRICTIVE FOR ALL TO authenticated
  USING ((SELECT public.caller_mfa_ok())) WITH CHECK ((SELECT public.caller_mfa_ok()));
DROP POLICY IF EXISTS mfa_gate ON public.visit_questions;
CREATE POLICY mfa_gate ON public.visit_questions AS RESTRICTIVE FOR ALL TO authenticated
  USING ((SELECT public.caller_mfa_ok())) WITH CHECK ((SELECT public.caller_mfa_ok()));
