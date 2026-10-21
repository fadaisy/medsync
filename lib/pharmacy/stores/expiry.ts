import type { StoreBatch } from "./ledger";
import type { LocationKind } from "./locations";

import { daysBetween, expiresOn, isExpired } from "@/lib/pharmacy/stock/ledger";
import { fefoOrder } from "./ledger";

/**
 * Expiry, quarantine and write-off (Pharmacy Phase 2, 5.6, 6.9: EX-1, EX-2). Pure. The look-ahead is the
 * signed setting (Phase 1 D-PH1-23), passed in.
 */

export type ExpiryAction = "issue_first" | "move_to_use" | "return_to_supplier" | "lend";

/**
 * EX-1: unexpired batches holding stock whose expiry falls inside the look-ahead, per location, first
 * expiry first, each with the suggested actions (return to supplier only where the supplier takes
 * returns). Quarantine is excluded: what is there is already off the shelf. Unset: not computed.
 */
export function expiring(input: {
  batches: readonly StoreBatch[];
  balances: ReadonlyMap<string, number>;
  locationKind: ReadonlyMap<string, LocationKind>;
  localDate: string;
  lookaheadDays: number | null;
  supplierTakesReturns: (batchId: string) => boolean;
}):
  | { missing: ["expiry_lookahead"] }
  | {
      byLocation: Map<
        string,
        {
          batchId: string;
          expiresOn: string;
          daysLeft: number;
          quantity: number;
          actions: ExpiryAction[];
        }[]
      >;
    } {
  if (input.lookaheadDays === null) return { missing: ["expiry_lookahead"] };
  const look = input.lookaheadDays;
  const byLocation = new Map<
    string,
    {
      batchId: string;
      expiresOn: string;
      daysLeft: number;
      quantity: number;
      actions: ExpiryAction[];
    }[]
  >();
  for (const b of fefoOrder(input.batches)) {
    const quantity = input.balances.get(b.id) ?? 0;
    if (quantity <= 0 || isExpired(b, input.localDate)) continue;
    if (input.locationKind.get(b.pointId) === "quarantine") continue;
    const daysLeft = daysBetween(input.localDate, expiresOn(b));
    if (daysLeft > look) continue;
    const actions: ExpiryAction[] = ["issue_first", "move_to_use"];
    if (input.supplierTakesReturns(b.id)) actions.push("return_to_supplier");
    actions.push("lend");
    byLocation.set(b.pointId, [
      ...(byLocation.get(b.pointId) ?? []),
      { batchId: b.id, expiresOn: expiresOn(b), daysLeft, quantity, actions },
    ]);
  }
  return { byLocation };
}

/** EX-1, SL-5: expired batches still holding stock outside quarantine, to move to quarantine. */
export function expiredToQuarantine(input: {
  batches: readonly StoreBatch[];
  balances: ReadonlyMap<string, number>;
  locationKind: ReadonlyMap<string, LocationKind>;
  localDate: string;
}): { batchId: string; locationId: string; quantity: number }[] {
  return fefoOrder(input.batches)
    .filter(
      (b) =>
        (input.balances.get(b.id) ?? 0) > 0 &&
        isExpired(b, input.localDate) &&
        input.locationKind.get(b.pointId) !== "quarantine",
    )
    .map((b) => ({
      batchId: b.id,
      locationId: b.pointId,
      quantity: input.balances.get(b.id) ?? 0,
    }));
}

export type WriteOffRefusal =
  | "not_quarantine"
  | "manage_needed"
  | "reason_needed"
  | "register_entry_needed"
  | "witness_needed"
  | "invalid_quantity";

/**
 * EX-2: write-off is only from quarantine, by a holder of `pharmacy.manage`, with a reason, an Expired
 * or Spoiled Medicines Register entry and a witness, never more than the batch holds.
 */
export function writeOffRefusals(input: {
  locationKind: LocationKind;
  canManage: boolean;
  reason: string | null;
  registerNumber: string | null;
  witnessAttestationId: string | null;
  quantity: number;
  balance: number;
}): WriteOffRefusal[] {
  const out: WriteOffRefusal[] = [];
  if (input.locationKind !== "quarantine") out.push("not_quarantine");
  if (!input.canManage) out.push("manage_needed");
  if (!input.reason?.trim()) out.push("reason_needed");
  if (!input.registerNumber?.trim()) out.push("register_entry_needed");
  if (!input.witnessAttestationId) out.push("witness_needed");
  if (!Number.isInteger(input.quantity) || input.quantity <= 0 || input.quantity > input.balance)
    out.push("invalid_quantity");
  return out;
}
