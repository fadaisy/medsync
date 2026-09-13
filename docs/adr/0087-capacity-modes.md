# ADR 0087 — Capacity modes: service lines, session templates, clinic sessions

**Status:** Accepted — product-owner decision (2026-09-13)

**Builds on** [ADR 0029](0029-doctor-scheduling-rework.md) (slot mode, `availability_blocks`),
[ADR 0084](0084-book-or-queue-two-doors-relabelled.md) (two doors, 14-day horizon, no clock numerals),
[ADR 0086](0086-book-at-any-hospital.md). Inputs: `docs/booking-app-prd.md` §2.2, §3.4, §4.4;
`docs/booking-app-gate-a-proposal.md` §5.2–§5.6, §5.13, §9, §10 (rows A′ and B).

## Context

Slot mode — a named time with one patient — is the only capacity model that exists, and it is the wrong
model for the clinic that matters most at the beachhead: "Tuesday Diabetes Clinic, 08:00, cap 60", where
the clinician's time is not allocable per patient and a booked patient should hold a **position** and an
**arrival window**, never a minute. The PRD names three modes (slot, session, open queue); the Gate A
proposal maps them onto the existing engine objects rather than beside them (§5.13): every mode's booking is
still an `appointments` row, every arrival still a `queue_entry`.

This ADR records the rulings Gate B was built to, so that nobody re-decides them in a function body.

## Decision

### Rulings

