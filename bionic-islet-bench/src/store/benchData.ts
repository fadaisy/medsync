/**
 * The trace buffers live outside React.
 *
 * At 1440 times real time the worker produces 24 samples a second, and the
 * canvas redraws every frame. Putting a year of samples through React state
 * would mean a new array identity 30 times a second for no benefit: the
 * canvas reads these buffers directly in its own animation frame, and only
 * the small numbers go through the store.
 */

import type { AuditEntry } from "../engine/sim.ts";
import type { LogEntry, Sample, Scoreboard, SimState } from "../engine/types.ts";
import type { HourAggregate } from "../worker/protocol.ts";
import { HOUR_CAPACITY, MINUTE_CAPACITY } from "../worker/sampleStream.ts";

/** Log entries kept for display and export. */
const LOG_CAPACITY = 2000;

export type BenchData = {
  state: SimState | null;
  /** Scoreboard over every sample the run produced, from the worker. */
  wholeRun: Scoreboard | null;
  minutes: Sample[];
  hours: HourAggregate[];
  log: LogEntry[];
  audit: AuditEntry[];
  stepBudgetUs: number;
  achievedRate: number;
  /** Increments on every snapshot, so the canvas can skip an idle redraw. */
  revision: number;
};

export const benchData: BenchData = {
  state: null,
  wholeRun: null,
  minutes: [],
  hours: [],
  log: [],
  audit: [],
  stepBudgetUs: 0,
  achievedRate: 0,
  revision: 0,
};

export function resetBenchData(): void {
  benchData.state = null;
  benchData.wholeRun = null;
  benchData.minutes = [];
  benchData.hours = [];
  benchData.log = [];
  benchData.audit = [];
  benchData.stepBudgetUs = 0;
  benchData.achievedRate = 0;
  benchData.revision += 1;
}

export function applySnapshot(snapshot: {
  state: SimState;
  wholeRun: Scoreboard;
  newSamples: Sample[];
  newHours: HourAggregate[];
  newLog: LogEntry[];
  newAudit: AuditEntry[];
  stepBudgetUs: number;
  achievedRate: number;
}): void {
  benchData.state = snapshot.state;
  benchData.wholeRun = snapshot.wholeRun;
  benchData.stepBudgetUs = snapshot.stepBudgetUs;
  benchData.achievedRate = snapshot.achievedRate;

  if (snapshot.newSamples.length > 0) {
    // A fast-forward can deliver more than the buffer holds in one message,
    // so take the tail rather than pushing and shifting a million times.
    if (snapshot.newSamples.length >= MINUTE_CAPACITY) {
      benchData.minutes = snapshot.newSamples.slice(-MINUTE_CAPACITY);
    } else {
      benchData.minutes.push(...snapshot.newSamples);
      if (benchData.minutes.length > MINUTE_CAPACITY) {
        benchData.minutes.splice(0, benchData.minutes.length - MINUTE_CAPACITY);
      }
    }
  }

  if (snapshot.newHours.length > 0) {
    if (snapshot.newHours.length >= HOUR_CAPACITY) {
      benchData.hours = snapshot.newHours.slice(-HOUR_CAPACITY);
    } else {
      benchData.hours.push(...snapshot.newHours);
      if (benchData.hours.length > HOUR_CAPACITY) {
        benchData.hours.splice(0, benchData.hours.length - HOUR_CAPACITY);
      }
    }
  }

  if (snapshot.newLog.length > 0) {
    benchData.log.push(...snapshot.newLog);
    if (benchData.log.length > LOG_CAPACITY) {
      benchData.log.splice(0, benchData.log.length - LOG_CAPACITY);
    }
  }
  if (snapshot.newAudit.length > 0) benchData.audit.push(...snapshot.newAudit);

  benchData.revision += 1;
}
