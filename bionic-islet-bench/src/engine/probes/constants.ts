import type {
  Count,
  CrossSectionM2,
  DiffusivityM2PerS,
  Fraction,
  JoulesPerMole,
  Kelvin,
  M3PerMolPerS,
  Metres,
  MolPerCubicMetre,
  Ohms,
  PermeabilityMPerS,
  PerSecond,
  Seconds,
  SquareMetres,
  Volts,
} from "./units.ts";

import {
  A,
  celsiusToKelvin,
  crossSection,
  diffusivity,
  farad,
  fraction,
  jPerMol,
  K,
  m,
  m2,
  m3PerMolPerS,
  micronsToMetres,
  mmHgToPascals,
  mol,
  molPerM3,
  ohm,
  permeabilityMs,
  perSecond,
  s,
  V,
} from "./units.ts";

/**
 * Every physical constant, rate constant, diffusivity, permeability and
 * geometry used by the probe models.
 *
 * Nothing numeric appears inline anywhere else in `src/engine/probes`. If a
 * formula needs a number, it comes from here, with a symbol, a unit and a
 * provenance.
 *
 * ## What "provenance" means here, honestly
 *
 * This build had no access to a literature database. A provenance string
 * therefore names the **class of source** a value comes from and the system it
 * describes, for example "glucose oxidase from Aspergillus niger, standard
 * enzymology reference range". It is not a citation to a specific paper, and
 * none of these values has been checked against a primary source in this
 * session.
 *
 * Treat every one of them as a reviewable claim. `ESTIMATE` marks the values
 * that are not even that: an engineering estimate chosen here because the
 * quantity is a property of a device that does not exist. Those carry an
 * `est` marker in the Probe Lab.
 *
 * See MODEL-PROBES.md section 1 for the same warning in the reviewer's copy.
 */

/** The exact string that marks a value as not coming from any document. */
export const ESTIMATE = "engineering estimate";

export type ConstantEntry<T> = {
  /** The symbol used for this quantity in MODEL-PROBES.md. */
  readonly symbol: string;
  readonly value: T;
  readonly unit: string;
  /** A literature source class, or exactly ESTIMATE. */
  readonly provenance: string;
  /** Why this value, or what it controls. */
  readonly note: string;
};

function k<T>(
  symbol: string,
  value: T,
  unit: string,
  provenance: string,
  note: string,
): ConstantEntry<T> {
  return { symbol, value, unit, provenance, note };
}

type Table = Record<string, ConstantEntry<unknown>>;
type Values<T extends Table> = {
  readonly [P in keyof T]: T[P] extends ConstantEntry<infer V> ? V : never;
};

/** Strip the metadata, leaving a typed value map for the formulas to use. */
function values<T extends Table>(table: T): Values<T> {
  const out: Record<string, unknown> = {};
  for (const [name, entry] of Object.entries(table)) out[name] = entry.value;
  return out as Values<T>;
}

// ---------------------------------------------------------------------------
// Fundamental constants
// ---------------------------------------------------------------------------

export const FUNDAMENTAL_TABLE = {
  gasConstant: k(
    "R",
    8.314462618,
    "J/(mol K)",
    "CODATA 2018 recommended value",
    "Ideal gas constant.",
  ),
  faraday: k(
    "F",
    96485.33212,
    "C/mol",
    "CODATA 2018 recommended value",
    "Charge per mole of electrons.",
  ),
  avogadro: k(
    "N_A",
    6.02214076e23,
    "1/mol",
    "CODATA 2018, exact by definition",
    "Molecules per mole.",
  ),
  planck: k(
    "h",
    6.62607015e-34,
    "J s",
    "CODATA 2018, exact by definition",
    "Planck constant, for photon energy.",
  ),
  lightSpeed: k(
    "c",
    299792458,
    "m/s",
    "CODATA 2018, exact by definition",
    "Speed of light in vacuum.",
  ),
} as const;

export const FUND = values(FUNDAMENTAL_TABLE);

// ---------------------------------------------------------------------------
// Environment defaults
// ---------------------------------------------------------------------------

