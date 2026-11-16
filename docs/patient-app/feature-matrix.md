# Patient app v2 · Feature matrix (Step 1)

Status: **draft, for Fadhul to sign at STOP 1.** Source: `docs/patient-app/step0-revisit.md`, the code at `feat/patient-app-v2`, and Canvas A (26 boards) and Canvas B (3 patient boards).

Owner rulings already given (16 Nov): the prompt wins over the canvases (one app with two modes, no floor map, fees only from the engine). v2 is built over the Tide web (`app/pw`), and the legacy `app/patient` pages redirect and go at Step 12. Existing features are **merged or ported, not dropped**, and are harmonized across phone and web.

**Verdicts** (§2.1): Keep · Port · Merge · Drop · New. The verdict is given per platform as **Phone / Web**. **Needs** (§2.2): N1 job · N2 safety · N3 data · N4 access · N5 evidence. **Ask** = an open choice for STOP 1, listed at the end.

**Web column:** "Tide" = `app/pw` (serves `/patient`); "legacy" = `app/patient`; "—" = the feature is not on the web today.

## 1. Shell and navigation

| #    | Feature today                                                                                   | Phone                                         | Web                                                | Verdict P / W | Needs  | Becomes (canvas pattern) · built from                                                                                                                                                           |
| ---- | ----------------------------------------------------------------------------------------------- | --------------------------------------------- | -------------------------------------------------- | ------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1.1  | Tab bar: Home, Visits, Care, Me                                                                 | `(tabs)/_layout`, `components/ui/tab-bar.tsx` | Tide `PatientShell` bottom tabs                    | Merge / Merge | N1     | M3: frosted pill with a sliding indicator; tabs per mode (Visit: Home, Book, Visits, Me; Care: Today, Plan, My care, Me). Web ≥ 761 px: top bar. From `tab-bar.tsx` and `components/tide/shell` |
| 1.2  | The Plus: what is due now, then log a reading, a dose or a mood in two taps                     | `(app)/add.tsx`                               | Tide `AddButton` (`app/pw/_components/add-dialog`) | Keep / Keep   | N1     | Canvas s13 keeps "a separate + button". Care mode: reading and dose. Visit mode: Book. **Ask A1** (D-MR-12)                                                                                     |
| 1.3  | Header: greeting, avatar, unseen bell                                                           | `screen.tsx` header, Home                     | `PageHeader` (greeting, avatar, `unseen`)          | Merge / Merge | N1     | M4 header. The bell becomes a quiet count on the avatar, which opens Notifications (1.7)                                                                                                        |
| 1.4  | Help: full pill on Home, round Help elsewhere; the Help screen is the destination               | `help.tsx`, header Help                       | Tide header Help                                   | Keep / Merge  | N2     | M5. Web: the red Help pill in the top bar on every page (MR6)                                                                                                                                   |
| 1.5  | Toasts                                                                                          | `features/care-more/use-toast.tsx`            | Tide toast                                         | Keep / Keep   | N1     | One at a time, polite                                                                                                                                                                           |
| 1.6  | Offline: last-good caches for Home, places, records, ticket, medicines, reading drafts          | AsyncStorage across 12 screens                | —                                                  | Keep / New    | N2, N4 | MR13. Web: a clear offline state, and a typed reading is kept in the page (no loss)                                                                                                             |
| 1.7  | Notifications list: grouped by day, filterable, action inside the row                           | `notifications.tsx`                           | Tide `/patient/notifications`                      | Port / Port   | N1, N3 | Not on the canvas. Opened from the header avatar count; same page on both platforms                                                                                                             |
| 1.8  | Push: register token, channels                                                                  | `lib/push.ts`                                 | —                                                  | Keep / —      | N2     | Adds the "Called", paid and refund channels. No PHI in payloads (MR12)                                                                                                                          |
| 1.9  | Deep links, scheme `medsync://`                                                                 | `app.json`                                    | `/patient/...` URLs                                | Keep / Keep   | N3     | Every v2 page gets a URL; SMS links open the same page on both platforms. **Ask A2**: add a `tether://` scheme and keep `medsync://`                                                            |
| 1.10 | Analytics: 15 events (app*open, dose*_, help*opened, sos*_, reading*saved, signup*_, ticket\__) | `lib/analytics`                               | partial                                            | Keep / Merge  | N5     | Same event names on both platforms; add pay*\*, refund*_, question\__, plus\_\*. No PHI                                                                                                         |
| 1.11 | Splash and wordmark "MedSync"                                                                   | `index.tsx`                                   | —                                                  | Merge / —     | —      | M15: Tether wordmark. The brand guard runs on patient strings                                                                                                                                   |
| 1.12 | Light and dark theme; Help and danger forced light (law L11)                                    | `theme/`                                      | Tide theme toggle                                  | Keep / Keep   | N2     | Theme toggle in the web top bar                                                                                                                                                                 |
| 1.13 | Dev harnesses                                                                                   | `dev/screen`, `dev/tide`                      | `/gallery`                                         | Keep / Keep   | —      | Development only; also hosts the time scrubber (§5.6)                                                                                                                                           |

