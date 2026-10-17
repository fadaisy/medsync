# ADR 0339 — The results consent wording is signed by the data protection lead and publishes the consent version

**Status:** Accepted — 17 Oct 2026 (owner, also the CSO, signing Lab Phase 5 [GATE A](../lab/phase-5/gate-a-proposal.md) as recommended). Built on `feat/lab-beyond-lis`; migrations 0154–0157 are GATED and owner-applied.

## Context

"Show my results in the app" and "Text me when results are ready" are separate, recorded, withdrawable consents (PR-12), and each record must name the exact wording the patient saw.

## Decision

1. The data protection lead drafts and signs `results_consent_notice` on the governance desk (`/referral-governance`): version, the in-app wording, the SMS wording and the legal basis. It is a lead-only kind.
2. Signing publishes `consent_versions` rows for `results_in_app` and `results_sms` (idempotent); the patient's switches record against the newest.
3. 0154 fixes the `consent_versions` check constraint's name so these types are accepted.

## Consequences

Until the wording is signed, no patient can turn results on. Withdrawal hides results at once and stops SMS.
