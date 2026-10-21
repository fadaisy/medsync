import type { StoreBatch, StoreMovement } from "./ledger";
import type { LocationKind, WardModel } from "./locations";

import { isExpired } from "@/lib/pharmacy/stock/ledger";
import { addDays, dayStart, pairKey } from "./ledger";
import { isIssueOnlyWard } from "./locations";

/**
 * Consumption and stock-out days (Pharmacy Phase 2, 6.5: CN-1 to CN-5; D-PH2-08, D-PH2-11). Pure. Every
 * window, day rule and minimum is an input (Law 6).
 */

export type Locations = ReadonlyMap<string, { kind: LocationKind; model: WardModel | null }>;

export interface ConsumptionResult {
  consumption: number;
  /** Each term of CN-1, as units that left custody (positive = left). */
  terms: { suppliedNet: number; wardUsed: number; cartUsed: number; issueOnlyWardNet: number };
  /** Reported apart from consumption: net units lost (positive = lost). */
  losses: { writtenOff: number; adjusted: number; countCorrection: number };
}

/**
 * CN-1, CN-2: consumption over movements effective in [from, to): supplied net of reversals at
 * dispensing points, plus `ward_used` and `cart_used`, plus receipts at an issue-only ward (LC-4) net of
 * its returns. Internal transfers (LC-5), quarantine moves and loans are not consumption. Write-offs,
 * adjustments and count corrections are losses, apart. With `locationId`, the same at one location.
 */
export function consumption(
  movements: readonly StoreMovement[],
  locations: Locations,
  period: { from: Date; to: Date },
  locationId?: string,
): ConsumptionResult {
  const t = { suppliedNet: 0, wardUsed: 0, cartUsed: 0, issueOnlyWardNet: 0 };
  const l = { writtenOff: 0, adjusted: 0, countCorrection: 0 };
  for (const m of movements) {
    if (m.effectiveAt < period.from || m.effectiveAt >= period.to) continue;
    if (locationId !== undefined && m.pointId !== locationId) continue;
    const loc = locations.get(m.pointId);
    if (!loc) continue;
    const q = -m.quantity;
    if ((m.kind === "supplied" || m.kind === "reversed") && loc.kind === "dispensing_point")
      t.suppliedNet += q;
    else if (m.kind === "ward_used") t.wardUsed += q;
    else if (m.kind === "cart_used") t.cartUsed += q;
    // LC-3 gives an issue-only ward no `returned_out` today; the term is kept so CN-1 reads as signed.
    else if (
      (m.kind === "received_from_issue" || m.kind === "returned_out") &&
      isIssueOnlyWard(loc.kind, loc.model)
    )
      t.issueOnlyWardNet -= q;
    else if (m.kind === "written_off") l.writtenOff += q;
    else if (m.kind === "adjusted") l.adjusted += q;
    else if (m.kind === "count_correction") l.countCorrection += q;
  }
  return {
    consumption: t.suppliedNet + t.wardUsed + t.cartUsed + t.issueOnlyWardNet,
    terms: t,
    losses: l,
  };
}

/** Internal transfers seen from the hospital: both legs inside the location set (LC-5, MR-1). */
export function internalPairKeys(
  movements: readonly StoreMovement[],
  inside: ReadonlySet<string>,
): Set<string> {
  const legs = new Map<string, number>();
  for (const m of movements) {
    const k = pairKey(m);
    if (k && inside.has(m.pointId)) legs.set(k, (legs.get(k) ?? 0) + 1);
  }
  return new Set([...legs].filter(([, n]) => n >= 2).map(([k]) => k));
}

export type DayRule = "end_of_day" | "any_part";

/**
 * CN-3: whole local days in [fromDate, toDate] on which the medicine's unexpired, unblocked total across
 * stores and dispensing points was zero or less: at the end of the day, or at any moment of it, by the
 * signed day rule (D-PH2-11). `blockedFrom` gives when a batch became blocked (an open recall); batches
 * at quarantine, wards and carts never count. Unsigned rule: nothing is computed.
 */
