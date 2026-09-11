/**
 * The optical probe, assembled.
 *
 * Glucose crosses four films to reach the sensing gel: the unstirred fluid at
 * the probe surface, whatever protein has adsorbed onto it, the fibrous
 * capsule the body has grown around it, and then the gel itself. Inside the
 * gel it binds a boronic acid receptor that is also a fluorophore, and a
 * flash of violet light asks how many of those receptors are occupied.
 *
 * Nothing here is a transfer function. The transport is the finite-volume
 * solver from `transport.ts`, the binding is a competitive isotherm, the
 * light is a rate competition and a photon budget, and the reading is the
 * ratio of two Poisson counts inverted through the same chemistry that
 * produced it. The lag, the fructose error, the acidosis error and the
 * counting noise are all consequences rather than terms.
 *
 * ## What the illumination assumes, and why it is allowed
 *
 * The excitation is taken as uniform through the gel. That is only legitimate
 * because the gel is optically thin: at the declared dye loading the optical
 * depth is about three parts in a hundred thousand, so the far face of the
 * gel sees the same flash as the near one. `diagnostics()` reports it and a
 * test refuses to let it drift.
 *
 * The consequence is that the indicator signal is the dye-weighted average of
 * the **quantum yield** across the gel, not the quantum yield of the average
 * glucose. Those differ whenever there is a gradient, because the switch is
 * nonlinear, and the model carries the difference rather than flattening it.
 *
 * ## What is deliberately held uniform
 *
 * Fructose and any infused polyol are held at their bulk concentration
 * everywhere in the stack instead of being transported. They move on the
 * timescale of an hour and the stack equilibrates in a few minutes, so the
 * error is small; `diagnostics()` reports both timescales so the claim can be
 * checked rather than believed.
 */

import type { Stream } from "../../rng.ts";
import type {
  Boundaries,
  Field,
  Grid,
  LayerSpec,
  ReactionTerm,
  StorageTerm,
} from "../transport.ts";
import type { Metres, MolPerCubicMetre, Seconds } from "../units.ts";
import type { BindingConditions, Competitors } from "./binding.ts";

import { DIFF, ENV, GEOM, PART, PHOTO, SOLVER } from "../constants.ts";
import { biotNumber, diffusionTime } from "../dimensionless.ts";
import {
  buildGrid,
  concentrationAt,
  profile,
  remapField,
  step,
  uniformField,
} from "../transport.ts";
import { m, molPerM3, raw, s } from "../units.ts";
import {
  competitorLoad,
  dissociationConstant,
  glucoseFromOccupancy,
  heldGlucose,
  NORMAL_COMPETITORS,
  NORMAL_CONDITIONS,
  occupancy,
  receptorDensity,
  relaxationTime,
  retardationFactor,
  totalOccupancy,
} from "./binding.ts";
import {
  countVariance,
  darkCorrect,
  drawCounts,
  excitedStateFraction,
  expectedReferenceCounts,
  indicatorCountsFromYield,
  indicatorQuantumYield,
  occupancyFromRatio,
  occupancySensitivityToRatio,
  opticalDepth,
  ratioScale,
  stepSurvival,
  switchContrast,
} from "./photophysics.ts";

const GLUCOSE = "glucose";

/** The layer names, in order from the fluid inwards. Used by the lens view. */
export const OPTICAL_LAYERS = ["boundary", "fouling", "capsule", "gel"] as const;
export type OpticalLayerName = (typeof OPTICAL_LAYERS)[number];

/** The parts of the geometry the body changes over time. */
export type OpticalGeometry = {
  /** Fibrous capsule thickness, which grows for months after implant. */
  readonly capsuleThickness: Metres;
  /** Protein fouling, 0 for a clean probe and 1 for a fully fouled one. */
  readonly foulingFraction: number;
};

/** The chemistry outside the probe. */
export type OpticalEnvironment = {
  readonly glucose: MolPerCubicMetre;
  readonly competitors: Competitors;
  readonly conditions: BindingConditions;
};

