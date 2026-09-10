/**
 * The enzymatic probe, assembled.
 *
 * Six films between the peritoneal fluid and the platinum: the unstirred
 * layer, adsorbed protein, the fibrous capsule, the glucose-limiting outer
 * membrane, the crosslinked enzyme layer, and the permselective film over the
 * electrode. Eight species crossing them, four reactions, and one boundary
 * condition that both consumes peroxide and gives oxygen back.
 *
 * ## What emerges rather than being written down
 *
 * - **Linearity.** Glucose oxidase saturates at 25 mmol/L, which is inside
 *   the clinical range, so the enzyme alone would be useless above about
 *   10 mmol/L. The outer membrane starves it hard enough that the enzyme
 *   never sees more than a fraction of a millimole, and the response becomes
 *   linear in bulk glucose. That is the entire reason the membrane exists and
 *   the model shows it rather than asserting it.
 *
 * - **Oxygen limitation.** The same membrane passes oxygen two and a half
 *   thousand times more easily than glucose, which is what keeps the ratio
 *   right. Where it stops being enough, the ping-pong denominator takes over
 *   on its own.
 *
 * - **Oxygen coming back.** Two electrons oxidise peroxide to oxygen at the
 *   platinum, one oxygen for each one the enzyme spent. Most of it diffuses
 *   straight back through the one micrometre permselective film into the
 *   enzyme layer. The probe therefore recycles most of its own oxygen, which
 *   makes oxygen limitation far milder than a supply calculation suggests.
 *   This is modelled as a source in the cell against the electrode face,
 *   equal to the flux leaving through it.
 *
 * - **Ageing.** Peroxide destroys the enzyme that made it, slice by slice, so
 *   the outer skin of the layer dies first and a probe held at high glucose
 *   ages faster. No decay constant is imposed.
 *
 * - **Acid.** The lactone the enzyme releases takes seven minutes to
 *   hydrolyse and rather longer than that to escape past the outer membrane,
 *   so most of it becomes gluconic acid where it stands. The local pH is
 *   reported. Nothing consumes it, because no pH dependence of glucose
 *   oxidase is declared and inventing one would be inventing physics.
 *
 * - **Interference.** Paracetamol crosses the hydrophobic outer membrane
 *   sixteen times more easily than glucose does and the charge-exclusion film
 *   barely touches it, because it is neutral. Ascorbate is an anion and is
 *   almost entirely rejected. The difference between the two is two partition
 *   coefficients, not two current terms.
 */

import type { Stream } from "../../rng.ts";
import type { Boundaries, Field, Grid, LayerSpec, ReactionTerm } from "../transport.ts";
import type { Amperes, Kelvin, Metres, MolPerCubicMetre, Ohms, Seconds, Volts } from "../units.ts";
import type { Impedance } from "./electrode.ts";

import { DIFF, ELEC, ENV, ENZ, GEOM, IMP, PART, SOLVER } from "../constants.ts";
import { damkohler, effectivenessFactor, thieleModulus } from "../dimensionless.ts";
import {
  buildGrid,
  concentrationAt,
  innerFlux,
  outerFlux,
  profile,
  remapField,
  step,
  uniformField,
} from "../transport.ts";
import { A as amperes, flux as fluxOf, m, molPerM3, raw, V } from "../units.ts";
import {
  faradaicCurrent,
  peroxideSurfaceRate,
  probeAngularFrequency,
  randlesElements,
  randlesImpedance,
  referenceDrift,
  silverChlorideRemaining,
} from "./electrode.ts";
import {
  ageEnzyme,
  catalyticTemperatureFactor,
  lactoneHydrolysisRate,
  localPh,
  oxygenLimitationFraction,
  pseudoFirstOrderRate,
  turnoverRate,
} from "./kinetics.ts";

const BETA = "betaGlucose";
const ALPHA = "alphaGlucose";
const OXYGEN = "oxygen";
const PEROXIDE = "peroxide";
const LACTONE = "lactone";
const GLUCONATE = "gluconate";
const PARACETAMOL = "paracetamol";
const ASCORBATE = "ascorbate";

