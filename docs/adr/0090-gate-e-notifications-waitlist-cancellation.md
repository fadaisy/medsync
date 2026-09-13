# ADR 0090 — Gate E: notifications, the waitlist, and cancelling a clinic day

**Status:** Accepted — product-owner decision (2026-09-13)

**Builds on** [ADR 0087](0087-capacity-modes.md), [ADR 0088](0088-gate-c-booking-flow.md),
[ADR 0089](0089-gate-d-identity-and-lifecycle.md). Inputs: `docs/booking-app-prd.md` §1.5, §3.2
journeys 3/5/6, §3.3.3, §3.3.4, §3.3.6, §3.6, §4.6, §4.7, §5.2; `docs/booking-app-gate-a-proposal.md`
§5.7, §5.11, §7, §10 row E.

## Context

Gate C queued a receipt and two reminders per booking in `appointment_reminders`, SMS only, and the
dispatcher sent them. Nothing else spoke to the patient: no offer when a place freed, no word when a
clinic day was cancelled, no way to say "I'm coming". PRD §3.3.6 asks for one formally defined
notification interface every module writes to; §3.2.6 for "nobody is dropped silently"; §1.5 for one
confirmation SMS per booking and cost per facility; §5.2 for a separately declinable communication
consent. This ADR records the rulings the server, the web and the phone were built to.

## Decision

### Rulings

- **The interface is a row.** `notification_dispatches` (§5.11) is the ONE outbound queue. Writers insert
  rows through `dispatchRows()` (`_shared/dispatches.ts`, zero imports, one copy for Deno and Next); the
  ONE `*/15` cron drains it — and keeps draining `appointment_reminders` until it is empty. That table is
  never dropped; new bookings simply stop writing to it.
- **Push-first, SMS fallback.** A push row carries `fallback_after`; if the phone has not acknowledged it
  by then (`pt-ack-notification`), the dispatcher inserts the SMS row (key `:push` → `:sms`, idempotent).
  `booking_receipt` and `session_cancelled` are written as BOTH rows up front — always both (§1.5, §3.2.6).
  A provisional recipient (no account) collapses every kind to one SMS: their phone was given for this
  (PRD §2.8). `unconfirmed_release` (beyond §5.11) is also both: a release must never be silent.
- **SMS consent.** `consent_versions` gains `sms_communication` v1.0 (CSO-provisional copy). The
  dispatcher sends SMS to an account only with a live record — **the receipt is the one exception**: it is
  the booking's proof and was requested by the act of booking. Provisional patients are always reachable.
  A consent can be **withdrawn**: `consent_records.revoked_at` (additive) — the row is never altered
  otherwise, and re-granting the same version clears it. Signup, web Settings and mobile Settings carry
  the control, unticked by default, with the honest sentence (PRD §5.2) whenever it is off.
- **Quiet hours are facility policy.** `hospitals.quiet_hours_start/end_minutes_local`, DEFAULT
  21:00–07:00. `waitlist_offer`, `confirmation_request`, `arrival_window`, `window_shifted`, `reminder` are
  HELD and re-scheduled to the window's end; `booking_receipt` and `session_cancelled` are exempt. An
  offer's clock starts when it is SENT.
- **Unconfirmed-release is OFF by default.** `department_scheduling_policy.release_unconfirmed_hours`
  (NULL = off). When set, the cron cancels session/slot bookings still unconfirmed at T-X — only where a
  confirmation request was actually sent — with reason `unconfirmed_release`, notifies, and offers the
  place to the line. No punitive automation unless the facility asks (§3.3.4).
- **A cancelled clinic day offers the next equivalent day pre-selected**, one tap to accept
  (`pt-accept-rebooking`, idempotency `rebook:<cancelled id>`). The console shows the affected count
  (`dry_run: true`) before anyone confirms. `session_cancelled` is exempt from the per-run send cap: 300
  patients hear within one run (a test proves 300 push + 300 SMS in one plan).
- **An offer is a notification, never a hold (C12).** `waitlist_entries` is FIFO per line;
  `offer_released_capacity()` (SQL, `FOR UPDATE SKIP LOCKED`) is the one place "who is offered a freed
  place" is decided, called by `releaseCapacity()` from every release hook and by the cron's expiry
  cascade. Accepting books through the core with the entry id as the idempotency key; a 409 puts the
  entry back to `waiting` with its original place.
