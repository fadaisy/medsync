-- 0002 — RLS policies + public.user_has_role helper.
-- See ADR-0006 for design + tests/rls/*.test.ts for verification.

-- ─── Grants ──────────────────────────────────────────────────────────────
-- Supabase doesn't auto-grant on tables created via direct SQL; we grant
-- explicitly here and rely on RLS for row-level filtering.

GRANT USAGE ON SCHEMA public TO anon, authenticated;

-- Read access for the tables that need it. RLS does the row filtering.
GRANT SELECT ON public.hospitals TO anon, authenticated;
GRANT SELECT ON public.hospital_departments TO anon, authenticated;
GRANT SELECT, UPDATE ON public.users TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.user_roles TO authenticated;
GRANT SELECT, INSERT ON public.consent_records TO authenticated;
GRANT SELECT ON public.audit_log TO authenticated;

-- ─── Helper: public.user_has_role(role_name [, hospital_id]) ──────────────
-- SECURITY DEFINER so the function can read user_roles regardless of the
-- caller's RLS context. STABLE because user role assignments don't change
-- within a transaction. Search path hardened to prevent injection.

CREATE OR REPLACE FUNCTION public.user_has_role(role_name text, p_hospital_id uuid DEFAULT NULL)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
      AND role = role_name
      AND (
        p_hospital_id IS NULL
        OR hospital_id = p_hospital_id
        OR role = 'superadmin'  -- superadmin is global
      )
  );
$$;

REVOKE EXECUTE ON FUNCTION public.user_has_role(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_has_role(text, uuid) TO authenticated, anon, service_role;

-- ─── users ──────────────────────────────────────────────────────────────
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users FORCE ROW LEVEL SECURITY;

CREATE POLICY users_select_own ON public.users
  FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.user_has_role('superadmin'));

CREATE POLICY users_update_own ON public.users
  FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- No INSERT/DELETE policies → blocked. Rows arrive via the Phase 0.9
-- trigger on auth.users insert (or via the seed script).

-- ─── hospitals ──────────────────────────────────────────────────────────
ALTER TABLE public.hospitals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hospitals FORCE ROW LEVEL SECURITY;

CREATE POLICY hospitals_select_all ON public.hospitals
  FOR SELECT TO anon, authenticated
  USING (true);

CREATE POLICY hospitals_modify_superadmin ON public.hospitals
  FOR ALL TO authenticated
  USING (public.user_has_role('superadmin'))
  WITH CHECK (public.user_has_role('superadmin'));

-- ─── hospital_departments ───────────────────────────────────────────────
ALTER TABLE public.hospital_departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hospital_departments FORCE ROW LEVEL SECURITY;

CREATE POLICY hospital_departments_select_all ON public.hospital_departments
  FOR SELECT TO anon, authenticated
  USING (true);

CREATE POLICY hospital_departments_modify_admin ON public.hospital_departments
  FOR ALL TO authenticated
  USING (
    public.user_has_role('superadmin')
    OR public.user_has_role('hospital_admin', hospital_id)
  )
  WITH CHECK (
    public.user_has_role('superadmin')
    OR public.user_has_role('hospital_admin', hospital_id)
  );

-- ─── user_roles ─────────────────────────────────────────────────────────
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles FORCE ROW LEVEL SECURITY;

CREATE POLICY user_roles_select_visible ON public.user_roles
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.user_has_role('superadmin')
    OR (
      hospital_id IS NOT NULL
      AND public.user_has_role('hospital_admin', hospital_id)
    )
  );

CREATE POLICY user_roles_insert_admin ON public.user_roles
  FOR INSERT TO authenticated
  WITH CHECK (
    public.user_has_role('superadmin')
    OR (
      hospital_id IS NOT NULL
      AND public.user_has_role('hospital_admin', hospital_id)
    )
  );

CREATE POLICY user_roles_delete_admin ON public.user_roles
  FOR DELETE TO authenticated
  USING (
    public.user_has_role('superadmin')
    OR (
      hospital_id IS NOT NULL
      AND public.user_has_role('hospital_admin', hospital_id)
    )
  );

-- No UPDATE policy — roles are atomic. To change, DELETE + INSERT.

-- ─── consent_records ────────────────────────────────────────────────────
ALTER TABLE public.consent_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consent_records FORCE ROW LEVEL SECURITY;

CREATE POLICY consent_records_select_own ON public.consent_records
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.user_has_role('superadmin'));

CREATE POLICY consent_records_insert_own ON public.consent_records
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- No UPDATE/DELETE — consent records are immutable. Withdrawing consent
-- means recording a NEW row (typed e.g. 'data_processing_withdrawn').

-- ─── audit_log ──────────────────────────────────────────────────────────
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log FORCE ROW LEVEL SECURITY;

CREATE POLICY audit_log_select_superadmin ON public.audit_log
  FOR SELECT TO authenticated
  USING (public.user_has_role('superadmin'));

-- No INSERT/UPDATE/DELETE policies for clients. INSERT happens via the
-- trigger function (0.6, SECURITY DEFINER). UPDATE/DELETE blocked at the
-- privilege layer + a BEFORE trigger in 0.6 that raises on attempts.
