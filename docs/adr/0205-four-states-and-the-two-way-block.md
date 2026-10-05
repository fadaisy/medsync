# ADR 0205 — Four states, and a block that works in both directions

**Status:** Accepted for the shadow build — 2026-10-05 (GATE A: P0-04, P0-05, N8).

## Context

A clinical rule that reads "not met" when a value was never taken tells a clinician something false. And a
value can be wrong for a reason the rule cannot see: an HbA1c is falsely low after a transfusion or in
sickle cell disease, falsely high in iron deficiency.

## Decision

1. **Four states** for every criterion (ADR 0082): `met`, `not_met`, `insufficient` (not recorded) and
   `unavailable` (the site cannot measure it). `and`, `or` and `atLeast` combine them as signed at P0-04:
   `atLeast(n)` is met with n met, not met only when too few remain possible, and otherwise insufficient
   before unavailable. An empty record fires nothing.
2. **Validity caveats carry a direction:** `masks` (the value may hide disease), `manufactures` (it may show
   disease that is not there) or `unpredictable`. A blocking caveat stops the value from deciding in the
   direction it distorts: a masked value cannot rule out, a manufactured one cannot rule in, an unpredictable
   one does neither. The blocked value is named as a gap only where it changed the result.
3. **Never on the acute lane (N8).** Caveats act on routine rules, steps, routine referrals and targets.
   Acute rules and same-day or urgent referrals for danger are never suppressed by a caveat.

## Consequences

- "We don't know" and "we can't know here" are shown as such, never as "normal".
- The escalation-floor grid (25,088 men, 480 women) runs in CI on the TypeScript engine and fails on any
  cell below its floor, so a caveat or a missing value can never quiet an emergency.