/** Species that carry a reaction and so travel the coupled Newton path. */
const REACTING = [BETA, ALPHA, OXYGEN, PEROXIDE, LACTONE, GLUCONATE] as const;
const SPECIES = [...REACTING, PARACETAMOL, ASCORBATE] as const;

export const ENZYMATIC_LAYERS = [
  "boundary",
  "fouling",
  "capsule",
  "outer membrane",
  "enzyme layer",
  "inner membrane",
] as const;
export type EnzymaticLayerName = (typeof ENZYMATIC_LAYERS)[number];

const ENZYME_LAYER = ENZYMATIC_LAYERS.indexOf("enzyme layer");
const CAPSULE_LAYER = ENZYMATIC_LAYERS.indexOf("capsule");

export type EnzymaticGeometry = {
  readonly capsuleThickness: Metres;
  readonly foulingFraction: number;
  /** A fractured lead reads open circuit and carries no current at all. */
  readonly fractured: boolean;
};

export type EnzymaticEnvironment = {
  /** Total glucose in the fluid; the anomers are split at their equilibrium. */
  readonly glucose: MolPerCubicMetre;
  readonly oxygenPartialPressure: number;
  readonly paracetamol: MolPerCubicMetre;
  readonly ascorbate: MolPerCubicMetre;
  readonly temperature: Kelvin;
};

export type EnzymaticReading = {
  /** Total measured current, which is what the amplifier gives the instrument. */
  readonly current: Amperes;
  readonly glucoseCurrent: Amperes;
  readonly paracetamolCurrent: Amperes;
  readonly ascorbateCurrent: Amperes;
  /** Impedance magnitude and phase at the bench's probe frequency. */
  readonly impedance: Impedance;
  readonly referenceDrift: Volts;
  readonly silverChlorideRemaining: number;
};

export type EnzymaticDiagnostics = {
  readonly betaAtEnzyme: MolPerCubicMetre;
  readonly alphaAtEnzyme: MolPerCubicMetre;
  readonly betaFractionAtEnzyme: number;
  readonly oxygenAtEnzyme: MolPerCubicMetre;
  readonly peroxideAtElectrode: MolPerCubicMetre;
  readonly oxygenLimitation: number;
  readonly oxygenReturnedFraction: number;
  readonly peroxideCaptureFraction: number;
  readonly enzymeSurviving: number;
  readonly enzymeProfile: Float64Array;
  readonly thiele: number;
  readonly effectiveness: number;
  readonly damkohler: number;
  readonly localPh: number;
  readonly gluconateAtEnzyme: MolPerCubicMetre;
  readonly stackThickness: Metres;
};

export type EnzymaticProbeOptions = {
  readonly nodesPerLayer?: number;
  /**
   * Whether the electrode gives oxygen back, which it does.
   *
   * This is a **model switch, not a state of the device**. It exists because
   * the recycling turns out to be worth almost all of the probe's oxygen
   * tolerance, and the only way to show how much is to run the same probe
   * without it. The Probe Lab labels it as an experiment. Nothing in the
   * bench ever sets it false.
   */
  readonly recycleOxygen?: boolean;
};

function atLeastMinimum(thickness: number): Metres {
  return m(Math.max(thickness, raw(SOLVER.minLayerThickness)));
}

/**
 * The stack, outer face first.
 *
 * The lactone and the gluconate are given glucose's transport, because they
 * are the same molecule with one bond changed and there is no reason to
 * declare a second set of numbers for them. The one place they differ is the
 * outer membrane, where the gluconate's charge earns it its own partition
 * coefficient and traps it inside.
 */
