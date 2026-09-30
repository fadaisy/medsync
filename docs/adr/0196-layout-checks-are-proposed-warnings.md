# ADR 0196 — Layout checks are proposed warnings

**Status:** Proposed — 2026-09-29. Every check and its wording is a proposal for the owner to confirm; none is a
national standard.

## Context

The prototype checks a layout before publishing (nurse call at every bed, oxygen, a station, piped services at
a wall …). Treated as rules, they would stop a hospital from recording the ward it actually has.

## Decision

1. **Checks** are pure functions (`lib/wards/checks.ts`, shared with the Edge Function), each returning
   `{ ok, text, blocking }`:
   - every bed in service has a nurse call;
   - beds without wall oxygen, named; on an HDU or ICU ward, beds without a monitor;
   - isolation rooms have hand-wash (a room feature or a hand-wash fixture in the room);
   - a nurses' station is placed; a resus trolley is placed;
   - nothing overlaps: beds and fixtures, and a bed crossing a wall, a room wall or a glass partition;
   - beds with oxygen, suction or medical air have their head within one cell of a wall or a room wall along
     the bed's width;
   - bed numbers are unique.
2. **Only integrity blocks:** duplicate bed numbers and a bed on a bed (and, from ADR 0192, archiving an
   occupied bed). Every other check is a warning with its text; publishing goes ahead.
3. **Recorded.** The server recomputes the checks at publish; the warnings shown are stored with the published
   version and in the audit row. If the checks changed since the admin saw them, publish asks them to look again.
4. **Labelled.** The panel says "Proposed checks, not signed standards."

## Consequences

- A small hospital can publish the ward it has; the warnings stay on record for whoever improves it.

## Alternatives considered

- **Block on every failed check:** records a better ward than the real one, or no ward at all.
