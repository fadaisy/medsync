/**
 * Every model parameter, in one place, with its unit and its provenance.
 *
 * Provenance is one of:
 *   "brief"      - the value is written in the build brief and is used as written
 *   "deviation"  - the brief gives a value, this differs, and DECISIONS.md says why
 *   "estimate"   - an engineering estimate chosen here, not from any document
 *   "textbook"   - a conventional value from published physiological modelling
 *
 * Nothing here is clinical data. The whole file is engineering estimate work
 * for an illustrative simulation of a device that does not exist.
 */

export type Provenance = "brief" | "deviation" | "estimate" | "textbook";

export type ParamNote = {
  path: string;
  unit: string;
  provenance: Provenance;
  note: string;
};

// --------------------------------------------------------------------------
// Physiology
// --------------------------------------------------------------------------

export const PHYSIOLOGY = {
  /** Body mass. */
  bodyMassKg: 70,
  /**
   * Glucose distribution volume, litres.
   *
   * The brief says "Vg = 1.6 L/kg x 70 kg" = 112 L. Taken literally that is
   * about ten times the accepted value and it cannot produce the 8 to 12
   * mmol/L peak that the brief's own acceptance check requires for a 60 g
   * meal. 1.6 dL/kg is the standard Bergman minimal-model figure and gives
   * 11.2 L. See DECISIONS.md, decision 2.
   */
  glucoseVolumeL: 1.6 * 0.1 * 70,
  /** Starting plasma glucose, mmol/L. */
  startingGlucose: 6.0,
  /** Basal endogenous glucose production, mmol/min (about 2 mg/kg/min). */
  egpBasal: 0.78,
  /** Insulin-independent uptake (brain, red cells), mmol/min. Constant. */
  uptakeInsulinIndependent: 0.45,
  /** Fractional suppression of production per mU/L of plasma insulin above basal. */
  egpInsulinSensitivity: 0.022,
  /** Floor and ceiling on the production multiplier. */
  egpMultiplierMin: 0.05,
  egpMultiplierMax: 1.8,
  /** Basal plasma insulin, mU/L. */
  insulinBasal: 15,
  /** Plasma insulin reached at steady state per U/h of delivery, mU/L per U/h. */
  insulinGainPerUnitPerHour: 15 / 0.9,
  /** Delivery to plasma insulin lag, min. Intraperitoneal, so no subcutaneous depot. */
  tauInsulinMin: 20,
  /** Remote insulin action lag, min. */
  tauActionMin: 25,
  /** Insulin action per mU/L above basal, 1/min per (mU/L). */
  p2: 4.0e-4,
  /** Meal carbohydrate to glucose, mmol per gram (1000 / 180.16). */
  mmolPerGramCarb: 1000 / 180.16,
  /** Fraction of ingested carbohydrate that reaches plasma. */
  mealBioavailability: 0.9,
  /** Two-compartment absorption rate, 1/min. Peak appearance at 1/k = 45 min. */
  mealAbsorptionRate: 1 / 45,
  /** Exercise raises insulin sensitivity by this fraction. */
  exerciseSensitivityGain: 0.4,
  /** Exercise lowers peritoneal oxygen by this fraction. */
  exerciseOxygenDrop: 0.15,
  /** Sleep: insulin sensitivity multiplier overnight. */
  sleepSensitivityFactor: 0.9,
  /** Sleep: production multiplier in the dawn window. */
  dawnProductionFactor: 1.15,
  /** Length of the dawn window at the end of sleep, min. */
  dawnWindowMin: 120,
  /** Plasma to peritoneal fluid lag, min. */
  tauPeritonealMin: 1.7,
  /** Plasma to subcutaneous interstitium lag, min. Comparator only, never dosed on. */
  tauSubcutaneousMin: 13.1,
  /** Tissue lag floor at zero capsule thickness, min. */
  tauCapsuleBaseMin: 0.5,
  /** Extra tissue lag per micrometre of capsule, min per um. */
  tauCapsulePerMicron: 0.06,
  /** Nominal peritoneal oxygen tension, mmHg. */
  oxygenNominalMmHg: 40,
  /** Oxygen tension under the low-oxygen fault, mmHg. */
  oxygenFaultMmHg: 18,
  /** Capsule thickness that attenuates oxygen by 1/e, um. */
  oxygenCapsuleScaleMicron: 400,
  /** Plasma glucose floor and ceiling, mmol/L. Numerical guard, not physiology. */
  glucoseFloor: 1.1,
  glucoseCeiling: 33.0,
} as const;