## 2. Getting in

| #   | Feature today                                | Phone                 | Web                        | Verdict P / W | Needs | Becomes                         |
| --- | -------------------------------------------- | --------------------- | -------------------------- | ------------- | ----- | ------------------------------- |
| 2.1 | Sign in (OTP; QR and phone-OTP behind flags) | `sign-in.tsx`         | auth pages                 | Keep / Keep   | N3    | Restyle only; not on the canvas |
| 2.2 | Sign up: four steps and done; age refusal    | `sign-up.tsx`         | Tide `/signup/patient`     | Keep / Keep   | N3    | Restyle; Tether words           |
| 2.3 | A few more details (optional, after sign-up) | `profile/details.tsx` | Tide `/patient/me/profile` | Keep / Keep   | N1    | Me › Profile                    |
| 2.4 | Data-processing consent re-accept            | `consent.tsx`         | Tide `/patient/consent`    | Keep / Keep   | N3    | Unchanged legal text            |

## 3. Visit mode: Home, Book, Visits, ticket

| #    | Feature today                                                                       | Phone                       | Web                                                   | Verdict P / W | Needs  | Becomes                                                                                                                                                                       |
| ---- | ----------------------------------------------------------------------------------- | --------------------------- | ----------------------------------------------------- | ------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 3.1  | Home "your day": greeting, today's visit, day cascade                               | `(tabs)/index.tsx`          | Tide `/patient`                                       | Merge / Merge | N1     | Visit mode Home (boards 1, 16): ticket and stage strip, Book cards, results, household, small card. The care parts of the cascade (doses, readings) move to Today (3.1 → 5.1) |
| 3.2  | "How are you feeling today?" symptom shortlist (ADR 0096)                           | Home                        | Tide Home                                             | Merge / Merge | N1     | Becomes Book's first "why" step: the same eight quick picks open Book with the reason preselected                                                                             |
| 3.3  | Symptom navigation ("navigation, not diagnosis") and Something is wrong             | `symptoms.tsx`              | Tide `/patient/book/wrong`                            | Merge / Merge | N2     | Inside Book's "why"; keeps its interrupt to the danger and emergency routes                                                                                                   |
| 3.4  | Book: two doors, Come today and Ask for a day; who, why, how; published days        | `book/{index,today,day}`    | Tide `/patient/book/*`                                | Merge / Merge | N1, N3 | Booking engine and laws PB1–PB14 unchanged. Phone: step by step. Web: W1, one page with three columns. Adds the pay choice (P1)                                               |
| 3.5  | Doctor page: book from a clinician                                                  | `features/home/doctors.tsx` | legacy `/patient/clinician/[id]` → `book/day?doctor=` | Keep / Keep   | N1     | A doctor's-times clinic in Book's calendar, with time slots                                                                                                                   |
| 3.6  | The ticket: status in words, offline, `ticket_shown_offline`                        | `ticket.tsx`                | Tide visit page                                       | Merge / Merge | N2     | §5.3: one design, two layouts. Offline keeps the last 10 tickets                                                                                                              |
| 3.7  | This week: appointments, clinic days                                                | `(tabs)/visits.tsx`         | Tide `/patient/visits`                                | Merge / Merge | N1, N3 | W4 Visits: offers first, upcoming with payment chips, past visits, a calendar coloured by person                                                                              |
| 3.8  | One visit: navy band, day tile, how to get there, three actions                     | `visits/[id].tsx`           | Tide `/patient/visits/[id]`                           | Merge / Merge | N1     | §5.5 the day of the visit: ticket, quick actions, stages, Called, Questions for the doctor. **No floor map** (owner)                                                          |
| 3.9  | Moved-visit and waitlist offers (`pt-accept-rebooking`, `pt-accept-waitlist-offer`) | visits                      | visits                                                | Keep / Keep   | N1, N3 | Board 3 / W4: Keep, Pick another day, Cancel                                                                                                                                  |
| 3.10 | Confirm attendance, rate a visit (`pt-confirm-attendance`, `pt-rate-visit`)         | visits                      | visits                                                | Port / Port   | N3, N5 | Confirm sits in the visit-day reminder; Rate sits in the past-visit row                                                                                                       |
| 3.11 | People I book for (booking agents)                                                  | `household.tsx`             | Tide `/patient/me/household`                          | Merge / Merge | N4     | Household on Home and Visits (W4). Free today: **Ask A3** (D-MR-08 puts household booking in Plus Family)                                                                     |
| 3.12 | Visit records: shared visit summaries                                               | `records/{index,[id]}`      | Tide `/patient/me/records`                            | Port / Port   | N3     | Visits › Past visit › Summary; also listed in Me                                                                                                                              |
| 3.13 | Pre-arrival and intake declaration (`pt-create-pre-arrival`, `pt-declare-intake`)   | `today.tsx`                 | `/patient/book/today`                                 | Keep / Keep   | N3     | Door A behaviour unchanged; restyled into Book                                                                                                                                |
| 3.14 | USSD booking for no-data phones (`system-ussd-book`)                                | server                      | server                                                | Keep          | N4     | Not a screen; a USSD booking shows in the app's Visits like any other                                                                                                         |

