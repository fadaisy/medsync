/**
 * The simulation host.
 *
 * The engine steps at a fixed one simulated second, decoupled from the render
 * loop. Whatever the acceleration, the host sends at most 30 snapshots per
 * second, so the bench never has more to draw than it can draw and the
 * simulation never waits for a frame.
 *
 * This module holds no reference to `self` and no worker plumbing, so the same
 * code runs inside a Web Worker (the normal build, via `sim.worker.ts`) or on
 * the main thread (the single-file preview build, where a page may not be
 * allowed to spawn a worker at all). The only difference is which thread the
 * loop runs on; at 1440 times real time the engine costs under 2 ms of
 * processor time per wall-clock second either way.
 */

import { defaultEnvelope, type Envelope } from "../engine/params.ts";
import { runScenario, scenarioById, type Scenario, type ScenarioId, type ScenarioResult } from "../engine/scenarios.ts";
import { ScoreboardAccumulator } from "../engine/scoreboard.ts";
import { SimEngine } from "../engine/sim.ts";
import type { AuditEntry } from "../engine/sim.ts";
import { AUTONOMY, type ArbitrationState, type LogEntry } from "../engine/types.ts";
import type { FromWorker, ScenarioOutcome, Snapshot, ToWorker } from "./protocol.ts";
import { SampleStream } from "./sampleStream.ts";

const SNAPSHOT_INTERVAL_MS = 1000 / 30;
/** Wall-clock milliseconds of engine work allowed per tick. */
const WORK_BUDGET_MS = 12;
/** Simulated seconds advanced per chunk of a fast-forward. */
const FAST_FORWARD_CHUNK_S = 6 * 3600;

let engine = new SimEngine({ seed: 20260101 });
const stream = new SampleStream();
let wholeRun = new ScoreboardAccumulator();
let running = false;
let speed = 1;
let loopHandle: ReturnType<typeof setTimeout> | null = null;

let lastTickMs = 0;
let lastSnapshotMs = 0;
let logSent = 0;
let auditSent = 0;
let stepBudgetUs = 0;
let achievedRate = 0;
/** Simulated seconds still owed from the last tick, kept as a fraction. */
let carry = 0;
let rateSteps = 0;
let rateWallS = 0;

/** Where snapshots go. Set by whichever shell is hosting this module. */
let post: (message: FromWorker) => void = () => {};

export function setPost(fn: (message: FromWorker) => void): void {
  post = fn;
}

function now(): number {
  return performance.now();
}

function rebuild(seed: number, envelope?: Partial<Envelope>): void {
  stream.clear();
  wholeRun = new ScoreboardAccumulator();
  engine = new SimEngine({
    seed,
    envelope: { ...defaultEnvelope(), ...envelope },
    maxSamples: 8,
    maxLog: 4000,
    onSample: (sample) => {
      stream.add(sample);
      wholeRun.add(sample);
    },
  });
  logSent = 0;
  auditSent = 0;
  carry = 0;
  sendSnapshot(true);
}

function sendSnapshot(force = false): void {
  const t = now();
  if (!force && t - lastSnapshotMs < SNAPSHOT_INTERVAL_MS) return;
  lastSnapshotMs = t;

  const drained = stream.drain();
  const newLog: LogEntry[] = engine.log.slice(logSent);
  logSent = engine.log.length;
  const newAudit: AuditEntry[] = engine.audit.slice(auditSent);
  auditSent = engine.audit.length;

  const snapshot: Snapshot = {
    // postMessage structured-clones synchronously, and SimState is plain
    // data, so it can be handed over as it stands. No copy needed.
    state: engine.state,
    newSamples: drained.minutes,
    newHours: drained.hours,
    newLog,
    newAudit,
    wholeRun: wholeRun.result(engine.state.alertCount),
    stepBudgetUs,
    achievedRate,
    running,
    speed,
  };
  post({ type: "snapshot", snapshot });
}

/**
 * Advance the engine by n simulated seconds, accumulating the cost.
 *
 * The cost per simulated second is only meaningful over a decent batch: at 1x
 * the loop advances one step at a time, and timing one step measures the
 * clock, not the engine. So the figure is accumulated over at least
 * BUDGET_SAMPLE_STEPS steps before it is published, and it is seeded at
 * start-up by a calibration run rather than starting at zero.
 */
