/**
 * The adapter between the bench and the probe physics.
 *
 * The bench thinks in millimoles per litre, nanoamperes, kilohms, micrometres
 * of capsule and a fouling fraction between zero and one. The probes think in
 * SI, in concentration profiles and in molar fluxes. This is the only place
 * those two vocabularies meet, and it is deliberately the only place: nothing
 * in `src/engine/probes` knows the bench exists, and nothing in the bench
 * reaches past this file into a solver.
 *
 * ## Fidelity
 *
 * Solving both stacks costs about two and a quarter milliseconds of wall clock
 * per simulated second, against a budget of one. The three modes are three
 * timestep choices for the same model, not three models:
 *
 *   full     one solve per simulated second
 *   fast     one solve per ten simulated seconds, with dt of ten
 *   frozen   no solve at all; the profiles are held where they are
 *
 * `fast` is legitimate because the solver is fully implicit and the stack's
 * own time constant is around two hundred seconds, so a ten second step is
 * still a small fraction of anything the probe can follow. The error it costs
 * is measured against `full` in the tests rather than asserted here. `frozen`
 * is for scrubbing and for fast-forwarding a year, where the profiles are not
 * being looked at.
 *
 * ## What is mapped and what is not
 *
 * Mapped: bulk glucose, oxygen tension, temperature, capsule thickness,
 * fouling, lead integrity, the two interferents' plasma concentrations, and
 * an infused polyol.
 *
 * Deliberately not mapped: the amplifier's own slow gain drift and the
 * calibration gain and offset. Those are electronics and instrument, not
 * front-end chemistry, and they stay in the bench where they were.
 *
 * The omental wrap arrives already folded into the capsule thickness, which
 * is where it belongs. The placeholder also dimmed the returned light and
 * raised the impedance by fixed factors; the first of those is dropped,
 * because the fibre and the gel sit inside the housing and never see the
 * tissue, and the second is dropped because the extra capsule raises the
 * solution resistance on its own. DECISIONS.md records both.
 */

import type { Stream } from "../rng.ts";
import type { EnzymaticEnvironment, EnzymaticReading } from "./enzymatic/index.ts";
import type { Competitors, OpticalEnvironment, OpticalReading } from "./optical/index.ts";

import { ELEC, ENV, ENZ } from "./constants.ts";
import { EnzymaticProbe } from "./enzymatic/index.ts";
import {
  expectedReferenceCounts,
  NORMAL_COMPETITORS,
  OpticalProbe,
  survivalAfterFlashes,
} from "./optical/index.ts";
import {
  celsiusToKelvin,
  micronsToMetres,
  mmHgToPascals,
  molPerM3,
  raw,
  s as seconds,
} from "./units.ts";

export type Fidelity = "full" | "fast" | "frozen";

/**
 * How many simulated seconds each mode puts into one solve.
 *
 * `fast` is sixty seconds and not ten, which is the acquisition period, and
 * that is not a compromise: an acquisition forces a catch-up, so the
 * instrument reads a current profile whatever the stride, and one second, ten
 * and sixty produce the same numbers. Sixty is simply six times cheaper for
 * nothing. It was ten, and the only thing that bought was solving the stacks
 * five times over between two readings nobody could see the difference in.
 *
 * These are presets, not the whole story: a caller that is simulating a year
 * passes its own stride, because even at sixty seconds a year is nineteen
 * minutes of wall clock and nothing in a year-long run turns on transport
 * resolved to the minute. `scenarioProbeStride` in scenarios.ts is where that
 * choice is made and reasoned about. What a coarser stride costs is measured
 * against `full` rather than assumed, and the measurement is in the tests.
 */
export const FIDELITY_STEP: Readonly<Record<Fidelity, number>> = {
  full: 1,
  fast: 60,
  frozen: Number.POSITIVE_INFINITY,
};

