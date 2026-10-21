import type { MovementKind, StoreMovement } from "./ledger";

import { daysBetween, localDate } from "@/lib/pharmacy/stock/ledger";
import { internalPairKeys } from "./consumption";
import { addDays, attributeMonth, nextMonth, pairKey } from "./ledger";

/**
 * Month end (Pharmacy Phase 2, 5.8, 6.7: MR-1 to MR-6; D-PH2-12, D-PH2-14). Pure. Every column is a
 * projection over the ledger; nothing is typed by a person (Law 2). Each column holds the signed net it
 * moved the balance by (ins positive, outs negative), so Should be = Opening + the sum of the columns.
 */

export const COLUMNS = [
  "received",
  "issuedIn",
  "supplied",
  "issuedOut",
  "used",
  "returned",
  "adjusted",
  "writtenOff",
] as const;
export type Column = (typeof COLUMNS)[number];

/** MR-1: the 5.8 column each movement kind falls in. */
export const COLUMN_OF: Readonly<Record<MovementKind, Column>> = {
  received: "received",
  borrowed: "received",
  loan_returned_in: "received",
  received_from_issue: "issuedIn",
  transfer_in: "issuedIn",
  quarantined_in: "issuedIn",
  supplied: "supplied",
  reversed: "supplied",
  issued: "issuedOut",
  transfer_out: "issuedOut",
  quarantined_out: "issuedOut",
  lent: "issuedOut",
  loan_returned_out: "issuedOut",
  ward_used: "used",
  cart_used: "used",
  returned_in: "returned",
  returned_out: "returned",
  returned_to_supplier: "returned",
  adjusted: "adjusted",
  count_correction: "adjusted",
  written_off: "writtenOff",
};

export interface MonthEndCount {
  locationId: string;
  countId: string;
  /** When the count was committed. */
  at: Date;
  /** Product → counted figure. A product absent was not counted. */
  counted: ReadonlyMap<string, number>;
}

export type Explanation = { reasonCode: string } | { unexplained: true };

export interface MonthRow {
  productId: string;
  opening: number;
  columns: Record<Column, number>;
  shouldBe: number;
  /** Null when any location that held or moved it was not counted. */
  counted: number | null;
  difference: number | null;
  explained: number;
  explanation: "reason" | "unexplained" | null;
  /** Earlier corrections in the month, with their reasons. */
  adjustedReasons: { reasonCode: string | null; quantity: number }[];
  /** MR-5: late movements shown here, with the month they belong to. */
  late: { movementId: string; belongsTo: string; recordedAt: Date }[];
  /** MR-2: earlier unexplained differences, carried as lines, never into Opening. */
  carried: { month: string; difference: number }[];
  hadMovement: boolean;
  notCountedAt: string[];
  /** D-PH2-14: money per column at each batch's recorded cost; null when any batch has no cost. */
  money: Record<Column, number> | null;
}

const zero = (): Record<Column, number> => ({
  received: 0,
  issuedIn: 0,
  supplied: 0,
  issuedOut: 0,
  used: 0,
  returned: 0,
  adjusted: 0,
  writtenOff: 0,
});

/**
 * MR-1, MR-2, MR-5: the month's report for one location or the hospital (a location set).
 * - Columns hold movements attributed to the month (MR-5), excluding the movements written by the
 *   month-end count itself; its `ward_used` and `cart_used` are use, so they stay under Used.
 * - Difference = counted − the ledger balance just before the count (with the count's own use applied),
 *   per location, summed; so a shortfall found at month end shows under Difference, not Adjusted.
 * - At hospital level a pair with both legs inside the set cancels and is not shown (LC-5).
 * - Opening is the previous closed month's counted figure; unexplained differences come as lines.
 */
