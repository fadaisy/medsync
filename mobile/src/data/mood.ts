import type { Mood } from "@/components/tide/mood-face";
import type { LogRow } from "@/data/health-log";
import type { SaveResult } from "@/offline/outbox";
import type { DayMood } from "@patient-core/log";
import { monthDays, moodsFor } from "@patient-core/log";

import { addLog, lastDays, useHealthLog } from "@/data/health-log";

export type { DayMood } from "@patient-core/log";
export { countMoods, monthDays, moodOf, moodsFor, yearMix } from "@patient-core/log";

const VALUE: Record<DayMood, number> = { low: 1, okay: 2, good: 3 };

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
