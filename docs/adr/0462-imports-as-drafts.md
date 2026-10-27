# ADR 0462 — Imports as drafts: products, opening stock and supplier price lists

**Status:** Accepted — 27 Oct 2026 (catalogue slice Step 9, under GATE A signed by Fadhul, CSO). Migration 0258
(GATED, owner-applied after 0257). O-5: CSV only.

## Context

A hospital starting on MedSync has its product list, its opening stock and its suppliers' price lists in
spreadsheets. Typing them is slow; importing them blindly would write wrong strengths and stock no one counted.

## Decision

1. **A file is a draft.** `pharmacy_import_drafts` and `pharmacy_import_rows` (0258) keep each line, its proposed
   match (`matched`, `check`, `not_in_catalogue`, `invalid`) and the reason in words. Nothing outside the draft is
   written until commit (S34). Limits: 2 MB and 5,000 rows. CSV only (UTF-8, comma, a header row); reading `.xlsx`
   would need a dependency (O-5), and "Save as CSV UTF-8" covers it.
2. **One decision per row by a person:** accept, choose one of several, add as a health supply, or skip. "Accept
   the {n} matched rows" is one click for the rows that matched. A row with nothing proposed cannot be accepted.
3. **Never a different strength (S35).** A barcode whose pack is another strength goes to "check" with no proposal;
   a name found only in another strength is "not in the catalogue". A medicine off the prescribing list is never
   added (D-CAT-18); a row the hospital already stocks needs a person.
4. **Commit writes only accepted rows, through the existing stores:** `addProduct` (with the catalogue pack) and
   `addHealthSupply` for products; `placeAt` for opening stock; the price list and its lines for a price list. Each
   row records what it made.
5. **Opening stock writes no count and no movement (S36). Adapted from GATE A §8**, which named
   `recordStoreCount` "opening": that call _is_ the store's blind opening count, and the go-live condition counts
   any count line at the store, so committing through it would skip the count. Commit places each product at the
   store (a store not yet live only); the imported batches, quantities and costs stay on the draft for the
   in-charge. The blind opening count still sets the stock.
6. **Price-list lines (S37)** match by barcode, then by the supplier's code as matched in an earlier list, and by
   name only as options for a person ("check"). A line not found is kept with its text and no pack.

## Consequences

- An imported unit cost is not yet a stock cost: the opening count's movements carry none, so stock value names
  those batches until a receipt or a cost correction gives them one.
- Excel files wait for O-5's dependency decision.
