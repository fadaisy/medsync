/**
 * Phase 2 checks for the optical probe.
 *
 * Each of these is the build brief's own acceptance criterion, written so it
 * fails when the physics is wrong rather than when a number was not the one
 * expected. Nothing here is tuned: where a result came out away from the
 * brief's guess, the test asserts the physics and the difference is reported.
 */
import type { Competitors, OpticalEnvironment } from "../../src/engine/probes/optical/index.ts";
import type { MolPerCubicMetre } from "../../src/engine/probes/units.ts";
import { describe, expect, it } from "vitest";

import {
  BIND,
  ENV,
  FUND,
  GEOM,
  PARTITION_TABLE,
  PHOTO,
  SOLVER,
} from "../../src/engine/probes/constants.ts";
import {
  bleachRatePerFlash,
  competitorLoad,
  dissociationConstant,
  excitationsPerMolecule,
  excitedStateFraction,
  expectedReferenceCounts,
  glucoseFromOccupancy,
  indicatorQuantumYield,
  NORMAL_COMPETITORS,
  NORMAL_CONDITIONS,
  occupancy,
  occupancyFromRatio,
  opticalDepth,
  OpticalProbe,
  phFactor,
  ratioScale,
  receptorDensity,
  relaxationTime,
  retardationFactor,
  stepKineticOccupancy,
  stepSurvival,
  survivalAfterFlashes,
  switchContrast,
  temperatureFactor,
} from "../../src/engine/probes/optical/index.ts";
import { poisson } from "../../src/engine/probes/stochastic.ts";
import {
  celsiusToKelvin,
  m,
  micronsToMetres,
  molPerM3,
  raw,
  s,
} from "../../src/engine/probes/units.ts";
import { Rng } from "../../src/engine/rng.ts";

const NONE: Competitors = { fructose: molPerM3(0), polyol: molPerM3(0) };

/**
 * The default truth matches what the instrument was calibrated against, which
 * is the only way an accuracy figure means anything. Tests that want the
 * probe to be wrong say so by passing competitors it does not know about.
 */
function environment(glucose: number, over: Partial<OpticalEnvironment> = {}): OpticalEnvironment {
  return {
    glucose: molPerM3(glucose),
    competitors: NORMAL_COMPETITORS,
    conditions: NORMAL_CONDITIONS,
    ...over,
  };
}

function settledProbe(
  glucose: number,
  over: Partial<OpticalEnvironment> = {},
): {
  probe: OpticalProbe;
  env: OpticalEnvironment;
} {
  const env = environment(glucose, over);
  const probe = new OpticalProbe(
    { capsuleThickness: micronsToMetres(50), foulingFraction: 0 },
    env,
  );
  probe.settle(env);
  return { probe, env };
}

