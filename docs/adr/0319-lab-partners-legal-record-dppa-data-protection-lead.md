# ADR 0319 — Partners' legal records and field lists under the DPPA, and the data protection lead

**Status:** Accepted — 2026-10-17 (owner, also the CSO, signing Lab Phase 4 [GATE A](../lab/phase-4/gate-a-proposal.md) as recommended). Built on `feat/lab-connect-outward` behind `labReferral` / `labExchange`; migrations 0150–0153 are GATED and owner-applied.

## Context

Sending patient data to another laboratory is processing under the Data Protection and Privacy Act 2019.

## Decision

1. Each partner has a legal record (basis under s.7(2), agreement and review date, processor terms, cross-border safeguards, the hospital's PDPO registration, breach contact) and a field list, versioned and signed by the designated data protection lead (`hospital_designations`), never by the lab lead.
2. Diagnosis, phone and address are never on a field list. Electronic sending is refused without a complete signed record, and abroad without safeguards or the patient's consent.
3. The data protection lead and the IPC lead sign at their own desk, `/referral-governance`; the hospital admin names them.

## Consequences

PT-6: a passed review date or expired PDPO registration shows on Partners and Connections; sending continues (inform).
