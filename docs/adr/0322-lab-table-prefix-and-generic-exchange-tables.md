# ADR 0322 — The `lab_` prefix for the lab's tables; `exchange_` stays generic

**Status:** Accepted — 2026-10-17 (owner, also the CSO, signing Lab Phase 4 [GATE A](../lab/phase-4/gate-a-proposal.md) as recommended). Built on `feat/lab-connect-outward` behind `labReferral` / `labExchange`; migrations 0150–0153 are GATED and owner-applied.

## Context

`referrals` and `partners` would collide in meaning with patient referrals that already exist.

## Decision

1. The lab's tables are `lab_referrals`, `lab_partners`, `lab_manifests` and so on.
2. The exchange tables stay `exchange_*` because pharmacy, radiology and a national HIE will reuse them (E-LAB4-01).

## Consequences

None beyond naming.
