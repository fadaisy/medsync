# ADR 0273 — The location-neutral supply record

**Status:** Accepted — 2026-10-12 (owner, also the CSO), Pharmacy Phase 1 GATE A ([gate-a-proposal](../pharmacy/phase-1/gate-a-proposal.md) §14), SU-9, E-PH1-04.

## Decision

A supply names its dispensing point and the organisation that supplied as its own fields, and the model assumes
neither is the prescription's hospital, so partner pharmacies and the e-pharmacy can supply later without a migration.

## Consequences

- Today the supplying organisation is always the hospital.

## Alternatives considered

- Deriving the supplier from the prescription: rejected.
