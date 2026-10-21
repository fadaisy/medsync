import type { Locations } from "./consumption";
import type { StoreBatch } from "./ledger";

import { isExpired } from "@/lib/pharmacy/stock/ledger";

/**
 * The order proposal (Pharmacy Phase 2, 5.9, 6.6: OQ-1 to OQ-7; D-PH2-09, D-PH2-13, D-PH2-16). Pure.
 * MedSync proposes; it never orders (Law 10). Every parameter is signed data passed in (Law 6): while one
 * is missing nothing is computed and the result names it.
 */

export interface OrderParameters {
  /** D-PH2-16: the hospital's maximum stock in months (EMHS §4.1.1.2's four months only as reference). */
  maxMonths: number | null;
  /** OQ-4: the emergency order point in months, if the hospital keeps one. */
  emergencyOrderPointMonths: number | "not_kept" | null;
  /** 5.9 warning: the out-of-stock share of the window above which the figure rests on few days. */
  outOfStockShareLimit: number | null;
  /** 5.9 warning: an unexplained month-end difference at or above this many units is large. */
  largeDifferenceUnits: number | null;
  /** OQ-6: the signed parameter set's version, printed with every row. */
  version: string | null;
}

export type ParameterName = "max_months" | "emergency_order_point" | "version";

/** Law 6: the parameters the proposal cannot run without. */
export function missingParameters(p: OrderParameters): ParameterName[] {
  const out: ParameterName[] = [];
  if (p.maxMonths === null || !(p.maxMonths > 0)) out.push("max_months");
  if (p.emergencyOrderPointMonths === null) out.push("emergency_order_point");
  if (!p.version) out.push("version");
  return out;
}

/**
 * OQ-2, D-PH2-09: stock on hand is the unexpired, unblocked balance across stores and dispensing points
 * at the cut time; ward, cart and quarantine stock is excluded. A transfer between pharmacy locations
 * leaves it unchanged.
 */
export function stockOnHand(input: {
  batches: readonly StoreBatch[];
  balances: ReadonlyMap<string, number>;
  locations: Locations;
  blocked: ReadonlySet<string>;
  localDate: string;
  productIds: ReadonlySet<string>;
}): number {
  return input.batches
    .filter((b) => {
      const k = input.locations.get(b.pointId)?.kind;
      return (
        input.productIds.has(b.productId) &&
        (k === "store" || k === "dispensing_point") &&
        !input.blocked.has(b.id) &&
        !isExpired(b, input.localDate)
      );
    })
    .reduce((s, b) => s + (input.balances.get(b.id) ?? 0), 0);
}

/** OQ-3: a pack size counts only when stored as a whole number of issue units ("100"); else null. */
export function wholePack(packSize: string | null): number | null {
  if (packSize === null || !/^\s*\d+\s*$/.test(packSize)) return null;
  const n = Number(packSize);
  return n > 0 ? n : null;
}

export type RowFlag =
  | "pack_size_not_whole"
  | "no_amc"
  | "below_emergency_order_point"
  | "not_counted_in_window"
  | "short_history"
  | "mostly_out_of_stock"
  | "large_unexplained_difference";

export interface OrderRowInput {
  productId: string;
  medicineId: string;
  /** CN-4's figure, or null when there were no days in stock. */
  amc: number | null;
  stockOnHand: number;
  packSize: string | null;
  windowDays: number;
  daysOut: number;
  countedInWindow: boolean;
  shortHistory: boolean;
  /** The largest unexplained month-end difference in the window, in units (absolute). */
  unexplainedDifference: number;
}

export interface OrderRow {
  productId: string;
  medicineId: string;
  maxStock: number | null;
  proposedUnits: number;
  proposedPacks: number | null;
  packSize: number | null;
  flags: RowFlag[];
  /** 5.9 warnings that could not be checked because their parameter is unsigned. */
  notChecked: ("out_of_stock_share" | "large_difference")[];
  /** OQ-6: inputs, formula in words and parameter versions, printed as the order's appendix. */
  inputs: OrderRowInput & { maxMonths: number };
  formula: string[];
  version: string;
}

/**
 * OQ-1 to OQ-4, OQ-6: one row. Maximum stock = AMC × maximum months; proposed = maximum − stock on hand,
 * never negative, in whole issue units, rounded up to whole packs only where the pack size is a whole
 * number of issue units (else not rounded and flagged). Months of stock below the emergency order point
 * is flagged; nothing is ordered automatically.
 */
