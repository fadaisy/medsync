import type { DiffusivityM2PerS, Metres, MolPerCubicMetre, PerSecond } from "./units.ts";

import { raw } from "./units.ts";

/**
 * The dimensionless groups.
 *
 * These are not decoration. Each one answers a design question that the raw
 * concentrations do not:
 *
 *   Thiele modulus     is the enzyme layer reaction limited or diffusion
 *                      limited? Below about 1 the whole layer is working;
 *                      above it, only the outer skin is, and making the layer
 *                      thicker buys nothing.
 *
 *   Damkohler number   does the enzyme consume glucose faster than the outer
 *                      membrane can supply it? Above 1 the membrane is in
 *                      charge, which is exactly what it is for.
 *
 *   Biot number        is the capsule or the sensing layer the slower step?
 *                      Above 1 the capsule dominates, and the probe's speed
 *                      is set by tissue rather than by design.
 *
 *   Permeability ratio how much more easily does oxygen cross the outer
 *                      membrane than glucose? This single number is the whole
 *                      reason the membrane exists.
 */

/**
 * Thiele modulus, `phi = L sqrt(k/D)`.
 *
 * `k` is the pseudo-first-order rate constant of the layer. For
 * Michaelis-Menten kinetics well below saturation that is `k_cat E / K_M`,
 * which is the correct linearisation in the regime where the modulus is
 * informative.
 *
 * Valid for a first-order or linearised reaction in a slab. Above saturation
 * the reaction is zero order and the modulus loses its meaning; the caller
 * should read the effectiveness factor instead.
 */
export function thieleModulus(
  layerThickness: Metres,
  firstOrderRate: PerSecond,
  diffusivity: DiffusivityM2PerS,
): number {
  return raw(layerThickness) * Math.sqrt(raw(firstOrderRate) / raw(diffusivity));
}

/**
 * Effectiveness factor for a slab with one face sealed, `tanh(phi)/phi`.
 *
 * The fraction of the layer's enzyme that is actually doing work. It falls
 * away as the modulus rises, which is the quantitative form of "only the
 * outer skin is working".
 */
export function effectivenessFactor(thiele: number): number {
  if (thiele < 1e-6) return 1;
  return Math.tanh(thiele) / thiele;
}

/**
 * Damkohler number for the outer membrane: the maximum rate the enzyme layer
 * could consume glucose, over the maximum rate the membrane could deliver it.
 *
 *     Da = (k_cat E L_enz) / (P_outer C_bulk / L_outer)
 *
 * Above 1 the membrane limits and the response is linear in bulk glucose.
 * Below 1 the enzyme limits and the response follows the enzyme's own
 * saturation curve, which is the useless regime.
 */
export function damkohler(
  maximumVolumetricRate: number,
  enzymeThickness: Metres,
  membranePermeability: number,
  membraneThickness: Metres,
  bulkConcentration: MolPerCubicMetre,
): number {
  const consumption = maximumVolumetricRate * raw(enzymeThickness);
  const supply = (membranePermeability * raw(bulkConcentration)) / raw(membraneThickness);
  if (supply <= 0) return Infinity;
  return consumption / supply;
}

/**
 * Mass-transfer Biot number: external resistance over internal resistance.
 *
 *     Bi = (D_internal / L_internal) / (D_external / L_external)
 *
 * inverted from the heat-transfer convention so that larger means the outside
 * is the bottleneck, which is the way round a reader of this bench cares
 * about. Above 1 the capsule sets the response time.
 */
export function biotNumber(
  externalDiffusivity: DiffusivityM2PerS,
  externalThickness: Metres,
  internalDiffusivity: DiffusivityM2PerS,
  internalThickness: Metres,
): number {
  const external = raw(externalDiffusivity) / Math.max(raw(externalThickness), 1e-12);
  const internal = raw(internalDiffusivity) / Math.max(raw(internalThickness), 1e-12);
  if (external <= 0) return Infinity;
  return internal / external;
}

/**
 * Permeability ratio across a membrane, oxygen over glucose.
 *
 * Permeability here is the product of diffusivity and partition coefficient,
 * because a species that barely dissolves in the membrane is excluded just as
 * effectively as one that barely diffuses through it.
 */
export function permeabilityRatio(
  oxygenDiffusivity: DiffusivityM2PerS,
  oxygenPartition: number,
  glucoseDiffusivity: DiffusivityM2PerS,
  glucosePartition: number,
): number {
  const oxygen = raw(oxygenDiffusivity) * oxygenPartition;
  const glucose = raw(glucoseDiffusivity) * glucosePartition;
  if (glucose <= 0) return Infinity;
  return oxygen / glucose;
}

/**
 * Characteristic diffusion time through a slab, `L^2 / (2 D)`.
 *
 * The scale a response time should be compared against. The solver produces
 * the real response time; this is what it should be near.
 */
export function diffusionTime(thickness: Metres, diffusivity: DiffusivityM2PerS): number {
  return (raw(thickness) * raw(thickness)) / (2 * raw(diffusivity));
}
