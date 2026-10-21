import type { StoreBatch } from "./ledger";

import { daysBetween, expiresOn, isExpired } from "@/lib/pharmacy/stock/ledger";
import { planIssue } from "./issue";

/**
 * Emergency carts (Pharmacy Phase 2, 5.5, 6.8: EC-1 to EC-4; D-PH2-06, D-PH2-21). Pure. A cart is
 * counted; emergency records hold doses, not issue units, so recorded uses are context only (Law 4).
 */

/**
 * EC-1: restock = cart list quantity − counted, never negative, issued first expiry first from the
 * restocking location's unexpired, unblocked batches (as IS-2).
 */
export function restockPlan(input: {
  listQuantity: number;
  counted: number;
  batches: readonly StoreBatch[];
  balances: ReadonlyMap<string, number>;
  blocked: ReadonlySet<string>;
  localDate: string;
}) {
  const need = Math.max(0, input.listQuantity - input.counted);
  return { need, ...planIssue(need, input) };
}

/**
 * 5.5, EC-2: one product on a cart check. Recorded uses since the last check are shown as context and
 * never used in arithmetic.
 */
export function cartRow(input: {
  productId: string;
  listQuantity: number;
  counted: number;
  recordedUses: readonly { at: Date; episodeRef: string; medicineAsRecorded: string }[];
}) {
  return {
    productId: input.productId,
    listQuantity: input.listQuantity,
    counted: input.counted,
    recordedUses: input.recordedUses,
    restock: Math.max(0, input.listQuantity - input.counted),
  };
}

export type GapExplanation =
  | "used_not_recorded"
  | "recorded_uses_accepted"
  | "broken_or_discarded"
  | "moved_to_another_cart"
  | "cannot_explain";

export type GapMovement =
  | { kind: "cart_used"; batchId: string; quantity: number }
  | {
      kind: "adjusted";
      batchId: string;
      quantity: number;
      reasonCode: string;
      flagForInCharge: boolean;
      listed: boolean;
    }
  | {
      kind: "issued";
      batchId: string;
      quantity: number;
      toCartLocationId: string;
      countTarget: true;
    };

/**
 * EC-3: a batch's gap = the cart's ledger balance just before the count − counted. A person's answer
 * decides the movement; MedSync never decides which it was. Used and not recorded, or recorded uses the
 * person accepts: `cart_used`. Broken or discarded: an `adjusted` loss. Moved to another cart: a two-leg
 * issue to the named cart, which is then counted. Cannot explain: an `adjusted` loss flagged for the
 * pharmacy in charge. A negative gap is an `adjusted` with the counter's reason, listed (as WS-3). Every
 * answer is sent to the unit's nurse in charge.
 */
export function gapMovement(input: {
  batchId: string;
  balanceBefore: number;
  counted: number;
  explanation: GapExplanation | null;
  reasonCode: string | null;
  toCartLocationId: string | null;
}):
  | { ok: true; gap: number; movement: GapMovement | null; notifyUnitInCharge: boolean }
  | { ok: false; reason: "explanation_needed" | "reason_needed" | "target_cart_needed" } {
  const gap = input.balanceBefore - input.counted;
  if (gap === 0) return { ok: true, gap, movement: null, notifyUnitInCharge: false };
  const reason = input.reasonCode?.trim() || null;
  if (gap < 0) {
    if (!reason) return { ok: false, reason: "reason_needed" };
    return {
      ok: true,
      gap,
      movement: {
        kind: "adjusted",
        batchId: input.batchId,
        quantity: -gap,
        reasonCode: reason,
        flagForInCharge: false,
        listed: true,
      },
      notifyUnitInCharge: true,
    };
  }
  const base = { ok: true as const, gap, notifyUnitInCharge: true };
  switch (input.explanation) {
    case null:
      return { ok: false, reason: "explanation_needed" };
    case "used_not_recorded":
    case "recorded_uses_accepted":
      return { ...base, movement: { kind: "cart_used", batchId: input.batchId, quantity: -gap } };
    case "broken_or_discarded":
    case "cannot_explain":
      return {
        ...base,
        movement: {
          kind: "adjusted",
          batchId: input.batchId,
          quantity: -gap,
          reasonCode: input.explanation,
          flagForInCharge: input.explanation === "cannot_explain",
          listed: false,
        },
      };
    case "moved_to_another_cart":
      if (!input.toCartLocationId) return { ok: false, reason: "target_cart_needed" };
      return {
        ...base,
        movement: {
          kind: "issued",
          batchId: input.batchId,
          quantity: gap,
          toCartLocationId: input.toCartLocationId,
          countTarget: true,
        },
      };
  }
}

/** EC-3: a check is complete only with its confirmer's second factor; the seal number is recorded. */
export function checkRefusals(input: {
  checkedBy: string;
  confirmedBy: string | null;
  confirmAttestationId: string | null;
}): ("confirmer_needed" | "second_factor_needed")[] {
  if (!input.confirmedBy) return ["confirmer_needed"];
  return input.confirmAttestationId ? [] : ["second_factor_needed"];
}

/**
 * EC-4: unexpired batches on the cart inside the signed cart look-ahead are swapped by default; the old
 * batch goes back to the issuer or to quarantine, as the person chooses. Unsigned: nothing computed.
 */
export function shortDatedSwaps(input: {
  batches: readonly StoreBatch[];
  balances: ReadonlyMap<string, number>;
  localDate: string;
  cartLookaheadDays: number | null;
}):
  | { missing: ["cart_lookahead"] }
  | {
      swaps: {
        batchId: string;
        quantity: number;
        daysLeft: number;
        swapByDefault: true;
        routes: ("return_to_issuer" | "quarantine")[];
      }[];
    } {
  if (input.cartLookaheadDays === null) return { missing: ["cart_lookahead"] };
  const look = input.cartLookaheadDays;
  return {
    swaps: input.batches
      .filter((b) => (input.balances.get(b.id) ?? 0) > 0 && !isExpired(b, input.localDate))
      .map((b) => ({ b, daysLeft: daysBetween(input.localDate, expiresOn(b)) }))
      .filter((x) => x.daysLeft <= look)
      .map((x) => ({
        batchId: x.b.id,
        quantity: input.balances.get(x.b.id) ?? 0,
        daysLeft: x.daysLeft,
        swapByDefault: true as const,
        routes: ["return_to_issuer", "quarantine"],
      })),
  };
}