- **C2 — capacity modes.** `service_lines.capacity_mode IN ('slot','session','open_queue')`. Slot mode is
  unchanged. A **newly created** line defaults to `session` (Part 8 #3). Every existing department was
  **backfilled** with one `slot` line (`name` = department name, `slug` = department slug, the five shipped
  reason codes, `time_to_care_days = 30`, never `is_default`), so nothing that books today changes.
- **C5 — reason codes.** `appointments_reason_check` is widened to Appendix A's 13 codes — `follow_up`,
  `post_discharge`, `new_concern`, `refill`, `test_results`, `antenatal`, `immunisation`, `child_wellness`,
  `specialist_review`, `routine`, `procedure`, `counselling`, `second_opinion` — plus the shipped
  `urgent_review` and `other`. 0053's `appointments_patient_reason_check` is untouched: `urgent_review` stays
  system-only. `service_lines.reason_codes` may hold the 13 plus `other`, never `urgent_review`. The 13 live
  once, in `_shared/sessions-sql.ts` (`PATIENT_REASON_CODES`), for both runtimes.
- **C12 — no holds.** No `held` status, no `hold_expires_at`, no sweeper. Capacity is consumed at
  confirmation by the allocator, and a retry is made safe by the idempotency key instead.
- **Part 8 #4 — split and interleave.** `capacity_booked` defaults to 60% of `capacity_total`, rounded up,
  supplied by the writing function (a column DEFAULT cannot read a sibling); `interleave_booked : interleave_walk_in`
  is `2 : 1` as column DEFAULTs. Both are facility-editable per template and copied into each instance.
- **Part 8 #5 — time-to-care.** Appendix A's proposals are stored — `time_to_care_days DEFAULT 7`, the
  per-family values in the migration comment — and flagged **CSO-provisional** in the migration. Nothing at
  Gate B consumes them; the no-silent-wait ordering is Gate C.
- **C6** — branch cut done. **C8** — the dark-mode toggle **stays**: the owner asked for it explicitly.
- **CSO items (C3, C10, #5–#7, #12–#13)** — no code. Arrival windows are **stored** at confirmation
  (`appointments.arrival_window_start/end`) so the SMS the patient holds never changes, but nothing at Gate B
  renders them; C10 governs whether they are shown.

### Schema (migration 0058, GATED)

- `service_lines` (§5.2), `session_templates` (§5.4), `clinic_sessions` (§5.3) — RLS ENABLE + FORCE, SELECT
  policies only, `set_updated_at` triggers, writes via service-role Edge Functions that audit under the new
  verbs `update_service_line`, `update_session_template`, `cancel_session`, `book_on_behalf` (target kinds
  `service_line`, `session_template`, `clinic_session`).
- `appointments` gains `idempotency_key`, `channel`, `session_id`, `position_number`,
  `arrival_window_start/end`, `booking_code` with the §5.5/§5.6 uniqueness and pairing constraints.
- **The one non-additive step:** `appointments_no_double_booking` is dropped and re-created with
  `session_id IS NULL` added to its predicate. The 0028 index is UNIQUE on live (clinician, starts_at); every
  position in a session shares the session's `starts_at`, so the second position would be a 23505. Slot mode
  keeps the guard exactly as it was; session mode is guarded by the allocator's counter. Every shipped row has
  `session_id NULL` (the column is born in the same migration), so the new index admits exactly what the old
  one admitted.

### The allocator

One statement, no SELECT first (PRD §4.4 "atomic at the database level"), exported once from
`_shared/sessions-sql.ts` so every confirming function uses the same string:

```sql
UPDATE clinic_sessions
   SET booked_count = booked_count + 1, next_position = next_position + 1
 WHERE id = $1 AND status = 'published'
   AND booked_count < ceil(capacity_booked * overbooking_factor)
RETURNING next_position
```

Zero rows = full → 409 carrying the next two published sessions of the same line. Cancellation decrements
`booked_count` only; `next_position` is monotonic, so a position number is never re-issued. The table CHECK is
the belt; the WHERE is the braces.

### The generator

`expandSessionTemplate` in `_shared/slots.ts` (zero imports, both runtimes) turns a template's ISO weekday and
`start_minutes_local` into instants with the same DST-safe civil-day walk as `availability_blocks` recurrence,
never the host clock. Run on template write and nightly (inside the existing 02:00 `cleanup-drafts` cron) over
`[now, now + 14 d]`; idempotent on `UNIQUE (template_id, starts_at)`. `startOfLocalDay` / `endOfLocalDay`
join it as the one day boundary, replacing every `setUTCHours(0)` / `setHours(0)` site (A′ hygiene).

The Edge Function materialises one INSERT per occurrence, tolerating 23505: PostgREST cannot express the
`WHERE template_id IS NOT NULL` an `ON CONFLICT` target needs to infer a partial unique index (a batched
`ignoreDuplicates` upsert 500s). The Next materialiser uses Drizzle's `onConflictDoNothing({ where })`, which
emits the predicate. Batch via a SQL function in a later migration if a rule ever stamps more than a few rows.
An edit may not move a rule to another service line (its materialised instances carry the old line's id) —
deactivate and recreate instead; editing weekday/time leaves the old-time unbooked instances published until
the owner rules otherwise.

### A′ hygiene (shipped with this gate)

- `pt-request-appointment` and `reschedule-appointment` accept an optional `idempotency_key`; a replay
  returns the row the first attempt made with the same 200 body, and a 23505 on
  `appointments_no_double_booking` is a 409 — the two are told apart by constraint name, not by guessing.
  pt-request's check-then-write duplicate query is gone (the index is the guard).
- `ha-complete-encounter` writes `appointments.status = 'completed'` for the linked appointment when it is
  still `arrived`/`in_progress` — before this no code path ever wrote that status.
- `ha-mark-no-show` admits any active/approved staff affiliation at the appointment's hospital; reception
  gets a two-tap no-show control (typed reason) on `/reception/expected` for confirmed rows whose time has
  passed.
- Six `setHours(0)` sites stay host-local with a comment (the doctor calendar's weekly expansion and the
  patient self-tracking calendar read one clock end to end; re-basing one midnight alone breaks them).

## What Gate B does NOT do

- **No booking into sessions.** No function allocates a position, generates a `booking_code`, or writes
  `session_id` — that is Gate C, and the wizard's session-mode step with it.
- **No cancel-session** (`ha-cancel-session`, the release-and-refill loop) — Gate E.
- **No waitlist, no notifications beyond the shipped reminders, no payments** (posture columns only), no
  USSD, no provisional patients, no proxy booking.
- **No open-queue changes.** `pt-declare-intake` is untouched; a line in `open_queue` mode is a label until a
  later gate reads it.

## Consequences

- A hospital admin can describe a session clinic and see its next 14 days published — and a patient still
  cannot book one until Gate C. The console shows sessions honestly as "published", not as bookable.
- The backfill gives every department a `slot` line; the console's first job at a session-mode clinic is to
  add a second line or flip the mode, not to migrate data.
- `capacity_booked` has no DEFAULT, so every writer must compute the 60% rule; a missed writer fails at the
  NOT NULL, loudly, rather than publishing a session with no bookable share.
- `service_lines.reason_codes` and `appointments.reason` share one vocabulary but are checked by two
  constraints that must be widened together; a test parses the migration so the TypeScript list cannot drift.

## Alternatives considered

- **A `session_positions` join table** — 1:1 with an appointment, adds a FK and nothing else; columns on
  `appointments` keep every existing reader (calendar, reminders, `starts_at − lead`) working unchanged.
- **Holds with a sweeper (C12 = hold)** — a `held` status, `hold_expires_at`, a cron; rejected as a second
  race-protection mechanism when the idempotency key already makes a retry return the same row.
- **Widening `appointments_no_double_booking` to include `session_id`** — still rejects two positions in one
  session; the predicate exclusion is the only shape that keeps slot mode's guard intact.
- **Generated column for `capacity_booked`** — cannot be overridden per template, which Part 8 #4 requires.
