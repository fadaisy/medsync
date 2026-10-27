# ADR 0465 — Cart seals and signals

**Status:** Accepted — 27 Oct 2026 (catalogue slice Step 10, under GATE A signed by Fadhul, CSO). Migration 0259
(GATED). Behind `PHARMACY_CATALOGUE`.

## Context

An emergency cart is checked on an interval (EC-1 to EC-4) and sealed with a number. A broken seal had nowhere to be
recorded, and the resus desk stores the cart as free text that is always null on real data.

## Decision

1. **`pharmacy_seal_events`**: `applied` (written when a cart check completes with a seal number) or `broken`
   (reported from the cart page, `pharmacy.stock`, or by the unit's nurse, `ward_act` at the cart). Never a movement
   (S43).
2. **`cartSignals`** (pure): the latest seal event broken after the last check, or a resus dose from the cart since
   it, puts the cart on the check list as "Check due: seal broken" (S42). Read on each load, so the list changes on
   the next refresh. On real data the resus doses are empty and the seal report works alone.
3. **`explainCartGaps`** (pure) explains a cart-check gap by the resus doses of that medicine since the last check;
   tested on the fixture.
4. **No field is added to the resus desk.**

## Consequences

- Reporting a broken seal from the nurse's ward-stock page needs the cart listed there; the action exists
  (`reportSealBroken`, `ward_act`), the page link does not yet.
