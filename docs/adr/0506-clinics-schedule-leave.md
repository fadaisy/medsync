# ADR 0506 — Leave requests become availability exceptions

**Status:** Proposed — 15 Nov 2026. GATE A (docs/clinics-schedule/gate-a-proposal.md) provisional, **not signed**. Built on `feat/clinics-schedule`.

## Context

Doctors set their own leave today with no approval, so sessions silently lose their clinician.

## Decision

A doctor asks for leave from the availability sheet: an availability block in state requested. Approving opens the closure form filled in (cover from the same clinic first, then department; booking policy) and publishes one active leave block. Declining sets declined; the doctor sees Not approved.

## Consequences

availability_blocks gains states requested and declined and the cover and policy columns.
