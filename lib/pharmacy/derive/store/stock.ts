import type { Dispatch, StoreBatch, StoreMed, StoreRules, StoreWorld } from "./types";

/** Store stock (STORE.md §H): the prototype's `onHand`, `mosOf`, `stateOf`, `fefo`, `takeOut`. Pure. */
const cache = new WeakMap<StoreWorld, ReturnType<typeof build>>();
function build(w: StoreWorld) {
  const hand = new Map<string, number>();
  const list = new Map<string, StoreBatch[]>();
  for (const b of w.batches) {
    if (!b.blocked) hand.set(b.medId, (hand.get(b.medId) ?? 0) + b.qty);
    const l = list.get(b.medId);
    if (l) l.push(b);
    else list.set(b.medId, [b]);
  }
  for (const l of list.values())
    l.sort((a, b) => a.exp.localeCompare(b.exp) || a.no.localeCompare(b.no));
  const transit = new Map<string, number>();
  for (const d of w.dispatches as Dispatch[])
    if (d.status === "transit")
      for (const l of d.lines) {
        const k = `${l.medId}|${d.toId}`;
        transit.set(k, (transit.get(k) ?? 0) + l.qty);
      }
  const place = new Map(w.placeStock.map((p) => [`${p.medId}|${p.placeId}`, p]));
  const meds = new Map(w.meds.map((m) => [m.id, m]));
  const places = new Map(w.places.map((p) => [p.id, p]));
  return { hand, list, transit, place, meds, places };
}
export const ix = (w: StoreWorld) => {
  let c = cache.get(w);
  if (!c) {
    c = build(w);
    cache.set(w, c);
  }
  return c;
};

export const onHand = (w: StoreWorld, id: string) => ix(w).hand.get(id) ?? 0;
export const batchesOf = (w: StoreWorld, id: string) => ix(w).list.get(id) ?? [];
export const medOf = (w: StoreWorld, id: string) => ix(w).meds.get(id)!;
export const placeOf = (w: StoreWorld, id: string) => ix(w).places.get(id);
export const placeName = (w: StoreWorld, id: string) =>
  id === w.storeId ? w.storeName : (ix(w).places.get(id)?.name ?? "");

export const mosOf = (w: StoreWorld, m: StoreMed) =>
  m.use > 0 ? onHand(w, m.id) / m.use : onHand(w, m.id) ? Infinity : 0;

export type StockState = "out" | "still" | "short" | "over" | "ok";
export const notMoving = (m: StoreMed, r: StoreRules) => m.moved === null || m.moved > r.notMoving;

export function stateOf(w: StoreWorld, m: StoreMed): StockState {
  const h = onHand(w, m.id);
  if (!h) return "out";
  if (notMoving(m, w.rules)) return "still";
  const mos = mosOf(w, m);
  if (mos < w.rules.shortUnder) return "short";
  if (mos > w.rules.tooMuch) return "over";
  return "ok";
}

export interface Take {
  batchId: string;
  no: string;
  exp: string;
  bin: string | null;
  n: number;
}

/** First expiry first across batches, as many as `qty` asks. The list is in expiry order already. */
export function fefo(list: readonly StoreBatch[], qty: number): Take[] {
  const out: Take[] = [];
  let left = qty;
  for (const b of [...list].sort(
    (x, y) => x.exp.localeCompare(y.exp) || x.no.localeCompare(y.no),
  )) {
    if (left <= 0) break;
    if (!b.qty || b.blocked) continue;
    const n = Math.min(b.qty, left);
    out.push({ batchId: b.id, no: b.no, exp: b.exp, bin: b.bin, n });
    left -= n;
  }
  return out;
}

/** What is left of the list after a take. */
export function takeOut(list: readonly StoreBatch[], qty: number): StoreBatch[] {
  const taken = new Map(fefo(list, qty).map((t) => [t.batchId, t.n]));
  return list.map((b) => ({ ...b, qty: b.qty - (taken.get(b.id) ?? 0) })).filter((b) => b.qty > 0);
}

export const storeValue = (w: StoreWorld) =>
  w.batches.reduce((a, b) => a + (b.blocked ? 0 : b.qty * (medOf(w, b.medId)?.cost ?? 0)), 0);
