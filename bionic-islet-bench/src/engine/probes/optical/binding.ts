/**
 * The optical probe's recognition chemistry: a boronic acid receptor binding
 * a diol, reversibly and competitively.
 *
 * ## The equilibrium
 *
 * An arylboronic acid forms a cyclic ester with a 1,2 or 1,3 diol. Glucose is
 * one such diol; so is fructose, so is every acyclic polyol. The receptor
 * cannot tell them apart by chemistry, only by affinity, so the model treats
 * all three as competitors for one site:
 *
 *     theta_G = (G/Kd_G) / ( 1 + G/Kd_G + F/Kd_F + M/Kd_M )
 *
 * This is the standard competitive Langmuir form and it is where the probe's
 * fructose and mannitol errors come from. Nothing is added to make those
 * errors happen; they are what a shared site means.
 *
 * ## Why pH moves the affinity
 *
 * Only the anionic tetrahedral boronate binds a diol well. The neutral
 * trigonal form barely does. The fraction in the binding form is set by the
 * boron pKa, so the apparent dissociation constant is
 *
 *     Kd(pH) = Kd(pH_ref) * (1 + 10^(pKa - pH)) / (1 + 10^(pKa - pH_ref))
 *
 * which rises, meaning affinity falls, as the medium acidifies. That is the
 * right direction: the enzymatic probe's own lactone acidifies its layer, and
 * the optical probe sitting in an acidotic patient reads differently.
 *
 * ## Why temperature moves it, and in which direction
 *
 * Boronate ester formation is exothermic. By van 't Hoff, an exothermic
 * association must weaken as the temperature rises, so Kd must **increase**
 * with T:
 *
 *     ln Ka(T) - ln Ka(T0) = -(dH/R) (1/T - 1/T0)
 *     Kd(T) = Kd(T0) * exp( (dH/R) (1/T - 1/T0) ),   dH < 0
 *
 * The build brief writes this with a leading minus sign on dH/R, which makes
 * binding get *tighter* on warming and contradicts the negative enthalpy the
 * brief supplies in the same sentence. The correct form is implemented here
 * and the deviation is recorded in DECISIONS.md.
 */
import type { Kelvin, MolPerCubicMetre, PerSecond, Seconds } from "../units.ts";

import { BIND, ENV, FUND, GEOM, PHOTO } from "../constants.ts";
import { molPerM3, perSecond, raw, s } from "../units.ts";

/** The conditions the receptor finds itself in. */
export type BindingConditions = {
  readonly temperature: Kelvin;
  /** Local pH. The gel is open to the interstitium, so normally the body's. */
  readonly ph: number;
};

/** Everything else in the fluid that binds the same site. */
export type Competitors = {
  readonly fructose: MolPerCubicMetre;
  readonly polyol: MolPerCubicMetre;
};

export const NORMAL_CONDITIONS: BindingConditions = {
  temperature: ENV.bodyTemperature,
  ph: ENV.peritonealPh,
};

export const NORMAL_COMPETITORS: Competitors = {
  fructose: ENV.plasmaFructose,
  polyol: ENV.plasmaPolyol,
};

/** The pH factor alone, 1 at the reference pH. */
export function phFactor(ph: number): number {
  const here = 1 + Math.pow(10, BIND.boronPka - ph);
  const reference = 1 + Math.pow(10, BIND.boronPka - BIND.referencePh);
  return here / reference;
}

/** The van 't Hoff factor alone, 1 at the reference temperature. */
export function temperatureFactor(temperature: Kelvin): number {
  const exponent =
    (raw(BIND.bindingEnthalpy) / raw(FUND.gasConstant)) *
    (1 / raw(temperature) - 1 / raw(BIND.referenceTemperature));
  return Math.exp(exponent);
}

/** Apparent dissociation constant for glucose under these conditions. */
export function dissociationConstant(conditions: BindingConditions): MolPerCubicMetre {
  return molPerM3(
    raw(BIND.kdGlucose) * phFactor(conditions.ph) * temperatureFactor(conditions.temperature),
  );
}

/**
 * The competitors' contribution to the denominator, dimensionless.
 *
 * Their own dissociation constants shift with pH and temperature for the same
 * reasons glucose's does, and by the same factors, because it is the receptor
 * that changes rather than the sugar.
 */
