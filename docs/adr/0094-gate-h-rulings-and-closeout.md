# ADR 0094 — Gate H: the telemetry, the tests that hold the line, the six parked rulings, and the closeout

**Status:** Accepted — product-owner decisions (2026-09-19)

**Builds on** [ADR 0084](0084-book-or-queue-two-doors-relabelled.md) through [ADR 0093](0093-fhir-appointment-mapping.md).
Inputs: `docs/booking-app-prd.md` §3.3.4, §3.4, §3.5, §3.6, §4.5, §5.4; `docs/booking-app-gate-a-proposal.md`
§10 row H; `docs/booking-app-handoff.md` §4; `docs/booking-app-build/GATE-H-BUILD.md`.

## Context

Gate H is the closeout of the MedSync Book build (A′–H): measure what was built, prove the clinical boundary
by test, settle the rulings earlier gates deliberately parked, and write down what the next team must know.
The owner ruled on four questions today; two more were routine enough to decide in the build and are recorded
here so they are not re-litigated. Billing remains paused (owner, 2026-09-18) — nothing in this gate costs
money, and the things that do are listed at the end as deferred, not forgotten.

## Decision

### Rulings on the telemetry (PRD §3.3.4, §3.4, §3.6)

- **A metric is operational, never a patient score.** No surface ranks, flags or colours a patient by
  attendance; no metric feeds any booking decision; the reports page says so in words beside the no-show
  figure. A test (`tests/hospital-admin/reports-invariants.test.ts`) asserts that nothing under the patient,
  reception, scheduling or booking-core trees sorts or filters by a no-show figure, and that the booking core
  never imports the reports module.
- **Every number states its basis.** Each metric carries its numerator, denominator and window; a rate whose
  denominator is under **20** (`MIN_RATE_SAMPLE`) reports "too few to report", never a percentage. Windows
  are 7, 28 or 90 days (default 28) in the hospital's zone.
- **The denominators, decided:**
  - _Fill rate_ = Σ `booked_count` ÷ Σ `ceil(capacity_booked × overbooking_factor)` over clinic days that
    were offered (`published` or `closed`) and have ended. Draft and cancelled days publish no capacity.
  - _No-show rate_ = `no_show` ÷ held past bookings — `HELD_PAST_STATUSES`: confirmed, arrived,
    in_progress, completed, no_show, on a clinic day that has **ended** (`ends_at`, the cut the fill rate
    uses; a session booking's start is the day's start, and a day in progress is full of positions not yet
    called). Requested, pending, cancelled,
    rescheduled, declined and void rows released their place before the day and are excluded. A past booking
    still `confirmed` — the desk never marked it — stays in the denominator and is reported separately as
    "unmarked", so the blind spot is visible rather than flattering.
  - _Wait accuracy_ (the §3.6 measure) = queue entries whose `called_at` fell inside
    `[arrival_window_start, arrival_window_end]` ÷ called entries with a window. The join is
    `queue_entries.appointment_id`; `called_at` has one writer (`ha-start-encounter`); the window exists only
    for session-mode bookings, so slot bookings are outside this metric by construction. A patient who arrived
    after their window closed is excluded from the denominator — the facility never had the chance.
  - _Demand vs capacity_ = session-mode bookings **for** the clinic days that started in the window (any
    channel, any outcome but void; the old row of a move is not a second request), against the places those
    same days published — numerator and denominator on the same days. Waitlist joins stand beside it as
    their own number; where no day was published the card prints "—" rather than "n / 0". A waitlist that
    never drains is the signal.
  - _Refill load_: `appointments.reason = 'refill'` and `prescriptions` written in the window are shown **side
    by side and not joined** — prescriptions reach appointments only through two nullable set-null FKs
    (`prescriptions.encounter_id → encounters.appointment_id`), and a join that quietly drops rows is a lie.
    A missing `prescriptions` relation (the migration is GATED) reports null, not zero.
  - _SMS spend_: `notification_dispatches` in `sent | delivered`, messages counted and `cost_amount` summed
    with nulls as zero — the provider does not price every message, so the basis reads "N SMS sent", not
    "priced".
- **The §3.6 detector judges the facility.** Per line and per clinic day, the share of patients called inside
  the window they were promised; a line under **50%** (`POSITIONS_HONOURED_THRESHOLD`) over at least the
  minimum sample is flagged "positions not honoured" — amber, with words, never red. It exists so that a
  patient's arrival window means something. It is the one metric that judges, and it judges the clinic.
