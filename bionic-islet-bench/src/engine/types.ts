import type { Envelope } from "./params.ts";

/** Which tip. A is optical, B is electrochemical. */
export type TipId = "A" | "B";

/** The safety supervisor's verdict. */
export type ArbitrationState = "valid" | "doubtful-one" | "invalid" | "bridged";

/**
 * Permitted autonomy, ordered. The supervisor may only lower this while the
 * evidence score is falling; the ordering is what makes that testable.
 */
export const AUTONOMY = {
  suspend: 0,
  safeBasal: 1,
  basalOnly: 2,
  full: 3,
} as const;

export type AutonomyLevel = (typeof AUTONOMY)[keyof typeof AUTONOMY];

export const AUTONOMY_LABEL: Record<AutonomyLevel, string> = {
  0: "Suspended",
  1: "Safe basal only",
  2: "Basal modulation only",
  3: "Full closed loop",
};

/** Every one-click event the bench can inject. */
export type EventKind =
  | "meal"
  | "exercise-start"
  | "exercise-stop"
  | "sleep-start"
  | "sleep-stop"
  | "paracetamol"
  | "mannitol"
  | "vitamin-c"
  | "low-oxygen"
  | "protein-deposition"
  | "omental-wrap"
  | "lead-a-fracture"
  | "lead-b-fracture"
  | "thermistor-failure"
  | "telemetry-loss"
  | "telemetry-restore"
  | "phone-lost"
  | "phone-found"
  | "battery-low"
  | "missed-calibration"
  | "envelope-change"
  | "calibrate"
  | "flush"
  | "tip-exchange"
  | "cgm-bridge-on"
  | "cgm-bridge-off";

export type SimEvent =
  | { kind: "meal"; grams: number; announced: boolean }
  | { kind: "exercise-start" }
  | { kind: "exercise-stop" }
  | { kind: "sleep-start" }
  | { kind: "sleep-stop" }
  | { kind: "paracetamol" }
  | { kind: "mannitol" }
  | { kind: "vitamin-c" }
  | { kind: "low-oxygen"; on: boolean }
  | { kind: "protein-deposition" }
  | { kind: "omental-wrap"; tip: TipId }
  | { kind: "lead-a-fracture" }
  | { kind: "lead-b-fracture" }
  | { kind: "thermistor-failure" }
  | { kind: "telemetry-loss" }
  | { kind: "telemetry-restore" }
  | { kind: "phone-lost" }
  | { kind: "phone-found" }
  | { kind: "battery-low" }
  | { kind: "missed-calibration"; on: boolean }
  | { kind: "envelope-change"; envelope: Partial<Envelope>; actor: string }
  | { kind: "calibrate" }
  | { kind: "flush" }
  | { kind: "tip-exchange"; tip: TipId }
  | { kind: "cgm-bridge-on" }
  | { kind: "cgm-bridge-off" };

/** A scheduled event, in simulated seconds since implant. */
export type ScheduledEvent = { atSeconds: number; event: SimEvent };

export type LogStream = "device" | "clinical" | "insulin";

export type LogEntry = {
  /** Simulated seconds since implant. */
  t: number;
  stream: LogStream;
  /** Short machine-ish code, shown in the log's first column. */
  code: string;
  message: string;
};

/** Per-tip ageing and fault state. */
export type TipState = {
  id: TipId;
  /** Fibrous capsule thickness, um. */
  capsuleMicron: number;
  /** Local sensing compartment glucose, mmol/L. */
  localGlucose: number;
  /** Days since this tip was implanted or exchanged. */
  ageDays: number;
  /** Membrane fouling, 0 to 1. Electrochemical tip only, kept for both for symmetry. */
  fouling: number;
  /** Optical attenuation from an omental wrap, 1 is clear. */
  wrapAttenuation: number;
  /** Impedance multiplier from an omental wrap, 1 is clear. */
  wrapImpedanceFactor: number;
  /** Cumulative optical flashes. Optical tip only. */
  flashes: number;
  /** Lead integrity. A fractured lead kills the channel. */
  leadIntact: boolean;
  /** Health score, 0 to 1, from the evidence the supervisor can see. */
  health: number;
  /** Which evidence items are currently firing. */
  flags: string[];
};

/** What one acquisition produced for one channel. */
export type ChannelReading = {
  /**
   * Reported glucose, mmol/L, or null when the channel is dead. This is the
   * three-acquisition filtered value: it is what the supervisor arbitrates
   * on, what the controller doses on and what the traces draw, because a
   * single raw sample is dominated by measurement noise. The filter costs
   * about one minute of extra lag, which is included in the reported
   * uncertainty.
   */
  glucose: number | null;
  /** The unfiltered inverse-model output for this acquisition, mmol/L. */
  instantaneous: number | null;
  /** One standard deviation of the reported glucose, mmol/L. */
  uncertainty: number;
  /** Raw front-end quantity: fluorescence ratio for A, current in nA for B. */
  raw: number;
  /** Whether the supervisor considers this channel usable. */
  healthy: boolean;
};