const BUDGET_MIN_BATCH = 500;

function advance(seconds: number): void {
  if (seconds <= 0) return;
  if (seconds < BUDGET_MIN_BATCH) {
    // Too few steps to time honestly. Reading the clock twice around five
    // steps measures the clock, so this batch is run untimed and the figure
    // on screen stays the one from the last batch big enough to mean
    // something.
    engine.run(seconds);
    return;
  }
  const started = now();
  engine.run(seconds);
  stepBudgetUs = ((now() - started) * 1000) / seconds;
}

/**
 * Measure the engine's cost per simulated second on a throwaway device, so
 * the bench has an honest figure to show from the first frame.
 */
function calibrateBudget(): void {
  const scratch = new SimEngine({ seed: 1, maxSamples: 4, maxLog: 4 });
  const steps = 20_000;
  const started = now();
  scratch.run(steps);
  stepBudgetUs = ((now() - started) * 1000) / steps;
}

function tick(): void {
  loopHandle = null;
  if (!running) return;

  const t = now();
  const wallElapsedS = Math.min((t - lastTickMs) / 1000, 0.25);
  lastTickMs = t;

  const wanted = wallElapsedS * speed + carry;
  let toAdvance = Math.floor(wanted);
  carry = wanted - toAdvance;

  // Never block the worker for longer than the budget, even if the machine
  // cannot keep up with the requested acceleration.
  if (stepBudgetUs > 0) {
    const affordable = Math.floor((WORK_BUDGET_MS * 1000) / stepBudgetUs);
    if (toAdvance > affordable) {
      toAdvance = affordable;
      carry = 0;
    }
  }

  advance(toAdvance);

  // Achieved rate over about a second of wall clock, not over one tick. At
  // 1x a single tick advances zero or one second, so a per-tick rate would
  // read zero most of the time and be honest about nothing.
  rateSteps += toAdvance;
  rateWallS += wallElapsedS;
  if (rateWallS >= 1) {
    achievedRate = rateSteps / rateWallS;
    rateSteps = 0;
    rateWallS = 0;
  }
  sendSnapshot();
  schedule();
}

function schedule(): void {
  if (loopHandle !== null || !running) return;
  loopHandle = setTimeout(tick, 8);
}

/**
 * Fast-forward without freezing the bench: advance in chunks, reporting
 * progress between them so the user can see a 365 day run happening.
 */
function fastForward(days: number): void {
  const total = days * 86_400;
  let done = 0;
  running = false;

  const chunk = (): void => {
    const started = now();
    while (done < total && now() - started < 40) {
      const size = Math.min(FAST_FORWARD_CHUNK_S, total - done);
      advance(size);
      done += size;
    }
    post({ type: "progress", label: `Running ${days} days`, fraction: done / total });
    sendSnapshot(true);
    if (done < total) {
      setTimeout(chunk, 0);
      return;
    }
    // Report the scoreboard, which is what the button is for.
    const board = wholeRun.result(engine.state.alertCount);
    engine.note(
      "device",
      "RUN",
      `Ran ${days} days. Time in range ${board.timeInRangePct.toFixed(1)} percent, ` +
        `below 3.9 ${board.timeBelow39Pct.toFixed(2)} percent, ` +
        `fused difference against plasma ${board.mardPct.toFixed(2)} percent, ` +
        `${board.alerts} alerts, ` +
        `${board.minutesReducedAutonomy.toLocaleString("en-GB")} min at reduced autonomy, ` +
        `${board.minutesSuspended.toLocaleString("en-GB")} min suspended, ` +
        `${board.totalInsulinU.toFixed(1)} U of insulin. ` +
        `Tip A capsule ${engine.state.tipA.capsuleMicron.toFixed(0)} um, ` +
        `photobleaching ${((1 - Math.exp(-engine.state.tipA.flashes / 700_000)) * 100).toFixed(1)} percent, ` +
        `enzyme ${(engine.state.enzymeActivity * 100).toFixed(1)} percent.`,
    );
    sendSnapshot(true);
    post({ type: "progress", label: `Running ${days} days`, fraction: 1 });
  };
  chunk();
}

