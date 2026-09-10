import type { Envelope } from "./params.ts";
import type { BenchProbeInputs, Fidelity } from "./probes/bench.ts";
import type {
  ArbitrationState,
  AutonomyLevel,
  ChannelReading,
  LogEntry,
  LogStream,
  Sample,
  SimEvent,
  SimState,
  TipId,
  TipState,
} from "./types.ts";

import {
  basalCeiling,
  computeBasal,
  computeCorrectionBolus,
  computeMealBolus,
} from "./controller.ts";
import {
  AGEING,
  ARBITRATION,
  CONTROLLER,
  defaultEnvelope,
  ELECTROCHEMICAL,
  normaliseEnvelope,
  OPTICAL,
  PHYSIOLOGY,
  SENSING,
} from "./params.ts";
import { BenchProbes } from "./probes/bench.ts";
import { PHOTO } from "./probes/constants.ts";
import { raw } from "./probes/units.ts";
import { Rng } from "./rng.ts";
import { AUTONOMY } from "./types.ts";

/**
 * The bench engine.
 *
 * One `SimEngine` is one device in one simulated body. `step()` advances
 * exactly one simulated second. Nothing in this file touches React, the DOM
 * or Math.random, so the same engine runs in the Web Worker, in the command
 * line runner and in the tests, and produces the same numbers in all three.
 *
 * Illustrative simulation of a device that does not yet exist. Every
 * parameter is an engineering estimate. Not a medical device.
 */

export type AuditEntry = {
  t: number;
  actor: string;
  change: string;
  mfaSatisfied: boolean;
};

export type EngineOptions = {
  seed: number;
  envelope?: Partial<Envelope>;
  /**
   * When true the simulated patient calibrates whenever the device prompts.
   * The missed-calibration fault switches this off for as long as it is set.
   */
  autoCalibrate?: boolean;
  /** Set to zero to model a device with no dexamethasone collar (scenario 9). */
  steroidEffectScale?: number;
  /** Maximum samples retained. The bench keeps its own ring buffers. */
  maxSamples?: number;
  /** Maximum log entries retained. */
  maxLog?: number;
  /** Called for every sample the run produces, before any buffer drops it. */
  onSample?: (sample: Sample) => void;
  /**
   * Which front end turns glucose into a signal.
   *
   * `physics` runs the transport, chemistry and photon counting in
   * `src/engine/probes`. `placeholder` runs the linearised front end the
   * bench shipped with, and is kept so the two can be put side by side; it is
   * not a fallback and nothing chooses it automatically.
   */
  frontEnd?: FrontEnd;
  /**
   * Simulated seconds per probe solve, overriding the fidelity preset.
   *
   * A run that spans months passes a larger stride, because nothing over that
   * horizon turns on second-by-second transport and ten seconds would cost
   * twenty minutes of wall clock. The stacks are still solved to the moment of
   * every acquisition, so a coarse stride costs cycles between readings and
   * not the readings themselves.
   */
  probeStrideS?: number;
  /**
   * How often the physics front end solves. Ignored by the placeholder.
   * `fast` is the default: it is the same model at a ten second implicit
   * step, which costs under two tenths of a per cent against `full` and fits
   * the bench's budget.
   */
  fidelity?: Fidelity;
};

export type FrontEnd = "placeholder" | "physics";

const SECONDS_PER_MINUTE = 60;
const SECONDS_PER_DAY = 86_400;
const DT_S = 1;
const DT_MIN = DT_S / SECONDS_PER_MINUTE;
const DT_DAY = DT_S / SECONDS_PER_DAY;
/** Acquisitions spanned by the rate-of-change plausibility check. */
const RATE_WINDOW_SAMPLES = 3;
/** Acquisitions averaged into the reported value. Costs about 1 min of lag. */
const FILTER_SAMPLES = 3;
/**
 * Time constant of the impedance and optical-return baselines, days. Long
 * enough that capsule growth and fouling are tracked rather than accused,
 * short enough that the device re-baselines after a genuine step.
 */
const BASELINE_TAU_DAYS = 5;

function clamp(value: number, low: number, high: number): number {
  return value < low ? low : value > high ? high : value;
}

/** Mean of the most recent samples, or null when the channel is dead. */
function filteredValue(history: readonly number[]): number | null {
  if (history.length === 0) return null;
  const take = Math.min(FILTER_SAMPLES, history.length);
  let sum = 0;
  for (let i = history.length - take; i < history.length; i += 1) sum += history[i] ?? 0;
  return sum / take;
}

function freshTip(id: TipId): TipState {
  return {
    id,
    capsuleMicron: 0,
    localGlucose: PHYSIOLOGY.startingGlucose,
    ageDays: 0,
    fouling: 0,
    wrapAttenuation: 1,
    wrapImpedanceFactor: 1,
    flashes: 0,
    leadIntact: true,
    health: 1,
    flags: [],
  };
}

const DEAD_READING: ChannelReading = {
  glucose: null,
  instantaneous: null,
  uncertainty: 99,
  raw: 0,
  healthy: false,
};

export class SimEngine {
  readonly state: SimState;
  readonly log: LogEntry[] = [];
  readonly audit: AuditEntry[] = [];
  readonly samples: Sample[] = [];
  /** Samples produced since t = 0, including any the buffer has dropped. */
  samplesProduced = 0;

  private readonly rng: Rng;
  private readonly maxSamples: number;
  private readonly maxLog: number;
  private autoCalibrate: boolean;
  private readonly onSample: ((sample: Sample) => void) | undefined;
  private steroidEffectScale: number;
  readonly frontEnd: FrontEnd;
  /** Null on the placeholder front end. */
  private probes: BenchProbes | null = null;

  /** Rolling buffer of fused values, one per acquisition, for the rate estimate. */
  private fusedHistory: Array<{ t: number; g: number }> = [];
  /**
   * Last few readings per channel, for the rate-of-change plausibility check.
   * A single-sample difference is dominated by measurement noise, so the check
   * is run across three acquisitions and against a threshold that already
   * allows for the channel's own noise. Otherwise the supervisor spends its
   * time accusing a perfectly healthy tip of moving too fast.
   */
  private historyA: number[] = [];
  private historyB: number[] = [];
  /** Long-baseline expectations the device compares against to spot step changes. */
  private impedanceBaseline: number | null = null;
  private opticalBaseline: number | null = null;
  /** Set by a calibration, cleared whenever autonomy is lowered. */
  private freshCalibration = false;
  private prevArbitration: ArbitrationState = "valid";
  /** Seconds of continuous unexplained disagreement. */
  private disagreementS = 0;
  /**
   * Seconds the two readings have been outside the agreement window.
   *
   * Separate from `disagreementS`, which counts how long the supervisor has
   * already been in `invalid` and therefore cannot be used to decide whether
   * to enter it.
   */
  private outsideWindowS = 0;
  private suspendedNow = false;
  private predictiveHoldNow = false;

  constructor(options: EngineOptions) {
    this.rng = new Rng(options.seed);
    this.maxSamples = options.maxSamples ?? 200_000;
    this.maxLog = options.maxLog ?? 5_000;
    this.autoCalibrate = options.autoCalibrate ?? true;
    this.onSample = options.onSample;
    this.steroidEffectScale = options.steroidEffectScale ?? 1;
    this.frontEnd = options.frontEnd ?? "physics";

    const envelope = normaliseEnvelope({ ...defaultEnvelope(), ...options.envelope });
    const fidelity: Fidelity = options.fidelity ?? "fast";

    const g0 = PHYSIOLOGY.startingGlucose;
    const xb = this.basalInsulinAction();

    this.state = {
      t: 0,
      seed: options.seed,
      plasmaGlucose: g0,
      peritonealGlucose: g0,
      subcutaneousGlucose: g0,
      plasmaInsulin: PHYSIOLOGY.insulinBasal,
      insulinAction: xb,
      mealQ1: 0,
      mealQ2: 0,
      mealRa: 0,
      oxygenMmHg: PHYSIOLOGY.oxygenNominalMmHg,
      exercising: false,
      asleep: false,
      sleepElapsedS: 0,
      paracetamolElapsedS: null,
      paracetamolGrams: 1,
      bleachFraction: 0,
      vitaminCElapsedS: null,
      mannitolOn: false,
      lowOxygenOn: false,
      tipA: freshTip("A"),
      tipB: freshTip("B"),
      enzymeActivity: 1,
      referenceDriftMv: 0,
      impedanceKohm: ELECTROCHEMICAL.impedanceBaseKohm,
      impedanceExpectedKohm: ELECTROCHEMICAL.impedanceBaseKohm,
      tipTemperatureC: SENSING.tipTemperatureC,
      thermistorOk: true,
      readingA: {
        glucose: g0,
        instantaneous: g0,
        uncertainty: 0.2,
        raw: OPTICAL.ratioZero,
        healthy: true,
      },
      readingB: {
        glucose: g0,
        instantaneous: g0,
        uncertainty: 0.2,
        raw: ELECTROCHEMICAL.currentZeroNa,
        healthy: true,
      },
      fusedGlucose: g0,
      fusedUncertainty: 0.2,
      fusedRate: 0,
      arbitration: "valid",
      arbitrationReasons: ["Both tips healthy and in agreement"],
      evidenceScore: 1,
      autonomy: AUTONOMY.full,
      agreementHoldS: ARBITRATION.recoveryHoldMin * SECONDS_PER_MINUTE,
      lastCalibrationT: 0,
      calGainA: 1,
      calGainB: 1,
      calOffsetA: 0,
      calOffsetB: 0,
      missedCalibration: false,
      driftA: 1,
      driftB: 1,
      basalCommand: envelope.basalRate,
      bolusRemainingU: 0,
      deliveryRateUph: envelope.basalRate,
      totalInsulinU: 0,
      iob: 0,
      integral: 0,
      lastCorrectionT: null,
      dosingNow: true,
      bolusActive: false,
      pendingCarbG: 0,
      telemetryOk: true,
      phonePresent: true,
      batteryLow: false,
      cgmBridged: false,
      silenceS: 0,
      envelope,
      alertCount: 0,
    };

    if (this.frontEnd === "physics") {
      this.probes = new BenchProbes(this.probeInputs(), fidelity, options.probeStrideS);
      this.state.impedanceKohm = this.probes.nominal.impedanceKohm;
      this.state.impedanceExpectedKohm = this.probes.nominal.impedanceKohm;
    }

    // Calibrate at implant, with the meter's own error, so that error is in
    // the numbers from the first second rather than appearing a week later.
    this.calibrate("implant");
    this.state.alertCount = 0;
  }

