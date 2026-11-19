# ADR 0530 — Several hospitals at clinical staff sign-up

- **Status:** Proposed (built on a local branch; waits for the owner's yes to merge).
- **Date:** 19 Nov 2026
- **Relates to:** ADR 0123 (profession picker), ADR 0124 (documents after submit), ADR 0020 (tenant scope)

## Context

The booking pilot is with about five private clinics, and their doctors often work at more than one. The clinical
sign-up took one hospital, so a doctor had to be invited again or sign up again for each of the others.

The database never had that limit. `staff_affiliations` is one row per person, hospital, department and role, and
`approve-staff-affiliation` / `reject-staff-affiliation` act on one row, authorised against that row's hospital. The
limit was the form, its action, and the pending page, which read only the newest row.

## Decision

1. **The form takes more hospitals after the first.** Under "Where you work" a doctor adds up to four more
   (`MAX_EXTRA_WORKPLACES`), each with its department, employment type and, where it differs, the post held there
   (a profession under the same council as the main one, since there is one registration). The first hospital's
   fields are unchanged, so drafts and the non-clinical form are untouched. A hospital already chosen is not offered
   again, and the schema refuses one listed twice.
2. **One request per hospital, saved together.** `submitClinicalSignup` inserts one `staff_affiliations` row per
   hospital, all `pending_approval`, in one statement: all are saved or none is. Each department is checked against
   its own hospital.
3. **Approval is unchanged and stays per hospital.** Each hospital's admin sees only their own row in People › To
   review and approves or rejects it alone. One hospital's approval grants nothing at another.
4. **The pending page shows every hospital with its own state.** The headline follows the furthest-on request
   (`leadAffiliation`): an approval anywhere leads, so the person can set up two-step sign-in and start there while
   the others are still being reviewed.
5. **A doctor already signed up adds a hospital from their profile.** `/doctor/profile` lists every hospital with
   its state and offers "Add a hospital" in a centred dialog (the sign-up's own hospital, department and employment
   fields). It makes one more pending request in the post they hold now, approved by that hospital's admin alone
   (`requestHospitalAction`, `joinRefusal`: not a hospital already held or waiting, five open at most).
6. **Leaving a hospital stays with that hospital's admin** (`ha-set-staff-status`, deactivate). The doctor has no
   way to end it themselves: that would be a new write path, and is reported to the owner before it is built.
7. **The department is picked from a searchable list** of the chosen hospital's live departments, the same control
   as the hospital, instead of the system menu.
8. **No migration, no flag, no Edge Function change.**

## Consequences

- A doctor approved at two hospitals still works in one: every workspace scope picks the most recently approved
  affiliation (`lib/doctor/scope.ts` calls a hospital switcher "a polish ticket"). Choosing which hospital you are
  working in today is the next piece of work and is not in this change.
- The specialty asked under "Your practice" is recorded on every request whose post asks for one.
- The optional qualification saved from the pending page now applies to each hospital where the person holds that
  post, not only the newest.
- The non-clinical (front desk) sign-up still takes one hospital.