export type OpticalReading = {
  /** Raw counts, dark and read noise included, as the detector delivers them. */
  readonly indicatorCounts: number;
  readonly referenceCounts: number;
  /** Dark-corrected ratio, the only quantity the inversion uses. */
  readonly ratio: number;
  /** Occupancy the instrument infers, which is not the true gel occupancy. */
  readonly inferredOccupancy: number;
  /** Glucose the instrument reports, mol/m3, which is 1 mmol/L per unit. */
  readonly glucose: MolPerCubicMetre;
  /** One standard deviation on that reading from counting statistics alone. */
  readonly uncertainty: MolPerCubicMetre;
  readonly indicatorSurvival: number;
  readonly referenceSurvival: number;
  readonly flashes: number;
};

export type OpticalDiagnostics = {
  /** What the light sees: every occupied site, whatever is in it. */
  readonly gelOccupancy: number;
  /** What the glucose alone is doing. The gap is the polyol error. */
  readonly glucoseOccupancy: number;
  readonly freeGlucoseAtFibre: MolPerCubicMetre;
  readonly retardationFactor: number;
  readonly receptorDensity: MolPerCubicMetre;
  readonly dissociationConstant: MolPerCubicMetre;
  readonly competitorLoad: number;
  readonly switchContrast: number;
  readonly opticalDepth: number;
  readonly excitedStateFraction: number;
  readonly bindingRelaxation: Seconds;
  readonly stackDiffusionTime: Seconds;
  readonly capsuleBiot: number;
  readonly stackThickness: Metres;
};

export type OpticalProbeOptions = {
  /** Competitors the instrument was calibrated against, not the true ones. */
  readonly calibrationCompetitors?: Competitors;
  readonly calibrationConditions?: BindingConditions;
  readonly nodesPerLayer?: number;
};

/** Layer thickness that keeps an absent layer in the stack without distorting it. */
function atLeastMinimum(thickness: number): Metres {
  return m(Math.max(thickness, raw(SOLVER.minLayerThickness)));
}

function layersFor(geometry: OpticalGeometry): LayerSpec[] {
  return [
    {
      name: "boundary",
      thickness: GEOM.boundaryLayer,
      diffusivity: { [GLUCOSE]: DIFF.glucoseWater },
    },
    {
      name: "fouling",
      thickness: atLeastMinimum(geometry.foulingFraction * raw(GEOM.foulingThicknessMax)),
      diffusivity: { [GLUCOSE]: DIFF.glucoseFouling },
      partition: { [GLUCOSE]: raw(PART.glucoseFouling) },
    },
    {
      name: "capsule",
      thickness: atLeastMinimum(raw(geometry.capsuleThickness)),
      diffusivity: { [GLUCOSE]: DIFF.glucoseCapsule },
      partition: { [GLUCOSE]: raw(PART.glucoseCapsule) },
    },
    {
      name: "gel",
      thickness: GEOM.gelThickness,
      diffusivity: { [GLUCOSE]: DIFF.glucoseGel },
      partition: { [GLUCOSE]: raw(PART.glucoseGel) },
    },
  ];
}

const GEL_LAYER = OPTICAL_LAYERS.indexOf("gel");
const CAPSULE_LAYER = OPTICAL_LAYERS.indexOf("capsule");

export class OpticalProbe {
  private grid: Grid;
  private field: Field;
  private geometry: OpticalGeometry;
  private readonly nodesPerLayer: number | undefined;
  private readonly calibrationCompetitors: Competitors;
  private readonly calibrationConditions: BindingConditions;

  /** Surviving fraction of each dye population. Both start whole. */
  private indicatorSurvival = 1;
  private referenceSurvival = 1;
  private flashes = 0;

  constructor(
    geometry: OpticalGeometry,
    environment: OpticalEnvironment,
    options: OpticalProbeOptions = {},
  ) {
    this.geometry = geometry;
    this.nodesPerLayer = options.nodesPerLayer;
    this.calibrationCompetitors = options.calibrationCompetitors ?? NORMAL_COMPETITORS;
    this.calibrationConditions = options.calibrationConditions ?? NORMAL_CONDITIONS;
    this.grid = buildGrid({
      species: [GLUCOSE],
      layers: layersFor(geometry),
      nodesPerLayer: this.nodesPerLayer,
    });
    this.field = uniformField(this.grid, this.boundaries(environment));
  }

