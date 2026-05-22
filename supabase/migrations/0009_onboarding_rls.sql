-- 0009 — RLS for onboarding tables.
--
-- Reference tables (ref_*) are PUBLIC READ — forms hit them while the user
-- is still anonymous (signup pages run unauth). They contain no PHI; the
-- worst case is an attacker enumerating Uganda's districts, which is
-- already on the UBOS website.
--
-- clinician_profiles / staff_affiliations: owner-only by default; the
-- approval path uses an Edge Function with service-role + an audit entry.
-- Hospital admins read affiliations for THEIR hospital (gated via the
-- user_has_role() helper from 0002_rls.sql).
--
-- signup_drafts: owner-only once authenticated. Pre-account drafts are
-- written/read by the server action only (service-role); there's no
-- public RLS path. The access_token is verified app-side, not by RLS.

GRANT USAGE ON SCHEMA public TO anon, authenticated;

-- ─── Reference data — public read ───────────────────────────────────────
GRANT SELECT ON public.ref_data_versions    TO anon, authenticated;
GRANT SELECT ON public.ref_regions          TO anon, authenticated;
GRANT SELECT ON public.ref_districts        TO anon, authenticated;
GRANT SELECT ON public.ref_subcounties      TO anon, authenticated;
GRANT SELECT ON public.ref_councils         TO anon, authenticated;
GRANT SELECT ON public.ref_cadres           TO anon, authenticated;
GRANT SELECT ON public.ref_cadre_grades     TO anon, authenticated;
GRANT SELECT ON public.ref_specialties      TO anon, authenticated;
GRANT SELECT ON public.ref_roles            TO anon, authenticated;

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT unnest(ARRAY[
      'ref_data_versions','ref_regions','ref_districts','ref_subcounties',
      'ref_councils','ref_cadres','ref_cadre_grades','ref_specialties','ref_roles'
    ]) AS t
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', r.t);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY;', r.t);
    EXECUTE format('DROP POLICY IF EXISTS %I_select_public ON public.%I;', r.t, r.t);
    EXECUTE format(
      'CREATE POLICY %I_select_public ON public.%I FOR SELECT TO anon, authenticated USING (true);',
      r.t, r.t
    );
  END LOOP;
END $$;

-- ─── clinician_profiles ─────────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE ON public.clinician_profiles TO authenticated;

ALTER TABLE public.clinician_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clinician_profiles FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS clinician_profiles_select_own ON public.clinician_profiles;
CREATE POLICY clinician_profiles_select_own ON public.clinician_profiles
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS clinician_profiles_select_superadmin ON public.clinician_profiles;
CREATE POLICY clinician_profiles_select_superadmin ON public.clinician_profiles
  FOR SELECT TO authenticated
  USING (public.user_has_role('superadmin'));

-- Hospital admins read the profile for any user with a pending/active
-- affiliation at their hospital (needed for approval review).
DROP POLICY IF EXISTS clinician_profiles_select_hospital_admin ON public.clinician_profiles;
CREATE POLICY clinician_profiles_select_hospital_admin ON public.clinician_profiles
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.staff_affiliations sa
      WHERE sa.user_id = clinician_profiles.user_id
        AND public.user_has_role('hospital_admin', sa.hospital_id)
    )
  );

DROP POLICY IF EXISTS clinician_profiles_insert_own ON public.clinician_profiles;
CREATE POLICY clinician_profiles_insert_own ON public.clinician_profiles
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS clinician_profiles_update_own ON public.clinician_profiles;
CREATE POLICY clinician_profiles_update_own ON public.clinician_profiles
  FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

-- ─── staff_affiliations ─────────────────────────────────────────────────
GRANT SELECT, INSERT ON public.staff_affiliations TO authenticated;
-- UPDATE (state transitions) is service-role only — flows through Edge Functions.

ALTER TABLE public.staff_affiliations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_affiliations FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS staff_affiliations_select_own ON public.staff_affiliations;
CREATE POLICY staff_affiliations_select_own ON public.staff_affiliations
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS staff_affiliations_select_hospital_admin ON public.staff_affiliations;
CREATE POLICY staff_affiliations_select_hospital_admin ON public.staff_affiliations
  FOR SELECT TO authenticated
  USING (public.user_has_role('hospital_admin', hospital_id));

DROP POLICY IF EXISTS staff_affiliations_select_superadmin ON public.staff_affiliations;
CREATE POLICY staff_affiliations_select_superadmin ON public.staff_affiliations
  FOR SELECT TO authenticated
  USING (public.user_has_role('superadmin'));

DROP POLICY IF EXISTS staff_affiliations_insert_own ON public.staff_affiliations;
CREATE POLICY staff_affiliations_insert_own ON public.staff_affiliations
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

-- ─── signup_drafts ──────────────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON public.signup_drafts TO authenticated;

ALTER TABLE public.signup_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.signup_drafts FORCE ROW LEVEL SECURITY;

-- Authenticated users: owner_key = their auth.uid().
DROP POLICY IF EXISTS signup_drafts_owner ON public.signup_drafts;
CREATE POLICY signup_drafts_owner ON public.signup_drafts
  FOR ALL TO authenticated
  USING (owner_key = (SELECT auth.uid())::text)
  WITH CHECK (owner_key = (SELECT auth.uid())::text);

-- Anon-tier drafts (signup-in-progress before account creation) are
-- written by the server action via service-role only — there is NO
-- anon policy on this table. The access_token in the cookie authorises
-- the server action; RLS is the second line.