export const ENVIRONMENT_TABLE = {
  bodyTemperature: k(
    "T_body",
    celsiusToKelvin(37),
    "K",
    "Normal human core temperature",
    "Reference temperature for every Arrhenius and van 't Hoff correction.",
  ),
  peritonealPh: k(
    "pH",
    7.4,
    "-",
    "Normal extracellular fluid pH",
    "Sets boronate speciation, so it sets apparent affinity.",
  ),
  peritonealOxygen: k(
    "pO2",
    mmHgToPascals(40),
    "Pa",
    "Typical peritoneal fluid oxygen tension, physiology reference range",
    "About half arterial. The enzymatic probe lives or dies by this number.",
  ),
  oxygenHenry: k(
    "H_O2",
    1.03e-5,
    "mol/(m3 Pa)",
    "Oxygen solubility in water at 37 C, standard physical chemistry tables",
    "Converts partial pressure to dissolved concentration. 40 mmHg gives about 0.055 mol/m3.",
  ),
  chloride: k(
    "a_Cl",
    molPerM3(103),
    "mol/m3",
    "Normal extracellular chloride, clinical reference range",
    "The activity the silver chloride reference is poised against.",
  ),
  plasmaFructose: k(
    "F_plasma",
    molPerM3(0.05),
    "mol/m3",
    "Normal fasting plasma fructose, clinical reference range",
    "Binds the receptor ten times tighter than glucose but is two hundred times rarer.",
  ),
  plasmaAscorbate: k(
    "A_plasma",
    molPerM3(0.05),
    "mol/m3",
    "Normal plasma ascorbate, clinical reference range",
    "Oxidised at the working potential if it reaches the electrode.",
  ),
  plasmaPolyol: k(
    "M_plasma",
    molPerM3(0),
    "mol/m3",
    "Normal plasma mannitol and sorbitol, clinical reference range",
    "Zero unless mannitol is infused. The bench raises it as a fault; the constant is the normal value.",
  ),
  capsuleGlucoseUptake: k(
    "k_up",
    perSecond(1.7e-5),
    "1/s",
    "Resting tissue glucose uptake, physiology reference range, written first order at 5 mmol/L",
    "The capsule is living tissue and eats some of the glucose crossing it. At this rate a fifty micrometre capsule barely depletes anything, which is a result the model produces rather than an assumption it makes.",
  ),
} as const;

export const ENV = values(ENVIRONMENT_TABLE);

// ---------------------------------------------------------------------------
// Diffusivities
// ---------------------------------------------------------------------------

