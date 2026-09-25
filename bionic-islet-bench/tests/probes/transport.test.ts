import type { Boundaries, StackSpec } from "../../src/engine/probes/transport.ts";
import { describe, expect, it } from "vitest";

import { DIFF, ENZ, GEOM, PART, SOLVER } from "../../src/engine/probes/constants.ts";
import {
  biotNumber,
  diffusionTime,
  effectivenessFactor,
  permeabilityRatio,
  thieleModulus,
} from "../../src/engine/probes/dimensionless.ts";
import {
  buildGrid,
  concentrationAt,
  innerFlux,
  inventory,
  outerFlux,
  profile,
  step,
  uniformField,
} from "../../src/engine/probes/transport.ts";
import {
  diffusivity,
  m,
  micronsToMetres,
  molPerM3,
  permeabilityMs,
  perSecond,
  raw,
  s,
} from "../../src/engine/probes/units.ts";

/* eslint-disable no-console */

const G = "glucose";

/**
 * A single slab, so the answer is analytic: at steady state the flux through
 * a series of resistances is the driving concentration over the sum of the
 * resistances, and each resistance is thickness over permeability.
 */
function singleSlab(thicknessUm: number, d: number): StackSpec {
  return {
    species: [G],
    layers: [
      {
        name: "slab",
        thickness: micronsToMetres(thicknessUm),
        diffusivity: { [G]: diffusivity(d) },
      },
    ],
  };
}

describe("transport solver against analytic solutions", () => {
  it("steady-state flux through one slab matches D C0 / L", () => {
    const L = 100e-6;
    const D = 5e-10;
    const C0 = 8;
    const spec = singleSlab(100, D);
    const grid = buildGrid(spec);
    // A very fast surface sink makes the inner face a perfect sink, so the
    // analytic answer is the plain slab result.
    const kSink = 1e-1;
    const boundaries: Boundaries = {
      outer: { [G]: molPerM3(C0) },
      inner: { [G]: { kind: "surface-sink", k: permeabilityMs(kSink) } },
    };
    const field = uniformField(grid, boundaries);
    const solved = step(grid, field, boundaries, null);
    expect(solved.converged).toBe(true);

    const numerical = innerFlux(grid, solved.field, G, boundaries.inner[G]!);
    // Series: the slab itself plus the surface reaction.
    const analytic = C0 / (L / D + 1 / kSink);
    const error = Math.abs(numerical - analytic) / analytic;
    console.log(
      `  one slab: numerical ${numerical.toExponential(6)}, analytic ${analytic.toExponential(6)} mol/(m2 s), error ${(error * 100).toExponential(2)} %`,
    );
    expect(error).toBeLessThan(0.01);
  });

  it("steady-state flux through a three-layer stack matches the series resistance", () => {
    const layers = [
      { name: "fluid", L: 30e-6, D: 9.2e-10, K: 1 },
      { name: "capsule", L: 80e-6, D: 2.0e-10, K: 0.8 },
      { name: "membrane", L: 25e-6, D: 3.0e-13, K: 0.15 },
    ];
    const spec: StackSpec = {
      species: [G],
      layers: layers.map((l) => ({
        name: l.name,
        thickness: m(l.L),
        diffusivity: { [G]: diffusivity(l.D) },
        partition: { [G]: l.K },
      })),
    };
    const grid = buildGrid(spec);
    const C0 = 6;
    const kSink = 1;
    const boundaries: Boundaries = {
      outer: { [G]: molPerM3(C0) },
      inner: { [G]: { kind: "surface-sink", k: permeabilityMs(kSink) } },
    };
    const solved = step(grid, uniformField(grid, boundaries), boundaries, null);
    const numerical = innerFlux(grid, solved.field, G, boundaries.inner[G]!);

    // Resistance of each layer is L/(D K); the sink adds 1/(k K_last).
    let resistance = 0;
    for (const l of layers) resistance += l.L / (l.D * l.K);
    resistance += 1 / (kSink * layers[2]!.K);
    const analytic = C0 / resistance;

    const error = Math.abs(numerical - analytic) / analytic;
    console.log(
      `  three layers: numerical ${numerical.toExponential(6)}, analytic ${analytic.toExponential(6)}, error ${(error * 100).toExponential(2)} %`,
    );
    expect(error).toBeLessThan(0.01);
  });

  it("a transient step matches the erfc half-space solution", () => {
    // A thick slab, sampled early enough that the far face has not been felt,
    // is a half space: C(x,t) = C0 erfc( x / (2 sqrt(D t)) ).
    const D = 9.2e-10;
    const C0 = 10;
    const spec: StackSpec = {
      species: [G],
      layers: [{ name: "slab", thickness: m(2000e-6), diffusivity: { [G]: diffusivity(D) } }],
      nodesPerLayer: 400,
    };
    const grid = buildGrid(spec);
    const boundaries: Boundaries = {
      outer: { [G]: molPerM3(C0) },
      inner: { [G]: { kind: "no-flux" } },
    };
    let field = grid.species.map(() => new Float64Array(grid.nCells));

    const tEnd = 60;
    const dt = 0.05;
    for (let t = 0; t < tEnd; t += dt) {
      field = step(grid, field, boundaries, s(dt)).field;
    }

    const numeric = profile(grid, field, G);
    let worst = 0;
    let checked = 0;
    for (let c = 0; c < grid.nCells; c += 1) {
      const x = grid.x[c]!;
      const eta = x / (2 * Math.sqrt(D * tEnd));
      if (eta > 2.2) break; // beyond here the analytic value is ~0 and relative error is meaningless
      const analytic = C0 * erfc(eta);
      if (analytic < 0.05 * C0) continue;
      worst = Math.max(worst, Math.abs(numeric[c]! - analytic) / analytic);
      checked += 1;
    }
    console.log(
      `  erfc comparison over ${checked} nodes: worst relative error ${(worst * 100).toFixed(3)} %`,
    );
    expect(checked).toBeGreaterThan(20);
    expect(worst).toBeLessThan(0.01);
  });
});

