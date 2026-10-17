# Tide v1 — recon and decision ledger

Branch `feat/mobile-tide-v1`, worktree `~/Desktop/medsync-tide`, cut from `origin/main` at 446a0cc9. The plan was published as an artifact and approved by the owner on 17 Oct 2026 ("Go with all ten recommendations (D1 to D10)"). The owner then asked for all gates to run without stopping at each one.

## The app before Tide

- `mobile/` is Expo SDK 57 with expo-router (`Stack.Protected` gates), React Native 0.86 on the new architecture, Reanimated 4.5 and Chroma styling (ADR 0162).
- Auth was password sign-in via Supabase, with the consent re-accept gate (`(app)/consent.tsx`).
- Live engines with RLS:
  - booking: `lib/booking.ts`, appointments, sessions and intake;
  - emergency contacts and pre-alert: `lib/emergency.ts`;
  - household agents;
  - the waitlist (Gate E): `lib/notifications.ts`;
  - the symptom catalogue: `lib/symptoms.ts`;
  - push.
- No clinical data (readings, medicines, labs, mood or chat) had an engine on the phone. Law L2 keeps it off the phone until Gate CG.

## Feature map

| F | Feature | Route(s) | Data | Status |
|---|---|---|---|---|
| F-01 | Splash | `app/index.tsx` | none | new |
| F-02 | Sign in | `app/sign-in.tsx` | Supabase auth (live); phone code behind `mobilePhoneOtp`; card scan behind `mobileQrSignIn` | rework |
| F-03 | Create account | `app/sign-up.tsx` | `data/signup.ts` → `app/api/mobile/patient-signup` → `submitPatientSignup` (live) | new |
| F-04 | Home | `(tabs)/index.tsx` | medicines, readings, mood and notifications fixtures; doctors fixture | rework |
| F-05 | Plus + sheets | `(app)/add.tsx`, `features/home/*-sheet.tsx` | readings and medicines fixtures, outbox | new |
| F-06 | Notifications | `(app)/notifications.tsx` | `data/notifications.ts` fixture | new |
| F-07 | Mood | `(app)/mood.tsx` | `data/mood.ts` fixture | new |
| F-08 | This week, Visit | `(tabs)/visits.tsx`, `visits/[id].tsx` | appointments and sessions (live), waitlist (live), plan rows (demo) | rework |
| F-09 | Book | `book/index.tsx` | household (live) | rework |
| F-10 | Come today | `book/today.tsx` | intake (live); count ahead is demo | rework |
| F-11 | Ask for a day | `book/day.tsx` | sessions, price list, request (live) | rework |
| F-12 | Tickets | `components/tide/ticket.tsx`, `features/visits/ticket-cache.ts` | live, cached offline | rework |
| F-13–F-16 | Care, Medicines, Reading, Trends | `(tabs)/care.tsx`, `care/{medicines,reading,trends}.tsx` | fixtures | new |
| F-17–F-19 | Labs, Move and eat, Chat | `care/{labs,activity,chat}.tsx` | fixtures, outbox | new |
| F-20 | Me | `(tabs)/me.tsx`, `components/tide/health-card.tsx` | profile, household and settings (live); conditions and medicines (demo) | rework |
| F-21 | Help · SOS | `app/help.tsx` | verified contacts (live), `tel:` dial | rework |
| F-22 | Danger | `(app)/danger.tsx` | `checkReading` over the thresholds file | new |
| F-23 | Foundation | `theme/tide.ts`, `components/tide/*`, `motion/presets.ts` | — | new |

## Ledger

| # | Decision | By |
|---|---|---|
| D1 | Separate worktree on `feat/mobile-tide-v1`; local commits only, no push | owner |
| D2 | Keep `mobile/`, npm, StyleSheet + roles; no NativeWind | owner |
| D3 | Bottom sheets allowed on the patient phone only (ADR 0341) | owner |
| D4 | PRD dark palette (`#0B1120` ground, `#151D30` cards); the Tide DS artifact to follow | owner |
| D5 | Tide replaces Chroma on the phone (ADR 0340) | owner |
| D6 | Dependencies: Figtree, Geist Mono, expo-camera, expo-local-authentication, expo-localization, react-native-maps, jest-expo, Testing Library; no react-hook-form or zod | owner |
| D7 | Phone code behind `mobilePhoneOtp` (off); password live | owner |
| D8 | The one web change: `app/api/mobile/patient-signup/route.ts` over `submitPatientSignup`. The prompt's "no web change" yields to this owner decision | owner |
| D9 | The card shows the hospital number (`patient_profiles.patient_code`), else "Given at your first visit" | owner |
| D10 | Superseded by "get through all gates" | owner |
| Q1 | 112 live; 912 pending MoH and CSO (`features/safety/config.ts`, `pending-moh-cso`) | owner default |
| Q2 | Card QR sign-in off; the card's QR is a placeholder that encodes nothing | owner default |
| Q3 | Ratings behind a facility switch, off (`ratingsOn: false`) | owner default |
| Q4 | Fees only with a price list; otherwise "No fee" | owner default |
| Q5 | "People I care for" = the existing household booking agents | owner default |
| Q6 | Conditions on the card back hidden by default (switch in Me) | owner default |
| L-1 | `motion.*` typed against `ViewStyle` (Reanimated's default keyframe type does not fit `Animated.View`) | lead |
| L-2 | `tsconfig` lists `types: ["jest","node"]`: TypeScript 6 no longer loads `@types` by default | lead |
| L-3 | Saves say "Saved on this phone · demo" until clinical data is live (`savedWords`); nothing reaches the care team before Gate CG | lead |
| L-4 | The old Emergency tab's sheet stays as the pushed `/(app)/emergency/lines`. Help links it and the crisis and sexual-violence routes. The legacy red disc opens Help | lead |
| L-5 | Danger accepts only a dangerous reading; anything else redirects to Help. Chest pain goes straight to Help | lead |
| L-6 | Kept, not retired, until rebuilt in Tide: consent gate, household, symptom catalogue, `today` + `ticket` (they read the catalogue's pending draft), the emergency routes. Removed as unreachable: old `clinic/[id]`, `doctor/[id]`, `visit/[id]` and 13 dead components | lead |
| L-7 | The waitlist offer card (Gate E) rebuilt in Tide on This week (`features/visits/waitlist-card.tsx`) | lead |
| L-8 | `/dev/screen?name=…` (development builds only) renders a signed-in screen outside the gate, for web screenshots | lead |

## Risks carried

- No Xcode or Android device on this machine, so nothing has run on a phone. All visual checks were done on Expo web at 390×844.
- The thresholds file is `pending-cso`, and so are the emergency numbers and first-aid wording.
- There is no server read for "people before you", so the count is a fixture under the ribbon.
- Intakes go to a department, not a doctor, so the doctor picked is a preference only.
