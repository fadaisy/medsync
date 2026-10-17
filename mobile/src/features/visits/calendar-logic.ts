import { PATIENT_BOOKING_HORIZON_DAYS } from "@shared/booking-horizon";

import { addDays, clockOf, shiftMonth } from "@/features/visits/logic";

/**
 * The booking calendar's rules, pure so they are tested without a screen.
 * Every key is a `YYYY-MM-DD` day in the clinic's zone (`dayKeyOf`); the
 * month grid itself is `monthGrid` in `logic.ts`.
 */

/** The last day a patient may book: today plus the shared horizon (ADR 0344). */
export const windowEnd = (today: string) => addDays(today, PATIENT_BOOKING_HORIZON_DAYS);

/**
 * One day on the calendar: `out` before today or past the window (dimmed),
 * `open` when it has a time to take, `closed` when it has none. Days past the
 * server's own reach simply read `closed`: that is the truth on the phone.
 */
export function dayState(
  key: string,
  today: string,
  open: ReadonlySet<string>,
): "out" | "open" | "closed" {
  if (key < today || key > windowEnd(today)) return "out";
  return open.has(key) ? "open" : "closed";
}

/** The first open day in the window, or null when there is none. */
export function firstOpenDay(today: string, open: ReadonlySet<string>): string | null {
  return [...open].filter((k) => dayState(k, today, open) === "open").sort()[0] ?? null;
}

/** Whether the month `delta` away from `month` still touches today … the window's end. */
export function canShift(month: string, delta: -1 | 1, today: string): boolean {
  const next = shiftMonth(month, delta).slice(0, 7);
  return next >= today.slice(0, 7) && next <= windowEnd(today).slice(0, 7);
}

export type TimeGroup = "Morning" | "Afternoon" | "Evening";
export const TIME_GROUPS: readonly TimeGroup[] = ["Morning", "Afternoon", "Evening"];

/** The heading a slot's time sits under, by the clinic's clock: before 12, before 17, after. */
export function timeGroup(iso: string): TimeGroup {
  const hour = Number(clockOf(iso).slice(0, 2));
  return hour < 12 ? "Morning" : hour < 17 ? "Afternoon" : "Evening";
}
