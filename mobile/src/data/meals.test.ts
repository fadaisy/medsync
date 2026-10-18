import type { LogRow } from "@/data/health-log";

import { FOODS } from "@/data/food/foods";
import {
  amountsFor,
  dayTotals,
  giLine,
  itemById,
  mealsOn,
  portionLabel,
  searchItems,
  slotFor,
} from "@/data/meals";

const at = (h: number, d = 18) => new Date(2026, 9, d, h, 0);
let n = 0;
const meal = (unit: string, grams: number, when: Date, note = "lunch"): LogRow => ({
  id: String(++n),
  kind: "meal",
  recordedAt: when.toISOString(),
  v1: grams,
  v2: null,
  unit,
  note,
});

describe("meals", () => {
  it("finds foods by English or local name, name starts first", () => {
    const ids = searchItems("posho").map((i) => (i.kind === "food" ? i.food.id : i.combo.id));
    expect(ids[0]).toBe("posho");
    expect(ids).toContain("posho-whole");
    expect(searchItems("ebijanjaalo").length).toBeGreaterThan(0);
    expect(searchItems("rolex")[0]?.kind).toBe("combo");
    expect(searchItems("", "fruits").every((i) => i.kind === "food" && i.food.group === "fruits")).toBe(true);
    expect(searchItems("zzzz")).toEqual([]);
  });

  it("guesses the meal from the time of day", () => {
    expect([at(7), at(13), at(19), at(10.99), at(16), at(2)].map(slotFor)).toEqual([
      "breakfast",
      "lunch",
      "supper",
      "breakfast",
      "snack",
      "snack",
    ]);
  });

  it("reads today's meal rows, oldest first, skipping other days and unknown foods", () => {
    const rows = [
      meal("rice-boiled", 158, at(13)),
      meal("beans-stew", 100, at(8), "breakfast"),
      meal("posho", 150, at(13, 17)),
      meal("no-such-food", 100, at(9)),
    ];
    const today = mealsOn(rows, at(12));
    expect(today.map((e) => [e.item.kind === "food" && e.item.food.id, e.slot])).toEqual([
      ["beans-stew", "breakfast"],
      ["rice-boiled", "lunch"],
    ]);
  });

  it("totals the day; one food with no GI makes the load unknown", () => {
    const rice = FOODS.find((f) => f.id === "rice-boiled")!;
    const known = mealsOn([meal("rice-boiled", 100, at(13))], at(12));
    expect(dayTotals(known)).toMatchObject({
      kcal: rice.per100g.kcal,
      glycemicLoad: 20.2, // GI 77 × 26.2 g ÷ 100
    });
    const mixed = mealsOn(
      [meal("rice-boiled", 100, at(13)), meal("groundnut-sauce", 100, at(13))],
      at(12),
    );
    expect(dayTotals(mixed).glycemicLoad).toBeNull();
  });

  it("scales a combo by its weight", () => {
    const rolex = itemById("rolex")!;
    const whole = amountsFor(rolex, 210);
    expect(amountsFor(rolex, 420).kcal).toBeCloseTo(whole.kcal * 2, -1);
    expect(giLine(rolex)).toBe("GI not known for a mixed dish");
  });

  it("names the portion eaten, or its grams", () => {
    const posho = itemById("posho")!;
    expect(portionLabel(posho, 150)).toBe("1 fist-sized lump");
    expect(portionLabel(posho, 450)).toBe("1 fist-sized lump × 3");
    expect(portionLabel(posho, 75)).toBe("75 g");
    expect(giLine(posho)).toBe("GI 74, high");
  });
});
