-- GATED — applied by the owner (`npm run db:migrate`), never auto-run.
-- ─────────────────────────────────────────────────────────────────────────
-- 0297_clinic_leads_mfa_gate (Review C-2)
--
-- 0293 turned RLS on for clinic_leads without the RESTRICTIVE mfa_gate every table since 0288 carries. 0293 is
-- applied, so the gate comes here. ADDITIVE and idempotent. Numbered 0297: 0295 is the clinic floor, 0296 the
-- clinics schedule.
-- ─────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS mfa_gate ON public.clinic_leads;
CREATE POLICY mfa_gate ON public.clinic_leads AS RESTRICTIVE FOR ALL TO authenticated
  USING ((SELECT public.caller_mfa_ok())) WITH CHECK ((SELECT public.caller_mfa_ok()));
