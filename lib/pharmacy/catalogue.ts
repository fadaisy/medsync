import { drugById } from "@/lib/prescribing/formulary";

/**
 * The catalogue: medicines and products (Pharmacy Phase 1, CT-1..CT-7, H2, W4). Pure. A medicine is the
 * prescribing list's row (CT-1); a product belongs to one medicine and is at a point while its
 * product-at-point row is active (CT-2). Nothing here converts between units, packs or strengths
 * (CT-4, Law 7): strength is compared as text, and an unknown strength is never "the same".
 */

/** CT-1: there is one medicine list, the prescribing catalogue. */
export const isMedicine = (medicineId: string): boolean => drugById(medicineId) !== undefined;

export interface CatalogueProduct {
  id: string;
  medicineId: string;
  active: boolean;
}

export interface ProductPoint {
  productId: string;
  dispensingPointId: string;
  active: boolean;
  endedAt: Date | null;
}

/** CT-2: the active products of a medicine with an active product-at-point row at this point. */
export function productsAtPoint<P extends CatalogueProduct>(
  products: readonly P[],
  productPoints: readonly ProductPoint[],
  medicineId: string,
  pointId: string,
): P[] {
  const here = new Set(
    productPoints
      .filter((pp) => pp.dispensingPointId === pointId && pp.active && pp.endedAt === null)
      .map((pp) => pp.productId),
  );
  return products.filter((p) => p.active && p.medicineId === medicineId && here.has(p.id));
}

const norm = (s: string) => s.normalize("NFKC").toLowerCase().replace(/\s+/g, "");

export interface NationalListRow {
  generic: string;
  form: string | null;
  strength: string | null;
}

/**
 * CT-3: a national-list row attaches to a medicine only on an exact match of generic name, form and
 * strength, compared as text. A missing field never matches, and two candidates are not a match:
 * the row is left for a person to resolve. Nothing is matched by guess.
 */
export function nationalListMatch(
  row: NationalListRow,
  medicines: readonly (NationalListRow & { id: string })[],
): string | null {
  if (!row.form || !row.strength) return null;
  const hits = medicines.filter(
    (m) =>
      m.form !== null &&
      m.strength !== null &&
      norm(m.generic) === norm(row.generic) &&
      norm(m.form) === norm(row.form ?? "") &&
      norm(m.strength) === norm(row.strength ?? ""),
  );
  return hits.length === 1 ? (hits[0]?.id ?? null) : null;
}

/** CT-4: the issue unit is fixed once the product has any movement; a different unit is a new product. */
export const issueUnitLocked = (productHasMovement: boolean): boolean => productHasMovement;

export type StrengthMatch = "same" | "different" | "unknown";

/**
 * CT-4, H2, E-PH1-05: the prescribed strength and the product's, as text. Case and spacing are ignored;
 * nothing is converted ("500 mg" is never "0.5 g"). Either one missing is `unknown`, never `same`.
 */
export function sameStrength(prescribed: string | null, product: string | null): StrengthMatch {
  if (!prescribed?.trim() || !product?.trim()) return "unknown";
  return norm(prescribed) === norm(product) ? "same" : "different";
}

/** CT-5: the price in force, as stored (a decimal string in Uganda shillings), snapshotted unchanged. */
export const priceSnapshot = (product: { priceUgx: string | null }): string | null =>
  product.priceUgx;

/** CT-6, Appendix B "No product" (draft): shown where a medicine has no active product at the point. */
export const noProductText = (point: string): string =>
  `No product is set up for this medicine at ${point}.`;

export interface SignedMedicineSet<T> {
  hospitalId: string;
  status: "draft" | "signed" | "retired";
  version: number;
  content: Readonly<Record<string, T>>;
}

/**
 * CT-7: a medicine's controlled class or high-risk entry is signed data keyed to the medicine, per
 * hospital, versioned. Only a signed set of this hospital acts; anything else answers null.
 */
export function signedEntry<T>(
  set: SignedMedicineSet<T> | null,
  hospitalId: string,
  medicineId: string,
): T | null {
  if (!set || set.status !== "signed" || set.hospitalId !== hospitalId) return null;
  return Object.hasOwn(set.content, medicineId) ? (set.content[medicineId] ?? null) : null;
}
