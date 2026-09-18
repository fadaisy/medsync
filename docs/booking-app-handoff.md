# MedSync Book — handoff (2026-09-13, after Gates E and F)

**Read this first in the next session.** It says where the build stands, what is not applied yet, what was interrupted,
and how to resume. The rules that govern everything are unchanged: `AGENTS.md`, the PRD at `docs/booking-app-prd.md`, the
Gate A proposal at `docs/booking-app-gate-a-proposal.md`, and ADRs 0084–0089.

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

**0055–0060 are applied** on the dev DB (`_medsync_migrations`, checked 2026-09-13). Still pending, in order —
each GATED, each additive (0062 makes `notification_dispatches.hospital_id` nullable):

```sh
npm run db:migrate                # 0061 (Gate E), 0062 (Gate F) — both dry-run clean in BEGIN/ROLLBACK
npm run db:backfill-phone-hmac    # once: patient_profiles.phone_hmac for rows written before 0062
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

**Gate G** — see the Gate A proposal §10. The payment half is blocked on Part 8 #8/#14 (legal); "Expo push only"
is largely done by E's Phase 2b (token registration, ack, deep link). What remains of G is the EAS project id
(owner) and any push-permission copy the CSO wants.

**Gate H** — telemetry, reports, invariant tests, perf budgets, WCAG, the parked rulings (four-eyes on
un-reconcile and cancel-session; cross-tenant un-reconcile; staff cancel reasons visible to a booking agent),
re-granting SMS after STOP from the app (clear `sms_opt_outs`), removing a household member, the consent re-accept
above, Luganda strings after CSO sign-off.

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
- `MEDSYNC_SYSTEM_ACTOR_UUID` must be a REAL `auth.users` row: `sa_audit_log.actor_id` is a NOT NULL FK, so the
  sentinel fallback in `system-propose-urgent-appointment` would fail its audit insert. Create the user first.
- The test that checks `sa_audit_log` CHECKs against `sa-audit.ts` finds the latest migration re-issuing each CHECK
  on its own — a new gate's migration needs no test edit.
