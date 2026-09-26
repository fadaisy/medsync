# ADR 0154 — Clinics are booking services; clinic days are templates; holidays and closures skip them

**Status:** Accepted — 2026-09-26. Signed under the owner's blanket GATE A sign-off (Fadhul, CSO and owner). Spec: `docs/hospital-services/gate-a-proposal.md`.

## Context

Clinics already existed as the booking engine's `service_lines` and `session_templates`, materialised nightly into `clinic_sessions`. Templates repeated weekly only. Nothing knew about public holidays, and nothing could close a clinic for a week.

## Decision

1. **A clinic is a `service_line`** (added from catalogue A.2 or custom) with `audience` (patients book directly, referral only, or staff only), place, unit, confidentiality (ADR 0155) and archive. New clinics start **Planned** (`active = false`); "Set live" materialises their sessions.
2. **Clinic days are `session_templates`** with `repeat_every_weeks` (1–8) or `nth_weekday` (1st–5th, or last), `runs_on_holidays` and `place_id`. A one-off session is a template valid for one day. `expandSessionTemplate` gains the recurrence rules; its defaults are unchanged (slot tests 51/51).
3. **`public_holidays`** is seeded for 2026 and 2027, with its source recorded. Eid dates are provisional and marked "subject to moon sighting". Sessions skip holidays unless the template says otherwise (`skipDayFor`, used by both the nightly materialiser and the upsert function).
4. **`service_closures`** cover the hospital, a department, a ward or a clinic. **Closures always win.**
   - Before saving, the admin sees how many sessions and bookings the closure affects (`closureImpact`).
   - Saving cancels the affected sessions through the existing `ha-cancel-session` flow, so patients are told and offered rebooking.
   - Lifting a closure re-opens future days, but already-cancelled sessions stay cancelled.
5. **The timetable** is a week grid with a printable A4-landscape view, in print CSS only (E-SVC-06).

## Consequences

- No second scheduling engine: Desk, patient booking and USSD see the same sessions.
- Holiday data needs a yearly top-up (movable dates, Eid). This is recorded in the hub's footer text and the STOP reports.
