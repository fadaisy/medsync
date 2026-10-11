# ADR 0235 — Emergency doses from the resus timeline

**Status:** Accepted — 2026-10-10 (owner, also the CSO), Pharmacy Phase 0 GATE A, D-PH0-13, D-new-2
([gate-a-proposal](../pharmacy/phase-0/gate-a-proposal.md) §4.4, §5.4).

## Context

The table 0039 created for emergency doses (`emergency_administrations`) is empty: no code writes it. Every dose given on
the resus desk is a `resus_timeline_events` row of kind `drug`.

## Decision

1. Emergency doses read the timeline: grab-and-give doses from `payload.prescribing` (medicine, dose and route as
   recorded, the cart as typed, giver, witness); protocol doses once performed. A corrected event is replaced by its
   correction. Cart tabs group the typed cart text; none is "No cart".
2. A witness shows by cadre, or "witness named at the bedside" when only a typed name exists; the name is never shown.
3. No stock figure is read or shown.

## Consequences

- Cart counts add up to the total (property test). Restocking is not recorded; the page says so.
