import { draftFromForm, fromOpenFoodFacts, productFood } from "@/data/products";

const off = (nutriments: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({
  status: 1,
  product: { product_name: "Digestive biscuits", brands: "Brand A, Brand B", nutriments, ...extra },
});

describe("packaged foods", () => {
  it("takes Open Food Facts values per 100 g, kcal from kJ only when missing", () => {
    expect(
      fromOpenFoodFacts(
        "5000168001234",
        off(
          { "energy-kcal_100g": 480, carbohydrates_100g: 62.3, proteins_100g: 7, fat_100g: 21 },
          { serving_quantity: 15 },
        ),
      ),
    ).toEqual({
      barcode: "5000168001234",
      name: "Digestive biscuits",
      brand: "Brand A",
      kcal: 480,
      carbsG: 62.3,
      proteinG: 7,
      fatG: 21,
      fibreG: null,
      servingG: 15,
      source: "open_food_facts",
    });
    expect(fromOpenFoodFacts("1", off({ "energy-kj_100g": 1674, carbohydrates_100g: 10 }))?.kcal).toBe(
      400,
    );
  });

  it("gives nothing without energy and carbohydrate, or for an unknown code", () => {
    expect(fromOpenFoodFacts("1", off({ "energy-kcal_100g": 40 }))).toBeNull();
    expect(fromOpenFoodFacts("1", { status: 0 })).toBeNull();
    expect(fromOpenFoodFacts("1", off({ "energy-kcal_100g": 2000, carbohydrates_100g: 1 }))).toBeNull();
  });

  it("checks the typed label before it becomes a product", () => {
    expect(draftFromForm({ name: "Juice", kcal: "45", carbs: "10,5" }, null, "typed")).toMatchObject({
      ok: true,
      draft: { name: "Juice", kcal: 45, carbsG: 10.5, proteinG: null, source: "typed" },
    });
    expect(draftFromForm({ kcal: "45", carbs: "10" }, null, "typed")).toMatchObject({ ok: false });
    expect(draftFromForm({ name: "X", kcal: "45", carbs: "120" }, null, "typed")).toMatchObject({
      ok: false,
    });
  });

  it("logs as a food with a serving and 100 g, and GI not known", () => {
    const f = productFood({
      id: "p1",
      barcode: null,
      name: "Juice",
      brand: null,
      kcal: 45,
      carbsG: 10,
      proteinG: null,
      fatG: null,
      fibreG: null,
      servingG: 250,
      source: "typed",
    });
    expect(f.portions.map((p) => p.grams)).toEqual([250, 100]);
    expect(f.gi).toBeNull();
    expect(f.id).toBe("product:p1");
  });
});
