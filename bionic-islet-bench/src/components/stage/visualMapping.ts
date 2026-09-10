/**
 * The mappings from engine state to what is drawn.
 *
 * Every animated thing on the tip views goes through one of these, and each
 * has an exact inverse. That is what makes the binding checkable: the browser
 * check in `scripts/visual-binding.mjs` reads the rendered attribute, inverts
 * it here, and compares the result against the same quantity as printed by
 * the readouts panel, which is a different code path. If a drawing were faked
 * or drifted from the model, the two would stop agreeing.
 */

import { ELECTROCHEMICAL, OPTICAL } from "../../engine/params.ts";

function clamp(value: number, low: number, high: number): number {
  return value < low ? low : value > high ? high : value;
}

// --------------------------------------------------------------------------
// 1. Glow brightness of the hydrogel cap, from the fluorescence ratio.
// --------------------------------------------------------------------------

/** Ratio at zero glucose, and at the top of the drawn scale (20 mmol/L). */
export const RATIO_MIN = OPTICAL.ratioZero;
export const RATIO_MAX = OPTICAL.ratioZero + OPTICAL.ratioPerMmol * 20;
const GLOW_MIN = 0.12;
const GLOW_MAX = 1;

/** Opacity of the cap, 0.12 to 1, linear in the fluorescence ratio. */
export function glowBrightness(ratio: number): number {
  const fraction = (ratio - RATIO_MIN) / (RATIO_MAX - RATIO_MIN);
  return clamp(GLOW_MIN + fraction * (GLOW_MAX - GLOW_MIN), GLOW_MIN, GLOW_MAX);
}

/** The ratio a given cap brightness stands for. */
export function ratioFromGlow(brightness: number): number {
  const fraction = (brightness - GLOW_MIN) / (GLOW_MAX - GLOW_MIN);
  return RATIO_MIN + fraction * (RATIO_MAX - RATIO_MIN);
}

// --------------------------------------------------------------------------
// 2. Electron arrival rate at the platinum, from the electrode current.
// --------------------------------------------------------------------------

/**
 * Seconds for one drawn electron to cross the layer stack. More current means
 * they arrive faster, so the period falls as the current rises.
 */
export const ELECTRON_SCALE = 12;
export const ELECTRON_OFFSET = ELECTROCHEMICAL.currentZeroNa;
const ELECTRON_PERIOD_MIN = 0.15;
const ELECTRON_PERIOD_MAX = 6;

export function electronPeriodSeconds(currentNa: number): number {
  const period = ELECTRON_SCALE / (Math.max(currentNa, 0) + ELECTRON_OFFSET);
  return clamp(period, ELECTRON_PERIOD_MIN, ELECTRON_PERIOD_MAX);
}

/** The current a given electron period stands for, nA. */
export function currentFromElectronPeriod(periodSeconds: number): number {
  return ELECTRON_SCALE / periodSeconds - ELECTRON_OFFSET;
}

/** True when the period has hit a clamp, so the inverse is not meaningful. */
export function electronPeriodClamped(currentNa: number): boolean {
  const raw = ELECTRON_SCALE / (Math.max(currentNa, 0) + ELECTRON_OFFSET);
  return raw <= ELECTRON_PERIOD_MIN || raw >= ELECTRON_PERIOD_MAX;
}

// --------------------------------------------------------------------------
// 3. Capsule ring radius, from the modelled capsule thickness.
// --------------------------------------------------------------------------

export const CAPSULE_BASE_RADIUS = 9;
export const CAPSULE_RADIUS_PER_MICRON = 0.075;

/** Ring radius in the body view's own coordinates, from micrometres. */
export function capsuleRadius(micron: number): number {
  return CAPSULE_BASE_RADIUS + Math.max(0, micron) * CAPSULE_RADIUS_PER_MICRON;
}

/** The capsule thickness a given ring radius stands for, um. */
export function micronFromCapsuleRadius(radius: number): number {
  return (radius - CAPSULE_BASE_RADIUS) / CAPSULE_RADIUS_PER_MICRON;
}

/** Ring radius on the tip views, which are drawn much closer in. */
export const TIP_CAPSULE_BASE_RADIUS = 62;
export const TIP_CAPSULE_RADIUS_PER_MICRON = 0.42;

export function tipCapsuleRadius(micron: number): number {
  return TIP_CAPSULE_BASE_RADIUS + Math.max(0, micron) * TIP_CAPSULE_RADIUS_PER_MICRON;
}

export function micronFromTipCapsuleRadius(radius: number): number {
  return (radius - TIP_CAPSULE_BASE_RADIUS) / TIP_CAPSULE_RADIUS_PER_MICRON;
}

// --------------------------------------------------------------------------
// Supporting mappings. Not part of the three checked bindings, but they are
// derived from state rather than invented, and are documented in MODEL.md.
// --------------------------------------------------------------------------

/** Seconds for one glucose molecule to dock on the hydrogel. */
export function dockingPeriodSeconds(glucose: number): number {
  return clamp(9 / (Math.max(glucose, 0) + 1), 0.35, 9);
}

/** Seconds for one glucose molecule to cross the outer membrane. */
export function crossingPeriodSeconds(glucose: number, fouling: number): number {
  const permeability = 1 - 0.6 * clamp(fouling, 0, 1);
  return clamp(10 / ((Math.max(glucose, 0) + 1) * Math.max(permeability, 0.15)), 0.4, 14);
}

/** How dim the cap has gone, 0 fresh to 1 fully bleached. */
export function bleachFraction(flashes: number, halfScale: number): number {
  return 1 - Math.exp(-flashes / halfScale);
}

/** Radius of the steroid collar halo, which shrinks as the collar elutes. */
export function collarHaloRadius(steroidEffect: number): number {
  return 74 + clamp(steroidEffect, 0, 1) * 46;
}
