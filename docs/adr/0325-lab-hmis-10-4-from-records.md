# ADR 0325 — HMIS 10.4 from records

**Status:** Accepted — 2026-10-17 (owner, also the CSO, signing Lab Phase 4 [GATE A](../lab/phase-4/gate-a-proposal.md) as recommended). Built on `feat/lab-connect-outward` behind `labReferral` / `labExchange`; migrations 0150–0153 are GATED and owner-applied.

## Context

All three HMIS 105 section 10.4 cells were typed by hand (STOP 0 item 9).

## Decision

1. Number referred, average turnaround and pending come from referrals, with the referral ids as each cell's sources, from the month the laboratory lead declares in the signed `referral_ops.hmis104RecordsFrom`; earlier months keep the manual cells, and a covered month refuses hand entry.
2. Turnaround follows the Division of Health Information's definition when it is confirmed (Q14); until then the computed figure is labelled.

## Consequences

HM-16 has no flag history to read, hence the declared month.