  // ------------------------------------------------------------------------
  // The physics front end
  // ------------------------------------------------------------------------

  /**
   * The bench's state, in the vocabulary the probes take.
   *
   * The two interferents arrive as plasma concentrations rather than as
   * currents: on this front end the probe works out its own interference from
   * how much of each molecule reaches the platinum, so the bench's job is only
   * to say what is in the blood.
   */
  private probeInputs(): BenchProbeInputs {
    const s = this.state;
    return {
      glucoseMmol: s.peritonealGlucose,
      oxygenMmHg: s.oxygenMmHg,
      temperatureC: s.tipTemperatureC,
      paracetamolMmol: this.interferentConcentration(
        s.paracetamolElapsedS,
        BenchProbes.paracetamolPeakMmol() * s.paracetamolGrams,
        ELECTROCHEMICAL.paracetamolTauAbsorbMin,
        ELECTROCHEMICAL.paracetamolHalfLifeMin,
      ),
      ascorbateMmol:
        BenchProbes.ascorbateBaselineMmol() +
        this.interferentConcentration(
          s.vitaminCElapsedS,
          BenchProbes.ascorbateDoseRiseMmol(),
          ELECTROCHEMICAL.vitaminCTauAbsorbMin,
          ELECTROCHEMICAL.vitaminCHalfLifeMin,
        ),
      polyolMmol: s.mannitolOn ? BenchProbes.infusedPolyolMmol() : 0,
      tipA: {
        capsuleMicron: s.tipA.capsuleMicron,
        foulingFraction: s.tipA.fouling,
        leadIntact: s.tipA.leadIntact,
      },
      tipB: {
        capsuleMicron: s.tipB.capsuleMicron,
        foulingFraction: s.tipB.fouling,
        leadIntact: s.tipB.leadIntact,
      },
    };
  }

  /**
   * The same absorption-then-elimination shape the placeholder used, but
   * scaled to a plasma concentration rather than to a current. The shape is
   * pharmacokinetics and belongs to the body; what the probe does with the
   * molecule belongs to the probe.
   */
  /**
   * The inputs on a tick that is only being accumulated.
   *
   * `advance` reads nothing from them unless it is about to solve, and the
   * caller has already established that it is not, so the expensive parts are
   * left out. If that ever stops being true `wouldSolve` is the thing to
   * change, not this.
   */
  private probeInputsLight(): BenchProbeInputs {
    const s = this.state;
    return {
      glucoseMmol: s.peritonealGlucose,
      oxygenMmHg: s.oxygenMmHg,
      temperatureC: s.tipTemperatureC,
      paracetamolMmol: 0,
      ascorbateMmol: 0,
      polyolMmol: 0,
      tipA: { capsuleMicron: 0, foulingFraction: 0, leadIntact: true },
      tipB: { capsuleMicron: 0, foulingFraction: 0, leadIntact: true },
    };
  }

  private interferentConcentration(
    elapsedS: number | null,
    peak: number,
    tauAbsorb: number,
    halfLife: number,
  ): number {
    if (elapsedS === null) return 0;
    const t = elapsedS / SECONDS_PER_MINUTE;
    const tauElim = halfLife / Math.LN2;
    const shape = Math.exp(-t / tauElim) - Math.exp(-t / tauAbsorb);
    const tPeak = (Math.log(tauElim / tauAbsorb) * (tauAbsorb * tauElim)) / (tauElim - tauAbsorb);
    const norm = Math.exp(-tPeak / tauElim) - Math.exp(-tPeak / tauAbsorb);
    return (peak * Math.max(0, shape)) / norm;
  }

  // ------------------------------------------------------------------------
  // Derived constants
  // ------------------------------------------------------------------------

  /** Insulin action at basal insulin, chosen so the body starts at steady state. */
  private basalInsulinAction(): number {
    const net = PHYSIOLOGY.egpBasal - PHYSIOLOGY.uptakeInsulinIndependent;
    return net / (PHYSIOLOGY.glucoseVolumeL * PHYSIOLOGY.startingGlucose);
  }

  private sensitivityFactor(): number {
    const s = this.state;
    let f = 1;
    if (s.exercising) f *= 1 + PHYSIOLOGY.exerciseSensitivityGain;
    if (s.asleep) f *= PHYSIOLOGY.sleepSensitivityFactor;
    return f;
  }

  // ------------------------------------------------------------------------
  // Public surface
  // ------------------------------------------------------------------------

  /** The basal ceiling the current autonomy level allows, U/h. */
  currentBasalCeiling(): number {
    return basalCeiling(this.state.envelope, this.state.autonomy);
  }

  /** Advance exactly one simulated second. */
  step(): void {
    const s = this.state;
    s.t += DT_S;

    this.stepPhysiology();
    this.stepAgeing();

    if (s.t % SENSING.impedanceSweepPeriodS === 0) this.impedanceSweep();
    if (s.t % this.acquisitionPeriod() === 0) this.acquire();

    this.stepArbitration();
    this.stepController();
    this.stepPump();
    this.stepConnectivity();
    this.stepCalibrationPrompt();
  }

  /** Advance n simulated seconds. */
  run(seconds: number): void {
    for (let i = 0; i < seconds; i += 1) this.step();
  }

