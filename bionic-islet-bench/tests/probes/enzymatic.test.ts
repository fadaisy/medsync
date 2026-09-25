/**
 * Phase 3 checks for the enzymatic probe.
 *
 * The pattern is the same as phase 2: each test asserts the physics, and
 * where the model's answer differs from what the build brief expected, the
 * test says so and reports the number rather than being loosened until the
 * expectation fits.
 */
import type {
  EnzymaticEnvironment,
  EnzymaticGeometry,
} from "../../src/engine/probes/enzymatic/index.ts";
import { describe, expect, it } from "vitest";

import { DIFF, ELEC, ENV, ENZ, FUND, GEOM, IMP, PART } from "../../src/engine/probes/constants.ts";
import {
  ageEnzyme,
  catalyticTemperatureFactor,
  dissolvedOxygen,
  EnzymaticProbe,
  inactivationRate,
  lactoneHydrolysisRate,
  localPh,
  mutarotationRate,
  peroxideSurfaceRate,
  probeAngularFrequency,
  randlesElements,
  randlesImpedance,
  referenceChloride,
  referenceDrift,
  referencePotential,
  silverChlorideRemaining,
  turnoverRate,
} from "../../src/engine/probes/enzymatic/index.ts";
import {
  celsiusToKelvin,
  micronsToMetres,
  mmHgToPascals,
  molPerM3,
  nanoampsToAmps,
  raw,
  s,
} from "../../src/engine/probes/units.ts";
import { Rng } from "../../src/engine/rng.ts";

/* eslint-disable no-console */

const CLEAN: EnzymaticGeometry = {
  capsuleThickness: micronsToMetres(50),
  foulingFraction: 0,
  fractured: false,
};

function environment(
  glucose: number,
  over: Partial<EnzymaticEnvironment> = {},
): EnzymaticEnvironment {
  return {
    glucose: molPerM3(glucose),
    oxygenPartialPressure: raw(ENV.peritonealOxygen),
    paracetamol: molPerM3(0),
    ascorbate: ENV.plasmaAscorbate,
    temperature: ENV.bodyTemperature,
    ...over,
  };
}

function settled(
  glucose: number,
  over: Partial<EnzymaticEnvironment> = {},
  geometry: Partial<EnzymaticGeometry> = {},
  options: { recycleOxygen?: boolean } = {},
): { probe: EnzymaticProbe; env: EnzymaticEnvironment } {
  const env = environment(glucose, over);
  const probe = new EnzymaticProbe({ ...CLEAN, ...geometry }, env, options);
  probe.settle(env);
  return { probe, env };
}

/** Current in nanoamperes, which is the scale the bench's readouts use. */
function nanoamps(current: { valueOf(): number }): number {
  return raw(current) * 1e9;
}

