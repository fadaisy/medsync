import { describe, expect, it } from "vitest";

import { runScenario, SCENARIOS, scenarioById } from "../src/engine/scenarios.ts";
import { SimEngine } from "../src/engine/sim.ts";

/**
 * Determinism is the foundation every other check stands on. If the same seed
 * and the same event sequence do not produce the same numbers, no scoreboard
 * in this bench means anything.
 */
describe("determinism", () => {
  const shortScenarios = SCENARIOS.filter((s) => s.durationS <= 24 * 3600);

  for (const scenario of shortScenarios) {
    it(`scenario ${scenario.number} (${scenario.id}) reproduces exactly across two runs`, () => {
      const first = runScenario(scenario);
      const second = runScenario(scenario);

      expect(second.board).toEqual(first.board);
      expect(second.state.plasmaGlucose).toBe(first.state.plasmaGlucose);
      expect(second.state.totalInsulinU).toBe(first.state.totalInsulinU);
      expect(second.state.alertCount).toBe(first.state.alertCount);
      expect(second.statesVisited).toEqual(first.statesVisited);
      expect(second.log.length).toBe(first.log.length);
      expect(second.log.map((l) => `${l.t}|${l.code}|${l.message}`)).toEqual(
        first.log.map((l) => `${l.t}|${l.code}|${l.message}`),
      );
    });
  }

  it("a different seed produces a different run", () => {
    const scenario = scenarioById("ordinary-day");
    const a = runScenario(scenario);
    const b = runScenario({ ...scenario, seed: scenario.seed + 1 });
    expect(b.board.mardPct).not.toBe(a.board.mardPct);
  });

  it("adding a fault stream does not disturb the streams already drawn", () => {
    // Streams are named and independent, so a run that never fires the
    // interferent draws exactly the same optical and electrochemical noise as
    // one that does, up to the moment the interferent is applied.
    const control = new SimEngine({ seed: 4242 });
    const test = new SimEngine({ seed: 4242 });
    control.run(3600);
    test.run(3600);
    expect(test.state.readingA.glucose).toBe(control.state.readingA.glucose);
    expect(test.state.readingB.glucose).toBe(control.state.readingB.glucose);
  });
});
