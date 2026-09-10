import { describe, expect, it } from "vitest";

import { runScenario, SCENARIOS, scenarioById } from "../src/engine/scenarios.ts";
import { SimEngine } from "../src/engine/sim.ts";

/**
 * One assertion per scenario, taken from the scenario's own `check`. The
 * bench shows the same expectation text next to the run, so a scenario that
 * stops being true here stops claiming to be true there.
 */
describe("scenarios reach their expected end state", () => {
  for (const scenario of SCENARIOS) {
    it(`${scenario.number}. ${scenario.title}`, () => {
      const result = runScenario(scenario);
      const check = scenario.check(result);
      // eslint-disable-next-line no-console
      console.log(`  ${scenario.number}. ${scenario.title}: ${check.detail}`);
      expect(check.ok, `${scenario.expectation} -- got ${check.detail}`).toBe(true);
    });
  }
});

describe("scenario 3 against scenario 4", () => {
  it("the same interferent lands differently depending on the evidence", () => {
    const bare = runScenario(scenarioById("paracetamol"));
    const fouled = runScenario(scenarioById("paracetamol-fouled"));

    // With nothing to blame, the supervisor refuses to pick a tip.
    expect(bare.statesVisited).toContain("invalid");
    expect(fouled.statesVisited).not.toContain("invalid");

    // With the impedance accusing tip B, it keeps running on tip A.
    expect(fouled.statesVisited).toContain("doubtful-one");
    expect(fouled.lowestAutonomy).toBe(2);
    expect(bare.lowestAutonomy).toBeLessThanOrEqual(1);

    // eslint-disable-next-line no-console
    console.log(
      `  scenario 3 (no evidence): ${bare.statesVisited.join(", ")}, ` +
        `lowest autonomy ${bare.lowestAutonomy}, time in range ${bare.board.timeInRangePct.toFixed(1)} percent\n` +
        `  scenario 4 (tip B accused): ${fouled.statesVisited.join(", ")}, ` +
        `lowest autonomy ${fouled.lowestAutonomy}, time in range ${fouled.board.timeInRangePct.toFixed(1)} percent`,
    );
  });
});