  apply(event: SimEvent): void {
    const s = this.state;
    switch (event.kind) {
      case "meal": {
        s.mealQ1 += event.grams * PHYSIOLOGY.mmolPerGramCarb;
        if (event.announced) s.pendingCarbG += event.grams;
        this.write(
          "clinical",
          "MEAL",
          `${event.grams} g carbohydrate, ${event.announced ? "announced to the controller" : "not announced"}`,
        );
        break;
      }
      case "exercise-start":
        s.exercising = true;
        this.write(
          "clinical",
          "EXER",
          "Exercise started: insulin sensitivity up 40 percent, peritoneal oxygen down 15 percent",
        );
        break;
      case "exercise-stop":
        s.exercising = false;
        this.write("clinical", "EXER", "Exercise ended");
        break;
      case "sleep-start":
        s.asleep = true;
        s.sleepElapsedS = 0;
        this.write("clinical", "SLEP", "Sleep started");
        break;
      case "sleep-stop":
        s.asleep = false;
        s.sleepElapsedS = 0;
        this.write("clinical", "SLEP", "Sleep ended");
        break;
      case "paracetamol": {
        s.paracetamolElapsedS = 0;
        s.paracetamolGrams = event.grams ?? 1;
        this.write(
          "clinical",
          "DRUG",
          `Paracetamol taken, ${s.paracetamolGrams} g: the platinum oxidises it alongside the peroxide, 4 h half-life`,
        );
        break;
      }
      case "vitamin-c":
        s.vitaminCElapsedS = 0;
        this.write(
          "clinical",
          "DRUG",
          "Vitamin C taken: adds up to 3 nA to the electrochemical tip, 1 h half-life",
        );
        break;
      case "mannitol":
        s.mannitolOn = !s.mannitolOn;
        this.write(
          "clinical",
          "DRUG",
          s.mannitolOn
            ? "Mannitol infusion started: adds 0.25 to the optical ratio, about 4.2 mmol/L of apparent glucose"
            : "Mannitol infusion stopped",
        );
        break;
      case "low-oxygen":
        s.lowOxygenOn = event.on;
        this.write(
          "device",
          "PO2",
          event.on
            ? `Peritoneal oxygen lowered to ${PHYSIOLOGY.oxygenFaultMmHg} mmHg`
            : "Peritoneal oxygen restored",
        );
        break;
      case "protein-deposition":
        s.tipB.fouling = clamp(s.tipB.fouling + AGEING.foulingEventStep, 0, 1);
        this.write(
          "device",
          "FOUL",
          `Protein deposition on tip B: fouling now ${(s.tipB.fouling * 100).toFixed(0)} percent`,
        );
        break;
      case "omental-wrap": {
        const tip = event.tip === "A" ? s.tipA : s.tipB;
        tip.capsuleMicron += AGEING.omentalWrapMicron;
        tip.wrapAttenuation = Math.min(tip.wrapAttenuation, 0.45);
        tip.wrapImpedanceFactor = Math.max(tip.wrapImpedanceFactor, 1.8);
        this.write(
          "device",
          "WRAP",
          `Omentum wrapped tip ${event.tip}: capsule +${AGEING.omentalWrapMicron} um, optical return down to 45 percent`,
        );
        break;
      }
      case "lead-a-fracture":
        s.tipA.leadIntact = false;
        this.alert("device", "LEAD", "Lead A fibre fracture: optical channel lost");
        break;
      case "lead-b-fracture":
        s.tipB.leadIntact = false;
        this.alert(
          "device",
          "LEAD",
          "Lead B conductor fracture: electrochemical channel lost, impedance open circuit",
        );
        break;
      case "thermistor-failure":
        s.thermistorOk = false;
        this.alert(
          "device",
          "TEMP",
          "Thermistor failed: temperature compensation falls back to 37.0 C, uncertainty widened",
        );
        break;
      case "telemetry-loss":
        s.telemetryOk = false;
        this.write(
          "device",
          "RADI",
          "Telemetry radio lost. The loop inside the body is unaffected",
        );
        break;
      case "telemetry-restore":
        s.telemetryOk = true;
        s.silenceS = 0;
        this.write("device", "RADI", "Telemetry restored");
        break;
      case "phone-lost":
        s.phonePresent = false;
        this.write("device", "PHON", "Phone lost. The loop inside the body is unaffected");
        break;
      case "phone-found":
        s.phonePresent = true;
        s.silenceS = 0;
        this.write("device", "PHON", "Phone back in range");
        break;
      case "battery-low":
        s.batteryLow = !s.batteryLow;
        this.alert(
          "device",
          "BATT",
          s.batteryLow
            ? "Battery low: optical acquisition drops to one flash every 5 min, uncertainty widens"
            : "Battery recovered: acquisition back to 60 s",
        );
        break;
      case "missed-calibration":
        s.missedCalibration = event.on;
        this.autoCalibrate = !event.on;
        this.write(
          "clinical",
          "CAL",
          event.on
            ? "Calibration prompts are being ignored"
            : "Calibration prompts are being answered again",
        );
        break;
      case "envelope-change": {
        const before = { ...s.envelope };
        Object.assign(s.envelope, normaliseEnvelope({ ...s.envelope, ...event.envelope }));
        // A tightened ceiling applies to insulin already in flight, not only
        // to the next decision. Otherwise a bolus authorised under the old
        // envelope would keep delivering past the new bound.
        s.bolusRemainingU = Math.min(s.bolusRemainingU, s.envelope.maxBolus);
        s.basalCommand = Math.min(s.basalCommand, s.envelope.maxBasal);
        const changed = Object.keys(event.envelope)
          .map((key) => {
            const k = key as keyof Envelope;
            return `${key}: ${String(before[k])} to ${String(s.envelope[k])}`;
          })
          .join(", ");
        this.audit.push({ t: s.t, actor: event.actor, change: changed, mfaSatisfied: true });
        this.write("clinical", "ENVL", `Clinician envelope changed by ${event.actor}. ${changed}`);
        break;
      }
      case "calibrate":
        this.calibrate("finger-prick");
        break;
      case "flush": {
        for (const tip of [s.tipA, s.tipB]) {
          tip.capsuleMicron *= 1 - AGEING.flushRemovalFraction;
          tip.fouling *= 1 - AGEING.flushFoulingRemoval;
          tip.wrapAttenuation = tip.wrapAttenuation + (1 - tip.wrapAttenuation) * 0.5;
          tip.wrapImpedanceFactor = 1 + (tip.wrapImpedanceFactor - 1) * 0.5;
        }
        this.write(
          "clinical",
          "FLSH",
          `Flush: 20 percent of the capsule surface layer removed, fouling halved. Tip A capsule ${s.tipA.capsuleMicron.toFixed(0)} um`,
        );
        break;
      }
      case "tip-exchange": {
        const replaced = freshTip(event.tip);
        if (event.tip === "A") {
          replaced.localGlucose = s.tipA.localGlucose;
          s.tipA = replaced;
        } else {
          replaced.localGlucose = s.tipB.localGlucose;
          s.tipB = replaced;
          s.enzymeActivity = 1;
          s.referenceDriftMv = 0;
        }
        if (this.probes) {
          if (event.tip === "A") this.probes.replaceOptical();
          else this.probes.replaceEnzymatic();
        }
        this.impedanceBaseline = null;
        this.opticalBaseline = null;
        if (event.tip === "A") this.historyA.length = 0;
        else this.historyB.length = 0;
        this.write(
          "clinical",
          "TIPX",
          `Tip ${event.tip} exchanged: ageing, fouling and lead integrity reset`,
        );
        break;
      }
      case "cgm-bridge-on":
        s.cgmBridged = true;
        this.write(
          "clinical",
          "BRDG",
          "External continuous glucose monitor bridged through the phone. Basal only, never full",
        );
        break;
      case "cgm-bridge-off":
        s.cgmBridged = false;
        this.write("clinical", "BRDG", "External continuous glucose monitor removed");
        break;
    }
  }

  // ------------------------------------------------------------------------
  // Physiology
  // ------------------------------------------------------------------------

  private stepPhysiology(): void {
    const s = this.state;
    const sens = this.sensitivityFactor();

    // Meal absorption, two compartments, appearance peaking at 1/k = 45 min.
    const k = PHYSIOLOGY.mealAbsorptionRate;
    const toQ2 = k * s.mealQ1 * DT_MIN;
    const outQ2 = k * s.mealQ2 * DT_MIN;
    s.mealQ1 = Math.max(0, s.mealQ1 - toQ2);
    s.mealQ2 = Math.max(0, s.mealQ2 + toQ2 - outQ2);
    s.mealRa = (PHYSIOLOGY.mealBioavailability * outQ2) / DT_MIN;

    // Endogenous production, suppressed by insulin, lifted a little at dawn.
    let egpMultiplier =
      1 - PHYSIOLOGY.egpInsulinSensitivity * (s.plasmaInsulin - PHYSIOLOGY.insulinBasal);
    if (s.asleep && s.sleepElapsedS > 5 * 3600) egpMultiplier *= PHYSIOLOGY.dawnProductionFactor;
    egpMultiplier = clamp(egpMultiplier, PHYSIOLOGY.egpMultiplierMin, PHYSIOLOGY.egpMultiplierMax);
    const egp = PHYSIOLOGY.egpBasal * egpMultiplier;

    // Plasma glucose. Minimal-model form: appearance and production per unit
    // volume, less constant insulin-independent uptake, less insulin action.
    const dG =
      (s.mealRa + egp - PHYSIOLOGY.uptakeInsulinIndependent) / PHYSIOLOGY.glucoseVolumeL -
      s.insulinAction * s.plasmaGlucose;
    s.plasmaGlucose = clamp(
      s.plasmaGlucose + dG * DT_MIN,
      PHYSIOLOGY.glucoseFloor,
      PHYSIOLOGY.glucoseCeiling,
    );

    // Insulin: one compartment from delivery to plasma, then remote action.
    const insulinTarget = PHYSIOLOGY.insulinGainPerUnitPerHour * s.deliveryRateUph;
    s.plasmaInsulin += ((insulinTarget - s.plasmaInsulin) / PHYSIOLOGY.tauInsulinMin) * DT_MIN;
    const actionTarget =
      sens *
      (this.basalInsulinAction() + PHYSIOLOGY.p2 * (s.plasmaInsulin - PHYSIOLOGY.insulinBasal));
    s.insulinAction = Math.max(
      0,
      s.insulinAction + ((actionTarget - s.insulinAction) / PHYSIOLOGY.tauActionMin) * DT_MIN,
    );

    // Insulin on board, relative to the nominal basal rate. Allowed to go
    // negative after a suspend, which is a real deficit the controller should
    // be allowed to see.
    s.iob += ((s.deliveryRateUph - s.envelope.basalRate) / 60) * DT_MIN;
    s.iob -= (s.iob / CONTROLLER.tauIobMin) * DT_MIN;
    s.iob = clamp(s.iob, -2, 20);

    // Compartments. Peritoneal is what the implants see; subcutaneous is the
    // comparator ghost trace and is never used for dosing.
    s.peritonealGlucose +=
      ((s.plasmaGlucose - s.peritonealGlucose) / PHYSIOLOGY.tauPeritonealMin) * DT_MIN;
    s.subcutaneousGlucose +=
      ((s.plasmaGlucose - s.subcutaneousGlucose) / PHYSIOLOGY.tauSubcutaneousMin) * DT_MIN;

    if (this.probes) {
      // The stacks are the lag. There is no separate compartment and no time
      // constant: the capsule, the membranes and the sensing layer set how
      // fast the probe follows the fluid, and they do it by diffusing.
      //
      // The inputs are only built on a tick that is going to be solved.
      // Building them means evaluating two pharmacokinetic curves, and on a
      // tick that is merely being accumulated that is pure waste.
      if (this.probes.wouldSolve(DT_S)) {
        const inputs = this.probeInputs();
        this.probes.advance(DT_S, inputs);
        s.tipA.localGlucose = this.probes.opticalLocalGlucose(inputs);
        s.tipB.localGlucose = this.probes.enzymaticLocalGlucose(inputs);
        s.tipA.flashes = this.probes.flashCount();
      } else {
        this.probes.advance(DT_S, this.probeInputsLight());
      }
    } else {
      for (const tip of [s.tipA, s.tipB]) {
        const tauCap =
          PHYSIOLOGY.tauCapsuleBaseMin + PHYSIOLOGY.tauCapsulePerMicron * tip.capsuleMicron;
        tip.localGlucose += ((s.peritonealGlucose - tip.localGlucose) / tauCap) * DT_MIN;
      }
    }

    // Peritoneal oxygen. Exercise and a thick capsule both lower it.
    const base = s.lowOxygenOn ? PHYSIOLOGY.oxygenFaultMmHg : PHYSIOLOGY.oxygenNominalMmHg;
    s.oxygenMmHg =
      base *
      (1 - (s.exercising ? PHYSIOLOGY.exerciseOxygenDrop : 0)) *
      Math.exp(-s.tipB.capsuleMicron / PHYSIOLOGY.oxygenCapsuleScaleMicron);

    if (s.asleep) s.sleepElapsedS += DT_S;
    if (s.paracetamolElapsedS !== null) s.paracetamolElapsedS += DT_S;
    if (s.vitaminCElapsedS !== null) s.vitaminCElapsedS += DT_S;
  }

