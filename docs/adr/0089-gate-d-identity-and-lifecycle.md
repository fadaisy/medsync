# ADR 0089 — Gate D: lifecycle, arrival, and the identity that is not the chart

**Status:** Accepted — product-owner decision (2026-09-13)

**Builds on** [ADR 0087](0087-capacity-modes.md), [ADR 0088](0088-gate-c-booking-flow.md),
[ADR 0086](0086-book-at-any-hospital.md). Inputs: `docs/booking-app-prd.md` §2.8, §2.9, §3.4, §3.5,
§3.6, §4.3; `docs/booking-app-gate-a-proposal.md` §5.8, §5.9, §6, §10 row D.

## Context

Gate C books a visit for a patient who holds an account. Most Ugandan patients will be booked by
someone else — a caller at the desk, a son with the only smartphone (PRD §2.9) — and a booking must
never write into the clinical Master Patient Index (PRD §2.8): a wrong merge is a wrong chart. This ADR
records the rulings the server was built to.

## Decision

### Rulings

- **C4 — accounts stay; `provisional_patients` is added ALONGSIDE** (§5.8), reached only by book-on-behalf
  and household booking (and later USSD). **Never auto-merged.** The only writer of
  `reconciled_patient_user_id`, and of `patient_user_id` on a provisional's appointments and intakes, is
  `ha-reconcile-identity`. `tests/identity/gate-d-invariants.test.ts` greps the functions tree for it.
- **A provisional booking never inherits a prior reconciliation.** Even when the row was confirmed at an
  earlier visit, the next booking is inserted with `patient_user_id` NULL and the desk confirms again —
  one writer, one rule, and the desk's panel may show the earlier confirmation as a candidate with its
  basis in words.
- **`hospital_id` on `provisional_patients` is NULLABLE** (deviation from §5.8, which was written before
  household rows existed). A desk-created row is tenant-scoped (created here, readable here). A household
  member added from the patient app has no facility until booked (ADR 0086 lets them book anywhere) and is
  readable by the staff of every hospital it holds a booking at, and by nobody else. A row with no
  hospital must name its creator (CHECK).
- **Reconciliation is global to the row, applied per hospital.** `confirm` sets the row's state and links
  the CALLER's hospital's appointments and intakes; a second hospital holding a booking for the same row
  confirms again (idempotent for the same patient; refused for a different one until un-reconciled).
- **C15** — `pending_approval` canonical; `requested` stays in the CHECK and maps to FHIR `pending`.
- **`void`** joins the status CHECK (FHIR `entered-in-error`). **No writer** at this gate; absent from
  `LIVE_APPOINTMENT_STATUSES` and from the double-booking predicate by construction.
- **Un-reconcile is a sensitive action:** hospital_admin at the hospital (or superadmin) + a reason of at
  least 20 characters + audit `unreconcile_identity`. It reverses the links on appointments and intakes;
  encounters and queue rows already written against the patient are NOT touched — that is a
  clinical-record correction, flagged for Gate H with the four-eyes helper (superadmin-only today).
- **Part 8 #12 (minors): NOT built.** `booking_agents` is adults-only: `declared_adult` must be true
  (CHECK) and the stated age or date of birth must agree; a minor is refused with
  "Booking for a child is not available yet." Part 8 #14 (controller/processor): no code.
- **Proxy visibility (§2.9):** a booking agent reads only the bookings they created
  (`appointments_select_agent`, `USING (created_by_user_id = auth.uid())`, SELECT only, no column
  restriction — `reason_note` is the only free text and the agent typed it). A confidential line is never
  bookable by a patient for someone else (the core refuses, 403). The receipt and reminder SMS go to the
  MEMBER's phone (the profile's, or the provisional's), never the agent's, and never name a confidential
  line ("Appointment" stands in).
- **A provisional booking cannot be checked in or marked arrived** until the desk has confirmed who it is
  for (409 "Confirm who this booking is for before checking in.") — `queue_entries` needs a patient and
  the intake row would name nobody.

### The schema (migration 0060, GATED)

`provisional_patients` (encrypted name/phone, `phone_hmac` blind index, dob/age at-least-one,
`reconciliation_state` unreconciled|confirmed|created|rejected, `reconciled_*`, `created_by_user_id`,
`expires_at` 30 days; RLS staff-at-hospital-or-booked-here SELECT only, **no patient policy**;
`audit_log_changes()`); `booking_agents` (agent, member = exactly one of patient|provisional,
`member_label` plaintext in the agent's own words, relationship, `consent_basis`, `declared_adult` CHECK
true, `revoked_at`; agent reads own live rows, member reads rows about them); `appointments` +
`provisional_patient_id`, `patient_user_id` DROP NOT NULL, CHECK at-least-one (the provisional id is the
PROVENANCE and stays after reconciliation), `void`, `appointments_creator_idempotency_unique`;
`patient_intakes` the same pair; `sa_audit_log` CHECKs re-issued (+ `reconcile_identity`,
`unreconcile_identity`, `add_booking_agent`; + `provisional_patient`, `booking_agent`). Dry-run
BEGIN/ROLLBACK against the dev DB: every CHECK enforced, rolled back cleanly.