// --------------------------------------------------------------------------
// Ageing and tissue response
// --------------------------------------------------------------------------

export const AGEING = {
  /** Bare capsule growth rate, um/day. */
  capsuleGrowthPerDay: 0.9,
  /** Zwitterionic coat suppression of capsule growth, fraction. */
  coatEffect: 0.45,
  /** Peak steroid suppression while the collar elutes, fraction. */
  steroidEffect0: 0.6,
  /** Steroid elution time constant, days. */
  steroidTauDays: 120,
  /**
   * Capsule remodelling time constant, days.
   *
   * Not in the brief. The brief's capsule equation is a pure ramp, which has
   * no steady state, yet scenario 5 describes the capsule as being at steady
   * state. A first-order remodelling sink gives the plateau the brief
   * describes and lands day 365 inside the brief's 90 to 140 um acceptance
   * band. See DECISIONS.md, decision 4.
   */
  capsuleRemodelTauDays: 600,
  /** A flush removes this fraction of the current capsule thickness. */
  flushRemovalFraction: 0.2,
  /** Omental wrapping adds this much capsule in one step, um. */
  omentalWrapMicron: 85,
  /**
   * Photobleaching half-scale, flashes.
   *
   * The brief says 900 000 flashes and describes that as "about one year at
   * one flash per minute". Those two statements disagree: 900 000 flashes at
   * one per minute is 1.71 years and leaves day 365 at 44.2 percent bleached,
   * just below the brief's own 45 to 65 percent acceptance band. 700 000 is
   * consistent with both. See DECISIONS.md, decision 3.
   */
  photobleachHalfScaleFlashes: 700_000,
  /** Enzyme activity time constant, days. */
  enzymeTauDays: 400,
  /** Silver chloride reference drift, mV/day. */
  chlorideDriftMvPerDay: 0.15,
  /** Day beyond which chloride depletion accelerates. */
  chlorideKneeDay: 500,
  /** Drift multiplier past the knee. */
  chlorideAccelFactor: 3,
  /** Current offset per mV of reference drift, nA/mV. */
  chlorideOffsetNaPerMv: 0.015,
  /** Baseline fouling accumulation, 1/day, first-order towards fully fouled. */
  foulingRatePerDay: 0.000788,
  /** A protein deposition event adds this much fouling, fraction. */
  foulingEventStep: 0.35,
  /** A flush removes this fraction of current fouling. */
  flushFoulingRemoval: 0.5,
} as const;

// --------------------------------------------------------------------------
// Front ends
// --------------------------------------------------------------------------

export const OPTICAL = {
  /** Fluorescence ratio at zero glucose. */
  ratioZero: 0.8,
  /** Ratio gain, per mmol/L. */
  ratioPerMmol: 0.06,
  /**
   * Mannitol offset on the ratio, dimensionless.
   *
   * Boronic acid binds the diol, so any polyol reads as glucose. The brief
   * names sorbitol as well, but its fault list has one polyol entry, so
   * sorbitol is not modelled separately: it would be the same mechanism
   * with a different number, and a nineteenth fault the brief did not ask
   * for. See DECISIONS.md decision 27.
   */
  mannitolOffset: 0.25,
  /** Temperature term, ratio per degree C away from 37. */
  ratioPerDegC: 0.004,
  /** Ratio noise at zero bleaching, standard deviation. */
  ratioNoiseSd0: 0.012,
  /** Flashes per acquisition. One excitation flash, two emission bands. */
  flashesPerAcquisition: 1,
  /** Nominal returned photon counts at zero bleaching, arbitrary units. */
  counts0: 100_000,
  /** Optical return lost per micrometre of capsule, fraction per um. */
  opticalLossPerMicron: 0.0016,
} as const;