  // ------------------------------------------------------------------------
  // Ageing
  // ------------------------------------------------------------------------

  private stepAgeing(): void {
    const s = this.state;

    for (const tip of [s.tipA, s.tipB]) {
      tip.ageDays += DT_DAY;
      // Only tip A carries the dexamethasone acetate collar.
      const steroid =
        tip.id === "A"
          ? this.steroidEffectScale *
            AGEING.steroidEffect0 *
            Math.exp(-tip.ageDays / AGEING.steroidTauDays)
          : 0;
      const growth = AGEING.capsuleGrowthPerDay * (1 - steroid) * (1 - AGEING.coatEffect);
      const remodel = tip.capsuleMicron / AGEING.capsuleRemodelTauDays;
      tip.capsuleMicron = Math.max(0, tip.capsuleMicron + (growth - remodel) * DT_DAY);
      tip.fouling = clamp(
        tip.fouling + AGEING.foulingRatePerDay * (1 - tip.fouling) * DT_DAY,
        0,
        1,
      );
    }

    if (this.probes) {
      // Both of these come out of the probe rather than out of a curve. The
      // enzyme falls at the rate its own peroxide sets, slice by slice, and
      // the reference drifts by the Nernst equation as its silver chloride is
      // spent at the signal current.
      const channel = this.probes.channel();
      s.enzymeActivity = channel.enzymeSurviving;
      s.referenceDriftMv = channel.referenceDriftMv;
      s.bleachFraction = 1 - this.probes.indicatorSurvival();
    } else {
      s.bleachFraction = 1 - Math.exp(-s.tipA.flashes / AGEING.photobleachHalfScaleFlashes);
      s.enzymeActivity = Math.exp(-s.tipB.ageDays / AGEING.enzymeTauDays);

      const day = s.tipB.ageDays;
      const beforeKnee = Math.min(day, AGEING.chlorideKneeDay);
      const afterKnee = Math.max(0, day - AGEING.chlorideKneeDay);
      s.referenceDriftMv =
        AGEING.chlorideDriftMvPerDay * (beforeKnee + AGEING.chlorideAccelFactor * afterKnee);
    }
  }

  // ------------------------------------------------------------------------
  // Acquisition
  // ------------------------------------------------------------------------

  /** Acquisition period in seconds. A low battery slows the optical flash rate. */
  private acquisitionPeriod(): number {
    return this.state.batteryLow ? SENSING.acquisitionPeriodS * 5 : SENSING.acquisitionPeriodS;
  }

  private acquire(): void {
    const s = this.state;
    // Put whatever time has accumulated into the stacks before reading them,
    // so the instrument reads a profile that is current rather than up to one
    // stride stale.
    //
    // Only while the stride is shorter than the acquisition period. Past that
    // the catch-up would be the whole cost of the front end, and a run that
    // spans months would take an hour of wall clock; those runs ask what the
    // year did to the hardware, not what the glucose was at half past two. So
    // beyond the acquisition period the stride stops being a cost-only choice
    // and the readings begin to lag. Both channels lag together, so they still
    // agree with each other and the supervisor is not fooled, but the reading
    // is no longer the current glucose. The bench never runs this way.
    if (this.probes && this.probes.stride() <= this.acquisitionPeriod()) {
      this.probes.catchUp(this.probeInputs());
    }

    s.tipTemperatureC = this.rng
      .stream("thermistor")
      .gauss(SENSING.tipTemperatureC, SENSING.tipTemperatureNoiseC);
    const knownTemperature = s.thermistorOk ? s.tipTemperatureC : SENSING.thermistorFallbackC;

    // The noise on a filtered value falls as 1/sqrt(n), so the front ends are
    // told how many samples the filter will have before they report their
    // uncertainty. No claim is made that is better than the data supports.
    const nA = Math.min(this.historyA.length + 1, FILTER_SAMPLES);
    const nB = Math.min(this.historyB.length + 1, FILTER_SAMPLES);
    this.stepDrift();
    s.readingA = this.acquireOptical(knownTemperature, 1 / Math.sqrt(nA));
    s.readingB = this.acquireElectrochemical(knownTemperature, 1 / Math.sqrt(nB));

    this.pushHistory(this.historyA, s.readingA);
    this.pushHistory(this.historyB, s.readingB);
    s.readingA.glucose = filteredValue(this.historyA);
    s.readingB.glucose = filteredValue(this.historyB);

    this.fuse();
  }

  /**
   * Slow sensitivity drift, one Ornstein-Uhlenbeck process per channel.
   * This is what a calibration corrects and what makes days since calibration
   * a real number rather than a decoration.
   */
  private stepDrift(): void {
    const s = this.state;
    const dtDays = this.acquisitionPeriod() / SECONDS_PER_DAY;
    const tau = SENSING.sensorDriftTauDays;
    const sd = SENSING.sensorDriftSd;
    const pull = dtDays / tau;

    // The two front ends put this drift in different physical places, so it
    // is not the same size in both.
    //
    // On the placeholder it is a sensitivity: a fraction of the reported
    // glucose, on both channels, and a one point calibration takes it out.
    //
    // On the physics front end the optical channel has no sensitivity to
    // drift. It is ratiometric, so anything common to both emission bands
    // divides out; the dye can bleach to half and the reading does not move.
    // What survives is the *difference* between the two bands, one filter
    // ageing faster than the other, and that is a much smaller number. It is
    // also a much more damaging one, because the switch is steep: half a per
    // cent on the ratio arrives as about one and a half per cent of glucose,
    // and a one point gain calibration cannot remove it, since the inversion
    // is a chemistry and not a gain. That is a real property of this
    // transduction and the model shows it rather than hiding it.
    //
    // The amperometric channel is single ended, so on both front ends the
    // drift is the transimpedance amplifier's gain and a calibration does
    // take it out.
    const sdA = this.probes ? raw(PHOTO.channelGainDriftSd) : sd;
    const kickA = sdA * Math.sqrt((2 * dtDays) / tau);
    const kick = sd * Math.sqrt((2 * dtDays) / tau);
    s.driftA += -(s.driftA - 1) * pull + kickA * this.rng.stream("drift-a").normal();
    s.driftB += -(s.driftB - 1) * pull + kick * this.rng.stream("drift-b").normal();
    s.driftA = clamp(s.driftA, 0.6, 1.4);
    s.driftB = clamp(s.driftB, 0.6, 1.4);
  }

  /** Record the unfiltered value, or drop the history when a channel dies. */
  private pushHistory(history: number[], reading: ChannelReading): void {
    if (reading.instantaneous === null) {
      history.length = 0;
      return;
    }
    history.push(reading.instantaneous);
    if (history.length > RATE_WINDOW_SAMPLES + 1) history.shift();
  }

  private opticalCounts(): number {
    const s = this.state;
    if (this.probes) {
      // Real counts, from the reference channel of the last flash. The capsule
      // does not dim them: the fibre and the gel are inside the housing and
      // the light never crosses the tissue.
      return this.probes.referenceCounts();
    }
    const bleach = Math.exp(-s.tipA.flashes / AGEING.photobleachHalfScaleFlashes);
    const capsuleLoss = Math.max(0.05, 1 - OPTICAL.opticalLossPerMicron * s.tipA.capsuleMicron);
    return OPTICAL.counts0 * bleach * capsuleLoss * s.tipA.wrapAttenuation;
  }

