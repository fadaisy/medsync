# ADR 0202 — Follow-up is a booking

**Status:** Proposed — 2026-10-03.

## Context

`encounters.follow_up` is `none | as_needed | review_date`. Nothing books the review, so the patient leaves with a
date and no place in a clinic.

## Decision

1. **The close dialog books a real slot.** From the Plan's interval (1, 2 or 4 weeks, 3 months) it shows the next
   open slots and clinic days of this department around that date, this clinician first. The read is the booking
   app's own (`fetchLines`, its window starting a little before the date): one slot engine.
2. **Booked through `ha-book-on-behalf`** with `origin: 'clinician'` and reason `follow_up`. The patient gets the
   usual receipt; the booking shows in `/patient/appointments` like any other.
3. **`follow_up` gains `booked`:** `{ kind: 'booked', date, appointment_id }`. The printout reads "Booked: {date}".
4. **No schedule, no slot:** the dialog says "No clinic schedule found: a review date will be recorded instead" and
   records `review_date` as before.

## Consequences

- `ha-book-on-behalf` accepts `origin` (`reception`, the default, or `clinician`).
