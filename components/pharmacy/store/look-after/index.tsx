"use client";

import type { StoreWorld } from "@/lib/pharmacy/derive/store/types";

/** STORE.md §F1. `filter` is the pressed tile ("out" | "low" | "over" | null). */
export function StoreStock(_: { world: StoreWorld; filter: string | null }) {
  return null;
}
/** STORE.md §F2. */
export function Expiry(_: { world: StoreWorld }) {
  return null;
}
/** STORE.md §F3. `world.card` holds the chosen medicine's ledger; pick with `?med=`. */
export function StockCards(_: { world: StoreWorld }) {
  return null;
}
/** STORE.md §F4. `?shelf=` opens the count dialog on that shelf. */
export function Counts(_: { world: StoreWorld; shelfId: string | null }) {
  return null;
}
/** STORE.md §F5. */
export function QuarantineLosses(_: { world: StoreWorld }) {
  return null;
}
/** STORE.md §F6. */
export function StoreConditions(_: { world: StoreWorld }) {
  return null;
}
