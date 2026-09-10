/**
 * What happens to a photon between the fibre and the counter.
 *
 * ## The switch
 *
 * The indicator is a fluorophore with an amine next to it. While the amine's
 * lone pair is free, it quenches the excited state by photoinduced electron
 * transfer, and the molecule is nearly dark. When the boronic acid binds a
 * diol, the boron pulls on that lone pair, the transfer stops, and the
 * molecule lights up. So the quenching channel is switched off in proportion
 * to occupancy, and the fluorescence quantum yield is
 *
 *     Phi_f(theta) = k_r / ( k_r + k_nr + (1 - theta) k_PET )
 *
 * That is three rate constants competing for the same excited state. The
 * on-to-off contrast is not a parameter anywhere: it is what those three
 * numbers imply, and the model reports it.
 *
 * ## The chain
 *
 * Per flash, per square metre of illuminated gel:
 *
 *     excitations per molecule  x_e     = sigma_abs * Phi_photon * t_pulse
 *     excitations               N_exc   = N_dye * x_e
 *     emitted photons                   = N_exc * Phi_f
 *     photons reaching the detector     = emitted * A_fibre * eta_coll * eta_filt
 *     counted photoelectrons            = that * QE
 *
 * Two assumptions hide in that chain and both are checked rather than
 * asserted: the gel must be optically thin, or the far side of it sees less
 * light than the near side, and the excited-state population must be
 * negligible, or the molecules saturate and the response stops being linear
 * in the dye density. `opticalDepth` and `excitedStateFraction` compute them.
 *
 * ## Why the ratio survives bleaching
 *
 * Both dyes are excited by the same flash at the same wavelength and, by
 * design, with the same absorption cross-section, so both are destroyed at
 * the same fractional rate per flash. `N_dye / N_ref` is therefore constant,
 * and the ratio the instrument inverts is untouched while both channels fade.
 * That is a property of the design, produced here by giving both dyes the
 * same cross-section, not a correction applied afterwards.
 */

import type { Stream } from "../../rng.ts";
import type { Metres } from "../units.ts";

import { GEOM, PHOTO } from "../constants.ts";
import { poisson } from "../stochastic.ts";
import { raw } from "../units.ts";

/** Fluorescence quantum yield of the indicator at a given receptor occupancy. */
export function indicatorQuantumYield(theta: number): number {
  const clamped = Math.min(Math.max(theta, 0), 1);
  const kr = raw(PHOTO.kRadiative);
  const total = kr + raw(PHOTO.kNonRadiative) + (1 - clamped) * raw(PHOTO.kPet);
  return kr / total;
}

/** The occupancy that would produce this quantum yield: the inverse switch. */
export function occupancyFromQuantumYield(yieldValue: number): number {
  const kr = raw(PHOTO.kRadiative);
  const knr = raw(PHOTO.kNonRadiative);
  const kpet = raw(PHOTO.kPet);
  if (yieldValue <= 0) return 0;
  return 1 - (kr / yieldValue - kr - knr) / kpet;
}

/** Contrast between fully bound and fully unbound. Emergent, not declared. */
export function switchContrast(): number {
  return indicatorQuantumYield(1) / indicatorQuantumYield(0);
}

/** Mean number of times one molecule is excited during one flash. */
export function excitationsPerMolecule(): number {
  return raw(PHOTO.absorptionCrossSection) * PHOTO.pulseIrradiance * raw(PHOTO.pulseDuration);
}

/**
 * Optical depth of the dye layer at the excitation wavelength, `sigma N_area`.
 *
 * If this is not far below one, the gel shades itself and the uniform
 * illumination the rest of the model assumes is wrong.
 */
export function opticalDepth(areaDensity: number): number {
  return raw(PHOTO.absorptionCrossSection) * areaDensity;
}

/**
 * Fraction of molecules sitting in the excited state during the flash.
 *
 * The excitation rate per molecule is `sigma * Phi_photon`, and the excited
 * state decays at `k_r + k_nr + (1 - theta) k_PET`. The ratio is the steady
 * excited fraction. If it is not tiny the ground state depletes, the
 * absorption saturates, and counts stop being proportional to dye density.
 */
export function excitedStateFraction(theta: number): number {
  const excitation = raw(PHOTO.absorptionCrossSection) * PHOTO.pulseIrradiance;
  const decay =
    raw(PHOTO.kRadiative) +
    raw(PHOTO.kNonRadiative) +
    (1 - Math.min(Math.max(theta, 0), 1)) * raw(PHOTO.kPet);
  return excitation / (excitation + decay);
}

/**
 * Photons emitted by one channel per flash, per square metre of gel, from a
 * given surviving dye density and quantum yield.
 */
export function emittedPhotons(areaDensity: number, quantumYield: number): number {
  return areaDensity * excitationsPerMolecule() * quantumYield;
}

/** Emitted photons per square metre to counted photoelectrons. */
export function collectedCounts(emittedPerSquareMetre: number): number {
  return (
    emittedPerSquareMetre *
    raw(GEOM.fibreCoreArea) *
    raw(PHOTO.collectionEfficiency) *
    raw(PHOTO.filterTransmission) *
    raw(PHOTO.detectorQuantumEfficiency)
  );
}