export const DIFFUSIVITY_TABLE = {
  glucoseWater: k(
    "D_G,water",
    diffusivity(9.2e-10),
    "m2/s",
    "Aqueous glucose at 37 C, standard physical chemistry tables",
    "6.7e-10 at 25 C scaled by the Stokes-Einstein temperature and viscosity ratio.",
  ),
  oxygenWater: k(
    "D_O2,water",
    diffusivity(3.0e-9),
    "m2/s",
    "Aqueous oxygen at 37 C, standard physical chemistry tables",
    "Three times faster than glucose, which is the whole problem the outer membrane solves.",
  ),
  peroxideWater: k(
    "D_H2O2,water",
    diffusivity(1.7e-9),
    "m2/s",
    "Aqueous hydrogen peroxide at 37 C, standard physical chemistry tables",
    "Sets how much peroxide escapes outward rather than reaching the electrode.",
  ),
  interferentWater: k(
    "D_I,water",
    diffusivity(7.0e-10),
    "m2/s",
    "Small aromatic and organic acid solutes in water, standard range",
    "Used for paracetamol and ascorbate alike.",
  ),
  glucoseCapsule: k(
    "D_G,capsule",
    diffusivity(2.0e-10),
    "m2/s",
    ESTIMATE,
    "Fibrous capsule, about a fifth of the aqueous value. This is what makes a thick capsule slow.",
  ),
  oxygenCapsule: k(
    "D_O2,capsule",
    diffusivity(1.0e-9),
    "m2/s",
    ESTIMATE,
    "Oxygen is hindered less than glucose by a fibrous matrix, being smaller and uncharged.",
  ),
  glucoseGel: k(
    "D_G,gel",
    diffusivity(4.0e-10),
    "m2/s",
    ESTIMATE,
    "Hydrogel sensing layer of the optical probe.",
  ),
  glucoseFouling: k(
    "D_G,foul",
    diffusivity(1.5e-10),
    "m2/s",
    ESTIMATE,
    "Adsorbed protein film. Slows glucose more than oxygen, as a protein layer would.",
  ),
  oxygenFouling: k(
    "D_O2,foul",
    diffusivity(1.2e-9),
    "m2/s",
    ESTIMATE,
    "Oxygen through the same protein film.",
  ),
  glucoseOuterMembrane: k(
    "D_G,outer",
    diffusivity(3.0e-13),
    "m2/s",
    ESTIMATE,
    "Glucose-limiting membrane of a polyurethane or silicone class. Three orders below water, which is the point.",
  ),
  oxygenOuterMembrane: k(
    "D_O2,outer",
    diffusivity(1.2e-10),
    "m2/s",
    ESTIMATE,
    "Oxygen crosses the same membrane four hundred times more easily. That ratio is the design.",
  ),
  peroxideOuterMembrane: k(
    "D_H2O2,outer",
    diffusivity(2.0e-12),
    "m2/s",
    ESTIMATE,
    "Peroxide leaking outward.",
  ),
  glucoseEnzymeLayer: k(
    "D_G,enz",
    diffusivity(3.0e-10),
    "m2/s",
    ESTIMATE,
    "Crosslinked glucose oxidase and albumin gel.",
  ),
  oxygenEnzymeLayer: k(
    "D_O2,enz",
    diffusivity(1.8e-9),
    "m2/s",
    ESTIMATE,
    "Oxygen in the same gel.",
  ),
  peroxideEnzymeLayer: k(
    "D_H2O2,enz",
    diffusivity(1.0e-9),
    "m2/s",
    ESTIMATE,
    "Peroxide made here, consumed at the electrode.",
  ),
  peroxideInnerMembrane: k(
    "D_H2O2,inner",
    diffusivity(1.2e-10),
    "m2/s",
    ESTIMATE,
    "Permselective film. Peroxide is small and neutral so it passes; that is why the film works.",
  ),
  interferentInnerMembrane: k(
    "D_I,inner",
    diffusivity(1.0e-11),
    "m2/s",
    ESTIMATE,
    "Before rejection. The rejection factors below do most of the work.",
  ),
  glucoseInnerMembrane: k(
    "D_G,inner",
    diffusivity(5.0e-13),
    "m2/s",
    ESTIMATE,
    "The permselective film is not built to pass a sugar and does not. Glucose never needs to reach the platinum.",
  ),
  oxygenInnerMembrane: k(
    "D_O2,inner",
    diffusivity(8.0e-11),
    "m2/s",
    ESTIMATE,
    "Oxygen crosses this film too, which matters because the electrode gives oxygen back.",
  ),
  peroxideCapsule: k(
    "D_H2O2,capsule",
    diffusivity(8.0e-10),
    "m2/s",
    ESTIMATE,
    "Whatever peroxide escapes outward crosses the capsule.",
  ),
  peroxideFouling: k(
    "D_H2O2,foul",
    diffusivity(6.0e-10),
    "m2/s",
    ESTIMATE,
    "And the protein film before it.",
  ),
  interferentCapsule: k(
    "D_I,capsule",
    diffusivity(1.5e-10),
    "m2/s",
    ESTIMATE,
    "Paracetamol and ascorbate through the fibrous capsule.",
  ),
  interferentFouling: k(
    "D_I,foul",
    diffusivity(1.0e-10),
    "m2/s",
    ESTIMATE,
    "And through the adsorbed protein film.",
  ),
  interferentOuterMembrane: k(
    "D_I,outer",
    diffusivity(5.0e-12),
    "m2/s",
    ESTIMATE,
    "Sixteen times faster than glucose through the same film, because a small neutral aromatic is far more at home in a hydrophobic polymer than a sugar is. This is why the glucose-limiting membrane does not limit paracetamol.",
  ),
  interferentEnzymeLayer: k(
    "D_I,enz",
    diffusivity(5.0e-10),
    "m2/s",
    ESTIMATE,
    "Through the crosslinked protein gel.",
  ),
} as const;

export const DIFF = values(DIFFUSIVITY_TABLE);

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

export const GEOMETRY_TABLE = {
  boundaryLayer: k(
    "L_bl",
    micronsToMetres(30),
    "m",
    ESTIMATE,
    "Unstirred fluid layer at the probe surface. Peritoneal fluid moves, but not at the surface.",
  ),
  gelThickness: k(
    "L_gel",
    micronsToMetres(200),
    "m",
    ESTIMATE,
    "Hydrogel sensing layer of the optical probe.",
  ),
  foulingThicknessMax: k(
    "L_foul,max",
    micronsToMetres(12),
    "m",
    ESTIMATE,
    "Thickness at fouling fraction 1. The bench's fouling state scales this.",
  ),
  outerMembraneThickness: k(
    "L_outer",
    micronsToMetres(25),
    "m",
    ESTIMATE,
    "Glucose-limiting membrane. Thicker means more linear and slower.",
  ),
  enzymeLayerThickness: k("L_enz", micronsToMetres(8), "m", ESTIMATE, "Crosslinked enzyme layer."),
  innerMembraneThickness: k(
    "L_inner",
    micronsToMetres(1.0),
    "m",
    ESTIMATE,
    "Permselective film over the platinum.",
  ),
  electrodeGeometricArea: k(
    "A_geo",
    m2(2.0e-7),
    "m2",
    ESTIMATE,
    "0.2 square millimetres of exposed platinum, a disc about 500 um across.",
  ),
  electrodeRoughness: k(
    "rho_r",
    fraction(12),
    "-",
    ESTIMATE,
    "Platinisation raises the electrochemically active area by roughly an order of magnitude.",
  ),
  fibreCoreArea: k(
    "A_fibre",
    m2(3.1e-8),
    "m2",
    ESTIMATE,
    "A 200 um core optical fibre. Sets how much of the gel the excitation actually reaches.",
  ),
} as const;

