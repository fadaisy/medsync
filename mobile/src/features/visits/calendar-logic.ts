import { clockOf } from "@/features/visits/logic";

export { canShift, dayState, firstOpenDay, windowEnd } from "@patient-core/book-days";

/**
 * The booking calendar's rules, pure so they are tested without a screen.
 * Every key is a `YYYY-MM-DD` day in the clinic's zone (`dayKeyOf`); the
 * month grid itself is `monthGrid` in `logic.ts`.
 */

export type TimeGroup = "Morning" | "Afternoon" | "Evening";
export const TIME_GROUPS: readonly TimeGroup[] = ["Morning", "Afternoon", "Evening"];

/** The heading a slot's time sits under, by the clinic's clock: before 12, before 17, after. */
export function timeGroup(iso: string): TimeGroup {
  const hour = Number(clockOf(iso).slice(0, 2));
  return hour < 12 ? "Morning" : hour < 17 ? "Afternoon" : "Evening";
}

/** The month's cells in weeks of seven, the last week padded with blanks. */
export function weeksOf<T>(cells: readonly (T | null)[]): (T | null)[][] {
  const weeks: (T | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) {
    const week = cells.slice(i, i + 7);
    while (week.length < 7) week.push(null);
    weeks.push(week);
  }
  return weeks;
}
