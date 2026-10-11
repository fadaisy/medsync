-- 0097 — Lab access follows the affiliation (Lab Phase 0, ADRs 0221 and 0222; docs/lab/phase-0/
-- gate-a-proposal.md §2.3, signed 2026-10-10).
--
--   1. private.sync_lab_access(user, hospital, actor, reason): the user holds the `lab_tech` role at a
--      hospital exactly when they have an approved or active affiliation there with a laboratory
--      cadre (the cadres of data/lab/permission-map.v1.json). Inserts or deletes the one role row and
--      writes an audit_log row (table_name 'lab_access') with the basis: affiliation, cadre, council,
--      approver, approval time, hospital. Idempotent: a second call changes nothing.
--   2. A trigger on staff_affiliations runs it for the old and new (user, hospital) of every insert,
--      delete, and update of state, cadre, hospital or user. A trigger runs inside the transaction
--      that changed the affiliation, so approval grants and suspension, deactivation or a cadre change
--      revoke in that same transaction, whichever path made the change (Law 2, LA-8).
--
-- The role only carries the workspace (landing, MFA); the six lab permissions are derived in
-- lib/lab/access.ts. A lab_tech row granted by hand to someone with no lab affiliation is removed the
-- next time their affiliation at that hospital changes (Law 3: the council register is the source).
-- Existing approved lab staff get their row from scripts/lab/backfill-lab-access.ts (dry run first).
--
-- ADDITIVE and re-runnable: no table, column or index; nothing on orders, specimens, reports or the
-- catalogue. Owner-applied (`npm run db:migrate`), after 0096.

CREATE SCHEMA IF NOT EXISTS private;

-- ─── 1. The sync ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION private.sync_lab_access(
  p_user uuid,
  p_hospital uuid,
  p_actor uuid,
  p_reason jsonb
) RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  _basis jsonb;
  _role_id uuid;
  _actor uuid;
BEGIN
  IF p_user IS NULL OR p_hospital IS NULL THEN
    RETURN 'skipped';
  END IF;

  -- The basis: the newest approved or active lab-cadre affiliation at this hospital.
  SELECT jsonb_build_object(
           'affiliation_id', sa.id,
           'cadre', c.code,
           'council', co.code,
           'approved_by', sa.approved_by,
           'approved_at', sa.approved_at,
           'hospital_id', sa.hospital_id)
    INTO _basis
    FROM public.staff_affiliations sa
    JOIN public.cadres c ON c.id = sa.cadre_id
    LEFT JOIN public.councils co ON co.id = c.council_id
   WHERE sa.user_id = p_user
     AND sa.hospital_id = p_hospital
     AND sa.state IN ('approved', 'active')
     AND c.code IN ('LAB_TECH', 'LAB_TECHNOLOGIST')
   ORDER BY sa.approved_at DESC NULLS LAST, sa.created_at DESC
   LIMIT 1;

  SELECT id INTO _role_id
    FROM public.user_roles
   WHERE user_id = p_user AND hospital_id = p_hospital AND role = 'lab_tech';

  IF _basis IS NOT NULL AND _role_id IS NULL THEN
    _actor := COALESCE(p_actor, (_basis->>'approved_by')::uuid);
    INSERT INTO public.user_roles (user_id, role, hospital_id, created_by)
    VALUES (p_user, 'lab_tech', p_hospital, _actor)
    RETURNING id INTO _role_id;
    INSERT INTO public.audit_log (actor_id, action, schema_name, table_name, record_id, after_data)
    VALUES (_actor, 'insert', 'public', 'lab_access', _role_id::text,
            jsonb_build_object('event', 'lab_access_granted', 'user_id', p_user,
                               'hospital_id', p_hospital, 'role', 'lab_tech',
                               'basis', _basis, 'reason', p_reason));
    RETURN 'granted';
  END IF;

  IF _basis IS NULL AND _role_id IS NOT NULL THEN
    DELETE FROM public.user_roles WHERE id = _role_id;
    INSERT INTO public.audit_log (actor_id, action, schema_name, table_name, record_id, before_data)
    VALUES (p_actor, 'delete', 'public', 'lab_access', _role_id::text,
            jsonb_build_object('event', 'lab_access_revoked', 'user_id', p_user,
                               'hospital_id', p_hospital, 'role', 'lab_tech',
                               'reason', p_reason));
    RETURN 'revoked';
  END IF;

  RETURN 'unchanged';
END;
$$;

REVOKE ALL ON FUNCTION private.sync_lab_access(uuid, uuid, uuid, jsonb) FROM PUBLIC;
DO $$ BEGIN
  REVOKE ALL ON FUNCTION private.sync_lab_access(uuid, uuid, uuid, jsonb) FROM anon, authenticated;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

-- ─── 2. The trigger ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION private.staff_affiliations_lab_access()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  _actor uuid;
BEGIN
  BEGIN
    _actor := auth.uid();
  EXCEPTION WHEN OTHERS THEN
    _actor := NULL;
  END;

  IF TG_OP = 'DELETE' THEN
    PERFORM private.sync_lab_access(OLD.user_id, OLD.hospital_id, _actor,
      jsonb_build_object('affiliation_id', OLD.id, 'op', 'delete', 'from_state', OLD.state));
    RETURN NULL;
  END IF;

  IF TG_OP = 'UPDATE'
     AND (OLD.user_id IS DISTINCT FROM NEW.user_id OR OLD.hospital_id IS DISTINCT FROM NEW.hospital_id) THEN
    PERFORM private.sync_lab_access(OLD.user_id, OLD.hospital_id, _actor,
      jsonb_build_object('affiliation_id', OLD.id, 'op', 'moved', 'from_state', OLD.state));
  END IF;

  PERFORM private.sync_lab_access(NEW.user_id, NEW.hospital_id, _actor,
    jsonb_build_object('affiliation_id', NEW.id, 'op', lower(TG_OP),
                       'from_state', CASE WHEN TG_OP = 'UPDATE' THEN OLD.state END,
                       'to_state', NEW.state));
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION private.staff_affiliations_lab_access() FROM PUBLIC;
DO $$ BEGIN
  REVOKE ALL ON FUNCTION private.staff_affiliations_lab_access() FROM anon, authenticated;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

DROP TRIGGER IF EXISTS staff_affiliations_lab_access ON public.staff_affiliations;
CREATE TRIGGER staff_affiliations_lab_access
  AFTER INSERT OR DELETE OR UPDATE OF state, cadre_id, hospital_id, user_id
  ON public.staff_affiliations
  FOR EACH ROW EXECUTE FUNCTION private.staff_affiliations_lab_access();