  private acquireOptical(knownTemperature: number, filterGain: number): ChannelReading {
    const s = this.state;
    if (!s.tipA.leadIntact) return { ...DEAD_READING };

    if (this.probes) return this.acquireOpticalPhysics(filterGain);

    s.tipA.flashes += OPTICAL.flashesPerAcquisition;

    const counts = this.opticalCounts();
    // Photon-limited noise: the standard deviation rises as 1/sqrt(counts).
    const noiseSd = OPTICAL.ratioNoiseSd0 * Math.sqrt(OPTICAL.counts0 / Math.max(counts, 1));

    const ratio =
      OPTICAL.ratioZero +
      OPTICAL.ratioPerMmol * s.driftA * s.tipA.localGlucose +
      (s.mannitolOn ? OPTICAL.mannitolOffset : 0) +
      OPTICAL.ratioPerDegC * (s.tipTemperatureC - SENSING.tipTemperatureC) +
      this.rng.stream("optical-noise").gauss(0, noiseSd);

    // The device subtracts the temperature term it believes in, which is the
    // thermistor reading, or 37.0 C when the thermistor has failed.
    const compensated = ratio - OPTICAL.ratioPerDegC * (knownTemperature - SENSING.tipTemperatureC);
    const rawGlucose = (compensated - OPTICAL.ratioZero) / OPTICAL.ratioPerMmol;
    const glucose = s.calGainA * rawGlucose + s.calOffsetA;

    const daysSinceCal = this.daysSinceCalibration();
    const noiseTerm = (noiseSd / OPTICAL.ratioPerMmol) * s.calGainA * filterGain;
    const calTerm = Math.min(1.5, SENSING.uncertaintyPerDaySinceCal * daysSinceCal);
    const tempTerm = s.thermistorOk ? 0 : 0.35;
    const uncertainty =
      SENSING.uncertaintyFloor +
      Math.sqrt(noiseTerm * noiseTerm + calTerm * calTerm + tempTerm * tempTerm);

    const value = clamp(glucose, 0, 40);
    return { glucose: value, instantaneous: value, uncertainty, raw: ratio, healthy: true };
  }

  /**
   * Interferent contribution, nA. Absorption then elimination, so the
   * interferent ramps in over the best part of an hour rather than stepping.
   * A step would be caught by the rate-of-change check, which would let the
   * supervisor blame tip B and would hide the point scenario 3 is making.
   */
  private interferent(
    elapsedS: number | null,
    peakNa: number,
    tauAbsorb: number,
    halfLife: number,
  ): number {
    if (elapsedS === null) return 0;
    const t = elapsedS / SECONDS_PER_MINUTE;
    const tauElim = halfLife / Math.LN2;
    const shape = Math.exp(-t / tauElim) - Math.exp(-t / tauAbsorb);
    // Normalise so the maximum of the shape is exactly 1.
    const tPeak = (Math.log(tauElim / tauAbsorb) * (tauAbsorb * tauElim)) / (tauElim - tauAbsorb);
    const peak = Math.exp(-tPeak / tauElim) - Math.exp(-tPeak / tauAbsorb);
    return (peakNa * Math.max(0, shape)) / peak;
  }

  private acquireElectrochemical(knownTemperature: number, filterGain: number): ChannelReading {
    const s = this.state;
    if (!s.tipB.leadIntact) return { ...DEAD_READING };

    if (this.probes) return this.acquireElectrochemicalPhysics(knownTemperature, filterGain);

    const glucoseLocal = s.tipB.localGlucose;
    // Oxygen limits the enzyme reaction only in the part of the signal above
    // 12 mmol/L, which is where the oxygen demand outruns supply.
    const fO2 = Math.min(1, s.oxygenMmHg / ELECTROCHEMICAL.oxygenSaturationMmHg);
    const effective =
      Math.min(glucoseLocal, ELECTROCHEMICAL.oxygenLimitThreshold) +
      Math.max(0, glucoseLocal - ELECTROCHEMICAL.oxygenLimitThreshold) * fO2;

    const sensitivity =
      s.driftB *
      s.enzymeActivity *
      (1 - ELECTROCHEMICAL.foulingSensitivityCoefficient * s.tipB.fouling);

    const interferents =
      this.interferent(
        s.paracetamolElapsedS,
        ELECTROCHEMICAL.paracetamolPeakNa * s.paracetamolGrams,
        ELECTROCHEMICAL.paracetamolTauAbsorbMin,
        ELECTROCHEMICAL.paracetamolHalfLifeMin,
      ) +
      this.interferent(
        s.vitaminCElapsedS,
        ELECTROCHEMICAL.vitaminCPeakNa,
        ELECTROCHEMICAL.vitaminCTauAbsorbMin,
        ELECTROCHEMICAL.vitaminCHalfLifeMin,
      );

    const noiseSd =
      ELECTROCHEMICAL.currentNoiseSdNa + ELECTROCHEMICAL.currentNoiseFoulingNa * s.tipB.fouling;

    const current =
      ELECTROCHEMICAL.currentZeroNa +
      ELECTROCHEMICAL.currentPerMmolNa * sensitivity * effective +
      interferents +
      AGEING.chlorideOffsetNaPerMv * s.referenceDriftMv +
      ELECTROCHEMICAL.currentPerMmolNa *
        sensitivity *
        effective *
        0.02 *
        (s.tipTemperatureC - SENSING.tipTemperatureC) +
      this.rng.stream("electro-noise").gauss(0, noiseSd);

    const tempFactor = 1 + 0.02 * (knownTemperature - SENSING.tipTemperatureC);
    const rawGlucose =
      (current - ELECTROCHEMICAL.currentZeroNa) / (ELECTROCHEMICAL.currentPerMmolNa * tempFactor);
    const glucose = s.calGainB * rawGlucose + s.calOffsetB;

    const daysSinceCal = this.daysSinceCalibration();
    const noiseTerm = (noiseSd / ELECTROCHEMICAL.currentPerMmolNa) * s.calGainB * filterGain;
    const calTerm = Math.min(1.5, SENSING.uncertaintyPerDaySinceCal * daysSinceCal);
    const foulTerm = SENSING.uncertaintyPerFouling * s.tipB.fouling;
    const tempTerm = s.thermistorOk ? 0 : 0.35;
    const uncertainty =
      SENSING.uncertaintyFloor +
      Math.sqrt(
        noiseTerm * noiseTerm + calTerm * calTerm + foulTerm * foulTerm + tempTerm * tempTerm,
      );

    const value = clamp(glucose, 0, 40);
    return { glucose: value, instantaneous: value, uncertainty, raw: current, healthy: true };
  }

  /**
   * The optical channel, from the physics.
   *
   * The instrument's whole job is the ratio: it fires a flash, counts two
   * bands, divides, and inverts the chemistry it was built around. Everything
   * it gets wrong is already in that ratio by the time it arrives here, so
   * there is no error term added anywhere below.
   *
   * `driftA` is the one thing that is not chemistry. A ratiometric measurement
   * cancels anything common to both channels, which is why the dye can bleach
   * to half and the reading not move; what it cannot cancel is a *differential*
   * change, such as one emission filter ageing faster than the other. That is
   * where the bench's slow gain drift belongs, and it is why a calibration
   * still has something to correct.
   */
  private acquireOpticalPhysics(filterGain: number): ChannelReading {
    const s = this.state;
    const probes = this.probes!;
    const inputs = this.probeInputs();
    const channel = probes.acquireOptical(this.rng.stream("optical-noise"), inputs);
    s.tipA.flashes = channel.flashes;

    const ratio = channel.reading.ratio * s.driftA;
    const knownTemperature = s.thermistorOk ? s.tipTemperatureC : SENSING.thermistorFallbackC;
    const rawGlucose = probes.glucoseFromOpticalRatio(ratio, knownTemperature);
    const glucose = s.calGainA * rawGlucose + s.calOffsetA;

    // The probe states its own counting uncertainty. The rest is the
    // instrument's: how long since it was calibrated, and whether it knows
    // its own temperature.
    const daysSinceCal = this.daysSinceCalibration();
    const noiseTerm = raw(channel.reading.uncertainty) * s.calGainA * filterGain;
    const calTerm = Math.min(1.5, SENSING.uncertaintyPerDaySinceCal * daysSinceCal);
    const tempTerm = s.thermistorOk ? 0 : 0.35;
    const uncertainty =
      SENSING.uncertaintyFloor +
      Math.sqrt(noiseTerm * noiseTerm + calTerm * calTerm + tempTerm * tempTerm);

    const value = clamp(glucose, 0, 40);
    return { glucose: value, instantaneous: value, uncertainty, raw: ratio, healthy: true };
  }

