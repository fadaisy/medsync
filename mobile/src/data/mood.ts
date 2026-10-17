import type { Mood } from "@/components/tide/mood-face";

import { createStore, useStore } from "@/data/store";
import { flag } from "@/lib/flags";
import { enqueue } from "@/offline/outbox";

/**
 * How the patient has felt, one face a day. Mood is clinical (law L2): demo
 * data on the phone until Gate CG, with today's pick kept in the outbox.
 */
export type DayMood = Exclude<Mood, "none">;

/** Fixture: the days of this month before today, oldest first. */
const MONTH_SO_FAR: DayMood[] = [
  "good",
  "good",
  "okay",
  "good",
  "low",
  "okay",
  "good",
  "good",
  "good",
  "okay",
  "good",
  "good",
  "okay",
  "good",
  "low",
  "good",
];

/** Fixture: share of good, okay and low days for each month of the year so far (percent). */
export const YEAR_MIX: [number, number, number][] = [
  [55, 30, 15],
  [60, 28, 12],
  [50, 35, 15],
  [58, 30, 12],
  [62, 26, 12],
  [48, 34, 18],
  [65, 25, 10],
  [60, 30, 10],
  [66, 24, 10],
  [65, 24, 11],
];

const store = createStore<{ today: DayMood | null }>({ today: null });

export const moodRepo = {
  demo: !flag("mobileClinicalData"),
  pick(mood: DayMood) {
    store.set({ today: mood });
    void enqueue("mood", { mood, at: new Date().toISOString() });
  },
};

/** The month so far, with today's pick (or nothing) as the last day. */
export function useMood(): { today: DayMood | null; month: Mood[] } {
  const s = useStore(store);
  return { today: s.today, month: [...MONTH_SO_FAR, s.today ?? "none"] };
}

export function countMoods(days: Mood[]): Record<DayMood, number> {
  const out: Record<DayMood, number> = { good: 0, okay: 0, low: 0 };
  for (const d of days) if (d !== "none") out[d]++;
  return out;
}