export const ELECTROCHEMICAL = {
  /** Background current, nA. */
  currentZeroNa: 0.5,
  /** Current gain at full enzyme activity, nA per mmol/L. */
  currentPerMmolNa: 2.0,
  /** Oxygen tension at which the enzyme reaction saturates, mmHg. */
  oxygenSaturationMmHg: 25,
  /** Glucose above which oxygen limitation appears, mmol/L. */
  oxygenLimitThreshold: 12,
  /** Fouling attenuation of sensitivity: S is scaled by (1 - k*f). */
  foulingSensitivityCoefficient: 0.6,
  /** Fouling multiplier on impedance: Z is scaled by (1 + k*f). */
  foulingImpedanceCoefficient: 3,
  /** Baseline impedance magnitude at 1 kHz, kOhm. */
  impedanceBaseKohm: 4.2,
  /** Impedance rise per micrometre of capsule, fraction per um. */
  impedanceCapsulePerMicron: 0.004,
  /** Impedance when the lead is open circuit, kOhm. */
  impedanceOpenCircuitKohm: 9999,
  /** Paracetamol peak current contribution, nA. */
  paracetamolPeakNa: 8,
  /** Paracetamol absorption time constant, min. */
  paracetamolTauAbsorbMin: 20,
  /** Paracetamol elimination half-life, min (4 hours). */
  paracetamolHalfLifeMin: 240,
  /** Vitamin C peak current contribution, nA. */
  vitaminCPeakNa: 3,
  /** Vitamin C absorption time constant, min. */
  vitaminCTauAbsorbMin: 8,
  /** Vitamin C elimination half-life, min (1 hour). */
  vitaminCHalfLifeMin: 60,
  /** Current noise, nA standard deviation, at nominal fouling. */
  currentNoiseSdNa: 0.35,
  /** Extra current noise per unit fouling, nA. */
  currentNoiseFoulingNa: 0.22,
} as const;

export const SENSING = {
  /** Acquisition period, s. */
  acquisitionPeriodS: 60,
  /** Impedance sweep period, s. */
  impedanceSweepPeriodS: 3600,
  /** Nominal tip temperature, degrees C. */
  tipTemperatureC: 37.0,
  /** Tip temperature noise, degrees C. */
  tipTemperatureNoiseC: 0.05,
  /** Reference temperature assumed when the thermistor has failed, degrees C. */
  thermistorFallbackC: 37.0,
  /** Finger-prick meter error, mmol/L standard deviation. */
  meterErrorSd: 0.4,
  /** Uncertainty added per day since calibration, mmol/L per day. */
  uncertaintyPerDaySinceCal: 0.06,
  /** Uncertainty added per unit fouling, mmol/L. */
  uncertaintyPerFouling: 0.9,
  /** Uncertainty floor, mmol/L. Nothing is ever claimed to be better than this. */
  uncertaintyFloor: 0.15,
  /** Prompt a calibration after this many days. */
  calibrationIntervalDays: 7,
  /**
   * Slow sensitivity drift per channel, stationary standard deviation.
   *
   * Not in the brief. Without it the only error left between calibrations is
   * white noise, which a three-sample filter removes almost entirely, and the
   * bench would claim an accuracy no real sensor has. Drift is what
   * calibration actually chases. See DECISIONS.md, decision 6.
   */
  sensorDriftSd: 0.025,
  /** Drift correlation time, days. */
  sensorDriftTauDays: 3,
} as const;

// --------------------------------------------------------------------------
// Safety supervisor
// --------------------------------------------------------------------------

export const ARBITRATION = {
  /** Absolute part of the agreement window, mmol/L. */
  agreeAbsolute: 1.0,
  /** Relative part of the agreement window, fraction of the mean. */
  agreeRelative: 0.15,
  /** Health score below which a tip is flagged. */
  healthFlagThreshold: 0.6,
  /** Rate of change beyond which a channel is implausible, mmol/L per min. */
  rateImplausibleMmolPerMin: 0.35,
  /** Impedance step, as a fraction of the modelled expectation, that flags a tip. */
  impedanceStepFlagFraction: 0.35,
  /** Optical return below this fraction of expected flags the optical tip. */
  opticalLossFlagFraction: 0.55,
  /** Fouling above this fraction contributes to a flag. */
  foulingFlagLevel: 0.45,
  /** Agreement must hold for this long before autonomy may be restored, min. */
  recoveryHoldMin: 15,
} as const;

// --------------------------------------------------------------------------
// Controller, pump and the clinician envelope
// --------------------------------------------------------------------------

export const CONTROLLER = {
  /** Proportional gain, U/h per mmol/L. */
  kp: 0.55,
  /** Integral gain, U/h per mmol/L per min. */
  ki: 0.0016,
  /** Derivative gain, U/h per (mmol/L per min). */
  kd: 9.0,
  /** Integral term clamp, U/h. */
  integralClamp: 1.6,
  /** Insulin on board decay time constant, min. */
  tauIobMin: 100,
  /** Correction bolus is reduced by this much per unit of insulin on board. */
  iobFeedbackFraction: 1.0,
  /** Basal is reduced by this much, U/h, per unit of insulin on board. */
  iobBasalFraction: 0.05,
  /** Minimum interval between correction boluses, min. */
  correctionIntervalMin: 30,
  /** Smallest bolus the pump will deliver, U. */
  minBolusUnits: 0.2,
  /** Bolus delivery duration, min. */
  bolusDeliveryMin: 5,
  /** Prediction horizon used for correction decisions, min. */
  correctionHorizonMin: 30,
  /** Confidence multiplier on the uncertainty band at full autonomy. */
  confidenceKFull: 1.0,
  /** Confidence multiplier at reduced autonomy. Wider band, less insulin. */
  confidenceKReduced: 2.0,
  /** At reduced autonomy the basal ceiling is this multiple of nominal basal. */
  reducedBasalCeilingFactor: 1.5,
} as const;

