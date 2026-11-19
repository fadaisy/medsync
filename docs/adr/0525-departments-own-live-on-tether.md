# ADR 0525: Departments owns "Live on Tether"; Clinics & schedule follows it

**Status:** Accepted for the read path, 18 Nov 2026 (owner's report: a department taken off Tether still showed
under Clinics). Wording is a draft. The booking-rules half of the same report is a proposal awaiting the owner
(`docs/hospital-admin/harmonize/BOOKING-RULES-PROPOSAL.md`); nothing in it is built.

Builds on [ADR 0501](0501-clinics-schedule-editor-over-engine.md) (one record per fact) and
[ADR 0521](0521-admin-workspace-phase-2.md) (Departments in the desk).

## Context

"Live on Tether" is one stored fact, `hospital_departments.medsync_live_at`, written only by Departments
(`ha-services-hub` op `set_department_live`, which also covers the department's units). Booking already follows it
(`lib/scheduling/booking-options.ts`, D-SVC-02). Clinics & schedule read the same fact but only as a readiness
check: the clinic stayed in the list, the week plan, desks and Get ready, marked "Needs setup". To the admin the
department's switch had done nothing.

## Decision

- Clinics & schedule draws `onTether(snapshot, deptLive)` (`lib/clinics-schedule/model.ts`): the clinics of a
  department that is off Tether, their sessions and their extra sessions are left out of every view.
- Nothing is written. The clinic, its sessions and its bookings stay as they are, so setting the department live
  brings the clinic back exactly as it was. Publishing and saving still work on the whole record.
- Clinics and Get ready say which clinics are not shown and why, with a link to the department.
- The clinic editor offers live departments only (plus the clinic's own), and a clinic cannot be added while no
  department is live.
- In Departments, a clinic of a department that is off Tether reads "Off Tether with its department" and no longer
  links to a list it is not in.

## Consequences

- A hospital that has just brought in the Ministry preset (everything arrives not live) sees no clinics in Clinics &
  schedule until it sets a department live; the note says so.
- No migration, no Edge Function change, no RLS change.
- Not changed here, found while tracing: the patient website's price list and walk-in list
  (`lib/patient-web/book-data.ts`, `lib/patient-web/doctors.ts`) read clinics and departments without the
  live-on-Tether check that booking uses. Listed as a follow-up.
