# MedSync Book — handoff (2026-09-22, after ADR 0098)

**Read this first in the next session.** It says where the build stands, what is not applied yet, what was interrupted,
and how to resume. **§0 is the newest state; §1–§5 are the gate-by-gate record.** The rules that govern everything are unchanged: `AGENTS.md`, the PRD at `docs/booking-app-prd.md`, the
Gate A proposal at `docs/booking-app-gate-a-proposal.md`, and ADRs 0084–0089.

## 0. Where things stand now (2026-09-22)

All gates A′–H are built (H closed at `28b6edb`, ADR 0094). Everything since is a **UI pass** on `feat/booking-app`
(head `64f7d8b` at the time of writing, all pushed; web is live at `medsync-six.vercel.app`) and, after it, the
**2026-09-21 feature round** below. The owner drives the UI by screenshot: "does this UI make you happy?" → rework.
0063, 0064 and **0065** are applied (§2); the round is deployed — functions and web (`a6a92e3`, 2026-09-21).

### 2026-09-22 — the symptom catalog and the Emergency Pathway (ADR 0098, PRD MS-PRD-SYM-001)

Read [ADR 0098](adr/0098-symptom-catalog-and-emergency-pathway.md) end to end (rulings, Gate A table, build record,
flags matrix, gate handover) and PRD §15 before touching any of it. The short version:

- **Production is unchanged until the owner acts.** Every flag defaults off; `catalogRenderMode` returns `off` with
  no `signed` version, so `/patient` keeps the ADR 0095/0096 picker; the Emergency sheet is live at `/emergency`
  (public prefix) but shows `verified` contacts only — none are — so it falls back to the hospital's registered
  `emergency_phone`. The red pill is on every route (`app/layout.tsx`); the amber block left `app/patient/layout.tsx`.
- **Owner actions, in order:** `npm run db:migrate` (0066, GATED) → `npm run db:seed-symptom-catalog` (add
  `-- --dev-mulago` on dev to switch Mulago on for pre-alerts) → `npx supabase functions deploy --use-api` →
  `npx vercel deploy --prod --yes` → `cd mobile && npx expo start --lan -c`. Then the gates: dial and verify the
  numbers (`docs/runbooks/emergency-contacts-verification.md`), sign the catalog (Gate CS, `/admin/emergency`), flip
  `FEATURE_*` (Gate CG). Facilities: `docs/runbooks/pre-alert-facility-onboarding.md`.
- **Where things live.** Content package `supabase/functions/_shared/symptom-catalog/` (edit the JSON, run
  `node scripts/gen-symptom-catalog.mjs`, the checksum changes → a new version, never a silent edit of a signed one).
  Engines: `_shared/{intake,urgent-slot,pre-arrival,submission-symptoms}.ts`; eleven new functions (ADR build
  record). Web read models `lib/emergency/`; flags `lib/emergency/feature.ts`. Patient UI `app/patient/symptoms/`,
  `app/emergency/`, `components/emergency/`; phone `mobile/src/{components,lib}/{symptoms,emergency}*`, root
  `app/emergency.tsx` (pre-auth E1), `(tabs)/emergency.tsx`. Hospital side `app/reception/incoming/`,
  `app/nurse/incoming/`, `app/hospital-admin/profile/` (Emergency panel), `app/admin/emergency/`,
  `components/intake/desk-catalog.tsx`. Sweeper `app/api/cron/sweep-pre-arrivals` (daily 04:00 UTC, `vercel.json`).
