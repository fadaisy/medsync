import type { Amounts } from "../../mobile/src/data/food/food-maths";
import type { Combo, Food, FoodGroup, Portion } from "../../mobile/src/data/food/types";
import type { LogRow } from "./log";

import {
  addAmounts,
  comboAmounts,
  forGrams,
  giCategory,
} from "../../mobile/src/data/food/food-maths";
import { COMBOS, FOODS } from "../../mobile/src/data/food/foods";
import { dayKey } from "./log";

/**
 * Meals and packaged foods: the pure halves of the phone's `mobile/src/data/meals.ts` and `products.ts`, moved
 * verbatim. The food list itself stays the phone's pure data (`mobile/src/data/food`, owner-signed reference
 * data, ADR 0412). One row per food eaten, kind 'meal' (migration 0190, ADR 0356): v1 grams, v2 kcal at the
 * time, unit the food id (`usda:<fdc>` for USDA, `product:<id>` for a packaged one), note the meal.
 * USDA's 7,000 foods are not imported here: a caller that has them passes them in (`extra`), so a browser
 * never loads them.
 */
export type { Amounts } from "../../mobile/src/data/food/food-maths";
export type { Combo, Food, FoodGroup, Portion } from "../../mobile/src/data/food/types";

export type MealSlot = "breakfast" | "lunch" | "supper" | "snack";

export const SLOTS: { key: MealSlot; label: string }[] = [
  { key: "breakfast", label: "Breakfast" },
  { key: "lunch", label: "Lunch" },
  { key: "supper", label: "Supper" },
  { key: "snack", label: "Snack" },
];

export const GROUPS: { key: FoodGroup; label: string }[] = [
  { key: "staples", label: "Staples" },
  { key: "legumes", label: "Beans and sauces" },
  { key: "meat-fish-eggs", label: "Meat, fish, eggs" },
  { key: "greens-vegetables", label: "Greens" },
  { key: "fruits", label: "Fruit" },
  { key: "snacks", label: "Snacks" },
  { key: "drinks", label: "Drinks" },
  { key: "basics", label: "Sugar, oil, salt" },
];

/** The meal a time of day most likely is. */
export function slotFor(at: Date): MealSlot {
  const h = at.getHours();
  if (h >= 5 && h < 11) return "breakfast";
  if (h >= 12 && h < 16) return "lunch";
  if (h >= 18 && h < 23) return "supper";
  return "snack";
}

/** Something the patient can log: one food, or a dish of several (a rolex). */
export type Item = { kind: "food"; food: Food } | { kind: "combo"; combo: Combo };

export function itemId(i: Item): string {
  return i.kind === "food" ? i.food.id : i.combo.id;
}
export function itemName(i: Item): string {
  return i.kind === "food" ? i.food.name : i.combo.name;
}

/** The Ugandan list and its dishes: always searched first (owner, 18 Oct 2026). */
const LOCAL: Item[] = [
  ...FOODS.map((food): Item => ({ kind: "food", food })),
  ...COMBOS.map((combo): Item => ({ kind: "combo", combo })),
];
const BY_ID = new Map(LOCAL.map((i) => [itemId(i), i]));

/** The item a meal row names: a Ugandan food or dish, a USDA food in `extra`, or one of the patient's products. */
export function itemById(id: string, products: Product[] = [], extra: Food[] = []): Item | null {
  if (id.startsWith("usda:")) {
    const food = extra.find((f) => f.id === id);
    return food ? { kind: "food", food } : null;
  }
  if (id.startsWith("product:")) {
    const p = products.find((x) => `product:${x.id}` === id);
    return p ? { kind: "food", food: productFood(p) } : null;
  }
  return BY_ID.get(id) ?? null;
}

const comboGrams = (c: Combo) => c.parts.reduce((n, p) => n + p.grams, 0);

/** The portions to offer. A combo has one: the whole dish as its parts make it. */
export function portionsOf(i: Item): Portion[] {
  return i.kind === "food"
    ? i.food.portions
    : [{ label: i.combo.description, grams: comboGrams(i.combo) }];
}

/** What `grams` of an item holds; a combo scales all its parts together. */
export function amountsFor(i: Item, grams: number): Amounts {
  if (i.kind === "food") return forGrams(i.food, grams);
  const k = grams / comboGrams(i.combo);
  return comboAmounts(
    { ...i.combo, parts: i.combo.parts.map((p) => ({ ...p, grams: p.grams * k })) },
    FOODS,
  );
}