## 4. Safety

| #   | Feature today                                         | Phone                           | Web                                        | Verdict P / W | Needs | Becomes                                                                                                      |
| --- | ----------------------------------------------------- | ------------------------------- | ------------------------------------------ | ------------- | ----- | ------------------------------------------------------------------------------------------------------------ |
| 4.1 | Help · SOS: 3 s countdown, cancel, tel:112            | `help.tsx`                      | Tide `/emergency`                          | Keep / Keep   | N2    | Restyle only; tests unchanged                                                                                |
| 4.2 | Emergency before sign-in (national lines)             | `emergency.tsx`                 | Tide `/emergency`                          | Keep / Keep   | N2    | Unchanged                                                                                                    |
| 4.3 | E1 lines, E2 tell the hospital, E3 status (pre-alert) | `emergency/{lines,tell,status}` | Tide `/emergency/*`                        | Keep / Keep   | N2    | Unchanged                                                                                                    |
| 4.4 | Crisis and sexual-violence routes (calm, no red)      | `emergency/{crisis,sv}`         | Tide `/emergency/{crisis,sexual-violence}` | Keep / Keep   | N2    | Unchanged                                                                                                    |
| 4.5 | Dangerous-reading interrupt                           | `danger.tsx`                    | —                                          | Merge / New   | N2    | §5.8 flows: phone sheet (boards 6, 7), web dialog (board 24) with the 15-minute timer. Signed content (MR10) |
| 4.6 | Location share during an emergency                    | `features/location-share`       | —                                          | Keep / —      | N2    | Kept in Help. Web gap: recommend none (a browser cannot share in the background)                             |

## 5. Care

Care is behind `careMode`, off in production until Gate CG. Today these are free self-tracking features (ADR 0342).

