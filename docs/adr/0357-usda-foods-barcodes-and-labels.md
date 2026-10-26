# ADR 0357 — USDA foods, barcode scanning and nutrition labels on the Eat tab

**Status:** Accepted, 2026-10-18. Owner decisions: scan barcodes, do not limit the list to Ugandan foods, add the USDA catalogue, and always search Ugandan foods first.

## Context

Meal logging (ADR 0356) searched only the 180 foods on the Ugandan list (ADR 0412). Patients also eat packaged foods, and foods the Ugandan list does not hold. I checked Open Food Facts, the open barcode database: it lists 98 products sold in Uganda, and only 1 of the first 10 had calories. A barcode lookup alone would mostly fail.

## Decision

1. **The USDA catalogue.**
   - 7,283 foods from USDA FoodData Central SR Legacy (April 2018, public domain), shipped in the app (`mobile/src/data/food/usda.json`, 1 MB), so they work offline.
   - `docs/food/build/usda_catalog.py` builds the file from the official CSV download:
     - available carbohydrate is carbohydrate by difference minus fibre;
     - each food gets up to three USDA household measures, plus 100 g;
     - each USDA category is mapped to one of the app's eight groups;
     - baby foods, US regional foods, branded foods and quality-control samples are left out.
   - No GI is matched to a USDA food, so every one shows "GI not known".
2. **Search order.**
   - Ugandan foods and dishes always come first, then the patient's own packaged foods, then USDA's.
   - Within each, names that start with the first word typed come first.
   - With nothing typed, only the Ugandan list shows.
3. **Scan a barcode.**
   - The back camera reads EAN-13, EAN-8, UPC-A and UPC-E barcodes.
   - A product the patient has already saved is used straight away.
   - Otherwise the phone looks the code up in Open Food Facts (worldwide, ODbL).
   - The product is used only when it has energy and carbohydrate per 100 g. The screen then says it comes from Open Food Facts, typed in by volunteers, and asks the patient to check it against the pack.
4. **The label, when the barcode isn't found.**
   - The patient photographs the nutrition panel. `/api/mobile/food-label` asks Claude (the smallest current model) to read it with a prompt that forbids guessing. The rules that check its answer are in `_lib/read.ts`, and tests cover them:
     - the per 100 g column is preferred;
     - per-serving values are scaled only when the serving size is printed;
     - kcal is worked out from kJ only when the label gives no kcal;
     - anything 100 g cannot hold is dropped.
   - The values only fill a form. The patient checks or types them, and the phone checks them again before anything is kept.
   - The photo is never stored. Signed-in patients only, ten photos a minute. Without `ANTHROPIC_API_KEY` the patient types the values instead.
5. **What is kept.**
   - Each packaged food the patient logs is saved in `patient_food_products` (migration 0191) as a snapshot of its values per 100 g, with its source: `open_food_facts`, `label_photo` or `typed`.
   - These rows belong to that patient only and are never shared with other patients. The care team can read them, as for the rest of the log (ADR 0413).
   - The meal row names the product as `product:<id>`. The product is saved only together with its first meal, and offline both queue.
   - No label prints a GI, so a product's GI is "not known".
6. **Under the no-made-up-numbers rule**, a pack's printed label counts as the manufacturer's published values. An Open Food Facts entry is a volunteer's copy of that label, and the screen says so.

## Consequences

- **The owner applies migration 0191.** Until then saving a packaged food fails ("Couldn't save that"). Ugandan and USDA foods do not need it.
- **The label photo needs the web app deployed** with `/api/mobile/food-label` and `ANTHROPIC_API_KEY`, as reading device photos does. Each label costs a fraction of a cent.
- **Camera wording:** iOS's camera permission now says the camera reads food barcodes and labels. The new wording appears from the next development build; Expo Go keeps its own.
- **Lookups:** the phone calls Open Food Facts directly and names itself in the request, as Open Food Facts asks. Lookups need a connection.
- **The app is 1 MB larger** with the USDA catalogue. Its foods are only turned into objects on the first search.
- **Carbohydrate from US labels:** some Open Food Facts entries copy a US label's total carbohydrate, which includes fibre, so carbohydrate and glycemic load may read slightly high for them.

## Alternatives considered

- **Barcodes through the web app.** Rejected for now: the phone can reach Open Food Facts itself. A server lookup could add caching later.
- **One shared product table for everyone.** Not built: one patient's misread label would reach every other patient. It can be added later with a review step.
