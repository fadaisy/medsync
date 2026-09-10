/**
 * The Probe Lab's own pair of probes.
 *
 * The lab does not read the running device. It runs its own optical and
 * enzymatic probe under conditions the reader sets, because the questions it
 * exists to answer are of the form "what happens if the oxygen falls" rather
 * than "what is happening now". Sharing the bench's probes would mean either
 * disturbing a running simulation or being unable to ask anything.
 *
 * Everything here is the same code the bench runs. There is no separate
 * simplified model for the illustration: if the lab shows a curve, that curve
 * came out of the solver.
 */
import type { BenchProbeInputs, BenchTipInputs } from "../../engine/probes/bench.ts";
import type { EnzymaticEnvironment, Impedance } from "../../engine/probes/enzymatic/index.ts";
import type { OpticalEnvironment } from "../../engine/probes/optical/index.ts";

import { BenchProbes } from "../../engine/probes/bench.ts";
import { ENV, ENZ, IMP, PHOTO } from "../../engine/probes/constants.ts";
import {
  dissolvedOxygen,
  EnzymaticProbe,
  randlesElements,
  randlesImpedance,
} from "../../engine/probes/enzymatic/index.ts";
import {
  indicatorQuantumYield,
  NORMAL_CONDITIONS,
  occupancy,
  OpticalProbe,
  survivalAfterFlashes,
  totalOccupancy,
} from "../../engine/probes/optical/index.ts";
import {
  celsiusToKelvin,
  micronsToMetres,
  mmHgToPascals,
  molPerM3,
  raw,
  s as seconds,
} from "../../engine/probes/units.ts";
import { Rng } from "../../engine/rng.ts";

/** What the reader can set. */
export type LabConditions = {
  glucoseMmol: number;
  oxygenMmHg: number;
  temperatureC: number;
  paracetamolMmol: number;
  polyolMmol: number;
  capsuleMicron: number;
  foulingFraction: number;
  /** Flashes already fired, which is how far the dye has bleached. */
  flashes: number;
  /** Whether the electrode gives oxygen back. A model switch, not a device state. */
  recycleOxygen: boolean;
};

export const DEFAULT_CONDITIONS: LabConditions = {
  glucoseMmol: 6,
  oxygenMmHg: 40,
  temperatureC: 37,
  paracetamolMmol: 0,
  polyolMmol: 0,
  capsuleMicron: 50,
  foulingFraction: 0,
  flashes: 0,
  recycleOxygen: true,
};

function tip(conditions: LabConditions): BenchTipInputs {
  return {
    capsuleMicron: conditions.capsuleMicron,
    foulingFraction: conditions.foulingFraction,
    leadIntact: true,
  };
}

export function toInputs(conditions: LabConditions): BenchProbeInputs {
  return {
    glucoseMmol: conditions.glucoseMmol,
    oxygenMmHg: conditions.oxygenMmHg,
    temperatureC: conditions.temperatureC,
    paracetamolMmol: conditions.paracetamolMmol,
    ascorbateMmol: raw(ENV.plasmaAscorbate),
    polyolMmol: conditions.polyolMmol,
    tipA: tip(conditions),
    tipB: tip(conditions),
  };
}

function opticalEnvironment(conditions: LabConditions): OpticalEnvironment {
  return {
    glucose: molPerM3(conditions.glucoseMmol),
    competitors: {
      fructose: ENV.plasmaFructose,
      polyol: molPerM3(conditions.polyolMmol),
    },
    conditions: {
      temperature: celsiusToKelvin(conditions.temperatureC),
      ph: ENV.peritonealPh,
    },
  };
}

function enzymaticEnvironment(conditions: LabConditions): EnzymaticEnvironment {
  return {
    glucose: molPerM3(conditions.glucoseMmol),
    oxygenPartialPressure: raw(mmHgToPascals(conditions.oxygenMmHg)),
    paracetamol: molPerM3(conditions.paracetamolMmol),
    ascorbate: ENV.plasmaAscorbate,
    temperature: celsiusToKelvin(conditions.temperatureC),
  };
}

/** One species drawn across the stack. */
export type ProfileSeries = {
  key: string;
  label: string;
  colour: string;
  /** Concentration in each cell's own material, mmol/L. */
  values: Float64Array;
  /** Scale factor applied before drawing, and what it was. */
  scale: number;
  scaleLabel: string;
};

export type LayerBand = { name: string; fromMicron: number; toMicron: number };

export type OpticalResult = {
  depthsMicron: Float64Array;
  layers: LayerBand[];
  glucose: Float64Array;
  gelFrom: number;
  totalOccupancy: number;
  glucoseOccupancy: number;
  quantumYield: number;
  ratio: number;
  indicatorCounts: number;
  referenceCounts: number;
  readingMmol: number;
  uncertaintyMmol: number;
  survival: number;
  dissociationMmol: number;
  competitorLoad: number;
  switchContrast: number;
  responseSeconds: number;
};

