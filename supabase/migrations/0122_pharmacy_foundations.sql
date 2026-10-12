-- 0122 — Pharmacy Phase 1 foundations (GATE A signed 12 Oct 2026; gate-a-proposal §2, §8; D-PH1-42, D-PH1-43).
--
-- GATED: owner-applied (`npm run db:migrate`), after 0121.
--
--   1. private.pharmacy_can(permission): does the current identity (app.user_id / app.hospital_id, as
--      set by lib/emr/db.ts) hold this pharmacy permission at the current hospital? It mirrors the
--      permission map version 2 (data/pharmacy/permission-map.v2.json; a test proves the two agree for
--      every cadre × permission). `pharmacy.manage` comes from an open department_heads row on the
--      Pharmacy department or on one of its dispensing points (PA2-3); department_heads is already
--      audited (0080), so granting and lapsing are on record.
--   2. pharmacy_signed_sets: per-hospital, versioned, signed content (D-PH1-43). Content acts only when
--      `signed`; a signed row's content never changes; two different signers, or an exception in words.
--   3. pharmacy_attestations: every attempt by a second person to prove who they are (witness or
--      signer, D-PH1-42). Holds no secret. Append-only.
--
-- ADDITIVE and re-runnable. No client (anon, authenticated) can read or write these tables; reads go
-- through medsync_clinical_reader under RLS, writes through server actions as the owner.

CREATE SCHEMA IF NOT EXISTS private;

-- ─── 1. The permission helper ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION private.pharmacy_cadre_permissions(p_cadre text)
RETURNS text[]
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog
AS $$
  -- Permission map v2 (draft until legal question 1 is answered; acts only outside production in the app).
  SELECT CASE p_cadre
    WHEN 'PHARMACIST' THEN ARRAY['pharmacy.view','pharmacy.review','pharmacy.dispense','pharmacy.stock','pharmacy.controlled']
    WHEN 'PHARMACY_TECH' THEN ARRAY['pharmacy.view','pharmacy.dispense','pharmacy.stock']
    ELSE ARRAY[]::text[]
  END;
$$;

