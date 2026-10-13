import type { Batch } from "./ledger";

import { expiresOn, isExpired } from "./ledger";

/**
 * First expiry, first out (Pharmacy Phase 1, SU-3, 5.3.1, SL-5). Pure. Given one product's batches at
 * the point and their balances, propose the unexpired batch that expires first and holds stock; where it
 * holds less than the quantity, split across batches in expiry order, one row each. Expired and empty
 * batches are never offered. Choosing anything else needs a coded reason.
 */

export interface BatchRow {
  batchId: string;
  quantity: number;
}

export type Proposal =
  | { ok: true; rows: BatchRow[] }
  | { ok: false; reason: "not_enough"; available: number }
  | { ok: false; reason: "invalid_quantity" };

export function proposeBatches(input: {
  batches: readonly Batch[];
  balances: ReadonlyMap<string, number>;
  quantity: number;
  localDate: string;
}): Proposal {
  const { quantity } = input;
  // SU-2: a whole number above zero in the issue unit.
  if (!Number.isInteger(quantity) || quantity <= 0)
    return { ok: false, reason: "invalid_quantity" };
  const usable = input.batches
    .filter((b) => !isExpired(b, input.localDate) && (input.balances.get(b.id) ?? 0) > 0)
    .sort(
      (a, b) =>
        expiresOn(a).localeCompare(expiresOn(b)) ||
        a.batchNumber.localeCompare(b.batchNumber) ||
        a.id.localeCompare(b.id),
    );
  const available = usable.reduce((s, b) => s + (input.balances.get(b.id) ?? 0), 0);
  if (available < quantity) return { ok: false, reason: "not_enough", available };

  const rows: BatchRow[] = [];
  let left = quantity;
  for (const b of usable) {
    if (left === 0) break;
    const take = Math.min(left, input.balances.get(b.id) ?? 0);
    rows.push({ batchId: b.id, quantity: take });
    left -= take;
  }
  return { ok: true, rows };
}

/** SU-3, 5.3.1: any choice other than the proposal, batch for batch and quantity for quantity, needs a reason. */
export function batchChoiceNeedsReason(
  chosen: readonly BatchRow[],
  proposal: readonly BatchRow[],
): boolean {
  const key = (rows: readonly BatchRow[]) => {
    const m = new Map<string, number>();
    for (const r of rows) m.set(r.batchId, (m.get(r.batchId) ?? 0) + r.quantity);
    return [...m].sort(([a], [b]) => a.localeCompare(b)).join(";");
  };
  return key(chosen) !== key(proposal);
}
