/**
 * The stock ledger, read (Pharmacy Phase 1, SL-1, SL-2, SL-4, SL-5, SL-6, SL-9, SL-10, SL-11, DT-7;
 * gate-a-proposal §5). Pure: no I/O. The SQL in 0124 is the source of truth (the append-only trigger,
 * the batch guard, the stock-out projection); this mirrors it so the screens and the availability
 * answer read the same figures the database would. A balance is a projection over the movements,
 * never a stored figure (SL-2). Dates are hospital-local, Africa/Kampala (UTC+3, no daylight saving).
 */

/** SL-1: the movement kinds, as 0124's CHECK lists them. */
export const MOVEMENT_KINDS = [
  "received",
  "supplied",
  "reversed",
  "adjusted",
  "count_correction",
  "transfer_out",
  "transfer_in",
] as const;
export type MovementKind = (typeof MOVEMENT_KINDS)[number];

/** SL-3: a product, a batch number and an expiry, at one point. `expiry` is an ISO date. */
export interface Batch {
  id: string;
  pointId: string;
  productId: string;
  medicineId: string;
  batchNumber: string;
  expiry: string;
  /** The pack gives a month only: the batch runs to the end of that month (SL-5). */
  expiryMonthOnly: boolean;
}

export interface Movement {
  id: string;
  batchId: string;
  pointId: string;
  kind: MovementKind;
  /** Signed whole number in the product's issue unit. */
  quantity: number;
  effectiveAt: Date;
  recordedAt: Date;
  /** Entered after downtime: may take a batch below zero (DT-7). */
  downtime: boolean;
}

const KAMPALA_OFFSET_MS = 3 * 3_600_000;
const DAY_MS = 86_400_000;

/** SL-1: the sign each kind carries (0124 `psm_sign`). Adjustments and corrections go either way. */
export function signOk(kind: MovementKind, quantity: number): boolean {
  if (!Number.isInteger(quantity) || quantity === 0) return false;
  if (kind === "received" || kind === "reversed" || kind === "transfer_in") return quantity > 0;
  if (kind === "supplied" || kind === "transfer_out") return quantity < 0;
  return true;
}

/** The hospital-local date of an instant, YYYY-MM-DD (Africa/Kampala). */
export const localDate = (now: Date): string =>
  new Date(now.getTime() + KAMPALA_OFFSET_MS).toISOString().slice(0, 10);

/** Whole days from one local date to another (negative when `to` is earlier). */
export const daysBetween = (from: string, to: string): number =>
  Math.round((Date.parse(to) - Date.parse(from)) / DAY_MS);

