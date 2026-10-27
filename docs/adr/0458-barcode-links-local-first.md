# ADR 0458 — Barcode links: local first, shared after review

**Status:** Accepted — 27 Oct 2026 (catalogue slice GATE A, signed by Fadhul, CSO: D-CAT-07, A-2).

## Context

A barcode was a column on one hospital's product, and the scan parser failed on any element it did not use,
read no plain EAN-13 or UPC-A, and dropped the serial. Two hospitals could not share what they learnt from a pack,
and one wrong link could not be caught.

## Decision

1. **The parser** (`lib/pharmacy/stores/scan.ts`, Appendix B) reads AIs 01, 17, 10, 21 and 11. It steps over
   any other element by its GS1 length and names it ("Part of this code was not read"). It pads a plain 8-, 12-,
   13- or 14-digit code to GTIN-14, and refuses a wrong check digit **in words** rather than as typed text (S12).
   The serial is kept on the receipt line only (`pharmacy_delivery_lines.serials`, migration 0254), and nothing
   reads it.
2. **A scan resolves in one order** (`resolveScan`): the hospital's own product, then its local link, then the
   shared link, else unknown. A code that is not GS1 is looked up as an NMS, JMS or supplier code.
3. **Local first.** "Link and fill the line" (4.3) writes a `local` link, used at that hospital at once, and a
   `new_barcode` proposal. A curator who is not the proposer confirms it into a shared link, which every hospital
   then resolves (S14, S16).
4. **Conflicts are surfaced, never resolved by MedSync.** One code linked to two packs anywhere marks every link
   `conflict` (a definer trigger, because no hospital can see another's links). A conflicted code resolves to
   nothing at every hospital and blocks confirmation, until a curator keeps one pack with a note and the other
   links are withdrawn (S15).
5. **RLS narrows** (0254): a hospital reads the shared links and its own, and its own proposals and photos.
   Curators read all.

## Consequences

- A hospital's link works the moment it is made. No hospital relies on another's link until the team has checked
  it against the pack.
- The catalogue team's queue at `/admin/pharmacy-catalogue` lists barcodes to check, conflicts, and open
  proposals by source (with batch confirmation of the seed and names). It shows only where `PHARMACY_CATALOGUE`
  is set.
- Camera scanning is not built (O-2: USB wedge only); a camera needs its own proposal and approval.
