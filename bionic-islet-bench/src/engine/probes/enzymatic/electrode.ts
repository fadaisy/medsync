/**
 * The platinum, the reference, and what the amplifier actually sees.
 *
 * ## The current is a flux, not a gain
 *
 * Every peroxide molecule that reaches the platinum at the working potential
 * gives up two electrons. So the signal is
 *
 *     I = n F A J_H2O2
 *
 * with `J` the molar flux the transport solver computed at the inner face.
 * There is no sensitivity coefficient and no calibration slope anywhere: the
 * current is the flux, and the flux is set by the membranes, the enzyme and
 * the oxygen. Interferents add their own term the same way, and the amplifier
 * cannot tell the two apart, which is the whole difficulty.
 *
 * ## Why the reference matters
 *
 * The working electrode is held at a potential measured against a silver,
 * silver chloride reference, and that reference only holds still while it has
 * silver chloride left to give. Every electron the working electrode collects
 * is one the reference must supply, so the reservoir drains at exactly the
 * signal current. As it empties, the local chloride activity collapses, the
 * Nernst potential runs away, and the working electrode's true potential
 * falls with it. Peroxide oxidation then slows on a Tafel slope.
 *
 * Nothing in that chain is a failure mode bolted on. The reference has a
 * finite charge, the model spends it, and the sensor dies of old age.
 *
 * ## The impedance is a circuit, not a number
 *
 * A Randles cell: solution resistance in series with the parallel
 * combination of the double-layer capacitance and the faradaic branch, the
 * faradaic branch being charge transfer resistance in series with a Warburg
 * element for semi-infinite diffusion. Fouling and capsule both add solution
 * resistance; a fractured lead is an open circuit. The bench reads one
 * frequency; the model has the whole spectrum, and the Probe Lab draws it.
 */
import type {
  Amperes,
  FluxMolPerM2S,
  Metres,
  MolPerCubicMetre,
  Ohms,
  PermeabilityMPerS,
  Volts,
} from "../units.ts";

import { ELEC, ENV, FUND, GEOM, IMP, SOLVER } from "../constants.ts";
import { A as amperes, molPerM3, ohm, permeabilityMs, raw, V } from "../units.ts";

/**
 * Nernst potential of a silver, silver chloride reference against the
 * standard hydrogen electrode.
 *
 *     E = E0 - (RT/F) ln( a_Cl / a_std )
 *
 * Chloride appears on the reduced side, so the potential rises as chloride
 * falls. That is the direction the reference fails in.
 */
export function referencePotential(chloride: MolPerCubicMetre, temperature: number): Volts {
  const activity = Math.max(raw(chloride) / raw(ELEC.standardChloride), raw(SOLVER.activityFloor));
  const thermal = (raw(FUND.gasConstant) * temperature) / raw(FUND.faraday);
  return V(raw(ELEC.referenceStandardPotential) - thermal * Math.log(activity));
}

/**
 * Fraction of the reference's silver chloride still available after a given
 * charge has passed through it.
 *
 * One electron consumes one silver chloride, so the reservoir is `F Q_Cl`
 * coulombs and no more.
 */
export function silverChlorideRemaining(chargePassed: number): number {
  const capacity = raw(FUND.faraday) * raw(ELEC.chlorideCapacity);
  return Math.min(Math.max(1 - chargePassed / capacity, 0), 1);
}

/**
 * Chloride activity the reference is actually poised against.
 *
 * While silver chloride remains, the reference sits in bulk extracellular
 * chloride. As the reservoir empties, the interface can no longer hold that
 * activity and it falls with the remaining fraction. This is the crudest part
 * of the model and it is here because the alternative is to declare the
 * reference immortal.
 */
export function referenceChloride(chargePassed: number): MolPerCubicMetre {
  const remaining = silverChlorideRemaining(chargePassed);
  return molPerM3(raw(ENV.chloride) * Math.max(remaining, raw(SOLVER.activityFloor)));
}

/** How far the reference has wandered from where it started, volts. */
export function referenceDrift(chargePassed: number, temperature: number): Volts {
  const now = raw(referencePotential(referenceChloride(chargePassed), temperature));
  const fresh = raw(referencePotential(ENV.chloride, temperature));
  return V(now - fresh);
}

/**
 * Heterogeneous rate constant for peroxide oxidation at the platinum, after
 * roughness and after whatever the reference has done to the potential.
 *
 * The bias is applied against the reference, so a reference that has drifted
 * up by dE leaves the working electrode dE lower than intended. Tafel makes
 * that exponential:
 *
 *     k = k_e rho_r exp( -beta_E dE )
 *
 * There is no cap on it. None is needed, because the transport solver puts
 * this in series with the diffusion of peroxide to the surface, so a fast
 * surface reaction simply becomes irrelevant rather than unphysical.
 */