  /**
   * The amperometric channel, from the physics.
   *
   * The current is the peroxide flux plus whatever else the platinum will
   * oxidise, and the instrument cannot tell them apart: it puts the whole
   * number through one factory calibration line. That is why an interferent
   * reads as glucose here without any term saying so.
   *
   * There is no temperature correction, because on this front end there is
   * almost nothing to correct. The response is set by the membranes rather
   * than by the enzyme, and a membrane permeability does not care about a
   * degree of fever the way a catalytic rate constant does. The placeholder
   * carried a two per cent per degree term; the physics says it should not
   * be there, and DECISIONS.md records that.
   */
  private acquireElectrochemicalPhysics(
    knownTemperature: number,
    filterGain: number,
  ): ChannelReading {
    const s = this.state;
    const probes = this.probes!;
    const channel = probes.readElectrochemical(this.probeInputs());

    // The bench declares its amperometric noise in nanoamperes, against a
    // nominal signal this front end does not produce: the physics delivers
    // about a thirtieth of the placeholder's current, so carrying 0.35 nA
    // across unchanged would bury the signal.
    //
    // What the declaration always meant is a noise in the units the reading is
    // in, so that is what is carried across: 0.35 nA over 2.0 nA per mmol/L is
    // 0.175 mmol/L, and it stays 0.175 mmol/L here.
    //
    // It is not derived, and it is worth being plain about why. The electrical
    // noise of this measurement can be computed, and `electricalNoiseFloor`
    // does: shot noise and Johnson noise at a nanoampere over a minute come to
    // about a femtoampere, four orders of magnitude below the declared figure.
    // The bench's number is dominated by micro-motion of the probe in tissue
    // and by local perfusion, neither of which this model resolves. Replacing
    // it with the derived value would make the channel almost noiseless and
    // the whole bench dishonestly good.
    const noiseInGlucose =
      (ELECTROCHEMICAL.currentNoiseSdNa + ELECTROCHEMICAL.currentNoiseFoulingNa * s.tipB.fouling) /
      ELECTROCHEMICAL.currentPerMmolNa;
    const noiseSd = noiseInGlucose * probes.nominal.currentPerMmolNa;
    const current =
      channel.currentNa * s.driftB + this.rng.stream("electro-noise").gauss(0, noiseSd);

    void knownTemperature;
    const rawGlucose = probes.glucoseFromCurrent(current);
    const glucose = s.calGainB * rawGlucose + s.calOffsetB;

    const daysSinceCal = this.daysSinceCalibration();
    const noiseTerm = noiseInGlucose * s.calGainB * filterGain;
    const calTerm = Math.min(1.5, SENSING.uncertaintyPerDaySinceCal * daysSinceCal);
    const foulTerm = SENSING.uncertaintyPerFouling * s.tipB.fouling;
    const tempTerm = s.thermistorOk ? 0 : 0.35;
    const uncertainty =
      SENSING.uncertaintyFloor +
      Math.sqrt(
        noiseTerm * noiseTerm + calTerm * calTerm + foulTerm * foulTerm + tempTerm * tempTerm,
      );

    const value = clamp(glucose, 0, 40);
    return { glucose: value, instantaneous: value, uncertainty, raw: current, healthy: true };
  }

  private impedanceSweep(): void {
    const s = this.state;
    if (this.probes) {
      // A Randles cell at the probe frequency. A fractured lead is an open
      // circuit inside the model, so there is no special case here.
      const channel = this.probes.readElectrochemical(this.probeInputs());
      s.impedanceKohm = channel.impedanceKohm * (1 + this.rng.stream("impedance").gauss(0, 0.01));
      s.impedanceExpectedKohm = s.tipB.leadIntact
        ? channel.impedanceKohm
        : this.probes.nominal.impedanceKohm;
      return;
    }
    if (!s.tipB.leadIntact) {
      s.impedanceKohm = ELECTROCHEMICAL.impedanceOpenCircuitKohm;
      s.impedanceExpectedKohm = ELECTROCHEMICAL.impedanceBaseKohm;
      return;
    }
    const expected =
      ELECTROCHEMICAL.impedanceBaseKohm *
      (1 + ELECTROCHEMICAL.foulingImpedanceCoefficient * s.tipB.fouling) *
      (1 + ELECTROCHEMICAL.impedanceCapsulePerMicron * s.tipB.capsuleMicron) *
      s.tipB.wrapImpedanceFactor;
    s.impedanceExpectedKohm = expected;
    s.impedanceKohm = expected * (1 + this.rng.stream("impedance").gauss(0, 0.01));
  }

  private daysSinceCalibration(): number {
    const s = this.state;
    if (s.lastCalibrationT === null) return 999;
    return (s.t - s.lastCalibrationT) / SECONDS_PER_DAY;
  }

  private calibrate(source: string): void {
    const s = this.state;
    const meter = this.rng.stream("meter").gauss(s.plasmaGlucose, SENSING.meterErrorSd);

    // A one-point calibration can only fit a gain. That is deliberate: it is
    // why an offset drift, such as chloride depletion, survives calibration
    // and shows up as a slow error that widens with time.
    if (s.tipA.leadIntact) {
      const knownTemperature = s.thermistorOk ? s.tipTemperatureC : SENSING.thermistorFallbackC;
      const reading = this.acquireOpticalUncalibrated(knownTemperature);
      if (reading > 0.5) s.calGainA = clamp(meter / reading, 0.2, 5);
    }
    if (s.tipB.leadIntact) {
      const knownTemperature = s.thermistorOk ? s.tipTemperatureC : SENSING.thermistorFallbackC;
      const reading = this.acquireElectroUncalibrated(knownTemperature);
      if (reading > 0.5) s.calGainB = clamp(meter / reading, 0.2, 5);
    }
    s.lastCalibrationT = s.t;
    this.freshCalibration = true;
    this.write(
      "clinical",
      "CAL",
      `Calibration by ${source}: meter read ${meter.toFixed(1)} mmol/L, gains now A ${s.calGainA.toFixed(3)} and B ${s.calGainB.toFixed(3)}`,
    );
  }

  /** The optical glucose the front end would report before calibration gain. */
  private acquireOpticalUncalibrated(knownTemperature: number): number {
    const s = this.state;
    if (this.probes) {
      const inputs = this.probeInputs();
      const ratio = this.probes.noiselessOpticalRatio(inputs) * s.driftA;
      return this.probes.glucoseFromOpticalRatio(ratio, knownTemperature);
    }
    const ratio =
      OPTICAL.ratioZero +
      OPTICAL.ratioPerMmol * s.driftA * s.tipA.localGlucose +
      (s.mannitolOn ? OPTICAL.mannitolOffset : 0) +
      OPTICAL.ratioPerDegC * (s.tipTemperatureC - SENSING.tipTemperatureC);
    const compensated = ratio - OPTICAL.ratioPerDegC * (knownTemperature - SENSING.tipTemperatureC);
    return (compensated - OPTICAL.ratioZero) / OPTICAL.ratioPerMmol;
  }

  private acquireElectroUncalibrated(knownTemperature: number): number {
    const s = this.state;
    if (this.probes) {
      const channel = this.probes.readElectrochemical(this.probeInputs());
      void knownTemperature;
      return this.probes.glucoseFromCurrent(channel.currentNa * s.driftB);
    }
    const fO2 = Math.min(1, s.oxygenMmHg / ELECTROCHEMICAL.oxygenSaturationMmHg);
    const g = s.tipB.localGlucose;
    const effective =
      Math.min(g, ELECTROCHEMICAL.oxygenLimitThreshold) +
      Math.max(0, g - ELECTROCHEMICAL.oxygenLimitThreshold) * fO2;
    const sensitivity =
      s.driftB *
      s.enzymeActivity *
      (1 - ELECTROCHEMICAL.foulingSensitivityCoefficient * s.tipB.fouling);
    const current =
      ELECTROCHEMICAL.currentZeroNa +
      ELECTROCHEMICAL.currentPerMmolNa * sensitivity * effective +
      AGEING.chlorideOffsetNaPerMv * s.referenceDriftMv;
    const tempFactor = 1 + 0.02 * (knownTemperature - SENSING.tipTemperatureC);
    return (
      (current - ELECTROCHEMICAL.currentZeroNa) / (ELECTROCHEMICAL.currentPerMmolNa * tempFactor)
    );
  }

  private stepCalibrationPrompt(): void {
    const s = this.state;

    // Sustained disagreement with nothing to blame is the classic reason to
    // ask for a reference measurement. The device asks; it does not calibrate
    // itself out of the problem, because calibrating during an interferent
    // would bake the interferent into the gain.
    if (
      s.arbitration === "invalid" &&
      s.tipA.health >= ARBITRATION.healthFlagThreshold &&
      s.tipB.health >= ARBITRATION.healthFlagThreshold
    ) {
      this.disagreementS += DT_S;
      if (this.disagreementS === 60 * SECONDS_PER_MINUTE) {
        this.alert(
          "clinical",
          "CAL",
          "One hour of unexplained disagreement: a finger-prick calibration is requested",
        );
      }
    } else {
      this.disagreementS = 0;
    }

    if (s.t % SECONDS_PER_DAY !== 0) return;
    if (this.daysSinceCalibration() < SENSING.calibrationIntervalDays) return;
    if (this.autoCalibrate && !s.missedCalibration) {
      this.calibrate("scheduled prompt");
    } else {
      this.alert("clinical", "CAL", "Calibration overdue: uncertainty is widening on both tips");
    }
  }

  // ------------------------------------------------------------------------
  // Health evidence, fusion and arbitration
  // ------------------------------------------------------------------------