/** Everything outside the probes, in the units the bench already holds. */
export type BenchProbeInputs = {
  /** Peritoneal glucose, mmol/L. This is the bulk both probes sit in. */
  readonly glucoseMmol: number;
  readonly oxygenMmHg: number;
  readonly temperatureC: number;
  /** Plasma paracetamol, mmol/L. */
  readonly paracetamolMmol: number;
  /** Plasma ascorbate, mmol/L, above or below its normal value. */
  readonly ascorbateMmol: number;
  /** Infused polyol, mmol/L. Zero unless mannitol is running. */
  readonly polyolMmol: number;
  readonly tipA: BenchTipInputs;
  readonly tipB: BenchTipInputs;
};

export type BenchTipInputs = {
  /**
   * Fibrous capsule thickness in micrometres, including whatever an omental
   * wrap has added. The bench already folds the wrap into this number, which
   * is the right place for it: a wrap is more tissue in front of the probe.
   */
  readonly capsuleMicron: number;
  readonly foulingFraction: number;
  readonly leadIntact: boolean;
};

export type OpticalChannel = {
  readonly reading: OpticalReading;
  /** Free glucose the gel is sitting in, mmol/L, for the bench's tip state. */
  readonly localGlucoseMmol: number;
  /** Surviving indicator dye, as a fraction of new. */
  readonly bleachSurvival: number;
  readonly flashes: number;
};

export type ElectrochemicalChannel = {
  readonly reading: EnzymaticReading;
  readonly currentNa: number;
  readonly localGlucoseMmol: number;
  readonly enzymeSurviving: number;
  readonly referenceDriftMv: number;
  readonly impedanceKohm: number;
};

/**
 * Nominal readings for a probe that has never been anything but new, used to
 * normalise the bench's health baselines. Computed once at construction from
 * the same physics, never from a declared constant.
 */
export type Nominal = {
  readonly opticalRatio: number;
  readonly currentNa: number;
  readonly impedanceKohm: number;
  /**
   * Factory calibration of the amperometric channel: the slope and intercept
   * of current against glucose for a brand new probe with no tissue on it.
   *
   * Measured from the physics at two glucose points, which is what a two
   * point factory calibration is. It is not a declared sensitivity: the
   * membranes decide it, and if a membrane constant changes this changes
   * with it.
   */
  readonly currentPerMmolNa: number;
  readonly currentZeroNa: number;
};

/** The two glucose points the factory calibration is taken at, mmol/L. */
const FACTORY_LOW = 4;
const FACTORY_HIGH = 12;

function opticalEnvironment(inputs: BenchProbeInputs): OpticalEnvironment {
  return {
    glucose: molPerM3(inputs.glucoseMmol),
    competitors: {
      fructose: ENV.plasmaFructose,
      polyol: molPerM3(inputs.polyolMmol),
    },
    conditions: {
      temperature: celsiusToKelvin(inputs.temperatureC),
      ph: ENV.peritonealPh,
    },
  };
}

function enzymaticEnvironment(inputs: BenchProbeInputs): EnzymaticEnvironment {
  return {
    glucose: molPerM3(inputs.glucoseMmol),
    oxygenPartialPressure: raw(mmHgToPascals(inputs.oxygenMmHg)),
    paracetamol: molPerM3(inputs.paracetamolMmol),
    ascorbate: molPerM3(inputs.ascorbateMmol),
    temperature: celsiusToKelvin(inputs.temperatureC),
  };
}

function effectiveCapsule(tip: BenchTipInputs): number {
  return tip.capsuleMicron;
}

/**
 * Two settled runs of a brand new probe, no capsule and no fouling, at two
 * glucose concentrations. The line through them is the instrument's
 * sensitivity.
 *
 * A factory calibration happens once, at manufacture, in standard conditions,
 * so it depends on the constants and on nothing else. It is therefore computed
 * once for the process and reused: the alternative is settling two throwaway
 * probes every time a bench engine is built, which is most of the cost of
 * building one.
 */
