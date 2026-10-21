import type { MovementKind } from "@/db/schema/pharmacy-dispensing";
import type { StoreBatch, StoreMovement } from "@/lib/pharmacy/stores/ledger";

/** Shared fixtures for the Phase 2 store engines. Every name and figure is invented. */
export const at = (local: string) => new Date(`${local}+03:00`);

export const batch = (o: Partial<StoreBatch> & Pick<StoreBatch, "id">): StoreBatch => ({
  pointId: "loc-store",
  productId: "fx-product-a",
  medicineId: "fx-medicine-a",
  batchNumber: o.id.toUpperCase(),
  expiry: "2027-12-31",
  expiryMonthOnly: false,
  ...o,
});

let seq = 0;
export const mv = (
  batchId: string,
  pointId: string,
  kind: MovementKind,
  quantity: number,
  when: Date,
  o: Partial<StoreMovement> = {},
): StoreMovement => ({
  id: `m${++seq}`,
  batchId,
  pointId,
  kind,
  quantity,
  effectiveAt: when,
  recordedAt: when,
  downtime: false,
  ...o,
});

/** mulberry32: a small seeded PRNG, so a failing seed can be replayed (no new dependency). */
export function prng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const int = (r: () => number, lo: number, hi: number) =>
  lo + Math.floor(r() * (hi - lo + 1));
