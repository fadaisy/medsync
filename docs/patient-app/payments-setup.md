# Setting up patient payments

What is built (Step 2, sandbox only), and what it takes to take real Mobile Money at the pilot hospital.

## What is built

| Part                                                                     | Where                                                                                                                                                          | State                                |
| ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| Tables, RLS, audit, the exactly-once engine                              | `supabase/migrations/0299_patient_payments.sql` (GATED)                                                                                                        | Built; 15 database tests             |
| Membership, entitlements, Plus prices, Questions for the doctor          | `supabase/migrations/0300_patient_membership_questions.sql` (GATED)                                                                                            | Built; 6 database tests              |
| Rules (chips, ticket line, refunds, signatures) and the sandbox provider | `supabase/functions/_shared/payments.ts`, re-exported by `packages/patient-core/payments.ts`                                                                   | Built; 12 unit tests                 |
| Provider choice                                                          | `supabase/functions/_shared/pay-provider.ts`                                                                                                                   | Sandbox only; real providers refused |
| Pay, refund request, refund decision                                     | Edge Functions `pt-pay-intent`, `pt-refund-request`, `ha-refund-decide`                                                                                        | Built; typechecked; not deployed     |
| Provider callback                                                        | `app/api/pay/callback/[provider]/[secret]/route.ts`: a Next route like the SMS and USSD webhooks, because Edge Functions always require a Supabase login token | Built; sandbox only                  |
| Screens                                                                  | Steps 6 (pay) and 10 (Plus)                                                                                                                                    | Not built                            |

**The sandbox moves no money**, so it runs only where `PAY_SANDBOX_ALLOWED=1` and `PAY_SANDBOX_SECRET` (16+ characters) are set, on both the app and the Edge Functions. It is never on where real patients pay. It decides the outcome by the phone number's last digit:

| Last digit    | Outcome                                     |
| ------------- | ------------------------------------------- |
| 0             | Not enough balance                          |
| 1             | Declined                                    |
| 9             | No answer, so it times out after 10 minutes |
| Anything else | Paid                                        |

## How the money moves (PA1)

The patient's Mobile Money → the licensed provider → **the hospital's own collection account**. Tether creates the bill, starts the phone prompt, verifies the provider's callback and issues the receipt. Tether has no wallet and stores no balance; a test checks this.

## Steps to take real payments

| #   | Step                                                                                                                                                                                                             | Who                                     | Blocks                                                       |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- | ------------------------------------------------------------ |
| 1   | Pick the provider: Flutterwave or Pesapal (both Bank of Uganda Payment System Operators; reserves DPO Pay and Yo!). Compare fees, settlement time to the hospital account, refund API, sandbox, callback signing | Owner (D-PA-01)                         | Step 3 onwards                                               |
| 2   | The **hospital** signs the merchant agreement and opens the collection account (D-PA-02). Provider charges are the hospital's (D-PA-04)                                                                          | Hospital                                | Live money                                                   |
| 3   | Build that provider's adapter (`requestToPay`, `getStatus`, `refund`, `verifyCallback`) to the same contract tests as the sandbox. It is a new code path, not a dependency: plain `fetch`                        | Claude                                  | Live money                                                   |
| 4   | Put the provider's keys on the Edge Functions' environment (never in a table or the app). Register the callback URL `https://<app>/api/pay/callback/<provider>/<PAY_WEBHOOK_SECRET>`                             | Owner                                   | Live money                                                   |
| 5   | Apply 0299 and 0300: `cd <worktree> && npm run db:migrate`                                                                                                                                                       | Owner                                   | Everything                                                   |
| 6   | Name the accounts supervisor: a `hospital_designations` row, role `accounts_supervisor` (D-PA-05)                                                                                                                | Hospital admin                          | Refunds                                                      |
| 7   | Set the hospital's `hospital_payment_accounts` row: provider, networks, refund cut-off (24 h default), `enabled`. Then `live` once tested                                                                        | Owner                                   | Each hospital                                                |
| 8   | Run the expiry sweep (`pay_expire_stale`) and the trial lapse (`membership_lapse`) on the daily cron                                                                                                             | Claude, at Step 6                       | Tidiness only: `pt-pay-intent` already expires stale prompts |
| 9   | Turn on `MOBILE_PAYMENTS=1` for the functions and the `mobilePayments` patient flag                                                                                                                              | Owner, after a sandbox → live rehearsal | Live money                                                   |
| 10  | EFRIS: the pilot's accountant says whether receipts need EFRIS numbers (D-PA-08). The fields exist and are empty                                                                                                 | Hospital                                | Nothing now                                                  |

## Prices

Visit fees come only from each hospital's published Clinics & schedule fee bands (`hospital_fee_bands`), snapshotted on the booking (`appointments.quoted_fee_ugx`); a bill can never hold another number. The demo figures in `packages/patient-core/fixtures/payments.json` follow these benchmarks:

| Fee               | Stand-in   | Benchmark                                       |
| ----------------- | ---------- | ----------------------------------------------- |
| Medical officer   | UGX 30,000 | The council's proposed general practitioner cap |
| Specialist        | UGX 50,000 | —                                               |
| Specialist top-up | UGX 20,000 | The difference between the two                  |

**Plus (draft, server-held, hidden until approved in `plus_prices`; ADR 0519):**

| Tier          | Monthly    | Quarterly  | Yearly (10 months) |
| ------------- | ---------- | ---------- | ------------------ |
| Plus Family   | UGX 5,000  | UGX 14,250 | UGX 50,000         |
| Plus Care     | UGX 10,000 | UGX 28,500 | UGX 100,000        |
| Family + Care | UGX 13,000 | UGX 37,050 | UGX 130,000        |

**Care programmes** are priced by each hospital from its team (`_shared/care-pricing.ts`), approved by a second person. Tether's share is recorded on the bill and paid by the provider's split, so the chosen provider must support split settlement in UGX. See `docs/patient-app/business-model.md` and ADR 0519.

**Open: who is the merchant for Plus?** It is Tether's own product, so its money goes to a Tether account, not a hospital's. This is not "holding patient money for a hospital", but it needs Tether's own merchant agreement.
