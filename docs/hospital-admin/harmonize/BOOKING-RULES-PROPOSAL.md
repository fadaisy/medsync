# Booking rules asked twice: what is wrong and what to do

18 Nov 2026. A proposal for the owner. **Decided the same day: option A, admin screens only (ADR 0526).** The
patient-facing parts of A, the unused clinic switches and reminders are still open. The other half of the same report (a department
taken off Tether still showed under Clinics) is fixed on this branch; see ADR 0525.

## What the admin meets today

Take ENT. The admin is asked about booking in two places, and each place saves to a different record.

| Question                                                                           | Departments › ENT › Booking rules | Clinics › ENT clinic                 |
| ---------------------------------------------------------------------------------- | --------------------------------- | ------------------------------------ |
| Which days                                                                         | Days                              | One session per day in the week plan |
| What hours                                                                         | From, Until                       | Each session's start and end         |
| How long a slot is                                                                 | Shortest slot                     | Each session's slot length           |
| Reminders                                                                          | One or two                        | Reminder text on or off              |
| Gap between slots                                                                  | yes                               | no                                   |
| Confirm bookings straight away                                                     | yes                               | no                                   |
| Virtual visits                                                                     | yes                               | no                                   |
| How far ahead booking opens, when it closes, join today's line, walk-ins when full | no                                | yes (Booking tab)                    |

The first four rows are the same question asked twice. Neither screen shows what the other holds.

## Why (the cause)

There are two booking engines in the product, each with its own settings record, and the admin workspace shows
both as if they were one.

1. **The clinic's week plan** (Clinics & schedule). Patients book a place in a clinic session. Days, hours and slot
   length come only from the clinic's sessions. The department's rules are not looked at for these bookings.
2. **The department's booking rules** (older). They govern booking a named clinician's diary, and whether the
   department counts as "open now" for walk-ins from the patient app.

So for a clinic booked through its week plan, which is how the pilot clinics are set up, the department's days,
hours and slot length change nothing, yet the screen asks for them. The Departments screen even says "the widest a
clinic in this department can book; a clinic can narrow these, never widen them". Nothing checks that.

Two more things found while tracing, both worth knowing:

- The five switches on a clinic's **Booking** tab (opens ahead, closes, join today's line, walk-ins when full,
  reminder text) are saved and published, but no booking code reads them yet. They do nothing today.
- The reminder job does not read either reminder setting. Only rescheduling reads the department's.

## Options

**A. The clinic is the one place (recommended).**
Days, hours, slot length and reminders are set on the clinic only. In Departments, the Booking rules tab becomes a
summary that cannot be edited: "ENT clinic: Mon to Fri, 08:00 to 13:00, 15 min. Change in Clinics." The three
department settings with no clinic twin (gap between slots, confirm straight away, virtual visits) stay there,
under the plainer heading "Doctor's diary bookings", and are shown only for a department that uses diary booking.
"Open now" for walk-ins is worked out from the clinic's sessions, so it can never disagree with them.
Needs: changes to two patient-facing functions and the walk-in check. No database change expected. Removes four
controls from Departments.

**B. Department gives the starting values, clinic owns them after.**
Keep the department form. A new clinic's sessions start from the department's days, hours and slot length, and the
clinic shows "started from ENT's rules". Less to build, but the two can still drift apart afterwards, which is the
complaint.

**C. Keep both and enforce the limit.**
The department stays the outer limit. The clinic editor shows the limit and refuses to publish a session outside
it. Honest to the current wording, but the admin still enters the rules twice.

## Decisions needed from the owner

1. A, B or C for the four duplicated questions.
2. The five clinic Booking switches that do nothing yet: hide them until they are wired, or wire them (a separate
   piece of work touching the booking functions).
3. Reminders: one setting, on the clinic, read by the reminder job. Yes or no.

Screens for the chosen option will be drawn for approval before any build.

## Where each record lives (for the builder)

- Department rules: table `department_scheduling_policy`, written by Edge Function `ha-update-department-policy`,
  loaded by `app/hospital-admin/departments/_lib/booking.ts`. Read by `supabase/functions/_shared/book.ts` (slot
  branch only), `_shared/slots.ts`, `_shared/urgent-slot.ts`, `pt-bookable-clinicians`, `pt-declare-intake`,
  `reschedule-appointment` (reminders), `lib/patient-web/book-data.ts` and `doctors.ts` (walk-in "open now"),
  `lib/scheduling/doctor.ts`, `lib/scheduling/booking-options.ts`.
- Clinic sessions: `session_templates` (weekday, start, duration, `slot_minutes`), materialised to
  `clinic_sessions`; written by drafts through `cs_publish`. The session branch of `_shared/book.ts` reads no
  department rule.
- Clinic Booking tab: `service_lines.booking_rules` (jsonb: `aheadDays`, `closes`, `sameDay`, `walkins`,
  `reminder`, `followUpSkipTriage`). Readers: `lib/clinics-schedule/load.ts` and `ops.ts` only.