| #    | Feature today                                                                 | Phone                                                  | Web                                                                               | Verdict P / W | Needs  | Becomes                                                                                                                                        |
| ---- | ----------------------------------------------------------------------------- | ------------------------------------------------------ | --------------------------------------------------------------------------------- | ------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| 5.1  | Care hub: medicines, trends, water, minutes walked                            | `(tabs)/care.tsx`                                      | Tide `/patient/care`                                                              | Merge / Merge | N1, N3 | Care mode Today (boards 5, 20) and Plan. **Ask A4**: in Visit mode, self-logging lives in Wellness                                             |
| 5.2  | Medicines: patient-entered plus pharmacy hand-overs; dose ticks, snooze, undo | `care/medicines.tsx`                                   | Tide `/patient/care/medicines`; legacy `track/{doses,medications}`                | Merge / Merge | N1, N3 | §5.6 dose rows and the week as dots. The plan's medicines come from the doctor's plan; patient-entered ones stay and are marked "added by you" |
| 5.3  | Log a reading (full page and sheet)                                           | `care/reading.tsx`, `features/home/reading-sheet.tsx`  | Tide `/patient/care/readings`                                                     | Merge / Merge | N1, N2 | Add a reading: sugar timing (before breakfast, lunch, supper, or other), plausibility check, danger routing                                    |
| 5.4  | Trends: 7 days, gaps                                                          | `care/trends.tsx`, `tide/charts.tsx`, `week-chart.tsx` | Tide `/patient/care/trends`                                                       | Merge / Merge | N1     | §5.7 chart cards on Today and the Readings page; one chart model in `patient-core/care-trends.ts`                                              |
| 5.5  | Move and eat: minutes walked, water, plate guide                              | `care/activity.tsx`                                    | Tide `/patient/care/move`                                                         | Port / Port   | N1     | **Wellness**, shared by both modes (M-list "shared"). **Ask A4**                                                                               |
| 5.6  | Mood: faces on Home; week, month and year                                     | `mood.tsx`, Home                                       | Tide `/patient/mood`                                                              | Port / Port   | N1, N5 | **Wellness**. Not a clinical reading; no alerting                                                                                              |
| 5.7  | Lab tests ordered, no values (phone)                                          | `care/labs.tsx`                                        | Tide `/patient/care/labs`; legacy `results/[reportId]` (values, `patientResults`) | Merge / Merge | N1, N3 | M12 free results, released after clinician review. The legacy result page (value, status word, range) is ported to both platforms              |
| 5.8  | Care team chat (`mobileChat` off)                                             | `care/chat.tsx`                                        | Tide `/patient/care/messages`                                                     | Merge / Merge | N1     | My care › Messages (§5.8), hours shown, "Not for emergencies" with Help                                                                        |
| 5.9  | My conditions, allergies, family history                                      | `history.tsx`                                          | Tide `/patient/me/{conditions,allergies,family}`                                  | Keep / Keep   | N3     | Me › My health; allergies and conditions feed the card's back (medical ID)                                                                     |
| 5.10 | Patient food products (`patient_food_products`)                               | `care-more/product-parts.tsx`                          | —                                                                                 | Port / New    | N3     | Wellness › Eat. Kept so the data is not orphaned                                                                                               |

## 6. Me

| #   | Feature today                                  | Phone                                                   | Web                       | Verdict P / W | Needs | Becomes                                                                               |
| --- | ---------------------------------------------- | ------------------------------------------------------- | ------------------------- | ------------- | ----- | ------------------------------------------------------------------------------------- |
| 6.1 | Health card on Me and Home                     | `features/home/health-card.tsx`, `tide/health-card.tsx` | Tide Me                   | Merge / Merge | N2    | M10 membership card: front tier, name, number; back medical ID with a short-lived QR  |
| 6.2 | My places (home first, map pin `mobileMapPin`) | `places/*`                                              | Tide `/patient/me/places` | Keep / Keep   | N1    | Me › Places; used by Directions                                                       |
| 6.3 | Hospitals (my hospital list)                   | —                                                       | Tide `/patient/hospitals` | — / Keep      | N1    | Me › My hospitals. Phone gap: recommend porting                                       |
| 6.4 | Phone settings, privacy                        | `(tabs)/me.tsx`                                         | legacy `settings` → Me    | Merge / Merge | N4    | §5.9 settings: texts as well as alerts, bigger text, sharing, family helper, language |
| 6.5 | SMS consent (`pt-set-sms-consent`)             | Me                                                      | Me                        | Keep / Keep   | N3    | Settings › Texts                                                                      |

## 7. New (canvas only)