  private boundaries(environment: OpticalEnvironment): Boundaries {
    return {
      outer: { [GLUCOSE]: environment.glucose },
      inner: { [GLUCOSE]: { kind: "no-flux" } },
    };
  }

  /**
   * The capsule is living tissue and consumes some of the glucose crossing
   * it. First order at the uptake rate the constants declare, and applied
   * only to capsule cells.
   */
  private reaction(): ReactionTerm {
    const layerOf = this.grid.layerOf;
    const uptake = raw(ENV.capsuleGlucoseUptake);
    return (cell, concentration, out) => {
      out[0] = layerOf[cell] === CAPSULE_LAYER ? -uptake * concentration[0]! : 0;
    };
  }

  /** Free plus reversibly bound glucose, per cubic metre of the cell's material. */
  private storage(environment: OpticalEnvironment): StorageTerm {
    const layerOf = this.grid.layerOf;
    const receptors = receptorDensity();
    const { competitors, conditions } = environment;
    return (cell, concentration, out) => {
      out[0] =
        layerOf[cell] === GEL_LAYER
          ? raw(heldGlucose(molPerM3(concentration[0]!), competitors, conditions, receptors))
          : concentration[0]!;
    };
  }

  /** Rebuild and remap when the body has moved a layer thickness enough to matter. */
  setGeometry(geometry: OpticalGeometry): void {
    const before = layersFor(this.geometry);
    const after = layersFor(geometry);
    const moved = after.some((layer, i) => {
      const was = raw(before[i]!.thickness);
      const now = raw(layer.thickness);
      const scale = Math.max(was, now, raw(SOLVER.minLayerThickness));
      return Math.abs(now - was) / scale > raw(SOLVER.geometryRebuildTolerance);
    });
    this.geometry = geometry;
    if (!moved) return;
    const rebuilt = buildGrid({
      species: [GLUCOSE],
      layers: after,
      nodesPerLayer: this.nodesPerLayer,
    });
    this.field = remapField(this.grid, rebuilt, this.field);
    this.grid = rebuilt;
  }

  /** Advance the transport by `dt`. The light is not involved; that is `acquire`. */
  advance(dt: Seconds, environment: OpticalEnvironment): void {
    const result = step(this.grid, this.field, this.boundaries(environment), dt, {
      reacting: [GLUCOSE],
      reaction: this.reaction(),
      storage: this.storage(environment),
    });
    this.field = result.field;
  }

  /** Settle the stack to the steady state of this environment, for a cold start. */
  settle(environment: OpticalEnvironment): void {
    const result = step(this.grid, this.field, this.boundaries(environment), null, {
      reacting: [GLUCOSE],
      reaction: this.reaction(),
      storage: this.storage(environment),
    });
    this.field = result.field;
  }

  /** Free glucose profile through the whole stack, mol/m3 in each layer's own material. */
  glucoseProfile(): Float64Array {
    return profile(this.grid, this.field, GLUCOSE);
  }

  /** The layers as built, so a caller can draw them without guessing. */
  layerSpecs(): readonly LayerSpec[] {
    return this.grid.layers;
  }

  /** Cell centre depths from the outer face, metres. */
  depths(): Float64Array {
    return this.grid.x;
  }

  /** Which layer each cell belongs to, for drawing the profile. */
  cellLayers(): Int32Array {
    return this.grid.layerOf;
  }

  /**
   * Dye-weighted mean quantum yield across the gel.
   *
   * The dye is uniform and the illumination is uniform, so this is a plain
   * width-weighted mean of `Phi_f(theta(x))`. Averaging the yield rather than
   * the glucose is the point: the switch is nonlinear, so a gradient across
   * the gel does not read as its mean glucose.
   */
  private meanQuantumYield(environment: OpticalEnvironment): number {
    let weighted = 0;
    let width = 0;
    for (let c = 0; c < this.grid.nCells; c += 1) {
      if (this.grid.layerOf[c] !== GEL_LAYER) continue;
      const free = molPerM3(concentrationAt(this.grid, this.field, GLUCOSE, c));
      // Total occupancy, not glucose occupancy: the switch is the boron
      // holding a diol, and it cannot tell which diol it is holding.
      const theta = totalOccupancy(free, environment.competitors, environment.conditions);
      weighted += indicatorQuantumYield(theta) * this.grid.h[c]!;
      width += this.grid.h[c]!;
    }
    return width > 0 ? weighted / width : indicatorQuantumYield(0);
  }