export const GEOM = values(GEOMETRY_TABLE);

// ---------------------------------------------------------------------------
// Partition coefficients
// ---------------------------------------------------------------------------
//
// A partition coefficient is how much of a species a material will dissolve
// relative to water at the same chemical potential. It matters as much as
// diffusivity: a membrane a species barely dissolves in excludes it just as
// effectively as one it barely moves through, and the outer membrane of the
// enzymatic probe uses both at once.

export const PARTITION_TABLE = {
  glucoseCapsule: k(
    "K_G,capsule",
    fraction(0.8),
    "-",
    ESTIMATE,
    "Fibrous capsule, mostly water with collagen taking up the rest.",
  ),
  oxygenCapsule: k(
    "K_O2,capsule",
    fraction(1.0),
    "-",
    ESTIMATE,
    "Oxygen dissolves in collagen about as well as in water.",
  ),
  interferentCapsule: k(
    "K_I,capsule",
    fraction(0.8),
    "-",
    ESTIMATE,
    "As glucose, for want of a reason to differ.",
  ),
  glucoseGel: k(
    "K_G,gel",
    fraction(0.9),
    "-",
    ESTIMATE,
    "Hydrogel of the optical probe, high water content by design.",
  ),
  glucoseFouling: k(
    "K_G,foul",
    fraction(0.5),
    "-",
    ESTIMATE,
    "Adsorbed protein film, denser than the capsule.",
  ),
  oxygenFouling: k(
    "K_O2,foul",
    fraction(0.9),
    "-",
    ESTIMATE,
    "Oxygen is less excluded by protein than glucose is.",
  ),
  glucoseOuterMembrane: k(
    "K_G,outer",
    fraction(0.15),
    "-",
    ESTIMATE,
    "Glucose is polar and the membrane is not, so most of it stays outside. Together with the diffusivity this is the two thousand fold oxygen advantage.",
  ),
  oxygenOuterMembrane: k(
    "K_O2,outer",
    fraction(1.0),
    "-",
    ESTIMATE,
    "Oxygen is small, uncharged and happy in a hydrophobic polymer.",
  ),
  peroxideOuterMembrane: k(
    "K_H2O2,outer",
    fraction(0.2),
    "-",
    ESTIMATE,
    "Polar, so largely excluded, which keeps the peroxide inside where it is wanted.",
  ),
  glucoseEnzymeLayer: k(
    "K_G,enz",
    fraction(0.9),
    "-",
    ESTIMATE,
    "Crosslinked protein gel, mostly water.",
  ),
  oxygenEnzymeLayer: k("K_O2,enz", fraction(1.0), "-", ESTIMATE, "As water."),
  peroxideEnzymeLayer: k("K_H2O2,enz", fraction(0.95), "-", ESTIMATE, "As water."),
  peroxideInnerMembrane: k(
    "K_H2O2,inner",
    fraction(0.6),
    "-",
    ESTIMATE,
    "Small and neutral, so the permselective film lets it through.",
  ),
  interferentInnerMembrane: k(
    "K_I,inner",
    fraction(0.02),
    "-",
    ESTIMATE,
    "Before the explicit rejection factors. Charge and size exclusion together.",
  ),
  glucoseInnerMembrane: k(
    "K_G,inner",
    fraction(0.05),
    "-",
    ESTIMATE,
    "A sugar is not welcome in a permselective film.",
  ),
  oxygenInnerMembrane: k("K_O2,inner", fraction(0.8), "-", ESTIMATE, "Oxygen is, as usual."),
  peroxideCapsule: k("K_H2O2,capsule", fraction(0.85), "-", ESTIMATE, "As water, near enough."),
  peroxideFouling: k("K_H2O2,foul", fraction(0.6), "-", ESTIMATE, "Protein takes up rather less."),
  interferentFouling: k("K_I,foul", fraction(0.5), "-", ESTIMATE, "As glucose through the same film."),
  interferentOuterMembrane: k(
    "K_I,outer",
    fraction(0.4),
    "-",
    ESTIMATE,
    "Nearly three times the glucose figure. Hydrophobic membranes dissolve neutral aromatics readily, and that is the whole of the paracetamol problem.",
  ),
  interferentEnzymeLayer: k("K_I,enz", fraction(0.9), "-", ESTIMATE, "As water."),
  gluconateOuterMembrane: k(
    "K_gluc,outer",
    fraction(0.05),
    "-",
    ESTIMATE,
    "Gluconate is anionic at pH 7.4, so the membrane excludes it even more firmly than the glucose it came from. That is why the acid builds up inside.",
  ),
} as const;

