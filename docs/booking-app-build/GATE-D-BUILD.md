# Gate D build contract — lifecycle, arrival, identity (READ IN FULL)

Repo /Users/airm1/Desktop/medsync, branch feat/booking-app (do not commit). Inputs in order: docs/booking-app-gate-a-proposal.md
(§5.8, §5.9, §6, §10 row D, §4 rows §2.8/§2.9/§3.4/§3.5), docs/booking-app-prd.md (§2.8, §2.9, §3.4, §3.5, §3.6, §4.3),
docs/adr/0087, 0088, AGENTS.md, docs/reception-registration-gate-a-proposal.md, docs/patient-handling-flow-gate-a-proposal.md.
Ground truth: migrations 0058/0059, db/schema/*, supabase/functions/pt-request-appointment (Gate C), lib/reception/queries.ts.

## Rulings assumed (ADR 0089 records them)
- C4: accounts stay; `provisional_patients` is added ALONGSIDE (§5.8) and is reached only by book-on-behalf (this gate) and later
  USSD/proxy. NEVER auto-merged: the only writer of `reconciled_patient_user_id` is `ha-reconcile-identity`; a test greps for that.
- C15: `pending_approval` canonical; `requested` stays in the CHECK and maps to FHIR `pending`.
- `void` joins the appointments status CHECK (FHIR entered-in-error); written only by a superadmin action later — no writer now.
- Un-reconcile is a sensitive action: hospital_admin at the hospital + reason ≥ 20 chars + audit `unreconcile_identity`. The
  four-eyes helper is superadmin-only (`_shared/four-eyes.ts`) and does not fit a hospital action; flagged for Gate H.
- Part 8 #12 (minors): NOT built. `booking_agents` is adults-only: a household member must declare age ≥ 18; a minor is refused with
  "Booking for a child is not available yet." Part 8 #14 (controller/processor): no code.
- Proxy visibility (§2.9): a booking agent sees logistics only (date, place, service, code); confidential service lines are never
  shown to or bookable by an agent; a receipt SMS for a confidential line goes to the member's own phone, never the agent's.
- Deno encryption: port `lib/encryption.ts`'s exact wire format (`iv:tag:ct`, base64, AES-256-GCM, 12-byte IV, 16-byte tag,
  key = MEDSYNC_PHI_KEY base64 32 bytes) to `supabase/functions/_shared/encryption.ts` on Web Crypto, plus `blindIndex(value)` =
  hex HMAC-SHA256 keyed by SHA-256("medsync-blind-index" || key) — the same function in `lib/encryption.ts` for Node. A vitest test
  proves Node-encrypt → Deno-port-decrypt and the reverse (the port must run on Node's global `crypto.subtle`; parameterise the key,
  read `Deno.env`/`process.env` only at the edge). README already tells the owner to set MEDSYNC_PHI_KEY as a Functions secret.

## Phase 1 — server (blocking)
1. Migration `0060_identity_and_lifecycle.sql` (GATED): `provisional_patients` per §5.8 exactly (encrypted name/phone, phone_hmac,
   dob/age CHECK at-least-one, phone_verified_at, reconciliation_state, reconciled_* , created_by_user_id, expires_at, indexes, RLS
   staff-at-hospital SELECT only, `audit_log_changes()` row trigger like patient_intakes, set_updated_at); `appointments`:
   `provisional_patient_id uuid NULL FK`, `patient_user_id DROP NOT NULL`, CHECK exactly-one; `patient_intakes`: the same pair
   (keep `patient_unknown_label`; widen its at-least-one CHECK to include provisional); `appointments_status_check` re-issued with
   `void`; `booking_agents` per §5.9 (agent_user_id, member: EITHER patient_user_id OR provisional_patient_id, relationship text,
   consent_basis text CHECK IN ('agent_declared','member_confirmed'), declared_adult boolean NOT NULL CHECK true, revoked_at; RLS:
   agent SELECT own rows; member SELECT rows about them; `audit_log_changes()`); `sa_audit_log_action_check` re-issued (0058's list +
   reconcile_identity, unreconcile_identity) and target kinds (+ provisional_patient, booking_agent). RLS on `appointments` must
   still let a booking agent read the logistics of bookings they made: add policy `appointments_select_agent` USING
   (created_by_user_id = auth.uid()) — reads only; columns are not restricted (no PHI on appointments beyond reason_note — NOTE
   reason_note is then visible to the agent; acceptable because the agent typed it; document). Dry-run BEGIN/ROLLBACK as Gate B/C.
   Drizzle for all of it; barrel; `npm run typecheck`.
2. `_shared/encryption.ts` + `blindIndex` in both runtimes + tests/encryption/cross-runtime.test.ts.
3. Extract the booking core: `supabase/functions/_shared/book.ts` — `bookAppointment(sb, input)` used by pt-request-appointment
   AND the new `ha-book-on-behalf`; pt-request-appointment's behaviour must not change (its tests/contract stay green). The core
   takes an already-authorised `{ patient: { userId } | { provisionalId }, actor, origin, channel, hospitalId, reason, note,
   idempotencyKey, slot | session }` and does allocation/code/window/receipt/reminders/audit exactly as Gate C does.
4. `ha-book-on-behalf` — auth: reception/clinician/nurse/hospital_admin at the hospital (the `authoriseAtHospital` idiom in
   ha-check-in-patient); input: hospital_id, idempotency_key, channel 'desk', reason, note?, slot|session, and EITHER
   `patient_user_id` (an existing patient) OR `provisional { declared_name, phone_e164 (Uganda E.164 as 0053 checks), date_of_birth?
   | age_years?, phone_verified: false }` → inserts provisional_patients (encrypted, hmac) then books with provisional_patient_id.
   Response = Gate C's + `provisional_patient_id`. Audit `book_on_behalf`. Rate limit: 60/hour per desk user.
5. `ha-reconcile-identity` — input { provisional_patient_id, action: 'confirm' (+ patient_user_id) | 'reject' | 'unreconcile' (+
   reason) }, auth reception/hospital_admin at the hospital (unreconcile: hospital_admin only). confirm: set reconciliation_state,
   reconciled_*; UPDATE the provisional's appointments AND patient_intakes: patient_user_id = chosen, provisional_patient_id stays
   (audit trail) — the exactly-one CHECK must therefore allow BOTH set once reconciled: make the CHECK `patient_user_id IS NOT NULL
   OR provisional_patient_id IS NOT NULL` (at least one), and document that provisional_patient_id is the provenance. Refuse confirm
   when the chosen patient is not a patient_profiles row. reject: state 'rejected', nothing else. unreconcile: reverse confirm
   (patient_user_id back to NULL where the appointment's provisional matches), audit with reason. Audit before/after.
6. Dispatcher + receipt/reminder composers: rows whose appointment has NULL patient_user_id decrypt the phone from
   provisional_patients (Node lib/encryption.ts — the dispatcher is Next); confidential lines: if the appointment was created by a
   booking agent (created_by_user_id ≠ patient) send to the member's phone only (provisional phone or the member profile's phone),
   never the agent's; never name the service line in the SMS when `service_lines.confidential`.
7. `lib/fhir/appointment-r4.ts`: `toFhirAppointment(row)` per §6 exactly (status map incl. derived checked-in via intake existence,
   void, waitlist from a waitlist row — stub the waitlist input as an optional param since waitlist_entries does not exist yet),
   participants (Patient, PractitionerRole, Location), `serviceType` from the line; a versioned `FHIR_PROFILE = "r4"` constant;
   test asserts every CHECK status maps (exhaustive switch) and the derived cases.
8. Sweeper: in cleanup-drafts cron, delete `provisional_patients` unreconciled past expires_at with no live appointment.
9. ADR 0089 + CHANGELOG. Gates: npm run typecheck && npm run lint && npm run test -- --run.

## Phase 2a — web (after Phase 1)
- Reception board (`app/reception`): "Seen" stage from encounters.state='completed'; position column for session rows; 30-second
  polling (client component with a timer + router.refresh, or a Server Action revalidation) — honest "Updated 12s ago";
  provisional bookings flagged "Identity to confirm" with a reconciliation panel: candidate matches via `searchTodaysBoard`'s
  decrypt-to-match loop extended with `phone_hmac` equality first, then name + year of birth; each candidate shows the BASIS as
  words ("same phone", "same name and year of birth"), never a score; actions Confirm / Not this person / Register new (links to
  the existing reception registration flow then back to Confirm). Never auto-select a candidate.
- `/reception/book`: book on behalf — find an existing patient (code, name, or phone via blind index) or "New caller" (declared
  name, phone, DOB or age, adult declaration); then the same service-line → clinic day/time steps the patient wizard uses (reuse
  its components — extract to app/patient/book/_components where needed and import); shows the code big; posts to ha-book-on-behalf.
- Patient web: "I have arrived" on the visit detail for confirmed visits whose day is today (calls ha-mark-arrived; refusal
  sentence shown); household: `/patient/household` (adults only; add member = name, phone, DOB/age, declared adult) creating a
  provisional_patients row via a server action (service client, encrypted) + booking_agents; the wizard gains a first step "Who is
  this visit for?" (Me / a member) when the household is non-empty; confidential lines hidden when booking for a member; member
  bookings listed under the household page with logistics only.
- HA console: T-12h banner on /hospital-admin/scheduling: published sessions starting within 12h with no clinician.
- Gates: npm run typecheck && npm run lint && npm run test -- --run && npm run build.

## Phase 2b — mobile (after Phase 1) — mobile/src
- "I have arrived" on the visit detail (and the home hero action when today) over ha-mark-arrived via callEdge; refusal sentence
  in the caution well.
- Household (adults only): Settings → "People I book for" screen (list, add: name, phone, DOB or age, "This person is an adult"
  switch required; minors refused with the sentence above); the clinic and doctor pages gain a "This visit is for" chip row
  (Me / members) when the household is non-empty; confidential lines hidden for members; the confirmation names the member;
  Visits shows member visits with a "For {name}" eyebrow, logistics only.
- Data layer: fetchHousehold/addHouseholdMember (provisional insert must go through an Edge Function — the phone cannot encrypt:
  add `pt-add-household-member` to Phase 1's list, auth = the patient, creates provisional_patients + booking_agents, audit
  `book_on_behalf`? no — new verb `add_booking_agent` in the migration). requestAppointment gains `forProvisionalId?` — the server
  core books with provisional_patient_id and created_by_user_id = caller.
- Gates: tsc, eslint, prettier, expo export; regen typed routes.

## Verify (two lenses)
- Server: grep proves `reconciled_patient_user_id`/`patient_user_id` on provisional rows are set only by ha-reconcile-identity;
  RLS: a patient cannot read provisional_patients; an agent reads only bookings they created; exactly/at-least-one CHECKs; the
  encryption round-trip test both directions; FHIR exhaustiveness; dispatcher never sends a confidential line's SMS to an agent;
  the booking core is used by both writers (no duplicated allocator/code/receipt logic — grep).
- Surfaces: no auto-merge affordance (no default-selected candidate, no one-click "merge all"); basis words not scores; no
  clinical questions; red only on emergency; minors refused with the sentence; proxy sees logistics only; a11y; both themes.
