/**
 * The turnaround clock (Lab Phase 0, ADR 0225; TA-1..TA-8). Pure: no I/O and no device clock.
 *
 * - The clock runs from the lab's receipt of the specimen to final release (D-LAB0-06). Before
 *   receipt the cell shows the time since collection, with no label and no colour.
 * - The target is the facility's stated turnaround from the hub when it reads as one unambiguous
 *   duration, else the catalogue's target (marked "default"), else none (D-LAB0-07, D-LAB0-16).
 *   No figure is derived, halved, defaulted or hard-coded (Law 5).
 * - "Now" is the server's time plus how long the page has been open, never the device's clock
 *   (Law 6, TA-6).
 */

export type TargetSource = "facility" | "catalogue";
export interface Target {
  minutes: number;
  source: TargetSource;
}

const UNITS: Record<string, number> = {
  min: 1,
  mins: 1,
  minute: 1,
  minutes: 1,
  h: 60,
  hr: 60,
  hrs: 60,
  hour: 60,
  hours: 60,
  d: 1440,
  day: 1440,
  days: 1440,
};
const PART = "([1-9]\\d{0,2})\\s*(min|mins|minutes?|h|hrs?|hours?|d|days?)";
const ONE = new RegExp(`^${PART}$`, "i");
const HOURS_AND_MINUTES = new RegExp(
  "^([1-9]\\d{0,2})\\s*(h|hrs?|hours?)\\s+([1-9]\\d{0,2})\\s*(min|mins|minutes?)$",
  "i",
);

/**
 * The hub's `stated_tat` as minutes, only when it is one unambiguous duration: "45 min", "2 h",
 * "1 h 30 min", "1 d". Ranges, words, decimals and anything else are not a figure: null.
 */
export function parseStatedTat(text: string | null | undefined): number | null {
  const t = text?.trim();
  if (!t) return null;
  const hm = HOURS_AND_MINUTES.exec(t);
  if (hm) return Number(hm[1]) * 60 + Number(hm[3]);
  const one = ONE.exec(t);
  if (!one) return null;
  return Number(one[1]) * UNITS[one[2]!.toLowerCase()]!;
}

export function targetFor(
  statedTat: string | null | undefined,
  catalogueMinutes: number | null | undefined,
): Target | null {
  const stated = parseStatedTat(statedTat);
  if (stated !== null) return { minutes: stated, source: "facility" };
  if (catalogueMinutes != null && catalogueMinutes > 0)
    return { minutes: catalogueMinutes, source: "catalogue" };
  return null;
}

/** `24 min`, `1 h 10 min`, `2 d 3 h` (TA-8). Whole minutes, floored. */
export function formatDuration(totalMinutes: number): string {
  const m = Math.max(0, Math.floor(totalMinutes));
  if (m < 60) return `${m} min`;
  if (m < 1440) {
    const h = Math.floor(m / 60);
    const r = m % 60;
    return r ? `${h} h ${r} min` : `${h} h`;
  }
  const d = Math.floor(m / 1440);
  const h = Math.floor((m % 1440) / 60);
  return h ? `${d} d ${h} h` : `${d} d`;
}

export type Clock =
  | { kind: "not_received"; sinceCollection: number }
  | { kind: "running"; elapsed: number; target: Target | null; lateBy: number | null };

const minutesBetween = (from: Date, to: Date) =>
  Math.floor((to.getTime() - from.getTime()) / 60_000);

/** TA-1..TA-4: the clock for one open specimen at `now` (server-derived). */
export function clockFor(
  times: { collectedAt: Date; receivedAt: Date | null },
  target: Target | null,
  now: Date,
): Clock {
  if (!times.receivedAt)
    return { kind: "not_received", sinceCollection: minutesBetween(times.collectedAt, now) };
  const elapsed = Math.max(0, minutesBetween(times.receivedAt, now));
  const lateBy = target && elapsed > target.minutes ? elapsed - target.minutes : null;
  return { kind: "running", elapsed, target, lateBy };
}

/** Turnaround of a released result: receipt to final release, against its target. */
export function releasedTurnaround(
  receivedAt: Date | null,
  releasedAt: Date,
  target: Target | null,
): { minutes: number; lateBy: number | null } | null {
  if (!receivedAt) return null;
  const minutes = Math.max(0, minutesBetween(receivedAt, releasedAt));
  return { minutes, lateBy: target && minutes > target.minutes ? minutes - target.minutes : null };
}

/**
 * TA-6: the server's "now", advanced by how long the page has been open as measured by the
 * monotonic clock (`performance.now()`), so a device clock hours wrong changes nothing.
 */
export function serverNowAt(serverNowMs: number, monotonicAtLoad: number, monotonicNow: number) {
  return new Date(serverNowMs + Math.max(0, monotonicNow - monotonicAtLoad));
}