let factoryCache: { slope: number; intercept: number } | null = null;

function factoryCalibration(): { slope: number; intercept: number } {
  if (factoryCache) return factoryCache;
  const bare = (glucose: number): number => {
    const env: EnzymaticEnvironment = {
      glucose: molPerM3(glucose),
      oxygenPartialPressure: raw(ENV.peritonealOxygen),
      paracetamol: molPerM3(0),
      ascorbate: ENV.plasmaAscorbate,
      temperature: ENV.bodyTemperature,
    };
    const probe = new EnzymaticProbe(
      { capsuleThickness: micronsToMetres(0), foulingFraction: 0, fractured: false },
      env,
    );
    probe.settle(env);
    return raw(probe.read(env).current) * 1e9;
  };
  const low = bare(FACTORY_LOW);
  const high = bare(FACTORY_HIGH);
  const slope = (high - low) / (FACTORY_HIGH - FACTORY_LOW);
  factoryCache = { slope, intercept: low - slope * FACTORY_LOW };
  return factoryCache;
}

/**
 * Settled fields, keyed by the conditions that produced them.
 *
 * Every bench engine starts from the same place, so the first one pays for the
 * steady-state solve and the rest are handed its answer.
 *
 * A hit **replaces** the solve rather than warm starting it. That is not an
 * optimisation detail, it is the difference between a cache and a bug: Newton
 * stops when its update falls below a tolerance, so a solve started from a
 * warm guess lands a few parts in ten thousand million from one started cold.
 * Both are converged and neither is wrong, but it made the engine's output
 * depend on whether another engine had been built first, and a bench that is
 * not reproducible is not a bench. Copying the stored field is exact.
 *
 * The key carries everything the steady state depends on, so a hit returns the
 * field the solve would have returned for those conditions.
 */
const settledCache = new Map<string, { optical: Float64Array[]; enzymatic: Float64Array[] }>();

function settleKey(inputs: BenchProbeInputs): string {
  const round = (value: number): string => value.toFixed(6);
  return [
    round(inputs.glucoseMmol),
    round(inputs.oxygenMmHg),
    round(inputs.temperatureC),
    round(inputs.paracetamolMmol),
    round(inputs.ascorbateMmol),
    round(inputs.polyolMmol),
    round(inputs.tipA.capsuleMicron),
    round(inputs.tipA.foulingFraction),
    round(inputs.tipB.capsuleMicron),
    round(inputs.tipB.foulingFraction),
    inputs.tipB.leadIntact ? "1" : "0",
  ].join("|");
}

export class BenchProbes {
  private readonly optical: OpticalProbe;
  private readonly enzymatic: EnzymaticProbe;
  private fidelity: Fidelity;
  /** An explicit stride in simulated seconds, overriding the mode's preset. */
  private strideOverride: number | undefined;
  /** Simulated seconds waiting to be put into the next solve. */
  private pending = 0;
  /**
   * The last amperometric read, kept until the stacks move again.
   *
   * The bench asks for the enzyme's surviving fraction and the reference drift
   * on every simulated second, and computing them means walking the enzyme
   * layer and taking three fluxes. Nothing in them can change while the
   * profiles are standing still, so they are computed once per solve. This is
   * a cache and not an approximation: the value it returns is the value the
   * computation would return.
   */
  private cachedChannel: ElectrochemicalChannel | null = null;
  /** The inputs the stacks were last solved with, for a read with no arguments. */
  private lastInputs: BenchProbeInputs;
  readonly nominal: Nominal;

  /**
   * The competitors the instruments were calibrated against. Normal fasting
   * fructose and no polyol at all, which is what a calibration in a clinic
   * would see, and is exactly why an infusion later fools the probe.
   */
  private readonly calibration: Competitors = NORMAL_COMPETITORS;

