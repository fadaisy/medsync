# ADR 0190 — The pharmacy seam

**Status:** Proposed — 2026-09-28.

## Context

The prescribing dialog should say whether the pharmacy has the drug, but MedSync is not linked to any pharmacy
system. The prototype's "Connected (demo)" state is design only.

## Decision

1. `PharmacyAvailability` (`lib/prescribing/pharmacy.ts`) is the interface the dialog and the stock check read:
   `{ status: "not_linked" | "in" | "low" | "out", point?: string }`, the dispensing point when known.
2. Today it always returns `not_linked`. The dialog shows "Pharmacy not linked yet" in a dashed box, drug rows show
   "Stock: not linked", and the stock check reads "not checked: pharmacy not linked".
3. Linking a pharmacy replaces the implementation, not the callers.

## Consequences

- No stock is ever shown as fact until a real feed exists; demo stock never ships.

## Alternatives considered

- **Leave stock out of the dialog:** the seam costs little and makes the later link a one-file change.