export type EnzymaticResult = {
  depthsMicron: Float64Array;
  layers: LayerBand[];
  series: ProfileSeries[];
  enzymeProfile: Float64Array;
  enzymeFrom: number;
  currentNa: number;
  glucoseCurrentNa: number;
  paracetamolCurrentNa: number;
  ascorbateCurrentNa: number;
  oxygenLimitation: number;
  oxygenReturned: number;
  peroxideCapture: number;
  betaFraction: number;
  localPh: number;
  thiele: number;
  effectiveness: number;
  damkohler: number;
  spectrum: Array<{ frequency: number; impedance: Impedance }>;
  impedanceAtProbe: Impedance;
};

function bands(layers: readonly { name: string; thickness: { valueOf(): number } }[]): LayerBand[] {
  const out: LayerBand[] = [];
  let cursor = 0;
  for (const layer of layers) {
    const thickness = raw(layer.thickness as never) * 1e6;
    out.push({ name: layer.name, fromMicron: cursor, toMicron: cursor + thickness });
    cursor += thickness;
  }
  return out;
}

/**
 * Solve both probes to steady state under these conditions.
 *
 * Steady state rather than a transient, because every question the lab asks is
 * "where does this settle". The one time-dependent quantity, the response
 * time, is measured separately by stepping the glucose and timing it.
 */
export type LabSolution = {
  optical: OpticalResult;
  enzymatic: EnzymaticResult;
  profiles: {
    glucose: Float64Array;
    oxygen: Float64Array;
    peroxide: Float64Array;
    paracetamol: Float64Array;
    gluconate: Float64Array;
  };
};

export function solve(conditions: LabConditions): LabSolution {
  const inputs = toInputs(conditions);
  const probes = new BenchProbes(inputs, "frozen");
  const { optical, enzymatic } = probes.probes();

  const opticalEnv = opticalEnvironment(conditions);
  const enzymaticEnv = enzymaticEnvironment(conditions);

  // Bleaching is a count of flashes, so it is set rather than simulated.
  const survival = survivalAfterFlashes(conditions.flashes);
  optical.setSurvival(survival, survival, conditions.flashes);

  const opticalDiagnostics = optical.diagnostics(opticalEnv);
  const opticalLayers = bands(optical.layerSpecs());
  const gelFrom = opticalLayers[opticalLayers.length - 1]?.fromMicron ?? 0;

  const rng = new Rng(1);
  const reading = optical.acquire(rng.stream("lab"), opticalEnv);
  // Put the flash back: the lab is showing a state, not consuming the dye.
  optical.setSurvival(survival, survival, conditions.flashes);

  const opticalResult: OpticalResult = {
    depthsMicron: Float64Array.from(optical.depths(), (x) => x * 1e6),
    layers: opticalLayers,
    glucose: optical.glucoseProfile(),
    gelFrom,
    totalOccupancy: opticalDiagnostics.gelOccupancy,
    glucoseOccupancy: opticalDiagnostics.glucoseOccupancy,
    quantumYield: indicatorQuantumYield(opticalDiagnostics.gelOccupancy),
    ratio: optical.noiselessRatio(opticalEnv),
    indicatorCounts: reading.indicatorCounts,
    referenceCounts: reading.referenceCounts,
    readingMmol: raw(reading.glucose),
    uncertaintyMmol: raw(reading.uncertainty),
    survival,
    dissociationMmol: raw(opticalDiagnostics.dissociationConstant),
    competitorLoad: opticalDiagnostics.competitorLoad,
    switchContrast: opticalDiagnostics.switchContrast,
    responseSeconds: raw(opticalDiagnostics.stackDiffusionTime),
  };

  // The enzymatic probe is rebuilt when the recycling switch is off, because
  // that is a construction option rather than a state.
  const enzymaticProbe = conditions.recycleOxygen
    ? enzymatic
    : (() => {
        const bare = new EnzymaticProbe(
          {
            capsuleThickness: micronsToMetres(conditions.capsuleMicron),
            foulingFraction: conditions.foulingFraction,
            fractured: false,
          },
          enzymaticEnv,
          { recycleOxygen: false },
        );
        bare.settle(enzymaticEnv);
        return bare;
      })();

  const d = enzymaticProbe.diagnostics(enzymaticEnv);
  const readingB = enzymaticProbe.read(enzymaticEnv);
  const enzymaticLayers = bands(enzymaticProbe.layerSpecs());
  const enzymeBand = enzymaticLayers[4];

  const frequencies = [0.1, 0.3, 1, 3, 10, 30, 100, 300, 1000, 3000, 10_000, 30_000, 100_000];

  const totalGlucose = new Float64Array(enzymaticProbe.depths().length);
  const beta = enzymaticProbe.concentrationProfile("betaGlucose");
  const alpha = enzymaticProbe.concentrationProfile("alphaGlucose");
  for (let i = 0; i < totalGlucose.length; i += 1) totalGlucose[i] = beta[i]! + alpha[i]!;

  const enzymaticResult: EnzymaticResult = {
    depthsMicron: Float64Array.from(enzymaticProbe.depths(), (x) => x * 1e6),
    layers: enzymaticLayers,
    series: [],
    enzymeProfile: d.enzymeProfile,
    enzymeFrom: enzymeBand?.fromMicron ?? 0,
    currentNa: raw(readingB.current) * 1e9,
    glucoseCurrentNa: raw(readingB.glucoseCurrent) * 1e9,
    paracetamolCurrentNa: raw(readingB.paracetamolCurrent) * 1e9,
    ascorbateCurrentNa: raw(readingB.ascorbateCurrent) * 1e9,
    oxygenLimitation: d.oxygenLimitation,
    oxygenReturned: d.oxygenReturnedFraction,
    peroxideCapture: d.peroxideCaptureFraction,
    betaFraction: d.betaFractionAtEnzyme,
    localPh: d.localPh,
    thiele: d.thiele,
    effectiveness: d.effectiveness,
    damkohler: d.damkohler,
    spectrum: frequencies.map((frequency) => ({
      frequency,
      impedance: randlesImpedance(
        randlesElements(
          conditions.foulingFraction,
          micronsToMetres(conditions.capsuleMicron),
          false,
        ),
        2 * Math.PI * frequency,
      ),
    })),
    impedanceAtProbe: readingB.impedance,
  };

  return {
    optical: opticalResult,
    enzymatic: enzymaticResult,
    profiles: {
      glucose: totalGlucose,
      oxygen: enzymaticProbe.concentrationProfile("oxygen"),
      peroxide: enzymaticProbe.concentrationProfile("peroxide"),
      paracetamol: enzymaticProbe.concentrationProfile("paracetamol"),
      gluconate: enzymaticProbe.concentrationProfile("gluconate"),
    },
  };
}

