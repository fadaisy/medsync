import type { FoodGroup } from "@/data/food/types";
import type { LogRow } from "@/data/health-log";
import type { Product } from "@/data/products";
import type { SaveResult } from "@/offline/outbox";
import type { Item, MealEntry, MealSlot } from "@patient-core/care-meals";
import { amountsFor, itemId, itemName, SLOTS } from "@patient-core/care-meals";

import { COMBOS, FOODS } from "@/data/food/foods";
import { usdaFoods } from "@/data/food/usda";
import { addLog, dayKey, removeLog } from "@/data/health-log";
import { productFood } from "@/data/products";

export type { Item, MealEntry, MealSlot } from "@patient-core/care-meals";
export {
  amountsFor,
  dayTotals,
  giLine,
  GROUPS,
  itemId,
  itemName,
  portionLabel,
  portionsOf,
  SLOTS,
  slotFor,
} from "@patient-core/care-meals";

/** The Ugandan list and its dishes: always searched first (owner, 18 Oct 2026). */
const LOCAL: Item[] = [
  ...FOODS.map((food): Item => ({ kind: "food", food })),
  ...COMBOS.map((combo): Item => ({ kind: "combo", combo })),
];
const BY_ID = new Map(LOCAL.map((i) => [itemId(i), i]));
let usda: Map<string, Item> | null = null;
const usdaItems = () =>
  (usda ??= new Map(usdaFoods().map((food) => [food.id, { kind: "food", food } as Item])));

/** The item a meal row names: a Ugandan food or dish, a USDA food, or one of the patient's products. */
export function itemById(id: string, products: Product[] = []): Item | null {
  if (id.startsWith("usda:")) return usdaItems().get(id) ?? null;
  if (id.startsWith("product:")) {
    const p = products.find((x) => `product:${x.id}` === id);
    return p ? { kind: "food", food: productFood(p) } : null;
  }
  return BY_ID.get(id) ?? null;
}

const fold = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

const hayOf = (i: Item) => {
  const names = i.kind === "food" ? i.food.localNames : i.combo.localNames;
  return fold([itemName(i), ...names.map((n) => n.name)].join(" "));
};
const hays = new WeakMap<Item, string>();
const hay = (i: Item) => {
  let h = hays.get(i);
  if (h === undefined) hays.set(i, (h = hayOf(i)));
  return h;
};

/**
 * Foods whose name or local names hold every word typed, in a group or all.
 * The Ugandan list comes first, then the patient's own packaged foods, then
 * USDA's; within each, names that start with the first word lead.
 */
export function searchItems(
  query: string,
  group: FoodGroup | null = null,
  products: Product[] = [],
): Item[] {
  const words = fold(query).split(/\s+/).filter(Boolean);
  const groupOf = (i: Item) => (i.kind === "food" ? i.food.group : i.combo.group);
  const match = (i: Item) => (!group || groupOf(i) === group) && words.every((w) => hay(i).includes(w));
  const rank = (list: Item[]) => {
    const hits = list.filter(match);
    if (!words.length) return hits;
    const starts = (i: Item) => fold(itemName(i)).startsWith(words[0]);
    return [...hits.filter(starts), ...hits.filter((i) => !starts(i))];
  };
  const mine = products.map((p): Item => ({ kind: "food", food: productFood(p) }));
  // With nothing typed, the Ugandan list alone: USDA's 7,000 come in when asked for.
  return [...rank(LOCAL), ...rank(mine), ...(words.length ? rank([...usdaItems().values()]) : [])];
}

const isSlot = (s: string | null): s is MealSlot => SLOTS.some((x) => x.key === s);

/** The day's meals, oldest first. A row naming a food no longer in the list is left out. */
export function mealsOn(rows: LogRow[], day: Date, products: Product[] = []): MealEntry[] {
  const key = dayKey(day);
  const out: MealEntry[] = [];
  for (const r of rows) {
    if (r.kind !== "meal" || r.v1 === null || !r.unit) continue;
    if (dayKey(new Date(r.recordedAt)) !== key) continue;
    const item = itemById(r.unit, products);
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

export const mealRepo = {
  log(item: Item, grams: number, slot: MealSlot): Promise<SaveResult> {
    return addLog({
      kind: "meal",
      v1: Math.round(grams * 10) / 10,
      v2: amountsFor(item, grams).kcal,
      unit: itemId(item),
      note: slot,
    });
  },
  remove(id: string): Promise<SaveResult> {
    return removeLog(id);
  },
};
