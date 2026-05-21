-- 0003 — audit infrastructure.
-- See ADR-0007 for design rationale; tests/audit/*.test.ts for verification.
--
-- Two trigger functions, both in `public.*` (pooler user lacks CREATE on
-- `auth.*` and we'd rather not create a third schema with the same
-- permission constraints):
--
-- 1. public.audit_log_changes() — AFTER INSERT/UPDATE/DELETE on every
--    sensitive table, captures OLD/NEW as jsonb and INSERTs into
--    public.audit_log. SECURITY DEFINER so it can INSERT even when the
--    caller's role would be denied.
--
-- 2. public.audit_log_block_modify() — BEFORE UPDATE OR DELETE on
--    public.audit_log itself; raises immediately. Plus REVOKE on UPDATE/
--    DELETE privileges from every non-table-owner role as a second layer.
--
-- audit_log is NOT audited (would recurse).

-- ─── Generic audit trigger function ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.audit_log_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  _record_id text;
  _request_id uuid;
  _actor_id uuid;
BEGIN
  -- Resolve PK as text (handles uuid + bigint + text PKs uniformly).
  IF TG_OP = 'DELETE' THEN
    _record_id := to_jsonb(OLD)->>'id';
  ELSE
    _record_id := to_jsonb(NEW)->>'id';
  END IF;

  -- Optional request correlation ID; middleware sets `app.request_id` GUC in 0.9.
  BEGIN
    _request_id := nullif(current_setting('app.request_id', true), '')::uuid;
  EXCEPTION WHEN OTHERS THEN
    _request_id := NULL;
  END;

  -- auth.uid() may be NULL for service-role / system operations; that's fine,
  -- actor_id is nullable and we keep the row.
  BEGIN
    _actor_id := auth.uid();
  EXCEPTION WHEN OTHERS THEN
    _actor_id := NULL;
  END;

  INSERT INTO public.audit_log (
    actor_id,
    action,
    schema_name,
    table_name,
    record_id,
    before_data,
    after_data,
    request_id
  ) VALUES (
    _actor_id,
    lower(TG_OP),
    TG_TABLE_SCHEMA,
    TG_TABLE_NAME,
    _record_id,
    CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE to_jsonb(OLD) END,
    CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE to_jsonb(NEW) END,
    _request_id
  );

  RETURN COALESCE(NEW, OLD);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.audit_log_changes() FROM PUBLIC;
-- Triggers fire as the table owner regardless of who called them, so no
-- explicit GRANT is required for normal use.

-- ─── Attach to every audited table ──────────────────────────────────────
DROP TRIGGER IF EXISTS users_audit ON public.users;
CREATE TRIGGER users_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_changes();

DROP TRIGGER IF EXISTS hospitals_audit ON public.hospitals;
CREATE TRIGGER hospitals_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.hospitals
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_changes();

DROP TRIGGER IF EXISTS hospital_departments_audit ON public.hospital_departments;
CREATE TRIGGER hospital_departments_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.hospital_departments
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_changes();

DROP TRIGGER IF EXISTS user_roles_audit ON public.user_roles;
CREATE TRIGGER user_roles_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_changes();

DROP TRIGGER IF EXISTS consent_records_audit ON public.consent_records;
CREATE TRIGGER consent_records_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.consent_records
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_changes();

-- audit_log itself is NOT audited (would recurse infinitely).

-- ─── audit_log tamper protection ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.audit_log_block_modify()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is append-only; % forbidden', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$;

DROP TRIGGER IF EXISTS audit_log_no_modify ON public.audit_log;
CREATE TRIGGER audit_log_no_modify
  BEFORE UPDATE OR DELETE ON public.audit_log
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_block_modify();

-- Privilege layer: nobody (except the table owner / superuser) can attempt
-- UPDATE or DELETE in the first place. Belt-and-braces with the trigger
-- above so even a misconfigured grant later can't bypass.
REVOKE UPDATE, DELETE ON public.audit_log FROM PUBLIC;
REVOKE UPDATE, DELETE ON public.audit_log FROM anon;
REVOKE UPDATE, DELETE ON public.audit_log FROM authenticated;
-- service_role is intentionally NOT REVOKEd from at the privilege layer —
-- it's a Postgres role with `bypassrls`, but the BEFORE trigger above still
-- raises for it. So service-role pretends to have UPDATE/DELETE privilege
-- but is blocked at the trigger.
