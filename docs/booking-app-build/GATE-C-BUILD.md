# Gate C build contract — the booking flow over three capacity modes (READ IN FULL)

Repo /Users/airm1/Desktop/medsync, branch feat/booking-app (checked out; do not commit). Inputs in order:
docs/booking-app-gate-a-proposal.md (§5.5, §5.6, §5.13, §7, §10 row C), docs/booking-app-prd.md (§2.4, §2.5, §2.7, §3.3.1, §3.3.2,
§6.3), docs/adr/0087-capacity-modes.md, AGENTS.md (Next 16 docs in node_modules/next/dist/docs; design system), the mobile
contracts under this scratchpad (REFERENCE-LANGUAGE.md, MOBILE-0085.md) for the phone's kit and rules. Gate B's tables are the
ground truth: read supabase/migrations/0058_service_lines_and_sessions.sql and db/schema/{service-lines,clinic-sessions,scheduling}.ts.

## Rulings assumed (ADR 0088 records them)

- C10: the ARRIVAL WINDOW is permitted for session mode (a range with a stated basis, PRD §6.3); no point estimate anywhere; open
  queue keeps "no estimate". Rendered as "Arrive between 9:30 AM and 11:00 AM" beside the position.
- C12: no holds. C14: StepWizardShell (components/responsive/step-wizard.tsx) is the web wizard's shell.
- Session bookings CONFIRM at request (capacity the facility published is capacity; manual approval remains a slot-mode concept
  via clinician settings). Deviation from Gate A §5.6's "allocate at ha-confirm" — simpler and true to PRD §2.2; recorded.
- Receipt SMS goes through the existing dispatcher (one transport, one cost path): a `kind='receipt'` reminder row scheduled now,
  sent by the \*/15 cron. The app shows the code immediately, so the ≤15-minute SMS latency is acceptable at launch.
- Rate limit: 5 booking requests per patient per rolling hour → 429 with a sentence.
- Interstitial copy (CSO-provisional, identical on web + phone, ASCII): title "Booking is for care that can wait."; body "If this
  cannot wait, do not book. Go to the nearest emergency unit now."; then the hospital's emergency number as a Call control when
  present; one dismiss: "Continue to book". Shown once per booking flow when the reason is `new_concern`, BEFORE any capacity step.
- Copy for the durable receipt (GSM-7, <=160 chars, ASCII only, `isGsmSafe` true), composed in ONE place (lib/notifications/receipt.ts,
  pure, tested) and used by the dispatcher:
  slot: "MedSync: {hospital}. {line}. {Tue 22 Sep, 9:30 AM}. Code {ABC123}. Show this at the desk."
  session: "MedSync: {hospital}. {line}. {Tue 22 Sep}, position {23}, arrive {9:30-11:00 AM}. Code {ABC123}. Show this at the desk."
  Truncate hospital/line names to fit; never truncate the code.

## Phase 1 — server (one agent; blocking)

1. Migration `0059_receipts.sql` (GATED, additive): `appointment_reminders.kind text NOT NULL DEFAULT 'reminder' CHECK IN
('reminder','receipt')`; index (state, scheduled_at) if absent. Drizzle column. That is the whole migration.
2. `supabase/functions/_shared/slots.ts` (zero imports stays): `export function bookingCode(random: () => number): string` — 6 chars
   from "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; `export function arrivalWindow(args: { sessionStartsAt: Instant; sessionEndsAt: Instant;
