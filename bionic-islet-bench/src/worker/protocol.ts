/**
 * Messages between the bench and the simulation worker.
 *
 * The engine runs in the worker at a fixed one second timestep, decoupled
 * from the render loop. The worker sends snapshots at up to 30 per second
 * whatever the acceleration, so the user interface never sees more than it
 * can draw and the simulation never waits for a frame.
 */

import type { AuditEntry } from "../engine/sim.ts";
import type { ScenarioId } from "../engine/scenarios.ts";
import type { ArbitrationState } from "../engine/types.ts";
import type { Envelope } from "../engine/params.ts";
import type { LogEntry, Sample, Scoreboard, SimEvent, SimState } from "../engine/types.ts";

/** One hour of samples, reduced to what a 90 day trace needs to draw. */
export type HourAggregate = {
  t: number;
  plasmaMin: number;
  plasmaMax: number;
  plasmaMean: number;
  peritonealMean: number;
  subcutaneousMean: number;
  fusedMean: number | null;
  fusedUncertaintyMean: number;
  insulinMean: number;
  /** Lowest autonomy seen in the hour, so a brief suspend is not averaged away. */
  autonomyMin: number;
};

export type Snapshot = {
  state: SimState;
  /** Minute samples produced since the previous snapshot. */
  newSamples: Sample[];
  /** Hour aggregates completed since the previous snapshot. */
  newHours: HourAggregate[];
  /** Log entries appended since the previous snapshot. */
  newLog: LogEntry[];
  /** Audit entries appended since the previous snapshot. */
  newAudit: AuditEntry[];
  /** Scoreboard over every sample the run has produced, not just the buffer. */
  wholeRun: Scoreboard;
  /** Wall-clock microseconds spent per simulated second, averaged. */
  stepBudgetUs: number;
  /** Simulated seconds per wall second actually achieved. */
  achievedRate: number;
  running: boolean;
  speed: number;
};

/** A scenario run, reduced to what the bench shows next to it. */
export type ScenarioOutcome = {
  id: ScenarioId;
  number: number;
  title: string;
  teaches: string;
  expectation: string;
  met: boolean;
  detail: string;
  board: Scoreboard;
  statesVisited: ArbitrationState[];
  lowestAutonomy: number;
};

export type ToWorker =
  | { type: "init"; seed: number; envelope?: Partial<Envelope> }
  | { type: "play" }
  | { type: "pause" }
  | { type: "speed"; multiplier: number }
  | { type: "stepMinutes"; minutes: number }
  | { type: "event"; event: SimEvent }
  | { type: "runDays"; days: number }
  | { type: "scenario"; id: ScenarioId }
  | { type: "reset"; seed: number }
  | { type: "compare"; a: ScenarioId; b: ScenarioId };

export type FromWorker =
  | { type: "snapshot"; snapshot: Snapshot }
  | { type: "progress"; label: string; fraction: number }
  | { type: "ready" }
  | { type: "scenarioLoaded"; outcome: ScenarioOutcome }
  | { type: "comparison"; outcomes: ScenarioOutcome[] };

export const SPEEDS = [1, 60, 600, 1440] as const;
export type Speed = (typeof SPEEDS)[number];
