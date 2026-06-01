/**
 * Versioned clinical vitals reference data — types.
 *
 * Pure, data-only, client-safe (no server-only imports). Encodes the
 * CSO Vitals-Interpretation Catalog as DATA, not logic, so thresholds
 * update without code changes and carry provenance. Every numeric leaf
 * traces to the catalog verbatim; nothing here is invented.
 *
 * See docs/triage-catalog-build-specs.md (the CSO-signed mapping).
 */

/** Where a number comes from — for the audit trail. */
export interface Provenance {
  source: string;
  version: string;
}

export interface CatalogMeta {
  catalogVersion: string;
  ratifiedOn: string;
  ratifiedBy: string;
}

/** A paediatric age band — catalog Part C. */
export interface PaedBand {
  label: string;
  /** Inclusive lower / exclusive upper, in years (fractions for <1y). */
  minAgeYears: number;
  maxAgeYearsExclusive: number;
  heartRate: { min: number; max: number };
  respRate: { min: number; max: number };
  /** Awake-normal systolic range (informational). */
  systolicNormal: { min: number; max: number };
  /**
   * Decompensated-shock red line. `flat` = a fixed SBP below which =
   * shock; `formula` = 70 + 2×ageYears (catalog, applies 1–10y).
   */
  hypotension:
    | { kind: "flat"; sbpLt: number }
    | { kind: "formula"; appliesAgeYears: [number, number] };
}

/** Obstetric MEOWS thresholds — catalog Part D. */
export interface ObstetricRef {
  systolic: { htnGte: number; severeGte: number };
  diastolic: { htnGte: number; severeGte: number };
  tempSepsisGte: number;
  spo2ConcernLt: number;
  /** Modified Shock Index (HR/MAP) haemorrhage flag. */
  msiHaemorrhageGt: number;
}
