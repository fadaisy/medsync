# ADR 0272 — Going live per dispensing point: six conditions and two people

**Status:** Accepted — 2026-10-12 (owner, also the CSO), Pharmacy Phase 1 GATE A ([gate-a-proposal](../pharmacy/phase-1/gate-a-proposal.md) §14), RD-1 to RD-5, D-PH1-35, W1.

## Decision

1. A point is switched on only when six conditions hold: signed content (with a pharmacist's co-signature on the
   clinical packs and the hazard log), interim answers to legal questions 1 to 6, every product counted, a drill, the
   briefings, and an in-charge named with the point's phone set.
2. The request and its approval are by two different hospital admins; the approval stamps `live_at` in the same
   transaction. Switching off needs a reason and a second approver. A second point needs a pilot note by someone else.

## Consequences

- The test hospital's points go live by fixture until a hospital uses the page.

## Alternatives considered

- A hospital-wide switch: rejected; points differ.