  private updateHealth(): void {
    const s = this.state;

    // Long baselines. The supervisor cannot see the model, only its own
    // history, so what it detects is a step change, not an absolute level.
    // This runs once per acquisition, so the smoothing coefficient is one
    // acquisition period over the baseline time constant, not one second.
    const alpha = this.acquisitionPeriod() / (BASELINE_TAU_DAYS * SECONDS_PER_DAY);
    if (s.tipB.leadIntact && s.impedanceKohm < ELECTROCHEMICAL.impedanceOpenCircuitKohm) {
      this.impedanceBaseline =
        this.impedanceBaseline === null
          ? s.impedanceKohm
          : this.impedanceBaseline + (s.impedanceKohm - this.impedanceBaseline) * alpha;
    }
    const counts = this.opticalCounts();
    if (s.tipA.leadIntact) {
      this.opticalBaseline =
        this.opticalBaseline === null
          ? counts
          : this.opticalBaseline + (counts - this.opticalBaseline) * alpha;
    }

    for (const tip of [s.tipA, s.tipB]) {
      const flags: string[] = [];
      let health = 1;

      if (!tip.leadIntact) {
        flags.push(
          tip.id === "A" ? "Lead A open: no optical return" : "Lead B open: impedance out of range",
        );
        health = 0;
      } else {
        if (tip.id === "B" && this.impedanceBaseline !== null) {
          const deviation =
            Math.abs(s.impedanceKohm - this.impedanceBaseline) / this.impedanceBaseline;
          if (deviation > ARBITRATION.impedanceStepFlagFraction) {
            flags.push(
              `Impedance step ${(deviation * 100).toFixed(0)} percent above its own baseline`,
            );
            health -= 0.5;
          }
        }
        if (tip.id === "A" && this.opticalBaseline !== null) {
          const fraction = counts / this.opticalBaseline;
          if (fraction < ARBITRATION.opticalLossFlagFraction) {
            flags.push(
              `Optical return at ${(fraction * 100).toFixed(0)} percent of its own baseline`,
            );
            health -= 0.5;
          }
        }
        if (tip.fouling > ARBITRATION.foulingFlagLevel) {
          const excess =
            (tip.fouling - ARBITRATION.foulingFlagLevel) / (1 - ARBITRATION.foulingFlagLevel);
          flags.push(`Fouling at ${(tip.fouling * 100).toFixed(0)} percent`);
          health -= 0.6 * excess;
        }
        const history = tip.id === "A" ? this.historyA : this.historyB;
        const uncertainty = tip.id === "A" ? s.readingA.uncertainty : s.readingB.uncertainty;
        if (history.length >= RATE_WINDOW_SAMPLES + 1) {
          const newest = history[history.length - 1];
          const oldest = history[history.length - 1 - RATE_WINDOW_SAMPLES];
          if (newest !== undefined && oldest !== undefined) {
            const spanMin = (RATE_WINDOW_SAMPLES * this.acquisitionPeriod()) / SECONDS_PER_MINUTE;
            const rate = Math.abs(newest - oldest) / spanMin;
            // Three standard deviations of the difference of two noisy
            // readings, expressed as a rate over the same span.
            const noiseAllowance = (3 * uncertainty * Math.SQRT2) / spanMin;
            const threshold = ARBITRATION.rateImplausibleMmolPerMin + noiseAllowance;
            if (rate > threshold) {
              flags.push(
                `Rate of change ${rate.toFixed(2)} mmol/L per min against a ${threshold.toFixed(2)} limit`,
              );
              health -= 0.5;
            }
          }
        }
        if (!s.thermistorOk) {
          flags.push("Thermistor failed: temperature compensation is assumed");
          health -= 0.15;
        }
      }

      tip.health = clamp(health, 0, 1);
      tip.flags = flags;
    }
  }

  private fuse(): void {
    const s = this.state;
    const a = s.readingA;
    const b = s.readingB;

    this.updateHealth();

    const flaggedA = s.tipA.health < ARBITRATION.healthFlagThreshold;
    const flaggedB = s.tipB.health < ARBITRATION.healthFlagThreshold;
    const aliveA = a.glucose !== null;
    const aliveB = b.glucose !== null;

    const reasons: string[] = [];
    let next: ArbitrationState;

    if (!aliveA && !aliveB) {
      next = "invalid";
      reasons.push("Both channels are dead");
    } else if (aliveA !== aliveB) {
      const liveFlagged = aliveA ? flaggedA : flaggedB;
      next = liveFlagged ? "invalid" : "doubtful-one";
      reasons.push(aliveA ? "Tip B is not reporting" : "Tip A is not reporting");
      if (liveFlagged) reasons.push("The surviving tip is itself flagged");
    } else if (flaggedA && flaggedB) {
      next = "invalid";
      reasons.push("Both tips are flagged by health evidence");
    } else if (flaggedA !== flaggedB) {
      next = "doubtful-one";
      reasons.push(
        flaggedA ? "Tip A is flagged, tip B is trusted" : "Tip B is flagged, tip A is trusted",
      );
    } else {
      const ga = a.glucose ?? 0;
      const gb = b.glucose ?? 0;
      const mean = (ga + gb) / 2;
      const window = Math.max(ARBITRATION.agreeAbsolute, ARBITRATION.agreeRelative * mean);
      const apart = Math.abs(ga - gb);
      // One acquisition outside the window is not evidence of anything. The
      // two probes have genuinely different response times, so on a fast
      // excursion they sit near the edge of the window and a single sample's
      // noise decides which side of it they land on. Acting on that produces a
      // one minute drop to invalid and straight back, which is a flap and not
      // a safety decision.
      //
      // So the disagreement has to survive a second acquisition. The cost is
      // one minute of latency before autonomy falls; the alternative is a
      // supervisor that cries wolf every time the glucose moves quickly. The
      // recovery direction already works this way, through `agreementHoldS`.
      this.outsideWindowS = apart > window ? this.outsideWindowS + DT_S : 0;
      const confirmed = apart > window && this.outsideWindowS > this.acquisitionPeriod();
      if (!confirmed) {
        next = "valid";
        reasons.push(
          apart > window
            ? "Tips outside the agreement window for one acquisition: waiting for a second"
            : "Both tips healthy and in agreement",
        );
      } else {
        next = "invalid";
        reasons.push(
          `Tips disagree by ${apart.toFixed(1)} mmol/L against a ${window.toFixed(1)} mmol/L window`,
        );
        reasons.push("No health evidence points at either tip, so neither can be trusted");
      }
    }

    if (next === "invalid" && s.cgmBridged) {
      next = "bridged";
      reasons.push("An external continuous glucose monitor is bridged through the phone");
    }

    for (const flag of s.tipA.flags) reasons.push(`Tip A: ${flag}`);
    for (const flag of s.tipB.flags) reasons.push(`Tip B: ${flag}`);

    // Fuse whatever the state says may be used.
    let fused: number | null = null;
    let uncertainty = 99;
    if (next === "bridged") {
      fused = this.rng.stream("cgm").gauss(s.subcutaneousGlucose, 0.5);
      uncertainty = 1.2;
      reasons.push("Reading is the bridged monitor, from the subcutaneous site");
    } else if (next === "valid" && aliveA && aliveB) {
      const wa = 1 / (a.uncertainty * a.uncertainty);
      const wb = 1 / (b.uncertainty * b.uncertainty);
      fused = ((a.glucose ?? 0) * wa + (b.glucose ?? 0) * wb) / (wa + wb);
      uncertainty = Math.sqrt(1 / (wa + wb));
    } else {
      const useA = aliveA && !flaggedA;
      const useB = aliveB && !flaggedB;
      if (useA && !useB) {
        fused = a.glucose;
        uncertainty = a.uncertainty * 1.6;
      } else if (useB && !useA) {
        fused = b.glucose;
        uncertainty = b.uncertainty * 1.6;
      } else if (aliveA || aliveB) {
        // Nothing is trusted. A number is still shown, with an honest band,
        // but the autonomy level below is what stops it being dosed on.
        const values = [a.glucose, b.glucose].filter((v): v is number => v !== null);
        fused = values.reduce((x, y) => x + y, 0) / values.length;
        uncertainty = Math.max(2.5, Math.abs((a.glucose ?? 0) - (b.glucose ?? 0)) / 2);
      }
    }

    s.fusedGlucose = fused;
    s.fusedUncertainty = uncertainty;
    s.arbitration = next;
    s.arbitrationReasons = reasons;

    // Rate estimate over the last 10 simulated minutes of fused values.
    if (fused !== null) {
      this.fusedHistory.push({ t: s.t, g: fused });
      while (this.fusedHistory.length > 0) {
        const head = this.fusedHistory[0];
        if (head && s.t - head.t > 10 * SECONDS_PER_MINUTE) this.fusedHistory.shift();
        else break;
      }
      const first = this.fusedHistory[0];
      const last = this.fusedHistory[this.fusedHistory.length - 1];
      if (first && last && last.t > first.t) {
        s.fusedRate = (last.g - first.g) / ((last.t - first.t) / SECONDS_PER_MINUTE);
      } else {
        s.fusedRate = 0;
      }
    } else {
      this.fusedHistory = [];
      s.fusedRate = 0;
    }

    this.recordSample();
  }