CREATE OR REPLACE FUNCTION private.pharmacy_can_user(p_user uuid, p_hospital uuid, p_perm text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT p_user IS NOT NULL AND p_hospital IS NOT NULL AND (
    CASE WHEN p_perm = 'pharmacy.manage' THEN
      EXISTS (
        SELECT 1
          FROM public.department_heads h
          JOIN public.hospital_departments d ON d.id = h.department_id
          LEFT JOIN public.hospital_departments parent ON parent.id = d.parent_id
         WHERE h.user_id = p_user
           AND h.hospital_id = p_hospital
           AND h.starts_at <= now()
           AND (h.ends_at IS NULL OR h.ends_at > now())
           AND (d.catalogue_code = 'PHARMACY'
                OR (parent.catalogue_code = 'PHARMACY'
                    AND EXISTS (SELECT 1 FROM public.pharmacy_dispensing_points p WHERE p.department_id = d.id)))
      )
      AND EXISTS (
        SELECT 1 FROM public.staff_affiliations sa JOIN public.cadres c ON c.id = sa.cadre_id
         WHERE sa.user_id = p_user AND sa.hospital_id = p_hospital
           AND sa.state IN ('approved','active') AND c.code IN ('PHARMACIST','PHARMACY_TECH')
      )
    ELSE
      EXISTS (
        SELECT 1 FROM public.staff_affiliations sa JOIN public.cadres c ON c.id = sa.cadre_id
         WHERE sa.user_id = p_user AND sa.hospital_id = p_hospital
           AND sa.state IN ('approved','active')
           AND p_perm = ANY (private.pharmacy_cadre_permissions(c.code))
      )
    END
  );
$$;

CREATE OR REPLACE FUNCTION private.pharmacy_can(p_perm text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER  -- reads the transaction-local identity, which touches auth.uid(); the reader role has no auth schema
SET search_path = pg_catalog
AS $$
  SELECT private.pharmacy_can_user(private.current_user_id(), private.current_hospital_id(), p_perm);
$$;

REVOKE ALL ON FUNCTION private.pharmacy_cadre_permissions(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.pharmacy_can_user(uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.pharmacy_can(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.pharmacy_cadre_permissions(text), private.pharmacy_can_user(uuid, uuid, text),
  private.pharmacy_can(text) TO medsync_clinical_reader;

-- ─── 2. Signed sets (D-PH1-43) ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pharmacy_signed_sets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN (
    'lane_rule','high_risk_list','controlled_classes','witness_list','outcome_reasons','close_reasons',
    'decline_reasons','reversal_reasons','correction_reasons','adjustment_reasons','batch_choice_reasons',
    'count_difference_reasons','supply_without_pharmacist_reasons','payment_exemption_reasons',
    'identity_routes','query_codes','keep_reasons','withdraw_reasons','substitution_rule','label_fields',
    'warning_lines','additional_instructions','plain_words_templates','counselling_points','staff_copy',
    'patient_copy','message_name','availability_mapping')),
  version integer NOT NULL CHECK (version > 0),
  content jsonb NOT NULL,
  sha256 text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','signed','retired')),
  authored_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  first_signer uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  first_signer_role text CHECK (first_signer_role IS NULL OR char_length(first_signer_role) BETWEEN 2 AND 80),
  second_signer uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  second_signer_role text CHECK (second_signer_role IS NULL OR char_length(second_signer_role) BETWEEN 2 AND 80),
  exception_text text CHECK (exception_text IS NULL OR char_length(exception_text) BETWEEN 10 AND 1000),
  signed_at timestamptz,
  retired_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (hospital_id, kind, version),
  CONSTRAINT pss_signed CHECK (status = 'draft' OR (
    first_signer IS NOT NULL AND signed_at IS NOT NULL
    AND ((second_signer IS NOT NULL AND second_signer <> first_signer) OR exception_text IS NOT NULL))),
  CONSTRAINT pss_retired CHECK ((status = 'retired') = (retired_at IS NOT NULL))
);
-- One version in force per hospital and kind.
CREATE UNIQUE INDEX IF NOT EXISTS pss_one_signed ON public.pharmacy_signed_sets (hospital_id, kind)
  WHERE status = 'signed';

-- A draft may be edited or deleted; a signed row moves only to retired; a retired row never moves.
CREATE OR REPLACE FUNCTION private.pharmacy_signed_sets_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status <> 'draft' THEN RAISE EXCEPTION 'pharmacy_signed_sets: a % set is never deleted', OLD.status; END IF;
    RETURN OLD;
  END IF;
  IF OLD.status = 'retired' THEN RAISE EXCEPTION 'pharmacy_signed_sets: a retired set never changes'; END IF;
  IF OLD.status = 'signed' THEN
    IF NEW.status <> 'retired'
       OR NEW.content IS DISTINCT FROM OLD.content OR NEW.sha256 IS DISTINCT FROM OLD.sha256
       OR NEW.version IS DISTINCT FROM OLD.version OR NEW.kind IS DISTINCT FROM OLD.kind
       OR NEW.hospital_id IS DISTINCT FROM OLD.hospital_id
       OR NEW.first_signer IS DISTINCT FROM OLD.first_signer OR NEW.second_signer IS DISTINCT FROM OLD.second_signer
       OR NEW.signed_at IS DISTINCT FROM OLD.signed_at THEN
      RAISE EXCEPTION 'pharmacy_signed_sets: a signed set only retires; its content never changes';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS pharmacy_signed_sets_guard ON public.pharmacy_signed_sets;
CREATE TRIGGER pharmacy_signed_sets_guard BEFORE UPDATE OR DELETE ON public.pharmacy_signed_sets
  FOR EACH ROW EXECUTE FUNCTION private.pharmacy_signed_sets_guard();

-- ─── 3. Attestations (D-PH1-42) ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pharmacy_attestations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE RESTRICT,
  actor_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  attester_user_id uuid REFERENCES auth.users(id) ON DELETE RESTRICT,
  purpose text NOT NULL CHECK (purpose IN ('witness','signer')),
  action text NOT NULL CHECK (char_length(action) BETWEEN 2 AND 80),
  method text NOT NULL DEFAULT 'password+totp' CHECK (method IN ('password+totp')),
  outcome text NOT NULL CHECK (outcome IN ('passed','failed','locked')),
  attested_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pa_not_self CHECK (purpose = 'signer' OR attester_user_id IS NULL OR attester_user_id <> actor_user_id),
  CONSTRAINT pa_passed_names CHECK (outcome <> 'passed' OR attester_user_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS pa_attester_recent ON public.pharmacy_attestations (attester_user_id, attested_at DESC);
DROP TRIGGER IF EXISTS pharmacy_attestations_append_only ON public.pharmacy_attestations;
CREATE TRIGGER pharmacy_attestations_append_only BEFORE UPDATE OR DELETE ON public.pharmacy_attestations
  FOR EACH ROW EXECUTE FUNCTION public.block_modify_append_only();

-- ─── Grants, RLS, audit ─────────────────────────────────────────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['pharmacy_signed_sets','pharmacy_attestations'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS audit_%1$s ON public.%1$I', t);
    EXECUTE format('CREATE TRIGGER audit_%1$s AFTER INSERT OR UPDATE OR DELETE ON public.%1$I
      FOR EACH ROW EXECUTE FUNCTION public.audit_log_changes()', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
    EXECUTE format('GRANT SELECT ON public.%I TO medsync_clinical_reader', t);
    EXECUTE format('DROP POLICY IF EXISTS %1$s_select ON public.%1$I', t);
  END LOOP;
END $$;

CREATE POLICY pharmacy_signed_sets_select ON public.pharmacy_signed_sets FOR SELECT TO medsync_clinical_reader
  USING (hospital_id = (SELECT private.current_hospital_id()) AND (SELECT private.pharmacy_can('pharmacy.view')));
CREATE POLICY pharmacy_attestations_select ON public.pharmacy_attestations FOR SELECT TO medsync_clinical_reader
  USING (hospital_id = (SELECT private.current_hospital_id()) AND (SELECT private.pharmacy_can('pharmacy.manage')));
