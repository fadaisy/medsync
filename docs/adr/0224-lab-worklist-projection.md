# ADR 0224 — The lab worklist projection and section routing

**Status:** Accepted — 2026-10-10, Lab Phase 0 GATE A, E-LAB0-04, D-LAB0-17.

## Decision

1. `lib/lab/worklist.ts` `computeWorklist` (pure): one row per order; stages To receive, To result, Preliminary;
   released, rejected and cancelled never appear; a missing permission gives no action.
2. A row's section is the hub offering's section, else the catalogue's, else "No section", which is never hidden.
   Section counts ignore the section filter, so they partition "All sections"; stage counts follow it.
3. The viewer's section (an affiliation whose department is a unit of LABORATORY) opens first; several give "My
   sections"; none give "All sections" with a note.
4. Order: priority, then late by overrun, then received by elapsed, then not received by time since collection.
5. `lib/lab/read.ts` loads the inputs with a fixed number of round trips (9, or 10 with an offering lookup), reusing
   `loadEmrLabWorklist` unchanged. The browser filters and sorts, so a switch needs no request; the URL holds the view.

## Consequences

The EMR never writes `encounter_orders.loinc_code` and the catalogue has no section, so every row is "No section"
until the one-test-menu link (HARMONISATION §9) lands. The machinery is proven with fixture offerings.