capacityBooked: number; overbookingFactor: number; position: number }): { start: Date; end: Date }` — window length =
   session length / ceil(capacityBooked _ overbooking); start = sessionStart + (position-1) _ len - len/2 clamped to
   sessionStart; end = start + len \* 2 clamped to sessionEnd (a range, stated basis = position × pace). Tests for both
   (alphabet, length, determinism from the injected random; window monotonic in position, clamped, never past session end).
3. `pt-request-appointment` becomes the three-mode writer:
   - Input (zod): `hospital_id`, `reason` (the 13 PATIENT_REASON_CODES + "other", from \_shared/sessions-sql.ts), `reason_note?`,
     `idempotency_key` (uuid, REQUIRED), `channel` ('web'|'app'), and EXACTLY ONE of
     slot: `{ clinician_user_id, department_id, starts_at, ends_at, type? }` (today's path, unchanged behaviour), or
     session: `{ session_id }`.
   - Common first: patient exists; rate limit (count appointments where patient_user_id = caller AND created_at > now()-1h; >= 5 →
     429 conflict-style sentence "You've asked for several visits in the last hour. Try again later."); idempotent read-back on
     23505 of appointments_idempotency_unique (A′ already does this — keep it, extend to the session path).
   - Session path: SELECT clinic*sessions JOIN service_lines (status='published', starts_at > now, line.active, line.capacity_mode
     ='session', hospital matches); refuse reasons not in line.reason_codes ("That clinic does not take this reason.");
     allocator = the ALLOCATE_SESSION_POSITION_SQL string via `sb.rpc`? — supabase-js cannot run raw SQL: create a SQL function in
     migration 0059 `public.allocate_session_position(p_session uuid) RETURNS smallint` SECURITY DEFINER that executes exactly that
     UPDATE and returns next_position or NULL when full (grant EXECUTE to service_role only; revoke from public/anon/authenticated).
     NULL → 409 "This clinic day is full — here are the next two." with `details.next_sessions` from NEXT_SESSIONS_OF_LINE_SQL
     (second SQL function `next_sessions_of_line(p_line uuid, p_after timestamptz)` or a plain PostgREST select — your call; keep
     the contract test passing). INSERT appointments: session_id, position_number, starts_at/ends_at = session's, clinician_user_id
     = session.clinician_user_id (nullable? appointments.clinician_user_id is NOT NULL — check; if NOT NULL and the session has no
     clinician, refuse to book with "This clinic day has no clinician assigned yet." and say so in the report — the console's
     T-12h rule covers it), department_id = line.department_id, status 'confirmed', origin 'patient', reason, arrival_window*\*
     from arrivalWindow(), booking_code (retry up to 5 times on the (hospital_id, booking_code) unique), channel, idempotency_key.
     On insert failure AFTER a successful allocation, decrement booked_count (never next_position) — one compensating UPDATE.
   - Slot path: as today + booking_code + channel + idempotency_key; reason validated against the line's reason_codes only when a
     `service_line_id` is supplied (the phone's slot path today has none — accept and skip).
   - Receipt: insert appointment_reminders { appointment_id, channel:'sms', kind:'receipt', scheduled_at: now() }. Reminders as today.
   - Response: { appointment_id, status, booking_code, position_number, arrival_window_start, arrival_window_end } (nulls for slot).
   - Audit `book_appointment` as today, afterData gains session_id/position_number/booking_code.
4. Dispatcher `app/api/cron/dispatch-reminders/route.ts` + `lib/notifications/sink.ts`: rows carry `kind`; for 'receipt' compose with
   `lib/notifications/receipt.ts` (needs hospital name, line name or department name, starts_at, position, arrival window, code —
   extend the row select); reminders unchanged. `planReminderDispatch` treats a receipt as never stale (it is sent whenever it
   is found; STALE_GRACE applies to reminders only). Tests in tests/notifications/\*.
5. `reschedule-appointment`: session-mode rows — refuse for now with "Move this visit from the clinic day list." UNLESS trivial:
   cancel position (booked_count-1) + allocate in target session in one flow. Do the refusal if the trivial path exceeds ~40 lines;
   report which.
6. ADR 0088 `docs/adr/0088-gate-c-booking-flow.md`: the rulings above, the receipt-through-dispatcher decision, the rate limit,
   the SQL functions, and what Gate C does NOT do (no waitlist, no cancel-session, no push, no PWA offline beyond the shell).

## Phase 2a — web (one agent)

- Directory `app/patient/hospitals`: "Verified" pill on active hospitals; search also matches `hospital_departments.name` and
  `service_lines.name`; "Accepting bookings" vs "No days open" per hospital = EXISTS (published clinic_sessions in 14 days OR active
  bookable availability_blocks overlapping the next 14 days) — one query in lib/patient/hospitals.ts, honest label.
- Wizard `app/patient/book`: rebuilt on `StepWizardShell`. Steps: (1) reason — 13 chips from Appendix A words (title + one-line
  hint), (2) interstitial when reason = new_concern (static, per the copy above; the hospital's emergency_phone), (3) service line —
  the hospital's active lines whose reason_codes include the reason, with mode shown ("Clinic day" / "Appointment time" /
  "Same-day queue"); open_queue lines route to the existing queue page; (4a) slot: clinician (continuity default: the clinician who
  last saw this patient in this department — one query over appointments — offered first with "Seen you before"), day, time
  (0085 parity: times, not day-parts); (4b) session: the line's published sessions in 14 days — date, clinician or "Clinic team",
  "N places left" (ceil(capacity_booked\*overbooking) - booked_count; 0 → "Full", disabled), one tap selects; (5) check; (6)
  confirmation with booking code (big, monospace), position + arrival window for sessions, time for slots. No-silent-wait §2.4:
  when no option falls within line.time_to_care_days, show, in order, other clinicians in the line (slot) / other hospitals' same-
  named line (session or slot) / "Coming to the hospital today" / then the beyond-window options labelled "Beyond this clinic's
  target of N days". Idempotency key: `crypto.randomUUID()` generated when the wizard mounts a NEW submission attempt and reused
  across retries of that attempt; a new key after success or after the user changes the pick. Draft persistence: localStorage
  key per hospital, restored on mount, cleared on success. Server action calls pt-request-appointment with `channel:'web'`.
- Emergency (C9): `EmergencyNotice` rendered from `app/patient/layout.tsx` once (remove per-page copies); sign-in page gets a plain
  text link "Emergency? Go to the nearest emergency unit." with no red.
- PWA: `app/manifest.ts` (Next 16 metadata route: name, short_name, start_url "/patient", display standalone, theme/background
  from tokens, icons from public/ — generate 192/512 PNGs with sharp from an existing brand asset or the favicon), `public/sw.js`
  registered from a tiny client component in app/patient/layout.tsx: precaches "/offline" (a static page) and serves it only when
  navigation fetch fails; passes everything else to the network. No caching of API responses. Reduced, honest.
- Appointments list/detail on web show the booking code and, for sessions, position + window.
- Tokens only, no red, headings 500, `text-heading-*`, Server Components + Server Actions. `npm run typecheck && npm run lint &&
npm run test && npm run build`.

## Phase 2b — mobile (one agent) — mobile/src

- Data layer: `fetchServiceLines(hospitalId)` (PostgREST, RLS-readable) with capacity_mode/reason_codes/time_to_care; `fetchSessions
(serviceLineId)` published, starts_at > now, next 14 days, with placesLeft; `requestAppointment` gains `idempotencyKey` (generated
  once per attempt by the screen; reuse `mob-` id shape or expo-crypto if installed) and the session variant `{ sessionId }`;
  response fields booking_code/position/arrival window; `AppointmentRow` gains bookingCode, positionNumber, arrivalWindowStartIso/
  EndIso, sessionId (select the new columns).
- Home: "Clinics" section under Doctors for session-mode lines at the patient's hospital (name, next clinic day, places left) →
  new screen `(app)/clinic/[id].tsx`: line name + department, its sessions as a list of Tiles (date, clinician or "Clinic team",
  "N places left"/"Full"), reason chips (only the line's reason_codes), note, docked "Book a place". Interstitial (same copy, a
  full-screen static Screen with the Call control and "Continue to book") shown before the session/time step when reason =
  new_concern — on BOTH clinic and doctor pages. Confirmation: booking code (big, mono), position + "Arrive between …" for sessions,
  time for slots; the visit hero/visits rows/detail show the code and position.
- No-silent-wait on the doctor and clinic pages when nothing falls within time_to_care_days (same ordering as web; the walk-in door
  is the third option; beyond-window days labelled).
- Reasons: the 13 Appendix A codes replace APPOINTMENT_REASONS' five (titles/hints as Appendix A words).
- Sign-in: plain text link to the emergency contact (no red). Tokens only; both themes; a11y. `cd mobile && npx tsc --noEmit &&
npx eslint src --max-warnings=0 && npx prettier --check "src/**/*.{ts,tsx}"`; regen typed routes after adding the route.

## Verify (two lenses after 2a/2b)

- Server: allocator via SQL function (SECURITY DEFINER, service_role only), compensating decrement on failed insert, rate limit,
  idempotent read-back on both paths, reason ⊆ line, session future+published+active line, booking_code uniqueness retry, receipt
  row + composer GSM-safe ≤160, reminders unchanged, RLS unchanged, migration additive, tests green.
- Surfaces: one decision per screen; interstitial identical on web and phone (byte-compare the strings); no clinical questions
  anywhere (grep the wizard/screens for symptom words); emergency affordance on every authenticated screen + text link pre-auth;
  red only on emergency; codes monospace; dates in full; both themes; a11y; PWA manifest valid JSON; SW never caches API.