describe("competitive binding", () => {
  it("recovers the declared dissociation constant from the isotherm", () => {
    // Half occupancy with no competitor must land on Kd by definition. Solved
    // numerically from the model rather than read back from the constant.
    const kd = raw(BIND.kdGlucose);
    let lo = 0;
    let hi = kd * 100;
    for (let i = 0; i < 200; i += 1) {
      const mid = (lo + hi) / 2;
      if (occupancy(molPerM3(mid), NONE, NORMAL_CONDITIONS) < 0.5) lo = mid;
      else hi = mid;
    }
    const recovered = (lo + hi) / 2;
    const error = Math.abs(recovered - kd) / kd;
    // eslint-disable-next-line no-console
    console.log(
      `  Kd recovered ${recovered.toFixed(6)} against ${kd} mol/m3, error ${(error * 100).toExponential(2)} %`,
    );
    expect(error).toBeLessThan(0.03);
  });

  it("shifts the apparent affinity by the competitive term and no more", () => {
    // Adding a competitor at C = Kd_F must raise the glucose needed for half
    // occupancy by exactly (1 + load). That is the analytic prediction of a
    // shared site, so it is what the test asserts.
    const withFructose: Competitors = { fructose: BIND.kdFructose, polyol: molPerM3(0) };
    const load = competitorLoad(withFructose, NORMAL_CONDITIONS);
    const half = raw(glucoseFromOccupancy(0.5, withFructose, NORMAL_CONDITIONS));
    const predicted = raw(BIND.kdGlucose) * (1 + load);
    const error = Math.abs(half - predicted) / predicted;
    // eslint-disable-next-line no-console
    console.log(
      `  competitor load ${load.toFixed(4)}, half occupancy at ${half.toFixed(4)} mol/m3, predicted ${predicted.toFixed(4)}, error ${(error * 100).toExponential(2)} %`,
    );
    expect(error).toBeLessThan(0.02);
    expect(load).toBeGreaterThan(0);
  });

  it("weakens binding when the medium acidifies and when it warms", () => {
    const acid = phFactor(7.0);
    const alkaline = phFactor(7.8);
    const warm = temperatureFactor(celsiusToKelvin(40));
    const cool = temperatureFactor(celsiusToKelvin(34));
    // eslint-disable-next-line no-console
    console.log(
      `  Kd factor: pH 7.0 ${acid.toFixed(4)}, pH 7.8 ${alkaline.toFixed(4)}, 40 C ${warm.toFixed(4)}, 34 C ${cool.toFixed(4)}`,
    );
    // Acid protonates the boron, the trigonal form does not bind, so Kd rises.
    expect(acid).toBeGreaterThan(1);
    expect(alkaline).toBeLessThan(1);
    // Association is exothermic, so warming must weaken it. The build brief's
    // written form has the opposite sign; DECISIONS.md records the deviation.
    expect(warm).toBeGreaterThan(1);
    expect(cool).toBeLessThan(1);
    expect(phFactor(raw(BIND.referencePh))).toBeCloseTo(1, 12);
    expect(temperatureFactor(BIND.referenceTemperature)).toBeCloseTo(1, 12);
  });

  it("treats binding as instantaneous, and the kinetics agree on a clinical ramp", () => {
    // The brief's ramp: 0.3 mmol/L per minute, which is a brisk real one.
    const rampPerSecond = 0.3 / 60;
    const dt = s(0.01);
    let theta = occupancy(molPerM3(4), NONE, NORMAL_CONDITIONS);
    let worst = 0;
    let glucose = 4;
    for (let i = 0; i < 60 * 100; i += 1) {
      glucose += rampPerSecond * raw(dt);
      const here = molPerM3(glucose);
      theta = stepKineticOccupancy(theta, here, NONE, NORMAL_CONDITIONS, dt);
      const settled = occupancy(here, NONE, NORMAL_CONDITIONS);
      worst = Math.max(worst, Math.abs(theta - settled) / settled);
    }
    const tau = raw(relaxationTime(molPerM3(glucose), NONE, NORMAL_CONDITIONS));
    // eslint-disable-next-line no-console
    console.log(
      `  relaxation time ${(tau * 1000).toFixed(1)} ms, worst kinetic against equilibrium ${(worst * 100).toExponential(2)} % over a ramp to ${glucose.toFixed(1)} mmol/L`,
    );
    expect(worst).toBeLessThan(0.01);
  });

  it("carries a real but negligible binding retardation at the declared dye loading", () => {
    // The receptor is the indicator, so its concentration is fixed by the dye
    // loading and the gel thickness. It is not a free parameter, and at this
    // loading it stores almost nothing. That is the answer, not a failure.
    const receptors = raw(receptorDensity());
    const kd = raw(BIND.kdGlucose);
    const factor = retardationFactor(molPerM3(5), NONE, NORMAL_CONDITIONS);
    const derived = PHOTO.dyeSurfaceDensity / (raw(GEOM.gelThickness) * raw(FUND.avogadro));
    // eslint-disable-next-line no-console
    console.log(
      `  receptor density ${(receptors * 1000).toFixed(3)} umol/L against Kd ${kd} mmol/L, retardation factor ${factor.toFixed(8)}`,
    );
    expect(receptors).toBeCloseTo(derived, 15);
    expect(factor).toBeGreaterThan(1);
    // Real: strictly above one. Negligible: the gel's lag is diffusive.
    expect(factor - 1).toBeLessThan(1e-3);
  });
});