describe("ping-pong bi-bi", () => {
  const enzyme = ENZ.enzymeLoading;
  const vmax = raw(ENZ.kCat) * raw(enzyme);

  it("reaches k_cat E when both substrates are plentiful", () => {
    const rate = raw(
      turnoverRate(
        enzyme,
        molPerM3(raw(ENZ.kmGlucose) * 1e4),
        molPerM3(raw(ENZ.kmOxygen) * 1e4),
        ENV.bodyTemperature,
      ),
    );
    console.log(
      `  saturated turnover ${rate.toFixed(2)} against k_cat E of ${vmax.toFixed(2)} mol/(m3 s)`,
    );
    expect(rate / vmax).toBeGreaterThan(0.999);
    expect(rate / vmax).toBeLessThanOrEqual(1);
  });

  it("becomes linear in oxygen and blind to glucose when oxygen runs out", () => {
    // The analytic limit of the rate law as oxygen goes to zero is
    // k_cat E O2 / K_O2, with no glucose in it at all. That is oxygen
    // limitation, and it is the denominator rather than a branch.
    const oxygen = molPerM3(raw(ENZ.kmOxygen) * 1e-4);
    const predicted = (vmax * raw(oxygen)) / raw(ENZ.kmOxygen);
    const readings = [5, 50, 500].map((g) =>
      raw(turnoverRate(enzyme, molPerM3(g), oxygen, ENV.bodyTemperature)),
    );
    const spread = (Math.max(...readings) - Math.min(...readings)) / readings[0]!;
    const error = Math.abs(readings[1]! - predicted) / predicted;
    console.log(
      `  at ${raw(oxygen).toExponential(1)} mol/m3 oxygen the rate is ${readings[1]!.toExponential(3)} against the analytic ${predicted.toExponential(3)}; across a hundredfold glucose range it moves ${(spread * 100).toExponential(2)} %`,
    );
    expect(error).toBeLessThan(0.01);
    // Blind to glucose: a hundredfold change must barely move it.
    expect(spread).toBeLessThan(0.02);
  });

  it("becomes linear in glucose and blind to oxygen when glucose runs out", () => {
    const glucose = molPerM3(raw(ENZ.kmGlucose) * 1e-4);
    const predicted = (vmax * raw(glucose)) / raw(ENZ.kmGlucose);
    const readings = [0.05, 0.5, 5].map((o) =>
      raw(turnoverRate(enzyme, glucose, molPerM3(o), ENV.bodyTemperature)),
    );
    const spread = (Math.max(...readings) - Math.min(...readings)) / readings[0]!;
    console.log(
      `  at ${raw(glucose).toExponential(1)} mol/m3 glucose the rate is ${readings[1]!.toExponential(3)} against the analytic ${predicted.toExponential(3)}; across a hundredfold oxygen range it moves ${(spread * 100).toExponential(2)} %`,
    );
    expect(Math.abs(readings[1]! - predicted) / predicted).toBeLessThan(0.01);
    expect(spread).toBeLessThan(0.02);
  });

  it("speeds up with temperature the way a forty kilojoule barrier says", () => {
    const ten =
      catalyticTemperatureFactor(celsiusToKelvin(47)) /
      catalyticTemperatureFactor(celsiusToKelvin(37));
    console.log(
      `  Q10 ${ten.toFixed(3)}; at 34 C ${catalyticTemperatureFactor(celsiusToKelvin(34)).toFixed(4)} and at 40 C ${catalyticTemperatureFactor(celsiusToKelvin(40)).toFixed(4)} of the rate at 37 C`,
    );
    expect(catalyticTemperatureFactor(ENV.bodyTemperature)).toBeCloseTo(1, 12);
    // A forty kilojoule activation energy is close to a doubling per ten
    // degrees, which is the rule of thumb the constant was chosen against.
    expect(ten).toBeGreaterThan(1.5);
    expect(ten).toBeLessThan(2.5);
  });
});

describe("anomers", () => {
  it("conserves total glucose and relaxes to the equilibrium composition", () => {
    let alpha = 1;
    let beta = 0;
    const dt = 0.5;
    const total = alpha + beta;
    let reachedHalf = 0;
    for (let i = 1; i <= 4000; i += 1) {
      const flow = raw(mutarotationRate(molPerM3(alpha), molPerM3(beta)));
      alpha -= flow * dt;
      beta += flow * dt;
      const fraction = beta / (alpha + beta);
      if (reachedHalf === 0 && fraction >= raw(ENZ.betaFractionEquilibrium) / 2)
        reachedHalf = i * dt;
      expect(alpha + beta).toBeCloseTo(total, 12);
    }
    const settledFraction = beta / (alpha + beta);
    console.log(
      `  beta fraction settles at ${settledFraction.toFixed(6)} against the declared ${raw(ENZ.betaFractionEquilibrium)}; half way there in ${reachedHalf.toFixed(1)} s against a time constant of ${(1 / raw(ENZ.mutarotation)).toFixed(0)} s`,
    );
    expect(settledFraction).toBeCloseTo(raw(ENZ.betaFractionEquilibrium), 6);
  });
});

describe("enzyme ageing", () => {
  it("follows the rate its own peroxide sets, with no imposed curve", () => {
    const dt = s(86400);
    for (const peroxide of [0, 1e-4, 1e-3]) {
      const expected = raw(inactivationRate(molPerM3(peroxide)));
      const after = raw(ageEnzyme(ENZ.enzymeLoading, molPerM3(peroxide), dt));
      const measured = -Math.log(after / raw(ENZ.enzymeLoading)) / raw(dt);
      const thermalShare = raw(ENZ.thermalInactivation) / expected;
      console.log(
        `  [H2O2] ${peroxide.toExponential(0)} mol/m3: ${expected.toExponential(3)} per second, of which ${(thermalShare * 100).toFixed(1)} % is thermal; a day leaves ${((after / raw(ENZ.enzymeLoading)) * 100).toFixed(2)} %`,
      );
      expect(measured).toBeCloseTo(expected, 12);
    }
    // Peroxide must make it faster. That is the whole point of the term.
    expect(raw(inactivationRate(molPerM3(1e-3)))).toBeGreaterThan(
      raw(inactivationRate(molPerM3(0))),
    );
  });
});

