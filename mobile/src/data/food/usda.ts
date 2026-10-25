import type { Food, FoodGroup } from "./types";

import { giCategory } from "./food-maths";
import USDA from "./usda.json";

/**
 * The USDA FoodData Central SR Legacy foods (April 2018, public domain), for
 * anything the Ugandan list does not hold. Built by
 * docs/food/build/usda_catalog.py: available carbohydrate is carbohydrate by
 * difference minus fibre, and portions are USDA's household measures. No GI
 * is matched to them, so every one is "GI not known".
 */
type Row = [
  number,
  string,
  FoodGroup,
  number,
  number,
  number | null,
  number | null,
  number | null,
  [string, number][],
];

let foods: Food[] | null = null;

/** Built on first use: 7,000-odd foods need not be objects before anyone searches. */
export function usdaFoods(): Food[] {
  foods ??= (USDA.foods as unknown as Row[]).map(
    ([fdc, name, group, kcal, carbsG, proteinG, fatG, fibreG, portions]): Food => ({
      id: `usda:${fdc}`,
      name,
      localNames: [],
      group,
      portions: [
        ...portions.map(([label, grams]) => ({
          label,
          grams,
          source: { source: "USDA-SR-LEGACY" as const, item: `food_portion of FDC ${fdc}` },
        })),
        { label: "100 g", grams: 100 },
      ],
      per100g: { kcal, carbsG, proteinG, fatG, fibreG },
      gi: null,
      giCategory: giCategory(null),
      sources: [{ source: "USDA-SR-LEGACY", item: `FDC ${fdc} ${name}` }],
    }),
  );
  return foods;
}
