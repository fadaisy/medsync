-- 0012 — RLS for patient_profiles (Phase 1, GATE C).
--
-- Owner-only by default. Hospital staff / clinicians do NOT have
-- blanket read access — that's a Phase 1.1+ decision tied to active
-- care relationships (encounter rows, care-team membership). For now
-- only the patient themselves + superadmin can read; service role
-- writes via the signup server action.

GRANT SELECT, INSERT, UPDATE ON public.patient_profiles TO authenticated;

ALTER TABLE public.patient_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patient_profiles FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS patient_profiles_select_own ON public.patient_profiles;
CREATE POLICY patient_profiles_select_own ON public.patient_profiles
  FOR SELECT TO authenticated
  USING (id = (SELECT auth.uid()));

DROP POLICY IF EXISTS patient_profiles_select_superadmin ON public.patient_profiles;
CREATE POLICY patient_profiles_select_superadmin ON public.patient_profiles
  FOR SELECT TO authenticated
  USING (public.user_has_role('superadmin'));

-- Only the patient themselves may insert their own profile (server
-- action runs under user auth; service-role uses a separate path for
-- admin-led signups in a future gate).
DROP POLICY IF EXISTS patient_profiles_insert_own ON public.patient_profiles;
CREATE POLICY patient_profiles_insert_own ON public.patient_profiles
  FOR INSERT TO authenticated
  WITH CHECK (id = (SELECT auth.uid()));

DROP POLICY IF EXISTS patient_profiles_update_own ON public.patient_profiles;
CREATE POLICY patient_profiles_update_own ON public.patient_profiles
  FOR UPDATE TO authenticated
  USING (id = (SELECT auth.uid()))
  WITH CHECK (id = (SELECT auth.uid()));
