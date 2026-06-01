import type { TriageRuleset } from "../types";
import type { PaedBand } from "./types";

import { CSO_PAED_BANDS } from "./catalog";

export * from "./types";
export {
  CATALOG_META,
  CSO_PAED_BANDS,
  OBSTETRIC_REF,
  PAED_THRESHOLDS,
  PAED_PROVENANCE,
  OBSTETRIC_PROVENANCE,
} from "./catalog";

export type Population = "adult" | "paediatric" | "obstetric";

/** Map the engine's ruleset → the catalog's population. */
export function rulesetToPopulation(ruleset: TriageRuleset): Population {
  if (ruleset === "paediatric_pews") return "paediatric";
  if (ruleset === "obstetric_meows") return "obstetric";
  return "adult";
}

/**
 * Resolve the paediatric age band for a child (catalog Part C).
 *
 * SAFETY: the engine floors age to integer years, so an infant of
 * unknown month arrives as ageYears = 0. We map 0 → the INFANT band
 * (tighter ranges, hypotension line <70) rather than the wider newborn
 * band, to avoid under-triaging a real infant. The newborn band is only
 * selected when an explicit fractional age < 1 month is supplied.
 *
 * Returns null for ages ≥16y (those route to adult NEWS2, not paeds).
 */
export function resolvePaedBand(ageYears: number): PaedBand | null {
  // Integer 0 with no sub-year detail → conservative infant profile.
  if (ageYears === 0) {
    return CSO_PAED_BANDS.find((b) => b.label.startsWith("Infant")) ?? null;
  }
  for (const b of CSO_PAED_BANDS) {
    if (ageYears >= b.minAgeYears && ageYears < b.maxAgeYearsExclusive) return b;
  }
  return null;
}

/**
 * The decompensated-shock systolic limit for a child (catalog Part C).
 * Flat bands use their fixed value; formula bands use 70 + 2×age,
 * computed on EXACT age (never floored — flooring would lower the limit
 * and risk under-triage). Capped to the formula's stated 1–10y range.
 */
export function paedHypotensionLimit(ageYears: number): number | null {
  const band = resolvePaedBand(ageYears);
  if (!band) return null;
  if (band.hypotension.kind === "flat") return band.hypotension.sbpLt;
  // formula: 70 + 2×age (exact age in years)
  const [lo, hi] = band.hypotension.appliesAgeYears;
  const clamped = Math.min(Math.max(ageYears, lo), hi);
  return 70 + 2 * clamped;
}
