/**
 * The nine built-in scenarios. Each one is a demonstration on the bench and,
 * through `check`, an assertion in the test suite. The two must not drift
 * apart, which is why they are the same object.
 */

import type { EngineOptions } from "./sim.ts";
import type {
  ArbitrationState,
  LogEntry,
  Sample,
  ScheduledEvent,
  Scoreboard,
  SimState,
} from "./types.ts";

import { ScoreboardAccumulator } from "./scoreboard.ts";
import { SimEngine } from "./sim.ts";
import { AUTONOMY } from "./types.ts";

const HOUR = 3600;
const DAY = 86_400;

/** Seconds from implant for a given day and clock time. */
export function at(day: number, hour: number, minute = 0): number {
  return day * DAY + hour * HOUR + minute * 60;
}

export type ScenarioId =
  | "ordinary-day"
  | "unannounced-meal"
  | "paracetamol"
  | "paracetamol-fouled"
  | "six-months"
  | "omental-wrap"
  | "lead-b-fracture"
  | "phone-lost"
  | "no-collar";

export type ScenarioResult = {
  state: SimState;
  samples: readonly Sample[];
  log: readonly LogEntry[];
  board: Scoreboard;
  /** Arbitration states visited, in order of first appearance. */
  statesVisited: ArbitrationState[];
  /** Lowest autonomy level reached. */
  lowestAutonomy: number;
  /** Total samples the run produced, which may exceed what the buffer holds. */
  samplesProduced: number;
};

export type ScenarioCheck = { ok: boolean; detail: string };

export type Scenario = {
  id: ScenarioId;
  number: number;
  title: string;
  /** What the scenario is arguing, in one sentence. */
  teaches: string;
  seed: number;
  durationS: number;
  options?: Partial<EngineOptions>;
  events: ScheduledEvent[];
  /** What the bench claims will happen, shown next to the run. */
  expectation: string;
  check: (result: ScenarioResult) => ScenarioCheck;
};

/** Meals and sleep for one ordinary day. */
function ordinaryDay(day: number): ScheduledEvent[] {
  return [
    { atSeconds: at(day, 7, 0), event: { kind: "sleep-stop" } },
    { atSeconds: at(day, 7, 30), event: { kind: "meal", grams: 45, announced: true } },
    { atSeconds: at(day, 12, 30), event: { kind: "meal", grams: 60, announced: true } },
    { atSeconds: at(day, 19, 0), event: { kind: "meal", grams: 75, announced: true } },
    { atSeconds: at(day, 23, 0), event: { kind: "sleep-start" } },
  ];
}

/** Meals and sleep repeated for a whole run. */
export function ordinaryDays(days: number): ScheduledEvent[] {
  const events: ScheduledEvent[] = [{ atSeconds: 1, event: { kind: "sleep-start" } }];
  for (let d = 0; d < days; d += 1) events.push(...ordinaryDay(d));
  return events.filter((e) => e.atSeconds < days * DAY);
}

/**
 * The first time a trace crosses an absolute level, in seconds, interpolated
 * between the two straddling samples.
 */
export function crossingSeconds(
  samples: readonly Sample[],
  pick: (s: Sample) => number,
  level: number,
  fromS: number,
  toS: number,
): number | null {
  const window = samples.filter((s) => s.t >= fromS && s.t <= toS);
  for (let i = 1; i < window.length; i += 1) {
    const previous = window[i - 1];
    const current = window[i];
    if (!previous || !current) continue;
    const a = pick(previous);
    const b = pick(current);
    if (a < level && b >= level) {
      const fraction = (level - a) / (b - a);
      return previous.t + fraction * (current.t - previous.t);
    }
  }
  return null;
}

/**
 * How far the subcutaneous comparator trails the peritoneal trace on the same
 * rise, in minutes.
 *
 * Both traces are timed against one common level, the half height of the
 * plasma excursion. Timing each trace against its own peak would be unfair:
 * the subcutaneous trace is more attenuated, so its own half height is lower
 * and it would appear to cross earlier than it really does.
 */
export function siteAdvantageMinutes(
  samples: readonly Sample[],
  fromS: number,
  toS: number,
): number | null {
  const window = samples.filter((s) => s.t >= fromS && s.t <= toS);
  const first = window[0];
  if (!first || window.length < 3) return null;
  const baseline = first.plasma;
  let peak = baseline;
  for (const s of window) peak = Math.max(peak, s.plasma);
  if (peak - baseline < 1) return null;
  const level = baseline + (peak - baseline) / 2;
  const peritoneal = crossingSeconds(samples, (s) => s.peritoneal, level, fromS, toS);
  const subcutaneous = crossingSeconds(samples, (s) => s.subcutaneous, level, fromS, toS);
  if (peritoneal === null || subcutaneous === null) return null;
  return (subcutaneous - peritoneal) / 60;
}