**Sequencing:** 0060 must be applied BEFORE the Gate D functions — including the re-deployed
`pt-request-appointment`, which now selects and inserts `provisional_patient_id` — are deployed, and
`MEDSYNC_PHI_KEY` must be set as a Supabase Functions secret (the same value as Vercel's).

### The server

- **`_shared/encryption.ts`** — `lib/encryption.ts`'s exact wire format (`iv:tag:ct`, AES-256-GCM, 12-byte
  IV, 16-byte tag) on Web Crypto, key as a parameter; `blindIndex(value, key)` = hex HMAC-SHA256 keyed by
  SHA-256("medsync-blind-index" ‖ key), the same function added to `lib/encryption.ts`.
  `tests/encryption/cross-runtime.test.ts` proves Node-encrypt → port-decrypt and the reverse.
- **`_shared/book.ts`** — the booking core, extracted verbatim from Gate C's `pt-request-appointment`:
  replay → exists → rate limit → the mode → INSERT + code → receipt + reminders → audit. Both writers use
  it; the allocator, the code, the window, the receipt and the reminders exist nowhere else (a test greps).
  Replay and the rate limit key on `created_by_user_id` — "the submissions this actor made".
- **`pt-request-appointment`** — contract unchanged, plus optional `for_provisional_id` (a household member
  the caller holds a live `booking_agents` link to → `patient_user_id` NULL, `created_by` = caller) and
  `provisional_patient_id` (null for an account) in the body.
- **`ha-book-on-behalf`** — desk auth (`authoriseAtHospital`, lifted to `_shared/hospital-admin-scope.ts`);
  `patient_user_id` OR `provisional { declared_name, phone_e164, date_of_birth? | age_years?,
phone_verified: false }`; 60 per desk user per hour; audit `book_on_behalf`; a provisional minted for a
  booking that failed is deleted again.
- **`ha-reconcile-identity`** — `confirm` (+ `patient_user_id`, must be a `patient_profiles` row) |
  `reject` | `unreconcile` (+ reason). Audit before the mutation, fail closed.
- **`pt-add-household-member`** — auth = the patient; one provisional row (hospital NULL) + one
  `booking_agents` row; minors refused; audit `add_booking_agent`.
- **Dispatcher** — phone = `coalesce(patient_profiles.phone_encrypted, provisional_patients.phone_encrypted)`;
  confidential lines are never named. **Sweeper** — the nightly cron deletes unreconciled rows past
  `expires_at` with no appointment and no live agent link.
- **`lib/fhir/appointment-r4.ts`** — zero imports; `FHIR_PROFILE = "r4"`; `toFhirAppointmentStatus` is an
  exhaustive switch over the CHECK (checked-in DERIVED from an intake row + reconciliation; waitlist from a
  stubbed waitlist input until Gate E); `toFhirAppointment` with Patient / PractitionerRole / Location
  participants, `serviceType` from the line, `replaces` for a reschedule chain.

## What Gate D's server does NOT do

- No writer for `void` or for `reconciliation_state = 'created'`; no `consent_basis` flip to
  `member_confirmed` (the member's first own sign-in is a later gate).
- No proxy cancel/reschedule: a booking agent reads logistics only.
- `reschedule-appointment` still mints its own code and receipt for the new row of a slot reschedule
  (a different input: release + book); folding it into the core is future work.
- No minors, no USSD, no waitlist.

## Alternatives considered

- **`hospital_id NOT NULL` with a per-facility copy of the household row at booking** — the phone cannot
  map a copy back to the household entry (no agent policy on `provisional_patients`), and a second
  facility's copy re-encrypts nothing new. Rejected for one row, readable where booked.
- **Inheriting a prior reconciliation at INSERT** — saves the desk a confirmation per visit; rejected
  because it makes a second writer of `patient_user_id` on provisional rows and blurs the single-writer
  test. Revisit with the desk's measured re-confirmation cost.
- **Refusing un-reconcile once an encounter exists** — would leave a wrong link standing; the reversal is
  audited and the clinical correction is Gate H's.
