# Patient Web · Tide: STOP 0 (discovery and baseline)

25 Oct 2026 · branch `feat/patient-web-tide` cut from `main` at `a090adf4` · no product changes.
The phone was read at `feat/mobile-tide-v1` `d1c14edd`. The reference doc and the canvas index were read for the Data, Visits and open-issue sections only.

## Blockers (decide before Step 1)

1. **The phone's backend is not on main.** `feat/mobile-tide-v1` holds 72 commits that main does not have, including:
   - migrations 0171–0177: places and location shares, appointment attachments, wav voice notes, move tracker and care-team reads, patient-reported history, meal log, food products;
   - the API routes `/api/mobile/profile`, `/reading-photo` and `/food-label`.

   **The numbers collide:** main already uses 0171–0173 (lab test menu). This slice adds no migration (L2), so these pages need that branch merged first, with its migrations renumbered: My places, the location share, history, attachments, meals, food, profile and reading photo. Only 0170 is the same on both branches.

2. **No Playwright, no seeded test patients, no harness in the repo.** That blocks the parity crawl (§6.2), the screenshots (§6.5), the LCP/INP and axe baselines (Q9), and every signed-in check. D-TW-14 already chose "the CDP harness + axe-core, no Playwright", but the harness script is not in the repo.
3. **No shared-package setup** (Q5). A proposal is below.

## Q1. The routes as they are now

The base path is **`/patient`**. There is no `/p`, `/help` or `/share`. SOS lives at **`/emergency`**.

- **Patient (21 pages):**
  - `/patient` (home), `appointments`, `book`
  - `care`, `care/visits/[summaryId]`, `clinician/[clinicianId]`
  - `consent` (the consent gate redirects here), `hospitals`, `household`, `menu`, `profile`
  - `queue`, `queue/[intakeId]` ("your place in line")
  - `results`, `results/[reportId]` (behind `PATIENT_RESULTS`)
  - `settings`, `symptoms`, `track`, `track/log`, `track/doses`, `track/medications`
- **Sign-in and sign-up:**
  - auth pages: `/sign-in`, `/sign-in/mfa`, `/sign-up`, `/accounts`, `/onboarding/mfa-setup`
  - patient sign-up: `/signup/patient`
- **Emergency (5 pages):** `/emergency`, `/crisis`, `/sexual-violence`, `/status`, `/tell`.
- **Design and theme:**
  - Every page is old Chroma (`components/ui`, `components/responsive`), re-pinned to Tide tokens only by `TideScope` when `TIDE_SURFACES` names the group.
  - Dark mode works on patient pages (next-themes). The emergency pages are forced light.
- **Components only patient pages use:** 55 files under `app/patient/**/_components/`.
- **Parity inventory:**
  - Item 1, the route list: done (this section).
  - Items 2 and 5, the crawl and the screenshots: blocked by blocker 2.

## Q2. How the web reads and writes data

- **Reads:** Drizzle, server-side, through `lib/patient/*`, `lib/notifications/consent.ts` and page loaders. There is no browser Supabase anywhere.
- **Writes with the user's session:** the Supabase server client, in the actions for `track`, `hospitals` and `care/visits`.
- **Service role:** `/signup/patient` only.
- **Edge Functions:** called from server actions through `callEdge`, which forwards the user's JWT (`callEdgePublic` for emergency). The web calls these 15:
  - cancel-appointment, reschedule-appointment
  - pt-confirm-attendance, pt-accept-rebooking
  - pt-withdraw-waitlist, pt-accept-waitlist-offer, pt-join-waitlist
  - pt-request-appointment, pt-declare-intake, ha-cancel-intake, pt-add-household-member
  - pt-submit-symptoms, pt-request-same-day
  - pt-emergency-event, pt-create-pre-arrival, pt-pre-arrival-status
- **The web does not call these** (the phone does): pt-bookable-clinicians, pt-ack-notification, pt-set-sms-consent, pt-emergency-sheet, pt-rate-visit, ha-mark-arrived.
  - The web writes SMS consent directly with Drizzle.
  - The web reads the emergency sheet in `app/emergency/_lib/sheet.ts`.
  - Moving these onto the phone's functions is a GATE A choice.

## Q3. The phone against the reference: mismatches

