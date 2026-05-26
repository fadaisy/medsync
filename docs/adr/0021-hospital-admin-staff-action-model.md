# ADR 0021 — Hospital-admin staff actions are per-affiliation, not per-user

**Status:** Accepted (2026-05-27)
**Context:** Hospital-admin Staff Management feature kickoff §2.3, §2.5. Follows ADR 0019 (workspace shell) and ADR 0020 (helper-derived scope).

## Problem

A clinician can hold staff affiliations at multiple hospitals (the schema has a UNIQUE on `(user_id, hospital_id, department_id, role_id)`, not on `(user_id)`). When a hospital admin suspends a compromised account, deactivates a leaver, resets an MFA factor, or re-assigns a role, the operation must affect ONLY that hospital — never the clinician's access at other hospitals.

The natural shape of "suspend a user" or "deactivate a user" is a column on `users` (a single source of truth for the person). That shape would punish the person at every tenant they work for whenever one admin acts.

## Decision

Every staff-management mutation in `/hospital-admin/staff` writes to **`staff_affiliations`**, never to `users`. The Edge Functions that ship in this gate:

- `ha-set-staff-status` flips `staff_affiliations.state` between `active|approved` / `suspended` / `deactivated`. The user's other affiliations stay at their own state.
- `ha-assign-staff-role` mutates `staff_affiliations.role_id` and `staff_affiliations.department_id` for the targeted row only. The target department must belong to THIS hospital (enforced inside the function — defence against a URL-tampered cross-tenant nudge).
- `ha-request-staff-info` writes to `staff_affiliations.review_note` (new column, migration 0027) and leaves state as `pending_approval`. The applicant's pending page surfaces the note; once approved or rejected, it clears.
- `ha-invite-staff` / `ha-revoke-staff-invitation` write to `hospital_staff_invitations`, scoped by `hospital_id`.

The lone exception is **MFA reset** — Supabase Auth's MFA is per-user, not per-affiliation, so `ha-reset-staff-mfa` un-enrols every factor on the user. The reason ceremony (≥ 8 chars, audited) surfaces this explicitly to the admin before they commit. The blast radius is documented; the alternative (per-tenant MFA factors) doesn't exist in Supabase Auth and is out of scope.

## Why not per-user (with a `users.suspended_at` column)

- It would re-create the cross-tenant entanglement the kickoff explicitly forbids: a Mulago admin suspending a clinician would also lock them out at another hospital where the clinician is doing locum work that's none of Mulago's business.
- It conflates two different operational events: "this _role_ at this _hospital_ is paused" vs "this _person_ should not have a MedSync account". The first is common, daily; the second is rare and belongs in the future user-deletion flow, not in routine staff management.
- The schema already encodes the right boundary (`staff_affiliations.state` is per-row); writing to `users.state` from a per-tenant admin would actively fight that.

## Reactivation lands at `approved`, not `active`

`ha-set-staff-status` reactivating a suspended or deactivated row sets `state = approved`, not `active`. Reason: `active` carries an additional "user has a valid MFA session" semantic in the kickoff's state machine. The reactivation is the affiliation half; the next successful MFA-gated sign-in promotes the user to `active`. This matches the choice made by `approve-staff-affiliation` (the approve function also lands at `approved`, then MFA + sign-in does the rest).

## Audit

Every action — even the un-eventful ones — writes a `sa_audit_log` row with a ≥ 8-char operator reason. Action names are explicit per-transition (`suspend_staff_affiliation` / `deactivate_staff_affiliation` / `reactivate_staff_affiliation`) so a search of the log by action name is precise. The table-level `audit_log` trigger also fires (it's automatic on every UPDATE); the sa_audit row carries the human-readable reason that the trigger can't.

## Consequences

- A clinician who is doing locum work at three hospitals will keep working at the other two when one suspends them. They will see a status change at exactly the affected affiliation. Their sign-in path is unaffected.
- A multi-hospital `hospital_admin` (which the workspace switcher doesn't yet expose, see ADR 0019) would need to switch tenants to act on each — never a global "suspend this clinician everywhere" button. That's the right friction.
- An MFA reset is the only multi-tenant-side-effect action. The Reset MFA panel carries an explicit warning banner. Future work could add per-hospital MFA factors when Supabase Auth supports it.
- Tests at `tests/hospital-admin/staff-per-affiliation.test.ts` prove the rule at the data layer: a same-clinician affiliation at hospital B stays untouched when the A affiliation is suspended.