- **Window shift.** `clinic_sessions.delay_minutes` (0..480); un-arrived positions' stored windows move by
  the difference; a `window_shifted` dispatch goes at ≥ 30 minutes, keyed by the new delay.
- **Cost is recorded per row** (`cost_amount`, `cost_currency` from Africa's Talking's response) and summed
  on the console's "Sent today" panel — the §3.4 reports seed.
- **The DLR webhook** (`/api/sms/dlr/<SMS_WEBHOOK_SECRET>`) is idempotent on `provider_message_id`, never
  logs the phone, and always answers 200 once the secret matches.

### Deviations from the proposal, recorded

- `notification_dispatches.payload` (ids only) — §5.11 had no payload column; the `session_cancelled`
  row needs the next day's id, `window_shifted` the delay.
- `waitlist_entries.reason`, `released_appointment_id`, `created_by_user_id` — beyond §5.7: the accepted
  booking must carry a reason, a slot offer must find its clinician and time, and a household member's
  entry must name its agent.
- `consent_records.revoked_at` — the schema said immutable; withdrawal is a fact about the consent, not a
  change to what was agreed. DPPA 2019 s.7(3).

### The schema (migration 0061, GATED)

`notification_dispatches`, `push_tokens`, `waitlist_entries`, `offer_released_capacity(uuid)`,
`hospitals.quiet_hours_*`, `department_scheduling_policy.release_unconfirmed_hours`,
`clinic_sessions.delay_minutes`, `appointments.confirmed_by_patient_at`, `consent_records.revoked_at`,
the `sms_communication` v1.0 seed, `sa_audit_log` CHECKs re-issued (+ `join_waitlist`,
`accept_waitlist_offer`, `accept_rebooking`, `confirm_attendance`, `set_session_delay`; + `waitlist_entry`,
`notification_dispatch`). Dry-run BEGIN/ROLLBACK against the dev DB: clean.

**Sequencing:** 0061 before the Gate E functions and the re-deployed core callers
(`pt-request-appointment`, `ha-book-on-behalf`, `cancel-appointment`, `ha-decline-appointment-request`,
`reschedule-appointment`) — they insert `notification_dispatches` rows.

### The server

- `_shared/dispatches.ts` — the builder; `lib/notifications/dispatches.ts` — the planner
  (`planDispatch`, pure, rule order A–K documented in the file) and the copy (GSM-7, one part, never
  punitive). Tests in `tests/notifications/dispatches.test.ts`.
- The dispatcher (`app/api/cron/dispatch-reminders`) — legacy queue → Expo receipts → dispatches (claim
  before send, at-most-once) → offer expiry cascade → unconfirmed release.
- `lib/notifications/expo-push.ts` — fetch, chunks of 100, receipts next run, dead tokens dropped.
- New functions: `pt-join-waitlist`, `pt-withdraw-waitlist`, `pt-accept-waitlist-offer`,
  `pt-confirm-attendance`, `pt-accept-rebooking`, `pt-ack-notification`, `pt-set-sms-consent`,
  `ha-cancel-session`, `ha-set-session-delay`. Modified: the booking core, the three release hooks.

## Consequences

- One queue, one planner, one copy of every rule — a new kind is a builder case, a copy case and a test.
- SMS spend is attributable per facility from day one; push is free and first.
- A patient who declines SMS still gets the receipt; the app says so in words.
- Offers can be missed: a notification is not a hold. That is the C12 trade — no capacity is ever locked
  behind an unanswered message.
- Push needs an EAS project id in `app.json` (`extra.eas.projectId`) before a real token can be minted;
  until then the phone registers nothing and every message falls back to SMS. Owner action.

## What Gate E does NOT do

- No in-app notification centre (the `in_app` channel is held with `no_transport`).
- No live position-called tracking (Gate H); `position_called`, `payment`, `deterioration_flag` are in the
  CHECK with no writer.
- No four-eyes on cancel-session; no staff cancel-reason shown to a booking agent (parked, Gate H).
- USSD and inbound SMS are Gate F ([ADR 0091](0091-gate-f-low-bandwidth-channels.md)).

## Alternatives considered

- **At-least-once sending with a dedupe on the provider** — rejected: a duplicate costs money and trust on
  every retry; a missed nudge costs one patient one message. Claim-before-send stays (0028's pattern).
- **Holding the place for the offeree** — rejected (C12): capacity locked behind an unanswered message is
  capacity nobody gets.
- **A separate `consent_revocations` table** — one column says the same thing; the record's immutability
  is about the text agreed, not about whether it still applies.
