/**
 * The dosing controller, as pure functions.
 *
 * Kept separate from the engine so the safety properties can be tested
 * directly rather than inferred from a simulation run. Three of them matter:
 *
 *   1. The basal command never exceeds the envelope ceiling for the current
 *      autonomy level.
 *   2. The basal command is a non-increasing function of the uncertainty on
 *      the glucose estimate. A doubtful reading can never buy more insulin.
 *   3. No bolus is ever produced below full autonomy.
 */

import { CONTROLLER, type Envelope } from "./params.ts";
import { AUTONOMY, type AutonomyLevel } from "./types.ts";

export type ControlInput = {
  envelope: Envelope;
  autonomy: AutonomyLevel;
  /** Fused glucose estimate, mmol/L. */
  fused: number;
  /** One standard deviation on that estimate, mmol/L. */
  uncertainty: number;
  /** Rate of change of the fused estimate, mmol/L per min. */
  rate: number;
  /** Controller integral state, U/h. */
  integral: number;
  /** Insulin on board, U. */
  iob: number;
};

export type ControlOutput = {
  basal: number;
  integral: number;
  /** True when the predictive rule, not the supervisor, is holding delivery. */
  suspendedByPrediction: boolean;
  /** Glucose at the lower edge of the confidence band, mmol/L. */
  lowerBound: number;
};

function clamp(value: number, low: number, high: number): number {
  return value < low ? low : value > high ? high : value;
}

/** Confidence multiplier: wider at reduced autonomy, so less insulin. */
export function confidenceMultiplier(autonomy: AutonomyLevel): number {
  return autonomy === AUTONOMY.full ? CONTROLLER.confidenceKFull : CONTROLLER.confidenceKReduced;
}

/** The basal ceiling this autonomy level is allowed to reach, U/h. */
export function basalCeiling(envelope: Envelope, autonomy: AutonomyLevel): number {
  if (autonomy === AUTONOMY.full) return envelope.maxBasal;
  return Math.min(envelope.maxBasal, envelope.basalRate * CONTROLLER.reducedBasalCeilingFactor);
}

/**
 * Basal command for one step. `dtMin` is the step in minutes, used only to
 * advance the integral term.
 */
export function computeBasal(input: ControlInput, dtMin: number): ControlOutput {
  const { envelope, autonomy, fused, uncertainty, rate, iob } = input;

  if (autonomy === AUTONOMY.suspend) {
    return { basal: 0, integral: 0, suspendedByPrediction: false, lowerBound: fused };
  }
  if (autonomy === AUTONOMY.safeBasal) {
    return {
      basal: Math.min(envelope.safeBasal, envelope.basalRate),
      integral: 0,
      suspendedByPrediction: false,
      lowerBound: fused,
    };
  }

  // The controller doses on the lower edge of the confidence band, never on
  // the point estimate. This is the whole reason widening the band can only
  // ever reduce insulin.
  const lowerBound = fused - confidenceMultiplier(autonomy) * Math.max(0, uncertainty);
  const error = lowerBound - envelope.target;

  const integral = clamp(
    input.integral + CONTROLLER.ki * error * dtMin,
    -CONTROLLER.integralClamp,
    CONTROLLER.integralClamp,
  );

  const proposed =
    envelope.basalRate +
    CONTROLLER.kp * error +
    integral +
    CONTROLLER.kd * rate -
    CONTROLLER.iobBasalFraction * Math.max(0, iob);

  let basal = clamp(proposed, 0, basalCeiling(envelope, autonomy));

  const predicted = lowerBound + rate * envelope.suspendHorizonMin;
  const suspendedByPrediction = predicted < envelope.suspendThreshold;
  if (suspendedByPrediction) basal = 0;

  return {
    basal,
    integral: suspendedByPrediction ? Math.min(integral, 0) : integral,
    suspendedByPrediction,
    lowerBound,
  };
}

/** Meal bolus for announced carbohydrate, U. Full autonomy only. */
export function computeMealBolus(
  envelope: Envelope,
  autonomy: AutonomyLevel,
  carbGrams: number,
): number {
  if (autonomy !== AUTONOMY.full) return 0;
  const units = clamp(carbGrams / envelope.icr, 0, envelope.maxBolus);
  return units >= CONTROLLER.minBolusUnits ? units : 0;
}

/** Correction bolus, U. Full autonomy only, and always net of insulin on board. */
export function computeCorrectionBolus(
  envelope: Envelope,
  autonomy: AutonomyLevel,
  lowerBound: number,
  rate: number,
  iob: number,
): number {
  if (autonomy !== AUTONOMY.full) return 0;
  const predicted = lowerBound + rate * CONTROLLER.correctionHorizonMin;
  if (predicted <= envelope.correctionThreshold) return 0;
  const raw =
    (predicted - envelope.target) / envelope.isf -
    Math.max(0, iob) * CONTROLLER.iobFeedbackFraction;
  const units = clamp(raw, 0, envelope.maxBolus);
  return units >= CONTROLLER.minBolusUnits ? units : 0;
}
