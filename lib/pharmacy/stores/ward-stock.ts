import type { StoreBatch } from "./ledger";

import { daysBetween, localDate } from "@/lib/pharmacy/stock/ledger";
import { allocateFirstExpiry, fefoOrder } from "./ledger";

/**
 * Ward stock (Pharmacy Phase 2, 5.4, 6.8: WS-1 to WS-3; D-PH2-06, D-PH2-07). Pure. A ward's holding is
 * known only when counted (Law 4): charted doses are context and never enter arithmetic.
 */

export interface LastCount {
  counted: number;
  at: Date;
  by: string;
}

/**
 * WS-1: suggested top-up = ward level − last count (never below zero), only when the last count is
 * within Phase 1's count freshness setting; otherwise "Count the ward first". Unset freshness or
 * level: not computed. Shown only after a count is committed (the count screen never calls this).
 */
export function suggestedTopUp(input: {
  wardLevel: number | null;
  lastCount: LastCount | null;
  now: Date;
  freshnessDays: number | null;
}):
  | { kind: "top_up"; quantity: number }
  | { kind: "count_first" }
  | { kind: "missing"; missing: ("ward_level" | "count_freshness")[] } {
  const missing: ("ward_level" | "count_freshness")[] = [];
  if (input.wardLevel === null) missing.push("ward_level");
  if (input.freshnessDays === null) missing.push("count_freshness");
  if (missing.length > 0) return { kind: "missing", missing };
  const c = input.lastCount;
  if (!c || daysBetween(localDate(c.at), localDate(input.now)) > (input.freshnessDays as number))
    return { kind: "count_first" };
  return { kind: "top_up", quantity: Math.max(0, (input.wardLevel as number) - c.counted) };
}

/**
 * 5.4, WS-1, WS-2: one row of the Ward stock page. `dosesCharted` is the count of charted
 * administrations of the medicine on the ward since the last count: displayed, never used.
 */
export function wardRow(input: {
  productId: string;
  wardLevel: number | null;
  lastCount: LastCount | null;
  issuedSince: number;
  returnedSince: number;
  dosesCharted: number;
  now: Date;
  freshnessDays: number | null;
}) {
  return {
    productId: input.productId,
    wardLevel: input.wardLevel,
    lastCount: input.lastCount,
    issuedSince: input.issuedSince,
    returnedSince: input.returnedSince,
    // WS-2: context only (Law 4).
    dosesCharted: input.dosesCharted,
    topUp: suggestedTopUp(input),
  };
}

export interface WardCountMovement {
  batchId: string;
  kind: "ward_used" | "adjusted";
  quantity: number;
  allocated: boolean;
  reasonCode: string | null;
  /** A negative use is listed: "More on the ward than was issued. Check returns and the last count." */
  listed: boolean;
}

export type WardCountRefusal =
  | "reason_needed"
  | "invalid_count"
  | "no_batch"
  | "controlled_counted_per_batch";

/**
 * WS-3, SL-15, SL-18: what a ward count writes. Use since the last count = the ward's ledger balance
 * just before the count − the counted figure. Positive: `ward_used`. Negative: no `ward_used` but an
 * `adjusted` movement with the counter's reason, listed. Never `count_correction`. Counted per batch,
 * each batch on its own; one figure per product, the use is allocated first expiry first (SL-18) and a
 * surplus lands on the first-expiring batch. Afterwards the ward's balance equals its count.
 */
export function wardCountMovements(input: {
  batches: readonly StoreBatch[];
  balances: ReadonlyMap<string, number>;
  count: { perBatch: ReadonlyMap<string, number> } | { perProduct: number; controlled: boolean };
  negativeReason: string | null;
}): { ok: true; movements: WardCountMovement[] } | { ok: false; reason: WardCountRefusal } {
  const out: WardCountMovement[] = [];
  const reason = input.negativeReason?.trim() || null;
  const surplus = (
    batchId: string,
    quantity: number,
    allocated: boolean,
  ): WardCountRefusal | null => {
    if (!reason) return "reason_needed";
    out.push({ batchId, kind: "adjusted", quantity, allocated, reasonCode: reason, listed: true });
    return null;
  };
  if ("perBatch" in input.count) {
    for (const b of fefoOrder(input.batches)) {
      const counted = input.count.perBatch.get(b.id);
      if (counted === undefined) continue;
      if (!Number.isInteger(counted) || counted < 0) return { ok: false, reason: "invalid_count" };
      const use = (input.balances.get(b.id) ?? 0) - counted;
      if (use > 0)
        out.push({
          batchId: b.id,
          kind: "ward_used",
          quantity: -use,
          allocated: false,
          reasonCode: null,
          listed: false,
        });
      else if (use < 0) {
        const r = surplus(b.id, -use, false);
        if (r) return { ok: false, reason: r };
      }
    }
    return { ok: true, movements: out };
  }
  const { perProduct, controlled } = input.count;
  if (!Number.isInteger(perProduct) || perProduct < 0)
    return { ok: false, reason: "invalid_count" };
  if (controlled) return { ok: false, reason: "controlled_counted_per_batch" };
  const before = input.batches.reduce((s, b) => s + (input.balances.get(b.id) ?? 0), 0);
  const use = before - perProduct;
  if (use < 0) {
    const first = fefoOrder(input.batches)[0];
    if (!first) return { ok: false, reason: "no_batch" };
    const r = surplus(first.id, -use, true);
    return r ? { ok: false, reason: r } : { ok: true, movements: out };
  }
  const a = allocateFirstExpiry(use, input.batches, input.balances, { controlled: false });
  // Use beyond the positive batch balances means a batch went below zero: count per batch instead.
  if (!a.ok || a.unallocated > 0) return { ok: false, reason: "no_batch" };
  for (const row of a.rows)
    out.push({
      batchId: row.batchId,
      kind: "ward_used",
      quantity: -row.quantity,
      allocated: true,
      reasonCode: null,
      listed: false,
    });
  return { ok: true, movements: out };
}
