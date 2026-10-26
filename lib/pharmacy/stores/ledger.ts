import type { MovementKind } from "@/db/schema/pharmacy-dispensing";
import type { Batch } from "@/lib/pharmacy/stock/ledger";

import { expiresOn, localDate } from "@/lib/pharmacy/stock/ledger";

/**
 * The ledger, extended (Pharmacy Phase 2, 6.2: SL-12, SL-13, SL-15, SL-16, SL-18; MR-5). Pure: no I/O.
 * 0180 is the source of truth (the kinds, `psm_sign`, `psm_pairs`, the deferred pair trigger). A place is
 * `coalesce(location_id, dispensing_point_id)`, carried here as Phase 1's `pointId` so Phase 1's pure
 * helpers (FEFO, expiry, SL-9) read Phase 2 rows unchanged.
 */

export type { MovementKind };

/** A Phase 1 batch; `pointId` is the location id (any kind). */
export type StoreBatch = Batch;

/** A movement at any location. Phase 1 movements are assignable to it. */
export interface StoreMovement {
  id: string;
  batchId: string;
  /** The location id (coalesce(location_id, dispensing_point_id)). */
  pointId: string;
  kind: MovementKind;
  /** Signed whole number in the product's issue unit (Law 4). */
  quantity: number;
  effectiveAt: Date;
  recordedAt: Date;
  downtime: boolean;
  /** SL-13: shared by both legs of an SL-12 pair. */
  pairId?: string | null;
  /** SL-18: allocated first-expiry-first from a per-product ward count. */
  allocated?: boolean;
  counterpartyId?: string | null;
  /** IS-7: the loan a `loan_returned_*` settles. */
  loanMovementId?: string | null;
  reasonCode?: string | null;
  sourceKind?: string;
  /** Phase 1 transfers pair through it (P7). */
  sourceId?: string | null;
  /** SL-17: on `received` only. */
  unitCost?: number | null;
}

/** SL-12, SL-13: the paired kinds (0180 `psm_pairs`) and each one's other leg. */
export const PAIRS = {
  issued: "received_from_issue",
  received_from_issue: "issued",
  returned_out: "returned_in",
  returned_in: "returned_out",
  quarantined_out: "quarantined_in",
  quarantined_in: "quarantined_out",
  set_aside_out: "set_aside_in",
  set_aside_in: "set_aside_out",
  released_out: "released_in",
  released_in: "released_out",
} as const satisfies Partial<Record<MovementKind, MovementKind>>;
export type PairedKind = keyof typeof PAIRS;

/** SL-13: does this kind need a second leg with the same pair id? */
export const isPaired = (kind: MovementKind): kind is PairedKind => kind in PAIRS;

/**
 * SL-13, LC-5: the key both legs of a two-place movement share. SL-12 pairs use `pair_id`; Phase 1
 * transfers pair through `source_id` and are read by the same rule.
 */
export function pairKey(m: Pick<StoreMovement, "kind" | "pairId" | "sourceId">): string | null {
  if (isPaired(m.kind)) return m.pairId ? `pair:${m.pairId}` : null;
  if ((m.kind === "transfer_out" || m.kind === "transfer_in") && m.sourceId)
    return `transfer:${m.sourceId}`;
  return null;
}

/**
 * SL-13: every paired leg with no matching other leg (same pair id, other kind, opposite quantity),
 * matched one to one. A paired kind with no pair id is a one-leg pair too. Empty means the ledger holds
 * no pair with one leg.
 */
export function oneLegPairs(
  movements: readonly StoreMovement[],
): { pairId: string | null; movementId: string }[] {
  const out: { pairId: string | null; movementId: string }[] = [];
  const groups = new Map<string, StoreMovement[]>();
  for (const m of movements) {
    if (!isPaired(m.kind)) continue;
    if (!m.pairId) {
      out.push({ pairId: null, movementId: m.id });
      continue;
    }
    groups.set(m.pairId, [...(groups.get(m.pairId) ?? []), m]);
  }
  for (const [pairId, legs] of groups) {
    const left = [...legs];
    while (left.length > 0) {
      const m = left.shift() as StoreMovement & { kind: PairedKind };
      const i = left.findIndex((o) => o.kind === PAIRS[m.kind] && o.quantity === -m.quantity);
      if (i === -1) out.push({ pairId, movementId: m.id });
      else left.splice(i, 1);
    }
  }
  return out;
}

