# ADR 0410 — The staff home dashboards show the coming days

**Status:** Accepted, 2026-10-18. Owner report: "when someone books, this isn't appearing on the respective dashboards, receptionist, doctor etc."

## Context

The bookings were in the database, confirmed, with the right hospital, clinician and department. They were made on Saturday 18 October for Monday and Wednesday. Both home dashboards show today only:

- reception's Today counts;
- the doctor's Overview or Workspace.

Only reception's Expected page (with a date chosen) and the doctor's Schedule reached other days. So a new booking showed nowhere a person first lands.

## Decision

1. **Reception's Today page** gets a "Coming days" strip: the next seven days from tomorrow, each with its number of bookings.
   - It uses the same definition as the Expected board (`fetchExpectedCountsByDay`).
   - Each day links to `/reception/expected?date=YYYY-MM-DD`.
2. **The doctor's home** (Overview and Workspace alike) gets "Your coming days": the clinician's own live bookings for the next seven days (`fetchClinicianComingDays`). Each day also says how many still wait for the doctor's approval, and links to the Schedule.
3. **Counts and dates only.** No name is shown, so no identity reveal or audit row is needed here. Names stay on the audited surfaces they link to.

## Consequences

- Today's counts are unchanged.
- Bookings further than seven days ahead are still only on the Expected board and in the Schedule.