/** Total glucose, both anomers, across the enzymatic stack. */
export function totalGlucoseProfile(probe: EnzymaticProbe): Float64Array {
  const beta = probe.concentrationProfile("betaGlucose");
  const alpha = probe.concentrationProfile("alphaGlucose");
  const out = new Float64Array(beta.length);
  for (let i = 0; i < out.length; i += 1) out[i] = beta[i]! + alpha[i]!;
  return out;
}

/** The isotherm, for the binding chart. Pure chemistry, no transport. */
export function isotherm(
  conditions: LabConditions,
  points = 60,
): Array<{
  glucose: number;
  glucoseOnly: number;
  total: number;
  quantumYield: number;
}> {
  const competitors = {
    fructose: ENV.plasmaFructose,
    polyol: molPerM3(conditions.polyolMmol),
  };
  const binding = {
    temperature: celsiusToKelvin(conditions.temperatureC),
    ph: ENV.peritonealPh,
  };
  const out = [];
  for (let i = 0; i <= points; i += 1) {
    const glucose = molPerM3((i / points) * 30);
    const total = totalOccupancy(glucose, competitors, binding);
    out.push({
      glucose: raw(glucose),
      glucoseOnly: occupancy(glucose, competitors, binding),
      total,
      quantumYield: indicatorQuantumYield(total),
    });
  }
  return out;
}

/**
 * Measured response time: step the glucose and time the gel to ninety per
 * cent. Run at the interactive stride, so it is the same number the bench
 * would produce.
 */
export function responseSeconds(conditions: LabConditions, toMmol: number): number | null {
  const from = { ...conditions };
  const probes = new BenchProbes(toInputs(from), "full");
  const { optical } = probes.probes();
  const stepped = opticalEnvironment({ ...conditions, glucoseMmol: toMmol });
  const start = optical.gelOccupancy(opticalEnvironment(conditions));

  const settledProbes = new BenchProbes(toInputs({ ...conditions, glucoseMmol: toMmol }), "frozen");
  const target = settledProbes.probes().optical.gelOccupancy(stepped);
  if (Math.abs(target - start) < 1e-9) return null;

  for (let t = 1; t <= 3600; t += 1) {
    optical.advance(seconds(1), stepped);
    const progress = (optical.gelOccupancy(stepped) - start) / (target - start);
    if (progress >= 0.9) return t;
  }
  return null;
}

/** Named constants the panels quote, so the numbers and their labels agree. */
export const LAB_FACTS = {
  kmGlucose: raw(ENZ.kmGlucose),
  kmOxygen: raw(ENZ.kmOxygen),
  enzymeLoading: raw(ENZ.enzymeLoading),
  probeFrequency: IMP.probeFrequency,
  bulkOxygenAt40: raw(dissolvedOxygen(raw(mmHgToPascals(40)))),
  dyeDensity: PHOTO.dyeSurfaceDensity,
  referenceDyeDensity: PHOTO.referenceDyeDensity,
  normalConditions: NORMAL_CONDITIONS,
} as const;

export type { OpticalProbe };
