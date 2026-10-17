# ADR 0326 — Live events for referrals and exchange come from the new event tables

**Status:** Accepted — 2026-10-17 (owner, also the CSO, signing Lab Phase 4 [GATE A](../lab/phase-4/gate-a-proposal.md) as recommended). Built on `feat/lab-connect-outward` behind `labReferral` / `labExchange`; migrations 0150–0153 are GATED and owner-applied.

## Context

LV-1's `referred` live event was never sent (STOP 0 item 6).

## Decision

1. The new event tables broadcast `referral_updated`, `match_waiting` and `message_dead` on `lab:{hospitalId}`, ids and counts only, no patient detail.
2. The Phase 2 trigger is left as it is.

## Consequences

Navigation counts update politely; no screen steals focus.