- **The tests that hold the line now:** `tests/booking/clinical-firewall.test.ts` (third posture — read its header),
  `tests/design/red-reserved.test.ts` (allowlist = the PRD's list, calm routes red-free), `tests/symptom-catalog/*`,
  `tests/emergency/*`. No Playwright/Lighthouse/fast-check (ruling 11).
- **Known gap:** four-eyes has no second-approval executor anywhere; contact verification self-executes only with
  one real superadmin.
- **A second session is working in this tree** on ADR 0097 (plum accent): `DESIGN-medsync.md`, `app/styleguide/**`,
  `components/landing/**`, `mobile/src/theme/tokens.ts`, the plum token lines in `app/globals.css`, and one plum line
  in each shell/sidebar-item. Those hunks are theirs — never stage them from here. The 0098 commits staged only their
  own hunks of the shared files (`app/globals.css` forced-light utility; the admin shell/sidebar Emergency entry;
  reception/nurse sidebar `incoming` icon; `CHANGELOG.md` entry).

### 2026-09-21, later — symptoms before booking (ADR 0096) and the Front door station

- **The shortlist** under "How are you feeling today?" on both homes (`app/patient/_components/symptom-quick-pick.tsx`,
  `mobile/src/components/patient/symptom-quick-pick.tsx`): `QUICK_PICK_CODES` in `_shared/symptoms.ts` is the eight
  shown — the catalogue's first eight in its own order; change the list, not the catalogue. Picks travel via
  `lib/patient/pending-symptoms.ts` (sessionStorage, consumed once by the wizard) and
  `mobile/src/lib/pending-symptoms.ts` (in-memory store, written back by both booking screens, cleared on success).
- **Front door** rebuilt as `components/intake/front-door-form.tsx` (shared by reception and hospital-admin): code
  search (code-only hits, ADR 0032), a booked-arrival pick list from today's **confirmed** bookings that goes through
  `ha-check-in-patient` (never a second intake), the symptom picker for the presenting complaint (duration holds
  Register, ADR 0095), a docked action row. The old `app/hospital-admin/intake/_components/intake-form.tsx` is gone.
- No migration; web deploy + `expo start -c`.

### 2026-09-21 feature round — what shipped, and the owner actions

[ADR 0095](adr/0095-symptoms-at-booking-staff-card-custom-blocks.md); CHANGELOG has the full list. Three owner
rulings, built as lanes over disjoint files (no commits by the lanes):

- **Symptoms at booking, words only** (PRD §5.4 / §7.2 rule 1 amended in part; **provisional** until the CSO
  re-reads §5.4). `appointments.symptoms jsonb` — ≤ 8 of `{code, label, duration}` from the 89 shared catalogue rows
  or typed in; one contract `supabase/functions/_shared/symptoms.ts` (zero-import; Next
  `@/supabase/functions/_shared/symptoms`, Deno `../_shared/symptoms.ts`, phone `@shared/symptoms`); written by
  the core `_shared/book.ts`, copied unchanged on reschedule/rebooking. The selector ("What is bothering you?") on the web wizard, the reception desk and the phone.
  `tests/booking/clinical-firewall.test.ts` is rewritten for the amended rule — read its header before touching it.
- **The clinic's patient card** — name, photo, age, sex, complaint on the doctor's schedule, the clinician list and
  reception's expected board; audited per patient per fetch (`lib/scheduling/patient-identity.ts`), fail-closed to
  the code. Hospital admin stays code-only; `lib/hospital-admin` must never import the reveal.
- **Coloured and custom availability blocks** — one map in `components/scheduling/calendar/helpers.ts`, two new
  `Pill` tones (`info`, `notice`), a `custom` kind with a ≤ 40 label that is inert to the slot engine, a legend under
  the doctor's calendar.

Deployed 2026-09-21 with the owner's named authorisation, in this order: `npm run db:migrate` (0065),
`npx supabase functions deploy --use-api` (all 63), `npx vercel deploy --prod --yes` (● Ready). Left for the owner:
`cd mobile && npx expo start --lan -c` to see the phone side.

### What the pass shipped, in order

| Commit               | What                                                                                                                                                                |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `e1aee1c`…`1b303bd`  | Hospital-admin scheduling as a one-viewport dashboard: `Panel`/`CountDisc`/`SectionRule`, `EditorDialog` (landscape), `StatCard`/`StatButton`.                      |
| `a4d7f19`, `f887075` | New patient lands on the hospital directory (web + phone); every active hospital is choosable (Lilac was `provisioning` → owner activated it).                      |
| `ecb1bd6`, `f0e1730` | Doctor schedule as the same dashboard; calendar per the Schedify reference with the admin's weekly rules on it; hospital-zone rendering (`localWeekdayAndMinutes`). |
| `990b20f`            | `/reception` 500 — raw `sql` can't take a `Date`; `ts()` helper in `lib/intake/queries.ts` + source test.                                                           |
| `ac245cb`, `ad44ba8` | Admin Pending stat opens its list (`lib/hospital-admin/pending.ts`); reception Expected as a week strip with a per-day queue.                                       |
| `100955f`, `a4d3871` | Patient side on one screen each: compact doors, hospital chips + clinic tile grid, doctor tiles, provider page two-column, phone parity.                            |
| `7853f3d`…`12200c1`  | The booking page's day/time picker, iterated to the owner's taste — see "Design decisions" for where it landed.                                                     |
| `f017339`            | The phone's patient side reworked end to end (scrolling titles, one doctor tile, honest hero facts, lighter chips, fee in the body face).                           |

### Design decisions that now stand (do not re-litigate; the owner chose them by screenshot)

- **Booking page "When" block** (web `app/patient/clinician/[clinicianId]/_components/date-time-fields.tsx`, phone
  `mobile/src/components/patient/day-strip.tsx` + `date-time-fields.tsx`): a **week of day pills** from today (pill =
  soft grey track with a white disc; chosen = lifted white track, brand disc, ▼ over it; closed day dimmed), **paging
  sideways a week at a time** (snap on web with ‹ › arrows; `pagingEnabled` ScrollView on the phone), a **month select**
  above (native `<select>` on web, quiet text tabs on the phone), and the day's **open times as an even 4-across grid
  of soft badges**, chosen one in ink. Rejected on the way: the CliniQ ruler, the one-hour ruler, the watch-style
  slider, the "Schedule send" two fields + calendar popover, and the native iOS/Android pickers (installed then
  removed — `@react-native-community/datetimepicker` is **not** a dependency).
- **Selection language:** chosen = ink (`foreground` fill, `background` text) for chips, time badges, month tabs;
  teal is for the primary action, links and facts; red only the emergency affordance. Never colour alone.
- **Mono** (`font.mono`) is for the booking code and position number only (PRD §6.3). Money is the body face with
  `fontVariant: ["tabular-nums"]`.
- **One doctor tile** on the phone (`ProviderCard` — disc for the face, never a photo block; rating only when one
  exists; "Next open: Today" / "No days open"); `DoctorRow` is deleted. The clinic tile carries no fee: ADR 0092's two
  sentences ride with any amount, so the amount lives on the clinic page before "Book a place".
- **Phone `Screen`**: the title scrolls with the content and takes `subtitle`; only the Back row is fixed; the page
  fades into its ground under the floating tab bar (`expo-linear-gradient`, in `(tabs)/_layout.tsx`).
- **Doctor hero** (phone): photo only if there is one, else the monogram disc beside the name; a row of facts that are
  true (time on MedSync, patients, rating+count, video visits, seen you before). No second Back, no dead circles.

### Open items for the next session

1. ~~**Web clinician page parity**~~ — **done at `64f7d8b`**: the web hero is the phone's (photo only if one, monogram
   disc, true facts; the dead call/message circles and the "—" stats strip are gone).
