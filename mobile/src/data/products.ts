import type { Row, SaveResult } from "@/offline/outbox";
import type { LabelValues, Product, ProductDraft, ProductSource } from "@patient-core/care-meals";
import { useEffect } from "react";
import { fromOpenFoodFacts } from "@patient-core/care-meals";
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";

import { onAccountChange } from "@/data/health-log";
import { createStore, useStore } from "@/data/store";
import { currentUserId, db, insertOrQueue, newId, readOutbox } from "@/offline/outbox";

export type { LabelValues, Product, ProductDraft, ProductSource } from "@patient-core/care-meals";
export { draftFromForm, fromOpenFoodFacts, productFood } from "@patient-core/care-meals";

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

export function fromDb(r: Record<string, unknown>): Product {
  return {
    id: String(r.id),
    barcode: typeof r.barcode === "string" ? r.barcode : null,
    name: String(r.name),
    brand: typeof r.brand === "string" ? r.brand : null,
    kcal: num(r.kcal_100g) ?? 0,
    carbsG: num(r.carbs_100g) ?? 0,
    proteinG: num(r.protein_100g),
    fatG: num(r.fat_100g),
    fibreG: num(r.fibre_100g),
    servingG: num(r.serving_g),
    source: r.source as ProductSource,
  };
}

/* ─── Open Food Facts ────────────────────────────────────────────────── */

const OFF = "https://world.openfoodfacts.org/api/v2/product";
const FIELDS = "product_name,product_name_en,brands,nutriments,serving_quantity";

export type Lookup =
  | { kind: "found"; draft: ProductDraft }
  | { kind: "missing" }
  | { kind: "offline" };

export async function lookupBarcode(code: string): Promise<Lookup> {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), 10_000);
  try {
    // Open Food Facts asks every app to name itself.
    const res = await fetch(`${OFF}/${encodeURIComponent(code)}.json?fields=${FIELDS}`, {
      headers: { "User-Agent": "MedSync patient app/1.0" },
      signal: abort.signal,
    });
    if (res.status === 404) return { kind: "missing" };
    if (!res.ok) return { kind: "offline" };
    const draft = fromOpenFoodFacts(code, await res.json());
    return draft ? { kind: "found", draft } : { kind: "missing" };
  } catch {
    return { kind: "offline" };
  } finally {
    clearTimeout(timer);
  }
}

/* ─── The label photo ────────────────────────────────────────────────── */

const ORIGIN = process.env.EXPO_PUBLIC_WEB_ORIGIN;
const LABEL_URL = ORIGIN ? `${ORIGIN.replace(/\/$/, "")}/api/mobile/food-label` : null;

export type LabelResult =
  | { ok: true; values: LabelValues }
  | { ok: false; message: string }
  | { ok: false; cancelled: true };

const NO_READ = "Couldn't read the label. Try again with the panel filling the photo, or type it.";

/** The camera, the photo shrunk to 1024 px, then the label read on the server (never stored). */
export async function labelFromPhoto(): Promise<LabelResult> {
  if (!LABEL_URL) return { ok: false, message: "Labels can't be read in this build. Type them." };
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) return { ok: false, message: "Allow the camera in Settings to take a photo." };
  const shot = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.8 });
  const asset = shot.canceled ? null : shot.assets[0];
  if (!asset) return { ok: false, cancelled: true };
  const small = await manipulateAsync(asset.uri, [{ resize: { width: 1024 } }], {
    compress: 0.7,
    format: SaveFormat.JPEG,
    base64: true,
  });
  if (!small.base64) return { ok: false, message: NO_READ };
  const { data } = await (await db()).auth.getSession();
  const token = data.session?.access_token;
  if (!token) return { ok: false, message: "Sign in again." };
  try {
    const res = await fetch(LABEL_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ mime: "image/jpeg", image: small.base64 }),
    });
    const body = (await res.json().catch(() => null)) as
      | ({ ok?: boolean; error?: string } & LabelValues)
      | null;
    if (!res.ok || !body) return { ok: false, message: body?.error ?? NO_READ };
    if (!body.ok) return { ok: false, message: NO_READ };
    const { name, kcal, carbs, protein, fat, fibre, servingG } = body;
    return { ok: true, values: { name, kcal, carbs, protein, fat, fibre, servingG } };
  } catch {
    return { ok: false, message: "Couldn't reach MedSync. Check your connection, or type it." };
  }
}