export function daysOutOfStock(input: {
  movements: readonly StoreMovement[];
  batches: readonly StoreBatch[];
  locations: Locations;
  medicineId: string;
  fromDate: string;
  toDate: string;
  dayRule: DayRule | null;
  blockedFrom?: ReadonlyMap<string, Date>;
}): { missing: ["stockout_day_rule"] } | { days: number; dates: string[] } {
  if (input.dayRule === null) return { missing: ["stockout_day_rule"] };
  const own = input.batches.filter((b) => {
    const k = input.locations.get(b.pointId)?.kind;
    return b.medicineId === input.medicineId && (k === "store" || k === "dispensing_point");
  });
  const ids = new Set(own.map((b) => b.id));
  const ms = input.movements
    .filter((m) => ids.has(m.batchId))
    .sort(
      (a, b) =>
        a.effectiveAt.getTime() - b.effectiveAt.getTime() ||
        a.recordedAt.getTime() - b.recordedAt.getTime(),
    );
  const bal = new Map<string, number>();
  const total = (date: string, at: Date) =>
    own.reduce((s, b) => {
      const blocked = input.blockedFrom?.get(b.id);
      if (isExpired(b, date) || (blocked && blocked <= at)) return s;
      return s + (bal.get(b.id) ?? 0);
    }, 0);
  let i = 0;
  const apply = (before: Date, each?: () => void) => {
    while (i < ms.length && (ms[i] as StoreMovement).effectiveAt < before) {
      const m = ms[i] as StoreMovement;
      bal.set(m.batchId, (bal.get(m.batchId) ?? 0) + m.quantity);
      i++;
      // Legs at the same instant (a pair) are one event.
      if (ms[i]?.effectiveAt.getTime() !== m.effectiveAt.getTime()) each?.();
    }
  };
  const dates: string[] = [];
  apply(dayStart(input.fromDate));
  for (let d = input.fromDate; d <= input.toDate; d = addDays(d, 1)) {
    const start = dayStart(d);
    const end = dayStart(addDays(d, 1));
    let out = input.dayRule === "any_part" && total(d, start) <= 0;
    apply(end, () => {
      if (input.dayRule === "any_part" && total(d, (ms[i - 1] as StoreMovement).effectiveAt) <= 0)
        out = true;
    });
    if (total(d, new Date(end.getTime() - 1)) <= 0) out = true;
    if (out) dates.push(d);
  }
  return { days: dates.length, dates };
}

export interface AmcStep {
  step: string;
  value: number;
}

/**
 * CN-4, CN-5: adjusted average monthly consumption, EMHS 2023 §3.3.1.1: consumption ÷ days in stock ×
 * the window's days, per month (the window's days ÷ its whole months). No days in stock: no figure.
 * History shorter than the signed minimum is flagged "Short history"; nothing is extrapolated. Every
 * input and step is returned so the screen shows the arithmetic.
 */
export function adjustedAmc(input: {
  consumption: number;
  windowDays: number;
  windowMonths: number;
  daysOut: number;
  historyDays: number;
  minHistoryDays: number | null;
}):
  | { missing: ("review_window" | "minimum_history")[] }
  | {
      amc: number | null;
      reason: "no_days_in_stock" | null;
      steps: AmcStep[];
      flags: "short_history"[];
      inputs: typeof input;
    } {
  const missing: ("review_window" | "minimum_history")[] = [];
  if (!(input.windowDays > 0 && Number.isInteger(input.windowMonths) && input.windowMonths > 0))
    missing.push("review_window");
  if (input.minHistoryDays === null) missing.push("minimum_history");
  if (missing.length > 0) return { missing };
  const daysInStock = input.windowDays - input.daysOut;
  const steps: AmcStep[] = [
    { step: "Consumption in the window", value: input.consumption },
    { step: "Days in the window", value: input.windowDays },
    { step: "Days out of stock", value: input.daysOut },
    { step: "Days in stock", value: daysInStock },
  ];
  const flags: "short_history"[] =
    input.historyDays < (input.minHistoryDays as number) ? ["short_history"] : [];
  if (daysInStock <= 0)
    return { amc: null, reason: "no_days_in_stock", steps, flags, inputs: input };
  // Multiply first: whole numbers stay exact (40 × 60 ÷ 48 = 50, not 50.000…1).
  const adjusted = (input.consumption * input.windowDays) / daysInStock;
  const amc = adjusted / input.windowMonths;
  steps.push(
    {
      step: "Adjusted consumption (consumption ÷ days in stock × days in the window)",
      value: adjusted,
    },
    { step: "Months in the window", value: input.windowMonths },
    { step: "Adjusted average monthly consumption", value: amc },
  );
  return { amc, reason: null, steps, flags, inputs: input };
}
