/**
 * Prices, pure (catalogue slice Step 8; ADR 0460; Laws 11 and 12). A rule only proposes; a person accepts. The
 * price in force on a date is the latest row from on or before it. Three kinds of nothing: `free` (a decision),
 * `price_not_set` (a gap), and never UGX 0. Stock value counts only batches with a recorded cost.
 */

export interface PriceRule {
  multiplier: number;
  roundingStep: number;
  /** payer id → multiplier, after the markup. */
  payerAdjustments: Record<string, number>;
}

export interface Proposal {
  price: number;
  /** Each step in words and figures, for the screen (S26). */
  steps: { label: string; value: number }[];
}

/** S26: last unit cost × markup, × the payer's adjustment, rounded up to the step. Writes nothing. */
export function proposePrice(
  unitCost: number | null,
  rule: PriceRule | null,
  payerId: string,
): Proposal | null {
  if (!rule || unitCost === null || !(unitCost > 0)) return null;
  const marked = unitCost * rule.multiplier;
  const adjust = rule.payerAdjustments[payerId] ?? 1;
  const adjusted = marked * adjust;
  // Rounded on the cent first, so 1.1 × 100 is 110, not 110.00000000000001.
  const price = Math.ceil(Math.round(adjusted * 100) / 100 / rule.roundingStep) * rule.roundingStep;
  const steps = [
    { label: "Last unit cost", value: unitCost },
    { label: `× ${rule.multiplier} markup`, value: marked },
    ...(adjust !== 1 ? [{ label: `× ${adjust} for this payer`, value: adjusted }] : []),
    { label: `Rounded up to ${rule.roundingStep}`, value: price },
  ];
  return { price, steps };
}

export interface PriceRow {
  productId: string;
  payerId: string;
  priceUgx: number | null;
  free: boolean;
  fromDate: string;
  createdAt: Date;
}

export type InForce = { kind: "priced"; priceUgx: number } | { kind: "free" } | null;

/** S27: the latest row from on or before `on` (YYYY-MM-DD); the later entry wins a same-day tie. */
export function priceInForce(
  rows: readonly PriceRow[],
  productId: string,
  payerId: string,
  on: string,
): InForce {
  let best: PriceRow | null = null;
  for (const r of rows) {
    if (r.productId !== productId || r.payerId !== payerId || r.fromDate > on) continue;
    if (
      !best ||
      r.fromDate > best.fromDate ||
      (r.fromDate === best.fromDate && r.createdAt > best.createdAt)
    )
      best = r;
  }
  if (!best) return null;
  return best.free ? { kind: "free" } : { kind: "priced", priceUgx: best.priceUgx! };
}

export type Charge =
  | { kind: "priced"; unitPrice: number }
  | { kind: "free" }
  | { kind: "price_not_set" };

/** Law 11 at a line: a free point bills free; else the price in force, or "Price not set", never 0 (S28, S29). */
export function chargeFor(pointMode: "charged" | "free" | null, price: InForce): Charge {
  if (pointMode === "free") return { kind: "free" };
  if (!price) return { kind: "price_not_set" };
  return price.kind === "free" ? { kind: "free" } : { kind: "priced", unitPrice: price.priceUgx };
}

/** The point's charge mode on a date: the latest from on or before it; none set is `charged`. */
export function modeOn(
  rows: readonly { mode: "charged" | "free"; fromDate: string; createdAt: Date }[],
  on: string,
): "charged" | "free" {
  const r = rows
    .filter((x) => x.fromDate <= on)
    .sort((a, b) => b.fromDate.localeCompare(a.fromDate) || +b.createdAt - +a.createdAt)[0];
  return r?.mode ?? "charged";
}

export interface ValuedBatch {
  batchId: string;
  balance: number;
  /** The batch's received movements with a unit cost. */
  receipts: readonly { quantity: number; unitCost: number }[];
}

/**
 * S31: Σ balance × the batch's unit cost, the quantity-weighted mean of its costed receipts (GATE A §2.2). A batch
 * with stock and no costed receipt is named, never valued at zero.
 */
export function stockValue(batches: readonly ValuedBatch[]): {
  valueUgx: number;
  unvalued: string[];
} {
  let value = 0;
  const unvalued: string[] = [];
  for (const b of batches) {
    if (b.balance <= 0) continue;
    const q = b.receipts.reduce((a, r) => a + r.quantity, 0);
    if (q <= 0) {
      unvalued.push(b.batchId);
      continue;
    }
    const cost = b.receipts.reduce((a, r) => a + r.quantity * r.unitCost, 0) / q;
    value += b.balance * cost;
  }
  return { valueUgx: Math.round(value * 100) / 100, unvalued };
}