/**
 * Expected indicator counts from a quantum yield and a surviving dye fraction.
 *
 * Takes the yield rather than the occupancy because the gel has a gradient
 * through it, and what the detector adds up is the yield of every molecule,
 * not the yield of the average molecule.
 */
export function indicatorCountsFromYield(quantumYield: number, survival: number): number {
  return collectedCounts(emittedPhotons(PHOTO.dyeSurfaceDensity * survival, quantumYield));
}

/** Expected indicator counts for a uniform occupancy and a surviving dye fraction. */
export function expectedIndicatorCounts(theta: number, survival: number): number {
  return indicatorCountsFromYield(indicatorQuantumYield(theta), survival);
}

/** Expected reference counts for a surviving dye fraction. The reference is glucose blind. */
export function expectedReferenceCounts(survival: number): number {
  return collectedCounts(
    emittedPhotons(PHOTO.referenceDyeDensity * survival, raw(PHOTO.referenceQuantumYield)),
  );
}

/**
 * Variance of a measured count, before dark subtraction.
 *
 * Signal and dark are both Poisson so each contributes its own mean; the
 * amplifier adds a Gaussian on top whose variance is independent of level.
 */
export function countVariance(signalMean: number): number {
  return signalMean + PHOTO.darkCounts + PHOTO.amplifierNoiseCounts * PHOTO.amplifierNoiseCounts;
}

/**
 * Draw one measured count: Poisson signal, Poisson dark, Gaussian read noise.
 *
 * The dark contribution is drawn rather than added as its mean, because the
 * instrument subtracts the *expected* dark and is left with the fluctuation.
 */
export function drawCounts(stream: Stream, signalMean: number): number {
  const signal = poisson(stream, signalMean);
  const dark = poisson(stream, PHOTO.darkCounts);
  const read = stream.gauss(0, PHOTO.amplifierNoiseCounts);
  return signal + dark + read;
}

/** What the instrument keeps after removing the expected dark level. */
export function darkCorrect(counts: number): number {
  return counts - PHOTO.darkCounts;
}

// ---------------------------------------------------------------------------
// Bleaching
// ---------------------------------------------------------------------------

/**
 * Fraction of a dye population destroyed per flash.
 *
 * Every excitation carries a probability `Phi_b` of destroying the molecule,
 * and a molecule is excited `x_e` times per flash, so the survival per flash
 * is `exp(-Phi_b x_e)`. Both dyes share `sigma_abs` and therefore share this
 * number, which is what makes the ratio bleach-proof.
 */
export function bleachRatePerFlash(): number {
  return raw(PHOTO.bleachQuantumYield) * excitationsPerMolecule();
}

/** Surviving fraction after a number of flashes. */
export function survivalAfterFlashes(flashes: number): number {
  return Math.exp(-bleachRatePerFlash() * flashes);
}

/** Survival updated by one flash, for the probe's running state. */
export function stepSurvival(survival: number): number {
  return survival * Math.exp(-bleachRatePerFlash());
}

// ---------------------------------------------------------------------------
// The ratio and its inversion
// ---------------------------------------------------------------------------

/**
 * The ratio the instrument would read at zero occupancy is not 1, because the
 * two channels have different dye densities and different yields. This is the
 * scale factor that turns a ratio back into an indicator quantum yield:
 *
 *     R = (N_dye Phi_f(theta)) / (N_ref Phi_f,ref)   =>   Phi_f = R / r0,
 *     r0 = (N_dye / N_ref) / Phi_f,ref
 *
 * Everything else in the chain, the flash energy, the collection optics, the
 * filter, the detector, appears identically in both channels and cancels. That
 * cancellation is the reason the probe is ratiometric.
 */
export function ratioScale(
  indicatorDensity: number = PHOTO.dyeSurfaceDensity,
  referenceDensity: number = PHOTO.referenceDyeDensity,
): number {
  return indicatorDensity / referenceDensity / raw(PHOTO.referenceQuantumYield);
}

/** Occupancy implied by a measured ratio. */
export function occupancyFromRatio(ratio: number, scale: number = ratioScale()): number {
  return occupancyFromQuantumYield(ratio / scale);
}

/** d(theta)/dR, for propagating counting noise into the reading. */
export function occupancySensitivityToRatio(ratio: number, scale: number = ratioScale()): number {
  const quantumYield = ratio / scale;
  if (quantumYield <= 0) return Number.POSITIVE_INFINITY;
  return raw(PHOTO.kRadiative) / (quantumYield * quantumYield * raw(PHOTO.kPet) * scale);
}

/** The excitation and the two emission wavelengths, for the Probe Lab's spectrum. */
export const WAVELENGTHS: {
  readonly excitation: Metres;
  readonly indicator: Metres;
  readonly reference: Metres;
} = {
  excitation: PHOTO.excitationWavelength,
  indicator: PHOTO.indicatorEmission,
  reference: PHOTO.referenceEmission,
};
