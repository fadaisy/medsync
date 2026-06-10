/**
 * Clinical Reasoning Engine — PURE. Merges the CSO-signed reasoning maps that
 * fire for the captured presenting complaint(s) into a single, ALWAYS-PLURAL
 * differential + the hypothesis-driven prompts. It is structurally incapable of
 * returning one answer, the must-not-miss is always surfaced, and it NEVER
 * concludes/auto-fills — every output is a suggestion the clinician leads.
 * Decision-support, not autonomous. See ADR 0065.
 */

import type {
  DifferentialItem,
  Likelihood,
  ReasoningMap,
  ReasoningResult,
} from "@/lib/clerkship/reasoning/types";

const SEVERITY: Record<Likelihood, number> = { must_not_miss: 2, likely: 1, less_likely: 0 };
const ORDER: Record<Likelihood, number> = { likely: 0, less_likely: 1, must_not_miss: 2 };

const uniq = (xs: string[]) => Array.from(new Set(xs.map((x) => x.trim()).filter(Boolean)));

/** The reflective diagnostic time-out (run at synthesis) — counters premature closure. */
export function diagnosticPausePrompts(): string[] {
  return [
    "What else could this be? (broaden the differential)",
    "What doesn't fit my leading thought?",
    "What must not be missed here — have I actively excluded it?",
    "Have I re-checked the red flags?",
    "Is this a new problem, or am I anchoring on a known diagnosis?",
  ];
}

/** Maps whose trigger codes intersect the captured presenting-complaint codes. */
export function mapsForCodes(maps: ReasoningMap[], pcCodes: string[]): ReasoningMap[] {
  const codes = new Set(pcCodes);
  return maps.filter((m) => m.triggerCodes.some((c) => codes.has(c)));
}

/**
 * Merge the fired maps into one plural reasoning result. Differential is deduped
 * by dx (keeping the MOST cautious likelihood — a dx flagged must-not-miss
 * anywhere stays must-not-miss). knownDiseaseTraps fire when a captured PMH
 * condition matches a candidate (the "is this different from usual?" safeguard).
 */
export function mergeReasoning(
  maps: ReasoningMap[],
  context: { pmhConditions?: string[] } = {},
): ReasoningResult {
  const byDx = new Map<string, DifferentialItem>();
  for (const m of maps) {
    for (const d of m.differential) {
      const key = d.dx.trim().toLowerCase();
      const prev = byDx.get(key);
      if (!prev) {
        byDx.set(key, { ...d, ruleIn: uniq(d.ruleIn ?? []), ruleOut: uniq(d.ruleOut ?? []) });
      } else {
        byDx.set(key, {
          dx: prev.dx,
          likelihood:
            SEVERITY[d.likelihood] > SEVERITY[prev.likelihood] ? d.likelihood : prev.likelihood,
          ruleIn: uniq([...(prev.ruleIn ?? []), ...(d.ruleIn ?? [])]),
          ruleOut: uniq([...(prev.ruleOut ?? []), ...(d.ruleOut ?? [])]),
        });
      }
    }
  }
  const differential = Array.from(byDx.values()).sort(
    (a, b) => ORDER[a.likelihood] - ORDER[b.likelihood] || a.dx.localeCompare(b.dx),
  );

  // Exacerbation-of-known-disease trap: a captured PMH condition that matches a
  // candidate → prompt to confirm this isn't anchoring on the known problem.
  const pmh = (context.pmhConditions ?? []).map((c) => c.trim().toLowerCase()).filter(Boolean);
  const knownDiseaseTraps = differential
    .filter((d) =>
      pmh.some((c) => c && (d.dx.toLowerCase().includes(c) || c.includes(d.dx.toLowerCase()))),
    )
    .map(
      (d) =>
        `Known ${d.dx}: is this presentation different from usual? Have you excluded a new cause?`,
    );

  return {
    basis: maps.map((m) => m.display),
    problemRepr: uniq(maps.map((m) => m.problemReprHint ?? "")),
    differential,
    discriminatingHpc: uniq(maps.flatMap((m) => m.discriminatingHpc)),
    associated: uniq(maps.flatMap((m) => m.associated)),
    redFlags: uniq(maps.flatMap((m) => m.redFlags)),
    examTargets: dedupeTargets(maps.flatMap((m) => m.examTargets)),
    historyEmphasis: uniq(maps.flatMap((m) => m.historyEmphasis)),
    combinations: maps.flatMap((m) => m.combinations),
    knownDiseaseTraps,
  };
}

function dedupeTargets(targets: ReasoningResult["examTargets"]): ReasoningResult["examTargets"] {
  const seen = new Set<string>();
  const out: ReasoningResult["examTargets"] = [];
  for (const t of targets) {
    const k = `${t.area}|${t.sign}`.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(t);
  }
  return out;
}

/** Convenience: reasoning for captured PC codes (empty result if nothing fires). */
export function reasoningForCodes(
  maps: ReasoningMap[],
  pcCodes: string[],
  context: { pmhConditions?: string[] } = {},
): ReasoningResult {
  return mergeReasoning(mapsForCodes(maps, pcCodes), context);
}