/* ─── The patient's saved products ───────────────────────────────────── */

type State = {
  userId: string | null;
  status: "idle" | "loading" | "ready" | "error";
  rows: Product[];
};
const EMPTY: State = { userId: null, status: "idle", rows: [] };
const store = createStore<State>(EMPTY);
let watching = false;
let inflight: Promise<void> | null = null;

async function load(): Promise<void> {
  const userId = await currentUserId().catch(() => null);
  if (!userId) return store.set(EMPTY);
  store.set((s) => ({ ...s, userId, status: "loading" }));
  try {
    const { data, error } = await (await db())
      .from("patient_food_products")
      .select(
        "id, barcode, name, brand, kcal_100g, carbs_100g, protein_100g, fat_100g, fibre_100g, serving_g, source",
      )
      .eq("patient_user_id", userId)
      .eq("state", "active")
      .order("created_at", { ascending: false })
      .limit(1000);
    if (error) throw error;
    const queued = (await readOutbox()).flatMap((i) => {
      const row = i.payload.row as Row | undefined;
      return i.kind === "insert" &&
        i.payload.table === "patient_food_products" &&
        row?.patient_user_id === userId
        ? [fromDb(row)]
        : [];
    });
    const seen = new Set((data ?? []).map((r) => String(r.id)));
    store.set({
      userId,
      status: "ready",
      rows: [...queued.filter((p) => !seen.has(p.id)), ...(data ?? []).map(fromDb)],
    });
  } catch {
    store.set((s) => ({ ...s, status: s.rows.length ? "ready" : "error" }));
  }
}

function ensureLoaded(): void {
  if (!watching) {
    watching = true;
    void onAccountChange((id) => {
      if (store.get().userId && id !== store.get().userId) {
        store.set(EMPTY);
        if (id) void load();
      }
    }).catch(() => {
      watching = false;
    });
  }
  const s = store.get();
  if (!inflight && (s.status === "idle" || s.status === "error"))
    inflight = load().finally(() => {
      inflight = null;
    });
}

export function useProducts(): Product[] {
  const s = useStore(store);
  useEffect(() => ensureLoaded(), []);
  return s.rows;
}

/** A saved product with this barcode, so a second scan needs no lookup. */
export function savedByBarcode(code: string): Product | null {
  return store.get().rows.find((p) => p.barcode === code) ?? null;
}

/** Keep a product before its first meal is logged; offline it queues like any save. */
export async function saveProduct(
  draft: ProductDraft,
): Promise<{ result: SaveResult; product: Product | null }> {
  const userId = await currentUserId().catch(() => null);
  if (!userId) return { result: "failed", product: null };
  const product: Product = { ...draft, id: newId() };
  const row: Row = {
    id: product.id,
    patient_user_id: userId,
    barcode: product.barcode,
    name: product.name.slice(0, 200),
    brand: product.brand,
    kcal_100g: product.kcal,
    carbs_100g: product.carbsG,
    protein_100g: product.proteinG,
    fat_100g: product.fatG,
    fibre_100g: product.fibreG,
    serving_g: product.servingG,
    source: product.source,
  };
  store.set((s) => ({ ...s, rows: [product, ...s.rows] }));
  const result = await insertOrQueue("patient_food_products", row);
  if (result === "failed") {
    store.set((s) => ({ ...s, rows: s.rows.filter((p) => p.id !== product.id) }));
    return { result, product: null };
  }
  return { result, product };
}