export const PART = values(PARTITION_TABLE);

// ---------------------------------------------------------------------------
// Optical probe: binding
// ---------------------------------------------------------------------------

export const BINDING_TABLE = {
  kdGlucose: k(
    "Kd_G",
    molPerM3(10),
    "mol/m3",
    ESTIMATE,
    "Tuned so the steep part of the isotherm covers 3 to 15 mmol/L, which is where the clinical decisions are.",
  ),
  kdFructose: k(
    "Kd_F",
    molPerM3(1),
    "mol/m3",
    "Arylboronic acid affinity order for monosaccharides, standard carbohydrate chemistry",
    "Fructose binds about ten times tighter than glucose. It is also two hundred times rarer.",
  ),
  kdPolyol: k(
    "Kd_M",
    molPerM3(3),
    "mol/m3",
    "Arylboronic acid affinity for acyclic polyols, standard carbohydrate chemistry",
    "Mannitol and sorbitol share this. It is why a mannitol infusion fools this probe.",
  ),
  boronPka: k(
    "pKa_B",
    6.8,
    "-",
    "ortho-aminomethyl arylboronic acid systems, standard boronic acid chemistry",
    "Below this pH the neutral trigonal boron dominates and affinity falls.",
  ),
  bindingEnthalpy: k(
    "dH",
    jPerMol(-20000),
    "J/mol",
    "Typical boronate ester formation enthalpy, standard thermochemistry",
    "Negative, so binding weakens as temperature rises. Drives the van 't Hoff correction.",
  ),
  kOn: k(
    "k_on",
    m3PerMolPerS(1.0),
    "m3/(mol s)",
    "Boronate ester formation, standard range for arylboronic acids",
    "1e3 per molar per second. Fast enough that local equilibrium in the gel is legitimate, which a test proves.",
  ),
  referencePh: k("pH_ref", 7.4, "-", "Definition", "The pH at which Kd_G is quoted."),
  referenceTemperature: k(
    "T_ref",
    K(310.15),
    "K",
    "Definition",
    "The temperature at which Kd_G is quoted.",
  ),
} as const;

export const BIND = values(BINDING_TABLE);

// ---------------------------------------------------------------------------
// Optical probe: photophysics
// ---------------------------------------------------------------------------

export const PHOTOPHYSICS_TABLE = {
  kRadiative: k(
    "k_r",
    perSecond(1.0e8),
    "1/s",
    "Typical singlet radiative rate for a visible fluorophore, standard photophysics",
    "A radiative lifetime of about 10 nanoseconds.",
  ),
  kNonRadiative: k(
    "k_nr",
    perSecond(5.0e7),
    "1/s",
    "Typical non-radiative decay for a rigid visible fluorophore, standard photophysics",
    "Internal conversion and intersystem crossing together.",
  ),
  kPet: k(
    "k_PET",
    perSecond(8.0e8),
    "1/s",
    "Photoinduced electron transfer quenching in amine-substituted fluorophores, standard photophysics",
    "Active only while the nitrogen lone pair is free, so only while the receptor is unbound. This is the switch.",
  ),
  bleachQuantumYield: k(
    "Phi_b",
    fraction(1.0e-6),
    "-",
    ESTIMATE,
    "Probability that an excitation destroys the molecule. A million excitations per molecule before it dies.",
  ),
  absorptionCrossSection: k(
    "sigma_abs",
    crossSection(1.0e-20),
    "m2",
    "Molar absorptivity of order 25000 per molar per centimetre, converted",
    "Per molecule, at the 375 nm excitation.",
  ),
  excitationWavelength: k(
    "lambda_ex",
    m(375e-9),
    "m",
    ESTIMATE,
    "Violet excitation, chosen to sit off both emissions.",
  ),
  indicatorEmission: k(
    "lambda_em",
    m(430e-9),
    "m",
    ESTIMATE,
    "Blue indicator emission, glucose dependent.",
  ),
  referenceEmission: k(
    "lambda_ref",
    m(520e-9),
    "m",
    ESTIMATE,
    "Teal reference emission, glucose independent.",
  ),
  pulseIrradiance: k(
    "Phi_photon",
    2.0e22,
    "photon/(m2 s)",
    ESTIMATE,
    "Photon flux at the gel during a flash. About 10 microwatts over the fibre core.",
  ),
  pulseDuration: k(
    "t_pulse",
    s(2.0e-3),
    "s",
    ESTIMATE,
    "Two milliseconds of light per acquisition.",
  ),
  dyeSurfaceDensity: k(
    "N_dye0",
    2.5e15,
    "1/m2",
    ESTIMATE,
    "Indicator molecules per square metre of illuminated gel, when new.",
  ),
  referenceDyeDensity: k(
    "N_ref0",
    1.2e15,
    "1/m2",
    ESTIMATE,
    "Reference dye, fewer molecules and no glucose response.",
  ),
  referenceQuantumYield: k(
    "Phi_f,ref",
    fraction(0.42),
    "-",
    ESTIMATE,
    "Constant by construction. The reference exists so that everything common to both channels divides out.",
  ),
  collectionEfficiency: k(
    "eta_coll",
    fraction(0.012),
    "-",
    ESTIMATE,
    "Fraction of emitted photons the collection fibre captures. Geometry, not a fudge factor.",
  ),
  filterTransmission: k(
    "eta_filt",
    fraction(0.85),
    "-",
    ESTIMATE,
    "Emission filter transmission in band.",
  ),
  detectorQuantumEfficiency: k(
    "QE",
    fraction(0.65),
    "-",
    "Silicon photodiode quantum efficiency in the blue to green, standard detector data",
    "Photons converted to counted electrons.",
  ),
  darkCounts: k("N_dark", 40, "count", ESTIMATE, "Detector dark counts per acquisition window."),
  amplifierNoiseCounts: k(
    "sigma_amp",
    25,
    "count",
    ESTIMATE,
    "Read noise, one standard deviation, added after the Poisson draw.",
  ),
} as const;