  /**
   * Width-weighted mean receptor occupancy across the gel.
   *
   * `total` is what the light sees; the glucose-only figure is what the
   * glucose is actually doing. They differ by exactly the competitor load,
   * which is the probe's polyol error made visible.
   */
  gelOccupancy(environment: OpticalEnvironment, which: "total" | "glucose" = "total"): number {
    const of = which === "total" ? totalOccupancy : occupancy;
    let weighted = 0;
    let width = 0;
    for (let c = 0; c < this.grid.nCells; c += 1) {
      if (this.grid.layerOf[c] !== GEL_LAYER) continue;
      const free = molPerM3(concentrationAt(this.grid, this.field, GLUCOSE, c));
      weighted += of(free, environment.competitors, environment.conditions) * this.grid.h[c]!;
      width += this.grid.h[c]!;
    }
    return width > 0 ? weighted / width : 0;
  }

  /**
   * Fire one flash and read both channels.
   *
   * The flash is what destroys the dye, so bleaching is advanced here and
   * nowhere else: a probe that is never interrogated never fades.
   */
  acquire(stream: Stream, environment: OpticalEnvironment): OpticalReading {
    const meanYield = this.meanQuantumYield(environment);

    const indicatorMean = indicatorCountsFromYield(meanYield, this.indicatorSurvival);
    const referenceMean = expectedReferenceCounts(this.referenceSurvival);

    const indicatorCounts = drawCounts(stream, indicatorMean);
    const referenceCounts = drawCounts(stream, referenceMean);

    // The flash has now happened, so both populations lose their share.
    this.indicatorSurvival = stepSurvival(this.indicatorSurvival);
    this.referenceSurvival = stepSurvival(this.referenceSurvival);
    this.flashes += 1;

    const indicatorSignal = darkCorrect(indicatorCounts);
    const referenceSignal = darkCorrect(referenceCounts);
    const ratio = referenceSignal > 0 ? indicatorSignal / referenceSignal : 0;

    const inferred = occupancyFromRatio(ratio);
    const clamped = Math.min(Math.max(inferred, 0), 1 - Number.EPSILON);
    // The isotherm returns the concentration in the gel, which is not the
    // concentration outside it: glucose is less soluble in the hydrogel than
    // in water, so the gel sits at K_G,gel times the external value once they
    // have equilibrated. Dividing by that partition coefficient is what a
    // calibration against a blood meter does. It is a declared constant, not
    // a factor fitted to make the reading come out right.
    const inGel = raw(
      glucoseFromOccupancy(clamped, this.calibrationCompetitors, this.calibrationConditions),
    );
    const partition = raw(PART.glucoseGel);
    const glucose = molPerM3(inGel / partition);

    // Counting noise, propagated through the ratio and then the inversion.
    const relativeVariance =
      countVariance(indicatorMean) / (indicatorMean * indicatorMean) +
      countVariance(referenceMean) / (referenceMean * referenceMean);
    const ratioSd = ratio * Math.sqrt(relativeVariance);
    const dThetaDRatio = occupancySensitivityToRatio(ratio);
    // d/d(theta) of Kd (theta/(1 - theta) - load) is Kd/(1 - theta)^2. The
    // competitor load is a constant offset and drops out of the derivative.
    const kd = raw(dissociationConstant(this.calibrationConditions));
    const dGlucoseDTheta = kd / Math.pow(1 - clamped, 2) / partition;

    return {
      indicatorCounts,
      referenceCounts,
      ratio,
      inferredOccupancy: inferred,
      glucose,
      uncertainty: molPerM3(Math.abs(dGlucoseDTheta * dThetaDRatio * ratioSd)),
      indicatorSurvival: this.indicatorSurvival,
      referenceSurvival: this.referenceSurvival,
      flashes: this.flashes,
    };
  }

