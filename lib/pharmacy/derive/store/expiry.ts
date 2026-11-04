import type { StoreBatch, StoreMed, StoreWorld } from "./types";

import { monthsTo } from "./format";
import { medOf } from "./stock";

/** Expiry (STORE.md §F2, §H). Pure. */

/** Quantity that won't be used before expiry: qty − (use a month × months to expiry). */
export const riskQty = (qty: number, use: number, months: number) =>
  Math.max(0, Math.round(qty - use * Math.max(0, months)));

export interface ExpRow {
  batch: StoreBatch;
  med: StoreMed;
  months: number;
  risk: number;
  value: number;
  done: string | null;
}

/** Batches inside the expiry window, soonest first. */
export function expRows(w: StoreWorld): ExpRow[] {
  const out: ExpRow[] = [];
  for (const b of w.batches) {
    const months = monthsTo(b.exp, w.today);
    if (months > w.rules.expiryWindow) continue;
    const med = medOf(w, b.medId);
    const risk = riskQty(b.qty, med.use, months);
    out.push({
      batch: b,
      med,
      months,
      risk,
      value: risk * med.cost,
      done: w.expiryActions[b.id] ?? null,
    });
  }
  return out.sort((a, b) => a.months - b.months);
}
export const atRisk = (rows: readonly ExpRow[]) => rows.filter((e) => e.risk > 0 && !e.done);
export const atRiskValue = (rows: readonly ExpRow[]) =>
  atRisk(rows).reduce((a, e) => a + e.value, 0);

/** The place that uses it fastest and is short: the biggest use − here, when above zero. */
export function bestPlace(w: StoreWorld, medId: string): string | null {
  let best: { id: string; v: number } | null = null;
  for (const p of w.placeStock)
    if (p.medId === medId && (!best || p.use - p.here > best.v))
      best = { id: p.placeId, v: p.use - p.here };
  return best && best.v > 0 ? best.id : null;
}

export interface ExpMonth {
  month: string;
  n: number;
  used: number;
  risk: number;
}
/** Value expiring in each of the next 12 months: will be used in time, won't be. */
export function expByMonth(w: StoreWorld, months = 12): ExpMonth[] {
  const y = +w.today.slice(0, 4);
  const mo = +w.today.slice(5, 7) - 1;
  const out: ExpMonth[] = Array.from({ length: months }, (_, i) => {
    const t = y * 12 + mo + i;
    return {
      month: `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}-01`,
      n: 0,
      used: 0,
      risk: 0,
    };
  });
  for (const b of w.batches) {
    const idx = (+b.exp.slice(0, 4) - y) * 12 + (+b.exp.slice(5, 7) - 1) - mo;
    if (idx < 0 || idx >= months) continue;
    const med = medOf(w, b.medId);
    const risk = w.expiryActions[b.id] ? 0 : riskQty(b.qty, med.use, monthsTo(b.exp, w.today));
    out[idx]!.risk += risk * med.cost;
    out[idx]!.used += (b.qty - risk) * med.cost;
    out[idx]!.n++;
  }
  return out;
}
