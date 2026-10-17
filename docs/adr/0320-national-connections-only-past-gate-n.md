# ADR 0320 — National connections are built only past GATE N

**Status:** Accepted — 2026-10-17 (owner, also the CSO, signing Lab Phase 4 [GATE A](../lab/phase-4/gate-a-proposal.md) as recommended). Built on `feat/lab-connect-outward` behind `labReferral` / `labExchange`; migrations 0150–0153 are GATED and owner-applied.

## Context

No national system (IRRDS, ResTrack, A-LIS, the LDR) publishes an interface specification (research H1–H4).

## Decision

1. No national adapter exists until NHLDS or MoH gives, for that system, a written specification, a signed data-sharing agreement, a test environment and a named contact. No scraping and no endpoints from other projects.
2. Until then the paper form, the hub rider and typed entry with the printout attached are the path, and Connections says "Not connected" with what the lab does instead.

## Consequences

The letter to NHLDS is drafted for the hospital to send (`letter-to-nhlds.md`); `national-gap.md` records each system.