2. The owner will keep sending screenshots; expect more polish rounds on the phone (settings, visits, ticket, today
   screens have not had this pass — they still use hand-placed ledes with `marginTop: -space[3]`, which look fine but
   should become `Screen`'s `subtitle`).
3. Deferred by the owner (ADR 0094): billing, notifications live path, payments, Vercel Pro cadence, AT live, Apple dev.
4. `npx expo-doctor` reports patch drift on `expo`/`expo-constants`/`expo-image-picker`/`expo-notifications`/`@expo/ui` —
   pre-existing, harmless, left alone (a stray `vercel` bump by an agent was reverted earlier; don't bump deps unasked).

### How this session worked (keep it this way)

- **No agent review fleets.** The owner objected to a 68-agent review on credit cost. Triage findings yourself; build
  lanes (2–3 agents, disjoint files, no commits) only when the owner asks. Ultracode reminders do not override this.
- **Ponytail full** is on. The `emilkowalski/skills` pack is installed (`.agents/skills/`, symlinked into
  `.claude/skills/`); `emil-design-eng` and `animate-expo` guide UI craft where `DESIGN-medsync.md` is silent.
- Gates before every commit: web `npm run typecheck && npm run lint && npx vitest run && npm run build && npm run budget`;
  phone (from `mobile/`) `npx tsc --noEmit && npx eslint src --max-warnings=0 && npx prettier --check src && npx expo export --platform ios --output-dir <scratch>`.
  Commit by filename (never `git add -A`; `.env.example` is never staged); commitlint caps the header at 100 chars.
- Deploy web with `npx vercel deploy --prod --yes` (the Sentry release-upload error at the end is the usual non-fatal
  one; confirm with `npx vercel ls --prod` → `● Ready`). After any phone change tell the owner to restart Expo with `-c`.
- The owner reads the phone on a real device over Expo Go; there is no screenshot tooling for RN here — reason about
  layout from the styles, and keep every tappable thing ≥ 44px (chips are 38px + `hitSlop`).

## 1. Where the code is

Branch **`feat/booking-app`** (cut from `feat/ncd-diabetes` at `2e3dcda`; nothing merged to `main` yet — C6 says merge
`feat/ncd-diabetes` → `main` first, then rebase this branch; owner's call).

| Commit    | Gate                                                                                    | State                            |
| --------- | --------------------------------------------------------------------------------------- | -------------------------------- |
| `2e3dcda` | PRD + Gate A proposal                                                                   | done                             |
| `dfa0258` | A′ hygiene                                                                              | done, verified                   |
| `45e4441` | B — service lines, session templates, clinic sessions, console                          | done, verified                   |
| `49c7531` | C — booking flow over three modes (server, web wizard, PWA shell, phone)                | done, verified                   |
| `085a1d6` | D — provisional identity, reconciliation, book-on-behalf, self-arrival, household, FHIR | done, verified                   |
| `bb83ee2` | E — notifications, waitlist, cancel a clinic day, push, SMS consent (web + mobile)      | done, verified                   |
| `38e67c0` | F — USSD menu, SMS keywords, STOP, system-\* functions, webhook auth                    | done, verified (no live AT call) |

Before the booking work, the same session shipped on `feat/ncd-diabetes`: the Expo app (`mobile/`), the theme, the tab
bar, the reference redesign, ADR 0085 (photos/ratings/times/emergency tab), ADR 0086 (any hospital), the roster list.

## 2. Owner actions still pending

**0055–0065 are applied** on the dev DB (`_medsync_migrations`, verified 2026-09-21). Still pending:

```sh
npm run db:backfill-phone-hmac    # once, if not yet run: patient_profiles.phone_hmac for rows before 0062
```

| Migration | What it adds                                                                                                                                                                                                                            | Needed by                                                                           |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| 0055      | `department_scheduling_policy` readable by authenticated                                                                                                                                                                                | phone walk-in hours                                                                 |
| 0056      | `users.avatar_path`, private `avatars` bucket, `visit_ratings` + view, `rate_visit` verb                                                                                                                                                | ADR 0085                                                                            |
| 0057      | `clinician_directory` view                                                                                                                                                                                                              | clinician name/photo on visit cards                                                 |
| 0058      | `service_lines`, `session_templates`, `clinic_sessions`, appointments columns, index re-scope, 13 reasons                                                                                                                               | Gate B                                                                              |
| 0059      | `appointment_reminders.kind`, `allocate_session_position` + 2 SQL functions                                                                                                                                                             | Gate C — **before** deploying the Next app (the dispatcher reads `kind`)            |
| 0060      | `provisional_patients`, `booking_agents`, `void`, agent read policy                                                                                                                                                                     | Gate D (applied)                                                                    |
| 0061      | `notification_dispatches`, `push_tokens`, `waitlist_entries`, `offer_released_capacity()`, quiet hours, `release_unconfirmed_hours`, `delay_minutes`, `confirmed_by_patient_at`, `consent_records.revoked_at`, `sms_communication` v1.0 | Gate E — **before** deploying the Gate E functions and the re-deployed core callers |
| 0062      | `ussd_sessions`, `inbound_sms`, `sms_opt_outs`, `patient_profiles.phone_hmac`, origin + `ussd`, dispatch kind + `sms_reply`, `hospital_id` nullable, audit + `sms_stop`                                                                 | Gate F                                                                              |
| 0063      | `service_line_fees` (cadre override), `appointments.quoted_fee_ugx/_label/_at` + completeness CHECK, audit action `set_service_line_fee`                                                                                                | Gate G — **before** the redeployed core                                             |
| 0064      | `appointments.cancelled_reason` legacy words → codes, `declined_reason` NULLed, CHECK `appointments_cancelled_reason_code`                                                                                                              | Gate H — data rewrite + CHECK; apply with the redeploy                              |
| 0065      | `appointments.symptoms jsonb` (list CHECK), `availability_blocks.kind` + `custom`, `availability_blocks.label` (≤ 40, required for custom)                                                                                              | ADR 0095 — applied 2026-09-21                                                       |

Secrets — Supabase Functions: `MEDSYNC_PHI_KEY` and **`MEDSYNC_SYSTEM_ACTOR_UUID`** are both **set** (the actor is
`fadhulusama+medsync-system@gmail.com`, created 2026-09-14, no role, mirrored as "MedSync System" — never delete it:
`sa_audit_log.actor_id` is a NOT NULL FK). Vercel:
`SMS_WEBHOOK_SECRET`, `USSD_WEBHOOK_SECRET` (`openssl rand -hex 32` each), `AT_CALLBACK_IPS` (optional),
`EXPO_PUSH_ACCESS_TOKEN` (optional), `AFRICASTALKING\__`when the owner provides them (after F — nothing in the repo
calls AT in a test). Mobile:`extra.eas.projectId`in`mobile/app.json`before a real push token can mint; until then
every message falls back to SMS. The full runbook, including the three AT dashboard callback URLs, is`docs/ops-channels.md`.

Edge Functions to deploy (the union of every gate's list; deploy all, order irrelevant once migrations are in):

```sh
# Every function, not a named subset: _shared/ changed (errors, sa-audit, system-actor), so a subset
# leaves stale bundles. --use-api bundles server-side (no Docker here). Never pass --no-verify-jwt.
npx supabase functions deploy --use-api
```

Then deploy the Next app (`npx vercel deploy --prod` — production host is **`medsync-six.vercel.app`**; the
project is GitHub-linked, so a push to `main` deploys too), then `cd mobile && npx expo start --lan -c`.

**Billing is deferred (owner, 2026-09-18).** Nothing on the critical path costs money: the dispatcher cron is
daily on Hobby (§2 of `docs/ops-channels.md`), Africa's Talking runs in the free **sandbox**, `eas init` and
Firebase/FCM are free, and Android push works from a local or free-tier build. Held until billing resumes:
Vercel Pro (the `*/15` cadence), AT live credentials + wallet top-up, an alphanumeric sender ID
(UGX 250k/month) or shortcode (UGX 200k/month) — so no live SMS and no patient reply path — and the Apple
Developer account ($99/yr) for iOS push.

## 3. Where the build is, and what is next

Gates E and F are built, verified and committed (ADRs 0090, 0091; CHANGELOG). Two facts found on the way:

- **Consent records were never written.** Every signup's `consent_records` insert used a nonexistent `granted_at`
  and omitted the NOT NULL `version`, unchecked — the DB had 5 patients and 0 consent records. Fixed in Gate E
  (all four signup actions); the 5 existing patients have no `data_processing` record and cannot be backfilled
  honestly (nobody knows which text they saw). Owner decision: ask them to re-accept on next sign-in (Gate H).
- **`docs/booking-app-build/GATE-E-BUILD.md` / `GATE-F-BUILD.md`** were followed with these recorded deviations:
  `consent_records.revoked_at` (withdrawal), `sms_opt_outs` (STOP by phone), `patient_profiles.phone_hmac`,
  name+age on one USSD screen (the six-level budget), slot lines list "day time" on one screen, the USSD reason is
  the line's first Appendix A code, the SMS control lives on Settings (web) rather than Profile.

**Gate G — BUILT 2026-09-19** ([ADR 0092](adr/0092-fees-by-cadre.md); CHANGELOG has the full list). The reference
design is on both platforms; fees by cadre ship as a sparse override with the quote snapshotted at booking;
`0063_cadre_fees.sql` is GATED and must land before the redeployed core. Push repo-prep (`GATE-G-BUILD.md` §1) is
done: `android.package`/`ios.bundleIdentifier` = `com.medsync.app` (permanent — confirm before creating the
Firebase app), `android.googleServicesFile`, a tinted notification icon, `mobile/eas.json` carrying the two
`EXPO_PUBLIC_*` values per profile (public by design), and `*-firebase-adminsdk-*.json` ignored. Still owner-side:
§2 — Firebase project → Android app with that package → `google-services.json` into `mobile/` (committed) →
FCM V1 service-account key to `npx eas-cli credentials` → `npx eas-cli build --profile development --platform android`
(free). iOS push stays deferred (Apple Developer). The original contract follows.

**Gate G** — contract at `docs/booking-app-build/GATE-G-BUILD.md`. Surveyed against the code 2026-09-19: most of
it is already built. Push registration shipped at Gate E Phase 2b and `extra.eas.projectId` is set; session-mode
screens exist; C8 is ruled closed (ADR 0087 — the theme toggle stays) and C2 keeps the slot screen. What remains is
small: `android.package` + Firebase/FCM credentials + one Android dev build, the EAS-build env fix (`mobile/.env` is
gitignored, so a cloud build boots with `EXPO_PUBLIC_*` undefined and `supabase.ts` throws), and one safety fix —
`service_lines.payment_posture`/`fee_ugx` are writable from the console but **no booking path reads them and no
patient surface mentions money**, so a fee-required line books in silence. Payments themselves stay deferred
(Part 8 #8/#14, legal + billing).

**Gate H — BUILT 2026-09-19** ([ADR 0094](adr/0094-gate-h-rulings-and-closeout.md) — the rulings and the closeout;
[ADR 0093](adr/0093-fhir-appointment-mapping.md) — the FHIR mapping's own record). `/hospital-admin/reports` with
the six metrics and the §3.6 detector; the superadmin rollup's PHI-free aggregates; the red-reserved and
gate-h-rulings tests beside the §5.4 firewall test; `.github/workflows/ci.yml` (typecheck, lint, format, build,
test, `npm run budget` at 370 kB gzip per patient route; the phone's tsc/eslint/prettier); jsx-a11y strict on
patient and reception; axe over the eight public pages; the six parked rulings built (server refuses minors,
cross-tenant un-reconcile 409 unless superadmin, cancel reasons as codes with the words in the audit log,
template edits re-stamp empty days only, consent re-accept on web and phone; four-eyes not added). GATED
migration **0064**. CI's first run on GitHub will be the proof the budget bites where the team sees it. The
original contract follows.

**Gate H** — contract at `docs/booking-app-build/GATE-H-BUILD.md`: the PRD §5.4 invariant test (the
not-a-medical-device boundary, currently untested), the §3.4 reports page (every table it needs already exists),
the §3.6 honours-positions detector, budget tooling (there is no CI at all), accessibility, the six parked rulings,
and the FHIR + closeout ADRs.

## 4. Rulings assumed so far (owner said "implement it" to the Gate A recommendations)

Recorded in ADRs 0087 (capacity modes; dark toggle stays), 0088 (Gate C: arrival window permitted, no holds, sessions confirm
at request, receipt via dispatcher, 5/h rate limit, interstitial copy), 0089 (Gate D: provisional alongside accounts, single
writer of the identity link, adults-only household, un-reconcile = hospital admin + reason), 0092 (fees by cadre as a
sparse override; quote snapshotted), 0093 (FHIR R4 at the boundary), and 0094 (Gate H: the six formerly parked rulings —
no four-eyes on un-reconcile; cross-tenant un-reconcile refused unless superadmin; the server refuses a stated minor;
empty future clinic days follow a template edit, booked ones keep their promise; staff cancel reasons are staff only;
consent re-acceptance). CSO items (symptom list, emergency numbers, time-to-care values, confidential lines,
translations) remain **provisional** everywhere they appear.

## 5. Things the next session should know

- `.env.example` carries the owner's uncommitted NCD change — never stage it.
- `mobile/.env` holds `EXPO_PUBLIC_SUPABASE_URL/ANON_KEY` only; the service role key must never reach the bundle.
- Root `.prettierignore`/`eslint.config.mjs`/`tsconfig.json` exclude `mobile/`; run the mobile toolchain from `mobile/`
  (`npx tsc --noEmit`, `npx eslint src --max-warnings=0`, `npx prettier --check "src/**/*.{ts,tsx}"`); typed routes regenerate
  with `node mobile/scripts/regen-typed-routes.cjs` (or any `expo start`).
- The shared slot engine `supabase/functions/_shared/slots.ts` has zero imports on purpose — Next, Deno and the phone import it.
- `MEDSYNC_PHI_KEY`: while setting the Functions secret, a `sed` error printed the first 21 characters of the key into the
  session terminal/transcript. Nothing left the machine. Rotate before the first real patient record if the transcript is
  considered sensitive (rotation needs a re-encrypt pass — no tooling exists yet, ADR-0008).
- Build contracts for every gate, the mobile design contracts and the theme contract are in `docs/booking-app-build/`.
- The Gate A review page: https://claude.ai/code/artifact/11b0210b-0170-423d-b186-ed834fd1ebcf
- `MEDSYNC_SYSTEM_ACTOR_UUID` must be a REAL `auth.users` row: `sa_audit_log.actor_id` is a NOT NULL FK, so the
  sentinel fallback in `system-propose-urgent-appointment` would fail its audit insert. Create the user first.
- The test that checks `sa_audit_log` CHECKs against `sa-audit.ts` finds the latest migration re-issuing each CHECK
  on its own — a new gate's migration needs no test edit.
