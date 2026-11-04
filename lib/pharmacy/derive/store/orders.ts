import type { StoreMed, StoreRules, StoreWorld, SupplierStat } from "./types";

import { notMoving, onHand } from "./stock";

/** Orders (STORE.md §E1, §H). Pure. */

/** ceil((use × months − here − on order) / pack) × pack, never below zero. */
export const suggest = (use: number, months: number, here: number, onOrder: number, pack: number) =>
  Math.ceil(Math.max(0, use * months - here - onOrder) / Math.max(1, pack)) * Math.max(1, pack);

export const orderable = (w: StoreWorld) => w.meds.filter((m) => !notMoving(m, w.rules));

export const suggestFor = (w: StoreWorld, m: StoreMed) =>
  suggest(m.use, w.rules.monthsTo, onHand(w, m.id), m.onOrder, m.pack);

export interface PlanLine {
  medId: string;
  ven: StoreMed["ven"];
  qty: number;
  cost: number;
  pack: number;
  /** The quantity that holds the trim months. */
  minQty: number;
}

export const planTotal = (lines: readonly Pick<PlanLine, "qty" | "cost">[]) =>
  lines.reduce((a, l) => a + l.qty * l.cost, 0);

/** N lines first, then E, down to the trim months; V is never cut. Returns the new quantities and the trimmed lines. */
export function trimToBudget(lines: readonly PlanLine[], budget: number) {
  const qty = new Map(lines.map((l) => [l.medId, l.qty]));
  const trimmed: string[] = [];
  let tot = planTotal(lines);
  for (const v of ["N", "E"] as const)
    for (const l of lines) {
      if (l.ven !== v || tot <= budget || l.cost <= 0) continue;
      const cur = qty.get(l.medId) ?? 0;
      const cut = Math.min(cur - l.minQty, Math.ceil((tot - budget) / l.cost / l.pack) * l.pack);
      if (cut > 0) {
        qty.set(l.medId, cur - cut);
        tot -= cut * l.cost;
        trimmed.push(l.medId);
      }
    }
  return { qty, trimmed, total: tot, stillOver: tot > budget };
}

export const minQtyFor = (w: StoreWorld, m: StoreMed, r: StoreRules) =>
  suggest(m.use, r.trimTo, onHand(w, m.id), m.onOrder, m.pack);

export const budgetPct = (total: number, budget: number) =>
  budget > 0 ? Math.round((total / budget) * 100) : null;

/** Computed from the GRNs against the orders. */
export const supplierFillRate = (s: Pick<SupplierStat, "ordered" | "received">) =>
  s.ordered > 0 ? Math.round((Math.min(s.received, s.ordered) / s.ordered) * 100) : null;
export const supplierLeadDays = (s: Pick<SupplierStat, "leadDays">) =>
  s.leadDays.length ? Math.round(s.leadDays.reduce((a, b) => a + b, 0) / s.leadDays.length) : null;
