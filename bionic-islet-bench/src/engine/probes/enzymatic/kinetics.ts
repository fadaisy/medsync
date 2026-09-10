/**
 * Glucose oxidase, as it actually works.
 *
 * ## Ping-pong bi-bi, and why the form matters
 *
 * The enzyme does not bind glucose and oxygen at once. It takes glucose,
 * hands two hydrogens to its flavin, releases the lactone, and only then
 * meets oxygen, which reoxidises the flavin and leaves as peroxide. Two
 * half-reactions with no ternary complex, which gives the ping-pong bi-bi
 * rate law:
 *
 *     v = k_cat E G O2 / ( K_G O2 + K_O2 G + G O2 )
 *
 * Everything the probe does wrong at low oxygen falls out of that
 * denominator. As oxygen goes to zero the first and third terms vanish and
 *
 *     v -> k_cat E O2 / K_O2
 *
 * which is linear in oxygen and completely blind to glucose. That is oxygen
 * limitation, and there is no test for it anywhere in this file: it is the
 * rate law, not a branch.
 *
 * ## Only one anomer is a substrate
 *
 * Glucose in water is a mixture of the alpha and beta pyranose forms, and the
 * enzyme takes only beta. Normally that hardly matters, because the mixture
 * sits at its equilibrium of about 64 per cent beta. It matters here because
 * the enzyme layer consumes beta faster than mutarotation can replace it, so
 * the layer runs beta-depleted and the effective substrate is set partly by
 * a hundred-second interconversion rather than by transport. Both anomers are
 * therefore carried as separate species.
 *
 * ## The enzyme ages because of what it makes
 *
 * Peroxide attacks glucose oxidase. So the activity in each slice of the
 * layer falls at a rate set by the peroxide in that slice, plus a slow
 * thermal term that applies with no peroxide at all:
 *
 *     dE/dt = -( k_therm + k_inact [H2O2] ) E
 *
 * There is no imposed decay constant and no ageing curve. A probe held at
 * high glucose makes more peroxide and ages faster, and the outer skin of the
 * layer, where the peroxide is highest, dies first. Both of those are results.
 */
import type { Kelvin, MolPerCubicMetre, PerSecond, RateMolPerM3S, Seconds } from "../units.ts";

import { ENV, ENZ, FUND } from "../constants.ts";
import { molPerM3, perSecond, rate, raw } from "../units.ts";

/**
 * Arrhenius factor on the catalytic rate, 1 at body temperature.
 *
 *     exp( -E_a/R (1/T - 1/T_ref) )
 *
 * Rising with temperature, as catalysis does. This is the only temperature
 * term in the enzymatic probe: diffusivities are quoted at 37 C and the probe
 * does not stray far enough from it for the Stokes-Einstein correction to
 * compete with a forty kilojoule activation energy.
 */
export function catalyticTemperatureFactor(temperature: Kelvin): number {
  const exponent =
    (-raw(ENZ.activationEnergy) / raw(FUND.gasConstant)) *
    (1 / raw(temperature) - 1 / raw(ENV.bodyTemperature));
  return Math.exp(exponent);
}

/**
 * The ping-pong bi-bi turnover rate, mol/(m3 s).
 *
 * `enzyme` is the local active enzyme concentration, which falls as the layer
 * ages, so this is the rate of a slice of layer rather than of the design.
 */
export function turnoverRate(
  enzyme: MolPerCubicMetre,
  betaGlucose: MolPerCubicMetre,
  oxygen: MolPerCubicMetre,
  temperature: Kelvin,
): RateMolPerM3S {
  const g = Math.max(raw(betaGlucose), 0);
  const o = Math.max(raw(oxygen), 0);
  const denominator = raw(ENZ.kmGlucose) * o + raw(ENZ.kmOxygen) * g + g * o;
  if (denominator <= 0) return rate(0);
  const vmax = raw(ENZ.kCat) * catalyticTemperatureFactor(temperature) * Math.max(raw(enzyme), 0);
  return rate((vmax * g * o) / denominator);
}