1. The reference shows "N ahead of you" (from rpc `patient_intake_ahead`, once arrived). The phone's `book/today` shows "N ahead of you" / "No one is ahead of you." Both conflict with L8's scan ("ahead of you"). **Decision needed.**
2. The phone's symptom same-day success screen shows `Position N` (`booking-done.tsx:75`). It is already known and will not be copied.
3. The reference lists ratings: `pt-bookable-clinicians` returns them and the phone writes them with `pt-rate-visit`. They are real data, but the canvas review and L14 are wary of ratings. **Show them or not?**
4. Readings, mood, meals, activity, exercise, trends, labs and chat are partly local or demo stores on the phone. The reference describes `personal_health_logs` behind an offline outbox. This will be checked screen by screen at each area step. A web page will not show demo data as real (L1).
5. "Who sees the log" is worded three ways on the phone (the reference's open issue). **One answer needed.**
6. The availability comment says a 14-day horizon, but the code uses `PATIENT_BOOKING_HORIZON_DAYS = 60`. The code wins.
7. The phone's flags are env only (`EXPO_PUBLIC_MOBILE_FLAGS`), so the web cannot read them "from the same source". Proposal: a server env `PATIENT_FLAGS` with the same names. The symptom-catalogue, pre-alert and first-aid flags already exist on the web (`lib/emergency/feature.ts`).

## Q4. Thresholds, symptom catalogue, copy

- **Thresholds:**
  - `packages/clinical-rules/patient-thresholds.v0.json` is `pending-cso` and is on main.
  - The phone imports it through `@clinical-rules/*`.
  - The web can import it today (a JSON import).
- **Symptom catalogue:**
  - `supabase/functions/_shared/symptom-catalog/` is v0.1 with status **`draft`** (unsigned), so W2 means the watermarked draft.
  - The web already uses it.
- **Copy:**
  - There is no `content/patient/` and the phone has no `*_COPY_STATUS`. Phone copy is mostly inline, plus a 14-line `i18n/en.json` and `consent-copy.ts`.
  - W6 needs a new `content/patient/` (draft), filled area by area.

## Q5. Shared package: proposal (STOP)

- **How it works today:**
  - The repo has no workspace (npm, `package-lock.json`).
  - The phone already shares code through path aliases in `mobile/tsconfig.json` and the jest `moduleNameMapper`, with metro watching the repo root. The aliases are `@shared/*` (`supabase/functions/_shared`), `@clinical-rules/*` and `@patient/*` (`lib/patient`).
- **Smallest arrangement:** `lib/patient/core/` for the pure rules.
  - The phone reaches it through its existing `@patient/core/*` alias; the web through `@/lib/patient/core/*`.
  - No config changes and no new package.
- **Alternative:** `packages/patient-core/` plus one `@patient-core/*` alias in each of three configs.
- **Cost either way:**
  - The phone's `lib/booking.ts` (statuses, cancellable/movable, availability), `data/medicines.ts` (slots) and `data/notifications.ts` (kind map) mix pure rules with Supabase and React, so they need splitting.
  - That is an edit on the unmerged phone branch. The phone's tests must stay green.
  - Already pure: `lib/readings.ts`, `features/visits/logic.ts` (fees), `features/symptoms/logic.ts`, `lib/patient/doses.ts`, and `_shared/slots.ts` (the places formula, Africa/Kampala).

## Q6. Has the migration's kit landed?

- **Neither step has landed.** There is no `components/tide/` on main, so neither migration Step 2 (the kit) nor Step 8 (sign-in and sign-up in Tide) is there.
- **What main does have:** the Tide tokens in `app/globals.css`, `TideScope`, `lib/design/tide.ts` (`TIDE_SURFACES`) and `tests/design/tide-guards.test.ts`.
- **Unmerged:** `origin/feat/tide-everywhere` (`88a1195d`, foundation and shells). Reuse it if it merges first.

## Q7. Browser features and new dependencies

- **Maps:** none. A satellite or place preview would need a map library or static tiles. **Flag.**
- **Web push:** none. It stays off; SMS remains the backbone.
- **Service worker:** a hand-written `public/sw.js` (an offline shell, ADR 0088). Extend it by hand, with no helper library.
- **Barcode:** none. Typed codes only, unless a reader is approved.
- **`MediaRecorder` and `watchPosition`:** not used yet. Both are native, so no dependency.
- **Other dependencies this slice might need:**
  - Playwright (for the parity crawl, unless the CDP harness is used instead);
  - the Figtree Latin Extended-A subset, if `next/font` is not already loading it.

## Q8. Playwright, axe, the harness, the fake clock

- **Playwright:** not installed.
- **axe-core:** installed and used in Vitest/jsdom (`tests/a11y/*`).
- **Fake clock:** `vi.useFakeTimers` only. There is no clock module.
- **Seeded patients:** none. There are no `supabase/seed*` files or patient fixtures.
- **What this means:** patient routes cannot be checked end to end today (blocker 2).

## Q9. Baselines

- **First-load JS, gzipped** (the production build passed). Every route also carries 52k of CSS.

| Route                        | JS       |
| ---------------------------- | -------- |
| `/patient/track/medications` | 360k     |
| `/patient/profile`           | 353k     |
| `/patient/track`             | 351k     |
| `/sign-up`                   | 347k     |
| `/patient/symptoms`          | 338k     |
| `/signup/patient`            | 335k     |
| `/patient/book`              | 321k     |
| `/patient/appointments`      | 319k     |
| `/patient`                   | 303k     |
| `/emergency`                 | 297k     |
| `/sign-in`                   | 291k     |
| all other patient routes     | 279–296k |

- **Not measured yet:** LCP and INP on a throttled Moto G Power class device over Slow 4G, axe counts on rendered routes, and screenshots. Blocker 2 covers why.
- **Tests:** `tests/patient`, `tests/a11y` and `tests/design` give 155 passed, 8 skipped.

## Other disagreements, prompt against repo

The repo wins on each of these:

- The package manager is npm and Node is 24 (`.nvmrc`); the prompt says pnpm and Node 22.
- The Help routes are `/emergency/*`, not `/help/*`. The prompt's route table assumes `/p`, `/help` and `/share/location/[token]`.
- `/share/location/[token]` does not exist on the web yet. It is a new signed-out read, so it is an L2 stop.
- The reference names the phone's routes (`/book`, `/symptoms`, `/danger`, `/visits/[id]`). The web will map them under `/patient`, with 308s from the old URLs.

## GATE A inputs this raises

- Merge `feat/mobile-tide-v1` first (renumbering 0171–0177), or keep the dependent pages "not available yet".
- Choose how to run checks: the CDP harness plus axe (write the harness into the repo), or add Playwright. Also seed test patients; the owner applies seeds.
- `lib/patient/core` or `packages/patient-core`.
- "N ahead of you", ratings, "who sees the log", and `PATIENT_FLAGS`.
- A map library, or no satellite preview.
