import type { Mood } from "@/components/tide/mood-face";
import type { LogRow } from "@/data/health-log";
import type { SaveResult } from "@/offline/outbox";

import { addLog, dayKey, lastDays, latestByDay, useHealthLog } from "@/data/health-log";

/**
 * How the patient has felt, one face a day: kind 'mood' in the patient's own
 * log, value 1 not well, 2 okay, 3 good (migration 0170, ADR 0342). Picking
 * again later the same day adds a row; the day's latest pick is its mood.
 * Only the patient can see it.
 */
export type DayMood = Exclude<Mood, "none">;

const VALUE: Record<DayMood, number> = { low: 1, okay: 2, good: 3 };

export function moodOf(row: LogRow): DayMood | null {
  return row.v1 === 1 ? "low" : row.v1 === 2 ? "okay" : row.v1 === 3 ? "good" : null;
}

/** Each day's mood (or "none"), for the given days in order. */
export function moodsFor(rows: LogRow[], days: Date[]): Mood[] {
  const byDay = latestByDay(rows, "mood");
  return days.map((d) => {
    const row = byDay.get(dayKey(d));
    return (row && moodOf(row)) ?? "none";
  });
}

/** The days of this month so far, the 1st first, today last. */
export function monthDays(now: Date): Date[] {
  return Array.from(
    { length: now.getDate() },
    (_, i) => new Date(now.getFullYear(), now.getMonth(), i + 1),
  );
}

/**
 * Share of good, okay and not-well days for each month of this year so far,
 * in percent; null for a month with nothing logged.
 */
export function yearMix(rows: LogRow[], now: Date): ([number, number, number] | null)[] {
  const counts = Array.from({ length: now.getMonth() + 1 }, () => ({ good: 0, okay: 0, low: 0 }));
  for (const [key, row] of latestByDay(rows, "mood")) {
    const [y, m] = key.split("-").map(Number);
    const mood = moodOf(row);
    if (y === now.getFullYear() && mood && counts[m - 1]) counts[m - 1][mood]++;
  }
  return counts.map((c) => {
    const n = c.good + c.okay + c.low;
    if (!n) return null;
    const pct = (x: number) => Math.round((x / n) * 100);
    return [pct(c.good), pct(c.okay), pct(c.low)];
  });
}

export const moodRepo = {
  pick(mood: DayMood): Promise<SaveResult> {
    return addLog({ kind: "mood", v1: VALUE[mood] });
  },
};

/** Today's pick, the last seven days and the month so far, with the log's loading state. */
export function useMood(now: Date): {
  today: DayMood | null;
  week: Mood[];
  month: Mood[];
  rows: LogRow[];
  loading: boolean;
  error: boolean;
  retry: () => void;
} {
  const log = useHealthLog();
  const month = moodsFor(log.rows, monthDays(now));
  const last = month[month.length - 1];
  return {
    ...log,
    today: last === "none" ? null : last,
    week: moodsFor(log.rows, lastDays(now)),
    month,
  };
}

export function countMoods(days: Mood[]): Record<DayMood, number> {
  const out: Record<DayMood, number> = { good: 0, okay: 0, low: 0 };
  for (const d of days) if (d !== "none") out[d]++;
  return out;
}