describe("interface behaviour", () => {
  it("concentration jumps by the partition ratio while the potential stays continuous", () => {
    const kLeft = 1;
    const kRight = 0.25;
    const spec: StackSpec = {
      species: [G],
      layers: [
        {
          name: "left",
          thickness: micronsToMetres(50),
          diffusivity: { [G]: diffusivity(5e-10) },
          partition: { [G]: kLeft },
        },
        {
          name: "right",
          thickness: micronsToMetres(50),
          diffusivity: { [G]: diffusivity(5e-10) },
          partition: { [G]: kRight },
        },
      ],
      nodesPerLayer: 200,
    };
    const grid = buildGrid(spec);
    const boundaries: Boundaries = {
      outer: { [G]: molPerM3(5) },
      inner: { [G]: { kind: "surface-sink", k: permeabilityMs(1e-3) } },
    };
    const solved = step(grid, uniformField(grid, boundaries), boundaries, null);

    const lastLeft = 199;
    const firstRight = 200;
    const cLeft = concentrationAt(grid, solved.field, G, lastLeft);
    const cRight = concentrationAt(grid, solved.field, G, firstRight);
    const uLeft = solved.field[0]![lastLeft]!;
    const uRight = solved.field[0]![firstRight]!;

    console.log(
      `  at the interface: C jumps ${cLeft.toFixed(4)} -> ${cRight.toFixed(4)} mol/m3 (ratio ${(cRight / cLeft).toFixed(4)}, expected ${(kRight / kLeft).toFixed(4)}); u ${uLeft.toFixed(4)} -> ${uRight.toFixed(4)}`,
    );

    // The concentration jump is the partition ratio.
    expect(cRight / cLeft).toBeCloseTo(kRight / kLeft, 2);

    // The physical requirement at an interface is that flux is continuous,
    // not that adjacent cell-centre values are close: the two half-cells have
    // different permeabilities, so the drop in u between their centres is
    // larger there than inside either layer, and that is correct.
    //
    // At steady state with no reaction the flux must be the same through
    // every face in the stack, interfaces included.
    const fluxes: number[] = [];
    for (let f = 1; f < grid.nCells; f += 1) {
      fluxes.push(grid.G[0]![f]! * (solved.field[0]![f - 1]! - solved.field[0]![f]!));
    }
    const mean = fluxes.reduce((a, b) => a + b, 0) / fluxes.length;
    let worst = 0;
    for (const f of fluxes) worst = Math.max(worst, Math.abs(f - mean) / Math.abs(mean));
    console.log(
      `  flux through every face: mean ${mean.toExponential(6)} mol/(m2 s), worst deviation ${worst.toExponential(2)}`,
    );
    expect(worst).toBeLessThan(1e-9);
  });
});

