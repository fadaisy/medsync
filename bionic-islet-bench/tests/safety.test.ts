import type { Envelope } from "../src/engine/params.ts";
import type { AutonomyLevel, SimEvent } from "../src/engine/types.ts";
import { describe, expect, it } from "vitest";

import {
  basalCeiling,
  computeBasal,
  computeCorrectionBolus,
  computeMealBolus,
} from "../src/engine/controller.ts";
import { defaultEnvelope } from "../src/engine/params.ts";
import { Rng } from "../src/engine/rng.ts";
import { SimEngine } from "../src/engine/sim.ts";
import { AUTONOMY } from "../src/engine/types.ts";

const EPS = 1e-9;

/** Every fault the bench can inject, as a generator over a random source. */
function randomEvent(rand: () => number): SimEvent {
  const pick = Math.floor(rand() * 20);
  switch (pick) {
    case 0:
      return {
        kind: "meal",
        grams: [30, 60, 90][Math.floor(rand() * 3)] ?? 60,
        announced: rand() < 0.5,
      };
    case 1:
      return { kind: "paracetamol" };
    case 2:
      return { kind: "mannitol" };
    case 3:
      return { kind: "vitamin-c" };
    case 4:
      return rand() < 0.5 ? { kind: "exercise-start" } : { kind: "exercise-stop" };
    case 5:
      return { kind: "low-oxygen", on: rand() < 0.5 };
    case 6:
      return { kind: "protein-deposition" };
    case 7:
      return { kind: "omental-wrap", tip: rand() < 0.5 ? "A" : "B" };
    case 8:
      return { kind: "lead-a-fracture" };
    case 9:
      return { kind: "lead-b-fracture" };
    case 10:
      return { kind: "thermistor-failure" };
    case 11:
      return rand() < 0.5 ? { kind: "telemetry-loss" } : { kind: "telemetry-restore" };
    case 12:
      return rand() < 0.5 ? { kind: "phone-lost" } : { kind: "phone-found" };
    case 13:
      return { kind: "battery-low" };
    case 14:
      return { kind: "missed-calibration", on: rand() < 0.5 };
    case 15:
      return { kind: "calibrate" };
    case 16:
      return { kind: "flush" };
    case 17:
      return { kind: "tip-exchange", tip: rand() < 0.5 ? "A" : "B" };
    case 18:
      return rand() < 0.5 ? { kind: "cgm-bridge-on" } : { kind: "cgm-bridge-off" };
    default:
      return {
        kind: "envelope-change",
        actor: "property test",
        envelope: {
          basalRate: 0.2 + rand() * 2,
          maxBasal: 0.5 + rand() * 4,
          maxBolus: 0.5 + rand() * 6,
          target: 5 + rand() * 3,
          safeBasal: rand() * 2,
          suspendThreshold: 3 + rand() * 2,
          onInvalid: rand() < 0.5 ? "suspend" : "safe-basal",
        },
      };
  }
}

/**
 * The three safety invariants, checked after every simulated second of every
 * randomised run. They are stated in the brief as claims about the device;
 * here they are facts about the code or the run fails.
 */
