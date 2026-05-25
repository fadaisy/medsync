# ADR 0017 — Hospital agreement gate

**Status:** Accepted (2026-05-24)
**Context:** `prompts/hospital-registration-upgrade-kickoff.md` §1, §E7, §H

## Problem

Holding personal health information requires a legal basis. For a multi-tenant platform that means each institution must have an executed Data-Processing Agreement / MoU on file — _before_ clinical data starts to flow. Phase 0's first cut conflated this with the verification step: a superadmin could approve a hospital with no agreement on record.

## Decision

A signed agreement is a **hard gate** between `verified` (verification complete) and `provisioning` (setup wizard begins). No hospital reaches `active` without an unsuperseded row in `public.hospital_agreements`.

### Mechanism

- Agreement text lives in `hospital_dpa_versions` (pattern mirrors the existing `consent_versions` table). Append-only — versions are superseded, not edited. SHA-256 of the body is recorded so we can prove which exact text a hospital accepted.
- Per-hospital acceptance lives in `hospital_agreements`. One row per signing. Renewal = new row with `supersedes_id` set on the previous row, creating a chain.
- The gate is enforced **server-side at the Edge Function layer** that transitions a hospital to `active`. Before the state flip, the function asserts:
  ```sql
  EXISTS (
    SELECT 1 FROM hospital_agreements
    WHERE hospital_id = $1 AND superseded_by IS NULL
  )
  ```
- The enforcement is NOT a foreign key on `hospitals.state` or a CHECK constraint, because:
  - The same Edge Function pattern handles renewals (delete old → insert new → re-flip state if was `agreement_expired`), which is awkward to express in SQL constraints.
  - Server-side gives a clean error response ("Hospital has no current agreement; have the signatory accept the DPA before activation") rather than an opaque constraint violation.

### Both onboarding paths go through the same gate

- **Applicant path (kickoff §E7):** the applicant ticks acceptance during the application, an Edge Function records the row with `source = 'applicant_flow'`. Activation runs the EXISTS check; passes.
- **Superadmin-created path (kickoff §G):** verification is optional, agreement is not. The superadmin uploads the offline-signed PDF; Edge Function records the row with `source = 'superadmin_offline'` + `offline_evidence_path` set (CHECK enforces evidence required for that source). Activation runs the same EXISTS check; passes.

GATE F's regression suite proves both paths cannot bypass the gate.

### Legal placeholder model

The first seeded version is `v0.placeholder` with `legal_review_status = 'placeholder'`. The text body is clearly marked `{{LEGAL REVIEW — PLACEHOLDER}}` so a grep before go-live finds it. When the Ugandan-counsel-approved v1 lands:

1. A new migration inserts the approved version with `legal_review_status = 'approved'` + `supersedes_id` pointing at the placeholder.
2. A renewal-acceptance flow (deferred) re-prompts hospitals on the placeholder to re-sign against the approved version.

Until the approved version exists, **a hospital that has accepted the placeholder is on a known-transitional contract**. The audit chain captures who-accepted-what-when so the renewal sweep can address them precisely.

## Consequences

- `verified → provisioning` cannot fire without the agreement row.
- A renewal terminates the previous agreement via `supersedes_id` and inserts a fresh one; activation reads "current" as `superseded_by IS NULL`.
- `agreement_expired` lifecycle state exists for the future renewal-required surface (deferred this phase — schema-only).
- The superadmin-created path's `offline_evidence_path` is a private-bucket file (separate Storage bucket: `hospital-offline-agreements`); RLS limits read to superadmin only.
- `hospital_agreements.signed_by_user_id` references `auth.users` with `ON DELETE RESTRICT` — a signed agreement preserves who signed even if the user is later deactivated.

## Alternatives considered

- **CHECK constraint on `hospitals.state`** that requires an agreement row. Rejected: doesn't compose with renewals, and an FK-style constraint to a subquery isn't expressible in standard SQL.
- **One agreements table per hospital** (single row, updated on renewal). Rejected: loses history. We must be able to answer "which version of the DPA did Mulago accept on 2026-04-12?" — only a row-per-signing structure does that.
- **Storing the body inline on `hospital_agreements`.** Rejected: bloats the table; the SHA + version FK is sufficient proof.

## Related

- [ADR 0016 — Hospital verification model](0016-hospital-verification-model.md)
- [ADR 0018 — Superadmin-initiated hospital create path](0018-superadmin-hospital-create-path.md)
- Existing pattern: `consent_versions` (migration 0006)
