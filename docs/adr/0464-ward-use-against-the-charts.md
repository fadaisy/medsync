# ADR 0464 — Ward use against the charts

**Status:** Accepted — 27 Oct 2026 (catalogue slice Step 10, under GATE A signed by Fadhul, CSO). Migration 0259
(GATED). Behind `PHARMACY_CATALOGUE`.

## Context

A ward count records use since the last count (`ward_used`). Brief 4.13 compares it with doses charted from ward
stock. The administration record names no stock source, and nothing outside the demo writes one (STOP 0 Q10). Per
the brief, no source is added in this slice.

## Decision

1. **`wardUseCheck`** (pure) reads each product's use at its last count against the doses charted from ward stock:
   equal reads "Matches the charts"; a gap with no reason reads in amber as "{n} not on any chart" and makes one item
   for the nurse in charge; with a reason it reads "{n} more used than charted"; no charted source reads "Not
   charted from ward stock", never a gap (S41). Tested on the board 11–15 fixture (ceftriaxone 22/22, tramadol 15/8,
   a product never charted).
2. **On real data `charted` is null**, so every row reads "Not charted from ward stock". The check turns on the day
   a dose source exists, with no change here.
3. **The reason** comes from the signed list D-CAT-14 (`GAP_REASONS`, words draft), once per count and product, in
   `pharmacy_use_gap_reasons`, by the nurse in charge (`ward_act`). Never a movement (S43).
4. **The receipt (S40) keeps today's rule:** the receiver's own password and code and `ward_confirm`. With the check
   on, the dialog says the numbers are filled in as listed; it is not a blind count, as built.

## Consequences

- The nurse-in-charge item is computed but not delivered: nurses have no Needs you list yet, and no real row can be
  a gap. It is listed as open.
