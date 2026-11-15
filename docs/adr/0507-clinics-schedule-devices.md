# ADR 0507 — Device pairing, coverage and lock

**Status:** Proposed — 15 Nov 2026. GATE A (docs/clinics-schedule/gate-a-proposal.md) provisional, **not signed**. Built on `feat/clinics-schedule`.

## Context

Desks and screens existed only as rows nobody could create; coverage was by department.

## Decision

An admin adds a desk, triage tablet or waiting-room screen and gets a 6-character code that works once within 15 minutes (hashed at rest). Coverage is by clinic (Mine for desks, what a screen shows), edited as drafts. Desks and tablets lock after 5, 10 or 15 minutes. Screens show codes and rooms only. A clinic needs a desk to open; a screen is optional.

## Consequences

desk_devices gains kind, place, clinic coverage, lock, last seen and the pairing code columns.