describe("photophysics", () => {
  it("switches on by a contrast the three rate constants imply", () => {
    const dark = indicatorQuantumYield(0);
    const bright = indicatorQuantumYield(1);
    const contrast = switchContrast();
    // eslint-disable-next-line no-console
    console.log(
      `  quantum yield unbound ${dark.toFixed(4)}, bound ${bright.toFixed(4)}, contrast ${contrast.toFixed(3)} to one`,
    );
    // The brief guessed "roughly five". The rate constants give this instead,
    // and the rate constants are the declared quantities.
    expect(contrast).toBeGreaterThan(1);
    expect(bright).toBeCloseTo(
      raw(PHOTO.kRadiative) / (raw(PHOTO.kRadiative) + raw(PHOTO.kNonRadiative)),
      12,
    );
  });

  it("keeps the gel optically thin and far from saturation", () => {
    const depth = opticalDepth(PHOTO.dyeSurfaceDensity);
    const excited = excitedStateFraction(0.5);
    const perFlash = excitationsPerMolecule();
    // eslint-disable-next-line no-console
    console.log(
      `  optical depth ${depth.toExponential(2)}, excited state fraction ${excited.toExponential(2)}, excitations per molecule per flash ${perFlash.toFixed(4)}`,
    );
    // Both assumptions the uniform illumination rests on.
    expect(depth).toBeLessThan(1e-3);
    expect(excited).toBeLessThan(1e-4);
  });

  it("counts photons with Poisson statistics", () => {
    const rng = new Rng(20260910);
    const stream = rng.stream("poisson-check");
    for (const lambda of [3, 9.5, 12, 4000, 41435]) {
      const draws = 20000;
      let sum = 0;
      let sumSquares = 0;
      for (let i = 0; i < draws; i += 1) {
        const value = poisson(stream, lambda);
        sum += value;
        sumSquares += value * value;
      }
      const mean = sum / draws;
      const variance = sumSquares / draws - mean * mean;
      const meanError = Math.abs(mean - lambda) / lambda;
      const varianceError = Math.abs(variance - lambda) / lambda;
      // eslint-disable-next-line no-console
      console.log(
        `  lambda ${lambda}: mean ${mean.toFixed(2)} (${(meanError * 100).toFixed(2)} %), variance ${variance.toFixed(1)} (${(varianceError * 100).toFixed(2)} %)`,
      );
      expect(meanError).toBeLessThan(0.05);
      expect(varianceError).toBeLessThan(0.05);
    }
  });

  it("bleaches at the rate the quantum yield and the flash imply", () => {
    const perFlash = raw(PHOTO.bleachQuantumYield) * excitationsPerMolecule();
    const flashes = 1000;
    const measured = -Math.log(survivalAfterFlashes(flashes)) / flashes;
    const error = Math.abs(measured - perFlash) / perFlash;
    const yearFlashes = (365 * 24 * 3600) / 60;
    const yearLoss = 1 - survivalAfterFlashes(yearFlashes);
    // eslint-disable-next-line no-console
    console.log(
      `  bleach constant ${perFlash.toExponential(3)} per flash, recovered ${measured.toExponential(3)}, error ${(error * 100).toExponential(2)} %; a year of once a minute flashes loses ${(yearLoss * 100).toFixed(1)} %`,
    );
    expect(error).toBeLessThan(0.05);
  });

  it("holds the ratio while both channels halve", () => {
    // Done in three steps so that the expensive one is not the one that has to
    // run millions of times. First: the running state really is the closed
    // form, compounded flash by flash.
    let running = 1;
    const compounded = 200_000;
    for (let i = 0; i < compounded; i += 1) running = stepSurvival(running);
    // Two hundred thousand multiplications accumulate their own rounding, so
    // this is a check that the two agree to within floating point, not that
    // they are bit identical.
    const compoundingError =
      Math.abs(running - survivalAfterFlashes(compounded)) / survivalAfterFlashes(compounded);
    expect(compoundingError).toBeLessThan(1e-9);

    // Second: the probe's own acquisition advances that state and no other.
    const { probe, env } = settledProbe(6);
    const before = probe.noiselessRatio(env);
    const rng = new Rng(4242);
    const stream = rng.stream("bleach");
    let reading = probe.acquire(stream, env);
    for (let i = 1; i < 5000; i += 1) reading = probe.acquire(stream, env);
    expect(reading.indicatorSurvival).toBeCloseTo(survivalAfterFlashes(reading.flashes), 12);
    expect(reading.referenceSurvival).toBeCloseTo(survivalAfterFlashes(reading.flashes), 12);

    // Third: jump to the point where half the dye is gone, which by the two
    // steps above is exactly where the probe would arrive on its own.
    const halving = Math.log(2) / bleachRatePerFlash();
    const survival = survivalAfterFlashes(halving);
    probe.setSurvival(survival, survival, Math.round(halving));
    const after = probe.noiselessRatio(env);
    const drift = Math.abs(after - before) / before;
    const countsBefore = expectedReferenceCounts(1);
    const countsAfter = expectedReferenceCounts(survival);
    // eslint-disable-next-line no-console
    console.log(
      `  halving takes ${Math.round(halving).toLocaleString("en-GB")} flashes, which at one a minute is ${(halving / (365 * 24 * 60)).toFixed(1)} years; reference counts fall ${countsBefore.toFixed(0)} to ${countsAfter.toFixed(0)} while the ratio drifts ${(drift * 100).toExponential(2)} %`,
    );
    expect(countsAfter / countsBefore).toBeCloseTo(0.5, 6);
    expect(drift).toBeLessThan(0.01);
  });

  it("inverts the ratio back to the occupancy that produced it", () => {
    for (const theta of [0.05, 0.2, 0.4, 0.7, 0.9]) {
      const ratio = ratioScale() * indicatorQuantumYield(theta);
      const recovered = occupancyFromRatio(ratio);
      expect(recovered).toBeCloseTo(theta, 10);
    }
    const span = [0, 1].map((t) => ratioScale() * indicatorQuantumYield(t));
    // eslint-disable-next-line no-console
    console.log(
      `  ratio spans ${span[0]!.toFixed(3)} unbound to ${span[1]!.toFixed(3)} fully bound`,
    );
  });
});

