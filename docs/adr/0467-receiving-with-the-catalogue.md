# ADR 0467 — Receiving with the catalogue: scan, packs and the registration reason

**Status:** Accepted — 27 Oct 2026 (catalogue slice Step 7; GATE A, signed by Fadhul, CSO: D-CAT-08, D-CAT-09,
Laws 4, 5 and 9). The registration reason codes are draft until the legal answers.

## Context

Counting a 20-line delivery took about 120 entries, and every product was picked by hand (Q8). The catalogue now
knows packs, their contents, their barcodes and their registration.

## Decision

1. **One scan field at the top of a delivery** (`scanIntoDelivery`). It resolves a code through the hospital's
   own product, then its local link, then the shared link. A pack resolves only to the one product linked to it
   at this hospital; none or several fills nothing and says why (Law 5). A new line takes the batch and expiry
   from a 2D code and counts one pack. The same product and batch again adds one pack to that line and says so
   ("+1 pack · n counted", D-CAT-09). A plain barcode adds to the product's newest line. Ctrl K on the delivery
   opens the catalogue picker, taking the key from Find; a pick opens a line with nothing counted.
2. **Packs convert only by the pack's whole contents** (Law 4). The line keeps `packs` and `pack_contents`, and
   the accepted quantity stays in issue units and is what moves. Both figures are shown before saving. A pack
   with no recorded contents is counted in issue units. The app and `pdl_packs_whole` (migration 0256) refuse
   a mismatch.
3. **A lapsed or absent registration needs a coded reason** (Law 9, D-CAT-08), at the line and again at
   receipt, because a scanned line skips the dialog. "Absent" means not found on the register, or "No
   registration number on the pack" with none recorded since. An unknown register state asks nothing: there is
   no register file yet (O-1). The deliveries page lists these lines for the in-charge. Nothing blocks a recall
   or quarantine.
4. **Where the identity came from** is kept per line (`identity_source`: scan, catalogue, typed), so the count
   of typed identities can be compared with Q8 (S20).
5. **Every other scan field** (opening count, issues) falls back to the catalogue when no product here carries
   the code, under the same one-product rule. **Add a product** can be filled from a catalogue pack, which is
   linked at once. The server refuses a pack that is not linked to the chosen prescribing medicine.
6. **A controlled product keeps its witness** (S24). Nothing in the witness path changed.

## Consequences

- Migration 0256 is an adaptation: GATE A planned none for Step 7. Prices move to 0257, imports to 0258 and
  distribution to 0259.
- Cart restock lines are fixed by the signed cart template, so there is no identity to scan; batch scanning
  there is left open.
- The code needs 0251–0256 applied before it is deployed, as every select of the delivery line reads the new
  columns.
