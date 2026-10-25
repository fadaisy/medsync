import type { Food } from "./types";

import { comboAmounts, forGrams, giCategory, glycemicLoad } from "./food-maths";
import { COMBOS, FOODS } from "./foods";

const food = (over: Partial<Food>): Food => ({
  id: "test",
  name: "Test",
  localNames: [],
  group: "staples",
  portions: [{ label: "1 lump", grams: 150 }],
  per100g: { kcal: 148, carbsG: 20, proteinG: 3.4, fatG: 1.9, fibreG: null },
  gi: 74,
  giCategory: "high",
  sources: [],
  ...over,
});

describe("food maths", () => {
  it("bands GI at 55 and 70, unknown when there is none", () => {
    expect([55, 56, 69, 70].map(giCategory)).toEqual(["low", "medium", "medium", "high"]);
    expect(giCategory(null)).toBe("unknown");
  });

  it("glycemic load is GI × available carbs ÷ 100", () => {
    expect(glycemicLoad(74, 30)).toBe(22.2);
    expect(glycemicLoad(null, 30)).toBeNull();
    expect(glycemicLoad(null, 0)).toBe(0);
  });

  it("scales a food to the portion eaten", () => {
    expect(forGrams(food({}), 150)).toEqual({
      kcal: 222,
      carbsG: 30,
      proteinG: 5.1,
      fatG: 2.9,
      fibreG: null,
      glycemicLoad: 22.2,
    });
  });

  it("adds a combo's parts; one unknown GI makes the load unknown", () => {
    const foods = [food({ id: "a" }), food({ id: "b", gi: null, giCategory: "unknown" })];
    const both = comboAmounts(
      {
        ...COMBOS[0],
        parts: [
          { foodId: "a", grams: 100 },
          { foodId: "a", grams: 50 },
        ],
      },
      foods,
    );
    expect(both).toMatchObject({ kcal: 222, carbsG: 30, glycemicLoad: 22.2 });
    const mixed = comboAmounts(
      {
        ...COMBOS[0],
        parts: [
          { foodId: "a", grams: 100 },
          { foodId: "b", grams: 100 },
        ],
      },
      foods,
    );
    expect(mixed.glycemicLoad).toBeNull();
    expect(mixed.kcal).toBe(296);
  });
});

describe("the food list", () => {
  it("has unique ids and a composition source for every food", () => {
    expect(new Set(FOODS.map((f) => f.id)).size).toBe(FOODS.length);
    for (const f of FOODS) {
      expect(["KE-FCT-2018", "WAFCT-2019", "USDA-SR-LEGACY"]).toContain(f.sources[0].source);
      expect(f.portions.length).toBeGreaterThan(0);
      expect(f.portions.every((p) => p.grams > 0)).toBe(true);
    }
  });

  it("gives a GI only with a GI source, and its category matches", () => {
    for (const f of FOODS) {
      const giSources = f.sources.filter(
        (s) => s.source === "GI-2008" || s.source === "KE-GI-2021",
      );
      expect(giSources).toHaveLength(f.gi === null ? 0 : 1);
      expect(f.giCategory).toBe(giCategory(f.gi));
    }
  });

  it("builds every combo from foods in the list", () => {
    for (const c of COMBOS) expect(() => comboAmounts(c, FOODS)).not.toThrow();
  });
});