describe("the assembled probe", () => {
  it("is linear across the clinical range, because the membrane starves the enzyme", () => {
    const points: Array<{ glucose: number; current: number; beta: number }> = [];
    for (const g of [3, 6, 10, 15, 20, 25]) {
      const { probe, env } = settled(g);
      points.push({
        glucose: g,
        current: nanoamps(probe.read(env).glucoseCurrent),
        beta: raw(probe.diagnostics(env).betaAtEnzyme),
      });
    }
    // Least squares through the points, then the worst residual.
    const n = points.length;
    const sumX = points.reduce((a, p) => a + p.glucose, 0);
    const sumY = points.reduce((a, p) => a + p.current, 0);
    const sumXY = points.reduce((a, p) => a + p.glucose * p.current, 0);
    const sumXX = points.reduce((a, p) => a + p.glucose * p.glucose, 0);
    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;
    let worst = 0;
    for (const p of points) {
      worst = Math.max(worst, Math.abs(p.current - (slope * p.glucose + intercept)) / p.current);
    }
    const saturation = points[points.length - 1]!.beta / raw(ENZ.kmGlucose);
    console.log(
      `  ${slope.toFixed(4)} nA per mmol/L with an intercept of ${intercept.toExponential(2)} nA; worst departure from a straight line ${(worst * 100).toExponential(2)} %`,
    );
    console.log(
      `  the enzyme sees ${points[points.length - 1]!.beta.toExponential(2)} mol/m3 of beta glucose at 25 mmol/L, which is ${(saturation * 1e6).toFixed(1)} parts per million of its Michaelis constant`,
    );
    // Glucose oxidase saturates at 25 mmol/L, inside the clinical range. The
    // response is linear anyway, and this is why.
    expect(worst).toBeLessThan(0.01);
    expect(saturation).toBeLessThan(1e-3);
  });

  it("runs beta depleted, so mutarotation is part of what limits it", () => {
    const { probe, env } = settled(6);
    const d = probe.diagnostics(env);
    console.log(
      `  bulk beta fraction ${raw(ENZ.betaFractionEquilibrium)}, at the enzyme ${d.betaFractionAtEnzyme.toFixed(4)}: the enzyme takes beta faster than a hundred second interconversion replaces it`,
    );
    expect(d.betaFractionAtEnzyme).toBeLessThan(raw(ENZ.betaFractionEquilibrium) / 10);
    expect(d.betaFractionAtEnzyme).toBeGreaterThan(0);
  });

  it("recycles its own oxygen, which is what makes it oxygen tolerant", () => {
    const rows: string[] = [];
    let worstWithRecycling = 0;
    let worstWithout = 0;
    let currentWithRecycling = 0;
    let currentWithout = 0;
    for (const mmHg of [40, 10, 2]) {
      const over = { oxygenPartialPressure: raw(mmHgToPascals(mmHg)) };
      const on = settled(12, over);
      const off = settled(12, over, {}, { recycleOxygen: false });
      const dOn = on.probe.diagnostics(on.env);
      const dOff = off.probe.diagnostics(off.env);
      worstWithRecycling = Math.max(worstWithRecycling, dOn.oxygenLimitation);
      worstWithout = Math.max(worstWithout, dOff.oxygenLimitation);
      if (mmHg === 2) {
        currentWithRecycling = nanoamps(on.probe.read(on.env).glucoseCurrent);
        currentWithout = nanoamps(off.probe.read(off.env).glucoseCurrent);
      }
      rows.push(
        `  pO2 ${String(mmHg).padStart(2)} mmHg at 12 mmol/L: limitation ${dOn.oxygenLimitation.toFixed(4)} with recycling, ${dOff.oxygenLimitation.toFixed(4)} without; ${(dOn.oxygenReturnedFraction * 100).toFixed(2)} % of the oxygen comes back from the electrode`,
      );
    }
    for (const row of rows) console.log(row);
    console.log(
      `  at 2 mmHg the current is ${currentWithRecycling.toFixed(4)} nA with recycling and ${currentWithout.toFixed(4)} nA without`,
    );
    // The brief asked for oxygen limitation to be emergent rather than an if
    // statement. It is, and the model's answer is that at these membrane
    // permeabilities the electrode gives back essentially every oxygen the
    // enzyme spent, so limitation never appears. Turning the recycling off is
    // a labelled model switch, not a state of the device, and it is the only
    // way to see what the recycling is worth.
    expect(worstWithRecycling).toBeLessThan(0.02);
    expect(worstWithout).toBeGreaterThan(worstWithRecycling);
    expect(currentWithout).toBeLessThan(currentWithRecycling);
  });

  it("captures nearly all the peroxide it makes", () => {
    const { probe, env } = settled(6);
    const d = probe.diagnostics(env);
    const inward =
      raw(GEOM.innerMembraneThickness) /
      (raw(DIFF.peroxideInnerMembrane) * raw(PART.peroxideInnerMembrane));
    const outward =
      raw(GEOM.outerMembraneThickness) /
      (raw(DIFF.peroxideOuterMembrane) * raw(PART.peroxideOuterMembrane));
    console.log(
      `  ${(d.peroxideCaptureFraction * 100).toFixed(2)} % of the peroxide reaches the electrode; the inward path is ${(outward / inward).toFixed(0)} times easier than the outward one`,
    );
    expect(d.peroxideCaptureFraction).toBeGreaterThan(0.99);
  });

  it("closes the carbon balance", () => {
    // Every glucose skeleton that enters must leave as a lactone or a
    // gluconate, because nothing else consumes it and the electrode end is
    // sealed to all four. At steady state the four outer fluxes sum to zero.
    const { probe, env } = settled(10);
    const inward = probe.outerFluxOf("betaGlucose", env) + probe.outerFluxOf("alphaGlucose", env);
    const outward = probe.outerFluxOf("lactone", env) + probe.outerFluxOf("gluconate", env);
    const closure = Math.abs(inward + outward) / Math.abs(inward);
    console.log(
      `  glucose in ${inward.toExponential(6)}, lactone and gluconate out ${outward.toExponential(6)} mol/(m2 s); closure ${closure.toExponential(2)}`,
    );
    expect(closure).toBeLessThan(1e-6);
  });

  it("acidifies its own enzyme layer, and reports it rather than acting on it", () => {
    const rows: Array<[number, number, number]> = [];
    for (const g of [6, 15, 25]) {
      const { probe, env } = settled(g);
      const d = probe.diagnostics(env);
      rows.push([g, raw(d.gluconateAtEnzyme), d.localPh]);
    }
    for (const [g, gluconate, ph] of rows) {
      console.log(
        `  ${String(g).padStart(2)} mmol/L: gluconate ${gluconate.toFixed(1)} mol/m3 in the layer, local pH ${ph.toFixed(2)}`,
      );
    }
    // The gluconate is anionic, so the outer membrane traps it inside far
    // more firmly than the glucose it came from. The pH shift is real and it
    // is an upper bound: bicarbonate crosses membranes freely and would keep
    // buffering, which is not modelled. Nothing in the enzymatic model reads
    // this number, because no pH dependence of glucose oxidase is declared
    // and inventing one would be inventing physics.
    expect(rows[0]![2]).toBeLessThan(raw(ENV.peritonealPh));
    expect(rows[2]![2]).toBeLessThan(rows[0]![2]);
    expect(localPh(molPerM3(0))).toBeCloseTo(raw(ENV.peritonealPh), 12);
  });

  it("lets paracetamol through and keeps ascorbate out, by two partition coefficients", () => {
    const base = settled(6);
    const baseline = nanoamps(base.probe.read(base.env).current);
    const spiked = settled(6, { paracetamol: ELEC.paracetamolPeak });
    const reading = spiked.probe.read(spiked.env);
    const shift = (nanoamps(reading.current) - baseline) / baseline;

    // Per unit concentration, the two interferents travel the same stack and
    // differ only in what the permselective film lets into itself. So the
    // ratio of their currents is the ratio of their total series resistances,
    // which is worth predicting properly rather than guessing from the
    // rejection factors alone: every layer they share dilutes the difference.
    const seriesResistance = (rejection: number): number => {
      const innerPartition = raw(PART.interferentInnerMembrane) * (1 - rejection);
      return (
        raw(GEOM.boundaryLayer) / raw(DIFF.interferentWater) +
        raw(GEOM.foulingThicknessMax) * 0 +
        raw(micronsToMetres(50)) / (raw(DIFF.interferentCapsule) * raw(PART.interferentCapsule)) +
        raw(GEOM.outerMembraneThickness) /
          (raw(DIFF.interferentOuterMembrane) * raw(PART.interferentOuterMembrane)) +
        raw(GEOM.enzymeLayerThickness) /
          (raw(DIFF.interferentEnzymeLayer) * raw(PART.interferentEnzymeLayer)) +
        raw(GEOM.innerMembraneThickness) / (raw(DIFF.interferentInnerMembrane) * innerPartition) +
        1 / (raw(ELEC.interferentPermeability) * innerPartition)
      );
    };
    const predicted =
      seriesResistance(raw(ELEC.rejectionAscorbate)) /
      seriesResistance(raw(ELEC.rejectionParacetamol));
    const naive = (1 - raw(ELEC.rejectionParacetamol)) / (1 - raw(ELEC.rejectionAscorbate));

    const perParacetamol = nanoamps(reading.paracetamolCurrent) / raw(ELEC.paracetamolPeak);
    const perAscorbate = nanoamps(reading.ascorbateCurrent) / raw(ENV.plasmaAscorbate);
    const measured = perParacetamol / perAscorbate;

    console.log(
      `  a gram of paracetamol at its peak adds ${(shift * 100).toFixed(1)} % of the signal, ${nanoamps(reading.paracetamolCurrent).toFixed(4)} nA on ${baseline.toFixed(3)} nA`,
    );
    console.log(
      `  per mmol/L, paracetamol is ${measured.toFixed(2)} times the ascorbate current, against ${predicted.toFixed(2)} from the full series resistance and ${naive.toFixed(1)} from the rejection factors alone`,
    );
    expect(shift).toBeGreaterThan(0);
    // The series prediction is the one the model has to match.
    expect(measured / predicted).toBeGreaterThan(0.98);
    expect(measured / predicted).toBeLessThan(1.02);
    // And the rejection factors alone overstate the difference, because the
    // two interferents share every other layer and the same electrode.
    expect(measured).toBeLessThan(naive);
  });
});