describe("conservation and convergence", () => {
  it("closes mass balance to better than one part in a billion", () => {
    const spec: StackSpec = {
      species: [G],
      layers: [
        { name: "a", thickness: micronsToMetres(40), diffusivity: { [G]: diffusivity(8e-10) } },
        {
          name: "b",
          thickness: micronsToMetres(60),
          diffusivity: { [G]: diffusivity(2e-10) },
          partition: { [G]: 0.5 },
        },
      ],
    };
    const grid = buildGrid(spec);
    const boundaries: Boundaries = {
      outer: { [G]: molPerM3(7) },
      inner: { [G]: { kind: "surface-sink", k: permeabilityMs(5e-5) } },
    };
    let field = grid.species.map(() => new Float64Array(grid.nCells));

    let worst = 0;
    const dt = 0.5;
    for (let n = 0; n < 200; n += 1) {
      const before = inventory(grid, field, G);
      const next = step(grid, field, boundaries, s(dt)).field;
      const after = inventory(grid, next, G);
      // Backward Euler: the fluxes that balance are the ones at the end of
      // the step, which is where the scheme evaluates them.
      const jIn = outerFlux(grid, next, G, boundaries);
      const jOut = innerFlux(grid, next, G, boundaries.inner[G]!);
      const predicted = before + (jIn - jOut) * dt;
      const scale = Math.max(Math.abs(after), 1e-12);
      worst = Math.max(worst, Math.abs(after - predicted) / scale);
      field = next;
    }
    console.log(
      `  mass balance: worst relative closure error ${worst.toExponential(3)} over 200 steps`,
    );
    expect(worst).toBeLessThan(SOLVER.massBalanceTolerance);
  });

  it("never produces a negative concentration", () => {
    const spec: StackSpec = {
      species: [G],
      layers: [
        { name: "slab", thickness: micronsToMetres(100), diffusivity: { [G]: diffusivity(4e-10) } },
      ],
    };
    const grid = buildGrid(spec);
    const boundaries: Boundaries = {
      outer: { [G]: molPerM3(0) },
      inner: { [G]: { kind: "surface-sink", k: permeabilityMs(1e-2) } },
    };
    // Start full, then drain hard through the sink with a large timestep.
    let field = grid.species.map(() => {
      const a = new Float64Array(grid.nCells);
      a.fill(12);
      return a;
    });
    for (let n = 0; n < 50; n += 1) {
      field = step(grid, field, boundaries, s(5)).field;
      for (let c = 0; c < grid.nCells; c += 1) expect(field[0]![c]!).toBeGreaterThanOrEqual(0);
    }
  });

  it("is grid independent: halving the node count moves the flux by under one per cent", () => {
    const make = (nodes: number) =>
      buildGrid({
        species: [G],
        layers: [
          {
            name: "fluid",
            thickness: micronsToMetres(30),
            diffusivity: { [G]: diffusivity(9.2e-10) },
          },
          {
            name: "capsule",
            thickness: micronsToMetres(90),
            diffusivity: { [G]: diffusivity(2e-10) },
            partition: { [G]: 0.8 },
          },
          {
            name: "membrane",
            thickness: micronsToMetres(25),
            diffusivity: { [G]: diffusivity(3e-13) },
            partition: { [G]: 0.15 },
          },
        ],
        nodesPerLayer: nodes,
      });
    const boundaries: Boundaries = {
      outer: { [G]: molPerM3(6) },
      inner: { [G]: { kind: "surface-sink", k: permeabilityMs(1e-3) } },
    };
    const fluxAt = (nodes: number) => {
      const grid = make(nodes);
      const solved = step(grid, uniformField(grid, boundaries), boundaries, null);
      return innerFlux(grid, solved.field, G, boundaries.inner[G]!);
    };
    const coarse = fluxAt(24);
    const fine = fluxAt(48);
    const change = Math.abs(fine - coarse) / fine;
    console.log(
      `  grid independence: 24 nodes ${coarse.toExponential(6)}, 48 nodes ${fine.toExponential(6)}, change ${(change * 100).toExponential(2)} %`,
    );
    expect(change).toBeLessThan(0.01);
  });

  it("solves fast enough for the bench", () => {
    const grid = buildGrid({
      species: [G, "oxygen", "peroxide"],
      layers: [
        {
          name: "fluid",
          thickness: micronsToMetres(30),
          diffusivity: {
            [G]: diffusivity(9.2e-10),
            oxygen: diffusivity(3e-9),
            peroxide: diffusivity(1.7e-9),
          },
        },
        {
          name: "capsule",
          thickness: micronsToMetres(90),
          diffusivity: {
            [G]: diffusivity(2e-10),
            oxygen: diffusivity(1e-9),
            peroxide: diffusivity(1e-9),
          },
        },
        {
          name: "membrane",
          thickness: micronsToMetres(25),
          diffusivity: {
            [G]: diffusivity(3e-13),
            oxygen: diffusivity(1.2e-10),
            peroxide: diffusivity(2e-12),
          },
        },
        {
          name: "enzyme",
          thickness: micronsToMetres(8),
          diffusivity: {
            [G]: diffusivity(3e-10),
            oxygen: diffusivity(1.8e-9),
            peroxide: diffusivity(1e-9),
          },
        },
        {
          name: "inner",
          thickness: micronsToMetres(1),
          diffusivity: {
            [G]: diffusivity(1e-12),
            oxygen: diffusivity(5e-10),
            peroxide: diffusivity(1.2e-10),
          },
        },
      ],
    });
    const boundaries: Boundaries = {
      outer: { [G]: molPerM3(6), oxygen: molPerM3(0.055), peroxide: molPerM3(0) },
      inner: {
        [G]: { kind: "no-flux" },
        oxygen: { kind: "no-flux" },
        peroxide: { kind: "surface-sink", k: permeabilityMs(6e-5) },
      },
    };
    let field = uniformField(grid, boundaries);
    const started = performance.now();
    const steps = 60;
    for (let n = 0; n < steps; n += 1) field = step(grid, field, boundaries, s(1)).field;
    const elapsed = performance.now() - started;
    console.log(
      `  timing: ${grid.nCells} cells, 3 species, ${(elapsed / steps).toFixed(3)} ms per one second tick (linear, no reaction)`,
    );
    expect(elapsed / steps).toBeLessThan(20);
  });
});

