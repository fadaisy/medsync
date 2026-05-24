-- ─────────────────────────────────────────────────────────────────────────
-- 0019_cleanup_leaked_rls_fixtures
--
-- The Phase 0 RLS test suite creates throwaway superadmin / hospital_admin
-- fixture users with deterministic `rls-*@medsync.local` emails. Those
-- fixtures should be transactional, but several runs leaked rows — 44
-- superadmin entries persist on prod alongside the single real one
-- (Usama Fadhul). That breaks the GATE F four-eyes wiring's "count of
-- real superadmins" check.
--
-- Scoped fix: delete the leaked user_roles rows ONLY. We deliberately
-- leave the underlying auth.users / public.users rows in place because:
--   - The four-eyes count check looks at user_roles.role = 'superadmin';
--     deleting those rows is sufficient for the wiring to work.
--   - Cascading DELETE on auth.users tries to NULL the actor_id FK on
--     historical audit_log rows that reference these fixtures, which
--     trips the append-only enforcement trigger (migration 0003).
--   - The orphan user rows do no harm — they were never real people,
--     have no patient data, and the runtime filter in GATE F's four-
--     eyes wiring (`email NOT LIKE '%@medsync.local'`) already excludes
--     them from any oversight surface that materialises them.
--
-- Idempotent: re-running deletes nothing the second time. Audit trigger
-- on user_roles writes an INSERT row to audit_log per deletion (allowed).
--
-- BELT-AND-SUSPENDERS: GATE F's four-eyes wiring also applies the same
-- email-domain runtime filter so a fresh leak between cleanup and the
-- Phase 0 test-hygiene fix can't re-disable the enforcement.
-- ─────────────────────────────────────────────────────────────────────────

DELETE FROM public.user_roles ur
WHERE EXISTS (
  SELECT 1 FROM public.users u
  WHERE u.id = ur.user_id
    AND u.email LIKE 'rls-%@medsync.local'
);
