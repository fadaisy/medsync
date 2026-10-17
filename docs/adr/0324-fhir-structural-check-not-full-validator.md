# ADR 0324 — FHIR output is checked structurally, not by a full R4 validator

**Status:** Accepted — 2026-10-17 (owner, also the CSO, signing Lab Phase 4 [GATE A](../lab/phase-4/gate-a-proposal.md) as recommended). Built on `feat/lab-connect-outward` behind `labReferral` / `labExchange`; migrations 0150–0153 are GATED and owner-applied.

## Context

A full R4 validator is a new dependency.

## Decision

1. `lib/emr/fhir.ts` gains `Task` and a referral `transaction` Bundle (`referralBundle`), with a structural check of what we emit (`checkR4Structure`: required elements, cardinality, our value sets).
2. Inbound messages that parse are accepted and flagged when not base-conformant. This is not R4 conformance, and the ADR says so.

## Consequences

A partner's test environment (Step 9) is the real check.