export function peroxideSurfaceRate(drift: Volts): PermeabilityMPerS {
  return permeabilityMs(
    raw(ELEC.peroxideRateConstant) *
      raw(GEOM.electrodeRoughness) *
      Math.exp(-ELEC.potentialSensitivity * raw(drift)),
  );
}

/**
 * Permeability of an interferent to the electrode surface, after the
 * permselective film's rejection.
 *
 * Rejection enters as a reduction of the film's partition coefficient, not as
 * a factor applied to the current afterwards. That is where it physically
 * acts: a charged film keeps an anion out of the membrane in the first place.
 */
export function interferentSurfaceRate(): PermeabilityMPerS {
  return ELEC.interferentPermeability;
}

/** Faradaic current from a molar flux at the electrode. */
export function faradaicCurrent(flux: FluxMolPerM2S, electrons: number): Amperes {
  return amperes(electrons * raw(FUND.faraday) * raw(GEOM.electrodeGeometricArea) * raw(flux));
}

// ---------------------------------------------------------------------------
// The Randles cell
// ---------------------------------------------------------------------------

export type RandlesElements = {
  readonly solutionResistance: Ohms;
  readonly chargeTransferResistance: Ohms;
  readonly doubleLayerCapacitance: number;
  readonly warburgCoefficient: number;
  readonly openCircuit: boolean;
};

export type Impedance = {
  readonly real: number;
  readonly imaginary: number;
  readonly magnitude: number;
  /** Phase angle in degrees, negative for a capacitive cell. */
  readonly phase: number;
};

/**
 * The elements of the cell for a probe in a given state.
 *
 * Fouling multiplies the solution resistance; the capsule adds to it in
 * proportion to its thickness. Both are the declared coefficients and nothing
 * else. A fractured lead replaces the whole cell with an open circuit, which
 * is what an amplifier reads when there is no longer a circuit at all.
 */
export function randlesElements(
  foulingFraction: number,
  capsuleThickness: Metres,
  fractured: boolean,
): RandlesElements {
  const rise =
    1 +
    raw(IMP.foulingResistanceFactor) * Math.max(foulingFraction, 0) +
    IMP.capsuleResistancePerMetre * raw(capsuleThickness);
  return {
    solutionResistance: ohm(raw(IMP.solutionResistance) * rise),
    chargeTransferResistance: IMP.chargeTransferResistance,
    doubleLayerCapacitance: raw(IMP.doubleLayerCapacitance),
    warburgCoefficient: IMP.warburgCoefficient,
    openCircuit: fractured,
  };
}

/**
 * Impedance of the Randles cell at angular frequency `omega`.
 *
 *     Z = R_s + ( Z_f  ||  1/(j omega C_dl) ),   Z_f = R_ct + sigma (1 - j)/sqrt(omega)
 *
 * Written out in real and imaginary parts because there is no complex number
 * type here and importing one for four lines of algebra would be worse.
 */
export function randlesImpedance(elements: RandlesElements, omega: number): Impedance {
  if (elements.openCircuit) {
    const r = raw(IMP.openCircuitResistance);
    return { real: r, imaginary: 0, magnitude: r, phase: 0 };
  }
  if (omega <= 0) {
    // At direct current the capacitor is an open circuit and the Warburg
    // element is infinite, so the cell is purely resistive and unbounded.
    const r = raw(IMP.openCircuitResistance);
    return { real: r, imaginary: 0, magnitude: r, phase: 0 };
  }

  const warburg = elements.warburgCoefficient / Math.sqrt(omega);
  const fr = raw(elements.chargeTransferResistance) + warburg;
  const fi = -warburg;

  // The capacitive branch, 1/(j omega C) = -j/(omega C).
  const ci = -1 / (omega * elements.doubleLayerCapacitance);

  // Parallel combination: Z_f Z_C / (Z_f + Z_C).
  const numeratorReal = fr * 0 - fi * ci;
  const numeratorImaginary = fr * ci + fi * 0;
  const denominatorReal = fr;
  const denominatorImaginary = fi + ci;
  const denominatorSquared =
    denominatorReal * denominatorReal + denominatorImaginary * denominatorImaginary;

  const parallelReal =
    (numeratorReal * denominatorReal + numeratorImaginary * denominatorImaginary) /
    denominatorSquared;
  const parallelImaginary =
    (numeratorImaginary * denominatorReal - numeratorReal * denominatorImaginary) /
    denominatorSquared;

  const real = raw(elements.solutionResistance) + parallelReal;
  const imaginary = parallelImaginary;
  return {
    real,
    imaginary,
    magnitude: Math.hypot(real, imaginary),
    phase: (Math.atan2(imaginary, real) * 180) / Math.PI,
  };
}

/** The frequency the bench's health check reads, in radians per second. */
export function probeAngularFrequency(): number {
  return 2 * Math.PI * IMP.probeFrequency;
}
