# Patient app v2 · GATE A proposal (Step 1)

Status: **draft, unsigned.** Read with `feature-matrix.md` (verdicts) and `step0-revisit.md` (what exists).

## 1. Route and screen maps, old to new

**Web.** v2 is built over the Tide web (`app/pw`, served at `/patient` through `lib/patient-web/routes.ts`). The legacy `app/patient` pages already 308 through `MOVED`; they are deleted at Step 12, and the `MOVED` list is kept.

| New page (URL)                                                                                               | Mode  | Replaces                                                   | Redirects kept                                                |
| ------------------------------------------------------------------------------------------------------------ | ----- | ---------------------------------------------------------- | ------------------------------------------------------------- | --- | ---- |
| `/patient` Home                                                                                              | Visit | Tide Home                                                  | `/patient/menu`, `/patient/settings` → `/patient/me` (exists) |
| `/patient` Today                                                                                             | Care  | Tide `/patient/care`                                       | `/patient/care` → `/patient` in Care mode                     |
| `/patient/book` (W1, one page)                                                                               | both  | `/patient/book`, `/book/today`, `/book/day`, `/book/wrong` | the three subpaths → `/patient/book?door=today                | day | why` |
| `/patient/visits`                                                                                            | both  | Tide visits                                                | `/patient/appointments`, `/patient/queue*` (exist)            |
| `/patient/visits/[id]` the day of the visit                                                                  | both  | Tide visit                                                 | —                                                             |
| `/patient/visits/[id]/receipt`                                                                               | both  | new                                                        | —                                                             |
| `/patient/plan`                                                                                              | Care  | `/patient/care/medicines`                                  | → `/patient/plan`                                             |
| `/patient/readings`                                                                                          | Care  | `/patient/care/readings`, `/care/trends`                   | both → `/patient/readings`                                    |
| `/patient/my-care`                                                                                           | Care  | `/patient/care/messages`                                   | → `/patient/my-care`                                          |
| `/patient/results`, `/patient/results/[id]`                                                                  | both  | `/patient/care/labs`, legacy result page                   | `/patient/care/labs` → `/patient/results`                     |
| `/patient/wellness`                                                                                          | both  | `/patient/mood`, `/patient/care/move`                      | both → `/patient/wellness` (Ask A4)                           |
| `/patient/me` and `/patient/me/*`                                                                            | both  | unchanged                                                  | —                                                             |
| `/patient/me/plus`                                                                                           | both  | new                                                        | —                                                             |
| `/patient/notifications`, `/patient/consent`, `/patient/hospitals` → `/patient/me/hospitals`, `/emergency/*` | —     | unchanged                                                  | `/patient/hospitals` → `/patient/me/hospitals`                |

**Phone** (Expo Router, `mobile/src/app/(app)`). Tabs per mode: Visit `index` (Home), `book`, `visits`, `me`; Care `index` (Today), `plan`, `my-care`, `me`. Pushed: `visits/[id]`, `visits/[id]/receipt`, `readings`, `results/[id]`, `wellness`, `me/plus`; the existing pushed screens are mapped in `tests/parity/patient-app/renames.json`. Deep links: `tether://` added beside `medsync://` (A2); every web URL above has a phone path of the same shape.

## 2. Shared components (built once per platform from one spec)

| Component                                              | Web from                                       | Phone from                                                  |
| ------------------------------------------------------ | ---------------------------------------------- | ----------------------------------------------------------- |
| Nav pill and top bar                                   | `components/tide/shell.tsx`                    | `mobile/src/components/tide/tide-nav.tsx`, `ui/tab-bar.tsx` |
| Header, Help                                           | `shell.tsx` `PageHeader`                       | `tide/screen.tsx`                                           |
| Sheet or dialog, toast                                 | `tide/dialog-impl.tsx`                         | `tide/sheet.tsx`, `features/care-more/use-toast.tsx`        |
| Card, states (empty, error, offline)                   | `tide/kit.tsx`                                 | `tide/primitives.tsx`, `skeleton.tsx`                       |
| Ticket                                                 | `tide/visits-ticket.tsx`                       | `tide/ticket.tsx`                                           |
| Stage strip and list                                   | `tide/cascade.tsx`                             | `tide/cascade.tsx`                                          |
| Payment line, pay-choice option, receipt               | new                                            | new                                                         |
| Chart (card and large), sparkline                      | `tide/care-week-chart.tsx`                     | `tide/charts.tsx`, `features/care/week-chart.tsx`           |
| Reading card, Add a reading                            | `tide/reading-dialog.tsx`, `reading-check.tsx` | `features/home/reading-sheet.tsx`                           |
| Plan timeline, dose row                                | `tide/care-ring.tsx` (ring)                    | `features/home/medicine-sheet.tsx`                          |
| Membership card (front, back, flip), tier card, reveal | `tide/me-health-card.tsx`                      | `tide/health-card.tsx`                                      |

