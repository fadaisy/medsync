# ADR 0016 — Hospital verification model

**Status:** Accepted (2026-05-24)
**Context:** `prompts/hospital-registration-upgrade-kickoff.md` §E6, §I

## Problem

A hospital onboarding flow without active anti-fraud only proves an applicant _claims_ to represent an institution. Phase 0's first cut accepted an applicant role + an authorisation document path and was approved at the superadmin's discretion. That's insufficient for an institution-trust posture: the platform-operator principle from [ADR 0013](0013-superadmin-platform-operator.md) extends to the institutions being onboarded — we must be able to evidence _how each hospital was vetted_ if the PDPO ever asks.

## Decision

The verification model is **three concentric trust anchors**, all required for the applicant-driven path:

1. **Institutional email domain match.** The applicant's work email must match `institutional_email_domain`. Mismatch sets `email_domain_mismatch = true` and flags the row for stricter superadmin review — never silently rejects.
2. **Documentary evidence.** Two private-bucket file uploads:
   - `facility_licence_path` — the facility licence/registration document.
   - `authority_letter_path` — a signed authorisation letter on hospital letterhead naming the applicant.
3. **Independent callback contact.** A senior officer's phone or email, **not** the applicant's. This is the channel a superadmin uses to _confirm_ the applicant has authority. It is the strongest anti-fraud bar in the flow.

### Why callback-contact is required (not optional)

The kickoff offered a dial-down to optional-but-flagging. We chose **required** for the applicant path:

- Without it the only fraud check is the institutional email domain, which a sophisticated actor can spoof. We don't want to be one fraudulent registration away from a fake hospital admin in production.
- The kickoff §K calls out: "PDPO will ask exactly how each hospital was vetted." A verification trail with two anchors (email + documents) plus a confirmed-by-callback signal is materially stronger than two anchors alone.
- Cost is ~5 extra seconds of legitimate-applicant friction. Trade is favourable.
- Loosening later is a one-line change; tightening after a fraud incident is reputational.

### Superadmin-created hospitals (§G) relax verification but not agreement

When a superadmin creates a hospital directly (offline trust established already), verification fields are **optional**. The reasoning the kickoff §1 makes explicit: _trust came from outside the system_. The superadmin's reason text in `sa_audit_log` is the verification trail in that case.

The **agreement gate** ([ADR 0017](0017-hospital-agreement-gate.md)) does NOT relax. The **setup wizard** does NOT relax. Verification is the only friction that relaxes.

## Consequences

- Every hospital application carries: institutional email domain, applicant work email, facility licence path, authority officer name + title, authority letter path, callback contact value + kind. All required server-side via Zod before the application can transition out of `pending_approval`/`applied`.
- Superadmin queue surfaces `email_domain_mismatch` as a visual flag (handled in the superadmin workspace's Approvals queue craft layer).
- The `under_review` state (new in this upgrade) is the intermediate state where a superadmin is actively gathering callback evidence before moving the application to `verified`.
- `callback_contact_value` is PII; encryption-at-rest via `lib/encryption.ts` is a follow-up wrap in GATE B (text-stored ciphertext, no schema change).

## Alternatives considered

- **Email-only verification.** Rejected: too thin for an institution-trust posture; sets a precedent that becomes hard to undo.
- **Optional-but-flagging callback.** Rejected for the reasons above. Available as a configuration if the friction proves prohibitive in practice — would be a Zod schema edit + one CHECK constraint relax, no migration.
- **Third-party verification provider** (e.g. business-registry API for Uganda). Deferred: no production-grade API for Ugandan hospital licences exists today; revisit when one does.

## Related

- [ADR 0017 — Hospital agreement gate](0017-hospital-agreement-gate.md)
- [ADR 0018 — Superadmin-initiated hospital create path](0018-superadmin-hospital-create-path.md)
- Schema proposal: `docs/hospital-registration-upgrade-schema-proposal.md`
