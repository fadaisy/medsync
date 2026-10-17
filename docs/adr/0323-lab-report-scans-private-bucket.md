# ADR 0323 — Report scans: a private hospital-scoped bucket, with no virus scanning yet

**Status:** Accepted — 2026-10-17 (owner, also the CSO, signing Lab Phase 4 [GATE A](../lab/phase-4/gate-a-proposal.md) as recommended). Built on `feat/lab-connect-outward` behind `labReferral` / `labExchange`; migrations 0150–0153 are GATED and owner-applied.

## Context

Every typed result needs its source report attached (RB-6).

## Decision

1. A private `lab-report-scans` bucket with paths `{hospitalId}/{referralId}/{uuid}` and no client policies; uploads by a server-minted signed URL with a server re-check of size and type; reads through `/api/lab/report-scan/{reportId}` after an RLS-checked read, recorded.
2. No virus scanning exists; this is a residual risk (HZ-4-36), not solved.

## Consequences

Scans are append-only; a corrected report adds a scan.
