# ADR 0334 — A delta decision carries across versions; referred and bedside results are flagged, not gated

**Status:** Accepted — 17 Oct 2026 (owner, also the CSO, signing Lab Phase 5 [GATE A](../lab/phase-5/gate-a-proposal.md) as recommended). Built on `feat/lab-beyond-lis`; migrations 0154–0157 are GATED and owner-applied.

## Context

A result can be saved several times before release, and the referred-result form (Phase 4) has no decision step.

## Decision

1. A decision is matched to (rule, component, current value) along the report's logical chain, so re-saving the same value does not ask again; a changed value asks again.
2. Referred and bedside results are evaluated and flagged on the order (DL-12), but only in-house lab releases are held (A20).

## Consequences

Fewer repeated questions without losing a changed value. Gating referred results waits for a decision step in the referred-result form.
