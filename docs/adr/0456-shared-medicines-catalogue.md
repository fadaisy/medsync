# ADR 0456 — The shared medicines catalogue and its layers

**Status:** Accepted — 27 Oct 2026 (catalogue slice GATE A, signed by Fadhul, CSO: D-CAT-01, -02, -03, -04, -05, -06).

## Context

A pharmacy product was one hospital's free-text row tied to a prescribing-list id (192 medicines), so health
supplies and local medicines could not be stocked. Each hospital also retyped the same packs, and nothing tied a
pack's barcode or registration to a shared fact.

## Decision

1. **Four shared layers above every hospital** (migration 0251): substances → medicines (ingredients, routes)
   → products (a brand) → packs and their codes. The hospital's product stays the fifth layer and links to a pack
   in Step 6. The catalogue has no hospital id and no prices.
2. **Pack facts only:** names, strength as printed, form, route, pack, maker, registration, barcode, source. No
   doses, limits, indications or interactions.
3. **Every fact comes from a proposal.**
   - A medicine, substance, product or pack row names the applied proposal it came from, and every write is
     logged in `cat_changes`.
   - A proposal that adds or corrects a medicine needs **two curators, neither the proposer**. Others need one.
   - The database enforces this, because curator writes run as the owner connection, which RLS does not bind.
4. **Who curates:** an open row in `catalogue_curators`, granted by a superadmin. Pharmacy viewers and curators
   read; no client role writes.
5. **Forms and routes** are MedSync's own signed en-GB lists (0252, 40 and 15). EDQM codes stay empty until
   EDQM's terms are cleared.
6. **No ATC codes:** WHOCC terms forbid commercial copying. The EMHSLU therapeutic class is kept instead.
7. **The seed from EMHSLU** (`scripts/pharmacy/seed-catalogue-from-emhslu.ts`) writes proposals only and is
   idempotent.
   - A combination becomes one medicine with its ingredients.
   - A row listed again in another section is linked to the same medicine.
   - A form or route is mapped only where the printed form names it (`data/pharmacy/catalogue/emhslu-form-map.v1.json`).
   - Signed former and US names give way to the INN, and the printed name is kept.

## Consequences

- Nothing enters the catalogue without two curators. Seeding 714 medicines and 1,911 supplies is a batch review,
  not a load.
- The ledger is untouched: no catalogue table is read by a stock trigger or writes a movement.