export function reconcile(input: {
  scope:
    | { kind: "location"; locationId: string }
    | { kind: "hospital"; locationIds: readonly string[] };
  month: string;
  /** Every movement of the scope's locations, all time. */
  movements: readonly StoreMovement[];
  productOf: ReadonlyMap<string, string>;
  closes: ReadonlyMap<string, Date>;
  opening: ReadonlyMap<string, number>;
  carried: readonly { productId: string; month: string; difference: number }[];
  counts: readonly MonthEndCount[];
  explanations: ReadonlyMap<string, Explanation>;
  /** Batch → unit cost recorded at receipt (SL-17); a batch absent has no cost. */
  costs: ReadonlyMap<string, number>;
}): MonthRow[] {
  const locs =
    input.scope.kind === "location" ? [input.scope.locationId] : [...input.scope.locationIds];
  const inside = new Set(locs);
  const internal =
    input.scope.kind === "hospital" ? internalPairKeys(input.movements, inside) : new Set<string>();
  const countIds = new Set(input.counts.map((c) => c.countId));
  const own = (m: StoreMovement) =>
    m.sourceKind === "count" && m.sourceId != null && countIds.has(m.sourceId);
  const isUse = (m: StoreMovement) => m.kind === "ward_used" || m.kind === "cart_used";
  const monthEnd = new Date(`${nextMonth(input.month)}T00:00:00+03:00`);

  const rows = new Map<string, MonthRow>();
  const noCost = new Set<string>();
  const row = (productId: string): MonthRow => {
    let r = rows.get(productId);
    if (!r) {
      r = {
        productId,
        opening: input.opening.get(productId) ?? 0,
        columns: zero(),
        shouldBe: 0,
        counted: null,
        difference: null,
        explained: 0,
        explanation: null,
        adjustedReasons: [],
        late: [],
        carried: [],
        hadMovement: false,
        notCountedAt: [],
        money: zero(),
      };
      rows.set(productId, r);
    }
    return r;
  };
  for (const p of input.opening.keys()) row(p);
  for (const c of input.carried)
    row(c.productId).carried.push({ month: c.month, difference: c.difference });
  for (const c of input.counts) for (const p of c.counted.keys()) row(p);

  const moved = new Map<string, Set<string>>();
  for (const m of input.movements) {
    if (!inside.has(m.pointId)) continue;
    const productId = input.productOf.get(m.batchId);
    if (productId === undefined) continue;
    const a = attributeMonth(m, input.closes);
    if (a.month !== input.month) continue;
    if (own(m) && !isUse(m)) continue;
    const key = pairKey(m);
    if (key && internal.has(key)) continue;
    const r = row(productId);
    const col = COLUMN_OF[m.kind];
    r.columns[col] += m.quantity;
    r.hadMovement = true;
    moved.set(m.pointId, (moved.get(m.pointId) ?? new Set()).add(productId));
    const cost = input.costs.get(m.batchId);
    if (cost === undefined) noCost.add(productId);
    else if (r.money) r.money[col] += m.quantity * cost;
    if (col === "adjusted")
      r.adjustedReasons.push({ reasonCode: m.reasonCode ?? null, quantity: m.quantity });
    if (a.belongsTo)
      r.late.push({ movementId: m.id, belongsTo: a.belongsTo, recordedAt: m.recordedAt });
  }

  for (const r of rows.values()) {
    r.shouldBe = r.opening + COLUMNS.reduce((s, c) => s + r.columns[c], 0);
    if (noCost.has(r.productId)) r.money = null;
    let counted = 0;
    let difference = 0;
    for (const loc of locs) {
      const here = input.movements.filter(
        (m) => m.pointId === loc && input.productOf.get(m.batchId) === r.productId,
      );
      const count = input.counts.find((c) => c.locationId === loc);
      const figure = count?.counted.get(r.productId);
      if (count === undefined || figure === undefined) {
        const holds = here
          .filter((m) => m.effectiveAt < monthEnd)
          .reduce((s, m) => s + m.quantity, 0);
        if (holds !== 0 || moved.get(loc)?.has(r.productId)) r.notCountedAt.push(loc);
        continue;
      }
      const before = here
        .filter((m) => (own(m) ? isUse(m) : m.effectiveAt < count.at))
        .reduce((s, m) => s + m.quantity, 0);
      counted += figure;
      difference += figure - before;
    }
    const anyCount = input.counts.some(
      (c) => inside.has(c.locationId) && c.counted.has(r.productId),
    );
    if (r.notCountedAt.length === 0 && anyCount) {
      r.counted = counted;
      r.difference = difference;
      const e = input.explanations.get(r.productId);
      r.explanation = e === undefined ? null : "reasonCode" in e ? "reason" : "unexplained";
      r.explained = r.explanation === "reason" ? difference : 0;
    }
  }
  return [...rows.values()].sort((a, b) => a.productId.localeCompare(b.productId));
}

