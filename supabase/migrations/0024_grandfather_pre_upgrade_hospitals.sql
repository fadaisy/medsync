-- ─────────────────────────────────────────────────────────────────────────
-- 0024_grandfather_pre_upgrade_hospitals
--
-- Backfill agreement-gate compliance for hospitals that existed BEFORE
-- the hospital-registration-upgrade landed. Any hospital currently in a
-- tenant-existence state ('active', 'suspended', 'agreement_signed',
-- 'provisioning', 'agreement_expired') without an unsuperseded
-- `hospital_agreements` row gets a `source='grandfathered'` row pointing
-- at the v0.placeholder DPA.
--
-- Why this matters: GATE C's agreement-gate (ADR 0017) refuses any
-- transition INTO 'active' without an agreement on file. Without this
-- backfill, every legacy hospital (Phase 0 seed, pre-upgrade approvals)
-- would be locked out of suspend → reactivate flows forever.
--
-- Honesty rule: grandfathered rows are clearly marked. signatory_name +
-- signatory_title use the literal sentinels '(grandfathered — pre-
-- upgrade)' and '(unknown)' — no faked human names. signed_by_user_id
-- becomes nullable for this source only (extended CHECK below) because
-- there's no specific human who signed.
--
-- Renewal path: the deferred agreement-renewal flow will re-prompt
-- grandfathered hospitals to sign the lawyer-approved DPA when it lands,
-- replacing these rows via the existing supersedes_by chain.
-- ─────────────────────────────────────────────────────────────────────────

-- 1. Extend the source CHECK with 'grandfathered'.
ALTER TABLE public.hospital_agreements
  DROP CONSTRAINT IF EXISTS hospital_agreements_source_check;
ALTER TABLE public.hospital_agreements
  ADD CONSTRAINT hospital_agreements_source_check
  CHECK (source IN ('applicant_flow', 'superadmin_offline', 'grandfathered'));

-- 2. Allow signed_by_user_id NULL only for grandfathered rows.
--    Existing rows already pass this CHECK because they all have
--    signed_by_user_id set.
ALTER TABLE public.hospital_agreements
  DROP CONSTRAINT IF EXISTS hospital_agreements_signed_by_pair;
ALTER TABLE public.hospital_agreements
  ADD CONSTRAINT hospital_agreements_signed_by_pair CHECK (
    source = 'grandfathered' OR signed_by_user_id IS NOT NULL
  );

-- 3. Make signed_by_user_id nullable at the column level. The new
--    CHECK above enforces that only 'grandfathered' rows are allowed
--    to leave it NULL; applicant_flow and superadmin_offline rows
--    must still carry a user id.
ALTER TABLE public.hospital_agreements
  ALTER COLUMN signed_by_user_id DROP NOT NULL;

-- 4. Backfill the grandfathered rows. INSERT ... SELECT joins on the
--    placeholder DPA so each row carries a valid dpa_version_id. Only
--    hospitals in a tenant-existence state get backfilled; rejected /
--    deactivated / offboarded hospitals don't need an agreement.
INSERT INTO public.hospital_agreements (
  hospital_id,
  dpa_version_id,
  signed_at,
  signed_by_user_id,
  signatory_name,
  signatory_title,
  source
)
SELECT
  h.id,
  (
    SELECT id
    FROM public.hospital_dpa_versions
    WHERE version = 'v0.placeholder'
    LIMIT 1
  ),
  h.created_at,
  NULL,
  '(grandfathered — pre-upgrade)',
  '(unknown)',
  'grandfathered'
FROM public.hospitals h
WHERE h.state IN ('active', 'suspended', 'agreement_signed', 'provisioning', 'agreement_expired')
  AND NOT EXISTS (
    SELECT 1
    FROM public.hospital_agreements a
    WHERE a.hospital_id = h.id AND a.superseded_by IS NULL
  );
