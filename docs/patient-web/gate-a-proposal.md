# Patient Web · Tide: GATE A proposal

25 Oct 2026 · `feat/patient-web-tide` at `adbe92e9`. The phone branch `feat/mobile-tide-v1` is merged in, its migrations renumbered 0185–0191 and its colliding ADRs 0402–0414 (`docs/NUMBERS.md`).

## 1. Routes (repo wins: `/patient` and `/emergency` stay)

New pages are built under the private route folder `app/pw/` and served at the old URLs by a `proxy.ts` rewrite while `PATIENT_WEB_TIDE` is on. Off, `/pw/*` answers 404 and the old pages serve. At Step 9, `app/pw/` becomes `app/patient/`, the rewrite and the flag go, and the 308s stay in `next.config`.

| New URL                                                               | Page                                                                     | Old URL (308 at Step 9)                              |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------ | ---------------------------------------------------- |
| `/patient`                                                            | Home                                                                     | same                                                 |
| `/patient/notifications`                                              | Notifications                                                            | (new)                                                |
| `/patient/mood`                                                       | How you have felt                                                        | (new)                                                |
| `/patient/visits`                                                     | This week and the calendar                                               | `/patient/appointments`, `/patient/queue/[intakeId]` |
| `/patient/visits/[id]`                                                | One visit                                                                | `/patient/appointments` row                          |
| `/patient/book`                                                       | Book: who, why, how (hospital picker when none)                          | `/patient/hospitals`                                 |
| `/patient/book/wrong`                                                 | Something is wrong (forced light)                                        | `/patient/symptoms`                                  |
| `/patient/book/today`                                                 | Come today                                                               | `/patient/queue`                                     |
| `/patient/book/day`                                                   | Ask for a day                                                            | `/patient/clinician/[clinicianId]` → `?clinician=`   |
| `/patient/care`                                                       | Care hub                                                                 | `/patient/track`                                     |
| `/patient/care/medicines`                                             | Medicines                                                                | `/patient/track/doses`, `/patient/track/medications` |
| `/patient/care/readings` (+ `/danger`)                                | Log a reading                                                            | `/patient/track/log`                                 |
| `/patient/care/trends`                                                | Health trends                                                            | (new)                                                |
| `/patient/care/labs` (+ `/[reportId]`)                                | Lab tests; the result page stays behind `PATIENT_RESULTS`                | `/patient/results`, `/patient/results/[reportId]`    |
| `/patient/care/move`                                                  | Move and eat                                                             | (new)                                                |
| `/patient/care/messages`                                              | Messages (`mobileChat` off: the honest line)                             | (new)                                                |
| `/patient/me`                                                         | Me                                                                       | `/patient/menu`, `/patient/settings`                 |
| `/patient/me/conditions`, `/allergies`, `/family`                     | History editors                                                          | (new)                                                |
| `/patient/me/records` (+ `/[id]`)                                     | Visit records                                                            | `/patient/care`, `/patient/care/visits/[summaryId]`  |
| `/patient/me/places`                                                  | My places                                                                | (new)                                                |
| `/patient/me/profile`                                                 | A few more details                                                       | `/patient/profile`                                   |
| `/patient/me/household`                                               | People I book for                                                        | `/patient/household`                                 |
| `/patient/consent`                                                    | Consent gate                                                             | same                                                 |
| `/emergency`                                                          | Help · SOS (forced light, signed out)                                    | same                                                 |
| `/emergency/lines`, `/crisis`, `/sexual-violence`, `/tell`, `/status` | Lines, calm screens, pre-alert                                           | same                                                 |
| `/share/location/[token]`                                             | Family's live location page (merged from the phone branch; restyle only) | same                                                 |
| `/sign-in`, `/signup/patient`                                         | Sign-in, four-step sign-up, own-device choice                            | same                                                 |

`/patient/care` changes meaning (visit records → the Care hub), so its old links go to `/patient/me/records` before the cutover.

## 2. Shell and web adaptations

As prompt §3 and §4, with three changes:

