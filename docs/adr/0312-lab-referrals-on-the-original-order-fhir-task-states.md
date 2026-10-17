# ADR 0312 — Referrals belong to the original order; the status model is FHIR R4 Task

**Status:** Accepted — 2026-10-17 (owner, also the CSO, signing Lab Phase 4 [GATE A](../lab/phase-4/gate-a-proposal.md) as recommended). Built on `feat/lab-connect-outward` behind `labReferral` / `labExchange`; migrations 0150–0153 are GATED and owner-applied.

## Context

A referred test is still the doctor's original order. Paper, partners' systems and (one day) national systems all report on the same specimen's journey, in different words and out of order.

## Decision

1. A referral is a row on the original order and specimen (`lab_referrals`), created at **Add to manifest** from To refer, one per specimen per destination; a second destination needs an aliquot, a child specimen with its own lab number (RF-2).
2. Its state is a projection of append-only `lab_referral_events`, mapped to FHIR R4 `Task.status` by the RF-3 table (`lib/lab/referral.ts`).
3. **EX-7:** events are taken in arrival order; an event applies only if its event time is later than the last applied event's. An earlier-dated status is stored and shown, never applied.
4. Overdue is computed from the partner's signed stated turnaround in Kampala working days and never stored; with none stated, a referral is never overdue.

## Consequences

The doctor's order line reads the referral's words; the lab's Referrals page, the tracker and HMIS 10.4 read the same events. Out-of-order updates cannot move a referral backwards.
