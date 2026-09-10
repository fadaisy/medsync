import { describe, expect, it } from "vitest";

import { PHYSIOLOGY } from "../src/engine/params.ts";
import { runScenario, scenarioById, siteAdvantageMinutes } from "../src/engine/scenarios.ts";
import { SimEngine } from "../src/engine/sim.ts";

const HOUR = 3600;

/** Peak plasma glucose and the time it takes to fall back below a level. */
function mealResponse(grams: number, announced: boolean, seed: number) {
  const engine = new SimEngine({ seed });
  // Settle first, so the meal starts from a steady baseline rather than from
  // whatever the initial conditions happen to be.
  engine.run(2 * HOUR);
  const startT = engine.state.t;
  const baseline = engine.state.plasmaGlucose;
  engine.apply({ kind: "meal", grams, announced });

  let peak = baseline;
  let peakT = startT;
  let backBelow8: number | null = null;
  for (let i = 0; i < 6 * HOUR; i += 1) {
    engine.step();
    const g = engine.state.plasmaGlucose;
    if (g > peak) {
      peak = g;
      peakT = engine.state.t;
    }
    if (backBelow8 === null && engine.state.t > peakT && g < 8) {
      backBelow8 = (engine.state.t - startT) / HOUR;
    }
  }
  return { baseline, peak, peakT: (peakT - startT) / 60, backBelow8, engine };
}

describe("physiology", () => {
  it("holds a steady baseline with no meal", () => {
    const engine = new SimEngine({ seed: 11 });
    engine.run(6 * HOUR);
    // Nothing has been eaten, so plasma glucose should stay close to where it
    // started rather than drifting off on its own.
    expect(engine.state.plasmaGlucose).toBeGreaterThan(4.5);
    expect(engine.state.plasmaGlucose).toBeLessThan(7.5);
  });

  it("a 60 g meal with the loop closed peaks between 8 and 12 mmol/L", () => {
    const seeds = [101, 202, 303, 404, 505];
    const peaks = seeds.map((seed) => mealResponse(60, true, seed).peak);
    for (const peak of peaks) {
      expect(peak).toBeGreaterThanOrEqual(8);
      expect(peak).toBeLessThanOrEqual(12);
    }
  });

  it("a 60 g meal returns below 8 mmol/L within 3 hours", () => {
    const seeds = [101, 202, 303, 404, 505];
    for (const seed of seeds) {
      const response = mealResponse(60, true, seed);
      expect(response.backBelow8).not.toBeNull();
      expect(response.backBelow8 as number).toBeLessThanOrEqual(3);
    }
  });

  it("a larger meal peaks higher than a smaller one", () => {
    const small = mealResponse(30, true, 909).peak;
    const large = mealResponse(90, true, 909).peak;
    expect(large).toBeGreaterThan(small);
  });

  it("the peritoneal site leads the subcutaneous site by 9 to 14 min", () => {
    const result = runScenario(scenarioById("unannounced-meal"));
    const lead = siteAdvantageMinutes(result.samples, 2 * HOUR, 5 * HOUR);
    expect(lead).not.toBeNull();
    expect(lead as number).toBeGreaterThanOrEqual(9);
    expect(lead as number).toBeLessThanOrEqual(14);
  });

  it("the site advantage tracks the difference in the two time constants", () => {
    // Sanity on the model rather than on one run: the lead should be close to
    // the difference between the subcutaneous and peritoneal time constants.
    const expected = PHYSIOLOGY.tauSubcutaneousMin - PHYSIOLOGY.tauPeritonealMin;
    const result = runScenario(scenarioById("unannounced-meal"));
    const lead = siteAdvantageMinutes(result.samples, 2 * HOUR, 5 * HOUR) as number;
    expect(Math.abs(lead - expected)).toBeLessThan(3);
  });

  it("exercise lowers glucose and lowers peritoneal oxygen", () => {
    const resting = new SimEngine({ seed: 77 });
    const active = new SimEngine({ seed: 77 });
    resting.run(HOUR);
    active.run(HOUR);
    active.apply({ kind: "exercise-start" });
    resting.run(2 * HOUR);
    active.run(2 * HOUR);
    expect(active.state.plasmaGlucose).toBeLessThan(resting.state.plasmaGlucose);
    expect(active.state.oxygenMmHg).toBeLessThan(resting.state.oxygenMmHg);
  });

  it("announcing a meal shortens the excursion, but does not blunt the peak", () => {
    // Worth stating precisely, because it is a real consequence of the model
    // rather than a nicety: with a 20 min delivery lag and a 25 min action
    // lag, a bolus given at the moment of eating cannot act before a peak
    // that arrives at 45 min. What it does do is bring the tail down. See
    // DECISIONS.md, decision 8.
    const fourHours = (announced: boolean, seed: number) => {
      const engine = new SimEngine({ seed });
      engine.run(2 * HOUR);
      engine.apply({ kind: "meal", grams: 60, announced });
      let sum = 0;
      let n = 0;
      let peak = 0;
      for (let i = 0; i < 4 * HOUR; i += 1) {
        engine.step();
        sum += engine.state.plasmaGlucose;
        peak = Math.max(peak, engine.state.plasmaGlucose);
        n += 1;
      }
      return { mean: sum / n, peak };
    };

    for (const seed of [1234, 55, 777, 9090, 4242]) {
      const announced = fourHours(true, seed);
      const unannounced = fourHours(false, seed);
      expect(unannounced.mean).toBeGreaterThan(announced.mean);
      expect(Math.abs(unannounced.peak - announced.peak)).toBeLessThan(0.5);
    }
  });
});