export const PHOTO = values(PHOTOPHYSICS_TABLE);

// ---------------------------------------------------------------------------
// Enzymatic probe: enzyme kinetics
// ---------------------------------------------------------------------------

export const ENZYME_TABLE = {
  kCat: k(
    "k_cat",
    perSecond(600),
    "1/s",
    "Glucose oxidase from Aspergillus niger at 37 C and pH 7, standard enzymology reference range",
    "Turnovers per second per enzyme molecule at saturation.",
  ),
  kmGlucose: k(
    "K_G",
    molPerM3(25),
    "mol/m3",
    "Glucose oxidase from Aspergillus niger, standard enzymology reference range",
    "25 mmol/L. Note this sits inside the clinical range, which is exactly why the outer membrane is needed.",
  ),
  kmOxygen: k(
    "K_O2",
    molPerM3(0.4),
    "mol/m3",
    "Glucose oxidase from Aspergillus niger, standard enzymology reference range",
    "0.4 mmol/L, and dissolved oxygen at 40 mmHg is only 0.055 mmol/L.",
  ),
  activationEnergy: k(
    "E_a",
    jPerMol(40000),
    "J/mol",
    "Typical enzyme catalysis activation energy, standard enzymology",
    "About a doubling of rate per ten degrees.",
  ),
  enzymeLoading: k(
    "E_0",
    molPerM3(0.35),
    "mol/m3",
    ESTIMATE,
    "Active enzyme concentration in the crosslinked layer. A named loading, not a scaling factor.",
  ),
  thermalInactivation: k(
    "k_therm",
    perSecond(2.0e-8),
    "1/s",
    ESTIMATE,
    "Slow loss of activity with no peroxide at all. About 400 days to one over e.",
  ),
  peroxideInactivation: k(
    "k_inact",
    m3PerMolPerS(2.5e-4),
    "m3/(mol s)",
    ESTIMATE,
    "Peroxide attacks the enzyme that made it. This is why a probe held at high glucose ages faster.",
  ),
  mutarotation: k(
    "k_mut",
    perSecond(0.01),
    "1/s",
    "Glucose mutarotation in water at 37 C and neutral pH, standard carbohydrate chemistry",
    "Alpha to beta interconversion. Only the beta anomer is a substrate.",
  ),
  betaFractionEquilibrium: k(
    "f_beta,eq",
    fraction(0.64),
    "-",
    "Anomeric equilibrium of D-glucose in water, standard carbohydrate chemistry",
    "64 per cent beta at equilibrium.",
  ),
  lactoneHalfLife: k(
    "t_half,lactone",
    s(420),
    "s",
    "D-glucono-1,5-lactone hydrolysis at neutral pH, standard carbohydrate chemistry",
    "Seven minutes. Slow enough that the lactone accumulates locally and acidifies the layer.",
  ),
  bufferCapacity: k(
    "beta_buf",
    molPerM3(30),
    "mol/(m3 pH)",
    "Bicarbonate and protein buffering of interstitial fluid, physiology reference range",
    "How much acid the enzyme layer absorbs per unit of pH. Sets how far the gluconic acid moves the local pH.",
  ),
} as const;

export const ENZ = values(ENZYME_TABLE);

// ---------------------------------------------------------------------------
// Enzymatic probe: electrode and membranes
// ---------------------------------------------------------------------------

