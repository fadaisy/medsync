import type { CatalogMeta, ObstetricRef, PaedBand, Provenance } from "./types";

/**
 * The CSO Vitals-Interpretation Catalog, encoded verbatim (data-only).
 *
 * EVERY number here is transcribed from the CSO-supplied catalog
 * (Parts C–D), cite-verified. No threshold is invented. If a value here
 * disagrees with the catalog, the catalog wins and this file is the bug.
 * Clinical-safety artifact — changes require CSO authorship.
 *
 * Sources: age-banded paediatric norms (Fleming et al. / PALS / APLS),
 * MEOWS (obstetric); see docs/triage-catalog-build-specs.md.
 */

export const CATALOG_META: CatalogMeta = {
  catalogVersion: "2026-05.1",
  ratifiedOn: "2026-06-01",
  ratifiedBy: "Clinical Safety Officer",
};

const PAED_SOURCE: Provenance = {
  source: "CSO Vitals-Interpretation Catalog Part C (Fleming/PALS/APLS age-banded norms)",
  version: CATALOG_META.catalogVersion,
};

const OBSTETRIC_SOURCE: Provenance = {
  source: "CSO Vitals-Interpretation Catalog Part D (MEOWS)",
  version: CATALOG_META.catalogVersion,
};

export const PAED_PROVENANCE = PAED_SOURCE;
export const OBSTETRIC_PROVENANCE = OBSTETRIC_SOURCE;

/**
 * Paediatric age bands (catalog Part C, verbatim).
 *
 * NOTE the <1y split: the engine's only age source floors to integer
 * years, so an unknown-month infant arrives as ageYears = 0. To avoid
 * UNDER-triage (newborn ranges are wider + hypotension line <60 vs the
 * infant <70), resolvePaedBand maps ageYears = 0 to the INFANT band; the
 * newborn band only applies when an explicit age < 1 month is supplied.
 */
export const CSO_PAED_BANDS: PaedBand[] = [
  {
    label: "Newborn (0–1mo)",
    minAgeYears: 0,
    maxAgeYearsExclusive: 1 / 12,
    heartRate: { min: 100, max: 180 },
    respRate: { min: 30, max: 60 },
    systolicNormal: { min: 60, max: 90 },
    hypotension: { kind: "flat", sbpLt: 60 },
  },
  {
    label: "Infant (1–12mo)",
    minAgeYears: 1 / 12,
    maxAgeYearsExclusive: 1,
    heartRate: { min: 100, max: 160 },
    respRate: { min: 24, max: 40 },
    systolicNormal: { min: 70, max: 100 },
    hypotension: { kind: "flat", sbpLt: 70 },
  },
  {
    label: "Toddler (1–2y)",
    minAgeYears: 1,
    maxAgeYearsExclusive: 3,
    heartRate: { min: 90, max: 150 },
    respRate: { min: 24, max: 40 },
    systolicNormal: { min: 80, max: 105 },
    hypotension: { kind: "formula", appliesAgeYears: [1, 10] },
  },
  {
    label: "Preschool (3–5y)",
    minAgeYears: 3,
    maxAgeYearsExclusive: 6,
    heartRate: { min: 80, max: 140 },
    respRate: { min: 22, max: 34 },
    systolicNormal: { min: 80, max: 110 },
    hypotension: { kind: "formula", appliesAgeYears: [1, 10] },
  },
  {
    label: "School age (6–12y)",
    minAgeYears: 6,
    maxAgeYearsExclusive: 13,
    heartRate: { min: 70, max: 120 },
    respRate: { min: 18, max: 30 },
    systolicNormal: { min: 85, max: 115 },
    hypotension: { kind: "formula", appliesAgeYears: [1, 10] },
  },
  {
    label: "Adolescent (13–<16y)",
    minAgeYears: 13,
    maxAgeYearsExclusive: 16,
    heartRate: { min: 60, max: 100 },
    respRate: { min: 12, max: 20 },
    systolicNormal: { min: 90, max: 120 },
    hypotension: { kind: "flat", sbpLt: 90 },
  },
];

/** Paediatric SpO₂ / temp / glucose red lines (catalog Part C, verbatim). */
export const PAED_THRESHOLDS = {
  spo2NormalGte: 96,
  spo2SignificantLt: 92,
  spo2MildLt: 96, // 92–95 mild/monitor
  feverGte: 38.0,
  /** An infant under this age + fever = red flag (sepsis until excluded). */
  infantFeverAgeMonthsLt: 3,
  hypothermiaLte: 36,
  glucoseImmediateLt: 2.6,
} as const;

/** Obstetric MEOWS thresholds (catalog Part D, verbatim). */
export const OBSTETRIC_REF: ObstetricRef = {
  systolic: { htnGte: 140, severeGte: 160 },
  diastolic: { htnGte: 90, severeGte: 110 },
  tempSepsisGte: 38.0,
  spo2ConcernLt: 95,
  msiHaemorrhageGt: 1.7,
};

/**
 * ADULT clinical BP classification (BP & Temperature Reference §1b).
 *
 * THIS IS SEPARATE FROM the NEWS2 score. NEWS2 scores systolic 111–219
 * as 0 points — but 180 systolic is severe hypertension, NOT normal.
 * The engine computes the NEWS2 score for the aggregate AND classifies
 * the actual value clinically for display; a NEWS2-0 high BP must never
 * read "normal". Hypertensive emergencies are caught by the red-flag
 * layer (engine Step 3), which the physiological score is blind to.
 */
export const ADULT_BP_CLINICAL = {
  hypotensionSysLte: 90,
  normalSys: { min: 110, max: 120 },
  normalDia: { min: 70, max: 80 },
  elevatedSysGte: 121, // 121–139 elevated / high-normal
  elevatedDiaGte: 81, // 81–89
  htnSysGte: 140, // 140–179 stage 1–2 hypertension
  htnDiaGte: 90, // 90–109
  severeSysGte: 180, // ≥180 severe hypertension
  severeDiaGte: 110, // ≥110
} as const;

/**
 * ADULT clinical temperature classification (BP & Temperature Reference
 * §4b). Temperature's NEWS2 banding is more clinically aligned than BP,
 * but the clinical fever threshold is 38.0 and hyperpyrexia (≥41) is a
 * red-flag the score under-weights.
 */
export const ADULT_TEMP_CLINICAL = {
  severeHypothermiaLte: 35.0,
  lowMax: 36.0, // 35.1–36.0 sub-normal
  normal: { min: 36.1, max: 37.5 }, // 37.5–38.0 borderline/low-grade
  feverGte: 38.0,
  highFeverGte: 39.1,
  hyperpyrexiaGte: 41.0,
} as const;
