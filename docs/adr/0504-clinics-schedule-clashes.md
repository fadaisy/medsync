# ADR 0504 — Clashes block publish

**Status:** Proposed — 15 Nov 2026. GATE A (docs/clinics-schedule/gate-a-proposal.md) provisional, **not signed**. Built on `feat/clinics-schedule`.

## Context

Two sessions sharing a room or a clinician at the same time make a promise the hospital cannot keep.

## Decision

A pure function finds every room or person overlap per weekday; every-other-week sessions are treated as possibly meeting. Any clash in the result blocks publish, with the nearest free time inside opening hours offered as the fix. No shared-room exception at launch.

## Consequences

Week plan, the session editor and the publish sheet use the same function.
