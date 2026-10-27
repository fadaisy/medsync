# ADR 0466 — The stock map and Follow one medicine

**Status:** Accepted — 27 Oct 2026 (catalogue slice Step 11, under GATE A signed by Fadhul, CSO). No migration.
Behind `PHARMACY_CATALOGUE`, inside Workspace v2's Store (`?tab=map`).

## Context

Stock sits in stores, points, wards, carts and quarantine. Each had its own page; nobody could see the hospital at
once, or follow one medicine through every place.

## Decision

1. **`hospitalStockMap`** (`lib/pharmacy/distribution/map.ts`) reads the ledger once (`placeValues`, which shares
   the stock-value arithmetic of ADR 0460 with `stockValueOf`) and gives one row per place:
   - how its stock is known (`every movement`, `counted`, `issue only`, `checked and sealed`);
   - its value at cost and the batches with no cost;
   - what is out: placed products, a ward's signed levels and a cart's signed list, with vital items first (VEN from
     the national list) and whether the store holds them;
   - batches expiring within the hospital's look-ahead;
   - its last count or check and whether it is fresh by the existing freshness setting;
   - issues not confirmed with their age, and those overdue by the signed window (`unconfirmedOverdue`, IS-4; while
     unsigned, the page says so);
   - a broken seal (ADR 0465);
   - one next step from a fixed list of draft strings (`nextStep`, pure).
     Values and holdings are the ledger's sums place by place (S45). An issue-only ward shows no balance and says it is
     not counted (S47); the figures exclude it.
2. **`medicineTrace`** gives one product's holdings by place and by batch (one total, S48), batch state (recalled,
   quarantined), monthly use and weeks of cover from the ordering engine (`buildProposal`, or why it cannot work them
   out), what is on order, and every movement in a 90-day window in words, newest first, with who. A recalled batch
   links to its recall's trace (S49).
3. **Links in:** each product on a stock page and the hospital's products on a catalogue medicine page open the
   trace.

## Adapted

- The trace follows one product, not every product of a catalogue medicine; the catalogue page lists each product.
- "Who received {batch}" is offered for a recalled batch only: the existing trace is keyed by a recall.
- Find (Ctrl K) does not yet open the trace.
