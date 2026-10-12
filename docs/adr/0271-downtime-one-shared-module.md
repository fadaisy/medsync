# ADR 0271 — Downtime: one shared module, back-entry with true times, paper prescriptions as their own record

**Status:** Accepted — 2026-10-12 (owner, also the CSO), Pharmacy Phase 1 GATE A ([gate-a-proposal](../pharmacy/phase-1/gate-a-proposal.md) §14), DT-1 to DT-11, D-PH1-34, D-PH1-46, E-PH1-08, E-PH1-10.

## Decision

1. The lab's downtime tables (0105) are generalised once (migration 0128): `downtime_periods` is shared as it is;
   `downtime_form_numbers` gains `workspace` and the pharmacy's `to_enter` and `complete` states; the guard keeps the
   lab's moves exactly; `downtime_drills` gains `workspace` and the dispensing point. One number space per hospital;
   pharmacy sheets print it as DS-nnnnn.
2. The lab's reads filter `workspace = 'lab'`, so a pharmacy sheet or drill never counts on the lab's screens.
3. A back-entered supply keeps the sheet's time (`supplied_at`, movement `effective_at`) beside the entry time.
4. A paper prescription transcribed at back-entry is its own record (`paper_prescriptions`, lines), never a row in
   `prescriptions`.

## Consequences

- The lab's tests run unchanged; a lab state on a pharmacy sheet is refused by the database.

## Alternatives considered

- A second, pharmacy-only module: rejected (DT-1: never two).
