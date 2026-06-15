import type {
  NcdDefiningCriterion,
  NcdDiagnosisEntry,
} from "@/lib/clerkship/diagnosis/ncd-catalog";

import { ncdCatalog } from "@/lib/clerkship/diagnosis/ncd-catalog";

/**
 * NCD matching (decision-support) — surfaces NCD diagnoses whose supporting
 * features (existing symptom codes + condition/risk codes) are present in the
 * captured clerkship, ranked by support, with their cited defining criteria shown
 * so the clinician sees what is met vs not. Criteria INFORM the rank + display;
 * they never auto-diagnose. Support ranks, never asserts; must-not-miss surfaces
 * regardless of support. GATED: `ncdCatalog()` is empty until the CSO signs, so
 * `matchNcds` surfaces nothing in production until then.
 */

export interface NcdSuggestion {
  code: string;
  dx: string;
  icd10: string | null;
  mustNotMiss: boolean;
  /** Existing symptom codes from this clerkship that support the NCD. */
  matchedSymptoms: string[];
  /** Existing condition/risk codes from this clerkship that support the NCD. */
  matchedRiskFactors: string[];
  complications: string[];
  measuredSupports: string[];
  definingCriteria: NcdDefiningCriterion[];
  /** Support strength (matched supports) — drives rank, never certainty. */
  score: number;
}

export interface CapturedCodes {
  /** HPC + ROS-present symptom codes captured in this clerkship. */
  symptomCodes: Set<string>;
  /** PMH / background condition codes captured in this clerkship. */
  conditionCodes: Set<string>;
}

/** Pure: score one NCD entry's support against the captured code sets. */
export function scoreNcdMatch(
  entry: NcdDiagnosisEntry,
  captured: CapturedCodes,
): { matchedSymptoms: string[]; matchedRiskFactors: string[]; score: number } {
  const matchedSymptoms = entry.supportingSymptoms.filter((c) => captured.symptomCodes.has(c));
  const matchedRiskFactors = entry.riskFactors.filter((c) => captured.conditionCodes.has(c));
  return {
    matchedSymptoms,
    matchedRiskFactors,
    score: matchedSymptoms.length + matchedRiskFactors.length,
  };
}

/**
 * Rank the NCD catalog against the captured clerkship. Returns entries with ≥1
 * matched support OR flagged must-not-miss (surfaces regardless of support),
 * must-not-miss first, then by support score. GATED — empty until CSO sign-off.
 */
export function matchNcds(captured: CapturedCodes): NcdSuggestion[] {
  const out: NcdSuggestion[] = [];
  for (const entry of ncdCatalog()) {
    const { matchedSymptoms, matchedRiskFactors, score } = scoreNcdMatch(entry, captured);
    if (score === 0 && !entry.mustNotMiss) continue;
    out.push({
      code: entry.code,
      dx: entry.display,
      icd10: entry.icd10,
      mustNotMiss: entry.mustNotMiss,
      matchedSymptoms,
      matchedRiskFactors,
      complications: entry.complications,
      measuredSupports: entry.measuredSupports,
      definingCriteria: entry.definingCriteria,
      score,
    });
  }
  return out.sort(
    (a, b) =>
      Number(b.mustNotMiss) - Number(a.mustNotMiss) ||
      b.score - a.score ||
      a.dx.localeCompare(b.dx),
  );
}
