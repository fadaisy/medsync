# ADR 0471: One medicine master in Set-up › Medicines

**Status:** Accepted, 3 Nov 2026, by the owner's request (the Medicines rework kit, `docs/pharmacy/rework/MEDICINES-TAB.md`). Copy is **draft** (`PHARMACY_MEDICINES_COPY`). Migration **0270** is GATED and owner-applied.

## Context

A medicine's facts were spread across Set-up › Medicines (a read-only list), Set-up › Prices, the stock table and the dispensing-point settings. Duplicate lines could be created, and nothing stopped a controlled flag on a nationally controlled medicine from being cleared.

## Decision

- **One grid, two modes.** `components/pharmacy/medicines/grid.tsx` is Set-up › Medicines (`edit`) and Stock › Medicines (`operate`: no identity, VEN, rule or price editing; top-ups and order asks allowed). The old Medicines tab, the Prices page and the add-from-catalogue panel are deleted.
- **Billing per dispensing point moves to Set-up › Places** (charged or free, pay before collecting), unchanged in behaviour.
- **Identity in the database.** `pp_line_identity` is one active line per hospital, generic, strength, form and route. The app checks first and names the line that is already stocked.
- **Rules change with two signatures.** A proposal is applied by the trigger only once the in-charge and a second, different person sign; `pharmacy_rules` refuses any other write.
- **The national controlled list locks the flag.** A line on `data/pharmacy/national-list/controlled.v1.json` (or a catalogue medicine marked nationally controlled) is always controlled.
- **Every change runs from a date and leaves a history line** (`pharmacy_line_history`, append-only), marked bulk when it came from the bulk bar.
- **Live:** `pharmacy-stock:<hospital>` is broadcast after each movement and fridge reading; the page refreshes, and polls every 30 s while the channel is down.
- Top-up requests from a place raise a requisition to the main store. From the store they become an order ask, which the next order draft takes as its chosen quantity.

## Consequences

- Until 0270 is applied, Set-up › Medicines says so in words, and Stock › Medicines keeps the old table.
- The second rule signer is anyone with `pharmacy.view` other than the first signer. A named CSO or medical superintendent role is not modelled yet.