- **Superadmin aggregates stay PHI-free (§3.5).** `/admin/scheduling-rollup` carries the same figures per
  hospital: counts and rates, never a name, code or phone. A live-DB test seeds two hospitals and asserts each
  report sees only its own rows (`tests/hospital-admin/reports-tenant-isolation.test.ts`, opt-in like the RLS
  suites).

### Rulings on the boundary tests (PRD §5.4, DESIGN anti-patterns)

- **The not-a-medical-device boundary is a test, not a policy.** `tests/booking/clinical-firewall.test.ts`
  (shipped with Gate G) asserts no booking-flow field reaches `lib/triage`, `lib/clerkship` or
  `lib/encounter`'s scoring, no booking path imports the engines, Appendix A is pinned to its thirteen codes,
  and the reason labels on both platforms carry no clinical vocabulary.
- **Red is reserved, and colour is never alone.** `tests/design/red-reserved.test.ts`: under the patient and
  reception trees and `mobile/src`, no red fill, ring, chip or tone outside an explicit allowlist — on the
  web the allowlist is **empty** (the emergency notice is amber by ADR 0084 §3; resus lives outside these
  trees); on the phone it is the five files ADR 0085 §5 names. Red text is permitted only as an announced
  failure (`role="alert"` with words). Every `Pill`/`Badge` carries words. Proven to bite with probe files.
- **Budgets have somewhere to run.** `.github/workflows/ci.yml` runs typecheck, lint, format, build, test and
  `npm run budget` on every push, and the phone's tsc/eslint/prettier beside it. No secrets: the live-DB
  suites skip (the helper now gates on the flag **and** the env, instead of throwing at import), and the
  header names the secrets that would enable them against a dedicated test project. The budget:
  **370 kB gzip first-load JS per `/patient` route** (`scripts/check-budget.mjs`, over Next 16's
  `route-bundle-stats.json`; baseline 318 kB, of which 140 kB is one shared chunk carrying Sentry). Lower the
  ceiling in the same commit that makes Sentry lazy.
- **Accessibility is proven, not asserted.** `eslint-plugin-jsx-a11y` strict on `app/patient` and
  `app/reception`; axe-core in jsdom over the eight pre-rendered public pages
  (`tests/a11y/static-pages.test.ts`, runs after the build in CI). Six real defects on the landing page and
  the styleguide were fixed at source; no rule was disabled.

### The six parked rulings (handoff §4)

1. **Four-eyes on un-reconcile — today's bar stands** (owner). `hospital_admin` (or superadmin), a reason of at
   least 20 characters, a fail-closed audit row. A second approver at a one-admin hospital would leave a wrong
   identity link standing, and a wrong link is itself a safety problem. Four-eyes remains a superadmin tool.
2. **Cross-tenant un-reconcile — refuse; superadmin may force** (owner). If appointments or intakes at other
   hospitals name the reconciled patient under the same provisional, a hospital_admin's request is a **409**
   naming the count; a superadmin — already cross-tenant by role — reverses at every hospital, and the audit
   after-data records `scope: all_hospitals | this_hospital` and the count. No hospital ever edits another's
   rows.
3. **Desk booking a stated minor — the server refuses too** (owner). `ha-book-on-behalf` returns 4xx with the
   desk form's own sentence ("Booking for a child is not available yet.") when **either** number given — the
   typed age, or the date of birth against today in the hospital's zone — is under 18: "age 18" beside a 2015
   birthday is a child with a typo. Before the audit row, before any write. The desk form computes whole
   calendar years the same way, so the two agree on an 18th birthday. This matches ADR 0089 (adults only until
   the CSO/legal guardian model exists); child-health lines wait for that model. No shared helper was
   extracted: `pt-add-household-member` (which now also checks both numbers) computes "today" in UTC and the
   ruling asks for the hospital's zone, so sharing would have changed one of them.
4. **Template edits — empty future days follow the new rule; booked days keep their promise** (build
   decision). `ha-upsert-session-template` re-stamps published future instances with `booked_count = 0` **in
   place** (clinician, venue, capacities, interleave, overbooking, end) — the partial UNIQUE on
   `(template_id, starts_at)` holds cancelled rows' instants, so cancel-and-reinsert would collide —
   cancels the empties the new rule no longer names through the deactivation path, and leaves any instance
   with a booking exactly as it was. The nightly cron's assumptions are intact.
