import type { LogRow } from "@/data/health-log";
import type { SaveResult } from "@/offline/outbox";

import { addLog, dayKey, lastDays, latestByDay, useHealthLog } from "@/data/health-log";

/**
 * Move and eat, from the patient's own log (migration 0170, ADR 0342):
 * - water    → kind 'water', unit 'glasses'. Each tap writes the day's NEW
 *              total as a row, so the latest row of a day is that day's
 *              count. Append-only (a tap down is a smaller total, never a
 *              delete), so it queues offline like any other save, and the
 *              web shows "5 glasses" for it.
 * - activity → kind 'activity', unit 'min': one row per walk the patient
 *              logs, summed per day.
 * The phone has no step counter and no meal log, so neither is shown.
 */
export const ACTIVITY_NOTE = "Only you can see what you log here.";

/** Illustration colours for the plate guide and the water glasses: art, not UI. */
export const PLATE_ART = {
  plate: "#ffffff",
  rim: "#dde1e9",
  greens: "#a7f3e4",
  starch: "#7dd3fc",
  protein: "#c7d2fe",
  leaf: "#2f855a",
  leafVein: "#c6f6d5",
  matooke: "#c9d77a",
  matookeEdge: "#7c8a2e",
  bean: "#8b4a3c",
  water: "#7dd3fc",
  waterEdge: "#0284c7",
} as const;

/**
 * A common adult goal (150 minutes of brisk walking a week), not one set
 * for this patient: the screen says so and points them to their team.
 */
export const WEEK_GOAL = 150;
export const DAY_GOAL = 30;

/** Walk lengths the patient can log in one tap. */
export const WALK_MINUTES = [10, 20, 30] as const;

export const SAFETY_SIGNS = [
  { icon: "heart", text: "Chest pain or tightness" },
  { icon: "wind", text: "Very short of breath" },
  { icon: "dizzy", text: "Dizzy or about to faint" },
  { icon: "droplet", text: "Shaky, sweaty or confused" },
] as const;

export const SAFETY_STEPS = [
  "1. Stop and sit down.",
  "2. Shaky, sweaty or confused? Eat or drink something sweet now.",
  "3. Chest pain or it is not getting better? Get help.",
];

export const GLASSES = 8;

/** Tap a full glass and the water empties down to it; tap an empty one and it fills up to it. */
export function tapGlass(water: number, index: number): number {
  return index < water ? index : index + 1;
}

/** Glasses today: the latest water row of today, or none. */
export function waterOn(rows: LogRow[], day: Date): number {
  return latestByDay(rows, "water").get(dayKey(day))?.v1 ?? 0;
}

/** Minutes walked on each of the given days. */
export function minutesOn(rows: LogRow[], days: Date[]): number[] {
  const sums = new Map<string, number>();
  for (const r of rows)
    if (r.kind === "activity" && r.v1 !== null) {
      const k = dayKey(new Date(r.recordedAt));
      sums.set(k, (sums.get(k) ?? 0) + r.v1);
    }
  return days.map((d) => sums.get(dayKey(d)) ?? 0);
}

export const activityRepo = {
  /** Writes the day's new total after the tap. */
  tapGlass(current: number, index: number): Promise<SaveResult> {
    return addLog({ kind: "water", v1: tapGlass(current, index), unit: "glasses" });
  },
  logWalk(minutes: number): Promise<SaveResult> {
    return addLog({ kind: "activity", v1: minutes, unit: "min" });
  },
};

/** Water today, minutes today and the last seven days of minutes (oldest first). */
export function useActivity(now: Date) {
  const log = useHealthLog();
  const days = lastDays(now);
  const weekMinutes = minutesOn(log.rows, days);
  return {
    loading: log.loading,
    error: log.error,
    retry: log.retry,
    days,
    water: waterOn(log.rows, now),
    weekMinutes,
    minutesToday: weekMinutes[weekMinutes.length - 1],
  };
}