function layersFor(geometry: EnzymaticGeometry): LayerSpec[] {
  return [
    {
      name: "boundary",
      thickness: GEOM.boundaryLayer,
      diffusivity: {
        [BETA]: DIFF.glucoseWater,
        [ALPHA]: DIFF.glucoseWater,
        [OXYGEN]: DIFF.oxygenWater,
        [PEROXIDE]: DIFF.peroxideWater,
        [LACTONE]: DIFF.glucoseWater,
        [GLUCONATE]: DIFF.glucoseWater,
        [PARACETAMOL]: DIFF.interferentWater,
        [ASCORBATE]: DIFF.interferentWater,
      },
    },
    {
      name: "fouling",
      thickness: atLeastMinimum(geometry.foulingFraction * raw(GEOM.foulingThicknessMax)),
      diffusivity: {
        [BETA]: DIFF.glucoseFouling,
        [ALPHA]: DIFF.glucoseFouling,
        [OXYGEN]: DIFF.oxygenFouling,
        [PEROXIDE]: DIFF.peroxideFouling,
        [LACTONE]: DIFF.glucoseFouling,
        [GLUCONATE]: DIFF.glucoseFouling,
        [PARACETAMOL]: DIFF.interferentFouling,
        [ASCORBATE]: DIFF.interferentFouling,
      },
      partition: {
        [BETA]: raw(PART.glucoseFouling),
        [ALPHA]: raw(PART.glucoseFouling),
        [OXYGEN]: raw(PART.oxygenFouling),
        [PEROXIDE]: raw(PART.peroxideFouling),
        [LACTONE]: raw(PART.glucoseFouling),
        [GLUCONATE]: raw(PART.glucoseFouling),
        [PARACETAMOL]: raw(PART.interferentFouling),
        [ASCORBATE]: raw(PART.interferentFouling),
      },
    },
    {
      name: "capsule",
      thickness: atLeastMinimum(raw(geometry.capsuleThickness)),
      diffusivity: {
        [BETA]: DIFF.glucoseCapsule,
        [ALPHA]: DIFF.glucoseCapsule,
        [OXYGEN]: DIFF.oxygenCapsule,
        [PEROXIDE]: DIFF.peroxideCapsule,
        [LACTONE]: DIFF.glucoseCapsule,
        [GLUCONATE]: DIFF.glucoseCapsule,
        [PARACETAMOL]: DIFF.interferentCapsule,
        [ASCORBATE]: DIFF.interferentCapsule,
      },
      partition: {
        [BETA]: raw(PART.glucoseCapsule),
        [ALPHA]: raw(PART.glucoseCapsule),
        [OXYGEN]: raw(PART.oxygenCapsule),
        [PEROXIDE]: raw(PART.peroxideCapsule),
        [LACTONE]: raw(PART.glucoseCapsule),
        [GLUCONATE]: raw(PART.glucoseCapsule),
        [PARACETAMOL]: raw(PART.interferentCapsule),
        [ASCORBATE]: raw(PART.interferentCapsule),
      },
    },
    {
      name: "outer membrane",
      thickness: GEOM.outerMembraneThickness,
      diffusivity: {
        [BETA]: DIFF.glucoseOuterMembrane,
        [ALPHA]: DIFF.glucoseOuterMembrane,
        [OXYGEN]: DIFF.oxygenOuterMembrane,
        [PEROXIDE]: DIFF.peroxideOuterMembrane,
        [LACTONE]: DIFF.glucoseOuterMembrane,
        [GLUCONATE]: DIFF.glucoseOuterMembrane,
        [PARACETAMOL]: DIFF.interferentOuterMembrane,
        [ASCORBATE]: DIFF.interferentOuterMembrane,
      },
      partition: {
        [BETA]: raw(PART.glucoseOuterMembrane),
        [ALPHA]: raw(PART.glucoseOuterMembrane),
        [OXYGEN]: raw(PART.oxygenOuterMembrane),
        [PEROXIDE]: raw(PART.peroxideOuterMembrane),
        [LACTONE]: raw(PART.glucoseOuterMembrane),
        [GLUCONATE]: raw(PART.gluconateOuterMembrane),
        [PARACETAMOL]: raw(PART.interferentOuterMembrane),
        [ASCORBATE]: raw(PART.interferentOuterMembrane),
      },
    },
    {
      name: "enzyme layer",
      thickness: GEOM.enzymeLayerThickness,
      diffusivity: {
        [BETA]: DIFF.glucoseEnzymeLayer,
        [ALPHA]: DIFF.glucoseEnzymeLayer,
        [OXYGEN]: DIFF.oxygenEnzymeLayer,
        [PEROXIDE]: DIFF.peroxideEnzymeLayer,
        [LACTONE]: DIFF.glucoseEnzymeLayer,
        [GLUCONATE]: DIFF.glucoseEnzymeLayer,
        [PARACETAMOL]: DIFF.interferentEnzymeLayer,
        [ASCORBATE]: DIFF.interferentEnzymeLayer,
      },
      partition: {
        [BETA]: raw(PART.glucoseEnzymeLayer),
        [ALPHA]: raw(PART.glucoseEnzymeLayer),
        [OXYGEN]: raw(PART.oxygenEnzymeLayer),
        [PEROXIDE]: raw(PART.peroxideEnzymeLayer),
        [LACTONE]: raw(PART.glucoseEnzymeLayer),
        [GLUCONATE]: raw(PART.glucoseEnzymeLayer),
        [PARACETAMOL]: raw(PART.interferentEnzymeLayer),
        [ASCORBATE]: raw(PART.interferentEnzymeLayer),
      },
    },
    {
      name: "inner membrane",
      thickness: GEOM.innerMembraneThickness,
      diffusivity: {
        [BETA]: DIFF.glucoseInnerMembrane,
        [ALPHA]: DIFF.glucoseInnerMembrane,
        [OXYGEN]: DIFF.oxygenInnerMembrane,
        [PEROXIDE]: DIFF.peroxideInnerMembrane,
        [LACTONE]: DIFF.glucoseInnerMembrane,
        [GLUCONATE]: DIFF.glucoseInnerMembrane,
        [PARACETAMOL]: DIFF.interferentInnerMembrane,
        [ASCORBATE]: DIFF.interferentInnerMembrane,
      },
      partition: {
        [BETA]: raw(PART.glucoseInnerMembrane),
        [ALPHA]: raw(PART.glucoseInnerMembrane),
        [OXYGEN]: raw(PART.oxygenInnerMembrane),
        [PEROXIDE]: raw(PART.peroxideInnerMembrane),
        [LACTONE]: raw(PART.glucoseInnerMembrane),
        [GLUCONATE]: raw(PART.glucoseInnerMembrane),
        // The rejection factors act here, by keeping the interferent out of
        // the film rather than by discounting the current afterwards.
        [PARACETAMOL]: raw(PART.interferentInnerMembrane) * (1 - raw(ELEC.rejectionParacetamol)),
        [ASCORBATE]: raw(PART.interferentInnerMembrane) * (1 - raw(ELEC.rejectionAscorbate)),
      },
    },
  ];
}

