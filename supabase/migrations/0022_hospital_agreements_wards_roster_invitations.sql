-- ─────────────────────────────────────────────────────────────────────────
-- 0022_hospital_agreements_wards_roster_invitations
--
-- Hospital-registration-upgrade GATE A — five new operational tables
-- supporting the agreement gate, the post-approval setup wizard,
-- admin succession, and staff invitations.
--
-- Tables (each gets RLS deny-by-default + audit trigger):
--   1. hospital_dpa_versions      — versioned DPA text (SHA-256 anchored)
--   2. hospital_agreements        — per-hospital signings; the gate
--                                    for activation is enforced server-
--                                    side by Edge Functions, NOT via FK
--   3. hospital_wards             — name + bed_count (setup wizard §F2)
--   4. hospital_admin_roster      — primary + backup, succession trail;
--                                    partial UNIQUE enforces exactly one
--                                    current primary per hospital
--   5. hospital_staff_invitations — single-use token hash; NEVER grants
--                                    access, only pre-fills + tracks
--
-- Finalises 0021 by attaching the FK on
-- hospital_applications.agreement_accepted_version → hospital_dpa_versions.id
-- now that the target table exists.
-- ─────────────────────────────────────────────────────────────────────────

-- ─── hospital_dpa_versions ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.hospital_dpa_versions (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version               text NOT NULL,
  effective_date        date NOT NULL,
  body                  text NOT NULL,
  body_sha256           text NOT NULL,
  legal_review_status   text NOT NULL DEFAULT 'placeholder',
  supersedes_id         uuid REFERENCES public.hospital_dpa_versions(id) ON DELETE SET NULL,
  created_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hospital_dpa_versions_legal_status_check
    CHECK (legal_review_status IN ('placeholder','under_review','approved'))
);

CREATE UNIQUE INDEX IF NOT EXISTS hospital_dpa_versions_unique
  ON public.hospital_dpa_versions(version);
CREATE INDEX IF NOT EXISTS hospital_dpa_versions_effective_idx
  ON public.hospital_dpa_versions(effective_date DESC);

DROP TRIGGER IF EXISTS audit_hospital_dpa_versions ON public.hospital_dpa_versions;
CREATE TRIGGER audit_hospital_dpa_versions
  AFTER INSERT OR UPDATE OR DELETE ON public.hospital_dpa_versions
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_changes();

ALTER TABLE public.hospital_dpa_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hospital_dpa_versions FORCE ROW LEVEL SECURITY;

-- Anyone authenticated can read — applicants must see the active
-- version before accepting; anon can also see it from the public
-- onboarding form (rate limited at the action layer).
DROP POLICY IF EXISTS hospital_dpa_versions_select_all ON public.hospital_dpa_versions;
CREATE POLICY hospital_dpa_versions_select_all
  ON public.hospital_dpa_versions
  FOR SELECT TO anon, authenticated
  USING (true);

-- Only superadmin can introduce new versions. Service-role bypasses
-- but defence in depth is cheap.
DROP POLICY IF EXISTS hospital_dpa_versions_insert_superadmin ON public.hospital_dpa_versions;
CREATE POLICY hospital_dpa_versions_insert_superadmin
  ON public.hospital_dpa_versions
  FOR INSERT TO authenticated
  WITH CHECK (public.user_has_role('superadmin'));

