import { beforeAll, describe, expect, it } from "vitest";

import { AGEING, PHYSIOLOGY } from "../src/engine/params.ts";
import { ScoreboardAccumulator } from "../src/engine/scoreboard.ts";
import { ordinaryDays, runScenario, scenarioById } from "../src/engine/scenarios.ts";
import { SimEngine } from "../src/engine/sim.ts";
import type { Scoreboard } from "../src/engine/types.ts";

const DAY = 86_400;

type YearResult = {
  engine: SimEngine;
  board: Scoreboard;
  photobleachPct: number;
};

/** One ordinary year: three meals and a night's sleep every day, no faults. */
function runYear(seed: number, steroidEffectScale = 1): YearResult {
  const engine = new SimEngine({ seed, steroidEffectScale, maxSamples: 4000 });
  const queue = [...ordinaryDays(365)].sort((a, b) => a.atSeconds - b.atSeconds);
  let next = 0;
  const accumulator = new ScoreboardAccumulator();
  let seen = 0;

  for (let t = 1; t <= 365 * DAY; t += 1) {
    while (next < queue.length && (queue[next]?.atSeconds ?? Infinity) <= t) {
      engine.apply(queue[next]!.event);
      next += 1;
    }
    engine.step();
    if (engine.samplesProduced > seen) {
      seen = engine.samplesProduced;
      const latest = engine.samples[engine.samples.length - 1];
      if (latest) accumulator.add(latest);
    }
  }

  return {
    engine,
    board: accumulator.result(engine.state.alertCount),
    photobleachPct:
      (1 - Math.exp(-engine.state.tipA.flashes / AGEING.photobleachHalfScaleFlashes)) * 100,
  };
}

describe("ageing at one year", () => {
  let year: YearResult;

  beforeAll(() => {
    year = runYear(20260365);
  });

  it("photobleaching is between 45 and 65 percent at day 365", () => {
    // eslint-disable-next-line no-console
    console.log(`  photobleaching at day 365: ${year.photobleachPct.toFixed(1)} percent`);
    expect(year.photobleachPct).toBeGreaterThanOrEqual(45);
    expect(year.photobleachPct).toBeLessThanOrEqual(65);
  });

  it("capsule thickness is between 90 and 140 um at day 365", () => {
    const a = year.engine.state.tipA.capsuleMicron;
    const b = year.engine.state.tipB.capsuleMicron;
    // eslint-disable-next-line no-console
    console.log(`  capsule at day 365: tip A ${a.toFixed(1)} um, tip B ${b.toFixed(1)} um`);
    for (const value of [a, b]) {
      expect(value).toBeGreaterThanOrEqual(90);
      expect(value).toBeLessThanOrEqual(140);
    }
  });

  it("the fused mean absolute relative difference stays under 12 percent", () => {
    // eslint-disable-next-line no-console
    console.log(
      `  whole-year scoreboard: MARD ${year.board.mardPct.toFixed(2)} percent, ` +
        `time in range ${year.board.timeInRangePct.toFixed(1)} percent, ` +
        `${year.board.minutes.toLocaleString("en-GB")} min scored`,
    );
    expect(year.board.mardPct).toBeLessThan(12);
    expect(year.board.minutes).toBe(365 * 1440);
  });

  it("the sensing lag has grown with the capsule", () => {
    const capsule = year.engine.state.tipA.capsuleMicron;
    const tauCap =
      PHYSIOLOGY.tauCapsuleBaseMin + PHYSIOLOGY.tauCapsulePerMicron * capsule;
    // eslint-disable-next-line no-console
    console.log(`  tip A tissue lag at day 365: ${tauCap.toFixed(1)} min, against 0.5 min at implant`);
    expect(tauCap).toBeGreaterThan(5);
    // Even a year in, the peritoneal path is still quicker than a fresh
    // subcutaneous sensor's own equilibration time.
    expect(tauCap + PHYSIOLOGY.tauPeritonealMin).toBeLessThan(PHYSIOLOGY.tauSubcutaneousMin);
  });

  it("enzyme activity and reference drift have moved as modelled", () => {
    const s = year.engine.state;
    expect(s.enzymeActivity).toBeCloseTo(Math.exp(-365 / AGEING.enzymeTauDays), 2);
    expect(s.referenceDriftMv).toBeCloseTo(365 * AGEING.chlorideDriftMvPerDay, 1);
  });

  it("the dexamethasone collar leaves a measurably thinner capsule", () => {
    const withoutCollar = runScenario(scenarioById("no-collar"));
    const withCollar = year.engine.state.tipA.capsuleMicron;
    const without = withoutCollar.state.tipA.capsuleMicron;
    // eslint-disable-next-line no-console
    console.log(
      `  tip A capsule at day 365: ${withCollar.toFixed(0)} um with the collar, ` +
        `${without.toFixed(0)} um without. Difference ${(without - withCollar).toFixed(0)} um`,
    );
    expect(without).toBeGreaterThan(withCollar + 15);
  });
});