/**
 * How much of the turnover the oxygen half-reaction is responsible for
 * limiting, between 0 and 1.
 *
 * Purely diagnostic: it is the shortfall against the same rate computed with
 * oxygen held at its bulk dissolved value. Nothing in the model reads it, and
 * removing it would change no number.
 */
export function oxygenLimitationFraction(
  enzyme: MolPerCubicMetre,
  betaGlucose: MolPerCubicMetre,
  oxygen: MolPerCubicMetre,
  temperature: Kelvin,
): number {
  const here = raw(turnoverRate(enzyme, betaGlucose, oxygen, temperature));
  const plentiful = raw(
    turnoverRate(enzyme, betaGlucose, molPerM3(raw(oxygen) * 1000 + 1), temperature),
  );
  if (plentiful <= 0) return 0;
  return Math.min(Math.max(1 - here / plentiful, 0), 1);
}

/**
 * Net production of the beta anomer by mutarotation, mol/(m3 s).
 *
 * The mixture relaxes towards its equilibrium composition with rate constant
 * `k_mut`; the alpha anomer loses exactly what beta gains.
 */
export function mutarotationRate(
  alphaGlucose: MolPerCubicMetre,
  betaGlucose: MolPerCubicMetre,
): RateMolPerM3S {
  const total = Math.max(raw(alphaGlucose), 0) + Math.max(raw(betaGlucose), 0);
  return rate(
    raw(ENZ.mutarotation) * (raw(ENZ.betaFractionEquilibrium) * total - raw(betaGlucose)),
  );
}

/** First-order hydrolysis rate constant of the lactone, from its half-life. */
export function lactoneHydrolysisRate(): PerSecond {
  return perSecond(Math.LN2 / raw(ENZ.lactoneHalfLife));
}

/** Rate at which peroxide and heat together are destroying the enzyme, per second. */
export function inactivationRate(peroxide: MolPerCubicMetre): PerSecond {
  return perSecond(
    raw(ENZ.thermalInactivation) + raw(ENZ.peroxideInactivation) * Math.max(raw(peroxide), 0),
  );
}

/**
 * Surviving active enzyme after `dt` at this peroxide concentration.
 *
 * Exact for a constant peroxide over the step rather than an Euler update, so
 * a long bench tick does not accumulate integration error into what is meant
 * to be a year-long ageing curve.
 */
export function ageEnzyme(
  enzyme: MolPerCubicMetre,
  peroxide: MolPerCubicMetre,
  dt: Seconds,
): MolPerCubicMetre {
  return molPerM3(raw(enzyme) * Math.exp(-raw(inactivationRate(peroxide)) * raw(dt)));
}

/**
 * The pseudo-first-order rate constant the Thiele modulus needs.
 *
 * Michaelis-Menten well below saturation is first order at `k_cat E / K_G`,
 * which is the linearisation the modulus is defined for. Above saturation the
 * reaction is zero order and the modulus stops meaning anything, which is why
 * the effectiveness factor is reported next to it.
 */
export function pseudoFirstOrderRate(enzyme: MolPerCubicMetre, temperature: Kelvin): PerSecond {
  return perSecond(
    (raw(ENZ.kCat) * catalyticTemperatureFactor(temperature) * Math.max(raw(enzyme), 0)) /
      raw(ENZ.kmGlucose),
  );
}

/**
 * Local pH depression from accumulated gluconate.
 *
 * Gluconic acid has a pKa near four, so at the pH of the body every gluconate
 * in the layer has already given up its proton. The pH shift is then the acid
 * concentration over the buffer capacity.
 *
 * Nothing in the enzymatic model reads this. No pH dependence of glucose
 * oxidase is declared in the constants table, so inventing one to consume this
 * number would be inventing physics; it is reported instead. It is a real
 * design consideration and it belongs on the instrument, not in a rate law
 * that has no source.
 */
export function localPh(gluconate: MolPerCubicMetre): number {
  return raw(ENV.peritonealPh) - Math.max(raw(gluconate), 0) / raw(ENZ.bufferCapacity);
}