/** Dissolved oxygen from a partial pressure, by Henry's law. */
export function dissolvedOxygen(partialPressurePa: number): MolPerCubicMetre {
  return molPerM3(ENV.oxygenHenry * partialPressurePa);
}

export class EnzymaticProbe {
  private grid: Grid;
  private field: Field;
  private geometry: EnzymaticGeometry;
  private readonly nodesPerLayer: number | undefined;

  /** Active enzyme in each cell of the enzyme layer, mol/m3. */
  private enzyme: Float64Array;
  private readonly recycleOxygen: boolean;
  /** Charge the reference has had to supply, coulombs. */
  private chargePassed = 0;
  private slotCache: Int32Array | null = null;

  constructor(
    geometry: EnzymaticGeometry,
    environment: EnzymaticEnvironment,
    options: EnzymaticProbeOptions = {},
  ) {
    this.geometry = geometry;
    this.nodesPerLayer = options.nodesPerLayer;
    this.recycleOxygen = options.recycleOxygen ?? true;
    this.grid = buildGrid({
      species: [...SPECIES],
      layers: layersFor(geometry),
      nodesPerLayer: this.nodesPerLayer,
    });
    this.field = uniformField(this.grid, this.boundaries(environment));
    this.enzyme = new Float64Array(this.enzymeCellCount()).fill(raw(ENZ.enzymeLoading));
  }

  private enzymeCellCount(): number {
    let n = 0;
    for (let c = 0; c < this.grid.nCells; c += 1) if (this.grid.layerOf[c] === ENZYME_LAYER) n += 1;
    return n;
  }

