# ADR 0033 — Non-clinical staff verification is by hospital-admin attestation

**Status:** Accepted — pending CSO sign-off (2026-05-30)
**Context:** Migration 0033 + ADR 0032 established reception as a non-clinical cadre with the RLS boundary that keeps clinical content off the reception workspace. They left one question open: **what verifies a non-clinical applicant?** Clinical staff are anchored against a council registry (UMDPC / UNMC / AHPC / Pharmacy Board) — reception has no equivalent regulator. This ADR decides the verification floor.

## Decision

### 1. Hospital-admin approval IS the verification anchor

When a hospital admin approves a non-clinical applicant, they are attesting that this person is a current employee in this role. There is no external registry to check; the attestation **is** the verification. This mirrors how most hospitals already verify their own non-clinical hires today.

This is materially different from clinical staff:

- **Clinical path**: applicant uploads council licence → admin matches it against the council registry → approves on the strength of the match. Council is the source of truth.
- **Non-clinical path**: applicant supplies NIN + (optional) supporting evidence → admin checks that this person works here, in this role → approves on the strength of their own knowledge. Admin is the source of truth.

The pending-detail sheet now branches its verification block to make this distinction unmistakable. The non-clinical branch shows a note: _"your approval IS the employer attestation."_ No fake council label is rendered; no licence card is shown for a document that doesn't exist.

### 2. NIN is the identity anchor (required)

We capture the applicant's **National ID number** (encrypted at rest, same pattern as patient PII) so that the admin's attestation is anchored to a real person — not a freely chosen display name. The NIN is stored on `staff_identity_profiles.nin_encrypted` (migration 0034). The admin's panel shows "On file (encrypted)" rather than the value itself; decryption flows through the audited operational-decrypt helper (separate ticket).

NIN shape is validated (`/^[A-Z0-9]{8,16}$/i`) but not checked against a registry — there is no government-facing NIN verification API integrated today. The admin is responsible for matching the NIN to the person standing in front of them on day one.

### 3. Optional supporting evidence — none of it gates signup

The applicant can additionally provide:

- **Appointment letter** (PDF/JPG/PNG, ≤ 5MB) — uploaded to the new `staff-identity-documents` Storage bucket; RLS mirrors `clinician-licences` (hospital_admin SELECT only when an affiliation at their hospital exists for the applicant)
- **Internal staff number** — free-text, hospital-defined
- **Authorising officer + role** — a senior who can vouch for them

None of these block signup. They are signals that help the admin approve faster, not requirements. A reception applicant with NIN-only is still valid; the admin just has less context to work with. **This is the floor — we explicitly rejected requiring formal employment documentation** because most candidate workflows would otherwise stall on document availability, not on legitimate verification.

### 4. Same lifecycle, same audit, same MFA

Non-clinical signup produces the same `staff_affiliations` row in `pending_approval`, follows the same `pending → approved → active` transitions in `actions.ts`, writes the same `sa_audit_log` entries on approval/rejection, and gets the same MFA setup gate before workspace access. The only differences are upstream (what's in the panel) and downstream (which RLS clauses match). No bespoke approval path was introduced.

## Consequences

**Positive:**

- Honest representation: the panel no longer pretends a council exists when one doesn't, and the admin sees explicitly that they are the verifying authority
- Low onboarding friction for non-clinical hires — NIN-only signups are accepted; supporting docs are a nice-to-have
- Same approval queue, same actions, same audit shape — the admin's muscle memory carries over

**Negative / risks:**

- The verification floor depends entirely on the admin's diligence. If an admin rubber-stamps non-clinical applicants without confirming employment, anyone with a valid NIN could acquire a reception affiliation at that hospital. Mitigation: the affiliation's reach is RLS-bounded to non-clinical surfaces (ADR 0032), and approvals are audited with a ≥ 8-char reason
- NIN is not verified against any registry today. Any government-NIN integration would land additively on the existing column

**Reviewed (left alone):**

- Invitation-driven onboarding (admin invites by email + staff joins via tokenised link) — would shift the verification to "admin chose you" instead of "applicant chose admin." Deferred; outside this gate's scope
- Operational NIN-decrypt audit trail — exists separately for patient PII (`audited_decrypt_pii` helper); reception-NIN decryption would route through the same path

## Related

- Migration 0033 (`is_clinical` gate, RLS tightening)
- Migration 0034 (`staff_identity_profiles` + `staff-identity-documents` bucket)
- ADR 0032 (the RLS boundary itself)
- `docs/reception-registration-gate-a-proposal.md` (GATE A proposal that this ADR formalises)