export const SCENARIOS: readonly Scenario[] = [
  {
    id: "ordinary-day",
    number: 1,
    title: "Ordinary day",
    teaches: "With two healthy tips in agreement, the loop stays closed and nothing needs a human.",
    seed: 20260101,
    durationS: DAY,
    events: [{ atSeconds: 1, event: { kind: "sleep-start" } }, ...ordinaryDay(0)],
    expectation: "Time in range above 80 percent and no alerts.",
    check: (r) => {
      const ok = r.board.timeInRangePct > 80 && r.state.alertCount === 0;
      return {
        ok,
        detail: `time in range ${r.board.timeInRangePct.toFixed(1)} percent (needs above 80), alerts ${r.state.alertCount} (needs 0)`,
      };
    },
  },
  {
    id: "unannounced-meal",
    number: 2,
    title: "Unannounced meal",
    teaches:
      "The peritoneal site sees a rise about eleven minutes before the subcutaneous site does.",
    seed: 20260102,
    durationS: 8 * HOUR,
    events: [{ atSeconds: at(0, 2, 0), event: { kind: "meal", grams: 60, announced: false } }],
    expectation:
      "The peritoneal trace leads the subcutaneous ghost by 9 to 14 min at the 50 percent rise point.",
    check: (r) => {
      const leadMin = siteAdvantageMinutes(r.samples, at(0, 2, 0), at(0, 5, 0));
      if (leadMin === null) return { ok: false, detail: "no measurable rise in one of the traces" };
      return {
        ok: leadMin >= 9 && leadMin <= 14,
        detail: `peritoneal leads subcutaneous by ${leadMin.toFixed(1)} min at the half height of the plasma excursion (needs 9 to 14)`,
      };
    },
  },
  {
    id: "paracetamol",
    number: 3,
    title: "Paracetamol at 14:00",
    teaches:
      "When the tips disagree and no evidence blames either, the system does not guess. It falls back.",
    seed: 20260103,
    durationS: DAY,
    events: [
      { atSeconds: 1, event: { kind: "sleep-start" } },
      ...ordinaryDay(0),
      { atSeconds: at(0, 14, 0), event: { kind: "paracetamol", grams: 4 } },
    ],
    expectation:
      "Tips disagree with no health evidence, so the supervisor goes to invalid and safe basal.",
    check: (r) => {
      const wentInvalid = r.statesVisited.includes("invalid");
      const neverBoostedAutonomy = r.lowestAutonomy <= AUTONOMY.safeBasal;
      return {
        ok: wentInvalid && neverBoostedAutonomy,
        detail: `states visited ${r.statesVisited.join(", ")}; lowest autonomy ${r.lowestAutonomy} (needs invalid reached and autonomy down to safe basal or lower)`,
      };
    },
  },
  {
    id: "paracetamol-fouled",
    number: 4,
    title: "Paracetamol with a fouled tip B",
    teaches:
      "The same interferent, but now the impedance accuses tip B, so tip A carries on at reduced autonomy.",
    seed: 20260104,
    durationS: DAY,
    events: [
      { atSeconds: 1, event: { kind: "sleep-start" } },
      ...ordinaryDay(0),
      { atSeconds: at(0, 12, 0), event: { kind: "protein-deposition" } },
      { atSeconds: at(0, 14, 0), event: { kind: "paracetamol", grams: 4 } },
    ],
    expectation:
      "Impedance and fouling flag tip B, so the supervisor keeps tip A at basal modulation only, never invalid.",
    check: (r) => {
      const doubtful = r.statesVisited.includes("doubtful-one");
      const neverInvalid = !r.statesVisited.includes("invalid");
      return {
        ok: doubtful && neverInvalid,
        detail: `states visited ${r.statesVisited.join(", ")} (needs doubtful-one present and invalid absent)`,
      };
    },
  },
  {
    id: "six-months",
    number: 5,
    title: "Six months in",
    teaches:
      "Ageing shows up as lag, wider bands and more calibration, long before anything fails.",
    seed: 20260105,
    durationS: 181 * DAY,
    events: ordinaryDays(181),
    expectation:
      "Capsule well established, a tenth of the dye gone, most of the enzyme gone, and the loop still working.",
    check: (r) => {
      const capsule = r.state.tipA.capsuleMicron;
      const bleachPct = r.state.bleachFraction * 100;
      const enzymePct = r.state.enzymeActivity * 100;
      const inRange = r.board.timeInRangePct;
      // The bands are what the physics produces, and they are a long way from
      // what the placeholder front end produced: it bleached 31 per cent of
      // the dye by six months against a tenth here, and left 64 per cent of
      // the enzyme against a quarter. Both differences are recorded in
      // DECISIONS.md.
      //
      // The last clause is the one that matters, and the placeholder could not
      // have made it: three quarters of the enzyme is gone and the loop is
      // still in range, because the response is limited by the outer membrane
      // and not by the enzyme. Ageing arrives as a knee rather than a fade,
      // and nothing here says so except the physics.
      const ok =
        capsule > 40 &&
        capsule < 90 &&
        bleachPct > 5 &&
        bleachPct < 20 &&
        enzymePct > 15 &&
        enzymePct < 40 &&
        inRange > 80;
      return {
        ok,
        detail: `capsule ${capsule.toFixed(0)} um (40 to 90), photobleaching ${bleachPct.toFixed(0)} percent (5 to 20), enzyme ${enzymePct.toFixed(0)} percent (15 to 40), still ${inRange.toFixed(1)} percent in range (needs above 80)`,
      };
    },
  },
  {
    id: "omental-wrap",
    number: 6,
    title: "Omental wrapping of tip A",
    teaches:
      "The omentum costs the wrapped tip its response time, and the supervisor never notices, because that tip had time to spare.",
    seed: 20260106,
    durationS: 8 * HOUR,
    events: [
      // A meal before the wrap and one after it, so the same measurement can
      // be taken twice on the same tip.
      { atSeconds: at(0, 1, 0), event: { kind: "meal", grams: 70, announced: false } },
      { atSeconds: at(0, 3, 0), event: { kind: "omental-wrap", tip: "A" } },
      { atSeconds: at(0, 4, 0), event: { kind: "meal", grams: 70, announced: false } },
      { atSeconds: at(0, 6, 0), event: { kind: "flush" } },
    ],
    expectation:
      "Tip A falls further behind the fluid after the wrap, the two tips still agree, and nothing is raised.",
    check: (r) => {
      // How far tip A trails the peritoneal fluid at the half height of each
      // meal excursion. The wrap adds eighty five micrometres of tissue in
      // front of a probe that already has a two hundred micrometre gel, so it
      // should show up here and nowhere else.
      //
      // Each trace is timed against **its own** half height, not a common
      // level. Scenario 2 does the opposite, and deliberately: there the
      // question is how much the subcutaneous site attenuates, and a common
      // level is the only fair way to ask it. Here the question is purely one
      // of timing between two traces that sit at different levels, because the
      // reading carries a calibration gain and the fluid does not, so a common
      // level would measure the offset rather than the delay.
      const halfHeightCrossing = (
        pick: (s: Sample) => number,
        fromS: number,
        toS: number,
      ): number | null => {
        const window = r.samples.filter((s) => s.t >= fromS && s.t <= toS);
        const first = window[0];
        if (!first || window.length < 3) return null;
        const baseline = pick(first);
        let peak = baseline;
        for (const s of window) peak = Math.max(peak, pick(s));
        if (peak - baseline < 1) return null;
        return crossingSeconds(r.samples, pick, baseline + (peak - baseline) / 2, fromS, toS);
      };
      const lag = (fromS: number, toS: number): number | null => {
        const fluid = halfHeightCrossing((s) => s.peritoneal, fromS, toS);
        const tip = halfHeightCrossing((s) => s.glucoseA ?? 0, fromS, toS);
        if (fluid === null || tip === null) return null;
        return (tip - fluid) / 60;
      };
      const before = lag(at(0, 1, 0), at(0, 2, 30));
      const after = lag(at(0, 4, 0), at(0, 5, 30));
      if (before === null || after === null) {
        return { ok: false, detail: "no measurable rise in one of the two meals" };
      }
      const stayedValid = !r.statesVisited.includes("invalid");
      // The wrap must cost real time, and the two tips must still agree. The
      // second half of that is the point: an eighty five micrometre wrap on
      // the *faster* of the two tips brings them closer together, not further
      // apart, so the supervisor has nothing to see.
      //
      // The placeholder front end caught this wrap by dimming the optical
      // return. That mechanism is gone, because the fibre and the gel sit
      // inside the housing and the collected light never crosses the tissue.
      // The bench no longer demonstrates the optical loss evidence path at
      // all; DECISIONS.md says so rather than pretending otherwise.
      const ok = after > before + 0.5 && stayedValid;
      return {
        ok,
        detail: `tip A trails the fluid by ${before.toFixed(1)} min before the wrap and ${after.toFixed(1)} min after it (needs at least half a minute more); states visited ${r.statesVisited.join(", ")}`,
      };
    },
  },
  {
    id: "lead-b-fracture",
    number: 7,
    title: "Lead B fracture",
    teaches: "Losing a channel costs autonomy, not safety. A tip exchange gets it back.",
    seed: 20260107,
    durationS: 8 * HOUR,
    events: [
      { atSeconds: at(0, 2, 0), event: { kind: "lead-b-fracture" } },
      { atSeconds: at(0, 5, 0), event: { kind: "tip-exchange", tip: "B" } },
    ],
    expectation:
      "Single-sensor operation with an alert, then full closed loop again within 20 min of the exchange.",
    check: (r) => {
      const doubtful = r.statesVisited.includes("doubtful-one");
      const recovered = r.state.arbitration === "valid" && r.state.autonomy === AUTONOMY.full;
      return {
        ok: doubtful && recovered && r.state.alertCount > 0,
        detail: `states visited ${r.statesVisited.join(", ")}; ended ${r.state.arbitration} at autonomy ${r.state.autonomy}; alerts ${r.state.alertCount}`,
      };
    },
  },
  {
    id: "phone-lost",
    number: 8,
    title: "Phone lost for six hours",
    teaches:
      "Nothing outside the body can command a dose, so losing the phone changes nothing inside it.",
    seed: 20260108,
    durationS: 10 * HOUR,
    events: [
      { atSeconds: at(0, 1, 0), event: { kind: "meal", grams: 60, announced: true } },
      { atSeconds: at(0, 2, 0), event: { kind: "phone-lost" } },
      { atSeconds: at(0, 8, 0), event: { kind: "phone-found" } },
    ],
    expectation:
      "MedSync raises silence detection. The insulin trace is bit-identical to the same run with the phone present.",
    check: (r) => {
      const silence = r.log.some((entry) => entry.code === "SLNT");
      return {
        ok: silence && r.state.alertCount > 0,
        detail: `silence detection ${silence ? "fired" : "did not fire"}; the identical-trace half of this check is asserted against a control run in the test suite`,
      };
    },
  },
  {
    id: "no-collar",
    number: 9,
    title: "Steroid collar removed",
    teaches:
      "The same year without the dexamethasone collar: a thicker capsule, more lag, a worse scoreboard.",
    seed: 20260109,
    durationS: 365 * DAY,
    options: { steroidEffectScale: 0 },
    events: ordinaryDays(365),
    expectation:
      "Capsule on tip A ends thicker than the same run with the collar, and the sensing lag is longer.",
    check: (r) => {
      const capsule = r.state.tipA.capsuleMicron;
      return {
        ok: capsule > 125,
        detail: `tip A capsule ${capsule.toFixed(0)} um at day 365 (needs above 125, against about 113 um with the collar)`,
      };
    },
  },
];