  constructor(inputs: BenchProbeInputs, fidelity: Fidelity = "full", strideS?: number) {
    this.fidelity = fidelity;
    this.strideOverride = strideS;
    this.lastInputs = inputs;

    const opticalEnv = opticalEnvironment(inputs);
    const enzymaticEnv = enzymaticEnvironment(inputs);

    this.optical = new OpticalProbe(
      {
        capsuleThickness: micronsToMetres(effectiveCapsule(inputs.tipA)),
        foulingFraction: inputs.tipA.foulingFraction,
      },
      opticalEnv,
      { calibrationCompetitors: this.calibration },
    );
    const key = settleKey(inputs);
    const warm = settledCache.get(key);
    if (warm) this.optical.restore(warm.optical);
    else this.optical.settle(opticalEnv);

    this.enzymatic = new EnzymaticProbe(
      {
        capsuleThickness: micronsToMetres(effectiveCapsule(inputs.tipB)),
        foulingFraction: inputs.tipB.foulingFraction,
        fractured: !inputs.tipB.leadIntact,
      },
      enzymaticEnv,
    );
    if (warm) this.enzymatic.restore(warm.enzymatic);
    else this.enzymatic.settle(enzymaticEnv);
    if (!warm) {
      settledCache.set(key, {
        optical: this.optical.snapshot(),
        enzymatic: this.enzymatic.snapshot(),
      });
    }

    const factory = factoryCalibration();
    this.nominal = {
      opticalRatio: this.optical.noiselessRatio(opticalEnv),
      currentNa: raw(this.enzymatic.read(enzymaticEnv).current) * 1e9,
      impedanceKohm: this.enzymatic.read(enzymaticEnv).impedance.magnitude / 1000,
      currentPerMmolNa: factory.slope,
      currentZeroNa: factory.intercept,
    };
  }

  setFidelity(fidelity: Fidelity, strideS?: number): void {
    this.fidelity = fidelity;
    this.strideOverride = strideS;
  }

  /** Simulated seconds per solve, as it is actually running. */
  stride(): number {
    return this.strideOverride ?? FIDELITY_STEP[this.fidelity];
  }

  /**
   * Whether adding this many seconds would trigger a solve.
   *
   * The bench asks before building the inputs, because building them means
   * evaluating two pharmacokinetic curves and that is not worth doing on a
   * tick that is only going to be accumulated.
   */
  wouldSolve(simulatedSeconds: number): boolean {
    if (this.fidelity === "frozen") return false;
    return this.pending + simulatedSeconds >= this.stride();
  }

  /** The last amperometric read, without needing the inputs again. */
  channel(): ElectrochemicalChannel {
    return this.readElectrochemical(this.lastInputs);
  }

  /**
   * Force a solve of whatever time has accumulated.
   *
   * Called before an acquisition so the instrument reads a profile that is up
   * to date rather than up to one stride stale. Without this a coarse stride
   * would not only be cheaper, it would be wrong.
   */
  catchUp(inputs: BenchProbeInputs): void {
    if (this.fidelity === "frozen" || this.pending <= 0) return;
    const dt = this.pending;
    this.pending = 0;
    this.lastInputs = inputs;
    this.applyGeometry(inputs);
    this.optical.advance(seconds(dt), opticalEnvironment(inputs));
    this.enzymatic.advance(seconds(dt), enzymaticEnvironment(inputs));
    this.cachedChannel = null;
  }

  private applyGeometry(inputs: BenchProbeInputs): void {
    this.optical.setGeometry({
      capsuleThickness: micronsToMetres(effectiveCapsule(inputs.tipA)),
      foulingFraction: inputs.tipA.foulingFraction,
    });
    this.enzymatic.setGeometry({
      capsuleThickness: micronsToMetres(effectiveCapsule(inputs.tipB)),
      foulingFraction: inputs.tipB.foulingFraction,
      fractured: !inputs.tipB.leadIntact,
    });
  }