**Shared logic in `packages/patient-core`:**

- Exists: `care-day`, `dose-slots`, `care-trends`, `readings`, `fees`, `visits`, `visits-calendar`, `help-sos`.
- New: `hero-ladder`, `week-change`, `stage-map`, `payment-state`, `refund-eligibility`, `danger-rules`, `plausibility`.

## 3. Engine gaps (Step 2, sandbox payments only)

Migrations from 0299, every table with RLS, audit, Zod and tests.

| Gap                      | Proposal                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Care-mode switch         | `patient_care_enrolment` (patient, hospital, programme, from, to), written only by the hospital; read model `patient_mode`                                                                                                                                                                                                                                                                                                                                                                                                                |
| Care plan read model     | `care_plan_version` (items, times, targets with who set them, check intervals), versioned, from the doctor's plan                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Readings                 | Add `meal_timing` to readings; `client_key` unique per patient                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Dose events              | `dose_event` (taken, skipped with reason, snoozed), no amounts, `client_key`                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Danger rules             | Signed versioned rule file run by `patient-core` and an Edge Function; S2 identical-output test                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Care team, messages      | `care_team_member` (role, first contact, consent), `care_thread`, `care_message` (read state, hours)                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Checks                   | Due dates derived from plan intervals (view)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Membership               | `membership` (tier, trial, period, status); `entitlement_check()` on the server; MR9 enumeration                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Questions for the doctor | `visit_question` (text, ticked); RLS lets the triage nurse and doctor of that visit read it, not the desk                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Widget feed              | A PHI-light snapshot function                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| **Payments**             | `bill`, `bill_item`, `payment_intent` (idempotency key unique), `payment_callback` (raw, verified flag, processed once), `receipt` (per-hospital counter, EFRIS fields empty), `refund_request`; view `payment_status`. Edge Functions `pt-pay-intent`, `pt-refund-request`, `ha-refund-decide`; the provider callback is a Next route (`/api/pay/callback/<provider>/<secret>`). Provider adapter `requestToPay`, `getStatus`, `refund`, `verifyCallback`, with a **sandbox adapter** only. No balance or wallet column anywhere (guard) |

## 4. Strings (`content/patient-app/`, all `draft`)

| File            | Covers                                                                                                          |
| --------------- | --------------------------------------------------------------------------------------------------------------- |
| `payments.ts`   | Pay choice, prompt states, payment line, chips, bill on the day, top-up, refund tracker, receipt, announcements |
| `visit.ts`      | Ticket, quick actions, stages, Called, Questions for the doctor, Done                                           |
| `membership.ts` | Card, medical ID back, tiers, plans, trial, settings                                                            |
| `sms.ts`        | 9 SMS templates, with a confidential booking variant                                                            |

SMS lengths at the longest fill (GSM-7 checked):

| Template           | Characters |
| ------------------ | ---------- |
| booked             | 148        |
| bookedConfidential | 120        |
| payPrompt          | 104        |
| paid               | 122        |
| paymentFailed      | 110        |
| topUp              | 131        |
| refundSent         | 73         |
| refundWaiting      | 88         |
| called             | 65         |

Existing strings in `content/patient/*.ts` are reused where the feature is kept. Danger-flow and targets wording is clinical, so it is written at Step 2 for the CSO, from signed content only.

## 5. Payment provider shortlist (D-PA-01)

Both are licensed by the Bank of Uganda as Payment System Operators and route to MTN MoMo and Airtel Money through one integration.

|                                                                                            | Flutterwave                                       | Pesapal                                     |
| ------------------------------------------------------------------------------------------ | ------------------------------------------------- | ------------------------------------------- |
| Bank of Uganda licence                                                                     | Payment System Operator (reported Aug 2024)       | Payment System Operator (reported Jun 2022) |
| Fees, settlement time to the hospital's own account, refund API, sandbox, callback signing | **to confirm from their documentation and sales** | **to confirm**                              |

Reserves: DPO Pay (PSP licence, Jun 2024) and Yo! Payments.

Confirm all four against the Bank of Uganda's list of licensed PSPs and PSOs (15 Feb 2026, bou.or.ug) before talks. No fee figures are given here because none were verified.

