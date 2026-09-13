# ADR 0088 — Gate C: the booking flow over three capacity modes

**Status:** Accepted — product-owner decision (2026-09-13)

**Builds on** [ADR 0087](0087-capacity-modes.md) (service lines, clinic sessions, the allocator),
[ADR 0084](0084-book-or-queue-two-doors-relabelled.md) (14-day horizon, emergency signposting),
[ADR 0086](0086-book-at-any-hospital.md). Inputs: `docs/booking-app-prd.md` §2.4, §2.5, §2.7, §3.3.2, §4.4,
§6.3; `docs/booking-app-gate-a-proposal.md` §5.5, §5.6, §5.13, §7, §10 row C.

## Context

Gate B published clinic days that nobody could book. Gate C is the write path: one Edge Function that
books a slot or a session position, a receipt the patient can show at the desk, and the web and phone
wizards over it. This ADR records the rulings the server was built to, so the two clients and the next gate
do not re-decide them.

## Decision

### Rulings

- **C10 — arrival window.** Session mode tells the patient a **range with a stated basis** (PRD §6.3), never a
  point estimate: `arrivalWindow()` in `_shared/slots.ts` — pace = session length ÷ ceil(`capacity_booked` ×
  overbooking); start = session start + (position − 1) × pace − pace/2, floored at the session start; end =
  start + 2 × pace, capped at the session end. Rendered "Arrive between 9:30 AM and 11:00 AM" beside the
  position. Derived once at confirmation and stored (`appointments.arrival_window_*`) so the SMS the patient
  holds never changes. Open queue keeps "no estimate".
- **C12 — no holds** (unchanged from 0087). **C14 —** `StepWizardShell` is the web wizard's shell.
- **Session bookings CONFIRM at request.** Capacity the facility published is capacity; manual approval remains
  a slot-mode concept via clinician settings. This deviates from Gate A §5.6's "allocate at
  `ha-confirm-appointment-request`" — simpler, and true to PRD §2.2.
- **A clinic day with no clinician cannot be booked.** `appointments.clinician_user_id` is NOT NULL; the
  function answers 409 "This clinic day has no clinician assigned yet." The console's T-12h rule
  (a session must name a clinician 12 hours before it starts) is what keeps this from being a dead end.
- **The receipt goes through the existing dispatcher.** One transport, one cost path: the confirming function
  inserts an `appointment_reminders` row of `kind='receipt'` scheduled for now(); the `*/15` cron composes it
  with `lib/notifications/receipt.ts` and sends it. The app shows the code immediately, so the ≤15-minute SMS
  latency is acceptable at launch. A receipt is **never stale** (the planner's grace window applies to
  reminders only) and never supersedes, or is superseded by, a reminder. A receipt for a slot request still
  `pending_approval` is held and goes out the run after the clinician confirms — which is what makes it a
  receipt, and why `ha-confirm-appointment-request` needed no change.
- **Receipt copy** (CSO-provisional, GSM-7, ASCII, ≤160, composed in ONE place):
  - slot: `MedSync: {hospital}. {line}. {Tue 22 Sep, 9:30 AM}. Code {ABC123}. Show this at the desk.`
  - session: `MedSync: {hospital}. {line}. {Tue 22 Sep}, position {23}, arrive {9:30-11:00 AM}. Code
{ABC123}. Show this at the desk.`
  - Names are cut to fit; the code, date and position never are. `{line}` is the service line's name, or the
    department's when the booking names no line.
- **Rate limit.** Five booking requests per patient per rolling hour (counted on `appointments.created_at`,
  whatever became of them) → **429** "You've asked for several visits in the last hour. Try again later." The
  idempotent replay is answered _before_ the count so a retry never trips it.
- **Interstitial** (C9, PRD §2.5), identical on web and phone, ASCII, shown once per booking flow when the
  reason is `new_concern`, BEFORE any capacity step: title "Booking is for care that can wait."; body "If this
  cannot wait, do not book. Go to the nearest emergency unit now."; the hospital's emergency number as a Call
  control when present; one dismiss: "Continue to book". No clinical question anywhere in a booking path.
- **Idempotency key is REQUIRED** on `pt-request-appointment` (a uuid from `crypto.randomUUID()`, generated
  once per submission attempt and reused across retries; any opaque 16–128 character string is accepted). A
  replay returns the first attempt's full 200 body, on both paths.
- **Reschedule of a session booking is refused** for now: "Move this visit from the clinic day list." A
  position is not a time, so `new_starts_at` means nothing to it; the trivial path (release + allocate in the
  target day) exceeded the budget and is a different input. Cancelling a session booking releases its place.

### The server (`pt-request-appointment`)