-- ─── hospital_agreements ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.hospital_agreements (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id         uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  dpa_version_id      uuid NOT NULL REFERENCES public.hospital_dpa_versions(id) ON DELETE RESTRICT,
  signed_at           timestamptz NOT NULL DEFAULT now(),
  signed_by_user_id   uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  signatory_name      text NOT NULL,
  signatory_title     text NOT NULL,
  source              text NOT NULL,
  offline_evidence_path text,
  effective_until     timestamptz,
  superseded_by       uuid REFERENCES public.hospital_agreements(id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hospital_agreements_source_check
    CHECK (source IN ('applicant_flow','superadmin_offline')),
  CONSTRAINT hospital_agreements_superadmin_evidence CHECK (
    source <> 'superadmin_offline' OR offline_evidence_path IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS hospital_agreements_hospital_idx
  ON public.hospital_agreements(hospital_id);
CREATE INDEX IF NOT EXISTS hospital_agreements_signed_at_idx
  ON public.hospital_agreements(signed_at DESC);
CREATE INDEX IF NOT EXISTS hospital_agreements_current_idx
  ON public.hospital_agreements(hospital_id) WHERE superseded_by IS NULL;

DROP TRIGGER IF EXISTS audit_hospital_agreements ON public.hospital_agreements;
CREATE TRIGGER audit_hospital_agreements
  AFTER INSERT OR UPDATE OR DELETE ON public.hospital_agreements
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_changes();

ALTER TABLE public.hospital_agreements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hospital_agreements FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS hospital_agreements_select_scoped ON public.hospital_agreements;
CREATE POLICY hospital_agreements_select_scoped
  ON public.hospital_agreements
  FOR SELECT TO authenticated
  USING (
    public.user_has_role('superadmin')
    OR public.user_has_role('hospital_admin', hospital_id)
  );
-- No write policy for `authenticated` — writes are service-role only
-- (Edge Functions sign-on-behalf with full audit).

-- ─── hospital_wards ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.hospital_wards (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id   uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  department_id uuid REFERENCES public.hospital_departments(id) ON DELETE SET NULL,
  name          text NOT NULL,
  slug          text NOT NULL,
  bed_count     integer NOT NULL DEFAULT 0,
  state         text NOT NULL DEFAULT 'active',
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hospital_wards_bed_count_nonneg CHECK (bed_count >= 0),
  CONSTRAINT hospital_wards_state_check CHECK (state IN ('active','inactive'))
);

CREATE UNIQUE INDEX IF NOT EXISTS hospital_wards_unique_slug
  ON public.hospital_wards (hospital_id, slug);
CREATE INDEX IF NOT EXISTS hospital_wards_hospital_idx
  ON public.hospital_wards (hospital_id);

DROP TRIGGER IF EXISTS set_updated_at_hospital_wards ON public.hospital_wards;
CREATE TRIGGER set_updated_at_hospital_wards
  BEFORE UPDATE ON public.hospital_wards
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS audit_hospital_wards ON public.hospital_wards;
CREATE TRIGGER audit_hospital_wards
  AFTER INSERT OR UPDATE OR DELETE ON public.hospital_wards
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_changes();

ALTER TABLE public.hospital_wards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hospital_wards FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS hospital_wards_select_scoped ON public.hospital_wards;
CREATE POLICY hospital_wards_select_scoped
  ON public.hospital_wards
  FOR SELECT TO authenticated
  USING (
    public.user_has_role('superadmin')
    OR public.user_has_role('hospital_admin', hospital_id)
  );

DROP POLICY IF EXISTS hospital_wards_write_admin ON public.hospital_wards;
CREATE POLICY hospital_wards_write_admin
  ON public.hospital_wards
  FOR ALL TO authenticated
  USING (
    public.user_has_role('superadmin')
    OR public.user_has_role('hospital_admin', hospital_id)
  )
  WITH CHECK (
    public.user_has_role('superadmin')
    OR public.user_has_role('hospital_admin', hospital_id)
  );

-- ─── hospital_admin_roster ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.hospital_admin_roster (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id       uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  user_id           uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  designation       text NOT NULL,
  designated_at     timestamptz NOT NULL DEFAULT now(),
  designated_by     uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  succeeded_at      timestamptz,
  succeeded_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  succession_reason text,
  CONSTRAINT hospital_admin_roster_designation_check
    CHECK (designation IN ('primary','backup'))
);

-- Exactly one current primary per hospital. Backups have no limit.
CREATE UNIQUE INDEX IF NOT EXISTS hospital_admin_roster_one_primary_per_hospital
  ON public.hospital_admin_roster (hospital_id)
  WHERE succeeded_at IS NULL AND designation = 'primary';

CREATE INDEX IF NOT EXISTS hospital_admin_roster_hospital_idx
  ON public.hospital_admin_roster (hospital_id, succeeded_at);
CREATE INDEX IF NOT EXISTS hospital_admin_roster_user_idx
  ON public.hospital_admin_roster (user_id);

DROP TRIGGER IF EXISTS audit_hospital_admin_roster ON public.hospital_admin_roster;
CREATE TRIGGER audit_hospital_admin_roster
  AFTER INSERT OR UPDATE OR DELETE ON public.hospital_admin_roster
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_changes();

ALTER TABLE public.hospital_admin_roster ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hospital_admin_roster FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS hospital_admin_roster_select_scoped ON public.hospital_admin_roster;
CREATE POLICY hospital_admin_roster_select_scoped
  ON public.hospital_admin_roster
  FOR SELECT TO authenticated
  USING (
    public.user_has_role('superadmin')
    OR public.user_has_role('hospital_admin', hospital_id)
  );
-- Writes are service-role only — the succession Edge Function flips
-- superseded_at + inserts a replacement row atomically with the
-- matching user_roles change.

-- ─── hospital_staff_invitations ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.hospital_staff_invitations (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id             uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  invited_email           text NOT NULL,
  invited_name            text,
  invited_role_id         uuid REFERENCES public.roles(id) ON DELETE RESTRICT,
  invited_council_number  text,
  invitation_token_hash   text NOT NULL,
  invited_by              uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  invited_at              timestamptz NOT NULL DEFAULT now(),
  expires_at              timestamptz NOT NULL DEFAULT (now() + interval '14 days'),
  accepted_at             timestamptz,
  accepted_by_user_id     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  revoked_at              timestamptz,
  revoked_by              uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  revocation_reason       text,
  source                  text NOT NULL DEFAULT 'individual',
  CONSTRAINT hospital_staff_invitations_source_check
    CHECK (source IN ('individual','bulk')),
  CONSTRAINT hospital_staff_invitations_state_pair CHECK (
    accepted_at IS NULL OR revoked_at IS NULL
  )
);

CREATE INDEX IF NOT EXISTS hospital_staff_invitations_hospital_idx
  ON public.hospital_staff_invitations (hospital_id, invited_at DESC);
CREATE INDEX IF NOT EXISTS hospital_staff_invitations_open_idx
  ON public.hospital_staff_invitations (hospital_id)
  WHERE accepted_at IS NULL AND revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS hospital_staff_invitations_email_idx
  ON public.hospital_staff_invitations (invited_email);

DROP TRIGGER IF EXISTS audit_hospital_staff_invitations ON public.hospital_staff_invitations;
CREATE TRIGGER audit_hospital_staff_invitations
  AFTER INSERT OR UPDATE OR DELETE ON public.hospital_staff_invitations
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_changes();

ALTER TABLE public.hospital_staff_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hospital_staff_invitations FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS hospital_staff_invitations_select_admin ON public.hospital_staff_invitations;
CREATE POLICY hospital_staff_invitations_select_admin
  ON public.hospital_staff_invitations
  FOR SELECT TO authenticated
  USING (
    public.user_has_role('superadmin')
    OR public.user_has_role('hospital_admin', hospital_id)
  );
-- Insert/update/delete are service-role only.

-- ─── Final FK on hospital_applications.agreement_accepted_version ──────
-- 0021 added the column without REFERENCES because the target table
-- didn't exist yet. Attach the FK now.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'hospital_applications_agreement_version_fk'
  ) THEN
    ALTER TABLE public.hospital_applications
      ADD CONSTRAINT hospital_applications_agreement_version_fk
      FOREIGN KEY (agreement_accepted_version)
      REFERENCES public.hospital_dpa_versions(id) ON DELETE RESTRICT;
  END IF;
END$$;
