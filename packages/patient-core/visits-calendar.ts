import {
  DEFAULT_TIME_ZONE,
  localDateKey,
  localSession,
} from "../../supabase/functions/_shared/slots";
import { CANCELLABLE, RESCHEDULABLE } from "./visits";

/**
 * This week and One visit, the pure parts: the phone's day arithmetic (mobile/src/features/visits/logic.ts),
 * the rules it keeps in lib/booking.ts and lib/notifications.ts (`canArrive`, `confirmationPending`,
 * `MIN_REASON_CHARS`), and the screen rules of (tabs)/visits.tsx and visits/[id].tsx (what leaves the
 * calendar, the next visit, the selected-day line). Lifted, not changed; callers pass `now`.
 */

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
const keyInstant = (key: string) => new Date(`${key}T12:00:00Z`);

export const dayKeyOf = (at: Date | string) => localDateKey(at, TZ);
export const weekdayOf = (key: string) => WEEKDAY.format(keyInstant(key));
export const dayNumberOf = (key: string) => DAY_NUM.format(keyInstant(key));
export const monthShortOf = (key: string) => MONTH_SHORT.format(keyInstant(key));
export const monthTitleOf = (key: string) => MONTH_LONG.format(keyInstant(key));
export const longDayOf = (key: string) => DAY_LONG.format(keyInstant(key));
export const shortDayOf = (key: string) => DAY_SHORT.format(keyInstant(key));
/** "08:00", in the clinic's zone. Never "your turn" (law L8). */
export const clockOf = (iso: string) => CLOCK.format(new Date(iso));

/** Morning or afternoon, split at local noon (ADR 0084 §10). */
export function partOf(iso: string): "Morning" | "Afternoon" {
  return localSession(iso, TZ) === "morning" ? "Morning" : "Afternoon";
}

export function daysBetween(fromKey: string, toKey: string): number {
  return Math.round((keyInstant(toKey).getTime() - keyInstant(fromKey).getTime()) / 86_400_000);
}

export function addDays(key: string, n: number): string {
  return new Date(keyInstant(key).getTime() + n * 86_400_000).toISOString().slice(0, 10);
}

/** "in 6 days", "tomorrow", "today". */
export function inDays(n: number): string {
  if (n <= 0) return "today";
  if (n === 1) return "tomorrow";
  return `in ${n} days`;
}

/** "Today" / "Tomorrow" / "Thu 18 Sep" (the phone's lib/booking.ts `dayLabel`). */
export function dayLabel(key: string, now: Date): string {
  const today = dayKeyOf(now);
  if (key === today) return "Today";
  if (key === addDays(today, 1)) return "Tomorrow";
  return shortDayOf(key);
}

/** The first of the month `delta` months from the month holding `key`. */
export function shiftMonth(key: string, delta: number): string {
  const [y = 1970, m = 1] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + delta, 1)).toISOString().slice(0, 10);
}

/** A Monday-first month grid, `null` for the blanks, always whole weeks. */
export function monthGrid(key: string): (string | null)[] {
  const [y = 1970, m = 1] = key.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const cells: (string | null)[] = Array.from({ length: (first.getUTCDay() + 6) % 7 }, () => null);
  for (let d = 1; d <= days; d++)
    cells.push(`${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
  while (cells.length % 7) cells.push(null);
  return cells;
}

/**
 * Directions to the hospital's pin, coordinates only (W4: nothing about the patient rides in the URL).
 * Null when its admin has not set the pin: the page says so instead of guessing.
 */
export function directionsUrl(pin: { lat: number; lng: number } | null): string | null {
  return pin ? `https://www.google.com/maps/dir/?api=1&destination=${pin.lat}%2C${pin.lng}` : null;
}

/* ─── the visit rules ───────────────────────────────────────────── */

/** Statuses that no longer put a visit on the calendar ((tabs)/visits.tsx `GONE`). */
export const OFF_CALENDAR: ReadonlySet<string> = new Set([
  "cancelled",
  "declined",
  "no_show",
  "rescheduled",
]);
export const onCalendar = (status: string) => !OFF_CALENDAR.has(status);

/** `cancel-appointment` and `reschedule-appointment` both refuse a reason shorter than this. */
export const MIN_REASON_CHARS = 8;
export const reasonTooShort = (reason: string) => reason.trim().length < MIN_REASON_CHARS;

export interface VisitFacts {
  status: string;
  startsAtIso: string;
  type: string;
  /** The household member's label, or null for the patient's own visit. */
  forMember: string | null;
  sessionId: string | null;
  confirmedByPatientAtIso: string | null;
}

/** `ha-mark-arrived` takes it: the patient's own, confirmed, in person, on the clinic's today. */
export function canArrive(v: VisitFacts, now: Date): boolean {
  return (
    v.status === "confirmed" &&
    v.type !== "virtual" &&
    v.forMember === null &&
    dayKeyOf(v.startsAtIso) === dayKeyOf(now)
  );
}

/** The T-24h request is open: confirmed, unanswered, inside the last day. */
export function confirmationPending(v: VisitFacts, now: Date): boolean {
  const ms = new Date(v.startsAtIso).getTime() - now.getTime();
  return (
    v.status === "confirmed" && v.confirmedByPatientAtIso === null && ms > 0 && ms <= 86_400_000
  );
}

/** What One visit offers: a member's visit is logistics only; a place in a clinic day cannot move. */
export function visitControls(v: VisitFacts, now: Date) {
  const mine = v.forMember === null;
  const arrivable = mine && canArrive(v, now);
  return {
    mine,
    arrivable,
    confirmable: mine && !arrivable && confirmationPending(v, now),
    canMove: mine && RESCHEDULABLE.has(v.status) && v.sessionId === null,
    canCancel: mine && CANCELLABLE.has(v.status),
  };
}

/** The header pill's visit: the soonest upcoming one still on the calendar and not done. */
export function nextVisit<T extends { status: string; startsAtIso: string }>(
  upcoming: readonly T[],
): T | null {
  return (
    upcoming
      .filter((v) => onCalendar(v.status) && v.status !== "completed")
      .sort((a, b) => a.startsAtIso.localeCompare(b.startsAtIso))[0] ?? null
  );
}

/** "DR" for a name that cannot be split; initials only, never a photo. */
export function initialsOf(name: string): string {
  const words = name
    .replace(/^Dr\.?\s+/i, "")
    .split(/\s+/)
    .filter((w) => /^[A-Za-z]/.test(w));
  return (
    words
      .slice(0, 2)
      .map((w) => w.charAt(0).toUpperCase())
      .join("") || "DR"
  );
}
