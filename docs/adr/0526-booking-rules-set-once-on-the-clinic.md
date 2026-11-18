# ADR 0526: Days, hours and slot length are set once, on the clinic's week plan

**Status:** Accepted, 18 Nov 2026, on the owner's word in chat ("just fix the thing") after the proposal in
`docs/hospital-admin/harmonize/BOOKING-RULES-PROPOSAL.md` (option A). Admin screens only. Wording is a draft.

Supersedes the part of [ADR 0521](0521-admin-workspace-phase-2.md) that made Departments › Booking rules a full
editor for every department. Builds on [ADR 0525](0525-departments-own-live-on-tether.md).

## Context

The admin was asked for a clinic's days, hours and slot length twice: on the department
(`department_scheduling_policy`) and on the clinic's week plan (`session_templates`). Bookings into a clinic
session read only the week plan, so the department's copy changed nothing for them, and the two could disagree.

## Decision

- Where a department's clinics have a published week plan, Departments › Booking rules shows each clinic's days,
  hours and shortest slot (read from `session_templates`) with a link to that clinic in Clinics & schedule, and
  does not ask for them. The overview line reads the same.
- It still asks for what only the department holds: gap between slots, reminders, confirm straight away, virtual
  visits and notes.
- Saving such a department stores "any day, any hour" as its window (`windowToSave`), never a second copy. If an
  older, tighter window is stored, the panel says so and that saving removes it.
- A department with no week plan on any clinic keeps the full form: nothing else holds its days and hours.

## Consequences

- No migration, no Edge Function change: the same `ha-update-department-policy` call, audited as before.
- Removing an older department window widens two things for that department: bookings into a doctor's own diary
  (still bound by the doctor's availability) and "open now" for app walk-ins. The panel states this before saving.
- Until an admin saves, an older stored window keeps acting on those two paths.
- Still open: working out walk-in "open now" from the week plan; the five clinic Booking switches that no booking
  code reads; one reminder setting read by the reminder job.
