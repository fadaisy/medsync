# ADR 0463 — Pick by scan on issues

**Status:** Accepted — 27 Oct 2026 (catalogue slice Step 10, under GATE A signed by Fadhul, CSO). Migration 0259
(GATED, owner-applied after 0258). Behind `PHARMACY_CATALOGUE`; off, issuing is unchanged.

## Context

A requisition is issued first expiry first (IS-2), but nothing checked the pack taken from the shelf: a wrong
medicine, a wrong strength or a later batch left the store unnoticed. The plan's batches were worked out and then
dropped before the screen (`getRequisition`).

## Decision

1. **A pick is a check, never stock (S43).** `pharmacy_issue_picks` records the line, the product, the batch read
   from the code (if any), how it was picked (`scan` with the code, or `hand`), the later-batch reason, who and when.
   No movement is written.
2. **`pickCheck`** (`lib/pharmacy/distribution/engine.ts`, pure) refuses another product, another strength included,
   in words naming both (S38). A batch that expires after the planned first-to-expire needs a reason from the existing
   coded list (`BATCH_CHOICE_REASONS`, without "other": a pick carries no text) (S39). The server answers a later
   batch as `conflict`, so the screen asks for the reason; a wrong product is `invalid`.
3. **A pack with no barcode is ticked by hand** and the record says so (D-CAT-15).
4. **Issue waits for the picks.** With the check on, `issueRequisition` refuses while a line issued above zero has
   no pick; the button stays disabled with each line's reason in words. The demo ticks its lines by hand before it
   issues.
5. **The plan is sent.** `getRequisition` now returns each line's planned batches (number, expiry) and its pick.
6. **IS-6 on the screen (S44).** `controlledRefusals`, built and never called, now gives each line's needs
   (`witness_needed` for a controlled line). The issue and the receipt already enforced the witness and the second
   factor (`storeWitness`, the receipt attestation); this only states it before the click.

## Consequences

- A hospital with no barcodes ticks every line by hand: one click each, recorded as such.
- Repeat picks are kept (append-only); the latest is read.