export function competitorLoad(competitors: Competitors, conditions: BindingConditions): number {
  const shift = phFactor(conditions.ph) * temperatureFactor(conditions.temperature);
  return (
    raw(competitors.fructose) / (raw(BIND.kdFructose) * shift) +
    raw(competitors.polyol) / (raw(BIND.kdPolyol) * shift)
  );
}

/** Fractional receptor occupancy by glucose alone. */
export function occupancy(
  glucose: MolPerCubicMetre,
  competitors: Competitors,
  conditions: BindingConditions,
): number {
  const kd = raw(dissociationConstant(conditions));
  const g = Math.max(raw(glucose), 0) / kd;
  return g / (1 + g + competitorLoad(competitors, conditions));
}

/**
 * Fractional occupancy by **anything**, which is what the fluorescence
 * actually reports.
 *
 *     theta_total = (G/Kd_G + F/Kd_F + M/Kd_M) / (1 + G/Kd_G + F/Kd_F + M/Kd_M)
 *
 * This distinction is the whole of the probe's polyol error and it is easy to
 * get backwards. The switch is the boron pulling on the amine's lone pair, and
 * the boron does that whenever it has esterified **a** diol. It has no way of
 * knowing which one. So a fructose or a mannitol sitting in the receptor
 * lights the molecule up exactly as a glucose would, and the instrument, which
 * inverts as though every occupied site held glucose, reads high.
 *
 * Using glucose occupancy alone would make a competitor read *low*, by taking
 * sites away from glucose. That is what a competitive binding assay does when
 * the label is the glucose; it is not what a single-site turn-on sensor does.
 */
export function totalOccupancy(
  glucose: MolPerCubicMetre,
  competitors: Competitors,
  conditions: BindingConditions,
): number {
  const kd = raw(dissociationConstant(conditions));
  const g = Math.max(raw(glucose), 0) / kd;
  const load = competitorLoad(competitors, conditions);
  return (g + load) / (1 + g + load);
}

/** d(theta)/d(glucose), needed by the storage term's Jacobian and by error propagation. */
export function occupancyDerivative(
  glucose: MolPerCubicMetre,
  competitors: Competitors,
  conditions: BindingConditions,
): number {
  const kd = raw(dissociationConstant(conditions));
  const load = competitorLoad(competitors, conditions);
  const denominator = 1 + Math.max(raw(glucose), 0) / kd + load;
  return (1 + load) / (kd * denominator * denominator);
}

/**
 * Glucose implied by a **total** occupancy: the inverse of `totalOccupancy`.
 *
 * The instrument inverts with `competitors` set to the calibration value, not
 * the true one, because it cannot measure fructose or know about an infusion.
 * When the true load exceeds the calibrated one, the extra occupied sites are
 * attributed to glucose and the reading comes out high. That mismatch is the
 * whole mechanism of the probe's polyol error, and it is visible here as a
 * caller's choice of argument rather than as an added term.
 */
export function glucoseFromOccupancy(
  theta: number,
  competitors: Competitors,
  conditions: BindingConditions,
): MolPerCubicMetre {
  const kd = raw(dissociationConstant(conditions));
  if (theta <= 0) return molPerM3(0);
  if (theta >= 1) return molPerM3(Number.POSITIVE_INFINITY);
  // Inverting the total occupancy:
  //     theta = (g + load) / (1 + g + load)   =>   g = theta/(1 - theta) - load
  const g = theta / (1 - theta) - competitorLoad(competitors, conditions);
  return molPerM3(Math.max(kd * g, 0));
}

// ---------------------------------------------------------------------------
// Receptor inventory
// ---------------------------------------------------------------------------

/**
 * Receptor concentration in the gel, mol/m3.
 *
 * This is **derived**, not declared. The receptor is the indicator: the same
 * molecule carries the boronic acid that binds and the amine whose lone pair
 * quenches, which is what makes the fluorescence report the binding at all.
 * So the receptor concentration is fixed by the dye loading and the gel
 * thickness that the photon budget already declares, and there is no freedom
 * left to choose it:
 *
 *     R_tot = N_dye0 / (L_gel * N_A)
 *
 * At the declared loading this comes out around twenty micromoles per litre,
 * five hundred times below Kd_G. The consequence, which the model produces
 * rather than assumes, is that reversible binding stores almost no glucose
 * and the gel's lag is diffusive rather than chemical. Declaring a separate,
 * larger receptor density would have made the retardation visible, and would
 * have been inventing a design feature to make a term matter.
 */