  /**
   * Turn a measured ratio into a reported glucose, the way the instrument
   * does: invert the switch, invert the isotherm using the conditions the
   * device believes it is in, and divide out the gel's partition coefficient.
   *
   * `conditions` is what the **thermistor** says, not the truth. That is the
   * whole reason a failed thermistor costs the optical channel accuracy: the
   * receptor's affinity really does move with temperature, and the instrument
   * can only correct for a temperature it can measure.
   */
  invert(
    ratio: number,
    conditions: BindingConditions = this.calibrationConditions,
    competitors: Competitors = this.calibrationCompetitors,
  ): MolPerCubicMetre {
    const theta = Math.min(Math.max(occupancyFromRatio(ratio), 0), 1 - Number.EPSILON);
    const inGel = raw(glucoseFromOccupancy(theta, competitors, conditions));
    return molPerM3(inGel / raw(PART.glucoseGel));
  }

  /** The ratio the instrument would read with no noise at all. */
  noiselessRatio(environment: OpticalEnvironment): number {
    const meanYield = this.meanQuantumYield(environment);
    const indicator = indicatorCountsFromYield(meanYield, this.indicatorSurvival);
    return indicator / expectedReferenceCounts(this.referenceSurvival);
  }

  diagnostics(environment: OpticalEnvironment): OpticalDiagnostics {
    const last = this.grid.nCells - 1;
    const atFibre = molPerM3(concentrationAt(this.grid, this.field, GLUCOSE, last));
    const gelTheta = this.gelOccupancy(environment);
    const capsule = layersFor(this.geometry)[CAPSULE_LAYER]!;
    return {
      gelOccupancy: gelTheta,
      glucoseOccupancy: this.gelOccupancy(environment, "glucose"),
      freeGlucoseAtFibre: atFibre,
      retardationFactor: retardationFactor(
        atFibre,
        environment.competitors,
        environment.conditions,
      ),
      receptorDensity: receptorDensity(),
      dissociationConstant: dissociationConstant(environment.conditions),
      competitorLoad: competitorLoad(environment.competitors, environment.conditions),
      switchContrast: switchContrast(),
      opticalDepth: opticalDepth(PHOTO.dyeSurfaceDensity * this.indicatorSurvival),
      excitedStateFraction: excitedStateFraction(gelTheta),
      bindingRelaxation: relaxationTime(atFibre, environment.competitors, environment.conditions),
      stackDiffusionTime: s(diffusionTime(m(this.grid.thickness), DIFF.glucoseCapsule)),
      capsuleBiot: biotNumber(
        DIFF.glucoseCapsule,
        capsule.thickness,
        DIFF.glucoseGel,
        GEOM.gelThickness,
      ),
      stackThickness: m(this.grid.thickness),
    };
  }

  /**
   * The solved field, copied out, and put back.
   *
   * Used to warm start a probe from an identical one that has already been
   * settled. A steady-state solve from a uniform guess is the single most
   * expensive thing this class does, and every probe built in the same
   * conditions arrives at the same answer, so doing it once is a cache and
   * not an approximation.
   */
  snapshot(): Float64Array[] {
    return this.field.map((a) => Float64Array.from(a));
  }

  restore(field: readonly Float64Array[]): void {
    if (field.length !== this.field.length) return;
    for (let i = 0; i < field.length; i += 1) {
      const source = field[i]!;
      if (source.length !== this.field[i]!.length) return;
    }
    this.field = field.map((a) => Float64Array.from(a));
  }

  /** Total flashes fired, for the bleaching readout. */
  flashCount(): number {
    return this.flashes;
  }

  /** Surviving fraction of each dye population, for the counts readout. */
  survival(): { indicator: number; reference: number } {
    return { indicator: this.indicatorSurvival, reference: this.referenceSurvival };
  }

  /** Force the dye populations, for restoring saved state or for an experiment. */
  setSurvival(indicator: number, reference: number, flashes: number): void {
    this.indicatorSurvival = indicator;
    this.referenceSurvival = reference;
    this.flashes = flashes;
  }
}

export { ratioScale };
export * from "./binding.ts";
export * from "./photophysics.ts";
