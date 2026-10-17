# ADR 0313 — Manifests carry no patient names

**Status:** Accepted — 2026-10-17 (owner, also the CSO, signing Lab Phase 4 [GATE A](../lab/phase-4/gate-a-proposal.md) as recommended). Built on `feat/lab-connect-outward` behind `labReferral` / `labExchange`; migrations 0150–0153 are GATED and owner-applied.

## Context

A manifest travels with a courier or hub rider; anyone may read it.

## Decision

1. A manifest belongs to one partner and one transport and lists lab numbers, the partner's identifiers, specimen, containers, test and collected time only. Its number prints as Code 128 (ADR 0321).
2. A sealed manifest never changes (a forward-only state trigger); items are refused once sealed, for an outbreak referral, or for another partner. Every print is recorded and a reprint says "Copy".
3. A high-risk specimen never joins a manifest: it goes as an outbreak referral that records who was told (RF-7).

## Consequences

Patient details travel only on each request form inside the package (Appendix A footer). Restricted tests print as the partner's code (HZ-4-30).
