# ADR 0370 — Stock locations of five kinds; Phase 1 points copied in

**Status:** Accepted — 2026-10-21, Pharmacy Phase 2 GATE A signed by Fadhul (CSO) (`docs/pharmacy/phase-2/gate-a-proposal.md`).

Rules: D-PH2-01, LC-1 to LC-5.

## Decision

- `pharmacy_locations` holds a store, a dispensing point, a ward, a cart and quarantine. Each is a hub unit, or belongs to one: a ward is its `hospital_wards` row, and a cart is its `crash_carts` row.
- Phase 1 points are copied in under their own ids, and a trigger copies new ones. `dispensing_point_id` keeps its meaning, so no Phase 1 read changes. A row's place is `coalesce(location_id, dispensing_point_id)`.
- Each location goes live on its own through `pharmacy_location_golive`: a second person, and a reason to switch off. An issue-only ward needs no go-live of its own.
- Ward and cart rights come from hub assignments (`private.pharmacy_location_right`), outside `pharmacy.*`. Nurses still hold no pharmacy permission.
