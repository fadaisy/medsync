"use server";

import type { Food, FoodGroup, ProductDraft } from "@patient-core/care-meals";
import { revalidatePath } from "next/cache";
import { itemMatches, searchWords } from "@patient-core/care-meals";
import { ACTIVITIES } from "@patient-core/care-move";
import { GLASSES } from "@patient-core/log";
import { z } from "zod";

import { logger } from "@/lib/logger";
import { requirePatientScope } from "@/lib/patient/scope";
import { createClient } from "@/lib/supabase/server";
import { usdaFoods } from "@/mobile/src/data/food/usda";

/**
 * Move and eat's writes, the phone's own (`mobile/src/data/{health-log,activity,meals,products}.ts`): plain
 * inserts into the patient's own `personal_health_logs` and `patient_food_products` rows under RLS (migrations
 * 0029, 0170, 0188, 0190, 0191), zod-checked here. A meal is taken back by marking its row deleted, never
 * removed, as on the phone. USDA's list is searched here so a browser never downloads it.
 */

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };
const FAILED = "Couldn't save that. Try again later.";

function refresh() {
  revalidatePath("/pw/patient", "layout");
  revalidatePath("/patient", "layout");
}

async function addLog(row: {
  kind: "water" | "exercise" | "meal";
  v1: number;
  v2?: number | null;
  unit: string;
  note?: string | null;
}): Promise<Result> {
  const scope = await requirePatientScope();
  const supabase = await createClient();
  const { error } = await supabase.from("personal_health_logs").insert({
    patient_user_id: scope.userId,
    kind: row.kind,
    recorded_at: new Date().toISOString(),
    numeric_value_1: row.v1,
    numeric_value_2: row.v2 ?? null,
    unit: row.unit,
    note: row.note ?? null,
  });
  if (error) {
    logger.warn("patient_web.care.log_failed", { kind: row.kind, reason: error.message });
    return { ok: false, error: FAILED };
  }
  refresh();
  return { ok: true };
}

/** The day's new water total after a tap (append-only: a tap down is a smaller total). */
export async function logWaterAction(total: number): Promise<Result> {
  const n = z.number().int().min(0).max(GLASSES).safeParse(total);
  if (!n.success) return { ok: false, error: FAILED };
  return addLog({ kind: "water", v1: n.data, unit: "glasses" });
}

const Exercise = z.object({
  unit: z
    .string()
    .max(40)
    .refine((u) => ACTIVITIES.some((a) => a.key === u.split(":")[0])),
  minutes: z.number().int().min(1).max(600),
  kcal: z.number().int().min(0).max(10_000).nullable(),
});

export async function logExerciseAction(input: unknown): Promise<Result> {
  const p = Exercise.safeParse(input);
  if (!p.success) return { ok: false, error: FAILED };
  return addLog({ kind: "exercise", v1: p.data.minutes, v2: p.data.kcal, unit: p.data.unit });
}

const Meal = z.object({
  itemId: z.string().min(1).max(80),
  grams: z.number().positive().max(5000),
  kcal: z.number().min(0).max(50_000),
  slot: z.enum(["breakfast", "lunch", "supper", "snack"]),
});

export async function logMealAction(input: unknown): Promise<Result> {
  const p = Meal.safeParse(input);
  if (!p.success) return { ok: false, error: FAILED };
  return addLog({
    kind: "meal",
    v1: Math.round(p.data.grams * 10) / 10,
    v2: Math.round(p.data.kcal),
    unit: p.data.itemId,
    note: p.data.slot,
  });
}

export async function removeMealAction(id: string): Promise<Result> {
  if (!z.string().uuid().safeParse(id).success)
    return { ok: false, error: "Couldn't remove that. Try again when you are online." };
  const scope = await requirePatientScope();
  const supabase = await createClient();
  const { error } = await supabase
    .from("personal_health_logs")
    .update({ state: "deleted" })
    .eq("id", id)
    .eq("patient_user_id", scope.userId)
    .eq("kind", "meal");
  if (error) {
    logger.warn("patient_web.care.meal_remove_failed", { reason: error.message });
    return { ok: false, error: "Couldn't remove that. Try again when you are online." };
  }
  refresh();
  return { ok: true };
}

const per100 = z.number().min(0).max(100).nullable();
const Draft = z.object({
  barcode: z
    .string()
    .regex(/^\d{6,14}$/)
    .nullable(),
  name: z.string().trim().min(1).max(200),
  brand: z.string().max(200).nullable(),
  kcal: z.number().min(0).max(950),
  carbsG: z.number().min(0).max(100),
  proteinG: per100,
  fatG: per100,
  fibreG: per100,
  servingG: z.number().min(1).max(5000).nullable(),
  source: z.enum(["open_food_facts", "label_photo", "typed"]),
});

/** Keep a packaged food before its first meal is logged (ADR 0357); its id names it on the meal row. */
export async function saveProductAction(draft: ProductDraft): Promise<Result<{ id: string }>> {
  const p = Draft.safeParse(draft);
  if (!p.success) return { ok: false, error: FAILED };
  const d = p.data;
  const scope = await requirePatientScope();
  const supabase = await createClient();
  const id = crypto.randomUUID();
  const { error } = await supabase.from("patient_food_products").insert({
    id,
    patient_user_id: scope.userId,
    barcode: d.barcode,
    name: d.name,
    brand: d.brand,
    kcal_100g: d.kcal,
    carbs_100g: d.carbsG,
    protein_100g: d.proteinG,
    fat_100g: d.fatG,
    fibre_100g: d.fibreG,
    serving_g: d.servingG,
    source: d.source,
  });
  if (error) {
    logger.warn("patient_web.care.product_failed", { reason: error.message });
    return { ok: false, error: FAILED };
  }
  return { ok: true, id };
}

const GROUPS = new Set<FoodGroup>([
  "staples",
  "legumes",
  "meat-fish-eggs",
  "greens-vegetables",
  "fruits",
  "snacks",
  "drinks",
  "basics",
]);

/** USDA foods holding every word typed (the phone searches the same list on the device). At most 60. */
export async function searchUsdaAction(query: string, group: string | null): Promise<Food[]> {
  await requirePatientScope();
  const words = searchWords(String(query).slice(0, 80));
  if (!words.length) return [];
  const g = group && GROUPS.has(group as FoodGroup) ? (group as FoodGroup) : null;
  const hits = usdaFoods().filter((food) => itemMatches({ kind: "food", food }, words, g));
  // As the phone ranks: names that start with the first word lead.
  const starts = (f: Food) => searchWords(f.name)[0]?.startsWith(words[0]!) ?? false;
  return [...hits.filter(starts), ...hits.filter((f) => !starts(f))].slice(0, 60);
}