export const ENVELOPE_DEFAULT = {
  /** Nominal basal rate, U/h. */
  basalRate: 0.9,
  /** Hard basal ceiling, U/h. */
  maxBasal: 3.0,
  /** Hard bolus ceiling, U. */
  maxBolus: 4.0,
  /** Glucose target, mmol/L. */
  target: 6.5,
  /** Correction is considered above this predicted glucose, mmol/L. */
  correctionThreshold: 10.0,
  /** Suspend if predicted glucose at the suspend horizon is below this, mmol/L. */
  suspendThreshold: 4.0,
  /** Suspend prediction horizon, min. */
  suspendHorizonMin: 20,
  /** Insulin sensitivity factor, mmol/L per U. */
  isf: 2.8,
  /** Insulin to carbohydrate ratio, g per U. */
  icr: 10,
  /** Safe basal used when the supervisor says invalid, U/h. Never above basalRate. */
  safeBasal: 0.6,
  /** What invalid means for this patient. */
  onInvalid: "safe-basal" as "safe-basal" | "suspend",
} as const;

export type Envelope = {
  basalRate: number;
  maxBasal: number;
  maxBolus: number;
  target: number;
  correctionThreshold: number;
  suspendThreshold: number;
  suspendHorizonMin: number;
  isf: number;
  icr: number;
  safeBasal: number;
  onInvalid: "safe-basal" | "suspend";
};

export function defaultEnvelope(): Envelope {
  return normaliseEnvelope({ ...ENVELOPE_DEFAULT });
}

/**
 * Force an envelope into a shape that cannot express an unsafe instruction.
 *
 * These are structural guards, not preferences, and they are applied wherever
 * an envelope enters the engine, including a clinician changing it mid-run:
 *
 *   - the nominal basal rate cannot exceed the hard ceiling
 *   - the safe basal used when the supervisor distrusts the reading cannot
 *     exceed either the nominal rate or the ceiling, so falling back can
 *     never raise insulin
 *   - no bound is negative
 */
export function normaliseEnvelope(envelope: Envelope): Envelope {
  const maxBasal = Math.max(0, envelope.maxBasal);
  const basalRate = Math.min(Math.max(0, envelope.basalRate), maxBasal);
  return {
    ...envelope,
    maxBasal,
    basalRate,
    maxBolus: Math.max(0, envelope.maxBolus),
    safeBasal: Math.min(Math.max(0, envelope.safeBasal), basalRate),
  };
}

// --------------------------------------------------------------------------
// Scoreboard thresholds
// --------------------------------------------------------------------------

export const RANGES = {
  /** Time in range lower bound, mmol/L. */
  inRangeLow: 3.9,
  /** Time in range upper bound, mmol/L. */
  inRangeHigh: 10.0,
  /** Level 1 hypoglycaemia, mmol/L. */
  hypoLevel1: 3.9,
  /** Level 2 hypoglycaemia, mmol/L. */
  hypoLevel2: 3.0,
} as const;

// --------------------------------------------------------------------------
// Provenance table. Consumed by MODEL.md and by the "model" hover tags.
// --------------------------------------------------------------------------

/** Shorthand for the provenance table below. */
function n(path: string, unit: string, provenance: Provenance, note: string): ParamNote {
  return { path, unit, provenance, note };
}

