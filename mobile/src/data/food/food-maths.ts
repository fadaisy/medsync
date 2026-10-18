import type { Combo, Food, GiCategory } from "./types";

/** Per-portion numbers. `glycemicLoad` is null when the GI is unknown. */
export type Amounts = {
  kcal: number;
  carbsG: number;
  proteinG: number | null;
  fatG: number | null;
  fibreG: number | null;
  glycemicLoad: number | null;
};

const r1 = (x: number) => Math.round(x * 10) / 10;

export function giCategory(gi: number | null): GiCategory {
  if (gi === null) return "unknown";
  return gi <= 55 ? "low" : gi < 70 ? "medium" : "high";
}

/** GL = GI × available carbohydrate (g) ÷ 100. No carbohydrate means no load, whatever the GI. */
export function glycemicLoad(gi: number | null, carbsG: number): number | null {
  if (carbsG === 0) return 0;
  return gi === null ? null : r1((gi * carbsG) / 100);
}

/** What `grams` of a food holds. */
export function forGrams(food: Food, grams: number): Amounts {
  const p = food.per100g;
  const of = (v: number | null) => (v === null ? null : r1((v * grams) / 100));
  const carbsG = r1((p.carbsG * grams) / 100);
  return {
    kcal: Math.round((p.kcal * grams) / 100),
    carbsG,
    proteinG: of(p.proteinG),
    fatG: of(p.fatG),
    fibreG: of(p.fibreG),
    glycemicLoad: glycemicLoad(food.gi, carbsG),
  };
}

/** A combo's totals: the sum of its parts. Loads add up; any unknown part makes the load unknown. */
export function comboAmounts(combo: Combo, foods: Food[]): Amounts {
  const parts = combo.parts.map(({ foodId, grams }) => {
    const food = foods.find((f) => f.id === foodId);
    if (!food) throw new Error(`combo ${combo.id}: no food ${foodId}`);
    return forGrams(food, grams);
  });
  const sum = (pick: (a: Amounts) => number | null) =>
    parts.some((a) => pick(a) === null) ? null : r1(parts.reduce((t, a) => t + (pick(a) ?? 0), 0));
  return {
    kcal: parts.reduce((t, a) => t + a.kcal, 0),
    carbsG: sum((a) => a.carbsG) ?? 0,
    proteinG: sum((a) => a.proteinG),
    fatG: sum((a) => a.fatG),
    fibreG: sum((a) => a.fibreG),
    glycemicLoad: sum((a) => a.glycemicLoad),
  };
}
