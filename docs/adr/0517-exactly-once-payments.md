# 0517 — Exactly-once payments: idempotency keys, verified callbacks, one transaction

Date: 2026-11-16 · Status: accepted (owner, in chat; GATE A signature pending)

## Decision

- **Retries:** every payment attempt carries a client idempotency key, unique in `payment_intents`. A retry returns the same attempt.
- **Callbacks:** each provider event is recorded once (`payment_callbacks` unique on provider and event id). Events must be verified: a signature over the raw body, compared in constant time, or a status check with the provider. Forged bodies are refused and never stored.
- **One transaction:** `pay_apply_event` locks the attempt, then marks it paid, updates the bill and issues the receipt together.
  - A duplicate, late, out-of-order or wrong-amount event never makes a second receipt.
  - Receipt numbers come from a per-hospital counter: no gaps, no duplicates.
- **Prompts nobody answers** expire after 10 minutes as "Nothing was taken".

## Why

Mobile Money callbacks are retried and can arrive late or out of order. A second receipt, or a "paid" nobody paid, would cost patients money or trust. Tests S4, S13 and S14 run these cases on real Postgres.
