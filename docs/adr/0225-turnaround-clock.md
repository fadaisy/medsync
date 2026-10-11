# ADR 0225 — The turnaround clock: receipt to release, from data, in words

**Status:** Accepted — 2026-10-10, Lab Phase 0 GATE A, D-LAB0-06/07/08/16, E-LAB0-05.

## Decision

1. The clock runs from the lab's receipt of the specimen to final release; a preliminary does not stop it. Before
   receipt the cell shows time since collection, unlabelled and uncoloured. Wall-clock time.
2. The target is the hub's stated turnaround **only when it reads as one unambiguous duration** ("45 min", "2 h",
   "1 h 30 min", "1 d"); else the catalogue's `turnaround_target_minutes`, marked "default"; else none. Ranges and
   words are not a figure. No target, no colour.
3. Late is elapsed past the target, said as "Late by 25 min" on an amber chip with a clock icon.
4. "Now" is the server's time plus the page's age on the monotonic clock; a 30-second tick, paused while the tab is
   hidden; it never fetches.

## Consequences

All 44 catalogue targets are NULL today and no hospital has stated turnaround text in minutes, so "Late" will show
only once a facility states a figure. ISO 15189:2022 leaves the two points to the laboratory; this records MedSync's.
