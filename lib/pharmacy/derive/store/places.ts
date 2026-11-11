import type { BalanceRow, PlaceStock, StoreMed, StoreWorld } from "./types";

import { ix, medOf, onHand } from "./stock";

/**
 * The places (STORE.md §H): what is in transit counts as "on the way" in days of cover, needs and runs, and only there,
 * so nothing is counted twice: the ledger puts it at the place only on confirmation. Pure.
 */
export const psOf = (w: StoreWorld, medId: string, placeId: string): PlaceStock | null =>
  ix(w).place.get(`${medId}|${placeId}`) ?? null;
export const transitTo = (w: StoreWorld, medId: string, placeId: string) =>
  ix(w).transit.get(`${medId}|${placeId}`) ?? 0;

export function daysAt(w: StoreWorld, medId: string, placeId: string) {
  const p = psOf(w, medId, placeId);
  return p ? ((p.here + transitTo(w, medId, placeId)) / Math.max(1, p.use)) * 30 : null;
}
export function needAt(w: StoreWorld, medId: string, placeId: string) {
  const p = psOf(w, medId, placeId);
  return p ? Math.max(0, p.level - p.here - transitTo(w, medId, placeId)) : 0;
}

export interface LowLine {
  medId: string;
  placeId: string;
  days: number;
  need: number;
}
/** Every place × line at or under the running-out rule, counting what is on the way; fewest days first. */
export function lowList(w: StoreWorld): LowLine[] {
  const out: LowLine[] = [];
  for (const p of w.placeStock) {
    const d = daysAt(w, p.medId, p.placeId);
    if (d !== null && d <= w.rules.runningOut)
      out.push({
        medId: p.medId,
        placeId: p.placeId,
        days: d,
        need: needAt(w, p.medId, p.placeId),
      });
  }
  return out.sort((a, b) => a.days - b.days);
}

/** Another place holding spare: over the transfer rule and above its level. */
export const spareAt = (w: StoreWorld, medId: string, placeId: string) =>
  w.placeStock.filter(
    (q) =>
      q.medId === medId &&
      q.placeId !== placeId &&
      q.here > q.level &&
      (q.here / Math.max(1, q.use)) * 30 > w.rules.transferOver,
  );

export interface Transfer {
  key: string;
  medId: string;
  fromId: string;
  toId: string;
  qty: number;
  fromDays: number;
  toDays: number;
  /** "Arranged on TRF-…": stays listed after the need is met. */
  voucher: string | null;
}

/** One place over the rule with excess, another under it with a need: min(excess, need). */
export function transfers(w: StoreWorld): Transfer[] {
  const out: Transfer[] = [];
  const done = new Map(w.transfersArranged.map((t) => [t.key, t]));
  const byMed = new Map<string, PlaceStock[]>();
  for (const p of w.placeStock) byMed.set(p.medId, [...(byMed.get(p.medId) ?? []), p]);
  for (const [medId, ps] of byMed)
    for (const a of ps) {
      const ex = a.here - a.level;
      const fromDays = (a.here / Math.max(1, a.use)) * 30;
      for (const b of ps) {
        if (a.placeId === b.placeId) continue;
        const key = `${medId}|${a.placeId}|${b.placeId}`;
        const arranged = done.get(key);
        const toDays = daysAt(w, medId, b.placeId) ?? 0;
        if (arranged) {
          out.push({
            key,
            medId,
            fromId: a.placeId,
            toId: b.placeId,
            qty: arranged.qty,
            fromDays,
            toDays,
            voucher: arranged.voucher,
          });
          continue;
        }
        if (ex <= 0 || fromDays <= w.rules.transferOver) continue;
        const need = needAt(w, medId, b.placeId);
        if (toDays >= w.rules.transferUnder || need <= 0) continue;
        out.push({
          key,
          medId,
          fromId: a.placeId,
          toId: b.placeId,
          qty: Math.min(ex, need),
          fromDays,
          toDays,
          voucher: null,
        });
      }
    }
  return out;
}

export interface RunLine {
  medId: string;
  need: number;
  give: number;
}
/** Top-up level − on hand − in transit, limited by the store. */
export function runLines(w: StoreWorld, placeId: string): RunLine[] {
  return w.placeStock
    .filter((p) => p.placeId === placeId)
    .flatMap((p) => {
      const need = needAt(w, p.medId, placeId);
      return need > 0 ? [{ medId: p.medId, need, give: Math.min(need, onHand(w, p.medId)) }] : [];
    });
}

export type CoverBand = 0 | 1 | 2;
/** Lines under the running-out rule, up to the amber rule, and over it (the prototype's < 7, < 14). */
export function coverBuckets(w: StoreWorld, placeId: string): [number, number, number] {
  const c: [number, number, number] = [0, 0, 0];
  for (const p of w.placeStock) {
    if (p.placeId !== placeId) continue;
    const d = daysAt(w, p.medId, placeId);
    if (d !== null) c[d < w.rules.runningOut ? 0 : d < w.rules.coverAmber ? 1 : 2]++;
  }
  return c;
}

export interface PlaceBalance {
  placeId: string;
  start: number;
  received: number;
  used: number;
  sent: number;
  shelf: number;
  /** UGX unexplained, positive lines only: a surplus on one line never hides a loss on another. */
  gap: number;
  controlledGap: boolean;
  /** The line with the biggest gap. */
  why: string | null;
  state: "bad" | "warn" | "ok";
}

/** Unexplained = start + received − used − sent out − shelf, for one place this month, in value. */
export function placeBalance(w: StoreWorld, placeId: string): PlaceBalance {
  const rows: BalanceRow[] = w.balances.filter((b) => b.placeId === placeId);
  const r: PlaceBalance = {
    placeId,
    start: 0,
    received: 0,
    used: 0,
    sent: 0,
    shelf: 0,
    gap: 0,
    controlledGap: false,
    why: null,
    state: "ok",
  };
  let worst = 0;
  for (const b of rows) {
    const m: StoreMed | undefined = medOf(w, b.medId);
    const cost = m?.cost ?? 0;
    r.start += b.opening * cost;
    r.received += b.received * cost;
    r.used += b.used * cost;
    r.sent += b.sent * cost;
    r.shelf += b.closing * cost;
    const qty = b.opening + b.received - b.used - b.sent - b.closing;
    if (qty > 0) {
      const v = qty * cost;
      r.gap += v;
      if (m?.controlled) r.controlledGap = true;
      if (v >= worst) {
        worst = v;
        r.why = m?.short ?? null;
      }
    }
  }
  r.state = r.gap > w.rules.balanceCase || r.controlledGap ? "bad" : r.gap > 0 ? "warn" : "ok";
  return r;
}