describe("fault injections each do what their tooltip says", () => {
  const settle = (engine: SimEngine, seconds: number) => engine.run(seconds);

  it("mannitol lifts the optical tip and not the electrochemical one", () => {
    const engine = new SimEngine({ seed: 606 });
    settle(engine, 3600);
    const beforeA = engine.state.readingA.glucose ?? 0;
    const beforeB = engine.state.readingB.glucose ?? 0;
    engine.apply({ kind: "mannitol" });
    settle(engine, 900);
    expect((engine.state.readingA.glucose ?? 0) - beforeA).toBeGreaterThan(3);
    expect(Math.abs((engine.state.readingB.glucose ?? 0) - beforeB)).toBeLessThan(1.5);
  });

  it("paracetamol lifts the electrochemical tip and not the optical one", () => {
    const engine = new SimEngine({ seed: 607 });
    settle(engine, 3600);
    const beforeA = engine.state.readingA.glucose ?? 0;
    engine.apply({ kind: "paracetamol" });
    settle(engine, 3600);
    expect((engine.state.readingB.glucose ?? 0) - (engine.state.readingA.glucose ?? 0)).toBeGreaterThan(2);
    expect(Math.abs((engine.state.readingA.glucose ?? 0) - beforeA)).toBeLessThan(2);
  });

  it("a lead fracture kills exactly one channel", () => {
    const engine = new SimEngine({ seed: 608 });
    settle(engine, 3600);
    engine.apply({ kind: "lead-b-fracture" });
    settle(engine, 3600);
    expect(engine.state.readingB.glucose).toBeNull();
    expect(engine.state.readingA.glucose).not.toBeNull();
    expect(engine.state.arbitration).toBe("doubtful-one");
  });

  it("a tip exchange resets that tip's ageing and nothing else", () => {
    const engine = new SimEngine({ seed: 609 });
    engine.run(30 * 86_400);
    const capsuleABefore = engine.state.tipA.capsuleMicron;
    expect(engine.state.tipB.capsuleMicron).toBeGreaterThan(5);
    engine.apply({ kind: "tip-exchange", tip: "B" });
    expect(engine.state.tipB.capsuleMicron).toBe(0);
    expect(engine.state.enzymeActivity).toBe(1);
    expect(engine.state.tipA.capsuleMicron).toBe(capsuleABefore);
  });

  it("a flush removes a fifth of the capsule and half the fouling", () => {
    const engine = new SimEngine({ seed: 610 });
    engine.run(60 * 86_400);
    engine.apply({ kind: "protein-deposition" });
    const capsule = engine.state.tipB.capsuleMicron;
    const fouling = engine.state.tipB.fouling;
    engine.apply({ kind: "flush" });
    expect(engine.state.tipB.capsuleMicron).toBeCloseTo(capsule * 0.8, 5);
    expect(engine.state.tipB.fouling).toBeCloseTo(fouling * 0.5, 5);
  });

  it("low oxygen only bites above 12 mmol/L", () => {
    // The claim is about the electrochemical tip specifically, so it is
    // measured against the optical tip, which has no oxygen dependence at all.
    const gap = (lowOxygen: boolean, grams: number) => {
      const engine = new SimEngine({ seed: 611 });
      engine.run(1800);
      if (lowOxygen) engine.apply({ kind: "low-oxygen", on: true });
      engine.apply({ kind: "meal", grams, announced: false });
      let worst = 0;
      let atGlucose = 0;
      for (let i = 0; i < 3 * 3600; i += 1) {
        engine.step();
        const a = engine.state.readingA.glucose;
        const b = engine.state.readingB.glucose;
        if (a === null || b === null) continue;
        if (a - b > worst) {
          worst = a - b;
          atGlucose = engine.state.plasmaGlucose;
        }
      }
      return { worst, atGlucose };
    };

    // At an ordinary glucose the enzyme has all the oxygen it needs.
    const ordinary = gap(true, 20);
    expect(ordinary.worst).toBeLessThan(0.8);

    // Push glucose past 12 mmol/L and the same fault bites.
    const high = gap(true, 140);
    const control = gap(false, 140);
    expect(high.atGlucose).toBeGreaterThan(12);
    expect(high.worst).toBeGreaterThan(ordinary.worst);
    expect(high.worst).toBeGreaterThan(control.worst + 0.5);
  });

  it("a battery low slows acquisition and widens the band", () => {
    const engine = new SimEngine({ seed: 612 });
    engine.run(3600);
    const before = engine.state.readingA.uncertainty;
    const samplesBefore = engine.samplesProduced;
    engine.apply({ kind: "battery-low" });
    engine.run(3600);
    const producedWhileLow = engine.samplesProduced - samplesBefore;
    expect(producedWhileLow).toBeLessThan(20);
    expect(engine.state.readingA.uncertainty).toBeGreaterThan(before);
  });

  it("a thermistor failure widens both bands without killing either channel", () => {
    const engine = new SimEngine({ seed: 613 });
    engine.run(3600);
    const beforeA = engine.state.readingA.uncertainty;
    const beforeB = engine.state.readingB.uncertainty;
    engine.apply({ kind: "thermistor-failure" });
    engine.run(600);
    expect(engine.state.readingA.uncertainty).toBeGreaterThan(beforeA);
    expect(engine.state.readingB.uncertainty).toBeGreaterThan(beforeB);
    expect(engine.state.readingA.glucose).not.toBeNull();
    expect(engine.state.readingB.glucose).not.toBeNull();
  });

  it("a bridged monitor lifts suspend to basal modulation, never to full", () => {
    const engine = new SimEngine({ seed: 614, envelope: { onInvalid: "suspend" } });
    engine.run(3600);
    engine.apply({ kind: "lead-a-fracture" });
    engine.apply({ kind: "lead-b-fracture" });
    engine.run(600);
    expect(engine.state.arbitration).toBe("invalid");
    expect(engine.state.autonomy).toBe(0);
    expect(engine.state.deliveryRateUph).toBe(0);

    engine.apply({ kind: "cgm-bridge-on" });
    engine.run(120);
    // The lift is not instant: 15 min of a stable bridge, like any other
    // restoration of autonomy.
    expect(engine.state.arbitration).toBe("bridged");
    expect(engine.state.autonomy).toBe(0);

    engine.run(20 * 60);
    expect(engine.state.autonomy).toBe(2);

    // Basal is modulated from the bridged reading, so insulin flows again.
    // It does not resume the instant autonomy lifts: the controller doses on
    // the lower edge of a 1.2 mmol/L band doubled at reduced autonomy, which
    // at an ordinary glucose does not justify insulin at all.
    const before = engine.state.totalInsulinU;
    engine.run(12 * 3600);
    expect(engine.state.totalInsulinU).toBeGreaterThan(before);

    // And it never climbs to full, however long it runs.
    expect(engine.state.autonomy).toBeLessThanOrEqual(2);
    expect(engine.state.arbitration).toBe("bridged");
  });

  it("an envelope change is written to the audit log", () => {
    const engine = new SimEngine({ seed: 615 });
    engine.run(600);
    engine.apply({
      kind: "envelope-change",
      actor: "Dr A. Nakato",
      envelope: { maxBasal: 2.0 },
    });
    expect(engine.audit).toHaveLength(1);
    expect(engine.audit[0]?.actor).toBe("Dr A. Nakato");
    expect(engine.audit[0]?.mfaSatisfied).toBe(true);
    expect(engine.audit[0]?.change).toContain("maxBasal");
    expect(engine.state.envelope.maxBasal).toBe(2.0);
  });
});