/** "GI 74, high", or that it is not known. Words only: a GI is never a patient's state. */
export function giLine(i: Item): string {
  if (i.kind === "combo") return "GI not known for a mixed dish";
  const { gi, giCategory: cat } = i.food;
  return gi === null ? "GI not known" : `GI ${Math.round(gi)}, ${cat}`;
}

const fold = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

const hays = new WeakMap<Item, string>();
const hay = (i: Item) => {
  let h = hays.get(i);
  if (h === undefined) {
    const names = i.kind === "food" ? i.food.localNames : i.combo.localNames;
    h = fold([itemName(i), ...names.map((n) => n.name)].join(" "));
    hays.set(i, h);
  }
  return h;
};

/** The first words typed, folded, for a caller that searches its own list (USDA on the server). */
export const searchWords = (query: string) => fold(query).split(/\s+/).filter(Boolean);

/** Whether an item is in a group (or all) and holds every word typed. */
export function itemMatches(i: Item, words: string[], group: FoodGroup | null): boolean {
  const g = i.kind === "food" ? i.food.group : i.combo.group;
  return (!group || g === group) && words.every((w) => hay(i).includes(w));
}

/**
 * Foods whose name or local names hold every word typed, in a group or all. The Ugandan list comes first,
 * then the patient's own packaged foods, then `extra` (USDA's, already matched); within each, names that
 * start with the first word lead.
 */
export function searchItems(
  query: string,
  group: FoodGroup | null = null,
  products: Product[] = [],
  extra: Food[] = [],
): Item[] {
  const words = searchWords(query);
  const rank = (list: Item[]) => {
    const hits = list.filter((i) => itemMatches(i, words, group));
    if (!words.length) return hits;
    const starts = (i: Item) => fold(itemName(i)).startsWith(words[0]!);
    return [...hits.filter(starts), ...hits.filter((i) => !starts(i))];
  };
  const mine = products.map((p): Item => ({ kind: "food", food: productFood(p) }));
  // With nothing typed, the Ugandan list alone: USDA's 7,000 come in when asked for.
  const more = words.length ? rank(extra.map((food): Item => ({ kind: "food", food }))) : [];
  return [...rank(LOCAL), ...rank(mine), ...more];
}

export type MealEntry = {
  id: string;
  item: Item;
  grams: number;
  slot: MealSlot;
  at: string;
  amounts: Amounts;
};

const isSlot = (s: string | null): s is MealSlot => SLOTS.some((x) => x.key === s);

/** The day's meals, oldest first. A row naming a food no longer in the list is left out. */
export function mealsOn(
  rows: LogRow[],
  day: Date,
  products: Product[] = [],
  extra: Food[] = [],
): MealEntry[] {
  const key = dayKey(day);
  const out: MealEntry[] = [];
  for (const r of rows) {
    if (r.kind !== "meal" || r.v1 === null || !r.unit) continue;
    if (dayKey(new Date(r.recordedAt)) !== key) continue;
    const item = itemById(r.unit, products, extra);
    if (!item) continue;
    out.push({
      id: r.id,
      item,
      grams: r.v1,
      slot: isSlot(r.note) ? r.note : "snack",
      at: r.recordedAt,
      amounts: amountsFor(item, r.v1),
    });
  }
  return out.sort((a, b) => a.at.localeCompare(b.at));
}

export function dayTotals(entries: MealEntry[]): Amounts {
  return addAmounts(entries.map((e) => e.amounts));
}

/** The portion eaten in words: "1 ladle", "1 ladle × 2", or the grams when it is no whole portion. */
export function portionLabel(i: Item, grams: number): string {
  for (const p of portionsOf(i)) {
    const n = grams / p.grams;
    if (Math.abs(n - Math.round(n)) > 0.01 || n < 0.99 || n > 10) continue;
    return Math.round(n) === 1 ? p.label : `${p.label} × ${Math.round(n)}`;
  }
  return `${Math.round(grams)} g`;
}

/* ─── Packaged foods (ADR 0357) ───────────────────────────────────────── */

export type ProductSource = "open_food_facts" | "label_photo" | "typed";

export type Product = {
  id: string;
  barcode: string | null;
  name: string;
  brand: string | null;
  kcal: number;
  carbsG: number;
  proteinG: number | null;
  fatG: number | null;
  fibreG: number | null;
  servingG: number | null;
  source: ProductSource;
};