describe("the reference and the circuit", () => {
  it("has a Nernst potential that rises as chloride falls", () => {
    const t = raw(ENV.bodyTemperature);
    const normal = raw(referencePotential(ENV.chloride, t));
    const depleted = raw(referencePotential(molPerM3(raw(ENV.chloride) / 10), t));
    const thermal = (raw(FUND.gasConstant) * t) / raw(FUND.faraday);
    console.log(
      `  E_ref ${(normal * 1000).toFixed(1)} mV at ${raw(ENV.chloride)} mol/m3 chloride, ${(depleted * 1000).toFixed(1)} mV at a tenth of it; one decade is ${(thermal * Math.LN10 * 1000).toFixed(1)} mV`,
    );
    expect(depleted).toBeGreaterThan(normal);
    expect(depleted - normal).toBeCloseTo(thermal * Math.LN10, 9);
  });

  it("spends its silver chloride at the signal current, and outlasts the device", () => {
    const { probe, env } = settled(6);
    const current = Math.abs(raw(probe.read(env).current));
    const capacity = raw(FUND.faraday) * raw(ELEC.chlorideCapacity);
    const years = capacity / current / (365 * 24 * 3600);
    console.log(
      `  ${(current * 1e9).toFixed(3)} nA drains ${capacity.toExponential(3)} C in ${years.toFixed(1)} years, against a one year implant`,
    );
    expect(silverChlorideRemaining(0)).toBe(1);
    expect(silverChlorideRemaining(capacity)).toBe(0);
    expect(raw(referenceChloride(capacity))).toBeLessThan(raw(ENV.chloride));
    expect(years).toBeGreaterThan(1);
  });

  it("loses signal only slowly as the reference drifts, because the current is production limited", () => {
    const capacity = raw(FUND.faraday) * raw(ELEC.chlorideCapacity);
    const rows: string[] = [];
    let last = Infinity;
    for (const spent of [0, 0.9, 0.99, 0.9999]) {
      const env = environment(6);
      const probe = new EnzymaticProbe(CLEAN, env);
      probe.setCharge(capacity * spent);
      probe.settle(env);
      const r = probe.read(env);
      const d = probe.diagnostics(env);
      const drift = raw(r.referenceDrift) * 1000;
      const surface = raw(peroxideSurfaceRate(r.referenceDrift));
      rows.push(
        `  ${(spent * 100).toFixed(2).padStart(6)} % spent: drift ${drift.toFixed(1).padStart(6)} mV, surface rate ${surface.toExponential(2)} m/s, current ${nanoamps(r.glucoseCurrent).toFixed(4)} nA, capture ${(d.peroxideCaptureFraction * 100).toFixed(2)} %`,
      );
      const current = nanoamps(r.glucoseCurrent);
      expect(current).toBeLessThanOrEqual(last + 1e-9);
      last = current;
    }
    for (const row of rows) console.log(row);
    // At steady state everything the enzyme makes has to leave somewhere, and
    // the electrode is the only easy way out, so the current is set by
    // production rather than by electrode kinetics. A slower surface reaction
    // simply lets the peroxide build up until the flux is restored. The signal
    // only falls once the surface is slow enough that peroxide starts leaking
    // outward instead, which is why the drift shows up in the capture fraction
    // long before it shows up in the reading.
    expect(last).toBeGreaterThan(0);
  });

  it("has the impedance limits a Randles cell must have", () => {
    const elements = randlesElements(0, micronsToMetres(50), false);
    const high = randlesImpedance(elements, 2 * Math.PI * 1e7);
    const low = randlesImpedance(elements, 2 * Math.PI * 1e-3);
    const atProbe = randlesImpedance(elements, probeAngularFrequency());
    console.log(
      `  |Z| ${high.magnitude.toFixed(1)} ohm at 10 MHz against R_s of ${raw(elements.solutionResistance).toFixed(0)}; ${(low.magnitude / 1000).toFixed(1)} kohm at 1 mHz against R_s + R_ct of ${((raw(elements.solutionResistance) + raw(elements.chargeTransferResistance)) / 1000).toFixed(1)} kohm`,
    );
    console.log(
      `  at the bench's ${IMP.probeFrequency} Hz: ${(atProbe.magnitude / 1000).toFixed(3)} kohm, phase ${atProbe.phase.toFixed(1)} degrees`,
    );
    // High frequency: the double layer shorts the faradaic branch out and
    // only the solution resistance is left.
    expect(high.magnitude).toBeCloseTo(raw(elements.solutionResistance), 0);
    // Low frequency: the capacitor is out of the way and the Warburg element
    // grows without bound, so the magnitude must exceed R_s + R_ct.
    expect(low.magnitude).toBeGreaterThan(
      raw(elements.solutionResistance) + raw(elements.chargeTransferResistance),
    );
    // A cell like this is capacitive at every finite frequency.
    expect(atProbe.phase).toBeLessThan(0);
    expect(atProbe.phase).toBeGreaterThan(-90);
  });

  it("shows fouling and capsule in the impedance, and a fracture as an open circuit", () => {
    const rows: Array<[string, number, number]> = [];
    for (const [label, fouling, capsule] of [
      ["clean", 0, 50],
      ["half fouled", 0.5, 50],
      ["fully fouled", 1, 50],
      ["thick capsule", 0, 150],
    ] as const) {
      const z = randlesImpedance(
        randlesElements(fouling, micronsToMetres(capsule), false),
        probeAngularFrequency(),
      );
      rows.push([label, z.magnitude / 1000, z.phase]);
    }
    for (const [label, magnitude, phase] of rows) {
      console.log(
        `  ${label.padEnd(13)} |Z| ${magnitude.toFixed(3)} kohm, phase ${phase.toFixed(1)} deg`,
      );
    }
    const fractured = randlesImpedance(
      randlesElements(0, micronsToMetres(50), true),
      probeAngularFrequency(),
    );
    console.log(`  fractured     |Z| ${(fractured.magnitude / 1e6).toFixed(1)} Mohm`);

    expect(rows[1]![1]).toBeGreaterThan(rows[0]![1]);
    expect(rows[2]![1]).toBeGreaterThan(rows[1]![1]);
    expect(rows[3]![1]).toBeGreaterThan(rows[0]![1]);
    expect(fractured.magnitude).toBeCloseTo(raw(IMP.openCircuitResistance), 0);

    const { probe, env } = settled(6, {}, { fractured: true });
    expect(nanoamps(probe.read(env).current)).toBe(0);
  });
});

