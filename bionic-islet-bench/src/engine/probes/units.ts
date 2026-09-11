/**
 * Branded units.
 *
 * The probe models mix metres, seconds, moles per cubic metre, amperes and
 * volts, and the commonest way to get a diffusion-reaction model wrong is to
 * add a concentration to a flux without noticing. Branding makes that a type
 * error rather than a silently wrong number.
 *
 * Everything inside `src/engine/probes` is SI. Conversion to the clinical
 * units the bench uses, mmol/L and nanoamperes and minutes, happens only at
 * the boundary in `index.ts`.
 *
 * The brands are erased at build time: a branded number is a number at
 * runtime, so there is no cost to using them.
 */

declare const brand: unique symbol;

type Brand<T, B extends string> = T & { readonly [brand]: B };

// Base quantities -----------------------------------------------------------

/** Length, metres. */
export type Metres = Brand<number, "m">;
/** Area, square metres. */
export type SquareMetres = Brand<number, "m2">;
/** Volume, cubic metres. */
export type CubicMetres = Brand<number, "m3">;
/** Time, seconds. */
export type Seconds = Brand<number, "s">;
/** Thermodynamic temperature, kelvin. */
export type Kelvin = Brand<number, "K">;
/** Amount concentration, moles per cubic metre. 1 mol/m3 = 1 mmol/L. */
export type MolPerCubicMetre = Brand<number, "mol/m3">;
/** Amount, moles. */
export type Moles = Brand<number, "mol">;
/** Electric current, amperes. */
export type Amperes = Brand<number, "A">;
/** Electric potential, volts. */
export type Volts = Brand<number, "V">;
/** Electrical resistance, ohms. */
export type Ohms = Brand<number, "ohm">;
/** Capacitance, farads. */
export type Farads = Brand<number, "F">;

// Derived quantities --------------------------------------------------------

/** Diffusivity, square metres per second. */
export type DiffusivityM2PerS = Brand<number, "m2/s">;
/**
 * Permeability in the sense used by the transport solver: the product of
 * diffusivity and partition coefficient, D*K, in square metres per second.
 * Flux is this times the gradient of the partition-normalised concentration.
 */
export type PermeabilityM2PerS = Brand<number, "Dk m2/s">;
/** Membrane permeability, metres per second. Flux is this times a concentration. */
export type PermeabilityMPerS = Brand<number, "m/s">;
/** Molar flux, moles per square metre per second. */
export type FluxMolPerM2S = Brand<number, "mol/m2/s">;
/** Volumetric reaction rate, moles per cubic metre per second. */
export type RateMolPerM3S = Brand<number, "mol/m3/s">;
/** First-order rate constant, per second. */
export type PerSecond = Brand<number, "1/s">;
/** Second-order rate constant, cubic metres per mole per second. */
export type M3PerMolPerS = Brand<number, "m3/mol/s">;
/** Molar energy, joules per mole. */
export type JoulesPerMole = Brand<number, "J/mol">;
/** Pressure, pascals. */
export type Pascals = Brand<number, "Pa">;
/** Absorption cross-section, square metres per molecule. */
export type CrossSectionM2 = Brand<number, "m2/molecule">;
/** Photon flux, photons per square metre per second. */
export type PhotonFlux = Brand<number, "photon/m2/s">;
/** Number of molecules or photons, dimensionless count. */
export type Count = Brand<number, "count">;
/** A pure ratio, fraction or efficiency. Dimensionless by construction. */
export type Fraction = Brand<number, "fraction">;

// Constructors --------------------------------------------------------------
//
// One per unit, so the brand is applied deliberately at the point a raw number
// becomes a physical quantity. These are the only sanctioned way in.

const make =
  <T>() =>
  (value: number): T =>
    value as unknown as T;

export const m = make<Metres>();
export const m2 = make<SquareMetres>();
export const m3 = make<CubicMetres>();
export const s = make<Seconds>();
export const K = make<Kelvin>();
export const molPerM3 = make<MolPerCubicMetre>();
export const mol = make<Moles>();
export const A = make<Amperes>();
export const V = make<Volts>();
export const ohm = make<Ohms>();
export const farad = make<Farads>();
export const diffusivity = make<DiffusivityM2PerS>();
export const permeability = make<PermeabilityM2PerS>();
export const permeabilityMs = make<PermeabilityMPerS>();
export const flux = make<FluxMolPerM2S>();
export const rate = make<RateMolPerM3S>();
export const perSecond = make<PerSecond>();
export const m3PerMolPerS = make<M3PerMolPerS>();
export const jPerMol = make<JoulesPerMole>();
export const pascals = make<Pascals>();
export const crossSection = make<CrossSectionM2>();
export const photonFlux = make<PhotonFlux>();
export const count = make<Count>();
export const fraction = make<Fraction>();

/** Strip the brand. Use only where a raw number is genuinely wanted. */
export function raw(value: { valueOf(): number }): number {
  return value.valueOf();
}

// Clinical conversions ------------------------------------------------------
//
// The bench speaks mmol/L, nanoamperes, minutes and days. These are the only
// four places those units are allowed to meet SI.

/**
 * 1 mol/m3 is exactly 1 mmol/L, so this conversion is the identity. It exists
 * anyway, because writing it out is what stops someone assuming the wrong
 * factor of 1000 in either direction.
 */
export function mmolPerLitreToSi(value: number): MolPerCubicMetre {
  return molPerM3(value);
}

export function siToMmolPerLitre(value: MolPerCubicMetre): number {
  return raw(value);
}

/** Amperes to nanoamperes, which is the scale the bench's readouts use. */
export function ampsToNanoamps(value: Amperes): number {
  return raw(value) * 1e9;
}

export function nanoampsToAmps(value: number): Amperes {
  return A(value * 1e-9);
}

/** Degrees Celsius to kelvin. */
export function celsiusToKelvin(value: number): Kelvin {
  return K(value + 273.15);
}

export function kelvinToCelsius(value: Kelvin): number {
  return raw(value) - 273.15;
}

/**
 * Millimetres of mercury to pascals. Oxygen partial pressure arrives from the
 * bench in mmHg, which is what a blood gas analyser reads.
 */
export function mmHgToPascals(value: number): Pascals {
  return pascals(value * 133.322387415);
}

export function pascalsToMmHg(value: Pascals): number {
  return raw(value) / 133.322387415;
}

/** Micrometres to metres. Capsule and membrane thicknesses arrive in um. */
export function micronsToMetres(value: number): Metres {
  return m(value * 1e-6);
}

export function metresToMicrons(value: Metres): number {
  return raw(value) * 1e6;
}