/** A product not yet saved: what a lookup, a label or the form gives. */
export type ProductDraft = Omit<Product, "id">;

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** A product as a food the meal maths can use. No label prints a GI, so every product is "GI not known". */
export function productFood(p: Product): Food {
  return {
    id: `product:${p.id}`,
    name: p.brand ? `${p.name} (${p.brand})` : p.name,
    localNames: [],
    group: "snacks",
    portions: [
      ...(p.servingG ? [{ label: `1 serving (${p.servingG} g)`, grams: p.servingG }] : []),
      { label: "100 g", grams: 100 },
    ],
    per100g: {
      kcal: p.kcal,
      carbsG: p.carbsG,
      proteinG: p.proteinG,
      fatG: p.fatG,
      fibreG: p.fibreG,
    },
    gi: null,
    giCategory: giCategory(null),
    sources: [],
  };
}

/** Open Food Facts' product endpoint and the fields a meal needs. */
export const OFF_URL = "https://world.openfoodfacts.org/api/v2/product";
export const OFF_FIELDS = "product_name,product_name_en,brands,nutriments,serving_quantity";

/**
 * An Open Food Facts product → a draft, or null when it lacks the energy or carbohydrate per 100 g that a
 * meal needs. Values are the database's, per 100 g, as volunteers typed them from the label.
 */
export function fromOpenFoodFacts(code: string, body: unknown): ProductDraft | null {
  const b = body as {
    status?: number;
    product?: {
      product_name?: string;
      product_name_en?: string;
      brands?: string;
      serving_quantity?: number | string;
      nutriments?: Record<string, unknown>;
    };
  } | null;
  const p = b?.status === 1 ? b.product : undefined;
  const n = p?.nutriments ?? {};
  const kj = num(n["energy-kj_100g"]);
  const kcal = num(n["energy-kcal_100g"]) ?? (kj !== null ? kj / 4.184 : null);
  const carbsG = num(n["carbohydrates_100g"]);
  if (!p || kcal === null || carbsG === null || kcal > 950 || carbsG > 100) return null;
  const name = (p.product_name_en || p.product_name || "").trim();
  const serving = num(p.serving_quantity);
  return {
    barcode: code,
    name: name || `Product ${code}`,
    brand: p.brands?.split(",")[0]?.trim() || null,
    kcal: Math.round(kcal),
    carbsG: Math.round(carbsG * 10) / 10,
    proteinG: num(n["proteins_100g"]),
    fatG: num(n["fat_100g"]),
    fibreG: num(n["fiber_100g"]),
    servingG: serving && serving > 0 && serving <= 5000 ? serving : null,
    source: "open_food_facts",
  };
}

/** The form's boxes, as text. */
export type LabelValues = Partial<
  Record<"name" | "kcal" | "carbs" | "protein" | "fat" | "fibre" | "servingG", string>
>;

/** The form's text boxes → a draft, or what is wrong with them. */
export function draftFromForm(
  v: LabelValues,
  barcode: string | null,
  source: ProductSource,
): { ok: true; draft: ProductDraft } | { ok: false; error: string } {
  const n = (s?: string) => (s && s.trim() ? Number(s.replace(",", ".")) : null);
  const name = (v.name ?? "").trim();
  const kcal = n(v.kcal);
  const carbs = n(v.carbs);
  const protein = n(v.protein);
  const fat = n(v.fat);
  const fibre = n(v.fibre);
  const serving = n(v.servingG);
  if (!name) return { ok: false, error: "Give it a name." };
  if (kcal === null || !Number.isFinite(kcal) || kcal < 0 || kcal > 950)
    return { ok: false, error: "Energy per 100 g is between 0 and 950 kcal." };
  if (carbs === null || !Number.isFinite(carbs) || carbs < 0 || carbs > 100)
    return { ok: false, error: "Carbohydrate per 100 g is between 0 and 100 g." };
  for (const x of [protein, fat, fibre])
    if (x !== null && (!Number.isFinite(x) || x < 0 || x > 100))
      return { ok: false, error: "Each amount per 100 g is between 0 and 100 g." };
  if (serving !== null && (!Number.isFinite(serving) || serving < 1 || serving > 5000))
    return { ok: false, error: "A serving is between 1 and 5000 g." };
  return {
    ok: true,
    draft: {
      barcode,
      name,
      brand: null,
      kcal: Math.round(kcal),
      carbsG: carbs,
      proteinG: protein,
      fatG: fat,
      fibreG: fibre,
      servingG: serving,
      source,
    },
  };
}