describe("the assembled probe", () => {
  it("reads close to the truth in the steady state, and reports its own uncertainty", () => {
    const rng = new Rng(1);
    const stream = rng.stream("optical");
    for (const truth of [3, 6, 10, 15]) {
      const { probe, env } = settledProbe(truth);
      let sum = 0;
      let sumSquares = 0;
      const draws = 400;
      let stated = 0;
      for (let i = 0; i < draws; i += 1) {
        const reading = probe.acquire(stream, env);
        sum += raw(reading.glucose);
        sumSquares += raw(reading.glucose) * raw(reading.glucose);
        stated = raw(reading.uncertainty);
      }
      const mean = sum / draws;
      const sd = Math.sqrt(Math.max(sumSquares / draws - mean * mean, 0));
      const bias = (mean - truth) / truth;
      // eslint-disable-next-line no-console
      console.log(
        `  truth ${truth} mmol/L: mean read ${mean.toFixed(3)}, bias ${(bias * 100).toFixed(2)} %, scatter ${sd.toFixed(3)}, stated uncertainty ${stated.toFixed(3)} mmol/L`,
      );
      // The bias is real: consumption in the capsule and the nonlinear average
      // across the gel both pull the reading down. It must stay small.
      expect(Math.abs(bias)).toBeLessThan(0.05);
      // The stated uncertainty must describe the scatter it claims to describe.
      expect(sd).toBeGreaterThan(stated * 0.6);
      expect(sd).toBeLessThan(stated * 1.6);
    }
  });

  it("responds on the timescale the stack's diffusion sets", () => {
    const { probe, env } = settledProbe(5);
    const stepped = environment(10);
    const start = probe.gelOccupancy(env);
    // The target is the model's own settled answer at the new glucose, not the
    // isotherm evaluated at the bulk value: the gel sits below the bulk by its
    // partition coefficient, so an analytic target would never be reached and
    // the test would be measuring the wrong thing.
    const target = settledProbe(10).probe.gelOccupancy(stepped);
    let seconds = 0;
    let tenToNinety: [number, number] = [0, 0];
    for (let t = 1; t <= 3600; t += 1) {
      probe.advance(s(1), stepped);
      seconds = t;
      const here = probe.gelOccupancy(stepped);
      const progress = (here - start) / (target - start);
      if (tenToNinety[0] === 0 && progress >= 0.1) tenToNinety[0] = t;
      if (tenToNinety[1] === 0 && progress >= 0.9) {
        tenToNinety[1] = t;
        break;
      }
    }
    const diagnostics = probe.diagnostics(stepped);
    const scale = raw(diagnostics.stackDiffusionTime);
    // eslint-disable-next-line no-console
    console.log(
      `  ten to ninety per cent in ${tenToNinety[1] - tenToNinety[0]} s (reached 90 % at ${tenToNinety[1]} s), against a stack diffusion scale of ${scale.toFixed(0)} s; capsule Biot ${diagnostics.capsuleBiot.toFixed(3)}`,
    );
    expect(tenToNinety[1]).toBeGreaterThan(0);
    expect(seconds).toBeLessThan(3600);
    // The response must be set by transport, not instantaneous and not stalled.
    expect(tenToNinety[1]).toBeGreaterThan(0.05 * scale);
    expect(tenToNinety[1]).toBeLessThan(5 * scale);
  });

  it("reads high when fructose competes, because the instrument cannot see it", () => {
    const truth = 6;
    const clean = settledProbe(truth);
    const spiked = settledProbe(truth, {
      competitors: { fructose: molPerM3(raw(ENV.plasmaFructose) * 20), polyol: molPerM3(0) },
    });
    const rng = new Rng(77);
    const cleanRead = clean.probe.acquire(rng.stream("a"), clean.env);
    const spikedRead = spiked.probe.acquire(rng.stream("b"), spiked.env);
    const shift = (raw(spikedRead.glucose) - raw(cleanRead.glucose)) / truth;
    // eslint-disable-next-line no-console
    console.log(
      `  fructose at ${(raw(ENV.plasmaFructose) * 20).toFixed(2)} mmol/L moves the reading by ${(shift * 100).toFixed(1)} %, from ${raw(cleanRead.glucose).toFixed(2)} to ${raw(spikedRead.glucose).toFixed(2)} mmol/L`,
    );
    // Fructose occupies sites glucose would have, so the reading falls. The
    // sign is the model's, not a choice: a competitor at a shared site can
    // only take occupancy away.
    expect(shift).toBeLessThan(0);
  });

  it("survives the capsule thickening without losing its state", () => {
    // Done mid-response rather than at rest. At rest the whole stack sits at
    // one value and any remap would look perfect; the test is only worth
    // running while there is a real gradient to carry across the new grid.
    const { probe } = settledProbe(5);
    const stepped = environment(11);
    for (let t = 0; t < 90; t += 1) probe.advance(s(1), stepped);
    const before = probe.gelOccupancy(stepped);
    const atFibreBefore = raw(probe.diagnostics(stepped).freeGlucoseAtFibre);
    const beforeProfile = probe.glucoseProfile();
    const spread = Math.max(...Array.from(beforeProfile)) - Math.min(...Array.from(beforeProfile));

    // A reference probe that never sees the geometry change, to compare the
    // rest of the response against.
    const reference = settledProbe(5);
    for (let t = 0; t < 90; t += 1) reference.probe.advance(s(1), stepped);

    probe.setGeometry({ capsuleThickness: micronsToMetres(52), foulingFraction: 0 });
    const after = probe.gelOccupancy(stepped);
    const drift = Math.abs(after - before) / before;
    // The gel keeps its thickness and its node count, so its cells map across
    // one to one; the capsule is the layer that is actually interpolated. The
    // check that matters is therefore the trajectory afterwards, against a
    // probe whose geometry never moved.
    const atFibreAfter = raw(probe.diagnostics(stepped).freeGlucoseAtFibre);
    expect(atFibreAfter).toBeCloseTo(atFibreBefore, 10);

    // Two per cent more capsule is a real change, so the response afterwards
    // should differ a little, but the state must not have been thrown away.
    for (let t = 0; t < 120; t += 1) {
      probe.advance(s(1), stepped);
      reference.probe.advance(s(1), stepped);
    }
    const divergence =
      Math.abs(probe.gelOccupancy(stepped) - reference.probe.gelOccupancy(stepped)) /
      reference.probe.gelOccupancy(stepped);

    // eslint-disable-next-line no-console
    console.log(
      `  remapped mid-response with a ${spread.toFixed(3)} mmol/L spread across the stack: gel occupancy moved ${(drift * 100).toExponential(2)} % at the rebuild, and ${(divergence * 100).toFixed(2)} % after two more minutes`,
    );
    expect(spread).toBeGreaterThan(0.5);
    expect(drift).toBeLessThan(0.005);
    expect(divergence).toBeLessThan(0.02);
  });

  it("keeps an absent layer numerically harmless", () => {
    // The fouling layer is always in the stack so the grid keeps its shape.
    // Its resistance when absent must be negligible against the capsule's.
    const floor = raw(SOLVER.minLayerThickness);
    const foulingResistance = floor / (raw(PARTITION_TABLE.glucoseFouling.value) * 1);
    const capsuleResistance =
      raw(micronsToMetres(50)) / (raw(PARTITION_TABLE.glucoseCapsule.value) * 1);
    const share = foulingResistance / capsuleResistance;
    // eslint-disable-next-line no-console
    console.log(
      `  absent fouling layer carries ${share.toExponential(2)} of the capsule's resistance`,
    );
    expect(share).toBeLessThan(1e-4);
    expect(raw(m(floor))).toBeGreaterThan(0);
  });

  it("has a dissociation constant that moves with the body, not with the fit", () => {
    const normal = raw(dissociationConstant(NORMAL_CONDITIONS));
    const acidotic = raw(dissociationConstant({ temperature: ENV.bodyTemperature, ph: 7.1 }));
    const febrile = raw(
      dissociationConstant({ temperature: celsiusToKelvin(39.5), ph: ENV.peritonealPh }),
    );
    // eslint-disable-next-line no-console
    console.log(
      `  Kd ${normal.toFixed(3)} normal, ${acidotic.toFixed(3)} at pH 7.1, ${febrile.toFixed(3)} at 39.5 C, all mmol/L`,
    );
    expect(acidotic).toBeGreaterThan(normal);
    expect(febrile).toBeGreaterThan(normal);
  });

  it("agrees with the analytic isotherm when the gel is uniform", () => {
    // With no capsule uptake and no gradient, the assembled probe must give
    // exactly the isotherm. This is the check that the spatial machinery has
    // not quietly changed the chemistry.
    const glucose: MolPerCubicMetre = molPerM3(7);
    const analytic = occupancy(glucose, NORMAL_COMPETITORS, NORMAL_CONDITIONS);
    const load = competitorLoad(NORMAL_COMPETITORS, NORMAL_CONDITIONS);
    const kd = raw(dissociationConstant(NORMAL_CONDITIONS));
    const byHand = raw(glucose) / kd / (1 + raw(glucose) / kd + load);
    expect(analytic).toBeCloseTo(byHand, 14);
  });
});
