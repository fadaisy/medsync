# ADR 0018 — Superadmin-initiated hospital create path

**Status:** Accepted (2026-05-24)
**Context:** `prompts/hospital-registration-upgrade-kickoff.md` §1, §G, §I (Q3)

## Problem

Some hospitals are onboarded through offline channels: a pilot signed at a meeting, a director introduced by a regulator. Forcing them through the applicant flow re-creates verification friction the system can't usefully add (we already know who they are). But we still need a tenant created, an agreement on file, and a real hospital admin in place. The line between "we know this hospital" and "we _are_ this hospital" is the operator-vs-impersonator boundary from [ADR 0013](0013-superadmin-platform-operator.md).

## Decision

The superadmin can create a hospital tenant directly. Three rules govern the path:

### 1. Verification friction relaxes; agreement and setup do not

- **Verification fields are optional** when `source = 'superadmin_offline'` on the create flow. The superadmin's reason text in `sa_audit_log` records _how the hospital was vetted_ (offline).
- **The agreement gate still applies** ([ADR 0017](0017-hospital-agreement-gate.md)). Superadmin uploads the offline-signed DPA PDF; `hospital_agreements` row is written with `source = 'superadmin_offline'` and `offline_evidence_path` set.
- **The setup wizard still runs.** A tenant is unusable without departments, wards, and an admin roster.

### 2. The superadmin creates the _tenant_, not a _working admin_

The kickoff's strongest principle: "superadmin creates the tenant, not a working admin … never impersonates a hospital's staff." The Edge Function:

1. Creates the `hospitals` row in state `provisioning` (or `verified` if no setup is expected immediately, depending on whether the agreement is being signed in-flight or later).
2. Does NOT create a `user_roles` row for the superadmin scoped to that hospital.
3. Does NOT create a `hospital_admin_roster` row pointing at the superadmin.
4. Sends an **invitation** to a named real-person-from-the-hospital via `hospital_staff_invitations` (`invited_role_id` = the hospital_admin role). The invitee verifies their identity, enrols MFA, accepts the invitation, becomes the hospital admin, and completes the setup wizard.

A hospital that is `active` without any human in `hospital_admin_roster` should be impossible.

### 3. The wizard requires the hospital admin's session

Resolved per kickoff Q3: **No**, the superadmin may not complete the wizard before a real admin exists.

- The wizard's _prefill_ is generous — superadmin can pre-populate departments (from the application/known data), wards (typed in), even invitation drafts.
- **Submission of the wizard** (the action that flips `provisioning → active`) requires:
  - The current session to be the hospital admin's, **not** the superadmin's.
  - At least one `primary` row in `hospital_admin_roster` for the hospital.
  - The agreement-gate EXISTS check.

If a hospital genuinely needs to go live before an admin invitation is accepted (rare emergency), the path is a future four-eyes action (`override_admin_required`) that lands in `sa_pending_approvals` and needs a second superadmin to confirm. We do not build this today.

## Mechanism

- Edge Function `sa-create-hospital` — superadmin-only, runs the create.
- Edge Function `sa-invite-hospital-admin` — superadmin-only, sends the invitation token.
- Edge Function `accept-hospital-admin-invitation` — invitee-authenticated, claims the role, writes both the `user_roles` grant and the `hospital_admin_roster` row atomically.
- Every step writes to `sa_audit_log` with action `'sa_create_hospital'`, `'sa_invite_hospital_admin'`, `'hospital_admin_claimed'` (action enum extended in GATE C).

## Consequences

- A `provisioning` hospital with no admin is a normal intermediate state; the operator-side surface (Tenants page) shows them distinctly as "awaiting admin".
- The audit trail captures both the superadmin's create action AND the invitee's claim action — two separate, linked rows in `sa_audit_log`.
- A superadmin who tries to flip a `provisioning` hospital to `active` via raw SQL would bypass the wizard check; this is mitigated by:
  - The Edge Function is the only authorised path (service-role policies block authenticated UPDATE on `hospitals.state`).
  - Direct DB access requires service-role credentials, which only superadmins have — and the four-eyes safeguard at the workspace layer applies to any catastrophic state flip.
- An applicant-flow hospital that languishes in `verified` for too long can be **superadmin-converted**: superadmin uploads a hand-collected DPA, records the offline acceptance, the tenant progresses to `provisioning` normally. The Audit-log row carries the conversion reason.

## Open question (kept open, not closing in this ADR)

What's the right "stale hospital" threshold? An application sitting in `verified` for 30 days with no progress likely needs operator follow-up. Surface it as a flag on the Approvals queue; the threshold + flag wiring lands in GATE C.

## Related

- [ADR 0013 — Superadmin is platform operator, not super-hospital-admin](0013-superadmin-platform-operator.md)
- [ADR 0016 — Hospital verification model](0016-hospital-verification-model.md)
- [ADR 0017 — Hospital agreement gate](0017-hospital-agreement-gate.md)
