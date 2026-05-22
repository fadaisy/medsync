-- 0007 — RLS for interest_signups (split from 0006 because drizzle-kit
-- generation only emits CREATE TABLE / INDEX; the RLS layer is always
-- hand-written. Same pattern as 0002_rls.sql for the Phase 0 tables.)
--
-- Policy summary:
--   - anon + authenticated can INSERT  (landing-page forms run unauth)
--   - authenticated superadmin can SELECT  (leads)
--   - no UPDATE / DELETE policy → blocked

GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT INSERT ON public.interest_signups TO anon, authenticated;
GRANT SELECT ON public.interest_signups TO authenticated;

ALTER TABLE public.interest_signups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.interest_signups FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS interest_signups_insert_anon ON public.interest_signups;
CREATE POLICY interest_signups_insert_anon ON public.interest_signups
  FOR INSERT TO anon, authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS interest_signups_select_superadmin ON public.interest_signups;
CREATE POLICY interest_signups_select_superadmin ON public.interest_signups
  FOR SELECT TO authenticated
  USING (public.user_has_role('superadmin'));
