# Gate E build contract — notifications, waitlist, cancellation (READ IN FULL)

Repo /Users/airm1/Desktop/medsync, branch feat/booking-app (do not commit). Inputs: docs/booking-app-gate-a-proposal.md (§5.7,
§5.11, §7, §10 row E), docs/booking-app-prd.md (§1.5 cost rules, §3.2 journeys 3/5/6, §3.3.3, §3.3.4, §3.3.6, §3.6, §4.6, §4.7),
ADRs 0087–0089, AGENTS.md. Ground truth: lib/notifications/{sink,receipt,africastalking}.ts, app/api/cron/dispatch-reminders/
route.ts, supabase/functions/\_shared/book.ts, migrations 0058–0060, the mobile app (mobile/src).

## Rulings assumed (ADR 0090)

- The "formally defined interface" is the `notification_dispatches` row (§5.11). New writers insert rows there; the ONE cron
  drains it (and keeps draining `appointment_reminders` until empty — never dropped). Gate C's receipt and the reminders move to
  the new table for new bookings.
- Push-first, SMS fallback: a push row carries `fallback_after`; if not acknowledged by then the dispatcher inserts the SMS row.
  "Ack" = the phone reports receipt/open through `pt-ack-notification`. Receipts (`booking_receipt`) and `session_cancelled` go by
  push AND SMS always (§1.5 "one confirmation SMS per booking"; §3.2.6 "always both"). Everything else: push, SMS only on fallback.
