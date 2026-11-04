"use client";

import type { StoreWorld } from "@/lib/pharmacy/derive/store/types";

/** STORE.md §D1. `filter` is the pressed tile ("runout" or null). */
export function StockEverywhere(_: { world: StoreWorld; filter: string | null }) {
  return null;
}
/** STORE.md §D2. */
export function PlaceBalances(_: { world: StoreWorld }) {
  return null;
}
