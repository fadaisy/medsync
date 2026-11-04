"use client";

import type { StoreWorld } from "@/lib/pharmacy/derive/store/types";

/** STORE.md §F11. Open when `shelfId` is set or `open`. */
export function CountShelfDialog(_: {
  world: StoreWorld;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  shelfId?: string | null;
}) {
  return null;
}
/** STORE.md §F12. */
export function IssueNoReqDialog(_: {
  world: StoreWorld;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  return null;
}
/** STORE.md §F13. */
export function LossDialog(_: {
  world: StoreWorld;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  return null;
}
