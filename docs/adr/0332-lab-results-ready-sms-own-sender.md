# ADR 0332 — The results-ready SMS has its own sender, a content-free template and fixed hours

**Status:** Accepted — 17 Oct 2026 (owner, also the CSO, signing Lab Phase 5 [GATE A](../lab/phase-5/gate-a-proposal.md) as recommended). Built on `feat/lab-beyond-lis`; migrations 0154–0157 are GATED and owner-applied.

## Context

A text saying results are ready helps patients come back, but its content and timing can reveal a condition, and the booking dispatcher is push-first and gated on booking consent.

## Decision

1. `results_ready` rows are excluded from the booking dispatcher and handled by `lib/notify/results-ready-store.ts` on the lab's every-minute tick, outside every release transaction (PS-6).
2. A message is queued only when a result becomes visible through the one gate, in a group the signed table allows SMS for, to a recipient with `results_sms` consent; for a child, the guardian (PS-2, PS-5). One per recipient per 60-minute window (PS-3).
3. Only the hospital's signed template is sent; it names the hospital and nothing else, has no link, carries STOP, and fits one GSM-7 part (PS-1, PS-4). Messages go 06:00 to 19:00 Kampala time only; later ones wait.
4. STOP puts the phone on `sms_opt_outs` and revokes `results_sms`; consent and STOP are checked at send. The body is never stored; failures retry with backoff, five attempts.

## Consequences

Lanes S39 to S43. A per-hospital sender ID waits for the provider's registration (PS-7).
