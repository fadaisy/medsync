import type { InvestigationSet, SuggestedInvestigation } from "./types";

/**
 * Suggestion engine (pure). Derives suggested investigations from the presenting
 * complaint(s) by reading the CSO-signed, cited investigation-set catalog. It
 * MERGES the sets for the active PCs, de-duplicates by test (keeping every "why"
 * and the SAFER classification — once must-not-miss / core, always so), and RANKS
 * must-not-miss first (surfaced even at low probability — bias to over-safety),
 * then core before context. Decision-support only: it suggests; the clinician
 * accepts. Nothing is recorded here. No doses (agents/investigations only).
 */
export function suggestInvestigations(
  pcCodes: string[],
  catalog: InvestigationSet[],
): SuggestedInvestigation[] {
  const active = new Set(pcCodes);
  const byTest = new Map<string, SuggestedInvestigation>();

  for (const set of catalog) {
    if (!active.has(set.pcCode)) continue;
    for (const t of set.tests) {
      const key = t.test.toLowerCase().trim();
      const existing = byTest.get(key);
      if (existing) {
        if (!existing.why.includes(set.presentation)) existing.why.push(set.presentation);
        // keep the safer classification across duplicate sources
        existing.mustNotMiss = existing.mustNotMiss || t.mustNotMiss;
        if (t.ugandaTier === "core") existing.ugandaTier = "core";
      } else {
        byTest.set(key, { ...t, why: [set.presentation] });
      }
    }
  }

  const rank = (s: SuggestedInvestigation) =>
    (s.mustNotMiss ? 0 : 2) + (s.ugandaTier === "core" ? 0 : 1);
  return [...byTest.values()].sort((a, b) => rank(a) - rank(b));
}