Input: `hospital_id`, `reason` (Appendix A's 13 + `other`), `reason_note?`, `idempotency_key`, `channel`
(`web` | `app`), and exactly one of `slot { clinician_user_id, department_id, starts_at, ends_at, type?,
service_line_id? }` or `session { session_id }`. Common first: replay → patient exists → rate limit. Then:

- **Session path.** The clinic day must be published, in the future, within the 14-day horizon, at this
  hospital, on an active line in `session` mode whose `reason_codes` include the reason ("That clinic does not
  take this reason."). Capacity is consumed by **`allocate_session_position(p_session)`** — ADR 0087's UPDATE
  as a SQL function; NULL means full → 409 "This clinic day is full — here are the next two." with
  `details.next_sessions` from **`next_sessions_of_line(p_line, p_after)`**. The row is inserted `confirmed`,
  `origin='patient'`, `starts_at`/`ends_at` = the session's, `clinician_user_id` = the session's,
  `department_id` = the line's, plus `session_id`, `position_number`, `arrival_window_*`, `booking_code`,
  `channel`, `idempotency_key`. An INSERT that fails after a successful allocation runs
  **`release_session_position(p_session)`** — one compensating UPDATE of `booked_count` only.
- **Slot path.** As before (`checkSlot`, affiliation, virtual chain, clinician `auto_confirm`), plus
  `booking_code`, `channel`, `idempotency_key`; the reason is validated against a line's `reason_codes` only
  when `service_line_id` is supplied (the phone's slot path sends none).
- **Booking code:** six characters from `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (no 0/O/1/I), CSPRNG-backed, unique
  per hospital by index, up to five retries on collision.
- **Response:** `{ appointment_id, status, booking_code, position_number, arrival_window_start,
arrival_window_end }` — nulls for a slot booking. Audit `book_appointment` gains `channel`, `session_id`,
  `position_number`, `booking_code`.

### The SQL functions (migration 0059, GATED, additive)

All three `SECURITY DEFINER`, `search_path = public, pg_temp`, executable by **`service_role` only** (REVOKE
from PUBLIC, anon, authenticated) — a patient's JWT can never move a session's counters.

| Function                                                  | Returns                                                                                  | Does                                                                                     |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `allocate_session_position(p_session uuid)`               | `smallint` — the position, or NULL when full/unpublished/gone                            | ADR 0087's one-statement UPDATE, guard in the WHERE                                      |
| `next_sessions_of_line(p_line uuid, p_after timestamptz)` | `TABLE (id, starts_at, ends_at, clinician_user_id, venue, places_left integer)` ≤ 2 rows | Published, future, non-full sessions of the line, soonest first                          |
| `release_session_position(p_session uuid)`                | `void`                                                                                   | `booked_count = greatest(booked_count − 1, 0)`; never touches `next_position` (PRD §4.4) |

Plus `appointment_reminders.kind text NOT NULL DEFAULT 'reminder' CHECK IN ('reminder','receipt')`. The
`(state, scheduled_at)` index already exists (0028). A test parses the migration so the function body and
`ALLOCATE_SESSION_POSITION_SQL` cannot drift.

## What Gate C does NOT do

- **No waitlist**, no auto-fill, no `waitlist_entries`.
- **No cancel-session** (`ha-cancel-session`, release-and-refill) — Gate E.
- **No push.** SMS is still the only transport; the receipt rides it.
- **No PWA offline beyond the shell** — a manifest, a service worker that serves a static `/offline` page
  when navigation fails, and nothing cached from the API.
- **No session reschedule** (refused, above), no proxy booking, no payments, no USSD.

## Consequences

- A patient can hold a position in a Tuesday clinic and show a six-character code at the desk within the
  hour of booking; reception can search it.
- Every booking now carries a client key, so a 2G retry is safe on both paths, and a clinician's
  `auto_confirm` no longer decides anything for a session line.
- The dispatcher's row select joins the line and department names; `planReminderDispatch` keys its
  one-per-appointment rule by kind. Existing reminder behaviour is byte-for-byte what it was.
- A leaked place is possible only if `release_session_position` itself fails after a failed INSERT; it is
  logged at error level with the session id, and the CHECK on `booked_count` keeps it from over-allocating.

## Alternatives considered

- **Sending the receipt from the Edge Function directly** — duplicates the Africa's Talking transport into
  Deno and creates a second cost path; rejected for one queue.
- **Allocating at `ha-confirm-appointment-request`** (Gate A §5.6) — makes every session booking a request
  the console must approve; rejected because the facility already decided capacity when it published the day.
- **A plain PostgREST select for the next two sessions** — cannot express `booked_count < ceil(…)`; would
  filter in JS. A second SQL function keeps the contract test honest.
- **Optimistic CAS for the compensating decrement** — a read-then-update loop in supabase-js; a six-line SQL
  function is shorter and correct under contention.