export const PARAM_NOTES: readonly ParamNote[] = [
  // Physiology ------------------------------------------------------------
  n("PHYSIOLOGY.bodyMassKg", "kg", "brief", "The brief's subject."),
  n(
    "PHYSIOLOGY.glucoseVolumeL",
    "L",
    "deviation",
    "1.6 dL/kg x 70 kg, the standard minimal-model volume. The brief writes 1.6 L/kg, which is ten times larger and cannot produce the peak the brief's own acceptance check requires. See DECISIONS.md decision 2.",
  ),
  n("PHYSIOLOGY.startingGlucose", "mmol/L", "brief", "The brief's starting value."),
  n("PHYSIOLOGY.egpBasal", "mmol/min", "textbook", "About 2 mg/kg/min of basal hepatic glucose output."),
  n(
    "PHYSIOLOGY.uptakeInsulinIndependent",
    "mmol/min",
    "textbook",
    "Central nervous system and red cell uptake, roughly 120 g/day.",
  ),
  n(
    "PHYSIOLOGY.egpInsulinSensitivity",
    "per mU/L",
    "estimate",
    "Engineering estimate, tuned so production is suppressed to about a fifth at 40 mU/L above basal.",
  ),
  n("PHYSIOLOGY.egpMultiplierMin", "", "estimate", "Engineering estimate. A floor so production never goes negative."),
  n("PHYSIOLOGY.egpMultiplierMax", "", "estimate", "Engineering estimate. A ceiling for the dawn window."),
  n("PHYSIOLOGY.insulinBasal", "mU/L", "textbook", "A conventional fasting plasma insulin."),
  n(
    "PHYSIOLOGY.insulinGainPerUnitPerHour",
    "mU/L per U/h",
    "estimate",
    "Engineering estimate, chosen so the default 0.9 U/h basal holds plasma insulin at its basal value.",
  ),
  n("PHYSIOLOGY.tauInsulinMin", "min", "brief", "The brief's delivery to plasma lag for intraperitoneal insulin."),
  n("PHYSIOLOGY.tauActionMin", "min", "brief", "The brief's remote insulin action lag."),
  n(
    "PHYSIOLOGY.p2",
    "1/min per mU/L",
    "estimate",
    "Engineering estimate, tuned so one unit lowers glucose by about the default sensitivity factor of 2.8 mmol/L.",
  ),
  n("PHYSIOLOGY.mmolPerGramCarb", "mmol/g", "textbook", "1000 divided by the molar mass of glucose, 180.16 g/mol."),
  n(
    "PHYSIOLOGY.mealBioavailability",
    "",
    "estimate",
    "Engineering estimate. Nine tenths of ingested carbohydrate reaching plasma.",
  ),
  n(
    "PHYSIOLOGY.mealAbsorptionRate",
    "1/min",
    "brief",
    "The brief's two-compartment absorption peaking at 45 min, with about a fifth of peak still arriving at 3 h.",
  ),
  n("PHYSIOLOGY.exerciseSensitivityGain", "", "brief", "The brief's 40 percent rise in insulin sensitivity."),
  n("PHYSIOLOGY.exerciseOxygenDrop", "", "brief", "The brief's 15 percent fall in peritoneal oxygen."),
  n(
    "PHYSIOLOGY.sleepSensitivityFactor",
    "",
    "estimate",
    "Engineering estimate. The brief lists sleep as a control but says nothing about its effect.",
  ),
  n("PHYSIOLOGY.dawnProductionFactor", "", "estimate", "Engineering estimate for the dawn phenomenon."),
  n("PHYSIOLOGY.dawnWindowMin", "min", "estimate", "Engineering estimate for how long the dawn window lasts."),
  n("PHYSIOLOGY.tauPeritonealMin", "min", "brief", "The brief's plasma to peritoneal fluid equilibration."),
  n(
    "PHYSIOLOGY.tauSubcutaneousMin",
    "min",
    "brief",
    "The brief's subcutaneous comparator. Drawn as a ghost trace and never used for dosing.",
  ),
  n("PHYSIOLOGY.tauCapsuleBaseMin", "min", "brief", "The brief's tissue lag at zero capsule thickness."),
  n("PHYSIOLOGY.tauCapsulePerMicron", "min per um", "brief", "The brief's extra lag per micrometre of capsule."),
  n("PHYSIOLOGY.oxygenNominalMmHg", "mmHg", "brief", "The brief's nominal peritoneal oxygen tension."),
  n(
    "PHYSIOLOGY.oxygenFaultMmHg",
    "mmHg",
    "estimate",
    "Engineering estimate. The brief lists a low-oxygen fault but gives no value.",
  ),
  n(
    "PHYSIOLOGY.oxygenCapsuleScaleMicron",
    "um",
    "estimate",
    "Engineering estimate. The brief says a thicker capsule lowers oxygen but gives no rate.",
  ),
  n("PHYSIOLOGY.glucoseFloor", "mmol/L", "estimate", "A numerical guard, not physiology."),
  n("PHYSIOLOGY.glucoseCeiling", "mmol/L", "estimate", "A numerical guard, not physiology."),

  // Ageing ----------------------------------------------------------------
  n("AGEING.capsuleGrowthPerDay", "um/day", "brief", "The brief's bare capsule growth rate."),
  n("AGEING.coatEffect", "", "brief", "The brief's zwitterionic coat suppression."),
  n("AGEING.steroidEffect0", "", "brief", "The brief's peak steroid suppression."),
  n("AGEING.steroidTauDays", "days", "brief", "The brief's steroid elution time constant."),
  n(
    "AGEING.capsuleRemodelTauDays",
    "days",
    "deviation",
    "An added sink term. The brief's capsule equation is a pure ramp with no steady state, and integrating it lands day 365 at 147 um, above the brief's own 90 to 140 um band. See DECISIONS.md decision 4.",
  ),
  n("AGEING.flushRemovalFraction", "", "brief", "The brief's 20 percent of the surface layer removed by a flush."),
  n(
    "AGEING.omentalWrapMicron",
    "um",
    "estimate",
    "Engineering estimate. The brief says a wrap is a large capsule step but gives no size.",
  ),
  n(
    "AGEING.photobleachHalfScaleFlashes",
    "flashes",
    "deviation",
    "The brief says 900 000 and calls it about one year at one flash per minute. Those disagree, and 900 000 puts day 365 at 44.2 percent, outside the brief's own 45 to 65 percent band. See DECISIONS.md decision 3.",
  ),
  n("AGEING.enzymeTauDays", "days", "brief", "The brief's glucose oxidase decay time constant."),
  n("AGEING.chlorideDriftMvPerDay", "mV/day", "brief", "The brief's silver chloride reference drift."),
  n("AGEING.chlorideKneeDay", "day", "brief", "The brief's day beyond which chloride depletion accelerates."),
  n(
    "AGEING.chlorideAccelFactor",
    "",
    "estimate",
    "Engineering estimate. The brief says the drift accelerates past day 500 but not by how much.",
  ),
  n(
    "AGEING.chlorideOffsetNaPerMv",
    "nA/mV",
    "estimate",
    "Engineering estimate converting reference drift into a background current offset.",
  ),
  n(
    "AGEING.foulingRatePerDay",
    "1/day",
    "estimate",
    "Engineering estimate. First-order approach to fully fouled, reaching about 25 percent at one year.",
  ),
  n(
    "AGEING.foulingEventStep",
    "",
    "estimate",
    "Engineering estimate. The brief says fouling jumps on a deposition event but not by how much.",
  ),
  n("AGEING.flushFoulingRemoval", "", "estimate", "Engineering estimate for how much fouling a flush clears."),

  // Optical front end -----------------------------------------------------
  n("OPTICAL.ratioZero", "", "brief", "The brief's fluorescence ratio at zero glucose."),
  n("OPTICAL.ratioPerMmol", "per mmol/L", "brief", "The brief's ratio gain."),
  n("OPTICAL.mannitolOffset", "", "brief", "The brief's mannitol offset on the ratio."),
  n("OPTICAL.ratioPerDegC", "per degC", "brief", "The brief's temperature term."),
  n(
    "OPTICAL.ratioNoiseSd0",
    "ratio",
    "estimate",
    "Engineering estimate. 0.012 on a gain of 0.06 per mmol/L is about 0.2 mmol/L at day zero.",
  ),
  n("OPTICAL.flashesPerAcquisition", "flashes", "brief", "One flash per acquisition, as the brief describes."),
  n("OPTICAL.counts0", "counts", "estimate", "Arbitrary units. Only the ratio of counts to counts matters."),
  n(
    "OPTICAL.opticalLossPerMicron",
    "fraction per um",
    "estimate",
    "Engineering estimate for scattering loss through the capsule. Drives the optical-loss health flag.",
  ),

  // Electrochemical front end ---------------------------------------------
  n("ELECTROCHEMICAL.currentZeroNa", "nA", "brief", "The brief's background current."),
  n("ELECTROCHEMICAL.currentPerMmolNa", "nA per mmol/L", "brief", "The brief's current gain."),
  n("ELECTROCHEMICAL.oxygenSaturationMmHg", "mmHg", "brief", "The brief's oxygen saturation point."),
  n("ELECTROCHEMICAL.oxygenLimitThreshold", "mmol/L", "brief", "The brief's threshold above which oxygen limits."),
  n("ELECTROCHEMICAL.foulingSensitivityCoefficient", "", "brief", "The brief's 0.6 times fouling loss of sensitivity."),
  n("ELECTROCHEMICAL.foulingImpedanceCoefficient", "", "brief", "The brief's one plus three times fouling impedance rise."),
  n(
    "ELECTROCHEMICAL.impedanceBaseKohm",
    "kOhm",
    "estimate",
    "Engineering estimate. The brief gives no absolute impedance, only how it moves.",
  ),
  n(
    "ELECTROCHEMICAL.impedanceCapsulePerMicron",
    "fraction per um",
    "estimate",
    "Engineering estimate for how capsule thickness raises impedance.",
  ),
  n("ELECTROCHEMICAL.impedanceOpenCircuitKohm", "kOhm", "estimate", "A sentinel for a fractured lead, not a measurement."),
  n("ELECTROCHEMICAL.paracetamolPeakNa", "nA", "brief", "The brief's paracetamol contribution."),
  n(
    "ELECTROCHEMICAL.paracetamolTauAbsorbMin",
    "min",
    "estimate",
    "Engineering estimate. The brief implies a step; an oral drug ramps in, and a step would trip the rate-of-change check and hide the point scenario 3 makes. See DECISIONS.md.",
  ),
  n("ELECTROCHEMICAL.paracetamolHalfLifeMin", "min", "brief", "The brief's 4 hour half-life."),
  n("ELECTROCHEMICAL.vitaminCPeakNa", "nA", "brief", "The brief's vitamin C contribution."),
  n("ELECTROCHEMICAL.vitaminCTauAbsorbMin", "min", "estimate", "Engineering estimate, as for paracetamol."),
  n("ELECTROCHEMICAL.vitaminCHalfLifeMin", "min", "brief", "The brief's 1 hour half-life."),
  n(
    "ELECTROCHEMICAL.currentNoiseSdNa",
    "nA",
    "estimate",
    "Engineering estimate. 0.35 nA on a gain of 2.0 nA per mmol/L is about 0.18 mmol/L, in line with published continuous monitor noise.",
  ),
  n("ELECTROCHEMICAL.currentNoiseFoulingNa", "nA", "estimate", "Engineering estimate for extra noise from a fouled membrane."),

  // Sensing and calibration -----------------------------------------------
  n("SENSING.acquisitionPeriodS", "s", "brief", "The brief's once per 60 s acquisition."),
  n("SENSING.impedanceSweepPeriodS", "s", "brief", "The brief's hourly impedance sweep."),
  n("SENSING.tipTemperatureC", "degC", "estimate", "Body temperature."),
  n("SENSING.tipTemperatureNoiseC", "degC", "estimate", "Engineering estimate for thermistor noise."),
  n("SENSING.thermistorFallbackC", "degC", "estimate", "What the device assumes when the thermistor has failed."),
  n("SENSING.meterErrorSd", "mmol/L", "brief", "The brief's finger-prick meter error."),
  n(
    "SENSING.uncertaintyPerDaySinceCal",
    "mmol/L per day",
    "estimate",
    "Engineering estimate. The brief says time since calibration widens uncertainty but not by how much.",
  ),
  n("SENSING.uncertaintyPerFouling", "mmol/L", "estimate", "Engineering estimate for how fouling widens the band."),
  n("SENSING.uncertaintyFloor", "mmol/L", "estimate", "Nothing is ever claimed to be more certain than this."),
  n(
    "SENSING.calibrationIntervalDays",
    "days",
    "estimate",
    "Engineering estimate for how often the device prompts for a reference reading.",
  ),
  n(
    "SENSING.sensorDriftSd",
    "fraction",
    "estimate",
    "Not in the brief. Added because without drift the only error left is white noise, which the filter removes, and the bench would claim an accuracy no real sensor has. See DECISIONS.md decision 6.",
  ),
  n("SENSING.sensorDriftTauDays", "days", "estimate", "Engineering estimate for the drift correlation time."),

  // Safety supervisor ------------------------------------------------------
  n("ARBITRATION.agreeAbsolute", "mmol/L", "brief", "The brief's absolute part of the agreement window."),
  n("ARBITRATION.agreeRelative", "", "brief", "The brief's relative part of the agreement window."),
  n(
    "ARBITRATION.healthFlagThreshold",
    "",
    "estimate",
    "Engineering estimate. The brief describes health evidence but sets no threshold.",
  ),
  n(
    "ARBITRATION.rateImplausibleMmolPerMin",
    "mmol/L per min",
    "estimate",
    "Engineering estimate. 0.35 mmol/L per min is about 21 mmol/L per hour, faster than physiology allows.",
  ),
  n(
    "ARBITRATION.impedanceStepFlagFraction",
    "",
    "estimate",
    "Engineering estimate for what counts as a step against the device's own baseline.",
  ),
  n("ARBITRATION.opticalLossFlagFraction", "", "estimate", "Engineering estimate for what counts as lost optical return."),
  n("ARBITRATION.foulingFlagLevel", "", "estimate", "Engineering estimate for the fouling that starts to count against a tip."),
  n("ARBITRATION.recoveryHoldMin", "min", "brief", "The brief's 15 minutes of restored agreement before autonomy may rise."),

  // Controller and envelope -------------------------------------------------
  n("CONTROLLER.kp", "U/h per mmol/L", "estimate", "Engineering estimate, tuned on the ordinary-day scenario."),
  n("CONTROLLER.ki", "U/h per mmol/L per min", "estimate", "Engineering estimate, tuned on the ordinary-day scenario."),
  n("CONTROLLER.kd", "U/h per mmol/L per min", "estimate", "Engineering estimate, tuned on the ordinary-day scenario."),
  n("CONTROLLER.integralClamp", "U/h", "estimate", "Anti-windup bound. Engineering estimate."),
  n("CONTROLLER.tauIobMin", "min", "estimate", "Engineering estimate for how long delivered insulin counts as on board."),
  n("CONTROLLER.iobFeedbackFraction", "", "estimate", "A correction bolus is reduced by the full insulin on board."),
  n(
    "CONTROLLER.iobBasalFraction",
    "U/h per U",
    "estimate",
    "Engineering estimate. Deliberately small: a large value made announcing a meal worse than not announcing it.",
  ),
  n("CONTROLLER.correctionIntervalMin", "min", "estimate", "Engineering estimate for the minimum gap between corrections."),
  n("CONTROLLER.minBolusUnits", "U", "estimate", "The smallest dose a pump of this class would deliver."),
  n("CONTROLLER.bolusDeliveryMin", "min", "estimate", "Engineering estimate for how long a full bolus takes to deliver."),
  n("CONTROLLER.correctionHorizonMin", "min", "estimate", "Engineering estimate for the correction prediction horizon."),
  n("CONTROLLER.confidenceKFull", "", "estimate", "The controller doses one standard deviation below the estimate at full autonomy."),
  n(
    "CONTROLLER.confidenceKReduced",
    "",
    "estimate",
    "Two standard deviations at reduced autonomy. This is what makes a wider band always mean less insulin.",
  ),
  n(
    "CONTROLLER.reducedBasalCeilingFactor",
    "",
    "estimate",
    "Engineering estimate. At reduced autonomy the basal ceiling is 1.5 times the nominal rate.",
  ),
  n("ENVELOPE_DEFAULT.basalRate", "U/h", "brief", "The brief's default basal rate."),
  n("ENVELOPE_DEFAULT.maxBasal", "U/h", "brief", "The brief's hard basal bound."),
  n("ENVELOPE_DEFAULT.maxBolus", "U", "brief", "The brief's hard bolus bound."),
  n("ENVELOPE_DEFAULT.target", "mmol/L", "estimate", "Engineering estimate. The brief sets bounds but no target."),
  n("ENVELOPE_DEFAULT.correctionThreshold", "mmol/L", "estimate", "Engineering estimate for when a correction is considered."),
  n("ENVELOPE_DEFAULT.suspendThreshold", "mmol/L", "brief", "The brief's predicted-glucose suspend threshold."),
  n("ENVELOPE_DEFAULT.suspendHorizonMin", "min", "brief", "The brief's 20 minute suspend prediction horizon."),
  n("ENVELOPE_DEFAULT.isf", "mmol/L per U", "estimate", "Engineering estimate for the insulin sensitivity factor."),
  n("ENVELOPE_DEFAULT.icr", "g per U", "estimate", "Engineering estimate for the insulin to carbohydrate ratio."),
  n(
    "ENVELOPE_DEFAULT.safeBasal",
    "U/h",
    "estimate",
    "Engineering estimate. Forced at or below the nominal rate by normaliseEnvelope, so falling back can never raise insulin.",
  ),
  n("ENVELOPE_DEFAULT.onInvalid", "", "brief", "The brief's choice between safe basal and suspend on invalid."),

  // Scoreboard --------------------------------------------------------------
  n("RANGES.inRangeLow", "mmol/L", "brief", "The brief's time-in-range lower bound."),
  n("RANGES.inRangeHigh", "mmol/L", "brief", "The brief's time-in-range upper bound."),
  n("RANGES.hypoLevel1", "mmol/L", "brief", "The brief's level 1 hypoglycaemia threshold."),
  n("RANGES.hypoLevel2", "mmol/L", "brief", "The brief's level 2 hypoglycaemia threshold."),
];
