# ADR 0086 — A patient may book at any active hospital

**Status:** Accepted — product-owner decision (2026-09-13)

**Supersedes** the primary-facility restriction of PRD §1.5 as applied to self-booking, and
[ADR 0034](0034-book-or-queue-choice-point.md) §3's "hospital_id MUST match patient.primary_facility_id"
in `pt-request-appointment`. Everything else in 0034, 0084 and 0085 stands.

## Context

The doctors list built under ADR 0085 showed the patient's primary hospital only, because the write path
refused any other. The owner asked that "View all" show every doctor, at every hospital. A list of
doctors a patient cannot book would be a list of nothing, so the write path moves with the list.

## Decision

- `pt-bookable-clinicians` takes `hospital_id` as an optional filter. Without it, it returns every
  active clinical affiliation at every hospital whose `state` is `active`, each row naming its hospital.
- `pt-request-appointment` no longer compares `hospital_id` with `patient_profiles.primary_facility_id`.
  The check that makes a booking real — the clinician holds an active affiliation at exactly that
  (hospital, department) — is unchanged and is now the whole boundary.
- The phone's Doctors screen lists every hospital, the patient's own first; the home's Doctors section
  stays the patient's own hospital. A doctor page books at the doctor's hospital, whatever the patient's.
- The walk-in door (`pt-declare-intake`) is untouched: a queue is a place, and the place is the hospital
  you are standing in.

## Consequences

- `primary_facility_id` becomes "where the patient usually goes" — it still drives the home screen, the
  emergency contact and the walk-in door — rather than a fence around booking.
- The all-hospitals read grows with the platform (every clinician's fourteen days). The function notes
  the ceiling; paging by hospital is the upgrade path and the phone already groups by hospital.
- Nothing about referrals is decided here; a self-booked visit elsewhere is simply a visit elsewhere.