5. **Staff cancel reasons are staff only** (owner). The decisive fact: a patient reads `appointments` rows
   straight through RLS (the phone uses supabase-js), and a booking agent reads the rows they created — so
   hiding text in a UI hides nothing. `appointments.cancelled_reason` now carries a **closed code**
   (`session_cancelled | patient_cancelled | staff_cancelled | unconfirmed_release | rescheduled`, one
   zero-import module `_shared/cancel-reasons.ts` for Deno, Next and Expo); the words go to the
   `sa_audit_log` row every cancel writer already records first. Every patient and agent surface maps the code
   through `cancellationSentence()` and never prints the column (tested). `declined_reason` is no longer
   written — the status is the code. GATED migration **0064** rewrites legacy words to codes and closes the
   column with a CHECK; the Drizzle schema mirrors it.
6. **Consent re-acceptance on next sign-in** (owner, decided at Gate E; built here). A patient whose
   `data_processing` record does not match the **active** `consent_versions` row by version **and** hash is
   shown the text and asked to accept before the patient area opens: on the web the gate is in
   `requirePatientScope` (the layout and the consent page use the ungated `resolvePatientScope`), redirecting
   to `/patient/consent`, whose action validates version and hash and inserts the row the way the fixed signup
   actions do; on the phone the session provider runs the same check per signed-in user and
   `(app)/_layout.tsx` closes the navigator on a `Stack.Protected` pair until `consent.tsx` inserts the row
   (RLS 0002 grants a patient INSERT on their own record). The five patients with no record are asked; nobody
   is backfilled, because nobody knows which text they saw. **The phone's gate never fails open**: the check
   has four states — checking, clear, due, unknown — and only `clear` mounts the workspace; a failed read is
   `unknown` and the consent screen offers Retry; the record is looked up for this user by `user_id` (the
   RLS policy also admits a superadmin to every row); a lost reply's unique-violation is an acceptance; and
   the consent screen carries the emergency block itself, because the Emergency tab is behind the gate and
   a patient mid-stroke who has not agreed to a notice is still a patient (ADR 0085 §5). On the web the
   shell drops its rail and tab bar while gated — every item led straight back — and the one patient action
   that had not called `requirePatientScope` now does; the test requires it of every page and action.

### Also settled

- **The review's price list.** An adversarial review of the Gate H diff (six lenses, two skeptics per
  finding) confirmed 23 defects; all are fixed in `80a5868`. Beyond the corrections folded in above: CI's
  secrets are scoped to the one step that reads them and the workflow token is read-only; the red-reserved
  test recognises the Button's actual red variants (`emergency`, `alert` — pinned to `button.tsx`), ternary
  variants, directional borders and the full red/rose hex ramps; the §3.6 flag is never hidden on a narrow
  screen; a doctor's decline form no longer tells them the patient will read their words; `DataTable` rows
  are tab stops only when selecting them does something.

- **Cancel codes everywhere.** `system-ussd-act` and `reschedule-appointment` — the two writers outside the
  rulings lane — moved to codes in the same commit, which is what let 0064 carry the CHECK.
- **`format:check` in CI meant formatting fifteen committed files** that predated the check (whitespace and
  wraps only), and ignoring `.agents/` — the vendored `emilkowalski/skills` are not ours to reflow.
- **Two live-DB suites had no skip at all** (`tests/auth/auth-flow`, `tests/audit/audit`) and wrote to
  whatever `.env.local` pointed at on every run. Both are gated now.

## Closeout — what shipped across A′–H

| Gate | Record           | What it holds                                                                                                              |
| ---- | ---------------- | -------------------------------------------------------------------------------------------------------------------------- |
| —    | 0084, 0085, 0086 | The two doors and their copy; the marketplace presentation on the phone; booking at any active hospital                    |
| A′   | (hygiene)        | The Gate A proposal's schema and seam survey, and the repo hygiene it asked for                                            |
| B    | 0087             | Capacity modes: `service_lines`, `session_templates`, `clinic_sessions`; positions and arrival windows; 13 reasons         |
| C    | 0088             | The web wizard over three modes, the receipt, the PWA shell; no holds; 5/h rate limit; the interstitial                    |
| D    | 0089, 0093       | Provisional patients, book on behalf, reconciliation (single writer), "I have arrived", household; FHIR R4 at the boundary |
| E    | 0090             | Notifications through one dispatcher, the waitlist, cancelling a clinic day, push tokens, SMS consent                      |
| F    | 0091             | USSD and SMS keywords over Africa's Talking (sandbox), the six-level budget                                                |
| G    | 0092             | The reference design on both platforms; fees by cadre as a sparse override, quoted once                                    |
| H    | 0094             | Reports and the §3.6 detector; the firewall and red-reserved tests; CI and budgets; the six rulings                        |