describe("safety invariants over randomised fault sequences", () => {
  it("holds over 10 000 randomised fault sequences", () => {
    const SEQUENCES = 10_000;
    const SECONDS = 40 * 60;
    const violations: string[] = [];
    let sequencesWithInvalid = 0;
    let sequencesWithSuspend = 0;
    let sequencesWithDoubtful = 0;
    let autonomyDrops = 0;
    let stepsChecked = 0;

    for (let sequence = 0; sequence < SEQUENCES && violations.length < 20; sequence += 1) {
      const rng = new Rng(0x5eed0000 + sequence);
      const rand = () => rng.stream("sequence").next();

      // The front end is the physics one, as the bench ships. The probe
      // stride is coarse because these invariants are properties of the
      // supervisor and the controller rather than of the transport, and ten
      // thousand sequences at the interactive stride would be twenty five
      // minutes of test. At six hundred seconds the readings still come from
      // the real stacks, just resolved less finely in time.
      const engine = new SimEngine({ seed: 900_000 + sequence, probeStrideS: 600 });
      const schedule: Array<{ at: number; event: SimEvent }> = [];
      const count = 3 + Math.floor(rand() * 6);
      for (let i = 0; i < count; i += 1) {
        schedule.push({ at: Math.floor(rand() * SECONDS), event: randomEvent(rand) });
      }
      schedule.sort((a, b) => a.at - b.at);

      let next = 0;
      let previousEvidence = engine.state.evidenceScore;
      let previousAutonomy: AutonomyLevel = engine.state.autonomy;
      let sawInvalid = false;
      let sawSuspend = false;
      let sawDoubtful = false;

      for (let t = 1; t <= SECONDS; t += 1) {
        while (next < schedule.length && (schedule[next]?.at ?? Infinity) <= t) {
          engine.apply(schedule[next]!.event);
          next += 1;
        }
        engine.step();
        stepsChecked += 1;

        const s = engine.state;
        const env: Envelope = s.envelope;

        // 1. Only the controller commands insulin, and only inside the
        //    clinician envelope.
        if (s.basalCommand < -EPS || s.basalCommand > env.maxBasal + EPS) {
          violations.push(
            `seq ${sequence} t=${t}: basal ${s.basalCommand} outside [0, ${env.maxBasal}]`,
          );
        }
        if (s.basalCommand > basalCeiling(env, s.autonomy) + EPS) {
          violations.push(
            `seq ${sequence} t=${t}: basal ${s.basalCommand} above the ceiling for autonomy ${s.autonomy}`,
          );
        }
        if (s.bolusRemainingU > env.maxBolus + EPS) {
          violations.push(
            `seq ${sequence} t=${t}: bolus in flight ${s.bolusRemainingU} above ${env.maxBolus}`,
          );
        }
        if (env.safeBasal > env.basalRate + EPS) {
          violations.push(`seq ${sequence} t=${t}: safe basal is above the nominal basal rate`);
        }

        // 2. Trust can only fall as evidence worsens, and permitted autonomy
        //    falls with it.
        if (s.evidenceScore < previousEvidence - 1e-12 && s.autonomy > previousAutonomy) {
          violations.push(
            `seq ${sequence} t=${t}: evidence fell from ${previousEvidence} to ${s.evidenceScore} while autonomy rose from ${previousAutonomy} to ${s.autonomy}`,
          );
        }

        // 3. No dose while the state is invalid and the envelope says suspend.
        if (s.arbitration === "invalid" && env.onInvalid === "suspend" && s.deliveryRateUph > EPS) {
          violations.push(
            `seq ${sequence} t=${t}: delivering ${s.deliveryRateUph} U/h while invalid and set to suspend`,
          );
        }

        // 4. A bolus is never produced below full autonomy.
        if (s.autonomy !== AUTONOMY.full && s.bolusActive) {
          violations.push(`seq ${sequence} t=${t}: bolus delivering at autonomy ${s.autonomy}`);
        }

        if (s.autonomy < previousAutonomy) autonomyDrops += 1;
        if (s.arbitration === "invalid") sawInvalid = true;
        if (s.arbitration === "doubtful-one") sawDoubtful = true;
        if (s.autonomy === AUTONOMY.suspend) sawSuspend = true;

        previousEvidence = s.evidenceScore;
        previousAutonomy = s.autonomy;
      }

      if (sawInvalid) sequencesWithInvalid += 1;
      if (sawSuspend) sequencesWithSuspend += 1;
      if (sawDoubtful) sequencesWithDoubtful += 1;
    }

    // Coverage matters as much as the assertion: a property test over
    // sequences that never leave the happy path proves nothing.
    // eslint-disable-next-line no-console
    console.log(
      `  property test: ${SEQUENCES} sequences, ${stepsChecked.toLocaleString("en-GB")} simulated seconds checked\n` +
        `  reached invalid in ${sequencesWithInvalid}, doubtful-one in ${sequencesWithDoubtful}, suspend in ${sequencesWithSuspend}\n` +
        `  autonomy lowered ${autonomyDrops} times`,
    );

    expect(violations).toEqual([]);
    expect(sequencesWithInvalid).toBeGreaterThan(SEQUENCES * 0.02);
    expect(sequencesWithDoubtful).toBeGreaterThan(SEQUENCES * 0.02);
    expect(sequencesWithSuspend).toBeGreaterThan(0);
    expect(autonomyDrops).toBeGreaterThan(0);
  });
});