export const ELECTRODE_TABLE = {
  electronsPerPeroxide: k(
    "n",
    2,
    "-",
    "Stoichiometry of peroxide oxidation",
    "H2O2 gives O2 plus two protons plus two electrons.",
  ),
  workingPotential: k(
    "E_w",
    V(0.6),
    "V",
    "Standard operating potential for peroxide detection at platinum",
    "Versus silver, silver chloride. High enough to oxidise peroxide, and unfortunately also paracetamol and ascorbate.",
  ),
  referenceStandardPotential: k(
    "E0_AgCl",
    V(0.222),
    "V",
    "Silver, silver chloride standard electrode potential, standard electrochemistry tables",
    "Versus the standard hydrogen electrode.",
  ),
  peroxideRateConstant: k(
    "k_e",
    permeabilityMs(6.0e-5),
    "m/s",
    ESTIMATE,
    "Heterogeneous rate constant for peroxide oxidation at the working potential. Fast enough to be diffusion limited.",
  ),
  potentialSensitivity: k(
    "beta_E",
    1.0 / 0.05,
    "1/V",
    ESTIMATE,
    "How sharply the peroxide oxidation efficiency falls as the working potential drifts down. A Tafel-like slope.",
  ),
  chlorideCapacity: k(
    "Q_Cl",
    mol(3.0e-7),
    "mol",
    ESTIMATE,
    "Silver chloride available at the reference. When it is consumed the reference potential runs away.",
  ),
  rejectionAscorbate: k(
    "r_asc",
    fraction(0.995),
    "-",
    "Charge exclusion of anions by a sulfonated perfluoropolymer film, standard membrane electrochemistry",
    "Ascorbate is anionic at pH 7.4, so a negatively charged film rejects it strongly.",
  ),
  rejectionParacetamol: k(
    "r_par",
    fraction(0.9),
    "-",
    ESTIMATE,
    "Paracetamol is neutral, so charge exclusion does much less. This is the leak that fools the probe.",
  ),
  interferentPermeability: k(
    "P_I",
    permeabilityMs(1.0e-5),
    "m/s",
    ESTIMATE,
    "Transport of an interferent to the electrode before rejection is applied.",
  ),
  electronsPerParacetamol: k(
    "n_par",
    2,
    "-",
    "Paracetamol oxidation to the quinone imine",
    "Two electrons.",
  ),
  standardChloride: k(
    "a_Cl,std",
    molPerM3(1000),
    "mol/m3",
    "Definition, the one molar standard state",
    "The activity the silver chloride standard potential is quoted against.",
  ),
  oxygenPerPeroxide: k(
    "n_O2",
    1,
    "-",
    "Stoichiometry of peroxide oxidation",
    "H2O2 gives back one O2 for each one the enzyme consumed. The electrode is an oxygen source, which is why oxygen limitation is milder than a supply calculation alone suggests.",
  ),
  electronsPerAscorbate: k(
    "n_asc",
    2,
    "-",
    "Ascorbate oxidation to dehydroascorbate",
    "Two electrons.",
  ),
  paracetamolAbsorption: k(
    "k_a,par",
    perSecond(5.5e-4),
    "1/s",
    "Oral paracetamol absorption, standard pharmacokinetics",
    "Gives a peak at about 45 minutes with the elimination rate below.",
  ),
  paracetamolElimination: k(
    "k_e,par",
    perSecond(6.4e-5),
    "1/s",
    "Paracetamol elimination, standard pharmacokinetics",
    "A three hour half-life.",
  ),
  paracetamolPeak: k(
    "C_par,peak",
    molPerM3(0.1),
    "mol/m3",
    "Peak plasma concentration after a one gram oral dose, standard pharmacokinetics",
    "0.1 mmol/L.",
  ),
} as const;

export const ELEC = values(ELECTRODE_TABLE);

// ---------------------------------------------------------------------------
// Randles equivalent circuit
// ---------------------------------------------------------------------------

export const IMPEDANCE_TABLE = {
  solutionResistance: k(
    "R_s",
    ohm(180),
    "ohm",
    ESTIMATE,
    "Electrolyte and lead resistance of a clean probe.",
  ),
  chargeTransferResistance: k(
    "R_ct",
    ohm(2400),
    "ohm",
    ESTIMATE,
    "Charge transfer at the platinum. A membrane breach lowers it by exposing more area.",
  ),
  doubleLayerCapacitance: k(
    "C_dl",
    farad(3.0e-7),
    "F",
    ESTIMATE,
    "Double layer at a platinised electrode of this area.",
  ),
  warburgCoefficient: k(
    "sigma_W",
    900,
    "ohm s^-0.5",
    ESTIMATE,
    "Semi-infinite diffusion element. Fouling and capsule both raise it.",
  ),
  foulingResistanceFactor: k(
    "alpha_foul",
    fraction(3.0),
    "-",
    ESTIMATE,
    "Solution resistance multiplier at fouling fraction 1.",
  ),
  capsuleResistancePerMetre: k(
    "alpha_cap",
    4.0e3,
    "1/m",
    ESTIMATE,
    "Extra solution resistance per metre of capsule, as a fractional rise.",
  ),
  openCircuitResistance: k(
    "R_open",
    ohm(1.0e9),
    "ohm",
    "Definition",
    "What a fractured lead reads.",
  ),
  probeFrequency: k(
    "f_probe",
    1000,
    "Hz",
    "Definition, matching the bench's impedance sweep",
    "The single frequency the bench's health check reads. The model computes the whole spectrum; this is the point on it the instrument reports.",
  ),
} as const;

