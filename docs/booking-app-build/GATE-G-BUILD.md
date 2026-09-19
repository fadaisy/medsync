# Gate G build contract — push on a real handset, and the fee that is not charged (READ IN FULL)

Repo /Users/airm1/Desktop/medsync, branch `feat/booking-app`. Inputs: `docs/booking-app-gate-a-proposal.md`
(§10 row G, §5.10, rulings C2/C8, Part 8 #8/#14), `docs/booking-app-prd.md` (§6.1, §8), ADRs 0085–0091,
`AGENTS.md`. Ground truth: `mobile/app.json`, `mobile/src/lib/push.ts`, `db/schema/service-lines.ts`,
`supabase/functions/ha-upsert-service-line/index.ts`.

**Gate G is mostly already built.** Surveyed against the code on 2026-09-19, three of the four things §10 row G
asks for are done, and the fourth is legally blocked. What remains is small, and one item is a safety fix
nobody has named before.

## Already delivered — do NOT rebuild

- **Push registration** — Gate E Phase 2b shipped `mobile/src/lib/push.ts` (permission, token upsert into
  `push_tokens` under own-row RLS, delete-before-signout, `pt-ack-notification` on receipt, deep-link on tap),
  the Settings → Messages section, and `expo-notifications` in `app.json` plugins.
  `extra.eas.projectId = 351f1ae3-6f3a-49c9-8cd2-770726308f64` is set — `eas init` has been run.
- **Session-mode screens** — `mobile/src/app/(app)/clinic/[id].tsx` books a clinic day (reason chips,
  interstitial, day tiles with places-left, household chips, waitlist join).
- **C8 is RULED and closed**: ADR 0087 — "the dark-mode toggle **stays**: the owner asked for it explicitly."
  The proposal's light-only recommendation is superseded. Do not delete the theme preference.
- **C2** — slot mode stays exactly as built (ADR 0087); `doctor/[id].tsx` survives for slot-mode lines. No split.

## Rulings assumed (ADR 0092)

- **Payments stay deferred.** Part 8 #8/#14 are unresolved (legal), and owner billing is deferred
  (2026-09-18). No `payment_intents` table, no `appointments.payment_state`, no provider integration,
  no webhooks. Gate G ships **zero** payment code.
- **But a posture column that nothing honours is a lie to the patient.** `service_lines.payment_posture`,
  `fee_ugx` and `deposit_ugx` ship today (migration 0058) and are writable from
  `/hospital-admin/scheduling` via `ha-upsert-service-line`. **No booking path reads them and no patient
  surface mentions money** — verified: the only readers are the admin console and the Edge Function that
  writes them. So a facility can mark a line "fee required, 20,000 UGX" and every patient books in silence.
  Gate G closes that gap the honest way: **state the fee as information, charge nothing.** A line with a
  posture other than `none` shows, on the pick step and on the receipt, one sentence in the patient's words —
  "This clinic charges UGX 20,000. You pay at the hospital, not in the app." No payment UI, no promise, no
  blocking. If the owner would rather the console stop offering the field until payments exist, that is the
  alternative and it is one `disabled` attribute — but silence is not an option.
- **iOS push is out of scope** while the Apple Developer account is deferred. Android is the whole target.
- **EAS cloud builds must not boot blind.** `mobile/.env` is covered by the root `.gitignore` `.env*` rule and
  EAS Build uploads git-tracked files only, so a cloud build resolves `EXPO_PUBLIC_SUPABASE_URL` to
  `undefined` and `mobile/src/lib/supabase.ts` throws at import — a white screen with no clue. Gate G fixes
  this before the first build, not after.

## Build

### 1. Repo-side, free, no account needed

1. `mobile/app.json`: add `android.package` (a permanent reverse-DNS id the owner controls — it binds
   Firebase, FCM and any future Play listing and cannot be changed without new credentials) and
   `android.googleServicesFile: "./google-services.json"`. Add `ios.bundleIdentifier` for symmetry, inert
   while iOS is deferred. Configure the `expo-notifications` plugin with a notification icon and the brand
   colour rather than the default.
2. `mobile/.gitignore`: the existing rules cover `*.jks`, `*.p8`, `*.p12`, `*.key`, `*.mobileprovision` but
   **not** a Firebase service-account JSON, which downloads as `<project>-firebase-adminsdk-*.json`. Add a
   rule before anyone downloads one. (`google-services.json` itself is public config and is committed —
   Expo documents this.)
3. EAS build env: add `mobile/eas.json` with an `env` block carrying `EXPO_PUBLIC_SUPABASE_URL` and
   `EXPO_PUBLIC_SUPABASE_ANON_KEY` per profile (both are public by design — the anon key grants nothing
   without RLS), or wire EAS environment variables. The service-role key must never appear. Add a startup
   assertion or a build-time check so a missing value fails loudly rather than as a white screen.
4. Fee honesty (the ruling above): read `payment_posture`/`fee_ugx` where the booking options are built
   (`lib/scheduling/booking-options.ts`, `app/patient/book/_lib/booking.ts`, `mobile/src/lib/booking.ts`),
   render the one sentence on the pick step and the receipt on web and phone, and add it to the booking
   receipt SMS only if it fits the single GSM-7 part — it will not, so it stays on screen.

### 2. Owner-side, free (browser + CLI)

5. Firebase: create a project, add an **Android** app with exactly the `android.package` from step 1,
   download `google-services.json` into `mobile/`. Project settings → Service accounts → generate a private
   key, save it **outside the repo**.
6. `npx eas-cli@latest credentials` → Android → Google Service Account → **FCM V1** → upload that key.
7. `npx expo install expo-dev-client`, then one build: `npx eas-cli@latest build --profile development
--platform android` (answer **yes** to "Generate a new Android Keystore?"). Local alternative with no EAS
   quota: `npx expo run:android --device` (needs Android Studio).
   Do steps 5–6 **before** the build — a build without `google-services.json` has to be redone.

## Verify

- **Push actually lands**: on the dev build, sign in → a `push_tokens` row appears (read it in the Supabase
  Table Editor; `FORCE ROW LEVEL SECURITY` hides it from a non-bypass role, so an empty PostgREST read is not
  evidence of failure). A test from https://expo.dev/notifications reaches the handset. Then the real path:
  book a visit, run the dispatcher, and confirm an `ok` ticket and — next run — an `ok` receipt against that
  token; a `DeviceNotRegistered` receipt must delete the row. Signing out must delete it too.
- **No secret leaves the repo**: `git status` after step 5 shows `google-services.json` and nothing resembling
  `*-firebase-adminsdk-*.json`; `mobile/eas.json` contains no service-role key.
- **Fee honesty**: a service line with `payment_posture <> 'none'` shows the sentence on the pick step and the
  receipt, on web and phone; a line with `none` shows nothing. No control anywhere implies payment in the app.
  A patient booking for a household member sees the same sentence (they are the one who will pay).
- **Nothing regressed**: `npm run typecheck && npm run lint && npm run test && npm run build`; from `mobile/`,
  `npx tsc --noEmit`, `npx eslint src --max-warnings=0`, `npx prettier --check "src/**/*.{ts,tsx}"`, and
  `npx expo export --platform android`.
- **Scope discipline**: `grep -rn "payment_intent\|payment_state" app lib supabase/functions db` returns
  nothing. Gate G adds no payment machinery.
