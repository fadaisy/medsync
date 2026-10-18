# ADR 0353 — A built-in Ugandan food list for the meal tracker

**Status:** Accepted, 2026-10-18. The owner signed the list off as clinical reference data on 18 Oct 2026.

## Context

Care → Move and eat gets a food tracker: the patient logs meals from a list that works offline and shows calories, carbohydrate, and the glycemic index (GI) and glycemic load (GL). The owner's rule for clinical data holds here: no fabricated numbers. Every value must come from a published source that can be cited, and a food with no published GI shows its GI as unknown.

This ADR covers the data only. The meal-logging screens come later, in their own ADR.

## Decision

1. **The list.** `mobile/src/data/food/foods.ts` holds 180 everyday foods in eight groups:
   - staples (33)
   - legumes and sauces (20)
   - meat, fish and eggs (28)
   - greens and vegetables (29)
   - fruits (20)
   - snacks and street food (13)
   - drinks, including milk, porridge and local brews (26)
   - basics: sugar, oils, salt (11)

   Each food has an id, an English name, local names (Luganda, Swahili and others where known), its group, two or three household portions in grams, values per 100 g (kcal, available carbohydrate, protein, fat, fibre), a GI or `null`, the GI category, and a `sources` list. The list ships inside the app, so it works with no network.

2. **Sources, in this order:**
   1. For composition:
      - _Kenya Food Composition Tables 2018_ (FAO/Government of Kenya), used for 165 foods. These are East African foods and dishes, including ugali, matoke, stews, chapati and mandazi.
      - The FAO/INFOODS _West African_ table 2019, used for 2 foods (the local brews).
      - USDA FoodData Central SR Legacy (public domain), used for 13 generic foods with no African row.
   2. For GI:
      - East African measurements first: Ebere et al. 2021, _African Health Sciences_, Table 1, which compiles Kenyan studies in healthy adults. Used for 6 foods.
      - Then the _International Tables of GI and GL Values: 2008_ (Atkinson, Foster-Powell, Brand-Miller, _Diabetes Care_). Its Table 1 average was used for 34 foods. Single entries from its appendix Table A1 were used for 11 foods, African studies first.
      - The 2021 edition could not be reached from an official host, so the 2008 tables stand in.
      - Only glucose-scale values measured in people without diabetes are used.
      - The Sydney GI database was not copied.

   `docs/food/sources.md` lists every source with its URL. Each food's `sources` entries give the table and the exact row: a food code, an FDC id, a Table A1 item number with its page, or a Table 1 line with its mean ± SEM.

3. **Unknown GI.** 129 foods have `gi: null` and category `unknown`, and the app must show them that way, never as an estimate.
   - 20 of them hold no carbohydrate (plain meat, oils, salt, spirits). For these the glycemic load is 0, because GL is GI × carbohydrate ÷ 100.
   - For the others GL is unknown too.
   - A GI borrowed from a near match is labelled in the food's `note`. For example, matooke uses the published average for "plantain/green banana", because no matooke-specific GI was found.
4. **Maths.** `food-maths.ts` holds the arithmetic, tested in `food-maths.test.ts`:
   - `forGrams` gives kcal, macros and GL for any weight;
   - `glycemicLoad` computes GI × available carbohydrate ÷ 100;
   - `giCategory` returns low ≤ 55, medium 56–69, high ≥ 70;
   - `comboAmounts` adds up the parts of a dish.
5. **Dishes made of parts.** A rolex, a kikomando, and chips with chicken are `COMBOS` built from their parts (chapati plus omelette, and so on). Each of their numbers therefore still comes from a sourced food. A combo's GL is the sum of its parts' loads; if any part has an unknown GI, the combo's GL is unknown.
6. **Portions.**
   - 60 of the 332 portion weights are USDA household measures and cite their `food_portion` id: a medium banana, an egg, a cup of rice or milk, a teaspoon of sugar.
   - The rest are MedSync household estimates ("1 ladle", "1 fist-sized lump"), and carry no `source` so the app can tell them apart. The sourced values are the per-100 g numbers; a portion only multiplies them.
7. **Rebuilding.** The scripts in `docs/food/build/` made the file from the downloaded tables. No number was typed in by hand. The generator checks every Table A1 GI against the appendix text and every USDA portion against `food_portion`.

## Consequences

- No source was found for these foods, so they are not in the list:
  - roasted maize;
  - nakati (_Solanum aethiopicum_ leaves) and entula (its fruit). The West African "eggplant" rows are different species;
  - kabalagala;
  - tonto (banana beer).
- Some foods use the nearest published row, and their `note` says so:
  - gonja uses USDA baked ripe plantain;
  - matooke uses Kenya's "Mashed Bananas" and "Stewed Green Bananas".
- Kenya's table gives peanut butter the same values as raw groundnuts, and avocado 0 g available carbohydrate. These are kept as published.
- Before the screens show portions as exact, the CSO may want the household estimates checked against weighed Ugandan servings.
- To change a value, edit `docs/food/build/spec.py` to point at a different source row and regenerate. Never edit `foods.ts` by hand.

## Alternatives considered

- **Copying the Sydney GI database.** Ruled out by the owner's rule. Its licence and data are not ours to redistribute.
- **The HarvestPlus Uganda food composition table (2012).** It is Uganda-specific, but it was not among the sources the owner listed. It could replace the nearest-match rows in a later revision.
- **Estimating GI from similar foods.** Rejected. Unknown stays unknown.