export function receptorDensity(
  dyeAreaDensity: number = PHOTO.dyeSurfaceDensity,
): MolPerCubicMetre {
  return molPerM3(dyeAreaDensity / (raw(GEOM.gelThickness) * raw(FUND.avogadro)));
}

/**
 * Total glucose held per cubic metre of gel: free plus bound.
 *
 * This is the storage term the transport solver needs. Bound glucose does not
 * diffuse, but it has to be filled before the free concentration can rise, so
 * it slows the response by exactly the factor `1 + R_tot dtheta/dC`, called
 * the retardation factor. That factor is reported rather than imposed.
 */
export function heldGlucose(
  free: MolPerCubicMetre,
  competitors: Competitors,
  conditions: BindingConditions,
  receptors: MolPerCubicMetre = receptorDensity(),
): MolPerCubicMetre {
  return molPerM3(raw(free) + raw(receptors) * occupancy(free, competitors, conditions));
}

/** `1 + R_tot d(theta)/dC`: how many times slower binding makes the gel. */
export function retardationFactor(
  free: MolPerCubicMetre,
  competitors: Competitors,
  conditions: BindingConditions,
  receptors: MolPerCubicMetre = receptorDensity(),
): number {
  return 1 + raw(receptors) * occupancyDerivative(free, competitors, conditions);
}

// ---------------------------------------------------------------------------
// Is equilibrium legitimate?
// ---------------------------------------------------------------------------

/**
 * Off rate, from the on rate and the dissociation constant.
 *
 * `Kd = k_off / k_on` is the definition of the equilibrium constant, so this
 * is not an extra parameter; it is the one the brief did not need to give.
 */
export function offRate(conditions: BindingConditions): PerSecond {
  return perSecond(raw(BIND.kOn) * raw(dissociationConstant(conditions)));
}

/**
 * Fraction of receptor sites that are free, given the glucose occupancy and
 * competitors held at their own equilibrium.
 *
 *     f = (1 - theta_G) / (1 + competitor load)
 *
 * because at equilibrium each competitor holds `f C_i / Kd_i` of the sites.
 * Holding them at equilibrium is safe: fructose and mannitol move on the
 * timescale of an hour and the receptor relaxes in a tenth of a second.
 */
export function freeSiteFraction(
  theta: number,
  competitors: Competitors,
  conditions: BindingConditions,
): number {
  return (1 - theta) / (1 + competitorLoad(competitors, conditions));
}

/**
 * Relaxation time of the binding equilibrium at a given glucose.
 *
 * The rate law is linear in theta at fixed glucose,
 *
 *     d(theta)/dt = a - b theta,
 *     a = k_on C / (1 + load),   b = a + k_off
 *
 * so the equilibrium is approached exponentially with time constant `1/b`.
 * The transport model treats binding as instantaneous, which is only allowed
 * if this time is far shorter than anything the probe is asked to follow. A
 * test checks that against a glucose ramp rather than asserting it.
 */
export function relaxationTime(
  glucose: MolPerCubicMetre,
  competitors: Competitors,
  conditions: BindingConditions,
): Seconds {
  const load = competitorLoad(competitors, conditions);
  const b = (raw(BIND.kOn) * Math.max(raw(glucose), 0)) / (1 + load) + raw(offRate(conditions));
  return s(1 / b);
}

/**
 * Advance the bound fraction by one step of the real kinetics.
 *
 * Solved exactly for constant glucose over the step rather than by an explicit
 * Euler update, so the comparison against the equilibrium assumption measures
 * the chemistry and not the integrator. Used only for that check; the probe
 * itself runs on the equilibrium isotherm.
 */
export function stepKineticOccupancy(
  theta: number,
  glucose: MolPerCubicMetre,
  competitors: Competitors,
  conditions: BindingConditions,
  dt: Seconds,
): number {
  const load = competitorLoad(competitors, conditions);
  const a = (raw(BIND.kOn) * Math.max(raw(glucose), 0)) / (1 + load);
  const b = a + raw(offRate(conditions));
  if (b <= 0) return theta;
  const settled = a / b;
  return settled + (theta - settled) * Math.exp(-b * raw(dt));
}