  /**
   * Index into `enzyme` for each grid cell, or -1 outside the enzyme layer.
   * Built once per grid, because the reaction term asks for it in the inner
   * loop of every Newton iteration.
   */
  private enzymeSlots(): Int32Array {
    if (this.slotCache && this.slotCache.length === this.grid.nCells) return this.slotCache;
    const slots = new Int32Array(this.grid.nCells).fill(-1);
    let n = 0;
    for (let c = 0; c < this.grid.nCells; c += 1) {
      if (this.grid.layerOf[c] === ENZYME_LAYER) {
        slots[c] = n;
        n += 1;
      }
    }
    this.slotCache = slots;
    return slots;
  }

  private boundaries(environment: EnzymaticEnvironment): Boundaries {
    const beta = raw(environment.glucose) * raw(ENZ.betaFractionEquilibrium);
    const alpha = raw(environment.glucose) - beta;
    const drift = referenceDrift(this.chargePassed, raw(environment.temperature));
    const surface = peroxideSurfaceRate(drift);
    return {
      outer: {
        [BETA]: molPerM3(beta),
        [ALPHA]: molPerM3(alpha),
        [OXYGEN]: dissolvedOxygen(environment.oxygenPartialPressure),
        [PEROXIDE]: molPerM3(0),
        [LACTONE]: molPerM3(0),
        [GLUCONATE]: molPerM3(0),
        [PARACETAMOL]: environment.paracetamol,
        [ASCORBATE]: environment.ascorbate,
      },
      inner: {
        [BETA]: { kind: "no-flux" },
        [ALPHA]: { kind: "no-flux" },
        [OXYGEN]: { kind: "no-flux" },
        [PEROXIDE]: { kind: "surface-sink", k: surface },
        [LACTONE]: { kind: "no-flux" },
        [GLUCONATE]: { kind: "no-flux" },
        [PARACETAMOL]: { kind: "surface-sink", k: ELEC.interferentPermeability },
        [ASCORBATE]: { kind: "surface-sink", k: ELEC.interferentPermeability },
      },
    };
  }

  /**
   * Every reaction in the stack, cell by cell.
   *
   * The species order matches `REACTING`: beta, alpha, oxygen, peroxide,
   * lactone, gluconate.
   */
  private reaction(environment: EnzymaticEnvironment): ReactionTerm {
    const enzyme = this.enzyme;
    const temperature = environment.temperature;
    const hydrolysis = raw(lactoneHydrolysisRate());
    const last = this.grid.nCells - 1;
    const lastWidth = this.grid.h[last]!;
    const peroxideIndex = SPECIES.indexOf(PEROXIDE);
    const peroxidePartition = this.grid.K[peroxideIndex]![last]!;
    const innerConductance = this.grid.G[peroxideIndex]![this.grid.nCells]!;
    const surfaceRate = raw(
      peroxideSurfaceRate(referenceDrift(this.chargePassed, raw(temperature))),
    );
    const combined = 1 / (1 / innerConductance + 1 / (surfaceRate * peroxidePartition));
    const oxygenPerPeroxide = ELEC.oxygenPerPeroxide;
    const recycle = this.recycleOxygen;
    const enzymeAt = this.enzymeSlots();

    // The rate law's own constants, lifted out of the inner loop. This term is
    // evaluated seven times per cell per Newton iteration, so an exponential
    // left inside it costs more than the rest of the solve put together.
    const vmaxPerEnzyme = raw(ENZ.kCat) * catalyticTemperatureFactor(temperature);
    const kmGlucose = raw(ENZ.kmGlucose);
    const kmOxygen = raw(ENZ.kmOxygen);
    const kMut = raw(ENZ.mutarotation);
    const betaEquilibrium = raw(ENZ.betaFractionEquilibrium);

    return (cell, concentration, out) => {
      const beta = concentration[0]!;
      const alpha = concentration[1]!;
      const oxygen = concentration[2]!;
      const peroxide = concentration[3]!;
      const lactone = concentration[4]!;

      const totalGlucose = Math.max(alpha, 0) + Math.max(beta, 0);
      const mutarotation = kMut * (betaEquilibrium * totalGlucose - beta);

      let turnover = 0;
      const slot = enzymeAt[cell]!;
      if (slot >= 0) {
        const g = Math.max(beta, 0);
        const o = Math.max(oxygen, 0);
        const denominator = kmGlucose * o + kmOxygen * g + g * o;
        if (denominator > 0) {
          turnover = (vmaxPerEnzyme * Math.max(enzyme[slot]!, 0) * g * o) / denominator;
        }
      }
      const hydrolysed = hydrolysis * Math.max(lactone, 0);

      out[0] = mutarotation - turnover;
      out[1] = -mutarotation;
      out[2] = -turnover;
      out[3] = turnover;
      out[4] = turnover - hydrolysed;
      out[5] = hydrolysed;

      // The electrode oxidises peroxide back to oxygen, one for one. That is
      // a surface source, so it enters the control volume against the face,
      // at exactly the flux the same face removes.
      if (cell === last && recycle) {
        const outward = (combined * Math.max(peroxide, 0)) / peroxidePartition;
        out[2] += (oxygenPerPeroxide * outward) / lastWidth;
      }
    };
  }