- Help is the existing `/emergency` route. The red pill keeps `TIDE_COPY.help` / `helpLabel` ("Help", "Help, emergency").
- Lab results keep their values behind `PATIENT_RESULTS` (Lab Phase 5). The reference's "names only" applies with that flag off. This keeps parity (§6).
- Doctor ratings show only behind a facility switch (D-PW-08). Until it exists, the badge shows "New" or no rating word.

## 3. Shared rules (D-PW-09): `packages/patient-core/`

One alias, `@patient-core/*`, added to the root `tsconfig.json`, `mobile/tsconfig.json` and the jest `moduleNameMapper`. Metro already watches the repo root. The phone keeps its import paths: each moved file leaves a one-line re-export where it was, so the phone's tests run unchanged.

| Rule                                 | From (phone)                                                      | Into               | Note                                                       |
| ------------------------------------ | ----------------------------------------------------------------- | ------------------ | ---------------------------------------------------------- |
| Reading classifier                   | `lib/readings.ts`                                                 | `readings.ts`      | already pure; reads the threshold JSON                     |
| Fees                                 | `features/visits/logic.ts` (`feeText`, `feeFor`, `payLook`)       | `fees.ts`          | pure                                                       |
| Visit statuses, cancellable, movable | `lib/booking.ts` (`STATUS_LABEL`, `CANCELLABLE`, `RESCHEDULABLE`) | `visits.ts`        | lifted out of a Supabase file                              |
| Symptom tier (client preview)        | `features/symptoms/logic.ts`                                      | `symptoms.ts`      | the server stays the authority                             |
| Dose slots                           | `data/medicines.ts` (`SLOT_WORDS`, `SLOT_TIMES`)                  | `dose-slots.ts`    | adherence stays in `lib/patient/doses.ts` (already shared) |
| Notification kind map                | `data/notifications.ts` (`KIND_WORDS`, kind → target key)         | `notifications.ts` | each app maps the target key to its own route              |
| Availability                         | stays in `supabase/functions/_shared/slots.ts`                    |                    | already one copy, shared by both                           |

Proof: the phone's jest suite (43 suites, 494 tests) passes unchanged. `tests/patient-core/*.test.ts` runs one shared fixture table through the web import, and the phone's tests use the same table.

## 4. Data map per page

