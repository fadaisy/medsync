-- 0098 — Pharmacy access follows the affiliation (Pharmacy Phase 0, ADRs 0227 and 0228;
-- docs/pharmacy/phase-0/gate-a-proposal.md §2.3–§2.4, signed 2026-10-10).
--
-- GATED: owner-applied (`npm run db:migrate`), after 0097.
--
--   1. user_roles gains the value `pharmacy_staff`: the carrier of the pharmacy workspace (landing,
--      MFA). It is never shown to anyone as a title; screens and audit lines carry the approved
--      cadre's own name (D-PH0-02, Law 4). The old `pharmacist` value stays, unused.
--   2. private.sync_pharmacy_access(user, hospital, actor, reason): the user holds `pharmacy_staff`
--      at a hospital exactly when they have an approved or active affiliation there with a pharmacy
--      cadre (the cadres of data/pharmacy/permission-map.v1.json). Inserts or deletes the one role row
--      and writes an audit_log row (table_name 'pharmacy_access') with the basis: affiliation, cadre
--      code and name, council, approver, approval time, hospital. Idempotent.
--   3. A trigger on staff_affiliations runs it for the old and new (user, hospital) of every insert,
--      delete, and update of state, cadre, hospital or user, inside the transaction that changed the
--      affiliation: approval grants; suspension, deactivation, a cadre change or a move revokes (Law 3,
--      PA-7). Same shape as 0097, which stays untouched.
--
-- The pharmacy permissions themselves are derived in lib/pharmacy/access.ts. A pharmacy_staff row
-- granted by hand to someone with no pharmacy affiliation is removed at their next affiliation
-- change. Existing approved pharmacy staff get their row from scripts/pharmacy/backfill-pharmacy-
-- access.ts (dry run first). ADDITIVE and re-runnable: no table, column or index.

CREATE SCHEMA IF NOT EXISTS private;

-- ─── 1. The carrier value ────────────────────────────────────────────────
ALTER TABLE public.user_roles DROP CONSTRAINT IF EXISTS user_roles_role_check;
ALTER TABLE public.user_roles
  ADD CONSTRAINT user_roles_role_check CHECK (
    role IN (
      'patient','clinician','nurse','pharmacist','lab_tech',
      'hospital_admin','superadmin',
      -- Non-clinical (migration 0033)
      'reception',
      -- Pharmacy workspace carrier (migration 0098)
      'pharmacy_staff'
    )
  );

-- ─── 2. The sync ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION private.sync_pharmacy_access(
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

  -- The basis: the newest approved or active pharmacy-cadre affiliation at this hospital.
  SELECT jsonb_build_object(
           'affiliation_id', sa.id,
           'cadre', c.code,
           'cadre_name', c.name,
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
     AND c.code IN ('PHARMACIST', 'PHARMACY_TECH')
   ORDER BY sa.approved_at DESC NULLS LAST, sa.created_at DESC
   LIMIT 1;

  SELECT id INTO _role_id
    FROM public.user_roles
   WHERE user_id = p_user AND hospital_id = p_hospital AND role = 'pharmacy_staff';

  IF _basis IS NOT NULL AND _role_id IS NULL THEN
    _actor := COALESCE(p_actor, (_basis->>'approved_by')::uuid);
    INSERT INTO public.user_roles (user_id, role, hospital_id, created_by)
    VALUES (p_user, 'pharmacy_staff', p_hospital, _actor)
    RETURNING id INTO _role_id;
    INSERT INTO public.audit_log (actor_id, action, schema_name, table_name, record_id, after_data)
    VALUES (_actor, 'insert', 'public', 'pharmacy_access', _role_id::text,
            jsonb_build_object('event', 'pharmacy_access_granted', 'user_id', p_user,
                               'hospital_id', p_hospital, 'permission', 'pharmacy.view',
                               'basis', _basis, 'reason', p_reason));
    RETURN 'granted';
  END IF;

  IF _basis IS NULL AND _role_id IS NOT NULL THEN
    DELETE FROM public.user_roles WHERE id = _role_id;
    INSERT INTO public.audit_log (actor_id, action, schema_name, table_name, record_id, before_data)
    VALUES (p_actor, 'delete', 'public', 'pharmacy_access', _role_id::text,
            jsonb_build_object('event', 'pharmacy_access_revoked', 'user_id', p_user,
                               'hospital_id', p_hospital, 'permission', 'pharmacy.view',
                               'reason', p_reason));
    RETURN 'revoked';
  END IF;

  RETURN 'unchanged';
END;
$$;

REVOKE ALL ON FUNCTION private.sync_pharmacy_access(uuid, uuid, uuid, jsonb) FROM PUBLIC;
DO $$ BEGIN
  REVOKE ALL ON FUNCTION private.sync_pharmacy_access(uuid, uuid, uuid, jsonb) FROM anon, authenticated;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

-- ─── 3. The trigger ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION private.staff_affiliations_pharmacy_access()
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
    PERFORM private.sync_pharmacy_access(OLD.user_id, OLD.hospital_id, _actor,
      jsonb_build_object('affiliation_id', OLD.id, 'op', 'delete', 'from_state', OLD.state));
    RETURN NULL;
  END IF;

  IF TG_OP = 'UPDATE'
     AND (OLD.user_id IS DISTINCT FROM NEW.user_id OR OLD.hospital_id IS DISTINCT FROM NEW.hospital_id) THEN
    PERFORM private.sync_pharmacy_access(OLD.user_id, OLD.hospital_id, _actor,
      jsonb_build_object('affiliation_id', OLD.id, 'op', 'moved', 'from_state', OLD.state));
  END IF;

  PERFORM private.sync_pharmacy_access(NEW.user_id, NEW.hospital_id, _actor,
    jsonb_build_object('affiliation_id', NEW.id, 'op', lower(TG_OP),
                       'from_state', CASE WHEN TG_OP = 'UPDATE' THEN OLD.state END,
                       'to_state', NEW.state));
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION private.staff_affiliations_pharmacy_access() FROM PUBLIC;
DO $$ BEGIN
  REVOKE ALL ON FUNCTION private.staff_affiliations_pharmacy_access() FROM anon, authenticated;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

DROP TRIGGER IF EXISTS staff_affiliations_pharmacy_access ON public.staff_affiliations;
CREATE TRIGGER staff_affiliations_pharmacy_access
  AFTER INSERT OR DELETE OR UPDATE OF state, cadre_id, hospital_id, user_id
  ON public.staff_affiliations
  FOR EACH ROW EXECUTE FUNCTION private.staff_affiliations_pharmacy_access();
