# 0516 — Tether never holds patient money: the hospital is the merchant, behind a provider adapter

Date: 2026-11-16 · Status: accepted (owner, in chat: "go with your recommendations"; CSO signature on GATE A pending)
Supersedes in part: ADR 0092's "no `payment_intents`, no provider, no webhook" and ADR 0094's deferral of payments.

## Decision

Patients may pay a visit's booking fee by Mobile Money, in the app or by a phone prompt (patient app v2 §5.4).

- **Money path:** the patient's Mobile Money goes through a Bank of Uganda licensed provider to the **hospital's own collection account**. The hospital is the merchant and signs with the provider (D-PA-02). Tether creates the bill, starts the prompt, verifies the callback and issues the receipt. There is no wallet and no stored balance; a test checks this.
- **Amounts:** only from the booking's fee snapshot (ADR 0092 fee resolution). The client never sends an amount.
- **Paying never blocks care (PA2):** booking needs no payment. A failure or a timeout leaves the booking as "Pays at the hospital". Emergency and Help never wait.
- **One seam:** `ProviderAdapter` (`requestToPay`, `getStatus`, `refund`, `verifyCallback`) in `supabase/functions/_shared/payments.ts`. A sandbox adapter serves development and tests.
- **Real providers** (Flutterwave or Pesapal, D-PA-01) are refused until `MOBILE_PAYMENTS=1` is set and their adapter is built.
- **One payment truth (PA5):** clients only read. Every write is a service-role SQL function (migration 0299).

## Why

The National Payment Systems Act 2020 licenses who may hold and move money. Keeping Tether out of the money flow keeps it outside that licence. ADR 0092's position that fees are information, never a gate, is kept: paying is a choice, never a condition.
