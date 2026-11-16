# Patient app v2 · Step 0 · Revisit

Branch `feat/patient-app-v2`, cut from `main` 971b9da (2026-11-16). No product changes.

## Q1 · What exists today

| Surface             | Count                                               | Where                                                                                                                     |
| ------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Phone screens       | 41 (+3 layouts)                                     | `mobile/src/app/**`; tabs: Home `(tabs)/index`, Visits, Care, Me                                                          |
| Phone features      | 10                                                  | `mobile/src/features/`: auth, care, care-more, history, home, location-share, safety, symptoms, visits                    |
| Patient web, Tide   | 35 pages                                            | `app/pw/**`, served at `/patient` through `proxy.ts:12` (`pwRewrite`, `pwRedirect` in `lib/patient-web/routes`)           |
| Patient web, legacy | 21 pages                                            | `app/patient/**` (appointments, queue, track, results, menu…)                                                             |
| Shared core         | 23 modules                                          | `packages/patient-core/` (book-days, fees, visits, readings, care-day, help-sos, dose-slots, care-no-dose…)               |
| Patient functions   | 19 `pt-*` + `ha-book-on-behalf`, `system-ussd-book` | `supabase/functions/`                                                                                                     |
| Flags               | `patientFlag()`                                     | `lib/patient-web/flags.ts:5`, env `PATIENT_FLAGS`; `mobilePayments` already read at `lib/patient-web/book-actions.ts:128` |

Phone screens: `(tabs)` care, index, me, visits · add · book/{index,day,today} · care/{activity,chat,labs,medicines,reading,trends} · consent · danger · emergency/{crisis,lines,status,sv,tell} · history · household · mood · notifications · places/{index,[id]} · profile/details · records/{index,[id]} · symptoms · ticket · today · visits/[id] · help · emergency · sign-in · sign-up · index · dev/{screen,tide}.

Tide web pages: /patient · book/{,day,today,wrong} · care/{,labs,medicines,messages,move,readings,trends} · consent · hospitals · me/{,allergies,conditions,family,household,places,profile,records,records/[id]} · mood · notifications · visits/{,[id]} · emergency/{,crisis,lines,sexual-violence,status,tell} · gallery · signup/patient.

## Q2 · Parity crawls

Not run in the cloud. There is no `.env.local` (Supabase), so signed-in pages cannot render, and there is no phone emulator. The public `/gallery` page renders the Tide kit from fixtures. **Needed:** a crawl on the owner's machine, or seeded env access.

## Q3 · Canvases

**A, _Tether Patient Booking · Prototype_:** 26 boards, matching the prompt's table (1–3 phone visit, 4 doctor, 5 care, 6–7 danger, 8 care team, 9–14 Today explorations, 15 widgets, 16–26 web). Notes s12 (HIG spacing), s13, sw, sw2 are present.

**B, _Tether Cash Office_:** 10 boards. Patient boards: `PhoneBook` (pay when booking), `PhoneToday` (pay on the day), `PhoneRefund` (refund). Note s1 holds the payment-state walkthrough; s2 holds the assumptions; s3 holds the open questions.

Canvas vs prompt (prompt treated as the newer intent unless the owner says otherwise):

1. A·s13: "readings, the daily plan and the care team stay in the chronic-care app" vs M1, one app with two modes.
2. A·sw: the web visit day has "a simple floor map" vs W3, "No floor map".
3. B·s2: "New patient file UGX 5,000 is assumed": a fee not from the engine; it must come from Clinics & schedule.

## Q4 · Booking slice

There is no `feat/patient-booking` branch and no `PROMPT-PATIENT-BOOKING.md` or `PROMPT-MOBILE-REWORK.md` in the repo. Booking reached `main` through the `feat/booking-app` line (gates A′–H, ADRs 0093–0096) and the pilot PRs #308 and #310 (go-live). Deferred there (ADR 0094): payments, live SMS, push credentials, Apple developer account.

## Q5 · Section 8 rows

| Row                         | State                                                                                                                                                                                                                         |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Care mode switch, enrolment | Partial: the `ncd_registration` / `ncd_person` registry exists (`db/schema/ncd-registry.ts`); no patient-facing enrolment flag                                                                                                |
| Care plan read model        | Missing; `care_plan` appears only in the EMR (`db/schema/encounter.ts`)                                                                                                                                                       |
| Readings                    | Partial: `personal_health_logs` (`db/schema/patient-self-tracking.ts:38`), `ncd_observation`; sugar timing to be checked in Step 1                                                                                            |
| Dose events                 | Partial: `self_medication_takes` (`patient-self-tracking.ts:121`), patient-entered medicines only                                                                                                                             |
| Danger rules                | Partial: `packages/patient-core/help-sos.ts`, threshold file used by `mobile/src/features/safety`; no server twin                                                                                                             |
| Care team, messages         | Missing as patient tables; phone `care/chat` and web `care/messages` exist as screens                                                                                                                                         |
| Checks, results release     | Results pages exist (`app/patient/results`); release rule to be confirmed at Step 1                                                                                                                                           |
| Membership, entitlements    | Missing                                                                                                                                                                                                                       |
| Widget feed                 | Missing                                                                                                                                                                                                                       |
| Questions for the doctor    | Missing                                                                                                                                                                                                                       |
| **Payments (8.2)**          | **Missing entirely**: no bill, intent, receipt, refund or provider tables. Only a seam: `book-actions.ts:121–128` returns `demo` with `mobilePayments` off. Pharmacy has its own `payment_status` (migration 0131), unrelated |

Newest migration: `0298_clinics_schedule_cutover.sql`.

## Q6 · Baselines

| Measure                                                                        | Result                                                                                  |
| ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| Phone: cold start, time to interactive, JS size, memory (2 GB Android, iPhone) | Not measurable here: no device or emulator                                              |
| Web: first-load JS, LCP, INP, axe                                              | Not run: needs env for `next build` and a signed-in session. `axe-core` is a dependency |

## Q7 · Test tooling

| Lane               | Tool                                                                                                               | Baseline today                                                       |
| ------------------ | ------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------- |
| Phone              | Jest 30, `jest-expo` 58, RNTL 14                                                                                   | 46 files, 591/591 tests pass. In the cloud, run with `--no-watchman` |
| Web, patient lanes | Vitest 4 (`tests/patient`, `patient-web`, `patient-core`, `parity`, `booking`, `mobile`)                           | 32 files, 423/423 tests pass                                         |
| End-to-end         | No Maestro, Detox or `@playwright/test` dependency. Playwright and Chromium are preinstalled in the container only | —                                                                    |
| Fake clock         | `jest.useFakeTimers` on the phone; 7 web test files use fake timers                                                | —                                                                    |
| Seeded engine      | PGlite lanes `tests/emr-db`, `tests/ncdreg-db` (local symlink only)                                                | —                                                                    |
