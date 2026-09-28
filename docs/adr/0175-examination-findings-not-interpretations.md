# ADR 0175 — Examination: findings, not interpretations

**Status:** Accepted — 2026-09-28. E5, D-EX-16, D-EX-17, D-EX-18 signed by the CSO.

## Decision

1. **The note records signs, measurements and named classifications with their inputs**, assembled by fixed rules (`lib/clerking/exam/compose.ts`): the vital-signs line, anthropometry, General, the systems in catalogue order (positives first with their attributes, then negatives), the gate line before rectal and genital, and "Not examined: … (reason)". Unrecorded items are absent; nothing is inferred as normal.
2. **Hints are never written:** the motor-pattern hint, WHO stage hints, GTFCC treatment plans, the West Haven and ACVPU suggestions.
3. **Flag badges name a finding, a value or a named scale with its result** ("Deviated trachea, hyper-resonant chest", "MUAC 17.5 cm", "GCS 8", "GTFCC: severe dehydration"), never a diagnosis the clinician has not made; that belongs in the reason.
4. **Suggestions** lead from the history and never answer: a chip is done when its target is recorded or marked not examined.

## Consequences

- Seven fixture snapshots are the house style (D-EX-17); the CSO confirms the badge differences from the prototype listed at STOP 2.
