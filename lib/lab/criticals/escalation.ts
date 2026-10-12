/**
 * Escalation (Lab Phase 1, §6.6, rules ES-1 to ES-5; ADR 0244). A pure planner; the executor that
 * writes its steps lives with the server actions and is called by the scheduler every minute, lazily on
 * every read of alerts, and by tests with a fixed clock (ES-3).
 *
 * Each level waits its own signed time from when the alert reached it: level 0 `ack_within_min`
 * (so dueAt = sentAt + acknowledge-within, ES-1), level 1 `level1_after_min`. Level 2 is the last: the
 * alert stays open there (ES-4) and `level2_after_min` only marks it overdue at the last level. With no
 * signed times there is no automatic escalation; "Could not reach anyone" still escalates by hand.
 */
import type { Level } from "@/lib/lab/criticals/alerts";
import type { LadderResult } from "@/lib/lab/criticals/recipients";

import { LAST_LEVEL } from "@/lib/lab/criticals/alerts";

export interface ResponseTimes {
  ackWithinMin: number;
  level1AfterMin: number | null;
  level2AfterMin: number | null;
}

/** ES-1: when an alert that reached `level` at `arrivedAt` falls due; null when nothing is signed. */
export function dueAtFor(level: Level, arrivedAt: Date, times: ResponseTimes | null): Date | null {
  if (!times) return null;
  const wait =
    level === 0 ? times.ackWithinMin : level === 1 ? times.level1AfterMin : times.level2AfterMin;
  return wait === null ? null : new Date(arrivedAt.getTime() + wait * 60_000);
}

export interface OpenAlert {
  id: string;
  hospitalId: string;
  level: Level;
  dueAt: Date | null;
}

export interface EscalationStep {
  alertId: string;
  fromLevel: Level;
  toLevel: Level;
  recipients: string[];
  skipped: LadderResult["skipped"];
  emptyLevels: Level[];
  dueAt: Date | null;
  reason: "due" | "could_not_reach";
}

function step(
  a: OpenAlert,
  now: Date,
  times: ResponseTimes | null,
  ladder: LadderResult,
  reason: EscalationStep["reason"],
): EscalationStep {
  return {
    alertId: a.id,
    fromLevel: a.level,
    toLevel: ladder.level,
    recipients: ladder.recipients,
    skipped: ladder.skipped,
    emptyLevels: ladder.emptyLevels,
    dueAt: dueAtFor(ladder.level, now, times),
    reason,
  };
}

/**
 * ES-2: the steps due at `now`. Idempotent: applying the steps moves each alert up and on to a new due
 * time after `now`, so planning again for the same `now` returns nothing.
 */
export function planEscalations(
  now: Date,
  alerts: readonly OpenAlert[],
  timesFor: (hospitalId: string) => ResponseTimes | null,
  ladderFrom: (alert: OpenAlert, from: Level) => LadderResult,
): EscalationStep[] {
  return alerts
    .filter((a) => a.level < LAST_LEVEL && a.dueAt !== null && a.dueAt <= now)
    .map((a) => step(a, now, timesFor(a.hospitalId), ladderFrom(a, (a.level + 1) as Level), "due"));
}

/** "Could not reach anyone": escalate now, signed times or not. Null at the last level. */
export function escalateByHand(
  a: OpenAlert,
  now: Date,
  times: ResponseTimes | null,
  ladderFrom: (alert: OpenAlert, from: Level) => LadderResult,
): EscalationStep | null {
  if (a.level >= LAST_LEVEL) return null;
  return step(a, now, times, ladderFrom(a, (a.level + 1) as Level), "could_not_reach");
}

/** The alert after a step (what the executor writes). */
export function applyStep(a: OpenAlert, s: EscalationStep): OpenAlert {
  return s.alertId === a.id && s.toLevel > a.level ? { ...a, level: s.toLevel, dueAt: s.dueAt } : a;
}

/** Open at the last level and past its time: listed as overdue for the lab and both sets of contacts (ES-4). */
export const overdueAtLastLevel = (a: OpenAlert, now: Date) =>
  a.level === LAST_LEVEL && a.dueAt !== null && a.dueAt <= now;

/** ES-5: the operational threshold (not a clinical number). */
export const HEARTBEAT_STALE_MS = 3 * 60_000;

/** ES-5: no run recorded, or the last one older than three minutes. */
export const heartbeatStale = (lastRanAt: Date | null, now: Date) =>
  !lastRanAt || now.getTime() - lastRanAt.getTime() > HEARTBEAT_STALE_MS;