export function proposeRow(
  row: OrderRowInput,
  params: OrderParameters,
): { missing: ParameterName[] } | OrderRow {
  const missing = missingParameters(params);
  if (missing.length > 0) return { missing };
  const maxMonths = params.maxMonths as number;
  const flags: RowFlag[] = [];
  const notChecked: OrderRow["notChecked"] = [];
  const pack = wholePack(row.packSize);
  const formula = [
    "Maximum stock = adjusted average monthly consumption × maximum months",
    "Proposed quantity = maximum stock − stock on hand (store and dispensing points), never below zero",
    pack === null
      ? "Pack size is not a whole number of issue units, so the quantity is not rounded to packs"
      : "Rounded up to whole packs",
  ];
  if (row.shortHistory) flags.push("short_history");
  if (!row.countedInWindow) flags.push("not_counted_in_window");
  if (params.outOfStockShareLimit === null) notChecked.push("out_of_stock_share");
  else if (row.windowDays > 0 && row.daysOut / row.windowDays > params.outOfStockShareLimit)
    flags.push("mostly_out_of_stock");
  if (params.largeDifferenceUnits === null) notChecked.push("large_difference");
  else if (row.unexplainedDifference >= params.largeDifferenceUnits)
    flags.push("large_unexplained_difference");
  if (pack === null) flags.push("pack_size_not_whole");
  const base = { productId: row.productId, medicineId: row.medicineId, packSize: pack, notChecked };
  const inputs = { ...row, maxMonths };
  const version = params.version as string;
  if (row.amc === null) {
    flags.push("no_amc");
    return {
      ...base,
      maxStock: null,
      proposedUnits: 0,
      proposedPacks: null,
      flags,
      inputs,
      formula,
      version,
    };
  }
  const point = params.emergencyOrderPointMonths;
  if (typeof point === "number" && row.amc > 0 && row.stockOnHand / row.amc < point)
    flags.push("below_emergency_order_point");
  const maxStock = row.amc * maxMonths;
  // Rounded to 9 places before the ceiling so float noise never adds a unit.
  const units = Math.max(0, Math.ceil(Number((maxStock - row.stockOnHand).toFixed(9))));
  const packs = pack === null ? null : Math.ceil(units / pack);
  return {
    ...base,
    maxStock,
    proposedUnits: packs === null || pack === null ? units : packs * pack,
    proposedPacks: packs,
    flags,
    inputs,
    formula,
    version,
  };
}

export type Ven = "V" | "E" | "N";

export interface TrimLine {
  productId: string;
  ven: Ven | null;
  units: number;
  unitPrice: number | null;
  packSize: number | null;
}

export interface Cut {
  productId: string;
  /** The class it was trimmed as (an unclassed line takes the in-charge's signed choice). */
  trimmedAs: Ven;
  fromUnits: number;
  toUnits: number;
  /** OQ-5: a vital cut is confirmed only with a typed reason. */
  needsReason: boolean;
}

const TRIM_ORDER: readonly Ven[] = ["N", "E", "V"];

/**
 * OQ-5, D-PH2-13: trim to the budget in VEN order, necessary then essential then vital; within a class,
 * the costliest line first. A line is reduced by whole packs (or units with no whole pack) only as far
 * as the budget needs. Returns proposals only: each cut is confirmed one by one, vital cuts with a
 * reason. Unclassed lines are trimmed as the in-charge signed (never silently "necessary"); unsigned, or
 * any price unknown, nothing is computed.
 */
export function trimToBudget(
  lines: readonly TrimLine[],
  budget: number,
  unclassedAs: Ven | null,
):
  | { missing: ("unclassed_trim_order" | "price")[]; unpriced: string[] }
  | { cuts: Cut[]; totalBefore: number; totalAfter: number; met: boolean } {
  const unpriced = lines.filter((l) => l.unitPrice === null).map((l) => l.productId);
  const missing: ("unclassed_trim_order" | "price")[] = [];
  if (unpriced.length > 0) missing.push("price");
  if (unclassedAs === null && lines.some((l) => l.ven === null))
    missing.push("unclassed_trim_order");
  if (missing.length > 0) return { missing, unpriced };
  const cost = (l: TrimLine, units: number) => units * (l.unitPrice as number);
  const totalBefore = lines.reduce((s, l) => s + cost(l, l.units), 0);
  let total = totalBefore;
  const cuts: Cut[] = [];
  for (const cls of TRIM_ORDER) {
    const inClass = lines
      .filter((l) => (l.ven ?? unclassedAs) === cls && l.units > 0)
      .sort(
        (a, b) => cost(b, b.units) - cost(a, a.units) || a.productId.localeCompare(b.productId),
      );
    for (const l of inClass) {
      if (total <= budget) break;
      const step = l.packSize ?? 1;
      const price = cost(l, step);
      const over = total - budget;
      const stepsCut = price > 0 ? Math.min(Math.ceil(over / price), Math.ceil(l.units / step)) : 0;
      const toUnits = Math.max(0, l.units - stepsCut * step);
      if (toUnits === l.units) continue;
      total -= cost(l, l.units - toUnits);
      cuts.push({
        productId: l.productId,
        trimmedAs: cls,
        fromUnits: l.units,
        toUnits,
        needsReason: cls === "V",
      });
    }
  }
  return { cuts, totalBefore, totalAfter: total, met: total <= budget };
}

/** OQ-5: a cut is confirmed one by one; a vital cut needs a typed reason. */
export const confirmCutRefusal = (cut: Cut, reason: string | null): "reason_needed" | null =>
  cut.needsReason && !reason?.trim() ? "reason_needed" : null;