describe("dimensionless groups", () => {
  it("computes the four groups and their limiting behaviour", () => {
    // Every input comes from the constants table, so these numbers describe
    // the design as declared and cannot drift away from it unnoticed.
    const pseudoFirstOrder = perSecond(
      (raw(ENZ.kCat) * raw(ENZ.enzymeLoading)) / raw(ENZ.kmGlucose),
    );
    const thiele = thieleModulus(
      GEOM.enzymeLayerThickness,
      pseudoFirstOrder,
      DIFF.glucoseEnzymeLayer,
    );
    const eta = effectivenessFactor(thiele);
    const ratio = permeabilityRatio(
      DIFF.oxygenOuterMembrane,
      raw(PART.oxygenOuterMembrane),
      DIFF.glucoseOuterMembrane,
      raw(PART.glucoseOuterMembrane),
    );
    const biot = biotNumber(
      DIFF.glucoseCapsule,
      micronsToMetres(90),
      DIFF.glucoseGel,
      GEOM.gelThickness,
    );
    const tDiff = diffusionTime(GEOM.gelThickness, DIFF.glucoseGel);

    console.log(`  Thiele modulus (enzyme layer)        ${thiele.toFixed(3)}`);
    console.log(`  effectiveness factor                 ${eta.toFixed(3)}`);
    console.log(`  permeability ratio O2 over glucose   ${ratio.toFixed(0)} to 1`);
    console.log(`  Biot number (capsule vs gel)         ${biot.toFixed(3)}`);
    console.log(`  gel diffusion time L^2/2D            ${tDiff.toFixed(1)} s`);

    // The enzyme layer as specified comes out mildly diffusion limited: a
    // Thiele modulus of about 1.3 and an effectiveness factor of about 0.65,
    // meaning roughly two thirds of the loaded enzyme is doing useful work
    // at low glucose. That is a normal design point rather than a fault, and
    // it is the worst case: as glucose rises the reaction saturates, the
    // effective first-order rate falls and the modulus falls with it.
    //
    // These bounds are deliberately the ones that are true of the model as
    // built. Tightening the layer to force the modulus below 1 would be
    // tuning the physics to satisfy a test.
    expect(thiele).toBeGreaterThan(0.3);
    expect(thiele).toBeLessThan(3);
    expect(eta).toBeGreaterThan(0.5);
    expect(eta).toBeLessThan(1);
    // The membrane must favour oxygen by two to three orders of magnitude.
    expect(ratio).toBeGreaterThan(100);
    expect(ratio).toBeLessThan(10000);
    // Limits.
    expect(effectivenessFactor(0)).toBeCloseTo(1, 6);
    expect(effectivenessFactor(50)).toBeCloseTo(1 / 50, 3);
  });
});

