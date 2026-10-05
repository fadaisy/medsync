-- ─────────────────────────────────────────────────────────────────────────
-- 0094_ncd_superadmin_explicit_roles — ⚠️ GATED — owner-applied (npm run db:migrate).
--
-- NCDSync (ADR 0215, DECISIONS D-36). Until now a superadmin resolved to no NCD role at any hospital,
-- whatever was assigned (ADR 0209). Owner decision 2026-10-06: a superadmin may use the registry, but
-- only through a role assigned to them explicitly in `ncd_staff_role` at that hospital. Roles derived
-- from cadres or the hospital-admin roster still do not apply to a superadmin, so platform access alone
-- still opens nothing. The application cannot make that first assignment (it requires the target to
-- hold a role there already, and the CSO role is refused from the app), so only the database owner can.
--
-- Changes one function body; privileges are kept by CREATE OR REPLACE. Re-runnable. Requires 0093.
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION private.ncd_user_roles(p_user uuid, p_hospital uuid) RETURNS text[]
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT CASE
    WHEN p_user IS NULL OR p_hospital IS NULL THEN '{}'::text[]
    -- A superadmin holds only what was assigned to them explicitly at this hospital.
    WHEN EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = p_user AND ur.role = 'superadmin') THEN
      coalesce((
        SELECT array_agg(DISTINCT s.ncd_role ORDER BY s.ncd_role) FROM public.ncd_staff_role s
        WHERE s.user_id = p_user AND s.facility_id = p_hospital AND s.revoked_at IS NULL
      ), '{}'::text[])
    ELSE coalesce((
      SELECT array_agg(DISTINCT r ORDER BY r) FROM (
        SELECT CASE
          WHEN c.code IN ('NURSE','MIDWIFE','SPECIALIST_NURSE') THEN 'triage_nurse'
          WHEN c.code IN ('INTERN_DOCTOR','MEDICAL_OFFICER','MEDICAL_OFFICER_SG','CONSULTANT','SENIOR_CONSULTANT','CLINICAL_OFFICER') THEN 'clinician'
          WHEN c.code = 'RECEPTION' THEN 'registry_officer'
        END AS r
        FROM public.staff_affiliations sa JOIN public.cadres c ON c.id = sa.cadre_id
        WHERE sa.user_id = p_user AND sa.hospital_id = p_hospital AND sa.state::text IN ('active','approved')
        UNION ALL
        SELECT 'administrator' FROM public.hospital_admin_roster h
        WHERE h.user_id = p_user AND h.hospital_id = p_hospital AND h.succeeded_at IS NULL
        UNION ALL
        SELECT s.ncd_role FROM public.ncd_staff_role s
        WHERE s.user_id = p_user AND s.facility_id = p_hospital AND s.revoked_at IS NULL
      ) x WHERE r IS NOT NULL), '{}'::text[])
  END;
$$;