/** Handle one message from the bench. */
export function handle(data: ToWorker): void {
  switch (data.type) {
    case "init":
      calibrateBudget();
      rebuild(data.seed, data.envelope);
      post({ type: "ready" });
      break;
    case "play":
      running = true;
      lastTickMs = now();
      schedule();
      break;
    case "pause":
      running = false;
      sendSnapshot(true);
      break;
    case "speed":
      speed = data.multiplier;
      lastTickMs = now();
      carry = 0;
      sendSnapshot(true);
      break;
    case "stepMinutes":
      advance(data.minutes * 60);
      sendSnapshot(true);
      break;
    case "event":
      engine.apply(data.event);
      sendSnapshot(true);
      break;
    case "runDays":
      fastForward(data.days);
      break;
    case "reset":
      running = false;
      rebuild(data.seed);
      break;
    case "scenario": {
      running = false;
      loadScenario(scenarioById(data.id as ScenarioId));
      break;
    }
    case "compare": {
      // Both runs happen headlessly, on the same code the command line runner
      // and the test suite use, so the two scoreboards on screen are the same
      // numbers the tests assert on.
      const outcomes = [data.a, data.b].map((id) => {
        const scenario = scenarioById(id);
        return outcomeOf(scenario, runScenario(scenario));
      });
      post({ type: "comparison", outcomes });
      break;
    }
  }

}

/**
 * Replay a scenario into the live engine, so the bench ends up holding the
 * same device the headless runner would have produced for that seed.
 */
function outcomeOf(scenario: Scenario, result: ScenarioResult): ScenarioOutcome {
  const check = scenario.check(result);
  return {
    id: scenario.id,
    number: scenario.number,
    title: scenario.title,
    teaches: scenario.teaches,
    expectation: scenario.expectation,
    met: check.ok,
    detail: check.detail,
    board: result.board,
    statesVisited: result.statesVisited,
    lowestAutonomy: result.lowestAutonomy,
  };
}

function loadScenario(scenario: Scenario): void {
  stream.clear();
  wholeRun = new ScoreboardAccumulator();
  logSent = 0;
  auditSent = 0;
  carry = 0;

  const queue = [...scenario.events].sort((a, b) => a.atSeconds - b.atSeconds);
  let next = 0;
  const statesVisited: ArbitrationState[] = [];
  let lowestAutonomy: number = AUTONOMY.full;
  engine = new SimEngine({
    seed: scenario.seed,
    ...scenario.options,
    maxSamples: 8,
    maxLog: 4000,
    onSample: (sample) => {
      stream.add(sample);
      wholeRun.add(sample);
      if (!statesVisited.includes(sample.arbitration)) statesVisited.push(sample.arbitration);
      if (sample.autonomy < lowestAutonomy) lowestAutonomy = sample.autonomy;
    },
  });

  const total = scenario.durationS;
  let done = 0;
  const chunk = (): void => {
    const started = now();
    while (done < total && now() - started < 40) {
      const target = Math.min(done + 3600, total);
      while (done < target) {
        done += 1;
        while (next < queue.length && (queue[next]?.atSeconds ?? Infinity) <= done) {
          const item = queue[next];
          if (item) engine.apply(item.event);
          next += 1;
        }
        engine.step();
      }
    }
    post({
      type: "progress",
      label: `Scenario ${scenario.number}: ${scenario.title}`,
      fraction: done / total,
    });
    sendSnapshot(true);
    if (done < total) {
      setTimeout(chunk, 0);
    } else {
      post({
        type: "scenarioLoaded",
        outcome: outcomeOf(scenario, {
          state: engine.state,
          // The engine's own buffer holds only a handful of samples here,
          // because the stream is what keeps the history. Scenario 2's check
          // measures a rise across three hours, so it needs the stream's 24 h
          // of minutes, not the engine's last eight seconds.
          samples: stream.minutes,
          log: engine.log,
          board: wholeRun.result(engine.state.alertCount),
          statesVisited,
          lowestAutonomy,
          samplesProduced: engine.samplesProduced,
        }),
      });
    }
  };
  chunk();
}