- SMS consent: `consent_records.consent_type = 'sms_communication'` exists in the CHECK but no version row is seeded. Gate E seeds
  `sms_communication` v1 (a migration INSERT into consent_versions, copy CSO-provisional: "MedSync may send SMS about your
  bookings: confirmation, reminders and changes. No marketing. Reply STOP to opt out.") and the patient signup + profile + mobile
  Settings gain the consent control (declinable; declining = in-app/push only, with the honest sentence from PRD §5.2). The
  dispatcher sends SMS only to users with a granted `sms_communication` record OR to provisional patients (their phone was given
  for exactly this, PRD §2.8) — the receipt is the one exception: it is sent regardless, because it is the booking's proof (§3.3.2)
  and was requested by the act of booking. Record this exception.
- Quiet hours are facility policy: `hospitals.quiet_hours_start_minutes_local / end` (DEFAULT 21:00–07:00, additive columns).
  `waitlist_offer`, `confirmation_request`, `arrival_window`, `window_shifted` are HELD inside quiet hours and sent at the end;
  `booking_receipt` and `session_cancelled` are exempt. Offer expiry clocks start when the offer is SENT.
- Unconfirmed-release (PRD §3.2.3 "release at T-minus-X") is facility policy `department_scheduling_policy.release_unconfirmed_hours`
  (additive, NULL = off, DEFAULT NULL): when set, the cron cancels session/slot bookings still unconfirmed by the patient at
  T-X with reason 'unconfirmed_release', notifies, and releases capacity to the waitlist. Default OFF — no punitive automation
  by default (§3.3.4).
- Session cancellation offers the next equivalent session PRE-SELECTED with one-tap accept (`pt-accept-rebooking`); nobody is
  dropped silently — proven by a test over the planner with 300 live bookings.
- Window shift: the desk may set `clinic_sessions.delay_minutes` (additive column, 0..480) on the board; windows are recomputed
  for un-arrived positions and a `window_shifted` dispatch goes when the shift is ≥ 30 minutes (PRD §3.6). Live position-called
  tracking is Gate H.
- `MAX_SENDS_PER_RUN` applies per kind except `session_cancelled`, which is exempt (300 patients must hear within one run).
- Vercel Pro is assumed for cron cadence (owner action already listed); the dispatcher stays at \*/15.

## Phase 1 — server + data (blocking)

1. Migration `0061_notifications_and_waitlist.sql` (GATED): `notification_dispatches` per §5.11 exactly (all columns incl.
   provider*message_id, cost_amount/currency, idempotency_key UNIQUE, related_kind/related_id, fallback_channel/fallback_after,
   acknowledged_at, state incl. 'held'; indexes (state, scheduled_at) partial on queued/held, (provider_message_id); RLS: recipient
   SELECT own (recipient_user_id = auth.uid()); staff at hospital SELECT; no writes); `push_tokens` (user_id FK, token text UNIQUE,
   platform CHECK ('ios','android'), last_seen_at; RLS own SELECT/INSERT/UPDATE/DELETE); `waitlist_entries` per §5.7 (+ RLS patient
   own / agent created_by / staff at hospital); `hospitals.quiet_hours*\*`; `department_scheduling_policy.release_unconfirmed_hours`;
`clinic_sessions.delay_minutes`; `appointments.confirmed_by_patient_at timestamptz NULL`; consent_versions INSERT for
`sms_communication`v1; audit verbs`cancel_session`(exists),`join_waitlist`, `accept_waitlist_offer`, `accept_rebooking`,
`confirm_attendance`, `set_session_delay`; target kinds `waitlist_entry`, `notification_dispatch`. Drizzle + barrel. Dry-run
   BEGIN/ROLLBACK.
2. `lib/notifications/dispatches.ts` (Node) + `supabase/functions/_shared/dispatches.ts` (Deno, zero imports beyond types): a
   pure `dispatchRows(event)` builder that returns the rows to insert for each §4.6 event (kind, channel policy, fallback,
   scheduled_at, idempotency_key = `${kind}:${related_kind}:${related_id}:${suffix}`), used by every writer; a pure planner
   `planDispatch({ rows, now, quietHoursByHospital, tokensByUser, consentByUser }) → { pushSends, smsSends, holds, fallbacks,
reaps }` with tests: quiet hours hold/release, fallback after no ack, receipt exemption, session_cancelled exemption from the cap,
   consent gate, provisional recipients, one-per-(kind,related)-per-run, 300-booking cancellation all sent.
3. Push sender `lib/notifications/expo-push.ts`: POST https://exp.host/--/api/v2/push/send in chunks of 100 (fetch, no SDK),
   `EXPO_PUSH_ACCESS_TOKEN` optional; receipts fetched next run via /--/api/v2/push/getReceipts to mark delivered/failed and
   drop `DeviceNotRegistered` tokens. Never throws.
4. Dispatcher route drains `notification_dispatches` (claim-before-send as today) for push and SMS, records provider_message_id,
   cost_amount/currency from AT's response (typed at africastalking.ts:43), inserts fallback SMS rows, expires waitlist offers and
   cascades (see 6), runs unconfirmed-release when policy set; keeps draining `appointment_reminders` until empty. Same route,
   same cron.
5. Writers: `_shared/book.ts` writes `booking_receipt` + `confirmation_request` (T-24h, fallback_after T-20h) + `arrival_window`
   (T-2h, session rows only) rows to the new table (stop writing appointment_reminders for new bookings); `cancel-appointment`,
   `ha-decline-appointment-request`, `reschedule-appointment` call a shared `releaseCapacity()` (in `_shared/waitlist.ts`) that
   offers the freed session position / slot to the FIFO waitlist (offer = `waitlist_entries.state='offered'`, offered_session_id,
   offer_expires_at = sent+2h, a `waitlist_offer` dispatch); new functions `pt-join-waitlist` {service_line_id, preferred_from,
   preferred_to?}, `pt-withdraw-waitlist`, `pt-accept-waitlist-offer` {waitlist_entry_id} (books through the core with the offered
   session/slot, idempotency = the entry id), `pt-confirm-attendance` {appointment_id}, `pt-accept-rebooking` {cancelled_appointment_id,
   session_id}, `pt-ack-notification` {dispatch_id}, `ha-cancel-session` {session_id, reason ≥ 10 chars} (sensitive: hospital_admin /
   HOD-clinician of the session / superadmin; returns the affected count on a `dry_run: true` first call so the console can show it
   before confirming; on execute: session status 'cancelled', every live appointment → 'cancelled' reason 'session_cancelled',
   positions released (booked_count only), one `session_cancelled` dispatch per patient with the next equivalent session's id in
   `payload`, audit `cancel_session` with the count), `ha-set-session-delay` {session_id, delay_minutes} (recompute windows for
   un-arrived positions; `window_shifted` dispatch when ≥ 30 min shift).
6. DLR webhook `app/api/sms/dlr/[secret]/route.ts` (AT delivery report: form-encoded id/status/phoneNumber/networkCode) — secret
   path segment from `SMS_WEBHOOK_SECRET`, zod, idempotent, updates delivered_at/failed by provider_message_id, never logs the
   phone. Document in supabase/functions/README.md or docs/ops.
7. ADR 0090 + CHANGELOG. Gates: npm run typecheck && npm run lint && npm run test -- --run.

## Phase 2a — web

- Patient: "Confirm I'm coming" on the visit detail when a confirmation_request is pending (T-24h..T); waitlist: "Tell me if a
  place opens" on a full clinic day / a line with nothing in window (join), "Waiting for a place" card on Visits with withdraw,
  offer card with "Take this place" (accept) and the expiry in full words; session_cancelled: the visit shows "This clinic day was
  cancelled" with the pre-selected next day and one tap "Book it"; consent control for SMS on signup (declinable) and profile.
- Reception/HOD console: cancel session (reason, dry-run count shown, confirm), set delay ("Running late by N minutes") on the
  board; a "Sent today" panel on /hospital-admin/scheduling: dispatches by kind with cost sum (SMS spend, §3.4 reports seed).
- Gates: typecheck, lint, test, build.

## Phase 2b — mobile (mobile/src)

- `npx expo install expo-notifications` (expo-device is present); register the Expo push token after sign-in (permission prompt
  with a plain sentence), store via `push_tokens` under RLS, remove on sign-out; foreground/background receipt → `pt-ack-notification`;
  tapping a notification deep-links to the visit (`related_id`). app.json plugin config.
- The same patient surfaces as web: confirm attendance, waitlist join/withdraw/accept, cancelled-day rebooking one tap, SMS consent
  toggle in Settings (with the honest sentence). Tokens only; both themes; a11y. Gates: tsc, eslint, prettier, expo export.

## Verify (two lenses)

- Server: nobody dropped silently — a test builds a session with 300 live bookings and asserts 300 session_cancelled rows and
  300 push + 300 SMS sends across runs; fallback only after no ack; quiet hours; consent gate + receipt exception; provisional
  recipients; cost recorded; DLR idempotent; releaseCapacity called by all three release hooks (grep); offers FIFO and cascade on
  expiry; accept-offer books through the core with the entry id as idempotency; unconfirmed-release OFF by default; RLS text.
- Surfaces: offer expiry stated in full; no punitive copy; cancel-session shows the count before confirming; SMS consent declinable
  with the honest sentence; push permission sentence plain; both themes; a11y.
