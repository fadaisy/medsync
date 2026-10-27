# ADR 0459 — Products link to the catalogue; health supplies carry a catalogue key

**Status:** Accepted — 27 Oct 2026 (catalogue slice Step 6). A-1 amended and D-CAT-18 answered by Fadhul, CSO,
on 27 Oct 2026: "Catalogue key" and "Refuse for now".

## Context

Every hospital product named a prescribing-list medicine in `medicine_id` (NOT NULL), and stock, counts,
witness checks and dispensing all key on it. The catalogue (ADR 0456) also holds health supplies, and Step 6
asked how a product that is not on the prescribing list is stocked. A trial that made `medicine_id` nullable
broke 49 places in 17 files, so A-1 as drafted was set aside.

## Decision

1. **A-1 as amended: the catalogue key.** `medicine_id` stays NOT NULL. A product that is not on the
   prescribing list takes `cat_` plus 32 hex digits (`catalogueKey`): its catalogue item's id, or its own id
   when it names none. No formulary id starts with `cat_`, so no prescription, dose rule or controlled class
   ever matches one. Migration 0255 adds `item_kind` (formulary, local_medicine, health_supply),
   `catalogue_pack_id`, `catalogue_medicine_id` and `local_proposal_id`. `pp_kind_key` holds the key to the
   kind: a formulary product never takes a `cat_` key, and a non-formulary product always does.
2. **D-CAT-18: local medicines are refused for now.** A medicine that is not on the prescribing list has no
   signed controlled class, so it cannot be added until the CSO decides how that is set. `addHealthSupply`
   refuses it in words, and `pp_no_local_medicine` refuses it in the database. Form 4.4 offers health
   supplies only.
3. **Linking changes only the catalogue columns** (S17). `linkProducts` sets the catalogue medicine and pack.
   Batches, movements, the issue unit and the prescribing medicine stay as they are. A definer trigger
   (`pp_catalogue_link`) fills the medicine from the pack and keeps a medicine's product on a catalogue
   medicine and a supply's on a supply.
4. **Suggestions come from signed links only.** "Your products" proposes a catalogue medicine only through
   the prescribing medicine's catalogue link or the national-list row's link, never by name. Products with
   one match are confirmed together; with several, the person chooses; with none, they pick from the
   catalogue.
5. **A health supply is stock like any other** (S18). It is received, counted, moved, quarantined and
   written off through the existing paths. Count, reorder-level and request inputs accept a catalogue key;
   creating a formulary product still does not. Its `new_product` proposal records the registration answer,
   and "No registration number on the pack" is an answer, not a blank (Law 9). Confirming the proposal adds
   the brand, maker, pack and barcode to the shared catalogue and links the product to that pack.

## Consequences

- A health supply is never prescribed (S19): it has no prescribing-list id, and a formulary product cannot
  take its key.
- Turning local medicines on later needs a CSO decision on their controlled status, a new migration that
  drops `pp_no_local_medicine`, and the form's medicine option.