export function scenarioById(id: ScenarioId): Scenario {
  const found = SCENARIOS.find((s) => s.id === id);
  if (!found) throw new Error(`unknown scenario ${id}`);
  return found;
}

/** Run a scenario headlessly and return everything the checks need. */
export function runScenario(
  scenario: Scenario,
  overrides?: Partial<EngineOptions>,
): ScenarioResult {
  const accumulator = new ScoreboardAccumulator();
  const statesVisited: ArbitrationState[] = [];
  const engine = new SimEngine({
    seed: scenario.seed,
    ...scenario.options,
    ...overrides,
    // Score every sample the run produces, not only the ones the trace buffer
    // still holds at the end.
    onSample: (sample) => {
      accumulator.add(sample);
      if (!statesVisited.includes(sample.arbitration)) statesVisited.push(sample.arbitration);
    },
  });

  const queue = [...scenario.events].sort((a, b) => a.atSeconds - b.atSeconds);
  let next = 0;
  let lowestAutonomy: number = AUTONOMY.full;

  for (let t = 1; t <= scenario.durationS; t += 1) {
    while (next < queue.length) {
      const item = queue[next];
      if (!item || item.atSeconds > t) break;
      engine.apply(item.event);
      next += 1;
    }
    engine.step();
    if (engine.state.autonomy < lowestAutonomy) lowestAutonomy = engine.state.autonomy;
  }

  return {
    state: engine.state,
    samples: engine.samples,
    log: engine.log,
    board: accumulator.result(engine.state.alertCount),
    statesVisited,
    lowestAutonomy,
    samplesProduced: engine.samplesProduced,
  };
}