  private stepArbitration(): void {
    const s = this.state;

    // Agreement quality, which together with the health scores is the
    // evidence score the monotonicity rule is written against.
    const ga = s.readingA.glucose;
    const gb = s.readingB.glucose;
    let agreementQuality = 0;
    let agreeingNow = false;
    if (ga !== null && gb !== null) {
      const mean = (ga + gb) / 2;
      const window = Math.max(ARBITRATION.agreeAbsolute, ARBITRATION.agreeRelative * mean);
      agreementQuality = clamp(1 - Math.abs(ga - gb) / window, 0, 1);
      agreeingNow =
        Math.abs(ga - gb) <= window &&
        s.tipA.health >= ARBITRATION.healthFlagThreshold &&
        s.tipB.health >= ARBITRATION.healthFlagThreshold;
    }
    // Any rise in autonomy needs 15 simulated minutes of stable evidence,
    // whatever the source of that evidence is. For the implants that means
    // two healthy tips agreeing; for a bridged external monitor it means the
    // bridge being up and the supervisor already in the bridged state.
    const stableNow = agreeingNow || (s.arbitration === "bridged" && s.cgmBridged);
    if (stableNow) s.agreementHoldS += DT_S;
    else s.agreementHoldS = 0;

    const previousEvidence = s.evidenceScore;
    const evidence = clamp(
      0.6 * ((s.tipA.health + s.tipB.health) / 2) +
        0.4 * agreementQuality +
        (s.cgmBridged ? 0.15 : 0),
      0,
      1,
    );
    s.evidenceScore = evidence;

    let target: AutonomyLevel;
    switch (s.arbitration) {
      case "valid":
        target = AUTONOMY.full;
        break;
      case "doubtful-one":
        target = AUTONOMY.basalOnly;
        break;
      case "bridged":
        // A bridged monitor is a real glucose value, so basal may be
        // modulated with it. It is a subcutaneous sensor read through a
        // phone, so it never buys full closed loop or a correction bolus.
        target = AUTONOMY.basalOnly;
        break;
      default:
        target = s.envelope.onInvalid === "suspend" ? AUTONOMY.suspend : AUTONOMY.safeBasal;
        break;
    }

    const current = s.autonomy;
    if (target <= current) {
      if (target < current) this.freshCalibration = false;
      s.autonomy = target;
    } else {
      // Autonomy may only be restored when the evidence is not falling, and
      // then only after agreement has held or a fresh calibration has landed.
      const evidenceFell = evidence < previousEvidence - 1e-12;
      const held = s.agreementHoldS >= ARBITRATION.recoveryHoldMin * SECONDS_PER_MINUTE;
      if (!evidenceFell && (held || this.freshCalibration)) {
        s.autonomy = target;
        this.freshCalibration = false;
      }
    }

    if (s.arbitration !== this.prevArbitration) {
      const stream: LogStream = s.arbitration === "valid" ? "device" : "insulin";
      const first = s.arbitrationReasons[0] ?? "no reason recorded";
      const message = `Supervisor: ${this.prevArbitration} to ${s.arbitration}. ${first}`;
      if (s.arbitration === "valid") this.write(stream, "ARBT", message);
      else this.alert(stream, "ARBT", message);
      this.prevArbitration = s.arbitration;
    }
  }

  // ------------------------------------------------------------------------
  // Controller and pump
  // ------------------------------------------------------------------------

  private stepController(): void {
    const s = this.state;
    const env = s.envelope;

    if (s.autonomy === AUTONOMY.suspend) {
      s.basalCommand = 0;
      s.integral = 0;
      s.pendingCarbG = 0;
      this.cancelBolus("insulin is suspended");
      if (!this.suspendedNow) {
        this.alert("insulin", "SUSP", "Insulin suspended: the supervisor will not permit delivery");
        this.suspendedNow = true;
      }
      return;
    }
    this.suspendedNow = false;

    const fused = s.fusedGlucose;
    if (s.autonomy === AUTONOMY.safeBasal || fused === null) {
      s.basalCommand = Math.min(env.safeBasal, env.basalRate);
      s.integral = 0;
      s.pendingCarbG = 0;
      this.cancelBolus("the supervisor lowered autonomy to safe basal");
      return;
    }

    const control = computeBasal(
      {
        envelope: env,
        autonomy: s.autonomy,
        fused,
        uncertainty: s.fusedUncertainty,
        rate: s.fusedRate,
        integral: s.integral,
        iob: s.iob,
      },
      DT_MIN,
    );
    s.integral = control.integral;
    s.basalCommand = control.basal;
    if (control.suspendedByPrediction && !this.predictiveHoldNow) {
      this.write(
        "insulin",
        "PRED",
        `Predicted ${(control.lowerBound + s.fusedRate * env.suspendHorizonMin).toFixed(1)} mmol/L in ${env.suspendHorizonMin} min: basal held at zero`,
      );
    }
    this.predictiveHoldNow = control.suspendedByPrediction;

    if (s.autonomy !== AUTONOMY.full) {
      // Basal modulation only. Announced carbohydrate is deliberately dropped
      // rather than covered, and a bolus authorised a moment ago at full
      // autonomy is stopped where it stands: the supervisor lowering trust
      // has to stop insulin that a higher level of trust had allowed, not
      // merely decline the next one.
      s.pendingCarbG = 0;
      this.cancelBolus("the supervisor lowered autonomy to basal modulation only");
      return;
    }

    if (s.pendingCarbG > 0 && s.bolusRemainingU <= 0) {
      const units = computeMealBolus(env, s.autonomy, s.pendingCarbG);
      s.pendingCarbG = 0;
      if (units > 0) this.deliverBolus(units, "meal");
    }

    const sinceCorrection =
      s.lastCorrectionT === null ? Infinity : (s.t - s.lastCorrectionT) / SECONDS_PER_MINUTE;
    if (sinceCorrection >= CONTROLLER.correctionIntervalMin && s.bolusRemainingU <= 0) {
      const units = computeCorrectionBolus(env, s.autonomy, control.lowerBound, s.fusedRate, s.iob);
      if (units > 0) {
        s.lastCorrectionT = s.t;
        this.deliverBolus(units, "correction");
      }
    }
  }

  /** Stop a bolus in flight. Logged once, with the reason it was stopped. */
  private cancelBolus(reason: string): void {
    const s = this.state;
    if (s.bolusRemainingU <= 0) return;
    this.write(
      "insulin",
      "STOP",
      `Bolus stopped with ${s.bolusRemainingU.toFixed(2)} U undelivered: ${reason}`,
    );
    s.bolusRemainingU = 0;
  }

  private deliverBolus(units: number, reason: string): void {
    const s = this.state;
    // Hard bound. Asserted here as well as tested, because this is the line
    // between a bench toy and something that pretends to be safe.
    const bounded = clamp(units, 0, s.envelope.maxBolus);
    s.bolusRemainingU = bounded;
    this.write(
      "insulin",
      "BOLU",
      `${reason} bolus ${bounded.toFixed(2)} U over ${CONTROLLER.bolusDeliveryMin} min, envelope ceiling ${s.envelope.maxBolus.toFixed(1)} U`,
    );
  }

  private stepPump(): void {
    const s = this.state;
    let bolusRateUph = 0;
    if (s.bolusRemainingU > 0) {
      const perMinute = s.envelope.maxBolus / CONTROLLER.bolusDeliveryMin;
      const thisStep = Math.min(s.bolusRemainingU, perMinute * DT_MIN);
      s.bolusRemainingU = Math.max(0, s.bolusRemainingU - thisStep);
      bolusRateUph = (thisStep / DT_MIN) * 60;
    }
    s.bolusActive = bolusRateUph > 0;
    s.deliveryRateUph = s.basalCommand + bolusRateUph;
    s.dosingNow = s.deliveryRateUph > 0;
    s.totalInsulinU += s.deliveryRateUph / 3600;
  }

  private stepConnectivity(): void {
    const s = this.state;
    if (!s.telemetryOk || !s.phonePresent) {
      s.silenceS += DT_S;
      if (s.silenceS === 30 * SECONDS_PER_MINUTE) {
        this.alert(
          "device",
          "SLNT",
          "MedSync silence detection: no reading for 30 min. The loop inside the body is still running",
        );
      }
    } else {
      s.silenceS = 0;
    }
  }

  // ------------------------------------------------------------------------
  // Records
  // ------------------------------------------------------------------------

  private recordSample(): void {
    const s = this.state;
    if (this.samples.length >= this.maxSamples) this.samples.shift();
    this.samplesProduced += 1;
    const sample: Sample = {
      t: s.t,
      plasma: s.plasmaGlucose,
      peritoneal: s.peritonealGlucose,
      subcutaneous: s.subcutaneousGlucose,
      glucoseA: s.readingA.glucose,
      glucoseB: s.readingB.glucose,
      fused: s.fusedGlucose,
      fusedUncertainty: s.fusedUncertainty,
      insulinUph: s.deliveryRateUph,
      autonomy: s.autonomy,
      arbitration: s.arbitration,
    };
    this.samples.push(sample);
    this.onSample?.(sample);
  }

  /** Append a line to the log from outside the engine. */
  note(stream: LogStream, code: string, message: string): void {
    this.write(stream, code, message);
  }

  private write(stream: LogStream, code: string, message: string): void {
    if (this.log.length >= this.maxLog) this.log.shift();
    this.log.push({ t: this.state.t, stream, code, message });
  }

  private alert(stream: LogStream, code: string, message: string): void {
    this.state.alertCount += 1;
    this.write(stream, code, message);
  }
}
