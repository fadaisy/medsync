# ADR 0277 — Three merges and one go-live

**Status:** Accepted — 2026-10-12 (owner, also the CSO), Pharmacy Phase 1 GATE A ([gate-a-proposal](../pharmacy/phase-1/gate-a-proposal.md) §14), E-PH1-13.

## Decision

Steps 0 to 6 merge first, Steps 7 and 8 second, Step 9 third, all behind per-hospital flags that stay off in
production while their wording is unsigned. One go-live, per point, after the second merge, through the two-person
switch.

## Consequences

- Production behaviour is unchanged by each merge until a point is switched on.

## Alternatives considered

- One big merge: rejected; unreviewable.