Every read under RLS with the patient's session; privileged writes through the phone's Edge Functions, called from server actions by `callEdge` (the user's JWT plus a v4 request id). See §4.1 for the policies.

| Page                                                  | Reads                                                                                                                                 | Writes                                                                                                                                                                                                   |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Home                                                  | `self_medications`, `self_medication_takes`, `personal_health_logs`, `notification_dispatches`, `appointments`, `clinician_directory` | `self_medication_takes` (insert / soft delete), `personal_health_logs`                                                                                                                                   |
| Notifications                                         | `notification_dispatches`                                                                                                             | `pt-ack-notification`                                                                                                                                                                                    |
| Visits, One visit                                     | `appointments`, `clinic_sessions`, `waitlist_entries`, `patient_intakes`, `location_shares`                                           | `cancel-appointment`, `reschedule-appointment`, `pt-confirm-attendance`, `ha-mark-arrived`, `pt-accept-rebooking`, `pt-withdraw-waitlist`, `pt-accept-waitlist-offer`, `pt-rate-visit` (switch, D-PW-08) |
| Book, Ask for a day                                   | `hospitals`, `hospital_departments`, `service_lines`, `clinic_sessions`, `clinician_directory`, `booking_agents`, `patient_profiles`  | `pt-bookable-clinicians` (read), `pt-request-appointment`, `pt-join-waitlist`, `appointment_attachments` + bucket                                                                                        |
| Something is wrong                                    | `patient_symptom_catalog_versions`                                                                                                    | `pt-submit-symptoms`, `pt-request-same-day`, `pt-emergency-event`                                                                                                                                        |
| Come today                                            | `patient_intakes`                                                                                                                     | `pt-declare-intake`, `ha-cancel-intake`                                                                                                                                                                  |
| Care, Medicines, Readings, Trends, Move and eat, Mood | `personal_health_logs`, `self_medications`, `self_medication_takes`, `patient_food_products`                                          | the same tables; `/api/mobile/reading-photo`, `/api/mobile/food-label`                                                                                                                                   |
| Lab tests                                             | `lib/lab/patient-results.ts` (as today)                                                                                               | none                                                                                                                                                                                                     |
| Me, history editors                                   | `patient_reported_history`, `patient_profiles`, `users.avatar_path` + bucket `avatars`, `/api/mobile/profile`                         | the same; `pt-set-sms-consent`                                                                                                                                                                           |
| Visit records                                         | `/api/mobile/visit-summaries`                                                                                                         | "Add to my medicines" through the same route                                                                                                                                                             |
| My places                                             | `patient_places`                                                                                                                      | `patient_places`                                                                                                                                                                                         |
| People I book for                                     | `booking_agents`                                                                                                                      | `pt-add-household-member`                                                                                                                                                                                |
| Help                                                  | `pt-emergency-sheet` (signed out)                                                                                                     | `pt-emergency-event`, `pt-create-pre-arrival`, `pt-pre-arrival-status`                                                                                                                                   |
| Share my location                                     | `location_shares`                                                                                                                     | `location_shares` (at most every 20 s)                                                                                                                                                                   |
| Sign-up, consent                                      | `consent_versions`                                                                                                                    | `/api/mobile/patient-signup`, `consent_records`                                                                                                                                                          |

### 4.1 Policies

| Table                                                                                                               | Patient policy                                                          | Migration                    |
| ------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | ---------------------------- |
| `patient_profiles`, `users`                                                                                         | own row: select, insert (profiles), update                              | 0011, 0002                   |
| `hospitals`, `hospital_departments`, `consent_versions`, `patient_symptom_catalog_versions`                         | select, anon too                                                        | 0002, 0006, 0066             |
| `service_lines`, `department_scheduling_policy`                                                                     | select, signed in                                                       | 0058, 0055                   |
| `clinic_sessions`                                                                                                   | select where `status = 'published'`                                     | 0058                         |
| `clinician_directory`                                                                                               | a view (name, photo) granted to signed-in users                         | 0057                         |
| `appointments`, `patient_intakes`, `waitlist_entries`, `notification_dispatches`, `booking_agents`, `visit_ratings` | own rows, select only; writes through Edge Functions                    | 0028, 0060, 0032, 0061, 0056 |
| `patient_intake_ahead`                                                                                              | SECURITY DEFINER, own intake only (not shown on the web, D-PW-12)       | 0170                         |
| `consent_records`                                                                                                   | own: select, insert                                                     | 0002                         |
| `personal_health_logs`, `self_medications`, `self_medication_takes`, `push_tokens`, `patient_places`                | own: select, insert, update, delete                                     | 0029, 0061, 0185             |
| `location_shares`, `patient_food_products`                                                                          | own: select, insert, update (no delete)                                 | 0185, 0191                   |
| `patient_reported_history`                                                                                          | own: select, insert active, update active → removed only                | 0189                         |
| `appointment_attachments` + bucket                                                                                  | insert own on own appointments; select where the appointment is visible | 0186, 0187                   |
| bucket `avatars`                                                                                                    | own folder: insert, update, delete; select signed in                    | 0056                         |
| `patient_visit_summaries`                                                                                           | own, `shared`, not superseded                                           | 0091                         |

**Open item for STOP 1:** 0188 lets the care team read `personal_health_logs` movement rows. D-PW-04 tells the patient "Only you" for movement. One of the two must change: either the words for Move say the care team can read it, or 0188's care-team read is not applied. A new migration is outside this slice. Until you choose, the web shows the Move wording the phone ships today, and that wording stays a draft.

## 5. Strings

`content/patient/web.ts` (`PATIENT_WEB_COPY_STATUS: draft`) holds every web-only string: the plus label, the offline line, "This is not available yet.", the desktop-call line (number from data), the steps lines, "Keep this page open to keep sharing.", the own-device choice and its two notes, the outbox line, the idle sign-out line, and the three D-PW-04 sentences. Strings the phone already has move there area by area (W6), each a `draft` until you sign.

## 6. Decisions

| #       | Decision                 | Taken                                                                                                                                                                                                      |
| ------- | ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D-PW-01 | Action colour            | Navy for main buttons; lagoon for "now", the plus and the unseen bell; two tokens `--act` / `--on-act`                                                                                                     |
| D-PW-02 | Navigation               | The rail at ≥ 761 px, the phone's pill at ≤ 760 px; Help in neither                                                                                                                                        |
| D-PW-03 | SOS on a computer        | Same countdown, then the number large with the desktop-call line                                                                                                                                           |
| D-PW-04 | Who sees what you log    | History: the care team, unconfirmed. Readings, medicines, mood, movement, food, water: only you. Records: you and your clinicians                                                                          |
| D-PW-05 | Shared devices           | Ask at sign-in, default No; No stores nothing; Yes gets the offline set, cleared on sign-out                                                                                                               |
| D-PW-06 | Idle sign-out            | 15 min on a shared device; 7 days on your own, with the password again for history edits                                                                                                                   |
| D-PW-07 | Symptom steps on the web | Same catalogue, steps and server tier                                                                                                                                                                      |
| D-PW-08 | Ratings and fees         | Fee by the shared rule; ratings behind the facility switch                                                                                                                                                 |
| D-PW-09 | Shared rules             | `packages/patient-core`                                                                                                                                                                                    |
| D-PW-10 | Cutover                  | `PATIENT_WEB_TIDE` globally after the five-day pilot; delete the old pages at Step 9                                                                                                                       |
| D-PW-11 | "Position N"             | The web shows no position; a phone fix is filed                                                                                                                                                            |
| D-PW-12 | Queue words              | "N ahead of you" is not shown on the web (L8); a phone fix is filed with D-PW-11                                                                                                                           |
| D-PW-13 | Checks                   | No Playwright (D-TW-14). `scripts/patient-web/harness.mjs` drives system Chrome over raw CDP (Node 24's `WebSocket`, no dependency): crawl, screenshots, throttling, LCP/INP, axe injected from `axe-core` |
| D-PW-14 | Test patients            | `scripts/patient-web/seed-test-patients.ts` creates three test patients on the dev database; the owner runs it                                                                                             |
| D-PW-15 | Flags                    | Phone flags read on the web from the server env `PATIENT_FLAGS` (the same names); `PATIENT_WEB_TIDE` for the cutover                                                                                       |

Signed: Fadhul (CSO), "do what's recommended", in chat, 25 Oct 2026. D-PW-12 to D-PW-15 are this proposal's own recommendations, accepted by the same instruction.

## 7. Test plan

- Unit (Vitest): `packages/patient-core` against the shared fixture table; every kit component with axe in jsdom.
- Guards (Vitest source scans, Appendix B): raw colour, red reserved, amber and green, no dose, queue honesty plus the exact sentence, forced light, disabled reason, browser storage (own-device off).
- Rendered (harness): the Help crawl at 1440, 834 and 390, signed in and out; the parity crawl into `tests/parity/patient/*.json`; screenshots; budgets on a 4× CPU, Slow 4G profile.
- Phone: `cd mobile && npx jest` unchanged and green after every move.

## 8. ADR drafts (0415–0421)

- 0415 The patient web replaces the old patient pages, at parity with the phone.
- 0416 The patient web shell: the rail at desktop width, the pill at phone width.
- 0417 Web adaptations of phone patterns (§3).
- 0418 One "who sees what" rule (D-PW-04), narrowing ADR 0413 (was 0354).
- 0419 Shared devices: no PHI in browser storage without the own-device choice.
- 0420 `packages/patient-core`.
- 0421 SOS on devices that cannot dial.
