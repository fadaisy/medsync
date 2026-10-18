/**
 * The built-in food list's shape (ADR 0353). Values are per 100 g of the food
 * as eaten; `carbsG` is available carbohydrate (fibre not counted).
 */
export type FoodGroup =
  | "staples"
  | "legumes"
  | "meat-fish-eggs"
  | "greens-vegetables"
  | "fruits"
  | "snacks"
  | "drinks"
  | "basics";

/** Low ≤ 55, medium 56–69, high ≥ 70 (glucose = 100). "unknown" when no published GI. */
export type GiCategory = "low" | "medium" | "high" | "unknown";

/** Keys of docs/food/sources.md. */
export type SourceId = "KE-FCT-2018" | "WAFCT-2019" | "USDA-SR-LEGACY" | "GI-2008" | "KE-GI-2021";

export type SourceRef = { source: SourceId; item: string; where?: string };

export type LocalName = { name: string; language: string };

/** A portion without `source` is a MedSync household estimate, not a table value. */
export type Portion = { label: string; grams: number; source?: SourceRef };

export type Per100g = {
  kcal: number;
  carbsG: number;
  proteinG: number | null;
  fatG: number | null;
  fibreG: number | null;
};

export type Food = {
  id: string;
  name: string;
  localNames: LocalName[];
  group: FoodGroup;
  portions: Portion[];
  per100g: Per100g;
  /** Null when no published GI was found: shown as unknown, never guessed. */
  gi: number | null;
  giCategory: GiCategory;
  sources: SourceRef[];
  note?: string;
};

/** A dish logged as its parts, e.g. a rolex is a chapati and an omelette. */
export type Combo = {
  id: string;
  name: string;
  localNames: LocalName[];
  group: FoodGroup;
  description: string;
  parts: { foodId: string; grams: number }[];
};