describe("what a year does to it", () => {
  it("ages by peroxide, and the sensitivity holds until the enzyme has almost gone", () => {
    const day = s(86400);
    const rows: string[] = [];
    const results: Array<{ glucose: number; surviving: number; loss: number }> = [];
    for (const g of [6, 20]) {
      const { probe, env } = settled(g);
      const before = nanoamps(probe.read(env).glucoseCurrent);
      for (let d = 0; d < 365; d += 1) probe.advance(day, env);
      const after = nanoamps(probe.read(env).glucoseCurrent);
      const d = probe.diagnostics(env);
      const surface = d.enzymeProfile[0]! / raw(ENZ.enzymeLoading);
      const deep = d.enzymeProfile[d.enzymeProfile.length - 1]! / raw(ENZ.enzymeLoading);
      rows.push(
        `  ${String(g).padStart(2)} mmol/L for a year: enzyme ${(d.enzymeSurviving * 100).toFixed(1)} % on average, ${(surface * 100).toFixed(1)} % at the membrane face and ${(deep * 100).toFixed(1)} % against the electrode; current ${before.toFixed(4)} -> ${after.toFixed(4)} nA`,
      );
      results.push({ glucose: g, surviving: d.enzymeSurviving, loss: 1 - after / before });
    }
    const thermalOnly = Math.exp(-raw(ENZ.thermalInactivation) * 365 * 24 * 3600);
    for (const row of rows) console.log(row);
    console.log(
      `  the thermal term on its own would have left ${(thermalOnly * 100).toFixed(1)} %, so the peroxide term is doing most of the work`,
    );

    // Peroxide ageing must dominate the declared thermal term, which is what
    // the brief meant by ageing emerging rather than being imposed.
    expect(results[0]!.surviving).toBeLessThan(thermalOnly);
    // A probe held high ages faster. Nothing says so; the peroxide does.
    expect(results[1]!.surviving).toBeLessThan(results[0]!.surviving);
    // And the sensitivity barely moves until the enzyme is nearly gone,
    // because the response is membrane limited and the enzyme is in enormous
    // excess. That is a knee rather than a fade, and it is why a probe like
    // this holds its calibration and then fails.
    expect(results[0]!.loss).toBeLessThan(0.05);
    expect(results[1]!.loss).toBeGreaterThan(0.5);
  });
});

