# ADR 0236 — Dispensing points as units of the Pharmacy department; derived capability values

**Status:** Accepted — 2026-10-10 (owner, also the CSO), Pharmacy Phase 0 GATE A, D-PH0-14, DP-1..DP-4
([gate-a-proposal](../pharmacy/phase-0/gate-a-proposal.md) §4.5, §5.5).

## Decision

1. A dispensing point is a unit of a hospital's Pharmacy department; migration 0102 adds a 1:1
   `pharmacy_dispensing_points` row with `serves` (window, wards, emergency, all). Client-closed (RLS, no policy).
2. The hub writes it through `ha-services-hub` op `set_dispensing_point` (a live unit of PHARMACY only; audited before
   it writes) and shows it in the Pharmacy panel's Dispensing points tab.
3. `serves` only picks the lane the point's staff open on. It routes, hides and holds nothing.
4. With one or more points, the hub's "dispensing points" count and "pharmacy open 24 hours" are worked out from the
   points (hours exactly "24 hours") and can no longer be typed (CAP-3 pattern).

## Consequences

- Archiving follows the hub's existing rule (blocked while staff are assigned); the hub has no per-unit Archive button.
