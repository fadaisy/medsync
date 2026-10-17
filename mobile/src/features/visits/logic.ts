import { DEFAULT_TIME_ZONE, localDateKey, localSession } from "@shared/slots";

/**
 * The arithmetic behind the booking screens (Gate 4), kept pure so it is
 * tested without a network: the line maths, the ticket's payment look, the
 * calendar grid and the words for a clinic day. Nothing here reads a clock
 * on its own; callers pass `now`.
 */

/** A doctor's line today: how many are waiting before a newcomer. */
export interface Line {
  id: string;
  ahead: number;
}

/** The number you would hold if you joined a line with `ahead` people in it. */
export function yourNumber(ahead: number): number {
  return Math.max(0, Math.floor(ahead)) + 1;
}

/** "Any doctor" means the shortest line; ties go to the first listed. */
export function shortestLine<T extends Line>(lines: readonly T[]): T | null {
  let best: T | null = null;
  for (const l of lines) if (!best || l.ahead < best.ahead) best = l;
  return best;
}

/**
 * The three ticket looks (prompt §8.3), chosen by the money alone:
 * no fee → quiet grey, a fee not yet paid → outlined with "Pay now",
 * paid → lagoon with the PAID stamp.
 */
export type PayLook = "free" | "owed" | "paid";

export function payLook(fee: number | null, paid: boolean): PayLook {
  if (!fee || fee <= 0) return "free";
  return paid ? "paid" : "owed";
}

/** "UGX 30,000", or "No fee" for public services (PRD Q4). */
export function feeText(fee: number | null): string {
  return fee && fee > 0 ? `UGX ${fee.toLocaleString("en-US")}` : "No fee";
}

/** 1st, 2nd, 3rd, 4th … 11th, 12th, 13th, 21st. */
export function ordinal(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  const last = n % 10;
  return `${n}${last === 1 ? "st" : last === 2 ? "nd" : last === 3 ? "rd" : "th"}`;
}

/* ─── days, in the hospital's zone ───────────────────────────────── */

const TZ = DEFAULT_TIME_ZONE;

const fmt = (opts: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat("en-GB", { timeZone: TZ, ...opts });
const WEEKDAY = fmt({ weekday: "short" });
const DAY_NUM = fmt({ day: "numeric" });
const MONTH_SHORT = fmt({ month: "short" });
const MONTH_LONG = fmt({ month: "long", year: "numeric" });
const DAY_LONG = fmt({ weekday: "long", day: "numeric", month: "long" });
const DAY_SHORT = fmt({ weekday: "short", day: "numeric", month: "short" });
const CLOCK = fmt({ hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

/** Noon UTC of a `YYYY-MM-DD` key: the same civil day in every zone near Africa. */
export const keyInstant = (key: string) => new Date(`${key}T12:00:00Z`);

export const dayKeyOf = (at: Date | string) => localDateKey(at, TZ);
export const weekdayOf = (key: string) => WEEKDAY.format(keyInstant(key));
export const dayNumberOf = (key: string) => DAY_NUM.format(keyInstant(key));
export const monthShortOf = (key: string) => MONTH_SHORT.format(keyInstant(key));
export const monthTitleOf = (key: string) => MONTH_LONG.format(keyInstant(key));
export const longDayOf = (key: string) => DAY_LONG.format(keyInstant(key));
export const shortDayOf = (key: string) => DAY_SHORT.format(keyInstant(key));

/** "08:00": when doors open, or when something was done. Never "your turn" (law L8). */
export const clockOf = (iso: string) => CLOCK.format(new Date(iso));

/** Morning or afternoon, split at local noon (the engine's own word, ADR 0084 §10). */
export function partOf(iso: string): "Morning" | "Afternoon" {
  return localSession(iso, TZ) === "morning" ? "Morning" : "Afternoon";
}

/** Whole days from `fromKey` to `toKey`. */
export function daysBetween(fromKey: string, toKey: string): number {
  return Math.round((keyInstant(toKey).getTime() - keyInstant(fromKey).getTime()) / 86_400_000);
}

/** The key `n` days after `key`. */
export function addDays(key: string, n: number): string {
  return new Date(keyInstant(key).getTime() + n * 86_400_000).toISOString().slice(0, 10);
}

/** "in 6 days", "tomorrow", "today". */
export function inDays(n: number): string {
  if (n <= 0) return "today";
  if (n === 1) return "tomorrow";
  return `in ${n} days`;
}

/** The first of the month `delta` months from the month holding `key`. */
export function shiftMonth(key: string, delta: number): string {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return d.toISOString().slice(0, 10);
}

/**
 * A Monday-first month grid: `null` for the blanks before the 1st and after
 * the last day, so the grid is always whole weeks.
 */
export function monthGrid(key: string): (string | null)[] {
  const [y, m] = key.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const lead = (first.getUTCDay() + 6) % 7;
  const cells: (string | null)[] = Array.from({ length: lead }, () => null);
  for (let d = 1; d <= days; d++)
    cells.push(`${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
  while (cells.length % 7) cells.push(null);
  return cells;
}

/** A short code a desk can read aloud, from any id: "KWP-4827" style, digits only after the dash. */
export function deskCode(prefix: string, id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return `${prefix}-${String(h % 10_000).padStart(4, "0")}`;
}

/**
 * Bar widths for the drawn barcode, from the code itself so the same code
 * always draws the same bars. Decoration: the desk reads the printed code.
 */
export function barsFor(code: string, width = 230): { x: number; w: number }[] {
  const bars: { x: number; w: number }[] = [];
  let seed = 0;
  for (let i = 0; i < code.length; i++) seed = (seed * 33 + code.charCodeAt(i)) >>> 0;
  let x = 0;
  while (x < width) {
    seed = (seed * 1_103_515_245 + 12_345) >>> 0;
    const w = 1 + ((seed >>> 8) % 4);
    const gap = 1 + ((seed >>> 16) % 3);
    if (x + w > width) break;
    bars.push({ x, w });
    x += w + gap;
  }
  return bars;
}
