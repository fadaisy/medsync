# ADR 0427: Holding prepared refills

**Status:** Accepted, 26 Oct 2026. Pharmacy Phase 4 GATE A (signed by the CSO, D-PH4-29), Steps 2 and 5. Supersedes Phase 1 E-PH1-03 ("nothing is held") and D-PH1-31's Definition of Done line, for prepared refills only (SA-1).

## Context

A refill is set aside before the patient arrives. Phase 1 held nothing, and stock that is set aside but still counted as available would be promised twice.

## Decision

- **A place for held stock.** Each dispensing point has a "Held refills" place: a `pharmacy_locations` row with kind `prepared`, made when first needed.
- **Paired movements.** Set aside moves stock to that place (`set_aside_out` and `set_aside_in`), first expiry first, using only batches that last to the held-until date. Release moves it back (`released_out` and `released_in`). Held stock is not available to anyone else.
- **Moved only by a person.** Nothing releases by itself. Past its date, a refill is listed as Not collected, and someone releases it or holds it longer, within the signed hold rules.
- **Hand-over from the held place.** The supply is a normal Phase 1 hand-over out of the held place. 0231's Law 3 pair check accepts the point's held place for this.

## Consequences

- While the hold rules are unsigned, nothing can be set aside.
- A held batch that is later recalled blocks the hand-over. Releasing it may be refused by the stock guard until the quarantine path is wired to the held place.