  setGeometry(geometry: EnzymaticGeometry): void {
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
      species: [...SPECIES],
      layers: after,
      nodesPerLayer: this.nodesPerLayer,
    });
    this.field = remapField(this.grid, rebuilt, this.field);
    this.grid = rebuilt;
    this.slotCache = null;
    // The enzyme layer never changes thickness or node count, so its state
    // carries across untouched.
  }

  /** Advance transport, reaction and ageing by `dt`. */
  advance(dt: Seconds, environment: EnzymaticEnvironment): void {
    const result = step(this.grid, this.field, this.boundaries(environment), dt, {
      reacting: [...REACTING],
      reaction: this.reaction(environment),
    });
    this.field = result.field;
    this.ageEnzymeLayer(dt);
    this.spendReference(dt, environment);
  }

  /** Settle to the steady state of this environment, for a cold start. */
  settle(environment: EnzymaticEnvironment): void {
    const result = step(this.grid, this.field, this.boundaries(environment), null, {
      reacting: [...REACTING],
      reaction: this.reaction(environment),
    });
    this.field = result.field;
  }

  private ageEnzymeLayer(dt: Seconds): void {
    for (let c = 0; c < this.grid.nCells; c += 1) {
      const slot = this.enzymeSlots()[c]!;
      if (slot < 0) continue;
      const peroxide = molPerM3(concentrationAt(this.grid, this.field, PEROXIDE, c));
      this.enzyme[slot] = raw(ageEnzyme(molPerM3(this.enzyme[slot]!), peroxide, dt));
    }
  }

  private spendReference(dt: Seconds, environment: EnzymaticEnvironment): void {
    const reading = this.read(environment);
    this.chargePassed += Math.abs(raw(reading.current)) * raw(dt);
  }

  /** The molar flux of one species arriving at the electrode, mol/(m2 s). */
  private fluxAtElectrode(species: string, environment: EnzymaticEnvironment): number {
    const inner = this.boundaries(environment).inner[species];
    if (!inner) return 0;
    return innerFlux(this.grid, this.field, species, inner);
  }

  /** What the amplifier reads, with no measurement noise added. */
  read(environment: EnzymaticEnvironment): EnzymaticReading {
    if (this.geometry.fractured) {
      const zero = amperes(0);
      return {
        current: zero,
        glucoseCurrent: zero,
        paracetamolCurrent: zero,
        ascorbateCurrent: zero,
        impedance: randlesImpedance(
          randlesElements(this.geometry.foulingFraction, this.geometry.capsuleThickness, true),
          probeAngularFrequency(),
        ),
        referenceDrift: referenceDrift(this.chargePassed, raw(environment.temperature)),
        silverChlorideRemaining: silverChlorideRemaining(this.chargePassed),
      };
    }

    const peroxide = faradaicCurrent(
      fluxOf(this.fluxAtElectrode(PEROXIDE, environment)),
      ELEC.electronsPerPeroxide,
    );
    const paracetamol = faradaicCurrent(
      fluxOf(this.fluxAtElectrode(PARACETAMOL, environment)),
      ELEC.electronsPerParacetamol,
    );
    const ascorbate = faradaicCurrent(
      fluxOf(this.fluxAtElectrode(ASCORBATE, environment)),
      ELEC.electronsPerAscorbate,
    );

    return {
      current: amperes(raw(peroxide) + raw(paracetamol) + raw(ascorbate)),
      glucoseCurrent: peroxide,
      paracetamolCurrent: paracetamol,
      ascorbateCurrent: ascorbate,
      impedance: randlesImpedance(
        randlesElements(
          this.geometry.foulingFraction,
          this.geometry.capsuleThickness,
          this.geometry.fractured,
        ),
        probeAngularFrequency(),
      ),
      referenceDrift: referenceDrift(this.chargePassed, raw(environment.temperature)),
      silverChlorideRemaining: silverChlorideRemaining(this.chargePassed),
    };
  }

  /** Impedance across a whole sweep, for the Probe Lab's Nyquist plot. */
  impedanceSpectrum(frequencies: readonly number[]): Impedance[] {
    const elements = randlesElements(
      this.geometry.foulingFraction,
      this.geometry.capsuleThickness,
      this.geometry.fractured,
    );
    return frequencies.map((f) => randlesImpedance(elements, 2 * Math.PI * f));
  }

  /**
   * Molar flux entering through the outer face, mol/(m2 s), positive inwards.
   *
   * Negative for a product on its way out. Summing it over the four species
   * that carry the glucose skeleton is how the carbon balance is checked.
   */
  /**
   * Total glucose, both anomers, at the inner face of the capsule: what the
   * tissue has actually delivered to the probe, before the outer membrane
   * throws almost all of it away.
   */
  glucoseAtMembrane(environment: EnzymaticEnvironment): number {
    void environment;
    let cell = 0;
    for (let c = 0; c < this.grid.nCells; c += 1) {
      if (this.grid.layerOf[c] === CAPSULE_LAYER) cell = c;
    }
    return (
      concentrationAt(this.grid, this.field, BETA, cell) +
      concentrationAt(this.grid, this.field, ALPHA, cell)
    );
  }

  outerFluxOf(species: string, environment: EnzymaticEnvironment): number {
    return outerFlux(this.grid, this.field, species, this.boundaries(environment));
  }

  /** The layers as built, so a caller can draw them without guessing. */
  layerSpecs(): readonly LayerSpec[] {
    return this.grid.layers;
  }

  concentrationProfile(species: string): Float64Array {
    return profile(this.grid, this.field, species);
  }

  depths(): Float64Array {
    return this.grid.x;
  }

  cellLayers(): Int32Array {
    return this.grid.layerOf;
  }

  enzymeProfile(): Float64Array {
    return Float64Array.from(this.enzyme);
  }

  /** Mean surviving fraction of the enzyme loading across the layer. */
  enzymeSurviving(): number {
    let total = 0;
    for (const value of this.enzyme) total += value;
    return this.enzyme.length > 0 ? total / (this.enzyme.length * raw(ENZ.enzymeLoading)) : 0;
  }

  diagnostics(environment: EnzymaticEnvironment): EnzymaticDiagnostics {
    const enzymeCells: number[] = [];
    for (let c = 0; c < this.grid.nCells; c += 1) {
      if (this.grid.layerOf[c] === ENZYME_LAYER) enzymeCells.push(c);
    }
    const mid = enzymeCells[Math.floor(enzymeCells.length / 2)] ?? 0;
    const last = this.grid.nCells - 1;

    const beta = molPerM3(concentrationAt(this.grid, this.field, BETA, mid));
    const alpha = molPerM3(concentrationAt(this.grid, this.field, ALPHA, mid));
    const oxygen = molPerM3(concentrationAt(this.grid, this.field, OXYGEN, mid));
    const peroxideAtElectrode = molPerM3(concentrationAt(this.grid, this.field, PEROXIDE, last));
    const gluconate = molPerM3(concentrationAt(this.grid, this.field, GLUCONATE, mid));

    const meanEnzyme = molPerM3(raw(ENZ.enzymeLoading) * this.enzymeSurviving());
    const rateConstant = pseudoFirstOrderRate(meanEnzyme, environment.temperature);
    const thiele = thieleModulus(GEOM.enzymeLayerThickness, rateConstant, DIFF.glucoseEnzymeLayer);

    // How much of the peroxide made ends up at the electrode rather than
    // escaping outward, and how much of the oxygen the enzyme spent comes
    // back from it. Both are ratios of fluxes the solver already has.
    let produced = 0;
    for (const c of enzymeCells) {
      const slot = this.enzymeSlots()[c]!;
      produced +=
        raw(
          turnoverRate(
            molPerM3(this.enzyme[slot]!),
            molPerM3(concentrationAt(this.grid, this.field, BETA, c)),
            molPerM3(concentrationAt(this.grid, this.field, OXYGEN, c)),
            environment.temperature,
          ),
        ) * this.grid.h[c]!;
    }
    const captured = this.fluxAtElectrode(PEROXIDE, environment);
    const capture = produced > 0 ? Math.min(captured / produced, 1) : 0;

    return {
      betaAtEnzyme: beta,
      alphaAtEnzyme: alpha,
      betaFractionAtEnzyme: raw(beta) + raw(alpha) > 0 ? raw(beta) / (raw(beta) + raw(alpha)) : 0,
      oxygenAtEnzyme: oxygen,
      peroxideAtElectrode,
      oxygenLimitation: oxygenLimitationFraction(meanEnzyme, beta, oxygen, environment.temperature),
      oxygenReturnedFraction:
        this.recycleOxygen && produced > 0 ? (ELEC.oxygenPerPeroxide * captured) / produced : 0,
      peroxideCaptureFraction: capture,
      enzymeSurviving: this.enzymeSurviving(),
      enzymeProfile: this.enzymeProfile(),
      thiele,
      effectiveness: effectivenessFactor(thiele),
      damkohler: damkohler(
        raw(ENZ.kCat) * catalyticTemperatureFactor(environment.temperature) * raw(meanEnzyme),
        GEOM.enzymeLayerThickness,
        raw(DIFF.glucoseOuterMembrane) * raw(PART.glucoseOuterMembrane),
        GEOM.outerMembraneThickness,
        environment.glucose,
      ),
      localPh: localPh(gluconate),
      gluconateAtEnzyme: gluconate,
      stackThickness: m(this.grid.thickness),
    };
  }

  /**
   * Amplifier noise on a reading.
   *
   * The Johnson noise of the cell and the shot noise of a nanoampere are both
   * far below the bench's declared current noise, which is dominated by the
   * front-end amplifier and by movement of the probe in tissue. So this draws
   * the declared noise rather than pretending to derive it, and says so.
   */
  measure(stream: Stream, environment: EnzymaticEnvironment, noiseSd: Amperes): Amperes {
    const clean = raw(this.read(environment).current);
    return amperes(clean + stream.gauss(0, raw(noiseSd)));
  }

  /** The solved field, copied out, for warm starting an identical probe. */
  snapshot(): Float64Array[] {
    return this.field.map((a) => Float64Array.from(a));
  }

  restore(field: readonly Float64Array[]): void {
    if (field.length !== this.field.length) return;
    for (let i = 0; i < field.length; i += 1) {
      if (field[i]!.length !== this.field[i]!.length) return;
    }
    this.field = field.map((a) => Float64Array.from(a));
  }

  /** Charge the reference has supplied so far, coulombs. */
  charge(): number {
    return this.chargePassed;
  }

  setCharge(coulombs: number): void {
    this.chargePassed = coulombs;
  }

  /** Force the enzyme profile, for restoring saved state or for an experiment. */
  setEnzyme(values: Float64Array): void {
    this.enzyme = Float64Array.from(values);
  }

  /** The declared open-circuit reading, so callers do not have to know it. */
  static openCircuit(): Ohms {
    return IMP.openCircuitResistance;
  }

  /** Working potential the electrode is nominally held at. */
  static workingPotential(): Volts {
    return V(raw(ELEC.workingPotential));
  }
}

export * from "./kinetics.ts";
export * from "./electrode.ts";
export { SPECIES as ENZYMATIC_SPECIES, REACTING as ENZYMATIC_REACTING_SPECIES };