/**
 * MR-2: what the next month starts from: each product's counted figure (Should be only where it was
 * not counted, with a recorded reason), and its unexplained difference as a carried line.
 */
export function carryForward(
  month: string,
  rows: readonly MonthRow[],
): {
  opening: Map<string, number>;
  carried: { productId: string; month: string; difference: number }[];
} {
  const opening = new Map(rows.map((r) => [r.productId, r.counted ?? r.shouldBe]));
  const carried = [
    ...rows.flatMap((r) => r.carried.map((c) => ({ productId: r.productId, ...c }))),
    ...rows
      .filter((r) => r.explanation === "unexplained" && r.difference)
      .map((r) => ({ productId: r.productId, month, difference: r.difference as number })),
  ];
  return { opening, carried };
}

export type CloseBlocker =
  | { kind: "not_counted"; productId: string }
  | { kind: "count_outside_window"; locationId: string }
  | { kind: "difference_without_reason"; productId: string }
  | { kind: "second_approver_needed" }
  | { kind: "approver_is_closer" };

/**
 * MR-3: a month closes only when every product with a movement was counted within the signed month-end
 * count window (or carries a recorded reason), every difference has a reason or is marked unexplained,
 * and a second person approves with an attestation. Unsigned window: nothing is computed.
 */
export function canClose(input: {
  month: string;
  rows: readonly MonthRow[];
  counts: readonly Pick<MonthEndCount, "locationId" | "at">[];
  notCountedReasons: ReadonlySet<string>;
  countWindow: { daysBefore: number; daysAfter: number } | null;
  closedBy: string;
  approvedBy: string | null;
  approvalAttestationId: string | null;
}): { missing: ["month_end_count_window"] } | { ok: boolean; blockers: CloseBlocker[] } {
  if (input.countWindow === null) return { missing: ["month_end_count_window"] };
  const blockers: CloseBlocker[] = [];
  const lastDay = addDays(nextMonth(input.month), -1);
  for (const c of input.counts) {
    const d = daysBetween(lastDay, localDate(c.at));
    if (d < -input.countWindow.daysBefore || d > input.countWindow.daysAfter)
      blockers.push({ kind: "count_outside_window", locationId: c.locationId });
  }
  for (const r of input.rows) {
    if (r.hadMovement && r.counted === null && !input.notCountedReasons.has(r.productId))
      blockers.push({ kind: "not_counted", productId: r.productId });
    if (r.difference && r.explanation === null)
      blockers.push({ kind: "difference_without_reason", productId: r.productId });
  }
  if (input.approvedBy === null || input.approvalAttestationId === null)
    blockers.push({ kind: "second_approver_needed" });
  else if (input.approvedBy === input.closedBy) blockers.push({ kind: "approver_is_closer" });
  return { ok: blockers.length === 0, blockers };
}

/**
 * MR-4: the snapshot's content as stable JSON (keys sorted at every depth, dates as ISO strings, maps as
 * sorted objects), so the same figures always hash to the same sha256.
 */
export function stableJson(value: unknown): string {
  const norm = (v: unknown): unknown => {
    if (v instanceof Date) return v.toISOString();
    if (v instanceof Map) return norm(Object.fromEntries(v));
    if (v instanceof Set) return [...v].map(norm);
    if (Array.isArray(v)) return v.map(norm);
    if (v && typeof v === "object")
      return Object.fromEntries(
        Object.keys(v)
          .sort()
          .map((k) => [k, norm((v as Record<string, unknown>)[k])]),
      );
    return v;
  };
  return JSON.stringify(norm(value));
}

/** MR-4, MR-6: the snapshot a close writes, and where a print reads from. */
export const snapshotContent = (scope: string, month: string, rows: readonly MonthRow[]): string =>
  stableJson({ scope, month, rows });

/**
 * MR-6: a closed month prints from its snapshot; an open month prints live with the "Month not closed.
 * Figures may change." banner on every page.
 */
export const printSource = (
  snapshot: string | null,
): { from: "snapshot"; content: string } | { from: "live"; banner: "month_not_closed" } =>
  snapshot === null
    ? { from: "live", banner: "month_not_closed" }
    : { from: "snapshot", content: snapshot };
