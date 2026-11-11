import type { ReqLine, Requisition, StoreMed, StoreRules, StoreWorld } from "./types";

import { dayOf, median } from "./format";
import { needAt, psOf } from "./places";
import { onHand } from "./stock";

/** Requisitions (STORE.md §C1, §H). Pure. */
export const isOpen = (r: Pick<Requisition, "state">) =>
  r.state === "open" || r.state === "partial";
export const openReqs = (w: StoreWorld) => w.requisitions.filter(isOpen);

/** Urgent first, then open, then the rest. */
export function sortedReqs(rs: readonly Requisition[]): Requisition[] {
  return [...rs].sort((a, b) => {
    if (isOpen(a) !== isOpen(b)) return isOpen(a) ? -1 : 1;
    if (a.urgent !== b.urgent) return a.urgent ? -1 : 1;
    /* Open: the longest wait on top. Done: the latest on top. */
    return isOpen(a) ? a.askedAt.localeCompare(b.askedAt) : b.askedAt.localeCompare(a.askedAt);
  });
}

/** What is still asked of a line: the owed quantity after a partial issue. */
export const lineQtyAsked = (l: ReqLine) => Math.max(0, l.asked - l.issued);

export type NeedNote =
  | { kind: "at_level" }
  | { kind: "more"; n: number }
  | { kind: "less"; n: number }
  | { kind: "needs"; n: number };

/** "Asks more" over the rule × the need or the need plus a pack; "asks less" under the other rule × it. */
export function needNote(
  asked: number,
  need: number,
  pack: number,
  r: Pick<StoreRules, "overLevel" | "asksLess">,
): NeedNote {
  if (need === 0) return { kind: "at_level" };
  if (asked > Math.max(need * r.overLevel, need + pack)) return { kind: "more", n: need };
  if (asked < need * r.asksLess) return { kind: "less", n: need };
  return { kind: "needs", n: need };
}

export const askedOpen = (w: StoreWorld, medId: string) =>
  openReqs(w).reduce((a, r) => {
    const l = r.lines.find((x) => x.medId === medId);
    return a + (l ? lineQtyAsked(l) : 0);
  }, 0);

/** Lines of this requisition asked by more than one open request, over what is on hand. */
export function shortMeds(w: StoreWorld, r: Requisition): string[] {
  if (!isOpen(r)) return [];
  return r.lines
    .filter((l) => {
      const have = onHand(w, l.medId);
      return (
        have > 0 &&
        askedOpen(w, l.medId) > have &&
        openReqs(w).filter((o) => o.lines.some((x) => x.medId === l.medId)).length > 1
      );
    })
    .map((l) => l.medId);
}

export interface FairShare {
  /** Requisition id → what it gets. */
  give: Record<string, number>;
  /** The days of cover everyone reached. */
  days: number;
}

/** Urgent requests first, up to the rule's days of cover; the rest water-filled to equal days (binary search). */
export function shareFair(
  avail: number,
  asks: readonly { id: string; urgent: boolean; asked: number; have: number; use: number }[],
  urgentDays: number,
): FairShare {
  let left = avail;
  const parts = asks.map((a) => {
    const use = Math.max(1, a.use);
    let pre = 0;
    if (a.urgent) {
      pre = Math.min(a.asked, Math.max(0, Math.ceil((urgentDays * use) / 30 - a.have)), left);
      left -= pre;
    }
    return { ...a, use, pre };
  });
  let lo = 0;
  let hi = 365;
  for (let k = 0; k < 40; k++) {
    const mid = (lo + hi) / 2;
    const tot = parts.reduce(
      (s, p) => s + Math.min(p.asked - p.pre, Math.max(0, (mid * p.use) / 30 - p.have - p.pre)),
      0,
    );
    if (tot > left) hi = mid;
    else lo = mid;
  }
  const give: Record<string, number> = {};
  for (const p of parts)
    give[p.id] =
      p.pre +
      Math.floor(Math.min(p.asked - p.pre, Math.max(0, (lo * p.use) / 30 - p.have - p.pre)));
  return { give, days: lo };
}

/** Share one medicine across the open requests that ask it. */
export function shareMed(w: StoreWorld, medId: string, fallbackUse: number): FairShare {
  const asks = openReqs(w)
    .filter((r) => r.lines.some((x) => x.medId === medId))
    .map((r) => {
      const l = r.lines.find((x) => x.medId === medId)!;
      const p = psOf(w, medId, r.placeId);
      return {
        id: r.id,
        urgent: r.urgent,
        asked: lineQtyAsked(l),
        have: p?.here ?? 0,
        use: p?.use ?? fallbackUse / 4,
      };
    });
  return shareFair(onHand(w, medId), asks, w.rules.urgentDays);
}

export type LineNote =
  | { kind: "out"; owed: number }
  | { kind: "only"; have: number }
  | { kind: "owed"; owed: number }
  | null;
export function lineNote(asked: number, q: number, have: number): LineNote {
  if (!have) return { kind: "out", owed: asked };
  if (q > have) return { kind: "only", have };
  if (q < asked) return { kind: "owed", owed: asked - q };
  return null;
}

/** Disabled when nothing is to be issued, a line is over stock, or the witness is missing. */
export function canIssue(
  lines: readonly { qty: number; have: number; controlled: boolean }[],
  witness: boolean,
): boolean {
  const total = lines.reduce((a, l) => a + Math.min(l.qty, l.have), 0);
  if (!total || lines.some((l) => l.qty > l.have)) return false;
  return witness || !lines.some((l) => l.controlled && l.qty > 0);
}

/** Share of lines issued as asked among requisitions issued in the week starting `start`; null when none. */
export function fillRate(rs: readonly Requisition[], start: string, end: string): number | null {
  let all = 0;
  let full = 0;
  for (const r of rs) {
    if (!r.firstIssuedAt) continue;
    const d = dayOf(r.firstIssuedAt);
    if (d < start || d >= end) continue;
    for (const l of r.lines) {
      all++;
      if (l.issued >= l.asked) full++;
    }
  }
  return all ? Math.round((full / all) * 100) : null;
}

/** Median hours from asked to first issue, among those first issued in the week. */
export function turnaround(rs: readonly Requisition[], start: string, end: string): number | null {
  const hours = rs
    .filter(
      (r) => r.firstIssuedAt && dayOf(r.firstIssuedAt) >= start && dayOf(r.firstIssuedAt) < end,
    )
    .map((r) => (Date.parse(r.firstIssuedAt!) - Date.parse(r.askedAt)) / 3_600_000)
    .filter((h) => h >= 0);
  const m = median(hours);
  return m === null ? null : Math.round(m * 10) / 10;
}

export const needOf = (w: StoreWorld, m: StoreMed, placeId: string) =>
  psOf(w, m.id, placeId) ? needAt(w, m.id, placeId) : null;
