-- ─────────────────────────────────────────────────────────────────────────
-- 0023_hospital_dpa_v1_placeholder
--
-- Seeds the first row of public.hospital_dpa_versions with a clearly-
-- labelled placeholder. The real text comes from a Ugandan lawyer; this
-- row exists so the agreement-gate machinery is live end-to-end before
-- the legal text lands.
--
-- legal_review_status = 'placeholder' means:
--   - the gate works (no hospital can reach `active` without accepting
--     SOME DPA version)
--   - the audit trail captures who-accepted-what-when
--   - the body_sha256 is real and verifiable (computed inline below)
--   - but a hospital that accepts this row has accepted a placeholder
--     contract; the lawyer-approved v1 will land in a follow-up
--     migration and a re-acceptance flow (deferred) re-prompts hospitals.
--
-- {{LEGAL REVIEW}} is the explicit marker — grep for it before go-live.
-- ─────────────────────────────────────────────────────────────────────────

INSERT INTO public.hospital_dpa_versions (
  version,
  effective_date,
  body,
  body_sha256,
  legal_review_status
)
SELECT
  'v0.placeholder',
  CURRENT_DATE,
  body_text,
  encode(digest(body_text, 'sha256'), 'hex'),
  'placeholder'
FROM (
  SELECT
    E'{{LEGAL REVIEW — PLACEHOLDER}}\n\n' ||
    E'This Data-Processing Agreement (DPA) is a placeholder pending review\n' ||
    E'by Ugandan counsel. It captures the structural intent of the agreement\n' ||
    E'between MedSync and the institution accepting it.\n\n' ||
    E'The institution agrees to lawful processing of personal health\n' ||
    E'information on the MedSync platform, in compliance with the Uganda\n' ||
    E'Personal Data Protection Office (PDPO) and the Data Protection and\n' ||
    E'Privacy Act, 2019. The institution warrants that it has the authority\n' ||
    E'to bind itself to this agreement and that the named signatory holds\n' ||
    E'that authority.\n\n' ||
    E'This placeholder will be superseded by a lawyer-reviewed v1 once\n' ||
    E'available. Acceptance of this version is recorded in\n' ||
    E'hospital_agreements with the SHA-256 of this exact text so we can\n' ||
    E'prove which version each hospital saw.'
    AS body_text
) AS computed
ON CONFLICT (version) DO NOTHING;

-- Requires pgcrypto for digest(). Supabase enables this extension by
-- default; if a fresh project errors, the operator must:
--   CREATE EXTENSION IF NOT EXISTS pgcrypto;
-- before re-running.
