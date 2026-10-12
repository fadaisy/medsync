# ADR 0262 — Review lanes: signed reasons, the fail-safe, the standard lane's record

**Status:** Accepted — 2026-10-12 (owner, also the CSO), Pharmacy Phase 1 GATE A ([gate-a-proposal](../pharmacy/phase-1/gate-a-proposal.md) §14), LN-1 to LN-8, D-PH1-04, D-PH1-06.

## Decision

1. A prescription is pharmacist-first when any active line matches a reason that is signed and switched on for that
   hospital; reasons read stored facts only (gate-a-proposal §4). A controlled line always makes it pharmacist-first.
2. With no signed lane rule, every prescription is pharmacist-first and the queue says so.
3. "Typed dose with no signed reference" is off: with four catalogue drugs carrying a signed dose it would catch nearly
   everything.
4. The standard lane records no review; its supply records "standard lane, checked at supply".

## Consequences

- The lane and its reasons ride on the events written, with the rule version.

## Alternatives considered

- One lane for all: rejected; the window would stop.
