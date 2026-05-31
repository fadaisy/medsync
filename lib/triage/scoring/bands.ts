import type { ScoreBand } from "../constants";

/**
 * Pure band lookup: return the points for the single band that contains
 * `value`. Bands use inclusive [min, max] with null = unbounded. The
 * constant tables are authored mutually-exclusive + exhaustive over the
 * plausible clinical domain, so exactly one band matches; if somehow
 * none does (an implausible value), we return null so the caller treats
 * it as unscoreable rather than silently 0.
 *
 * Deterministic + side-effect-free.
 */
export function scoreBand(value: number, bands: ScoreBand[]): number | null {
  for (const b of bands) {
    const aboveMin = b.min === null || value >= b.min;
    const belowMax = b.max === null || value <= b.max;
    if (aboveMin && belowMax) return b.points;
  }
  return null;
}