describe("the controller cannot be talked into more insulin by a worse reading", () => {
  it("basal is non-increasing in the uncertainty of the estimate", () => {
    const rng = new Rng(31337);
    const rand = () => rng.stream("mono").next();
    const violations: string[] = [];

    for (let i = 0; i < 100_000; i += 1) {
      const envelope: Envelope = {
        ...defaultEnvelope(),
        basalRate: 0.2 + rand() * 2,
        maxBasal: 1 + rand() * 3,
        target: 5 + rand() * 3,
      };
      const autonomy: AutonomyLevel = rand() < 0.5 ? AUTONOMY.full : AUTONOMY.basalOnly;
      const base = {
        envelope,
        autonomy,
        fused: 2 + rand() * 18,
        rate: (rand() - 0.5) * 0.6,
        integral: (rand() - 0.5) * 1.6,
        iob: rand() * 6,
      };
      const low = rand() * 2;
      const high = low + rand() * 4;

      const a = computeBasal({ ...base, uncertainty: low }, 1);
      const b = computeBasal({ ...base, uncertainty: high }, 1);
      if (b.basal > a.basal + EPS) {
        violations.push(`uncertainty ${low} gave ${a.basal} U/h, ${high} gave ${b.basal} U/h`);
      }
      if (violations.length > 5) break;
    }

    expect(violations).toEqual([]);
  });

  it("reduced autonomy never commands more basal than full autonomy would", () => {
    const rng = new Rng(4242);
    const rand = () => rng.stream("levels").next();
    for (let i = 0; i < 50_000; i += 1) {
      const envelope: Envelope = {
        ...defaultEnvelope(),
        basalRate: 0.2 + rand() * 2,
        maxBasal: 1 + rand() * 3,
      };
      const base = {
        envelope,
        fused: 2 + rand() * 18,
        uncertainty: rand() * 2,
        rate: (rand() - 0.5) * 0.6,
        integral: (rand() - 0.5) * 1.6,
        iob: rand() * 6,
      };
      const full = computeBasal({ ...base, autonomy: AUTONOMY.full }, 1).basal;
      const reduced = computeBasal({ ...base, autonomy: AUTONOMY.basalOnly }, 1).basal;
      expect(reduced).toBeLessThanOrEqual(full + EPS);
    }
  });

  it("no bolus of any kind is produced below full autonomy", () => {
    const envelope = defaultEnvelope();
    for (const autonomy of [AUTONOMY.suspend, AUTONOMY.safeBasal, AUTONOMY.basalOnly] as const) {
      expect(computeMealBolus(envelope, autonomy, 120)).toBe(0);
      expect(computeCorrectionBolus(envelope, autonomy, 25, 0.3, 0)).toBe(0);
    }
    // And at full autonomy the same inputs are still bounded by the envelope.
    expect(computeMealBolus(envelope, AUTONOMY.full, 1000)).toBeLessThanOrEqual(envelope.maxBolus);
    expect(computeCorrectionBolus(envelope, AUTONOMY.full, 40, 1, 0)).toBeLessThanOrEqual(
      envelope.maxBolus,
    );
  });
});

describe("nothing outside the body can command a dose", () => {
  it("losing the phone and the radio leaves the insulin trace bit-identical", () => {
    const control = new SimEngine({ seed: 5150 });
    const disconnected = new SimEngine({ seed: 5150 });

    control.run(3600);
    disconnected.run(3600);
    disconnected.apply({ kind: "phone-lost" });
    disconnected.apply({ kind: "telemetry-loss" });

    control.apply({ kind: "meal", grams: 60, announced: true });
    disconnected.apply({ kind: "meal", grams: 60, announced: true });

    for (let i = 0; i < 6 * 3600; i += 1) {
      control.step();
      disconnected.step();
      expect(disconnected.state.deliveryRateUph).toBe(control.state.deliveryRateUph);
      expect(disconnected.state.plasmaGlucose).toBe(control.state.plasmaGlucose);
    }
    expect(disconnected.state.totalInsulinU).toBe(control.state.totalInsulinU);
    // The only difference is what MedSync outside the body knows about it.
    expect(disconnected.state.silenceS).toBeGreaterThan(control.state.silenceS);
    expect(disconnected.log.some((l) => l.code === "SLNT")).toBe(true);
  });
});
