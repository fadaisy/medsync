# ADR 0520 — Plus is paid through the one engine, with Tether as the merchant

- **Status:** Accepted (Step 10, patient app v2). Real money waits on Tether's own merchant agreement.
- **Date:** 16 Nov 2026
- **Relates to:** ADR 0516 (the hospital is the merchant), 0517 (exactly-once callbacks, receipt counters), 0519 (Plus prices)

## Context

Visit and programme money belongs to a hospital: the hospital is the merchant and Tether never holds it (ADR 0516). Plus is different: it is Tether's own product. Its money goes to Tether, so it needs Tether's own merchant account. That agreement is still open (`docs/patient-app/payments-setup.md`). Step 10 must still let a patient pay for Plus, in the sandbox, without a second payment path.

## Decision

- A **membership bill** is a `bills` row with `kind = 'membership'` and **no hospital** (`hospital_id IS NULL`), carrying the tier and period it buys (migration 0303). A check keeps the rule both ways: a membership bill has no hospital, and every other bill has one.
- The amount is the newest **approved** price in force from `plus_prices` (`pay_bill_membership`). The client never sends an amount. A second tap pays the same open bill.
- Everything else is the **same engine** (0299): one intent per idempotency key, exactly-once callbacks, one receipt per payment. Tether's receipts number on **their own counter** (`tether_receipt_counter`), so a hospital's numbers never skip because of Plus.
- When a membership bill is paid, `pay_apply_event` starts or extends the period it bought. A trial in progress ends and becomes paid.
- `pt-plus` runs the trial (0300, no card, nothing charged when it ends) and the payment. The provider is `PLUS_PAY_PROVIDER`, default `sandbox`. A real provider throws until `MOBILE_PAYMENTS=1` **and** its adapter exists.
- **MR9 is unchanged.** Plus never buys care: `entitlement_allows` is untouched, and `pt-plus` touches no care, alert or result.

## Consequences

- One money model and one set of tests (`tests/patient-app-db/plus-payment.test.ts`).
- Going live needs: Tether's merchant agreement, the provider's adapter, Tether's account keys, and the owner applying 0303.
- Staff never read Plus bills: there is no hospital to be staff of.
