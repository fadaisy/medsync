import type { FeeInputs } from "@shared/fees";
import { feeRange, resolveFee } from "@shared/fees";
import { DEFAULT_TIME_ZONE, localDateKey, localSession } from "@shared/slots";

/**
 * The arithmetic behind the booking screens (Gate 4), kept pure so it is
 * tested without a network: the "ahead of you" rule, fees, the ticket's
 * payment look, the calendar grid and the words for a clinic day. Nothing
 * here reads a clock on its own; callers pass `now`.
 */

/* ─── where the patient stands (ADR 0084 §6, ADR 0342 §5) ───────── */

/** Present at the hospital: the only statuses where a count ahead is a true sentence. */
const PRESENT = new Set(["arrived", "awaiting_triage"]);

/**
 * "N ahead of you", or null when nothing honest can be said. Only once the
 * patient is present (a declared row is not a place in the line), only from
 * `patient_intake_ahead` (null on any error or before migration 0170), and
 * never an ordinal, a total or a wait.
 */
export function aheadWords(status: string | null, ahead: number | null): string | null {
  if (!status || !PRESENT.has(status)) return null;
  if (ahead === null || !Number.isInteger(ahead) || ahead < 0) return null;
  return ahead === 0 ? "No one is ahead of you." : `${ahead} ahead of you`;
}

/** Said beside a count, so it is never read as a promise (the web's own words). */
export const AHEAD_NOTE = "Sicker people are seen first, so this number can go up as well as down.";

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

/** One fee as a patient reads it: the lowest amount, and the words when it is a range. */
export interface Fee {
  fee: number | null;
  /** "UGX 20,000 to UGX 50,000" when the clinic charges more than one amount; else null. */
  feeLabel: string | null;
}

/**
 * What a department charges, from its own service lines (ADR 0092, `@shared/fees`):
 * the clinician's cadre resolves one amount per line when it is known; unknown
 * (a walk-in) spans every line's range. No line with a price is no fee: a
 * number is never invented.
 *
 * ponytail: a free line beside a paid one in the same department is ignored,
 * so the paid amount shows. Ceiling: a department mixing free and paid
 * clinics; upgrade by pricing per service line once the patient picks one.
 */
export function feeFor(
  lines: readonly { departmentId: string; fee: FeeInputs }[],
  departmentId: string,
  cadreId: string | null,
): Fee {
  const amounts = lines
    .filter((l) => l.departmentId === departmentId)
    .flatMap((l) => {
      if (cadreId) {
        const q = resolveFee(l.fee, cadreId).feeUgx;
        return q === null ? [] : [q];
      }
      const r = feeRange(l.fee);
      return r ? [r.minUgx, r.maxUgx] : [];
    });
  if (amounts.length === 0) return { fee: null, feeLabel: null };
  const min = Math.min(...amounts);
  const max = Math.max(...amounts);
  return { fee: min, feeLabel: min === max ? null : `${feeText(min)} to ${feeText(max)}` };
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

/** Days, hours, minutes and seconds from `now` until `iso`, never below zero: the countdown beside the time wheel. */
export function countdownOf(
  now: Date,
  iso: string,
): { days: number; hours: number; minutes: number; seconds: number } {
  const secs = Math.max(0, Math.floor((new Date(iso).getTime() - now.getTime()) / 1000));
  return {
    days: Math.floor(secs / 86_400),
    hours: Math.floor((secs % 86_400) / 3600),
    minutes: Math.floor((secs % 3600) / 60),
    seconds: secs % 60,
  };
}

/**
 * "Open in Maps" for a hospital: directions to its pin when its admin set one,
 * else the phone's map app searching its name (the app's own answer, not ours).
 * Apple Maps on iPhone, Google Maps elsewhere; both need no key.
 */
export function mapsUrl(
  os: "ios" | "android" | string,
  name: string,
  pin: { lat: number; lng: number } | null,
): string {
  const place = encodeURIComponent(`${name}, Uganda`);
  if (os === "ios")
    return pin
      ? `https://maps.apple.com/?daddr=${pin.lat},${pin.lng}&q=${encodeURIComponent(name)}`
      : `https://maps.apple.com/?q=${place}`;
  return pin
    ? `https://www.google.com/maps/dir/?api=1&destination=${pin.lat}%2C${pin.lng}`
    : `https://www.google.com/maps/search/?api=1&query=${place}`;
}