## 6. GATE A decisions (Section 12) · signature block

Owner, 16 Nov: "go with your recommendations". That is recorded as intent; each line still needs Fadhul's signature.

| #       | Decision                 | Recommendation (from the prompt unless noted)                                      | Signed                        |
| ------- | ------------------------ | ---------------------------------------------------------------------------------- | ----------------------------- |
| D-MR-01 | Care-mode switch         | By hospital enrolment                                                              | ✓ signed in chat, 16 Nov 2026 |
| D-MR-02 | App badge                | System badge; red only for Help and danger                                         | ✓ signed in chat, 16 Nov 2026 |
| D-MR-03 | Danger content           | As §5.8, signed before Care mode ships                                             | ✓ signed in chat, 16 Nov 2026 |
| D-MR-04 | Help placement           | Full pill on Home, Today and danger; mini elsewhere; web top bar                   | ✓ signed in chat, 16 Nov 2026 |
| D-MR-05 | Names on widgets         | Hidden by default                                                                  | ✓ signed in chat, 16 Nov 2026 |
| D-MR-06 | Who answers messages     | Programme nurse, weekdays 8 am to 5 pm; auto-reply to Help out of hours            | ✓ signed in chat, 16 Nov 2026 |
| D-MR-07 | Results                  | After clinician review, free                                                       | ✓ signed in chat, 16 Nov 2026 |
| D-MR-08 | Plus entitlements        | As the prompt, **except booking for household members stays free** (A3)            | ✓ signed in chat, 16 Nov 2026 |
| D-MR-09 | Trial                    | 30 days, no card, no charge, reminder 3 days before                                | ✓ signed in chat, 16 Nov 2026 |
| D-MR-10 | Prices                   | From the server                                                                    | ✓ signed in chat, 16 Nov 2026 |
| D-MR-11 | Targets                  | HEARTS defaults; personal from the plan; show who set them                         | ✓ signed in chat, 16 Nov 2026 |
| D-MR-12 | + button                 | Keep (A1)                                                                          | ✓ signed in chat, 16 Nov 2026 |
| D-MR-13 | Boards 9–14              | Reference only                                                                     | ✓ signed in chat, 16 Nov 2026 |
| D-MR-14 | Language                 | English at launch                                                                  | ✓ signed in chat, 16 Nov 2026 |
| D-PA-01 | Provider                 | Shortlist Flutterwave and Pesapal (§5); no real money until signed                 | ✓ signed in chat, 16 Nov 2026 |
| D-PA-02 | Who contracts            | The hospital, as merchant                                                          | ✓ signed in chat, 16 Nov 2026 |
| D-PA-03 | Default pay choice       | MoMo when a saved number exists, else at the hospital                              | ✓ signed in chat, 16 Nov 2026 |
| D-PA-04 | Provider charges         | The hospital's                                                                     | ✓ signed in chat, 16 Nov 2026 |
| D-PA-05 | Refund approver          | The accounts supervisor, never the requester                                       | ✓ signed in chat, 16 Nov 2026 |
| D-PA-06 | Automatic refunds        | When the hospital cancels                                                          | ✓ signed in chat, 16 Nov 2026 |
| D-PA-07 | Paid, then didn't come   | **Owner's own choice.** Recommendation: credit for 30 days, then refund on request | ✓ signed in chat, 16 Nov 2026 |
| D-PA-08 | EFRIS                    | Fields only                                                                        | ✓ signed in chat, 16 Nov 2026 |
| D-PA-09 | Pay for someone else     | Plus Family household at launch                                                    | ✓ signed in chat, 16 Nov 2026 |
| D-PA-10 | Questions for the doctor | Triage nurse and doctor of that visit; not the desk                                | ✓ signed in chat, 16 Nov 2026 |
| D-PA-11 | Web care mode            | Same Gate CG                                                                       | ✓ signed in chat, 16 Nov 2026 |
| A2      | Deep links               | Add `tether://`, keep `medsync://`                                                 | ✓ signed in chat, 16 Nov 2026 |
| A4      | Self-logging             | Wellness, shared by both modes                                                     | ✓ signed in chat, 16 Nov 2026 |
| A5      | Flags                    | `careMode` replaces `mobileClinicalData`                                           | ✓ signed in chat, 16 Nov 2026 |

Signed by: **\*\***\_\_**\*\*** (CSO) · Date: **\_\_**

## 7. Test plan