/** SL-5: the last day the batch may be supplied. A month-only expiry runs to the end of the month. */
export function expiresOn(batch: Pick<Batch, "expiry" | "expiryMonthOnly">): string {
  if (!batch.expiryMonthOnly) return batch.expiry;
  const y = Number(batch.expiry.slice(0, 4));
  const m = Number(batch.expiry.slice(5, 7));
  // Day 0 of the next month is the last day of this one (leap years included).
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

/** SL-5: expired when the expiry is before the hospital-local date. */
export const isExpired = (
  batch: Pick<Batch, "expiry" | "expiryMonthOnly">,
  today: string,
): boolean => expiresOn(batch) < today;

/** The first instant the batch counts as expired: local midnight after its last day. */
const expiredFrom = (batch: Batch): Date =>
  new Date(Date.parse(`${expiresOn(batch)}T00:00:00+03:00`) + DAY_MS);

/** SL-2: each batch's balance is the sum of its movements. */
export function balances(movements: readonly Movement[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const m of movements) out.set(m.batchId, (out.get(m.batchId) ?? 0) + m.quantity);
  return out;
}

const batchesOf = (batches: readonly Batch[], medicineId: string, pointId: string) =>
  batches.filter((b) => b.medicineId === medicineId && b.pointId === pointId);

/** SL-5, SL-9: the unexpired total of a medicine at a point. Expired batches never count. */
export function medicineTotal(
  batches: readonly Batch[],
  bal: ReadonlyMap<string, number>,
  medicineId: string,
  pointId: string,
  today: string,
): number {
  return batchesOf(batches, medicineId, pointId)
    .filter((b) => !isExpired(b, today))
    .reduce((sum, b) => sum + (bal.get(b.id) ?? 0), 0);
}

/** DT-7: any batch below zero means the medicine needs a count. */
export const needsCount = (bal: ReadonlyMap<string, number>): boolean =>
  [...bal.values()].some((v) => v < 0);

export type GuardRefusal = "sign" | "expired" | "below_zero";

/**
 * SL-4, SL-5, DT-7: the database guard, mirrored. A live movement never takes a batch below zero and
 * a live supply never comes from an expired batch; a downtime movement passes both.
 */
export function admits(
  movement: Pick<Movement, "kind" | "quantity" | "downtime">,
  batch: Batch,
  balance: number,
  today: string,
): { ok: true } | { ok: false; reason: GuardRefusal } {
  if (!signOk(movement.kind, movement.quantity)) return { ok: false, reason: "sign" };
  if (movement.downtime) return { ok: true };
  if (movement.kind === "supplied" && isExpired(batch, today))
    return { ok: false, reason: "expired" };
  if (balance + movement.quantity < 0) return { ok: false, reason: "below_zero" };
  return { ok: true };
}

export interface StockoutSpan {
  startedAt: Date;
  endedAt: Date | null;
  /** The movement that took the total to zero, or null when the last batch expired. */
  startMovementId: string | null;
  /** The batch whose expiry took the total to zero (SL-9's expiry case). */
  expiredBatchId: string | null;
  endMovementId: string | null;
}

/**
 * SL-9: stock-out periods of a medicine at a point, derived from the ledger in effective order. A span
 * opens at the movement that leaves the unexpired total at or below zero (as 0124's trigger does) and
 * closes at the one that lifts it. A total that reaches zero only because a batch expired opens a span
 * at the start of the first local day the batch is expired. Expiries after `now` are not yet events.
 */
export function stockoutSpans(
  movements: readonly Movement[],
  batches: readonly Batch[],
  medicineId: string,
  pointId: string,
  localDateOf: (at: Date) => string,
  now: Date,
): StockoutSpan[] {
  const own = batchesOf(batches, medicineId, pointId);
  const ids = new Set(own.map((b) => b.id));
  type Ev = { at: Date; movement?: Movement; expired?: Batch };
  const events: Ev[] = [
    ...own.map((b) => ({ at: expiredFrom(b), expired: b })).filter((e) => e.at <= now),
    ...movements
      .filter((m) => ids.has(m.batchId) && m.pointId === pointId)
      .map((m) => ({ at: m.effectiveAt, movement: m })),
  ];
  // Time order; an expiry before a movement at the same instant; movements by when recorded.
  events.sort(
    (a, b) =>
      a.at.getTime() - b.at.getTime() ||
      (a.expired ? 0 : 1) - (b.expired ? 0 : 1) ||
      (a.movement?.recordedAt.getTime() ?? 0) - (b.movement?.recordedAt.getTime() ?? 0),
  );

  const bal = new Map<string, number>();
  const spans: StockoutSpan[] = [];
  let open: StockoutSpan | null = null;
  let total = 0;
  for (const e of events) {
    if (e.movement)
      bal.set(e.movement.batchId, (bal.get(e.movement.batchId) ?? 0) + e.movement.quantity);
    const before = total;
    total = medicineTotal(own, bal, medicineId, pointId, localDateOf(e.at));
    // An expiry opens a span only when it is what took the total to zero.
    const opens = total <= 0 && !open && (e.movement !== undefined || before > 0);
    if (opens) {
      open = {
        startedAt: e.at,
        endedAt: null,
        startMovementId: e.movement?.id ?? null,
        expiredBatchId: e.expired?.id ?? null,
        endMovementId: null,
      };
      spans.push(open);
    } else if (total > 0 && open) {
      open.endedAt = e.at;
      open.endMovementId = e.movement?.id ?? null;
      open = null;
    }
  }
  return spans;
}

/**
 * SL-6: a blind count's result. The balance is passed here only after the counted figure is typed;
 * nothing upstream needs it first. `difference` is the `count_correction` quantity (zero on a match).
 */
export const countResult = ({ counted, balance }: { counted: number; balance: number }) => ({
  matched: counted === balance,
  difference: counted - balance,
});

export interface BatchCorrection {
  batchId: string;
  oldBatchNumber: string;
  newBatchNumber: string;
  oldExpiry: string;
  newExpiry: string;
  reason: string;
}

/**
 * SL-11: a batch's number or expiry changes only through a correction event that keeps the old and the
 * new value and a reason (0124 `pharmacy_batch_corrections`, reason 3–300 characters). Movements are
 * untouched, so every balance stays where it was.
 */
export function correctBatch(
  batch: Batch,
  change: { batchNumber: string; expiry: string; reason: string },
):
  | { ok: true; batch: Batch; correction: BatchCorrection }
  | { ok: false; reason: "unchanged" | "no_reason" } {
  const reason = change.reason.trim();
  if (reason.length < 3 || reason.length > 300) return { ok: false, reason: "no_reason" };
  if (change.batchNumber === batch.batchNumber && change.expiry === batch.expiry)
    return { ok: false, reason: "unchanged" };
  return {
    ok: true,
    batch: { ...batch, batchNumber: change.batchNumber, expiry: change.expiry },
    correction: {
      batchId: batch.id,
      oldBatchNumber: batch.batchNumber,
      newBatchNumber: change.batchNumber,
      oldExpiry: batch.expiry,
      newExpiry: change.expiry,
      reason,
    },
  };
}

export type StockState =
  | "in_stock"
  | "low"
  | "out"
  | "expiring"
  | "expired_remove"
  | "count_needed";

/**
 * 5.8: the Stock page's state for one medicine at a point, with its days where the words carry them
 * (`Out · {n} days`, `Expiring · {n} days`). First that holds: count needed (DT-7) · expired, remove
 * (an expired batch still holds stock) · out · low (only with a reorder level, D-PH1-23) · expiring
 * (the first unexpired batch with stock expires within the hospital's look-ahead; none set → never) ·
 * in stock.
 */
export function stockState(input: {
  batches: readonly Batch[];
  balances: ReadonlyMap<string, number>;
  medicineId: string;
  pointId: string;
  localDate: string;
  reorderLevel: number | null;
  lookaheadDays: number | null;
  /** The open stock-out's start (SL-9), if any. */
  outSince: Date | null;
}): { state: StockState; days: number | null } {
  const today = input.localDate;
  const own = batchesOf(input.batches, input.medicineId, input.pointId);
  const held = (b: Batch) => (input.balances.get(b.id) ?? 0) > 0;
  if (own.some((b) => (input.balances.get(b.id) ?? 0) < 0))
    return { state: "count_needed", days: null };
  if (own.some((b) => isExpired(b, today) && held(b)))
    return { state: "expired_remove", days: null };
  const total = medicineTotal(own, input.balances, input.medicineId, input.pointId, today);
  if (total <= 0)
    return {
      state: "out",
      days: input.outSince ? daysBetween(localDate(input.outSince), today) : null,
    };
  if (input.reorderLevel !== null && total < input.reorderLevel)
    return { state: "low", days: null };
  const first = own
    .filter((b) => !isExpired(b, today) && held(b))
    .map((b) => daysBetween(today, expiresOn(b)))
    .sort((a, b) => a - b)[0];
  if (input.lookaheadDays !== null && first !== undefined && first <= input.lookaheadDays)
    return { state: "expiring", days: first };
  return { state: "in_stock", days: null };
}