| #    | Feature                                                   | Phone                 | Web | From                                                      |
| ---- | --------------------------------------------------------- | --------------------- | --- | --------------------------------------------------------- |
| 7.1  | Today hero ladder and the plan as a day                   | New                   | New | Boards 5, 20; `patient-core/care-day.ts`, `dose-slots.ts` |
| 7.2  | Plan page: timeline, week's medicines, goals              | New                   | New | Board 21                                                  |
| 7.3  | My care: team grid, checks this year                      | New                   | New | Boards 8, 23                                              |
| 7.4  | Pay the booking fee, receipts, top-up, pay ahead, refunds | New                   | New | Canvas B boards; §5.4                                     |
| 7.5  | Questions for the doctor                                  | New                   | New | Board 18; §5.5                                            |
| 7.6  | Called banner                                             | Merge (ticket status) | New | Boards 2, 18                                              |
| 7.7  | Membership tiers, Plus plans, trial, reveal               | New                   | New | Boards 5 (Me), 25                                         |
| 7.8  | My care pulse on the tab                                  | New                   | New | M9                                                        |
| 7.9  | Widgets, lock screen, Live Activity                       | New                   | —   | Board 15                                                  |
| 7.10 | Visits calendar coloured by person                        | New                   | New | Board 19; `patient-core/visits-calendar.ts` exists        |

## 8. Drop

Nothing is dropped. `renames.json` holds the moves (old → new place), not removals.

## 9. Hidden behaviour carried forward

- **Offline queue with client keys:** readings and dose ticks (`patient-core/log.ts`), kept as they are; dedupe test S18.
- **Last-good caches:** these keep "last 10 tickets" and add Today, plan and medical ID (MR13).
- **Background refresh and permission prompts:** as today (`mobile/src/lib/push.ts`, `features/location-share`). The exact timing is checked at Step 4 against S10. Live Activity and push carry "Called" (S28).
- **Error, empty and first-run states:** each screen keeps its own; board 14 (first day) is reference only.
- **Flags:** `mobileClinicalData` overlaps with `careMode` (**Ask A5**); `mobileChat` is folded into `careMode`; `mobilePayments` keeps its name, gating the real provider only; `mobilePhoneOtp`, `mobileQrSignIn` and `mobileMapPin` are unchanged.

## 10. Where the canvases do not fit the data

- **Fees:** only from the engine's fee resolution. Canvas B's assumed UGX 5,000 file fee shows only if the hospital publishes one.
- **Medicines:** the canvas shows plan medicines only. Patients also have patient-entered medicines and pharmacy hand-overs (5.2); all three show, each labelled by source.
- **Results:** the canvas shows results released by a named clinician. Names need consent (MR8): show the role until consent exists.
- **Household:** the canvas shows it as Plus Family. Today the booking agents feature is free (3.11, A3).
- **Sugar timing:** `personal_health_logs` has no meal-timing column. It is an engine gap (Step 2).

## 11. Phone and web gaps

| Gap                                                 | Recommendation                                 |
| --------------------------------------------------- | ---------------------------------------------- |
| Web has no offline                                  | An offline banner and a kept draft only (MR13) |
| Phone has no hospitals list (6.3)                   | Port to Me                                     |
| Phone shows no result values; legacy web does (5.7) | Port the result page to both                   |
| Web has no location share (4.6)                     | None; say so in Help                           |
| Widgets are phone only                              | As the prompt says (M13)                       |

## 12. Ask items for STOP 1

| #   | Question                                                                  | Recommendation                                                                                                                    |
| --- | ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| A1  | Keep the + button (D-MR-12)? There is no analytics evidence in the repo   | Keep: canvas s13 draws it, and it is the two-tap path for readings and doses                                                      |
| A2  | Deep-link scheme                                                          | Add `tether://`, keep `medsync://` as an alias forever (links in old SMS)                                                         |
| A3  | Booking for household members is free today; D-MR-08 makes it Plus Family | Keep booking for others free (N4, "the son with the only smartphone"); Plus Family adds the shared calendar and paying for others |
| A4  | Where self-logging (water, walking, mood, food) lives                     | Wellness, shared by both modes (Visit-mode Me and Care-mode Plan); readings and doses stay in Care                                |
| A5  | `mobileClinicalData` vs `careMode`                                        | `careMode` replaces it; one flag, one gate (MR11)                                                                                 |
