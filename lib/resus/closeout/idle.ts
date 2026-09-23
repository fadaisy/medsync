import { IDLE_THRESHOLDS } from "@/lib/resus/reference/levels-of-care";

/**
 * Idle episodes (docs/clinical/resus-closeout-clinical-catalog.md §9, D14) —
 * PURE. Nothing auto-closes: ≥ 2 h flagged (CO-IDLE-01), ≥ 12 h notify
 * (CO-IDLE-02), ≥ 24 h administrative close enabled (CO-IDLE-03).
 */

export type IdleClass = "active" | "idle" | "notify" | "admin_close";

export interface IdleInfo {
  class: IdleClass;
  idleMs: number;
  /** The rule that set the class, or null when active. */
  ruleId: string | null;
  /** e.g. "No activity 2 d 16 h". */
  label: string;
}

const MIN_MS = 60_000;

/** "45 min" · "3 h 5 min" · "2 d 16 h" (floored; never negative). */
export function formatIdle(ms: number): string {
  const totalMin = Math.floor(Math.max(0, ms) / MIN_MS);
  const d = Math.floor(totalMin / 1440);
  const h = Math.floor((totalMin % 1440) / 60);
  const m = totalMin % 60;
  if (d > 0) return `${d} d ${h} h`;
  if (h > 0) return `${h} h ${m} min`;
  return `${m} min`;
}

export function idleClass(lastActivityAtMs: number, nowMs: number): IdleInfo {
  // Clock skew (activity "in the future") counts as no idle time.
  const idleMs = Math.max(0, nowMs - lastActivityAtMs);
  let hit: (typeof IDLE_THRESHOLDS)[number] | null = null;
  for (const t of IDLE_THRESHOLDS) if (idleMs >= t.minMs) hit = t;
  return {
    class: hit?.class ?? "active",
    idleMs,
    ruleId: hit?.ruleId ?? null,
    label: `No activity ${formatIdle(idleMs)}`,
  };
}