describe("the Newton path against the linear path", () => {
  /**
   * These two tests exist because the Newton path had a sign error in the
   * off-diagonal blocks of its Jacobian, and none of the checks above found
   * it: every one of them either ran through the linear path or happened to
   * stop after a single iteration, where a wrong Jacobian still lands close
   * enough to pass a loose tolerance. What follows compares the Newton path
   * against something that already has an answer, which is what a check of a
   * solver is supposed to do.
   */

  const stack: StackSpec = {
    species: [G],
    layers: [
      { name: "a", thickness: micronsToMetres(40), diffusivity: { [G]: diffusivity(6e-10) } },
      {
        name: "b",
        thickness: micronsToMetres(60),
        diffusivity: { [G]: diffusivity(2e-10) },
        partition: { [G]: 0.5 },
      },
    ],
  };

  it("gives the same transient as the linear path when the reaction is zero", () => {
    // A zero reaction term forces the same problem down both paths. They must
    // agree to machine precision, because they are discretising the same
    // equation. Any disagreement is a defect in one of the two Jacobians.
    const grid = buildGrid(stack);
    const boundaries: Boundaries = {
      outer: { [G]: molPerM3(8) },
      inner: { [G]: { kind: "no-flux" } },
    };
    const start = uniformField(grid, { ...boundaries, outer: { [G]: molPerM3(1) } });

    let linear = start.map((a) => Float64Array.from(a));
    let newton = start.map((a) => Float64Array.from(a));
    const zeroReaction = (_cell: number, _c: Float64Array, out: Float64Array): void => {
      out[0] = 0;
    };

    let worst = 0;
    for (let i = 0; i < 40; i += 1) {
      linear = step(grid, linear, boundaries, s(1)).field;
      newton = step(grid, newton, boundaries, s(1), {
        reacting: [G],
        reaction: zeroReaction,
      }).field;
      for (let c = 0; c < grid.nCells; c += 1) {
        const scale = Math.max(Math.abs(linear[0]![c]!), 1e-12);
        worst = Math.max(worst, Math.abs(newton[0]![c]! - linear[0]![c]!) / scale);
      }
    }
    console.log(
      `  Newton against linear over 40 steps: worst relative difference ${worst.toExponential(2)}`,
    );
    expect(worst).toBeLessThan(1e-12);
  });

  it("matches the analytic first-order decay slab", () => {
    // Steady state of D C'' = k C on a slab with a fixed outer concentration
    // and a sealed inner face is C0 cosh(m(L - x)) / cosh(mL), m = sqrt(k/D),
    // and the flux entering is D C0 m tanh(mL). The reaction is linear, so a
    // correct Newton solves it exactly; a wrong Jacobian does not.
    const D = 5e-10;
    const k = 0.02;
    const L = raw(micronsToMetres(80));
    const C0 = 6;
    const grid = buildGrid({
      species: [G],
      layers: [{ name: "slab", thickness: m(L), diffusivity: { [G]: diffusivity(D) } }],
      nodesPerLayer: 60,
    });
    const boundaries: Boundaries = {
      outer: { [G]: molPerM3(C0) },
      inner: { [G]: { kind: "no-flux" } },
    };
    const decay = (_cell: number, c: Float64Array, out: Float64Array): void => {
      out[0] = -k * c[0]!;
    };
    // Start far from the answer so the solve has real work to do.
    const field = uniformField(grid, { ...boundaries, outer: { [G]: molPerM3(0) } });
    const solved = step(grid, field, boundaries, null, { reacting: [G], reaction: decay });
    expect(solved.converged).toBe(true);

    const mm = Math.sqrt(k / D);
    const analyticFlux = D * C0 * mm * Math.tanh(mm * L);
    const numericalFlux = outerFlux(grid, solved.field, G, boundaries);
    const fluxError = Math.abs(numericalFlux - analyticFlux) / analyticFlux;

    const shape = profile(grid, solved.field, G);
    let worstProfile = 0;
    for (let c = 0; c < grid.nCells; c += 1) {
      const x = grid.x[c]!;
      const analytic = (C0 * Math.cosh(mm * (L - x))) / Math.cosh(mm * L);
      worstProfile = Math.max(worstProfile, Math.abs(shape[c]! - analytic) / analytic);
    }

    console.log(
      `  first-order slab: flux ${numericalFlux.toExponential(6)} against ${analyticFlux.toExponential(6)}, error ${(fluxError * 100).toExponential(2)} %; worst profile error ${(worstProfile * 100).toExponential(2)} %`,
    );
    // Second-order accurate in space, so the residual error is discretisation
    // and not the solve. One part in ten thousand over sixty nodes.
    expect(fluxError).toBeLessThan(1e-4);
    expect(worstProfile).toBeLessThan(1e-4);
  });

  it("converges quadratically on a saturating reaction", () => {
    // Michaelis-Menten has no closed form here, so what is checked is that
    // Newton behaves like Newton: the update collapses towards machine
    // precision rather than wandering. A wrong Jacobian gives a fixed-point
    // iteration at best and divergence at worst.
    const grid = buildGrid(stack);
    const boundaries: Boundaries = {
      outer: { [G]: molPerM3(8) },
      inner: { [G]: { kind: "no-flux" } },
    };
    const vmax = 0.05;
    const km = 2;
    const saturating = (_cell: number, c: Float64Array, out: Float64Array): void => {
      out[0] = (-vmax * c[0]!) / (km + c[0]!);
    };
    const field = uniformField(grid, { ...boundaries, outer: { [G]: molPerM3(0.5) } });
    const result = step(grid, field, boundaries, s(1), { reacting: [G], reaction: saturating });
    console.log(
      `  saturating reaction: ${result.iterations} Newton iterations in ${result.substeps} substep(s), converged ${result.converged}`,
    );
    expect(result.converged).toBe(true);
    // A correct Jacobian gets there in a handful of iterations from a start
    // an order of magnitude away.
    expect(result.iterations).toBeLessThan(8);
  });
});

/** Complementary error function, Abramowitz and Stegun 7.1.26. */
function erfc(x: number): number {
  const z = Math.abs(x);
  const t = 1 / (1 + 0.5 * z);
  const ans =
    t *
    Math.exp(
      -z * z -
        1.26551223 +
        t *
          (1.00002368 +
            t *
              (0.37409196 +
                t *
                  (0.09678418 +
                    t *
                      (-0.18628806 +
                        t *
                          (0.27886807 +
                            t *
                              (-1.13520398 +
                                t * (1.48851587 + t * (-0.82215223 + t * 0.17087277)))))))),
    );
  return x >= 0 ? ans : 2 - ans;
}

void raw;
