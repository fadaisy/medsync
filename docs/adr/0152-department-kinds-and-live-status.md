# ADR 0152 — Department kinds, live status and the start department

**Status:** Accepted — 2026-09-26. Signed under the owner's blanket GATE A sign-off (Fadhul, CSO and owner). Spec: `docs/hospital-services/gate-a-proposal.md`.

## Context

Every department row was visible everywhere the moment it existed. A hospital could not list a department it runs but hasn't brought onto MedSync, and nothing said which department receives new patients.

## Decision

1. `kind`: clinical | diagnostic | support | administrative. Units (IM sub-specialties, lab sections) are child rows (`parent_id`).
2. **`medsync_live_at`.**
   - When null, the department is "Not on MedSync yet". It is listed in the hub, but staff sign-up, triage queues, intake and booking do not offer it.
   - Readers filter `medsync_live_at IS NOT NULL AND archived_at IS NULL`: `listDepartments`, intake, the patient queue, booking options, USSD and the signup actions.
3. **`is_start`: exactly one per hospital,** enforced by a partial unique index. A CHECK makes it top-level, live and not archived. It is backfilled from the application's `is_primary`.
4. **Archive, not delete.** `archiveVerdict` refuses while staff, open sessions, wards or the start flag depend on the department, and says what to reassign first.

## Consequences

- The onboarding checklist's Departments task is done when a start department is live.
- A department taken off MedSync disappears from sign-up and booking, but its history stays.