GATED migrations owed to the owner at closeout: **0063** (cadre fees — before the redeployed booking core) and
**0064** (cancel-reason codes — dry-run clean; the CHECK is its last statement).

### Deferred, deliberately

- **Payments** — MedSync charges nothing (PRD §0 C2, ADR 0092); Part 8 #8/#14 legal, and the billing pause.
- **Live SMS channels** — Africa's Talking live credentials, a sender ID or shortcode, and the wallet; the
  sandbox is wired end to end and the `*/15` dispatcher cadence needs Vercel Pro (daily on Hobby meanwhile).
- **Android push** — the repo is prepared (`com.medsync.app`, `eas.json`, the notification icon); the Firebase
  project, `google-services.json` and one dev build are the owner's, and free. **iOS push** — the Apple
  Developer account.
- **The minor/guardian model** — CSO + legal (PRD Part 8 #12); child-health lines book only in person until
  then.
- **The service-class fee axis** (Basic/VIP/VVIP/Executive Suite) MoH actually mandates — one additive
  override dimension when the beachhead asks (ADR 0092).
- **FHIR beyond `Appointment`**, a route to serve it, and the DHIS2 aggregate seam — when a consumer names
  itself (ADR 0093). The reports module is where those aggregates now live.
- **Luganda and the other translations**, the CSO's symptom list, emergency numbers and time-to-care values —
  provisional wherever they appear.
- **A staging Supabase project** for the live-DB suites in CI; the header of `ci.yml` names the secrets.

### What the next team must know

- `docs/booking-app-handoff.md` is the operational truth per gate; the ADRs are the decisions; the contracts in
  `docs/booking-app-build/` are what was asked for and, in "Surveyed against the code", what was found.
- The invariants are tests, and they are cheap greps: `tests/booking/clinical-firewall.test.ts`,
  `tests/design/red-reserved.test.ts`, `tests/booking/fees.test.ts`, `tests/booking/gate-h-rulings.test.ts`,
  `tests/hospital-admin/reports-invariants.test.ts`, and the gate suites under `tests/identity`,
  `tests/notifications`, `tests/channels`. When one fails, the design has changed — read the test's header
  before editing the assertion.
- Three zero-import modules are shared by Deno, Next and Expo by three import spellings: `_shared/slots.ts`,
  `_shared/fees.ts`, `_shared/cancel-reasons.ts` (and `lib/fhir/appointment-r4.ts`). Keep them import-free.
- One writer per fact: the booking core writes bookings and quotes; `ha-reconcile-identity` writes the identity
  link; `ha-start-encounter` writes `called_at`; the dispatcher writes dispatches. Tests grep for these.
- Stage by filename. Never `git add -A` with a pathspec; never stage `.env.example`.

## Consequences

- A facility can now see whether its clinic days fill, whether its positions mean anything, and what its
  messages cost — and cannot see a list of unreliable patients, because none exists.
- The regulatory posture (PRD §5.4) is a failing test away from anyone who breaks it.
- A stray `npx vitest run` no longer writes to a production project by accident, and a fresh clone's tests are
  green.
- A price paid for ruling 5: a staff member reading the console sees the code, not their colleague's words,
  unless the surface reads the audit row. No staff surface did read the free text before this gate either.
- A price paid for ruling 4: an admin who widens a template's capacity does not widen a day that already
  holds one booking. That is the promise the patient was given; the admin adds a second day.

## Alternatives considered

- **Patient-level attendance in the reports** ("frequent no-shows"). Rejected on PRD §3.3.4 and Gate E's
  reasoning: it measures poverty and distance, and it would feed the punitive automation the PRD forbids.
- **A local `npm run budget` gate instead of CI.** Rejected: a budget nobody runs is not a budget, and the
  public repo's Actions minutes are free.
- **Hiding the cancel free text in the UI only.** Rejected on the RLS fact above.
- **Cancel-and-reinsert on template edit.** Rejected: the partial UNIQUE holds cancelled instants; in-place
  re-stamp of empty days is the same outcome without the collision.
- **Backfilling the five missing consent records.** Rejected: nobody knows which text they saw.
