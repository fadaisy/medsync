import "server-only";

import type { Food, Product, ProductSource } from "@patient-core/care-meals";
import { and, desc, eq } from "drizzle-orm";

import { db } from "@/db";
import { patientFoodProducts } from "@/db/schema/patient-self-tracking";
import { usdaFoods } from "@/mobile/src/data/food/usda";

/**
 * Move and eat's reads beyond the log: the patient's own packaged foods (`patient_food_products`, the phone's
 * query in `data/products.ts`) and the USDA foods today's meals name, looked up here so the browser never
 * loads USDA's list.
 */

const num = (v: string | null): number | null => {
  if (v === null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

export async function loadProducts(userId: string): Promise<Product[]> {
  const rows = await db
    .select()
    .from(patientFoodProducts)
    .where(
      and(eq(patientFoodProducts.patientUserId, userId), eq(patientFoodProducts.state, "active")),
    )
    .orderBy(desc(patientFoodProducts.createdAt))
    .limit(1000);
  return rows.map((r) => ({
    id: r.id,
    barcode: r.barcode,
    name: r.name,
    brand: r.brand,
    kcal: num(r.kcal100g) ?? 0,
    carbsG: num(r.carbs100g) ?? 0,
    proteinG: num(r.protein100g),
    fatG: num(r.fat100g),
    fibreG: num(r.fibre100g),
    servingG: num(r.servingG),
    source: r.source as ProductSource,
  }));
}

/** The USDA foods these ids name (`usda:<fdc>`). */
export function usdaByIds(ids: Iterable<string>): Food[] {
  const want = new Set([...ids].filter((id) => id.startsWith("usda:")));
  return want.size ? usdaFoods().filter((f) => want.has(f.id)) : [];
}