  currentFidelity(): Fidelity {
    return this.fidelity;
  }

  /**
   * Advance both stacks by `simulatedSeconds`.
   *
   * Seconds are accumulated until the mode's step is reached, so a `fast` run
   * still advances by exactly the elapsed time; it simply does so in fewer,
   * larger implicit steps. Nothing is dropped and nothing is extrapolated.
   */
  advance(simulatedSeconds: number, inputs: BenchProbeInputs): void {
    if (this.fidelity === "frozen") return;
    this.pending += simulatedSeconds;
    const stride = this.strideOverride ?? FIDELITY_STEP[this.fidelity];
    if (this.pending < stride) return;

    const dt = this.pending;
    this.pending = 0;
    this.lastInputs = inputs;

    this.applyGeometry(inputs);
    this.optical.advance(seconds(dt), opticalEnvironment(inputs));
    this.enzymatic.advance(seconds(dt), enzymaticEnvironment(inputs));
    this.cachedChannel = null;
  }

  /** Fire the optical flash and read both emission channels. */
  acquireOptical(stream: Stream, inputs: BenchProbeInputs): OpticalChannel {
    const env = opticalEnvironment(inputs);
    const reading = this.optical.acquire(stream, env);
    return {
      reading,
      localGlucoseMmol: raw(this.optical.diagnostics(env).freeGlucoseAtFibre),
      bleachSurvival: reading.indicatorSurvival,
      flashes: reading.flashes,
    };
  }

  /**
   * Free glucose the optical gel is sitting in, mmol/L.
   *
   * This is the bench's `localGlucose` for tip A, and it is not the same as
   * the fluid outside: the gel dissolves less glucose than water does, so it
   * sits below the bulk even at equilibrium. The instrument's calibration
   * takes that out; the bench's tip state shows it as it is.
   */
  opticalLocalGlucose(inputs: BenchProbeInputs): number {
    return raw(this.optical.diagnostics(opticalEnvironment(inputs)).freeGlucoseAtFibre);
  }

  /**
   * Glucose in the tissue immediately against the amperometric probe, mmol/L.
   *
   * Not the glucose the enzyme sees. The enzyme sees a few tens of micromoles
   * per litre, because starving it is what the outer membrane is for, and
   * putting that number on the bench's tip readout would be true and useless.
   * What the bench means by a tip's local glucose is what has reached the
   * probe, so this is the concentration at the inner face of the capsule.
   */
  enzymaticLocalGlucose(inputs: BenchProbeInputs): number {
    return this.enzymatic.glucoseAtMembrane(enzymaticEnvironment(inputs));
  }

  /** Flashes fired so far, for the bench's bleaching readout. */
  flashCount(): number {
    return this.optical.flashCount();
  }

  /** Surviving indicator dye as a fraction of new. */
  indicatorSurvival(): number {
    return this.optical.survival().indicator;
  }

  /** Reference-channel counts from the last flash, for the bench's readout. */
  referenceCounts(): number {
    return expectedReferenceCounts(this.optical.survival().reference);
  }

  /** The optical ratio with no counting noise on it, for a calibration read. */
  noiselessOpticalRatio(inputs: BenchProbeInputs): number {
    return this.optical.noiselessRatio(opticalEnvironment(inputs));
  }

  /**
   * Glucose the optical instrument reports from a ratio, mmol/L.
   *
   * `knownTemperatureC` is what the thermistor says. Passing the wrong
   * temperature is how a failed thermistor costs this channel accuracy, and
   * it costs it through the receptor's real affinity shift rather than
   * through an added error term.
   */
  glucoseFromOpticalRatio(ratio: number, knownTemperatureC: number): number {
    return raw(
      this.optical.invert(
        ratio,
        { temperature: celsiusToKelvin(knownTemperatureC), ph: ENV.peritonealPh },
        this.calibration,
      ),
    );
  }