export const IMP = values(IMPEDANCE_TABLE);

// ---------------------------------------------------------------------------
// Solver settings
// ---------------------------------------------------------------------------

export const SOLVER_TABLE = {
  nodesPerLayer: k(
    "N_node",
    24,
    "-",
    "Definition",
    "At least 20, as the build brief requires. Grid independence is tested.",
  ),
  maxReactionSubsteps: k(
    "N_sub,max",
    4000,
    "-",
    ESTIMATE,
    "Ceiling on adaptive substepping inside one bench tick.",
  ),
  reactionTolerance: k(
    "eps_rxn",
    1.0e-4,
    "-",
    ESTIMATE,
    "Relative change per reaction substep that triggers a smaller substep.",
  ),
  massBalanceTolerance: k(
    "eps_mass",
    1.0e-9,
    "-",
    "Build brief requirement",
    "Mass balance closure checked every step in tests.",
  ),
  minLayerThickness: k(
    "h_min",
    m(1.0e-9),
    "m",
    "Definition",
    "A layer that is currently absent, such as fouling on a clean probe, is kept in the stack at this thickness so the grid stays the same shape. Its transport resistance is then seven orders below the layers that matter, which a test checks.",
  ),
  activityFloor: k(
    "a_min",
    fraction(1.0e-6),
    "-",
    "Definition",
    "A Nernst potential is a logarithm, so an activity is clamped above zero. A reference this far gone has already run away; the clamp only stops the arithmetic, not the failure.",
  ),
  geometryRebuildTolerance: k(
    "eps_geom",
    fraction(0.02),
    "-",
    ESTIMATE,
    "Relative change in a layer thickness that triggers a grid rebuild and a remap of the field.",
  ),
  floorConcentration: k(
    "C_floor",
    molPerM3(0),
    "mol/m3",
    "Definition",
    "Concentrations are clamped at zero. A negative concentration is a solver bug, and the tests check for it.",
  ),
} as const;

export const SOLVER = values(SOLVER_TABLE);

// ---------------------------------------------------------------------------
// The registry, for the Probe Lab's `est` markers and MODEL-PROBES.md
// ---------------------------------------------------------------------------

export const ALL_TABLES = {
  Fundamental: FUNDAMENTAL_TABLE,
  Environment: ENVIRONMENT_TABLE,
  Diffusivity: DIFFUSIVITY_TABLE,
  Geometry: GEOMETRY_TABLE,
  "Partition coefficients": PARTITION_TABLE,
  "Optical binding": BINDING_TABLE,
  "Optical photophysics": PHOTOPHYSICS_TABLE,
  "Enzyme kinetics": ENZYME_TABLE,
  "Electrode and membranes": ELECTRODE_TABLE,
  Impedance: IMPEDANCE_TABLE,
  Solver: SOLVER_TABLE,
} as const;

export type RegistryRow = ConstantEntry<unknown> & {
  group: string;
  name: string;
  isEstimate: boolean;
};

/** Every constant, flattened, for documentation and for the `est` markers. */
export function constantRegistry(): RegistryRow[] {
  const rows: RegistryRow[] = [];
  for (const [group, table] of Object.entries(ALL_TABLES)) {
    for (const [name, entry] of Object.entries(table as Table)) {
      rows.push({ ...entry, group, name, isEstimate: entry.provenance === ESTIMATE });
    }
  }
  return rows;
}

/** True when this constant is an engineering estimate rather than sourced. */
export function isEstimate(group: keyof typeof ALL_TABLES, name: string): boolean {
  const table = ALL_TABLES[group] as Table;
  return table[name]?.provenance === ESTIMATE;
}

// Re-exported so nothing else has to import both this file and units.ts for a
// type it only uses to describe a constant.
export type {
  Count,
  CrossSectionM2,
  DiffusivityM2PerS,
  Fraction,
  JoulesPerMole,
  Kelvin,
  M3PerMolPerS,
  Metres,
  MolPerCubicMetre,
  Ohms,
  PerSecond,
  PermeabilityMPerS,
  Seconds,
  SquareMetres,
  Volts,
};
export { A, m, m2, mol, molPerM3, s, V };