describe("cost", () => {
  it("solves a one second tick fast enough to say so", () => {
    const { probe, env } = settled(6);
    const started = performance.now();
    const ticks = 30;
    for (let i = 0; i < ticks; i += 1) probe.advance(s(1), env);
    const each = (performance.now() - started) / ticks;
    const cells = probe.depths().length;
    console.log(
      `  ${cells} cells, 8 species of which 6 are coupled: ${each.toFixed(2)} ms per one second tick`,
    );
    // Well over the bench's one millisecond budget for a full tick, which is
    // what the fidelity modes in phase 4 exist for. Recorded here so the
    // number is measured rather than assumed.
    expect(each).toBeLessThan(100);
  });

  it("draws its measurement noise from the stream it is handed", () => {
    const { probe, env } = settled(6);
    const rng = new Rng(31337);
    const noise = nanoampsToAmps(0.35);
    const first = raw(probe.measure(rng.stream("a"), env, noise));
    const again = raw(probe.measure(new Rng(31337).stream("a"), env, noise));
    console.log(
      `  same seed, same reading: ${(first * 1e9).toFixed(6)} and ${(again * 1e9).toFixed(6)} nA`,
    );
    expect(first).toBeCloseTo(again, 18);
    expect(raw(lactoneHydrolysisRate())).toBeCloseTo(Math.LN2 / raw(ENZ.lactoneHalfLife), 15);
    expect(raw(dissolvedOxygen(raw(ENV.peritonealOxygen)))).toBeGreaterThan(0);
    expect(raw(referenceDrift(0, raw(ENV.bodyTemperature)))).toBeCloseTo(0, 12);
  });
});
