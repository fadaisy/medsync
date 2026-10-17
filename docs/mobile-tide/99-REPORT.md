# Tide v1 — build report

## Round 2 (17 Oct 2026): real data, ready for Expo Go

The owner asked for everything to work in Expo. The app now runs on real data (ADR 0342):

- **Readings, medicines, doses, mood, water and walking:** the patient's own log, in the tables `personal_health_logs`, `self_medications` and `self_medication_takes`. The phone uses the web's own dose logic, `lib/patient/doses.ts`.
- **Visit records and lab tests:** shared visit summaries, through `app/api/mobile/visit-summaries`.
- **Notifications:** `notification_dispatches`, plus the medicine doses that are due.
- **See a doctor:** bookable clinicians from the real booking data.
- **Me:** age, conditions and the home facility come from the profile.
- **Offline:** saves wait in the outbox and replay safely when the phone is back online.
- **Wording:** the phone never says the care team sees what the patient logs. No clinician can read those tables.
- **Switches, all off for now:** chat (`mobileChat`), sign-in by text code (`mobilePhoneOtp`) and card scan (`mobileQrSignIn`).
- **Example data left:** only payments, still labelled "Demo payment · no money moved".

**Checks:**

| Check | Result |
|---|---|
| mobile `tsc` | 0 errors |
| mobile `eslint` | clean |
| mobile `jest` | 25 suites, 356 tests pass |
| web `tsc` (full) | 0 errors |
| web `vitest` (new route) | 4 of 4 pass |
| iOS bundle | builds |
| Sign-up route over the local network | answers, with the live consent notice |

**The owner must apply migration 0170** before mood, pulse, water, walking, the home pin and "N ahead of you" work:

```
cd ~/Desktop/medsync-tide && npm run db:migrate -- 0170
```

Until then, those saves show "Couldn't save that. Try again later."

---

## Round 1

17 Oct 2026, on branch `feat/mobile-tide-v1`, with local commits only. Read `00-RECON.md` for the decision ledger.

## Checks (run in `mobile/`)

| Check | Result |
|---|---|
| `npx tsc --noEmit` | 0 errors |
| `npx eslint src --max-warnings=0` | 0 problems |
| `npx jest` | 16 suites, 270 tests, all pass |
| Prettier (repo config) | clean on all changed files |
| `npx expo export --platform ios` | bundles cleanly (Hermes, 5.9 MB) |
| Device or simulator | **not run**: no Xcode or Android SDK on this machine |

The law tests:

- `features/safety/help-crawl.test.ts`: Help on every route (L6), 33 routes.
- `theme/colour-laws.test.ts`: no raw colours, and red only where allowed (L3), 85 checks.
- `features/safety/safety-screens.test.tsx`: forced light (L11), and the SOS countdown can be cancelled with nothing dialled before 3 s.
- `features/visits/honesty.test.ts`: no hour promised (L8).
- `features/auth/rules.test.ts`: adults 18–120 and consent binding (L9, L10).

## Features

| F | Status | Seam / note |
|---|---|---|
| F-01 Splash | done | the pill says "Made for Ugandan hospitals" (no hospital is known before sign-in) |
| F-02 Sign in | done (password); seam (phone code `mobilePhoneOtp`, card `mobileQrSignIn`) | the phone code needs an SMS provider; card sign-in needs a server exchange (Q2) |
| F-03 Create account | done | needs `EXPO_PUBLIC_WEB_ORIGIN` in the app build; the home pin is kept on the phone only (needs a migration, below); place goes down to subcounty |
| F-04 Home | done (demo) | "people ahead" per doctor is a fixture |
| F-05 Plus | done (demo) | voice "say it" is out of scope (shown as "coming later") |
| F-06 Notifications | done (demo) | delivery choice links to Me; push delivery is out of scope |
| F-07 Mood | done (demo) | — |
| F-08 Week, Visit | done (live visits, demo plan rows) | no clinic phone number in the data, so no Call button |
| F-09 Book | done (live) | coming today for a household member is off: no queue place can be saved for someone else |
| F-10 Come today | done (live intake) | the count ahead needs a server read (below) |
| F-11 Ask for a day | done (live) | — |
| F-12 Tickets | done (live, offline cache) | payment simulated: "Demo payment · no money moved" |
| F-13–F-19 Care | done (demo) | camera, attachments, voice notes and calls show "Not available yet" |
| F-20 Me | done (live identity, demo health) | age needs `date_of_birth` in `fetchPatientProfile` |
| F-21 Help | done | dials 112; 912 pending MoH/CSO; crisis, sexual-violence and hospital lines linked |
| F-22 Danger | done | thresholds pending CSO |
| F-23 Foundation | done | — |

## Metrics

| PRD metric | Measured |
|---|---|
| Taps to log a reading | 3 from Home (plus, Log a reading, Save); 2 from the plus. `reading_saved` records `entry` and `taps` |
| Help on every screen | 33 of 33 routes (crawl) |
| Cold start / Home first render | **not measured**: no device. `home_rendered` fires with `ms` since bundle start, ready for the first device run |
| 60 fps, no dropped frames | **not measured**: no device |

Analytics events carry no PHI: `track()` payloads hold kinds, counts, steps and hashed ids, never values, names or free text.

## Open items for the owner

1. **Migrations (none applied).**
   - Home pin: `patient_profiles.home_pin_lat`, `home_pin_lng`, `home_pin_consent_version` and `home_pin_consented_at`, with RLS limited to the patient and their care team, plus a separate consent version.
   - A server read (Edge Function or SECURITY DEFINER) returning "people ahead of me" for the caller's own intake.
2. **Configuration.**
   - `EXPO_PUBLIC_WEB_ORIGIN` for in-app sign-up.
   - An SMS provider before `mobilePhoneOtp`.
   - Whether Supabase requires email confirmation: if it does, the sign-in straight after sign-up fails, and the done screen offers "Sign in instead".
3. **CSO sign-offs.**
   - The thresholds file (including weight, which has no target yet).
   - Emergency numbers and first-aid wording.
   - The 138/86 wording. The v0 limit is 140/90, so the app says "In your range" where the board said "above your target".
4. **Product questions.**
   - "A lab test only" maps to the `routine` reason.
   - Should the medic card show demo conditions before Gate CG? Today they show under the ribbon.
   - Splash pill wording.
5. **Ports still to Tide.** The consent gate, household, the symptom catalogue and the `today` / `ticket` door it feeds, and the emergency sheet. Each opens Help through its red disc.
6. **Device run.** Run on a real iPhone and an Android phone: motion timings, 200 % text, VoiceOver and TalkBack focus order in sheets, and frame rate.
