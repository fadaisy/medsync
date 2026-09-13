# MedSync Book — handoff (2026-09-13)

**Read this first in the next session.** It says where the build stands, what is not applied yet, what was interrupted,
and how to resume. The rules that govern everything are unchanged: `AGENTS.md`, the PRD at `docs/booking-app-prd.md`, the
Gate A proposal at `docs/booking-app-gate-a-proposal.md`, and ADRs 0084–0089.

## 1. Where the code is

Branch **`feat/booking-app`** (cut from `feat/ncd-diabetes` at `2e3dcda`; nothing merged to `main` yet — C6 says merge
`feat/ncd-diabetes` → `main` first, then rebase this branch; owner's call).

| Commit | Gate | State |
|---|---|---|
| `2e3dcda` | PRD + Gate A proposal | done |
| `dfa0258` | A′ hygiene | done, verified |
| `45e4441` | B — service lines, session templates, clinic sessions, console | done, verified |
| `49c7531` | C — booking flow over three modes (server, web wizard, PWA shell, phone) | done, verified |
| `085a1d6` | D — provisional identity, reconciliation, book-on-behalf, self-arrival, household, FHIR | done, verified |
| `wip` (next commit) | **E — INTERRUPTED mid-server-phase** | see §3 |

Before the booking work, the same session shipped on `feat/ncd-diabetes`: the Expo app (`mobile/`), the theme, the tab
bar, the reference redesign, ADR 0085 (photos/ratings/times/emergency tab), ADR 0086 (any hospital), the roster list.

## 2. Owner actions still pending — nothing below has been confirmed applied

Run in this order. Each migration is GATED; each is additive except the one flagged index re-scope in 0058.

```sh
npm run db:migrate          # applies whatever is pending of 0055 … 0060 (check: SELECT * FROM schema_migrations or the migrate log)
```

| Migration | What it adds | Needed by |
|---|---|---|
| 0055 | `department_scheduling_policy` readable by authenticated | phone walk-in hours |
| 0056 | `users.avatar_path`, private `avatars` bucket, `visit_ratings` + view, `rate_visit` verb | ADR 0085 |
| 0057 | `clinician_directory` view | clinician name/photo on visit cards |
| 0058 | `service_lines`, `session_templates`, `clinic_sessions`, appointments columns, index re-scope, 13 reasons | Gate B |
| 0059 | `appointment_reminders.kind`, `allocate_session_position` + 2 SQL functions | Gate C — **before** deploying the Next app (the dispatcher reads `kind`) |
| 0060 | `provisional_patients`, `booking_agents`, `void`, agent read policy | Gate D |

Secrets: `MEDSYNC_PHI_KEY` is **set** on the Supabase project (done in-session; see §5 for a caveat). Still needed later:
`SMS_WEBHOOK_SECRET`, `USSD_WEBHOOK_SECRET`, `AT_CALLBACK_IPS` (optional), `EXPO_PUSH_ACCESS_TOKEN` (optional), Vercel Pro for
a fourth cron, `AFRICASTALKING_*` for live SMS.

Edge Functions to deploy (the union of every gate's list; deploy all, order irrelevant once migrations are in):

```sh
npx supabase functions deploy pt-bookable-clinicians pt-rate-visit pt-request-appointment reschedule-appointment cancel-appointment \
  pt-declare-intake ha-complete-encounter ha-mark-no-show ha-mark-arrived ha-record-walkin ha-check-in-patient \
  ha-upsert-service-line ha-upsert-session-template ha-book-on-behalf ha-reconcile-identity pt-add-household-member
```

Then deploy the Next app, then `cd mobile && npx expo start --lan -c`.

## 3. Gate E — what was interrupted

The E+F workflow was stopped by the owner during E's server phase; F never started. On disk (uncommitted at the time, committed
next as **`wip(booking): Gate E server phase — interrupted, unverified, do not deploy`**):

- `supabase/migrations/0061_notifications_and_waitlist.sql` — written, **not dry-run**
- `db/schema/notifications.ts` + columns on hospitals / clinic_sessions / scheduling — written
- `lib/notifications/dispatches.ts`, `supabase/functions/_shared/dispatches.ts` — builder + planner, one test file written
- `lib/notifications/expo-push.ts`, `lib/notifications/sink.ts`, `africastalking.ts`, the dispatcher route — modified
- `supabase/functions/_shared/{book,waitlist}.ts`, `cancel-appointment`, `ha-decline-appointment-request`, `reschedule-appointment`
  — modified to write dispatches / release capacity
- new functions: `ha-cancel-session`, `ha-set-session-delay`, `pt-accept-rebooking`, `pt-accept-waitlist-offer`,
  `pt-ack-notification`, `pt-confirm-attendance`, `pt-join-waitlist`, `pt-withdraw-waitlist`
- `app/api/sms/` (DLR webhook) — started
- **NOT started**: web surfaces (2a), mobile push + surfaces (2b), both verifiers, ADR 0090, CHANGELOG.

State at the stop: `npm run typecheck` clean; `npm run lint` failing; 2 tests failing in `tests/identity/gate-d-invariants.test.ts`
(the audit-verb CHECK test parses 0060 and does not yet know 0061's verbs; the "one booking core" test sees receipt logic that
moved into `_shared/dispatches.ts`). Both are expected mid-gate, not regressions — but the WIP has **not** been verified by anyone.

**How to resume E**: read `docs/booking-app-build/GATE-E-BUILD.md` (the contract, verbatim), then diff the WIP against its
"Phase 1" list; finish Phase 1 (dry-run 0061; fix the two invariant tests by teaching them 0061; lint), then run Phase 2a ∥ 2b and
the two verifiers as the contract describes. The workflow script that was running is at
`~/.claude/projects/-Users-airm1-Desktop-medsync/47696eac-05a1-469b-9122-d1a4c49147e9/workflows/scripts/booking-gates-e-f-wf_ce863efd-8ae.js`
— reusable as a template, but a fresh run should re-read the disk rather than resume from cache.

**Gate F** has its contract at `docs/booking-app-build/GATE-F-BUILD.md`; it depends on E's dispatch table and on the owner
providing Africa's Talking credentials (the owner said they will, after E and F are built). Build against the AT callback
contract in the doc; no live calls in tests.

**Gates G, H** — see the Gate A proposal §10. G's payment half is blocked on Part 8 #8/#14 (legal); build G as "Expo push only"
(most of which is E's Phase 2b). H is telemetry, reports, invariant tests, perf budgets, WCAG, and the parked rulings.

## 4. Rulings assumed so far (owner said "implement it" to the Gate A recommendations)

Recorded in ADRs 0087 (capacity modes; dark toggle stays), 0088 (Gate C: arrival window permitted, no holds, sessions confirm
at request, receipt via dispatcher, 5/h rate limit, interstitial copy), 0089 (Gate D: provisional alongside accounts, single
writer of the identity link, adults-only household, un-reconcile = hospital admin + reason). Parked for Gate H: four-eyes on
un-reconcile; cross-tenant un-reconcile; desk booking a stated minor (client refuses, server does not); template edits leaving
unbooked old instances published; staff cancel reasons visible to a booking agent. CSO items (symptom list, emergency numbers,
time-to-care values, confidential lines, translations) remain **provisional** everywhere they appear.

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