export type SimState = {
  /** Simulated seconds since implant. */
  t: number;
  /** Seed, echoed so a snapshot is self-describing. */
  seed: number;

  // Physiology
  /** Plasma glucose, mmol/L. This is the truth the traces call "plasma". */
  plasmaGlucose: number;
  /** Peritoneal fluid glucose, mmol/L. */
  peritonealGlucose: number;
  /** Subcutaneous comparator glucose, mmol/L. Drawn, never dosed on. */
  subcutaneousGlucose: number;
  /** Plasma insulin, mU/L. */
  plasmaInsulin: number;
  /** Remote insulin action, 1/min. */
  insulinAction: number;
  /** Meal absorption compartments, mmol. */
  mealQ1: number;
  mealQ2: number;
  /** Current rate of glucose appearance from meals, mmol/min. */
  mealRa: number;
  /** Peritoneal oxygen tension, mmHg. */
  oxygenMmHg: number;
  exercising: boolean;
  asleep: boolean;
  /** Seconds slept so far in the current sleep episode, for the dawn window. */
  sleepElapsedS: number;

  // Interferents, all in their front-end unit
  paracetamolElapsedS: number | null;
  vitaminCElapsedS: number | null;
  mannitolOn: boolean;
  lowOxygenOn: boolean;

  // Tips
  tipA: TipState;
  tipB: TipState;
  /** Enzyme activity fraction of new, tip B. */
  enzymeActivity: number;
  /** Silver chloride reference drift, mV. */
  referenceDriftMv: number;
  /** Measured impedance magnitude at 1 kHz, kOhm. Updated on the hourly sweep. */
  impedanceKohm: number;
  /** Impedance the model expects given fouling and capsule, kOhm. */
  impedanceExpectedKohm: number;
  /** Tip temperature, degrees C. */
  tipTemperatureC: number;
  thermistorOk: boolean;

  // Acquisition results
  readingA: ChannelReading;
  readingB: ChannelReading;
  /** Fused glucose estimate, mmol/L, or null when nothing is usable. */
  fusedGlucose: number | null;
  /** One standard deviation of the fused estimate, mmol/L. */
  fusedUncertainty: number;
  /** Fused rate of change, mmol/L per min. */
  fusedRate: number;

  // Supervisor
  arbitration: ArbitrationState;
  /** Plain-language reasons the supervisor is in this state. */
  arbitrationReasons: string[];
  /** 0 to 1. Falls as evidence worsens. The monotonicity rule keys off this. */
  evidenceScore: number;
  autonomy: AutonomyLevel;
  /** Seconds the two channels have agreed continuously. */
  agreementHoldS: number;

  // Calibration
  /** Simulated seconds of the last calibration, or null if never. */
  lastCalibrationT: number | null;
  /** Multiplicative sensitivity correction applied to each channel. */
  calGainA: number;
  calGainB: number;
  /** Additive offset correction applied to each channel, mmol/L. */
  calOffsetA: number;
  calOffsetB: number;
  /** True when the patient is deliberately skipping calibrations. */
  missedCalibration: boolean;
  /** Slow sensitivity drift per channel, 1.0 is no drift. */
  driftA: number;
  driftB: number;

  // Controller and pump
  /** Commanded basal rate, U/h. */
  basalCommand: number;
  /** Units still to deliver from the active bolus. */
  bolusRemainingU: number;
  /** Instantaneous total delivery, U/h. Basal plus any bolus in progress. */
  deliveryRateUph: number;
  /** Units delivered since t = 0. */
  totalInsulinU: number;
  /** Insulin on board, U. */
  iob: number;
  /** Controller integral term, U/h. */
  integral: number;
  /** Simulated seconds of the last correction bolus. */
  lastCorrectionT: number | null;
  /** True whenever insulin is being delivered. Drives the red insulin line. */
  dosingNow: boolean;
  /** True while a bolus is being delivered, as opposed to basal alone. */
  bolusActive: boolean;
  /** Announced carbohydrate the controller has been told about but not yet covered, g. */
  pendingCarbG: number;

  // Connectivity
  telemetryOk: boolean;
  phonePresent: boolean;
  batteryLow: boolean;
  cgmBridged: boolean;
  /** Seconds since MedSync last heard from the device. */
  silenceS: number;

  // Envelope and audit
  envelope: Envelope;
  /** Count of alerts raised. */
  alertCount: number;
};

/** A single row in the trace history. */
export type Sample = {
  t: number;
  plasma: number;
  peritoneal: number;
  subcutaneous: number;
  glucoseA: number | null;
  glucoseB: number | null;
  fused: number | null;
  fusedUncertainty: number;
  insulinUph: number;
  autonomy: AutonomyLevel;
  arbitration: ArbitrationState;
};

export type Scoreboard = {
  /** Simulated minutes the window covers. */
  minutes: number;
  timeInRangePct: number;
  timeBelow39Pct: number;
  timeBelow30Pct: number;
  timeAbove10Pct: number;
  /** Mean absolute relative difference of the fused output against plasma, percent. */
  mardPct: number;
  meanGlucose: number;
  alerts: number;
  minutesReducedAutonomy: number;
  minutesSuspended: number;
  totalInsulinU: number;
};