/** SL-13: both legs of a two-place movement, written together or not at all. */
export function twoLegs(
  outKind: "issued" | "returned_out" | "quarantined_out",
  input: {
    pairId: string;
    fromBatchId: string;
    fromLocationId: string;
    toBatchId: string;
    toLocationId: string;
    quantity: number;
    at: Date;
    reasonCode?: string | null;
  },
): [Omit<StoreMovement, "id">, Omit<StoreMovement, "id">] {
  const base = {
    effectiveAt: input.at,
    recordedAt: input.at,
    downtime: false,
    pairId: input.pairId,
    reasonCode: input.reasonCode ?? null,
  };
  return [
    {
      ...base,
      batchId: input.fromBatchId,
      pointId: input.fromLocationId,
      kind: outKind,
      quantity: -input.quantity,
    },
    {
      ...base,
      batchId: input.toBatchId,
      pointId: input.toLocationId,
      kind: PAIRS[outKind],
      quantity: input.quantity,
    },
  ];
}

/** First expiry first, as Phase 1 FEFO orders (SU-3): expiry, then batch number, then id. */
export const fefoOrder = <
  B extends Pick<Batch, "id" | "batchNumber" | "expiry" | "expiryMonthOnly">,
>(
  batches: readonly B[],
): B[] =>
  [...batches].sort(
    (a, b) =>
      expiresOn(a).localeCompare(expiresOn(b)) ||
      a.batchNumber.localeCompare(b.batchNumber) ||
      a.id.localeCompare(b.id),
  );

/**
 * SL-18: a ward that counts one figure per product has its use allocated across the ward's batches,
 * first expiry first, up to what each holds; every row is marked `allocated` (recall views say
 * "allocated, not counted"). Controlled products are always counted per batch, so they are refused.
 * Use beyond what the batches hold is returned as `unallocated` (it cannot happen when use comes from
 * WS-3 over a non-negative count).
 */
export function allocateFirstExpiry(
  use: number,
  batches: readonly StoreBatch[],
  balances: ReadonlyMap<string, number>,
  opts: { controlled: boolean },
):
  | {
      ok: true;
      rows: { batchId: string; quantity: number; allocated: true }[];
      unallocated: number;
    }
  | { ok: false; reason: "controlled_counted_per_batch" | "invalid_quantity" } {
  if (opts.controlled) return { ok: false, reason: "controlled_counted_per_batch" };
  if (!Number.isInteger(use) || use < 0) return { ok: false, reason: "invalid_quantity" };
  const rows: { batchId: string; quantity: number; allocated: true }[] = [];
  let left = use;
  for (const b of fefoOrder(batches)) {
    const held = balances.get(b.id) ?? 0;
    if (left === 0) break;
    if (held <= 0) continue;
    const take = Math.min(left, held);
    rows.push({ batchId: b.id, quantity: take, allocated: true });
    left -= take;
  }
  return { ok: true, rows, unallocated: left };
}

/**
 * SL-15: `ward_used` and `cart_used` are written only by a count, and a ward or cart count writes them
 * instead of `count_correction`, never both.
 */
export function countWriteOk(
  kind: MovementKind,
  source: { sourceKind: string; locationKind: string },
): boolean {
  if (kind === "ward_used" || kind === "cart_used") return source.sourceKind === "count";
  if (kind === "count_correction")
    return !(
      source.sourceKind === "count" &&
      (source.locationKind === "ward" || source.locationKind === "cart")
    );
  return true;
}

/**
 * SL-16: `effective_at` earlier than `recorded_at` only for downtime back-entry and late-confirmed
 * receipts.
 */
export const backdatingOk = (
  m: Pick<StoreMovement, "effectiveAt" | "recordedAt" | "downtime">,
  lateConfirmedReceipt: boolean,
): boolean => m.effectiveAt >= m.recordedAt || m.downtime || lateConfirmedReceipt;

/** The hospital-local month of an instant, as its first day (YYYY-MM-01). */
export const localMonth = (at: Date): string => `${localDate(at).slice(0, 7)}-01`;

/** The first day of the month after `month` (YYYY-MM-01). */
export function nextMonth(month: string): string {
  const y = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7));
  return new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
}

/**
 * SL-16, MR-5: the period a movement is reported in. A movement recorded after its month closed is
 * attributed to the first open month after it and labelled with the month it belongs to; the closed
 * month's snapshot never changes. `closes` maps a closed month (YYYY-MM-01) to when it closed.
 */
export function attributeMonth(
  m: Pick<StoreMovement, "effectiveAt" | "recordedAt">,
  closes: ReadonlyMap<string, Date>,
): { month: string; belongsTo: string | null } {
  const own = localMonth(m.effectiveAt);
  const closedAt = closes.get(own);
  if (!closedAt || m.recordedAt <= closedAt) return { month: own, belongsTo: null };
  let month = nextMonth(own);
  while (closes.has(month)) month = nextMonth(month);
  return { month, belongsTo: own };
}

/** The instant a hospital-local day starts (Africa/Kampala, as Phase 1's ledger). */
export const dayStart = (date: string): Date => new Date(`${date}T00:00:00+03:00`);

/** A local date plus whole days. */
export const addDays = (date: string, days: number): string =>
  new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
