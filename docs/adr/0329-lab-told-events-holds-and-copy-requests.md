# ADR 0329 — Criticals need a told event; holds are per result, dated and reviewed; copy requests are never held

**Status:** Accepted — 17 Oct 2026 (owner, also the CSO, signing Lab Phase 5 [GATE A](../lab/phase-5/gate-a-proposal.md) as recommended). Built on `feat/lab-beyond-lis`; migrations 0154–0157 are GATED and owner-applied.

## Context

A critical result needs a conversation first. Therapeutic privilege (Patients' Charter Art. 10; Mental Health Act 2018 s.57(2)) allows a short delay for a single result, but the DPPA right of access (s.24) has no harm exception.

## Decision

1. "I have spoken to them" is an append-only `patient_told_events` row per report version, with how (in person, phone, guardian). A repeat critical needs its own (PR-4).
2. A hold is a `patient_hold_events` row: reason (`explain_in_person`, `harm_to_patient`) and an until-date no later than the signed maximum. An expired hold stays held and returns to the clinician; the CSO reads the month's holds (PR-7).
3. "Ask for a copy" opens `records_requests` due in 30 days; the records office sees held results flagged, never withheld (PR-15).
4. Only the result's responsible clinician (orderer, department cover, or the clinician it was forwarded to) records told, holds, releases a hold or writes a note to the patient.

## Consequences

Lanes S22, S24, S36. The doctor's results page carries "The patient sees it" with these acts in centred dialogs.
