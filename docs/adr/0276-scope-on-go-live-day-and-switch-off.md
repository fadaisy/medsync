# ADR 0276 — Scope on go-live day, and what happens when a point is switched off

**Status:** Accepted — 2026-10-12 (owner, also the CSO), Pharmacy Phase 1 GATE A ([gate-a-proposal](../pharmacy/phase-1/gate-a-proposal.md) §14), LO-6, RD-3, D-PH1-38.

## Decision

1. Window prescriptions written since the hospital's first point went live are in scope; earlier ones only when a
   person brings them into the queue. Nothing from before go-live is closed in bulk.
2. A switched-off point returns to the Phase 0 read-only view; its open lines stay workable from any live point, and
   closing, confirming and correcting stay allowed there.

## Consequences

- The queue does not fill with old prescriptions on day one (HZ-PH1-39).

## Alternatives considered

- Importing every open prescription at go-live: rejected.