  /**
   * Glucose the amperometric instrument reports from a current, mmol/L.
   *
   * A straight line through the factory calibration, which is all an
   * amperometric instrument can do: it sees one number and has to attribute
   * all of it to glucose. Everything the probe gets wrong, interference
   * included, arrives here as glucose.
   */
  glucoseFromCurrent(currentNa: number): number {
    return (currentNa - this.nominal.currentZeroNa) / this.nominal.currentPerMmolNa;
  }

  /** Read the amperometric channel. The current is a flux, so there is no flash. */
  readElectrochemical(inputs: BenchProbeInputs): ElectrochemicalChannel {
    if (this.cachedChannel) return this.cachedChannel;
    const env = enzymaticEnvironment(inputs);
    const reading = this.enzymatic.read(env);
    const diagnostics = this.enzymatic.diagnostics(env);
    const channel: ElectrochemicalChannel = {
      reading,
      currentNa: raw(reading.current) * 1e9,
      localGlucoseMmol: raw(diagnostics.betaAtEnzyme) + raw(diagnostics.alphaAtEnzyme),
      enzymeSurviving: diagnostics.enzymeSurviving,
      referenceDriftMv: raw(reading.referenceDrift) * 1000,
      impedanceKohm: reading.impedance.magnitude / 1000,
    };
    this.cachedChannel = channel;
    return channel;
  }

  /** Everything the lens view needs, without exposing the probes themselves. */
  diagnostics(inputs: BenchProbeInputs): {
    optical: ReturnType<OpticalProbe["diagnostics"]>;
    enzymatic: ReturnType<EnzymaticProbe["diagnostics"]>;
  } {
    return {
      optical: this.optical.diagnostics(opticalEnvironment(inputs)),
      enzymatic: this.enzymatic.diagnostics(enzymaticEnvironment(inputs)),
    };
  }

  /** The probes themselves, for the lens view to read profiles from. */
  probes(): { optical: OpticalProbe; enzymatic: EnzymaticProbe } {
    return { optical: this.optical, enzymatic: this.enzymatic };
  }

  /**
   * Replace the optical tip: new dye, no flashes yet.
   *
   * The tissue around it does not change, because a tip exchange threads a
   * new probe down the same lead into the same pocket. The bench decides what
   * happens to the capsule; this only resets what belongs to the probe.
   */
  replaceOptical(): void {
    this.optical.setSurvival(1, 1, 0);
  }

  /** Replace the enzymatic tip: fresh enzyme everywhere, a fresh reference. */
  replaceEnzymatic(): void {
    this.cachedChannel = null;
    const fresh = this.enzymatic.enzymeProfile();
    fresh.fill(raw(ENZ.enzymeLoading));
    this.enzymatic.setEnzyme(fresh);
    this.enzymatic.setCharge(0);
  }

  /** Dye survival a probe would have after this many flashes, for the UI. */
  static bleachAfter(flashes: number): number {
    return survivalAfterFlashes(flashes);
  }

  /** The nominal peak plasma paracetamol a one gram dose reaches, mmol/L. */
  static paracetamolPeakMmol(): number {
    return raw(ELEC.paracetamolPeak);
  }

  /** The infused polyol concentration the bench's mannitol fault applies. */
  static infusedPolyolMmol(): number {
    return raw(ENV.infusedPolyol);
  }

  /** Normal fasting plasma ascorbate, mmol/L. */
  static ascorbateBaselineMmol(): number {
    return raw(ENV.plasmaAscorbate);
  }

  /** Peak rise in plasma ascorbate after a one gram oral dose, mmol/L. */
  static ascorbateDoseRiseMmol(): number {
    return raw(ENV.ascorbateDoseRise);
  }

  /** Reference-channel photon counts on a brand new probe, for the readout. */
  static nominalCounts(): number {
    return expectedReferenceCounts(1);
  }
}