| Check                                                     | Laws                    | Lane                                                                               | Step               |
| --------------------------------------------------------- | ----------------------- | ---------------------------------------------------------------------------------- | ------------------ |
| S1 RLS probes: own, household payer, helper, cross-tenant | MR12, PA5               | Vitest (PGlite lane where available)                                               | 2                  |
| S2 danger rules identical, core vs server                 | MR10                    | Vitest                                                                             | 2                  |
| S3 entitlement enumeration                                | MR9                     | Vitest                                                                             | 2                  |
| S4 callbacks: duplicate, late, out-of-order, forged       | PA4                     | Vitest                                                                             | 2                  |
| S5 SMS ≤ 160 GSM-7 and confidential variants              | MR7, MR12               | Vitest over `content/patient-app/sms.ts`                                           | 2                  |
| S6 Help on every route                                    | MR6                     | Jest render crawl; Vitest route crawl                                              | 3                  |
| S7 colour laws                                            | MR5                     | token and class scan                                                               | 3                  |
| S8 core parity fixture                                    | §6                      | one fixture through both apps                                                      | 3                  |
| S9–S28                                                    | as the prompt, per step | Jest, Vitest; Playwright for web widths and axe (S12) once a seeded fixture exists | 4–11               |
| Guards (Appendix C)                                       | all                     | static scans in Vitest                                                             | 3, then every STOP |

**Tooling gap:** `@playwright/test` is not a dependency, and it is needed for S11, S12 and web screenshots. It will be flagged with size and licence before it is added (§0.9).

## 8. ADR drafts (0516–0524; written as files once signed)

| ADR  | Title                                    | Decision                                                                                       |
| ---- | ---------------------------------------- | ---------------------------------------------------------------------------------------------- |
| 0516 | One patient app, two platforms, one core | Phone (Expo) and web (Tide `app/pw`) share `patient-core`; the legacy web goes at Step 12      |
| 0517 | Two modes, server-decided                | Visit mode for all; Care mode by hospital enrolment; leaving keeps data                        |
| 0518 | The Today priority ladder                | One function in `patient-core`, six rungs, tested exhaustively                                 |
| 0519 | Plus never buys care                     | MR9 list enforced by a server check and an enumeration test                                    |
| 0520 | The ticket: one design, two layouts      | Phone vertical tear-off; web sideways, vertical ≤ 760 px                                       |
| 0521 | Tether never holds patient money         | Hospital is the merchant; provider adapter with a sandbox; `mobilePayments` gates the real one |
| 0522 | Exactly-once payments                    | Idempotency keys, verified callbacks, one transaction, per-hospital receipt numbers            |
| 0523 | Refunds need a second person             | Accounts supervisor approves; hospital cancellations refund automatically                      |
| 0524 | Widget privacy defaults                  | Names hidden, no confidential clinics, no Help                                                 |

## 9. Disagreements with the prompt (repo wins)

- **ADR numbers:** Apple HIG is ADR **0515**, not 0471.
- **Ticket:** there is no desk `Ticket` component. The patient tickets are `components/tide/visits-ticket.tsx` (web) and `mobile/src/components/tide/ticket.tsx`. The content model is defined in `patient-core` at Step 3, and the desk reads the same one.
- **Missing prompts:** `PROMPT-PATIENT-BOOKING.md` and `PROMPT-MOBILE-REWORK.md` are not in the repo.
- **Wellness** is not an existing feature. It is proposed here as the home for mood, move and eat (A4).

## 10. Owner decision, 16 Nov 2026

In chat: "go with your recommendations, start step 2". Every recommendation in §6 is the owner's decision, including A1–A5 and the D-PA-07 recommendation (30-day credit, then a refund on request). The CSO signature line above stays for the formal sign-off; no `*_COPY_STATUS` was changed.

ADR numbering moved: the payment decisions were written first, as **0516** (Tether never holds patient money), **0517** (exactly-once payments) and **0518** (refunds need a second person). The other six ADRs in §8 take the next free numbers when their steps build them.

## 11. CSO signature, 16 Nov 2026

Fadhul (CSO), in chat: "sign as recommended". Signed:

- the whole §6 block as recommended;
- A1–A5, with `careMode` off in production until Gate CG;
- D-PA-07: a credit for another booking within 30 days, then a refund on request;
- the feature matrix and `renames.json` as proposed.

**Not signed by this:**

- the draft strings (every `*_COPY_STATUS` stays `draft`);
- Gate CG;
- the danger content and targets;
- D-PA-01 (no real money; provider fees, refunds and signing still to be verified from the provider's documentation).
