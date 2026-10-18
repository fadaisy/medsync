import type { Amounts } from "@/data/food/food-maths";
import type { Combo, Food, FoodGroup, Portion } from "@/data/food/types";
import type { LogRow } from "@/data/health-log";
import type { SaveResult } from "@/offline/outbox";

import { addAmounts, comboAmounts, forGrams } from "@/data/food/food-maths";
import { COMBOS, FOODS } from "@/data/food/foods";
import { addLog, dayKey, removeLog } from "@/data/health-log";

/**
 * Meals, from the patient's own log (migration 0176, ADR 0356): one row per
 * food eaten, kind 'meal'. numeric_value_1 = grams, numeric_value_2 = kcal at
 * the time (so the web and the care team can read it without the food list),
 * unit = the food or combo id from the built-in list (ADR 0353), note = the
 * meal (breakfast, lunch, supper, snack). Carbohydrate and glycemic load are
 * worked out again from the list, never stored.
 */
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

const ITEMS: Item[] = [
  ...FOODS.map((food): Item => ({ kind: "food", food })),
  ...COMBOS.map((combo): Item => ({ kind: "combo", combo })),
];
const BY_ID = new Map(ITEMS.map((i) => [itemId(i), i]));

export function itemId(i: Item): string {
  return i.kind === "food" ? i.food.id : i.combo.id;
}
export function itemName(i: Item): string {
  return i.kind === "food" ? i.food.name : i.combo.name;
}
export function itemById(id: string): Item | null {
  return BY_ID.get(id) ?? null;
}

const comboGrams = (c: Combo) => c.parts.reduce((n, p) => n + p.grams, 0);

/** The portions to offer. A combo has one: the whole dish as its parts make it. */
export function portionsOf(i: Item): Portion[] {
  return i.kind === "food" ? i.food.portions : [{ label: i.combo.description, grams: comboGrams(i.combo) }];
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
  const { gi, giCategory } = i.food;
  return gi === null ? "GI not known" : `GI ${Math.round(gi)}, ${giCategory}`;
}

const fold = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

/**
 * Foods whose name or local names hold every word typed, in a group or all.
 * Names that start with the first word come first; otherwise the list's order.
 */
export function searchItems(query: string, group: FoodGroup | null = null): Item[] {
  const words = fold(query).split(/\s+/).filter(Boolean);
  const hits = ITEMS.filter((i) => {
    const g = i.kind === "food" ? i.food.group : i.combo.group;
    if (group && g !== group) return false;
    const names = i.kind === "food" ? i.food.localNames : i.combo.localNames;
    const hay = fold([itemName(i), ...names.map((n) => n.name)].join(" "));
    return words.every((w) => hay.includes(w));
  });
  if (!words.length) return hits;
  const starts = (i: Item) => fold(itemName(i)).startsWith(words[0]);
  return [...hits.filter(starts), ...hits.filter((i) => !starts(i))];
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
export function mealsOn(rows: LogRow[], day: Date): MealEntry[] {
  const key = dayKey(day);
  const out: MealEntry[] = [];
  for (const r of rows) {
    if (r.kind !== "meal" || r.v1 === null || !r.unit) continue;
    if (dayKey(new Date(r.recordedAt)) !== key) continue;
    const item = itemById(r.unit);
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
