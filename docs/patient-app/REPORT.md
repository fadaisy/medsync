# Patient app v2 · Report (Step 12, draft)

**Status: draft for the owner and the CSO.** Branch `feat/patient-app-v2`; nothing merged, deployed or applied. The v2 flags are off and the old screens and routes are all still in place: the cutover (flags on for the pilot hospital for 5 days, then removing old screens while keeping deep links and redirects) is the owner's, after the pilot.

## 1. What was built

| Step | What                                                                                                           | Commit           |
| ---- | -------------------------------------------------------------------------------------------------------------- | ---------------- |
| 0–1  | Revisit, feature matrix, Gate A (signed), amendment 1 (signed: BP 180/110, red danger card)                    | earlier          |
| 2    | Payments engine (sandbox), membership and questions, care mode engine; migrations 0299–0301                    | earlier          |
| 3    | Tokens, shared core (`packages/patient-core`), web and phone kits                                              | earlier          |
| 4    | Visit mode, phone                                                                                              | fc57f21          |
| 5    | Visit mode, web (W1–W4)                                                                                        | 7dc67cc          |
| 6    | Booking payments, both platforms, sandbox; the desk's side (`ha-pay-desk`); 0302                               | 0928796          |
| 7    | Care mode, phone, part 1 (Today, plan, readings, medicines; offline once)                                      | 58e1667          |
| 8    | Care mode, phone, part 2 (My care, messages, Wellness, danger flows)                                           | 37e758d          |
| 9    | Care mode, web (Today, Plan, My care, danger in place)                                                         | 79a51c4          |
| 10   | Me, membership card, Plus (trial, pay through the engine); 0303, 0304                                          | f63695a, 3424460 |
| 11   | Widgets and Live Activities: **deferred by the owner** (16 Nov 2026); options kept in `step11-dependencies.md` | 0cdbaf3          |
| 12   | This report and the two parity reports (draft)                                                                 | this commit      |

## 2. Success checks

| Check                           | Result        | Evidence                                                                                                 |
| ------------------------------- | ------------- | -------------------------------------------------------------------------------------------------------- |
| S1 RLS probes                   | Pass          | `tests/patient-app-db/*` (PGlite): own, household payer, helper, cross-tenant; staff now need MFA (0304) |
| S2 danger rules identical       | Pass          | `tests/patient-app/danger-parity.test.ts`                                                                |
| S3 MR9 enumeration              | Pass          | `membership-questions.test.ts`                                                                           |
| S4 callbacks                    | Pass          | `payments.test.ts`: duplicate, late, out-of-order, forged                                                |
| S5 templates                    | Pass          | Step 2 SMS tests                                                                                         |
| S6 Help on every route          | Pass          | help-crawl, both apps                                                                                    |
| S7 colour laws                  | Pass          | `colour-laws.test.ts`, `tests/patient-web/guards.test.ts` (one new amber file: `v2-check-tag.tsx`)       |
| S8 core parity                  | Pass          | `core-parity.test.ts`                                                                                    |
| S9 booking tests unchanged      | Pass          | full suites                                                                                              |
| S10 every Keep and Port present | Draft         | `parity-phone.md`, `parity-web.md`: nothing lost (old screens serve); v2 gaps listed                     |
| S11 ≤ 7 to a booking            | Pass          | 3 clicks on Book, about 5 from Home (web, fixtures)                                                      |
| S12 axe                         | Pass          | 1440, 1024, 834, 390 × both themes on every v2 web gallery screen                                        |
| S13 timed-out prompt            | Pass          | DB test; phone "Nothing was taken" path                                                                  |
| S14 one payment, one receipt    | Pass          | DB tests incl. counter and Plus                                                                          |
| S15 refunds                     | Pass          | DB tests                                                                                                 |
| S16 Paid within 5 s             | Pass (design) | desk reads `payment_status` every 5 s; DB test: desk and patient read identical rows                     |
| S17 ladder                      | Pass          | 32 combinations                                                                                          |
| S18 sync once                   | Pass          | phone outbox tests; PGlite client-key tests                                                              |
| S19 danger alerts when online   | Pass          | phone test: offline danger reading reaches `pt-care-reading` once online                                 |
| S20 names with consent          | Pass          | core and render tests                                                                                    |
| S21 charts                      | Pass          | browser check: focus and hover switch the day, gaps kept, summaries                                      |
| S22 + Log                       | Pass          | browser check                                                                                            |
| S23 sugar 3.2                   | Pass          | browser check                                                                                            |
| S24 short-lived QR              | Pass          | token tests (5 minutes, tamper, foreign key)                                                             |
| S25 trial, no charge            | Pass          | DB tests                                                                                                 |
| S26 MR9 unchanged by tier       | Pass          | DB tests                                                                                                 |
| S27, S28                        | Not attempted | widgets deferred                                                                                         |

Last full runs: web vitest 12,451 passed, 0 failed; phone jest 670 passed; patient-app PGlite lane 42 passed. The full EMR PGlite lane has 38 failures that are the same before and after this work (Drizzle parity on 14 older tables, rls-probes, pharmacy and others), none from this slice.

## 3. Budgets (§10)

Not measured in this session: phone time to interactive, cold start and added JS need a device build (EAS); web LCP, INP and first-load JS need a production build on the throttled profile; chart render and prompt p95 need the running stack. These are for the pilot build. Measured: Paid visible to the desk ≤ 5 s by design (5-second read).

## 4. For the owner

- **Apply migrations** in this branch's checkout: `cd <worktree of feat/patient-app-v2> && npm run db:migrate` — 0299, 0300, 0301, 0302, 0303, 0304 (all GATED).
- **Environment:** `MEDICAL_ID_TOKEN_SECRET` (32+ characters) for the QR; for the sandbox, `PAY_SANDBOX_ALLOWED=1` and `PAY_SANDBOX_SECRET`. Real money stays off (`mobilePayments`, `MOBILE_PAYMENTS`).
- **Money:** the provider (D-PA-01) and each hospital's merchant agreement; **Tether's own merchant agreement for Plus** (ADR 0523); D-PA-07 (paid, then didn't come) is still yours.
- **CSO:** the danger-flow words (drafts), including the 15-minute sugar recheck from the prompt (the old phone screen used 5); Gate CG, which keeps Care mode off on both platforms until signed (`GATE_CG_SIGNED`).
- **Strings:** every new string is a draft; no `*_COPY_STATUS` was changed.
- **Pilot:** turn on `appV2Mobile` and `appV2Web` for the pilot hospital for 5 days; then sign the parity reports, decide the gaps, and remove old screens (keeping redirects).

## 5. Known gaps (from the parity reports)

Per-mode navigation and header count; web Home v2; the v2 Readings page; Wellness on the web; settings (§5.9); the hospitals list on the phone; result values on both; medicines from three sources merged into v2; Plan goals; check done dates; "Called" wiring and push channels; new analytics events; `tether://`; the Tether splash; payment SMS (the dispatcher has no payment template); the My care pulse; widgets (deferred).
